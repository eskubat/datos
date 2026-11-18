# Eskubat — Instrucciones de categorización de ayudas

Documento de referencia (Eugenio Igoa, 15/11/2026). La versión completa con tablas está en el PDF original; este es el resumen operativo que siguen la tarea de resumen y las comprobaciones de `recolector/comprobar.js`.

## Regla de oro
Cada dato va en **un solo campo**. Si una frase mezcla datos, se parte. Solo información de la fuente; si falta: «No especificado en la convocatoria». Palabras propias, frases cortas, ortografía siempre correcta.

## Versiones por tipo de solicitante
Quien abre una ayuda solo lee la información que le afecta según su perfil. Por eso cada ficha tiene **una versión completa por cada tipo de perfil** que puede pedirla: `particular`, `autonomo`, `empresa`, `asociacion` y `ayuntamiento` (en la app, «Entidad pública»).

1. Identifica en la documentación todos los colectivos que pueden pedir la ayuda, con su nombre concreto. No uses etiquetas genéricas («Asociaciones», «Particulares», «Autónomos y pymes») si la convocatoria dice algo más preciso.
2. Asigna cada colectivo a uno o varios tipos (equivalencias observadas en las ayudas actuales):
   - **particular**: personas físicas; personas empadronadas en el municipio; personas de 18 años o más; jóvenes; mujeres; mujeres víctimas de violencia de género; pensionistas de la Seguridad Social y sus beneficiarios; madres o padres de familias monoparentales; padre o madre de la unidad familiar; quien tenga la guarda y custodia; acogedor o acogedora; tutor o tutora; personas de una unidad de convivencia; personas sin alojamiento; personas trabajadoras por cuenta ajena; personal investigador en formación; titulares de viviendas; personas físicas con un máximo de 5 viviendas en propiedad.
   - **autonomo**: personas físicas que trabajan por cuenta propia; autónomos.
   - **empresa**: pymes; grandes empresas; empresas privadas; empresas del sector cultural; personas jurídicas privadas; comunidades de bienes con actividad económica; empresas y cooperativas de trabajo asociado; centros tecnológicos y centros de investigación privados.
   - **asociacion**: asociaciones sin ánimo de lucro; asociaciones culturales; centros vascos - euskal etxeak; cofradías de pescadores y sus federaciones; asociaciones profesionales del sector pesquero; organizaciones de productores; organizaciones profesionales; organizaciones sindicales; entidades colaboradoras de Lanbide.
   - **ayuntamiento** (Entidad pública): ayuntamientos; entidades locales; municipios; concejos; mancomunidades; consorcios; agencias de desarrollo local; universidades públicas y centros de investigación públicos.
   - **Varios tipos**: comunidades de propietarios → particular + asociacion · cooperativas de viviendas → particular + asociacion · «Autónomos y pymes» → autonomo + empresa · «Personas físicas o jurídicas» → particular + autonomo + empresa (+ asociacion si no se excluye a las entidades sin ánimo de lucro) · «Personas y empresas que promueven obras privadas» → particular + autonomo + empresa · agentes de la Red Vasca de Ciencia → empresa (privados) y ayuntamiento (públicos) · universidades y centros de formación → ayuntamiento si son públicos; si son privados, empresa con ánimo de lucro y asociacion sin ánimo de lucro (fundaciones, cooperativas de enseñanza, centros concertados y sus asociaciones); si la convocatoria no distingue, los tres · cámaras de comercio, colegios profesionales y demás corporaciones de derecho público → ayuntamiento · diputaciones forales, sociedades y entes públicos → ayuntamiento · «entidades colaboradoras» reconocidas por un organismo → el tipo de cada clase de entidad que la norma permite (empresa, asociacion, ayuntamiento) · personas físicas empleadoras (contratan a alguien) → autonomo.
   - Personas físicas a las que se exige un fin o una actividad profesional (p. ej. «personas físicas que tengan entre sus objetivos fomentar las actividades náuticas») → autonomo, no particular.
   - Si un colectivo no encaja con claridad, asígnalo al más cercano según estas equivalencias. No es motivo de `revision_manual`: solo si ninguna equivalencia se le parece, y entonces propone en el motivo la regla que añadirías aquí.
3. Cada versión se lee sola, como si los demás tipos no existieran: su «En qué consiste» (solo las líneas o actuaciones a las que puede acceder ese tipo), su «Cuánto puede recibir» (solo sus importes), su «Quién puede pedirla» (solo sus colectivos, con el nombre de la fuente) y sus requisitos (los comunes más los suyos). Lo común se repite en cada versión. Nunca se mencionan en una versión importes, requisitos o colectivos de otro tipo.
4. Si varios colectivos del mismo tipo tienen condiciones distintas (p. ej. «Comunidades de propietarios» y «Personas físicas propietarias», ambos particular), dentro de esa versión van agrupados: un elemento por colectivo en «Quién puede pedirla» y grupos de requisitos con su nombre.
5. Si la ayuda es para un solo tipo, hay una sola versión.
6. No son colectivos y nunca van en «Quién puede pedirla»: líneas de ayuda («Inversiones productivas», «Creación de empleo»), obligaciones, tratamientos («Tratamientos odontológicos»), sectores de actividad («Industria alimentaria») ni apartados de la convocatoria («Segundo. Objeto», «Cuarto. Cuantía»).
7. Antes de terminar, comprueba en cada versión que ninguna cifra, colectivo o requisito pertenece a otro tipo y que responde por sí sola a: qué es, cuánto recibo, si puedo pedirla y qué tengo que cumplir.

## Qué no se publica
**Subvenciones nominativas o directas a una entidad concreta** (criterio del responsable, 18/11/2026): las subvenciones nominativas, los convenios y las concesiones directas o extraordinarias ya concedidas a una entidad con nombre (p. ej. las de emergencia por el art. 22.2.c de la Ley 38/2003, o las que la ficha oficial solo destina a una o varias entidades concretas) no se publican, porque nadie más puede pedirlas. No se redacta su ficha: se ocultan con `{"ocultar": true, "motivo": "…"}` en `cache/ajustes_ayudas.json` (ejemplos: gip-laiz02, gip-laga09, bdns-942081). El recolector ya descarta las que lo dicen en el título o en la cabecera del documento.

## Qué va en cada campo
| Dato | Campo |
|---|---|
| Administración que convoca | ¿Quién la convoca? (de la tabla maestra `recolector/organismos.js`) |
| Tipo de ayuda, finalidad, actuaciones y gastos cubiertos (y no cubiertos), líneas y qué cubre cada una — **sin cifras** | ¿En qué consiste? |
| Importe máx./mín./fijo/tramos, % del coste, incrementos, límites, topes al acumular, forma de pago | ¿Cuánto puede recibir? |
| Tipo de solicitante y perfil: edad, ingresos, residencia y antigüedad, situación laboral/familiar, discapacidad; forma jurídica, plantilla, facturación, sector, ubicación, antigüedad | ¿Quién puede pedirla? |
| Condiciones de lo que se solicita (vivienda, proyecto, inversión mínima, contrato), patrimonio, registros, historial con ayudas, exclusiones | Requisitos (por tipo de solicitante) |
| Presupuesto total, dotación, fondos; direcciones inferiores, gestor, cofinanciadores, norma, cargos; plazos, cómo solicitar, documentación, contacto; criterios de valoración, obligaciones posteriores, justificación, recursos; **cómo se calculan los ingresos (qué computa y qué no) y compatibilidad o incompatibilidad con otras ayudas** | Ninguno: descartar |

## ¿En qué consiste?
**Estilo narrativo, en todas las ayudas**: un solo párrafo de frases completas y bien hiladas (las que haga falta para que se entienda; normalmente 2-4, más si la ayuda lo necesita) que expliquen la ayuda a alguien que no sabe nada de ella: qué es, qué paga o para qué sirve y, si hay varias modalidades, cómo encajan entre sí (conectores: «además», «también», «en el caso de…»). Nunca títulos sueltos, fragmentos, listas ni frases copiadas de la web.
Ejemplo: «Préstamos y subvenciones para rehabilitar edificios de viviendas. Sirven para obras que mejoran a la vez la eficiencia energética, la accesibilidad y la seguridad contra incendios del edificio. También pueden incluir mejoras en la fachada o en las zonas comunes.»
Empieza por el tipo de ayuda («Subvención para…», «Préstamo para…»). Sin límite fijo de frases: lo necesario para explicarla bien, sin relleno. Ni €, ni %, ni «hasta N», ni «cuantía/importe»; ni colectivos ni condiciones (empadronados, mayores de, ingresos, renta, dirigida a, podrán solicitar, beneficiari…).

## ¿Cuánto puede recibir?
Primera línea: la cifra clave («Hasta 3.000 € (50 % del coste).»). Una línea por tramo o por tipo de solicitante («Pymes: hasta 20.000 €.»), con el mismo nombre de tipo que en «¿Quién puede pedirla?». Unidad siempre (por persona, por vivienda, al mes…). Sin cifra: «Importe variable según […]», «Ayuda no económica: […]» o «No especificado en la convocatoria». Nunca presupuesto, dotación, crédito disponible ni fondos. Las cifras que el solicitante debe cumplir no van aquí.

## ¿Quién puede pedirla?
Un tipo: una frase con todos los datos del perfil y sus cifras (≤ 250 caracteres). Varios tipos: un elemento por tipo, «Tipo: datos de perfil» (≤ 200 caracteres cada uno, legible por sí solo).

## Requisitos
**Solo condiciones que la persona o entidad solicitante debe cumplir.** Nunca:
- Reglas sobre qué ingresos computan o no computan («No computarán las siguientes cuantías: …», «Se computan los rendimientos…»): son cómo se calcula un límite, no un requisito.
- Listas de compatibilidad o incompatibilidad con otras ayudas («Es compatible con…», «Es incompatible con…»).
- Elementos de una lista sin la frase que la introduce: si una frase acaba en «:» y lo que sigue depende de ella, o se redacta una condición completa que la incluya («Ser titular de un contrato de alquiler o de compraventa de una vivienda libre en Euskadi.») o se descarta la lista entera.
- Encabezados: un elemento de una lista nunca se convierte en título de grupo. Los grupos de requisitos solo son tipos de solicitante («Todos», «Pymes»…).

Lo que no describe a la persona/entidad sino lo que solicita, su vivienda, proyecto, patrimonio o historial. Un tipo: un grupo sin nombre. Varios: grupo «Todos» con los comunes y un grupo por tipo con el mismo nombre que en «¿Quién puede pedirla?». En infinitivo o empezando por «No», una condición por línea, con su cifra, máx. 8 por grupo, sin repetir. Sin requisitos genéricos (Hacienda, Seguridad Social, sanciones) salvo que la fuente los destaque. Ninguna cifra de perfil se repite aquí.

## Ortografía
Tildes, «¿», mayúscula inicial y nombres propios; nada en MAYÚSCULAS salvo siglas; cifras «3.000 €», «1.500,50 €», «50 %»; punto final en frases y requisitos. Se respetan nombres oficiales y topónimos (Bizkaia, Araba/Álava, Donostia / San Sebastián…). Si una cifra parece errónea, no se arregla: `revision_manual`.

## Estilo (igual en todas las ayudas)
- **Sin preguntas.** Las preguntas son los títulos de las secciones de la app; el texto responde. Si la fuente organiza la información en preguntas («¿Qué requisitos deben cumplir…?»), su contenido va al campo que corresponde y la pregunta desaparece.
- **Lenguaje claro y correcto**, con el registro normal de un texto informativo (no coloquial). Solo los términos técnicos o jurídicos se explican o se sustituyen por una expresión más sencilla («subsidiación de intereses» → «la administración paga parte de los intereses»; «régimen de propiedad horizontal» → «edificios divididos en pisos con comunidad de propietarios»). Sin perder exactitud: cifras y condiciones tal cual.
- Mismo tono en todas las fichas: neutro y cercano, sin «usted», sin exclamaciones ni adjetivos promocionales.
- Nunca copiar textos de enlaces o adjuntos («Folleto informativo (PDF, 629 KB)», «Descargar», «Más información»).
- Una frase suelta que funciona como título («Actuaciones subvencionables») no se copia: su contenido se integra en el campo o se redacta como lista.

## Desempate
¿De quién es? → Convoca. ¿Para qué es? → Consiste. ¿Cuánto me dan? → Cuánto. ¿Es para alguien como yo? → Quién. ¿Qué tengo que cumplir? → Requisitos. Si no resuelve ninguna duda: descartar.
Las frases que empiezan en infinitivo de condición («Tener…», «Estar…», «Disponer…», «No haber…», «No tener bienes…») son casi siempre REQUISITO; solo van a «Quién puede pedirla» si describen el perfil de la persona o entidad (edad, residencia, ingresos, situación laboral o familiar, forma jurídica, plantilla).
Ejemplos: «Ingresos inferiores a 30.000 €» → Quién · «Inversión mínima de 5.000 €» → Requisitos · «Alquiler mensual máximo de 900 €» → Requisitos · «No haber recibido esta ayuda en 3 años» → Requisitos · «Se subvenciona el 40 %» → Cuánto · «Dotación de 2.000.000 €» → descartar · «No es subvencionable el IVA» → Consiste · «Compatible sin superar el 100 % del coste» → Cuánto · «Obligación de mantener el empleo 2 años» → descartar · «Línea 1: rehabilitación, hasta 10.000 €, para comunidades de propietarios con edificios anteriores a 1980» → se parte en Consiste / Cuánto / Quién / Requisitos.

## Proceso (dos pasos) y salida
1. **Extraer**: trocear la documentación en datos atómicos y etiquetarlos CONVOCA, CONSISTE, CUANTIA, PERFIL, REQUISITO o DESCARTAR, con el tipo de solicitante si solo afecta a uno.
2. **Redactar** cada campo solo con los datos de su etiqueta.
