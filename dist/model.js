export const rad = d => d * Math.PI / 180;
export const mod = (x, n = 360) => ((x % n) + n) % n;
export const circuits = [
  {id:'half', name:'单相半波可控整流', short:'单相半波', sub:'1 个晶闸管 · 单脉波', pulses:1, phases:1, valves:['VT1'], loads:['r','rl','rle'], natural:0},
  {id:'bridge', name:'单相桥式全控整流', short:'单相全控桥', sub:'4 个晶闸管 · 双脉波', pulses:2, phases:1, valves:['VT1','VT2','VT3','VT4'], loads:['r','rl','rle'], natural:0},
  {id:'semi', name:'单相桥式半控整流', short:'单相半控桥', sub:'2 个晶闸管 + 2 个二极管', pulses:2, phases:1, valves:['VT1','VT2','D1','D2'], loads:['r','rl','rle'], natural:0},
  {id:'threeHalf', name:'三相半波可控整流', short:'三相半波', sub:'3 个晶闸管 · 三脉波', pulses:3, phases:3, valves:['VT1','VT2','VT3'], loads:['r','rl','rle'], natural:30},
  {id:'threeBridge', name:'三相桥式全控整流', short:'三相全控桥', sub:'6 个晶闸管 · 六脉波', pulses:6, phases:3, valves:['VT1','VT2','VT3','VT4','VT5','VT6'], loads:['r','rl','rle'], natural:30}
];
export const loadNames={r:'R · 电阻负载',rl:'RL · 阻感负载',rle:'RLE · 带反电动势负载'};
export const isFiniteLoad=p=>p.load==='rl'||p.load==='rle';
export const emf=p=>p.load==='rle'?Number(p.e??50):0;
export function hasPeriodicCommutation(p){const data=simulation(p);return p.circuit!=='half'&&data.metrics.continuous&&data.transitions.length>=circuits.find(c=>c.id===p.circuit).pulses;}
export function controlAngles(p){
  const supported=['bridge','threeHalf','threeBridge'].includes(p.circuit)&&p.load==='rle'&&emf(p)<0,beta=supported?180-p.alpha:null;
  if(!supported)return {beta,gamma:null,mu:null,reason:'此电路不采用有源逆变的 β、γ 定义。'};
  if(p.alpha<=90)return {beta,gamma:null,mu:0,reason:'β = 180° − α。当前处于整流控制范围。γ 按教材表示换相重叠角，本模型尚未加入交流侧电感 L_B。'};
  if(!isFiniteLoad(p))return {beta,gamma:null,mu:0,reason:'当前为电阻负载，未形成连续逆变电流。切换 RLE 并设置负 E 可观察 β、γ。'};
  if(!hasPeriodicCommutation(p))return {beta,gamma:null,mu:0,reason:'当前电流未形成连续逆变换相，暂不标注 γ。'};
  return {beta,gamma:0,margin:beta,mu:0,start:p.circuit==='bridge'?p.alpha+180:p.alpha+150,end:p.circuit==='bridge'?360:330,reason:'γ 为教材中的换相重叠角。本模型忽略交流侧电感 L_B，采用瞬时换相，因此 γ = 0。关断后可用的反向电压区间为 β − γ。'};
}
export function alphaLimit(id, load) {
  if(load==='rl'||load==='rle')return 180;
  if(load === 'l' && id !== 'semi') return 89;
  return id === 'threeHalf' ? 150 : id === 'threeBridge' ? 120 : 180;
}
export function average(p) {
  if(isFiniteLoad(p))return simulation(p).metrics.ud;
  const vm = Math.SQRT2 * p.u2, a = rad(p.alpha), c = Math.cos(a);
  switch(p.circuit) {
    case 'half': return vm / (2 * Math.PI) * (1 + c);
    case 'bridge': return p.load === 'r' ? vm / Math.PI * (1 + c) : 2 * vm / Math.PI * c;
    case 'semi': return vm / Math.PI * (1 + c);
    case 'threeHalf': return p.load === 'r' && p.alpha > 30 ? 3 * vm / (2 * Math.PI) * (1 + Math.cos(a + Math.PI / 6)) : 3 * Math.sqrt(3) * vm / (2 * Math.PI) * c;
    case 'threeBridge': return p.load === 'r' && p.alpha > 60 ? 3 * Math.sqrt(3) * vm / Math.PI * (1 + Math.cos(a + Math.PI / 3)) : 3 * Math.sqrt(3) * vm / Math.PI * c;
    default: throw new Error('Unknown circuit');
  }
}
export function sample(theta, p) {
  if(isFiniteLoad(p))return finiteSample(theta,p);
  const t = mod(theta), a = p.alpha, vm = Math.SQRT2 * p.u2;
  const phases = [vm*Math.sin(rad(t)), vm*Math.sin(rad(t-120)), vm*Math.sin(rad(t-240))];
  let ud=0, active=[], sign=0, top=-1, bottom=-1, freewheel=false, source='断流';
  if(p.circuit === 'half') {
    if(t >= a && t < 180) {ud=phases[0]; active=['VT1']; sign=1; source='u₂';}
  } else if(p.circuit === 'bridge') {
    const positive = mod(t-a) < 180;
    ud = positive ? phases[0] : -phases[0];
    if(p.load==='l' || ud > 1e-9) {active=positive?['VT1','VT2']:['VT3','VT4']; sign=positive?1:-1; source=positive?'u₂':'−u₂';}
    else ud=0;
  } else if(p.circuit === 'semi') {
    if(t>=a && t<180) {ud=phases[0]; active=['VT1','D2']; sign=1; source='u₂';}
    else if(t>=180+a) {ud=-phases[0]; active=['VT2','D1']; sign=-1; source='−u₂';}
    else if(p.load==='l') {freewheel=true; active=t<180?['VT2','D2']:['VT1','D1']; source='续流，u_d = 0';}
  } else if(p.circuit==='threeHalf') {
    top=Math.floor(mod(t-30-a)/120);
    ud=phases[top]; source=['uₐ','uᵦ','u꜀'][top];
    if(p.load==='l' || ud>1e-9) active=['VT'+(top+1)];
    else {ud=0; top=-1; source='断流';}
  } else if(p.circuit==='threeBridge') {
    const k=Math.floor(mod(t-30-a)/60);
    const pairs=[[0,1],[0,2],[1,2],[1,0],[2,0],[2,1]];
    [top,bottom]=pairs[k]; ud=phases[top]-phases[bottom];
    source='u'+['ₐ','ᵦ','꜀'][top]+['ₐ','ᵦ','꜀'][bottom];
    if(p.load==='l' || ud>1e-9) active=['VT'+[1,3,5][top],'VT'+[4,6,2][bottom]];
    else {ud=0; top=bottom=-1; source='断流';}
  }
  const id=p.load==='l'?average(p)/p.r:Math.max(0,ud/p.r);
  if(id<1e-9) active=[];
  const ivt1=active.includes('VT1')?id:0;
  const input=p.circuit.startsWith('three')?(top===0?id:0)-(bottom===0?id:0):id*sign;
  let ud1=null,ud2=null,uvt1=null;
  if(p.circuit==='half') uvt1=phases[0]-ud;
  else if(p.circuit==='threeHalf') {ud1=ud; ud2=0; uvt1=phases[0]-ud;}
  else if(p.circuit==='threeBridge' && active.length) {ud1=phases[top]; ud2=phases[bottom]; uvt1=phases[0]-ud1;}
  else if(p.circuit==='bridge' && active.length) {ud1=sign*phases[0]/2;ud2=-ud1;uvt1=phases[0]/2-ud1;}
  else if(p.circuit==='semi'&&active.length) {uvt1=active.includes('VT1')?0:phases[0];}
  return {theta:t, phases, ud, id, ivt1, input, active, source, freewheel,ud1,ud2,uvt1};
}
export function gates(p) {
  const a=p.alpha;
  if(p.circuit==='half') return [{label:'g₁', starts:[a]}];
  if(p.circuit==='bridge') return [{label:'g₁, g₂', starts:[a]},{label:'g₃, g₄', starts:[a+180]}];
  if(p.circuit==='semi') return [{label:'g₁', starts:[a]},{label:'g₂', starts:[a+180]}];
  if(p.circuit==='threeHalf') return [0,1,2].map(i=>({label:'g'+['₁','₂','₃'][i],starts:[mod(30+a+120*i)]}));
  return [0,1,2,3,4,5].map(i=>({label:'g'+['₁','₂','₃','₄','₅','₆'][i],starts:[mod(30+a+60*i),mod(90+a+60*i)]}));
}
export function metrics(p) {
  if(isFiniteLoad(p))return simulation(p).metrics;
  const ud=average(p); let sq=0,maxI=0,minI=Infinity;
  const count=3600;
  for(let i=0;i<count;i++) {const s=sample((i+.5)*360/count,p); sq+=s.ud*s.ud;maxI=Math.max(maxI,s.id);minI=Math.min(minI,s.id);}
  const continuous=p.load==='l'||['bridge','semi'].includes(p.circuit)&&p.alpha===0||p.circuit==='threeHalf'&&p.alpha<=30||p.circuit==='threeBridge'&&p.alpha<=60;
  return {ud,id:ud/p.r,rms:Math.sqrt(sq/count),ripple:circuits.find(c=>c.id===p.circuit).pulses*p.f,maxI,minI,continuous,conducting:ud>1e-8,settled:true,gap:!continuous};
}
export function formula(p) {
  if(isFiniteLoad(p))return p.load==='rle'?'u_d = R i_d + L di_d/dt + E；I_d = (U_d − E) / R':'u_d = R i_d + L di_d/dt；I_d = U_d / R';
  if(p.circuit==='half') return 'U_d = √2 U₂ / (2π) · (1 + cos α)';
  if(p.circuit==='bridge') return p.load==='r'?'U_d = √2 U₂ / π · (1 + cos α)':'U_d = 2√2 U₂ / π · cos α';
  if(p.circuit==='semi') return 'U_d = √2 U₂ / π · (1 + cos α)';
  if(p.circuit==='threeHalf') return p.load==='r'&&p.alpha>30?'U_d = 3√2 U₂ / (2π) · [1 + cos(α + 30°)]':'U_d = 3√6 U₂ / (2π) · cos α ≈ 1.17 U₂ cos α';
  return p.load==='r'&&p.alpha>60?'U_d = 3√6 U₂ / π · [1 + cos(α + 60°)]':'U_d = 3√6 U₂ / π · cos α ≈ 2.34 U₂ cos α';
}
export function explanation(p) {
  if(isFiniteLoad(p)){
    const m=metrics(p),e=emf(p);
    const first=p.load==='rle'?'负载由 R、L 和反电动势 E 串联组成。导通时 u_d = R i_d + L di_d/dt + E；电流降到零后器件关断，此时整个负载两端 u_d = E。':'负载由 R 和有限电感 L 串联组成。电流按 u_d = R i_d + L di_d/dt 变化，因此不会像电阻负载那样与电压同步；电流降到零时晶闸管才关断。';
    let second=!m.conducting?'当前参数下未导通。检查触发脉冲是否到来时电源电压足以克服反电动势 E；可增大脉冲宽度或调整触发角。':m.continuous?'当前电流连续，但仍保留由有限电感产生的纹波。增大 L 后电流会更平滑。'+(hasPeriodicCommutation(p)?'已形成周期性换相，可使用该电路的连续电流平均输出电压公式。':'同一导通路径可跨周期保持，平均值由当前稳态波形计算。'):'当前电流断续。熄灭时刻由 R、L、E 和触发角共同决定，平均值由当前稳态波形计算，不能直接套用连续电流的 cos α 公式。';
    if(p.circuit==='semi'&&m.conducting)second+=' 半控桥在过零后可通过同一桥臂续流，续流期间 u_d = 0。';
    if(p.circuit.startsWith('three'))second+=' VT1 的触发时刻是 30° + α。';
    if(p.load==='rle'&&e<0)second+=' E < 0 表示电源极性与图中的 E 参考正方向相反，沿正向电流方向提供电压。';
    if(p.load==='rle'&&Number(p.l??100)===0)second+=' L = 0 时为 RE 负载，导通电流等于 (u_d − E)/R。';
    return [first,second];
  }
  if(p.circuit==='half') return ['正半周延迟到 α 才触发 VT1。纯电阻电流随电压变化，在 180° 过零时熄灭；负半周没有输出。','试试 α = 0° 和 90°：触发越晚，输出脉冲面积越小，平均电压越低。'];
  if(p.circuit==='bridge'&&p.load==='r') return ['VT1、VT2 与 VT3、VT4 两组交替导通，把交流的两个半周变成同方向的输出。纯电阻负载的 i_d = u_d / R。','纯电阻负载在过零处断流，α 大于 90° 时平均输出仍为正，不能套用连续电流的 cos α 公式。'];
  if(p.circuit==='bridge') return ['大电感把负载电流近似维持为 I_d。每组晶闸管持续导通 180°，直到下一组触发换相。','电源过零后电流仍沿原方向流动，因此 u_d 会出现负值段。负电压段不等于整个周期处于有源逆变。'];
  if(p.circuit==='semi') return p.load==='l'?['晶闸管与二极管交替向负载供电，交流过零后通过同一桥臂续流，续流时 u_d = 0、i_d ≈ I_d。','观察 i_VT1：续流期间 VT1 仍可能导通，所以不能简单把 u_d = 0 看成所有器件都关断。']:['每个半周由一只晶闸管和一只二极管导通。纯电阻负载中，电压与电流波形和单相全控桥相同。','切换到阻感负载，观察续流路径和 VT1 电流的变化。'];
  if(p.circuit==='threeHalf') return ['α 从各相的自然换相点起算，VT1 的触发时刻为 30° + α。三相依次向负载供电，每周期产生三个脉波。',p.load==='l'?'连续电流时，每只晶闸管导通 120°。触发延迟到相电压过零之后换相时，输出会出现负值段。':'α ≤ 30° 时电流连续；α > 30° 后出现断流区，平均电压公式也随之变化。'];
  return ['共阴极组 VT1、VT3、VT5 和共阳极组 VT4、VT6、VT2 各有一只导通，u_d 等于两相电压之差。每 60° 换相一次。',p.load==='l'?'连续电流时每只晶闸管导通 120°，导通组合按 VT1/VT6 → VT1/VT2 → VT3/VT2 → VT3/VT4 → VT5/VT4 → VT5/VT6 循环。':'α ≤ 60° 时电流连续；α > 60° 后出现断流区。采用相隔 60° 的双窄脉冲，确保对应器件成对触发。'];
}

// Finite-load switching simulation. The previous L→∞ analytical model remains
// available internally as a reference for independent continuous-mode checks.
const STEPS=7200, STEP=360/STEPS;
const cache=new Map();
const topValves=[1,3,5],bottomValves=[4,6,2];
const EPS=1e-9;
function phasesAt(t,vm){return [vm*Math.sin(rad(t)),vm*Math.sin(rad(t-120)),vm*Math.sin(rad(t-240))];}
function gateMask(t,p){
  const width=Math.max(1,Math.min(60,Number(p.pulseWidth??10)));
  const on=start=>mod(t-start)<width;
  if(p.circuit==='half')return on(p.alpha)?1:0;
  if(p.circuit==='bridge')return (on(p.alpha)?3:0)|(on(p.alpha+180)?12:0);
  if(p.circuit==='semi')return (on(p.alpha)?1:0)|(on(p.alpha+180)?2:0);
  if(p.circuit==='threeHalf')return [0,1,2].reduce((mask,i)=>mask|(on(30+p.alpha+120*i)?1<<i:0),0);
  return [0,1,2,3,4,5].reduce((mask,i)=>mask|(on(30+p.alpha+60*i)||on(90+p.alpha+60*i)?1<<i:0),0);
}
function descriptor(code,c,ph){
  let active=[],ud=0,top=-1,bottom=-1,sign=0,freewheel=false,source='断流';
  if(!code)return {active,ud,top,bottom,sign,freewheel,source};
  if(c==='half'){active=['VT1'];ud=ph[0];sign=1;source='u₂';}
  else if(c==='bridge'){sign=code===1?1:-1;active=sign===1?['VT1','VT2']:['VT3','VT4'];ud=sign*ph[0];source=sign===1?'u₂':'−u₂';}
  else if(c==='semi'){
    active=[[],['VT1','D2'],['VT2','D1'],['VT1','D1'],['VT2','D2']][code];sign=code===1?1:code===2?-1:0;ud=sign*ph[0];freewheel=code>=3;source=freewheel?'续流，u_d = 0':sign===1?'u₂':'−u₂';
  }else if(c==='threeHalf'){top=code-1;active=['VT'+code];ud=ph[top];source=['uₐ','uᵦ','u꜀'][top];}
  else{top=Math.floor((code-1)/3);bottom=(code-1)%3;active=['VT'+topValves[top],'VT'+bottomValves[bottom]];ud=ph[top]-ph[bottom];freewheel=top===bottom;source='u'+['ₐ','ᵦ','꜀'][top]+['ₐ','ᵦ','꜀'][bottom];}
  return {active,ud,top,bottom,sign,freewheel,source};
}
function switchState(code,current,mask,c,ph,e){
  if(current<EPS)code=0;
  if(c==='half')return code||((mask&1)&&ph[0]>e+EPS?1:0);
  if(c==='bridge'){
    for(const candidate of [1,2])if(mask&(candidate===1?3:12)){
      const v=(candidate===1?1:-1)*ph[0],old=code?(code===1?1:-1)*ph[0]:e;
      if(v>old+EPS)code=candidate;
    }
    return code;
  }
  if(c==='semi'){
    const a=ph[0]/2,b=-a;
    let top=code?(code===1||code===3?0:1):-1;
    for(let i=0;i<2;i++)if(mask&(1<<i)){
      const v=i===0?a:b;
      if(top<0?v-Math.min(a,b)>e+EPS:v>(top===0?a:b)+EPS)top=i;
    }
    return top<0?0:top===0?(ph[0]>=0?1:3):(ph[0]<0?2:4);
  }
  if(c==='threeHalf'){
    let top=code-1;
    for(let i=0;i<3;i++)if(mask&(1<<i))if(ph[i]>(top<0?e:ph[top])+EPS)top=i;
    return top+1;
  }
  let top=code?Math.floor((code-1)/3):-1,bottom=code?(code-1)%3:-1;
  if(!code){
    for(let i=0;i<3;i++)if(mask&(1<<(topValves[i]-1)))if(top<0||ph[i]>ph[top])top=i;
    for(let i=0;i<3;i++)if(mask&(1<<(bottomValves[i]-1)))if(bottom<0||ph[i]<ph[bottom])bottom=i;
    return top>=0&&bottom>=0&&ph[top]-ph[bottom]>e+EPS?top*3+bottom+1:0;
  }
  for(let i=0;i<3;i++)if(mask&(1<<(topValves[i]-1)))if(ph[i]>ph[top]+EPS)top=i;
  for(let i=0;i<3;i++)if(mask&(1<<(bottomValves[i]-1)))if(ph[i]<ph[bottom]-EPS)bottom=i;
  return top*3+bottom+1;
}
function initialState(p){
  if(p.circuit==='half')return 0;
  if(p.circuit==='bridge')return mod(-p.alpha)<180?1:2;
  if(p.circuit==='semi')return p.alpha===0?1:4;
  if(p.circuit==='threeHalf')return Math.floor(mod(-30-p.alpha)/120)+1;
  const [top,bottom]=[[0,1],[0,2],[1,2],[1,0],[2,0],[2,1]][Math.floor(mod(-30-p.alpha)/60)];
  return top*3+bottom+1;
}
export function simulation(p){
  const l=Math.max(0,Number(p.l??100))/1000,e=emf(p),width=Number(p.pulseWidth??10);
  const key=[p.circuit,p.load,p.alpha,p.u2,p.r,p.f,l,e,width].join('|');
  if(cache.has(key))return cache.get(key);
  const vm=Math.SQRT2*p.u2,dt=1/p.f/STEPS,tau=l/p.r;
  const decay=l?Math.exp(-dt/tau):0,oneMinusDecay=l?-Math.expm1(-dt/tau):1;
  const phaseSamples=Array.from({length:STEPS},(_,k)=>phasesAt((k+.5)*STEP,vm));
  const masks=Uint8Array.from({length:STEPS},(_,k)=>gateMask((k+.5)*STEP,p));
  function run(initialCurrent,initialCode,record=false){
    let current=initialCurrent,code=initialCode,sumU=0,sumI=0,sumSq=0,sumPower=0,minI=Infinity,maxI=0,gap=0;
    const currents=record?new Float64Array(STEPS+1):null,codes=record?new Uint8Array(STEPS):null,cutFractions=record?new Float64Array(STEPS):null,output=record?new Float64Array(STEPS):null;
    if(record)currents[0]=current;
    for(let k=0;k<STEPS;k++){
      code=switchState(code,current,masks[k],p.circuit,phaseSamples[k],e);
      const voltage=code?descriptor(code,p.circuit,phaseSamples[k]).ud:e;
      let next=0,onTime=code?dt:0,meanI=0;
      if(code){
        const target=(voltage-e)/p.r;
        if(l){
          next=current*decay+target*oneMinusDecay;
          if(next<0){onTime=Math.min(dt,Math.max(0,-tau*Math.log(-target/(current-target))));next=0;}
          meanI=(target*onTime+(current-target)*tau*(-Math.expm1(-onTime/tau)))/dt;
        }else{next=Math.max(0,target);meanI=next;if(!next)onTime=0;}
      }
      meanI=Math.max(0,meanI);
      const fraction=onTime/dt;
      sumU+=fraction*voltage+(1-fraction)*e;sumSq+=fraction*voltage*voltage+(1-fraction)*e*e;sumI+=meanI;sumPower+=voltage*meanI;gap+=1-fraction;
      minI=Math.min(minI,current,next);maxI=Math.max(maxI,current,next);
      if(record){currents[k+1]=next;codes[k]=onTime>0?code:0;cutFractions[k]=fraction;output[k]=fraction*voltage+(1-fraction)*e;}
      current=next;if(current<EPS)code=0;
    }
    return {current,code,currents,codes,cutFractions,output,ud:sumU/STEPS,id:sumI/STEPS,power:sumPower/STEPS,rms:Math.sqrt(sumSq/STEPS),minI,maxI,gap:gap/STEPS};
  }
  const ideal=average({...p,load:'l'});
  let current=p.circuit==='half'?0:Math.max(0,(ideal-e)/p.r),code=current>EPS?initialState(p):0,settled=false;
  for(let cycle=0;cycle<16;cycle++){
    const result=run(current,code),difference=result.current-current;
    const denominator=l?-Math.expm1(-1/p.f/tau):1;
    const adjustment=result.gap<1e-10&&code===result.code?difference/denominator:difference;
    const balance=Math.abs(result.ud-p.r*result.id-e);
    if(Math.abs(adjustment)<1e-9*Math.max(1,result.maxI)&&balance<1e-8*Math.max(1,vm)&&code===result.code){settled=true;break;}
    current=result.gap<1e-10&&code===result.code?Math.max(0,current+adjustment):result.current;
    code=result.code;
  }
  const result=run(current,code,true);
  const conducting=result.maxI>1e-7;
  const candidates=[];
  for(let k=0;k<STEPS;k++){if(result.codes[k]!==result.codes[(k-1+STEPS)%STEPS])candidates.push(k*STEP);if(result.cutFractions[k]>0&&result.cutFractions[k]<1)candidates.push((k+result.cutFractions[k])*STEP);}
  const effectiveCode=t=>{const value=mod(t)/STEP,k=Math.min(STEPS-1,Math.floor(value));return value-k<result.cutFractions[k]?result.codes[k]:0;};
  const transitions=candidates.filter(t=>effectiveCode(t-.000001)!==effectiveCode(t+.000001));
  // A latched path can produce a full-cycle sine even in a nominal 3/6-pulse
  // converter. Determine repetition from the actual output, not its topology.
  const tolerance=1e-6*Math.max(1,vm,Math.abs(e));
  const constant=result.output.every(v=>Math.abs(v-result.output[0])<tolerance);
  const repetitions=[6,3,2,1].find(n=>result.output.every((v,k)=>Math.abs(v-result.output[(k+STEPS/n)%STEPS])<tolerance));
  const ripple=settled?(constant?0:repetitions*p.f):null;
  const data={currents:result.currents,codes:result.codes,cutFractions:result.cutFractions,transitions,metrics:{ud:result.ud,id:result.id,power:result.power,rms:result.rms,ripple,maxI:result.maxI,minI:result.minI,continuous:conducting&&result.gap<1e-8,gap:result.gap>1e-8,conducting,settled}};
  if(cache.size>16)cache.delete(cache.keys().next().value);cache.set(key,data);return data;
}
function finiteSample(theta,p){
  const data=simulation(p),t=mod(theta),index=Math.min(STEPS-1,Math.floor(t/STEP)),fraction=t/STEP-index;
  const ph=phasesAt(t,Math.SQRT2*p.u2),e=emf(p),cut=data.cutFractions[index];
  let d=descriptor(fraction<cut?data.codes[index]:0,p.circuit,ph),ud=d.active.length?d.ud:e;
  let id=d.active.length?Math.max(0,data.currents[index]*(1-fraction/(cut||1))+data.currents[index+1]*(fraction/(cut||1))):0;
  if(Number(p.l??100)===0){id=d.active.length?Math.max(0,(ud-e)/p.r):0;if(id<EPS){d=descriptor(0,p.circuit,ph);ud=e;}}
  const input=p.circuit.startsWith('three')?(d.top===0?id:0)-(d.bottom===0?id:0):id*d.sign;
  let ud1=null,ud2=null,uvt1=null;
  if(p.circuit==='half')uvt1=ph[0]-ud;
  else if(p.circuit==='threeHalf'){ud1=ud;ud2=0;uvt1=ph[0]-ud;}
  else if(p.circuit==='threeBridge'&&d.active.length){ud1=ph[d.top];ud2=ph[d.bottom];uvt1=ph[0]-ud1;}
  else if(p.circuit==='bridge'&&d.active.length){ud1=d.sign*ph[0]/2;ud2=-ud1;uvt1=ph[0]/2-ud1;}
  else if(p.circuit==='semi'&&d.active.length)uvt1=d.active.includes('VT1')?0:ph[0];
  return {theta:t,phases:ph,ud,id,ivt1:d.active.includes('VT1')?id:0,input,active:d.active,source:d.active.length?d.source:'E（负载反电动势）',freewheel:d.freewheel,ud1,ud2,uvt1};
}
