import { describe, expect, it } from 'vitest';
import { getAgentCategoryLabel, getAssistantLabel, groupSeriesByCategory } from './categories';

describe('groupSeriesByCategory', () => {
  it('groups rows by category preserving time order', () => {
    const rows = [
      { t: '2026-07-01', category: 'ai_crawler', count: 3 },
      { t: '2026-07-01', category: 'ai_agent', count: 1 },
      { t: '2026-07-02', category: 'ai_crawler', count: 5 },
    ];

    const result = groupSeriesByCategory(rows);

    expect(result).toEqual([
      {
        category: 'ai_crawler',
        data: [
          { x: '2026-07-01', y: 3 },
          { x: '2026-07-02', y: 5 },
        ],
      },
      { category: 'ai_agent', data: [{ x: '2026-07-01', y: 1 }] },
    ]);
  });

  it('orders known categories by stack order and appends unknown ones', () => {
    const rows = [
      { t: '2026-07-01', category: 'mystery_bot', count: 1 },
      { t: '2026-07-01', category: 'other_bot', count: 2 },
      { t: '2026-07-01', category: 'ai_crawler', count: 3 },
    ];

    expect(groupSeriesByCategory(rows).map(({ category }) => category)).toEqual([
      'ai_crawler',
      'other_bot',
      'mystery_bot',
    ]);
  });

  it('coerces string counts to numbers', () => {
    const rows = [{ t: '2026-07-01', category: 'ai_search', count: '7' as unknown as number }];

    expect(groupSeriesByCategory(rows)[0].data[0].y).toBe(7);
  });

  it('handles empty and missing input', () => {
    expect(groupSeriesByCategory([])).toEqual([]);
    expect(groupSeriesByCategory(undefined as unknown as [])).toEqual([]);
  });
});

describe('getAgentCategoryLabel', () => {
  it('maps known categories to display labels', () => {
    expect(getAgentCategoryLabel('ai_crawler')).toBe('AI Crawlers');
    expect(getAgentCategoryLabel('other_bot')).toBe('Other Bots');
  });

  it('passes unknown categories through', () => {
    expect(getAgentCategoryLabel('mystery_bot')).toBe('mystery_bot');
  });
});

describe('getAssistantLabel', () => {
  it('matches exact assistant domains', () => {
    expect(getAssistantLabel('chatgpt.com')).toBe('ChatGPT');
    expect(getAssistantLabel('claude.ai')).toBe('Claude');
    expect(getAssistantLabel('perplexity.ai')).toBe('Perplexity');
  });

  it('matches subdomains of assistant domains', () => {
    expect(getAssistantLabel('www.perplexity.ai')).toBe('Perplexity');
    expect(getAssistantLabel('chat.openai.com')).toBe('ChatGPT');
  });

  it('is case-insensitive', () => {
    expect(getAssistantLabel('ChatGPT.com')).toBe('ChatGPT');
  });

  it('does not match unrelated or lookalike domains', () => {
    expect(getAssistantLabel('google.com')).toBeNull();
    expect(getAssistantLabel('notchatgpt.com')).toBeNull();
    expect(getAssistantLabel(null)).toBeNull();
    expect(getAssistantLabel('')).toBeNull();
  });
});
