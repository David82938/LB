/* ============================================================ EXPORT AND IMPORT */
function getExportData() {
  return {
    format: 'logic-builder',
    version: 1,
    exportedAt: new Date().toISOString(),
    nodes: state.nodes,
    connections: state.connections,
    customBlocks: state.customBlocks,
    wireDelay: state.wireDelay,
    zoom: state.zoom,
  };
}

function exportStateToJson() {
  const data = getExportData();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `logic-builder-${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast('Project exported', 'The JSON file has been downloaded.');
}

function isValidImportedState(data) {
  return data
    && typeof data === 'object'
    && Array.isArray(data.nodes)
    && Array.isArray(data.connections)
    && Array.isArray(data.customBlocks);
}

function importStateFromJson(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      if (!isValidImportedState(data)) {
        throw new Error('Invalid Logic Builder JSON');
      }

      wireInternals.clear();
      state.nodes = data.nodes;
      state.connections = data.connections;
      state.customBlocks = data.customBlocks;
      state.pendingFrom = null;
      state.editingBlockId = null;
      state.stashedNodes = [];
      state.stashedConnections = [];
      state.selectionMode = false;
      state.selectionRect = null;
      state.wireTransit = {};
      document.body.style.cursor = '';

      if (Number.isFinite(data.wireDelay)) {
        state.wireDelay = Math.max(0, Math.min(1000, Math.round(data.wireDelay)));
      }
      if (Number.isFinite(data.zoom)) {
        state.zoom = Math.max(0.25, Math.min(2.5, data.zoom));
      }
      notify();
      showToast('Project imported', `${data.nodes.length} blocks and ${data.connections.length} wires loaded.`);
    } catch (error) {
      showToast('Import failed', 'Choose a valid Logic Builder JSON file.', 'toast-error');
    }
  };
  reader.onerror = () => {
    showToast('Import failed', 'The selected file could not be read.', 'toast-error');
  };
  reader.readAsText(file);
}

function chooseImportJsonFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.style.display = 'none';
  input.addEventListener('change', () => {
    importStateFromJson(input.files && input.files[0]);
  });
  document.body.appendChild(input);
  input.click();
  input.remove();
}
