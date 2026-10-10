import {phaseColors,inverterTopology} from './inverter-topologies.js';
import {svgNotationMarkup} from './formula-display.js';
const text=(x,y,value,size=12,color='#728867')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" stroke="none">${svgNotationMarkup(value)}</text>`;
function branch(x1,y1,x2,y2,j,s,color,lx,ly){
  const on=Boolean(s.mask&(1<<j)),angle=Math.atan2(y2-y1,x2-x1)*180/Math.PI;
  return `<g stroke="${color}" stroke-width="${on?3:1.6}" opacity="${on?1:.45}"><path d="M${x1} ${y1}L${x2} ${y2}"/><g transform="translate(${(x1+x2)/2} ${(y1+y2)/2}) rotate(${angle})"><path fill="#fcfdf9" d="M-12 -9L8 0L-12 9ZM9 -11V11M9 5L20 16"/></g></g>`+text(lx,ly,'VT'+(j+1),12,color);
}
function load(x,top,bottom,s){
  const color=s.mask?'#477d4d':'#aab69f',ey=bottom-37;
  return `<g stroke="${color}" stroke-width="2"><path d="M${x} ${top}v22m0 36v25m0 26v${ey-14-top-109}m0 28V${bottom}"/><path d="M${x} ${top+22}c-14 0-14 12 0 12c-14 0-14 12 0 12c-14 0-14 12 0 12"/><rect x="${x-8}" y="${top+83}" width="16" height="26"/><circle cx="${x}" cy="${ey}" r="14"/><path d="M${x+40} ${top+24}V${bottom-21}m-4 -6 4 6 4-6"/></g>`+text(x+15,top+46,'L')+text(x+15,top+101,'R')+text(x-5,ey+4,'M')+text(x+16,ey+3,'|E_M|',11)+text(x-26,ey-5,'−',14)+text(x-26,ey+10,'+',14)+text(x+45,(top+bottom)/2,'u_d',11)+text(x+9,top+16,'+',12)+text(x+9,bottom-7,'−',12);
}
export function inverterCircuitSvg(s,p){
  if(p.circuit==='threeHalf')return halfWaveSvg(s);
  const topology=inverterTopology(p.circuit);
  let svg=`<svg viewBox="0 0 550 325" role="img" aria-label="${topology.name}有源逆变主电路及当前导通路径"><g fill="none" stroke-linecap="round" stroke-linejoin="round" font-family="system-ui">`;
  const green=s.mask?'#477d4d':'#aab69f';
  if(p.circuit==='bridge'){
    svg+=branch(116,147,258,40,0,s,phaseColors[0],141,78)+branch(368,147,258,40,2,s,phaseColors[2],306,78)+branch(258,264,116,147,3,s,phaseColors[2],138,237)+branch(258,264,368,147,1,s,phaseColors[0],306,237);
    svg+=`<g stroke="#8a9f85" stroke-width="1.7"><path d="M116 147h24m44 0h40m42 0h102"/><path d="M140 147c0 -12 11 -12 11 0c0 -12 11 -12 11 0c0 -12 11 -12 11 0c0 -12 11 -12 11 0"/><circle cx="245" cy="147" r="21"/><path d="M233 147q6 -11 12 0t12 0"/></g>`+text(145,122,'L_B',12)+text(224,185,'u_2',13);
    svg+=`<g stroke="${green}" stroke-width="2"><path d="M258 40H455M258 264H455"/></g>`+load(455,40,264,s)+text(31,310,'L_B 为整个交流回路的总电感',11);
  }else{
    svg+=`<g stroke="${green}" stroke-width="2"><path d="M110 39H455M110 266H455"/></g>`;
    const top=[0,2,4],bottom=[3,5,1];
    for(let phase=0;phase<3;phase++){
      const x=110+110*phase,color=phaseColors[phase];
      svg+=branch(x,151,x,39,top[phase],s,color,x+16,91)+branch(x,266,x,151,bottom[phase],s,color,x+16,228);
      svg+=`<g stroke="${color}" stroke-width="1.7"><path d="M${x-51} 151h10m30 0h11"/><path d="M${x-41} 151c0 -9 10 -9 10 0c0 -9 10 -9 10 0c0 -9 10 -9 10 0"/></g>`+text(x-64,156,['a','b','c'][phase],14,color)+text(x-36,134,'L_B',10,color);
    }
    svg+=load(455,39,266,s)+text(31,310,'U_2 为相电压有效值；L_B 为每相电感',11);
  }
  svg+=`<path d="M401 35l7 4-7 4" stroke="${green}" stroke-width="1.6"/>`+text(399,29,'i_d',11,green);
  return svg+'</g></svg>';
}
function halfWaveSvg(s){
  let svg=`<svg viewBox="0 0 530 310" role="img" aria-label="三相半波有源逆变主电路，a 相红色、b 相绿色、c 相蓝色，当前导通支路加粗"><g fill="none" stroke-linecap="round" stroke-linejoin="round">`;
  for(let j=0;j<3;j++){
    const y=56+65*j,on=Boolean(s.mask&(1<<j)),stroke=phaseColors[j];
    svg+=`<g stroke="${stroke}" stroke-width="${on?3:1.7}" opacity="${on?1:.5}"><path d="M47 ${y}H92m56 0h35m44 0h72"/><path d="M92 ${y}c0 -15 14 -15 14 0c0 -15 14 -15 14 0c0 -15 14 -15 14 0c0 -15 14 -15 14 0"/><path d="M183 ${y}h8m0 -10l20 10l-20 10zM212 ${y-12}v24m0 -4l11 11m-11 -7h15"/>${on?`<path d="M64 ${y-4}l7 4l-7 4"/>`:''}</g>`;
    svg+=`<g fill="${stroke}" stroke="none" font-family="system-ui"><text x="22" y="${y+5}" font-size="17">${['a','b','c'][j]}</text><text x="105" y="${y-20}" font-size="12">${svgNotationMarkup('L_B')}</text><text x="190" y="${y-19}" font-size="12">VT${j+1}</text></g>`;
  }
  const stroke=s.mask?'#477d4d':'#aab69f';
  svg+=`<g stroke="${stroke}" stroke-width="2"><path d="M299 56V186M299 56H331m56 0h35v46m0 30v34m0 44v57H47"/><path d="M331 56c0 -15 14 -15 14 0c0 -15 14 -15 14 0c0 -15 14 -15 14 0c0 -15 14 -15 14 0"/><rect x="413" y="102" width="18" height="30"/><circle cx="422" cy="188" r="22"/><path d="M393 52l7 4l-7 4M475 86v147m-4 -6l4 6l4 -6"/></g></g><g font-family="system-ui" fill="#728867"><text x="347" y="33" font-size="14">L</text><text x="437" y="121" font-size="13">R</text><text x="416" y="193" font-size="16">M</text><text x="390" y="181" font-size="15">−</text><text x="390" y="204" font-size="15">+</text><text x="449" y="192" font-size="12">|E_M|</text><text x="483" y="163" font-size="12">${svgNotationMarkup('u_d')}</text><text x="395" y="34" font-size="12">${svgNotationMarkup('i_d →')}</text><text x="24" y="271" font-size="15">o</text><text x="50" y="301" font-size="11">${svgNotationMarkup('E < 0：电动势沿 i_d 方向供电')}</text></g></svg>`;
  return svg;
}
