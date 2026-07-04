import { Column, DataColumn, DataTable, Heading, Row, Text } from '@umami/react-zen';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { useApi, useModified } from '@/components/hooks';
import { Edit, Plus } from '@/components/icons';
import { DialogButton } from '@/components/input/DialogButton';
import { AlertDeleteButton } from './AlertDeleteButton';
import { AlertEditForm } from './AlertEditForm';

const TYPE_LABELS: Record<string, string> = {
  threshold: 'Threshold',
  change: 'Change',
  'new-agent': 'New agent',
  digest: 'Digest',
};

export function WebsiteAlerts({ websiteId }: { websiteId: string }) {
  const { get, useQuery } = useApi();
  const { modified } = useModified('alerts');

  const { data, isLoading, error } = useQuery({
    queryKey: ['alerts', { websiteId, modified }],
    queryFn: () => get('/alerts', { websiteId }),
  });

  const alerts = data || [];
  const hasAlerts = alerts.length > 0;

  return (
    <LoadingPanel data={data} isEmpty={false} isLoading={isLoading} error={error}>
      <Column gap="4">
        <Row justifyContent="space-between" alignItems="center">
          <Heading>Alerts</Heading>
          <DialogButton
            icon={<Plus size={16} />}
            label="Add"
            title="Add alert"
            variant="primary"
            width="600px"
          >
            {({ close }) => <AlertEditForm websiteId={websiteId} onClose={close} />}
          </DialogButton>
        </Row>
        {hasAlerts ? (
          <DataTable data={alerts}>
            <DataColumn id="name" label="Name">
              {({ name }: any) => name}
            </DataColumn>
            <DataColumn id="type" label="Type">
              {({ type }: any) => TYPE_LABELS[type] || type}
            </DataColumn>
            <DataColumn id="intervalMinutes" label="Interval">
              {({ intervalMinutes }: any) => `${intervalMinutes} min`}
            </DataColumn>
            <DataColumn id="enabled" label="Status">
              {({ enabled }: any) => (
                <Text color={enabled ? undefined : 'muted'}>
                  {enabled ? 'Enabled' : 'Disabled'}
                </Text>
              )}
            </DataColumn>
            <DataColumn id="lastTriggeredAt" label="Last triggered">
              {({ lastTriggeredAt }: any) =>
                lastTriggeredAt ? new Date(lastTriggeredAt).toLocaleString() : '—'
              }
            </DataColumn>
            <DataColumn id="action" align="end" width="100px">
              {({ id, name }: any) => (
                <Row>
                  <DialogButton icon={<Edit />} title="Edit alert" variant="quiet" width="600px">
                    {({ close }) => (
                      <AlertEditForm websiteId={websiteId} alertId={id} onClose={close} />
                    )}
                  </DialogButton>
                  <AlertDeleteButton alertId={id} name={name} />
                </Row>
              )}
            </DataColumn>
          </DataTable>
        ) : (
          <Text color="muted">
            No alerts configured. Alerts push traffic changes, thresholds, new AI agents, and
            digests to Slack, Discord, or a webhook.
          </Text>
        )}
      </Column>
    </LoadingPanel>
  );
}
