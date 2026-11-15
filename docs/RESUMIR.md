# Cómo categorizar ayudas (tarea programada de Claude)

Las reglas de qué va en cada campo están en **`docs/CATEGORIZACION.md`** (resumen de «Eskubat — Instrucciones de categorización de ayudas»). Léelo entero antes de empezar y síguelo al pie de la letra.

## Pasos

1. `git pull`. Lee `cache/pendientes.json`: lista de `{id, h, titulo, organismoSugerido, organismoFuente, archivo, caracteres}` ordenada por fecha de cierre. Lee también `cache/organismos.json` (tabla maestra: `id`, `nombre`, `alias`).
2. Toma las **10 primeras**. Para cada una lee **entero** su `archivo` (`cache/fuentes/<id>.txt`: la ficha oficial y el texto de cada enlace, separados por líneas `### <tipo>: <url>`). Si es largo, léelo por partes hasta el final.
3. **Paso 1, extraer**: trocea la documentación en datos atómicos (una idea por dato) y etiqueta cada uno `CONVOCA`, `CONSISTE`, `CUANTIA`, `PERFIL`, `REQUISITO` o `DESCARTAR`, con `solicitante` si solo afecta a un tipo. Si un dato encaja en dos campos, usa la tabla de desempate.
4. **Paso 2, redactar** cada campo solo con los datos de su etiqueta, con palabras propias y la ortografía corregida.
5. Escribe la lista de fichas en `cache/nuevos.json` y ejecuta `node recolector/comprobar.js`. Corrige cada error que indique y repite hasta que no haya errores. Si una regla no se puede cumplir por cómo es la fuente (o una cifra de la fuente parece errónea), pon `revision_manual: {necesaria: true, motivo: "…"}`.
6. Traduce también al euskera los **150 primeros** títulos de `cache/titulos_pendientes.json` y guárdalos en `cache/titulos_nuevos.json` como `{"título en castellano": "título en euskera"}` (euskera batua natural, mismas cifras y siglas).
7. Ejecuta `node recolector/incorporar.js`, luego `git add cache publico && git commit -m "Fichas categorizadas (tarea programada)" && git pull --rebase -X theirs && git push`.

## Formato de cada ficha

```json
{
  "id": "…", "h": "…",
  "datos": [
    { "etiqueta": "PERFIL", "solicitante": "Pymes", "dato": "Menos de 50 trabajadores", "cita": "texto literal breve" }
  ],
  "quien_convoca": { "organismo_id": "gv-vivienda", "texto_fuente": "Departamento de Vivienda y Agenda Urbana" },
  "titulo": "Préstamos para rehabilitar edificios de viviendas",
  "en_que_consiste": "Préstamo para … Cubre …",
  "cuanto_puede_recibir": "Hasta 3.000 € por vivienda (50 % del coste).\nPago único.",
  "quien_puede_pedirla": [
    { "tipo": "Personas autónomas", "texto": "Dadas de alta desde hace al menos 6 meses y con domicilio fiscal en Euskadi." },
    { "tipo": "Pymes", "texto": "Con menos de 50 trabajadores y domicilio fiscal en Euskadi." }
  ],
  "requisitos": [
    { "grupo": "Todos", "requisitos": ["Realizar la inversión en un centro de trabajo situado en Euskadi."] },
    { "grupo": "Pymes", "requisitos": ["Realizar una inversión mínima de 10.000 €."] }
  ],
  "tipos": ["autonomo", "empresa"],
  "revision_manual": { "necesaria": false, "motivo": "" },
  "titulo_eu": "…", "en_que_consiste_eu": "…", "cuanto_puede_recibir_eu": "…",
  "quien_puede_pedirla_eu": [{ "tipo": "…", "texto": "…" }],
  "requisitos_eu": [{ "grupo": "…", "requisitos": ["…"] }]
}
```

- `quien_convoca.organismo_id`: un `id` de `cache/organismos.json` (el más concreto: el departamento del Gobierno Vasco que convoca, nunca una dirección inferior). Parte de `organismoSugerido` y corrígelo si la documentación dice otra cosa. Si no hay ninguno que coincida, déjalo vacío y marca `revision_manual` con el nombre que aparece en la fuente.
- Un solo tipo de solicitante: `quien_puede_pedirla` con un elemento (su `texto` es la frase completa) y `requisitos` con un único grupo con `"grupo": ""`.
- `cuanto_puede_recibir`: una línea por tramo o tipo (separadas por `\n`); si cambia por tipo, empieza cada línea por el nombre del tipo («Pymes: hasta 20.000 €.»).
- `titulo` (no lo regula el documento): 4-14 palabras, claro, empieza por el tipo de ayuda; sin año, plazo, organismo, municipio, línea o anexo.
- `tipos`: de `particular`, `autonomo`, `empresa`, `asociacion`, `ayuntamiento` (una comunidad de propietarios cuenta como `particular`).
- Versión en euskera (`*_eu`): la misma información y estructura, en euskera batua correcto y natural (no traducción literal). En `requisitos_eu` el grupo común se llama «Guztiak».
- No incluir fechas ni plazos: la app los calcula aparte.
- Si `cache/pendientes.json` y `cache/titulos_pendientes.json` están vacíos, no hagas nada.
