# Génère patachou.html : un seul fichier autonome (assets en base64, vga.js et
# main.js fusionnés en un module inline), qui s'ouvre directement depuis le disque.
import base64, json, pathlib, re

root = pathlib.Path(__file__).parent
html = (root / 'index.html').read_text(encoding='utf-8')
vga = (root / 'vga.js').read_text(encoding='utf-8')
main = (root / 'main.js').read_text(encoding='utf-8')

vga = re.sub(r'^export ', '', vga, flags=re.M)
main = main.replace("import { createDemo } from './vga.js';\n", '')
vga = 'const { createDemo } = (() => {\n' + vga + '\nreturn { createDemo };\n})();\n'
js = main.replace("import * as THREE from 'three';\n", "import * as THREE from 'three';\n" + vga, 1)

assets = {}
for name, mime in (('vga.bin', 'application/octet-stream'), ('music.mp3', 'audio/mpeg')):
    assets[name] = f'data:{mime};base64,' + base64.b64encode((root / 'assets' / name).read_bytes()).decode()
index = (root / 'assets' / 'vga.json').read_text(encoding='utf-8')

inline = f'<script>window.__ASSETS={json.dumps(assets)};window.__VGA_INDEX={index};</script>'
html = html.replace('<!--ASSETS-->', inline)
html = html.replace('<script type="module" src="main.js"></script>', f'<script type="module">\n{js}\n</script>')
out = root / 'patachou.html'
out.write_text(html, encoding='utf-8')
print(out, f'{out.stat().st_size / 1e6:.1f} Mo')
