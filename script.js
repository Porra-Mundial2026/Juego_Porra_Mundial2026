'use strict';

/* ======================================================
   WORLD CUP 2026 • MOBILE APP EDITION 3.0
   Capacitor + Android + iPhone Ready
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
  TIMEZONES: {
    Canada: 'America/Toronto',
    Mexico: 'America/Mexico_City',
    'United States': 'America/New_York',
    USA: 'America/New_York'
  }
};

/* ======================================================
   GLOBAL STATE
====================================================== */
const State = {
  fixture: [],
  usuarios: JSON.parse(localStorage.getItem('f_usuarios')) || [],
  porras: JSON.parse(localStorage.getItem('f_porras')) || {},
  grupoActivo: 'A',
  filtroActivo: 'grupo',
  isOnline: navigator.onLine,
  isLoading: false,
  initialized: false
};

/* ======================================================
   HELPERS
====================================================== */
const debounce = (fn, ms = CONFIG.DEBOUNCE_MS) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => { fn.apply(this, args); }, ms);
  };
};

const escapeHTML = (str) => {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
};

const haptic = (pattern = 10) => {
  if ('vibrate' in navigator) {
    try { navigator.vibrate(pattern); } catch {}
  }
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/* ======================================================
   DATE FORMATTERS CACHE
====================================================== */
const dateFormatters = new Map();
const getFormatter = (locale, options) => {
  const key = `${locale}_${JSON.stringify(options)}`;
  if (!dateFormatters.has(key)) {
    dateFormatters.set(key, new Intl.DateTimeFormat(locale, options));
  }
  return dateFormatters.get(key);
};

/* ======================================================
   TOAST
====================================================== */
const Toast = {
  container: null,
  init() {
    this.container = document.getElementById('toast-container');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      // Estilos mínimos para asegurar visualización correcta del Toast
      this.container.style.position = 'fixed';
      this.container.style.bottom = '85px';
      this.container.style.left = '50%';
      this.container.style.transform = 'translateX(-50%)';
      this.container.style.zIndex = '9999';
      this.container.style.display = 'flex';
      this.container.style.flexDirection = 'column';
      this.container.style.gap = '8px';
      this.container.style.width = '90%';
      this.container.style.maxWidth = '360px';
      document.body.appendChild(this.container);
    }
  },
  show(message, type = 'info', duration = 3000) {
    this.init();
    if (!this.container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.background = type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#3b82f6';
    toast.style.color = '#fff';
    toast.style.padding = '12px 16px';
    toast.style.borderRadius = '12px';
    toast.style.fontSize = '14px';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '8px';
    toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.3)';
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';

    toast.innerHTML = `<span>${this.getIcon(type)}</span> <span>${escapeHTML(message)}</span>`;
    this.container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => { toast.remove(); }, 300);
    }, duration);

    haptic(type === 'error' ? [40, 40, 40] : 10);
  },
  getIcon(type) {
    return { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' }[type] || 'ℹ';
  },
  success(msg) { this.show(msg, 'success'); },
  error(msg) { this.show(msg, 'error', 4000); },
  warning(msg) { this.show(msg, 'warning', 3500); },
  info(msg) { this.show(msg, 'info'); }
};

/* ======================================================
   MODALS / CLOCK / FLAGS (Mantenidos y optimizados)
 ====================================================== */
const Modal = {
  show(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  },
  hide(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
  },
  confirm(message, onConfirm, title = '¿Estás seguro?') {
    if (confirm(message)) onConfirm();
  }
};

const obtenerBandera = (code) => {
  if (!code) return 'https://flagcdn.com/w160/un.png';
  return `https://flagcdn.com/w160/${code.toLowerCase()}.png`;
};

const Clock = {
  interval: null,
  getTime(tz) {
    try {
      return getFormatter('es-ES', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        timeZone: tz || 'Europe/Madrid'
      }).format(new Date());
    } catch { return '--:--'; }
  },
  start() {
    this.stop();
    this.update();
    this.interval = setInterval(() => { this.update(); }, 1000);
  },
  stop() { if (this.interval) { clearInterval(this.interval); this.interval = null; } },
  update() {
    document.querySelectorAll('.live-clock').forEach(clock => {
      clock.textContent = `🕒 ${this.getTime(clock.dataset.timezone)}`;
    });
  }
};

/* ======================================================
   API LAYER (Corrección robusta del Fallback Offline)
====================================================== */
const API = {
  async fetchWithRetry(url, options = {}, retries = CONFIG.MAX_RETRY) {
    for (let i = 0; i <= retries; i++) {
      try {
        const response = await fetch(url, options);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response;
      } catch (error) {
        if (i === retries) throw error;
        await sleep(1000 * (i + 1));
      }
    }
  },

  getCache() {
    try {
      const cache = JSON.parse(localStorage.getItem(CONFIG.CACHE_KEY) || '{}');
      if (!cache.timestamp || Date.now() - cache.timestamp > CONFIG.CACHE_TTL) return null;
      return cache.data;
    } catch { return null; }
  },

  setCache(data) {
    try { localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() })); } catch {}
  },

  async getMatches() {
    const cached = this.getCache();
    if (cached) return cached;

    try {
      const response = await this.fetchWithRetry(CONFIG.API_URL, {
        headers: { 'X-Auth-Token': CONFIG.API_KEY }
      });
      const data = await response.json();
      if (data && data.matches && Array.isArray(data.matches)) {
        const transformed = this.transformAPI(data.matches);
        this.setCache(transformed);
        return transformed;
      }
      throw new Error('Estructura API inválida');
    } catch (error) {
      console.warn('API Fallback activado → Cargando JSON local...', error);
      return await this.getLocalJSON();
    }
  },

  async getLocalJSON() {
    try {
      const response = await fetch(CONFIG.DATA_URL);
      if (!response.ok) throw new Error('No local JSON file found');
      const data = await response.json();
      
      // Controlar con seguridad si el JSON de data/matches.json trae { matches: [...] } o un Array directo
      let arrayPartidos = [];
      if (data && data.matches && Array.isArray(data.matches)) {
        arrayPartidos = data.matches;
      } else if (Array.isArray(data)) {
        arrayPartidos = data;
      }

      return this.transformAPI(arrayPartidos);
    } catch (error) {
      console.error('Error leyendo JSON offline:', error);
      Toast.error('Datos offline no disponibles');
      return [];
    }
  },

  transformAPI(matches) {
    if (!Array.isArray(matches)) return [];
    return matches.map((match, index) => {
      const home = match.homeTeam || {};
      const away = match.awayTeam || {};
      const utc = match.utcDate ? new Date(match.utcDate) : new Date();

      return {
        id: match.id || index,
        grupo: this.detectGroup(match, index),
        fecha: getFormatter('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(utc),
        hora: getFormatter('es-ES', { hour: '2-digit', minute: '2-digit' }).format(utc),
        estadio: match.venue || 'Estadio del Mundial',
        ciudad: match.area?.name || '',
        timezone: this.detectTimezone(match.area?.name),
        eqA: home.shortName || home.name || 'TBD',
        eqB: away.shortName || away.name || 'TBD',
        flagA: obtenerBandera(home.tla || home.code),
        flagB: obtenerBandera(away.tla || away.code),
        esp: home.name === 'Spain' || away.name === 'Spain' || home.shortName === 'España' || away.shortName === 'España',
        scoreA: match.status === 'FINISHED' ? match.score?.fullTime?.home : null,
        scoreB: match.status === 'FINISHED' ? match.score?.fullTime?.away : null,
        utcDate: match.utcDate,
        status: match.status || 'TIMED'
      };
    });
  },

  detectGroup(match, index) {
    return match.group?.replace('GROUP_', '') || CONFIG.GROUPS[index % CONFIG.GROUPS.length];
  },

  detectTimezone(city) {
    for (const [key, value] of Object.entries(CONFIG.TIMEZONES)) {
      if (city?.includes(key)) return value;
    }
    return 'Europe/Madrid';
  }
};

/* ======================================================
   PARTICIPANTES (Users)
====================================================== */
const Users = {
  add(name) {
    name = name.trim();
    if (!name) { Toast.warning('Escribe un nombre'); return false; }
    if (name.length > 20) { Toast.warning('Máximo 20 caracteres'); return false; }

    const exists = State.usuarios.some(u => u.toLowerCase() === name.toLowerCase());
    if (exists) { Toast.warning('Ese usuario ya existe'); return false; }

    State.usuarios.push(name);
    this.save();
    Toast.success(`${name} añadido`);
    haptic(20);
    return true;
  },
  remove(name) {
    State.usuarios = State.usuarios.filter(user => user !== name);
    Object.keys(State.porras).forEach(key => {
      if (key.includes(`_${name}_`)) delete State.porras[key];
    });
    this.save();
    localStorage.setItem('f_porras', JSON.stringify(State.porras));
    Engine.run();
    Toast.info(`${name} eliminado`);
  },
  save() {
    localStorage.setItem('f_usuarios', JSON.stringify(State.usuarios));
    Engine.run();
  }
};

/* ======================================================
   ENGINE (Cálculo de puntos y renderizado de tablas)
====================================================== */
const Engine = {
  run() {
    requestAnimationFrame(() => {
      const ranking = this.calculateRanking();
      this.renderLeaderboard(ranking);
      this.renderStats(ranking);
      Fixture.render();
      Stats.update();
    });
  },

  calculateRanking() {
    const ranking = {};
    State.usuarios.forEach(user => {
      ranking[user] = { puntos: 0, exactos: 0, acertados: 0, rachaActual: 0, mejorRacha: 0, partidos: 0 };
    });

    State.fixture.forEach(match => {
      if (match.scoreA == null || match.scoreB == null) return;

      State.usuarios.forEach(user => {
        const a = parseInt(State.porras[`p_${user}_${match.id}_A`]);
        const b = parseInt(State.porras[`p_${user}_${match.id}_B`]);
        if (isNaN(a) || isNaN(b)) return;

        ranking[user].partidos++;
        ranking[user].puntos += this.calculatePoints(match, a, b, ranking[user]);
      });
    });
    return ranking;
  },

  calculatePoints(match, a, b, stats) {
    let pts = 0;
    const winnerReal = match.scoreA > match.scoreB ? 'A' : match.scoreA < match.scoreB ? 'B' : 'E';
    const winnerUser = a > b ? 'A' : a < b ? 'B' : 'E';

    if (a === match.scoreA && b === match.scoreB) {
      pts += 5; stats.exactos++;
    }
    if (winnerReal === winnerUser) {
      pts += 2; stats.acertados++;
    }
    if (a === match.scoreA) pts++;
    if (b === match.scoreB) pts++;
    if ((match.scoreA - match.scoreB) === (a - b)) pts++;
    if (match.esp && a === match.scoreA && b === match.scoreB) pts += 3;

    if (pts > 0) {
      stats.rachaActual++;
      if (stats.rachaActual > stats.mejorRacha) stats.mejorRacha = stats.rachaActual;
    } else {
      stats.rachaActual = 0;
    }
    return pts;
  },

  renderLeaderboard(ranking) {
    const container = document.getElementById('tabla-clasificacion');
    if (!container) return;

    const sorted = Object.entries(ranking).sort((a, b) => b[1].puntos - a[1].puntos);
    if (sorted.length === 0) {
      container.innerHTML = `<div class="empty-state" style="text-align:center;padding:20px;opacity:0.6;"><span>Sin participantes todavía</span></div>`;
      return;
    }

    container.innerHTML = `<h3 style="margin-bottom:12px; font-size:16px;">📊 Clasificación Familiar</h3>` + sorted.map(([name, stats], index) => `
      <div class="leaderboard-item">
        <div class="leader-rank" style="font-weight:800; color:var(--primary); width:24px;">#${index + 1}</div>
        <div class="leader-name" style="flex:1; font-weight:600;">${escapeHTML(name)}</div>
        <div class="score-pill" style="background:rgba(59,130,246,0.15); color:var(--primary); padding:4px 10px; border-radius:8px; font-weight:800;">${stats.puntos} pts</div>
        <button class="delete-btn" data-action="delete-user" data-user="${escapeHTML(name)}" style="color:var(--danger); margin-left:8px; font-weight:bold; padding:4px;">✕</button>
      </div>
    `).join('');
  },

  renderStats(ranking) {
    const container = document.getElementById('estadisticas-avanzadas');
    if (!container) return;

    const sorted = Object.entries(ranking).sort((a, b) => b[1].puntos - a[1].puntos);
    if (!sorted.length) { container.innerHTML = ''; return; }

    const [name, stats] = sorted[0];
    container.innerHTML = `
      <div class="advanced-stats-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="stat-card">
          <div class="stat-label">👑 Líder Provisional</div>
          <div class="stat-number" style="color:var(--warning); font-size:18px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHTML(name)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">🏆 Puntuación Máxima</div>
          <div class="stat-number" style="color:var(--success);">${stats.puntos}</div>
        </div>
      </div>
    `;
  }
};

/* ======================================================
   FIXTURE (Estructura adaptada al CSS de .team-row y inputs)
====================================================== */
const Fixture = {
  isLocked(match) {
    if (!match.utcDate) return false;
    return (new Date(match.utcDate).getTime() - Date.now()) <= CONFIG.LOCK_MINUTES_BEFORE * 60000;
  },

  getFiltered() {
    if (State.filtroActivo === 'todos') return State.fixture;
    if (State.filtroActivo === 'espana') return State.fixture.filter(match => match.esp);
    return State.fixture.filter(match => match.grupo === State.grupoActivo);
  },

  render() {
    const grid = document.getElementById('grid-fixture');
    if (!grid) return;

    const matches = this.getFiltered();
    if (matches.length === 0) {
      grid.innerHTML = `<div style="text-align:center; padding:30px; opacity:0.5;">No hay partidos cargados en este grupo.</div>`;
      return;
    }

    grid.innerHTML = matches.map(match => `
      <article class="match-card glass-card">
        ${this.card(match)}
      </article>
    `).join('');
  },

  card(match) {
    const blocked = this.isLocked(match);
    const scoreRealA = match.scoreA ?? '-';
    const scoreRealB = match.scoreB ?? '-';

    return `
      <div class="match-header" style="display:flex; justify-content:space-between; margin-bottom:12px; font-size:11px; opacity:0.6;">
        <span class="group-pill" style="background:rgba(255,255,255,0.08); padding:2px 6px; border-radius:6px; font-weight:700;">GRUPO ${match.grupo}</span>
        <span class="stadium-text" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;">🏟️ ${escapeHTML(match.estadio)}</span>
        <span style="color:var(--primary); font-weight:600;">${match.hora}</span>
      </div>

      <div class="teams-container" style="display:flex; flex-direction:column; gap:8px; margin-bottom:14px; background:rgba(0,0,0,0.15); padding:10px; border-radius:10px;">
        <div class="team-row">
          <div style="display:flex; align-items:center; gap:8px;">
            <img src="${match.flagA}" alt="" style="width:20px; height:14px; border-radius:2px; object-fit:cover;">
            <span class="team-name">${escapeHTML(match.eqA)}</span>
          </div>
          <span style="font-weight:800; font-size:16px; color:var(--primary);">${scoreRealA}</span>
        </div>
        <div class="team-row">
          <div style="display:flex; align-items:center; gap:8px;">
            <img src="${match.flagB}" alt="" style="width:20px; height:14px; border-radius:2px; object-fit:cover;">
            <span class="team-name">${escapeHTML(match.eqB)}</span>
          </div>
          <span style="font-weight:800; font-size:16px; color:var(--primary);">${scoreRealB}</span>
        </div>
      </div>

      <div class="predictions" style="border-top:1px solid rgba(255,255,255,0.05); padding-top:10px; display:flex; flex-direction:column; gap:8px;">
        ${State.usuarios.length === 0 ? '<div style="font-size:12px; opacity:0.5; text-align:center;">Agrega participantes para apostar</div>' : ''}
        ${State.usuarios.map(user => this.row(user, match, blocked)).join('')}
      </div>
    `;
  },

  row(user, match, blocked) {
    const a = State.porras[`p_${user}_${match.id}_A`] ?? '';
    const b = State.porras[`p_${user}_${match.id}_B`] ?? '';

    return `
      <div class="prediction-row" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <span style="font-size:13px; font-weight:500; opacity:0.8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:120px;">👤 ${escapeHTML(user)}</span>
        <div class="score-wrapper">
          <input
            type="number" inputmode="numeric" min="0" max="20" value="${a}"
            class="prediction-input" data-user="${escapeHTML(user)}" data-match="${match.id}" data-team="A"
            ${blocked ? 'disabled' : ''}
          >
          <span style="opacity:0.4; font-weight:bold;">-</span>
          <input
            type="number" inputmode="numeric" min="0" max="20" value="${b}"
            class="prediction-input" data-user="${escapeHTML(user)}" data-match="${match.id}" data-team="B"
            ${blocked ? 'disabled' : ''}
          >
        </div>
      </div>
    `;
  }
};

/* ======================================================
   CONTADORES / STATS 
====================================================== */
const Stats = {
  update() {
    const totalPartidos = State.fixture.length;
    const totalJugados = State.fixture.filter(m => m.scoreA != null && m.scoreB != null).length;
    const totalLive = State.fixture.filter(m => m.status === 'IN_PLAY' || m.status === 'LIVE').length;

    this.set('totalPartidos', totalPartidos);
    this.set('totalJugados', totalJugados);
    this.set('totalLive', totalLive);
    this.set('totalUsers', State.usuarios.length);
  },
  set(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }
};

/* ======================================================
   DEBOUNCE SAVE PORRA
====================================================== */
const savePorra = debounce((user, matchId, team, value) => {
  State.porras[`p_${user}_${matchId}_${team}`] = value;
  localStorage.setItem('f_porras', JSON.stringify(State.porras));
  haptic(5);
  Engine.run();
}, CONFIG.DEBOUNCE_MS);

/* ======================================================
   EVENTS MANAGMENT & OFFLINE BANNER CONTROL
====================================================== */
const Events = {
  init() {
    // Interceptar cambios en inputs de pronósticos
    document.addEventListener('input', event => {
      const target = event.target;
      if (target.classList.contains('prediction-input')) {
        savePorra(target.dataset.user, target.dataset.match, target.dataset.team, target.value);
      }
    });

    // Interceptar botones de acción global
    document.addEventListener('click', event => {
      const target = event.target.closest('[data-action]');
      if (!target) return;

      if (target.dataset.action === 'delete-user') {
        if (confirm(`¿Eliminar a ${target.dataset.user}?`)) {
          Users.remove(target.dataset.user);
        }
      }
      if (target.dataset.action === 'refresh') {
        App.refresh();
      }
    });

    // Control visual dinámico del cartel de Red Offline
    const banner = document.getElementById('offline-banner');
    const syncBanner = () => {
      if (banner) {
        if (State.isOnline) {
          banner.hidden = true;
          banner.style.display = 'none';
        } else {
          banner.hidden = false;
          banner.style.display = 'flex';
        }
      }
    };

    syncBanner(); // Ejecución en carga inicial

    window.addEventListener('online', () => {
      State.isOnline = true;
      syncBanner();
      Toast.success('Conexión restaurada');
      App.refresh();
    });

    window.addEventListener('offline', () => {
      State.isOnline = false;
      syncBanner();
      Toast.warning('Trabajando en modo offline');
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { Clock.stop(); } else { Clock.start(); }
    });
  }
};

/* ======================================================
   APP INITIALIZATION ENTRYPOINT
====================================================== */
const App = {
  async init() {
    if (State.initialized) return;
    State.initialized = true;

    Toast.init();
    Events.init();
    Clock.start();

    // Renderizado base de los botones de grupo dinámicos (Filtros)
    const filtersBar = document.querySelector('.filters-bar');
    if (filtersBar) {
      filtersBar.innerHTML = CONFIG.GROUPS.map(g => `
        <button class="filter-btn ${State.grupoActivo === g ? 'active' : ''}" data-group="${g}">
          Grp ${g}
        </button>
      `).join('');

      filtersBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        State.grupoActivo = btn.dataset.group;
        Fixture.render();
      });
    }

    try {
      State.isLoading = true;
      const grid = document.getElementById('grid-fixture');
      if (grid) grid.innerHTML = `<div style="text-align:center;padding:20px;opacity:0.6;">Cargando partidos...</div>`;
      
      State.fixture = await API.getMatches();
      Engine.run();
    } catch (error) {
      console.error(error);
      Toast.error('Error al inicializar partidos');
    } finally {
      State.isLoading = false;
    }
  },

  async refresh() {
    try {
      localStorage.removeItem(CONFIG.CACHE_KEY);
      Toast.info('Actualizando partidos...');
      State.fixture = await API.getMatches();
      Engine.run();
      Toast.success('Datos actualizados');
    } catch (error) {
      console.error(error);
      Toast.error('No se pudo actualizar la lista');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});