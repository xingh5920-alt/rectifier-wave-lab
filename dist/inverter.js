import {defaultFlowMotion,playbackRate,advancePlayback,bindProbeGestures,syncSvgPlayback,withPlaybackRate} from './playback.js';
import {simulateInverter,inverterSample,selectedCommutation,commutationMeasurements} from './inverter-model.js';
import {inverterLayout,drawInverterChart,drawInverterProbe} from './inverter-chart.js';
import {explanationMarkup} from './formula-display.js';
import {inverterCircuits,inverterTopology,inverterPreset,eventName} from './inverter-topologies.js';
import {inverterFormulaMarkup} from './inverter-formulas.js';
import {inverterCircuitSvg} from './inverter-circuit.js';
import {readTransferredState,inverterParameters,isActiveInversion,inversionUrl,stateUrl} from './mode-transfer.js';
const $=id=>document.getElementById(id),canvas=$('inverter-canvas'),ctx=canvas.getContext('2d');
const transferred=readTransferredState(window.location?.search),imported=inverterParameters(transferred);
if(transferred&&!imported)window.location.replace(isActiveInversion(transferred.p)?inversionUrl(transferred.p,transferred):stateUrl('./',transferred.p,transferred,true));
const requested=new URLSearchParams(window.location?.search??'').get('circuit');
let p=imported?{...inverterPreset(imported.circuit),...imported}:inverterPreset(inverterCircuits.some(c=>c.id===requested)?requested:'threeHalf'),scenario='steady',selectedPreset=imported?'':'normal',inductanceMode=imported?'custom':'large',customInductance=imported?.l??2000,result,layout,baseCanvas,focusedEvent=null,cursor=imported?transferred.cursor:176,range=imported?transferred.cycles*360:window.innerWidth<650?360:720,timeAxis=imported?transferred.timeAxis:false,referenceMode='line',playing=false,lastTime=null,toastTimer;
let speed=playbackRate(new URLSearchParams(window.location?.search).get('speed')),playEpoch=0,diagramMarkup='',flowMoving=defaultFlowMotion(),feedbackAngle=null;
const circuitStates=new Map();
if(imported){$('inv-transfer-status').hidden=false;$('inv-transfer-status').textContent=(transferred.lb!==undefined?'已恢复':'已进入')+inverterTopology(p.circuit).name+(transferred.lb!==undefined?'有源逆变，链接中的参数已恢复。':'有源逆变。电路及初始参数来自整流页面；可增加交流侧电感观察换相重叠。');$('inv-rectifier-return').textContent='返回整流实验';}
const numericFields=new Map([
  ['inv-alpha-number',{key:'alpha',min:90,max:179.99,label:'触发角 α'}],['inv-lb',{key:'lb',min:0,max:20,label:'每相交流侧电感 L_B'}],['inv-l',{key:'l',min:.000001,max:100000,label:'平波电感 L'}],['inv-u2',{key:'u2',min:1,max:1000,label:'相电压有效值 U₂'}],['inv-r',{key:'r',min:.1,max:10000,label:'负载电阻 R'}],['inv-e',{key:'e',min:-1000,max:0,label:'直流电动势 E'}],['inv-pulse',{key:'pulseWidth',min:1,max:60,label:'触发脉冲宽度 δ'}]
]);
const fmt=(n,d=1)=>!Number.isFinite(n)?'—':Math.abs(n)<.000001?(0).toFixed(d):n.toFixed(d);
function toast(msg){$('inv-toast').textContent=msg;$('inv-toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('inv-toast').classList.remove('show'),2400);}
function update(){
  result=simulateInverter(p,scenario);
  feedbackAngle=null;let leastPower=-1e-8;
  for(let a=.25;a<range;a+=.5){const q=inverterSample(result,a);if(q.valid!==false&&q.ud*q.id<leastPower){leastPower=q.ud*q.id;feedbackAngle=a;}}
  $('inv-see-feedback').disabled=feedbackAngle===null;$('inv-see-feedback').textContent=feedbackAngle===null?'当前参数无回馈时段':'查看回馈';
  updateTopology();
  for(const [id,field] of numericFields)if(document.activeElement!==$(id))$(id).value=p[field.key];
  $('inv-l-mode').value=inductanceMode;$('inv-l').disabled=inductanceMode==='large';
  $('inv-l-mode-hint').textContent=inductanceMode==='large'?'极大电感以 50 H 近似，总电流接近恒定。切换自定义后可修改 L。':'可输入大于 0、至 100000 mH 的电感。减小 L，可观察总电流的纹波与断续。';
  $('inv-alpha').value=p.alpha;$('inv-f').value=p.f;
  document.querySelectorAll('[data-angle]').forEach(el=>el.classList.toggle('selected',Number(el.dataset.angle)===p.alpha));
  for(const kind of ['normal','ideal','failure']){$('preset-'+kind).classList.toggle('active',selectedPreset===kind);$('preset-'+kind).setAttribute('aria-pressed',String(selectedPreset===kind));}
  $('scenario-note').textContent=scenario==='failure'?`暂态演示：360° 时将 α 从 140° 改为 ${p.alpha}°，其他参数相同。`:'稳态观察：调节参数，比较换相过程。';
  const m=result.metrics;
  $('inv-ud').textContent=fmt(m.ud);$('inv-id').textContent=fmt(m.id,2);$('inv-power').textContent=fmt(m.power,0);
  const state=result.limited?'多重重叠 · 后段留空':result.failed?'换相失败 · 暂态':m.currentMax<=1e-8?'未导通':!result.continuous?'电流断续':m.power<0?(result.converged?'正常有源逆变':'回馈暂态'):'当前未向电网回馈';
  $('inv-state-badge').textContent=state;$('inv-status').classList.toggle('failed',result.failed);
  $('inv-status').textContent=state+(result.limited?'。多个理想短路支路的电流分配不唯一，超出可确定的计算区间；统计值留空。':result.failed?'。观察 p 点后的电压与电流。':result.converged?' · 周期稳态已收敛。':scenario==='failure'?' · 显示触发角改变后的暂态。':' · 显示暂态，尚未收敛至周期稳态。');
  $('inv-explanation').textContent=result.failed?'β 变小时，电流可能无法在换相电压反向前完成交接。新导通支路电流随后回落，原支路仍保持电流；继续观察 p 点以后的实际暂态。':p.lb===0?'交流侧电感为零，电流瞬时交接，γ = 0。增加交流侧电感，可观察换相重叠。':p.circuit==='bridge'?'触发新的晶闸管对后，四只管在 γ 区间同时导通，输出电压为零；交流输入电流连续改变方向，旧管对电流降到零才结束换相。':p.circuit==='threeBridge'?'上、下桥臂每隔 60° 交替换相，通常由三只管同时导通交接电流。交流侧电感使母线电位改变，输出电压形成换相台阶。':'两相晶闸管在 γ 区间交接电流。负载电感很大时，换相电压接近两相电压的平均值；有限 L 时按电感方程计算。';
  rebuild();updateProbe();
}
function updateTopology(){
  const topology=inverterTopology(p.circuit),single=p.circuit==='bridge',half=p.circuit==='threeHalf';
  for(const c of inverterCircuits){const el=$('inv-circuit-'+c.id);el.classList.toggle('selected',c.id===p.circuit);el.setAttribute('aria-pressed',String(c.id===p.circuit));}
  $('inv-circuit-sub').textContent=topology.name+' · 交流侧电感与换相重叠';$('inv-footer-circuit').textContent=topology.name+' · 有源逆变';
  $('inv-lb-label').innerHTML=explanationMarkup(topology.lbLabel);$('inv-u2-label').innerHTML=explanationMarkup(topology.uLabel);
  numericFields.get('inv-lb').label=topology.lbLabel;numericFields.get('inv-u2').label=topology.uLabel;
  $('inv-reference').hidden=!(!single&&!half);$('inv-reference').value=referenceMode;
  $('inv-reference-caption').textContent=(single?'红色虚线：交流输入电压':p.circuit==='threeBridge'&&referenceMode==='line'?'彩色虚线：线电压':'彩色虚线：相电压')+' · 浅色区：换相过程';
  const legend=single?'<span class="phase-a"><i></i><span>u_2 / VT1、VT2</span></span><span class="phase-c"><i></i><span>VT3、VT4</span></span>':half?['a','b','c'].map((name,j)=>`<span class="phase-${name}"><i></i><span>${name} 相 / VT${j+1}</span></span>`).join(''):['a','b','c'].map((name,j)=>`<span class="phase-${name}"><i></i><span>${name} 相 / VT${[1,3,5][j]}、VT${[4,6,2][j]}</span></span>`).join('');
  $('inv-legend').innerHTML=legend.replace(/<span>([^<>]+)<\/span>/g,(_,txt)=>'<span>'+explanationMarkup(txt)+'</span>')+'<span class="actual-line"><i></i><span>'+explanationMarkup('u_d 实线 · i_d 虚线')+'</span></span>'+(p.circuit==='threeBridge'?'<span class="inv-line-note">器件电流：上桥臂实线，下桥臂虚线</span>':'');
  $('inv-formula').innerHTML=inverterFormulaMarkup(p);
  $('inv-symbol-convention').innerHTML=explanationMarkup(single?'U₂ 为交流输入有效值。L_B 为整个交流回路的总电感，图中只画一个等效电感。i_2 为交流输入电流，u_AC 为电感之后的桥交流端电压。VT1、VT2 为正向管对，VT3、VT4 为反向管对。':half?'U₂ 为相电压有效值。a、b、c 分别连接 VT1、VT2、VT3，每相电感为 L_B。':'U₂ 为相电压有效值，线电压有效值为 √3U₂。a 相连接 VT1、VT4；b 相连接 VT3、VT6；c 相连接 VT5、VT2。每相电感为 L_B。');
  $('inv-overlap-note').textContent=single?'单相桥四管重叠时 u_d = 0，输入电流的换向由整个交流回路的 L_B 决定。平均关系仅用于连续且近似恒定电流；统计数值来自实际波形。':half?'两相重叠时，极大负载电感下的输出电压接近两相相电压平均值。平均关系仅适用于连续且近似恒定电流。':'三相桥上、下桥臂各自交接电流。图中按实际母线电位计算有限负载电感下的电压；平均关系适用于连续电流、普通三管重叠。';
  $('inv-overlap-note').innerHTML=explanationMarkup($('inv-overlap-note').textContent);
  $('inverter-canvas').setAttribute('aria-label',topology.name+'有源逆变输出电压、负载与器件电流、交流输入电流、晶闸管电压和'+topology.valves+'路触发脉冲。');
  updateAxisButton();
}
function updateAxisButton(){
  $('inv-axis').innerHTML=`<span>${timeAxis?'时间':'角度'}</span><span class="axis-quantity"><span class="math-inline">${timeAxis?'t':'ωt'}</span><span class="axis-unit">${timeAxis?'(ms)':'(°)'}</span></span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6h13m-3-3 3 3-3 3M17 14H4m3-3-3 3 3 3"/></svg>`;
  $('inv-axis').setAttribute('aria-label',timeAxis?'当前为时间横轴，切换为角度':'当前为角度横轴，切换为时间');
}
function selectCircuit(circuit){
  if(circuit===p.circuit)return;
  pause();finishInput();circuitStates.set(p.circuit,{p:{...p},scenario,selectedPreset,inductanceMode,customInductance,cursor,range,referenceMode});
  const cached=circuitStates.get(circuit);
  if(cached){p={...cached.p};({scenario,selectedPreset,inductanceMode,customInductance,cursor,range,referenceMode}=cached);}
  else{p=inverterPreset(circuit);scenario='steady';selectedPreset='normal';inductanceMode='large';customInductance=2000;cursor=circuit==='bridge'?146:176;referenceMode='line';}
  $('inv-transfer-status').hidden=true;update();setRange(range);
}
function rebuild(){
  const width=Math.max(560,$('chart-viewport').clientWidth),dpr=Math.min(2,window.devicePixelRatio||1);
  layout=inverterLayout(width,range,p.circuit,timeAxis,referenceMode);canvas.width=width*dpr;canvas.height=layout.height*dpr;canvas.style.width=width+'px';canvas.style.height=layout.height+'px';
  baseCanvas=document.createElement('canvas');baseCanvas.width=canvas.width;baseCanvas.height=canvas.height;
  focusedEvent=selectedCommutation(result,cursor,range);
  const c=baseCanvas.getContext('2d');c.scale(dpr,dpr);drawInverterChart(c,layout,result,focusedEvent);layout.dpr=dpr;
}
function draw(){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(baseCanvas,0,0);ctx.setTransform(layout.dpr,0,0,layout.dpr,0,0);drawInverterProbe(ctx,layout,result,cursor);}
function updateProbe(){
  cursor=Math.max(0,Math.min(range,cursor));$('inverter-cursor').max=range;$('inverter-cursor').value=cursor;
  if(selectedCommutation(result,cursor,range)!==focusedEvent)rebuild();
  updateAngleReadouts();
  $('probe-angle').textContent=timeAxis?fmt(cursor/360/p.f*1000)+' ms':fmt(cursor)+'°';$('inv-probe-time').textContent=fmt(cursor)+'°';
  const s=inverterSample(result,cursor),topology=inverterTopology(p.circuit),active=Array.from({length:topology.valves},(_,j)=>j).filter(j=>s.mask&(1<<j)),overlap=active.length>(p.circuit==='threeHalf'?1:2);
  $('inv-probe-valves').textContent=s.valid===false?'超出可确定的支路分配区间':active.length?active.map(j=>'VT'+(j+1)).join(' + ')+(overlap?' · 换相中':' 导通'):'全部关断';
  $('inv-probe-note').textContent=s.valid===false?'后段波形与统计值留空，避免把不唯一的理想支路电流显示成精确结果。':overlap?(p.circuit==='bridge'?'四只管同时导通，u_d = 0，交流输入电流正在换向。':`${active.length} 只管同时导通，电感电流正在交接。`):active.length?'输出电压负值且负载电流正向时，直流侧向交流侧回馈。':'电流为零，暂未建立导通路径。';
  $('inv-probe-note').innerHTML=explanationMarkup($('inv-probe-note').textContent);
  $('inv-probe-ud').textContent=fmt(s.ud)+' V';$('inv-probe-id').textContent=fmt(s.id,2)+' A';
  $('inv-valve-values').innerHTML=Array.from({length:topology.valves},(_,j)=>`<span class="phase-${['a','b','c'][topology.colors[j]]}"><span class="math-inline">i<sub>VT${j+1}</sub></span><b>${fmt(s.currents[j],2)} A</b></span>`).join('');
  const markup=inverterCircuitSvg(s,p,speed);
  if(markup!==diagramMarkup){$('inverter-diagram').innerHTML=markup;diagramMarkup=markup;}
  syncSvgPlayback($('inverter-diagram'),flowMoving);
  $('inv-motion-state').textContent=s.valid===false?'支路分配未确定 · 动画留空':!(s.id>1e-8)?'未导通 · 当前没有流动电流':overlap?'晶闸管换相 · 前后支路正在交接电流':s.ud*s.id<0?'能量回馈 · 直流侧向交流电网送能':Math.abs(s.ud)<1e-8?'电流持续 · 当前输出电压接近零':'瞬时供能 · 交流侧向直流侧送能';
  $('inv-flow-scene').setAttribute('data-feedback',String(s.ud*s.id < -1e-8));
  $('inv-flow-direction').textContent=s.valid===false?'当前支路分配不确定，不显示流动。':!(s.id>1e-8)?'当前无电流。':s.ud*s.id<0?'回馈：直流电源 E 经导通晶闸管向交流电网送能。直流电流仍沿原方向流动，交流支路按实际电流正负显示方向。':'光点显示各支路实际电流方向；能量方向同时由电压与电流决定。';
  const view={cycles:range/360,cursor,timeAxis};$('inv-rectifier-return').href=withPlaybackRate(stateUrl('./',{...p,load:'rle'},view,true),speed);
  const link=stateUrl('./inverter.html',{...p,load:'rle'},{...view,lb:p.lb});window.history?.replaceState(null,'',withPlaybackRate(link,speed));draw();
}
function updateAngleReadouts(){
  const m=commutationMeasurements(focusedEvent),name=focusedEvent?eventName(focusedEvent):'';
  $('inv-angle-selection').textContent=focusedEvent?(cursor<focusedEvent.start?'下一次换相：':'所选换相：')+name:'角度关系 · 当前没有有效换相';
  $('inv-beta').textContent=fmt(m?.beta??180-p.alpha,2)+'°';
  $('inv-gamma').textContent=m?.gamma!==null&&m?.gamma!==undefined?fmt(m.gamma,2)+'°':focusedEvent?.failed?'未完成':'—';
  $('inv-margin').textContent=m?.margin!==null&&m?.margin!==undefined?fmt(m.margin,2)+'°':'—';
  $('inv-margin-label').textContent=m?.delay>.005||m?.nonstandard?'可用反向电压区间':'反向电压区间 β−γ';
  $('inv-angle-hint').textContent=!m?'β = 180° − α；没有完整电流交接时不标注 γ。':m.gamma===null?`所选换相在 p = ${fmt(m.p,2)}° 前未完成，γ 不作为有效重叠角显示。`:`γ 对应 ${fmt(m.start,2)}° → ${fmt(m.end,2)}°。n：自然点；g：触发；e：换相结束；p：反压结束。${m.delay>.005?`触发后等待 ${fmt(m.delay,2)}°，可用反压按 p−e 计算。`:''}${m.nonstandard?'异常导通路径的 p 按实际换相电压过零确定。':''}`;
}

$('inv-see-feedback').addEventListener('click',()=>{if(feedbackAngle===null)return;pause();cursor=feedbackAngle;flowMoving=true;$('inv-flow-motion').textContent='Ⅱ 暂停流动';$('inv-flow-motion').setAttribute('aria-pressed','true');updateProbe();});
$('inv-flow-motion').textContent=flowMoving?'Ⅱ 暂停流动':'▶ 开始流动';$('inv-flow-motion').setAttribute('aria-pressed',String(flowMoving));
$('inv-flow-motion').addEventListener('click',()=>{flowMoving=!flowMoving;$('inv-flow-motion').textContent=flowMoving?'Ⅱ 暂停流动':'▶ 开始流动';$('inv-flow-motion').setAttribute('aria-pressed',String(flowMoving));syncSvgPlayback($('inverter-diagram'),flowMoving);});
function pause(){playing=false;playEpoch++;lastTime=null;$('inverter-play').textContent='▶ 播放';$('inverter-play').setAttribute('aria-label','播放导通过程');$('inverter-play').setAttribute('aria-pressed','false');}
function animate(now,epoch){if(!playing||epoch!==playEpoch)return;if(lastTime!==null){cursor=advancePlayback(cursor,now-lastTime,speed,5000,range);updateProbe();}lastTime=now;requestAnimationFrame(next=>animate(next,epoch));}
function setRange(next){pause();range=scenario==='failure'?720:next;cursor=Math.min(cursor,range);$('cycle-one').classList.toggle('selected',range===360);$('cycle-two').classList.toggle('selected',range===720);$('cycle-one').setAttribute('aria-pressed',String(range===360));$('cycle-two').setAttribute('aria-pressed',String(range===720));rebuild();updateProbe();}
function preset(kind){pause();$('inv-transfer-status').hidden=true;p=inverterPreset(p.circuit);inductanceMode='large';customInductance=2000;selectedPreset=kind;scenario=kind==='failure'?'failure':'steady';if(kind==='ideal')p.lb=0;if(kind==='failure'){p.alpha=172;range=720;cursor=450;}else cursor=p.circuit==='bridge'?146:176;update();if(kind==='failure'){const event=result.events.find(e=>e.failed&&e.start>=360);if(event)cursor=Math.min(720,event.deadline);}setRange(range);}
function commit(id){const field=numericFields.get(id),el=$(id),raw=el.value.trim().replace(/−/g,'-').replace(/，/g,'.'),n=Number(raw);let changed=false;if(!el.disabled&&raw!==''&&Number.isFinite(n)){const next=Math.min(field.max,Math.max(field.min,n));changed=next!==p[field.key];if(changed){pause();selectedPreset='';p[field.key]=next;if(field.key==='l')customInductance=next;}}el.value=p[field.key];if(changed)update();}
function activeInput(){const el=document.activeElement;return el&&!el.disabled&&numericFields.has(el.id)?el:null;}
function positionToolbar(){const viewport=window.visualViewport;document.documentElement.style.setProperty('--input-toolbar-bottom',Math.max(12,viewport?window.innerHeight-viewport.height-viewport.offsetTop+12:12)+'px');}
function syncToolbar(){const el=activeInput();$('inv-input-toolbar').hidden=!el;if(el){$('inv-input-label').textContent=numericFields.get(el.id).label;$('inv-input-negative').hidden=el.id!=='inv-e';positionToolbar();}}
function finishInput(){const el=activeInput();if(el){commit(el.id);el.blur();}$('inv-input-toolbar').hidden=true;}
for(const [id] of numericFields){$(id).addEventListener('change',()=>commit(id));$(id).addEventListener('keydown',e=>{if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();finishInput();}});}
document.addEventListener('focusin',syncToolbar);document.addEventListener('focusout',()=>queueMicrotask(syncToolbar));
document.addEventListener('pointerdown',e=>{if(activeInput()&&!numericFields.has(e.target.id)&&!e.target.closest('#inv-input-toolbar'))finishInput();});
$('inv-input-toolbar').addEventListener('pointerdown',e=>e.preventDefault());$('inv-input-done').addEventListener('click',finishInput);
$('inv-input-negative').addEventListener('click',()=>{const el=activeInput();if(el?.id!=='inv-e')return;el.value='-'+el.value.trim().replace(/^[−-]/,'');el.focus({preventScroll:true});el.setSelectionRange(el.value.length,el.value.length);});
window.visualViewport?.addEventListener('resize',positionToolbar);window.visualViewport?.addEventListener('scroll',positionToolbar);
$('inv-alpha').addEventListener('input',e=>{pause();selectedPreset='';p.alpha=Number(e.target.value);update();});
document.querySelectorAll('[data-angle]').forEach(el=>el.addEventListener('click',()=>{pause();selectedPreset='';p.alpha=Number(el.dataset.angle);update();}));
for(const circuit of inverterCircuits)$('inv-circuit-'+circuit.id).addEventListener('click',()=>selectCircuit(circuit.id));
$('inv-reference').addEventListener('change',e=>{referenceMode=e.target.value;updateTopology();rebuild();updateProbe();});
$('inv-axis').addEventListener('click',()=>{timeAxis=!timeAxis;updateAxisButton();rebuild();updateProbe();});
$('inv-f').addEventListener('change',e=>{pause();selectedPreset='';p.f=Number(e.target.value);update();});
$('inv-l-mode').addEventListener('change',e=>{pause();if(inductanceMode==='custom')customInductance=p.l;inductanceMode=e.target.value;selectedPreset='';p.l=inductanceMode==='large'?inverterPreset(p.circuit).l:customInductance;update();});
$('preset-normal').addEventListener('click',()=>preset('normal'));$('preset-ideal').addEventListener('click',()=>preset('ideal'));$('preset-failure').addEventListener('click',()=>preset('failure'));$('inverter-reset').addEventListener('click',()=>preset('normal'));
$('cycle-one').addEventListener('click',()=>{if(scenario==='failure'){toast('失败示例需要 2 周期：前一周期正常，后一周期改变 α。');return;}setRange(360);});$('cycle-two').addEventListener('click',()=>setRange(720));
$('inverter-cursor').addEventListener('input',e=>{pause();cursor=Number(e.target.value);updateProbe();});
$('inverter-play').addEventListener('click',()=>{if(playing){pause();return;}playing=true;lastTime=null;const epoch=++playEpoch;$('inverter-play').textContent='Ⅱ 暂停';$('inverter-play').setAttribute('aria-label','暂停导通过程');$('inverter-play').setAttribute('aria-pressed','true');requestAnimationFrame(now=>animate(now,epoch));});
$('inverter-speed').addEventListener('change',event=>{speed=playbackRate(event.target.value);lastTime=null;updateProbe();});
$('inverter-step').addEventListener('click',()=>{pause();const times=result.events.flatMap(e=>[e.start,e.end,e.failed?e.deadline:null]).filter(t=>t!==null&&t<=range).sort((a,b)=>a-b);cursor=times.find(t=>t>cursor+.05)??times[0]??0;updateProbe();});
function point(e){const rect=canvas.getBoundingClientRect();cursor=Math.max(0,Math.min(range,(e.clientX-rect.left-layout.left)/(layout.width-layout.left-layout.right)*range));updateProbe();}
bindProbeGestures(canvas,{pause,point,isPlaying:()=>playing});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
$('inverter-export').addEventListener('click',()=>{
  const out=document.createElement('canvas'),width=layout.width+40,height=layout.height+155;out.width=width*2;out.height=height*2;const c=out.getContext('2d');c.scale(2,2);c.fillStyle='#fcfdf9';c.fillRect(0,0,width,height);c.fillStyle='#304c37';c.font='600 18px system-ui';c.fillText(inverterTopology(p.circuit).name+'有源逆变 · 换相波形',20,30);c.font='11px system-ui';c.fillStyle='#708366';c.fillText(`α=${p.alpha}°  β=${fmt(180-p.alpha,2)}°  L_B=${p.lb} mH  L=${p.l} mH`,20,54);c.fillText(`U₂=${p.u2} V  R=${p.r} Ω  E=${p.e} V  f=${p.f} Hz  δ=${p.pulseWidth}°`,20,74);const angleData=commutationMeasurements(focusedEvent);c.fillText(`所选换相 γ=${angleData?.gamma===null||!angleData?'未完成':fmt(angleData.gamma,2)+'°'}`,20,94);c.drawImage(baseCanvas,20,110,layout.width,layout.height);c.font='10px system-ui';c.fillText(scenario==='failure'?`360° 时 α: 140° → ${p.alpha}°；统计窗口 360°~720°。`:(p.circuit==='bridge'?'L_B 为交流回路总电感；':'L_B 为每相电感；')+'计入负载平波电感；γ 为教材中的换相重叠角。',20,height-20);
  out.toBlob(blob=>{if(!blob){toast('图片生成失败，请重试');return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${inverterTopology(p.circuit).name}_有源逆变_alpha${p.alpha}_LB${p.lb}.png`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);toast('波形图已生成');},'image/png');
});
new ResizeObserver(()=>{if(result){rebuild();updateProbe();}}).observe($('chart-viewport'));
$('inverter-speed').value=speed;
if(!transferred||imported){update();setRange(range);}
