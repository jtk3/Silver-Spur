import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

test('exact scoring: dealt natural royal is optimal to hold', async () => {
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
  sandbox.onmessage({data:{cards:[32,36,40,44,48],variant:'jacks',heldMask:31}});
  assert.equal(response.error,undefined);
  assert.ok(response.result.bestMasks.includes(31));
  assert.ok(Math.abs(response.result.loss) < 1e-9);
  assert.ok(response.result.best > 1315 && response.result.best < 1317);
  assert.ok(response.result.alternatives.length === 5);
});
