/* Smoke-тест батча: дриллы, retry-цикл, график роста. Запуск: node smoke_batch.js */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8099';
const errors = [];
let failed = 0;

function check(name, cond) {
    if (cond) { console.log(`  ✅ ${name}`); }
    else { console.log(`  ❌ ${name}`); failed++; }
}

// Перехват firebase: подменяем auth/firestore на заглушки с залогиненным юзером
const FIREBASE_STUB = `
Object.defineProperty(window, 'firebase', {
    configurable: true,
    set(v) {
        const fakeUser = { uid: 'test-uid', email: 'test@test.ru', displayName: 'Тест' };
        const fakeDocSnap = {
            exists: true,
            id: 'x',
            data: () => ({
                email: 'test@test.ru', displayName: 'Тест',
                progress: { totalSessions: 2, totalTime: 600, avgScore: 60 },
                skills: { empathy: 60, conflictResolution: 55, boundaryKeeping: 50, patience: 65 },
                schoolProfile: null
            })
        };
        const fakeDocRef = {
            get: async () => fakeDocSnap,
            set: async () => {}, update: async () => {},
            collection: () => fakeColl(), onSnapshot: () => () => {}
        };
        function fakeColl() {
            return {
                doc: () => fakeDocRef, add: async () => ({ id: 'new-id' }),
                orderBy: function(){ return this; }, limit: function(){ return this; },
                where: function(){ return this; },
                get: async () => ({ docs: [], empty: true, forEach: () => {} })
            };
        }
        const patched = {
            ...v,
            initializeApp: () => {},
            auth: () => ({
                onAuthStateChanged: (cb) => { setTimeout(() => cb(fakeUser), 30); return () => {}; },
                currentUser: fakeUser,
                signOut: async () => {}
            }),
            firestore: Object.assign(() => ({
                collection: fakeColl, doc: () => fakeDocRef,
                FieldValue: { serverTimestamp: () => new Date() }
            }), { FieldValue: { serverTimestamp: () => new Date(), increment: (n) => n } })
        };
        Object.defineProperty(window, 'firebase', { value: patched, configurable: true, writable: true });
    },
    get() { return undefined; }
});
window.alert = () => {}; window.confirm = () => true;
`;

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addInitScript(FIREBASE_STUB);

// В песочнице CDN-запросы виснут и блокируют DOMContentLoaded — подменяем всё внешнее заглушками
await ctx.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(BASE)) return route.continue();
    if (url.includes('firebase-app')) return route.fulfill({ contentType: 'application/javascript', body: 'window.firebase = { SDK_VERSION: "stub" };' });
    if (/chart\.js/i.test(url)) return route.fulfill({ contentType: 'application/javascript', body: 'window.Chart = class ChartStub { constructor(){} destroy(){} };' });
    const rt = route.request().resourceType();
    if (rt === 'stylesheet') return route.fulfill({ contentType: 'text/css', body: '' });
    if (rt === 'script') return route.fulfill({ contentType: 'application/javascript', body: ';' });
    return route.fulfill({ status: 204, body: '' });
});

// ── 1. Симулятор: дриллы на экране настройки ──
console.log('▶ simulator_v4_avatar.html');
const page = await ctx.newPage();
page.on('pageerror', e => {
    // THREE.* — артефакт CDN-заглушки (three.js подменён пустышкой), не баг приложения
    if (/THREE/.test(e.message)) return;
    errors.push('SIM pageerror: ' + e.message);
});
await page.goto(`${BASE}/simulator_v4_avatar.html?scenario=first-day`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(1500);

check('5 карточек дриллов', await page.locator('#drillsRow .drill-card').count() === 5);
check('replayLesson определён', await page.evaluate(() => typeof replayLesson === 'function'));
check('DRILLS: 5 записей, у всех есть goal', await page.evaluate(() =>
    DRILLS.length === 5 && DRILLS.every(d => d.goal && d.title)));

// Клик по дриллу «Телефонщик» → урок стартует
await page.evaluate(() => startDrill('drill-phone'));
await page.waitForTimeout(500);
check('экран настройки скрыт после старта дрилла',
    await page.evaluate(() => document.getElementById('studentSelection').classList.contains('hidden')));
check('activeDrill = drill-phone', await page.evaluate(() => activeDrill && activeDrill.id === 'drill-phone'));
check('системное сообщение с целью дрилла',
    (await page.locator('#messages .message.system').first().textContent()).includes('Дрилл'));
check('header показывает дрилл', (await page.locator('#header-info').textContent()).includes('Дрилл'));
await page.waitForTimeout(2700);
check('открывающая реплика Макса пришла',
    (await page.locator('#messages').textContent()).includes('Макс'));
check('3 ученика в классе', await page.evaluate(() => students.length === 3));

// retry-цикл: заглушим lastSessionResult и вызовем replayLesson
await page.evaluate(() => {
    window.__lastSessionResult = { score: 55, skillsGained: { empathy: 60, conflictResolution: 50, boundaryKeeping: 40, patience: 70 } };
    lessonEnded = true;
    replayLesson();
});
await page.waitForTimeout(400);
check('replay: attemptNumber = 2', await page.evaluate(() => attemptNumber === 2));
check('replay: lessonEnded сброшен', await page.evaluate(() => lessonEnded === false));
check('replay: чат очищен и заново начат', await page.evaluate(() =>
    document.getElementById('messages').children.length <= 2));
check('replay: prevAttempt.score = 55', await page.evaluate(() => prevAttempt && prevAttempt.score === 55));

// showAnalysisResults с prevAttempt → блок сравнения + кнопка переиграть
await page.evaluate(() => {
    showAnalysisResults({
        score: 72, skillsGained: { empathy: 70, conflictResolution: 60, boundaryKeeping: 55, patience: 75 },
        aiAnalysis: { feedback: 'Тест', good_points: ['a'], bad_points: ['b'], recommendations: ['c'],
                      drill_goal_achieved: true, drill_comment: 'Телефон убран без конфликта.' }
    });
});
await page.waitForTimeout(300);
const modalText = await page.locator('.results-overlay').textContent();
check('модалка: сравнение попыток (55 → 72)', modalText.includes('55') && modalText.includes('72'));
check('модалка: блок цели дрилла ✅', modalText.includes('Цель дрилла') && modalText.includes('достигнута'));
check('модалка: кнопка «Переиграть сцену»', modalText.includes('Переиграть сцену'));
await page.close();

// ── 1b. Режим аттестации: ?mode=assessment ──
console.log('▶ simulator ?mode=assessment');
const ap = await ctx.newPage();
ap.on('pageerror', e => { if (!/THREE/.test(e.message)) errors.push('ASSESS pageerror: ' + e.message); });
await ap.goto(`${BASE}/simulator_v4_avatar.html?scenario=first-day&mode=assessment`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await ap.waitForTimeout(1500);
check('assessmentMode включён из URL', await ap.evaluate(() => assessmentMode === true && assessmentLocked === true));
check('тумблер отмечен и заблокирован', await ap.evaluate(() => {
    const t = document.getElementById('assessmentToggle');
    return t && t.checked && t.disabled;
}));
check('заметка «включён руководителем» видна', await ap.evaluate(() =>
    document.getElementById('assessmentLockedNote').style.display !== 'none'));
// старт дрилла и попытка переиграть — replay должен быть заблокирован
await ap.evaluate(() => startDrill('drill-meltdown'));
await ap.waitForTimeout(400);
await ap.evaluate(() => { lessonEnded = true; replayLesson(); });
await ap.waitForTimeout(200);
check('replay заблокирован: attemptNumber остался 1', await ap.evaluate(() => attemptNumber === 1));
check('replay заблокирован: lessonEnded не сброшен', await ap.evaluate(() => lessonEnded === true));
// модалка результатов: вместо кнопки «Переиграть» — плашка аттестации
await ap.evaluate(() => {
    showAnalysisResults({ score: 70, skillsGained: {}, aiAnalysis: { feedback: 'x', good_points: [], bad_points: [], recommendations: [] } });
});
await ap.waitForTimeout(200);
const assessModal = await ap.locator('.results-overlay').textContent();
check('модалка: нет кнопки «Переиграть сцену»', !assessModal.includes('Переиграть сцену —'));
check('модалка: плашка «Режим аттестации»', assessModal.includes('Режим аттестации'));
await ap.close();

// ── 2. Дашборд: canvas графика роста + вкладки живы ──
console.log('▶ dashboard.html');
const dash = await ctx.newPage();
dash.on('pageerror', e => errors.push('DASH pageerror: ' + e.message));
await dash.goto(`${BASE}/dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await dash.waitForTimeout(1800);
check('growthChart canvas есть', await dash.locator('#growthChart').count() === 1);
check('renderGrowthChart определён', await dash.evaluate(() => typeof renderGrowthChart === 'function'));
check('renderGrowthChart не падает на данных', await dash.evaluate(() => {
    try {
        renderGrowthChart([
            { score: 40, drill: null }, { score: 55, drill: { title: 'Телефонщик' } },
            { score: 60, drill: null }, { score: 72, drill: null }
        ].reverse());
        return true;
    } catch (e) { window.__gcErr = e.message; return false; }
}));
check('калибровка: только аттестации входят в расчёт', await dash.evaluate(() => {
    candidatesCache = [
        { assessment: true, outcome: 'hired_good', verdict: 'next_stage' },  // верный прогноз — считается
        { assessment: true, outcome: 'hired_bad', verdict: 'next_stage' },   // ошибка — считается
        { assessment: false, outcome: 'hired_bad', verdict: 'next_stage' },  // тренировка — НЕ считается
        { assessment: false, outcome: 'hired_good', verdict: 'risks' }       // тренировка — НЕ считается
    ];
    renderCalibration();
    const txt = document.getElementById('calibrationText').textContent;
    return txt.includes('50%') && txt.includes('1 из 2');
}));
check('калибровка: одни тренировки → подсказка вместо процента', await dash.evaluate(() => {
    candidatesCache = [{ assessment: false, outcome: 'hired_good', verdict: 'next_stage' }];
    renderCalibration();
    return document.getElementById('calibrationText').textContent.includes('только по аттестационным');
}));
await dash.close();

await browser.close();

console.log('──────────────');
if (errors.length) { console.log('JS-ошибки страниц:'); errors.forEach(e => console.log('  • ' + e)); }
if (failed === 0 && errors.length === 0) { console.log('✅ SMOKE PASS'); process.exit(0); }
else { console.log(`❌ SMOKE FAIL (${failed} проверок, ${errors.length} js-ошибок)`); process.exit(1); }
