# Changelog

Notable changes to `dsh-plusvibe-balance`. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/).

## [Unreleased]

### Security

- **The four HTTP routes now go through DSH's own access check.** Each request asks
  the composition's `ctx.connection.requestRejection` — the Host/Origin fence and
  browser-session authentication DSH applies to its `/api` routes — before the route
  reads anything, so a page that is not signed in, or a request another origin or host
  started, is refused by the harness itself and never reaches the key. The refusal is
  the same `{ "ok": false, "error": … }` JSON as before, with the status DSH returned
  (`401` or `403`). The plugin's `Sec-Fetch-Site` fence stays behind that check as a
  second layer, and remains the only gate in a composition that mounts no `connection`
  service, so the plugin still works there. Registration and disposal are unchanged:
  the routes and their check are removed together with `ctx.effect`.

## [0.2.0] — 2026-11-21

A refresh button, a chart that reads as a week, a history walk that is complete
instead of capped, and storefront assets for plugin directories.

### Added

- A **refresh button in the card's top-right corner**. It re-reads the balance and
  the per-day history immediately instead of waiting out the one-minute interval,
  spins while the request is in flight, and is the way back from a failed read
  without reloading the page. The balance and daily routes accept `refresh=1`,
  which skips the Host's short cache so the button cannot hand back the same
  answer it is meant to replace.
- The chart's bars are labelled with the **weekday** instead of the day of the
  month, so a week reads as a week; the exact date stays in the bar's tooltip.
- `assets/icon.png` — the square PlusVibeAPI mark as published on
  plusvibeapi.ru, for the card tile in plugin directories. Byte-identical to the
  original; the in-app icon stays the vector `icon.svg`.
- `screenshots.json` — declares `docs/screenshot.png` as the storefront
  screenshot, so directories show that image in that order instead of guessing
  from the README.
- `contrib/awesome-dsh-plugin-entry.yml` — the catalog entry for the
  awesome-dsh-plugin registry, ready to copy into a fork as
  `data/plugins/ilyshkafox__dsh-plusvibe-balance.yml`. That registry is the list
  the plugin market inside DSH installs from.
- `CONTRIBUTING.md`: how a listing reaches the marketplaces — the `dsh-plugin`
  topic, the two storefront assets, the pull request, and what each directory
  checks.
- `AGENTS.md` — the repository's own rule for coding agents, which is that a
  release happens only when the maintainer asks for one.

### Changed

- **The chart now covers its window instead of stopping at a page cap.** The walk
  through `GET /v1/generations` is remembered between reads: a complete series is
  extended with only the records that appeared above it, and a pass that ran out
  of page budget continues from the oldest record it reached on the next read.
  Pages are fetched four at a time, the record ids of the overlap window are kept
  so a long stream that finishes late is counted once, and `dailyMaxPages` now
  defaults to 100. "History read only partly" therefore means "not covered yet",
  and a refresh usually costs one request.
- **"Today" comes from the same series as the last bar**, so the row and the chart
  cannot disagree. The provider's own counter uses a UTC day, which starts later
  than the local one; a tooltip on the row says so.
- **A day is a calendar day on the machine running DSH.** Day arithmetic goes
  through the calendar rather than through 86 400 000 ms, so a daylight-saving
  change inside the window no longer shifts a boundary by an hour.
- The chart refreshes on the same one-minute tick as the balance while the card is
  open, and the page's own history cache dropped from 5 minutes to 30 s to match.
- **A failed upstream call now says what failed.** `fetch` reports every
  transport fault as the bare sentence "fetch failed" and keeps the reason in
  `cause`; the Host printed only the sentence, and two failing calls printed it
  twice ("fetch failed; fetch failed"). It now appends the cause — `ENOTFOUND`,
  `ECONNREFUSED`, the timeout — and repeats a cause only once, so a broken route
  can be told apart from a rejected key.
- A rejected reload no longer leaves its rejected promise in either cache, which
  would have handed the same error back to the next read instead of retrying.
- The trademark section of both READMEs now lists the three files that carry the
  mark — `icon.svg`, `assets/icon.png`, and the bolt redrawn in
  `docs/preview.svg` — instead of claiming `icon.svg` was the only one.
- `files` in the manifest ships `assets/icon.png` and `screenshots.json`, and the
  publish workflow now fails when either is missing or a screenshot path does
  not resolve.

## [0.1.0] — 2026-11-19

First release.

### Added

- A composer-dock pill with the remaining PlusVibeAPI balance, shown only while
  the session's model routes through PlusVibeAPI.
- A click-open card: balance, today's spend and request count, this month's
  spend, an estimate for the current chat, a per-day spend bar chart, and a link
  to the account page.
- Balance tone: normal, warning below 100 ₽, error below 10 ₽.
- Provider discovery from the live `llm-pi-ai` provider profiles (hosts
  `plusvibeapi.ru`, `gw.plusvibeapi.ru`), plus an explicit `sites` config for
  anything else.
- Host half reading the key through the DSH credentials service, calling
  `/v1/balance`, `/api/key/usage`, `/v1/pricing`, and `/v1/generations`, and
  serving four same-origin routes that refuse cross-origin callers.
- Caching: 20 s balance, 30 s usage, 30 min price list, 5 min history; one
  in-flight request shared by every open session.
- English and Russian UI and documentation.
- A plugin details page with one feature image (`docs/DETAIL.md`,
  `docs/DETAIL.ru.md`, `docs/preview.svg`).
- A `publish` workflow that publishes a GitHub Release to npm over OIDC trusted
  publishing: no token secret, automatic provenance, `next` for prereleases,
  and a rerun that skips a version already on the registry.

### Notes

- "This chat" is an estimate priced from `GET /v1/pricing` at the catalog's
  default variant; the route actually taken and the provider's minimum charge
  are not modelled.
