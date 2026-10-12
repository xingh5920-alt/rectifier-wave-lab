import {phaseColors} from './inverter-topologies.js';
import {renderFlowSegments} from './playback.js';
const green='#477d4d';
export function inverterFlowSegments(s,p){
  const segments=[];if(s.valid===false)return segments;
  const add=(id,points,current,color=green)=>{
    if(!Number.isFinite(current)||Math.abs(current)<=1e-8)return;
    segments.push({id,current,color,points:current>0?points:[...points].reverse()});
  };
  const valve=(a,b,j,color)=>{
    const i=s.currents[j];if(!(i>1e-8))return;
    const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    add('VT'+(j+1)+'-device',[[mid[0]-dx/length*16,mid[1]-dy/length*16],[mid[0]+dx/length*23,mid[1]+dy/length*23]],i,color);
    add('VT'+(j+1)+'-in',[a,[mid[0]-dx/length*16,mid[1]-dy/length*16]],i,color);
    add('VT'+(j+1)+'-out',[[mid[0]+dx/length*23,mid[1]+dy/length*23],b],i,color);
  };
  const id=s.id,ac=s.phaseCurrents?.[0]??(s.currents[0]-s.currents[2]);
  if(p.circuit==='threeHalf'){
    for(let j=0;j<3;j++){
      const y=56+65*j,i=s.currents[j],color=phaseColors[j];
      add('phase-'+j+'-L-device',[[92,y],[148,y]],i,color);add('VT'+(j+1)+'-device',[[183,y],[227,y]],i,color);
      add('phase-'+j+'-in',[[47,y],[92,y]],i,color);add('phase-'+j+'-after-L',[[148,y],[183,y]],i,color);add('VT'+(j+1)+'-out',[[227,y],[299,y]],i,color);
    }
    add('collector-upper',[[299,56],[299,121]],-(s.currents[1]+s.currents[2]));add('collector-lower',[[299,121],[299,186]],-s.currents[2]);
    add('load-before-L',[[299,56],[331,56]],id);add('load-before-R',[[387,56],[422,56],[422,102]],id);
    add('load-L-device',[[331,56],[387,56]],id);add('load-R-device',[[422,102],[422,132]],id);add('load-E-device',[[422,166],[422,210]],id);
    add('load-before-E',[[422,132],[422,166]],id);add('return',[[422,210],[422,267],[47,267]],id);
  }else{
    const top=p.circuit==='bridge'?40:39,bottom=p.circuit==='bridge'?264:266;
    if(p.circuit==='bridge'){
      valve([116,147],[258,40],0,phaseColors[0]);valve([368,147],[258,40],2,phaseColors[2]);
      valve([258,264],[116,147],3,phaseColors[2]);valve([258,264],[368,147],1,phaseColors[0]);
      add('ac-L-device',[[140,147],[184,147]],-ac,phaseColors[0]);add('ac-source-device',[[224,147],[266,147]],-ac,phaseColors[0]);
      add('ac-before-L',[[116,147],[140,147]],-ac,phaseColors[0]);add('ac-before-source',[[184,147],[224,147]],-ac,phaseColors[0]);add('ac-after-source',[[266,147],[368,147]],-ac,phaseColors[0]);
      add('dc-top',[[258,top],[455,top]],id);add('dc-bottom',[[455,bottom],[258,bottom]],id);
    }else{
      const uppers=[0,2,4],lowers=[3,5,1];let up=0,down=0;
      for(let k=0;k<3;k++){
        const x=110+110*k,color=phaseColors[k],a=s.currents[uppers[k]],b=s.currents[lowers[k]];
        valve([x,151],[x,top],uppers[k],color);valve([x,bottom],[x,151],lowers[k],color);
        add('phase-'+k+'-L-device',[[x-41,151],[x-11,151]],a-b,color);
        add('phase-'+k+'-before-L',[[x-51,151],[x-41,151]],a-b,color);add('phase-'+k+'-after-L',[[x-11,151],[x,151]],a-b,color);
        up+=a;down+=b;const end=k===2?455:x+110;
        add('top-rail-'+k,[[x,top],[end,top]],up);add('bottom-rail-'+k,[[x,bottom],[end,bottom]],-down);
      }
    }
    const ey=bottom-37;
    add('load-L-device',[[455,top+22],[455,top+58]],id);add('load-R-device',[[455,top+83],[455,top+109]],id);add('load-E-device',[[455,ey-14],[455,ey+14]],id);
    add('load-before-L',[[455,top],[455,top+22]],id);add('load-before-R',[[455,top+58],[455,top+83]],id);
    add('load-before-E',[[455,top+109],[455,ey-14]],id);add('load-after-E',[[455,ey+14],[455,bottom]],id);
  }
  return segments;
}
export const inverterFlowSVG=(s,p,rate=1)=>renderFlowSegments(inverterFlowSegments(s,p),rate,s.ud*s.id < -1e-8);
