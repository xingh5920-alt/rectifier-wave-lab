// Line-commutated inverter. Textbook convention: gamma is overlap.
import {simulateBridgeInverter} from './bridge-inverter-model.js';
import {inverterPreset} from './inverter-topologies.js';
export {phaseColors} from './inverter-topologies.js';
export const inverterDefaults={alpha:140,u2:100,f:50,lb:4,l:50000,r:2,e:-125,pulseWidth:10};
const RAD=Math.PI/180, STEP=.1, EPS=1e-8;
export const mod=(v,m=360)=>((v%m)+m)%m;
export function phaseVoltages(angle,p){return [0,120,240].map(shift=>Math.SQRT2*p.u2*Math.sin((angle-shift)*RAD));}
export function gateMask(angle,p,alpha=p.alpha){return [0,1,2].reduce((mask,j)=>mask|(mod(angle-30-alpha-120*j)<p.pulseWidth-1e-7?1<<j:0),0);}
const indices=mask=>[0,1,2].filter(j=>mask&(1<<j));
const total=currents=>currents[0]+currents[1]+currents[2];

function voltage(angle,state,p){
  const active=indices(state.mask),u=phaseVoltages(angle,p),id=total(state.i),n=active.length;
  if(!n)return {ud:p.e,derivative:0,u,id};
  const lb=p.lb/1000,l=p.l/1000;
  const derivative=(active.reduce((s,j)=>s+u[j],0)-n*(p.e+p.r*id))/(lb+n*l);
  return {ud:p.e+p.r*id+l*derivative,derivative,u,id};
}

// Exact integration for a fixed conducting set: the sum current is a sinusoidally
// forced first-order RL equation; phase-current differences integrate the line voltages.
function advance(angle,degrees,state,p){
  const active=indices(state.mask),n=active.length;
  if(!n)return [...state.i];
  const lb=p.lb/1000,den=lb+n*p.l/1000,w=2*Math.PI*p.f;
  const dt=degrees/(360*p.f),a=n*p.r/den,decay=Math.exp(-a*dt),id=total(state.i);
  let next=id*decay-p.e/p.r*(-Math.expm1(-a*dt));
  const vm=Math.SQRT2*p.u2,integrals=[0,0,0];
  for(const j of active){
    const start=(angle-120*j)*RAD,end=start+degrees*RAD;
    const forced=(a*Math.sin(end)-w*Math.cos(end))-decay*(a*Math.sin(start)-w*Math.cos(start));
    next+=vm/den*forced/(a*a+w*w);
    integrals[j]=vm/w*(Math.cos(start)-Math.cos(end));
  }
  if(n===1){const result=[0,0,0];result[active[0]]=next;return result;}
  const meanIntegral=active.reduce((s,j)=>s+integrals[j],0)/n;
  return state.i.map((current,j)=>state.mask&(1<<j)?current+(next-id)/n+(integrals[j]-meanIntegral)/lb:0);
}

function settleEvents(angle,state,events){
  for(const event of events){
    if(event.end!==null)continue;
    const remaining=event.outgoing.some(j=>state.mask&(1<<j));
    if(!remaining){event.end=angle;event.success=Boolean(state.mask&(1<<event.incoming));event.gamma=event.success?angle-event.start:null;}
    else if(!(state.mask&(1<<event.incoming))){event.end=angle;event.success=false;event.gamma=null;event.failed=true;}
    else if(angle>=event.deadline-1e-7){event.failed=true;}
  }
}

function step(angle,state,p,events,alpha){
  const mask=gateMask(angle,p,alpha);
  for(let j=0;j<3;j++){
    if(!(mask&(1<<j))||(state.mask&(1<<j)))continue;
    const before=voltage(angle,state,p);
    if(before.u[j]<=before.ud+1e-7)continue;
    const outgoing=indices(state.mask);
    if(p.lb===0){const id=total(state.i);state.mask=1<<j;state.i=[0,0,0];state.i[j]=id;}
    else state.mask|=1<<j;
    if(outgoing.length){
      const natural=30+120*j+360*Math.floor((angle-30-120*j+1e-7)/360);
      events.push({start:angle,end:p.lb===0?angle:null,incoming:j,outgoing,alpha,beta:180-alpha,deadline:natural+180,gamma:p.lb===0?0:null,success:p.lb===0,failed:false});
    }
  }
  settleEvents(angle,state,events);
  const sample={angle,...voltage(angle,state,p),currents:[...state.i],mask:state.mask,gates:mask,alpha};
  let left=STEP,t=angle;
  // Split at current-zero events; a thyristor never conducts negative current.
  for(let split=0;left>1e-7&&split<4;split++){
    const next=advance(t,left,state,p),active=indices(state.mask);
    const crossing=active.filter(j=>next[j]<-EPS);
    if(!crossing.length){state.i=next.map(x=>Math.max(0,x));break;}
    let fraction=1,off=-1;
    for(const j of crossing){
      let lo=0,hi=1;
      for(let iter=0;iter<22;iter++){const mid=(lo+hi)/2;if(advance(t,left*mid,state,p)[j]>0)lo=mid;else hi=mid;}
      if(hi<fraction){fraction=hi;off=j;}
    }
    const elapsed=left*fraction;
    state.i=advance(t,elapsed,state,p).map(x=>Math.max(0,x));state.i[off]=0;state.mask&=~(1<<off);
    t+=elapsed;left-=elapsed;settleEvents(t,state,events);
  }
  settleEvents(angle+STEP,state,events);
  return sample;
}

function seed(p){
  const ideal=3*Math.sqrt(6)*p.u2/(2*Math.PI)*Math.cos(p.alpha*RAD);
  const current=Math.max(0,(ideal-p.e)/(p.r+3*p.f*p.lb/1000));
  const j=mod(Math.floor((-30-p.alpha)/120),3),i=[0,0,0];i[j]=current;
  return {mask:current>EPS?1<<j:0,i};
}
function warm(p){
  let state=seed(p),converged=false,failed=false;
  for(let cycle=0;cycle<180;cycle++){
    const start=[...state.i],startMask=state.mask,events=[];
    for(let n=0;n<360/STEP;n++)step(n*STEP,state,p,events,p.alpha);
    if(events.some(e=>e.failed)){failed=true;break;}
    if(startMask===state.mask&&Math.max(...start.map((v,j)=>Math.abs(v-state.i[j])))<Math.max(1e-5,total(state.i)*.00002)){converged=true;break;}
  }
  return {state,converged,failed};
}

export function simulateInverter(parameters={},scenario='steady'){
  const p={...inverterPreset(parameters.circuit??'threeHalf'),...parameters};
  if(!['bridge','threeHalf','threeBridge'].includes(p.circuit)||!['alpha','u2','f','lb','l','r','e','pulseWidth'].every(k=>Number.isFinite(p[k]))||p.u2<=0||p.r<=0||p.l<=0||p.lb<0||p.f<=0||p.alpha<90||p.alpha>=180||p.pulseWidth<=0)throw new RangeError('Invalid inverter parameters');
  if(p.circuit!=='threeHalf')return simulateBridgeInverter(p,scenario);
  const base=scenario==='failure'?{...p,alpha:140}:p;
  const ready=warm(base);
  // An unstable operating point has no periodic inverter solution. Keep its start-up
  // transient instead of presenting a settled fault waveform as a valid inverter.
  let state=ready.failed?seed(base):{mask:ready.state.mask,i:[...ready.state.i]};
  const samples=[],events=[];
  const transition=scenario==='failure'?360:null;
  for(let n=0;n<=720/STEP;n++){
    const angle=n*STEP,params=scenario==='failure'&&angle<360?base:p;
    samples.push(step(angle,state,params,events,params.alpha));
  }
  const endSamples=samples.filter(s=>s.angle>=360&&s.angle<720),failed=events.some(e=>e.failed),complete=events.filter(e=>e.success&&e.start>=360&&e.end<=720);
  const ud=endSamples.reduce((s,x)=>s+x.ud,0)/endSamples.length,id=endSamples.reduce((s,x)=>s+x.id,0)/endSamples.length;
  const power=endSamples.reduce((s,x)=>s+x.u.reduce((sum,u,j)=>sum+u*x.currents[j],0),0)/endSamples.length;
  const gamma=failed?null:complete.length?complete.reduce((s,e)=>s+e.gamma,0)/complete.length:null;
  const margin=failed||!complete.length?null:complete.reduce((s,e)=>s+e.deadline-e.end,0)/complete.length;
  const continuous=endSamples.every(s=>s.id>1e-5);
  return {p,scenario,samples,events,transition,converged:ready.converged&&!failed&&scenario==='steady',failed,continuous,metrics:{ud,id,power,gamma,beta:180-p.alpha,margin,currentMin:Math.min(...endSamples.map(s=>s.id)),currentMax:Math.max(...endSamples.map(s=>s.id))}};
}

export function inverterSample(result,angle){
  const index=Math.max(0,Math.min(result.samples.length-1,Math.round(angle/STEP)));
  return result.samples[index];
}

export function selectedCommutation(result,angle,range=720){
  const visible=result.events.filter(e=>e.start>=0&&e.start<range);
  return visible.filter(e=>e.start<=angle+1e-7).at(-1)??visible[0]??null;
}

export function commutationMeasurements(event){
  if(!event)return null;
  const natural=event.natural??event.deadline-180,trigger=event.trigger??natural+event.alpha;
  const completed=event.success&&!event.failed&&event.end!==null;
  return {natural,trigger,start:event.start,end:event.end,p:event.deadline,
    alpha:event.alpha,beta:180-event.alpha,delay:event.start-trigger,
    gamma:completed?event.end-event.start:null,
    margin:completed?Math.max(0,event.deadline-event.end):null,nonstandard:Boolean(event.nonstandard)};
}
