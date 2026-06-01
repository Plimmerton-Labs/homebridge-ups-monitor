'use strict';

/**
 * lib/storagePaths.js
 *
 * Central resolver for where the plugin keeps its data files.
 *
 * Telemetry history and CSV logs are written to a dedicated subdirectory of the
 * Homebridge storage path (`<storage>/homebridge-ups-monitor/`) instead of the
 * storage root, to keep the root tidy. Files remain inside the Homebridge
 * storage directory (never in node_modules, which is wiped on update).
 *
 * Both the writer (index.js) and the readers (dashboardServer.js,
 * homebridge-ui/server.js) resolve the data directory through this module so
 * they always agree.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const DATA_SUBDIR = 'homebridge-ups-monitor';

/** Resolve the Homebridge storage root the same way across the codebase. */
function resolveStoragePath() {
  return process.env.UIX_STORAGE_PATH || path.join(os.homedir(), '.homebridge');
}

/** Resolve the plugin's dedicated data directory under the storage root. */
function resolveDataDir(storagePath) {
  return path.join(storagePath || resolveStoragePath(), DATA_SUBDIR);
}

/**
 * One-time migration: move legacy data files written to the storage root by
 * earlier versions (`ups-history-*.json`, `ups-log-*.csv`) into the data dir.
 * Best-effort — logs and continues on any error, never throws.
 *
 * @param {string} storagePath  storage root
 * @param {string} dataDir      destination data directory
 * @param {object} [log]        logger (optional)
 * @returns {number}            count of files moved
 */
function migrateLegacyFiles(storagePath, dataDir, log) {
  let moved = 0;
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const entries = fs.readdirSync(storagePath);
    const legacy = entries.filter(f =>
      /^ups-history-.*\.json$/.test(f) || /^ups-log-.*\.csv$/.test(f));
    for (const f of legacy) {
      const src = path.join(storagePath, f);
      const dst = path.join(dataDir, f);
      try {
        if (fs.existsSync(dst)) {
          fs.unlinkSync(src);          // dest already has it — drop the stale root copy
        } else {
          fs.renameSync(src, dst);     // move into the data dir
          moved++;
        }
      } catch { /* skip individual file errors */ }
    }
    if (moved && log && log.info) {
      log.info(`[UPS Monitor] Migrated ${moved} data file(s) into ${DATA_SUBDIR}/.`);
    }
  } catch (err) {
    if (log && log.warn) log.warn(`[UPS Monitor] Data-file migration skipped: ${err.message}`);
  }
  return moved;
}

module.exports = { DATA_SUBDIR, resolveStoragePath, resolveDataDir, migrateLegacyFiles };
