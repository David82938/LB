/* ============================================================ SAVE AND LOAD */
function saveStateToLocalStorage() {
  if (state.view === 'puzzle' && state.currentPuzzleId) {
    savePuzzleCanvas();
    return;
  }
  const data = {
    nodes: state.nodes,
    connections: state.connections,
    customBlocks: state.customBlocks,
  };
  try {
    localStorage.setItem('logicBuilderState', JSON.stringify(data));
  } catch (error) {
    showToast('Save failed', 'Your sandbox could not be saved to local storage.', 'toast-error');
  }
}

function loadStateFromLocalStorage() {
  let raw;
  try {
    raw = localStorage.getItem('logicBuilderState');
  } catch (error) {
    showToast('Save unavailable', 'Local storage could not be accessed.', 'toast-error');
    return;
  }
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
