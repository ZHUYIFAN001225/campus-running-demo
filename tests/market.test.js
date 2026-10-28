import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,evolve,migrateState,walletSummary} from '../lib/model.js';
import {marketSummary,MARKET_INTERVAL,MARKET_OPEN_LIMIT} from '../lib/market-data.js';
const now=Date.now(),fresh=()=>({...createState(now),actor:'zhou'});

test('密集示例覆盖9个取件点和两种身份，单量由实际可接订单计算',()=>{
  const s=fresh(),stock=s.tasks.filter(t=>t.demoScenario==='market-density');
  assert.equal(stock.length,62);assert.equal(new Set(stock.map(t=>t.id)).size,62);assert.equal(new Set(stock.map(t=>t.pickupSpot)).size,9);
  for(const actor of ['lin','zhou']){const summary=marketSummary(s,actor,now);assert.ok(summary.total>=30);assert.ok(summary.hubs.find(h=>h.id==='north').count>=8);assert.equal(summary.hubs.reduce((n,h)=>n+h.count,0),summary.tasks.filter(t=>t.pickupSpot).length);assert.ok(summary.tasks.every(t=>t.owner!==actor));}
});

test('动态扫描按12秒限频，新增需求进入订单列表与对应地点单量',()=>{
  const original=fresh(),early=evolve(original,'marketPulse',{},now+1000);assert.equal(early.tasks.length,original.tasks.length);assert.equal(early.revision,original.revision);
  const s=evolve(original,'marketPulse',{},now+MARKET_INTERVAL),added=s.marketFeed.last.ids,summary=marketSummary(s,'zhou',now+MARKET_INTERVAL),before=marketSummary(original,'zhou',now);
  assert.equal(added.length,1);assert.equal(summary.total,before.total+1);assert.equal(summary.hubs.find(h=>h.id==='north').count,before.hubs.find(h=>h.id==='north').count+1);
  assert.ok(added.every(id=>summary.tasks.some(t=>t.id===id)));assert.equal(original.marketFeed.sequence,0);
});

test('旧schema4只一次补充62项，不续期旧订单、不改变已接任务或结算',()=>{
  let old=fresh();delete old.marketFeed;old.tasks=old.tasks.filter(t=>t.demoScenario!=='market-density');
  old=evolve(old,'acceptBatch',{ids:['nearby-north-design-v4'],from:'north'},now);
  const oldTasks=structuredClone(old.tasks),oldRuns=structuredClone(old.runs),upgraded=migrateState(old,now+60000);
  assert.deepEqual(upgraded.tasks.slice(0,oldTasks.length),oldTasks);assert.deepEqual(upgraded.runs,oldRuns);
  assert.equal(upgraded.tasks.filter(t=>t.demoScenario==='market-density').length,62);assert.equal(migrateState(upgraded,now+120000),upgraded);
});

test('达到动态示例上限后不无限增加，更不自动接单或完成已有任务',()=>{
  let s=evolve(fresh(),'acceptBatch',{ids:['market-v1-north-0'],from:'north'},now);
  const inHand=structuredClone(s.tasks.find(t=>t.id==='market-v1-north-0'));
  for(let i=1;i<=35;i++)s=evolve(s,'marketPulse',{},now+i*MARKET_INTERVAL);
  assert.equal(s.tasks.filter(t=>t.demoScenario==='market-density'&&t.status==='open').length,MARKET_OPEN_LIMIT);
  assert.deepEqual(s.tasks.find(t=>t.id===inHand.id),inHand);assert.equal(s.marketFeed.last.count,0);
});

test('动态新增单可以真实走完演示取送，并由对应发布者确认后结算一次',()=>{
  let s=evolve(fresh(),'marketPulse',{},now+MARKET_INTERVAL),id=s.marketFeed.last.ids[0],task=s.tasks.find(t=>t.id===id),at=now+MARKET_INTERVAL;
  const baseline=walletSummary(s,'zhou').total;
  s=evolve(s,'acceptBatch',{ids:[id],from:task.pickupSpot},at);s=evolve(s,'pickup',{id},at);s=evolve(s,'deliver',{id,note:'虚构公共点当面交接'},at);
  assert.equal(walletSummary(s,'zhou').total,baseline);
  s=evolve(s,'switch',{actor:task.owner},at);s=evolve(s,'complete',{id},at);
  assert.equal(walletSummary(s,'zhou').total,baseline+task.reward);assert.throws(()=>evolve(s,'complete',{id},at),/状态/);
});

test('过期后可显式补齐下一轮示例，旧时限保留且重复补充不重复造单',()=>{
  const original=fresh(),deadline=original.tasks.find(t=>t.id==='market-v1-north-0').deadline,at=now+3*3600000;
  const s=evolve(original,'nearbyExamples',{},at);
  assert.equal(s.tasks.find(t=>t.id==='market-v1-north-0').deadline,deadline);
  assert.equal(s.tasks.find(t=>t.id==='market-v1-north-0').status,'expired');
  assert.equal(s.tasks.filter(t=>t.demoScenario==='market-density'&&t.status==='open').length,62);
  assert.equal(evolve(s,'nearbyExamples',{},at).tasks.length,s.tasks.length);
});
