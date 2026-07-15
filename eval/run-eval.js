/**
 * Eval стабильности оценок /api/session-analysis.
 *
 * Гоняет 3 эталонных транскрипта (good/medium/bad) по N раз и проверяет:
 *   1. Попадание в ожидаемый диапазон баллов (each run).
 *   2. Разброс внутри транскрипта (max-min) ≤ SPREAD_LIMIT.
 *   3. Порядок средних: bad < medium < good (с зазором ≥ ORDER_GAP).
 *
 * Запуск (Node 18+):
 *   node eval/run-eval.js                          # против прода
 *   API_URL=http://localhost:3000 node eval/run-eval.js
 *   RUNS=5 node eval/run-eval.js
 */

import { TRANSCRIPTS } from './transcripts.js';

const API_URL = (process.env.API_URL || 'https://teacher-simulator-beta.vercel.app').replace(/\/$/, '');
const RUNS = Math.max(1, parseInt(process.env.RUNS, 10) || 3);
const SPREAD_LIMIT = 20;  // допустимый разброс баллов между прогонами одного транскрипта
const ORDER_GAP = 10;     // минимальный зазор между средними соседних уровней

async function scoreOnce(t) {
    const res = await fetch(`${API_URL}/api/session-analysis`, {
        method: 'POST',
        signal: AbortSignal.timeout(90000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            conversationHistory: t.history,
            scenarioId: `eval-${t.id}`,
            duration: t.duration,
            hintsHistory: []
        })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    if (typeof data.overall_score !== 'number') throw new Error(`overall_score отсутствует: ${JSON.stringify(data).slice(0, 200)}`);
    return { score: data.overall_score, skills: data.skills || {} };
}

function stats(scores) {
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return { min, max, avg: Math.round(avg * 10) / 10, spread: max - min };
}

async function main() {
    console.log(`Eval session-analysis @ ${API_URL} · ${RUNS} прогона(ов) на транскрипт\n`);
    const results = {};
    const failures = [];

    for (const t of TRANSCRIPTS) {
        const scores = [];
        for (let i = 0; i < RUNS; i++) {
            try {
                const { score } = await scoreOnce(t);
                scores.push(score);
                process.stdout.write(`  [${t.id}] прогон ${i + 1}/${RUNS}: ${score}\n`);
            } catch (e) {
                failures.push(`[${t.id}] прогон ${i + 1} упал: ${e.message}`);
                process.stdout.write(`  [${t.id}] прогон ${i + 1}/${RUNS}: ОШИБКА ${e.message}\n`);
            }
        }
        if (scores.length === 0) continue;

        const s = stats(scores);
        results[t.id] = s;

        for (const score of scores) {
            if (score < t.expected.min || score > t.expected.max) {
                failures.push(`[${t.id}] балл ${score} вне диапазона ${t.expected.min}-${t.expected.max} («${t.label}»)`);
            }
        }
        if (s.spread > SPREAD_LIMIT) {
            failures.push(`[${t.id}] разброс ${s.spread} > ${SPREAD_LIMIT} (min ${s.min}, max ${s.max}) — оценка нестабильна`);
        }
        console.log(`  [${t.id}] avg ${s.avg}, разброс ${s.spread} (ожидание: ${t.expected.min}-${t.expected.max})\n`);
    }

    // Порядок средних: bad < medium < good
    if (results.bad && results.medium && results.good) {
        if (results.bad.avg + ORDER_GAP > results.medium.avg) {
            failures.push(`Порядок нарушен: bad avg ${results.bad.avg} не ниже medium avg ${results.medium.avg} (зазор < ${ORDER_GAP})`);
        }
        if (results.medium.avg + ORDER_GAP > results.good.avg) {
            failures.push(`Порядок нарушен: medium avg ${results.medium.avg} не ниже good avg ${results.good.avg} (зазор < ${ORDER_GAP})`);
        }
    } else {
        failures.push('Не все транскрипты дали результат — порядок не проверен');
    }

    console.log('──────────────────────────────');
    if (failures.length === 0) {
        console.log(`✅ PASS — оценка стабильна и различает уровни (good ${results.good.avg} > medium ${results.medium.avg} > bad ${results.bad.avg})`);
        process.exit(0);
    } else {
        console.log(`❌ FAIL — ${failures.length} проблем(ы):`);
        failures.forEach(f => console.log('  • ' + f));
        process.exit(1);
    }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
