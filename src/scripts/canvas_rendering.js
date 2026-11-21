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
      : (state.currentPuzzle
        ? 'Drag the available gates from the left sidebar to build your circuit. Add toggles and lamps, then hit <span class="hl">Verify</span> to check it against the truth table.'
        : 'Drag an <span class="hl">AND</span> or <span class="hl">NOT</span> gate from the left sidebar to get started. Drag output pins into empty space to create lamps; drag input pins into empty space to create toggles. Hit <span class="hl">Build</span> to wrap the whole circuit into a reusable block.')
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
  if (['AND', 'NOT', 'NAND', 'NOR', 'OR', 'XOR', 'XNOR'].includes(node.kind)) headerLabel = node.kind;
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
