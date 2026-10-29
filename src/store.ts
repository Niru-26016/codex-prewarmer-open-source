import type { Schedule, Job, Credential } from './contracts';

/** SQL writes in a transaction are synchronous; no external I/O may run inside it. */
export class Store {
  constructor(private storage: DurableObjectState['storage']) {}
  sql(query: string, ...params: (string | number | null)[]) {
    return this.storage.sql.exec(query, ...params).toArray();
  }
  transaction<T>(fn: () => T): T {
    return this.storage.transactionSync(fn);
  }
  migrate() {
    this.transaction(() => {
      this.sql('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)');
      if (this.sql('SELECT version FROM schema_migrations WHERE version = 1').length) return;
      this.sql('CREATE TABLE schedules (id TEXT PRIMARY KEY, data TEXT NOT NULL)');
      this.sql(
        'CREATE TABLE jobs (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL)',
      );
      this.sql('CREATE TABLE metadata (key TEXT PRIMARY KEY, data TEXT NOT NULL)');
      this.sql(
        'CREATE TABLE dedupe (key TEXT PRIMARY KEY, job_id TEXT NOT NULL, expires_at INTEGER NOT NULL)',
      );
      this.sql(
        'CREATE TABLE sessions (id TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL)',
      );
      this.sql(
        'CREATE TABLE login_guard (id TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL)',
      );
      this.sql('INSERT INTO schema_migrations (version) VALUES (1)');
    });
  }
  get<T>(key: string): T | null {
    const row = this.sql('SELECT data FROM metadata WHERE key = ?', key)[0];
    return row ? (JSON.parse(String(row.data)) as T) : null;
  }
  put(key: string, data: unknown) {
    this.sql(
      'INSERT INTO metadata VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data=excluded.data',
      key,
      JSON.stringify(data),
    );
  }
  schedules(): Schedule[] {
    return this.sql('SELECT data FROM schedules ORDER BY rowid').map(
      (r) => JSON.parse(String(r.data)) as Schedule,
    );
  }
  schedule(s: Schedule) {
    this.sql(
      'INSERT INTO schedules VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      s.id,
      JSON.stringify(s),
    );
  }
  jobs(): Job[] {
    return this.sql('SELECT data FROM jobs ORDER BY created_at DESC, rowid DESC LIMIT 100').map(
      (r) => JSON.parse(String(r.data)) as Job,
    );
  }
  job(id: string): Job | null {
    const r = this.sql('SELECT data FROM jobs WHERE id = ?', id)[0];
    return r ? (JSON.parse(String(r.data)) as Job) : null;
  }
  saveJob(j: Job) {
    this.sql(
      'INSERT INTO jobs VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      j.id,
      JSON.stringify(j),
      j.createdAt,
    );
  }
  active(): Job | null {
    const id = this.get<string | null>('active');
    return id ? this.job(id) : null;
  }
  credential(): Credential {
    return this.get<Credential>('credential') ?? { version: 0, state: 'disconnected', blob: null };
  }
  prune(now: number) {
    this.sql('DELETE FROM dedupe WHERE expires_at <= ?', now);
    this.sql('DELETE FROM sessions WHERE expires_at <= ?', now);
    this.sql('DELETE FROM login_guard WHERE expires_at <= ?', now);
    this.sql(
      'DELETE FROM jobs WHERE id NOT IN (SELECT id FROM jobs ORDER BY created_at DESC, rowid DESC LIMIT 100) AND id != ?',
      this.active()?.id ?? '',
    );
  }
}
