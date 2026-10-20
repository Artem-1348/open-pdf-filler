// "Open with" support for the installed app.
// - Desktop Chrome/Edge: the manifest's file_handlers deliver files through
//   window.launchQueue.
// - Android: the manifest's share_target POSTs the file to ./share-target;
//   the service worker (public/sw.js) catches it on the device, parks it in
//   Cache Storage and redirects here with ?share-target=1.
// iOS does not let web apps register as a handler for files.

export const SHARE_CACHE = 'share-target';
export const SHARE_CACHE_KEY = 'shared-file';
export const SHARE_PARAM = 'share-target';

interface LaunchParams {
  files: ReadonlyArray<FileSystemFileHandle>;
}
interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void;
}

export function listenForLaunchedFiles(onFile: (file: File) => void): void {
  const queue = (window as unknown as { launchQueue?: LaunchQueue }).launchQueue;
  if (!queue) return;
  queue.setConsumer(async (params) => {
    const handle = params.files[0];
    if (handle) onFile(await handle.getFile());
  });
}

export async function takeSharedFile(): Promise<File | null> {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(SHARE_PARAM) || !('caches' in window)) return null;
  url.searchParams.delete(SHARE_PARAM);
  window.history.replaceState(null, '', url);

  const cache = await caches.open(SHARE_CACHE);
  const response = await cache.match(SHARE_CACHE_KEY);
  if (!response) return null;
  await cache.delete(SHARE_CACHE_KEY);
  const name = decodeURIComponent(response.headers.get('x-file-name') ?? 'shared.pdf');
  const blob = await response.blob();
  return new File([blob], name, { type: blob.type || 'application/pdf' });
}
