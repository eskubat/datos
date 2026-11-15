// Resúmenes de cada ayuda escritos por la tarea programada de Claude (ver docs/RESUMIR.md),
// verificados contra la documentación oficial (ficha + enlaces).
// - Se reescriben: título claro, en qué consiste, cuánto se puede recibir, quién puede pedirla y requisitos
//   (agrupados por tipo de solicitante cuando cambian según quién la pida).
// - Fechas, plazo, organismo, ámbito y enlaces NO se tocan: salen de los datos estructurados.
// - Toda cifra escrita tiene que aparecer en la documentación; si no, esa frase se descarta.
// - Caché por huella del texto: solo se vuelve a resumir si la documentación cambia.
import crypto from 'node:crypto';

const VERSION = 'v2';
const TIPOS = ['particular', 'autonomo', 'empresa', 'asociacion', 'ayuntamiento'];
export const huella = (t) => crypto.createHash('sha1').update(VERSION + ':' + String(t || '')).digest('hex').slice(0, 16);

// Números de un texto, normalizados ("1.500" -> "1500", "25,5" -> "25.5")
function numeros(t) {
  return [...String(t || '').matchAll(/\d[\d.]*(?:,\d+)?/g)]
    .map((m) => m[0].replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.').replace(/\.$/, ''))
    .filter((n) => n.replace(/\D/g, '').length >= 1);
}
// Una frase es válida si todas sus cifras están en la fuente (se ignoran cifras de 1 dígito)
const cifrasOk = (frase, nums) => numeros(frase).every((n) => n.length < 2 || nums.has(n));
const limpia = (x) => String(x || '').replace(/\s+/g, ' ').trim();
const GENERICO = /hacienda|seguridad social|sanci[oó]n|sancionad|para[ií]so fiscal|poder de representaci[oó]n|plan de igualdad|reintegro|obligaciones tributarias|art[ií]culo 13|ley 38\/2003/i;
const PRESUPUESTO = /presupuesto (total|global)|cr[eé]dito total|dotaci[oó]n (total|global|presupuestaria)|importe total de la convocatoria/i;

// Acepta lista de frases o lista de grupos {para, items}; devuelve grupos validados
function grupos(v, nums, { maxGrupos = 6, maxItems = 8, filtro = () => true } = {}) {
  const arr = Array.isArray(v) ? v : [];
  const gs = arr.some((x) => x && typeof x === 'object') ? arr : [{ para: '', items: arr }];
  return gs.slice(0, maxGrupos).map((g) => ({
    para: cifrasOk(limpia(g && g.para), nums) ? limpia(g && g.para).replace(/[:.]\s*$/, '') : '',
    items: (Array.isArray(g && g.items) ? g.items : []).map(limpia)
      .filter((x) => x && x.length < 450 && cifrasOk(x, nums) && filtro(x)).slice(0, maxItems),
  })).filter((g) => g.items.length);
}
// Grupos -> líneas para la app. Los encabezados de grupo van con "## " (la app los pinta como subtítulo)
export function aLineas(gs, todas = 'Todas las solicitudes') {
  if (!gs || !gs.length) return [];
  if (gs.length === 1 && (!gs[0].para || /^(tod[oa]s|eskaera guztiak|guztiak)/i.test(gs[0].para))) return gs[0].items;
  return gs.flatMap((g) => [g.para ? '## ' + g.para.charAt(0).toUpperCase() + g.para.slice(1) : '## ' + todas, ...g.items]);
}

export function validar(r, fuente) {
  const nums = new Set(numeros(fuente));
  const out = {};
  const tit = (x) => { const t = limpia(x); return t && t.length <= 140 && cifrasOk(t, nums) && t !== t.toUpperCase() ? t.charAt(0).toUpperCase() + t.slice(1) : ''; };
  const parrafo = (x) => { const t = String(x || '').split(/\n+/).map(limpia).filter((l) => l && cifrasOk(l, nums)).join('\n'); return t; };
  for (const sfx of ['', '_eu']) {
    out['titulo' + sfx] = tit(r['titulo' + sfx]);
    out['queEs' + sfx] = parrafo(r['queEs' + sfx]);
    out['cuantia' + sfx] = grupos(r['cuantia' + sfx], nums, { filtro: (x) => !PRESUPUESTO.test(x) });
    out['quien' + sfx] = grupos(r['quien' + sfx], nums, { maxItems: 10 });
    out['requisitos' + sfx] = grupos(r['requisitos' + sfx], nums, { filtro: (x) => sfx || !GENERICO.test(x) });
  }
  out.resumenCompleto = String(r.resumenCompleto || '').trim().slice(0, 8000);
  out.tipos = (Array.isArray(r.tipos) ? r.tipos : []).filter((x) => TIPOS.includes(x));
  return out;
}

// Aplica los resúmenes válidos a las ayudas publicadas
export function aplicar(ayudas, fuentes, cache) {
  let n = 0;
  for (const a of ayudas) {
    const c = cache[a.id];
    if (!c || !fuentes[a.id] || c.h !== huella(fuentes[a.id])) continue;
    const r = c.r;
    if (r.titulo) { if (!a.tituloOficial) a.tituloOficial = a.titulo; a.titulo = r.titulo; }
    if (r.queEs) a.resumen = r.queEs;
    const cu = aLineas(r.cuantia), qu = aLineas(r.quien), rq = aLineas(r.requisitos);
    if (cu.length) a.cuantia = cu.join('\n');
    if (qu.length) a.dirigido = qu.join('\n');
    a.requisitos = rq;
    a.requisitosGenerales = true;
    if (r.tipos.length) a.para = r.tipos;
    const cifras = [...(a.cuantia || '').matchAll(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?\s*(?:€|euros?)/gi)].map((m) => Number(m[1].replace(/\./g, ''))).filter((x) => x >= 50 && x < 5e6);
    a.importeMax = cifras.length ? Math.max(...cifras) : null;
    if (r.titulo_eu || r.queEs_eu) {
      const azp = (gs) => aLineas(gs, 'Eskaera guztiak');
      a.eu = { titulo: r.titulo_eu || '', resumen: r.queEs_eu || '', cuantia: azp(r.cuantia_eu).join('\n'), dirigido: azp(r.quien_eu).join('\n'), requisitos: azp(r.requisitos_eu) };
    }
    a.resumenIA = true;
    n++;
  }
  return n;
}
