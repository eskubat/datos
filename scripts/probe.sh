#!/usr/bin/env bash
set -u
for m in openai/gpt-4o-mini openai/gpt-4.1-mini; do
echo "== $m"
curl -sS -m 60 -D /tmp/h.txt https://models.github.ai/inference/chat/completions \
  -H "Authorization: Bearer $GITHUB_TOKEN" -H "Content-Type: application/json" \
  -d "{\"model\":\"$m\",\"messages\":[{\"role\":\"user\",\"content\":\"Responde solo: hola\"}],\"max_tokens\":10}" | head -c 600; echo
grep -i "ratelimit\|x-ratelimit\|HTTP/" /tmp/h.txt
done
