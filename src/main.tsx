import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// iPhone Safari zooms the whole page when focusing a field whose text is
// smaller than 16px, which form fields at "fit width" usually are. On iOS,
// maximum-scale=1 stops that auto-zoom but still allows pinch-zoom; other
// platforms keep the default so pinch-zoom is never blocked.
if (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))) {
  const viewport = document.querySelector('meta[name="viewport"]');
  viewport?.setAttribute('content', `${viewport.getAttribute('content')}, maximum-scale=1`);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// The service worker only exists for Android "Open with" in Phase 1; skip it
// in dev so it never intercepts Vite's own requests.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('./sw.js').catch(() => undefined)
}
