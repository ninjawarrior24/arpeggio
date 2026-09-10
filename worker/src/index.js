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

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    if (!origin || origin !== env.ALLOWED_ORIGIN) {
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
    if (website) return response(200, { ok: true }, origin); // Honeypot: silently discard.
    if (!isText(name, 1, 120) ||
        !isText(email, 3, 254) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !isText(message, 5, 5000) ||
        !isText(turnstileToken, 1, 2048)) {
      return response(400, { error: "Please provide a valid name, email, message, and verification." }, origin);
    }

    const verified = await verifyTurnstile(turnstileToken, request, env.TURNSTILE_SECRET_KEY);
    if (!verified) return response(400, { error: "Verification failed. Please try again." }, origin);

    const recipients = [env.TO_EMAIL];
    if (env.CC_EMAIL) recipients.push(env.CC_EMAIL);
    const mail = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: env.FROM_EMAIL,
        to: recipients,
        reply_to: email.trim(),
        subject: "New message from Arpeggio website",
        text: `Name: ${name.trim()}\nEmail: ${email.trim()}\n\nMessage:\n${message.trim()}`,
      }),
    });

    if (!mail.ok) {
      // Do not expose provider responses or visitor data to the browser.
      return response(502, { error: "Unable to send the message. Please try again later." }, origin);
    }
    return response(200, { ok: true }, origin);
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
