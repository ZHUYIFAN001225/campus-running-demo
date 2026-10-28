import { shortestPath, taskSpots, pathThrough, spotOf } from './campus.js';
import { runPosition, WALK_SPEED, pendingIssue } from './planning.js';

// Estimate this order's destination, including earlier stops in a shared run.
// Actual pickup, payment and handoff always remain explicit user actions.
export function deliveryEstimate(task, now=Date.now(), state=null, run=null) {
  const {pickup,dropoff}=taskSpots(task),final=['delivered','completed'].includes(task.status);
  if(final)return {metres:0,seconds:0,arrivalAt:null,headline:'已送达',note:'以交接记录与凭证为准',next:'交接已记录',progress:1};
  if(pendingIssue(task)||run?.taskIds.some(id=>pendingIssue(state.tasks.find(t=>t.id===id)||{})))return {metres:null,seconds:null,arrivalAt:null,headline:'预计时间待更新',note:'有待处理约定，处理后重新估算',next:'取送暂缓',progress:0};
  let metres=0,seconds=0,progress=0,waiting=false,next='',procurement=false;
  if(run&&state){
    const live=runPosition(state,run,now),stops=run.stops.slice(run.index);
    let from=run.from;
    for(let i=0;i<stops.length;i++){
      const stop=stops[i],t=state.tasks.find(t=>t.id===stop.task);
      const distance=i===0?live.remainingMetres:pathThrough(from,...(stop.viaBefore||[]),stop.ref).metres;
      metres+=distance;seconds+=distance/WALK_SPEED;
      if(i===0){progress=live.fraction;waiting=live.fraction===1;next=`下一站${stop.task===task.id?'':'先'}${stop.kind==='pickup'?'取件':'交接'}：${spotOf(stop.ref)?.short||'公共点'}${stop.task===task.id?(stop.kind==='dropoff'?'（就是本单）':'（本单）'):'（同行其他单）'}`;}
      if(stop.kind==='pickup'){
        seconds=Math.max(seconds,((t?.readyAt||now)-now)/1000);
        if(t?.buy&&!t.purchase?.bought)procurement=true;
      }
      if(stop.task===task.id&&stop.kind==='dropoff')break;
      seconds+=stop.kind==='pickup'?45:30;from=stop.ref;
    }
  }else{
    const taken=!!task.pickedUpAt,leg=taken?(task.runnerDeliveryMetres??shortestPath(pickup,dropoff).metres):(task.runnerApproachMetres??shortestPath(task.runnerStartSpot||'north',pickup).metres);
    const elapsed=Math.max(0,(now-(taken?task.pickedUpAt:task.startedAt||task.acceptedAt||now))/1000);
    progress=task.status==='accepted'?0:Math.min(1,elapsed/(Math.max(1,leg)/WALK_SPEED));
    metres=leg*(1-progress);seconds=metres/WALK_SPEED;
    if(!taken){seconds=Math.max(seconds,((task.readyAt||now)-now)/1000)+45;const rest=task.runnerDeliveryMetres??shortestPath(pickup,dropoff).metres;metres+=rest;seconds+=rest/WALK_SPEED;}
    waiting=progress===1;procurement=!taken&&task.buy&&!task.purchase?.bought;
    next=`下一站${taken?'交接':'取件'}：${spotOf(taken?dropoff:pickup)?.short||'公共点'}`;
  }
  if(!Number.isFinite(seconds))return {metres:null,seconds:null,arrivalAt:null,headline:'预计时间待更新',note:'路线暂不可用，请联系同学',next,progress};
  const minutes=Math.max(1,Math.ceil(seconds/60)),hold=waiting||procurement||task.status==='accepted';
  return {metres,seconds,arrivalAt:hold?null:now+seconds*1000,headline:seconds<1?'已到交接点':`约 ${minutes} 分钟送达`,note:procurement?'待采购确认；所示为步行与交接用时':waiting?'已到当前站，等待本人确认后继续':task.status==='accepted'?'尚未出发，出发后更新到达时刻':'含沿途取送，按步行约 1.2 米/秒估算',next,progress};
}
