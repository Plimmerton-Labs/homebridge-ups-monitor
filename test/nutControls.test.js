'use strict';

/**
 * test/nutControls.test.js
 *
 * Integration tests for the NUT control layer (LIST CMD / LIST RW / INSTCMD /
 * SET VAR) using a mock upsd TCP server. No real NUT installation required.
 */

const net = require('net');
const { listInstCmds, listRWVars, sendInstCmd, setVar } = require('../lib/nutClient');

/**
 * Mock upsd that understands the control verbs. Configurable:
 *   cmds   — instant commands the UPS advertises
 *   rw     — read-write variables advertised
 *   denySet — if true, SET/INSTCMD reply ERR ACCESS-DENIED
 */
function createMockNUT({ cmds = [], rw = [], denySet = false } = {}) {
  return new Promise(resolve => {
    const server = net.createServer(socket => {
      let buf = '';
      socket.on('data', chunk => {
        buf += chunk.toString();
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const raw of lines) {
          const cmd = raw.trim();
          if (!cmd) continue;
          if (cmd === 'LOGOUT') { socket.write('OK Goodbye\n'); socket.end(); return; }
          if (cmd.startsWith('USERNAME') || cmd.startsWith('PASSWORD')) { socket.write('OK\n'); continue; }

          if (cmd.startsWith('LIST CMD')) {
            const ups = cmd.split(/\s+/)[2];
            socket.write(`BEGIN LIST CMD ${ups}\n`);
            cmds.forEach(c => socket.write(`CMD ${ups} ${c}\n`));
            socket.write(`END LIST CMD ${ups}\n`);
            continue;
          }
          if (cmd.startsWith('LIST RW')) {
            const ups = cmd.split(/\s+/)[2];
            socket.write(`BEGIN LIST RW ${ups}\n`);
            rw.forEach(v => socket.write(`RW ${ups} ${v} "0"\n`));
            socket.write(`END LIST RW ${ups}\n`);
            continue;
          }
          if (cmd.startsWith('INSTCMD')) {
            const name = cmd.split(/\s+/)[2];
            if (denySet) socket.write('ERR ACCESS-DENIED\n');
            else if (cmds.includes(name)) socket.write('OK\n');
            else socket.write('ERR CMD-NOT-SUPPORTED\n');
            continue;
          }
          if (cmd.startsWith('SET VAR')) {
            const v = cmd.split(/\s+/)[3];
            if (denySet) socket.write('ERR ACCESS-DENIED\n');
            else if (rw.includes(v)) socket.write('OK\n');
            else socket.write('ERR READONLY\n');
            continue;
          }
          socket.write('ERR UNKNOWN-COMMAND\n');
        }
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function port(server) { return server.address().port; }

describe('NUT control layer', () => {
  let server;
  afterEach(done => { if (server) server.close(done); else done(); });

  test('listInstCmds returns advertised commands', async () => {
    server = await createMockNUT({ cmds: ['beeper.enable', 'beeper.disable', 'load.off'] });
    const cmds = await listInstCmds('127.0.0.1', port(server), 'ups', null, null);
    expect(cmds).toEqual(['beeper.enable', 'beeper.disable', 'load.off']);
  });

  test('listRWVars returns writable variables', async () => {
    server = await createMockNUT({ rw: ['battery.charge.low', 'ups.delay.shutdown'] });
    const rw = await listRWVars('127.0.0.1', port(server), 'ups', 'admin', 'secret');
    expect(rw).toContain('battery.charge.low');
  });

  test('sendInstCmd succeeds for a supported command', async () => {
    server = await createMockNUT({ cmds: ['beeper.disable'] });
    const res = await sendInstCmd('127.0.0.1', port(server), 'ups', 'admin', 'secret', 'beeper.disable');
    expect(res.ok).toBe(true);
  });

  test('sendInstCmd reports ERR for an unsupported command', async () => {
    server = await createMockNUT({ cmds: [] });
    const res = await sendInstCmd('127.0.0.1', port(server), 'ups', 'admin', 'secret', 'beeper.disable');
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/NOT-SUPPORTED/);
  });

  test('setVar succeeds for a writable variable', async () => {
    server = await createMockNUT({ rw: ['battery.charge.low'] });
    const res = await setVar('127.0.0.1', port(server), 'ups', 'admin', 'secret', 'battery.charge.low', 25);
    expect(res.ok).toBe(true);
  });

  test('setVar reports ERR when access is denied', async () => {
    server = await createMockNUT({ rw: ['battery.charge.low'], denySet: true });
    const res = await setVar('127.0.0.1', port(server), 'ups', null, null, 'battery.charge.low', 25);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/ACCESS-DENIED/);
  });
});
