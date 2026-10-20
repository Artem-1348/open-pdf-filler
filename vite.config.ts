import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Content Security Policy for production builds. connect-src 'self' means
// the page cannot send anything to another server, which backs up the
// "nothing leaves the device" promise (NFR-1) at the browser level. The
// PDFium worker is a blob: module and needs 'wasm-unsafe-eval' to compile.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "img-src 'self' blob: data:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    ],
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths so the app works from a sub-path (e.g. GitHub Pages).
  base: './',
  plugins: [react(), contentSecurityPolicy()],
  build: {
    target: 'es2022',
  },
  worker: {
    format: 'es',
  },
})
