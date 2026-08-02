import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    {
      name: "embed-rewrite",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url?.startsWith("/embed/")) req.url = "/embed.html";
          next();
        });
      },
      // The E2E harness serves a build through `vite preview`, which needs the
      // same rewrite or /embed/* falls through to the SPA shell.
      configurePreviewServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url?.startsWith("/embed/")) req.url = "/embed.html";
          next();
        });
      },
    },
  ],
  resolve: {
    alias: { "@": "/src" },
  },
  build: {
    rollupOptions: {
      input: { main: "index.html", embed: "embed.html" },
      output: {
        // Function form, NOT object form. The previous object form
        // (`{ livekit: [...], editor: [...], highlight: [...] }`) had two
        // failures: (1) it hoisted react/react-dom into the `livekit` chunk
        // (they're transitive deps of @livekit/components-react), so the entry —
        // which needs react — statically imported that chunk and shipped LiveKit
        // on first paint, defeating the lazy(import("LiveKitRoomContent")) split;
        // (2) force-grouping ALL of @tiptap/lowlight into one chunk meant a tiny
        // eager import of a tiptap PluginKey dragged the whole ~124kB chunk onto
        // first paint. Splitting react into its own shared chunk fixes (1), and
        // NOT force-chunking tiptap/highlight fixes (2) — Rollup keeps their bulk
        // in the async MessageEditorImpl / message-render chunks and inlines only
        // the small eager slice. Result: first paint no longer preloads LiveKit
        // (~129kB gz) or highlight.js (~52kB gz).
        manualChunks(id) {
          // React must live in its own shared chunk. Otherwise Rollup hoists it
          // into whichever manual chunk first references it (e.g. livekit, via
          // @livekit/components-react) and the entry — which needs react — ends
          // up statically importing that chunk, dragging LiveKit onto first
          // paint. A dedicated react chunk is imported by both entry and livekit
          // without coupling them.
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/react/jsx-runtime") ||
            id.includes("node_modules/scheduler/")
          ) {
            return "react";
          }
          if (id.includes("node_modules/livekit-client") || id.includes("node_modules/@livekit/")) {
            return "livekit";
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    allowedHosts: true,
    hmr: {
      protocol: "wss",
    },
  },
  // `ddev e2e` stops the dev daemon and serves the build here instead, so nginx
  // keeps proxying client.ddev.site to the same port and no test needs to know.
  preview: {
    port: 5173,
    strictPort: true,
    host: true,
    allowedHosts: true,
  },
  test: {
    environment: "happy-dom",
    environmentOptions: {
      happyDOM: {
        settings: {
          // The embed.js test attaches a real <iframe src="https://..."> and
          // <script src="https://..."> to a live document; without these,
          // happy-dom actually tries to fetch/navigate them, producing noisy
          // abort errors after each test.
          disableIframePageLoading: true,
          disableJavaScriptFileLoading: true,
          // …and without this, each disabled load still logs a NotSupportedError
          // DOMException to stderr; treat it as a silent successful load instead.
          handleDisabledFileLoadingAsSuccess: true,
        },
      },
    },
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/components/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/routeTree.gen.ts", "src/routes/**"],
    },
  },
});
