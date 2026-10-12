export const defaultFlowMotion=()=>!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const playbackRate=value=>Number(value)===.5?.5:1;
export const advancePlayback=(cursor,elapsed,rate,period,range)=>(cursor+Math.max(0,Math.min(100,elapsed))*360*playbackRate(rate)/period)%range;
export function withPlaybackRate(url,rate){
  if(playbackRate(rate)===1)return url;
  const [base,hash]=url.split('#'),at=base.indexOf('?'),path=at<0?base:base.slice(0,at),query=new URLSearchParams(at<0?'':base.slice(at+1));
  query.set('speed',String(playbackRate(rate)));return path+'?'+query+(hash?'#'+hash:'');
}

// Touch movement belongs to native page/viewport scrolling. A completed tap
// selects a probe; mouse/pen dragging still scrubs the waveform immediately.
export function bindProbeGestures(canvas,{pause,point,isPlaying}){
  let touch=null,dragging=false;
  canvas.addEventListener('pointerdown',event=>{
    if(event.pointerType==='touch'){
      if(event.isPrimary===false||touch){touch=null;return;}
      touch={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};return;
    }
    if(event.button!==undefined&&event.button!==0)return;
    pause();dragging=true;canvas.setPointerCapture?.(event.pointerId);point(event);
  });
  canvas.addEventListener('pointermove',event=>{
    if(event.pointerType==='touch'){
      if(touch?.id===event.pointerId&&Math.hypot(event.clientX-touch.x,event.clientY-touch.y)>8)touch.moved=true;
      return;
    }
    if(dragging||event.pointerType==='mouse'&&!isPlaying())point(event);
  });
  canvas.addEventListener('pointerup',event=>{
    if(event.pointerType==='touch'){
      const tap=touch?.id===event.pointerId&&!touch.moved&&Math.hypot(event.clientX-touch.x,event.clientY-touch.y)<=8;
      touch=null;if(tap){pause();point(event);}return;
    }
    dragging=false;
  });
  canvas.addEventListener('pointercancel',()=>{touch=null;dragging=false;});
  canvas.addEventListener('lostpointercapture',()=>dragging=false);
}

export function syncSvgPlayback(container,playing){
  // Flow is an illustrative tracer at the selected instant, independent of
  // waveform time. CSS motion keeps working when the waveform is paused.
  container.setAttribute?.('data-flow-running',String(playing));
}

export function renderFlowSegments(segments,rate=1,feedback=false){
  const duration=.45/playbackRate(rate);
  const paths=segments.map(({id,points,color})=>{
    const last=points.at(-1),prev=points.at(-2),dx=last[0]-prev[0],dy=last[1]-prev[1],length=Math.hypot(dx,dy);
    const still=`translate(${last[0]-dx/length*7} ${last[1]-dy/length*7}) rotate(${Math.atan2(dy,dx)*180/Math.PI})`;
    const d=points.map(([x,y],k)=>(k?'L':'M')+x+' '+y).join(' ');
    return `<g data-flow="${id}" data-flow-path="${d}" fill="none" stroke="${feedback?'#d65e19':color}" stroke-linecap="round" stroke-linejoin="round"><path d="${d}" stroke-width="7" opacity="${/device|load-[RL]$|phase-load/.test(id)?0:.15}"/><path class="dc-flow-stream" d="${d}" stroke-width="6" stroke-dasharray="1 21"/><path class="dc-flow-direction" d="M-5 -4L1 0L-5 4" stroke-width="2.5" transform="${still}"/></g>`;
  }).join('');
  return `<g class="dc-current-flow" data-flow-mode="${feedback?'feedback':'supply'}" style="--flow-duration:${duration}s" pointer-events="none" aria-hidden="true">${paths}</g>`;
}
