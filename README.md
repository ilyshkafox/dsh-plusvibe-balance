# dsh-plusvibe-balance

**English** | [Русский](README.ru.md)

A DeepSeek Harness plugin that shows your [PlusVibeAPI](https://plusvibeapi.ru) balance
right under the message box, next to the context meter — and a card of what you have
spent: today, this month, this chat, and the last days as a chart.

> **Unofficial and non-commercial.** This plugin is not made by, affiliated with, or
> endorsed by PlusVibeAPI, and the author receives no money from it in any form. It
> talks to their public API with your own key. See
> [Trademarks and use of the mark](#trademarks-and-use-of-the-mark).

---

## What you get

The composer's bottom row normally carries two readings: turns/steps with output speed,
and the token total with the cache hit rate. This plugin adds a third, at the right:

```
                                     ⌁ 1 234,56 ₽ · ≈ 0,42 ₽    ● 12%   3↑ 47→ 58 t/s
                                    └─ balance ─┘ └ this chat ┘ └ context ┘ └─ shipped ─┘
```

- **The reading appears only when the selected model routes through PlusVibeAPI**
  (`plusvibeapi.ru` or `gw.plusvibeapi.ru`). Pick a model from another provider and it
  disappears — no half-truths about someone else's account.
- **Click it** for a card: remaining balance, today's spend and request count, this
  month's spend, an estimate for this chat, a bar chart of spend by day, and a link to
  the account page.
- **Colour reacts to the balance**: normal, warning below 100 ₽, error below 10 ₽, so an
  almost-empty account is visible without opening anything.
- **Refreshes on its own** every minute while the balance is visible.

## Why the key never leaves the machine

The browser half cannot call PlusVibeAPI directly: that would put your `sk-pv-…` key in
the page. So the plugin is split in two:

| Half | Runs in | Does |
|---|---|---|
| Host | the DSH process | reads the key from the provider's `apiKeyEnv` (or an inline `apiKey`), calls the API, caches the answers |
| Browser | the page | renders the reading and the card, talks only to four same-origin routes |

Routes the Host registers: `/plusvibe/providers`, `/plusvibe/balance`, `/plusvibe/daily`,
`/plusvibe/rates`. They answer JSON, refuse a request another origin started
(`Sec-Fetch-Site`), and are removed when the bundle is turned off.

## API calls it makes

All with **your** key, all read-only, all through the Host:

| Endpoint | Used for |
|---|---|
| `GET /v1/balance` | the remaining balance |
| `GET /api/key/usage` | today's and this month's spend, requests today |
| `GET /v1/pricing` | per-million token rates of the current model |
| `GET /v1/generations` | the per-day history behind the chart |

Caching: balance 20 s, usage 30 s, price list 30 min, history 5 min. Several open
sessions share one request instead of stampeding the provider.

## How "this chat" is counted

PlusVibeAPI does not report spend per chat — its history has request ids, not DSH
sessions. So this figure is **an estimate**, and it is labelled with `≈`:

```
(uncached_input × rate_in  +  cache_read × rate_cache_read
 + cache_write × rate_cache_write  +  output × rate_out) / 1 000 000
```

Tokens come from the session's own durable usage; the rates come from
`GET /v1/pricing`, the variant the catalog marks `isDefault`. That is the route an
unpinned request takes.

Where it can differ from the invoice:

- the gateway may route to another variant with different rates;
- the provider's minimum charge per request is not modelled;
- switching models mid-chat prices the whole chat at the current model's rates;
- provider-side rounding.

Today, this month and the per-day chart are **not** estimates: those are the sums the
provider actually charged (`cost_rub`).

## Install

Requires DeepSeek Harness `0.2.0-rc.2` or newer, and a running web profile.

```sh
dsh plugin --profile <profile> add dsh-plusvibe-balance
```

Or **Plugins → Add plugin** in the Web UI with the package name. Restart the profile,
then open a session whose model comes from PlusVibeAPI.

### Setup

The plugin finds PlusVibeAPI by itself: it reads the provider profiles of the running
`llm-pi-ai` entry and keeps the ones pointing at a PlusVibeAPI host. You need nothing
beyond the provider you already use — for example:

```yaml
- id: llm-pi-ai
  config:
    providers:
      plusvibeapi:
        apiKeyEnv: PLUSVIBEAPI_API_KEY
        api: openai-completions
        baseURL: https://plusvibeapi.ru/v1
        models:
          - id: deepseek-v4.1-flash-1017
            name: deepseek-v4.1-flash-1017
            contextWindow: 900000
            maxTokens: 64000
```

and `PLUSVIBEAPI_API_KEY=sk-pv-…` in the environment or the DSH credentials store.

A provider on a custom endpoint is added explicitly:

```yaml
- id: plusvibe-balance
  name: dsh-plusvibe-balance
  config:
    dailyDays: 7               # chart window, 1..30
    dailyMaxPages: 40          # history pages read for the chart, 100 records each
    dashboardPath: /dashboard  # page a click opens on the provider's site
    sites:                     # optional: routes that are not auto-detected
      - provider: plusvibeapi
        baseURL: https://gw.plusvibeapi.ru/v1
        apiKeyEnv: PLUSVIBEAPI_API_KEY
        siteUrl: https://plusvibeapi.ru/dashboard
```

`dailyMaxPages` bounds the chart scan: the provider pages history newest-first and has no
aggregate endpoint, so a very busy account stops at the cap and the card says the history
was read only partly.

## Uninstalling

Turn the bundle off (or remove it). The reading and all four routes disappear; nothing is
written to your session logs.

## Limitations

- Web only. The pill lives in the composer dock, which only the Web/Desktop surface has.
- One provider at a time: the reading follows the model the session currently routes to.
- Balance for a model routed through a different provider is never shown.
- No spending limit, no alert: it reports, it does not police.

## Trademarks and use of the mark

`icon.svg` is the PlusVibeAPI bolt, taken from the mark published on
[plusvibeapi.ru](https://plusvibeapi.ru) and kept geometrically unchanged: the same
path, the same brand yellow. It is here to identify the service this plugin talks to,
and for nothing else.

**Unofficial.** This plugin is not affiliated with, sponsored by, or endorsed by
PlusVibeAPI, and it is not an official client of theirs.

**Non-commercial.** The author receives nothing from it: no sales, no subscriptions, no
paid tiers, no donations, no advertising, no affiliate or referral payments, no paid
support. It is published free of charge as open source, for anyone to use.

PlusVibeAPI and its logo belong to their owner; this project claims no rights to them.
**If the rightsholder asks for the mark to be removed or replaced — for any reason, with
no justification needed — it will be removed in the next release**, and the package can
be republished without it the same day. `icon.svg` is the only file that carries the
mark and nothing else in the package refers to it, so replacing it with any other glyph
is a one-file change that touches no behaviour.

## License

[MIT](LICENSE) — use it, change it, publish your own version.

The license covers this plugin's code only. It grants no rights to the
PlusVibeAPI name or logo, and it comes with no warranty: if the numbers here
disagree with your invoice, the invoice wins.

## Contributing

Bug reports and small fixes are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## Contact

Written and maintained by **ilyshkafox** — <ilyshkafox@mail.ru>.

| What | Where |
|---|---|
| Bugs, questions, ideas | [open an issue](https://github.com/ilyshkafox/dsh-plusvibe-balance/issues) |
| A request from the rightsholder about the mark | email, and it is honoured in the next release |
| A security problem | email, with `security` in the subject |

Email is fine for anything that does not fit an issue. It is a personal mailbox, so
please put the project name in the subject; an unsolicited attachment is not opened.