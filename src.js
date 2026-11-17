import './style.css';
import { createClient } from '@supabase/supabase-js';
import { renderStoryMode } from './story-mode.js';
import { Browser } from '@capacitor/browser';
import { registerPlugin } from '@capacitor/core';
const ApkInstaller = registerPlugin('ApkInstaller');
import { Capacitor } from '@capacitor/core';
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


let updateDownload = {status:'idle', path:'', message:''};
function refreshUpdateUI() {
  const status = document.querySelector('#updateStatus');
  if (status) status.textContent = updateInfo.message;
  const action = document.querySelector('#updateAction');
  if (action) { action.hidden = updateInfo.status !== 'available'; action.textContent = 'DOWNLOAD UPDATE'; action.onclick = startUpdateFlow; }
  const popupAction = document.querySelector('#popupUpdateNow');
  if (popupAction) popupAction.textContent = 'DOWNLOAD UPDATE';
}
async function startUpdateFlow() {
  if (APP_STORE_DISTRIBUTION) {
    updateInfo.message = 'Updates are managed by the app store where you installed NEXORA.';
    refreshUpdateUI();
    return;
  }
  const downloadUrl = updateInfo.url;
  if (!downloadUrl) {
    updateInfo.message = 'The update download is not available yet. Please try again later.';
    refreshUpdateUI();
    return;
  }
  if (Capacitor.isNativePlatform()) {
    updateInfo.message = 'Downloading the official NEXORA APK…';
    refreshUpdateUI();
    const action = document.querySelector('#updateAction');
    if (action) { action.disabled = true; action.textContent = 'DOWNLOADING…'; }
    const popupAction = document.querySelector('#popupUpdateNow');
    if (popupAction) { popupAction.disabled = true; popupAction.textContent = 'DOWNLOADING…'; }
    try {
      const result = await ApkInstaller.downloadAndInstall({url: downloadUrl});
      if (result?.requiresPermission) {
        updateInfo.message = 'Allow NEXORA to install unknown apps in Android settings, return here, and tap UPDATE NOW again.';
      } else {
        updateInfo.message = 'APK downloaded. Android package installer opened; approve the update to finish.';
      }
    } catch (error) {
      updateInfo.message = 'Update could not start: ' + (error?.message || 'Please try again.');
    } finally {
      refreshUpdateUI();
      const nextAction = document.querySelector('#updateAction');
      if (nextAction) { nextAction.disabled = false; nextAction.textContent = 'DOWNLOAD UPDATE'; }
      const nextPopupAction = document.querySelector('#popupUpdateNow');
      if (nextPopupAction) { nextPopupAction.disabled = false; nextPopupAction.textContent = 'UPDATE NOW'; }
    }
    return;
  }
  try { window.location.href = downloadUrl; }
  catch (_) { await Browser.open({url: downloadUrl}); }
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
const APP_STORE_DISTRIBUTION = import.meta.env.VITE_APP_STORE_DISTRIBUTION === 'true';
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

async function performUpdateCheck() {
  try {
    const localRes = await fetch('/app-version.json', {cache:'no-store'});
    if (!localRes.ok) throw new Error('App version metadata unavailable');
    const local = await localRes.json();
    if (APP_STORE_DISTRIBUTION) {
      updateInfo = {
        status:'current',
        installed:local.versionName || 'Unknown',
        latest:'Managed by app store',
        url:'',
        message:'Updates are delivered through the app store where you installed NEXORA.'
      };
    } else {
      const remoteRes = await fetch(`https://api.github.com/repos/${APP_REPO}/releases/latest`, {headers:{Accept:'application/vnd.github+json'}, cache:'no-store'});
      if (!remoteRes.ok) throw new Error('Update service unavailable');
      const release = await remoteRes.json();
      const latestCode = Number(String(release.tag_name || '').match(/^v\d+\.\d+\.(\d+)$/)?.[1] || 0);
      const installedCode = Number(local.versionCode || 0);
      const apk = (release.assets || []).find(item => item.name === 'NEXORA-AI-DRAMA.apk' && /^https:\/\/github\.com\/cedrickdavebausinbajar-afk\/nexora-ai-drama\/releases\/download\//i.test(item.browser_download_url || ''));
      const newerVersion = latestCode > installedCode;
      const downloadUrl = apk?.browser_download_url || (!Capacitor.isNativePlatform() ? (release.html_url || '') : '');
      updateInfo = {
        status:newerVersion ? (downloadUrl ? 'available' : 'error') : 'current',
        installed:local.versionName || 'Unknown',
        latest:release.tag_name || 'Unknown',
        url:downloadUrl,
        message:newerVersion ? (downloadUrl ? 'A new version is ready. Download the official APK and approve the Android installer.' : 'A newer version was found, but its official APK asset is not published yet. Please try again later.') : 'Your app is up to date!'
      };
    }
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
    return updateInfo;
}

const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
let updateCheckPromise = null;
let lastUpdateCheckAt = 0;
async function checkForUpdates(force = false) {
  if (updateCheckPromise) return updateCheckPromise;
  if (!force && Date.now() - lastUpdateCheckAt < UPDATE_CHECK_INTERVAL_MS) return updateInfo;
  lastUpdateCheckAt = Date.now();
  updateCheckPromise = performUpdateCheck();
  try { return await updateCheckPromise; }
  finally { updateCheckPromise = null; }
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
let ownerFlowActive = false;
const WATCH_PROGRESS_KEY = 'nexora-watch-progress-v1';
const WATCH_NOTIFICATION_ID = 7301;
let pendingResumeId = '';
let activePlayerController = null;
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
  document.querySelector('#adminOpen').onclick = () => { closeMenu(); ownerFlowActive = true; adminGate(); };
  document.onkeydown = e => { if (e.key === 'Escape' && !drawer.hidden) { closeMenu(); document.querySelector('#menuOpen')?.focus(); } };
  renderScreen();
  checkForUpdates();
}
function render() { shell(); }
function renderScreen() {
  activePlayerController?.abort();
  activePlayerController = null;
  const screen = document.querySelector('#screen');
  if (!screen) return;
  if (view === 'home') {
    const uploadedVideos = items.filter(x => !builtInIds.has(x.id) && x.url);
    const trendingDramas = [...uploadedVideos].sort((a,b)=>Number(b.watchCount||0)-Number(a.watchCount||0)).slice(0,8);
    const latestEpisodes = uploadedVideos.slice(0,8);
    const genreShelves = [...new Set(uploadedVideos.map(x=>String(x.category||'').trim()).filter(Boolean))]
      .slice(0,6).map(genre=>{
        const matches=uploadedVideos.filter(x=>String(x.category||'').toLowerCase()===genre.toLowerCase()).slice(0,8);
        return matches.length ? `<h2>${esc(genre)} Dramas</h2><div class="home-published genre-shelf">${matches.map(card).join('')}</div>` : '';
      }).join('');
    const emptyLibrary = '<p class="muted">Your streaming library is ready. Publish licensed videos from the Owner Dashboard and they will appear here automatically.</p>';
    screen.innerHTML = `<section class="db-home"><div class="db-greeting"><span class="db-kicker">NEXORA STREAMING</span><h1>Discover your next favorite drama.</h1><p>Explore trending stories, new episodes and creator-authorized videos.</p></div><h2>Trending Now</h2><div class="home-published popular-drama">${trendingDramas.length ? trendingDramas.map(card).join('') : emptyLibrary}</div><h2>New Episodes</h2><div class="home-published latest-episodes">${latestEpisodes.length ? latestEpisodes.map(card).join('') : '<p class="muted">New episodes will appear here as soon as they are published.</p>'}</div>${genreShelves}<section class="db-story-only"><h2>Drama Story Only</h2><p class="muted">Read and write drama stories in text only. No videos in this section.</p><div class="db-story-actions"><button id="dbRead">▤　READ TEXT STORIES</button><button id="dbCreate">＋　WRITE A STORY</button></div></section><div class="db-feature-row"><button data-go="shorts">DRAMA SHORTS</button><button data-go="saved">SAVED DRAMAS</button><button data-go="search">SEARCH</button></div></section>`;
    wireCards();
    screen.querySelector('#dbRead').onclick=()=>{view='stories';render();};
    screen.querySelector('#dbCreate').onclick=()=>{view='stories';render();};
    screen.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{view=b.dataset.go;render();});
    return;
  }
  if (view === 'stories') { renderStoryMode(screen, () => { view='feed'; render(); }); return; }
  if (view === 'updates') {
    screen.innerHTML = `<section class="panel update-panel"><div class="eyebrow">NEXORA SOFTWARE UPDATE</div><h1>Keep your app up to date</h1><p id="updateStatus" class="update-status">${esc(updateInfo.message)}</p><p id="updateVersions" class="muted">Installed: ${esc(updateInfo.installed || 'Checking…')} · Latest: ${esc(updateInfo.latest || 'Checking…')}</p><div class="update-actions"><button class="gold" id="checkUpdates">CHECK FOR UPDATES</button><button class="gold-outline" id="updateAction" hidden>UPDATE NOW</button></div><small class="muted">${APP_STORE_DISTRIBUTION ? 'Updates are delivered through the app store where you installed NEXORA.' : 'Android updates download directly from NEXORA. After the APK downloads, approve the Android installer. This direct APK channel does not use Google Play.'}</small></section>`;
    document.querySelector('#checkUpdates').onclick=()=>{updateDownload={status:'idle',path:'',message:''};document.querySelector('#updateStatus').textContent='Checking for updates…';checkForUpdates(true);};
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
  const seriesRootId=x.parentDramaId||x.id;
  const seriesEpisodes=items.filter(entry=>entry.id===seriesRootId||entry.parentDramaId===seriesRootId).sort((a,b)=>(a.episodeNumber||1)-(b.episodeNumber||1));
  const playbackUrl = x.url || (x.videoStoragePath && supabase
    ? supabase.storage.from('nexora-drama-videos').getPublicUrl(x.videoStoragePath).data.publicUrl
    : '');
  const peerTubeId = String(playbackUrl || '').match(/(?:webseed|download\/videos)\/([0-9a-f-]{36})/i)?.[1];
  const peerTubeEmbed = peerTubeId
    ? `https://video.blender.org/videos/embed/${peerTubeId}?p2p=0&warningTitle=0`
    : null;
  const youtubeId = String(playbackUrl || '').match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1];
  const youtubeEmbed = youtubeId ? `https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0` : null;
  const embeddedPlayer = peerTubeEmbed || youtubeEmbed;
  screen.innerHTML = `<section class="player-wrap">
<div class="player" id="player">
  <button type="button" id="volumeToggle" class="volume-toggle" aria-label="Unmute video" aria-pressed="false" title="Turn sound on">🔇 <span>SOUND OFF</span></button>
  <button type="button" id="fullscreenPlayer" class="fullscreen-player" aria-label="Enter full screen" title="Full screen">⛶ <span>FULL SCREEN</span></button>
  ${embeddedPlayer
    ? `<iframe class="peer-player" src="${embeddedPlayer}" title="Watch ${esc(x.title)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen loading="eager" referrerpolicy="strict-origin-when-cross-origin"></iframe>`
    : `<video id="dramaVideo" controls playsinline webkit-playsinline preload="metadata" poster="${esc(x.poster||'')}">Your device cannot play this video.</video>
    <button id="nexoraPlayButton" class="nexora-play-button" type="button" aria-label="Play video">
      <span class="nexora-play-orbit" aria-hidden="true"></span><span class="nexora-play-icon" aria-hidden="true">▶</span>
      <span class="nexora-play-label">PLAY EPISODE</span>
    </button>
    <div id="videoLoading" class="video-loading" hidden><span class="video-loading-spinner"></span><span>PREPARING VIDEO…</span></div>
    <div id="videoError" class="video-error" hidden><span id="videoErrorMessage">Video could not load. Check your internet connection, then tap RETRY.</span><button id="retryVideo" type="button">RETRY</button></div>`}
  <div class="shade"></div>
  <div class="meta"><span class="tag">${esc(x.category||'DRAMA')}</span><h2>${esc(x.title)}</h2>
  <p>${esc(x.episode||'EPISODE 1')} · ${esc(x.creator||'Creator not listed')}</p>
  ${x.source?`<a href="${esc(x.source)}" target="_blank" rel="noopener">Creator / film website ↗</a>`:''}
  <small class="license">${esc(x.license||'Creator-authorized video')}</small></div>
  <div class="actions"><button id="like" class="action">${liked.has(x.id)?'♥':'♡'}<small>SAVE</small></button><button id="share" class="action">↗<small>SHARE</small></button></div>
</div>
<section class="episode-picker"><h3>WATCH EPISODES</h3><p>${esc(x.title)}</p><div class="episode-list">${seriesEpisodes.map(entry=>'<button type="button" class="episode-choice '+(entry.id===x.id?'active':'')+'" data-episode-play="'+esc(entry.id)+'"><b>EP '+(entry.episodeNumber||1)+'</b><span>'+esc(entry.episode||('Episode '+(entry.episodeNumber||1)))+'</span></button>').join('')}</div></section>
<div class="feed-controls"><button id="prev" ${active===0?'disabled':''}>↑ PREVIOUS</button><span>${active+1} / ${items.length}</span><button id="nextText" ${active===items.length-1?'disabled':''}>NEXT ↓</button></div>
<p class="credit">Credit: ${esc(x.creator||'Not provided')} · ${esc(x.license||'Authorized content')}. <a href="${esc(x.source||'#')}" target="_blank" rel="noopener">Source and license details ↗</a></p>
</section>`;
  const playerController = new AbortController();
  activePlayerController = playerController;
  const playerSignal = playerController.signal;
  document.querySelectorAll('[data-episode-play]').forEach(button=>button.onclick=()=>{const nextIndex=items.findIndex(entry=>entry.id===button.dataset.episodePlay);if(nextIndex>=0){active=nextIndex;render();}});
  const playerFrame = document.querySelector('#player');
  const fullscreenButton = document.querySelector('#fullscreenPlayer');
  const video = document.querySelector('#dramaVideo');
  const savePlaybackPosition = () => {
    if (!video || video.ended || !Number.isFinite(video.currentTime)) return;
    try {
      localStorage.setItem(WATCH_PROGRESS_KEY, JSON.stringify({
        id:x.id,title:x.title,episode:x.episode||'Episode',
        time:Math.floor(video.currentTime),updatedAt:Date.now()
      }));
    } catch {}
  };
  if (fullscreenButton && playerFrame) {
    let fullscreenWasActive = false;
    let fullscreenSnapshot = null;
    const restoreFullscreenPlayback = () => {
      if (!video || !fullscreenSnapshot) return;
      const snapshot = fullscreenSnapshot;
      fullscreenSnapshot = null;
      requestAnimationFrame(() => {
        if (video.currentTime < snapshot.time - 2) video.currentTime = snapshot.time;
        if (snapshot.wasPlaying && video.paused) video.play().catch(() => {});
        savePlaybackPosition();
      });
    };
    const syncFullscreenLabel = () => {
      const activeFullscreen = document.fullscreenElement === playerFrame || document.webkitFullscreenElement === playerFrame;
      if (activeFullscreen && !fullscreenWasActive && video) {
        fullscreenSnapshot = {time:video.currentTime,wasPlaying:!video.paused};
        savePlaybackPosition();
      } else if (!activeFullscreen && fullscreenWasActive) {
        restoreFullscreenPlayback();
      }
      fullscreenWasActive = activeFullscreen;
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
        } else if (video?.webkitEnterFullscreen) {
          fullscreenSnapshot = {time:video.currentTime,wasPlaying:!video.paused};
          savePlaybackPosition();
          video.webkitEnterFullscreen();
        } else {
          console.warn('Fullscreen is not supported on this device.');
        }
      } catch (err) {
        if (video?.webkitEnterFullscreen) {
          fullscreenSnapshot = {time:video.currentTime,wasPlaying:!video.paused};
          savePlaybackPosition();
          video.webkitEnterFullscreen();
        } else {
          console.warn('Could not open fullscreen. Video playback was not restarted.');
        }
      }
      syncFullscreenLabel();
    };
    document.addEventListener('fullscreenchange', syncFullscreenLabel, {signal:playerSignal});
    document.addEventListener('webkitfullscreenchange', syncFullscreenLabel, {signal:playerSignal});
    if (video) {
      video.addEventListener('webkitbeginfullscreen', () => {
        fullscreenSnapshot = {time:video.currentTime,wasPlaying:!video.paused};
        savePlaybackPosition();
      });
      video.addEventListener('webkitendfullscreen', restoreFullscreenPlayback);
    }
  }
  if (video) {
    // Register diagnostics before starting media loading; Android WebView can fail quickly.
    video.removeAttribute('src');
    video.querySelectorAll('source').forEach(source => source.remove());
    video.preload = 'auto';
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

    const errorBox = document.querySelector('#videoError');
    const errorMessage = document.querySelector('#videoErrorMessage');
    const premiumPlayButton = document.querySelector('#nexoraPlayButton');
    const videoLoading = document.querySelector('#videoLoading');
    const syncPremiumPlayButton = () => {
      if (!premiumPlayButton) return;
      const show = video.paused || video.ended;
      premiumPlayButton.hidden = !show;
      premiumPlayButton.setAttribute('aria-label', video.ended ? 'Replay video' : 'Play video');
      const label = premiumPlayButton.querySelector('.nexora-play-label');
      if (label) label.textContent = video.ended ? 'REPLAY EPISODE' : 'PLAY EPISODE';
    };
    if (premiumPlayButton) premiumPlayButton.addEventListener('click', async () => {
      if (video.ended) { try { video.currentTime = 0; } catch {} }
      if (errorBox) errorBox.hidden = true;
      if (videoLoading) videoLoading.hidden = false;
      premiumPlayButton.disabled = true;
      try {
        await video.play();
      } catch (err) {
        if (videoLoading) videoLoading.hidden = true;
        premiumPlayButton.disabled = false;
        syncPremiumPlayButton();
        if (errorMessage) errorMessage.textContent = err?.name === 'NotAllowedError'
          ? 'Tap PLAY EPISODE again to allow playback, or use the video controls.'
          : 'Playback could not start. Check your connection and tap RETRY.';
        if (errorBox) errorBox.hidden = false;
      }
    });
    video.addEventListener('play', () => {
      if (videoLoading) videoLoading.hidden = false;
      if (premiumPlayButton) premiumPlayButton.hidden = true;
    });
    video.addEventListener('playing', () => {
      if (videoLoading) videoLoading.hidden = true;
      if (premiumPlayButton) premiumPlayButton.hidden = true;
      if (errorBox) errorBox.hidden = true;
    });
    video.addEventListener('waiting', () => { if (videoLoading) videoLoading.hidden = false; });
    video.addEventListener('canplay', () => {
      if (videoLoading) videoLoading.hidden = true;
      if (errorBox) errorBox.hidden = true;
    });
    video.addEventListener('pause', () => {
      if (videoLoading) videoLoading.hidden = true;
      syncPremiumPlayButton();
    });
    video.addEventListener('ended', () => {
      if (videoLoading) videoLoading.hidden = true;
      syncPremiumPlayButton();
    });
    syncPremiumPlayButton();
    video.addEventListener('play', () => {
      trackNexoraEvent('drama_play_start', {content_title: x.title || 'unknown', content_category: x.category || 'unknown'});
    });
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
        else x.watchCount = Number(x.watchCount || 0) + 1;
      });
    };
    video.addEventListener('canplay', () => { if (errorBox) errorBox.hidden = true; });
    video.addEventListener('playing', () => {
      if (errorBox) errorBox.hidden = true;
      if (!playbackStartedAt) playbackStartedAt = Date.now();
    });
    video.addEventListener('playing', () => { cancelContinueNotification(); });
    video.addEventListener('timeupdate', () => {
      maybeRecordDramaView();
      if (Math.abs(video.currentTime - lastProgressWrite) < 2) return;
      lastProgressWrite = video.currentTime;
      savePlaybackPosition();
    });
    video.addEventListener('seeked', savePlaybackPosition);
    const saveResumeReminder = () => {
      if (!video.ended && video.currentTime >= 30 && (!video.duration || video.duration - video.currentTime > 5)) {
        scheduleContinueNotification(x, video.currentTime);
      }
    };
    video.addEventListener('pause', () => {
      savePlaybackPosition();
      if (playbackStartedAt) {
        accumulatedPlaybackMs += Date.now() - playbackStartedAt;
        playbackStartedAt = 0;
        maybeRecordDramaView();
      }
      saveResumeReminder();
    });
    // Android can background the WebView without delivering a normal pause event.
    // Persist the exact playback point and schedule the same reminder in that case.
    document.addEventListener('visibilitychange', () => {
      // Save the exact position before Android backgrounds the WebView or opens another activity.
      if (document.hidden) {
        savePlaybackPosition();
        saveResumeReminder();
      } else if (!video.paused) cancelContinueNotification();
    }, {signal:playerSignal});
    window.addEventListener('pagehide', () => {
      // pagehide may run during an app close while playback is still marked active.
      savePlaybackPosition();
      saveResumeReminder();
    }, {signal:playerSignal});
    video.addEventListener('ended', () => {
      if (playbackStartedAt) {
        accumulatedPlaybackMs += Date.now() - playbackStartedAt;
        playbackStartedAt = 0;
        maybeRecordDramaView();
      }
      cancelContinueNotification();
      try { const p=JSON.parse(localStorage.getItem(WATCH_PROGRESS_KEY)||'null'); if(p?.id===x.id) localStorage.removeItem(WATCH_PROGRESS_KEY); } catch {}
    });
    video.addEventListener('error', () => {
      const code = video.error?.code;
      const messages = {
        1: 'Playback was interrupted. Tap RETRY to continue.',
        2: 'A network error stopped this video. Check your connection, then retry.',
        3: 'This video uses a format or codec your device cannot play. Upload an MP4 encoded with H.264 video and AAC audio.',
        4: 'The video URL is unavailable or its format is unsupported. Check the published video file.'
      };
      if (errorMessage) errorMessage.textContent = messages[code] || 'Video could not load. Check the video link and your internet connection, then retry.';
      if (errorBox) errorBox.hidden = false;
    });
    document.querySelector('#retryVideo').onclick = () => {
      if (errorBox) errorBox.hidden = true;
      const source = playbackUrl || video.currentSrc || video.src;
      if (!source) {
        if (errorMessage) errorMessage.textContent = 'This episode has no playable video URL. Ask the owner to republish the video.';
        if (errorBox) errorBox.hidden = false;
        return;
      }
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.src = source;
      video.load();
    };
    // Start the request only after every playback/error listener is attached.
    if (playbackUrl) { video.src = playbackUrl; video.load(); }
    else {
      if (errorMessage) errorMessage.textContent = 'This episode has no playable video URL. Ask the owner to republish the video.';
      if (errorBox) errorBox.hidden = false;
    }
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
  const title = esc(x.title || 'Untitled drama');
  return `<article class="rowcard home-video-card">
    <div class="home-video-thumb">
      <img class="mini-poster" ${x.poster ? 'src="' + esc(x.poster) + '"' : 'hidden'} data-video-thumbnail="${esc(x.id)}" alt="Real video thumbnail for ${title}">
      <div class="home-thumb-fallback" ${x.poster ? 'hidden' : ''}><span>✦ NEXORA AI DRAMA</span><b>${title}</b><small>LOADING VIDEO FRAME…</small></div>
      <span class="home-thumb-play" aria-hidden="true">▶</span>
    </div>
    <div class="home-video-copy"><b>${title}</b><small>${esc(x.category || 'Drama')} · ${esc(x.episode || 'Episode 1')}</small><p>${esc(x.creator || 'Creator not listed')}</p><button class="gold-outline" data-play="${esc(x.id)}">WATCH DRAMA</button></div>
  </article>`;
}
function hydrateMissingDramaThumbnails(root = document) {
  root.querySelectorAll('img[data-video-thumbnail]').forEach(img => {
    const entry = items.find(item => item.id === img.dataset.videoThumbnail);
    if (!entry || img.dataset.hydrating === '1' || img.dataset.generated === '1') return;
    const fallback = img.nextElementSibling;
    const generate = async () => {
      if (img.dataset.hydrating === '1' || img.dataset.generated === '1') return;
      img.dataset.hydrating = '1';
      try {
        const frame = await captureDramaThumbnail(entry.url);
        if (!frame) throw new Error('Video frame unavailable');
        const previewUrl = URL.createObjectURL(frame);
        img.addEventListener('load', () => URL.revokeObjectURL(previewUrl), {once:true});
        img.addEventListener('error', () => URL.revokeObjectURL(previewUrl), {once:true});
        img.src = previewUrl;
        img.hidden = false;
        img.dataset.generated = '1';
        if (fallback) fallback.hidden = true;
      } catch (_) {
        img.hidden = true;
        if (fallback) fallback.hidden = false;
        const note = fallback?.querySelector('small');
        if (note) note.textContent = 'VIDEO THUMBNAIL NOT AVAILABLE';
      } finally {
        img.dataset.hydrating = '0';
      }
    };
    img.addEventListener('load', () => {
      if (img.naturalWidth > 0) {
        img.hidden = false;
        if (fallback) fallback.hidden = true;
      }
    }, {once:true});
    img.addEventListener('error', generate, {once:true});
    if (!img.getAttribute('src') || (img.complete && img.naturalWidth === 0)) generate();
    else if (img.complete && img.naturalWidth > 0) {
      img.hidden = false;
      if (fallback) fallback.hidden = true;
    }
  });
}
function wireCards() {
  const cardRoot = document.querySelector('#screen') || document;
  hydrateMissingDramaThumbnails(cardRoot);
  document.querySelectorAll('[data-play]').forEach(b => b.onclick = () => {
    const index = items.findIndex(x => x.id === b.dataset.play);
    if (index >= 0) { active = index; view = 'feed'; render(); }
  });
}
let adminGatePromise = null;
async function adminGate() {
  // Keep the owner flow on-screen while authentication/role checks run.
  // Previously, an auth/network/RPC rejection could leave the app in an
  // ambiguous state with no owner-specific recovery UI.
  if (adminGatePromise) return adminGatePromise;
  adminGatePromise = (async () => {
    if (!supabase) {
      renderAdminLogin('Secure Owner Dashboard is not configured. Check the app Supabase URL and anon key.');
      return;
    }
    app.innerHTML = '<main class="admin"><section class="panel"><div class="eyebrow">SECURE ACCESS</div><h1>Opening Owner Dashboard…</h1><p class="muted" role="status">Checking your owner session and permissions. Please wait.</p><button class="gold-outline" id="ownerCancel" type="button">BACK TO APP</button></section></main>';
    document.querySelector('#ownerCancel')?.addEventListener('click', () => { ownerFlowActive=false; view='feed'; render(); }, {once:true});
    try {
      const {data: sessionData, error: sessionError} = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData?.session) { renderAdminLogin(); return; }
      const {data: allowed, error} = await supabase.rpc('is_nexora_owner');
      if (error) throw error;
      if (allowed !== true) {
        renderAdminLogin('This account is signed in but is not authorized as the NEXORA owner.');
        return;
      }
      await renderAdmin();
    } catch (error) {
      console.error('NEXORA Owner Dashboard access failed:', error);
      app.innerHTML = '<header class="top"><div class="brand"><div><b>NEXORA</b><small>OWNER ACCESS</small></div></div></header><main class="admin"><section class="panel"><div class="eyebrow">CONNECTION / AUTHORIZATION ISSUE</div><h1>Owner Dashboard could not open</h1><p class="warning" role="alert">' + esc(error?.message || 'A secure owner check failed. Please try again.') + '</p><p class="muted">Your app has not been sent back to Home. Retry the owner check, or return to the app.</p><div class="two"><button class="gold" id="ownerRetry" type="button">RETRY</button><button class="gold-outline" id="ownerBack" type="button">BACK TO APP</button></div></section></main>';
      document.querySelector('#ownerRetry')?.addEventListener('click', () => adminGate(), {once:true});
      document.querySelector('#ownerBack')?.addEventListener('click', () => { ownerFlowActive=false; view='feed'; render(); }, {once:true});
    }
  })();
  try { return await adminGatePromise; }
  finally { adminGatePromise = null; }
}
function renderAdminLogin(message = '') {
  app.innerHTML = '<header class="top"><div class="brand"><img class="brand-logo" src="/nexora-logo.svg" alt="NEXORA logo"><div><b>NEXORA</b><small>SECURE OWNER SIGN-IN</small></div></div><button class="gold-outline" id="back">VIEW APP</button></header>' +
  '<main class="admin"><section class="panel"><div class="eyebrow">PRIVATE ACCESS</div><h1>Owner sign-in</h1><p class="muted">Only an account explicitly authorized in the NEXORA database can manage dramas.</p>' +
  '<form id="ownerLogin"><label>Email address<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><p class="warning" id="loginMessage" role="status">' + esc(message) + '</p><button class="gold" type="submit">SIGN IN SECURELY</button></form></section></main>';
  document.querySelector('#back').onclick = () => { ownerFlowActive=false; view='feed'; render(); };
  document.querySelector('#ownerLogin').onsubmit = async e => {
    e.preventDefault();
    const form=e.currentTarget, button=form.querySelector('button[type="submit"]'), status=document.querySelector('#loginMessage');
    button.disabled=true; button.textContent='VERIFYING…'; status.textContent='';
    const values=new FormData(form);
    try {
      const {error}=await supabase.auth.signInWithPassword({email:String(values.get('email')||'').trim(),password:String(values.get('password')||'')});
      if(error) throw error;
      const {data: allowed,error: roleError}=await supabase.rpc('is_nexora_owner');
      if(roleError) throw roleError;
      if(allowed!==true) {
        await supabase.auth.signOut();
        status.textContent='Access denied. This account is not on the NEXORA owner allowlist.';
        button.disabled=false;button.textContent='SIGN IN SECURELY';return;
      }
      await renderAdmin();
    } catch(error) {
      console.error('NEXORA owner sign-in failed:',error);
      status.textContent=error?.message==='Invalid login credentials'
        ? 'Sign-in failed. Check your email and password, then try again.'
        : 'Could not verify owner access. Check your connection and retry.';
      button.disabled=false;button.textContent='SIGN IN SECURELY';
    }
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
    let frameRequested=false;
    const captureFrame=()=>{
      if(frameRequested||!video.videoWidth||!video.videoHeight||video.readyState<2)return false;
      frameRequested=true;
      try{
        const canvas=document.createElement('canvas'),width=640,height=Math.max(1,Math.round(width*video.videoHeight/video.videoWidth));
        canvas.width=width;canvas.height=height;
        const ctx=canvas.getContext('2d');if(!ctx)return finish(null);
        ctx.drawImage(video,0,0,width,height);
        canvas.toBlob(blob=>finish(blob),'image/jpeg',0.84);
        return true;
      }catch{finish(null);return true;}
    };
    let captureAtStart=false;
    video.onloadedmetadata=()=>{
      try{
        const duration=Number(video.duration);
        const target=Number.isFinite(duration)&&duration>0
          ? Math.max(0,Math.min(8,duration*0.12,duration-Math.min(0.05,duration/4)))
          : 0;
        captureAtStart=target<=0.02;
        if(captureAtStart){if(video.readyState>=2)captureFrame();}
        else video.currentTime=target;
      }catch{finish(null);}
    };
    video.onloadeddata=()=>{if(captureAtStart)captureFrame();};
    video.onseeked=()=>{captureFrame();};
    video.src=objectUrl||source;video.load();
  });
}
async function uploadDramaAsset(path,blob,contentType){
  const {error}=await supabase.storage.from('nexora-drama-videos').upload(path,blob,{contentType,upsert:true,cacheControl:'3600'});
  if(error)throw error;
  return supabase.storage.from('nexora-drama-videos').getPublicUrl(path).data.publicUrl;
}
async function uploadDramaVideoWithProgress(path,file,contentType,onProgress){
  const {data,error}=await supabase.auth.getSession();
  if(error)throw error;
  const token=data?.session?.access_token;
  if(!token)throw new Error('Your owner session expired. Sign in again.');
  const objectPath=path.split('/').map(encodeURIComponent).join('/');
  const endpoint=SUPABASE_URL.replace(/\/$/,'')+'/storage/v1/object/nexora-drama-videos/'+objectPath;
  return new Promise((resolve,reject)=>{
    const request=new XMLHttpRequest();
    request.open('POST',endpoint,true);
    request.setRequestHeader('apikey',SUPABASE_ANON_KEY);
    request.setRequestHeader('Authorization','Bearer '+token);
    request.setRequestHeader('Content-Type',contentType);
    request.setRequestHeader('cache-control','3600');
    request.setRequestHeader('x-upsert','false');
    request.upload.onprogress=event=>{
      if(event.lengthComputable&&typeof onProgress==='function')onProgress(Math.min(100,Math.round(event.loaded/event.total*100)),event.loaded,event.total);
    };
    request.onload=()=>{
      if(request.status>=200&&request.status<300){if(onProgress)onProgress(100,file.size,file.size);resolve();}
      else{let detail='Storage returned HTTP '+request.status+'.';try{const body=JSON.parse(request.responseText);detail=body.message||body.error||detail;}catch{}reject(new Error(detail));}
    };
    request.onerror=()=>reject(new Error('Video upload connection failed. Check your internet connection and retry.'));
    request.onabort=()=>reject(new Error('Video upload was cancelled.'));
    request.ontimeout=()=>reject(new Error('Video upload timed out. Please retry.'));
    request.timeout=30*60*1000;
    request.send(file);
  });
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
    app.innerHTML='<main class="admin"><section class="panel"><div class="eyebrow">OWNER DASHBOARD CONNECTION</div><h1>Owner dashboard unavailable</h1><p class="warning" role="alert">'+esc(error.message)+'</p><p class="muted">Your owner session is still active. Retry the dashboard, or safely return to the app.</p><div class="two"><button class="gold" id="retryDashboard" type="button">RETRY DASHBOARD</button><button class="gold-outline" id="back" type="button">VIEW APP</button></div></section></main>';
    document.querySelector('#retryDashboard').onclick=()=>renderAdmin();
    document.querySelector('#back').onclick=()=>{ownerFlowActive=false;view='feed';render();}; return;
  }
  const ownerVideos=videos||[];
  app.innerHTML='<header class="top"><div class="brand"><img class="brand-logo" src="/nexora-logo.svg" alt="NEXORA logo"><div><b>NEXORA</b><small>PRIVATE OWNER PANEL</small></div></div><button class="gold-outline" id="signOut">SIGN OUT</button></header>' +
  '<main class="admin"><section class="panel"><div class="eyebrow">CONTENT MANAGEMENT</div><h1>Owner dashboard</h1><p class="muted">Published dramas are stored in a shared database. Only authorized owner accounts can publish or remove content.</p>' +
  '<form id="addForm"><label>Drama title<input name="title" required maxlength="120" placeholder="e.g. The Secret Heiress"></label><div class="two"><label>Episode label<input name="episode" maxlength="80" placeholder="Episode 1"></label><label>Category<select name="category"><option>Romance</option><option>Revenge</option><option>Family</option><option>Comedy</option><option>Action</option><option>Thriller</option><option>Fantasy</option><option>Other</option></select></label></div>' +
  '<div class="two"><label>Drama series<select name="parentDramaId"><option value="">Create a new drama series</option>'+ownerVideos.filter(v=>!v.parent_drama_id).map(v=>'<option value="'+esc(v.id)+'" data-title="'+esc(v.title)+'">'+esc(v.title)+' · '+esc(v.episode||'Episode 1')+'</option>').join('')+'</select></label><label>Episode number<input name="episodeNumber" type="number" min="1" max="999" value="1" required></label></div><p class="muted">Choose an existing series to add Episode 2, Episode 3, and more. Episodes appear together in Watch Episodes.</p>' +
  '<label>Upload video file (MP4, WebM, or MOV · max 500 MB)<input name="videoFile" type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"></label><p class="muted">Choose a video from your phone, or use a direct HTTPS video URL below. Do not paste a TikTok page link; it is not a playable video file.</p><label>Or direct video URL (optional)<input name="url" type="url" placeholder="https://your-authorized-host/video.mp4"></label><label>Poster image URL (optional; otherwise captured from your video)<input name="poster" type="url" placeholder="https://..."></label><label>Subtitles (optional .VTT or .SRT)<input name="subtitleFile" type="file" accept=".vtt,.srt,text/vtt,application/x-subrip"></label><small class="muted">Subtitles stay off unless a valid subtitle file is uploaded.</small>' +
  '<div class="two"><label>Creator name<input name="creator" required maxlength="120" placeholder="Original creator"></label><label>Original source URL<input name="source" type="url" required placeholder="https://original-post..."></label></div>' +
  '<label class="check"><input name="permission" type="checkbox" required> I confirm I have permission or a license for this video to be played in this app.</label>' +
  '<div id="videoUploadProgress" class="upload-progress" hidden aria-live="polite"><div class="upload-progress-heading"><b id="videoUploadStage">Preparing video…</b><strong id="videoUploadPercent">0%</strong></div><progress id="videoUploadBar" max="100" value="0">0%</progress><small id="videoUploadDetail">Your upload progress will appear here.</small></div>' +
  '<button class="gold" type="submit">PUBLISH DRAMA</button></form></section>' +
  '<section class="panel"><h2>Published videos ('+ownerVideos.length+')</h2><button id="repairThumbnails" class="gold-outline" type="button">REBUILD ALL VIDEO THUMBNAILS</button><p class="muted">Replaces missing or incorrect covers with real frames captured from each uploaded video stored in NEXORA storage.</p><div id="adminList">'+(ownerVideos.map(x=>'<div class="adminrow"><div><b>'+esc(x.title)+'</b><small>'+esc(x.episode)+' · '+esc(x.category)+' · '+esc(x.creator)+'</small></div><button data-delete="'+esc(x.id)+'" class="delete">REMOVE</button></div>').join('')||'<p class="muted">No owner videos published yet.</p>')+'</div></section></main>';
  document.querySelector('#signOut').onclick=async()=>{await supabase.auth.signOut();ownerFlowActive=false;view='feed';render();};
  const seriesSelect=document.querySelector('#addForm [name="parentDramaId"]');
  seriesSelect.onchange=()=>{const selected=ownerVideos.find(v=>v.id===seriesSelect.value);if(selected){document.querySelector('#addForm [name="title"]').value=selected.title;const next=ownerVideos.filter(v=>v.parent_drama_id===selected.id).length+2;document.querySelector('#addForm [name="episodeNumber"]').value=String(next);document.querySelector('#addForm [name="episode"]').value='Episode '+next;}else{document.querySelector('#addForm [name="episodeNumber"]').value='1';document.querySelector('#addForm [name="episode"]').value='Episode 1';}};
  document.querySelector('#repairThumbnails').onclick=async()=>{
    const button=document.querySelector('#repairThumbnails');
    const repairable=ownerVideos.filter(v=>v.video_storage_path);
    if(!repairable.length){alert('No NEXORA-stored videos are available to rebuild. Direct external video URLs need a manually supplied poster image.');return;}
    if(!confirm('Rebuild the thumbnail images for all '+repairable.length+' NEXORA-stored videos using real frames from their video files?'))return;
    button.disabled=true;let fixed=0,failed=0;
    for(const entry of repairable){
      button.textContent='REBUILDING '+(fixed+failed+1)+' / '+repairable.length+'…';
      try{
        const {data:blob,error:downloadError}=await supabase.storage.from('nexora-drama-videos').download(entry.video_storage_path);
        if(downloadError)throw downloadError;
        const frame=await captureDramaThumbnail(blob);if(!frame)throw new Error('Could not capture a video frame');
        const posterPath=entry.video_storage_path+'.jpg';
        const posterUrl=(await uploadDramaAsset(posterPath,frame,'image/jpeg'))+'?v='+Date.now();
        const {error:updateError}=await supabase.from('dramas').update({poster_url:posterUrl,poster_storage_path:posterPath}).eq('id',entry.id);
        if(updateError)throw updateError;
        fixed++;
      }catch(err){failed++;console.warn('Thumbnail repair failed for '+entry.title,err);}
    }
    alert('Thumbnail rebuild complete. Updated: '+fixed+'. Could not rebuild: '+failed+'.');
    await loadCloudDramas();await renderAdmin();
  };
  document.querySelector('#addForm').onsubmit=async e=>{
    e.preventDefault();
    const form=e.currentTarget,submit=form.querySelector('button[type="submit"]');
    const progressBox=document.querySelector('#videoUploadProgress'),progressBar=document.querySelector('#videoUploadBar'),progressPercent=document.querySelector('#videoUploadPercent'),progressStage=document.querySelector('#videoUploadStage'),progressDetail=document.querySelector('#videoUploadDetail');
    if(progressBox)progressBox.hidden=false;
    if(progressBar)progressBar.value=0;
    if(progressPercent)progressPercent.textContent='0%';
    if(progressStage)progressStage.textContent='Preparing upload…';
    if(progressDetail)progressDetail.textContent='Checking video, cover and publishing permission.';
    submit.disabled=true;submit.textContent='PUBLISHING…';
    const f=new FormData(form),file=form.elements.videoFile.files?.[0]||null,subtitleFile=form.elements.subtitleFile.files?.[0]||null,parentDramaId=String(f.get('parentDramaId')||'').trim()||null,episodeNumber=Math.max(1,Number(f.get('episodeNumber')||1)),directUrl=String(f.get('url')||'').trim(),source=String(f.get('source')||'').trim(),poster=String(f.get('poster')||'').trim();
    const allowedExt=/\.(mp4|webm|mov)$/i;
    const inferredFileType=file?(file.name.toLowerCase().endsWith('.webm')?'video/webm':file.name.toLowerCase().endsWith('.mov')?'video/quicktime':'video/mp4'):'';
    if((!file&&!isSupportedVideoUrl(directUrl))||(file&&!allowedExt.test(file.name))||(file&&file.size>524288000)||!/^https:\/\//i.test(source)||(poster&&!/^https:\/\//i.test(poster))||f.get('permission')!=='on'){
      alert('Choose an MP4, WebM, or MOV file up to 500 MB, or enter a direct HTTPS video-file URL ending in .mp4, .webm, or .mov. TikTok and other watch-page links are not playable files. Add the original HTTPS source and confirm publishing rights.');
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
        if(progressStage)progressStage.textContent='Uploading video…';
        if(progressDetail)progressDetail.textContent='Keep NEXORA open until the upload reaches 100%.';
        await uploadDramaVideoWithProgress(storagePath,file,inferredFileType,(percent,loaded,total)=>{
          if(progressBar)progressBar.value=percent;
          if(progressPercent)progressPercent.textContent=percent+'%';
          if(progressDetail)progressDetail.textContent=(loaded/1048576).toFixed(1)+' MB of '+(total/1048576).toFixed(1)+' MB uploaded';
        });
        videoUrl=supabase.storage.from('nexora-drama-videos').getPublicUrl(storagePath).data.publicUrl;
      }
      if(progressStage)progressStage.textContent='Saving video cover…';
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
        title:String(f.get('title')||'').trim(),episode:'Episode '+episodeNumber,episode_number:episodeNumber,parent_drama_id:parentDramaId,
        category:String(f.get('category')||'Other'),video_url:videoUrl,video_storage_path:storagePath,poster_url:posterUrl||null,poster_storage_path:posterPath,subtitle_url:subtitleUrl,subtitle_storage_path:subtitlePath,
        creator:String(f.get('creator')||'').trim(),source_url:source,permission_confirmed:true,published:true
      });
      if(insertError) throw insertError;
      published=true;
      if(progressBar)progressBar.value=100;
      if(progressPercent)progressPercent.textContent='100%';
      if(progressStage)progressStage.textContent='Published successfully';
      if(progressDetail)progressDetail.textContent='Your drama is now in the shared NEXORA streaming catalogue.';
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
async function performCloudDramasLoad() {
  if(!supabase)return;
  let {data,error}=await supabase.from('dramas').select('id,title,episode,episode_number,parent_drama_id,category,video_url,video_storage_path,poster_url,subtitle_url,creator,source_url,watch_count').eq('published',true).order('created_at',{ascending:false});
  if(error && /subtitle_url|column/i.test(error.message)) {
    const fallback=await supabase.from('dramas').select('id,title,episode,category,video_url,video_storage_path,poster_url,creator,source_url,watch_count').eq('published',true).order('created_at',{ascending:false});
    data=fallback.data;error=fallback.error;
  }
  if(error && /watch_count|column/i.test(error.message)) {
    const fallback=await supabase.from('dramas').select('id,title,episode,category,video_url,video_storage_path,poster_url,creator,source_url').eq('published',true).order('created_at',{ascending:false});
    data=fallback.data; error=fallback.error;
  }
  if(error){console.warn('NEXORA cloud library could not load:',error.message);return;}
  const cloud=(data||[]).map(row=>({id:row.id,title:row.title,episode:row.episode,episodeNumber:Number(row.episode_number||String(row.episode||'').match(/\d+/)?.[0]||1),parentDramaId:row.parent_drama_id||null,category:row.category,creator:row.creator,source:row.source_url,license:'Owner-confirmed permission',url:row.video_url||(row.video_storage_path?supabase.storage.from('nexora-drama-videos').getPublicUrl(row.video_storage_path).data.publicUrl:''),videoStoragePath:row.video_storage_path||'',poster:row.poster_url||'',subtitle:row.subtitle_url||'',watchCount:Number(row.watch_count||0)}));

  const demoIds=new Set(seed.map(x=>x.id)),cloudIds=new Set(cloud.map(x=>x.id));
  const previousCatalog=items.filter(x=>!demoIds.has(x.id)).map(x=>[x.id,x.watchCount||0,x.url||'',x.poster||''].join('|')).join('~');
  const nextItems=[...seed,...cloud,...items.filter(x=>!demoIds.has(x.id)&&!cloudIds.has(x.id))];
  const nextCatalog=nextItems.filter(x=>!demoIds.has(x.id)).map(x=>[x.id,x.watchCount||0,x.url||'',x.poster||''].join('|')).join('~');
  const catalogueChanged=previousCatalog!==nextCatalog;
  items=nextItems;
  if (pendingResumeId && !ownerFlowActive) {
    const resumeIndex=items.findIndex(entry=>entry.id===pendingResumeId);
    if (resumeIndex>=0) { active=resumeIndex; view='feed'; pendingResumeId=''; render(); return; }
  }
  // Never rebuild the active video DOM during playback. The 30-second catalogue
  // refresh and watch-count realtime events used to recreate the <video> element,
  // sending playback back to the beginning (especially noticeable in fullscreen).
  if(catalogueChanged && !ownerFlowActive && (view==='home'||view==='search'))render();
}
let cloudLoadPromise = null;
let cloudRefreshQueued = false;
async function loadCloudDramas() {
  if (!supabase) return;
  if (cloudLoadPromise) {
    cloudRefreshQueued = true;
    return cloudLoadPromise;
  }
  cloudLoadPromise = performCloudDramasLoad();
  try { return await cloudLoadPromise; }
  finally {
    cloudLoadPromise = null;
    if (cloudRefreshQueued) {
      cloudRefreshQueued = false;
      Promise.resolve().then(() => loadCloudDramas());
    }
  }
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
