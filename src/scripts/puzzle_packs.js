/* ============================================================ PUZZLE PACKS */
const BUILT_IN_PUZZLE_DATA = {{puzzles.json}};

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

function normalizePuzzlePack(data, defaultName) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

  let name = defaultName;
  if (typeof data.name === 'string' && data.name.trim()) name = data.name.trim();
  if (typeof data.title === 'string' && data.title.trim()) name = data.title.trim();

  const sections = normalizePuzzleSections(data);
  if (!sections) return null;

  return { name, sections };
}

async function loadBuiltInPuzzlePacks() {
  let data = BUILT_IN_PUZZLE_DATA;

  try {
    const response = await fetch('./puzzles.json', { cache: 'no-store' });
    if (response.ok) data = await response.json();
  } catch (error) {
    // Embedded data keeps the built-in pack available for file:// usage.
  }

  const pack = normalizePuzzlePack(data, 'Built-in');
  state.puzzlePacks = pack ? [pack] : [];
  state.puzzlePackLoadStatus = pack ? 'loaded' : 'empty';
  notify();
}

function loadCustomPuzzlePack(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      const fallbackName = file.name.replace(/\.json$/i, '') || 'Custom Pack';
      const pack = normalizePuzzlePack(data, fallbackName);
      if (!pack) {
        throw new Error('Invalid puzzle pack');
      }

      const duplicateIndex = state.puzzlePacks.findIndex(existing => existing.name === pack.name);
      if (duplicateIndex >= 0) {
        state.puzzlePacks[duplicateIndex] = pack;
      } else {
        state.puzzlePacks = [...state.puzzlePacks, pack];
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