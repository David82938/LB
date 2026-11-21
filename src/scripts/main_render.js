/* ============================================================ MAIN RENDER */
function renderAll() {
  renderMenu();
  if (state.view !== 'sandbox') return;
  renderHeader();
  renderSidebar();
  renderBottomBar();
  renderCanvas();
}
