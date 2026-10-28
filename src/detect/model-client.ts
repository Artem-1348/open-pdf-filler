// The page's side of detector 2: starts the model worker, sends it page
// renderings and gets findings back. One worker per scan; it's closed after,
// which frees the model's memory (phones have little to spare).
import type { DetectedField } from './types';

export type WorkerRequest =
  | { type: 'load'; base: string }
  | { type: 'run'; id: number; page: number; rgba: ArrayBuffer; width: number; height: number; pageSize: { width: number; height: number } };

export type WorkerReply =
  | { type: 'progress'; loaded: number }
  | { type: 'ready' }
  | { type: 'findings'; id: number; findings: DetectedField[] }
  | { type: 'error'; id?: number; message: string };

export interface ModelRunner {
  findings(page: number, image: { data: Uint8ClampedArray; width: number; height: number }, scale: number): Promise<DetectedField[]>;
  close(): void;
}

// Loads the model (downloading it the first time) and resolves when ready.
// Aborting stops the worker at once, while loading or mid-page.
export function startModel(onDownload: (loadedBytes: number) => void, signal?: AbortSignal): Promise<ModelRunner> {
  const worker = new Worker(new URL('./model.worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, { resolve(f: DetectedField[]): void; reject(e: Error): void }>();
  let nextId = 1;
  let failLoad: ((e: Error) => void) | null = null;

  const fail = (error: Error) => {
    failLoad?.(error);
    for (const p of pending.values()) p.reject(error);
    pending.clear();
  };

  const stop = () => {
    fail(new DOMException('Detection cancelled', 'AbortError') as unknown as Error);
    worker.terminate();
  };

  return new Promise<ModelRunner>((resolve, reject) => {
    failLoad = reject;
    if (signal?.aborted) return stop();
    signal?.addEventListener('abort', stop, { once: true });
    worker.onerror = (e) => fail(new Error(e.message || 'The AI model could not start'));
    worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      const msg = e.data;
      if (msg.type === 'progress') onDownload(msg.loaded);
      else if (msg.type === 'ready') {
        failLoad = null;
        resolve({
          findings(page, image, scale) {
            const id = nextId++;
            const rgba = new Uint8ClampedArray(image.data).buffer;
            return new Promise<DetectedField[]>((res, rej) => {
              pending.set(id, { resolve: res, reject: rej });
              const req: WorkerRequest = {
                type: 'run',
                id,
                page,
                rgba,
                width: image.width,
                height: image.height,
                pageSize: { width: image.width / scale, height: image.height / scale },
              };
              worker.postMessage(req, [rgba]);
            });
          },
          close() {
            signal?.removeEventListener('abort', stop);
            stop();
          },
        });
      } else if (msg.type === 'findings') {
        pending.get(msg.id)?.resolve(msg.findings);
        pending.delete(msg.id);
      } else if (msg.type === 'error') {
        const error = new Error(msg.message);
        if (msg.id !== undefined) {
          pending.get(msg.id)?.reject(error);
          pending.delete(msg.id);
        } else fail(error);
      }
    };
    const req: WorkerRequest = { type: 'load', base: document.baseURI };
    worker.postMessage(req);
  });
}
