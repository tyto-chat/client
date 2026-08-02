// Copies the MediaPipe vision WASM fileset from node_modules into public/
// so the background-blur processor never reaches for Google's CDN — a
// self-hosted deployment must serve these itself. The segmentation model
// (public/mediapipe/selfie_segmenter.tflite) is small and committed.
import { cpSync, existsSync, mkdirSync } from "node:fs";

function copyDir(src, dest) {
  if (!existsSync(src)) {
    console.warn(`copy-media-assets: ${src} missing, skipping`);
    return;
  }
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log(`copied ${src} -> ${dest}`);
}

// Background blur (MediaPipe selfie segmentation)
copyDir("node_modules/@mediapipe/tasks-vision/wasm", "public/mediapipe/wasm");
