import test from 'node:test';
import assert from 'node:assert/strict';
import {sample,metrics,simulation,circuits,hasPeriodicCommutation} from '../dist/model.js';
import {formulaMarkup} from '../dist/formula-display.js';

const base={circuit:'half',load:'rl',alpha:30,u2:100,r:20,f:50,l:100,e:50,pulseWidth:10};
const near=(a,b,t=1e-4)=>assert.ok(Math.abs(a-b)<t,`${a} differs from ${b}`);
function analyticalCurrent(theta,p){
  const w=2*Math.PI*p.f,l=p.l/1000,z=Math.hypot(p.r,w*l),phi=Math.atan2(w*l,p.r),a=p.alpha*Math.PI/180,t=theta*Math.PI/180;
  const e=p.load==='rle'?p.e:0,steady=angle=>Math.SQRT2*p.u2/z*Math.sin(angle-phi)-e/p.r;
  return steady(t)-steady(a)*Math.exp(-(t-a)/(w*l/p.r));
}
test('Half-wave RL current matches the independent closed-form solution and persists after voltage zero',()=>{
  for(const theta of [40,70,100,150,190,210])near(sample(theta,base).id,Math.max(0,analyticalCurrent(theta,base)),.0006);
  const afterZero=sample(190,base);assert.ok(afterZero.id>0);assert.ok(afterZero.ud<0);assert.deepEqual(afterZero.active,['VT1']);
  let lo=180,hi=360;for(let i=0;i<50;i++){const mid=(lo+hi)/2;if(analyticalCurrent(mid,base)>0)lo=mid;else hi=mid;}
  const beta=simulation(base).transitions.find(t=>t>180&&sample(t+.001,base).active.length===0);
  near(beta,(lo+hi)/2,.055);
});
test('RLE current matches the independent R-L-E ODE and disconnected load terminals retain E',()=>{
  const p={...base,load:'rle'};
  for(const theta of [40,70,100,130,160])near(sample(theta,p).id,Math.max(0,analyticalCurrent(theta,p)),.0006);
  const off=sample(300,p);near(off.id,0);near(off.ud,p.e);assert.equal(off.active.length,0);near(off.uvt1,off.phases[0]-p.e);
  const m=metrics(p);near(m.ud,p.r*m.id+p.e,1e-6);assert.equal(m.continuous,false);
});
test('Continuous bridge RL/RLE averages agree with the analytical bridge formula',()=>{
  for(const load of ['rl','rle']){
    const p={...base,circuit:'bridge',load,l:500,e:20},m=metrics(p);
    assert.equal(m.continuous,true);assert.ok(m.minI>0);assert.ok(m.maxI>m.minI);
    const expected=2*Math.SQRT2*p.u2/Math.PI*Math.cos(p.alpha*Math.PI/180);
    near(m.ud,expected,.002);near(m.id,(expected-(load==='rle'?p.e:0))/p.r,.0002);
  }
});
test('RE is recovered for L=0, with conduction requiring source voltage above E',()=>{
  const p={...base,load:'rle',l:0};
  const on=sample(90,p);near(on.ud,Math.SQRT2*p.u2);near(on.id,(on.ud-p.e)/p.r);
  const off=sample(170,p);near(off.ud,p.e);near(off.id,0);assert.equal(off.active.length,0);
  near(metrics(p).ud,p.r*metrics(p).id+p.e,1e-6);
});
test('Excessive back EMF prevents conduction in every topology',()=>{
  for(const c of circuits){const p={...base,circuit:c.id,load:'rle',e:1000,pulseWidth:60},m=metrics(p);near(m.id,0);near(m.ud,1000);assert.equal(m.conducting,false);for(const t of [30,90,180,270]){const s=sample(t,p);near(s.id,0);near(s.ud,1000);assert.equal(s.active.length,0);}}
});
test('A pulse before forward bias is ineffective; a wider pulse can establish current',()=>{
  const p={...base,load:'rle',alpha:0};assert.equal(metrics({...p,pulseWidth:3}).conducting,false);
  assert.equal(metrics({...p,pulseWidth:60}).conducting,true);
  near(sample(10,{...p,pulseWidth:60}).id,0);assert.ok(sample(40,{...p,pulseWidth:60}).id>0);
});
test('All finite-load topologies settle, conserve average load voltage, and match sampled averages',()=>{
  for(const c of circuits)for(const load of ['rl','rle'])for(const alpha of [0,60,90,150]){
    const p={...base,circuit:c.id,load,alpha,l:300,e:40},m=metrics(p);assert.equal(m.settled,true,JSON.stringify(p));
    near(m.ud,p.r*m.id+(load==='rle'?p.e:0),1e-6);
    let sumU=0,sumI=0;for(let k=0;k<7200;k++){const s=sample((k+.5)/20,p);assert.ok(s.id>=0);assert.ok(Number.isFinite(s.ud));sumU+=s.ud;sumI+=s.id;}
    near(sumU/7200,m.ud,.03);near(sumI/7200,m.id,.001);
  }
});
test('Large and small time constants remain stable; RL equals RLE when E=0',()=>{
  for(const c of circuits)for(const [r,l] of [[.1,2000],[10000,.1]]){
    const p={...base,circuit:c.id,r,l,load:'rl'},m=metrics(p);assert.equal(m.settled,true);assert.ok(Number.isFinite(m.maxI));near(m.ud,p.r*m.id,.0001);
    const other=metrics({...p,load:'rle',e:0});near(m.ud,other.ud,1e-8);near(m.id,other.id,1e-8);
  }
});
test('Semicontrolled RL/RLE freewheels with zero input current and zero terminal voltage',()=>{
  for(const load of ['rl','rle']){const p={...base,circuit:'semi',load,l:500,e:20,alpha:60},s=sample(210,p);assert.equal(s.freewheel,true);near(s.ud,0);near(s.input,0);assert.ok(s.id>0);assert.equal(s.active.includes('VT1'),true);near(s.ivt1,s.id);}
});
test('Negative E follows the independent RLE current solution and preserves negative off-state voltage',()=>{
  const p={...base,load:'rle',e:-20};
  for(const theta of [40,70,100,150,190,220])near(sample(theta,p).id,Math.max(0,analyticalCurrent(theta,p)),.0006);
  const off=sample(330,p);near(off.id,0);near(off.ud,-20);assert.equal(off.active.length,0);near(off.uvt1,off.phases[0]+20);
  const m=metrics(p);near(m.ud,p.r*m.id+p.e,1e-6);assert.ok(m.id>metrics({...p,e:20}).id);
});
test('Negative E sustains continuous current with negative average voltage in full-control circuits',()=>{
  for(const circuit of ['bridge','threeHalf','threeBridge']){
    const p={...base,circuit,load:'rle',e:-200,alpha:120,l:1000},m=metrics(p);
    const coefficient=circuit==='bridge'?2*Math.SQRT2/Math.PI:circuit==='threeHalf'?3*Math.sqrt(6)/(2*Math.PI):3*Math.sqrt(6)/Math.PI;
    const expected=coefficient*p.u2*Math.cos(p.alpha*Math.PI/180);
    assert.equal(m.settled,true);assert.equal(m.continuous,true);assert.ok(m.ud<0);assert.ok(m.id>0);
    near(m.ud,expected,.003);near(m.id,(expected-p.e)/p.r,.0002);
  }
});
test('Signed E is conserved across all finite-load topologies, including RE and large negative values',()=>{
  for(const c of circuits)for(const [e,l,alpha] of [[-40,300,60],[-200,0,150],[-1000,2000,120]]){
    const p={...base,circuit:c.id,load:'rle',e,l,alpha},m=metrics(p);
    assert.equal(m.settled,true,JSON.stringify(p));near(m.ud,p.r*m.id+e,1e-5);
    assert.ok(m.id>0);assert.ok(Number.isFinite(m.rms));
    for(const theta of [5,70,140,220,310]){const s=sample(theta,p);assert.ok(s.id>=0);if(!s.active.length)near(s.ud,e);if(l===0&&s.active.length)near(s.id,(s.ud-e)/p.r,1e-6);}
  }
});
test('Continuous current without periodic commutation does not imply the cosine voltage formula',()=>{
  for(const circuit of ['bridge','threeHalf','threeBridge']){
    const p={...base,circuit,load:'rle',e:-1000,alpha:180,l:500};
    assert.equal(metrics(p).continuous,true);assert.equal(hasPeriodicCommutation(p),false);
    assert.ok(formulaMarkup(p).includes('导通路径可跨周期保持'));assert.ok(!formulaMarkup(p).includes('周期性换相，平均电压'));
    assert.equal(hasPeriodicCommutation({...p,alpha:120}),true);
  }
  const p={...base,load:'rle',e:-1000};assert.equal(metrics(p).continuous,true);assert.ok(formulaMarkup(p).includes('当前电流连续'));
});

test('Pulse frequency follows the output repetition when a valve remains latched',()=>{
 for(const circuit of ['bridge','threeHalf','threeBridge']){
  const p={...base,circuit,load:'rle',alpha:180,e:-1000,l:500};
  assert.equal(simulation(p).transitions.length,0);
  assert.equal(metrics(p).ripple,p.f);
  const m=metrics({...p,alpha:120});assert.equal(m.ripple,circuits.find(c=>c.id===circuit).pulses*p.f);
 }
 const off=metrics({...base,load:'rle',e:1000});assert.equal(off.ripple,0);
 for(const circuit of ['half','bridge','semi','threeHalf','threeBridge']){
  const p={...base,circuit,alpha:30,l:300},m=metrics(p);
  assert.equal(m.ripple,circuits.find(c=>c.id===circuit).pulses*p.f);
 }
});
