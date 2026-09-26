// Patachou (Lego System, 31/12/1996) — portage fidèle de PATACHOU.EXE.
// Chaque fonction ci-dessous correspond à une routine de l'exe (offsets dans
// l'objet code PMW1 décompressé). Les tables précalculées (LUT, textures,
// palettes, images décrunchées) ont été produites en exécutant le précalcul
// d'origine (0x9ce) dans un émulateur x86, puis exportées dans assets/vga.bin.
//
// Le programme est écrit comme un générateur : chaque `yield` est une attente
// de retour de balayage vertical (port 3DAh), soit 70.086 Hz.

export const VBL_HZ = 70.086;
// Position du player XM (mesurée) : début de la musique, durée d'une ligne.
export const MUS = { start: 1.049, row: 0.08021 };
// Fréquence de l'IRQ 0 telle que la voit le handler de la démo (chaînée derrière
// le timer dynamique du player Cubic), calibrée sur la cadence du texte.
export const IRQ_HZ = 138.8;

const W = 320, H = 200, SIZE = W * H;

export function createDemo(blob, index, lines) {
  const get = (k) => { const [o, n] = index[k]; return blob.subarray(o, o + n); };
  const PAL = {
    black: get('palBlack'), logo: get('palLogo'), swirl: get('palSwirl'),
    blue: get('palBlue'), white: get('palWhite'),
  };
  const logo = get('logo'), title = get('title');
  const swirlLut = new Uint16Array(get('swirlLut').slice().buffer);
  const texA = get('texA'), texB = get('texB'), sin1 = get('sin1'), sin2 = get('sin2');
  const polarLut = get('polarLut');
  const overlay = get('overlay').slice();          // modifiée par le texte
  const font = get('font'), masks = get('masks');
  const spriteTex = get('spriteTex');
  const wave = new Int16Array(get('wave').slice().buffer);
  const sinI = new Int32Array(get('sinI').slice().buffer);
  const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789?!:,.()/+-*'; ";
  const COLORS = [176, 179, 182, 185, 188, 191, 194];

  // -------------------------------------------------------------- matériel
  const vga = new Uint8Array(SIZE);                // A000:0000
  const dac = new Uint8Array(768);                 // valeurs 6 bits
  const rowOff = new Int32Array(320);              // table word 0x169af0
  for (let r = 0; r < 320; r++) rowOff[r] = (r * 320) & 0xffff;

  // rand() Watcom, srand(0x2001) — une seule séquence pour toute la démo
  let seed = 0x2001;
  const rand = () => {
    seed = (Math.imul(seed, 0x41c64e6d) + 0x3039) >>> 0;
    return (seed >>> 16) & 0x7fff;
  };

  // Fondus palette 0x1f7c / 0x1fd2 : palette courante en 8.8
  const cur = new Int16Array(768), delta = new Int16Array(768), tgt = new Uint8Array(768);
  function fadeSetup(steps, pal) {
    for (let i = 0; i < 768; i++) {
      delta[i] = Math.trunc(((pal[i] - (cur[i] >> 8)) << 8) / steps);
      tgt[i] = pal[i];
    }
  }
  function fadeStep() {
    for (let i = 0; i < 768; i++) {
      const d = delta[i];
      if (d > 0) cur[i] = (cur[i] >> 8) < tgt[i] ? cur[i] + d : tgt[i] << 8;
      if (d < 0) cur[i] = (cur[i] >> 8) > tgt[i] ? cur[i] + d : tgt[i] << 8;
      if (d === 0) cur[i] = tgt[i] << 8;
      dac[i] = (cur[i] >> 8) & 63;
    }
  }
  const setDAC = (pal) => dac.set(pal);

  // -------------------------------------------------------------- horloge
  // t(vbl) : temps musical du n-ième VBL. Le programme démarre 2 s avant la
  // musique (70 VBL d'attente + 70 VBL de fondu du logo).
  let vbl = 0;
  const now = () => MUS.start - 140 / VBL_HZ + vbl / VBL_HZ;
  const musPos = () => {
    const r = Math.max(0, Math.floor((now() - MUS.start) / MUS.row));
    return { order: r >> 6, row: r & 63 };
  };
  const irq = () => Math.max(0, Math.floor((now() - MUS.start) * IRQ_HZ));
  let escape = false;                              // touche Echap (fin)

  // ================================================================ partie 1
  // 0x13f : l'eau. Deux champs de hauteur int32 (stride 320).
  function* water() {
    const hb = [new Int32Array(320 * 202), new Int32Array(320 * 202)];
    // mémoire : image de travail 0x17d69e puis écran 0x18d2a7 (+64009)
    const SCR = 64009;
    const mem = new Uint8Array(SCR + SIZE + 1024);
    mem.set(logo, 0); mem.set(logo, SCR);
    let page = 0, dissolveOn = false, dLeft = 0, dIdx = 45;
    const drop = (x, y, r, h, p) => {
      for (let dy = -r; dy < r; dy++)
        for (let dx = -r; dx < r; dx++)
          if (dx * dx + dy * dy < r * r) hb[p][(y + dy) * 320 + x + dx] = h;
    };
    while (musPos().order < 1) yield;              // 0xbc : attente ordre 1
    for (;;) {
      const { order, row } = musPos();
      if (!dissolveOn && order === 2 && row >= 0x20) { dissolveOn = true; dLeft = 16; }
      if (order < 3) {
        const y = rand() % 120 + 40, x = rand() % 250 + 35;
        drop(x, y, 3, 350, page);
      }
      if (order >= 4) break;
      // 0x29b : rendu (réfraction) puis attente VBL et copie écran
      const h = hb[page];
      for (let y = 2; y < 198; y++) {
        let i = y * 320 + 1;
        for (let x = 1; x < 319; x++, i++) {
          const dx = (h[i] - h[i + 1]) >> 3, dy = (h[i] - h[i + 320]) >> 3;
          const r = y + dy;
          const a = (r >= 0 && r < 320 ? rowOff[r] : 0) + x + dx;
          mem[SCR + i] = a >= 0 && a < mem.length ? mem[a] : 0;
        }
      }
      yield;
      vga.set(mem.subarray(SCR, SCR + SIZE));
      page ^= 1;
      // 0x359 : propagation, amortissement 1/64, clamp à 0
      const dst = hb[page], src = hb[page ^ 1];
      for (let y = 1; y < 199; y++) {
        let i = y * 320 + 1;
        for (let x = 1; x < 319; x++, i++) {
          let n = ((src[i - 320] + src[i + 320] + src[i + 1] + src[i - 1] +
                    src[i - 321] + src[i - 319] + src[i + 319] + src[i + 321]) >> 2) - dst[i];
          n -= n >> 6;
          dst[i] = n < 0 ? 0 : n;
        }
      }
      // 0x32 : fondu tramé vers le titre, 4000 pixels par frame
      if (dLeft) {
        for (let k = 0; k < 4000; k++) { mem[dIdx] = title[dIdx]; dIdx = (dIdx + 0x45f) % 64000; }
        dLeft--;
      }
    }
    // sortie : couleurs 0-127 remises à zéro, fondu vers la palette du tourbillon
    cur.fill(0, 0, 384);
    fadeSetup(25, PAL.swirl);
  }

  // ================================================================ partie 2
  // 0x16a3 / 0x1509 : tourbillon (LUT + deux textures) sous le titre
  function* swirl() {
    const buf = new Uint8Array(SIZE);
    let fadeIn = 25, out = -1;
    for (;;) {
      if (out === 0) break;
      if (musPos().order >= 6 && out === -1) { fadeSetup(20, PAL.white); out = 20; }
      // phases de l'IRQ (un pas tous les 2 ticks)
      const s = irq() >> 1;
      const b2 = s & 255, b3 = -s & 255, b4 = s & 255, b5 = -s & 255;
      const b6 = -s & 255, b7 = s & 255, b8 = -2 * s & 255, b9 = s & 255;
      const offA = ((sin1[b3] + b6) << 8) + sin2[b2] + b7;
      const offB = (((b4 - sin1[b9]) & 255) << 8) + ((b5 - sin2[b8]) & 255);
      for (let i = 0; i < SIZE; i++) {
        const L = swirlLut[i];
        buf[i] = (texA[(L + offA) & 0xffff] + texB[(L + offB) & 0xffff]) >> 1;
      }
      for (let i = 0; i < SIZE; i++) if (title[i]) buf[i] = title[i];
      yield;
      if (fadeIn > 0) { fadeStep(); fadeIn--; }
      if (out > 0) { fadeStep(); out--; }
      vga.set(buf);
    }
  }

  // ================================================================ partie 3
  // 0x124c : feu projeté en polaire + moteur de texte
  function* text() {
    const buf = new Uint8Array(SIZE);
    const fire = new Uint8Array(65536 + 1024);     // 0x1592e0
    vga.fill(0);
    fadeSetup(20, PAL.blue);
    let fadeIn = 20, out = -1, hold = 0, textOn = false, flag = false;
    // état du texte
    let lineIdx = 0, lineCnt = 0, mode = 0, erase = 0, wait = 0, remaining = 0, ended = false;
    const L = [];                                  // lettres actives (0x12998)
    let ticksDone = null;

    const animate = (l) => {                       // 0x5ad
      if (!l.active) return;
      const c = l.counter;
      const m = c >= 0 ? c * 80 : -1;
      let n = c + 1;
      if (n > 5) { l.active = false; remaining = Math.max(0, remaining - 1); n = 5; }
      l.counter = n;
      if (m < 0) return;
      const col = l.color + 3, f = l.glyph * 80;
      let o = rowOff[l.y] + l.x;
      for (let j = 0; j < 10; j++, o += 320)
        for (let k = 0; k < 8; k++) {
          if (!masks[m + j * 8 + k]) continue;
          const v = font[f + j * 8 + k];
          overlay[o + k] = v ? (col - v) & 255 : 0;
        }
    };
    const layout = () => {                         // 0x7c3
      if (remaining > 0) return;
      const s = lines[lineIdx];
      if (s === undefined) { ended = true; return; }
      if (s.charCodeAt(0) < 0x20) {
        if (s === '\x0c') wait = 0x3c; else if (s === '\x0d') wait = 0x140;
        lineCnt = 0; mode = 0; erase = 11; lineIdx++;
        return;
      }
      L.length = 0;
      const len = s.length;
      remaining = len;
      let x = 0x63 - Math.trunc(len * 9 / 2);
      for (let i = 0; i < len; i++, x += 9) {
        const counter = mode ? ((-i << 24) >> 24) : (((i - (len - 1)) << 24) >> 24);
        const color = COLORS[rand() % 7];
        let g = CHARSET.indexOf(s[i]);
        if (g < 0) g = CHARSET.length - 1;
        L.push({ x: x + 0x75, y: lineCnt * 11 + 0x50, color, glyph: g, counter, active: true });
      }
      if (len > 1) { mode++; if (mode > 1) mode = 0; }
      lineIdx++; lineCnt++;
    };
    const eraseStep = () => {                      // 0x773
      for (let cx = 0x50; cx < 0xb3; cx += 11) {
        const o = rowOff[cx + 10 - (erase - 1)] + 0x75;
        overlay.fill(0, o, o + 0xc6);
      }
      erase--;
    };
    const fireStep = () => {                       // 0x11d2 / 0x1153
      for (let i = 0; i < 0x600; i++) fire[0x8c00 + i] = rand() % 96;
      for (let k = 0; k < 128; k++) {
        const a = rand(), b = rand();
        const idx = (0x10000 - Math.imul(a, b)) & 0xffff;
        if (fire[idx]) fire[idx]--;
        if (fire[idx]) fire[idx]--;
      }
      for (let i = 0; i < 0x8a00; i++) {
        const p = 0x300 + i;
        const c = ((fire[p - 1] + fire[p] + fire[p + 0x101] + fire[p - 0x100]) >> 2) & 255;
        if (c) fire[i] = c;
      }
    };

    for (;;) {
      if (out === 0) break;
      if (ended && out === -1) { hold = 0x50; fadeSetup(20, PAL.white); out = 20; }
      if (musPos().order >= 7 && !textOn) { textOn = true; ticksDone = irq() >> 1; }
      if (textOn) {
        // l'IRQ autorise un pas de texte tous les deux ticks
        const avail = irq() >> 1;
        if (ticksDone < avail) {
          ticksDone++;
          if (!erase) { for (const l of L) animate(l); layout(); }
          else if (wait) wait--;
          else eraseStep();
        }
      }
      if (flag) {
        yield;
        flag = false;
        if (fadeIn > 0) { fadeStep(); fadeIn--; }
        if (hold) hold--;
        else if (out > 0) { fadeStep(); out--; }
        vga.set(buf);
        fireStep();
      } else {
        flag = true;
        const shift = sin2[irq() & 255];
        for (let i = 0, j = 0; i < SIZE; i++, j += 2)
          buf[i] = fire[(polarLut[j + 1] << 8) + ((polarLut[j] + shift) & 255)];
        for (let i = 0; i < SIZE; i++) if (overlay[i]) buf[i] = overlay[i];
      }
    }
  }

  // ================================================================ partie 4
  // 0x1d20 / 0x1b59 : Patachou déformé par deux cisaillements sinusoïdaux
  function* wobble() {
    const buf = new Uint8Array(SIZE);
    fadeSetup(20, PAL.blue);
    let fadeIn = 20, out = -1, flag = false;
    for (;;) {
      if (out === 0) break;
      if (escape && out === -1) { fadeSetup(20, PAL.black); out = 20; }
      yield;
      if (fadeIn > 0) { fadeStep(); fadeIn--; }
      if (out > 0) { fadeStep(); out--; }
      if (flag) {
        flag = false;
        vga.set(buf);
        buf.fill(0);
      } else {
        const n = irq();
        const A = -((3 * n) % 512) >> 1;
        const B = (((7 * n) % 512) >> 1) * 325;
        for (let r = 0; r < 200; r++) {
          const xo = ((sinI[(A + r + 0x1c) & 255] >> 3) + 0x20) << 16 >> 16;
          const base = ((0x1c + r) & 255) << 8;
          const d = r * 320 + xo;
          for (let dx = 0; dx < 256; dx++) {
            const v = (wave[B + dx] + base) & 0xff00;
            const t = spriteTex[v + dx];
            const o = d + dx;
            if (t && o >= 0 && o < SIZE) buf[o] = t;
          }
        }
        flag = true;
      }
    }
  }

  // ================================================================ main
  function* program() {
    setDAC(PAL.black);
    vga.set(logo);
    for (let i = 0; i < 70; i++) yield;
    fadeSetup(70, PAL.logo);
    for (let i = 0; i < 70; i++) { yield; fadeStep(); }
    // la musique démarre ici
    yield* water();
    yield* swirl();
    yield* text();
    yield* wobble();
  }

  const gen = program();
  let done = false;
  return {
    vga, dac,
    get time() { return now(); },
    get done() { return done; },
    escape() { escape = true; },
    // avance le programme jusqu'au temps musical T
    advanceTo(T, maxSteps = 100000) {
      let n = 0;
      while (!done && now() <= T && n++ < maxSteps) {
        vbl++;
        if (gen.next().done) done = true;
      }
    },
  };
}
