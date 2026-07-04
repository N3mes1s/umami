'use client';
import { Button, Dialog, DialogTrigger, Icon, Modal, Text } from '@umami/react-zen';
import { ConfirmationForm } from '@/components/common/ConfirmationForm';
import { useApi, useModified } from '@/components/hooks';
import { Trash2 } from '@/components/icons';

export function ApiKeyDeleteButton({ keyId, name }: { keyId: string; name: string }) {
  const { del, useMutation } = useApi();
  const { touch } = useModified();

  const { mutateAsync, error, isPending } = useMutation({
    mutationFn: () => del(`/api-keys/${keyId}`),
  });

  return (
    <DialogTrigger>
      <Button variant="quiet">
        <Icon>
          <Trash2 />
        </Icon>
      </Button>
      <Modal>
        <Dialog title="Revoke API key" style={{ width: 400 }}>
          {({ close }) => (
            <ConfirmationForm
              message={
                <Text>
                  Revoke <b>{name}</b>? Anything using this key stops working immediately.
                </Text>
              }
              buttonLabel="Revoke"
              buttonVariant="danger"
              isLoading={isPending}
              error={error as any}
              onConfirm={async () => {
                await mutateAsync();
                touch('api-keys');
                close();
              }}
              onClose={close}
            />
          )}
        </Dialog>
      </Modal>
    </DialogTrigger>
  );
}
