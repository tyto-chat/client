import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureApiClient } from "@/api/client";
import { openLinkedMessage } from "@/utils/openLinkedMessage";
import {
  clearFakeDirectory,
  fakeEndpoint,
  registerFakeDirectory,
} from "../../mocks/serverDirectory";

const requestIdentitySwitch = vi.hoisted(() => vi.fn());
vi.mock("@/platform/activeIdentity", () => ({ requestIdentitySwitch }));

const UUID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  configureApiClient("https://api.current.example/api");
  requestIdentitySwitch.mockReset().mockResolvedValue(true);
});
afterEach(clearFakeDirectory);

describe("openLinkedMessage", () => {
  it("navigates in place for the current server", () => {
    const navigate = vi.fn();
    openLinkedMessage({ origin: "https://api.current.example", uuid: UUID }, navigate as never);
    expect(navigate).toHaveBeenCalledWith({ to: "/m/$messageId", params: { messageId: UUID } });
    expect(requestIdentitySwitch).not.toHaveBeenCalled();
  });

  it("requests an identity switch to the endpoint for another server", () => {
    registerFakeDirectory([fakeEndpoint("ib", "https://b.example")], "ia");
    const navigate = vi.fn();
    openLinkedMessage({ origin: "https://b.example", uuid: UUID }, navigate as never);
    expect(requestIdentitySwitch).toHaveBeenCalledWith("ib", {
      to: "/m/$messageId",
      params: { messageId: UUID },
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("swallows a failed switch", async () => {
    registerFakeDirectory([fakeEndpoint("ib", "https://b.example")], "ia");
    requestIdentitySwitch.mockRejectedValue(new Error("identity_switch_target_not_healthy"));
    expect(() =>
      openLinkedMessage({ origin: "https://b.example", uuid: UUID }, vi.fn() as never),
    ).not.toThrow();
    await Promise.resolve();
  });
});
