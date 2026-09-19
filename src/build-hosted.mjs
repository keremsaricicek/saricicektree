import './build-client.mjs';
import {readdir,readFile,writeFile,mkdir,rm,cp} from 'node:fs/promises';
import {extname} from 'node:path';
import {build} from 'esbuild';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2','.webmanifest':'application/manifest+json'},assets={};
async function walk(dir,root=''){for(const e of await readdir(dir,{withFileTypes:true})){const path=dir+'/'+e.name,url=root+'/'+e.name;if(e.isDirectory())await walk(path,url);else assets[url]={data:(await readFile(path)).toString('base64'),type:types[extname(path)]||'application/octet-stream'};}}
await walk('public');await writeFile('worker/assets.mjs','export const assets='+JSON.stringify(assets)+';\n');
await rm('dist',{recursive:true,force:true});await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await build({entryPoints:['worker/index.mjs'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/server/index.js',minify:true});
await cp('.openai/hosting.json','dist/.openai/hosting.json');await cp('drizzle','dist/.openai/drizzle',{recursive:true});
console.log('Hosted Worker, static assets, D1 migrations and R2 bindings built.');
