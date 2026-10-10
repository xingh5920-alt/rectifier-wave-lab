export const phaseColors=['#c84643','#16825d','#326fd1'];
export const inverterCircuits=[
  {id:'bridge',name:'单相全控桥',phases:1,valves:4,natural:0,spacing:180,colors:[0,0,2,2],currentLabels:['i_VT1 = i_VT2','i_VT3 = i_VT4'],lbLabel:'交流侧总电感 L_B',uLabel:'交流输入有效值 U₂'},
  {id:'threeHalf',name:'三相半波',phases:3,valves:3,natural:30,spacing:120,colors:[0,1,2],lbLabel:'每相交流侧电感 L_B',uLabel:'相电压有效值 U₂'},
  {id:'threeBridge',name:'三相全控桥',phases:3,valves:6,natural:30,spacing:60,colors:[0,2,1,0,2,1],lbLabel:'每相交流侧电感 L_B',uLabel:'相电压有效值 U₂'}
];
export const inverterTopology=circuit=>inverterCircuits.find(c=>c.id===circuit)??inverterCircuits[1];
export function inverterPreset(circuit='threeHalf'){
  const common={circuit,alpha:140,u2:100,f:50,l:50000,r:2,pulseWidth:10};
  return {...common,...(circuit==='bridge'?{lb:1,e:-100}:circuit==='threeBridge'?{lb:2,e:-240}:{lb:4,e:-125})};
}
export const eventIncoming=event=>event.incomingValves??[event.incoming];
export const eventName=event=>event.outgoing.map(j=>'VT'+(j+1)).join('+')+' → '+eventIncoming(event).map(j=>'VT'+(j+1)).join('+');
