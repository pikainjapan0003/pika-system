import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {assertPhase4Database} from './product-database-harness.mjs';
const [identityPath,servicesPath,output]=process.argv.slice(2),identity=JSON.parse(readFileSync(identityPath,'utf8')),services=JSON.parse(readFileSync(servicesPath,'utf8'));
assertPhase4Database(identity.url,identity.id,'DB-BUILD-04');assert.equal(services.container,identity.id);
const base=`http://127.0.0.1:${services.fixture.port}`,store=services.fixture.store,other=services.fixture.other,results=[];
async function check(name,path,expected,token='e2e-owner-token',verify){const response=await fetch(base+path,{headers:token?{Authorization:'Bearer '+token}:{}});const data=await response.json();assert.equal(response.status,expected,name);if(verify)verify(data);results.push({name,status:response.status,pass:true});}
const route=`/api/stores/${store}/catalog-products`;
await check('unauthenticated',route,401,'');await check('unknown token',route,401,'arbitrary-token');await check('other owner',route,403,'e2e-other-token');await check('cross-store owner',`/api/stores/${other}/catalog-products`,403);
for(const suffix of ['?similarName=x','?similarName=x&similarWeightGrams=1','?similarName=x&similarWeightGrams=1.001&similarOriginalPriceJpy=1','?similarName=x&similarWeightGrams=-1&similarOriginalPriceJpy=1','?similarName=x&similarWeightGrams=1&similarOriginalPriceJpy=NaN','?similarName=x&similarWeightGrams=1&similarOriginalPriceJpy=01','?unexpected=1'])await check('reject '+suffix,route+suffix,400);
await check('complete three-factor count exceeds page size',route+'?similarName='+encodeURIComponent('相似樣本')+'&similarWeightGrams=20.25&similarOriginalPriceJpy=123&pageSize=5&includeArchived=true',200,'e2e-owner-token',data=>{assert.equal(data.total,26);assert.equal(data.items.length,5);assert.ok(data.items.every(p=>p.storeId===store&&p.weightGrams==='20.25'&&/^123(?:\.0+)?$/.test(p.currentCost.originalPriceJpy)));});
await check('different original price has no matches',route+'?similarName='+encodeURIComponent('相似樣本')+'&similarWeightGrams=20.25&similarOriginalPriceJpy=124',200,'e2e-owner-token',data=>assert.equal(data.total,0));
await check('original search path remains scoped',route+'?q='+encodeURIComponent('外店專用商品'),200,'e2e-owner-token',data=>assert.equal(data.total,0));
writeFileSync(output,JSON.stringify({at:new Date().toISOString(),passed:results.length,results},null,2));console.log('API_CHECKS_PASS='+results.length);
