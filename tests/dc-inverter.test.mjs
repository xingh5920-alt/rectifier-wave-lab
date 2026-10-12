import test from 'node:test';
import assert from 'node:assert/strict';
import {TOPOLOGIES,DEFAULTS,parameters,voltageState,buildModel,threeCurrent} from '../dist/dc-inverter-model.js';
import {circuitSVG} from '../dist/dc-inverter-circuit.js';

const near=(actual,expected,tol=1e-5)=>assert.ok(Math.abs(actual-expected)<=tol*Math.max(1,Math.abs(expected)),`${actual} != ${expected}`);

test('Half bridge and full bridge resistive RMS and fundamental agree with Fourier results',()=>{
  for(const type of ['half','full']){
    const m=buildModel(type,{ud:240,r:12,l:0});const factor=type==='half'?.5:1;
    near(m.metrics.urms,240*factor);near(m.metrics.irms,20*factor);
    near(m.metrics.u1,4*240*factor/(Math.PI*Math.SQRT2),1e-6);
    near(m.metrics.power,(240*factor)**2/12);
  }
});
test('Phase-shift pulse width controls RMS and fundamental, including both endpoints',()=>{
  for(const theta of [0,30,60,90,120,180]){
    const m=buildModel('phase',{ud:200,r:20,l:0,theta});
    near(m.metrics.urms,200*Math.sqrt(theta/180));
    near(m.metrics.u1,2*Math.SQRT2*200/Math.PI*Math.sin(theta*Math.PI/360),1e-6);
    near(m.sample(10).g[0]+m.sample(10).g[1],1);near(m.sample(10).g[2]+m.sample(10).g[3],1);
    if(theta===0)assert.equal(m.sample(0).active.length,0);
  }
});
test('Full-bridge decimal widths match phase control and keep RL current continuous at fractional edges',()=>{
  for(const theta of [0,.01,60.125,120.25,179.999,180]){
    const full=buildModel('full',{theta,l:50}),phase=buildModel('phase',{theta,l:50});
    near(full.metrics.urms,200*Math.sqrt(theta/180),1e-12);
    near(full.metrics.u1,2*Math.SQRT2*200/Math.PI*Math.sin(theta*Math.PI/360),1e-12);
    for(const angle of [0,theta/2,theta+.001,180+theta/2]){
      near(full.sample(angle).u,phase.sample(angle).u);near(full.sample(angle).io,phase.sample(angle).io);
    }
    if(theta>0&&theta<180){
      assert.equal(full.sample(theta/2).u,200);assert.equal(full.sample(theta+.0001).u,0);
      near(full.sample(theta-.000001).io,full.sample(theta+.000001).io,1e-5);
    }
  }
  assert.equal(buildModel('full').p.theta,180);
});
test('Finite-L VSI current is continuous at switch events and obeys its differential equation',()=>{
  for(const type of ['half','full','phase','threeV']){
    const m=buildModel(type);const dt=1e-5;
    for(const a of [0,60,120,180,240,300]){
      const before=m.sample(a-dt),after=m.sample(a+dt);
      before.i.forEach((i,k)=>near(i,after.i[k],2e-5));
    }
    for(const a of [15,75,135,195,255,315]){
      const s=m.sample(a),before=m.sample(a-dt),after=m.sample(a+dt);
      s.i.forEach((i,k)=>{const derivative=(after.i[k]-before.i[k])/(2*dt/(360*m.p.f));near(m.p.l/1000*derivative+m.p.r*i,s.phase?s.phase[k]:s.u,2e-6);});
    }
    near(m.metrics.power,m.p.r*m.metrics.irms**2*(type==='threeV'?3:1),4e-5);
  }
});
test('Half bridge turns on the correct freewheel diode after each voltage reversal',()=>{
  const m=buildModel('half',{ud:200,r:20,l:50});
  assert.ok(m.sample(.001).io<0);assert.deepEqual(m.sample(.001).active,['VD1']);
  assert.ok(m.sample(180.001).io>0);assert.deepEqual(m.sample(180.001).active,['VD2']);
  assert.ok(m.sample(90).active.includes('V1'));assert.ok(m.sample(270).active.includes('V2'));
});
test('Phase-shift zero voltage gives bridge freewheeling without DC current',()=>{
  const m=buildModel('phase',{theta:90,r:20,l:100});
  const s=m.sample(120);assert.equal(s.u,0);assert.equal(s.dc,0);assert.ok(s.io>0);
  assert.ok(s.active.includes('V1')&&s.active.includes('VD3'));
  const r=buildModel('phase',{theta:90,l:0});assert.equal(r.sample(120).io,0);
});
test('Three-phase VSI distinguishes poles, floating neutral, phase and line voltages',()=>{
  const m=buildModel('threeV',{ud:300,r:20,l:0});
  for(let a=.25;a<360;a+=3){
    const s=m.sample(a);near(s.i.reduce((a,b)=>a+b),0);
    near(s.phase.reduce((a,b)=>a+b),0);near(s.line[0],s.pole[0]-s.pole[1]);
    for(const v of s.pole)near(Math.abs(v),150);
    for(const v of s.phase)assert.ok([100,200].some(x=>Math.abs(Math.abs(v)-x)<1e-8));
    near(s.neutral,s.pole.reduce((a,b)=>a+b)/3);near(s.power,300*s.dc);
  }
  near(m.metrics.urms,300*Math.sqrt(2/3));near(m.metrics.u1,Math.sqrt(6)*300/Math.PI,1e-6);
});
test('Parallel RLC model is periodic, satisfies capacitor KCL and dissipates power only in R',()=>{
  for(const f of [100,400,1000,2000]){
    const m=buildModel('parallel',{f});assert.ok(m.periodError<1e-7);
    const meanLoss=m.samples.reduce((sum,s)=>sum+m.p.r*s.il*s.il,0)/m.samples.length;
    near(m.metrics.power,meanLoss,2e-5);
    for(const a of [20,80,140,200,260,320]){
      const s=m.sample(a);near(s.io,s.il+s.ic);near(s.currents[0]+s.currents[1],m.p.id);
    }
  }
});
test('Parallel commutation margin uses actual voltage zero and required recovery time',()=>{
  const m=buildModel('parallel');assert.ok(m.margin.safe);assert.ok(m.sample(m.p.gamma).u<0);
  near(m.sample(m.p.gamma+m.margin.beta).u,0,1e-6);
  near(m.margin.ty,m.p.gamma/(360*m.p.f)*1e6);near(m.margin.ts,m.margin.ty+m.margin.tb);
  near(m.margin.phi,m.margin.gamma/2+m.margin.beta);
  assert.equal(buildModel('parallel',{f:100}).margin.safe,false);
  const fast=buildModel('parallel',{f:2000});
  assert.equal(buildModel('parallel',{...fast.p,tq:fast.margin.tb+1}).margin.safe,false);
});
test('Ideal three-phase CSI has 120-degree pulses and equal positive and negative dwell',()=>{
  const counts=[0,0,0];
  for(let a=.5;a<360;a++){
    const s=threeCurrent(a,4);near(s.i.reduce((a,b)=>a+b),0);
    assert.equal(s.i.filter(x=>x!==0).length,2);s.i.forEach((i,k)=>{if(i>0)counts[k]++;});
  }
  assert.deepEqual(counts,[120,120,120]);
});
test('CSI finite commutation preserves three-phase KCL, balanced voltage and fundamental current',()=>{
  const m=buildModel('threeI',{gamma:8});
  for(let a=.03;a<360;a+=.31){const s=m.sample(a);near(s.i.reduce((a,b)=>a+b),0);near(s.di.reduce((a,b)=>a+b),0);near(s.phase.reduce((a,b)=>a+b),0);near(s.line[0],s.phase[0]-s.phase[1]);near(s.uab*m.p.id,s.power);}
  const x=m.p.gamma*Math.PI/360;
  near(m.metrics.i1,Math.sqrt(6)/Math.PI*m.p.id*Math.sin(x)/x,1e-6);
  near(m.metrics.irms,m.p.id*Math.sqrt(2/3-m.p.gamma/540),1e-6);
  assert.ok(m.sample(1).overlap);assert.ok(!m.sample(10).overlap);
});
test('CSI motor back EMF and inductance change line voltage without altering prescribed current',()=>{
  const plain=buildModel('threeI',{em:0,l:0}),motor=buildModel('threeI',{em:80,l:5});
  near(plain.metrics.irms,motor.metrics.irms);assert.ok(motor.metrics.urms>plain.metrics.urms);
  for(const a of [30,70,130,250]){
    const s=motor.sample(a),v=s.i.map((i,k)=>motor.p.r*i+motor.p.l/1000*s.di[k]+motor.p.em*Math.sin((a+30-motor.p.gamma/2-120*k+motor.p.phi)*Math.PI/180));
    near(s.line[0],v[0]-v[1]);
  }
});
test('All source models remain finite at allowed parameter boundaries',()=>{
  for(const t of TOPOLOGIES){
    const cases=[DEFAULTS[t.id],{r:.1,l:0,ud:1,id:.1,f:1,c:.1,gamma:0,theta:0},{r:1000,l:2000,ud:1000,id:100,f:1000,c:200,gamma:60,theta:180}];
    for(const input of cases){const m=buildModel(t.id,input);for(const n of Object.values(m.metrics))assert.ok(Number.isFinite(n));for(const a of [0,90,180,359.9])assert.ok(Number.isFinite(m.sample(a).u));}
  }
  assert.equal(parameters('threeI',{gamma:0}).gamma,.5);
  assert.equal(parameters('phase',{theta:NaN}).theta,120);
});
test('Circuit structures include split capacitors, antiparallel paths and ASCI series diodes',()=>{
  const half=circuitSVG('half',buildModel('half').sample(15),DEFAULTS.half);
  assert.ok(half.includes('C₁')&&half.includes('C₂')&&half.includes('data-device="VD1"'));
  const three=circuitSVG('threeI',buildModel('threeI').sample(15),DEFAULTS.threeI);
  for(let k=1;k<=6;k++)assert.ok(three.includes(`data-device="VT${k}"`)&&three.includes(`data-device="VD${k}"`));
  for(const name of ['C₁','C₂','C₃','C₄','C₅','C₆'])assert.ok(three.includes(name));
});
