'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { DATA_SUBDIR, resolveDataDir, migrateLegacyFiles } = require('../lib/storagePaths');

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'storagepaths-')); }

describe('resolveDataDir', () => {
  test('returns the plugin subdirectory under the storage path', () => {
    expect(resolveDataDir('/var/lib/homebridge')).toBe(path.join('/var/lib/homebridge', DATA_SUBDIR));
  });
});

describe('migrateLegacyFiles', () => {
  test('moves legacy root data files into the data dir', () => {
    const root = tmpDir();
    fs.writeFileSync(path.join(root, 'ups-history-ups.json'), '{}', 'utf8');
    fs.writeFileSync(path.join(root, 'ups-log-ups-2026-01-01.csv'), 'h\n', 'utf8');
    fs.writeFileSync(path.join(root, 'config.json'), '{}', 'utf8'); // must NOT move

    const dataDir = resolveDataDir(root);
    const moved = migrateLegacyFiles(root, dataDir, { info: () => {}, warn: () => {} });

    expect(moved).toBe(2);
    expect(fs.existsSync(path.join(dataDir, 'ups-history-ups.json'))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, 'ups-log-ups-2026-01-01.csv'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'ups-history-ups.json'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'config.json'))).toBe(true); // untouched
    fs.rmSync(root, { recursive: true });
  });

  test('drops a stale root copy when the data dir already has the file', () => {
    const root = tmpDir();
    const dataDir = resolveDataDir(root);
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'ups-history-ups.json'), 'new', 'utf8');
    fs.writeFileSync(path.join(root, 'ups-history-ups.json'), 'stale', 'utf8');

    const moved = migrateLegacyFiles(root, dataDir, null);
    expect(moved).toBe(0);
    expect(fs.existsSync(path.join(root, 'ups-history-ups.json'))).toBe(false); // stale removed
    expect(fs.readFileSync(path.join(dataDir, 'ups-history-ups.json'), 'utf8')).toBe('new');
    fs.rmSync(root, { recursive: true });
  });

  test('is a no-op and does not throw when the storage path is missing', () => {
    const missing = path.join(os.tmpdir(), `nope-${Date.now()}`);
    expect(() => migrateLegacyFiles(missing, resolveDataDir(missing), null)).not.toThrow();
  });
});
