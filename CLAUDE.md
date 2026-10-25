# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one runtime
dependency: `@gladysassistant/integration-sdk`) for **RecycleApp** (Fost Plus), the Belgian
waste collection calendar. It reads the calendar of one address from the public RecycleApp API
(no account, no key) and exposes it as devices, scene triggers, scene actions and a dashboard
widget (Gladys 5.3+). Cloud only: manifest `"transports": ["cloud"]`. Started from the official
JavaScript template (GladysAssistant/integration-template-js), workflows from prohand/gladys-devmel.

## Commands

```bash
npm install
npm test                                    # node --test (built-in runner)
node --test test/scenes.test.js             # one file
node --test --test-name-pattern "midnight"  # one test by name
npm run lint                                # eslint .
npm run format:check                        # prettier --check . (CI gate)
npm run format                              # prettier --write .
npx github:GladysAssistant/integration-store .   # store admission checks
```

CI runs `format:check`, `lint`, `test` on Node 22 and 24; pull requests also run the store
checks and a Docker build. Releases: **Actions → Release** only (bumps `package.json`, manifest
`version` + `docker_image`, re-runs Prettier, rolls `CHANGELOG.md`, tags, builds, publishes the
GitHub Release).

## Architecture

```
index.js                    builds the real clients (API, /data store) and connects
src/app.js                  registerHandlers(gladys, deps): every SDK handler + the minute tick
src/config.js               DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/i18n.js                 LANGUAGES (en, fr, de, es), pick, localize
src/messages.js             dates, "in 3 days", lists, device names, error messages
src/store.js                /data/recycleapp-state.json (calendar + triggers fired)
src/devices.js              discovery payload, states, transport badges
src/recycleapp/api.js       HTTP client of api.fostplus.be/recyclecms/public/v1
src/recycleapp/calendar.js  pure functions: Belgian dates, normalization, grouping
src/recycleapp/service.js   the calendar of the address, kept fresh (refresh, retry, persist)
src/capabilities/actions.js manifest actions: test_connection, find_street
src/capabilities/scenes.js  scene triggers (fired by the tick) + scene actions
src/capabilities/widget.js  the "collections" dashboard widget + logos
```

### Invariants worth knowing

- **The API**: `https://api.fostplus.be/recyclecms/public/v1`, header `x-consumer: recycleapp.be`
  (read from recycleapp.be `config/app.settings.json` and its bundle). Address in two steps:
  `GET /zipcodes?q=` → `zipcodeId`, `POST /streets?q=&zipcodes=` (empty JSON body) → `streetId`,
  then `GET /collections?zipcodeId&streetId&houseNumber&fromDate&untilDate&size&page`.
- **Dates are Belgian.** Every "today" is computed in Europe/Brussels, never in the host time
  zone; dates travel as `YYYY-MM-DD` strings. Timestamps are the Belgian midnight written in
  UTC: read them with `localDate`.
- **Moved collections** come twice: the original has `exception.replacedBy` (dropped), the
  replacement `exception.replaces` (kept). `event` entries are not collections.
- **External ids**: a waste type device is keyed by the RecycleApp fraction id, the summary by
  `next-collection`. Never change them: Gladys keys history, scenes and dashboards on them.
- **No polling by Gladys**: devices are published without `should_poll`; the integration's own
  minute tick reads the API every `refresh_hours` (retry after 15 min on failure), publishes only
  what changed (`publishChangedStates`) and fires the triggers.
- **Triggers fire once a day**, remembered in `/data`, with a 4-hour catch-up window after their
  hour. Never fire a trigger from an action (loops).
- Waste types once seen at an address stay devices; out of the window they show `-1`.
- `/data` is the only writable path; a store that cannot be written is logged, never fatal.
- Trigger, action, widget and config keys are stored by users: never rename them.

### Manifest

`test/manifest.test.js` keeps `gladys-assistant-integration.json` in sync with
`DEFAULT_CONFIG` and the handlers (actions, scene actions, triggers, widgets), and checks that
every multi-language text carries en, fr, de and es.

## Testing

No network: `test/helpers/fakeRecycleApp.js` fakes the API through an injected `fetch` (trimmed
real answers) and provides a hand-driven clock; `test/helpers/setup.js` builds a service and the
handler context. The SDK's `createFakeGladys()` stands in for Gladys and refuses what the host
API refuses.

## Conventions

- Prettier formats, ESLint catches mistakes. Comments explain **why**, in English.
- **Changelog**: every user-visible change adds a line under `## [Unreleased]` in `CHANGELOG.md`
  (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`). Never write a version heading.
- **Versions belong to the Release workflow**: never edit `version` in `package.json` or the
  manifest, nor the `docker_image` tag, by hand.
- **User-facing text** is `{ en, fr, de, es }` (built with `src/i18n.js`); user docs in
  `docs/en.md`, `docs/fr.md`, `docs/de.md` and `docs/es.md`, kept in sync. Waste type names come
  from RecycleApp in fr, nl, de and en.
- Never log anything more personal than needed: the address appears in logs only on actions.
