import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Activity,
  AlarmClock,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCheck,
  Clock,
  Cloud,
  ExternalLink,
  History,
  KeyRound,
  Lock,
  LogOut,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Smartphone,
  Trash2,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const format = (time) =>
  time == null
    ? '—'
    : new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(time);
function timeString(time) {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function timeUntil(next, now) {
  if (!next) return 'No scheduled runs';
  const n = Math.max(0, Math.ceil((next - now) / 1000));
  if (!n) return 'Starting soon';
  const d = Math.floor(n / 86400),
    h = Math.floor((n % 86400) / 3600),
    m = Math.floor((n % 3600) / 60),
    s = n % 60;
  return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}
let csrfToken = '';
const messages = {
  NOT_SIGNED_IN: 'Your dashboard session expired. Please sign in again.',
  RUN_ACTIVE: 'Another run is already queued or running.',
  CODEX_CONNECTION_LOCKED: 'Codex connection is locked for this dry-run release.',
  INVALID_CODEX_AUTH: 'Use a fresh file-backed ChatGPT Codex session from your trusted computer.',
  INCORRECT_PASSWORD: 'Incorrect password.',
  LOGIN_RATE_LIMITED: 'Too many sign-in attempts. Try again in 15 minutes.',
  INVALID_CSRF: 'Your session changed. Refresh and try again.',
  CODEX_RECONNECT_REQUIRED: 'Reconnect Codex from your trusted computer before a live run.',
  SERVER_NOT_CONFIGURED: 'Dashboard authentication is not configured yet.',
};
async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && path !== '/login') headers['X-CSRF-Token'] = csrfToken;
  if (path === '/run') headers['Idempotency-Key'] = crypto.randomUUID();
  const response = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  const result = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok) {
    if (response.status === 401 && path !== '/login')
      window.dispatchEvent(new Event('session-expired'));
    const error = Error(
      messages[result.error] || result.message || result.error || `HTTP ${response.status}`,
    );
    error.status = response.status;
    throw error;
  }
  if (result.csrf) csrfToken = result.csrf;
  return result;
}
const initial = { days: [0], time: '01:00', label: 'Sunday morning', enabled: true };
function Brand({ mini = false }) {
  return (
    <div className="brand">
      <div className="brand-icon">
        <Zap size={21} strokeWidth={2.7} />
      </div>
      {!mini && (
        <div className="brand-copy">
          <strong>
            prewarm<span>.</span>
          </strong>
          <small>CODEX COMPANION</small>
        </div>
      )}
    </div>
  );
}
function Badge({ children, tone = 'neutral', dot = false }) {
  return (
    <span className={`badge ${tone}`}>
      {dot && <i className="dot" />}
      {children}
    </span>
  );
}
function Login({ onLogin }) {
  const [password, setPassword] = useState(''),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  async function login(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api('/login', { method: 'POST', body: { password } });
      setPassword('');
      await onLogin();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-orb" />
      <div className="login-container">
        <Brand />
        <div className="login-panel">
          <div className="login-shield">
            <Lock size={23} />
          </div>
          <p className="eyebrow">PRIVATE DASHBOARD</p>
          <h1>
            Your coding clock,
            <br />
            <span>on your terms.</span>
          </h1>
          <p className="subdued">
            Set weekly alarms in IST and test the full flow safely from your phone.
          </p>
          <form onSubmit={login}>
            <label className="field-label" htmlFor="pass">
              Dashboard password
            </label>
            <input
              id="pass"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your secure password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button className="btn primary full" disabled={loading}>
              {loading ? 'Signing in…' : 'Unlock dashboard'} <ArrowRight size={17} />
            </button>
          </form>
          {error && <div className="alert error">{error}</div>}
        </div>
        <p className="login-footer">
          <ShieldCheck size={15} /> Your dashboard session stays in a private, HttpOnly cookie.
        </p>
      </div>
    </main>
  );
}
function ScheduleModal({ schedule, onClose, onSave }) {
  const [days, setDays] = useState(schedule?.days || initial.days),
    [time, setTime] = useState(schedule?.time || initial.time),
    [label, setLabel] = useState(schedule?.label || ''),
    [enabled, setEnabled] = useState(schedule?.enabled ?? true),
    [working, setWorking] = useState(false),
    [error, setError] = useState('');
  const dialogRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    dialog.querySelector('input,button')?.focus();
    const key = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Tab') {
        const items = [...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled)')];
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    dialog.addEventListener('keydown', key);
    return () => {
      dialog.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [onClose]);
  const toggle = (day) =>
    setDays((old) => (old.includes(day) ? old.filter((d) => d !== day) : [...old, day].sort()));
  async function submit(e) {
    e.preventDefault();
    if (!days.length) return setError('Choose at least one day.');
    setWorking(true);
    setError('');
    try {
      await onSave({ days, time, label, enabled });
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  }
  return (
    <div className="overlay">
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-title"
      >
        <div className="modal-title">
          <div>
            <p className="eyebrow">SCHEDULE BUILDER</p>
            <h2 id="schedule-title">{schedule ? 'Edit schedule' : 'New warmup alarm'}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={submit}>
          <label className="field-label" htmlFor="alarm-name">
            Alarm name <span className="optional">(optional)</span>
          </label>
          <input
            id="alarm-name"
            maxLength={60}
            placeholder="e.g. Early morning coding"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <div className="field-label section-label" id="repeat-label">
            Repeat on
          </div>
          <div className="day-picker" role="group" aria-labelledby="repeat-label">
            {DAY_LABELS.map((d, i) => (
              <button
                type="button"
                key={d}
                className={`day ${days.includes(i) ? 'selected' : ''}`}
                onClick={() => toggle(i)}
                aria-pressed={days.includes(i)}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="presets">
            <button type="button" onClick={() => setDays([1, 2, 3, 4, 5])}>
              Weekdays
            </button>
            <button type="button" onClick={() => setDays([0, 6])}>
              Weekends
            </button>
            <button type="button" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}>
              Every day
            </button>
          </div>
          <label className="field-label section-label" htmlFor="alarm-time">
            Trigger time <span className="timezone">Asia/Kolkata (IST)</span>
          </label>
          <input
            className="time-input"
            id="alarm-time"
            type="time"
            required
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
          <label className="check-row">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span>Enable this alarm</span>
          </label>
          {error && <div className="alert error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" disabled={working || !days.length}>
              {working ? 'Saving…' : 'Save schedule'} <Check size={17} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
function Dashboard({ data, onRun, onRefresh, now, busy, online, setView }) {
  const next = data.schedules
    .filter((s) => s.enabled && s.nextAt)
    .sort((a, b) => a.nextAt - b.nextAt)[0];
  const relevantJobs = data.jobs.filter((j) => j.dryRun === data.dryRun && j.source !== 'usage');
  const succeeded = relevantJobs.filter((j) => j.status === 'succeeded').length;
  const active = data.active && data.jobs.find((j) => j.id === data.active.id);
  const runnerOffline = data.executor === 'vm' && !data.vmRunner?.online;
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" /> CONTROL CENTER
          </div>
          <h1>
            Good to have you back <span className="wave">✦</span>
          </h1>
          <p>Your Codex prewarming, running on your schedule.</p>
        </div>
        <button className="icon-button refresh" aria-label="Refresh status" onClick={onRefresh}>
          <RefreshCw size={19} />
        </button>
      </header>
      <div className="stats">
        <div className="stat-card next">
          <div className="stat-top">
            <span>Next scheduled warmup</span>
            <CalendarClock size={19} />
          </div>
          <div className="time-big">{next ? timeString(next.time) : 'No alarm set'}</div>
          <p>{next ? `${format(next.nextAt)} · IST` : 'Create a schedule to start'}</p>
          <div className="countdown">
            <Clock size={16} />
            {timeUntil(next?.nextAt, now)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <span>Engine status</span>
            <Activity size={19} />
          </div>
          <div className="stat-value">
            {data.dryRun
              ? 'Test mode'
              : active
                ? 'Working'
                : runnerOffline
                  ? 'Runner offline'
                  : 'Standing by'}
          </div>
          <Badge tone={data.dryRun || runnerOffline ? 'amber' : active ? 'blue' : 'green'} dot>
            {data.dryRun
              ? 'DRY RUN'
              : active
                ? active.status.toUpperCase()
                : runnerOffline
                  ? 'OFFLINE'
                  : 'READY'}
          </Badge>
          <div className="stat-foot">
            {data.dryRun
              ? 'Real Codex requests are disabled'
              : active
                ? 'Execution in progress'
                : runnerOffline
                  ? 'Waiting for the VM runner to reconnect'
                  : 'Waiting for your next trigger'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <span>Successful runs</span>
            <CheckCheck size={19} />
          </div>
          <div className="stat-value">
            {succeeded}
            <span className="stat-suffix">/ last {relevantJobs.length}</span>
          </div>
          <Badge tone={data.authReady ? 'green' : 'amber'} dot>
            {data.authReady ? 'CODEX CONNECTED' : 'AUTH NOT CONNECTED'}
          </Badge>
          <div className="stat-foot">
            {relevantJobs.length
              ? data.dryRun
                ? 'Based on recent test runs'
                : 'Real Codex requests only'
              : 'No runs recorded yet'}
          </div>
        </div>
      </div>
      <section className="hero-action">
        <div className="hero-copy">
          <div className="hero-kicker">
            <Zap size={15} /> ONE-TAP CONTROL
          </div>
          <h2>Start a run on demand.</h2>
          <p>Queue a small Codex request immediately instead of waiting for your next alarm.</p>
          <div className="hero-note">
            <ShieldCheck size={15} />
            {data.dryRun
              ? 'Test mode: no Codex quota will be consumed.'
              : 'The reset time is not guaranteed; check your Codex usage page.'}
          </div>
        </div>
        <button
          className="hero-button"
          onClick={onRun}
          disabled={busy || !online || Boolean(data.active) || (!data.authReady && !data.dryRun)}
        >
          <Play size={20} fill="currentColor" />{' '}
          {!online ? 'Offline' : busy ? 'Starting…' : data.active ? 'Run in progress' : 'Run now'}
        </button>
      </section>
      <div className="section-row">
        <div>
          <h2>Upcoming alarms</h2>
          <p>Your next scheduled requests, in IST.</p>
        </div>
        <button className="link-button" onClick={() => setView('schedules')}>
          View all <ArrowRight size={17} />
        </button>
      </div>
      {data.schedules.length ? (
        <div className="compact-schedules">
          {data.schedules.slice(0, 4).map((s) => (
            <div className="compact-row" key={s.id}>
              <div className="schedule-symbol">
                <AlarmClock size={20} />
              </div>
              <div className="grow">
                <strong>{s.label || s.days.map((x) => FULL_DAYS[x]).join(', ')}</strong>
                <small>{s.days.map((x) => DAY_LABELS[x]).join(' · ')}</small>
              </div>
              <b>{timeString(s.time)}</b>
              <Badge tone={s.enabled ? 'green' : 'neutral'}>{s.enabled ? 'ON' : 'OFF'}</Badge>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">
          <AlarmClock size={30} />
          <strong>No alarms yet</strong>
          <p>Add your first scheduled warmup.</p>
          <button className="btn secondary" onClick={() => setView('schedules')}>
            Create schedule
          </button>
        </div>
      )}
    </>
  );
}
function ScheduleView({ data, onAdd, onEdit, onDelete, onToggle, disabled }) {
  return (
    <>
      <header className="page-header inline">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" /> YOUR AUTOMATIONS
          </div>
          <h1>Warmup schedules</h1>
          <p>Choose days and times for scheduled requests.</p>
        </div>
        <button className="btn primary add-button" onClick={onAdd}>
          <Plus size={18} /> New alarm
        </button>
      </header>
      {data.schedules.length === 0 ? (
        <div className="empty large">
          <CalendarClock size={38} />
          <h2>Your mornings, on autopilot.</h2>
          <p>Add an alarm to schedule your first automatic warmup.</p>
          <button className="btn primary" onClick={onAdd}>
            <Plus size={18} /> Add your first alarm
          </button>
        </div>
      ) : (
        <div className="schedule-grid">
          {data.schedules.map((s) => (
            <div className={`schedule-card ${!s.enabled ? 'muted-card' : ''}`} key={s.id}>
              <div className="schedule-card-top">
                <div className="schedule-symbol big">
                  <AlarmClock size={23} />
                </div>
                <div className="schedule-actions">
                  <button
                    className="icon-button"
                    aria-label={`Edit ${s.label || 'schedule'}`}
                    disabled={disabled}
                    onClick={() => onEdit(s)}
                  >
                    <Settings2 size={18} />
                  </button>
                  <button
                    className="icon-button danger-icon"
                    aria-label={`Delete ${s.label || 'schedule'}`}
                    disabled={disabled}
                    onClick={() => onDelete(s)}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              <p className="schedule-label">{s.label || 'Codex warmup'}</p>
              <h2>{timeString(s.time)}</h2>
              <div className="chips">
                {DAY_LABELS.map((d, i) => (
                  <span className={`chip ${s.days.includes(i) ? 'on' : ''}`} key={d}>
                    {d.slice(0, 1)}
                  </span>
                ))}
              </div>
              <div className="schedule-card-bottom">
                <span>{s.enabled ? `Next: ${format(s.nextAt)}` : 'Paused'}</span>
                <label className="switch" aria-label={`Toggle ${s.label || 'schedule'}`}>
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={s.enabled}
                    onChange={() => onToggle(s)}
                  />
                  <span />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="tip">
        <Clock size={18} />
        <p>
          All alarms use <strong>India Standard Time (IST)</strong>, including when your phone is
          switched off. Runner startup may be delayed. Requests cannot guarantee quota-window
          timing.
        </p>
      </div>
    </>
  );
}
const statuses = {
  dispatched: ['amber', 'Queued'],
  retrying: ['blue', 'Retrying'],
  succeeded: ['green', 'Successful'],
  failed: ['red', 'Failed'],
  running: ['blue', 'Running'],
  queued: ['amber', 'Queued'],
  dispatching: ['amber', 'Dispatching'],
  skipped: ['neutral', 'Skipped'],
};
function HistoryView({ data, onRefresh }) {
  return (
    <>
      <header className="page-header inline">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" /> ACTIVITY LOG
          </div>
          <h1>Execution history</h1>
          <p>Every scheduled and manual job, in one place.</p>
        </div>
        <button className="btn secondary" onClick={onRefresh}>
          <RefreshCw size={16} /> Refresh
        </button>
      </header>
      <div className="history-table">
        {data.jobs.length ? (
          data.jobs.map((job) => (
            <div className="history-row" key={job.id}>
              <div className={`history-symbol ${job.status}`}>
                <Zap size={18} />
              </div>
              <div className="history-description">
                <strong>
                  {job.source === 'usage'
                    ? 'Allowance check'
                    : job.source === 'manual'
                      ? 'Manual warmup'
                      : 'Scheduled warmup'}
                </strong>
                <span>
                  {format(job.createdAt)} · IST ·{' '}
                  {job.source === 'usage'
                    ? 'No model request'
                    : job.dryRun
                      ? 'Test run'
                      : 'Real Codex request'}
                </span>
                {job.error && <small className="error-text">{job.error}</small>}
              </div>
              <Badge tone={statuses[job.status]?.[0] || 'neutral'}>
                {statuses[job.status]?.[1] || job.status}
              </Badge>
              {job.runUrl && (
                <a
                  className="history-link"
                  href={job.runUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open runner execution"
                >
                  <ExternalLink size={17} />
                </a>
              )}
            </div>
          ))
        ) : (
          <div className="empty large">
            <History size={35} />
            <h2>No runs recorded yet</h2>
            <p>Your first warmup will show up here.</p>
          </div>
        )}
      </div>
    </>
  );
}
function SettingsView({ data, onLogout, onDisconnect, onRefresh }) {
  const [disconnecting, setDisconnecting] = useState(false);
  const [usageError, setUsageError] = useState('');
  const [usageBusy, setUsageBusy] = useState(false);
  async function refreshUsage() {
    setUsageBusy(true);
    setUsageError('');
    try {
      await api('/usage/refresh', { method: 'POST' });
      await onRefresh();
    } catch (e) {
      setUsageError(e.message);
    } finally {
      setUsageBusy(false);
    }
  }
  const workerOrigin = "'" + window.location.origin.replaceAll("'", "'\\''") + "'";
  async function remove() {
    if (
      !confirm('Remove the stored Codex session? Future real warmups will stop until reconnected.')
    )
      return;
    setDisconnecting(true);
    try {
      await onDisconnect();
    } catch {
    } finally {
      setDisconnecting(false);
    }
  }
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" /> CONFIGURATION
          </div>
          <h1>Settings & security</h1>
          <p>See the status of your private infrastructure.</p>
        </div>
      </header>
      <div className="settings-list">
        <div className="settings-item">
          <div className="settings-icon">
            <Cloud size={21} />
          </div>
          <div className="grow">
            <strong>Cloudflare scheduler</strong>
            <p>Durable Object alarms · Asia/Kolkata</p>
          </div>
          <Badge tone="green" dot>
            {data.executor === 'mock' ? 'MOCK READY' : 'REACHABLE'}
          </Badge>
        </div>
        <div className="settings-item">
          <div className="settings-icon">
            <KeyRound size={21} />
          </div>
          <div className="grow">
            <strong>Codex login</strong>
            <p>Encrypted session in Cloudflare storage</p>
          </div>
          <Badge tone={data.authReady ? 'green' : 'amber'} dot>
            {data.authReady ? 'CONNECTED' : 'NOT CONNECTED'}
          </Badge>
        </div>
        {data.executor === 'vm' && (
          <div className="settings-item">
            <div className="settings-icon">
              <Cloud size={21} />
            </div>
            <div className="grow">
              <strong>VM execution runner</strong>
              <p>Runs on your Oracle VM, independently of your phone and laptop.</p>
            </div>
            <Badge tone={data.vmRunner?.online ? 'green' : 'amber'} dot>
              {data.vmRunner?.online ? 'ONLINE' : 'OFFLINE'}
            </Badge>
          </div>
        )}
        <div className="settings-item">
          <div className="settings-icon">
            <ShieldCheck size={21} />
          </div>
          <div className="grow">
            <strong>Execution mode</strong>
            <p>
              {data.dryRun
                ? 'Mock execution only. Codex is never invoked.'
                : 'Uses your securely stored ChatGPT Codex session.'}
            </p>
          </div>
          <Badge tone={data.dryRun ? 'amber' : 'green'}>{data.dryRun ? 'DRY RUN' : 'LIVE'}</Badge>
        </div>
      </div>
      <div className="settings-guide">
        <h3>Codex allowance</h3>
        <p>Read-only account limits. This does not send a model request or reset your allowance.</p>
        <button
          className="btn secondary"
          onClick={refreshUsage}
          disabled={
            usageBusy ||
            !!data.active ||
            !data.authReady ||
            data.dryRun ||
            !data.vmRunner?.online ||
            !data.vmRunner?.supportsUsage
          }
        >
          {usageBusy || data.active ? 'Waiting for runner…' : 'Refresh allowance'}
        </button>
        {usageError && <p role="alert">{usageError}</p>}
        {data.usage?.error && (
          <p role="status">
            Allowance could not be read. Try again later; this does not mean your login expired.
          </p>
        )}
        {data.usage?.buckets?.map((b) => (
          <div key={b.id}>
            <strong>{b.id}</strong>
            {['primary', 'secondary'].map(
              (k) =>
                b[k] && (
                  <p key={k}>
                    {b[k].windowDurationMins >= 1440
                      ? `${b[k].windowDurationMins / 1440}-day`
                      : `${b[k].windowDurationMins / 60}-hour`}{' '}
                    window: <strong>{Math.max(0, 100 - b[k].usedPercent)}% remaining</strong> ·
                    Resets {format(b[k].resetsAt * 1000)} IST
                  </p>
                ),
            )}
          </div>
        ))}
        <p>
          {data.usage?.checkedAt
            ? `Last checked: ${format(data.usage.checkedAt)} IST. Snapshot only; usage may have changed.`
            : 'Not checked yet. Connect Codex and refresh to read the account on your VM.'}
        </p>
      </div>
      <div className="settings-guide">
        <h3>Connect or reconnect Codex</h3>
        <p role="status">
          {data.connectionAllowed
            ? 'Credential connection is enabled by the deployment owner.'
            : 'Connection locked: this release accepts no real Codex credentials.'}{' '}
          {data.credentialState === 'reconnect_required' || data.credentialState === 'quarantined'
            ? 'Reconnect required. Verify the old runner has stopped before replacing credentials.'
            : ''}
        </p>
        <p>
          First open your Codex Prewarmer project folder in Terminal. Type <code>cd</code> followed
          by a space, drag the project folder into Terminal, then press Return. It must be the
          folder containing <code>package.json</code> and <code>scripts/seed-auth.mjs</code>.
        </p>
        <p>
          Paste the whole block below. It checks the folder before starting sign-in. Use your
          ChatGPT account in Brave Personal and keep this Codex session separate from other work.
          Never paste <code>auth.json</code> into chat or GitHub.
        </p>
        <pre>
          <code>{`(
  if [ ! -f scripts/seed-auth.mjs ]; then
    printf '%s\\n' 'Wrong folder: open your Codex Prewarmer project folder in Terminal, then paste this block again.' >&2
    exit 1
  fi
  mkdir -p .build/codex-connection &&
  chmod 700 .build/codex-connection &&
  CODEX_HOME="$PWD/.build/codex-connection" codex -c 'cli_auth_credentials_store="file"' login &&
  node scripts/seed-auth.mjs ${workerOrigin} .build/codex-connection/auth.json --allow-credential-upload
)`}</code>
        </pre>
        <p>
          After browser sign-in succeeds, return to Terminal and enter your Prewarmer dashboard
          password when prompted. Browser sign-in alone does not connect this app: wait for Terminal
          to confirm the authentication upload, then select Check status below. Connecting stores
          your encrypted session; real requests stay disabled while execution mode is DRY RUN.
        </p>
        <a href="https://learn.chatgpt.com/docs/auth/ci-cd-auth" target="_blank" rel="noreferrer">
          Open official Codex CI authentication guidance <ExternalLink size={14} />
        </a>
      </div>
      <div className="settings-buttons">
        <button className="btn secondary" onClick={onRefresh}>
          <RefreshCw size={17} /> Check status
        </button>
        {data.authReady && (
          <button className="btn danger" disabled={disconnecting} onClick={remove}>
            <Trash2 size={17} /> Disconnect Codex
          </button>
        )}
        <button className="btn secondary" onClick={onLogout}>
          <LogOut size={17} /> Log out
        </button>
      </div>
    </>
  );
}
const nav = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'schedules', label: 'Schedules', icon: CalendarClock },
  { id: 'history', label: 'History', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];
export default function App() {
  const [authorized, setAuthorized] = useState(null),
    [data, setData] = useState(null),
    [view, setView] = useState('overview'),
    [modal, setModal] = useState(undefined),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(() => Date.now()),
    [online, setOnline] = useState(navigator.onLine);
  const closeModal = useCallback(() => setModal(undefined), []);
  const snapshotRequest = useRef(0);
  const epoch = useRef(0),
    mutationActive = useRef(false),
    clockOffset = useRef(0);
  useEffect(() => {
    const expired = () => {
      epoch.current++;
      csrfToken = '';
      setAuthorized(false);
      setData(null);
    };
    const offline = () => setOnline(false);
    window.addEventListener('session-expired', expired);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('session-expired', expired);
      window.removeEventListener('offline', offline);
    };
  }, []);
  useEffect(() => {
    api('/session')
      .then(() => setAuthorized(true))
      .catch(() => setAuthorized(false));
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + clockOffset.current), 1000);
    return () => clearInterval(timer);
  }, []);
  const refresh = useCallback(async () => {
    const generation = epoch.current;
    const serial = ++snapshotRequest.current;
    try {
      const next = await api('/status');
      if (generation !== epoch.current || serial !== snapshotRequest.current) return;
      clockOffset.current = next.serverNow - Date.now();
      setData(next);
      setOnline(true);
    } catch {
      if (generation === epoch.current && serial === snapshotRequest.current) setOnline(false);
    }
  }, []);
  useEffect(() => {
    if (!authorized) return;
    refresh();
    const timer = setInterval(refresh, 2000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [authorized, refresh]);
  const notify = (msg, isError = false) => {
    if (isError) setError(msg);
    else setMessage(msg);
    setTimeout(() => {
      setMessage('');
      setError('');
    }, 5500);
  };
  async function mutation(fn, success) {
    if (mutationActive.current) throw Error('An update is already in progress.');
    mutationActive.current = true;
    snapshotRequest.current++;
    setBusy(true);
    try {
      const result = await fn();
      if (success) notify(success);
      await refresh();
      return result;
    } catch (e) {
      notify(e.message, true);
      throw e;
    } finally {
      mutationActive.current = false;
      setBusy(false);
    }
  }
  async function run() {
    try {
      await mutation(() => api('/run', { method: 'POST' }), 'Warmup job queued.');
    } catch {}
  }
  async function save(payload) {
    await mutation(
      () =>
        api(modal?.id ? `/schedules/${modal.id}` : '/schedules', {
          method: modal?.id ? 'PATCH' : 'POST',
          body: payload,
        }),
      'Schedule saved.',
    );
  }
  async function del(s) {
    if (!confirm(`Delete ${s.label || 'this alarm'}?`)) return;
    try {
      await mutation(() => api(`/schedules/${s.id}`, { method: 'DELETE' }), 'Alarm deleted.');
    } catch {}
  }
  async function toggle(s) {
    if (mutationActive.current) return;
    const previous = data;
    setData({
      ...data,
      schedules: data.schedules.map((rule) =>
        rule.id === s.id ? { ...rule, enabled: !rule.enabled } : rule,
      ),
    });
    try {
      await mutation(
        () =>
          api(`/schedules/${s.id}`, {
            method: 'PATCH',
            body: { days: s.days, time: s.time, label: s.label, enabled: !s.enabled },
          }),
        s.enabled ? 'Alarm paused.' : 'Alarm enabled.',
      );
    } catch {
      setData(previous);
    }
  }
  async function logout() {
    try {
      await api('/logout', { method: 'POST' });
    } catch {
      /* Local sign-out still clears the view after a network failure. */
    } finally {
      epoch.current++;
      csrfToken = '';
      setAuthorized(false);
      setData(null);
    }
  }
  if (authorized === null)
    return (
      <div className="boot">
        <div className="brand-icon">
          <Zap size={22} />
        </div>
        <p>Loading your control center…</p>
      </div>
    );
  if (!authorized)
    return (
      <Login
        onLogin={async () => {
          setAuthorized(true);
          await refresh();
        }}
      />
    );
  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {nav.map((n) => {
            const Icon = n.icon;
            return (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                className={`nav-item ${view === n.id ? 'active' : ''}`}
              >
                <Icon size={20} />
                {n.label}
                {view === n.id && <span className="nav-active-dot" />}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="side-detail">
            <span className={`connection-pip ${online ? '' : 'offline'}`} />
            {online ? 'Dashboard connected' : 'Connection lost'}
          </div>
          <div className="side-user">
            <div className="avatar">P</div>
            <div>
              <strong>Personal workspace</strong>
              <small>Secure dashboard</small>
            </div>
          </div>
        </div>
      </aside>
      <main className="content">
        <div className="mobile-top">
          <Brand />
          <button aria-label="Check connection" className="mobile-status" onClick={refresh}>
            {online ? <Wifi size={17} /> : <WifiOff size={17} />}
          </button>
        </div>
        <div className="content-inner">
          {!online && (
            <div className="alert error" role="status">
              Connection lost. Showing the last verified status. Reconnect, then refresh to make
              changes.
            </div>
          )}
          <InstallGuide />
          {view === 'overview' && data && (
            <Dashboard
              data={data}
              onRun={run}
              onRefresh={refresh}
              now={now}
              busy={busy}
              online={online}
              setView={setView}
            />
          )}
          {view === 'schedules' && data && (
            <ScheduleView
              data={data}
              onAdd={() => setModal(null)}
              onEdit={setModal}
              onDelete={del}
              onToggle={toggle}
              disabled={busy || !online}
            />
          )}
          {view === 'history' && data && <HistoryView data={data} onRefresh={refresh} />}
          {view === 'settings' && data && (
            <SettingsView
              data={data}
              onRefresh={refresh}
              onLogout={logout}
              onDisconnect={() =>
                mutation(
                  () => api('/auth/remove', { method: 'POST' }),
                  'Codex session disconnected.',
                )
              }
            />
          )}
          {!data && (
            <div className="empty large">
              <RefreshCw size={28} />
              <h2>Connecting to the scheduler…</h2>
              <button className="btn secondary" onClick={refresh}>
                Retry
              </button>
            </div>
          )}
          <footer className="footer">
            <span>Codex Prewarmer · made for focused mornings</span>
            <span>
              <span className="footer-dot" /> Timezone: IST (UTC+05:30)
            </span>
          </footer>
        </div>
      </main>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {nav.map((n) => {
          const Icon = n.icon;
          return (
            <button
              key={n.id}
              className={view === n.id ? 'active' : ''}
              onClick={() => setView(n.id)}
            >
              <Icon size={21} />
              <span>{n.label}</span>
            </button>
          );
        })}
      </nav>
      {modal !== undefined && <ScheduleModal schedule={modal} onClose={closeModal} onSave={save} />}
      {(message || error) && (
        <div className={`toast ${error ? 'toast-error' : ''}`}>
          {error ? <X size={17} /> : <Check size={17} />} {error || message}
          <button
            onClick={() => {
              setMessage('');
              setError('');
            }}
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function InstallGuide() {
  const [prompt, setPrompt] = useState(null),
    [show, setShow] = useState(false);
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  return (
    <div className="install-guide">
      <button
        className="link-button"
        onClick={async () => {
          if (prompt) {
            await prompt.prompt();
            setPrompt(null);
          } else setShow(!show);
        }}
      >
        <Smartphone size={16} /> Install on your phone
      </button>
      {show && (
        <p role="status">
          On Android, open this app in Chrome over HTTPS. Tap the browser menu, then Install app or
          Add to Home screen. Alarms run on the server; installing does not create Android system
          alarms.
        </p>
      )}
    </div>
  );
}
