import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,createWriteStream} from 'node:fs';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import net from 'node:net';
import {assertPhase4Database} from './product-database-harness.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),[identityPath,evidence,grep]=process.argv.slice(2),identity=JSON.parse(readFileSync(identityPath,'utf8').replace(/^\uFEFF/,''));
assertPhase4Database(identity.url,identity.id,'DB-BUILD-04');mkdirSync(evidence,{recursive:true});
const env={...process.env,DATABASE_URL:identity.url,DATABASE_SSLMODE:'disable',PGSSLMODE:'disable',PIKA_PHASE4_E2E:'DB-BUILD-04',PIKA_PHASE4_CONTAINER:identity.id};
const apiLog=createWriteStream(path.join(evidence,'api.log'));const api=spawn(process.execPath,['--experimental-test-module-mocks','--import','tsx/esm','src/productDatabaseE2E.mjs'],{cwd:path.join(root,'artifacts/api-server'),env,windowsHide:true,stdio:['pipe','pipe','pipe']});let apiExit;api.on('exit',code=>{apiExit=code;});api.stderr.pipe(apiLog,{end:false});let server,fixture,exitCode=1,testPid=null;
try{
 fixture=await new Promise((resolve,reject)=>{let buffer='';const timeout=setTimeout(()=>reject(Error('API startup timeout')),120000);api.once('error',reject);api.once('exit',code=>{clearTimeout(timeout);reject(Error('API exited '+code));});api.stdout.on('data',chunk=>{apiLog.write(chunk);buffer+=chunk.toString();const match=buffer.match(/PHASE4_READY=(\{[^\n]+\})/);if(match){clearTimeout(timeout);resolve(JSON.parse(match[1]));}});});
 const port=await new Promise(r=>{const socket=net.createServer();socket.listen(0,'127.0.0.1',()=>{const n=socket.address().port;socket.close(()=>r(n));});});
 Object.assign(process.env,{PORT:String(port),API_SERVER_PORT:String(fixture.port),BASE_PATH:'/',VITE_CLERK_PUBLISHABLE_KEY:'pk_test_ZXhhbXBsZS5jb20k'});
 const shopRequire=createRequire(path.join(root,'artifacts/shop-app/package.json'));const {createServer}=await import(pathToFileURL(shopRequire.resolve('vite')).href);
 server=await createServer({configFile:path.join(root,'artifacts/shop-app/vite.config.ts'),server:{host:'127.0.0.1',port,strictPort:true,proxy:{'/api':{target:`http://127.0.0.1:${fixture.port}`,changeOrigin:true}}},clearScreen:false});await server.listen();
 writeFileSync(path.join(evidence,'services.json'),JSON.stringify({runnerPid:process.pid,apiPid:api.pid,fixture,webPort:port,container:identity.id},null,2));
 const require=createRequire(import.meta.url);const tests=spawn(process.execPath,[require.resolve('@playwright/test/cli'),'test','--config',path.join(root,'e2e/product-database.config.mjs'),...(grep?['--grep',grep]:[])],{cwd:root,env:{...env,E2E_BASE_URL:`http://127.0.0.1:${port}`,PIKA_PHASE4_EVIDENCE:evidence,PIKA_PHASE4_FIXTURES:JSON.stringify(fixture)},windowsHide:true,stdio:'inherit'});testPid=tests.pid;exitCode=await new Promise((resolve,reject)=>{tests.once('error',reject);tests.once('exit',resolve);});
}finally{
 if(server)await server.close();if(api.exitCode===null){api.stdin.write('stop\n');await Promise.race([new Promise(r=>api.once('exit',r)),new Promise((_,reject)=>setTimeout(()=>reject(Error('API graceful stop timeout')),15000))]);}apiLog.end();writeFileSync(path.join(evidence,'services-stopped.json'),JSON.stringify({at:new Date().toISOString(),runnerPid:process.pid,apiPid:api.pid,apiExit:api.exitCode??apiExit,viteClosed:true,testPid,testExit:exitCode},null,2));
}
process.exitCode=exitCode??1;
