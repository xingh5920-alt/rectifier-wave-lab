import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel} from '../dist/dc-inverter-model.js';
import {currentFlowSegments,currentFlowSVG} from '../dist/dc-inverter-flow.js';
import {circuitSVG} from '../dist/dc-inverter-circuit.js';
const find=(type,s,id)=>currentFlowSegments(type,s).find(v=>v.id===id);
test('Actual load flow reverses for R loads, while finite-L current initially keeps its direction through the diode',()=>{
  const r=buildModel('half',{l:0}),rl=buildModel('half',{l:50});
  assert.deepEqual(find('half',r.sample(90),'load-before-L').points,[[320,230],[279,230]]);
  assert.deepEqual(find('half',r.sample(270),'load-before-L').points,[[279,230],[320,230]]);
  const s=rl.sample(180.1);assert.ok(s.u<0&&s.io>0);assert.deepEqual(s.active,['VD2']);
  assert.deepEqual(find('half',s,'load-before-L').points,[[320,230],[279,230]]);
  assert.deepEqual(find('half',s,'leg-2-out').points,[[320,420],[320,360],[370,360],[370,348]]);
  assert.equal(find('half',s,'leg-1-in'),undefined);
  const first=find('half',s,'C1-lower-wire'),second=find('half',s,'C2-upper-wire');
  assert.ok(Math.abs(first.current+s.io/2)<1e-10);assert.ok(Math.abs(second.current-s.io/2)<1e-10);
});
test('Phase-shift zero-voltage interval shows the upper freewheel loop with no DC source current',()=>{
  const s=buildModel('phase',{theta:90,l:50}).sample(110);
  assert.equal(s.u,0);assert.ok(s.io>0);assert.deepEqual(s.active,['V1','VD3']);
  assert.deepEqual(find('phase',s,'bridge-top').points,[[505,60],[195,60]]);
  assert.deepEqual(find('phase',s,'leg-3-out').points,[[505,247],[505,175],[547,175],[547,161]]);
  assert.equal(find('phase',s,'source-top'),undefined);assert.equal(find('phase',s,'source-bottom'),undefined);
  assert.equal(find('phase',s,'leg-2-in'),undefined);assert.equal(find('phase',s,'leg-4-in'),undefined);
});
test('Zero-current bridge has no flow; returning energy reverses the source arrows',()=>{
  const off=buildModel('full',{theta:0}).sample(15);assert.equal(currentFlowSegments('full',off).length,0);
  const s=buildModel('full',{l:50}).sample(180.1);assert.ok(s.power<0&&s.dc<0);
  assert.deepEqual(find('full',s,'source-top').points,[[195,60],[38,60]]);
  assert.deepEqual(find('full',s,'source-bottom').points,[[38,430],[195,430]]);
});
test('Three-phase flow follows each phase current and the floating-star KCL return',()=>{
  const m=buildModel('threeV');
  for(const angle of [15,75,135,195,255,315]){
    const s=m.sample(angle);
    for(let k=0;k<3;k++){
      const segment=find('threeV',s,'phase-'+k);assert.equal(Math.sign(segment.current),Math.sign(s.i[k]));
      assert.equal(Math.sign(segment.points[1][0]-segment.points[0][0]),Math.sign(s.i[k]));
    }
    assert.ok(Math.abs(find('threeV',s,'star-upper').current-s.i[0])<1e-10);
    assert.ok(Math.abs(find('threeV',s,'star-lower').current+s.i[2])<1e-10);
  }
});
test('Parallel resonant flow distinguishes capacitor and RL branch currents, including opposite directions',()=>{
  const m=buildModel('parallel');let found=false;
  for(let angle=0;angle<360;angle+=5){
    const s=m.sample(angle),rl=find('parallel',s,'R-branch-in'),c=find('parallel',s,'C-branch-in');
    if(rl&&c){assert.equal(Math.sign(rl.current),Math.sign(s.il));assert.equal(Math.sign(c.current),Math.sign(s.ic));}
    if(s.il*s.ic<0)found=true;
    assert.ok(Math.abs(s.il+s.ic-s.io)<1e-10);
  }
  assert.ok(found,'Circulating capacitor/load current must remain visible even when branches oppose');
});
test('CSI commutation animates both sharing phases, without inventing unmodeled capacitor current',()=>{
  const m=buildModel('threeI'),s=m.sample(64),segments=currentFlowSegments('threeI',s);
  assert.ok(s.overlap);assert.equal(s.i.filter(i=>Math.abs(i)>1e-8).length,3);
  for(let k=0;k<3;k++)assert.equal(Math.sign(find('threeI',s,'phase-'+k).current),Math.sign(s.i[k]));
  assert.ok(!segments.some(v=>v.id.startsWith('C')));
  assert.ok(find('threeI',s,'bottom-rail-0').points[0][0]>find('threeI',s,'bottom-rail-0').points[1][0]);
});
test('Flow animation stays stable between conduction events, and hiding it preserves the electrical diagram',()=>{
  const m=buildModel('full',{l:0});assert.equal(currentFlowSVG('full',m.sample(30)),currentFlowSVG('full',m.sample(50)));
  const hidden=circuitSVG('full',m.sample(30),m.p,false);assert.ok(hidden.includes('data-device="V1"'));assert.ok(!hidden.includes('animateMotion'));
  const visible=circuitSVG('full',m.sample(30),m.p,true);assert.ok(visible.includes('animateMotion'));assert.ok(visible.includes('dc-flow-still'));
});
