import {renderFlowSegments} from './playback.js';
const green='#23845a',colours=['#c84a44','#188768','#3979d2'];
// Conventional currents on the exact geometry rendered by app.js. Thyristor
// load current stays positive even while negative terminal power returns energy.
export function rectifierFlowSegments(s,p){
  if(!(s.id>1e-8)||!s.active.length)return [];
  const segments=[],has=name=>s.active.includes(name),i=s.id;
  const add=(id,points,current=i,color=green)=>{
    if(!Number.isFinite(current)||Math.abs(current)<1e-8)return;
    segments.push({id,current,color,points:current>0?points:[...points].reverse()});
  };
  const load=(x,top,bottom)=>add('load-device',[[x,top],[x,bottom]]);
  if(p.circuit==='half'){
    add('source-up-device',[[75,166],[75,124]]);
    add('VT1-device',[[75,124],[75,55],[375,55]]);
    load(375,55,245);add('return',[[375,245],[75,245],[75,166]]);
  }else if(p.circuit==='bridge'||p.circuit==='semi'){
    const names=p.circuit==='bridge'?['VT1','VT3','VT4','VT2']:['VT1','VT2','D1','D2'];
    const paths=[[[127,146],[252,45]],[[365,146],[252,45]],[[252,250],[127,146]],[[252,250],[365,146]]];
    names.forEach((name,k)=>{if(has(name))add(name+'-device',paths[k]);});
    if(!s.freewheel)add('ac-source-device',[[365,146],[127,146]],s.input);
    add('load-top',[[252,45],[445,45]]);load(445,45,250);add('load-return',[[445,250],[252,250]]);
  }else if(p.circuit==='threeHalf'){
    const currents=[1,2,3].map(n=>has('VT'+n)?i:0);
    currents.forEach((current,k)=>add('VT'+(k+1)+'-device',[[53,70+k*67],[282,70+k*67]],current,colours[k]));
    add('collector-lower',[[282,204],[282,137]],currents[2]);
    add('collector-upper',[[282,137],[282,70]],currents[1]+currents[2]);
    add('load-top',[[282,70],[282,45],[425,45]]);load(425,45,253);add('neutral-return',[[425,253],[53,253]]);
  }else if(p.circuit==='threeBridge'){
    let up=0,down=0;
    for(let k=0;k<3;k++){
      const x=110+110*k,t=[1,3,5][k],b=[4,6,2][k],ti=has('VT'+t)?i:0,bi=has('VT'+b)?i:0,end=k===2?450:x+110;
      add('VT'+t+'-device',[[x,149],[x,39]],ti,colours[k]);
      add('VT'+b+'-device',[[x,259],[x,149]],bi,colours[k]);
      add('phase-'+k,[[x-28,149],[x,149]],ti-bi,colours[k]);
      up+=ti;down+=bi;
      add('top-rail-'+k,[[x,39],[end,39]],up);add('bottom-rail-'+k,[[x,259],[end,259]],-down);
    }
    load(450,39,259);
  }
  return segments;
}
export const rectifierFlowSVG=(s,p,rate=1)=>renderFlowSegments(rectifierFlowSegments(s,p),rate,s.ud*s.id < -1e-8);
