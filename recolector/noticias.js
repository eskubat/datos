// Noticias de ayudas: entradas de euskadi.eus (sección europea de Lehendakaritza) escritas como titular
// («La UE lanza…», «CIENCIA. El ERC ha anunciado…»). No se borran a ciegas:
//  1. Se marcan como posible noticia y se cotejan con el portal europeo (cache/europa.json) y con las ayudas que ya hay.
//  2. La tarea programada decide (cache/noticias_decisiones.json) y, si la noticia habla de una ayuda que no tenemos,
//     busca la convocatoria oficial en la web y la añade a cache/ayudas_extra.json.
//  3. Mientras no hay decisión, la entrada no se publica como ayuda: va a publico/revision.json.
import fs from 'node:fs';
import path from 'node:path';
import { norm, temasDe, paraDeTexto } from './comun.js';

const leer = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const VERBO = /\b(son|está|están|será|serán|lanza|lanzan|reforzará|reforzarán|refuerza|estrena|estrenan|abre|abren|presenta|anuncia|ha anunciado|da|destina|aprueba|impulsa|financiará|apoya|apoyará|augura|cubre|aporta|crea|tiene)\b/i;
const CABECERA = /^(?!\d{4}[.:]\s)[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 ,+&'’\-]{2,}[.:]\s/;
export const esPosibleNoticia = (a) => /euskadi\.eus\/ayuda_subvencion\//.test(a.url || '') && (CABECERA.test(a.titulo || '') || VERBO.test(a.titulo || ''));

// Programas europeos: siglas y nombres en castellano -> términos para buscar en el portal
const PROGRAMAS = [
  [/\bMSCA\b|marie.?sk.odowska/i, ['MSCA']], [/\bERC\b|consejo europeo de investigaci/i, ['ERC']], [/\bEIC\b|consejo europeo de innovaci/i, ['EIC']],
  [/\bCEF\b|conectar europa/i, ['CEF']], [/\bEDIP\b|industria europea de (la )?defensa/i, ['EDIP']], [/\bEDF\b|fondo europeo de defensa|doble uso/i, ['EDF']],
  [/\bLIFE\b/, ['LIFE']], [/europa creativa|\bMEDIA\b/i, ['CREA']], [/erasmus/i, ['ERASMUS']], [/fondo de innovaci|innovation fund|subasta de calor/i, ['INNOVFUND']],
  [/protecci[oó]n civil|\bUCPM\b/i, ['UCPM']], [/noche europea de los investigadores/i, ['MSCA-2027-CITIZENS', 'CITIZENS']], [/\bRAISE\b/, ['RAISE']],
  [/horizon/i, ['HORIZON']], [/\bEIT\b|instituto europeo de innovaci/i, ['EIT']], [/nueva bauhaus|\bNEB\b/i, ['NEB']], [/\bFEMPA\b|\bEMFAF\b|mar[ií]timo,? de pesca/i, ['EMFAF']],
  [/digital europe|europa digital/i, ['DIGITAL']], [/interreg/i, ['INTERREG']], [/single market|mercado [uú]nico/i, ['SMP']], [/eu4health|programa de salud/i, ['EU4H']],
  [/\bCERV\b|ciudadanos, igualdad, derechos y valores/i, ['CERV']], [/materias primas cr[ií]ticas|resourceeu/i, ['RESOURCE', 'CRM']],
];
const VACIAS = new Set('para con los las del una unos unas por que como sus este esta estos estas entre sobre desde hasta ayuda ayudas subvenciones convocatoria programa proyectos europeo europea europeos fondo fondos nuevas nueva'.split(' '));
const palabras = (t) => new Set(norm(t).replace(/[^a-z0-9ñ ]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !VACIAS.has(w)));

export function cotejar(noticias, ayudas, europa) {
  return noticias.map((a) => {
    const terminos = PROGRAMAS.filter(([re]) => re.test(a.titulo + ' ' + (a.resumen || ''))).flatMap(([, t]) => t);
    const hoy = new Date().toISOString().slice(0, 10);
    const ue = terminos.length ? europa.filter((c) => !c.fin || c.fin >= hoy).map((c) => ({ c, s: terminos.filter((t) => (c.id + ' ' + c.convocatoria + ' ' + c.titulo).toUpperCase().includes(t)).length }))
      .filter((x) => x.s).sort((x, y) => y.s - x.s || (x.c.estado === 'abierta' ? -1 : 1)).slice(0, 8).map(({ c }) => c) : [];
    const pa = palabras(a.titulo);
    const propias = ayudas.map((b) => ({ b, s: [...palabras(b.titulo)].filter((w) => pa.has(w)).length })).filter((x) => x.s >= 3)
      .sort((x, y) => y.s - x.s).slice(0, 3).map(({ b }) => ({ id: b.id, titulo: b.titulo, url: b.url }));
    return { id: a.id, titulo: a.titulo, url: a.url, fin: a.fin, terminos, candidatosUE: ue, candidatosAyudas: propias };
  });
}

// Ayudas añadidas por la tarea a partir de noticias (cache/ayudas_extra.json), con el formato de las demás fuentes
export function extras(log = console.log) {
  const hoy = new Date().toISOString().slice(0, 10);
  const ok = [];
  for (const x of leer(path.join('cache', 'ayudas_extra.json'), [])) {
    if (!x || !x.titulo || !/^https?:\/\//.test(x.url || '')) { log(`Extra descartada (sin título o URL): ${x && x.titulo}`); continue; }
    if (x.fin && x.fin < hoy) continue;
    const nivel = ['ue', 'estado', 'euskadi', 'territorio', 'municipio'].includes(x.ambito && x.ambito.nivel) ? x.ambito.nivel : 'ue';
    const nombre = (x.ambito && x.ambito.nombre) || { ue: 'Unión Europea', estado: 'España', euskadi: 'Euskadi' }[nivel] || '';
    ok.push({
      id: x.id || 'extra-' + norm(x.titulo).replace(/[^a-z0-9]+/g, '-').slice(0, 60),
      titulo: x.titulo, organismo: x.organismo || (nivel === 'ue' ? 'Unión Europea' : ''),
      ambito: { nivel, nombre, terr: (x.ambito && x.ambito.terr) || null },
      inicio: x.inicio || null, fin: x.fin || null, permanente: !x.fin,
      resumen: x.resumen || '', dirigido: x.dirigido || '', cuantia: '', presupuesto: null,
      para: x.para && x.para.length ? x.para : paraDeTexto([x.titulo, x.dirigido || ''].join(' ')),
      temas: temasDe([x.titulo, x.resumen || ''].join(' ')),
      url: x.url, origen: 'extra', noticia: x.noticia || null,
      fuentes: [{ nombre: x.fuente || (nivel === 'ue' ? 'Portal de financiación de la Comisión Europea' : 'Fuente oficial'), url: x.url }],
      _texto: [x.titulo, x.resumen || '', x.dirigido || ''].join('\n'),
    });
  }
  if (ok.length) log(`Ayudas añadidas a partir de noticias: ${ok.length}`);
  return ok;
}

// Separa las posibles noticias según las decisiones de la tarea. Devuelve {publicar, revision}.
export function separar(ayudas, log = console.log) {
  const decisiones = leer(path.join('cache', 'noticias_decisiones.json'), {});
  const publicar = [], revision = [];
  for (const a of ayudas) {
    if (!a.posibleNoticia) { publicar.push(a); continue; }
    const d = decisiones[a.id];
    if (d && d.accion === 'es_ayuda') { delete a.posibleNoticia; publicar.push(a); continue; }
    revision.push({ id: a.id, titulo: a.tituloOficial || a.titulo, url: a.url, accion: d ? d.accion : 'pendiente', nota: (d && d.nota) || '', ayudaId: (d && d.ayudaId) || null });
  }
  log(`Posibles noticias: ${revision.length} fuera de la lista (${revision.filter((r) => r.accion === 'pendiente').length} pendientes de revisar)`);
  return { publicar, revision };
}
