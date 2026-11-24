/* ============================================================ CONSTANTS */
const WORLD_WIDTH = 6000;
const WORLD_HEIGHT = 4500;
const NODE_WIDTH = 140;
const NODE_WIDTH_CUSTOM = 180;
const NODE_WIDTH_TERMINAL = 110;
const HEADER_HEIGHT = 34;
const TERMINAL_HEADER_HEIGHT = 26;
const PIN_HEIGHT = 28;
const PIN_RADIUS = 7;
const TERMINAL_PIN_Y = TERMINAL_HEADER_HEIGHT + 14;

const APP_CONFIG = {
  secretPassword: '4780',
  secretSettingsDelayMs: 5000,
  secretUnlockClicks: 5,
};

function nodeWidth(node) {
  if (node.kind === 'CUSTOM') return NODE_WIDTH_CUSTOM;
  if (node.kind === 'INPUT' || node.kind === 'OUTPUT') return NODE_WIDTH_TERMINAL;
  return NODE_WIDTH;
}
function nodeHeight(node) {
  if (node.kind === 'INPUT' || node.kind === 'OUTPUT') {
    return TERMINAL_HEADER_HEIGHT + 28 + 22;
  }
  const pins = Math.max(node.inputs.length, node.outputs.length, 1);
  return HEADER_HEIGHT + pins * PIN_HEIGHT + 8;
}
function inputPinPos(node, pinIndex) {
  if (node.kind === 'OUTPUT') {
    return { x: node.position.x, y: node.position.y + TERMINAL_PIN_Y };
  }
  return { x: node.position.x, y: node.position.y + HEADER_HEIGHT + pinIndex * PIN_HEIGHT + PIN_HEIGHT / 2 };
}
function outputPinPos(node, pinIndex) {
  if (node.kind === 'INPUT') {
    return { x: node.position.x + nodeWidth(node), y: node.position.y + TERMINAL_PIN_Y };
  }
  return { x: node.position.x + nodeWidth(node), y: node.position.y + HEADER_HEIGHT + pinIndex * PIN_HEIGHT + PIN_HEIGHT / 2 };
}
function wirePath(from, to, fromNodeId, toNodeId) {
  const dx = Math.abs(to.x - from.x);
  const offset = Math.max(40, dx * 0.35);
  const fromNode = fromNodeId ? state.nodes.find(node => node.id === fromNodeId) : null;
  const toNode = toNodeId ? state.nodes.find(node => node.id === toNodeId) : null;

  let c1x;
  if (fromNode && fromNode.kind === 'WIRE_REVERSE') {
    c1x = from.x - offset;
  } else if (fromNode) {
    c1x = from.x + offset;
  } else {
    c1x = to.x >= from.x ? from.x + offset : from.x - offset;
  }

  let c2x;
  if (toNode && toNode.kind === 'WIRE_REVERSE') {
    c2x = to.x + offset;
  } else if (toNode) {
    c2x = to.x - offset;
  } else {
    c2x = to.x >= from.x ? to.x - offset : to.x + offset;
  }
  return `M ${from.x},${from.y} C ${c1x},${from.y} ${c2x},${to.y} ${to.x},${to.y}`;
}
