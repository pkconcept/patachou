// Patachou — Lego System, 31/12/1996 (intro 64k, MS-DOS / GUS)
// Affichage three.js du framebuffer VGA produit par vga.js (portage de l'exe).
import * as THREE from 'three';
import { createDemo } from './vga.js';

const ASSETS = window.__ASSETS || {};
const url = (n) => ASSETS[n] || 'assets/' + n;
THREE.ColorManagement.enabled = false;

// ---------------------------------------------------------------- données
async function inflate(buf) {
  const ds = new DecompressionStream('deflate');
  const out = new Blob([buf]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(out).arrayBuffer());
}
const [blob, index] = await Promise.all([
  fetch(url('vga.bin')).then((r) => r.arrayBuffer()).then(inflate),
  window.__VGA_INDEX || fetch(url('vga.json')).then((r) => r.json()),
]);
// Table de lignes du scroller (pointeurs 0x11f0c de l'exe)
const LINES = ['AFTER', ' ', 'A LONG TIME', ' ', 'OF', ' ', 'SLEEPING', '\x0c',
  '* LEGO SYSTEM *', 'COMES BACK', 'IN YOUR DREAMS', ' ', 'FOR THE BEST ...', '... AND THE WORST', '\x0c',
  'WE WISH YOU', ' ', 'A', ' ', 'HAPPY NEW YEAR', 'FOR 1997', ' ', '\x0c',
  ' ', 'LEGO MEMBERS', ' ', 'EUREKA :  GFX + 3D ', 'POLLUX : GFX + CODE', 'SHAMAN :  GFX + 3D ',
  'PUZNIK :    CODE   ', 'ELLER  :   DESIGN  ', '\x0c',
  ' ', ' ', 'THE CREDITS', ' ', ' ', 'FOR THIS', 'LITTLE INTRO', '\x0c',
  ' ', 'CODE ......... PUZNIK', 'GFX .......... EUREKA', '    ........... ELLER',
  'SFX ............. DOH', '    .......... JOGEIR', ' ', ':) :) :) :) :)', '\x0c',
  ' ', 'AND NOW', ' ', 'THE GREETS', ' ', ' ', '(NO SPECIAL ORDER)', '\x0c',
  ' ', 'PULSE', 'LIVE!', 'KLOON', 'ORANGE', 'FLOWER CORPS', '\x0c',
  ' ', 'ZULL DESING', 'IMPACT STUDIO', 'EDENA', 'ACID DREAM', 'SKYTECK, HAPPY ? :)', '\x0c',
  ' ', 'JAMM', 'TOADSTOOD', 'LITHIUM', 'ECLIPSE', 'HEMOROIDS', '\x0c',
  'PUZNIK GREETS', ' ', 'GANDALF / PULSE', 'Z / KLOON', 'HAPLO / LIVE!', 'KARL / NOON',
  'BARTI / NOON', 'ZEB / ORANGE', '\x0c',
  ' ', ' ', ' ', 'ROUDOUDOU / FLC', 'PHAR / FLC / EDENA', 'TUO / STG', '\x0c',
  'WAIT FOR OUR NEXT', 'PRODUCTION', ' ', ' ', 'RAVIOLI', ' ', 'STAY STUNNED'];

// ---------------------------------------------------------------- affichage
const W = 320, H = 200;
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
document.body.prepend(renderer.domElement);
const rgba = new Uint8Array(W * H * 4);
const screenTex = new THREE.DataTexture(rgba, W, H, THREE.RGBAFormat);
screenTex.flipY = true;
screenTex.magFilter = screenTex.minFilter = THREE.NearestFilter;

// Mode cathodique optionnel (touche C) : scanlines + légère courbure
const screenMat = new THREE.ShaderMaterial({
  uniforms: { map: { value: screenTex }, crt: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
  fragmentShader: `
    uniform sampler2D map; uniform float crt; varying vec2 vUv;
    void main(){
      vec2 uv = vUv;
      if (crt > .5) {
        vec2 c = uv - .5; uv = .5 + c * (1. + .06 * dot(c, c));
        if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) { gl_FragColor = vec4(0., 0., 0., 1.); return; }
      }
      vec3 col = texture2D(map, uv).rgb;
      if (crt > .5) col *= (.72 + .28 * sin(uv.y * 200. * 6.2831853)) * 1.18;
      gl_FragColor = vec4(col, 1.);
    }`,
});
const scene = new THREE.Scene();
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), screenMat));

function resize() {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight, false);
}
function present(demo) {
  const { vga, dac } = demo;
  for (let i = 0, o = 0; i < W * H; i++, o += 4) {
    const c = vga[i] * 3;
    const r = dac[c], g = dac[c + 1], b = dac[c + 2];
    rgba[o] = (r << 2) | (r >> 4); rgba[o + 1] = (g << 2) | (g >> 4); rgba[o + 2] = (b << 2) | (b >> 4); rgba[o + 3] = 255;
  }
  screenTex.needsUpdate = true;
  // le mode 13h s'affichait en 4:3 sur les moniteurs de l'époque
  const s = Math.min(innerWidth / 4, innerHeight / 3);
  const w = Math.round(4 * s), h = Math.round(3 * s);
  renderer.setViewport(0, 0, innerWidth, innerHeight);
  renderer.setClearColor(0, 1);
  renderer.clear();
  renderer.setViewport((innerWidth - w) >> 1, (innerHeight - h) >> 1, w, h);
  renderer.render(scene, cam);
}

// ---------------------------------------------------------------- audio
let actx, music, t0 = 0, playing = false, src = null;
async function loadMusic() {
  actx = new (window.AudioContext || window.webkitAudioContext)();
  const buf = await (await fetch(url('music.mp3'))).arrayBuffer();
  music = await actx.decodeAudioData(buf);
}

// ---------------------------------------------------------------- écran DOS
const dos = document.getElementById('dos');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function dosIdle(extra = '') {
  dos.style.display = 'block';
  dos.innerHTML = `${extra}C:\\><span class="cur">_</span>\n\n<span class="hint">   [ cliquez ou appuyez sur une touche pour lancer PATACHOU.EXE ]\n\n` +
    '   pendant la démo :  F = plein écran   C = écran cathodique   Échap = quitter</span>';
}
async function dosBoot(loading) {
  let txt = '';
  const put = (s) => { txt += s; dos.textContent = txt; };
  put('C:\\>');
  for (const ch of 'PATACHOU.EXE') { put(ch); await sleep(45); }
  put('\n■ PaTaChOu (c) 1996 Lego System\n\n');
  for (const l of ['Making some precalcs :)', 'LookUp Tables', 'Decrunching...', 'Making Textures']) {
    await sleep(260);
    put(' ≡ ' + l + '\n');
  }
  await loading;
  await sleep(200);
  dos.style.display = 'none';
}
// Texte affiché par l'exe en sortie (chaînes 0x470..0x4eb)
const END_TEXT = '(c) 1996 Lego System\n\nCode by Puznik\nGFX  by Eureka,Pollux & Shaman\n' +
  'SFX  by Doh / Cryptoburners\n    and Jogeir / Noiseless\n\nAdditional Artwork by Eller / Toadstood Corp.\n\n';

// ---------------------------------------------------------------- boucle
const params = new URLSearchParams(location.search);
const startAt = +(params.get('t') || 0);
const freeze = params.get('freeze');
let demo = null, busy = false;

function stop() {
  playing = false;
  if (src) { try { src.stop(); } catch { /* déjà arrêté */ } src = null; }
  renderer.setClearColor(0, 1);
  renderer.clear();
  dosIdle(END_TEXT);
}

function loop() {
  requestAnimationFrame(loop);
  if (!playing) return;
  const T = actx.currentTime - t0 + startAt;
  // la partie 4 tourne jusqu'à Echap : on l'envoie à la fin de la musique
  if (T >= music.duration - 0.35) demo.escape();
  demo.advanceTo(T);
  if (demo.done) { stop(); return; }
  present(demo);
}

async function launch() {
  if (busy || playing) return;
  busy = true;
  const loading = music ? Promise.resolve() : loadMusic();
  await dosBoot(loading);
  if (actx.state === 'suspended') await actx.resume();
  demo = createDemo(blob, index, LINES);
  if (startAt) demo.advanceTo(startAt);
  resize();
  src = actx.createBufferSource();
  src.buffer = music;
  src.connect(actx.destination);
  t0 = actx.currentTime + 0.05;
  src.start(t0, startAt);
  playing = true;
  busy = false;
}

addEventListener('resize', resize);
addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); return; }
  if (e.key === 'c' || e.key === 'C') { screenMat.uniforms.crt.value ^= 1; return; }
  if (e.key === 'Escape' && playing) { demo.escape(); return; }
  launch();
});
dos.addEventListener('click', launch);
resize();

if (freeze !== null) {
  // débogage : ?freeze=T affiche l'état du programme au temps musical T
  dos.style.display = 'none';
  demo = createDemo(blob, index, LINES);
  demo.advanceTo(+freeze);
  const draw = () => { requestAnimationFrame(draw); present(demo); };
  draw();
} else {
  dosIdle();
  loop();
  if (params.has('autostart')) launch();
}
