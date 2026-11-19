import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

function createWorker() {
  const dist = path.resolve('dist');
  let response;
  const sandbox = {
    URL, Uint8Array, Uint32Array, Math, Map, Set, Array, Number, Object, BigInt,
    location: { href: pathToFileURL(path.join(dist,'academy-worker.js')).href },
    postMessage(message) { response = message; },
  };
  sandbox.self = sandbox;
  const context = vm.createContext(sandbox);
  sandbox.importScripts = (...paths) => {
    for (const relative of paths) {
      const source = fs.readFileSync(path.join(dist,relative),'utf8');
      vm.runInContext(source,context,{filename:relative});
    }
  };
  vm.runInContext(fs.readFileSync(path.join(dist,'academy-worker.js'),'utf8'),
    context,{filename:'academy-worker.js'});
  return data => {
    response = undefined;
    sandbox.onmessage({data});
    assert.equal(response?.error, undefined, response?.error || 'No response');
    return response.result;
  };
}
test('exact scoring holds natural royal and recognizes large loss on discarding', () => {
  const score = createWorker();
  const cards = [32,36,40,44,48];
  const played = score({cards,variant:'jacks',heldMask:31});
  assert.ok(played.bestMasks.includes(31));
  assert.equal(played.loss,0);
  assert.ok(played.best > 1315 && played.best < 1317);
  assert.equal(played.alternatives.length,32);
  assert.equal(played.selected.variance > 0, true); // randomized extra royal credit
  const discarded = score({cards,variant:'jacks',heldMask:0});
  assert.ok(discarded.loss > 1300);
  assert.ok(discarded.selected.winChance >= 0 && discarded.selected.winChance <= 1);
});
test('custom paytables change optimal EV and remove the fractional royal bonus', () => {
  const score = createWorker();
  const cards = [32,36,40,44,48];
  const original = score({cards,variant:'jacks',heldMask:31});
  const custom = Object.fromEntries([
    ['royal',800],['straightFlush',50],['fourKind',25],['fullHouse',9],
    ['flush',6],['straight',4],['threeKind',3],['twoPair',2],['jacks',1]
  ]);
  const changed = score({cards,variant:'jacks',heldMask:31,paytable:custom});
  assert.equal(changed.best,800);
  assert.equal(changed.loss,0);
  assert.equal(changed.selected.variance,0);
  assert.ok(original.best > changed.best);
  assert.equal(changed.customPaytable,true);
});
test('deuces wild and double double bonus respect hand-specific payouts', () => {
  const score = createWorker();
  const deuces = score({cards:[0,1,2,3,48],variant:'deuces',heldMask:15});
  assert.equal(deuces.chosen,200);
  assert.equal(deuces.loss,0);
  const doubleDouble = score({cards:[48,49,50,51,0],variant:'doubleDouble',heldMask:31});
  assert.equal(doubleDouble.chosen,400);
  assert.equal(doubleDouble.loss,0);
});
test('invalid custom tables and hold masks are rejected', () => {
  const dist = path.resolve('dist');
  const sandbox = {URL, Uint8Array, Uint32Array,
    location:{href:pathToFileURL(path.join(dist,'academy-worker.js')).href}};
  let message;
  sandbox.self=sandbox;
  sandbox.postMessage=output=>{message=output;};
  const ctx=vm.createContext(sandbox);
  sandbox.importScripts=(...paths)=>paths.forEach(p=>
    vm.runInContext(fs.readFileSync(path.join(dist,p),'utf8'),ctx));
  vm.runInContext(fs.readFileSync(path.join(dist,'academy-worker.js'),'utf8'),ctx);
  sandbox.onmessage({data:{cards:[0,1,2,3,4],variant:'jacks',heldMask:45}});
  assert.match(message.error,/hold mask/);
  sandbox.onmessage({data:{cards:[0,1,2,3,4],variant:'jacks',heldMask:0,paytable:{royal:800}}});
  assert.match(message.error,/paytable/);
});
