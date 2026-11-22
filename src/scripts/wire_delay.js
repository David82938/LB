/* ============================================================ WIRE DELAY */
function tickWires() {
  if (state.wireDelay <= 0) {
    wireInternals.clear();
    if (Object.keys(state.wireTransit).length > 0) {
      state.wireTransit = {};
      renderSimulationFrame();
    }
    return;
  }
  const syncEval = evaluateGraph(state.nodes, state.connections, undefined, state.customBlocks, state.wireTransit);
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const newTransit = {};
  let anyChanged = false;
  for (const c of state.connections) {
    const src = (syncEval.nodeOutputs[c.fromNode] && syncEval.nodeOutputs[c.fromNode][c.fromPin]) || false;
    let internal = wireInternals.get(c.id);
    if (!internal) {
      internal = { sourceValue: src, lastChangeTime: now };
      wireInternals.set(c.id, internal);
    } else if (src !== internal.sourceValue) {
      internal.sourceValue = src;
      internal.lastChangeTime = now;
    }
    const elapsed = now - internal.lastChangeTime;
    const prevTransit = state.wireTransit[c.id];
    const currentValue = prevTransit !== undefined ? Boolean(prevTransit) : false;
    if (elapsed >= state.wireDelay) {
      if (currentValue !== internal.sourceValue) anyChanged = true;
    }
    newTransit[c.id] = elapsed >= state.wireDelay ? internal.sourceValue : currentValue;
  }
  const liveConnIds = new Set(state.connections.map(c => c.id));
  for (const id of wireInternals.keys()) {
    if (!liveConnIds.has(id)) wireInternals.delete(id);
  }
  const wireSetChanged = Object.keys(state.wireTransit).length !== Object.keys(newTransit).length;
  if (anyChanged || wireSetChanged) {
    state.wireTransit = newTransit;
    renderSimulationFrame();
  }
}
