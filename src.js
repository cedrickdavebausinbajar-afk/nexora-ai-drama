import './style.css';
import { renderStoryMode } from './story-mode.js';
import { Browser } from '@capacitor/browser';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileTransfer } from '@capacitor/file-transfer';
const NEXORA_GA_ID = 'G-VYQZ6HT0RD';
const NEXORA_PLATFORM = Capacitor.isNativePlatform() ? 'android' : 'web';
if (typeof window !== 'undefined') {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function(){window.dataLayer.push(arguments);};
  window.gtag('js', new Date());
  window.gtag('config', NEXORA_GA_ID, {
    app_name: 'NEXORA AI DRAMA',
    app_platform: NEXORA_PLATFORM
  });
}
function trackNexoraEvent(eventName, params = {}) {
  try {
    window.gtag?.('event', eventName, {
      app_name: 'NEXORA AI DRAMA',
      app_platform: NEXORA_PLATFORM,
      ...params
    });
  } catch (_) {}
}


const ApkInstaller = registerPlugin('ApkInstaller');
const UPDATE_APK_PATH = 'nexora-ai-drama-update.apk';
let updateDownload = {status:'idle', path:'', message:''};
let updateDownloadPromise = null;
async function downloadUpdate() {
  trackNexoraEvent('apk_update_download', {app_version: updateInfo.latest || 'unknown'});

  if (updateDownloadPromise) return updateDownloadPromise;
  if (!updateInfo.url) throw new Error('The official APK download is not available.');
  updateDownload.status = 'downloading';
  updateDownload.message = 'Downloading update into app storage…';
  refreshUpdateUI();
  updateDownloadPromise = (async () => {
    try {
      const target = await Filesystem.getUri({directory:Directory.Cache, path:UPDATE_APK_PATH});
      try { await Filesystem.deleteFile({directory:Directory.Cache, path:UPDATE_APK_PATH}); } catch {}
      const result = await FileTransfer.downloadFile({url:updateInfo.url, path:target.uri, progress:true});
      updateDownload = {status:'ready', path:result.path || target.uri, message:'Update downloaded. Ready to install.'};
      refreshUpdateUI();
      return updateDownload;
    } catch (error) {
      updateDownload = {status:'error', path:'', message:'Download failed. Check your connection and try again.'};
      refreshUpdateUI();
      throw error;
    } finally { updateDownloadPromise = null; }
  })();
  return updateDownloadPromise;
}
function refreshUpdateUI() {
  const status = document.querySelector('#updateStatus');
  if (status && updateDownload.status !== 'idle') status.textContent = updateDownload.message;
  const action = document.querySelector('#updateAction');
  if (action && updateInfo.status === 'available') {
    action.hidden = false;
    action.textContent = updateDownload.status === 'ready' ? 'INSTALL UPDATE' : updateDownload.status === 'downloading' ? 'DOWNLOADING…' : 'DOWNLOAD UPDATE';
    action.disabled = updateDownload.status === 'downloading';
  }
  const popupAction = document.querySelector('#popupUpdateNow');
  if (popupAction && updateInfo.status === 'available') {
    popupAction.textContent = updateDownload.status === 'ready' ? 'INSTALL UPDATE' : updateDownload.status === 'downloading' ? 'DOWNLOADING…' : 'DOWNLOAD UPDATE';
    popupAction.disabled = updateDownload.status === 'downloading';
  }
}
async function startUpdateFlow() {
  try {
    if (!Capacitor.isNativePlatform()) { if (updateInfo.url) await Browser.open({url:updateInfo.url}); return; }
    if (updateDownload.status !== 'ready') await downloadUpdate();
    const result = await ApkInstaller.install({filePath:updateDownload.path});
    if (result?.needsPermission) {
      alert('Allow NEXORA AI DRAMA to install updates on the next Android screen, then return to the app and tap INSTALL UPDATE again.');
    }
  } catch (error) {
    alert(updateDownload.message || 'The update could not be started. Please try again.');
  }
}

const app = document.querySelector('#app');
trackNexoraEvent('app_open');
if (Capacitor.isNativePlatform()) {
  try {
    if (!localStorage.getItem('nexora_aidrama_first_launch_v1')) {
      trackNexoraEvent('app_first_launch');
      localStorage.setItem('nexora_aidrama_first_launch_v1', '1');
    }
  } catch (_) {}
}

const APP_REPO = 'cedrickdavebausinbajar-afk/nexora-ai-drama';
let updateInfo = {status:'checking', installed:'', latest:'', url:'', message:'Checking for updates…'};
let updatePromptShown = false;
function showUpdatePopup() {
  if (updateInfo.status !== 'available' || updatePromptShown) return;
  if (localStorage.getItem('nexora-update-dismissed') === updateInfo.latest) return;
  updatePromptShown = true;
  const popup = document.createElement('div');
  popup.id = 'updatePopup';
  popup.className = 'update-popup-backdrop';
  popup.innerHTML = `<section class="update-popup-card" role="dialog" aria-modal="true" aria-labelledby="updatePopupTitle">
    <div class="update-popup-icon">↻</div>
    <div class="eyebrow">NEXORA AI DRAMA UPDATE</div>
    <h2 id="updatePopupTitle">A new version is ready</h2>
    <p>Update to ${esc(updateInfo.latest)} for the latest NEXORA AI DRAMA experience.</p>
    <div class="update-popup-version">Installed: ${esc(updateInfo.installed)} <span>→</span> Latest: ${esc(updateInfo.latest)}</div>
    <button class="gold update-popup-primary" id="popupUpdateNow">UPDATE NOW</button>
    <button class="update-popup-later" id="popupUpdateLater">Maybe later</button>
    <small>Android will ask you to confirm the installation.</small>
  </section>`;
  document.body.appendChild(popup);
  popup.querySelector('#popupUpdateNow').onclick = startUpdateFlow;
  popup.querySelector('#popupUpdateLater').onclick = () => {
    localStorage.setItem('nexora-update-dismissed', updateInfo.latest);
    popup.remove();
  };
}

async function checkForUpdates() {
  try {
    const [localRes, remoteRes] = await Promise.all([
      fetch('/app-version.json', {cache:'no-store'}),
      fetch(`https://api.github.com/repos/${APP_REPO}/releases/latest`, {headers:{Accept:'application/vnd.github+json'}, cache:'no-store'})
    ]);
    if (!localRes.ok || !remoteRes.ok) throw new Error('Update service unavailable');
    const local = await localRes.json();
    const release = await remoteRes.json();
    const latestCode = Number(String(release.tag_name || '').match(/^v\d+\.\d+\.(\d+)$/)?.[1] || 0);
    const installedCode = Number(local.versionCode || 0);
    const apk = (release.assets || []).find(item => item.name === 'NEXORA-AI-DRAMA.apk');
    updateInfo = {status:latestCode > installedCode && apk ? 'available' : 'current',
      installed:local.versionName || 'Unknown', latest:release.tag_name || 'Unknown',
      url:apk?.browser_download_url || release.html_url || '',
      message:latestCode > installedCode && apk ? 'A new version is ready.' : 'Your app is up to date!'};
  } catch {
    updateInfo = {...updateInfo,status:'error',message:'Could not check for updates. Please try again.'};
  }
  const badge=document.querySelector('#updateBadge');
  if(badge) badge.textContent=updateInfo.status==='available'?'UPDATE':updateInfo.status==='current'?'LATEST':updateInfo.status==='checking'?'CHECKING':'RETRY';
  const status=document.querySelector('#updateStatus');
  if(status) status.textContent=updateInfo.message;
  const versions=document.querySelector('#updateVersions');
  if(versions) versions.textContent=`Installed: ${updateInfo.installed||'—'} · Latest: ${updateInfo.latest||'—'}`;
  const action=document.querySelector('#updateAction');
  if(action) { action.hidden=updateInfo.status!=='available'; action.onclick=()=>{if(updateInfo.url) Browser.open({url:updateInfo.url});}; }
  showUpdatePopup();
  if (updateInfo.status === 'available' && Capacitor.isNativePlatform() && updateDownload.status === 'idle') {
    downloadUpdate().catch(() => {});
  }
}

const KEY = 'nexora-drama-demo-v2';
const seed = [
  {
    id: 'youtube-drama-xhRvCWXHPsI',
    title: 'THE MAFIA HIRED A NANNY',
    episode: 'FEATURED VIDEO',
    category: 'Drama',
    creator: 'Original YouTube creator',
    source: 'https://www.youtube.com/watch?v=xhRvCWXHPsI',
    license: 'Official YouTube embed · original creator attribution',
    url: 'https://www.youtube.com/watch?v=xhRvCWXHPsI',
    description: 'A drama video embedded from its original YouTube page. Playback depends on the creator allowing embedding.'
  }
];


const originalSeries = [
{id:'love-behind-the-lies',title:'LOVE BEHIND THE LIES',genre:'Romance · Mystery',logline:'A bride discovers that the man she married has been protecting the secret that destroyed her family.',episodes:['The Wedding Secret','A Photograph from the Past','The Stranger at the Gate','Promises Under Oath','The Lie Between Us']},
{id:'billionaires-secret-wife',title:"THE BILLIONAIRE'S SECRET WIFE",genre:'Romance · Drama',logline:'A billionaire hides his marriage to a woman who refuses to be treated like a secret.',episodes:['The Hidden Ring','Terms of the Marriage','A Wife in the Shadows','The Gala Reveal','No More Secrets']},
{id:'married-to-my-enemy',title:'MARRIED TO MY ENEMY',genre:'Romance · Revenge',logline:'Two business rivals enter a marriage of convenience, unaware their families share a painful history.',episodes:['The Hostile Proposal','One Roof, Two Enemies','The Family File','A Dangerous Alliance','The First Real Kiss']},
{id:'ceos-hidden-daughter',title:"THE CEO'S HIDDEN DAUGHTER",genre:'Family · Mystery',logline:'A young woman takes a job at a powerful company and discovers the CEO may be the father she never knew.',episodes:['The New Assistant','The Childhood Locket','A Name on the Birth Record','The Boardroom Test','The Truth Comes Home']},
{id:'revenge-forgotten-heiress',title:'REVENGE OF THE FORGOTTEN HEIRESS',genre:'Revenge · Drama',logline:'After being erased from her own family, an heiress returns with a new identity and a plan.',episodes:['The Girl They Erased','A New Identity','The First Move','The Cost of Revenge','The Heiress Returns']},
{id:'my-fake-husband',title:'MY FAKE HUSBAND',genre:'Romance · Comedy',logline:'A practical woman hires a charming stranger to pose as her husband, but their contract gets complicated.',episodes:['The Husband for Hire','Rules of the House','Meet the In-Laws','The Contract Clause','Falling Off Script']},
{id:'secret-surrogate',title:'THE SECRET SURROGATE',genre:'Family · Thriller',logline:'A surrogate agrees to keep her identity private until a missing medical file puts everyone at risk.',episodes:['The Agreement','A Sealed Envelope','The Wrong Appointment','A Mother’s Promise','The Missing File']},
{id:'love-that-betrayed-me',title:'A LOVE THAT BETRAYED ME',genre:'Romance · Drama',logline:'A woman rebuilding her life meets the one person connected to the betrayal she has never forgiven.',episodes:['The Last Message','Starting Over','The Familiar Stranger','What Really Happened','Choosing Tomorrow']},
{id:'billionaires-contract-bride',title:"THE BILLIONAIRE'S CONTRACT BRIDE",genre:'Romance · Drama',logline:'A contract marriage meant to save two fortunes becomes a test of trust, loyalty, and love.',episodes:['The One-Year Deal','Separate Bedrooms','The Public Couple','A Clause Broken','Beyond the Contract']},
{id:'twins-of-destiny',title:'TWINS OF DESTINY',genre:'Family · Mystery',logline:'Separated at birth, twin sisters unknowingly compete for the same future and the same family truth.',episodes:['Two Birth Certificates','The Accidental Meeting','A Mother’s Secret','Switched Lives','Together at Last']},
{id:'wrong-bride',title:'THE WRONG BRIDE',genre:'Romance · Mystery',logline:'A wedding-day mix-up sends an ordinary woman into a powerful family’s world and uncovers a deliberate deception.',episodes:['The Wrong Aisle','A Different Groom','The Missing Invitation','The Wedding Plot','The Choice']},
{id:'his-double-life',title:'HIS DOUBLE LIFE',genre:'Thriller · Romance',logline:'A wife begins to suspect her seemingly ordinary husband is living another life after dark.',episodes:['The Second Phone','An Unknown Address','The Man in the Photograph','Midnight Confession','Two Lives Collide']},
{id:'last-promise',title:'THE LAST PROMISE',genre:'Romance · Family',logline:'Two childhood friends reunite to fulfill a promise made years ago, before time runs out.',episodes:['The Promise Letter','Back to the Coast','An Old Photograph','The Final Summer','Always Remember']},
{id:'secret-millionaire',title:'THE SECRET MILLIONAIRE',genre:'Romance · Comedy',logline:'A quiet millionaire keeps his wealth hidden while searching for someone who loves him without it.',episodes:['The Ordinary Man','A Job Interview','The Charity Dinner','The Secret Exposed','Love Without a Price']},
{id:'love-after-divorce',title:'LOVE AFTER DIVORCE',genre:'Romance · Drama',logline:'Freshly divorced, a woman rebuilds her career and discovers that a second chance can come from an unexpected place.',episodes:['The Signature','A New Beginning','The Difficult Reunion','Learning to Trust','A Different Forever']},
{id:'house-of-secrets',title:'THE HOUSE OF SECRETS',genre:'Mystery · Family',logline:'When siblings inherit an old mansion, hidden rooms reveal a family history no one was meant to know.',episodes:['The Inheritance','The Locked Room','Voices in the Hall','The Family Portrait','Beneath the House']},
{id:'my-ex-billionaire',title:'MY EX IS A BILLIONAIRE',genre:'Romance · Revenge',logline:'Years after a painful breakup, a woman discovers her ex has become a billionaire—and still remembers everything.',episodes:['The Unexpected Reunion','The New CEO','An Old Debt','The Truth Behind Goodbye','Not for Sale']},
{id:'ceos-revenge',title:"THE CEO'S REVENGE",genre:'Business · Thriller',logline:'A betrayed executive returns to reclaim a company, but the evidence points to someone close to him.',episodes:['The Boardroom Betrayal','The Comeback Plan','A Hidden Account','The Insider','The Final Vote']},
{id:'second-chance-love',title:'A SECOND CHANCE AT LOVE',genre:'Romance · Drama',logline:'Two former sweethearts meet again as guardians of the same child and must face the choices that separated them.',episodes:['The Reunion','A Shared Responsibility','The Unsent Letter','Old Wounds','A New Promise']},
{id:'missing-heiress',title:'THE MISSING HEIRESS',genre:'Mystery · Drama',logline:'A small-town artist is drawn into a wealthy family’s search for a missing heiress—and begins to question her own past.',episodes:['The Missing Portrait','A Familiar Birthmark','The Family Search','A Name Revealed','Homecoming']}
,{id:'the-billionaire-next-door',title:'THE BILLIONAIRE NEXT DOOR',genre:'Romance · Mystery',logline:'A night-shift nurse befriends her quiet neighbor and discovers he is the missing heir at the center of a corporate scandal.',episodes:['The Quiet Neighbor','A Name on the News','The Locked Penthouse','A Dangerous Visitor','The Man Behind the Door']}
,{id:'stolen-wedding-vows',title:'STOLEN WEDDING VOWS',genre:'Romance · Betrayal',logline:'A bride is left at the altar and learns her sister planned the betrayal to claim the family fortune.',episodes:['The Empty Altar','The Sister’s Secret','A Ring Returned','The Family Vote','Vows Rewritten']}
,{id:'the-ceos-contract',title:'THE CEO’S CONTRACT',genre:'Romance · Business',logline:'A struggling designer signs a strict work contract with a demanding CEO, but one clause changes both their lives.',episodes:['The Impossible Deadline','Clause Number Seven','The Office Rumor','A Night of Truth','Beyond the Signature']}
,{id:'daughter-of-the-maid',title:'DAUGHTER OF THE MAID',genre:'Family · Revenge',logline:'Raised in the home where her mother worked, a young woman returns years later to uncover why her birth was hidden.',episodes:['The Housekeeper’s Key','A Hidden Birth Record','The Family Dinner','A Mother’s Silence','The Name She Deserves']}
,{id:'one-night-billionaire',title:'ONE NIGHT WITH A BILLIONAIRE',genre:'Romance · Drama',logline:'One unexpected night connects a hotel worker and a billionaire whose public engagement is built on a lie.',episodes:['The Wrong Suite','A Morning After','The Fake Engagement','The Press Conference','A Choice in Public']}
,{id:'the-secret-inheritance',title:'THE SECRET INHERITANCE',genre:'Mystery · Family',logline:'A modest teacher inherits an estate with one condition: solve the mystery of the previous owner’s disappearance.',episodes:['The Lawyer’s Letter','The Locked Study','A Stranger’s Warning','The Missing Will','The Last Heir']}
,{id:'my-husbands-other-family',title:'MY HUSBAND’S OTHER FAMILY',genre:'Drama · Mystery',logline:'A wife discovers her husband has been supporting another household and must decide what truth to reveal to their children.',episodes:['The Second Address','A Birthday Invitation','The Other Home','A Child’s Question','The Truth at Dinner']}
,{id:'queen-of-the-boardroom',title:'QUEEN OF THE BOARDROOM',genre:'Business · Revenge',logline:'After being pushed out of her own startup, a founder returns as an investor to expose the people who stole it.',episodes:['The Founder’s Exit','A New Investor','The Hidden Ledger','The Vote of No Confidence','Back in Control']}
,{id:'the-last-love-letter',title:'THE LAST LOVE LETTER',genre:'Romance · Mystery',logline:'A woman receives letters from an unknown sender that reveal the real story behind her late mother’s first love.',episodes:['A Letter Without a Name','The Old Bookshop','A Photograph in Blue','The Promise Kept','A Love Remembered']}
,{id:'engaged-to-a-stranger',title:'ENGAGED TO A STRANGER',genre:'Romance · Comedy',logline:'To save a family business, two strangers agree to a fake engagement and discover they have more in common than they think.',episodes:['The Engagement Deal','Meet the Families','The Weekend Away','A Real Jealousy','Not Pretending Anymore']}

];


const loveBehindTheLiesPilot = [
  {title:'SCENE 1 — THE PHOTOGRAPH', text:'INT. VALE HOUSE, BRIDAL SUITE — NIGHT. After the wedding reception, Mara Reyes finds an old photograph hidden in her bouquet. Her late father is pictured with a younger Adrian Vale, dated seven days before the fire that destroyed her family business. MARA: “You knew my father.” ADRIAN: “I thought you’d be downstairs.”'},
  {title:'SCENE 2 — THE PROMISE', text:'INT. BRIDAL SUITE — CONTINUOUS. Adrian admits that he worked for a company negotiating with Mara’s father. Her father believed someone wanted to take his business and asked Adrian to keep Mara safe if anything happened. MARA: “You don’t get to call a lie protection.” ADRIAN: “I made him a promise.”'},
  {title:'SCENE 3 — THE SECOND COPY', text:'INT. VALE HOUSE, HALLWAY — NIGHT. Mara demands the truth. An unknown message appears on Adrian’s phone: “She found the photograph. Do not tell her about the second copy.” Mara notices him hiding the phone and realizes there is another secret.'},
  {title:'SCENE 4 — WHO PAID FOR THE SILENCE?', text:'INT. REYES FAMILY HOME, KITCHEN — LATER. Mara leaves a voicemail for her aunt Elena asking about the photograph. Another message arrives with a wider crop of the picture and the words: “Ask your husband who paid for the silence.” A third person is visible at the edge of the photograph.'},
  {title:'SCENE 5 — THE WARNING', text:'INT. VALE HOUSE, BRIDAL SUITE — NIGHT. Adrian tells someone by phone that he will stop lying and that the agreement with Victor is over. Mara hears the name Victor and demands answers. A final message appears: “If you tell her, she’ll be next.” CUT TO BLACK.'},
  {title:'END CARD', text:'LOVE BEHIND THE LIES — EPISODE 1. The truth has a price. Will Mara pay it? NEXT: A PHOTOGRAPH FROM THE PAST.'}
];

const removedSeedIds = new Set(["sintel-demo","elephants-dream-open","big-buck-bunny-full-open","big-buck-bunny-demo","tears-of-steel-open","spring-open","sprite-fright-open","cosmos-laundromat-open","agent-327-open","coffee-run-open","caminandes-llamigos-open","glass-half-open","caminandes-gran-dillama-open","sita-sings-the-blues-feature"]);
function readItems() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!Array.isArray(stored) || !stored.length) return seed;
    // Remove explicitly retired built-in titles from existing installs while preserving owner-added videos.
    const retained = stored.filter(x => !removedSeedIds.has(x.id));
    return [...seed, ...retained.filter(x => !seed.some(s => s.id === x.id))];
  } catch {
    return seed;
  }
}
let items = readItems();
let liked = new Set();
try { liked = new Set(JSON.parse(localStorage.getItem('nexora-liked') || '[]')); } catch {}
let active = 0;
let view = 'feed';
let selectedSeries = null;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const save = () => localStorage.setItem(KEY, JSON.stringify(items));
const builtInIds = new Set(seed.map(x => x.id));
const isDemo = x => builtInIds.has(x.id);

function shell() {
  app.innerHTML = `
<header class="top"><div class="brand"><img class="brand-logo" src="/nexora-logo.svg" alt="NEXORA logo"><div><b>NEXORA</b><small>AI DRAMA</small></div></div>
<button class="gold-outline menu-toggle" id="menuOpen" aria-expanded="false" aria-controls="menuDrawer">☰ MENU</button></header>
<div class="menu-backdrop" id="menuBackdrop" hidden></div>
<aside class="menu-drawer" id="menuDrawer" aria-label="Main menu" hidden>
  <div class="drawer-head"><div><b>NEXORA</b><small>AI DRAMA MENU</small></div><button class="drawer-close" id="menuClose" aria-label="Close menu">×</button></div>
  <button class="drawer-link" data-view="feed">▶ &nbsp; Discover</button>
  <button class="drawer-link" data-view="search">⌕ &nbsp; Search</button>
  <button class="drawer-link" data-view="shorts">▶ &nbsp; Drama Shorts <span>VERTICAL FEED</span></button>
  <button class="drawer-link" data-view="originals">✦ &nbsp; Original AI dramas <span>30 SERIES</span></button>
  <button class="drawer-link" data-view="stories">▤ &nbsp; Story Mode <span>READ & WRITE</span></button>
  <button class="drawer-link" data-view="saved">♥ &nbsp; Saved dramas</button>
  <button class="drawer-link" data-view="updates">↻ &nbsp; App updates <span id="updateBadge">CHECKING</span></button>
  <div class="drawer-divider"></div>
  <a class="drawer-link" href="https://cedrickdavebausinbajar-afk.github.io/nexora-official-website/" target="_blank" rel="noopener">◎ &nbsp; Official website ↗</a>
  <a class="drawer-link" href="https://t.me/nexorastudioteam" target="_blank" rel="noopener">✈ &nbsp; Telegram ↗</a>
  <a class="drawer-link" href="https://www.facebook.com/profile.php?id=61596591209056" target="_blank" rel="noopener">f &nbsp; Facebook ↗</a>
  <button class="drawer-link owner-link" id="adminOpen">♛ &nbsp; Owner</button>
  <p class="drawer-foot">© 2026 NEXORA AI DRAMA</p>
</aside>
<nav class="tabs"><button class="${view==='feed'?'active':''}" data-view="feed">DISCOVER</button><button class="${view==='search'?'active':''}" data-view="search">SEARCH</button><button class="${view==='saved'?'active':''}" data-view="saved">SAVED</button></nav>
${view==='feed'?`<section class="welcome-strip"><img class="drama-cover-banner" src="/nexora-drama-cover.svg" alt="NEXORA AI DRAMA premium purple cover"><div class="welcome-copy"><span class="welcome-kicker">THE PREMIUM SHORT-FILM CLUB</span><h1>Stories worth<br><em>staying up for.</em></h1><p>Discover a handpicked collection of creator-credited films and stories.</p><div class="welcome-tags"><span>CURATED STORIES</span><span>BLACK LABEL</span><span>NEW DISCOVERIES</span></div></div><div class="welcome-emblem"><img src="/nexora-logo.svg" alt="NEXORA emblem"></div></section>`:''}
<main id="screen"></main>
<footer>© ${new Date().getFullYear()} NEXORA AI DRAMA <span>Open films · creator credits and license details shown per title · Watch responsibly</span></footer>`;
  const drawer = document.querySelector('#menuDrawer');
  const backdrop = document.querySelector('#menuBackdrop');
  const closeMenu = () => {
    drawer.hidden = true;
    backdrop.hidden = true;
    document.querySelector('#menuOpen').setAttribute('aria-expanded', 'false');
  };
  document.querySelector('#menuOpen').onclick = () => {
    drawer.hidden = false;
    backdrop.hidden = false;
    document.querySelector('#menuOpen').setAttribute('aria-expanded', 'true');
  };
  document.querySelector('#menuClose').onclick = closeMenu;
  backdrop.onclick = closeMenu;
  app.querySelectorAll('.drawer-link[data-view], .tabs [data-view]').forEach(b => b.onclick = () => { closeMenu(); view = b.dataset.view; render(); });
  document.querySelector('#adminOpen').onclick = () => { closeMenu(); adminGate(); };
  document.onkeydown = e => { if (e.key === 'Escape' && !drawer.hidden) { closeMenu(); document.querySelector('#menuOpen')?.focus(); } };
  renderScreen();
  checkForUpdates();
}
function render() { shell(); }
function renderScreen() {
  const screen = document.querySelector('#screen');
  if (!screen) return;
  if (view === 'stories') { renderStoryMode(screen, () => { view='feed'; render(); }); return; }
  if (view === 'updates') {
    screen.innerHTML = `<section class="panel update-panel"><div class="eyebrow">NEXORA SOFTWARE UPDATE</div><h1>Keep your app up to date</h1><p id="updateStatus" class="update-status">${esc(updateInfo.message)}</p><p id="updateVersions" class="muted">Installed: ${esc(updateInfo.installed || 'Checking…')} · Latest: ${esc(updateInfo.latest || 'Checking…')}</p><div class="update-actions"><button class="gold" id="checkUpdates">CHECK FOR UPDATES</button><button class="gold-outline" id="updateAction" hidden>UPDATE NOW</button></div><small class="muted">When a new version is found, NEXORA downloads it into private app storage automatically. Android will ask you to confirm installation. Old APKs are not added to your Downloads folder.</small></section>`;
    document.querySelector('#checkUpdates').onclick=()=>{updateDownload={status:'idle',path:'',message:''};document.querySelector('#updateStatus').textContent='Checking for updates…';checkForUpdates();};
    document.querySelector('#updateAction').onclick=startUpdateFlow;
    checkForUpdates();
    return;
  }
  if (view === 'shorts') {
    const playable = items.filter(x => /^https:\/\//i.test(String(x.url || '')) && /\.mp4(?:[?#]|$)/i.test(String(x.url)));
    screen.innerHTML = `<section class="shorts-head"><div class="eyebrow">NEXORA · VERTICAL STORIES</div><h1>Drama Shorts</h1><p>Swipe up for the next short. Videos shown here are creator-credited catalogue entries; only videos you are authorized to publish should be added.</p></section>
      ${playable.length ? `<div class="shorts-feed">${playable.map((x,i)=>`<article class="short-card" data-short-index="${i}">
        <video class="short-video" src="${esc(x.url)}" ${x.poster ? `poster="${esc(x.poster)}"` : ''} controls playsinline muted loop preload="metadata"></video>
        <div class="short-shade"></div><div class="short-meta"><span class="short-tag">NEXORA SHORTS</span><h2>${esc(x.title)}</h2><p>${esc(x.episode || x.category || 'Drama')}</p><small>Creator: ${esc(x.creator || 'Not listed')}</small>${x.source ? `<a href="${esc(x.source)}" target="_blank" rel="noopener">VIEW ORIGINAL SOURCE ↗</a>` : ''}</div>
        <span class="short-counter">${i+1} / ${playable.length}</span>
      </article>`).join('')}</div>` : `<div class="panel empty"><h2>No short videos available yet</h2><p class="muted">Add an authorized vertical MP4 video in the Owner section. TikTok videos are not copied automatically.</p></div>`}`;
    const cards=[...screen.querySelectorAll('.short-card')];
    if ('IntersectionObserver' in window) {
      const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
        const video=entry.target.querySelector('video');
        if(entry.isIntersecting && entry.intersectionRatio>.65){video?.play().catch(()=>{});}
        else if(video){video.pause();}
      }),{threshold:[.25,.65,.9]});
      cards.forEach(card=>observer.observe(card));
    }
    return;
  }
  if (view === 'originals') {
    const s = selectedSeries && originalSeries.find(x => x.id === selectedSeries);
    if (s) {
      screen.innerHTML = `<section class="panel original-detail"><button class="gold-outline" id="seriesBack">← ALL ORIGINALS</button><div class="eyebrow">NEXORA ORIGINAL · ${esc(s.genre)}</div><h1>${esc(s.title)}</h1><p>${esc(s.logline)}</p>${s.id === 'love-behind-the-lies' ? `<div class="production-note"><b>EPISODE 1 SCREENPLAY ADDED TO THIS APP</b><span>Read the private in-app story preview below. The finished video has not been produced or published.</span></div><h2>Episode 1 · The Wedding Secret</h2><p class="muted">Original screenplay · target runtime 4–6 minutes · romantic mystery</p>${loveBehindTheLiesPilot.map((scene,i)=>`<article class="episode-plan" style="display:block"><b>${esc(scene.title)}</b><p style="white-space:pre-wrap;margin:.5rem 0 0">${esc(scene.text)}</p></article>`).join('')}` : `<div class="production-note"><b>VIDEO EPISODES IN PRODUCTION</b><span>These are original series concepts and episode plans. Finished video files are not available yet.</span></div>`}<h2>Episode guide</h2>${s.episodes.map((ep,i)=>`<article class="episode-plan"><div><b>EPISODE ${i+1}</b><strong>${esc(ep)}</strong></div><span>${s.id === 'love-behind-the-lies' && i === 0 ? 'SCREENPLAY' : 'COMING SOON'}</span></article>`).join('')}</section>`;
      document.querySelector('#seriesBack').onclick=()=>{selectedSeries=null;renderScreen();};
    } else {
      screen.innerHTML = `<section class="panel originals-head"><div class="eyebrow">MADE FOR NEXORA</div><h1>Original AI Dramas</h1><p>30 original series concepts with episode guides. Video production is the next stage; no unfinished title is presented as a playable episode.</p><div class="original-grid">${originalSeries.map(s=>`<button class="original-card" data-series="${s.id}"><span class="original-label">NEXORA ORIGINAL</span><b>${esc(s.title)}</b><small>${esc(s.genre)}</small><span class="original-status">5 EPISODES PLANNED · IN PRODUCTION</span></button>`).join('')}</div></section>`;
      screen.querySelectorAll('[data-series]').forEach(b=>b.onclick=()=>{selectedSeries=b.dataset.series;renderScreen();});
    }
    return;
  }
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
  const peerTubeId = String(x.url || '').match(/(?:webseed|download\/videos)\/([0-9a-f-]{36})/i)?.[1];
  const peerTubeEmbed = peerTubeId
    ? `https://video.blender.org/videos/embed/${peerTubeId}?p2p=0&warningTitle=0`
    : null;
  const youtubeId = String(x.url || '').match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1];
  const youtubeEmbed = youtubeId ? `https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0` : null;
  const embeddedPlayer = peerTubeEmbed || youtubeEmbed;
  screen.innerHTML = `<section class="player-wrap">
<div class="player" id="player">
  <button type="button" id="fullscreenPlayer" class="fullscreen-player" aria-label="Enter full screen" title="Full screen">⛶ <span>FULL SCREEN</span></button>
  ${embeddedPlayer
    ? `<iframe class="peer-player" src="${embeddedPlayer}" title="Watch ${esc(x.title)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen loading="eager" referrerpolicy="strict-origin-when-cross-origin"></iframe>`
    : `<video id="dramaVideo" controls playsinline webkit-playsinline preload="metadata" poster="${esc(x.poster||'')}">
      <source src="${esc(x.url||'')}" type="video/mp4">
      Your device cannot play this video.
    </video>
    <div class="play-overlay" id="playOverlay"><button type="button" id="startPlayback">▶ PLAY VIDEO</button><small id="playStatus">Tap to start watching</small></div>
    <div id="videoError" class="video-error" hidden>Video could not load. Check your internet connection, then tap RETRY.<button id="retryVideo" type="button">RETRY</button></div>`}
  <div class="shade"></div>
  <div class="meta"><span class="tag">${esc(x.category||'DRAMA')}</span><h2>${esc(x.title)}</h2>
  <p>${esc(x.episode||'EPISODE 1')} · ${esc(x.creator||'Creator not listed')}</p>
  ${x.source?`<a href="${esc(x.source)}" target="_blank" rel="noopener">Creator / film website ↗</a>`:''}
  <small class="license">${esc(x.license||'Creator-authorized video')}</small></div>
  <div class="actions"><button id="like" class="action">${liked.has(x.id)?'♥':'♡'}<small>SAVE</small></button><button id="share" class="action">↗<small>SHARE</small></button></div>
</div>
<div class="feed-controls"><button id="prev" ${active===0?'disabled':''}>↑ PREVIOUS</button><span>${active+1} / ${items.length}</span><button id="nextText" ${active===items.length-1?'disabled':''}>NEXT ↓</button></div>
<p class="credit">Credit: ${esc(x.creator||'Not provided')} · ${esc(x.license||'Authorized content')}. <a href="${esc(x.source||'#')}" target="_blank" rel="noopener">Source and license details ↗</a></p>
</section>`;
  const playerFrame = document.querySelector('#player');
  const fullscreenButton = document.querySelector('#fullscreenPlayer');
  if (fullscreenButton && playerFrame) {
    const syncFullscreenLabel = () => {
      const activeFullscreen = document.fullscreenElement === playerFrame || document.webkitFullscreenElement === playerFrame;
      fullscreenButton.innerHTML = activeFullscreen ? '⛶ <span>EXIT FULL SCREEN</span>' : '⛶ <span>FULL SCREEN</span>';
      fullscreenButton.setAttribute('aria-label', activeFullscreen ? 'Exit full screen' : 'Enter full screen');
    };
    fullscreenButton.onclick = async () => {
      try {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          if (document.exitFullscreen) await document.exitFullscreen();
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        } else if (playerFrame.requestFullscreen) {
          await playerFrame.requestFullscreen();
        } else if (playerFrame.webkitRequestFullscreen) {
          playerFrame.webkitRequestFullscreen();
        } else {
          const nativeVideo = playerFrame.querySelector('video');
          if (nativeVideo?.webkitEnterFullscreen) nativeVideo.webkitEnterFullscreen();
          else if (nativeVideo) { nativeVideo.controls = true; await nativeVideo.play(); }
        }
      } catch (err) {
        const nativeVideo = playerFrame.querySelector('video');
        if (nativeVideo?.webkitEnterFullscreen) nativeVideo.webkitEnterFullscreen();
      }
      syncFullscreenLabel();
    };
    document.addEventListener('fullscreenchange', syncFullscreenLabel);
    document.addEventListener('webkitfullscreenchange', syncFullscreenLabel);
  }
  const video = document.querySelector('#dramaVideo');
  if (video) {
    const overlay = document.querySelector('#playOverlay');
    const status = document.querySelector('#playStatus');
    const errorBox = document.querySelector('#videoError');
    const startButton = document.querySelector('#startPlayback');
    const startPlayback = async () => {
      trackNexoraEvent('drama_play_start', {content_title: x.title || 'unknown', content_category: x.category || 'unknown'});

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
      startButton.disabled = false;
      video.load();
    };
  }
  document.querySelector('#like').onclick = () => {
    liked.has(x.id) ? liked.delete(x.id) : liked.add(x.id);
    localStorage.setItem('nexora-liked', JSON.stringify([...liked]));
    renderScreen();
  };
  document.querySelector('#share').onclick = async () => {
    trackNexoraEvent('share_click');

    const data = {title:x.title,text:`Watch ${x.title} on NEXORA AI DRAMA`,url:x.source||location.href};
    if (navigator.share) { try { await navigator.share(data); } catch {} }
    else if (navigator.clipboard) { try { await navigator.clipboard.writeText(data.url); alert('Link copied.'); } catch { alert('Sharing is not available on this device yet.'); } }
    else alert('Sharing is not available on this device yet.');
  };
  const next = () => { if (active < items.length-1) { active++; renderScreen(); } };
  const prev = () => { if (active > 0) { active--; renderScreen(); } };
  document.querySelector('#nextText').onclick = next;
  document.querySelector('#prev').onclick = prev;
  // Keep the current screen at the top after changing episodes on mobile.
  document.querySelector('#screen')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  app.innerHTML = `<header class="top"><div class="brand"><img class="brand-logo" src="/nexora-logo.svg" alt="NEXORA logo"><div><b>NEXORA</b><small>PRIVATE OWNER PANEL · DEMO</small></div></div><button class="gold-outline" id="back">VIEW APP</button></header>
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
    if (!/^https:\/\//i.test(x.url) || !/^https:\/\//i.test(x.source) || (x.poster && !/^https:\/\//i.test(x.poster))) {
      alert('Please use secure HTTPS links for the video, source, and poster.');
      return;
    }
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
