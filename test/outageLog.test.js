'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const OutageLog = require('../lib/outageLog');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'outage-test-'));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

describe('OutageLog', () => {
  test('starts an outage when the UPS switches to battery', () => {
    const dir = tmpDir();
    const log = new OutageLog(dir, 'ups');

    log.record({
      t: '2026-06-05T01:00:00.000Z',
      flags: { onBattery: true, lowBattery: false },
      batteryCharge: 92,
    });

    const outage = log.latest();
    expect(outage).toMatchObject({
      upsName: 'ups',
      start: '2026-06-05T01:00:00.000Z',
      end: null,
      ongoing: true,
      acknowledged: false,
      startBattery: 92,
      endBattery: null,
      lowestBattery: 92,
      lowBattery: false,
    });
    expect(log.list()).toHaveLength(1);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('does not create duplicate outages during repeated on-battery polls', () => {
    const dir = tmpDir();
    const log = new OutageLog(dir, 'ups');

    log.record({ t: '2026-06-05T01:00:00.000Z', flags: { onBattery: true, lowBattery: false }, batteryCharge: 90 });
    log.record({ t: '2026-06-05T01:01:00.000Z', flags: { onBattery: true, lowBattery: false }, batteryCharge: 88 });
    log.record({ t: '2026-06-05T01:02:00.000Z', flags: { onBattery: true, lowBattery: true }, batteryCharge: 18 });

    const events = log.list();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      start: '2026-06-05T01:00:00.000Z',
      end: null,
      ongoing: true,
      startBattery: 90,
      lowestBattery: 18,
      lowBattery: true,
    });

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('completes an active outage when the UPS returns online', () => {
    const dir = tmpDir();
    const log = new OutageLog(dir, 'ups');

    log.record({ t: '2026-06-05T01:00:00.000Z', flags: { onBattery: true, lowBattery: false }, batteryCharge: 90 });
    log.record({ t: '2026-06-05T01:05:30.000Z', flags: { onBattery: false, lowBattery: false }, batteryCharge: 84 });

    const outage = log.latest();
    expect(outage).toMatchObject({
      start: '2026-06-05T01:00:00.000Z',
      end: '2026-06-05T01:05:30.000Z',
      ongoing: false,
      durationSec: 330,
      startBattery: 90,
      endBattery: 84,
      lowestBattery: 84,
    });

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('loads and resumes an active outage after restart', () => {
    const dir = tmpDir();
    new OutageLog(dir, 'ups')
      .record({ t: '2026-06-05T01:00:00.000Z', flags: { onBattery: true, lowBattery: false }, batteryCharge: 90 });

    const reloaded = new OutageLog(dir, 'ups');
    reloaded.record({ t: '2026-06-05T01:04:00.000Z', flags: { onBattery: true, lowBattery: false }, batteryCharge: 72 });
    reloaded.record({ t: '2026-06-05T01:08:00.000Z', flags: { onBattery: false, lowBattery: false }, batteryCharge: 70 });

    const outage = reloaded.latest();
    expect(outage).toMatchObject({
      start: '2026-06-05T01:00:00.000Z',
      end: '2026-06-05T01:08:00.000Z',
      durationSec: 480,
      lowestBattery: 70,
    });
    expect(reloaded.list()).toHaveLength(1);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('acknowledges the latest outage without deleting it', () => {
    const dir = tmpDir();
    const log = new OutageLog(dir, 'ups');
    log.record({ t: '2026-06-05T01:00:00.000Z', flags: { onBattery: true, lowBattery: false }, batteryCharge: 90 });
    log.record({ t: '2026-06-05T01:03:00.000Z', flags: { onBattery: false, lowBattery: false }, batteryCharge: 88 });

    const acknowledged = log.acknowledgeLatest('2026-06-05T01:04:00.000Z');

    expect(acknowledged).toBe(true);
    expect(log.latest()).toMatchObject({
      acknowledged: true,
      acknowledgedAt: '2026-06-05T01:04:00.000Z',
    });
    expect(log.list()).toHaveLength(1);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('clear removes stored outage history', () => {
    const dir = tmpDir();
    const log = new OutageLog(dir, 'ups');
    log.record({ t: '2026-06-05T01:00:00.000Z', flags: { onBattery: true, lowBattery: false }, batteryCharge: 90 });

    const cleared = log.clear();

    expect(cleared).toBe(1);
    expect(log.list()).toEqual([]);
    expect(log.latest()).toBe(null);
    expect(readJson(path.join(dir, 'ups-outages-ups.json')).events).toEqual([]);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('malformed event files degrade to an empty log', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'ups-outages-ups.json'), '{not json', 'utf8');

    const log = new OutageLog(dir, 'ups');

    expect(log.list()).toEqual([]);
    expect(log.latest()).toBe(null);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
