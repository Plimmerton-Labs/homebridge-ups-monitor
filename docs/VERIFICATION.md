# Homebridge Verification Readiness

Tracks compliance with the [Verified by Homebridge](https://github.com/homebridge/plugins#plugin-verification) criteria (last updated 2024-11-02) and the case for verifying `homebridge-ups-monitor`.

## Compliance checklist

| Requirement | Status |
|---|---|
| Dynamic platform | ✅ `registerPlatform` + `configureAccessory` |
| Published to npm; source on GitHub with issues enabled | ✅ |
| GitHub release with notes per version | ✅ stable releases + beta pre-releases (tag matches npm version) |
| Runs on Node 20 / 22 / 24 | ✅ CI matrix tests 18/20/22/**24** |
| Installs and does not start unless configured | ✅ platform only runs when a `NUTDashboard` block is present |
| No post-install scripts modifying the system | ✅ no `postinstall` |
| Implements the config Settings GUI | ✅ `config.schema.json` + custom UI |
| No analytics / user tracking | ✅ |
| Writes files only inside the Homebridge storage dir | ✅ `<storage>/homebridge-ups-monitor/` (never `node_modules`) |
| Catches and logs its own errors (no unhandled exceptions) | ✅ poll loop, NUT client, control commands, and the standalone server all catch/log |
| Does not duplicate an existing verified plugin | ⚠️ see positioning below |

## Positioning vs the verified `homebridge-ups`

`homebridge-ups` (Erik Baauw) is HomeKit-centric: it exposes and **controls** the UPS in Apple Home and keeps Eve-app history. `homebridge-ups-monitor` is an **observability & data-portability** complement:

- standalone **web dashboard** reachable from any browser (no Home app / Eve);
- **history charts** (1h/6h/12h/24h) from a server-side ring buffer;
- **CSV / log export** (24h + 30-day) for analysis;
- broad **HomeKit tiles** plus optional UPS controls (beeper toggle, low-battery threshold sync) so it is also a functional superset for in-Home use.

The two can run side by side; this plugin targets cross-platform monitoring and exportable history rather than competing as an Apple-Home bridge.
