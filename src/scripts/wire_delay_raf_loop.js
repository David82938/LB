/* ============================================================ WIRE DELAY RAF LOOP */
let rafId = null;
let clockRafId = null;
let clockLastFrameTime = 0;

function advanceClockNodes(now) {
  let changed = false;
  const liveClockIds = new Set(state.nodes.filter(node => node.kind === 'CLOCK').map(node => node.id));
  for (const id of state.clockStates.keys()) {
    if (!liveClockIds.has(id)) state.clockStates.delete(id);
  }
  for (const id of state.clockTransitions.keys()) {
    if (!liveClockIds.has(id)) state.clockTransitions.delete(id);
  }
  for (const node of state.nodes) {
    if (node.kind !== 'CLOCK') continue;
    const period = Math.max(20, Number(node.periodMs) || 500);
    let transition = state.clockTransitions.get(node.id);
    if (!transition) {
      transition = { lastToggle: now, phase: false };
      state.clockTransitions.set(node.id, transition);
      state.clockStates.set(node.id, false);
    }
    if (now - transition.lastToggle >= period) {
      const elapsedPeriods = Math.floor((now - transition.lastToggle) / period);
      transition.lastToggle += elapsedPeriods * period;
      if (elapsedPeriods % 2 === 1) transition.phase = !transition.phase;
      state.clockStates.set(node.id, transition.phase);
      changed = true;
    }
  }
  if (changed) renderSimulationFrame();
}

function startClockLoop() {
  if (clockRafId !== null) cancelAnimationFrame(clockRafId);
  const loop = (now) => {
    if (!clockLastFrameTime) clockLastFrameTime = now;
    advanceClockNodes(now);
    clockLastFrameTime = now;
    clockRafId = requestAnimationFrame(loop);
  };
  clockRafId = requestAnimationFrame(loop);
}

function startWireDelayLoop() {
  if (rafId !== null) cancelAnimationFrame(rafId);
  if (state.wireDelay <= 0) return;
  const loop = () => {
    tickWires();
    if (state.wireDelay > 0) {
      rafId = requestAnimationFrame(loop);
    } else {
      rafId = null;
    }
  };
  rafId = requestAnimationFrame(loop);
}
