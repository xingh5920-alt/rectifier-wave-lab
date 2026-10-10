import test from 'node:test';
import assert from 'node:assert/strict';
import {simulation,sample} from '../dist/model.js';
import {simulateInverter} from '../dist/inverter-model.js';
import {isActiveInversion,readTransferredState,stateUrl,inversionUrl,inverterParameters} from '../dist/mode-transfer.js';

const base={circuit:'threeHalf',load:'rle',alpha:120,u2:100,r:20,f:50,l:1000,e:-400,pulseWidth:10};
const read=url=>readTransferredState(url.slice(url.indexOf('?')));

test('Automatic inversion requires supported topology and actual continuous, settled power return',()=>{
  for(const circuit of ['bridge','threeHalf','threeBridge'])assert.equal(isActiveInversion({...base,circuit}),true);
  for(const p of [{...base,circuit:'half'},{...base,circuit:'semi'},{...base,load:'r'},{...base,load:'rl'},{...base,e:0},{...base,e:400},{...base,alpha:90},{...base,alpha:180}])assert.equal(isActiveInversion(p),false);
  const discontinuous={...base,l:1,e:-50},m=simulation(discontinuous).metrics;
  assert.ok(m.ud<0&&m.power>0&&!m.continuous,'negative mean voltage alone can still consume AC power');
  assert.equal(isActiveInversion(discontinuous),false);
  assert.equal(isActiveInversion({...base,alpha:179.99,pulseWidth:1}),false,'a latched conducting path is not periodic inverse commutation');
});

test('Power decision agrees with the actual voltage-current waveform product',()=>{
  for(const p of [base,{...base,circuit:'bridge'},{...base,circuit:'threeBridge'},{...base,l:0},{...base,l:1,e:-50}]){
    let power=0;for(let k=0;k<7200;k++){const s=sample((k+.5)/20,p);power+=s.ud*s.id/7200;}
    const m=simulation(p).metrics;
    assert.ok(Math.abs(power-m.power)<.03*Math.max(1,Math.abs(m.power)),`${p.circuit}, L=${p.l}: actual mean ui matches the integrated power`);
  }
});

test('Transfer round-trip preserves topology, decimals, negative EMF, small/zero L, and view',()=>{
  const view={cycles:1,cursor:293.25,timeAxis:true};
  for(const circuit of ['bridge','threeHalf','threeBridge'])for(const l of [0,.1,1234.567]){
    const p={...base,circuit,l,alpha:135.125,u2:321.5,r:37.25,e:-456.75,f:60,pulseWidth:17.5};
    const state=read(inversionUrl(p,view));assert.deepEqual(state.p,p);
    assert.equal(state.cycles,1);assert.equal(state.cursor,293.25);assert.equal(state.timeAxis,true);
    assert.equal(read(stateUrl('./',p,view,true)).resume,true);
    assert.ok(inversionUrl(p,view).startsWith(l>0?'./inverter.html?':'./inverter-ideal.html?'));
  }
});

test('Detailed half-wave inversion imports exact finite L with source inductance zero and no preset overwrite',()=>{
  const p={...base,l:.1,u2:999,r:777,e:-999,f:60,pulseWidth:23.5,alpha:140.25},state=read(inversionUrl(p));
  const imported=inverterParameters(state);
  assert.deepEqual(imported,{circuit:'threeHalf',lb:0,alpha:140.25,u2:999,r:777,l:.1,e:-999,f:60,pulseWidth:23.5});
  assert.equal(inverterParameters(read(inversionUrl({...p,circuit:'threeBridge'}))).circuit,'threeBridge');
  assert.equal(inverterParameters(read(inversionUrl({...p,l:0}))),null);
  const old=simulation(base).metrics,next=simulateInverter(inverterParameters(read(inversionUrl(base))));
  assert.ok(next.converged&&next.continuous&&!next.failed);
  assert.ok(Math.abs(next.metrics.ud-old.ud)<.3);assert.ok(Math.abs(next.metrics.id-old.id)<.02);
  assert.equal(next.metrics.gamma,0);
});

test('Incomplete or out-of-range URL parameters cannot silently clamp or replace transferred values',()=>{
  assert.equal(readTransferredState(''),null);
  for(const [key,value] of [['circuit','unknown'],['load','unknown'],['alpha','NaN'],['r','0'],['e','-1001'],['l','-1'],['f','55'],['u2',''],['cursor','721']]){
    const q=new URLSearchParams(inversionUrl(base).split('?')[1]);q.set(key,value);assert.equal(readTransferredState(q.toString()),null);
  }
  const q=new URLSearchParams(inversionUrl(base).split('?')[1]);q.delete('pulseWidth');assert.equal(readTransferredState(q.toString()),null);
});
