---
name: reverse-engineer-api
description: Discover how a web app's internal/undocumented API works — endpoints, auth scheme, payload shapes, pagination, rate limits — by observing network traffic and reading client bundles. Use when integrating with a service that has no public API docs, when documenting a legacy internal service, or when asked how some site "actually does" something.
source:
  upstream: hand-authored in preflight
  imported: 2026-09-20
risk_level: high
writes_files: true
---

# Reverse-engineer an internal API

Work out the real contract of an undocumented HTTP API by watching what the
client does, then write it down as something reusable.

## Before anything: authorization

This technique is legitimate for **your own systems, your employer's systems,
services you have written permission to test, and public endpoints you are
already an authenticated user of**. It is not legitimate against third parties
who have not authorized it, and terms of service often prohibit it explicitly.

State which of those applies before starting. If the answer is unclear, stop and
ask. Never use this to circumvent authentication, rate limits, or paywalls.

## Method

### 1. Observe, don't guess

Drive the real client and record traffic. With the browser tools available to
you: navigate, perform the action, then read the network requests.

```
navigate → perform the action → read_network_requests → read the response body
```

Record per endpoint: method, path, query params, request headers that matter
(auth, content-type, custom `x-*`), request body, status, response shape.

### 2. Identify the auth scheme

The single most important finding. Work out which of these it is:

- Bearer token in `Authorization` — where does it come from, what is its TTL,
  is there a refresh endpoint?
- Session cookie — `HttpOnly`? `SameSite`? Tied to a CSRF token?
- API key in a header or query string
- Signed request (HMAC over path + body + timestamp) — the hardest to use, and
  the signing code is in the bundle

### 3. Read the client bundle when traffic is not enough

Source maps, if published, give you the original code. Otherwise search the
minified bundle for the endpoint path — the call site nearby reveals the
parameters the UI never sends.

### 4. Probe carefully

Vary **one** thing at a time: a pagination cursor, a filter, a field name.
Between probes, pause. You are a guest on someone's infrastructure even when it
is your own employer's.

Never: brute-force IDs, enumerate users, or hammer an endpoint to find the rate
limit. If you need the limit, read the `X-RateLimit-*` headers or the docs.

### 5. Confirm the shape

Call each endpoint twice with different inputs before writing down a field as
required, optional, or nullable. One sample is an anecdote.

## Output

Write `docs/<service>-api.md`:

```markdown
# <Service> internal API — observed <date>

> Reverse-engineered by observation. Undocumented and unstable: it can change
> without notice. Treat every field as best-effort.

## Auth
<scheme, token source, TTL, refresh>

## Endpoints
### GET /api/v2/things
| Param | Type | Required | Notes |
Response: <shape>
Observed status codes: <…>

## Pagination / Rate limits / Gotchas
```

Plus, when it is worth it, a typed client — but only for the endpoints actually
needed. A full SDK for an API that can change tomorrow is wasted work.

## Stop conditions

Stop and report if you hit a captcha or bot check (never solve one), an endpoint
that looks like another tenant's data, or anything suggesting the access is not
intended for you.
