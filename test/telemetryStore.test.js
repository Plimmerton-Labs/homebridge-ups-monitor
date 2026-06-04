'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const store = require('../lib/telemetryStore');
const RingBuffer = require('../lib/ringBuffer');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tstore-'));
}

function seedRing(dir, upsName, points) {
  const buf = new RingBuffer(path.join(dir, `ups-history-${upsName}.json`), 1440);
  points.forEach(p => buf.push(p));
}

function writeLog(dir, name, content) {
  fs.writeFileSync(path.join(dir, name), content, 'utf8');
}

describe('telemetryStore.readHistory', () => {
  test('returns ring-buffer points oldest -> newest', () => {
    const dir = tmpDir();
    seedRing(dir, 'ups', [
      { t: '2024-01-01T00:00:00.000Z', inV: 230, outV: 229, bat: 100, load: 10, runtime: 1200 },
      { t: '2024-01-01T00:00:30.000Z', inV: 231, outV: 230, bat: 99,  load: 11, runtime: 1100 },
    ]);
    const pts = store.readHistory(dir, 'ups');
    expect(pts).toHaveLength(2);
    expect(pts[0].inV).toBe(230);
    expect(pts[1].bat).toBe(99);
    fs.rmSync(dir, { recursive: true });
  });

  test('returns [] when no history file exists', () => {
    const dir = tmpDir();
    expect(store.readHistory(dir, 'ups')).toEqual([]);
    fs.rmSync(dir, { recursive: true });
  });
});

describe('telemetryStore.buildHistoryCsv', () => {
  test('emits the unified header and converts runtime to minutes', () => {
    const dir = tmpDir();
    seedRing(dir, 'ups', [
      { t: '2024-01-01T00:00:00.000Z', inV: 230, outV: 229, bat: 100, load: 10, runtime: 1110 },
    ]);
    const { filename, csv } = store.buildHistoryCsv(dir, 'ups');
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('timestamp,input_voltage,output_voltage,battery_pct,load_pct,runtime_min');
    expect(lines[1]).toBe('2024-01-01T00:00:00.000Z,230,229,100,10,18.50');
    expect(filename).toMatch(/^ups-ups-\d{4}-\d{2}-\d{2}\.csv$/);
    fs.rmSync(dir, { recursive: true });
  });
});

describe('telemetryStore.build30dCsv', () => {
  test('header-only CSV when no daily logs exist', () => {
    const dir = tmpDir();
    const { csv } = store.build30dCsv(dir, 'ups');
    expect(csv.trim()).toBe('timestamp,input_voltage,output_voltage,battery_pct,load_pct,runtime_min');
    fs.rmSync(dir, { recursive: true });
  });

  test('remaps old 4-column and new 6-column files into the unified schema', () => {
    const dir = tmpDir();
    writeLog(dir, 'ups-log-ups-2024-01-01.csv',
      'timestamp,input_voltage,output_voltage,load_pct\n2024-01-01T00:00:00.000Z,230,228,10\n');
    writeLog(dir, 'ups-log-ups-2024-01-02.csv',
      'timestamp,input_voltage,output_voltage,battery_pct,load_pct,runtime_min\n2024-01-02T00:00:00.000Z,229,227,95,12,18.50\n');
    const { csv } = store.build30dCsv(dir, 'ups');
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('timestamp,input_voltage,output_voltage,battery_pct,load_pct,runtime_min');
    expect(lines).toContain('2024-01-01T00:00:00.000Z,230,228,,10,');
    expect(lines).toContain('2024-01-02T00:00:00.000Z,229,227,95,12,18.50');
    fs.rmSync(dir, { recursive: true });
  });
});

describe('telemetryStore.listLogs', () => {
  test('lists matching files newest first and ignores other UPS files', () => {
    const dir = tmpDir();
    ['2024-01-01', '2024-01-03', '2024-01-02'].forEach(d =>
      writeLog(dir, `ups-log-ups-${d}.csv`, 'header\nrow\n'));
    writeLog(dir, 'ups-log-other-2024-01-01.csv', 'header\nrow\n');
    const files = store.listLogs(dir, 'ups');
    expect(files.map(f => f.date)).toEqual(['2024-01-03', '2024-01-02', '2024-01-01']);
    expect(files[0]).toHaveProperty('sizeBytes');
    fs.rmSync(dir, { recursive: true });
  });

  test('returns [] when the directory does not exist', () => {
    expect(store.listLogs(path.join(os.tmpdir(), 'does-not-exist-xyz'), 'ups')).toEqual([]);
  });
});

describe('telemetryStore.readLogFile', () => {
  test('returns csv for a valid filename', () => {
    const dir = tmpDir();
    writeLog(dir, 'ups-log-ups-2024-01-01.csv', 'timestamp,input_voltage\n2024-01-01T00:00Z,230\n');
    const r = store.readLogFile(dir, 'ups-log-ups-2024-01-01.csv');
    expect(r.success).toBe(true);
    expect(r.csv).toContain('timestamp,input_voltage');
    fs.rmSync(dir, { recursive: true });
  });

  test('rejects a missing filename', () => {
    expect(store.readLogFile(tmpDir(), '')).toEqual({ success: false, error: 'filename is required' });
  });

  test('rejects a traversal / invalid filename', () => {
    expect(store.readLogFile(tmpDir(), '../../etc/passwd'))
      .toEqual({ success: false, error: 'Invalid filename' });
  });

  test('reports a not-found file', () => {
    const dir = tmpDir();
    expect(store.readLogFile(dir, 'ups-log-ups-2024-12-31.csv'))
      .toEqual({ success: false, error: 'File not found' });
    fs.rmSync(dir, { recursive: true });
  });
});
