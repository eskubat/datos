#!/usr/bin/env bash
U="Mozilla/5.0 (compatible; EskubatBot/0.1; +https://github.com/eskubat/datos)"
for id in 1541619 1520330; do
curl -sS -A "$U" -o /tmp/$id.pdf "https://www.infosubvenciones.es/bdnstrans/api/convocatorias/documentos?vpd=GE&idDocumento=$id"
echo "== $id"; pdfinfo /tmp/$id.pdf 2>&1 | head -8; pdffonts /tmp/$id.pdf 2>&1 | head -5; pdftotext -l 2 /tmp/$id.pdf - 2>&1 | head -c 500; echo
done
which tesseract || echo "sin tesseract"
