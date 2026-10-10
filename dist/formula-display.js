import {formula,metrics,isFiniteLoad,hasPeriodicCommutation} from './model.js';

const mi=value=>`<mi>${value}</mi>`;
const mn=value=>`<mn>${value}</mn>`;
const mo=value=>`<mo>${value}</mo>`;
const group=value=>`<mrow>${value}</mrow>`;
const sub=(base,index)=>`<msub>${mi(base)}<mi mathvariant="normal">${index}</mi></msub>`;
const u2=`<msub>${mi('U')}${mn(2)}</msub>`;
const root=value=>`<msqrt>${mn(value)}</msqrt>`;
const fraction=(numerator,denominator)=>`<mfrac>${group(numerator)}${group(denominator)}</mfrac>`;
const alpha=mi('α');
const cos=argument=>`<mi mathvariant="normal">cos</mi><mo>&#x2061;</mo>${argument}`;
const bracket=(value,left='(',right=')')=>group(`${mo(left)}${value}${mo(right)}`);
const onePlusCos=(offset=0)=>bracket(`${mn(1)}${mo('+')}${cos(offset?bracket(`${alpha}${mo('+')}${mn(offset)}${mo('°')}`):alpha)}`,offset?'[':'(',offset?']':')');

export function formulaMarkup(p){
  if(isFiniteLoad(p)){
    const math=(value,label)=>`<math xmlns="http://www.w3.org/1998/Math/MathML" display="inline" aria-label="${label}"><mstyle displaystyle="true">${group(value)}</mstyle></math>`;
    const derivative=fraction(`<mi mathvariant="normal">d</mi>${sub('i','d')}`,`<mi mathvariant="normal">d</mi>${mi('t')}`);
    const instantaneous=sub('u','d')+mo('=')+mi('R')+sub('i','d')+mo('+')+mi('L')+derivative+(p.load==='rle'?mo('+')+mi('E'):'');
    const current=sub('I','d')+mo('=')+fraction(sub('U','d')+(p.load==='rle'?mo('−')+mi('E'):''),mi('R'));
    const m=metrics(p);
    const condition=hasPeriodicCommutation(p)?`<span class="formula-condition">当前电流连续并周期性换相，平均电压：</span>${formulaMarkup({...p,load:'l'})}`:`<span class="formula-condition">${explanationMarkup(m.continuous?'当前电流连续，导通路径可跨周期保持，平均值由稳态波形计算。':m.conducting?'当前电流断续，平均值由稳态波形计算。':'当前未导通：i_d = 0，u_d = '+(p.load==='rle'?'E。':'0。'))}</span>`;
    return `<span class="formula-expression formula-load-law">${math(instantaneous,formula(p).split('；')[0])}</span><span class="formula-expression">${math(current,formula(p).split('；')[1])}</span>${condition}`;
  }
  let numerator,denominator=mi('π'),factor,approximation='';
  if(p.circuit==='half'){
    numerator=root(2)+u2;denominator=mn(2)+mi('π');factor=onePlusCos();
  }else if(p.circuit==='bridge'){
    numerator=(p.load==='l'?mn(2):'')+root(2)+u2;factor=p.load==='l'?cos(alpha):onePlusCos();
  }else if(p.circuit==='semi'){
    numerator=root(2)+u2;factor=onePlusCos();
  }else if(p.circuit==='threeHalf'){
    denominator=mn(2)+mi('π');
    if(p.load==='r'&&p.alpha>30){numerator=mn(3)+root(2)+u2;factor=onePlusCos(30);}
    else{numerator=mn(3)+root(6)+u2;factor=cos(alpha);approximation=mn('1.17')+u2+cos(alpha);}
  }else{
    numerator=mn(3)+root(6)+u2;
    if(p.load==='r'&&p.alpha>60)factor=onePlusCos(60);
    else{factor=cos(alpha);approximation=mn('2.34')+u2+cos(alpha);}
  }
  const accessible=formula(p).split(' ≈ ');
  const math=(contents,label)=>`<math xmlns="http://www.w3.org/1998/Math/MathML" display="inline" aria-label="${label}"><mstyle displaystyle="true">${group(contents)}</mstyle></math>`;
  const exact=sub('U','d')+mo('=')+fraction(numerator,denominator)+mo('⋅')+factor;
  return `<span class="formula-expression">${math(exact,accessible[0])}</span>${approximation?`<span class="formula-approximation">${math(mo('≈')+approximation,'约等于 '+accessible[1])}</span>`:''}`;
}

const subscripts={'₀':'0','₁':'1','₂':'2','₃':'3','₄':'4','₅':'5','₆':'6','₇':'7','₈':'8','₉':'9','ₐ':'a','ᵦ':'b','꜀':'c'};
function notationMarkup(value,symbol,device){
  const normalized=value.replace(/([uUiILE])([₀₁₂₃₄₅₆₇₈₉ₐᵦ꜀]+)/g,(_,base,index)=>base+'_'+[...index].map(ch=>subscripts[ch]).join('')).replace(/\buVT(\d+)\b/g,'u_VT$1');
  const escaped=normalized.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  return escaped.replace(/\b([uUiILE])_(VT\d+|d(?:\d|,rms)?|AC|[abc]{1,2}|\d+|B|M)\b|\b(VT|D)(\d+)\b/g,(_,base,index,name,number)=>base?symbol(base,index):device(name,number));
}
export function explanationMarkup(value){
  return notationMarkup(value,(base,index)=>`<span class="math-inline">${base}<sub>${index}</sub></span>`,(name,index)=>`<span class="device-symbol">${name}<sub>${index}</sub></span>`);
}
export function svgNotationMarkup(value){
  return notationMarkup(value,(base,index)=>`<tspan class="svg-math-base">${base}</tspan><tspan class="svg-subscript" baseline-shift="sub">${index}</tspan>`,(name,index)=>`${name}<tspan class="svg-subscript" baseline-shift="sub">${index}</tspan>`);
}
