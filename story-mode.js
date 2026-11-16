const STORE = 'nexora-story-mode-v1';
const MAX_TITLE = 90, MAX_SUMMARY = 500, MAX_CHAPTER_TITLE = 100, MAX_CHAPTER_BODY = 30000;
const uid = () => (globalThis.crypto?.randomUUID?.() || 'story-' + Date.now() + '-' + Math.random().toString(36).slice(2));
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const clean = value => String(value ?? '').trim();
const SAMPLE_STORIES = [
  {
    id:'nexora-sample-midnight-promise', title:'THE MIDNIGHT PROMISE', genre:'Romance · Mystery',
    summary:'A forgotten letter brings two former best friends together—and reveals why one of them disappeared.',
    chapters:[
      {title:'The Letter at the Door',body:'Rain tapped against the windows when Elena found the envelope beneath her apartment door. There was no return address, only her name written in the careful handwriting she had not seen in eight years.\n\nInside was a photograph of the old seaside station and a single sentence: “I kept the promise. Meet me where we said goodbye.”\n\nElena almost threw it away. Almost. But the tiny silver star drawn beneath the message belonged to only one person: Daniel Reyes, the boy who had vanished the summer her family left town.\n\nAt midnight, she stood beneath the station clock. A figure stepped from the rain. “You came,” Daniel whispered. Elena held up the photograph. “You owe me eight years of answers.”'},
      {title:'A Name from the Past',body:'Daniel did not ask her to forgive him. He only handed her a second envelope, sealed with the same silver star.\n\n“My father told me to stay away,” he said. “He said your family would be safer if I disappeared.”\n\nElena opened the envelope. Inside was a newspaper clipping about the fire that had destroyed her father’s workshop. A name had been circled in red: Reyes.\n\nShe looked up, suddenly cold. “Your family was involved?”\n\nDaniel shook his head. “My father tried to stop it. And the person who started it is still looking for the original evidence.” A car slowed at the far end of the platform. Daniel took her hand. “We have to go. Now.”'}
    ], status:'published', saved:false
  },
  {
    id:'nexora-sample-glass-heiress', title:'THE GLASS HEIRESS', genre:'Drama · Family',
    summary:'Raised far from wealth, a young artist discovers that the portrait she inherited hides her family’s greatest secret.',
    chapters:[
      {title:'The Portrait',body:'Mira had never liked the portrait. The woman in the painting wore a pearl necklace and looked toward a window that did not exist in the room. When the lawyer delivered it with her grandmother’s final belongings, he said only, “She wanted you to have this before the house is sold.”\n\nThat evening, Mira noticed a thin line beneath the painted frame. A small brass key had been taped to the back, along with a note: “The truth is not in the picture. It is behind it.”\n\nShe turned the frame over and found a folded document hidden inside the wooden backing. The first line carried a name she recognized from the city’s tallest building: Adrian Vale.'},
      {title:'The Locked Room',body:'The key opened a narrow cabinet in her grandmother’s study. Inside were letters, bank records, and a photograph of two babies wrapped in identical blankets. On the back, someone had written: “One daughter stayed. One daughter was sent away.”\n\nMira read the date twice. It was the day she was born.\n\nA floorboard creaked behind her. Her aunt stood in the doorway, pale and motionless. “You were never supposed to find that,” she said.\n\nMira held up the photograph. “Then tell me which baby I am.” Her aunt closed the door. “First, you need to know why your grandmother chose you.”'}
    ], status:'published', saved:false
  }
];
function loadStories() {
  try {
    const value = JSON.parse(localStorage.getItem(STORE) || '[]');
    if (Array.isArray(value) && value.some(s => s && typeof s.id === 'string' && Array.isArray(s.chapters))) {
      return value.filter(s => s && typeof s.id === 'string' && Array.isArray(s.chapters));
    }
    const now = new Date().toISOString();
    const samples = SAMPLE_STORIES.map(s => ({...s, chapters:s.chapters.map(ch => ({...ch})), createdAt:now, updatedAt:now}));
    localStorage.setItem(STORE, JSON.stringify(samples));
    return samples;
  } catch { return SAMPLE_STORIES.map(s => ({...s, chapters:s.chapters.map(ch => ({...ch})), createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()})); }
}
function saveStories(stories) {
  try { localStorage.setItem(STORE, JSON.stringify(stories)); return true; }
  catch { return false; }
}
function formatDate(value) {
  try { return new Intl.DateTimeFormat(undefined,{dateStyle:'medium'}).format(new Date(value)); }
  catch { return ''; }
}
export function renderStoryMode(root, onBack) {
  let stories = loadStories();
  let page = 'library';
  let activeId = null;
  let chapterIndex = 0;
  let filter = 'all';
  const find = id => stories.find(s => s.id === id);
  const persist = () => {
    if (!saveStories(stories)) {
      alert('Your device storage is full. Copy your writing somewhere safe, then remove unused files and try again.');
      return false;
    }
    return true;
  };
  const goLibrary = () => { page='library'; render(); };
  const render = () => {
    if (page === 'library') {
      const visible = stories.filter(s => filter === 'all' || (filter === 'saved' ? s.saved : filter === 'drafts' ? s.status !== 'published' : s.status === 'published'));
      root.innerHTML = `<section class="story-shell">
        <div class="story-heading"><div><span class="story-kicker">NEXORA ORIGINAL READING</span><h1>Story Mode</h1><p>Pick a story to read, or write one of your own.</p></div><div class="story-heading-actions"><button class="gold-outline" id="storyRead">▤ READ STORIES</button><button class="gold story-create" id="storyCreate">＋ CREATE STORY</button></div></div>
        <div class="story-notice"><strong>Your writing stays on this device.</strong> Stories and drafts are saved in this app's local storage. They do not sync to other phones or publish online yet. Back up important writing separately.</div>
        <div class="story-filters" role="group" aria-label="Filter stories">
          <button data-filter="all" class="${filter==='all'?'active':''}">ALL STORIES</button>
          <button data-filter="published" class="${filter==='published'?'active':''}">PUBLISHED HERE</button>
          <button data-filter="drafts" class="${filter==='drafts'?'active':''}">DRAFTS</button>
          <button data-filter="saved" class="${filter==='saved'?'active':''}">SAVED</button>
        </div>
        <label class="story-search-label" for="storySearch">Search stories</label><input id="storySearch" class="story-input" placeholder="Search by title, genre, or description">
        <div class="story-grid" id="storyGrid">${visible.length ? visible.map(s => `<article class="story-card">
          <div class="story-cover"><span>N</span><small>${esc(s.genre || 'DRAMA')}</small></div>
          <div class="story-card-copy"><span class="story-state">${s.status==='published'?'PUBLISHED ON THIS DEVICE':'DRAFT'}</span><h2>${esc(s.title)}</h2><p>${esc(s.summary || 'No description yet.')}</p><small>${s.chapters.length} chapter${s.chapters.length===1?'':'s'} · Updated ${formatDate(s.updatedAt)}</small>
          <div class="story-card-actions"><button class="gold-outline" data-read="${esc(s.id)}">${s.chapters.length?'READ':'OPEN'}</button><button class="story-text-button" data-edit="${esc(s.id)}">EDIT</button><button class="story-text-button" data-save="${esc(s.id)}">${s.saved?'♥ SAVED':'♡ SAVE'}</button></div></div>
        </article>`).join('') : '<div class="story-empty"><h2>Your bookshelf is waiting.</h2><p>Create your first story or change the filter to see your writing.</p><button class="gold" id="storyEmptyCreate">WRITE YOUR FIRST STORY</button></div>'}</div>
      </section>`;
      root.querySelector('#storyRead')?.addEventListener('click',()=>{filter='published';render();});
      root.querySelector('#storyCreate')?.addEventListener('click',()=>{activeId=null;page='write';render();});
      root.querySelector('#storyEmptyCreate')?.addEventListener('click',()=>{activeId=null;page='write';render();});
      root.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;render();}));
      root.querySelectorAll('[data-read]').forEach(b=>b.addEventListener('click',()=>{activeId=b.dataset.read;chapterIndex=0;page='reader';render();}));
      root.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>{activeId=b.dataset.edit;page='edit';render();}));
      root.querySelectorAll('[data-save]').forEach(b=>b.addEventListener('click',()=>{const s=find(b.dataset.save);if(s){s.saved=!s.saved;s.updatedAt=new Date().toISOString();persist();render();}}));
      root.querySelector('#storySearch')?.addEventListener('input',e=>{
        const q=e.target.value.toLowerCase();
        root.querySelector('#storyGrid').innerHTML=visible.filter(s=>(s.title+' '+s.genre+' '+s.summary).toLowerCase().includes(q)).map(s=>`<article class="story-card"><div class="story-cover"><span>N</span><small>${esc(s.genre||'DRAMA')}</small></div><div class="story-card-copy"><span class="story-state">${s.status==='published'?'PUBLISHED ON THIS DEVICE':'DRAFT'}</span><h2>${esc(s.title)}</h2><p>${esc(s.summary||'No description yet.')}</p><small>${s.chapters.length} chapter${s.chapters.length===1?'':'s'}</small><div class="story-card-actions"><button class="gold-outline" data-read="${esc(s.id)}">OPEN</button><button class="story-text-button" data-edit="${esc(s.id)}">EDIT</button></div></div></article>`).join('') || '<p class="story-empty">No matching stories.</p>';
        root.querySelectorAll('[data-read]').forEach(b=>b.addEventListener('click',()=>{activeId=b.dataset.read;chapterIndex=0;page='reader';render();}));
        root.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>{activeId=b.dataset.edit;page='edit';render();}));
      });
      return;
    }
    if (page === 'write') {
      root.innerHTML = `<section class="panel story-form-panel"><button class="gold-outline" id="storyBack">← BOOKSHELF</button><span class="story-kicker">NEW CREATION</span><h1>Write your story</h1><p class="muted">Start with a title and a short introduction. You can add chapters next.</p>
        <form id="storyForm" class="story-form">
          <label for="newStoryTitle">Story title</label><input id="newStoryTitle" name="title" class="story-input" maxlength="${MAX_TITLE}" required placeholder="e.g. The Promise We Buried">
          <label for="newStoryGenre">Genre</label><select id="newStoryGenre" name="genre" class="story-input"><option>Romance</option><option>Drama</option><option>Mystery</option><option>Fantasy</option><option>Thriller</option><option>Comedy</option><option>Young Adult</option><option>Other</option></select>
          <label for="newStorySummary">Description</label><textarea id="newStorySummary" name="summary" class="story-input" maxlength="${MAX_SUMMARY}" rows="4" placeholder="What is your story about?"></textarea>
          <div class="story-form-actions"><button class="gold" type="submit">CREATE DRAFT</button><button class="gold-outline" type="button" id="storyCancel">CANCEL</button></div>
        </form>
      </section>`;
      root.querySelector('#storyBack').onclick=goLibrary;root.querySelector('#storyCancel').onclick=goLibrary;
      root.querySelector('#storyForm').onsubmit=e=>{
        e.preventDefault();const data=new FormData(e.currentTarget);const title=clean(data.get('title'));
        if(!title || title.length>MAX_TITLE){alert('Enter a story title (up to 90 characters).');return;}
        const now=new Date().toISOString();const story={id:uid(),title,genre:clean(data.get('genre')),summary:clean(data.get('summary')).slice(0,MAX_SUMMARY),chapters:[],status:'draft',saved:false,createdAt:now,updatedAt:now};
        stories.unshift(story);if(!persist()){stories.shift();return;}activeId=story.id;page='edit';render();
      };
      return;
    }
    if (page === 'reader') {
      const s=find(activeId);if(!s){goLibrary();return;}
      const chapter=s.chapters[chapterIndex];
      root.innerHTML = `<section class="story-reader">
        <div class="story-reader-top"><button class="gold-outline" id="readerBack">← BOOKSHELF</button><button class="story-text-button" id="readerSave">${s.saved?'♥ SAVED':'♡ SAVE STORY'}</button></div>
        <span class="story-kicker">${esc(s.genre||'NEXORA STORY')} · ${s.chapters.length} CHAPTERS</span><h1>${esc(s.title)}</h1><p class="story-summary">${esc(s.summary)}</p>
        ${chapter ? `<article class="story-chapter"><span>CHAPTER ${chapterIndex+1} OF ${s.chapters.length}</span><h2>${esc(chapter.title)}</h2><div class="story-prose">${esc(chapter.body).replace(/\n/g,'<br>')}</div></article>` : '<div class="story-empty"><h2>No chapters yet</h2><p>The writer has not added a chapter.</p></div>'}
        <div class="story-reader-nav"><button class="gold-outline" id="chapterPrev" ${chapterIndex<=0?'disabled':''}>← PREVIOUS</button><span>${chapter ? chapterIndex+1+' / '+s.chapters.length : '—'}</span><button class="gold" id="chapterNext" ${chapterIndex>=s.chapters.length-1?'disabled':''}>NEXT →</button></div>
      </section>`;
      root.querySelector('#readerBack').onclick=goLibrary;
      root.querySelector('#readerSave').onclick=()=>{s.saved=!s.saved;persist();render();};
      root.querySelector('#chapterPrev').onclick=()=>{chapterIndex=Math.max(0,chapterIndex-1);render();};
      root.querySelector('#chapterNext').onclick=()=>{chapterIndex=Math.min(s.chapters.length-1,chapterIndex+1);render();};
      return;
    }
    if (page === 'edit') {
      const s=find(activeId);if(!s){goLibrary();return;}
      root.innerHTML = `<section class="panel story-editor">
        <div class="story-reader-top"><button class="gold-outline" id="editorBack">← BOOKSHELF</button><span class="story-state">${s.status==='published'?'PUBLISHED HERE':'DRAFT'}</span></div>
        <span class="story-kicker">STORY WORKSPACE</span><h1>${esc(s.title)}</h1><p class="muted">Your changes are saved on this device.</p>
        <form id="chapterForm" class="story-form"><label for="chapterTitle">Chapter title</label><input id="chapterTitle" class="story-input" maxlength="${MAX_CHAPTER_TITLE}" required placeholder="Chapter 1 — A New Beginning"><label for="chapterBody">Chapter text</label><textarea id="chapterBody" class="story-input story-body-input" rows="12" maxlength="${MAX_CHAPTER_BODY}" required placeholder="Start writing your chapter here…"></textarea><small class="muted">Up to 30,000 characters per chapter.</small><button class="gold" type="submit">SAVE CHAPTER</button></form>
        <h2>Chapters (${s.chapters.length})</h2><ol class="story-chapter-list">${s.chapters.map((c,i)=>`<li><span><b>${i+1}. ${esc(c.title)}</b><small>${c.body.length.toLocaleString()} characters</small></span><button class="story-text-button" data-open-chapter="${i}">PREVIEW</button></li>`).join('')||'<li class="muted">No chapters yet. Write your first one above.</li>'}</ol>
        <div class="story-form-actions"><button class="gold" id="storyPublish" ${s.chapters.length?'':'disabled'}>${s.status==='published'?'UNPUBLISH':'PUBLISH ON THIS DEVICE'}</button><button class="delete" id="storyDelete">DELETE STORY</button></div>
        <p class="story-notice"><strong>Publishing here is local only.</strong> It makes the story visible in this app on this device; it does not upload it to a public website or other users.</p>
      </section>`;
      root.querySelector('#editorBack').onclick=goLibrary;
      root.querySelector('#chapterForm').onsubmit=e=>{
        e.preventDefault();const title=clean(root.querySelector('#chapterTitle').value);const body=clean(root.querySelector('#chapterBody').value);
        if(!title||!body){alert('Add a chapter title and chapter text first.');return;}
        if(body.length>MAX_CHAPTER_BODY){alert('This chapter is too long.');return;}
        s.chapters.push({id:uid(),title,body,createdAt:new Date().toISOString()});s.updatedAt=new Date().toISOString();
        if(persist()){page='edit';render();}
      };
      root.querySelectorAll('[data-open-chapter]').forEach(b=>b.onclick=()=>{chapterIndex=Number(b.dataset.openChapter);page='reader';render();});
      root.querySelector('#storyPublish').onclick=()=>{if(!s.chapters.length)return;s.status=s.status==='published'?'draft':'published';s.updatedAt=new Date().toISOString();if(persist())render();};
      root.querySelector('#storyDelete').onclick=()=>{if(!confirm('Delete this story and all its chapters from this device? This cannot be undone.'))return;stories=stories.filter(x=>x.id!==s.id);persist();goLibrary();};
      return;
    }
  };
  render();
}
