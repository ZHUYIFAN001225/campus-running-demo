import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, migrateState, evolve, visibleTask, money } from '../lib/model.js';
import { SPOTS, shortestPath, matchRoute, pointAlong } from '../lib/campus.js';
import { alongTasks, trackingSnapshot, tourSnapshot } from '../lib/experience.js';
const now=Date.now(),step=(s,c,p={})=>evolve(s,c,p,now),as=(s,actor)=>step(s,'switch',{actor});
function picked(){let s=as(createState(now),'zhou');s=step(s,'accept',{id:'north-parcel',from:'north'});s=step(s,'start',{id:'north-parcel'});return step(s,'pickup',{id:'north-parcel'});}
test('顺路计算：沿原路0绕行；反向不伪装完全顺路；距离守恒',()=>{
  const t=createState(now).tasks.find(t=>t.id==='north-parcel'),m=matchRoute(t,'north','dorm3');
  assert.equal(m.extra,0);assert.equal(m.toPickup,0);assert.equal(m.total,m.direct);
  const reverse=matchRoute(t,'dorm3','north');assert.ok(reverse.extra>0);assert.equal(reverse.extra,reverse.total-reverse.direct);
  assert.equal(shortestPath('missing','north').metres,Infinity);
});
test('沿途筛选：排除自己的任务，限制绕行；换方向改变结果',()=>{
  const state=as(createState(now),'zhou'),ui={from:'north',to:'dorm3',detour:200,category:'all',query:''};
  const a=alongTasks(state,ui);assert.ok(a.some(r=>r.task.id==='north-parcel'));assert.ok(a.every(r=>r.task.owner!=='zhou'&&r.match.extra<=200));
  const b=alongTasks(state,{...ui,from:'dorm3',to:'north'});assert.ok(!b.some(r=>r.task.id==='north-parcel'));
});
test('认证与接单资格分开：未开通不能接单，开通仍不能自接',()=>{
  let s=as(createState(now),'visitor');s=step(s,'auth',{status:'verified'});
  assert.throws(()=>step(s,'accept',{id:'north-parcel'}),/开通接单身份/);
  assert.throws(()=>step(s,'enableRunner',{agree:false}),/确认接单/);
  s=step(s,'enableRunner',{agree:true});s=step(s,'accept',{id:'north-parcel'});assert.equal(s.tasks.find(t=>t.id==='north-parcel').runner,'visitor');
});
test('公共点自取：事先授权、合法交接点与凭证全部必需',()=>{
  let s=picked();
  assert.throws(()=>step(s,'deliver',{id:'north-parcel',note:'直接放下'}),/凭证/);
  assert.throws(()=>step(s,'deliver',{id:'north-parcel',proof:'sample',spot:'library',note:'放错点'}),/凭证/);
  s=step(s,'deliver',{id:'north-parcel',proof:'sample',spot:'dorm3',note:'按授权放至交接架并通知'});
  const t=s.tasks.find(t=>t.id==='north-parcel');assert.equal(t.status,'delivered');assert.equal(t.settlement,null);assert.equal(t.deliveryProof.spot,'dorm3');
  // Courier need not wait for the requester to operate the app before accepting a new transport task.
  s=step(s,'accept',{id:'parcel'});assert.equal(s.tasks.find(t=>t.id==='parcel').runner,'zhou');
});
test('自取倒计时不自动判责或结算，发布者确认后才结算一次',()=>{
  let s=step(picked(),'deliver',{id:'north-parcel',proof:'sample',spot:'dorm3',note:'已通知'});
  const later=evolve(s,'read',{},now+31*60000),t=later.tasks.find(t=>t.id==='north-parcel');
  assert.equal(t.status,'delivered');assert.equal(t.settlement,null);
  s=step(as(later,'lin'),'complete',{id:'north-parcel'});assert.equal(s.tasks.find(t=>t.id==='north-parcel').settlement.runnerPayout,200);
});
test('放置授权不能在发布时绕过，不支持的点不能充当交接架',()=>{
  const p={category:'parcel',title:'代取',description:'小件',pickup:SPOTS.north.name,dropoff:SPOTS.dorm3.name,item:'小包裹',reward:'2',deadline:now+3600000,handoff:'safe_drop'};
  let s=as(createState(now),'lin');assert.throws(()=>step(s,'create',p),/事先授权/);
  assert.throws(()=>step(s,'create',{...p,dropConsent:true,dropoff:SPOTS.north.name}),/指定交接架/);
  s=step(s,'create',{...p,dropConsent:true});assert.equal(s.tasks[0].dropConsent,true);
});
test('位置与放置凭证仅双方可见；前端演示不替代后端授权',()=>{
  const s=step(picked(),'deliver',{id:'north-parcel',proof:'sample',spot:'dorm3',note:'已通知'}),t=s.tasks.find(t=>t.id==='north-parcel');
  assert.equal(visibleTask(as(s,'visitor'),t).deliveryProof,undefined);assert.equal(visibleTask(as(s,'visitor'),t).runnerStartSpot,undefined);
  assert.equal(visibleTask(as(s,'lin'),t).deliveryProof.sample,true);
});
test('配送位置演示不替用户改变任务或采购/结算状态',()=>{
  const s=picked(),t=s.tasks.find(t=>t.id==='north-parcel'),before=JSON.stringify(t);
  const snap=trackingSnapshot(t,now+25000);assert.equal(snap.fraction,1);assert.equal(t.status,'progress');assert.equal(t.settlement,null);assert.equal(JSON.stringify(t),before);
  assert.equal(tourSnapshot(24000).step,3);assert.deepEqual(pointAlong(['north','center'],0),{x:SPOTS.north.x,y:SPOTS.north.y});
});
test('升级保留已有用户、任务金额及取件状态，不把当面交接静默改为放置',()=>{
  let old=createState(now);delete old.schemaVersion;old.tasks=old.tasks.filter(t=>!t.id.startsWith('north-'));old.tasks[0].reward=123;
  Object.values(old.users).forEach(u=>delete u.runnerEnabled);old.tasks.forEach(t=>{delete t.handoff;delete t.dropConsent;delete t.pickupSpot;delete t.dropoffSpot;});
  const next=migrateState(old,now);assert.equal(next.tasks[0].reward,123);assert.equal(next.tasks[0].handoff,'meet');assert.equal(next.tasks[0].dropConsent,false);assert.equal(next.users.visitor.runnerEnabled,false);assert.equal(next.schemaVersion,2);assert.equal(migrateState(next,now),next);
});
test('采购待确认时状态说明真实，取消待处理时位置演示暂停',()=>{
  let s=as(createState(now),'zhou');s=step(s,'accept',{id:'lunch'});s=step(s,'start',{id:'lunch'});s=step(s,'quote',{id:'lunch',item:'鸡腿饭',amount:'26'});
  const t=s.tasks.find(t=>t.id==='lunch');assert.match(trackingSnapshot(t,now,'lin').title,/报价待你确认/);assert.match(trackingSnapshot(t,now,'zhou').title,/等待发布者/);
  s=step(s,'requestCancel',{id:'lunch',reason:'临时有事'});const c=s.tasks.find(t=>t.id==='lunch');
  assert.deepEqual(trackingSnapshot(c,now+1000).point,trackingSnapshot(c,now+10000).point);assert.equal(trackingSnapshot(c,now+10000).eta,'待处理');
});
test('普通取件已在手时也不能直接取消退款，必须交代物品去向',()=>{
  const s=picked();assert.throws(()=>step(s,'requestCancel',{id:'north-parcel',reason:'临时取消'}),/已取件/);
  const next=step(s,'dispute',{id:'north-parcel',reason:'无法继续配送',goods:'物品在接单者手中，尚未交接，报酬仅模拟预付'});
  assert.equal(next.tasks.find(t=>t.id==='north-parcel').settlement,null);
});
