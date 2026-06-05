---
name: code-review
description: Review homebridge-ups-monitor pull requests for Homebridge/NUT correctness, security, test coverage, dependency safety, and release/versioning risks. Use this for Copilot code review and any PR review in this repository.
---

# Code Review Skill

Review pull requests as a careful maintainer of `homebridge-ups-monitor`, a CommonJS Homebridge platform plugin that monitors UPS devices through NUT (Network UPS Tools), exposes HomeKit services, and serves a standalone dashboard.

Use this skill with the repository guidance in:

- `.github/copilot-instructions.md`
- `.github/AGENTS.md`
- `AGENTS.md`
- `docs/RELEASE.md`
- `docs/VERIFICATION.md`

Lead with actionable findings. Do not add praise sections. If there are no material issues, say so and mention any remaining test or manual-verification gaps.

## Review Priorities

### Security

- Treat all NUT TCP responses as untrusted input.
- Flag regexes or parsers in `lib/nutClient.js` and `lib/nutParser.js` that can hang, over-match, or accept malformed data unsafely.
- Flag raw NUT output passed to `eval`, `Function`, unsafe JSON parsing, shell commands, or HTML without validation.
- Check file operations for path traversal, especially history/CSV/log reads and downloads in `lib/dashboardServer.js`, `homebridge-ui/server.js`, `lib/storagePaths.js`, `lib/ringBuffer.js`, and `lib/dailyLog.js`.
- Ensure downloadable log filenames remain allowlisted with strict patterns such as `ups-log-<safe-name>-YYYY-MM-DD.csv`.
- Flag any logging of full plugin config objects, NUT passwords, tokens, or auth headers.
- Flag prototype-pollution risks from merging unvalidated parsed objects into config or state.

### Homebridge and HomeKit Correctness

- New or recovered services must use `accessory.getService(...) || accessory.addService(...)`; never add duplicate services unconditionally.
- Characteristic updates must use `updateCharacteristic`.
- `configureAccessory` and startup paths must not throw synchronously and crash Homebridge.
- Keep `platform: "NUTDashboard"` aligned across `index.js`, `config.schema.json`, and docs.
- Accessory names and service labels must be HAP-valid and stable across restart/upgrade.
- Optional UPS controls must degrade gracefully when hardware, credentials, NUT commands, or writable variables are unsupported.

### NUT Behavior

- Preserve units:
  - `battery.runtime` is seconds from NUT and minutes for the runtime tile/dashboard display.
  - `battery.charge` and `ups.load` are percentages.
  - `input.voltage` and `output.voltage` are AC voltage values.
- Avoid assuming every UPS reports every variable.
- Check multi-UPS behavior when code uses UPS names in paths, labels, maps, or logs.
- Keep read-only monitoring as the default. Any UPS write command must stay explicitly opt-in.

### Dashboard, Storage, and Data Export

- The standalone dashboard has no authentication. Flag changes that broaden exposure, bind unexpectedly, leak data, or weaken the existing local-network warning.
- Data files must stay under the active Homebridge storage directory, normally in the `homebridge-ups-monitor/` subfolder.
- Do not hardcode `/var/lib/homebridge`, `~/.homebridge`, the package directory, or `node_modules` as storage targets.
- History migration should be best-effort and non-destructive.
- CSV export should produce safe filenames and stable column schemas.

### Tests and Verification

- New exported functions in `lib/` should have focused tests in `test/`.
- Socket/server behavior should use the existing mock NUT server or dependency injection. Do not mock `fs` or `net` at module level unless there is a strong reason.
- Reviewers should expect `npm test` for most changes and `npm run lint` when style, code structure, or workflows are touched.
- For UI/dashboard changes, ask for manual verification of the standalone dashboard where automated coverage cannot prove rendering or browser behavior.

### Dependencies, Release, and Workflow Safety

- Do not allow production dependencies without clear justification; plugin size and supply-chain risk matter.
- Flag production code importing packages that are only in `devDependencies`.
- Agents must not edit `package.json` `version`; versioning is automated by workflows.
- Do not use commit messages beginning with `chore: bump version` except for automated version-bump PRs.
- Changes to `.github/workflows/publish.yml`, npm OIDC, or Node version requirements need explicit justification because publishing depends on Node 24/npm 11 trusted publishing.
- Feature and fix PRs target `develop`; `main` is fed only from `develop`.

## Output Format

Use this order:

1. Findings, ordered by severity.
2. Open questions or assumptions.
3. Test and manual-verification gaps.
4. Brief summary.

Each finding should include:

```text
[Severity] Short title
Location: path:line or path:function
Problem: what is wrong
Impact: what can fail or regress
Recommendation: concrete fix
```

Use severities `Critical`, `High`, `Medium`, `Low`, or `Info`. Avoid speculative findings without a realistic failure path.

## Do Not Flag

- Intentional `console.log` / `console.error` use for Homebridge logging unless secrets can be logged.
- Intentional `!= null` checks for null-or-undefined.
- Empty or minimal `catch` blocks used only for best-effort cleanup when the surrounding code remains safe.
- HomeKit service mappings that look unusual but are documented, such as load as `Lightbulb`, voltage as `LightSensor`, runtime as `TemperatureSensor`, and on-battery as `OccupancySensor`.
