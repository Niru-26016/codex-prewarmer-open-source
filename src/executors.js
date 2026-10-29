/** Supported dispatch engines. The GitHub implementation is intended for development/integration testing only. */
const enc = new TextEncoder();
function base64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function serviceAccountToken(jsonString) {
  if (!jsonString || jsonString.length > 20000) throw new DispatchError();
  const sa = JSON.parse(jsonString);
  if (!sa.client_email || !sa.private_key || !sa.private_key.includes('BEGIN PRIVATE KEY'))
    throw Error('Invalid GCP service account key');
  const now = Math.floor(Date.now() / 1000),
    aud = 'https://oauth2.googleapis.com/token';
  const header = base64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const payload = base64url(
    enc.encode(
      JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/cloud-platform',
        aud,
        iat: now,
        exp: now + 3300,
      }),
    ),
  );
  const pem = sa.private_key.replace(
    /-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g,
    '',
  );
  const der = Uint8Array.from(atob(pem), (x) => x.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    enc.encode(`${header}.${payload}`),
  );
  const assertion = `${header}.${payload}.${base64url(new Uint8Array(signed))}`;
  const res = await fetch(aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    redirect: 'error',
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new DispatchError(res.status === 429 || res.status >= 500, false);
  const body = await res.json();
  if (!body.access_token) throw Error('Google OAuth returned no access token');
  return body.access_token;
}
async function cloudRun(env, jobId) {
  const {
    GCP_PROJECT: project,
    GCP_REGION: region,
    GCP_JOB: job,
    GCP_SERVICE_ACCOUNT_JSON: serviceAccount,
  } = env;
  if (!project || !region || !job || !serviceAccount) throw new DispatchError();
  const token = await serviceAccountToken(serviceAccount);
  const path = `projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(region)}/jobs/${encodeURIComponent(job)}`;
  // Bind this container to one immutable job. Never claim whichever job happens to be next.
  const response = await fetch(`https://run.googleapis.com/v2/${path}:run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      overrides: {
        taskCount: 1,
        containerOverrides: [{ env: [{ name: 'JOB_ID', value: jobId }] }],
      },
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new DispatchError(response.status === 429, response.status >= 500);
  const data = await response.json().catch(() => ({}));
  return data.name
    ? `https://console.cloud.google.com/run/jobs/details/${encodeURIComponent(region)}/${encodeURIComponent(job)}/executions?project=${encodeURIComponent(project)}`
    : null;
}
export async function dispatchJob(env, jobId) {
  if (env.EXECUTOR === 'cloud_run') return cloudRun(env, jobId);
  throw new DispatchError(false, false);
}

export class DispatchError extends Error {
  constructor(retryable = false, uncertain = false) {
    super('DISPATCH_FAILED');
    this.retryable = retryable;
    this.uncertain = uncertain;
  }
}
