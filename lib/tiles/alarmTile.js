'use strict';

/**
 * lib/tiles/alarmTile.js
 *
 * Audible-alarm (beeper) control tile — opt-in, write-capable.
 *
 * HAP service: Switch ("<ups> Alarm")
 *   On = true  → enable the UPS beeper  (INSTCMD beeper.enable)
 *   On = false → disable the UPS beeper (INSTCMD beeper.disable)
 *
 * The switch state is reflected from `ups.beeper.status` on every poll
 * ("enabled" / "disabled" / "muted"). Control commands are sent via the
 * caller-supplied `sendCommand(enable)` callback so this module stays free of
 * any direct network dependency (and is unit-testable).
 *
 * Unlike the read-only sensor tiles, this writes to the UPS, so index.js only
 * registers it when (a) the user opts in via config and (b) the device
 * advertises the beeper commands.
 *
 * @param {object} accessory  Homebridge platformAccessory
 * @param {object} api        Homebridge API
 * @param {string} upsName    UPS identifier
 * @param {object} opts
 * @param {(enable:boolean)=>Promise<{ok:boolean,message:string}>} opts.sendCommand
 * @param {object} [opts.log] logger (defaults to console)
 * @returns {{ update(data: object): void }}
 */
module.exports = function setupAlarmTile(accessory, api, upsName, opts = {}) {
  const { Characteristic, Service } = api.hap;
  const sendCommand = opts.sendCommand;
  const log = opts.log || console;

  let svc = accessory.getService(Service.Switch);
  if (!svc) {
    svc = accessory.addService(Service.Switch, `${upsName} Alarm`);
  }

  let cachedOn = false;

  const ch = svc.getCharacteristic(Characteristic.On);
  ch.onGet(() => cachedOn);
  ch.onSet(async (value) => {
    const enable = !!value;
    try {
      const res = await sendCommand(enable);
      if (res && res.ok) {
        cachedOn = enable;
      } else {
        const msg = (res && res.message) || 'unknown error';
        log.warn(`[${upsName}] Alarm ${enable ? 'enable' : 'disable'} failed: ${msg}`);
        // Revert the visible state since the UPS rejected the change.
        setTimeout(() => svc.updateCharacteristic(Characteristic.On, cachedOn), 250);
      }
    } catch (err) {
      log.warn(`[${upsName}] Alarm command error: ${err.message}`);
      setTimeout(() => svc.updateCharacteristic(Characteristic.On, cachedOn), 250);
    }
  });

  return {
    update(data) {
      const st = data && data['ups.beeper.status'];
      if (st !== undefined && st !== null) {
        cachedOn = String(st).toLowerCase() === 'enabled';
        svc.updateCharacteristic(Characteristic.On, cachedOn);
      }
    },
  };
};
