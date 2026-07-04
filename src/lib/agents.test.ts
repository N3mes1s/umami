import { expect, test } from 'vitest';
import { AGENT_RULES, AI_ASSISTANT_DOMAINS, detectAgent, EXTRA_LLM_DOMAINS } from './agents';

test('detects GPTBot as an OpenAI ai_crawler', () => {
  expect(
    detectAgent(
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
    ),
  ).toEqual({ category: 'ai_crawler', name: 'GPTBot', operator: 'OpenAI' });
});

test('detects OAI-SearchBot as OpenAI ai_search', () => {
  expect(
    detectAgent(
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot',
    ),
  ).toEqual({ category: 'ai_search', name: 'OAI-SearchBot', operator: 'OpenAI' });
});

test('detects ChatGPT-User as ai_agent, not GPTBot', () => {
  const result = detectAgent(
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
  );

  expect(result).toEqual({ category: 'ai_agent', name: 'ChatGPT-User', operator: 'OpenAI' });
});

test('detects ClaudeBot as an Anthropic ai_crawler', () => {
  expect(
    detectAgent(
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
    ),
  ).toEqual({ category: 'ai_crawler', name: 'ClaudeBot', operator: 'Anthropic' });
});

test('detects Claude-SearchBot as ai_search (not swallowed by ClaudeBot rule)', () => {
  expect(
    detectAgent(
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +https://www.anthropic.com/claude-searchbot)',
    ),
  ).toEqual({ category: 'ai_search', name: 'Claude-SearchBot', operator: 'Anthropic' });
});

test('detects Claude-User as ai_agent', () => {
  expect(
    detectAgent(
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +https://www.anthropic.com/claude-user)',
    ),
  ).toEqual({ category: 'ai_agent', name: 'Claude-User', operator: 'Anthropic' });
});

test('detects anthropic-ai token', () => {
  expect(detectAgent('anthropic-ai/1.0')).toEqual({
    category: 'ai_crawler',
    name: 'anthropic-ai',
    operator: 'Anthropic',
  });
});

test('detects PerplexityBot as ai_search', () => {
  expect(
    detectAgent(
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
    ),
  ).toEqual({ category: 'ai_search', name: 'PerplexityBot', operator: 'Perplexity' });
});

test('detects Perplexity-User as ai_agent', () => {
  expect(
    detectAgent(
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)',
    ),
  ).toEqual({ category: 'ai_agent', name: 'Perplexity-User', operator: 'Perplexity' });
});

test('detects MistralAI-User as ai_agent', () => {
  expect(
    detectAgent('Mozilla/5.0 (compatible; MistralAI-User/1.0; +https://docs.mistral.ai/robots)'),
  ).toEqual({ category: 'ai_agent', name: 'MistralAI-User', operator: 'Mistral' });
});

test('detects Google crawlers with the right precedence', () => {
  expect(detectAgent('Google-Extended')).toEqual({
    category: 'ai_crawler',
    name: 'Google-Extended',
    operator: 'Google',
  });
  expect(detectAgent('Mozilla/5.0 (compatible; GoogleOther) Chrome/W.X.Y.Z Safari/537.36')).toEqual(
    { category: 'ai_crawler', name: 'GoogleOther', operator: 'Google' },
  );
  expect(
    detectAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'),
  ).toEqual({ category: 'search_crawler', name: 'Googlebot', operator: 'Google' });
});

test('detects search crawlers', () => {
  expect(
    detectAgent('Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'),
  ).toEqual({ category: 'search_crawler', name: 'Bingbot', operator: 'Microsoft' });
  expect(detectAgent('DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)')).toEqual({
    category: 'search_crawler',
    name: 'DuckDuckBot',
    operator: 'DuckDuckGo',
  });
  expect(detectAgent('Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)')).toEqual({
    category: 'search_crawler',
    name: 'YandexBot',
    operator: 'Yandex',
  });
  expect(
    detectAgent(
      'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)',
    ),
  ).toEqual({ category: 'search_crawler', name: 'Baiduspider', operator: 'Baidu' });
});

test('detects DuckAssistBot as ai_search, ahead of DuckDuckBot', () => {
  expect(
    detectAgent(
      'Mozilla/5.0 (compatible; DuckAssistBot/1.0; +http://duckduckgo.com/duckassistbot)',
    ),
  ).toEqual({ category: 'ai_search', name: 'DuckAssistBot', operator: 'DuckDuckGo' });
});

test('detects Applebot-Extended ahead of Applebot', () => {
  expect(
    detectAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko; compatible; Applebot-Extended/1.0; +http://www.apple.com/go/applebot)',
    ),
  ).toEqual({ category: 'ai_crawler', name: 'Applebot-Extended', operator: 'Apple' });

  expect(
    detectAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko; compatible; Applebot/0.1; +http://www.apple.com/go/applebot)',
    ),
  ).toEqual({ category: 'search_crawler', name: 'Applebot', operator: 'Apple' });
});

test('detects other AI ingestion crawlers', () => {
  expect(
    detectAgent(
      'Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)',
    ),
  ).toEqual({ category: 'ai_crawler', name: 'Bytespider', operator: 'ByteDance' });
  expect(detectAgent('CCBot/2.0 (https://commoncrawl.org/faq/)')).toEqual({
    category: 'ai_crawler',
    name: 'CCBot',
    operator: 'Common Crawl',
  });
  expect(detectAgent('cohere-ai')).toEqual({
    category: 'ai_crawler',
    name: 'cohere-ai',
    operator: 'Cohere',
  });
  expect(
    detectAgent(
      'meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
    ),
  ).toEqual({ category: 'ai_crawler', name: 'Meta-ExternalAgent', operator: 'Meta' });
  expect(
    detectAgent(
      'Mozilla/5.0 (compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot)',
    ),
  ).toEqual({ category: 'ai_crawler', name: 'Amazonbot', operator: 'Amazon' });
});

test('detects facebookexternalhit as other_bot operated by Meta', () => {
  expect(
    detectAgent('facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'),
  ).toEqual({ category: 'other_bot', name: 'facebookexternalhit', operator: 'Meta' });
});

test('detects YouBot as ai_search', () => {
  expect(detectAgent('Mozilla/5.0 (compatible; YouBot (+http://www.you.com))')).toEqual({
    category: 'ai_search',
    name: 'YouBot',
    operator: 'You.com',
  });
});

test('detects SEO tools', () => {
  expect(detectAgent('Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)')).toEqual(
    { category: 'seo_tool', name: 'AhrefsBot', operator: 'Ahrefs' },
  );
  expect(
    detectAgent('Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)'),
  ).toEqual({ category: 'seo_tool', name: 'SemrushBot', operator: 'Semrush' });
  expect(detectAgent('Mozilla/5.0 (compatible; MJ12bot/v1.4.8; http://mj12bot.com/)')).toEqual({
    category: 'seo_tool',
    name: 'MJ12bot',
    operator: 'Majestic',
  });
  expect(
    detectAgent(
      'Mozilla/5.0 (compatible; DotBot/1.2; +https://opensiteexplorer.org/dotbot; help@moz.com)',
    ),
  ).toEqual({ category: 'seo_tool', name: 'DotBot', operator: 'Moz' });
  expect(
    detectAgent(
      'Mozilla/5.0 (compatible; DataForSeoBot/1.0; +https://dataforseo.com/dataforseo-bot)',
    ),
  ).toEqual({ category: 'seo_tool', name: 'DataForSeoBot', operator: 'DataForSEO' });
});

test('detects monitoring services', () => {
  expect(
    detectAgent('Mozilla/5.0+(compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)'),
  ).toEqual({ category: 'monitoring', name: 'UptimeRobot', operator: 'UptimeRobot' });
  expect(
    detectAgent('Mozilla/5.0 (compatible; Pingdom.com_bot_version_1.4_(http://www.pingdom.com/))'),
  ).toEqual({ category: 'monitoring', name: 'Pingdom', operator: 'Pingdom' });
  expect(detectAgent('StatusCake_Pagespeed_Indev')).toEqual({
    category: 'monitoring',
    name: 'StatusCake',
    operator: 'StatusCake',
  });
  expect(detectAgent('Better Uptime Bot Mozilla/5.0 (compatible)')).toEqual({
    category: 'monitoring',
    name: 'Better Uptime',
    operator: 'Better Stack',
  });
});

test('detects headless/automation browsers as ai_agent with no operator', () => {
  expect(
    detectAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36',
    ),
  ).toEqual({ category: 'ai_agent', name: 'HeadlessChrome', operator: null });
  expect(detectAgent('Mozilla/5.0 (X11; Linux x86_64) Playwright/1.40.0')).toEqual({
    category: 'ai_agent',
    name: 'Playwright',
    operator: null,
  });
  expect(detectAgent('Puppeteer/21.5.0')).toEqual({
    category: 'ai_agent',
    name: 'Puppeteer',
    operator: null,
  });
});

test('detects generic HTTP libraries as other_bot', () => {
  expect(detectAgent('python-requests/2.31.0')).toEqual({
    category: 'other_bot',
    name: 'python-requests',
    operator: null,
  });
  expect(detectAgent('curl/8.4.0')).toEqual({
    category: 'other_bot',
    name: 'curl',
    operator: null,
  });
  expect(detectAgent('Go-http-client/2.0')).toEqual({
    category: 'other_bot',
    name: 'Go-http-client',
    operator: null,
  });
  expect(detectAgent('axios/1.6.2')).toEqual({
    category: 'other_bot',
    name: 'axios',
    operator: null,
  });
});

test('falls through to isbot for unlisted bots', () => {
  expect(
    detectAgent('Mozilla/5.0 (compatible; SomeRandomCrawler/1.0; +http://example.com/bot)'),
  ).toEqual({ category: 'other_bot', name: null, operator: null });
});

test('returns null for real browser user agents', () => {
  // Chrome on Windows
  expect(
    detectAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    ),
  ).toBeNull();
  // Safari on macOS
  expect(
    detectAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    ),
  ).toBeNull();
  // Firefox on Linux
  expect(
    detectAgent('Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0'),
  ).toBeNull();
  // Chrome on Android
  expect(
    detectAgent(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    ),
  ).toBeNull();
});

test('returns null for undefined and empty user agents', () => {
  expect(detectAgent(undefined)).toBeNull();
  expect(detectAgent('')).toBeNull();
});

test('every category is covered by at least one rule', () => {
  const categories = new Set(AGENT_RULES.map(rule => rule.category));

  for (const category of [
    'ai_crawler',
    'ai_agent',
    'ai_search',
    'search_crawler',
    'seo_tool',
    'monitoring',
    'other_bot',
  ]) {
    expect(categories.has(category as never)).toBe(true);
  }
});

test('EXTRA_LLM_DOMAINS excludes the six upstream domains', () => {
  const upstream = [
    'chatgpt.com',
    'claude.ai',
    'copilot.microsoft.com',
    'gemini.google.com',
    'meta.ai',
    'perplexity.ai',
  ];

  for (const domain of upstream) {
    expect(EXTRA_LLM_DOMAINS).not.toContain(domain);
  }

  expect(EXTRA_LLM_DOMAINS).toContain('grok.com');
  expect(EXTRA_LLM_DOMAINS).toContain('chat.deepseek.com');
  expect(EXTRA_LLM_DOMAINS).toContain('duck.ai');
});

test('EXTRA_LLM_DOMAINS excludes domains unsafe for substring channel matching', () => {
  // Channel queries match referrer_domain with substring ILIKE ('%x.ai%'
  // would match 'onyx.ai'), so short/generic domains must not reach
  // LLM_DOMAINS even though they stay in AI_ASSISTANT_DOMAINS.
  for (const domain of ['x.ai', 'you.com', 'poe.com', 'kimi.com']) {
    expect(EXTRA_LLM_DOMAINS).not.toContain(domain);
    expect(AI_ASSISTANT_DOMAINS.map(({ domain: d }) => d)).toContain(domain);
  }
});

test('AI_ASSISTANT_DOMAINS entries all carry labels and unique domains', () => {
  const domains = AI_ASSISTANT_DOMAINS.map(({ domain }) => domain);

  expect(new Set(domains).size).toBe(domains.length);

  for (const { domain, label } of AI_ASSISTANT_DOMAINS) {
    expect(domain.length).toBeGreaterThan(0);
    expect(label.length).toBeGreaterThan(0);
  }
});
