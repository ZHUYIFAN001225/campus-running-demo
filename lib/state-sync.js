export function validSharedState(value){
  return !!value&&value.version===1&&Number.isInteger(value.revision)&&Number.isFinite(value.createdAt)&&Array.isArray(value.tasks)&&Array.isArray(value.notifications)&&Array.isArray(value.reports)&&!!value.users?.[value.actor]&&value.tasks.every(t=>t&&typeof t.id==='string'&&!!value.users[t.owner]&&Array.isArray(t.events)&&Array.isArray(t.reviews)&&Number.isInteger(t.prepaid)&&Number.isFinite(t.deadline));
}

// A tab keeps its chosen demo identity. Fresh shared orders are used for every
// command, but changes to the order being confirmed require another review.
export function syncDecision(current,incoming,command=null,payload={}){
  if(!validSharedState(incoming)||!incoming.users[current.actor])return {kind:'invalid',state:current,changedIds:[]};
  if(incoming.createdAt!==current.createdAt)return {kind:'reset',state:current,changedIds:[]};
  if(incoming.revision===current.revision)return {kind:'same',state:current,changedIds:[]};
  if(incoming.revision<current.revision)return {kind:'invalid',state:current,changedIds:[]};
  const ids=new Set([payload.id,...(Array.isArray(payload.ids)?payload.ids:[])].filter(Boolean));
  if(command==='message'){
    const before=current.tasks.find(t=>t.id===payload.id),after=incoming.tasks.find(t=>t.id===payload.id);
    // A reply appends to the latest conversation; it never authorizes fees or locations.
    if(before&&after&&before.owner===after.owner&&before.runner===after.runner&&['accepted','progress','delivered'].includes(after.status))ids.delete(payload.id);
  }
  if(['accept','acceptBatch'].includes(command))for(const s of [current,incoming])for(const task of s.tasks)if(task.runner===current.actor&&['accepted','progress'].includes(task.status))ids.add(task.id);
  const changedIds=[...ids].filter(id=>JSON.stringify(current.tasks.find(t=>t.id===id))!==JSON.stringify(incoming.tasks.find(t=>t.id===id)));
  if(changedIds.length)return {kind:'conflict',state:current,changedIds};
  return {kind:'ready',state:{...incoming,actor:current.actor},changedIds:[]};
}
