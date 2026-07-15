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
        const scoreBadge = (s) => s === null || s === undefined
            ? '<span class="dr-score na">нет данных</span>'
            : `<span class="dr-score s${s}">${s} / 3</span>`;

        const rows = Object.entries(r.criteria || {}).map(([key, c]) => `
            <tr>
                <td class="dr-crit">${esc(titles[key] || key)}</td>
                <td>${scoreBadge(c.score)}</td>
                <td>
                    ${(c.evidence || []).map(q => `<div class="dr-quote">«${esc(q)}»</div>`).join('')}
                    <div class="dr-comment">${esc(c.comment || '')}</div>
                </td>
            </tr>`).join('');

        const flags = (r.red_flags || []).length
            ? r.red_flags.map(f => `<li><b>${esc(f.flag)}</b><div class="dr-quote">«${esc(f.evidence)}»</div></li>`).join('')
            : '<li class="dr-none">Критичных нарушений в этой сессии не зафиксировано.</li>';

        const artifacts = (r.next_artifacts || []).map(a =>
            `<li><b>${esc(a.what)}</b> — ${esc(a.how)}</li>`).join('');

        // Сертификация (порог школы)
        const cert = r.certification;
        const certBadge = cert
            ? `<div class="cert-badge ${cert.passed ? 'pass' : 'fail'}">${cert.passed ? '🎓' : '⛔'} ${esc(cert.label)}</div>`
            : '';

        // Самооценка кандидата vs AI
        const sa = r.self_assessment;
        const saSection = sa ? `
<h2>Самооценка кандидата</h2>
<table>
 <tr><td class="dr-crit">Сам оценил урок</td><td><b>${'★'.repeat(sa.stars)}${'☆'.repeat(5 - sa.stars)}</b> (${sa.selfPercent}%)</td></tr>
 <tr><td class="dr-crit">Оценка AI</td><td><b>${sa.aiPercent}%</b></td></tr>
 <tr><td class="dr-crit">Индекс самокритичности</td><td><b>${esc(sa.index)}</b> (разрыв ${sa.gap > 0 ? '+' : ''}${sa.gap}%)</td></tr>
 ${sa.change ? `<tr><td class="dr-crit">«Что бы сделал иначе»</td><td><div class="dr-quote">«${esc(sa.change)}»</div></td></tr>` : ''}
</table>` : '';

        // Речевые метрики транскрипта (talk ratio — «продающий график»)
        const sp = r.speech;
        const trNote = sp ? (sp.talkRatio > 80 ? 'монолог — ученики почти не говорили' : sp.talkRatio >= 50 ? 'норма (50–70%)' : 'ученики говорили больше учителя') : '';
        const speechSection = sp ? `
<h2>Речевые метрики урока</h2>
<table>
 <tr><td class="dr-crit">Доля речи кандидата</td><td>
   <div class="tr-bar"><div class="tr-fill" style="width:${Math.min(100, sp.talkRatio)}%"></div><span>${sp.talkRatio}%</span></div>
   <div class="dr-comment">${esc(trNote)} · слов: кандидат ${sp.teacherWords}, ученики ${sp.studentWords}</div>
 </td></tr>
 <tr><td class="dr-crit">Открытые / развивающие вопросы</td><td><b>${sp.openQuestions}</b></td></tr>
 <tr><td class="dr-crit">Закрытые вопросы</td><td><b>${sp.closedQuestions}</b></td></tr>
 <tr><td class="dr-crit">Объяснения / директивы</td><td><b>${sp.explanations}</b> / <b>${sp.directives}</b></td></tr>
</table>` : '';

        // Голосовые метрики (если кандидат говорил голосом)
        const vm = r.voice;
        const tempoNote = vm ? (vm.wordsPerMin < 100 ? 'медленный' : vm.wordsPerMin <= 155 ? 'комфортный' : 'быстрый') : '';
        const voiceSection = vm ? `
<h2>Голосовые метрики (замер во время речи)</h2>
<table>
 <tr><td class="dr-crit">Темп речи</td><td><b>${vm.wordsPerMin} слов/мин</b> — ${tempoNote} (норма 110–150)</td></tr>
 <tr><td class="dr-crit">На повышенных тонах</td><td><b>${Math.round(vm.loudShare * 100)}%</b> речи${vm.loudShare > 0.1 ? ' — стоит обратить внимание' : ''}</td></tr>
 <tr><td class="dr-crit">Долгие паузы (&gt;2с)</td><td><b>${vm.longPauses}</b></td></tr>
 <tr><td class="dr-crit">Объём речи</td><td>${vm.words} слов за ${vm.speakingSeconds} сек</td></tr>
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
 .toolbar{position:fixed;top:12px;right:12px;} .toolbar button{padding:10px 18px;border:none;border-radius:10px;background:#4f46e5;color:#fff;font-weight:700;cursor:pointer;}
 @media print{.toolbar{display:none;}}
</style></head><body>
<div class="toolbar"><button onclick="window.print()">🖨 Печать / PDF</button></div>
<h1>Отчёт для директора · ${r.mode === 'parent' ? 'встреча с трудным родителем' : 'наблюдения методиста'}</h1>
<div class="sub">${m.schoolName ? esc(m.schoolName) + ' · ' : ''}${esc(m.subject || '')}, ${esc(String(m.grade || ''))} класс${m.topic ? ' · тема: ' + esc(m.topic) : ''} · ${Math.round((m.durationSeconds || 0) / 60)} мин · сложность класса ${r.difficulty || 3}/5 · ${new Date(m.generatedAt || Date.now()).toLocaleString('ru-RU')}</div>
<div class="verdict"><span>${v.icon}</span> ${v.label} <span class="pct">${typeof r.readiness_percent === 'number' ? r.readiness_percent + '%' : ''}</span></div>
${certBadge}
<p class="reason">${esc(r.verdict_reason || '')}</p>
<h2>Оценка по критериям (0–3, только с доказательствами)</h2>
<table>${rows}</table>
<h2>Сильные стороны</h2>
<ul>${(r.strengths || []).map(s => `<li>${esc(s)}</li>`).join('')}</ul>
<h2>Красные флаги</h2>
<ul>${flags}</ul>
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
