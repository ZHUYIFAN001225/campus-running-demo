import { clusterPoints, clustersMarkup, clusterZoomView } from './map-clusters.js';
const full={x:0,y:0,w:600,h:420},controllers=new WeakMap();
export const boundView=view=>{const w=Math.max(80,Math.min(600,view.w)),h=w*.7;return {x:Math.max(0,Math.min(600-w,view.x)),y:Math.max(0,Math.min(420-h,view.y)),w,h};};
export function zoomViewAt(view,factor,u=.5,v=.5){const w=Math.max(80,Math.min(600,view.w*factor)),h=w*.7;return boundView({x:view.x+u*view.w-u*w,y:view.y+v*view.h-v*h,w});}
function world(svg,x,y){const p=svg.createSVGPoint();p.x=x;p.y=y;return p.matrixTransform(svg.getScreenCTM().inverse());}
function paintClusters(svg,v){
  const layer=svg.querySelector('[data-demand-layer]'),scale=Math.abs(svg.getScreenCTM()?.a||.5),groups=layer?clusterPoints(JSON.parse(layer.dataset.points),v,v.w*scale):[];
  const unit=1/scale;
  for(const label of svg.querySelectorAll('.m-label')){label.style.fontSize=`${10*unit}px`;const x=Number(label.getAttribute('x')),y=Number(label.getAttribute('y'));label.style.visibility=groups.some(g=>Math.hypot(x-g.x,y-g.y)*scale<48)?'hidden':'';}
  for(const pin of svg.querySelectorAll('.m-pin')){pin.dataset.originTransform??=pin.getAttribute('transform');pin.setAttribute('transform',pin.dataset.originTransform+` scale(${unit})`);}
  const person=svg.querySelector('[data-current-location]');
  if(person){
    const px=(Number(person.dataset.x)-v.x)*scale,py=(Number(person.dataset.y)-v.y)*scale,label=person.querySelector('.m-location-label');
    label.style.visibility=px<0||px>v.w*scale||py<0||py>v.h*scale?'hidden':'';
    label.setAttribute('transform',`translate(${Math.max(8-px,Math.min(-48,v.w*scale-104-px))} ${py>v.h*scale-60?-54:20})`);
  }
  svg.querySelector('.m-north')?.setAttribute('transform',`translate(${v.x+v.w-68*unit} ${v.y+24*unit}) scale(${unit})`);
  const meta=svg.querySelector('.m-meta');if(meta)meta.style.visibility=v.w<500?'hidden':'';
  if(!layer)return;
  const visible=groups.filter(g=>g.x>=v.x-28*unit&&g.x<=v.x+v.w+28*unit&&g.y>=v.y-28*unit&&g.y<=v.y+v.h+28*unit);
  const signature=visible.map(g=>g.id+':'+g.count).join(';')+'@'+Math.round(scale*100);
  if(layer.dataset.signature===signature)return;
  layer.dataset.signature=signature;layer.innerHTML=clustersMarkup(visible,scale,layer.dataset.selected,layer.dataset.highlight,JSON.parse(layer.dataset.location||'null'));
  if(svg.closest('[data-point-mode="here"]')){layer.querySelectorAll('.demand-bubble').forEach(el=>el.setAttribute('aria-label',el.getAttribute('aria-label').replace(/，(?:点击放大|查看此处).*/, '，点此设置我的位置')));layer.querySelectorAll('.demand-detail').forEach(el=>el.textContent=el.textContent.replace(' · 点开',''));}
}
function control(svg,key,views,wrapper){
  let frame=0,actual=boundView(views[key]||full),target={...actual};
  const reduce=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const paint=v=>{actual=boundView(v);views[key]={...actual};svg.setAttribute('viewBox',`${actual.x} ${actual.y} ${actual.w} ${actual.h}`);paintClusters(svg,actual);const label=wrapper.querySelector('[data-map-scale]');if(label)label.textContent=`${(600/actual.w).toFixed(1)}×`;};
  const stop=()=>{cancelAnimationFrame(frame);frame=0;target={...actual};delete svg.dataset.cameraMoving;};
  const move=v=>{stop();target=boundView(v);paint(target);};
  const animate=(v,duration=210)=>{
    stop();target=boundView(v);if(reduce()){paint(target);return;}
    const from={...actual},to={...target},started=performance.now();svg.dataset.cameraMoving='true';
    const tick=now=>{if(!svg.isConnected){frame=0;return;}const t=Math.min(1,(now-started)/duration),e=1-Math.pow(1-t,3);paint({x:from.x+(to.x-from.x)*e,y:from.y+(to.y-from.y)*e,w:from.w+(to.w-from.w)*e});if(t<1)frame=requestAnimationFrame(tick);else{frame=0;delete svg.dataset.cameraMoving;}};
    frame=requestAnimationFrame(tick);
  };
  const zoom=(factor,client=null)=>{
    const p=client?world(svg,...client):{x:actual.x+actual.w/2,y:actual.y+actual.h/2},u=(p.x-actual.x)/actual.w,v=(p.y-actual.y)/actual.h;
    animate(zoomViewAt(target,factor,u,v),180);
  };
  const activate=hit=>{
    if(hit?.dataset.action==='map-cluster'){
      const b=Object.fromEntries(['left','right','top','bottom'].map(k=>[k,Number(hit.dataset[k])]));animate(clusterZoomView(b,actual),300);return true;
    }return false;
  };
  paint(actual);return {move,animate,zoom,activate,stop,get view(){return {...actual};}};
}
export function zoomMap(key,factor,views,container=document){const svg=container.querySelector(`[data-map-key="${key}"] svg`);if(svg)controllers.get(svg)?.zoom(factor);}
export function resetMap(key,views,container=document){const svg=container.querySelector(`[data-map-key="${key}"] svg`);if(svg)controllers.get(svg)?.animate(full,280);}
export function bindMaps(container,views,onPoint,onHub){
  container.querySelectorAll('.interactive-map').forEach(wrapper=>{
    const key=wrapper.dataset.mapKey,svg=wrapper.querySelector('svg');if(!svg||controllers.has(svg))return;
    const camera=control(svg,key,views,wrapper);controllers.set(svg,camera);
    let start=null,pinch=null,suppressUntil=0,lastTap=null;const pointers=new Map();
    const point=e=>({x:e.clientX,y:e.clientY});
    const begin=(id,p,hit=null)=>{camera.stop();start={id,x:p.x,y:p.y,view:camera.view,scale:1/svg.getScreenCTM().a,dragged:false,hit,last:p,time:performance.now(),vx:0,vy:0};};
    svg.addEventListener('pointerdown',e=>{
      if(e.button&&e.button!==0)return;
      camera.stop();pointers.set(e.pointerId,point(e));svg.setPointerCapture(e.pointerId);
      if(pointers.size===1)begin(e.pointerId,point(e),e.target.closest('[data-action="map-hub"],[data-action="map-cluster"]'));
      if(pointers.size===2){const [a,b]=[...pointers.values()],cx=(a.x+b.x)/2,cy=(a.y+b.y)/2,v=camera.view;pinch={distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),view:v,anchor:world(svg,cx,cy),cx,cy,scale:1/svg.getScreenCTM().a};start.dragged=true;}
    });
    svg.addEventListener('pointermove',e=>{
      if(!pointers.has(e.pointerId)||!start)return;pointers.set(e.pointerId,point(e));
      if(pinch&&pointers.size===2){
        lastTap=null;
        const [a,b]=[...pointers.values()],distance=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),cx=(a.x+b.x)/2,cy=(a.y+b.y)/2,w=Math.max(80,Math.min(600,pinch.view.w*pinch.distance/distance)),ratio=w/pinch.view.w;
        camera.move({x:pinch.anchor.x-(pinch.anchor.x-pinch.view.x)*ratio-(cx-pinch.cx)*pinch.scale*ratio,y:pinch.anchor.y-(pinch.anchor.y-pinch.view.y)*ratio-(cy-pinch.cy)*pinch.scale*ratio,w});return;
      }
      const dx=e.clientX-start.x,dy=e.clientY-start.y;if(Math.hypot(dx,dy)>5)start.dragged=true;
      if(start.dragged){lastTap=null;const now=performance.now(),dt=Math.max(8,now-start.time);start.vx=.5*start.vx+.5*(e.clientX-start.last.x)*start.scale/dt;start.vy=.5*start.vy+.5*(e.clientY-start.last.y)*start.scale/dt;start.last=point(e);start.time=now;camera.move({...start.view,x:start.view.x-dx*start.scale,y:start.view.y-dy*start.scale});}
    });
    svg.addEventListener('pointerup',e=>{
      if(!start)return;
      const moved=start.dragged||!!pinch,hit=start.hit,ended={...start},wasPinch=!!pinch;pointers.delete(e.pointerId);
      if(moved)suppressUntil=Date.now()+450;
      if(pointers.size){const [id,p]=[...pointers.entries()][0];begin(id,p);start.dragged=true;pinch=null;return;}
      start=null;pinch=null;
      if(moved){if(!wasPinch&&performance.now()-ended.time<80){const v=camera.view,cap=v.w*.3;camera.animate({...v,x:v.x-Math.max(-cap,Math.min(cap,ended.vx*120)),y:v.y-Math.max(-cap,Math.min(cap,ended.vy*120))},300);}return;}
      if(hit&&wrapper.dataset.pointMode!=='here'){suppressUntil=Date.now()+450;if(!camera.activate(hit)&&onHub)onHub(hit.dataset.spot);return;}
      const previous=lastTap;lastTap={at:Date.now(),x:e.clientX,y:e.clientY};
      if(previous&&Date.now()-previous.at<300&&Math.hypot(e.clientX-previous.x,e.clientY-previous.y)<22){suppressUntil=Date.now()+450;camera.zoom(.5,[e.clientX,e.clientY]);lastTap=null;return;}
      // Briefly defer an empty-map tap so a double tap can zoom without opening a dialog.
      const lastTapAt=lastTap.at,tappedPoint=world(svg,e.clientX,e.clientY);
      setTimeout(()=>{if(!svg.isConnected||lastTap?.at!==lastTapAt)return;const p=tappedPoint;onPoint?.(key,{x:Math.max(20,Math.min(580,Math.round(p.x))),y:Math.max(20,Math.min(390,Math.round(p.y)))});lastTap=null;},300);
    });
    svg.addEventListener('pointercancel',()=>{pointers.clear();start=null;pinch=null;suppressUntil=Date.now()+450;});
    svg.addEventListener('click',e=>{if(Date.now()<suppressUntil||wrapper.dataset.pointMode==='here'){e.preventDefault();e.stopImmediatePropagation();}},true);
    svg.addEventListener('keydown',e=>{if(!['Enter',' '].includes(e.key))return;if(wrapper.dataset.pointMode==='here'){e.preventDefault();e.stopPropagation();const disc=e.target.closest('.demand-bubble')?.querySelector('.demand-disc');if(disc){const r=disc.getBoundingClientRect(),p=world(svg,r.x+r.width/2,r.y+r.height/2);onPoint?.(key,{x:Math.max(20,Math.min(580,Math.round(p.x))),y:Math.max(20,Math.min(390,Math.round(p.y)))});}return;}const hit=e.target.closest('[data-action="map-hub"],[data-action="map-cluster"]');if(hit&&wrapper.dataset.pointMode!=='here'){e.preventDefault();e.stopPropagation();if(!camera.activate(hit)&&onHub)onHub(hit.dataset.spot);}});
    svg.addEventListener('wheel',e=>{e.preventDefault();lastTap=null;const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?180:1),factor=Math.exp(Math.max(-100,Math.min(100,pixels))*.0025);camera.zoom(factor,[e.clientX,e.clientY]);},{passive:false});
    if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(()=>{if(!svg.isConnected){observer.disconnect();return;}paintClusters(svg,camera.view);});observer.observe(wrapper);}
  });
}
