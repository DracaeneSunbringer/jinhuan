import {createServer} from 'node:http'
import {readFileSync} from 'node:fs'
const server=createServer((req,res)=>{
 const path=new URL(req.url,'http://127.0.0.1').pathname
 if(path==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}).end(readFileSync('tests/cases/redpacket-recovery-20261015.fixture.html'));return}
 if(!/^\/[a-z0-9-]+\.(js|css)$/.test(path)){res.writeHead(404).end();return}
 try{res.writeHead(200,{'content-type':path.endsWith('.js')?'text/javascript':'text/css','cache-control':'no-store'}).end(readFileSync('public'+path))}catch{res.writeHead(404).end()}
})
server.listen(8799,'127.0.0.1',()=>console.log('红包恢复隔离验收：http://127.0.0.1:8799/；无平台请求或交易'))
process.on('SIGINT',()=>server.close(()=>process.exit()))
