# Open PDF Filler

A free, open-source PDF tool that runs entirely in the browser. Nothing is uploaded.

**Status: Phase 1 (Viewer).** Open a PDF by drag-and-drop, the file picker, or "Open with"
on an installed app; read it with zoom, thumbnails and text search; get a password prompt for
protected files and a clear message for broken or non-PDF files. Works on phones.

## Develop

```bash
npm install
npm run dev
```

## Test

```bash
npm test             # unit tests (Vitest)
npm run test:e2e     # end-to-end tests (Playwright: Chromium, Firefox, WebKit, Pixel 7, iPhone 14)
npm run test:all     # lint + unit + end-to-end
```

The first end-to-end run needs the browsers: `npx playwright install chromium firefox webkit`.
End-to-end tests run against the production build, including its Content Security Policy.

## How it's built

- React + TypeScript + Vite.
- PDFium (via EmbedPDF 2.x) compiled to WebAssembly, running in a Web Worker.
- Fallback fonts are turned off so PDFium never fetches anything from a CDN.
- The production build ships a Content Security Policy with `connect-src 'self'`, so the page
  cannot send data to another server.

## "Open with" support

| Platform | How |
| --- | --- |
| Desktop Chrome / Edge (installed app) | `file_handlers` in the manifest + `launchQueue` |
| Android Chrome (installed app) | `share_target` in the manifest, received by `public/sw.js` on the device |
| iOS / iPadOS | Not available to web apps; use the file picker (it opens the Files app) |

## Test corpus

`tests/corpus/` holds the files the app is tested against, and `corpus.json` says what should
happen with each one. `npm run corpus` regenerates the synthetic files. See
`tests/corpus/README.md` for adding real-world forms.

## License

[MIT](LICENSE). Free to use, change and share.
