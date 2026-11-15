// Títulos estandarizados (docs/TITULOS.md). La tarea programada reescribe el título original de cada
// ayuda; aquí se comprueba y se aplica. Caché: cache/titulos.json {título original: {es, eu}}.
const TIPO = /^(subvenciones|subvención|ayudas|ayuda|becas|beca|préstamos|préstamo|premios|premio|bonos|bono|programa|concurso|certamen|incentivos|prestación|prestaciones|deducciones|bonificaciones)\b/i;
const VERBO = /\b(son|es|está|están|se|será|serán|lanza|lanzan|reforzará|reforzarán|estrena|estrenan|abre|abren|convoca|convocan|tiene|tienen|podrán|puede|pueden|han|ha)\b/i;
const TRAMITE = /\b(convocatoria|bases reguladoras|bases|extracto|decreto|resoluci[oó]n|orden|acuerdo|procedimiento|anuncio|r[eé]gimen de (concurrencia|evaluaci[oó]n))\b/i;
const SIGLAS = /^(I\+D(\+i)?|[A-Z0-9][A-Z0-9+\-]{1,9})$/;

export const original = (a) => a.tituloOficial || a.titulo;

// Errores de un título en castellano (vacío = correcto)
export function comprobarTitulo(es, orig = '') {
  const e = [];
  const t = String(es || '').trim();
  if (!t) return ['título vacío'];
  if (!TIPO.test(t)) e.push('debe empezar por el tipo de ayuda (Subvenciones, Ayudas, Becas, Préstamos, Premios, Bonos, Programa, Concurso…)');
  const n = t.split(/\s+/).length;
  if (n < 3 || n > 14) e.push(`entre 4 y 12 palabras (tiene ${n})`);
  if (t.length > 90) e.push(`máximo 90 caracteres (tiene ${t.length})`);
  if (/[.;:]$/.test(t)) e.push('sin punto final');
  if (VERBO.test(t)) e.push('no puede ser una frase con verbo conjugado');
  if (TRAMITE.test(t.replace(/^concurso\b/i, ''))) e.push('sin palabras de trámite (Convocatoria, Bases, Decreto, Resolución, Orden, Acuerdo, Procedimiento…)');
  if (/\b(19|20)\d\d\b/.test(t)) e.push('sin año');
  if (t.split(/\s+/).some((w) => w.length > 3 && w === w.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(w) && !SIGLAS.test(w))) e.push('sin palabras en mayúsculas salvo siglas');
  if (/\b(\w+) \1\b/i.test(t) || /\w-\w*-?$/.test(t) || /\b(sub-|pisci-|ejer-)/i.test(t)) e.push('erratas o palabras cortadas');
  const nums = (x) => (String(x).match(/\d+/g) || []);
  const no = nums(t).filter((x) => !nums(orig).includes(x));
  if (no.length) e.push(`cifras que no están en el título original: ${no.join(', ')}`);
  return e;
}

// Aplica los títulos estandarizados y devuelve la lista de pendientes
export function aplicarTitulos(items, cache, titEuViejo = {}) {
  for (const a of items) {
    const c = cache[original(a)];
    if (c && c.es) {
      if (!a.resumenIA) { if (!a.tituloOficial) a.tituloOficial = a.titulo; a.titulo = c.es; }
      if (c.eu && !(a.eu && a.eu.titulo)) a.tituloEu = c.eu;
    } else if (titEuViejo[a.titulo]) a.tituloEu = titEuViejo[a.titulo];
  }
  const vistos = new Set();
  return items.filter((a) => !cache[original(a)] && !vistos.has(original(a)) && vistos.add(original(a)))
    .map((a) => ({ original: original(a), actual: a.titulo, organismo: a.organismo || '', id: a.id }));
}
