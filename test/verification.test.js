'use strict';

/**
 * test/verification.test.js
 *
 * Homebridge "Verified by Homebridge" regression guard.
 *
 * The external Homebridge verifier (homebridge/plugins#1068) boots the plugin
 * with the BARE-MINIMUM config — `{ "platform": "NUTDashboard" }` — in a
 * throwaway storage directory and then tears that directory down. It has broken
 * repeatedly after refactors because nothing in CI reproduced it. This file is
 * that reproduction: it fails the build the moment a change would make the
 * plugin crash on a minimal-config startup or write files where the verifier
 * doesn't expect them.
 *
 * See docs/VERIFICATION.md and .github/AGENTS.md ("Homebridge Verification —
 * must not regress").
 *
 * Two layers are checked:
 *   1. Static manifest rules that have regressed before (config.schema `required`
 *      must be an array; `homebridge` must stay a devDependency; no install
 *      hooks; pluginAlias must match PLATFORM_NAME).
 *   2. A live minimal-config startup: construct the platform and fire
 *      `didFinishLaunching` with no reachable NUT server, asserting it neither
 *      throws nor leaves any file behind in the storage root.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');

// ── Minimal HAP / Homebridge mock (mirrors test/platform.test.js) ─────────────

class MockService {
  constructor(name) { this.name = name; this._ch = {}; }
  updateCharacteristic(Char, value) { this._ch[Char.__name || Char] = value; return this; }
  setCharacteristic(Char, value)    { return this.updateCharacteristic(Char, value); }
  get(charName)                     { return this._ch[charName]; }
}

function makeServiceClass(serviceName) {
  const cls = class extends MockService {
    constructor(displayName) { super(displayName || serviceName); }
  };
  Object.defineProperty(cls, 'name', { value: serviceName });
  return cls;
}

function makeChar(name, statics = {}) { return { __name: name, ...statics }; }

const Characteristic = {
  Manufacturer:             makeChar('Manufacturer'),
  Model:                    makeChar('Model'),
  SerialNumber:             makeChar('SerialNumber'),
  BatteryLevel:             makeChar('BatteryLevel'),
  StatusLowBattery:         makeChar('StatusLowBattery', { BATTERY_LEVEL_LOW: 1, BATTERY_LEVEL_NORMAL: 0 }),
  ChargingState:            makeChar('ChargingState', { CHARGING: 1, NOT_CHARGING: 0 }),
  On:                       makeChar('On'),
  OutletInUse:              makeChar('OutletInUse'),
  OccupancyDetected:        makeChar('OccupancyDetected', { OCCUPANCY_DETECTED: 1, OCCUPANCY_NOT_DETECTED: 0 }),
  Brightness:               makeChar('Brightness'),
  CurrentAmbientLightLevel: makeChar('CurrentAmbientLightLevel'),
  CurrentTemperature:       makeChar('CurrentTemperature'),
};

const Service = {
  AccessoryInformation: makeServiceClass('AccessoryInformation'),
  Battery:              makeServiceClass('Battery'),
  Outlet:               makeServiceClass('Outlet'),
  OccupancySensor:      makeServiceClass('OccupancySensor'),
  Lightbulb:            makeServiceClass('Lightbulb'),
  LightSensor:          makeServiceClass('LightSensor'),
  TemperatureSensor:    makeServiceClass('TemperatureSensor'),
};

function makeMockAccessory() {
  const serviceMap = new Map();
  const key = (ServiceType, subtype) => (subtype ? `${ServiceType.name}:${subtype}` : ServiceType.name);

  const infoSvc = new Service.AccessoryInformation();
  infoSvc.setCharacteristic = () => infoSvc;
  serviceMap.set('AccessoryInformation', infoSvc);

  return {
    _services: serviceMap,
    UUID: 'mock-uuid',
    getService(ServiceType)              { return serviceMap.get(ServiceType.name) || null; },
    getServiceById(ServiceType, subtype) { return serviceMap.get(key(ServiceType, subtype)) || null; },
    addService(ServiceType, displayName, subtype) {
      const svc = new ServiceType(displayName);
      serviceMap.set(key(ServiceType, subtype), svc);
      return svc;
    },
  };
}

function makeMockApi() {
  return {
    hap: { Characteristic, Service, uuid: { generate: () => 'mock-uuid' } },
    on: jest.fn(),
    registerPlatform:            jest.fn(),
    registerPlatformAccessories: jest.fn(),
    platformAccessory: class { constructor(_n, _u) { return makeMockAccessory(); } },
  };
}

const makeMockLog = () => ({ info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn() });

const flushPromises = () => new Promise(resolve => setImmediate(resolve));

// Load index.js fresh and capture the registered platform class.
function loadPlatform() {
  jest.resetModules();
  jest.doMock('../lib/nutClient', () => ({
    queryNUT:    jest.fn(),
    listInstCmds: jest.fn(),
    listRWVars:  jest.fn(),
    sendInstCmd: jest.fn(),
    setVar:      jest.fn(),
  }));
  let PlatformClass;
  const fakeApi = {
    hap: { Characteristic, Service, uuid: { generate: () => 'mock-uuid' } },
    on: jest.fn(),
    registerPlatform: (_p, _n, Cls) => { PlatformClass = Cls; },
    registerPlatformAccessories: jest.fn(),
    platformAccessory: class { constructor(_n, _u) { return makeMockAccessory(); } },
  };
  require('../index')(fakeApi);
  return { NUTDashboardPlatform: PlatformClass, nutClient: require('../lib/nutClient') };
}

// List everything under a directory (files + dirs), relative paths, recursively.
function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = entry.name;
    out.push(rel);
    if (entry.isDirectory()) {
      for (const child of walk(path.join(dir, entry.name))) out.push(path.join(rel, child));
    }
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. Static manifest rules (no runtime) — these have each regressed before.
// ══════════════════════════════════════════════════════════════════════════════

describe('Verification: static manifest rules', () => {
  const pkg    = require('../package.json');
  const schema = require('../config.schema.json');

  test('homebridge is a devDependency, never a runtime dependency', () => {
    expect(Object.keys(pkg.dependencies || {})).not.toContain('homebridge');
    expect(pkg.devDependencies && pkg.devDependencies.homebridge).toBeTruthy();
  });

  test('no install hooks (postinstall/preinstall/install)', () => {
    const scripts = pkg.scripts || {};
    expect(scripts.preinstall).toBeUndefined();
    expect(scripts.install).toBeUndefined();
    expect(scripts.postinstall).toBeUndefined();
  });

  test('config.schema pluginAlias matches the platform name', () => {
    expect(schema.pluginAlias).toBe('NUTDashboard');
    expect(schema.pluginType).toBe('platform');
  });

  test('every config.schema "required" is an array (not a per-field boolean)', () => {
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Object.prototype.hasOwnProperty.call(node, 'required')) {
        expect(Array.isArray(node.required)).toBe(true);
      }
      for (const v of Object.values(node)) {
        if (v && typeof v === 'object') visit(v);
      }
    };
    visit(schema);
  });

  test('engines declares Node and a Homebridge range', () => {
    expect(pkg.engines && pkg.engines.node).toBeTruthy();
    expect(pkg.engines && pkg.engines.homebridge).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Minimal-config startup smoke test — reproduces the verifier boot.
// ══════════════════════════════════════════════════════════════════════════════

describe('Verification: minimal-config startup', () => {
  let tmpRoot;
  let prevStoragePath;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hbups-verify-'));
    prevStoragePath = process.env.UIX_STORAGE_PATH;
    process.env.UIX_STORAGE_PATH = tmpRoot;
    // Prevent the self-scheduling poll loop from leaking a real timer.
    jest.spyOn(global, 'setTimeout').mockReturnValue(1);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (prevStoragePath === undefined) delete process.env.UIX_STORAGE_PATH;
    else process.env.UIX_STORAGE_PATH = prevStoragePath;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  // Boot with the exact config the verifier uses and no reachable NUT server.
  async function bootMinimal() {
    const { NUTDashboardPlatform, nutClient } = loadPlatform();
    nutClient.queryNUT.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:3493'));

    const api = makeMockApi();
    let launchCb;
    api.on.mockImplementation((event, cb) => { if (event === 'didFinishLaunching') launchCb = cb; });

    let platform;
    expect(() => {
      platform = new NUTDashboardPlatform(makeMockLog(), { platform: 'NUTDashboard' }, api);
    }).not.toThrow();

    expect(typeof launchCb).toBe('function');
    await expect(Promise.resolve().then(() => launchCb())).resolves.not.toThrow();
    await flushPromises();
    return platform;
  }

  test('constructs and finishes launching without throwing', async () => {
    const platform = await bootMinimal();
    expect(platform).toBeDefined();
    // A handled NUT connection failure may be logged (that IS the graceful
    // behaviour the verifier wants); the guard here is that startup never throws.
  });

  test('writes nothing to the storage root when no NUT server is reachable', async () => {
    await bootMinimal();
    // The verifier tears the storage dir down with a non-recursive rmdir; the
    // plugin must leave the root empty when it has no data to persist.
    expect(walk(tmpRoot)).toEqual([]);
    expect(() => fs.rmdirSync(tmpRoot)).not.toThrow();
  });

  test('when a UPS does respond, files stay inside the storage subdir', async () => {
    const { NUTDashboardPlatform, nutClient } = loadPlatform();
    nutClient.queryNUT.mockResolvedValue({
      'ups.status': 'OL', 'battery.charge': 90, 'battery.runtime': 3600,
      'ups.load': 20, 'input.voltage': 230, 'output.voltage': 230,
    });

    const api = makeMockApi();
    let launchCb;
    api.on.mockImplementation((event, cb) => { if (event === 'didFinishLaunching') launchCb = cb; });
    new NUTDashboardPlatform(makeMockLog(), { platform: 'NUTDashboard' }, api);
    launchCb();
    await flushPromises();

    // Anything written must live under <storage>/homebridge-ups-monitor/ —
    // never the storage root directly, never outside the storage dir.
    for (const rel of walk(tmpRoot)) {
      expect(rel === 'homebridge-ups-monitor' || rel.startsWith(`homebridge-ups-monitor${path.sep}`)).toBe(true);
    }
  });
});
