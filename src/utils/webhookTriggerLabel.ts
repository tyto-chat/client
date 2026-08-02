import type { TFunction } from "i18next";
import type { WebhookTrigger } from "@/api/webhooks";

function keyBase(triggerKey: string): string {
  return `webhook_trigger_${triggerKey.replace(/\./g, "_")}`;
}

export function triggerLabel(t: TFunction<"admin">, trigger: WebhookTrigger): string {
  return t(keyBase(trigger.key), { defaultValue: trigger.label });
}

export function triggerLabelByKey(
  t: TFunction<"admin">,
  triggerKey: string,
  triggers: WebhookTrigger[],
): string {
  const trigger = triggers.find((tr) => tr.key === triggerKey);
  return trigger ? triggerLabel(t, trigger) : triggerKey;
}

export function triggerDescription(t: TFunction<"admin">, trigger: WebhookTrigger): string {
  return t(`${keyBase(trigger.key)}_desc`, { defaultValue: trigger.description });
}
