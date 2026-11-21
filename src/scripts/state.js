/* ============================================================ STATE */
let _idCounter = 1;
function uid(prefix) { _idCounter += 1; return `${prefix}_${Date.now().toString(36)}_${_idCounter}`; }

const wireInternals = new Map();

const state = {
  view: 'menu',
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
  puzzlePacks: [],
  puzzlePackLoadStatus: 'loading',
};

const subscribers = new Set();
function subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); }
function notify() { subscribers.forEach(fn => fn()); }

function showMainMenu() {
  closeAllDialogs();
  state.view = 'menu';
  notify();
}

function showPuzzleMenu() {
  state.view = 'puzzles';
  notify();
}

function showSandbox() {
  state.view = 'sandbox';
  notify();
}
