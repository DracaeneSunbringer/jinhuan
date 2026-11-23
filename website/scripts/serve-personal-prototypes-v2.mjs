// Only de-identified artwork is available. No directory serving or private review routes.
import {createServer} from 'node:http'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
const root=resolve('assets/generated/personal-decorations-v2-20261014')
const routes=new Map([['/','index.html'],...['p015-doodle','p015-ssr','p051-doodle','p051-ssr'].map(x=>[`/prototypes/${x}.png`,`prototypes/${x}.png`])])
createServer((req,res)=>{
  const name=routes.get(req.url)
  if(req.method!=='GET'||!name){res.writeHead(404);res.end();return}
  res.writeHead(200,{'Content-Type':name.endsWith('.png')?'image/png':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"})
  res.end(readFileSync(resolve(root,name)))
}).listen(8796,'127.0.0.1',()=>console.log('Prototype-only preview: http://127.0.0.1:8796/'))
