import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { SpellCheckSection } from "@/components/preferences/SpellCheckSection";
import { setPlatformBridgeForTests } from "@/platform/bridge";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";
import type { BridgeSpellCheck } from "@/platform/PlatformBridge";

vi.mock("@/platform/appMode", () => ({ isManagedIdentityMode: () => true }));

function installBridge(initial: BridgeSpellCheck) {
  let state = initial;
  const spellCheck = {
    get: vi.fn(async () => state),
    set: vi.fn(async (languages: string[]) => {
      state = { ...state, enabled: languages };
      return state;
    }),
  };
  setPlatformBridgeForTests({ ...createFakePlatformBridge(), spellCheck });
  return spellCheck;
}

afterEach(() => setPlatformBridgeForTests(null));

describe("SpellCheckSection", () => {
  it("lists enabled languages by name and adds one from the picker", async () => {
    const spellCheck = installBridge({ available: ["en-US", "pl", "de"], enabled: ["en-US"] });
    render(<SpellCheckSection />);

    await screen.findByLabelText("Remove American English");
    expect(screen.queryByLabelText("Remove Polish")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Add language…"), { target: { value: "pl" } });
    await waitFor(() => expect(spellCheck.set).toHaveBeenCalledWith(["en-US", "pl"]));
    await screen.findByLabelText("Remove Polish");
  });

  it("removes a language from its chip", async () => {
    const spellCheck = installBridge({ available: ["en-US", "pl"], enabled: ["en-US", "pl"] });
    render(<SpellCheckSection />);

    fireEvent.click(await screen.findByLabelText("Remove Polish"));
    await waitFor(() => expect(spellCheck.set).toHaveBeenCalledWith(["en-US"]));
    await waitFor(() => expect(screen.queryByLabelText("Remove Polish")).not.toBeInTheDocument());
  });

  it("renders nothing when the shell offers no dictionaries", async () => {
    installBridge({ available: [], enabled: [] });
    const { container } = render(<SpellCheckSection />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
