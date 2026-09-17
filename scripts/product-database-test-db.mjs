import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const task='DB-BUILD-03',database='pika_phase3',password='phase3_synthetic_20260914';
const image='postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777';
const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true});
export function assertPhase3Database(url,id,marker){
 assert.equal(marker,task);assert.match(id,/^[a-f0-9]{64}$/);
 const meta=JSON.parse(docker(['inspect',id]))[0];
 assert.equal(meta.Id,id);assert.equal(meta.Config.Labels['pika.task'],task);assert.equal(meta.Config.Labels['pika.phase'],'phase3');assert.match(meta.Name,/^\/pika-db-build03-r0-/);
 assert.ok(meta.Config.Env.includes('POSTGRES_DB='+database));assert.ok(meta.Config.Env.includes('POSTGRES_USER='+database));
 if(url){const u=new URL(url);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.username,database);assert.equal(u.pathname,'/'+database);assert.equal(u.password,password);assert.equal(meta.NetworkSettings.Ports['5432/tcp'][0].HostIp,'127.0.0.1');assert.equal(u.port,meta.NetworkSettings.Ports['5432/tcp'][0].HostPort);}
 return meta;
}
async function create(){
 const dump=readFileSync('C:/Users/Lnovo/Documents/Codex-backups/product-database-build-20260913/phase0-runtime/phase0-legacy.dump');
 assert.equal(createHash('sha256').update(dump).digest('hex').toUpperCase(),'19135A07E2D468AC2A764D1C99F9F4305EF167D4E9E4B7B73CBA76AEF98EACE2');
 const id=docker(['run','--detach','--name','pika-db-build03-r0-'+Date.now(),'--label','pika.task='+task,'--label','pika.phase=phase3','--publish','127.0.0.1::5432','--env','POSTGRES_DB='+database,'--env','POSTGRES_USER='+database,'--env','POSTGRES_PASSWORD='+password,image]).trim();
 console.error('CREATED_CONTAINER='+id);
 try {
  let ready=false;for(let i=0;i<60;i++){try{docker(['exec',id,'pg_isready','-U',database,'-d',database]);ready=true;break;}catch{await new Promise(r=>setTimeout(r,1000));}}assert.ok(ready,'PostgreSQL ready');
  const meta=assertPhase3Database(null,id,task),port=meta.NetworkSettings.Ports['5432/tcp'][0].HostPort;
  const url=`postgresql://${database}:${password}@127.0.0.1:${port}/${database}`;assertPhase3Database(url,id,task);
  docker(['exec','-i',id,'pg_restore','-U',database,'-d',database,'--no-owner','--no-acl','--exit-on-error'],dump);
  const sql=(text)=>docker(['exec','-i',id,'psql','-U',database,'-d',database,'-X','-v','ON_ERROR_STOP=1','-At'],text);
  const legacy=readFileSync('C:/Users/Lnovo/Documents/Codex-backups/product-database-build-20260913/phase0-runtime/legacy-checksums.sql','utf8');
  const before=sql(legacy);
  for(const migration of ['0041_product_database_foundation.sql','rollback/0041_product_database_foundation.sql','0041_product_database_foundation.sql','0042_catalog_search_audit.sql','rollback/0042_catalog_search_audit.sql','0042_catalog_search_audit.sql'])sql(readFileSync(path.join(root,'lib/db/migrations',migration),'utf8'));
  const after=sql(legacy);assert.equal(after,before);
  console.log(JSON.stringify({task,id,name:meta.Name,port,url,db:database,user:database,legacyBefore:before,legacyAfter:after,migrationRoundtrip:'PASS'}));
 }catch(e){docker(['stop',id]);throw e;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [action,marker,id]=process.argv.slice(2);assert.equal(marker,task);
 if(action==='create')await create();
 else if(action==='stop'){assertPhase3Database(null,id,marker);docker(['stop',id]);console.log(JSON.stringify({id,state:assertPhase3Database(null,id,marker).State}));}
 else if(action==='compat'){
  const meta=assertPhase3Database(null,id,marker),port=meta.NetworkSettings.Ports['5432/tcp'][0].HostPort;
  const dump=readFileSync('C:/Users/Lnovo/Documents/Codex-backups/product-database-build-20260913/phase0-runtime/phase0-legacy.dump');
  assert.equal(createHash('sha256').update(dump).digest('hex').toUpperCase(),'19135A07E2D468AC2A764D1C99F9F4305EF167D4E9E4B7B73CBA76AEF98EACE2');
  docker(['exec',id,'psql','-U',database,'-d',database,'-v','ON_ERROR_STOP=1','-c',"CREATE ROLE pika_phase0 LOGIN PASSWORD 'phase0_synthetic_20260913'"]);
  docker(['exec',id,'createdb','-U',database,'-O','pika_phase0','pika_phase0']);
  docker(['exec','-i',id,'pg_restore','-U',database,'-d','pika_phase0','--no-owner','--no-acl','--exit-on-error'],dump);
  // Use the owner role for DDL so unchanged Phase0/preview tests can use their guarded URL.
  for(const migration of ['0041_product_database_foundation.sql','0042_catalog_search_audit.sql'])docker(['exec','-i',id,'psql','-U',database,'-d','pika_phase0','-v','ON_ERROR_STOP=1'],readFileSync(path.join(root,'lib/db/migrations',migration),'utf8'));
  docker(['exec',id,'psql','-U',database,'-d','pika_phase0','-v','ON_ERROR_STOP=1','-c','GRANT ALL ON ALL TABLES IN SCHEMA public TO pika_phase0; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO pika_phase0']);
  console.log(JSON.stringify({id,url:`postgresql://pika_phase0:phase0_synthetic_20260913@127.0.0.1:${port}/pika_phase0`,task,compat:true}));
 }
 else if(action==='inspect')console.log(JSON.stringify(assertPhase3Database(null,id,marker)));
 else throw new Error('Use create|stop|inspect DB-BUILD-03 [exact-id]');
}
