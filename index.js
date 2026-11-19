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
 * remount, or several open sessions cannot hammer the provider. Requests whose
 * `Sec-Fetch-Site` names another origin are refused: the page is same-origin, so
 * nothing legitimate needs the cross-origin path.
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
const BUILD = '2026-11-18.1'

const DAY_MS = 86_400_000
const FETCH_TIMEOUT_MS = 20_000

const DEFAULTS = {
  days: 7,
  maxPages: 40,
  dashboardPath: '/dashboard',
}

/** Cache lifetimes per upstream call, in milliseconds. */
const TTL = {
  providers: 10_000,
  balance: 20_000,
  usage: 30_000,
  pricing: 30 * 60_000,
  daily: 5 * 60_000,
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
 * @param error - anything thrown.
 * @returns a short human-readable message.
 */
function messageOf(error) {
  if (error instanceof Error) return error.message
  return String(error)
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
 * @returns the value, cached or freshly loaded.
 */
async function cached(cache, key, ttlMs, load) {
  const hit = cache.get(key)
  const now = Date.now()
  if (hit !== undefined && hit.value !== undefined && now - hit.at < ttlMs) return hit.value
  if (hit?.pending !== undefined) return await hit.pending
  const pending = load().then(
    (value) => {
      cache.set(key, { at: Date.now(), value })
      return value
    },
    (error) => {
      if (hit?.value === undefined) cache.delete(key)
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
 * Wrap a handler with the origin fence and a failure body.
 * @param handler - async handler.
 * @returns a `(req, res)` route handler.
 */
function guarded(handler) {
  return (req, res) => {
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
 * Start of the local calendar day containing one instant.
 * @param time - epoch milliseconds.
 * @returns epoch milliseconds of local midnight.
 */
function startOfLocalDay(time) {
  const date = new Date(time)
  date.setHours(0, 0, 0, 0)
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
 * @returns the response payload.
 */
async function balancePayload(ctx, settings, cache, provider) {
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
    cached(cache, `balance:${provider}`, TTL.balance, () => callApi(ctx, site, `${base}/balance`)),
    origin === undefined
      ? Promise.reject(new Error('the provider base URL is not an absolute URL'))
      : cached(cache, `usage:${provider}`, TTL.usage, () => callApi(ctx, site, `${origin}/api/key/usage`)),
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
    return { ok: false, provider, siteUrl, error: errors.join('; ') || 'no answer from PlusVibeAPI', errors }
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
 * Per-day spend for the chart, newest records first.
 *
 * The provider pages its history newest-first and exposes no aggregate, so the
 * scan stops as soon as the window is exhausted; `partial` reports a page cap
 * that was reached first, and `total` carries the provider's own record count
 * for the window.
 * @param ctx - plugin context.
 * @param settings - resolved plugin settings.
 * @param cache - per-plugin cache map.
 * @param provider - provider route id.
 * @returns the response payload.
 */
async function dailyPayload(ctx, settings, cache, provider) {
  const site = resolveSites(ctx, settings).get(provider)
  if (site === undefined) return { ok: false, provider, error: `provider "${provider}" does not use PlusVibeAPI` }
  const base = apiBase(site.baseURL)
  const days = settings.days
  const since = startOfLocalDay(Date.now() - (days - 1) * DAY_MS)
  const load = async () => {
    const buckets = new Map()
    let scanned = 0
    let total = 0
    let partial = false
    for (let page = 1; page <= settings.maxPages; page += 1) {
      const url = new URL(`${base}/generations`)
      url.searchParams.set('page', String(page))
      url.searchParams.set('limit', '100')
      url.searchParams.set('dateFrom', new Date(since).toISOString())
      const payload = await callApi(ctx, site, url.href)
      const records = Array.isArray(payload?.data) ? payload.data : []
      const reported = finiteNumber(payload?.total)
      if (reported !== undefined) total = reported
      for (const record of records) {
        const dayKey = localDayKey(record?.created_at)
        if (dayKey === undefined) continue
        const bucket = buckets.get(dayKey) ?? { rub: 0, requests: 0 }
        bucket.rub += finiteNumber(record?.cost_rub) ?? 0
        bucket.requests += 1
        buckets.set(dayKey, bucket)
      }
      scanned += records.length
      if (records.length < 100) break
      if (reported !== undefined && page * 100 >= reported) break
      if (page === settings.maxPages) partial = true
    }
    const series = []
    const cursor = new Date(since)
    for (let index = 0; index < days; index += 1) {
      const dayKey = localDayKey(cursor.getTime())
      const bucket = buckets.get(dayKey) ?? { rub: 0, requests: 0 }
      series.push({ date: dayKey, rub: Math.round(bucket.rub * 10_000) / 10_000, requests: bucket.requests })
      cursor.setDate(cursor.getDate() + 1)
    }
    return { days: series, partial, scanned, total }
  }
  const result = await cached(cache, `daily:${provider}:${days}`, TTL.daily, load)
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
      [ROUTES.balance, (req) => balancePayload(ctx, settings, cache, queryOf(req).get('provider') ?? '')],
      [ROUTES.daily, (req) => dailyPayload(ctx, settings, cache, queryOf(req).get('provider') ?? '')],
      [ROUTES.rates, (req) => {
        const query = queryOf(req)
        return ratesPayload(ctx, settings, cache, query.get('provider') ?? '', query.get('model') ?? '')
      }],
    ]
    for (const [path, run] of routes) {
      webCtx.effect(() => webCtx.webServer.register({
        kind: 'exact',
        path,
        handler: guarded(async (req, res) => {
          respond(res, 200, await run(req))
        }),
      }), `plusvibe-balance: ${path}`)
    }
  })
}
