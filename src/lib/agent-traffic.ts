// Fork (RFD 0002): server-side hook that captures classified AI/bot traffic
// into agent_event instead of dropping it. Used by /api/send (and later
// /api/collect, RFD 0006).
import debug from 'debug';
import { type AgentInfo, detectAgent } from '@/lib/agents';
import { getSalt, hash } from '@/lib/crypto';
import { truncateString } from '@/lib/format';
import { safeDecodeURI } from '@/lib/url';
import { saveAgentEvent } from '@/queries/sql/agents/saveAgentEvent';

const log = debug('umami:agents');

export interface RecordAgentEventArgs {
  websiteId: string;
  agent: AgentInfo;
  url?: string;
  hostname?: string;
  referrer?: string;
  userAgent?: string;
  ip?: string;
  createdAt: Date;
}

export interface CheckAgentTrafficArgs {
  userAgent?: string;
  websiteId?: string;
  url?: string;
  hostname?: string;
  referrer?: string;
  ip?: string;
  createdAt: Date;
}

export async function recordAgentEvent({
  websiteId,
  agent,
  url,
  hostname,
  referrer,
  userAgent,
  ip,
  createdAt,
}: RecordAgentEventArgs) {
  // Same URL parsing approach as the send route
  const base = hostname ? `https://${hostname}` : 'https://localhost';
  const currentUrl = new URL(url || '/', base);

  const urlPath = currentUrl.pathname === '/undefined' ? '' : currentUrl.pathname + currentUrl.hash;
  const urlDomain = currentUrl.hostname.replace(/^www\./, '');

  let referrerDomain: string | undefined;

  if (referrer) {
    const referrerUrl = new URL(referrer, base);

    referrerDomain = referrerUrl.hostname.replace(/^www\./, '');
  }

  // sha512 hex is 128 chars; the ip_hash column is varchar(64). 64 hex chars
  // (256 bits) is ample for daily-salted dedup.
  const ipHash = ip ? hash(ip, getSalt('day', createdAt)).slice(0, 64) : null;

  return saveAgentEvent({
    websiteId,
    category: truncateString(agent.category, 20),
    name: truncateString(agent.name, 50),
    operator: truncateString(agent.operator, 50),
    urlPath: truncateString(safeDecodeURI(urlPath), 500),
    hostname: truncateString(hostname || urlDomain, 100),
    referrerDomain: truncateString(referrerDomain, 500),
    userAgent: truncateString(userAgent, 500),
    ipHash,
    createdAt,
  });
}

export async function checkAgentTraffic(
  args: CheckAgentTrafficArgs,
): Promise<{ handled: boolean }> {
  const { userAgent, websiteId, url, hostname, referrer, ip, createdAt } = args;

  // DISABLE_BOT_CHECK preserves upstream semantics: bots flow into the human pipeline
  if (process.env.DISABLE_BOT_CHECK) {
    return { handled: false };
  }

  const agent = detectAgent(userAgent);

  if (!agent) {
    return { handled: false };
  }

  // AGENT_TRACKING=0 restores upstream's pure drop behavior
  if (process.env.AGENT_TRACKING !== '0' && websiteId) {
    try {
      await recordAgentEvent({
        websiteId,
        agent,
        url,
        hostname,
        referrer,
        userAgent,
        ip,
        createdAt,
      });
    } catch (e) {
      // Persistence failure must not break the send route
      log(e);
    }
  }

  return { handled: true };
}
