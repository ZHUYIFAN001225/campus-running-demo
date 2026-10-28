import { SPOTS, spotOf, spotKey, shortestPath, pathThrough, pointAlong, taskSpots } from './campus.js';

export const MAX_CARRY = 4;
export const WALK_SPEED = 1.2;
export const activeTransport = (state, actor=state.actor) => state.tasks.filter(t=>t.runner===actor&&['accepted','progress'].includes(t.status));
export const pendingIssue = t => [t.dispute,t.cancelRequest,t.change].find(x=>x?.status==='pending');

// Enumerate valid pick-before-drop sequences. Four tasks have at most 2,520 such
// sequences (plus an optional through-point). Pairwise paths are cached per call.
export function planBatch(tasks, from, {now=Date.now(),to=null,via=null}={}) {
  if(!spotOf(from)||!tasks.length||tasks.length>MAX_CARRY)return null;
  const cache=new Map(), leg=(a,b)=>{
    const key=spotKey(a)+'>'+spotKey(b);if(!cache.has(key))cache.set(key,shortestPath(a,b));return cache.get(key);
  };
  let best=null, fallback=null;
  const initial=tasks.map(t=>t.pickedUpAt?1:0);
  function visit(current,status,viaDone,metres,at,stops,nodes,late) {
    if(status.every(n=>n===2)&&viaDone) {
      const tail=to?leg(current,to):{nodes:[],metres:0},total=metres+tail.metres;
      if(!Number.isFinite(total))return;
      const result={stops,nodes:nodes.concat(tail.nodes.slice(1)),metres:total,finishAt:at+tail.metres/WALK_SPEED*1000,late,feasible:late.length===0,from,to,via};
      if(!fallback||result.late.length<fallback.late.length||(result.late.length===fallback.late.length&&total<fallback.metres))fallback=result;
      if(result.feasible&&(!best||total<best.metres))best=result;
      return;
    }
    if(best&&metres>best.metres)return;
    const candidates=[];
    tasks.forEach((t,i)=>{if(status[i]===2)return;const kind=status[i]===0?'pickup':'dropoff',ref=taskSpots(t)[kind];candidates.push({i,t,kind,ref});});
    if(!viaDone)candidates.push({kind:'via',ref:via});
    candidates.sort((a,b)=>(a.t?.deadline||Infinity)-(b.t?.deadline||Infinity));
    for(const c of candidates) {
      const path=leg(current,c.ref);if(!Number.isFinite(path.metres))continue;
      let arrival=at+path.metres/WALK_SPEED*1000;
      if(c.kind==='pickup'&&c.t.readyAt)arrival=Math.max(arrival,c.t.readyAt);
      const nextStatus=[...status];if(c.i!==undefined)nextStatus[c.i]++;
      const nextLate=c.kind==='dropoff'&&arrival>c.t.deadline?[...late,c.t.id]:late;
      const stop={task:c.t?.id||null,kind:c.kind,ref:c.ref,at:arrival,metres:path.metres,nodes:path.nodes};
      const handling=c.kind==='pickup'?45000:c.kind==='dropoff'?30000:0;
      visit(c.ref,nextStatus,viaDone||c.kind==='via',metres+path.metres,arrival+handling,[...stops,stop],nodes.concat(path.nodes.slice(1)),nextLate);
    }
  }
  visit(from,initial,!via,0,now,[],[from],[]);
  return best||fallback;
}

export function runPosition(state, run, now=Date.now()) {
  const remaining=run.stops.slice(run.index).filter(s=>s.kind!=='via'),stop=remaining[0]||null;
  const issues=run.taskIds.map(id=>state.tasks.find(t=>t.id===id)).filter(t=>t&&['accepted','progress'].includes(t.status)).map(pendingIssue).filter(Boolean);
  const frozen=issues.length?Math.min(...issues.map(x=>x.at||now)):now;
  const target=run.stops[run.index],path=target?pathThrough(run.from,...(target.viaBefore||[]),target.ref):{nodes:[run.from],metres:0};
  const fraction=target?Math.max(0,Math.min(1,(frozen-run.legAt)/(Math.max(1,path.metres)/WALK_SPEED*1000))):1;
  return {point:pointAlong(path.nodes,fraction),fraction,stop:target||stop,paused:issues.length>0,nodes:path.nodes,remainingMetres:path.metres*(1-fraction)};
}

export function installRun(state, runner, tasks, plan, now) {
  state.runs??=[];
  const stops=[];let through=[];for(const stop of plan.stops){if(stop.kind==='via')through.push(stop.ref);else{stops.push({...stop,viaBefore:through});through=[];}}
  const run={id:`run-${runner}-${now}-${state.revision}`,runner,taskIds:tasks.map(t=>t.id),stops,index:0,from:plan.from,legAt:now,to:plan.to,via:plan.via};
  state.runs=state.runs.filter(r=>r.runner!==runner||!r.taskIds.some(id=>tasks.some(t=>t.id===id)));
  state.runs.push(run);
  for(const t of tasks){
    t.deliveryRunId=run.id;t.runnerStartSpot=plan.from;
    const pi=plan.stops.findIndex(s=>s.task===t.id&&s.kind==='pickup'),di=plan.stops.findIndex(s=>s.task===t.id&&s.kind==='dropoff');
    t.runnerApproach=pathThrough(plan.from,...plan.stops.slice(0,pi+1).map(s=>s.ref)).nodes;
    const delivery=pathThrough(pi<0?plan.from:plan.stops[pi].ref,...plan.stops.slice(pi+1,di+1).map(s=>s.ref));
    t.runnerDelivery=delivery.nodes;t.runnerDeliveryMetres=delivery.metres;
    t.runnerApproachMetres=pathThrough(plan.from,...plan.stops.slice(0,pi+1).map(s=>s.ref)).metres;
  }
  return run;
}

export function assertRunStep(state,t,kind) {
  const run=state.runs?.find(r=>r.id===t.deliveryRunId);if(!run)return;
  if(run.taskIds.some(id=>{const task=state.tasks.find(x=>x.id===id);return task&&['accepted','progress'].includes(task.status)&&pendingIssue(task);}))throw new Error('同行任务有待处理约定，请先处理后继续取送');
  // Through-points require no delivery confirmation; they are crossed as part
  // of the next leg rather than forcing an extra tap.
  while(run.stops[run.index]?.kind==='via')run.index++;
  const stop=run.stops[run.index];
  if(stop&&(stop.task!==t.id||stop.kind!==kind))throw new Error('请按同行路线先完成当前站点，再操作这一单');
}

export function advanceRun(state,t,kind,now) {
  const run=state.runs?.find(r=>r.id===t.deliveryRunId);if(!run)return;
  const stop=run.stops[run.index];
  if(stop?.task===t.id&&stop.kind===kind){run.from=stop.ref;run.legAt=now;run.index++;}
  while(run.stops[run.index]?.kind==='via')run.index++;
}

export function repairRun(state,t,now,frozenPoint=null) {
  const run=state.runs?.find(r=>r.id===t.deliveryRunId);if(!run)return;
  const position=frozenPoint||runPosition(state,run,now).point;
  run.from={...position,name:'同行当前位置',short:'当前位置',custom:true};run.legAt=now;
  run.stops=run.stops.slice(run.index).filter(s=>{
    const task=state.tasks.find(x=>x.id===s.task);return !s.task||(task&&['accepted','progress'].includes(task.status));
  }).map(s=>s.task===t.id&&s.kind==='dropoff'?{...s,ref:taskSpots(t).dropoff}:s);
  run.index=0;
}
