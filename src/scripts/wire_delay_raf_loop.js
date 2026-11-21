/* ============================================================ WIRE DELAY RAF LOOP */
let rafId = null;
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
