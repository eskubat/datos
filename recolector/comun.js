// Utilidades compartidas por todas las fuentes.
import { MUNIS } from './municipios.js';

export { MUNIS };

const ACC = { á: 'a', à: 'a', ä: 'a', â: 'a', é: 'e', è: 'e', ë: 'e', ê: 'e', í: 'i', ì: 'i', ï: 'i', î: 'i', ó: 'o', ò: 'o', ö: 'o', ô: 'o', ú: 'u', ù: 'u', ü: 'u', û: 'u', ñ: 'n', ç: 'c' };
export function norm(s) {
  return String(s || '').toLowerCase().replace(/[áàäâéèëêíìïîóòöôúùüûñç]/g, (c) => ACC[c]).replace(/\s+/g, ' ').trim();
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pasa "AYUDAS PARA EL FOMENTO..." a "Ayudas para el fomento..."
export function frase(t) {
  t = String(t || '').replace(/\s+/g, ' ').trim();
  const letras = t.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, '');
  if (letras.length > 3 && letras === letras.toUpperCase()) {
    t = t.toLowerCase();
    t = t.charAt(0).toUpperCase() + t.slice(1);
    // Siglas y nombres propios frecuentes
    t = t.replace(/\b(bdns|cae|capv|pyme|pymes|i\+d\+i|i\+d|tic|ue|ong|ongd|irpf|iva)\b/gi, (m) => m.toUpperCase())
      .replace(/\b(euskadi|bizkaia|gipuzkoa|araba|álava|lanbide|spri|osakidetza|basquetour|hazi|habe|emakunde|etxebide)\b/gi, (m) => m.charAt(0).toUpperCase() + m.slice(1));
  }
  return t;
}

// Fecha a ISO (AAAA-MM-DD) desde "DD/MM/AAAA" o "AAAA-MM-DD..."
export function iso(v) {
  if (!v) return null;
  const s = String(v);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

// Decodifica HTML que mezcla UTF-8 y Latin-1 (euskadi.eus lo hace).
export function decodificar(buf) {
  const b = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c < 0x80) { out += String.fromCharCode(c); continue; }
    let n = 0;
    if ((c & 0xe0) === 0xc0) n = 1; else if ((c & 0xf0) === 0xe0) n = 2; else if ((c & 0xf8) === 0xf0) n = 3;
    let ok = n > 0 && i + n < b.length + 0;
    for (let k = 1; ok && k <= n; k++) ok = i + k < b.length && (b[i + k] & 0xc0) === 0x80;
    if (ok) {
      let cp = c & (0x3f >> n);
      for (let k = 1; k <= n; k++) cp = (cp << 6) | (b[i + k] & 0x3f);
      out += String.fromCodePoint(cp);
      i += n;
    } else {
      out += String.fromCharCode(c); // Latin-1
    }
  }
  return out;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', euro: '€', ordm: 'º', ordf: 'ª', laquo: '«', raquo: '»', ndash: '–', mdash: '—', hellip: '…', iexcl: '¡', iquest: '¿' };
export function entidades(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => {
      if (ENT[n] != null) return ENT[n];
      const acc = n.match(/^([a-z])(acute|grave|uml|circ|tilde|cedil)$/i);
      if (acc) return (acc[1] + { acute: '́', grave: '̀', uml: '̈', circ: '̂', tilde: '̃', cedil: '̧' }[acc[2]]).normalize('NFC');
      return m;
    });
}

// HTML a texto con saltos de línea en los bloques
export function texto(html) {
  return entidades(String(html || '')
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(h[1-6]|p|div|li|dt|dd|tr|ul|ol|section|article|table)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t ]+/g, ' ')
    .split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
}

// Algunos servidores públicos (euskadi.eus) rechazan clientes identificados como robot.
// Para ellos usamos la cabecera de un navegador estándar (decisión del proyecto, ver README).
const UA_BOT = 'Mozilla/5.0 (compatible; EskubatBot/0.1; +https://github.com/eskubat/datos)';
const UA_NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export async function pedir(url, { json = false, tries = 3, timeout = 30000, navegador = false } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const r = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': navegador ? UA_NAVEGADOR : UA_BOT, Accept: json ? 'application/json' : 'text/html,*/*' },
      });
      clearTimeout(t);
      if (r.status === 429 || r.status >= 500) { last = new Error(`HTTP ${r.status}`); await sleep(1500 * (i + 1)); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status} en ${url}`);
      if (json) { const t = decodificar(await r.arrayBuffer()).trim(); return JSON.parse(t.replace(/^[\w$.]+\(\s*/, '').replace(/\)\s*;?\s*$/, '')); }
      return decodificar(await r.arrayBuffer());
    } catch (e) {
      clearTimeout(t);
      last = e;
      await sleep(1500 * (i + 1));
    }
  }
  throw last || new Error('Sin respuesta');
}

// Ejecuta fn sobre items con N en paralelo
export async function enParalelo(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      try { out[k] = await fn(items[k], k); } catch (e) { out[k] = { error: String(e.message || e) }; }
    }
  }));
  return out;
}

// ---------- Ámbito territorial ----------
export const TERRS = { 'araba/alava': 'Araba/Álava', bizkaia: 'Bizkaia', gipuzkoa: 'Gipuzkoa' };
export const MUNI_IDX = (() => {
  const idx = {};
  for (const [nombre, terr] of MUNIS) {
    const vars = new Set([norm(nombre)]);
    nombre.split(/\s*\/\s*/).forEach((p) => vars.add(norm(p)));
    vars.add(norm(nombre.replace(/\s*\/\s*/g, '/')));
    vars.add(norm(nombre.replace(/\s*\/\s*/g, '-')));
    vars.forEach((v) => { if (v.length > 1) idx[v] = { nombre, terr }; });
  }
  [['vitoria', 'Vitoria-Gasteiz'], ['san sebastian', 'Donostia / San Sebastián'], ['guernica', 'Gernika-Lumo'], ['mondragon', 'Arrasate/Mondragón'],
    ['renteria', 'Errenteria'], ['fuenterrabia', 'Hondarribia'], ['pasajes', 'Pasaia'], ['oñate', 'Oñati'], ['vergara', 'Bergara'],
    ['llodio', 'Laudio/Llodio'], ['orduña', 'Urduña/Orduña'], ['sopelana', 'Sopela'], ['lejona', 'Leioa'], ['munguia', 'Mungia'], ['guecho', 'Getxo']]
    .forEach(([v, n]) => { const m = MUNIS.find((x) => x[0] === n); if (m) idx[norm(v)] = { nombre: n, terr: m[1] }; });
  return idx;
})();

// ---------- Temas y destinatarios ----------
// Temas: expresiones con límites de palabra para no etiquetar de más ("parte" no es "arte")
export const TEMAS = [
  ['vivienda', /\b(vivienda|alquiler|rehabilitaci[oó]n de (edificios|viviendas)|fachadas?|ascensor|emancipaci|gaztelagun|bizigune)/],
  ['empleo', /\b(empleo|contrataci[oó]n de personas|contratar|desemplead|inserci[oó]n (socio)?laboral|lanbide|puestos? de trabajo|autoempleo)/],
  ['cultura', /\b(cultura|culturales?|m[uú]sica|teatro|libros?|edici[oó]n de|festival|artes?\b|artistas?|cine|audiovisual|patrimonio|bertso|museos?|danza|literari)/],
  ['estudios', /\b(becas?|estudiantes?|universitari|investigaci[oó]n|doctora|m[aá]ster|formaci[oó]n profesional|cursos?)\b/],
  ['digitalizacion', /\b(digital|digitalizaci|tecnol[oó]gic|innovaci[oó]n|inteligencia artificial|ciberseguridad|i\+d)/],
  ['familia', /\b(familias?|hij[oa]s|infancia|menores|conciliaci|natalidad|nacimiento|personas mayores|dependencia|cuidados?)\b/],
  ['energia', /\b(energ[ée]tic|energ[ií]a|renovables?|eficiencia|movilidad sostenible|veh[ií]culos? el[ée]ctric|bicicleta|autoconsumo|solar|clima|medio ambiente|ambiental|residuos|biodiversidad)/],
  ['comercio', /\b(comercio|comercial(es)?|hosteler|tiendas?|consumo|bonos?)\b/],
  ['emprendimiento', /\b(emprend|empresas?|pymes?|aut[oó]nom[oa]s|startups?|industria|internacionalizaci|competitividad)/],
  ['educacion', /\b(educaci[oó]n|educativ|escuelas?|ampas?|centros docentes|alumnado|ikastola|coeducaci)/],
  ['deporte', /\b(deport|clubs?|clubes|competiciones?|federad)/],
  ['social', /\b(inclusi[oó]n social|servicios sociales|exclusi[oó]n|vulnerab|pobreza|cooperaci[oó]n al desarrollo|discapacidad|voluntariado|igualdad|mujeres|violencia|juventud|j[oó]venes|tercer sector|derechos humanos|migrante)/],
  ['rural', /\b(agrari|agr[ií]col|ganad|rural(es)?|pesca|pesquer|forestal|caser[ií]o|explotaci[oó]n|alimentari)/],
];
// Se etiqueta por el título y el comienzo de la descripción, no por requisitos ni destinatarios
export function temasDe(t) { const n = String(t || '').toLowerCase(); return TEMAS.filter((x) => x[1].test(n)).map((x) => x[0]); }

// Destinatarios a partir de texto libre
export function paraDeTexto(t) {
  const n = norm(t);
  const out = new Set();
  if (/personas fisicas que no desarrollan|particular|familia|joven|jovenes|estudiante|alumn|persona(s)? (fisica|desemplead|mayor|con discapacidad)|ciudadan|unidad(es)? convivencia|inquilin|propietari/.test(n)) out.add('particular');
  if (/autonom|personas fisicas que desarrollan|profesional(es)? independ/.test(n)) out.add('autonomo');
  if (/empresa|pyme|sociedad|cooperativa|comercio|establecimiento/.test(n)) out.add('empresa');
  if (/asociaci|sin animo de lucro|fundaci|entidad(es)? (sin|privadas sin|del tercer)|ong|club/.test(n)) out.add('asociacion');
  if (/ayuntamiento|entidades locales|municipio|mancomunidad|cuadrilla|concejo/.test(n)) out.add('ayuntamiento');
  return [...out];
}

// ---------- Títulos cortos ----------
const SIGLAS = new Set(['EDLP', 'ITE', 'UE', 'CAE', 'CAPV', 'BDNS', 'NEB', 'MSCA', 'RAISE', 'IRPF', 'IVA', 'ONG', 'ONGD', 'PYME', 'PYMES', 'TIC', 'TEIC', 'AMPA', 'AMPAS', 'EHU', 'UPV', 'BERC', 'BERCS', 'CIC', 'SPRI', 'HAZI', 'EVE', 'ISV', 'AES', 'AEM', 'LGTBI', 'BOPV', 'BOB', 'BOG', 'BOTHA', 'DFB', 'DFG', 'DFA', 'IKERTALENT', 'ONEKIN', 'HEZIBI', 'GAUZATU', 'MOVES', 'PERTE', 'FEDER', 'FSE', 'FEADER', 'FEMPA', 'LEADER', 'COVID', 'ESA', 'BIC', 'THCS', 'IA', 'TXEKINBERRI', 'EUSKALTEL', 'HABE', 'BEC', 'BAT']);
const PALABRAS_CORTAS = new Set(['Y', 'E', 'O', 'U', 'DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'EN', 'CON', 'POR', 'PARA', 'SIN', 'AL', 'UN', 'UNA', 'SUS', 'QUE', 'AÑO', 'PLAN', 'OBRA', 'ALTA', 'BAJA', 'VIDA', 'ARTE', 'CASA', 'RED', 'SE', 'NO', 'MI', 'TU', 'A', 'LO', 'ES', 'SU', 'YA', 'MAS', 'MÁS', 'SER', 'OTRO', 'OTRA', 'TODO', 'TODA', 'PARA', 'SOBRE', 'ENTRE']);
// Quita del título lo que la app ya muestra en otro sitio (plazo, año, organismo, municipio)
// y lo acorta a la primera frase si es muy largo. El título oficial se guarda aparte.
const ORG_EN_TITULO = /\s*,?\s*\b(?:del|de la|por el|por la)\s+(?:excmo\.?\s+)?(?:gobierno vasco|eusko jaurlaritza|diputaci[oó]n foral de (?:bizkaia|gipuzkoa|[aá]lava|araba)|dfb|dfg|dfa)\b/gi;
export function tituloCorto(t, organismo = '', ambito = {}) {
  let s = String(t || '').replace(/\s+/g, ' ').trim();
  s = s.replace(/\s*\([^()]*\b(?:19|20)\d\d\b[^()]*\)/g, '')
    // Numeración interna de la convocatoria: no ayuda a entender de qué va
    .replace(/\s*[(\[]?\b(?:l[ií]nea|anexo|modalidad|lote|fase|cap[ií]tulo|apartado|eje|medida|tipolog[ií]a)\s+(?:n[º°o.]*\s*)?[\divxlcIVXLC]+[a-zA-Z]?\b[)\]]?/gi, '')
    .replace(/\.{3,}|…/g, '')
    // Palabras en mayúsculas sin ser siglas: a minúsculas (se conservan las siglas conocidas y las cortas)
    .replace(/[A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ]+|\bY\b|\bE\b|\bO\b|\bU\b/g, (w) => (SIGLAS.has(w) || (w.length <= 4 && !PALABRAS_CORTAS.has(w)) ? w : w.toLowerCase()));
  s = s
    .replace(/^(?:la |el )?(?:aprobaci[oó]n de (?:las )?bases(?: reguladoras)?(?: y (?:de )?(?:la )?convocatoria)?|bases reguladoras(?: y (?:la )?convocatoria)?|convocatoria(?: p[uú]blica)?)(?: general)?\s+(?:de |del |para (?:la |el )?)?(?=(?:las |los )?(?:ayudas?|subvenci|becas?|premios?|programa|concurso|incentiv))/i, '')
    .replace(/^(?:orden|resoluci[oó]n|decreto)\s+(?:foral\s+)?de\s+(?=(?:las |los )?(?:ayudas?|subvenci|becas?|premios?))/i, '')
    .replace(/^convocatoria (?:p[uú]blica )?(?:para la concesi[oó]n )?(?:de |para )(?=(?:las |los )?(?:ayudas?|subvenci|becas?|premios?))/i, '')
    .replace(/^(?:las|los)\s+(?=(?:ayudas?|subvenci|becas?|premios?))/i, '')
    .replace(/^convocatoria general de subvenciones\s*(?:\d{4})?\s*[.,-]?\s*anexo\s*n?[º°o.]*\s*\d+\s*[:.\-]\s*/i, '')
    .replace(/[.,;]?\s*\(?\bplazos?\b[^.()]*\d[^.()]*\)?\.?\s*$/i, '')
    .replace(/\b(?:para|en|de|del|durante)\s+(?:el\s+)?(?:a[nñ]o|ejercicio|curso|periodo|per[ií]odo)\s+(?:19|20)\d\d(?:\s*[-/]\s*(?:19|20)?\d\d)?/gi, '')
    .replace(/\b(?:a[nñ]o|ejercicio|curso)?\s*(?:19|20)\d\d(?:\s*[-/]\s*(?:19|20)?\d\d)?\b/gi, '')
    .replace(ORG_EN_TITULO, '');
  // Nombre del municipio o territorio al final ("... de Irun", "... en Bizkaia")
  if (ambito && ambito.nombre) {
    for (const n of String(ambito.nombre).split(/\s*\/\s*/)) {
      if (n.length < 3) continue;
      const nn = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      s = s.replace(new RegExp(`\\s*,?\\s*\\b(?:del|de la|por el)\\s+(?:excmo\\.?\\s+)?(?:ayuntamiento|udala|concejo)\\s+(?:de\\s+)?${nn}\\b`, 'gi'), '')
        .replace(new RegExp(`\\s*,?\\s*\\b(?:de|del|en)\\s+(?:la\\s+)?(?:villa\\s+de\\s+|municipio\\s+de\\s+|territorio hist[oó]rico\\s+de\\s+)?${nn}\\b`, 'gi'), '');
    }
  }
  s = s.replace(/^((?:las |los )?(?:ayudas?|subvenci[oó]n(?:es)?|becas?|premios?)\s+)(?:para|de) la concesi[oó]n de (?:las |los )?(ayudas?|subvenci[oó]n(?:es)?|becas?|premios?)\s+/i, '$2 ')
    .replace(/^(\S+),\s+(?=para|destinad|a |de )/i, '$1 ')
    .replace(/\s+(?:en|de|del|para|el|la|los|las|y|a)\s*$/i, '')
    .replace(/(\w)-\s+(?=[A-ZÁÉÍÓÚ])/g, '$1-').replace(/\(\s*\)/g, '').replace(/(\s*,\s*){2,}/g, ', ').replace(/\s+([,.;:])/g, '$1').replace(/([,.;:])(?=[^\s\d])/g, '$1 ')
    .replace(/\s{2,}/g, ' ').replace(/^[\s,.;:\-–]+|[\s,.;:\-–]+$/g, '').trim();
  s = s.replace(/^(\S+),\s+(?=para|destinad|a |de )/i, '$1 ');
  // Muy largo: primera frase si tiene sentido por sí sola; si no, corte en palabra
  if (s.length > 100) {
    const frases = s.split(/(?<=[a-záéíóúñ)])\.\s+(?=[A-ZÁÉÍÓÚÑ])/);
    const QUE = /\b(ayudas?|subvenci|becas?|premios?|programa|bonos?|convocatoria|campa[nñ]a|pr[eé]stamos?|incentivos?|plan|concurso|financiaci)/i;
    if (frases.length > 1 && !QUE.test(frases[0]) && frases[0].length < 60) {
      // "NEB, Nueva Bauhaus Europea. Convocatoria para barrios..." -> "NEB, Nueva Bauhaus Europea: convocatoria para barrios..."
      let unido = frases[0] + ': ' + frases[1].charAt(0).toLowerCase() + frases[1].slice(1);
      if (unido.length > 120) { const m = unido.slice(0, 125).search(/,?\s+(?:con financiaci|con cargo|en el marco|dentro de|al amparo)/i); if (m > 50) unido = unido.slice(0, m); }
      if (unido.length > 120) { const c = unido.slice(0, 120).lastIndexOf(', '); unido = c > 50 ? unido.slice(0, c) : unido.slice(0, 105).replace(/\s+\S*$/, '').replace(/\s+(?:en|de|del|para|el|la|los|las|y|a|e|o|con|por)$/i, ''); }
      s = unido;
    } else if (frases[0].length >= 20 && frases[0].length <= 100) s = frases[0];
    else {
      const sub = s.split(/\s*[:;]\s+/)[0];
      if (sub.length >= 20 && sub.length <= 100) s = sub;
      else {
        // Corte en un punto natural (coma, "que", "dentro de"...) sin puntos suspensivos; si no lo hay, se deja entero hasta 150
        const zona = s.slice(0, 125);
        const cortes = [...zona.matchAll(/,\s|\s(?:que|dentro de|en el marco|con el fin|con cargo|al amparo|como consecuencia|seleccionad|aprobad|cofinanciad|mediante)\s/gi)].map((m) => m.index).filter((i) => i >= 45);
        if (cortes.length) s = s.slice(0, cortes[cortes.length - 1]);
        else if (s.length > 150) s = s.slice(0, 145).replace(/\s+\S*$/, '');
        s = s.replace(/[\s,;:]+$/, '').replace(/\s+(?:en|de|del|para|el|la|los|las|y|a|e|o|con|por|al|un|una)$/i, '');
      }
    }
  }
  s = (s || String(t || '').trim()).replace(/[\s,;:.]+$/, '').replace(/\s+(?:en|de|del|para|el|la|los|las|y|a|e|o|con|por|al|un|una)$/i, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Organismo legible: primer departamento, sin siglas entre paréntesis ni listas con '#'
export function organismoCorto(o) {
  let s = String(o || '').split('#')[0].replace(/^(?:consejero|viceconsejero|director|directora|diputado|diputada)(?:\/a)?\s+(?:general\s+)?(?:de|del)\s+/i, '').replace(/\s*\([A-Z]{2,}\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length > 70) s = s.split(/\s*[·,]\s*/)[0];
  return s;
}

// ---------- Ortografía ----------
// Las fuentes a veces escriben sin tildes o en minúsculas los nombres propios. Corregimos lo seguro.
const TILDES = {
  asociacion: 'asociación', asociaciones: 'asociaciones', subvencion: 'subvención', educacion: 'educación', formacion: 'formación',
  promocion: 'promoción', informacion: 'información', creacion: 'creación', inversion: 'inversión', inversiones: 'inversiones',
  contratacion: 'contratación', rehabilitacion: 'rehabilitación', investigacion: 'investigación', innovacion: 'innovación',
  organizacion: 'organización', digitalizacion: 'digitalización', gestion: 'gestión', economica: 'económica', economicas: 'económicas',
  economico: 'económico', economicos: 'económicos', energetica: 'energética', energeticas: 'energéticas', tecnologica: 'tecnológica',
  tecnologico: 'tecnológico', basica: 'básica', basicas: 'básicas', unica: 'única', academico: 'académico', academica: 'académica',
  cientifico: 'científico', cientifica: 'científica', practicas: 'prácticas', musica: 'música', musical: 'musical', vehiculo: 'vehículo',
  vehiculos: 'vehículos', electrico: 'eléctrico', electricos: 'eléctricos', ambito: 'ámbito', poblacion: 'población', situacion: 'situación',
  produccion: 'producción', edicion: 'edición', difusion: 'difusión', accion: 'acción', acciones: 'acciones', participacion: 'participación',
  integracion: 'integración', inclusion: 'inclusión', exclusion: 'exclusión', conciliacion: 'conciliación', cooperacion: 'cooperación',
  adquisicion: 'adquisición', instalacion: 'instalación', sustitucion: 'sustitución', realizacion: 'realización', renovacion: 'renovación',
  construccion: 'construcción', financiacion: 'financiación', comunicacion: 'comunicación', administracion: 'administración',
  publicacion: 'publicación', convocatoria: 'convocatoria', ayuda: 'ayuda', jovenes: 'jóvenes', mas: 'más', ambiental: 'ambiental',
  dia: 'día', dias: 'días', genero: 'género', periodo: 'periodo', comun: 'común', publica: 'pública', publicas: 'públicas',
  deposito: 'depósito', energia: 'energía', alquiler: 'alquiler', basico: 'básico', tecnica: 'técnica', tecnicas: 'técnicas',
  regimen: 'régimen', tecnologia: 'tecnología', tecnologias: 'tecnologías', politica: 'política', politicas: 'políticas', agricola: 'agrícola', pesqueria: 'pesquería', maritimo: 'marítimo', academicos: 'académicos', medico: 'médico', area: 'área', areas: 'áreas', tramite: 'trámite', tramites: 'trámites', unico: 'único', critico: 'crítico', historico: 'histórico', historica: 'histórica', publicos: 'públicos', basicos: 'básicos', telematica: 'telemática', ultimo: 'último', ultima: 'última', proposito: 'propósito', credito: 'crédito', creditos: 'créditos', interes: 'interés', jovenes: 'jóvenes', estrategico: 'estratégico', estrategica: 'estratégica', escolares: 'escolares', polideportivo: 'polideportivo', solidaria: 'solidaria',
};
const PROPIOS = ['Euskadi', 'País Vasco', 'Gobierno Vasco', 'Diputación Foral', 'Comunidad Autónoma', 'Bizkaia', 'Gipuzkoa', 'Araba', 'Álava', 'Lanbide', 'Osakidetza', 'Unión Europea'];
// Erratas frecuentes en los textos oficiales
const ERRATAS = [
  [/\bhacer (pasado|sido|realizado|presentado|obtenido|tenido|hecho|solicitado|finalizado|abonado)\b/gi, 'haber $1'],
  [/\b(Ayudas generales|Requisitos):\s*ara\b/g, '$1: para'],
  [/\s+([,.;:])(?=\s|$)/g, '$1'],
  [/\(\s+/g, '('], [/\s+\)/g, ')'],
];
export function ortografia(t) {
  let s = String(t || '');
  for (const [re, r] of ERRATAS) s = s.replace(re, r);
  s = s.replace(/\b[a-zñ]+\b/gi, (w) => {
    const r = TILDES[w.toLowerCase()];
    if (!r || r === w.toLowerCase()) return w;
    return w[0] === w[0].toUpperCase() ? r.charAt(0).toUpperCase() + r.slice(1) : r;
  });
  for (const p of PROPIOS) s = s.replace(new RegExp(`\\b${p.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ /g, '\\s+')}\\b`, 'gi'), p);
  for (const [n] of MUNIS) {
    for (const parte of n.split(/\s*\/\s*/)) {
      if (parte.length < 4) continue;
      const base = parte.normalize('NFD').replace(/[̀-ͯ]/g, '');
      s = s.replace(new RegExp(`(?<=\\b(?:de|del|en|a)\\s+)${base.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}\\b`, 'gi'), parte);
    }
  }
  return s;
}
