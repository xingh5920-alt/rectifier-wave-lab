import {rectifierFlowSVG} from './rectifier-flow.js';
import {defaultFlowMotion,playbackRate,advancePlayback,bindProbeGestures,withPlaybackRate,syncSvgPlayback} from './playback.js';
import {circuits,alphaLimit,average,sample,gates,metrics,explanation,mod,loadNames,isFiniteLoad,emf,simulation,controlAngles} from './model.js';
import {formulaMarkup,explanationMarkup,svgNotationMarkup} from './formula-display.js';
import {inversionCircuits,isActiveInversion,readTransferredState,stateUrl,inversionUrl} from './mode-transfer.js';

const $=id=>document.getElementById(id);
const defaults={circuit:'threeBridge',load:'r',alpha:30,u2:100,r:20,f:50,l:100,e:50,pulseWidth:10};
const inversionPage=document.body.dataset.mode==='inverter';
const restored=readTransferredState(window.location?.search);
const initial=restored&&(!inversionPage||inversionCircuits.includes(restored.p.circuit))?restored:null;
let p=initial?{...initial.p}:inversionPage?{...defaults,load:'rle',alpha:120,l:1000,e:-400}:{...defaults};
let cycles=initial?.cycles??2,cursor=initial?.cursor??120,playing=false,timeAxis=initial?.timeAxis??false,lastTime=null;
let speed=playbackRate(new URLSearchParams(window.location?.search).get('speed')),playEpoch=0,flowMoving=defaultFlowMotion(),circuitMarkup='',feedbackAngle=null;
let switchTimer,navigationPending=false,adjustingAlpha=false;
let resumeParameters=initial?.resume?JSON.stringify(p):null;
const availableCircuits=inversionPage?circuits.filter(c=>inversionCircuits.includes(c.id)):circuits;
const traces={source:true,ud:true,average:true,id:true,ivt1:true,input:true};
let calculated=metrics(p), chartCache=null, layout=null, toastTimer;
let anglesInfo=controlAngles(p);
const canvas=$('wave-canvas'), ctx=canvas.getContext('2d');
const color={ink:'#47564e',muted:'#98a29a',grid:'#e8ece4',axis:'#a3afa2',blue:'#347fbd',reference:'#9ca69c',green:'#71996d',cursor:'#ca956c',purple:'#8a74b4'};

function circuit(){return circuits.find(c=>c.id===p.circuit);}
function circuitName(c=circuit()){return inversionPage?c.name.replace('可控整流','有源逆变').replace('全控整流','全控有源逆变'):c.name;}
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2600);}
function number(v,digits=1){return Math.abs(v)<.000001?(0).toFixed(digits):v.toFixed(digits);}
function sanitizeInput(id,min,max,key){const el=$(id),value=el.value.trim().replace(/−/g,'-'),n=Number(value),previous=p[key];p[key]=Number.isFinite(n)&&value!==''?Math.min(max,Math.max(min,n)):p[key];el.value=p[key];if(p[key]!==previous)update();}

function initNav(){
  $('circuit-nav').innerHTML=availableCircuits.map(c=>`<button class="nav-item" data-circuit="${c.id}" aria-pressed="false"><span class="nav-number">0${circuits.indexOf(c)+1}</span><span class="nav-copy">${c.short}<small>${c.sub}</small></span><span class="nav-arrow">↗</span></button>`).join('');
  $('mobile-circuit').innerHTML=availableCircuits.map(c=>`<option value="${c.id}">${circuitName(c)}</option>`).join('');
  document.querySelectorAll('[data-circuit]').forEach(el=>el.addEventListener('click',()=>setCircuit(el.dataset.circuit)));
  $('mobile-circuit').addEventListener('change',e=>setCircuit(e.target.value));
}
function setCircuit(id){
  p.circuit=id;if(!circuit().loads.includes(p.load))p.load='r';
  p.alpha=Math.min(p.alpha,alphaLimit(p.circuit,p.load));update();
}
function update(){
  const c=circuit(),limit=alphaLimit(p.circuit,p.load);
  p.alpha=Math.max(0,Math.min(limit,p.alpha));
  if(p.load==='rl')p.l=Math.max(.1,p.l);
  calculated=metrics(p);
  anglesInfo=controlAngles(p);
  $('angle-readouts').hidden=anglesInfo.beta===null;
  $('angle-note').hidden=anglesInfo.beta===null;
  $('angle-beta').textContent=anglesInfo.beta===null?'—':number(anglesInfo.beta)+'°';
  $('angle-gamma').textContent=anglesInfo.gamma===null?'—':number(anglesInfo.gamma)+'°';
  $('angle-note').textContent=anglesInfo.reason;
  document.querySelectorAll('[data-circuit]').forEach(el=>{const on=el.dataset.circuit===c.id;el.classList.toggle('selected',on);el.setAttribute('aria-pressed',String(on));});
  $('mobile-circuit').value=c.id;
  $('circuit-title').textContent=circuitName(c);$('circuit-sub').textContent=c.sub;
  $('exp-index').textContent='0'+(circuits.indexOf(c)+1);
  $('load').innerHTML=c.loads.map(l=>`<option value="${l}">${loadNames[l]}</option>`).join('');$('load').value=p.load;
  $('load-fields').hidden=!isFiniteLoad(p);$('emf-field').hidden=p.load!=='rle';$('pulse-field').hidden=!isFiniteLoad(p);
  $('inductance').min=p.load==='rle'?0:.1;$('inductance').value=p.l;$('emf').value=p.e;$('pulse-width').value=p.pulseWidth;
  $('load-hint').hidden=!isFiniteLoad(p);
  $('load-hint').textContent=p.load==='rle'?'E 可设为 −1000～1000 V：正值阻碍正向电流，负值沿正向电流方向提供电压。L = 0 时为 RE 负载。':'L 为有限电感，电流的连续与断续由参数计算。';
  for(const id of ['alpha','alpha-number']){$(id).max=limit;$(id).value=p.alpha;}
  $('alpha-range-mid').textContent=Math.round(limit/2)+'°';$('alpha-range-max').textContent=limit+'°';
  const angles=[0,30,60,90,120].filter(a=>a<=limit);
  if(limit===180)angles.push(150,180);if(limit===150)angles.push(150);
  const presetButtons=[...$('presets').querySelectorAll('button')];
  if(presetButtons.length!==angles.length||presetButtons.some((el,i)=>Number(el.dataset.alpha)!==angles[i])){
    $('presets').innerHTML=angles.map(a=>`<button data-alpha="${a}">${a}°</button>`).join('');
    $('presets').querySelectorAll('button').forEach(el=>el.addEventListener('click',()=>{p.alpha=Number(el.dataset.alpha);update();}));
  }
  $('presets').querySelectorAll('button').forEach(el=>el.classList.toggle('selected',Number(el.dataset.alpha)===p.alpha));
  $('alpha-hint').textContent=isFiniteLoad(p)?(c.phases===3?'VT1 在 30° + α 触发。':'α 从交流电压过零点起算。')+' 脉冲到来且满足正向条件时才能导通。':c.id==='threeBridge'?'VT1 在 30° + α 触发；R 负载移相范围 0°～120°。':c.id==='threeHalf'?'VT1 在 30° + α 触发；R 负载移相范围 0°～150°。':'α 从交流电压过零点起算。';
  $('input-hint').textContent=c.phases===3?'U₂ 为相电压有效值；线电压有效值为 √3U₂。':'U₂ 为交流电压有效值，峰值为 √2U₂。';
  $('u2').value=p.u2;$('resistance').value=p.r;$('frequency').value=p.f;
  $('metric-ud').textContent=number(calculated.ud);$('metric-id').textContent=number(calculated.id,2);$('metric-rms').textContent=number(calculated.rms);$('metric-ripple').textContent=!calculated.conducting||calculated.ripple===null?'—':calculated.ripple;
  $('ripple-note').textContent=!calculated.conducting?'未导通，无脉动':calculated.ripple===null?'尚未达到周期稳态':calculated.ripple===0?'输出电压无周期脉动':calculated.ripple===c.pulses*p.f?`每周期 ${c.pulses} 个输出脉波`:'按当前输出波形的重复周期计算';
  $('metric-id-note').innerHTML=explanationMarkup(p.load==='rle'?'I_d = (U_d − E) / R':'I_d = U_d / R');
  $('formula').innerHTML=formulaMarkup(p);
  const [one,two]=explanation(p);$('explanation-one').innerHTML=explanationMarkup(one);$('explanation-two').innerHTML=explanationMarkup(two);
  $('conduction-mode').textContent=!calculated.conducting?'未导通':calculated.continuous?'连续电流':'断续电流';
  $('reference').hidden=c.id!=='threeBridge';
  $('source-legend').textContent='虚线参考电压';
  $('input-legend').innerHTML=explanationMarkup(c.phases===3?'输入 i_a':'输入 i_2');
  $('wave-model-note').innerHTML=explanationMarkup(p.load==='rle'?'断流区 i_d = 0，整个负载端电压 u_d = E':hasFloatingGap()?'断流区的浮置节点电位及 u_VT1 留空':'蓝色实线为实际波形，灰色虚线为参考');
  $('wave-canvas').setAttribute('aria-label',`${circuitName(c)}，${loadNames[p.load]}，触发角 ${p.alpha} 度。平均输出电压 ${number(calculated.ud)} 伏，平均负载电流 ${number(calculated.id,2)} 安。多行展示电压、电流、器件波形及触发脉冲。`);
  feedbackAngle=null;let leastPower=-1e-8;
  for(let a=.25;a<360;a+=.5){const q=sample(a,p);if(q.ud*q.id<leastPower){leastPower=q.ud*q.id;feedbackAngle=a;}}
  $('rect-see-feedback').disabled=feedbackAngle===null;$('rect-see-feedback').textContent=feedbackAngle===null?'当前参数无回馈时段':'查看回馈';
  resizeAndDraw();updateProbe();
  const active=isActiveInversion(p);
  $('mode-status').textContent=inversionPage?(active?`有源逆变 · 保留${c.short}电路及全部参数 · 平均回馈功率 ${number(-calculated.power)} W`:'当前参数未形成连续、稳定的有源逆变。调节 α、E 或 L 可继续观察。'):'自动切换：支持逆变的电路在 α > 90°、E < 0 且连续电流向电网回馈时，进入对应的有源逆变实验。';
  scheduleModeSwitch();
}
function scheduleModeSwitch(){
  clearTimeout(switchTimer);
  if(resumeParameters!==null){if(JSON.stringify(p)===resumeParameters)return;resumeParameters=null;}
  if(navigationPending||adjustingAlpha||document.hidden||!isActiveInversion(p)||inversionPage&&p.l===0)return;
  // Let a drag finish and dismiss the number keyboard before changing pages.
  switchTimer=setTimeout(()=>{
    if(activeNumberInput()||adjustingAlpha||document.hidden||navigationPending||!isActiveInversion(p))return;
    navigationPending=true;pause();
    const view={cycles,cursor,timeAxis};
    if(!inversionPage)window.history?.replaceState(null,'',withPlaybackRate(stateUrl('./',p,view,true),speed));
    window.location.assign(withPlaybackRate(inversionUrl(p,view),speed));
  },350);
}
function hasFloatingGap(){return ['bridge','threeBridge','semi'].includes(p.circuit)&&calculated.gap;}

function rows(){
  const c=circuit(),vm=Math.SQRT2*p.u2,voltage=Math.max(Math.abs(emf(p)),vm*(c.id==='threeBridge'?Math.sqrt(3):1));
  const imax=Math.max(.05,calculated.maxI*1.05);
  const data=[{key:c.id==='threeBridge'?'rails':'source',label:c.id==='threeBridge'?'u_d1':c.phases===3?'u_a,b,c':'u_2',scale:vm,h:100}];
  if(traces.ud)data.push({key:'ud',label:'u_d',scale:voltage,h:128});
  if(traces.id)data.push({key:'id',label:'i_d',scale:imax,h:77,positive:true});
  if(traces.ivt1)data.push({key:'ivt1',label:'i_VT1',scale:imax,h:77,positive:true});
  data.push({key:'uvt1',label:'u_VT1',scale:Math.max(c.phases===3?vm*Math.sqrt(3):vm,vm+Math.abs(emf(p))),h:anglesInfo.gamma===null?104:148,waveHeight:104});
  if(traces.input)data.push({key:'input',label:c.phases===3?'i_a':'i_2',scale:imax,h:82});
  data.push({key:'time',h:30});
  data.push({key:'gates',label:'u_g',h:46+gates(p).length*28});
  return data;
}
function resizeAndDraw(){
  const rowList=rows(),logicalHeight=rowList.reduce((sum,r)=>sum+r.h,0)+20;
  canvas.parentElement.style.height=logicalHeight+'px';
  const width=canvas.parentElement.clientWidth||600;
  const dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(logicalHeight*dpr);
  layout={width,height:logicalHeight,dpr,left:width<450?43:52,right:20,top:13,range:360*cycles,rows:rowList};
  let y=layout.top;rowList.forEach(r=>{r.y=y;const height=r.waveHeight??r.h;r.zero=y+(r.positive?height*.76:height*.49);r.amplitude=height*(r.positive?.51:.34);y+=r.h;});
  layout.waveBottom=rowList.find(r=>r.key==='time').y;
  layout.gateLeft=layout.left;
  chartCache=document.createElement('canvas');chartCache.width=canvas.width;chartCache.height=canvas.height;
  const base=chartCache.getContext('2d');base.scale(dpr,dpr);drawBase(base,layout);draw();
}
function samples(range){
  const values=[];const count=Math.max(1200,Math.ceil(layout.width*cycles*1.4));
  for(let i=0;i<=count;i++)values.push(i*range/count);
  const events=[0,180,...gates(p).flatMap(g=>g.starts),...Array.from({length:12},(_,i)=>i*30)];
  if(isFiniteLoad(p))events.push(...simulation(p).transitions);
  for(const event of events)for(let k=-1;k<=cycles;k++){const t=event+360*k;if(t>=0&&t<=range){values.push(t);if(t>0)values.push(t-.00001);if(t<range)values.push(t+.00001);}}
  return [...new Set(values)].sort((a,b)=>a-b).map(t=>({...sample(t,p),x:t}));
}
function notation(c,label,x,y,size=11){
  const parts=label.split(/,\s+(?=[ugi])/);let px=x;
  for(let i=0;i<parts.length;i++){
    const part=parts[i].replace(/[₁₂₃₄₅₆]/g,ch=>String('₀₁₂₃₄₅₆₇₈₉'.indexOf(ch))).replace(/^g(?=\d)/,'g_');
    const [base,sub]=part.split('_');c.font=`italic ${size}px Georgia, serif`;c.fillText(base,px,y);px+=c.measureText(base).width;
    if(sub){c.font=`${Math.max(6,size*.68)}px system-ui`;c.fillText(sub,px+.5,y+size*.2);px+=c.measureText(sub).width+1;}
    if(i<parts.length-1){c.font=`${size}px Georgia`;c.fillText(',',px,y);px+=4;}
  }
  return px-x;
}
function drawBase(c,L){
  c.fillStyle='#fcfdf8';c.fillRect(0,0,L.width,L.height);
  const x=t=>L.left+t/L.range*(L.width-L.left-L.right),end=L.width-L.right;
  const dataset=samples(L.range),ticks=L.range===360?60:90;
  c.font='10px system-ui';c.lineWidth=.7;
  for(let t=0;t<=L.range;t+=ticks){c.strokeStyle=color.grid;c.setLineDash([]);c.beginPath();c.moveTo(x(t),L.top);c.lineTo(x(t),L.waveBottom-4);c.stroke();}
  const fire=circuit().natural+p.alpha;
  for(let t=fire;t<L.range;t+=circuit().phases===3?(p.circuit==='threeHalf'?120:60):180){if(p.circuit==='half'&&mod(t-fire)>=180)continue;c.strokeStyle='#bdcbbd';c.setLineDash([3,4]);c.beginPath();c.moveTo(x(t),10);c.lineTo(x(t),L.waveBottom-4);c.stroke();}
  if(isFiniteLoad(p))for(const event of simulation(p).transitions)if(sample(event+.001,p).active.length===0){
    for(let k=0;k<cycles;k++){const t=event+360*k;c.strokeStyle='#cbb8a0';c.setLineDash([2,5]);c.beginPath();c.moveTo(x(t),12);c.lineTo(x(t),L.waveBottom-4);c.stroke();if(k===0){c.fillStyle='#ac8d6c';notation(c,'β_e',x(t)+3,10,9);}}
  }
  c.setLineDash([]);
  function path(r,fn,stroke=color.blue,dashed=false,width=1.65,fill=false){
    c.beginPath();let started=false,firstX,lastX;for(const s of dataset){const value=fn(s);if(value===null||!Number.isFinite(value)){started=false;continue;}const px=x(s.x),py=r.zero-value/r.scale*r.amplitude;if(!started){c.moveTo(px,py);firstX=px;started=true;}else c.lineTo(px,py);lastX=px;}
    c.strokeStyle=stroke;c.lineWidth=width;c.setLineDash(dashed?[5,4]:[]);c.stroke();c.setLineDash([]);
    if(fill&&firstX!==undefined){c.lineTo(lastX,r.zero);c.lineTo(firstX,r.zero);c.closePath();c.fillStyle='#347fbd0a';c.fill();}
  }
  function reference(r,kind){
    if(!traces.source)return;
    const list=kind==='line'?[s=>s.phases[0]-s.phases[1],s=>s.phases[0]-s.phases[2],s=>s.phases[1]-s.phases[2],s=>s.phases[1]-s.phases[0],s=>s.phases[2]-s.phases[0],s=>s.phases[2]-s.phases[1]]:circuit().phases===3?[s=>s.phases[0],s=>s.phases[1],s=>s.phases[2]]:[s=>s.phases[0],...(r.key==='ud'&&p.circuit!=='half'?[s=>-s.phases[0]]:[])];
    list.forEach((fn,i)=>path(r,fn,kind==='phase'&&circuit().phases===3?['#c84643','#16825d','#326fd1'][i]:color.reference,true,kind==='phase'?1.05:.85));
  }
  for(const r of L.rows){
    if(r.key==='time'){
      c.fillStyle=color.muted;c.font='9px system-ui';
      for(let t=0;t<=L.range;t+=ticks){const label=timeAxis?number(t/360/p.f*1000,1):t+'°';c.textAlign=t===0?'left':t===L.range?'right':'center';c.fillText(label,x(t),r.y+12);}c.textAlign='left';
      continue;
    }
    if(r.key==='gates'){
      const gx=t=>L.gateLeft+t/L.range*(end-L.gateLeft);
      c.strokeStyle='#e3e9dc';c.lineWidth=.8;c.setLineDash([]);c.beginPath();c.moveTo(0,r.y);c.lineTo(L.width,r.y);c.stroke();
      c.fillStyle=color.ink;notation(c,'u_g',2,r.y+17,11);c.font='10px system-ui';c.fillStyle='#7b9077';c.fillText('触发脉冲',32,r.y+17);
      c.textAlign='right';c.fillText(`α = ${p.alpha}°${anglesInfo.beta===null?'':`   β = ${number(anglesInfo.beta)}°`}   δ = ${p.pulseWidth}°`,end,r.y+17);c.textAlign='left';
      gates(p).forEach((g,i)=>{
        const yy=r.y+43+i*28;
        c.fillStyle='#62765e';notation(c,g.label,10,yy-3,11);
        c.strokeStyle='#e2e9dd';c.lineWidth=.8;c.beginPath();c.moveTo(L.gateLeft,yy);c.lineTo(end,yy);c.stroke();
        for(const start of g.starts)for(let k=-1;k<=cycles;k++){
          const t=start+360*k,w=p.pulseWidth;
          if(t<L.range&&t+w>0){const l=gx(Math.max(0,t)),rr=gx(Math.min(t+w,L.range));c.fillStyle='#347fbd12';c.fillRect(l,yy-12,rr-l,12);c.strokeStyle=color.blue;c.lineWidth=1.5;c.beginPath();c.moveTo(l,yy);c.lineTo(l,yy-12);c.lineTo(rr,yy-12);c.lineTo(rr,yy);c.stroke();}
        }
      });
      continue;
    }
    c.strokeStyle=color.axis;c.lineWidth=.85;c.setLineDash([]);c.beginPath();c.moveTo(L.left,r.y+6);c.lineTo(L.left,r.y+(r.waveHeight??r.h)-9);c.moveTo(L.left,r.zero);c.lineTo(end+6,r.zero);c.stroke();
    c.beginPath();c.moveTo(end+6,r.zero);c.lineTo(end+2,r.zero-2.5);c.moveTo(end+6,r.zero);c.lineTo(end+2,r.zero+2.5);c.stroke();
    c.fillStyle=color.ink;notation(c,r.label,2,r.y+12);if(r.key==='rails')notation(c,'u_d2',2,r.y+r.h-10);c.font='9px system-ui';c.fillStyle=color.muted;c.fillText('0',L.left-10,r.zero+4);
    c.fillStyle='#a2ada0';c.font='8px system-ui';c.fillText(number(r.scale,r.positive?1:0),L.left+4,r.y+16);c.fillText(r.positive||r.key==='input'?'A':'V',L.left+4,r.y+26);
    if(r.key==='source'){
      reference(r,'phase');
      if(traces.source){if(circuit().phases===3){for(let i=0;i<3;i++)path(r,s=>s.phases[i],['#c84643','#16825d','#326fd1'][i],true,1);}else path(r,s=>s.phases[0],'#7b9689',false,1.25);}
    } else if(r.key==='rails'){
      reference(r,'phase');path(r,s=>s.ud1);path(r,s=>s.ud2);
    } else if(r.key==='ud'){
      reference(r,p.circuit==='threeBridge'?$('reference').value:'phase');
      if(traces.average){c.strokeStyle=color.green;c.lineWidth=.9;c.setLineDash([2,3]);const ay=r.zero-calculated.ud/r.scale*r.amplitude;c.beginPath();c.moveTo(L.left,ay);c.lineTo(end,ay);c.stroke();c.setLineDash([]);c.fillStyle=color.green;const labelX=Math.max(L.left+4,end-85),labelWidth=notation(c,'U_d',labelX,ay-4,9);c.font='8px system-ui';c.fillText(' = '+number(calculated.ud)+' V',labelX+labelWidth,ay-4);}
      path(r,s=>s.ud,color.blue,false,1.8,true);
      if(p.circuit==='threeBridge'&&L.width>380){const names=['u_ab','u_ac','u_bc','u_ba','u_ca','u_cb'];c.fillStyle='#719293';for(let t=30+p.alpha;t<L.range;t+=60){const sector=Math.floor(mod(t-30-p.alpha)/60+.001);const mid=t+Math.min(30,(L.range-t)/2);if(mid<L.range)notation(c,names[sector],x(mid)-7,r.y+16,9);}}
    } else if(r.key==='uvt1'){
      if(anglesInfo.gamma!==null){c.fillStyle='#71996d12';c.fillRect(x(anglesInfo.start),r.y+8,x(anglesInfo.end)-x(anglesInfo.start),86);}
      if(circuit().phases===3)reference(r,'line');
      path(r,s=>s.uvt1);
      if(hasFloatingGap()){c.font='8px system-ui';c.fillStyle='#a6a997';c.fillText('断流区留空',end-59,r.y+15);}
      if(anglesInfo.gamma!==null){
        const left=x(anglesInfo.start),right=x(anglesInfo.end);
        c.setLineDash([2,3]);c.strokeStyle='#a9bca3';c.lineWidth=.7;c.beginPath();for(const px of [left,right]){c.moveTo(px,r.y+8);c.lineTo(px,r.y+137);}c.stroke();c.setLineDash([]);
        for(const [symbol,value,yy,stroke] of [['β',anglesInfo.beta,r.y+110,color.purple],['β − γ',anglesInfo.margin,r.y+130,color.green]]){
          c.strokeStyle=stroke;c.lineWidth=1;c.beginPath();c.moveTo(left,yy-3);c.lineTo(left,yy+3);c.moveTo(left,yy);c.lineTo(right,yy);c.moveTo(right,yy-3);c.lineTo(right,yy+3);c.stroke();
          const label=`${symbol} = ${number(value)}°${symbol==='β − γ'?' (γ = 0)':''}`;c.font='9px system-ui';const width=c.measureText(label).width,tx=Math.max(L.left,Math.min((left+right-width)/2,end-width));c.fillStyle='#fcfdf8';c.fillRect(tx-3,yy+2,width+6,12);c.fillStyle=stroke;c.fillText(label,tx,yy+11);
        }
      }
    } else path(r,s=>s[r.key]);
  }
  c.fillStyle='#70876a';c.font='9px system-ui';const label=circuit().natural?'30° + α': 'α';if(fire<L.range){const fx=x(fire);c.fillText(label,Math.min(Math.max(fx-10,L.left+12),end-45),10);}
}
function draw(){
  if(!chartCache||!layout)return;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(chartCache,0,0);ctx.setTransform(layout.dpr,0,0,layout.dpr,0,0);
  const x=layout.left+cursor/layout.range*(layout.width-layout.left-layout.right);
  ctx.strokeStyle=color.cursor;ctx.lineWidth=1;ctx.setLineDash([2,3]);ctx.beginPath();ctx.moveTo(x,12);ctx.lineTo(x,layout.waveBottom-4);ctx.stroke();
  const gateRow=layout.rows.find(r=>r.key==='gates'),gateX=layout.gateLeft+cursor/layout.range*(layout.width-layout.gateLeft-layout.right);
  ctx.beginPath();ctx.moveTo(gateX,gateRow.y+26);ctx.lineTo(gateX,gateRow.y+gateRow.h-12);ctx.stroke();ctx.setLineDash([]);
  const s=sample(cursor,p);
  for(const r of layout.rows){if(['source','rails','gates','time'].includes(r.key))continue;const v=s[r.key];if(v===null||!Number.isFinite(v))continue;const y=r.zero-v/r.scale*r.amplitude;ctx.fillStyle=color.blue;ctx.beginPath();ctx.arc(x,y,2.6,0,Math.PI*2);ctx.fill();}
}

function updateProbe(){
  cursor=Math.min(cycles*360,Math.max(0,cursor));
  if(inversionPage)$('rectifier-return').href=withPlaybackRate(stateUrl('./',p,{cycles,cursor,timeAxis},true),speed);
  $('cursor').max=cycles*360;$('cursor').value=cursor;
  $('cursor-value').textContent=timeAxis?number(cursor/360/p.f*1000,1)+'ms':number(cursor)+'°';
  $('instant-angle').textContent=number(cursor)+'°';
  const s=sample(cursor,p);$('active-valves').textContent=s.active.length?s.active.join(' + ')+(s.freewheel?' 续流':' 导通'):'器件关断 · 负载断流';
  $('instant-source').innerHTML=explanationMarkup(s.freewheel?'续流：u_d = 0，电感中的电流继续流动':s.active.length?'u_d = '+s.source:p.load==='rle'?'i_d = 0，u_d = E = '+number(emf(p))+' V':'u_d = 0，i_d = 0');
  $('instant-ud').textContent=number(s.ud)+' V';$('instant-i').textContent=number(s.ivt1,2)+' A';
  renderCircuit(s);
  syncSvgPlayback($('circuit-diagram'),flowMoving);
  const feedback=s.ud*s.id < -1e-8;
  $('rect-flow-scene').setAttribute('data-feedback',String(feedback));
  $('rect-motion-state').textContent=!(s.id>1e-8)?'零电流 · 当前没有流动路径':s.freewheel?'桥内续流 · 电流不经过交流电源':feedback?'能量回馈 · 电流路径用橙色显示':'整流供能 · 交流侧向负载送能';
  $('rect-flow-direction').textContent=!(s.id>1e-8)?'没有电流时不显示流动光点。':s.freewheel?'负载电流经 '+s.active.join('、')+' 在桥内闭合，交流侧电流为零。':feedback?'负载端向交流电网回馈能量；负载电流仍从上向下，交流支路光点显示实际方向。':'负载电流从上向下；交流支路方向随导通器件切换。';
  const svg=$('circuit-diagram');svg.querySelectorAll('[data-valve]').forEach(el=>el.classList.toggle('active',s.active.includes(el.dataset.valve)));svg.querySelectorAll('[data-flow]').forEach(el=>{if(el.dataset.flow==='load'||el.dataset.flow==='source')el.classList.toggle('active',el.dataset.flow==='load'?s.active.length>0:s.active.length>0&&!s.freewheel);});draw();
}
function line(x1,y1,x2,y2,attrs=''){return `<path class="wire" d="M${x1} ${y1}L${x2} ${y2}" ${attrs}/>`;}
function poly(points,attrs=''){return `<polyline class="wire" points="${points}" ${attrs}/>`;}
function text(x,y,txt,cls='label',attrs=''){return `<text x="${x}" y="${y}" class="${cls}" ${attrs}>${svgNotationMarkup(txt)}</text>`;}
function valve(x,y,angle,name){return `<g transform="translate(${x},${y}) rotate(${angle})"><path class="valve" data-valve="${name}" d="M-22 0H-12M-12 -10L9 0L-12 10ZM10 -12V12M10 0H22${name.startsWith('VT')?'M10 6L21 17H28':''}"/></g>`;}
function branch(x1,y1,x2,y2,name,lx,ly){const angle=Math.atan2(y2-y1,x2-x1)*180/Math.PI;return line(x1,y1,x2,y2,`data-valve="${name}"`)+valve((x1+x2)/2,(y1+y2)/2,angle,name)+text(lx,ly,name,'label',`data-valve="${name}"`);}
function loadSvg(x,top,bottom){
  let svg='',wireEnd=top;
  const inductive=p.load==='rl'||p.load==='rle'&&p.l>0;
  const ry=p.load==='rle'?top+108:inductive?top+136:(top+bottom)/2;
  if(inductive){svg+=line(x,wireEnd,x,top+28,'data-flow="load"');svg+=`<path class="wire" data-flow="load" d="M${x} ${top+28}c-16 0-16 14 0 14c-16 0-16 14 0 14c-16 0-16 14 0 14"/>`+text(x+17,top+53,'L','label');wireEnd=top+70;}
  svg+=line(x,wireEnd,x,ry-17,'data-flow="load"')+`<rect x="${x-9}" y="${ry-17}" width="18" height="34" class="valve" data-flow="load"/>`+text(x+17,ry+4,'R','label');
  wireEnd=ry+17;
  if(p.load==='rle'){const ey=bottom-32;svg+=line(x,wireEnd,x,ey-15,'data-flow="load"')+`<circle cx="${x}" cy="${ey}" r="15" class="valve" data-flow="load"/>`+text(x-4,ey-2,'+','small-label')+text(x-4,ey+10,'−','small-label')+text(x+22,ey+4,'E','label');wireEnd=ey+15;}
  svg+=line(x,wireEnd,x,bottom,'data-flow="load"');
  svg+=line(x+40,top+30,x+40,bottom-24)+`<path class="wire" d="M${x+36} ${bottom-31}L${x+40} ${bottom-24}L${x+44} ${bottom-31}"/>`+text(x+45,(top+bottom)/2,'u_d','small-label');
  svg+=text(x+8,top+19,'+','small-label')+text(x+8,bottom-5,'−','small-label');return svg;
}
function acCircle(x,y){return `<circle cx="${x}" cy="${y}" r="21" class="wire" data-flow="source"/><path class="wire" d="M${x-11} ${y}q5-11 11 0t11 0" data-flow="source"/>`;}
function renderCircuit(probeSample){
  let s='';
  if(p.circuit==='half'){
    s+=poly('75,124 75,55 375,55','data-valve="VT1"')+acCircle(75,145)+poly('75,166 75,245 375,245','data-flow="load"')+valve(220,55,0,'VT1')+text(206,34,'VT1','label','data-valve="VT1"')+text(34,151,'u₂','label')+loadSvg(375,55,245);
  }else if(p.circuit==='bridge'||p.circuit==='semi'){
    const names=p.circuit==='bridge'?['VT1','VT3','VT4','VT2']:['VT1','VT2','D1','D2'];
    s+=branch(127,146,252,45,names[0],140,76)+branch(365,146,252,45,names[1],312,77)+branch(252,250,127,146,names[2],140,239)+branch(252,250,365,146,names[3],312,239);
    s+=line(127,146,225,146,'data-flow="source"')+acCircle(246,146)+line(267,146,365,146,'data-flow="source"')+text(235,186,'u₂','label');
    s+=line(252,45,445,45,'data-flow="load"')+line(252,250,445,250,'data-flow="load"')+loadSvg(445,45,250);
    s+=text(118,162,'a','small-label')+text(367,163,'b','small-label');
  }else if(p.circuit==='threeHalf'){
    for(let i=0;i<3;i++){const y=70+i*67,name='VT'+(i+1);s+=line(53,y,282,y,`data-valve="${name}"`)+valve(167,y,0,name)+text(145,y-18,name,'label',`data-valve="${name}"`)+text(29,y+5,['a','b','c'][i],'label');}
    s+=poly('282,70 282,45 425,45','data-flow="load"')+line(282,70,282,204)+line(53,253,425,253,'data-flow="load"')+text(30,258,'N','label')+loadSvg(425,45,253);
  }else{
    const top=[1,3,5],bottom=[4,6,2];
    s+=line(110,39,450,39)+line(110,259,450,259);
    for(let i=0;i<3;i++){const x=110+i*110,t='VT'+top[i],b='VT'+bottom[i];s+=branch(x,149,x,39,t,x+19,97)+branch(x,259,x,149,b,x+19,221);s+=line(x-28,149,x,149)+text(x-45,154,['a','b','c'][i],'label')+`<circle cx="${x}" cy="149" r="3" class="node"/>`;}
    s+=loadSvg(450,39,259)+text(30,292,'U₂：相电压有效值','small-label');
  }
  const markup=`<svg viewBox="0 0 530 310" role="img" aria-label="${circuitName()}主电路，光点表示实际电流方向，橙色表示回馈">${s}${rectifierFlowSVG(probeSample,p,speed)}</svg>`;
  if(markup!==circuitMarkup){$('circuit-diagram').innerHTML=markup;circuitMarkup=markup;}
}

function animate(now,epoch){
  if(!playing||epoch!==playEpoch)return;
  if(lastTime!==null){cursor=advancePlayback(cursor,now-lastTime,speed,4000,cycles*360);updateProbe();}
  lastTime=now;requestAnimationFrame(next=>animate(next,epoch));
}
function togglePlay(){playing=!playing;setFlowMotion(playing);lastTime=null;const epoch=++playEpoch;$('play-icon').textContent=playing?'Ⅱ':'▶';$('play-text').textContent=playing?'暂停':'播放';$('play').setAttribute('aria-label',playing?'暂停波形导通过程':'播放波形导通过程');$('play').setAttribute('aria-pressed',String(playing));if(playing)requestAnimationFrame(now=>animate(now,epoch));}
function pause(){if(playing)togglePlay();}
function setCursorFromPointer(e){const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;const left=y>=layout.rows.find(r=>r.key==='gates').y?layout.gateLeft:layout.left;cursor=Math.max(0,Math.min(layout.range,(x-left)/(layout.width-left-layout.right)*layout.range));updateProbe();}

function setFlowMotion(enabled){flowMoving=enabled;$('rect-flow-motion').textContent=enabled?'Ⅱ 暂停流动':'▶ 仅播放电流';$('rect-flow-motion').setAttribute('aria-pressed',String(enabled));syncSvgPlayback($('circuit-diagram'),enabled);}
setFlowMotion(flowMoving);
$('rect-flow-motion').addEventListener('click',()=>{if(flowMoving){pause();setFlowMotion(false);}else setFlowMotion(true);});
$('rect-see-feedback').addEventListener('click',()=>{if(feedbackAngle===null)return;pause();cursor=feedbackAngle;setFlowMotion(true);updateProbe();});
$('playback-speed').value=speed;
initNav();
$('alpha').addEventListener('pointerdown',()=>{adjustingAlpha=true;clearTimeout(switchTimer);});
function finishAlphaDrag(){if(adjustingAlpha){adjustingAlpha=false;scheduleModeSwitch();}}
window.addEventListener?.('pointerup',finishAlphaDrag);
window.addEventListener?.('pointercancel',finishAlphaDrag);
$('alpha').addEventListener('input',e=>{p.alpha=Number(e.target.value);update();});
$('alpha-number').addEventListener('change',()=>sanitizeInput('alpha-number',0,alphaLimit(p.circuit,p.load),'alpha'));
$('load').addEventListener('change',e=>{p.load=e.target.value;update();});
$('u2').addEventListener('change',()=>sanitizeInput('u2',1,1000,'u2'));
$('resistance').addEventListener('change',()=>sanitizeInput('resistance',.1,10000,'r'));
$('inductance').addEventListener('change',()=>sanitizeInput('inductance',p.load==='rle'?0:.1,2000,'l'));
$('emf').addEventListener('change',()=>sanitizeInput('emf',-1000,1000,'e'));
$('pulse-width').addEventListener('change',()=>sanitizeInput('pulse-width',1,60,'pulseWidth'));
const numericFields=new Map([['alpha-number','触发角 α'],['u2','输入有效值 U₂'],['resistance','负载电阻 R'],['inductance','负载电感 L'],['emf','反电动势 E'],['pulse-width','触发脉冲宽度 δ']]);
function activeNumberInput(){const el=document.activeElement;return el&&numericFields.has(el.id)?el:null;}
function positionInputToolbar(){const viewport=window.visualViewport;document.documentElement.style.setProperty('--input-toolbar-bottom',Math.max(12,viewport?window.innerHeight-viewport.height-viewport.offsetTop+12:12)+'px');}
function syncInputToolbar(){const el=activeNumberInput();$('input-toolbar').hidden=!el;if(el){$('input-toolbar-label').textContent=numericFields.get(el.id);$('input-sign').hidden=el.id!=='emf';positionInputToolbar();}}
function finishNumberInput(){const el=activeNumberInput();if(el){el.dispatchEvent(new Event('change',{bubbles:true}));el.blur();}$('input-toolbar').hidden=true;}
document.addEventListener('focusin',syncInputToolbar);
document.addEventListener('focusout',()=>queueMicrotask(()=>{syncInputToolbar();scheduleModeSwitch();}));
document.addEventListener('pointerdown',event=>{if(activeNumberInput()&&!numericFields.has(event.target.id)&&!event.target.closest('#input-toolbar'))finishNumberInput();});
for(const id of numericFields.keys())$(id).addEventListener('keydown',event=>{if(event.key==='Enter'||event.key==='Escape'){event.preventDefault();finishNumberInput();}});
$('input-toolbar').addEventListener('pointerdown',event=>event.preventDefault());
$('input-done').addEventListener('click',finishNumberInput);
$('input-sign').addEventListener('click',()=>{const el=activeNumberInput();if(el?.id!=='emf')return;const value=el.value.trim().replace(/−/g,'-');el.value=value.startsWith('-')?value.slice(1):'-'+value;if(Number.isFinite(Number(el.value))&&Number(el.value)!==0)el.dispatchEvent(new Event('change',{bubbles:true}));el.focus({preventScroll:true});el.setSelectionRange(el.value.length,el.value.length);});
window.visualViewport?.addEventListener('resize',positionInputToolbar);
window.visualViewport?.addEventListener('scroll',positionInputToolbar);
$('frequency').addEventListener('change',e=>{p.f=Number(e.target.value);update();});
$('reference').value='line';$('reference').addEventListener('change',()=>resizeAndDraw());
$('reset').addEventListener('click',()=>{pause();p={...defaults,circuit:p.circuit,load:p.load};cursor=120;cycles=2;timeAxis=false;Object.keys(traces).forEach(k=>traces[k]=true);updateAxisButton();document.querySelectorAll('[data-trace]').forEach(el=>el.setAttribute('aria-pressed','true'));update();setCycles(2);toast('参数已重置');});
function setCycles(n){cycles=n;cursor=Math.min(cursor,cycles*360);document.querySelectorAll('[data-cycles]').forEach(el=>{const on=Number(el.dataset.cycles)===cycles;el.classList.toggle('selected',on);el.setAttribute('aria-pressed',String(on));});resizeAndDraw();updateProbe();}
document.querySelectorAll('[data-cycles]').forEach(el=>el.addEventListener('click',()=>setCycles(Number(el.dataset.cycles))));
document.querySelectorAll('[data-trace]').forEach(el=>{el.setAttribute('aria-pressed',String(traces[el.dataset.trace]));el.addEventListener('click',()=>{traces[el.dataset.trace]=!traces[el.dataset.trace];el.setAttribute('aria-pressed',String(traces[el.dataset.trace]));resizeAndDraw();});});
function updateAxisButton(){
  $('axis').innerHTML=`<span>${timeAxis?'时间':'角度'}</span><span class="axis-quantity"><span class="math-inline">${timeAxis?'t':'ωt'}</span><span class="axis-unit">${timeAxis?'(ms)':'(°)'}</span></span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6h13m-3-3 3 3-3 3M17 14H4m3-3-3 3 3 3"/></svg>`;
  const label=timeAxis?'当前横轴为时间，点击切换为角度':'当前横轴为角度，点击切换为时间';
  $('axis').setAttribute('title',label);$('axis').setAttribute('aria-label',label);
}
$('axis').addEventListener('click',()=>{timeAxis=!timeAxis;updateAxisButton();resizeAndDraw();updateProbe();});
$('cursor').addEventListener('input',e=>{pause();cursor=Number(e.target.value);updateProbe();});
$('play').addEventListener('click',togglePlay);
$('step').addEventListener('click',()=>{pause();const events=[...new Set(gates(p).flatMap(g=>g.starts))].flatMap(t=>Array.from({length:cycles},(_,k)=>t+k*360)).sort((a,b)=>a-b);cursor=events.find(t=>t>cursor+.01)??events[0]??0;updateProbe();});
bindProbeGestures(canvas,{pause,point:setCursorFromPointer,isPlaying:()=>playing});
$('playback-speed').addEventListener('change',event=>{speed=playbackRate(event.target.value);lastTime=null;updateProbe();});
$('help').addEventListener('click',()=>$('help-dialog').showModal());
$('close-help').addEventListener('click',()=>$('help-dialog').close());$('start-learning').addEventListener('click',()=>$('help-dialog').close());
$('help-dialog').addEventListener('click',e=>{if(e.target===$('help-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('export').addEventListener('click',()=>{
  const out=document.createElement('canvas'),s=2,w=Math.max(layout.width,600),headerHeight=anglesInfo.beta===null?95:116,h=layout.height+headerHeight+81;out.width=w*s;out.height=h*s;
  const c=out.getContext('2d');c.scale(s,s);c.fillStyle='#fcfdf8';c.fillRect(0,0,w,h);c.fillStyle='#284637';c.font='600 18px system-ui';c.fillText(circuitName()+' · 波形图',22,32);c.fillStyle='#7b8b72';c.font='11px system-ui';c.fillText(`${loadNames[p.load]}    α = ${p.alpha}°    U₂ = ${p.u2} V    R = ${p.r} Ω    f = ${p.f} Hz`,22,56);
  if(isFiniteLoad(p))c.fillText(`L = ${p.l} mH    E = ${emf(p)} V    触发脉冲宽度 = ${p.pulseWidth}°    ${calculated.continuous?'连续电流':calculated.conducting?'断续电流':'未导通'}`,22,76);
  if(anglesInfo.beta!==null)c.fillText(`β = ${number(anglesInfo.beta)}°    换相重叠角 γ = ${anglesInfo.gamma===null?'—':number(anglesInfo.gamma)+'°'}    L_B = 0（瞬时换相）`,22,96);
  c.drawImage(chartCache,20,headerHeight,w-40,layout.height);c.font='10px system-ui';c.fillStyle='#5d7651';c.fillText(`平均 U_d = ${number(calculated.ud)} V    I_d = ${number(calculated.id,2)} A    U_d,rms = ${number(calculated.rms)} V`,22,h-45);c.fillStyle='#8b9982';c.font='9px system-ui';c.fillText('理想器件，忽略换相重叠；三相 U₂ 为相电压有效值。蓝线为实际波形，虚线为参考。',22,h-25);if(hasFloatingGap())c.fillText('断流区浮置节点的母线电位及 u_VT1 留空。',22,h-10);
  out.toBlob(blob=>{if(!blob){toast('生成图片失败，请重试');return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${circuit().short}_${inversionPage?'有源逆变_':''}${p.load}_alpha${p.alpha}.png`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);toast('波形图已生成');},'image/png');
});
new ResizeObserver(()=>resizeAndDraw()).observe(canvas.parentElement);
document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();adjustingAlpha=false;clearTimeout(switchTimer);}else scheduleModeSwitch();});
window.addEventListener?.('pageshow',event=>{navigationPending=false;if(event.persisted){resumeParameters=JSON.stringify(p);adjustingAlpha=false;clearTimeout(switchTimer);}});
updateAxisButton();
update();setCycles(cycles);
