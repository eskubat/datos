# Cómo categorizar ayudas (tarea programada de Claude)

Las reglas de qué va en cada campo están en **`docs/CATEGORIZACION.md`** (resumen de «Eskubat — Instrucciones de categorización de ayudas»). Léelo entero antes de empezar y síguelo al pie de la letra.

## Pasos

1. `git pull`. Lee `cache/pendientes.json`: lista de `{id, h, titulo, organismoSugerido, organismoFuente, archivo, caracteres}` ordenada por fecha de cierre. Lee también `cache/organismos.json` (tabla maestra: `id`, `nombre`, `alias`).
2. Toma las **10 primeras**. Para cada una lee **entero** su `archivo` (`cache/fuentes/<id>.txt`: la ficha oficial y el texto de cada enlace, separados por líneas `### <tipo>: <url>`). Si es largo, léelo por partes hasta el final.
3. **Paso 1, extraer**: trocea la documentación en datos atómicos (una idea por dato) y etiqueta cada uno `CONVOCA`, `CONSISTE`, `CUANTIA`, `PERFIL`, `REQUISITO` o `DESCARTAR`, con `solicitante` si solo afecta a un tipo. Si un dato encaja en dos campos, usa la tabla de desempate.
4. **Paso 2, redactar** cada campo solo con los datos de su etiqueta, con palabras propias y la ortografía corregida.
5. Escribe la lista de fichas en `cache/nuevos.json` y ejecuta `node recolector/comprobar.js`. Corrige cada error que indique y repite hasta que no haya errores. Si una regla no se puede cumplir por cómo es la fuente (o una cifra de la fuente parece errónea), pon `revision_manual: {necesaria: true, motivo: "…"}`.
6. **Títulos**: estandariza los **300 primeros** de `cache/titulos_pendientes.json` (`{original, actual, organismo, id}`) siguiendo `docs/TITULOS.md`, en castellano y euskera, y guárdalos en `cache/titulos_nuevos.json`. `node recolector/comprobar.js` también comprueba los títulos: corrige hasta que no haya errores.
7. Ejecuta `node recolector/incorporar.js`, luego `git add cache publico && git commit -m "Fichas categorizadas (tarea programada)" && git pull --rebase -X theirs && git push`.

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
