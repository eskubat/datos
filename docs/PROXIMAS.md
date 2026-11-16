# Fichas de ayudas próximas (no abiertas)

Una **próxima** es una ayuda que se convocó en años anteriores y que, por su historial, probablemente se abrirá pronto (`previstas` en `publico/ayudas.json`). **Aún no está convocada**: nada de lo que digamos es seguro. La app la muestra en la pestaña «Próximas», con un aviso de que los datos son de la última convocatoria y pueden cambiar.

La tarea programada escribe su ficha con **mucha cautela**. Las reglas de estilo, de organismos y de tipos de solicitante son las de `docs/CATEGORIZACION.md`, con las diferencias de este documento.

## Entrada

`cache/proximas_pendientes.json`: lista de `{id, h, titulo, mes, años, organismo, archivo}`, las que se espera que abran en los próximos tres meses primero. `archivo` (`cache/fuentes_prox/…txt`) empieza con la línea `### Previsión: se convocó en …; suele abrir en el mes …` y sigue con la ficha oficial y los documentos de la **última convocatoria**.

## Pasos (máx. 10 por pasada)

1. Lee entero el `archivo`. Identifica **de qué año es** la convocatoria que describe.
2. Si la documentación no es de la última convocatoria (p. ej. solo hay la de 2023 y sabes que hubo una en 2025), busca la última en el boletín oficial o en la web del organismo y copia lo necesario en `cache/textos_claude/<id>.txt`, como en `docs/RESUMIR.md` (paso 5).
3. Busca si **ya hay noticia de la próxima** (anuncio del organismo, bases nuevas en información pública, presupuesto aprobado): una línea en `nota`.
4. Decide `continuidad`:
   - `probable`: se ha convocado de forma regular y nada indica que se haya suprimido.
   - `dudosa`: solo se convocó una vez, se saltó años, era de un plan ya terminado (p. ej. fondos Next Generation) o la web no da información reciente.
   - `no`: consta que se ha suprimido, sustituido por otra o que el programa terminó → la ficha no se publica (la próxima desaparece de la app). Explica el motivo en `nota`.
5. Redacta la ficha y guárdala en `cache/proximas_nuevas.json`. Ejecuta `node recolector/comprobar.js` y corrige hasta que no haya errores.

## Cómo se escribe (la diferencia con una ficha normal)

- **Todo en pasado o en «suele»**: «En la última convocatoria (2025) se podían pedir…», «Suele dirigirse a…», «Hasta ahora ha pagado…». Nunca en futuro ni como promesa: nada de «se abrirá el…», «podrás pedirla desde…», «recibirás…».
- **Ninguna fecha de apertura**: la app ya muestra el mes en que suele abrir.
- **Cada importe dice de qué convocatoria es**: «En 2025: hasta 3.000 € por persona.» Solo cifras que aparecen en la documentación.
- **Requisitos**: los de la última convocatoria, sin adornos. La app los presenta como «Requisitos de la última convocatoria».
- Si hubo cambios grandes entre convocatorias (importe, a quién se dirige), dilo en una frase en `que_suele`.
- Mismo estilo que el resto: castellano claro, formal-neutro, sin preguntas ni texto de enlaces, y euskera completo.

## Formato de cada ficha

```json
{
  "id": "prev-…",
  "titulo": "título estandarizado (docs/TITULOS.md)",
  "titulo_eu": "…",
  "ultima_convocatoria": 2025,
  "continuidad": "probable | dudosa | no",
  "tipos": ["particular", "asociacion"],
  "que_suele": "Párrafo narrativo de dos o más frases: qué financia, para qué y para quién, en pasado o con «suele».",
  "cuanto_ultima": ["En 2025: …"],
  "quien_suele": ["…"],
  "requisitos_ultimos": ["…"],
  "que_suele_eu": "…", "cuanto_ultima_eu": ["…"], "quien_suele_eu": ["…"], "requisitos_ultimos_eu": ["…"],
  "nota": "Una frase: noticia de la próxima convocatoria, o motivo de «dudosa»/«no». URL si la hay."
}
```

Después, `node recolector/incorporar.js` las aplica a `publico/ayudas.json` (campos `resumen`, `cuantia`, `dirigido`, `requisitos`, `para`, `continuidad`, `ultimaConvocatoria`, `eu`) y las guarda en `cache/proximas.json`.

Cuando la ayuda se convoca de verdad, deja de ser próxima: el recolector la recoge como ayuda abierta y tiene su ficha normal.
