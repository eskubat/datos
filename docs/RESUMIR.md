# Cómo resumir ayudas (tarea programada de Claude)

1. `git pull` en este repositorio. Lee `cache/pendientes.json`: lista de `{id, h, titulo, texto}` ordenada por fecha de cierre.
2. Toma hasta **40** pendientes (las primeras). Para cada una, lee su `texto` (extracto oficial, ficha y PDF de la convocatoria) y escribe un objeto:

```json
{
  "id": "…", "h": "…",
  "titulo": "Ayudas para …",
  "queEs": "1-3 frases: qué financia o para qué sirve.",
  "cuantia": ["Hasta 3.000 € por persona", "50 % del gasto"],
  "quien": ["Personas jóvenes de 18 a 30 años empadronadas en el municipio"],
  "requisitos": ["…"],
  "tipos": ["particular"],
  "titulo_eu": "…", "queEs_eu": "…", "cuantia_eu": ["…"], "quien_eu": ["…"], "requisitos_eu": ["…"]
}
```

Reglas (las comprueba `recolector/incorporar.js`; lo que no cumpla se descarta):
- Solo información que esté en el `texto`. Nada de conocimiento general ni suposiciones. Si un dato no aparece, lista vacía o cadena vacía.
- Cifras exactamente como en el texto (cada número debe aparecer en el texto).
- `titulo`: 4-14 palabras, claro, empieza por el tipo (Ayudas/Subvenciones/Becas/Premios/Préstamos…), sin año, plazo, organismo, municipio, número de línea o anexo, ni "Convocatoria de". Mayúsculas normales.
- `cuantia`: lo que puede recibir cada solicitante. Nunca el presupuesto total de la convocatoria.
- `requisitos`: 0-6, solo los específicos (no los genéricos de Hacienda, Seguridad Social, sanciones, paraíso fiscal, representación…).
- `tipos`: de `particular`, `autonomo`, `empresa`, `asociacion`, `ayuntamiento`.
- `*_eu`: la misma información en euskera batua correcto y natural (no traducción literal palabra por palabra).
- No incluir fechas ni plazos: la app los calcula aparte.
- Castellano correcto con tildes; sin MAYÚSCULAS salvo siglas.

3. Guarda la lista en `cache/nuevos.json` y ejecuta `node recolector/incorporar.js`.
4. `git add cache publico && git commit -m "Resúmenes (tarea programada)" && git pull --rebase -X theirs && git push`.
5. Si `cache/pendientes.json` está vacío, no hagas nada más.
