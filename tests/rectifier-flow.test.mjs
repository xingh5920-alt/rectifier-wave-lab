import test from 'node:test';
import assert from 'node:assert/strict';
import {circuits,sample} from '../dist/model.js';
import {rectifierFlowSegments,rectifierFlowSVG} from '../dist/rectifier-flow.js';
const defaults={load:'r',alpha:30,u2:100,r:20,f:50,l:100,e:50,pulseWidth:10};
test('All five rectifiers show real conducting valves, positive load current and no current in blocked paths',()=>{
 for(const {id:circuit} of circuits){
  const p={...defaults,circuit};let lit=false;
  for(let angle=.5;angle<360;angle+=10){
   const s=sample(angle,p),flow=rectifierFlowSegments(s,p);
   if(!s.active.length){assert.equal(flow.length,0);continue;}lit=true;
   for(const name of s.active)assert.ok(flow.some(x=>x.id===name+'-device'),circuit+': '+name);
   for(const segment of flow.filter(x=>/^(VT|D)\d-device$/.test(x.id)))assert.ok(s.active.includes(segment.id.replace('-device','')));
   const load=flow.find(x=>x.id==='load-device');assert.ok(load.points[0][1]<load.points.at(-1)[1]);assert.equal(load.current,s.id);
  }
  assert.ok(lit,circuit);
 }
});
test('Semi-controlled bridge freewheels through one leg without showing AC source flow',()=>{
 const p={...defaults,circuit:'semi',load:'rl',alpha:60,l:500};
 const s=Array.from({length:360},(_,a)=>sample(a+.5,p)).find(s=>s.freewheel&&s.id>1e-8);assert.ok(s);
 const flow=rectifierFlowSegments(s,p);assert.ok(flow.find(x=>x.id==='load-device'));assert.ok(!flow.find(x=>x.id==='ac-source-device'));
 for(const name of s.active)assert.ok(flow.some(x=>x.id===name+'-device'));
 assert.doesNotMatch(rectifierFlowSVG(s,p),/data-flow-mode="feedback"/);
});
test('Single bridge source flow follows actual signed AC current, including return-power intervals',()=>{
 const p={...defaults,circuit:'bridge',load:'rle',alpha:120,l:1000,e:-400};
 let returns=0;
 for(let a=.5;a<360;a+=5){const s=sample(a,p),flow=rectifierFlowSegments(s,p);if(!flow.length)continue;
  const ac=flow.find(x=>x.id==='ac-source-device');assert.equal(ac.current,s.input);assert.equal(Math.sign(ac.points[0][0]-ac.points.at(-1)[0]),Math.sign(s.input));
  if(s.ud*s.id<0){returns++;assert.match(rectifierFlowSVG(s,p),/data-flow-mode="feedback"/);}
 }
 assert.ok(returns>0);
});
test('Three-phase rectifier collector rails conserve the actual entering and leaving phase currents',()=>{
 for(const circuit of ['threeHalf','threeBridge'])for(let a=5;a<360;a+=30){
  const p={...defaults,circuit},s=sample(a,p),flow=rectifierFlowSegments(s,p);if(!flow.length)continue;
  if(circuit==='threeBridge'){
   assert.equal(flow.find(x=>x.id==='top-rail-2').current,s.id);
   assert.equal(flow.find(x=>x.id==='bottom-rail-2').current,-s.id);
   assert.ok(Math.abs(flow.filter(x=>x.id.startsWith('phase-')).reduce((sum,x)=>sum+x.current,0))<1e-8);
  }else assert.equal(flow.find(x=>x.id==='neutral-return').current,s.id);
 }
});
