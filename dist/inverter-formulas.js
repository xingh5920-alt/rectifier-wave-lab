const mi=s=>`<mi>${s}</mi>`,mn=s=>`<mn>${s}</mn>`,mo=s=>`<mo>${s}</mo>`,row=s=>`<mrow>${s}</mrow>`;
const sub=(base,index)=>`<msub>${mi(base)}<mtext>${index}</mtext></msub>`;
const frac=(a,b)=>`<mfrac>${row(a)}${row(b)}</mfrac>`;
const derivative=s=>frac(`<mi mathvariant="normal">d</mi>${s}`,`<mi mathvariant="normal">d</mi>${mi('t')}`);
const math=s=>`<math display="block"><mstyle displaystyle="true">${row(s)}</mstyle></math>`;
const card=(title,s,cls='')=>`<div class="inv-equation ${cls}"><h3>${title}</h3>${math(s)}</div>`;
export function inverterFormulaMarkup(p){
  const id=sub('i','d'),lb=sub('L','B'),phase=sub('i','j'),voltage=sub('u','j'),single=p.circuit==='bridge',half=p.circuit==='threeHalf';
  const sum=valves=>valves.map(j=>sub('i','VT'+j)).join(mo('+'));
  const lines=single?[id+mo('=')+sum([1,3]),sub('i','2')+mo('=')+sub('i','VT1')+mo('−')+sub('i','VT3'),`${sub('i','VT1')}${mo('=')}${sub('i','VT2')}${mo('，')}${sub('i','VT3')}${mo('=')}${sub('i','VT4')}`]:half?[id+mo('=')+sum([1,2,3])]:[id+mo('=')+sum([1,3,5]),id+mo('=')+sum([4,6,2])];
  const currents=`<mtable columnalign="left" rowspacing=".5em">${lines.map(s=>`<mtr><mtd>${row(s)}</mtd></mtr>`).join('')}</mtable>`;
  const source=single?lb+derivative(sub('i','2'))+mo('=')+sub('u','2')+mo('−')+sub('u','AC'):lb+derivative(phase)+mo('=')+voltage+mo('−')+(half?sub('u','d'):sub('v','j'));
  const load=mi('L')+derivative(id)+mo('=')+sub('u','d')+mo('−')+mi('R')+id+mo('−')+mi('E');
  const coefficient=frac((single?mn(2):mn(3))+`<msqrt>${mn(single?2:6)}</msqrt>`,(half?mn(2):'')+mi('π'));
  const mean=sub('U','d')+mo('≈')+coefficient+sub('U','2')+`<mi mathvariant="normal">cos</mi><mo>&#x2061;</mo>${mi('α')}`+mo('−')+mn(single?4:half?3:6)+mi('f')+lb+sub('I','d');
  return card('器件电流关系',currents,'inv-equation-current')+card(single?'交流侧总电感':'每相交流侧电感',source)+card('负载侧回路',load)+card('连续电流、极大电感时的平均关系（L_B 单位为 H）',mean,'inv-equation-mean');
}
