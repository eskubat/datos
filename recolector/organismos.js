// Tabla maestra de organismos (docs/CATEGORIZACION.md, sección 3).
// El nombre que se muestra sale SIEMPRE de esta tabla, nunca del texto de la web.
// - corto: ficha resumen (≤ 40 caracteres). completo: detalle (≤ 80), partes separadas por « - ».
// - eu: nombre corto en euskera. alias: variantes conocidas (también nombres antiguos de departamentos).
// Gobierno Vasco: departamentos del Decreto 18/2024 (XIII legislatura).
import { MUNIS } from './municipios.js';
import { norm } from './comun.js';

const GV = 'Gobierno Vasco';
const DEPTOS = [
  ['lehendakaritza', 'Lehendakaritza', ['lehendakaritza', 'presidencia', 'accion exterior', 'euskadi global', 'politica exterior', 'secretaria general de transicion social']],
  ['gobernanza', 'Departamento de Gobernanza, Administración Digital y Autogobierno', ['gobernanza', 'administracion digital', 'autogobierno', 'gobernanza publica']],
  ['economia', 'Departamento de Economía, Trabajo y Empleo', ['economia, trabajo', 'trabajo y empleo', 'empleo, asuntos sociales', 'trabajo y justicia', 'direccion de empleo', 'inclusion']],
  ['hacienda', 'Departamento de Hacienda y Finanzas', ['hacienda y finanzas', 'economia y hacienda']],
  ['educacion', 'Departamento de Educación', ['educacion']],
  ['seguridad', 'Departamento de Seguridad', ['seguridad']],
  ['industria', 'Departamento de Industria, Transición Energética y Sostenibilidad', ['industria', 'transicion energetica', 'energia', 'medio ambiente', 'sostenibilidad', 'desarrollo economico', 'empresa e industria']],
  ['vivienda', 'Departamento de Vivienda y Agenda Urbana', ['vivienda', 'agenda urbana', 'planificacion territorial']],
  ['salud', 'Departamento de Salud', ['salud', 'sanidad']],
  ['bienestar', 'Departamento de Bienestar, Juventud y Reto Demográfico', ['bienestar', 'juventud', 'reto demografico', 'politicas sociales', 'igualdad, justicia y politicas sociales', 'familias', 'infancia']],
  ['movilidad', 'Departamento de Movilidad Sostenible', ['movilidad', 'transportes', 'infraestructuras']],
  ['cultura', 'Departamento de Cultura y Política Lingüística', ['cultura', 'politica linguistica', 'euskera', 'deportes', 'deporte']],
  ['ciencia', 'Departamento de Ciencia, Universidades e Innovación', ['ciencia', 'universidades', 'investigacion', 'innovacion']],
  ['turismo', 'Departamento de Turismo, Comercio y Consumo', ['turismo', 'comercio', 'consumo']],
  ['alimentacion', 'Departamento de Alimentación, Desarrollo Rural, Agricultura y Pesca', ['alimentacion', 'desarrollo rural', 'agricultura', 'pesca', 'puertos y litoral']],
  ['justicia', 'Departamento de Justicia y Derechos Humanos', ['justicia', 'derechos humanos', 'memoria', 'convivencia']],
];
// Organismos públicos con nombre propio
const PROPIOS = [
  ['lanbide', 'Lanbide', 'Lanbide - Servicio Vasco de Empleo', 'Lanbide', ['lanbide', 'servicio vasco de empleo', 'euskal enplegu zerbitzua']],
  ['spri', 'SPRI', 'SPRI - Agencia Vasca de Desarrollo Empresarial', 'SPRI', ['spri', 'agencia vasca de desarrollo empresarial']],
  ['eve', 'EVE', 'EVE - Ente Vasco de la Energía', 'EEE', ['ente vasco de la energia', 'eve']],
  ['emakunde', 'Emakunde', 'Emakunde - Instituto Vasco de la Mujer', 'Emakunde', ['emakunde']],
  ['osalan', 'Osalan', 'Osalan - Instituto Vasco de Seguridad y Salud Laborales', 'Osalan', ['osalan']],
  ['elankidetza', 'eLankidetza', 'eLankidetza - Agencia Vasca de Cooperación y Solidaridad', 'eLankidetza', ['elankidetza', 'agencia vasca de cooperacion']],
  ['etxepare', 'Instituto Vasco Etxepare', 'Instituto Vasco Etxepare', 'Etxepare Euskal Institutua', ['etxepare']],
  ['habe', 'HABE', 'HABE - Instituto de Alfabetización y Reeuskaldunización de Adultos', 'HABE', ['habe']],
  ['hazi', 'HAZI', 'HAZI Fundazioa', 'HAZI', ['hazi']],
  ['ihobe', 'Ihobe', 'Ihobe - Sociedad Pública de Gestión Ambiental', 'Ihobe', ['ihobe']],
  ['basquetour', 'Basquetour', 'Basquetour - Agencia Vasca de Turismo', 'Basquetour', ['basquetour']],
  ['gogora', 'Gogora', 'Gogora - Instituto de la Memoria, la Convivencia y los Derechos Humanos', 'Gogora', ['gogora']],
  ['bioef', 'BIOEF', 'BIOEF - Fundación Vasca de Innovación e Investigación Sanitarias', 'BIOEF', ['bioef']],
  ['kontsumobide', 'Kontsumobide', 'Kontsumobide - Instituto Vasco de Consumo', 'Kontsumobide', ['kontsumobide']],
  ['ivap', 'IVAP', 'IVAP - Instituto Vasco de Administración Pública', 'HAEE', ['ivap', 'instituto vasco de administracion publica']],
  ['etxebide', 'Etxebide', 'Etxebide - Servicio Vasco de Vivienda', 'Etxebide', ['etxebide']],
  ['ikerbasque', 'Ikerbasque', 'Ikerbasque - Fundación Vasca para la Ciencia', 'Ikerbasque', ['ikerbasque']],
  ['osakidetza', 'Osakidetza', 'Osakidetza - Servicio Vasco de Salud', 'Osakidetza', ['osakidetza']],
  ['ue', 'Unión Europea', 'Unión Europea', 'Europar Batasuna', ['union europea', 'comision europea']],
  ['bilbao-ekintza', 'Bilbao Ekintza', 'Ayuntamiento de Bilbao - Bilbao Ekintza', 'Bilbao Ekintza', ['bilbao ekintza']],
  ['bilbao-kirolak', 'Bilbao Kirolak', 'Ayuntamiento de Bilbao - Bilbao Kirolak', 'Bilbao Kirolak', ['bilbao kirolak']],
  ['surbisa', 'Surbisa', 'Ayuntamiento de Bilbao - Surbisa', 'Surbisa', ['surbisa']],
  ['fomento-ss', 'Fomento de San Sebastián', 'Ayuntamiento de Donostia / San Sebastián - Fomento de San Sebastián', 'Donostia Sustapena', ['fomento de san sebastian', 'donostia sustapena']],
  ['donostia-kultura', 'Donostia Kultura', 'Ayuntamiento de Donostia / San Sebastián - Donostia Kultura', 'Donostia Kultura', ['donostia kultura']],
  ['inguralde', 'Inguralde', 'Inguralde - Agencia de Desarrollo Local', 'Inguralde', ['inguralde']],
  ['behargintza', 'Behargintza', 'Behargintza - Agencia de Desarrollo Local', 'Behargintza', ['behargintza']],
];
const FORALES = [
  ['dfa', 'Diputación Foral de Álava', 'Arabako Foru Aldundia', ['diputacion foral de alava', 'diputacion foral de araba', 'arabako foru aldundia', 'dfa']],
  ['dfb', 'Diputación Foral de Bizkaia', 'Bizkaiko Foru Aldundia', ['diputacion foral de bizkaia', 'diputacion foral de vizcaya', 'bizkaiko foru aldundia', 'dfb']],
  ['dfg', 'Diputación Foral de Gipuzkoa', 'Gipuzkoako Foru Aldundia', ['diputacion foral de gipuzkoa', 'diputacion foral de guipuzcoa', 'gipuzkoako foru aldundia', 'dfg']],
];
// "Bilboko Udala", "Irungo Udala"… (nombre en euskera: la parte vasca del nombre oficial bilingüe)
const EU_MUNI = { 'Bilbao': 'Bilbo', 'Donostia / San Sebastián': 'Donostia', 'Vitoria-Gasteiz': 'Vitoria-Gasteiz', 'Valle de Trápaga-Trapagaran': 'Trapagaran', 'Iruña Oka/Iruña de Oca': 'Iruña Oka', 'Campezo/Kanpezu': 'Kanpezu', 'Ayala/Aiara': 'Aiara', 'Elciego': 'Eltziego', 'Villabuena de Álava/Eskuernaga': 'Eskuernaga', 'Laudio/Llodio': 'Laudio' };
const udala = (n) => {
  const b = EU_MUNI[n] || n.split(/\s*\/\s*/)[0];
  return b + (/[nl]$/i.test(b) ? 'go' : /[aeiou]$/i.test(b) ? 'ko' : 'ko') + ' Udala';
};

export const CATALOGO = [
  { id: 'gv', corto: GV, completo: GV, eu: 'Eusko Jaurlaritza', alias: ['gobierno vasco', 'eusko jaurlaritza', 'administracion general de la comunidad autonoma'] },
  ...DEPTOS.map(([id, nombre, alias]) => ({ id: 'gv-' + id, corto: GV, completo: `${GV} - ${nombre}`, eu: 'Eusko Jaurlaritza', alias })),
  ...FORALES.map(([id, corto, eu, alias]) => ({ id, corto, completo: corto, eu, alias })),
  ...MUNIS.map(([n]) => ({ id: 'ayto-' + norm(n).replace(/[^a-z0-9]+/g, '-'), corto: `Ayuntamiento de ${n}`, completo: `Ayuntamiento de ${n}`, eu: udala(n), alias: [norm(n)] })),
  ...PROPIOS.map(([id, corto, completo, eu, alias]) => ({ id, corto, completo, eu, alias })),
];
export const POR_ID = Object.fromEntries(CATALOGO.map((o) => [o.id, o]));

// Asigna un registro de la tabla a partir del texto de la fuente y del ámbito de la ayuda.
// Devuelve { id, revisar } — revisar = no se encontró el departamento/organismo exacto.
export function resolver(texto, ambito = {}) {
  const t = norm(texto || '');
  const propio = PROPIOS.find(([, , , , alias]) => alias.some((x) => new RegExp(`\\b${x}\\b`).test(t)));
  if (propio) return { id: propio[0], revisar: false };
  if (ambito.nivel === 'municipio') {
    const m = MUNIS.find(([n]) => norm(n) === norm(ambito.nombre));
    return { id: m ? 'ayto-' + norm(m[0]).replace(/[^a-z0-9]+/g, '-') : null, revisar: !m };
  }
  if (ambito.nivel === 'territorio') {
    const f = FORALES.find(([, corto]) => norm(corto).includes(norm(String(ambito.nombre).split('/').pop())) || (/alava|araba/.test(norm(ambito.nombre)) && corto.includes('Álava')));
    return { id: f ? f[0] : null, revisar: !f };
  }
  // Gobierno Vasco: el departamento cuyo alias aparece primero en el texto
  let mejor = null;
  for (const [id, nombre, alias] of DEPTOS) {
    for (const a of [norm(nombre).replace(/^departamento de /, ''), ...alias]) {
      const i = t.search(new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`));
      if (i >= 0 && (!mejor || i < mejor.i || (i === mejor.i && a.length > mejor.len))) mejor = { id: 'gv-' + id, i, len: a.length };
    }
  }
  return mejor ? { id: mejor.id, revisar: false } : { id: 'gv', revisar: !!t && !/^gobierno vasco$/.test(t) };
}
