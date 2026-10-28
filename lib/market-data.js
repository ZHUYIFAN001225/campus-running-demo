import { SPOTS } from './campus.js';
import { discoveryFixtures } from './discovery-data.js';

export const MARKET_VERSION=1;
export const MARKET_INTERVAL=12000;
export const MARKET_OPEN_LIMIT=84;
export const MARKET_HUBS=[['north',16],['west',14],['east',10],['south',6],['cafe',4],['design',4],['food',4],['store',2],['activity',2]];
const destinations=['library','design','dorm3','dorm2','teaching','food','south'];
const items=[['parcel','已付款文具小包裹 × 1'],['help','已装袋公开资料 × 1'],['parcel','轻小日用品包裹 × 1'],['food','已付款密封餐袋 × 1']];

function example(now,owner,hub,index,id){
  const template=discoveryFixtures(now,owner,'market-template')[1];
  const choices=destinations.filter(x=>x!==hub),to=choices[index%choices.length],kind=items[index%items.length];
  const bonus=index%9===0?200:0,base=[100,200,200,300][index%4],minutes=bonus?20:40+(index%5)*10;
  return {...template,id,demoScenario:'market-density',demoExample:`${hub}-${index}`,
    category:kind[0],title:`${SPOTS[hub].short}取${kind[0]==='help'?'资料':kind[0]==='food'?'餐袋':'小件'}，带到${SPOTS[to].short}`,
    pickup:SPOTS[hub].name,pickupSpot:hub,dropoff:SPOTS[to].name,dropoffSpot:to,dropoffPoint:null,
    item:kind[1],description:'动态需求演示：已付款轻小物品，在校内公共位置当面交接；不发生真实交易。',
    reward:base+bonus,baseReward:base,urgentBonus:bonus,urgent:bonus>0,prepaid:base+bonus,
    sensitive:`虚构取件码 DEMO-${String(index+1000).padStart(4,'0')}`,deadline:now+minutes*60000,
    events:[{text:'模拟需求发布，演示预付已记录',at:now}]};
}

export function marketFixtures(now=Date.now()){
  return MARKET_HUBS.flatMap(([hub,count])=>Array.from({length:count},(_,i)=>example(now,i%2?'zhou':'lin',hub,i,`market-v1-${hub}-${i}`)));
}

export function marketArrivals(state,now=Date.now()){
  const open=state.tasks.filter(t=>t.demoScenario==='market-density'&&t.status==='open'&&t.deadline>now).length;
  const sequence=(state.marketFeed?.sequence||0)+1,hub=MARKET_HUBS[(sequence-1)%MARKET_HUBS.length][0];
  const count=Math.max(0,Math.min(sequence%3===0?2:1,MARKET_OPEN_LIMIT-open)),owner=state.actor==='lin'?'zhou':'lin';
  return {hub,sequence,tasks:Array.from({length:count},(_,i)=>example(now,owner,hub,sequence*7+i,`market-live-${now}-${state.revision}-${sequence}-${i}`))};
}

// Counts always come from actual open, public demo tasks, never decorative numbers.
export function marketSummary(state,actor=state.actor,now=Date.now()){
  const tasks=state.tasks.filter(t=>t.status==='open'&&t.deadline>now&&t.owner!==actor&&t.school==='nancheng');
  const hubs=MARKET_HUBS.map(([id])=>({id,count:tasks.filter(t=>t.pickupSpot===id).length}));
  return {tasks,hubs,total:tasks.length};
}
