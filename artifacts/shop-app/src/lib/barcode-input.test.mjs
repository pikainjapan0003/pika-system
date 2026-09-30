import assert from 'node:assert/strict';
import test from 'node:test';
import {barcodeLookupInput as input} from './barcode-input.ts';

test('manual input preserves leading zeros, long identifiers and literal double zero',()=>{
  for(const text of ['00','001234567890','00123456789012345678901234','9'.repeat(128)]) {
    assert.deepEqual(input(text).candidates,[text]);
    assert.equal(input(text).requiresPrintedBarcodeConfirmation,false);
  }
});
test('NFKC and outer whitespace follow the existing catalog contract',()=>{
  assert.equal(input(' ００１２３４\n').barcode,'001234');
});
test('invalid and NONE sentinel input cannot become a real lookup',()=>{
  for(const text of ['',' ','0','０','-','12 34','12.3','1e8','ABC','9'.repeat(129)]) {
    assert.throws(()=>input(text),/純數字/);
  }
});
test('UPC-A includes an exact EAN-13 alternative without rewriting the scanned value',()=>{
  const value=input('036000291452','UPC_A');
  assert.equal(value.barcode,'036000291452');
  assert.deepEqual(value.candidates,['036000291452','0036000291452']);
  assert.equal(value.requiresPrintedBarcodeConfirmation,true);
});
test('leading-zero EAN-13 includes its exact UPC-A alternative',()=>{
  assert.deepEqual(input('0036000291452','EAN_13').candidates,['0036000291452','036000291452']);
  assert.deepEqual(input('8413000065504','EAN_13').candidates,['8413000065504']);
});
test('manual, EAN-8 and Code128 never receive UPC/EAN equivalence',()=>{
  for(const format of ['MANUAL','EAN_8','CODE_128']) {
    for(const text of ['036000291452','0036000291452']) assert.deepEqual(input(text,format).candidates,[text]);
  }
});
test('wrong-length camera text does not receive a guessed equivalent',()=>{
  assert.deepEqual(input('123','UPC_A').candidates,['123']);
  assert.deepEqual(input('0012','EAN_13').candidates,['0012']);
});
