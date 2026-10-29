import { timingSafeEqual } from 'node:crypto';
const te = new TextEncoder();
const td = new TextDecoder();

function bytesToBase64(bytes) {
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str);
}
function base64ToBytes(s) {
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function urlEncode(s) {
  return bytesToBase64(te.encode(s)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function urlDecode(s) {
  return td.decode(base64ToBytes(s.replace(/-/g, '+').replace(/_/g, '/')));
}

export async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    te.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, te.encode(message));
  return bytesToBase64(new Uint8Array(signature))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = te.encode(a),
    y = te.encode(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export async function makeSession(secret, now = Date.now()) {
  const payload = urlEncode(JSON.stringify({ v: 1, iat: now, exp: now + 7 * 24 * 3600_000 }));
  return `${payload}.${await hmac(secret, payload)}`;
}
export async function verifySession(secret, token, now = Date.now()) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  if (!safeEqual(parts[1], await hmac(secret, parts[0]))) return false;
  try {
    const p = JSON.parse(urlDecode(parts[0]));
    return p.v === 1 && p.iat <= now && p.exp > now && p.exp <= p.iat + 7 * 24 * 3600_000;
  } catch {
    return false;
  }
}
export function sessionCookie(token, clear = false) {
  return `prewarm_session=${clear ? '' : token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${clear ? 0 : 604800}`;
}
export function cookieToken(request) {
  return (request.headers.get('Cookie') || '')
    .split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith('prewarm_session='))
    ?.slice('prewarm_session='.length);
}
export async function encryptJson(keyBase64, obj) {
  const raw = base64ToBytes(keyBase64.trim());
  if (raw.length !== 32) throw new Error('AUTH_ENCRYPTION_KEY must decode to exactly 32 bytes');
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    te.encode(JSON.stringify(obj)),
  );
  return { v: 1, iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(data)) };
}
export async function decryptJson(keyBase64, wrapped) {
  if (!wrapped || wrapped.v !== 1) throw new Error('No compatible auth state.');
  const raw = base64ToBytes(keyBase64.trim());
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(wrapped.iv) },
    key,
    base64ToBytes(wrapped.data),
  );
  return JSON.parse(td.decode(plain));
}
export function validateAuthJson(payload) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    payload.auth_mode !== 'chatgpt' ||
    !payload.tokens ||
    typeof payload.tokens.access_token !== 'string' ||
    !payload.tokens.access_token ||
    typeof payload.tokens.refresh_token !== 'string' ||
    payload.tokens.refresh_token.length < 12 ||
    JSON.stringify(payload).length > 100_000
  )
    throw new Error('INVALID_CODEX_AUTH');
  return payload;
}

export async function hash(value) {
  return bytesToBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(value))));
}

/** Count bytes from the stream; Content-Length alone is attacker-controlled. */
export async function readJson(request, max = 120_000) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || ''))
    throw Error('JSON_REQUIRED');
  if (Number(request.headers.get('content-length')) > max) throw Error('BODY_TOO_LARGE');
  if (!request.body) throw Error('INVALID_JSON');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw Error('BODY_TOO_LARGE');
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(td.decode(joined));
  } catch {
    throw Error('INVALID_JSON');
  }
}
