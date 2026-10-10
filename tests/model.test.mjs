import test from 'node:test';
import assert from 'node:assert/strict';
import {circuits,average,sample,alphaLimit,metrics,gates} from '../dist/model.js';

const parameters={circuit:'threeBridge',load:'r',alpha:30,u2:100,r:20,f:50};
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} differs from ${b}`);

test('Integrated waveforms agree with piecewise analytical averages for every circuit and load',()=>{
  const N=36000;
  for(const c of circuits)for(const load of c.loads)for(const alpha of [0,30,60,89,90,120,150,180].filter(a=>a<=alphaLimit(c.id,load))){
    const p={...parameters,circuit:c.id,load,alpha};let total=0;
    for(let i=0;i<N;i++)total+=sample((i+.5)*360/N,p).ud;
    near(total/N,average(p),.015);
  }
});
test('Textbook three-phase bridge α=0,30,60,90,120 output and conduction',()=>{
  const constant=3*Math.sqrt(6)*100/Math.PI;
  for(const alpha of [0,30,60])near(average({...parameters,alpha}),constant*Math.cos(alpha*Math.PI/180));
  near(average({...parameters,alpha:90}),constant*(1-Math.sqrt(3)/2));
  near(average({...parameters,alpha:120}),0);
  const pairs=[['VT1','VT6'],['VT1','VT2'],['VT3','VT2'],['VT3','VT4'],['VT5','VT4'],['VT5','VT6']];
  pairs.forEach((pair,i)=>assert.deepEqual(sample(61+i*60,parameters).active,pair));
  const ninety={...parameters,alpha:90};
  assert.ok(sample(121,ninety).ud>0);near(sample(160,ninety).ud,0);near(sample(160,ninety).id,0);
  for(let t=0;t<360;t+=.5)near(sample(t,{...parameters,alpha:120}).ud,0,1e-8);
});
test('R load cannot have negative voltage and current; Id=ud/R, input currents match circuit',()=>{
  for(const c of circuits)for(const alpha of [0,30,60,90,alphaLimit(c.id,'r')])for(let t=0;t<360;t+=.5){
    const p={...parameters,circuit:c.id,load:'r',alpha},s=sample(t,p);
    assert.ok(s.ud>=-1e-8);assert.ok(s.id>=0);near(s.id,s.ud/p.r,1e-8);
    near(s.ivt1,s.active.includes('VT1')?s.id:0);
    assert.ok(Math.abs(s.input)<=s.id+1e-8);
  }
});
test('Continuous-load bridge has negative instantaneous voltage without negative current',()=>{
  const p={...parameters,circuit:'bridge',load:'l',alpha:60};
  const s=sample(200,p);assert.ok(s.ud<0);assert.ok(s.id>0);near(s.id,average(p)/p.r);
  for(let t=0;t<360;t+=.5)near(sample(t,p).id,s.id);
});
test('Semicontrolled bridge includes VT1 current during freewheeling and correct off-state voltage',()=>{
  const p={...parameters,circuit:'semi',load:'l',alpha:60};
  const free=sample(210,p);assert.deepEqual(free.active,['VT1','D1']);assert.equal(free.freewheel,true);near(free.ud,0);near(free.input,0);near(free.ivt1,free.id);near(free.uvt1,0);
  const reversed=sample(280,p);assert.deepEqual(reversed.active,['VT2','D1']);assert.ok(reversed.uvt1<0);
  const first=sample(20,p);assert.deepEqual(first.active,['VT2','D2']);assert.ok(first.uvt1>0);
});
test('Three-phase DC rail and thyristor voltages satisfy circuit equations',()=>{
  for(const id of ['threeHalf','threeBridge'])for(const load of ['r','l'])for(const alpha of [0,30,60,85])for(let t=.1;t<360;t+=.5){
    const p={...parameters,circuit:id,load,alpha},s=sample(t,p);
    if(s.ud1!==null){near(s.ud,s.ud1-s.ud2);near(s.uvt1,s.phases[0]-s.ud1);}
    if(s.active.includes('VT1'))near(s.uvt1,0);
    if(s.active.length===0 && id==='threeBridge')assert.equal(s.uvt1,null);
  }
});
test('Every waveform is periodic and remains finite at allowed parameter limits',()=>{
  for(const c of circuits)for(const load of c.loads)for(const alpha of [0,alphaLimit(c.id,load)]){
    const p={...parameters,circuit:c.id,load,alpha,u2:1000,r:.1};
    for(const t of [-350,0,30.5,91,241,359.9]){
      const a=sample(t,p),b=sample(t+360,p);near(a.ud,b.ud,1e-7);near(a.id,b.id,1e-6);assert.ok(Number.isFinite(a.ud)&&Number.isFinite(a.id));
    }
    const m=metrics(p);assert.ok(m.rms>=Math.abs(m.ud)-.03);assert.ok(Number.isFinite(m.rms));
  }
});
test('Gate events follow natural commutation reference and six-valve double pulses',()=>{
  const g=gates(parameters);assert.equal(g.length,6);assert.deepEqual(g[0].starts,[60,120]);assert.deepEqual(g[1].starts,[120,180]);
  const half=gates({...parameters,circuit:'threeHalf'});assert.deepEqual(half.map(x=>x.starts[0]),[60,180,300]);
});

test('R bridge current has no finite zero-current interval at alpha zero',()=>{
 for(const circuit of ['bridge','semi']){
  const p={...parameters,circuit,alpha:0};assert.equal(metrics(p).continuous,true);assert.equal(metrics(p).gap,false);
  for(const t of [.1,45,179.9,180.1,300,359.9])assert.ok(sample(t,p).id>0);
  const delayed={...p,alpha:30};assert.equal(metrics(delayed).continuous,false);assert.equal(sample(15,delayed).id,0);
 }
});
