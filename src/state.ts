import { DurableObject } from 'cloudflare:workers';
import { assertSchedule, nextOccurrence } from './schedule.js';
import { dispatchJob, DispatchError } from './executors.js';
import { decryptJson, encryptJson, safeEqual, validateAuthJson, hmac, hash } from './security.js';
import { AppError, type AppEnv, type AuthJson, type Job, type Schedule } from './contracts';
import { Store } from './store';

const DAY = 86_400_000;
const QUEUE_MS = 600_000;
const RUN_MS = 180_000;
const GRACE_MS = 300_000;
export class PrewarmState extends DurableObject<AppEnv> {
  private db: Store;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(ctx: DurableObjectState, env: AppEnv) {
    super(ctx, env);
    this.db = new Store(ctx.storage);
    ctx.blockConcurrencyWhile(async () => {
      this.db.migrate();
      // Import the original v1 KV data once, including encrypted credentials.
      if (!this.db.get('legacyImported')) {
        const legacy = await ctx.storage.get<{
          schedules: Schedule[];
          jobs: Job[];
          active: { id: string } | null;
        }>('state');
        const auth = await ctx.storage.get('auth');
        this.db.transaction(() => {
          for (const schedule of legacy?.schedules ?? []) this.db.schedule(schedule);
          for (const job of legacy?.jobs ?? [])
            this.db.saveJob({
              ...job,
              dryRun: true,
              receipt: null,
              claimHash: null,
              executor: 'mock',
            });
          // Old claimed credentials may still be in flight. Force reconnection after migration.
          if (auth)
            this.db.put('credential', { version: 1, state: 'reconnect_required', blob: auth });
          if (legacy?.active) {
            const job = this.db.job(legacy.active.id);
            if (job)
              this.db.saveJob({
                ...job,
                status: 'failed',
                finishedAt: Date.now(),
                error: 'MIGRATION_REQUIRES_REVIEW',
              });
          }
          this.db.put('legacyImported', true);
        });
        await ctx.storage.delete(['state', 'auth']);
      }
      await this.rearm();
    });
  }
  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }
  private isDryRun() {
    return this.env.DRY_RUN !== 'false' || this.env.ENABLE_LIVE_RUNS !== 'true';
  }
  private expire(now: number) {
    const j = this.db.active();
    if (!j || j.expiresAt > now) return;
    this.db.saveJob({ ...j, status: 'failed', error: 'RUNNER_TIMEOUT', finishedAt: now });
    this.db.put('active', null);
    if (j.status === 'running' && !j.dryRun) {
      const c = this.db.credential();
      this.db.put('credential', { ...c, state: 'quarantined' });
    }
  }
  private async rearm() {
    const next = this.db
      .schedules()
      .filter((s) => s.enabled && s.nextAt !== null)
      .map((s) => s.nextAt as number);
    const j = this.db.active();
    if (j) {
      next.push(j.expiresAt);
      if (j.status === 'queued' || j.status === 'retrying' || (j.dryRun && j.executor === 'mock'))
        next.push(j.dispatchAt);
    }
    if (next.length) await this.ctx.storage.setAlarm(Math.max(Date.now() + 50, Math.min(...next)));
    else await this.ctx.storage.deleteAlarm();
  }
  async snapshot() {
    return this.exclusive(async () => {
      const now = Date.now();
      this.db.transaction(() => {
        this.expire(now);
        this.db.prune(now);
      });
      await this.rearm();
      const schedules = this.db.schedules(),
        active = this.db.active(),
        credential = this.db.credential();
      const next = schedules.flatMap((s) => (s.enabled && s.nextAt ? [s.nextAt] : []));
      const desktop = this.db.get<{ lastSeen: number; allowLive: boolean }>('vmRunner');
      return {
        timezone: 'Asia/Kolkata',
        serverNow: now,
        dryRun: this.isDryRun(),
        executor: this.env.EXECUTOR,
        connectionAllowed: this.env.ALLOW_CODEX_CONNECTION === 'true',
        authReady: credential.state === 'ready',
        credentialState: credential.state,
        vmRunner:
          this.env.EXECUTOR === 'vm'
            ? {
                lastSeen: desktop?.lastSeen ?? null,
                online: Boolean(desktop && now - desktop.lastSeen < 45_000),
                liveAllowed: desktop?.allowLive ?? false,
              }
            : null,
        schedules,
        jobs: this.db.jobs().map((j) => this.publicJob(j)),
        active: active ? { id: active.id, expiresAt: active.expiresAt } : null,
        nextAt: next.length ? Math.min(...next) : null,
      };
    });
  }
  private publicJob(j: Job) {
    const { claimHash: _claimHash, receipt: _receipt, ...publicData } = j;
    return publicData;
  }
  async loginAttempt(password: string, client: string) {
    return this.exclusive(async () => {
      const now = Date.now();
      this.db.prune(now);
      const ids = [await hmac(this.env.SESSION_SECRET, client), 'global'];
      const rows = ids.map(
        (id) => this.db.sql('SELECT attempts, expires_at FROM login_guard WHERE id = ?', id)[0],
      );
      if (rows.some((r, i) => r && Number(r.attempts) >= (i ? 100 : 8)))
        throw new AppError('LOGIN_RATE_LIMITED', 429);
      const ok = safeEqual(await hash(password), await hash(this.env.ADMIN_PASSWORD));
      if (!ok) {
        for (const id of ids)
          this.db.sql(
            'INSERT INTO login_guard VALUES (?, 1, ?) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1',
            id,
            now + 900_000,
          );
        throw new AppError('INCORRECT_PASSWORD', 401);
      }
      this.db.sql('DELETE FROM login_guard WHERE id = ?', ids[0]);
      const token = crypto.randomUUID() + crypto.randomUUID(),
        csrf = crypto.randomUUID();
      const id = await hmac(this.env.SESSION_SECRET, token);
      this.db.sql('INSERT INTO sessions VALUES (?, ?, ?)', id, csrf, now + 7 * DAY);
      this.db.sql(
        'DELETE FROM sessions WHERE id NOT IN (SELECT id FROM sessions ORDER BY expires_at DESC, rowid DESC LIMIT 5)',
      );
      return { token, csrf };
    });
  }
  async session(token: string) {
    const id = await hmac(this.env.SESSION_SECRET, token);
    const r = this.db.sql(
      'SELECT csrf FROM sessions WHERE id = ? AND expires_at > ?',
      id,
      Date.now(),
    )[0];
    return r ? String(r.csrf) : null;
  }
  async logout(token: string) {
    this.db.sql('DELETE FROM sessions WHERE id = ?', await hmac(this.env.SESSION_SECRET, token));
  }
  async saveSchedule(payload: unknown, id: string | null = null) {
    return this.exclusive(async () => {
      const value = assertSchedule(payload);
      const schedules = this.db.schedules();
      if (id && !schedules.some((s) => s.id === id)) throw new AppError('SCHEDULE_NOT_FOUND', 404);
      if (!id && schedules.length >= 24) throw new AppError('SCHEDULE_LIMIT');
      const schedule = {
        ...value,
        id: id ?? crypto.randomUUID(),
        nextAt: nextOccurrence(value, Date.now()),
      };
      this.db.schedule(schedule);
      await this.rearm();
      return schedule;
    });
  }
  async deleteSchedule(id: string) {
    return this.exclusive(async () => {
      if (!this.db.schedules().some((s) => s.id === id))
        throw new AppError('SCHEDULE_NOT_FOUND', 404);
      this.db.sql('DELETE FROM schedules WHERE id = ?', id);
      await this.rearm();
      return { ok: true };
    });
  }
  async storeAuth(payload: AuthJson) {
    return this.exclusive(async () => {
      if (this.env.ALLOW_CODEX_CONNECTION !== 'true')
        throw new AppError('CODEX_CONNECTION_LOCKED', 403);
      this.expire(Date.now());
      if (this.db.active()) throw new AppError('RUN_ACTIVE', 409);
      validateAuthJson(payload);
      const c = this.db.credential(),
        blob = await encryptJson(this.env.AUTH_ENCRYPTION_KEY, payload);
      this.db.put('credential', { version: c.version + 1, state: 'ready', blob });
      return { ok: true };
    });
  }
  async removeAuth() {
    return this.exclusive(async () => {
      if (this.db.active()) throw new AppError('RUN_ACTIVE', 409);
      const c = this.db.credential();
      this.db.put('credential', { version: c.version + 1, state: 'disconnected', blob: null });
      return { ok: true };
    });
  }
  private enqueue(
    key: string,
    source: string,
    scheduleId: string | null,
    due: number | null,
    now: number,
  ): Job {
    const prior = this.db.sql(
      'SELECT job_id FROM dedupe WHERE key = ? AND expires_at > ?',
      key,
      now,
    )[0];
    if (prior) {
      const old = this.db.job(String(prior.job_id));
      if (old) return old;
      throw new AppError('IDEMPOTENCY_KEY_EXPIRED', 409);
    }
    if (this.db.active()) throw new AppError('RUN_ACTIVE', 409);
    const dryRun = this.isDryRun();
    if (
      !dryRun &&
      (!['cloud_run', 'vm'].includes(this.env.EXECUTOR) || this.db.credential().state !== 'ready')
    )
      throw new AppError('CODEX_RECONNECT_REQUIRED', 409);
    const j: Job = {
      id: crypto.randomUUID(),
      source,
      scheduleId,
      status: 'queued',
      createdAt: now,
      scheduledAt: due,
      startedAt: null,
      finishedAt: null,
      error: null,
      runUrl: null,
      dryRun,
      expiresAt: now + QUEUE_MS,
      dispatchAt: now + 50,
      attempts: 0,
      claimHash: null,
      authVersion: this.db.credential().version,
      receipt: null,
      executor: this.env.EXECUTOR,
    };
    this.db.saveJob(j);
    this.db.put('active', j.id);
    this.db.sql('INSERT INTO dedupe VALUES (?, ?, ?)', key, j.id, now + 8 * DAY);
    return j;
  }
  async createJob(key: string) {
    return this.exclusive(async () => {
      const now = Date.now();
      let j: Job;
      this.db.transaction(() => {
        this.expire(now);
        this.db.prune(now);
        j = this.enqueue(`manual:${key}`, 'manual', null, null, now);
      });
      await this.rearm();
      return { ok: true, job: this.publicJob(j!) };
    });
  }
  private scheduled(now: number) {
    this.db.transaction(() => {
      this.expire(now);
      this.db.prune(now);
      for (const s of this.db.schedules()) {
        if (!s.enabled || s.nextAt === null || s.nextAt > now) continue;
        const due = s.nextAt;
        this.db.schedule({ ...s, nextAt: nextOccurrence(s, now) });
        let reason = now - due > GRACE_MS ? 'MISSED_SCHEDULE' : '';
        if (!reason) {
          try {
            this.enqueue(`alarm:${s.id}:${due}`, 'scheduled', s.id, due, now);
            continue;
          } catch (e) {
            reason = e instanceof AppError ? e.code : 'SCHEDULE_ERROR';
          }
        }
        const j: Job = {
          id: crypto.randomUUID(),
          source: 'scheduled',
          scheduleId: s.id,
          scheduledAt: due,
          status: 'skipped',
          createdAt: now,
          startedAt: null,
          finishedAt: now,
          error: reason,
          runUrl: null,
          dryRun: this.isDryRun(),
          expiresAt: now,
          dispatchAt: now,
          attempts: 0,
          claimHash: null,
          authVersion: 0,
          receipt: null,
          executor: this.env.EXECUTOR,
        };
        this.db.saveJob(j);
      }
    });
  }
  async alarm() {
    const dispatch = await this.exclusive(async () => {
      const now = Date.now();
      this.scheduled(now);
      const j = this.db.active();
      if (!j || j.dispatchAt > now) {
        await this.rearm();
        return null;
      }
      if (j.executor === 'mock') {
        if (!j.dryRun) throw new AppError('MOCK_LIVE_FORBIDDEN');
        if (j.status === 'queued')
          this.db.saveJob({ ...j, status: 'running', startedAt: now, dispatchAt: now + 1500 });
        else if (j.status === 'running') {
          this.db.saveJob({ ...j, status: 'succeeded', finishedAt: now });
          this.db.put('active', null);
        }
        await this.rearm();
        return null;
      }
      if (j.executor === 'vm') {
        if (['queued', 'retrying'].includes(j.status))
          this.db.saveJob({ ...j, status: 'dispatched', attempts: j.attempts + 1 });
        await this.rearm();
        return null;
      }
      if (!['queued', 'retrying'].includes(j.status)) {
        await this.rearm();
        return null;
      }
      // Durable outbox reservation. A crash after reservation waits for the safety deadline.
      this.db.saveJob({ ...j, status: 'dispatching', attempts: j.attempts + 1 });
      await this.rearm();
      return j;
    });
    if (!dispatch) return;
    // Never hold the mutation queue across provider I/O: claim callbacks must proceed.
    let runUrl: string | null = null,
      failure: unknown;
    try {
      runUrl = await dispatchJob({ ...this.env, EXECUTOR: dispatch.executor }, dispatch.id);
    } catch (e) {
      failure = e;
    }
    await this.exclusive(async () => {
      const j = this.db.job(dispatch.id);
      if (!j || j.status !== 'dispatching') return;
      if (!failure) this.db.saveJob({ ...j, status: 'dispatched', runUrl });
      else if (failure instanceof DispatchError && failure.retryable && j.attempts < 3) {
        this.db.saveJob({
          ...j,
          status: 'retrying',
          error: 'DISPATCH_RETRY',
          dispatchAt: Date.now() + 2000 * 2 ** (j.attempts - 1),
        });
      } else if (failure instanceof DispatchError && !failure.uncertain) {
        this.db.saveJob({
          ...j,
          status: 'failed',
          error: 'DISPATCH_FAILED',
          finishedAt: Date.now(),
        });
        this.db.put('active', null);
      } else {
        // A network timeout may happen after acceptance; keep the claimable job fenced.
        this.db.saveJob({ ...j, status: 'dispatched', error: 'DISPATCH_UNCERTAIN' });
      }
      await this.rearm();
    });
  }
  /** VM discovery returns an exact job ID. Credentials still require its single-use claim. */
  async vmPoll(allowLive: boolean) {
    return this.exclusive(async () => {
      if (this.env.EXECUTOR !== 'vm') throw new AppError('VM_RUNNER_DISABLED', 403);
      const now = Date.now();
      this.expire(now);
      this.db.put('vmRunner', { lastSeen: now, allowLive });
      const j = this.db.active();
      const available =
        j &&
        j.executor === 'vm' &&
        j.status === 'dispatched' &&
        (j.dryRun || (!this.isDryRun() && allowLive));
      await this.rearm();
      return { ok: true, jobId: available ? j.id : null };
    });
  }
  async claim(jobId: string, claimToken: string, allowLive = false) {
    return this.exclusive(async () => {
      this.expire(Date.now());
      const j = this.db.job(jobId);
      if (!j || this.db.active()?.id !== jobId || !['dispatching', 'dispatched'].includes(j.status))
        throw new AppError('CLAIM_UNAVAILABLE', 409);
      if (!j.dryRun && (!allowLive || this.isDryRun() || this.env.EXECUTOR !== j.executor))
        throw new AppError('LIVE_RUN_NOT_AUTHORIZED', 403);
      const c = this.db.credential();
      if (!j.dryRun && (c.state !== 'ready' || c.version !== j.authVersion))
        throw new AppError('CODEX_RECONNECT_REQUIRED', 409);
      const authJson = j.dryRun ? null : await decryptJson(this.env.AUTH_ENCRYPTION_KEY, c.blob);
      this.db.saveJob({
        ...j,
        status: 'running',
        startedAt: Date.now(),
        expiresAt: Date.now() + RUN_MS,
        claimHash: await hash(claimToken),
      });
      await this.rearm();
      return { ok: true, dryRun: j.dryRun, authJson };
    });
  }
  async finish(
    jobId: string,
    claimToken: string,
    data: { ok: boolean; authJson?: AuthJson | null; error?: string; reconnect?: boolean },
  ) {
    return this.exclusive(async () => {
      this.expire(Date.now());
      const j = this.db.job(jobId),
        receipt = await hash(JSON.stringify(data));
      if (!j || !safeEqual(j.claimHash, await hash(claimToken)))
        throw new AppError('CLAIM_UNAVAILABLE', 409);
      if (j.receipt === receipt) return { ok: true, replayed: true };
      if (this.db.active()?.id !== jobId || j.status !== 'running')
        throw new AppError('FINISH_UNAVAILABLE', 409);
      const c = this.db.credential();
      let ok = data.ok,
        blob: unknown = c.blob;
      if (j.dryRun && data.authJson) throw new AppError('DRY_RUN_CREDENTIALS_FORBIDDEN');
      if (!j.dryRun) {
        if (c.version !== j.authVersion) throw new AppError('CREDENTIAL_VERSION_CONFLICT', 409);
        try {
          validateAuthJson(data.authJson);
          blob = await encryptJson(this.env.AUTH_ENCRYPTION_KEY, data.authJson);
        } catch {
          ok = false;
          data.reconnect = true;
        }
      }
      this.db.transaction(() => {
        if (!j.dryRun)
          this.db.put('credential', {
            version: c.version + 1,
            state: data.reconnect ? 'reconnect_required' : 'ready',
            blob,
          });
        this.db.saveJob({
          ...j,
          status: ok ? 'succeeded' : 'failed',
          error: ok ? null : data.reconnect ? 'CODEX_RECONNECT_REQUIRED' : 'EXECUTION_FAILED',
          finishedAt: Date.now(),
          receipt,
        });
        this.db.put('active', null);
      });
      await this.rearm();
      return { ok: true, replayed: false };
    });
  }
}
