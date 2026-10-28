# Rebuilding the AI scan model

`public/models/ffdetr-768-q8.onnx` is FFDetr from CommonForms (Apache-2.0),
exported to ONNX and stored with 8-bit weights. To rebuild it:

```bash
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python "rfdetr[onnxexport]==1.3.0" "transformers==4.57.1" onnx
curl -L -o FFDetr.pth https://huggingface.co/jbarrow/FFDetr/resolve/main/FFDetr.pth
shasum -a 256 FFDetr.pth   # f852e1bac18c8f435b82270fc8ff8e2ca4a2cd8869c411fa8f473f16e69585ef
.venv/bin/python -I export_ffdetr.py FFDetr.pth onnx 768
.venv/bin/python -I quantize.py onnx/inference_model.onnx ../../public/models/ffdetr-768-q8.onnx
```

Then run `npx vitest run src/detect/model.test.ts` to score it against the
test set. The app reads the model's input size from `MODEL` in
`src/detect/model.ts`; change both together. A new file name gets a fresh
cache on people's devices.
