// Lossless source inductances. Single phase L_B is the total AC loop inductance;
// three phase L_B is per phase. Fixed-conduction-set integration is analytical.
import {inverterTopology} from './inverter-topologies.js';
const RAD=Math.PI/180,STEP=.1,EPS=1e-8;
const mod=(v,m=360)=>((v%m)+m)%m;
const TOP=[0,2,4],BOTTOM=[3,5,1];
const indices=(mask,n)=>Array.from({length:n},(_,j)=>j).filter(j=>mask&(1<<j));
export function bridgeVoltages(angle,p){return p.circuit==='bridge'?[Math.SQRT2*p.u2*Math.sin(angle*RAD)]:[0,120,240].map(shift=>Math.SQRT2*p.u2*Math.sin((angle-shift)*RAD));}
export function bridgeGateMask(angle,p,alpha=p.alpha){
  if(p.circuit==='bridge')return [0,1].reduce((mask,j)=>mask|(mod(angle-alpha-180*j)<p.pulseWidth-1e-7?(j?12:3):0),0);
  return Array.from({length:6},(_,j)=>j).reduce((mask,j)=>mask|([0,60].some(offset=>mod(angle-30-alpha-60*j-offset)<p.pulseWidth-1e-7)?1<<j:0),0);
}
function integral(angle,degrees,phase,p){const a=(angle-120*phase)*RAD;return Math.SQRT2*p.u2/(2*Math.PI*p.f)*(Math.cos(a)-Math.cos(a+degrees*RAD));}
function forced(angle,degrees,phase,a,decay,p){const start=(angle-120*phase)*RAD,end=start+degrees*RAD,w=2*Math.PI*p.f;return Math.SQRT2*p.u2*((a*Math.sin(end)-w*Math.cos(end))-decay*(a*Math.sin(start)-w*Math.cos(start)))/(a*a+w*w);}
function dcAdvance(id,den,forcing,dt,p){const a=p.r/den,decay=Math.exp(-a*dt);return {next:id*decay-p.e/p.r*(-Math.expm1(-a*dt))+forcing(a,decay)/den,a,decay};}
function groups(state){const top=TOP.filter(j=>state.mask&(1<<j)),bottom=BOTTOM.filter(j=>state.mask&(1<<j));return {top,bottom,tp:top.map(j=>TOP.indexOf(j)),bp:bottom.map(j=>BOTTOM.indexOf(j))};}
function snapshot(angle,state,p,alpha){
  const u=bridgeVoltages(angle,p),single=p.circuit==='bridge';
  if(state.limited)return {angle,u,alpha,mask:0,id:null,ud:null,currents:Array(single?4:6).fill(null),phaseCurrents:Array(u.length).fill(null),valveVoltages:Array(single?4:6).fill(null),valid:false};
  let id,ud,phaseCurrents,valveVoltages,currents,positive=null,negative=null,derivative=0;
  const lb=p.lb/1000,l=p.l/1000;
  if(single){
    id=state.i[0]+state.i[1];currents=[state.i[0],state.i[0],state.i[1],state.i[1]];phaseCurrents=[state.i[0]-state.i[1]];
    if(!state.mask)ud=p.e;
    else if(state.mask===3){derivative=(-p.e-p.r*id)/l;ud=0;positive=negative=0;}
    else{const sign=state.mask===1?1:-1;derivative=(sign*u[0]-p.e-p.r*id)/(l+lb);ud=p.e+p.r*id+l*derivative;if(sign===1){positive=ud;negative=0;}else{positive=0;negative=-ud;}}
    const terminal=state.mask===1?ud:state.mask===2?-ud:0;
    valveVoltages=state.mask?[terminal-positive,negative, -positive,negative-terminal]:Array(4).fill(null);
  }else{
    const {top,bottom,tp,bp}=groups(state);id=top.reduce((sum,j)=>sum+state.i[j],0);currents=[...state.i];phaseCurrents=TOP.map((j,k)=>state.i[j]-state.i[BOTTOM[k]]);
    if(!top.length||!bottom.length)ud=p.e;
    else if(tp.some(j=>bp.includes(j))){derivative=(-p.e-p.r*id)/l;ud=0;const phases=[...new Set([...tp,...bp])];positive=negative=phases.reduce((sum,j)=>sum+u[j],0)/phases.length;}
    else{const meanTop=tp.reduce((sum,j)=>sum+u[j],0)/tp.length,meanBottom=bp.reduce((sum,j)=>sum+u[j],0)/bp.length;derivative=(meanTop-meanBottom-p.e-p.r*id)/(l+lb*(1/tp.length+1/bp.length));positive=meanTop-lb/tp.length*derivative;negative=meanBottom+lb/bp.length*derivative;ud=positive-negative;}
    valveVoltages=Array(6).fill(null);
    if(state.mask)for(let phase=0;phase<3;phase++){const terminal=state.mask&(1<<TOP[phase])?positive:state.mask&(1<<BOTTOM[phase])?negative:u[phase];valveVoltages[TOP[phase]]=terminal-positive;valveVoltages[BOTTOM[phase]]=negative-terminal;}
  }
  const mask=single?(state.mask&1?3:0)|(state.mask&2?12:0):state.mask;
  return {angle,u,alpha,id,ud,currents,phaseCurrents,valveVoltages,mask,positive,negative,derivative,valid:true};
}
function advance(angle,degrees,state,p){
  const single=p.circuit==='bridge',lb=p.lb/1000,l=p.l/1000,dt=degrees/(360*p.f);
  if(!state.mask)return [...state.i];
  if(single){
    const id=state.i[0]+state.i[1];
    if(state.mask!==3){const sign=state.mask===1?1:-1,next=dcAdvance(id,l+lb,(a,d)=>sign*forced(angle,degrees,0,a,d,p),dt,p).next;return sign===1?[next,0]:[0,next];}
    const next=dcAdvance(id,l,()=>0,dt,p).next,q=integral(angle,degrees,0,p)/lb;
    return [state.i[0]+(next-id+q)/2,state.i[1]+(next-id-q)/2];
  }
  const {top,bottom,tp,bp}=groups(state),id=top.reduce((sum,j)=>sum+state.i[j],0),shared=tp.filter(j=>bp.includes(j)),out=[...state.i];
  if(!shared.length){
    const den=l+lb*(1/tp.length+1/bp.length),next=dcAdvance(id,den,(a,d)=>tp.reduce((sum,j)=>sum+forced(angle,degrees,j,a,d,p),0)/tp.length-bp.reduce((sum,j)=>sum+forced(angle,degrees,j,a,d,p),0)/bp.length,dt,p).next;
    const ints=[0,1,2].map(j=>integral(angle,degrees,j,p)),meanTop=tp.reduce((sum,j)=>sum+ints[j],0)/tp.length,meanBottom=bp.reduce((sum,j)=>sum+ints[j],0)/bp.length;
    for(const j of top)out[j]=state.i[j]+(next-id)/tp.length+(lb?(ints[TOP.indexOf(j)]-meanTop)/lb:0);
    for(const j of bottom)out[j]=state.i[j]+(next-id)/bp.length-(lb?(ints[BOTTOM.indexOf(j)]-meanBottom)/lb:0);
  }else{
    // A single shared phase gives a unique freewheel path (four-device overlap).
    // Two parallel ideal shorting paths have no unique valve-current division.
    const phase=shared[0],phases=[...new Set([...tp,...bp])],ints=phases.map(j=>integral(angle,degrees,j,p)),mean=ints.reduce((a,b)=>a+b,0)/phases.length;
    const changes=Object.fromEntries(phases.map((j,k)=>[j,lb?(ints[k]-mean)/lb:0])),next=dcAdvance(id,l,()=>0,dt,p).next;
    for(const j of top)if(j!==TOP[phase])out[j]+=changes[TOP.indexOf(j)];
    for(const j of bottom)if(j!==BOTTOM[phase])out[j]-=changes[BOTTOM.indexOf(j)];
    out[TOP[phase]]+=next-id-top.filter(j=>j!==TOP[phase]).reduce((sum,j)=>sum+out[j]-state.i[j],0);
    out[BOTTOM[phase]]+=next-id-bottom.filter(j=>j!==BOTTOM[phase]).reduce((sum,j)=>sum+out[j]-state.i[j],0);
  }
  return out;
}
function valveCurrents(state,p){return p.circuit==='bridge'?[state.i[0],state.i[0],state.i[1],state.i[1]]:state.i;}
function settleEvents(angle,state,p,events){
  const currents=valveCurrents(state,p);
  for(const e of events){
    if(e.end!==null)continue;
    if(!e.outgoing.some(j=>currents[j]>EPS)){e.end=angle;e.success=e.incomingValves.some(j=>currents[j]>EPS);e.failed||=!e.success;e.gamma=e.success&&!e.failed?angle-e.start:null;}
    else if(!e.incomingValves.some(j=>state.mask&(1<<(p.circuit==='bridge'?Math.floor(j/2):j)))){e.end=angle;e.failed=true;e.success=false;}
    else if(angle>=e.deadline-1e-7)e.failed=true;
  }
}
function record(angle,p,alpha,incoming,outgoing,events,zero=false){
  const j=p.circuit==='bridge'?Math.floor(incoming[0]/2):incoming[0],naturalBase=p.circuit==='bridge'?180*j:30+60*j;
  const natural=naturalBase+360*Math.floor((angle-naturalBase-alpha+1e-7)/360),trigger=natural+alpha;
  let deadline=natural+180;
  if(p.circuit==='threeBridge'){
    const top=TOP.includes(incoming[0]),phases=top?TOP:BOTTOM,inPhase=phases.indexOf(incoming[0]);
    const reversals=outgoing.map(j=>{const outPhase=phases.indexOf(j),a=(top?1:-1)*(Math.cos(120*inPhase*RAD)-Math.cos(120*outPhase*RAD)),b=(top?1:-1)*(-Math.sin(120*inPhase*RAD)+Math.sin(120*outPhase*RAD));let zero=Math.atan2(-b,a)/RAD;while(zero<=angle+1e-7)zero+=180;return zero;});
    deadline=Math.min(...reversals);
  }
  events.push({start:angle,end:zero?angle:null,incoming:incoming[0],incomingValves:incoming,outgoing,alpha,beta:180-alpha,natural,trigger,deadline,gamma:zero?0:null,success:zero,failed:false,nonstandard:Math.abs(deadline-natural-180)>.01});
}
function step(angle,state,p,events,alpha){
  const gates=bridgeGateMask(angle,p,alpha),single=p.circuit==='bridge';
  if(!state.limited){
    if(single){
      for(let pair=0;pair<2;pair++){
        if(!(gates&(pair?12:3))||state.mask&(1<<pair))continue;
        const before=snapshot(angle,state,p,alpha),sign=pair? -1:1;
        if(state.mask?before.ud>=-1e-7:sign*before.u[0]<=p.e+1e-7)continue;
        const outgoing=state.mask?[pair?0:2,pair?1:3]:[],id=before.id;
        if(p.lb===0){state.mask=1<<pair;state.i=pair?[0,id]:[id,0];}else state.mask|=1<<pair;
        if(outgoing.length)record(angle,p,alpha,[2*pair,2*pair+1],outgoing,events,p.lb===0);
      }
    }else{
      if(!state.mask){
        const top=TOP.filter(j=>gates&(1<<j)),bottom=BOTTOM.filter(j=>gates&(1<<j)),u=bridgeVoltages(angle,p);
        let pair=null,best=-Infinity;
        for(const t of top)for(const b of bottom){const v=u[TOP.indexOf(t)]-u[BOTTOM.indexOf(b)];if(v>best){best=v;pair=[t,b];}}
        if(pair&&best>p.e+1e-7)state.mask=(1<<pair[0])|(1<<pair[1]);
      }
      for(let j=0;j<6;j++){
        if(!(gates&(1<<j))||state.mask&(1<<j)||!state.mask)continue;
        const before=snapshot(angle,state,p,alpha),top=TOP.includes(j),phase=(top?TOP:BOTTOM).indexOf(j),other=(top?BOTTOM:TOP)[phase];
        const terminal=state.mask&(1<<other)?(top?before.negative:before.positive):before.u[phase],forward=top?terminal-before.positive:before.negative-terminal;
        if(forward<=1e-7)continue;
        const outgoing=(top?TOP:BOTTOM).filter(k=>state.mask&(1<<k));
        if(p.lb===0){const id=before.id;for(const k of outgoing){state.mask&=~(1<<k);state.i[k]=0;}state.i[j]=id;}
        state.mask|=1<<j;if(outgoing.length)record(angle,p,alpha,[j],outgoing,events,p.lb===0);
        const g=groups(state);if(g.tp.filter(k=>g.bp.includes(k)).length>1){state.limited=true;state.limitAngle=angle;break;}
      }
    }
  }
  settleEvents(angle,state,p,events);
  const sample={...snapshot(angle,state,p,alpha),gates};
  if(state.limited)return sample;
  let left=STEP,t=angle;
  for(let split=0;left>1e-7&&split<10;split++){
    const next=advance(t,left,state,p),active=indices(state.mask,single?2:6),crossing=active.filter(j=>next[j]<-EPS);
    if(!crossing.length){state.i=next.map(x=>Math.max(0,x));break;}
    let fraction=1,off=-1;
    for(const j of crossing){let lo=0,hi=1;for(let iter=0;iter<24;iter++){const mid=(lo+hi)/2;if(advance(t,left*mid,state,p)[j]>0)lo=mid;else hi=mid;}if(hi<fraction){fraction=hi;off=j;}}
    const elapsed=left*fraction;state.i=advance(t,elapsed,state,p).map(x=>Math.max(0,x));state.i[off]=0;state.mask&=~(1<<off);
    if(!single){const g=groups(state);if(!g.top.length||!g.bottom.length){state.mask=0;state.i.fill(0);}}
    t+=elapsed;left-=elapsed;settleEvents(t,state,p,events);
  }
  settleEvents(angle+STEP,state,p,events);return sample;
}
function seed(p){
  const single=p.circuit==='bridge',ideal=(single?2*Math.SQRT2:3*Math.sqrt(6))*p.u2/Math.PI*Math.cos(p.alpha*RAD),id=Math.max(0,(ideal-p.e)/(p.r+(single?4:6)*p.f*p.lb/1000));
  if(single){const pair=mod(Math.floor(-p.alpha/180),2);return {mask:id>EPS?1<<pair:0,i:pair?[0,id]:[id,0]};}
  const i=Array(6).fill(0),t=TOP[Math.floor(mod(-30-p.alpha)/120)],b=[1,3,5][Math.floor(mod(-90-p.alpha)/120)];i[t]=i[b]=id;
  return {mask:id>EPS?(1<<t)|(1<<b):0,i};
}
function warm(p){
  const state=seed(p);let converged=false,failed=false;
  for(let cycle=0;cycle<180;cycle++){
    const initial=[...state.i],mask=state.mask,events=[];
    for(let n=0;n<360/STEP;n++)step(n*STEP,state,p,events,p.alpha);
    if(events.some(e=>e.failed)||state.limited){failed=true;break;}
    const current=p.circuit==='bridge'?state.i[0]+state.i[1]:TOP.reduce((sum,j)=>sum+state.i[j],0);
    if(mask===state.mask&&Math.max(...initial.map((v,j)=>Math.abs(v-state.i[j])))<Math.max(1e-5,current*.00002)){converged=true;break;}
  }
  return {state,converged,failed};
}
export function simulateBridgeInverter(p,scenario='steady'){
  const base=scenario==='failure'?{...p,alpha:140}:p,ready=warm(base),state=ready.failed?seed(base):{mask:ready.state.mask,i:[...ready.state.i]},samples=[],events=[];
  for(let n=0;n<=720/STEP;n++){const angle=n*STEP,params=scenario==='failure'&&angle<360?base:p;samples.push(step(angle,state,params,events,params.alpha));}
  const window=samples.filter(s=>s.angle>=360&&s.angle<720&&s.valid),failed=events.some(e=>e.failed)||Boolean(state.limited),complete=events.filter(e=>e.success&&!e.failed&&e.start>=360&&e.end<=720),average=fn=>window.length?window.reduce((sum,s)=>sum+fn(s),0)/window.length:null;
  const metrics={ud:state.limited?null:average(s=>s.ud),id:state.limited?null:average(s=>s.id),power:state.limited?null:average(s=>s.u.reduce((sum,u,j)=>sum+u*s.phaseCurrents[j],0)),gamma:failed||!complete.length?null:complete.reduce((sum,e)=>sum+e.gamma,0)/complete.length,beta:180-p.alpha,margin:failed||!complete.length?null:complete.reduce((sum,e)=>sum+e.deadline-e.end,0)/complete.length,currentMin:window.length?Math.min(...window.map(s=>s.id)):0,currentMax:window.length?Math.max(...window.map(s=>s.id)):0};
  return {p,scenario,samples,events,transition:scenario==='failure'?360:null,converged:ready.converged&&!failed&&scenario==='steady',failed,continuous:!state.limited&&window.every(s=>s.id>1e-5),limited:Boolean(state.limited),limitAngle:state.limitAngle??null,topology:inverterTopology(p.circuit),metrics};
}
