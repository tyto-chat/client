import { describe, it, expect } from "vitest";
import {
  MASTER_LEVEL,
  QUIET_SCALE,
  SILENCE,
  SOUND_SET,
  TONE,
  soundDuration,
} from "@/sounds/soundSet";

describe("soundSet", () => {
  it("pins the tone the user chose", () => {
    expect(TONE).toEqual({
      attack: 0.015,
      partials: [
        { ratio: 1, gain: 0.62 },
        { ratio: 1.004, gain: 0.62 },
        { ratio: 0.5, gain: 0.22 },
      ],
    });
    expect([MASTER_LEVEL, QUIET_SCALE, SILENCE]).toEqual([0.5, 0.45, 0.0001]);
  });

  it.each([
    ["join", [523.25, 659.25, 783.99], [0, 0.07, 0.14], 0.24],
    ["leave", [783.99, 659.25, 523.25], [0, 0.07, 0.14], 0.24],
    ["mute", [523.25, 392.0], [0, 0.06], 0.12],
    ["unmute", [392.0, 523.25], [0, 0.06], 0.12],
    ["notification", [587.33, 880.0], [0, 0.11], 0.24],
  ] as const)("pins %s", (name, frequencies, starts, noteLength) => {
    const sound = SOUND_SET[name];
    expect(sound.notes.map((n) => n.frequency)).toEqual(frequencies);
    expect(sound.notes.map((n) => n.at)).toEqual(starts);
    expect(sound.noteLength).toBe(noteLength);
  });

  it("keeps the notification on different notes from the join sound", () => {
    const join = new Set(SOUND_SET.join.notes.map((n) => n.frequency));
    expect(SOUND_SET.notification.notes.some((n) => join.has(n.frequency))).toBe(false);
  });

  it("measures how long a sound lasts", () => {
    expect(soundDuration("join")).toBeCloseTo(0.14 + 0.24, 5);
    expect(soundDuration("mute")).toBeCloseTo(0.06 + 0.12, 5);
  });
});
