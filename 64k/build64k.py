# Construit patachou64k.html : UN fichier, 64 Ko maximum, images, musique et
# code compris. Chaîne : extraction des données de l'exe -> minification du JS
# (terser) -> [taille JS sur 3 octets][JS][données] -> deflate (zopfli) ->
# base64 dans un petit chargeur qui décompresse avec DecompressionStream.
import base64, pathlib, subprocess, sys
import zopfli.zlib

LIMIT = 65536
root = pathlib.Path(__file__).parent
build = root / 'build'
build.mkdir(exist_ok=True)

subprocess.run([sys.executable, str(root / 'tools' / 'extract.py')], check=True)
data = (build / 'data.bin').read_bytes()

terser = sys.argv[1] if len(sys.argv) > 1 else 'terser'
subprocess.run([terser, str(root / 'src' / 'demo.js'), '-c', 'passes=3,unsafe_math=true', '-m', '--toplevel',
                '-o', str(build / 'demo.min.js')], check=True, shell=(sys.platform == 'win32'))
js = (build / 'demo.min.js').read_bytes()

payload = len(js).to_bytes(3, 'little') + js + data
packed = zopfli.zlib.compress(payload, numiterations=60)[2:-4]   # flux zlib -> deflate brut
b64 = base64.b64encode(packed).decode()

html = ('<!doctype html><meta charset=utf-8><title>Patachou</title>'
        '<body style="margin:0;background:#000;color:#aaa;font:18px monospace;display:grid;place-items:center;height:100vh;overflow:hidden">'
        '<canvas id=c width=320 height=200 style="display:none;image-rendering:pixelated"></canvas>'
        '<pre id=t>C:\\&gt;PATACHOU.EXE\n\u25a0 PaTaChOu (c) 1996 Lego System\n\n'
        '  [ clic ou touche : lancer ]   F : plein \u00e9cran   \u00c9chap : fin</pre>'
        '<script>fetch("data:;base64,' + b64 + '").then(r=>new Response(r.body.pipeThrough(new DecompressionStream("deflate-raw")))'
        '.arrayBuffer()).then(b=>{b=new Uint8Array(b);let n=b[0]|b[1]<<8|b[2]<<16;'
        'Function("D",new TextDecoder().decode(b.subarray(3,n+3)))(b.subarray(n+3))})</script>')
out = root / 'patachou64k.html'
out.write_text(html, encoding='utf-8')
size = out.stat().st_size
print(f'JS minifié {len(js)} o, données {len(data)} o, deflate {len(packed)} o -> {out.name} : {size} octets '
      f'({size / LIMIT:.1%} de 64 Ko)')
if size > LIMIT:
    sys.exit('TROP GROS : dépasse 64 Ko')
