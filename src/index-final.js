import webpush from "web-push";
import { createRemoteJWKSet, jwtVerify } from "jose";

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

const PUSH_ADMIN_SERVICE_ACCOUNT =
  "firebase-adminsdk-fbsvc@plant-monitor-3976f.iam.gserviceaccount.com";
const PUSH_ADMIN_JWKS = createRemoteJWKSet(
  new URL(
    `https://www.googleapis.com/service_accounts/v1/jwk/${encodeURIComponent(PUSH_ADMIN_SERVICE_ACCOUNT)}`
  )
);

const MAX_SUBSCRIPTIONS_PER_USER = 8;
const WORKER_VERSION = "2.3.0";
const DEFAULT_APP_URL = "https://noveny-figyelo.netlify.app/";
const VAPID_KEYPAIR_KV_KEY = "config:vapid-keypair:v2";
const NOTIFICATION_ASSET_PREFIX = "/notification-assets/v1/";
const NOTIFICATION_ASSET_BASE64 = Object.freeze({
  "/notification-assets/v1/badge-battery.png": [
    "iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAMAAADVRocKAAAABlBMVEX///////9VfPVsAAAAAXRSTlMAQObYZgAAALZJREFUaN7t",
    "mEkSgCAMBMn/P+0HQhaSQWNNH6XsdqNU1iKEEEIIGYkcA9aHEjW9n6j77UKH3yr0+I0COtDl3xbQgchFjD6CzviZ3zWU/Z5ifKB+",
    "CxzHsIAiUrcn54Y547StkflvBnRZ7Iy/EpD5AWGAgXJgTQ+s4QF9cLOD77/5wskOBvl5YP6X3cUA/PMd9QOSnrfpnaWN0FEA/PgA",
    "fCkBvxiCX84pJ/KPdL/+sJJxE0IIIeQdHs/9CRmpnJpIAAAAAElFTkSuQmCC"
  ].join(""),
  "/notification-assets/v1/badge-general.png": [
    "iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAMAAADVRocKAAAACVBMVEX////+/v7////AyniOAAAAAXRSTlMAQObYZgAAANtJREFU",
    "aN7tl0EOwyAMBMH/f3Sl9lAlxXhjeyNV2T2bGRwCgjEURVGUZ2XaJ1Q4SWCHkPHtAjOuYJIFZlTBXPEnmd/ZgKUEeK3VBdtyhx8u",
    "ATolhx8vwQQHpQUDG5bng/9Gu2C28Z3tcxpbESCDnQrwlLDYUJk/ZKjxfYFtCy4coykBjo9bqPJ3hve3KPMjQxl/0ZDAD39DN+HR",
    "HtJ0wNBxe2CytyvRKFh30SpYddEs+LUwBAeJBBJIIIEEEkggwcMF35tXNy8Om09/pUnwp4Ib3uKoI0tXFEW5LS+b2g3av3ZjtwAA",
    "AABJRU5ErkJggg=="
  ].join(""),
  "/notification-assets/v1/badge-water.png": [
    "iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAMAAADVRocKAAAACVBMVEX////+/v7////AyniOAAAAAXRSTlMAQObYZgAAAPJJREFU",
    "aN7t2UEOgzAMBVE89z90F20XVBXETgYJZB/gPwzBImHburq6upZXhAyAnS8LNgCuEG/Ae87gtgCuALJgA+AKsQfWryRwWwBXCGQB",
    "GQBXAFcIGwBXAFcAWbABkAUbOMufFeIcmBvc5/lzLYzkTwk2MJY/IdjAaH5ZsIHx/KJgA5n8kmADufyCcHtgYE7vKzu1s/npFhpY",
    "/oyzQiG/gQYeBxRetNw41Tu4/7B7AHD/r4oHfDrmXubSXlZuICXU8hM3qQj421h/p6+fVfjHOReceB2vpTWn/OblH3axLP4/sTT+",
    "c6u+P+rkH6ZdXT/1AoR4FXuTpQogAAAAAElFTkSuQmCC"
  ].join(""),
  "/notification-assets/v1/icon-battery-critical.png": [
    "iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAMAAABlApw1AAAAhFBMVEX////qVE75ZVzkVlH3Z1/8aWD3Y1vyXFXtV1HjSkbbQj7p",
    "UkzIKirXPTreREHSNzXfRkLlTUndQT/bQT3tcWz1j4vyoJ30qabtpKPwnZvsm5nrh4T2x8X+/v72wL7yuLb3sK3kenj76OfUOTfe",
    "YV/419bpgH3toJ7OMjDMMC/KLSzcQz9p1/tgAAAAAXRSTlMAQObYZgAADWhJREFUeNrtXVl72sgSjXFAaovIuQO2CUuwLewQ5v//",
    "v4v2qu7aWgI/zEdNTDwPds6pOrX0Ivj27WY3u9nNbnYzs91NJpP779OzzVRLkqT8QpamKfofbO5+Mnm4uxb2hwp3BV3DXyKvsM8C",
    "/ImAP82yrHrJ7h8u7vhpbyUBzfW0Ifwhhez8X/1XaZPLhQKirwno4indHwookQiUqBsKjc2vAF/zfk9CiETNhdZPD78Kw2j491Mf",
    "v40AkcBeLqeU/7MM4S/T4bLiMeSv4vquFlEpTNpwId1NpwSBi+BP7fjPNjCdJwF8tf4nTP2H5T8l8GcKgx9D8H+fDtAPU0V9/Iz+",
    "WXP5ReSjViBNOwyBTDXnXKSMSPzG+k/WzKH4XfXlYhk8TCmzNQC5/KeRHFwfg4jxYij+hMXfJgFNwKShCAaEflT8TfVk/V+X/oSs",
    "Pxr4Gr5dRQPKfwd7Rrk+Ba4P5h8Nv4P2aCJA1p9hyk+bos/1Lw2/c5iAs+AP6v/UAJ8m0CJmClCm4/fN0A8mg/TPESCacET7Ks1j",
    "ofbkuwH4k5ltERP6367+zrREjsbfwuc4pAR2tX5Wni97QLSIqPlZk/6MXP4SyRyBv6VA2DwiAHr9SSzjM9m6lPrP+F+rRPchAV3/",
    "PG4Bv5q/bBK4n9YAGPKXKaFt5Un7HhwxPdSuZ/FLIZj48rEsX0gCWD5xy5e6ejL48/PX/ywBsOBv6v+M1U7CjJ6a/nn95LlUiCZI",
    "PgbdzLTlFzM6ywqS/F8SyPO5HgA9hU31J87/FXK+ham94C6KwGxGlv5Uxa9ph2eQd2F4lBU0M9dQXkApKELm+cEp+qnRn+0fUUFV",
    "/mrOnwkr4Gb+b/72648if+dk/dcmp4DB9XwL68bnuPHBtRKSxS8ReOjbl6H+sCOogF/wf1c5OQI5wp9TM+n3Xv828c9o6eAm7NUf",
    "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"
  ].join(""),
  "/notification-assets/v1/icon-battery-low.png": [
    "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"
  ].join(""),
  "/notification-assets/v1/icon-general.png": [
    "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",
    "+I3/x/gvyFW1NivOeRkAAAAASUVORK5CYII="
  ].join(""),
  "/notification-assets/v1/icon-water.png": [
    "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"
  ].join("")
});

let vapidKeyPairPromise = null;

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return withCors(request, env, new Response(null, { status: 204 }));
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";

      if (request.method === "GET" && path.startsWith(NOTIFICATION_ASSET_PREFIX)) {
        const encodedAsset = NOTIFICATION_ASSET_BASE64[path];
        if (!encodedAsset) {
          return json(request, env, 404, { ok: false, error: "asset_not_found" });
        }
        return notificationAssetResponse(request, env, encodedAsset);
      }

      if (request.method === "GET" && (path === "/" || path === "/health")) {
        return json(request, env, 200, {
          ok: true,
          service: "Novenyfigyelo Push Worker",
          version: WORKER_VERSION
        });
      }

      if (request.method === "GET" && path === "/vapid-public-key") {
        requireConfig(env, ["PUSH_SUBS"]);
        const vapid = await getVapidKeyPair(env);
        return json(request, env, 200, { publicKey: vapid.publicKey });
      }

      if (request.method === "GET" && path === "/subscription-status") {
        requireConfig(env, ["PUSH_SUBS", "FIREBASE_PROJECT_ID", "FIREBASE_DB_URL"]);

        const auth = await verifyFirebaseUser(request, env);
        const plus = await getPlusStatus(env, auth);
        const list = await readSubscriptions(env, userSubsKey(auth.uid));

        return json(request, env, 200, {
          ok: true,
          uid: auth.uid,
          activePlus: plus.active,
          available: plus.active,
          plan: plus.plan,
          status: plus.status,
          expiresAt: plus.expiresAt,
          enabled: plus.active && list.length > 0,
          subscriptions: list.length
        });
      }

      if (request.method === "POST" && path === "/subscribe") {
        requireConfig(env, ["PUSH_SUBS", "FIREBASE_PROJECT_ID", "FIREBASE_DB_URL"]);

        const auth = await verifyFirebaseUser(request, env);
        const plus = await getPlusStatus(env, auth);

        if (!plus.active) {
          throw httpError(403, "plus_subscription_required");
        }

        const body = await readJson(request);
        const subscription = normalizeSubscription(body.subscription || body);
        const key = userSubsKey(auth.uid);
        const list = await readSubscriptions(env, key);
        const now = Date.now();

        const entry = {
          endpoint: subscription.endpoint,
          expirationTime: subscription.expirationTime ?? null,
          keys: subscription.keys,
          platform: cleanText(body.platform || "web", 32),
          userAgent: cleanText(request.headers.get("user-agent") || "", 220),
          createdAt: now,
          updatedAt: now
        };

        const existingIndex = list.findIndex((item) => item.endpoint === entry.endpoint);

        if (existingIndex >= 0) {
          entry.createdAt = Number(list[existingIndex].createdAt || now);
          list[existingIndex] = entry;
        } else {
          list.unshift(entry);
        }

        const trimmed = list.slice(0, MAX_SUBSCRIPTIONS_PER_USER);
        await env.PUSH_SUBS.put(key, JSON.stringify(trimmed));

        return json(request, env, 200, {
          ok: true,
          uid: auth.uid,
          subscriptions: trimmed.length
        });
      }

      if (request.method === "POST" && path === "/unsubscribe") {
        requireConfig(env, ["PUSH_SUBS", "FIREBASE_PROJECT_ID"]);

        const auth = await verifyFirebaseUser(request, env);
        const body = await readJson(request);
        const endpoint = String(body.endpoint || "").trim();

        if (!endpoint) throw httpError(400, "endpoint_required");

        const key = userSubsKey(auth.uid);
        const list = await readSubscriptions(env, key);
        const next = list.filter((item) => item.endpoint !== endpoint);

        if (next.length) {
          await env.PUSH_SUBS.put(key, JSON.stringify(next));
        } else {
          await env.PUSH_SUBS.delete(key);
        }

        return json(request, env, 200, {
          ok: true,
          uid: auth.uid,
          subscriptions: next.length
        });
      }

      if (request.method === "POST" && path === "/test") {
        requireConfig(env, [
          "PUSH_SUBS",
          "FIREBASE_PROJECT_ID",
          "FIREBASE_DB_URL"
        ]);

        const auth = await verifyFirebaseUser(request, env);
        const plus = await getPlusStatus(env, auth);
        if (!plus.active) throw httpError(403, "plus_subscription_required");

        const rateKey = `test-rate:${auth.uid}`;
        if (await env.PUSH_SUBS.get(rateKey)) {
          throw httpError(429, "test_rate_limited");
        }

        await env.PUSH_SUBS.put(rateKey, String(Date.now()), { expirationTtl: 30 });

        const notificationIcons = notificationIconsFor(request, "test");
        const result = await sendToUser(env, auth.uid, {
          title: "🌱 Növényfigyelő teszt",
          body: "A push értesítés megfelelően működik ezen az eszközön.",
          url: safeHttpsUrl(env.APP_URL || DEFAULT_APP_URL, DEFAULT_APP_URL),
          icon: notificationIcons.icon,
          badge: notificationIcons.badge,
          tag: "novenyfigyelo_test",
          type: "test",
          timestamp: Date.now()
        });

        if (!result.sent) throw httpError(409, "push_subscription_not_found");
        return json(request, env, 200, {
          ok: true,
          version: WORKER_VERSION,
          uid: auth.uid,
          ...result
        });
      }

      if (request.method === "POST" && path === "/send") {
        requireConfig(env, ["PUSH_SUBS"]);

        await requirePushAdmin(request, env);
        const body = await readJson(request);
        const uid = String(body.uid || "").trim();
        if (!uid) throw httpError(400, "uid_required");

        const title = cleanText(body.title || "Növényfigyelő", 100);
        const message = cleanText(body.body || body.message || "", 300);
        if (!message) throw httpError(400, "message_required");
        const type = cleanText(body.type || "general", 32);
        const notificationIcons = notificationIconsFor(request, type);

        const payload = {
          title,
          body: message,
          url: safeHttpsUrl(body.url || env.APP_URL || DEFAULT_APP_URL, DEFAULT_APP_URL),
          icon: safeHttpsUrl(body.icon || notificationIcons.icon, notificationIcons.icon),
          badge: safeHttpsUrl(body.badge || notificationIcons.badge, notificationIcons.badge),
          tag: cleanText(body.tag || "novenyfigyelo", 32),
          type,
          timestamp: Date.now()
        };

        const result = await sendToUser(env, uid, payload);
        return json(request, env, 200, {
          ok: true,
          version: WORKER_VERSION,
          uid,
          ...result
        });
      }

      return json(request, env, 404, { ok: false, error: "not_found" });
    } catch (error) {
      const status = Number(error?.status || 500);
      const message = error?.publicMessage
        ? error.publicMessage
        : status >= 500
          ? "internal_error"
          : String(error?.message || "request_failed");

      console.error("Worker error:", error);
      return json(request, env, status, { ok: false, error: message });
    }
  }
};

async function verifyFirebaseUser(request, env) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw httpError(401, "missing_firebase_token");

  const token = match[1].trim();
  const projectId = String(env.FIREBASE_PROJECT_ID || "").trim();
  if (!projectId) throw httpError(500, "firebase_project_not_configured");

  try {
    const result = await jwtVerify(token, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ["RS256"]
    });

    const uid = String(result.payload.sub || "").trim();
    if (!uid) throw new Error("missing_sub");

    return {
      uid,
      email: String(result.payload.email || ""),
      token
    };
  } catch (error) {
    console.warn("Firebase token rejected:", error?.message || error);
    throw httpError(401, "invalid_firebase_token");
  }
}

async function getPlusStatus(env, auth) {
  const baseUrl = String(env.FIREBASE_DB_URL || "").trim().replace(/\/+$/, "");
  if (!baseUrl) throw httpError(500, "firebase_db_not_configured");
  if (!auth?.uid || !auth?.token) throw httpError(401, "invalid_firebase_user");

  const url = `${baseUrl}/users/${encodeURIComponent(auth.uid)}/subscription.json?auth=${encodeURIComponent(auth.token)}`;

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
  } catch (error) {
    console.error("Firebase subscription lookup failed:", error);
    throw httpError(503, "subscription_check_unavailable");
  }

  if (response.status === 401 || response.status === 403) {
    throw httpError(403, "subscription_access_denied");
  }

  if (!response.ok) {
    console.error("Firebase subscription lookup HTTP:", response.status);
    throw httpError(503, "subscription_check_failed");
  }

  let subscription;
  try {
    subscription = (await response.json()) || {};
  } catch {
    throw httpError(503, "subscription_data_invalid");
  }

  const plan = String(subscription.plan || "free").trim().toLowerCase();
  const status = String(subscription.status || "inactive").trim().toLowerCase();
  let expiresAt = Number(subscription.expiresAt || 0);

  if (expiresAt > 0 && expiresAt < 100000000000) expiresAt *= 1000;

  const inactiveStatuses = new Set([
    "free",
    "inactive",
    "canceled",
    "cancelled",
    "expired",
    "incomplete",
    "incomplete_expired",
    "unpaid",
    "paused"
  ]);

  const active = plan === "plus" &&
    !inactiveStatuses.has(status) &&
    !(expiresAt > 0 && expiresAt <= Date.now());

  return { active, plan, status, expiresAt };
}

async function sendToUser(env, uid, payload) {
  const key = userSubsKey(uid);
  const list = await readSubscriptions(env, key);

  if (!list.length) {
    return { sent: 0, removed: 0, failed: 0, subscriptions: 0 };
  }

  const vapid = await getVapidKeyPair(env);
  webpush.setVapidDetails(
    validVapidSubject(env.VAPID_SUBJECT),
    vapid.publicKey,
    vapid.privateKey
  );

  let sent = 0;
  let removed = 0;
  let failed = 0;
  const valid = [];
  const errors = [];

  for (const sub of list) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          expirationTime: sub.expirationTime ?? null,
          keys: sub.keys
        },
        JSON.stringify(payload),
        {
          TTL: 60 * 60 * 6,
          urgency: payload.type === "battery_critical" ? "high" : "normal",
          topic: sanitizeTopic(payload.tag)
        }
      );

      sent++;
      valid.push(sub);
    } catch (error) {
      const statusCode = Number(error?.statusCode || 0);

      if (statusCode === 404 || statusCode === 410) {
        removed++;
        continue;
      }

      const message = cleanText(error?.message || "push_failed", 220);
      const responseBody = cleanText(error?.body || "", 220);

      failed++;
      valid.push(sub);
      errors.push({ statusCode, message, responseBody });
      console.error("Push send failed:", statusCode, message, responseBody);
    }
  }

  if (valid.length !== list.length) {
    if (valid.length) await env.PUSH_SUBS.put(key, JSON.stringify(valid));
    else await env.PUSH_SUBS.delete(key);
  }

  return {
    sent,
    removed,
    failed,
    subscriptions: valid.length,
    errors: errors.slice(0, 4)
  };
}

async function getVapidKeyPair(env) {
  if (!vapidKeyPairPromise) {
    vapidKeyPairPromise = (async () => {
      const saved = await env.PUSH_SUBS.get(VAPID_KEYPAIR_KV_KEY);

      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed?.publicKey && parsed?.privateKey) return parsed;
        } catch {
          // Sérült régi érték esetén alább új kulcspár készül.
        }
      }

      const generated = webpush.generateVAPIDKeys();
      const keyPair = {
        publicKey: generated.publicKey,
        privateKey: generated.privateKey
      };

      await env.PUSH_SUBS.put(VAPID_KEYPAIR_KV_KEY, JSON.stringify(keyPair));
      return keyPair;
    })().catch((error) => {
      vapidKeyPairPromise = null;
      throw error;
    });
  }

  return vapidKeyPairPromise;
}

function validVapidSubject(value) {
  const subject = String(value || "").trim();
  return /^(mailto:|https:\/\/)/i.test(subject) ? subject : DEFAULT_APP_URL;
}

function notificationIconsFor(request, type) {
  const origin = new URL(request.url).origin;
  const normalizedType = String(type || "general").trim().toLowerCase();
  let iconName = "icon-general.png";
  let badgeName = "badge-general.png";

  if (normalizedType === "soil_low") {
    iconName = "icon-water.png";
    badgeName = "badge-water.png";
  } else if (normalizedType === "battery_critical") {
    iconName = "icon-battery-critical.png";
    badgeName = "badge-battery.png";
  } else if (normalizedType === "battery_low") {
    iconName = "icon-battery-low.png";
    badgeName = "badge-battery.png";
  }

  return {
    icon: origin + NOTIFICATION_ASSET_PREFIX + iconName,
    badge: origin + NOTIFICATION_ASSET_PREFIX + badgeName
  };
}

function notificationAssetResponse(request, env, encodedAsset) {
  const binary = atob(encodedAsset);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return withCors(
    request,
    env,
    new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff"
      }
    })
  );
}

function normalizeSubscription(raw) {
  const endpoint = String(raw?.endpoint || "").trim();
  const p256dh = String(raw?.keys?.p256dh || "").trim();
  const auth = String(raw?.keys?.auth || "").trim();

  if (!endpoint.startsWith("https://")) throw httpError(400, "invalid_endpoint");
  if (!p256dh || !auth) throw httpError(400, "missing_subscription_keys");

  return {
    endpoint,
    expirationTime: raw?.expirationTime ?? null,
    keys: { p256dh, auth }
  };
}

async function readSubscriptions(env, key) {
  const raw = await env.PUSH_SUBS.get(key);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item) => item?.endpoint && item?.keys?.p256dh && item?.keys?.auth)
      : [];
  } catch {
    return [];
  }
}

function userSubsKey(uid) {
  return `subs:${uid}`;
}

async function requirePushAdmin(request, env) {
  const supplied = String(request.headers.get("x-push-secret") || "");
  const expected = String(env.PUSH_API_SECRET || "");

  // A korábbi, titkos kulcsos szerverek továbbra is működnek.
  if (expected && timingSafeEqualText(supplied, expected)) {
    return;
  }

  const header = String(request.headers.get("authorization") || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw httpError(401, "unauthorized");

  const target = new URL(request.url);
  const audience = `${target.origin}${target.pathname}`;

  try {
    await jwtVerify(match[1].trim(), PUSH_ADMIN_JWKS, {
      issuer: PUSH_ADMIN_SERVICE_ACCOUNT,
      subject: PUSH_ADMIN_SERVICE_ACCOUNT,
      audience,
      algorithms: ["RS256"],
      maxTokenAge: "10m",
      clockTolerance: 10
    });
  } catch (error) {
    console.warn("Push admin token rejected:", error?.message || error);
    throw httpError(401, "unauthorized");
  }
}

function timingSafeEqualText(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function sanitizeTopic(value) {
  return String(value || "novenyfigyelo")
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .slice(0, 32) || "novenyfigyelo";
}

function safeHttpsUrl(value, fallback) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" ? url.href : fallback;
  } catch {
    return fallback;
  }
}

function cleanText(value, maxLength) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

async function readJson(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw httpError(415, "json_required");
  }

  try {
    return await request.json();
  } catch {
    throw httpError(400, "invalid_json");
  }
}

function requireConfig(env, names) {
  for (const name of names) {
    if (!env[name]) throw httpError(500, `missing_config_${name.toLowerCase()}`);
  }
}

function allowedOrigins(env) {
  const defaults = [
    "https://novenyfigyelo.netlify.app",
    "https://noveny-figyelo.netlify.app"
  ];

  const configured = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set([...defaults, ...configured])];
}

function withCors(request, env, response) {
  const origin = request.headers.get("origin") || "";
  const headers = new Headers(response.headers);

  if (origin && allowedOrigins(env).includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }

  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Push-Secret");
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function json(request, env, status, body) {
  return withCors(
    request,
    env,
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    })
  );
}

function httpError(status, publicMessage) {
  const error = new Error(publicMessage);
  error.status = status;
  error.publicMessage = publicMessage;
  return error;
}
