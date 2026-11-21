# Changelog

Notable changes to `dsh-plusvibe-balance`. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/).

## [Unreleased]

Storefront assets and marketplace submission. No behaviour changes: the runtime
files are untouched. Not released yet — `version` in `package.json` stays at the
last published release until a release is asked for.

### Added

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
