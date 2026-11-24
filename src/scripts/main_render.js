/* ============================================================ MAIN RENDER */
function renderAll() {
  renderMenu();
  if (state.view !== 'sandbox' && state.view !== 'puzzle' && state.view !== 'project') return;
  renderHeader();
  renderSidebar();
  renderBottomBar();
  renderCanvas();
}
