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
function isDataFile(f) {
  return /^ups-history-.*\.json$/.test(f) || /^ups-log-.*\.csv$/.test(f);
}

/**
 * Move legacy data files from a single source directory into the data dir.
 * Best-effort: never throws, skips individual file errors, handles
 * cross-device moves (rename → copy+unlink fallback). Does nothing when the
 * source is missing or is the data dir itself.
 *
 * @returns {number} count of files moved
 */
function migrateFilesFrom(srcDir, dataDir) {
  let moved = 0;
  try {
    if (!srcDir) return 0;
    if (path.resolve(srcDir) === path.resolve(dataDir)) return 0;
    if (!fs.existsSync(srcDir)) return 0;
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const legacy = fs.readdirSync(srcDir).filter(isDataFile);
    for (const f of legacy) {
      const src = path.join(srcDir, f);
      const dst = path.join(dataDir, f);
      try {
        if (fs.existsSync(dst)) {
          fs.unlinkSync(src);          // dest already has it — drop the stale copy
        } else {
          try {
            fs.renameSync(src, dst);   // fast path: same filesystem
          } catch {
            fs.copyFileSync(src, dst); // cross-device: copy then remove original
            fs.unlinkSync(src);
          }
          moved++;
        }
      } catch { /* skip individual file errors */ }
    }
  } catch { /* skip directory-level errors */ }
  return moved;
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
    moved = migrateFilesFrom(storagePath, dataDir);
    if (moved && log && log.info) {
      log.info(`[UPS Monitor] Migrated ${moved} data file(s) into ${DATA_SUBDIR}/.`);
    }
  } catch (err) {
    if (log && log.warn) log.warn(`[UPS Monitor] Data-file migration skipped: ${err.message}`);
  }
  return moved;
}

/**
 * Cross-location migration: when the resolved storage path changes between
 * versions (e.g. moving from the old ~/.homebridge / UIX_STORAGE_PATH fallback
 * to the path Homebridge reports via api.user.storagePath()), reclaim any data
 * files left behind in the old locations so a user's history/CSV logs survive
 * the upgrade. Scans each legacy candidate root and its data subdirectory.
 *
 * @param {string} dataDir  the current (correct) data directory
 * @param {object} [log]    logger (optional)
 * @returns {number}        count of files moved
 */
function migrateLegacyLocations(dataDir, log) {
  let moved = 0;
  try {
    const candidates = [];
    const homeRoot = path.join(os.homedir(), '.homebridge');
    candidates.push(homeRoot, path.join(homeRoot, DATA_SUBDIR));
    if (process.env.UIX_STORAGE_PATH) {
      const envRoot = process.env.UIX_STORAGE_PATH;
      candidates.push(envRoot, path.join(envRoot, DATA_SUBDIR));
    }
    const seen = new Set();
    for (const dir of candidates) {
      const key = path.resolve(dir);
      if (seen.has(key)) continue;
      seen.add(key);
      moved += migrateFilesFrom(dir, dataDir);
    }
    if (moved && log && log.info) {
      log.info(`[UPS Monitor] Recovered ${moved} data file(s) from a previous storage location into ${DATA_SUBDIR}/.`);
    }
  } catch (err) {
    if (log && log.warn) log.warn(`[UPS Monitor] Legacy-location migration skipped: ${err.message}`);
  }
  return moved;
}

module.exports = { DATA_SUBDIR, resolveStoragePath, resolveDataDir, migrateLegacyFiles, migrateLegacyLocations };
