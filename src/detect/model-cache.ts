// Keeps the AI model and its runtime on the device (Cache Storage), so they
// download once. Works from the page and from workers.
import { MODEL } from './model';

// Named after the model file: a new model gets a fresh cache.
export const MODEL_CACHE = `opf-${MODEL.file.split('/').pop()}`;

async function openCache(): Promise<Cache | null> {
  try {
    return 'caches' in self ? await caches.open(MODEL_CACHE) : null;
  } catch {
    // Private browsing or blocked storage: download each time instead.
    return null;
  }
}

// The file's bytes, from the cache or downloaded (reporting bytes so far).
export async function cachedDownload(url: string, onProgress?: (loaded: number) => void): Promise<ArrayBuffer> {
  const cache = await openCache();
  const hit = await cache?.match(url).catch(() => undefined);
  if (hit) {
    const bytes = await hit.arrayBuffer();
    onProgress?.(bytes.byteLength);
    return bytes;
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.(loaded);
  }
  const bytes = new Uint8Array(loaded);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  await cache?.put(url, new Response(bytes, { headers: { 'content-type': res.headers.get('content-type') ?? 'application/octet-stream' } })).catch(() => {});
  return bytes.buffer;
}

// Whether the model is already on this device (so no download is needed).
export async function modelOnDevice(base: string): Promise<boolean> {
  const cache = await openCache();
  if (!cache) return false;
  try {
    return !!(await cache.match(new URL(MODEL.file, base).href));
  } catch {
    return false;
  }
}
