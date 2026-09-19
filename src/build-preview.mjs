import './build-client.mjs';
import {cp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});await cp('public','dist',{recursive:true});
const html=await readFile('dist/index.html','utf8');await writeFile('dist/preview-config.js','window.SF_PREVIEW = true;\n');await writeFile('dist/index.html',html.replace('<script defer src="assets/lucide.min.js">','<script src="preview-config.js"></script><script defer src="assets/lucide.min.js">'));
console.log('Interactive preview built. Fictional data; browser-local persistence.');

await writeFile('dist/mobile.html', `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Mobil önizleme · Sarıçiçek</title><style>body{margin:0;background:#e3e7dc;display:grid;place-items:center;min-height:100vh}iframe{width:390px;height:844px;border:1px solid #cbd3bd;border-radius:22px;box-shadow:0 25px 70px #253a2820;background:#f7f6f1}</style></head><body><iframe src="index.html" title="Telefon görünümü"></iframe></body></html>`);
