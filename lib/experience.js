import { SPOTS, shortestPath, matchRoute, taskSpots, mapMarkup, formatDistance, walkMinutes, pointAlong, spotOf, spotKey, pathThrough } from './campus.js';
import { certified, statusOf, money, userOf } from './model.js';

export function alongTasks(state, ui) {
  return state.tasks.filter(t=>statusOf(t)==='open' && t.owner!==state.actor)
    .map(task=>({task,match:matchRoute(task,ui.from,ui.to,ui.via)}))
    .filter(({task,match})=>match && (ui.scope==='all'||match.extra<=Number(ui.detour)) && (ui.category==='all'||task.category===ui.category) && (!ui.query || [task.title,task.pickup,task.dropoff].join(' ').includes(ui.query)))
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
  return `<div class="simple-heading"><span class="eyebrow">A LITTLE HELP, ON YOUR WAY</span><h1>你的小事，有人顺路。</h1><p>说清楚取送地点，其余进度在这里看。</p></div><div class="request-workspace"><div><section class="request-prompt"><div><span class="request-icon">${icon('box')}</span><h2>想请同学帮什么忙？</h2><p>取快递、带餐饮、代买小物品</p></div><div class="request-actions">${btn(`发布需求 ${icon('arrow','sm')}`,'publish','primary full')}</div></section>${active.length?`<section class="my-current"><div class="simple-section-head"><h2>进行中的托付</h2><span>${active.length} 项</span></div>${active.map(t=>`<article class="current-task"><div class="live-label"><i></i>${esc(stepLabel(t))}</div><h3>${esc(t.title)}</h3><p>${t.runner?`${esc(userOf(state,t.runner).short)}同学正在帮你 · `:''}${t.handoff==='safe_drop'?'指定公共点自取':'当面交接'}</p><div class="compact-route"><span>取 ${esc(t.pickup)}</span>${icon('right','sm')}<span>送 ${esc(t.dropoff)}</span></div>${btn(t.status==='delivered'?'查看送达凭证 / 确认取到':'查看位置与进度','track','primary full',`data-id="${t.id}"`)}</article>`).join('')}</section>`:''}${waiting.length?`<section class="my-current"><div class="simple-section-head"><h2>等待接单</h2><span>${waiting.length} 项</span></div>${waiting.map(t=>`<button class="pending-row" data-action="detail" data-id="${t.id}"><div><strong>${esc(t.title)}</strong><span>${esc(t.pickup)} → ${esc(t.dropoff)}</span></div><b>¥${money(t.reward)}</b>${icon('right','sm')}</button>`).join('')}</section>`:!active.length?`<div class="gentle-empty">${icon('route')}发布后，你会在这里看到接单、取件和送达进度。</div>`:''}</div><aside class="order-guide"><span class="eyebrow">从一个位置，送到另一个位置</span><h2>地图上标好点，等顺路的人。</h2><p>不在常用地点里？发布时点「地图选点」，标出教学楼或其他校内公共位置。</p><ol><li>标出取送位置</li><li>同校同学顺路接单</li><li>在订单中查看位置和交接进度</li></ol><small>地图位置按任务持续更新，无需播放。</small></aside></div>${footer()}`;
}
function runnerHome(c) {
  const {state,ui,icon,btn,esc,taskCard,footer}=c,u=userOf(state),rows=alongTasks(state,ui),base=pathThrough(ui.from,ui.via,ui.to);
  const shown=rows.filter(r=>!ui.hub||spotKey(taskSpots(r.task).pickup)===ui.hub),counts={},points={};
  rows.forEach(r=>{const p=taskSpots(r.task).pickup,key=spotKey(p);counts[key]=(counts[key]||0)+1;points[key]=spotOf(p);});
  const options=selected=>Object.entries(SPOTS).map(([id,p])=>`<option value="${id}" ${selected===id?'selected':''}>${p.short}</option>`).join('')+(typeof selected==='object'?`<option value="custom" selected>${esc(selected.short)}</option>`:'');
  const field=(key,label)=>`<label><span>${label}</span><select id="route-${key}" aria-label="${key==='from'?'出发地点':'目的地点'}">${options(ui[key])}</select><button type="button" class="pin-link" data-action="pick-place" data-field="${key}">${icon('pin','sm')}地图选点</button></label>`;
  const running=state.tasks.find(t=>t.runner===state.actor&&['accepted','progress','delivered'].includes(t.status));
  return `<div class="simple-heading"><h1>你往哪走？沿途顺手帮。</h1><p>常用地点或自己落点，都能找到同路的需求。</p></div>${running?`<button class="runner-active" data-action="track" data-id="${running.id}">${icon('route')}<div><strong>${esc(running.title)}</strong><span>${esc(stepLabel(running))}</span></div>${icon('right')}</button>`:''}<section class="route-planner">${field('from','我从这里出发')}<button class="route-swap" data-action="swap-route" aria-label="交换起点终点">${icon('swap')}</button>${field('to','准备去这里')}<div class="via-field"><button class="pin-link" data-action="pick-place" data-field="via">${icon('plus','sm')}${ui.via?'途经：'+esc(spotOf(ui.via).short):'添加途经点（可选）'}</button>${ui.via?`<button class="text-btn" data-action="clear-via">移除</button>`:''}</div><label class="detour-field"><span>愿意多绕</span><select id="route-detour" aria-label="最大额外绕行距离"><option value="200" ${ui.detour===200?'selected':''}>最多 200 米</option><option value="400" ${ui.detour===400?'selected':''}>最多 400 米</option><option value="800" ${ui.detour===800?'selected':''}>最多 800 米</option></select></label></section><div class="route-overview"><span>${esc(spotOf(ui.from).short)}${ui.via?' → '+esc(spotOf(ui.via).short):''} → ${esc(spotOf(ui.to).short)}</span><span>原路线约 ${formatDistance(base.metres)} · ${walkMinutes(base.metres)} 分钟</span></div><div class="scope-switch" role="group" aria-label="任务地图范围"><button data-action="task-scope" data-scope="along" aria-pressed="${ui.scope!=='all'}" class="${ui.scope!=='all'?'selected':''}">顺路推荐</button><button data-action="task-scope" data-scope="all" aria-pressed="${ui.scope==='all'}" class="${ui.scope==='all'?'selected':''}">全校需求</button></div><div class="route-workspace"><section class="route-map-section">${mapMarkup({route:base.nodes,tasks:rows.map(r=>r.task),selected:ui.hub})}<div class="map-legend"><span><i></i>你的计划路线（含途经点）</span><span>数字＝此处待取任务数</span></div><div class="hub-buttons" role="group" aria-label="按取件点筛选"><button class="${!ui.hub?'selected':''}" data-action="map-hub" data-spot="">${ui.scope==='all'?'全部需求':'全部沿途'} ${rows.length}</button>${Object.entries(counts).map(([id,n])=>`<button class="${ui.hub===id?'selected':''}" data-action="map-hub" data-spot="${id}">${esc(points[id].short)} ${n}</button>`).join('')}</div></section><section class="route-results"><div class="simple-section-head"><h2>${ui.hub?esc(points[ui.hub]?.short||'此处')+'可接任务':ui.scope==='all'?'校园里正在发生的需求':'这条路上可以顺手帮'}</h2><span>${shown.length} 项</span></div>${!certified(u)||!u.runnerEnabled?`<div class="qualification-nudge">${icon('shield')}<span>${!certified(u)?'可以先看路线，认证后再开通接单。':'你已完成在校认证，还需开通接单身份。'}</span>${btn(!certified(u)?'去认证':'去开通',!certified(u)?'auth':'runner-onboard','secondary small')}</div>`:''}<div class="route-task-list">${shown.length?shown.map(({task})=>taskCard(task)).join(''):`<div class="empty">${icon('route')}<h3>暂时没有符合这条路线的需求</h3><p>添加你实际会经过的位置，或切到全校需求看看。冷门位置也能发布，无人接单时不会扣除报酬。</p>${btn('看看全校需求','all-tasks','secondary')}</div>`}</div></section></div><p class="seed-note">自定义点与路线均为虚构校园示意。落点到最近路段的连接为估算，不代表实际可通行道路。任务只保存在当前浏览器，未接入跨设备实时同步。</p>${footer()}`;
}
export function routeCard(t,c) {
  const {ui,icon,esc,state}=c, m=matchRoute(t,ui.from,ui.to,ui.via), owner=userOf(state,t.owner);
  return `<button class="route-task-card" data-action="detail" data-id="${t.id}" aria-label="查看任务：${esc(t.title)}"><div class="route-task-top"><span class="pill">${m.extra===0?'完全顺路':`多绕 ${formatDistance(m.extra)}`}</span><strong><small>¥</small>${money(t.reward)}</strong></div><h3>${esc(t.title)}</h3><div class="route-task-path"><span><i class="route-dot"></i>${esc(t.pickup)}</span><span><i class="route-dot destination"></i>${esc(t.dropoff)}</span></div><div class="route-task-bottom"><span>到取件点 ${formatDistance(m.toPickup)} · 绕行约 ${m.extra===0?'0':walkMinutes(m.extra)} 分钟</span>${icon('arrow','sm')}</div><p>${m.extra>Number(ui.detour)?'超出你的绕行偏好 · ':''}${esc(owner.short)}同学 · 同校认证 · ${t.handoff==='safe_drop'?'授权交接架自取':'当面交接'}${t.buy?` · 商品预算 ¥${money(t.budget)}`:' · 无需商品垫付'}</p></button>`;
}

export function trackingSnapshot(t,now=Date.now(),actor=null) {
  const pending=[t.dispute,t.cancelRequest,t.change].find(x=>x?.status==='pending');
  if(pending)now=pending.at||t.events.at(-1)?.at||now;
  const {pickup,dropoff}=taskSpots(t), final=['delivered','completed'].includes(t.status), taken=!!t.pickedUpAt;
  const journey=taken?(t.runnerDelivery||shortestPath(pickup,dropoff).nodes):(t.runnerApproach||shortestPath(t.runnerStartSpot||'north',pickup).nodes);
  const nodes=final?(t.runnerDelivery||shortestPath(pickup,dropoff).nodes):journey;
  const m=taken?(t.runnerDeliveryMetres??shortestPath(pickup,dropoff).metres):(t.runnerApproachMetres??shortestPath(t.runnerStartSpot||'north',pickup).metres);
  const elapsed=now-(taken?t.pickedUpAt:t.startedAt||t.acceptedAt||now),duration=Math.max(1,m/1.2*1000);
  let fraction=final?1:t.status==='accepted'?0:Math.max(0,Math.min(1,elapsed/duration));
  if(m===0&&t.status==='progress')fraction=1;
  let title=final?(actor===t.runner?'已送达并通知，你可以离开':t.handoff==='safe_drop'?'已送达，去交接架自取':'已交接，请确认收到'):t.status==='accepted'?'同学已接单，准备出发':taken?(fraction===1?'已到交接点，待提交凭证':'物品已取到，正在送来'):(fraction===1?'已到取件点，等待取件确认':'同学正在前往取件点');
  if(!taken&&t.buy&&t.purchase?.status==='pending')title=actor===t.runner?'已发出报价，等待发布者确认':'有一份采购报价待你确认';
  if(!taken&&t.buy&&t.purchase?.status==='approved')title='报价已确认，等待模拟购买';
  if(pending)title=t.dispute?.status==='pending'?'有问题待处理，正常结算暂缓':t.cancelRequest?.status==='pending'?'取消申请待确认，暂停履约':'交接点变更待确认，暂停履约';
  return {nodes,point:pointAlong(nodes,fraction),fraction,step:final?3:taken?2:0,title,eta:pending?'待处理':final||fraction===1?'已到达':`约 ${walkMinutes(m*(1-fraction))} 分钟`,target:final||taken?dropoff:pickup};
}
