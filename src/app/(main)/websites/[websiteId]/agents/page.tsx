import type { Metadata } from 'next';
import { AgentsTrafficPage } from './AgentsTrafficPage';

// Fork (RFD 0007): AI Traffic report tab.
export default async function ({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;

  return <AgentsTrafficPage websiteId={websiteId} />;
}

export const metadata: Metadata = {
  title: 'AI Traffic',
};
