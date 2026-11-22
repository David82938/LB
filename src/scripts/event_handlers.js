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
  viewport.addEventListener('pointerdown', closeMobileSidebar);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMobileSidebar();
  });

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
