import { useTranslation } from "react-i18next";
import { useAuthContext } from "@/context/AuthContext";
import { useTypingIndicator } from "@/queries/typingQueries";

interface TypingIndicatorProps {
  scope: string | null;
}

export function TypingIndicator({ scope }: TypingIndicatorProps) {
  const { t } = useTranslation("channel");
  const { user } = useAuthContext();
  const typers = useTypingIndicator(scope, user?.id);

  let text = "";
  if (typers.length === 1) {
    text = t("typing.one", { name: typers[0]?.name });
  } else if (typers.length >= 2 && typers.length <= 3) {
    const names = typers.map((x) => x.name);
    const last = names.pop()!;
    text = t("typing.many", { names: names.join(", "), last });
  } else if (typers.length >= 4) {
    text = t("typing.several");
  }

  const active = typers.length > 0;

  return (
    <div
      className="flex h-5 items-center gap-1.5 px-1 text-xs italic text-fg-muted"
      aria-live="polite"
    >
      {active && (
        <span className="flex items-end gap-0.5" aria-hidden="true">
          <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
          <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:150ms]" />
          <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:300ms]" />
        </span>
      )}
      {text}
    </div>
  );
}
