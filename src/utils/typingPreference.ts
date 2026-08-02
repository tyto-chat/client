import { STORAGE_KEYS } from "@/utils/storageKeys";

export function getSendTypingIndicator(): boolean {
  return localStorage.getItem(STORAGE_KEYS.SEND_TYPING_INDICATOR) !== "false";
}

export function setSendTypingIndicator(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEYS.SEND_TYPING_INDICATOR, enabled ? "true" : "false");
}
