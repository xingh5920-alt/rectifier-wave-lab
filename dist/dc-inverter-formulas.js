// Native MathML keeps equations local and readable in Safari, including fractions.
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function notationHTML(value){
  return value.replace(/\b([uUiIpEStCL])_([A-Za-z0-9′]+(?:,rms)?|[αβγ])|φ_([A-Za-z]+)/g,(_,base,index,phi)=>`<span class="dc-math">${base??'φ'}<sub>${index??phi}</sub></span>`);
}
export const inlineNotation=value=>notationHTML(esc(value));
const mi=s=>`<mi>${esc(s)}</mi>`,mn=s=>`<mn>${s}</mn>`,mo=s=>`<mo>${esc(s)}</mo>`,row=s=>`<mrow>${s}</mrow>`;
const sub=(base,index)=>`<msub>${mi(base)}<mtext>${esc(index)}</mtext></msub>`;
const frac=(a,b)=>`<mfrac>${row(a)}${row(b)}</mfrac>`;
const root=s=>`<msqrt>${row(s)}</msqrt>`;
const bracket=s=>row(mo('(')+s+mo(')'));
const derivative=s=>frac(mi('d')+s,mi('d')+mi('t'));
const sin=s=>`<mi mathvariant="normal">sin</mi><mo>&#x2061;</mo>`+bracket(s);
const eq=(s,label)=>`<div class="dc-equation"><math xmlns="http://www.w3.org/1998/Math/MathML" display="inline" aria-label="${esc(label)}"><mstyle displaystyle="true">${row(s)}</mstyle></math></div>`;
export function dcFormulaMarkup(type,p){
  const ud=sub('U','d'),uo=sub('u','o'),io=sub('i','o'),rms=sub('U','o,rms'),fund=sub('U','o1,rms'),theta=mi('θ');
  if(type==='half')return eq(uo+mo('=')+mo('±')+frac(ud,mn(2)),'输出电压等于正负直流电压的一半')+eq(rms+mo('=')+frac(ud,mn(2)),'输出电压有效值等于直流电压的一半')+eq(fund+mo('=')+frac(root(mn(2))+ud,mi('π')),'基波电压有效值等于根号2乘直流电压除以π');
  if(type==='full'&&p.theta===180)return eq(uo+mo('=')+mo('±')+ud,'输出电压等于正负直流电压')+eq(rms+mo('=')+ud,'输出电压有效值等于直流电压')+eq(fund+mo('=')+frac(mn(2)+root(mn(2))+ud,mi('π')),'基波电压有效值等于2根号2乘直流电压除以π');
  if(type==='phase'||type==='full')return eq(uo+mo('∈')+mo('{')+mo('+')+ud+mo(',')+mn(0)+mo(',')+mo('−')+ud+mo('}'),'输出电压为正直流电压、零或负直流电压')+eq(rms+mo('=')+ud+root(frac(theta,mn(180)+mo('°'))),'输出电压有效值等于直流电压乘根号下θ除以180度')+eq(fund+mo('=')+frac(mn(2)+root(mn(2))+ud,mi('π'))+sin(frac(theta,mn(2))),'基波电压有效值等于2根号2乘直流电压除以π，再乘sin(θ/2)，θ以度计');
  if(type==='threeV'){
    const pole=s=>sub('u',s+'N′'),neutral=sub('u','NN′');
    return eq(pole('U')+mo('=')+bracket(mn(2)+sub('S','U')+mo('−')+mn(1))+frac(ud,mn(2)),'U相极点电压')+eq(neutral+mo('=')+frac(pole('U')+mo('+')+pole('V')+mo('+')+pole('W'),mn(3)),'浮置星点电压等于三相极点电压的平均值')+eq(sub('u','UN')+mo('=')+pole('U')+mo('−')+neutral,'负载相电压')+eq(sub('u','UV')+mo('=')+pole('U')+mo('−')+pole('V'),'线电压')+eq(sub('U','UV,rms')+mo('=')+root(frac(mn(2),mn(3)))+ud,'线电压有效值等于根号下2/3乘直流电压')+eq(sub('U','UV1,rms')+mo('=')+frac(root(mn(6))+ud,mi('π')),'线电压基波有效值等于根号6乘直流电压除以π');
  }
  if(type==='parallel'){
    const il=sub('i','RL');
    return eq(mi('C')+derivative(uo)+mo('=')+io+mo('−')+il,'电容电压微分关系')+eq(mi('L')+derivative(il)+mo('=')+uo+mo('−')+mi('R')+il,'电感支路电流微分关系')+eq(sub('t','s')+mo('=')+sub('t','γ')+mo('+')+sub('t','β'),'触发引前时间等于换流时间加反压时间')+eq(mi('φ')+mo('=')+frac(mi('γ'),mn(2))+mo('+')+mi('β'),'电流超前角')+eq(sub('t','β')+mo('>')+sub('t','q'),'可靠关断需要反压时间大于晶闸管关断时间');
  }
  const ik=sub('i','k');
  return eq(sub('i','U')+mo('+')+sub('i','V')+mo('+')+sub('i','W')+mo('=')+mn(0),'三相电流之和为零')+'<p class="dc-formula-note">每相正、负导通各 120°；以下基波关系忽略换流重叠角 γ。</p>'+eq(sub('I','U1,rms')+mo('≈')+frac(root(mn(6)),mi('π'))+sub('I','d')+mo('≈')+mn('0.78')+sub('I','d'),'每相基波电流有效值约为0.78倍直流电流')+eq(sub('u','k')+mo('=')+mi('R')+ik+mo('+')+mi('L')+derivative(ik)+mo('+')+sub('E','m')+sin(mi('ω')+mi('t')+mo('+')+sub('φ','k')),'每相电压等于电阻压降、电感压降及反电势之和')+eq(sub('u','UV')+mo('=')+sub('u','U')+mo('−')+sub('u','V'),'线电压为相电压之差')+'<p class="dc-formula-note">各相反电势相位相差 120°。</p>';
}
