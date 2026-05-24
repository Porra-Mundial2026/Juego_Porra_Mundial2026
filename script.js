'use strict';
/* ======================================================
   WORLD CUP 2026 • APPLE EDITION • PRO ENGINE 2.1
   Optimizado para Android Mobile - Versión Corregida
====================================================== */

const CONFIG = {
  API_KEY: '6a2a522096e243a4afec1a2de793e623',
  API_URL: 'https://api.football-data.org/v4/competitions/WC/matches',
  DATA_URL: './data/matches.json',
  CACHE_KEY: 'f_cache_matches',
  CACHE_TTL: 15 * 60 * 1000,
  LOCK_MINUTES_BEFORE: 15,
  MAX_RETRY: 2,
  DEBOUNCE_MS: 400,
  GROUPS: ['A','B','C','D','E','F','G','H','I','J','K','L'],
  TIMEZONES: { 'Canada': 'America/Toronto', 'Mexico': 'America/Mexico_City', 'United States': 'America/New_York', 'USA': 'America/New_York' }
};

const State = {
  fixture: [],
  usuarios: JSON.parse(localStorage.getItem('f_usuarios')) || [],
  porras: JSON.parse(localStorage.getItem('f_porras')) || {},
  grupoActivo: 'A',
  filtroActivo: 'grupo',
  isOnline: navigator.onLine,
  isLoading: false
};

const debounce = (fn, ms = CONFIG.DEBOUNCE_MS) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), ms);
  };
};

const escapeHTML = (str) => {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
};

const haptic = (pattern = 10) => { if ('vibrate' in navigator) { try { navigator.vibrate(pattern); } catch {} } };

const dateFormatters = new Map();
const getFormatter = (locale, options) => {
  const key = `${locale}_${JSON.stringify(options)}`;
  if (!dateFormatters.has(key)) dateFormatters.set(key, new Intl.DateTimeFormat(locale, options));
  return dateFormatters.get(key);
};

const Toast = {
  container: null,
  init() { this.container = document.getElementById('toast-container'); },
  show(message, type = 'info', duration = 3000) {
    if (!this.container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<div class="toast-icon" aria-hidden="true">${this.getIcon(type)}</div><span>${escapeHTML(message)}</span>`;
    this.container.appendChild(toast);
    setTimeout(() => { toast.classList.add('toast-exit'); setTimeout(() => toast.remove(), 300); }, duration);
    haptic(type === 'error' ? [30, 50, 30] : 10);
  },
  getIcon(type) { return { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' }[type] || 'ℹ'; },
  success(msg) { this.show(msg, 'success'); }, error(msg) { this.show(msg, 'error', 4000); },
  warning(msg) { this.show(msg, 'warning', 3500); }, info(msg) { this.show(msg, 'info'); }
};

const Modal = {
  show(id) { const m = document.getElementById(id); if (!m) return; m.hidden = false; document.body.style.overflow = 'hidden'; m.querySelector('input, button')?.focus(); },
  hide(id) { const m = document.getElementById(id); if (!m) return; m.hidden = true; document.body.style.overflow = ''; },
  confirm(message, onConfirm, title = '¿Estás seguro?') {
    const modal = document.getElementById('modal-confirm'); if (!modal) { if (confirm(message)) onConfirm(); return; }
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    const ok = document.getElementById('confirm-ok'), cancel = document.getElementById('confirm-cancel');
    const cleanup = () => { ok.onclick = null; cancel.onclick = null; this.hide('modal-confirm'); };
    ok.onclick = () => { cleanup(); onConfirm(); }; cancel.onclick = () => cleanup();
    this.show('modal-confirm');
  }
};

const obtenerBandera = (code) => !code ? 'https://flagcdn.com/w160/un.png' : `https://flagcdn.com/w160/${code.toLowerCase()}.png`;

const Clock = {
  interval: null,
  getTime(tz) { try { return getFormatter('es-ES', { hour:'2-digit', minute:'2-digit', second:'2-digit', timeZone: tz || 'Europe/Madrid' }).format(new Date()); } catch { return '--:--'; } },
  start() { this.update(); this.interval = setInterval(() => this.update(), 1000); },
  update() { document.querySelectorAll('.live-clock').forEach(c => { c.textContent = `🕒 ${this.getTime(c.dataset.timezone)}`; }); }
};

const API = {
  async fetchWithRetry(url, options = {}, retries = CONFIG.MAX_RETRY) {
    for (let i = 0; i <= retries; i++) {
      try { const r = await fetch(url, options); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r; } 
      catch (e) { if (i === retries) throw e; await new Promise(r => setTimeout(r, 1000 * (i + 1))); }
    }
  },
  getCache() {
    try { const c = JSON.parse(localStorage.getItem(CONFIG.CACHE_KEY) || '{}'); if (Date.now() - c.timestamp > CONFIG.CACHE_TTL) return null; return c.data; } catch { return null; }
  },
  setCache(data) { try { localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() })); } catch {} },
  async getMatches() {
    const c = this.getCache(); if (c) return c;
    try {
      const r = await this.fetchWithRetry(CONFIG.API_URL, { headers: { 'X-Auth-Token': CONFIG.API_KEY } });
      const d = await r.json(); if (d.matches?.length) { const t = this.transformAPI(d.matches); this.setCache(t); return t; }
      throw new Error('API vacía');
    } catch { return await this.getLocalJSON(); }
  },
  async getLocalJSON() {
    try { const r = await fetch(CONFIG.DATA_URL); if (!r.ok) throw new Error('No JSON local'); let d = await r.json(); return Array.isArray(d) ? d : [d]; } 
    catch { Toast.error('Datos offline no disponibles'); return []; }
  },
  transformAPI(matches) {
    return matches.map((m, i) => {
      const h = m.homeTeam || {}, a = m.awayTeam || {}, u = new Date(m.utcDate);
      return {
        id: m.id || i, grupo: this.detectGroup(m, i),
        fecha: getFormatter('es-ES', { day:'2-digit', month:'short', year:'numeric' }).format(u),
        hora: getFormatter('es-ES', { hour:'2-digit', minute:'2-digit' }).format(u),
        estadio: m.venue || 'Estadio', ciudad: m.area?.name || '', timezone: this.detectTimezone(m.area?.name),
        eqA: h.shortName || h.name || 'TBD', eqB: a.shortName || a.name || 'TBD',
        flagA: obtenerBandera(h.tla || h.code), flagB: obtenerBandera(a.tla || a.code),
        esp: h.name === 'Spain' || a.name === 'Spain',
        scoreA: m.status === 'FINISHED' ? m.score?.fullTime?.home : null,
        scoreB: m.status === 'FINISHED' ? m.score?.fullTime?.away : null,
        utcDate: m.utcDate, status: m.status
      };
    });
  },
  detectGroup(m, i) { return m.group?.replace('GROUP_', '') || CONFIG.GROUPS[i % CONFIG.GROUPS.length]; },
  detectTimezone(city) { for (const [k, v] of Object.entries(CONFIG.TIMEZONES)) if (city?.includes(k)) return v; return 'Europe/Madrid'; }
};

const Users = {
  add(n) {
    n = n.trim(); if (!n) return Toast.warning('Escribe un nombre'), false;
    if (n.length > 20) return Toast.warning('Máx. 20 caracteres'), false;
    if (State.usuarios.some(u => u.toLowerCase() === n.toLowerCase())) return Toast.warning('Ya existe'), false;
    State.usuarios.push(n); this.save(); Toast.success(`${n} añadido`); haptic(20); return true;
  },
  remove(n) {
    Modal.confirm(`¿Eliminar a ${n}?`, () => {
      State.usuarios = State.usuarios.filter(u => u !== n);
      Object.keys(State.porras).forEach(k => { if (k.includes(`_${n}_`)) delete State.porras[k]; });
      this.save(); localStorage.setItem('f_porras', JSON.stringify(State.porras)); Engine.run(); Toast.info(`${n} eliminado`);
    }, 'Eliminar participante');
  },
  save() { localStorage.setItem('f_usuarios', JSON.stringify(State.usuarios)); Engine.run(); }
};

const Engine = {
  run() { requestAnimationFrame(() => { const r = this.calculateRanking(); this.renderLeaderboard(r); this.renderStats(r); Fixture.render(); Stats.update(); }); },
  calculateRanking() {
    const r = {}; State.usuarios.forEach(u => { r[u] = { puntos: 0, exactos: 0, acertados: 0, rachaActual: 0, mejorRacha: 0, partidos: 0 }; });
    State.fixture.forEach(p => {
      if (p.scoreA == null || p.scoreB == null) return;
      State.usuarios.forEach(u => {
        const a = parseInt(State.porras[`p_${u}_${p.id}_A`]), b = parseInt(State.porras[`p_${u}_${p.id}_B`]);
        if (isNaN(a) || isNaN(b)) return;
        r[u].partidos++; r[u].puntos += this.calculatePoints(p, a, b, r[u]);
      });
    });
    return r;
  },
  calculatePoints(p, a, b, s) {
    let pts = 0; const wReal = p.scoreA > p.scoreB ? 'A' : p.scoreA < p.scoreB ? 'B' : 'E', wUser = a > b ? 'A' : a < b ? 'B' : 'E';
    if (a === p.scoreA && b === p.scoreB) { pts += 5; s.exactos++; }
    if (wReal === wUser) { pts += 2; s.acertados++; }
    if (a === p.scoreA) pts++; if (b === p.scoreB) pts++;
    if ((p.scoreA - p.scoreB) === (a - b)) pts++;
    if (p.esp && a === p.scoreA && b === p.scoreB) pts += 3;
    if (pts > 0) { s.rachaActual++; if (s.rachaActual > s.mejorRacha) s.mejorRacha = s.rachaActual; } else s.rachaActual = 0;
    return pts;
  },
  renderLeaderboard(r) {
    const c = document.getElementById('tabla-clasificacion'); if (!c) return;
    const sorted = Object.entries(r).sort((a, b) => b[1].puntos - a[1].puntos);
    c.innerHTML = sorted.length === 0 ? `<div class="empty-state"><span>Sin participantes aún</span></div>` :
      sorted.map(([n, s], i) => `<div class="leaderboard-item"><div class="leader-rank">${i+1}</div><div class="leader-name">${escapeHTML(n)}</div><div class="score-pill">${s.puntos}</div><button class="delete-btn" data-action="delete-user" data-user="${escapeHTML(n)}">✕</button></div>`).join('');
  },
  renderStats(r) {
    const c = document.getElementById('estadisticas-avanzadas'); if (!c) return;
    const sorted = Object.entries(r).sort((a, b) => b[1].puntos - a[1].puntos);
    if (!sorted.length) return c.innerHTML = '';
    const [n, s] = sorted[0];
    c.innerHTML = `<div class="advanced-stats-grid"><div class="stat-card"><div>👑 Líder</div><div>${escapeHTML(n)}</div></div><div class="stat-card"><div>🏆 Puntos</div><div>${s.puntos}</div></div></div>`;
  }
};

const Fixture = {
  isLocked(p) { return !p.utcDate ? false : (new Date(p.utcDate).getTime() - Date.now()) <= CONFIG.LOCK_MINUTES_BEFORE * 60000; },
  getFiltered() { return State.filtroActivo === 'todos' ? State.fixture : State.filtroActivo === 'espana' ? State.fixture.filter(p => p.esp) : State.fixture.filter(p => p.grupo === State.grupoActivo); },
  render() {
    const g = document.getElementById('grid-fixture'); if (!g) return; const p = this.getFiltered();
    g.innerHTML = p.map(m => `<article class="match-card glass-card">${this.card(m)}</article>`).join('');
  },
  card(p) {
    const bloq = this.isLocked(p);
    return `<div class="match-header"><span class="group-pill">G ${p.grupo}</span><span class="stadium-text">${p.estadio}</span></div><div class="teams-grid"><div class="team-side"><span>${p.eqA}</span></div><div class="score-center">${p.scoreA ?? 'VS'}</div><div class="team-side"><span>${p.eqB}</span></div></div><div class="predictions">${State.usuarios.map(u => this.row(u, p, bloq)).join('')}</div>`;
  },
  row(u, p, bloq) {
    const a = State.porras[`p_${u}_${p.id}_A`] ?? '', b = State.porras[`p_${u}_${p.id}_B`] ?? '';
    return `<div class="prediction-row"><span>${escapeHTML(u)}</span><input type="number" value="${a}" class="prediction-input" data-user="${escapeHTML(u)}" data-match="${p.id}" data-team="A" ${bloq?'disabled':''}><span>-</span><input type="number" value="${b}" class="prediction-input" data-user="${escapeHTML(u)}" data-match="${p.id}" data-team="B" ${bloq?'disabled':''}></div>`;
  }
};

const savePorra = debounce((user, matchId, team, val) => {
  State.porras[`p_${user}_${matchId}_${team}`] = val;
  localStorage.setItem('f_porras', JSON.stringify(State.porras)); haptic(5); Engine.run();
}, CONFIG.DEBOUNCE_MS);

const Events = {
  init() {
    document.addEventListener('input', e => {
      if (e.target.classList.contains('prediction-input')) {
        savePorra(e.target.dataset.user, e.target.dataset.match, e.target.dataset.team, e.target.value);
      }
    });
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-action]');
      if (t?.dataset.action === 'delete-user') Users.remove(t.dataset.user);
    });
  }
};

const App = {
  async init() {
    Toast.init(); Events.init();
    try { State.fixture = await API.getMatches(); Engine.run(); } 
    catch (e) { Toast.error('Error al cargar'); }
  },
  async refresh() {
    localStorage.removeItem(CONFIG.CACHE_KEY);
    State.fixture = await API.getMatches();
    Engine.run();
    Toast.success('Actualizado');
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());