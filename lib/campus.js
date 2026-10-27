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

export function mapMarkup({ route = [], tasks = [], selected = null, pickup = null, dropoff = null, marker = null, label = '校园示意地图' } = {}) {
  const poly = nodes => nodes.map(spotOf).filter(Boolean).map(p => `${p.x},${p.y}`).join(' ');
  const safe = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const extraPoints={};
  const counts = {};
  tasks.forEach(t => { const p = taskSpots(t).pickup; if (p) {const key=spotKey(p);extraPoints[key]=spotOf(p);counts[key]=(counts[key]||0)+1;} });
  for(const ref of [pickup,dropoff,...route])if(ref&&typeof ref==='object')extraPoints[spotKey(ref)]=ref;
  const shown = new Set(['north','west','library','food','design','dorm3','dorm2','cafe','south','east',...Object.keys(counts),spotKey(pickup),spotKey(dropoff)].filter(Boolean));
  return `<div class="campus-map" role="img" aria-label="${safe(label)}"><svg viewBox="0 0 600 420" aria-hidden="true"><defs><pattern id="map-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#e7eae4" stroke-width=".5"/></pattern></defs><rect width="600" height="420" fill="#f0f2ed"/><rect width="600" height="420" fill="url(#map-grid)"/><g fill="#e6ecdf"><rect x="30" y="25" width="165" height="35" rx="17"/><rect x="35" y="300" width="80" height="95" rx="20"/><ellipse cx="455" cy="250" rx="45" ry="50"/><rect x="355" y="25" width="55" height="95" rx="20"/></g><g stroke="#fff" stroke-linecap="round">${EDGES.map(([a,b])=>`<path d="M${SPOTS[a].x} ${SPOTS[a].y}L${SPOTS[b].x} ${SPOTS[b].y}" stroke-width="16"/>`).join('')}</g><g stroke="#d6ddd0" stroke-width="1">${EDGES.map(([a,b])=>`<path d="M${SPOTS[a].x} ${SPOTS[a].y}L${SPOTS[b].x} ${SPOTS[b].y}"/>`).join('')}</g>${route.length ? `<polyline points="${poly(route)}" fill="none" stroke="#303b2d" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>` : ''}<g>${[...shown].map(id=>{ const p=SPOTS[id]||extraPoints[id], isEnd=id===spotKey(dropoff), isStart=id===spotKey(pickup), active=id===selected; return `<g ${counts[id] ? `data-action="map-hub" data-spot="${id}" class="map-hub"` : ''}><circle cx="${p.x}" cy="${p.y}" r="${counts[id] ? 16 : 5}" fill="${counts[id] ? (active?'#738764':'#fff') : '#a4af9a'}" stroke="${counts[id] ? '#cbd4c2':'white'}" stroke-width="2"/>${counts[id]?`<text x="${p.x}" y="${p.y+4}" text-anchor="middle" fill="${active?'white':'#303b2d'}" font-size="12" font-weight="600">${counts[id]}</text>`:''}${isStart||isEnd?`<circle cx="${p.x}" cy="${p.y}" r="11" fill="${isEnd?'#283426':'white'}" stroke="#283426" stroke-width="2"/><text x="${p.x}" y="${p.y+3}" font-size="8" text-anchor="middle" fill="${isEnd?'white':'#283426'}">${isEnd?'送':'取'}</text>`:''}<text x="${p.x}" y="${p.y+(counts[id]?31:21)}" text-anchor="middle" fill="#68725e" font-size="11">${safe(p.short)}</text></g>`; }).join('')}</g><g data-map-marker>${marker ? `<circle cx="${marker.x}" cy="${marker.y}" r="16" fill="#35442e" opacity=".12"/><circle cx="${marker.x}" cy="${marker.y}" r="9" fill="#35442e" stroke="white" stroke-width="3"/><path d="m${marker.x-3} ${marker.y+1} 3-6 3 6-3-1-3 1" fill="white"/>` : ''}</g><text x="25" y="399" font-size="9" fill="#88947d">南城大学 · 虚构校园示意图</text><text x="568" y="30" text-anchor="middle" font-size="10" fill="#819073">N ↑</text></svg><span class="map-caption">示意路线 / 非真实定位</span></div>`;
}
