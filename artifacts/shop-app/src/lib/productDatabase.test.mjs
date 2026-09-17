import assert from 'node:assert/strict';
import {test} from 'node:test';
import {catalogMoney,formatCatalogNumber,validateCatalogBasics,duplicateDetails,catalogError,trimCatalogWeightZeros} from './productDatabase.ts';
test('display uses exact half-up rounding without losing sign or replacing missing data',()=>{
 assert.deepEqual(catalogMoney(null,'TWD'),{text:'待確認',spoken:'待確認'});
 assert.equal(catalogMoney('-245.5','TWD').text,'−NT$\u00a0245.50');assert.match(catalogMoney('-245.5','TWD').spoken,/負/);
 assert.equal(catalogMoney('0','TWD').text,'NT$\u00a00.00');assert.equal(catalogMoney('1.5').text,'¥\u00a02');
 assert.equal(catalogMoney('9007199254740993.123456789012').text,'¥\u00a09,007,199,254,740,993');
 assert.equal(formatCatalogNumber('15.25',2),'15.25');assert.equal(formatCatalogNumber('NaN',2),'待確認');
});
test('required fields preserve barcode zero semantics and exact weight precision',()=>{
 assert.deepEqual(validateCatalogBasics({name:'商品',barcode:'000001',barcodeStatus:'REAL',weightGrams:'15.25',originalPriceJpy:'99.123456789012'}),{});
 assert.ok(validateCatalogBasics({name:'',barcode:'0',barcodeStatus:'REAL',weightGrams:'15.251',originalPriceJpy:''}).barcode);
 assert.deepEqual(validateCatalogBasics({name:'商品',barcode:'0',barcodeStatus:'NONE',weightGrams:'0',originalPriceJpy:'0'}),{});
});
test('legacy weight suggestions trim only insignificant fractional zeros',()=>{
 for(const [raw,expected] of [['15.000','15'],['15.2300','15.23'],['0.000','0'],['15.25','15.25'],['1000','1000'],['15.001','15.001'],['0.0000010','0.000001'],['9007199254740993.1200','9007199254740993.12'],['',''],['1e3','1e3'],['15,000','15,000'],[' 15.000 ',' 15.000 ']])assert.equal(trimCatalogWeightZeros(raw),expected,raw);
 const input=weightGrams=>({name:'商品',barcode:'001234',barcodeStatus:'REAL',weightGrams,originalPriceJpy:'1000'});
 assert.deepEqual(validateCatalogBasics(input(trimCatalogWeightZeros('15.000'))),{});
 assert.ok(validateCatalogBasics(input(trimCatalogWeightZeros('15.001'))).weightGrams);
 assert.ok(validateCatalogBasics(input(trimCatalogWeightZeros('0.0000010'))).weightGrams);
});
test('duplicate confirmation only trusts actual 409 details and permission errors are not empty results',()=>{
 const data={details:{requiresForceCreate:true,candidates:[{id:4,name:'A',barcode:'00001'}]}};
 assert.deepEqual(duplicateDetails({status:409,data}),[{id:4,name:'A',barcode:'00001'}]);assert.deepEqual(duplicateDetails({status:400,data}),[]);
 assert.match(catalogError({status:403}),/存取權限/);assert.equal(catalogError({status:400,data:{error:'重量錯誤'}}),'重量錯誤');
});
