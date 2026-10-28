// Runs detector 2 (the FFDetr model) off the main thread. The model and the
// ONNX runtime come from this site and are kept in Cache Storage, so after
// the first download the AI scan works offline. Pages never leave the device.
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { decodeDetections, MODEL, toModelInput } from './model';
import { cachedDownload } from './model-cache';
import type { WorkerReply, WorkerRequest } from './model-client';

let session: ort.InferenceSession | null = null;

const reply = (msg: WorkerReply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') {
      const progress = (loaded: number) => reply({ type: 'progress', loaded });
      const runtime = await cachedDownload(new URL(wasmUrl, msg.base).href, (n) => progress(n));
      const model = await cachedDownload(new URL(MODEL.file, msg.base).href, (n) => progress(runtime.byteLength + n));
      ort.env.wasm.wasmBinary = runtime;
      // Threads need a cross-origin isolated page, which GitHub Pages isn't.
      ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      session = await ort.InferenceSession.create(new Uint8Array(model), {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
      reply({ type: 'ready' });
    } else if (msg.type === 'run') {
      if (!session) throw new Error('Model not loaded');
      const input = toModelInput(new Uint8ClampedArray(msg.rgba), msg.width, msg.height, MODEL.size);
      const out = await session.run({ input: new ort.Tensor('float32', input, [1, 3, MODEL.size, MODEL.size]) });
      const logits = out.labels;
      const findings = decodeDetections(out.dets.data as Float32Array, logits.data as Float32Array, logits.dims[2], msg.page, msg.pageSize);
      reply({ type: 'findings', id: msg.id, findings });
    }
  } catch (err) {
    reply({ type: 'error', id: msg.type === 'run' ? msg.id : undefined, message: err instanceof Error ? err.message : String(err) });
  }
};
