import './build-client.mjs';
import{readFile,writeFile,mkdir}from'node:fs/promises';
let html=await readFile('public/index.html','utf8');const scripts=[];
for(const match of html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g))scripts.push(await readFile('public/'+match[1].split('?')[0],'utf8'));
html=html.replace(/<script\b[^>]*src="[^"]+"[^>]*><\/script>/g,'');
// Inline CSS: @import … layer(x) becomes an @layer block; asset URLs are rebased to public/ and fonts embedded.
const {readdirSync}=await import('node:fs');
async function inlineCss(file){const dir=file.includes('/')?file.slice(0,file.lastIndexOf('/')+1):'';let css=(await readFile('public/'+file,'utf8')).replace(/url\((["']?)\.\.\/assets\//g,(m,q)=>'url('+q+'assets/');const parts=[];let rest=css;for(const m of css.matchAll(/@import url\(["']?([^"')]+)["']?\)(?:\s+layer\(([\w-]+)\))?;/g)){const inner=await inlineCss(dir+m[1].split('?')[0]);parts.push(m[2]?'@layer '+m[2]+'{\n'+inner+'\n}':inner);rest=rest.split(m[0]).join('');}return parts.join('\n')+'\n'+rest;}
for(const match of [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)]){let css=await inlineCss(match[1].split('?')[0]);const order=css.match(/@layer [\w, -]+;/);if(order)css=order[0]+'\n'+css.split(order[0]).join('');for(const f of readdirSync('public/assets/fonts').filter(f=>f.endsWith('.woff2')))css=css.split('assets/fonts/'+f).join('data:font/woff2;base64,'+(await readFile('public/assets/fonts/'+f)).toString('base64'));html=html.replace(match[0],()=>'<style>'+css+'</style>');}
html=html.replace(/<link rel="preload"[^>]*>/g,'');
let guide=await readFile('public/guide.html','utf8');for(const name of ['home','avlu','upload','photo','profile'])guide=guide.replaceAll('guide/'+name+'.jpg','data:image/jpeg;base64,'+(await readFile('public/guide/'+name+'.jpg')).toString('base64'));
html=html.replace('</body>',()=>'<script>window.SF_PREVIEW=true;window.SF_GUIDE='+JSON.stringify(guide).replaceAll('</script','<\\/script')+';</script>'+scripts.map(s=>'<script>'+s.replaceAll('</script','<\\/script')+'</script>').join('')+'</body>');
for(const [name,mime]of [['mark.svg','image/svg+xml'],['heritage.webp','image/webp'],['archive.webp','image/webp']])html=html.replaceAll('assets/'+name,'data:'+mime+';base64,'+(await readFile('public/assets/'+name)).toString('base64'));
await mkdir('exports',{recursive:true});await writeFile('exports/Saricicek-Family.html',html);console.log('Single-file interactive preview: exports/Saricicek-Family.html. Demo data only; world map works offline.');
