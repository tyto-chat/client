import { useCallback, useState } from "react";
import { ConfirmDialog, type ConfirmOptions } from "@/components/ui/ConfirmDialog";

export function useConfirm() {
  const [state, setState] = useState<{
    opts: ConfirmOptions;
    resolve: (ok: boolean) => void;
  } | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ opts, resolve })),
    [],
  );

  const settle = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };

  const confirmDialog = state ? (
    <ConfirmDialog {...state.opts} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
  ) : null;

  return { confirm, confirmDialog };
}
