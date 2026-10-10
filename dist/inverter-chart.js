import {phaseColors,inverterSample,selectedCommutation,commutationMeasurements} from './inverter-model.js';
import {inverterTopology,eventName} from './inverter-topologies.js';
const ink='#283f56',muted='#89957e',paper='#fcfdf9';
export function inverterLayout(width,range=720,circuit='threeHalf',timeAxis=false,reference='line'){
  const bridge=circuit!=='threeHalf',shift=bridge?170:0,count=inverterTopology(circuit).valves,bottom=693+shift,gateFirst=787+shift;
  return {width,height:gateFirst+28*(count-1)+18,range,left:56,right:18,circuit,timeAxis,reference,ud:{y:26,zero:118,amplitude:75},current:{y:390,zero:535,amplitude:121},input:bridge?{y:578,zero:650,amplitude:60}:null,valve:{y:578+shift,zero:635+shift,amplitude:49},gatesY:743+shift,gateFirst,bottom};
}
function label(c,text,x,y,size=12,color=ink){
  c.fillStyle=color;c.font=`${size}px system-ui`;
  const matches=[...text.matchAll(/\b([uiUL])_([a-zA-Z0-9]+)|\bg([1-6])\b/g)];
  if(!matches.length){c.fillText(text,x,y);return;}
  const align=c.textAlign;c.textAlign='left';let offset=x,last=0;
  for(const m of matches){const prefix=text.slice(last,m.index);c.font=`${size}px system-ui`;c.fillText(prefix,offset,y);offset+=c.measureText(prefix).width;const base=m[1]??'g',index=m[2]??m[3];c.font=`italic ${size}px Georgia,serif`;c.fillText(base,offset,y);offset+=c.measureText(base).width;c.font=`${Math.max(7,size*.72)}px system-ui`;c.fillText(index,offset+.4,y+size*.24);offset+=c.measureText(index).width+.4;last=m.index+m[0].length;}
  c.font=`${size}px system-ui`;c.fillText(text.slice(last),offset,y);c.textAlign=align;
}
export function drawInverterChart(c,L,result,focus=selectedCommutation(result,176,L.range)){
  const {width,height,range,left,right}=L,end=width-right,x=t=>left+t/range*(end-left);
  const topology=inverterTopology(result.p.circuit),data=result.samples.filter(s=>s.angle<=range),valid=data.filter(s=>s.ud!==null),vm=Math.SQRT2*result.p.u2,bridge=topology.id!=='threeHalf';
  const voltageScale=Math.max(topology.id==='threeBridge'&&L.reference==='line'?vm*Math.sqrt(3):vm,...valid.map(s=>Math.abs(s.ud)))*1.08;
  const currentScale=Math.max(.1,...valid.map(s=>s.id))*1.08;
  const valveScale=Math.max(vm*(topology.phases===1?1:Math.sqrt(3)),...valid.map(s=>s.valveVoltages?(Number.isFinite(s.valveVoltages[0])?Math.abs(s.valveVoltages[0]):0):Math.abs(s.u[0]-s.ud)))*1.05;
  Object.assign(L,{voltageScale,currentScale,valveScale});
  c.fillStyle=paper;c.fillRect(0,0,width,height);c.lineWidth=.7;c.setLineDash([]);
  for(let t=0;t<=range;t+=range===720?90:60){c.strokeStyle='#e4eadf';c.beginPath();c.moveTo(x(t),20);c.lineTo(x(t),L.bottom);c.stroke();}
  // Commutation intervals are shared by the output voltage and valve currents.
  for(const event of result.events){
    const start=Math.max(0,event.start),finish=Math.min(range,event.end??event.deadline);
    if(start>=range||finish<=0)continue;
    c.fillStyle=event.failed?'#cb695d13':'#dfb45117';
    c.fillRect(x(start),L.ud.y,x(finish)-x(start),181);c.fillRect(x(start),L.current.y,x(finish)-x(start),159);
    c.strokeStyle=event.failed?'#cc7b6c':'#c7ba8e';c.setLineDash([3,4]);c.beginPath();c.moveTo(x(start),20);c.lineTo(x(start),L.bottom);c.stroke();c.setLineDash([]);
    if(event.failed&&event.deadline<range){c.strokeStyle='#bd6253';c.setLineDash([2,3]);c.beginPath();c.moveTo(x(event.deadline),20);c.lineTo(x(event.deadline),L.bottom);c.stroke();c.setLineDash([]);label(c,'p',x(event.deadline)+4,24,11,'#b45a4c');}
  }
  if(result.transition!==null&&result.transition<=range){
    c.strokeStyle='#8c78a8';c.lineWidth=1;c.setLineDash([5,3]);c.beginPath();c.moveTo(x(result.transition),7);c.lineTo(x(result.transition),L.bottom);c.stroke();c.setLineDash([]);
    label(c,`α: 140° → ${result.p.alpha}°`,x(result.transition)+5,12,10,'#8c78a8');
  }
  const axes=(row,scale,positive=false)=>{
    c.strokeStyle='#a6b09e';c.lineWidth=.8;c.beginPath();c.moveTo(left,row.y);c.lineTo(left,positive?row.zero+8:row.zero+row.amplitude+9);c.moveTo(left,row.zero);c.lineTo(end+4,row.zero);c.lineTo(end+1,row.zero-3);c.moveTo(end+4,row.zero);c.lineTo(end+1,row.zero+3);c.stroke();
    label(c,'0',left-13,row.zero+4,10,muted);label(c,scale.toFixed(positive?1:0),left+5,row.y+13,9,muted);
  };
  const path=(row,scale,fn,color,dashed=false,lineWidth=1.8)=>{
    c.beginPath();const stride=Math.max(1,Math.floor(data.length/(width*3)));
    let drawing=false;for(let i=0;i<data.length;i+=stride){const s=data[i],v=fn(s);if(v===null||!Number.isFinite(v)){drawing=false;continue;}const px=x(s.angle),py=row.zero-v/scale*row.amplitude;if(!drawing)c.moveTo(px,py);else c.lineTo(px,py);drawing=true;}
    const last=data.at(-1),lastValue=fn(last);if(drawing&&lastValue!==null&&Number.isFinite(lastValue))c.lineTo(x(last.angle),row.zero-lastValue/scale*row.amplitude);
    c.strokeStyle=color;c.lineWidth=lineWidth;c.setLineDash(dashed?[5,4]:[]);c.stroke();c.setLineDash([]);
  };
  axes(L.ud,voltageScale);label(c,'u_d',4,L.ud.y+12,13);label(c,'V',6,L.ud.y+29,10,muted);
  if(topology.id==='threeBridge'&&L.reference==='line'){
    const pairs=[[0,1],[0,2],[1,2],[1,0],[2,0],[2,1]];
    for(const [a,b] of pairs)path(L.ud,voltageScale,s=>s.u[a]-s.u[b],phaseColors[a],true,1);
    for(let k=0;k<6;k++){const t=60+k*60;if(t<range){const [a,b]=pairs[k],s=inverterSample(result,t);label(c,'u_'+['a','b','c'][a]+['a','b','c'][b],x(t)-9,L.ud.zero-(s.u[a]-s.u[b])/voltageScale*L.ud.amplitude-7,10,phaseColors[a]);}}
  }else{
    for(let j=0;j<topology.phases;j++)path(L.ud,voltageScale,s=>s.u[j],phaseColors[j],true,1.15);
    for(let j=0;j<topology.phases;j++){const peak=90+j*120;if(peak<range){const yy=L.ud.zero-vm/voltageScale*L.ud.amplitude;label(c,topology.phases===1?'u_2':['u_a','u_b','u_c'][j],x(peak)-10,yy-8,11,phaseColors[j]);}}
  }
  path(L.ud,voltageScale,s=>s.ud,ink,false,2.3);
  const measurement=commutationMeasurements(focus);
  if(measurement){
    // Every dimension is tied to its actual endpoint on this selected commutation.
    const endpoints=[['n',measurement.natural,'#7a8c69',250,13],['g',measurement.trigger,'#8c70ad',L.current.zero+8,13],['e',measurement.gamma===null?null:measurement.end,'#ad8642',L.current.zero+8,29],['p',measurement.p,'#527d42',L.current.zero+8,13]];
    for(const [name,t,color,bottom,yy] of endpoints){
      if(t===null||t<0||t>range)continue;
      c.strokeStyle=color;c.lineWidth=1;c.setLineDash([2,3]);c.beginPath();c.moveTo(x(t),20);c.lineTo(x(t),bottom);c.stroke();c.setLineDash([]);label(c,name,x(t)+3,yy,10,color);
    }
    c.fillStyle=paper;c.fillRect(left,208,end-left,26);
    label(c,eventName(focus),left+3,224,10,'#74836c');
    const points=`n=${measurement.natural.toFixed(2)}°    g=${measurement.trigger.toFixed(2)}°    ${measurement.gamma===null?'e=未完成':`e=${measurement.end.toFixed(2)}°`}    p=${measurement.p.toFixed(2)}°`;
    label(c,points,left+3,239,9,'#74836c');
  }
  const bracket=(start,finish,y,text,color)=>{
    const clippedStart=start<0,clippedEnd=finish>range;
    start=Math.max(0,Math.min(range,start));finish=Math.max(0,Math.min(range,finish));
    const a=x(start),b=x(finish);c.strokeStyle=color;c.lineWidth=1;c.beginPath();c.moveTo(a,y-4);c.lineTo(a,y+4);c.moveTo(a,y);c.lineTo(b,y);c.moveTo(b,y-4);c.lineTo(b,y+4);c.stroke();
    if(b-a>9){c.beginPath();c.moveTo(a+4,y-2);c.lineTo(a,y);c.lineTo(a+4,y+2);c.moveTo(b-4,y-2);c.lineTo(b,y);c.lineTo(b-4,y+2);c.stroke();}
    if(clippedStart||clippedEnd)text+='（'+(clippedStart?'起点':'终点')+'在窗外）';
    c.font='11px system-ui';const size=c.measureText(text).width,tx=Math.max(left+2,Math.min((a+b-size)/2,end-size-2));
    c.fillStyle=paper;c.fillRect(tx-3,y+3,size+6,15);label(c,text,tx,y+15,11,color);
  };
  if(measurement){
    const m=measurement;
    bracket(m.natural,m.trigger,250,`α = ${m.alpha.toFixed(2)}°`,'#758963');
    bracket(m.trigger,m.p,283,`β = ${m.beta.toFixed(2)}°`,'#8c70ad');
    if(m.gamma!==null){
      bracket(m.start,m.end,316,`γ = ${m.gamma.toFixed(2)}°`,'#ad8642');
      bracket(m.end,m.p,349,`${m.delay>.005||m.nonstandard?'可用反压':'β − γ'} = ${m.margin.toFixed(2)}°`,'#527d42');
    }else{
      bracket(m.start,m.p,316,'到 p 点仍未完成换相','#b86350');
      label(c,'到达 p 点时，原导通管电流尚未降为零',Math.max(left,Math.min(x(m.start)-95,end-237)),369,11,'#b86350');
    }
  }else label(c,'没有形成有效的换相电流',left+10,280,12,muted);
  axes(L.current,currentScale,true);label(c,'i_d',4,L.current.y+11,13);label(c,'A',6,L.current.y+29,10,muted);
  // Valve colour follows its AC phase; lower bridge valves use dashed traces.
  const plotted=topology.id==='bridge'?[0,2]:Array.from({length:topology.valves},(_,j)=>j);
  for(const j of plotted)path(L.current,currentScale,s=>s.currents[j],phaseColors[topology.colors[j]],topology.id==='threeBridge'&&[1,3,5].includes(j),2);
  path(L.current,currentScale,s=>s.id,ink,true,1.2);
  if(result.metrics.id!==null)label(c,'i_d',end-28,L.current.zero-result.metrics.id/currentScale*L.current.amplitude-6,11,ink);
  for(const j of plotted){const plateau=valid.find(s=>s.currents[j]>.98*s.id&&s.id>0&&s.angle>10);if(plateau)label(c,topology.id==='bridge'?(j===0?'i_VT1 = i_VT2':'i_VT3 = i_VT4'):'i_VT'+(j+1),Math.min(end-105,x(plateau.angle)+6),L.current.zero-plateau.id/currentScale*L.current.amplitude+21+(topology.id==='threeBridge'&&[1,3,5].includes(j)?16:0),9,phaseColors[topology.colors[j]]);}
  if(L.input){
    axes(L.input,currentScale);label(c,topology.phases===1?'i_2':'i_a, i_b, i_c',0,L.input.y+11,topology.phases===1?12:10);label(c,'A',6,L.input.y+29,10,muted);
    for(let j=0;j<topology.phases;j++)path(L.input,currentScale,s=>s.phaseCurrents?.[j]??null,phaseColors[j],false,1.8);
  }
  axes(L.valve,valveScale);label(c,'u_VT1',0,L.valve.y+11,12);label(c,'V',6,L.valve.y+29,10,muted);
  path(L.valve,valveScale,s=>s.valveVoltages?s.valveVoltages[0]:s.mask&1?0:s.u[0]-s.ud,phaseColors[0],false,1.9);
  for(let t=0;t<=range;t+=range===720?90:60){c.textAlign=t===0?'left':t===range?'right':'center';label(c,L.timeAxis?(t/360/result.p.f*1000).toFixed(1):(t+'°'),x(t),L.bottom+22,11,muted);}c.textAlign='left';
  label(c,L.timeAxis?'t / ms':'ωt',end-35,L.bottom+41,10,muted);
  c.strokeStyle='#e4eadd';c.lineWidth=.8;c.beginPath();c.moveTo(0,L.gatesY-5);c.lineTo(width,L.gatesY-5);c.stroke();label(c,'u_g',4,L.gatesY+13,12);label(c,`触发脉冲 · 宽度 ${result.p.pulseWidth}°`,left,L.gatesY+13,10,muted);
  for(let j=0;j<topology.valves;j++){
    const zero=L.gateFirst+28*j;label(c,'g'+(j+1),10,zero-2,11,phaseColors[topology.colors[j]]);c.strokeStyle='#e1e8d9';c.beginPath();c.moveTo(left,zero);c.lineTo(end,zero);c.stroke();
    c.beginPath();let previous=false;c.moveTo(left,zero);
    for(let i=0;i<data.length;i++){const s=data[i],on=Boolean(s.gates&(1<<j));if(on!==previous||i===0){const xx=x(s.angle);c.lineTo(xx,previous?zero-13:zero);c.lineTo(xx,on?zero-13:zero);previous=on;}}
    c.lineTo(end,previous?zero-13:zero);c.strokeStyle=phaseColors[topology.colors[j]];c.lineWidth=1.6;c.stroke();
  }
  if(result.limited&&result.limitAngle<=range){c.fillStyle='#fcfdf9dd';c.fillRect(x(result.limitAngle),20,end-x(result.limitAngle),L.bottom-20);label(c,'多重短路支路的电流分配不唯一，后段留空',left+5,L.ud.y+174,10,'#b86350');}
}
export function drawInverterProbe(c,L,result,angle){
  const x=L.left+angle/L.range*(L.width-L.left-L.right),s=inverterSample(result,angle);
  c.strokeStyle='#b79677';c.lineWidth=1;c.setLineDash([2,3]);c.beginPath();c.moveTo(x,20);c.lineTo(x,L.bottom);c.moveTo(x,L.gatesY+20);c.lineTo(x,L.height-12);c.stroke();c.setLineDash([]);
  const dot=(y,color)=>{c.fillStyle=color;c.beginPath();c.arc(x,y,3,0,Math.PI*2);c.fill();};
  if(s.ud===null)return;
  dot(L.ud.zero-s.ud/L.voltageScale*L.ud.amplitude,ink);
  const topology=inverterTopology(result.p.circuit);
  for(let j=0;j<topology.valves;j++)dot(L.current.zero-s.currents[j]/L.currentScale*L.current.amplitude,phaseColors[topology.colors[j]]);
  if(L.input)for(let j=0;j<topology.phases;j++)dot(L.input.zero-s.phaseCurrents[j]/L.currentScale*L.input.amplitude,phaseColors[j]);
}
