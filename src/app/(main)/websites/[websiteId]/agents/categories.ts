// Fork (RFD 0007): pure helpers for the AI Traffic report (unit-tested).
import { type AgentCategory, AI_ASSISTANT_DOMAINS } from '@/lib/agents';

export const AGENT_CATEGORY_LABELS: Record<AgentCategory, string> = {
  ai_crawler: 'AI Crawlers',
  ai_agent: 'AI Agents',
  ai_search: 'AI Search',
  search_crawler: 'Search Crawlers',
  seo_tool: 'SEO Tools',
  monitoring: 'Monitoring',
  other_bot: 'Other Bots',
};

export const AGENT_CATEGORY_ORDER: AgentCategory[] = [
  'ai_crawler',
  'ai_agent',
  'ai_search',
  'search_crawler',
  'seo_tool',
  'monitoring',
  'other_bot',
];

export function getAgentCategoryLabel(category: string): string {
  return AGENT_CATEGORY_LABELS[category as AgentCategory] ?? category;
}

export interface AgentSeriesPoint {
  t: string;
  category: string;
  count: number;
}

export interface CategorySeries {
  category: string;
  data: { x: string; y: number }[];
}

// Groups API series rows into per-category { x, y } arrays, ordered for stacking.
// Unknown categories (future classifier additions) sort after the known ones.
export function groupSeriesByCategory(rows: AgentSeriesPoint[]): CategorySeries[] {
  const map = new Map<string, { x: string; y: number }[]>();

  for (const { t, category, count } of rows ?? []) {
    if (!map.has(category)) {
      map.set(category, []);
    }
    map.get(category).push({ x: t, y: Number(count) });
  }

  const known = AGENT_CATEGORY_ORDER.filter(category => map.has(category));
  const unknown = [...map.keys()].filter(
    category => !AGENT_CATEGORY_ORDER.includes(category as AgentCategory),
  );

  return [...known, ...unknown].map(category => ({ category, data: map.get(category) }));
}

// Maps a referrer domain to an AI-assistant display label, or null if it is
// not a known assistant domain. Subdomains match their parent domain.
export function getAssistantLabel(referrerDomain: string | null | undefined): string | null {
  if (!referrerDomain) {
    return null;
  }

  const value = referrerDomain.toLowerCase();
  const match = AI_ASSISTANT_DOMAINS.find(
    ({ domain }) => value === domain || value.endsWith(`.${domain}`),
  );

  return match?.label ?? null;
}
