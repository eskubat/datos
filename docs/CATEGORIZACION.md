# Eskubat — Instrucciones de categorización de ayudas

Documento de referencia (Eugenio Igoa, 15/11/2026). La versión completa con tablas está en el PDF original; este es el resumen operativo que siguen la tarea de resumen y las comprobaciones de `recolector/comprobar.js`.

## Regla de oro
Cada dato va en **un solo campo**. Si una frase mezcla datos, se parte. Solo información de la fuente; si falta: «No especificado en la convocatoria». Palabras propias, frases cortas, ortografía siempre correcta.

## Qué va en cada campo
| Dato | Campo |
|---|---|
| Administración que convoca | ¿Quién la convoca? (de la tabla maestra `recolector/organismos.js`) |
| Tipo de ayuda, finalidad, actuaciones y gastos cubiertos (y no cubiertos), líneas y qué cubre cada una — **sin cifras** | ¿En qué consiste? |
| Importe máx./mín./fijo/tramos, % del coste, incrementos, límites, topes al acumular, forma de pago | ¿Cuánto puede recibir? |
| Tipo de solicitante y perfil: edad, ingresos, residencia y antigüedad, situación laboral/familiar, discapacidad; forma jurídica, plantilla, facturación, sector, ubicación, antigüedad | ¿Quién puede pedirla? |
| Condiciones de lo que se solicita (vivienda, proyecto, inversión mínima, contrato), patrimonio, registros, historial con ayudas, incompatibilidades, exclusiones | Requisitos (por tipo de solicitante) |
| Presupuesto total, dotación, fondos; direcciones inferiores, gestor, cofinanciadores, norma, cargos; plazos, cómo solicitar, documentación, contacto; criterios de valoración, obligaciones posteriores, justificación, recursos | Ninguno: descartar |

## ¿En qué consiste?
**Estilo narrativo, en todas las ayudas**: un solo párrafo de 2-4 frases completas y bien hiladas que expliquen la ayuda a alguien que no sabe nada de ella: qué es, qué paga o para qué sirve y, si hay varias modalidades, cómo encajan entre sí (conectores: «además», «también», «en el caso de…»). Nunca títulos sueltos, fragmentos, listas ni frases copiadas de la web.
Ejemplo: «Préstamos y subvenciones para rehabilitar edificios de viviendas. Sirven para obras que mejoran a la vez la eficiencia energética, la accesibilidad y la seguridad contra incendios del edificio. También pueden incluir mejoras en la fachada o en las zonas comunes.»
Empieza por el tipo de ayuda («Subvención para…», «Préstamo para…»). 2-4 frases, máx. 400 caracteres. Ni €, ni %, ni «hasta N», ni «cuantía/importe»; ni colectivos ni condiciones (empadronados, mayores de, ingresos, renta, dirigida a, podrán solicitar, beneficiari…).

## ¿Cuánto puede recibir?
Primera línea: la cifra clave («Hasta 3.000 € (50 % del coste).»). Una línea por tramo o por tipo de solicitante («Pymes: hasta 20.000 €.»), con el mismo nombre de tipo que en «¿Quién puede pedirla?». Unidad siempre (por persona, por vivienda, al mes…). Sin cifra: «Importe variable según […]», «Ayuda no económica: […]» o «No especificado en la convocatoria». Nunca presupuesto, dotación, crédito disponible ni fondos. Las cifras que el solicitante debe cumplir no van aquí.

## ¿Quién puede pedirla?
Un tipo: una frase con todos los datos del perfil y sus cifras (≤ 250 caracteres). Varios tipos: un elemento por tipo, «Tipo: datos de perfil» (≤ 200 caracteres cada uno, legible por sí solo).

## Requisitos
Lo que no describe a la persona/entidad sino lo que solicita, su vivienda, proyecto, patrimonio o historial. Un tipo: un grupo sin nombre. Varios: grupo «Todos» con los comunes y un grupo por tipo con el mismo nombre que en «¿Quién puede pedirla?». En infinitivo o empezando por «No», una condición por línea, con su cifra, máx. 8 por grupo, sin repetir. Sin requisitos genéricos (Hacienda, Seguridad Social, sanciones) salvo que la fuente los destaque. Ninguna cifra de perfil se repite aquí.

## Ortografía
Tildes, «¿», mayúscula inicial y nombres propios; nada en MAYÚSCULAS salvo siglas; cifras «3.000 €», «1.500,50 €», «50 %»; punto final en frases y requisitos. Se respetan nombres oficiales y topónimos (Bizkaia, Araba/Álava, Donostia / San Sebastián…). Si una cifra parece errónea, no se arregla: `revision_manual`.

## Estilo (igual en todas las ayudas)
- **Sin preguntas.** Las preguntas son los títulos de las secciones de la app; el texto responde. Si la fuente organiza la información en preguntas («¿Qué requisitos deben cumplir…?»), su contenido va al campo que corresponde y la pregunta desaparece.
- **Lenguaje de la calle:** frases cortas y directas, palabras comunes en lugar de jerga administrativa («la vivienda donde vives» mejor que «vivienda habitual y permanente» cuando no cambia el sentido; «pedir» mejor que «solicitar» en el texto corrido; «ayuntamiento» mejor que «entidad local»). Sin perder exactitud: cifras, plazos y condiciones tal cual.
- Mismo tono en todas las fichas: neutro y cercano, sin «usted», sin exclamaciones ni adjetivos promocionales.
- Nunca copiar textos de enlaces o adjuntos («Folleto informativo (PDF, 629 KB)», «Descargar», «Más información»).
- Una frase suelta que funciona como título («Actuaciones subvencionables») no se copia: su contenido se integra en el campo o se redacta como lista.

## Desempate
¿De quién es? → Convoca. ¿Para qué es? → Consiste. ¿Cuánto me dan? → Cuánto. ¿Es para alguien como yo? → Quién. ¿Qué tengo que cumplir? → Requisitos. Si no resuelve ninguna duda: descartar.
Ejemplos: «Ingresos inferiores a 30.000 €» → Quién · «Inversión mínima de 5.000 €» → Requisitos · «Alquiler mensual máximo de 900 €» → Requisitos · «No haber recibido esta ayuda en 3 años» → Requisitos · «Se subvenciona el 40 %» → Cuánto · «Dotación de 2.000.000 €» → descartar · «No es subvencionable el IVA» → Consiste · «Compatible sin superar el 100 % del coste» → Cuánto · «Obligación de mantener el empleo 2 años» → descartar · «Línea 1: rehabilitación, hasta 10.000 €, para comunidades de propietarios con edificios anteriores a 1980» → se parte en Consiste / Cuánto / Quién / Requisitos.

## Proceso (dos pasos) y salida
1. **Extraer**: trocear la documentación en datos atómicos y etiquetarlos CONVOCA, CONSISTE, CUANTIA, PERFIL, REQUISITO o DESCARTAR, con el tipo de solicitante si solo afecta a uno.
2. **Redactar** cada campo solo con los datos de su etiqueta.
