/** Store only documented quota fields; never retain account IDs or raw provider payloads. */
export function sanitizeLimits(input) {
  const window = (w) =>
    w &&
    Number.isFinite(w.usedPercent) &&
    w.usedPercent >= 0 &&
    w.usedPercent <= 100 &&
    Number.isFinite(w.windowDurationMins) &&
    w.windowDurationMins > 0 &&
    Number.isFinite(w.resetsAt) &&
    w.resetsAt > 0
      ? {
          usedPercent: w.usedPercent,
          windowDurationMins: w.windowDurationMins,
          resetsAt: w.resetsAt,
        }
      : null;
  const all = input?.rateLimitsByLimitId || (input?.rateLimits ? { codex: input.rateLimits } : {});
  return Object.entries(all)
    .slice(0, 8)
    .filter(([id]) => /^[a-zA-Z0-9_-]{1,80}$/.test(id))
    .map(([id, b]) => ({ id, primary: window(b?.primary), secondary: window(b?.secondary) }))
    .filter((b) => b.primary || b.secondary);
}
