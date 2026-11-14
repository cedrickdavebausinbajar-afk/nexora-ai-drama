import './style.css';

const app = document.querySelector('#app');
const KEY = 'nexora-drama-demo-v1';
const seed = [
 {id:'welcome',title:'Your next drama starts here',episode:'COMING SOON',category:'Featured',creator:'NEXORA AI DRAMA',source:'',url:'',poster:'',description:'The video library is ready for your first authorized title.'}
];
let items = JSON.parse(localStorage.getItem(KEY) || 'null') || seed;
let liked = new Set(JSON.parse(localStorage.getItem('nexora-liked') || '[]'));
let active = 0;
let view = 'feed';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const save = () => localStorage.setItem(KEY, JSON.stringify(items));
const isDemo = x => x.id === 'welcome';

function shell(){ app.innerHTML = `
<header class="top"><div class="brand"><span class="mark">N</span><div><b>NEXORA</b><small>AI DRAMA</small></div></div>
<button class="gold-outline" id="adminOpen">OWNER</button></header>
<nav class="tabs"><button class="${view==='feed'?'active':''}" data-view="feed">DISCOVER</button><button class="${view==='search'?'active':''}" data-view="search">SEARCH</button><button class="${view==='saved'?'active':''}" data-view="saved">SAVED</button></nav>
<main id="screen"></main>
<footer>© ${new Date().getFullYear()} NEXORA AI DRAMA <span>Watch responsibly · Respect creators</span></footer>`;
app.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;render()});
document.querySelector('#adminOpen').onclick=adminGate;
renderScreen();
}
function render(){shell()}
function renderScreen(){
 const screen=document.querySelector('#screen'); if(!screen)return;
 if(view==='search'){screen.innerHTML=`<section class="panel"><h1>Find your next story</h1><input id="q" placeholder="Search drama titles or categories"><div id="results"></div></section>`; const q=document.querySelector('#q'); q.oninput=()=>{const v=q.value.toLowerCase();document.querySelector('#results').innerHTML=items.filter(x=>(x.title+' '+x.category).toLowerCase().includes(v)).map(card).join('')}; q.dispatchEvent(new Event('input'));return}
 if(view==='saved'){const saved=items.filter(x=>liked.has(x.id));screen.innerHTML=`<section class="panel"><h1>Your saved dramas</h1>${saved.length?saved.map(card).join(''):'<p class="muted">No saved dramas yet. Tap the heart on a video to save it.</p>'}</section>`;wireCards();return}
 if(!items.length){screen.innerHTML='<section class="empty"><div class="poster-logo">N</div><h1>No dramas published yet</h1><p>New authorized videos will appear here when the owner publishes them.</p><button class="gold" id="goAdmin">OPEN OWNER PANEL</button></section>';document.querySelector('#goAdmin').onclick=adminGate;return}
 active=Math.min(active,items.length-1);
 const x=items[active]; screen.innerHTML=`<section class="player-wrap"><div class="player" id="player">${x.url?`<video src="${esc(x.url)}" controls playsinline preload="metadata" poster="${esc(x.poster||'')}" ></video>`:`<div class="placeholder"><span class="poster-logo">N</span><p>${esc(x.category||'DRAMA')}</p><h2>${esc(x.title)}</h2><small>${esc(x.description||'Video preview will appear here')}</small></div>`}
 <div class="shade"></div><div class="meta"><span class="tag">${esc(x.category||'DRAMA')}</span><h2>${esc(x.title)}</h2><p>${esc(x.episode||'EPISODE 1')} · ${esc(x.creator||'Creator not listed')}</p>${x.source?`<a href="${esc(x.source)}" target="_blank" rel="noopener">Original source ↗</a>`:''}</div>
 <div class="actions"><button id="like" class="action">${liked.has(x.id)?'♥':'♡'}<small>LIKE</small></button><button id="share" class="action">↗<small>SHARE</small></button><button id="next" class="action">⌄<small>NEXT</small></button></div>
 </div><div class="feed-controls"><button id="prev" ${active===0?'disabled':''}>↑ PREVIOUS</button><span>${active+1} / ${items.length}</span><button id="nextText" ${active===items.length-1?'disabled':''}>NEXT ↓</button></div>
 <p class="credit">Creator credit: ${esc(x.creator||'Not provided')} · <b>Only use videos with permission or a valid license.</b></p></section>`;
 document.querySelector('#like').onclick=()=>{liked.has(x.id)?liked.delete(x.id):liked.add(x.id);localStorage.setItem('nexora-liked',JSON.stringify([...liked]));renderScreen()};
 document.querySelector('#share').onclick=async()=>{const data={title:x.title,text:`Watch ${x.title} on NEXORA AI DRAMA`,url:x.source||location.href};if(navigator.share){try{await navigator.share(data)}catch{}}else alert('Sharing is not available on this device yet.')};
 const next=()=>{if(active<items.length-1){active++;renderScreen()}};
 const prev=()=>{if(active>0){active--;renderScreen()}};
 document.querySelector('#next').onclick=next;document.querySelector('#nextText').onclick=next;document.querySelector('#prev').onclick=prev;
}
function card(x){return `<article class="rowcard"><div class="mini-poster">N</div><div><b>${esc(x.title)}</b><small>${esc(x.category)} · ${esc(x.episode||'')}</small><p>${esc(x.creator||'Creator not listed')}</p></div></article>`}
function wireCards(){}
function adminGate(){const pin=prompt('Owner demo access: enter demo PIN 2468');if(pin==='2468'){view='admin';renderAdmin()}else if(pin!==null)alert('Incorrect demo PIN.');}
function renderAdmin(){
 app.innerHTML=`<header class="top"><div class="brand"><span class="mark">N</span><div><b>NEXORA</b><small>PRIVATE OWNER PANEL · DEMO</small></div></div><button class="gold-outline" id="back">VIEW APP</button></header>
 <main class="admin"><section class="panel"><div class="eyebrow">CONTENT MANAGEMENT</div><h1>Owner dashboard</h1><p class="muted">Add video links only when you have written permission or a license for in-app playback.</p>
 <form id="addForm"><label>Drama title<input name="title" required placeholder="e.g. The Secret Heiress"></label><div class="two"><label>Episode<input name="episode" placeholder="Episode 1"></label><label>Category<select name="category"><option>Romance</option><option>Revenge</option><option>Family</option><option>Comedy</option><option>Action</option><option>Thriller</option><option>Other</option></select></label></div>
 <label>Direct video URL (MP4 or supported stream)<input name="url" type="url" required placeholder="https://your-authorized-host/video.mp4"></label>
 <label>Poster image URL (optional)<input name="poster" type="url" placeholder="https://..."></label><div class="two"><label>Creator name<input name="creator" required placeholder="Original creator"></label><label>Original source URL<input name="source" type="url" required placeholder="https://original-post..."></label></div>
 <label class="check"><input name="permission" type="checkbox" required> I confirm I have permission or a license for this video to be played in this app.</label><button class="gold" type="submit">PUBLISH DRAMA</button></form></section>
 <section class="panel"><h2>Published videos (${items.filter(x=>!isDemo(x)).length})</h2><div id="adminList">${items.filter(x=>!isDemo(x)).map(x=>`<div class="adminrow"><div><b>${esc(x.title)}</b><small>${esc(x.episode)} · ${esc(x.category)} · ${esc(x.creator)}</small></div><button data-delete="${esc(x.id)}" class="delete">REMOVE</button></div>`).join('')||'<p class="muted">No videos published yet.</p>'}</div></section>
 <p class="warning">Prototype notice: this demo stores entries only in this browser. The PIN is not secure authentication. A real private admin panel and shared database must be connected before public release.</p></main>`;
 document.querySelector('#back').onclick=()=>{view='feed';render()};
 document.querySelector('#addForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.currentTarget);const x=Object.fromEntries(f.entries());x.id=crypto.randomUUID();items=items.filter(i=>!isDemo(i));items.push(x);save();renderAdmin()};
 document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{items=items.filter(x=>x.id!==b.dataset.delete);save();renderAdmin()});
}
shell();
