#!/bin/bash
# Sondeo: Funding & Tenders Portal (Comisión Europea), búsqueda pública SEDIA
U='https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=***&pageSize=5&pageNumber=1'
Q='{"bool":{"must":[{"terms":{"type":["1","2","8"]}},{"terms":{"status":["31094501","31094502"]}}]}}'
echo "== POST con query (abiertas / próximas)"
curl -s -m 40 -X POST "$U" -F "query=$Q;type=application/json" -F 'languages=["en"];type=application/json' -F 'sort={"field":"sortStatus","order":"ASC"};type=application/json' | head -c 4000; echo
echo "== total"
curl -s -m 40 -X POST "${U/pageSize=5/pageSize=1}" -F "query=$Q;type=application/json" -F 'languages=["en"];type=application/json' | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("totalResults"));r=d["results"][0];print(json.dumps(r.get("metadata",{}),ensure_ascii=False)[:3000])'
echo "== búsqueda por texto MSCA"
curl -s -m 40 -X POST "${U/text=\*\*\*/text=Researchers%20Night}" -F "query=$Q;type=application/json" -F 'languages=["en"];type=application/json' | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("totalResults"));[print(r.get("summary") or r.get("content","")[:100], "|", (r.get("metadata",{}).get("identifier") or [""])[0], "|", (r.get("metadata",{}).get("deadlineDate") or [""])[0]) for r in d["results"][:5]]'
