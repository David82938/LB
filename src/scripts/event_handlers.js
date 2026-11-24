/* ============================================================ EVENT HANDLERS */
let pendingCursor = null;
let draggingOverSidebarNode = null;
let rightSelectionInProgress = false;
let rightSelectionMoved = false;
let suppressEditorContextMenuUntil = 0;

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

function closeEditorContextMenu() {
  const menu = document.getElementById('editorContextMenu');
  if (menu) {
    menu.classList.add('hidden');
    menu.innerHTML = '';
  }
}

function showEditorContextMenu(x, y, items) {
  const menu = document.getElementById('editorContextMenu');
  if (!menu) return;
  menu.innerHTML = '';
  items.forEach(item => {
    if (item.divider) {
      menu.appendChild(document.createElement('div')).className = 'editor-context-menu-divider';
      return;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = `${item.icon ? `<span class="editor-context-menu-icon">${item.icon}</span>` : ''}<span>${escapeHtml(item.label)}</span>`;
    if (item.destructive) button.className = 'editor-context-destructive';
    button.onclick = () => {
      closeEditorContextMenu();
      item.action();
    };
    menu.appendChild(button);
  });
  menu.classList.remove('hidden');
  const left = Math.max(8, Math.min(window.innerWidth - 220, x));
  const top = Math.max(8, Math.min(window.innerHeight - 280, y));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function showNodeContextMenu(x, y) {
  showEditorContextMenu(x, y, [
    { label: 'Copy', icon: ICONS.copy, action: copySelectedNodes },
    { label: 'Delete', icon: ICONS.trash, action: deleteSelectedNodes },
  ]);
}

function pasteTemplateAt(kind, position, defId) {
  addNodeFromTemplate(kind, { x: position.x, y: position.y }, defId);
}

function showCanvasContextMenu(x, y) {
  const groups = [];
  if (state.editorClipboard) {
    groups.push([{
      label: 'Paste',
      icon: ICONS.clipboard,
      action: () => pasteClipboardAt(state.editorCursorWorld),
    }]);
  }
  groups.push([
    { label: 'Toggle', icon: ICONS.toggle, action: () => pasteTemplateAt('INPUT', state.editorCursorWorld) },
    { label: 'Lamp', icon: ICONS.lamp, action: () => pasteTemplateAt('OUTPUT', state.editorCursorWorld) },
  ]);

  const puzzleKinds = state.currentPuzzle ? Object.keys(state.currentPuzzle.blockInventory) : null;
  const project = getCurrentProject();
  const gateKinds = puzzleKinds || (project ? project.availableGates : ['AND', 'NOT']);
  const gateItems = [];
  gateKinds.forEach(kind => {
    gateItems.push({
      label: kind,
      action: () => pasteTemplateAt(kind, state.editorCursorWorld),
    });
  });
  if (!state.currentPuzzle && (state.secretWireUnlocked || state.nodes.some(node => node.kind === 'WIRE_REVERSE'))) {
    gateItems.push({
      label: 'R-Wire',
      action: () => pasteTemplateAt('WIRE_REVERSE', state.editorCursorWorld),
    });
  }
  if (gateItems.length) groups.push(gateItems);

  const customBlockItems = [];
  state.customBlocks.forEach(block => {
    customBlockItems.push({
      label: block.name,
      icon: ICONS.cpu,
      action: () => pasteTemplateAt('CUSTOM', state.editorCursorWorld, block.id),
    });
  });
  if (customBlockItems.length) groups.push(customBlockItems);

  const items = [];
  groups.forEach((group, index) => {
    if (index > 0) items.push({ divider: true });
    items.push(...group);
  });
  showEditorContextMenu(x, y, items);
}

function setupCanvasEvents() {
  const viewport = document.getElementById('viewport');
  viewport.addEventListener('pointerdown', closeMobileSidebar);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMobileSidebar();
      closeEditorContextMenu();
      state.selectedNodeIds = new Set();
      state.editorSelectionRect = null;
      notify();
    }
    const target = e.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      copySelectedNodes();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      pasteClipboardAt(state.editorCursorWorld);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteSelectedNodes();
    }
  });
  document.addEventListener('mousemove', (e) => {
    if (document.getElementById('world')) {
      state.editorCursorWorld = screenToWorld(e.clientX, e.clientY);
    }
  });
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#editorContextMenu')) closeEditorContextMenu();
  });
  viewport.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (rightSelectionInProgress || Date.now() < suppressEditorContextMenuUntil) {
      closeEditorContextMenu();
      return;
    }
    const nodeElement = e.target.closest('.node');
    if (nodeElement) {
      const nodeId = nodeElement.dataset.nodeId;
      if (!state.selectedNodeIds.has(nodeId)) state.selectedNodeIds = new Set([nodeId]);
      notify();
      showNodeContextMenu(e.clientX, e.clientY);
    } else {
      state.editorCursorWorld = screenToWorld(e.clientX, e.clientY);
      showCanvasContextMenu(e.clientX, e.clientY);
    }
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

  // Left-drag pans empty canvas; right-drag creates a selection box.
  viewport.addEventListener('mousedown', (e) => {
    if (e.target.closest('.node')) return;
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
    closeEditorContextMenu();
    if (e.button === 2) {
      e.preventDefault();
      suppressEditorContextMenuUntil = 0;
      rightSelectionInProgress = true;
      rightSelectionMoved = false;
      const startWorld = screenToWorld(e.clientX, e.clientY);
      state.editorSelectionRect = { x: startWorld.x, y: startWorld.y, w: 1, h: 1 };
      const move = (ev) => {
        if (Math.abs(ev.clientX - e.clientX) + Math.abs(ev.clientY - e.clientY) > 3) {
          rightSelectionMoved = true;
        }
        const current = screenToWorld(ev.clientX, ev.clientY);
        state.editorSelectionRect = normalizeRect(startWorld.x, startWorld.y, current.x, current.y);
        notify();
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        rightSelectionInProgress = false;
        if (rightSelectionMoved) suppressEditorContextMenuUntil = Date.now() + 750;
        const rect = state.editorSelectionRect;
        if (rect) {
          state.selectedNodeIds = new Set(state.nodes
            .filter(node => rectIntersectsNode(node, rect))
            .map(node => node.id));
        }
        state.editorSelectionRect = null;
        notify();
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
      return;
    }
    if (e.button === 0) {
      state.selectedNodeIds = new Set();
      notify();
      if (state.pendingFrom) clearPending();
      const startX = e.clientX;
      const startY = e.clientY;
      const startScrollLeft = viewport.scrollLeft;
      const startScrollTop = viewport.scrollTop;
      const move = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.abs(dx) + Math.abs(dy) > 2) {
          viewport.scrollLeft = startScrollLeft - dx;
          viewport.scrollTop = startScrollTop - dy;
        }
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    }
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
  if (e.button === 2) return;
  if (e.ctrlKey || e.metaKey) {
    const next = new Set(state.selectedNodeIds);
    if (next.has(node.id)) next.delete(node.id);
    else next.add(node.id);
    state.selectedNodeIds = next;
  } else if (!state.selectedNodeIds.has(node.id)) {
    state.selectedNodeIds = new Set([node.id]);
  }
  notify();
  const start = { startX: e.clientX, startY: e.clientY, nodeX: node.position.x, nodeY: node.position.y };
  const movingIds = new Set(state.selectedNodeIds);
  const selectedStartPositions = new Map(state.nodes
    .filter(n => movingIds.has(n.id))
    .map(n => [n.id, { ...n.position }]));

  function onMove(ev) {
    const dx = (ev.clientX - start.startX) / state.zoom;
    const dy = (ev.clientY - start.startY) / state.zoom;
    const overSidebar = isOverSidebar(ev.clientX, ev.clientY);
    if (overSidebar !== (draggingOverSidebarNode === node.id)) {
      draggingOverSidebarNode = overSidebar ? node.id : null;
      renderCanvas();
    }
    if (!overSidebar) {
      if (movingIds.size > 1) {
        state.nodes = state.nodes.map(n => {
          const startPosition = selectedStartPositions.get(n.id);
          return startPosition
            ? { ...n, position: { x: startPosition.x + dx, y: startPosition.y + dy } }
            : n;
        });
        notify();
      } else {
        moveNode(node.id, { x: start.nodeX + dx, y: start.nodeY + dy });
      }
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
