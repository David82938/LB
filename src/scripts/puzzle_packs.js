/* ============================================================ PUZZLE PACKS */
const BUILT_IN_PUZZLE_DATA = {{puzzles.json}};
const PUZZLE_PACKS_STORAGE_KEY = 'logicBuilderPuzzlePacks';
const PUZZLE_PROGRESS_STORAGE_KEY = 'logicBuilderPuzzleProgress';
const PUZZLE_SAVE_PREFIX = 'logicBuilderPuzzleSave:';

function normalizePuzzleSections(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

  if (data.sections && typeof data.sections === 'object' && !Array.isArray(data.sections)) {
    data = data.sections;
  }

  const sections = {};
  for (const [name, puzzles] of Object.entries(data)) {
    if (!Array.isArray(puzzles)) continue;
    sections[name] = puzzles.filter(puzzle => puzzle && typeof puzzle.title === 'string' && puzzle.title.trim())
      .map(puzzle => ({ ...puzzle, title: puzzle.title.trim() }));
  }
  return sections;
}

function normalizePuzzlePack(data, defaultName, id, isBuiltIn) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

  let name = defaultName;
  if (typeof data.name === 'string' && data.name.trim()) name = data.name.trim();
  if (typeof data.title === 'string' && data.title.trim()) name = data.title.trim();

  const sections = normalizePuzzleSections(data);
  if (!sections) return null;

  return { id, name, sections, isBuiltIn: Boolean(isBuiltIn) };
}

function readPuzzleStorage(key, fallback) {
  let raw;
  try {
    raw = localStorage.getItem(key);
  } catch (error) {
    showToast('Puzzle storage unavailable', 'Local storage could not be accessed.', 'toast-error');
    return fallback;
  }
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    showToast('Saved data could not be loaded', 'Puzzle storage contains invalid JSON.', 'toast-error');
    return fallback;
  }
}

function loadPuzzleProgress() {
  const progress = readPuzzleStorage(PUZZLE_PROGRESS_STORAGE_KEY, {});
  state.puzzleProgress = progress && typeof progress === 'object' && !Array.isArray(progress) ? progress : {};
  if (progress && (typeof progress !== 'object' || Array.isArray(progress))) {
    showToast('Puzzle progress invalid', 'Saved puzzle status could not be loaded.', 'toast-error');
  }
}

async function loadBuiltInPuzzlePacks() {
  let data = BUILT_IN_PUZZLE_DATA;

  try {
    const response = await fetch('./puzzles.json', { cache: 'no-store' });
    if (response.ok) data = await response.json();
  } catch (error) {
    // Embedded data keeps the built-in pack available for file:// usage.
  }

  const builtIn = normalizePuzzlePack(data, 'Built-in', 'builtin', true);
  const savedPacks = readPuzzleStorage(PUZZLE_PACKS_STORAGE_KEY, []);
  const expansions = Array.isArray(savedPacks)
    ? savedPacks.map(pack => {
      const name = pack && typeof pack.name === 'string' ? pack.name : 'Custom Pack';
      return normalizePuzzlePack(pack, name, `expansion:${encodeURIComponent(name)}`, false);
    }).filter(Boolean)
    : [];
  if (!Array.isArray(savedPacks)) {
    showToast('Expansion data invalid', 'Saved puzzle expansions could not be loaded.', 'toast-error');
  }
  state.puzzlePacks = [...(builtIn ? [builtIn] : []), ...expansions];
  state.puzzlePackLoadStatus = builtIn || expansions.length ? 'loaded' : 'empty';
  notify();
}

function getPuzzleId(pack, sectionName, index, puzzle) {
  return JSON.stringify([pack.id, sectionName, index, puzzle.title]);
}

function findPuzzleById(id) {
  for (const pack of state.puzzlePacks) {
    for (const [sectionName, puzzles] of Object.entries(pack.sections)) {
      for (let index = 0; index < puzzles.length; index++) {
        const puzzle = puzzles[index];
        if (getPuzzleId(pack, sectionName, index, puzzle) === id) {
          return { pack, sectionName, puzzle, id };
        }
      }
    }
  }
  return null;
}

function puzzleSaveKey(id) {
  return PUZZLE_SAVE_PREFIX + encodeURIComponent(id);
}

function getPuzzleBlockInventory(puzzle) {
  const blocks = puzzle.blocks;
  if (blocks === undefined || blocks === null) return {};
  if (Array.isArray(blocks)) {
    const inventory = {};
    for (const kind of blocks) {
      const normalizedKind = String(kind).toUpperCase();
      if (['NOT', 'AND', 'NAND', 'NOR', 'OR', 'XOR', 'XNOR'].includes(normalizedKind)) {
        inventory[normalizedKind] = Infinity;
      }
    }
    return inventory;
  }
  if (typeof blocks !== 'object') return null;

  const inventory = {};
  for (const [kind, count] of Object.entries(blocks)) {
    const normalizedKind = kind.toUpperCase();
    if (!['NOT', 'AND', 'NAND', 'NOR', 'OR', 'XOR', 'XNOR'].includes(normalizedKind)
      || !Number.isSafeInteger(count) || count < 0) {
      return null;
    }
    inventory[normalizedKind] = count;
  }
  return inventory;
}

function getPuzzleBlockRemaining(kind) {
  if (!state.currentPuzzle) return Infinity;
  const allowed = state.currentPuzzle.blockInventory[kind];
  if (allowed === undefined) return 0;
  if (allowed === Infinity) return Infinity;
  const used = state.nodes.filter(node => node.kind === kind).length;
  return Math.max(0, allowed - used);
}

function savePuzzleCanvas() {
  if (!state.currentPuzzleId) return;
  const data = { nodes: state.nodes, connections: state.connections };
  try {
    localStorage.setItem(puzzleSaveKey(state.currentPuzzleId), JSON.stringify(data));
  } catch (error) {
    showToast('Puzzle save failed', 'Your puzzle canvas could not be saved to local storage.', 'toast-error');
  }
}

function openPuzzle(id) {
  const entry = findPuzzleById(id);
  if (!entry) {
    showToast('Puzzle unavailable', 'This puzzle could not be found in the loaded packs.', 'toast-error');
    return;
  }

  const blockInventory = getPuzzleBlockInventory(entry.puzzle);
  if (!blockInventory) {
    showToast('Invalid puzzle', 'The puzzle block inventory must map supported gate names to non-negative counts.', 'toast-error');
    return;
  }

  state.sandboxSnapshot = {
    nodes: state.nodes,
    connections: state.connections,
    customBlocks: state.customBlocks,
    zoom: state.zoom,
  };
  state.currentPuzzle = { ...entry, blockInventory };
  state.currentPuzzleId = id;
  state.view = 'puzzle';
  const saved = readPuzzleStorage(puzzleSaveKey(id), null);
  if (saved && Array.isArray(saved.nodes) && Array.isArray(saved.connections)) {
    state.nodes = saved.nodes;
    state.connections = saved.connections;
  } else {
    if (saved !== null) showToast('Puzzle save invalid', 'This puzzle canvas could not be loaded; a blank canvas was opened.', 'toast-error');
    state.nodes = [];
    state.connections = [];
  }
  state.customBlocks = [];
  state.pendingFrom = null;
  state.zoom = 1;
  wireInternals.clear();
  state.wireTransit = {};
  notify();
  showPuzzleTruthTableWindow();
}

function leavePuzzle(returnToPuzzles) {
  if (!state.currentPuzzle) return;
  const truthTableWindow = document.getElementById('puzzleTruthTableWindow');
  if (truthTableWindow) truthTableWindow.remove();
  savePuzzleCanvas();
  const snapshot = state.sandboxSnapshot;
  state.nodes = snapshot ? snapshot.nodes : [];
  state.connections = snapshot ? snapshot.connections : [];
  state.customBlocks = snapshot ? snapshot.customBlocks : [];
  state.zoom = snapshot ? snapshot.zoom : 1;
  state.sandboxSnapshot = null;
  state.currentPuzzle = null;
  state.currentPuzzleId = null;
  state.pendingFrom = null;
  wireInternals.clear();
  state.wireTransit = {};
  state.view = returnToPuzzles === false ? 'menu' : 'puzzles';
  notify();
}

function persistPuzzleProgress() {
  try {
    localStorage.setItem(PUZZLE_PROGRESS_STORAGE_KEY, JSON.stringify(state.puzzleProgress));
    return true;
  } catch (error) {
    showToast('Progress save failed', 'Puzzle progress could not be saved to local storage.', 'toast-error');
    return false;
  }
}

function verifyCurrentPuzzle() {
  const entry = state.currentPuzzle;
  if (!entry) return;
  const puzzle = entry.puzzle;
  const inputs = state.nodes.filter(node => node.kind === 'INPUT');
  const outputs = state.nodes.filter(node => node.kind === 'OUTPUT');
  if (inputs.length !== puzzle.input_count || outputs.length !== puzzle.output_count) {
    showToast(
      'Incorrect input or output count',
      `This puzzle requires ${puzzle.input_count} toggle(s) and ${puzzle.output_count} lamp(s); the canvas has ${inputs.length} and ${outputs.length}.`,
      'toast-error'
    );
    return;
  }

  if (!Array.isArray(puzzle.truth_table) || puzzle.truth_table.some(row =>
    !Array.isArray(row) || row.length !== inputs.length + outputs.length
    || row.some(value => value !== 0 && value !== 1 && value !== false && value !== true)
  )) {
    showToast('Invalid puzzle', 'The puzzle truth table does not match its input and output counts.', 'toast-error');
    return;
  }

  const hasSequentialNames = nodes => nodes.every(node =>
    /^\d+$/.test(node.name || '')
    && node.name === String(Number(node.name))
    && Number.isSafeInteger(Number(node.name))
    && Number(node.name) < nodes.length
  ) && new Set(nodes.map(node => Number(node.name))).size === nodes.length;
  const orderNodes = nodes => hasSequentialNames(nodes)
    ? nodes.slice().sort((a, b) => Number(a.name) - Number(b.name))
    : nodes;
  const inputNodes = orderNodes(inputs);
  const outputNodes = orderNodes(outputs);
  const allNodesNumbered = hasSequentialNames(inputs) && hasSequentialNames(outputs);
  if (!allNodesNumbered) {
    showToast('Default terminal order used', 'Name toggles and lamps 0 to n to choose their truth-table order.');
  }

  const currentTable = puzzle.truth_table.map(row => {
    const overrides = new Map(inputNodes.map((node, index) => [node.id, Boolean(row[index])]));
    const result = evaluateGraph(state.nodes, state.connections, overrides, state.customBlocks);
    return [
      ...row.slice(0, inputs.length),
      ...outputNodes.map(node => Boolean(result.nodeInputs[node.id] && result.nodeInputs[node.id].in)),
    ];
  });
  const passed = puzzle.truth_table.every((row, rowIndex) =>
    row.slice(inputs.length).every((expected, outputIndex) =>
      Boolean(expected) === currentTable[rowIndex][inputs.length + outputIndex]
    )
  );
  showPuzzleResult(puzzle, currentTable, passed);
}

function showPuzzleResult(puzzle, currentTable, passed) {
  if (passed) {
    state.puzzleProgress[state.currentPuzzleId] = true;
    persistPuzzleProgress();
    notify();
  }
  const body = document.createElement('div');
  if (passed) {
    body.innerHTML = `<p>You solved <strong>${escapeHtml(puzzle.title)}</strong>!</p><div class="dialog-actions"><button class="btn btn-primary" id="puzzleResultOk">OK</button></div>`;
  } else {
    const headers = Array.from({ length: puzzle.input_count }, (_, i) => `I${i}`)
      .concat(Array.from({ length: puzzle.output_count }, (_, i) => `O${i}`));
    const renderTable = (rows) => `
      <table class="truth-table"><thead><tr>${headers.map(value => `<th>${value}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(row => `<tr>${row.map(value => `<td>${value ? 1 : 0}</td>`).join('')}</tr>`).join('')}</tbody></table>
    `;
    body.innerHTML = `
      <p>The circuit does not match the required truth table.</p>
      <div class="truth-table-result"><strong>Expected</strong>${renderTable(puzzle.truth_table)}</div>
      <div class="truth-table-result"><strong>Your circuit</strong>${renderTable(currentTable)}</div>
      <div class="dialog-actions"><button class="btn btn-primary" id="puzzleResultOk">OK</button></div>
    `;
  }
  const dlg = showDialog({ title: passed ? 'Puzzle solved' : 'Not quite', body, maxWidth: 'medium' });
  body.querySelector('#puzzleResultOk').onclick = () => {
    dlg.close();
    if (passed) leavePuzzle();
  };
}

function loadCustomPuzzlePack(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      const fallbackName = file.name.replace(/\.json$/i, '') || 'Custom Pack';
      const pack = normalizePuzzlePack(data, fallbackName, null, false);
      if (!pack) throw new Error('Invalid puzzle pack');
      pack.id = `expansion:${encodeURIComponent(pack.name)}`;

      const duplicateIndex = state.puzzlePacks.findIndex(existing => existing.id === pack.id);
      if (duplicateIndex >= 0) state.puzzlePacks[duplicateIndex] = pack;
      else state.puzzlePacks = [...state.puzzlePacks, pack];
      try {
        localStorage.setItem(PUZZLE_PACKS_STORAGE_KEY, JSON.stringify(
          state.puzzlePacks.filter(existing => !existing.isBuiltIn).map(({ name, sections }) => ({ name, sections }))
        ));
      } catch (error) {
        showToast('Expansion save failed', 'The expansion was loaded but could not be saved to local storage.', 'toast-error');
      }
      state.puzzlePackLoadStatus = 'loaded';
      notify();
      showToast('Expansion pack loaded', `${pack.name} · ${Object.keys(pack.sections).length} section(s)`);
    } catch (error) {
      showToast('Import failed', 'Choose a valid puzzle expansion JSON file.', 'toast-error');
    }
  };
  reader.onerror = () => {
    showToast('Import failed', 'The selected puzzle file could not be read.', 'toast-error');
  };
  reader.readAsText(file);
}

function removePuzzleExpansions(deleteSaves) {
  const expansions = state.puzzlePacks.filter(pack => !pack.isBuiltIn);
  try {
    localStorage.setItem(PUZZLE_PACKS_STORAGE_KEY, '[]');
  } catch (error) {
    showToast('Expansion removal failed', 'The loaded expansions could not be removed from local storage.', 'toast-error');
    return;
  }
  if (deleteSaves) {
    try {
      const saveKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(PUZZLE_SAVE_PREFIX)) saveKeys.push(key);
      }
      for (const key of saveKeys) {
        const id = decodeURIComponent(key.slice(PUZZLE_SAVE_PREFIX.length));
        if (expansions.some(pack => id.startsWith(`["${pack.id}"`))) localStorage.removeItem(key);
      }
    } catch (error) {
      showToast('Expansion saves partly removed', 'Some expansion saves could not be deleted.', 'toast-error');
      return;
    }
    for (const id of Object.keys(state.puzzleProgress)) {
      if (expansions.some(pack => id.startsWith(`["${pack.id}"`))) delete state.puzzleProgress[id];
    }
    if (!persistPuzzleProgress()) return;
  }
  state.puzzlePacks = state.puzzlePacks.filter(pack => pack.isBuiltIn);
  notify();
  showToast('Expansions removed', deleteSaves ? 'Expansion packs and their puzzle saves were deleted.' : 'Expansion packs were removed; their puzzle saves were kept.');
}

function resetAllPuzzleProgress() {
  const previousProgress = state.puzzleProgress;
  state.puzzleProgress = {};
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PUZZLE_SAVE_PREFIX)) keys.push(key);
    }
    keys.forEach(key => localStorage.removeItem(key));
  } catch (error) {
    state.puzzleProgress = previousProgress;
    showToast('Puzzle reset incomplete', 'Some saved puzzle canvases could not be removed from local storage.', 'toast-error');
    return;
  }
  if (!persistPuzzleProgress()) {
    state.puzzleProgress = previousProgress;
    notify();
    return;
  }
  notify();
  showToast('Puzzle progress reset', 'Solved status and saved canvases for all puzzles were cleared.');
}

function chooseCustomPuzzlePack() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.style.position = 'fixed';
  input.style.opacity = '0';
  input.style.pointerEvents = 'none';
  input.setAttribute('aria-hidden', 'true');
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (file) loadCustomPuzzlePack(file);
    input.value = '';
    input.remove();
  });
  input.addEventListener('cancel', () => input.remove());
  document.body.appendChild(input);
  input.click();
}
