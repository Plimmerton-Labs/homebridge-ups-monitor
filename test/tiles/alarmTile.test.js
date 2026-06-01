'use strict';

const setupAlarmTile = require('../../lib/tiles/alarmTile');

// ── Minimal HAP mock that supports getCharacteristic().onGet/onSet ──────────────
function makeMock() {
  const handlers = {};
  const values = {};
  const characteristic = (name) => ({
    onGet(fn) { handlers[`${name}:get`] = fn; return this; },
    onSet(fn) { handlers[`${name}:set`] = fn; return this; },
  });
  const svc = {
    name: null,
    getCharacteristic: (c) => characteristic(c.__name),
    updateCharacteristic: (c, v) => { values[c.__name] = v; return svc; },
  };
  const Characteristic = { On: { __name: 'On' } };
  const Service = { Switch: function () {} };
  const accessory = {
    _svc: null,
    getService: () => accessory._svc,
    addService: (_S, name) => { accessory._svc = svc; svc.name = name; return svc; },
  };
  const api = { hap: { Characteristic, Service } };
  return { accessory, api, svc, handlers, values, Characteristic };
}

describe('alarmTile', () => {
  test('registers a Switch named "<ups> Alarm"', () => {
    const { accessory, api, svc } = makeMock();
    setupAlarmTile(accessory, api, 'ups', { sendCommand: async () => ({ ok: true }) });
    expect(svc.name).toBe('ups Alarm');
  });

  test('onSet(true) sends enable and caches the new state', async () => {
    const { accessory, api, handlers } = makeMock();
    const calls = [];
    setupAlarmTile(accessory, api, 'ups', {
      sendCommand: async (enable) => { calls.push(enable); return { ok: true }; },
    });
    await handlers['On:set'](true);
    expect(calls).toEqual([true]);
    expect(await handlers['On:get']()).toBe(true);
  });

  test('a failed command does not flip the cached state', async () => {
    const { accessory, api, handlers } = makeMock();
    const log = { warn: jest.fn() };
    setupAlarmTile(accessory, api, 'ups', {
      sendCommand: async () => ({ ok: false, message: 'ACCESS-DENIED' }),
      log,
    });
    await handlers['On:set'](true);
    expect(await handlers['On:get']()).toBe(false);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('ACCESS-DENIED'));
  });

  test('a thrown command error is caught and logged (no throw)', async () => {
    const { accessory, api, handlers } = makeMock();
    const log = { warn: jest.fn() };
    setupAlarmTile(accessory, api, 'ups', {
      sendCommand: async () => { throw new Error('boom'); },
      log,
    });
    await expect(handlers['On:set'](true)).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });

  test('update() reflects ups.beeper.status', () => {
    const { accessory, api, values } = makeMock();
    const tile = setupAlarmTile(accessory, api, 'ups', { sendCommand: async () => ({ ok: true }) });
    tile.update({ 'ups.beeper.status': 'enabled' });
    expect(values.On).toBe(true);
    tile.update({ 'ups.beeper.status': 'disabled' });
    expect(values.On).toBe(false);
  });
});
