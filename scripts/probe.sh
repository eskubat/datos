#!/bin/bash
U='https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=***&pageSize=3&pageNumber=1'
for T in 1 2 8; do for S in 31094501 31094502; do
Q="{\"bool\":{\"must\":[{\"terms\":{\"type\":[\"$T\"]}},{\"terms\":{\"status\":[\"$S\"]}}]}}"
curl -s -m 40 -X POST "$U" -F "query=$Q;type=application/json" -F 'languages=["en"];type=application/json' | python3 -c "
import sys,json;d=json.load(sys.stdin);print('type $T status $S total',d.get('totalResults'))
for r in d['results'][:2]:
  m=r.get('metadata',{});print('  ',r.get('summary'),'|',r.get('url'));print('   keys',sorted(m.keys())[:80])
  for k in ['identifier','title','callTitle','deadlineDate','startDate','frameworkProgramme','typesOfAction','programmePeriod','callIdentifier','destinationDescription','keywords','budgetOverview']:
    v=m.get(k);print('   ',k,'=',(json.dumps(v,ensure_ascii=False)[:300] if v else None))
"
done; done
