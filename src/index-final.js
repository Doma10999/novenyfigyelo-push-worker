import webpush from "web-push";
import { createRemoteJWKSet, jwtVerify } from "jose";

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

const MAX_SUBSCRIPTIONS_PER_USER = 8;
const DEFAULT_APP_URL = "https://noveny-figyelo.netlify.app/";
const DEFAULT_ICON_URL = "https://noveny-figyelo.netlify.app/icon2.png";

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return withCors(request, env, new Response(null, { status: 204 }));
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";

      if (request.method === "GET" && (path === "/" || path === "/health")) {
        return json(request, env, 200, {
          ok: true,
          service: "Novenyfigyelo Push Worker",
          version: "2.0.0"
        });
      }

      if (request.method === "GET" && path === "/vapid-public-key") {
        requireConfig(env, ["VAPID_PUBLIC_KEY"]);
        return json(request, env, 200, { publicKey: String(env.VAPID_PUBLIC_KEY) });
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

      if (request.method === "POST" && path === "/send") {
        requireConfig(env, [
          "PUSH_SUBS",
          "PUSH_API_SECRET",
          "VAPID_PUBLIC_KEY",
          "VAPID_PRIVATE_KEY",
          "VAPID_SUBJECT"
        ]);

        requireAdminSecret(request, env);
        const body = await readJson(request);
        const uid = String(body.uid || "").trim();
        if (!uid) throw httpError(400, "uid_required");

        const title = cleanText(body.title || "Növényfigyelő", 100);
        const message = cleanText(body.body || body.message || "", 300);
        if (!message) throw httpError(400, "message_required");

        const payload = {
          title,
          body: message,
          url: safeHttpsUrl(body.url || env.APP_URL || DEFAULT_APP_URL, DEFAULT_APP_URL),
          icon: safeHttpsUrl(body.icon || env.PUSH_ICON_URL || DEFAULT_ICON_URL, DEFAULT_ICON_URL),
          badge: safeHttpsUrl(body.badge || env.PUSH_BADGE_URL || DEFAULT_ICON_URL, DEFAULT_ICON_URL),
          tag: cleanText(body.tag || "novenyfigyelo", 32),
          type: cleanText(body.type || "general", 32),
          timestamp: Date.now()
        };

        const result = await sendToUser(env, uid, payload);
        return json(request, env, 200, { ok: true, uid, ...result });
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

  webpush.setVapidDetails(
    String(env.VAPID_SUBJECT),
    String(env.VAPID_PUBLIC_KEY),
    String(env.VAPID_PRIVATE_KEY)
  );

  let sent = 0;
  let removed = 0;
  let failed = 0;
  const valid = [];

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

      failed++;
      valid.push(sub);
      console.error("Push send failed:", statusCode, error?.message || error);
    }
  }

  if (valid.length !== list.length) {
    if (valid.length) await env.PUSH_SUBS.put(key, JSON.stringify(valid));
    else await env.PUSH_SUBS.delete(key);
  }

  return { sent, removed, failed, subscriptions: valid.length };
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

function requireAdminSecret(request, env) {
  const supplied = String(request.headers.get("x-push-secret") || "");
  const expected = String(env.PUSH_API_SECRET || "");

  if (!expected || !timingSafeEqualText(supplied, expected)) {
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
