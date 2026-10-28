import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,evolve,visibleTask} from '../lib/model.js';
import {deliveryEstimate} from '../lib/delivery-estimate.js';
import {runPosition,WALK_SPEED} from '../lib/planning.js';
import {mapMarkup,SPOTS} from '../lib/campus.js';
const now=Date.now();
const as=(s,actor)=>evolve(s,'switch',{actor},now);
const sample=()=>evolve(as(createState(now),'lin'),'conversationExamples',{},now);

test('私聊配送示例按需添加、对话绑定双方，重复加载保留履约及旧记录',()=>{
  const old=as(createState(now),'lin'),s=evolve(old,'conversationExamples',{},now),t=s.tasks.find(t=>t.id.startsWith('conversation-'));
  assert.equal(s.tasks.length,old.tasks.length+1);assert.equal(t.owner,'lin');assert.equal(t.runner,'zhou');assert.equal(t.messages.length,3);assert.equal(t.status,'progress');
  const twice=evolve(s,'conversationExamples',{},now+1000);assert.equal(twice.tasks.length,s.tasks.length);assert.deepEqual(twice.tasks.find(x=>x.id===t.id),t);
  assert.deepEqual(s.tasks.find(t=>t.id==='north-parcel'),old.tasks.find(t=>t.id==='north-parcel'));
  assert.equal(visibleTask(as(s,'visitor'),t).messages,undefined);
  assert.throws(()=>evolve(as(s,'visitor'),'message',{id:t.id,text:'旁观者'},now),/只有任务双方/);
});
test('发送临时要求只追加对话，不直接修改地点、报酬或授权',()=>{
  const s=sample(),t=s.tasks.find(t=>t.id.startsWith('conversation-'));
  const next=evolve(s,'message',{id:t.id,text:'能改到图书馆吗？'},now+1000).tasks.find(x=>x.id===t.id);
  assert.equal(next.messages.length,4);assert.equal(next.dropoff,t.dropoff);assert.equal(next.reward,t.reward);assert.equal(next.change,null);
});
test('预计时间随步行减少，预计到达时刻稳定；只经过时间不会自动送达',()=>{
  const s=sample(),t=s.tasks[0],run=s.runs.find(r=>r.id===t.deliveryRunId),before=JSON.stringify(s);
  const a=deliveryEstimate(t,now,s,run),b=deliveryEstimate(t,now+10000,s,run);
  assert.ok(a.seconds>b.seconds);assert.ok(Math.abs(a.metres-b.metres-WALK_SPEED*10)<.001);assert.ok(Math.abs(a.arrivalAt-b.arrivalAt)<1);
  const arrived=deliveryEstimate(t,now+3600000,s,run);assert.equal(arrived.headline,'已到交接点');assert.equal(arrived.arrivalAt,null);assert.equal(t.status,'progress');assert.equal(JSON.stringify(s),before);
});
test('同行到本单的送达估算包含前面各站，不拿下一站时间充当送达',()=>{
  let s=as(createState(now),'zhou');s=evolve(s,'acceptBatch',{ids:['north-parcel','parcel'],from:'north'},now);
  const run=s.runs[0],lastDrop=run.stops.filter(x=>x.kind==='dropoff').at(-1),t=s.tasks.find(t=>t.id===lastDrop.task),live=runPosition(s,run,now),e=deliveryEstimate(t,now,s,run);
  assert.ok(e.seconds>live.remainingMetres/WALK_SPEED);assert.ok(e.metres>live.remainingMetres);assert.notEqual(e.headline,'已到交接点');
});
test('待采购、预约和争议不展示承诺式到达时刻',()=>{
  let s=as(createState(now),'zhou');s=evolve(s,'accept',{id:'lunch',from:'north',depart:true},now);
  let t=s.tasks.find(t=>t.id==='lunch'),e=deliveryEstimate(t,now);assert.equal(e.arrivalAt,null);assert.match(e.note,/采购确认/);
  s=evolve(s,'requestCancel',{id:'lunch',reason:'临时有事'},now);t=s.tasks.find(t=>t.id==='lunch');e=deliveryEstimate(t,now+10000);assert.equal(e.seconds,null);assert.equal(e.headline,'预计时间待更新');
});
test('定位扫描圈和点共用原点与变换，发布地图不显示默认人物点',()=>{
  const html=mapMarkup({marker:SPOTS.north,markerNote:true,scan:true,clustered:true});
  assert.match(html,/class="m-pin"[^>]* transform="translate\(300 40\)"><g class="m-demand-scan"/);assert.match(html,/我的位置/);assert.match(html,/模拟定位/);assert.ok(!html.includes('translate(-28 25)'));assert.ok(!mapMarkup({pickup:'north',dropoff:'design'}).includes('class="m-pin"'));
});
test('同行多单：本单送达卡写明下一站属于哪一单，不把别人的交接点当成本单',()=>{
  let s=as(createState(now),'zhou');
  s=evolve(s,'acceptBatch',{ids:['north-parcel','north-coffee'].filter(id=>s.tasks.find(t=>t.id===id)),from:'north'},now);
  const run=s.runs.find(r=>r.runner==='zhou');assert.ok(run);
  for(const t of s.tasks.filter(t=>run.taskIds.includes(t.id))){
    const e=deliveryEstimate(t,now+1000,s,run),first=run.stops[run.index];
    assert.match(e.next,/^下一站/);
    if(first.task!==t.id)assert.match(e.next,/同行其他单/);else assert.match(e.next,/本单/);
  }
});
