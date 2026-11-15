# Eskubat · datos

Recolector diario de ayudas y subvenciones de Euskadi para la app Eskubat. Se ejecuta cada día con GitHub Actions y publica `publico/ayudas.json` (lo que descarga la app) y `publico/estado.json` (resumen por fuente).

## Fuentes

| Fuente | Qué aporta | Cómo se lee |
|---|---|---|
| Open Data Euskadi (`ds_ayudas_subvenciones`) | Procedimientos de ayuda del Gobierno Vasco y sus organismos, con fechas | JSON de datos abiertos (licencia CC BY 4.0) |
| Catálogo de trámites de euskadi.eus | Ayudas con plazo abierto (primera página) y ficha de cada ayuda: objeto, cuantía, destinatarios | HTML |
| Sede electrónica de Gipuzkoa | Líneas de ayuda de la Diputación Foral de Gipuzkoa con plazo | HTML |
| web.araba.eus · Ayudas en vigor | Ayudas destacadas de la Diputación Foral de Álava | HTML |
| BDNS (infosubvenciones.es) | Diputación Foral de Bizkaia, ayuntamientos y resto de convocatorias de Euskadi | API pública |
| Boletines oficiales (BOPV, BOB, BOG, BOTHA) | Convocatorias de los últimos 45 días que no llegan por las otras fuentes (BOPV: Gobierno Vasco y su sector público) | Sumarios en PDF/HTML y texto de cada convocatoria |

Se descartan las subvenciones que no puede solicitar cualquiera (nominativas, directas, convenios con una entidad concreta).

## Acceso a euskadi.eus

Los servidores de euskadi.eus y Open Data Euskadi devuelven "no encontrado" a los clientes que se identifican como robot, también en los archivos de datos abiertos. Mientras Open Data Euskadi responde a nuestra solicitud de acceso, el recolector usa la cabecera de un navegador estándar solo para esos servidores, con un volumen bajo (unas pocas descargas al día). El resto de fuentes se consultan identificándose como `EskubatBot`.
