import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSoundPlayer } from "@/sounds/soundPlayer";
import type { SoundPlayer } from "@/sounds/soundPlayer";

type ParamCall = ["set" | "ramp", number, number];

interface FakeAudioParam {
  calls: ParamCall[];
  setValueAtTime: (value: number, time: number) => void;
  exponentialRampToValueAtTime: (value: number, time: number) => void;
}

interface FakeOscillator {
  frequency: FakeAudioParam;
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

interface FakeGain {
  gain: FakeAudioParam;
  connect: ReturnType<typeof vi.fn>;
}

interface FakeContext {
  currentTime: number;
  state: string;
  resume: ReturnType<typeof vi.fn>;
  destination: Record<string, never>;
  createOscillator: () => FakeOscillator;
  createGain: () => FakeGain;
  setSinkId?: (deviceId: string) => Promise<void>;
}

function createParam(): FakeAudioParam {
  const calls: ParamCall[] = [];
  return {
    calls,
    setValueAtTime: (value, time) => {
      calls.push(["set", value, time]);
    },
    exponentialRampToValueAtTime: (value, time) => {
      calls.push(["ramp", value, time]);
    },
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

let oscillators: FakeOscillator[];
let gains: FakeGain[];
let created: number;
let context: FakeContext;
let player: SoundPlayer;

function makeContext(): FakeContext {
  return {
    currentTime: 10,
    state: "running",
    resume: vi.fn().mockResolvedValue(undefined),
    destination: {},
    createOscillator: () => {
      const oscillator: FakeOscillator = {
        frequency: createParam(),
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(oscillator);
      return oscillator;
    },
    createGain: () => {
      const gain: FakeGain = { gain: createParam(), connect: vi.fn() };
      gains.push(gain);
      return gain;
    },
  };
}

describe("soundPlayer", () => {
  beforeEach(() => {
    oscillators = [];
    gains = [];
    created = 0;
    context = makeContext();
    player = createSoundPlayer(() => {
      created += 1;
      return context as unknown as AudioContext;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("schedules every note and partial of a sound", () => {
    player.play("join", { volume: 1, scale: 1, pitch: 0, stretch: 1 });
    expect(oscillators).toHaveLength(9);
    expect(oscillators.map((o) => o.frequency.calls[0])).toEqual(
      [
        [523.25, 10.02],
        [523.25 * 1.004, 10.02],
        [523.25 * 0.5, 10.02],
        [659.25, 10.09],
        [659.25 * 1.004, 10.09],
        [659.25 * 0.5, 10.09],
        [783.99, 10.16],
        [783.99 * 1.004, 10.16],
        [783.99 * 0.5, 10.16],
      ].map(([f, t]) => ["set", expect.closeTo(f!, 3), expect.closeTo(t!, 5)]),
    );
  });

  it("shapes each partial: silence, attack to the peak, decay to silence", () => {
    player.play("notification", { volume: 0.6, scale: 1, pitch: 0, stretch: 1 });
    expect(gains[0]!.gain.calls).toEqual([
      ["set", 0.0001, expect.closeTo(10.02, 5)],
      ["ramp", expect.closeTo(0.5 * 0.6 * 0.62, 5), expect.closeTo(10.035, 5)],
      ["ramp", 0.0001, expect.closeTo(10.02 + 0.24, 5)],
    ]);
  });

  it("plays quieter by the scale", () => {
    player.play("join", { volume: 1, scale: 0.45, pitch: 0, stretch: 1 });
    expect(gains[0]!.gain.calls[1]![1]).toBeCloseTo(0.5 * 0.45 * 0.62, 5);
  });

  it("raises every frequency by an octave at +12 semitones", () => {
    player.play("mute", { volume: 1, scale: 1, pitch: 12, stretch: 1 });
    expect(oscillators.map((o) => o.frequency.calls[0]![1])).toEqual(
      [523.25 * 2, 523.25 * 2 * 1.004, 523.25, 392 * 2, 392 * 2 * 1.004, 392].map((f) =>
        expect.closeTo(f, 3),
      ),
    );
  });

  it("lowers every frequency by a fifth at -7 semitones", () => {
    player.play("mute", { volume: 1, scale: 1, pitch: -7, stretch: 1 });
    expect(oscillators[0]!.frequency.calls[0]![1]).toBeCloseTo(523.25 * Math.pow(2, -7 / 12), 3);
  });

  it("stretches the timing, not the attack, at double length", () => {
    player.play("join", { volume: 1, scale: 1, pitch: 0, stretch: 2 });
    expect(oscillators.map((o) => o.frequency.calls[0]![2])).toEqual(
      [10.02, 10.02, 10.02, 10.16, 10.16, 10.16, 10.3, 10.3, 10.3].map((t) => expect.closeTo(t, 5)),
    );
    expect(gains[0]!.gain.calls).toEqual([
      ["set", 0.0001, expect.closeTo(10.02, 5)],
      ["ramp", expect.closeTo(0.5 * 0.62, 5), expect.closeTo(10.035, 5)],
      ["ramp", 0.0001, expect.closeTo(10.02 + 0.48, 5)],
    ]);
  });

  it("shortens the timing at half length", () => {
    player.play("join", { volume: 1, scale: 1, pitch: 0, stretch: 0.5 });
    expect(oscillators[3]!.frequency.calls[0]![2]).toBeCloseTo(10.02 + 0.035, 5);
    expect(gains[0]!.gain.calls[2]![2]).toBeCloseTo(10.02 + 0.12, 5);
  });

  it("creates nothing at volume 0", () => {
    player.play("join", { volume: 0, scale: 1, pitch: 0, stretch: 1 });
    expect(oscillators).toHaveLength(0);
  });

  it("creates the context on first use and keeps it", () => {
    expect(created).toBe(0);
    player.play("mute", { volume: 1, scale: 1, pitch: 0, stretch: 1 });
    player.play("unmute", { volume: 1, scale: 1, pitch: 0, stretch: 1 });
    expect(created).toBe(1);
  });

  it("resumes a suspended context before playing", async () => {
    context.state = "suspended";
    const resume = deferred();
    context.resume.mockReturnValue(resume.promise);
    player.play("mute", { volume: 1, scale: 1, pitch: 0, stretch: 1 });
    expect(context.resume).toHaveBeenCalled();
    expect(oscillators).toHaveLength(0);
    resume.resolve();
    await flushPromises();
    expect(oscillators.length).toBeGreaterThan(0);
  });

  it("plays nothing while the context cannot start", async () => {
    context.state = "suspended";
    context.resume.mockReturnValue(new Promise<void>(() => undefined));
    player.play("mute", { volume: 1, scale: 1, pitch: 0, stretch: 1 });
    await flushPromises();
    expect(oscillators).toHaveLength(0);
  });

  it("drops a sound when the context starts too late", async () => {
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    context.state = "suspended";
    const resume = deferred();
    context.resume.mockReturnValue(resume.promise);
    player.play("mute", { volume: 1, scale: 1, pitch: 0, stretch: 1 });
    now = 1301;
    resume.resolve();
    await flushPromises();
    expect(oscillators).toHaveLength(0);
  });

  it("drops a sound when the context refuses to start", async () => {
    context.state = "suspended";
    context.resume.mockRejectedValue(new Error("not allowed"));
    expect(() => player.play("mute", { volume: 1, scale: 1, pitch: 0, stretch: 1 })).not.toThrow();
    await flushPromises();
    expect(oscillators).toHaveLength(0);
  });

  it("plays normally once the context runs after a dropped sound", async () => {
    context.state = "suspended";
    context.resume.mockReturnValue(new Promise<void>(() => undefined));
    player.play("mute", { volume: 1, scale: 1, pitch: 0, stretch: 1 });
    await flushPromises();
    context.state = "running";
    player.play("mute", { volume: 1, scale: 1, pitch: 0, stretch: 1 });
    expect(oscillators.length).toBeGreaterThan(0);
  });

  it.each([
    ["there is no audio support", () => null],
    [
      "creating the context throws",
      () => {
        throw new Error("blocked");
      },
    ],
  ])("does nothing when %s", (_label, factory) => {
    const silent = createSoundPlayer(factory);
    expect(() => silent.play("join", { volume: 1, scale: 1, pitch: 0, stretch: 1 })).not.toThrow();
  });

  it("does not throw when scheduling fails", () => {
    context.createOscillator = () => {
      throw new Error("closed");
    };
    expect(() => player.play("join", { volume: 1, scale: 1, pitch: 0, stretch: 1 })).not.toThrow();
  });

  it("sends sound to the chosen output device", () => {
    context.setSinkId = vi.fn().mockResolvedValue(undefined);
    player.setOutputDevice("headset");
    player.play("mute", { volume: 1, scale: 1, pitch: 0, stretch: 1 });
    expect(context.setSinkId).toHaveBeenCalledWith("headset");
  });

  it("keeps playing when the output device cannot be used", async () => {
    context.setSinkId = vi.fn().mockRejectedValue(new Error("gone"));
    player.setOutputDevice("unplugged");
    player.play("mute", { volume: 1, scale: 1, pitch: 0, stretch: 1 });
    await flushPromises();
    expect(oscillators.length).toBeGreaterThan(0);
    const firstPlay = oscillators.length;
    player.play("mute", { volume: 1, scale: 1, pitch: 0, stretch: 1 });
    expect(oscillators.length).toBeGreaterThan(firstPlay);
  });

  it("works where the browser cannot choose an output device", () => {
    player.setOutputDevice("headset");
    expect(() => player.play("mute", { volume: 1, scale: 1, pitch: 0, stretch: 1 })).not.toThrow();
  });

  it("returns to the default output when the device is cleared", () => {
    context.setSinkId = vi.fn().mockResolvedValue(undefined);
    player.setOutputDevice("headset");
    player.play("mute", { volume: 1, scale: 1, pitch: 0, stretch: 1 });
    player.setOutputDevice("");
    player.play("mute", { volume: 1, scale: 1, pitch: 0, stretch: 1 });
    expect(context.setSinkId).toHaveBeenCalledWith("");
  });

  it("makes no output-device call when none was ever chosen and it is cleared", () => {
    context.setSinkId = vi.fn().mockResolvedValue(undefined);
    player.setOutputDevice("");
    player.play("mute", { volume: 1, scale: 1, pitch: 0, stretch: 1 });
    expect(context.setSinkId).not.toHaveBeenCalled();
  });
});
