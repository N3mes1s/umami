import {
  Button,
  Column,
  Form,
  FormField,
  FormSubmitButton,
  Grid,
  Heading,
  ListItem,
  ListSeparator,
  Loading,
  Row,
  Select,
  Switch,
  Text,
  TextField,
} from '@umami/react-zen';
import { useEffect, useState } from 'react';
import { useApi, useMessages, useModified } from '@/components/hooks';

const ALERT_TYPES = [
  { id: 'threshold', label: 'Threshold' },
  { id: 'change', label: 'Change' },
  { id: 'new-agent', label: 'New agent' },
  { id: 'digest', label: 'Digest' },
];

const METRICS = [
  { id: 'visitors', label: 'Visitors' },
  { id: 'views', label: 'Views' },
  { id: 'visits', label: 'Visits' },
  { id: 'events', label: 'Events' },
  { id: 'event', label: 'Event (by name)' },
];

const CHANNEL_TYPES = [
  { id: 'slack', label: 'Slack' },
  { id: 'discord', label: 'Discord' },
  { id: 'webhook', label: 'Webhook' },
];

const TYPE_DESCRIPTIONS: Record<string, string> = {
  threshold: 'Trigger when a metric over a trailing window crosses a value.',
  change: 'Trigger when a metric changes by a percentage vs the previous window.',
  'new-agent': 'Trigger when an AI agent never seen before visits this website.',
  digest: 'Send an unconditional summary on every interval.',
};

function requireInt(min: number, max: number) {
  return (value: any) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) {
      return `Must be a whole number between ${min} and ${max}`;
    }
    return true;
  };
}

function requireNumber(value: any) {
  return value !== '' && !Number.isNaN(Number(value)) ? true : 'Must be a number';
}

function requirePositive(value: any) {
  const n = Number(value);
  return !Number.isNaN(n) && n > 0 ? true : 'Must be a positive number';
}

export function AlertEditForm({
  websiteId,
  alertId,
  onClose,
}: {
  websiteId: string;
  alertId?: string;
  onClose?: () => void;
}) {
  const { getErrorMessage } = useMessages();
  const { get, post } = useApi();
  const { touch } = useModified();
  const [alert, setAlert] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(!!alertId);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<any>(null);

  const isEditing = !!alertId;

  useEffect(() => {
    if (!alertId) return;

    const loadAlert = async () => {
      setIsLoading(true);
      try {
        const data = await get(`/alerts/${alertId}`);
        setAlert(data);
      } finally {
        setIsLoading(false);
      }
    };
    loadAlert();
  }, [alertId]);

  const handleSubmit = async (data: any) => {
    const metric = data.metric === 'event' ? `event:${data.eventName || ''}` : data.metric;

    let parameters: Record<string, any> = {};

    if (data.type === 'threshold') {
      parameters = {
        metric,
        operator: data.operator,
        value: Number(data.value),
        windowMinutes: Number(data.windowMinutes),
      };
    } else if (data.type === 'change') {
      parameters = {
        metric,
        pctChange: Number(data.pctChange),
        direction: data.direction,
        windowMinutes: Number(data.windowMinutes),
      };
    }

    const payload = {
      name: data.name,
      type: data.type,
      parameters,
      channels: [{ type: data.channelType, url: data.channelUrl }],
      enabled: data.enabled ?? true,
      intervalMinutes: Number(data.intervalMinutes),
    };

    setIsPending(true);
    setError(null);

    try {
      if (isEditing) {
        await post(`/alerts/${alertId}`, payload);
      } else {
        await post('/alerts', { websiteId, ...payload });
      }
      touch('alerts');
      onClose?.();
    } catch (e) {
      setError(e);
    } finally {
      setIsPending(false);
    }
  };

  if (isLoading) {
    return <Loading placement="absolute" />;
  }

  const savedMetric: string = alert?.parameters?.metric || 'visitors';
  const isEventMetric = savedMetric.startsWith('event:');
  const channel = alert?.channels?.[0];

  const defaultValues: Record<string, any> = {
    name: alert?.name || '',
    type: alert?.type || 'threshold',
    metric: isEventMetric ? 'event' : savedMetric,
    eventName: isEventMetric ? savedMetric.slice('event:'.length) : '',
    operator: alert?.parameters?.operator || 'gt',
    value: alert?.parameters?.value !== undefined ? String(alert.parameters.value) : '100',
    windowMinutes:
      alert?.parameters?.windowMinutes !== undefined
        ? String(alert.parameters.windowMinutes)
        : '60',
    pctChange:
      alert?.parameters?.pctChange !== undefined ? String(alert.parameters.pctChange) : '50',
    direction: alert?.parameters?.direction || 'both',
    intervalMinutes: alert?.intervalMinutes !== undefined ? String(alert.intervalMinutes) : '60',
    channelType: channel?.type || 'slack',
    channelUrl: channel?.url || '',
    enabled: alert?.enabled ?? true,
  };

  const events = alert?.events || [];

  return (
    <Column gap="6">
      <Form onSubmit={handleSubmit} error={getErrorMessage(error)} defaultValues={defaultValues}>
        {({ watch, setValue }) => {
          const type = watch('type');
          const metric = watch('metric');
          const hasMetric = type === 'threshold' || type === 'change';

          return (
            <Column gap="4">
              <FormField label="Name" name="name" rules={{ required: 'Required' }}>
                <TextField
                  autoComplete="off"
                  autoFocus={!isEditing}
                  placeholder="e.g. Traffic spike"
                />
              </FormField>
              <FormField label="Type" name="type">
                <Select
                  value={type}
                  onChange={value => setValue('type', value, { shouldDirty: true })}
                >
                  {ALERT_TYPES.map(({ id, label }) => (
                    <ListItem key={id} id={id}>
                      {label}
                    </ListItem>
                  ))}
                </Select>
              </FormField>
              <Text color="muted" size="sm">
                {TYPE_DESCRIPTIONS[type]}
              </Text>
              {hasMetric && (
                <Grid columns="repeat(2, 1fr)" gap="3">
                  <FormField label="Metric" name="metric">
                    <Select
                      value={metric}
                      onChange={value => setValue('metric', value, { shouldDirty: true })}
                    >
                      {METRICS.map(({ id, label }) => (
                        <ListItem key={id} id={id}>
                          {label}
                        </ListItem>
                      ))}
                    </Select>
                  </FormField>
                  {metric === 'event' && (
                    <FormField label="Event name" name="eventName" rules={{ required: 'Required' }}>
                      <TextField autoComplete="off" placeholder="e.g. signup" />
                    </FormField>
                  )}
                </Grid>
              )}
              {type === 'threshold' && (
                <Grid columns="repeat(3, 1fr)" gap="3">
                  <FormField label="Condition" name="operator">
                    <Select
                      value={watch('operator')}
                      onChange={value => setValue('operator', value, { shouldDirty: true })}
                    >
                      <ListItem id="gt">Greater than</ListItem>
                      <ListItem id="lt">Less than</ListItem>
                    </Select>
                  </FormField>
                  <FormField
                    label="Value"
                    name="value"
                    rules={{ required: 'Required', validate: requireNumber }}
                  >
                    <TextField autoComplete="off" />
                  </FormField>
                  <FormField
                    label="Window (minutes)"
                    name="windowMinutes"
                    rules={{ required: 'Required', validate: requireInt(1, 10080) }}
                  >
                    <TextField autoComplete="off" />
                  </FormField>
                </Grid>
              )}
              {type === 'change' && (
                <Grid columns="repeat(3, 1fr)" gap="3">
                  <FormField
                    label="Change (%)"
                    name="pctChange"
                    rules={{ required: 'Required', validate: requirePositive }}
                  >
                    <TextField autoComplete="off" />
                  </FormField>
                  <FormField label="Direction" name="direction">
                    <Select
                      value={watch('direction')}
                      onChange={value => setValue('direction', value, { shouldDirty: true })}
                    >
                      <ListItem id="up">Up</ListItem>
                      <ListItem id="down">Down</ListItem>
                      <ListItem id="both">Both</ListItem>
                    </Select>
                  </FormField>
                  <FormField
                    label="Window (minutes)"
                    name="windowMinutes"
                    rules={{ required: 'Required', validate: requireInt(1, 10080) }}
                  >
                    <TextField autoComplete="off" />
                  </FormField>
                </Grid>
              )}
              <Grid columns="repeat(2, 1fr)" gap="3">
                <FormField
                  label="Check every (minutes)"
                  name="intervalMinutes"
                  rules={{ required: 'Required', validate: requireInt(5, 10080) }}
                >
                  <TextField autoComplete="off" />
                </FormField>
                <FormField label="Status" name="enabled">
                  <Switch
                    isSelected={watch('enabled')}
                    onChange={value => setValue('enabled', value, { shouldDirty: true })}
                  >
                    Enabled
                  </Switch>
                </FormField>
              </Grid>
              <Grid columns="1fr 2fr" gap="3">
                <FormField label="Channel" name="channelType">
                  <Select
                    value={watch('channelType')}
                    onChange={value => setValue('channelType', value, { shouldDirty: true })}
                  >
                    {CHANNEL_TYPES.map(({ id, label }) => (
                      <ListItem key={id} id={id}>
                        {label}
                      </ListItem>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Webhook URL" name="channelUrl" rules={{ required: 'Required' }}>
                  <TextField autoComplete="off" placeholder="https://hooks.slack.com/services/…" />
                </FormField>
              </Grid>
              <Row justifyContent="flex-end" paddingTop="3" gap="3">
                {onClose && (
                  <Button isDisabled={isPending} onPress={onClose}>
                    Cancel
                  </Button>
                )}
                <FormSubmitButton variant="primary" isDisabled={isPending}>
                  Save
                </FormSubmitButton>
              </Row>
            </Column>
          );
        }}
      </Form>
      {isEditing && (
        <>
          <ListSeparator />
          <Column gap="3">
            <Heading size="sm">Recent activity</Heading>
            {events.length === 0 && <Text color="muted">No activity yet.</Text>}
            {events.slice(0, 10).map((event: any) => (
              <Row key={event.id} justifyContent="space-between" alignItems="center" gap="3">
                <Text>{event?.payload?.title || event.status}</Text>
                <Row gap="3" alignItems="center">
                  <Text color="muted">{event.status}</Text>
                  <Text color="muted">{new Date(event.createdAt).toLocaleString()}</Text>
                </Row>
              </Row>
            ))}
          </Column>
        </>
      )}
    </Column>
  );
}
