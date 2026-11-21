/* ============================================================ MAIN RENDER */
function renderAll() {
  renderMenu();
  if (state.view !== 'sandbox' && state.view !== 'puzzle') return;
  renderHeader();
  renderSidebar();
  renderBottomBar();
  renderCanvas();
}
