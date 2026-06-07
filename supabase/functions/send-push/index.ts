/**
 * Web Push via Web Crypto API (RFC 8291 + RFC 8292).
 * Sem dependências externas — usa apenas APIs nativas do Deno.
 *
 * Chamada: POST /functions/v1/send-push
 * Body JSON: { endpoint, keys: {p256dh, auth}, payload, subject, vapid_private, vapid_public }
 * Auth:  Authorization: Bearer <supabase_service_key>
 */

// ── Utilidades base64url ─────────────────────────────────────────────────────

function b64uDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  return Uint8Array.from(atob(b64 + pad), (c) => c.charCodeAt(0));
}

function b64uEncode(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const len = arrays.reduce((n, a) => n + a.length, 0);
  const result = new Uint8Array(len);
  let off = 0;
  for (const a of arrays) {
    result.set(a, off);
    off += a.length;
  }
  return result;
}

// ── HMAC-SHA-256 helpers ─────────────────────────────────────────────────────

async function hmac256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

// HKDF-Extract(salt, IKM) = HMAC-SHA-256(salt, IKM)
function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<Uint8Array> {
  return hmac256(salt, ikm);
}

// HKDF-Expand(PRK, info, len) — single-step (len ≤ 32)
async function hkdfExpand(
  prk: Uint8Array,
  info: Uint8Array,
  len: number,
): Promise<Uint8Array> {
  return (await hmac256(prk, concat(info, new Uint8Array([1])))).slice(0, len);
}

// ── RFC 8291: cifrar payload para Web Push ───────────────────────────────────

async function encryptPayload(
  p256dh: string,
  auth: string,
  payload: string,
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const uaPublicKey = b64uDecode(p256dh); // 65 bytes (uncompressed P-256)
  const authSecret = b64uDecode(auth); // 16 bytes
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Par efêmero do servidor
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const serverPublicRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKeyPair.publicKey),
  ); // 65 bytes

  // Chave pública do subscriber (UA)
  const uaKey = await crypto.subtle.importKey(
    "raw",
    uaPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  // ECDH shared secret (256 bits = 32 bytes)
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: uaKey },
      serverKeyPair.privateKey,
      256,
    ),
  );

  // PRK_key = HKDF-Extract(auth_secret, shared_secret)
  const prkKey = await hkdfExtract(authSecret, sharedSecret);

  // key_info = "WebPush: info\0" || ua_public || as_public
  const keyInfo = concat(
    enc.encode("WebPush: info\x00"),
    uaPublicKey,
    serverPublicRaw,
  );

  // IKM = HKDF-Expand(PRK_key, key_info, 32)
  const ikm = await hkdfExpand(prkKey, keyInfo, 32);

  // PRK_cek = HKDF-Extract(salt, IKM)
  const prkCek = await hkdfExtract(salt, ikm);

  // CEK (16 bytes) e Nonce (12 bytes)
  const cek = await hkdfExpand(
    prkCek,
    enc.encode("Content-Encoding: aes128gcm\x00"),
    16,
  );
  const nonce = await hkdfExpand(
    prkCek,
    enc.encode("Content-Encoding: nonce\x00"),
    12,
  );

  // Importar CEK para AES-128-GCM
  const cekKey = await crypto.subtle.importKey(
    "raw",
    cek,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  // Cifrar: payload || 0x02 (delimitador de record)
  const plaintext = concat(enc.encode(payload), new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cekKey, plaintext),
  );

  // Header RFC 8291: salt(16) || rs(4) || keyid_len(1) || server_pub(65) || ciphertext
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([65]), serverPublicRaw, ciphertext);
}

// ── RFC 8292: VAPID JWT ──────────────────────────────────────────────────────

// Converte chave privada raw P-256 (32 bytes, base64url) para PKCS8 DER
function rawToPkcs8(rawB64u: string): Uint8Array {
  const raw = b64uDecode(rawB64u);
  // PKCS8 header para P-256 (35 bytes fixos)
  const header = new Uint8Array([
    0x30, 0x41, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06,
    0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03,
    0x01, 0x07, 0x04, 0x27, 0x30, 0x25, 0x02, 0x01,
    0x01, 0x04, 0x20,
  ]);
  return concat(header, raw);
}

async function makeVapidJwt(
  endpoint: string,
  vapidPrivateB64u: string,
  subject: string,
): Promise<string> {
  const pkcs8 = rawToPkcs8(vapidPrivateB64u);
  const privKey = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const enc = new TextEncoder();
  const origin = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);

  const headerB64 = b64uEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payloadB64 = b64uEncode(
    enc.encode(JSON.stringify({ aud: origin, exp: now + 43200, sub: subject })),
  );

  const input = `${headerB64}.${payloadB64}`;
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privKey,
      enc.encode(input),
    ),
  );

  return `${input}.${b64uEncode(sig)}`;
}

// ── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    payload: string;
    subject: string;
    vapid_private: string;
    vapid_public: string;
  };

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { endpoint, keys, payload, subject, vapid_private, vapid_public } = body;

  if (!endpoint || !keys?.p256dh || !keys?.auth || !payload || !vapid_private || !vapid_public) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const encrypted = await encryptPayload(keys.p256dh, keys.auth, payload);
    const jwt = await makeVapidJwt(endpoint, vapid_private, subject);

    const pushRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        "TTL": "86400",
        "Authorization": `vapid t=${jwt},k=${vapid_public}`,
      },
      body: encrypted,
    });

    if (pushRes.status === 404 || pushRes.status === 410) {
      // Subscription expirada — informar o caller para desativar
      return new Response(
        JSON.stringify({ success: false, status: pushRes.status, expired: true }),
        { status: pushRes.status, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!pushRes.ok) {
      const text = await pushRes.text().catch(() => "");
      return new Response(
        JSON.stringify({ success: false, status: pushRes.status, detail: text }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ success: true, status: pushRes.status }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-push error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
