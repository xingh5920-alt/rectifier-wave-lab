import test from 'node:test';
import assert from 'node:assert/strict';
import {controlAngles,sample} from '../dist/model.js';
const base={circuit:'threeBridge',load:'rle',alpha:120,u2:100,r:20,f:50,l:1000,e:-400,pulseWidth:10};
test('Inverter angles match the actual VT1 turn-off and reverse-voltage interval',()=>{
  for(const circuit of ['bridge','threeHalf','threeBridge'])for(const alpha of [100,120,150]){
    const p={...base,circuit,alpha},a=controlAngles(p);
    assert.equal(a.beta,180-alpha);assert.equal(a.gamma,0);assert.equal(a.margin,a.beta);assert.equal(a.end-a.start,a.beta-a.gamma);
    assert.ok(sample(a.start-.1,p).active.includes('VT1'));
    assert.ok(!sample(a.start+.1,p).active.includes('VT1'));
    assert.ok(sample((a.start+a.end)/2,p).uvt1<0);
    assert.ok(sample(a.end-.1,p).uvt1<0);assert.ok(sample(a.end+.1,p).uvt1>0);
  }
});
test('Gamma is unavailable outside continuous inverter commutation',()=>{
  for(const p of [{...base,alpha:30},{...base,alpha:180},{...base,e:400},{...base,load:'r'},{...base,circuit:'semi'},{...base,circuit:'half'}])assert.equal(controlAngles(p).gamma,null);
  assert.equal(controlAngles({...base,alpha:30}).beta,150);assert.equal(controlAngles({...base,circuit:'semi'}).beta,null);
});
