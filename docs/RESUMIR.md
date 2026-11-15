# Cómo categorizar ayudas (tarea programada de Claude)

Las reglas de qué va en cada campo están en **`docs/CATEGORIZACION.md`** (resumen de «Eskubat — Instrucciones de categorización de ayudas»). Léelo entero antes de empezar y síguelo al pie de la letra.

## Pasos

1. `git pull`. Lee `cache/pendientes.json`: lista de `{id, h, titulo, organismoSugerido, organismoFuente, archivo, caracteres}` ordenada por fecha de cierre. Lee también `cache/organismos.json` (tabla maestra: `id`, `nombre`, `alias`).
2. Toma las **10 primeras**. Para cada una lee **entero** su `archivo` (`cache/fuentes/<id>.txt`: la ficha oficial y el texto de cada enlace, separados por líneas `### <tipo>: <url>`). Si es largo, léelo por partes hasta el final.
3. **Paso 1, extraer**: trocea la documentación en datos atómicos (una idea por dato) y etiqueta cada uno `CONVOCA`, `CONSISTE`, `CUANTIA`, `PERFIL`, `REQUISITO` o `DESCARTAR`, con `solicitante` si solo afecta a un tipo. Si un dato encaja en dos campos, usa la tabla de desempate.
4. **Paso 2, redactar** cada campo solo con los datos de su etiqueta, con palabras propias y la ortografía corregida.
5. Escribe la lista de fichas en `cache/nuevos.json` y ejecuta `node recolector/comprobar.js`. Corrige cada error que indique y repite hasta que no haya errores. Si una regla no se puede cumplir por cómo es la fuente (o una cifra de la fuente parece errónea), pon `revision_manual: {necesaria: true, motivo: "…"}`.
6. **Títulos**: estandariza los **300 primeros** de `cache/titulos_pendientes.json` (`{original, actual, organismo, id}`) siguiendo `docs/TITULOS.md`, en castellano y euskera, y guárdalos en `cache/titulos_nuevos.json`. `node recolector/comprobar.js` también comprueba los títulos: corrige hasta que no haya errores.
7. **Noticias** (máx. 10 por pasada): `cache/noticias.json` tiene las entradas que parecen noticias y no una convocatoria (`{id, titulo, url, archivo, terminos, candidatosUE, candidatosAyudas}`). Para cada una, lee su `archivo` y decide:
   - `es_ayuda`: en realidad es una convocatoria abierta y solicitable, con su información → se publica como ayuda normal.
   - `duplicada` (con `ayudaId`): habla de una ayuda que ya tenemos (mira `candidatosAyudas` y busca en `publico/ayudas.json`).
   - `añadida`: habla de una ayuda abierta o próxima que **no tenemos** → **búscala en la web** (empieza por `candidatosUE`, que vienen del portal oficial de la Comisión Europea; si no está ahí, busca en el Funding & Tenders Portal, la BDNS/BOE, el BOPV, euskadi.eus o la web del organismo) hasta encontrar la **página oficial de la convocatoria**, y añádela a `cache/ayudas_extra.json` (ver formato abajo). Nunca añadas una ayuda sin página oficial ni con plazo cerrado.
   - `no_es_ayuda`: es información general (resultados, ayudas ya concedidas, préstamos a través de bancos, anuncios sin convocatoria) → no se publica.
   Guarda las decisiones en `cache/noticias_decisiones.json` (añade, no borres las anteriores): `{"<id>": {"accion": "…", "ayudaId": "…", "nota": "una frase con el motivo y la URL oficial si la hay"}}`.
   Además, **siempre que en cualquier documento que leas en esta pasada se mencione una ayuda abierta o próxima que no está en `publico/ayudas.json`**, búscala en la web y, si encuentras su página oficial, añádela igual a `cache/ayudas_extra.json`.
8. Ejecuta `node recolector/incorporar.js`, luego `git add cache publico && git commit -m "Fichas categorizadas (tarea programada)" && git pull --rebase -X theirs && git push`.

## Formato de `cache/ayudas_extra.json` (lista; añade, no borres las anteriores)

```json
{ "id": "extra-msca-raise", "titulo": "título oficial de la convocatoria",
  "url": "https://… página oficial de la convocatoria", "fuente": "Funding & Tenders Portal",
  "organismo": "Unión Europea", "ambito": { "nivel": "ue" },
  "inicio": "2026-10-01", "fin": "2027-01-14",
  "resumen": "2-3 frases con lo que dice la página oficial", "dirigido": "a quién va dirigida",
  "para": ["empresa", "asociacion"], "noticia": "<id de la noticia, si viene de una>" }
```
`ambito.nivel`: `ue` (Unión Europea), `estado` (España), `euskadi`, `territorio` (con `nombre`: Araba/Álava, Bizkaia o Gipuzkoa) o `municipio` (con `nombre`). Fechas `AAAA-MM-DD`; `fin` vacío solo si está abierta todo el año. El recolector descargará la página y sus enlaces y, en la siguiente pasada, la ficha se categoriza como las demás.

## Formato de cada ficha

Una versión completa por cada tipo de solicitante que puede pedir la ayuda (ver «Versiones por tipo de solicitante» en `docs/CATEGORIZACION.md`).

```json
{
  "id": "…", "h": "…",
  "datos": [
    { "etiqueta": "PERFIL", "tipo": "empresa", "colectivo": "Pymes", "dato": "Menos de 50 trabajadores", "cita": "texto literal breve" }
  ],
  "quien_convoca": { "organismo_id": "gv-vivienda", "texto_fuente": "Departamento de Vivienda y Agenda Urbana" },
  "titulo": "Préstamos y subvenciones para rehabilitar edificios de viviendas",
  "titulo_eu": "…",
  "versiones": {
    "particular": {
      "en_que_consiste": "Préstamos y subvenciones para … Sirven para … También …",
      "cuanto_puede_recibir": "Hasta 25.000 € por vivienda.\nPréstamo de hasta 39.000 € por vivienda.",
      "quien_puede_pedirla": [
        { "tipo": "Comunidades de propietarios", "texto": "Comunidades de personas propietarias de edificios con uso principal de vivienda." },
        { "tipo": "Personas propietarias únicas", "texto": "Personas físicas propietarias de todo el edificio." }
      ],
      "requisitos": [
        { "grupo": "Todos", "requisitos": ["Tener licencia municipal de obras."] },
        { "grupo": "Comunidades de propietarios", "requisitos": ["Estar representadas según la Ley de Propiedad Horizontal."] }
      ]
    },
    "asociacion": { "en_que_consiste": "…", "cuanto_puede_recibir": "…", "quien_puede_pedirla": [ … ], "requisitos": [ … ] }
  },
  "versiones_eu": { "particular": { … }, "asociacion": { … } },
  "revision_manual": { "necesaria": false, "motivo": "" }
}
```

- Claves de `versiones`: solo `particular`, `autonomo`, `empresa`, `asociacion`, `ayuntamiento` (Entidad pública). `versiones_eu` tiene las mismas claves, con la misma información en euskera batua correcto y natural (no traducción literal); el grupo común de requisitos se llama «Guztiak».
- Dentro de una versión: un solo colectivo → `quien_puede_pedirla` con un elemento y `requisitos` con un único grupo `"grupo": ""`. Varios colectivos → un elemento por colectivo y grupos de requisitos con el mismo nombre («Todos» para los comunes).
- `quien_convoca.organismo_id`: un `id` de `cache/organismos.json` (el más concreto: el departamento del Gobierno Vasco que convoca, nunca una dirección inferior). Parte de `organismoSugerido` y corrígelo si la documentación dice otra cosa. Si no hay ninguno que coincida, déjalo vacío y marca `revision_manual` con el nombre que aparece en la fuente.
- `cuanto_puede_recibir`: una línea por tramo (separadas por `\n`); si cambia por colectivo dentro de la versión, empieza cada línea por su nombre.
- `titulo` (común a todas las versiones): sigue `docs/TITULOS.md`.
- No incluir fechas ni plazos: la app los calcula aparte.
- Si `cache/pendientes.json` y `cache/titulos_pendientes.json` están vacíos, no hagas nada.
