# Extrait de PATACHOU.EXE (PMODE/W, format PMW1 compressé) les données brutes
# utilisées par la version 64k : les trois images RLE (palette incluse), les
# deux modules MXM, la police et les masques de lettres. Rien n'est recalculé
# ici : ce sont les octets de l'objet de données d'origine.
import pathlib, struct, sys

def decode(src, expected):
    """Port de DECODE.ASM (PMODE/W) : LZ à fenêtre 4 Ko, bits lus par dword."""
    s = 0
    out = bytearray()
    bits = 0
    left = 0

    def getbit():
        nonlocal s, bits, left
        left -= 1
        if left < 0:
            bits = struct.unpack_from('<I', src, s)[0]
            s += 4
            left = 31
        b = bits >> 31
        bits = (bits << 1) & 0xFFFFFFFF
        return b

    def copy(dist, n):
        for _ in range(n):
            out.append(out[-dist])

    out.append(src[s]); s += 1
    while len(out) < expected:
        if not getbit():
            out.append(src[s]); s += 1
            continue
        bl = src[s]; s += 1
        bh = 0
        if getbit():
            if getbit():
                for _ in range((1 + getbit()) << 1):
                    bh = ((bh << 1) | getbit()) & 0xFF
            n = None
            dh = 2
            for _ in range(4):
                dh += 1
                if getbit():
                    n = dh
                    break
            if n is None:
                if getbit():
                    n = src[s] + 15; s += 1
                else:
                    dh = 0
                    for _ in range(3):
                        dh = (dh << 1) | getbit()
                    n = dh + 7
            copy(((bh << 8) | bl) + 1, n)
        elif getbit():
            for _ in range(3):
                bh = ((bh << 1) | getbit()) & 0xFF
            copy(((bh << 8) | bl) + 1, 2)
        else:
            if bl == 0:
                break
            copy(bl, 2)
    return bytes(out)


def objects(exe):
    b = exe[exe.find(b'PMW1'):]
    flags = struct.unpack_from('<H', b, 6)[0]
    _, _, _, _, ot, on, _, do = struct.unpack_from('<8I', b, 8)
    pos = do
    objs = []
    for i in range(on):
        _, asz, _, _, _, usz = struct.unpack_from('<6I', b, ot + 24 * i)
        raw = b[pos:pos + asz]
        pos += asz
        objs.append(decode(raw, usz) if flags & 1 else raw)
    return objs


# offsets dans l'objet 2 (données), relevés dans le code de l'exe
PARTS = [
    ('logo',    0x0072c, 0x023eb),   # RLE 320x200 + palette (0x1eb2)
    ('title',   0x02414, 0x05cf3),
    ('overlay', 0x05d5f, 0x091a2),
    ('mxm1',    0x0920d, 0x0f1d7),   # module des parties 1 à 3
    ('mxm2',    0x0f1d7, 0x10d71),   # module de la partie 4
    ('font',    0x10d71, 0x11d11),   # 50 glyphes 8x10, teintes 1..3
    ('masks',   0x11d2c, 0x11f0c),   # 6 masques d'apparition 8x10
]

if __name__ == '__main__':
    root = pathlib.Path(__file__).parent
    exe = (root / 'PATACHOU.EXE').read_bytes()
    data = objects(exe)[1]
    blob = bytearray()
    offsets = {}
    for name, a, e in PARTS:
        offsets[name] = len(blob)
        blob += data[a:e]
    (root.parent / 'build').mkdir(exist_ok=True)
    (root.parent / 'build' / 'data.bin').write_bytes(blob)
    print(len(blob), 'octets', offsets)
    sys.stdout.flush()
