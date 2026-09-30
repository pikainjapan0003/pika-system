import assert from 'node:assert/strict';
import {test} from 'node:test';
import {normalizeCatalog,catalogBarcode,catalogDecimal,catalogCost,catalogDate,catalogReason,literalLike} from './index.ts';
test('normalization uses NFKC, punctuation, whitespace and size units',()=>{
 for(const [raw,expected] of [[' ＬＥ ＬＡＢＯ（京都）１５ ml ','le labo 京都 15ml'],['商品 ５ 入','商品 5入'],['A--B  C','a b c'],['!?',''],['50% A_B','50% a_b']])assert.equal(normalizeCatalog(raw),expected);
});
test('barcode keeps leading zero and 26 digits after explicit NFKC',()=>{
 assert.equal(catalogBarcode('００１２３４５６７８９０１２３４５６７８９０１２３４５','REAL'),'001234567890123456789012345');
 assert.equal(catalogBarcode('0','NONE'),'0');for(const [v,s] of [['0','REAL'],['1','NONE'],['1x','REAL']])assert.throws(()=>catalogBarcode(v,s));
});
test('decimal input never silently truncates weight or accepts nonfinite values',()=>{
 assert.equal(catalogDecimal('12.34',2),'12.34');for(const x of ['1.001','-1','NaN','Infinity','10000000000'])assert.throws(()=>catalogDecimal(x,2));
});
test('cost NONE RATE MANUAL preserve original and reject inconsistent derived cost',()=>{
 assert.equal(catalogCost({originalPriceJpy:'100'}).effective,'100.000000000000');
 assert.equal(catalogCost({originalPriceJpy:'100',adjustmentMode:'RATE',adjustmentRate:'.915'.replace('.','0.')}).effective,'91.500000000000');
 assert.equal(catalogCost({originalPriceJpy:'100',adjustmentMode:'MANUAL',effectiveCostJpy:'82'}).effective,'82.000000000000');
 for(const b of [{originalPriceJpy:'100',adjustmentMode:'RATE'},{originalPriceJpy:'100',adjustmentMode:'MANUAL'},{originalPriceJpy:'100',effectiveCostJpy:'99'}])assert.throws(()=>catalogCost(b));
});
test('calendar date rejects normalization and preserves leap days',()=>{
 for(const d of ['2024-02-29','2000-02-29','2026-09-14'])assert.equal(catalogDate(d),d);
 for(const d of ['2023-02-29','1900-02-29','2024-02-31','0000-01-01','2024-2-01'])assert.throws(()=>catalogDate(d));
});
test('LIKE metacharacters remain literal',()=>{assert.equal(literalLike('a%b_c\\d'),'a\\%b\\_c\\\\d');});
test('reason normalization cannot bypass mandatory OTHER details',()=>{
 for(const reasonCode of ['OTHER',' OTHER ',''])assert.throws(()=>catalogReason({reasonCode}));
 assert.deepEqual(catalogReason({reasonCode:' OTHER ',reasonText:' correction '}),{code:'OTHER',text:'correction'});
});
