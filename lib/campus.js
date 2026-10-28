import { clusterPoints, clustersMarkup } from './map-clusters.js';
// A fictional, measured graph for the demo. Distances are illustrative walking metres, not GPS.
export const SPOTS = {
  north: { name: '北门 · 公共交接点', short: '北门', x: 300, y: 40 },
  cafe: { name: '北门 · 小岛咖啡', short: '小岛咖啡', x: 445, y: 75 },
  activity: { name: '学生活动中心 · 前台', short: '活动中心', x: 100, y: 95 },
  west: { name: '西区 · 菜鸟驿站', short: '西区驿站', x: 65, y: 180 },
  center: { name: '中心广场 · 公共路口', short: '中心广场', x: 300, y: 180 },
  library: { name: '图书馆 · 南门交接架', short: '图书馆', x: 300, y: 110, safeDrop: true },
  east: { name: '东门 · 公共交接点', short: '东门', x: 500, y: 180 },
  food: { name: '第一食堂 · 一楼', short: '第一食堂', x: 160, y: 280 },
  design: { name: '设计楼 · 公共交接架', short: '设计楼', x: 300, y: 280, safeDrop: true },
  south: { name: '南门 · 云朵打印店', short: '南门打印店', x: 300, y: 375 },
  dorm3: { name: '三号宿舍 · 楼下交接架', short: '三号宿舍', x: 510, y: 295, safeDrop: true },
  dorm2: { name: '二号宿舍 · 楼下交接架', short: '二号宿舍', x: 450, y: 370, safeDrop: true },
  track: { name: '操场 · 东侧公共入口', short: '操场', x: 470, y: 245 },
  store: { name: '校内 · 青禾文具店', short: '文具店', x: 395, y: 180 },
  teaching: { name: '教学楼 A · 一楼大厅', short: '教学楼 A', x: 185, y: 365 }
};
export const EDGES = [
  ['north','center',180],['north','cafe',150],['north','activity',240],['activity','west',120],
  ['activity','library',220],['west','center',250],['center','library',80],['center','food',180],
  ['center','design',110],['design','south',100],['design','dorm3',230],['dorm3','dorm2',110],
  ['dorm3','track',75],['track','east',100],['east','cafe',140],['center','store',100],
  ['store','east',110],['design','food',150],['food','west',160],['design','track',190],
  ['food','teaching',90],['teaching','south',130]
];
export function identifySpot(text = '') {
  const exact = Object.keys(SPOTS).find(id => SPOTS[id].name === text);
  if (exact) return exact;
  for (const [word, id] of [['咖啡','cafe'],['菜鸟','west'],['驿站','west'],['图书馆','library'],['三号','dorm3'],['二号','dorm2'],['食堂','food'],['设计楼','design'],['打印','south'],['文具','store'],['活动中心','activity'],['操场','track'],['教学楼','teaching'],['中心广场','center'],['北门','north'],['东门','east']]) if (text.includes(word)) return id;
  return null;
}
// Custom pins live in the fictional campus coordinate system, never real GPS.
export const spotOf = ref => typeof ref === 'string' ? SPOTS[ref] : ref;
export const spotKey = ref => typeof ref === 'string' ? ref : ref ? `pin-${ref.x}-${ref.y}` : '';
export function customPoint(value) {
  if (!value || typeof value !== 'object' || !Number.isFinite(value.x) || !Number.isFinite(value.y) || value.x<20 || value.x>580 || value.y<20 || value.y>390 || typeof value.name!=='string' || !value.name.trim() || value.name.trim().length>40) return null;
  return {x:Math.round(value.x),y:Math.round(value.y),name:value.name.trim(),short:value.name.trim(),custom:true};
}
export function shortestPath(from, to) {
  if (!spotOf(from) || !spotOf(to)) return { nodes: [], metres: Infinity };
  const points={...SPOTS}, refs=Object.fromEntries(Object.keys(SPOTS).map(k=>[k,k])), splits=new Map(), links=[];
  for(const ref of [from,to]) {
    if(typeof ref==='string')continue;
    const key=spotKey(ref);if(points[key])continue;points[key]=ref;refs[key]=ref;
    const nearest=EDGES.map(([a,b,d],index)=>{
      const A=SPOTS[a],B=SPOTS[b],dx=B.x-A.x,dy=B.y-A.y;
      const f=Math.max(0,Math.min(1,((ref.x-A.x)*dx+(ref.y-A.y)*dy)/(dx*dx+dy*dy)));
      const x=A.x+f*dx,y=A.y+f*dy;
      return {index,a,b,d,f,x,y,off:Math.hypot(ref.x-x,ref.y-y)};
    }).sort((a,b)=>a.off-b.off)[0];
    const joint=`joint-${nearest.index}-${key}`;points[joint]=nearest;refs[joint]={x:nearest.x,y:nearest.y};
    if(!splits.has(nearest.index))splits.set(nearest.index,[]);splits.get(nearest.index).push({key:joint,f:nearest.f});
    links.push([key,joint,nearest.off*1.15]);
  }
  EDGES.forEach(([a,b,d],index)=>{
    const parts=[{key:a,f:0},...(splits.get(index)||[]),{key:b,f:1}].sort((a,b)=>a.f-b.f);
    parts.slice(1).forEach((p,i)=>links.push([parts[i].key,p.key,(p.f-parts[i].f)*d]));
  });
  const start=spotKey(from),end=spotKey(to),distances=Object.fromEntries(Object.keys(points).map(k=>[k,Infinity])),previous={},rest=new Set(Object.keys(points));distances[start]=0;
  while(rest.size) {
    const current=[...rest].reduce((a,b)=>distances[a]<distances[b]?a:b);rest.delete(current);if(current===end)break;
    for(const [a,b,d] of links){const next=a===current?b:b===current?a:null;if(next&&rest.has(next)&&distances[current]+d<distances[next]){distances[next]=distances[current]+d;previous[next]=current;}}
  }
  const nodes=[end];let n=end;while(n!==start&&previous[n]){n=previous[n];nodes.unshift(n);}
  return {nodes:nodes[0]===start?nodes.map(k=>refs[k]):[],metres:distances[end]};
}
export function pathThrough(...stops) {
  const valid=stops.filter(Boolean);if(valid.length===1)return {nodes:valid,metres:0};
  return valid.slice(1).reduce((out,p,i)=>{const leg=shortestPath(valid[i],p);return {nodes:out.nodes.concat(out.nodes.length?leg.nodes.slice(1):leg.nodes),metres:out.metres+leg.metres};},{nodes:[],metres:0});
}
export function taskSpots(task) { return { pickup: task.pickupPoint || task.pickupSpot || identifySpot(task.pickup), dropoff: task.dropoffPoint || task.dropoffSpot || identifySpot(task.dropoff) }; }
export function matchRoute(task, from, to, via=null) {
  const {pickup,dropoff}=taskSpots(task),direct=pathThrough(from,via,to),orders=via?[{stops:[from,pickup,dropoff,via,to],pi:1,di:2},{stops:[from,pickup,via,dropoff,to],pi:1,di:3},{stops:[from,via,pickup,dropoff,to],pi:2,di:3}]:[{stops:[from,pickup,dropoff,to],pi:1,di:2}];
  const best=orders.map(({stops,pi,di})=>{
    const approach=pathThrough(...stops.slice(0,pi+1)),delivery=pathThrough(...stops.slice(pi,di+1)),rest=pathThrough(...stops.slice(di));
    return {approach,delivery,rest,total:approach.metres+delivery.metres+rest.metres};
  }).sort((a,b)=>a.total-b.total)[0];
  if(!Number.isFinite(best.total)||!Number.isFinite(direct.metres))return null;
  return {extra:Math.max(0,best.total-direct.metres),toPickup:best.approach.metres,taskDistance:best.delivery.metres,total:best.total,direct:direct.metres,nodes:best.approach.nodes.concat(best.delivery.nodes.slice(1),best.rest.nodes.slice(1)),approachNodes:best.approach.nodes,deliveryNodes:best.delivery.nodes};
}
export function pointAlong(nodes, fraction) {
  if (!nodes.length) return { x: 300, y: 180 };
  const points = nodes.map(spotOf);
  const segments = points.slice(1).map((p,i) => Math.hypot(p.x-points[i].x,p.y-points[i].y));
  let remaining = segments.reduce((a,b) => a+b,0) * Math.max(0,Math.min(1,fraction));
  for (let i=0;i<segments.length;i++) {
    if (remaining <= segments[i]) { const ratio = remaining / (segments[i] || 1); return { x: points[i].x+(points[i+1].x-points[i].x)*ratio, y: points[i].y+(points[i+1].y-points[i].y)*ratio }; }
    remaining -= segments[i];
  }
  return points.at(-1);
}
export const walkMinutes = m => Math.max(1,Math.ceil(m/75));
export const formatDistance = m => m < 1000 ? `${Math.round(m)} 米` : `${(m/1000).toFixed(1)} 公里`;

export function mapMarkup({ route = [], tasks = [], selected = null, pickup = null, dropoff = null, marker = null, markerNote = false, scan = false, highlightHub = null, clustered = false, pins = [], label = '校园示意地图' } = {}) {
  const poly = nodes => nodes.map(spotOf).filter(Boolean).map(p => `${p.x},${p.y}`).join(' ');
  const safe = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const extraPoints={};
  const counts = {};
  tasks.forEach(t => { const p = taskSpots(t).pickup; if (p) {const key=spotKey(p);extraPoints[key]=spotOf(p);counts[key]=(counts[key]||0)+1;} });
  for(const ref of [pickup,dropoff,...route,...pins])if(ref&&typeof ref==='object')extraPoints[spotKey(ref)]=ref;
  const shown = new Set(['north','west','library','food','design','dorm3','dorm2','cafe','south','east',...Object.keys(counts),...pins.filter(Boolean).map(spotKey),spotKey(pickup),spotKey(dropoff)].filter(Boolean));
  const label1=p=>`${safe((p.short||p.name||'落点').slice(0,10))}${(p.short||p.name||'').length>10?'…':''}`;
  const spots=[...shown].map(id=>{ if(clustered&&counts[id]&&id!==spotKey(pickup)&&id!==spotKey(dropoff))return '';const p=SPOTS[id]||extraPoints[id], isEnd=id===spotKey(dropoff), isStart=id===spotKey(pickup), active=id===selected, n=clustered?0:counts[id];
    const tx=p.x<100?p.x+10:p.x>500?p.x-10:p.x, anchor=p.x<100?'start':p.x>500?'end':'middle', big=n||isStart||isEnd, ty=p.y>365?p.y-(big?22:11):p.y+(big?30:19);
    const body=isStart||isEnd?`<rect class="m-tile ${isEnd?'end':'start'}" x="${p.x-11}" y="${p.y-11}" width="22" height="22" rx="4"/><text class="m-tile-text ${isEnd?'end':'start'}" x="${p.x}" y="${p.y+4.5}" text-anchor="middle">${isEnd?'送':'取'}</text>${n?`<circle class="m-badge" cx="${p.x+12}" cy="${p.y-12}" r="8"/><text class="m-badge-text" x="${p.x+12}" y="${p.y-8.5}" text-anchor="middle">${n}</text>`:''}`
      :n?`<circle class="m-hub ${active?'active':''}" cx="${p.x}" cy="${p.y}" r="24"/><text class="m-hub-text ${active?'active':''}" x="${p.x}" y="${p.y+4.5}" text-anchor="middle">${n}</text>`
      :`<rect class="m-node ${p.custom?'custom':''}" x="${p.x-3.5}" y="${p.y-3.5}" width="7" height="7" rx="1"/>`;
    return `<g ${n ? `data-action="map-hub" data-spot="${id}" class="map-hub" role="button" tabindex="0" aria-label="${safe(p.name||p.short)}，${n}个待取任务"` : ''}><title>${safe(p.name||p.short)}</title>${n?`<circle class="m-hit" cx="${p.x}" cy="${p.y}" r="35"/>`:''}${n&&highlightHub===id?`<circle class="m-demand-arrival" cx="${p.x}" cy="${p.y}" r="31"/>`:''}${body}<text class="m-label ${n||isStart||isEnd?'strong':''}" x="${tx}" y="${ty}" text-anchor="${anchor}">${label1(p)}</text></g>`; }).join('');
  const demandPoints=Object.entries(counts).map(([key,count])=>({...extraPoints[key],key,count,name:extraPoints[key].short||extraPoints[key].name}));
  const demandLayer=clustered?`<g data-demand-layer data-location="${safe(JSON.stringify(markerNote?marker:null))}" data-points="${safe(JSON.stringify(demandPoints))}" data-selected="${safe(selected||'')}" data-highlight="${safe(highlightHub||'')}">${clustersMarkup(clusterPoints(demandPoints),320/600,selected,highlightHub,markerNote?marker:null)}</g>`:'';
  const roads=EDGES.map(([a,b])=>`M${SPOTS[a].x} ${SPOTS[a].y}L${SPOTS[b].x} ${SPOTS[b].y}`).join('');
  return `<div class="campus-map" role="${clustered?'group':'img'}" aria-label="${safe(label)}"><svg viewBox="0 0 600 420" ${clustered?'role="group" aria-label="可缩放的需求地图"':'aria-hidden="true"'}><defs><pattern id="m-blocks" width="44" height="36" patternUnits="userSpaceOnUse"><rect class="m-block" x="3" y="3" width="24" height="14" rx="2"/><rect class="m-block alt" x="30" y="3" width="11" height="14" rx="2"/><rect class="m-block alt" x="3" y="20" width="12" height="13" rx="2"/><rect class="m-block" x="18" y="20" width="23" height="13" rx="2"/></pattern></defs><rect class="m-bg" width="600" height="420"/><rect class="m-blocks" width="600" height="420"/><g class="m-green"><rect x="30" y="25" width="165" height="35" rx="6"/><rect x="35" y="300" width="80" height="95" rx="8"/><ellipse cx="455" cy="250" rx="45" ry="50"/><rect x="355" y="25" width="55" height="95" rx="6"/></g><path class="m-road-edge" d="${roads}"/><path class="m-road" d="${roads}"/>${route.length ? `<polyline class="m-route-halo" points="${poly(route)}"/><polyline class="m-route" points="${poly(route)}"/>` : ''}<g>${spots}</g>${demandLayer}<g data-map-marker>${marker ? `<g class="m-pin" ${markerNote?`data-current-location="true" data-x="${marker.x}" data-y="${marker.y}"`:""} transform="translate(${marker.x} ${marker.y})">${markerNote&&scan?'<g class="m-demand-scan" aria-hidden="true"><circle r="14"/><circle r="14"/></g>':''}<circle r="15" class="m-pin-ring"/><circle r="8" class="m-pin-dot"/>${markerNote?'<g class="m-location-label" transform="translate(-48 20)"><rect width="96" height="34" rx="9"/><text x="48" y="14" text-anchor="middle">我的位置</text><text class="m-location-note" x="48" y="27" text-anchor="middle">模拟定位 · 非 GPS</text></g>':''}</g>` : ''}</g><text class="m-meta" x="24" y="401">南城大学 · 虚构校园示意</text><g class="m-north" transform="translate(568 34)"><path d="M0 -12 6 6 0 2 -6 6Z"/><text y="22" text-anchor="middle">北</text></g></svg><span class="map-caption">示意路线，非真实定位</span></div>`;
}
