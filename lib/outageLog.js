'use strict';

/**
 * lib/outageLog.js
 *
 * File-backed outage timeline for each UPS.
 *
 * An outage starts when NUT status reports the UPS is on battery, updates while
 * the outage remains active, and closes when the UPS returns to line power.
 */

const fs   = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;

class OutageLog {
  constructor(dataDir, upsName, opts = {}) {
    this.dataDir  = dataDir;
    this.upsName  = upsName || 'ups';
    this.log      = opts.log || null;
    this.filePath = path.join(dataDir, `ups-outages-${this.upsName}.json`);
    this._state   = this._load();
  }

  record(sample = {}) {
    const timestamp = _iso(sample.t);
    const flags = sample.flags || {};
    const battery = _numOrNull(sample.batteryCharge);
    const active = this._active();

    if (flags.onBattery) {
      if (active) {
        this._updateActive(active, battery, flags);
      } else {
        this._state.events.push({
          id: timestamp,
          upsName: this.upsName,
          start: timestamp,
          end: null,
          durationSec: null,
          ongoing: true,
          acknowledged: false,
          acknowledgedAt: null,
          startBattery: battery,
          endBattery: null,
          lowestBattery: battery,
          lowBattery: Boolean(flags.lowBattery),
        });
      }
      this._flush();
      return this.latest();
    }

    if (active) {
      this._updateActive(active, battery, flags);
      active.end = timestamp;
      active.endBattery = battery;
      active.ongoing = false;
      active.durationSec = _durationSec(active.start, active.end);
      this._flush();
    }

    return this.latest();
  }

  list() {
    return [...this._state.events].reverse().map(_cloneEvent);
  }

  latest() {
    const event = this._state.events[this._state.events.length - 1];
    return event ? _cloneEvent(event) : null;
  }

  acknowledgeLatest(timestamp = new Date().toISOString()) {
    const event = this._state.events[this._state.events.length - 1];
    if (!event) return false;

    event.acknowledged = true;
    event.acknowledgedAt = _iso(timestamp);
    this._flush();
    return true;
  }

  clear() {
    const count = this._state.events.length;
    this._state.events = [];
    this._flush();
    return count;
  }

  _active() {
    const event = this._state.events[this._state.events.length - 1];
    return event && event.ongoing ? event : null;
  }

  _updateActive(event, battery, flags) {
    if (battery != null) {
      if (event.lowestBattery == null || battery < event.lowestBattery) {
        event.lowestBattery = battery;
      }
    }
    if (flags.lowBattery) event.lowBattery = true;
  }

  _load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const data = JSON.parse(raw);
      if (data.v !== SCHEMA_VERSION || !Array.isArray(data.events)) {
        this._warn('Outage event file is invalid; starting with an empty timeline.');
        return this._fresh();
      }
      return {
        v: SCHEMA_VERSION,
        events: data.events.filter(event => event && typeof event === 'object'),
      };
    } catch (err) {
      if (fs.existsSync(this.filePath)) {
        this._warn(`Could not read outage event file; starting with an empty timeline: ${err.message}`);
      }
      return this._fresh();
    }
  }

  _fresh() {
    return { v: SCHEMA_VERSION, events: [] };
  }

  _flush() {
    const tmp = this.filePath + '.tmp';
    try {
      if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(this._state), 'utf8');
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      this._warn(`Could not write outage event file: ${err.message}`);
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    }
  }

  _warn(message) {
    if (this.log && typeof this.log.warn === 'function') {
      this.log.warn(`[${this.upsName}] ${message}`);
    }
  }
}

function _iso(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function _numOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function _durationSec(start, end) {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return Math.max(0, Math.round((endMs - startMs) / 1000));
}

function _cloneEvent(event) {
  return { ...event };
}

module.exports = OutageLog;
