import test from 'node:test';
import assert from 'node:assert/strict';
import {clusterPoints,clustersMarkup,clusterZoomView} from '../lib/map-clusters.js';
import {boundView,zoomViewAt} from '../lib/map-controls.js';
const points=[{key:'north',name:'北门',x:300,y:40,count:15},{key:'cafe',name:'咖啡',x:445,y:75,count:5},{key:'west',name:'驿站',x:65,y:180,count:7},{key:'activity',name:'活动中心',x:100,y:95,count:3},{key:'design',name:'设计楼',x:300,y:280,count:8},{key:'path',name:'自选公共点',x:294,y:235,count:2}];
test('缩小合并、放大逐步拆开，总单量不变且每个点只出现一次',()=>{
  const counts=[];
  for(const w of [600,420,294,206,144,80]){const groups=clusterPoints(points,{w},320);counts.push(groups.length);assert.equal(groups.reduce((n,g)=>n+g.count,0),40);assert.deepEqual(groups.flatMap(g=>g.members.map(p=>p.key)).sort(),points.map(p=>p.key).sort());}
  assert.ok(counts[0]<counts.at(-1));assert.ok(counts.every((n,i)=>i===0||n>=counts[i-1]));assert.equal(counts.at(-1),6);
});
test('聚合不虚构位置：同一个地点15单仍是一个点，近处不同地点才展开',()=>{
  const original=structuredClone(points),far=clusterPoints(points,{w:600},320),near=clusterPoints(points,{w:80},320);
  assert.ok(far.some(g=>g.count===20&&g.members.length===2));assert.equal(near.find(g=>g.id==='north').count,15);assert.deepEqual(points,original);
  assert.ok(near.every(g=>g.x===g.members[0].x&&g.y===g.members[0].y));
});
test('分组与数据顺序无关，宽屏按屏幕距离适配，点击聚合能更深入',()=>{
  assert.deepEqual(clusterPoints(points),clusterPoints([...points].reverse()));
  const full={x:0,y:0,w:600,h:420},groups=clusterPoints(points,full,320),zoom=boundView(clusterZoomView(groups.find(g=>g.members.length>1).bounds,full));
  assert.ok(zoom.w<600);assert.ok(zoom.x>=0&&zoom.y>=0&&zoom.x+zoom.w<=600&&zoom.y+zoom.h<=420);
  assert.ok(clusterPoints(points,full,1000).length>=groups.length);
});
test('以鼠标/手指锚点缩放保持该位置，比例与拖动有明确边界',()=>{
  const view={x:100,y:70,w:400,h:280},u=.2,v=.3,next=zoomViewAt(view,.5,u,v);
  assert.equal(view.x+view.w*u,next.x+next.w*u);assert.equal(view.y+view.h*v,next.y+next.h*v);
  assert.equal(zoomViewAt(view,.001).w,80);assert.deepEqual(boundView({x:-100,y:900,w:900}),{x:0,y:0,w:600,h:420});
});
test('聚合标记带真实总数和展开语义，自定义名称安全转义',()=>{
  const groups=clusterPoints([{key:'a',name:'<script>',x:100,y:100,count:12},{key:'b',name:'另一点',x:130,y:130,count:8}]);
  const html=clustersMarkup(groups);assert.ok(html.includes('data-count="20"'));assert.ok(html.includes('data-action="map-cluster"'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
});
test('单量避让人物只改变徽标呈现，不改变聚合坐标、单数和放大范围',()=>{
  const groups=clusterPoints(points,{w:80},320),before=structuredClone(groups),location={x:300,y:40};
  for(const scale of [.5,1,4]){
    const html=clustersMarkup(groups,scale,null,null,location);
    assert.match(html,/class="demand-leader" d="M300 40l/);assert.ok(html.includes('data-count="15"'));assert.deepEqual(groups,before);
  }
});
