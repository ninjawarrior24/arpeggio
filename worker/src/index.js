const JSON_HEADERS = { "content-type": "application/json; charset=UTF-8" };

function corsHeaders(origin) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "Origin",
  };
}

function response(status, body, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(origin) },
  });
}

async function hash(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isText(value, min, max) {
  return typeof value === "string" && value.trim().length >= min && value.trim().length <= max;
}

async function verifyTurnstile(token, request, secret) {
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) form.append("remoteip", ip);

  const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  return result.ok && (await result.json()).success === true;
}

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    if (!origin || !allowedOrigins(env).includes(origin)) {
      return new Response("Forbidden", { status: 403 });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }
    if (request.method !== "POST") {
      return response(405, { error: "Method not allowed." }, origin);
    }
    if (!request.headers.get("content-type")?.includes("application/json")) {
      return response(415, { error: "JSON is required." }, origin);
    }

    const ip = request.headers.get("CF-Connecting-IP");
    if (ip) {
      const id = env.RATE_LIMITER.idFromName(await hash(ip));
      const limit = await env.RATE_LIMITER.get(id).fetch("https://rate-limiter/check");
      const decision = await limit.json();
      if (!decision.allowed) {
        return response(429, { error: "Too many requests. Please try again later." }, origin);
      }
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return response(400, { error: "Invalid request." }, origin);
    }

    const { name, email, message, turnstileToken, website } = body;
    if (website) return response(200, { ok: true }, origin);
    if (!isText(name, 1, 120) ||
        !isText(email, 3, 254) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !isText(message, 5, 5000) ||
        !isText(turnstileToken, 1, 2048)) {
      return response(400, { error: "Please provide a valid name, email, message, and verification." }, origin);
    }

    if (!env.CONTACT_DB || !env.RESEND_API_KEY || !env.FROM_EMAIL || !env.TO_EMAIL) {
      return response(503, { error: "Unable to send the message right now. Please try again later." }, origin);
    }

    const verified = await verifyTurnstile(turnstileToken, request, env.TURNSTILE_SECRET_KEY);
    if (!verified) {
      return response(400, { error: "Verification failed. Please try again." }, origin);
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    try {
      await env.CONTACT_DB.prepare(
        "INSERT INTO contact_submissions (id, name, email, message, created_at, delivery_status) VALUES (?, ?, ?, ?, ?, 'pending')"
      ).bind(id, name.trim(), email.trim(), message.trim(), createdAt).run();
    } catch {
      return response(503, { error: "Unable to save the message right now. Please try again later." }, origin);
    }

    const cc = (env.CC_EMAIL || "")
      .split(/[;,]/)
      .map((address) => address.trim())
      .filter(Boolean);
    const payload = {
      from: env.FROM_EMAIL,
      to: [env.TO_EMAIL],
      reply_to: email.trim(),
      subject: "New message from Arpeggio website",
      text: "Name: " + name.trim() +
        "\nEmail: " + email.trim() +
        "\n\nMessage:\n" + message.trim(),
    };
    if (cc.length) payload.cc = cc;

    let mail;
    try {
      mail = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + env.RESEND_API_KEY,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch {
      await env.CONTACT_DB.prepare(
        "UPDATE contact_submissions SET delivery_status = 'failed' WHERE id = ?"
      ).bind(id).run();
      return response(502, { error: "Unable to send the message. Please try again later." }, origin);
    }

    if (!mail.ok) {
      await env.CONTACT_DB.prepare(
        "UPDATE contact_submissions SET delivery_status = 'failed' WHERE id = ?"
      ).bind(id).run();
      return response(502, { error: "Unable to send the message. Please try again later." }, origin);
    }

    let providerMessageId = null;
    try {
      const result = await mail.json();
      providerMessageId = typeof result.id === "string" ? result.id : null;
    } catch {
      // The delivery succeeded; the provider ID is optional for the local archive.
    }
    try {
      await env.CONTACT_DB.prepare(
        "UPDATE contact_submissions SET delivery_status = 'sent', provider_message_id = ? WHERE id = ?"
      ).bind(providerMessageId, id).run();
    } catch {
      // Email delivery succeeded; do not report failure and cause a duplicate resend.
    }

    return response(200, { ok: true }, origin);
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      env.CONTACT_DB.prepare(
        "DELETE FROM contact_submissions WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-90 days')"
      ).run()
    );
  },
};

export class RateLimiter {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch() {
    const now = Date.now();
    const windowMs = 10 * 60 * 1000;
    const limit = 5;
    const attempts = ((await this.ctx.storage.get("attempts")) || [])
      .filter((timestamp) => now - timestamp < windowMs);

    if (attempts.length >= limit) {
      return Response.json({ allowed: false });
    }

    attempts.push(now);
    await this.ctx.storage.put("attempts", attempts);
    return Response.json({ allowed: true });
  }
}
