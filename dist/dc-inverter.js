import {playbackRate,advancePlayback,bindProbeGestures,syncSvgPlayback} from './playback.js';
import {TOPOLOGIES,DEFAULTS,parameters,buildModel,mod} from './dc-inverter-model.js';
import {circuitSVG} from './dc-inverter-circuit.js';
import {dcFormulaMarkup,inlineNotation,notationHTML} from './dc-inverter-formulas.js';

const $=id=>document.getElementById(id);
const blue='#88c7ff',cyan='#8ae6c5',orange='#f1b071',violet='#c0adf0';
const phases=['#f18d83','#88dbc0','#83baff'];
const initial=new URLSearchParams(window.location.search);
let type=DEFAULTS[initial.get('circuit')]?initial.get('circuit'):'half';
const saved=new Map(TOPOLOGIES.map(t=>[t.id,{...DEFAULTS[t.id]}]));
for(const key of Object.keys(DEFAULTS[type]))if(initial.has(key))saved.get(type)[key]=initial.get(key);
let p=parameters(type,saved.get(type)),model=buildModel(type,p),cycles=initial.get('cycles')==='2'?2:1;
let probe=initial.has('cursor')&&Number.isFinite(Number(initial.get('cursor')))?Math.min(cycles*360,Math.max(0,Number(initial.get('cursor')))):15,timeAxis=initial.get('timeAxis')==='1';
let circuitMarkup='',zoomCircuitMarkup='';
let speed=playbackRate(initial.get('speed')),playEpoch=0;
let playing=false,lastFrame=null,lastProbeUpdate=0,chartWidth=700,chartHeight=500,rows=[],geometry=[],plot={};
const canvas=$('dc-canvas'),ctx=canvas.getContext('2d'),base=document.createElement('canvas'),baseCtx=base.getContext('2d');
const fnum=(v,d=1)=>!Number.isFinite(v)?'—':Math.abs(v)>=1e6?(v/1e6).toFixed(2)+'M':Math.abs(v)>=1e4?(v/1000).toFixed(1)+'k':Math.abs(v)<.5e-5?'0':v.toFixed(d);
const maths=inlineNotation;
const angleText=value=>String(Number(value.toFixed(6)))+'°';
const adjustableBridge=()=>type==='phase'||type==='full';
const fieldDefs={ud:['直流母线电压 U_d','V',1,1000],id:['直流电流 I_d','A',.1,100],r:['负载电阻 R','Ω',.1,1000],l:['负载电感 L','mH',0,2000],f:['输出频率 f','Hz',1,1000],theta:['输出脉宽 θ','°',0,180],c:['并联电容 C','µF',.1,200],gamma:['换流重叠角 γ','°',0,60],tq:['晶闸管关断时间 t_q','µs',0,200],em:['相反电势峰值 E_m','V',0,1000],phi:['反电势超前角 φ_E','°',-80,80],pulse:['触发脉冲宽度 δ','°',.5,30]};
const meta=()=>TOPOLOGIES.find(t=>t.id===type);
let toastTimer;
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2800);}
function stateUrl(){const q=new URLSearchParams({circuit:type,cycles:String(cycles),cursor:probe.toFixed(1),timeAxis:timeAxis?'1':'0',flow:$('dc-show-flow').checked?'1':'0',speed:String(speed)});for(const key of Object.keys(DEFAULTS[type]))q.set(key,String(p[key]));return './dc-inverter.html?'+q;}
function writeUrl(){window.history.replaceState(null,'',stateUrl());}
function renderTabs(){
  $('dc-topologies').innerHTML=TOPOLOGIES.map(t=>`<button data-topology="${t.id}" aria-pressed="${t.id===type}" class="${t.id===type?'selected':''}"><span>${t.name}</span><small>${t.figure} · ${t.sub}</small></button>`).join('');
  $('dc-topologies').querySelectorAll('[data-topology]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.topology)));
  $('dc-circuit-select').innerHTML=TOPOLOGIES.map(t=>`<option value="${t.id}">${t.name} · ${t.figure}</option>`).join('');$('dc-circuit-select').value=type;
}
function renderFields(){
  $('dc-fields').innerHTML=Object.keys(DEFAULTS[type]).map(key=>{const [name,unit,min,max]=fieldDefs[key];return `<label class="dc-field"><span class="dc-field-name">${maths(name)}</span><span class="dc-field-input"><input id="dc-p-${key}" data-param="${key}" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" value="${p[key]}" aria-label="${name.replaceAll('_',' ')}" aria-describedby="dc-param-note" data-min="${min}" data-max="${max}"><b>${unit}</b>${key==='phi'?'<button type="button" class="dc-sign" data-sign="phi" aria-label="切换反电势超前角正负">±</button>':''}</span></label>`;}).join('');
  $('dc-fields').querySelectorAll('[data-param]').forEach(input=>{
    const commit=()=>{
      const key=input.dataset.param,raw=input.value.trim().replace(/[，,]/g,'.');
      if(raw===''||!Number.isFinite(Number(raw))){input.value=p[key];toast('请输入有效数值。');return;}
      const next=parameters(type,{...p,[key]:Number(raw)});input.value=next[key];
      if(next[key]===p[key])return;p=next;saved.set(type,{...p});recompute();writeUrl();
    };
    if(input.dataset.param==='theta'||input.dataset.param==='pulse')input.addEventListener('input',()=>{
      const key=input.dataset.param,raw=input.value.trim().replace(/[，,]/g,'.');
      if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw))return;
      const next=parameters(type,{...p,[key]:Number(raw)});
      if(next[key]!==Number(raw)||next[key]===p[key])return;
      p=next;saved.set(type,{...p});recompute();writeUrl();
    });
    input.addEventListener('change',commit);input.addEventListener('blur',commit);
    input.addEventListener('focus',()=>{$('dc-input-toolbar').hidden=window.innerWidth>900;positionToolbar();});
    input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();commit();input.blur();$('dc-input-toolbar').hidden=true;}});
  });
  $('dc-fields').querySelectorAll('[data-sign]').forEach(b=>b.addEventListener('click',()=>{p.phi=-p.phi;const input=$('dc-p-phi');if(input)input.value=p.phi;recompute();writeUrl();}));
  syncAngles();
}
function syncAngles(){
  $('dc-angle-control').hidden=!adjustableBridge();
  $('dc-theta-range').value=p.theta;$('dc-theta-value').textContent=angleText(p.theta);
  $('dc-pulse-control').hidden=!model.isCSI;
  $('dc-pulse-range').value=p.pulse;$('dc-pulse-value').textContent=angleText(p.pulse);
}
function changeAngle(key,value){
  p=parameters(type,{...p,[key]:Number(value)});saved.set(type,{...p});
  const input=$('dc-p-'+key);if(input)input.value=p[key];recompute();writeUrl();
}
function select(next){
  if(!DEFAULTS[next])return;saved.set(type,{...p});type=next;p=parameters(type,saved.get(type));
  stop();renderTabs();renderFields();recompute();writeUrl();
}
function recompute(){
  model=buildModel(type,p);$('dc-title').textContent=meta().name;$('dc-figure').textContent=meta().figure;
  syncAngles();
  if(type==='full')$('dc-figure').textContent=p.theta===180?'180° 导电':'图 4-7 · 移相调压';
  renderMetrics();renderExplanation();buildRows();drawChart();updateProbe();
}
function renderMetrics(){
  const m=model.metrics;$('dc-urms').textContent=fnum(m.urms);$('dc-irms').textContent=fnum(m.irms,2);
  $('dc-fund').textContent=fnum(model.isCSI?m.i1:m.u1,model.isCSI?2:1);$('dc-fund-unit').textContent=model.isCSI?'A':'V';
  $('dc-fund-label').textContent=model.isCSI?'基波输出电流有效值':'基波输出电压有效值';$('dc-power').textContent=fnum(m.power);
  $('dc-urms-label').textContent=type==='threeV'||type==='threeI'?'线电压 U_UV 有效值':'输出电压有效值';
}
function renderExplanation(){
  const sourceText='<p>输入 U_d 是直流母线电压，u_o 是负载端瞬时电压，不能把直流母线电压当成交流有效值。器件理想，无死区和压降，直流电容足够大。L=0 时为纯电阻；L&gt;0 时按 L di/dt + Ri = u 精确求周期稳态。</p><p>V 表示全控开关管，VD 为反并联二极管。高电平只表示门极要求导通；实际导通的是开关管还是二极管由电流方向决定。驱动行使用归一化高、低电平，不表示实际栅极电压值。</p>';
  const descriptions={
    half:{text:'上管与下管交替给负载施加正、负电压。换向瞬间电感电流保持连续，先由反并联二极管续流，电流过零后才转为开关管导通。',note:'两只分压电容各承受 U_d/2；直流中点 N′ 就是负载返回端。'},
    full:{text:'V1/V4 与 V2/V3 两个对角组合交替工作，每组驱动 180°。相同 U_d 下，全桥的输出电压幅值为半桥的两倍。',note:'电压翻转后，电流不立即翻转；两只二极管先向直流侧回馈电感能量。'},
    phase:{text:'每个桥臂仍用互补的 180° 驱动。右桥臂相对左桥臂延后 θ，正、负输出电压脉宽各为 θ；同侧两管获得高电平时，输出电压为零。θ=0° 时无交流输出，θ=180° 时成为全桥方波。',note:'在零电压区，RL 电流通过一个开关管和另一桥臂的二极管在桥内续流；纯 R 负载此时没有电流。'},
    threeV:{text:'每只开关管的驱动宽度为 180°，各相依次相差 120°。极点对直流中点的电压是 ±U_d/2；负载星点浮置后，相电压出现 ±U_d/3、±2U_d/3 四种电平，而线电压为 +U_d、0、−U_d。',note:'U、V、W 使用红、绿、蓝区分。平衡星形负载满足 i_U+i_V+i_W=0；直流侧电流由三个正母线桥臂电流相加得到。'}
  };
  $('dc-status').classList.remove('warning');$('dc-margin').hidden=type!=='parallel';
  if(!model.isCSI){
    const info=descriptions[type==='full'&&p.theta<180?'phase':type];$('dc-explanation').textContent=info.text;$('dc-energy').textContent=info.note;
    $('dc-assumptions').innerHTML=sourceText+(type==='threeV'?'<p>三相 R、L 相等，N 为负载星点，N′ 为直流理想中点，两者不相连。图中交叉而无连接点的导线不相连。</p>':'');
    $('dc-param-note').textContent='L=0：纯电阻；L>0：阻感。频率调节的是逆变器输出频率。';
    $('dc-status').textContent=p.l===0?'纯电阻负载：电流与输出电压同形。':'周期稳态 RL 电流：按实际电流方向识别 V / VD 导通。';
    $('dc-model-badge').textContent='理想器件 · 周期稳态';
  }else if(type==='parallel'){
    const m=model.margin;
    $('dc-explanation').textContent='直流侧 L_d 很大，使 I_d 近似恒定。VT1/VT4 和 VT2/VT3 交替工作，向并联负载注入正、负电流。C 与 R-L 支路决定输出电压；负载呈容性时电流超前电压，给退出导通的晶闸管留出反向偏置时间。';
    $('dc-energy').textContent='改变 f、R、L 或 C 可以观察电压与电流的相位变化。改变 γ 则改变器件电流交接的持续时间，检查换流结束后是否仍有足够反压。';
    $('dc-assumptions').innerHTML='<p>本模块按图 4-12 的 C ∥ (R+L) 负载求周期解。γ 是指定的换流过渡角，换流区 i_o 由 −I_d 到 +I_d（或反向）线性变化；未动态求解换流电感 L_T 或晶闸管恢复过程。</p><p>β 是退出器件电流降为零后至其反压结束的角度，按输出电压实际过零点测量；它不是有源逆变页的 180°−α。t_γ、t_β、t_s 对应图 4-13 的换流、反压和触发引前时间。</p><p>器件阻断电压与 u_AB 是理想分段参考。反压时间不足时仍显示指定驱动的参考波形，并明确标为换流条件不足；该参考不代表晶闸管已成功关断后的真实失败波形。</p>';
    $('dc-margin').innerHTML=`<div><span>换流时间 t_γ</span><b>${fnum(m.ty)} µs</b></div><div><span>反压角 β</span><b>${fnum(m.beta)}°</b></div><div><span>反压时间 t_β</span><b>${fnum(m.tb)} µs</b></div><div><span>触发引前 t_s</span><b>${fnum(m.ts)} µs</b></div><div><span>电流超前角 φ</span><b>${fnum(m.phi)}°</b></div><div class="${m.safe?'':'margin-bad'}"><span>t_β 与 t_q 比较</span><b>${m.safe?'满足关断时间':'反压时间不足'}</b></div>`;
    $('dc-status').textContent=m.safe?'参考换流条件满足：t_β > t_q。':'反压时间不足：当前曲线仅为指定驱动参考，实际晶闸管可能换流失败。';
    $('dc-status').classList.toggle('warning',!m.safe);$('dc-model-badge').textContent=m.safe?'负载换流 · 近似参考':'换流条件不足 · 参考';
    $('dc-param-note').textContent='L 用 mH，C 用 µF。仅在整体负载呈容性、且反压时间充足时才能按此过程可靠换流。';
  }else{
    $('dc-explanation').textContent='上桥臂 VT1、VT3、VT5 和下桥臂 VT4、VT6、VT2 轮流配对；触发顺序为 VT1→VT2→VT3→VT4→VT5→VT6，每隔 60° 触发一次。各桥臂串联二极管，桥臂间的 C1～C6 为强迫换流电容。';
    $('dc-energy').textContent='直流电流决定各相电流脉冲幅值。电动机反电势、R 与 L 决定线电压；有限 γ 下，换流的 di/dt 使线电压出现脉冲。将 E_m 设为 0 可比较无反电势的 R-L 等效负载。';
    $('dc-assumptions').innerHTML='<p>本模块是 120° 电流序列与三相对称电动机负载的教学近似。每相用 R、L 和正弦反电势等效，E_m 是相反电势峰值；φ_E 是反电势相对相电流基波的超前角。相电流基波由理想 120° 序列确定。</p><p>换流区按 γ 进行线性电流交接，保持 i_U+i_V+i_W=0。为避免把有限 L 的电流跃变画成有限电压，γ 最小为 0.5°。图 4-14 的近正弦线电压取决于电动机参数，并非对所有 R-L 负载都成立。</p><p>主电路保留图 4-15 的串联二极管与换流电容位置；未求解 C1～C6 的充放电和晶闸管恢复，不能把此近似当作完整 ASCI 换流动态模型。交叉而无连接点的导线不相连。</p>';
    $('dc-param-note').textContent='I_d 近似恒定。γ：0.5°～30°；反电势超前角可用 ± 按钮切换正负。';$('dc-status').textContent='120° 电流序列 · 有限 γ 线性交接 · 电动机反电势等效负载。';$('dc-model-badge').textContent='强迫换流结构 · 教学近似';
  }
  $('dc-formulas').innerHTML=dcFormulaMarkup(type,p);
  for(const id of ['dc-explanation','dc-energy','dc-param-note','dc-status','dc-urms-label'])$(id).innerHTML=inlineNotation($(id).textContent);
  for(const id of ['dc-assumptions','dc-margin'])$(id).innerHTML=notationHTML($(id).innerHTML);
  $('dc-phase-legend').innerHTML=(type==='threeV'||type==='threeI')?['U 相','V 相','W 相'].map((s,k)=>`<span style="color:${['#c84a44','#188768','#3979d2'][k]}"><i></i>${s}</span>`).join(''):'<span style="color:#4d8cbf"><i></i>电压</span><span style="color:#3c9a77"><i></i>电流</span><span style="color:#aa7d4f"><i></i>另一组器件</span>';
  $('dc-device-key').textContent=model.isCSI?'VT：晶闸管 · VD：二极管':'V：开关管 · VD：反并联二极管';
}
const series=(get,color,dashed=false)=>({get,color,dashed});
function buildRows(){
  rows=[];
  const add=(label,unit,lines,step=false)=>rows.push({label,unit,lines,step,gate:false});
  if($('dc-show-gates').checked){
    const first=model.sample(90);first.gateNames.forEach((name,k)=>rows.push({label:'u_G'+name,unit:'驱动',gate:true,step:true,lines:[series(s=>model.isCSI?s.gates[k]:2*s.gates[k]-1,(type==='threeV')?phases[Math.floor(k/2)]:type==='threeI'?phases[k%3]:k%2?orange:cyan)]}));
  }
  if(type==='threeV'){
    ['UN′','VN′','WN′'].forEach((name,k)=>add('u_'+name,'V',[series(s=>s.pole[k],phases[k])],true));
    add('u_UV','V',[series(s=>s.line[0],blue)],true);add('u_NN′','V',[series(s=>s.neutral,orange)],true);
    add('u_UN','V',[series(s=>s.phase[0],blue)],true);add('i_U,V,W','A',phases.map((c,k)=>series(s=>s.i[k],c)));
    add('i_d','A',[series(s=>s.dc,cyan)]);
  }else if(type==='parallel'){
    add('i_VT1,4','A',[series(s=>s.currents[0],cyan),series(s=>s.currents[1],orange)]);
    add('i_o','A',[series(s=>s.io,cyan)]);add('u_o','V',[series(s=>s.u,blue)]);
    add('i_RL,C','A',[series(s=>s.il,cyan),series(s=>s.ic,orange,true)]);
    add('u_VT2,3','V',[series(s=>s.v23,violet)]);add('u_VT1,4','V',[series(s=>s.v14,orange)]);add('u_AB','V',[series(s=>s.uab,blue)]);
  }else if(type==='threeI'){
    ['U','V','W'].forEach((name,k)=>add('i_'+name,'A',[series(s=>s.i[k],phases[k])]));
    add('u_UV','V',[series(s=>s.line[0],blue)]);add('u_UN','V',[series(s=>s.phase[0],violet)]);add('i_d','A',[series(s=>s.dc,cyan)]);
  }else{add('u_o','V',[series(s=>s.u,blue)],true);add('i_o','A',[series(s=>s.io,cyan)]);add('i_d','A',[series(s=>s.dc,violet)]);}
  if($('dc-show-devices').checked){
    if(model.isCSI&&type==='threeI')add('i_VT1,VD1','A',[series(s=>s.currents[0],cyan)]);
    else if(!model.isCSI){const magnitude=s=>Math.abs(s.i[0]);add('i_V1,VD1','A',[series(s=>s.active.includes('V1')?magnitude(s):0,cyan),series(s=>s.active.includes('VD1')?magnitude(s):0,orange)]);}
  }
  $('dc-chart-caption').textContent=type==='parallel'?'器件电流行：青色 VT1/VT4，橙色 VT2/VT3；R-L/C 电流行：青色 i_RL，橙色虚线 i_C。浅色区为 γ，首个电压过零前的绿色区为 β。':type==='threeV'?'U / V / W = 红 / 绿 / 蓝。N 为负载星点，N′ 为直流中点；各行共用横轴、独立缩放。':type==='threeI'?'浅色区：有限 γ 换流。驱动为触发脉冲；三相电流保持和为零。线电压由负载等效模型求得。':'青色 i_o，紫色 i_d；器件行（若开启）：青色 V1，橙色 VD1。所有波形共用横轴、独立缩放。';
}
function mathLabel(context,x,y,name){
  const parts=name.split('_'),size=chartWidth<460?14:16;context.fillStyle='#d6e9dc';context.font=`italic ${size}px Georgia,serif`;context.textAlign='left';
  context.fillText(parts[0],x,y);if(parts[1]){const width=context.measureText(parts[0]).width;context.font=`${size-4}px Arial,sans-serif`;context.fillText(parts[1],x+width+1,y+4);}
}
function drawChart(){
  chartWidth=Math.max(280,canvas.parentElement.clientWidth||700);
  const compact=chartWidth<500,top=32,bottom=35,rowGap=compact?4:7;
  geometry=[];let y=top;
  for(const row of rows){const h=row.gate?(compact?39:42):(compact?71:80);geometry.push({top:y,height:h,center:y+h/2,row});y+=h+rowGap;}
  chartHeight=y+bottom;plot={left:compact?83:104,right:chartWidth-18,top,bottom:y};
  const ratio=Math.min(window.devicePixelRatio||1,2);canvas.width=base.width=Math.round(chartWidth*ratio);canvas.height=base.height=Math.round(chartHeight*ratio);canvas.style.height=chartHeight+'px';
  baseCtx.setTransform(ratio,0,0,ratio,0,0);ctx.setTransform(ratio,0,0,ratio,0,0);
  baseCtx.fillStyle='#132924';baseCtx.fillRect(0,0,chartWidth,chartHeight);
  const xAt=a=>plot.left+a/(cycles*360)*(plot.right-plot.left);
  if(model.isCSI&&p.gamma>0){
    baseCtx.fillStyle='#d2b57412';const interval=type==='parallel'?180:60;
    for(let a=0;a<cycles*360;a+=interval)baseCtx.fillRect(xAt(a),top,xAt(a+p.gamma)-xAt(a),y-top);
    if(type==='parallel'&&model.margin.beta>0){baseCtx.fillStyle='#83d8a414';for(let a=0;a<cycles*360;a+=180)baseCtx.fillRect(xAt(a+p.gamma),top,xAt(a+p.gamma+model.margin.beta)-xAt(a+p.gamma),y-top);}
  }
  baseCtx.strokeStyle='#cedace17';baseCtx.lineWidth=1;baseCtx.setLineDash([3,5]);
  const tick=cycles===2?90:60;
  for(let a=0;a<=cycles*360;a+=tick){const x=xAt(a);baseCtx.beginPath();baseCtx.moveTo(x,top);baseCtx.lineTo(x,y);baseCtx.stroke();baseCtx.fillStyle='#96b0a2';baseCtx.font=compact?'9px Arial':'10px Arial';baseCtx.textAlign=a===0?'left':a===cycles*360?'right':'center';baseCtx.fillText(timeAxis?fnum(a/(360*p.f)*1000,1):String(a)+'°',x,y+18);}
  baseCtx.setLineDash([]);baseCtx.textAlign='left';baseCtx.fillStyle='#98b9a5';baseCtx.font='10px Arial';baseCtx.fillText(timeAxis?'t / ms':'ωt / °',plot.right-42,18);
  if(type==='parallel'){baseCtx.fillStyle='#a5c8b1';baseCtx.fillText('γ：换流区   β：反压区',plot.left,18);}
  const count=Math.max(720,Math.round((plot.right-plot.left)*2));
  const pointSamples=Array.from({length:count+1},(_,k)=>model.sample(k/count*cycles*360));
  for(const g of geometry){
    const row=g.row;let max=row.gate?1.35:0;
    if(!row.gate)for(const line of row.lines)for(const s of pointSamples){const v=line.get(s);if(Number.isFinite(v))max=Math.max(max,Math.abs(v));}
    max=max<1e-8?1:max*1.14;const usable=(g.height-12)/2,yAt=v=>g.center-v/max*usable;
    g.scale=max;g.yAt=yAt;
    baseCtx.strokeStyle='#b5c9ba35';baseCtx.lineWidth=.8;baseCtx.beginPath();baseCtx.moveTo(plot.left,g.center);baseCtx.lineTo(plot.right,g.center);baseCtx.stroke();
    baseCtx.strokeStyle='#8da396';baseCtx.beginPath();baseCtx.moveTo(plot.left,g.top+6);baseCtx.lineTo(plot.left,g.top+g.height-4);baseCtx.stroke();
    mathLabel(baseCtx,10,g.center+2,row.label);baseCtx.fillStyle='#81a08e';baseCtx.font='9px Arial';baseCtx.textAlign='left';baseCtx.fillText(row.unit,11,g.center+19);
    baseCtx.textAlign='right';baseCtx.fillStyle='#85a68f';baseCtx.fillText(row.gate?'高':fnum(max/1.14,Math.abs(max)<2?2:0),plot.left-6,g.top+13);
    baseCtx.fillText(row.gate?'低':fnum(-max/1.14,Math.abs(max)<2?2:0),plot.left-6,g.top+g.height-4);
    for(const line of row.lines){
      baseCtx.strokeStyle=line.color;baseCtx.lineWidth=row.gate?1.4:1.8;baseCtx.setLineDash(line.dashed?[4,3]:[]);baseCtx.beginPath();let lastY;
      for(let k=0;k<=count;k++){const v=line.get(pointSamples[k]),x=plot.left+k/count*(plot.right-plot.left),yy=yAt(v);if(!Number.isFinite(v)){lastY=undefined;continue;}if(lastY===undefined)baseCtx.moveTo(x,yy);else{if(row.step)baseCtx.lineTo(x,lastY);baseCtx.lineTo(x,yy);}lastY=yy;}baseCtx.stroke();
    }
    baseCtx.setLineDash([]);
  }
  drawProbe();
}
function drawProbe(){
  ctx.clearRect(0,0,chartWidth,chartHeight);ctx.drawImage(base,0,0,chartWidth,chartHeight);
  const x=plot.left+probe/(cycles*360)*(plot.right-plot.left);ctx.strokeStyle='#e5c77a';ctx.lineWidth=1;ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(x,plot.top);ctx.lineTo(x,plot.bottom);ctx.stroke();ctx.setLineDash([]);
}
function updateProbe(){
  const s=model.sample(probe);$('dc-cursor').value=probe;$('dc-cursor').max=cycles*360;
  const stamp=probe.toFixed(1)+'°'+(timeAxis?' · '+fnum(probe/(360*p.f)*1000,2)+' ms':'');$('dc-cursor-value').textContent=timeAxis?fnum(probe/(360*p.f)*1000,2)+' ms':probe.toFixed(1)+'°';$('dc-probe-angle').textContent=stamp;
  $('dc-active').textContent=s.active.length?s.active.join(' + ')+' 导通':'负载电流为零';
  $('dc-probe-note').textContent=type==='parallel'?(s.overlap?'换流区：前后两组晶闸管分担直流电流。':'稳定导通区：查看退出组的反向电压。'):type==='threeI'?(s.overlap?'换流区：电流在相邻桥臂之间交接。':'稳定导通区：一只上桥臂与一只下桥臂承载 I_d。'):Math.abs(s.io)<1e-8&&type!=='threeV'?'此时没有负载电流。':Math.abs(s.u)<1e-8&&adjustableBridge()?'零电压区：电流在桥内续流，i_d=0。':s.power<0?'瞬时能量回馈：负载电感通过二极管向直流侧送能。':'直流侧向负载供能；实际器件由电流方向决定。';
  const values=type==='threeV'||type==='threeI'?[['u_UV',s.line[0],'V'],['i_U',s.i[0],'A'],['i_V',s.i[1],'A'],['i_W',s.i[2],'A']]:[['u_o',s.u,'V'],['i_o',s.io,'A'],['i_d',s.dc,'A'],['p_o',s.power,'W']];
  $('dc-probe-values').innerHTML=values.map(([name,v,unit])=>`<span class="dc-probe-value"><span class="dc-probe-name">${maths(name)}</span><b>${fnum(v,unit==='A'?2:1)} ${unit}</b></span>`).join('');
  const svg=circuitSVG(type,s,p,$('dc-show-flow').checked,speed);
  // Keep the existing SVG while directions and conducting devices are unchanged,
  // so playback does not restart the arrow animations on every probe update.
  if(svg!==circuitMarkup){$('dc-diagram').innerHTML=svg;circuitMarkup=svg;}
  if($('dc-zoom-dialog').open&&svg!==zoomCircuitMarkup){$('dc-zoom-diagram').innerHTML=svg;zoomCircuitMarkup=svg;}
  syncSvgPlayback($('dc-diagram'),playing);if($('dc-zoom-dialog').open)syncSvgPlayback($('dc-zoom-diagram'),playing);
  const current=s.i.some(i=>Math.abs(i)>1e-8)||Math.abs(s.il??0)>1e-8||Math.abs(s.ic??0)>1e-8;
  $('dc-motion-state').textContent=!current?'零电流 · 当前没有流动路径':s.overlap?'换流交接 · 观察前后器件分担电流':Math.abs(s.u)<1e-8&&adjustableBridge()?'桥内续流 · 输出电压为零，电流仍在流动':s.power<0?'能量回馈 · 负载向直流侧送能':'导通供能 · 当前路径与波形同步';
  drawProbe();
}
function stop(){playing=false;playEpoch++;$('dc-play').textContent='▶ 播放';$('dc-play').setAttribute('aria-pressed','false');lastFrame=null;syncSvgPlayback($('dc-diagram'),false);syncSvgPlayback($('dc-zoom-diagram'),false);}
function frame(now,epoch){if(!playing||epoch!==playEpoch)return;if(lastFrame!==null)probe=advancePlayback(probe,now-lastFrame,speed,4000,cycles*360);lastFrame=now;if(now-lastProbeUpdate>70){updateProbe();lastProbeUpdate=now;}else drawProbe();requestAnimationFrame(next=>frame(next,epoch));}
$('dc-circuit-select').addEventListener('change',e=>select(e.target.value));
$('dc-reset').addEventListener('click',()=>{p=parameters(type,DEFAULTS[type]);saved.set(type,{...p});renderFields();recompute();writeUrl();});
$('dc-theta-range').addEventListener('input',e=>changeAngle('theta',e.target.value));
$('dc-pulse-range').addEventListener('input',e=>changeAngle('pulse',e.target.value));
$('dc-theta-range').addEventListener('change',writeUrl);
document.querySelectorAll('[data-theta]').forEach(b=>b.addEventListener('click',()=>changeAngle('theta',b.dataset.theta)));
$('dc-show-flow').addEventListener('change',()=>{updateProbe();writeUrl();});
$('dc-show-gates').addEventListener('change',()=>{buildRows();drawChart();});$('dc-show-devices').addEventListener('change',()=>{buildRows();drawChart();});
function setCycles(value){cycles=value;probe=Math.min(probe,cycles*360);$('dc-cycle-one').classList.toggle('selected',value===1);$('dc-cycle-two').classList.toggle('selected',value===2);$('dc-cycle-one').setAttribute('aria-pressed',value===1);$('dc-cycle-two').setAttribute('aria-pressed',value===2);drawChart();updateProbe();writeUrl();}
$('dc-cycle-one').addEventListener('click',()=>setCycles(1));$('dc-cycle-two').addEventListener('click',()=>setCycles(2));
$('dc-axis').addEventListener('click',()=>{timeAxis=!timeAxis;$('dc-axis').textContent=timeAxis?'横轴 t / ms ⇄':'横轴 ωt / ° ⇄';drawChart();updateProbe();writeUrl();});
$('dc-cursor').addEventListener('input',e=>{stop();probe=Number(e.target.value);updateProbe();});$('dc-cursor').addEventListener('change',writeUrl);
bindProbeGestures(canvas,{pause:stop,isPlaying:()=>playing,point:event=>{const r=canvas.getBoundingClientRect(),x=(event.clientX-r.left)*chartWidth/r.width;probe=Math.min(cycles*360,Math.max(0,(x-plot.left)/(plot.right-plot.left)*cycles*360));updateProbe();writeUrl();}});
$('dc-play').addEventListener('click',()=>{if(playing)stop();else{playing=true;lastFrame=null;const epoch=++playEpoch;$('dc-play').textContent='Ⅱ 暂停';$('dc-play').setAttribute('aria-pressed','true');syncSvgPlayback($('dc-diagram'),true);syncSvgPlayback($('dc-zoom-diagram'),true);requestAnimationFrame(now=>frame(now,epoch));}});
$('dc-speed').addEventListener('change',event=>{speed=playbackRate(event.target.value);lastFrame=null;updateProbe();writeUrl();});
$('dc-step').addEventListener('click',()=>{stop();const local=mod(probe),events=adjustableBridge()?[0,p.theta,180,180+p.theta,360]:type==='threeV'||type==='threeI'?[0,60,120,180,240,300,360]:[0,180,360];const next=events.find(a=>a>local+.05)??360;probe=(Math.floor(probe/360)*360+next+.1)%(cycles*360);updateProbe();writeUrl();});
$('dc-zoom').addEventListener('click',()=>{zoomCircuitMarkup=circuitSVG(type,model.sample(probe),p,$('dc-show-flow').checked,speed);$('dc-zoom-diagram').innerHTML=zoomCircuitMarkup;$('dc-zoom-dialog').showModal();syncSvgPlayback($('dc-zoom-diagram'),playing);});$('dc-close-zoom').addEventListener('click',()=>$('dc-zoom-dialog').close());
function positionToolbar(){const v=window.visualViewport;$('dc-input-toolbar').style.bottom=Math.max(12,v?window.innerHeight-v.height-v.offsetTop+12:12)+'px';}
$('dc-input-toolbar').addEventListener('pointerdown',event=>event.preventDefault());
$('dc-input-done').addEventListener('click',()=>{document.activeElement?.blur();$('dc-input-toolbar').hidden=true;});
window.visualViewport?.addEventListener('resize',positionToolbar);window.visualViewport?.addEventListener('scroll',positionToolbar);
document.addEventListener('focusout',()=>{setTimeout(()=>{if(!document.activeElement?.matches('[data-param]'))$('dc-input-toolbar').hidden=true;},120);});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
$('dc-share').addEventListener('click',async()=>{writeUrl();try{const url=new URL(stateUrl(),window.location.href);await navigator.clipboard.writeText(url.href);toast('参数链接已复制，访问权限与当前网站相同。');}catch{toast('无法自动复制，可复制地址栏中的参数链接。');}});
$('dc-export').addEventListener('click',()=>{
  const out=document.createElement('canvas'),ratio=Math.min(window.devicePixelRatio||1,2);out.width=canvas.width;out.height=canvas.height+Math.round(60*ratio);const c=out.getContext('2d');c.scale(ratio,ratio);c.fillStyle='#132924';c.fillRect(0,0,chartWidth,chartHeight+60);c.fillStyle='#d6ebdf';c.font='bold 15px Arial';c.fillText(meta().name+' · '+meta().figure,18,25);c.font='10px Arial';c.fillStyle='#9abfa8';c.fillText(Object.keys(DEFAULTS[type]).map(key=>key+'='+p[key]+fieldDefs[key][1]).join('  '),18,44);c.drawImage(canvas,0,60,chartWidth,chartHeight);
  out.toBlob(async blob=>{if(!blob){toast('图片生成失败，请重试。');return;}const file=new File([blob],'逆变波形-'+type+'.png',{type:'image/png'});try{if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:meta().name});return;}}catch(error){if(error.name==='AbortError')return;}
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('波形图已生成，可在下载或系统分享中保存。');
  },'image/png');
});
new ResizeObserver(()=>{drawChart();}).observe(canvas.parentElement);
window.addEventListener('pagehide',stop);
$('dc-show-flow').checked=initial.get('flow')!=='0';$('dc-speed').value=speed;
renderTabs();renderFields();recompute();setCycles(cycles);
if(timeAxis)$('dc-axis').textContent='横轴 t / ms ⇄';
