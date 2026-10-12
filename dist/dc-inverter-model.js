// Textbook inverter models. Angles are electrical degrees; L and C use SI units.
export const TOPOLOGIES = [
  {id:'half',name:'单相半桥电压型',figure:'图 4-6',kind:'vsi',sub:'分压电容 · 180° 导电'},
  {id:'full',name:'单相全桥电压型',figure:'方波 / 移相',kind:'vsi',sub:'输出脉宽 θ · 连续可调'},
  {id:'phase',name:'单相全桥移相调压',figure:'图 4-7',kind:'vsi',sub:'脉宽 θ · 三电平输出'},
  {id:'threeV',name:'三相桥式电压型',figure:'图 4-9 / 4-10',kind:'vsi',sub:'180° 导电 · 浮置星点'},
  {id:'parallel',name:'单相并联谐振电流型',figure:'图 4-12 / 4-13',kind:'csi',sub:'R-L 支路并联 C · 负载换流'},
  {id:'threeI',name:'三相串联二极管式',figure:'图 4-14 / 4-15',kind:'csi',sub:'120° 导通 · 强迫换流结构'}
];
export const DEFAULTS = {
  half:{ud:200,r:20,l:50,f:50}, full:{ud:200,r:20,l:50,f:50,theta:180},
  phase:{ud:200,r:20,l:50,f:50,theta:120}, threeV:{ud:300,r:20,l:50,f:50},
  parallel:{id:4,r:8,l:10,c:12,f:1000,gamma:8,tq:20,pulse:8},
  threeI:{id:4,r:2,l:5,f:50,gamma:8,em:80,phi:30,pulse:8}
};
export const mod = x => ((x%360)+360)%360;
const rad = x => x*Math.PI/180;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const safe=(v,d,a,b)=>Number.isFinite(Number(v))?clamp(Number(v),a,b):d;
export function parameters(type,input={}){
  if(!DEFAULTS[type]) type='half'; const p={...DEFAULTS[type],...input,type};
  const d=DEFAULTS[type];
  p.r=safe(p.r,d.r,.1,1000);p.l=safe(p.l,d.l,type==='parallel'?1:0,2000);
  p.f=safe(p.f,d.f,type==='parallel'?100:1,type==='parallel'?2500:1000);
  p.ud=safe(p.ud,200,1,1000);p.id=safe(p.id,4,.1,100);
  p.theta=safe(p.theta,d.theta??120,0,180);p.c=safe(p.c,12,.1,200);
  p.gamma=safe(p.gamma,8,type==='threeI'?.5:0,type==='threeI'?30:60);
  p.tq=safe(p.tq,20,0,200);p.em=safe(p.em,80,0,1000);p.phi=safe(p.phi,30,-80,80);
  p.pulse=safe(p.pulse,8,.5,30);return p;
}
const square=x=>mod(x)<180?1:0;
export function voltageState(type,p,angle){
  const a=mod(angle);
  if(type==='half')return {g:[square(a),1-square(a)],u:p.ud*(square(a)-.5)};
  if(type==='full'||type==='phase'){
    const theta=p.theta;
    const left=square(a),right=square(a-theta);
    return {g:[left,1-left,right,1-right],u:p.ud*(left-right)};
  }
  const g=[square(a),square(a-120),square(a-240)];
  const pole=g.map(s=>p.ud*(s-.5)),neutral=pole.reduce((a,b)=>a+b)/3;
  const phase=pole.map(v=>v-neutral);
  return {g,pole,neutral,phase,line:[pole[0]-pole[1],pole[1]-pole[2],pole[2]-pole[0]],u:phase[0]};
}
// Exact exponential solution for each constant-voltage interval; choose periodic i(0).
function rlSolution(voltage,edges,p){
  const r=p.r,l=p.l/1000;
  if(l===0)return a=>voltage(mod(a))/r;
  let b=0,A=1;const segments=[];
  for(let k=0;k<edges.length-1;k++){
    const start=edges[k],end=edges[k+1],u=voltage((start+end)/2);
    const decay=Math.exp(-r*(end-start)/(360*p.f*l));
    b=decay*b+(1-decay)*u/r;A*=decay;segments.push({start,end,u,decay});
  }
  let current=b/(-Math.expm1(-r/(p.f*l)));
  for(const s of segments){s.i=current;current=s.decay*current+(1-s.decay)*s.u/r;}
  return angle=>{const a=mod(angle),s=segments.find(s=>a<s.end)??segments[0];return s.u/r+(s.i-s.u/r)*Math.exp(-r*(a-s.start)/(360*p.f*l));};
}
function conducting(g,current,upper,lower){
  if(Math.abs(current)<1e-9)return null;
  return g?(current>0?'V'+upper:'VD'+upper):(current<0?'V'+lower:'VD'+lower);
}
function vsi(type,p){
  const edges=type==='threeV'?[0,60,120,180,240,300,360]:[...new Set([0,180,360,...(type==='phase'||type==='full'?[p.theta,180+p.theta]:[])])].sort((a,b)=>a-b);
  const count=type==='threeV'?3:1;
  const sol=Array.from({length:count},(_,k)=>rlSolution(a=>{const s=voltageState(type,p,a);return s.phase?s.phase[k]:s.u;},edges,p));
  return angle=>{
    const s=voltageState(type,p,angle),i=sol.map(fn=>fn(angle));
    let active=[];let dc;
    if(type==='threeV'){
      active=s.g.map((g,k)=>conducting(g,i[k],[1,3,5][k],[4,6,2][k]));dc=s.g.reduce((sum,g,k)=>sum+g*i[k],0);
    }else if(type==='half'){active=[conducting(s.g[0],i[0],1,2)];dc=s.u*i[0]/p.ud;}
    else {active=[conducting(s.g[0],i[0],1,2),conducting(s.g[2],-i[0],3,4)];dc=(s.g[0]-s.g[2])*i[0];}
    const gates=type==='threeV'?[s.g[0],1-s.g[0],s.g[1],1-s.g[1],s.g[2],1-s.g[2]]:s.g;
    const gateNames=type==='threeV'?['1','4','3','6','5','2']:type==='half'?['1','2']:['1','2','3','4'];
    return {...s,i,io:i[0],dc,gates,gateNames,active:active.filter(Boolean),power:s.phase?s.phase.reduce((sum,v,k)=>sum+v*i[k],0):s.u*i[0]};
  };
}
export function parallelCurrent(angle,id,gamma){
  const a=mod(angle),half=a<180?1:-1,x=a%180;
  return gamma>0&&x<gamma?half*id*(2*x/gamma-1):half*id;
}
// Trapezoidal integration of C dv/dt = i_o-i_RL and L di_RL/dt = v-R i_RL.
// Solve the 2x2 periodic boundary condition rather than showing startup as steady state.
function parallel(p,N){
  const l=p.l/1000,c=p.c/1e6,h=1/(p.f*N),q=h/2;
  const K=[1,q/c,-q/l,1+q*p.r/l],D=[1,-q/c,q/l,1-q*p.r/l];
  const det=K[0]*K[3]-K[1]*K[2],inv=[K[3]/det,-K[1]/det,-K[2]/det,K[0]/det];
  const M=[inv[0]*D[0]+inv[1]*D[2],inv[0]*D[1]+inv[1]*D[3],inv[2]*D[0]+inv[3]*D[2],inv[2]*D[1]+inv[3]*D[3]];
  const B=[inv[0]*h/c,inv[2]*h/c],step=360/N;
  let z=[0,0],P=[1,0,0,1];
  const advance=(v,forcing)=>[M[0]*v[0]+M[1]*v[1]+B[0]*forcing,M[2]*v[0]+M[3]*v[1]+B[1]*forcing];
  for(let k=0;k<N;k++){
    z=advance(z,parallelCurrent((k+.5)*step,p.id,p.gamma));
    P=[M[0]*P[0]+M[1]*P[2],M[0]*P[1]+M[1]*P[3],M[2]*P[0]+M[3]*P[2],M[2]*P[1]+M[3]*P[3]];
  }
  const Q=[1-P[0],-P[1],-P[2],1-P[3]],delta=Q[0]*Q[3]-Q[1]*Q[2];
  let state=[(z[0]*Q[3]-Q[1]*z[1])/delta,(Q[0]*z[1]-z[0]*Q[2])/delta];
  const states=[state];for(let k=0;k<N;k++){state=advance(state,parallelCurrent((k+.5)*step,p.id,p.gamma));states.push(state);}
  const at=angle=>{const index=mod(angle)/step,k=Math.floor(index),x=index-k;return states[k].map((v,j)=>v+(states[k+1][j]-v)*x);};
  const sample=angle=>{
    const a=mod(angle),[u,il]=at(a),io=parallelCurrent(a,p.id,p.gamma),overlap=p.gamma>0&&a%180<p.gamma;
    const positive=a<180,ratio=(p.id+io)/(2*p.id),v14=overlap?0:positive?0:-u,v23=overlap?0:positive?u:0;
    const currents=[p.id*ratio,p.id*(1-ratio),p.id*(1-ratio),p.id*ratio];
    const active=currents.flatMap((i,k)=>i>1e-8?['VT'+(k+1)]:[]);
    return {u,io,il,ic:io-il,i:[io],dc:p.id,uab:overlap?0:(positive?u:-u),overlap,active,currents,v14,v23,
      gates:[a<p.pulse?1:0,a>=180&&a<180+p.pulse?1:0],gateNames:['1,4','2,3'],power:u*io};
  };
  const end=p.gamma;
  let beta=0;
  if(at(end)[0]<0){for(let a=end+step;a<=180+step;a+=step){if(at(a)[0]>=0){let lo=a-step,hi=a;for(let n=0;n<30;n++){const mid=(lo+hi)/2;if(at(mid)[0]<0)lo=mid;else hi=mid;}beta=(lo+hi)/2-end;break;}}}
  const tb=beta/(360*p.f)*1e6;
  return {sample,margin:{beta,gamma:p.gamma,phi:beta+p.gamma/2,ts:(beta+p.gamma)/(360*p.f)*1e6,ty:p.gamma/(360*p.f)*1e6,tb,safe:beta>0&&tb>p.tq},periodError:Math.max(...states[0].map((v,k)=>Math.abs(v-states[N][k])))};
}
const CSI_STAGES=[[1,-1,0],[1,0,-1],[0,1,-1],[-1,1,0],[-1,0,1],[0,-1,1]];
export function threeCurrent(angle,id,gamma=0,f=50){
  const a=mod(angle),k=Math.floor(a/60),x=a%60,now=CSI_STAGES[k],before=CSI_STAGES[(k+5)%6];
  const overlap=gamma>0&&x<gamma,t=overlap?x/gamma:1;
  return {i:now.map((v,j)=>id*(before[j]+(v-before[j])*t)),di:now.map((v,j)=>overlap?id*(v-before[j])*360*f/gamma:0),overlap};
}
function threeCSI(p){
  return angle=>{
    const s=threeCurrent(angle,p.id,p.gamma,p.f),a=mod(angle);
    const phase=s.i.map((i,k)=>p.r*i+p.l/1000*s.di[k]+p.em*Math.sin(rad(a+30-p.gamma/2-120*k+p.phi)));
    const active=[],currents=Array(6).fill(0);
    s.i.forEach((i,k)=>{const n=i>=0?[1,3,5][k]:[4,6,2][k];if(Math.abs(i)>1e-8){active.push('VT'+n,'VD'+n);currents[n-1]=Math.abs(i);}});
    const gates=Array.from({length:6},(_,k)=>mod(a-k*60)<p.pulse?1:0);
    const power=phase.reduce((sum,v,k)=>sum+v*s.i[k],0);
    return {...s,phase,line:[phase[0]-phase[1],phase[1]-phase[2],phase[2]-phase[0]],u:phase[0],io:s.i[0],dc:p.id,uab:power/p.id,active,currents,gates,gateNames:['1','2','3','4','5','6'],power};
  };
}
function fundamental(samples,key){
  let sine=0,cosine=0;for(let k=0;k<samples.length;k++){const v=key(samples[k]),a=rad((k+.5)*360/samples.length);sine+=v*Math.sin(a);cosine+=v*Math.cos(a);}
  return Math.SQRT2*Math.hypot(sine,cosine)/samples.length;
}
export function buildModel(type,input={},N=3600){
  if(!DEFAULTS[type])type='half';const p=parameters(type,input),isCSI=TOPOLOGIES.find(t=>t.id===type).kind==='csi';
  const core=type==='parallel'?parallel(p,N):{sample:type==='threeI'?threeCSI(p):vsi(type,p)};
  const sample=core.sample,samples=Array.from({length:N},(_,k)=>sample((k+.5)*360/N));
  const voltage=s=>type==='threeV'||type==='threeI'?s.line[0]:s.u;
  const rms=fn=>Math.sqrt(samples.reduce((sum,s)=>sum+fn(s)**2,0)/N);
  const metrics={urms:rms(voltage),irms:rms(s=>s.io),u1:fundamental(samples,voltage),i1:fundamental(samples,s=>s.io),power:samples.reduce((sum,s)=>sum+s.power,0)/N};
  // Exact voltage metrics preserve continuous pulse-width changes below the sample grid.
  if(type==='half'){metrics.urms=p.ud/2;metrics.u1=Math.SQRT2*p.ud/Math.PI;}
  if(type==='full'||type==='phase'){metrics.urms=p.ud*Math.sqrt(p.theta/180);metrics.u1=2*Math.SQRT2*p.ud/Math.PI*Math.sin(rad(p.theta/2));}
  return {type,p,sample,samples,metrics,margin:core.margin,periodError:core.periodError??0,isCSI};
}
