import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,evolve,migrateState,walletSummary,visibleTask} from '../lib/model.js';
import {discoveryRows} from '../lib/discovery.js';
import {planBatch,runPosition,activeTransport} from '../lib/planning.js';
import {trackingSnapshot} from '../lib/experience.js';
import {SPOTS} from '../lib/campus.js';
const now=Date.now(),fresh=()=>({...createState(now),actor:'zhou'}),step=(s,c,p={},at=now)=>evolve(s,c,p,at);
const id=key=>`nearby-north-${key}-v4`,ids=[id('library'),id('design'),id('walkway')];
const ui={here:'north',routeEnabled:false,marketScope:'nearby',radius:600,category:'all',detour:200};

test('无需目的地即可发现北门五单，并比较东门两单',()=>{
  const rows=discoveryRows(fresh(),ui,now);assert.equal(rows.filter(r=>r.task.pickupSpot==='north'&&r.task.demoScenario==='nearby').length,5);
  assert.equal(rows.filter(r=>r.task.pickupSpot==='east'&&r.task.demoScenario==='nearby').length,2);assert.ok(rows.some(r=>r.task.dropoffSpot==='food'));assert.ok(rows.every(r=>r.match===null));
});
test('目的地只是可选筛选：北门到南门保留设计楼，排除食堂方向额外绕行',()=>{
  const rows=discoveryRows(fresh(),{...ui,routeEnabled:true,from:'north',to:'south',via:null,detour:100},now);
  assert.ok(rows.some(r=>r.task.id===id('design')));assert.ok(!rows.some(r=>r.task.id===id('food')));assert.ok(!rows.some(r=>r.task.id===id('dorm')));
});
test('三单同行按先取后送规划，全部期限满足；一次命令原子绑定，不改原对象',()=>{
  const original=fresh(),s=step(original,'acceptBatch',{ids,from:'north',to:'south'}),run=s.runs.at(-1);
  assert.equal(activeTransport(s).length,3);assert.ok(ids.every(key=>s.tasks.find(t=>t.id===key).deliveryRunId===run.id));
  for(const key of ids){const p=run.stops.findIndex(x=>x.task===key&&x.kind==='pickup'),d=run.stops.findIndex(x=>x.task===key&&x.kind==='dropoff');assert.ok(p>=0&&d>p);assert.ok(run.stops[d].at<=s.tasks.find(t=>t.id===key).deadline);}
  assert.equal(activeTransport(original).length,0);
});
test('四单容量、重复单、自接及已被接走都在模型拦截',()=>{
  const s=step(fresh(),'acceptBatch',{ids:[...ids,id('dorm')],from:'north'});assert.equal(activeTransport(s).length,4);
  assert.throws(()=>step(s,'acceptBatch',{ids:[id('food')],from:'north'}),/4单/);
  assert.throws(()=>step(fresh(),'acceptBatch',{ids:[ids[0],ids[0]],from:'north'}),/不同/);
  assert.throws(()=>step({...fresh(),actor:'lin'},'acceptBatch',{ids,from:'north'}),/自己/);
  assert.throws(()=>step(s,'acceptBatch',{ids:[ids[0]],from:'north'}),/变化/);
});
test('一个急单不可按时送达时整批拒绝，不出现部分接单或先扣款',()=>{
  const original=fresh();original.tasks.find(t=>t.id===ids[1]).deadline=now+1000;
  assert.throws(()=>step(original,'acceptBatch',{ids:[ids[0],ids[1]],from:'north'}),/无法按时/);
  assert.equal(activeTransport(original).length,0);assert.ok(ids.every(key=>original.tasks.find(t=>t.id===key).runner===null));
});
test('同一配送者多单共用位置；只靠时间不会自动取件，不能跳站',()=>{
  let s=step(fresh(),'acceptBatch',{ids,from:'east'}),run=s.runs.at(-1),a=s.tasks.find(t=>t.id===ids[0]),b=s.tasks.find(t=>t.id===ids[1]);
  const context={state:s,run};assert.deepEqual(trackingSnapshot(a,now+10000,'lin',context).point,trackingSnapshot(b,now+10000,'lin',context).point);
  assert.ok(s.tasks.filter(t=>ids.includes(t.id)).every(t=>!t.pickedUpAt));const next=run.stops[0],other=ids.find(key=>key!==next.task);
  assert.throws(()=>step(s,'pickup',{id:other}),/下一站|当前站点/);
  s=step(s,'pickup',{id:next.task});assert.equal(s.runs.at(-1).index,1);assert.equal(s.tasks.find(t=>t.id===next.task).pickedUpAt,now);
  assert.equal(visibleTask({...s,actor:'visitor'},s.tasks.find(t=>t.id===ids[0])).runnerApproach,undefined);
});
test('同行途中再选一单会从当前位置重排，共用轨迹不回起点',()=>{
  let s=step(fresh(),'acceptBatch',{ids:[ids[0]],from:'east'});const before=runPosition(s,s.runs.at(-1),now+20000).point;
  s=step(s,'acceptBatch',{ids:[ids[1]],from:'north'},now+20000);const after=runPosition(s,s.runs.at(-1),now+20000).point;
  assert.ok(Math.abs(before.x-after.x)<.01&&Math.abs(before.y-after.y)<.01);assert.equal(activeTransport(s).length,2);
});
test('多单送达逐笔结算：交接释放运输名额，发布者确认后才记入钱包',()=>{
  let s=step(fresh(),'acceptBatch',{ids:[ids[0],ids[1]],from:'north'}),completed=[];
  while(activeTransport(s).length){const stop=s.runs.at(-1).stops[s.runs.at(-1).index];s=step(s,stop.kind==='pickup'?'pickup':'deliver',{id:stop.task,note:'虚构当面交接'});if(stop.kind==='dropoff')completed.push(stop.task);}
  const baseline=walletSummary(fresh(),'zhou').total;assert.equal(walletSummary(s,'zhou').total,baseline);assert.equal(completed.length,2);
  s=step(s,'switch',{actor:'lin'});s=step(s,'complete',{id:completed[0]});assert.equal(walletSummary(s,'zhou').total,baseline+s.tasks.find(t=>t.id===completed[0]).reward);assert.equal(s.tasks.find(t=>t.id===completed[1]).settlement,null);
});
test('一单取消待确认暂停共享轨迹；同意取消后物品尚未取的站点被移除',()=>{
  let s=step(fresh(),'acceptBatch',{ids:[ids[0],ids[1]],from:'east'});s=step(s,'requestCancel',{id:ids[0],reason:'虚构原因'},now+5000);let run=s.runs.at(-1);
  assert.deepEqual(runPosition(s,run,now+10000).point,runPosition(s,run,now+20000).point);
  const frozen=runPosition(s,run,now+20000).point;s=step(s,'switch',{actor:'lin'},now+20000);s=step(s,'respondCancel',{id:ids[0],approve:true},now+20000);run=s.runs.at(-1);
  assert.ok(!run.stops.some(x=>x.task===ids[0]));assert.deepEqual(runPosition(s,run,now+20000).point,frozen);
});
test('预约任务等待可取时间；急单加价包含在总额里，不作为额外暗扣',()=>{
  const p={title:'测试急单',description:'公共位置交接',category:'parcel',item:'虚构包裹',pickup:SPOTS.north.name,dropoff:SPOTS.design.name,reward:'3',urgentBonus:'2',deadline:now+15*60000};
  let s=step({...fresh(),actor:'lin'},'create',p),t=s.tasks[0];assert.equal(t.reward,300);assert.equal(t.prepaid,300);assert.equal(t.baseReward,100);assert.equal(t.urgentBonus,200);
  assert.throws(()=>step(s,'create',{...p,urgentBonus:'3'}),/基础跑腿费/);
  t={...t,readyAt:now+30*60000,deadline:now+60*60000};const plan=planBatch([t],'north',{now});assert.ok(plan.feasible);assert.ok(plan.stops[0].at>=t.readyAt);
});
test('版本4保留旧订单金额/时限，仅一次补充附近需求，不清掉旧数据',()=>{
  const old=fresh();old.schemaVersion=3;old.tasks=old.tasks.filter(t=>t.demoScenario!=='nearby');const deadline=old.tasks[0].deadline,price=old.tasks[0].prepaid;
  const s=migrateState(old,now);assert.equal(s.schemaVersion,4);assert.equal(s.tasks[0].deadline,deadline);assert.equal(s.tasks[0].prepaid,price);assert.equal(s.tasks.filter(t=>t.demoScenario==='nearby').length,9);assert.equal(migrateState(s,now),s);
});

test('预约可取时间未到，即使已接单到达也不能提前确认取件',()=>{
  let s=fresh();s.tasks.find(t=>t.id===ids[0]).readyAt=now+30*60000;
  s.tasks.find(t=>t.id===ids[0]).deadline=now+60*60000;
  s=step(s,'acceptBatch',{ids:[ids[0]],from:'north'});
  assert.throws(()=>step(s,'pickup',{id:ids[0]},now+60000),/预约可取时间/);
  s=step(s,'pickup',{id:ids[0]},now+30*60000);assert.equal(s.tasks.find(t=>t.id===ids[0]).pickedUpAt,now+30*60000);
});

test('已交接一单的售后争议暂缓该单结算，不冻结尚在运送的其他订单',()=>{
  let s=step(fresh(),'acceptBatch',{ids:[ids[0],ids[1]],from:'north'}),delivered;
  while(!delivered){const stop=s.runs.at(-1).stops[s.runs.at(-1).index];s=step(s,stop.kind==='pickup'?'pickup':'deliver',{id:stop.task,note:'虚构当面交接'});if(stop.kind==='dropoff')delivered=stop.task;}
  s=step(s,'switch',{actor:'lin'});s=step(s,'dispute',{id:delivered,reason:'需要核对交接',goods:'已交接的虚构包裹，无垫付'},now+1000);
  const a=runPosition(s,s.runs.at(-1),now+1000),b=runPosition(s,s.runs.at(-1),now+20000);
  assert.equal(a.paused,false);assert.notDeepEqual(a.point,b.point);assert.equal(s.tasks.find(t=>t.id===delivered).settlement,null);
});
