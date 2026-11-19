/**
 * Browser half of `dsh-plusvibe-balance`.
 *
 * Registers one `conversation.composer.dock` entry beside the composer's own
 * statistics: the remaining PlusVibeAPI balance of the key behind the model the
 * session currently routes to. The entry renders only for a provider whose
 * endpoint is PlusVibeAPI (the Host reports those).
 *
 * Like the composer's context meter, the reading is a button that opens a
 * portaled dialog above it; the dialog carries the balance, today's and this
 * month's spend, an estimate for this chat, a per-day spend chart, and a link
 * to the provider's own account page.
 *
 * Everything numeric comes from the Host half through the package's own routes,
 * so the API key never enters the page. Session spend is the session's durable
 * token usage priced with the provider's catalog rates, which is why it is
 * labelled approximate: the gateway, not the page, knows the final rounding.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plusvibe-balance',
  factory(require) {
    const React = require('react')
    const { createPortal } = require('react-dom')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    /** Dictionary namespace owned by this plugin. */
    const NS = 'plusvibe'
    /** Balance refresh period, in milliseconds. */
    const REFRESH_MS = 60_000
    /** How long the per-day series stays fresh in this page. */
    const DAILY_TTL_MS = 5 * 60_000
    /** Panel width cap; the panel narrows with the viewport. */
    const PANEL_WIDTH = 320
    /** Providers list freshness in this page. */
    const PROVIDERS_TTL_MS = 60_000

    const ru = {
      'money': '{value} ₽',
      'pill.aria': 'Баланс PlusVibeAPI: {value}. Траты в этом чате: {chat}. Открыть подробности',
      'pill.aria.noChat': 'Баланс PlusVibeAPI: {value}. Открыть подробности',
      'pill.chat': 'чат {value}',
      'pill.unavailable': 'Баланс PlusVibeAPI недоступен',
      'panel.title': 'PlusVibeAPI',
      'panel.balance': 'Баланс',
      'panel.today': 'Сегодня',
      'panel.month': 'За месяц',
      'panel.chat': 'В этом чате',
      'panel.requests': '{count} запр.',
      'panel.chart': 'Траты по дням',
      'panel.chartTotal': 'за {days} дн.',
      'panel.loading': 'Загружаем историю…',
      'panel.partial': 'История прочитана не полностью: показаны последние дни',
      'panel.noSpend': 'Трат за период нет',
      'panel.updated': 'Обновлено в {time}',
      'panel.open': 'Открыть кабинет PlusVibeAPI',
      'error.balance': 'Не удалось получить баланс',
      'chart.bar': '{date}: {value}, {count} запр.',
    }
    const en = {
      'money': '{value} RUB',
      'pill.aria': 'PlusVibeAPI balance: {value}. This chat: {chat}. Open details',
      'pill.aria.noChat': 'PlusVibeAPI balance: {value}. Open details',
      'pill.chat': 'chat {value}',
      'pill.unavailable': 'PlusVibeAPI balance unavailable',
      'panel.title': 'PlusVibeAPI',
      'panel.balance': 'Balance',
      'panel.today': 'Today',
      'panel.month': 'This month',
      'panel.chat': 'This chat',
      'panel.requests': '{count} req.',
      'panel.chart': 'Spend by day',
      'panel.chartTotal': 'over {days} d.',
      'panel.loading': 'Loading history…',
      'panel.partial': 'The history was read only partly: recent days are shown',
      'panel.noSpend': 'No spend in this period',
      'panel.updated': 'Updated at {time}',
      'panel.open': 'Open the PlusVibeAPI account page',
      'error.balance': 'Could not read the balance',
      'chart.bar': '{date}: {value}, {count} req.',
    }

    const CSS = `
.dsh-pv-root { display: inline-flex; flex: none; }
.dsh-pv-trigger {
  display: inline-flex; align-items: center; gap: 6px; flex: none;
  padding: 1px 8px; border: none; border-radius: var(--dsw-radius-sm);
  background: transparent; color: var(--dsw-alias-label-tertiary);
  font-family: inherit; font-size: var(--dsh-content-font-size-secondary, 13px);
  font-variant-numeric: tabular-nums;
  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));
  white-space: nowrap; cursor: pointer;
}
.dsh-pv-trigger:hover, .dsh-pv-trigger:focus-visible, .dsh-pv-trigger[aria-expanded='true'] {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}
.dsh-pv-trigger:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dsh-pv-trigger[data-tone='low'] { color: var(--dsw-alias-state-warn-primary); }
.dsh-pv-trigger[data-tone='critical'] { color: var(--dsw-alias-state-error-primary); }
.dsh-pv-trigger > svg { flex: none; }
.dsh-pv-sep { opacity: 0.6; }
.dsh-pv-panel {
  position: fixed; z-index: 1100; box-sizing: border-box;
  width: min(${PANEL_WIDTH}px, calc(100vw - 24px)); padding: 12px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-lg);
  background: var(--dsw-specific-menu);
  backdrop-filter: var(--dsw-menu-backdrop-filter);
  box-shadow: var(--dsw-elevation-prominent);
  font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary);
  cursor: default;
}
.dsh-pv-head { display: flex; align-items: baseline; gap: 8px; }
.dsh-pv-head-label { color: var(--dsw-alias-label-tertiary); }
.dsh-pv-head-value {
  margin-left: auto; font-weight: 500; font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary);
}
.dsh-pv-rule { height: 1px; margin: 8px 0; background: var(--dsw-alias-border-l1); }
.dsh-pv-rows { margin: 0; }
.dsh-pv-row { display: flex; align-items: baseline; gap: 12px; justify-content: space-between; padding: 1px 0; }
.dsh-pv-row dt { color: var(--dsw-alias-label-secondary); }
.dsh-pv-row dd { margin: 0; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary); }
.dsh-pv-row dd small { margin-left: 6px; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.dsh-pv-chart-head { display: flex; align-items: baseline; gap: 8px; margin-top: 10px; color: var(--dsw-alias-label-tertiary); }
.dsh-pv-chart-head span:last-child { margin-left: auto; font-variant-numeric: tabular-nums; }
.dsh-pv-chart { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 4px; margin-top: 6px; }
.dsh-pv-col { display: flex; flex-direction: column; align-items: stretch; gap: 2px; }
.dsh-pv-slot { display: flex; align-items: flex-end; height: 44px; border-radius: 3px; background: var(--dsw-alias-interactive-bg-hover); }
.dsh-pv-bar { width: 100%; border-radius: 3px; background: var(--dsw-alias-brand-primary); }
.dsh-pv-day { text-align: center; font-size: 10px; line-height: 14px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
.dsh-pv-day[data-today='true'] { color: var(--dsw-alias-label-primary); font-weight: 500; }
.dsh-pv-note { margin-top: 8px; color: var(--dsw-alias-label-tertiary); }
.dsh-pv-note[data-error='true'] { color: var(--dsw-alias-state-warn-primary); }
.dsh-pv-link {
  display: flex; align-items: center; gap: 6px; margin-top: 10px; padding: 5px 8px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-sm);
  color: var(--dsw-alias-label-primary); text-decoration: none;
}
.dsh-pv-link:hover, .dsh-pv-link:focus-visible {
  background: var(--dsw-alias-interactive-bg-hover); text-decoration: none;
}
.dsh-pv-link:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dsh-pv-link > svg { flex: none; margin-left: auto; color: var(--dsw-alias-label-tertiary); }
.dsh-pv-foot { margin-top: 8px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
`

    const MONEY = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const MONEY_COARSE = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })

    /** Page-lifetime caches, shared by every mounted pill. */
    const shared = {
      providers: null,
      providersAt: 0,
      providersPending: null,
      daily: new Map(),
      rates: new Map(),
    }

    /**
     * Read one JSON document from this package's Host routes.
     * @param url - same-origin route URL.
     * @returns the decoded payload.
     */
    async function getJson(url) {
      const response = await fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json' } })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json()
    }

    /**
     * Load the providers whose route is PlusVibeAPI.
     * @returns provider id to `{ provider, siteUrl }`.
     */
    function loadProviders() {
      if (shared.providers !== null && Date.now() - shared.providersAt < PROVIDERS_TTL_MS) {
        return Promise.resolve(shared.providers)
      }
      if (shared.providersPending !== null) return shared.providersPending
      const pending = getJson('/plusvibe/providers').then(
        (payload) => {
          const map = {}
          for (const item of Array.isArray(payload?.providers) ? payload.providers : []) {
            if (typeof item?.provider === 'string') map[item.provider] = item
          }
          shared.providers = map
          shared.providersAt = Date.now()
          shared.providersPending = null
          return map
        },
        (error) => {
          shared.providersPending = null
          throw error
        },
      )
      shared.providersPending = pending
      return pending
    }

    /**
     * Load one cached, coalesced value.
     * @param store - cache map.
     * @param key - cache key.
     * @param ttlMs - freshness window.
     * @param load - the loader.
     * @returns the cached or freshly loaded value.
     */
    function cachedValue(store, key, ttlMs, load) {
      const hit = store.get(key)
      if (hit !== undefined && hit.value !== undefined && Date.now() - hit.at < ttlMs) {
        return Promise.resolve(hit.value)
      }
      if (hit?.pending !== undefined) return hit.pending
      const pending = load().then(
        (value) => {
          store.set(key, { at: Date.now(), value })
          return value
        },
        (error) => {
          if (hit?.value === undefined) store.delete(key)
          throw error
        },
      )
      store.set(key, { ...(hit ?? {}), pending })
      return pending
    }

    /**
     * Load the per-day spend series of one provider.
     * @param provider - provider route id.
     * @returns the Host payload.
     */
    function loadDaily(provider) {
      return cachedValue(shared.daily, provider, DAILY_TTL_MS, () => getJson(`/plusvibe/daily?provider=${encodeURIComponent(provider)}`))
    }

    /**
     * Load the per-model rates of one provider.
     * @param provider - provider route id.
     * @param model - model id.
     * @returns the Host payload.
     */
    function loadRates(provider, model) {
      return cachedValue(shared.rates, `${provider}/${model}`, DAILY_TTL_MS, () => getJson(
        `/plusvibe/rates?provider=${encodeURIComponent(provider)}&model=${encodeURIComponent(model)}`,
      ))
    }

    /**
     * Format an amount with the locale's currency word.
     * @param t - bound translate.
     * @param value - amount, or undefined while unknown.
     * @returns the reading, or an em dash.
     */
    function money(t, value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
      const formatter = Math.abs(value) >= 100_000 ? MONEY_COARSE : MONEY
      return t('money', { value: formatter.format(value) })
    }

    /**
     * Day-of-month label of one `YYYY-MM-DD` key.
     * @param key - day key.
     * @returns the label.
     */
    function dayLabel(key) {
      const day = Number.parseInt(String(key).slice(8, 10), 10)
      return Number.isFinite(day) ? String(day) : String(key)
    }

    /**
     * Local clock reading of one timestamp.
     * @param time - epoch milliseconds.
     * @returns the `HH:MM` reading.
     */
    function clockOf(time) {
      try {
        return new Date(time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      } catch {
        return ''
      }
    }

    /** The composer-dock pill and its click-open dialog. */
    function BalancePill(props) {
      const { useProjection, t } = props
      const selection = useProjection('modelSelection')
      const usage = useProjection('tokenUsage')
      const current = selection?.next ?? selection?.lastUsed ?? null
      const provider = typeof current?.provider === 'string' ? current.provider : null
      const model = typeof current?.model === 'string' ? current.model : null

      const [providers, setProviders] = useState(shared.providers)
      const [balance, setBalance] = useState(null)
      const [failure, setFailure] = useState(null)
      const [rates, setRates] = useState(null)
      const [daily, setDaily] = useState(null)
      const [open, setOpen] = useState(false)
      const [anchor, setAnchor] = useState(null)
      const buttonRef = useRef(null)
      const panelRef = useRef(null)

      const site = provider === null || providers === null ? null : providers[provider] ?? null
      const enabled = provider !== null && site !== null

      useEffect(() => {
        let cancelled = false
        loadProviders().then(
          (map) => { if (!cancelled) setProviders(map) },
          () => { if (!cancelled) setProviders({}) },
        )
        return () => { cancelled = true }
      }, [])

      useEffect(() => {
        if (!enabled) {
          setBalance(null)
          setFailure(null)
          return undefined
        }
        let cancelled = false
        const load = async () => {
          try {
            const payload = await getJson(`/plusvibe/balance?provider=${encodeURIComponent(provider)}`)
            if (cancelled) return
            if (payload?.ok === true) {
              setBalance(payload)
              setFailure(null)
            } else {
              setBalance(null)
              setFailure(payload?.error ?? t('error.balance'))
            }
          } catch (error) {
            if (cancelled) return
            setBalance(null)
            setFailure(error instanceof Error ? error.message : String(error))
          }
        }
        void load()
        const timer = window.setInterval(load, REFRESH_MS)
        return () => {
          cancelled = true
          window.clearInterval(timer)
        }
        // `t` is a stable bound translate; the route and its provider drive reloads.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [enabled, provider])

      useEffect(() => {
        if (!enabled || model === null) {
          setRates(null)
          return undefined
        }
        let cancelled = false
        loadRates(provider, model).then(
          (payload) => { if (!cancelled) setRates(payload?.ok === true ? payload : null) },
          () => { if (!cancelled) setRates(null) },
        )
        return () => { cancelled = true }
      }, [enabled, provider, model])

      useEffect(() => {
        if (!open || !enabled) return undefined
        let cancelled = false
        loadDaily(provider).then(
          (payload) => { if (!cancelled) setDaily(payload?.ok === true ? payload : null) },
          () => { if (!cancelled) setDaily(null) },
        )
        return () => { cancelled = true }
      }, [open, enabled, provider])

      // Keep the panel glued to its trigger: a resize or any scroll moves the
      // composer, so the anchor is re-read instead of closing the panel.
      useEffect(() => {
        if (!open) {
          setAnchor(null)
          return undefined
        }
        const read = () => {
          const element = buttonRef.current
          if (element === null) return
          const rect = element.getBoundingClientRect()
          const width = Math.min(PANEL_WIDTH, window.innerWidth - 24)
          const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), Math.max(8, window.innerWidth - width - 8))
          setAnchor({ left: Math.round(left), bottom: Math.round(window.innerHeight - rect.top + 8) })
        }
        read()
        window.addEventListener('scroll', read, true)
        window.addEventListener('resize', read)
        return () => {
          window.removeEventListener('scroll', read, true)
          window.removeEventListener('resize', read)
        }
      }, [open])

      // A click outside, or Escape, closes the dialog — the same contract the
      // composer's own popovers follow.
      useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          const target = event.target
          if (buttonRef.current?.contains(target) === true) return
          if (panelRef.current?.contains(target) === true) return
          setOpen(false)
        }
        const onKeyDown = (event) => { if (event.key === 'Escape') setOpen(false) }
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown)
        }
      }, [open])

      const close = useCallback(() => { setOpen(false) }, [])

      const sessionRub = useMemo(() => {
        if (rates === null || usage === undefined || usage === null) return null
        const inputRate = rates.inputRub ?? 0
        const cacheReadRate = rates.cacheReadRub ?? inputRate
        const cacheWriteRate = rates.cacheWriteRub ?? inputRate
        const total = ((usage.uncachedInputTokens ?? 0) * inputRate
          + (usage.cacheReadTokens ?? 0) * cacheReadRate
          + (usage.cacheWriteTokens ?? 0) * cacheWriteRate
          + (usage.outputTokens ?? 0) * (rates.outputRub ?? 0)) / 1_000_000
        return total
      }, [rates, usage])

      if (!enabled) return null

      const rub = typeof balance?.balanceRub === 'number' ? balance.balanceRub : undefined
      const tone = rub === undefined ? 'unknown' : rub <= 10 ? 'critical' : rub <= 100 ? 'low' : 'normal'
      const reading = money(t, rub)
      const chatReading = sessionRub === null ? null : `≈ ${money(t, sessionRub)}`
      const aria = rub === undefined
        ? t('pill.unavailable')
        : chatReading === null
          ? t('pill.aria.noChat', { value: reading })
          : t('pill.aria', { value: reading, chat: chatReading })

      const days = Array.isArray(daily?.days) ? daily.days : []
      const maxSpend = days.reduce((max, day) => Math.max(max, typeof day?.rub === 'number' ? day.rub : 0), 0)
      const windowSpend = days.reduce((sum, day) => sum + (typeof day?.rub === 'number' ? day.rub : 0), 0)
      const todayKey = days.length > 0 ? days[days.length - 1].date : undefined

      const row = (label, value, detail) => h('div', { className: 'dsh-pv-row', key: label },
        h('dt', null, label),
        h('dd', null, value, detail === undefined ? null : h('small', null, detail)))

      const panel = h('div', {
        ref: panelRef,
        id: 'dsh-pv-panel',
        className: 'dsh-pv-panel',
        role: 'dialog',
        'aria-label': t('panel.title'),
        style: anchor === null ? { visibility: 'hidden' } : {
          left: `${anchor.left}px`,
          bottom: `${anchor.bottom}px`,
        },
      },
      h('div', { className: 'dsh-pv-head' },
        h('span', { className: 'dsh-pv-head-label' }, t('panel.title')),
        h('span', { className: 'dsh-pv-head-value' }, reading)),
      h('div', { className: 'dsh-pv-rule', 'aria-hidden': true }),
      failure === null ? h('dl', { className: 'dsh-pv-rows' },
        row(t('panel.balance'), reading),
        balance?.spendTodayRub === undefined ? null : row(
          t('panel.today'),
          money(t, balance.spendTodayRub),
          balance.requestsToday === undefined ? undefined : t('panel.requests', { count: String(Math.round(balance.requestsToday)) }),
        ),
        balance?.spendMonthRub === undefined ? null : row(t('panel.month'), money(t, balance.spendMonthRub)),
        row(t('panel.chat'), sessionRub === null ? '—' : `≈ ${money(t, sessionRub)}`),
      ) : h('div', { className: 'dsh-pv-note', 'data-error': 'true' }, failure),
      h('div', { className: 'dsh-pv-chart-head' },
        h('span', null, t('panel.chart')),
        h('span', null, days.length === 0 ? '' : `${money(t, windowSpend)} · ${t('panel.chartTotal', { days: String(days.length) })}`)),
      days.length === 0
        ? h('div', { className: 'dsh-pv-note' }, daily === null ? t('panel.loading') : t('panel.noSpend'))
        : h('div', { className: 'dsh-pv-chart' }, days.map((day, index) => {
          const value = typeof day?.rub === 'number' ? day.rub : 0
          const ratio = maxSpend > 0 ? value / maxSpend : 0
          return h('div', {
            className: 'dsh-pv-col',
            key: String(day?.date ?? index),
            title: t('chart.bar', {
              date: String(day?.date ?? ''),
              value: money(t, value),
              count: String(day?.requests ?? 0),
            }),
          },
          h('div', { className: 'dsh-pv-slot' },
            h('div', {
              className: 'dsh-pv-bar',
              style: { height: value > 0 ? `${Math.max(6, Math.round(ratio * 100))}%` : '0%' },
            })),
          h('div', {
            className: 'dsh-pv-day',
            'data-today': day?.date === todayKey ? 'true' : 'false',
          }, dayLabel(day?.date)))
        })),
      daily?.partial === true ? h('div', { className: 'dsh-pv-note' }, t('panel.partial')) : null,
      typeof site.siteUrl === 'string'
        ? h('a', {
          className: 'dsh-pv-link',
          href: site.siteUrl,
          target: '_blank',
          rel: 'noopener noreferrer',
          onClick: close,
        },
        t('panel.open'),
        h('svg', { viewBox: '0 0 16 16', width: 12, height: 12, 'aria-hidden': true },
          h('path', {
            d: 'M6 3h7v7M13 3 6.5 9.5',
            fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
            strokeLinecap: 'round', strokeLinejoin: 'round',
          })))
        : null,
      balance?.fetchedAt === undefined ? null : h('div', { className: 'dsh-pv-foot' },
        t('panel.updated', { time: clockOf(balance.fetchedAt) })))

      return h('span', { className: 'dsh-pv-root' },
        h('button', {
          ref: buttonRef,
          type: 'button',
          className: 'dsh-pv-trigger',
          'data-tone': tone,
          'aria-label': aria,
          'aria-haspopup': 'dialog',
          'aria-expanded': open ? 'true' : 'false',
          'aria-controls': open ? 'dsh-pv-panel' : undefined,
          onClick: () => { setOpen(!open) },
        },
        h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true },
          h('rect', {
            x: 1.6, y: 3.4, width: 12.8, height: 9.2, rx: 2.3,
            fill: 'none', stroke: 'currentColor', strokeWidth: 1.4,
          }),
          h('circle', { cx: 11.1, cy: 8, r: 1.15, fill: 'currentColor' })),
        h('span', null, reading),
        chatReading === null ? null : h('span', { className: 'dsh-pv-sep', 'aria-hidden': true }, '·'),
        chatReading === null ? null : h('span', null, chatReading)),
        open ? createPortal(panel, document.body) : null)
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement('style')
          style.dataset.dshPlugin = 'dsh-plusvibe-balance'
          style.textContent = CSS
          document.head.appendChild(style)
          return () => { style.remove() }
        }, 'plusvibe-balance: stylesheet')
        ctx.effect(() => ctx.locale.register(NS, { ru, en }), 'plusvibe-balance: dictionaries')
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'plusvibe-balance',
          order: 2,
          locale: NS,
        }, BalancePill))
      },
    }
  },
})
