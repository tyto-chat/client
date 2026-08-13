import type { PlatformBridge } from "./PlatformBridge";

const SECRET_PREFIX = "tytoFakeBridge:secret:";
const CONFIG_KEY = "tytoFakeBridge:config";

export function createFakePlatformBridge(storage: Storage = localStorage): PlatformBridge {
  return {
    secrets: {
      get: async (key) => storage.getItem(SECRET_PREFIX + key),
      set: async (key, value) => storage.setItem(SECRET_PREFIX + key, value),
      delete: async (key) => storage.removeItem(SECRET_PREFIX + key),
    },
    config: {
      get: async () => storage.getItem(CONFIG_KEY),
      set: async (json) => storage.setItem(CONFIG_KEY, json),
    },
  };
}
