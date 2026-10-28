import { chatImage, prepareChatImage } from './lib/chat-images.js';
import { deliveryEstimate } from './lib/delivery-estimate.js';
import { discoveryHome, discoveryRows } from './lib/discovery.js';
import { planBatch, activeTransport, runPosition, MAX_CARRY } from './lib/planning.js';
import { bindMaps, zoomMap, resetMap } from './lib/map-controls.js';
import { MARKET_INTERVAL } from './lib/market-data.js';
import { livePauseReason } from './lib/market-live.js';
import { validSharedState, syncDecision } from './lib/state-sync.js';
import { SCHOOL, CATEGORIES, STATUS, AUTH, money, createState, migrateState, reconcile, userOf, certified, statusOf, creditOf, reviewAverage, visibleTask, evolve, walletSummary } from './lib/model.js';
import { icon, logo, campusArt } from './lib/icons.js';
import { SPOTS, identifySpot, shortestPath, taskSpots, matchRoute, mapMarkup, formatDistance, walkMinutes, spotOf, spotKey, customPoint, pathThrough } from './lib/campus.js';
import { home as experienceHome, routeCard, stepLabel, trackingSnapshot } from './lib/experience.js';

const KEY = 'tonglu-campus-v1';
const DRAFT_KEY = 'tonglu-draft-v1';
const root = document.querySelector('#app');
const modal = document.querySelector('#modal');
let storageWarning = '', state;
let marketPointerDown=false;
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved && (saved.version !== 1 || !Array.isArray(saved.tasks) || !saved.users?.[saved.actor] || !Array.isArray(saved.notifications) || !Array.isArray(saved.reports) || !Number.isInteger(saved.revision) || saved.tasks.some(t => !t.id || !saved.users[t.owner] || !CATEGORIES[t.category] || !STATUS[t.status] || !Array.isArray(t.events) || !Array.isArray(t.reviews) || !Number.isInteger(t.prepaid) || !Number.isFinite(t.deadline)))) throw new Error('invalid');
  state = saved || createState();
} catch { state = createState(); storageWarning = '本地演示记录无法读取，已恢复初始数据。'; }
const normalized = reconcile(migrateState(state));
if (normalized !== state) { state = normalized; persist(); }
function routePreferences() {
  try {
    const saved=JSON.parse(localStorage.getItem('tonglu-route-v1')||'null');if(!saved)return {};
    const point=value=>typeof value==='string'&&Object.hasOwn(SPOTS,value)?value:customPoint(value);
    const from=point(saved.from),to=point(saved.to),via=saved.via?point(saved.via):null;
    if(!from||!to)return {};
    return {from,to,via,detour:[0,100,200,400,800].includes(saved.detour)?saved.detour:400,scope:saved.scope==='all'?'all':'along',mode:saved.mode==='runner'?'runner':'request'};
  } catch {return {};}
}
const ui = { page: 'square', mode: new URLSearchParams(location.search).get('mode')==='request'?'request':'runner', from: 'north', to: 'dorm3', via: null, routeEditing: true, scope: 'along', detour: 400, hub: null, category: 'all', query: '', sort: 'new', mine: 'published', status: 'all', dialog: null, draft: null, rating: 5, afterAuth: null, tracking: null, forceDetails: false, ...routePreferences() };
if(new URLSearchParams(location.search).get('mode')==='runner')ui.mode='runner';
Object.assign(ui,{here:'north',detour:100,routeEnabled:false,marketScope:'nearby',radius:600,urgentOnly:false,selected:[],focusTask:null,mapViews:{},mapPicking:'dropoff',composer:null,moreOpen:false,liveEnabled:true});
try{const pref=JSON.parse(localStorage.getItem('tonglu-discovery-v1')||'null');if(pref){ui.liveEnabled=pref.liveEnabled!==false;ui.here=customPoint(pref.here)||(SPOTS[pref.here]?pref.here:'north');ui.marketScope=pref.marketScope==='all'?'all':'nearby';ui.routeEnabled=!!pref.routeEnabled&&!!ui.to;ui.routeEditing=false;}}catch{/* Default fictional position. */}
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const btn = (label, action, cls = 'primary', attrs = '') => `<button type="button" class="btn ${cls}" data-action="${action}" ${attrs}>${label}</button>`;
const textBtn = (label, action, attrs = '') => `<button type="button" class="text-btn" data-action="${action}" ${attrs}>${label}</button>`;
const notice = (text, kind = '', name = 'info') => `<div class="notice ${kind}">${icon(name)}<span>${text}</span></div>`;
const avatar = (u, cls = '') => `<span class="avatar ${cls}">${esc(u.short)}</span>`;
const verified = u => certified(u) ? `<span class="verified-small">${icon('shield')}同校认证</span>` : `<span class="verified-small">${esc(authName(u))}</span>`;
const date = n => new Date(n).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const timeLeft = t => {
  const m = Math.ceil((t.deadline - Date.now()) / 60000);
  if (m <= 0) return ['open'].includes(t.status) ? '已过期' : (['completed', 'cancelled'].includes(t.status) ? date(t.deadline) : '已超时');
  return m < 60 ? `${m} 分钟内` : (m < 1440 ? `${Math.floor(m / 60)} 小时 ${m % 60 ? `${m % 60} 分钟` : ''}内` : date(t.deadline));
};
const authName = u => u.auth === 'verified' && !certified(u) ? '认证已过期' : AUTH[u.auth];
const getTask = id => state.tasks.find(t => t.id === id);
const unread = () => state.notifications.filter(n => (!n.user || n.user === state.actor) && !n.read).length;
const empty = (title, text, action = '', label = '') => `<div class="empty">${icon('route')}<h3>${title}</h3><p>${text}</p>${action ? btn(label, action, 'secondary') : ''}</div>`;
let toastTimer;
function toast(text) {
  const el = document.querySelector('#toast'); el.textContent = text; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3600);
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { storageWarning = '浏览器无法保存进度，当前仍可体验，刷新后可能丢失记录。'; }
}
function readSharedState(){try{const value=JSON.parse(localStorage.getItem(KEY)||'null');return validSharedState(value)?value:null;}catch{return null;}}
function syncSharedState(force=false){
  const result=syncDecision(state,readSharedState());
  if(result.kind!=='ready')return false;
  if(!force&&modal.open&&ui.dialog?.type==='chat'){
    const before=getTask(ui.dialog.id),next=result.state.tasks.find(t=>t.id===ui.dialog.id);
    if(!next||![next.owner,next.runner].includes(state.actor))return false;
    state=result.state;
    if(JSON.stringify(before?.messages)!==JSON.stringify(next.messages)){
      const list=modal.querySelector('.message-list'),nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<70;
      list.innerHTML=chatMessages(next);if(nearBottom)followLatestChatImage(list);
    }
    const writable=['accepted','progress','delivered'].includes(next.status);
    modal.querySelectorAll('.message-form,.chat-quick').forEach(el=>el.hidden=!writable);
    if(!writable)modal.querySelectorAll('.chat-photo-actions,.chat-attachment').forEach(el=>el.hidden=true);
    if(!['accepted','progress'].includes(next.status))modal.querySelector('[data-action="change-form"]')?.remove();
    const order=modal.querySelector('.chat-order>span');if(order)order.textContent=STATUS[statusOf(next)]+' · '+next.title;
    return true;
  }
  const liveDialog=modal.open&&['tracking','run'].includes(ui.dialog?.type)?{...ui.dialog}:null;
  const editingDialog=[...document.querySelectorAll('dialog[open]')].some(el=>el!==modal||!liveDialog);
  if(!force&&(marketPointerDown||editingDialog||root.querySelector('[data-camera-moving]')||ui.selected.length||ui.hub||ui.locationPicking||document.activeElement?.matches('input,select,textarea')||ui.routeEnabled&&ui.routeEditing))return false;
  const liveChanged=liveDialog&&(liveDialog.type==='tracking'?JSON.stringify(getTask(liveDialog.id))!==JSON.stringify(result.state.tasks.find(t=>t.id===liveDialog.id)):JSON.stringify(activeTransport(state))!==JSON.stringify(activeTransport(result.state)));
  if(!force)saveDraft();
  state=result.state;
  if(!force){render();if(liveChanged){if(liveDialog.type==='run')showRun();else showTask(liveDialog.id,false);}}
  return true;
}
function error(text) {
  if(!modal.open){const quick=root.querySelector('.form-error');if(quick){quick.textContent=text;quick.classList.remove('error-hidden');quick.scrollIntoView({block:'nearest'});return;}toast(text);return;}
  let el = modal.querySelector('.form-error');
  if (!el) { el = document.createElement('div'); el.className = 'form-error'; modal.querySelector('.modal-body')?.append(el); }
  el.textContent = text; el.classList.remove('error-hidden'); el.setAttribute('role', 'alert');
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function run(command, data = {}, message = '') {
  try {
    const result=syncDecision(state,readSharedState(),command,data);
    if(result.kind==='reset')throw new Error('演示数据已被重新初始化，请刷新页面后继续。');
    if(result.kind==='conflict')throw new Error('这单的状态或约定刚有更新，请返回任务查看，再确认操作。已填写的内容仍保留。');
    if(result.kind==='ready')state=result.state;
    const next=evolve(state,command,data);
    if(command==='message'&&data.image){try{localStorage.setItem(KEY,JSON.stringify(next));}catch{throw new Error('图片未能保存，本地空间可能不足。请移除图片后发送文字，或换更小的图片。');}state=next;}else{state=next;persist();}
    render(); if (message) toast(message); return true;
  }
  catch (e) { if (modal.open) error(e.message); else toast(e.message); return false; }
}
function shellContent() {
  const u = userOf(state), n = unread();
  const links = [['square', 'grid', '首页'], ['mine', 'tasks', '任务'], ['messages', 'chat', '消息'], ['wallet', 'bag', '钱包'], ['me', 'user', '我的']];
  const brand = `<span class="brand">${logo}<span class="brand-name">同路<small class="brand-sub">南城大学 · 校内顺路互助</small></span></span>`;
  const nav = links.map(([id, glyph, label]) => `<button class="nav-link ${ui.page === id ? 'active' : ''}" data-action="nav" data-page="${id}" ${ui.page === id ? 'aria-current="page"' : ''}>${icon(glyph)}${label}${id === 'messages' && n ? `<span class="count-dot">${n}</span>` : ''}</button>`).join('');
  return `<aside class="sidebar"><a href="#square" aria-label="同路首页">${brand}</a><nav class="nav-list" aria-label="主导航">${nav}</nav><div class="sidebar-bottom">${btn(`${icon('plus')}发布任务`, 'publish', 'primary full')}</div></aside>
    <div class="main-wrap">${storageWarning ? `<div class="storage-warning" role="alert">${esc(storageWarning)}</div>` : ''}<header class="topbar"><a class="mobile-brand" href="#square" aria-label="同路首页">${brand}</a><button class="campus-switch" data-action="campus">${icon('pin')}<span>${SCHOOL.name}</span><span>校内互助</span></button><div class="top-actions">${idChip(u)}<button class="icon-btn" data-action="nav" data-page="messages" aria-label="消息">${icon('bell')}${n ? '<span class="notification-dot"></span>' : ''}</button></div></header>
    <main class="page" id="page-content">${pageContent()}</main></div><nav class="bottom-nav" aria-label="手机导航">${links.map(([id, glyph, label]) => `<button class="bottom-item ${ui.page === id ? 'active' : ''} ${id === 'publish' ? 'publish' : ''}" data-action="${id === 'publish' ? 'publish' : 'nav'}" data-page="${id}" aria-label="${label}" ${ui.page === id ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span>${id === 'messages' && n ? `<span class="count-dot">${n}</span>` : ''}</button>`).join('')}</nav>`;
}
function idStatus(u) { return !certified(u) ? authName(u) : u.runnerEnabled ? '已认证 · 可接单' : '已认证'; }
function idChip(u) { return `<button class="id-chip" data-action="demo" aria-label="当前演示身份：${esc(u.name)}，${esc(idStatus(u))}。点击切换身份">${avatar(u)}<span class="id-text"><b>${esc(u.name)}</b><small>${esc(idStatus(u))}</small></span><span class="id-switch">切换</span></button>`; }
function render() {
  try {const {from,to,via,detour,scope,mode}=ui;localStorage.setItem('tonglu-route-v1',JSON.stringify({from,to,via,detour,scope,mode}));}catch{/* Route editing remains usable without storage. */}
  ui.selected=ui.selected.filter(id=>state.tasks.some(t=>t.id===id&&statusOf(t)==='open'&&t.owner!==state.actor));
  try{localStorage.setItem('tonglu-discovery-v1',JSON.stringify({here:ui.here,marketScope:ui.marketScope,routeEnabled:ui.routeEnabled,liveEnabled:ui.liveEnabled}));}catch{}
  root.innerHTML = shellContent();
  bindMaps(root,ui.mapViews,onDiscoveryPoint,spot=>{ui.hub=spot||null;ui.focusTask=null;render();const heading=root.querySelector('.market-list-head h2');heading?.setAttribute('tabindex','-1');heading?.focus({preventScroll:true});root.querySelector('.market-list-head')?.scrollIntoView({block:'start',behavior:'smooth'});});
  // Existing promises come before asking the user to publish something else.
  const current=root.querySelector('.my-current');
  if(ui.page==='square'&&ui.mode==='request'&&current?.querySelector('.current-task')) current.parentElement.prepend(current);
}
function footer() { return '<footer class="page-footer"><span>交互演示：南城大学、同学、地点与金额均为虚构，不发生真实付款。</span></footer>'; }
function pageContent() {
  if (ui.page === 'mine') return minePage();
  if (ui.page === 'messages') return messagesPage();
  if (ui.page === 'me') return profilePage();
  if (ui.page === 'wallet') return walletPage();
  return squarePage();
}
function squarePage() { return discoveryHome({state,ui,icon,btn,esc,footer,taskCard,draft:ui.composer||loadDraft()}); }
function filteredTasks() {
  const q = ui.query.toLowerCase().trim();
  const list = state.tasks.filter(t => statusOf(t) === 'open' && (ui.category === 'all' || t.category === ui.category) && (!q || [t.title, t.description, t.pickup, t.dropoff].join(' ').toLowerCase().includes(q)));
  return list.sort((a, b) => ui.sort === 'reward' ? b.reward - a.reward : ui.sort === 'soon' ? a.deadline - b.deadline : b.createdAt - a.createdAt);
}
function feedContent() {
  const tasks = filteredTasks();
  return `<div class="feed-meta"><span>共 ${tasks.length} 个待接任务 · ${certified(userOf(state)) ? '仅限同校学生接单' : '脱敏预览，认证后可参与'}</span><label>排序 <select id="sort-select" aria-label="任务排序"><option value="new" ${ui.sort === 'new' ? 'selected' : ''}>最新发布</option><option value="soon" ${ui.sort === 'soon' ? 'selected' : ''}>即将到期</option><option value="reward" ${ui.sort === 'reward' ? 'selected' : ''}>报酬优先</option></select></label></div><div class="task-grid">${tasks.length ? tasks.map(taskCard).join('') : empty('这段顺路，还没有新任务', '试试其他分类或关键词，也可以发布你的第一个需求。', 'clear-search', '查看全部任务')}</div>`;
}
function taskCard(t) {
  if (ui.page==='square' && ui.mode==='runner') return routeCard(t,{state,ui,icon,esc});
  const owner = userOf(state, t.owner), c = CATEGORIES[t.category], status = statusOf(t), stranger = !certified(userOf(state));
  const location = text => stranger ? text.split(' · ')[0] + '附近' : text;
  return `<button class="task-card" data-action="detail" data-id="${esc(t.id)}" aria-label="查看任务：${esc(t.title)}"><div class="card-top"><div class="card-type"><span class="category-icon">${icon(c.icon)}</span><span>${c.name}</span></div><span class="pill ${status === 'open' ? '' : 'neutral'}">${t.dispute?.status === 'pending' ? '问题处理中' : STATUS[status]}</span></div><h3>${esc(t.title)}</h3><div class="card-route"><div class="route-row"><i class="route-dot"></i><span>${esc(location(t.pickup))}</span></div><div class="route-row"><i class="route-dot destination"></i><span>${esc(location(t.dropoff))}</span></div></div><div class="card-tags"><span>${esc(timeLeft(t))}</span><span>${t.buy ? `代买上限 ¥${money(t.budget)}` : '无需垫付'}</span>${t.distance ? `<span>约 ${t.distance} km · 示意</span>` : ''}</div><div class="card-bottom"><div class="person">${avatar(owner)}<span>${esc(owner.short)}同学</span>${verified(owner)}</div><div class="reward"><small>¥</small>${money(t.reward)}<span class="reward-label">跑腿报酬</span></div></div></button>`;
}
function heading(eyebrow, title, desc, action = '') { return `<div class="page-heading"><div>${eyebrow ? `<span class="eyebrow">${eyebrow}</span>` : ''}<h1>${title}</h1><p>${desc}</p></div>${action}</div>`; }
function minePage() {
  const uid = state.actor;
  const all = state.tasks.filter(t => ui.mine === 'published' ? t.owner === uid : t.runner === uid);
  const tasks = all.filter(t => ui.status === 'all' || statusOf(t) === ui.status || (ui.status === 'issue' && t.dispute?.status === 'pending'));
  return `${heading('', '我的任务', '发布的和接下的分开看，每一单的下一步都在卡片上。', btn(`${icon('plus', 'sm')}发布`, 'publish', 'secondary small'))}${!certified(userOf(state)) ? authBanner() : ''}<div class="tabs"><button class="tab ${ui.mine === 'published' ? 'active' : ''}" data-action="mine-tab" data-tab="published">我发布的</button><button class="tab ${ui.mine === 'accepted' ? 'active' : ''}" data-action="mine-tab" data-tab="accepted">我接下的</button></div><div class="status-filters">${[['all', '全部'], ['open', '待接单'], ['accepted', '已接单'], ['progress', '进行中'], ['delivered', '待确认'], ['completed', '已完成'], ['issue', '问题处理'], ['cancelled', '已取消'], ['expired', '已过期']].map(([key, label]) => `<button class="status-filter ${ui.status === key ? 'active' : ''}" data-action="status-filter" data-status="${key}">${label}</button>`).join('')}</div><div class="task-grid">${tasks.length ? tasks.map(taskCard).join('') : empty('这里还没有任务记录', '发布一个小需求，或在校园广场发现适合你的顺路。', 'to-square', '去任务广场')}</div>${footer()}`;
}
function authBanner() { return `<div class="auth-banner">${icon('shield')}<div>先完成在校认证，再开始互助<p>当前：${esc(authName(userOf(state)))} · 仅限南城大学演示学生</p></div>${btn('去认证', 'auth', 'secondary small')}</div>`; }
function messagesPage() {
  const messages=state.notifications.filter(n=>!n.user||n.user===state.actor);
  const conversations=state.tasks.filter(t=>t.runner&&[t.owner,t.runner].includes(state.actor)&&['accepted','progress','delivered','completed'].includes(t.status)).sort((a,b)=>(b.messages?.at(-1)?.at||b.acceptedAt||0)-(a.messages?.at(-1)?.at||a.acceptedAt||0));
  const reminders=ui.messageTab==='updates';
  return `<div class="wide-card">${heading('', '消息', '这单的小事，在这里说清楚。')}<div class="inbox-tabs" role="tablist" aria-label="消息分类"><button role="tab" aria-selected="${!reminders}" data-action="message-tab" data-tab="chats">订单私聊 <small>${conversations.length}</small></button><button role="tab" aria-selected="${reminders}" data-action="message-tab" data-tab="updates">进度提醒 <small>${unread()}</small></button></div>${reminders?`<div class="inbox-actions">${textBtn('全部已读','read')}</div><section>${messages.map(n=>`<button class="notification" data-action="${n.task?'detail':'demo'}" ${n.task?`data-id="${esc(n.task)}"`:''}><span class="category-icon">${icon(n.task?'tasks':'bell')}</span><div><h3>${!n.read?'· ':''}${esc(n.title)}</h3><p>${esc(n.body)}</p><time>${date(n.at)}</time></div>${icon('right','sm')}</button>`).join('')||empty('还没有新的提醒','订单进展会显示在这里。')}</section>`:`<p class="inbox-caption">接单后，只有这单双方能私聊。所有对话仅为本浏览器演示。</p><section class="conversation-list">${conversations.map(t=>{const peer=userOf(state,t.owner===state.actor?t.runner:t.owner),last=t.messages?.at(-1);return `<button class="conversation-row" data-action="chat" data-id="${esc(t.id)}">${avatar(peer)}<div><strong>${esc(peer.short)}同学 <small>${esc(STATUS[statusOf(t)])}</small></strong><span>${esc(t.title)}</span><p>${last?esc(last.text):t.status==='completed'?'任务已完成，暂无历史对话':'已接单，可以聊取件与交接细节'}</p></div>${icon('right','sm')}</button>`;}).join('')||empty('接单后，就能在这里聊','先发布需求或接下顺路任务。')} </section><button class="conversation-example" data-action="conversation-examples">体验一笔配送与私聊示例 <span>载入虚构数据 →</span></button><p class="inbox-caption">加费用、变更地点和代买报价，仍须通过任务确认；聊天不会自动更改约定。</p>`}${footer()}</div>`;
}
function estimateMarkup(t) {
  const e=deliveryEstimate(t,Date.now(),state,state.runs?.find(r=>r.id===t.deliveryRunId));
  const clock=e.arrivalAt?new Date(e.arrivalAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}):'';
  return `<section class="delivery-estimate" aria-label="本单预计送达"><div class="estimate-top"><span>到这单的交接点</span><span>步行模拟</span></div><div class="estimate-main"><strong data-arrival-headline>${esc(e.headline)}</strong><span data-arrival-clock>${clock?'预计 '+clock+' 到达':''}</span></div><div class="estimate-details"><span data-arrival-distance>${e.metres===null?'距离待更新':'剩余约 '+formatDistance(e.metres)}</span><span data-arrival-next>${esc(e.next)}</span></div><div class="estimate-progress" role="progressbar" aria-label="到当前站的步行进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(e.progress*100)}"><i style="width:${e.progress*100}%"></i></div><p data-arrival-note>${esc(e.note)} · 仅为估算</p></section>`;
}
function updateEstimate(t) {
  const box=modal.querySelector('.delivery-estimate');if(!box)return;
  const e=deliveryEstimate(t,Date.now(),state,state.runs?.find(r=>r.id===t.deliveryRunId));
  const values={'arrival-headline':e.headline,'arrival-clock':e.arrivalAt?'预计 '+new Date(e.arrivalAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})+' 到达':'','arrival-distance':e.metres===null?'距离待更新':'剩余约 '+formatDistance(e.metres),'arrival-next':e.next,'arrival-note':e.note+' · 仅为估算'};
  for(const [key,value]of Object.entries(values)){const el=box.querySelector(`[data-${key}]`);if(el&&el.textContent!==value)el.textContent=value;}
  box.querySelector('[role="progressbar"]').setAttribute('aria-valuenow',Math.round(e.progress*100));box.querySelector('.estimate-progress i').style.width=e.progress*100+'%';
}

function profilePage() {
  const u = userOf(state), completed = state.tasks.filter(t => t.runner === u.id && t.status === 'completed'), c = creditOf(state, u.id);
  return `<div class="wide-card"><section class="profile-hero">${avatar(u, 'big')}<div><h1>${esc(u.name)}</h1><p>${certified(u) ? `${SCHOOL.name} · ${esc(u.department)}` : '先认识彼此，再开始互助'}</p></div>${btn(authName(u), 'auth', 'secondary small')}</section><div class="profile-stats"><div class="profile-stat"><b>${c}</b><span>演示信用分</span></div><div class="profile-stat"><b>${completed.length}</b><span>完成跑腿</span></div><div class="profile-stat"><b>${reviewAverage(state, u.id)}</b><span>收到的评价</span></div></div><p class="section-caption">信用与身份认证分别展示。履约记录、评价与初始分数均为演示数据，不能替代对交易风险的判断。</p><div class="menu-card">${[['shield', '在校认证', 'auth', authName(u)], ['route', '接单身份', 'runner-onboard', u.runnerEnabled ? '已开通' : '未开通'], ['route', '信用与履约明细', 'credit', '每一笔都有依据'], ['wallet', '模拟费用记录', 'ledger', '不发生真实付款'], ['flag', '我的举报与问题', 'reports', '查看处理进度'], ['info', '互助规则与隐私', 'rules', '了解参与边界'], ['swap', '演示说明与切换身份', 'demo', '体验任务双方']].map(([glyph, label, action, hint]) => `<button class="menu-item" data-action="${action}">${icon(glyph)}<span>${label}</span><small>${esc(hint)}</small>${icon('right')}</button>`).join('')}</div>${footer()}</div>`;
}

function openDialog(title, body, info = {}) {
  const already = modal.open;
  if(ui.dialog?.type==='chat'&&info.type!=='chat'){ui.chatAttachment=null;ui.chatPhotoBusy=false;chatPhotoGeneration++;}
  ui.dialog = info;
  ui.tracking = null;
  modal.classList.toggle('tracking-modal',info.type==='tracking');
  modal.innerHTML = `<div class="modal-head"><h2 id="modal-title">${title}</h2><button class="icon-btn" data-action="close" aria-label="关闭">${icon('close')}</button></div><div class="modal-body">${body}<div class="form-error error-hidden" role="alert"></div></div>`;
  if (!already) { modal.showModal(); document.body.style.overflow = 'hidden'; }
  modal.scrollTop = 0;
  if (already) modal.querySelector('[data-action="close"]').focus({ preventScroll: true });
}
function closeDialog() {
  const wasChat=ui.dialog?.type==='chat';
  if(wasChat){ui.chatAttachment=null;ui.chatPhotoBusy=false;chatPhotoGeneration++;}
  saveDraft();
  modal.close(); document.body.style.overflow = ''; ui.dialog = null; ui.tracking = null;
  if (location.hash.startsWith('#task/')) history.replaceState(null, '', `#${ui.page}`);
  if(!syncSharedState()&&wasChat)render();
}
function showTask(id, updateHash = true) {
  syncSharedState(true);
  const raw = getTask(id); if (!raw) { toast('任务不存在或记录已重置'); closeDialog(); return; }
  if (updateHash && location.hash !== `#task/${id}`) history.pushState(null, '', `#task/${encodeURIComponent(id)}`);
  const t = visibleTask(state, raw), u = userOf(state), owner = userOf(state, t.owner), runner = t.runner ? userOf(state, t.runner) : null;
  const party = [t.owner, t.runner].includes(u.id), guest = !certified(u) && !party, st = statusOf(t);
  if (party && ['accepted','progress','delivered'].includes(st) && !ui.forceDetails) return showTracking(id,updateHash);
  const locationText = text => esc(text);
  let action = '';
  const commandBtn = (label, command, cls = 'primary') => btn(label, 'command', cls, `data-command="${command}" data-id="${esc(id)}"`);
  if (st === 'open') {
    action = t.owner === u.id ? `${btn('修改任务', 'edit-task', 'secondary', `data-id="${id}"`)}${btn('取消任务', 'cancel-open', 'ghost', `data-id="${id}"`)}` : btn(`${icon('check', 'sm')}确认约定，接下任务`, 'accept', 'primary', `data-id="${id}"`);
  } else if (party) {
    if (t.dispute?.status === 'pending') action = notice('问题已记录，等待模拟审核。未结算的费用暂缓处理；请保留商品及必要凭证。', 'warning', 'flag');
    else if (t.cancelRequest?.status === 'pending') {
      const request = t.cancelRequest;
      action = `<div class="action-panel"><h4>有一项取消申请待处理</h4><p>${esc(request.reason)}</p>${request.from === u.id ? '<p>等待对方确认，暂不继续履约或结算。</p>' : `${btn('同意取消并模拟退款', 'cancel-response', 'secondary small', `data-id="${id}" data-approve="yes"`)} ${btn('保留原约定', 'cancel-response', 'ghost small', `data-id="${id}" data-approve="no"`)}`}</div>`;
    } else if (st === 'accepted') action = t.runner === u.id ? commandBtn('开始这段顺路', 'start') : notice('同学已接单，等待对方开始履约。可通过任务内消息沟通。', '', 'clock');
    else if (st === 'progress') {
      if (t.runner === u.id) {
        if (t.buy && !t.purchase?.bought) {
          if (t.purchase?.status === 'pending') action = `<div class="action-panel"><h4>等待发布者确认采购报价</h4><p>报价尚未授权，不能先行购买。可以在演示面板切换为发布者处理。</p>${btn('撤回并重新报价', 'withdraw-quote', 'secondary small', `data-id="${id}"`)}</div>`;
          else if (t.purchase?.status === 'approved') action = `<div class="detail-actions">${btn('模拟购买并提交凭证', 'purchase', 'primary', `data-id="${id}"`)}${btn('价格有变，撤回报价', 'withdraw-quote', 'secondary', `data-id="${id}"`)}</div>`;
          else action = btn('提交商品与报价，等待确认', 'quote', 'primary', `data-id="${id}"`);
        } else action = btn('已送达，提交交接说明', 'deliver-form', 'primary', `data-id="${id}"`);
      } else if (t.buy && t.purchase?.status === 'pending') {
        action = `<div class="action-panel"><h4>请确认本次商品与费用</h4><p>${esc(t.purchase.item)}<br>商品 ¥${money(t.purchase.amount)} · 跑腿报酬 ¥${money(t.purchase.reward)}${t.purchase.amount > t.budget ? `<br>超出商品预算 ¥${money(t.purchase.amount - t.budget)}，同意时需要模拟补付。` : ''}</p><div class="detail-actions">${btn('核对并确认报价', 'approve-quote', 'primary small', `data-id="${id}"`)}${commandBtn('不同意，重新沟通', 'rejectQuote', 'secondary small')}</div></div>`;
      } else action = notice(t.buy && t.purchase?.bought ? '采购凭证已提交。请等待同学送达，收货时核对商品与费用。' : '同学正在履约。代买报价及变更会在这里请求确认。', '', 'route');
    } else if (st === 'delivered') action = t.owner === u.id ? btn('核对物品与费用，确认收货', 'complete-confirm', 'primary', `data-id="${id}"`) : notice('已提交送达，等待发布者核对并确认。你不能替对方确认完成。', '', 'clock');
    else if (st === 'completed') action = t.reviews.some(r => r.from === u.id) ? notice('你的评价已记录。一次任务只记一次履约与结算。', '', 'check') : btn('为这次互助留下评价', 'review', 'primary', `data-id="${id}"`);
  }
  const change = party && t.change?.status === 'pending' ? `<div class="action-panel"><h4>交接地点变更待确认</h4><p>新地点：${esc(t.change.dropoff)}<br>原因：${esc(t.change.reason)}<br>确认前继续保留原地点，暂停采购与送达。</p>${t.change.from !== u.id ? `${btn('同意变更', 'change-response', 'secondary small', `data-id="${id}" data-approve="yes"`)} ${btn('保持原地点', 'change-response', 'ghost small', `data-id="${id}" data-approve="no"`)}` : '<p>等待对方确认。</p>'}</div>` : '';
  const sensitive = party && t.sensitive && !['completed', 'cancelled'].includes(st) ? notice(`${icon('lock', 'sm')} 仅任务双方可见：${esc(t.sensitive)}。请勿公开转发。`, '', 'lock') : notice('取件凭据仅向接单后的任务双方开放。认证材料始终不公开。', '', 'lock');
  const statusPill = t.dispute?.status === 'pending' ? '<span class="pill warning">问题处理中</span>' : `<span class="pill ${st === 'open' ? '' : 'neutral'}">${STATUS[st]}</span>`;
  if (party && t.change?.status === 'pending') action = notice('请先处理交接地点变更，再继续履约或采购。', 'warning', 'clock');
  openDialog('一份校园里的小事', `<div class="detail-top"><div>${statusPill}<h3>${esc(t.title)}</h3><div class="detail-person">${avatar(owner)}<span>${esc(owner.short)}同学</span>${verified(owner)}<small>履约 ${state.tasks.filter(x => x.runner === owner.id && x.status === 'completed').length} 次</small></div></div><div class="reward"><small>¥</small>${money(t.reward)}<span class="reward-label">跑腿报酬</span></div></div><p class="description">${esc(t.description)}</p><div class="detail-section"><div class="detail-routes"><div class="route-row"><i class="route-dot"></i><div><small>${t.buy ? '购买地点' : '取件地点'}</small>${locationText(t.pickup)}</div></div><div class="route-row"><i class="route-dot destination"></i><div><small>公共交接点</small>${locationText(t.dropoff)}</div></div></div></div><div class="detail-section"><dl class="detail-info"><div><dt>完成期限</dt><dd>${esc(timeLeft(t))}<br><small>${date(t.deadline)}</small></dd></div><div><dt>任务类型</dt><dd>${CATEGORIES[t.category].name} · ${t.buy ? '需要代买垫付' : '物品已付款 / 无需垫付'}</dd></div><div><dt>物品说明</dt><dd>${esc(t.item || t.size)}</dd></div><div><dt>参与范围</dt><dd>南城大学 · 有效在校认证</dd></div></dl></div>${sensitive}
    ${party ? `${t.buy ? `<div class="detail-section"><h3>采购进度</h3><p class="section-caption">${purchaseStatus(t)}</p>${t.purchase ? `<p class="description">确认商品：${esc(t.purchase.item)}<br>本次报价 ¥${money(t.purchase.amount)}${t.purchase.bought ? `<br>实际支出 ¥${money(t.purchase.actual)}<br>虚构凭证：${esc(t.purchase.receipt)}` : ''}</p>` : ''}</div>` : ''}<div class="detail-section"><h3>费用明细 <span class="pill neutral">全部模拟</span></h3>${moneyTable(t)}</div>` : (t.buy ? notice(`商品预算上限 ¥${money(t.budget)}，与跑腿报酬分别计算。购买前须双方确认商品及报价。`) : '')}
    ${st === 'completed' && party ? `<div class="settle-success"><strong>${icon('check')}这份互助，已完成</strong><p>模拟结算 ¥${money(t.settlement.runnerPayout)} · 预算退回 ¥${money(t.settlement.refund)}<br>没有发生真实付款。</p></div>` : ''}${change}<div class="detail-actions">${action}</div>
    ${party && ['accepted', 'progress', 'delivered', 'completed'].includes(st) ? `<div class="sub-actions">${['accepted', 'progress', 'delivered'].includes(st) ? `${textBtn('任务内联系', 'chat', `data-id="${id}"`)}${['accepted', 'progress'].includes(st) && !t.cancelRequest?.status?.includes('pending') ? `${textBtn('申请取消', 'cancel-form', `data-id="${id}"`)} ${textBtn('变更交接点', 'change-form', `data-id="${id}"`)}` : ''}` : ''}${textBtn(t.dispute?.status === 'pending' ? '查看问题进度' : '遇到问题', 'dispute-form', `data-id="${id}"`)}${textBtn('切换演示身份', 'demo', `data-return="${id}"`)}</div>` : ''}
    ${party ? `<div class="detail-section" style="margin-top:24px"><h3>任务时间线${runner ? ` · 接单者 ${esc(runner.short)}同学` : ''}</h3><div class="timeline">${t.events.slice().reverse().map(e => `<div class="timeline-item">${esc(e.text)}<time>${date(e.at)}</time></div>`).join('')}</div></div>${t.reviews.map(r => `<div class="review-card">${esc(userOf(state, r.from).short)}同学 · ${'★'.repeat(r.rating)}<p>${esc(r.text)}</p></div>`).join('')}` : ''}<div class="sub-actions">${textBtn('举报任务', 'report-form', `data-id="${id}"`)}${textBtn('互助规则', 'rules')}</div>`, { type: 'detail', id });
  if (t.dispute?.status === 'pending' || t.cancelRequest?.status === 'pending' || t.change?.status === 'pending') {
    modal.querySelectorAll('[data-action="cancel-form"], [data-action="change-form"]').forEach(el => el.remove());
  }
  if (st==='open') {
    const {pickup,dropoff}=taskSpots(t), match=ui.mode==='runner'&&t.owner!==u.id?matchRoute(t,ui.from,ui.to,ui.via):null;
    const block=document.createElement('section'); block.className='task-route-preview';
    block.innerHTML=mapMarkup({route:match?.nodes||shortestPath(pickup,dropoff).nodes,pickup,dropoff})+(match?`<div class="route-preview-metrics"><span>到取件点 <b>${formatDistance(match.toPickup)}</b></span><span>额外绕行 <b>${formatDistance(match.extra)}</b></span><span>约多走 <b>${match.extra===0?0:walkMinutes(match.extra)} 分钟</b></span></div>`:'');
    modal.querySelector('.detail-top').after(block);
    const actions=modal.querySelector('.detail-actions');
    block.after(actions);
  }
  if(party&&t.deliveryProof&&st==='completed') {
    const proof=document.createElement('section');proof.className='delivery-proof';
    proof.innerHTML=`<strong>已保存的送达凭证 · ${esc(t.dropoff)}</strong><img src="./assets/handoff-sample.png" alt="AI 生成的虚构放置凭证样例"/><p>${date(t.deliveryProof.at)} · ${esc(t.deliveryNote)}<br>仅供本任务双方查看；照片为生成样例，不是真实证据。</p>`;
    modal.querySelector('.detail-top').after(proof);
  }
}
function showTracking(id,updateHash=true) {
  const t=getTask(id),u=userOf(state);
  if (!t || ![t.owner,t.runner].includes(u.id)) { toast('仅任务双方可以查看配送位置'); return; }
  if(updateHash && location.hash!==`#task/${id}`) history.pushState(null,'',`#task/${id}`);
  const snap=trackingSnapshot(t,Date.now(),state.actor,{state,run:state.runs?.find(r=>r.id===t.deliveryRunId)}),{pickup,dropoff}=taskSpots(t),isOwner=t.owner===u.id,r=userOf(state,isOwner?t.runner:t.owner);
  const command=(label,cmd)=>btn(label,'command','primary full',`data-id="${id}" data-command="${cmd}"`);
  let action='';
  if(t.dispute?.status==='pending') action=notice('问题已记录，暂缓结算。可查看处理进度，普通学生不能自行裁决。','warning');
  else if(t.cancelRequest?.status==='pending'||t.change?.status==='pending') action=btn('有一项约定待处理，点击查看','task-details','primary full',`data-id="${id}"`);
  else if(isOwner) {
    if(t.status==='delivered') action=btn(t.handoff==='safe_drop'?'我已取到物品，确认完成':'我已收到，确认完成','complete-confirm','primary full',`data-id="${id}"`);
    else if(t.purchase?.status==='pending') action=`${btn('采购商品与报价待你确认','approve-quote','primary full',`data-id="${id}"`)}${btn('不同意，退回报价','command','secondary full',`data-id="${id}" data-command="rejectQuote"`)}`;
    else action=btn(`${icon('chat','sm')}联系接单同学`,'chat','primary full',`data-id="${id}"`);
  } else if(t.status==='accepted') action=command('出发，去取件','start');
  else if(t.status==='progress') {
    if(t.buy&&!t.purchase?.bought) {
      action=t.purchase?.status==='pending'?`${notice('报价待发布者确认。请勿先购买，可切换演示身份处理。')}${btn('撤回并重新报价','withdraw-quote','secondary full',`data-id="${id}"`)}`:
        t.purchase?.status==='approved'?btn('按授权模拟购买，提交凭证','purchase','primary full',`data-id="${id}"`):btn('提交商品与报价，等待确认','quote','primary full',`data-id="${id}"`);
    } else action=t.pickedUpAt?btn(t.handoff==='safe_drop'?'到达后，提交放置凭证':'到达后，记录当面交接','deliver-form','primary full',`data-id="${id}"`):command('确认已取到物品','pickup');
  } else if(t.status==='delivered') action=`${notice(t.handoff==='safe_drop'?'已按授权放置并通知发布者，你可以离开，无需原地等候。报酬待对方确认后模拟结算。':'已记录交接，无需原地等待对方操作手机。模拟报酬待对方确认结算。')}${btn('查看待结算报酬','open-wallet','secondary full')}${btn('继续找沿途任务','continue-runner','secondary full')}`;
  const shared=state.runs?.find(r=>r.id===t.deliveryRunId),next=shared?.stops[shared.index];
  if(!isOwner&&next&&next.task!==id&&['accepted','progress'].includes(t.status))action=`${notice('请先完成同行路线的下一站，再处理本单。')}${btn('查看同行下一站','show-run','primary full')}`;
  if(!isOwner&&!t.pickedUpAt&&t.readyAt>Date.now()&&['accepted','progress'].includes(t.status)&&(!next||next.task===id))action=notice(`尚未到预约可取时间：${date(t.readyAt)}。可先与发布者联系。`);
  const fullPath=(t.runnerApproach||shortestPath(t.runnerStartSpot||'north',pickup).nodes).concat((t.runnerDelivery||shortestPath(pickup,dropoff).nodes).slice(1));
  const proof=t.deliveryProof?`<section class="delivery-proof"><div class="proof-heading"><strong>送达凭证 · ${esc(t.dropoff)}</strong><span>${date(t.deliveryProof.at)}</span></div><img src="./assets/handoff-sample.png" alt="虚构演示照片：无个人信息的纸箱放在公共交接架上" /><p>AI 生成照片样例 · 非真实拍摄 · ${esc(t.deliveryNote)}</p></section>`:'';
  const handoffText=t.handoff==='safe_drop'?'发布前已授权：放置到指定公共交接架，通知后可离开。请尽量在提示的自取时间内取走；超时不自动免责。':'交接方式：当面交接。未获放置授权，不能擅自放下离开。';
  openDialog(isOwner?'我的任务进度':'这段顺路的进度',`<div class="tracking-heading"><span class="live-label"><i></i>模拟位置 · 非 GPS</span><h3 data-track-title>${esc(snap.title)}</h3><p><span data-track-eta>${snap.eta}</span> · ${esc(t.title)}</p></div>${proof||mapMarkup({route:fullPath,pickup,dropoff,marker:snap.point,label:'任务配送示意地图，仅任务双方可查看'})}${estimateMarkup(t)}${trackingSteps(snap.step)}<div class="tracking-person">${avatar(r)}<div><strong>${esc(r.short)}同学 <span>同校认证 · 接单身份已开通</span></strong><p>从 ${esc(spotOf(pickup)?.short||'取件点')} 到 ${esc(spotOf(dropoff)?.short||'交接点')}</p></div>${textBtn('联系','chat',`data-id="${id}"`)}</div><div class="handoff-brief">${icon(t.handoff==='safe_drop'?'box':'user','sm')}<p>${handoffText}${t.pickupBy?`<br>建议自取时间：${date(t.pickupBy)} 前（演示参数）`:''}</p></div><div class="tracking-action">${action}</div><div class="tracking-links">${textBtn('约定与费用','task-details',`data-id="${id}"`)}${textBtn(t.dispute?.status==='pending'?'查看问题进度':'遇到问题','dispute-form',`data-id="${id}"`)}${textBtn('切换演示身份','demo',`data-return="${id}"`)}</div><p class="tracking-hint">模拟位置约按步行速度持续更新，关闭重开会延续进度；不是真实 GPS。取件、采购、送达和结算仍需本人确认。</p>`,{type:'tracking',id});
  modal.querySelector('.tracking-person strong span').textContent=isOwner?'同校认证 · 接单身份已开通':'任务发布者 · 同校认证';
  const who=document.createElement('span');who.className='tracking-who';who.textContent=`${isOwner?'接单者':'发布者'}：${r.short}同学`;
  modal.querySelector('.tracking-heading').append(who);
  modal.querySelector('.tracking-steps').after(modal.querySelector('.tracking-action'));
  if(!isOwner&&!t.pickedUpAt&&!t.buy&&['accepted','progress'].includes(t.status)) {
    const token=document.createElement('div');token.className='pickup-token';token.innerHTML=`<span>本任务的取件凭据 · 仅双方可见</span><strong>${esc(t.sensitive)}</strong><small>不能用于领取其他任务的物品，也不要转发给他人。</small>`;
    modal.querySelector('.tracking-action').before(token);
  }
  ui.tracking={id,tour:false};
}
function trackingSteps(step) { return `<ol class="tracking-steps">${['已接单','已取件','配送中','已送达'].map((label,i)=>`<li data-track-step="${i}" class="${i<=step?'done':''}"><i>${i<step?'✓':i+1}</i><span>${label}</span></li>`).join('')}</ol>`; }
function animateTracking(now) {
  if(!animateTracking.last||now-animateTracking.last>=200) {
    animateTracking.last=now;
    const tr=ui.tracking,t=tr&&getTask(tr.id);
    if(tr?.runId&&modal.open&&ui.dialog?.type==='run'){const run=state.runs?.find(r=>r.id===tr.runId),g=modal.querySelector('[data-map-marker]');if(run&&g){const current=getTask(run.stops[run.index]?.task);if(current)updateEstimate(current);const p=runPosition(state,run).point;g.innerHTML=`<g class="m-pin" transform="translate(${p.x} ${p.y})"><circle r="15" class="m-pin-ring"/><circle r="8" class="m-pin-dot"/></g>`;}}
    if(t&&modal.open&&ui.dialog?.type==='tracking') {
      const s=trackingSnapshot(t,Date.now(),state.actor,{state,run:state.runs?.find(r=>r.id===t.deliveryRunId)}),g=modal.querySelector('[data-map-marker]'),name=state.users[t.runner]?.short||'同';
      if(g){let pin=g.querySelector('.m-pin');if(!pin){g.innerHTML=`<g class="m-pin live"><circle r="15" class="m-pin-ring"/><circle r="11" class="m-pin-dot"/><text class="m-pin-letter" y="4.5" text-anchor="middle">${esc(name)}</text></g>`;pin=g.querySelector('.m-pin');}pin.classList.add('live');if(!pin.querySelector('.m-pin-letter')){pin.querySelector('.m-pin-dot').setAttribute('r','11');pin.insertAdjacentHTML('beforeend',`<text class="m-pin-letter" y="4.5" text-anchor="middle">${esc(name)}</text>`);}pin.setAttribute('transform',`translate(${s.point.x.toFixed(1)} ${s.point.y.toFixed(1)})`);}
      const title=modal.querySelector('[data-track-title]'),eta=modal.querySelector('[data-track-eta]');
      if(title&&title.textContent!==s.title)title.textContent=s.title;
      if(eta&&eta.textContent!==s.eta)eta.textContent=s.eta;
      updateEstimate(t);
      modal.querySelectorAll('[data-track-step]').forEach(li=>li.classList.toggle('done',Number(li.dataset.trackStep)<=s.step));
    }
  }
  requestAnimationFrame(animateTracking);
}
requestAnimationFrame(animateTracking);
function runnerOnboard(returnId=null) {
  if(!requireAuth(returnId?{id:returnId}:{type:'runner'}))return;
  const u=userOf(state);
  if(u.runnerEnabled) { if(returnId)showTask(returnId);else openDialog('我的接单身份',`${notice('演示接单身份已开通，在校认证仍须保持有效。','', 'shield')}<div class="auth-result"><h3>${esc(u.short)}同学 · 可以顺路接单</h3><p>南城大学 · ${esc(authName(u))}<br>具体任务由发布者与接单者绑定，不能领取其他人的物品。</p></div>${btn('查看沿途任务','continue-runner','primary full')}`,{type:'runner-status'});return; }
  openDialog('开通接单身份',`<p class="description">在校认证证明你属于本校；接单身份说明你愿意遵守取件、交接与费用约定。它不代表你能领取任何人的物品。</p><form id="runner-form" ${returnId?`data-id="${returnId}"`:''}><div class="help-grid"><div class="help-item"><b>先看顺路，再接单</b>接单前确认取送点、额外绕行、期限和报酬。最多同时运输4单，接单前一起核对取送顺序和时限；已记录送达的任务不要求你原地等待。</div><div class="help-item"><b>只取你接下的那一单</b>具体任务绑定双方，取件凭据仅向本任务接单者开放，不能转交或截取其他同学凭据。</div><div class="help-item"><b>按约定交接，留下必要凭证</b>未经发布者事先授权，不能擅自放置。已授权的指定公共点可记录凭证、通知后离开；异常须协商处理。</div></div><label class="check-row"><input type="checkbox" required name="agree"/><span>我理解任务与交接规范，具备履约条件，愿意按每个任务的约定完成。这只是演示开通，不是官方资格证书。</span></label><button type="submit" class="btn primary full">确认，开通演示接单身份</button></form>`,{type:'runner-onboard',id:returnId});
}
function purchaseStatus(t) {
  if (t.status === 'completed') return '商品、凭证与收货已确认 · 模拟结算已记录';
  if (t.status === 'cancelled') return '任务已取消 · 请查看费用退回记录';
  if (!t.purchase || ['withdrawn', 'rejected'].includes(t.purchase.status)) return t.purchase?.status === 'rejected' ? '本次报价未获同意，需要重新沟通。' : '01 提交商品与报价 → 02 发布者确认 → 03 购买并提交凭证';
  return { pending: '报价待发布者确认 · 尚未授权购买', approved: '商品与报价已确认 · 可按本次授权购买', bought: '已购买并提交凭证 · 等待交接核对' }[t.purchase.status];
}
function moneyTable(t, preview = false) {
  const amount = t.buy && t.purchase?.bought ? t.purchase.actual : 0;
  return `<table class="money-table"><tbody>${t.buy ? `<tr><td>商品预算上限</td><td>¥${money(t.budget)}</td></tr><tr><td>实际商品支出</td><td>${t.purchase?.bought ? `¥${money(amount)}` : '待购买凭证'}</td></tr>` : ''}${t.urgentBonus?`<tr><td>基础报酬</td><td>¥${money(t.reward-t.urgentBonus)}</td></tr><tr><td>加急报酬（已包含）</td><td>¥${money(t.urgentBonus)}</td></tr>`:""}<tr><td>跑腿报酬合计</td><td>¥${money(t.reward)}</td></tr><tr><td>发布者模拟预付</td><td>¥${money(t.prepaid)}</td></tr>${t.settlement ? `<tr><td>退回发布者</td><td>¥${money(t.settlement.refund)}</td></tr><tr class="total"><td>接单者模拟结算</td><td>¥${money(t.settlement.runnerPayout)}</td></tr>` : preview ? `<tr><td>确认后退回预算</td><td>¥${money(t.prepaid - amount - t.reward)}</td></tr><tr class="total"><td>确认后模拟结算</td><td>¥${money(amount + t.reward)}</td></tr>` : ''}</tbody></table>`;
}

function requireAuth(next) {
  if (certified(userOf(state))) return true;
  ui.afterAuth = next; showAuth(); return false;
}
function showAuth() {
  const u = userOf(state), auth = authName(u);
  if (certified(u)) {
    openDialog('我的在校认证', `<div class="auth-result">${icon('shield')}<span class="pill">${SCHOOL.name} · 模拟认证</span><h3>同一个校园，才开始互助</h3><p>${esc(u.name)} · ${esc(u.department)}<br>有效至 ${new Date(u.validUntil).toLocaleDateString('zh-CN')}<br>材料不对其他学生公开。</p></div>${notice('这是虚构身份的演示结果，不代表真实学籍核验。正式产品需接入学校身份系统或受控人工审核。')}${btn(ui.afterAuth ? '返回，继续刚才的操作' : '知道了', 'auth-return', 'primary full')}`, { type: 'auth' });
    return;
  }
  if (['pending', 'rejected', 'expired', 'restricted'].includes(u.auth)) {
    const descriptions = {
      pending: ['正在等待审核', '材料已模拟提交。审核结果出来前，暂不能发布或接单。'],
      rejected: ['这份材料需要补充', '演示原因：材料未显示当前在读学期。请使用清晰、有效的在校证明重新提交。'],
      expired: ['认证需要更新', '已超过演示认证有效期。原有任务的联系与问题处理仍保留，新增参与需重新认证。'],
      restricted: ['新增参与已受限', '演示原因：存在待核实的账号异常。不会直接删除既有任务，可查看说明与模拟申诉。']
    };
    const [title, desc] = descriptions[u.auth];
    openDialog('在校认证', `<div class="auth-result">${icon(u.auth === 'pending' ? 'clock' : 'shield')}<span class="pill warning">${esc(auth)}</span><h3>${title}</h3><p>${desc}</p></div>${notice('不上传真实证件。下方操作仅用于体验虚构审核状态。')}${u.auth === 'pending' ? `${btn('演示：查看审核通过结果', 'auth-state', 'primary full', 'data-status="verified"')}<div class="auth-mini-actions">${textBtn('演示未通过', 'auth-state', 'data-status="rejected"')}</div>` : btn(u.auth === 'restricted' ? '提交模拟申诉' : '重新提交演示材料', 'auth-retry', 'primary full')}`, { type: 'auth' });
    return;
  }
  openDialog('先认识，再顺路', `<p class="description">只让有效在校的同学参与互助。登录不等于认证，也不等于拿到所有人的个人信息。</p><div class="auth-steps"><span class="auth-step active"><b>1</b>确认学校</span><span class="auth-step active"><b>2</b>提交在校证明</span><span class="auth-step"><b>3</b>审核结果</span></div><form id="auth-form"><label class="field"><span>认证学校</span><input value="南城大学（虚构演示）" readonly /><small>首版为单校互助，学校不能由用户随意切换。</small></label><div class="cert-sample">${icon('school')}<div><b>在校证明 · 虚构样例</b><span>新同学 / 本学期在读 / 仅用于交互演示</span></div></div>${notice('演示使用内置样例，不收集真实学生证、身份证、手机号。实际在校资格须由学校官方身份或人工核验。')}<label class="check-row"><input type="checkbox" required name="consent" /><span>我理解这是模拟认证，认证材料应仅供授权审核，不在个人主页公开。</span></label><button class="btn primary full" type="submit">提交模拟认证</button></form>`, { type: 'auth' });
}
function authReturn() {
  const next = ui.afterAuth; ui.afterAuth = null;
  if (next?.type === 'publish') showPublish();
  else if(next?.type==='runner') runnerOnboard();
  else if (next?.id) showTask(next.id);
  else if(next?.type==='batch')showBatchPlan();
  else closeDialog();
}
function demoPanel(returnId = null) {
  const id = returnId || ui.dialog?.id || null;
  const extra = state.actor === 'visitor' ? `<div class="demo-divider"><p class="section-caption">新同学的模拟认证状态</p><div class="auth-mini-actions">${Object.entries(AUTH).map(([key, label]) => `<button data-action="auth-demo" data-status="${key}">${label}</button>`).join('')}</div></div>` : '';
  openDialog('演示说明 / 切换身份', `${notice('这里没有真实订单、支付或学籍核验。所有校园、同学和材料均为虚构；进度只保存在当前浏览器。')}<p class="description">切换身份可体验任务双方的权限。建议先用林同学发布任务，再切换周同学接单；收到报价时，切回发布者确认。</p>${Object.values(state.users).map(u => `<button class="actor-option ${state.actor === u.id ? 'selected' : ''}" data-action="switch-actor" data-actor="${u.id}" ${id ? `data-return="${esc(id)}"` : ''}>${avatar(u)}<div><strong>${esc(u.name)} ${u.id === 'visitor' ? '· 访客体验' : '· 同校学生'}</strong><small>${esc(authName(u))} · ${esc(u.department)}</small></div>${icon(state.actor === u.id ? 'check' : 'right')}</button>`).join('')}${extra}<div class="demo-divider"><p class="section-caption">代买示例：商品预算 30 元 + 报酬 5 元，实际购买 26 元；完成后模拟结算 31 元，退回 4 元。只有发布者能确认自己的预算与收货。</p>${btn(`${icon('refresh', 'sm')}重置全部演示数据`, 'reset-confirm', 'secondary full')}</div>`, { type: 'demo', returnId: id });
}
function rulesPanel() {
  openDialog('先说清楚，才能放心顺路', `<div class="help-grid"><div class="help-item"><b>01 / 同校身份，是参与的前提</b>未认证仅能看脱敏预览。认证有效、属于南城大学，才能发布与接单。学校邮箱不单独等于当前在读资格。</div><div class="help-item"><b>02 / 公共交接点，必要信息才开放</b>接单前不展示取件码、私人地址或手机号。认证材料不公开，交接不进入宿舍房间。</div><div class="help-item"><b>03 / 代买有上限，替换也要确认</b>商品预算与跑腿报酬分开。购买前确认商品和报价；缺货、超额、变更规格或加报酬，都要重新确认。首版商品预算上限 ¥200、报酬上限 ¥100，仅为演示参数。</div><div class="help-item"><b>04 / 不支持的事，就不发布</b>不支持代考、代刷考勤、代写、违规占座、账号密码出借、危险品及骚扰任务。代买只演示普通餐品和低价日用品，不含药品、烟酒、贵重物品。</div><div class="help-item"><b>05 / 完成、取消、争议，都留记录</b>接单者提交送达，发布者核对后确认。未购买时可双方协商取消；已购买或已送达应先处理物品和费用，不直接全额退款。不响应时可申请处理，不自动认定完成。</div><div class="help-item"><b>06 / 信用不是绝对保障</b>展示身份、履约次数与评价样本。完成跑腿演示加 2 分、封顶 100；重复点击不重复记分。举报或差评不直接判定有责。</div></div><p class="seed-note">正式服务需要后端鉴权、真实身份审核、并发抢单、支付账务及独立争议审核。本地 Demo 展示规则与流程，不提供这些真实能力。</p>`, { type: 'rules' });
}
function showCredit() {
  const u = userOf(state), done = state.tasks.filter(t => t.status === 'completed' && t.runner === u.id);
  openDialog('信用与履约明细', `<div class="credit-value">${creditOf(state, u.id)}<span>/ 100 · 演示分</span></div><div class="credit-progress"><i style="width:${creditOf(state, u.id)}%"></i></div>${notice('信用由初始演示分 + 完成跑腿次数 × 2 得到，封顶 100。同一任务只记一次；不因单次举报直接扣分。')}<div class="timeline"><div class="timeline-item">初始演示信用：${u.baseCredit} 分<time>样例数据，不代表真实历史</time></div>${done.map(t => `<div class="timeline-item">${esc(t.title)} · 履约 +2<time>${date(t.settlement.at)}</time></div>`).join('')}</div><p class="seed-note">${done.length} 次完成履约 · 收到评价 ${reviewAverage(state, u.id)}。新用户的演示初始分仅用于理解交互，不是安全担保。</p>`, { type: 'credit' });
}
function walletPage() {
  const w=walletSummary(state),u=userOf(state),row=(t,pending=false)=>`<button class="wallet-record" data-action="detail" data-id="${esc(t.id)}"><div><strong>${esc(t.title)}</strong><small>${pending?esc(stepLabel(t,state.actor)):date(t.settlement.at)}${t.buy?' · 含垫付返还':''}</small></div><b>${pending?'待结算 ':'+'}¥${money(pending?t.reward+(t.purchase?.bought?t.purchase.actual:0):t.settlement.runnerPayout)}</b></button>`;
  return `<div class="simple-heading"><h1>我的钱包</h1><p>${esc(u.short)}同学 · 每一笔顺路，都有记录。</p></div><section class="wallet-balance"><span>累计已到账 · 模拟收款</span><strong><small>¥</small>${money(w.total)}</strong><div><p>跑腿收入<b>¥${money(w.income)}</b></p><p>垫付返还<b>¥${money(w.reimbursement)}</b></p></div><small>任务确认完成后到账。仅演示记账，不产生真实资金，也不支持提现。</small></section><div class="wallet-stats"><section><span>待结算</span><strong>¥${money(w.pendingReward+w.pendingExpense)}</strong><small>报酬 ¥${money(w.pendingReward)}${w.pendingExpense?` · 垫付待返还 ¥${money(w.pendingExpense)}`:''}，发布者确认完成后到账</small></section><section><span>我发布的 · 模拟预付中</span><strong>¥${money(w.held)}</strong><small>已退回预算 ¥${money(w.refunded)}</small></section></div>${w.pending.length?`<section class="wallet-list"><h2>待收款任务 <span>${w.pending.length}</span></h2>${w.pending.map(t=>row(t,true)).join('')}</section>`:''}<section class="wallet-list"><h2>收款记录 <span>${w.received.length}</span></h2>${w.received.length?w.received.sort((a,b)=>b.settlement.at-a.settlement.at).map(t=>row(t)).join(''):`<div class="gentle-empty">${icon('bag')}还没有收款。完成任务后，报酬和垫付返还会在这里分开列明。</div>`}</section><div class="wallet-explain"><h3>跑腿费怎么收到？</h3><p>发布者模拟预付 → 接单送达 → 发布者确认完成 → 报酬记入你的钱包。只提交送达时仍是待结算；有争议则保留处理记录。</p>${btn('查看全部费用明细','ledger','secondary full')}</div>${footer()}`;
}
function showLedger() {
  const list = state.tasks.filter(t => [t.owner, t.runner].includes(state.actor));
  openDialog('模拟费用记录', `${notice('金额只用于交互演示，不扣款、不充值、不提现，也不代表真实资金托管。')}${list.map(t => `<div class="action-panel"><h4>${esc(t.title)}</h4><p>${t.owner === state.actor ? '我发布的' : '我接下的'} · ${STATUS[statusOf(t)]}${t.dispute?.status === 'pending' ? ' · 问题待处理' : ''}</p>${moneyTable(t)}${textBtn('查看任务', 'detail', `data-id="${t.id}"`)}</div>`).join('') || empty('还没有费用记录', '完成发布或接单后，这里会展示模拟费用明细。')}`, { type: 'ledger' });
}
function showReports() {
  const issues = state.tasks.filter(t => t.dispute && [t.owner, t.runner].includes(state.actor));
  const reports = state.reports.filter(r => r.from === state.actor);
  openDialog('我的举报与问题', `${notice('这版展示提交与待审核状态，没有真实客服在线处理。普通学生不能替平台裁决或处罚他人。')}${issues.map(t => `<div class="action-panel"><h4>${esc(t.title)} · 待模拟审核</h4><p>${esc(t.dispute.reason)}<br>物品与费用：${esc(t.dispute.goods)}</p>${textBtn('查看任务记录', 'detail', `data-id="${t.id}"`)}</div>`).join('')}${reports.map(r => `<div class="action-panel"><h4>任务举报 · 待模拟审核</h4><p>${esc(r.reason)}<br>${date(r.at)}</p></div>`).join('')}${!issues.length && !reports.length ? empty('暂无问题或举报记录', '需要帮助时，请从相关任务进入问题处理，保留约定与必要凭证。') : ''}`, { type: 'reports' });
}
const placePicker=document.createElement('dialog');placePicker.id='place-picker';placePicker.className='place-picker';document.body.append(placePicker);
let picking=null;
function openPlacePicker(field) {
  const f=document.querySelector('#quick-publish-form,#publish-form'),isTask=['pickup','dropoff'].includes(field);
  let current=isTask?(publishValues(f)[field+'Point']||identifySpot(f.elements[field].value)):ui[field];
  picking={field,point:current||null,isTask};
  const title={from:'我从这里出发',to:'准备去这里',via:'添加一个途经点',here:'设置模拟当前位置',pickup:'标出取件 / 购买位置',dropoff:'标出公共交接位置'}[field];
  placePicker.innerHTML=`<div class="modal-head"><h2>${title}</h2><button type="button" class="icon-btn" data-pin-action="close" aria-label="关闭选点">${icon('close')}</button></div><div class="modal-body"><p class="description">常用地点里没有？直接点地图落一个锚点，再写清楚公共地标。</p><label class="field"><span>常用地点（也可直接点下方地图）</span><select id="pin-preset"><option value="">自定义落点</option>${Object.entries(SPOTS).map(([id,p])=>`<option value="${id}" ${current===id?'selected':''}>${p.short}</option>`).join('')}</select></label><div id="pin-map"></div><form id="pin-form"><label class="field"><span>地点名称</span><input name="placeName" aria-label="地点名称" maxlength="40" required value="${esc(spotOf(current)?.name||'')}" placeholder="例如：林间教学楼 · 一楼公共门厅"/></label><details class="optional-fields"><summary>精确调整落点（示意坐标）</summary><div class="form-grid"><label class="field"><span>横向位置 X（20—580）</span><input name="x" aria-label="落点 X" type="number" min="20" max="580" value="${spotOf(current)?.x||300}"/></label><label class="field"><span>纵向位置 Y（20—390）</span><input name="y" aria-label="落点 Y" type="number" min="20" max="390" value="${spotOf(current)?.y||180}"/></label></div><button type="button" class="text-btn" data-pin-action="coordinates">更新落点</button></details><label class="check-row"><input type="checkbox" required/><span>此处为校内公共可达区域，不填写私人住址、房间号或真实敏感位置。</span></label><p class="field-hint">自定义交接点采用当面交接；未经审核的锚点不能当作允许无人放置的交接架。示意图不能判断真实道路是否可通行。</p><p class="form-error error-hidden" role="alert"></p><button type="submit" class="btn primary full">使用这个位置</button></form></div>`;
  renderPinMap();placePicker.showModal();
}
function renderPinMap(){const p=spotOf(picking.point);placePicker.querySelector('#pin-map').innerHTML=`<div class="interactive-map" data-map-key="picker">${mapMarkup({marker:p,label:'点击校园地图自由落点，可缩放拖动'})}<div class="map-tools"><button type="button" data-action="map-zoom" data-map="picker" data-factor="0.7" aria-label="放大地图">＋</button><button type="button" data-action="map-zoom" data-map="picker" data-factor="1.43" aria-label="缩小地图">−</button><button type="button" data-action="map-reset" data-map="picker">全图</button></div></div>`;bindMaps(placePicker,ui.mapViews,(_key,p)=>setPin(p.x,p.y));}
function setPin(x,y) {
  const f=placePicker.querySelector('#pin-form'),name=f.elements.placeName.value.trim()||'自定义位置';
  picking.point={x:Math.max(20,Math.min(580,Math.round(x))),y:Math.max(20,Math.min(390,Math.round(y))),name,short:name,custom:true};
  f.elements.x.value=picking.point.x;f.elements.y.value=picking.point.y;placePicker.querySelector('#pin-preset').value='';renderPinMap();
}
placePicker.addEventListener('click',e=>{
  const zoom=e.target.closest('[data-action="map-zoom"]'),reset=e.target.closest('[data-action="map-reset"]');if(zoom){zoomMap('picker',Number(zoom.dataset.factor),ui.mapViews);return;}if(reset){resetMap('picker',ui.mapViews);return;}
  const action=e.target.closest('[data-pin-action]')?.dataset.pinAction;
  if(action==='close'){placePicker.close();return;}
  if(action==='coordinates'){const f=placePicker.querySelector('#pin-form');if(f.elements.x.checkValidity()&&f.elements.y.checkValidity())setPin(Number(f.elements.x.value),Number(f.elements.y.value));return;}
});
placePicker.addEventListener('change',e=>{
  if(e.target.id!=='pin-preset'||!e.target.value)return;
  picking.point=e.target.value;const p=spotOf(picking.point),f=placePicker.querySelector('#pin-form');f.elements.placeName.value=p.name;f.elements.x.value=p.x;f.elements.y.value=p.y;renderPinMap();
});
placePicker.addEventListener('submit',e=>{
  e.preventDefault();e.stopPropagation();const f=e.target,raw=picking.point;
  const point=typeof raw==='string'&&f.elements.placeName.value.trim()===SPOTS[raw].name?raw:customPoint({...spotOf(raw),name:f.elements.placeName.value.trim()});
  if(!point){const err=f.querySelector('.form-error');err.textContent='请先在地图上落点，并填写公共地点名称。';err.classList.remove('error-hidden');return;}
  const {field,isTask}=picking;
  if(isTask&&fQuick()){const values=publishValues(fQuick()),p=spotOf(point);values[field]=p.name;values[field+'Point']=typeof point==='object'?point:null;values[field+'Spot']=typeof point==='string'?point:null;if(field==='dropoff'){values.dropConsent=false;if(typeof point==='object')values.handoff='meet';}ui.composer=values;placePicker.close();persistComposer();render();return;}
  if(isTask){const publish=modal.querySelector('#publish-form'),select=publish.elements[field],p=spotOf(point);if(![...select.options].some(o=>o.value===p.name))select.add(new Option(p.name+' · 自定义落点',p.name));select.value=p.name;publish.elements[field+'Point'].value=typeof point==='object'?JSON.stringify(point):'';if(field==='dropoff'){publish.elements.dropConsent.checked=false;if(typeof point==='object'){publish.elements.handoff.value='meet';publish.querySelector('.handoff-consent').hidden=true;publish.elements.dropConsent.required=false;}}saveDraft();}
  else{ui[field]=point;ui.hub=null;if(field==='to'||field==='via'){ui.routeEnabled=true;ui.routeEditing=true;}render();}
  placePicker.close();
});
function localInputDate(n) { const d = new Date(n); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function loadDraft() {
  try { return JSON.parse(localStorage.getItem(`${DRAFT_KEY}:${state.actor}`) || 'null') || {}; }
  catch { return {}; }
}
function saveDraft() {
  const f = document.querySelector('#quick-publish-form,#publish-form');
  if (!f || f.dataset.editId) return;
  const p = publishValues(f);if(f.id==='quick-publish-form'){ui.composer=p;ui.moreOpen=!!f.querySelector('details')?.open;}
  try { localStorage.setItem(`${DRAFT_KEY}:${state.actor}`, JSON.stringify(p)); } catch { /* Current form remains available. */ }
}
function fQuick(){return root.querySelector('#quick-publish-form');}
function persistComposer(){try{localStorage.setItem(`${DRAFT_KEY}:${state.actor}`,JSON.stringify(ui.composer||{}));}catch{}}
function showPublish(values=null,editId=null){if(editId)return showLegacyPublish(values,editId);closeDialog();ui.composer=values||ui.composer||loadDraft();ui.mode='request';ui.page='square';render();root.querySelector('.quick-item input')?.focus({preventScroll:true});}
function onDiscoveryPoint(key,point){
  if(key==='nearby'&&ui.locationPicking){ui.here=customPoint({...point,name:'自选当前位置',short:'自选位置'});ui.hub=null;ui.focusTask=null;render();return;}
  if(key==='request'){const field=ui.mapPicking||'dropoff';openPlacePicker(field);placePicker.querySelector('[name="placeName"]').value=field==='pickup'?'自选取件点':'自选送达点';setPin(point.x,point.y);return;}
  ui.pendingAnchor={...point,name:'自选公共位置',short:'自选位置',custom:true};
  openDialog('使用这个地图位置',`<p class="description">你可以在常用点之间或偏僻的公共位置落点。</p><label class="field"><span>位置名称</span><input id="anchor-name" maxlength="40" value="自选公共位置"/></label><div class="anchor-actions">${btn('设为模拟当前位置','anchor-here','primary full')}${btn('设为目的地，筛顺路单','anchor-to','secondary full')}</div>`,{type:'anchor'});
}
function anchorValue(){return customPoint({...ui.pendingAnchor,name:modal.querySelector('#anchor-name')?.value||'自选公共位置'});}
function showBatchPlan(){
  syncSharedState(true);
  const chosen=state.tasks.filter(t=>ui.selected.includes(t.id)&&statusOf(t)==='open'),active=activeTransport(state);if(!chosen.length){toast('先挑选想带的任务');return;}
  if(active.length+chosen.length>MAX_CARRY){toast('最多同时运输4单，请减少选择');return;}
  const current=state.runs?.find(r=>r.runner===state.actor&&r.taskIds.some(id=>active.some(t=>t.id===id))),pos=current?runPosition(state,current).point:null;
  const from=pos?{...pos,name:'同行当前位置',short:'当前位置',custom:true}:ui.routeEnabled?ui.from||ui.here:ui.here;
  const plan=planBatch([...active,...chosen],from,{to:ui.routeEnabled?ui.to:null,via:ui.routeEnabled?ui.via:null});
  if(!plan){toast('无法规划这组任务，请减少选择');return;}
  const names=id=>state.tasks.find(t=>t.id===id)?.title||'';
  openDialog(`一起带 ${chosen.length} 单 · 报酬 ¥${money(chosen.reduce((n,t)=>n+t.reward,0))}`,`<p class="description">按步行约1.2米/秒，含每站取件/交接的示意停留时间。${active.length?'已把手头任务一起计算。':''}每笔代买仍需单独获得商品报价授权。</p>${mapMarkup({route:plan.nodes,marker:spotOf(from),label:'同行取送路线示意'})}<ol class="batch-stops">${plan.stops.map(stop=>`<li><i>${stop.kind==='pickup'?'取':stop.kind==='dropoff'?'送':'经'}</i><div><strong>${esc(spotOf(stop.ref)?.short||'公共点')}</strong><small>${esc(names(stop.task))}</small></div><time>${new Date(stop.at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})}</time></li>`).join('')}</ol>${plan.feasible?notice('这组任务预计能在各自期限前送到（示意）。实际位置和时间仍需双方确认。'):notice('组合预计无法按时送到，请减少任务或换选其他单。','warning')}<div class="modal-actions">${btn('返回调整','close','secondary')}${plan.feasible?btn(`确认接下 ${chosen.length} 单`,'batch-confirm','primary'):''}</div>`,{type:'batch-preview',ids:chosen.map(t=>t.id)});
}
function showRun(){
  const active=activeTransport(state),run=state.runs?.find(r=>r.runner===state.actor&&r.taskIds.some(id=>active.some(t=>t.id===id)));
  if(!run){if(active.length)return showTask(active[0].id);openDialog('这一趟运输已结束',`${notice('已提交交接的任务可去钱包看待结算，发布者确认后才到账。')}${btn('继续看附近需求','continue-runner','primary full')}${btn('查看钱包','open-wallet','secondary full')}`,{type:'run-done'});return;}
  const snap=runPosition(state,run),stop=run.stops[run.index],task=state.tasks.find(t=>t.id===stop?.task),remaining=run.stops.slice(run.index);
  openDialog(`同行取送 · ${active.length} 单在途中`,`<div class="tracking-heading"><span class="live-label"><i></i>模拟位置 · 非GPS</span><h3>${snap.paused?'有同行约定待处理':stop?`下一站：${esc(spotOf(stop.ref)?.short)}`:'本趟已送达'}</h3><p>${task?esc(task.title):''}</p></div>${mapMarkup({route:pathThrough(run.from,...remaining.flatMap(s=>[...(s.viaBefore||[]),s.ref])).nodes,marker:snap.point,label:'同行当前位置与取送顺序'})}${task?estimateMarkup(task):''}${task?btn(snap.paused?'查看待处理任务':stop.kind==='pickup'?'前往当前任务，确认取件':'前往当前任务，记录交接','detail','primary full',`data-id="${task.id}"`):''}<ol class="batch-stops">${remaining.map(s=>`<li><i>${s.kind==='pickup'?'取':'送'}</i><div><strong>${esc(spotOf(s.ref)?.short)}</strong><button class="text-btn" data-action="detail" data-id="${s.task}">查看对应任务</button></div></li>`).join('')}</ol><p class="tracking-hint">共用一条人物轨迹；每次确认实际取件或交接，才推进下一站。不会按时间自动完成任务。</p>`,{type:'run'});
  ui.tracking={runId:run.id};
}
function showLegacyPublish(values = null, editId = null) {
  if (!requireAuth({ type: 'publish' })) return;
  const source = editId ? getTask(editId) : null;
  const d = values || (source ? { ...source, reward: money(source.reward), budget: money(source.budget), deadline: localInputDate(source.deadline) } : loadDraft());
  openDialog('发布一份校园里的小事', `<p class="description">清楚的约定，是放心互助的开始。仅限本校公共场所交接。</p><form id="publish-form"><div class="form-grid"><label class="field full"><span>任务标题</span><input name="title" value="${esc(d.title || '')}" required maxlength="40" placeholder="例如：帮我从食堂带一份午餐" /></label><label class="field"><span>任务类别</span><select name="category">${Object.entries(CATEGORIES).filter(([key]) => key !== 'all').map(([key, c]) => `<option value="${key}" ${d.category === key ? 'selected' : ''}>${c.name}</option>`).join('')}</select></label><label class="field"><span>最晚完成时间</span><input name="deadline" type="datetime-local" required value="${esc(d.deadline || localInputDate(Date.now() + 3600000))}" min="${localInputDate(Date.now())}" /></label><label class="field"><span>取件 / 购买地点</span><input name="pickup" required maxlength="60" value="${esc(d.pickup || '')}" placeholder="例如：第一食堂 · 一楼" /></label><label class="field"><span>公共交接地点</span><input name="dropoff" required maxlength="60" value="${esc(d.dropoff || '')}" placeholder="例如：设计楼 · 公共大厅" /></label><label class="field full"><span>物品 / 商品规格与数量</span><input name="item" required maxlength="150" value="${esc(d.item || '')}" placeholder="例如：鸡腿饭 × 1，少辣、不加香菜" /></label><label class="field full"><span>任务说明</span><textarea name="description" required maxlength="300" placeholder="说明取件时间、重量体积、特殊要求；不填写真实取件码、手机号或宿舍房间。">${esc(d.description || '')}</textarea></label><label class="field"><span>跑腿报酬 / 元</span><input name="reward" type="number" min="0.01" max="100" step="0.01" required value="${esc(d.reward || '')}" inputmode="decimal" placeholder="例如：5" /><small>正数，上限 ¥100，为演示参数。</small></label><label class="field"><span>商品垫付上限 / 元</span><input name="budget" type="number" min="0.01" max="200" step="0.01" value="${esc(d.budget || '')}" inputmode="decimal" placeholder="仅代买需填写" ${d.buy ? 'required' : 'disabled'} /><small>与报酬分开，最高 ¥200。</small></label></div><label class="check-row"><input type="checkbox" name="buy" ${d.buy ? 'checked' : ''} /><span>需要接单同学代买并垫付商品款，购买前必须由我确认商品与报价；换品或超预算重新确认。</span></label>${notice('禁止代考、代刷、代写、违规占座及危险物品。代买仅限普通餐品和低价日用品。请勿填写真实个人敏感信息。')}<label class="check-row"><input type="checkbox" name="agreement" required /><span>我已确认任务符合互助范围，物品轻小、可由一位同学携带，并理解所有费用仅为模拟。</span></label><div class="form-error error-hidden" role="alert"></div><button class="btn primary full" type="submit">下一步，确认约定与模拟预付</button><p class="seed-note">草稿会保存在当前身份、当前浏览器中。暂不发送给真实用户。</p></form>`, { type: 'publish' });
  enhancePublishForm(d,source);
}
function publishValues(form) {
  const values=Object.fromEntries(new FormData(form));values.buy=form.elements.buy.checked;
  for(const key of ['pickupPoint','dropoffPoint']){try{values[key]=values[key]?JSON.parse(values[key]):null;}catch{values[key]=null;}}
  return values;
}
function enhancePublishForm(values={},source=null) {
  const form=modal.querySelector('#publish-form');if(!form)return;
  for(const name of ['pickup','dropoff']) {
    const old=form.elements[name],selected=identifySpot(values[name]||''),point=typeof values[name+'Point']==='string'?JSON.parse(values[name+'Point']||'null'):values[name+'Point'],select=document.createElement('select');
    select.name=name;select.required=true;
    select.innerHTML=`<option value="">选择校内公共${name==='pickup'?'取件':'交接'}点</option>`+Object.entries(SPOTS).map(([id,p])=>`<option value="${p.name}" ${!point&&id===selected?'selected':''}>${p.name}</option>`).join('')+(point?`<option value="${esc(point.name)}" selected>${esc(point.name)} · 自定义落点</option>`:'');
    old.replaceWith(select);
    const hidden=document.createElement('input');hidden.type='hidden';hidden.name=name+'Point';hidden.value=point?JSON.stringify(point):'';select.after(hidden);
    select.insertAdjacentHTML('afterend',`<button type="button" class="pin-link" data-action="pick-place" data-field="${name}">${icon('pin','sm')}地图选点 / 自定义位置</button>`);
  }
  const group=document.createElement('div'); group.className='handoff-choice';
  group.innerHTML=`<label class="field"><span>怎么交接？</span><select name="handoff" aria-label="交接方式"><option value="meet" ${values.handoff!=='safe_drop'?'selected':''}>当面交接 · 约定公共点碰面</option><option value="safe_drop" ${values.handoff==='safe_drop'?'selected':''}>指定交接架自取 · 事先授权放置</option></select></label><label class="check-row handoff-consent" ${values.handoff!=='safe_drop'?'hidden':''}><input type="checkbox" name="dropConsent" ${values.dropConsent?'checked':''} ${values.handoff==='safe_drop'?'required':''}/><span>我授权将物品放到所选指定交接架。接单者记录放置凭证并通知我后可离开；我会及时自取，丢失或放置争议不由倒计时自动判责。</span></label><p class="field-hint">自取仅支持图书馆、设计楼及二/三号楼下的演示交接架。不承诺真实监控或值守。</p>`;
  form.querySelector('.form-grid').after(group);
  // Keep required decisions visible; optional prose does not block a quick, clear request.
  const optional=document.createElement('details'); optional.className='optional-fields';optional.innerHTML='<summary>补充标题和说明（可选）</summary>';
  for(const name of ['title','description']) {form.elements[name].required=false;optional.append(form.elements[name].closest('.field'));}
  group.after(optional);
  if(!source&&!values.reward) form.elements.reward.value='2';
}
function publishPreview(form) {
  const values = publishValues(form);
  if(form.id==='quick-publish-form'){saveDraft();if(!requireAuth({type:'publish'}))return;if(values.scheduled){if(!values.scheduledReady||!values.scheduledDeadline){error('请选择预约可取时间和送达期限');return;}values.readyAt=new Date(values.scheduledReady).getTime();values.deadline=new Date(values.scheduledDeadline).getTime();}else{values.readyAt=Date.now();values.deadline=Date.now()+Number(values.quickMinutes||30)*60000;}}
  if(!values.title?.trim()) values.title=`${CATEGORIES[values.category].name}：${values.pickupPoint?.short||SPOTS[identifySpot(values.pickup)]?.short||'取件点'} → ${values.dropoffPoint?.short||SPOTS[identifySpot(values.dropoff)]?.short||'交接点'}`;
  if(values.title.length>40)values.title=values.title.slice(0,40);
  if(!values.description?.trim()) values.description=`${values.item}。请按已确认的时间、公共地点和交接方式完成。${values.buy?'购买前先确认商品及报价。':''}`;
  saveDraft(); ui.draft = values;
  const editId = ui.dialog?.editId;
  const command = editId ? 'edit' : 'create';
  const payload = { ...values, deadline: new Date(values.deadline).getTime(), ...(editId ? { id: editId } : {}) };
  try {
    const proposed = evolve(state, command, payload);
    const preview = editId ? proposed.tasks.find(t => t.id === editId) : proposed.tasks[0];
    openDialog('确认约定与模拟预付', `<div class="detail-top"><div><span class="pill">发布前最后确认</span><h3>${esc(preview.title)}</h3></div></div><p class="description">${esc(preview.description)}<br><br>${esc(preview.item)}<br>取：${esc(preview.pickup)}<br>送：${esc(preview.dropoff)}<br>最晚：${date(preview.deadline)}</p><div class="summary-box">${moneyTable(preview)}<p class="seed-note">${preview.buy ? '商品预算上限 + 跑腿报酬；收货后凭实际费用结算，多余预算退回。' : '无需商品垫付，仅模拟预付跑腿报酬。'}</p></div>${notice('点击确认只产生演示任务和模拟费用记录，不发生真实扣款。')}<div class="modal-actions">${btn('返回修改', 'publish-back', 'secondary')}${btn(`模拟预付 ¥${money(preview.prepaid)} 并发布`, 'publish-confirm')}</div>`, { type: 'publish-preview', payload });
    ui.dialog.command = command; ui.dialog.editId = editId;
    modal.querySelector('.description').insertAdjacentHTML('beforeend',`<br>交接：${preview.handoff==='safe_drop'?'已明确授权指定公共交接架自取；凭证通知后接单者可离开':'当面交接，不允许擅自放置'}`);
    if (editId) {
      modal.querySelector('#modal-title').textContent = '确认任务修改与模拟预算';
      modal.querySelector('[data-action="publish-confirm"]').textContent = '确认修改并更新模拟预算';
      const before = getTask(editId).prepaid, delta = preview.prepaid - before;
      modal.querySelector('.summary-box').insertAdjacentHTML('beforeend', notice(`原模拟预付 ¥${money(before)}；修改后 ¥${money(preview.prepaid)}。${delta >= 0 ? `本次模拟补付 ¥${money(delta)}` : `本次模拟退回 ¥${money(-delta)}`}，确认后才生效。`));
    }
  } catch (e) { error(e.message); }
}
function taskForm(kind, id) {
  const t = getTask(id); if (!t) return;
  const u = userOf(state), owner = t.owner === u.id;
  const form = (title, content, label, action = kind) => openDialog(title, `<form data-task-form="${action}" data-id="${esc(id)}">${content}<div class="form-error error-hidden" role="alert"></div><div class="modal-actions">${btn('返回任务', 'detail', 'secondary', `data-id="${id}"`)}<button type="submit" class="btn primary">${label}</button></div></form>`, { type: kind, id });
  const field = (label, name, value = '', type = 'text', extra = '') => `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" required ${extra} /></label>`;
  const area = (label, name, placeholder) => `<label class="field"><span>${label}</span><textarea required name="${name}" maxlength="${name === 'reason' ? 300 : 200}" placeholder="${placeholder}"></textarea></label>`;
  if (kind === 'quote') {
    form('先说清楚，再购买', `${notice('报价要得到发布者明确确认。缺货、换规格、涨价或加报酬时，撤回旧报价后重新提交。')}${field('本次待购商品 / 规格 / 数量', 'item', t.purchase?.item || t.item, 'text', 'maxlength="150"')}${field('商品报价 / 元', 'amount', t.purchase ? money(t.purchase.amount) : '', 'number', 'min="0.01" max="200" step="0.01" inputmode="decimal"')}<p class="section-caption">原商品预算上限 ¥${money(t.budget)}；超出上限时，发布者需同意并模拟补足预算。</p>${field('本次跑腿报酬 / 元', 'reward', money(t.reward), 'number', 'min="0.01" max="100" step="0.01"')}<label class="check-row"><input type="checkbox" required /><span>我尚未购买，等待对方确认；预算授权不代表可以随意替换商品。</span></label>`, '提交，等待对方确认');
  } else if (kind === 'purchase') {
    if (t.purchase?.status !== 'approved') { toast('报价尚未得到确认'); return showTask(id); }
    form('模拟购买 / 提交凭证', `${notice('仅能购买本次已确认的商品，实际费用不能超过授权报价。此处不发生真实购买。')}<div class="summary-box"><p class="description">${esc(t.purchase.item)}<br>已授权商品报价 ¥${money(t.purchase.amount)}</p></div>${field('实际商品支出 / 元', 'amount', money(t.purchase.amount), 'number', `min="0.01" max="${money(t.purchase.amount)}" step="0.01" inputmode="decimal"`)}${area('虚构购物凭证说明', 'receipt', '例如：演示小票 NC-102，鸡腿饭 1 份，实付 26 元。不要填写真实订单或上传敏感资料。')}<label class="check-row"><input type="checkbox" required /><span>商品和数量与确认内容一致；虚构凭证金额与实际支出字段一致。</span></label>`, '记录模拟购买与凭证', 'buy');
  } else if (kind === 'deliver') {
    if(t.handoff==='safe_drop') {
      form('放到约定点，留凭证就能离开',`${notice('发布者已事先授权指定交接架放置。核对位置、记录凭证并通知对方后，无需原地等待。')}<label class="field"><span>本任务唯一授权的放置点</span><select name="spot"><option value="${t.dropoffSpot}">${esc(t.dropoff)}</option></select></label><input type="hidden" name="proof" value=""/><div class="sample-photo" hidden><img src="./assets/handoff-sample.png" alt="AI 生成的虚构包裹放置照片样例"/><p>AI 生成样例 · 非真实拍摄，不包含真实身份与取件信息</p></div>${btn('模拟拍照，使用虚构凭证样例','sample-photo','secondary full')}${area('补充放置说明','note','例如：已放至三号楼下约定交接架，请及时取走（演示）。')}<label class="check-row"><input type="checkbox" required/><span>我已核对授权地点和物品。凭证仅供双方查看；未按约定放置不能因倒计时结束自动免责。</span></label>`,'记录送达并通知对方','deliver');
    } else form('记录当面交接', `${notice('此任务未授权自行放置。请在约定公共点当面交接，不进入宿舍，不拍摄私人空间。')}${area('交接说明', 'note', '例如：已在图书馆南门当面交接，请核对物品。此处为模拟交接。')}`, '提交交接，等对方确认','deliver');
  } else if (kind === 'cancel') {
    if (t.pickedUpAt || t.purchase?.bought || t.status === 'delivered') return taskForm('dispute', id);
    form('先沟通，再取消', `${notice('接单后须由另一方确认取消。申请处理中暂不继续履约或结算；已购买的任务需先处理物品与费用。', 'warning')}${area('取消原因', 'reason', '说明为什么无法继续履约；不要包含真实个人信息。')}`, '向另一方提出取消申请', 'requestCancel');
  } else if (kind === 'change') {
    form('变更公共交接地点', `${notice('新地点必须由另一方确认。确认前保留原地点，暂不继续采购或提交送达。')}<p class="section-caption">原地点：${esc(t.dropoff)}</p>${field('新公共交接地点', 'dropoff', '', 'text', 'maxlength="60"')}${area('变更原因', 'reason', '例如：临时调课，希望改在教学楼公共大厅交接。')}`, '提交变更，等待确认');
  } else if (kind === 'dispute') {
    if (t.dispute?.status === 'pending') {
      return openDialog('问题处理进度', `${notice('已记录，等待模拟审核。当前没有真实客服或自动裁决。', 'warning', 'flag')}<div class="action-panel"><h4>${esc(t.title)}</h4><p>问题：${esc(t.dispute.reason)}<br>物品及费用：${esc(t.dispute.goods)}<br>提交于 ${date(t.dispute.at)}</p><p>${t.dispute.alreadySettled ? '此前已结算，不自动撤销账目。后续补偿需单独审核。' : '暂缓结算与责任判定，不因提出问题直接扣对方信用。'}</p></div>${btn('查看任务记录', 'detail', 'secondary full', `data-id="${id}"`)}`, { type: 'issue', id });
    }
    form('说明问题，保留约定', `${notice('描述未收到、物品不符、失联或其他异常。已购买时必须说明物品及垫付款去向；不直接认定任何一方有责。', 'warning')}${area('发生了什么问题', 'reason', '描述问题及双方已经沟通的情况。')}${area('物品与费用当前在哪里', 'goods', '例如：物品仍由接单者保管，已垫付 26 元，尚未退货。使用虚构信息。')}`, '提交问题，申请处理', 'dispute');
  } else if (kind === 'report') {
    if (!requireAuth({ id })) return;
    form('举报不合适的任务', `${notice('举报会记录原因并等待模拟审核，不会因一次举报直接处罚对方。紧急情况请使用当地适用的紧急求助渠道。')}${area('举报原因与必要说明', 'reason', '例如：任务包含违规占座要求。不要填写真实敏感资料。')}`, '提交举报', 'report');
  } else if (kind === 'review') {
    ui.rating = 5;
    form('为这份善意，留一点回应', `<p class="description">评价对象：${esc(userOf(state, owner ? t.runner : t.owner).short)}同学。只有完成的任务可评价，每方一次；不要求好评才能结算。</p><div class="review-stars" role="group" aria-label="选择星级">${[1,2,3,4,5].map(n => `<button type="button" class="selected" data-action="rating" data-rating="${n}" aria-label="${n} 星" aria-pressed="${n === 5}">${icon('star')}</button>`).join('')}</div><input type="hidden" name="rating" value="5" />${area('简短说说这次体验', 'text', '守时、沟通清楚，或者你希望对方改进的地方。')}`, '提交一次评价', 'review');
  }
}
let chatPhotoGeneration=0;
const chatImageViewer=document.createElement('dialog');chatImageViewer.className='chat-image-viewer';chatImageViewer.id='chat-image-viewer';document.body.append(chatImageViewer);
chatImageViewer.addEventListener('click',e=>{if(e.target===chatImageViewer||e.target.closest('[data-image-close]'))chatImageViewer.close();});
function showChatImage(index){
  const t=getTask(ui.dialog?.id),image=t&&[t.owner,t.runner].includes(state.actor)&&chatImage(t.messages?.[index]?.image);
  if(!image)return;
  chatImageViewer.innerHTML=`<div class="photo-view-head"><strong>订单沟通图片</strong><button type="button" data-image-close>返回对话 ${icon('close','sm')}</button></div><img src="${esc(image.src)}" alt="订单交接沟通图片的大图"/><p>${image.sample?'内置虚构交接样图 · 非真实拍摄':'本地图片，仅保存在当前浏览器'} · 图片用于沟通，交接仍需在订单中确认。</p>`;
  chatImageViewer.showModal();
}
function paintChatAttachment(){
  const box=modal.querySelector('.chat-attachment'),input=modal.querySelector('.message-form [name="text"]');if(!box||!input)return;
  const image=ui.chatAttachment?.task===ui.dialog?.id?ui.chatAttachment.image:null;
  box.hidden=!image;input.required=!image;
  box.innerHTML=image?`<img src="${esc(image.src)}" alt="待发送图片预览"/><div><strong>图片已准备好，尚未发送</strong><small>${image.sample?'内置虚构交接样图 · 非实拍':'照片已缩小处理，仅保存在本地演示'}<br>可补充一句交接说明</small></div><button type="button" data-action="chat-photo-remove" aria-label="移除待发送图片">${icon('close','sm')}</button>`:'';
}
async function selectChatPhoto(file,id,sample=false){
  if(ui.dialog?.type!=='chat'||ui.dialog.id!==id)return;
  const token=++chatPhotoGeneration;ui.chatPhotoBusy=true;modal.querySelector('.form-error')?.classList.add('error-hidden');
  const status=modal.querySelector('.chat-photo-status');if(status)status.textContent='正在准备图片…';
  modal.querySelector('.chat-photo-actions').hidden=true;
  const send=modal.querySelector('.message-form [type="submit"]');if(send)send.disabled=true;
  try{
    const image=await prepareChatImage(file);
    if(token!==chatPhotoGeneration||ui.dialog?.type!=='chat'||ui.dialog.id!==id)return;
    ui.chatAttachment={task:id,image:{...image,...(sample?{sample:true}:{})}};paintChatAttachment();
  }catch(e){if(token===chatPhotoGeneration&&ui.dialog?.id===id)error(e.message||'图片无法读取，请换一张照片');}
  finally{if(token===chatPhotoGeneration){ui.chatPhotoBusy=false;if(status?.isConnected)status.textContent='';if(send?.isConnected)send.disabled=false;}}
}
async function loadChatSample(){
  const id=ui.dialog?.id;
  try{const response=await fetch(new URL('./assets/handoff-sample.png',import.meta.url));if(!response.ok)throw new Error('交接样图暂时不可用');await selectChatPhoto(new Blob([await response.blob()],{type:'image/png'}),id,true);}
  catch(e){error(e.message);}
}
const chatScrollFollowers=new WeakMap();
function followLatestChatImage(list){
  chatScrollFollowers.get(list)?.abort();const follower=new AbortController();chatScrollFollowers.set(list,follower);
  let following=true;const stop=()=>{following=false;},scroll=()=>{if(following&&list.isConnected)list.scrollTop=list.scrollHeight;};
  list.addEventListener('wheel',stop,{once:true,signal:follower.signal});list.addEventListener('pointerdown',stop,{once:true,signal:follower.signal});
  list.querySelectorAll('img').forEach(img=>{if(!img.complete)img.addEventListener('load',scroll,{once:true,signal:follower.signal});});
  scroll();requestAnimationFrame(scroll);
}
function chatMessages(t){
  return t.messages?.length?t.messages.map((m,index)=>`<div class="bubble-row ${m.from===state.actor?'mine':''}">${avatar(userOf(state,m.from))}<div>${m.text?`<p class="bubble">${esc(m.text)}</p>`:""}${chatImage(m.image)?`<button class="chat-photo-bubble" data-action="chat-image-view" data-index="${index}" aria-label="查看订单图片"><img src="${esc(m.image.src)}" alt="订单交接沟通图片" width="${m.image.width}" height="${m.image.height}"/><span>${m.image.sample?"虚构交接样图 · 非实拍":"点击查看大图"}</span></button>`:""}<time>${date(m.at)}</time></div></div>`).join(''):'<p class="section-caption">这单还没有对话。仅双方可查看沟通记录。</p>';
}
function chatPanel(id) {
  syncSharedState(true);
  const t=getTask(id),u=userOf(state);
  if(!t?.runner||![t.owner,t.runner].includes(u.id))return toast('接单后，仅任务双方可联系');
  if(ui.chatAttachment?.task!==id)ui.chatAttachment=null;
  const peer=userOf(state,t.owner===u.id?t.runner:t.owner),canSend=['accepted','progress','delivered'].includes(t.status);
  openDialog(`与${peer.short}同学的订单私聊`, `<button class="chat-order" data-action="detail" data-id="${id}"><span>${esc(STATUS[statusOf(t)])} · ${esc(t.title)}</span><small>查看订单与配送进展 →</small></button><p class="chat-note">本地模拟私聊，切换演示身份可回复。不发送到真实账号。</p><div class="message-list">${chatMessages(t)}</div>${canSend?`<div class="chat-quick">${['快到时告诉我','请按约定位置交接','我会在站内联系你'].map(text=>`<button data-action="chat-quick" data-text="${text}">${text}</button>`).join('')}</div><div class="chat-photo-actions" hidden><button data-action="chat-camera">拍照</button><button data-action="chat-photo-choose">从相册选择</button><button data-action="chat-photo-example">用交接样图体验</button></div><input id="chat-photo-file" type="file" accept="image/jpeg,image/png,image/webp" hidden/><input id="chat-camera-file" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden/><div class="chat-attachment" hidden></div><p class="chat-photo-status" role="status"></p><form class="message-form" data-task-form="message" data-id="${id}"><button class="chat-add-photo" type="button" data-action="chat-photo-menu" aria-label="添加图片">${icon('plus','sm')}<small>图片</small></button><input name="text" maxlength="200" required aria-label="模拟消息内容" placeholder="文字或图片，说清交接…"/><button class="btn primary small" type="submit" aria-label="发送模拟消息">${icon('send','sm')}</button></form><div class="chat-order-actions">${['accepted','progress'].includes(t.status)?textBtn('申请改交接点','change-form',`data-id="${id}"`):''}${textBtn('切换身份回复','demo',`data-return="${id}"`)}</div>`:''}<p class="chat-note">临时加价、采购、改地点需要双方在任务里确认，聊天不能替代授权。</p>`,{type:'chat',id});
  const list=modal.querySelector('.message-list');followLatestChatImage(list);
  paintChatAttachment();
}

function confirmPanel(title, text, label, action, id, extra = '') {
  openDialog(title, `<p class="description">${text}</p>${extra}<div class="modal-actions">${btn('返回任务', 'detail', 'secondary', `data-id="${id}"`)}${btn(label, action, 'primary', `data-id="${id}"`)}</div>`, { type: 'confirm', id });
}

document.addEventListener('keydown',e=>{const hub=e.target.closest('[data-action="map-hub"]');if(hub&&['Enter',' '].includes(e.key)&&!e.target.closest('#place-picker')){e.preventDefault();ui.hub=hub.dataset.spot||null;ui.focusTask=null;render();}});

document.addEventListener('click', e => {
  if(e.target.closest('#place-picker'))return;
  const hub=e.target.closest('[data-action="map-hub"]');
  if(hub) {ui.hub=hub.dataset.spot||null;ui.focusTask=null;render();return;}
  const b = e.target.closest('button[data-action]'); if (!b || b.disabled) return;
  const a = b.dataset.action, id = b.dataset.id, t = id ? getTask(id) : null;
  switch (a) {
    case 'toggle-market-live':ui.liveEnabled=!ui.liveEnabled;render();break;
    case 'map-zoom': zoomMap(b.dataset.map,Number(b.dataset.factor),ui.mapViews);break;
    case 'map-reset': resetMap(b.dataset.map,ui.mapViews);break;
    case 'choose-map-field': ui.mapPicking=b.dataset.field;render();break;
    case 'nearby-examples': run('nearbyExamples',{},'已补充虚构需求，原记录保留');break;
    case 'market-scope': ui.marketScope=b.dataset.scope;ui.hub=null;render();break;
    case 'market-all': ui.marketScope='all';ui.routeEnabled=false;ui.hub=null;render();break;
    case 'urgent-only': ui.urgentOnly=!ui.urgentOnly;ui.hub=null;render();break;
    case 'browse-hub': ui.hub=b.dataset.spot;ui.focusTask=null;ui.marketScope='all';ui.routeEnabled=false;ui.routeEditing=false;render();break;
    case 'focus-task': ui.focusTask=id;render();root.querySelector('.market-map-section')?.scrollIntoView({block:'nearest',behavior:'smooth'});break;
    case 'toggle-route': if(!ui.routeEnabled){ui.routeEnabled=true;ui.from=ui.here;ui.to=null;ui.via=null;}ui.routeEditing=!ui.routeEditing||!ui.to;render();break;
    case 'apply-route': if(!ui.to){toast('请选择目的地；不设置也可以直接看附近需求');break;}ui.routeEditing=false;ui.hub=null;render();break;
    case 'disable-route': ui.routeEnabled=false;ui.routeEditing=false;ui.hub=null;render();break;
    case 'toggle-carry': if(ui.selected.includes(id))ui.selected=ui.selected.filter(x=>x!==id);else if(activeTransport(state).length+ui.selected.length>=MAX_CARRY){toast('最多同时运输4单');break;}else ui.selected.push(id);render();break;
    case 'batch-preview': showBatchPlan();break;
    case 'batch-confirm': {
      const ids=ui.dialog.ids;if(!requireAuth({type:'batch'}))break;if(!userOf(state).runnerEnabled){runnerOnboard();break;}
      if(run('acceptBatch',{ids,from:ui.routeEnabled?ui.from||ui.here:ui.here,to:ui.routeEnabled?ui.to:null,via:ui.routeEnabled?ui.via:null},'同行接单成功，按路线逐站取送')){ui.selected=[];showRun();}break;
    }
    case 'show-run': showRun();break;
    case 'my-requests': ui.mine='published';navigate('mine');break;
    case 'quick-time': saveDraft();ui.composer.quickMinutes=Number(b.dataset.minutes);ui.composer.urgentBonus=Number(b.dataset.minutes)===15?2:0;ui.composer.baseReward=Number(ui.composer.baseReward)||2;render();persistComposer();break;
    case 'quick-price': saveDraft();ui.composer.baseReward=Number(b.dataset.price);render();persistComposer();break;
    case 'use-current-drop': {
      saveDraft();const point=ui.here,p=spotOf(point);ui.composer.dropoff=p.name;ui.composer.dropoffSpot=typeof point==='string'?point:null;ui.composer.dropoffPoint=typeof point==='object'?point:null;ui.composer.dropConsent=false;if(typeof point==='object')ui.composer.handoff='meet';persistComposer();render();break;
    }
    case 'anchor-here': {const point=anchorValue();closeDialog();ui.here=point;ui.hub=null;render();break;}
    case 'anchor-to': {const point=anchorValue();closeDialog();ui.to=point;ui.from=ui.here;ui.routeEnabled=true;ui.routeEditing=false;ui.hub=null;render();break;}
    case 'route-example': if(run('routeExamples',{},'已载入虚构路线任务，原有任务保留')){ui.from='south';ui.via='design';ui.to='library';ui.routeEditing=false;ui.detour=200;ui.scope='along';ui.hub=null;render();}break;
    case 'edit-route': ui.routeEditing=true;render();break;
    case 'route-done': ui.routeEditing=false;render();break;
    case 'map-location-start': saveDraft();ui.locationPicking=true;ui.hub=null;ui.focusTask=null;render();root.querySelector('.market-map-section')?.scrollIntoView({block:'nearest',behavior:'smooth'});break;
    case 'map-location-end': ui.locationPicking=false;render();break;
    case 'pick-place': openPlacePicker(b.dataset.field);break;
    case 'clear-via': ui.via=null;ui.hub=null;render();break;
    case 'task-scope': ui.scope=b.dataset.scope;ui.hub=null;render();break;
    case 'all-tasks': ui.scope='all';ui.hub=null;render();break;
    case 'mode': saveDraft();ui.locationPicking=false;ui.mode=b.dataset.mode;ui.hub=null;ui.category='all';ui.query='';render();break;
    case 'swap-route': [ui.from,ui.to]=[ui.to,ui.from];ui.hub=null;render();break;
    case 'widen-route': ui.detour=800;ui.hub=null;render();break;
    case 'continue-runner': ui.mode='runner';navigate('square');break;
    case 'runner-onboard': runnerOnboard(id);break;
    case 'track': showTracking(id);break;
    case 'task-details': ui.forceDetails=true;showTask(id);ui.forceDetails=false;break;
    case 'sample-photo': {const f=b.closest('form');f.elements.proof.value='sample';f.querySelector('.sample-photo').hidden=false;b.textContent='重新使用虚构照片样例';break;}
    case 'nav': navigate(b.dataset.page); break;
    case 'to-square': navigate('square'); break;
    case 'close': closeDialog(); break;
    case 'detail': showTask(id); break;
    case 'category': ui.category = b.dataset.category; render(); break;
    case 'clear-search': ui.query = ''; ui.category = 'all'; render(); break;
    case 'mine-tab': ui.mine = b.dataset.tab; ui.status = 'all'; render(); break;
    case 'status-filter': ui.status = b.dataset.status; render(); break;
    case 'campus': openDialog('南城大学 · 单校互助', `${notice('南城大学为虚构校园，演示不代表学校官方服务。')}<p class="description">只允许通过本校在校认证的学生参与。校区或校内地点筛选不等于切换学校，校外身份不能接单。</p>${btn('了解在校认证', 'auth', 'primary full')}`, { type: 'campus' }); break;
    case 'auth': showAuth(); break;
    case 'auth-state': if (run('auth', { status: b.dataset.status }, '模拟认证状态已更新')) showAuth(); break;
    case 'auth-demo': if (run('auth', { status: b.dataset.status }, '仅更新虚构认证状态')) demoPanel(ui.dialog?.returnId); break;
    case 'auth-retry': if (run('auth', { status: 'unverified' })) showAuth(); break;
    case 'auth-return': authReturn(); break;
    case 'publish': showPublish(); break;
    case 'edit-task':
      if (!requireAuth({ id })) break;
      showPublish(null, id); ui.dialog.editId = id;
      modal.querySelector('#publish-form').dataset.editId = id;
      modal.querySelector('#modal-title').textContent = '修改尚未接单的任务';
      modal.querySelector('#publish-form .seed-note').textContent = '修改仅在下一步确认后生效；关闭后保留原任务约定。';
      break;
    case 'publish-back': {
      const editId = ui.dialog?.editId; showPublish(ui.draft, editId);
      if (editId) { ui.dialog.editId = editId; modal.querySelector('#publish-form').dataset.editId = editId; }
      break;
    }
    case 'publish-confirm': {
      const payload = ui.dialog.payload;
      const command = ui.dialog.command || 'create';
      if (run(command, payload, command === 'edit' ? '任务修改与模拟预算已更新' : '任务已发布，模拟预付已记录')) {
        ui.mode='request';
        try { localStorage.removeItem(`${DRAFT_KEY}:${state.actor}`); } catch { /* no storage */ }
        ui.draft = null;ui.composer=null;ui.moreOpen=false; ui.mine = 'published'; ui.status = 'all'; ui.page = 'mine'; showTask(command === 'edit' ? payload.id : state.tasks[0].id); render();
      }
      break;
    }
    case 'demo': saveDraft(); demoPanel(b.dataset.return); break;
    case 'quick-start': {
      const mode = b.dataset.mode;
      if (run('switch', { actor: b.dataset.actor }, `已切换为${state.users[b.dataset.actor].name}（演示身份）`)) { ui.mode = mode; ui.composer=null; ui.selected=[]; ui.hub = null; ui.scope = 'along'; navigate('square'); }
      break;
    }
    case 'switch-actor': {
      const returnId = b.dataset.return;
      if (run('switch', { actor: b.dataset.actor }, `已切换为${state.users[b.dataset.actor].name}（演示）`)) {
        ui.afterAuth = null; ui.status = 'all';ui.composer=null;ui.selected=[];
        { const live=['accepted','progress','delivered']; if (state.tasks.some(t=>t.runner===state.actor&&['accepted','progress'].includes(t.status))) ui.mode='runner'; else if (state.tasks.some(t=>t.owner===state.actor&&live.includes(t.status))) ui.mode='request'; }
        if (returnId) showTask(returnId); else closeDialog(); render();
      }
      break;
    }
    case 'rules': rulesPanel(); break;
    case 'credit': showCredit(); break;
    case 'ledger': showLedger(); break;
    case 'open-wallet': navigate('wallet');break;
    case 'reports': showReports(); break;
    case 'read': run('read', {}, '当前身份的消息已标记已读'); break;
    case 'accept':
      if (!requireAuth({ id }))break;
      if(!userOf(state).runnerEnabled){runnerOnboard(id);break;}
      confirmPanel('接下这份顺路之前', `请确认能在 ${date(t.deadline)} 前完成，交接点为 ${esc(t.dropoff)}。${t.buy ? `商品垫付上限 ¥${money(t.budget)}，报酬 ¥${money(t.reward)}。购买前先提交报价并等待发布者确认。` : `无需商品垫付，报酬 ¥${money(t.reward)}。`}${t.handoff==='safe_drop'?'发布者已授权指定交接架放置，记录凭证并通知后可离开。':'需要当面交接，不允许擅自放下。'}可同时运输最多4单，按组合路线和时限确认。`, '我能完成，确认接单', 'accept-confirm', id);
      break;
    case 'accept-confirm': if(run('acceptBatch',{ids:[id],from:ui.routeEnabled?ui.from||ui.here:ui.here,to:ui.routeEnabled?ui.to:null,via:ui.routeEnabled?ui.via:null},'接单成功'))showRun();break;
    case 'command': if (run(b.dataset.command, { id }, '任务进度已更新')) showTask(id); break;
    case 'quote': taskForm('quote', id); break;
    case 'withdraw-quote': if (run('withdrawQuote', { id }, '旧授权已撤回')) taskForm('quote', id); break;
    case 'approve-quote': {
      const q = t.purchase, extra = Math.max(0, Math.max(t.budget, q.amount) + q.reward - t.prepaid);
      confirmPanel('确认商品、报价与预算', `${esc(q.item)}<br>商品报价 ¥${money(q.amount)} · 报酬 ¥${money(q.reward)}<br>${extra ? `需模拟补付 ¥${money(extra)}。` : '无需补足预算。'}同意后接单者才能按本次约定购买，未经同意不得替换。`, extra ? `同意并模拟补付 ¥${money(extra)}` : '同意本次采购报价', 'quote-confirm', id, notice('这不是实际付款，仅记录模拟授权。'));
      break;
    }
    case 'quote-confirm': if (run('approveQuote', { id }, '商品与报价已确认，模拟预算已更新')) showTask(id); break;
    case 'purchase': taskForm('purchase', id); break;
    case 'deliver-form': taskForm('deliver', id); break;
    case 'complete-confirm': confirmPanel('收到了，再让这份互助完成', `请核对物品、交接说明${t.buy ? '及购买凭证' : ''}。<br>${esc(t.deliveryNote || '')}<br>如有未收到、物品不符或费用疑问，请返回任务选择“遇到问题”。`, '已核对，确认收货并模拟结算', 'complete-now', id, `<div class="summary-box">${moneyTable(t, true)}</div>${notice('确认后记录一次结算与履约，不发生真实付款。')}`); break;
    case 'complete-now': if (run('complete', { id }, '互助已完成，模拟结算与退回预算已记录')) showTask(id); break;
    case 'cancel-open': confirmPanel('取消这份需求？', `尚未有同学接单。确认后任务关闭，模拟预付的 ¥${money(t.prepaid)} 全部退回，不产生履约评价。`, '确认取消并模拟退款', 'cancel-open-now', id); break;
    case 'cancel-open-now': if (run('cancel', { id }, '任务已取消，模拟预算已退回')) showTask(id); break;
    case 'cancel-form': taskForm('cancel', id); break;
    case 'cancel-response': if (run('respondCancel', { id, approve: b.dataset.approve === 'yes' }, '取消申请已处理')) showTask(id); break;
    case 'change-form': taskForm('change', id); break;
    case 'change-response': if (run('respondChange', { id, approve: b.dataset.approve === 'yes' }, '地点变更已处理')) showTask(id); break;
    case 'dispute-form': taskForm('dispute', id); break;
    case 'report-form': taskForm('report', id); break;
    case 'message-tab': ui.messageTab=b.dataset.tab;render();break;
    case 'conversation-examples': if(!certified(userOf(state))){demoPanel();break;}if(run('conversationExamples',{},'已载入虚构对话，原有记录保留')){ui.messageTab='chats';render();}break;
    case 'chat-photo-menu': {const menu=modal.querySelector('.chat-photo-actions');if(menu)menu.hidden=!menu.hidden;break;}
    case 'chat-photo-choose': modal.querySelector('#chat-photo-file')?.click();break;
    case 'chat-camera': modal.querySelector('#chat-camera-file')?.click();break;
    case 'chat-photo-remove': ui.chatAttachment=null;paintChatAttachment();break;
    case 'chat-photo-example': loadChatSample();break;
    case 'chat-image-view': showChatImage(Number(b.dataset.index));break;
    case 'chat-quick': {const input=modal.querySelector('.message-form input');if(input){input.value=b.dataset.text;input.focus();}break;}
    case 'chat': chatPanel(id); break;
    case 'review': taskForm('review', id); break;
    case 'rating': {
      const rating = Number(b.dataset.rating); ui.rating = rating;
      modal.querySelector('input[name="rating"]').value = rating;
      modal.querySelectorAll('[data-action="rating"]').forEach(el => { el.classList.toggle('selected', Number(el.dataset.rating) <= rating); el.setAttribute('aria-pressed', String(Number(el.dataset.rating) === rating)); });
      break;
    }
    case 'reset-confirm': openDialog('重置之前，最后确认', `<p class="description">这会清除当前浏览器里的演示任务、消息、报价、评价、认证状态及所有身份的草稿，并恢复初始虚构数据。线上源码和其他设备不受影响。</p><div class="modal-actions">${btn('保留记录', 'demo', 'secondary')}${btn('确认重置演示数据', 'reset-now', 'danger')}</div>`, { type: 'reset' }); break;
    case 'reset-now':
      state = createState(); ui.afterAuth = null; ui.draft = null;
      try { ['visitor', 'lin', 'zhou'].forEach(uid => localStorage.removeItem(`${DRAFT_KEY}:${uid}`)); } catch { /* no storage */ }
      persist(); navigate('square'); toast('已恢复初始演示数据'); break;
  }
});
document.addEventListener('submit', e => {
  const form = e.target; e.preventDefault();
  if(form.id==='runner-form') {const id=form.dataset.id;if(run('enableRunner',{agree:form.elements.agree.checked},'演示接单身份已开通')){if(id)showTask(id);else{closeDialog();ui.mode='runner';render();}}return;}
  if (form.id === 'auth-form') { if (run('auth', { status: 'pending' }, '演示材料已提交')) showAuth(); return; }
  if (['publish-form','quick-publish-form'].includes(form.id)) { publishPreview(form); return; }
  if (form.dataset.taskForm) {
    const p = { ...Object.fromEntries(new FormData(form)), id: form.dataset.id };
    if(form.dataset.taskForm==='message'){if(ui.chatPhotoBusy){error('图片准备中，请稍候');return;}if(ui.chatAttachment?.task===p.id)p.image=ui.chatAttachment.image;}
    if (run(form.dataset.taskForm, p, form.dataset.taskForm === 'message' ? '模拟消息已记录' : '已记录，任务进度已更新')) {
      if (form.dataset.taskForm === 'message'){ui.chatAttachment=null;chatPanel(p.id);} else showTask(p.id);
    }
  }
});
document.addEventListener('input', e => {
  if (e.target.id === 'task-search') { ui.query = e.target.value; document.querySelector('#feed-content').innerHTML = feedContent(); }
  if (e.target.closest('#publish-form,#quick-publish-form')) saveDraft();
});
document.addEventListener('change', e => {
  if(['chat-photo-file','chat-camera-file'].includes(e.target.id)){const file=e.target.files?.[0];e.target.value='';if(file)selectChatPhoto(file,ui.dialog?.id);return;}
  if(e.target.closest('#quick-publish-form')){const form=e.target.form;if(e.target.name==='handoff'){const safe=e.target.value==='safe_drop';form.querySelector('.handoff-consent').hidden=!safe;form.elements.dropConsent.required=safe;}saveDraft();if(e.target.name==='buy')render();return;}
  if(['route-from','route-to','route-via','route-detour'].includes(e.target.id)&&e.target.value!=='custom') {const id=e.target.id;ui[id.slice(6)]=id==='route-detour'?Number(e.target.value):(e.target.value||null);ui.hub=null;render();document.getElementById(id)?.focus();return;}
  if(e.target.name==='handoff'&&e.target.closest('#publish-form')) {const f=e.target.form,safe=e.target.value==='safe_drop';f.querySelector('.handoff-consent').hidden=!safe;f.elements.dropConsent.required=safe;saveDraft();}
  if(['pickup','dropoff'].includes(e.target.name)&&e.target.closest('#publish-form')) {e.target.form.elements[e.target.name+'Point'].value='';if(e.target.name==='dropoff')e.target.form.elements.dropConsent.checked=false;saveDraft();}
  if (e.target.id === 'sort-select') { ui.sort = e.target.value; document.querySelector('#feed-content').innerHTML = feedContent(); }
  if (e.target.name === 'buy' && e.target.closest('#publish-form')) { const input = modal.querySelector('[name="budget"]'); input.disabled = !e.target.checked; input.required = e.target.checked; saveDraft(); }
});
modal.addEventListener('cancel', e => { e.preventDefault(); closeDialog(); });
modal.addEventListener('click', e => { if (e.target === modal && e.clientX < modal.getBoundingClientRect().left) closeDialog(); });
function navigate(page) {
  ui.locationPicking=false;
  closeDialog(); ui.page = ['square', 'mine', 'messages', 'wallet', 'me'].includes(page) ? page : 'square';
  if(ui.page==='mine') ui.mine=ui.mode==='runner'?'accepted':'published';
  history.pushState(null, '', `#${ui.page}`); render(); window.scrollTo({ top: 0, behavior: 'instant' });
}
function route() {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash.startsWith('task/')) { render(); showTask(hash.slice(5), false); }
  else { closeDialog(); ui.page = ['square', 'mine', 'messages', 'wallet', 'me'].includes(hash) ? hash : 'square'; render(); }
}
window.addEventListener('popstate', route);
window.addEventListener('hashchange', route);
window.addEventListener('storage',e=>{if(e.key===KEY)syncSharedState();});
window.addEventListener('focus',()=>syncSharedState());
route();
setInterval(() => {
  // Never overwrite another tab's newer state while reconciling timeouts.
  let saved;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* In-memory fallback. */ }
  if (saved && (saved.revision !== state.revision || saved.createdAt !== state.createdAt)){syncSharedState();return;}
  const next = reconcile(state);
  if (next !== state) {
    state = next; persist();
    if (!modal.open && !document.querySelector('#task-search:focus')) render();
    else if (ui.dialog?.type === 'detail') showTask(ui.dialog.id, false);
  } else if (ui.page === 'square' && !modal.open && !document.querySelector('#task-search:focus')) {
    const el = document.querySelector('#feed-content'); if (el) el.innerHTML = feedContent();
  }
}, 60000);

// Only update the nearby simulation while the user is looking at the map.
// Dialogs, selection, route editing and pointer gestures keep their current UI.
document.addEventListener('pointerdown',()=>{marketPointerDown=true;},true);
window.addEventListener('pointerup',()=>{marketPointerDown=false;},true);
window.addEventListener('pointercancel',()=>{marketPointerDown=false;},true);
window.addEventListener('blur',()=>{marketPointerDown=false;});
setInterval(()=>{
  syncSharedState();
  if(ui.page!=='square'||ui.mode!=='runner'||document.hidden)return;
  const reason=livePauseReason(ui),age=root.querySelector('[data-live-age]');
  const elapsed=Math.max(0,Math.floor((Date.now()-(state.marketFeed?.lastAt||Date.now()))/1000));
  if(age)age.textContent=reason?'列表保持不变':`${elapsed<1?'刚刚更新':elapsed+'秒前更新'} · 每12秒扫描`;
  if(reason||marketPointerDown||root.querySelector('[data-camera-moving]')||document.querySelector('dialog[open]')||document.activeElement?.matches('input,select,textarea'))return;
  const map=root.querySelector('.market-map-section')?.getBoundingClientRect();
  if(!map||map.bottom<0||map.top>innerHeight||elapsed*1000<MARKET_INTERVAL)return;
  let latest;try{latest=JSON.parse(localStorage.getItem(KEY)||'null');}catch{}
  if(latest&&(latest.revision!==state.revision||latest.createdAt!==state.createdAt)){
    syncSharedState();return;
  }
  try{state=evolve(state,'marketPulse');persist();render();}catch{/* A failed simulated scan must not disturb user work. */}
},1000);
