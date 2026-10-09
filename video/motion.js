/**
 * AGORA+ product motion piece. Every frame is a pure function of time: `renderAt(t)` sets the
 * whole scene for second `t`, so the renderer can capture exact 60 fps frames with no jitter.
 * Light palette only: paper, cream and butter, with soft pastels for the team.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const W = 1920;
const H = 1080;
const PX = 2.4; // texture pixels per design pixel (100 design px = 1 world unit)

const C = {
  paper: '#fbf8f1', cream: '#f3eee2', line: '#ebe3d2', butter: '#f2cc46', amber: '#e3b230', gold: '#b8901a',
  sage: '#a9c7a2', sky: '#a7c8ea', peach: '#f5b79e', lilac: '#c7b7ea', mint: '#bfe3d0',
  ink: '#2e2a22', soft: '#6f685a', faint: '#a39b8a', white: '#ffffff', green: '#3f9a63',
};
const SANS = '"Schibsted Grotesk", system-ui, sans-serif';
const MONO = '"Spline Sans Mono", ui-monospace, monospace';

// ---------- timing ----------
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeOutBack = (x) => { const c1 = 1.15; const c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const lerp = (a, b, x) => a + (b - a) * x;

export const SCENES = [
  { id: 'intro', start: 0, end: 7 },
  { id: 'problem', start: 7, end: 14, kicker: 'The problem', headline: 'Assistants that forget, stall and guess.', sub: 'Simple household jobs still fail, so people drift to chat apps. AGORA+ answers each complaint.' },
  { id: 'remember', start: 14, end: 23, kicker: 'Memory with receipts', headline: 'Tell it once. It writes it down.', sub: 'Every save returns a receipt that was read back from a file on a server you run.' },
  { id: 'recall', start: 23, end: 31, kicker: 'Recall and briefing', headline: 'Answers from what your family told it.', sub: 'Simple questions skip the model. The morning briefing leads with what matters most.' },
  { id: 'lists', start: 31, end: 39, kicker: 'Lists and reminders', headline: 'Lists for everyone. Reminders that speak up.', sub: 'Items can name who they are for, and reminders are announced the moment they are due.' },
  { id: 'approve', start: 39, end: 48, kicker: 'Ask before acting', headline: 'Nothing starts until a person says yes.', sub: 'The model is never handed the approve button. A plain yes, or a tap, starts the plan.' },
  { id: 'team', start: 48, end: 59, kicker: 'A team, not a chatbot', headline: 'Four agents plan it. Keeper checks it.', sub: 'Agora leads, Scout researches, Planner organises, and Keeper checks the plan against household memory.' },
  { id: 'hub', start: 59, end: 68, kicker: 'One brain, every surface', headline: 'One household server for every assistant.', sub: 'A standard MCP server over Streamable HTTP, with OAuth and PKCE for account linking.' },
  { id: 'trust', start: 68, end: 76, kicker: 'Built to be trusted', headline: 'Your household stays on your disk.', sub: 'A passcode lock, an exact redirect list, a card for smart displays, and receipts you can check.' },
  { id: 'outro', start: 76, end: 83 },
];
export const DURATION = 83;
/** Each scene's cards start this long before its boundary, while the camera is still arriving. */
const LEAD = 0.6;
const SPACING = 19;

// ---------- renderer ----------
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();
scene.background = gradientTexture();
scene.fog = new THREE.Fog(C.paper, 26, 58);
const camera = new THREE.PerspectiveCamera(34, W / H, 0.1, 200);

scene.add(new THREE.HemisphereLight(0xffffff, 0xefe5d0, 1.35));
const sun = new THREE.DirectionalLight(0xfff3df, 1.5);
sun.position.set(6, 12, 9);
scene.add(sun);
scene.add(new THREE.AmbientLight(0xffffff, 0.35));

function gradientTexture() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#fdfbf6');
  grad.addColorStop(0.6, '#f8f3e8');
  grad.addColorStop(1, '#f1ead9');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Ground: a soft dotted floor that fades into the fog.
{
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#f6f1e5';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#e6dcc6';
  g.beginPath(); g.arc(32, 32, 2.2, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(220, 60);
  t.anisotropy = 8;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(440, 120), new THREE.MeshBasicMaterial({ map: t }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(SPACING * 4.5, 0, 0);
  scene.add(floor);
}

// ---------- canvas drawing ----------
function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function font(g, size, weight = 600, family = SANS) { g.font = `${weight} ${size}px ${family}`; }
function text(g, str, x, y, { size = 28, weight = 600, color = C.ink, align = 'left', family = SANS, base = 'alphabetic' } = {}) {
  font(g, size, weight, family);
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = base;
  g.fillText(str, x, y);
}
function wrap(g, str, x, y, maxW, lineH, opts) {
  font(g, opts.size ?? 28, opts.weight ?? 600, opts.family ?? SANS);
  const words = str.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (g.measureText(test).width > maxW && line) {
      text(g, line, x, yy, opts);
      line = word;
      yy += lineH;
    } else line = test;
  }
  if (line) text(g, line, x, yy, opts);
  return yy;
}
function pill(g, x, y, label, { bg = C.cream, fg = C.ink, size = 20, weight = 700, family = SANS, padX = 16, h = 38 } = {}) {
  font(g, size, weight, family);
  const w = g.measureText(label).width + padX * 2;
  g.fillStyle = bg;
  rr(g, x, y, w, h, h / 2);
  g.fill();
  text(g, label, x + padX, y + h / 2 + 1, { size, weight, color: fg, family, base: 'middle' });
  return w;
}
function check(g, x, y, r, color = C.green, fill = '#e6f3ea') {
  g.fillStyle = fill;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = color; g.lineWidth = r * 0.22; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(x - r * 0.42, y + r * 0.02); g.lineTo(x - r * 0.1, y + r * 0.34); g.lineTo(x + r * 0.46, y - r * 0.3); g.stroke();
}
function dot(g, x, y, r, color) { g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
function icon(g, kind, x, y, s, color = C.ink) {
  g.save();
  g.translate(x, y);
  g.strokeStyle = color; g.fillStyle = color; g.lineWidth = s * 0.1; g.lineCap = 'round'; g.lineJoin = 'round';
  if (kind === 'clock') {
    g.beginPath(); g.arc(0, 0, s * 0.45, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -s * 0.26); g.moveTo(0, 0); g.lineTo(s * 0.2, s * 0.08); g.stroke();
  } else if (kind === 'loop') {
    g.beginPath(); g.arc(0, 0, s * 0.4, Math.PI * 0.15, Math.PI * 1.75); g.stroke();
    g.beginPath(); g.moveTo(s * 0.42, -s * 0.36); g.lineTo(s * 0.3, -s * 0.12); g.lineTo(s * 0.52, -s * 0.08); g.stroke();
  } else if (kind === 'fog') {
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-s * 0.42, (i - 1) * s * 0.26); g.lineTo(s * (0.42 - i * 0.12), (i - 1) * s * 0.26); g.stroke(); }
  } else if (kind === 'bell') {
    g.beginPath(); g.moveTo(-s * 0.36, s * 0.22); g.quadraticCurveTo(-s * 0.32, -s * 0.38, 0, -s * 0.4); g.quadraticCurveTo(s * 0.32, -s * 0.38, s * 0.36, s * 0.22); g.closePath(); g.fill();
    dot(g, 0, s * 0.34, s * 0.09, color);
  } else if (kind === 'sun') {
    dot(g, 0, 0, s * 0.2, color);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * s * 0.3, Math.sin(a) * s * 0.3); g.lineTo(Math.cos(a) * s * 0.44, Math.sin(a) * s * 0.44); g.stroke(); }
  } else if (kind === 'lock') {
    rr(g, -s * 0.32, -s * 0.06, s * 0.64, s * 0.46, s * 0.08); g.fill();
    g.beginPath(); g.arc(0, -s * 0.06, s * 0.22, Math.PI, 0); g.stroke();
  } else if (kind === 'mic') {
    rr(g, -s * 0.13, -s * 0.42, s * 0.26, s * 0.5, s * 0.13); g.fill();
    g.beginPath(); g.arc(0, -s * 0.06, s * 0.27, 0.15, Math.PI - 0.15); g.stroke();
    g.beginPath(); g.moveTo(0, s * 0.22); g.lineTo(0, s * 0.38); g.stroke();
  } else if (kind === 'cart') {
    g.beginPath(); g.moveTo(-s * 0.44, -s * 0.3); g.lineTo(-s * 0.3, -s * 0.3); g.lineTo(-s * 0.18, s * 0.16); g.lineTo(s * 0.34, s * 0.16); g.lineTo(s * 0.42, -s * 0.16); g.lineTo(-s * 0.24, -s * 0.16); g.stroke();
    dot(g, -s * 0.12, s * 0.32, s * 0.07, color); dot(g, s * 0.28, s * 0.32, s * 0.07, color);
  } else if (kind === 'screen') {
    rr(g, -s * 0.44, -s * 0.3, s * 0.88, s * 0.54, s * 0.06); g.stroke();
    g.beginPath(); g.moveTo(-s * 0.16, s * 0.38); g.lineTo(s * 0.16, s * 0.38); g.stroke();
  } else if (kind === 'chat') {
    rr(g, -s * 0.42, -s * 0.34, s * 0.84, s * 0.56, s * 0.14); g.stroke();
    g.beginPath(); g.moveTo(-s * 0.14, s * 0.22); g.lineTo(-s * 0.26, s * 0.42); g.lineTo(s * 0.04, s * 0.22); g.stroke();
  } else if (kind === 'plug') {
    g.beginPath(); g.moveTo(-s * 0.14, -s * 0.42); g.lineTo(-s * 0.14, -s * 0.2); g.moveTo(s * 0.14, -s * 0.42); g.lineTo(s * 0.14, -s * 0.2); g.stroke();
    rr(g, -s * 0.3, -s * 0.2, s * 0.6, s * 0.34, s * 0.12); g.fill();
    g.beginPath(); g.moveTo(0, s * 0.14); g.lineTo(0, s * 0.42); g.stroke();
  } else if (kind === 'file') {
    g.beginPath(); g.moveTo(-s * 0.3, -s * 0.42); g.lineTo(s * 0.12, -s * 0.42); g.lineTo(s * 0.3, -s * 0.24); g.lineTo(s * 0.3, s * 0.42); g.lineTo(-s * 0.3, s * 0.42); g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(-s * 0.14, s * 0.0); g.lineTo(s * 0.14, s * 0.0); g.moveTo(-s * 0.14, s * 0.16); g.lineTo(s * 0.1, s * 0.16); g.stroke();
  }
  g.restore();
}

const scratch = document.createElement('canvas').getContext('2d');
/** Width of a line of text in design px, with the fonts the cards use. */
function measure(str, size, weight = 600, family = SANS) {
  font(scratch, size, weight, family);
  return scratch.measureText(str).width;
}

const textures = [];
function canvasTexture(wDesign, hDesign, paint) {
  const c = document.createElement('canvas');
  c.width = Math.round(wDesign * PX);
  c.height = Math.round(hDesign * PX);
  const g = c.getContext('2d');
  g.scale(PX, PX);
  paint(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  textures.push(t);
  return t;
}

/** Cards draw in the order they were made, so a later card always sits on top of an earlier one. */
let layer = 1;

/** A flat floating card. `w`, `h` in world units; `draw(g, cw, ch)` paints in design px (100 per unit). */
const PAD = 40;
function card(w, h, draw, { bg = C.white, border = C.line, radius = 26, shadow = true } = {}) {
  const cw = w * 100;
  const ch = h * 100;
  const tex = canvasTexture(cw + PAD * 2, ch + PAD * 2, (g) => {
    if (shadow) {
      g.save();
      g.shadowColor = 'rgba(80, 66, 30, 0.13)';
      g.shadowBlur = 34;
      g.shadowOffsetY = 14;
      g.fillStyle = bg;
      rr(g, PAD, PAD, cw, ch, radius);
      g.fill();
      g.restore();
    }
    g.fillStyle = bg;
    rr(g, PAD, PAD, cw, ch, radius);
    g.fill();
    if (border) { g.strokeStyle = border; g.lineWidth = 2; rr(g, PAD + 1, PAD + 1, cw - 2, ch - 2, radius - 1); g.stroke(); }
    g.save();
    g.translate(PAD, PAD);
    draw(g, cw, ch);
    g.restore();
  });
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w + (PAD * 2) / 100, h + (PAD * 2) / 100), mat);
  mesh.renderOrder = layer++;
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

/** Transparent label plane (no card background). */
function label(w, h, draw) {
  const tex = canvasTexture(w * 100, h * 100, (g) => draw(g, w * 100, h * 100));
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.renderOrder = layer++;
  group.add(mesh);
  return group;
}

const shadowTex = canvasTexture(256, 256, (g) => {
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(90, 72, 36, 0.32)');
  grad.addColorStop(0.55, 'rgba(90, 72, 36, 0.12)');
  grad.addColorStop(1, 'rgba(90, 72, 36, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
});
function blob(w, d) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, fog: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012;
  return m;
}

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0, transparent: true, ...extra });
}

/** Opacity for a whole object tree, remembering each material's own base opacity. */
function fade(obj, a) {
  obj.visible = a > 0.003;
  if (!obj.visible) return;
  obj.traverse((child) => {
    const mats = child.material ? (Array.isArray(child.material) ? child.material : [child.material]) : [];
    for (const m of mats) {
      if (m.userData.base === undefined) m.userData.base = m.opacity;
      m.opacity = m.userData.base * a;
    }
  });
}

/** Pop an element in: opacity, a small rise and a soft overshoot. Returns the eased progress. */
function pop(obj, t, at, home, { dur = 0.75, rise = 0.35, alpha = 1, out } = {}) {
  const p = seg(t, at, at + dur);
  let a = easeOut(p) * alpha;
  if (out !== undefined) a *= 1 - easeInOut(seg(t, out, out + 0.5));
  const s = lerp(0.9, 1, easeOutBack(p));
  obj.position.set(home.x, home.y - (1 - easeOut(p)) * rise, home.z);
  obj.scale.setScalar(s);
  fade(obj, a);
  return p;
}

// ---------- scene building ----------
const anchors = SCENES.map((_, i) => new THREE.Vector3(i * SPACING, 0, 0));
const groups = SCENES.map((_, i) => { const g = new THREE.Group(); g.position.copy(anchors[i]); scene.add(g); return g; });
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const build = {};
const updates = [];

function speaker({ ringColor = C.butter } = {}) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.86, 0.62, 64), std('#fbf7ee'));
  body.position.y = 0.31;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.78, 0.06, 64), std('#f1eadb'));
  top.position.y = 0.65;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.05, 24, 96), std(ringColor, { emissive: new THREE.Color(ringColor), emissiveIntensity: 0.55 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.69;
  g.add(body, top, ring, blob(2.6, 2.6));
  g.userData.ring = ring;
  const waves = [];
  for (let i = 0; i < 3; i++) {
    const w = new THREE.Mesh(new THREE.RingGeometry(0.66, 0.7, 96), new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    w.rotation.x = -Math.PI / 2;
    w.position.y = 0.7;
    g.add(w);
    waves.push(w);
  }
  g.userData.waves = waves;
  return g;
}
function pulse(device, t, on, alpha = 1) {
  const ring = device.userData.ring;
  ring.material.emissiveIntensity = 0.45 + (on ? 0.35 * (0.5 + 0.5 * Math.sin(t * 6)) : 0);
  device.userData.waves.forEach((w, i) => {
    const phase = ((t * 0.7 + i / 3) % 1);
    w.scale.setScalar(1 + phase * 1.6);
    w.material.opacity = on ? (1 - phase) * 0.35 * alpha : 0;
    w.visible = w.material.opacity > 0.003;
  });
}

function bubble(str) {
  const w = (78 + measure(str, 30, 700) + 40) / 100;
  return card(w, 0.95, (g, cw, ch) => {
    icon(g, 'mic', 42, ch / 2, 34, C.gold);
    text(g, str, 78, ch / 2 + 1, { size: 30, weight: 700, base: 'middle' });
  }, { bg: '#fffaf0', border: '#f1e2b8' });
}

// Intro: a butter ring with household cards orbiting it.
build.intro = () => {
  const g = groups[0];
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.8, 0.11, 48, 220), std(C.butter, { emissive: new THREE.Color(C.butter), emissiveIntensity: 0.35, roughness: 0.4 }));
  ring.position.set(0, 3.15, -2.2);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(4.25, 0.03, 24, 200), std('#f5dc8c'));
  inner.position.copy(ring.position);
  const beads = Array.from({ length: 5 }, () => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 24), std('#ffffff', { emissive: new THREE.Color('#fff3c4'), emissiveIntensity: 0.5 }));
    ring.add(b);
    return b;
  });
  g.add(ring, inner);
  const chips = ['Mia is allergic to peanuts', 'Milk · Eggs · Tortillas', 'Call Grandma · 6 pm', 'Plan dinners · waiting for yes'].map((s, i) => {
    const colors = [C.peach, C.sage, C.sky, C.butter];
    const chip = card((58 + measure(s, 24, 700) + 30) / 100, 0.7, (gg, cw, ch) => {
      dot(gg, 34, ch / 2, 11, colors[i]);
      text(gg, s, 58, ch / 2 + 1, { size: 24, weight: 700, base: 'middle' });
    });
    g.add(chip);
    return chip;
  });
  updates.push((t) => {
    const a = sceneAlpha(0, t);
    const p = easeOut(seg(t, 0.2, 2.2));
    ring.rotation.set(0.92 + Math.sin(t * 0.4) * 0.05, Math.sin(t * 0.3) * 0.06, 0);
    inner.rotation.set(1.0 + Math.sin(t * 0.35) * 0.04, -Math.sin(t * 0.25) * 0.05, 0.05);
    beads.forEach((b, i) => { const u = t * 0.25 + i / beads.length; b.position.set(Math.cos(u * Math.PI * 2) * 4.8, Math.sin(u * Math.PI * 2) * 4.8, 0); });
    ring.scale.setScalar(lerp(0.6, 1, easeOutBack(p)));
    inner.scale.setScalar(lerp(0.6, 1, p));
    fade(ring, a * p);
    fade(inner, a * p * 0.9);
    chips.forEach((chip, i) => {
      const corner = [[-5.4, 2.55], [5.3, 2.35], [-5.0, -2.45], [5.5, -2.3]][i];
      const q = easeOut(seg(t, 1.0 + i * 0.25, 2.2 + i * 0.25));
      const loop = t * 0.6 + i * 1.7;
      chip.position.set(corner[0] + Math.cos(loop) * 0.25, 3.15 + corner[1] + Math.sin(loop) * 0.18, -2.2 + Math.sin(loop * 0.7) * 0.3);
      chip.lookAt(camera.position);
      fade(chip, a * q);
    });
  });
};

// Problem: three complaints flip into three answers.
build.problem = () => {
  const g = groups[1];
  const items = [
    { icon: 'clock', bad: 'Slow replies', badSub: 'Up to 15 s reported in 2025', good: 'Instant fast path', goodSub: 'Simple jobs never wait for a model' },
    { icon: 'loop', bad: 'Jobs stop halfway', badSub: 'Routines that do not finish', good: 'Plan, yes, run, verify', goodSub: 'Each step shown, each write checked' },
    { icon: 'fog', bad: 'Forgets what you said', badSub: 'Family facts slip away', good: 'Memory you can read', goodSub: 'A file you own, with receipts' },
  ];
  const cards = items.map((it, i) => {
    const front = card(5.0, 1.15, (gg, cw, ch) => {
      gg.fillStyle = '#fdebe3'; rr(gg, 22, 22, 70, 70, 20); gg.fill();
      icon(gg, it.icon, 57, 57, 46, '#c8694a');
      text(gg, it.bad, 116, 54, { size: 32, weight: 800 });
      text(gg, it.badSub, 116, 88, { size: 22, weight: 500, color: C.soft });
    });
    const back = card(5.0, 1.15, (gg, cw, ch) => {
      check(gg, 57, 57, 34);
      text(gg, it.good, 116, 54, { size: 32, weight: 800 });
      text(gg, it.goodSub, 116, 88, { size: 22, weight: 500, color: C.soft });
    }, { bg: '#fbfdf9', border: '#d6eadb' });
    back.rotation.y = Math.PI;
    const holder = new THREE.Group();
    holder.add(front, back);
    holder.userData = { front, back };
    g.add(holder);
    return holder;
  });
  updates.push((t) => {
    const a = sceneAlpha(1, t);
    const lt = t - SCENES[1].start + LEAD;
    cards.forEach((holder, i) => {
      const home = V(2.9, 3.75 - i * 1.28, 0);
      pop(holder, lt, 0.5 + i * 0.35, home);
      const flip = easeInOut(seg(lt, 3.6 + i * 0.35, 4.5 + i * 0.35));
      holder.rotation.y = flip * Math.PI + Math.sin(t * 0.6 + i) * 0.03;
      fade(holder.userData.front, a * (flip < 0.5 ? 1 : 0) * easeOut(seg(lt, 0.5 + i * 0.35, 1.2 + i * 0.35)));
      fade(holder.userData.back, a * (flip >= 0.5 ? 1 : 0));
      holder.visible = a > 0.003;
    });
  });
};

// Remember: speaker, utterance, fast path, file on your server, receipt.
build.remember = () => {
  const g = groups[2];
  const dev = speaker();
  g.add(dev);
  const say = bubble('“Remember Mia is allergic to peanuts.”');
  const fast = card(3.7, 0.62, (gg, cw, ch) => {
    pill(gg, 14, 12, 'fast path · no model', { bg: '#fdf3cf', fg: C.gold, size: 20 });
    text(gg, '12 ms', cw - 22, ch / 2 + 1, { size: 24, weight: 800, align: 'right', base: 'middle', family: MONO });
  });
  const server = new THREE.Group();
  const box = new THREE.Mesh(new RoundedBoxGeometry(1.7, 1.05, 1.2, 6, 0.14), std('#fdfbf6'));
  box.position.y = 0.53;
  const stripe = new THREE.Mesh(new RoundedBoxGeometry(1.72, 0.1, 1.22, 4, 0.04), std(C.butter, { emissive: new THREE.Color(C.butter), emissiveIntensity: 0.3 }));
  stripe.position.y = 0.72;
  const tag = label(1.7, 0.36, (gg, cw, ch) => text(gg, 'your server', cw / 2, ch / 2 + 2, { size: 24, weight: 800, align: 'center', base: 'middle', color: C.soft }));
  tag.position.set(0, 0.3, 0.62);
  server.add(box, stripe, tag, blob(3.2, 2.4));
  g.add(server);
  const file = card(4.3, 1.35, (gg, cw, ch) => {
    icon(gg, 'file', 40, 42, 40, C.gold);
    text(gg, 'memory.json', 74, 50, { size: 26, weight: 700, family: MONO });
    text(gg, '"text": "Mia is allergic to peanuts"', 28, 92, { size: 18, weight: 500, family: MONO, color: C.soft });
    text(gg, '"who": "Mia", "tags": ["allergy"]', 28, 120, { size: 18, weight: 500, family: MONO, color: C.soft });
  });
  const receipt = card(3.9, 1.5, (gg, cw, ch) => {
    text(gg, 'RECEIPT', 28, 42, { size: 18, weight: 800, color: C.gold });
    check(gg, cw - 46, 40, 22);
    text(gg, 'remember', 28, 84, { size: 30, weight: 800 });
    pill(gg, 28, 102, 'verified · read back from disk', { bg: '#e6f3ea', fg: C.green, size: 19 });
  });
  g.add(say, fast, file, receipt);
  const dots = Array.from({ length: 10 }, () => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 16), std(C.butter, { emissive: new THREE.Color(C.butter), emissiveIntensity: 0.6 }));
    g.add(m);
    return m;
  });
  const path = new THREE.CatmullRomCurve3([V(3.2, 0.9, 0.6), V(4.0, 1.8, 0.3), V(5.0, 1.8, -0.4), V(5.6, 1.2, -1.1)]);
  updates.push((t) => {
    const a = sceneAlpha(2, t);
    const lt = t - SCENES[2].start + LEAD;
    dev.position.set(3.2, 0, 0.6);
    fade(dev, a);
    pulse(dev, t, lt > 0.4 && lt < 3.2, a);
    pop(say, lt, 0.5, V(1.4, 3.65, 0.2));
    say.position.y += Math.sin(t * 1.2) * 0.03;
    fade(say, a * easeOut(seg(lt, 0.5, 1.2)));
    pop(fast, lt, 2.0, V(-0.6, 2.6, 0.3));
    fade(fast, a * easeOut(seg(lt, 2.0, 2.7)));
    server.position.set(5.6, 0, -1.1);
    server.rotation.y = -0.35 + Math.sin(t * 0.4) * 0.04;
    fade(server, a * easeOut(seg(lt, 1.0, 1.8)));
    pop(file, lt, 4.0, V(3.9, 2.5, -0.2));
    fade(file, a * easeOut(seg(lt, 4.0, 4.7)));
    pop(receipt, lt, 5.3, V(0.0, 1.45, 0.6));
    fade(receipt, a * easeOut(seg(lt, 5.3, 6.0)));
    dots.forEach((d, i) => {
      const run = seg(lt, 2.6, 5.0);
      const u = (run * 1.6 - i * 0.07);
      const on = u > 0 && u < 1;
      d.position.copy(path.getPointAt(clamp01(u)));
      fade(d, on ? a * Math.sin(Math.PI * clamp01(u)) : 0);
    });
  });
};

// Recall and briefing.
build.recall = () => {
  const g = groups[3];
  const q = bubble('“What is Mia allergic to?”');
  const answer = card(4.6, 1.1, (gg, cw, ch) => {
    text(gg, 'Mia is allergic to peanuts.', 28, 52, { size: 32, weight: 800 });
    pill(gg, 28, 66, 'recall · 8 ms · no model', { bg: '#fdf3cf', fg: C.gold, size: 18, h: 32 });
  });
  const brief = card(5.3, 2.35, (gg, cw, ch) => {
    gg.fillStyle = '#fff4d1'; rr(gg, 24, 24, 64, 64, 18); gg.fill();
    icon(gg, 'sun', 56, 56, 46, C.amber);
    text(gg, 'Good morning', 108, 52, { size: 32, weight: 800 });
    text(gg, 'Your briefing', 108, 82, { size: 20, weight: 600, color: C.faint });
    const rows = [['Remember: Mia is allergic to peanuts.', C.peach], ['Reminder: call Grandma at 6 pm.', C.sky], ['Shopping: milk, eggs, tortillas.', C.sage]];
    rows.forEach(([s, col], i) => { dot(gg, 40, 132 + i * 40, 8, col); text(gg, s, 60, 140 + i * 40, { size: 22, weight: i === 0 ? 800 : 600, color: i === 0 ? C.ink : C.soft }); });
  });
  g.add(q, answer, brief);
  updates.push((t) => {
    const a = sceneAlpha(3, t);
    const lt = t - SCENES[3].start + LEAD;
    pop(q, lt, 0.4, V(0.4, 3.85, 0.2));
    fade(q, a * easeOut(seg(lt, 0.4, 1.1)) * (1 - easeInOut(seg(lt, 3.6, 4.2)) * 0.55));
    pop(answer, lt, 1.5, V(-0.7, 2.7, 0.3));
    fade(answer, a * easeOut(seg(lt, 1.5, 2.2)) * (1 - easeInOut(seg(lt, 3.6, 4.2)) * 0.55));
    pop(brief, lt, 3.7, V(3.75, 1.45, 0.3), { rise: 0.5 });
    fade(brief, a * easeOut(seg(lt, 3.7, 4.5)));
  });
};

// Lists and reminders.
build.lists = () => {
  const g = groups[4];
  const items = [['Milk', 'Mia'], ['Eggs', 'Jen'], ['Tortillas', 'Sam']];
  const list = card(3.6, 2.55, (gg, cw, ch) => {
    icon(gg, 'cart', 44, 46, 44, C.green);
    text(gg, 'Shopping', 82, 56, { size: 32, weight: 800 });
    text(gg, '3 items', cw - 26, 56, { size: 20, weight: 600, color: C.faint, align: 'right' });
  });
  const rows = items.map(([name, who]) => card(3.1, 0.58, (gg, cw, ch) => {
    gg.strokeStyle = '#cfe5d5'; gg.lineWidth = 3; rr(gg, 16, ch / 2 - 13, 26, 26, 8); gg.stroke();
    text(gg, name, 58, ch / 2 + 1, { size: 24, weight: 700, base: 'middle' });
    pill(gg, cw - 92, ch / 2 - 15, who, { bg: '#eef3fb', fg: '#4a6f99', size: 17, h: 30, padX: 12 });
  }, { shadow: false, border: '#f0eadc' }));
  const ticks = rows.map(() => label(0.36, 0.36, (gg, cw, ch) => check(gg, cw / 2, ch / 2, 14)));
  const bell = card(3.9, 1.3, (gg, cw, ch) => {
    gg.fillStyle = '#eaf2fb'; rr(gg, 24, 24, 76, 76, 22); gg.fill();
    icon(gg, 'bell', 62, 60, 48, '#5b86b8');
    text(gg, 'Reminder', 122, 56, { size: 20, weight: 800, color: '#5b86b8' });
    text(gg, 'Check the oven', 122, 92, { size: 30, weight: 800 });
  });
  const rings = Array.from({ length: 2 }, () => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.45, 64), new THREE.MeshBasicMaterial({ color: '#a7c8ea', transparent: true, depthWrite: false, fog: false }));
    g.add(m);
    return m;
  });
  const todo = card(4.0, 0.95, (gg, cw, ch) => {
    gg.strokeStyle = '#cfe5d5'; gg.lineWidth = 3; rr(gg, 24, ch / 2 - 13, 26, 26, 8); gg.stroke();
    text(gg, 'Call Grandma', 66, 44, { size: 26, weight: 800 });
    text(gg, 'To-do · 6:00 pm', 66, 72, { size: 18, weight: 600, color: C.faint });
    pill(gg, cw - 86, ch / 2 - 15, 'Jen', { bg: '#eef3fb', fg: '#4a6f99', size: 17, h: 30, padX: 12 });
  });
  g.add(list, ...rows, ...ticks, bell, todo);
  updates.push((t) => {
    const a = sceneAlpha(4, t);
    const lt = t - SCENES[4].start + LEAD;
    const LX = 0.3;
    const LY = 2.4;
    pop(list, lt, 0.4, V(LX, LY, 0));
    list.position.y += Math.sin(t * 0.9) * 0.02;
    fade(list, a * easeOut(seg(lt, 0.4, 1.1)));
    rows.forEach((row, i) => {
      const rh = V(LX, LY + 0.25 - i * 0.68, 0.02);
      pop(row, lt, 1.0 + i * 0.4, rh, { rise: 0.15 });
      row.position.y += Math.sin(t * 0.9) * 0.02;
      fade(row, a * easeOut(seg(lt, 1.0 + i * 0.4, 1.6 + i * 0.4)));
      const tick = ticks[i];
      const tp = easeOutBack(seg(lt, 2.6 + i * 0.35, 3.1 + i * 0.35));
      tick.position.set(LX - 1.235, rh.y + Math.sin(t * 0.9) * 0.02, 0.05);
      tick.scale.setScalar(Math.max(0.001, tp));
      fade(tick, a * clamp01(tp));
    });
    const bp = pop(bell, lt, 3.4, V(4.1, 2.95, 0.3));
    fade(bell, a * easeOut(seg(lt, 3.4, 4.1)));
    bell.rotation.z = bp > 0.5 ? Math.sin(t * 9) * 0.03 * Math.max(0, 1 - seg(lt, 4.2, 5.8)) : 0;
    pop(todo, lt, 5.0, V(4.1, 1.55, 0.5));
    fade(todo, a * easeOut(seg(lt, 5.0, 5.7)));
    rings.forEach((r, i) => {
      const ph = ((lt - 4.0) * 0.8 + i * 0.5) % 1;
      r.position.set(4.1 - 1.33, 3.0, 0.33);
      r.scale.setScalar(1 + Math.max(0, ph) * 1.4);
      r.material.opacity = lt > 4.0 && lt < 6.6 ? (1 - ph) * 0.5 * a : 0;
      r.visible = r.material.opacity > 0.003;
    });
  });
};

// Approve: plan card, approval with a tap, and the rule that the model cannot approve itself.
build.approve = () => {
  const g = groups[5];
  const ask = bubble('“Plan dinners for this week.”');
  const steps = ['Check allergies and preferences', 'Research dinner ideas', 'Draft the week of dinners', 'Build the grocery list', 'Check the list against memory'];
  const plan = card(4.3, 2.9, (gg, cw, ch) => {
    text(gg, 'WAITING FOR APPROVAL', 28, 44, { size: 18, weight: 800, color: C.gold });
    text(gg, '5-step plan', 28, 84, { size: 32, weight: 800 });
    steps.forEach((s, i) => {
      gg.fillStyle = '#fdf3cf'; rr(gg, 28, 106 + i * 34, 26, 26, 8); gg.fill();
      text(gg, String(i + 1), 41, 120 + i * 34, { size: 16, weight: 800, align: 'center', base: 'middle', color: C.gold });
      text(gg, s, 66, 120 + i * 34, { size: 21, weight: 600, base: 'middle', color: C.soft });
    });
  }, { bg: '#fffdf6', border: '#f1e2b8' });
  const buttons = card(4.3, 0.9, (gg, cw, ch) => {
    gg.fillStyle = C.butter; rr(gg, 18, 16, cw / 2 - 26, ch - 32, (ch - 32) / 2); gg.fill();
    text(gg, 'APPROVE', 18 + (cw / 2 - 26) / 2, ch / 2 + 1, { size: 22, weight: 900, align: 'center', base: 'middle' });
    gg.strokeStyle = '#e6dcc6'; gg.lineWidth = 3; rr(gg, cw / 2 + 8, 16, cw / 2 - 26, ch - 32, (ch - 32) / 2); gg.stroke();
    text(gg, 'DECLINE', cw / 2 + 8 + (cw / 2 - 26) / 2, ch / 2 + 1, { size: 22, weight: 900, align: 'center', base: 'middle', color: C.soft });
  }, { bg: '#fffdf6', border: '#f1e2b8' });
  const lock = card(3.6, 0.95, (gg, cw, ch) => {
    gg.fillStyle = '#efeafb'; rr(gg, 18, 16, 62, 62, 18); gg.fill();
    icon(gg, 'lock', 49, 50, 40, '#7d68b8');
    text(gg, 'The model cannot', 98, 44, { size: 22, weight: 700, color: C.soft });
    text(gg, 'approve itself', 98, 74, { size: 26, weight: 800 });
  });
  const tap = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.22, 48), new THREE.MeshBasicMaterial({ color: C.amber, transparent: true, depthWrite: false, fog: false }));
  const yes = bubble('“Yes.”');
  const started = card(4.4, 0.72, (gg, cw, ch) => {
    check(gg, 36, ch / 2, 20);
    text(gg, 'The household team has started.', 66, ch / 2 + 1, { size: 21, weight: 700, base: 'middle' });
  }, { bg: '#fbfdf9', border: '#d6eadb' });
  g.add(ask, plan, buttons, lock, tap, yes, started);
  updates.push((t) => {
    const a = sceneAlpha(5, t);
    const lt = t - SCENES[5].start + LEAD;
    pop(ask, lt, 0.4, V(-0.9, 3.65, 0.2));
    fade(ask, a * easeOut(seg(lt, 0.4, 1.1)) * (1 - easeInOut(seg(lt, 4.6, 5.1))));
    pop(plan, lt, 1.4, V(3.9, 2.4, 0));
    fade(plan, a * easeOut(seg(lt, 1.4, 2.2)));
    pop(buttons, lt, 2.4, V(3.9, 0.55, 0.35));
    fade(buttons, a * easeOut(seg(lt, 2.4, 3.1)));
    pop(lock, lt, 3.3, V(-1.0, 2.45, 0.2));
    fade(lock, a * easeOut(seg(lt, 3.3, 4.0)));
    const tp = seg(lt, 5.2, 6.0);
    tap.position.set(3.9 - 1.045, 0.55, 0.42);
    tap.scale.setScalar(1 + easeOut(tp) * 2.2);
    tap.material.opacity = a * (tp > 0 && tp < 1 ? (1 - tp) * 0.8 : 0);
    tap.visible = tap.material.opacity > 0.003;
    buttons.scale.multiplyScalar(1 - Math.sin(Math.PI * seg(lt, 5.2, 5.5)) * 0.04);
    pop(yes, lt, 5.0, V(0.3, 1.3, 0.5));
    fade(yes, a * easeOut(seg(lt, 5.0, 5.6)));
    pop(started, lt, 6.1, V(-0.7, 3.65, 0.2));
    fade(started, a * easeOut(seg(lt, 6.1, 6.8)));
  });
};

// Team: four characters at a round table; tasks fly out; Keeper's check lights up.
build.team = () => {
  const g = groups[6];
  const table = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.12, 72), std('#fffdf7'));
  top.position.y = 0.78;
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.78, 32), std('#efe6d3'));
  leg.position.y = 0.39;
  table.add(top, leg, blob(4.6, 4.6));
  g.add(table);
  const team = [['Agora', C.butter, 'lead'], ['Scout', C.sky, 'research'], ['Planner', C.sage, 'logistics'], ['Keeper', C.peach, 'memory check']];
  const people = team.map(([name, color, role], i) => {
    const p = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.5, 10, 28), std(color));
    body.position.y = 0.62;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.31, 40, 32), std(new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.35)));
    head.position.y = 1.36;
    const eyeMat = std('#3a352b');
    const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 12), eyeMat);
    const e2 = e1.clone();
    e1.position.set(-0.1, 1.4, 0.28);
    e2.position.set(0.1, 1.4, 0.28);
    const tagCard = card(1.5, 0.6, (gg, cw, ch) => {
      dot(gg, 24, ch / 2, 9, color);
      text(gg, name, 42, 29, { size: 22, weight: 800 });
      text(gg, role, 42, 50, { size: 15, weight: 600, color: C.faint });
    });
    tagCard.position.y = 2.15;
    const prog = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.22, 48, 1, Math.PI / 2, 0.001), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, fog: false }));
    prog.position.y = 1.86;
    p.add(body, head, e1, e2, tagCard, prog, blob(1.4, 1.4));
    p.userData = { head, tagCard, prog, color };
    g.add(p);
    return p;
  });
  const planCard = card(2.4, 0.8, (gg, cw, ch) => {
    text(gg, 'PLAN', 24, 34, { size: 16, weight: 800, color: C.gold });
    text(gg, 'Dinners this week', 24, 62, { size: 22, weight: 800 });
  }, { bg: '#fffdf6', border: '#f1e2b8' });
  const tiles = team.map(([, color]) => card(0.9, 0.42, (gg, cw, ch) => {
    gg.fillStyle = color; rr(gg, 12, 12, cw - 24, ch - 24, 10); gg.fill();
  }, { shadow: false, border: false, bg: '#ffffff' }));
  const keeper = card(4.6, 1.25, (gg, cw, ch) => {
    text(gg, 'KEEPER SAYS', 28, 42, { size: 18, weight: 900, color: '#c8694a' });
    wrap(gg, 'The grocery list is safe for Mia’s peanut allergy.', 28, 78, cw - 60, 32, { size: 27, weight: 800 });
  }, { bg: '#fff7f2', border: '#f7cdb9' });
  g.add(planCard, ...tiles, keeper);
  updates.push((t) => {
    const a = sceneAlpha(6, t);
    const lt = t - SCENES[6].start + LEAD;
    const center = V(2.4, 0, -0.9);
    table.position.copy(center);
    fade(table, a);
    people.forEach((p, i) => {
      const ang = Math.PI * (0.88 - 0.25 * i);
      const pos = V(center.x + Math.cos(ang) * 2.6, 0, center.z - Math.sin(ang) * 1.1);
      const enter = easeOutBack(seg(lt, 0.4 + i * 0.25, 1.2 + i * 0.25));
      p.position.set(pos.x, (1 - Math.min(1, enter)) * -0.5 + Math.sin(t * 2 + i) * 0.03, pos.z);
      p.lookAt(p.position.x * 0.6 + camera.position.x * 0.4, 0, camera.position.z);
      p.userData.head.rotation.y = Math.sin(t * 0.8 + i) * 0.15;
      fade(p, a * clamp01(enter));
      p.userData.tagCard.quaternion.copy(p.quaternion).invert().multiply(camera.quaternion);
      const work = seg(lt, 4.2 + i * 0.2, 7.2 + i * 0.25);
      const prog = p.userData.prog;
      prog.geometry.dispose();
      prog.geometry = new THREE.RingGeometry(0.17, 0.22, 48, 1, Math.PI / 2, Math.max(0.001, work * Math.PI * 2));
      prog.quaternion.copy(p.userData.tagCard.quaternion);
      prog.material.opacity = a * (work > 0 ? 1 : 0) * (1 - easeInOut(seg(lt, 7.6 + i * 0.1, 8.0 + i * 0.1)) * 0.6);
      prog.visible = prog.material.opacity > 0.003;
      const tile = tiles[i];
      const fly = easeInOut(seg(lt, 2.4 + i * 0.25, 3.6 + i * 0.25));
      const from = V(center.x, 3.6, center.z + 0.4);
      const to = V(p.position.x, 1.95, p.position.z);
      tile.position.set(lerp(from.x, to.x, fly), lerp(from.y, to.y, fly) + Math.sin(Math.PI * fly) * 0.6, lerp(from.z, to.z, fly));
      tile.quaternion.copy(camera.quaternion);
      tile.scale.setScalar(lerp(1, 0.5, fly));
      fade(tile, a * (fly > 0 && fly < 1 ? 1 : 0));
    });
    pop(planCard, lt, 1.6, V(center.x, 3.8, center.z + 0.5));
    planCard.quaternion.copy(camera.quaternion);
    fade(planCard, a * easeOut(seg(lt, 1.6, 2.2)) * (1 - easeInOut(seg(lt, 4.0, 4.6))));
    pop(keeper, lt, 7.9, V(center.x + 0.6, 3.6, center.z + 1.5), { rise: 0.4 });
    keeper.quaternion.copy(camera.quaternion);
    fade(keeper, a * easeOut(seg(lt, 7.9, 8.6)));
  });
};

// Hub: one MCP server, every surface around it.
build.hub = () => {
  const g = groups[7];
  const core = new THREE.Group();
  const sphere = new THREE.Mesh(new THREE.IcosahedronGeometry(1.05, 6), std('#fffaf0', { roughness: 0.35 }));
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.05, 24, 140), std(C.butter, { emissive: new THREE.Color(C.butter), emissiveIntensity: 0.5 }));
  const halo2 = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.025, 16, 140), std('#f6e2a0'));
  core.add(sphere, halo, halo2);
  const coreLabel = card(3.7, 0.82, (gg, cw, ch) => {
    text(gg, 'AGORA+ household server', cw / 2, 36, { size: 24, weight: 800, align: 'center' });
    text(gg, 'MCP · Streamable HTTP · OAuth + PKCE', cw / 2, 62, { size: 17, weight: 600, align: 'center', color: C.faint });
  });
  g.add(core, coreLabel);
  const sats = [['Alexa+ add-on', 'plug', C.sky], ['Voice web app', 'mic', C.butter], ['Desktop AI assistants', 'chat', C.sage], ['Any MCP client', 'screen', C.lilac]];
  const satellites = sats.map(([name, ic, color]) => {
    const c = card((84 + measure(name, 22, 800) + 28) / 100, 0.78, (gg, cw, ch) => {
      gg.fillStyle = new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.6).getStyle(); rr(gg, 14, 12, 54, 54, 16); gg.fill();
      icon(gg, ic, 41, 39, 34, C.ink);
      text(gg, name, 84, ch / 2 + 1, { size: 22, weight: 800, base: 'middle' });
    });
    g.add(c);
    return c;
  });
  const beads = sats.map(() => Array.from({ length: 3 }, () => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 16), std(C.amber, { emissive: new THREE.Color(C.amber), emissiveIntensity: 0.6 }));
    g.add(m);
    return m;
  }));
  const lines = sats.map(() => {
    const l = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: '#ecd79c', transparent: true, depthWrite: false, fog: false }));
    g.add(l);
    return l;
  });
  updates.push((t) => {
    const a = sceneAlpha(7, t);
    const lt = t - SCENES[7].start + LEAD;
    const c = V(2.2, 2.3, -0.6);
    const cp = easeOutBack(seg(lt, 0.3, 1.3));
    core.position.copy(c);
    core.scale.setScalar(Math.max(0.001, cp));
    sphere.rotation.y = t * 0.3;
    halo.rotation.set(Math.PI / 2.4, 0, t * 0.6);
    halo2.rotation.set(Math.PI / 1.8, t * 0.2, -t * 0.35);
    fade(core, a * clamp01(cp));
    pop(coreLabel, lt, 1.0, V(c.x, 0.66, c.z + 0.8));
    coreLabel.quaternion.copy(camera.quaternion);
    fade(coreLabel, a * easeOut(seg(lt, 1.0, 1.6)));
    satellites.forEach((s, i) => {
      const ang = [0.55, 2.6, 3.7, 5.75][i];
      const home = V(c.x + Math.cos(ang) * 2.9, c.y + Math.sin(ang) * 1.45 + Math.sin(t * 0.8 + i) * 0.06, c.z + 0.5);
      pop(s, lt, 1.5 + i * 0.3, home, { rise: 0.2 });
      s.scale.multiplyScalar(0.86);
      s.quaternion.copy(camera.quaternion);
      const sa = a * easeOut(seg(lt, 1.5 + i * 0.3, 2.1 + i * 0.3));
      fade(s, sa);
      const mid = home.clone().lerp(c, 0.5).add(V(0, 0.5, 0.4));
      const curve = new THREE.QuadraticBezierCurve3(home, mid, c);
      const draw = easeInOut(seg(lt, 2.0 + i * 0.3, 2.9 + i * 0.3));
      const pts = curve.getPoints(48).slice(0, Math.max(2, Math.round(48 * draw) + 1));
      lines[i].geometry.dispose();
      lines[i].geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.022, 8, false);
      lines[i].material.opacity = sa * 0.9 * (draw > 0 ? 1 : 0);
      lines[i].visible = lines[i].material.opacity > 0.003;
      beads[i].forEach((b, k) => {
        const u = ((lt - 3.0) * 0.45 + k / 3 + i * 0.13) % 1;
        b.position.copy(curve.getPointAt(clamp01(i % 2 === 0 ? u : 1 - u)));
        fade(b, lt > 3.0 ? sa * Math.sin(Math.PI * u) : 0);
      });
    });
  });
};

// Trust: a light smart display showing the household card, and a shield with the guarantees.
build.trust = () => {
  const g = groups[8];
  const display = new THREE.Group();
  const frame = new THREE.Mesh(new RoundedBoxGeometry(3.5, 2.3, 0.22, 6, 0.16), std('#fbf8f1'));
  const screen = label(3.2, 2.0, (gg, cw, ch) => {
    gg.fillStyle = '#fffdf8'; rr(gg, 0, 0, cw, ch, 22); gg.fill();
    text(gg, 'Household', 28, 46, { size: 26, weight: 800 });
    text(gg, '7:45 am', cw - 28, 46, { size: 16, weight: 600, align: 'right', color: C.faint });
    gg.fillStyle = '#fff4ec'; rr(gg, 22, 66, cw - 44, 50, 14); gg.fill();
    dot(gg, 44, 91, 8, C.peach);
    text(gg, 'Mia is allergic to peanuts', 62, 98, { size: 20, weight: 800 });
    [['Milk', 'Mia'], ['Eggs', 'Jen'], ['Call Grandma · 6 pm', 'Jen']].forEach(([s, who], i) => {
      gg.strokeStyle = '#d9e7dc'; gg.lineWidth = 3; rr(gg, 28, 132 + i * 20, 14, 14, 4); gg.stroke();
      text(gg, s, 52, 144 + i * 20, { size: 15, weight: 600, color: C.soft });
      text(gg, who, cw - 28, 144 + i * 20, { size: 14, weight: 700, align: 'right', color: '#4a6f99' });
    });
  });
  screen.position.z = 0.115;
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.18, 48), std('#efe6d3'));
  stand.position.y = -1.32;
  display.add(frame, screen, stand);
  const displayShadow = blob(4.4, 2.2);
  g.add(display, displayShadow);
  const shape = new THREE.Shape();
  shape.moveTo(0, 1.1);
  shape.quadraticCurveTo(0.55, 0.95, 0.9, 0.8);
  shape.quadraticCurveTo(0.95, -0.35, 0, -1.0);
  shape.quadraticCurveTo(-0.95, -0.35, -0.9, 0.8);
  shape.quadraticCurveTo(-0.55, 0.95, 0, 1.1);
  const shield = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.24, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 6, curveSegments: 32 }), std(C.sage, { roughness: 0.45 }));
  const shieldMark = label(1.0, 1.0, (gg, cw, ch) => {
    gg.strokeStyle = '#ffffff'; gg.lineWidth = 12; gg.lineCap = 'round'; gg.lineJoin = 'round';
    gg.beginPath(); gg.moveTo(cw * 0.28, ch * 0.52); gg.lineTo(cw * 0.45, ch * 0.68); gg.lineTo(cw * 0.74, ch * 0.36); gg.stroke();
  });
  shieldMark.position.set(0, 0.02, 0.32);
  const shieldGroup = new THREE.Group();
  shieldGroup.add(shield, shieldMark);
  g.add(shieldGroup);
  const facts = ['Household files on your own disk', 'Passcode lock on every door', 'Exact OAuth redirect list', 'A receipt for every write'];
  const list = card(4.4, 2.25, (gg, cw, ch) => {
    facts.forEach((f, i) => { check(gg, 44, 46 + i * 46, 16); text(gg, f, 72, 54 + i * 46, { size: 21, weight: 700 }); });
  });
  g.add(list);
  updates.push((t) => {
    const a = sceneAlpha(8, t);
    const lt = t - SCENES[8].start + LEAD;
    const dp = easeOut(seg(lt, 0.3, 1.2));
    display.position.set(0.2, 1.95 + (1 - dp) * -0.4, 0);
    display.rotation.y = 0.32 + Math.sin(t * 0.5) * 0.03;
    fade(display, a * dp);
    displayShadow.position.set(0.2, 0.012, 0.1);
    fade(displayShadow, a * dp);
    const sp = easeOutBack(seg(lt, 1.6, 2.6));
    shieldGroup.position.set(5.4, 3.05, -0.6);
    shieldGroup.scale.setScalar(Math.max(0.001, sp) * 0.8);
    shieldGroup.rotation.y = -0.35 + Math.sin(t * 0.7) * 0.12;
    fade(shieldGroup, a * clamp01(sp));
    pop(list, lt, 2.4, V(3.95, 1.4, 0.8));
    fade(list, a * easeOut(seg(lt, 2.4, 3.1)));
  });
};

// Outro: the ring again, closing words in the DOM overlay.
build.outro = () => {
  const g = groups[9];
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.8, 0.11, 48, 220), std(C.butter, { emissive: new THREE.Color(C.butter), emissiveIntensity: 0.35, roughness: 0.4 }));
  ring.position.set(0, 3.15, -2.2);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(4.25, 0.03, 24, 200), std('#f5dc8c'));
  ring2.position.copy(ring.position);
  g.add(ring, ring2);
  updates.push((t) => {
    const a = sceneAlpha(9, t);
    ring.rotation.set(0.84 + Math.sin(t * 0.4) * 0.04, Math.sin(t * 0.3) * 0.06, 0);
    ring2.rotation.set(0.92 + Math.sin(t * 0.35) * 0.04, -Math.sin(t * 0.25) * 0.05, 0.05);
    fade(ring, a);
    fade(ring2, a * 0.9);
  });
};

// ---------- scene timing and camera ----------
function sceneAlpha(i, t) {
  const s = SCENES[i];
  const fin = i === 0 ? 1 : easeInOut(seg(t, s.start - 0.7, s.start + 0.3));
  const fout = i === SCENES.length - 1 ? 1 : 1 - easeInOut(seg(t, s.end - 0.8, s.end + 0.1));
  return fin * fout;
}
function sceneIndex(t) {
  for (let i = 0; i < SCENES.length; i++) if (t < SCENES[i].end) return i;
  return SCENES.length - 1;
}
const CONTENT = { pos: [0.9, 2.75, 11.6], look: [1.6, 1.75, 0] };
const POSES = {
  intro: { pos: [0, 3.55, 13.8], look: [0, 3.2, 0] },
  problem: CONTENT,
  remember: CONTENT,
  recall: CONTENT,
  lists: CONTENT,
  approve: CONTENT,
  team: { pos: [1.4, 4.7, 10.9], look: [2.4, 1.55, -0.8] },
  hub: CONTENT,
  trust: CONTENT,
  outro: { pos: [0, 3.55, 13.8], look: [0, 3.2, 0] },
};
function pose(i, t) {
  const s = SCENES[i];
  const p = POSES[s.id];
  const local = Math.max(0, t - s.start);
  const a = anchors[i];
  const push = Math.min(local, s.end - s.start) * 0.07;
  return {
    pos: V(a.x + p.pos[0] + Math.sin(t * 0.33) * 0.18, a.y + p.pos[1] + Math.sin(t * 0.27) * 0.06, a.z + p.pos[2] - push),
    look: V(a.x + p.look[0], a.y + p.look[1], a.z + p.look[2]),
  };
}
// The camera leaves 1.4 s before a boundary and settles 0.3 s after it, as the first card pops.
const LEAVE = 1.4;
const SETTLE = 0.3;
function cameraAt(t) {
  const i = sceneIndex(t);
  const s = SCENES[i];
  let from = pose(i, t);
  let to = from;
  let x = 0;
  if (i < SCENES.length - 1 && t > s.end - LEAVE) {
    to = pose(i + 1, t);
    x = easeInOut(seg(t, s.end - LEAVE, s.end + SETTLE));
  } else if (i > 0 && t < s.start + SETTLE) {
    from = pose(i - 1, t);
    to = pose(i, t);
    x = easeInOut(seg(t, s.start - LEAVE, s.start + SETTLE));
  }
  const pos = from.pos.clone().lerp(to.pos, x);
  pos.y += Math.sin(Math.PI * x) * 0.9;
  pos.z += Math.sin(Math.PI * x) * 1.2;
  camera.position.copy(pos);
  camera.lookAt(from.look.clone().lerp(to.look, x));
}

// ---------- DOM overlay ----------
const $ = (id) => document.getElementById(id);
const captionEl = $('caption');
const progressEl = $('progress');
const hero = document.createElement('div');
hero.style.cssText = 'position:absolute;left:0;right:0;top:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;';
hero.innerHTML = '<div id="heroTitle" style="font-size:150px;font-weight:900;letter-spacing:-0.03em;line-height:1"></div><div id="heroSub" style="margin-top:24px;font-size:31px;font-weight:600;color:#6f685a;max-width:980px;line-height:1.35"></div><div id="heroFoot" style="margin-top:34px;font-size:20px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#b8901a"></div>';
document.querySelector('.overlay').appendChild(hero);
const contentScenes = SCENES.filter((s) => s.headline);
for (let i = 0; i < contentScenes.length; i++) progressEl.appendChild(Object.assign(document.createElement('b'), { innerHTML: '<span></span>' }));
let shownCaption = '';

function overlayAt(t) {
  const i = sceneIndex(t);
  const s = SCENES[i];
  if (s.headline && shownCaption !== s.id) {
    shownCaption = s.id;
    $('kicker').textContent = s.kicker;
    $('headline').textContent = s.headline;
    $('sub').textContent = s.sub;
  }
  const cin = easeOut(seg(t, s.start + 0.1, s.start + 0.9));
  const cout = 1 - easeInOut(seg(t, s.end - 0.7, s.end - 0.15));
  const ca = s.headline ? cin * cout : 0;
  captionEl.style.opacity = String(ca);
  captionEl.style.transform = `translateY(${(1 - cin) * 26}px)`;
  const subIn = easeOut(seg(t, s.start + 0.35, s.start + 1.15));
  $('sub').style.opacity = String(subIn);
  // Hero for the intro and outro.
  let ha = 0;
  if (s.id === 'intro') {
    ha = easeOut(seg(t, 1.6, 2.8)) * (1 - easeInOut(seg(t, s.end - 0.9, s.end - 0.05)));
    $('heroTitle').textContent = 'AGORA+';
    $('heroSub').textContent = 'The household brain that remembers, asks first, and proves it.';
    $('heroFoot').textContent = 'A step ahead of today’s voice assistants';
  } else if (s.id === 'outro') {
    ha = easeOut(seg(t, s.start + 0.6, s.start + 1.6));
    $('heroTitle').textContent = 'AGORA+';
    $('heroSub').textContent = 'Remembers. Asks first. Proves it.';
    $('heroFoot').textContent = 'Open source · MIT · Amazon Developer Hackathon 2026';
  }
  hero.style.opacity = String(ha);
  hero.style.transform = `translateY(${(1 - ha) * 18}px)`;
  const markA = s.id === 'intro' || s.id === 'outro' ? 1 - ha : 1;
  $('mark').style.opacity = String(markA);
  progressEl.style.opacity = String(markA);
  contentScenes.forEach((cs, k) => {
    const fill = seg(t, cs.start, cs.end);
    progressEl.children[k].firstChild.style.width = `${fill * 100}%`;
  });
}

// ---------- entry points ----------

export function renderAt(t) {
  const time = Math.min(Math.max(t, 0), DURATION - 1e-3);
  cameraAt(time);
  camera.updateMatrixWorld();
  for (const update of updates) update(time);
  overlayAt(time);
  renderer.render(scene, camera);
}

async function fontsReady() {
  try {
    await Promise.all([
      document.fonts.load('800 40px "Schibsted Grotesk"'),
      document.fonts.load('700 40px "Schibsted Grotesk"'),
      document.fonts.load('600 40px "Schibsted Grotesk"'),
      document.fonts.load('500 40px "Schibsted Grotesk"'),
      document.fonts.load('900 40px "Schibsted Grotesk"'),
      document.fonts.load('500 20px "Spline Sans Mono"'),
    ]);
    await document.fonts.ready;
  } catch {
    // System fonts still render.
  }
}

window.DURATION = DURATION;
window.renderAt = renderAt;
window.motionReady = (async () => {
  await fontsReady();
  // Cards are painted once, after the fonts are in, so every frame uses the same textures.
  for (const id of Object.keys(build)) build[id]();
  renderAt(0);
  return true;
})();

// Preview in a normal browser: play in real time and fit the stage to the window.
const params = new URLSearchParams(location.search);
if (!params.has('render')) {
  const stage = document.getElementById('stage');
  const fit = () => { const k = Math.min(innerWidth / W, innerHeight / H); stage.style.transform = `scale(${k})`; };
  addEventListener('resize', fit);
  fit();
  window.motionReady.then(() => {
    const start = performance.now() - (Number(params.get('t')) || 0) * 1000;
    const loop = (now) => { renderAt(((now - start) / 1000) % DURATION); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });
}
