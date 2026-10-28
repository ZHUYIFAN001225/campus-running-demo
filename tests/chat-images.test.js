import test from 'node:test';
import assert from 'node:assert/strict';
import {chatImage,messageContent,prepareChatImage,MAX_CHAT_IMAGE_CHARS,MAX_CHAT_IMAGE_TOTAL} from '../lib/chat-images.js';
import {createState,evolve,visibleTask} from '../lib/model.js';
import {syncDecision} from '../lib/state-sync.js';
const now=Date.now(),image={src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT9kAAAAASUVORK5CYII=',width:1,height:1};
function active(){let s={...createState(now),actor:'lin'};return evolve(s,'conversationExamples',{},now);}

test('发送图片可不带文字，保存后仍可读取；不替代交接确认或改变费用',()=>{
  const before=active(),t=before.tasks[0],next=evolve(before,'message',{id:t.id,image},now+1),after=next.tasks[0],saved=JSON.parse(JSON.stringify(next));
  assert.deepEqual(saved.tasks[0].messages.at(-1).image,image);assert.equal(after.messages.at(-1).text,'');assert.equal(after.status,t.status);assert.equal(after.reward,t.reward);assert.equal(after.settlement,null);assert.equal(after.deliveryProof,undefined);
  assert.equal(next.notifications[0].body,'发来一张交接图片');assert.ok(!next.notifications[0].body.includes('data:'));
});
test('图片与私聊共用订单权限，旁观者和已结束订单不能发图',()=>{
  const s=active(),id=s.tasks[0].id;
  assert.throws(()=>evolve({...s,actor:'visitor'},'message',{id,image},now),/只有任务双方/);assert.equal(visibleTask({...s,actor:'visitor'},s.tasks[0]).messages,undefined);
  const ended=structuredClone(s);ended.tasks[0].status='completed';assert.throws(()=>evolve(ended,'message',{id,image},now),/仅支持查看历史/);
});
test('只接受有界本地栅格图片；拒绝远程、SVG、超量、非法尺寸及空消息',async()=>{
  assert.deepEqual(messageContent({text:' 到了 ',image}).text,'到了');assert.equal(chatImage({...image,sample:true}).sample,true);
  for(const src of ['https://example.com/photo.png','data:image/svg+xml;base64,PHN2Zz4=','javascript:alert(1)',image.src+'A'.repeat(MAX_CHAT_IMAGE_CHARS)])assert.equal(chatImage({...image,src}),null);
  assert.equal(chatImage({...image,width:1601}),null);assert.equal(chatImage({...image,height:0}),null);assert.throws(()=>messageContent({}),/消息或选择/);assert.throws(()=>messageContent({image:{...image,src:'https://example.com/'}}),/图片格式/);
  await assert.rejects(prepareChatImage({type:'image/svg+xml',size:100}),/请选择/);await assert.rejects(prepareChatImage({type:'image/jpeg',size:13*1024*1024}),/12MB/);
});
test('图片总空间不足时整次发送失败，原对话不变且仍可发文字',()=>{
  const s=active(),t=s.tasks[0];t.messages.push({from:'lin',text:'旧图',at:now,image:{...image,src:'x'.repeat(MAX_CHAT_IMAGE_TOTAL)}});
  const original=JSON.stringify(t.messages);assert.throws(()=>evolve(s,'message',{id:t.id,image},now),/空间已满/);assert.equal(JSON.stringify(t.messages),original);assert.equal(evolve(s,'message',{id:t.id,text:'只发文字'},now).tasks[0].messages.at(-1).text,'只发文字');
});
test('另一页发图后本页回复追加到最新对话，图片不会丢失',()=>{
  const before=active(),id=before.tasks[0].id,incoming=evolve({...before,actor:'zhou'},'message',{id,image},now+1),decision=syncDecision(before,incoming,'message',{id,text:'收到图片'});
  assert.equal(decision.kind,'ready');const next=evolve(decision.state,'message',{id,text:'收到图片'},now+2);assert.deepEqual(next.tasks[0].messages.at(-2).image,image);assert.equal(next.tasks[0].messages.at(-1).text,'收到图片');
});
