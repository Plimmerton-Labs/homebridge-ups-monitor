# Changelog

All notable changes to this project are documented here.

## [Unreleased]

> ℹ️ Version numbers are assigned automatically by CI on merge — this entry is
> left as _Unreleased_ until then.

> ⚠️ **One-time history reset on upgrade.** This release enlarges the
> telemetry ring buffer so it retains ~24 hours of history (previously the
> capacity only covered about 12 hours at the default 30s poll interval).
> Because the on-disk buffer is rebuilt when its capacity changes, **existing
> history is cleared once** on the first run after upgrading. New data begins
> accumulating immediately and the file is not reset again.

### Added
- **12h** option on the dashboard history charts (ranges are now 1h / 6h / 12h / 24h).
- Plugin settings now explicitly call out the standalone dashboard, with header/footer
  notes and a link describing how to open it (`http://homebridge.local:PORT`).

### Changed
- Ring buffer is now sized to retain ~24 hours of history at the configured poll
  interval (2880 points at 30s, bounded at 8640). History readers adopt the stored
  file's capacity instead of wiping it on a size mismatch.
- Dashboard charts use a time-scaled x-axis pinned to the selected range, so 1h / 6h /
  12h / 24h always span their full window regardless of how many points fall inside.

### Fixed
- Plugin config screen no longer loads the broken embedded dashboard (where JSON failed
  to appear). Homebridge now shows the standard settings form; data is viewed via the
  standalone dashboard.
- Switching the chart time range now correctly changes the visible window (previously it
  appeared stuck at roughly one hour).

## Earlier releases

See the Git history and GitHub Releases for versions prior to the introduction of this changelog.
