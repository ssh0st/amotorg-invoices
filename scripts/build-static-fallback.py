"""Only for offline smoke-test and included _site fallback; production build remains npm run build / Eleventy."""
from pathlib import Path
import shutil,re,html
root=Path(__file__).resolve().parent.parent
source=(root/'src/index.njk').read_text(encoding='utf-8')
fields={}
match=re.match(r'^---\n(.*?)\n---\n',source,re.S)
if match:
  for line in match.group(1).splitlines():
    if ':' in line:
      k,v=line.split(':',1); fields[k.strip()]=v.strip()
  source=source[match.end():]
layout=(root/'src/_includes/layout.njk').read_text(encoding='utf-8')
layout=layout.replace('{{ content | safe }}',source)
for k,v in fields.items(): layout=layout.replace('{{ '+k+' | escape }}',html.escape(v))
out=root/'_site'
out.mkdir(exist_ok=True)
(out/'index.html').write_text(layout,encoding='utf-8')
shutil.copytree(root/'src/assets',out/'assets',dirs_exist_ok=True)
print('Offline smoke-test copy built:',out)
