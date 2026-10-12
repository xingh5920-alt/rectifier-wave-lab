import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

let serial=0;
async function app(search,fn){
  const names=['window','document','ResizeObserver','requestAnimationFrame','setTimeout','clearTimeout'];
  const old=new Map(names.map(k=>[k,globalThis[k]])),all=new Map();
  const context=new Proxy({measureText:t=>({width:String(t).length*7})},{get:(obj,k)=>obj[k]??(()=>{})});
  class Element{
    set value(v){this._value=String(v);}get value(){return this._value??'';}
    constructor(id='',attrs={}){this.id=id;this.attrs=attrs;this.dataset={};for(const [key,v]of Object.entries(attrs))if(key.startsWith('data-'))this.dataset[key.slice(5)]=v;this.value=attrs.value??'';this.checked='checked' in attrs;this.hidden='hidden' in attrs;this.style={};this.listeners={};this.children=[];this.clientWidth=360;this.classList={add(){},remove(){},toggle(){}};}
    set innerHTML(value){this.html=value;this.children=[];for(const m of value.matchAll(/<(?:input|button|select)\b([^>]*)>/g)){const attrs=Object.fromEntries([...m[1].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(x=>[x[1],x[2]??'']));const e=new Element(attrs.id??'',attrs);this.children.push(e);if(e.id)all.set(e.id,e);}}
    get innerHTML(){return this.html??'';}
    querySelectorAll(selector){const key=selector.match(/^\[data-(.*)\]$/)?.[1];return this.children.filter(e=>key in e.dataset);}
    addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
    dispatch(type,event={}){for(const fn of this.listeners[type]??[])fn({target:this,preventDefault(){},...event});}
    click(){this.dispatch('click');}setAttribute(k,v){this.attrs[k]=String(v);}
    getContext(){return context;}getBoundingClientRect(){return {left:0,top:0,width:360,height:700};}
    matches(selector){return selector==='[data-param]'&&'param' in this.dataset;}
    focus(){document.activeElement=this;this.dispatch('focus');}blur(){this.dispatch('blur');document.activeElement=document.body;}
    showModal(){this.open=true;}close(){this.open=false;}append(){}remove(){}
  }
  const html=fs.readFileSync(new URL('../dist/dc-inverter.html',import.meta.url),'utf8');
  for(const m of html.matchAll(/<([\w-]+)\b([^>]*\bid="[^"]+"[^>]*)>/g)){
    const attrs=Object.fromEntries([...m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(x=>[x[1],x[2]??'']));all.set(attrs.id,new Element(attrs.id,attrs));
  }
  all.get('dc-canvas').parentElement=new Element();
  const presets=[60,90,120,180].map(theta=>new Element('',{'data-theta':String(theta)}));
  const history=[],doc=Object.assign(new Element(),{body:new Element(),getElementById:id=>all.get(id),createElement:()=>new Element(),querySelectorAll:s=>s==='[data-theta]'?presets:[]});doc.activeElement=doc.body;
  const win=Object.assign(new Element(),{innerWidth:390,innerHeight:800,devicePixelRatio:1,location:{search,href:'https://example.test/dc-inverter.html'+search},history:{replaceState:(a,b,url)=>history.push(url)}});
  Object.assign(globalThis,{document:doc,window:win,ResizeObserver:class{observe(){}},requestAnimationFrame(){},setTimeout(){return 1},clearTimeout(){}});
  const change=(id,value)=>{const e=all.get(id);assert.ok(e,id+' exists');e.value=String(value);e.dispatch('change');};
  try{await import('../dist/dc-inverter.js?ui='+ ++serial);await fn({get:id=>all.get(id),change,history,presets,doc});}
  finally{for(const [k,v]of old)if(v===undefined)delete globalThis[k];else globalThis[k]=v;}
}
test('All six topology controls execute the actual UI and retain independent numeric edits',async()=>{
  await app('',async({get,change})=>{
    assert.match(get('dc-title').textContent,/半桥/);change('dc-p-ud',321);
    for(const type of ['full','phase','threeV','parallel','threeI']){change('dc-circuit-select',type);assert.ok(get('dc-title').textContent);assert.ok(get('dc-diagram').innerHTML.startsWith('<svg'));assert.ok(!get('dc-urms').textContent.includes('NaN'));}
    change('dc-circuit-select','half');assert.equal(Number(get('dc-p-ud').value),321);
    change('dc-p-l',0);assert.match(get('dc-status').textContent,/纯电阻/);
  });
});
test('The phase slider, presets, zero pulse and shared time-axis update actual readouts',async()=>{
  await app('?circuit=phase&theta=120&cursor=0',async({get,presets,change,history})=>{
    assert.equal(get('dc-probe-angle').textContent,'0.0°');assert.equal(get('dc-angle-control').hidden,false);
    presets[0].click();assert.equal(Number(get('dc-p-theta').value),60);assert.equal(get('dc-theta-value').textContent,'60°');
    change('dc-p-theta',0);assert.equal(get('dc-urms').textContent,'0');
    get('dc-cycle-two').click();assert.equal(Number(get('dc-cursor').max),720);
    get('dc-axis').click();assert.match(get('dc-axis').textContent,/ms/);assert.ok(history.at(-1).includes('timeAxis=1'));
  });
});
test('Invalid numeric drafts are restored and out-of-range edits are bounded before modeling',async()=>{
  await app('?circuit=phase',async({change,get})=>{
    change('dc-p-theta',999);assert.equal(Number(get('dc-p-theta').value),180);
    change('dc-p-r','');assert.equal(Number(get('dc-p-r').value),20);
    change('dc-p-f','NaN');assert.equal(Number(get('dc-p-f').value),50);
    change('dc-p-l','25，5');assert.equal(Number(get('dc-p-l').value),25.5);
    get('dc-p-l').focus();assert.equal(get('dc-input-toolbar').hidden,false);get('dc-input-done').click();assert.equal(get('dc-input-toolbar').hidden,true);
  });
});
test('Full-bridge numeric editing and a continuous slider synchronize decimal widths, metrics and saved links',async()=>{
  await app('?circuit=full',async({get,change,history})=>{
    assert.equal(get('dc-angle-control').hidden,false);assert.equal(get('dc-theta-range').attrs.step,'any');
    assert.equal(get('dc-theta-value').textContent,'180°');
    const input=get('dc-p-theta');input.value='120.25';input.dispatch('input');
    assert.equal(get('dc-theta-range').value,'120.25');assert.equal(get('dc-theta-value').textContent,'120.25°');
    assert.equal(get('dc-urms').textContent,(200*Math.sqrt(120.25/180)).toFixed(1));
    assert.match(get('dc-figure').textContent,/移相/);assert.ok(history.at(-1).includes('theta=120.25'));
    const slider=get('dc-theta-range');slider.value='60.125';slider.dispatch('input');
    assert.equal(input.value,'60.125');assert.equal(get('dc-theta-value').textContent,'60.125°');
    change('dc-circuit-select','half');change('dc-circuit-select','full');assert.equal(get('dc-p-theta').value,'60.125');
    change('dc-p-theta',180);assert.equal(get('dc-figure').textContent,'180° 导电');
  });
  await app('?circuit=full&theta=60.125',async({get})=>assert.equal(get('dc-theta-value').textContent,'60.125°'));
});
test('Both current-source circuits link decimal trigger pulse input to a continuous slider without corrupting draft input',async()=>{
  for(const type of ['parallel','threeI'])await app('?circuit='+type+'&pulse=8.25',async({get,history})=>{
    assert.equal(get('dc-pulse-control').hidden,false);assert.equal(get('dc-pulse-range').attrs.step,'any');
    assert.equal(get('dc-pulse-value').textContent,'8.25°');
    const input=get('dc-p-pulse');input.value='12.75';input.dispatch('input');
    assert.equal(get('dc-pulse-range').value,'12.75');assert.equal(get('dc-pulse-value').textContent,'12.75°');
    input.value='';input.dispatch('input');assert.equal(input.value,'');assert.equal(get('dc-pulse-range').value,'12.75');
    input.dispatch('blur');assert.equal(input.value,'12.75');
    const slider=get('dc-pulse-range');slider.value='4.125';slider.dispatch('input');
    assert.equal(input.value,'4.125');assert.ok(history.at(-1).includes('pulse=4.125'));
  });
});
test('All six circuits render real equations and keep inline subscripts atomic in fields and probe cells',async()=>{
  for(const type of ['half','full','phase','threeV','parallel','threeI'])await app('?circuit='+type,async({get})=>{
    const formulas=get('dc-formulas').innerHTML;assert.match(formulas,/<math\b/);assert.match(formulas,/<msub>/);
    assert.match(formulas,/<mfrac>/);assert.doesNotMatch(formulas,/\b[uUiI]_[A-Za-z]/);
    assert.match(get('dc-fields').innerHTML,/class="dc-field-name"/);
    assert.match(get('dc-probe-values').innerHTML,/<span class="dc-probe-name"><span class="dc-math">[ui]<sub>/);
    assert.doesNotMatch(get('dc-assumptions').innerHTML,/\b[uUiI]_[A-Za-z]/);
  });
  const css=fs.readFileSync(new URL('../dist/dc-inverter.css',import.meta.url),'utf8');
  assert.ok(css.includes('#dc-probe-values>.dc-probe-value{'));assert.ok(!css.includes('#dc-probe-values span{'));
});
test('Current-source UI exposes measured margin and distinguishes incomplete commutation model',async()=>{
  await app('?circuit=parallel',async({get,change})=>{
    assert.equal(get('dc-margin').hidden,false);assert.match(get('dc-margin').innerHTML,/反压时间/);
    change('dc-p-f',100);assert.match(get('dc-status').textContent,/参考/);assert.match(get('dc-status').textContent,/不足/);
    change('dc-circuit-select','threeI');assert.equal(get('dc-margin').hidden,true);change('dc-p-gamma',0);assert.equal(Number(get('dc-p-gamma').value),.5);
    assert.match(get('dc-assumptions').innerHTML,/未求解 C1～C6/);
  });
});
test('Every existing application page has an explicit new inverter entry without changing mode transfer',()=>{
  for(const name of ['index.html','inverter.html','inverter-ideal.html']){
    const html=fs.readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');assert.ok(html.includes('href="./dc-inverter.html"'));
  }
  const html=fs.readFileSync(new URL('../dist/dc-inverter.html',import.meta.url),'utf8');assert.ok(html.includes('href="./inverter.html"'));assert.ok(!html.includes('manifest.webmanifest'));
});
