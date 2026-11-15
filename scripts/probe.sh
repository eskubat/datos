#!/usr/bin/env bash
set -u
for url in https://models.github.ai/inference/chat/completions https://models.inference.ai.azure.com/chat/completions; do
echo "== $url"
curl -sS -m 60 -D /tmp/h.txt "$url" \
  -H "Authorization: Bearer $GITHUB_TOKEN" -H "Content-Type: application/json" -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" \
  -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"Di hola en JSON {\"x\":\"hola\"}"}],"max_tokens":20}' | head -c 800; echo
head -20 /tmp/h.txt
done
echo "== catalog"; curl -sS -m 30 -H "Authorization: Bearer $GITHUB_TOKEN" https://models.github.ai/catalog/models | head -c 400; echo
