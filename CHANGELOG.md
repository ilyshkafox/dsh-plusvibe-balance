# Changelog

Notable changes to `dsh-plusvibe-balance`. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/).

## [Unreleased]

Nothing yet.

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

### Notes

- "This chat" is an estimate priced from `GET /v1/pricing` at the catalog's
  default variant; the route actually taken and the provider's minimum charge
  are not modelled.
