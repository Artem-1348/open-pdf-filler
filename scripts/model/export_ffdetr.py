# Exports FFDetr (CommonForms, Apache-2.0) to ONNX for the AI scan.
# Usage: python export_ffdetr.py FFDetr.pth out_dir [size]
# The checkpoint is read with weights_only=True (no code from the file runs);
# only argparse.Namespace (the training settings) is allowed through.
import argparse, os, sys, tempfile
import torch
from rfdetr import RFDETRMedium

src, out = sys.argv[1], sys.argv[2]
size = int(sys.argv[3]) if len(sys.argv) > 3 else 768

with torch.serialization.safe_globals([argparse.Namespace]):
    checkpoint = torch.load(src, map_location='cpu', weights_only=True)
clean = os.path.join(tempfile.mkdtemp(), 'ffdetr-weights.pth')
torch.save({'model': checkpoint['model']}, clean)

# rfdetr 1.3 uses the classic (TorchScript-based) ONNX exporter.
_export = torch.onnx.export
torch.onnx.export = lambda *a, **k: _export(*a, dynamo=False, **k)

model = RFDETRMedium(pretrain_weights=clean, resolution=size, device='cpu')
model.export(output_dir=out, simplify=False, opset_version=17, verbose=False)
print(f'Wrote {out}/inference_model.onnx ({size} px)')
