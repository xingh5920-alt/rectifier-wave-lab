import test from 'node:test';
import assert from 'node:assert/strict';
import {advancePlayback,bindProbeGestures,playbackRate,syncSvgPlayback,withPlaybackRate} from '../dist/playback.js';
test('Half-speed advances exactly half as far, wraps continuously and leaves electrical frequency independent',()=>{
  assert.equal(advancePlayback(10,100,.5,4000,720)-10,(advancePlayback(10,100,1,4000,720)-10)/2);
  assert.equal(advancePlayback(718,100,.5,4000,720),2.5);
  assert.equal(playbackRate('0.5'),.5);assert.equal(playbackRate('garbage'),1);
  const link=withPlaybackRate('./inverter.html?circuit=bridge&f=50&cursor=12',.5);
  const q=new URLSearchParams(link.split('?')[1]);assert.equal(q.get('f'),'50');assert.equal(q.get('speed'),'0.5');assert.equal(q.get('cursor'),'12');
});
test('Touch scrolling, cancellation and multi-touch do not select a probe or pause, but an intentional tap does',()=>{
  const listeners=new Map();let paused=0,points=0,captures=0;
  const canvas={addEventListener:(name,fn)=>listeners.set(name,fn),setPointerCapture:()=>captures++};
  bindProbeGestures(canvas,{pause:()=>paused++,point:()=>points++,isPlaying:()=>true});
  const event=(name,values={})=>listeners.get(name)({pointerType:'touch',pointerId:1,clientX:100,clientY:100,...values});
  for(const [x,y]of[[100,170],[170,100]]){event('pointerdown');event('pointermove',{clientX:x,clientY:y});event('pointerup',{clientX:x,clientY:y});}
  event('pointerdown');event('pointercancel');event('pointerup');
  event('pointerdown');event('pointerdown',{pointerId:2,isPrimary:false});event('pointerup');
  assert.equal(paused,0);assert.equal(points,0);assert.equal(captures,0);
  event('pointerdown');event('pointerup');assert.equal(paused,1);assert.equal(points,1);
});
test('Mouse hovering cannot move a playing probe; mouse dragging still pauses and selects',()=>{
  const listeners=new Map();let paused=0,points=0;
  const canvas={addEventListener:(name,fn)=>listeners.set(name,fn),setPointerCapture(){}};
  bindProbeGestures(canvas,{pause:()=>paused++,point:()=>points++,isPlaying:()=>true});
  listeners.get('pointermove')({pointerType:'mouse'});assert.equal(points,0);
  listeners.get('pointerdown')({pointerType:'mouse',pointerId:7,button:0});listeners.get('pointermove')({pointerType:'mouse'});
  assert.equal(paused,1);assert.equal(points,2);
});
test('Circuit particles pause and resume together with the waveform timeline',()=>{
  let pauses=0,starts=0;const container={querySelector:()=>({pauseAnimations:()=>pauses++,unpauseAnimations:()=>starts++})};
  syncSvgPlayback(container,false);syncSvgPlayback(container,true);assert.equal(pauses,1);assert.equal(starts,1);
});
