# Feature Roadmap — homebridge-ups-monitor

Features are tackled independently, each on its own `agent/<slug>` branch from `develop`.
See [AGENTS.md](AGENTS.md) for branch / PR conventions.

---

## Feature 1 — HomeKit Tiles ✅ `agent/homekit-tiles`

**Goal:** Surface key UPS metrics as native HomeKit tiles that appear on the Home dashboard and can trigger automations.

| Tile | HAP Service | Source variable | Notes |
|---|---|---|---|
| On Battery | `OccupancySensor` | `ups.status` → `flags.onBattery` | Triggers automations on power failure |
| Load % | `Lightbulb` (Brightness) | `ups.load` | 0–100 %, On = load > 0 |
| Input Voltage | `LightSensor` (subtype `input-voltage`) | `input.voltage` | lux range covers any AC voltage |
| Output Voltage | `LightSensor` (subtype `output-voltage`) | `output.voltage` | lux range covers any AC voltage |
| Runtime | `TemperatureSensor` | `battery.runtime ÷ 60` | Minutes; home UPS runtime fits 0–100°C |

**Why LightSensor for voltage?** `CurrentTemperature` caps at 100°C — EU 230 V exceeds that.
`CurrentAmbientLightLevel` (0.0001–100000 lux) covers any realistic AC voltage.

**Implementation:** `lib/tiles/` — one module per tile, each exporting `setup(accessory, api, upsName, opts) → { update(data, flags) }`.

---

## Feature 2 — 24h Ring-Buffer History ✅ `agent/ring-buffer-history`

**Goal:** Persist 1440 data points (one per minute) for the last 24 hours so the dashboard can render full-day charts.

**Design:**
- Server-side ring buffer in `homebridge-ui/server.js`, backed by a JSON file on disk (`~/.homebridge/ups-history-<upsName>.json`)
- New UI endpoint: `POST /history` → returns `{ timestamps[], series: { voltage, battery, load, runtime }[] }`
- The poll loop in `index.js` emits data to the ring buffer after each successful NUT query
- Dashboard `index.html` switches from the current 20-minute in-memory array to the persistent `/history` feed

**Depends on:** Feature 1 (tile refactor establishes clean data-flow pattern)

---

## Feature 3 — Log Export ✅ `agent/log-export`

**Goal:** One-click CSV download of the 24h history data from the dashboard panel, plus access to 30-day daily log files.

**Delivered:**
- `POST /export` → 24h ring-buffer as CSV (timestamp, input_voltage, output_voltage, battery_pct, load_pct, runtime_min)
- `POST /logs` → lists available 30-day daily log files for a UPS, newest first
- `POST /logs/download` → serves a single daily CSV; filename validated against strict regex to prevent path traversal
- Dashboard **Data Export** panel: Export 24h CSV button + 30-day log file table with per-row download buttons
- 15 new tests; 152 total passing

**Depends on:** Feature 2 (ring-buffer history + DailyLog)

---

## Feature 4 — Export & Share ✅ `agent/export-share`

**Goal:** Replace the current Data Export panel with a clean two-button share flow that feels native on any device (Mac, iPhone, iPad, Android).

**What changes:**
- Remove the per-day file table and the separate 24h / per-day download buttons
- Replace with two clearly-labelled actions: **Last 24 Hours** and **Last 30 Days**
- **Last 24 Hours** — existing ring buffer as CSV (unchanged data source)
- **Last 30 Days** — server aggregates all `ups-log-<upsName>-YYYY-MM-DD.csv` files into a single CSV, newest-first, on demand
- Both actions use the **Web Share API** (`navigator.share({ files: [...] })`) where supported — gives the native share sheet on Mac, iOS, and Android
- Falls back to a Blob URL download on browsers that don't support Web Share API (e.g. Firefox desktop)

**Server changes:**
- New `POST /export-30d` endpoint — reads all daily log files, concatenates (single header row, all data rows), returns CSV string + suggested filename
- Existing `POST /export` (24h) unchanged

**Dashboard changes:**
- Replace `.export-section` HTML with a simpler two-card layout
- Feature-detect `navigator.canShare` at runtime; use share flow or download fallback accordingly

**Depends on:** Feature 3 (ring buffer + DailyLog already writing the source files)

---

## Feature 5 — Standalone Dashboard Server ✅ `agent/standalone-dashboard`

**Goal:** Host the UPS dashboard as a local website on the Raspberry Pi so any browser on the network can reach it directly — no Homebridge UI, no plugin config panel required.

**Config option:** `standalonePort` (integer 1–65535, optional). Leave blank to disable.

**Access URLs:**
- `http://localhost:PORT`
- `http://homebridge.local:PORT`
- `http://<pi-ip>:PORT`

**Implementation:**
- `lib/dashboardServer.js` — new `DashboardServer` class (Node.js built-in `http` module, no extra dependencies). Serves `homebridge-ui/public/index.html` on `GET /` and exposes all API endpoints (`/ups-status`, `/history`, `/export`, `/export-30d`, `/logs`, `/logs/download`) as `POST` routes with CORS headers.
- `index.js` — wires `DashboardServer` into the platform constructor; starts on `standalonePort` if configured.
- `homebridge-ui/public/index.html` — `apiRequest()` dual-mode wrapper: uses `homebridge.request()` when embedded in the Homebridge UI, plain `fetch()` when running standalone.
- `config.schema.json` — `standalonePort` field + *Standalone Dashboard* fieldset in layout.
- `test/dashboardServer.test.js` — 20 integration tests; 176 total passing.

**Depends on:** Feature 4 (export endpoints already implemented)

---

## Fixes & Polish — Dashboard 🚧 `agent/standalone-dashboard` (PR #68 → `develop`)

**Goal:** Make the standalone dashboard the single, reliable way to view UPS data and fix the history charts.

**Delivered:**
- **Removed `customUi`** from `config.schema.json` — the embedded config-panel dashboard never rendered its JSON. Homebridge now shows the standard settings form; the standalone dashboard (Feature 5) is the viewer. Added `headerDisplay`/`footerDisplay` + clearer field text linking to it. (Kept `singular: true` from #64.)
- **Chart time-range fixed** — charts use a `linear` x-axis pinned to the selected window, so **1h / 6h / 12h / 24h** each span their full range (previously stuck at ~1h). Added the **12h** button.
- **~24h history retention** — ring buffer sized from the poll interval (2880 points at 30s, bounded 8640). Readers use `adopt` mode to take on the stored file's capacity instead of wiping history on a size mismatch. ⚠️ one-time history reset on first run after upgrade (see `CHANGELOG.md`).
- **No new CDN dependency** — the time axis uses Chart.js's built-in `linear` scale + tick/tooltip formatter (dropped a `chartjs-adapter-date-fns` script that CodeQL flagged as an untrusted source).
- **Docs** — README reworked to describe the dashboard as standalone-only; added `CHANGELOG.md`.
- 1 new ring-buffer test; **177 total passing**.

**Status:** ✅ merged (#68, #70).

---

## Feature 6 — NUT Control Commands (close the functionality gap) 🎛️ `agent/nut-controls`

**Goal:** Add the two UPS *control* capabilities `homebridge-ups` has and we currently lack, so `homebridge-ups-monitor` is a functional superset. Prerequisite for the verification request (Feature 8).

**Scope:**
- **Audible alarm toggle** — a HomeKit `Switch` that enables/disables the UPS beeper via NUT `INSTCMD` (`beeper.enable` / `beeper.disable`, or `beeper.mute`).
- **Low-battery threshold (set)** — make the configured threshold writable to the UPS where supported via NUT `SET battery.charge.low`, in addition to the existing HomeKit Low-Battery alert.

**Implementation notes:**
- `lib/nutClient.js` — add authenticated command support: NUT `USERNAME` / `PASSWORD` then `INSTCMD <ups> <cmd>` and `SET VAR <ups> <var> <value>`; parse `OK` / `ERR` responses.
- Requires `upsd.users` credentials with `actions = SET` and `instcmds = ALL`; the existing `username`/`password` config feeds this. Degrade gracefully (log, don't throw) when the UPS or credentials don't permit control — many UPSes are monitor-only.
- New tile module(s) under `lib/tiles/` following the `setup(accessory, api, upsName, opts) → { update() }` pattern; only register control services when the NUT variable/command is advertised by the device.
- Tests with a mock NUT server for INSTCMD/SET success, ERR, and unsupported-command paths.

**Risks:** control commands vary by UPS model and require privileged `upsd.users`; must never throw on unsupported hardware.

**Depends on:** existing `nutClient` / tile architecture.

---

## Feature 7 — Reactive Dashboard Link in Settings UI 🔗 `agent/settings-live-link`

**Goal:** Make the dashboard URL shown in the plugin settings reflect the **actual** `standalonePort` the user types, instead of a static `PORT` / `8581` placeholder (see config-UI screenshot).

**Why it isn't possible today:** `headerDisplay` / `footerDisplay` in `config.schema.json` are *static* markdown — Homebridge renders them once and they can't read live field values.

**Approach:** add a minimal **custom UI** page via `@homebridge/plugin-ui-utils` that:
- renders the standard schema form (`homebridge.showSchemaForm()` / lets the schema render), and
- reads the current config (`homebridge.getPluginConfig()`), then renders a clickable `http://homebridge.local:<port>` link that updates reactively as the port field changes (listen for change events), with a copy button.

**Important distinction:** this is a *link-only* custom UI — it does **not** re-introduce the full embedded dashboard that previously failed to render (that was removed in the Fixes & Polish work). Scope is deliberately tiny to avoid regressing the config screen.

**Risks:** custom UI replaces the default settings renderer, so the schema form must be re-shown correctly; verify it doesn't reintroduce the blank-panel issue. Test on Homebridge UI ≥ current.

**Depends on:** none (independent polish).

---

## Feature 8 — "Verified by Homebridge" Readiness 📋 `agent/verification-readiness`

**Goal:** Meet every published [verification requirement](https://github.com/homebridge/plugins#plugin-verification) (criteria last updated 2024-11-02), then submit a verification request issue to `homebridge/plugins`.

### Positioning — complement to the verified `homebridge-ups`
`homebridge-ups` (by Erik Baauw) already holds the NUT/UPS slot. It is **HomeKit-centric**: exposes UPS status/battery to Home, adds **control** (toggle audible alarm, set low-battery threshold), keeps **Eve-app history**, and ships a `ups` CLI. All of its observability lives inside Apple's ecosystem.

`homebridge-ups-monitor` is positioned as an **observability & data-portability extension**, offering what `homebridge-ups` does not:
- **Standalone web dashboard** — live UPS view + charts in *any* browser on the network (Android, Windows, wall tablet), no Home app / Eve required.
- **Historical charts** with 1h / 6h / 12h / 24h ranges, backed by a ~24h server-side ring buffer.
- **CSV / log export** — one-click 24h export and 30-day daily logs for spreadsheets and long-term analysis.
- **Richer HomeKit tiles** — input/output voltage, load %, runtime, on-battery occupancy as native services for automations.

With Feature 6 adding control parity, we are a genuine superset rather than only a complement.

### Compliance audit & work items
Already compliant: dynamic platform; npm + GitHub repo with issues; config Settings GUI; no analytics; no post-install scripts; files written only under the Homebridge storage dir; GitHub release notes per version (automated changelog + beta tag alignment).

Gaps to close:
1. **Node 20 / 22 / 24 support** — add `24.x` to the CI matrix, drop EOL `18.x`, bump `engines.node` to `>=20`.
2. **Error-handling audit** — guarantee no unhandled exceptions: wrap NUT client failures, ring-buffer / file I/O, and the standalone HTTP server (`server.on('error')`, EADDRINUSE). Add tests.
3. **"Does not start unless configured"** — explicit guard + log when no host/UPS is configured; add a test.
4. **README / badge polish** — remove the premature `verified-by-homebridge` badge until granted; fix the duplicated "Dashboard" / "Standalone Dashboard" sections; add a short "Relationship to homebridge-ups" section.
5. **Submit** — open the verification issue on `homebridge/plugins` with the differentiation case above.

**Depends on:** Feature 6 (control parity strengthens the verification case).

---

## Feature 9 — Dependency Hygiene / Socket.dev Alert Triage 🧹 `agent/dependency-hygiene` (backlog)

**Goal:** Resolve or formally triage the Socket.dev dependency alerts so the published package presents a clean supply-chain profile.

**Context:** Alerts are *Dependency Alerts* (the dependency tree), not our own code. The only **runtime** dependency is `@homebridge/plugin-ui-utils`; `jest`, `eslint`, `@eslint/js`, and `conventional-changelog-cli` are **devDependencies** and are **not** included in the npm tarball users install. Most flags (eval, shell access, network, URL strings, dynamic require, filesystem, "unpopular/unmaintained/deprecated") originate in the dev tree.

**Scope:**
1. **Separate runtime vs dev risk** — confirm which alerts are reachable in the *published* package (runtime deps only). Audit `@homebridge/plugin-ui-utils` and its transitive tree for the flagged behaviors; document that dev-only alerts don't ship.
2. **Shrink the dev footprint** — `conventional-changelog-cli` pulls a large tree (a likely source of several alerts). Consider removing it from `devDependencies` and invoking it via `npx --yes conventional-changelog-cli@5` only in CI (the bump workflows already do this), so it's not in `package-lock.json`/the dev install at all.
3. **Identify the Deprecated + Unmaintained packages** — pin, replace, or document; raise upstream if needed.
4. **Formal triage** — add a Socket config (`socket.yml`) acknowledging accepted dev-only alerts with written justifications, so the dashboard reflects reviewed status rather than open warnings.
5. **Optional** — add a Socket / `npm audit` gate to CI (an `audit.yml` already exists) to catch new high-severity dependency issues going forward.

**Outcome:** a clean (or fully-triaged) Socket profile and a smaller dependency surface in the shipped package — supports the verification effort (Feature 8) and user trust.

**Depends on:** none (independent hygiene); coordinate with the changelog tooling added for release notes.

---

## Feature 10 — Tidy Data File Storage 🗂️ `agent/data-subdir`

**Goal:** Stop scattering data files across the Homebridge storage root. Keep them, but inside a dedicated subdirectory of the storage path.

**Context:** The plugin currently writes `ups-history-<ups>.json` and `ups-log-<ups>-YYYY-MM-DD.csv` directly into `<storage>/` (e.g. `/var/lib/homebridge/`), cluttering it alongside `config.json`, `accessories/`, etc. This is verification-compliant (files live in the storage dir, never in `node_modules`, which is wiped on update) but untidy.

**Scope:**
1. **Dedicated subdirectory** — write all plugin data under `<storage>/homebridge-ups-monitor/` (created on startup). Update the path resolution in `index.js`, `lib/ringBuffer.js`, `lib/dailyLog.js`, `lib/dashboardServer.js`, and `homebridge-ui/server.js` so the writer and all readers agree.
2. **One-time migration** — on startup, move any existing `ups-history-*.json` / `ups-log-*.csv` from the storage root into the subdirectory so history/logs aren't lost. Best-effort; log and skip on error.
3. **Stay in the storage dir** — never write to the package directory; keep resolving the storage path the existing way (`UIX_STORAGE_PATH` → `~/.homebridge`).
4. **Cleanup (related)** — de-duplicate stale case-variant files (e.g. `ups-history-CyberPower.json` vs `ups-history-cyberpower.json`) created when a UPS name's casing changed. Decide whether to normalize the on-disk key or just document that NUT UPS names are case-sensitive.

**Tests:** path-resolution + migration unit tests (mock storage dir with pre-existing root files → assert they move into the subdir and are still read).

**Outcome:** a clean storage root and a self-contained data folder — easier to back up, inspect, and reason about; supports the verification/tidiness goals.

**Depends on:** none.
