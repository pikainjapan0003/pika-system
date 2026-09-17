import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,lstatSync,openSync,closeSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const task='DB-BUILD-07-08',db='pika_phase78',password='phase78_synthetic_20260914';
export const phase78Image='postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777';
const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',windowsHide:true,maxBuffer:16000000});
export function assertPhase78Database(url,id,marker){assert.equal(marker,task);assert.match(id,/^[a-f0-9]{64}$/);const m=JSON.parse(docker(['inspect',id]))[0];assert.equal(m.Id,id);assert.equal(m.Config.Labels['pika.task'],task);assert.equal(m.Config.Image,phase78Image);assert.match(m.Name,/^\/pika-db-build78-r[01]-/);assert.ok(m.Config.Env.includes('POSTGRES_DB='+db));if(url){const u=new URL(url);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.username,db);assert.equal(u.password,password);assert.ok([db,'pika_phase78_compat'].includes(u.pathname.slice(1)));assert.equal(m.NetworkSettings.Ports['5432/tcp'][0].HostIp,'127.0.0.1');assert.equal(u.port,m.NetworkSettings.Ports['5432/tcp'][0].HostPort);}return m;}
export function phase78Sql(id,database,sql){assertPhase78Database(null,id,task);assert.ok([db,'pika_phase78_compat'].includes(database));return docker(['exec','-i',id,'psql','-U',db,'-d',database,'-X','-At','-v','ON_ERROR_STOP=1'],sql);}
export function phase78Legacy(id,database=db){return JSON.parse(phase78Sql(id,database,"SELECT jsonb_agg(r ORDER BY entity,id)::text FROM (SELECT 'products' entity,id,to_jsonb(p) body FROM products p WHERE id IN(6,7) UNION ALL SELECT 'orders',id,to_jsonb(o) FROM orders o WHERE id IN(25,26,27,28) UNION ALL SELECT 'stores',id,to_jsonb(s) FROM stores s WHERE id=8 UNION ALL SELECT 'customers',id,to_jsonb(c) FROM customers c WHERE id=6) r"));}
export function compareLegacy(before,after){assert.equal(after.length,8);assert.equal(before.length,8);for(const row of before){const next=after.find(r=>r.entity===row.entity&&r.id===row.id);assert.ok(next);assert.deepEqual(Object.fromEntries(Object.keys(row.body).map(k=>[k,next.body[k]])),row.body);}}
// Read-only validation: exact r0 and r1 author/verifier roots are the entire output grant.
export function assertPhase78IdentityOutput(output){
 assert.equal(typeof output,'string','Identity output must be an absolute JSON path');
 const windowsPath=output.replaceAll('/','\\');
 assert.match(windowsPath,/^[a-z]:\\/i,'Identity output must use an absolute drive path');
 const segments=windowsPath.slice(3).split('\\').filter(Boolean);
 assert.ok(segments.every(s=>s==='.'||(s!=='..'&&!/[ .]$|[<>:"|?*\x00-\x1f]/.test(s)&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s))),'Unsafe identity path component');
 const resolved=path.win32.normalize(windowsPath),key=resolved.toLowerCase();
 const allowedRoots=['phase78-author-r0','phase78-verifier-r0'].map(n=>'c:\\users\\lnovo\\documents\\codex-backups\\product-database-build-20260913\\'+n);
 allowedRoots.push(...['phase78-author-r1','phase78-verifier-r1'].map(n=>'c:\\users\\lnovo\\documents\\codex-backups\\product-database-resume-20260916\\'+n));
 assert.ok(allowedRoots.some(r=>key.startsWith(r+'\\')),'Identity output is outside the exact authorized revision roots');
 assert.equal(path.win32.extname(resolved).toLowerCase(),'.json','Identity output must be JSON');
 // lstat every existing component, including the drive and grant ancestors;
 // reject links/junctions even when the final output does not exist yet.
 for(let current=resolved;;current=path.win32.dirname(current)){
  let entry;try{entry=lstatSync(current);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(entry){
   assert.ok(!entry.isSymbolicLink(),'Identity path cannot traverse a symlink or junction');
   assert.notEqual(current,resolved,'Identity output already exists');
   assert.ok(entry.isDirectory(),'Identity parent must be a directory');
  }
  if(current===path.win32.dirname(current))break;
 }
 return resolved;
}
async function create(output){
 output=assertPhase78IdentityOutput(output);
 const dump=readFileSync('C:/Users/Lnovo/Documents/Codex-backups/product-database-build-20260913/phase0-runtime/phase0-legacy.dump');assert.equal(createHash('sha256').update(dump).digest('hex').toUpperCase(),'19135A07E2D468AC2A764D1C99F9F4305EF167D4E9E4B7B73CBA76AEF98EACE2');
 // Reserve before Docker, and write through this descriptor without reopening.
 // An unsuccessful run leaves its reserved file as evidence; use a fresh path.
 const identityFd=openSync(output,'wx');
 try{
 const revision=output.toLowerCase().includes('product-database-resume-20260916')?'r1':'r0';
 const id=docker(['run','--detach','--name','pika-db-build78-'+revision+'-'+Date.now(),'--label','pika.task='+task,'--label','pika.phase=phase78','--publish','127.0.0.1::5432','--env','POSTGRES_DB='+db,'--env','POSTGRES_USER='+db,'--env','POSTGRES_PASSWORD='+password,phase78Image]).trim();console.error('CREATED_CONTAINER='+id);
 try{let ready=false;for(let i=0;i<60;i++){try{assert.equal(docker(['exec','-e','PGPASSWORD='+password,id,'psql','-h','127.0.0.1','-U',db,'-d',db,'-At','-c','SELECT 1']).trim(),'1');ready=true;break;}catch{await new Promise(r=>setTimeout(r,1000));}}assert.ok(ready);
  const m=assertPhase78Database(null,id,task),port=m.NetworkSettings.Ports['5432/tcp'][0].HostPort;const legacy={};
  for(const database of [db,'pika_phase78_compat']){
   if(database!==db)docker(['exec',id,'createdb','-U',db,database]);
   docker(['exec','-i',id,'pg_restore','-U',db,'-d',database,'--no-owner','--no-acl','--exit-on-error'],dump);
   const before=phase78Legacy(id,database);
   for(const migration of ['0041_product_database_foundation.sql','0042_catalog_search_audit.sql','0043_catalog_listing_pricing.sql','0044_order_items_capture.sql','0045_reviewed_sheet_imports.sql','rollback/0045_reviewed_sheet_imports.sql','0045_reviewed_sheet_imports.sql'])phase78Sql(id,database,readFileSync(path.join(root,'lib/db/migrations',migration)));
   const after=phase78Legacy(id,database);compareLegacy(before,after);legacy[database]={before,after,status:'ALL_ORIGINAL_COLUMNS_EQUAL'};
  }
  const identity={task,id,name:m.Name,image:phase78Image,port,url:`postgresql://${db}:${password}@127.0.0.1:${port}/${db}`,compatUrl:`postgresql://${db}:${password}@127.0.0.1:${port}/pika_phase78_compat`,legacy,migration:'0045_UP_DOWN_UP_BOTH_PASS'};writeFileSync(identityFd,JSON.stringify(identity,null,2));console.log(JSON.stringify({task,id,port,migration:identity.migration}));
 }catch(e){docker(['stop',id]);throw e;}
 }finally{closeSync(identityFd);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [action,marker,arg]=process.argv.slice(2);assert.equal(marker,task);if(action==='create')await create(arg);else if(action==='stop'){assertPhase78Database(null,arg,task);docker(['stop',arg]);console.log(JSON.stringify({id:arg,state:assertPhase78Database(null,arg,task).State}));}else throw Error('Use create|stop DB-BUILD-07-08 path-or-id');}
