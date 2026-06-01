'use strict';

/**
 * lib/nutParser.js
 *
 * Pure utility functions for parsing NUT (Network UPS Tools) protocol responses.
 * Kept side-effect-free so they can be unit-tested without any network or
 * Homebridge dependency.
 */

/**
 * Parse a raw NUT response buffer into a plain key→value object.
 *
 * Handles response lines of the form:
 *   VAR <upsName> <variable> "<value>"
 *
 * Numeric strings are coerced to numbers; everything else stays as a string.
 * Non-VAR lines (OK, ERR, OK Goodbye, etc.) are silently ignored.
 *
 * @param {string} buffer  Raw text accumulated from the upsd TCP socket
 * @returns {Object}       e.g. { 'input.voltage': 230.5, 'ups.status': 'OL' }
 */
function parseNUTResponse(buffer) {
  const result = {};
  for (const line of String(buffer || '').split('\n')) {
    // NUT wire format: VAR <ups> <variable> "<value>"
    const m = line.match(/^VAR \S+ (\S+) "(.*)"/);
    if (m) {
      const raw = m[2];
      result[m[1]] = (raw !== '' && !isNaN(raw)) ? parseFloat(raw) : raw;
    }
  }
  return result;
}

/**
 * Parse a NUT ups.status string into discrete boolean flags.
 *
 * Common NUT status tokens:
 *   OL      — On line (mains power present)
 *   OB      — On battery
 *   LB      — Low battery
 *   CHRG    — Battery charging
 *   DISCHRG — Battery discharging
 *   BYPASS  — On bypass
 *   CAL     — Performing calibration
 *   OFF     — UPS is off
 *   OVER    — Overloaded
 *   TRIM    — Trimming incoming voltage
 *   BOOST   — Boosting incoming voltage
 *   FSD     — Forced shutdown
 *
 * @param {string} statusStr  e.g. "OL CHRG" or "OB LB"
 * @returns {{ onLine, onBattery, lowBattery, charging, discharging, raw }}
 */
function parseStatusFlags(statusStr) {
  const s = String(statusStr || '').toUpperCase();
  const has = token => s.split(/\s+/).includes(token);
  return {
    onLine:      has('OL'),
    onBattery:   has('OB'),
    lowBattery:  has('LB'),
    charging:    has('CHRG') && !has('DISCHRG'),
    discharging: has('DISCHRG'),
    raw:         s.trim(),
  };
}


/**
 * Parse a `LIST CMD <ups>` response into an array of instant-command names.
 * Lines look like:  CMD <ups> beeper.disable
 *
 * @param {string} buffer
 * @returns {string[]}  e.g. ['beeper.enable', 'beeper.disable', 'load.off']
 */
function parseInstCmds(buffer) {
  const cmds = [];
  for (const line of String(buffer || '').split('\n')) {
    const m = line.match(/^CMD \S+ (\S+)/);
    if (m) cmds.push(m[1]);
  }
  return cmds;
}

/**
 * Parse a `LIST RW <ups>` response into an array of writable variable names.
 * Lines look like:  RW <ups> battery.charge.low "20"
 *
 * @param {string} buffer
 * @returns {string[]}  e.g. ['battery.charge.low', 'ups.delay.shutdown']
 */
function parseRWVars(buffer) {
  const vars = [];
  for (const line of String(buffer || '').split('\n')) {
    const m = line.match(/^RW \S+ (\S+)/);
    if (m) vars.push(m[1]);
  }
  return vars;
}

/**
 * Interpret an upsd reply to a control command (INSTCMD / SET VAR).
 * upsd answers `OK` on success or `ERR <reason>` on failure (per line).
 * Auth lines (USERNAME/PASSWORD) also return `OK`, so we treat the presence of
 * ANY `ERR` line as failure and otherwise require at least one `OK`.
 *
 * @param {string} buffer
 * @returns {{ ok: boolean, message: string }}
 */
function parseCommandResult(buffer) {
  const lines = String(buffer || '').split('\n').map(l => l.trim()).filter(Boolean);
  const err = lines.find(l => l.startsWith('ERR'));
  if (err) return { ok: false, message: err.replace(/^ERR\s*/, '') || 'ERR' };
  const ok = lines.some(l => l === 'OK' || l.startsWith('OK '));
  return { ok, message: ok ? 'OK' : 'no response' };
}

module.exports = { parseNUTResponse, parseStatusFlags, parseInstCmds, parseRWVars, parseCommandResult };
