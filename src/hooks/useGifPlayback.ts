import { useState } from "react";
import { useAutoplayGifs } from "@/queries/userPreferencesQueries";

export function useGifPlayback(): { playing: boolean; toggle: () => void } {
  const autoplay = useAutoplayGifs();
  const [choice, setChoice] = useState<boolean | null>(null);
  const playing = choice ?? autoplay;
  return { playing, toggle: () => setChoice(!playing) };
}
