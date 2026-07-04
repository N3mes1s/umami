# Server-side / edge collection (`POST /api/collect`)

The tracker script (`src/tracker/index.js`) only sees visitors that execute
JavaScript. AI crawlers and agents — GPTBot reading `/docs/quickstart`,
ClaudeBot fetching `/llms.txt`, an agent curling your JSON API — never do, so
they are invisible to `/api/send`. Requests for `llms.txt`, `robots.txt`, RSS
feeds, and API routes are exactly the traffic this endpoint exists to catch.

`POST /api/collect` accepts a hit from **your own server or edge middleware**
for every incoming request. Umami classifies the user agent:

- **AI crawler / agent / bot** → recorded in the `agent_event` table and
  surfaced in the AI Traffic report. This is the primary purpose.
- **Human** → runs through the normal session/event pipeline, identical to
  `/api/send`. Server-rendered sites get JS-free human analytics as a bonus.

## Authentication

The endpoint requires authentication. Use an API key (Settings → API keys)
sent as a bearer token:

```
Authorization: Bearer umami_ak_...
```

Because the caller is a trusted server (not a browser), the caller-supplied
`ip` and `userAgent` fields are trusted for classification, geolocation, and
session hashing.

## Request

```jsonc
POST /api/collect
Content-Type: application/json
Authorization: Bearer umami_ak_...

{
  "websiteId": "02d89813-7a72-41e1-87f0-8d668f85008b", // required
  "url": "/docs/quickstart",          // required — path or full URL
  "userAgent": "Mozilla/5.0 ...",     // required — classification input
  "hostname": "example.com",          // optional
  "referrer": "https://claude.ai/",   // optional
  "ip": "203.0.113.7",                // optional — geo + session hash only
  "name": "signup",                   // optional custom event name
  "data": { "plan": "pro" },          // optional event data
  "timestamp": 1751600000             // optional, unix seconds (max 30 days old)
}
```

## Response

Agent/crawler traffic:

```json
{ "ok": true, "classified": "ai_crawler" }
```

Human traffic:

```json
{ "ok": true, "sessionId": "…", "visitId": "…" }
```

Errors use standard status codes: `400` (bad payload, invalid `ip`, stale or
future `timestamp`), `401` (bad/missing key or no access to the website).

## Next.js middleware snippet

Vendor this into your site as `middleware.ts`. Key rules: filter static
assets, **never await the fetch in the request path** — use
`event.waitUntil` where available (Vercel/edge) or a detached promise with
`.catch` so a slow or down analytics host can never slow down a page.

```ts
// middleware.ts
import { type NextFetchEvent, type NextRequest, NextResponse } from 'next/server';

const UMAMI_HOST = process.env.UMAMI_HOST!; // e.g. https://analytics.example.com
const UMAMI_API_KEY = process.env.UMAMI_API_KEY!; // umami_ak_...
const UMAMI_WEBSITE_ID = process.env.UMAMI_WEBSITE_ID!;

const SKIP = /\.(js|css|map|ico|png|jpe?g|gif|svg|webp|avif|woff2?|ttf)$/i;

export function middleware(request: NextRequest, event: NextFetchEvent) {
  const { pathname, search } = request.nextUrl;

  if (!pathname.startsWith('/_next/') && !SKIP.test(pathname)) {
    const collect = fetch(`${UMAMI_HOST}/api/collect`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${UMAMI_API_KEY}`,
      },
      body: JSON.stringify({
        websiteId: UMAMI_WEBSITE_ID,
        url: pathname + search,
        hostname: request.nextUrl.hostname,
        userAgent: request.headers.get('user-agent') ?? 'unknown',
        referrer: request.headers.get('referer') ?? undefined,
        ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
      }),
    }).catch(() => {}); // fire-and-forget: never let analytics break a page

    event.waitUntil(collect);
  }

  return NextResponse.next();
}

export const config = { matcher: '/((?!_next/static|_next/image).*)' };
```

## Plain-fetch variant (any Node server)

Drop this into an Express/Fastify/Koa middleware, or call it from wherever
you handle requests. Same rule: detached promise, never awaited.

```js
function collect(req) {
  fetch(`${process.env.UMAMI_HOST}/api/collect`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.UMAMI_API_KEY}`,
    },
    body: JSON.stringify({
      websiteId: process.env.UMAMI_WEBSITE_ID,
      url: req.originalUrl || req.url,
      hostname: req.headers.host?.split(':')[0],
      userAgent: req.headers['user-agent'] || 'unknown',
      referrer: req.headers.referer,
      ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress,
    }),
  }).catch(() => {});
}

// Express: app.use((req, res, next) => { collect(req); next(); });
```

Publishing a real npm package is deferred until the payload shape stabilizes
(RFD 0006).
