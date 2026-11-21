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

function showRemovePuzzlePacksDialog() {
  const body = document.createElement('div');
  body.innerHTML = `
    <p>Remove all loaded expansion packs?</p>
    <label class="puzzle-save-option"><input id="deleteExpansionSaves" type="checkbox"> Also delete their saved canvases and solved status</label>
    <div class="dialog-actions">
      <button class="btn btn-sm" id="removeExpansionsCancel">Cancel</button>
      <button class="btn btn-sm btn-destructive" id="removeExpansionsConfirm">Remove expansions</button>
    </div>
  `;
  const dlg = showDialog({ title: 'Remove expansions?', body, maxWidth: 'small' });
  body.querySelector('#removeExpansionsCancel').onclick = () => dlg.close();
  body.querySelector('#removeExpansionsConfirm').onclick = () => {
    const deleteSaves = body.querySelector('#deleteExpansionSaves').checked;
    dlg.close();
    removePuzzleExpansions(deleteSaves);
  };
}

function showPuzzleSettingsDialog() {
  const body = document.createElement('div');
  body.innerHTML = `
    <section class="puzzle-settings-category">
      <h3>Expansions</h3>
      <p>Expansion packs are JSON collections of additional puzzles. Loaded packs stay saved in this browser and appear alongside the built-in puzzles.</p>
      <div class="puzzle-settings-actions">
        <button class="btn btn-sm" id="loadPuzzlePackBtn">Load expansion pack</button>
        <button class="btn btn-sm" id="removePuzzlePacksBtn">Remove expansion packs</button>
      </div>
    </section>
    <section class="puzzle-settings-category dangerous">
      <h3>Dangerous</h3>
      <p>Clear every puzzle's solved status and saved canvas. This cannot be undone.</p>
      <button class="btn btn-sm btn-destructive" id="resetPuzzleProgressBtn">Reset puzzle progress</button>
    </section>
  `;
  const dlg = showDialog({ title: 'Puzzle settings', body, maxWidth: 'medium' });
  body.querySelector('#loadPuzzlePackBtn').onclick = () => {
    dlg.close();
    chooseCustomPuzzlePack();
  };
  body.querySelector('#removePuzzlePacksBtn').onclick = () => {
    dlg.close();
    showRemovePuzzlePacksDialog();
  };
  body.querySelector('#resetPuzzleProgressBtn').onclick = () => {
    dlg.close();
    showConfirmDialog({
      title: 'Reset puzzle progress?',
      message: 'This clears all solved statuses and saved canvases for every puzzle. This cannot be undone.',
      confirmLabel: 'Reset progress',
      destructive: true,
      onConfirm: resetAllPuzzleProgress,
    });
  };
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

function renderSettingsTruthTable(puzzle) {
  if (!Array.isArray(puzzle.truth_table)) return '<p class="settings-description">Truth table unavailable.</p>';
  const headers = Array.from({ length: puzzle.input_count || 0 }, (_, i) => `I${i}`)
    .concat(Array.from({ length: puzzle.output_count || 0 }, (_, i) => `O${i}`));
  const rows = puzzle.truth_table.map(row => `<tr>${row.map(value => `<td>${value ? 1 : 0}</td>`).join('')}</tr>`).join('');
  return `<div class="truth-table-scroll"><table class="truth-table"><thead><tr>${headers.map(value => `<th>${value}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function showSettings() {
  const body = document.createElement('div');
  const wireDelay = state.wireDelay;
  const puzzle = state.currentPuzzle && state.currentPuzzle.puzzle;
  const projectSettings = puzzle
    ? `
      <div class="settings-section">
        <div class="settings-label"><span>Puzzle truth table</span></div>
        <p class="settings-description">${puzzle.input_count} input(s) · ${puzzle.output_count} output(s)</p>
        ${renderSettingsTruthTable(puzzle)}
      </div>
    `
    : `
      <div class="settings-section">
        <div class="settings-label"><span>Project file</span></div>
        <p class="settings-description">Export the current canvas and custom blocks to JSON, or import them from a saved project file.</p>
        <div class="dialog-actions" style="justify-content:flex-start">
          <button class="btn btn-sm" id="exportBtn">${ICONS.arrowDown || ''} Export JSON</button>
          <button class="btn btn-sm btn-primary" id="importBtn">${ICONS.arrowUp || ''} Import JSON</button>
        </div>
      </div>
    `;
  const resetSettings = puzzle
    ? `
      <div class="settings-section">
        <div class="settings-label"><span>Return to puzzles</span></div>
        <p class="settings-description">Return to the puzzle list. Your canvas is saved automatically.</p>
        <button class="btn btn-sm" id="resetBtn">${ICONS.check} Back to puzzles</button>
      </div>
    `
    : `
      <div class="settings-section">
        <div class="settings-label"><span>Reset game</span></div>
        <p class="settings-description">Clears the canvas, removes all custom blocks, and resets settings to defaults. Cannot be undone.</p>
        <button class="btn btn-sm btn-destructive" id="resetBtn" style="border:1px solid oklch(0.577 0.245 27.325 / 40%); background:oklch(0.577 0.245 27.325 / 10%); color:var(--destructive);">${ICONS.rotate} Reset everything</button>
      </div>
    `;
  body.innerHTML = `
    <div class="settings-section">
      <div class="settings-label"><span>Wire delay</span><span class="settings-value" id="delayValue">${wireDelay}ms</span></div>
      <input type="range" id="delaySlider" min="0" max="1000" step="10" value="${wireDelay}">
      <div class="range-labels"><span>0ms (instant)</span><span> - </span><span>1000ms</span></div>
      <p class="settings-description">Artificial propagation delay added to every wire. At 0ms the circuit is instantaneous; raise the value to watch signals travel through the graph.</p>
    </div>
    <div class="settings-divider"></div>
    ${projectSettings}
    <div class="settings-divider"></div>
    ${resetSettings}
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
  if (!puzzle) {
    body.querySelector('#exportBtn').onclick = exportStateToJson;
    body.querySelector('#importBtn').onclick = chooseImportJsonFile;
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
  } else {
    body.querySelector('#resetBtn').onclick = () => {
      dlg.close();
      leavePuzzle();
    };
  }
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
