/* ============================================================ SIMULATION */
function evalGate(kind, inputs, def, allDefs) {
  if (kind === 'AND') return [inputs[0] && inputs[1]];
  if (kind === 'NOT') return [!inputs[0]];
  if (kind === 'WIRE_REVERSE') return [inputs[0] || false];
  if (kind === 'INPUT') return [];
  if (kind === 'OUTPUT') return [];
  if (kind === 'CUSTOM' && def) {
    const toggles = def.nodes.filter(n => n.kind === 'INPUT');
    const lamps = def.nodes.filter(n => n.kind === 'OUTPUT');
    const overrides = new Map();
    toggles.forEach((t, i) => overrides.set(t.id, inputs[i] || false));
    const inner = evaluateGraph(def.nodes, def.connections, overrides, allDefs || [def]);
    const outVals = [];
    for (const lamp of lamps) {
      const inp = inner.nodeInputs[lamp.id] && inner.nodeInputs[lamp.id]['in'] !== undefined ? inner.nodeInputs[lamp.id]['in'] : false;
      outVals.push(inp);
    }
    return outVals;
  }
  return [];
}

function evaluateGraph(nodes, connections, toggleOverrides, defs, wireTransit) {
  const nodeOutputs = {};
  const nodeInputs = {};
  for (const n of nodes) {
    nodeOutputs[n.id] = {};
    nodeInputs[n.id] = {};
    for (const p of n.inputs) nodeInputs[n.id][p.id] = false;
    for (const p of n.outputs) nodeOutputs[n.id][p.id] = false;
  }
  for (const n of nodes) {
    if (n.kind === 'INPUT') {
      const v = (toggleOverrides && toggleOverrides.get(n.id)) !== undefined ? toggleOverrides.get(n.id) : (n.state || false);
      for (const p of n.outputs) nodeOutputs[n.id][p.id] = v;
    }
  }
  const maxIterations = 200;
  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;
    for (const c of connections) {
      const src = nodeOutputs[c.fromNode] && nodeOutputs[c.fromNode][c.fromPin];
      if (src === undefined) continue;
      const dst = nodeInputs[c.toNode] && nodeInputs[c.toNode][c.toPin];
      if (dst === undefined) continue;
      const transit = wireTransit && wireTransit[c.id];
      const effective = transit !== undefined ? transit : src;
      if (effective !== dst) {
        nodeInputs[c.toNode][c.toPin] = effective;
        changed = true;
      }
    }
    for (const n of nodes) {
      if (n.kind === 'INPUT' || n.kind === 'OUTPUT') continue;
      const inVals = n.inputs.map(p => nodeInputs[n.id][p.id] || false);
      const def = n.defId ? (defs && defs.find(d => d.id === n.defId)) : undefined;
      const outVals = evalGate(n.kind, inVals, def, defs);
      n.outputs.forEach((p, i) => {
        const next = outVals[i] || false;
        if (nodeOutputs[n.id][p.id] !== next) {
          nodeOutputs[n.id][p.id] = next;
          changed = true;
        }
      });
    }
    if (!changed) break;
  }
  return { nodeOutputs, nodeInputs };
}

function getEvalResult() {
  return evaluateGraph(state.nodes, state.connections, undefined, state.customBlocks, state.wireTransit);
}
