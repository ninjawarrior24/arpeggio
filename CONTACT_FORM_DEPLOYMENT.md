# Secure contact-form deployment

This site now sends contact requests through a Cloudflare Worker instead of
posting directly to FormSubmit. Recipient addresses and the Resend API key are
kept out of the browser and out of this repository.

## 1. Prepare providers

1. Create a Cloudflare account and add the site domain.
2. Create a Resend account and verify the domain that will appear in the
   `FROM_EMAIL` address. Configure its SPF/DKIM DNS records before sending.
3. Create a Cloudflare Turnstile widget for the production site origin. Copy
   its **site key** and **secret key**.

## 2. Deploy the Worker

From `worker/`, authenticate with Cloudflare and deploy:

```sh
npx wrangler login
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler deploy --var ALLOWED_ORIGIN:https://YOUR-SITE-ORIGIN --var FROM_EMAIL:"Arpeggio Website <contact@YOUR-DOMAIN>" --var TO_EMAIL:YOUR-RECIPIENT@YOUR-DOMAIN
```

Add `--var CC_EMAIL:...` only if a copy is genuinely required. The Worker
URL returned by deployment is the contact endpoint. The origin must match the
browser's origin exactly, including its scheme and any `www` host.

## 3. Connect the static site

Update [js/contact-config.js](js/contact-config.js):

```js
window.ARPEGGIO_CONTACT = {
  endpoint: "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev",
  turnstileSiteKey: "YOUR_PUBLIC_TURNSTILE_SITE_KEY",
};
```

The site key is intentionally public. Do not place the Resend API key,
Turnstile secret key, or recipient addresses in this file.

## 4. Retire FormSubmit

After production testing, disable the old FormSubmit form endpoints and remove
their activation/configuration from the associated mailbox. Because the
previous recipient addresses were committed to a public repository, they
should be considered exposed; removing them from the current branch does not
erase Git history.

## Verification checklist

- Submit one valid message and confirm it arrives with the visitor address as
  Reply-To.
- Submit with an invalid Turnstile token and confirm no email arrives.
- Submit from a different origin and confirm the Worker returns 403.
- Confirm the browser network request contains no recipient email address,
  API key, or Turnstile secret.
