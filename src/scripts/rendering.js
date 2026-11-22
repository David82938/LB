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

function renderMenu() {
  const app = document.getElementById('app');
  const menuRoot = document.getElementById('menuRoot');
  const editorVisible = state.view === 'sandbox' || state.view === 'puzzle';
  app.classList.toggle('hidden', !editorVisible);
  menuRoot.classList.toggle('hidden', editorVisible);
  if (editorVisible) {
    menuRoot.innerHTML = '';
    return;
  }

  if (state.view === 'puzzles') {
    let packsHtml = '';

    if (state.puzzlePackLoadStatus === 'loading') {
      packsHtml = '<div class="puzzle-empty">Loading puzzles...</div>';
    } else if (state.puzzlePacks.length === 0) {
      packsHtml = '<div class="puzzle-empty">No Puzzles</div>';
    } else {
      packsHtml = state.puzzlePacks.map(pack => {
        if (Object.keys(pack.sections).length === 0) {
          return `
            <div class="puzzle-pack">
              <div class="puzzle-empty">No Puzzles</div>
            </div>
          `;
        }
        const sections = Object.entries(pack.sections).map(([sectionName, puzzles]) => {
          const solvedCount = puzzles.reduce((count, puzzle, index) => {
            const puzzleId = getPuzzleId(pack, sectionName, index, puzzle);
            return count + (state.puzzleProgress[puzzleId] ? 1 : 0);
          }, 0);
          const progress = puzzles.length ? Math.round((solvedCount / puzzles.length) * 100) : 0;
          const cards = puzzles.length > 0
            ? puzzles.map((puzzle, index) => {
              const puzzleId = getPuzzleId(pack, sectionName, index, puzzle);
              const solved = Boolean(state.puzzleProgress[puzzleId]);
              return `
                <button class="puzzle-card${solved ? ' puzzle-solved' : ''}" type="button" data-puzzle-id="${escapeHtml(puzzleId)}" title="${escapeHtml(puzzle.title)}">
                  <span class="puzzle-number">${index + 1}</span>
                  <strong>${escapeHtml(puzzle.title)}</strong>
                  ${solved ? '<span class="puzzle-solved-label">Solved</span>' : ''}
                </button>
              `;
            }).join('')
            : '<div class="puzzle-empty">No Puzzles</div>';

          return `
            <section class="puzzle-section">
              <div class="puzzle-section-heading">
                <h3>${escapeHtml(sectionName)}</h3>
                <div class="puzzle-section-progress">
                  <span>${solvedCount}/${puzzles.length} solved</span>
                  <div class="puzzle-progress-track" role="progressbar" aria-label="${escapeHtml(sectionName)} progress" aria-valuemin="0" aria-valuemax="${Math.max(puzzles.length, 1)}" aria-valuenow="${solvedCount}">
                    <span style="width:${progress}%"></span>
                  </div>
                </div>
              </div>
              <div class="puzzle-grid">${cards}</div>
            </section>
          `;
        }).join('');

        return `
          <div class="puzzle-pack">
            ${sections}
          </div>
        `;
      }).join('');
    }

    menuRoot.innerHTML = `
      <div class="mode-screen">
        <div class="mode-heading">
          <div>
            <div class="mode-eyebrow">Logic Builder</div>
            <h2>Puzzles</h2>
          </div>
          <div class="puzzle-heading-actions">
            <button class="btn" id="puzzleSettingsBtn" type="button">Settings</button>
            <button class="btn mode-back" id="puzzleBackBtn" type="button">Back to main Menu</button>
          </div>
        </div>
        <div class="puzzle-packs">${packsHtml}</div>
      </div>
    `;
    document.getElementById('puzzleBackBtn').onclick = showMainMenu;
    document.getElementById('puzzleSettingsBtn').onclick = showPuzzleSettingsDialog;
    menuRoot.querySelectorAll('.puzzle-card').forEach(btn => {
      btn.onclick = () => openPuzzle(btn.dataset.puzzleId);
    });
    return;
  }

  menuRoot.innerHTML = `
    <div class="menu-screen">
      <div class="menu-brand">
        <div class="menu-cpu">${ICONS.cpu}</div>
        <h1>Logic Builder</h1>
      </div>
      <div class="mode-grid">
        <button class="mode-card" id="sandboxModeBtn" type="button">
          <span class="mode-card-label">Play</span>
          <strong>Sandbox Mode</strong>
          <span>Build and test circuits freely</span>
        </button>
        <button class="mode-card" id="puzzleModeBtn" type="button">
          <span class="mode-card-label">Challenge</span>
          <strong>Puzzle Mode</strong>
          <span>Complete Challenges by building a circuit</span>
        </button>
      </div>
    </div>
  `;
  document.getElementById('sandboxModeBtn').onclick = showSandbox;
  document.getElementById('puzzleModeBtn').onclick = showPuzzleMenu;
}

function setMobileSidebarOpen(open) {
  const app = document.getElementById('app');
  const toggle = document.getElementById('mobileSidebarToggle');
  if (!app) return;
  app.classList.toggle('mobile-sidebar-open', open);
  if (toggle) {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Close blocks' : 'Blocks';
  }
}

function closeMobileSidebar() {
  if (window.matchMedia('(max-width: 760px)').matches) setMobileSidebarOpen(false);
}

function renderHeader() {
  const headerBrand = document.getElementById('headerBrand');
  if (headerBrand) {
    headerBrand.classList.add('menu-link');
    headerBrand.onclick = state.currentPuzzle ? showPuzzleMenu : showMainMenu;
  }
  const headerRight = document.getElementById('headerRight');
  const isEditing = state.editingBlockId !== null;
  const editingBlock = state.customBlocks.find(b => b.id === state.editingBlockId);
  headerRight.innerHTML = '';
  const mobileSidebarToggle = el('button', 'btn mobile-sidebar-toggle', {
    id: 'mobileSidebarToggle',
    type: 'button',
    'aria-controls': 'sidebar',
    'aria-expanded': String(document.getElementById('app').classList.contains('mobile-sidebar-open')),
    onclick: () => setMobileSidebarOpen(!document.getElementById('app').classList.contains('mobile-sidebar-open')),
  }, document.getElementById('app').classList.contains('mobile-sidebar-open') ? 'Close blocks' : 'Blocks');
  headerRight.appendChild(mobileSidebarToggle);
  if (state.currentPuzzle) {
    const indicator = el('div', 'editing-indicator');
    indicator.textContent = `Puzzle · ${state.currentPuzzle.puzzle.title}`;
    headerRight.appendChild(indicator);
  } else if (isEditing) {
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
  const gateDefinitions = {
    NOT: { description: '¬a → b', inCount: 1 },
    AND: { description: 'a · b → c', inCount: 2 },
    NAND: { description: '¬(a · b) → c', inCount: 2 },
    NOR: { description: '¬(a ∨ b) → c', inCount: 2 },
    OR: { description: 'a ∨ b → c', inCount: 2 },
    XOR: { description: 'a ⊕ b → c', inCount: 2 },
    XNOR: { description: '¬(a ⊕ b) → c', inCount: 2 },
  };
  const puzzleBlocks = state.currentPuzzle ? Object.keys(state.currentPuzzle.blockInventory) : null;
  const blockKinds = puzzleBlocks || ['AND', 'NOT'];
  const builtins = blockKinds.map(kind => ({
    kind,
    label: kind,
    description: gateDefinitions[kind].description,
    inCount: gateDefinitions[kind].inCount,
    outCount: 1,
  }));
  if (!state.currentPuzzle && state.secretWireUnlocked) {
    builtins.push({ kind: 'WIRE_REVERSE', label: 'R-Wire', description: 'right → left', inCount: 1, outCount: 1 });
  }
  builtins.forEach(item => {
    const remaining = state.currentPuzzle ? getPuzzleBlockRemaining(item.kind) : Infinity;
    list.appendChild(renderSidebarItem({
      label: item.label,
      description: item.description,
      inCount: item.inCount,
      outCount: item.outCount,
      inventoryCount: state.currentPuzzle ? remaining : undefined,
      disabled: remaining <= 0,
      onAdd: () => {
        if (remaining > 0) {
          addNodeFromTemplate(item.kind, { x: WORLD_WIDTH / 2 - 70, y: WORLD_HEIGHT / 2 - 30 });
          closeMobileSidebar();
        }
      },
      onDragStart: (e) => {
        if (remaining <= 0) { e.preventDefault(); return; }
        e.dataTransfer.setData('application/json', JSON.stringify({ kind: item.kind }));
        e.dataTransfer.effectAllowed = 'copy';
      },
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
      onAdd: () => {
        addNodeFromTemplate('CUSTOM', { x: WORLD_WIDTH / 2 - 70, y: WORLD_HEIGHT / 2 - 30 }, b.id);
        closeMobileSidebar();
      },
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
  const item = el('div', 'sidebar-item'
    + (opts.isBeingEdited ? ' being-edited' : '')
    + (opts.disabled ? ' inventory-empty' : ''));
  item.draggable = !state.selectionMode && !opts.disabled;
  item.addEventListener('dragstart', (e) => {
    if (state.selectionMode || opts.disabled) { e.preventDefault(); return; }
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
  if (opts.inventoryCount !== undefined) {
    const count = el('span', 'inventory-count', { title: `${opts.inventoryCount} remaining` });
    count.textContent = opts.inventoryCount === Infinity ? '∞' : String(opts.inventoryCount);
    item.appendChild(count);
  }

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
  if (state.currentPuzzle) {
    stats.appendChild(el('div', 'divider'));
    const puzzleStat = el('span', 'stat puzzle-status-label');
    puzzleStat.textContent = `${state.currentPuzzle.puzzle.title} · ${state.puzzleProgress[state.currentPuzzleId] ? 'Solved' : 'Not solved'}`;
    stats.appendChild(puzzleStat);
  } else if (isEditing) {
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
      const name = state.selectionBlockName || nextBlockName(state.customBlocks);
      const description = state.selectionBlockDescription !== null
        ? state.selectionBlockDescription
        : 'Custom Block';
      buildSelectedBlock(name, description);
    };
    actions.appendChild(cancelBtn);
    actions.appendChild(doneBtn);
  } else if (state.currentPuzzle) {
    const clearBtn = el('button', 'btn', { title: 'Clear the puzzle canvas' });
    clearBtn.innerHTML = ICONS.trashSm + ' Clear';
    clearBtn.onclick = () => {
      if (state.nodes.length === 0 && state.connections.length === 0) return;
      showConfirmDialog({
        title: 'Clear canvas?',
        message: 'This removes all nodes and connections from this puzzle canvas.',
        confirmLabel: 'Clear',
        destructive: true,
        onConfirm: () => {
          state.nodes = [];
          state.connections = [];
          state.pendingFrom = null;
          wireInternals.clear();
          state.wireTransit = {};
          notify();
        },
      });
    };
    const verifyBtn = el('button', 'btn btn-primary', { title: 'Check the circuit against the puzzle truth table' });
    verifyBtn.innerHTML = ICONS.check + ' Verify';
    verifyBtn.onclick = verifyCurrentPuzzle;
    actions.appendChild(clearBtn);
    actions.appendChild(verifyBtn);
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
