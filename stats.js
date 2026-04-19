/**
 * stats.js — Renders the statistics panel.
 * Depends on Chart.js loaded as a global (window.Chart) via CDN script tag.
 */

import { history, TIMER_LABELS } from './history.js';
import { TIMER_IDS } from './timers.js';

/** Short abbreviations shown on the radar chart axes */
export const TIMER_ABBR = {
  dead:         'MC',
  active:       'CA',
  coaching:     'CO',
  motor:        'MO',
  instructions: 'TI',
};

/** Accent colours per timer (indigo palette) */
const TIMER_COLORS = {
  dead:         '#6366f1',
  active:       '#22d3ee',
  coaching:     '#f59e0b',
  motor:        '#e879f9',
  instructions: '#34d399',
};

/** @type {any|null} Chart.js radar instance */
let radarChart = null;
/** @type {any|null} Chart.js timeline instance */
let timelineChart = null;

function fmt(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function computeStats() {
  return TIMER_IDS.map((id) => {
    const segments = history.filter((e) => e.id === id);
    const total    = segments.reduce((sum, e) => sum + e.duration, 0);
    const count    = segments.length;
    const min      = count > 0 ? Math.min(...segments.map((e) => e.duration)) : null;
    const max      = count > 0 ? Math.max(...segments.map((e) => e.duration)) : null;
    return { id, label: TIMER_LABELS[id] ?? id, abbr: TIMER_ABBR[id] ?? id, color: TIMER_COLORS[id] ?? '#6366f1', total, count, min, max };
  });
}

/** @type {any|null} Chart.js detail scatter instance */
let detailChart = null;

export function renderStats() {
  const stats      = computeStats();
  const grandTotal = stats.reduce((sum, s) => sum + s.total, 0);
  _renderEmptyState(stats);
  _renderLegend(stats);
  _renderTable(stats, grandTotal);
  _renderTimeline();
  _renderRadar(stats);
  _initDialog(stats, grandTotal);
}

function _renderEmptyState(stats) {
  const empty   = document.getElementById('stats-empty');
  const content = document.getElementById('stats-content');
  const legend  = document.getElementById('stats-legend');
  if (!empty || !content) return;
  const hasData = stats.some((s) => s.count > 0);
  empty.classList.toggle('hidden', hasData);
  content.classList.toggle('hidden', !hasData);
  legend?.classList.toggle('hidden', !hasData);
}

function _renderLegend(stats) {
  const el = document.getElementById('stats-legend');
  if (!el) return;
  el.innerHTML = stats
    .map(
      (s) => `
      <div class="flex items-center gap-1.5">
        <span class="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style="background:${s.color}"></span>
        <span class="text-xs font-bold" style="color:${s.color}">${s.abbr}</span>
        <span class="text-xs text-slate-400">${s.label}</span>
      </div>`
    )
    .join('');
}

function _renderTable(stats, grandTotal) {
  // Total training time in header
  const totalEl = document.getElementById('stats-total-time');
  if (totalEl) totalEl.textContent = fmt(grandTotal);

  const tbody = document.getElementById('stats-tbody');
  if (!tbody) return;

  tbody.innerHTML = stats
    .map((s) => {
      const pct = grandTotal > 0 ? Math.round((s.total / grandTotal) * 100) : 0;
      return `
    <tr class="border-t border-slate-700/60 cursor-pointer hover:bg-slate-700/30 transition-colors" data-detail-id="${s.id}">
      <td class="py-2.5 pr-2">
        <div class="flex items-center gap-2">
          <span class="inline-block w-2 h-2 rounded-sm flex-shrink-0" style="background:${s.color}"></span>
          <span class="text-xs font-bold" style="color:${s.color}">${s.abbr}</span>
        </div>
      </td>
      <td class="py-2.5 text-sm font-mono font-semibold text-slate-200 text-center tabular-nums">${fmt(s.total)}</td>
      <td class="py-2.5 text-sm text-slate-400 text-center">
        <div class="flex flex-col items-center">
          <span>${pct}%</span>
          <div class="w-10 h-1 rounded-full bg-slate-700 mt-1 overflow-hidden">
            <div class="h-full rounded-full" style="width:${pct}%;background:${s.color}"></div>
          </div>
        </div>
      </td>
      <td class="py-2.5 text-sm text-slate-400 text-center">${s.count}</td>
      <td class="py-2.5 text-sm font-mono text-slate-400 text-center tabular-nums">${s.min !== null ? fmt(s.min) : '—'}</td>
      <td class="py-2.5 text-sm font-mono text-slate-400 text-center tabular-nums">${s.max !== null ? fmt(s.max) : '—'}</td>
    </tr>`;
    })
    .join('');
}

function _buildTimelineDatasets() {
  if (history.length === 0) return [];
  const t0 = Math.min(...history.map((e) => e.startedAt));
  return TIMER_IDS.map((id) => {
    const segments = history
      .filter((e) => e.id === id)
      .sort((a, b) => a.startedAt - b.startedAt);
    let cum = 0;
    const data = [{ x: 0, y: 0 }];
    segments.forEach((seg) => {
      const endSec = Math.round((seg.startedAt + seg.duration - t0) / 1000);
      cum += seg.duration;
      data.push({ x: endSec, y: cum });
    });
    return {
      label:               TIMER_LABELS[id] ?? id,
      data,
      borderColor:         TIMER_COLORS[id],
      backgroundColor:     TIMER_COLORS[id] + '22',
      borderWidth:         2,
      pointRadius:         (ctx) => (ctx.dataIndex === 0 ? 0 : 3),
      pointHoverRadius:    5,
      stepped:             'after',
      tension:             0,
      fill:                false,
    };
  });
}

function _renderTimeline() {
  const canvas = document.getElementById('timeline-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (timelineChart) {
    timelineChart.destroy();
    timelineChart = null;
  }
  const datasets = _buildTimelineDatasets();

  // Scale chart width: 50px per 10-minute tick, based on max timeline x value
  const wrapper = document.getElementById('timeline-wrapper');
  if (wrapper) {
    const maxSec = history.length > 0
      ? Math.max(...history.map((e) => Math.round((e.startedAt + e.duration - Math.min(...history.map((x) => x.startedAt))) / 1000)))
      : 0;
    const ticks = Math.ceil(maxSec / 600) || 1;
    const minW = Math.max(200, ticks * 50);
    wrapper.style.width = minW + 'px';
  }

  timelineChart = new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          borderColor:     '#334155',
          borderWidth:     1,
          titleColor:      '#94a3b8',
          bodyColor:       '#f1f5f9',
          padding:         10,
          callbacks: {
            title: (items) => `@ ${fmt(Math.round(items[0].parsed.x) * 1000)}`,
            label: (ctx)   => `  ${ctx.dataset.label}: ${fmt(Math.round(ctx.parsed.y))}`,
          },
        },
      },
      scales: {
        x: {
          type:  'linear',
          grid:  { color: 'rgba(148,163,184,0.07)' },
          border: { color: 'rgba(148,163,184,0.15)' },
          ticks: {
            color:         '#64748b',
            font:          { size: 10, family: 'Inter, sans-serif' },
            callback:      (v) => fmt(Math.round(v) * 1000),
            stepSize:      600,
          },
          title: { display: true, text: 'czas treningu', color: '#475569', font: { size: 10 } },
        },
        y: {
          beginAtZero: true,
          grid:  { color: 'rgba(148,163,184,0.07)' },
          border: { color: 'rgba(148,163,184,0.15)' },
          ticks: {
            color:         '#64748b',
            font:          { size: 10, family: 'Inter, sans-serif' },
            callback:      (v) => fmt(Math.round(v)),
            maxTicksLimit: 5,
          },
        },
      },
    },
  });
}

function _renderRadar(stats) {
  const canvas = document.getElementById('radar-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  // Values in minutes for chart axis
  const data   = stats.map((s) => parseFloat((s.total / 60000).toFixed(4)));
  const labels = stats.map((s) => s.abbr);

  if (radarChart) {
    radarChart.data.labels                    = labels;
    radarChart.data.datasets[0].data          = data;
    radarChart.update('none');
    return;
  }

  radarChart = new Chart(canvas, {
    type: 'radar',
    data: {
      labels,
      datasets: [
        {
          label: 'Czas (min)',
          data,
          backgroundColor: 'rgba(99, 102, 241, 0.15)',
          borderColor: '#6366f1',
          borderWidth: 2,
          pointBackgroundColor: stats.map((s) => s.color),
          pointBorderColor: '#1e293b',
          pointHoverBackgroundColor: '#818cf8',
          pointRadius: 5,
          pointHoverRadius: 7,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          borderColor: '#334155',
          borderWidth: 1,
          titleColor: '#94a3b8',
          bodyColor: '#f1f5f9',
          callbacks: {
            title: (items) => {
              const idx = items[0].dataIndex;
              return stats[idx].label;
            },
            label: (ctx) => `  ${fmt(Math.round(ctx.raw * 60000))}`,
          },
        },
      },
      scales: {
        r: {
          beginAtZero: true,
          grid:        { color: 'rgba(148, 163, 184, 0.1)' },
          angleLines:  { color: 'rgba(148, 163, 184, 0.15)' },
          pointLabels: {
            color: (ctx) => stats[ctx.index]?.color ?? '#94a3b8',
            font:  { size: 12, family: 'Inter, sans-serif', weight: '700' },
          },
          ticks: {
            color: '#475569',
            backdropColor: 'transparent',
            font: { size: 9 },
          },
        },
      },
    },
  });
}

function _initDialog(stats, grandTotal) {
  const dialog   = document.getElementById('category-dialog');
  const tbody    = document.getElementById('stats-tbody');
  if (!dialog || !tbody) return;

  // Wire close button (replace to avoid duplicate listeners on re-renders)
  const closeBtn = document.getElementById('dialog-close');
  const newClose = closeBtn.cloneNode(true);
  closeBtn.replaceWith(newClose);
  newClose.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  // Row click → open dialog (replace tbody to remove old listeners)
  const newTbody = tbody.cloneNode(true);
  tbody.replaceWith(newTbody);
  newTbody.addEventListener('click', (e) => {
    const row = e.target.closest('[data-detail-id]');
    if (!row) return;
    const s = stats.find((x) => x.id === row.dataset.detailId);
    if (!s) return;
    _openDetailDialog(s, grandTotal);
  });
}

function _openDetailDialog(s, grandTotal) {
  const dialog = document.getElementById('category-dialog');
  if (!dialog) return;

  const pct = grandTotal > 0 ? Math.round((s.total / grandTotal) * 100) : 0;
  const avg = s.count > 0 ? Math.round(s.total / s.count) : null;

  document.getElementById('dialog-color-dot').style.background = s.color;
  document.getElementById('dialog-title').textContent           = s.label;
  document.getElementById('dialog-pct').textContent             = `${pct}%`;
  document.getElementById('dialog-total').textContent           = fmt(s.total);
  document.getElementById('dialog-count').textContent           = String(s.count);
  document.getElementById('dialog-max').textContent             = s.max !== null ? fmt(s.max) : '—';
  document.getElementById('dialog-min').textContent             = s.min !== null ? fmt(s.min) : '—';
  document.getElementById('dialog-avg').textContent             = avg !== null ? fmt(avg) : '—';

  _renderDetailScatter(s);
  dialog.showModal();
}

function _renderDetailScatter(s) {
  const canvas = document.getElementById('dialog-scatter-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  if (detailChart) { detailChart.destroy(); detailChart = null; }

  const t0       = history.length > 0 ? Math.min(...history.map((e) => e.startedAt)) : 0;
  const segments = history
    .filter((e) => e.id === s.id)
    .sort((a, b) => a.startedAt - b.startedAt);

  const points = segments.map((seg) => ({
    x: Math.round((seg.startedAt - t0) / 1000),
    y: seg.duration,
  }));

  detailChart = new Chart(canvas, {
    type: 'scatter',
    data: {
      datasets: [{
        label:            s.label,
        data:             points,
        backgroundColor:  s.color + 'cc',
        borderColor:      s.color,
        borderWidth:      1.5,
        pointRadius:      6,
        pointHoverRadius: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          borderColor:     s.color,
          borderWidth:     1,
          titleColor:      '#94a3b8',
          bodyColor:       '#f1f5f9',
          padding:         10,
          callbacks: {
            title: (items) => `@ ${fmt(items[0].parsed.x * 1000)}`,
            label: (ctx)   => `  czas: ${fmt(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          type:   'linear',
          grid:   { color: 'rgba(148,163,184,0.07)' },
          border: { color: 'rgba(148,163,184,0.15)' },
          ticks: {
            color:         '#64748b',
            font:          { size: 9, family: 'Inter, sans-serif' },
            callback:      (v) => fmt(Math.round(v) * 1000),
            maxTicksLimit: 6,
          },
          title: { display: true, text: 'start odcinka', color: '#475569', font: { size: 9 } },
        },
        y: {
          beginAtZero: true,
          grid:   { color: 'rgba(148,163,184,0.07)' },
          border: { color: 'rgba(148,163,184,0.15)' },
          ticks: {
            color:         '#64748b',
            font:          { size: 9, family: 'Inter, sans-serif' },
            callback:      (v) => fmt(Math.round(v)),
            maxTicksLimit: 4,
          },
          title: { display: true, text: 'czas trwania', color: '#475569', font: { size: 9 } },
        },
      },
    },
  });
}
