import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../dist/sw.js',import.meta.url),'utf8');

test('Retiring offline support clears only its own caches and preserves navigation parameters',async()=>{
  const events=new Map(),deleted=[],navigated=[];let waiting=false,claimed=false,unregistered=false;
  const scope='https://wave.example/';
  const self={
    addEventListener:(type,fn)=>events.set(type,fn),
    async skipWaiting(){waiting=true;},
    clients:{
      async claim(){claimed=true;},
      async matchAll(){return [
        {url:scope+'inverter.html?transfer=1&alpha=140',async navigate(url){navigated.push(url);}},
        {url:'https://other.example/',async navigate(url){throw new Error('Must not navigate');}}
      ];}
    },
    registration:{scope,async unregister(){unregistered=true;}}
  };
  const caches={async keys(){return ['waveform-lab-offline-old','waveform-lab-offline-new','unrelated'];},async delete(name){deleted.push(name);}};
  vm.runInNewContext(source,{self,caches});
  let install;events.get('install')({waitUntil(p){install=p;}});await install;
  let activate;events.get('activate')({waitUntil(p){activate=p;}});await activate;
  assert.ok(waiting&&claimed&&unregistered);
  assert.deepEqual(deleted,['waveform-lab-offline-old','waveform-lab-offline-new']);
  assert.deepEqual(navigated,[scope+'inverter.html?transfer=1&alpha=140']);
  assert.equal(events.has('fetch'),false);
});

test('Restored pages do not register offline resources or display installation controls',()=>{
  for(const name of ['index.html','inverter.html','inverter-ideal.html']){
    const html=fs.readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');
    assert.ok(!html.includes('offline.js'));
    assert.ok(!html.includes('offline-status'));
    assert.ok(!html.includes('manifest.webmanifest'));
  }
});
