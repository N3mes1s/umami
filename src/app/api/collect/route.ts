// Fork (RFD 0006): server-side / edge collection endpoint.
//
// AI crawlers and agents never execute JavaScript, so the tracker never sees
// them. This endpoint accepts fire-and-forget hits from a site's own server
// or edge middleware, classifies the user agent (RFD 0002), and records the
// hit either as an agent_event (bots/agents) or through the normal
// session/event pipeline (humans, mirroring /api/send).
//
// Unlike /api/send this route is API-key-authenticated (RFD 0001), so
// caller-supplied `ip` and `userAgent` are trusted.
import { startOfHour } from 'date-fns';
import { browserName, detectOS } from 'detect-browser';
import ipaddr from 'ipaddr.js';
import { z } from 'zod';
import { recordAgentEvent } from '@/lib/agent-traffic';
import { detectAgent } from '@/lib/agents';
import clickhouse from '@/lib/clickhouse';
import { EVENT_TYPE } from '@/lib/constants';
import { getSalt, hash, uuid } from '@/lib/crypto';
import { getDevice, getLocation } from '@/lib/detect';
import { parseRequest } from '@/lib/request';
import { badRequest, json, serverError, unauthorized } from '@/lib/response';
import { anyObjectParam, urlOrPathParam } from '@/lib/schema';
import { safeDecodeURI, safeDecodeURIComponent } from '@/lib/url';
import { canViewAuthenticatedWebsite } from '@/permissions';
import { createSession, saveEvent } from '@/queries/sql';

const MAX_EVENT_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Reject strings whose first character is a spreadsheet formula trigger to
// prevent CSV formula injection in analytics exports (defense-in-depth).
// Mirrors the guard in /api/send (kept local on purpose — see RFD 0006).
const FORMULA_TRIGGER_RE = /^[=+\-@\t\r]/;
const safeStringParam = () =>
  z.string().refine(val => !FORMULA_TRIGGER_RE.test(val), {
    message: 'Value must not start with =, +, -, @, tab, or carriage return',
  });

const schema = z.object({
  websiteId: z.uuid(),
  url: urlOrPathParam,
  hostname: z.string().max(100).optional(),
  referrer: urlOrPathParam.optional(),
  userAgent: z.string().min(1).max(1000),
  ip: z.string().optional(),
  name: safeStringParam().optional(),
  data: anyObjectParam.optional(),
  timestamp: z.coerce.number().int().optional(),
});

export async function POST(request: Request) {
  try {
    const { auth, body, error } = await parseRequest(request, schema);

    if (error) {
      return error();
    }

    const { websiteId, url, hostname, referrer, userAgent, ip, name, data, timestamp } = body;

    if (!(await canViewAuthenticatedWebsite(auth, websiteId))) {
      return unauthorized();
    }

    if (ip && !ipaddr.isValid(ip)) {
      return badRequest({ message: 'Invalid IP address.' });
    }

    const createdAt = timestamp ? new Date(timestamp * 1000) : new Date();
    const now = Date.now();

    if (createdAt.getTime() > now) {
      return badRequest({ message: 'Timestamp must not be in the future.' });
    }

    if (now - createdAt.getTime() > MAX_EVENT_AGE_MS) {
      return badRequest({ message: 'Timestamp must not be older than 30 days.' });
    }

    // Agent / crawler traffic (the hot path — RFD 0002 classifier)
    const agentInfo = detectAgent(userAgent);

    if (agentInfo) {
      await recordAgentEvent({
        websiteId,
        agent: agentInfo,
        url,
        hostname,
        referrer,
        userAgent,
        ip,
        createdAt,
      });

      return json({ ok: true, classified: agentInfo.category });
    }

    // Human traffic — mirror the /api/send pipeline
    const saltRotation = process.env.SALT_ROTATION || 'month';
    const sessionSalt = getSalt(saltRotation, createdAt);
    const visitSalt = hash(startOfHour(createdAt).toUTCString());

    const sessionId = uuid(websiteId, ip || 'server', userAgent, sessionSalt);
    const visitId = uuid(sessionId, visitSalt);

    const browser = browserName(userAgent);
    const os = detectOS(userAgent) as string;
    const device = getDevice(userAgent);

    let country: string;
    let region: string;
    let city: string;

    if (ip) {
      try {
        // Caller-supplied IP: skip provider headers, go straight to maxmind
        const location = await getLocation(ip, request.headers, true);

        country = safeDecodeURIComponent(location?.country);
        region = safeDecodeURIComponent(location?.region);
        city = safeDecodeURIComponent(location?.city);
      } catch {
        // Geo database unavailable — proceed without location
      }
    }

    // Create a session if not found
    if (!clickhouse.enabled) {
      await createSession({
        id: sessionId,
        websiteId,
        browser,
        os,
        device,
        country,
        region,
        city,
        createdAt,
      });
    }

    // URL parsing — identical to the send route
    const base = hostname ? `https://${hostname}` : 'https://localhost';
    const currentUrl = new URL(url, base);

    let urlPath = currentUrl.pathname === '/undefined' ? '' : currentUrl.pathname + currentUrl.hash;
    const urlQuery = currentUrl.search.substring(1);
    const urlDomain = currentUrl.hostname.replace(/^www./, '');

    let referrerPath: string;
    let referrerQuery: string;
    let referrerDomain: string;

    // UTM Params
    const utmSource = currentUrl.searchParams.get('utm_source');
    const utmMedium = currentUrl.searchParams.get('utm_medium');
    const utmCampaign = currentUrl.searchParams.get('utm_campaign');
    const utmContent = currentUrl.searchParams.get('utm_content');
    const utmTerm = currentUrl.searchParams.get('utm_term');

    // Click IDs
    const gclid = currentUrl.searchParams.get('gclid');
    const fbclid = currentUrl.searchParams.get('fbclid');
    const msclkid = currentUrl.searchParams.get('msclkid');
    const ttclid = currentUrl.searchParams.get('ttclid');
    const lifatid = currentUrl.searchParams.get('li_fat_id');
    const twclid = currentUrl.searchParams.get('twclid');

    if (process.env.REMOVE_TRAILING_SLASH) {
      urlPath = urlPath.replace(/\/(?=(#.*)?$)/, '');
    }

    if (referrer) {
      const referrerUrl = new URL(referrer, base);

      referrerPath = referrerUrl.pathname;
      referrerQuery = referrerUrl.search.substring(1);
      referrerDomain = referrerUrl.hostname.replace(/^www\./, '');
    }

    const eventType = name ? EVENT_TYPE.customEvent : EVENT_TYPE.pageView;

    await saveEvent({
      websiteId,
      sessionId,
      visitId,
      eventType,
      createdAt,

      // Page
      hostname: hostname || urlDomain,
      urlPath: safeDecodeURI(urlPath),
      urlQuery,
      referrerPath: safeDecodeURI(referrerPath),
      referrerQuery,
      referrerDomain,

      // Session
      browser,
      os,
      device,
      country,
      region,
      city,

      // Events
      eventName: name,
      eventData: data,

      // UTM
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      utmTerm,

      // Click IDs
      gclid,
      fbclid,
      msclkid,
      ttclid,
      lifatid,
      twclid,
    });

    return json({ ok: true, sessionId, visitId });
  } catch (e) {
    return serverError(e);
  }
}
