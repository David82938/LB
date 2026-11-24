/* ============================================================ PROJECTS */
const PROJECTS_STORAGE_KEY = 'logicBuilderProjects';
const PROJECT_GATE_KINDS = ['AND', 'NAND', 'NOR', 'OR', 'XOR', 'XNOR', 'NOT'];

function getCurrentProject() {
  return state.projects.find(project => project.id === state.currentProjectId) || null;
}

function formatProjectLastModified(timestamp) {
  const date = new Date(Number.isFinite(timestamp) ? timestamp : Date.now());
  return date.toLocaleString();
}

function persistProjects() {
  try {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(state.projects));
    return true;
  } catch (error) {
    showToast('Projects save failed', 'Your projects could not be saved to local storage.', 'toast-error');
    return false;
  }
}

function loadProjects() {
  let raw;
  try {
    raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
  } catch (error) {
    showToast('Projects unavailable', 'Local storage could not be accessed.', 'toast-error');
    return;
  }
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) throw new Error('Invalid projects save');
    state.projects = saved.filter(project =>
      project
      && typeof project.id === 'string'
      && typeof project.name === 'string'
      && Array.isArray(project.availableGates)
      && Array.isArray(project.nodes)
      && Array.isArray(project.connections)
      && Array.isArray(project.customBlocks)
    ).map(project => ({
      ...project,
      description: typeof project.description === 'string' ? project.description : '',
      availableGates: project.availableGates.filter(kind => PROJECT_GATE_KINDS.includes(kind)),
      zoom: Number.isFinite(project.zoom) ? project.zoom : 1,
      lastModified: Number.isFinite(project.lastModified)
        ? project.lastModified
        : Number.isFinite(project.createdAt) ? project.createdAt : Date.now(),
    }));
    if (state.projects.length !== saved.length) {
      showToast('Some projects could not be loaded', 'Invalid project entries were skipped.', 'toast-error');
    }
  } catch (error) {
    showToast('Projects save invalid', 'Saved projects could not be loaded.', 'toast-error');
  }
}

function saveCurrentProject() {
  const project = getCurrentProject();
  if (!project) return;
  const changed = project.nodes !== state.nodes
    || project.connections !== state.connections
    || project.customBlocks !== state.customBlocks
    || project.zoom !== state.zoom;
  if (!changed) return;
  state.projects = state.projects.map(item => item.id === project.id ? {
    ...item,
    nodes: state.nodes,
    connections: state.connections,
    customBlocks: state.customBlocks,
    zoom: state.zoom,
    lastModified: Date.now(),
  } : item);
  persistProjects();
}

function showProjectsMenu() {
  if (state.currentPuzzle) leavePuzzle(false);
  if (state.currentProjectId) saveCurrentProject();
  state.currentProjectId = null;
  state.view = 'projects';
  closeAllDialogs();
  notify();
}

function openProject(id) {
  const project = state.projects.find(item => item.id === id);
  if (!project) {
    showToast('Project unavailable', 'This project could not be found.', 'toast-error');
    return;
  }
  state.currentProjectId = id;
  state.currentPuzzle = null;
  state.currentPuzzleId = null;
  state.nodes = project.nodes;
  state.connections = project.connections;
  state.customBlocks = project.customBlocks;
  state.zoom = project.zoom;
  state.pendingFrom = null;
  state.editingBlockId = null;
  state.stashedNodes = [];
  state.stashedConnections = [];
  state.selectionMode = false;
  state.selectionRect = null;
  state.wireTransit = {};
  wireInternals.clear();
  state.view = 'project';
  notify();
}

function showCreateProjectDialog() {
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-group">
      <label class="form-label" for="projectNameInput">Project name</label>
      <input class="form-input" id="projectNameInput" maxlength="80" placeholder="My project">
    </div>
    <div class="form-group">
      <label class="form-label" for="projectDescriptionInput">Description</label>
      <textarea class="form-input project-description-input" id="projectDescriptionInput" maxlength="500" placeholder="What are you building?"></textarea>
    </div>
    <div class="form-group">
      <label class="form-label" for="projectGatePreset">Starting gates</label>
      <select class="form-input" id="projectGatePreset">
        <option value="basic">Basic (AND, NOT)</option>
        <option value="common">Common (AND, OR, NOT)</option>
        <option value="nand">NAND gate only</option>
        <option value="all">All seven gates</option>
        <option value="custom">Custom</option>
      </select>
    </div>
    <div class="project-gate-options hidden" id="projectGateOptions"></div>
    <div class="dialog-actions">
      <button class="btn btn-sm" id="createProjectCancel">Cancel</button>
      <button class="btn btn-primary" id="createProjectConfirm">Create project</button>
    </div>
  `;
  const dlg = showDialog({ title: 'New project', body, maxWidth: 'medium' });
  const preset = body.querySelector('#projectGatePreset');
  const customOptions = body.querySelector('#projectGateOptions');
  customOptions.innerHTML = PROJECT_GATE_KINDS.map(kind =>
    `<label><input type="checkbox" value="${kind}" ${['AND', 'NOT'].includes(kind) ? 'checked' : ''}> ${kind}</label>`
  ).join('');
  const updateGateSelection = () => {
    customOptions.classList.toggle('hidden', preset.value !== 'custom');
  };
  preset.addEventListener('change', updateGateSelection);
  updateGateSelection();
  body.querySelector('#createProjectCancel').onclick = () => dlg.close();
  body.querySelector('#createProjectConfirm').onclick = () => {
    const name = body.querySelector('#projectNameInput').value.trim();
    if (!name) {
      showToast('Project name required', 'Enter a name for your project.', 'toast-error');
      body.querySelector('#projectNameInput').focus();
      return;
    }
    const presets = {
      basic: ['AND', 'NOT'],
      common: ['AND', 'OR', 'NOT'],
      nand: ['NAND'],
      all: PROJECT_GATE_KINDS,
    };
    const availableGates = preset.value === 'custom'
      ? Array.from(customOptions.querySelectorAll('input:checked')).map(input => input.value)
      : presets[preset.value];
    if (availableGates.length === 0) {
      showToast('Choose a starting gate', 'Select at least one gate for this project.', 'toast-error');
      return;
    }
    const now = Date.now();
    const project = {
      id: uid('project'),
      name,
      description: body.querySelector('#projectDescriptionInput').value.trim(),
      availableGates,
      nodes: [],
      connections: [],
      customBlocks: [],
      zoom: 1,
      createdAt: now,
      lastModified: now,
    };
    state.projects = [...state.projects, project];
    persistProjects();
    dlg.close();
    openProject(project.id);
  };
  setTimeout(() => body.querySelector('#projectNameInput').focus(), 0);
}

function saveCurrentProjectDetails(nameInput, descriptionInput) {
  const project = getCurrentProject();
  if (!project) return false;
  const name = nameInput.value.trim();
  if (!name) {
    showToast('Project name required', 'Enter a name for your project.', 'toast-error');
    nameInput.focus();
    return false;
  }
  const previousProjects = state.projects;
  state.projects = state.projects.map(item => item.id === project.id ? {
    ...item,
    name,
    description: descriptionInput.value.trim(),
    lastModified: Date.now(),
  } : item);
  if (!persistProjects()) {
    state.projects = previousProjects;
    nameInput.value = project.name;
    descriptionInput.value = project.description;
    return false;
  }
  notify();
  showToast('Project saved', 'Project information was updated.');
  return true;
}

function isValidImportedProject(project) {
  return project
    && typeof project === 'object'
    && typeof project.id === 'string'
    && project.id.trim()
    && typeof project.name === 'string'
    && project.name.trim()
    && typeof project.description === 'string'
    && Array.isArray(project.availableGates)
    && project.availableGates.every(kind => PROJECT_GATE_KINDS.includes(kind))
    && Array.isArray(project.nodes)
    && Array.isArray(project.connections)
    && Array.isArray(project.customBlocks);
}

function importProjectsFromJson(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(String(reader.result));
    } catch (error) {
      showToast('Import failed', 'Choose a valid Logic Builder projects JSON file.', 'toast-error');
      return;
    }
    if (!data
      || data.format !== 'logic-builder-projects'
      || data.version !== 1
      || !Array.isArray(data.projects)
      || !data.projects.every(isValidImportedProject)) {
      showToast('Import failed', 'Choose a valid Logic Builder projects JSON file.', 'toast-error');
      return;
    }

    const importedProjects = data.projects.map(project => {
      const importedAt = Date.now();
      return {
        ...project,
        availableGates: [...new Set(project.availableGates)],
        zoom: Number.isFinite(project.zoom) ? Math.max(0.25, Math.min(2.5, project.zoom)) : 1,
        createdAt: Number.isFinite(project.createdAt) ? project.createdAt : importedAt,
        lastModified: Number.isFinite(project.lastModified) ? project.lastModified : importedAt,
      };
    });
    showProjectImportOptions(importedProjects);
  };
  reader.onerror = () => {
    showToast('Import failed', 'The selected projects file could not be read.', 'toast-error');
  };
  reader.readAsText(file);
}

function showProjectImportOptions(importedProjects) {
  const body = document.createElement('div');
  body.innerHTML = `
    <p>Projects with IDs that already exist locally will be kept unless you choose to overwrite them.</p>
    <label class="puzzle-save-option">
      <input id="overwriteImportedProjects" type="checkbox">
      Overwrite existing projects with matching IDs
    </label>
    <div class="dialog-actions">
      <button class="btn btn-sm" id="cancelProjectImport">Cancel</button>
      <button class="btn btn-primary" id="confirmProjectImport">Import projects</button>
    </div>
  `;
  const dlg = showDialog({ title: 'Import projects', body, maxWidth: 'medium' });
  body.querySelector('#cancelProjectImport').onclick = () => dlg.close();
  body.querySelector('#confirmProjectImport').onclick = () => {
    const overwriteMatching = body.querySelector('#overwriteImportedProjects').checked;
    dlg.close();
    applyImportedProjects(importedProjects, overwriteMatching);
  };
}

function applyImportedProjects(importedProjects, overwriteMatching) {
  const uniqueProjects = new Map(importedProjects.map(project => [project.id, project]));
  const nextProjects = [...state.projects];
  const projectIndexes = new Map(nextProjects.map((project, index) => [project.id, index]));
  let added = 0;
  let overwritten = 0;
  let skipped = 0;

  uniqueProjects.forEach(project => {
    if (projectIndexes.has(project.id)) {
      if (overwriteMatching) {
        nextProjects[projectIndexes.get(project.id)] = project;
        overwritten += 1;
      } else {
        skipped += 1;
      }
      return;
    }
    projectIndexes.set(project.id, nextProjects.length);
    nextProjects.push(project);
    added += 1;
  });

  const previousProjects = state.projects;
  state.projects = nextProjects;
  if (!persistProjects()) {
    state.projects = previousProjects;
    return;
  }
  notify();
  if (added === 0 && overwritten === 0) {
    showToast('No projects imported', `${skipped} matching project(s) were kept unchanged.`);
    return;
  }
  showToast('Projects imported', `${added} added, ${overwritten} overwritten, ${skipped} matching project(s) kept unchanged.`);
}

function chooseProjectImportFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.style.display = 'none';
  input.addEventListener('change', () => {
    importProjectsFromJson(input.files && input.files[0]);
  });
  document.body.appendChild(input);
  input.click();
  input.remove();
}

function deleteCurrentProject() {
  const project = getCurrentProject();
  if (!project) return;
  state.projects = state.projects.filter(item => item.id !== project.id);
  persistProjects();
  state.currentProjectId = null;
  state.nodes = [];
  state.connections = [];
  state.customBlocks = [];
  state.view = 'projects';
  wireInternals.clear();
  state.wireTransit = {};
  notify();
}

function deleteAllProjects() {
  state.projects = [];
  persistProjects();
  if (state.currentProjectId) {
    state.currentProjectId = null;
    state.nodes = [];
    state.connections = [];
    state.customBlocks = [];
    state.view = 'projects';
  }
  notify();
}

function exportAllProjects() {
  const data = {
    format: 'logic-builder-projects',
    version: 1,
    exportedAt: new Date().toISOString(),
    projects: state.projects,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `logic-builder-projects-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast('Projects exported', `${state.projects.length} project(s) saved to one JSON file.`);
}

function exportCurrentProject() {
  const project = getCurrentProject();
  if (!project) return;
  const exportedProject = {
    ...project,
    name: project.name,
    description: project.description,
    nodes: state.nodes,
    connections: state.connections,
    customBlocks: state.customBlocks,
    zoom: state.zoom,
    lastModified: Date.now(),
  };
  const data = {
    format: 'logic-builder-projects',
    version: 1,
    exportedAt: new Date().toISOString(),
    projects: [exportedProject],
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeName = (exportedProject.name || 'project')
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'project';
  link.href = url;
  link.download = `logic-builder-project-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast('Project exported', `${exportedProject.name} saved to one JSON file.`);
}
