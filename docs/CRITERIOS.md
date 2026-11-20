# Criterios de filtro de cada ayuda

La bienvenida de la app hace preguntas extra según el tipo de solicitante y los temas: hijos, familia numerosa o monoparental, para qué es la vivienda, sector de actividad e ingresos del hogar. Para que esas respuestas filtren, cada ayuda necesita estos **criterios** como datos. La tarea programada los saca de la documentación.

La app filtra **en suave**: solo oculta una ayuda cuando la persona ha contestado y queda claro que no la cumple. Ante la duda, el criterio se deja en su valor neutro (`false`, `"no"`, `[]`, `null`) y la ayuda se muestra a todos.

## Entrada

`cache/criterios_pendientes.json`: lista de `{id, h, titulo, para, temas, archivo, revisar}`, las abiertas primero. `archivo` es la documentación completa (la misma de la ficha). `revisar: true` quiere decir que ya tenía criterios pero la documentación ha cambiado: compruébalos.

## Pasos (máx. 30 por pasada)

1. Lee la documentación y la ficha publicada de la ayuda.
2. Rellena los criterios **solo con lo que diga la convocatoria**, nunca por intuición.
3. Guárdalos en `cache/criterios_nuevos.json` (lista). Ejecuta `node recolector/comprobar.js` y corrige hasta que no haya errores. `node recolector/incorporar.js` los aplica.

## Formato

```json
{
  "id": "…",
  "hijos": { "exige": true, "edad_max": 14, "minimo": null },
  "familia_numerosa": "no",
  "monoparental": "mas",
  "vivienda": ["alquiler"],
  "sectores": [],
  "ingresos_max": 31000
}
```

- **hijos.exige**: `true` solo si para pedirla hay que tener hijos o menores a cargo (o esperar uno, adoptar o acoger). `edad_max`: edad máxima del hijo que da derecho (menores de 14 → 13; «menores de edad» → 17; «hasta los 25 que conviven» → 25). `minimo`: número mínimo de hijos si lo exige (ayuda por tercer hijo → 3). Si no exige hijos, `false` y los dos a `null`.
- **familia_numerosa** y **monoparental**: `"exige"` si es requisito tenerlo (con título o reconocimiento); `"mas"` si solo da más dinero, más puntos o un límite de ingresos mayor; `"no"` si no influye.
- **vivienda**: solo en ayudas de vivienda; para qué uso es, uno o varios:
  - `alquiler`: pagar el alquiler de tu casa o buscar piso de alquiler (inquilinos, emancipación).
  - `comprar`: comprar la vivienda para vivir en ella.
  - `reformar`: obras en tu casa o en tu edificio (rehabilitación, accesibilidad, ITE, eficiencia, comunidades de propietarios).
  - `arrendar`: alquilar a otros una vivienda que ya tienes: vacía, alquiler social o asequible (Bizigune, Alokaplus, garantías de alquiler).
  - `invertir`: comprar, construir o rehabilitar viviendas para alquilarlas (alquiler protegido).
  Si no es de vivienda, `[]`.
- **sectores**: solo si la ayuda es **exclusiva** de uno o varios sectores (p. ej. solo comercio y hostelería). Si vale para cualquier actividad, `[]`. Valores: `cultura` (artes, audiovisual, música, editorial, diseño), `tecnologia`, `agrario` (agricultura, ganadería, forestal), `comercio`, `industria`, `educacion`, `salud` (también cuidados y servicios sociales), `construccion`, `transporte`, `hosteleria` (también turismo y alojamiento), `pesca`, `alimentacion` (elaboración y transformación de alimentos), `otros`.
- **ingresos_max**: límite de ingresos **anuales del hogar en euros** para poder pedirla. Si depende del número de personas, pon el **más alto** (el de la familia más grande). Si se expresa en IPREM, convierte con el IPREM anual del año de la convocatoria (14 pagas si la convocatoria lo dice). Si no hay límite o no es de una persona física, `null`.

Comprobaciones automáticas: valores permitidos, coherencia de `hijos` y un rango razonable para `ingresos_max`.
