# reoohb — Out Of Here Bots

A privacy-conscious website verification prototype.

## Backend

- Supabase project: WALLZ by echo
- Edge Function: `reoohb-verify`
- Function URL: `https://wdkpojqtftvpfeuctlzi.supabase.co/functions/v1/reoohb-verify`
- Health check: send a GET request to the function URL.
- Dashboard: `index.html` (enable GitHub Pages to publish it).

## Dashboard

- Supabase Auth sign-up and login.
- Authenticated developer dashboard.
- Create projects and register domains.
- Random public project IDs.
- A one-time project API secret. Only its SHA-256 hash is stored server-side.
- Per-user project access protected by Row Level Security.

## Verification API

All POST requests use JSON. Use the Function URL above as `REOOHB_URL`.

### 1. Create a project

The dashboard calls this while the developer is signed in:

```json
{ "action": "create_project", "name": "My website", "domain": "example.com" }
```

It returns a project object, a public project ID, and a private API secret shown once. Store the API secret in your website's backend environment variables. Never put it in frontend JavaScript, a public repository, or a browser request.

### 2. Start a challenge

From the registered website's browser:

```js
const response = await fetch(REOOHB_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "challenge", project_id: REOOHB_PUBLIC_PROJECT_ID })
});
const challenge = await response.json();
// Render challenge.question and keep challenge.challenge_id for the next step.
```

The browser Origin must match the domain registered for the project.

### 3. Verify the answer

From the registered website's browser:

```js
const response = await fetch(REOOHB_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    action: "verify",
    project_id: REOOHB_PUBLIC_PROJECT_ID,
    challenge_id: challenge.challenge_id,
    answer: visitorAnswer
  })
});
const result = await response.json();
// On success, send result.code to your own website backend.
```

The authorization code expires after 2 minutes and can be used once.

### 4. Exchange the code on your website backend

Your backend sends this request. The API secret must stay on the backend:

```js
const response = await fetch(REOOHB_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    action: "exchange",
    project_id: process.env.REOOHB_PROJECT_ID,
    api_secret: process.env.REOOHB_API_SECRET,
    code: codeFromBrowser
  })
});
const result = await response.json();
if (!result.valid) throw new Error("Verification failed");
// Now create your own website session cookie.
```

The exchange consumes the code atomically. The customer website must create its own session; reoohb does not issue or share a customer session cookie.

## Current limitations

- The arithmetic challenge is only a basic friction test. It is **not proof that a visitor is human**; automated clients can solve it.
- Mouse movement analysis, voice verification, CAPTCHA/Turnstile integration, robust rate limiting, abuse analytics, and production monitoring are not implemented yet.
- Treat this as an early prototype, not production-grade bot protection.
- The public challenge endpoint needs rate limiting before production use.
- Email confirmation depends on Supabase Auth email settings. Mailtrap SMTP can be connected later through Supabase Auth SMTP settings; credentials must stay in provider/Supabase settings, not this repository.

## Security

- The frontend uses only the Supabase publishable key.
- The Supabase service-role key is read only by the Edge Function from server-side environment variables.
- Project API secrets are generated server-side; only SHA-256 hashes are stored.
- Challenge answers and authorization codes are stored as hashes.
- Challenges expire after 5 minutes; authorization codes expire after 2 minutes and are single-use.
- Internal tables have RLS enabled and no permissions for `anon` or `authenticated`; only the server-side service role is granted access.
