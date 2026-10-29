import { cookieToken, readJson, safeEqual } from './security.js';
import { AppError, type AppEnv } from './contracts';
export { PrewarmState } from './state';

const errors: Record<string, number> = {
  LIVE_RUN_NOT_AUTHORIZED: 403,
  VM_RUNNER_DISABLED: 403,
  JSON_REQUIRED: 415,
  BODY_TOO_LARGE: 413,
  INVALID_JSON: 400,
  INCORRECT_PASSWORD: 401,
  LOGIN_RATE_LIMITED: 429,
  SCHEDULE_NOT_FOUND: 404,
  SCHEDULE_LIMIT: 400,
  RUN_ACTIVE: 409,
  CODEX_CONNECTION_LOCKED: 403,
  INVALID_CODEX_AUTH: 400,
  CODEX_RECONNECT_REQUIRED: 409,
  IDEMPOTENCY_KEY_EXPIRED: 409,
  CLAIM_UNAVAILABLE: 409,
  FINISH_UNAVAILABLE: 409,
  CREDENTIAL_VERSION_CONFLICT: 409,
  DRY_RUN_CREDENTIALS_FORBIDDEN: 400,
};
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'X-Frame-Options': 'DENY',
};
function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(data, {
    status,
    headers: { ...securityHeaders, 'Cache-Control': 'no-store', ...extra },
  });
}
function cookie(token: string, local: boolean) {
  return `prewarm_session=${token}; HttpOnly; ${local ? '' : 'Secure; '}SameSite=Strict; Path=/; Max-Age=${token ? 604800 : 0}`;
}
export default {
  async fetch(request: Request, env: AppEnv): Promise<Response> {
    const url = new URL(request.url),
      path = url.pathname;
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    const local = env.APP_ENV === 'local' && loopback;
    if (!local && url.protocol !== 'https:') return json({ error: 'HTTPS_REQUIRED' }, 400);
    if (!path.startsWith('/api/')) {
      const asset = await env.ASSETS.fetch(request);
      const response = new Response(asset.body, asset);
      for (const [key, value] of Object.entries(securityHeaders)) response.headers.set(key, value);
      if (!local) response.headers.set('Strict-Transport-Security', 'max-age=31536000');
      return response;
    }
    if (path === '/api/health' && request.method === 'GET')
      return json({ ok: true, service: 'codex-prewarmer' });
    if (
      env.ADMIN_PASSWORD?.length < 24 ||
      !env.ADMIN_PASSWORD ||
      env.SESSION_SECRET?.length < 32 ||
      !env.SESSION_SECRET
    )
      return json({ error: 'SERVER_NOT_CONFIGURED' }, 503);
    const stub = env.STATE.getByName('personal');
    try {
      if (path.startsWith('/api/runner/')) {
        if (request.method !== 'POST') throw new AppError('METHOD_NOT_ALLOWED', 405);
        // Runner endpoints accept machine authentication only. No session cookie fallback.
        const bearer = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
        if (
          !env.RUNNER_TOKEN ||
          env.RUNNER_TOKEN.length < 32 ||
          !safeEqual(bearer, env.RUNNER_TOKEN)
        )
          throw new AppError('UNAUTHORIZED', 401);
        const data = await readJson(request);
        if (path === '/api/runner/vm-poll') {
          if (typeof data?.allowLive !== 'boolean') throw new AppError('INVALID_RUNNER_REQUEST');
          return json(await stub.vmPoll(data.allowLive, data.supportsUsage === true));
        }
        if (
          !/^[0-9a-f-]{36}$/i.test(data?.jobId) ||
          typeof data?.claimToken !== 'string' ||
          data.claimToken.length < 32 ||
          data.claimToken.length > 128
        )
          throw new AppError('INVALID_RUNNER_REQUEST');
        if (path === '/api/runner/claim')
          return json(await stub.claim(data.jobId, data.claimToken, data.allowLive === true));
        if (path === '/api/runner/finish') {
          if (
            typeof data.ok !== 'boolean' ||
            (data.reconnect !== undefined && typeof data.reconnect !== 'boolean')
          )
            throw new AppError('INVALID_RUNNER_REQUEST');
          return json(
            await stub.finish(data.jobId, data.claimToken, {
              ok: data.ok,
              authJson: data.authJson ?? null,
              reconnect: data.reconnect ?? false,
              limits: data.limits,
              error: typeof data.error === 'string' ? data.error : undefined,
            }),
          );
        }
        throw new AppError('NOT_FOUND', 404);
      }
      if (path === '/api/login' && request.method === 'POST') {
        if (request.headers.get('Origin') !== url.origin) throw new AppError('INVALID_ORIGIN', 403);
        const data = await readJson(request, 2000);
        if (typeof data?.password !== 'string' || data.password.length > 256)
          throw new AppError('PASSWORD_REQUIRED');
        const result = await stub.loginAttempt(
          data.password,
          request.headers.get('CF-Connecting-IP') ?? 'local',
        );
        return json({ ok: true, csrf: result.csrf }, 200, {
          'Set-Cookie': cookie(result.token, local),
        });
      }
      const token = cookieToken(request),
        csrf = token && (await stub.session(token));
      if (!csrf) throw new AppError('NOT_SIGNED_IN', 401);
      if (!['GET', 'HEAD'].includes(request.method)) {
        if (request.headers.get('Origin') !== url.origin) throw new AppError('INVALID_ORIGIN', 403);
        if (!safeEqual(request.headers.get('X-CSRF-Token'), csrf))
          throw new AppError('INVALID_CSRF', 403);
      }
      if (path === '/api/session' && request.method === 'GET') return json({ ok: true, csrf });
      if (path === '/api/logout' && request.method === 'POST') {
        await stub.logout(token);
        return json({ ok: true }, 200, { 'Set-Cookie': cookie('', local) });
      }
      if (path === '/api/status' && request.method === 'GET') return json(await stub.snapshot());
      if (['/api/run', '/api/usage/refresh'].includes(path) && request.method === 'POST') {
        if (path === '/api/usage/refresh' && env.EXECUTOR !== 'vm')
          throw new AppError('VM_RUNNER_DISABLED', 403);
        const key = request.headers.get('Idempotency-Key');
        if (!key || !/^[0-9a-f-]{36}$/i.test(key)) throw new AppError('IDEMPOTENCY_KEY_REQUIRED');
        return json(
          await (path === '/api/usage/refresh' ? stub.createUsageJob(key) : stub.createJob(key)),
          202,
        );
      }
      if (path === '/api/schedules' && request.method === 'POST')
        return json(await stub.saveSchedule(await readJson(request, 4000)), 201);
      const match = path.match(/^\/api\/schedules\/([a-f0-9-]{36})$/i);
      if (match && request.method === 'PATCH')
        return json(await stub.saveSchedule(await readJson(request, 4000), match[1]));
      if (match && request.method === 'DELETE') return json(await stub.deleteSchedule(match[1]));
      if (path === '/api/auth/seed' && request.method === 'POST')
        return json(await stub.storeAuth(await readJson(request)));
      if (path === '/api/auth/remove' && request.method === 'POST')
        return json(await stub.removeAuth());
      throw new AppError('NOT_FOUND', 404);
    } catch (e) {
      if (e instanceof AppError) return json({ error: e.code }, e.status);
      // RPC preserves Error.message, not custom Error fields. Only fixed codes cross this boundary.
      const message = e instanceof Error ? e.message : '';
      const code = Object.keys(errors).find((k) => message === k || message.endsWith(`: ${k}`));
      if (code) return json({ error: code }, errors[code]);
      if (/Choose one or more|Time must be/.test(message))
        return json({ error: 'INVALID_SCHEDULE' }, 400);
      console.error(JSON.stringify({ event: 'request_failed', code: 'INTERNAL_ERROR' }));
      return json({ error: 'INTERNAL_ERROR' }, 500);
    }
  },
};
