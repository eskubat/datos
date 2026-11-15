// Texto de los PDF de cada convocatoria (documento de la BDNS y bases), con caché por enlace.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { enParalelo } from './comun.js';

const CACHE = path.join('cache', 'pdfs.json');
const UA = 'Mozilla/5.0 (compatible; EskubatBot/0.1; +https://github.com/eskubat/datos)';

function texto(buf) {
  const f = path.join(os.tmpdir(), 'eskubat-' + Math.random().toString(36).slice(2) + '.pdf');
  fs.writeFileSync(f, buf);
  try { return execFileSync('pdftotext', ['-l', '10', '-enc', 'UTF-8', f, '-'], { maxBuffer: 20e6 }).toString('utf8'); }
  catch { return ''; } finally { fs.rmSync(f, { force: true }); }
}
const limpia = (t) => t.replace(/\f/g, '\n').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l && !/^\d+\s*\/\s*\d+$|^p[aá]g(ina)?\.? ?\d+/i.test(l)).join('\n');

// Devuelve {url: texto} para las URLs pedidas (máx. 9.000 caracteres cada una)
export async function textosPdf(urls, log) {
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch {}
  const nuevas = [...new Set(urls)].filter((u) => u && !(u in cache));
  let ok = 0;
  await enParalelo(nuevas.slice(0, 400), 4, async (u) => {
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 40000);
      const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: ctrl.signal });
      clearTimeout(t);
      const buf = Buffer.from(await r.arrayBuffer());
      if (!r.ok || buf.slice(0, 4).toString() !== '%PDF') { cache[u] = ''; return; }
      cache[u] = limpia(texto(buf)).slice(0, 9000);
      if (cache[u]) ok++;
    } catch { /* se reintenta otro día */ }
  });
  fs.mkdirSync('cache', { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  log(`PDF: ${nuevas.length} nuevos, ${ok} con texto (caché: ${Object.keys(cache).length})`);
  return cache;
}
