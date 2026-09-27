// Structured log lines (JSON) for operators. Never pass message bodies, names, e-mail
// addresses or file contents here: only ids, counts, durations and error messages.
const SENSITIVE = /(password|token|cookie|csrf|secret|email|body|data)$/i;

export function log(level, event, fields = {}) {
  const safe = {};
  for (const [k, v] of Object.entries(fields)) if (!SENSITIVE.test(k) && v !== undefined) safe[k] = v instanceof Error ? v.message : v;
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...safe });
  (level === "error" || level === "warn" ? console.error : console.log)(line);
}
