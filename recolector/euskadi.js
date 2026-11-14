// Fuente: catálogo de trámites de euskadi.eus (Gobierno Vasco y sus organismos).
import { pedir, texto, entidades, frase, iso, enParalelo, temasDe, paraDeTexto, norm } from './comun.js';

const BASE = 'https://www.euskadi.eus';
// procedureStatus 16 = "Abierto el plazo de presentación"
const listaUrl = (pag) => `${BASE}/gobierno-vasco/tramites-servicios/?r01kQry=tT:ayuda_subvencion;mA:documentLanguage.EQ.es,procedureStatus.EQ.16;pp:r01PageSize.20;p:Inter,Inter_portal&r01SearchEngine=meta&r01kTgtPg=${pag}`;

export function parseLista(html) {
  const items = [];
  const bloques = html.split(/<li class="r01srItem[ "]/).slice(1);
  for (const b of bloques) {
    const a = b.match(/r01srItemDocName"><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const tipo = texto((b.match(/r01srItemTypo[^"]*'>([\s\S]*?)<\/span>/) || [])[1]);
    const det = texto((b.match(/<div class="r01srItemTypoDet">\s*<em[^>]*>([\s\S]*?)<\/em>/) || [])[1]);
    const cat = texto((b.match(/<div class="r01srItemCat">\s*<em[^>]*>([\s\S]*?)<\/em>/) || [])[1]);
    const f = det.match(/\((\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})\)/);
    const url = a[1].startsWith('http') ? a[1] : BASE + a[1];
    items.push({
      url,
      titulo: texto(a[2]),
      tipo,
      estadoTexto: det.replace(/\(.*\)/, '').trim(),
      inicio: f ? iso(f[1]) : null,
      fin: f && !/2099|2100/.test(f[2]) ? iso(f[2]) : null,
      permanente: !!(f && /2099|2100/.test(f[2])),
      organismo: cat,
    });
  }
  return items;
}

// Corta el texto entre dos encabezados
function entre(t, desde, hasta) {
  const lines = t.split('\n');
  const i = lines.findIndex((l) => desde.test(l));
  if (i < 0) return '';
  const out = [];
  for (let k = i + 1; k < lines.length; k++) {
    if (hasta.test(lines[k])) break;
    out.push(lines[k]);
  }
  return out.join('\n').trim();
}

export function parseFicha(html) {
  const t = texto(html);
  // Saltamos la cabecera de navegación: empezamos en la línea "Descripción" que sigue al índice
  const idx = t.indexOf('\nObjeto\n');
  const cuerpo = idx >= 0 ? t.slice(idx) : t;
  const organismo = (t.match(/Organismo:\s*\n?([^\n]+)/) || [])[1] || '';
  const objeto = entre(cuerpo, /^Objeto$/, /^(Dotación presupuestaria|Prestación económica|A quién va dirigido|Requisitos|Normativa)$/);
  const dotacion = entre(cuerpo, /^Dotación presupuestaria$/, /^(Prestación económica|A quién va dirigido|Requisitos|Normativa|Forma de pago:?)$/);
  const prestacion = entre(cuerpo, /^Prestación económica$/, /^(A quién va dirigido|Requisitos|Forma de pago:?|Normativa)$/);
  const dirigido = entre(cuerpo, /^A quién va dirigido$/, /^(Requisitos:?|Información detallada|Normativa|Organismos|Información de contacto|Tramitación)$/);
  const euros = (dotacion.match(/[\d.]+(?:,\d+)?/) || [])[0];
  return {
    organismo: organismo.trim(),
    objeto: objeto.split('\n').slice(0, 6).join('\n'),
    presupuesto: euros ? Number(euros.replace(/\./g, '').replace(',', '.')) || null : null,
    cuantia: prestacion.split('\n').filter((l) => /€|euro|%|por ciento/i.test(l)).slice(0, 4).join('\n'),
    dirigido: dirigido.split('\n').slice(0, 8).join('\n'),
  };
}

export async function recoger(log) {
  const vistos = new Map();
  for (let pag = 1; pag <= 40; pag++) {
    const html = await pedir(listaUrl(pag));
    const items = parseLista(html).filter((x) => /ayuda|beca|subvenci/i.test(x.tipo));
    let nuevos = 0;
    for (const it of items) if (!vistos.has(it.url)) { vistos.set(it.url, it); nuevos++; }
    log(`euskadi.eus página ${pag}: ${items.length} ayudas (${nuevos} nuevas)`);
    if (!nuevos) break;
  }
  const lista = [...vistos.values()];
  const fichas = await enParalelo(lista, 4, (it) => pedir(it.url).then(parseFicha));
  return lista.map((it, k) => {
    const f = fichas[k] && !fichas[k].error ? fichas[k] : {};
    const todo = [it.titulo, f.objeto, f.dirigido].join(' ');
    return {
      id: 'eus-' + norm(it.url.replace(BASE, '')).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      titulo: frase(it.titulo),
      organismo: f.organismo || it.organismo,
      ambito: { nivel: 'euskadi', nombre: 'Toda Euskadi' },
      inicio: it.inicio,
      fin: it.fin,
      permanente: it.permanente,
      estadoFuente: it.estadoTexto,
      presupuesto: f.presupuesto || null,
      cuantia: f.cuantia || '',
      resumen: f.objeto || '',
      dirigido: f.dirigido || '',
      para: paraDeTexto(todo),
      temas: temasDe(todo),
      url: it.url,
      fuentes: [{ nombre: 'euskadi.eus', url: it.url }],
      errorFicha: fichas[k] && fichas[k].error ? fichas[k].error : undefined,
    };
  });
}

export { entidades };
