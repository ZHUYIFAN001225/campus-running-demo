import { SPOTS, shortestPath, matchRoute, taskSpots, mapMarkup, formatDistance, walkMinutes, pointAlong } from './campus.js';
import { certified, statusOf, money, userOf } from './model.js';

export function alongTasks(state, ui) {
  return state.tasks.filter(t=>statusOf(t)==='open' && t.owner!==state.actor)
    .map(task=>({task,match:matchRoute(task,ui.from,ui.to)}))
    .filter(({task,match})=>match && match.extra<=Number(ui.detour) && (ui.category==='all'||task.category===ui.category) && (!ui.query || [task.title,task.pickup,task.dropoff].join(' ').includes(ui.query)))
    .sort((a,b)=>a.match.extra-b.match.extra || a.match.toPickup-b.match.toPickup);
}
export function stepLabel(t) {
  if (t.dispute?.status==='pending') return '问题处理中';
  if (t.cancelRequest?.status==='pending') return '取消待对方确认';
  if (t.status==='open') return '正在等待同学接单';
  if (t.status==='accepted') return '同学已接单，准备出发';
  if (t.status==='progress') return t.pickedUpAt ? '已取到，正在送往交接点' : (t.purchase?.status==='pending'?'采购报价待确认':'正在前往取件点');
  if (t.status==='delivered') return t.handoff==='safe_drop'?'已放到交接架，等你自取':'已交接，待你确认';
  return {completed:'已完成',cancelled:'已取消',expired:'已过期，模拟预算已退回'}[statusOf(t)] || '查看任务';
}
function modeSwitch(ui) { return `<div class="mode-switch" role="group" aria-label="选择使用场景"><button data-action="mode" data-mode="request" aria-pressed="${ui.mode==='request'}" class="${ui.mode==='request'?'selected':''}"><span>找人帮忙</span><small>发布需求 · 查看进度</small></button><button data-action="mode" data-mode="runner" aria-pressed="${ui.mode==='runner'}" class="${ui.mode==='runner'?'selected':''}"><span>顺路接单</span><small>先看方向 · 再接任务</small></button></div>`; }
export function home(c) {
  const { ui }=c;
  return `${modeSwitch(ui)}${ui.mode==='runner'?runnerHome(c):requesterHome(c)}`;
}
function requesterHome({state,ui,icon,btn,esc,footer}) {
  const tasks=state.tasks.filter(t=>t.owner===state.actor && ['open','accepted','progress','delivered'].includes(statusOf(t)));
  const active=tasks.filter(t=>t.status!=='open'), waiting=tasks.filter(t=>t.status==='open');
  return `<div class="simple-heading"><span class="eyebrow">A LITTLE HELP, ON YOUR WAY</span><h1>你的小事，有人顺路。</h1><p>说清楚取送地点，其余进度在这里看。</p></div><div class="request-workspace"><div><section class="request-prompt"><div><span class="request-icon">${icon('box')}</span><h2>想请同学帮什么忙？</h2><p>取快递、带餐饮、代买小物品</p></div><div class="request-actions">${btn(`发布需求 ${icon('arrow','sm')}`,'publish','primary full')}${btn('看配送演示','play-tour','secondary full')}</div></section>${active.length?`<section class="my-current"><div class="simple-section-head"><h2>进行中的托付</h2><span>${active.length} 项</span></div>${active.map(t=>`<article class="current-task"><div class="live-label"><i></i>${esc(stepLabel(t))}</div><h3>${esc(t.title)}</h3><p>${t.runner?`${esc(userOf(state,t.runner).short)}同学正在帮你 · `:''}${t.handoff==='safe_drop'?'指定公共点自取':'当面交接'}</p><div class="compact-route"><span>取 ${esc(t.pickup)}</span>${icon('right','sm')}<span>送 ${esc(t.dropoff)}</span></div>${btn(t.status==='delivered'?'查看送达凭证 / 确认取到':'查看位置与进度','track','primary full',`data-id="${t.id}"`)}</article>`).join('')}</section>`:''}${waiting.length?`<section class="my-current"><div class="simple-section-head"><h2>等待接单</h2><span>${waiting.length} 项</span></div>${waiting.map(t=>`<button class="pending-row" data-action="detail" data-id="${t.id}"><div><strong>${esc(t.title)}</strong><span>${esc(t.pickup)} → ${esc(t.dropoff)}</span></div><b>¥${money(t.reward)}</b>${icon('right','sm')}</button>`).join('')}</section>`:!active.length?`<div class="gentle-empty">${icon('route')}发布后，你会在这里看到接单、取件和送达进度。</div>`:''}</div><section class="tour-preview"><div class="simple-section-head"><div><span class="eyebrow">看看实际怎么用</span><h2>一段顺路，怎样送到你身边</h2></div><span class="pill neutral">24 秒演示</span></div>${mapMarkup({route:shortestPath('north','west').nodes.concat(shortestPath('west','dorm3').nodes.slice(1)),pickup:'west',dropoff:'dorm3',marker:SPOTS.north})}<div class="tour-preview-bottom"><p>同学接单 → 取到物品 → 送达交接点</p>${btn(`${icon('route','sm')}播放一次送达演示`,'play-tour','secondary full')}</div></section></div>${footer()}`;
}
function runnerHome(c) {
  const {state,ui,icon,btn,esc,taskCard,footer}=c, u=userOf(state), rows=alongTasks(state,ui);
  const shown=rows.filter(r=>!ui.hub || taskSpots(r.task).pickup===ui.hub);
  const counts={}; rows.forEach(r=>{const id=taskSpots(r.task).pickup;counts[id]=(counts[id]||0)+1;});
  const options=selected=>Object.entries(SPOTS).map(([id,p])=>`<option value="${id}" ${selected===id?'selected':''}>${p.short}</option>`).join('');
  const running=state.tasks.find(t=>t.runner===state.actor && ['accepted','progress','delivered'].includes(t.status));
  return `<div class="simple-heading"><h1>你往哪走？沿途顺手帮。</h1><p>先选方向，接单前就知道多绕多远。</p></div>${running?`<button class="runner-active" data-action="track" data-id="${running.id}">${icon('route')}<div><strong>${esc(running.title)}</strong><span>${esc(stepLabel(running))}</span></div>${icon('right')}</button>`:''}<section class="route-planner"><label><span>我从这里出发</span><select id="route-from" aria-label="出发地点">${options(ui.from)}</select></label><button class="route-swap" data-action="swap-route" aria-label="交换起点终点">${icon('swap')}</button><label><span>准备去这里</span><select id="route-to" aria-label="目的地点">${options(ui.to)}</select></label><label class="detour-field"><span>愿意多绕</span><select id="route-detour" aria-label="最大额外绕行距离"><option value="200" ${ui.detour===200?'selected':''}>最多 200 米</option><option value="400" ${ui.detour===400?'selected':''}>最多 400 米</option><option value="800" ${ui.detour===800?'selected':''}>最多 800 米</option></select></label></section><div class="route-overview"><span>${SPOTS[ui.from].short} → ${SPOTS[ui.to].short}</span><span>原路程约 ${formatDistance(shortestPath(ui.from,ui.to).metres)} · ${walkMinutes(shortestPath(ui.from,ui.to).metres)} 分钟</span></div><div class="route-workspace"><section class="route-map-section">${mapMarkup({route:shortestPath(ui.from,ui.to).nodes,tasks:rows.map(r=>r.task),selected:ui.hub})}<div class="map-legend"><span><i></i>你的原定路线</span><span>圆点数字＝沿途待取任务数</span></div><div class="hub-buttons" role="group" aria-label="按沿途取件点筛选"><button class="${!ui.hub?'selected':''}" data-action="map-hub" data-spot="">全部沿途 ${rows.length}</button>${Object.entries(counts).map(([id,n])=>`<button class="${ui.hub===id?'selected':''}" data-action="map-hub" data-spot="${id}">${SPOTS[id].short} ${n}</button>`).join('')}</div></section><section class="route-results"><div class="simple-section-head"><h2>${ui.hub?SPOTS[ui.hub].short+'可接任务':'这条路上可以顺手帮'}</h2><span>${shown.length} 项</span></div>${!certified(u)||!u.runnerEnabled?`<div class="qualification-nudge">${icon('shield')}<span>${!certified(u)?'可以先看路线，认证后再开通接单。':'你已完成在校认证，还需开通接单身份。'}</span>${btn(!certified(u)?'去认证':'去开通',!certified(u)?'auth':'runner-onboard','secondary small')}</div>`:''}<div class="route-task-list">${shown.length?shown.map(({task})=>taskCard(task)).join(''):`<div class="empty">${icon('route')}<h3>这段路暂时没有合适的任务</h3><p>试试放宽绕行范围或换一个目的地。不会为了凑单推荐明显不顺路的任务。</p>${btn('查看 800 米内任务','widen-route','secondary')}</div>`}</div></section></div><p class="seed-note">路线、距离、步行时间均来自虚构校园路网，不使用真实 GPS。真实产品须按获准位置与实际步行路网计算。</p>${footer()}`;
}
export function routeCard(t,c) {
  const {ui,icon,esc,state}=c, m=matchRoute(t,ui.from,ui.to), owner=userOf(state,t.owner);
  return `<button class="route-task-card" data-action="detail" data-id="${t.id}" aria-label="查看任务：${esc(t.title)}"><div class="route-task-top"><span class="pill">${m.extra===0?'完全顺路':`多绕 ${formatDistance(m.extra)}`}</span><strong><small>¥</small>${money(t.reward)}</strong></div><h3>${esc(t.title)}</h3><div class="route-task-path"><span><i class="route-dot"></i>${esc(t.pickup)}</span><span><i class="route-dot destination"></i>${esc(t.dropoff)}</span></div><div class="route-task-bottom"><span>到取件点 ${formatDistance(m.toPickup)} · 绕行约 ${m.extra===0?'0':walkMinutes(m.extra)} 分钟</span>${icon('arrow','sm')}</div><p>${esc(owner.short)}同学 · 同校认证 · ${t.handoff==='safe_drop'?'授权交接架自取':'当面交接'}${t.buy?` · 商品预算 ¥${money(t.budget)}`:' · 无需商品垫付'}</p></button>`;
}

export function trackingSnapshot(t,now=Date.now(),actor=null) {
  const pending=[t.dispute,t.cancelRequest,t.change].find(x=>x?.status==='pending');
  if(pending)now=pending.at||t.events.at(-1)?.at||now;
  const {pickup,dropoff}=taskSpots(t), final=['delivered','completed'].includes(t.status), taken=!!t.pickedUpAt;
  const nodes=final?shortestPath(pickup,dropoff).nodes:taken?shortestPath(pickup,dropoff).nodes:shortestPath(t.runnerStartSpot||'north',pickup).nodes;
  const elapsed=now-(taken?t.pickedUpAt:t.startedAt||t.acceptedAt||now), duration=taken?20000:14000;
  let fraction=final?1:t.status==='accepted'?0:Math.max(0,Math.min(1,elapsed/duration));
  const m=shortestPath(taken?pickup:(t.runnerStartSpot||'north'),taken?dropoff:pickup).metres;
  if(m===0&&t.status==='progress')fraction=1;
  let title=final?(actor===t.runner?'已送达并通知，你可以离开':t.handoff==='safe_drop'?'已送达，去交接架自取':'已交接，请确认收到'):t.status==='accepted'?'同学已接单，准备出发':taken?(fraction===1?'已到交接点，待提交凭证':'物品已取到，正在送来'):(fraction===1?'已到取件点，等待取件确认':'同学正在前往取件点');
  if(!taken&&t.buy&&t.purchase?.status==='pending')title=actor===t.runner?'已发出报价，等待发布者确认':'有一份采购报价待你确认';
  if(!taken&&t.buy&&t.purchase?.status==='approved')title='报价已确认，等待模拟购买';
  if(pending)title=t.dispute?.status==='pending'?'有问题待处理，正常结算暂缓':t.cancelRequest?.status==='pending'?'取消申请待确认，暂停履约':'交接点变更待确认，暂停履约';
  return {nodes,point:pointAlong(nodes,fraction),fraction,step:final?3:taken?2:0,title,eta:pending?'待处理':final||fraction===1?'已到达':`约 ${walkMinutes(m*(1-fraction))} 分钟`,target:final||taken?dropoff:pickup};
}
export function tourSnapshot(elapsed) {
  const a=shortestPath('north','west'),b=shortestPath('west','dorm3'),p=Math.min(1,elapsed/24000),taken=p>=.35,done=p>=1;
  const nodes=taken?b.nodes:a.nodes, fraction=taken?Math.min(1,(p-.35)/.65):p/.35;
  return {nodes:a.nodes.concat(b.nodes.slice(1)),point:pointAlong(nodes,fraction),fraction:p,step:done?3:taken?2:0,title:done?'已放至三号楼交接架，已通知你':taken?'已取到物品，正顺路送来':'同学已接单，正前往西区驿站',eta:done?'已送达':`预计约 ${Math.max(1,Math.ceil((1-p)*8))} 分钟 · 示意`,target:taken?'dorm3':'west'};
}
