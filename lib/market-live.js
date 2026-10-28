import { SPOTS } from './campus.js';
import { marketSummary, MARKET_INTERVAL } from './market-data.js';

export function livePauseReason(ui){
  if(ui.locationPicking)return '正在设置位置，更新暂缓';
  if(ui.liveEnabled===false)return '动态已暂停';
  if(ui.selected?.length)return '正在选单，更新暂缓';
  if(ui.hub)return '正在查看取件点，更新暂缓';
  if(ui.routeEnabled&&ui.routeEditing)return '正在设置路线，更新暂缓';
  return '';
}
export function liveMarketMarkup(state,ui,esc,now=Date.now()){
  const summary=marketSummary(state,state.actor,now),feed=state.marketFeed,last=feed?.last,reason=livePauseReason(ui);
  const elapsed=Math.max(0,Math.floor((now-(feed?.lastAt||now))/1000));
  const update=last?.count?`${SPOTS[last.hub].short}新增 ${last.count} 单`:'各取件点需求已更新';
  return `<div class="market-live ${reason?'is-paused':''}"><div class="market-live-top"><span><i class="live-beacon"></i><b data-live-state>${reason||'正在扫描附近需求'}</b><em>模拟动态</em></span><button type="button" data-action="toggle-market-live" aria-pressed="${ui.liveEnabled!==false}">${ui.liveEnabled===false?'继续动态':'暂停动态'}</button></div><div class="market-live-bottom"><span data-live-update role="status">${esc(update)}</span><span data-live-age aria-live="off">${elapsed<1?'刚刚更新':elapsed+'秒前更新'} · 每${MARKET_INTERVAL/1000}秒扫描</span></div></div><div class="pickup-overview"><b>取件点待取单量</b><span>全校可接 ${summary.total} 单 · ${summary.hubs.filter(h=>h.count).length} 个固定点</span></div>`;
}
export function hubStripMarkup(state,ui,esc,now=Date.now()){
  const summary=marketSummary(state,state.actor,now);
  return `<div class="pickup-point-strip" role="group" aria-label="各固定取件点待取单量">${summary.hubs.filter(h=>h.count).map(h=>`<button type="button" data-action="browse-hub" data-spot="${h.id}" class="${ui.hub===h.id?'selected':''}"><span>${esc(SPOTS[h.id].short)}</span><b>${h.count}<small>单待取</small></b></button>`).join('')}</div>`;
}
