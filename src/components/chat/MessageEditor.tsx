import { lazy, Suspense } from "react";
import type { MessageEditorProps } from "./MessageComposer";

const MessageComposer = lazy(() => import("./MessageComposer"));

function EditorFallback() {
  return <div aria-hidden className="min-h-[3rem] rounded-lg border border-line bg-surface" />;
}

export function MessageEditor(props: MessageEditorProps) {
  return (
    <Suspense fallback={<EditorFallback />}>
      <MessageComposer {...props} />
    </Suspense>
  );
}
