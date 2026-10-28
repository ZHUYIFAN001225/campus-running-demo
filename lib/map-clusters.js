const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

// Complete-link grouping avoids chaining an entire campus into one cluster.
// A fixed screen distance means that zooming in can only reveal more places.
export function clusterPoints(points,view={w:600},pixelWidth=320){
  const threshold=96*view.w/Math.max(1,pixelWidth);
  const groups=points.filter(p=>p.count>0).map(p=>[p]).sort((a,b)=>a[0].key.localeCompare(b[0].key));
  while(true){
    let pair=null,best=Infinity;
    for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
      const diameter=Math.max(...groups[i].flatMap(a=>groups[j].map(b=>Math.hypot(a.x-b.x,a.y-b.y))));
      if(diameter<=threshold&&diameter<best){best=diameter;pair=[i,j];}
    }
    if(!pair)break;
    groups[pair[0]].push(...groups[pair[1]]);groups.splice(pair[1],1);
  }
  return groups.map(members=>{
    members.sort((a,b)=>a.key.localeCompare(b.key));
    const count=members.reduce((n,p)=>n+p.count,0),main=[...members].sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key))[0];
    return {id:members.map(p=>p.key).join('|'),members,count,x:members.reduce((n,p)=>n+p.x*p.count,0)/count,y:members.reduce((n,p)=>n+p.y*p.count,0)/count,
      name:members.length>1?main.name+'周边':main.name,
      bounds:{left:Math.min(...members.map(p=>p.x)),right:Math.max(...members.map(p=>p.x)),top:Math.min(...members.map(p=>p.y)),bottom:Math.max(...members.map(p=>p.y))}};
  });
}

export function clusterZoomView(bounds,view){
  const width=Math.max(80,Math.min(view.w*.64,Math.max((bounds.right-bounds.left)*1.5,(bounds.bottom-bounds.top)/.7*1.5,80)));
  return {x:(bounds.left+bounds.right-width)/2,y:(bounds.top+bounds.bottom-width*.7)/2,w:width,h:width*.7};
}

export function clustersMarkup(groups,scale=320/600,selected=null,highlighted=null,location=null){
  const unit=1/Math.max(.1,scale);
  return groups.map(g=>{
    const merged=g.members.length>1,r=(merged?21:17)*unit,b=g.bounds,key=g.members[0].key;
    // Keep the person at the true point; offset only a colliding demand badge.
    const avoid=location&&Math.hypot(g.x-location.x,g.y-location.y)*scale<62;
    const dx=avoid?(g.x>450?-65:65)*unit:0,dy=avoid?14*unit:0;
    const action=merged?`data-action="map-cluster" data-left="${b.left}" data-right="${b.right}" data-top="${b.top}" data-bottom="${b.bottom}"`:`data-action="map-hub" data-spot="${safe(key)}"`;
    return `<g class="demand-bubble ${merged?'is-cluster':'is-place'} ${g.members.some(p=>p.key===selected)?'is-selected':''}" ${action} data-count="${g.count}" role="button" tabindex="0" aria-label="${safe(g.name)}，${g.count}单，${merged?'点击放大查看'+g.members.length+'个取件点':'查看此处任务'}"><title>${safe(g.members.map(p=>p.name+' '+p.count+'单').join('；'))}</title>${avoid?`<path class="demand-leader" d="M${g.x} ${g.y}l${dx} ${dy}"/>`:""}<g transform="translate(${dx} ${dy})"><circle class="demand-hit" cx="${g.x}" cy="${g.y}" r="${r+6*unit}"/>${merged?`<circle class="demand-cluster-ring" cx="${g.x}" cy="${g.y}" r="${r+4*unit}"/>`:''}${highlighted&&g.members.some(p=>p.key===highlighted)?`<circle class="demand-fresh-ring" cx="${g.x}" cy="${g.y}" r="${r+8*unit}"/>`:''}<circle class="demand-disc" cx="${g.x}" cy="${g.y}" r="${r}"/><text class="demand-count" x="${g.x}" y="${g.y+4.5*unit}" text-anchor="middle" style="font-size:${14*unit}px">${g.count}</text><text class="demand-name" x="${g.x}" y="${g.y+r+13*unit}" text-anchor="middle" style="font-size:${10*unit}px">${safe(g.name.slice(0,12))}</text>${merged?`<text class="demand-detail" x="${g.x}" y="${g.y+r+25*unit}" text-anchor="middle" style="font-size:${9*unit}px">${g.members.length}个取件点 · 点开</text>`:''}</g></g>`;
  }).join('');
}
