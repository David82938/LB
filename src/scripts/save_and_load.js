/* ============================================================ SAVE AND LOAD */
function saveStateToLocalStorage() {
  const data = {
    nodes: state.nodes,
    connections: state.connections,
    customBlocks: state.customBlocks,
  };
  localStorage.setItem('logicBuilderState', JSON.stringify(data));
}

function loadStateFromLocalStorage() {
  const raw = localStorage.getItem('logicBuilderState');
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
