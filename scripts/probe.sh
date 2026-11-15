#!/usr/bin/env bash
set -u
UB="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
curl -sSL -m 60 -A "$UB" "https://opendata.euskadi.eus/scripts/webopd00-apirest-docs.js" | head -c 6000
