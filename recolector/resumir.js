// Tanda de resúmenes con IA sobre lo ya publicado. Se ejecuta tras el recolector y cada pocas horas.
import fs from 'node:fs';
import { resumir, aplicar } from './resumen.js';

const log = (m) => console.log(new Date().toISOString().slice(11, 19), m);
const leer = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

const pub = leer('publico/ayudas.json', null);
const fuentes = leer('cache/fuentes.json', {});
const cache = leer('cache/resumenes.json', {});
if (!pub) { log('No hay ayudas publicadas'); process.exit(0); }
if (!process.env.GITHUB_TOKEN) { log('Falta GITHUB_TOKEN'); process.exit(1); }

const max = Number(process.env.MAX_PETICIONES || 120);
await resumir(pub.ayudas, fuentes, cache, { token: process.env.GITHUB_TOKEN, maxPeticiones: max, log });
fs.mkdirSync('cache', { recursive: true });
fs.writeFileSync('cache/resumenes.json', JSON.stringify(cache));
const n = aplicar(pub.ayudas, fuentes, cache);
pub.resumidas = n;
fs.writeFileSync('publico/ayudas.json', JSON.stringify(pub));
log(`Ayudas con resumen: ${n} de ${pub.ayudas.length}`);
