import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { get } from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd(), executable=path.join(root,'release/win-unpacked/ChatFlow.exe');
const standalone=path.join(root,'release/win-unpacked/resources/app.asar.unpacked/.next/standalone');
assert.ok(process.platform==='win32'&&existsSync(executable)&&existsSync(path.join(standalone,'server.js')),'Build the Windows package before test:package.');
const listener=createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
const origin=`http://127.0.0.1:${port}`;
const env={...process.env,ELECTRON_RUN_AS_NODE:'1',NODE_ENV:'production',PORT:String(port),HOSTNAME:'127.0.0.1',CHATFLOW_RUNTIME:'electron',CHATFLOW_DESKTOP_ORIGIN:origin};
for(const key of Object.keys(env))if(/SECRET|SERVICE_ROLE|PASSWORD|ACCESS_TOKEN|PRIVATE_KEY|DATABASE_URL/i.test(key))delete env[key];
const child=spawn(executable,[path.join(standalone,'server.js')],{cwd:standalone,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='',failure;child.on('error',error=>{failure=error;});
child.stdout.on('data',bytes=>{output=(output+bytes).slice(-4000);});child.stderr.on('data',bytes=>{output=(output+bytes).slice(-4000);});
try {
  const deadline=Date.now()+30000;let ready=false;
  while(Date.now()<deadline) {
    if(failure)throw failure;
    if(child.exitCode!==null)throw new Error('Packaged runtime exited before startup: '+output);
    try {ready=(await fetch(origin+'/api/health',{signal:AbortSignal.timeout(1000)})).ok;}catch{}
    if(ready)break;await new Promise(resolve=>setTimeout(resolve,200));
  }
  assert.ok(ready,'Packaged runtime startup timed out: '+output);
  assert.deepEqual(await (await fetch(origin+'/api/health')).json(),{ok:true,backend:'supabase'});
  const login=await fetch(origin+'/login');assert.equal(login.status,200);
  const html=await login.text();assert.match(html,/ChatFlow/i);
  const script=html.match(/<script[^>]+src="([^\"]+)"/);assert.ok(script,'Login must reference a packaged client script');
  const asset=await fetch(new URL(script[1],origin));assert.equal(asset.status,200);assert.match(asset.headers.get('content-type')||'',/javascript/);
  const callback=await fetch(origin+'/auth/callback',{redirect:'manual'});
  assert.equal(callback.status,307);assert.equal(callback.headers.get('location'),origin+'/?auth_error=confirmation');
  const foreignListener=await new Promise((resolve,reject)=>{
    get(origin+'/auth/callback',{headers:{Host:'foreign.example.test'}},response=>{response.resume();resolve(response.statusCode);}).on('error',reject);
  });
  assert.equal(foreignListener,403);
  for(const [route,method] of [['/api/account','DELETE'],['/api/attachments/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/discard','POST']]) {
    assert.equal((await fetch(origin+route,{method,headers:{Origin:'https://foreign.example.test'}})).status,403);
    const unauthenticated=await fetch(origin+route,{method,headers:{Origin:origin}});
    assert.equal(unauthenticated.status,401,`${route}: ${await unauthenticated.text()}`);
  }
  console.log('PASS packaged Electron Node runtime: health, login HTML, local callback redirect, foreign listener/origin rejection and unauthenticated self-delete/cleanup denial. No live account mutations.');
} finally {
  child.kill();
  if(child.exitCode===null)await new Promise(resolve=>child.once('exit',resolve));
}
