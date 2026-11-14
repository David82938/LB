"use strict";

/* ============================================================ ICONS */
const ICONS = {
  boxes: `{{icons/boxes.svg}}`,
  cpu: `{{icons/cpu.svg}}`,
  grip: `{{icons/grip.svg}}`,
  pencil: `{{icons/pencil.svg}}`,
  trash: `{{icons/trash.svg}}`,
  check: `{{icons/check.svg}}`,
  x: `{{icons/x.svg}}`,
  hammer: `{{icons/hammer.svg}}`,
  cursor: `{{icons/cursor.svg}}`,
  zoomIn: `{{icons/zoomIn.svg}}`,
  zoomOut: `{{icons/zoomOut.svg}}`,
  maximize: `{{icons/maximize.svg}}`,
  settings: `{{icons/settings.svg}}`,
  rotate: `{{icons/rotate.svg}}`,
  checkSm: `{{icons/checkSm.svg}}`,
  xSm: `{{icons/xSm.svg}}`,
  trashSm: `{{icons/trashSm.svg}}`,
};

/* ============================================================ CONSTANTS */
const WORLD_WIDTH = 6000;
const WORLD_HEIGHT = 4500;
const NODE_WIDTH = 140;
const NODE_WIDTH_CUSTOM = 180;
const NODE_WIDTH_TERMINAL = 110;
const HEADER_HEIGHT = 34;
const TERMINAL_HEADER_HEIGHT = 26;
const PIN_HEIGHT = 28;
const PIN_RADIUS = 7;
const TERMINAL_PIN_Y = TERMINAL_HEADER_HEIGHT + 14;

const APP_CONFIG = {
  secretPassword: '4780',
  secretSettingsDelayMs: 5000,
  secretUnlockClicks: 5,
};

function nodeWidth(node) {
  if (node.kind === 'CUSTOM') return NODE_WIDTH_CUSTOM;
  if (node.kind === 'INPUT' || node.kind === 'OUTPUT') return NODE_WIDTH_TERMINAL;
  return NODE_WIDTH;
}
function nodeHeight(node) {
  if (node.kind === 'INPUT' || node.kind === 'OUTPUT') {
    return TERMINAL_HEADER_HEIGHT + 28 + 22;
  }
  const pins = Math.max(node.inputs.length, node.outputs.length, 1);
  return HEADER_HEIGHT + pins * PIN_HEIGHT + 8;
}
function inputPinPos(node, pinIndex) {
  if (node.kind === 'OUTPUT') {
    return { x: node.position.x, y: node.position.y + TERMINAL_PIN_Y };
  }
  return { x: node.position.x, y: node.position.y + HEADER_HEIGHT + pinIndex * PIN_HEIGHT + PIN_HEIGHT / 2 };
}
function outputPinPos(node, pinIndex) {
  if (node.kind === 'INPUT') {
    return { x: node.position.x + nodeWidth(node), y: node.position.y + TERMINAL_PIN_Y };
  }
  return { x: node.position.x + nodeWidth(node), y: node.position.y + HEADER_HEIGHT + pinIndex * PIN_HEIGHT + PIN_HEIGHT / 2 };
}
function wirePath(from, to, fromNodeId, toNodeId) {
  const dx = Math.abs(to.x - from.x);
  const offset = Math.max(40, dx * 0.4);
  const c1x = from.x + offset;
  const c2x = to.x - offset;
  return `M ${from.x},${from.y} C ${c1x},${from.y} ${c2x},${to.y} ${to.x},${to.y}`;
}

/* ============================================================ STATE */
let _idCounter = 1;
function uid(prefix) { _idCounter += 1; return `${prefix}_${Date.now().toString(36)}_${_idCounter}`; }

const wireInternals = new Map();

const state = {
  nodes: [],
  connections: [],
  customBlocks: [],
  pendingFrom: null,
  editingBlockId: null,
  stashedNodes: [],
  stashedConnections: [],
  selectionMode: false,
  selectionRect: null,
  zoom: 1,
  wireDelay: 0,
  wireTransit: {},
  settingsSecretReady: false,
  settingsSecretClickCount: 0,
  secretWireUnlocked: false,
};

const subscribers = new Set();
function subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); }
function notify() { subscribers.forEach(fn => fn()); }

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

/* ============================================================ WIRE DELAY */
function tickWires() {
  if (state.wireDelay <= 0) {
    wireInternals.clear();
    if (Object.keys(state.wireTransit).length > 0) {
      state.wireTransit = {};
      notify();
    }
    return;
  }
  const syncEval = evaluateGraph(state.nodes, state.connections, undefined, state.customBlocks, state.wireTransit);
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const newTransit = {};
  let anyChanged = false;
  for (const c of state.connections) {
    const src = (syncEval.nodeOutputs[c.fromNode] && syncEval.nodeOutputs[c.fromNode][c.fromPin]) || false;
    let internal = wireInternals.get(c.id);
    if (!internal) {
      internal = { sourceValue: src, lastChangeTime: now };
      wireInternals.set(c.id, internal);
    } else if (src !== internal.sourceValue) {
      internal.sourceValue = src;
      internal.lastChangeTime = now;
    }
    const prevTransit = state.wireTransit[c.id];
    const transitValue = prevTransit !== undefined ? prevTransit : false;
    if (now - internal.lastChangeTime >= state.wireDelay && transitValue !== internal.sourceValue) {
      newTransit[c.id] = internal.sourceValue;
      anyChanged = true;
    } else {
      newTransit[c.id] = transitValue;
    }
  }
  const liveConnIds = new Set(state.connections.map(c => c.id));
  for (const id of wireInternals.keys()) {
    if (!liveConnIds.has(id)) wireInternals.delete(id);
  }
  const wireSetChanged = Object.keys(state.wireTransit).length !== Object.keys(newTransit).length;
  if (anyChanged || wireSetChanged) {
    state.wireTransit = newTransit;
    notify();
  }
}

/* ============================================================ STORE ACTIONS */
function addNodeFromTemplate(kind, position, defId) {
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
  if (from.nodeId === to.nodeId) { state.pendingFrom = null; notify(); return false; }
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

function enterSelectionMode() {
  state.selectionMode = true;
  state.selectionRect = null;
  state.pendingFrom = null;
  document.body.style.cursor = 'crosshair';
  notify();
}

function cancelSelectionMode() {
  state.selectionMode = false;
  state.selectionRect = null;
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
  notify();
}

/* ============================================================ TOASTS */
const RED_TOAST_STYLE = 'toast-success';
function showToast(title, description, type) {
  const root = document.getElementById('toastRoot');
  const el = document.createElement('div');
  el.className = `toast ${type || RED_TOAST_STYLE}`;
  const iconSvg = type === 'toast-error'
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="toast-icon"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>'
    : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="toast-icon"><polyline points="20 6 9 17 4 12"/></svg>';
  el.innerHTML = `${iconSvg}<div class="toast-content"><div class="toast-title">${escapeHtml(title)}</div>${description ? `<div class="toast-description">${escapeHtml(description)}</div>` : ''}</div>`;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 200);
  }, 4000);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ============================================================ DIALOGS */
function closeAllDialogs() {
  document.getElementById('dialogRoot').innerHTML = '';
}

function showDialog({ title, body, maxWidth }) {
  const root = document.getElementById('dialogRoot');
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  const panel = document.createElement('div');
  panel.className = 'dialog-panel' + (maxWidth === 'small' ? ' small' : maxWidth === 'medium' ? ' medium' : '');
  panel.innerHTML = `
    <div class="dialog-header">
      <h2>${escapeHtml(title)}</h2>
      <button class="dialog-close">${ICONS.x}</button>
    </div>
    <div class="dialog-body"></div>
  `;
  overlay.appendChild(panel);
  root.appendChild(overlay);
  const bodyEl = panel.querySelector('.dialog-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body instanceof HTMLElement) bodyEl.appendChild(body);
  const closeBtn = panel.querySelector('.dialog-close');
  const close = () => { overlay.remove(); };
  closeBtn.onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  const escHandler = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);
  return { close, bodyEl, panel };
}

function showConfirmDialog({ title, message, confirmLabel, cancelLabel, destructive, onConfirm, onCancel }) {
  const body = document.createElement('div');
  body.innerHTML = `<p>${escapeHtml(message)}</p><div class="dialog-actions"></div>`;
  const actions = body.querySelector('.dialog-actions');
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-sm';
  cancelBtn.textContent = cancelLabel || 'Cancel';
  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn-sm ' + (destructive ? 'btn-destructive' : 'btn-primary');
  confirmBtn.textContent = confirmLabel || 'Confirm';
  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);
  const dlg = showDialog({ title, body, maxWidth: 'small' });
  cancelBtn.onclick = () => { dlg.close(); if (onCancel) onCancel(); };
  confirmBtn.onclick = () => { dlg.close(); if (onConfirm) onConfirm(); };
  return dlg;
}

function showBuildDialog({ defaultName, defaultDescription, inputCount, outputCount, onBuild, onCancel }) {
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="build-info">This block will expose <span class="hl">${inputCount} input pin(s)</span> and <span class="hl">${outputCount} output pin(s)</span> from the toggles and lamps on the canvas.</div>
    <div class="form-group">
      <label class="form-label">Name</label>
      <input class="form-input" id="buildNameInput" value="${escapeHtml(defaultName)}" placeholder="${escapeHtml(defaultName)}">
    </div>
    <div class="form-group">
      <label class="form-label">Description</label>
      <input class="form-input mono" id="buildDescInput" value="${escapeHtml(defaultDescription)}" placeholder="${escapeHtml(defaultDescription)}">
      <div class="form-hint">Leave empty to fall back to default description.</div>
    </div>
    <div class="dialog-actions">
      <button class="btn btn-sm" id="buildCancelBtn">Cancel</button>
      <button class="btn btn-sm" id="buildSelectBtn">${ICONS.cursor} Select</button>
      <button class="btn btn-primary" id="buildConfirmBtn">${ICONS.hammer} Build</button>
    </div>
  `;
  const dlg = showDialog({ title: 'Build a new block', body, maxWidth: 'medium' });
  const nameInput = body.querySelector('#buildNameInput');
  const descInput = body.querySelector('#buildDescInput');
  const cancelBtn = body.querySelector('#buildCancelBtn');
  const selectBtn = body.querySelector('#buildSelectBtn');
  const confirmBtn = body.querySelector('#buildConfirmBtn');
  setTimeout(() => nameInput.focus(), 0);
  nameInput.select();
  const doBuild = () => {
    const name = nameInput.value.trim() || defaultName;
    const desc = descInput.value;
    dlg.close();
    onBuild(name, desc);
  };
  cancelBtn.onclick = () => { dlg.close(); if (onCancel) onCancel(); };
  selectBtn.onclick = () => {
    dlg.close();
    enterSelectionMode();
  };
  confirmBtn.onclick = doBuild;
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doBuild(); });
  descInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doBuild(); });
  return dlg;
}

function resetSecretSidebarTrigger() {
  state.settingsSecretReady = false;
  state.settingsSecretClickCount = 0;
  const sidebarHeader = document.getElementById('sidebarHeaderIcon');
  if (sidebarHeader) {
    sidebarHeader.classList.remove('secret-ready');
    sidebarHeader.style.cursor = '';
    sidebarHeader.title = 'Blocks';
    sidebarHeader.onclick = null;
  }
}

function revealSecretSidebar() {
  const sidebarHeader = document.getElementById('sidebarHeaderIcon');
  if (!sidebarHeader) return;
  state.settingsSecretReady = true;
  sidebarHeader.classList.add('secret-ready');
  sidebarHeader.style.cursor = 'pointer';
  sidebarHeader.title = 'Secret block vault';
  sidebarHeader.onclick = () => {
    if (!state.settingsSecretReady) return;
    state.settingsSecretClickCount += 1;
    const remaining = APP_CONFIG.secretUnlockClicks - state.settingsSecretClickCount;
    if (state.settingsSecretClickCount >= APP_CONFIG.secretUnlockClicks) {
      state.settingsSecretClickCount = 0;
      showSecretPasswordDialog();
      return;
    }
  };
}

function showSecretPasswordDialog() {
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-group">
      <label class="form-label">Password</label>
      <input class="form-input mono" id="secretPasswordInput" type="password" placeholder="Enter password" autocomplete="off">
      <div class="form-hint">This hidden vault unlocks the reverse-wire block.</div>
    </div>
    <div class="dialog-actions">
      <button class="btn btn-sm" id="secretCancelBtn">Cancel</button>
      <button class="btn btn-primary" id="secretUnlockBtn">Unlock</button>
    </div>
  `;
  const dlg = showDialog({ title: 'Secret vault', body, maxWidth: 'small' });
  const input = body.querySelector('#secretPasswordInput');
  const cancelBtn = body.querySelector('#secretCancelBtn');
  const unlockBtn = body.querySelector('#secretUnlockBtn');
  const submit = () => {
    const value = input.value.trim();
    if (value === APP_CONFIG.secretPassword) {
      state.secretWireUnlocked = true;
      dlg.close();
      renderSidebar();
      showToast('Unlocked', 'The reverse-wire block has been added to the sidebar.');
      return;
    }
    showToast('Incorrect password', 'The vault stays sealed.', 'toast-error');
    input.value = '';
    input.focus();
  };
  cancelBtn.onclick = () => dlg.close();
  unlockBtn.onclick = submit;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  setTimeout(() => input.focus(), 0);
}

function startSettingsSecretTimer() {
  const resetTimer = () => {
    clearTimeout(window.__lbSecretSettingsTimer);
    window.__lbSecretSettingsTimer = setTimeout(() => {
      revealSecretSidebar();
    }, APP_CONFIG.secretSettingsDelayMs);
  };
  const handlers = [
    ['pointerdown', resetTimer],
    ['keydown', resetTimer],
    ['mousemove', resetTimer],
    ['input', resetTimer],
  ];
  window.__lbSecretSettingsHandlers = handlers;
  handlers.forEach(([eventName, handler]) => document.body.addEventListener(eventName, handler));
  resetTimer();
}

function showSettings() {
  const body = document.createElement('div');
  const wireDelay = state.wireDelay;
  body.innerHTML = `
    <div class="settings-section">
      <div class="settings-label"><span>Wire delay</span><span class="settings-value" id="delayValue">${wireDelay}ms</span></div>
      <input type="range" id="delaySlider" min="0" max="1000" step="10" value="${wireDelay}">
      <div class="range-labels"><span>0ms (instant)</span><span> - </span><span>1000ms</span></div>
      <p class="settings-description">Artificial propagation delay added to every wire. At 0ms the circuit is instantaneous; raise the value to watch signals travel through the graph.</p>
    </div>
    <div class="settings-divider"></div>
    <div class="settings-section">
      <div class="settings-label"><span>Reset game</span></div>
      <p class="settings-description">Clears the canvas, removes all custom blocks, and resets settings to defaults. Cannot be undone.</p>
      <button class="btn btn-sm btn-destructive" id="resetBtn" style="border:1px solid oklch(0.577 0.245 27.325 / 40%); background:oklch(0.577 0.245 27.325 / 10%); color:var(--destructive);">${ICONS.rotate} Reset everything</button>
    </div>
  `;
  const dlg = showDialog({ title: 'Settings', body });
  startSettingsSecretTimer();
  const slider = body.querySelector('#delaySlider');
  const delayValue = body.querySelector('#delayValue');
  slider.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    setWireDelay(v);
    delayValue.textContent = `${v}ms`;
  });
  body.querySelector('#resetBtn').onclick = () => {
    dlg.close();
    showConfirmDialog({
      title: 'Reset everything?',
      message: 'This clears the canvas, removes all custom blocks, and resets settings to defaults.\n\nThis cannot be undone.',
      confirmLabel: 'Reset',
      destructive: true,
      onConfirm: () => {
        resetGame();
        resetSecretSidebarTrigger();
        showToast('Game reset', 'Canvas, custom blocks, and settings cleared.');
      },
    });
  };
  const originalClose = dlg.close;
  dlg.close = () => {
    clearTimeout(window.__lbSecretSettingsTimer);
    if (window.__lbSecretSettingsHandlers) {
      window.__lbSecretSettingsHandlers.forEach(([eventName, handler]) => {
        document.body.removeEventListener(eventName, handler);
      });
      delete window.__lbSecretSettingsHandlers;
    }
    resetSecretSidebarTrigger();
    originalClose();
  };
}

/* ============================================================ RENDERING */
function el(tag, className, attrs, children) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (attrs) for (const k in attrs) {
    if (k === 'style' && typeof attrs[k] === 'object') Object.assign(e.style, attrs[k]);
    else if (k.startsWith('on') && typeof attrs[k] === 'function') e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
    else if (k === 'html') e.innerHTML = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  if (children) {
    if (typeof children === 'string') e.textContent = children;
    else if (Array.isArray(children)) children.forEach(c => { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    else e.appendChild(children);
  }
  return e;
}

function renderHeader() {
  const headerRight = document.getElementById('headerRight');
  const isEditing = state.editingBlockId !== null;
  const editingBlock = state.customBlocks.find(b => b.id === state.editingBlockId);
  headerRight.innerHTML = '';
  if (isEditing) {
    const indicator = el('div', 'editing-indicator');
    indicator.innerHTML = '<span class="editing-dot"></span> editing ' + escapeHtml(editingBlock ? editingBlock.name : 'block') + ' · drag & rewire, then hit Done';
    headerRight.appendChild(indicator);
  } else {
    const legend = el('div', 'legend');
    legend.innerHTML = '<span class="legend-item"><span class="legend-swatch legend-powered"></span>powered</span><span class="legend-item"><span class="legend-swatch legend-idle"></span>idle</span>';
    headerRight.appendChild(legend);
  }
  const settingsBtn = el('button', 'icon-btn', { title: 'Settings', 'aria-label': 'Settings', onclick: showSettings });
  settingsBtn.innerHTML = ICONS.settings;
  headerRight.appendChild(settingsBtn);

  const sidebarHeader = document.getElementById('sidebarHeaderIcon');
  sidebarHeader.innerHTML = ICONS.boxes + '<h2>Blocks</h2>';
  sidebarHeader.classList.remove('secret-ready');
  sidebarHeader.style.cursor = '';
  sidebarHeader.title = 'Blocks';
  sidebarHeader.onclick = null;
}

function renderSidebar() {
  const list = document.getElementById('sidebarList');
  list.innerHTML = '';
  const builtins = [
    { kind: 'AND', label: 'AND', description: 'a · b → c', inCount: 2, outCount: 1 },
    { kind: 'NOT', label: 'NOT', description: '¬a → b', inCount: 1, outCount: 1 },
  ];
  if (state.secretWireUnlocked) {
    builtins.push({ kind: 'WIRE_REVERSE', label: 'R-Wire', description: 'right → left', inCount: 1, outCount: 1 });
  }
  builtins.forEach(item => {
    list.appendChild(renderSidebarItem({
      label: item.label,
      description: item.description,
      inCount: item.inCount,
      outCount: item.outCount,
      onAdd: () => addNodeFromTemplate(item.kind, { x: WORLD_WIDTH / 2 - 70, y: WORLD_HEIGHT / 2 - 30 }),
      onDragStart: (e) => { e.dataTransfer.setData('application/json', JSON.stringify({ kind: item.kind })); e.dataTransfer.effectAllowed = 'copy'; },
    }));
  });
  state.customBlocks.forEach(b => {
    const isEditingThis = state.editingBlockId === b.id;
    const autoDesc = `${b.inputPins.length} in · ${b.outputPins.length} out`;
    list.appendChild(renderSidebarItem({
      label: b.name,
      description: b.description || autoDesc,
      inCount: b.inputPins.length,
      outCount: b.outputPins.length,
      icon: ICONS.cpu,
      isCustom: true,
      isBeingEdited: isEditingThis,
      onAdd: () => addNodeFromTemplate('CUSTOM', { x: WORLD_WIDTH / 2 - 70, y: WORLD_HEIGHT / 2 - 30 }, b.id),
      onDragStart: (e) => {
        if (isEditingThis) { e.preventDefault(); return; }
        e.dataTransfer.setData('application/json', JSON.stringify({ kind: 'CUSTOM', defId: b.id }));
        e.dataTransfer.effectAllowed = 'copy';
      },
      onRename: (newName) => { if (newName.trim()) renameCustomBlock(b.id, newName.trim()); },
      onEdit: () => editCustomBlock(b.id),
      onDelete: () => deleteCustomBlock(b.id),
      onDescriptionChange: (desc) => setCustomBlockDescription(b.id, desc),
    }));
  });
}

function renderSidebarItem(opts) {
  const item = el('div', 'sidebar-item' + (opts.isBeingEdited ? ' being-edited' : ''));
  item.draggable = !state.selectionMode;
  item.addEventListener('dragstart', (e) => {
    if (state.selectionMode) { e.preventDefault(); return; }
    opts.onDragStart(e);
  });

  const grip = el('div', 'grip');
  grip.innerHTML = ICONS.grip;
  item.appendChild(grip);

  if (opts.icon) {
    const icon = el('div', 'block-icon');
    icon.innerHTML = opts.icon;
    item.appendChild(icon);
  }

  const labelBtn = el('button', 'sidebar-item-label');
  labelBtn.onclick = () => {
    if (state.selectionMode) return;
    opts.onAdd();
  };
  const nameDiv = el('div', 'name');
  nameDiv.textContent = opts.label;
  if (opts.isBeingEdited) {
    const badge = el('span', 'editing-badge');
    badge.textContent = 'editing';
    nameDiv.appendChild(badge);
  }
  labelBtn.appendChild(nameDiv);
  const descDiv = el('div', 'desc' + (opts.isCustom ? ' editable' : ''));
  descDiv.textContent = opts.description;
  if (opts.isCustom) {
    descDiv.title = 'Double-click to edit description';
    descDiv.addEventListener('click', (e) => e.stopPropagation());
    descDiv.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startDescEdit(item, opts, descDiv);
    });
  }
  labelBtn.appendChild(descDiv);
  item.appendChild(labelBtn);

  const badges = el('div', 'pin-badges');
  badges.innerHTML = `<span class="pin-badge pin-badge-in">${opts.inCount} in</span><span class="pin-badge pin-badge-out">${opts.outCount} out</span>`;
  item.appendChild(badges);

  if (opts.isCustom) {
    const actions = el('div', 'sidebar-actions');
    const renameBtn = el('button', 'action-btn rename', { title: 'Rename' });
    renameBtn.innerHTML = ICONS.pencil;
    renameBtn.onclick = (e) => { e.stopPropagation(); startNameEdit(item, opts); };
    const editBtn = el('button', 'action-btn edit', { title: 'Edit block logic' });
    editBtn.innerHTML = ICONS.checkSm;
    editBtn.onclick = (e) => { e.stopPropagation(); opts.onEdit(); };
    const delBtn = el('button', 'action-btn delete', { title: 'Delete block' });
    delBtn.innerHTML = ICONS.trashSm;
    delBtn.onclick = (e) => {
      e.stopPropagation();
      showConfirmDialog({
        title: `Delete "${opts.label}"?`,
        message: `Any instances of "${opts.label}" on the canvas are also removed. This cannot be undone.`,
        confirmLabel: 'Delete',
        destructive: true,
        onConfirm: () => opts.onDelete(),
      });
    };
    actions.appendChild(renameBtn);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    item.appendChild(actions);
  }

  return item;
}

function startNameEdit(item, opts) {
  const labelBtn = item.querySelector('.sidebar-item-label');
  const oldHTML = labelBtn.innerHTML;
  item.classList.add('editing');
  labelBtn.innerHTML = '';
  const input = el('input', 'sidebar-input name-input', { value: opts.label, placeholder: opts.label });
  input.addEventListener('click', (e) => e.stopPropagation());
  input.focus();
  input.select();
  labelBtn.appendChild(input);
  const commit = () => {
    const v = input.value.trim();
    item.classList.remove('editing');
    renderSidebar();
    opts.onRename(v || opts.label);
  };
  const cancel = () => { item.classList.remove('editing'); renderSidebar(); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') cancel(); });
  input.addEventListener('blur', commit);
}

function startDescEdit(item, opts, descDiv) {
  const labelBtn = item.querySelector('.sidebar-item-label');
  item.classList.add('editing');
  descDiv.innerHTML = '';
  const input = el('input', 'sidebar-input mono', { value: opts.description, placeholder: 'Enter description...' });
  descDiv.appendChild(input);
  input.focus();
  input.select();
  const commit = () => {
    item.classList.remove('editing');
    if (opts.onDescriptionChange) opts.onDescriptionChange(input.value);
  };
  const cancel = () => { item.classList.remove('editing'); renderSidebar(); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') cancel(); });
  input.addEventListener('blur', commit);
}

function renderBottomBar() {
  const stats = document.getElementById('bottomStats');
  const actions = document.getElementById('bottomActions');
  const isEditing = state.editingBlockId !== null;
  const isSelecting = state.selectionMode;
  const editingBlock = state.customBlocks.find(b => b.id === state.editingBlockId);

  stats.innerHTML = '';
  const blocksStat = el('span', 'stat');
  blocksStat.innerHTML = `<span class="num">${state.nodes.length}</span> blocks`;
  stats.appendChild(blocksStat);
  stats.appendChild(el('div', 'divider'));
  const wiresStat = el('span', 'stat');
  wiresStat.innerHTML = `<span class="num">${state.connections.length}</span> wires`;
  stats.appendChild(wiresStat);
  if (isEditing) {
    stats.appendChild(el('div', 'divider'));
    const editStat = el('span', 'stat editing-label');
    editStat.textContent = 'editing ' + (editingBlock ? editingBlock.name : 'block');
    stats.appendChild(editStat);
  } else if (isSelecting) {
    stats.appendChild(el('div', 'divider'));
    const selectionStat = el('span', 'stat editing-label');
    selectionStat.textContent = 'selecting block';
    stats.appendChild(selectionStat);
  }

  actions.innerHTML = '';
  if (isEditing) {
    const cancelBtn = el('button', 'btn', { title: 'Discard changes and exit edit mode' });
    cancelBtn.innerHTML = ICONS.xSm + ' Cancel';
    cancelBtn.onclick = () => cancelEdit();
    const doneBtn = el('button', 'btn btn-primary', { title: 'Save changes back to this block and return to the canvas' });
    doneBtn.innerHTML = ICONS.check + ' Done';
    doneBtn.onclick = () => {
      const toggles = state.nodes.filter(n => n.kind === 'INPUT');
      const lamps = state.nodes.filter(n => n.kind === 'OUTPUT');
      if (toggles.length === 0 && lamps.length === 0) {
        showToast('Cannot save', 'The block needs at least one toggle (input) or lamp (output).', 'toast-error');
        return;
      }
      saveEditedBlock();
    };
    actions.appendChild(cancelBtn);
    actions.appendChild(doneBtn);
  } else if (isSelecting) {
    const cancelBtn = el('button', 'btn', { title: 'Cancel selection mode' });
    cancelBtn.innerHTML = ICONS.xSm + ' Cancel';
    cancelBtn.onclick = () => cancelSelectionMode();
    const doneBtn = el('button', 'btn btn-primary', { title: 'Build a block from the selection' });
    doneBtn.innerHTML = ICONS.check + ' Done';
    doneBtn.onclick = () => {
      if (!state.selectionRect) {
        showToast('Nothing selected', 'Drag a rectangle to select the circuit you want to build.', 'toast-error');
        return;
      }
      const selectedIds = getNodesInSelectionRect(state.selectionRect);
      if (selectedIds.size === 0) {
        showToast('Nothing selected', 'Drag a rectangle to select the circuit you want to build.', 'toast-error');
        return;
      }
      const defaultName = nextBlockName(state.customBlocks);
      buildSelectedBlock(defaultName, 'Custom Block');
    };
    actions.appendChild(cancelBtn);
    actions.appendChild(doneBtn);
  } else {
    const clearBtn = el('button', 'btn', { title: 'Clear the canvas (custom blocks are kept in the sidebar)' });
    clearBtn.innerHTML = ICONS.trashSm + ' Clear';
    clearBtn.onclick = () => {
      if (state.nodes.length === 0 && state.connections.length === 0) return;
      showConfirmDialog({
        title: 'Clear canvas?',
        message: `This removes ${state.nodes.length} node(s) and ${state.connections.length} connection(s) from the canvas. Custom blocks already built are kept in the sidebar.`,
        confirmLabel: 'Clear',
        destructive: true,
        onConfirm: () => {
          state.nodes = [];
          state.connections = [];
          state.pendingFrom = null;
          wireInternals.clear();
          state.wireTransit = {};
          notify();
          showToast('Canvas cleared');
        },
      });
    };
    const buildBtn = el('button', 'btn btn-primary', { title: 'Turn the canvas into a reusable block (canvas is cleared after)' });
    buildBtn.innerHTML = ICONS.hammer + ' Build';
    buildBtn.onclick = () => {
      const toggles = state.nodes.filter(n => n.kind === 'INPUT');
      const lamps = state.nodes.filter(n => n.kind === 'OUTPUT');
      if (toggles.length === 0 && lamps.length === 0) {
        showToast('Nothing to build', 'Add at least one toggle (input) or lamp (output) to your circuit.', 'toast-error');
        return;
      }
      showBuildDialog({
        defaultName: nextBlockName(state.customBlocks),
        defaultDescription: 'Custom Block',
        inputCount: toggles.length,
        outputCount: lamps.length,
        onBuild: (name, description) => {
          const id = buildCustomBlock(name, description);
          if (id) {
            const def = state.customBlocks.find(b => b.id === id);
            showToast('Block created', `${def ? def.name : ''} · ${toggles.length} in, ${lamps.length} out`);
          }
        },
      });
    };
    actions.appendChild(clearBtn);
    actions.appendChild(buildBtn);
  }
}

/* ============================================================ CANVAS RENDERING */
let prevHadNodes = false;

function renderSelectionOverlay() {
  const viewport = document.getElementById('viewport');
  const world = document.getElementById('world');
  if (!viewport || !world) return;

  let overlay = document.getElementById('selectionOverlay');
  if (!overlay) {
    overlay = el('div', null, { id: 'selectionOverlay' });
    overlay.style.position = 'absolute';
    overlay.style.inset = '0';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '25';
    overlay.style.overflow = 'hidden';
    world.appendChild(overlay);
  }

  overlay.innerHTML = '';
  if (!state.selectionMode) {
    overlay.style.display = 'none';
    return;
  }

  overlay.style.display = 'block';
  overlay.style.background = 'rgba(0, 0, 0, 0.55)';

  if (!state.selectionRect) {
    return;
  }

  const rect = state.selectionRect;
  const overlayLeft = rect.x;
  const overlayTop = rect.y;
  const overlayWidth = rect.w;
  const overlayHeight = rect.h;

  overlay.style.background = 'transparent';

  const worldRight = Math.max(0, overlayLeft + overlayWidth);
  const worldBottom = Math.max(0, overlayTop + overlayHeight);

  const panels = [
    { left: 0, top: 0, width: '100%', height: `${Math.max(0, overlayTop)}px` },
    { left: 0, top: `${Math.max(0, overlayTop)}px`, width: `${Math.max(0, overlayLeft)}px`, height: `${Math.max(0, overlayHeight)}px` },
    { left: `${Math.max(0, worldRight)}px`, top: `${Math.max(0, overlayTop)}px`, width: `calc(100% - ${Math.max(0, worldRight)}px)`, height: `${Math.max(0, overlayHeight)}px` },
    { left: 0, top: `${Math.max(0, worldBottom)}px`, width: '100%', height: `calc(100% - ${Math.max(0, worldBottom)}px)` },
  ];

  panels.forEach(panel => {
    const dark = el('div');
    dark.style.position = 'absolute';
    dark.style.left = panel.left;
    dark.style.top = panel.top;
    dark.style.width = panel.width;
    dark.style.height = panel.height;
    dark.style.background = 'rgba(0, 0, 0, 0.55)';
    dark.style.pointerEvents = 'none';
    overlay.appendChild(dark);
  });

  const box = el('div');
  box.style.position = 'absolute';
  box.style.left = `${Math.max(0, overlayLeft)}px`;
  box.style.top = `${Math.max(0, overlayTop)}px`;
  box.style.width = `${Math.max(0, overlayWidth)}px`;
  box.style.height = `${Math.max(0, overlayHeight)}px`;
  box.style.border = '2px solid rgba(255,255,255,0.85)';
  box.style.boxShadow = '0 0 0 1px rgba(0,0,0,0.35) inset';
  box.style.background = 'rgba(255,255,255,0.04)';
  box.style.borderRadius = '4px';
  box.style.pointerEvents = 'none';
  box.style.boxSizing = 'border-box';
  overlay.appendChild(box);
}

function renderCanvas() {
  const viewport = document.getElementById('viewport');
  const hasNodes = state.nodes.length > 0;
  viewport.className = 'lb-canvas-bg ' + (hasNodes ? 'scrollable' : 'fixed');

  // Update world wrapper + world size/transform
  let wrapper = document.getElementById('worldWrapper');
  let world = document.getElementById('world');
  if (!wrapper) {
    viewport.innerHTML = '';
    wrapper = el('div', null, { id: 'worldWrapper' });
    wrapper.style.position = 'relative';
    world = el('div', null, { id: 'world' });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'wireSvg';
    svg.setAttribute('width', WORLD_WIDTH);
    svg.setAttribute('height', WORLD_HEIGHT);
    world.appendChild(svg);
    wrapper.appendChild(world);
    viewport.appendChild(wrapper);
  }
  wrapper.style.width = (WORLD_WIDTH * state.zoom) + 'px';
  wrapper.style.height = (WORLD_HEIGHT * state.zoom) + 'px';
  world.style.width = WORLD_WIDTH + 'px';
  world.style.height = WORLD_HEIGHT + 'px';
  world.style.transform = `scale(${state.zoom})`;
  world.style.transformOrigin = '0 0';
  world.style.position = 'absolute';
  world.style.top = '0';
  world.style.left = '0';

  // Remove existing nodes (but keep the SVG)
  const svg = document.getElementById('wireSvg');
  Array.from(world.children).forEach(c => { if (c !== svg) c.remove(); });

  // Render wires
  renderWires();

  // Render nodes
  const evalResult = getEvalResult();
  state.nodes.forEach(n => {
    const nodeEl = renderNode(n, evalResult);
    world.appendChild(nodeEl);
  });

  // Empty state
  const emptyState = document.getElementById('emptyState');
  const isEditing = state.editingBlockId !== null;
  if (!hasNodes) {
    emptyState.classList.remove('hidden');
    emptyState.innerHTML = `<div><div class="empty-title">${isEditing ? 'Empty block' : 'Empty canvas'}</div><div class="empty-body">${isEditing
      ? 'Drag gates from the sidebar to define this block\'s internal logic. Drag pins into empty space to create <span class="hl">toggles</span> (block inputs) and <span class="hl">lamps</span> (block outputs). Hit <span class="hl">Done</span> when finished.'
      : 'Drag an <span class="hl">AND</span> or <span class="hl">NOT</span> gate from the left sidebar to get started. Drag output pins into empty space to create lamps; drag input pins into empty space to create toggles. Hit <span class="hl">Build</span> to wrap the whole circuit into a reusable block.'
    }</div></div>`;
  } else {
    emptyState.classList.add('hidden');
  }

  // Pending status
  const pendingStatus = document.getElementById('pendingStatus');
  pendingStatus.textContent = state.pendingFrom ? 'click a target pin or release in empty space · click canvas to cancel' : '';

  // Zoom controls
  renderZoomControls();
  renderSelectionOverlay();

  // Scroll to middle on first node
  if (hasNodes && !prevHadNodes) {
    requestAnimationFrame(() => {
      const scaledW = WORLD_WIDTH * state.zoom;
      const scaledH = WORLD_HEIGHT * state.zoom;
      viewport.scrollTo(Math.max(0, (scaledW - viewport.clientWidth) / 2), Math.max(0, (scaledH - viewport.clientHeight) / 2));
    });
    prevHadNodes = true;
  }
  if (!hasNodes) prevHadNodes = false;
}

function renderWires() {
  const svg = document.getElementById('wireSvg');
  svg.innerHTML = '';
  const evalResult = getEvalResult();
  const wireTransit = state.wireTransit;
  const pendingFrom = state.pendingFrom;

  state.connections.forEach(c => {
    const from = pinGlobalPos(c.fromNode, c.fromPin, 'output');
    const to = pinGlobalPos(c.toNode, c.toPin, 'input');
    if (!from || !to) return;
    const transit = wireTransit[c.id];
    const sourceVal = (evalResult.nodeOutputs[c.fromNode] && evalResult.nodeOutputs[c.fromNode][c.fromPin]) || false;
    const powered = transit !== undefined ? transit : sourceVal;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hitPath.setAttribute('d', wirePath(from, to, c.fromNode, c.toNode));
    hitPath.setAttribute('stroke', 'transparent');
    hitPath.setAttribute('stroke-width', '14');
    hitPath.setAttribute('fill', 'none');
    hitPath.classList.add('hit');
    hitPath.onclick = () => removeConnection(c.id);
    const visPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    visPath.setAttribute('d', wirePath(from, to, c.fromNode, c.toNode));
    visPath.setAttribute('stroke', powered ? 'var(--lb-wire-hot)' : 'var(--lb-wire-cold)');
    visPath.setAttribute('stroke-width', '2.5');
    visPath.setAttribute('fill', 'none');
    if (powered) visPath.style.filter = 'drop-shadow(0 0 4px var(--lb-pin-active))';
    g.appendChild(hitPath);
    g.appendChild(visPath);
    svg.appendChild(g);
  });

  if (pendingFrom) {
    const start = pinGlobalPos(pendingFrom.nodeId, pendingFrom.pinId, pendingFrom.kind);
    if (start && pendingCursor) {
      const pendingIsPowered = pendingFrom.kind === 'output'
        ? ((evalResult.nodeOutputs[pendingFrom.nodeId] && evalResult.nodeOutputs[pendingFrom.nodeId][pendingFrom.pinId]) || false)
        : ((evalResult.nodeInputs[pendingFrom.nodeId] && evalResult.nodeInputs[pendingFrom.nodeId][pendingFrom.pinId]) || false);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', wirePath(start, pendingCursor, pendingFrom.nodeId, null));
      path.setAttribute('stroke', pendingIsPowered ? 'var(--lb-wire-hot)' : 'var(--lb-wire-cold)');
      path.setAttribute('stroke-width', '2.5');
      path.setAttribute('stroke-dasharray', '6 4');
      path.setAttribute('fill', 'none');
      if (pendingIsPowered) path.style.filter = 'drop-shadow(0 0 4px var(--lb-pin-active))';
      svg.appendChild(path);
    }
  }
}

function pinGlobalPos(nodeId, pinId, kind) {
  const node = state.nodes.find(n => n.id === nodeId);
  if (!node) return null;
  if (node.kind === 'WIRE_REVERSE') {
    if (kind === 'output') {
      return { x: node.position.x, y: node.position.y + nodeHeight(node) / 2 };
    }
    return { x: node.position.x + nodeWidth(node), y: node.position.y + nodeHeight(node) / 2 };
  }
  if (kind === 'output') {
    const idx = node.outputs.findIndex(p => p.id === pinId);
    if (idx < 0) return null;
    return outputPinPos(node, idx);
  } else {
    const idx = node.inputs.findIndex(p => p.id === pinId);
    if (idx < 0) return null;
    return inputPinPos(node, idx);
  }
}

function renderSecretWireNode(node, evalResult) {
  const powered = {
    inputs: evalResult.nodeInputs[node.id] || {},
    outputs: evalResult.nodeOutputs[node.id] || {},
  };
  const w = nodeWidth(node);
  const h = nodeHeight(node);
  const nodeEl = el('div', 'node');
  nodeEl.style.left = node.position.x + 'px';
  nodeEl.style.top = node.position.y + 'px';
  nodeEl.style.width = w + 'px';
  nodeEl.dataset.nodeId = node.id;

  const body = el('div', 'node-body');
  body.style.width = w + 'px';
  body.style.height = h + 'px';
  body.style.border = '1px solid rgba(255,255,255,0.22)';
  body.style.background = 'rgba(17, 24, 39, 0.85)';
  body.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.04) inset';
  body.addEventListener('mousedown', (e) => handleBodyMouseDown(e, node));

  const header = el('div', 'node-header');
  header.style.height = HEADER_HEIGHT + 'px';
  const label = el('span', 'label');
  label.textContent = 'R-Wire';
  header.appendChild(label);
  const delBtn = el('button', 'delete-btn', { 'aria-label': 'Delete node', title: 'Delete' });
  delBtn.innerHTML = ICONS.trash;
  delBtn.onclick = (e) => { e.stopPropagation(); removeNode(node.id); };
  delBtn.addEventListener('mousedown', (e) => e.stopPropagation());
  header.appendChild(delBtn);
  body.appendChild(header);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 140 42');
  svg.setAttribute('width', '140');
  svg.setAttribute('height', '42');
  svg.style.display = 'block';
  svg.style.margin = '0 auto';
  svg.style.padding = '6px 0 12px';

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.setAttribute('d', 'M 12 21 H 128');
  line.setAttribute('stroke', powered.outputs.out ? 'var(--lb-wire-hot)' : 'var(--lb-wire-cold)');
  line.setAttribute('stroke-width', '2.5');
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke-linecap', 'round');
  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  arrow.setAttribute('d', 'M 18 12 L 8 21 L 18 30');
  arrow.setAttribute('stroke', powered.outputs.out ? 'var(--lb-wire-hot)' : 'var(--lb-wire-cold)');
  arrow.setAttribute('stroke-width', '2.5');
  arrow.setAttribute('fill', 'none');
  arrow.setAttribute('stroke-linecap', 'round');
  arrow.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(line);
  svg.appendChild(arrow);
  body.appendChild(svg);

  const outputDot = el('div', 'pin-dot' + (powered.outputs.out ? ' powered' : ''));
  outputDot.dataset.pin = '1';
  outputDot.dataset.nodeId = node.id;
  outputDot.dataset.pinId = node.outputs[0].id;
  outputDot.dataset.pinKind = 'output';
  outputDot.style.width = (PIN_RADIUS * 2) + 'px';
  outputDot.style.height = (PIN_RADIUS * 2) + 'px';
  outputDot.style.left = (-PIN_RADIUS) + 'px';
  outputDot.style.top = (h / 2 - PIN_RADIUS) + 'px';
  outputDot.style.backgroundColor = powered.outputs.out ? 'var(--lb-pin-active)' : 'var(--lb-pin)';
  outputDot.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); onPinMouseDown(e, node.id, node.outputs[0].id, 'output'); });
  outputDot.addEventListener('mouseup', (e) => { e.stopPropagation(); onPinMouseUp(e, node.id, node.outputs[0].id, 'output'); });

  const inputDot = el('div', 'pin-dot' + (powered.inputs.in ? ' powered' : ''));
  inputDot.dataset.pin = '1';
  inputDot.dataset.nodeId = node.id;
  inputDot.dataset.pinId = node.inputs[0].id;
  inputDot.dataset.pinKind = 'input';
  inputDot.style.width = (PIN_RADIUS * 2) + 'px';
  inputDot.style.height = (PIN_RADIUS * 2) + 'px';
  inputDot.style.right = (-PIN_RADIUS) + 'px';
  inputDot.style.top = (h / 2 - PIN_RADIUS) + 'px';
  inputDot.style.backgroundColor = powered.inputs.in ? 'var(--lb-pin-active)' : 'var(--lb-pin)';
  inputDot.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); onPinMouseDown(e, node.id, node.inputs[0].id, 'input'); });
  inputDot.addEventListener('mouseup', (e) => { e.stopPropagation(); onPinMouseUp(e, node.id, node.inputs[0].id, 'input'); });

  nodeEl.appendChild(body);
  nodeEl.appendChild(outputDot);
  nodeEl.appendChild(inputDot);
  return nodeEl;
}

function renderNode(node, evalResult) {
  if (node.kind === 'WIRE_REVERSE') {
    return renderSecretWireNode(node, evalResult);
  }

  const powered = {
    inputs: evalResult.nodeInputs[node.id] || {},
    outputs: evalResult.nodeOutputs[node.id] || {},
  };
  const w = nodeWidth(node);
  const h = nodeHeight(node);
  const isTerminal = node.kind === 'INPUT' || node.kind === 'OUTPUT';
  const headerH = isTerminal ? TERMINAL_HEADER_HEIGHT : HEADER_HEIGHT;

  let headerLabel = '';
  if (node.kind === 'AND') headerLabel = 'AND';
  else if (node.kind === 'NOT') headerLabel = 'NOT';
  else if (node.kind === 'INPUT') headerLabel = 'Toggle';
  else if (node.kind === 'OUTPUT') headerLabel = 'Lamp';
  else if (node.kind === 'CUSTOM') {
    const def = state.customBlocks.find(b => b.id === node.defId);
    headerLabel = def ? def.name : (node.name || 'Block');
  }

  const nodeEl = el('div', 'node' + (draggingOverSidebarNode === node.id ? ' dragging-over-sidebar' : ''));
  nodeEl.style.left = node.position.x + 'px';
  nodeEl.style.top = node.position.y + 'px';
  nodeEl.style.width = w + 'px';
  nodeEl.dataset.nodeId = node.id;
  if (draggingOverSidebarNode === node.id) nodeEl.style.zIndex = '1000';

  const body = el('div', 'node-body');
  body.style.width = w + 'px';
  body.addEventListener('mousedown', (e) => handleBodyMouseDown(e, node));

  const header = el('div', 'node-header' + (isTerminal ? ' terminal' : ''));
  header.style.height = headerH + 'px';
  const labelSpan = el('span', 'label');
  labelSpan.textContent = headerLabel;
  header.appendChild(labelSpan);
  const delBtn = el('button', 'delete-btn', { 'aria-label': 'Delete node', title: 'Delete' });
  delBtn.innerHTML = isTerminal ? ICONS.trashSm : ICONS.trash;
  delBtn.onclick = (e) => { e.stopPropagation(); removeNode(node.id); };
  delBtn.addEventListener('mousedown', (e) => e.stopPropagation());
  header.appendChild(delBtn);
  body.appendChild(header);

  if (node.kind === 'INPUT') {
    body.appendChild(renderToggleBody(node));
  } else if (node.kind === 'OUTPUT') {
    body.appendChild(renderLampBody(powered.inputs['in'] || false));
  }

  if (!isTerminal) {
    const pinRows = el('div', null);
    pinRows.style.position = 'relative';
    pinRows.style.height = (h - HEADER_HEIGHT - 8) + 'px';
    pinRows.appendChild(renderPinList(node.inputs, 'left', powered.inputs));
    pinRows.appendChild(renderPinList(node.outputs, 'right', powered.outputs));
    body.appendChild(pinRows);
  }

  if (isTerminal) {
    body.appendChild(renderTerminalRename(node, headerLabel));
  }

  nodeEl.appendChild(body);

  // Pin dots
  if (!isTerminal) {
    nodeEl.appendChild(renderPinDots(node.inputs, 'left', powered.inputs, node.id, HEADER_HEIGHT));
    nodeEl.appendChild(renderPinDots(node.outputs, 'right', powered.outputs, node.id, HEADER_HEIGHT));
  }
  if (node.kind === 'INPUT') {
    nodeEl.appendChild(renderPinDots(node.outputs, 'right', powered.outputs, node.id, TERMINAL_HEADER_HEIGHT, TERMINAL_PIN_Y));
  }
  if (node.kind === 'OUTPUT') {
    nodeEl.appendChild(renderPinDots(node.inputs, 'left', powered.inputs, node.id, TERMINAL_HEADER_HEIGHT, TERMINAL_PIN_Y));
  }

  return nodeEl;
}

function renderPinList(pins, side, poweredMap) {
  const list = el('div', 'pin-list ' + side);
  list.style.height = '100%';
  pins.forEach(p => {
    const isPowered = poweredMap[p.id] || false;
    const row = el('div', 'pin-row');
    row.style.height = PIN_HEIGHT + 'px';
    const name = el('span', 'pin-name' + (isPowered ? ' powered' : ''));
    name.textContent = p.name;
    row.appendChild(name);
    list.appendChild(row);
  });
  return list;
}

function renderPinDots(pins, side, poweredMap, nodeId, headerHeight, pinY) {
  const container = document.createDocumentFragment();
  pins.forEach((p, i) => {
    const isPowered = poweredMap[p.id] || false;
    const y = pinY !== undefined ? pinY : headerHeight + i * PIN_HEIGHT + PIN_HEIGHT / 2;
    const kind = side === 'left' ? 'input' : 'output';
    const dot = el('div', 'pin-dot' + (isPowered ? ' powered' : ''));
    dot.dataset.pin = '1';
    dot.dataset.nodeId = nodeId;
    dot.dataset.pinId = p.id;
    dot.dataset.pinKind = kind;
    dot.style.width = (PIN_RADIUS * 2) + 'px';
    dot.style.height = (PIN_RADIUS * 2) + 'px';
    dot.style.top = (y - PIN_RADIUS) + 'px';
    if (side === 'left') { dot.style.left = (-PIN_RADIUS) + 'px'; }
    else { dot.style.right = (-PIN_RADIUS) + 'px'; }
    dot.style.backgroundColor = isPowered ? 'var(--lb-pin-active)' : 'var(--lb-pin)';
    dot.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      onPinMouseDown(e, nodeId, p.id, kind);
    });
    dot.addEventListener('mouseup', (e) => {
      e.stopPropagation();
      onPinMouseUp(e, nodeId, p.id, kind);
    });
    container.appendChild(dot);
  });
  return container;
}

function renderToggleBody(node) {
  const on = node.state || false;
  const wrapper = el('div', 'terminal-body');
  const btn = el('button', 'toggle-btn' + (on ? ' on' : ''));
  btn.textContent = on ? 'ON' : 'OFF';
  btn.onclick = (e) => { e.stopPropagation(); toggleInput(node.id); };
  btn.addEventListener('mousedown', (e) => e.stopPropagation());
  wrapper.appendChild(btn);
  return wrapper;
}

function renderLampBody(powered) {
  const wrapper = el('div', 'terminal-body');
  const body = el('div', 'lamp-body' + (powered ? ' powered' : ''));
  const indicator = el('div', 'lamp-indicator' + (powered ? ' powered' : ''));
  body.appendChild(indicator);
  wrapper.appendChild(body);
  return wrapper;
}

function renderTerminalRename(node, headerLabel) {
  const wrapper = el('div', 'terminal-rename');
  // We'll just show the name as a button - double-click to edit
  const btn = el('button', 'rename-display');
  btn.textContent = node.name || headerLabel;
  btn.title = 'Double-click to rename';
  btn.ondblclick = (e) => { e.stopPropagation(); startTerminalRename(wrapper, node, headerLabel); };
  btn.onclick = (e) => e.stopPropagation();
  btn.addEventListener('mousedown', (e) => e.stopPropagation());
  wrapper.appendChild(btn);
  return wrapper;
}

function startTerminalRename(wrapper, node, headerLabel) {
  wrapper.innerHTML = '';
  const row = el('div', 'rename-row');
  const input = el('input', 'rename-input', { value: node.name || '' });
  row.appendChild(input);
  const confirmBtn = el('button', 'confirm-btn');
  confirmBtn.innerHTML = ICONS.checkSm;
  const cancelBtn = el('button', 'cancel-btn');
  cancelBtn.innerHTML = ICONS.xSm;
  row.appendChild(confirmBtn);
  row.appendChild(cancelBtn);
  wrapper.appendChild(row);
  input.focus();
  input.select();
  const commit = () => { const v = input.value.trim(); renameNode(node.id, v || headerLabel); };
  const cancel = () => { renderCanvas(); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') cancel(); });
  confirmBtn.onclick = commit;
  cancelBtn.onclick = cancel;
  input.addEventListener('blur', commit);
}

function renderZoomControls() {
  const zc = document.getElementById('zoomControls');
  zc.innerHTML = '';
  const outBtn = el('button', 'zoom-btn', { title: 'Zoom out', 'aria-label': 'Zoom out' });
  outBtn.innerHTML = ICONS.zoomOut;
  outBtn.onclick = () => setZoom(state.zoom / 1.2);
  const labelBtn = el('button', 'zoom-label', { title: 'Reset zoom to 100% and center' });
  labelBtn.textContent = Math.round(state.zoom * 100) + '%';
  labelBtn.onclick = handleZoomReset;
  const inBtn = el('button', 'zoom-btn', { title: 'Zoom in', 'aria-label': 'Zoom in' });
  inBtn.innerHTML = ICONS.zoomIn;
  inBtn.onclick = () => setZoom(state.zoom * 1.2);
  const resetBtn = el('button', 'zoom-btn', { title: 'Reset view', 'aria-label': 'Reset view' });
  resetBtn.innerHTML = ICONS.maximize;
  resetBtn.onclick = handleZoomReset;
  zc.appendChild(outBtn);
  zc.appendChild(labelBtn);
  zc.appendChild(inBtn);
  zc.appendChild(resetBtn);
}

function handleZoomReset() {
  setZoom(1);
  const vp = document.getElementById('viewport');
  if (vp) {
    vp.scrollTo(
      Math.max(0, (WORLD_WIDTH - vp.clientWidth) / 2),
      Math.max(0, (WORLD_HEIGHT - vp.clientHeight) / 2)
    );
  }
}

/* ============================================================ EVENT HANDLERS */
let pendingCursor = null;
let draggingOverSidebarNode = null;

function screenToWorld(clientX, clientY) {
  const world = document.getElementById('world');
  if (!world) return { x: 0, y: 0 };
  const r = world.getBoundingClientRect();
  return { x: (clientX - r.left) / state.zoom, y: (clientY - r.top) / state.zoom };
}

function isOverSidebar(clientX, clientY) {
  const sb = document.getElementById('sidebar');
  if (!sb) return false;
  const r = sb.getBoundingClientRect();
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

function onPinMouseDown(e, nodeId, pinId, kind) {
  e.stopPropagation();
  startPending(nodeId, pinId, kind);
}

function onPinMouseUp(e, nodeId, pinId, kind) {
  e.stopPropagation();
  completePending(nodeId, pinId, kind);
}

let lastCursor = { x: 0, y: 0 };

function setupCanvasEvents() {
  const viewport = document.getElementById('viewport');

  // Drag-and-drop from sidebar
  viewport.addEventListener('dragover', (e) => {
    if (state.selectionMode) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; viewport.classList.add('drag-over');
  });
  viewport.addEventListener('dragleave', () => viewport.classList.remove('drag-over'));
  viewport.addEventListener('drop', (e) => {
    if (state.selectionMode) return;
    e.preventDefault();
    viewport.classList.remove('drag-over');
    const raw = e.dataTransfer.getData('application/json');
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      const w = screenToWorld(e.clientX, e.clientY);
      addNodeFromTemplate(data.kind, { x: w.x - 70, y: w.y - 30 }, data.defId);
    } catch (err) {}
  });

  // Click empty canvas to cancel pending
  viewport.addEventListener('mousedown', (e) => {
    if (state.selectionMode) {
      e.preventDefault();
      e.stopPropagation();
      if (e.button !== 0) return;
      const startWorld = screenToWorld(e.clientX, e.clientY);
      state.selectionRect = { x: startWorld.x, y: startWorld.y, w: 1, h: 1 };
      const dragHandler = (ev) => {
        const current = screenToWorld(ev.clientX, ev.clientY);
        const rect = normalizeRect(startWorld.x, startWorld.y, current.x, current.y);
        state.selectionRect = rect;
        notify();
      };
      const upHandler = () => {
        if (!state.selectionRect) {
          window.removeEventListener('mousemove', dragHandler);
          window.removeEventListener('mouseup', upHandler);
          return;
        }
        state.selectionRect = normalizeRect(
          state.selectionRect.x,
          state.selectionRect.y,
          state.selectionRect.x + state.selectionRect.w,
          state.selectionRect.y + state.selectionRect.h
        );
        window.removeEventListener('mousemove', dragHandler);
        window.removeEventListener('mouseup', upHandler);
        notify();
      };
      window.addEventListener('mousemove', dragHandler);
      window.addEventListener('mouseup', upHandler);
      return;
    }
    if (state.pendingFrom) clearPending();
  });

  // Ctrl+scroll to zoom
  viewport.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    setZoom(state.zoom * (1 + delta));
  }, { passive: false });
}

function handleBodyMouseDown(e, node) {
  if (state.selectionMode) return;
  // Don't start drag if clicking on a pin or interactive element
  if (e.target.closest('[data-pin]')) return;
  if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
  e.preventDefault();
  const start = { startX: e.clientX, startY: e.clientY, nodeX: node.position.x, nodeY: node.position.y };

  function onMove(ev) {
    const dx = (ev.clientX - start.startX) / state.zoom;
    const dy = (ev.clientY - start.startY) / state.zoom;
    const overSidebar = isOverSidebar(ev.clientX, ev.clientY);
    if (overSidebar !== (draggingOverSidebarNode === node.id)) {
      draggingOverSidebarNode = overSidebar ? node.id : null;
      renderCanvas();
    }
    if (!overSidebar) {
      moveNode(node.id, { x: start.nodeX + dx, y: start.nodeY + dy });
    }
  }
  function onUp(ev) {
    if (isOverSidebar(ev.clientX, ev.clientY)) {
      removeNode(node.id);
    }
    draggingOverSidebarNode = null;
    renderCanvas();
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function setupPendingWireTracking() {
  // This is set up once; it tracks mouse moves when pendingFrom is active
  window.addEventListener('mousemove', (e) => {
    if (state.selectionMode) return;
    if (!state.pendingFrom) {
      if (pendingCursor) { pendingCursor = null; renderWires(); }
      return;
    }
    const w = screenToWorld(e.clientX, e.clientY);
    lastCursor = w;
    pendingCursor = w;
    renderWires();
  });
  window.addEventListener('mouseup', () => {
    if (state.selectionMode) return;
    if (!state.pendingFrom) return;
    setTimeout(() => {
      if (!state.pendingFrom) return;
      const pos = {
        x: Math.max(8, Math.min(WORLD_WIDTH - 120 - 8, lastCursor.x - 55)),
        y: Math.max(8, Math.min(WORLD_HEIGHT - 80 - 8, lastCursor.y - 35)),
      };
      if (state.pendingFrom.kind === 'output') {
        createTerminalAt('OUTPUT', { x: pos.x, y: pos.y }, true);
      } else if (state.pendingFrom.kind === 'input') {
        createTerminalAt('INPUT', { x: pos.x, y: pos.y }, true);
      }
      pendingCursor = null;
    }, 0);
  });
}

/* ============================================================ MAIN RENDER */
function renderAll() {
  renderHeader();
  renderSidebar();
  renderBottomBar();
  renderCanvas();
}

/* ============================================================ WIRE DELAY RAF LOOP */
let rafId = null;
function startWireDelayLoop() {
  if (rafId !== null) cancelAnimationFrame(rafId);
  if (state.wireDelay <= 0) return;
  const loop = () => {
    tickWires();
    if (state.wireDelay > 0) {
      rafId = requestAnimationFrame(loop);
    } else {
      rafId = null;
    }
  };
  rafId = requestAnimationFrame(loop);
}

/* ============================================================ SAVE AND LOAD */
function saveStateToLocalStorage() {
  const data = {
    nodes: state.nodes,
    connections: state.connections,
    customBlocks: state.customBlocks,
  };
  localStorage.setItem('logicBuilderState', JSON.stringify(data));
}

function loadStateFromLocalStorage() {
  const raw = localStorage.getItem('logicBuilderState');
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (data.nodes && data.connections && data.customBlocks) {
      state.nodes = data.nodes;
      state.connections = data.connections;
      state.customBlocks = data.customBlocks;
      notify();
    }
  } catch (err) {}
}

/* ============================================================ EXPORT AND IMPORT */

/*TODO*/

/* ============================================================ INIT */
function init() {
  setupCanvasEvents();
  setupPendingWireTracking();
  loadStateFromLocalStorage();
  renderAll();
  subscribe(() => {
    saveStateToLocalStorage();
    renderAll();
    if (state.wireDelay > 0 && rafId === null) startWireDelayLoop();
    if (state.wireDelay <= 0 && rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
