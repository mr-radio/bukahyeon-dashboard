'use strict';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const money = value => Number(value).toFixed(2).replace(/0+$/, '').replace(/\.$/, '') + '억';
const newestFirst = items => items.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
const bloggerPosts = blogger => newestFirst(blogger.scope === 'category'
  ? blogger.posts.filter(post => post.categoryNo === blogger.feedCategoryNo) : blogger.posts);
const link = (url, label = '원문 보기') => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
const linkedText = text => text.split(/(https?:\/\/[^\s<>]+)/g)
  .map(part => /^https?:\/\//.test(part) ? link(part, part) : esc(part)).join('');

// Keep existing visitor preferences and locally saved premium history.
const HISTORY_KEY = 'bukahyeon-premium-weekly-v8';
const SEEN_KEY = 'bukahyeon_dashboard_seen_v1';
function readStored(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch { return fallback; }
}
const contentIds = {
  news: DATA.news.map(item => item.url),
  seoul: DATA.seoul.map(item => item.url),
  blogs: DATA.bloggers.flatMap(blogger => bloggerPosts(blogger).map(post => post.url)),
  chat: CHAT_POSTS.map(post => post.id)
};
const storedSeen = readStored(SEEN_KEY, {});
const seenIds = Object.fromEntries(Object.entries(contentIds).map(([key, ids]) =>
  [key, Array.isArray(storedSeen[key]) ? storedSeen[key] : ids.slice()]));
let newIds = {};
function refreshNewIds() {
  for (const [key, ids] of Object.entries(contentIds)) {
    newIds[key] = new Set(ids.filter(id => !seenIds[key].includes(id)));
  }
}
function saveSeen() {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(seenIds)); } catch { /* Browsing works without storage. */ }
}
function markSectionViewed(key) {
  seenIds[key] = contentIds[key].slice();
  saveSeen();
}
const newMark = () => '<span class="new-flag" aria-label="새로 등록된 글">NEW</span>';
const badgeIfNew = (key, id) => newIds[key]?.has(id) ? newMark() : '';
const badgeCount = key => newIds[key]?.size ? newMark() : '';
saveSeen();
refreshNewIds();

function snapshot(zone) {
  const values = DATA.price[zone].values;
  return {
    count: values.length, min: Math.min(...values), max: Math.max(...values),
    avg: values.reduce((sum, value) => sum + value, 0) / values.length
  };
}
function premiumHistory(zone) {
  // Public records are stored in index.html. Preserve local earlier records as fallback.
  const stored=readStored(HISTORY_KEY,{});
  const local=Array.isArray(stored[zone])?stored[zone]:[];
  const shared=Array.isArray(PREMIUM_DAILY_HISTORY?.[zone])?PREMIUM_DAILY_HISTORY[zone]:[];
  const base={date:PREMIUM_BASE_DATE,value:snapshot(zone).avg};
  const dates=new Map();
  for(const record of [...local,...shared,base]){
    if(record&&/^20\d{2}-\d{2}-\d{2}$/.test(record.date)&&Number.isFinite(+record.value)&&+record.value>0)
      dates.set(record.date,{date:record.date,value:+record.value});
  }
  return [...dates.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
const latestPremium = zone => premiumHistory(zone).at(-1);
function weeklyComparison(zone) {
  const series = premiumHistory(zone);
  const latest = series.at(-1);
  const date = new Date(latest.date + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() - 7);
  const previous = series.find(item => item.date === date.toISOString().slice(0, 10));
  if (!previous) return null;
  const diff = latest.value - previous.value;
  return { diff, percent: 100 * diff / previous.value };
}
function changeHtml(zone) {
  const change = weeklyComparison(zone);
  if (!change) return '<span class="delta">지난주 대비<b>비교 자료 없음</b></span>';
  const direction = change.diff > 0 ? 'up' : change.diff < 0 ? 'down' : 'flat';
  const sign = change.diff > 0 ? '+' : '';
  return `<span class="delta ${direction}">지난주 대비<b>${sign}${money(change.diff)} (${sign}${change.percent.toFixed(1)}%)</b></span>`;
}
// Daily observations on true calendar-day x positions; gaps are not interpolated.
function trendChart(zone, compact = false) {
  const history=premiumHistory(zone);
  if(!history.length)return '<div class="trend-empty">일별 조사 기록이 없습니다.</div>';
  const MS=86400000, days=compact?14:30;
  const endMs=Date.parse(history.at(-1).date+'T00:00:00Z');
  const startMs=endMs-(days-1)*MS;
  const sample=history.map(p=>({...p,ms:Date.parse(p.date+'T00:00:00Z')}))
    .filter(p=>p.ms>=startMs&&p.ms<=endMs);
  const W=510,H=compact?102:194,L=compact?18:28,R=compact?18:24,T=compact?13:18,B=compact?13:30;
  const values=sample.map(p=>p.value), min=Math.min(...values), max=Math.max(...values);
  const margin=min===max?.35:Math.max(.08,(max-min)*.22),lo=min-margin,hi=max+margin;
  const x=ms=>L+(ms-startMs)/((days-1)*MS)*(W-L-R);
  const y=v=>T+(hi-v)/(hi-lo)*(H-T-B);
  const points=sample.map(p=>({...p,x:x(p.ms),y:y(p.value)}));
  const lines=points.slice(1).map((p,i)=>{
    const prior=points[i];
    return p.ms-prior.ms===MS
      ?`<line x1="${prior.x.toFixed(1)}" y1="${prior.y.toFixed(1)}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="#287655" stroke-width="${compact?5:3}" stroke-linecap="round"/>`
      :'';
  }).join('');
  const marks=points.map(p=>`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${compact?7:5}" fill="white" stroke="#287655" stroke-width="${compact?4:3}"><title>${esc(p.date)} 평균 P ${esc(money(p.value))}</title></circle>`).join('');
  const ticks=(compact?[0,days-1]:[0,7,14,21,days-1]).map((d,i,arr)=>{
    const ms=startMs+d*MS,xx=x(ms).toFixed(1),label=new Date(ms).toISOString().slice(5,10).replace('-','/');
    return `<line x1="${xx}" y1="${T}" x2="${xx}" y2="${H-B}" stroke="#e3ebe5"/>`+
    (compact?'':`<text x="${xx}" y="${H-7}" text-anchor="${i===0?'start':i===arr.length-1?'end':'middle'}" font-size="12" fill="#70847a">${label}</text>`);
  }).join('');
  const first=new Date(startMs).toISOString().slice(5,10).replace('-','/');
  const last=new Date(endMs).toISOString().slice(5,10).replace('-','/');
  return `<svg class="${compact?'compact-spark':'trend-svg'}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${zone}구역 최근 ${days}일 일별 프리미엄 추이, 확인된 날짜 ${sample.length}일">
    <line x1="${L}" y1="${H-B}" x2="${W-R}" y2="${H-B}" stroke="#d6e4da"/>${ticks}${lines}${marks}</svg>
    <div class="trend-meta"><span>${first}</span><span>${last}</span></div>
    ${compact?'':`<p class="daily-chart-note">확인된 날짜 ${sample.length}일 · 조사되지 않은 날짜는 연결하지 않습니다.${sample.length<2?' 기록이 더 쌓이면 일별 변화를 비교할 수 있습니다.':''}</p>`}`;
}

// Make use of empty space in existing card frames, without stretching the grid.
function fitHomePreview(id, baseMarkup, fullMarkup) {
  const area=$(id);
  area.style.maxHeight='';
  area.innerHTML=baseMarkup;
  const available=area.clientHeight;
  if(!available)return;
  area.style.maxHeight=available+'px';
  area.innerHTML=fullMarkup;
  while(area.children.length>1 && area.scrollHeight>area.clientHeight+1) area.lastElementChild.remove();
}

function homeTiles() {
  $('newsNew').innerHTML = badgeCount('news') || badgeCount('seoul');
  $('blogsNew').innerHTML = badgeCount('blogs');
  $('chatNew').innerHTML = badgeCount('chat');
  const dates = [...DATA.news, ...DATA.seoul, ...DATA.bloggers.flatMap(bloggerPosts), ...CHAT_POSTS]
    .map(item => item.date).filter(Boolean).sort();
  $('updatedDate').textContent = dates.length ? `최근 등록 ${dates.at(-1).replaceAll('-', '.')}` : '등록 자료 없음';
  const unread = Object.values(newIds).reduce((sum, ids) => sum + ids.size, 0);
  $('updateNew').textContent = unread ? `새로 등록 ${unread}건` : '북아현 소식 모아보기';
  $('newsTile').innerHTML = newestFirst(DATA.news).slice(0, 3).map(item =>
    `<div class="minirow"><div class="desc"><small>${esc(item.date.slice(5).replace('-', '.'))} · ${esc(item.source)}</small><span class="row-title">${badgeIfNew('news', item.url)}${esc(item.title)}</span></div></div>`).join('');
  const blogMarkup = DATA.bloggers.slice(0, 6).map(blogger => {
    const posts = bloggerPosts(blogger);
    return `<div class="minirow blog-row"><div class="desc"><span class="row-title" title="${esc(blogger.name)}">${posts.some(post => newIds.blogs.has(post.url)) ? newMark() : ''}${esc(blogger.name)}</span></div><span class="pill">${posts.length}건</span></div>`;
  }).join('');
  const chatMarkup = newestFirst(CHAT_POSTS).slice(0, 5).map(post =>
    `<div class="minirow"><div class="desc"><small>${esc(post.date.slice(5).replace('-', '.'))} 브리핑</small><span class="row-title">${badgeIfNew('chat', post.id)}${esc(post.title.replace(/^.*?·\s*/, ''))}</span></div></div>`).join('') || '<p class="empty">등록된 요약 없음</p>';
  $('priceTile').innerHTML = `<div class="pricegrid">${['3', '2'].map(zone =>
    `<div class="pricebox ${zone === '3' ? 'primary' : ''}"><small>${zone}구역</small><strong>${money(latestPremium(zone).value)}</strong>${weeklyComparison(zone) ? changeHtml(zone) : '<span class="delta">전주 비교 자료 없음</span>'}</div>`).join('')}</div>
    <div class="compact-trend"><span class="compact-trend-label">3구역 일별 P 추이 · 최근 14일</span>${trendChart('3', true)}</div>
    <p class="source-date">P 조사 ${esc(PREMIUM_BASE_DATE.replaceAll('-', '.'))}</p>`;
  // Fit within the original card footprint, keeping the same two-by-two grid.
  // Use the actual DOM row nodes for baseline rather than cutting their HTML.
  const b=document.createElement('div');
  b.innerHTML=blogMarkup;
  const c=document.createElement('div');
  c.innerHTML=chatMarkup;
  fitHomePreview('blogTile',Array.from(b.children).slice(0,4).map(el=>el.outerHTML).join(''),blogMarkup);
  fitHomePreview('chatTile',Array.from(c.children).slice(0,3).map(el=>el.outerHTML).join(''),chatMarkup);

}

let newsMode = '전체';
function newsRows(){let q=(document.getElementById('nq')?.value||'').trim().toLowerCase();let source=newsMode==='서울 정비사업'?DATA.seoul.map(x=>({...x,kind:'뉴스',area:'서울 정비사업'})):DATA.news;let items=source.filter(x=>(newsMode==='서울 정비사업'||newsMode==='전체'||x.kind===newsMode)&&(!q||(x.title+' '+x.source+' '+x.summary+' '+(x.area||'')).toLowerCase().includes(q))).sort((a,b)=>b.date.localeCompare(a.date));if(!items.length)return `<div class="news-empty">등록된 ${esc(newsMode)} 소식이 없습니다.<small>검증된 새 글이 수집되면 여기에 표시됩니다.</small></div>`;return items.map(x=>`<a class="news-card" target="_blank" rel="noopener noreferrer" href="${esc(x.url)}" aria-label="게시글 원문 열기: ${esc(x.title)}"><div class="news-meta"><span class="news-tag">${x.kind==='뉴스'?'NEWS':x.kind==='블로그'?'BLOG':esc(x.kind)}</span>${badgeIfNew(newsMode==='서울 정비사업'?'seoul':'news',x.url)}<time>${esc(x.date.replaceAll('-','.'))}</time><span>·</span><span>${esc(x.source)}</span><span class="origin-note">· ${esc(x.area||'북아현')} · 원문 바로가기 ↗</span></div><div class="news-headline">${esc(x.title)}</div><p>${esc(x.summary||'관련 보도를 원문에서 확인할 수 있습니다.')}</p></a>`).join('')}

function newsDetail(){return `<div class="news-filter" role="group" aria-label="소식 유형">${['전체','뉴스','블로그','카페','서울 정비사업'].map(t=>`<button type="button" class="news-chip ${t===newsMode?'selected':''}" data-news-mode="${t}" aria-pressed="${t===newsMode}">${t}</button>`).join('')}</div><div class="seoul-search"><input id="nq" type="search" placeholder="북아현3구역 · 조합 · 이주 등 검색" aria-label="최근소식 검색"></div><div class="news-cards" id="newsItems">${newsRows()}</div>`}

function authorCards(items){return items.map(b=>{
  const posts=b.scope==='category'?b.posts.filter(p=>p.categoryNo===b.feedCategoryNo):b.posts;
  const preview=posts.slice(0,5).map(p=>`<a class="post" target="_blank" rel="noopener noreferrer" href="${esc(p.url)}">↗ ${badgeIfNew('blogs',p.url)}${esc(p.title)} ${p.date?`<small>(${esc(p.date)})</small>`:''}</a>`).join('');
  return `<div class="author"><h3>${esc(b.name)} ${posts.slice(0,5).some(p=>newIds.blogs.has(p.url))?newMark():''}</h3>${preview}<div class="bottom">${link(b.url,b.scope==='category'?'재개발 글 전체 보기 ↗':'블로그 모든 글 보기 ↗')}</div></div>`;
}).join('')}

function blogDetail(){return `<div class="filter"><input id="blogq" placeholder="블로거 이름·글 제목 검색" aria-label="블로그 검색"></div><div class="author-grid" id="authors">${authorCards(DATA.bloggers)}</div>`}

function chatDetail() {
  return newestFirst(CHAT_POSTS).map(post => `<details class="panel chat-brief">
    <summary>${badgeIfNew('chat', post.id)}${esc(post.title)}</summary><time class="chat-date">${esc(post.date)}</time>
    ${post.summary.split(/\n\n+/).map(block => {
      const [heading, ...body] = block.split('\n');
      return `<section class="brief-section ${/주요 공지 및 운영진 답변|운영진 직접 답변/.test(heading) ? 'response' : ''}"><h4>${esc(heading)}</h4><p>${linkedText(body.join('\n'))}</p></section>`;
    }).join('')}</details>`).join('') || '<p class="empty">등록된 톡방 요약이 없습니다.</p>';
}
function detailTrendChart(z){return '<div class="trend-wrap">'+trendChart(z,false)+'</div>';}

function priceDetail(){let rows=['3','2'].map(z=>{let s=snapshot(z),p=DATA.price[z],latest=latestPremium(z);return `<section class="panel"><h3>북아현${z}구역 · 매물 프리미엄(P)</h3><div class="stats3"><div class="metric"><small>최저 P (최초 자료)</small><strong>${money(s.min)}</strong></div><div class="metric accent"><small>평균 프리미엄</small><strong>${money(latest.value)}</strong></div><div class="metric"><small>최대 P (최초 자료)</small><strong>${money(s.max)}</strong></div></div><div class="compare">${changeHtml(z)} · 최근 기록일 ${latest.date}</div><div class="detail-trend"><h4>일별 평균 P 추이 · 최근 30일</h4>${detailTrendChart(z)}</div><p>${link(p.url,'네이버 부동산 매물 원문 ↗')}</p></section>`}).join('');let near=`<section class="panel"><h3>주변 아파트 최근 확인 실거래 · 전용 84㎡대</h3>${DATA.near.map(x=>`<div class="resultrow"><small>${esc(x.name)}</small><strong class="nearprice">${money(x.price)}</strong><div class="blurb">${esc(x.size)} · 계약 ${esc(x.date)} · ${esc(x.floor)} · ${x.name.includes('라첼스')?'입주권 여부 별도 확인':'매매 실거래'}</div>${link(x.url,'실거래 출처 ↗')}</div>`).join('')}<div class="footer">경희궁자이는 2단지, 마포래미안푸르지오는 2단지 기준입니다. 라첼스는 분양권/입주권 거래 가능성이 있어 기존 주택 매매와 동일 조건으로 비교하면 안 됩니다. 공식 국토교통부 자료와 계약해제 여부 재확인이 필요합니다.</div></section>`;return rows+near}

const routes = {
  news: ['북아현·서대문 최근소식', newsDetail, 'news'],
  seoul: ['서울 정비사업', newsDetail, 'seoul'],
  blogs: ['블로그', blogDetail, 'blogs'],
  prices: ['시세와 주변 실거래', priceDetail],
  chat: ['아현뚜방 브리핑', chatDetail, 'chat']
};
function renderRoute() {
  const page = location.hash.slice(1);
  const route = Object.hasOwn(routes, page) ? routes[page] : null;
  document.body.classList.toggle('view-home', !route);
  $('dashboard').hidden = Boolean(route);
  $('detail').hidden = !route;
  if (route) {
    if (page === 'seoul') newsMode = '서울 정비사업';
    else if (page === 'news') newsMode = '전체';
    $('detailContent').replaceChildren();
    $('detailTitle').textContent = route[0];
    $('detailContent').innerHTML = route[1]();
    if (route[2]) markSectionViewed(route[2]);
  } else {
    $('detailContent').replaceChildren();
    refreshNewIds();
    homeTiles();
  }
  window.scrollTo(0, 0);
}
document.addEventListener('click', event => {
  const navigation = event.target.closest('[data-page]');
  if (navigation) {
    const page = navigation.dataset.page;
    if (page === 'home') {
      history.replaceState(null, '', location.pathname + location.search);
      renderRoute();
    } else location.hash = page;
  }
  const filter = event.target.closest('[data-news-mode]');
  if (filter) {
    newsMode = filter.dataset.newsMode;
    markSectionViewed(newsMode === '서울 정비사업' ? 'seoul' : 'news');
    document.querySelectorAll('[data-news-mode]').forEach(button => {
      const active = button.dataset.newsMode === newsMode;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', active);
    });
    $('newsItems').innerHTML = newsRows();
  }
});
const briefingContainer = $('detailContent');
let briefingNavigation = 0;
briefingContainer.addEventListener('click', event => {
  const summary = event.target.closest('summary');
  const brief = summary?.parentElement;
  if (!brief?.matches('.chat-brief')) return;
  event.preventDefault();
  const shouldOpen = !brief.open;
  const navigation = ++briefingNavigation;
  // Finish collapsing the old content before calculating the new title position.
  briefingContainer.querySelectorAll('.chat-brief[open]').forEach(other => {
    if (other !== brief) other.open = false;
  });
  brief.open = shouldOpen;
  if (!shouldOpen) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (navigation !== briefingNavigation || !brief.isConnected || !brief.open) return;
    window.scrollTo({
      top: Math.max(0, summary.getBoundingClientRect().top + window.scrollY - 12),
      behavior: 'instant'
    });
  }));
});
briefingContainer.addEventListener('toggle', event => {
  const opened = event.target;
  if (!opened.matches?.('.chat-brief') || !opened.open) return;
  briefingContainer.querySelectorAll('.chat-brief[open]').forEach(other => {
    if (other !== opened) other.open = false;
  });
}, true);
document.addEventListener('input', event => {
  if (event.target.id === 'nq') $('newsItems').innerHTML = newsRows();
  if (event.target.id === 'blogq') {
    const query = event.target.value.toLowerCase().trim();
    $('authors').innerHTML = authorCards(DATA.bloggers.filter(blogger =>
      [blogger.name, blogger.id, ...bloggerPosts(blogger).map(post => post.title)].join(' ').toLowerCase().includes(query)));
  }
});
let homeResizeFrame=0;
window.addEventListener('resize',()=>{
  if(!$('dashboard').hidden) {
    cancelAnimationFrame(homeResizeFrame);
    homeResizeFrame=requestAnimationFrame(homeTiles);
  }
});
window.addEventListener('hashchange', renderRoute);
renderRoute();
