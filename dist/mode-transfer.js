import {circuits,simulation} from './model.js';

export const inversionCircuits=['bridge','threeHalf','threeBridge'];
const bounds={alpha:[0,180],u2:[1,1000],r:[.1,10000],l:[0,100000],e:[-1000,1000],pulseWidth:[1,60]};

// Decide from the actual periodic waveform, not merely the sign of cos(alpha).
export function isActiveInversion(p){
  if(!inversionCircuits.includes(p.circuit)||p.load!=='rle'||!(p.e<0&&p.alpha>90&&p.alpha<180))return false;
  const {metrics:m,transitions}=simulation(p),c=circuits.find(c=>c.id===p.circuit);
  return m.settled&&m.continuous&&m.id>1e-7&&m.ud< -1e-7&&m.power< -1e-7&&transitions.length>=c.pulses;
}

export function readTransferredState(search=''){
  const q=new URLSearchParams(search);
  if(q.get('transfer')!=='1')return null;
  const p={circuit:q.get('circuit'),load:q.get('load')};
  if(!circuits.some(c=>c.id===p.circuit)||!['r','rl','rle'].includes(p.load))return null;
  for(const [key,[min,max]] of Object.entries(bounds)){
    const value=q.get(key),n=Number(value);
    if(value===null||value.trim()===''||!Number.isFinite(n)||n<min||n>max)return null;
    p[key]=n;
  }
  p.f=Number(q.get('f'));if(![50,60].includes(p.f)||p.load==='rl'&&p.l<.1)return null;
  const cycles=q.get('cycles')==='1'?1:2,cursor=Number(q.get('cursor')??120);
  if(!Number.isFinite(cursor)||cursor<0||cursor>360*cycles)return null;
  const lb=q.has('lb')?Number(q.get('lb')):null;
  if(lb!==null&&(!Number.isFinite(lb)||lb<0||lb>20||q.get('lb').trim()===''))return null;
  return {p,cycles,cursor,timeAxis:q.get('timeAxis')==='1',resume:q.get('resume')==='1',...(lb!==null?{lb}:{})};
}

export function stateUrl(path,p,view={},resume=false){
  const q=new URLSearchParams({transfer:'1',circuit:p.circuit,load:p.load});
  for(const key of [...Object.keys(bounds),'f'])q.set(key,String(p[key]));
  q.set('cycles',String(view.cycles??2));q.set('cursor',String(view.cursor??120));q.set('timeAxis',view.timeAxis?'1':'0');
  if(view.lb!==undefined)q.set('lb',String(view.lb));
  if(resume)q.set('resume','1');
  return path+'?'+q;
}

export function inversionUrl(p,view){
  // All supported finite-L topologies share the detailed overlap workspace.
  // Keep the original RE (L=0) solver so transferred values are never replaced.
  return stateUrl(p.l>0?'./inverter.html':'./inverter-ideal.html',p,view);
}

export function inverterParameters(state){
  if(!state||!inversionCircuits.includes(state.p.circuit)||state.p.load!=='rle'||state.p.l<=0||state.p.e>=0||state.p.alpha<90||state.p.alpha>=180)return null;
  const p={circuit:state.p.circuit,lb:state.lb??0};
  for(const key of ['alpha','u2','r','l','e','f','pulseWidth'])p[key]=state.p[key];
  return p;
}
