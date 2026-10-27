import { SCHOOL, CATEGORIES, STATUS, AUTH, money, createState, migrateState, reconcile, userOf, certified, statusOf, creditOf, reviewAverage, visibleTask, evolve } from './lib/model.js';
import { icon, logo, campusArt } from './lib/icons.js';
import { SPOTS, identifySpot, shortestPath, taskSpots, matchRoute, mapMarkup, formatDistance, walkMinutes } from './lib/campus.js';
import { home as experienceHome, routeCard, stepLabel, trackingSnapshot, tourSnapshot } from './lib/experience.js';

const KEY = 'tonglu-campus-v1';
const DRAFT_KEY = 'tonglu-draft-v1';
const root = document.querySelector('#app');
const modal = document.querySelector('#modal');
let storageWarning = '', state;
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved && (saved.version !== 1 || !Array.isArray(saved.tasks) || !saved.users?.[saved.actor] || !Array.isArray(saved.notifications) || !Array.isArray(saved.reports) || !Number.isInteger(saved.revision) || saved.tasks.some(t => !t.id || !saved.users[t.owner] || !CATEGORIES[t.category] || !STATUS[t.status] || !Array.isArray(t.events) || !Array.isArray(t.reviews) || !Number.isInteger(t.prepaid) || !Number.isFinite(t.deadline)))) throw new Error('invalid');
  state = saved || createState();
} catch { state = createState(); storageWarning = '本地演示记录无法读取，已恢复初始数据。'; }
const normalized = reconcile(migrateState(state));
if (normalized !== state) { state = normalized; persist(); }
const ui = { page: 'square', mode: 'request', from: 'north', to: 'dorm3', detour: 400, hub: null, category: 'all', query: '', sort: 'new', mine: 'published', status: 'all', dialog: null, draft: null, rating: 5, afterAuth: null, tracking: null, forceDetails: false };
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
function error(text) {
  let el = modal.querySelector('.form-error');
  if (!el) { el = document.createElement('div'); el.className = 'form-error'; modal.querySelector('.modal-body')?.append(el); }
  el.textContent = text; el.classList.remove('error-hidden'); el.setAttribute('role', 'alert');
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function run(command, data = {}, message = '') {
  try {
    let latest;
    try { latest = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* In-memory demo remains usable when storage is unavailable. */ }
    if (latest && (latest.revision !== state.revision || latest.createdAt !== state.createdAt)) throw new Error('演示记录已在其他标签页改变，请刷新后再操作，避免覆盖进度');
    state = evolve(state, command, data); persist(); render(); if (message) toast(message); return true;
  }
  catch (e) { if (modal.open) error(e.message); else toast(e.message); return false; }
}
function shellContent() {
  const u = userOf(state), n = unread();
  const links = [['square', 'grid', '首页'], ['mine', 'tasks', '任务'], ['messages', 'chat', '消息'], ['me', 'user', '我的']];
  const brand = `<span class="brand">${logo}<span class="brand-name">同路<small class="brand-sub">CAMPUS TOGETHER</small></span></span>`;
  const nav = links.map(([id, glyph, label]) => `<button class="nav-link ${ui.page === id ? 'active' : ''}" data-action="nav" data-page="${id}" ${ui.page === id ? 'aria-current="page"' : ''}>${icon(glyph)}${label}${id === 'messages' && n ? `<span class="count-dot">${n}</span>` : ''}</button>`).join('');
  return `<aside class="sidebar"><a href="#square" aria-label="同路首页">${brand}</a><p class="nav-label">YOUR CAMPUS, CONNECTED</p><nav class="nav-list" aria-label="主导航">${nav}</nav><div class="sidebar-bottom"><div class="side-note"><strong>小事有人帮，顺路有回响。</strong>在同一个校园，<br>把每一段顺路变成一点善意。</div>${btn(`${icon('plus')}发布任务`, 'publish', 'primary full')}</div></aside>
    <div class="main-wrap">${storageWarning ? `<div class="storage-warning" role="alert">${esc(storageWarning)}</div>` : ''}<header class="topbar"><a class="mobile-brand" href="#square" aria-label="同路首页">${brand}</a><button class="campus-switch" data-action="campus">${icon('pin')}<span>${SCHOOL.name}</span><span>校内互助</span></button><div class="top-actions"><button class="demo-trigger" data-action="demo" aria-label="演示说明与切换身份"><span>DEMO</span>演示说明 / 切换身份</button><button class="icon-btn" data-action="nav" data-page="messages" aria-label="消息">${icon('bell')}${n ? '<span class="notification-dot"></span>' : ''}</button><button class="account" data-action="nav" data-page="me">${avatar(u)}<span>${esc(u.name)}</span>${icon('down')}</button></div></header>
    <main class="page" id="page-content">${pageContent()}</main></div><nav class="bottom-nav" aria-label="手机导航">${links.map(([id, glyph, label]) => `<button class="bottom-item ${ui.page === id ? 'active' : ''} ${id === 'publish' ? 'publish' : ''}" data-action="${id === 'publish' ? 'publish' : 'nav'}" data-page="${id}" aria-label="${label}" ${ui.page === id ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span>${id === 'messages' && n ? `<span class="count-dot">${n}</span>` : ''}</button>`).join('')}</nav>`;
}
function render() {
  root.innerHTML = shellContent();
  // Existing promises come before asking the user to publish something else.
  const current=root.querySelector('.my-current');
  if(ui.page==='square'&&ui.mode==='request'&&current?.querySelector('.current-task')) current.parentElement.prepend(current);
}
function footer() { return '<footer class="page-footer"><span>同路 · 校园里的每一段路，都有回应。<br>交互演示 · 虚构校园与数据 · 不发生真实付款</span><span>SMALL FAVORS. SHARED JOURNEYS.</span></footer>'; }
function pageContent() {
  if (ui.page === 'mine') return minePage();
  if (ui.page === 'messages') return messagesPage();
  if (ui.page === 'me') return profilePage();
  return squarePage();
}
function squarePage() { return experienceHome({state,ui,icon,btn,esc,footer,taskCard}); }
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
function heading(eyebrow, title, desc, action = '') { return `<div class="page-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${desc}</p></div>${action}</div>`; }
function minePage() {
  const uid = state.actor;
  const all = state.tasks.filter(t => ui.mine === 'published' ? t.owner === uid : t.runner === uid);
  const tasks = all.filter(t => ui.status === 'all' || statusOf(t) === ui.status || (ui.status === 'issue' && t.dispute?.status === 'pending'));
  return `${heading('MY LITTLE JOURNEYS', '每一份托付，都有进度', '在这里查看约定、处理确认，和同学一起完成小事。', btn(`${icon('plus', 'sm')}发布`, 'publish', 'secondary small'))}${!certified(userOf(state)) ? authBanner() : ''}<div class="tabs"><button class="tab ${ui.mine === 'published' ? 'active' : ''}" data-action="mine-tab" data-tab="published">我发布的</button><button class="tab ${ui.mine === 'accepted' ? 'active' : ''}" data-action="mine-tab" data-tab="accepted">我接下的</button></div><div class="status-filters">${[['all', '全部'], ['open', '待接单'], ['accepted', '已接单'], ['progress', '进行中'], ['delivered', '待确认'], ['completed', '已完成'], ['issue', '问题处理'], ['cancelled', '已取消'], ['expired', '已过期']].map(([key, label]) => `<button class="status-filter ${ui.status === key ? 'active' : ''}" data-action="status-filter" data-status="${key}">${label}</button>`).join('')}</div><div class="task-grid">${tasks.length ? tasks.map(taskCard).join('') : empty('这里还没有任务记录', '发布一个小需求，或在校园广场发现适合你的顺路。', 'to-square', '去任务广场')}</div>${footer()}`;
}
function authBanner() { return `<div class="auth-banner">${icon('shield')}<div>先完成在校认证，再开始互助<p>当前：${esc(authName(userOf(state)))} · 仅限南城大学演示学生</p></div>${btn('去认证', 'auth', 'secondary small')}</div>`; }
function messagesPage() {
  const messages = state.notifications.filter(n => !n.user || n.user === state.actor);
  return `<div class="wide-card">${heading('STAY IN THE LOOP', '小事的进展，都在这里', '任务确认、采购变更和交接提醒，不错过每一份回应。', textBtn('全部已读', 'read'))}${notice('消息仅保存在当前浏览器。切换演示身份可查看另一方收到的提醒，不会联系真实用户。')}<section>${messages.map(n => `<button class="notification" data-action="${n.task ? 'detail' : 'demo'}" ${n.task ? `data-id="${esc(n.task)}"` : ''}><span class="category-icon">${icon(n.task ? 'tasks' : 'bell')}</span><div><h3>${!n.read ? '· ' : ''}${esc(n.title)}</h3><p>${esc(n.body)}</p><time>${date(n.at)}</time></div>${icon('right', 'sm')}</button>`).join('') || empty('还没有新的消息', '参与任务后，重要进展会显示在这里。')}</section>${footer()}</div>`;
}
function profilePage() {
  const u = userOf(state), completed = state.tasks.filter(t => t.runner === u.id && t.status === 'completed'), c = creditOf(state, u.id);
  return `<div class="wide-card"><section class="profile-hero">${avatar(u, 'big')}<div><h1>${esc(u.name)}</h1><p>${certified(u) ? `${SCHOOL.name} · ${esc(u.department)}` : '先认识彼此，再开始互助'}</p></div>${btn(authName(u), 'auth', 'secondary small')}</section><div class="profile-stats"><div class="profile-stat"><b>${c}</b><span>演示信用分</span></div><div class="profile-stat"><b>${completed.length}</b><span>完成跑腿</span></div><div class="profile-stat"><b>${reviewAverage(state, u.id)}</b><span>收到的评价</span></div></div><p class="section-caption">信用与身份认证分别展示。履约记录、评价与初始分数均为演示数据，不能替代对交易风险的判断。</p><div class="menu-card">${[['shield', '在校认证', 'auth', authName(u)], ['route', '接单身份', 'runner-onboard', u.runnerEnabled ? '已开通' : '未开通'], ['route', '信用与履约明细', 'credit', '每一笔都有依据'], ['wallet', '模拟费用记录', 'ledger', '不发生真实付款'], ['flag', '我的举报与问题', 'reports', '查看处理进度'], ['info', '互助规则与隐私', 'rules', '了解参与边界'], ['swap', '演示说明与切换身份', 'demo', '体验任务双方']].map(([glyph, label, action, hint]) => `<button class="menu-item" data-action="${action}">${icon(glyph)}<span>${label}</span><small>${esc(hint)}</small>${icon('right')}</button>`).join('')}</div>${footer()}</div>`;
}

function openDialog(title, body, info = {}) {
  const already = modal.open;
  ui.dialog = info;
  ui.tracking = null;
  modal.classList.toggle('tracking-modal',['tracking','tour'].includes(info.type));
  modal.innerHTML = `<div class="modal-head"><h2 id="modal-title">${title}</h2><button class="icon-btn" data-action="close" aria-label="关闭">${icon('close')}</button></div><div class="modal-body">${body}<div class="form-error error-hidden" role="alert"></div></div>`;
  if (!already) { modal.showModal(); document.body.style.overflow = 'hidden'; }
  modal.scrollTop = 0;
  if (already) modal.querySelector('[data-action="close"]').focus({ preventScroll: true });
}
function closeDialog() {
  saveDraft();
  modal.close(); document.body.style.overflow = ''; ui.dialog = null; ui.tracking = null;
  if (location.hash.startsWith('#task/')) history.replaceState(null, '', `#${ui.page}`);
}
function showTask(id, updateHash = true) {
  const raw = getTask(id); if (!raw) { toast('任务不存在或记录已重置'); closeDialog(); return; }
  if (updateHash && location.hash !== `#task/${id}`) history.pushState(null, '', `#task/${encodeURIComponent(id)}`);
  const t = visibleTask(state, raw), u = userOf(state), owner = userOf(state, t.owner), runner = t.runner ? userOf(state, t.runner) : null;
  const party = [t.owner, t.runner].includes(u.id), guest = !certified(u) && !party, st = statusOf(t);
  if (party && ['accepted','progress','delivered'].includes(st) && !ui.forceDetails) return showTracking(id,updateHash);
  const locationText = text => identifySpot(text)?esc(SPOTS[identifySpot(text)].name):(guest?esc(text.split(' · ')[0])+'附近':esc(text));
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
    const {pickup,dropoff}=taskSpots(t), match=ui.mode==='runner'&&t.owner!==u.id?matchRoute(t,ui.from,ui.to):null;
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
  const snap=trackingSnapshot(t,Date.now(),state.actor),{pickup,dropoff}=taskSpots(t),isOwner=t.owner===u.id,r=userOf(state,isOwner?t.runner:t.owner);
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
  } else if(t.status==='delivered') action=`${notice(t.handoff==='safe_drop'?'已按授权放置并通知发布者，你可以离开，无需原地等候。报酬待对方确认后模拟结算。':'已记录交接，无需原地等待对方操作手机。模拟报酬待对方确认结算。')}${btn('继续找沿途任务','continue-runner','secondary full')}`;
  const fullPath=shortestPath(t.runnerStartSpot||'north',pickup).nodes.concat(shortestPath(pickup,dropoff).nodes.slice(1));
  const proof=t.deliveryProof?`<section class="delivery-proof"><div class="proof-heading"><strong>送达凭证 · ${esc(t.dropoff)}</strong><span>${date(t.deliveryProof.at)}</span></div><img src="./assets/handoff-sample.png" alt="虚构演示照片：无个人信息的纸箱放在公共交接架上" /><p>AI 生成照片样例 · 非真实拍摄 · ${esc(t.deliveryNote)}</p></section>`:'';
  const handoffText=t.handoff==='safe_drop'?'发布前已授权：放置到指定公共交接架，通知后可离开。请尽量在提示的自取时间内取走；超时不自动免责。':'交接方式：当面交接。未获放置授权，不能擅自放下离开。';
  openDialog(isOwner?'我的任务进度':'这段顺路的进度',`<div class="tracking-heading"><span class="live-label"><i></i>模拟位置 · 非 GPS</span><h3 data-track-title>${esc(snap.title)}</h3><p><span data-track-eta>${snap.eta}</span> · ${esc(t.title)}</p></div>${proof||mapMarkup({route:fullPath,pickup,dropoff,marker:snap.point,label:'任务配送示意地图，仅任务双方可查看'})}${trackingSteps(snap.step)}<div class="tracking-person">${avatar(r)}<div><strong>${esc(r.short)}同学 <span>同校认证 · 接单身份已开通</span></strong><p>从 ${esc(SPOTS[pickup]?.short||'取件点')} 到 ${esc(SPOTS[dropoff]?.short||'交接点')}</p></div>${textBtn('联系','chat',`data-id="${id}"`)}</div><div class="handoff-brief">${icon(t.handoff==='safe_drop'?'box':'user','sm')}<p>${handoffText}${t.pickupBy?`<br>建议自取时间：${date(t.pickupBy)} 前（演示参数）`:''}</p></div><div class="tracking-action">${action}</div><div class="tracking-links">${textBtn('约定与费用','task-details',`data-id="${id}"`)}${textBtn(t.dispute?.status==='pending'?'查看问题进度':'遇到问题','dispute-form',`data-id="${id}"`)}${textBtn('切换演示身份','demo',`data-return="${id}"`)}</div><p class="tracking-hint">地图只演示当前位置；确认取件、采购授权、送达及结算仍须对应一方操作。</p>`,{type:'tracking',id});
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
function showTour() {
  const s=tourSnapshot(0);
  openDialog('24 秒，看看一段顺路怎么完成',`<div class="tracking-heading"><span class="live-label"><i></i>独立剧情演示 · 不改你的任务</span><h3 data-track-title>${s.title}</h3><p><span data-track-eta>${s.eta}</span> · 周同学正在帮林同学取包裹</p></div>${mapMarkup({route:s.nodes,pickup:'west',dropoff:'dorm3',marker:s.point})}${trackingSteps(s.step)}<div class="tour-progress"><i data-tour-progress></i></div><div class="tour-controls">${btn('暂停演示','tour-toggle','secondary small')}${btn('下一阶段','tour-next','secondary small')}${btn('重新播放','play-tour','ghost small')}</div><div class="handoff-brief">${icon('box','sm')}<p>事先授权三号楼下交接架自取。送达后记录照片、地点和时间，通知发布者，接单者无需原地等待。</p></div><section class="delivery-proof tour-proof" data-tour-proof hidden><strong>已放到三号楼下交接架 · 已通知林同学</strong><img src="./assets/handoff-sample.png" alt="AI 生成的虚构公共点放置照片样例"/><p>照片为 AI 生成样例；不代表真实包裹或真实交接架。</p></section><p class="tracking-hint">位置、时间和人物均为模拟。演示不会自动替真实任务确认取件或结算。</p>`,{type:'tour'});
  ui.tracking={tour:true,elapsed:0,last:performance.now(),paused:window.matchMedia('(prefers-reduced-motion: reduce)').matches};
  if(ui.tracking.paused) modal.querySelector('[data-action="tour-toggle"]').textContent='继续演示';
}
function animateTracking(now) {
  const tr=ui.tracking;
  if(tr&&modal.open&&['tracking','tour'].includes(ui.dialog?.type)) {
    let s;
    if(tr.tour) {
      if(!tr.paused) tr.elapsed=Math.min(24000,tr.elapsed+Math.max(0,Math.min(200,now-tr.last)));
      tr.last=now; s=tourSnapshot(tr.elapsed);
      const proof=modal.querySelector('[data-tour-proof]'); if(proof) proof.hidden=tr.elapsed<24000;
      const bar=modal.querySelector('[data-tour-progress]'); if(bar) bar.style.width=`${100*s.fraction}%`;
      if(tr.elapsed>=24000) {tr.paused=true;const b=modal.querySelector('[data-action="tour-toggle"]');if(b)b.textContent='已完成';}
    } else { const t=getTask(tr.id); if(t)s=trackingSnapshot(t,Date.now(),state.actor); }
    if(s) {
      const g=modal.querySelector('[data-map-marker]');
      const name=tr.tour?'周':state.users[getTask(tr.id)?.runner]?.short||'同';
      if(g) g.innerHTML=`<circle cx="${s.point.x}" cy="${s.point.y}" r="21" fill="#35442e" opacity=".14"/><circle cx="${s.point.x}" cy="${s.point.y}" r="12" fill="#35442e" stroke="white" stroke-width="3"/><text x="${s.point.x}" y="${s.point.y+4}" text-anchor="middle" class="map-person-letter" fill="white">${esc(name)}</text><rect x="${s.point.x-30}" y="${s.point.y-35}" width="60" height="18" rx="8" fill="#35442e"/><text x="${s.point.x}" y="${s.point.y-22}" text-anchor="middle" class="map-person-label" fill="white">${esc(name)}同学</text>`;
      const title=modal.querySelector('[data-track-title]'),eta=modal.querySelector('[data-track-eta]');
      if(title&&title.textContent!==s.title)title.textContent=s.title;
      if(eta&&eta.textContent!==s.eta)eta.textContent=s.eta;
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
  openDialog('开通接单身份',`<p class="description">在校认证证明你属于本校；接单身份说明你愿意遵守取件、交接与费用约定。它不代表你能领取任何人的物品。</p><form id="runner-form" ${returnId?`data-id="${returnId}"`:''}><div class="help-grid"><div class="help-item"><b>先看顺路，再接单</b>接单前确认取送点、额外绕行、期限和报酬。一次最多运输一项，已记录送达的任务不要求你原地等待。</div><div class="help-item"><b>只取你接下的那一单</b>具体任务绑定双方，取件凭据仅向本任务接单者开放，不能转交或截取其他同学凭据。</div><div class="help-item"><b>按约定交接，留下必要凭证</b>未经发布者事先授权，不能擅自放置。已授权的指定公共点可记录凭证、通知后离开；异常须协商处理。</div></div><label class="check-row"><input type="checkbox" required name="agree"/><span>我理解任务与交接规范，具备履约条件，愿意按每个任务的约定完成。这只是演示开通，不是官方资格证书。</span></label><button type="submit" class="btn primary full">确认，开通演示接单身份</button></form>`,{type:'runner-onboard',id:returnId});
}
function purchaseStatus(t) {
  if (t.status === 'completed') return '商品、凭证与收货已确认 · 模拟结算已记录';
  if (t.status === 'cancelled') return '任务已取消 · 请查看费用退回记录';
  if (!t.purchase || ['withdrawn', 'rejected'].includes(t.purchase.status)) return t.purchase?.status === 'rejected' ? '本次报价未获同意，需要重新沟通。' : '01 提交商品与报价 → 02 发布者确认 → 03 购买并提交凭证';
  return { pending: '报价待发布者确认 · 尚未授权购买', approved: '商品与报价已确认 · 可按本次授权购买', bought: '已购买并提交凭证 · 等待交接核对' }[t.purchase.status];
}
function moneyTable(t, preview = false) {
  const amount = t.buy && t.purchase?.bought ? t.purchase.actual : 0;
  return `<table class="money-table"><tbody>${t.buy ? `<tr><td>商品预算上限</td><td>¥${money(t.budget)}</td></tr><tr><td>实际商品支出</td><td>${t.purchase?.bought ? `¥${money(amount)}` : '待购买凭证'}</td></tr>` : ''}<tr><td>跑腿报酬</td><td>¥${money(t.reward)}</td></tr><tr><td>发布者模拟预付</td><td>¥${money(t.prepaid)}</td></tr>${t.settlement ? `<tr><td>退回发布者</td><td>¥${money(t.settlement.refund)}</td></tr><tr class="total"><td>接单者模拟结算</td><td>¥${money(t.settlement.runnerPayout)}</td></tr>` : preview ? `<tr><td>确认后退回预算</td><td>¥${money(t.prepaid - amount - t.reward)}</td></tr><tr class="total"><td>确认后模拟结算</td><td>¥${money(amount + t.reward)}</td></tr>` : ''}</tbody></table>`;
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
function showLedger() {
  const list = state.tasks.filter(t => [t.owner, t.runner].includes(state.actor));
  openDialog('模拟费用记录', `${notice('金额只用于交互演示，不扣款、不充值、不提现，也不代表真实资金托管。')}${list.map(t => `<div class="action-panel"><h4>${esc(t.title)}</h4><p>${t.owner === state.actor ? '我发布的' : '我接下的'} · ${STATUS[statusOf(t)]}${t.dispute?.status === 'pending' ? ' · 问题待处理' : ''}</p>${moneyTable(t)}${textBtn('查看任务', 'detail', `data-id="${t.id}"`)}</div>`).join('') || empty('还没有费用记录', '完成发布或接单后，这里会展示模拟费用明细。')}`, { type: 'ledger' });
}
function showReports() {
  const issues = state.tasks.filter(t => t.dispute && [t.owner, t.runner].includes(state.actor));
  const reports = state.reports.filter(r => r.from === state.actor);
  openDialog('我的举报与问题', `${notice('这版展示提交与待审核状态，没有真实客服在线处理。普通学生不能替平台裁决或处罚他人。')}${issues.map(t => `<div class="action-panel"><h4>${esc(t.title)} · 待模拟审核</h4><p>${esc(t.dispute.reason)}<br>物品与费用：${esc(t.dispute.goods)}</p>${textBtn('查看任务记录', 'detail', `data-id="${t.id}"`)}</div>`).join('')}${reports.map(r => `<div class="action-panel"><h4>任务举报 · 待模拟审核</h4><p>${esc(r.reason)}<br>${date(r.at)}</p></div>`).join('')}${!issues.length && !reports.length ? empty('暂无问题或举报记录', '需要帮助时，请从相关任务进入问题处理，保留约定与必要凭证。') : ''}`, { type: 'reports' });
}
function localInputDate(n) { const d = new Date(n); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function loadDraft() {
  try { return JSON.parse(localStorage.getItem(`${DRAFT_KEY}:${state.actor}`) || 'null') || {}; }
  catch { return {}; }
}
function saveDraft() {
  const f = document.querySelector('#publish-form');
  if (!f || f.dataset.editId) return;
  const p = Object.fromEntries(new FormData(f)); p.buy = f.elements.buy.checked;
  try { localStorage.setItem(`${DRAFT_KEY}:${state.actor}`, JSON.stringify(p)); } catch { /* Current form remains available. */ }
}
function showPublish(values = null, editId = null) {
  if (!requireAuth({ type: 'publish' })) return;
  const source = editId ? getTask(editId) : null;
  const d = values || (source ? { ...source, reward: money(source.reward), budget: money(source.budget), deadline: localInputDate(source.deadline) } : loadDraft());
  openDialog('发布一份校园里的小事', `<p class="description">清楚的约定，是放心互助的开始。仅限本校公共场所交接。</p><form id="publish-form"><div class="form-grid"><label class="field full"><span>任务标题</span><input name="title" value="${esc(d.title || '')}" required maxlength="40" placeholder="例如：帮我从食堂带一份午餐" /></label><label class="field"><span>任务类别</span><select name="category">${Object.entries(CATEGORIES).filter(([key]) => key !== 'all').map(([key, c]) => `<option value="${key}" ${d.category === key ? 'selected' : ''}>${c.name}</option>`).join('')}</select></label><label class="field"><span>最晚完成时间</span><input name="deadline" type="datetime-local" required value="${esc(d.deadline || localInputDate(Date.now() + 3600000))}" min="${localInputDate(Date.now())}" /></label><label class="field"><span>取件 / 购买地点</span><input name="pickup" required maxlength="60" value="${esc(d.pickup || '')}" placeholder="例如：第一食堂 · 一楼" /></label><label class="field"><span>公共交接地点</span><input name="dropoff" required maxlength="60" value="${esc(d.dropoff || '')}" placeholder="例如：设计楼 · 公共大厅" /></label><label class="field full"><span>物品 / 商品规格与数量</span><input name="item" required maxlength="150" value="${esc(d.item || '')}" placeholder="例如：鸡腿饭 × 1，少辣、不加香菜" /></label><label class="field full"><span>任务说明</span><textarea name="description" required maxlength="300" placeholder="说明取件时间、重量体积、特殊要求；不填写真实取件码、手机号或宿舍房间。">${esc(d.description || '')}</textarea></label><label class="field"><span>跑腿报酬 / 元</span><input name="reward" type="number" min="0.01" max="100" step="0.01" required value="${esc(d.reward || '')}" inputmode="decimal" placeholder="例如：5" /><small>正数，上限 ¥100，为演示参数。</small></label><label class="field"><span>商品垫付上限 / 元</span><input name="budget" type="number" min="0.01" max="200" step="0.01" value="${esc(d.budget || '')}" inputmode="decimal" placeholder="仅代买需填写" ${d.buy ? 'required' : 'disabled'} /><small>与报酬分开，最高 ¥200。</small></label></div><label class="check-row"><input type="checkbox" name="buy" ${d.buy ? 'checked' : ''} /><span>需要接单同学代买并垫付商品款，购买前必须由我确认商品与报价；换品或超预算重新确认。</span></label>${notice('禁止代考、代刷、代写、违规占座及危险物品。代买仅限普通餐品和低价日用品。请勿填写真实个人敏感信息。')}<label class="check-row"><input type="checkbox" name="agreement" required /><span>我已确认任务符合互助范围，物品轻小、可由一位同学携带，并理解所有费用仅为模拟。</span></label><div class="form-error error-hidden" role="alert"></div><button class="btn primary full" type="submit">下一步，确认约定与模拟预付</button><p class="seed-note">草稿会保存在当前身份、当前浏览器中。暂不发送给真实用户。</p></form>`, { type: 'publish' });
  enhancePublishForm(d,source);
}
function enhancePublishForm(values={},source=null) {
  const form=modal.querySelector('#publish-form'); if(!form)return;
  for(const name of ['pickup','dropoff']) {
    const old=form.elements[name],selected=identifySpot(values[name]||''),select=document.createElement('select');
    select.name=name; select.required=true;
    select.innerHTML=`<option value="">选择校内公共${name==='pickup'?'取件':'交接'}点</option>`+Object.entries(SPOTS).map(([id,p])=>`<option value="${p.name}" ${id===selected?'selected':''}>${p.name}</option>`).join('');
    old.replaceWith(select);
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
  const values = Object.fromEntries(new FormData(form)); values.buy = form.elements.buy.checked;
  if(!values.title?.trim()) values.title=`${CATEGORIES[values.category].name}：${SPOTS[identifySpot(values.pickup)]?.short||'取件点'} → ${SPOTS[identifySpot(values.dropoff)]?.short||'交接点'}`;
  if(!values.description?.trim()) values.description=`${values.item}。请按已确认的时间、公共地点和交接方式完成。${values.buy?'购买前先确认商品及报价。':''}`;
  saveDraft(); ui.draft = values;
  const editId = ui.dialog.editId;
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
function chatPanel(id) {
  const t = getTask(id), u = userOf(state);
  if (![t.owner, t.runner].includes(u.id)) return toast('仅任务双方可联系');
  openDialog('任务内联系 · 模拟', `${notice('消息只写入当前浏览器，切换身份才能查看另一方收到的内容。报价、取消和变更仍需在任务里明确确认，聊天不能替代授权。')}<div class="message-list">${t.messages?.length ? t.messages.map(m => `<div class="bubble-row ${m.from === u.id ? 'mine' : ''}">${avatar(userOf(state, m.from))}<p class="bubble">${esc(m.text)}</p></div>`).join('') : '<p class="section-caption">还没有对话。先说清楚交接细节，让下一段路更顺利。</p>'}</div>${['accepted', 'progress', 'delivered'].includes(t.status) ? `<form class="message-form" data-task-form="message" data-id="${id}"><input name="text" maxlength="200" required aria-label="模拟消息内容" placeholder="发送一条本地模拟消息" /><button class="btn primary small" type="submit" aria-label="发送模拟消息">${icon('send', 'sm')}</button></form>` : ''}<div class="modal-actions">${btn('返回任务', 'detail', 'secondary full', `data-id="${id}"`)}</div>`, { type: 'chat', id });
  const list = modal.querySelector('.message-list'); list.scrollTop = list.scrollHeight;
}
function confirmPanel(title, text, label, action, id, extra = '') {
  openDialog(title, `<p class="description">${text}</p>${extra}<div class="modal-actions">${btn('返回任务', 'detail', 'secondary', `data-id="${id}"`)}${btn(label, action, 'primary', `data-id="${id}"`)}</div>`, { type: 'confirm', id });
}

document.addEventListener('click', e => {
  const hub=e.target.closest('[data-action="map-hub"]');
  if(hub) {ui.hub=hub.dataset.spot||null;render();return;}
  const b = e.target.closest('button[data-action]'); if (!b || b.disabled) return;
  const a = b.dataset.action, id = b.dataset.id, t = id ? getTask(id) : null;
  switch (a) {
    case 'mode': ui.mode=b.dataset.mode;ui.hub=null;ui.category='all';ui.query='';render();break;
    case 'swap-route': [ui.from,ui.to]=[ui.to,ui.from];ui.hub=null;render();break;
    case 'widen-route': ui.detour=800;ui.hub=null;render();break;
    case 'continue-runner': ui.mode='runner';navigate('square');break;
    case 'runner-onboard': runnerOnboard(id);break;
    case 'track': showTracking(id);break;
    case 'task-details': ui.forceDetails=true;showTask(id);ui.forceDetails=false;break;
    case 'play-tour': showTour();break;
    case 'tour-toggle': if(ui.tracking?.tour){if(ui.tracking.elapsed>=24000){showTour();break;}ui.tracking.paused=!ui.tracking.paused;ui.tracking.last=performance.now();b.textContent=ui.tracking.paused?'继续演示':'暂停演示';}break;
    case 'tour-next': if(ui.tracking?.tour){const tr=ui.tracking;tr.elapsed=tr.elapsed<8400?8400:tr.elapsed<18000?18000:24000;tr.last=performance.now();}break;
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
      const editId = ui.dialog.editId; showPublish(ui.draft, editId);
      if (editId) { ui.dialog.editId = editId; modal.querySelector('#publish-form').dataset.editId = editId; }
      break;
    }
    case 'publish-confirm': {
      const payload = ui.dialog.payload;
      const command = ui.dialog.command || 'create';
      if (run(command, payload, command === 'edit' ? '任务修改与模拟预算已更新' : '任务已发布，模拟预付已记录')) {
        ui.mode='request';
        try { localStorage.removeItem(`${DRAFT_KEY}:${state.actor}`); } catch { /* no storage */ }
        ui.draft = null; ui.mine = 'published'; ui.status = 'all'; ui.page = 'mine'; showTask(command === 'edit' ? payload.id : state.tasks[0].id); render();
      }
      break;
    }
    case 'demo': saveDraft(); demoPanel(b.dataset.return); break;
    case 'switch-actor': {
      const returnId = b.dataset.return;
      if (run('switch', { actor: b.dataset.actor }, `已切换为${state.users[b.dataset.actor].name}（演示）`)) {
        ui.afterAuth = null; ui.status = 'all';
        if (returnId) showTask(returnId); else closeDialog(); render();
      }
      break;
    }
    case 'rules': rulesPanel(); break;
    case 'credit': showCredit(); break;
    case 'ledger': showLedger(); break;
    case 'reports': showReports(); break;
    case 'read': run('read', {}, '当前身份的消息已标记已读'); break;
    case 'accept':
      if (!requireAuth({ id }))break;
      if(!userOf(state).runnerEnabled){runnerOnboard(id);break;}
      confirmPanel('接下这份顺路之前', `请确认能在 ${date(t.deadline)} 前完成，交接点为 ${esc(t.dropoff)}。${t.buy ? `商品垫付上限 ¥${money(t.budget)}，报酬 ¥${money(t.reward)}。购买前先提交报价并等待发布者确认。` : `无需商品垫付，报酬 ¥${money(t.reward)}。`}${t.handoff==='safe_drop'?'发布者已授权指定交接架放置，记录凭证并通知后可离开。':'需要当面交接，不允许擅自放下。'}最多同时运输一项。`, '我能完成，确认接单', 'accept-confirm', id);
      break;
    case 'accept-confirm': if (run('accept', { id,from:ui.from }, '接单成功，必要的取件信息已开放')) showTask(id); break;
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
  if (form.id === 'publish-form') { publishPreview(form); return; }
  if (form.dataset.taskForm) {
    const p = { ...Object.fromEntries(new FormData(form)), id: form.dataset.id };
    if (run(form.dataset.taskForm, p, form.dataset.taskForm === 'message' ? '模拟消息已记录' : '已记录，任务进度已更新')) {
      if (form.dataset.taskForm === 'message') chatPanel(p.id); else showTask(p.id);
    }
  }
});
document.addEventListener('input', e => {
  if (e.target.id === 'task-search') { ui.query = e.target.value; document.querySelector('#feed-content').innerHTML = feedContent(); }
  if (e.target.closest('#publish-form')) saveDraft();
});
document.addEventListener('change', e => {
  if(['route-from','route-to','route-detour'].includes(e.target.id)) {const id=e.target.id;ui[id==='route-from'?'from':id==='route-to'?'to':'detour']=id==='route-detour'?Number(e.target.value):e.target.value;ui.hub=null;render();document.getElementById(id)?.focus();return;}
  if(e.target.name==='handoff'&&e.target.closest('#publish-form')) {const f=e.target.form,safe=e.target.value==='safe_drop';f.querySelector('.handoff-consent').hidden=!safe;f.elements.dropConsent.required=safe;saveDraft();}
  if(e.target.name==='dropoff'&&e.target.closest('#publish-form')) {e.target.form.elements.dropConsent.checked=false;saveDraft();}
  if (e.target.id === 'sort-select') { ui.sort = e.target.value; document.querySelector('#feed-content').innerHTML = feedContent(); }
  if (e.target.name === 'buy' && e.target.closest('#publish-form')) { const input = modal.querySelector('[name="budget"]'); input.disabled = !e.target.checked; input.required = e.target.checked; saveDraft(); }
});
modal.addEventListener('cancel', e => { e.preventDefault(); closeDialog(); });
modal.addEventListener('click', e => { if (e.target === modal && e.clientX < modal.getBoundingClientRect().left) closeDialog(); });
function navigate(page) {
  closeDialog(); ui.page = ['square', 'mine', 'messages', 'me'].includes(page) ? page : 'square';
  if(ui.page==='mine') ui.mine=ui.mode==='runner'?'accepted':'published';
  history.pushState(null, '', `#${ui.page}`); render(); window.scrollTo({ top: 0, behavior: 'instant' });
}
function route() {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash.startsWith('task/')) { render(); showTask(hash.slice(5), false); }
  else { closeDialog(); ui.page = ['square', 'mine', 'messages', 'me'].includes(hash) ? hash : 'square'; render(); }
}
window.addEventListener('popstate', route);
window.addEventListener('hashchange', route);
window.addEventListener('storage', e => { if (e.key === KEY) toast('另一个标签页修改了演示数据，请刷新后继续，避免覆盖。'); });
route();
setInterval(() => {
  // Never overwrite another tab's newer state while reconciling timeouts.
  let saved;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* In-memory fallback. */ }
  if (saved && (saved.revision !== state.revision || saved.createdAt !== state.createdAt)) return;
  const next = reconcile(state);
  if (next !== state) {
    state = next; persist();
    if (!modal.open && !document.querySelector('#task-search:focus')) render();
    else if (ui.dialog?.type === 'detail') showTask(ui.dialog.id, false);
  } else if (ui.page === 'square' && !modal.open && !document.querySelector('#task-search:focus')) {
    const el = document.querySelector('#feed-content'); if (el) el.innerHTML = feedContent();
  }
}, 60000);
