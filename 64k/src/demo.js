// Patachou 64k — Lego System, 31/12/1996 — portage JavaScript tenant en 64 Ko.
// `D` contient les octets bruts de l'exe (tools/extract.py) : images RLE,
// modules MXM, police, masques. Tout le reste est recalculé au lancement,
// comme le faisait le précalcul d'origine (0x9ce).

const W = 320, H = 200, S = 64000;
const O = { logo: 0, title: 7359, overlay: 21918, mxm1: 35297, mxm2: 59819, font: 66885, masks: 70885 };
const tr = Math.trunc;
const u16 = (a) => D[a] | D[a + 1] << 8;
const u24 = (a) => u16(a) | D[a + 2] << 16;
const u32 = (a) => (u24(a) | D[a + 3] << 24) >>> 0;

// ======================================================================= images
// 0x1eb2 / 0x1e1a : RLE façon PCX, ligne par ligne, palette 6 bits devant
function decrunch(o) {
  const px = new Uint8Array(S + 64);
  let p = o + 776;
  for (let y = 0; y < H; y++) {
    const q = y * W;
    let x = 0;
    while (x < W) {
      const b = D[p++];
      if (b > 191) { const v = D[p++]; for (let n = b & 63; n--;) px[q + x++] = v; }
      else px[q + x++] = b;
    }
  }
  return px.subarray(0, S);
}
const palOf = (o) => D.slice(o + 8, o + 776);
// 0x1079 : dégradé linéaire en virgule fixe 4 bits
function grad(pal, a, r0, g0, b0, e, r1, g1, b1) {
  const n = e - a, dr = tr((r1 - r0) * 16 / n), dg = tr((g1 - g0) * 16 / n), db = tr((b1 - b0) * 16 / n);
  for (let k = 0; a + k <= e; k++) {
    const i = (a + k) * 3;
    pal[i] = r0 + (dr * k >> 4); pal[i + 1] = g0 + (dg * k >> 4); pal[i + 2] = b0 + (db * k >> 4);
  }
  return pal;
}
const logo = decrunch(O.logo), title = decrunch(O.title), overlayImg = decrunch(O.overlay);
const PAL = {
  black: new Uint8Array(768),
  white: new Uint8Array(768).fill(63),
  logo: palOf(O.logo),
  swirl: grad(grad(palOf(O.title), 0, 0, 0, 0, 63, 31, 25, 16), 64, 33, 25, 16, 127, 59, 48, 31),
  blue: grad(grad(palOf(O.overlay), 0, 0, 0, 0, 16, 8, 22, 32), 16, 8, 22, 32, 32, 32, 48, 63),
};

// ======================================================================= précalcul
// tables de sinus (x87 : i * 1.40625° ; troncature)
const sin1 = new Uint8Array(256), sin2 = new Uint8Array(256), sinI = new Int32Array(256), c512 = new Int32Array(256);
for (let i = 0; i < 256; i++) {
  const a = i * 1.40625 * 0.017453292, s = Math.sin(a), c = Math.cos(a);
  sin2[i] = tr(s * 128); sin1[i] = tr(c * 128); sinI[i] = tr(s * 256); c512[i] = tr(c * 512);
}
// table d'ondes de la partie 4 : 256 variantes x 325 colonnes
const wave = new Int16Array(256 * 325);
for (let y = 0; y < 256; y++)
  for (let x = 0; x < 325; x++) wave[y * 325 + x] = (c512[tr(x * 256 / 320 + y) & 255] << 4) & 0xff00;
// LUT polaire (feu) et LUT du tourbillon
const polar = new Uint8Array(S * 2), swirlLut = new Uint16Array(S);
for (let y = 0, i = 0; y < H; y++)
  for (let x = 0; x < W; x++, i++) {
    let X = tr((x * 128 - 20480) / 160);
    const Y = tr((y * 128 - 12800) / 100);
    if (!X && !Y) X = 1;
    const U = tr(Math.atan2(Y, X) * 128 / 3.141592 + 128), a2 = U * 3.515625 * 0.017453;
    const V = Math.floor(tr(-32 * Math.sqrt(X * X + Y * Y) ** 0.35) + 16 * Math.cos(a2) * Math.sin(a2));
    polar[2 * i] = U; polar[2 * i + 1] = (V & 255) >> 1;
    const ny = Math.fround((y - 100) / 100);
    let nx = Math.fround((x - 160) / 160);
    const Vs = tr(256 - 32 * (Math.sqrt(nx * nx + ny * ny) / Math.SQRT2 * 256) ** 0.32);
    if (!nx) nx = Math.fround(1e-8);
    swirlLut[i] = (Vs & 255) << 8 | tr(Math.atan2(ny, nx) * 256 / 6.283184) & 255;
  }
// textures du tourbillon : marche aléatoire (0xfa2, aléa du PIT) puis lissage (0xfe0)
function walk(t, rounds) {
  let di = 0;
  for (let k = 0; k < rounds; k++)
    for (let n = k ? 65536 : 136; n--;) {
      const r = Math.random() * 256 | 0;
      di = (di + (r >> 1 & 1) + (r & 4 ? 0x7e : -0x80)) & 0xffff;
      t[di] += (r >> 3 & 7) * 4;
    }
  return t;
}
function smooth(t) {
  for (let i = 0; i < 65536; i++)
    t[i] = (t[i] + t[(i + 256) & 0xffff] + t[(i + 255) & 0xffff] + t[(i + 513) & 0xffff]) >> 2;
  return t;
}
const texA = smooth(smooth(walk(new Uint8Array(65536), 4)));
const texB = smooth(smooth(walk(new Uint8Array(65536), 3)));
// sprite de Patachou recopié dans une texture 256x256 (partie 4)
const spriteTex = new Uint8Array(65536);
for (let r = 0; r < 136; r++) spriteTex.set(overlayImg.subarray((r + 42) * W + 11, (r + 42) * W + 111), r * 256 + 0x3c4e);
const rowOff = new Int32Array(320);
for (let r = 0; r < 320; r++) rowOff[r] = (r * 320) & 0xffff;

// ======================================================================= musique
// Player MXM : portage de MXMPLAY.ASM (Niklas Beisert / pascal), voix GUS émulées.
const LOG = [
  [32768, 32761, 32753, 32746, 32738, 32731, 32724, 32716, 32709, 32702, 32694, 32687, 32679, 32672, 32665, 32657],
  [32768, 32650, 32532, 32415, 32298, 32182, 32066, 31950, 31835, 31720, 31606, 31492, 31379, 31266, 31153, 31041],
  [32768, 30929, 29193, 27554, 26008, 24548, 23170, 21870, 20643, 19484, 18390, 17358, 16384, 15464, 14596, 13777],
  [11131415, 4417505, 1753088, 695713, 276094, 109568, 43482, 17256, 6848, 2718, 1078, 428, 170, 67, 27, 11]];
function period(x) {                              // getfreq6848
  x += 0x8000;
  let r = LOG[3][x >> 12 & 15];
  r = Math.floor(r * LOG[2][x >> 8 & 15] / 32768);
  r = Math.floor(r * LOG[1][x >> 4 & 15] / 32768);
  return Math.floor(r * LOG[0][x & 15] / 32768);
}
const clampP = (p) => p <= 107 ? 107 : p >= 438272 ? 438272 : p;   // freqrange
const VIB = new Int8Array(256);
[0, 2, 3, 5, 6, 8, 9, 11, 12, 14, 16, 17, 19, 20, 22, 23, 24, 26, 27, 29, 30, 32, 33, 34, 36, 37, 38, 39, 41, 42, 43, 44, 45,
  46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 56, 57, 58, 59, 59, 60, 60, 61, 61, 62, 62, 62, 63, 63, 63, 64, 64, 64, 64, 64]
  .forEach((v, i) => { VIB[i] = v; VIB[128 - i] = v; });
for (let i = 0; i < 128; i++) VIB[128 + i] = -VIB[i];

function Song(o) {
  const s = { o, nord: u32(o + 4), rst: u32(o + 8), nch: u32(o + 12), nins: u32(o + 20), tempo: D[o + 24], bpm: D[o + 25] };
  const st = o + u32(o + 28), n = u32(o + 32);
  s.smp = new Float32Array(n + 2);
  for (let i = 0, a = 0; i < n; i++) { a = (a + D[st + i]) & 255; s.smp[i] = (a << 24 >> 24) / 128; }  // valeurs delta
  return s;
}
const SONGS = [Song(O.mxm1), Song(O.mxm2)];

let SR = 44100, P = null, userVol = 64, fade = null;
const rows = [];                                  // positions (temps, ordre, ligne) pour la synchro
function start(song) {
  P = { s: song, ch: [], tempo: song.tempo, tick: song.tempo - 1, ord: 0, row: 0, jo: 0, jr: 0, pd: 0, ptr: 0, len: 0,
        spt: 0, left: 0, looped: false };
  for (let i = 0; i < song.nch; i++) P.ch.push({ ins: 0, vol: 0, fv: 0, pan: 128, fp: 128, pitch: 0, fpitch: 0, pto: 0, ptv: 0,
    pu: 0, pdn: 0, vsl: 0, vr: 0, vd: 0, vp: 0, arp: [0, 0, 0], ap: 0, cmd: 255, dv: 0, dp: 128, nn: 0, off: 0, on: 0, pos: 0 });
  setBpm(song.bpm);
}
const setBpm = (b) => { P.spt = Math.floor(2983615 / b) * SR / 1193182; };

function playNote(c, note, ins, cmd, dat) {        // PlayNote
  const s = P.s, porta = cmd === 3 || cmd === 5;
  if (ins && ins <= s.nins) c.ins = ins;
  if (!c.ins) return;
  if (note) {
    if (note === 97) return;                      // key off : sans enveloppe, aucun effet
    const n = note - 1;
    if (porta) c.pto = period((n << 8) + c.nn - 12288);
    else {
      const io = s.o + u32(s.o + 0x150 + 4 * (c.ins - 1)), k = D[io + 4 + n];
      if (k >= u32(io)) return;
      const so = io + 256 + 16 * k;
      if (ins) { c.dv = D[so + 10]; c.dp = D[so + 11]; }
      c.nn = u16(so + 12) << 16 >> 16;
      c.pitch = c.fpitch = c.pto = period((n << 8) + c.nn - 12288);
      let off = 0;
      if (cmd === 9) { if (dat) c.off = dat; off = c.off << 8; }
      c.pos = u24(so) + off; c.lp = u24(so + 3); c.en = u24(so + 6); c.loop = D[so + 9] & 8; c.on = 1;
      c.vp = c.ap = 0;
    }
  }
  if (ins) { c.vol = c.fv = c.dv; c.pan = c.fp = c.dp; }
}

function volSlide(c, t0) {                        // dovolsl
  let v = c.vol;
  if (!t0) v = c.vsl & 0xf0 ? Math.min(64, v + (c.vsl >> 4)) : Math.max(0, v - c.vsl);
  c.vol = c.fv = v;
}
function tonePorta(c, t0) {                       // doportanote
  if (t0 || c.pitch === c.pto) return;
  c.pitch = c.fpitch = c.pitch > c.pto ? Math.max(c.pto, c.pitch - c.ptv) : Math.min(c.pto, c.pitch + c.ptv);
}
function vibrato(c, t0) {                         // dovibrato
  c.fpitch = clampP(c.fpitch + (VIB[c.vp] * c.vd >> 3));
  if (!t0) c.vp = (c.vp + c.vr) & 255;
}

function playTick() {                             // PlayTick
  const s = P.s;
  let t0 = 0;
  for (const c of P.ch) { c.fv = c.vol; c.fp = c.pan; c.fpitch = c.pitch; }
  if (++P.tick >= P.tempo) {
    P.tick = 0;
    if (P.pd) P.pd--;
    else {
      t0 = 1;
      P.row++;
      if (P.jo < 0 && P.row >= P.len) { P.jo = P.ord + 1; P.jr = 0; }
      if (P.jo >= 0) {
        if (P.jo >= s.nord) P.jo = s.rst;
        if (P.jo < P.ord) P.looped = true;          // le morceau reboucle : fin de la partie 4
        P.ord = P.jo; P.row = P.jr; P.jo = -1;
        let p = s.o + u32(s.o + 0x350 + 4 * D[s.o + 0x50 + P.ord]);
        P.len = u32(p); p += 4;
        for (let r = P.row; r > 0; r--) {         // saute jusqu'à la ligne demandée
          for (let b; (b = D[p++]);) p += (b & 0x20 ? 2 : 0) + (b & 0x40 ? 1 : 0) + (b & 0x80 ? 2 : 0);
        }
        P.ptr = p;
      }
      let p = P.ptr;
      P.ch.forEach((c, i) => {
        c.cmd = 255;
        if (!D[p] || (D[p] & 31) !== i) return;
        const b = D[p++];
        let note = 0, ins = 0, cmd = 0, dat = 0;
        if (b & 0x20) { note = D[p++]; ins = D[p++]; }
        if (b & 0x40) p++;
        if (b & 0x80) { cmd = D[p++]; dat = D[p++]; }
        playNote(c, note, ins, cmd, dat);
        if (cmd >= 52) return;
        c.cmd = cmd;
        switch (cmd) {                            // proc*
          case 0: if (!dat) c.cmd = 255; c.arp = [0, dat >> 4, dat & 15]; break;
          case 1: if (dat) c.pu = dat << 4; break;
          case 2: if (dat) c.pdn = dat << 4; break;
          case 3: if (dat) c.ptv = dat << 4; break;
          case 4: if (dat & 15) c.vd = (dat & 15) << 2; if (dat & 0xf0) c.vr = (dat & 0xf0) >> 2; break;
          case 5: case 6: case 10: if (dat) c.vsl = dat; break;
          case 11: P.jo = dat; P.jr = 0; break;
          case 12: c.vol = c.fv = Math.min(dat, 64); break;
          case 13: if (P.jo < 0) P.jo = P.ord + 1; P.jr = (dat >> 4) * 10 + (dat & 15); break;
          case 15: if (dat >= 32) setBpm(dat); else if (dat) P.tempo = dat; break;
          case 50: P.pd = dat; break;
        }
      });
      P.ptr = p + 1;
      rows.push([P.time, P.ord, P.row]);
      if (rows.length > 256) rows.splice(0, 128);
    }
  }
  for (const c of P.ch) {                         // do*
    switch (c.cmd) {
      case 0: c.fpitch = clampP(Math.floor(c.fpitch * LOG[2][c.arp[c.ap]] / 32768)); c.ap = (c.ap + 1) % 3; break;
      case 1: if (!t0) c.pitch = c.fpitch = clampP(c.pitch - c.pu); break;
      case 2: if (!t0) c.pitch = c.fpitch = clampP(c.pitch + c.pdn); break;
      case 3: tonePorta(c, t0); break;
      case 4: vibrato(c, t0); break;
      case 5: tonePorta(c, t0); volSlide(c, t0); break;
      case 6: vibrato(c, t0); volSlide(c, t0); break;
      case 10: volSlide(c, t0); break;
    }
    // registres GUS : volume linéaire, fréquence = 94929 x 14 voix / période
    c.amp = Math.floor(Math.floor(c.fv * userVol / 64) * 64 / 32) / 128;
    c.step = (c.fpitch < 100 ? c.fpitch : Math.floor(1329006 / c.fpitch) & ~1) / 1024 * 44100 / SR;
    const pn = c.fp >> 4;
    c.l = Math.min(1, (15 - pn) / 7.5) * c.amp * 0.35; c.r = Math.min(1, pn / 7.5) * c.amp * 0.35;
  }
}

function mix(L, R, t0) {
  for (let i = 0; i < L.length; i++) {
    let l = 0, r = 0;
    if (P) {
      if (fade && fade[1] > 0) userVol = Math.max(0, Math.round(64 * --fade[1] / fade[0]));
      if ((P.left -= 1) <= 0) { P.time = t0 + i / SR; playTick(); P.left += P.spt; }
      const smp = P.s.smp;
      for (const c of P.ch) {
        if (!c.on) continue;
        const k = c.pos | 0, f = c.pos - k, v = smp[k] + (smp[k + 1] - smp[k]) * f;
        l += v * c.l; r += v * c.r;
        c.pos += c.step;
        if (c.pos >= c.en) { if (c.loop && c.en > c.lp) c.pos -= c.en - c.lp; else c.on = 0; }
      }
    }
    L[i] = l; R[i] = r;
  }
}
function musPos(t) {
  for (let i = rows.length; i--;) if (rows[i][0] <= t) return { order: rows[i][1], row: rows[i][2] };
  return { order: 0, row: 0 };
}

// ======================================================================= démo
const VBL = 70.086, IRQ_HZ = 138.8;
const vga = new Uint8Array(S), dac = new Uint8Array(768);
let vbl = 0, musicT = -1, escape = false, seed = 0x2001;
const now = () => vbl / VBL;
const irq = () => musicT < 0 ? 0 : Math.max(0, Math.floor((now() - musicT) * IRQ_HZ));
const pos = () => musPos(now());
const rand = () => ((seed = (Math.imul(seed, 0x41c64e6d) + 0x3039) >>> 0) >>> 16) & 0x7fff;
const cur = new Int16Array(768), delta = new Int16Array(768), tgt = new Uint8Array(768);
function fadeSetup(n, pal) {                      // 0x1f7c
  for (let i = 0; i < 768; i++) { delta[i] = tr(((pal[i] - (cur[i] >> 8)) << 8) / n); tgt[i] = pal[i]; }
}
function fadeStep() {                             // 0x1fd2
  for (let i = 0; i < 768; i++) {
    const d = delta[i];
    if (d > 0) cur[i] = (cur[i] >> 8) < tgt[i] ? cur[i] + d : tgt[i] << 8;
    if (d < 0) cur[i] = (cur[i] >> 8) > tgt[i] ? cur[i] + d : tgt[i] << 8;
    if (!d) cur[i] = tgt[i] << 8;
    dac[i] = cur[i] >> 8 & 63;
  }
}

function* water() {                               // 0xbc / 0x13f
  const hb = [new Int32Array(320 * 202), new Int32Array(320 * 202)], SCR = 64009;
  const mem = new Uint8Array(SCR + S + 1024);
  mem.set(logo); mem.set(logo, SCR);
  let page = 0, on = 0, left = 0, di = 45;
  while (pos().order < 1) yield;
  for (;;) {
    const { order, row } = pos();
    if (!on && order === 2 && row >= 32) { on = 1; left = 16; }
    if (order < 3) {
      const y = rand() % 120 + 40, x = rand() % 250 + 35;
      for (let dy = -3; dy < 3; dy++) for (let dx = -3; dx < 3; dx++) if (dx * dx + dy * dy < 9) hb[page][(y + dy) * 320 + x + dx] = 350;
    }
    if (order >= 4) break;
    const h = hb[page];
    for (let y = 2; y < 198; y++)
      for (let x = 1, i = y * 320 + 1; x < 319; x++, i++) {
        const r = y + ((h[i] - h[i + 320]) >> 3), a = (r >= 0 && r < 320 ? rowOff[r] : 0) + x + ((h[i] - h[i + 1]) >> 3);
        mem[SCR + i] = a >= 0 && a < mem.length ? mem[a] : 0;
      }
    yield;
    vga.set(mem.subarray(SCR, SCR + S));
    page ^= 1;
    const d = hb[page], s = hb[page ^ 1];
    for (let y = 1; y < 199; y++)
      for (let x = 1, i = y * 320 + 1; x < 319; x++, i++) {
        let n = ((s[i - 320] + s[i + 320] + s[i + 1] + s[i - 1] + s[i - 321] + s[i - 319] + s[i + 319] + s[i + 321]) >> 2) - d[i];
        n -= n >> 6;
        d[i] = n < 0 ? 0 : n;
      }
    if (left) { for (let k = 0; k < 4000; k++) { mem[di] = title[di]; di = (di + 0x45f) % S; } left--; }
  }
  cur.fill(0, 0, 384);                            // memset de 0x300 octets : le titre reste allumé
  fadeSetup(25, PAL.swirl);
}

function* swirl() {                               // 0x16a3 / 0x1509
  const buf = new Uint8Array(S);
  let fin = 25, out = -1;
  while (out) {
    if (pos().order >= 6 && out < 0) { fadeSetup(20, PAL.white); out = 20; }
    const s = irq() >> 1, b = (k) => k & 255;
    const offA = ((sin1[b(-s)] + b(-s)) << 8) + sin2[b(s)] + b(s);
    const offB = (b(s - sin1[b(s)]) << 8) + b(-s - sin2[b(-2 * s)]);
    for (let i = 0; i < S; i++) {
      const L = swirlLut[i];
      buf[i] = title[i] || (texA[(L + offA) & 0xffff] + texB[(L + offB) & 0xffff]) >> 1;
    }
    yield;
    if (fin > 0) { fadeStep(); fin--; }
    if (out > 0) { fadeStep(); out--; }
    vga.set(buf);
  }
}

const LINES = ('AFTER| |A LONG TIME| |OF| |SLEEPING|\f|* LEGO SYSTEM *|COMES BACK|IN YOUR DREAMS| |FOR THE BEST ...|' +
  '... AND THE WORST|\f|WE WISH YOU| |A| |HAPPY NEW YEAR|FOR 1997| |\f| |LEGO MEMBERS| |EUREKA :  GFX + 3D |' +
  'POLLUX : GFX + CODE|SHAMAN :  GFX + 3D |PUZNIK :    CODE   |ELLER  :   DESIGN  |\f| | |THE CREDITS| | |FOR THIS|' +
  'LITTLE INTRO|\f| |CODE ......... PUZNIK|GFX .......... EUREKA|    ........... ELLER|SFX ............. DOH|' +
  '    .......... JOGEIR| |:) :) :) :) :)|\f| |AND NOW| |THE GREETS| | |(NO SPECIAL ORDER)|\f| |PULSE|LIVE!|KLOON|' +
  'ORANGE|FLOWER CORPS|\f| |ZULL DESING|IMPACT STUDIO|EDENA|ACID DREAM|SKYTECK, HAPPY ? :)|\f| |JAMM|TOADSTOOD|' +
  'LITHIUM|ECLIPSE|HEMOROIDS|\f|PUZNIK GREETS| |GANDALF / PULSE|Z / KLOON|HAPLO / LIVE!|KARL / NOON|BARTI / NOON|' +
  'ZEB / ORANGE|\f| | | |ROUDOUDOU / FLC|PHAR / FLC / EDENA|TUO / STG|\f|WAIT FOR OUR NEXT|PRODUCTION| | |RAVIOLI| |' +
  'STAY STUNNED').split('|');
const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789?!:,.()/+-*'; ";

function* text() {                                // 0x124c : feu polaire + scroller
  const buf = new Uint8Array(S), fire = new Uint8Array(66560), ov = overlayImg.slice();
  vga.fill(0);
  fadeSetup(20, PAL.blue);
  let fin = 20, out = -1, hold = 0, on = 0, flag = 0, done = 0;
  let li = 0, lc = 0, mode = 0, erase = 0, wait = 0, rem = 0, ended = 0;
  const L = [];
  for (;;) {
    if (!out) break;
    if (ended && out < 0) { hold = 80; fadeSetup(20, PAL.white); out = 20; }
    if (pos().order >= 7 && !on) { on = 1; done = irq() >> 1; }
    if (on && done < irq() >> 1) {
      done++;
      if (erase) {
        if (wait) wait--;
        else {                                    // 0x773 : effacement haut -> bas
          for (let cx = 80; cx < 179; cx += 11) { const o = rowOff[cx + 11 - erase] + 117; ov.fill(0, o, o + 198); }
          erase--;
        }
      } else {
        for (const l of L) {                      // 0x5ad : apparition par masques
          if (!l.a) continue;
          const c = l.c, m = c * 80;
          if (++l.c > 5) { l.a = 0; rem = Math.max(0, rem - 1); l.c = 5; }
          if (c < 0) continue;
          for (let j = 0, o = rowOff[l.y] + l.x; j < 10; j++, o += 320)
            for (let k = 0; k < 8; k++)
              if (D[O.masks + m + j * 8 + k]) { const v = D[O.font + l.g * 80 + j * 8 + k]; ov[o + k] = v ? l.col + 3 - v : 0; }
        }
        if (rem <= 0) {                           // 0x7c3 : ligne suivante
          const s = LINES[li];
          if (s === undefined) ended = 1;
          else if (s < ' ') { wait = 60; lc = mode = 0; erase = 11; li++; }
          else {
            L.length = 0;
            rem = s.length;
            for (let i = 0, x = 99 - tr(s.length * 9 / 2); i < s.length; i++, x += 9)
              L.push({ x: x + 117, y: lc * 11 + 80, col: 176 + 3 * (rand() % 7), g: CHARSET.indexOf(s[i]), a: 1,
                c: mode ? -i : i - s.length + 1 });
            if (s.length > 1) mode ^= 1;
            li++; lc++;
          }
        }
      }
    }
    if (flag) {
      yield;
      flag = 0;
      if (fin > 0) { fadeStep(); fin--; }
      if (hold) hold--; else if (out > 0) { fadeStep(); out--; }
      vga.set(buf);
      // 0x11d2 / 0x1153 : le feu
      for (let i = 0; i < 1536; i++) fire[0x8c00 + i] = rand() % 96;
      for (let k = 0; k < 128; k++) {
        const i = (0x10000 - Math.imul(rand(), rand())) & 0xffff;
        if (fire[i]) fire[i]--;
        if (fire[i]) fire[i]--;
      }
      for (let i = 0; i < 0x8a00; i++) {
        const c = (fire[i + 767] + fire[i + 768] + fire[i + 1025] + fire[i + 512]) >> 2;
        if (c) fire[i] = c;
      }
    } else {
      flag = 1;
      const sh = sin2[irq() & 255];
      for (let i = 0; i < S; i++) buf[i] = ov[i] || fire[(polar[2 * i + 1] << 8) + ((polar[2 * i] + sh) & 255)];
    }
  }
}

function* wobble() {                              // 0x1d20 / 0x1b59
  const buf = new Uint8Array(S);
  fadeSetup(20, PAL.blue);
  let fin = 20, out = -1, flag = 0;
  while (out) {
    if ((escape || P.looped) && out < 0) { fadeSetup(20, PAL.black); out = 20; }
    yield;
    if (fin > 0) { fadeStep(); fin--; }
    if (out > 0) { fadeStep(); out--; }
    if (flag) { flag = 0; vga.set(buf); buf.fill(0); }
    else {
      flag = 1;
      const n = irq(), A = -((3 * n) % 512) >> 1, B = ((7 * n) % 512 >> 1) * 325;
      for (let r = 0; r < 200; r++) {
        const d = r * 320 + ((sinI[(A + r + 28) & 255] >> 3) + 32), base = ((28 + r) & 255) << 8;
        for (let dx = 0; dx < 256; dx++) {
          const t = spriteTex[((wave[B + dx] + base) & 0xff00) + dx];
          if (t && d + dx >= 0 && d + dx < S) buf[d + dx] = t;
        }
      }
    }
  }
}

function* musicFade() {                           // 0x17d9 : 0,5 s de fondu sonore
  fade = [SR / 2, SR / 2];
  for (let i = 0; i < 35; i++) yield;
  fade = null; userVol = 64;
}

function* program() {                             // main()
  dac.set(PAL.black);
  vga.set(logo);
  for (let i = 0; i < 70; i++) yield;
  fadeSetup(70, PAL.logo);
  for (let i = 0; i < 70; i++) { yield; fadeStep(); }
  start(SONGS[0]); musicT = now();
  yield* water();
  yield* swirl();
  yield* text();
  yield* musicFade();
  start(SONGS[1]);
  yield* wobble();
  yield* musicFade();
}

// ======================================================================= affichage
const cv = document.getElementById('c'), g = cv.getContext('2d'), im = g.createImageData(W, H);
const pre = document.getElementById('t');
function fit() {
  const w = Math.min(innerWidth, innerHeight * 4 / 3);
  cv.style.width = w + 'px'; cv.style.height = w * 3 / 4 + 'px';
}
function present() {
  const p = im.data;
  for (let i = 0, o = 0; i < S; i++, o += 4) {
    const c = vga[i] * 3;
    p[o] = dac[c] << 2 | dac[c] >> 4; p[o + 1] = dac[c + 1] << 2 | dac[c + 1] >> 4; p[o + 2] = dac[c + 2] << 2 | dac[c + 2] >> 4; p[o + 3] = 255;
  }
  g.putImageData(im, 0, 0);
}
let ac, t0, gen, node;
function frame() {
  const T = ac.currentTime - t0;
  while (vbl < T * VBL) {
    vbl++;
    if (gen.next().done) {
      node.disconnect(); cv.style.display = 'none';
      pre.textContent = '(c) 1996 Lego System\n\nCode by Puznik\nGFX  by Eureka,Pollux & Shaman\nSFX  by Doh / Cryptoburners\n' +
        '    and Jogeir / Noiseless\n\nAdditional Artwork by Eller / Toadstood Corp.\n\nC:\\>';
      pre.style.display = 'block';
      return;
    }
  }
  present();
  requestAnimationFrame(frame);
}
function launch() {
  if (ac) return;
  ac = new AudioContext();
  SR = ac.sampleRate;
  node = ac.createScriptProcessor(2048, 0, 2);
  node.onaudioprocess = (e) => {
    const ob = e.outputBuffer;
    mix(ob.getChannelData(0), ob.getChannelData(1), e.playbackTime - t0);
  };
  node.connect(ac.destination);
  t0 = ac.currentTime + 0.1;
  gen = program();
  pre.style.display = 'none'; cv.style.display = 'block';
  fit();
  requestAnimationFrame(frame);
}
onresize = fit;
onkeydown = (e) => {
  if (e.key === 'Escape') escape = true;
  else if (e.key === 'f') document.documentElement.requestFullscreen();
  else launch();
};
onclick = launch;
