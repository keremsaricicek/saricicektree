import {cp,mkdir} from 'node:fs/promises';import {build} from 'esbuild';
await mkdir('public/assets',{recursive:true});
await cp('node_modules/leaflet/dist/leaflet.js','public/assets/leaflet.js');await cp('node_modules/leaflet/dist/leaflet.css','public/assets/leaflet.css');await cp('node_modules/leaflet/dist/images','public/assets/images',{recursive:true});await cp('node_modules/leaflet/LICENSE','public/assets/LEAFLET-LICENSE');
await build({entryPoints:['mobile/bridge.mjs'],bundle:true,format:'iife',target:'es2022',outfile:'public/assets/mobile-bridge.js',minify:true});
