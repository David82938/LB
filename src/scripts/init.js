/* ============================================================ INIT */
function init() {
  setupCanvasEvents();
  setupPendingWireTracking();
  loadStateFromLocalStorage();
  loadPuzzleProgress();
  loadProjects();
  initWasmGateEngine();
  renderAll();
  subscribe(() => {
    saveStateToLocalStorage();
    renderAll();
    if (state.wireDelay > 0 && rafId === null) startWireDelayLoop();
    if (state.wireDelay <= 0 && rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  });
  loadBuiltInPuzzlePacks();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
