# Cómo resumir ayudas (tarea programada de Claude)

El objetivo: que cada ayuda de la app diga, en su sección correcta y en lenguaje claro, **qué es, cuánto se puede recibir, quién puede pedirla y qué requisitos hay**, a partir de TODA la documentación oficial de la ayuda (ficha y enlaces: bases, orden o decreto, boletín, normativa, PDF de la convocatoria…).

## Pasos

1. `git pull` en este repositorio. Lee `cache/pendientes.json`: lista de `{id, h, titulo, archivo, caracteres}` ordenada por fecha de cierre.
2. Toma las **10 primeras**. Para cada una:
   1. Lee **entero** su `archivo` (`cache/fuentes/<id>.txt`). Contiene la ficha oficial y el texto de cada enlace, separados por líneas `### <tipo>: <url>`. Si es largo, léelo por partes hasta el final.
   2. **Primero** escribe `resumenCompleto`: un resumen detallado (200-600 palabras) de lo que dicen todos los documentos: objeto, actuaciones financiables, tipos de solicitante, requisitos de cada tipo, importes y porcentajes de cada línea o tipo, incompatibilidades y obligaciones relevantes. Si los documentos se contradicen, manda la convocatoria/bases más reciente.
   3. **Después**, solo a partir de ese resumen, rellena las secciones (cada dato en su sección, sin repetirlo en otra):
      - `titulo`: 4-14 palabras, claro, empieza por el tipo (Ayudas/Subvenciones/Becas/Premios/Préstamos…). Sin año, plazo, organismo, municipio, número de línea o anexo, ni "Convocatoria de". Mayúsculas normales.
      - `queEs`: 2-4 frases: qué financia y para qué sirve (las actuaciones o gastos que cubre). **Nunca** requisitos, beneficiarios ni importes aquí.
      - `quien`: quién puede **pedirla**: tipos de solicitante con su condición principal ("Comunidades de propietarios", "Propietarios únicos de un edificio de viviendas", "Personas de 18 a 35 años empadronadas en Euskadi"). No es una lista de requisitos.
      - `requisitos`: condiciones que hay que cumplir, **agrupadas por tipo de solicitante cuando cambian según quién la pida**. Los que valen para todos van en un grupo `"para": "Todas las solicitudes"`. Requisitos del edificio, la actividad o el proyecto también van aquí. Excluye los genéricos de toda ayuda pública (Hacienda, Seguridad Social, sanciones, paraíso fiscal, representación, plan de igualdad).
      - `cuantia`: lo que puede recibir **cada solicitante** (importe, porcentaje, máximo por vivienda/persona/proyecto), agrupado por línea o tipo de solicitante si cambia. Nunca el presupuesto total de la convocatoria.
      - `tipos`: de `particular`, `autonomo`, `empresa`, `asociacion`, `ayuntamiento`. Una comunidad de propietarios cuenta como `particular`.
      - Versión en euskera batua correcto y natural (no literal): `titulo_eu`, `queEs_eu`, `quien_eu`, `requisitos_eu`, `cuantia_eu` con la misma estructura.

```json
{
  "id": "…", "h": "…",
  "resumenCompleto": "…",
  "titulo": "Préstamos y ayudas para rehabilitar edificios de viviendas",
  "queEs": "Financia obras de rehabilitación integral de edificios…",
  "quien": [{ "para": "", "items": ["Comunidades de propietarios", "Propietarios únicos de un edificio de viviendas"] }],
  "requisitos": [
    { "para": "Todas las solicitudes", "items": ["El edificio debe tener uso principal de vivienda (70 % de la superficie)", "Licencia municipal de obras"] },
    { "para": "Comunidades de propietarios", "items": ["Acuerdo de la junta de propietarios"] }
  ],
  "cuantia": [
    { "para": "Préstamos", "items": ["Hasta 39.000 € por vivienda"] },
    { "para": "Subvenciones", "items": ["Hasta 25.000 € por vivienda"] }
  ],
  "tipos": ["particular"],
  "titulo_eu": "…", "queEs_eu": "…", "quien_eu": [], "requisitos_eu": [], "cuantia_eu": []
}
```

Reglas (las comprueba `recolector/incorporar.js`; lo que no cumpla se descarta):
- Solo información que esté en el `archivo`. Nada de conocimiento general ni suposiciones. Si un dato no aparece, lista vacía.
- Cifras exactamente como en los documentos (cada número debe aparecer en el texto).
- Usa un solo grupo con `"para": ""` cuando la información no cambia según el solicitante.
- No incluir fechas ni plazos: la app los calcula aparte.
- Castellano correcto con tildes; sin MAYÚSCULAS salvo siglas; sin guiones ni a), 1. al principio de las frases.

3. Guarda la lista en `cache/nuevos.json` y ejecuta `node recolector/incorporar.js`.
4. `git add cache publico && git commit -m "Resúmenes (tarea programada)" && git pull --rebase -X theirs && git push`.
5. Si `cache/pendientes.json` está vacío, no hagas nada más.
