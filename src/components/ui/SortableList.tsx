import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { useTranslation } from "react-i18next";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";
import { GripVerticalIcon } from "@/components/icons";

export interface SortableItem {
  id: number;
  label: ReactNode;
}

function Row({ item }: { item: SortableItem }) {
  const { t } = useTranslation("common");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  return (
    <li
      ref={setNodeRef}
      data-testid="sortable-row"
      data-id={item.id}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg"
    >
      <button
        type="button"
        className="cursor-grab text-fg-subtle hover:text-fg active:cursor-grabbing"
        aria-label={t("drag_to_reorder")}
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon size={16} />
      </button>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </li>
  );
}

export function SortableList({
  items,
  onReorder,
}: {
  items: SortableItem[];
  onReorder: (ids: number[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    onReorder(arrayMove(items, oldIndex, newIndex).map((i) => i.id));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <Row key={item.id} item={item} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
