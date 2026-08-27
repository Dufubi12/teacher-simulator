/*
 * skills-module.js — модуль развития педагогических навыков.
 * Рисует радар 4 навыков + шкалы уровней + (опц.) рекомендацию «что подтянуть».
 * Самодостаточный SVG, без внешних зависимостей.
 *
 * export renderSkillsModule(mountEl, data, opts)
 *   data.skills = { empathy, conflictResolution, boundaryKeeping, patience }  // 0-100
 *   opts = { mode: 'dashboard'|'modal', sessionCount, showNextSteps }
 */

const SKILLS = [
  { key: 'empathy',            label: 'Эмпатия',              short: 'Эмпатия',
    tip: 'Называйте эмоции ученика вслух («вижу, что тебе трудно»), спрашивайте о самочувствии прежде содержания.' },
  { key: 'conflictResolution', label: 'Разрешение конфликтов', short: 'Конфликты',
    tip: 'Восстановительные вопросы вместо приказов: «Что случилось? Кого это задело? Как исправить?»' },
  { key: 'boundaryKeeping',    label: 'Удержание границ',      short: 'Границы',
    tip: 'Границы держите спокойно и коротко, без крика — на давление тревожные ученики замыкаются.' },
  { key: 'patience',           label: 'Терпение',             short: 'Терпение',
    tip: 'Пауза перед реакцией на провокацию. Не отвечайте на эмоции эмоциями.' },
];

const C = {
  palm: '#5E2611', olive: '#6A6F4C', amber: '#8A7A3F', alarm: '#A81E14',
  ink: '#422F28', muted: '#7A6455', sand: '#E4DAC7', line: '#DCCFB8', card: '#FBF7EF',
};

function clamp(v) { v = Number(v); return isFinite(v) ? Math.max(0, Math.min(100, v)) : 0; }

// Уровень навыка по баллу (согласовано с раскраской «Средних показателей»)
function level(v) {
  if (v >= 80) return { name: 'Мастер',        color: C.palm };
  if (v >= 65) return { name: 'Уверенный',     color: C.olive };
  if (v >= 50) return { name: 'Развивающийся', color: C.amber };
  return { name: 'Начальный', color: C.alarm };
}

// Радар: 4 оси (эмпатия сверху, по часовой). Возвращает SVG-строку.
function radarSVG(values) {
  const size = 240, cx = size / 2, cy = size / 2, R = 92;
  const angles = [-90, 0, 90, 180].map(a => a * Math.PI / 180); // top, right, bottom, left
  const pt = (val, i) => {
    const r = (clamp(val) / 100) * R;
    return [cx + r * Math.cos(angles[i]), cy + r * Math.sin(angles[i])];
  };
  // сетка (кольца 25/50/75/100)
  let grid = '';
  [0.25, 0.5, 0.75, 1].forEach(f => {
    const poly = angles.map(a => `${(cx + R * f * Math.cos(a)).toFixed(1)},${(cy + R * f * Math.sin(a)).toFixed(1)}`).join(' ');
    grid += `<polygon points="${poly}" fill="none" stroke="${C.line}" stroke-width="1"/>`;
  });
  // оси
  angles.forEach(a => {
    grid += `<line x1="${cx}" y1="${cy}" x2="${(cx + R * Math.cos(a)).toFixed(1)}" y2="${(cy + R * Math.sin(a)).toFixed(1)}" stroke="${C.line}" stroke-width="1"/>`;
  });
  // фигура значений
  const pts = values.map((v, i) => pt(v, i));
  const poly = pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const dots = pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="${C.palm}"/>`).join('');
  // подписи осей (короткие). Правую/левую держим внутри поля с запасом
  const labelPos = [[cx, cy - R - 10], [cx + R + 6, cy + 4], [cx, cy + R + 18], [cx - R - 6, cy + 4]];
  const anchors = ['middle', 'start', 'middle', 'end'];
  const labels = SKILLS.map((s, i) =>
    `<text x="${labelPos[i][0]}" y="${labelPos[i][1]}" font-size="11" font-weight="600" fill="${C.muted}" text-anchor="${anchors[i]}">${s.short}</text>`
  ).join('');
  // viewBox с горизонтальным запасом ±44, чтобы подписи не обрезались
  // Фигура значений «прорисовывается» из центра (scale 0→1). Уважает reduced-motion.
  return `<svg viewBox="-44 -6 ${size + 88} ${size + 24}" width="${size}" height="${size}" role="img" aria-label="Радар навыков">
    <style>@keyframes vplRadarIn{from{transform:scale(0)}to{transform:scale(1)}}
      .vpl-radar-fill{transform-box:fill-box;transform-origin:center;animation:vplRadarIn .7s cubic-bezier(.16,1,.3,1) both}
      @media (prefers-reduced-motion:reduce){.vpl-radar-fill{animation:none}}</style>
    ${grid}
    <g class="vpl-radar-fill">
      <polygon points="${poly}" fill="${C.palm}22" stroke="${C.palm}" stroke-width="2"/>
      ${dots}
    </g>
    ${labels}
  </svg>`;
}

function bar(val, color) {
  return `<div style="height:8px;background:${C.sand};border-radius:999px;overflow:hidden;margin-top:6px;">
    <div style="height:100%;width:${clamp(val)}%;background:${color};border-radius:999px;"></div></div>`;
}

export function renderSkillsModule(mount, data, opts = {}) {
  if (!mount) return;
  const skills = (data && data.skills) || {};
  const vals = SKILLS.map(s => clamp(skills[s.key]));
  const showNext = !!opts.showNextSteps;

  // самый слабый навык — для рекомендации
  let weakIdx = 0;
  vals.forEach((v, i) => { if (v < vals[weakIdx]) weakIdx = i; });

  const rows = SKILLS.map((s, i) => {
    const v = vals[i], lv = level(v);
    return `<div style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <span style="font-size:14px;font-weight:600;color:${C.ink};">${s.label}</span>
        <span style="font-size:13px;color:${C.muted};font-variant-numeric:tabular-nums;">
          <b style="color:${lv.color};">${v}</b>/100 · <span style="color:${lv.color};">${lv.name}</span>
        </span>
      </div>
      ${bar(v, lv.color)}
    </div>`;
  }).join('');

  const nextBlock = showNext ? `
    <div style="margin-top:18px;padding:16px 18px;background:${C.card};border:1px solid ${C.line};border-left:4px solid ${C.palm};border-radius:14px;">
      <div style="font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:${C.muted};margin-bottom:6px;">Что подтянуть в первую очередь</div>
      <div style="font-size:15px;font-weight:700;color:${C.ink};margin-bottom:4px;">${SKILLS[weakIdx].label} — ${vals[weakIdx]}/100</div>
      <div style="font-size:14px;color:${C.ink};line-height:1.5;">${SKILLS[weakIdx].tip}</div>
      <a href="scenarios.html" style="display:inline-block;margin-top:10px;font-size:13px;font-weight:700;color:${C.palm};text-decoration:none;">Тренировать →</a>
    </div>` : '';

  mount.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:24px;align-items:center;">
      <div style="flex:0 0 240px;max-width:100%;margin:0 auto;">${radarSVG(vals)}</div>
      <div style="flex:1;min-width:240px;">${rows}</div>
    </div>
    ${nextBlock}
  `;
}
