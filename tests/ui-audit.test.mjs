import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stateUrl} from '../dist/mode-transfer.js';

// DOM interaction checks run the actual page modules. Geometry and device-specific
// keyboard behaviour still require a real browser; the canvas API is inert here.
let run=0;
async function page(name,search,fn){
 const saved=new Map(['window','document','ResizeObserver','requestAnimationFrame','setTimeout','clearTimeout'].map(k=>[k,globalThis[k]]));
 const elements=new Map(),timers=new Map(),navigations=[],history=[],frames=[];let now=0,nextTimer=0;
 class Element{
  constructor(id=''){this.id=id;this.dataset={};this.attrs={};this.style={setProperty(){}};this.listeners={};this.clientWidth=700;this._value='';this.hidden=false;this.disabled=false;this.children=[];this.classList={toggle(){},add(){},remove(){}};}
  set value(v){this._value=String(v)}get value(){return this._value}
  set innerHTML(v){this._html=v;this.children=[...v.matchAll(/data-(circuit|alpha|valve|flow)="([^"]+)"/g)].map(m=>{const e=new Element();e.dataset[m[1]]=m[2];return e;});}get innerHTML(){return this._html??''}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn)}
  dispatch(type,props={}){for(const f of this.listeners[type]??[])f({target:this,preventDefault(){},...props});}
  dispatchEvent(event){this.dispatch(event.type);return true;}
  click(){this.dispatch('click')}setAttribute(k,v){this.attrs[k]=v}
  querySelectorAll(s){return this.children.filter(e=>s==='button'?e.dataset.alpha:e.dataset[s.slice(6,-1)]);}
  focus(){document.activeElement=this;document.dispatch('focusin',{target:this})}blur(){document.activeElement=document.body;document.dispatch('focusout',{target:this})}
  closest(s){return s==='#input-toolbar'&&['input-toolbar','input-done','input-sign'].includes(this.id)?elements.get('input-toolbar'):s==='#inv-input-toolbar'&&this.id.startsWith('inv-input-')?elements.get('inv-input-toolbar'):null}
  setSelectionRange(){}setPointerCapture(){}append(){}remove(){}showModal(){}close(){}
  getBoundingClientRect(){return {left:0,top:0,width:700,height:900}}
 }
 const context=new Proxy({measureText:s=>({width:String(s).length*6})},{get:(target,key)=>target[key]??(()=>{})});
 const canvas=()=>Object.assign(new Element(),{parentElement:new Element(),getContext:()=>context});
 const html=fs.readFileSync(new URL('../dist/'+name+'.html',import.meta.url),'utf8');
 for(const m of html.matchAll(/id="([^"]+)"/g))elements.set(m[1],new Element(m[1]));
 const canvasId=name==='inverter'?'inverter-canvas':'wave-canvas';elements.set(canvasId,Object.assign(canvas(),{id:canvasId}));
 const dataNodes=key=>[...html.matchAll(new RegExp('data-'+key+'="([^"]+)"','g'))].map(m=>{const e=new Element();e.dataset[key]=m[1];return e});
 const lists={cycles:dataNodes('cycles'),trace:dataNodes('trace'),angle:dataNodes('angle')};
 const doc=Object.assign(new Element(),{body:new Element(),documentElement:new Element(),getElementById:id=>elements.get(id),createElement:tag=>tag==='canvas'?canvas():new Element(),querySelectorAll:s=>s==='[data-circuit]'?elements.get('circuit-nav').children:lists[s.slice(6,-1)]??[]});
 doc.activeElement=doc.body;doc.body.dataset.mode=name==='inverter-ideal'?'inverter':'';
 const win=Object.assign(new Element(),{innerWidth:1024,innerHeight:1000,devicePixelRatio:1,location:{search,assign:u=>navigations.push(u),replace:u=>navigations.push(u)},history:{replaceState:(a,b,u)=>history.push(u)}});
 Object.assign(globalThis,{window:win,document:doc,ResizeObserver:class{observe(){}},requestAnimationFrame:fn=>{frames.push(fn);return frames.length},setTimeout:(f,ms)=>{const id=++nextTimer;timers.set(id,{f,at:now+ms});return id},clearTimeout:id=>timers.delete(id)});
 const clock=ms=>{now+=ms;for(const [id,t] of timers)if(t.at<=now){timers.delete(id);t.f()}};
 try{
  await import('../dist/'+(name==='inverter'?'inverter':'app')+'.js?audit='+ ++run);
  const get=id=>elements.get(id),change=(id,v,type='change')=>{get(id).value=v;get(id).dispatch(type)};
  const frame=stamp=>{for(const callback of frames.splice(0))callback(stamp)};
  await fn({get,change,clock,navigations,history,doc,win,lists,frame});
 }finally{for(const [k,v] of saved)if(v===undefined)delete globalThis[k];else globalThis[k]=v;}
}
const params={circuit:'bridge',load:'rle',alpha:120,u2:100,r:20,f:50,l:1000,e:-400,pulseWidth:10};
const query=(resume=false)=>stateUrl('./',params,{cycles:1,cursor:120},resume).split('?')[1];

test('Active inversion keeps playing during touch scroll, switches to half speed and pauses only for a tap or explicit control',async()=>{
 await page('inverter','?circuit=threeHalf',async({get,change,frame,doc,history})=>{
  const play=get('inverter-play'),canvas=get('inverter-canvas');play.click();frame(0);frame(100);
  const normal=Number(get('inverter-cursor').value);assert.ok(Math.abs(normal-176-7.2)<1e-7);
  change('inverter-speed','0.5');frame(200);frame(300);const slow=Number(get('inverter-cursor').value);assert.ok(Math.abs(slow-normal-3.6)<1e-7);
  assert.match(get('inverter-diagram').innerHTML,/--flow-duration:0.9s/);assert.ok(history.at(-1).includes('speed=0.5'));
  canvas.dispatch('pointerdown',{pointerType:'touch',pointerId:7,clientX:200,clientY:50});
  canvas.dispatch('pointermove',{pointerType:'touch',pointerId:7,clientX:200,clientY:150});canvas.dispatch('pointercancel');
  frame(400);assert.equal(play.attrs['aria-pressed'],'true');assert.ok(Number(get('inverter-cursor').value)>slow);
  canvas.dispatch('pointerdown',{pointerType:'touch',pointerId:8,clientX:200,clientY:50});
  canvas.dispatch('pointermove',{pointerType:'touch',pointerId:8,clientX:300,clientY:50});canvas.dispatch('pointerup',{pointerType:'touch',pointerId:8,clientX:300,clientY:50});
  assert.equal(play.attrs['aria-pressed'],'true');
  get('inv-r').focus();doc.dispatch('pointerdown',{target:canvas});assert.equal(play.attrs['aria-pressed'],'true','Unchanged input blur cannot stop scrolling playback');
  canvas.dispatch('pointerdown',{pointerType:'touch',pointerId:9,clientX:200,clientY:50});canvas.dispatch('pointerup',{pointerType:'touch',pointerId:9,clientX:200,clientY:50});
  assert.equal(play.attrs['aria-pressed'],'false');
  play.click();frame(500);const start=Number(get('inverter-cursor').value);frame(600);
  assert.ok(Math.abs(Number(get('inverter-cursor').value)-start-3.6)<1e-7,'A stale animation callback cannot create a second playback loop');
 });
});
test('Rectifier and ideal inverter also retain playback while touch-scrolling and expose 0.5x',async()=>{
 for(const name of ['index','inverter-ideal'])await page(name,name==='index'?'':'?'+query(),async({get,change,frame})=>{
  get('play').click();frame(0);frame(100);const before=Number(get('cursor').value);
  change('playback-speed','.5');frame(200);frame(300);assert.ok(Math.abs(Number(get('cursor').value)-before-4.5)<1e-7);
  get('wave-canvas').dispatch('pointerdown',{pointerType:'touch',pointerId:1,clientX:100,clientY:100});
  get('wave-canvas').dispatch('pointermove',{pointerType:'touch',pointerId:1,clientX:100,clientY:200});get('wave-canvas').dispatch('pointercancel');
  assert.equal(get('play-text').textContent,'暂停');
 });
});

test('Returning to rectification requires an actual parameter edit before automatic re-entry',async()=>{
 await page('index','?'+query(true),async({get,change,clock,navigations})=>{
  clock(500);assert.equal(navigations.length,0);
  get('alpha-number').focus();get('alpha-number').blur();await Promise.resolve();clock(500);
  assert.equal(navigations.length,0,'viewing an unchanged input must not bounce back to inversion');
  change('alpha',125,'input');clock(500);assert.equal(navigations.length,1);
  assert.ok(navigations[0].startsWith('./inverter.html?'));
  const q=new URLSearchParams(navigations[0].split('?')[1]);assert.equal(q.get('circuit'),'bridge');assert.equal(q.get('e'),'-400');assert.equal(q.get('l'),'1000');
 });
});
test('Automatic mode change waits for the trigger-angle pointer to be released',async()=>{
 await page('index','?'+query(true),async({get,change,clock,navigations,win})=>{
  get('alpha').dispatch('pointerdown');change('alpha',130,'input');clock(1000);
  assert.equal(navigations.length,0,'holding the slider still must not navigate');
  win.dispatch('pointerup');clock(500);assert.equal(navigations.length,1);
 });
});
test('A return link keeps the current observation position and time-axis setting',async()=>{
 await page('inverter-ideal','?'+query(),async({get,change})=>{
  change('cursor',283.5,'input');get('axis').click();
  const q=new URLSearchParams(get('rectifier-return').href.split('?')[1]);
  assert.equal(q.get('cursor'),'283.5');assert.equal(q.get('timeAxis'),'1');
 });
});
test('An inverter with no conduction is labelled as off, not discontinuous current',async()=>{
 await page('inverter','',async({get,change})=>{
  change('inv-e',0);change('inv-alpha-number',150);
  assert.equal(get('inv-id').textContent,'0.00');assert.equal(get('inv-state-badge').textContent,'未导通');
 });
});
test('Imported parameter notice is cleared when a preset replaces the imported parameters',async()=>{
 const q=stateUrl('./',{...params,circuit:'threeHalf'},{cycles:1,cursor:120}).split('?')[1];
 await page('inverter','?'+q,async({get})=>{
  assert.equal(get('inv-transfer-status').hidden,false);get('preset-normal').click();
  assert.equal(get('inv-transfer-status').hidden,true,'preset no longer uses the transferred finite L and zero source inductance');
 });
});

test('Browser back preserves the inspected state until another parameter change',async()=>{
 await page('index','?'+query(true),async({get,change,clock,navigations,win})=>{
  change('alpha',125,'input');clock(500);assert.equal(navigations.length,1);
  win.dispatch('pageshow',{persisted:true});get('emf').focus();get('emf').blur();await Promise.resolve();clock(500);
  assert.equal(navigations.length,1);
  change('alpha',130,'input');clock(500);assert.equal(navigations.length,2);
 });
});
test('An entered 180-degree inverter angle is bounded to a readable valid value',async()=>{
 await page('inverter','',async({get,change})=>{
  change('inv-alpha-number',180);
  assert.equal(Number(get('inv-alpha-number').value),179.99);
  assert.ok(Number.isFinite(Number(get('inv-id').textContent)));
  change('inv-alpha-number',135.125);assert.equal(Number(get('inv-alpha-number').value),135.125);
 });
});

test('Unified inversion opens the imported bridge and retains each topology parameter edit',async()=>{
 await page('inverter','?'+query(),async({get,change})=>{
  assert.equal(get('inv-circuit-bridge').attrs['aria-pressed'],'true');
  assert.equal(Number(get('inv-e').value),-400);assert.equal(Number(get('inv-l').value),1000);assert.equal(Number(get('inv-lb').value),0);
  assert.ok(Number(get('inv-power').textContent)<0);assert.ok(get('inv-lb-label').innerHTML.includes('总电感'));
  get('inv-circuit-threeBridge').click();assert.equal(Number(get('inv-e').value),-240);
  change('inv-e',-333);get('inv-circuit-bridge').click();assert.equal(Number(get('inv-e').value),-400);
  get('inv-circuit-threeBridge').click();assert.equal(Number(get('inv-e').value),-333);
  assert.equal(get('inv-circuit-threeBridge').attrs['aria-pressed'],'true');
  assert.equal((get('inv-valve-values').innerHTML.match(/<b>/g)??[]).length,6);
  get('inv-axis').click();change('inverter-cursor',293.25,'input');
  const q=new URLSearchParams(get('inv-rectifier-return').href.split('?')[1]);assert.equal(q.get('circuit'),'threeBridge');assert.equal(q.get('e'),'-333');assert.equal(q.get('cursor'),'293.25');assert.equal(q.get('timeAxis'),'1');
 });
});

test('A zero-L transfer keeps the RE solver without replacing parameters or rewriting the redirect',async()=>{
 const q=stateUrl('./inverter.html',{...params,l:0},{cursor:293.25,timeAxis:true}).split('?')[1];
 await page('inverter','?'+q,async({navigations,history})=>{
  assert.equal(navigations.length,1);assert.ok(navigations[0].startsWith('./inverter-ideal.html?'));
  const restored=new URLSearchParams(navigations[0].split('?')[1]);assert.equal(restored.get('l'),'0');assert.equal(restored.get('e'),'-400');assert.equal(restored.get('timeAxis'),'1');assert.equal(history.length,0);
 });
});
test('Active inversion flow remains visible at a selected instant and can be paused independently',async()=>{
 await page('inverter','?circuit=bridge',async({get,change,frame})=>{
  const diagram=get('inverter-diagram'),motion=get('inv-flow-motion');assert.equal(diagram.attrs['data-flow-running'],'true');
  change('inverter-cursor',176,'input');assert.equal(diagram.attrs['data-flow-running'],'true');
  motion.click();assert.equal(diagram.attrs['data-flow-running'],'false');
  get('inverter-play').click();frame(0);frame(100);assert.equal(diagram.attrs['data-flow-running'],'false');
  motion.click();get('inverter-play').click();assert.equal(diagram.attrs['data-flow-running'],'true');
 });
});
test('Every rectifier and ideal-inverter page includes continuous flow with independent pause and half speed',async()=>{
 for(const name of ['index','inverter-ideal'])await page(name,name==='index'?'':'?'+query(),async({get,change,frame})=>{
  for(const circuit of (name==='index'?['half','bridge','semi','threeHalf','threeBridge']:['bridge','threeHalf','threeBridge'])){
   change('mobile-circuit',circuit);
   let displayed=false;
   for(const angle of [90,150,210,270]){change('cursor',angle,'input');if(get('circuit-diagram').innerHTML.includes('class="dc-flow-stream"')){displayed=true;break;}}
   assert.ok(displayed,circuit);assert.equal(get('circuit-diagram').attrs['data-flow-running'],'true');
  }
  change('cursor',150,'input');change('playback-speed','.5');assert.match(get('circuit-diagram').innerHTML,/--flow-duration:0.9s/);
  get('rect-flow-motion').click();assert.equal(get('circuit-diagram').attrs['data-flow-running'],'false');
  get('play').click();frame(0);frame(100);assert.equal(get('circuit-diagram').attrs['data-flow-running'],'false');
  get('play').click();get('rect-flow-motion').click();assert.equal(get('circuit-diagram').attrs['data-flow-running'],'true');
 });
});
test('Both active-inverter views can select and display a true feedback current path',async()=>{
 for(const name of ['inverter','inverter-ideal'])await page(name,'?'+query(),async({get})=>{
  const prefix=name==='inverter'?'inv':'rect';assert.equal(get(prefix+'-see-feedback').disabled,false);
  get(prefix+'-see-feedback').click();assert.match(get(name==='inverter'?'inverter-diagram':'circuit-diagram').innerHTML,/data-flow-mode="feedback"/);
  assert.match(get(prefix+'-flow-direction').textContent,/回馈/);
 });
});
