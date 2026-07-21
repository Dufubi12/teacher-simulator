/**
 * Печатный «Отчёт для директора» — общий рендер для симулятора и кабинета.
 * Открывает отчёт в новом окне (кнопка печати/PDF внутри).
 */
(function (global) {
    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function renderDirectorReport(r) {
        const esc = escapeHtml;
        const V = {
            next_stage: { label: 'Рекомендован к следующему этапу', color: '#16a34a', icon: '✅' },
            attention: { label: 'Пригласить, но проверить слабые места', color: '#d97706', icon: '⚠️' },
            risks: { label: 'Выраженные риски для учеников', color: '#dc2626', icon: '❌' }
        };
        const v = V[r.verdict] || V.attention;
        const titles = r.criteria_titles || {};
        // Отчёт может прийти от недоверенного кандидата (ссылка-приглашение) — числа санируем
        const num = (val, min, max) => {
            const n = Number(val);
            return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : null;
        };
        const scoreBadge = (s) => {
            const n = num(s, 0, 3);
            return n === null
                ? '<span class="dr-score na">нет данных</span>'
                : `<span class="dr-score s${n}">${n} / 3</span>`;
        };

        // Приоритеты школы: подсветка критериев и порядок (приоритетные первыми)
        const prioCrit = new Set(Array.isArray(r.priority_criteria) ? r.priority_criteria : []);
        const critEntries = Object.entries(r.criteria || {});
        const order = Array.isArray(r.criteria_order) ? r.criteria_order : [];
        if (order.length) {
            critEntries.sort((a, b) => {
                const ia = order.indexOf(a[0]), ib = order.indexOf(b[0]);
                return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
            });
        }
        const rows = critEntries.map(([key, c]) => {
            const star = prioCrit.has(key) ? '<span class="dr-prio-star" title="Приоритет школы">⭐</span>' : '';
            return `
            <tr${prioCrit.has(key) ? ' class="dr-prio-row"' : ''}>
                <td class="dr-crit">${star}${esc(titles[key] || key)}</td>
                <td>${scoreBadge(c.score)}</td>
                <td>
                    ${(c.evidence || []).map(q => `<div class="dr-quote">«${esc(q)}»</div>`).join('')}
                    <div class="dr-comment">${esc(c.comment || '')}</div>
                </td>
            </tr>`;
        }).join('');

        // Плашка «Школа ищет» + отдельный блок оценки приоритетов
        const prioList = (Array.isArray(r.priorities) ? r.priorities : [])
            .filter(p => p && typeof p === 'object' && typeof p.key === 'string');
        const prioNote = (r.priorities_note && typeof r.priorities_note === 'object') ? r.priorities_note : {};
        const PRIO_EMOJI = { stress:'🧊', nonconflict:'🕊️', empathy:'❤️', discipline:'🎯', clarity:'💬', support:'🌱' };
        const prioBadge = prioList.length
            ? `<div class="dr-prio-badge">🎯 <b>Школа ищет:</b> ${prioList.map(p => `${PRIO_EMOJI[p.key] || ''} ${esc(p.label)}`).join(' · ')}</div>`
            : '';
        const prioSection = prioList.length && Object.keys(prioNote).length
            ? `<h2>Приоритетные качества (по запросу школы)</h2>
<table>${prioList.map(p => prioNote[p.key]
    ? `<tr><td class="dr-crit">${PRIO_EMOJI[p.key] || ''} ${esc(p.label)}</td><td>${esc(prioNote[p.key])}</td></tr>` : '').join('')}</table>`
            : '';

        const flags = (r.red_flags || []).length
            ? r.red_flags.map(f => `<li><b>${esc(f.flag)}</b><div class="dr-quote">«${esc(f.evidence)}»</div></li>`).join('')
            : '<li class="dr-none">Критичных нарушений в этой сессии не зафиксировано.</li>';

        const artifacts = (r.next_artifacts || []).map(a =>
            `<li><b>${esc(a.what)}</b> — ${esc(a.how)}</li>`).join('');

        // Индивидуальный план развития: слабые критерии → конкретные дриллы
        const devPlan = Array.isArray(r.development_plan) ? r.development_plan : [];
        const devSection = devPlan.length ? `
<h2>Индивидуальный план развития</h2>
<table>
 ${devPlan.map(p => `
 <tr>
   <td class="dr-crit">${esc(p.title)} ${scoreBadge(p.score)}</td>
   <td>
     ${(p.drills || []).length ? `<div><b>Тренировать в симуляторе:</b> ${p.drills.map(d => `<span class="dev-drill">⚡ ${esc(d.title)}</span>`).join(' ')}</div>` : ''}
     <div class="dr-comment">${esc(p.advice || '')}</div>
   </td>
 </tr>`).join('')}
</table>
<div class="dr-comment" style="margin-top:6px;">Дриллы — на экране настройки симулятора: 3 минуты, одна цель. Рекомендация: проходить в тренировочном режиме с переигровкой до достижения цели, затем подтвердить аттестацией.</div>` : '';

        // Сертификация (порог школы)
        const cert = r.certification;
        const certBadge = cert
            ? `<div class="cert-badge ${cert.passed ? 'pass' : 'fail'}">${cert.passed ? '🎓' : '⛔'} ${esc(cert.label)}</div>`
            : '';

        // Режим прохождения и попытки: аттестация = одна попытка без переигровок,
        // тренировка = переигровки разрешены, их число — часть картины для руководителя
        const attempt = Math.max(1, parseInt(r.attempt, 10) || 1);
        const modeBadge = r.assessment
            ? `<div class="mode-badge assess">🎓 АТТЕСТАЦИЯ — одна попытка, без переигровок</div>`
            : `<div class="mode-badge train">🏋️ Тренировочный режим · попытка №${attempt}${attempt > 1 ? ` (переигровок: ${attempt - 1})` : ''}</div>`;

        // Самооценка кандидата vs AI
        const sa = r.self_assessment;
        const saSection = sa ? `
<h2>Самооценка кандидата</h2>
<table>
 <tr><td class="dr-crit">Сам оценил урок</td><td><b>${'★'.repeat(num(sa.stars, 0, 5) || 0)}${'☆'.repeat(5 - (num(sa.stars, 0, 5) || 0))}</b> (${num(sa.selfPercent, 0, 100)}%)</td></tr>
 <tr><td class="dr-crit">Оценка AI</td><td><b>${num(sa.aiPercent, 0, 100)}%</b></td></tr>
 <tr><td class="dr-crit">Индекс самокритичности</td><td><b>${esc(sa.index)}</b> (разрыв ${num(sa.gap, -100, 100) > 0 ? '+' : ''}${num(sa.gap, -100, 100)}%)</td></tr>
 ${sa.change ? `<tr><td class="dr-crit">«Что бы сделал иначе»</td><td><div class="dr-quote">«${esc(sa.change)}»</div></td></tr>` : ''}
</table>` : '';

        // Речевые метрики транскрипта (talk ratio — «продающий график»)
        const sp = r.speech;
        const trRatio = sp ? (num(sp.talkRatio, 0, 100) || 0) : 0;
        const trNote = sp ? (trRatio > 80 ? 'монолог — ученики почти не говорили' : trRatio >= 50 ? 'норма (50–70%)' : 'ученики говорили больше учителя') : '';
        const speechSection = sp ? `
<h2>Речевые метрики урока</h2>
<table>
 <tr><td class="dr-crit">Доля речи кандидата</td><td>
   <div class="tr-bar"><div class="tr-fill" style="width:${trRatio}%"></div><span>${trRatio}%</span></div>
   <div class="dr-comment">${esc(trNote)} · слов: кандидат ${num(sp.teacherWords, 0, 100000)}, ученики ${num(sp.studentWords, 0, 100000)}</div>
 </td></tr>
 <tr><td class="dr-crit">Открытые / развивающие вопросы</td><td><b>${num(sp.openQuestions, 0, 10000)}</b></td></tr>
 <tr><td class="dr-crit">Закрытые вопросы</td><td><b>${num(sp.closedQuestions, 0, 10000)}</b></td></tr>
 <tr><td class="dr-crit">Объяснения / директивы</td><td><b>${num(sp.explanations, 0, 10000)}</b> / <b>${num(sp.directives, 0, 10000)}</b></td></tr>
</table>` : '';

        // Голосовые метрики (если кандидат говорил голосом)
        const vm = r.voice;
        const wpm = vm ? (num(vm.wordsPerMin, 0, 1000) || 0) : 0;
        const loudPct = vm ? (num(vm.loudShare * 100, 0, 100) || 0) : 0;
        const tempoNote = vm ? (wpm < 100 ? 'медленный' : wpm <= 155 ? 'комфортный' : 'быстрый') : '';
        const voiceSection = vm ? `
<h2>Голосовые метрики (замер во время речи)</h2>
<table>
 <tr><td class="dr-crit">Темп речи</td><td><b>${wpm} слов/мин</b> — ${tempoNote} (норма 110–150)</td></tr>
 <tr><td class="dr-crit">На повышенных тонах</td><td><b>${loudPct}%</b> речи${loudPct > 10 ? ' — стоит обратить внимание' : ''}</td></tr>
 <tr><td class="dr-crit">Долгие паузы (&gt;2с)</td><td><b>${num(vm.longPauses, 0, 10000)}</b></td></tr>
 <tr><td class="dr-crit">Объём речи</td><td>${num(vm.words, 0, 100000)} слов за ${num(vm.speakingSeconds, 0, 100000)} сек</td></tr>
</table>` : '';

        const m = r.meta || {};
        const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>Отчёт для директора — Виртуальный класс</title>
<style>
 body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1b2e;max-width:800px;margin:0 auto;padding:36px 28px;line-height:1.55;}
 h1{font-size:24px;margin:0 0 4px;} .sub{color:#6b7280;font-size:13px;margin-bottom:22px;}
 .verdict{display:flex;align-items:center;gap:10px;padding:14px 18px;border-radius:12px;border:2px solid ${v.color};color:${v.color};font-weight:700;font-size:17px;margin-bottom:6px;}
 .reason{color:#374151;font-style:italic;margin:0 0 20px;}
 .pct{float:right;font-size:26px;font-weight:800;}
 h2{font-size:15px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:6px;margin:26px 0 12px;}
 table{width:100%;border-collapse:collapse;font-size:14px;}
 td{border-bottom:1px solid #eef0f4;padding:10px 8px;vertical-align:top;}
 .dr-crit{font-weight:700;width:200px;}
 .dr-score{font-weight:800;padding:2px 10px;border-radius:8px;white-space:nowrap;}
 .dr-score.s0{background:#fee2e2;color:#b91c1c;} .dr-score.s1{background:#ffedd5;color:#c2410c;}
 .dr-score.s2{background:#fef9c3;color:#a16207;} .dr-score.s3{background:#dcfce7;color:#15803d;}
 .dr-score.na{background:#f3f4f6;color:#6b7280;font-weight:600;}
 .dr-quote{background:#f6f6fb;border-left:3px solid #4f46e5;padding:5px 10px;margin:4px 0;font-style:italic;color:#374151;font-size:13px;}
 .dr-comment{color:#4b5563;font-size:13px;margin-top:4px;}
 ul{padding-left:20px;} li{margin-bottom:8px;} .dr-none{color:#15803d;}
 .disclaimer{margin-top:28px;padding:12px 16px;background:#f6f6fb;border-radius:10px;color:#6b7280;font-size:12px;}
 .tr-bar{position:relative;height:22px;background:#eef0f6;border-radius:20px;overflow:hidden;max-width:340px;}
 .tr-bar .tr-fill{height:100%;background:linear-gradient(90deg,#4f46e5,#8b5cf6);border-radius:20px;}
 .tr-bar span{position:absolute;right:10px;top:2px;font-weight:800;font-size:13px;color:#1a1b2e;}
 .cert-badge{display:inline-block;padding:10px 18px;border-radius:10px;font-weight:800;font-size:15px;margin:0 0 14px;}
 .cert-badge.pass{background:#dcfce7;color:#15803d;border:2px solid #15803d;}
 .cert-badge.fail{background:#fee2e2;color:#b91c1c;border:2px solid #b91c1c;}
 .mode-badge{display:inline-block;padding:8px 16px;border-radius:10px;font-weight:800;font-size:13.5px;margin:0 8px 14px 0;}
 .mode-badge.assess{background:#ede9fe;color:#5b21b6;border:2px solid #7c3aed;}
 .mode-badge.train{background:#f3f4f6;color:#374151;border:2px solid #d1d5db;}
 .dr-prio-badge{background:#f5f3ff;border:1.5px solid #ddd6fe;border-radius:10px;padding:10px 14px;margin:0 0 14px;font-size:13.5px;color:#5b21b6;line-height:1.5;}
 .dr-prio-row{background:#faf9ff;}
 .dr-prio-star{margin-right:5px;}
 .dev-drill{display:inline-block;background:#ffedd5;color:#c2410c;font-weight:700;font-size:12.5px;border-radius:20px;padding:2px 10px;margin:2px 4px 2px 0;}
 .toolbar{position:fixed;top:12px;right:12px;} .toolbar button{padding:10px 18px;border:none;border-radius:10px;background:#4f46e5;color:#fff;font-weight:700;cursor:pointer;}
 @media print{.toolbar{display:none;}}
</style></head><body>
<div class="toolbar"><button onclick="window.print()">🖨 Печать / PDF</button></div>
<h1>Отчёт для директора · ${r.mode === 'parent' ? 'встреча с трудным родителем' : 'наблюдения методиста'}</h1>
<div class="sub">${m.schoolName ? esc(m.schoolName) + ' · ' : ''}${esc(m.subject || '')}, ${esc(String(m.grade || ''))} класс${m.topic ? ' · тема: ' + esc(m.topic) : ''} · ${num(m.durationSeconds, 0, 100000) != null ? Math.round(num(m.durationSeconds, 0, 100000) / 60) : 0} мин · сложность класса ${num(r.difficulty, 1, 5) || 3}/5 · ${esc(new Date(m.generatedAt || Date.now()).toLocaleString('ru-RU'))}</div>
<div class="verdict"><span>${v.icon}</span> ${v.label} <span class="pct">${num(r.readiness_percent, 0, 100) != null ? num(r.readiness_percent, 0, 100) + '%' : ''}</span></div>
${modeBadge}
${prioBadge}
${certBadge}
<p class="reason">${esc(r.verdict_reason || '')}</p>
${prioSection}
<h2>Оценка по критериям (0–3, только с доказательствами)</h2>
<table>${rows}</table>
<h2>Сильные стороны</h2>
<ul>${(r.strengths || []).map(s => `<li>${esc(s)}</li>`).join('')}</ul>
<h2>Красные флаги</h2>
<ul>${flags}</ul>
${devSection}
${saSection}
${speechSection}
${voiceSection}
<h2>Что проверить дальше (симулятор этого не измеряет)</h2>
<ul>${artifacts}</ul>
<div class="disclaimer">${esc(r.disclaimer || '')}</div>
</body></html>`;

        const w = window.open('', '_blank');
        if (!w) { alert('Разрешите всплывающие окна, чтобы открыть отчёт.'); return; }
        w.document.write(html);
        w.document.close();
    }

    global.renderDirectorReport = renderDirectorReport;
})(typeof window !== 'undefined' ? window : globalThis);
