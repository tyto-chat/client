import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import { ModalFooter } from "@/components/ModalFooter";
import { SortableList } from "@/components/ui/SortableList";
import { useNotification } from "@/context/NotificationContext";

export function ReorderModal({
  title,
  testId,
  items,
  isPending,
  onReorder,
  onClose,
}: {
  title: string;
  testId: string;
  items: { id: number; position: number; name: string }[];
  isPending: boolean;
  onReorder: (orderedIds: number[]) => Promise<unknown>;
  onClose: () => void;
}) {
  const { t } = useTranslation(["community", "common"]);
  const { notify } = useNotification();
  const [order, setOrder] = useState<number[]>(() =>
    [...items].sort((a, b) => a.position - b.position).map((i) => i.id),
  );
  const byId = new Map(items.map((i) => [i.id, i]));
  const listItems = order.map((id) => ({ id, label: byId.get(id)?.name ?? "" }));

  async function handleSubmit(e: React.FormEvent, close: () => void) {
    e.preventDefault();
    try {
      await onReorder(order);
      close();
    } catch {
      notify(t("community:reorder_failed"), "error");
    }
  }

  return (
    <Modal title={title} onClose={onClose} size="sm">
      {(close) => (
        <form
          onSubmit={(e) => handleSubmit(e, close)}
          className="flex flex-col gap-4"
          data-testid={testId}
        >
          <SortableList items={listItems} onReorder={setOrder} />
          <ModalFooter
            onCancel={close}
            submitLabel={t("common:save")}
            pendingLabel={t("common:saving")}
            isPending={isPending}
          />
        </form>
      )}
    </Modal>
  );
}
