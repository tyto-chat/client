export interface VoiceTile {
  sid: string;
  kind: "camera" | "screen" | "avatar";
  userId: number;
  name: string;
}

export interface VoiceLayout {
  mode: "grid" | "spotlight";
  spotlightSid: string | null;
  tiles: VoiceTile[];
}

export function selectVoiceLayout(tiles: VoiceTile[]): VoiceLayout {
  const screen = tiles.find((t) => t.kind === "screen");
  return {
    mode: screen ? "spotlight" : "grid",
    spotlightSid: screen ? screen.sid : null,
    tiles,
  };
}
