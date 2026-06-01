'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { DATA_SUBDIR, resolveDataDir, migrateLegacyFiles, migrateLegacyLocations } = require('../lib/storagePaths');

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

describe('migrateLegacyLocations', () => {
  const ORIG_ENV = process.env.UIX_STORAGE_PATH;
  afterEach(() => {
    if (ORIG_ENV === undefined) delete process.env.UIX_STORAGE_PATH;
    else process.env.UIX_STORAGE_PATH = ORIG_ENV;
  });

  test('reclaims files from the UIX_STORAGE_PATH subdir into the new data dir', () => {
    const oldRoot = tmpDir();
    const oldData = resolveDataDir(oldRoot);
    fs.mkdirSync(oldData, { recursive: true });
    fs.writeFileSync(path.join(oldData, 'ups-history-reclaim1.json'), 'old', 'utf8');
    process.env.UIX_STORAGE_PATH = oldRoot;

    const newRoot = tmpDir();
    const newData = resolveDataDir(newRoot);
    const moved = migrateLegacyLocations(newData, null);

    expect(moved).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(path.join(newData, 'ups-history-reclaim1.json'))).toBe(true);
    expect(fs.readFileSync(path.join(newData, 'ups-history-reclaim1.json'), 'utf8')).toBe('old');
    expect(fs.existsSync(path.join(oldData, 'ups-history-reclaim1.json'))).toBe(false);
    fs.rmSync(oldRoot, { recursive: true });
    fs.rmSync(newRoot, { recursive: true });
  });

  test('does not clobber files already present in the new data dir', () => {
    const oldRoot = tmpDir();
    const oldData = resolveDataDir(oldRoot);
    fs.mkdirSync(oldData, { recursive: true });
    fs.writeFileSync(path.join(oldData, 'ups-history-reclaim2.json'), 'stale', 'utf8');
    process.env.UIX_STORAGE_PATH = oldRoot;

    const newRoot = tmpDir();
    const newData = resolveDataDir(newRoot);
    fs.mkdirSync(newData, { recursive: true });
    fs.writeFileSync(path.join(newData, 'ups-history-reclaim2.json'), 'current', 'utf8');

    migrateLegacyLocations(newData, null);
    expect(fs.readFileSync(path.join(newData, 'ups-history-reclaim2.json'), 'utf8')).toBe('current');
    expect(fs.existsSync(path.join(oldData, 'ups-history-reclaim2.json'))).toBe(false); // stale dropped
    fs.rmSync(oldRoot, { recursive: true });
    fs.rmSync(newRoot, { recursive: true });
  });

  test('is a no-op and does not throw when no legacy locations exist', () => {
    delete process.env.UIX_STORAGE_PATH;
    const newRoot = tmpDir();
    expect(() => migrateLegacyLocations(resolveDataDir(newRoot), null)).not.toThrow();
    fs.rmSync(newRoot, { recursive: true });
  });
});
