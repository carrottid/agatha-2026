/* =====================================================================
   뮤지컬 〈아가사〉 정산판 — 동작
   ===================================================================== */
(function () {
  'use strict';

  const STORAGE_KEY = 'agatha2026-settlement-v1';
  const FILTER_KEY = 'agatha2026-filter-v1';   // 배우 필터 선택 (좌석 기록과 따로 저장)
  const SHOWS = SCHEDULE.filter(r => !r.off);
  const ROLE_IDX = Object.fromEntries(ROLES.map((r, i) => [r.key, i]));
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* 배우별 첫 출연 회차 (첫공 뱃지 자동) */
  const FIRST_OF = {};
  SHOWS.forEach(s => s.cast.forEach((a, i) => { const k = ROLES[i].key + ':' + a; if (!(k in FIRST_OF)) FIRST_OF[k] = s.id; }));

  /* ---------------- 상태 ---------------- */
  let state = { version: 1, seats: {}, updatedAt: null };
  const selected = new Set();          // 'roleKey:actor'
  const missingImg = new Set();        // 없는 사진 경로 (재요청 방지)

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') {
          state.seats = cleanSeats((obj.seats && typeof obj.seats === 'object') ? obj.seats : {});
          state.updatedAt = obj.updatedAt || null;
        }
      }
    } catch (e) { /* 저장소 사용 불가 — 메모리로만 동작 */ }
  }
  /* 배우 필터 선택: 다음 방문에도 유지. 캐스팅 변경으로 사라진 배우는 버린다 */
  function loadFilter() {
    try {
      const arr = JSON.parse(localStorage.getItem(FILTER_KEY) || '[]');
      if (!Array.isArray(arr)) return;
      const valid = new Set();
      ROLES.forEach(r => r.actors.forEach(a => valid.add(r.key + ':' + a)));
      arr.forEach(k => { if (typeof k === 'string' && valid.has(k)) selected.add(k); });
    } catch (e) { /* 저장소 사용 불가 또는 손상된 값 — 전체 보기로 시작 */ }
  }
  function saveFilter() {
    try {
      if (selected.size) localStorage.setItem(FILTER_KEY, JSON.stringify(Array.from(selected)));
      else localStorage.removeItem(FILTER_KEY);
    } catch (e) { /* 저장소 사용 불가 — 이번 방문에만 적용 */ }
  }
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      state.updatedAt = new Date().toISOString();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        const t = new Date();
        $('#save-state').textContent = '저장됨 ' + t.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } catch (e) {
        $('#save-state').textContent = '이 브라우저에는 저장할 수 없습니다 — JSON 저장을 이용하세요';
      }
    }, 250);
  }

  /* ---------------- 좌석 코드 ---------------- */
  // 1F-B-9-8 / 1f b 9 8 / 1층 B구역 9열 8번 / 2F-C-15-9 등 허용
  const SEAT_RE = /^\s*([12])\s*(?:F|층)?\s*[-\s/·.]*\s*(A|B|C)\s*(?:구역)?\s*[-\s/·.]*\s*(\d{1,2})\s*(?:열)?\s*[-\s/·.]*\s*(\d{1,2})\s*(?:번)?\s*$/i;
  function parseSeat(str) {
    if (!str) return null;
    const m = SEAT_RE.exec(str);
    if (!m) return null;
    const floor = m[1] + 'F', sec = m[2].toUpperCase(), row = +m[3], num = +m[4];
    const fl = SEATMAP[floor];
    const section = fl && fl.sections[sec];
    if (!section) return null;
    const r = section.rows[row - fl.rowFrom];
    if (!r || r.n === 0 || num < r.from || num >= r.from + r.n) return null;
    return { floor, sec, row, num, key: `${floor}-${sec}-${row}-${num}` };
  }

  /* ---------------- 집계 ---------------- */
  const NO_SEAT = '0000';   // 좌석 미기재: 관람으로 집계되지만 좌석배치도에는 표시하지 않음
  function normalizeSeat(str) {
    const v = (str || '').trim();
    if (!v) return '';
    if (v === NO_SEAT) return NO_SEAT;
    const p = parseSeat(v);
    return p ? p.key : null;          // null = 형식이 틀리거나 없는 좌석
  }
  function attended(id) { const n = normalizeSeat(state.seats[id]); return n != null && n !== ''; }
  function cleanSeats(seats) {        // 저장/불러오기 시 유효하지 않은 값 제거
    const out = {};
    Object.entries(seats || {}).forEach(([k, v]) => { const n = normalizeSeat(v); if (n) out[k] = n; });
    return out;
  }

  function computeStats() {
    const perActor = {};   // 'roleKey:actor' -> {total, seen}
    ROLES.forEach(r => r.actors.forEach(a => { perActor[r.key + ':' + a] = { total: 0, seen: 0 }; }));
    const seatCounts = {};
    let totalSeen = 0;
    for (const s of SHOWS) {
      const seen = attended(s.id);
      if (seen) totalSeen++;
      s.cast.forEach((a, i) => {
        const k = ROLES[i].key + ':' + a;
        if (!perActor[k]) perActor[k] = { total: 0, seen: 0 };
        perActor[k].total++; if (seen) perActor[k].seen++;
      });
      if (seen) {
        const p = parseSeat(state.seats[s.id]);
        if (p) seatCounts[p.key] = (seatCounts[p.key] || 0) + 1;
      }
    }
    const maxCount = Math.max(0, ...Object.values(seatCounts));
    return { perActor, seatCounts, maxCount, totalSeen, totalAll: SHOWS.length };
  }

  /* ---------------- 색 보간 (흰색 → 호박색) ---------------- */
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  const SEAT_MAX = hexToRgb('#d9983a');
  function seatColor(count, max) {
    if (count <= 1 || max <= 1) return '#ffffff';
    const t = (count - 1) / (max - 1);            // 0 = 흰색, 1 = 호박색
    const c = [255, 255, 255].map((w, i) => Math.round(w + (SEAT_MAX[i] - w) * t));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  }

  /* ---------------- 필터 UI ---------------- */
  function renderFilter() {
    const box = $('#filter-groups');
    let html = '';
    ROLES.forEach(r => {
      html += `<div class="filter-group"><span class="filter-role">${esc(r.name)}</span><div class="filter-chips">`;
      r.actors.forEach(a => {
        const k = r.key + ':' + a;
        html += `<button type="button" class="chip${selected.has(k) ? ' on' : ''}" data-k="${esc(k)}">${esc(a)}</button>`;
      });
      html += '</div></div>';
    });
    html += `<div class="filter-group"><span class="filter-role"></span><div class="filter-chips"><button type="button" class="chip all${selected.size ? '' : ' on'}" data-k="__all">전체 보기</button></div></div>`;
    box.innerHTML = html;
  }

  function visibleRows() {
    if (!selected.size) return SCHEDULE.slice();
    const byRole = {};
    selected.forEach(k => { const [rk, a] = k.split(':'); (byRole[rk] = byRole[rk] || new Set()).add(a); });
    return SCHEDULE.filter(r => !r.off && Object.entries(byRole).every(([rk, set]) => set.has(r.cast[ROLE_IDX[rk]])));
  }

  function renderSummary(stats) {
    const el = $('#filter-summary');
    if (!selected.size) {
      el.innerHTML = `전체 <b>${stats.totalAll}</b>회 중 <b>${stats.totalSeen}</b>회 관람`;
      return;
    }
    const byRole = {};
    selected.forEach(k => { const [rk, a] = k.split(':'); (byRole[rk] = byRole[rk] || []).push(a); });
    const parts = ROLES.filter(r => byRole[r.key]).map(r => byRole[r.key].join(' / '));
    const rows = visibleRows();
    const seen = rows.filter(r => attended(r.id)).length;
    el.innerHTML = `<span class="pair"><b>${parts.map(esc).join(' × ')}</b></span> — 해당 회차 <b>${rows.length}</b>회 중 <b>${seen}</b>회 관람`;
  }

  /* ---------------- 스케줄표 ---------------- */
  const ORDER = Object.fromEntries(SCHEDULE.map((r, i) => [r.id, i]));
  function bandOf(col, id) {
    const i = ORDER[id];
    return BANDS.find(b => b.col === col && i >= ORDER[b.from] && i <= ORDER[b.to]) || null;
  }
  function badgeFor(r, i, a) {
    const isFirst = r.first ? r.first.includes(i) : FIRST_OF[ROLES[i].key + ':' + a] === r.id;
    if (isFirst) return '<span class="badge first">첫공</span>';
    if (r.last && r.last.includes(i)) return '<span class="badge last">막공</span>';
    return '';
  }

  function renderSchedule() {
    const rows = visibleRows();
    // 밴드 셀 계획: rowspan 계산
    const plan = rows.map(() => [null, null]);
    for (const col of [0, 1]) {
      let i = 0;
      while (i < rows.length) {
        const b = bandOf(col, rows[i].id);
        if (!b) { plan[i][col] = { empty: true }; i++; continue; }
        let j = i;
        while (j < rows.length && bandOf(col, rows[j].id) === b) j++;
        plan[i][col] = { band: b, span: j - i };
        for (let k = i + 1; k < j; k++) plan[k][col] = { skip: true };
        i = j;
      }
    }
    const bandCell = p => {
      if (p.skip) return '';
      if (p.empty) return '<td class="band"></td>';
      const label = p.span >= 3 ? esc(p.band.label) : '';
      return `<td class="band" rowspan="${p.span}"><div class="band-in" style="background:${p.band.color}" title="${esc(p.band.label)}"><span>${label}</span></div></td>`;
    };

    let html = '<thead><tr><th class="band"></th><th class="band"></th><th class="date">일정</th><th class="seat seat-m">좌석</th>';
    ROLES.forEach(r => { html += `<th class="cast ${r.main ? 'main' : 'sub'}">${esc(r.name)}</th>`; });
    html += '<th class="seat seat-d">좌석</th><th class="tags"></th></tr></thead><tbody>';

    rows.forEach((r, idx) => {
      const p = plan[idx];
      if (r.off) {
        html += `<tr class="off">${bandCell(p[0])}${bandCell(p[1])}<td class="cell date"><div class="dt"><span class="d">${esc(r.d)}</span><span class="w">${esc(r.w)}</span></div></td><td class="cell seat seat-m"></td><td class="cell offcell" colspan="${ROLES.length}">공연없음</td><td class="cell seat seat-d"></td><td class="tags"></td></tr>`;
        return;
      }
      const seen = attended(r.id);
      const dcls = r.mat ? 'mat' : (r.hol || r.w === '일') ? 'sun' : r.w === '토' ? 'sat' : '';
      html += `<tr data-id="${r.id}" class="${seen ? 'seen' : ''}">${bandCell(p[0])}${bandCell(p[1])}`;
      const val = state.seats[r.id] || '';
      const cls = val.trim() ? (normalizeSeat(val) ? 'filled' : 'invalid') : '';
      const tagsHtml = (r.tags || []).map(t => `<span class="tag" style="background:${TAGS[t].color}">${esc(TAGS[t].label)}</span>`).join('');
      const seatInput = `<input class="seat-input${cls ? ' ' + cls : ''}" data-id="${r.id}" value="${esc(val)}" placeholder="1F-B-5-8" autocomplete="off" spellcheck="false">`;
      html += `<td class="cell date ${dcls}"><div class="dt"><span class="d">${esc(r.d)}</span><span class="w">${esc(r.w)}</span><span class="t">${esc(r.t)}</span></div>${tagsHtml ? `<div class="d-tags">${tagsHtml}</div>` : ''}</td>`;
      html += `<td class="cell seat seat-m">${seatInput}</td>`;
      r.cast.forEach((a, i) => {
        const role = ROLES[i];
        const hit = selected.has(role.key + ':' + a);
        const badge = badgeFor(r, i, a);
        html += `<td class="cell cast ${role.main ? 'main' : 'sub'}${hit ? ' hit' : ''}"><span class="nm">${esc(a)}${badge}</span></td>`;
      });
      html += `<td class="cell seat seat-d">${seatInput}</td>`;
      html += `<td class="tags">${tagsHtml}</td>`;
      html += '</tr>';
    });
    html += '</tbody>';
    $('#sched').innerHTML = html;
  }

  /* ---------------- 사진 슬롯 ---------------- */
  function photo(src, name) {
    if (missingImg.has(src)) return `<div class="p-photo"><span class="ph">${esc(name)}</span></div>`;
    return `<div class="p-photo"><img src="${src}" alt="" data-src="${src}"><span class="ph">${esc(name)}</span></div>`;
  }
  function bindPhotos(root) {
    $$('.p-photo img', root).forEach(img => {
      const mark = () => { img.parentElement.classList.add('has-img'); };
      if (img.complete && img.naturalWidth > 0) mark();
      else {
        img.addEventListener('load', mark);
        img.addEventListener('error', () => { missingImg.add(img.dataset.src); img.remove(); });
      }
    });
  }
  const countHtml = (seen, total) => `<div class="p-count"><span class="seen${seen ? '' : ' zero'}">${seen}</span><span class="of">/ ${total}</span></div>`;

  /* ---------------- 좌석배치도 SVG ---------------- */
  function seatmapSvg(stats) {
    const LABELS = !!(typeof SHOW !== 'undefined' && SHOW.seatLabels);   // 글자(STAGE·구역·열 번호) 표시 여부
    const S = 13, P = 15.5, SEC_GAP = 22, LBL = LABELS ? 28 : 2, RLBL = LABELS ? 34 : 2;
    const emptyFill = '#3a1512', emptyStroke = '#5e2b26';
    let out = '';
    const drawSection = (floor, secKey, sec, x0, y0, rowFrom) => {
      sec.rows.forEach((row, ri) => {
        if (row.foh || !row.n) return;
        const rowNo = rowFrom + ri;
        let x = x0 + (row.from - sec.first) * P;
        for (let k = 0; k < row.n; k++) {
          const num = row.from + k;
          const key = `${floor}-${secKey}-${rowNo}-${num}`;
          const c = stats.seatCounts[key];
          const fill = c ? seatColor(c, stats.maxCount) : emptyFill;
          const stroke = c ? 'rgba(0,0,0,.35)' : emptyStroke;
          out += `<rect x="${x.toFixed(1)}" y="${(y0 + ri * P).toFixed(1)}" width="${S}" height="${S}" rx="2" fill="${fill}" stroke="${stroke}" stroke-width=".8"/>`;
          x += P;
          if (row.gapAfter && row.gapAfter.includes(num)) x += P / 2;
        }
      });
      return sec.rows.length * P;
    };
    const rowLabels = (fl, y0) => {
      if (!LABELS) return;
      fl.sections.B.rows.forEach((row, ri) => {
        out += `<text class="rowlbl" x="${xRight + 6}" y="${(y0 + ri * P + S - 2.5).toFixed(1)}" font-size="8.5">${fl.rowFrom + ri}열</text>`;
      });
    };
    const f1 = SEATMAP['1F'], f2 = SEATMAP['2F'];
    const wA = f1.sections.A.cols * P, wB = f1.sections.B.cols * P, wC = f1.sections.C.cols * P;
    const xA = LBL, xB = xA + wA + SEC_GAP, xC = xB + wB + SEC_GAP;
    const xRight = xC + wC;
    const W = xRight + RLBL;
    // STAGE
    let y = 0;
    out += `<rect class="stage" x="${xA}" y="${y}" width="${xRight - xA}" height="22" rx="2"/>`;
    if (LABELS) out += `<text class="stage-t" x="${(xA + xRight) / 2}" y="${y + 15.5}" font-size="10.5" text-anchor="middle">STAGE</text>`;
    y += LABELS ? 44 : 34;
    // 1F
    if (LABELS) {
      out += `<text class="lbl" x="${LBL - 9}" y="${y + 10}" font-size="11" text-anchor="end">${esc(f1.label)}</text>`;
      ['A', 'B', 'C'].forEach((k, i) => {
        const x = [xA, xB, xC][i], w = [wA, wB, wC][i];
        out += `<text class="lbl" x="${x + w / 2}" y="${y - 6}" font-size="9" text-anchor="middle">${k}</text>`;
      });
    }
    const h1 = Math.max(...['A', 'B', 'C'].map((k, i) => drawSection('1F', k, f1.sections[k], [xA, xB, xC][i], y, f1.rowFrom)));
    rowLabels(f1, y);
    y += h1 + 8;
    // 복도
    out += `<rect class="aisle" x="${xA}" y="${y}" width="${xRight - xA}" height="12" rx="2"/>`;
    if (LABELS) out += `<text class="aisle-t" x="${(xA + xRight) / 2}" y="${y + 9}" font-size="7.5" text-anchor="middle" letter-spacing="2">복도</text>`;
    y += 26;
    // 2F
    if (LABELS) out += `<text class="lbl" x="${LBL - 9}" y="${y + 10}" font-size="11" text-anchor="end">${esc(f2.label)}</text>`;
    const h2 = Math.max(...['A', 'B', 'C'].map((k, i) => drawSection('2F', k, f2.sections[k], [xA, xB, xC][i], y, f2.rowFrom)));
    // 컨트롤룸 (F.O.H)
    const fohRows = f2.sections.B.rows.map((r, i) => r.foh ? i : -1).filter(i => i >= 0);
    if (fohRows.length) {
      const fy = y + fohRows[0] * P, fh = fohRows.length * P - (P - S);
      out += `<rect class="foh" x="${xB}" y="${fy}" width="${wB - (P - S)}" height="${fh}" rx="3"/>`;
      if (LABELS) out += `<text class="foh-t" x="${xB + (wB - (P - S)) / 2}" y="${fy + fh / 2 + 3.5}" font-size="9" text-anchor="middle">F.O.H</text>`;
    }
    rowLabels(f2, y);
    y += h2 + 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${y}" width="${W}" height="${y}">${out}</svg>`;
  }

  function legendHtml(stats) {
    const max = stats.maxCount;
    if (max < 1) return '<span><span class="sw" style="background:#fff"></span>1회</span>';
    if (max <= 7) {
      let h = '';
      for (let c = 1; c <= Math.max(max, 2); c++) h += `<span><span class="sw" style="background:${seatColor(c, Math.max(max, 2))}"></span>${c}회</span>`;
      return h;
    }
    return `<span>1회<span class="bar" style="background:linear-gradient(to right,#ffffff,${seatColor(max, max)})"></span>${max}회</span>`;
  }

  /* ---------------- 정산판 (가로형) ---------------- */
  function renderPosterA(stats) {
    const actorHtml = (r, a, i) => {
      const st = stats.perActor[r.key + ':' + a];
      return `<div class="p-actor">${photo(`images/cast/${r.key}-${i + 1}.jpg?v=2`, a)}<div class="p-name">${esc(a)}</div>${countHtml(st.seen, st.total)}</div>`;
    };
    const title = r => `<div class="p-group-title"><span class="ttl">${esc(r.name)}</span></div>`;
    const group = r => `<div class="p-group">${title(r)}<div class="p-row">${r.actors.map((a, i) => actorHtml(r, a, i)).join('')}</div></div>`;
    const mains = ROLES.filter(r => r.main), subs = ROLES.filter(r => !r.main);
    const mainEl = $('#posterA-main'), subEl = $('#posterA-subs');
    mainEl.innerHTML = mains.map(group).join('');   // 1줄: 주역 (사진 크게)
    subEl.innerHTML = subs.map(group).join('');     // 2줄 가운데: 조연 (사진 작게)
    bindPhotos(mainEl);
    bindPhotos(subEl);
  }

  function renderPosters() {
    const stats = computeStats();
    renderPosterA(stats);
    $$('[data-total-seen]').forEach(el => { el.textContent = stats.totalSeen; });
    $$('[data-total-all]').forEach(el => { el.textContent = stats.totalAll; });
    const svg = seatmapSvg(stats), legend = legendHtml(stats);
    $$('[data-seatmap]').forEach(el => { el.innerHTML = svg; });
    $$('[data-legend]').forEach(el => { el.innerHTML = legend; });
    renderSummary(stats);
    fitPosters();
  }

  function fitPosters() {
    $$('.poster-viewport').forEach(vp => {
      const poster = $('.poster', vp);
      const w = +vp.dataset.w;
      vp.style.width = '';                                   // 사용 가능한 폭을 먼저 재고
      const scale = Math.min(1, vp.clientWidth / w);
      poster.style.transform = `scale(${scale})`;
      vp.style.width = Math.round(w * scale) + 'px';         // 축소된 정산판 폭에 맞춰 가운데 정렬 (margin: 0 auto)
      vp.style.height = Math.ceil(poster.offsetHeight * scale) + 'px';
    });
  }

  /* ---------------- PNG 저장 ----------------
     html2canvas는 글꼴의 기준선(baseline)을 자체 프로브로 측정하는데, 한글 세리프 폰트에서
     실제보다 크게 나와 모든 글자가 약 1/3em 아래로 그려진다. 내보내기 직전에 요소별로
     (html2canvas가 쓸 기준선 − 브라우저의 실제 기준선)만큼 글자를 위로 올려 보정한다. */
  const H2C_SMALL_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const probeCache = new Map();
  function h2cBaseline(fontFamily, fontSize) {
    const key = fontFamily + '|' + fontSize;
    if (probeCache.has(key)) return probeCache.get(key);
    const c = document.createElement('div'), img = document.createElement('img'), span = document.createElement('span');
    c.style.cssText = 'visibility:hidden;margin:0;padding:0;white-space:nowrap;position:absolute;top:0;left:-9999px';
    c.style.fontFamily = fontFamily; c.style.fontSize = fontSize;
    document.body.appendChild(c);
    img.src = H2C_SMALL_IMAGE; img.width = 1; img.height = 1;
    img.style.cssText = 'margin:0;padding:0;vertical-align:baseline';
    span.style.cssText = 'margin:0;padding:0';
    span.style.fontFamily = fontFamily; span.style.fontSize = fontSize;
    span.appendChild(document.createTextNode('Hidden Text'));
    c.appendChild(span); c.appendChild(img);
    const baseline = img.offsetTop - span.offsetTop + 2;
    c.remove();
    probeCache.set(key, baseline);
    return baseline;
  }
  const measureCtx = document.createElement('canvas').getContext('2d');
  function compensateText(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => n.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
    nodes.forEach(node => {
      const el = node.parentElement;
      if (!el) return;
      if (el.namespaceURI !== 'http://www.w3.org/1999/xhtml') return;   // SVG 텍스트(좌석배치도 라벨)는 건드리지 않음
      const cs = getComputedStyle(el);
      measureCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const m = measureCtx.measureText(node.textContent);
      const asc = m.fontBoundingBoxAscent, desc = m.fontBoundingBoxDescent;
      if (!asc) return;
      const natural = asc + desc;
      const lh = cs.lineHeight === 'normal' ? natural : parseFloat(cs.lineHeight);
      const browserBaseline = (lh - natural) / 2 + asc;          // 브라우저가 그리는 기준선
      const canvasBaseline = h2cBaseline(cs.fontFamily, cs.fontSize);  // html2canvas가 쓸 기준선
      const shift = canvasBaseline - browserBaseline;
      if (Math.abs(shift) < 0.5) return;
      const wrap = document.createElement('span');
      wrap.style.cssText = `position:relative;top:${(-shift).toFixed(2)}px`;
      node.parentNode.replaceChild(wrap, node);
      wrap.appendChild(node);
    });
  }

  async function exportPoster(id, name, btn) {
    const src = document.getElementById(id);
    btn.disabled = true; const label = btn.textContent; btn.textContent = '생성 중…';
    const holder = document.createElement('div');
    holder.style.cssText = `position:absolute;left:-100000px;top:0;width:${src.offsetWidth}px;`;
    const clone = src.cloneNode(true);
    clone.style.transform = 'none';
    clone.classList.add('exporting');
    holder.appendChild(clone);
    document.body.appendChild(holder);
    compensateText(clone);
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const canvas = await html2canvas(clone, {
        scale: 2, backgroundColor: '#2a0504', useCORS: true, logging: false,
        width: src.offsetWidth, height: src.offsetHeight, windowWidth: src.offsetWidth, windowHeight: src.offsetHeight,
      });
      await new Promise(res => canvas.toBlob(blob => { downloadBlob(blob, name + '.png'); res(); }, 'image/png'));
    } catch (e) {
      alert('이미지 생성에 실패했습니다.\n' + (e && e.message ? e.message : e));
    } finally {
      holder.remove();
      btn.disabled = false; btn.textContent = label;
    }
  }
  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /* ---------------- JSON ---------------- */
  function exportJson() {
    const data = { app: 'agatha-2026', version: 1, seats: state.seats, exportedAt: new Date().toISOString() };
    const d = new Date(), ymd = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `아가사-정산-${ymd}.json`);
  }
  /* 지원하는 JSON 형식
     1) 이 사이트의 저장 파일: { seats: { "1209-1930": "1F-B-5-8", ... } }
     2) 회차 목록 배열: [ { sid: "1209-1930", ..., seats: ["1F-A-6-3"] }, ... ]  (seats 배열의 첫 좌석 사용, 비어 있으면 미관람) */
  const KNOWN_IDS = new Set(SHOWS.map(s => s.id));
  function seatsFromAnyJson(obj) {
    if (Array.isArray(obj)) {
      const out = {};
      obj.forEach(item => {
        if (!item || typeof item !== 'object' || !KNOWN_IDS.has(item.sid)) return;
        const list = Array.isArray(item.seats) ? item.seats : (typeof item.seats === 'string' ? [item.seats] : []);
        const first = list.find(v => typeof v === 'string' && v.trim());
        if (first) out[item.sid] = first.trim();
      });
      return out;
    }
    if (obj && typeof obj === 'object' && obj.seats && typeof obj.seats === 'object' && !Array.isArray(obj.seats)) return obj.seats;
    return null;
  }
  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        const raw = seatsFromAnyJson(obj);
        if (!raw) throw new Error('형식이 맞지 않습니다');
        const cleaned = cleanSeats(raw);
        const n = Object.keys(cleaned).length;
        if (!confirm(`불러온 데이터(관람 ${n}회)로 현재 기록을 덮어씁니다. 계속할까요?`)) return;
        state.seats = cleaned;
        save(); renderSchedule(); renderPosters();
      } catch (e) { alert('JSON을 읽을 수 없습니다: ' + e.message); }
    };
    reader.readAsText(file);
  }

  /* ---------------- 안내 토스트 ---------------- */
  let toastTimer = null;
  function toast(msg) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.innerHTML = msg; el.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 3200);
  }

  /* ---------------- 이벤트 ---------------- */
  function bind() {
    $('#filter-groups').addEventListener('click', e => {
      const btn = e.target.closest('.chip'); if (!btn) return;
      const k = btn.dataset.k;
      if (k === '__all') selected.clear();
      else if (selected.has(k)) selected.delete(k); else selected.add(k);
      saveFilter();
      renderFilter(); renderSchedule(); renderSummary(computeStats());
    });

    const table = $('#sched');
    table.addEventListener('input', e => {
      const inp = e.target.closest('.seat-input'); if (!inp) return;
      const id = inp.dataset.id, v = inp.value;
      if (v.trim()) state.seats[id] = v; else delete state.seats[id];
      const ok = !!normalizeSeat(v);
      const tr = inp.closest('tr');
      tr.classList.toggle('seen', ok);
      $$('.seat-input', tr).forEach(el => {
        if (el !== inp) el.value = v;
        el.classList.toggle('filled', ok);
        el.classList.toggle('invalid', !!v.trim() && !ok);
      });
      save();
      clearTimeout(bind._t); bind._t = setTimeout(renderPosters, 200);
    });
    table.addEventListener('change', e => {
      const inp = e.target.closest('.seat-input'); if (!inp) return;
      const tr = inp.closest('tr'), id = inp.dataset.id;
      const n = normalizeSeat(inp.value);
      if (n) {                                   // 유효한 좌석 또는 0000 → 정리해서 저장
        $$('.seat-input', tr).forEach(el => { el.value = n; el.classList.add('filled'); el.classList.remove('invalid'); });
        state.seats[id] = n; tr.classList.add('seen'); save();
      } else if (n === null) {                   // 형식이 틀리거나 없는 좌석 → 삭제
        $$('.seat-input', tr).forEach(el => { el.value = ''; el.classList.remove('filled', 'invalid'); });
        delete state.seats[id]; tr.classList.remove('seen'); save();
        toast('잘못된 형식이거나 없는 좌석입니다. <br class="m">다시 입력해 주십시오.');
      }
      clearTimeout(bind._t); bind._t = setTimeout(renderPosters, 100);
    });
    table.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || !e.target.classList.contains('seat-input')) return;
      const inputs = $$('.seat-input', table).filter(el => el.offsetParent !== null); const i = inputs.indexOf(e.target);
      if (i >= 0 && inputs[i + 1]) { e.preventDefault(); inputs[i + 1].focus(); inputs[i + 1].select(); }
    });

    $('#btn-export').addEventListener('click', exportJson);
    $('#btn-import').addEventListener('click', () => $('#file-import').click());
    $('#file-import').addEventListener('change', e => { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value = ''; });
    $('#btn-reset').addEventListener('click', () => {
      if (!confirm('모든 좌석 기록을 지웁니다. 계속할까요?')) return;
      state.seats = {}; save(); renderSchedule(); renderPosters();
    });
    $$('.poster-toolbar .dl').forEach(btn => btn.addEventListener('click', () => exportPoster(btn.dataset.target, btn.dataset.name, btn)));

    let rt = null;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(fitPosters, 80); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitPosters);
    window.addEventListener('load', fitPosters);
  }

  /* ---------------- 시작 ---------------- */
  load();
  loadFilter();
  renderFilter();
  renderSchedule();
  renderPosters();
  bind();
})();
