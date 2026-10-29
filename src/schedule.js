/** Weekdays follow JavaScript Date convention: Sunday=0 ... Saturday=6. */
export const IST_OFFSET_MS = 330 * 60_000;
export const TZ = 'Asia/Kolkata';

export function assertSchedule(input) {
  if (input?.enabled !== undefined && typeof input.enabled !== 'boolean')
    throw Error('Choose one or more valid schedule settings.');
  const days = input?.days;
  if (
    !Array.isArray(days) ||
    days.length === 0 ||
    days.length > 7 ||
    new Set(days).size !== days.length ||
    days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
  ) {
    throw new Error('Choose one or more distinct weekdays (0=Sunday through 6=Saturday).');
  }
  const time = input?.time;
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error('Time must be HH:MM (24-hour).');
  }
  return {
    days: [...days].sort((a, b) => a - b),
    time,
    enabled: input.enabled !== false,
    label: typeof input.label === 'string' ? input.label.trim().slice(0, 60) : '',
  };
}

/** Asia/Kolkata has a fixed UTC+05:30 offset and no daylight-saving transitions. */
export function nextOccurrence(schedule, fromEpochMs) {
  if (!schedule.enabled) return null;
  const local = new Date(fromEpochMs + IST_OFFSET_MS);
  const [hh, mm] = schedule.time.split(':').map(Number);
  for (let advance = 0; advance < 8; advance++) {
    const date = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + advance),
    );
    if (!schedule.days.includes(date.getUTCDay())) continue;
    const when =
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hh, mm) -
      IST_OFFSET_MS;
    if (when > fromEpochMs) return when;
  }
  throw new Error('Could not determine next occurrence.');
}

export function formatIst(epochMs) {
  if (epochMs == null) return null;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: TZ,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(epochMs);
}
