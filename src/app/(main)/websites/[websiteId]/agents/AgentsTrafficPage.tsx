'use client';
// Fork (RFD 0007): the AI Traffic report tab.
import { Column } from '@umami/react-zen';
import { WebsiteControls } from '@/app/(main)/websites/[websiteId]/WebsiteControls';
import { Panel } from '@/components/common/Panel';
import { AgentsChart } from './AgentsChart';
import { AgentsMetricsBar } from './AgentsMetricsBar';
import { AgentsTables } from './AgentsTables';
import { LlmReferralsPanel } from './LlmReferralsPanel';

export function AgentsTrafficPage({ websiteId }: { websiteId: string }) {
  return (
    <Column gap>
      {/* Session filters don't apply to agent events; only expose the date picker. */}
      <WebsiteControls websiteId={websiteId} allowFilter={false} />
      <AgentsMetricsBar websiteId={websiteId} />
      <Panel title="AI & bot events" minHeight="450px">
        <AgentsChart websiteId={websiteId} />
      </Panel>
      <AgentsTables websiteId={websiteId} />
      <LlmReferralsPanel websiteId={websiteId} />
    </Column>
  );
}
