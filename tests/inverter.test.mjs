import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateInverter,inverterSample,inverterDefaults,phaseVoltages,selectedCommutation,commutationMeasurements} from '../dist/inverter-model.js';

const healthy=simulateInverter();
test('Healthy active inversion has continuous current, negative voltage and power returned to AC',()=>{
  assert.ok(healthy.converged&&!healthy.failed&&healthy.continuous);
  assert.ok(healthy.metrics.ud<0&&healthy.metrics.id>0&&healthy.metrics.power<0);
  assert.ok(healthy.metrics.gamma>10&&healthy.metrics.gamma<healthy.metrics.beta);
  assert.ok((healthy.metrics.currentMax-healthy.metrics.currentMin)/healthy.metrics.id<.01);
  assert.ok(Math.abs(healthy.metrics.ud-(inverterDefaults.e+inverterDefaults.r*healthy.metrics.id))<.1);
});
test('Source inductance reproduces commutation steps and simultaneous positive valve currents',()=>{
  const event=healthy.events.find(e=>e.success&&e.start>360);
  const s=inverterSample(healthy,(event.start+event.end)/2),active=[event.incoming,...event.outgoing];
  assert.ok(active.every(j=>s.currents[j]>0));
  assert.ok(Math.abs(s.currents.reduce((a,b)=>a+b,0)-s.id)<1e-8);
  const mean=active.reduce((sum,j)=>sum+s.u[j],0)/active.length;
  assert.ok(Math.abs(s.ud-mean)<.1,'large L gives the mean of the two phase voltages during overlap');
  const before=inverterSample(healthy,event.start-.1),after=inverterSample(healthy,event.start+.1);
  assert.ok(Math.abs(after.ud-before.ud)>50,'output voltage has the textbook step at commutation start');
  for(const sample of healthy.samples){assert.ok(sample.currents.every(i=>i>=0));assert.ok(Number.isFinite(sample.ud));}
});
test('Overlap agrees with the independent constant-current integral of the line voltage',()=>{
  const p=healthy.p,e=healthy.events.find(e=>e.success&&e.start>360),s=inverterSample(healthy,e.start);
  const rad=Math.PI/180,coefficient=Math.sqrt(6)*p.u2/(2*2*Math.PI*p.f*p.lb/1000);
  const predicted=coefficient*(Math.cos(p.alpha*rad)-Math.cos((p.alpha+e.gamma)*rad));
  assert.ok(Math.abs(predicted-s.id)/s.id<.003);
});
test('Zero source inductance gives instantaneous commutation and the ideal mean voltage',()=>{
  const r=simulateInverter({lb:0});
  assert.equal(r.metrics.gamma,0);assert.ok(!r.failed);
  const expected=3*Math.sqrt(6)*r.p.u2/(2*Math.PI)*Math.cos(r.p.alpha*Math.PI/180);
  assert.ok(Math.abs(r.metrics.ud-expected)<.2);
  assert.ok(r.samples.every(s=>s.currents.filter(i=>i>1e-6).length<=1));
});
test('Insufficient beta causes incoming current to fall back to zero and outgoing valve to remain on',()=>{
  const r=simulateInverter({alpha:172},'failure'),e=r.events.find(e=>e.failed);
  assert.ok(r.failed&&e.start>360&&e.end>e.deadline);
  assert.equal(r.metrics.gamma,null);assert.equal(e.success,false);
  const atP=inverterSample(r,e.deadline),after=inverterSample(r,e.end+.2);
  assert.ok(atP.currents[e.outgoing[0]]>0&&atP.currents[e.incoming]>0);
  assert.equal(after.currents[e.incoming],0);assert.ok(after.currents[e.outgoing[0]]>0);
  assert.ok(r.samples.at(-1).id>inverterSample(r,360).id);
});
test('Phase voltages are balanced and source-inductance energy is consistent during handover',()=>{
  const p=healthy.p,e=healthy.events.find(e=>e.success&&e.start>360),s=inverterSample(healthy,(e.start+e.end)/2);
  assert.ok(Math.abs(phaseVoltages(s.angle,p).reduce((a,b)=>a+b,0))<1e-10);
  const after=inverterSample(healthy,s.angle+.1),dt=.1/(360*p.f),lb=p.lb/1000;
  for(let j=0;j<3;j++)if(s.mask&(1<<j)){
    const sourceDrop=lb*(after.currents[j]-s.currents[j])/dt;
    assert.ok(Math.abs(sourceDrop-(s.u[j]-s.ud))<.5);
  }
});

test('Selected angle dimensions follow VT1 to VT2 at the observed instant and end at the real phase crossings',()=>{
  const r=simulateInverter({alpha:135}),event=selectedCommutation(r,293),m=commutationMeasurements(event);
  assert.equal(event.incoming,1);assert.deepEqual(event.outgoing,[0]);
  assert.equal(m.natural,150);assert.equal(m.trigger,285);assert.equal(m.p,330);
  assert.equal(m.alpha,135);assert.equal(m.beta,45);
  assert.ok(Math.abs(m.gamma-(event.end-event.start))<1e-10);
  assert.ok(Math.abs(m.margin-(330-event.end))<1e-10);
  for(const point of [m.natural,m.p]){const u=phaseVoltages(point,r.p);assert.ok(Math.abs(u[0]-u[1])<1e-10);}
  assert.equal(selectedCommutation(r,176).incoming,0);
});
test('A gate-to-conduction delay is included in the measured reverse-voltage interval',()=>{
  const r=simulateInverter({alpha:140.03}),event=selectedCommutation(r,176),m=commutationMeasurements(event);
  assert.ok(m.delay>.05&&m.delay<.1);
  assert.ok(Math.abs(m.margin-(m.p-m.end))<1e-10);
  assert.ok(Math.abs(m.margin-(m.beta-m.gamma-m.delay))<1e-10);
  const fault=simulateInverter({alpha:172},'failure'),faultAngle=commutationMeasurements(selectedCommutation(fault,450));
  assert.equal(faultAngle.gamma,null);assert.equal(faultAngle.margin,null);
  assert.ok(commutationMeasurements(selectedCommutation(fault,176)).gamma>0,'healthy first-cycle event keeps its own valid gamma');
});
