// Resúmenes con IA (GitHub Models) de cada ayuda, verificados contra el texto de la fuente.
// - La IA solo reescribe: título claro, en qué consiste, cuánto se puede recibir, quién puede pedirla, requisitos.
// - Fechas, plazo, organismo, ámbito y enlaces NO los toca: salen de los datos estructurados.
// - Toda cifra que escriba la IA tiene que aparecer en el texto original; si no, esa frase se descarta.
// - Resultado en caché por huella del texto: solo se vuelve a resumir si la fuente cambia.
import crypto from 'node:crypto';

const URL_API = 'https://models.github.ai/inference/chat/completions';
const MODELOS = ['openai/gpt-4.1-mini', 'openai/gpt-4o-mini'];
const TIPOS = ['particular', 'autonomo', 'empresa', 'asociacion', 'ayuntamiento'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const huella = (t) => crypto.createHash('sha1').update(String(t || '')).digest('hex').slice(0, 16);

const INSTRUCCIONES = `Eres editor de una app que explica ayudas públicas de Euskadi a la ciudadanía. Recibes el texto oficial de varias ayudas y devuelves, para cada una, un resumen claro en castellano correcto (tildes y mayúsculas normales, nada en MAYÚSCULAS salvo siglas).

Reglas estrictas:
- Usa SOLO información que esté en el texto de esa ayuda. No supongas ni completes con conocimiento general. Si un dato no está, deja la lista vacía o el texto vacío.
- No copies avisos legales, códigos internos, números de línea/anexo, referencias a boletines ni enlaces.
- No incluyas fechas, plazos, organismo convocante ni municipio: la app los muestra aparte.
- Cifras: cópialas exactamente como aparecen en el texto (mismos números).

Campos:
- "titulo": qué es la ayuda y para qué, en 4-14 palabras, que se entienda sin leer nada más. Empieza por el tipo ("Ayudas para…", "Subvenciones para…", "Becas para…", "Premios…", "Préstamos para…"). Sin año, sin plazo, sin organismo, sin municipio, sin "Convocatoria de".
- "queEs": 1-3 frases sencillas: qué financia o para qué sirve. Sin repetir el título.
- "cuantia": lista de frases cortas con cuánto puede recibir cada solicitante (importe por persona, por vivienda, porcentaje, máximo...). NUNCA el presupuesto total de la convocatoria. Vacía si el texto no lo dice.
- "quien": lista de quién puede pedirla, en lenguaje llano (p. ej. "Personas desempleadas de 16 a 30 años", "Comunidades de propietarios", "Pymes").
- "requisitos": lista de 0-6 requisitos específicos de esta ayuda que un solicitante debe cumplir. Excluye los genéricos de toda ayuda pública (estar al corriente con Hacienda y Seguridad Social, no tener sanciones, no estar en paraíso fiscal, poder de representación, plan de igualdad, etc.).
- "tipos": de ["particular","autonomo","empresa","asociacion","ayuntamiento"], quién puede pedirla según el texto. "particular" = personas a título individual o familias. Vacía si no se sabe.

Devuelve JSON: {"ayudas":[{"id":"...","titulo":"...","queEs":"...","cuantia":[],"quien":[],"requisitos":[],"tipos":[]}]} con una entrada por cada ayuda recibida, con su mismo id.`;

// Números de un texto, normalizados ("1.500" -> "1500", "25,5" -> "25.5")
function numeros(t) {
  return [...String(t || '').matchAll(/\d[\d.]*(?:,\d+)?/g)]
    .map((m) => m[0].replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.').replace(/\.$/, ''))
    .filter((n) => n.replace(/\D/g, '').length >= 1);
}
// Una frase es válida si todas sus cifras están en la fuente (se ignoran 1 dígito sueltos como "1 vez")
function cifrasOk(frase, fuenteNums) {
  return numeros(frase).every((n) => n.length < 2 || fuenteNums.has(n));
}
const limpia = (x) => String(x || '').replace(/\s+/g, ' ').trim();

export function validar(r, fuente) {
  const nums = new Set(numeros(fuente));
  const out = {};
  const t = limpia(r.titulo);
  if (t && t.length <= 140 && cifrasOk(t, nums) && t !== t.toUpperCase()) out.titulo = t.charAt(0).toUpperCase() + t.slice(1);
  const q = limpia(r.queEs);
  if (q && cifrasOk(q, nums)) out.queEs = q;
  const listas = (arr, max) => (Array.isArray(arr) ? arr : []).map(limpia).filter((x) => x && x.length < 400 && cifrasOk(x, nums)).slice(0, max);
  out.cuantia = listas(r.cuantia, 6).filter((x) => !/presupuesto (total|global)|cr[eé]dito total|dotaci[oó]n total/i.test(x));
  out.quien = listas(r.quien, 6);
  out.requisitos = listas(r.requisitos, 6).filter((x) => !/hacienda|seguridad social|sanci[oó]n|sancionad|para[ií]so fiscal|representaci[oó]n|plan de igualdad|reintegro|obligaciones tributarias/i.test(x));
  out.tipos = (Array.isArray(r.tipos) ? r.tipos : []).filter((x) => TIPOS.includes(x));
  return out;
}

async function llamar(lote, token, log) {
  const contenido = lote.map((x) => `### id: ${x.id}\n${x.texto}`).join('\n\n');
  for (const modelo of MODELOS) {
    for (let intento = 0; intento < 2; intento++) {
      const r = await fetch(URL_API, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelo, temperature: 0.1, max_tokens: 3500, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: INSTRUCCIONES }, { role: 'user', content: contenido }] }),
      }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
      if (r.ok) {
        const j = await r.json();
        try { return { modelo, datos: JSON.parse(j.choices[0].message.content).ayudas || [] }; } catch { log(`Respuesta no válida de ${modelo}`); break; }
      }
      const cuerpo = (await r.text()).slice(0, 200);
      if (r.status === 429) {
        const espera = Number(r.headers?.get?.('retry-after') || 0);
        if (espera && espera < 90) { await sleep(espera * 1000); continue; }
        log(`${modelo}: límite alcanzado (${cuerpo.replace(/\s+/g, ' ')})`);
        break; // probamos con el siguiente modelo
      }
      log(`${modelo}: error ${r.status} ${cuerpo}`);
      await sleep(3000);
    }
  }
  return null;
}

// Resume las ayudas pendientes. fuentes: {id: texto}. cache: {id: {h, r, modelo, fecha}}
export async function resumir(ayudas, fuentes, cache, { token, maxPeticiones = 120, log = console.log } = {}) {
  const pendientes = ayudas
    .filter((a) => fuentes[a.id] && (!cache[a.id] || cache[a.id].h !== huella(fuentes[a.id])))
    .sort((x, y) => (x.fin || '9999').localeCompare(y.fin || '9999'));
  log(`Resúmenes: ${pendientes.length} pendientes de ${ayudas.length}`);
  let peticiones = 0, hechos = 0, descartes = 0;
  let i = 0;
  while (i < pendientes.length && peticiones < maxPeticiones) {
    // Lotes de hasta 3 ayudas y ~16.000 caracteres
    const lote = [];
    let tam = 0;
    while (i < pendientes.length && lote.length < 3) {
      const texto = fuentes[pendientes[i].id].slice(0, 6000);
      if (lote.length && tam + texto.length > 16000) break;
      lote.push({ id: pendientes[i].id, texto });
      tam += texto.length;
      i++;
    }
    peticiones++;
    const res = await llamar(lote, token, log);
    if (!res) { log('Sin cuota disponible: se continúa en la siguiente tanda'); break; }
    for (const x of lote) {
      const r = res.datos.find((d) => String(d.id) === x.id);
      if (!r) { descartes++; continue; }
      cache[x.id] = { h: huella(fuentes[x.id]), r: validar(r, fuentes[x.id]), modelo: res.modelo, fecha: new Date().toISOString().slice(0, 10) };
      hechos++;
    }
    await sleep(4500); // límite por minuto del plan gratuito
  }
  log(`Resúmenes: ${hechos} nuevos en ${peticiones} peticiones (${descartes} sin respuesta)`);
  return hechos;
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
    if (r.cuantia.length) a.cuantia = r.cuantia.join('\n');
    if (r.quien.length) a.dirigido = r.quien.join('\n');
    a.requisitos = r.requisitos;
    a.requisitosGenerales = true;
    if (r.tipos.length) a.para = r.tipos;
    const cifras = [...(a.cuantia || '').matchAll(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?\s*(?:€|euros?)/gi)].map((m) => Number(m[1].replace(/\./g, ''))).filter((x) => x >= 50 && x < 5e6);
    a.importeMax = cifras.length ? Math.max(...cifras) : null;
    a.resumenIA = true;
    n++;
  }
  return n;
}
