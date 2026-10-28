import { runPosition } from './planning.js';
import { SPOTS, shortestPath, matchRoute, taskSpots, mapMarkup, formatDistance, walkMinutes, pointAlong, spotOf, spotKey, pathThrough } from './campus.js';
import { certified, statusOf, money, userOf } from './model.js';

export function alongTasks(state, ui) {
  return state.tasks.filter(t=>statusOf(t)==='open' && t.owner!==state.actor)
    .map(task=>({task,match:matchRoute(task,ui.from,ui.to,ui.via)}))
    .filter(({task,match})=>match && (ui.scope==='all'||match.extra<=Number(ui.detour)) && (ui.category==='all'||task.category===ui.category) && (!ui.query || [task.title,task.pickup,task.dropoff].join(' ').includes(ui.query)))
    .sort((a,b)=>a.match.extra-b.match.extra || a.match.toPickup-b.match.toPickup);
}
export function stepLabel(t, actor=null,context=null) {
  if (actor && actor===t.runner && t.status==='delivered') return t.handoff==='safe_drop'?'已放到授权交接架，等待发布者确认':'已当面交接，等待发布者确认';
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
function quickStart(state) {
  if (state.actor !== 'visitor') return '';
  const lin=state.users.lin, zhou=state.users.zhou;
  return `<section class="quick-start" aria-label="选择体验身份"><div class="qs-copy"><h2>先选一个身份试试</h2><p>都是虚构同学，进度只存在这个浏览器里。可以随时在右上角切换。</p></div><div class="qs-options"><button data-action="quick-start" data-actor="lin" data-mode="request"><b>我要找人帮忙</b><span>以${lin.name}的身份发布、看进度、确认收货</span></button><button data-action="quick-start" data-actor="zhou" data-mode="runner"><b>我顺路接单</b><span>以${zhou.name}的身份按路线找单、取送、收款</span></button><button data-action="auth"><b>从在校认证开始</b><span>以新同学身份走一遍认证流程</span></button></div></section>`;
}
function campusNow(state,esc,icon) {
  const now=Date.now(), open=state.tasks.filter(t=>statusOf(t,now)==='open'&&t.owner!==state.actor).sort((a,b)=>a.deadline-b.deadline);
  const left=t=>{const m=Math.ceil((t.deadline-now)/60000);return m<60?`${m} 分钟内`:`${Math.floor(m/60)} 小时内`;};
  return `<aside class="campus-now"><div class="simple-section-head"><h2>校园里正在等人顺路</h2><span>${open.length} 单</span></div>${open.length?`<div class="now-list">${open.slice(0,4).map(t=>`<button class="now-row" data-action="detail" data-id="${t.id}"><span class="now-route"><i></i>${esc(spotOf(taskSpots(t).pickup)?.short||t.pickup)}<i class="to"></i>${esc(spotOf(taskSpots(t).dropoff)?.short||t.dropoff)}</span><strong>${esc(t.title)}</strong><span class="now-meta">${left(t)} · ${t.handoff==='safe_drop'?'交接架自取':'当面交接'}</span><b>¥${money(t.reward)}</b></button>`).join('')}</div>`:`<p class="now-empty">现在没有待接的需求。你可以先发布一单。</p>`}<p class="now-note">取件码、私人信息和配送位置只对这一单的双方开放。</p></aside>`;
}
function requesterHome({state,ui,icon,btn,esc,footer}) {
  const tasks=state.tasks.filter(t=>t.owner===state.actor && ['open','accepted','progress','delivered'].includes(statusOf(t)));
  const active=tasks.filter(t=>t.status!=='open'), waiting=tasks.filter(t=>t.status==='open');
  return `${quickStart(state)}<div class="simple-heading"><h1>你的小事，有人顺路。</h1><p>说清楚在哪取、送到哪，同校同学顺路时会接下。</p></div><div class="request-workspace"><div><section class="request-prompt"><div><span class="request-icon">${icon('box')}</span><h2>想请同学帮什么忙？</h2><p>取快递、带餐饮、代买小物品</p></div><div class="request-actions">${btn(`发布需求 ${icon('arrow','sm')}`,'publish','primary full')}</div></section>${active.length?`<section class="my-current"><div class="simple-section-head"><h2>进行中的托付</h2><span>${active.length} 项</span></div>${active.map(t=>`<article class="current-task"><div class="live-label"><i></i>${esc(stepLabel(t))}</div><h3>${esc(t.title)}</h3><p>${t.runner?`${esc(userOf(state,t.runner).short)}同学正在帮你 · `:''}${t.handoff==='safe_drop'?'指定公共点自取':'当面交接'}</p><div class="compact-route"><span>取 ${esc(t.pickup)}</span>${icon('right','sm')}<span>送 ${esc(t.dropoff)}</span></div>${btn(t.status==='delivered'?'查看送达凭证 / 确认取到':'查看位置与进度','track','primary full',`data-id="${t.id}"`)}</article>`).join('')}</section>`:''}${waiting.length?`<section class="my-current"><div class="simple-section-head"><h2>等待接单</h2><span>${waiting.length} 项</span></div>${waiting.map(t=>`<button class="pending-row" data-action="detail" data-id="${t.id}"><div><strong>${esc(t.title)}</strong><span>${esc(t.pickup)} → ${esc(t.dropoff)}</span></div><b>¥${money(t.reward)}</b>${icon('right','sm')}</button>`).join('')}</section>`:!active.length?`<div class="gentle-empty">${icon('route')}发布后，你会在这里看到接单、取件和送达进度。</div>`:''}</div>${campusNow(state,esc,icon)}</div>${footer()}`;
}
function runnerHome(c) {
  const {state,ui,icon,btn,esc,taskCard,footer}=c,u=userOf(state),rows=alongTasks(state,ui),base=pathThrough(ui.from,ui.via,ui.to);
  const shown=rows.filter(r=>!ui.hub||spotKey(taskSpots(r.task).pickup)===ui.hub),counts={},points={};
  rows.forEach(r=>{const p=taskSpots(r.task).pickup,key=spotKey(p);counts[key]=(counts[key]||0)+1;points[key]=spotOf(p);});
  const options=selected=>Object.entries(SPOTS).map(([id,p])=>`<option value="${id}" ${selected===id?'selected':''}>${p.short}</option>`).join('')+(selected&&typeof selected==='object'?`<option value="custom" selected>${esc(selected.short)}</option>`:'');
  const field=(key,label)=>`<label class="route-location route-${key}"><span>${label}</span><select id="route-${key}" aria-label="${key==='from'?'出发地点':key==='via'?'途经地点':'目的地点'}">${key==='via'?'<option value="">不指定途经点</option>':''}${options(ui[key])}</select><button type="button" class="pin-link" data-action="pick-place" data-field="${key}">${icon('pin','sm')}地图选点 / 自定义</button></label>`;
  const running=state.tasks.find(t=>t.runner===state.actor&&['accepted','progress','delivered'].includes(t.status));
  return `<div class="simple-heading"><h1>你往哪走？沿途顺手帮。</h1><p>设好起点、途经点和终点，再选沿途的取送任务。</p></div>${running?`<button class="runner-active" data-action="track" data-id="${running.id}">${icon('route')}<div><strong>${esc(running.title)}</strong><span>${esc(stepLabel(running,state.actor))}</span></div>${icon('right')}</button>`:''}<button class="route-example" data-action="route-example"><span>试一条路线 · 载入虚构任务</span><strong>南门打印店 → 设计楼 → 图书馆 ${icon('arrow','sm')}</strong></button>${ui.routeEditing!==false?`<section class="route-planner">${field('from','① 我现在在')}${field('via','② 中途经过（可选）')}${field('to','③ 最终去哪里')}<label class="detour-field"><span>愿意多绕</span><select id="route-detour" aria-label="最大额外绕行距离"><option value="200" ${ui.detour===200?'selected':''}>最多 200 米</option><option value="400" ${ui.detour===400?'selected':''}>最多 400 米</option><option value="800" ${ui.detour===800?'selected':''}>最多 800 米</option></select></label><button class="btn primary full route-done" data-action="route-done">查看这条路上的任务</button></section>`:`<section class="route-plan-summary"><div><span>我的路线</span><strong>${esc(spotOf(ui.from).short)}${ui.via?' → '+esc(spotOf(ui.via).short):''} → ${esc(spotOf(ui.to).short)}</strong><small>最多多绕 ${ui.detour} 米 · 可自行修改位置</small></div><button data-action="edit-route">${icon('pin','sm')}改路线 / 自定义点</button></section>`}<div class="route-overview"><span>${esc(spotOf(ui.from).short)}${ui.via?' → '+esc(spotOf(ui.via).short):''} → ${esc(spotOf(ui.to).short)}</span><span>原路线约 ${formatDistance(base.metres)} · ${walkMinutes(base.metres)} 分钟</span></div><div class="scope-switch" role="group" aria-label="任务地图范围"><button data-action="task-scope" data-scope="along" aria-pressed="${ui.scope!=='all'}" class="${ui.scope!=='all'?'selected':''}">顺路推荐</button><button data-action="task-scope" data-scope="all" aria-pressed="${ui.scope==='all'}" class="${ui.scope==='all'?'selected':''}">全校需求</button></div><div class="route-workspace"><section class="route-map-section"><div class="simple-section-head"><h2>沿途取件点</h2><span>${rows.length} 个可选任务</span></div>${mapMarkup({route:base.nodes,pins:[ui.from,ui.via,ui.to],tasks:rows.map(r=>r.task),selected:ui.hub})}<div class="map-legend"><span><i></i>你的计划路线（含途经点）</span><span>数字＝此处待取任务数</span></div><div class="hub-buttons" role="group" aria-label="按取件点筛选"><button class="${!ui.hub?'selected':''}" data-action="map-hub" data-spot="">${ui.scope==='all'?'全部需求':'全部沿途'} ${rows.length}</button>${Object.entries(counts).map(([id,n])=>`<button class="${ui.hub===id?'selected':''}" data-action="map-hub" data-spot="${id}">${esc(points[id].short)} ${n}</button>`).join('')}</div></section><section class="route-results"><div class="simple-section-head"><h2>${ui.hub?esc(points[ui.hub]?.short||'此处')+'可接任务':ui.scope==='all'?'校园里正在发生的需求':'这条路上可以顺手帮'}</h2><span>${shown.length} 项</span></div>${!certified(u)||!u.runnerEnabled?`<div class="qualification-nudge">${icon('shield')}<span>${!certified(u)?'可以先看路线，认证后再开通接单。':'你已完成在校认证，还需开通接单身份。'}</span>${btn(!certified(u)?'去认证':'去开通',!certified(u)?'auth':'runner-onboard','secondary small')}</div>`:''}<div class="route-task-list">${shown.length?shown.map(({task})=>taskCard(task)).join(''):`<div class="empty">${icon('route')}<h3>暂时没有符合这条路线的需求</h3><p>添加你实际会经过的位置，或切到全校需求看看。冷门位置也能发布，无人接单时不会扣除报酬。</p>${btn('看看全校需求','all-tasks','secondary')}</div>`}</div></section></div><p class="seed-note">自定义点与路线均为虚构校园示意。落点到最近路段的连接为估算，不代表实际可通行道路。任务只保存在当前浏览器，未接入跨设备实时同步。</p>${footer()}`;
}
export function routeCard(t,c) {
  const {ui,icon,esc,state}=c, m=matchRoute(t,ui.from,ui.to,ui.via), owner=userOf(state,t.owner);
  return `<button class="route-task-card" data-action="detail" data-id="${t.id}" aria-label="查看任务：${esc(t.title)}"><div class="route-task-top"><span class="pill">${m.extra===0?'完全顺路':`多绕 ${formatDistance(m.extra)}`}</span><strong><small>¥</small>${money(t.reward)}</strong></div><h3>${esc(t.title)}</h3><div class="route-task-path"><span><i class="route-dot"></i>${esc(t.pickup)}</span><span><i class="route-dot destination"></i>${esc(t.dropoff)}</span></div><div class="route-task-bottom"><span>到取件点 ${formatDistance(m.toPickup)} · 绕行约 ${m.extra===0?'0':walkMinutes(m.extra)} 分钟</span>${icon('arrow','sm')}</div><p>${m.extra>Number(ui.detour)?'超出你的绕行偏好 · ':''}${esc(owner.short)}同学 · 同校认证 · ${t.handoff==='safe_drop'?'授权交接架自取':'当面交接'}${t.buy?` · 商品预算 ¥${money(t.budget)}`:' · 无需商品垫付'}</p></button>`;
}

export function trackingSnapshot(t,now=Date.now(),actor=null,context=null) {
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
  if(context?.run&&!final){
    const shared=runPosition(context.state,context.run,now),own=shared.stop?.task===t.id;
    let liveTitle=shared.paused?'同行约定待处理，取送暂缓':!own?'同学正在完成沿途取送':shared.stop.kind==='pickup'?(shared.fraction===1?'已到取件点，等待取件确认':'同学正在前往取件点'):(shared.fraction===1?'已到交接点，待提交凭证':'物品已取到，正在送来');
    if(own&&!taken&&t.buy&&['pending','approved'].includes(t.purchase?.status))liveTitle=title;
    if(own&&!taken&&t.readyAt>now&&shared.fraction===1)liveTitle='已到取件点，等待预约可取时间';
    return {nodes,point:shared.point,fraction:shared.fraction,step:taken?2:0,title:liveTitle,eta:shared.paused?'待处理':shared.fraction===1?'当前站点已到达':`约 ${walkMinutes(shared.remainingMetres)} 分钟到下一站`,target:own?shared.stop.ref:pickup};
  }
  return {nodes,point:pointAlong(nodes,fraction),fraction,step:final?3:taken?2:0,title,eta:pending?'待处理':final||fraction===1?'已到达':`约 ${walkMinutes(m*(1-fraction))} 分钟`,target:final||taken?dropoff:pickup};
}
