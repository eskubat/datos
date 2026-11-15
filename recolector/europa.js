// Convocatorias europeas abiertas y próximas: Funding & Tenders Portal (Comisión Europea), búsqueda pública SEDIA.
// No se publican todas en la app (son cientos y muy técnicas): sirven para cotejar las noticias de ayudas europeas
// y para que la tarea programada añada las que correspondan. Se guardan en cache/europa.json.
import fs from 'node:fs';
import path from 'node:path';

const API = 'https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=***';
const ESTADOS = { 31094501: 'proxima', 31094502: 'abierta' };
const uno = (v) => (Array.isArray(v) ? v[0] : v) || '';
const dia = (v) => String(uno(v)).slice(0, 10) || null;

async function pagina(tipo, estado, n) {
  const fd = new FormData();
  fd.append('query', new Blob([JSON.stringify({ bool: { must: [{ terms: { type: [String(tipo)] } }, { terms: { status: [String(estado)] } }] } })], { type: 'application/json' }));
  fd.append('languages', new Blob(['["en"]'], { type: 'application/json' }));
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 60000);
  try {
    const r = await fetch(`${API}&pageSize=100&pageNumber=${n}`, { method: 'POST', body: fd, signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

export async function convocatoriasUE(log = console.log) {
  const out = [];
  // 1 = topics de programas de la UE (Horizon Europe, LIFE, Erasmus+, Europa Creativa, CEF, Digital…)
  // 8 = convocatorias en cascada (terceros que reparten fondos europeos a pymes, startups…)
  for (const tipo of [1, 8]) {
    for (const est of Object.keys(ESTADOS)) {
      for (let n = 1; n <= 15; n++) {
        let d;
        try { d = await pagina(tipo, est, n); } catch (e) { log(`UE: tipo ${tipo} ${ESTADOS[est]} p${n}: ${e.message}`); break; }
        for (const r of d.results || []) {
          const m = r.metadata || {};
          const fines = (m.deadlineDate || []).map((x) => String(x).slice(0, 10)).sort();
          out.push({
            id: uno(m.identifier) || r.reference,
            titulo: uno(m.title) || r.summary || '',
            convocatoria: uno(m.callTitle) || '',
            programa: uno(m.typesOfAction) || '',
            url: r.url,
            inicio: dia(m.startDate),
            fin: fines.find((f) => f >= new Date().toISOString().slice(0, 10)) || fines[fines.length - 1] || null,
            estado: ESTADOS[est],
            cascada: tipo === 8,
          });
        }
        if (!d.results || d.results.length < 100) break;
      }
    }
  }
  const vistos = new Set();
  const lista = out.filter((x) => x.id && !vistos.has(x.id + x.convocatoria) && vistos.add(x.id + x.convocatoria));
  if (lista.length) fs.writeFileSync(path.join('cache', 'europa.json'), JSON.stringify(lista));
  log(`UE (Funding & Tenders): ${lista.length} convocatorias abiertas o próximas`);
  return lista;
}
