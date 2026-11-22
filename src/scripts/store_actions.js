/* ============================================================ STORE ACTIONS */
function addNodeFromTemplate(kind, position, defId) {
  if (state.currentPuzzle && ['NOT', 'AND', 'NAND', 'NOR', 'OR', 'XOR', 'XNOR'].includes(kind)
    && getPuzzleBlockRemaining(kind) <= 0) {
    showToast('No gates left', `This puzzle has no ${kind} gates remaining.`, 'toast-error');
    return;
  }
  if (kind === 'CUSTOM' && defId && defId === state.editingBlockId) return;
  const s = state;
  const finalPos = s.nodes.length === 0
    ? { x: WORLD_WIDTH / 2 - 70, y: WORLD_HEIGHT / 2 - 30 }
    : { x: position.x, y: position.y };
  let node;
  if (kind === 'CUSTOM' && defId) {
    const def = s.customBlocks.find(d => d.id === defId);
    if (!def) return;
    node = createNode(kind, finalPos, {
      defId,
      pins: {
        inputs: def.inputPins.map(p => ({ ...p, kind: 'input' })),
        outputs: def.outputPins.map(p => ({ ...p, kind: 'output' })),
      },
    });
  } else {
    node = createNode(kind, finalPos);
  }
  s.nodes = [...s.nodes, node];
  s.pendingFrom = null;
  notify();
}

function moveNode(id, position) {
  state.nodes = state.nodes.map(n => n.id === id ? { ...n, position } : n);
  notify();
}

function removeNode(id) {
  state.nodes = state.nodes.filter(n => n.id !== id);
  state.connections = state.connections.filter(c => c.fromNode !== id && c.toNode !== id);
  clearNodeSimulationState(id);
  notify();
}

function renameNode(id, name) {
  state.nodes = state.nodes.map(n => n.id === id ? { ...n, name } : n);
  notify();
}

function toggleInput(id) {
  state.nodes = state.nodes.map(n => (n.kind === 'INPUT' && n.id === id) ? { ...n, state: !(n.state || false) } : n);
  notify();
}

function startPending(nodeId, pinId, kind) {
  state.pendingFrom = { nodeId, pinId, kind };
  notify();
}

function clearPending() {
  state.pendingFrom = null;
  notify();
}

function completePending(nodeId, pinId, kind) {
  const pending = state.pendingFrom;
  if (!pending) return false;
  let from, to;
  if (pending.kind === 'output' && kind === 'input') {
    from = { nodeId: pending.nodeId, pinId: pending.pinId };
    to = { nodeId, pinId };
  } else if (pending.kind === 'input' && kind === 'output') {
    from = { nodeId, pinId };
    to = { nodeId: pending.nodeId, pinId: pending.pinId };
  } else {
    state.pendingFrom = null;
    notify();
    return false;
  }
  const exists = state.connections.find(c => c.toNode === to.nodeId && c.toPin === to.pinId);
  if (exists) { state.pendingFrom = null; notify(); return false; }
  const conn = { id: uid('conn'), fromNode: from.nodeId, fromPin: from.pinId, toNode: to.nodeId, toPin: to.pinId };
  state.connections = [...state.connections, conn];
  state.pendingFrom = null;
  notify();
  return true;
}

function nextDefaultName(nodes, kind) {
  const prefix = kind === 'INPUT' ? 'IN_' : 'OUT_';
  let n = 1;
  const existing = new Set(nodes.filter(nd => nd.kind === kind).map(nd => nd.name));
  while (existing.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

function createTerminalAt(kind, position, connectFromPending) {
  const s = state;
  let name;
  if (connectFromPending && s.pendingFrom) {
    const pending = s.pendingFrom;
    const srcNode = s.nodes.find(n => n.id === pending.nodeId);
    if (srcNode) {
      const pinList = pending.kind === 'output' ? srcNode.outputs : srcNode.inputs;
      const pin = pinList.find(p => p.id === pending.pinId);
      if (pin && pin.name) name = pin.name;
    }
  }
  if (!name) name = nextDefaultName(s.nodes, kind);
  const node = createNode(kind, position, { name });
  s.nodes = [...s.nodes, node];
  if (connectFromPending && s.pendingFrom) {
    const pending = s.pendingFrom;
    let conn = null;
    if (pending.kind === 'output' && kind === 'OUTPUT') {
      conn = { id: uid('conn'), fromNode: pending.nodeId, fromPin: pending.pinId, toNode: node.id, toPin: 'in' };
    } else if (pending.kind === 'input' && kind === 'INPUT') {
      conn = { id: uid('conn'), fromNode: node.id, fromPin: 'out', toNode: pending.nodeId, toPin: pending.pinId };
    }
    if (conn) s.connections = [...s.connections, conn];
    s.pendingFrom = null;
  }
  notify();
  return node.id;
}

function removeConnection(id) {
  state.connections = state.connections.filter(c => c.id !== id);
  notify();
}

function nextBlockName(blocks) {
  const existing = new Set(blocks.map(b => b.name));
  let n = 1;
  while (existing.has(`Block ${n}`)) n++;
  return `Block ${n}`;
}

function normalizeRect(x1, y1, x2, y2) {
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const right = Math.max(x1, x2);
  const bottom = Math.max(y1, y2);
  return {
    x: left,
    y: top,
    w: Math.max(1, right - left),
    h: Math.max(1, bottom - top),
  };
}

function rectIntersectsNode(node, rect) {
  const left = node.position.x;
  const top = node.position.y;
  const right = left + nodeWidth(node);
  const bottom = top + nodeHeight(node);
  return rect.x < right && rect.x + rect.w > left && rect.y < bottom && rect.y + rect.h > top;
}

function getConnectedNodeIdsFromSeed(seedIds) {
  const selected = new Set(seedIds);
  const queue = [...seedIds];
  while (queue.length > 0) {
    const currentId = queue.shift();
    for (const conn of state.connections) {
      if (conn.fromNode === currentId && !selected.has(conn.toNode)) {
        selected.add(conn.toNode);
        queue.push(conn.toNode);
      }
      if (conn.toNode === currentId && !selected.has(conn.fromNode)) {
        selected.add(conn.fromNode);
        queue.push(conn.fromNode);
      }
    }
  }
  return selected;
}

function getNodesInSelectionRect(rect) {
  if (!rect) return new Set();
  const seed = state.nodes.filter(node => rectIntersectsNode(node, rect)).map(node => node.id);
  if (seed.length === 0) return new Set();
  return getConnectedNodeIdsFromSeed(seed);
}

function enterSelectionMode(name, description) {
  state.selectionMode = true;
  state.selectionRect = null;
  state.selectionBlockName = name || nextBlockName(state.customBlocks);
  state.selectionBlockDescription = description !== undefined ? description : 'Custom Block';
  state.pendingFrom = null;
  document.body.style.cursor = 'crosshair';
  notify();
}

function cancelSelectionMode() {
  state.selectionMode = false;
  state.selectionRect = null;
  state.selectionBlockName = null;
  state.selectionBlockDescription = null;
  document.body.style.cursor = '';
  notify();
}

function buildSelectedBlock(name, description) {
  if (!state.selectionRect) {
    showToast('Nothing selected', 'Drag a rectangle over at least one connected circuit.', 'toast-error');
    return;
  }
  const selectedIds = getNodesInSelectionRect(state.selectionRect);
  if (selectedIds.size === 0) {
    showToast('Nothing selected', 'Drag a rectangle over at least one connected circuit.', 'toast-error');
    return;
  }

  const nodes = state.nodes.filter(node => selectedIds.has(node.id));
  const connections = state.connections.filter(conn => selectedIds.has(conn.fromNode) && selectedIds.has(conn.toNode));
  const def = buildDefFromCanvas(nodes, connections, state.customBlocks, undefined, name, description);
  if (!def) {
    showToast('No usable circuit', 'The selected area must include at least one input or output node.', 'toast-error');
    return;
  }

  state.customBlocks = [...state.customBlocks, def];
  state.selectionMode = false;
  state.selectionRect = null;
  state.selectionBlockName = null;
  state.selectionBlockDescription = null;
  document.body.style.cursor = '';
  notify();
  const label = def.name || 'Block';
  showToast('Block created', `${label} · ${def.inputPins.length} in, ${def.outputPins.length} out`);
}

function buildDefFromCanvas(nodes, connections, existingBlocks, existingId, customName, customDescription) {
  const toggles = nodes.filter(n => n.kind === 'INPUT');
  const lamps = nodes.filter(n => n.kind === 'OUTPUT');
  if (toggles.length === 0 && lamps.length === 0) return null;
  const inputPins = toggles.map((t, i) => ({ id: `in_${i}`, name: t.name || `IN_${i + 1}` }));
  const outputPins = lamps.map((l, i) => ({ id: `out_${i}`, name: l.name || `OUT_${i + 1}` }));
  const idMap = new Map();
  const remappedNodes = [];
  for (const n of nodes) {
    const newId = uid('sub');
    idMap.set(n.id, newId);
    remappedNodes.push({
      ...n, id: newId, position: { ...n.position },
      inputs: n.inputs.map(p => ({ ...p })), outputs: n.outputs.map(p => ({ ...p })),
    });
  }
  const remappedConns = connections.map(c => ({
    id: uid('subc'), fromNode: idMap.get(c.fromNode), fromPin: c.fromPin, toNode: idMap.get(c.toNode), toPin: c.toPin,
  })).filter(c => c.fromNode && c.toNode);
  const id = existingId || uid('block');
  const existing = existingId ? existingBlocks.find(b => b.id === existingId) : undefined;
  const name = (customName && customName.trim()) || (existingId ? (existing ? existing.name : 'Block 1') : nextBlockName(existingBlocks));
  const description = customDescription !== undefined ? customDescription : (existingId ? (existing ? existing.description : undefined) : 'Custom Block');
  return { id, name, description, inputPins, outputPins, nodes: remappedNodes, connections: remappedConns, createdAt: Date.now() };
}

function buildCustomBlock(name, description) {
  const def = buildDefFromCanvas(state.nodes, state.connections, state.customBlocks, undefined, name, description);
  if (!def) return null;
  state.customBlocks = [...state.customBlocks, def];
  state.nodes = [];
  state.connections = [];
  state.pendingFrom = null;
  notify();
  return def.id;
}

function editCustomBlock(defId) {
  const def = state.customBlocks.find(b => b.id === defId);
  if (!def) return;
  state.stashedNodes = state.nodes;
  state.stashedConnections = state.connections;
  state.editingBlockId = defId;
  state.nodes = def.nodes.map(n => ({
    ...n, position: { ...n.position }, inputs: n.inputs.map(p => ({ ...p })), outputs: n.outputs.map(p => ({ ...p })),
  }));
  state.connections = def.connections.map(c => ({ ...c }));
  state.pendingFrom = null;
  wireInternals.clear();
  state.wireTransit = {};
  notify();
}

function saveEditedBlock() {
  const editingId = state.editingBlockId;
  if (!editingId) return null;
  const def = state.customBlocks.find(b => b.id === editingId);
  if (!def) return null;
  const newDef = buildDefFromCanvas(state.nodes, state.connections, state.customBlocks, editingId);
  if (!newDef) return null;
  const updated = { ...newDef, id: editingId, name: def.name, description: def.description, createdAt: def.createdAt };
  state.customBlocks = state.customBlocks.map(b => b.id === editingId ? updated : b);
  state.nodes = state.stashedNodes;
  state.connections = state.stashedConnections;
  state.stashedNodes = [];
  state.stashedConnections = [];
  state.editingBlockId = null;
  state.pendingFrom = null;
  wireInternals.clear();
  state.wireTransit = {};
  notify();
  return editingId;
}

function cancelEdit() {
  if (!state.editingBlockId) return;
  state.nodes = state.stashedNodes;
  state.connections = state.stashedConnections;
  state.stashedNodes = [];
  state.stashedConnections = [];
  state.editingBlockId = null;
  state.pendingFrom = null;
  wireInternals.clear();
  state.wireTransit = {};
  notify();
}

function deleteCustomBlock(defId) {
  if (state.editingBlockId === defId) {
    state.nodes = state.stashedNodes;
    state.connections = state.stashedConnections;
    state.stashedNodes = [];
    state.stashedConnections = [];
    state.editingBlockId = null;
    state.pendingFrom = null;
  }
  const doomedNodeIds = new Set(state.nodes.filter(n => n.defId === defId).map(n => n.id));
  state.customBlocks = state.customBlocks.filter(b => b.id !== defId);
  doomedNodeIds.forEach(clearNodeSimulationState);
  state.nodes = state.nodes.filter(n => n.defId !== defId);
  state.connections = state.connections.filter(c => !doomedNodeIds.has(c.fromNode) && !doomedNodeIds.has(c.toNode));
  notify();
}

function renameCustomBlock(defId, newName) {
  state.customBlocks = state.customBlocks.map(b => b.id === defId ? { ...b, name: newName } : b);
  notify();
}

function setCustomBlockDescription(defId, desc) {
  state.customBlocks = state.customBlocks.map(b => b.id === defId ? { ...b, description: desc } : b);
  notify();
}

function setZoom(z) {
  const viewport = document.getElementById('viewport');
  const previousZoom = state.zoom;
  const nextZoom = Math.max(0.25, Math.min(2.5, Math.round(z * 100) / 100));
  const centerX = viewport ? viewport.clientWidth / 2 : 0;
  const centerY = viewport ? viewport.clientHeight / 2 : 0;
  const centerWorldX = viewport ? (viewport.scrollLeft + centerX) / previousZoom : 0;
  const centerWorldY = viewport ? (viewport.scrollTop + centerY) / previousZoom : 0;
  state.zoom = nextZoom;
  notify();
  if (viewport) {
    viewport.scrollTo(centerWorldX * nextZoom - centerX, centerWorldY * nextZoom - centerY);
  }
}

function setWireDelay(ms) {
  wireInternals.clear();
  state.wireDelay = Math.max(0, Math.min(1000, Math.round(ms)));
  state.wireTransit = {};
  notify();
}

function resetGame() {
  wireInternals.clear();
  state.nodes = [];
  state.connections = [];
  state.customBlocks = [];
  state.pendingFrom = null;
  state.editingBlockId = null;
  state.stashedNodes = [];
  state.stashedConnections = [];
  state.zoom = 1;
  state.wireDelay = 0;
  state.wireTransit = {};
  state.settingsSecretReady = false;
  state.settingsSecretClickCount = 0;
  state.secretWireUnlocked = false;
  state.simulationCache.clear();
  state.graphOutputMemory.clear();
  notify();
}
