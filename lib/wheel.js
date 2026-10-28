// 转盘式选择器：把页面里的下拉选择（select）在点按时换成一张磨砂底部弹层，
// 选项沿弧线排列，上下滑动时居中的一项放大高亮，点“确定”后写回原 select 并触发 change。
// 只接管鼠标/触摸点按；键盘操作仍走原生 select，业务逻辑无需改动。
const ITEM = 56;
let sheet, list, title, current = null, raf = 0;

function labelFor(select) {
  const own = select.getAttribute('aria-label');
  if (own) return own;
  const label = select.closest('label');
  const text = label?.querySelector('span')?.textContent || label?.childNodes[0]?.textContent || '';
  return text.trim() || '请选择';
}

function build() {
  sheet = document.createElement('dialog');
  sheet.className = 'wheel-sheet';
  sheet.setAttribute('aria-labelledby', 'wheel-title');
  sheet.innerHTML = `<div class="wheel-head"><h2 id="wheel-title"></h2><button type="button" class="wheel-close" data-wheel="cancel" aria-label="取消">取消</button></div>
    <div class="wheel-stage"><ul class="wheel-list" role="listbox" tabindex="0"></ul><svg class="wheel-arc" viewBox="0 0 60 400" aria-hidden="true"><path d="M58 0 Q -6 200 58 400"/></svg><span class="wheel-knob" aria-hidden="true"></span></div>
    <button type="button" class="wheel-confirm" data-wheel="ok">确定</button>`;
  document.body.append(sheet);
  list = sheet.querySelector('.wheel-list');
  title = sheet.querySelector('#wheel-title');
  list.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); }, { passive: true });
  list.addEventListener('click', e => { const li = e.target.closest('li'); if (li && !li.classList.contains('off')) center(li, true); });
  list.addEventListener('keydown', e => {
    const items = [...list.children], i = items.indexOf(list.querySelector('li.on'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const next = items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]; if (next) center(next, true); }
    if (e.key === 'Enter') { e.preventDefault(); confirm(); }
  });
  sheet.addEventListener('click', e => {
    const a = e.target.closest('[data-wheel]')?.dataset.wheel;
    if (a === 'cancel') sheet.close();
    else if (a === 'ok') confirm();
    else if (e.target === sheet) sheet.close();
  });
  sheet.addEventListener('close', () => { current?.focus({ preventScroll: true }); current = null; });
}

function center(li, smooth) {
  list.scrollTo({ top: li.offsetTop - (list.clientHeight - ITEM) / 2, behavior: smooth ? 'smooth' : 'instant' });
}

function paint() {
  const mid = list.scrollTop + list.clientHeight / 2;
  let best = null, bestD = Infinity;
  for (const li of list.children) {
    const c = li.offsetTop + ITEM / 2, d = (c - mid) / ITEM, ad = Math.abs(d);
    // 沿弧线向右收：离中心越远，越往右、越小、越淡
    const x = Math.min(64, ad * ad * 9), s = Math.max(.78, 1 - ad * .07), o = Math.max(.18, 1 - ad * .24);
    li.style.transform = `translateX(${-x}px) scale(${s})`;
    li.style.opacity = o;
    if (ad < bestD && !li.classList.contains('off')) { bestD = ad; best = li; }
  }
  for (const li of list.children) { const on = li === best; li.classList.toggle('on', on); li.setAttribute('aria-selected', String(on)); }
}

function confirm() {
  const on = list.querySelector('li.on');
  if (current && on && current.value !== on.dataset.value) {
    current.value = on.dataset.value;
    current.dispatchEvent(new Event('input', { bubbles: true }));
    current.dispatchEvent(new Event('change', { bubbles: true }));
  }
  sheet.close();
}

function open(select) {
  if (!sheet) build();
  current = select;
  title.textContent = labelFor(select);
  list.innerHTML = [...select.options].map(o => `<li role="option" data-value="${o.value.replace(/"/g, '&quot;')}" class="${o.disabled ? 'off' : ''}"><span>${o.textContent.replace(/[<&]/g, c => c === '<' ? '&lt;' : '&amp;')}</span></li>`).join('');
  sheet.showModal();
  const sel = list.children[select.selectedIndex] || list.children[0];
  requestAnimationFrame(() => { center(sel, false); paint(); list.focus({ preventScroll: true }); });
}

function intercept(e) {
  const select = e.target.closest?.('select');
  if (!select || select.multiple || select.disabled || select.options.length < 2 || select.closest('.wheel-sheet') || select.dataset.native !== undefined) return;
  e.preventDefault();
  open(select);
}
document.addEventListener('mousedown', e => { if (e.button === 0) intercept(e); }, true);
document.addEventListener('touchstart', intercept, { capture: true, passive: false });
