import './build-client.mjs';
import{readFile,writeFile,mkdir}from'node:fs/promises';
let html=await readFile('public/index.html','utf8');const scripts=[];
for(const match of html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g))scripts.push(await readFile('public/'+match[1].split('?')[0],'utf8'));
html=html.replace(/<script\b[^>]*src="[^"]+"[^>]*><\/script>/g,'');
for(const match of [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)])html=html.replace(match[0],'<style>'+await readFile('public/'+match[1].split('?')[0],'utf8')+'</style>');
html=html.replace('</body>','<script>window.SF_PREVIEW=true;</script>'+scripts.map(s=>'<script>'+s.replaceAll('</script','<\\/script')+'</script>').join('')+'</body>');
for(const [name,mime]of [['mark.svg','image/svg+xml'],['heritage.webp','image/webp'],['archive.webp','image/webp']])html=html.replaceAll('assets/'+name,'data:'+mime+';base64,'+(await readFile('public/assets/'+name)).toString('base64'));
await mkdir('exports',{recursive:true});await writeFile('exports/Saricicek-Family.html',html);console.log('Single-file interactive preview: exports/Saricicek-Family.html. Demo data only; world map works offline.');
