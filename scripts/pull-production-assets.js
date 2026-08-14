#!/usr/bin/env node
/**
 * pull-production-assets.js (v3 - targeted download from production manifest)
 *
 * Downloads specific production assets from isotopeai.in into isotope-code/public/
 * using the exact bundle hashes from the live production site.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const https = require('https');

const SITE_URL   = 'https://isotopeai.in';
const REPO_DIR   = process.env.REPO_DIR || path.resolve(__dirname, '../../isotope-code');
const PUBLIC_DIR = path.join(REPO_DIR, 'public');

let downloaded = 0;
let skipped    = 0;
let failed     = 0;

// All production JS assets from isotopeai.in (fetched 2026-08-13)
const PRODUCTION_JS_ASSETS = [
  'assets/AIAnalysisCard-Doc2pppX.js',
  'assets/AIAssistant-BeJ6VY5h.js',
  'assets/AIWeeklySummary-D2HI_7lI.js',
  'assets/About-BynUj5GR.js',
  'assets/Analytics-CSAy5Wjk.js',
  'assets/AnalyticsFeature-D58mar4z.js',
  'assets/AnalyticsPeriod-0k5S7aL8.js',
  'assets/AnalyticsSubjects-DybXK3Cp.js',
  'assets/AnalyticsTasks-Dgb4wj-E.js',
  'assets/AnalyticsToday-SoAlEDf_.js',
  'assets/App-DGCnckyy.js',
  'assets/AppAccessGate-DgqecF_g.js',
  'assets/AppLoading-BpotxtI6.js',
  'assets/Auth-D0Y8CB1f.js',
  'assets/ChapterHub-DPklwj3Y.js',
  'assets/CodeHighlighter-BhKVn1J2.js',
  'assets/Community-D64OvNmB.js',
  'assets/CommunityVisuals-mHr4KGyg.js',
  'assets/CompletionCelebration-DFviT01h.js',
  'assets/Dashboard-DjwuAE20.js',
  'assets/DashboardHeader-By-uE6f2.js',
  'assets/DemoLauncher-CJvgWhBQ.js',
  'assets/ExamCreateEditModal-B5Nqn7uW.js',
  'assets/ExamDetailPage-CG0PmRfn.js',
  'assets/ExamPlannerFeature-jR31fGos.js',
  'assets/ExamPrimitives-D7H6qecP.js',
  'assets/ExamTemplateSelectorModal-B_30VutC.js',
  'assets/Exams-CxN0xelA.js',
  'assets/Focus-CP21roB4.js',
  'assets/FocusTimerLanding-DwoxLp8t.js',
  'assets/GlobalPresenceBroadcaster-BLhacogK.js',
  'assets/GlobalQuickActionsModals-BgXMtgLn.js',
  'assets/GlobalTimer-2bkanYuJ.js',
  'assets/InviteOnlineOnlyRoute-pNOw7OES.js',
  'assets/IsotopeLogoIcon-CZe3mKZo.js',
  'assets/IsotopeWrapped-Dr1o4nkz.js',
  'assets/Landing-30Ourhwi.js',
  'assets/MarkdownRenderer-NhCbwZWU.js',
  'assets/MarkdownRendererContent-LAUUOOzZ.js',
  'assets/NetworkRequiredState-jaKaFXbY.js',
  'assets/NotFound-9KfZ0K6D.js',
  'assets/NumberInput-B64aEI2e.js',
  'assets/Onboarding-D4NoaLsz.js',
  'assets/OnboardingNavigation-BqM5Rj6z.js',
  'assets/PWAManager-CUuXr3sv.js',
  'assets/PWAUpdateButton-Dfz0sZv7.js',
  'assets/PageLayout-BkZbwOyQ.js',
  'assets/PremiumEffects-M4l2A-2w.js',
  'assets/Privacy-2wg91W65.js',
  'assets/ProgressiveSetupPrompt-DYBgfDLp.js',
  'assets/PublicMarketingApp-CKJZc1XX.js',
  'assets/QueryProvider-BOVsAZBb.js',
  'assets/QuestionMasterCard-Bn187k8t.js',
  'assets/QuickActionsMenu-CUJekZU9.js',
  'assets/RealAnalyticsOverview-BnzXFA2r.js',
  'assets/ResetPassword-IhYVpm0b.js',
  'assets/SessionEditModal-tN-oynLh.js',
  'assets/SessionLogTable-BxhJLR0a.js',
  'assets/SettingsLayout-Bm4x90sy.js',
  'assets/SharedAnalyticsComponents-CCEqN1zY.js',
  'assets/Sidebar-BeA2CKoW.js',
  'assets/Step1Goal-DV1mwbnm.js',
  'assets/Step1Profile-DOn4r35g.js',
  'assets/Step2Subjects-BgF2zeL9.js',
  'assets/Study-PPJn7aoq.js',
  'assets/StudyFeature-MNsr-gPu.js',
  'assets/StudyGroupsFeature-DINDKvkz.js',
  'assets/SubjectCreateModal-DaWmMufJ.js',
  'assets/SubjectIcon-b-6ickEr.js',
  'assets/Subscription-D8Xb-E6p.js',
  'assets/SupportPromptDialog-BJTm2DZD.js',
  'assets/Syllabus-uOw4P0MP.js',
  'assets/SyllabusFeature-BEN3Gt09.js',
  'assets/TaskCardModal-DrCjVDU4.js',
  'assets/TaskController-D_HDR25w.js',
  'assets/Tasks-DI2PJu8c.js',
  'assets/TasksFeature-Ih8sP5NE.js',
  'assets/Terms-12mtllDS.js',
  'assets/TodayFeature-BDMr9GlA.js',
  'assets/ToolsModal-BUv1MfAr.js',
  'assets/WelcomeTeaser-C6jfNmJc.js',
  'assets/analyticsWorker-nQtug1F7.js',
  'assets/bootstrap-BahD86kT.js',
  'assets/communityApi-Ccw5N_9O.js',
  'assets/demoCommunityV2-0u8m66V2.js',
  'assets/endOfDay-Bjl8FlyV.js',
  'assets/endOfWeek-BaE9fy1I.js',
  'assets/focusBackground-Dc8Rc9XQ.js',
  'assets/index-BJcE8Sd1.js',
  'assets/index-ugn6sq-x.js',
  'assets/marketing-core-DzcTqL0l.js',
  'assets/messaging-GqxsLPbk.js',
  'assets/sortable.esm-JH33FzE1.js',
  'assets/studyPreferences-CUOnDJ8h.js',
  'assets/studyTimeMaps-B0T_-AX0.js',
  'assets/subjectBranding-DaDo_h8r.js',
  'assets/taskAvailability-6L_g0qky.js',
  'assets/useAIStore-MWUcu16l.js',
  'assets/useAuthStore-Aw1au7RF.js',
  'assets/useChartAnimation-D6D43II5.js',
  'assets/useCommunity-BPAjUbtc.js',
  'assets/useFocusStore-B7vyqpDF.js',
  'assets/useNotificationStore-BTREori0.js',
  'assets/useOnlineStatus-wFaD9wM1.js',
  'assets/usePWA-BOujtGOv.js',
  'assets/useQuotesStore-BjSTHIMk.js',
  'assets/useSyncStore-rKDNP32M.js',
  'assets/useUIStore-CzAvnVUO.js',
  'assets/utils-CInGSUEV.js',
  'assets/vendor-charts-CZ6WiRhB.js',
  'assets/vendor-classnames-BNe0Xlio.js',
  'assets/vendor-markdown-core-dyexddTT.js',
  'assets/vendor-motion-BaHvqmIE.js',
  'assets/vendor-query-BnZPC5Kk.js',
  'assets/vendor-react-BWKHxYQy.js',
  'assets/vendor-router-C2sFoTjv.js',
  'assets/vendor-sentry-C0ZzGV-C.js',
  'assets/vendor-supabase-D_TSSuUW.js',
  'assets/vendor-syntax-highlighter-DSUK9YgI.js',
];

// CSS assets
const PRODUCTION_CSS_ASSETS = [
  'assets/AnalyticsFeature-BI4D9rRB.css',
  'assets/ExamPlannerFeature-BK7iptaH.css',
  'assets/FocusTimerLanding-DNaYTJ-8.css',
  'assets/IsotopeWrapped-COC1HC8h.css',
  'assets/StudyFeature-wJ5gTHoE.css',
  'assets/SyllabusFeature-DR18hntP.css',
  'assets/TasksFeature-DAQHhH8D.css',
  'assets/TodayFeature-C5gmptdm.css',
  'assets/community-BTpNdnFf.css',
  'assets/index-vm1MFJNb.css',
  'assets/marketing-ClgkQoR-.css',
  'assets/vendor-katex-ASjZcBK0.css',
];

// Non-asset public files
const PRODUCTION_ROOT_FILES = [
  'boot-recovery.js', 'pwa-local.js', 'update-checker.js',
  'auth-bridge.js', 'restore-and-launch.js', 'ux-setup.js',
  'focus-bg-import.js', 'manifest.webmanifest', 'sw.js',
  'favicon.svg', 'favicon.ico',
  'icons/icon.svg', 'icons/favicon-32x32.png', 'icons/icon-192x192.png',
  'icons/icon-192x192.svg', 'icons/icon-512x512.png', 'icons/icon-96x96.svg',
  'icons/apple-touch-icon.png', 'icons/maskable-icon-512x512.png',
  'sounds/rain.wav', 'sounds/wind.wav', 'sounds/crickets.wav',
  'sync/backup-normalizer.js', 'sync/local-data-adapter.js',
  'fonts/fonts.css',
];

function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'IsotopeAPK-Puller/3.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location.startsWith('http') ? res.headers.location : SITE_URL + res.headers.location;
        return fetch(loc).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function download(assetPath) {
  const dest = path.join(PUBLIC_DIR, assetPath);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
    skipped++;
    return;
  }
  try {
    const data = await fetch(`${SITE_URL}/${assetPath}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
    downloaded++;
    const size = (data.length / 1024).toFixed(1);
    console.log(`  ✓ ${assetPath} (${size} KB)`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${assetPath}: ${err.message}`);
  }
}

async function main() {
  console.log('=== Pull Production Assets (v3) ===\n');
  console.log(`SITE_URL  : ${SITE_URL}`);
  console.log(`PUBLIC_DIR: ${PUBLIC_DIR}\n`);

  if (!fs.existsSync(PUBLIC_DIR)) {
    console.error('ERROR: PUBLIC_DIR not found');
    process.exit(1);
  }

  // 1. Download index.html
  console.log('Phase 1: index.html ...');
  try {
    const html = (await fetch(SITE_URL + '/')).toString('utf8');
    fs.writeFileSync(path.join(PUBLIC_DIR, 'index.html'), html);
    downloaded++;
    console.log('  ✓ index.html');
  } catch (err) {
    console.error('  ✗ index.html:', err.message);
    process.exit(1);
  }

  // 2. Download all JS bundles
  console.log(`\nPhase 2: ${PRODUCTION_JS_ASSETS.length} JS bundles ...`);
  for (const asset of PRODUCTION_JS_ASSETS) await download(asset);

  // 3. Download all CSS
  console.log(`\nPhase 3: ${PRODUCTION_CSS_ASSETS.length} CSS files ...`);
  for (const asset of PRODUCTION_CSS_ASSETS) await download(asset);

  // 4. Download root files, fonts, icons, sounds
  console.log(`\nPhase 4: ${PRODUCTION_ROOT_FILES.length} root/font/icon/sound files ...`);
  for (const asset of PRODUCTION_ROOT_FILES) await download(asset);

  // 5. Scan CSS files for KaTeX font refs and download missing ones
  console.log('\nPhase 5: KaTeX font refs from CSS ...');
  const katexCss = path.join(PUBLIC_DIR, 'assets/vendor-katex-ASjZcBK0.css');
  if (fs.existsSync(katexCss)) {
    const css = fs.readFileSync(katexCss, 'utf8');
    const fontRefs = [...css.matchAll(/url\(([^)]+)\)/g)]
      .map(m => m[1].trim().replace(/^['"]|['"]$/g, ''))
      .filter(ref => ref && !ref.startsWith('data:') && ref.includes('/assets/'));
    console.log(`  Found ${fontRefs.length} font refs in KaTeX CSS`);
    for (const ref of fontRefs) {
      const assetPath = ref.startsWith('/') ? ref.slice(1) : ref;
      await download(assetPath);
    }
  }

  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║  Downloaded: ${String(downloaded).padEnd(25)}║`);
  console.log(`║  Skipped:    ${String(skipped).padEnd(25)}║`);
  console.log(`║  Failed:     ${String(failed).padEnd(25)}║`);
  console.log(`╚════════════════════════════════════════╝`);
  console.log('\n✅ Done!\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
