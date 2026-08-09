import webpush from 'web-push';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
  )
);

const MAX_SUBSCRIPTIONS_PER_USER = 8;

export default {
  async fetch(request, env) {
    try {
      if (request.method === 'OPTIONS') {
        return withCors(
          request,
          env,
          new Response(null, { status: 204 })
        );
      }

      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, '') || '/';

      /* =====================================================
         HEALTH
         ===================================================== */

      if (
        request.method === 'GET' &&
        (path === '/' || path === '/health')
      ) {
        return json(request, env, 200, {
          ok: true,
          service: 'Novenyfigyelo Push Worker',
          version: '1.1.0'
        });
      }

      /* =====================================================
         VAPID PUBLIC KEY
         ===================================================== */

      if (
        request.method === 'GET' &&
        path === '/vapid-public-key'
      ) {
        requireConfig(env, [
          'VAPID_PUBLIC_KEY'
        ]);

        return json(request, env, 200, {
          publicKey: env.VAPID_PUBLIC_KEY
        });
      }

      /* =====================================================
         PUSH FELIRATKOZÁS
         CSAK AKTÍV PLUS FELHASZNÁLÓ
         ===================================================== */

      if (
        request.method === 'POST' &&
        path === '/subscribe'
      ) {
        requireConfig(env, [
          'PUSH_SUBS',
          'FIREBASE_PROJECT_ID',
          'FIREBASE_DB_URL'
        ]);

        const auth =
          await verifyFirebaseUser(
            request,
            env
          );

        // FONTOS:
        // csak aktív Plus felhasználó
        // regisztrálhat push értesítést
        await requireActivePlus(
          env,
          auth
        );

        const body =
          await readJson(request);

        const subscription =
          normalizeSubscription(
            body.subscription || body
          );

        const key =
          userSubsKey(auth.uid);

        const list =
          await readSubscriptions(
            env,
            key
          );

        const now =
          Date.now();

        const entry = {
          endpoint:
            subscription.endpoint,

          expirationTime:
            subscription.expirationTime ??
            null,

          keys:
            subscription.keys,

          platform:
            cleanText(
              body.platform || 'web',
              32
            ),

          userAgent:
            cleanText(
              request.headers.get(
                'user-agent'
              ) || '',
              220
            ),

          createdAt:
            now,

          updatedAt:
            now
        };

        const existingIndex =
          list.findIndex(
            (x) =>
              x.endpoint ===
              entry.endpoint
          );

        if (
          existingIndex >= 0
        ) {
          entry.createdAt =
            Number(
              list[existingIndex]
                .createdAt ||
              now
            );

          list[existingIndex] =
            entry;
        } else {
          list.unshift(entry);
        }

        const trimmed =
          list.slice(
            0,
            MAX_SUBSCRIPTIONS_PER_USER
          );

        await env.PUSH_SUBS.put(
          key,
          JSON.stringify(trimmed)
        );

        return json(
          request,
          env,
          200,
          {
            ok: true,
            uid: auth.uid,
            subscriptions:
              trimmed.length
          }
        );
      }

      /* =====================================================
         LEIRATKOZÁS
         ===================================================== */

      if (
        request.method === 'POST' &&
        path === '/unsubscribe'
      ) {
        requireConfig(env, [
          'PUSH_SUBS',
          'FIREBASE_PROJECT_ID'
        ]);

        const auth =
          await verifyFirebaseUser(
            request,
            env
          );

        const body =
          await readJson(request);

        const endpoint =
          String(
            body.endpoint || ''
          ).trim();

        if (!endpoint) {
          throw httpError(
            400,
            'endpoint_required'
          );
        }

        const key =
          userSubsKey(auth.uid);

        const list =
          await readSubscriptions(
            env,
            key
          );

        const next =
          list.filter(
            (x) =>
              x.endpoint !==
              endpoint
          );

        if (next.length) {
          await env.PUSH_SUBS.put(
            key,
            JSON.stringify(next)
          );
        } else {
          await env.PUSH_SUBS.delete(
            key
          );
        }

        return json(
          request,
          env,
          200,
          {
            ok: true,
            uid: auth.uid,
            subscriptions:
              next.length
          }
        );
      }

      /* =====================================================
         PUSH ÁLLAPOT
         CSAK PLUS
         ===================================================== */

      if (
        request.method === 'GET' &&
        path ===
          '/subscription-status'
      ) {
        requireConfig(env, [
          'PUSH_SUBS',
          'FIREBASE_PROJECT_ID',
          'FIREBASE_DB_URL'
        ]);

        const auth =
          await verifyFirebaseUser(
            request,
            env
          );

        await requireActivePlus(
          env,
          auth
        );

        const list =
          await readSubscriptions(
            env,
            userSubsKey(auth.uid)
          );

        return json(
          request,
          env,
          200,
          {
            ok: true,
            enabled:
              list.length > 0,
            subscriptions:
              list.length
          }
        );
      }

      /* =====================================================
         PUSH KÜLDÉS
         APPS SCRIPT / BACKEND
         ===================================================== */

      if (
        request.method === 'POST' &&
        path === '/send'
      ) {
        requireConfig(env, [
          'PUSH_SUBS',
          'PUSH_API_SECRET',
          'VAPID_PUBLIC_KEY',
          'VAPID_PRIVATE_KEY',
          'VAPID_SUBJECT'
        ]);

        requireAdminSecret(
          request,
          env
        );

        const body =
          await readJson(request);

        const uid =
          String(
            body.uid || ''
          ).trim();

        if (!uid) {
          throw httpError(
            400,
            'uid_required'
          );
        }

        const title =
          cleanText(
            body.title ||
              'Növényfigyelő',
            100
          );

        const message =
          cleanText(
            body.body ||
              body.message ||
              '',
            300
          );

        if (!message) {
          throw httpError(
            400,
            'message_required'
          );
        }

        const payload = {
          title,

          body:
            message,

          url:
            safeAppUrl(
              body.url ||
                env.APP_URL ||
                'https://novenyfigyelo.netlify.app/'
            ),

          icon:
            safeAppUrl(
              body.icon ||
                env.PUSH_ICON_URL ||
                'https://novenyfigyelo.netlify.app/icon2.png'
            ),

          badge:
            safeAppUrl(
              body.badge ||
                env.PUSH_BADGE_URL ||
                'https://novenyfigyelo.netlify.app/icon2.png'
            ),

          tag:
            cleanText(
              body.tag ||
                'novenyfigyelo',
              32
            ),

          type:
            cleanText(
              body.type ||
                'general',
              32
            ),

          timestamp:
            Date.now()
        };

        const result =
          await sendToUser(
            env,
            uid,
            payload
          );

        return json(
          request,
          env,
          200,
          {
            ok: true,
            uid,
            ...result
          }
        );
      }

      /* =====================================================
         404
         ===================================================== */

      return json(
        request,
        env,
        404,
        {
          ok: false,
          error:
            'not_found'
        }
      );
    } catch (error) {
      const status =
        Number(
          error &&
            error.status
        ) || 500;

      const message =
        error &&
        error.publicMessage
          ? error.publicMessage
          : status >= 500
            ? 'internal_error'
            : String(
                error?.message ||
                  'request_failed'
              );

      console.error(
        'Worker error:',
        error
      );

      return json(
        request,
        env,
        status,
        {
          ok: false,
          error: message
        }
      );
    }
  }
};


/* =========================================================
   PUSH KÜLDÉS FELHASZNÁLÓNAK
   ========================================================= */

async function sendToUser(
  env,
  uid,
  payload
) {
  const key =
    userSubsKey(uid);

  const list =
    await readSubscriptions(
      env,
      key
    );

  if (!list.length) {
    return {
      sent: 0,
      removed: 0,
      failed: 0,
      subscriptions: 0
    };
  }

  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY
  );

  let sent = 0;
  let removed = 0;
  let failed = 0;

  const valid = [];

  for (const sub of list) {
    try {
      await webpush.sendNotification(
        {
          endpoint:
            sub.endpoint,

          expirationTime:
            sub.expirationTime ??
            null,

          keys:
            sub.keys
        },

        JSON.stringify(
          payload
        ),

        {
          TTL:
            60 * 60 * 6,

          urgency:
            payload.type ===
            'battery_critical'
              ? 'high'
              : 'normal',

          topic:
            sanitizeTopic(
              payload.tag
            )
        }
      );

      sent++;
      valid.push(sub);
    } catch (error) {
      const statusCode =
        Number(
          error?.statusCode ||
            0
        );

      if (
        statusCode === 404 ||
        statusCode === 410
      ) {
        removed++;
        continue;
      }

      failed++;
      valid.push(sub);

      console.error(
        'Push send failed:',
        statusCode,
        error?.message ||
          error
      );
    }
  }

  if (
    valid.length !==
    list.length
  ) {
    if (valid.length) {
      await env.PUSH_SUBS.put(
        key,
        JSON.stringify(valid)
      );
    } else {
      await env.PUSH_SUBS.delete(
        key
      );
    }
  }

  return {
    sent,
    removed,
    failed,
    subscriptions:
      valid.length
  };
}


/* =========================================================
   FIREBASE USER TOKEN ELLENŐRZÉS
   ========================================================= */

async function verifyFirebaseUser(
  request,
  env
) {
  const header =
    request.headers.get(
      'authorization'
    ) || '';

  const match =
    header.match(
      /^Bearer\s+(.+)$/i
    );

  if (!match) {
    throw httpError(
      401,
      'missing_firebase_token'
    );
  }

  const token =
    match[1].trim();

  const projectId =
    String(
      env.FIREBASE_PROJECT_ID ||
        ''
    ).trim();

  if (!projectId) {
    throw httpError(
      500,
      'firebase_project_not_configured'
    );
  }

  try {
    const result =
      await jwtVerify(
        token,
        FIREBASE_JWKS,
        {
          issuer:
            `https://securetoken.google.com/${projectId}`,

          audience:
            projectId,

          algorithms: [
            'RS256'
          ]
        }
      );

    const uid =
      String(
        result.payload.sub ||
          ''
      ).trim();

    if (!uid) {
      throw new Error(
        'missing_sub'
      );
    }

    return {
      uid,

      email:
        String(
          result.payload.email ||
            ''
        ),

      token
    };
  } catch (error) {
    console.warn(
      'Firebase token rejected:',
      error?.message ||
        error
    );

    throw httpError(
      401,
      'invalid_firebase_token'
    );
  }
}


/* =========================================================
   PLUS JOGOSULTSÁG ELLENŐRZÉS
   ========================================================= */

async function requireActivePlus(
  env,
  auth
) {
  const baseUrl =
    String(
      env.FIREBASE_DB_URL ||
        ''
    )
      .trim()
      .replace(/\/+$/, '');

  if (!baseUrl) {
    throw httpError(
      500,
      'firebase_db_not_configured'
    );
  }

  if (
    !auth ||
    !auth.uid ||
    !auth.token
  ) {
    throw httpError(
      401,
      'invalid_firebase_user'
    );
  }

  const url =
    baseUrl +
    '/users/' +
    encodeURIComponent(
      auth.uid
    ) +
    '/subscription.json?auth=' +
    encodeURIComponent(
      auth.token
    );

  let response;

  try {
    response =
      await fetch(
        url,
        {
          method: 'GET',

          headers: {
            Accept:
              'application/json'
          }
        }
      );
  } catch (error) {
    console.error(
      'Firebase subscription lookup failed:',
      error
    );

    throw httpError(
      503,
      'subscription_check_unavailable'
    );
  }

  if (
    response.status === 401 ||
    response.status === 403
  ) {
    throw httpError(
      403,
      'subscription_access_denied'
    );
  }

  if (!response.ok) {
    console.error(
      'Firebase subscription lookup HTTP:',
      response.status
    );

    throw httpError(
      503,
      'subscription_check_failed'
    );
  }

  let subscription = {};

  try {
    subscription =
      await response.json();
  } catch (error) {
    throw httpError(
      503,
      'subscription_data_invalid'
    );
  }

  subscription =
    subscription || {};

  const plan =
    String(
      subscription.plan ||
        ''
    )
      .toLowerCase()
      .trim();

  const status =
    String(
      subscription.status ||
        ''
    )
      .toLowerCase()
      .trim();

  let expiresAt =
    Number(
      subscription.expiresAt ||
        0
    );

  // Ha valamiért másodpercben van eltárolva,
  // átalakítjuk milliszekundumra.
  if (
    expiresAt > 0 &&
    expiresAt <
      100000000000
  ) {
    expiresAt *= 1000;
  }

  const inactiveStatuses = [
    'free',
    'canceled',
    'cancelled',
    'expired',
    'incomplete',
    'incomplete_expired',
    'unpaid',
    'paused'
  ];

  const activePlus =
    plan === 'plus' &&
    !inactiveStatuses.includes(
      status
    ) &&
    !(
      expiresAt > 0 &&
      expiresAt <=
        Date.now()
    );

  if (!activePlus) {
    throw httpError(
      403,
      'plus_subscription_required'
    );
  }

  return {
    plan,
    status,
    expiresAt
  };
}


/* =========================================================
   ADMIN PUSH SECRET
   ========================================================= */

function requireAdminSecret(
  request,
  env
) {
  const supplied =
    String(
      request.headers.get(
        'x-push-secret'
      ) || ''
    );

  const expected =
    String(
      env.PUSH_API_SECRET ||
        ''
    );

  if (
    !expected ||
    !timingSafeEqualText(
      supplied,
      expected
    )
  ) {
    throw httpError(
      401,
      'unauthorized'
    );
  }
}


/* =========================================================
   TIMING SAFE STRING CHECK
   ========================================================= */

function timingSafeEqualText(
  a,
  b
) {
  if (
    !a ||
    !b ||
    a.length !== b.length
  ) {
    return false;
  }

  let diff = 0;

  for (
    let i = 0;
    i < a.length;
    i++
  ) {
    diff |=
      a.charCodeAt(i) ^
      b.charCodeAt(i);
  }

  return diff === 0;
}


/* =========================================================
   PUSH SUBSCRIPTION NORMALIZÁLÁS
   ========================================================= */

function normalizeSubscription(
  raw
) {
  const endpoint =
    String(
      raw?.endpoint ||
        ''
    ).trim();

  const p256dh =
    String(
      raw?.keys?.p256dh ||
        ''
    ).trim();

  const auth =
    String(
      raw?.keys?.auth ||
        ''
    ).trim();

  if (
    !endpoint.startsWith(
      'https://'
    )
  ) {
    throw httpError(
      400,
      'invalid_endpoint'
    );
  }

  if (
    !p256dh ||
    !auth
  ) {
    throw httpError(
      400,
      'missing_subscription_keys'
    );
  }

  return {
    endpoint,

    expirationTime:
      raw?.expirationTime ??
      null,

    keys: {
      p256dh,
      auth
    }
  };
}


/* =========================================================
   KV OLVASÁS
   ========================================================= */

async function readSubscriptions(
  env,
  key
) {
  const raw =
    await env.PUSH_SUBS.get(
      key
    );

  if (!raw) {
    return [];
  }

  try {
    const parsed =
      JSON.parse(raw);

    return Array.isArray(
      parsed
    )
      ? parsed.filter(
          (x) =>
            x?.endpoint &&
            x?.keys
        )
      : [];
  } catch {
    return [];
  }
}


/* =========================================================
   KV KEY
   ========================================================= */

function userSubsKey(uid) {
  return `subs:${uid}`;
}


/* =========================================================
   PUSH TOPIC
   ========================================================= */

function sanitizeTopic(
  value
) {
  return (
    String(
      value ||
        'novenyfigyelo'
    )
      .replace(
        /[^A-Za-z0-9_-]/g,
        '_'
      )
      .slice(0, 32) ||
    'novenyfigyelo'
  );
}


/* =========================================================
   BIZTONSÁGOS APP URL
   ========================================================= */

function safeAppUrl(
  value
) {
  const text =
    String(
      value || ''
    ).trim();

  try {
    const url =
      new URL(text);

    if (
      url.protocol !==
      'https:'
    ) {
      return 'https://novenyfigyelo.netlify.app/';
    }

    return url.href;
  } catch {
    return 'https://novenyfigyelo.netlify.app/';
  }
}


/* =========================================================
   SZÖVEG TISZTÍTÁS
   ========================================================= */

function cleanText(
  value,
  maxLength
) {
  return String(
    value ?? ''
  )
    .replace(
      /[\u0000-\u001F\u007F]/g,
      ' '
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
    .slice(
      0,
      maxLength
    );
}


/* =========================================================
   JSON REQUEST
   ========================================================= */

async function readJson(
  request
) {
  const contentType =
    request.headers.get(
      'content-type'
    ) || '';

  if (
    !contentType
      .toLowerCase()
      .includes(
        'application/json'
      )
  ) {
    throw httpError(
      415,
      'json_required'
    );
  }

  try {
    return await request.json();
  } catch {
    throw httpError(
      400,
      'invalid_json'
    );
  }
}


/* =========================================================
   CONFIG ELLENŐRZÉS
   ========================================================= */

function requireConfig(
  env,
  names
) {
  for (
    const name of names
  ) {
    if (!env[name]) {
      throw httpError(
        500,
        `missing_config_${name.toLowerCase()}`
      );
    }
  }
}


/* =========================================================
   ENGEDÉLYEZETT ORIGINEK
   ========================================================= */

function allowedOrigins(
  env
) {
  return String(
    env.ALLOWED_ORIGINS ||
      'https://novenyfigyelo.netlify.app'
  )
    .split(',')
    .map(
      (x) =>
        x.trim()
    )
    .filter(Boolean);
}


/* =========================================================
   CORS
   ========================================================= */

function withCors(
  request,
  env,
  response
) {
  const origin =
    request.headers.get(
      'origin'
    ) || '';

  const allowed =
    allowedOrigins(env);

  const headers =
    new Headers(
      response.headers
    );

  if (
    origin &&
    allowed.includes(
      origin
    )
  ) {
    headers.set(
      'Access-Control-Allow-Origin',
      origin
    );

    headers.set(
      'Vary',
      'Origin'
    );
  }

  headers.set(
    'Access-Control-Allow-Methods',
    'GET,POST,OPTIONS'
  );

  headers.set(
    'Access-Control-Allow-Headers',
    'Authorization,Content-Type,X-Push-Secret'
  );

  headers.set(
    'Access-Control-Max-Age',
    '86400'
  );

  headers.set(
    'X-Content-Type-Options',
    'nosniff'
  );

  headers.set(
    'Referrer-Policy',
    'no-referrer'
  );

  return new Response(
    response.body,
    {
      status:
        response.status,

      statusText:
        response.statusText,

      headers
    }
  );
}


/* =========================================================
   JSON RESPONSE
   ========================================================= */

function json(
  request,
  env,
  status,
  body
) {
  return withCors(
    request,
    env,

    new Response(
      JSON.stringify(
        body
      ),
      {
        status,

        headers: {
          'Content-Type':
            'application/json; charset=utf-8',

          'Cache-Control':
            'no-store'
        }
      }
    )
  );
}


/* =========================================================
   HTTP ERROR
   ========================================================= */

function httpError(
  status,
  publicMessage
) {
  const error =
    new Error(
      publicMessage
    );

  error.status =
    status;

  error.publicMessage =
    publicMessage;

  return error;
}
