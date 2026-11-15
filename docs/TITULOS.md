# Títulos de las ayudas

El título dice en pocas palabras **qué es** la ayuda y **para qué** sirve, para que cualquiera entienda de un vistazo si le interesa. No es una frase ni un titular de noticia.

Estructura: **[Tipo de ayuda] + para/a + [qué financia o a quién va] + (matiz si hace falta)**

1. Empieza SIEMPRE por el tipo de ayuda, en plural salvo que sea una sola: Subvenciones · Ayudas · Becas · Préstamos · Premios · Bonos · Programa (solo si tiene nombre propio) · Concurso. Si el programa tiene nombre propio, va después del tipo: «Ayudas Emantzipa para la emancipación de jóvenes», «Becas Ikertalent para…».
2. Longitud: entre 4 y 12 palabras (máximo 90 caracteres). Sin punto final.
3. Nunca:
   - frases con verbo conjugado («…son proyectos financiados por…», «la UE lanza…», «…reforzará sus apoyos…»);
   - palabras de trámite: Convocatoria, Bases reguladoras, Extracto, Decreto, Resolución, Orden, Acuerdo, Procedimiento, «en régimen de concurrencia competitiva / evaluación individualizada»;
   - año, número de edición, plazo, número de decreto, línea o anexo;
   - el organismo o el municipio (ya salen en la ficha);
   - mayúsculas salvo siglas y nombres propios; erratas ni palabras cortadas.
4. Sé concreto: mejor «Ayudas para cambiar ventanas y aislar la vivienda» que «Ayudas en materia de vivienda».

Ejemplos reales (actual → correcto):
- «La Noche Europea de los Investigadores y la iniciativa Investigadores en las escuelas son proyectos financiados por las Acciones Marie…» → «Ayudas para organizar la Noche Europea de los Investigadores»
- «Bases reguladoras y convocatoria del Concurso de Escaparates» → «Concurso de escaparates para comercios»
- «Convocatoria de de Subvenciones a la ciudadanía para hacer frente al gasto de agua» → «Ayudas para pagar el recibo del agua»
- «Convocatoria para la concesión de sub-venciones para la utilización de las pisci-nas municipales de otros municipios ejer-cicio» → «Ayudas para usar piscinas municipales de otros municipios»
- «Subvenciones destinadas a incentivar la conversión de contratos indefinidos a tiempo parcial en contratos indefinidos a tiempo completo» → «Subvenciones para pasar contratos a tiempo parcial a jornada completa»
- «Programa ONEKIN - Ayudas destinadas a apoyar procesos de maduración de ideas y de definición de proyectos de digitalización» → «Ayudas Onekin para preparar proyectos de digitalización»
- «Subvención a la persona emprendedora que quiera poner en marcha una nueva actividad económica para el alquiler de un local comercial vacío» → «Ayudas para alquilar un local vacío al emprender un negocio»
- «Decreto de Alcaldía 73/, de 9 de octubre de,» → el título no dice nada: redáctalo a partir de la documentación de la ayuda (`cache/fuentes/`, busca por `id`).

5. Si con el título y la documentación no se puede saber qué es (solo un titular de noticia o un decreto sin contenido), no lo inventes: déjalo fuera de `titulos_nuevos.json` y anótalo en el resumen final.
6. Euskera (`eu`): misma estructura, natural, no literal: «Uraren ordainagiria ordaintzeko laguntzak».

Formato de `cache/titulos_nuevos.json`: `{"título original": {"es": "…", "eu": "…"}}` (la clave es el campo `original` de `cache/titulos_pendientes.json`, copiado exactamente).
