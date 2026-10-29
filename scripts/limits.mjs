import { spawn } from 'node:child_process';
import { sanitizeLimits } from '../src/limits.js';
export function readLimits(home) {
  return new Promise((resolve) => {
    const child = spawn('codex', ['app-server', '-c', 'cli_auth_credentials_store="file"'], {
      cwd: home,
      env: { PATH: process.env.PATH, HOME: home, CODEX_HOME: home, LANG: 'C.UTF-8' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let buffer = '',
      done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.stdin.destroy();
      child.kill('SIGKILL');
      resolve(result);
    };
    const send = (m) => {
      if (!done) child.stdin.write(JSON.stringify(m) + '\n');
    };
    const timer = setTimeout(
      () => finish({ ok: false, reconnect: false, error: 'USAGE_UNAVAILABLE' }),
      30000,
    );
    child.stdin.on('error', () => {});
    child.stderr.on('data', () => {});
    child.on('error', () => finish({ ok: false, reconnect: false, error: 'USAGE_UNAVAILABLE' }));
    child.on('close', () => finish({ ok: false, reconnect: false, error: 'USAGE_UNAVAILABLE' }));
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      if (buffer.length > 128000)
        return finish({ ok: false, reconnect: false, error: 'USAGE_UNAVAILABLE' });
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        let m;
        try {
          m = JSON.parse(line);
        } catch {
          continue;
        }
        if (m.id === 1) {
          if (m.error) return finish({ ok: false, reconnect: false, error: 'USAGE_UNAVAILABLE' });
          send({ method: 'initialized', params: {} });
          send({ id: 2, method: 'account/rateLimits/read' });
        }
        if (m.id === 2) {
          const limits = sanitizeLimits(m.result);
          finish({
            ok: !m.error && limits.length > 0,
            reconnect: false,
            limits,
            error: limits.length ? undefined : 'USAGE_UNAVAILABLE',
          });
        }
      }
    });
    send({
      id: 1,
      method: 'initialize',
      params: { clientInfo: { name: 'prewarmer', version: '1.1.0' } },
    });
  });
}
