// Fuentes forales: sedes electrónicas de las Diputaciones de Gipuzkoa y Araba/Álava.
// (La Diputación de Bizkaia publica sus convocatorias en la BDNS, que ya se recoge.)
import { pedir, texto, entidades, frase, iso, enParalelo, temasDe, paraDeTexto, norm } from './comun.js';

// ---------- Gipuzkoa ----------
const G = 'https://egoitza.gipuzkoa.eus/es/subvenciones';
const P = '_Subvenciones_WAR_LEEsubvencionesportlet_';

function filasGipuzkoa(html) {
  const tabla = (html.match(/<table class="table" id="tablaSubvenciones">([\s\S]*?)<\/table>/) || [])[1] || '';
  const filas = [];
  for (const tr of tabla.split(/<tr class="(?:odd|even)">/).slice(1)) {
    const tds = tr.split(/<td[^>]*>/).slice(1).map((x) => x.replace(/<\/td>[\s\S]*$/, ''));
    const a = (tds[0] || '').match(/href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    filas.push({
      url: entidades(a[1]),
      titulo: texto(a[2]),
      colectivo: texto(tds[1] || '').split('\n').filter(Boolean),
      plazo: texto(tds[2] || ''),
      fin: iso((texto(tds[3] || '').match(/(\d{2})-(\d{2})-(\d{4})/) || []).slice(1).join('/')),
    });
  }
  return filas;
}

function fichaGipuzkoa(html) {
  const sec = (html.match(/<section class="portlet" id="portlet_Subvenciones_WAR_LEEsubvencionesportlet">([\s\S]*?)<\/section>/) || [])[1] || '';
  const lineas = texto(sec).split('\n').filter((l) => l.length > 2);
  const val = (re) => { const i = lineas.findIndex((l) => re.test(l)); return i >= 0 ? (lineas[i].split(':').slice(1).join(':').trim() || lineas[i + 1] || '') : ''; };
  const inicio = iso((val(/^(Fecha de )?inicio|^Plazo.*desde/i).match(/\d{2}[-/]\d{2}[-/]\d{4}/) || [''])[0].replace(/-/g, '/'));
  return {
    resumen: [...new Set(lineas.filter((l) => l.length > 60))].slice(0, 3).join('\n'),
    organismo: val(/^Departamento|^Órgano/i),
    inicio,
  };
}

export async function gipuzkoa(log) {
  const año = new Date().getFullYear();
  const portada = await pedir(G);
  const materias = [...new Set([...portada.matchAll(/idMateria=([A-Z]{3,5})/g)].map((m) => m[1]))];
  const hoy = new Date().toISOString().slice(0, 10);
  const porUrl = new Map();
  for (const m of materias) {
    for (let p = 1; p <= 10; p++) {
      const url = `${G}?p_p_id=Subvenciones_WAR_LEEsubvencionesportlet&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&${P}myaction=lista&${P}idMateria=${m}&${P}d-7690214-p=${p}&${P}ejercicio=${año}`;
      const filas = filasGipuzkoa(await pedir(url));
      let nuevas = 0;
      for (const f of filas) {
        const clave = (f.url.match(/cserv=([^&]+)/) || [])[1] || f.url;
        if (!porUrl.has(clave)) { porUrl.set(clave, { ...f, materia: m }); nuevas++; }
      }
      if (!filas.length || !nuevas || filas.length < 20) break;
    }
  }
  const todas = [...porUrl.values()];
  const vigentes = todas.filter((f) => !/fuera de plazo|cerrad/i.test(f.plazo) && !(f.fin && f.fin < hoy));
  log(`Gipuzkoa: ${materias.length} materias, ${todas.length} líneas de ayuda, ${vigentes.length} en plazo`);
  const fichas = await enParalelo(vigentes, 3, (f) => pedir(f.url).then(fichaGipuzkoa));
  return vigentes.map((f, k) => {
    const d = fichas[k] && !fichas[k].error ? fichas[k] : {};
    const todo = [f.titulo, d.resumen, f.colectivo.join(' ')].join(' ');
    const clave = (f.url.match(/cserv=([^&]+)/) || [])[1] || norm(f.titulo).slice(0, 40);
    return {
      id: 'gip-' + clave.toLowerCase(),
      titulo: frase(f.titulo),
      organismo: d.organismo ? `Diputación Foral de Gipuzkoa · ${d.organismo}` : 'Diputación Foral de Gipuzkoa',
      ambito: { nivel: 'territorio', nombre: 'Gipuzkoa', terr: 'Gipuzkoa' },
      inicio: d.inicio || null,
      fin: f.fin,
      estadoFuente: f.plazo,
      presupuesto: null,
      cuantia: '',
      resumen: d.resumen || '',
      dirigido: f.colectivo.join('\n'),
      para: paraDeTexto(f.colectivo.join(' ') + ' ' + f.titulo),
      temas: temasDe([f.titulo, (d.resumen || '').slice(0, 300)].join(' ')),
      url: f.url,
      fuentes: [{ nombre: 'Sede electrónica de Gipuzkoa', url: f.url }],
    };
  });
}

// ---------- Araba/Álava ----------
const MES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
function fechaTexto(t) {
  const m = norm(t).match(/(\d{1,2}) de ([a-z]+)(?: de (\d{4}))?/);
  if (!m || !MES[m[2]]) return null;
  const hoy = new Date();
  let y = m[3] ? +m[3] : hoy.getFullYear();
  const d = new Date(Date.UTC(y, MES[m[2]] - 1, +m[1]));
  if (!m[3] && d < new Date(hoy.getTime() - 60 * 864e5)) d.setUTCFullYear(y + 1);
  return d.toISOString().slice(0, 10);
}

export async function araba(log) {
  const html = await pedir('https://web.araba.eus/es/ayudas-en-vigor');
  const out = [];
  const re = /<a[^>]+href="(https:\/\/egoitza\.araba\.eus[^"]*fitxa[^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const url = entidades(m[1]);
    const titulo = texto(m[2]);
    const tras = texto(html.slice(m.index + m[0].length, m.index + m[0].length + 800)).split('\n').find((l) => /hasta|abierto/i.test(l)) || '';
    if (!titulo || out.some((x) => x.url === url)) continue;
    out.push({ url, titulo, fin: fechaTexto(tras), plazo: tras });
  }
  log(`Araba/Álava: ${out.length} ayudas destacadas en vigor`);
  return out.map((f) => ({
    id: 'ara-' + norm(f.url.split('/fitxa/')[1] || f.titulo).replace(/[^a-z0-9]+/g, '-').slice(0, 60),
    titulo: frase(f.titulo),
    organismo: 'Diputación Foral de Álava',
    ambito: { nivel: 'territorio', nombre: 'Araba/Álava', terr: 'Araba/Álava' },
    inicio: null,
    fin: f.fin,
    estadoFuente: f.plazo,
    presupuesto: null,
    cuantia: '',
    resumen: '',
    dirigido: '',
    para: paraDeTexto(f.titulo),
    temas: temasDe(f.titulo),
    url: f.url,
    fuentes: [{ nombre: 'Sede electrónica de Álava', url: f.url }],
  }));
}
