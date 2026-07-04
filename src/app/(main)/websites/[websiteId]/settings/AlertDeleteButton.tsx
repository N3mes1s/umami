import { Button, Dialog, DialogTrigger, Icon, Modal, Text } from '@umami/react-zen';
import { ConfirmationForm } from '@/components/common/ConfirmationForm';
import { useApi, useModified } from '@/components/hooks';
import { Trash2 } from '@/components/icons';

export function AlertDeleteButton({ alertId, name }: { alertId: string; name: string }) {
  const { del, useMutation } = useApi();
  const { touch } = useModified();

  const { mutateAsync, error, isPending } = useMutation({
    mutationFn: () => del(`/alerts/${alertId}`),
  });

  return (
    <DialogTrigger>
      <Button variant="quiet">
        <Icon>
          <Trash2 />
        </Icon>
      </Button>
      <Modal>
        <Dialog title="Delete alert" style={{ width: 400 }}>
          {({ close }) => (
            <ConfirmationForm
              message={
                <Text>
                  Delete <b>{name}</b>? Notifications for this alert stop immediately.
                </Text>
              }
              buttonLabel="Delete"
              buttonVariant="danger"
              isLoading={isPending}
              error={error as any}
              onConfirm={async () => {
                await mutateAsync();
                touch('alerts');
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
