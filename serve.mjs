import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};
http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const requested=path.resolve(root,`.${pathname==='/'?'/index.html':pathname}`);
  const relative=path.relative(root,requested);
  if(relative.startsWith('..')||path.isAbsolute(relative)){res.writeHead(403).end('Forbidden');return;}
  fs.readFile(requested,(err,body)=>{
    if(err){res.writeHead(404).end('Not found');return;}
    res.writeHead(200,{'Content-Type':types[path.extname(requested)]||'application/octet-stream'});res.end(body);
  });
}).listen(4173,()=>console.log('Clinic Flow is running at http://localhost:4173'));
