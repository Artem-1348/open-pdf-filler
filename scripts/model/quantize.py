# Weight-only int8: each large float weight becomes int8 + per-channel scale,
# expanded back to float by a DequantizeLinear node. Compute stays fp32.
import sys, numpy as np, onnx
from onnx import numpy_helper, helper, TensorProto
src, dst = sys.argv[1], sys.argv[2]
m = onnx.load(src)
g = m.graph
consumers = {}
for n in g.node:
    for i, x in enumerate(n.input):
        consumers.setdefault(x, []).append((n, i))
new_inits, new_nodes, done = [], [], 0
for init in list(g.initializer):
    w = numpy_helper.to_array(init)
    if w.dtype != np.float32 or w.ndim < 2 or w.size < 4096:
        new_inits.append(init); continue
    uses = consumers.get(init.name, [])
    axis = 0
    if uses and all(n.op_type == 'MatMul' and i == 1 for n, i in uses):
        axis = w.ndim - 1
    elif uses and all(n.op_type == 'Gemm' and i == 1 for n, i in uses):
        tb = [a.i for a in uses[0][0].attribute if a.name == 'transB']
        axis = 0 if tb and tb[0] else 1
    red = tuple(d for d in range(w.ndim) if d != axis)
    scale = np.abs(w).max(axis=red) / 127.0
    scale[scale == 0] = 1.0
    shape = [1] * w.ndim; shape[axis] = -1
    q = np.clip(np.round(w / scale.reshape(shape)), -127, 127).astype(np.int8)
    qn, sn, zn = init.name + '_q', init.name + '_s', init.name + '_z'
    new_inits += [numpy_helper.from_array(q, qn), numpy_helper.from_array(scale.astype(np.float32), sn),
                  numpy_helper.from_array(np.zeros(scale.shape, np.int8), zn)]
    new_nodes.append(helper.make_node('DequantizeLinear', [qn, sn, zn], [init.name], axis=axis, name=init.name + '_dq'))
    done += 1
del g.initializer[:]
g.initializer.extend(new_inits)
nodes = list(g.node); del g.node[:]
g.node.extend(new_nodes + nodes)
onnx.save(m, dst)
print('quantized', done, 'weights')
