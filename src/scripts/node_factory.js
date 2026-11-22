/* ============================================================ NODE FACTORY */
function makeGate(kind) {
  if (kind === 'CLOCK') {
    return {
      inputs: [],
      outputs: [{ id: 'clk', name: 'clk', kind: 'output', value: false }],
    };
  }
  if (kind === 'SR_LATCH') {
    return {
      inputs: [
        { id: 's', name: 'S', kind: 'input', value: false },
        { id: 'r', name: 'R', kind: 'input', value: false },
      ],
      outputs: [
        { id: 'q', name: 'Q', kind: 'output', value: false },
        { id: 'qn', name: 'Q̄', kind: 'output', value: true },
      ],
    };
  }
  if (kind === 'D_LATCH' || kind === 'D_FLIP_FLOP') {
    return {
      inputs: [
        { id: 'd', name: 'D', kind: 'input', value: false },
        { id: 'clk', name: 'CLK', kind: 'input', value: false },
      ],
      outputs: [
        { id: 'q', name: 'Q', kind: 'output', value: false },
        { id: 'qn', name: 'Q̄', kind: 'output', value: true },
      ],
    };
  }
  if (kind === 'T_FLIP_FLOP') {
    return {
      inputs: [
        { id: 't', name: 'T', kind: 'input', value: false },
        { id: 'clk', name: 'CLK', kind: 'input', value: false },
      ],
      outputs: [
        { id: 'q', name: 'Q', kind: 'output', value: false },
        { id: 'qn', name: 'Q̄', kind: 'output', value: true },
      ],
    };
  }
  if (kind === 'JK_FLIP_FLOP') {
    return {
      inputs: [
        { id: 'j', name: 'J', kind: 'input', value: false },
        { id: 'k', name: 'K', kind: 'input', value: false },
        { id: 'clk', name: 'CLK', kind: 'input', value: false },
      ],
      outputs: [
        { id: 'q', name: 'Q', kind: 'output', value: false },
        { id: 'qn', name: 'Q̄', kind: 'output', value: true },
      ],
    };
  }
  if (kind === 'AND' || kind === 'NAND' || kind === 'OR' || kind === 'NOR' || kind === 'XOR' || kind === 'XNOR') {
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
