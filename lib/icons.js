const paths = {
  arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
  right: '<path d="m9 5 7 7-7 7"/>', back: '<path d="m15 5-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  tasks: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v4H9zM9 12h6M9 16h4"/>',
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.8 9.8 0 0 1-4-.8L3 21l1.8-4.7A8.9 8.9 0 1 1 21 11.5Z"/><path d="M8 11h.01M12 11h.01M16 11h.01"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  box: '<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Z"/><path d="m3 8 9 5 9-5M12 13v9M7 5.7l9 5"/>',
  coffee: '<path d="M4 9h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9ZM17 10h2a3 3 0 0 1 0 6h-2M7 3v2M11 2v3M15 3v2"/>',
  bag: '<path d="M5 7h14l2 14H3L5 7ZM8 9V6a4 4 0 0 1 8 0v3"/>',
  file: '<path d="M14 3H5v18h14V8l-5-5ZM14 3v5h5M8 12h8M8 16h5"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  star: '<path d="m12 3 2.8 5.7 6.3.9-4.5 4.5 1 6.3-5.6-3-5.6 3 1-6.3L2 9.6l6.3-.9L12 3Z"/>',
  school: '<path d="m3 9 9-6 9 6M5 9v12h14V9M9 21v-6h6v6M9 10h.01M15 10h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  wallet: '<path d="M20 8H5a2 2 0 0 1 0-4h13v4M5 8a2 2 0 0 1-2-2v13a2 2 0 0 0 2 2h16V8ZM21 12h-6v5h6"/>',
  route: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><path d="M8 5h7a4 4 0 0 1 0 8H9a4 4 0 0 0 0 8h7"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  flag: '<path d="M5 22V3h14l-3 4 3 4H5"/>',
  refresh: '<path d="M20 8a9 9 0 1 0 .5 7M20 3v5h-5"/>',
  swap: '<path d="M4 7h16l-4-4M20 17H4l4 4M20 7l-4 4M4 17l4-4"/>',
  send: '<path d="m22 2-7 20-4-9-9-4L22 2ZM11 13 22 2"/>',
  receipt: '<path d="M5 3h14v19l-3-2-4 2-4-2-3 2V3ZM9 7h6M9 11h6M9 15h3"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>'
};
export const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.grid}</svg>`;
export const logo = '<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><rect width="40" height="40" rx="9" fill="currentColor"/><path d="M12 29V19a6 6 0 0 1 6-6h9" stroke="white" stroke-width="3" stroke-linecap="round"/><circle cx="12" cy="29" r="3.5" fill="white"/><rect x="25" y="9.5" width="7" height="7" rx="1.5" fill="white"/></svg>';
export const campusArt = `<svg class="campus-art" viewBox="0 0 540 330" fill="none" aria-hidden="true">
  <defs><pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#c9cec7"/></pattern><filter id="paper-shadow" x="-50%" y="-50%" width="200%" height="220%"><feDropShadow dx="0" dy="14" stdDeviation="10" flood-opacity=".07"/></filter></defs>
  <rect width="540" height="330" fill="url(#dots)"/>
  <path d="m28 242 212-124 258 139M130 304l216-124M164 53l227 131" stroke="#d8dcd5" stroke-width="26"/><path d="m28 242 212-124 258 139M130 304l216-124M164 53l227 131" stroke="#fafbf8" stroke-width="22"/>
  <g filter="url(#paper-shadow)"><path d="m65 159 76-44 77 44-77 44-76-44Z" fill="#fff" stroke="#cbd1c9"/><path d="M65 159v51l76 44v-51l-76-44Z" fill="#e5e9e1" stroke="#cbd1c9"/><path d="m141 203 77-44v51l-77 44v-51Z" fill="#f4f6f1" stroke="#cbd1c9"/><path d="m83 179 38 22m-38-9 38 22m38-10 42-24m-42 37 42-24" stroke="#b7c0b1" stroke-width="3"/>
  <path d="m296 105 66-38 87 50-66 38-87-50Z" fill="#fff" stroke="#cbd1c9"/><path d="M296 105v57l87 50v-57l-87-50Z" fill="#e2e7de" stroke="#cbd1c9"/><path d="m383 155 66-38v57l-66 38v-57Z" fill="#f4f6f1" stroke="#cbd1c9"/><path d="m312 129 54 31m-54-18 54 31m29-17 41-24m-41 37 41-24" stroke="#b7c0b1" stroke-width="3"/></g>
  <path d="M178 261c56 22 107 10 106-25s-61-36-56-72 48-30 51-66" stroke="#303c31" stroke-width="2" stroke-linecap="round" stroke-dasharray="5 6"/>
  <circle cx="178" cy="261" r="7" fill="#303c31" stroke="white" stroke-width="3"/><circle cx="279" cy="98" r="7" fill="#303c31" stroke="white" stroke-width="3"/>
  <g transform="translate(138 272)"><rect width="84" height="28" rx="14" fill="white" stroke="#d8ddd3"/><text x="42" y="18" text-anchor="middle" fill="#465044" font-size="11" font-family="sans-serif">你的下一站</text></g>
  <g transform="translate(246 50)"><rect width="68" height="29" rx="14.5" fill="#273128"/><text x="34" y="19" text-anchor="middle" fill="white" font-size="11" font-family="sans-serif">顺路的你</text></g>
  <path d="M53 77v22m-11-11h22M482 222v16m-8-8h16" stroke="#bac3b5"/><text x="422" y="45" fill="#8b9486" font-size="9" letter-spacing="2" font-family="sans-serif">CAMPUS / 01</text>
</svg>`;
