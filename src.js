import './style.css';
import { createClient } from '@supabase/supabase-js';
import { renderStoryMode } from './story-mode.js';
import { Browser } from '@capacitor/browser';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileTransfer } from '@capacitor/file-transfer';
import { LocalNotifications } from '@capacitor/local-notifications';
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

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}) : null;
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
  if (updateInfo.status === 'available' && Capacitor.isNativePlatform()) {
    const notifiedVersion = localStorage.getItem('nexora-update-notified-v1');
    if (notifiedVersion !== updateInfo.latest) {
      try {
        const permission = await LocalNotifications.checkPermissions();
        if (permission.display === 'granted') {
          await LocalNotifications.schedule({notifications:[{
            id:7302,
            title:'NEXORA AI DRAMA update available',
            body:`Version ${updateInfo.latest} is ready. Open NEXORA to install the latest update.`,
            schedule:{at:new Date(Date.now()+1000),allowWhileIdle:true},
            channelId:'nexora-updates',
            extra:{type:'app-update'}
          }]});
          localStorage.setItem('nexora-update-notified-v1', updateInfo.latest);
        }
      } catch (_) {}
    }
  }
  const badge=document.querySelector('#updateBadge');
  if(badge) badge.textContent=updateInfo.status==='available'?'UPDATE':updateInfo.status==='current'?'LATEST':updateInfo.status==='checking'?'CHECKING':'RETRY';
  const status=document.querySelector('#updateStatus');
  if(status) status.textContent=updateInfo.message;
  const versions=document.querySelector('#updateVersions');
  if(versions) versions.textContent=`Installed: ${updateInfo.installed||'—'} · Latest: ${updateInfo.latest||'—'}`;
  const action=document.querySelector('#updateAction');
  if(action) { action.hidden=updateInfo.status!=='available'; action.onclick=startUpdateFlow; }
  showUpdatePopup();
  if (updateInfo.status === 'available' && Capacitor.isNativePlatform() && updateDownload.status === 'idle') {
    downloadUpdate().catch(() => {});
  }
}

const KEY = 'nexora-drama-demo-v2';
const seed = [];


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
let view = 'home';
const WATCH_PROGRESS_KEY = 'nexora-watch-progress-v1';
const WATCH_NOTIFICATION_ID = 7301;
let pendingResumeId = '';
async function cancelContinueNotification() {
  if (!Capacitor.isNativePlatform()) return;
  try { await LocalNotifications.cancel({notifications:[{id:WATCH_NOTIFICATION_ID}]}); } catch {}
}
async function scheduleContinueNotification(item, seconds) {
  if (!Capacitor.isNativePlatform() || !item?.id || seconds < 30) return;
  const progress = {id:item.id,title:item.title||'your drama',episode:item.episode||'Episode',time:Math.floor(seconds),updatedAt:Date.now()};
  try { localStorage.setItem(WATCH_PROGRESS_KEY, JSON.stringify(progress)); } catch {}
  try {
    await LocalNotifications.schedule({notifications:[{
      id:WATCH_NOTIFICATION_ID,
      title:'Continue watching on NEXORA',
      body:`Pick up ${progress.title} where you left off.`,
      schedule:{at:new Date(Date.now()+60*60*1000),allowWhileIdle:true},
      channelId:'nexora-watch',
      extra:{type:'continue',contentId:item.id}
    }]});
  } catch (_) {}
}
async function initializePhoneNotifications() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    let permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted') permission = await LocalNotifications.requestPermissions();
    if (permission.display === 'granted') {
      await LocalNotifications.createChannel({id:'nexora-watch',name:'Continue Watching',description:'Reminders for unfinished NEXORA AI DRAMA episodes',importance:4});
      await LocalNotifications.createChannel({id:'nexora-updates',name:'NEXORA Updates',description:'New dramas, episodes, and app versions',importance:4});
    }
    await LocalNotifications.addListener('localNotificationActionPerformed', action => {
      const extra = action?.notification?.extra || {};
      if (extra.type === 'continue' && extra.contentId) {
        pendingResumeId = String(extra.contentId);
        const index = items.findIndex(entry => entry.id === pendingResumeId);
        if (index >= 0) { active=index; view='feed'; render(); }
      } else if (extra.type === 'app-update') {
        view='updates'; render();
      }
    });
  } catch (error) { console.warn('NEXORA notification setup unavailable:',error); }
}

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
  <div class="drawer-section-label">DRAMABOX · WATCH & DISCOVER</div><button class="drawer-link" data-view="home">⌂ &nbsp; Home dashboard</button>
  <button class="drawer-link" data-view="feed">▶ &nbsp; Discover</button>
  <button class="drawer-link" data-view="search">⌕ &nbsp; Search</button>
  <button class="drawer-link" data-view="shorts">▶ &nbsp; Drama Shorts <span>VERTICAL FEED</span></button>
  <button class="drawer-link" data-view="originals">✦ &nbsp; Original AI dramas <span>30 SERIES</span></button>
  <div class="drawer-section-label">NEXORA BOOKSHELF</div>
  <button class="drawer-link" data-view="stories">▤ &nbsp; Story Mode <span>READ & WRITE</span></button>
  <button class="drawer-link" data-view="saved">♥ &nbsp; Saved dramas</button>
  <button class="drawer-link" data-view="updates">↻ &nbsp; Updates <span id="updateBadge">CHECKING</span></button>
  <div class="drawer-divider"></div>
  <a class="drawer-link" href="https://cedrickdavebausinbajar-afk.github.io/nexora-official-website/" target="_blank" rel="noopener">◎ &nbsp; Official website ↗</a>
  <a class="drawer-link" href="https://t.me/nexorastudioteam" target="_blank" rel="noopener">✈ &nbsp; Telegram ↗</a>
  <a class="drawer-link" href="https://www.facebook.com/profile.php?id=61596591209056" target="_blank" rel="noopener">f &nbsp; Facebook ↗</a>
  <button class="drawer-link owner-link" id="adminOpen">♛ &nbsp; Owner Dashboard</button>
  <p class="drawer-foot">© 2026 NEXORA AI DRAMA</p>
</aside>
<nav class="tabs"><button data-view="home">HOME</button><button class="${view==='feed'?'active':''}" data-view="feed">DISCOVER</button><button class="${view==='search'?'active':''}" data-view="search">SEARCH</button><button class="${view==='saved'?'active':''}" data-view="saved">SAVED</button></nav>
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
  if (view === 'home') {
    const uploadedVideos = items.filter(x => !builtInIds.has(x.id) && x.url)
      .sort((a, b) => Number(b.watchCount || 0) - Number(a.watchCount || 0));
    const popularDrama = uploadedVideos.slice(0, 1);
    const otherFeatured = uploadedVideos.slice(1);
    screen.innerHTML = `<section class="db-home"><div class="db-greeting"><span class="db-kicker">DRAMABOX</span><h1>Discover your next favorite drama.</h1><p>Explore videos uploaded by creators and original text stories.</p></div><h2>Popular Drama</h2><div class="home-published popular-drama">${popularDrama.length ? popularDrama.map(card).join('') : '<p class="muted">Your published videos will appear here after you upload and publish them.</p>'}</div><h2>Other Featured</h2><div class="home-published other-featured">${otherFeatured.length ? otherFeatured.map(card).join('') : '<p class="muted">Other uploaded videos will appear here when you publish more videos.</p>'}</div><section class="db-story-only"><h2>Drama Story Only</h2><p class="muted">Read and write drama stories in text only. No videos in this section.</p><div class="db-story-actions"><button id="dbRead">▤　READ TEXT STORIES</button><button id="dbCreate">＋　WRITE A STORY</button></div></section><div class="db-feature-row"><button data-go="shorts">DRAMA SHORTS</button><button data-go="saved">SAVED DRAMAS</button><button data-go="search">SEARCH</button></div></section>`;
    wireCards();
    screen.querySelector('#dbRead').onclick=()=>{view='stories';render();};
    screen.querySelector('#dbCreate').onclick=()=>{view='stories';render();};
    screen.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{view=b.dataset.go;render();});
    return;
  }
  if (view === 'stories') { renderStoryMode(screen, () => { view='feed'; render(); }); return; }
  if (view === 'updates') {
    screen.innerHTML = `<section class="panel update-panel"><div class="eyebrow">NEXORA SOFTWARE UPDATE</div><h1>Keep your app up to date</h1><p id="updateStatus" class="update-status">${esc(updateInfo.message)}</p><p id="updateVersions" class="muted">Installed: ${esc(updateInfo.installed || 'Checking…')} · Latest: ${esc(updateInfo.latest || 'Checking…')}</p><div class="update-actions"><button class="gold" id="checkUpdates">CHECK FOR UPDATES</button><button class="gold-outline" id="updateAction" hidden>UPDATE NOW</button></div><small class="muted">When a new version is found, NEXORA downloads it into private app storage automatically. Android will ask you to confirm installation. Old APKs are not added to your Downloads folder.</small></section>`;
    document.querySelector('#checkUpdates').onclick=()=>{updateDownload={status:'idle',path:'',message:''};document.querySelector('#updateStatus').textContent='Checking for updates…';checkForUpdates();};
    document.querySelector('#updateAction').onclick=startUpdateFlow;
    checkForUpdates();
    return;
  }
  if (view === 'shorts') {
    const playable = items.filter(x => isSupportedVideoUrl(x.url));
    screen.innerHTML = `<section class="shorts-head"><h1>Drama Shorts</h1><p>Swipe up for the next short. Videos shown here are creator-credited catalogue entries; only videos you are authorized to publish should be added.</p></section>
      ${playable.length ? `<div class="shorts-feed">${playable.map((x,i)=>`<article class="short-card" data-short-index="${i}">
        <video class="short-video" src="${esc(x.url)}" ${videoMimeType(x.url) ? `type="${videoMimeType(x.url)}"` : ''} ${x.poster ? `poster="${esc(x.poster)}"` : ''} controls playsinline muted loop preload="metadata"></video>
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
  <button type="button" id="volumeToggle" class="volume-toggle" aria-label="Unmute video" aria-pressed="false" title="Turn sound on">🔇 <span>SOUND OFF</span></button>
  <button type="button" id="fullscreenPlayer" class="fullscreen-player" aria-label="Enter full screen" title="Full screen">⛶ <span>FULL SCREEN</span></button>
  ${embeddedPlayer
    ? `<iframe class="peer-player" src="${embeddedPlayer}" title="Watch ${esc(x.title)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen loading="eager" referrerpolicy="strict-origin-when-cross-origin"></iframe>`
    : `<video id="dramaVideo" controls playsinline webkit-playsinline preload="metadata" poster="${esc(x.poster||'')}">
      <source src="${esc(x.url||'')}" ${videoMimeType(x.url) ? `type="${videoMimeType(x.url)}"` : ''}>
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
    if(x.subtitle){const track=document.createElement('track');track.kind='subtitles';track.label='Subtitles';track.srclang='en';track.src=x.subtitle;video.appendChild(track);}
    const volumeToggle = document.querySelector('#volumeToggle');
    const syncVolumeToggle = () => {
      if (!volumeToggle) return;
      const muted = video.muted || video.volume === 0;
      volumeToggle.innerHTML = muted ? '🔇 <span>SOUND OFF</span>' : '🔊 <span>SOUND ON</span>';
      volumeToggle.setAttribute('aria-label', muted ? 'Unmute video' : 'Mute video');
      volumeToggle.setAttribute('aria-pressed', String(!muted));
      volumeToggle.title = muted ? 'Turn sound on' : 'Mute sound';
    };
    if (volumeToggle) {
      video.muted = true;
      volumeToggle.onclick = () => {
        video.muted = !video.muted;
        if (!video.muted && video.volume === 0) video.volume = 1;
        syncVolumeToggle();
      };
      video.addEventListener('volumechange', syncVolumeToggle);
      syncVolumeToggle();
    }
    let lastProgressWrite = 0;
    let savedProgress = null;
    try { savedProgress = JSON.parse(localStorage.getItem(WATCH_PROGRESS_KEY) || 'null'); } catch {}
    if (savedProgress?.id === x.id && Number(savedProgress.time) > 0) {
      video.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(video.duration) && savedProgress.time < video.duration - 5) video.currentTime = savedProgress.time;
      }, {once:true});
    }

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
    let recordedDramaView = false;
    let playbackStartedAt = 0;
    let accumulatedPlaybackMs = 0;
    const maybeRecordDramaView = () => {
      if (recordedDramaView || !supabase || builtInIds.has(x.id)) return;
      const watchedMs = accumulatedPlaybackMs + (playbackStartedAt ? Date.now() - playbackStartedAt : 0);
      if (watchedMs < 30000) return;
      recordedDramaView = true;
      supabase.rpc('record_drama_view', {drama_id:x.id}).then(({error}) => {
        if (error) console.warn('Could not record drama view:', error.message);
        else loadCloudDramas();
      });
    };
    video.addEventListener('playing', () => {
      overlay.classList.add('playing'); errorBox.hidden = true;
      if (!playbackStartedAt) playbackStartedAt = Date.now();
    });
    video.addEventListener('waiting', () => { status.textContent = 'Buffering…'; });
    video.addEventListener('canplay', () => { status.textContent = 'Ready to play'; startButton.disabled = false; });
    video.addEventListener('playing', () => { cancelContinueNotification(); });
    video.addEventListener('timeupdate', () => {
      maybeRecordDramaView();
      if (video.currentTime - lastProgressWrite < 15) return;
      lastProgressWrite = video.currentTime;
      try { localStorage.setItem(WATCH_PROGRESS_KEY, JSON.stringify({id:x.id,title:x.title,episode:x.episode||'Episode',time:Math.floor(video.currentTime),updatedAt:Date.now()})); } catch {}
    });
    const saveResumeReminder = () => {
      if (!video.ended && video.currentTime >= 30 && (!video.duration || video.duration - video.currentTime > 5)) {
        scheduleContinueNotification(x, video.currentTime);
      }
    };
    video.addEventListener('pause', () => {
      if (playbackStartedAt) {
        accumulatedPlaybackMs += Date.now() - playbackStartedAt;
        playbackStartedAt = 0;
        maybeRecordDramaView();
      }
      overlay.classList.remove('playing');
      saveResumeReminder();
    });
    // Android can background the WebView without delivering a normal pause event.
    // Persist the exact playback point and schedule the same reminder in that case.
    document.addEventListener('visibilitychange', () => {
      // Schedule a native Android alarm as soon as the app leaves the foreground,
      // even if Android backgrounds the WebView before the video emits "pause".
      if (document.hidden) saveResumeReminder();
      else if (!video.paused) cancelContinueNotification();
    });
    window.addEventListener('pagehide', () => {
      // pagehide may run during an app close while playback is still marked active.
      saveResumeReminder();
    });
    video.addEventListener('ended', () => {
      if (playbackStartedAt) {
        accumulatedPlaybackMs += Date.now() - playbackStartedAt;
        playbackStartedAt = 0;
        maybeRecordDramaView();
      }
      overlay.classList.remove('playing'); status.textContent = 'Video finished';
      cancelContinueNotification();
      try { const p=JSON.parse(localStorage.getItem(WATCH_PROGRESS_KEY)||'null'); if(p?.id===x.id) localStorage.removeItem(WATCH_PROGRESS_KEY); } catch {}
    });
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
  const poster = x.poster ? `poster="${esc(x.poster)}"` : '';
  const title = esc(x.title || 'Untitled drama');
  return `<article class="rowcard home-video-card">
    <div class="home-video-thumb">
      <video class="mini-poster" src="${esc(x.url)}" ${poster} muted playsinline preload="metadata" aria-label="Video thumbnail for ${title}" onerror="this.hidden=true;this.nextElementSibling.hidden=false"></video>
      <div class="home-thumb-fallback" hidden><span>✦ NEXORA AI DRAMA</span><b>${title}</b><small>VIDEO PREVIEW UNAVAILABLE</small></div>
      <span class="home-thumb-play" aria-hidden="true">▶</span>
    </div>
    <div class="home-video-copy"><b>${title}</b><small>${esc(x.category || 'Drama')} · ${esc(x.episode || 'Episode 1')}</small><p>${esc(x.creator || 'Creator not listed')}</p><button class="gold-outline" data-play="${esc(x.id)}">WATCH DRAMA</button></div>
  </article>`;
}
function wireCards() {
  document.querySelectorAll('[data-play]').forEach(b => b.onclick = () => {
    const index = items.findIndex(x => x.id === b.dataset.play);
    if (index >= 0) { active = index; view = 'feed'; render(); }
  });
}
async function adminGate() {
  if (!supabase) {
    alert('Secure Owner Dashboard is not configured yet. Follow the Supabase setup in the project README.');
    return;
  }
  const {data: sessionData} = await supabase.auth.getSession();
  if (!sessionData.session) { renderAdminLogin(); return; }
  const {data: allowed, error} = await supabase.rpc('is_nexora_owner');
  if (error || allowed !== true) {
    await supabase.auth.signOut();
    renderAdminLogin('This account is not authorized as the NEXORA owner.');
    return;
  }
  await renderAdmin();
}
function renderAdminLogin(message = '') {
  app.innerHTML = '<header class="top"><div class="brand"><img class="brand-logo" src="/nexora-logo.svg" alt="NEXORA logo"><div><b>NEXORA</b><small>SECURE OWNER SIGN-IN</small></div></div><button class="gold-outline" id="back">VIEW APP</button></header>' +
  '<main class="admin"><section class="panel"><div class="eyebrow">PRIVATE ACCESS</div><h1>Owner sign-in</h1><p class="muted">Only an account explicitly authorized in the NEXORA database can manage dramas.</p>' +
  '<form id="ownerLogin"><label>Email address<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><p class="warning" id="loginMessage" role="status">' + esc(message) + '</p><button class="gold" type="submit">SIGN IN SECURELY</button></form></section></main>';
  document.querySelector('#back').onclick = () => { view='feed'; render(); };
  document.querySelector('#ownerLogin').onsubmit = async e => {
    e.preventDefault();
    const form=e.currentTarget, button=form.querySelector('button[type="submit"]'), status=document.querySelector('#loginMessage');
    button.disabled=true; button.textContent='VERIFYING…'; status.textContent='';
    const values=new FormData(form);
    const {error}=await supabase.auth.signInWithPassword({email:String(values.get('email')||'').trim(),password:String(values.get('password')||'')});
    if(error){status.textContent='Sign-in failed. Check your credentials and try again.';button.disabled=false;button.textContent='SIGN IN SECURELY';return;}
    const {data: allowed,error: roleError}=await supabase.rpc('is_nexora_owner');
    if(roleError||allowed!==true){await supabase.auth.signOut();status.textContent='Access denied. This account is not on the NEXORA owner allowlist.';button.disabled=false;button.textContent='SIGN IN SECURELY';return;}
    await renderAdmin();
  };
}
function videoMimeType(videoUrl) {
  const path=String(videoUrl||'').split(/[?#]/)[0].toLowerCase();
  if(path.endsWith('.mp4')) return 'video/mp4';
  if(path.endsWith('.webm')) return 'video/webm';
  if(path.endsWith('.mov')) return 'video/quicktime';
  return '';
}
function isSupportedVideoUrl(videoUrl) {
  return /^https:\/\//i.test(String(videoUrl||'')) && /\.(mp4|webm|mov)(?:[?#]|$)/i.test(String(videoUrl||''));
}

async function captureDramaThumbnail(source) {
  return new Promise(resolve => {
    const video=document.createElement('video');
    const objectUrl=source instanceof Blob ? URL.createObjectURL(source) : '';
    if(!objectUrl) video.crossOrigin='anonymous';
    video.muted=true;video.playsInline=true;video.preload='auto';
    let finished=false;
    const done=value=>{if(finished)return;finished=true;video.removeAttribute('src');video.load();if(objectUrl)URL.revokeObjectURL(objectUrl);resolve(value||null);};
    const timer=window.setTimeout(()=>done(null),20000);
    const finish=value=>{window.clearTimeout(timer);done(value);};
    video.onerror=()=>finish(null);
    video.onloadedmetadata=()=>{try{video.currentTime=Math.min(1.5,Math.max(0,(video.duration||1)*0.08));}catch{finish(null);}};
    video.onseeked=()=>{
      try{
        if(!video.videoWidth||!video.videoHeight)return finish(null);
        const canvas=document.createElement('canvas'),width=640,height=Math.max(1,Math.round(width*video.videoHeight/video.videoWidth));
        canvas.width=width;canvas.height=height;
        const ctx=canvas.getContext('2d');if(!ctx)return finish(null);
        ctx.drawImage(video,0,0,width,height);
        canvas.toBlob(blob=>finish(blob),'image/jpeg',0.84);
      }catch{finish(null);}
    };
    video.src=objectUrl||source;video.load();
  });
}
async function uploadDramaAsset(path,blob,contentType){
  const {error}=await supabase.storage.from('nexora-drama-videos').upload(path,blob,{contentType,upsert:true,cacheControl:'3600'});
  if(error)throw error;
  return supabase.storage.from('nexora-drama-videos').getPublicUrl(path).data.publicUrl;
}
function subtitleFileToVtt(file){
  return file.text().then(raw=>{
    const value=raw.replace(/^\uFEFF/,'').trim();
    if(/\.srt$/i.test(file.name)||/^\d+\s*\r?\n\d{2}:\d{2}:\d{2},\d{3}/m.test(value))
      return 'WEBVTT\n\n'+value.replace(/^(\d{2}:\d{2}:\d{2}),(\d{3})/gm,'$1.$2');
    if(!/^WEBVTT(?:\s|$)/.test(value))throw new Error('Subtitle must be a valid .VTT or .SRT file.');
    return value;
  });
}

async function renderAdmin() {
  if(!supabase){renderAdminLogin('Supabase is not configured.');return;}
  const {data: allowed,error: roleError}=await supabase.rpc('is_nexora_owner');
  if(roleError||allowed!==true){await supabase.auth.signOut();renderAdminLogin('Owner authorization is required.');return;}
  const {data: videos,error}=await supabase.from('dramas').select('*').order('created_at',{ascending:false});
  if(error){
    app.innerHTML='<main class="admin"><section class="panel"><h1>Owner dashboard unavailable</h1><p class="warning">'+esc(error.message)+'</p><button class="gold-outline" id="back">VIEW APP</button></section></main>';
    document.querySelector('#back').onclick=()=>{view='feed';render();}; return;
  }
  const ownerVideos=videos||[];
  app.innerHTML='<header class="top"><div class="brand"><img class="brand-logo" src="/nexora-logo.svg" alt="NEXORA logo"><div><b>NEXORA</b><small>PRIVATE OWNER PANEL</small></div></div><button class="gold-outline" id="signOut">SIGN OUT</button></header>' +
  '<main class="admin"><section class="panel"><div class="eyebrow">CONTENT MANAGEMENT</div><h1>Owner dashboard</h1><p class="muted">Published dramas are stored in a shared database. Only authorized owner accounts can publish or remove content.</p>' +
  '<form id="addForm"><label>Drama title<input name="title" required maxlength="120" placeholder="e.g. The Secret Heiress"></label><div class="two"><label>Episode<input name="episode" maxlength="80" placeholder="Episode 1"></label><label>Category<select name="category"><option>Romance</option><option>Revenge</option><option>Family</option><option>Comedy</option><option>Action</option><option>Thriller</option><option>Fantasy</option><option>Other</option></select></label></div>' +
  '<label>Upload video file (MP4, WebM, or MOV · max 500 MB)<input name="videoFile" type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"></label><p class="muted">Choose a video from your phone, or use a direct HTTPS video URL below. Do not paste a TikTok page link; it is not a playable video file.</p><label>Or direct video URL (optional)<input name="url" type="url" placeholder="https://your-authorized-host/video.mp4"></label><label>Poster image URL (optional; otherwise captured from your video)<input name="poster" type="url" placeholder="https://..."></label><label>Subtitles (optional .VTT or .SRT)<input name="subtitleFile" type="file" accept=".vtt,.srt,text/vtt,application/x-subrip"></label><small class="muted">Subtitles stay off unless a valid subtitle file is uploaded.</small>' +
  '<div class="two"><label>Creator name<input name="creator" required maxlength="120" placeholder="Original creator"></label><label>Original source URL<input name="source" type="url" required placeholder="https://original-post..."></label></div>' +
  '<label class="check"><input name="permission" type="checkbox" required> I confirm I have permission or a license for this video to be played in this app.</label><button class="gold" type="submit">PUBLISH DRAMA</button></form></section>' +
  '<section class="panel"><h2>Published videos ('+ownerVideos.length+')</h2><button id="repairThumbnails" class="gold-outline" type="button">REPAIR MISSING VIDEO THUMBNAILS</button><p class="muted">Repairs old uploads stored in NEXORA storage using a real frame from each original video.</p><div id="adminList">'+(ownerVideos.map(x=>'<div class="adminrow"><div><b>'+esc(x.title)+'</b><small>'+esc(x.episode)+' · '+esc(x.category)+' · '+esc(x.creator)+'</small></div><button data-delete="'+esc(x.id)+'" class="delete">REMOVE</button></div>').join('')||'<p class="muted">No owner videos published yet.</p>')+'</div></section></main>';
  document.querySelector('#signOut').onclick=async()=>{await supabase.auth.signOut();view='feed';render();};
  document.querySelector('#repairThumbnails').onclick=async()=>{
    const button=document.querySelector('#repairThumbnails');
    const repairable=ownerVideos.filter(v=>!v.poster_url&&v.video_storage_path);
    if(!repairable.length){alert('No missing thumbnails for videos stored in NEXORA storage. Direct external video URLs may need a manually supplied poster image.');return;}
    button.disabled=true;let fixed=0,failed=0;
    for(const entry of repairable){
      button.textContent='REPAIRING '+(fixed+failed+1)+' / '+repairable.length+'…';
      try{
        const {data:blob,error:downloadError}=await supabase.storage.from('nexora-drama-videos').download(entry.video_storage_path);
        if(downloadError)throw downloadError;
        const frame=await captureDramaThumbnail(blob);if(!frame)throw new Error('Could not capture a video frame');
        const posterPath=entry.video_storage_path+'.jpg';
        const posterUrl=await uploadDramaAsset(posterPath,frame,'image/jpeg');
        const {error:updateError}=await supabase.from('dramas').update({poster_url:posterUrl,poster_storage_path:posterPath}).eq('id',entry.id);
        if(updateError)throw updateError;
        fixed++;
      }catch(err){failed++;console.warn('Thumbnail repair failed for '+entry.title,err);}
    }
    alert('Thumbnail repair complete. Fixed: '+fixed+'. Could not repair: '+failed+'.');
    await loadCloudDramas();await renderAdmin();
  };
  document.querySelector('#addForm').onsubmit=async e=>{
    e.preventDefault();
    const form=e.currentTarget,submit=form.querySelector('button[type="submit"]');
    submit.disabled=true;submit.textContent='PUBLISHING…';
    const f=new FormData(form),file=form.elements.videoFile.files?.[0]||null,subtitleFile=form.elements.subtitleFile.files?.[0]||null,directUrl=String(f.get('url')||'').trim(),source=String(f.get('source')||'').trim(),poster=String(f.get('poster')||'').trim();
    const allowedTypes=['video/mp4','video/webm','video/quicktime'];
    const allowedExt=/\.(mp4|webm|mov)$/i;
    const inferredFileType=file?(file.name.toLowerCase().endsWith('.webm')?'video/webm':file.name.toLowerCase().endsWith('.mov')?'video/quicktime':'video/mp4'):'';
    if((!file&&!/^https:\/\//i.test(directUrl))||(file&&((file.type&&!allowedTypes.includes(file.type))||!allowedExt.test(file.name)))||(file&&file.size>524288000)||!/^https:\/\//i.test(source)||(poster&&!/^https:\/\//i.test(poster))||f.get('permission')!=='on'){
      alert('Choose an MP4, WebM, or MOV file up to 500 MB, or enter a direct HTTPS video URL. Add the original HTTPS source and confirm publishing rights.');
      submit.disabled=false;submit.textContent='PUBLISH DRAMA';return;
    }
    let videoUrl=directUrl,storagePath=null,published=false,posterUrl=poster,subtitleUrl=null,posterPath=null,subtitlePath=null,frameBlob=null;
    try {
      if(file){
        submit.textContent='CAPTURING REAL VIDEO FRAME…';
        frameBlob=await captureDramaThumbnail(file);
        submit.textContent='UPLOADING VIDEO…';
        const {data:userData,error:userError}=await supabase.auth.getUser();
        if(userError||!userData?.user) throw new Error('Your owner session expired. Sign in again.');
        const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100);
        storagePath=userData.user.id+'/'+Date.now()+'-'+safeName;
        const {error:uploadError}=await supabase.storage.from('nexora-drama-videos').upload(storagePath,file,{contentType:file.type||inferredFileType,upsert:false,cacheControl:'3600'});
        if(uploadError) throw uploadError;
        videoUrl=supabase.storage.from('nexora-drama-videos').getPublicUrl(storagePath).data.publicUrl;
      }
      submit.textContent='SAVING VIDEO COVER…';
      if(!posterUrl){
        const frame=typeof frameBlob!=='undefined'?frameBlob:await captureDramaThumbnail(videoUrl);
        if(frame){posterPath=(storagePath||('external/'+Date.now()))+'.jpg';posterUrl=await uploadDramaAsset(posterPath,frame,'image/jpeg');}
      }
      if(subtitleFile){
        submit.textContent='UPLOADING SUBTITLES…';
        const vtt=await subtitleFileToVtt(subtitleFile);
        subtitlePath=(storagePath||('external/'+Date.now()))+'.vtt';
        subtitleUrl=await uploadDramaAsset(subtitlePath,new Blob([vtt],{type:'text/vtt'}),'text/vtt');
      }
      const {error:insertError}=await supabase.from('dramas').insert({
        title:String(f.get('title')||'').trim(),episode:String(f.get('episode')||'Episode 1').trim()||'Episode 1',
        category:String(f.get('category')||'Other'),video_url:videoUrl,video_storage_path:storagePath,poster_url:posterUrl||null,poster_storage_path:posterPath,subtitle_url:subtitleUrl,subtitle_storage_path:subtitlePath,
        creator:String(f.get('creator')||'').trim(),source_url:source,permission_confirmed:true,published:true
      });
      if(insertError) throw insertError;
      published=true;
      await loadCloudDramas();await renderAdmin();
    } catch(error) {
      if(!published){const cleanup=[storagePath,posterPath,subtitlePath].filter(Boolean);if(cleanup.length)await supabase.storage.from('nexora-drama-videos').remove(cleanup).catch(()=>{});}
      alert('Could not publish drama: '+(error?.message||'Please check your connection and try again.'));
      submit.disabled=false;submit.textContent='PUBLISH DRAMA';
    }
  };
  document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{
    if(!confirm('Remove this published drama for everyone?'))return;
    b.disabled=true;
    const selected=ownerVideos.find(x=>x.id===b.dataset.delete);
    const {error: deleteError}=await supabase.from('dramas').delete().eq('id',b.dataset.delete);
    if(deleteError){alert('Could not remove drama: '+deleteError.message);b.disabled=false;return;}
    const assetPaths=[selected?.video_storage_path,selected?.poster_storage_path,selected?.subtitle_storage_path].filter(Boolean);
    if(assetPaths.length){const {error:storageError}=await supabase.storage.from('nexora-drama-videos').remove(assetPaths);if(storageError)console.warn('Drama removed but some stored media could not be deleted:',storageError.message);}
    items=items.filter(x=>x.id!==b.dataset.delete);await renderAdmin();
  });
}
async function loadCloudDramas() {
  if(!supabase)return;
  let {data,error}=await supabase.from('dramas').select('id,title,episode,category,video_url,poster_url,subtitle_url,creator,source_url,watch_count').eq('published',true).order('created_at',{ascending:false});
  if(error && /subtitle_url|column/i.test(error.message)) {
    const fallback=await supabase.from('dramas').select('id,title,episode,category,video_url,poster_url,creator,source_url,watch_count').eq('published',true).order('created_at',{ascending:false});
    data=fallback.data;error=fallback.error;
  }
  if(error && /watch_count|column/i.test(error.message)) {
    const fallback=await supabase.from('dramas').select('id,title,episode,category,video_url,poster_url,creator,source_url').eq('published',true).order('created_at',{ascending:false});
    data=fallback.data; error=fallback.error;
  }
  if(error){console.warn('NEXORA cloud library could not load:',error.message);return;}
  const cloud=(data||[]).map(row=>({id:row.id,title:row.title,episode:row.episode,category:row.category,creator:row.creator,source:row.source_url,license:'Owner-confirmed permission',url:row.video_url,poster:row.poster_url||'',subtitle:row.subtitle_url||'',watchCount:Number(row.watch_count||0)}));

  const demoIds=new Set(seed.map(x=>x.id)),cloudIds=new Set(cloud.map(x=>x.id));
  items=[...seed,...cloud,...items.filter(x=>!demoIds.has(x.id)&&!cloudIds.has(x.id))];
  if (pendingResumeId) {
    const resumeIndex=items.findIndex(entry=>entry.id===pendingResumeId);
    if (resumeIndex>=0) { active=resumeIndex; view='feed'; pendingResumeId=''; render(); return; }
  }
  if(view==='feed'||view==='home'||view==='search')render();
}
shell();
initializePhoneNotifications();
loadCloudDramas();
// Refresh the shared published catalogue when another authorized publisher uploads an episode.
if (supabase) {
  supabase.channel('nexora-drama-published-feed')
    .on('postgres_changes', {event:'*', schema:'public', table:'dramas'}, () => loadCloudDramas())
    .subscribe();
}
// Fallback refresh also covers projects where Supabase Realtime is not enabled for this table.
window.setInterval(() => {
  if (document.visibilityState === 'visible') loadCloudDramas();
}, 30000);
