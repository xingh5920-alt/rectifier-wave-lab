import {currentFlowSVG} from './dc-inverter-flow.js';
const ink='#89987d',on='#23845a';
const phase=['#c84a44','#188768','#3979d2'];
const label=(x,y,s,size=18,color='#506446',anchor='middle')=>{
  const math=s.match(/^([A-Za-z]+)_([A-Za-z0-9]+)(\/2)?$/),valve=s.match(/^(VT|VD|V)([1-6])$/);
  const m=math??valve;
  const text=m?`<tspan font-style="italic">${m[1]}</tspan><tspan dy="${size*.22}" font-size="${size*.72}">${m[2]}</tspan>${m[3]?`<tspan dy="${-size*.22}">${m[3]}</tspan>`:''}`:s;
  return `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" style="fill:${color}">${text}</text>`;
};
const path=(d,color=ink,width=2)=>`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const dot=(x,y,color=ink)=>`<circle cx="${x}" cy="${y}" r="3.5" fill="${color}"/>`;
const cap=(x,y,name,vertical=false)=>vertical?
  path(`M${x} ${y-27}V${y-7}M${x-18} ${y-7}H${x+18}M${x-18} ${y+7}H${x+18}M${x} ${y+7}V${y+27}`)+label(x+25,y+5,name,16,undefined,'start'):
  path(`M${x-25} ${y}H${x-6}M${x-6} ${y-13}V${y+13}M${x+6} ${y-13}V${y+13}M${x+6} ${y}H${x+25}`)+label(x,y-19,name,16);
const coil=(x,y,name,vertical=false)=>{
  let d=vertical?`M${x} ${y-24}`:`M${x-24} ${y}`;
  for(let k=0;k<4;k++)d+=vertical?`a6 6 0 0 1 0 12`:`a6 6 0 0 1 12 0`;
  return path(d)+(name?label(vertical?x-16:x,vertical?y+5:y-16,name,15,undefined,vertical?'end':'middle'):'');
};
const resistor=(x,y,name='R')=>path(`M${x-30} ${y}H${x-18}M${x+18} ${y}H${x+30}`)+`<rect x="${x-18}" y="${y-8}" width="36" height="16" fill="#fafcf5" stroke="${ink}" stroke-width="2"/>`+(name?label(x,y-15,name,15):'');
function device(x,y,name,active,kind='igbt',up=false){
  const color=active?on:ink,w=active?3:2;
  let shape;
  if(kind==='diode'||kind==='thyristor'){
    shape=path(`M${x} ${y-28}V${y-9}M${x} ${y+9}V${y+28}`,color,w);
    shape+=`<path d="M${x-10} ${y-9}L${x+10} ${y-9}L${x} ${y+9}Z" fill="${active?'#e4f1e6':'#fcfdf9'}" stroke="${color}" stroke-width="${w}"/>`;
    shape+=path(`M${x-12} ${y+9}H${x+12}`,color,w);
    if(kind==='thyristor')shape+=path(`M${x+24} ${y+22}L${x+7} ${y+8}`,color,w);
    if(up)shape=`<g transform="rotate(180 ${x} ${y})">${shape}</g>`;
  }else{
    shape=path(`M${x} ${y-28}V${y-15}L${x-8} ${y-7}M${x-8} ${y-13}V${y+13}M${x-8} ${y+7}L${x} ${y+15}V${y+28}M${x-17} ${y-13}V${y+13}M${x-30} ${y}H${x-17}`,color,w);
    shape+=`<path d="M${x-4} ${y+6}L${x+1} ${y+15}L${x-8} ${y+11}Z" fill="${color}"/>`;
  }
  return `<g data-device="${name}">${shape}${kind==='diode'?label(x+17,y+5,name,16,color,'start'):label(x-28,y-17,name,18,color,'end')}</g>`;
}
const terminals=(maxX,bottom=430,ld=false)=>path(`${ld?'M38 60H55M103 60H'+maxX:'M38 60H'+maxX}M38 ${bottom}H${maxX}`)+`<circle cx="38" cy="60" r="5" fill="#fcfdf9" stroke="${ink}" stroke-width="2"/><circle cx="38" cy="${bottom}" r="5" fill="#fcfdf9" stroke="${ink}" stroke-width="2"/>`+label(23,61,'+',20)+label(23,bottom+4,'−',20)+label(35,(60+bottom)/2,'U_d',19);
const arrow=(x,y,text,reverse=false,color=on)=>path(`M${x} ${y}h${reverse?-70:70}`,color,2)+`<path d="M${x+(reverse?-70:70)} ${y}l${reverse?10:-10} -5v10Z" fill="${color}"/>`+label(x+(reverse?-35:35),y-10,text,16,color);
function half(s){
  let out=terminals(365,420),a=s.active;
  out+=path('M130 60V116M130 170V276M130 330V420')+cap(130,143,'C₁',true)+cap(130,303,'C₂',true);
  out+=label(72,151,'U_d/2',16)+label(72,311,'U_d/2',16)+dot(130,230)+label(111,247,"N′",16);
  out+=path('M320 60V102M320 158V292M320 348V420');
  out+=device(320,130,'V1',a.includes('V1'))+device(320,320,'V2',a.includes('V2'));
  for(const [y,n]of[[130,1],[320,2]]){
    out+=path(`M320 ${y-40}H370V${y-28}M370 ${y+28}V${y+40}H320`);
    out+=device(370,y,'VD'+n,a.includes('VD'+n),'diode',true);
  }
  out+=path('M130 230H161M221 230H231M279 230H320',Math.abs(s.io)>1e-8?on:ink)+resistor(191,230)+coil(255,230,'L');
  out+=dot(320,230)+arrow(305,203,'i_o',true)+arrow(305,266,'u_o',true,'#3979d2');
  return out+label(250,459,'参考方向：从桥臂中点流向 N′',15);
}
function full(s,csi=false){
  const a=s.active;let out=terminals(535,csi?450:430,csi);
  if(!csi)out+=path('M80 60V208M80 262V430')+cap(80,235,'C',true);
  else out+=path('M38 60H55M103 60H535')+coil(79,60,'L_d')+arrow(120,38,'I_d');
  const names=csi?['VT1','VT2','VT3','VT4']:['V1','V2','V3','V4'];
  for(const [x,top,bottom]of[[195,0,1],[505,2,3]]){
    out+=path(`M${x} 60V${csi?92:105}M${x} ${csi?148:161}V${csi?171:309}M${x} ${csi?419:365}V${csi?450:430}`);
    out+=device(x,csi?120:133,names[top],a.includes(names[top]),csi?'thyristor':'igbt');
    out+=device(x,csi?391:337,names[bottom],a.includes(names[bottom]),csi?'thyristor':'igbt');
    if(csi){
      out+=coil(x,195,'L_T'+(top+1),true)+coil(x,319,'L_T'+(bottom+1),true)+path(`M${x} 219V295M${x} 343V363`);
    }else{
      for(const [y,n]of[[133,top+1],[337,bottom+1]]){
        out+=path(`M${x} ${y-43}H${x+42}V${y-28}M${x+42} ${y+28}V${y+43}H${x}`);
        out+=device(x+42,y,'VD'+n,a.includes('VD'+n),'diode',true);
      }
    }
    out+=dot(x,247);
  }
  if(csi){
    out+=path('M195 247V225H325M375 225H505V247')+cap(350,225,'C');
    out+=path('M195 247V282H245M305 282H380M428 282H505V247')+resistor(275,282)+coil(404,282,'L');
    out+=arrow(220,197,'i_o')+arrow(320,312,'u_o',false,'#3979d2');
    out+=label(350,484,'C 与串联 R-L 支路并联',16)+label(350,510,'L_d 足够大：直流电流近似恒定',15);
  }else{
    out+=path('M195 247H295M355 247H385M433 247H505',Math.abs(s.io)>1e-8?on:ink)+resistor(325,247)+coil(409,247,'L');
    out+=arrow(260,208,'i_o')+arrow(332,286,'u_o',false,'#3979d2');
    out+=label(350,474,'V1/V2 同桥臂；V3/V4 同桥臂',16);
  }
  return out;
}
function three(s,csi=false){
  const a=s.active,cols=[190,330,470],tops=[1,3,5],bottoms=[4,6,2],ys=[255,280,305];
  let out=terminals(500,csi?492:422,csi);
  if(csi)out+=path('M38 60H55M103 60H500')+coil(79,60,'L_d')+arrow(108,35,'I_d');
  else {
    out+=path('M105 60V126M105 180V276M105 330V422')+cap(105,153,'C₁',true)+cap(105,303,'C₂',true);
    out+=dot(105,238)+label(80,247,"N′",17)+label(60,174,'U_d/2',14)+label(60,332,'U_d/2',14);
  }
  for(let k=0;k<3;k++){
    const x=cols[k],top=tops[k],bottom=bottoms[k],y=ys[k],colour=phase[k];
    if(csi){
      out+=path(`M${x} 60V92M${x} 148V177M${x} 233V317M${x} 373V402M${x} 458V492`);
      out+=device(x,120,'VT'+top,a.includes('VT'+top),'thyristor')+device(x,205,'VD'+top,a.includes('VD'+top),'diode');
      out+=device(x,345,'VD'+bottom,a.includes('VD'+bottom),'diode')+device(x,430,'VT'+bottom,a.includes('VT'+bottom),'thyristor');
    }else{
      out+=path(`M${x} 60V110M${x} 166V322M${x} 378V422`);
      out+=device(x,138,'V'+top,a.includes('V'+top))+device(x,350,'V'+bottom,a.includes('V'+bottom));
      for(const [cy,n]of[[138,top],[350,bottom]]){
        out+=path(`M${x} ${cy-42}H${x+45}V${cy-28}M${x+45} ${cy+28}V${cy+42}H${x}`);
        out+=device(x+45,cy,'VD'+n,a.includes('VD'+n),'diode',true);
      }
    }
    out+=dot(x,y,colour)+path(`M${x} ${y}H${csi?664:565}`,colour,Math.abs(s.i[k])>1e-8?2.6:1.6);
    out+=label(530,y-7,['U','V','W'][k],17,colour);
    if(!csi)out+=resistor(595,y,k===0?'R':'')+coil(651,y,k===0?'L':'')+path(`M625 ${y}H627M675 ${y}H719`,colour);
  }
  if(csi){
    for(const [y,names]of[[162,['C₁','C₃']],[382,['C₄','C₆']]]){
      for(let k=0;k<2;k++)out+=path(`M${cols[k]} ${y}H${260+k*140-25}M${260+k*140+25} ${y}H${cols[k+1]}`)+cap(260+k*140,y,names[k]);
    }
    out+=path('M190 162V187H305M355 187H470V162')+cap(330,187,'C₅');
    out+=path('M190 382V402H305M355 402H470V382')+cap(330,402,'C₂');
    out+=`<circle cx="700" cy="280" r="37" fill="#f2f6ed" stroke="${ink}" stroke-width="2"/>`+label(700,277,'M',26)+label(700,299,'3~',18);
    out+=path('M664 255L671 260M664 280H663M664 305L671 300');
    out+=label(662,353,'R-L + 反电势',15)+label(380,530,'换流电容 C₁～C₆ 位于桥臂之间',17);
  }else{
    out+=path('M719 255V305')+dot(719,280)+label(731,286,'N',20,undefined,'start');
    out+=label(380,460,'N 为浮置负载星点，与 N′ 不相连',17);
  }
  return out;
}
export function circuitSVG(type,s,p,showFlow=true){
  const isThree=type==='threeV'||type==='threeI',width=isThree?760:600,height=type==='threeI'?550:type==='parallel'?530:490;
  const body=type==='half'?half(s):isThree?three(s,type==='threeI'):full(s,type==='parallel');
  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${type==='threeI'?'三相串联二极管式电流型':type==='parallel'?'单相并联谐振电流型':type==='threeV'?'三相桥式电压型':type==='half'?'单相半桥电压型':'单相全桥电压型'}逆变电路，绿色为当前导通器件${showFlow?'，流动箭头表示当前实际电流方向':''}"><rect width="${width}" height="${height}" fill="#fcfdf9"/>${body}${showFlow?currentFlowSVG(type,s):''}</svg>`;
}
