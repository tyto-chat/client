import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { SoundName } from "@/sounds/soundSet";
import { setSoundPlayerForTests } from "@/sounds/soundPlayer";
import { getSoundSettings, resetSoundSettingsForTests } from "@/sounds/soundSettings";
import { resetSoundsForTests } from "@/sounds/sounds";
import { SoundsSection } from "@/components/preferences/SoundsSection";

let played: SoundName[];
let playedVolumes: number[];

beforeEach(() => {
  played = [];
  playedVolumes = [];
  setSoundPlayerForTests({
    play: (name, options) => {
      played.push(name);
      playedVolumes.push(options.volume);
    },
    setOutputDevice: () => undefined,
  });
  localStorage.clear();
  resetSoundSettingsForTests();
  resetSoundsForTests();
});

afterEach(() => {
  setSoundPlayerForTests(null);
  vi.restoreAllMocks();
});

describe("SoundsSection", () => {
  it("shows both switches on and the volume at 60", () => {
    render(<SoundsSection />);
    expect(screen.getByTestId("sounds-call-toggle")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("sounds-notification-toggle")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId("sounds-volume")).toHaveValue("60");
  });

  it("turns call sounds off", () => {
    render(<SoundsSection />);
    fireEvent.click(screen.getByTestId("sounds-call-toggle"));
    expect(getSoundSettings().callSounds).toBe(false);
  });

  it("turns notification sounds off", () => {
    render(<SoundsSection />);
    fireEvent.click(screen.getByTestId("sounds-notification-toggle"));
    expect(getSoundSettings().notificationSounds).toBe(false);
  });

  it("changes the volume", () => {
    render(<SoundsSection />);
    const slider = screen.getByTestId("sounds-volume");
    fireEvent.change(slider, { target: { value: "25" } });
    expect(getSoundSettings().volume).toBe(25);
  });

  it("plays the join sound from the call test button", () => {
    render(<SoundsSection />);
    fireEvent.click(screen.getByTestId("sounds-test-call"));
    expect(played).toEqual(["join"]);
  });

  it("plays the notification sound from its test button", () => {
    render(<SoundsSection />);
    fireEvent.click(screen.getByTestId("sounds-test-notification"));
    expect(played).toEqual(["notification"]);
  });

  it("plays a test sound at the volume just chosen", () => {
    render(<SoundsSection />);
    fireEvent.change(screen.getByTestId("sounds-volume"), { target: { value: "25" } });
    fireEvent.click(screen.getByTestId("sounds-test-call"));
    expect(playedVolumes).toEqual([0.25]);
  });

  it("plays a test sound while that group is switched off", () => {
    render(<SoundsSection />);
    fireEvent.click(screen.getByTestId("sounds-call-toggle"));
    fireEvent.click(screen.getByTestId("sounds-test-call"));
    expect(played).toEqual(["join"]);
  });

  it("labels the slider and the test buttons for screen readers", () => {
    render(<SoundsSection />);
    expect(screen.getByLabelText("Volume")).toBe(screen.getByTestId("sounds-volume"));
    expect(screen.getByLabelText("Play the call sound")).toBe(
      screen.getByTestId("sounds-test-call"),
    );
    expect(screen.getByLabelText("Play the notification sound")).toBe(
      screen.getByTestId("sounds-test-notification"),
    );
  });
});
