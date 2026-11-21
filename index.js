/**
 * Host half of `dsh-plusvibe-balance`.
 *
 * It answers three questions the browser half cannot answer on its own, because
 * the PlusVibeAPI key must never reach the page:
 *
 *  - which configured provider routes point at PlusVibeAPI (so the pill appears
 *    only for a model whose route lives on that site),
 *  - the remaining prepaid balance and today's/month's spend for that route's
 *    own key (`GET /v1/balance`, `GET /api/key/usage`),
 *  - the per-day spend history for the chart (`GET /v1/generations`) and the
 *    per-model rates the browser half multiplies with the session's own token
 *    usage (`GET /v1/pricing`).
 *
 * Routes are registered on `webServer`, read the route's credential through the
 * `credentials` service, and cache upstream answers briefly so a hover, a
 * remount, or several open sessions cannot hammer the provider. Every request
 * passes the composition's own access check first (`ctx.connection.requestRejection`,
 * the same Host/Origin fence and browser-session authentication DSH applies to its
 * API routes); the plugin's `Sec-Fetch-Site` fence stays behind it as a second
 * layer, and a composition without the `connection` service keeps working with
 * that local fence alone. `refresh=1` on the balance or daily route skips the
 * cache — it is what the page's refresh button sends.
 */

/** Route table; each path is registered once per plugin instance. */
const ROUTES = {
  providers: '/plusvibe/providers',
  balance: '/plusvibe/balance',
  daily: '/plusvibe/daily',
  rates: '/plusvibe/rates',
}

/** Hosts whose providers count as PlusVibeAPI when discovered from configuration. */
const PLUSVIBE_HOSTS = ['plusvibeapi.ru', 'gw.plusvibeapi.ru']

/** Build marker echoed by `/plusvibe/providers` so a stale Host generation is visible. */
const BUILD = '2026-11-21.4'

const FETCH_TIMEOUT_MS = 20_000

/** History records per page; the provider's documented maximum. */
const PAGE_SIZE = 100

/** Pages fetched at once while walking a window the first time. */
const PAGE_CONCURRENCY = 4

/**
 * How far back a refresh re-reads the history it already counted.
 *
 * A record appears only once its request finishes, and a long stream can finish
 * well after it started, so its `created_at` can be older than the newest record
 * of the previous pass. Re-reading this much of the tail catches those.
 */
const DAILY_OVERLAP_MS = 60 * 60_000

/** Cap on the record ids remembered for that overlap; past it the series is rebuilt. */
const DAILY_OVERLAP_IDS = 5_000

const DEFAULTS = {
  days: 7,
  maxPages: 100,
  dashboardPath: '/dashboard',
}

/** Cache lifetimes per upstream call, in milliseconds. */
const TTL = {
  providers: 10_000,
  balance: 20_000,
  usage: 30_000,
  pricing: 30 * 60_000,
  daily: 60_000,
}

/**
 * Clamp one numeric configuration value.
 * @param value - raw configured value.
 * @param min - smallest accepted value.
 * @param max - largest accepted value.
 * @param fallback - value used when the input is not a finite number.
 * @returns the clamped integer.
 */
function clampInt(value, min, max, fallback) {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

/**
 * Read a finite number out of an upstream payload field.
 * @param value - raw field.
 * @returns the number, or undefined when the field carries none.
 */
function finiteNumber(value) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Describe a thrown value for a response body.
 *
 * A failed `fetch` says only "fetch failed" and hides the reason in `cause` —
 * the DNS name that did not resolve, the connection that was refused, the
 * timeout that fired. That reason is the whole message: without it the card
 * reports the same sentence for every possible fault, which is what made a
 * broken route indistinguishable from a wrong key.
 * @param error - anything thrown.
 * @returns a short human-readable message.
 */
function messageOf(error) {
  if (!(error instanceof Error)) return String(error)
  const cause = error.cause
  const detail = typeof cause === 'object' && cause !== null
    ? (typeof cause.code === 'string' ? cause.code : typeof cause.message === 'string' ? cause.message : undefined)
    : typeof cause === 'string'
      ? cause
      : undefined
  if (typeof detail !== 'string' || detail.length === 0 || error.message.includes(detail)) {
    return error.message
  }
  return `${error.message}: ${detail}`
}

/**
 * Read one host name from a base URL.
 * @param baseURL - provider base URL.
 * @returns the lower-case host, or undefined when the URL is unusable.
 */
function hostOf(baseURL) {
  try {
    return new URL(baseURL).host.toLowerCase()
  } catch {
    return undefined
  }
}

/**
 * Whether a base URL names a PlusVibeAPI endpoint.
 * @param baseURL - provider base URL.
 * @returns true for the documented hosts.
 */
function isPlusvibeHost(baseURL) {
  const host = hostOf(baseURL)
  return host !== undefined && PLUSVIBE_HOSTS.includes(host)
}

/**
 * Strip trailing slashes from a base URL.
 * @param baseURL - provider base URL.
 * @returns the API base without a trailing slash.
 */
function apiBase(baseURL) {
  return String(baseURL).replace(/\/+$/, '')
}

/**
 * Read the provider profiles declared by the live pi-ai loader entry.
 *
 * A provider route's endpoint is not published by `llm.listConfigurableProviders`
 * for hand-declared routes, so the loader configuration is the source of truth:
 * it is what the running adapter resolved, and it reflects an edited profile
 * without a restart of this plugin.
 * @param ctx - plugin context.
 * @returns provider id to `{ baseURL, apiKeyEnv, apiKey }` pairs.
 */
function configuredProfiles(ctx) {
  const profiles = new Map()
  const collect = (merged) => {
    const providers = merged?.providers
    if (providers === null || typeof providers !== 'object') return
    for (const [provider, profile] of Object.entries(providers)) {
      if (profile === null || typeof profile !== 'object') continue
      if (typeof profile.baseURL !== 'string' || profile.baseURL.length === 0) continue
      profiles.set(provider, {
        baseURL: profile.baseURL,
        apiKeyEnv: typeof profile.apiKeyEnv === 'string' ? profile.apiKeyEnv : undefined,
        apiKey: typeof profile.apiKey === 'string' ? profile.apiKey : undefined,
      })
    }
  }
  // The resolved entry config is the adapter's own view of its routes: it is
  // what the running plugin received, so it needs no patch-layer reasoning.
  let entries = []
  try {
    entries = ctx.get('configEditor')?.entries?.() ?? []
  } catch {
    entries = []
  }
  for (const entry of entries) {
    const name = entry?.options?.name
    if (typeof name !== 'string' || !name.includes('llm-pi-ai')) continue
    collect(entry?.options?.config)
  }
  if (profiles.size > 0) return profiles
  // Fallback for a composition without `configEditor`: read the composed layers.
  let rows = []
  try {
    rows = ctx.get('configEditor')?.configuration?.() ?? []
  } catch {
    return profiles
  }
  for (const row of rows) {
    const name = row?.entry?.options?.name
    if (typeof name !== 'string' || !name.includes('llm-pi-ai')) continue
    collect({ ...(row.inherited ?? {}), ...(row.override ?? {}) })
  }
  return profiles
}

/**
 * Resolve every provider route this plugin can report on.
 *
 * Explicit `config.sites` entries always count; a provider discovered from the
 * loader configuration counts only when its endpoint is a PlusVibeAPI host, so
 * unrelated providers never show a balance pill.
 * @param ctx - plugin context.
 * @param settings - resolved plugin settings.
 * @returns provider id to route facts.
 */
function resolveSites(ctx, settings) {
  const sites = new Map()
  const put = (provider, patch) => {
    if (typeof provider !== 'string' || provider.length === 0) return
    sites.set(provider, { ...(sites.get(provider) ?? { provider }), ...patch })
  }
  for (const [provider, profile] of configuredProfiles(ctx)) put(provider, profile)
  for (const item of settings.sites) {
    if (item === null || typeof item !== 'object') continue
    put(item.provider, {
      baseURL: typeof item.baseURL === 'string' ? item.baseURL : undefined,
      apiKeyEnv: typeof item.apiKeyEnv === 'string' ? item.apiKeyEnv : undefined,
      apiKey: typeof item.apiKey === 'string' ? item.apiKey : undefined,
      siteUrl: typeof item.siteUrl === 'string' ? item.siteUrl : undefined,
      explicit: true,
    })
  }
  for (const [provider, site] of [...sites]) {
    if (site.explicit === true) {
      if (typeof site.baseURL !== 'string') sites.delete(provider)
      continue
    }
    if (!isPlusvibeHost(site.baseURL)) sites.delete(provider)
  }
  return sites
}

/**
 * The site page a click on the pill opens.
 * @param site - resolved route facts.
 * @param settings - resolved plugin settings.
 * @returns an absolute URL, or undefined when the base URL cannot be parsed.
 */
function siteUrlOf(site, settings) {
  if (typeof site.siteUrl === 'string' && site.siteUrl.length > 0) return site.siteUrl
  try {
    return new URL(settings.dashboardPath, new URL(site.baseURL).origin).href
  } catch {
    return undefined
  }
}

/**
 * Resolve the credential a route's requests must carry.
 * @param ctx - plugin context.
 * @param site - resolved route facts.
 * @returns the secret, or undefined when nothing is configured.
 */
async function resolveKey(ctx, site) {
  if (typeof site.apiKey === 'string' && site.apiKey.length > 0) return site.apiKey
  if (typeof site.apiKeyEnv !== 'string' || site.apiKeyEnv.length === 0) return undefined
  const credentials = ctx.get('credentials')
  if (credentials === undefined) return undefined
  const resolved = await credentials.resolve(site.apiKeyEnv)
  const value = resolved?.value
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * Call one PlusVibeAPI endpoint with the route's key.
 * @param ctx - plugin context.
 * @param site - resolved route facts.
 * @param url - absolute request URL.
 * @returns the decoded JSON payload.
 * @throws Error naming the HTTP status when the provider refuses.
 */
async function callApi(ctx, site, url) {
  const key = await resolveKey(ctx, site)
  if (key === undefined) {
    throw new Error(`no API key is configured for provider "${site.provider}"`)
  }
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`PlusVibeAPI answered ${response.status} for ${new URL(url).pathname}`)
  }
  return await response.json()
}

/**
 * Read one cached value, coalescing concurrent loads.
 * @param cache - per-plugin cache map.
 * @param key - cache key.
 * @param ttlMs - how long a settled value stays fresh.
 * @param load - the upstream load.
 * @param force - ignore a settled value and reload (the page's refresh button).
 * @returns the value, cached or freshly loaded.
 */
async function cached(cache, key, ttlMs, load, force = false) {
  const hit = cache.get(key)
  const now = Date.now()
  if (!force && hit !== undefined && hit.value !== undefined && now - hit.at < ttlMs) return hit.value
  if (hit?.pending !== undefined) return await hit.pending
  const pending = load().then(
    (value) => {
      cache.set(key, { at: Date.now(), value })
      return value
    },
    (error) => {
      // Keep a stale value usable, but never keep the rejected promise: a later
      // read would return that rejection instead of trying upstream again.
      if (hit?.value === undefined) cache.delete(key)
      else cache.set(key, { at: hit.at, value: hit.value })
      throw error
    },
  )
  cache.set(key, { ...(hit ?? {}), pending })
  return await pending
}

/**
 * Whether a request came from this page.
 *
 * The real threat is a page on another site calling the loopback server, which
 * the browser marks with `Sec-Fetch-Site: cross-site` (or `same-site` for a
 * sibling origin). An `Origin` header, when present, must also name this host.
 * Requests with neither header (curl, a native client) are not a browser
 * cross-site request and are allowed.
 * @param req - the HTTP request.
 * @returns false only for a request another origin initiated.
 */
function sameOriginRequest(req) {
  const site = req.headers['sec-fetch-site']
  if (site === 'cross-site' || site === 'same-site') return false
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin.length > 0) {
    try {
      return new URL(origin).host === req.headers.host
    } catch {
      return false
    }
  }
  return true
}

/**
 * The composition's `connection` service, when it mounts one.
 *
 * `connection` is optional: a composition can serve Web routes without the
 * browser carrier that provides it. Reading it through `ctx.get` keeps the
 * routes working there instead of failing at load, and a service whose providing
 * fiber is not active reads as absent.
 * @param ctx - plugin context.
 * @returns the service, or undefined when this composition has none.
 */
function connectionOf(ctx) {
  if (typeof ctx?.get !== 'function') return undefined
  const service = ctx.get('connection')
  return service !== undefined && typeof service.requestRejection === 'function' ? service : undefined
}

/**
 * The status the composition's connection check refuses this request with.
 *
 * `requestRejection` is DSH's own fence for another Web route: its Host/Origin
 * checks defeat DNS rebinding and cross-site calls, and its browser
 * authentication requires the page's signed session cookie. A check that throws
 * is treated as a refusal — an exception is not permission.
 * @param ctx - plugin context.
 * @param req - the HTTP request.
 * @returns 401 or 403 when the request is refused, undefined when it may proceed.
 */
function connectionRejection(ctx, req) {
  const connection = connectionOf(ctx)
  if (connection === undefined) return undefined
  try {
    return connection.requestRejection(req)
  } catch {
    return 403
  }
}

/**
 * Write one JSON response.
 * @param res - the HTTP response.
 * @param status - status code.
 * @param payload - JSON-serializable body.
 */
function respond(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': String(Buffer.byteLength(body)),
  })
  res.end(body)
}

/**
 * Wrap a handler with the DSH access check, the local origin fence, and a failure body.
 *
 * The standard check decides: when the composition provides `connection`, its
 * `requestRejection` runs first and its 401/403 is the answer. The local fence
 * stays behind it as a second layer and is the only gate where the service is
 * absent.
 * @param ctx - plugin context; the connection service is read per request.
 * @param handler - async handler.
 * @returns a `(req, res)` route handler.
 */
function guarded(ctx, handler) {
  return (req, res) => {
    const rejection = connectionRejection(ctx, req)
    if (rejection !== undefined) {
      respond(res, rejection, {
        ok: false,
        error: rejection === 401
          ? 'request is not authenticated'
          : 'request rejected by the DSH connection check',
      })
      return
    }
    if (!sameOriginRequest(req)) {
      respond(res, 403, { ok: false, error: 'cross-origin request rejected' })
      return
    }
    Promise.resolve(handler(req, res)).catch((error) => {
      try {
        respond(res, 500, { ok: false, error: messageOf(error) })
      } catch {
        // Headers were already written; the socket owns the rest.
      }
    })
  }
}

/**
 * Read the query string of one request.
 * @param req - the HTTP request.
 * @returns parsed parameters.
 */
function queryOf(req) {
  try {
    return new URL(req.url ?? '/', 'http://127.0.0.1').searchParams
  } catch {
    return new URLSearchParams()
  }
}

/**
 * Start of the local calendar day `offset` days before the one holding `time`.
 *
 * Every boundary this plugin draws is a calendar day on the machine it runs on —
 * the user's own day, the same one the account page and the person reading the
 * chart mean. Day arithmetic goes through the calendar rather than through
 * 86 400 000 ms, because a daylight-saving change inside the window would
 * otherwise move the boundary by an hour and land on the wrong day.
 * @param time - epoch milliseconds.
 * @param offset - whole days to go back; 0 is the day containing `time`.
 * @returns epoch milliseconds of local midnight that many days earlier.
 */
function startOfLocalDay(time, offset = 0) {
  const date = new Date(time)
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - offset)
  return date.getTime()
}

/**
 * Local calendar day key of one instant, as `YYYY-MM-DD`.
 * @param value - ISO timestamp or epoch milliseconds.
 * @returns the day key, or undefined for an unusable value.
 */
function localDayKey(value) {
  const time = typeof value === 'number' ? value : Date.parse(String(value ?? ''))
  if (!Number.isFinite(time)) return undefined
  const date = new Date(time)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Build the route facts the browser half needs to decide whether to render.
 * @param ctx - plugin context.
 * @param settings - resolved plugin settings.
 * @returns the providers payload.
 */
function providersPayload(ctx, settings) {
  const providers = []
  for (const [provider, site] of resolveSites(ctx, settings)) {
    providers.push({ provider, siteUrl: siteUrlOf(site, settings) })
  }
  return { ok: true, build: BUILD, providers }
}

/**
 * Balance plus today's and this month's spend for one route.
 * @param ctx - plugin context.
 * @param settings - resolved plugin settings.
 * @param cache - per-plugin cache map.
 * @param provider - provider route id.
 * @param force - reload even while the cached answer is still fresh.
 * @returns the response payload.
 */
async function balancePayload(ctx, settings, cache, provider, force = false) {
  const site = resolveSites(ctx, settings).get(provider)
  if (site === undefined) return { ok: false, provider, error: `provider "${provider}" does not use PlusVibeAPI` }
  const siteUrl = siteUrlOf(site, settings)
  const base = apiBase(site.baseURL)
  const origin = (() => {
    try {
      return new URL(site.baseURL).origin
    } catch {
      return undefined
    }
  })()
  const [balance, usage] = await Promise.allSettled([
    cached(cache, `balance:${provider}`, TTL.balance, () => callApi(ctx, site, `${base}/balance`), force),
    origin === undefined
      ? Promise.reject(new Error('the provider base URL is not an absolute URL'))
      : cached(cache, `usage:${provider}`, TTL.usage, () => callApi(ctx, site, `${origin}/api/key/usage`), force),
  ])
  const errors = []
  let balanceRub
  let currency
  if (balance.status === 'fulfilled') {
    balanceRub = finiteNumber(balance.value?.balance_rub) ?? finiteNumber(balance.value?.balance)
    currency = typeof balance.value?.currency === 'string' ? balance.value.currency : undefined
  } else {
    errors.push(messageOf(balance.reason))
  }
  let spendTodayRub
  let spendMonthRub
  let requestsToday
  if (usage.status === 'fulfilled') {
    spendTodayRub = finiteNumber(usage.value?.spendTodayRub)
    spendMonthRub = finiteNumber(usage.value?.spendMonthRub)
    requestsToday = finiteNumber(usage.value?.requestsToday)
    if (balanceRub === undefined) balanceRub = finiteNumber(usage.value?.balanceRub)
    if (currency === undefined && typeof usage.value?.currency === 'string') currency = usage.value.currency
  } else {
    errors.push(messageOf(usage.reason))
  }
  if (balanceRub === undefined && spendTodayRub === undefined) {
    // Both calls usually fail the same way (the network is down), and echoing
    // that sentence twice helps nobody: the message names each cause once.
    const distinct = [...new Set(errors)]
    return { ok: false, provider, siteUrl, error: distinct.join('; ') || 'no answer from PlusVibeAPI', errors }
  }
  return {
    ok: true,
    provider,
    siteUrl,
    currency: currency ?? 'RUB',
    balanceRub,
    spendTodayRub,
    spendMonthRub,
    requestsToday,
    fetchedAt: Date.now(),
    errors,
  }
}

/**
 * Per-day spend for the chart.
 *
 * The provider pages its history newest-first and exposes no per-day aggregate,
 * so the window is walked record by record: one page is one request, pages are
 * fetched a few at a time, and the walk stops the moment it crosses the window
 * start. Its `total` field is not a record count for the query — it changes with
 * the page it is read from — so it never decides where the walk ends.
 *
 * A full walk is needed only once. The series is remembered together with the
 * newest record it counted, and the next refresh reads just what appeared above
 * that mark, a page or two. A pass that ran out of page budget leaves the rest of
 * the window to the next pass, which continues from the oldest record it reached.
 * `partial` reports a window that is not covered yet.
 * @param ctx - plugin context.
 * @param settings - resolved plugin settings.
 * @param cache - per-plugin cache map.
 * @param provider - provider route id.
 * @param force - reload even while the cached series is still fresh.
 * @returns the response payload.
 */
async function dailyPayload(ctx, settings, cache, provider, force = false) {
  const site = resolveSites(ctx, settings).get(provider)
  if (site === undefined) return { ok: false, provider, error: `provider "${provider}" does not use PlusVibeAPI` }
  const base = apiBase(site.baseURL)
  const days = settings.days
  const since = startOfLocalDay(Date.now(), days - 1)
  const sinceKey = localDayKey(since)
  const stateKey = `daily-state:${provider}:${days}`
  const load = async () => {
    const previous = cache.get(stateKey)?.value
    // A complete series is extended upwards; an incomplete one is continued
    // downwards from the oldest record the previous pass reached.
    const append = previous !== undefined && previous.complete === true
    const resume = previous !== undefined && previous.complete === false
    // Records above the previous pass's newest one are new. A long stream lands
    // with an older timestamp, so a short overlap is re-read and deduplicated.
    const boundary = append ? Math.max(since, previous.frontier - DAILY_OVERLAP_MS) : since
    const dateTo = resume ? new Date(previous.oldest).toISOString() : undefined
    // A resumed pass may only count what the previous one did not reach, even if
    // the provider answers with the whole window instead of the requested tail.
    const ceiling = resume ? previous.oldest : Infinity
    const buckets = append || resume ? previous.buckets : new Map()
    // The ids the previous pass already counted in the range this one re-reads.
    const counted = append ? previous.recentIds : resume ? previous.edgeIds : undefined
    const recentIds = append ? new Set() : resume ? previous.recentIds : new Set()
    let frontier = append || resume ? previous.frontier : 0
    let scanned = 0
    let oldest
    let stopped = false
    let overflow = false
    let edgeIds = new Set()
    let page = 1
    while (!stopped && page <= settings.maxPages) {
      const batch = []
      // Appending usually ends on the first page, so it is not worth a batch.
      const width = append ? 1 : PAGE_CONCURRENCY
      while (batch.length < width && page + batch.length <= settings.maxPages) {
        batch.push(page + batch.length)
      }
      const answers = await Promise.all(batch.map((number) => {
        const url = new URL(`${base}/generations`)
        url.searchParams.set('page', String(number))
        url.searchParams.set('limit', String(PAGE_SIZE))
        url.searchParams.set('dateFrom', new Date(since).toISOString())
        if (dateTo !== undefined) url.searchParams.set('dateTo', dateTo)
        return callApi(ctx, site, url.href)
      }))
      for (let index = 0; index < answers.length && !stopped; index += 1) {
        const records = Array.isArray(answers[index]?.data) ? answers[index].data : []
        const pageIds = new Set()
        for (const record of records) {
          const time = Date.parse(String(record?.created_at ?? ''))
          if (!Number.isFinite(time)) continue
          if (time > frontier) frontier = time
          if (time < boundary) {
            stopped = true
            continue
          }
          if (time < since || time > ceiling) continue
          const id = typeof record?.id === 'string' ? record.id : undefined
          if (id === undefined) continue
          pageIds.add(id)
          if (oldest === undefined || time < oldest) oldest = time
          if (time >= frontier - DAILY_OVERLAP_MS) {
            if (recentIds.size < DAILY_OVERLAP_IDS) recentIds.add(id)
            else overflow = true
          }
          // A record the previous pass already counted: its spend is in the
          // buckets, and counting it again would inflate the chart.
          if (counted?.has(id) === true) continue
          const dayKey = localDayKey(time)
          if (dayKey === undefined) continue
          const bucket = buckets.get(dayKey) ?? { rub: 0, requests: 0 }
          bucket.rub += finiteNumber(record?.cost_rub) ?? 0
          bucket.requests += 1
          buckets.set(dayKey, bucket)
        }
        scanned += records.length
        edgeIds = pageIds
        if (records.length < PAGE_SIZE) stopped = true
      }
      page += batch.length
    }
    // The walk covered the window when it crossed the window start or ran out of
    // records. An overflow means the dedupe set is unreliable, so the next pass
    // starts over rather than trusting this one.
    const complete = stopped && !overflow
    // Days that fell out of the window are dropped: the state lives as long as
    // the Host does, so a 30-day window would otherwise grow without a bound.
    for (const dayKey of [...buckets.keys()]) {
      if (dayKey < sinceKey) buckets.delete(dayKey)
    }
    cache.set(stateKey, {
      at: Date.now(),
      value: {
        buckets,
        complete,
        frontier,
        oldest: oldest ?? previous?.oldest ?? since,
        recentIds,
        edgeIds: stopped ? new Set() : edgeIds,
      },
    })
    const series = []
    const cursor = new Date(since)
    for (let index = 0; index < days; index += 1) {
      const dayKey = localDayKey(cursor.getTime())
      const bucket = buckets.get(dayKey) ?? { rub: 0, requests: 0 }
      series.push({ date: dayKey, rub: Math.round(bucket.rub * 10_000) / 10_000, requests: bucket.requests })
      cursor.setDate(cursor.getDate() + 1)
    }
    return { days: series, partial: !complete, scanned }
  }
  const result = await cached(cache, `daily:${provider}:${days}`, TTL.daily, load, force)
  return { ok: true, provider, ...result, fetchedAt: Date.now() }
}

/**
 * Rates per million tokens for one model route.
 *
 * The default variant is used: an unpinned request is routed by the gateway, and
 * the catalog marks the variant it routes to by default.
 * @param ctx - plugin context.
 * @param settings - resolved plugin settings.
 * @param cache - per-plugin cache map.
 * @param provider - provider route id.
 * @param model - model id as the session names it.
 * @returns the response payload.
 */
async function ratesPayload(ctx, settings, cache, provider, model) {
  const site = resolveSites(ctx, settings).get(provider)
  if (site === undefined) return { ok: false, provider, error: `provider "${provider}" does not use PlusVibeAPI` }
  const base = apiBase(site.baseURL)
  const catalog = await cached(cache, `pricing:${provider}`, TTL.pricing, () => callApi(ctx, site, `${base}/pricing`))
  const rows = Array.isArray(catalog?.data) ? catalog.data : []
  const bare = String(model).split(':')[0]
  const row = rows.find(entry => entry?.model === model)
    ?? rows.find(entry => entry?.model === bare)
    ?? rows.find(entry => Array.isArray(entry?.variants) && entry.variants.some(variant => String(variant?.addressAs ?? '').split(':')[0] === bare))
  const variants = Array.isArray(row?.variants) ? row.variants : []
  const variant = variants.find(item => item?.isDefault === true) ?? variants[0]
  if (variant === undefined) {
    return { ok: false, provider, model, error: `the price list has no rates for model "${model}"` }
  }
  return {
    ok: true,
    provider,
    model,
    variant: typeof variant.addressAs === 'string' ? variant.addressAs : undefined,
    currency: typeof catalog?.currency === 'string' ? catalog.currency : 'RUB',
    inputRub: finiteNumber(variant.inputRub),
    outputRub: finiteNumber(variant.outputRub),
    cacheReadRub: finiteNumber(variant.cacheReadRub),
    cacheWriteRub: finiteNumber(variant.cacheWriteRub),
  }
}

/**
 * Mount the four routes on the web server when the composition has one.
 * @param ctx - plugin context.
 * @param config - the loader row's config.
 */
export function apply(ctx, config) {
  const settings = {
    sites: Array.isArray(config?.sites) ? config.sites : [],
    days: clampInt(config?.dailyDays, 1, 30, DEFAULTS.days),
    maxPages: clampInt(config?.dailyMaxPages, 1, 200, DEFAULTS.maxPages),
    dashboardPath: typeof config?.dashboardPath === 'string' && config.dashboardPath.startsWith('/')
      ? config.dashboardPath
      : DEFAULTS.dashboardPath,
  }
  const cache = new Map()
  ctx.inject(['webServer'], (webCtx) => {
    const routes = [
      [ROUTES.providers, () => providersPayload(ctx, settings)],
      [ROUTES.balance, (req) => {
        const query = queryOf(req)
        return balancePayload(ctx, settings, cache, query.get('provider') ?? '', query.get('refresh') === '1')
      }],
      [ROUTES.daily, (req) => {
        const query = queryOf(req)
        return dailyPayload(ctx, settings, cache, query.get('provider') ?? '', query.get('refresh') === '1')
      }],
      [ROUTES.rates, (req) => {
        const query = queryOf(req)
        return ratesPayload(ctx, settings, cache, query.get('provider') ?? '', query.get('model') ?? '')
      }],
    ]
    for (const [path, run] of routes) {
      webCtx.effect(() => webCtx.webServer.register({
        kind: 'exact',
        path,
        handler: guarded(webCtx, async (req, res) => {
          respond(res, 200, await run(req))
        }),
      }), `plusvibe-balance: ${path}`)
    }
  })
}
