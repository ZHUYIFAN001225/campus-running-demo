import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, migrateState, evolve, reconcile, creditOf, visibleTask, cents, LIMITS } from '../lib/model.js';
import { SPOTS, shortestPath, matchRoute, pointAlong } from '../lib/campus.js';
const now = Date.now();
const step = (s, cmd, p = {}) => evolve(s, cmd, p, now);
const as = (s, actor) => step(s, 'switch', { actor });
const fresh = (actor = 'zhou') => as(createState(now), actor);
function preparing() { return step(step(fresh(), 'accept', { id: 'lunch' }), 'start', { id: 'lunch' }); }
function bought(amount = '26') {
  let s = step(preparing(), 'quote', { id: 'lunch', item: '鸡腿饭 × 1，少辣', amount, reward: '5' });
  s = step(as(s, 'lin'), 'approveQuote', { id: 'lunch' });
  return step(as(s, 'zhou'), 'buy', { id: 'lunch', amount, receipt: '虚构小票 NC-102' });
}
function done() { return step(as(step(bought(), 'deliver', { id: 'lunch', note: '公共大厅已当面交接（模拟）' }), 'lin'), 'complete', { id: 'lunch' }); }
test('身份：未认证、待审核、过期、非同校均不能接单', () => {
  let s = fresh('visitor');
  for (const status of ['unverified', 'pending', 'rejected', 'expired', 'restricted']) { s = step(s, 'auth', { status }); assert.throws(() => step(s, 'accept', { id: 'lunch' }), /认证/); }
  s = fresh(); s.users.zhou.school = 'other'; assert.throws(() => step(s, 'accept', { id: 'lunch' }), /认证/);
  s = fresh(); s.users.zhou.validUntil = now - 1; assert.throws(() => step(s, 'accept', { id: 'lunch' }), /认证/);
});
test('接单：禁止自接、重复接、过期接单和超过四单运输', () => {
  assert.throws(() => step(fresh('lin'), 'accept', { id: 'lunch' }), /自己/);
  let s = fresh(); s.tasks.find(t => t.id === 'lunch').deadline = now - 1;
  assert.throws(() => step(s, 'accept', { id: 'lunch' }), /状态/);
  s = step(fresh(), 'accept', { id: 'lunch' }); assert.throws(() => step(s, 'accept', { id: 'lunch' }), /状态/);
  s=step(s,'accept',{id:'parcel'});s=step(s,'accept',{id:'north-parcel'});s=step(s,'accept',{id:'north-coffee'});
  assert.throws(() => step(s, 'accept', { id: 'ongoing' }), /同时/);
  s = step(as(s, 'visitor'), 'auth', { status: 'verified' }); assert.throws(() => step(s, 'accept', { id: 'lunch' }), /状态/);
});
test('隐私：旁观者不展示取件码，接单双方可见，取消后关闭', () => {
  const s = fresh('lin'), t = s.tasks.find(t => t.id === 'lunch');
  assert.equal(typeof visibleTask(s, t).sensitive, 'string'); assert.equal(visibleTask(as(s, 'zhou'), t).sensitive, undefined);
  assert.equal(visibleTask(as(s, 'visitor'), t).sensitive, undefined);
  const a = step(as(s, 'zhou'), 'accept', { id: 'lunch' }); assert.equal(typeof visibleTask(a, a.tasks.find(t => t.id === 'lunch')).sensitive, 'string');
  const c = step(s, 'cancel', { id: 'lunch' }); assert.equal(visibleTask(c, c.tasks.find(t => t.id === 'lunch')).sensitive, undefined);
});
test('代买：未确认不能购买或送达，接单者不能替发布者授权', () => {
  let s = preparing();
  assert.throws(() => step(s, 'buy', { id: 'lunch', amount: '26', receipt: '样例' }), /明确确认/);
  assert.throws(() => step(s, 'deliver', { id: 'lunch', note: '模拟送达' }), /报价/);
  s = step(s, 'quote', { id: 'lunch', item: '鸡腿饭 × 1', amount: '26' });
  assert.throws(() => step(s, 'approveQuote', { id: 'lunch' }), /发布者/);
  assert.throws(() => step(s, 'buy', { id: 'lunch', amount: '26', receipt: '样例' }), /明确确认/);
});
test('结算：预付35、支出26、报酬5，结算31、退回4，金额守恒且不可重结', () => {
  const s = done(), t = s.tasks.find(t => t.id === 'lunch');
  assert.deepEqual({ ...t.settlement, at: 0 }, { prepaid: 3500, expense: 2600, runnerPayout: 3100, refund: 400, at: 0 });
  assert.equal(t.settlement.runnerPayout + t.settlement.refund, t.prepaid);
  assert.throws(() => step(s, 'complete', { id: 'lunch' }), /状态|结算/);
});
test('超额与报酬变更：同意后补预算，实际支出不能超授权', () => {
  let s = step(preparing(), 'quote', { id: 'lunch', item: '新套餐', amount: '35', reward: '6' });
  assert.equal(s.tasks.find(t => t.id === 'lunch').prepaid, 3500);
  s = step(as(s, 'lin'), 'approveQuote', { id: 'lunch' }); assert.equal(s.tasks.find(t => t.id === 'lunch').prepaid, 4100);
  s = as(s, 'zhou'); assert.throws(() => step(s, 'buy', { id: 'lunch', amount: '36', receipt: '样例' }), /超出授权/);
  s = step(s, 'buy', { id: 'lunch', amount: '34', receipt: '样例' }); assert.equal(s.tasks.find(t => t.id === 'lunch').purchase.actual, 3400);
});
test('撤回报价后旧授权失效，同一任务不能重复买', () => {
  let s = step(preparing(), 'quote', { id: 'lunch', item: '套餐', amount: '26' });
  s = step(as(s, 'lin'), 'approveQuote', { id: 'lunch' }); s = step(as(s, 'zhou'), 'withdrawQuote', { id: 'lunch' });
  assert.throws(() => step(s, 'buy', { id: 'lunch', amount: '26', receipt: '样例' }), /明确确认/);
  assert.throws(() => step(bought(), 'buy', { id: 'lunch', amount: '26', receipt: '样例' }), /明确确认/);
});
test('取消须对方确认，申请期间禁止继续采购', () => {
  let s = step(preparing(), 'requestCancel', { id: 'lunch', reason: '临时有课，尚未购买' });
  assert.throws(() => step(s, 'respondCancel', { id: 'lunch', approve: true }), /另一方/);
  assert.throws(() => step(s, 'quote', { id: 'lunch', item: '饭', amount: '26' }), /取消申请/);
  s = step(as(s, 'lin'), 'respondCancel', { id: 'lunch', approve: true });
  assert.equal(s.tasks.find(t => t.id === 'lunch').status, 'cancelled'); assert.equal(s.tasks.find(t => t.id === 'lunch').settlement.refund, 3500);
});
test('购买后不能直接取消，争议冻结正常结算且不自动扣信用', () => {
  let s = bought(); assert.throws(() => step(s, 'requestCancel', { id: 'lunch', reason: '取消' }), /已购买/);
  s = as(step(s, 'deliver', { id: 'lunch', note: '已在公共点交接' }), 'lin'); const before = creditOf(s, 'zhou');
  s = step(s, 'dispute', { id: 'lunch', reason: '商品与约定不同', goods: '物品在发布者，接单者垫付26元' });
  assert.throws(() => step(s, 'complete', { id: 'lunch' }), /争议/); assert.equal(creditOf(s, 'zhou'), before);
  assert.equal(s.tasks.find(t => t.id === 'lunch').settlement, null);
});
test('地点变更由另一方同意，不能静默修改', () => {
  let s = preparing(); const old = s.tasks.find(t => t.id === 'lunch').dropoff;
  s = step(s, 'change', { id: 'lunch', dropoff: '图书馆公共门口', reason: '临时调课' }); assert.equal(s.tasks.find(t => t.id === 'lunch').dropoff, old);
  assert.throws(() => step(s, 'respondChange', { id: 'lunch', approve: true }), /另一方/);
  s = step(as(s, 'lin'), 'respondChange', { id: 'lunch', approve: true }); assert.equal(s.tasks.find(t => t.id === 'lunch').dropoff, SPOTS.library.name);
});
test('评价只允许完成后参与方各一次，评价不重复加信用', () => {
  assert.throws(() => step(preparing(), 'review', { id: 'lunch', rating: 5, text: '很好' }), /状态/);
  let s = done(); const credit = creditOf(s, 'zhou');
  s = step(s, 'review', { id: 'lunch', rating: 5, text: '准时，沟通清楚' }); assert.equal(creditOf(s, 'zhou'), credit);
  assert.throws(() => step(s, 'review', { id: 'lunch', rating: 5, text: '重复' }), /已经评价/);
  assert.throws(() => step(as(s, 'visitor'), 'review', { id: 'lunch', rating: 5, text: '旁观者' }), /双方/);
  s = step(as(s, 'zhou'), 'review', { id: 'lunch', rating: 4, text: '约定清楚' });
  const reviews = s.tasks.find(t => t.id === 'lunch').reviews; assert.equal(reviews.length, 2); assert.ok(reviews.every(r => r.from !== r.to));
});
test('发布在模型校验认证、金额、期限、字段和禁止任务', () => {
  const p = { title: '帮忙取餐', description: '已付款，小件，公共点交接', category: 'food', pickup: '食堂', dropoff: '图书馆', item: '餐品1份', reward: '5', buy: true, budget: '30', deadline: now + 3600000 };
  assert.throws(() => step(fresh('visitor'), 'create', p), /认证/);
  for (const patch of [{ title: '' }, { reward: '-1' }, { reward: '1.234' }, { deadline: now - 1 }, { budget: '201' }, { title: '代考' }]) assert.throws(() => step(fresh('lin'), 'create', { ...p, ...patch }));
  const created = step(fresh('lin'), 'create', p).tasks[0]; assert.equal(created.prepaid, 3500); assert.equal(created.owner, 'lin');
});
test('金额拒绝NaN、指数、负数、零、超限及超过两位小数', () => {
  for (const bad of ['NaN', '1e2', '-1', '0', '1.001', 'Infinity', '201']) assert.throws(() => cents(bad, '预算', LIMITS.budget));
  assert.equal(cents('0.29', '预算', LIMITS.budget), 29);
});
test('状态变更不修改原对象，序列化后保持采购状态', () => {
  const initial = preparing(), json = JSON.stringify(initial), s = step(initial, 'quote', { id: 'lunch', item: '鸡腿饭', amount: '26' });
  assert.equal(JSON.stringify(initial), json); assert.equal(JSON.parse(JSON.stringify(s)).tasks.find(t => t.id === 'lunch').purchase.status, 'pending');
});
test('交接地点待确认时不能购买或并发取消，确认后恢复', () => {
  let s = step(preparing(), 'quote', { id: 'lunch', item: '鸡腿饭', amount: '26' });
  s = step(as(s, 'lin'), 'approveQuote', { id: 'lunch' }); s = as(s, 'zhou');
  s = step(s, 'change', { id: 'lunch', dropoff: '图书馆南门', reason: '临时调课' });
  assert.throws(() => step(s, 'buy', { id: 'lunch', amount: '26', receipt: '样例' }), /地点变更/);
  assert.throws(() => step(s, 'requestCancel', { id: 'lunch', reason: '无法继续' }), /地点变更/);
  s = step(as(s, 'lin'), 'respondChange', { id: 'lunch', approve: true });
  s = step(as(s, 'zhou'), 'buy', { id: 'lunch', amount: '26', receipt: '样例' });
  assert.equal(s.tasks.find(t => t.id === 'lunch').purchase.bought, true);
});
test('未接单可以修改，已接单与非发布者不能改，保留审计时间线', () => {
  const p = { id: 'lunch', title: '改为一份米饭套餐', description: '公共点交接', category: 'food', pickup: '食堂', dropoff: '图书馆', item: '饭1份', reward: '4', buy: true, budget: '20', deadline: now + 3600000 };
  let s = fresh('lin'); const len = s.tasks.length, created = s.tasks.find(t => t.id === 'lunch').createdAt;
  s = step(s, 'edit', p); const t = s.tasks.find(t => t.id === 'lunch');
  assert.equal(s.tasks.length, len); assert.equal(t.prepaid, 2400); assert.equal(t.createdAt, created); assert.equal(t.events.length, 2);
  assert.throws(() => step(as(s, 'zhou'), 'edit', p), /发布者/);
  s = step(as(s, 'zhou'), 'accept', { id: 'lunch' }); assert.throws(() => step(as(s, 'lin'), 'edit', p), /状态/);
});
test('无人接单超时全额退回一次；已接单任务超时不擅自退款或完成', () => {
  let s = fresh(); const t = s.tasks.find(t => t.id === 'lunch'); t.deadline = now - 1;
  const next = reconcile(s, now), expired = next.tasks.find(t => t.id === 'lunch');
  assert.equal(expired.status, 'expired'); assert.equal(expired.settlement.refund, 3500);
  assert.equal(reconcile(next, now + 1), next);
  const accepted = step(fresh(), 'accept', { id: 'parcel' }); accepted.tasks.find(t => t.id === 'parcel').deadline = now - 1;
  const keep = reconcile(accepted, now).tasks.find(t => t.id === 'parcel');
  assert.equal(keep.status, 'accepted'); assert.equal(keep.settlement, null);
});
test('已付款取件不需要采购报价，正常完成只结算报酬', () => {
  let s = step(fresh(), 'accept', { id: 'parcel' }); s = step(s, 'start', { id: 'parcel' });
  assert.throws(()=>step(s,'deliver',{id:'parcel',note:'未取就送达'}),/先确认已取/);
  s=step(s,'pickup',{id:'parcel'});
  s = step(s, 'deliver', { id: 'parcel', note: '公共交接点当面交接' }); s = step(as(s, 'lin'), 'complete', { id: 'parcel' });
  const t = s.tasks.find(t => t.id === 'parcel'); assert.equal(t.settlement.runnerPayout, 400); assert.equal(t.settlement.refund, 0);
  assert.equal(visibleTask(s, t).sensitive, undefined);
});

test('禁止内容：否定说明不误判，真正违规仍拒绝；内置打印资料单可正常编辑', async () => {
  const { prohibitedTerm, createState, evolve, SCHOOL } = await import('../lib/model.js');
  assert.equal(prohibitedTerm('已打印装订好，不涉及代写或代交作业。'), null);
  assert.equal(prohibitedTerm('包裹里没有烟酒，也不含危险品'), null);
  assert.equal(prohibitedTerm('帮我代写一份作业'), '代写');
  assert.equal(prohibitedTerm('不涉及代写，但请帮我代考'), '代考');
  assert.equal(prohibitedTerm('不是代考，是帮忙代刷考勤'), '代刷');
  assert.equal(prohibitedTerm('可以代写吗'), '代写');
  assert.equal(prohibitedTerm('明天不在宿舍帮我代写'), '代写');
  assert.equal(prohibitedTerm('不用帮我代考'), '代考');
  const now = Date.now();
  let s = evolve(createState(now), 'switch', { actor: 'zhou' }, now);
  const t = s.tasks.find(x => x.id === 'print');
  s = evolve(s, 'edit', { id: 'print', category: t.category, title: t.title, description: t.description, item: t.item, pickup: t.pickup, dropoff: t.dropoff, reward: '4', deadline: now + 3600000 }, now);
  assert.equal(s.tasks.find(x => x.id === 'print').reward, 400);
  assert.throws(() => evolve(s, 'edit', { id: 'print', category: t.category, title: '帮忙代写作业', description: '急', item: t.item, pickup: t.pickup, dropoff: t.dropoff, reward: '4', deadline: now + 3600000 }, now), /代写/);
});
