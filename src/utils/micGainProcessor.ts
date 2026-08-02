import type { Track } from "livekit-client";
import type { AudioProcessorOptions, TrackProcessor } from "livekit-client";

export interface MicGainProcessor extends TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  setGain(percent: number): void;
}

export function createMicGainProcessor(initialPercent: number): MicGainProcessor {
  let gainNode: GainNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let destination: MediaStreamAudioDestinationNode | null = null;
  let percent = initialPercent;

  const setup = async (opts: AudioProcessorOptions) => {
    const ctx = opts.audioContext;
    source = ctx.createMediaStreamSource(new MediaStream([opts.track]));
    gainNode = ctx.createGain();
    gainNode.gain.value = percent / 100;
    destination = ctx.createMediaStreamDestination();
    source.connect(gainNode);
    gainNode.connect(destination);
    processor.processedTrack = destination.stream.getAudioTracks()[0];
  };

  const teardown = async () => {
    source?.disconnect();
    gainNode?.disconnect();
    destination?.stream.getTracks().forEach((t) => t.stop());
    source = null;
    gainNode = null;
    destination = null;
    processor.processedTrack = undefined;
  };

  const processor: MicGainProcessor = {
    name: "mic-gain",
    init: setup,
    restart: async (opts) => {
      await teardown();
      await setup(opts);
    },
    destroy: teardown,
    setGain(next: number) {
      percent = next;
      if (gainNode) gainNode.gain.value = next / 100;
    },
  };

  return processor;
}
