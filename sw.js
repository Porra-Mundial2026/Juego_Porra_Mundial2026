'use strict';
/* ======================================================
   WORLD CUP 2026 • APPLE EDITION • PRO ENGINE 2.1
   CORREGIDO Y OPTIMIZADO PARA MÓVIL
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
  usuarios: JSON.parse(localStorage.getItem('f_usuarios') || '[]'),
  porras: JSON.parse(localStorage.getItem('f_porras') || '{}'),
  grupoActivo: 'A',
  filtroActivo: 'grupo',
  isOnline: navigator.onLine,
  isLoading: false
};

// UTILIDADES
const debounce = (fn, ms = CONFIG.DEBOUNCE_MS) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), ms);
  };
};

const escapeHTML = (str) => {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
};

const haptic = (pattern = 10) => { if (navigator.vibrate) navigator.vibrate(pattern); };

// CLASES PRINCIPALES
const Toast = {
  container: null,
  init() { this.container = document.getElementById('toast-container'); },
  show(message, type = 'info', duration = 3000) {
    if (!this.container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${escapeHTML(message)}</span>`;
    this.container.appendChild(toast);
    setTimeout(() => { toast.classList.add('toast-exit'); setTimeout(() => toast.remove(), 300); }, duration);
  },
  success(msg) { this.show(msg, 'success'); }, 
  error(msg) { this.show(msg, 'error', 4000); },
  warning(msg) { this.show(msg, 'warning', 3500); }, 
  info(msg) { this.show(msg, 'info'); }
};

const API = {
  async fetchWithRetry(url, options = {}, retries = CONFIG.MAX_RETRY) {
    for (let i = 0; i <= retries; i++) {
      try { const r = await fetch(url, options); if (!r.ok) throw new Error(); return r; } 
      catch (e) { if (i === retries) throw e; await new Promise(r => setTimeout(r, 1000 * (i + 1))); }
    }
  },
  async getMatches() {
    const cached = JSON.parse(localStorage.getItem(CONFIG.CACHE_KEY));
    if (cached && (Date.now() - cached.timestamp < CONFIG.CACHE_TTL)) return cached.data;
    
    try {
      const r = await this.fetchWithRetry(CONFIG.API_URL, { headers: { 'X-Auth-Token': CONFIG.API_KEY } });
      const d = await r.json();
      const transformed = this.transformAPI(d.matches || []);
      localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ data: transformed, timestamp: Date.now() }));
      return transformed;
    } catch {
      const local = await fetch(CONFIG.DATA_URL).then(r => r.json()).catch(() => []);
      return this.transformLocal(local);
    }
  },
  transformAPI(matches) {
    return matches.map((m, i) => ({
      id: m.id || i,
      grupo: m.group?.replace('GROUP_', '') || CONFIG.GROUPS[0],
      fecha: new Date(m.utcDate).toLocaleDateString('es-ES', { day:'2-digit', month:'short' }),
      hora: new Date(m.utcDate).toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' }),
      eqA: m.homeTeam?.shortName || m.homeTeam?.name || 'TBD',
      eqB: m.awayTeam?.shortName || m.awayTeam?.name || 'TBD',
      flagA: `https://flagcdn.com/w40/${(m.homeTeam?.tla || '').toLowerCase()}.png`,
      flagB: `https://flagcdn.com/w40/${(m.awayTeam?.tla || '').toLowerCase()}.png`,
      scoreA: m.status === 'FINISHED' ? m.score?.fullTime?.home : null,
      scoreB: m.status === 'FINISHED' ? m.score?.fullTime?.away : null,
      utcDate: m.utcDate,
      status: m.status
    }));
  },
  transformLocal(matches) {
    return matches.map((m, i) => ({
      id: m.id || i,
      grupo: m.group || 'A',
      fecha: m.kickoffUTC?.slice(5, 10) || '',
      eqA: m.homeTeam?.name || 'TBD',
      eqB: m.awayTeam?.name || 'TBD',
      scoreA: m.score?.home ?? null,
      scoreB: m.score?.away ?? null,
      status: m.status || 'SCHEDULED'
    }));
  }
};

const Engine = {
  run() {
    const ranking = this.calculate();
    this.renderLeaderboard(ranking);
    Fixture.render();
  },
  calculate() {
    const r = {};
    State.usuarios.forEach(u => r[u] = { puntos: 0, acertados: 0 });
    State.fixture.forEach(p => {
      if (p.scoreA == null) return;
      State.usuarios.forEach(u => {
        const a = parseInt(State.porras[`p_${u}_${p.id}_A`]);
        const b = parseInt(State.porras[`p_${u}_${p.id}_B`]);
        if (!isNaN(a) && a === p.scoreA && b === p.scoreB) r[u].puntos += 5;
      });
    });
    return Object.entries(r).sort((a, b) => b[1].puntos - a[1].puntos);
  },
  renderLeaderboard(r) {
    const c = document.getElementById('tabla-clasificacion');
    if (c) c.innerHTML = r.map(([n, s], i) => `<div>${i+1}. ${n} - ${s.puntos} pts</div>`).join('');
  }
};

const Fixture = {
  render() {
    const grid = document.getElementById('grid-fixture');
    if (!grid) return;
    grid.innerHTML = State.fixture.map(m => `
      <div class="match-card">
        <div>${m.eqA} vs ${m.eqB}</div>
        <input type="number" placeholder="0" data-match="${m.id}" data-team="A">
        <input type="number" placeholder="0" data-match="${m.id}" data-team="B">
      </div>
    `).join('');
  }
};

// INICIALIZACIÓN
const App = {
  async init() {
    Toast.init();
    State.fixture = await API.getMatches();
    Engine.run();
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());