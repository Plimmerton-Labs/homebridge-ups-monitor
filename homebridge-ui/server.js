'use strict';

/**
 * homebridge-ui/server.js
 *
 * Runs server-side inside the Homebridge UI process.
 * Handles HTTP requests from the dashboard UI (index.html) via homebridge.request().
 *
 * Endpoints:
 *   POST /ups-status        → queries NUT and returns JSON for all configured UPS units
 *   POST /history           → returns 24h ring-buffer points as JSON
 *   POST /export            → returns 24h ring-buffer as a CSV string
 *   POST /export-30d        → aggregates all 30-day daily logs into a single CSV string
 *   POST /outages           → returns outage timeline events for a UPS
 *   POST /outages/acknowledge → acknowledges the latest outage
 *   POST /outages/clear     → clears outage timeline events for a UPS
 *   POST /outages/export    → returns outage timeline as CSV
 *   POST /logs              → lists available 30-day daily log files for a UPS
 *   POST /logs/download     → returns the contents of one daily log file as CSV
 */

const { HomebridgePluginUiServer } = require('@homebridge/plugin-ui-utils');
const { queryNUT }  = require('../lib/nutClient');
const telemetryStore = require('../lib/telemetryStore');
const { resolveDataDir } = require('../lib/storagePaths');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ─── UI Server ────────────────────────────────────────────────────────────────
class NUTUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();
    this.onRequest('/ups-status',     this.handleUpsStatus.bind(this));
    this.onRequest('/history',         this.handleHistory.bind(this));
    this.onRequest('/export',          this.handleExport.bind(this));
    this.onRequest('/export-30d',      this.handleExport30d.bind(this));
    this.onRequest('/outages',         this.handleOutages.bind(this));
    this.onRequest('/outages/acknowledge', this.handleOutagesAcknowledge.bind(this));
    this.onRequest('/outages/clear',   this.handleOutagesClear.bind(this));
    this.onRequest('/outages/export',  this.handleOutagesExport.bind(this));
    this.onRequest('/logs',            this.handleLogs.bind(this));
    this.onRequest('/logs/download',   this.handleLogsDownload.bind(this));
    this.ready();
  }

  async handleUpsStatus() {
    try {
      // Read config directly from config.json — compatible with all UI utils versions
      const storagePath = this.homebridgeStoragePath
        || process.env.UIX_STORAGE_PATH
        || path.join(os.homedir(), '.homebridge');
      const raw = fs.readFileSync(path.join(storagePath, 'config.json'), 'utf8');
      const homebridgeConfig = JSON.parse(raw);
      const cfg = (homebridgeConfig.platforms || []).find(p => p.platform === 'NUTDashboard') || {};

      const host     = cfg.host     || '127.0.0.1';
      const port     = cfg.port     || 3493;
      const username = cfg.username || null;
      const password = cfg.password || null;
      const upsList  = Array.isArray(cfg.ups) ? cfg.ups : [cfg.ups || 'ups'];

      const results = await Promise.allSettled(
        upsList.map(upsName => queryNUT(host, port, upsName, username, password)
          .then(data => ({ _upsName: upsName, ...data }))
        )
      );

      const data = results.map((r, i) =>
        r.status === 'fulfilled'
          ? r.value
          : { _upsName: upsList[i], _error: r.reason?.message || 'Unknown error' }
      );

      return {
        success:   true,
        timestamp: new Date().toISOString(),
        host,
        port,
        data,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * POST /history
   * Body: { upsName?: string }  — defaults to first UPS in config
   *
   * Returns the persistent ring-buffer history written by index.js.
   * No NUT query — pure file read, safe to call frequently.
   *
   * Response:
   *   { success: true,  upsName, points: [{t, inV, outV, bat, load, runtime}] }
   *   { success: false, error }
   */
  async handleHistory(body = {}) {
    try {
      const { dataDir, upsName } = this._resolveContext(body);
      return { success: true, upsName, points: telemetryStore.readHistory(dataDir, upsName) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  // ── Shared helper ─────────────────────────────────────────────────────────

  /**
   * Resolve storagePath and upsName from body, falling back to config.
   * Returns { storagePath, upsName }.
   */
  _resolveContext(body = {}) {
    const storagePath = this.homebridgeStoragePath
      || process.env.UIX_STORAGE_PATH
      || path.join(os.homedir(), '.homebridge');

    let upsName = body.upsName;
    if (!upsName) {
      const raw     = fs.readFileSync(path.join(storagePath, 'config.json'), 'utf8');
      const cfg     = (JSON.parse(raw).platforms || []).find(p => p.platform === 'NUTDashboard') || {};
      const upsList = Array.isArray(cfg.ups) ? cfg.ups : [cfg.ups || 'ups'];
      upsName = upsList[0];
    }

    return { storagePath, dataDir: resolveDataDir(storagePath), upsName };
  }

  /**
   * POST /export
   * Body: { upsName?: string }
   *
   * Returns the 24h ring-buffer as a CSV string so the dashboard can
   * trigger a browser download.
   *
   * Response:
   *   { success: true,  upsName, filename, csv }
   *   { success: false, error }
   *
   * CSV columns: timestamp, input_voltage, output_voltage, battery_pct, load_pct, runtime_min
   */
  async handleExport(body = {}) {
    try {
      const { dataDir, upsName } = this._resolveContext(body);
      return { success: true, upsName, ...telemetryStore.buildHistoryCsv(dataDir, upsName) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * POST /export-30d
   * Body: { upsName?: string }
   *
   * Aggregates all available daily log files for the UPS into a single CSV.
   * Files are sorted oldest → newest so the output is chronological.
   * Duplicate header rows are stripped — only one header appears at the top.
   *
   * Response:
   *   { success: true,  upsName, filename, csv }
   *   { success: false, error }
   *
   * CSV columns: timestamp, input_voltage, output_voltage, battery_pct, load_pct, runtime_min
   * (older 4-column daily logs are remapped, leaving battery_pct/runtime_min blank)
   */
  async handleExport30d(body = {}) {
    try {
      const { dataDir, upsName } = this._resolveContext(body);
      return { success: true, upsName, ...telemetryStore.build30dCsv(dataDir, upsName) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * POST /logs
   * Body: { upsName?: string }
   *
   * Lists the available 30-day daily log files for the given UPS,
   * newest first.
   *
   * Response:
   *   { success: true, upsName, files: [{ filename, date, sizeBytes }] }
   *   { success: false, error }
   */
  async handleLogs(body = {}) {
    try {
      const { dataDir, upsName } = this._resolveContext(body);
      return { success: true, upsName, files: telemetryStore.listLogs(dataDir, upsName) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * POST /outages
   * Body: { upsName?: string }
   *
   * Returns latest outage plus timeline events, newest first.
   */
  async handleOutages(body = {}) {
    try {
      const { dataDir, upsName } = this._resolveContext(body);
      return { success: true, upsName, ...telemetryStore.readOutages(dataDir, upsName) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * POST /outages/acknowledge
   * Body: { upsName?: string }
   *
   * Marks the latest outage as acknowledged without deleting history.
   */
  async handleOutagesAcknowledge(body = {}) {
    try {
      const { dataDir, upsName } = this._resolveContext(body);
      return { success: true, upsName, ...telemetryStore.acknowledgeLatestOutage(dataDir, upsName) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * POST /outages/clear
   * Body: { upsName?: string }
   *
   * Clears outage timeline events only; telemetry CSV logs are retained.
   */
  async handleOutagesClear(body = {}) {
    try {
      const { dataDir, upsName } = this._resolveContext(body);
      return { success: true, upsName, ...telemetryStore.clearOutages(dataDir, upsName) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * POST /outages/export
   * Body: { upsName?: string }
   *
   * Returns outage timeline events as CSV for sharing/download.
   */
  async handleOutagesExport(body = {}) {
    try {
      const { dataDir, upsName } = this._resolveContext(body);
      return { success: true, upsName, ...telemetryStore.buildOutageCsv(dataDir, upsName) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * POST /logs/download
   * Body: { upsName?: string, filename: string }
   *
   * Returns the raw CSV content of one daily log file.
   * filename is validated to prevent directory traversal.
   *
   * Response:
   *   { success: true, filename, csv }
   *   { success: false, error }
   */
  async handleLogsDownload(body = {}) {
    try {
      const { dataDir } = this._resolveContext(body);
      return telemetryStore.readLogFile(dataDir, body.filename);
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

new NUTUiServer();
