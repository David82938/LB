/* ============================================================ NODE FACTORY */
function makeGate(kind) {
  if (kind === 'AND') {
    return {
      inputs: [
        { id: 'a', name: 'a', kind: 'input', value: false },
        { id: 'b', name: 'b', kind: 'input', value: false },
      ],
      outputs: [{ id: 'c', name: 'c', kind: 'output', value: false }],
    };
  }
  if (kind === 'NOT') {
    return {
      inputs: [{ id: 'a', name: 'a', kind: 'input', value: false }],
      outputs: [{ id: 'b', name: 'b', kind: 'output', value: false }],
    };
  }
  if (kind === 'WIRE_REVERSE') {
    return {
      inputs: [{ id: 'in', name: 'in', kind: 'input', value: false }],
      outputs: [{ id: 'out', name: 'out', kind: 'output', value: false }],
    };
  }
  return { inputs: [], outputs: [] };
}

function createNode(kind, position, opts) {
  opts = opts || {};
  const base = makeGate(kind);
  let inputs = base.inputs;
  let outputs = base.outputs;
  if (kind === 'INPUT') {
    inputs = [];
    outputs = [{ id: 'out', name: 'out', kind: 'output', value: false }];
  } else if (kind === 'OUTPUT') {
    inputs = [{ id: 'in', name: 'in', kind: 'input', value: false }];
    outputs = [];
  } else if (kind === 'CUSTOM' && opts.pins) {
    inputs = (opts.pins.inputs || []).map(p => ({ ...p, value: false }));
    outputs = (opts.pins.outputs || []).map(p => ({ ...p, value: false }));
  }
  return {
    id: uid('node'),
    kind,
    defId: opts.defId,
    position: { x: position.x, y: position.y },
    inputs, outputs,
    name: opts.name,
    state: kind === 'INPUT' ? false : undefined,
  };
}
