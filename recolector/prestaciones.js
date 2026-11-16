// Prestaciones permanentes (criterio del responsable, 15/11/2026): IMV, RGI, prestaciones por hijo, bono social,
// pensiones no contributivas… Se piden en cualquier momento, así que no tienen convocatoria ni fecha de cierre.
// La lista de páginas oficiales está en cache/prestaciones.json (la amplía la tarea del plan de mejora);
// el recolector descarga cada página para la ficha y las publica como ayudas permanentes (fin vacío).
// Las que ya llegan por otra fuente (p. ej. IMV y RGI desde euskadi.eus) no se repiten aquí.
import fs from 'node:fs';
import path from 'node:path';
import { pedir, texto, enParalelo, temasDe, paraDeTexto } from './comun.js';

const LISTA = path.join('cache', 'prestaciones.json');

export async function recoger(log = console.log) {
  let lista = [];
  try { lista = JSON.parse(fs.readFileSync(LISTA, 'utf8')); } catch (e) { throw new Error(`No se puede leer ${LISTA}: ${e.message}`); }
  const items = [];
  let leidas = 0;
  await enParalelo(lista.filter((x) => x && x.titulo && /^https?:\/\//.test(x.url || '')), 2, async (x) => {
    let pagina = '';
    try {
      // euskadi.eus bloquea a los robots: allí se entra como navegador (ver README)
      pagina = texto(await pedir(x.url, { navegador: /euskadi\.(eus|net)/.test(x.url), tries: 2 })).slice(0, 8000);
      leidas++;
    } catch (e) { log(`Prestaciones: no se pudo leer ${x.url} (${e.message}); se publica con los datos de la lista`); }
    const nivel = (x.ambito && x.ambito.nivel) || 'euskadi';
    items.push({
      id: x.id,
      titulo: x.titulo,
      organismo: x.organismo || '',
      ministerio: x.ministerio || undefined,
      ambito: { nivel, nombre: (x.ambito && x.ambito.nombre) || { estado: 'España', euskadi: 'Euskadi' }[nivel] || '', terr: (x.ambito && x.ambito.terr) || null },
      inicio: null, fin: null, permanente: true,
      resumen: x.resumen || '', dirigido: x.dirigido || '', cuantia: '', presupuesto: null,
      para: x.para && x.para.length ? x.para : paraDeTexto([x.titulo, x.dirigido || ''].join(' ')),
      temas: temasDe([x.titulo, x.resumen || ''].join(' ')),
      url: x.url,
      fuentes: [{ nombre: x.fuente || 'Fuente oficial', url: x.url }],
      _texto: [x.titulo, x.resumen || '', x.dirigido || '', pagina].join('\n'),
    });
  });
  log(`Prestaciones permanentes: ${items.length} en la lista, ${leidas} páginas leídas`);
  return items;
}
