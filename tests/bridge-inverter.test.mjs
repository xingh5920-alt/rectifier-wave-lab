import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateInverter,inverterSample,commutationMeasurements} from '../dist/inverter-model.js';
import {bridgeGateMask} from '../dist/bridge-inverter-model.js';
import {simulation} from '../dist/model.js';
import {inverterParameters,inversionUrl,readTransferredState,stateUrl} from '../dist/mode-transfer.js';
const healthy=new Map(['bridge','threeBridge'].map(c=>[c,simulateInverter({circuit:c})]));

for(const circuit of ['bridge','threeBridge']){
  test(circuit+': continuous inversion obeys the load mean-voltage law and returns power',()=>{
    const r=healthy.get(circuit),m=r.metrics;
    assert.ok(r.converged&&!r.failed&&!r.limited&&r.continuous);
    assert.ok(m.ud<0&&m.id>0&&m.power<0&&m.gamma>0&&m.gamma<m.beta);
    assert.ok(Math.abs(m.ud-r.p.e-r.p.r*m.id)<.1);
    for(const s of r.samples){
      assert.ok(s.currents.every(i=>i>=0)&&Number.isFinite(s.ud));
      const positive=circuit==='bridge'?s.currents[0]+s.currents[2]:[0,2,4].reduce((sum,j)=>sum+s.currents[j],0);
      const negative=circuit==='bridge'?s.currents[1]+s.currents[3]:[1,3,5].reduce((sum,j)=>sum+s.currents[j],0);
      assert.ok(Math.abs(positive-s.id)<5e-7&&Math.abs(negative-s.id)<5e-7,'KCL at both DC buses');
      if(circuit==='threeBridge')assert.ok(Math.abs(s.phaseCurrents.reduce((a,b)=>a+b,0))<5e-7,'AC neutral current is zero');
      for(let j=0;j<s.currents.length;j++)if(s.currents[j]>1e-6)assert.ok(Math.abs(s.valveVoltages[j])<1e-8,'conducting SCR voltage is zero');
    }
  });
  test(circuit+': overlap and mean voltage agree with the independent constant-current integral',()=>{
    const r=healthy.get(circuit),p=r.p,e=r.events.find(e=>e.success&&e.start>360),id=inverterSample(r,e.start).id,w=2*Math.PI*p.f,vm=(circuit==='bridge'?Math.SQRT2:Math.sqrt(6))*p.u2;
    const predicted=vm/(2*w*p.lb/1000)*(Math.cos(p.alpha*Math.PI/180)-Math.cos((p.alpha+e.gamma)*Math.PI/180));
    assert.ok(Math.abs(predicted-id)/id<.002);
    const expected=(circuit==='bridge'?2:3)*vm/Math.PI*Math.cos(p.alpha*Math.PI/180)-(circuit==='bridge'?2:3)*w*p.lb/1000*r.metrics.id/Math.PI;
    assert.ok(Math.abs(expected-r.metrics.ud)<.15,'single L_B is the total loop L; three L_B is per phase');
  });
  test(circuit+': zero source inductance preserves the existing finite RLE model',()=>{
    const p={circuit,load:'rle',alpha:120,u2:100,r:20,e:-400,f:50,l:1000,pulseWidth:10},old=simulation(p).metrics,r=simulateInverter({...p,lb:0});
    assert.ok(r.converged&&!r.failed);assert.equal(r.metrics.gamma,0);
    assert.ok(Math.abs(r.metrics.ud-old.ud)<.3);assert.ok(Math.abs(r.metrics.id-old.id)<.02);
    assert.ok(Math.abs(r.metrics.power-old.power)/Math.abs(old.power)<.005);
  });
  test(circuit+': finite L conserves source, load and inductive energy',()=>{
    const r=simulateInverter({circuit,alpha:120,lb:1,l:300,r:5,e:-200}),p=r.p,a=r.samples.findIndex(s=>s.angle===360),samples=r.samples.slice(a),energy=s=>p.l/1000*s.id*s.id/2+p.lb/1000*s.phaseCurrents.reduce((sum,i)=>sum+i*i,0)/2;
    assert.ok(r.converged&&!r.failed&&!r.limited);
    const source=s=>s.u.reduce((sum,u,j)=>sum+u*s.phaseCurrents[j],0),load=s=>p.r*s.id*s.id+p.e*s.id;
    let net=0;for(let n=0;n<samples.length-1;n++)net+=(source(samples[n])-load(samples[n])+source(samples[n+1])-load(samples[n+1]))/2*.1/(360*p.f);
    const stored=energy(samples.at(-1))-energy(samples[0]);
    assert.ok(Math.abs(net-stored)<.04,`energy mismatch ${net-stored} J`);
  });
  test(circuit+': failure follows outgoing current at reversal and incoming current extinction',()=>{
    const r=simulateInverter({circuit,alpha:172},'failure'),e=r.events.find(e=>e.failed&&e.start>360),m=commutationMeasurements(e);
    assert.ok(r.failed&&e&&e.end>e.deadline);assert.equal(m.gamma,null);assert.equal(m.margin,null);
    const atP=inverterSample(r,e.deadline),after=inverterSample(r,e.end+.2);
    assert.ok(e.outgoing.some(j=>atP.currents[j]>1e-6));assert.ok(e.incomingValves.some(j=>atP.currents[j]>1e-6));
    assert.ok(e.incomingValves.every(j=>after.currents[j]===0));assert.ok(e.outgoing.some(j=>after.currents[j]>1e-6));
  });
}
test('Single bridge overlap has zero terminal voltage and continuous AC current reversal',()=>{
  const r=healthy.get('bridge'),e=r.events.find(e=>e.success&&e.start>360),s=inverterSample(r,(e.start+e.end)/2);
  assert.equal(s.mask,15);assert.equal(s.ud,0);assert.ok(s.currents.every(i=>i>0));
  assert.equal(s.currents[0],s.currents[1]);assert.equal(s.currents[2],s.currents[3]);
  assert.equal(s.phaseCurrents[0],s.currents[0]-s.currents[2]);
});
test('Three bridge uses six correctly ordered double pulses and three-device normal overlap',()=>{
  const r=healthy.get('threeBridge'),p=r.p;
  for(let j=0;j<6;j++)for(const extra of [0,60])assert.ok(bridgeGateMask(30+p.alpha+60*j+extra+.05,p)&(1<<j));
  for(const e of r.events.filter(e=>e.success)){const s=inverterSample(r,(e.start+e.end)/2);assert.equal(s.currents.filter(i=>i>1e-6).length,3);}
});
test('Every finite-L inverse topology imports exact parameters and source inductance is explicit',()=>{
  for(const circuit of ['bridge','threeHalf','threeBridge']){
    const p={circuit,load:'rle',alpha:135.125,u2:321.5,r:37.25,e:-456.75,f:60,l:1234.567,pulseWidth:17.5};
    const url=inversionUrl(p,{cycles:1,cursor:293.25,timeAxis:true});assert.ok(url.startsWith('./inverter.html?'));
    const state=readTransferredState(url.split('?')[1]),imported=inverterParameters(state);
    assert.deepEqual(imported,{circuit,lb:0,...Object.fromEntries(Object.entries(p).filter(([k])=>!['circuit','load'].includes(k)))});
    const saved=readTransferredState(stateUrl('./inverter.html',p,{lb:3.125,timeAxis:true}).split('?')[1]);assert.equal(inverterParameters(saved).lb,3.125);
  }
});
