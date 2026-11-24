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
  selectionBlockName: null,
  selectionBlockDescription: null,
  zoom: 1,
  wireDelay: 0,
  wireTransit: {},
  settingsSecretReady: false,
  settingsSecretClickCount: 0,
  secretWireUnlocked: false,
  puzzlePacks: [],
  puzzlePackLoadStatus: 'loading',
  currentPuzzle: null,
  currentPuzzleId: null,
  puzzleProgress: {},
  sandboxSnapshot: null,
  projects: [],
  currentProjectId: null,
  sidebarSearch: '',
  selectedNodeIds: new Set(),
  editorSelectionRect: null,
  editorClipboard: null,
  editorCursorWorld: { x: 0, y: 0 },
  hasShownCopyToast: false,
  simulationCache: new Map(),
  graphOutputMemory: new Map(),
  notifyFramePending: false,
};

const subscribers = new Set();
function subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); }
let notifyWindowStart = 0;
let notifyWindowCount = 0;
const NOTIFY_LIMIT_PER_MS = 2;
const NOTIFY_WINDOW_MS = 1;

function notify() {
  if (state.notifyFramePending) return;
  state.notifyFramePending = true;
  requestAnimationFrame(() => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - notifyWindowStart >= NOTIFY_WINDOW_MS) {
      notifyWindowStart = now;
      notifyWindowCount = 0;
    }
    if (notifyWindowCount >= NOTIFY_LIMIT_PER_MS) {
      state.notifyFramePending = false;
      setTimeout(notify, NOTIFY_WINDOW_MS);
      return;
    }
    notifyWindowCount += 1;
    state.notifyFramePending = false;
    subscribers.forEach(fn => fn());
  });
}

function showMainMenu() {
  closeAllDialogs();
  state.view = 'menu';
  notify();
}

function showPuzzleMenu() {
  if (state.currentPuzzle) {
    leavePuzzle();
    return;
  }
  state.view = 'puzzles';
  notify();
}

function showSandbox() {
  if (state.currentPuzzle) leavePuzzle(false);
  showProjectsMenu();
}
