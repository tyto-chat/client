# Third-Party Notices — tyto.chat client

This product (MIT-licensed, © 2026 Mateusz Bieniek) depends on third-party
software. All production dependencies are permissive and compatible with MIT.
Full per-package license texts ship inside each package under `node_modules/`
after `npm install`.

A current machine-readable inventory can be regenerated with:

```
npx license-checker --production --csv
```

## License distribution (production tree, incl. transitive)

| License                     | Notes                                              |
| --------------------------- | -------------------------------------------------- |
| MIT                         | majority of the tree                               |
| Apache-2.0                  | see attribution below                              |
| BSD-2-Clause / BSD-3-Clause | permissive                                         |
| ISC / 0BSD / Unlicense      | permissive / public-domain                         |
| MPL-2.0 OR Apache-2.0       | `dompurify` — used under the **Apache-2.0** option |

## Apache-2.0 attribution

The following dependencies are licensed under the Apache License, Version 2.0.
Their `NOTICE` files (where present) are distributed with each package in
`node_modules/` and are incorporated here by reference:

- `@livekit/components-core`, `@livekit/components-react`,
  `@livekit/components-styles`, `@livekit/mutex`, `@livekit/protocol`,
  `@livekit/track-processors`, `livekit-client` — © LiveKit, Inc.
- `@mediapipe/tasks-vision` — © Google LLC; its WASM fileset and the
  `selfie_segmenter.tflite` model (also Apache-2.0) are redistributed under
  `public/mediapipe/` for self-hosted background blur.
- `@bufbuild/protobuf` — © Buf Technologies, Inc. (Apache-2.0 AND BSD-3-Clause)
- `rxjs` — © the RxJS contributors
- `typescript` — © Microsoft Corporation (build-time only)

A copy of the Apache-2.0 license accompanies each of the packages above in
`node_modules/`.

## Notes

- `dompurify` is dual-licensed (MPL-2.0 OR Apache-2.0); this product uses it
  under the Apache-2.0 option, so no MPL file-level copyleft applies.
- No copyleft (GPL/LGPL/AGPL) or source-available (SSPL/RSAL) licenses are
  present in the production dependency tree.
