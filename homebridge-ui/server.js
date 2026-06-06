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
 *
 * The /history, /export, /export-30d, /logs and /outages* endpoints share a
 * single handler driven by telemetryStore.TELEMETRY_ROUTES, so this transport
 * and the standalone server (lib/dashboardServer.js) stay in lockstep. The
 * /ups-status and /logs/download endpoints have transport-specific behaviour and
 * are handled directly.
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
    this.onRequest('/ups-status',    this.handleUpsStatus.bind(this));
    this.onRequest('/logs/download', this.handleLogsDownload.bind(this));
    // Every other telemetry endpoint shares one handler (see telemetryStore.TELEMETRY_ROUTES).
    for (const route of Object.keys(telemetryStore.TELEMETRY_ROUTES)) {
      this.onRequest(route, body => this._handleTelemetry(route, body));
    }
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

  // ── Shared helpers ──────────────────────────────────────────────────────────

  /**
   * Resolve storagePath, dataDir and upsName from the request body, falling back
   * to the first UPS in config.json when the body omits upsName.
   * @returns {{ storagePath: string, dataDir: string, upsName: string }}
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
   * Generic handler for the telemetry endpoints in telemetryStore.TELEMETRY_ROUTES
   * (/history, /export, /export-30d, /logs, /outages*). Resolves context and
   * merges the route's payload into the success envelope.
   */
  _handleTelemetry(route, body = {}) {
    try {
      const { dataDir, upsName } = this._resolveContext(body);
      const payload = telemetryStore.TELEMETRY_ROUTES[route](telemetryStore, dataDir, upsName);
      return { success: true, upsName, ...payload };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ── Named endpoint methods ──────────────────────────────────────────────────
  // Thin wrappers over _handleTelemetry: they name the public surface and let
  // the endpoint↔payload wiring live once in telemetryStore.TELEMETRY_ROUTES.

  handleHistory(body)            { return this._handleTelemetry('/history', body); }
  handleExport(body)             { return this._handleTelemetry('/export', body); }
  handleExport30d(body)          { return this._handleTelemetry('/export-30d', body); }
  handleLogs(body)               { return this._handleTelemetry('/logs', body); }
  handleOutages(body)            { return this._handleTelemetry('/outages', body); }
  handleOutagesAcknowledge(body) { return this._handleTelemetry('/outages/acknowledge', body); }
  handleOutagesClear(body)       { return this._handleTelemetry('/outages/clear', body); }
  handleOutagesExport(body)      { return this._handleTelemetry('/outages/export', body); }

  /**
   * POST /logs/download
   * Body: { upsName?: string, filename: string }
   *
   * Returns the raw CSV content of one daily log file. filename is validated by
   * telemetryStore.readLogFile to prevent directory traversal.
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
