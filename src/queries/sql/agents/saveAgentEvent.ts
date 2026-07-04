import { uuid } from '@/lib/crypto';
import prisma from '@/lib/prisma';

export interface SaveAgentEventArgs {
  websiteId: string;
  category: string;
  name?: string | null;
  operator?: string | null;
  urlPath: string;
  hostname?: string | null;
  referrerDomain?: string | null;
  userAgent?: string | null;
  ipHash?: string | null;
  createdAt?: Date;
}

// Postgres-only by design: ClickHouse deploys still get Postgres writes for
// the agent_event table, so a plain prisma call (no runQuery split) is fine.
export async function saveAgentEvent(data: SaveAgentEventArgs) {
  return prisma.client.agentEvent.create({
    data: {
      id: uuid(),
      ...data,
    },
  });
}
