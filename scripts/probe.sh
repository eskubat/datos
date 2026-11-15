#!/bin/bash
NAV='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
sudo apt-get install -y -qq poppler-utils >/dev/null 2>&1
echo "=== BOG día"; curl -s -L -m 30 -A "$NAV" 'https://egoitza.gipuzkoa.eus/gao-bog/castell/bog/2026/11/13/bc261113.htm' -o /tmp/g.html; wc -c /tmp/g.html
python3 -c "
import re,html
s=open('/tmp/g.html',encoding='utf8',errors='ignore').read()
t=html.unescape(re.sub(r'<[^>]+>','\n',s)); t=re.sub(r'\n\s*\n+','\n',t)
print(t[:2500])
print('LINKS',[h for h in re.findall(r'href=\"([^\"]+)\"',s)][:15])"
echo "=== BOB sumario"; curl -s -L -m 30 -A "$NAV" 'http://www.bizkaia.eus/lehendakaritza/Bao_bob/Sumario/2026/11/BOB-2026a219s.pdf' -o /tmp/b.pdf; file /tmp/b.pdf; pdftotext -layout /tmp/b.pdf - | head -80
echo "=== BOTHA item"; curl -s -L -m 30 -A "$NAV" 'https://www.araba.eus/botha/Busquedas/Resultado.aspx?File=Boletines/2026/131/2026_131_03265_C.xml&hl=' -o /tmp/a.html; python3 -c "
import re,html
s=open('/tmp/a.html',encoding='utf8',errors='ignore').read()
t=html.unescape(re.sub(r'<[^>]+>','\n',s)); t=re.sub(r'\n\s*\n+','\n',t); print(t[:1500])"
echo "=== BOTHA sumarios previos"; curl -s -L -m 30 -A "$NAV" 'https://www.araba.eus/botha/inicio/SGBO5001.aspx' | grep -o 'href="[^"]*"' | grep -iv 'Resultado' | head -40
echo "=== Vitoria"; curl -s -L -m 30 -A "$NAV" 'https://www.vitoria-gasteiz.org/wb021/was/contenidoAction.do?idioma=es&uid=u1f560f07_14d757ff0f6__7ed7' -o /tmp/v.html; python3 -c "
import re,html
s=open('/tmp/v.html',encoding='utf8',errors='ignore').read()
for h,t in re.findall(r'<a[^>]+href=\"([^\"]+)\"[^>]*>(.*?)</a>',s,re.S):
  t=re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]+>',' ',t))).strip()
  if re.search(r'subvenc|ayuda|beca|premio|convoca',t,re.I): print('  ',t[:100],'|',h[:130])"
