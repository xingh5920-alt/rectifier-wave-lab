import {renderFlowSegments} from './playback.js';
// Conventional branch currents, not electron motion. Positions follow the circuit SVG.
const green='#23845a',colours=['#c84a44','#188768','#3979d2'];
const nz=i=>Number.isFinite(i)&&Math.abs(i)>1e-8;
export function currentFlowSegments(type,s){
  const segments=[];
  const add=(id,points,current,color=green)=>{
    if(!nz(current))return;
    const length=points.slice(1).reduce((sum,p,k)=>sum+Math.hypot(p[0]-points[k][0],p[1]-points[k][1]),0);
    if(length<8)return;
    segments.push({id,current,color,points:current>0?points:[...points].reverse()});
  };
  // A positive phase current leaves the bridge midpoint. Diodes conduct oppositely to V.
  const vsiLeg=(x,mid,cy,rail,number,active,upper,jump,color=green,junction=jump)=>{
    const diode=active.includes('VD'+number),valve=active.includes('V'+number);
    if(!diode&&!valve)return;
    const current=diode?-1:1,dx=x+jump;
    const start=upper?rail:mid,end=upper?mid:rail;
    add('leg-'+number+'-device',diode?[[dx,cy-28],[dx,cy+28]]:[[x,cy-28],[x,cy-15],[x-8,cy-7],[x-8,cy+7],[x,cy+15],[x,cy+28]],current,color);
    add('leg-'+number+'-in',diode?[[x,start],[x,cy-junction],[dx,cy-junction],[dx,cy-28]]:[[x,start],[x,cy-28]],current,color);
    add('leg-'+number+'-out',diode?[[dx,cy+28],[dx,cy+junction],[x,cy+junction],[x,end]]:[[x,cy+28],[x,end]],current,color);
  };
  if(type==='half'){
    const i=s.io,a=s.active;
    add('load-L',[[279,230],[231,230]],i);add('load-R',[[221,230],[161,230]],i);
    add('load-before-L',[[320,230],[279,230]],i);add('load-between',[[231,230],[221,230]],i);add('load-after-R',[[161,230],[130,230]],i);
    const upper=a.includes('V1')||a.includes('VD1');
    vsiLeg(320,230,130,60,1,a,true,50,green,40);vsiLeg(320,230,320,420,2,a,false,50,green,40);
    if(nz(i)){
      // Balanced split capacitors share the midpoint return current; i_d = u_o i_o/U_d.
      add('C1-lower-wire',[[130,170],[130,230]],-i/2);add('C1-upper-wire',[[130,60],[130,116]],-i/2);
      add('C2-upper-wire',[[130,230],[130,276]],i/2);add('C2-lower-wire',[[130,330],[130,420]],i/2);
      add('top-rail',[[130,60],[320,60]],upper?i:0);add('bottom-rail',[[130,420],[320,420]],upper?0:i);
      add('source-top',[[38,60],[130,60]],s.dc);add('source-bottom',[[38,420],[130,420]],-s.dc);
    }
  }else if(type==='full'||type==='phase'){
    const i=s.io,a=s.active,upper=n=>a.includes('V'+n)||a.includes('VD'+n);
    add('load-R',[[295,247],[355,247]],i);add('load-L',[[385,247],[433,247]],i);
    for(const [x,t,b]of[[195,1,2],[505,3,4]]){vsiLeg(x,247,133,60,t,a,true,42);vsiLeg(x,247,337,430,b,a,false,42);}
    add('load-before-R',[[195,247],[295,247]],i);add('load-between',[[355,247],[385,247]],i);add('load-after-L',[[433,247],[505,247]],i);
    add('source-top',[[38,60],[195,60]],s.dc);add('source-bottom',[[38,430],[195,430]],-s.dc);
    add('bridge-top',[[195,60],[505,60]],upper(3)?-i:0);add('bridge-bottom',[[195,430],[505,430]],upper(4)?-i:0);
  }else if(type==='parallel'){
    for(const [x,t,b]of[[195,1,2],[505,3,4]]){
      const ti=s.currents[t-1],bi=s.currents[b-1];
      add('VT'+t+'-device',[[x,92],[x,148]],ti);add('LT'+t+'-device',[[x,171],[x,219]],ti);add('LT'+b+'-device',[[x,295],[x,343]],bi);add('VT'+b+'-device',[[x,363],[x,419]],bi);
      add('VT'+t+'-in',[[x,60],[x,92]],ti);add('VT'+t+'-out',[[x,148],[x,171]],ti);add('LT'+t+'-out',[[x,219],[x,247]],ti);
      add('LT'+b+'-in',[[x,247],[x,295]],bi);add('VT'+b+'-in',[[x,343],[x,363]],bi);add('VT'+b+'-out',[[x,419],[x,450]],bi);
    }
    add('load-R-device',[[245,282],[305,282]],s.il);add('load-L-device',[[380,282],[428,282]],s.il);
    add('R-branch-in',[[195,247],[195,282],[245,282]],s.il);add('RL-between',[[305,282],[380,282]],s.il);add('L-branch-out',[[428,282],[505,282],[505,247]],s.il);
    add('C-branch-in',[[195,247],[195,225],[325,225]],s.ic);add('C-branch-out',[[375,225],[505,225],[505,247]],s.ic);
    add('dc-before-Ld',[[38,60],[55,60]],s.dc);add('dc-after-Ld',[[103,60],[195,60]],s.dc);
    add('bridge-top',[[195,60],[505,60]],s.currents[2]);add('bridge-bottom',[[195,450],[505,450]],-s.currents[3]);add('source-bottom',[[38,450],[195,450]],-s.dc);
  }else{
    const csi=type==='threeI',xs=[190,330,470],ys=[255,280,305],tops=[1,3,5],bottoms=[4,6,2],bottom=csi?492:422,a=s.active;
    const topCurrent=s.i.map((i,k)=>a.includes((csi?'VT':'V')+tops[k])||a.includes('VD'+tops[k])?i:0);
    const lowerCurrent=s.i.map((i,k)=>a.includes((csi?'VT':'V')+bottoms[k])||a.includes('VD'+bottoms[k])?i:0);
    for(let k=0;k<3;k++){
      const x=xs[k],y=ys[k],i=s.i[k],color=colours[k];
      if(csi){
        const ti=Math.max(0,i),bi=Math.max(0,-i);
        add('VT'+tops[k]+'-device',[[x,92],[x,148]],ti,color);add('VD'+tops[k]+'-device',[[x,177],[x,233]],ti,color);add('VD'+bottoms[k]+'-device',[[x,317],[x,373]],bi,color);add('VT'+bottoms[k]+'-device',[[x,402],[x,458]],bi,color);
        add('VT'+tops[k]+'-in',[[x,60],[x,92]],ti,color);add('upper-series-'+k,[[x,148],[x,177]],ti,color);add('VD'+tops[k]+'-out',[[x,233],[x,y]],ti,color);
        add('VD'+bottoms[k]+'-in',[[x,y],[x,317]],bi,color);add('lower-series-'+k,[[x,373],[x,402]],bi,color);add('VT'+bottoms[k]+'-out',[[x,458],[x,bottom]],bi,color);
      }else {vsiLeg(x,y,138,60,tops[k],a,true,45,color);vsiLeg(x,y,350,bottom,bottoms[k],a,false,45,color);}
      add('phase-'+k,[[x,y],[csi?664:565,y]],i,color);
      if(!csi)add('phase-load-'+k,[[565,y],[675,y]],i,color);
      if(!csi)add('phase-return-'+k,[[675,y],[719,y]],i,color);
    }
    for(let k=0;k<3;k++){
      const sum=arr=>arr.slice(k).reduce((v,i)=>v+i,0),start=k===0?(csi?103:38):xs[k-1];
      add('top-rail-'+k,[[start,60],[xs[k],60]],sum(topCurrent));
      add('bottom-rail-'+k,[[k===0?38:xs[k-1],bottom],[xs[k],bottom]],sum(lowerCurrent));
    }
    if(csi)add('dc-before-Ld',[[38,60],[55,60]],s.dc);
    else {add('star-upper',[[719,255],[719,280]],s.i[0]);add('star-lower',[[719,280],[719,305]],-s.i[2]);}
  }
  return segments;
}
export const currentFlowSVG=(type,s,rate=1)=>renderFlowSegments(currentFlowSegments(type,s),rate,s.power < -1e-8);
