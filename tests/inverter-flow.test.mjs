import test from 'node:test';
import assert from 'node:assert/strict';
import {inverterFlowSegments,inverterFlowSVG} from '../dist/inverter-flow.js';
import {inverterPreset} from '../dist/inverter-topologies.js';
import {simulateInverter,inverterSample} from '../dist/inverter-model.js';
test('Single bridge particles follow actual thyristor currents and the signed AC current during handover',()=>{
  const p=inverterPreset('bridge'),result=simulateInverter(p);
  for(const angle of [50,140,146,176,270]){
    const s=inverterSample(result,angle),segments=inverterFlowSegments(s,p);
    for(let j=0;j<4;j++)assert.equal(segments.some(v=>v.id==='VT'+(j+1)+'-in'),s.currents[j]>1e-8);
    const ac=segments.find(v=>v.id==='ac-before-L');
    if(Math.abs(s.phaseCurrents[0])>1e-8){assert.ok(ac);assert.equal(Math.sign(ac.current),-Math.sign(s.phaseCurrents[0]));}
    assert.equal(segments.find(v=>v.id==='dc-top')?.current,s.id);
  }
});
test('Three-phase animation shows all sharing branches and conserves DC collector currents',()=>{
  for(const circuit of ['threeHalf','threeBridge']){
    const p=inverterPreset(circuit),s=inverterSample(simulateInverter(p),176),segments=inverterFlowSegments(s,p);
    const branches=segments.filter(v=>/^VT\d-out$/.test(v.id));
    assert.equal(branches.length,s.currents.filter(i=>i>1e-8).length);
    if(circuit==='threeHalf')assert.equal(segments.find(v=>v.id==='load-before-L').current,s.currents.reduce((a,b)=>a+b,0));
    else assert.ok(Math.abs(segments.find(v=>v.id==='top-rail-2').current-s.id)<1e-6);
  }
});
test('Half-speed slows the particles and zero or undetermined currents produce no fabricated flow',()=>{
  const p=inverterPreset('bridge'),s=inverterSample(simulateInverter(p),176);
  assert.match(inverterFlowSVG(s,p,1),/--flow-duration:0.45s/);assert.match(inverterFlowSVG(s,p,.5),/--flow-duration:0.9s/);
  assert.match(inverterFlowSVG(s,p,.5),/stroke-dasharray="1 21"/);
  assert.equal(inverterFlowSegments({...s,id:0,currents:[0,0,0,0],phaseCurrents:[0]},p).length,0);
  assert.equal(inverterFlowSegments({...s,valid:false},p).length,0);
});
test('Active inversion feedback changes the energy indication without reversing the positive DC current',()=>{
  const p=inverterPreset('bridge'),result=simulateInverter(p),s=Array.from({length:360},(_,a)=>inverterSample(result,a+.5)).find(s=>s.ud<0&&s.id>0);
  assert.ok(s,'The preset must contain a genuine energy-return interval');
  assert.ok(s.ud<0&&s.id>0);
  assert.match(inverterFlowSVG(s,p),/data-flow-mode="feedback"/);
  assert.deepEqual(inverterFlowSegments(s,p).find(v=>v.id==='dc-top').points,[[258,40],[455,40]]);
  assert.deepEqual(inverterFlowSegments({...s,ud:-s.ud},p),inverterFlowSegments(s,p));
});
