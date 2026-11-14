import './style.css';

const app = document.querySelector('#app');
const KEY = 'nexora-drama-demo-v2';
const seed = [
  {
    id: 'sintel-demo',
    title: 'Sintel: The Dragon Search',
    episode: 'COMPLETE SHORT FILM',
    category: 'Fantasy',
    creator: 'Blender Foundation',
    source: 'https://durian.blender.org/',
    license: 'Creative Commons Attribution 3.0',
    url: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
    poster: 'https://storage.googleapis.com/gtv-videos-bucket/sample/images/Sintel.jpg',
    description: 'An animated fantasy adventure. Official open movie by the Blender Foundation.'
  },
  {
    id: 'big-buck-bunny-demo',
    title: 'Big Buck Bunny',
    episode: 'COMPLETE SHORT FILM',
    category: 'Family',
    creator: 'Blender Foundation',
    source: 'https://peach.blender.org/',
    license: 'Creative Commons Attribution 3.0',
    url: 'https://media.w3.org/2010/05/bunny/trailer.mp4',
    poster: 'https://storage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg',
    description: 'A playful animated short about a gentle giant bunny. Open movie by the Blender Foundation.'
  }
];

function readItems() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
    return Array.isArray(stored) && stored.length ? stored : seed;
  } catch {
    return seed;
  }
}
let items = readItems();
let liked = new Set();
try { liked = new Set(JSON.parse(localStorage.getItem('nexora-liked') || '[]')); } catch {}
let active = 0;
let view = 'feed';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const save = () => localStorage.setItem(KEY, JSON.stringify(items));
const isDemo = x => String(x.id).endsWith('-demo');

function shell() {
  app.innerHTML = `
<header class="top"><div class="brand"><span class="mark">N</span><div><b>NEXORA</b><small>AI DRAMA</small></div></div>
<button class="gold-outline" id="adminOpen">OWNER</button></header>
<nav class="tabs"><button class="${view==='feed'?'active':''}" data-view="feed">DISCOVER</button><button class="${view==='search'?'active':''}" data-view="search">SEARCH</button><button class="${view==='saved'?'active':''}" data-view="saved">SAVED</button></nav>
<main id="screen"></main>
<footer>© ${new Date().getFullYear()} NEXORA AI DRAMA <span>Demo films by Blender Foundation · CC BY 3.0 · Watch responsibly</span></footer>`;
  app.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { view = b.dataset.view; render(); });
  document.querySelector('#adminOpen').onclick = adminGate;
  renderScreen();
}
function render() { shell(); }
function renderScreen() {
  const screen = document.querySelector('#screen');
  if (!screen) return;
  if (view === 'search') {
    screen.innerHTML = `<section class="panel"><h1>Find your next story</h1><input id="q" placeholder="Search drama titles or categories"><div id="results"></div></section>`;
    const q = document.querySelector('#q');
    q.oninput = () => {
      const v = q.value.toLowerCase();
      const matches = items.filter(x => (x.title+' '+x.category+' '+x.creator).toLowerCase().includes(v));
      document.querySelector('#results').innerHTML = matches.map(x => card(x)).join('') || '<p class="muted">No matching videos.</p>';
      wireCards();
    };
    q.dispatchEvent(new Event('input'));
    return;
  }
  if (view === 'saved') {
    const saved = items.filter(x => liked.has(x.id));
    screen.innerHTML = `<section class="panel"><h1>Your saved dramas</h1>${saved.length?saved.map(x=>card(x)).join(''):'<p class="muted">No saved dramas yet. Tap the heart on a video to save it.</p>'}</section>`;
    wireCards();
    return;
  }
  if (!items.length) {
    screen.innerHTML = '<section class="empty"><div class="poster-logo">N</div><h1>No videos available</h1><p>Check back when new authorized videos are published.</p></section>';
    return;
  }
  active = Math.min(active, items.length - 1);
  const x = items[active];
  screen.innerHTML = `<section class="player-wrap">
<div class="player" id="player">
  <video id="dramaVideo" controls playsinline webkit-playsinline preload="auto" poster="${esc(x.poster||'')}">
    <source src="${esc(x.url||'')}" type="video/mp4">
    Your device cannot play this video.
  </video>
  <div class="play-overlay" id="playOverlay"><button type="button" id="startPlayback">▶ PLAY VIDEO</button><small id="playStatus">Tap to start watching</small></div>
  <div class="shade"></div>
  <div class="meta"><span class="tag">${esc(x.category||'DRAMA')}</span><h2>${esc(x.title)}</h2>
  <p>${esc(x.episode||'EPISODE 1')} · ${esc(x.creator||'Creator not listed')}</p>
  ${x.source?`<a href="${esc(x.source)}" target="_blank" rel="noopener">Creator / film website ↗</a>`:''}
  <small class="license">${esc(x.license||'Creator-authorized video')}</small></div>
  <div class="actions"><button id="like" class="action">${liked.has(x.id)?'♥':'♡'}<small>SAVE</small></button><button id="share" class="action">↗<small>SHARE</small></button></div>
  <div id="videoError" class="video-error" hidden>Video could not load. Check your internet connection, then tap RETRY.<button id="retryVideo" type="button">RETRY</button></div>
</div>
<div class="feed-controls"><button id="prev" ${active===0?'disabled':''}>↑ PREVIOUS</button><span>${active+1} / ${items.length}</span><button id="nextText" ${active===items.length-1?'disabled':''}>NEXT ↓</button></div>
<p class="credit">Credit: ${esc(x.creator||'Not provided')} · ${esc(x.license||'Authorized content')}. <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">License details</a></p>
</section>`;
  const video = document.querySelector('#dramaVideo');
  const overlay = document.querySelector('#playOverlay');
  const status = document.querySelector('#playStatus');
  const errorBox = document.querySelector('#videoError');
  const startButton = document.querySelector('#startPlayback');
  const startPlayback = async () => {
    errorBox.hidden = true;
    status.textContent = 'Loading video…';
    startButton.disabled = true;
    try {
      await video.play();
      overlay.classList.add('playing');
    } catch (err) {
      startButton.disabled = false;
      status.textContent = 'Tap PLAY VIDEO to try again';
      if (video.error) errorBox.hidden = false;
    }
  };
  startButton.onclick = startPlayback;
  video.addEventListener('playing', () => { overlay.classList.add('playing'); errorBox.hidden = true; });
  video.addEventListener('waiting', () => { status.textContent = 'Buffering…'; });
  video.addEventListener('canplay', () => { status.textContent = 'Ready to play'; startButton.disabled = false; });
  video.addEventListener('pause', () => { overlay.classList.remove('playing'); });
  video.addEventListener('ended', () => { overlay.classList.remove('playing'); status.textContent = 'Video finished'; });
  video.addEventListener('error', () => {
    errorBox.hidden = false;
    overlay.classList.remove('playing');
    status.textContent = 'Unable to load video';
    startButton.disabled = false;
  });
  document.querySelector('#retryVideo').onclick = () => {
    errorBox.hidden = true;
    status.textContent = 'Retrying…';
    video.load();
  };
  document.querySelector('#like').onclick = () => {
    liked.has(x.id) ? liked.delete(x.id) : liked.add(x.id);
    localStorage.setItem('nexora-liked', JSON.stringify([...liked]));
    renderScreen();
  };
  document.querySelector('#share').onclick = async () => {
    const data = {title:x.title,text:`Watch ${x.title} on NEXORA AI DRAMA`,url:x.source||location.href};
    if (navigator.share) { try { await navigator.share(data); } catch {} }
    else if (navigator.clipboard) { try { await navigator.clipboard.writeText(data.url); alert('Link copied.'); } catch { alert('Sharing is not available on this device yet.'); } }
    else alert('Sharing is not available on this device yet.');
  };
  const next = () => { if (active < items.length-1) { active++; renderScreen(); } };
  const prev = () => { if (active > 0) { active--; renderScreen(); } };
  document.querySelector('#nextText').onclick = next;
  document.querySelector('#prev').onclick = prev;
}
function card(x) {
  return `<article class="rowcard"><img class="mini-poster" src="${esc(x.poster||'')}" alt="" onerror="this.style.display='none'"><div><b>${esc(x.title)}</b><small>${esc(x.category)} · ${esc(x.episode||'')}</small><p>${esc(x.creator||'Creator not listed')}</p><button class="gold-outline" data-play="${esc(x.id)}">WATCH</button></div></article>`;
}
function wireCards() {
  document.querySelectorAll('[data-play]').forEach(b => b.onclick = () => {
    const index = items.findIndex(x => x.id === b.dataset.play);
    if (index >= 0) { active = index; view = 'feed'; render(); }
  });
}
function adminGate() {
  const pin = prompt('Owner demo access: enter demo PIN 2468');
  if (pin === '2468') { view = 'admin'; renderAdmin(); }
  else if (pin !== null) alert('Incorrect demo PIN.');
}
function renderAdmin() {
  app.innerHTML = `<header class="top"><div class="brand"><span class="mark">N</span><div><b>NEXORA</b><small>PRIVATE OWNER PANEL · DEMO</small></div></div><button class="gold-outline" id="back">VIEW APP</button></header>
<main class="admin"><section class="panel"><div class="eyebrow">CONTENT MANAGEMENT</div><h1>Owner dashboard</h1><p class="muted">Add video links only when you have written permission or a license for in-app playback.</p>
<form id="addForm"><label>Drama title<input name="title" required placeholder="e.g. The Secret Heiress"></label><div class="two"><label>Episode<input name="episode" placeholder="Episode 1"></label><label>Category<select name="category"><option>Romance</option><option>Revenge</option><option>Family</option><option>Comedy</option><option>Action</option><option>Thriller</option><option>Fantasy</option><option>Other</option></select></label></div>
<label>Direct video URL (MP4 or supported stream)<input name="url" type="url" required placeholder="https://your-authorized-host/video.mp4"></label><label>Poster image URL (optional)<input name="poster" type="url" placeholder="https://..."></label>
<div class="two"><label>Creator name<input name="creator" required placeholder="Original creator"></label><label>Original source URL<input name="source" type="url" required placeholder="https://original-post..."></label></div>
<label class="check"><input name="permission" type="checkbox" required> I confirm I have permission or a license for this video to be played in this app.</label><button class="gold" type="submit">PUBLISH DRAMA</button></form></section>
<section class="panel"><h2>Published videos (${items.filter(x=>!isDemo(x)).length})</h2><div id="adminList">${items.filter(x=>!isDemo(x)).map(x=>`<div class="adminrow"><div><b>${esc(x.title)}</b><small>${esc(x.episode)} · ${esc(x.category)} · ${esc(x.creator)}</small></div><button data-delete="${esc(x.id)}" class="delete">REMOVE</button></div>`).join('')||'<p class="muted">No owner videos published yet.</p>'}</div></section>
<p class="warning">Prototype notice: this demo stores entries only in this browser. The PIN is not secure authentication. A real private owner panel and shared database are required before public release.</p></main>`;
  document.querySelector('#back').onclick = () => { view='feed'; render(); };
  document.querySelector('#addForm').onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const x = Object.fromEntries(f.entries());
    x.id = crypto.randomUUID();
    x.license = 'Owner-confirmed permission';
        items.push(x);
    save();
    renderAdmin();
  };
  document.querySelectorAll('[data-delete]').forEach(b => b.onclick = () => {
    items = items.filter(x => x.id !== b.dataset.delete);
    save();
    renderAdmin();
  });
}
shell();
