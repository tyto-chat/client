import "@testing-library/jest-dom/vitest";
import { server } from "./mocks/server";
import { installFakeEventSource, uninstallFakeEventSource } from "./mocks/EventSource";
import { i18nReady } from "@/i18n";

beforeAll(async () => {
  await i18nReady;
  installFakeEventSource();
  server.listen({ onUnhandledRequest: "warn" });
});

afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});

afterAll(() => {
  uninstallFakeEventSource();
  server.close();
});
