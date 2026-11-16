// Fuente: catálogo de trámites de euskadi.eus (Gobierno Vasco y sus organismos).
import { pedir, texto, entidades, frase, iso, enParalelo, temasDe, paraDeTexto, norm, listaRequisitos } from './comun.js';

const BASE = 'https://www.euskadi.eus';
// procedureStatus 16 = "Abierto el plazo de presentación"
const listaUrl = (pag) => `${BASE}/gobierno-vasco/tramites-servicios/?r01kQry=tT:ayuda_subvencion;mA:documentLanguage.EQ.es,procedureStatus.EQ.16;pp:r01PageSize.50;p:Inter,Inter_portal&r01SearchEngine=meta`;

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
  const objeto = entre(cuerpo, /^Objeto$/, /^(Dotación presupuestaria|Prestación económica|A quién va dirigido|Requisitos|Normativa|Información de contacto|Código|Organismos|Tramitación)$/);
  const dotacion = entre(cuerpo, /^Dotación presupuestaria$/, /^(Prestación económica|A quién va dirigido|Requisitos|Normativa|Forma de pago:?)$/);
  const prestacion = entre(cuerpo, /^Prestación económica$/, /^(A quién va dirigido|Requisitos|Forma de pago:?|Normativa)$/);
  const dirigido = entre(cuerpo, /^A quién va dirigido$/, /^(Requisitos:?|Información detallada|Normativa|Organismos|Información de contacto|Tramitación)$/);
  // Requisitos: títulos de cada requisito (sin la explicación desplegable ni avisos genéricos)
  const reqTxt = entre(cuerpo, /^Requisitos:?$/, /^(Normativa|Organismos|Información de contacto|Tramitación|Solicitud y aportación de documentación|Resolución y recursos|Justificación)$/);
  // Las listas con introducción («Ser titular de un contrato de:») van juntas; las de cómputo de ingresos
  // o compatibilidad («No computarán las siguientes cuantías:») se descartan enteras (ver listaRequisitos)
  const util = (l) => l !== l.toUpperCase() && !/^(Información detallada|Requisitos:?|Nota:|Ver |Más información|Declaración responsable\.?$|Personas físicas$|Personas jurídicas|Sociedad civil$|Identidad de la persona)/i.test(l) && !/Decreto Legislativo 1\/1997/.test(l);
  const requisitos = [...new Set(listaRequisitos(reqTxt.split('\n'), {
    valida: (l) => l.length > 12 && l.length < 220 && util(l),
    validaItem: (l) => l.length > 3 && l.length < 400 && util(l),
  }))];
  // Convocatorias europeas del catálogo de Acción Exterior (web01-s1leheki): la ficha trae
  // «FECHA LÍMITE DE PRESENTACIÓN DE PROPUESTAS: dd/mm/aaaa», que es el plazo real
  const limite = t.match(/FECHA L[IÍ]MITE DE PRESENTACI[OÓ]N(?: DE (?:PROPUESTAS|SOLICITUDES))?\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const euros = (dotacion.match(/[\d.]+(?:,\d+)?/) || [])[0];
  // Texto completo de la ficha (para el resumen): desde "Descripción/Objeto" hasta la tramitación
  const fin = cuerpo.search(/\n(Solicitud y aportación de documentación|Información de contacto|Código)\n/);
  const textoFicha = (fin > 0 ? cuerpo.slice(0, fin) : cuerpo).slice(0, 9000);
  return {
    texto: textoFicha,
    organismo: organismo.trim(),
    objeto: objeto.split('\n').slice(0, 6).join('\n'),
    presupuesto: euros ? Number(euros.replace(/\./g, '').replace(',', '.')) || null : null,
    cuantia: prestacion.split('\n').filter((l) => /€|euro|%|por ciento/i.test(l)).slice(0, 4).join('\n'),
    dirigido: dirigido.split('\n').slice(0, 8).join('\n'),
    requisitos,
    fechaLimite: limite ? iso(limite[1]) : null,
  };
}

// Open Data pone a algunas fichas (convocatorias europeas de Acción Exterior) un fin de exactamente
// 20 años después del inicio: no es un plazo real, así que se trata como sin fecha
export function finFicticio(inicio, fin) {
  if (!inicio || !fin || !/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fin)) return false;
  return fin.slice(4) === inicio.slice(4) && Number(fin.slice(0, 4)) - Number(inicio.slice(0, 4)) >= 20;
}

const OD = 'https://opendata.euskadi.eus/contenidos/ds_ayudas_subvenciones';
export const HISTORICO = /^\s*hist[oó]rico\s*$/i;

function idDe(url) {
  return 'eus-' + norm(String(url).replace(/^https?:\/\/[^/]+/, '').replace(/\/web01-[a-z0-9]+\/es\/?$/, '')).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function recoger(log) {
  const hoy = new Date().toISOString().slice(0, 10);
  const año = new Date().getFullYear();
  const porId = new Map();
  const add = (it) => { const id = idDe(it.url); if (!porId.has(id)) porId.set(id, { ...it, id }); else Object.assign(porId.get(id), Object.fromEntries(Object.entries(it).filter(([, v]) => v))); };

  // 1) Datos abiertos: procedimientos de ayuda del año en curso, el anterior y los últimos 90 días
  for (const f of ['ultimas_ayudas_subvencion_bec', `ayudas_subvencion_becas_${año}`, `ayudas_subvencion_becas_${año - 1}`]) {
    try {
      const d = await pedir(`${OD}/${f}/opendata/ayudas.json`, { json: true, navegador: true, timeout: 60000 });
      const arr = Array.isArray(d) ? d : Object.values(d).find(Array.isArray) || [];
      let n = 0, historicos = 0;
      for (const x of arr) {
        const fin = iso(x.procedureEndDate), inicio = iso(x.procedureStartDate);
        const abierto = /abierto/i.test(x.procedureStatus || '');
        // Un procedimiento marcado «Histórico» es de una convocatoria pasada: aunque Open Data le ponga
        // las fechas de la convocatoria nueva, no se publica como abierto (la nueva llega con su propio procedimiento)
        if (HISTORICO.test(x.procedureStatus || '')) { historicos++; continue; }
        if (!(fin ? fin >= hoy : abierto)) continue;
        if (!x.friendlyUrl && !x.physicalUrl) continue;
        add({ url: x.friendlyUrl || x.physicalUrl, titulo: x.documentName || x.procedureDenomination, inicio, fin: fin && !/^(2099|2100)/.test(fin) ? fin : null, permanente: !!(fin && /^(2099|2100)/.test(fin)), organismo: x.manager || x.department || x.institution, departamento: x.department, estadoTexto: x.procedureStatus });
        n++;
      }
      log(`Open Data Euskadi ${f}: ${arr.length} procedimientos, ${n} vigentes, ${historicos} históricos descartados`);
    } catch (e) { log(`Open Data Euskadi ${f}: ${e.message}`); }
  }

  // 2) Primera página del catálogo con plazo abierto (incluye ayudas permanentes como Gaztelagun)
  try {
    const items = parseLista(await pedir(listaUrl(1), { navegador: true })).filter((x) => /ayuda|beca|subvenci/i.test(x.tipo));
    items.forEach(add);
    log(`Catálogo euskadi.eus (plazo abierto): ${items.length}`);
  } catch (e) { log(`Catálogo euskadi.eus: ${e.message}`); }

  const lista = [...porId.values()];
  const fichas = await enParalelo(lista, 4, (it) => pedir(it.url).then(parseFicha).catch(() => pedir(it.url, { navegador: true }).then(parseFicha)));
  return lista.map((it, k) => {
    const f = fichas[k] && !fichas[k].error ? fichas[k] : {};
    const todo = [it.titulo, f.objeto, f.dirigido].join(' ');
    // Plazo: la fecha límite de la ficha manda; si no, se descarta el fin ficticio de 20 años
    let fin = it.fin || null;
    if (f.fechaLimite) fin = f.fechaLimite;
    else if (finFicticio(it.inicio, fin)) fin = null;
    return {
      id: it.id,
      titulo: frase(it.titulo),
      organismo: f.organismo || it.organismo || '',
      ambito: { nivel: 'euskadi', nombre: 'Toda Euskadi' },
      inicio: it.inicio || null,
      fin,
      permanente: !!it.permanente && !f.fechaLimite,
      estadoFuente: it.estadoTexto || '',
      presupuesto: f.presupuesto || null,
      cuantia: f.cuantia || '',
      resumen: f.objeto || '',
      dirigido: f.dirigido || '',
      requisitos: f.requisitos || [],
      _texto: [it.titulo, f.texto || ''].join('\n'),
      para: paraDeTexto([it.titulo, f.dirigido].join(' ')),
      temas: temasDe([it.titulo, (f.objeto || '').slice(0, 300)].join(' ')),
      url: it.url,
      fuentes: [{ nombre: 'euskadi.eus', url: it.url }],
      errorFicha: fichas[k] && fichas[k].error ? fichas[k].error : undefined,
    };
  });
}

export { entidades };
