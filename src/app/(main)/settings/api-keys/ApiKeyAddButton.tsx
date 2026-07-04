'use client';
import {
  Button,
  Column,
  Dialog,
  DialogTrigger,
  Form,
  FormButtons,
  FormField,
  FormSubmitButton,
  Icon,
  Modal,
  Row,
  Text,
  TextField,
} from '@umami/react-zen';
import { useState } from 'react';
import { CopyButton } from '@/components/common/CopyButton';
import { useApi, useMessages, useModified } from '@/components/hooks';
import { Plus } from '@/components/icons';

function ApiKeyForm({ onClose }: { onClose: () => void }) {
  const { t, labels, getErrorMessage } = useMessages();
  const { post, useMutation } = useApi();
  const { touch } = useModified();
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const { mutateAsync, error, isPending } = useMutation({
    mutationFn: (data: any) => post('/api-keys', data),
  });

  const handleSubmit = async (data: any) => {
    const result = await mutateAsync(data);
    touch('api-keys');
    setCreatedKey(result.key);
  };

  if (createdKey) {
    return (
      <Column gap="4">
        <Text>This key is shown only once. Copy it somewhere safe now.</Text>
        <Row
          alignItems="center"
          gap="2"
          padding="3"
          backgroundColor="surface-sunken"
          borderRadius
          overflow="hidden"
        >
          <Text style={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>{createdKey}</Text>
          <CopyButton value={createdKey} label="Copy key" />
        </Row>
        <FormButtons>
          <Button variant="primary" onPress={onClose}>
            Done
          </Button>
        </FormButtons>
      </Column>
    );
  }

  return (
    <Form onSubmit={handleSubmit} error={getErrorMessage(error)}>
      <FormField label={t(labels.name)} name="name" rules={{ required: t(labels.required) }}>
        <TextField autoFocus placeholder="e.g. mcp-claude, railway-cron" />
      </FormField>
      <FormButtons>
        <Button onPress={onClose}>{t(labels.cancel)}</Button>
        <FormSubmitButton isDisabled={isPending}>{t(labels.save)}</FormSubmitButton>
      </FormButtons>
    </Form>
  );
}

export function ApiKeyAddButton() {
  return (
    <DialogTrigger>
      <Button variant="primary">
        <Icon>
          <Plus />
        </Icon>
        <Text>Create API key</Text>
      </Button>
      <Modal>
        <Dialog title="Create API key" style={{ width: 480 }}>
          {({ close }) => <ApiKeyForm onClose={close} />}
        </Dialog>
      </Modal>
    </DialogTrigger>
  );
}
