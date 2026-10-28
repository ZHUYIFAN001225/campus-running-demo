import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,evolve} from '../lib/model.js';
import {syncDecision,validSharedState} from '../lib/state-sync.js';
import {MARKET_INTERVAL} from '../lib/market-data.js';
const now=Date.now(),fresh=()=>({...createState(now),actor:'zhou'}),id='nearby-north-design-v4';

test('后台新增需求不会阻止当前接单，最新需求不会被旧标签状态覆盖',()=>{
  const before=fresh(),latest=evolve(before,'marketPulse',{},now+MARKET_INTERVAL),result=syncDecision(before,latest,'acceptBatch',{ids:[id]});
  assert.equal(result.kind,'ready');const s=evolve(result.state,'acceptBatch',{ids:[id],from:'north'},now+MARKET_INTERVAL);
  assert.ok(latest.marketFeed.last.ids.every(key=>s.tasks.some(t=>t.id===key)));assert.equal(s.tasks.find(t=>t.id===id).runner,'zhou');assert.equal(before.tasks.find(t=>t.id===id).runner,null);
});

test('另一页已接走目标单时阻止旧确认，不把它当成普通后台刷新',()=>{
  const before=fresh(),latest=evolve(before,'acceptBatch',{ids:[id],from:'north'},now),result=syncDecision(before,latest,'acceptBatch',{ids:[id]});
  assert.equal(result.kind,'conflict');assert.deepEqual(result.changedIds,[id]);assert.equal(result.state,before);
});

test('目标费用变更需要重新看约定，不能直接沿用旧确认提交',()=>{
  const before=fresh(),task=before.tasks.find(t=>t.id===id),latest=evolve({...before,actor:'lin'},'edit',{...task,id,reward:'3'},now);
  const result=syncDecision(before,latest,'acceptBatch',{ids:[id]});assert.equal(result.kind,'conflict');assert.equal(before.tasks.find(t=>t.id===id).reward,200);assert.equal(latest.tasks.find(t=>t.id===id).reward,300);
});

test('无关订单变化可以静默同步，不误挡另一笔任务的操作',()=>{
  const before=fresh(),task=before.tasks.find(t=>t.id==='market-v1-east-1'),latest=evolve(before,'edit',{...task,id:task.id,reward:'4'},now);
  const result=syncDecision(before,latest,'acceptBatch',{ids:[id]});assert.equal(result.kind,'ready');assert.equal(result.state.tasks.find(t=>t.id==='market-v1-east-1').reward,400);
});

test('手头同行任务发生变化时要求重新确认组合路线',()=>{
  const before=fresh(),latest=evolve(before,'acceptBatch',{ids:[id],from:'north'},now);
  const result=syncDecision(before,latest,'acceptBatch',{ids:['nearby-north-library-v4']});assert.equal(result.kind,'conflict');assert.ok(result.changedIds.includes(id));
});

test('两个页面各自保留演示身份，同步订单不会偷偷切换当前操作者',()=>{
  const before=fresh(),latest=evolve(before,'switch',{actor:'lin'},now),result=syncDecision(before,latest);
  assert.equal(result.kind,'ready');assert.equal(result.state.actor,'zhou');assert.equal(latest.actor,'lin');assert.equal(result.state.revision,latest.revision);
});

test('显式重置、损坏状态和过时快照不会自动覆盖当前记录',()=>{
  const before=fresh(),reset=createState(now+1);assert.equal(syncDecision(before,reset).kind,'reset');
  const broken={...before,revision:9,tasks:[{id:'broken'}]};assert.equal(validSharedState(broken),false);assert.equal(syncDecision(before,broken).kind,'invalid');
  const newer=evolve(before,'switch',{actor:'lin'},now);assert.equal(syncDecision(newer,before).kind,'invalid');assert.equal(syncDecision(before,before).kind,'same');
});
test('并行回复追加到最新对话，不因对方刚发消息阻塞或覆盖；取消后不能再发',()=>{
  const before=evolve(fresh(),'acceptBatch',{ids:[id],from:'north'},now);
  const incoming=evolve(evolve(before,'switch',{actor:'lin'},now),'message',{id,text:'快到时联系我'},now+1);
  const decision=syncDecision(before,incoming,'message',{id,text:'好的'});assert.equal(decision.kind,'ready');assert.equal(decision.state.actor,'zhou');
  const after=evolve(decision.state,'message',{id,text:'好的'},now+2),t=after.tasks.find(t=>t.id===id);assert.deepEqual(t.messages.map(m=>m.text),['快到时联系我','好的']);
  const ended=structuredClone(incoming);ended.revision++;ended.tasks.find(t=>t.id===id).status='cancelled';assert.equal(syncDecision(before,ended,'message',{id}).kind,'conflict');
});
