'use client';
import { Column, DataColumn, DataTable, Row, Text } from '@umami/react-zen';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { PageBody } from '@/components/common/PageBody';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useApi, useModified } from '@/components/hooks';
import { ApiKeyAddButton } from './ApiKeyAddButton';
import { ApiKeyDeleteButton } from './ApiKeyDeleteButton';

export function ApiKeysSettingsPage() {
  const { get, useQuery } = useApi();
  const { modified } = useModified('api-keys');

  const { data, isLoading, error } = useQuery({
    queryKey: ['api-keys', { modified }],
    queryFn: () => get('/api-keys'),
  });

  const formatDate = (value: string) => (value ? new Date(value).toLocaleDateString() : '—');

  return (
    <PageBody>
      <Column gap="6">
        <PageHeader title="API keys">
          <ApiKeyAddButton />
        </PageHeader>
        <Panel>
          <Column gap="3">
            <Text color="muted">
              API keys grant the same access as your account. Use them for the HTTP API, the MCP
              endpoint, and server-side collection.
            </Text>
            <LoadingPanel data={data} isLoading={isLoading} error={error}>
              <DataTable data={data || []}>
                <DataColumn id="name" label="Name">
                  {({ name }: any) => name}
                </DataColumn>
                <DataColumn id="keyPrefix" label="Key">
                  {({ keyPrefix }: any) => (
                    <Text style={{ fontFamily: 'monospace' }}>{keyPrefix}…</Text>
                  )}
                </DataColumn>
                <DataColumn id="createdAt" label="Created">
                  {({ createdAt }: any) => formatDate(createdAt)}
                </DataColumn>
                <DataColumn id="lastUsedAt" label="Last used">
                  {({ lastUsedAt }: any) => formatDate(lastUsedAt)}
                </DataColumn>
                <DataColumn id="expiresAt" label="Expires">
                  {({ expiresAt }: any) => formatDate(expiresAt)}
                </DataColumn>
                <DataColumn id="action" align="end" width="80px">
                  {({ id, name }: any) => (
                    <Row>
                      <ApiKeyDeleteButton keyId={id} name={name} />
                    </Row>
                  )}
                </DataColumn>
              </DataTable>
            </LoadingPanel>
          </Column>
        </Panel>
      </Column>
    </PageBody>
  );
}
