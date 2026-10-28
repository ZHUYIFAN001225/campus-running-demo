import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, migrateState, evolve, visibleTask, money, walletSummary } from '../lib/model.js';
import { SPOTS, shortestPath, matchRoute, pointAlong, customPoint, pathThrough, mapMarkup, spotKey } from '../lib/campus.js';
import { alongTasks, trackingSnapshot, stepLabel } from '../lib/experience.js';
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
  const snap=trackingSnapshot(t,now+30*60000);assert.equal(snap.fraction,1);assert.equal(t.status,'progress');assert.equal(t.settlement,null);assert.equal(JSON.stringify(t),before);
  assert.ok(trackingSnapshot(t,now+25000).fraction<.2);assert.deepEqual(pointAlong(['north','center'],0),{x:SPOTS.north.x,y:SPOTS.north.y});
});
test('升级保留已有用户、任务金额及取件状态，不把当面交接静默改为放置',()=>{
  let old=createState(now);delete old.schemaVersion;old.tasks=old.tasks.filter(t=>!t.id.startsWith('north-'));old.tasks[0].reward=123;
  Object.values(old.users).forEach(u=>delete u.runnerEnabled);old.tasks.forEach(t=>{delete t.handoff;delete t.dropConsent;delete t.pickupSpot;delete t.dropoffSpot;});
  const next=migrateState(old,now);assert.equal(next.tasks[0].reward,123);assert.equal(next.tasks[0].handoff,'meet');assert.equal(next.tasks[0].dropConsent,false);assert.equal(next.users.visitor.runnerEnabled,false);assert.equal(next.schemaVersion,4);assert.equal(migrateState(next,now),next);
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

test('自定义公共点可以发布并保存；超出示意范围或伪装无人交接架被拒绝',()=>{
  const pin=customPoint({x:45,y:340,name:'林间教学楼 · 公共门厅'}),base={category:'parcel',title:'送到林间教学楼',description:'公共区域交接',pickup:SPOTS.north.name,dropoff:pin.name,dropoffPoint:pin,item:'小包裹',reward:'3',deadline:now+3600000};
  let s=as(createState(now),'lin');s=step(s,'create',base);const t=s.tasks[0];assert.deepEqual(t.dropoffPoint,pin);assert.equal(t.dropoffSpot,null);assert.equal(JSON.parse(JSON.stringify(s)).tasks[0].dropoffPoint.x,45);
  assert.throws(()=>step(s,'create',{...base,dropoffPoint:{...pin,x:999}}),/自定义落点/);
  assert.throws(()=>step(s,'create',{...base,handoff:'safe_drop',dropConsent:true}),/指定交接架/);
  assert.equal(customPoint({...pin,x:NaN}),null);assert.equal(customPoint({...pin,name:'x'.repeat(41)}),null);
});
test('途经C保留在匹配路线中；自定义任务地图安全显示，反方向绕行真实',()=>{
  const pin=customPoint({x:45,y:340,name:'林间教学楼 <测试>'}),t={pickupPoint:pin,dropoffSpot:'dorm3'};
  const direct=pathThrough('north','dorm3'),via=pathThrough('north',pin,'dorm3'),m=matchRoute(t,'north','dorm3',pin);
  assert.ok(via.metres>direct.metres);assert.ok(Math.abs(m.extra)<1e-8);assert.ok(m.nodes.some(p=>spotKey(p)===spotKey(pin)));
  assert.ok(matchRoute({pickupSpot:'north',dropoffSpot:'dorm3'},'dorm3','north').extra>0);
  const markup=mapMarkup({tasks:[t],route:m.nodes,pickup:pin});assert.ok(markup.includes('林间教学楼 &lt;测试&gt;'));assert.ok(!markup.includes('[object Object]'));
});
test('自定义起点接单即出发，慢速位置延续；取件和送达不由时间替代',()=>{
  const pin=customPoint({x:45,y:340,name:'林间教学楼'});let s=as(createState(now),'zhou');s=step(s,'accept',{id:'north-parcel',from:pin,to:'dorm3',depart:true});
  const t=s.tasks.find(t=>t.id==='north-parcel');assert.equal(t.status,'progress');assert.equal(t.startedAt,now);assert.deepEqual(t.runnerStartSpot,pin);
  const a=trackingSnapshot(t,now),b=trackingSnapshot(t,now+10000),c=trackingSnapshot(JSON.parse(JSON.stringify(t)),now+20000);
  assert.ok(b.fraction>0&&b.fraction<.1);assert.ok(c.fraction>b.fraction);assert.notDeepEqual(a.point,b.point);assert.equal(t.pickedUpAt,null);assert.equal(t.settlement,null);
  assert.equal(visibleTask(as(s,'visitor'),t).runnerApproach,undefined);
});
test('全校需求能发现超出绕行偏好的冷门位置，仍显示真实绕行',()=>{
  let s=as(createState(now),'zhou');const pin=customPoint({x:30,y:385,name:'林间教学楼'});s.tasks.push({...s.tasks.find(t=>t.id==='north-parcel'),id:'cold',pickupPoint:pin});
  const ui={from:'north',to:'dorm3',detour:200,category:'all',query:''};
  assert.ok(!alongTasks(s,ui).some(r=>r.task.id==='cold'));assert.ok(alongTasks(s,{...ui,scope:'all'}).some(r=>r.task.id==='cold'&&r.match.extra>200));
});
test('钱包：提交送达仍待结算，确认后收款仅记一次，代买返还与收入分开',()=>{
  let s=step(picked(),'deliver',{id:'north-parcel',proof:'sample',spot:'dorm3',note:'已通知'});
  s.tasks=s.tasks.filter(t=>t.status!=='completed');
  let w=walletSummary(s,'zhou');assert.equal(w.total,0);assert.equal(w.pendingReward,200);
  s=step(as(s,'lin'),'complete',{id:'north-parcel'});w=walletSummary(s,'zhou');assert.equal(w.total,200);assert.equal(w.income,200);assert.equal(w.reimbursement,0);assert.equal(w.pendingReward,0);
  const t=s.tasks.find(t=>t.id==='north-parcel');s.tasks.push({...t,id:'bought',buy:true,reward:500,settlement:{expense:2600,runnerPayout:3100,refund:400,at:now}});
  w=walletSummary(s,'zhou');assert.equal(w.total,3300);assert.equal(w.income,700);assert.equal(w.reimbursement,2600);assert.equal(w.total,w.income+w.reimbursement);assert.equal(walletSummary(s,'visitor').total,0);
});

test('显式载入南门经设计楼到图书馆示例：有可选任务、不重复、不重置旧记录',()=>{
  const original=as(createState(now),'zhou'),deadline=original.tasks[0].deadline,s=step(original,'routeExamples'),rows=alongTasks(s,{from:'south',via:'design',to:'library',detour:200,category:'all',query:''});
  const samples=rows.filter(r=>r.task.demoScenario==='south-library');assert.equal(samples.length,3);assert.ok(samples.every(r=>r.task.owner!==s.actor));assert.equal(samples.find(r=>r.task.demoExample==='design').match.extra,0);assert.ok(samples.some(r=>r.task.pickupPoint));
  assert.equal(s.tasks.find(t=>t.id===original.tasks[0].id).deadline,deadline);assert.equal(step(s,'routeExamples').tasks.length,s.tasks.length);assert.equal(original.tasks.filter(t=>t.demoScenario==='south-library').length,0);
});
test('钱包：代买已垫付未结算时，垫付待返还单列；接单者看到的是等待对方确认',()=>{
  let s=as(createState(now),'zhou');
  s=step(s,'accept',{id:'north-coffee',from:'north',depart:true});
  s=step(s,'quote',{id:'north-coffee',amount:'22',item:'热拿铁 × 1'});
  s=step(as(s,'lin'),'approveQuote',{id:'north-coffee'});
  s=step(as(s,'zhou'),'buy',{id:'north-coffee',amount:'20',receipt:'虚构小票'});
  s=step(s,'deliver',{id:'north-coffee',note:'二号楼下当面交接'});
  let w=walletSummary(s,'zhou');assert.equal(w.pendingReward,200);assert.equal(w.pendingExpense,2000);assert.equal(w.total,400);
  const t=s.tasks.find(t=>t.id==='north-coffee');
  assert.match(stepLabel(t,'zhou'),/等待发布者确认/);assert.match(stepLabel(t,'lin'),/待你确认/);
  s=step(as(s,'lin'),'complete',{id:'north-coffee'});w=walletSummary(s,'zhou');
  assert.equal(w.pendingExpense,0);assert.equal(w.total,400+2200);assert.equal(w.reimbursement,2000);
  assert.equal(s.tasks.find(t=>t.id==='north-coffee').settlement.refund,2700-2200);
});
