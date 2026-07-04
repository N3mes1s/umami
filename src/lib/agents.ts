// Fork (RFD 0002 / RFD 0003): AI & bot traffic classifier.
// PURE module — no node-only imports and no imports from '@/lib/constants'
// (constants.ts imports from this file; keep it cycle-free).
import { isbot } from 'isbot';

export type AgentCategory =
  | 'ai_crawler'
  | 'ai_agent'
  | 'ai_search'
  | 'search_crawler'
  | 'seo_tool'
  | 'monitoring'
  | 'other_bot';

export interface AgentInfo {
  category: AgentCategory;
  name: string | null;
  operator: string | null;
}

export interface AgentRule extends AgentInfo {
  pattern: RegExp;
}

// Ordered: first match wins. Keep user/search variants ahead of the broader
// crawler tokens for the same vendor (e.g. Claude-SearchBot before ClaudeBot).
export const AGENT_RULES: AgentRule[] = [
  // OpenAI
  { pattern: /ChatGPT-User/i, category: 'ai_agent', name: 'ChatGPT-User', operator: 'OpenAI' },
  { pattern: /OAI-SearchBot/i, category: 'ai_search', name: 'OAI-SearchBot', operator: 'OpenAI' },
  { pattern: /GPTBot/i, category: 'ai_crawler', name: 'GPTBot', operator: 'OpenAI' },

  // Anthropic
  {
    pattern: /Claude-SearchBot/i,
    category: 'ai_search',
    name: 'Claude-SearchBot',
    operator: 'Anthropic',
  },
  { pattern: /Claude-User/i, category: 'ai_agent', name: 'Claude-User', operator: 'Anthropic' },
  { pattern: /ClaudeBot/i, category: 'ai_crawler', name: 'ClaudeBot', operator: 'Anthropic' },
  { pattern: /anthropic-ai/i, category: 'ai_crawler', name: 'anthropic-ai', operator: 'Anthropic' },

  // Perplexity
  {
    pattern: /Perplexity-User/i,
    category: 'ai_agent',
    name: 'Perplexity-User',
    operator: 'Perplexity',
  },
  {
    pattern: /PerplexityBot/i,
    category: 'ai_search',
    name: 'PerplexityBot',
    operator: 'Perplexity',
  },

  // Mistral
  { pattern: /MistralAI-User/i, category: 'ai_agent', name: 'MistralAI-User', operator: 'Mistral' },

  // Google
  {
    pattern: /Google-Extended/i,
    category: 'ai_crawler',
    name: 'Google-Extended',
    operator: 'Google',
  },
  { pattern: /GoogleOther/i, category: 'ai_crawler', name: 'GoogleOther', operator: 'Google' },
  { pattern: /Googlebot/i, category: 'search_crawler', name: 'Googlebot', operator: 'Google' },

  // Microsoft
  { pattern: /bingbot/i, category: 'search_crawler', name: 'Bingbot', operator: 'Microsoft' },

  // DuckDuckGo
  {
    pattern: /DuckAssistBot/i,
    category: 'ai_search',
    name: 'DuckAssistBot',
    operator: 'DuckDuckGo',
  },
  {
    pattern: /DuckDuckBot/i,
    category: 'search_crawler',
    name: 'DuckDuckBot',
    operator: 'DuckDuckGo',
  },

  // Other search engines
  { pattern: /YandexBot/i, category: 'search_crawler', name: 'YandexBot', operator: 'Yandex' },
  { pattern: /Baiduspider/i, category: 'search_crawler', name: 'Baiduspider', operator: 'Baidu' },

  // Apple (extended variant must precede the plain token)
  {
    pattern: /Applebot-Extended/i,
    category: 'ai_crawler',
    name: 'Applebot-Extended',
    operator: 'Apple',
  },
  { pattern: /Applebot/i, category: 'search_crawler', name: 'Applebot', operator: 'Apple' },

  // Other AI training / ingestion crawlers
  { pattern: /Bytespider/i, category: 'ai_crawler', name: 'Bytespider', operator: 'ByteDance' },
  { pattern: /CCBot/i, category: 'ai_crawler', name: 'CCBot', operator: 'Common Crawl' },
  { pattern: /cohere-ai/i, category: 'ai_crawler', name: 'cohere-ai', operator: 'Cohere' },
  {
    pattern: /meta-externalagent/i,
    category: 'ai_crawler',
    name: 'Meta-ExternalAgent',
    operator: 'Meta',
  },
  {
    pattern: /facebookexternalhit/i,
    category: 'other_bot',
    name: 'facebookexternalhit',
    operator: 'Meta',
  },
  { pattern: /Amazonbot/i, category: 'ai_crawler', name: 'Amazonbot', operator: 'Amazon' },
  { pattern: /YouBot/i, category: 'ai_search', name: 'YouBot', operator: 'You.com' },

  // SEO tools
  { pattern: /AhrefsBot/i, category: 'seo_tool', name: 'AhrefsBot', operator: 'Ahrefs' },
  { pattern: /SemrushBot/i, category: 'seo_tool', name: 'SemrushBot', operator: 'Semrush' },
  { pattern: /MJ12bot/i, category: 'seo_tool', name: 'MJ12bot', operator: 'Majestic' },
  { pattern: /DotBot/i, category: 'seo_tool', name: 'DotBot', operator: 'Moz' },
  {
    pattern: /DataForSeoBot/i,
    category: 'seo_tool',
    name: 'DataForSeoBot',
    operator: 'DataForSEO',
  },

  // Monitoring
  { pattern: /UptimeRobot/i, category: 'monitoring', name: 'UptimeRobot', operator: 'UptimeRobot' },
  { pattern: /Pingdom/i, category: 'monitoring', name: 'Pingdom', operator: 'Pingdom' },
  { pattern: /StatusCake/i, category: 'monitoring', name: 'StatusCake', operator: 'StatusCake' },
  {
    pattern: /Better\s?Uptime/i,
    category: 'monitoring',
    name: 'Better Uptime',
    operator: 'Better Stack',
  },

  // Headless / automation browsers (agentic browsing signals)
  { pattern: /HeadlessChrome/i, category: 'ai_agent', name: 'HeadlessChrome', operator: null },
  { pattern: /Playwright/i, category: 'ai_agent', name: 'Playwright', operator: null },
  { pattern: /Puppeteer/i, category: 'ai_agent', name: 'Puppeteer', operator: null },

  // Generic HTTP libraries
  { pattern: /python-requests/i, category: 'other_bot', name: 'python-requests', operator: null },
  { pattern: /python-httpx/i, category: 'other_bot', name: 'python-httpx', operator: null },
  { pattern: /\bcurl\//i, category: 'other_bot', name: 'curl', operator: null },
  { pattern: /\bwget\//i, category: 'other_bot', name: 'wget', operator: null },
  { pattern: /Go-http-client/i, category: 'other_bot', name: 'Go-http-client', operator: null },
  { pattern: /axios\//i, category: 'other_bot', name: 'axios', operator: null },
];

export function detectAgent(userAgent: string | undefined): AgentInfo | null {
  if (!userAgent) {
    return null;
  }

  for (const rule of AGENT_RULES) {
    if (rule.pattern.test(userAgent)) {
      return { category: rule.category, name: rule.name, operator: rule.operator };
    }
  }

  if (isbot(userAgent)) {
    return { category: 'other_bot', name: null, operator: null };
  }

  return null;
}

// Fork (RFD 0003): AI-assistant referral domains (2026), with display labels.
export const AI_ASSISTANT_DOMAINS: Array<{ domain: string; label: string }> = [
  { domain: 'chatgpt.com', label: 'ChatGPT' },
  { domain: 'chat.openai.com', label: 'ChatGPT' },
  { domain: 'claude.ai', label: 'Claude' },
  { domain: 'copilot.microsoft.com', label: 'Microsoft Copilot' },
  { domain: 'gemini.google.com', label: 'Google Gemini' },
  { domain: 'bard.google.com', label: 'Google Bard' },
  { domain: 'meta.ai', label: 'Meta AI' },
  { domain: 'perplexity.ai', label: 'Perplexity' },
  { domain: 'grok.com', label: 'Grok' },
  { domain: 'x.ai', label: 'Grok (xAI)' },
  { domain: 'chat.deepseek.com', label: 'DeepSeek' },
  { domain: 'chat.mistral.ai', label: 'Mistral Le Chat' },
  { domain: 'kagi.com', label: 'Kagi' },
  { domain: 'you.com', label: 'You.com' },
  { domain: 'poe.com', label: 'Poe' },
  { domain: 'felo.ai', label: 'Felo' },
  { domain: 'phind.com', label: 'Phind' },
  { domain: 'andisearch.com', label: 'Andi' },
  { domain: 'iask.ai', label: 'iAsk' },
  { domain: 'komo.ai', label: 'Komo' },
  { domain: 'chat.qwen.ai', label: 'Qwen' },
  { domain: 'kimi.com', label: 'Kimi' },
  { domain: 'duck.ai', label: 'DuckDuckGo AI Chat' },
];

// Domains already present in upstream's LLM_DOMAINS (src/lib/constants.ts) —
// keep in sync so EXTRA_LLM_DOMAINS only carries the fork's delta.
const UPSTREAM_LLM_DOMAINS = [
  'chatgpt.com',
  'claude.ai',
  'copilot.microsoft.com',
  'gemini.google.com',
  'meta.ai',
  'perplexity.ai',
];

// Domains too short/generic for the channel queries' substring matching
// (referrer_domain ilike '%<domain>%' / multiSearchAny): '%x.ai%' would match
// 'onyx.ai', '%you.com%' would match 'thankyou.com', etc. Keep them out of
// LLM_DOMAINS; they remain in AI_ASSISTANT_DOMAINS, whose consumers match on
// exact domain / subdomain boundaries.
const SUBSTRING_UNSAFE_LLM_DOMAINS = ['x.ai', 'you.com', 'poe.com', 'kimi.com'];

export const EXTRA_LLM_DOMAINS: string[] = AI_ASSISTANT_DOMAINS.map(({ domain }) => domain).filter(
  domain =>
    !UPSTREAM_LLM_DOMAINS.includes(domain) && !SUBSTRING_UNSAFE_LLM_DOMAINS.includes(domain),
);
