import { planBatch, activeTransport, runPosition, installRun, assertRunStep, advanceRun, repairRun, MAX_CARRY } from './planning.js';
import { discoveryFixtures } from './discovery-data.js';
import { marketFixtures, marketArrivals, MARKET_VERSION, MARKET_INTERVAL, MARKET_OPEN_LIMIT } from './market-data.js';
import { SPOTS, identifySpot, customPoint, spotOf, taskSpots, matchRoute } from './campus.js';
import { messageContent, MAX_CHAT_IMAGE_TOTAL } from './chat-images.js';
export const SCHOOL = { id: 'nancheng', name: '南城大学', note: '虚构演示校园' };
export const CATEGORIES = {
  all: { name: '全部任务', icon: 'grid' },
  parcel: { name: '取快递', icon: 'box' },
  food: { name: '带餐饮', icon: 'coffee' },
  shopping: { name: '代买物品', icon: 'bag' },
  help: { name: '校园帮忙', icon: 'file' }
};
export const STATUS = { open: '待接单', accepted: '已接单', progress: '进行中', delivered: '待确认', completed: '已完成', cancelled: '已取消', expired: '已过期' };
export const AUTH = { unverified: '未认证', pending: '审核中', verified: '已认证', rejected: '未通过', expired: '认证已过期', restricted: '账号受限' };
export const LIMITS = { reward: 10000, budget: 20000, concurrent: MAX_CARRY };
export const money = cents => (cents / 100).toFixed(cents % 100 ? 2 : 0);
export const clone = x => structuredClone(x);
export function reconcile(original, now = Date.now()) {
  const due = original.tasks.some(t => t.status === 'open' && t.deadline <= now);
  if (!due) return original;
  const s = clone(original);
  s.tasks.forEach(t => {
    if (t.status !== 'open' || t.deadline > now) return;
    t.status = 'expired';
    t.settlement = { prepaid: t.prepaid, expense: 0, runnerPayout: 0, refund: t.prepaid, at: now };
    t.events.push({ text: `到期无人接单，模拟退回全部预算 ¥${money(t.prepaid)}`, at: now });
    s.notifications.unshift({ id: `expire-${t.id}-${t.deadline}`, user: t.owner, title: '任务到期未接单，模拟预算已退回', body: t.title, at: now, task: t.id, read: false });
  });
  s.revision++;
  return s;
}
const active = ['accepted', 'progress', 'delivered'];
const MAX_TEXT = 500;
const fail = msg => { throw new Error(msg); };
const nonempty = (s, label, max = MAX_TEXT) => {
  const v = String(s || '').trim();
  if (!v || v.length > max) fail(`${label}不能为空，且不能超过 ${max} 字`);
  return v;
};
export function cents(value, label, max) {
  const s = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) fail(`${label}请填写正数，最多两位小数`);
  const amount = Math.round(Number(s) * 100);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > max) fail(`${label}应在 0.01–${money(max)} 元之间`);
  return amount;
}
export function createState(now = Date.now()) {
  const users = {
    visitor: { id: 'visitor', name: '新同学', short: '新', department: '体验访客', school: null, auth: 'unverified', runnerEnabled: false, baseCredit: 80 },
    lin: { id: 'lin', name: '林予安', short: '林', department: '设计学院 · 大三', school: SCHOOL.id, auth: 'verified', runnerEnabled: true, validUntil: now + 180 * 86400000, baseCredit: 94 },
    zhou: { id: 'zhou', name: '周以宁', short: '周', department: '信息学院 · 大二', school: SCHOOL.id, auth: 'verified', runnerEnabled: true, validUntil: now + 180 * 86400000, baseCredit: 92 }
  };
  const task = (id, owner, category, title, pickup, dropoff, reward, minutes, extra = {}) => ({
    id, school: SCHOOL.id, owner, runner: null, category, title, pickup, dropoff, reward,
    item: '', description: '', buy: false, budget: 0, prepaid: reward, sensitive: '演示取件码 NC-2048（虚构）',
    size: '轻小件 · 约 1 kg 以内', allowSubstitution: false, deadline: now + minutes * 60000,
    createdAt: now - (minutes % 15 + 1) * 60000, status: 'open', purchase: null,
    change: null, cancelRequest: null, dispute: null, settlement: null, reviews: [],
    pickupSpot: identifySpot(pickup), dropoffSpot: identifySpot(dropoff), handoff: 'meet', dropConsent: false, pickedUpAt: null,
    events: [{ text: '任务已发布，模拟预算已确认', at: now - 900000 }], ...extra
  });
  return {
    version: 1, schemaVersion: 4, actor: 'visitor', revision: 0, createdAt: now,
    users, tasks: [
      task('coffee', 'zhou', 'food', '一杯冰拿铁，送到图书馆', '北门 · 小岛咖啡', '图书馆 · 南门', 500, 60, { buy: true, budget: 2800, prepaid: 3300, item: '冰拿铁 × 1｜中杯、无糖', description: '正在赶论文，想请顺路的同学带杯咖啡。到南门后在站内联系就好，不用进入阅览室。', distance: 0.6 }),
      task('parcel', 'lin', 'parcel', '顺路取件，一份小小的感谢', '西区 · 菜鸟驿站', '三号宿舍 · 楼下交接点', 400, 45, { description: '一个装文具的小包裹，已付款。到楼下交接即可，取件凭据接单后可见。', distance: 0.4 }),
      task('lunch', 'lin', 'food', '从食堂到教室，一份午餐的距离', '第一食堂 · 一楼', '设计楼 · 公共大厅', 500, 50, { buy: true, budget: 3000, prepaid: 3500, item: '鸡腿饭 × 1｜少辣、不加香菜', description: '课间时间比较短，麻烦带一份鸡腿饭。请先发报价让我确认，缺货时先联系，不自行换餐。', distance: 0.8 }),
      task('print', 'zhou', 'help', '帮忙取一下装订好的作业', '南门 · 云朵打印店', '教学楼 A · 一楼大厅', 300, 90, { item: '已付款打印资料 × 1 份', description: '已打印装订好，不涉及代写或代交作业。凭演示取件码领取，公共大厅交接。', distance: 0.3 }),
      task('goods', 'zhou', 'shopping', '文具店的两本空白笔记本', '校内 · 青禾文具店', '二号宿舍 · 楼下交接点', 600, 120, { buy: true, budget: 5000, prepaid: 5600, item: 'A5 空白笔记本 × 2｜米白色', description: '只买指定款式，不需要其他商品。没有米白色的话，请先发替换建议让我确认。', distance: 1.2 }),
      task('ongoing', 'lin', 'help', '带一份社团活动物料', '学生活动中心 · 前台', '操场 · 东侧公共入口', 400, 80, { description: '一袋折叠好的海报，已在前台放好，交接时说明活动名称即可。', distance: 0.5 }),
      task('north-parcel', 'lin', 'parcel', '北门取小包裹，顺路带到三号楼', SPOTS.north.name, SPOTS.dorm3.name, 200, 75, { description: '一个轻小文具包裹。已授权放到三号楼下指定交接架，送达后用演示凭证通知我即可，无需在楼下等候。', item: '已付款文具包裹 × 1', handoff: 'safe_drop', dropConsent: true }),
      task('north-coffee', 'lin', 'food', '回宿舍的路上，帮带一杯咖啡', SPOTS.cafe.name, SPOTS.dorm2.name, 200, 65, { description: '中杯热拿铁一杯，先确认报价，再代买。到二号楼下当面交接。', item: '热拿铁 × 1｜中杯、无糖', buy: true, budget: 2500, prepaid: 2700 }),
      task('forest-pickup', 'lin', 'help', '林间教学楼取资料，顺路带到三号楼', '林间教学楼 · 公共门厅', SPOTS.dorm3.name, 300, 180, {pickupPoint:{x:44,y:340,name:'林间教学楼 · 公共门厅',short:'林间教学楼',custom:true},pickupSpot:null,item:'已装袋的公开活动资料 × 1',description:'在林间教学楼公共门厅领取一袋资料，顺路带到三号楼下当面交接。请勿进入教室或私人区域。'}),
      task('forest-delivery', 'zhou', 'parcel', '从北门带小包裹，到林间教学楼', SPOTS.north.name, '林间教学楼 · 公共门厅', 300, 180, {dropoffPoint:{x:44,y:340,name:'林间教学楼 · 公共门厅',short:'林间教学楼',custom:true},dropoffSpot:null,item:'已付款轻小包裹 × 1',description:'准备去林间教学楼的同学，能否顺路帮带一个小件？公共门厅当面交接，不允许擅自放置。'}),
      ...discoveryFixtures(now),...marketFixtures(now),
      task('finished', 'lin', 'parcel', '已完成的顺路取件', '西区 · 菜鸟驿站', '图书馆 · 南门', 400, -120, { runner: 'zhou', status: 'completed', settlement: { prepaid: 400, expense: 0, runnerPayout: 400, refund: 0, at: now - 3600000 }, events: [{ text: '双方已确认完成，模拟结算 ¥4', at: now - 3600000 }] })
    ],
    runs: [],marketFeed:{seedVersion:MARKET_VERSION,lastAt:now,sequence:0,last:null},
    notifications: [{ id: 'welcome', user: null, title: '欢迎来到南城大学的互助日常', body: '这里的校园、同学、任务和费用均为虚构演示。你可以切换身份，体验完整流程。', at: now, read: false, task: null }],
    reports: []
  };
}
export function migrateState(original, now = Date.now()) {
  if(original.schemaVersion>=4&&original.marketFeed?.seedVersion>=MARKET_VERSION)return original;
  const s=clone(original),seed=createState(now);
  if((original.schemaVersion||0)<2) {
    Object.values(s.users).forEach(u=>{u.runnerEnabled??=u.id!=='visitor';});
    s.tasks.forEach(t=>{t.pickupSpot??=identifySpot(t.pickup);t.dropoffSpot??=identifySpot(t.dropoff);t.handoff??='meet';t.dropConsent??=false;t.pickedUpAt??=t.purchase?.bought?(t.events.find(e=>e.text.includes('购买凭证'))?.at||t.createdAt):null;});
    for(const t of seed.tasks.filter(t=>['north-parcel','north-coffee'].includes(t.id)))if(!s.tasks.some(old=>old.id===t.id))s.tasks.push(t);
  }
  // Add release examples once, without resetting real demo progress or extending old deadlines.
  for(const t of seed.tasks.filter(t=>['forest-pickup','forest-delivery'].includes(t.id)))if(!s.tasks.some(old=>old.id===t.id))s.tasks.push(t);
  if((original.schemaVersion||0)<4)for(const t of discoveryFixtures(now))if(!s.tasks.some(old=>old.id===t.id))s.tasks.push(t);
  if(!(original.marketFeed?.seedVersion>=MARKET_VERSION)){
    for(const t of marketFixtures(now))if(!s.tasks.some(old=>old.id===t.id))s.tasks.push(t);
    s.marketFeed={seedVersion:MARKET_VERSION,lastAt:now,sequence:0,last:null};
  }
  s.runs??=[];s.schemaVersion=4;s.revision++;return s;
}
export const userOf = (s, id = s.actor) => s.users[id];
export function certified(u, now = Date.now()) { return u?.auth === 'verified' && u.school === SCHOOL.id && u.validUntil > now; }
export function statusOf(task, now = Date.now()) { return task.status === 'open' && task.deadline <= now ? 'expired' : task.status; }
export function creditOf(state, id) { return Math.min(100, state.users[id].baseCredit + state.tasks.filter(t => t.status === 'completed' && t.runner === id).length * 2); }
export function reviewAverage(state, id) {
  const values = state.tasks.flatMap(t => t.reviews.filter(r => r.to === id));
  return values.length ? (values.reduce((n, r) => n + r.rating, 0) / values.length).toFixed(1) : '暂无';
}
export function walletSummary(state,actor=state.actor) {
  const received=state.tasks.filter(t=>t.runner===actor&&t.status==='completed'&&t.settlement);
  const pending=state.tasks.filter(t=>t.runner===actor&&['accepted','progress','delivered'].includes(t.status));
  const paid=state.tasks.filter(t=>t.owner===actor);
  return {received,pending,paid,income:received.reduce((n,t)=>n+t.reward,0),reimbursement:received.reduce((n,t)=>n+t.settlement.expense,0),total:received.reduce((n,t)=>n+t.settlement.runnerPayout,0),pendingReward:pending.reduce((n,t)=>n+t.reward,0),pendingExpense:pending.reduce((n,t)=>n+(t.purchase?.bought?t.purchase.actual:0),0),held:paid.filter(t=>!t.settlement).reduce((n,t)=>n+t.prepaid,0),refunded:paid.reduce((n,t)=>n+(t.settlement?.refund||0),0)};
}
export function visibleTask(state, task) {
  const result = clone(task), u = userOf(state);
  if (![task.owner, task.runner].includes(u.id)) {
    delete result.deliveryRunId;delete result.runnerStartSpot; delete result.runnerApproach; delete result.runnerDelivery; delete result.runnerApproachMetres; delete result.runnerDeliveryMetres; delete result.deliveryProof; delete result.messages; delete result.purchase;
    result.events = [];
  }
  if (![task.owner, task.runner].includes(u.id) || ['cancelled', 'completed', 'expired'].includes(task.status)) delete result.sensitive;
  return result;
}
// 禁止内容：按分句检查，同一分句里关键词前面有明确否定（如“不涉及代写”）时不算违规，
// 但否定之后另起分句或“但/却”转折后再出现的关键词仍会拒绝。
const PROHIBITED = ['代考', '代刷', '代写', '占座', '密码', '烟酒', '危险品'];
const NEGATION = /(不涉及|不包括|不包含|不含|不是|不需要|不要|不用|无需|没有|并非|禁止|拒绝|不得|不可|勿|非|无|不)([^，。！？；,.!?;]{0,4})$/;
const REQUEST = /帮|请|找|求|要|想/;
export function prohibitedTerm(text) {
  for (const clause of String(text || '').split(/[，。！？；,.!?;\n]|但是|但|却/)) {
    for (const term of PROHIBITED) {
      let i = clause.indexOf(term);
      while (i !== -1) {
        const m = clause.slice(0, i).match(NEGATION);
        if (!m || REQUEST.test(m[2])) return term;
        i = clause.indexOf(term, i + term.length);
      }
    }
  }
  return null;
}
export function evolve(original, command, p = {}, now = Date.now()) {
  const s = clone(reconcile(original, now)), u = userOf(s), id = p.id;
  const t = id ? s.tasks.find(x => x.id === id) : null;
  const existingRun=t&&s.runs?.find(r=>r.id===t.deliveryRunId),frozenRunPoint=existingRun&&['respondCancel','respondChange'].includes(command)?runPosition(s,existingRun,now).point:null;
  const needsTask = !['switch', 'auth', 'create', 'read', 'enableRunner', 'routeExamples', 'nearbyExamples', 'conversationExamples', 'acceptBatch','marketPulse'].includes(command);
  if (needsTask && !t) fail('这项任务不存在，请返回任务广场');
  const isOwner = () => { if (t.owner !== u.id) fail('只有发布者可以进行此操作'); };
  const isRunner = () => { if (t.runner !== u.id) fail('只有本任务接单者可以进行此操作'); };
  const participant = () => { if (![t.owner, t.runner].includes(u.id)) fail('只有任务双方可以进行此操作'); };
  const usable = () => { if (!certified(u, now)) fail('请先完成有效的南城大学在校认证'); };
  const ensure = (...allowed) => { if (!allowed.includes(statusOf(t, now))) fail('任务状态已变化，当前无法进行此操作'); };
  const clear = () => { if (t.dispute?.status === 'pending' || t.cancelRequest?.status === 'pending') fail('请先处理当前的取消申请或争议'); };
  const event = text => { t.events.push({ text, at: now }); };
  const notify = (target, title, body = '', taskId = id) => {
    s.notifications.unshift({ id: `n-${s.revision}-${s.notifications.length}-${now}`, user: target, title, body, at: now, read: false, task: taskId });
  };
  switch (command) {
    case 'conversationExamples': {
      usable();
      let example=s.tasks.find(task=>[task.owner,task.runner].includes(u.id)&&active.includes(task.status)&&task.runner);
      if(!example){
        const runner=u.id==='zhou'?'lin':'zhou';
        if(activeTransport(s,runner).length)fail('对方正在取送其他任务，请先在已有订单里体验私聊');
        const source=createState(now).tasks.find(task=>task.id==='north-parcel');
        example={...source,id:`conversation-${now}-${s.revision}`,owner:u.id,runner,status:'progress',title:'演示：从北门带资料到设计楼',description:'【虚构演示】一袋封装资料，北门取件，设计楼公共点当面交接。未经另行授权不能放置。',item:'公开活动资料 × 1 袋（虚构）',sensitive:'演示取件码 NC-CHAT（虚构）',dropoff:SPOTS.design.name,dropoffSpot:'design',handoff:'meet',dropConsent:false,acceptedAt:now-20000,startedAt:now-20000,pickedUpAt:now-20000,deadline:now+40*60000,createdAt:now-60000,events:[{text:'载入虚构订单与对话，已模拟取件',at:now-20000}]};
        s.tasks.unshift(example);
        const plan=planBatch([example],'north',{now:now-20000});installRun(s,runner,[example],plan,now-20000);
      }
      if(!example.messages?.length)example.messages=[
        {from:example.owner,text:'【演示对话】我在公共交接点等，快到时站内告诉我就好。',at:now-18000},
        {from:example.runner,text:'【演示对话】收到，我会按这单的约定取送，进度页可以看剩余距离和预计时间。',at:now-14000},
        {from:example.owner,text:'【演示对话】如果要改地点或增加费用，我们先在任务里确认，辛苦了。',at:now-10000}
      ];
      notify(example.owner===u.id?example.runner:example.owner,'虚构订单私聊示例已载入','可切换身份回复；不会联系真实用户。',example.id);
      break;
    }
    case 'marketPulse': {
      if(!s.marketFeed||now-s.marketFeed.lastAt<MARKET_INTERVAL)return s;
      const arrival=marketArrivals(s,now);s.tasks.push(...arrival.tasks);
      s.marketFeed={...s.marketFeed,lastAt:now,sequence:arrival.sequence,last:{hub:arrival.hub,count:arrival.tasks.length,ids:arrival.tasks.map(t=>t.id)}};
      break;
    }
    case 'nearbyExamples': {
      const owner=u.id==='lin'?'zhou':'lin';
      for(const t of discoveryFixtures(now,owner,`${now}-${s.revision}`))if(!s.tasks.some(old=>old.demoScenario==='nearby'&&old.demoExample===t.demoExample&&old.owner===owner&&statusOf(old,now)==='open'))s.tasks.push(t);
      // Explicit refill adds new examples; never renew or overwrite old orders.
      let density=s.tasks.filter(t=>t.demoScenario==='market-density'&&statusOf(t,now)==='open').length;
      for(const t of marketFixtures(now)){
        if(density>=MARKET_OPEN_LIMIT)break;
        if(!s.tasks.some(old=>old.demoScenario==='market-density'&&old.demoExample===t.demoExample&&old.owner===t.owner&&statusOf(old,now)==='open')){s.tasks.push({...t,id:`${t.id}-${now}-${s.revision}`});density++;}
      }
      s.marketFeed={...s.marketFeed,lastAt:now,last:null};
      break;
    }
    case 'acceptBatch': {
      usable();if(!u.runnerEnabled)fail('请先开通接单身份');
      const ids=Array.isArray(p.ids)?p.ids:[];
      if(!ids.length||ids.length!==new Set(ids).size)fail('请选择不同的任务');
      const selected=ids.map(id=>s.tasks.find(t=>t.id===id));
      if(selected.some(t=>!t||statusOf(t,now)!=='open'||t.runner))fail('部分任务已变化，请重新选择');
      if(selected.some(t=>t.owner===u.id))fail('不能接自己发布的任务');
      if(selected.some(t=>t.school!==u.school))fail('仅限同校任务');
      const active=activeTransport(s,u.id),tasks=[...active,...selected];
      if(tasks.length>MAX_CARRY)fail('一次最多同时运输4单，请减少选择');
      if(active.some(t=>[t.change,t.dispute,t.cancelRequest].some(x=>x?.status==='pending')))fail('请先处理同行任务的待确认约定');
      const existing=s.runs?.find(r=>r.runner===u.id&&r.taskIds.some(id=>active.some(t=>t.id===id))),position=existing?runPosition(s,existing,now).point:null;
      const from=position?{...position,name:'同行当前位置',short:'当前位置',custom:true}:customPoint(p.from)||(SPOTS[p.from]?p.from:'north');
      const to=customPoint(p.to)||(SPOTS[p.to]?p.to:null),via=customPoint(p.via)||(SPOTS[p.via]?p.via:null),plan=planBatch(tasks,from,{now,to,via});
      if(!plan?.feasible)fail('这些任务组合预计无法按时送达，请减少或换选任务');
      for(const task of selected){task.runner=u.id;task.status='progress';task.acceptedAt=now;task.startedAt=now;task.events.push({text:`${u.name}已确认同行接单，开始取送`,at:now});notify(task.owner,'有同学接下了你的任务',u.name,task.id);}
      installRun(s,u.id,tasks,plan,now);
      break;
    }
    case 'routeExamples': {
      // Explicit demo action: add examples, never reset or renew existing tasks.
      const owner=u.id==='lin'?'zhou':'lin',base=createState(now).tasks.find(t=>t.id==='parcel');
      const examples=[
        {key:'design',category:'parcel',title:'设计楼取小包裹，顺路送到图书馆',pickup:'design',reward:200,item:'已付款文具包裹 × 1'},
        {key:'south',category:'help',title:'南门打印店取资料，带到图书馆',pickup:'south',reward:200,item:'已装订资料 × 1 份'},
        {key:'walkway',category:'help',title:'设计楼北侧连廊取资料，带到图书馆',point:customPoint({x:285,y:235,name:'设计楼北侧 · 连廊公共点'}),reward:100,item:'公开活动资料 × 1 袋'}
      ];
      for(const e of examples){
        if(s.tasks.some(t=>t.demoScenario==='south-library'&&t.demoExample===e.key&&t.owner===owner&&statusOf(t,now)==='open'))continue;
        s.tasks.unshift({...clone(base),id:`route-${e.key}-${now}-${s.revision}`,owner,category:e.category,title:e.title,pickup:e.point?.name||SPOTS[e.pickup].name,pickupSpot:e.pickup||null,pickupPoint:e.point||null,dropoff:SPOTS.library.name,dropoffSpot:'library',dropoffPoint:null,reward:e.reward,prepaid:e.reward,item:e.item,description:'虚构路线示例：公共点取件，带到图书馆南门当面交接，不发生真实交易。',deadline:now+3*3600000,createdAt:now,demoScenario:'south-library',demoExample:e.key,events:[{text:'已载入虚构路线示例，模拟预付已记录',at:now}]});
      }
      break;
    }
    case 'enableRunner':
      usable();
      if (!p.agree) fail('请先确认接单与交接规范');
      if (u.runnerEnabled) fail('接单身份已开通，无需重复开通');
      u.runnerEnabled = true;
      notify(u.id, '演示接单身份已开通', '仍需逐项确认任务约定，取件信息仅对实际接单者开放。', null);
      break;
    case 'switch':
      if (!s.users[p.actor]) fail('演示身份不存在');
      s.actor = p.actor;
      break;
    case 'auth': {
      if (u.id !== 'visitor') fail('请切换到新同学身份体验模拟认证');
      if (!['unverified', 'pending', 'verified', 'rejected', 'expired', 'restricted'].includes(p.status)) fail('无效认证状态');
      u.auth = p.status;
      u.school = p.status === 'verified' ? SCHOOL.id : u.school;
      u.validUntil = p.status === 'verified' ? now + 180 * 86400000 : 0;
      u.authAt = now;
      notify(u.id, `模拟认证：${AUTH[p.status]}`, '这里只更新虚构身份，不核验真实学籍。', null);
      break;
    }
    case 'create':
    case 'edit': {
      usable();
      if (command === 'edit') { isOwner(); ensure('open'); }
      const title = nonempty(p.title, '标题', 40), description = nonempty(p.description, '任务说明', 300);
      if (!CATEGORIES[p.category] || p.category === 'all') fail('请选择任务类别');
      { const hit = prohibitedTerm([title, description, p.item || ''].join('。')); if (hit) fail(`该任务涉及“${hit}”，超出演示支持范围，请查看发布规则`); }
      let pickup = nonempty(p.pickup, '取件或购买地点', 60), dropoff = nonempty(p.dropoff, '公共交接地点', 60);
      const reward = cents(p.reward, '跑腿报酬', LIMITS.reward);
      const urgentBonus=p.urgentBonus&&Number(p.urgentBonus)>0?cents(p.urgentBonus,'加急报酬',LIMITS.reward):0;
      if(urgentBonus>=reward)fail('加急报酬须包含在总报酬内，并保留基础跑腿费');
      const readyAt=p.readyAt?Number(p.readyAt):now;
      if(!Number.isFinite(readyAt))fail('请选择有效的取件时间');
      const budget = p.buy ? cents(p.budget, '商品预算上限', LIMITS.budget) : 0;
      const deadline = Number(p.deadline);
      if (readyAt>=deadline)fail('可取时间须早于送达期限');
      if (!Number.isFinite(deadline) || deadline <= now || deadline > now + 7 * 86400000) fail('截止时间应在当前时间之后的 7 天内');
      const item = nonempty(p.item, p.buy ? '商品规格与数量' : '物品说明', 150);
      const pickupPoint=p.pickupPoint?customPoint(p.pickupPoint):null,dropoffPoint=p.dropoffPoint?customPoint(p.dropoffPoint):null;
      if((p.pickupPoint&&!pickupPoint)||(p.dropoffPoint&&!dropoffPoint))fail('自定义落点须位于校园示意范围内，并填写40字内的公共地点名称');
      const pickupSpot=pickupPoint?null:identifySpot(pickup),dropoffSpot=dropoffPoint?null:identifySpot(dropoff);
      if((!pickupSpot&&!pickupPoint)||(!dropoffSpot&&!dropoffPoint))fail('请在地图标注校内公共取送点，或选择常用地点');
      pickup=(pickupPoint||SPOTS[pickupSpot]).name;dropoff=(dropoffPoint||SPOTS[dropoffSpot]).name;
      const handoff = p.handoff === 'safe_drop' ? 'safe_drop' : 'meet';
      const dropConsent = p.dropConsent === true || p.dropConsent === 'on';
      if (handoff === 'safe_drop' && (!dropConsent || !SPOTS[dropoffSpot]?.safeDrop)) fail('公共点自取须事先授权，并选择支持放置的指定交接架');
      const taskId = command === 'edit' ? t.id : `task-${now}-${s.revision}`;
      const record = {
        id: taskId, school: SCHOOL.id, owner: u.id, runner: null, category: p.category,
        title, pickup, dropoff, reward, urgentBonus, baseReward:reward-urgentBonus, urgent:urgentBonus>0, readyAt, buy: !!p.buy, budget, prepaid: reward + budget,
        description, item, size: '轻小件 · 约 1 kg 以内', allowSubstitution: false,
        pickupSpot, dropoffSpot, pickupPoint, dropoffPoint, handoff, dropConsent: handoff === 'safe_drop' && dropConsent, pickedUpAt: null,
        sensitive: '演示取件码 NC-8261（虚构）', deadline, createdAt: now,
        status: 'open', purchase: null, change: null, cancelRequest: null, dispute: null,
        settlement: null, reviews: [], events: [{ text: `任务已发布，模拟预付 ¥${money(reward + budget)}`, at: now }]
      };
      if (command === 'edit') {
        const old = t.prepaid;
        Object.assign(t, record, { createdAt: t.createdAt, events: t.events });
        event(`待接单任务已修改，${record.prepaid >= old ? `模拟补付 ¥${money(record.prepaid - old)}` : `模拟退回 ¥${money(old - record.prepaid)}`}`);
      } else s.tasks.unshift(record);
      notify(u.id, command === 'edit' ? '任务约定已修改' : '任务发布成功', `当前模拟预付 ¥${money(reward + budget)}；没有发生真实付款。`, taskId);
      break;
    }
    case 'accept':
      usable(); ensure('open');
      if (!u.runnerEnabled) fail('请先开通接单身份，再接下具体任务');
      if (t.school !== u.school) fail('仅限同校有效认证学生接单');
      if (t.owner === u.id) fail('不能接自己发布的任务');
      if (t.runner) fail('任务已被其他同学接走');
      if (s.tasks.filter(x => x.runner === u.id && ['accepted','progress'].includes(x.status)).length >= LIMITS.concurrent) fail('最多同时运输4单，请先完成手头任务');
      t.runner = u.id; t.status = 'accepted';
      t.acceptedAt = now; t.runnerStartSpot = customPoint(p.from) || (SPOTS[p.from] ? p.from : 'north');
      { const end=customPoint(p.to)||(SPOTS[p.to]?p.to:taskSpots(t).dropoff),via=customPoint(p.via)||(SPOTS[p.via]?p.via:null),route=matchRoute(t,t.runnerStartSpot,end,via);
        if(route){t.runnerApproach=route.approachNodes;t.runnerDelivery=route.deliveryNodes;t.runnerApproachMetres=route.toPickup;t.runnerDeliveryMetres=route.taskDistance;}
      }
      if(p.depart===true){t.status='progress';t.startedAt=now;}
      event(`${u.name}已接单并确认任务约定${p.depart===true?'，正在前往取件点':''}`); notify(t.owner, '有同学接下了你的任务', u.name);
      break;
    case 'start':
      isRunner(); ensure('accepted'); clear(); t.status = 'progress';
      if (t.change?.status === 'pending') fail('请先处理待确认的地点变更');
      event('接单者已开始履约'); notify(t.owner, '同学已开始跑腿');
      t.startedAt = now;
      break;
    case 'pickup':
      isRunner(); ensure('progress'); clear();
      if (t.change?.status === 'pending') fail('请先处理待确认的交接地点变更');
      if (t.buy) fail('代买任务请先完成报价授权、购买与凭证提交');
      if (t.pickedUpAt) fail('已确认取件，无需重复操作');
      if(t.readyAt&&now<t.readyAt)fail('尚未到预约可取时间');
      assertRunStep(s,t,'pickup');
      t.pickedUpAt = now;
      advanceRun(s,t,'pickup',now);
      event('接单者确认已取到物品，开始送往交接点'); notify(t.owner, '物品已取到，正在送来');
      break;
    case 'quote': {
      isRunner(); ensure('progress'); clear();
      if (t.change?.status === 'pending') fail('请先处理待确认的地点变更');
      if (!t.buy || t.purchase?.bought) fail('当前任务不需要报价，或已经购买');
      if (['pending', 'approved'].includes(t.purchase?.status)) fail('请先完成当前报价；修改前请撤回旧报价');
      const amount = cents(p.amount, '商品报价', LIMITS.budget), item = nonempty(p.item, '本次购买规格与数量', 150);
      const reward = p.reward ? cents(p.reward, '变更后的报酬', LIMITS.reward) : t.reward;
      t.purchase = { status: 'pending', amount, item, reward, bought: false, receipt: null };
      event(`提交采购确认：${item}，商品 ¥${money(amount)}，报酬 ¥${money(reward)}`);
      notify(t.owner, '请确认代买商品及报价', `商品 ¥${money(amount)}${amount > t.budget ? '，超出原预算，需模拟补足预算' : ''}`);
      break;
    }
    case 'withdrawQuote':
      isRunner(); ensure('progress'); clear();
      if (!t.purchase || t.purchase.bought) fail('当前报价无法撤回');
      t.purchase = { ...t.purchase, status: 'withdrawn' };
      event('接单者已撤回采购报价，旧授权失效'); notify(t.owner, '采购报价已撤回');
      break;
    case 'approveQuote': {
      isOwner(); ensure('progress'); clear();
      if (t.purchase?.status !== 'pending') fail('没有待确认的报价');
      const old = t.prepaid;
      t.budget = Math.max(t.budget, t.purchase.amount);
      t.reward = t.purchase.reward;
      // Reserved budget is never silently reduced; a lower reward is refunded at final settlement.
      t.prepaid = Math.max(old, t.budget + t.reward);
      t.purchase.status = 'approved';
      event(`发布者确认商品与报价${t.prepaid > old ? `，模拟补付 ¥${money(t.prepaid - old)}` : ''}`);
      notify(t.runner, '采购报价已确认', '仅可按本次确认的商品与价格购买');
      break;
    }
    case 'rejectQuote':
      isOwner(); ensure('progress'); clear();
      if (t.purchase?.status !== 'pending') fail('没有待确认的报价');
      t.purchase.status = 'rejected';
      event('发布者未同意本次报价，尚未授权购买'); notify(t.runner, '采购报价未获同意', '请重新沟通并提交报价，或协商取消');
      break;
    case 'buy': {
      isRunner(); ensure('progress'); clear();
      if (t.change?.status === 'pending') fail('请先处理待确认的地点变更');
      if (!t.buy || t.purchase?.status !== 'approved' || t.purchase.bought) fail('请先取得发布者对本次商品与报价的明确确认');
      if(t.readyAt&&now<t.readyAt)fail('尚未到预约可取时间');
      const actual = cents(p.amount, '实际商品支出', LIMITS.budget);
      if (actual > t.purchase.amount || actual > t.budget) fail('实际费用超出授权，购买前必须重新提交报价并获得确认');
      const receipt = nonempty(p.receipt, '凭证说明', 200);
      t.purchase.actual = actual; t.purchase.receipt = receipt; t.purchase.bought = true; t.purchase.status = 'bought';
      assertRunStep(s,t,'pickup');
      t.pickedUpAt = now;
      advanceRun(s,t,'pickup',now);
      event(`提交虚构购买凭证，实际支出 ¥${money(actual)}`); notify(t.owner, '购买凭证已提交', `实际商品支出 ¥${money(actual)}`);
      break;
    }
    case 'deliver':
      isRunner(); ensure('progress'); clear();
      assertRunStep(s,t,'dropoff');
      if (t.change?.status === 'pending') fail('请先处理待确认的交接地点变更');
      if (t.buy && !t.purchase?.bought) fail('请先完成报价确认、模拟购买和凭证提交');
      if (!t.pickedUpAt) fail('请先确认已取到物品，再提交送达');
      if (t.handoff === 'safe_drop') {
        if (!t.dropConsent || !SPOTS[t.dropoffSpot]?.safeDrop) fail('未获得指定地点放置授权，不能改为自行放置');
        if (p.proof !== 'sample' || p.spot !== t.dropoffSpot) fail('请核对授权地点，并提交明确标注的演示放置凭证');
        t.deliveryProof = { spot: t.dropoffSpot, at: now, image: 'assets/handoff-sample.png', sample: true };
        t.pickupBy = now + 30 * 60000;
      }
      t.deliveryNote = nonempty(p.note, '交接说明', 200); t.status = 'delivered';
      t.deliveredAt = now;advanceRun(s,t,'dropoff',now);
      event(t.handoff === 'safe_drop' ? '已按事先授权放置，记录凭证并通知发布者，接单者可离开' : '已提交当面交接，等待发布者确认');
      notify(t.owner, t.handoff === 'safe_drop' ? '物品已放至指定交接架，请及时自取' : '请确认是否收到物品', `${t.dropoff} · ${t.deliveryNote}`);
      break;
    case 'complete': {
      isOwner(); ensure('delivered'); clear();
      if (t.settlement) fail('这项任务已经结算，不能重复操作');
      if (t.buy && !t.purchase?.bought) fail('缺少有效购买凭证，无法结算');
      const expense = t.buy ? t.purchase.actual : 0, runnerPayout = expense + t.reward;
      if (!Number.isInteger(expense) || runnerPayout > t.prepaid) fail('费用记录不一致，请申请处理');
      t.status = 'completed';
      t.settlement = { prepaid: t.prepaid, expense, runnerPayout, refund: t.prepaid - runnerPayout, at: now };
      event(`发布者确认完成：模拟结算 ¥${money(runnerPayout)}，退回预算 ¥${money(t.settlement.refund)}`);
      notify(t.runner, '任务已完成，模拟结算已记录', `商品报销 ¥${money(expense)} + 报酬 ¥${money(t.reward)}`);
      break;
    }
    case 'review': {
      participant(); ensure('completed'); clear();
      if (t.reviews.some(r => r.from === u.id)) fail('你已经评价过这项任务');
      const rating = Number(p.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) fail('请选择 1–5 星评价');
      const to = t.owner === u.id ? t.runner : t.owner;
      t.reviews.push({ from: u.id, to, rating, text: nonempty(p.text, '评价内容', 200), at: now });
      event('一方已提交评价'); notify(to, '收到一条任务评价');
      break;
    }
    case 'cancel':
      isOwner(); ensure('open');
      t.status = 'cancelled'; t.settlement = { prepaid: t.prepaid, expense: 0, runnerPayout: 0, refund: t.prepaid, at: now };
      event(`未接单取消，模拟退回 ¥${money(t.prepaid)}`);
      break;
    case 'requestCancel':
      participant(); ensure('accepted', 'progress', 'delivered'); clear();
      if (t.change?.status === 'pending') fail('请先处理待确认的地点变更，再申请取消');
      if (t.pickedUpAt || t.purchase?.bought || t.status === 'delivered') fail('已取件、已购买或已送达的任务不能直接取消，请提交问题并说明物品与费用去向');
      t.cancelRequest = { from: u.id, reason: nonempty(p.reason, '取消原因', 200), status: 'pending', at: now };
      event('一方发起取消申请，等待对方确认'); notify(t.owner === u.id ? t.runner : t.owner, '请处理取消申请');
      break;
    case 'respondCancel':
      participant();
      if (t.dispute?.status === 'pending') fail('任务正在争议处理中，无法直接取消');
      if (t.cancelRequest?.status !== 'pending' || t.cancelRequest.from === u.id) fail('只能由另一方处理待确认的取消申请');
      if (p.approve) {
        if (t.pickedUpAt || t.purchase?.bought) fail('已取件或已购买的任务必须先处理物品和费用');
        t.status = 'cancelled'; t.cancelRequest.status = 'approved';
        t.settlement = { prepaid: t.prepaid, expense: 0, runnerPayout: 0, refund: t.prepaid, at: now };
        event(`双方同意取消，模拟退回 ¥${money(t.prepaid)}`);
      } else { t.cancelRequest.status = 'rejected'; event('对方未同意取消，原约定保留，可沟通或申请处理'); }
      notify(t.cancelRequest.from, p.approve ? '取消申请已同意' : '取消申请未获同意');
      break;
    case 'change':
      participant(); ensure('accepted', 'progress'); clear();
      if (t.change?.status === 'pending') fail('已有待处理的地点变更申请');
      if (!identifySpot(p.dropoff) || (t.handoff === 'safe_drop' && !SPOTS[identifySpot(p.dropoff)]?.safeDrop)) fail('请选择受支持的公共交接点；自取任务仅允许指定交接架');
      t.change = { from: u.id, dropoff: SPOTS[identifySpot(p.dropoff)].name, reason: nonempty(p.reason, '变更原因', 200), status: 'pending', at: now };
      event('已提出交接地点变更，原地点暂时保留'); notify(t.owner === u.id ? t.runner : t.owner, '请确认交接地点变更');
      break;
    case 'respondChange':
      participant(); ensure('accepted', 'progress'); clear();
      if (t.change?.status !== 'pending' || t.change.from === u.id) fail('只能由另一方确认地点变更');
      t.change.status = p.approve ? 'approved' : 'rejected';
      if (p.approve) { t.dropoff = t.change.dropoff; t.dropoffSpot = identifySpot(t.change.dropoff); t.dropoffPoint=null; delete t.runnerDelivery; delete t.runnerDeliveryMetres; repairRun(s,t,now,frozenRunPoint); }
      event(p.approve ? `双方确认新交接地点：${t.dropoff}` : '地点变更未获同意，继续按原地点交接');
      notify(t.change.from, p.approve ? '交接地点已更新' : '地点变更未获同意');
      break;
    case 'dispute':
      participant(); ensure('accepted', 'progress', 'delivered', 'completed');
      if (t.dispute?.status === 'pending') fail('已有待处理的问题，请查看处理进度');
      t.dispute = { from: u.id, reason: nonempty(p.reason, '问题说明', 300), goods: nonempty(p.goods, '物品与费用现状', 200), status: 'pending', at: now, alreadySettled: !!t.settlement };
      event(t.settlement ? '已提交完成后售后申请，既有结算不自动撤销' : '已提交问题，暂缓结算与信用判定');
      notify(t.owner === u.id ? t.runner : t.owner, '任务有问题待处理', t.dispute.reason);
      break;
    case 'report': {
      usable();
      const reason = nonempty(p.reason, '举报原因', 300);
      if (s.reports.some(r => r.task === id && r.from === u.id)) fail('已经提交过举报，请等待处理');
      s.reports.push({ id: `report-${now}`, task: id, from: u.id, reason, status: 'pending', at: now });
      notify(u.id, '举报已记录，等待模拟审核', '不会因为单次举报直接处罚对方');
      break;
    }
    case 'message': {
      participant();
      if (!active.includes(t.status)) fail('该任务当前仅支持查看历史沟通');
      const content=messageContent(p);
      if(content.image&&s.tasks.reduce((sum,task)=>sum+(task.messages||[]).reduce((n,m)=>n+(m.image?.src?.length||0),0),0)+content.image.src.length>MAX_CHAT_IMAGE_TOTAL)fail('本地演示图片空间已满；文字消息仍可发送');
      t.messages ||= [];
      t.messages.push({ from: u.id, ...content, at: now });
      notify(t.owner === u.id ? t.runner : t.owner, content.image?'收到订单图片':'收到任务内模拟消息', content.text||'发来一张交接图片');
      break;
    }
    case 'read':
      s.notifications.forEach(n => { if (!n.user || n.user === u.id) n.read = true; });
      break;
    default: fail('暂不支持这个操作');
  }
  if(command==='respondCancel'&&t?.status==='cancelled')repairRun(s,t,now,frozenRunPoint);
  s.revision++;
  return s;
}
