# RecycleApp for Gladys Assistant

External integration for [Gladys Assistant](https://gladysassistant.com) that brings the
Belgian waste collection calendar of [RecycleApp](https://www.recycleapp.be) (Fost Plus) into
Gladys: devices, scene triggers, scene actions and a dashboard widget.

- **Cloud** integration: it reads the public RecycleApp API, the one the recycleapp.be website
  uses. No account, no key.
- One address per installation: zip code, street, house number.
- Texts in English, French, German and Spanish; waste types named in French, Dutch, German or
  English (the languages RecycleApp publishes).
- Requires **Gladys 5.1+**.

User documentation: [English](docs/en.md) · [Français](docs/fr.md) · [Deutsch](docs/de.md) ·
[Español](docs/es.md).

## What it provides

| Surface          | Keys                                                                   |
| ---------------- | ---------------------------------------------------------------------- |
| Devices          | "Next waste collection" (summary) + one device per waste type          |
| Configuration    | `test_connection`, `find_street` actions                               |
| Scene triggers   | `collection_tomorrow`, `fraction_tomorrow`, `collection_today`         |
| Scene actions    | `next_collection`, `refresh_calendar`                                  |
| Dashboard widget | `collections` (next collections with RecycleApp logos, refresh button) |
| Transport badge  | `cloud`, degraded while an older calendar is served                    |

Each waste type device carries the days left until its next collection (`0` today, `-1` none
planned in the window read) and the day written out; the summary adds the waste types of the
next collection.

## Project structure

```
.
├─ index.js                          # builds the real clients and connects
├─ src/
│  ├─ app.js                         # SDK handlers + the minute tick
│  ├─ config.js                      # config defaults + normalization
│  ├─ devices.js                     # discovery payload, states, transport badges
│  ├─ i18n.js / messages.js          # languages and wording
│  ├─ store.js                       # /data persistence
│  ├─ recycleapp/
│  │  ├─ api.js                      # RecycleApp API client
│  │  ├─ calendar.js                 # Belgian dates, normalization (pure functions)
│  │  └─ service.js                  # the calendar of the address, kept fresh
│  └─ capabilities/
│     ├─ actions.js                  # Configuration screen buttons
│     ├─ scenes.js                   # scene triggers and actions
│     └─ widget.js                   # dashboard widget
├─ docs/                             # user documentation (en, fr, de, es)
├─ test/                             # node --test, no network (fake API + fake Gladys)
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, non-root, read-only rootfs ready
├─ CHANGELOG.md / SECURITY.md / CLAUDE.md
└─ .github/                          # CI, release, build, GitHub releases, Dependabot
```

## Development

```bash
npm install
npm test               # unit tests (node --test), no network
npm run lint           # ESLint
npm run format:check   # Prettier
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run it against a Gladys instance:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="recycleapp" \
RECYCLEAPP_DATA_DIR="./data" \
LOG_LEVEL=debug \
npm start
```

`RECYCLEAPP_DATA_DIR` replaces `/data` outside the container.

## Workflows

Same set as [gladys-devmel](https://github.com/prohand/gladys-devmel):

- **CI** (`ci.yml`): Prettier, ESLint and tests on Node 22 and 24; on pull requests, the store
  admission checks and a Docker build.
- **Release** (`release.yml`, Actions → Release → patch / minor / major): bumps the version in
  `package.json` and the manifest, moves the `[Unreleased]` section of `CHANGELOG.md`, tags
  `vX.Y.Z`, builds the image and publishes the GitHub Release.
- **Build** (`build.yml`): multi-arch image (`linux/amd64`, `linux/arm64`) on
  `ghcr.io/prohand/gladys-recycleapp`.
- **GitHub releases** (`github-release.yml`): one GitHub Release per version tag.
- **Dependabot**: npm weekly, GitHub Actions and Docker monthly.

## Publishing checklist

1. Add the GitHub topic `gladys-assistant-integration` to the repository.
2. Turn on **Private vulnerability reporting** (Settings → Security): `SECURITY.md` sends
   reporters there.
3. Make the `ghcr.io/prohand/gladys-recycleapp` package public after the first build.
4. Run **Actions → Release**.

## Credits

Calendar data © Fost Plus / RecycleApp and the Belgian waste management bodies. This
integration is not affiliated with Fost Plus.

## License

Apache-2.0
