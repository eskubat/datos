#!/bin/bash
NAV='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
sudo apt-get install -y -qq poppler-utils >/dev/null 2>&1
echo "=== BOTHA sumario 130"; curl -s -L -m 30 -A "$NAV" 'https://www.araba.eus/botha/Boletines/2026/130/2026_130_S_C.pdf' -o /tmp/s.pdf; file /tmp/s.pdf; pdftotext -layout /tmp/s.pdf - | grep -v '^\s*$' | head -60
echo "=== BOG html crudo"; curl -s -L -m 30 -A "$NAV" 'https://egoitza.gipuzkoa.eus/gao-bog/castell/bog/2026/11/13/bc261113.htm' | iconv -f latin1 -t utf8 | grep -n -i -B3 -A12 'AYUNTAMIENTO DE AZKOITIA' | sed -n '20,70p'
echo "=== BOB pdf completo"; curl -s -L -m 60 -A "$NAV" 'http://www.bizkaia.eus/lehendakaritza/Bao_bob/2026/11/BOB-2026a219.pdf' -o /tmp/f.pdf; file /tmp/f.pdf; pdftotext /tmp/f.pdf - | grep -n "II-5912\|cve:" | head -8
