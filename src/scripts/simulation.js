/* ============================================================ SIMULATION */
let wasmGateEngine = null;
let wasmGateEngineReady = false;
let simulationContinuationPending = false;
let simulationEvaluationPass = 0;

function scheduleSimulationContinuation() {
  if (simulationContinuationPending || typeof requestAnimationFrame !== 'function') return;
  simulationContinuationPending = true;
  requestAnimationFrame(() => {
    simulationContinuationPending = false;
    renderSimulationFrame();
  });
}

function unsignedLeb(value) {
  const bytes = [];
  do {
    let byte = value & 0x7f;
    value >>>= 7;
    if (value !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (value !== 0);
  return bytes;
}

function wasmSection(sectionId, payload) {
  return [sectionId, ...unsignedLeb(payload.length), ...payload];
}

function createGateWasmBytes() {
  // Wasm module: gate(op,a,b), with op 0..6 for AND, NOT, NAND, NOR, OR, XOR, XNOR.
  const nestedExpression = (op, expression) => [
    0x20, 0x00, 0x41, op & 0x7f, 0x46, 0x04, 0x7f,
    ...expression,
  ];
  const i32Const = value => [0x41, value & 0x7f];
  const localGet = index => [0x20, index];
  const andExpr = [...localGet(1), ...localGet(2), 0x71];
  const notExpr = [...localGet(1), 0x45];
  const nandExpr = [...andExpr, 0x45];
  const orExpr = [...localGet(1), ...localGet(2), 0x72];
  const norExpr = [...orExpr, 0x45];
  const xorExpr = [...localGet(1), ...localGet(2), 0x73];
  const xnorExpr = [...xorExpr, 0x45];

  let body = nestedExpression(0, andExpr);
  body.push(0x05);
  body.push(...nestedExpression(1, notExpr));
  body.push(0x05);
  body.push(...nestedExpression(2, nandExpr));
  body.push(0x05);
  body.push(...nestedExpression(3, norExpr));
  body.push(0x05);
  body.push(...nestedExpression(4, orExpr));
  body.push(0x05);
  body.push(...nestedExpression(5, xorExpr));
  body.push(0x05);
  body.push(...nestedExpression(6, xnorExpr));
  body.push(0x05, ...i32Const(0));
  for (let i = 0; i < 7; i++) body.push(0x0b);
  body.push(0x0b);

  const typePayload = [0x01, 0x60, 0x03, 0x7f, 0x7f, 0x7f, 0x01, 0x7f];
  const functionPayload = [0x01, 0x00];
  const exportName = [0x67, 0x61, 0x74, 0x65];
  const exportPayload = [0x01, ...unsignedLeb(exportName.length), ...exportName, 0x00, 0x00];
  const functionBody = [0x00, ...body];
  const codePayload = [0x01, ...unsignedLeb(functionBody.length), ...functionBody];

  return new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...wasmSection(0x01, typePayload),
    ...wasmSection(0x03, functionPayload),
    ...wasmSection(0x07, exportPayload),
    ...wasmSection(0x0a, codePayload),
  ]);
}

async function initWasmGateEngine() {
  if (typeof WebAssembly === 'undefined') return;
  try {
    const module = await WebAssembly.compile(createGateWasmBytes());
    const instance = await WebAssembly.instantiate(module);
    wasmGateEngine = instance.exports.gate;
    wasmGateEngineReady = true;
  } catch (error) {
    wasmGateEngine = null;
    wasmGateEngineReady = false;
  }
}

function graphHasFeedbackLoop(def) {
  const outgoing = new Map(def.nodes.map(node => [node.id, []]));
  for (const connection of def.connections) {
    const targets = outgoing.get(connection.fromNode);
    if (targets) targets.push(connection.toNode);
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = id => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of outgoing.get(id) || []) {
      if (visit(next)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return def.nodes.some(node => visit(node.id));
}

function blockHasStatefulLogic(def, allDefs, visited) {
  if (!def || visited.has(def.id)) return true;
  if (graphHasFeedbackLoop(def)) return true;
  const nextVisited = new Set(visited);
  nextVisited.add(def.id);
  return def.nodes.some(node => {
    if (node.kind !== 'CUSTOM') return false;
    const nestedDef = allDefs && allDefs.find(candidate => candidate.id === node.defId);
    return blockHasStatefulLogic(nestedDef, allDefs, nextVisited);
  });
}

function getStatelessCacheKey(kind, inputs, def, allDefs) {
  if (kind === 'CUSTOM' && blockHasStatefulLogic(def, allDefs, new Set())) return null;
  if (kind === 'CUSTOM' && def) {
    const signature = `${def.nodes.length}:${def.connections.length}:${def.nodes.map(n => n.kind).join(',')}`;
    return `CUSTOM:${def.id}:${signature}:${inputs.map(Boolean).join('')}`;
  }
  return `${kind}:${inputs.map(Boolean).join('')}`;
}

function getStatelessCacheResult(key) {
  return state.simulationCache.get(key);
}

function cacheStatelessResult(key, result) {
  if (state.simulationCache.size >= 4096) state.simulationCache.clear();
  state.simulationCache.set(key, result);
}

function evalGate(kind, inputs, def, allDefs, instanceId) {
  if (!kind) return [];
  const cacheKey = getStatelessCacheKey(kind, inputs, def, allDefs);
  const cached = cacheKey ? getStatelessCacheResult(cacheKey) : undefined;
  if (cached !== undefined) return cached;

  let result;
  const opCodes = { AND: 0, NOT: 1, NAND: 2, NOR: 3, OR: 4, XOR: 5, XNOR: 6 };
  if (wasmGateEngineReady && Object.prototype.hasOwnProperty.call(opCodes, kind)) {
    result = [Boolean(wasmGateEngine(opCodes[kind], inputs[0] ? 1 : 0, inputs[1] ? 1 : 0))];
  } else if (kind === 'AND') result = [Boolean(inputs[0] && inputs[1])];
  else if (kind === 'NOT') result = [Boolean(!inputs[0])];
  else if (kind === 'NAND') result = [Boolean(!(inputs[0] && inputs[1]))];
  else if (kind === 'NOR') result = [Boolean(!(inputs[0] || inputs[1]))];
  else if (kind === 'OR') result = [Boolean(inputs[0] || inputs[1])];
  else if (kind === 'XOR') result = [Boolean(inputs[0]) !== Boolean(inputs[1])];
  else if (kind === 'XNOR') result = [Boolean(inputs[0]) === Boolean(inputs[1])];
  else if (kind === 'WIRE_REVERSE') result = [Boolean(inputs[0])];
  else if (kind === 'INPUT' || kind === 'OUTPUT') result = [];
  else if (kind === 'CUSTOM' && def) {
    const toggles = def.nodes.filter(n => n.kind === 'INPUT');
    const lamps = def.nodes.filter(n => n.kind === 'OUTPUT');
    const overrides = new Map();
    toggles.forEach((t, i) => overrides.set(t.id, inputs[i] || false));
    const inner = evaluateGraph(
      def.nodes,
      def.connections,
      overrides,
      allDefs || [def],
      undefined,
      `custom:${instanceId}:${def.id}`
    );
    result = lamps.map(lamp =>
      Boolean(inner.nodeInputs[lamp.id] && inner.nodeInputs[lamp.id]['in'])
    );
  } else result = [];

  if (result !== null && cacheKey) cacheStatelessResult(cacheKey, result);
  return result || [];
}

function clearNodeSimulationState(nodeId) {
  state.graphOutputMemory.delete(nodeId);
  const customPrefix = `custom:${nodeId}:`;
  for (const key of state.graphOutputMemory.keys()) {
    if (key.startsWith(customPrefix) || key.includes(`:${nodeId}:`)) state.graphOutputMemory.delete(key);
  }
}

function evaluateGraph(nodes, connections, toggleOverrides, defs, wireTransit, memoryScope) {
  const nodeOutputs = {};
  const nodeInputs = {};
  const useMemory = wireTransit === undefined && (toggleOverrides === undefined || memoryScope !== undefined);
  const memoryKeyForNode = node => memoryScope ? `${memoryScope}/${node.id}` : node.id;
  for (const n of nodes) {
    nodeOutputs[n.id] = {};
    nodeInputs[n.id] = {};
    for (const p of n.inputs) nodeInputs[n.id][p.id] = false;
    const savedOutputs = useMemory ? state.graphOutputMemory.get(memoryKeyForNode(n)) : undefined;
    for (const p of n.outputs) {
      nodeOutputs[n.id][p.id] = savedOutputs && savedOutputs[p.id] !== undefined
        ? Boolean(savedOutputs[p.id])
        : false;
    }
  }
  for (const n of nodes) {
    if (n.kind === 'INPUT') {
      const v = (toggleOverrides && toggleOverrides.get(n.id)) !== undefined
        ? Boolean(toggleOverrides.get(n.id))
        : Boolean(n.state);
      for (const p of n.outputs) nodeOutputs[n.id][p.id] = v;
    }
  }

  if (wireTransit === undefined) {
    const nodesById = new Map(nodes.map(node => [node.id, node]));
    const outgoing = new Map(nodes.map(node => [node.id, []]));
    for (const connection of connections) {
      const list = outgoing.get(connection.fromNode);
      if (list) list.push(connection);
    }

    const queue = [];
    const queued = new Set();
    const enqueue = id => {
      const node = nodesById.get(id);
      if (node && node.kind !== 'INPUT' && node.kind !== 'OUTPUT' && !queued.has(id)) {
        queued.add(id);
        queue.push(id);
      }
    };
    const propagate = connection => {
      const value = nodeOutputs[connection.fromNode] && nodeOutputs[connection.fromNode][connection.fromPin];
      if (value === undefined) return;
      const inputs = nodeInputs[connection.toNode];
      if (!inputs || inputs[connection.toPin] === value) return;
      inputs[connection.toPin] = value;
      enqueue(connection.toNode);
    };

    connections.forEach(propagate);
    nodes.forEach(node => enqueue(node.id));
    let cursor = 0;
    let operations = 0;
    const baseOperationBudget = Math.max(64, Math.min(240, nodes.length * 8));
    const operationBudgetOffset = useMemory ? simulationEvaluationPass++ % 17 : 0;
    const maxOperations = baseOperationBudget + operationBudgetOffset;
    while (cursor < queue.length && operations < maxOperations) {
      const nodeId = queue[cursor++];
      queued.delete(nodeId);
      operations += 1;
      const node = nodesById.get(nodeId);
      if (!node) continue;

      const inVals = node.inputs.map(pin => Boolean(nodeInputs[node.id][pin.id]));
      const def = node.defId ? (defs && defs.find(item => item.id === node.defId)) : undefined;
      const instanceId = memoryScope ? `${memoryScope}/${node.id}` : node.id;
      const outVals = evalGate(node.kind, inVals, def, defs, instanceId);

      node.outputs.forEach((pin, index) => {
        const next = Boolean(outVals[index]);
        if (nodeOutputs[node.id][pin.id] !== next) {
          nodeOutputs[node.id][pin.id] = next;
          (outgoing.get(node.id) || []).forEach(propagate);
        }
      });
    }

    if (useMemory) {
      const liveIds = memoryScope
        ? null
        : new Set(nodes.map(node => node.id));
      for (const id of state.graphOutputMemory.keys()) {
        if (!memoryScope && !id.includes('/') && !liveIds.has(id)) state.graphOutputMemory.delete(id);
      }
      for (const node of nodes) state.graphOutputMemory.set(memoryKeyForNode(node), { ...nodeOutputs[node.id] });
      if (cursor < queue.length) scheduleSimulationContinuation();
    }
    return { nodeOutputs, nodeInputs };
  }

  const maxIterations = Math.max(20, Math.min(200, nodes.length * 4));
  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;
    for (const c of connections) {
      const src = nodeOutputs[c.fromNode] && nodeOutputs[c.fromNode][c.fromPin];
      if (src === undefined) continue;
      const dst = nodeInputs[c.toNode] && nodeInputs[c.toNode][c.toPin];
      if (dst === undefined) continue;
      const transit = wireTransit && wireTransit[c.id];
      const effective = transit !== undefined ? Boolean(transit) : Boolean(src);
      if (effective !== dst) {
        nodeInputs[c.toNode][c.toPin] = effective;
        changed = true;
      }
    }
    for (const n of nodes) {
      if (n.kind === 'INPUT' || n.kind === 'OUTPUT') continue;
      const inVals = n.inputs.map(p => Boolean(nodeInputs[n.id][p.id]));
      const def = n.defId ? (defs && defs.find(d => d.id === n.defId)) : undefined;
      const instanceId = memoryScope ? `${memoryScope}/${n.id}` : n.id;
      const outVals = evalGate(n.kind, inVals, def, defs, instanceId);
      n.outputs.forEach((p, i) => {
        const next = Boolean(outVals[i]);
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
  const wireTransit = state.wireDelay > 0 ? state.wireTransit : undefined;
  return evaluateGraph(state.nodes, state.connections, undefined, state.customBlocks, wireTransit);
}
