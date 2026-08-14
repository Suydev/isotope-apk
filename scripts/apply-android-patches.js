#!/usr/bin/env node
/**
 * apply-android-patches.js (v2 — adapted for isotope-code v3.3.9+ bundles)
 *
 * Applies runtime server.mjs patches to bundled JS in www/assets/
 * so the Android APK works without a Node.js server.
 */

const fs   = require('fs');
const path = require('path');

const WWW_DIR     = process.env.WWW_DIR || path.resolve(__dirname, '../www');
const ASSETS_DIR  = path.join(WWW_DIR, 'assets');
const ANDROID_DIR = process.env.ANDROID_DIR || path.resolve(__dirname, '../android');

const SUPA_URL      = 'https://vteqquoqvksshmfhuepu.supabase.co';
const SUPA_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0ZXFxdW9xdmtzc2htZmh1ZXB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwODU2NzUsImV4cCI6MjA5NTY2MTY3NX0.ZkRislOhJRQUjVa1y5ixu-xBhlgkXWWyZKI_CClWj64';

let patchCount = 0;
let skipCount  = 0;
let failureCount = 0;

function patchFile(filePath, patches, label) {
  if (!fs.existsSync(filePath)) {
    console.warn(`  SKIP (not found): ${label}`);
    skipCount++;
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  for (const [from, to, required] of patches) {
    if (required && content.includes(to)) continue;
    const matchCount = content.split(from).length - 1;
    if (required && matchCount !== 1) {
      if (matchCount === 0 && content.includes(to)) continue;
      console.error(`  ERROR: Required patch target for ${label} appeared ${matchCount} times; expected 1: "${from.slice(0, 120)}..."`);
      failureCount++;
      continue;
    }
    if (matchCount > 0) {
      content = content.split(from).join(to);
      changed = true;
      patchCount++;
    } else if (required) {
      console.error(`  ERROR: Required patch target not found in ${label}: "${from.slice(0, 80)}..."`);
    }
  }
  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  ✓ Patched: ${label}`);
  } else {
    console.log(`  ○ No changes needed: ${label}`);
  }
}

function findAsset(pattern) {
  if (!fs.existsSync(ASSETS_DIR)) return null;
  const files = fs.readdirSync(ASSETS_DIR);
  const matches = files.filter(f => f.includes(pattern) && f.endsWith('.js'));
  if (matches.length === 0) return null;
  matches.sort((a, b) => fs.statSync(path.join(ASSETS_DIR, b)).size - fs.statSync(path.join(ASSETS_DIR, a)).size);
  const chosen = matches[0];
  if (matches.length > 1) console.log(`  (found ${matches.length} candidates for "${pattern}", chose largest: ${chosen})`);
  return path.join(ASSETS_DIR, chosen);
}

function normalizeManifestPermissions(manifest, desiredPermissionLines) {
  const desiredByName = new Map();
  for (const line of desiredPermissionLines) {
    const name = line.match(/android:name="([^"]+)"/)?.[1];
    if (name) desiredByName.set(name, line.trim());
  }
  const existingLines = manifest.match(/^\s*<uses-permission\b[^>]*\/>\s*$/gm) || [];
  const existingByName = new Map();
  for (const line of existingLines) {
    const name = line.match(/android:name="([^"]+)"/)?.[1];
    if (name && !desiredByName.has(name) && !existingByName.has(name)) existingByName.set(name, line.trim());
  }
  manifest = manifest
    .replace(/^\s*<uses-permission\b[^>]*\/>\s*$/gm, '')
    .replace(/^\s*<!-- Permissions -->\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n');
  const orderedLines = [...desiredByName.values(), ...existingByName.values()].map(line => '    ' + line.replace(/^\s+/, ''));
  if (!manifest.includes('<application')) return manifest;
  return manifest.replace(/(\n\s*)<application/, '\n' + orderedLines.join('\n') + '\n    <application');
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. useAuthStore — upgrade default planType to "ranker" (isPremium() returns true)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n=== Patching useAuthStore bundle ===');
const authStoreBundle = findAsset('useAuthStore-');

patchFile(authStoreBundle, [
  // The default state has planType:"free" — change to "ranker" so isPremium() returns true
  ['planType:"free"', 'planType:"ranker"', false],
  // Also catch the string variant
  ["planType:\"free\"", "planType:\"ranker\"", false],
], 'useAuthStore bundle');

// ═══════════════════════════════════════════════════════════════════════════════
// 2. AppAccessGate — remove "isotope-auth-token" from localStorage cleanup set
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n=== Patching AppAccessGate bundle ===');
const accessGateBundle = findAsset('AppAccessGate-');

patchFile(accessGateBundle, [
  // Remove "isotope-auth-token" from the cleanup set so Android auth keys survive
  // Use the full Set context to avoid substring false-positive
  [
    'new Set(["isotope-auth","isotope-onboarding","isotope-notifications","isotope-tools-storage","ai-storage","isotope-quotes","sidebar-storage","group-ui-preferences","isotope-query-cache","isotope-auth-token","isotope:pending_session_sync"',
    'new Set(["isotope-auth","isotope-onboarding","isotope-notifications","isotope-tools-storage","ai-storage","isotope-quotes","sidebar-storage","group-ui-preferences","isotope-query-cache","isotope:pending_session_sync"',
    true
  ],
], 'AppAccessGate bundle');

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Auth bundle — route login through __isoLogin on Android
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n=== Patching Auth bundle ===');
const authBundle = findAsset('Auth-');

patchFile(authBundle, [
  // Replace the login handler to route through Android bridge
  [
    '(await j(s,t)).success&&setTimeout(()=>{b("/dashboard",{replace:!0})},100)',
    'await (async()=>{if(typeof window<"u"&&window.__ISO_IS_ANDROID__&&typeof window.__isoLogin=="function"){try{const __r=await window.__isoLogin(s,t);if(!__r||!__r.ok){m.setState({error:__r&&(__r.err||__r.error)||"Login failed",isLoading:!1});return}const __completed=__r.bootstrap&&__r.bootstrap.onboarding&&typeof __r.bootstrap.onboarding.completed=="boolean"?__r.bootstrap.onboarding.completed:typeof __r.onboarding_completed=="boolean"?__r.onboarding_completed:void 0;if(typeof __completed!="boolean"){m.setState({error:"Could not verify cloud onboarding state.",isLoading:!1});return}const __user=__r.user||__r.session&&__r.session.user||{};const __profile=__r.bootstrap&&(__r.bootstrap.profile||__r.bootstrap.profile_data)||{};const __plan=__r.bootstrap&&__r.bootstrap.user&&__r.bootstrap.user.plan_type||__profile.planType||__profile.plan_type||"ranker";const __bootState=__completed?"readyDashboard":"readyNeedsOnboarding";try{window.__ISO_BOOT_STATE__=Object.assign({},window.__ISO_BOOT_STATE__||{},{state:__bootState,session:__r.session||null,user_id:__user.id||__r.user_id||null,user:__user,profile:__r.bootstrap&&__r.bootstrap.profile||__profile||null,profile_data:__r.bootstrap&&__r.bootstrap.profile_data||__profile||null,onboarding:__r.bootstrap&&__r.bootstrap.onboarding||{state:__completed?"completed":"incomplete",completed:__completed,completed_at:null,data:{}},onboarding_completed:__completed,cloud_snapshot:__r.bootstrap&&__r.bootstrap.cloud_snapshot||null,best_backup:__r.bootstrap&&__r.bootstrap.best_backup||null,backup_candidates:__r.bootstrap&&__r.bootstrap.backup_candidates||[],restore_recommended:!!(__r.bootstrap&&__r.bootstrap.restore_recommended),backup_warning:__r.bootstrap&&__r.bootstrap.backup_warning||null,fetched_at:__r.bootstrap&&__r.bootstrap.fetched_at||new Date().toISOString(),source:"android-auth-login"});window.dispatchEvent(new CustomEvent("isotope:boot-state",{detail:window.__ISO_BOOT_STATE__}))}catch(__e){}m.setState({isAuthenticated:!0,isInitialized:!0,isLoading:!1,userId:__user.id||__r.user_id||null,email:__user.email||null,emailVerified:__user.email_confirmed_at!=null,planType:__plan,planExpiresAt:__profile.planExpiresAt||__profile.plan_expires_at||null,accessSource:__profile.accessSource||__profile.access_source||"grandfathered",billingStatus:__profile.billingStatus||__profile.billing_status||"active",cancelAtPeriodEnd:__profile.cancelAtPeriodEnd||__profile.cancel_at_period_end||!1,portalEligible:__profile.portalEligible||__profile.portal_eligible||!1,authMethod:"email",identities:__user.identities||[],createdAt:__user.created_at||new Date().toISOString(),isTemporaryLocalSession:!1,temporaryLocalMessage:null,error:null});try{window.dispatchEvent(new CustomEvent("isotope:native-auth-ready",{detail:{session:__r.session||null,bootstrap:__r.bootstrap||null}}))}catch(__ignored){}b(__bootState==="readyDashboard"?"/dashboard":"/onboarding",{replace:!0})}catch(__e){m.setState({error:__e&&__e.message?__e.message:"Login failed",isLoading:!1})}}else{if((await j(s,t)).success)setTimeout(()=>{b("/dashboard",{replace:!0})},100)}})()',
    true
  ],
], 'Auth bundle');

// ═══════════════════════════════════════════════════════════════════════════════
// 4. useOnlineStatus — route through Capacitor Network on Android
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n=== Patching useOnlineStatus bundle ===');
const onlineStatusBundle = findAsset('useOnlineStatus-');

// The new bundle is minified on one line:
// function a(){const[r,t]=n.useState(navigator.onLine),[e,i]=n.useState(!1);return...
patchFile(onlineStatusBundle, [
  // Patch navigator.onLine to use Android network state
  [
    'const[r,t]=n.useState(navigator.onLine)',
    'const __androidOnline=()=>typeof window<"u"&&window.__ISO_IS_ANDROID__&&typeof window.__isoIsOnline=="function"?window.__isoIsOnline():navigator.onLine,[r,t]=n.useState(__androidOnline())',
    true
  ],
  // Add isotope:network event listener
  [
    'window.addEventListener("online",s),window.addEventListener("offline",o)',
    'const c=u=>{const f=!!(u&&u.detail&&(u.detail.connected??u.detail.online));f?t(!0):t(!1)};window.addEventListener("online",s),window.addEventListener("offline",o),window.addEventListener("isotope:network",c)',
    true
  ],
  [
    'window.removeEventListener("online",s),window.removeEventListener("offline",o)',
    'window.removeEventListener("online",s),window.removeEventListener("offline",o),window.removeEventListener("isotope:network",c)',
    true
  ],
], 'useOnlineStatus bundle');

// ═══════════════════════════════════════════════════════════════════════════════
// 5. useNotificationStore — native notification scheduling on Android
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n=== Patching Notification store bundle ===');
const notificationBundle = findAsset('useNotificationStore-');

patchFile(notificationBundle, [
  // Schedule: add native notification path before setTimeout
  [
    'const s=new Date,o=new Date(e.scheduledFor).getTime()-s.getTime();return o>0&&setTimeout',
    'const s=new Date,o=new Date(e.scheduledFor).getTime()-s.getTime();if(typeof window<"u"&&window.__ISO_IS_ANDROID__&&typeof window.__isoScheduleNativeNotification=="function"){window.__isoScheduleNativeNotification({id:i,title:e.title,body:e.body||"",at:e.scheduledFor,tag:e.tag,route:e.data&&e.data.url||"/focus",data:{...(e.data||{}),category:e.category,url:e.data&&e.data.url||"/focus"}}).catch(n=>console.error("[NotificationStore] Native schedule failed:",n));return i}return o>0&&setTimeout',
    true
  ],
  // Cancel: add native cancel
  [
    'cancelNotification:e=>{r(i=>({scheduledNotifications:i.scheduledNotifications.filter(t=>t.id!==e)}))',
    'cancelNotification:e=>{typeof window<"u"&&window.__ISO_IS_ANDROID__&&typeof window.__isoCancelNativeNotification=="function"&&window.__isoCancelNativeNotification(e).catch(()=>{});r(i=>({scheduledNotifications:i.scheduledNotifications.filter(t=>t.id!==e)}))',
    true
  ],
  // Immediate notification: add native path before serviceWorker
  [
    '"serviceWorker"in navigator&&navigator.serviceWorker.controller?await(await navigator.serviceWorker.ready).showNotification(i,u)',
    'typeof window<"u"&&window.__ISO_IS_ANDROID__&&typeof window.__isoScheduleNativeNotification=="function"?await window.__isoScheduleNativeNotification({title:i,body:u.body||"",at:Date.now()+500,tag:u.tag,route:u.data&&u.data.url||"/focus",data:u.data||{}}):"serviceWorker"in navigator&&navigator.serviceWorker.controller?await(await navigator.serviceWorker.ready).showNotification(i,u)',
    true
  ],
], 'Notification store bundle');

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Focus bundle — Android Floating Timer overlay
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n=== Patching Focus bundle for Android Floating Timer ===');
const focusBundle = findAsset('Focus-');

// Pomodoro cycle fields passed to native floating timer: pomodoroCycle, pomodoroSessionsUntilLongBreak
patchFile(focusBundle, [
  // Intercept documentPictureInPicture launch for Android floating timer
  [
    'if(!("documentPictureInPicture"in window)){alert("Picture-in-Picture is not supported in this browser.");return}try{if(me.current)',
    'if(typeof window<"u"&&window.__ISO_IS_ANDROID__&&typeof window.__isoOpenFloatingTimer=="function"){const __ftResult=await window.__isoOpenFloatingTimer({route:"/focus",getState:()=>{const Zt=typeof useFocusStore!=="undefined"&&useFocusStore.getState?useFocusStore.getState():{};return{mode:Zt.mode||"pomodoro",timerState:Zt.timerState||"idle",activePhase:Zt.activePhase||"focus",startedAt:Zt.sessionStartTime||null,completionAtMs:Zt.timerState==="running"?Date.now()+Math.max(0,Zt.timeLeft||0)*1e3:null,updatedAtMs:Date.now(),displayedSeconds:Math.max(0,(Zt.mode==="pomodoro"||Zt.activePhase==="break"?Zt.timeLeft:Zt.stopwatchTime)||0),totalSeconds:Math.max(0,Zt.totalTime||0),sessionType:Zt.sessionType||"",taskType:Zt.taskType||"",questionsAttempted:Zt.questionsAttempted||0,questionsCorrect:Zt.questionsCorrect||0,questionsIncorrect:Zt.questionsIncorrect||0,questionsSkipped:Zt.questionsSkipped||0,targetQuestions:Zt.targetQuestions||0,theme:document.documentElement.classList.contains("dark")?"dark":"light"}},dispatch:__action=>{const __type=__action&&__action.type||__action;if(__type==="correct"||__type==="incorrect"||__type==="skipped")return true;if(__type==="undo")return true;if(__type==="setTarget")return true;if(__type==="close"||__type==="expand")return true;return false}});if(__ftResult&&__ftResult.ok)return;if(__ftResult)alert(__ftResult.reason||"Floating Timer could not be opened.");return}else if(!("documentPictureInPicture"in window)){alert("Picture-in-Picture is not supported in this browser.");return}try{if(me.current)',
    true
  ],
], 'Focus bundle Floating Timer');

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Settings bundle — fix notification text
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n=== Patching Settings bundle ===');
const settingsBundle = findAsset('SettingsLayout-');

patchFile(settingsBundle, [
  ['children:"Browser Notifications"', 'children: "Notifications"', false],
  ['"Notifications are blocked by your browser"', '"Notifications are blocked on this device"', false],
  ['Grand permission to receive alerts', 'Grant permission to receive alerts', false],
], 'Settings bundle');

// ═══════════════════════════════════════════════════════════════════════════════
// 7b. Index bundle — skip Sentry on Android
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n=== Patching Index bundle (Sentry skip on Android) ===');
const indexBundle = findAsset('index-');

patchFile(indexBundle, [
  [
    'j=async(e=()=>s(()=>import("./vendor-sentry-C0ZzGV-C.js"),__vite__mapDeps([0,1])))=>{try{',
    'j=async(e=()=>s(()=>import("./vendor-sentry-C0ZzGV-C.js"),__vite__mapDeps([0,1])))=>{if(typeof window<"u"&&window.__ISO_IS_ANDROID__) return !1;try{',
    false
  ],
], 'Index bundle (Sentry skip)');

// ═══════════════════════════════════════════════════════════════════════════════
// 7c. Analytics bundle — render stability on Android
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n=== Patching Analytics bundle (render stability) ===');
const analyticsBundle = findAsset('Analytics-');

patchFile(analyticsBundle, [
  [
    'je=(t,a=0)=>t&&Fa(t)||J[a%J.length]',
    'const __androidStable=typeof window<"u"&&window.__ISO_IS_ANDROID__;je=(t,x=0)=>t&&Fa(t)||J[__androidStable?Math.min(0,x+1):x%J.length]',
    false
  ],
], 'Analytics bundle (render stability)');

// ═══════════════════════════════════════════════════════════════════════════════
// 7d. DashboardHeader bundle — app-only feedback link
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n=== Patching DashboardHeader bundle (feedback link) ===');
const dashboardHeaderBundle = findAsset('DashboardHeader-');

patchFile(dashboardHeaderBundle, [
  [
    'https://isotope.featurebase.app',
    'https://isotopeaiapp.featurebase.app/',
    false
  ],
], 'DashboardHeader bundle (feedback link)');
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n=== Patching CommunityHub bundle ===');
const communityHubBundle = findAsset('CommunityHub-');

patchFile(communityHubBundle, [
  // Filter events/calendar tabs on Android
  [
    'h.map(r=>e.jsxs("button",{onClick:()=>t(r.id)',
    '(typeof window<"u"&&window.__ISO_IS_ANDROID__?h.filter(r=>r.id!=="events"&&r.id!=="calendar"):h).map(r=>e.jsxs("button",{onClick:()=>t(r.id)',
    false
  ],
], 'CommunityHub bundle');

// ═══════════════════════════════════════════════════════════════════════════════
// 9. SingleGroup — premium gates and tour persistence
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n=== Patching SingleGroup bundle ===');
const singleGroupBundle = findAsset('SingleGroup-');

patchFile(singleGroupBundle, [
  // Remove premium gates from query hooks
  ['function Vs(t){const r=q(s=>s.isPremium());return we({', 'function Vs(t){const r=!0;return we({', false],
  ['function Qs(t){const r=q(s=>s.isPremium());return we({', 'function Qs(t){const r=!0;return we({', false],
  ['function Zs(t){const r=q(s=>s.isPremium());return we({', 'function Zs(t){const r=!0;return we({', false],
  ['function ea(t){const r=q(s=>s.isPremium());return we({', 'function ea(t){const r=!0;return we({', false],
  ['function aa(t,r="daily"){const s=q(a=>a.isPremium());return we({', 'function aa(t,r="daily"){const s=!0;return we({', false],
  ['function ra(t){const r=q(s=>s.isPremium());return we({', 'function ra(t){const r=!0;return we({', false],
  // Remove premium gate from leaderboard
  ['function O({period:s,limit:r=50,groupId:t}){const c=k(e=>e.isPremium())', 'function O({period:s,limit:r=50,groupId:t}){const c=!0', false],
  ['function U(){const s=k(t=>t.isPremium())', 'function U(){const s=!0', false],
  // Remove feature gate wrapper
  ['Ga=t=>e.jsx(ns,{featureName:"Group Details",children:e.jsx(Aa,{...t})})', 'Ga=t=>e.jsx(Aa,{...t})', false],
  // Remove offensive category
  ['"entrance-exam","class-11","class-12","college","coding","language","shit"', '"entrance-exam","class-11","class-12","college","coding","language"', false],
], 'SingleGroup bundle');

// ═══════════════════════════════════════════════════════════════════════════════
// 10. useLeaderboard — premium gates
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n=== Patching useLeaderboard bundle ===');
const useLeaderboardBundle = findAsset('useLeaderboard-');

patchFile(useLeaderboardBundle, [
  ['function O({period:s,limit:r=50,groupId:t}){const c=k(e=>e.isPremium())', 'function O({period:s,limit:r=50,groupId:t}){const c=!0', false],
  ['function U(){const s=k(t=>t.isPremium())', 'function U(){const s=!0', false],
], 'useLeaderboard bundle');

// ═══════════════════════════════════════════════════════════════════════════════
// 11. useGroupChallenges — unlock for all users
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n=== Patching useGroupChallenges bundle ===');
const useGroupChallengesBundle = findAsset('useGroupChallenges-');

patchFile(useGroupChallengesBundle, [
  ['function L(r){const n=h(t=>t.isPremium())', 'function L(r){const n=!0', false],
  ['function B(r){const n=h(e=>e.isPremium())', 'function B(r){const n=!0', false],
  ['function R(r){const n=h(i=>i.isPremium())', 'function R(r){const n=!0', false],
], 'useGroupChallenges bundle');

// ═══════════════════════════════════════════════════════════════════════════════
// 12. Focus background importer
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n=== Patching focus background importer ===');
const focusBgImport = path.join(WWW_DIR, 'focus-bg-import.js');

patchFile(focusBgImport, [
  [
    [
      '    imgInput.onchange = function () {',
      '      var file = imgInput.files && imgInput.files[0];',
      '      if (!file) return;',
      '      idbPut(CUSTOM_KEY, mediaRecord(\'image\', file)).catch(function () {});',
      '      var url = URL.createObjectURL(file);',
      '      closeModal();',
      '      applyBackground(url, false, true);',
      '      toast(\'Image background applied.\');',
      '    };'
    ].join('\n'),
    [
      '    imgInput.onchange = function () {',
      '      var file = imgInput.files && imgInput.files[0];',
      '      if (!file) return;',
      '      if (window.__ISO_IS_ANDROID__ && typeof FileReader !== "undefined") {',
      '        var reader = new FileReader();',
      '        reader.onload = function () {',
      '          var dataUrl = String(reader.result || "");',
      '          if (!/^data:image\\//i.test(dataUrl)) { toast("This image could not be opened.", "error"); return; }',
      '          idbPut(CUSTOM_KEY, { type: "url", kind: "image", url: dataUrl, name: file.name || "", mime: file.type || "", size: file.size || 0, savedAt: new Date().toISOString() }).catch(function () {});',
      '          closeModal();',
      '          applyBackground(dataUrl, false, false);',
      '          toast("Image background applied.");',
      '        };',
      '        reader.onerror = function () { toast("This image could not be opened.", "error"); };',
      '        reader.readAsDataURL(file);',
      '        return;',
      '      }',
      '      idbPut(CUSTOM_KEY, mediaRecord(\'image\', file)).catch(function () {});',
      '      var url = URL.createObjectURL(file);',
      '      closeModal();',
      '      applyBackground(url, false, true);',
      '      toast(\'Image background applied.\');',
      '    };'
    ].join('\n'),
    true
  ],
], 'focus-bg-import.js');

// ═══════════════════════════════════════════════════════════════════════════════
// 13. Invite route
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n=== Patching invite route bundle ===');
const inviteRouteBundle = findAsset('InviteOnlineOnlyRoute-');

patchFile(inviteRouteBundle, [
  ['m.success&&o(`/community/group/${m.group_slug}`)', 'm.success&&o(`/community/group/${m.group_slug||m.slug||m.group_id}`)', false],
], 'InviteOnlineOnlyRoute bundle');

// ═══════════════════════════════════════════════════════════════════════════════
// 14. Invite share URL
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n=== Patching invite share URL generation ===');
const inviteBundle = findAsset('useInvites-');

patchFile(inviteBundle, [
  ['"token_input":', '"p_code":', false],
  ['token_input:', 'p_code:', false],
], 'useInvites bundle');

// ═══════════════════════════════════════════════════════════════════════════════
// 15. AnalyticsPeriod — disable chart animation on Android
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n=== Patching AnalyticsPeriod chart animation ===');
const analyticsPeriodBundle = findAsset('AnalyticsPeriod-');

patchFile(analyticsPeriodBundle, [
  ['const r=ie(),', 'const r=typeof window<"u"&&window.__ISO_IS_ANDROID__?!1:ie(),', false],
  ['const m=ie();', 'const m=typeof window<"u"&&window.__ISO_IS_ANDROID__?!1:ie();', false],
], 'AnalyticsPeriod chart animation');

// ═══════════════════════════════════════════════════════════════════════════════
// 16. SessionLogTable — cap rows on Android
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n=== Patching SessionLogTable Android row cap ===');
const sessionLogBundle = findAsset('SessionLogTable-');

patchFile(sessionLogBundle, [
  [
    'children:h.map(t=>e.jsxs(B.tr,{layout:!0,initial:u?!1:{opacity:0},animate:{opacity:1}',
    'children:(typeof window<"u"&&window.__ISO_IS_ANDROID__?h.slice(0,120):h).map(t=>e.jsxs(B.tr,{layout:typeof window<"u"&&window.__ISO_IS_ANDROID__?!1:!0,initial:u||typeof window<"u"&&window.__ISO_IS_ANDROID__?!1:{opacity:0},animate:{opacity:1}',
    false
  ],
], 'SessionLogTable Android row cap');

// ═══════════════════════════════════════════════════════════════════════════════
// 17. AndroidManifest.xml
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n=== Patching AndroidManifest.xml ===');
const manifestPath = path.join(ANDROID_DIR, 'app', 'src', 'main', 'AndroidManifest.xml');

if (fs.existsSync(manifestPath)) {
  let manifest = fs.readFileSync(manifestPath, 'utf8');
  const permissionsToAdd = [
    '    <uses-permission android:name="android.permission.INTERNET" />',
    '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
    '    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />',
    '    <uses-permission android:name="android.permission.VIBRATE" />',
    '    <uses-permission android:name="android.permission.USE_BIOMETRIC" />',
    '    <uses-permission android:name="android.permission.USE_FINGERPRINT" />',
    '    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />',
    '    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />',
    '    <uses-permission android:name="android.permission.WAKE_LOCK" />',
    '    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />',
    '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />',
    '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />',
    '    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />',
  ];

  const beforePermissionNames = new Set((manifest.match(/<uses-permission\b[^>]*android:name="([^"]+)"/g) || [])
    .map(line => line.match(/android:name="([^"]+)"/)?.[1]).filter(Boolean));
  manifest = normalizeManifestPermissions(manifest, permissionsToAdd);
  const afterPermissionNames = new Set((manifest.match(/<uses-permission\b[^>]*android:name="([^"]+)"/g) || [])
    .map(line => line.match(/android:name="([^"]+)"/)?.[1]).filter(Boolean));
  let added = 0;
  for (const name of afterPermissionNames) { if (!beforePermissionNames.has(name)) added++; }

  if (!manifest.includes('android:usesCleartextTraffic')) {
    manifest = manifest.replace('<application', '<application\n        android:usesCleartextTraffic="false"');
  }
  if (!manifest.includes('android:networkSecurityConfig')) {
    manifest = manifest.replace('<application', '<application\n        android:networkSecurityConfig="@xml/network_security_config"');
  }

  if (!manifest.includes('android:name=".FloatingTimerService"')) {
    const serviceBlock = [
      '        <service',
      '            android:name=".FloatingTimerService"',
      '            android:exported="false"',
      '            android:foregroundServiceType="specialUse">',
      '            <property',
      '                android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"',
      '                android:value="interactive_focus_timer_overlay" />',
      '        </service>',
      ''
    ].join('\n');
    manifest = manifest.replace(/\n\s*<provider\b/, '\n' + serviceBlock + '        <provider');
    patchCount++;
  }

  const missingActivityAttributes = [
    ['android:resizeableActivity', 'android:resizeableActivity="true"'],
    ['android:supportsPictureInPicture', 'android:supportsPictureInPicture="true"'],
    ['android:windowSoftInputMode', 'android:windowSoftInputMode="adjustResize"'],
  ].filter(([attrName]) => !manifest.includes(attrName)).map(([, attrLine]) => attrLine);
  if (missingActivityAttributes.length > 0) {
    manifest = manifest.replace('android:exported="true"',
      `android:exported="true"\n            ${missingActivityAttributes.join('\n            ')}`);
    patchCount += missingActivityAttributes.length;
  }

  fs.writeFileSync(manifestPath, manifest, 'utf8');
  console.log(`  ✓ Patched AndroidManifest.xml (added ${added} permissions)`);
  patchCount += added;

  const xmlDir = path.join(ANDROID_DIR, 'app', 'src', 'main', 'res', 'xml');
  fs.mkdirSync(xmlDir, { recursive: true });
  const nsConfigPath = path.join(xmlDir, 'network_security_config.xml');
  if (!fs.existsSync(nsConfigPath)) {
    fs.writeFileSync(nsConfigPath, `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="true">supabase.co</domain>
        <domain includeSubdomains="true">isotope.app</domain>
    </domain-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
`, 'utf8');
    console.log('  ✓ Created network_security_config.xml');
    patchCount++;
  }
} else {
  console.log('  SKIP: AndroidManifest.xml not found');
  skipCount++;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 18. Verify Android native resources
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n=== Verifying Android native resources ===');
if (fs.existsSync(ANDROID_DIR)) {
  const checks = [
    [path.join(ANDROID_DIR, 'app/src/main/res/drawable/ic_notification.xml'), 'ic_notification.xml', /strokeColor|#FFFFFFFF|fillColor/],
    [path.join(ANDROID_DIR, 'app/src/main/java/in/isotopeai/app/MainActivity.java'), 'MainActivity.java', /startFloatingTimer|requestOverlayPermission|IsotopeAndroid/],
    [path.join(ANDROID_DIR, 'app/src/main/java/in/isotopeai/app/FloatingTimerService.java'), 'FloatingTimerService.java', /TYPE_APPLICATION_OVERLAY|WindowManager|startForeground/],
    [path.join(ANDROID_DIR, 'app/src/main/res/drawable-v24/ic_launcher_foreground.xml'), 'launcher foreground', /A78BFA|isotope/],
    [path.join(ANDROID_DIR, 'app/src/main/res/values/ic_launcher_background.xml'), 'launcher background', /#111827/],
  ];
  for (const [filePath, label, pattern] of checks) {
    if (!fs.existsSync(filePath)) { console.error(`  ERROR: Missing: ${label}`); failureCount++; continue; }
    const content = fs.readFileSync(filePath, 'utf8');
    if (!pattern.test(content)) { console.error(`  ERROR: Contract failed: ${label}`); failureCount++; continue; }
    console.log(`  ✓ Verified: ${label}`);
  }
} else {
  console.log('  SKIP: Android resources not found');
  skipCount++;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 19. Gradle SDK versions
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n=== Patching Gradle SDK versions ===');
const buildGradlePath = path.join(ANDROID_DIR, 'app', 'build.gradle');
const variablesGradlePath = path.join(ANDROID_DIR, 'variables.gradle');

if (fs.existsSync(buildGradlePath)) {
  let gradle = fs.readFileSync(buildGradlePath, 'utf8');
  if (!gradle.includes('minSdkVersion 24') && !gradle.includes('minSdk 24')) {
    const next = gradle.replace(/minSdkVersion\s+\d+/, 'minSdkVersion 24').replace(/minSdk\s+=?\s*\d+/, 'minSdk = 24');
    if (next !== gradle) { gradle = next; console.log('  ✓ Set minSdkVersion 24'); patchCount++; }
  }
  if (!gradle.includes('targetSdkVersion 35') && !gradle.includes('targetSdk 35')) {
    const next = gradle.replace(/targetSdkVersion\s+\d+/, 'targetSdkVersion 35').replace(/targetSdk\s+=?\s*\d+/, 'targetSdk = 35');
    if (next !== gradle) { gradle = next; console.log('  ✓ Set targetSdkVersion 35'); patchCount++; }
  }
  fs.writeFileSync(buildGradlePath, gradle, 'utf8');
} else {
  console.log('  SKIP: build.gradle not found');
  skipCount++;
}

if (fs.existsSync(variablesGradlePath)) {
  let variables = fs.readFileSync(variablesGradlePath, 'utf8');
  const before = variables;
  variables = variables
    .replace(/minSdkVersion\s*=\s*\d+/, 'minSdkVersion = 24')
    .replace(/compileSdkVersion\s*=\s*\d+/, 'compileSdkVersion = 35')
    .replace(/targetSdkVersion\s*=\s*\d+/, 'targetSdkVersion = 35');
  if (variables !== before) { fs.writeFileSync(variablesGradlePath, variables, 'utf8'); console.log('  ✓ Set variables.gradle SDK versions'); patchCount++; }
  else { console.log('  ○ variables.gradle SDK versions already correct'); }
} else if (fs.existsSync(ANDROID_DIR)) {
  console.error('  ERROR: variables.gradle not found'); failureCount++;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Report
// ═══════════════════════════════════════════════════════════════════════════════

console.log(`\n╔════════════════════════════════════════╗`);
console.log(`║  Android Patches Applied: ${String(patchCount).padEnd(13)}║`);
console.log(`║  Skipped (not found):     ${String(skipCount).padEnd(13)}║`);
console.log(`╚════════════════════════════════════════╝`);
if (failureCount > 0) {
  console.error(`\nAndroid patches failed: ${failureCount} required patch target(s) were missing or ambiguous.\n`);
  process.exit(1);
}
console.log('\nAndroid patches complete!\n');
