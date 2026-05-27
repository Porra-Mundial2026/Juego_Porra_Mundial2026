/* ======================================================
   WORLD CUP 2026 • MOTOR LOGICO PREMIUM EDITION 4.0
   Estilo Apple Titanium Dark - Conectividad Blindada
====================================================== */

'use strict';

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
   ESTADO GLOBAL DE LA APP
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
   UTILIDADES Y HELPERS DE SISTEMA
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
   SISTEMA INTERNO DE CACHÉ DE FORMATO DE FECHAS
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
   TOAST NOTIFICATIONS (Alineado con el CSS de Apple)
====================================================== */
const Toast = {
  container: null,
  init() {
    this.container = document.getElementById('toast-container');
  },
  show(message, type = 'info', duration = 3000) {
    this.init();
    if (!this.container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Asignación de colores basada en el sistema iOS Dark
    const colorMap = {
      success: 'var(--success-glow)',
      error: 'var(--danger-glow)',
      warning: 'var(--live-pulse)',
      info: 'var(--primary-accent)'
    };
    
    toast.style.borderLeft = `3px solid ${colorMap[type] || '#fff'}`;
    toast.innerHTML = `${escapeHTML(message)}`;
    
    this.container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translate(50%, 10px)';
      setTimeout(() => { toast.remove(); }, 300);
    }, duration);

    haptic(type === 'error' ? [40, 40, 40] : 10);
  },
  success(msg) { this.show(msg, 'success'); },
  error(msg) { this.show(msg, 'error', 4000); },
  warning(msg) { this.show(msg, 'warning', 3500); },
  info(msg) { this.show(msg, 'info'); }
};

/* ======================================================
   CONTROLADORES DE INTERFAZ MÓVIL (Modales / Banderas)
====================================================== */
const Modal = {
  show(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    
    // Foco automático al input si es el modal de añadir usuario
    if (id === 'modal-add-user') {
      setTimeout(() => document.getElementById('input-new-username')?.focus(), 50);
    }
  },
  hide(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
  }
};

const obtenerBandera = (code) => {
  if (!code) return 'https://flagcdn.com/w160/un.png';
  return `https://flagcdn.com/w160/${code.toLowerCase()}.png`;
};

/* ======================================================
   CAPA DE RED API (Conexión Blindada Externa / Interna)
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
      throw new Error('Estructura de respuesta inválida');
    } catch (error) {
      console.warn('Alerta API: Activando contingencia hacia almacenamiento local...', error);
      return await this.getLocalJSON();
    }
  },

  async getLocalJSON() {
    try {
      const response = await fetch(CONFIG.DATA_URL);
      if (!response.ok) throw new Error('Archivo JSON local ausente');
      const data = await response.json();
      
      let arrayPartidos = [];
      if (data && data.matches && Array.isArray(data.matches)) {
        arrayPartidos = data.matches;
      } else if (Array.isArray(data)) {
        arrayPartidos = data;
      }

      return this.transformAPI(arrayPartidos);
    } catch (error) {
      console.error('Fallo absoluto en conexiones de respaldo offline:', error);
      Toast.error('Base de datos local no disponible');
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
        grupo: match.group?.replace('GROUP_', '') || CONFIG.GROUPS[index % CONFIG.GROUPS.length],
        fecha: getFormatter('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(utc),
        hora: getFormatter('es-ES', { hour: '2-digit', minute: '2-digit' }).format(utc),
        estadio: match.venue || 'Estadio Oficial Mundial 2026',
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

  detectTimezone(city) {
    for (const [key, value] of Object.entries(CONFIG.TIMEZONES)) {
      if (city?.includes(key)) return value;
    }
    return 'Europe/Madrid';
  }
};

/* ======================================================
   GESTIÓN INTEGRADA DE PARTICIPANTES (Usuarios)
====================================================== */
const Users = {
  add(name) {
    name = name.trim();
    if (!name) { Toast.warning('Introduce un nombre válido'); return false; }
    if (name.length > 20) { Toast.warning('Límite de 20 caracteres excedido'); return false; }

    const exists = State.usuarios.some(u => u.toLowerCase() === name.toLowerCase());
    if (exists) { Toast.warning('Este usuario ya está registrado'); return false; }

    State.usuarios.push(name);
    this.save();
    Toast.success(`${name} se unió a la porra`);
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
    Toast.info(`${name} fue eliminado`);
  },
  save() {
    localStorage.setItem('f_usuarios', JSON.stringify(State.usuarios));
    Engine.run();
  }
};

/* ======================================================
   ENGINE (Cálculo de Reglas y Renderizado Apple Premium)
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
      container.innerHTML = `
        <h3 class="leaderboard-title">📊 Clasificación Familiar</h3>
        <div style="text-align:center; padding:24px; color:var(--titanium-gray); font-size:13px;">
          Sin miembros en el clan. ¡Añade uno desde el menú inferior!
        </div>`;
      return;
    }

    let tableHtml = `
      <h3 class="leaderboard-title">📊 Clasificación Familiar</h3>
      <table class="premium-table">
        <thead>
          <tr>
            <th style="width: 45px;">Rank</th>
            <th>Participante</th>
            <th style="text-align: center; width: 60px;">Porras</th>
            <th style="text-align: right; padding-right: 8px;">Puntos</th>
            <th style="width: 35px;"></th>
          </tr>
        </thead>
        <tbody>
    `;

    sorted.forEach(([name, stats], index) => {
      tableHtml += `
        <tr>
          <td class="row-position">#${index + 1}</td>
          <td class="row-username">${escapeHTML(name)}</td>
          <td style="text-align: center; color: var(--titanium-gray); font-size: 12px; font-weight: 600;">${stats.partidos}</td>
          <td class="row-points">${stats.puntos} <span style="font-size:10px; font-weight:500; opacity:0.6;">PTS</span></td>
          <td style="text-align: center;">
            <button data-action="delete-user" data-user="${escapeHTML(name)}" style="background:none; border:none; color:var(--danger-glow); font-weight:bold; cursor:pointer; font-size:14px; padding:4px;">✕</button>
          </td>
        </tr>
      `;
    });

    tableHtml += `</tbody></table>`;
    container.innerHTML = tableHtml;
  },

  renderStats(ranking) {
    const container = document.getElementById('estadisticas-avanzadas');
    if (!container) return;

    const sorted = Object.entries(ranking).sort((a, b) => b[1].puntos - a[1].puntos);
    if (!sorted.length) { container.style.display = 'none'; return; }

    container.style.display = 'block';
    const [name, stats] = sorted[0];
    container.innerHTML = `
      <div style="display:flex; gap:12px;">
        <div class="stat-card" style="display:block; width:50%; flex:none;">
          <span class="stat-label">👑 Líder Oro</span>
          <div class="stat-number" style="color:var(--warning-glow); text-overflow:ellipsis; overflow:hidden; white-space:nowrap; font-size:15px;">${escapeHTML(name)}</div>
        </div>
        <div class="stat-card" style="display:block; width:50%; flex:none;">
          <span class="stat-label">🎯 Record Exacto</span>
          <div class="stat-number" style="color:var(--success-glow); font-size:15px;">${stats.exactos} <span style="font-size:10px; opacity:0.5;">plenos</span></div>
        </div>
      </div>
    `;
  }
};

/* ======================================================
   FIXTURE (Tarjetas de Partidos con Inyección Avanzada)
====================================================== */
const Fixture = {
  isLocked(match) {
    if (!match.utcDate) return false;
    return (new Date(match.utcDate).getTime() - Date.now()) <= CONFIG.LOCK_MINUTES_BEFORE * 60000;
  },

  getFiltered() {
    if (State.filtroActivo === 'todos') return State.fixture;
    return State.fixture.filter(match => match.grupo === State.grupoActivo);
  },

  render() {
    const grid = document.getElementById('grid-fixture');
    if (!grid) return;

    const matches = this.getFiltered();
    if (matches.length === 0) {
      grid.innerHTML = `<div style="text-align:center; padding:40px; color:var(--titanium-gray); font-size:13px;">No hay encuentros disponibles para este sector.</div>`;
      return;
    }

    grid.innerHTML = matches.map(match => `
      <article class="match-card">
        ${this.card(match)}
      </article>
    `).join('');
  },

  card(match) {
    const blocked = this.isLocked(match);
    const scoreRealA = match.scoreA ?? '-';
    const scoreRealB = match.scoreB ?? '-';
    const isLive = match.status === 'IN_PLAY' || match.status === 'LIVE';

    return `
      <div class="match-header">
        <span class="match-stage">GRUPO ${match.grupo}</span>
        <span class="match-status-badge ${isLive ? 'live' : ''}" style="${!isLive ? 'background:rgba(255,255,255,0.04); color:var(--titanium-gray); border:1px solid rgba(255,255,255,0.05);' : ''}">
          ${isLive ? '• EN VIVO' : 'PROGRAMADO'}
        </span>
      </div>

      <div class="match-body-row">
        <div class="team-container">
          <img src="${match.flagA}" class="team-flag" style="width:22px; height:15px; object-fit:cover; border-radius:2px;" alt="">
          <span class="team-name-text">${escapeHTML(match.eqA)}</span>
        </div>
        <div class="score-zone">
          <span class="real-score-box">${scoreRealA}</span>
        </div>
      </div>

      <div class="match-body-row" style="margin-bottom:14px;">
        <div class="team-container">
          <img src="${match.flagB}" class="team-flag" style="width:22px; height:15px; object-fit:cover; border-radius:2px;" alt="">
          <span class="team-name-text">${escapeHTML(match.eqB)}</span>
        </div>
        <div class="score-zone">
          <span class="real-score-box">${scoreRealB}</span>
        </div>
      </div>

      <div class="predictions" style="border-top:1px solid rgba(255,255,255,0.04); padding-top:12px; display:flex; flex-direction:column; gap:10px;">
        ${State.usuarios.length === 0 ? '<div style="font-size:12px; color:var(--titanium-gray); text-align:center; padding:4px;">Asigna participantes en la barra inferior para apostar</div>' : ''}
        ${State.usuarios.map(user => this.row(user, match, blocked)).join('')}
      </div>

      <div class="match-footer" style="margin-top:12px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.02);">
        <span>📍 ${escapeHTML(match.estadio)}</span>
        <span style="font-weight:600; color:var(--titanium-light);">${match.fecha} • ${match.hora}</span>
      </div>
    `;
  },

  row(user, match, blocked) {
    const a = State.porras[`p_${user}_${match.id}_A`] ?? '';
    const b = State.porras[`p_${user}_${match.id}_B`] ?? '';

    return `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
        <span style="font-size:13px; font-weight:500; color:var(--titanium-light); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:140px;">👤 ${escapeHTML(user)}</span>
        <div class="score-zone" style="gap:4px;">
          <input
            type="number" inputmode="numeric" min="0" max="20" value="${a}"
            class="prediction-input" data-user="${escapeHTML(user)}" data-match="${match.id}" data-team="A"
            ${blocked ? 'disabled' : ''}
          >
          <span style="opacity:0.3; font-weight:700; color:#fff; font-size:12px;">:</span>
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
   PANEL CENTRAL DE ESTADÍSTICAS E INDICADORES (Hero)
====================================================== */
const Stats = {
  update() {
    this.set('totalMatches', State.fixture.length);
    this.set('totalPlayed', State.fixture.filter(m => m.scoreA != null && m.scoreB != null).length);
    this.set('totalLive', State.fixture.filter(m => m.status === 'IN_PLAY' || m.status === 'LIVE').length);
    this.set('totalUsers', State.usuarios.length);
  },
  set(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value || '0';
  }
};

/* ======================================================
   SALVAGUARDA DE ENTRADAS CON CONTROL ANTIRREBOTES
====================================================== */
const savePorra = debounce((user, matchId, team, value) => {
  State.porras[`p_${user}_${matchId}_${team}`] = value;
  localStorage.setItem('f_porras', JSON.stringify(State.porras));
  haptic(6);
  Engine.run();
}, CONFIG.DEBOUNCE_MS);

/* ======================================================
   SISTEMA INTEGRAL DE EVENTOS Y DIÁLOGOS NATIVOS
====================================================== */
const Events = {
  init() {
    // Escucha táctil de entradas en porras
    document.addEventListener('input', event => {
      const target = event.target;
      if (target.classList.contains('prediction-input')) {
        savePorra(target.dataset.user, target.dataset.match, target.dataset.team, target.value);
      }
    });

    // Delegación estricta de pulsaciones (Acciones del clan)
    document.addEventListener('click', event => {
      const target = event.target.closest('[data-action]');
      if (!target) return;

      if (target.dataset.action === 'delete-user') {
        if (confirm(`¿Confirmas la eliminación completa de ${target.dataset.user}? Su registro de puntos se perderá.`)) {
          Users.remove(target.dataset.user);
        }
      }
    });

    // Vinculación explícita del botón superior de Refresco Síncrono
    document.getElementById('btn-refresh')?.addEventListener('click', () => {
      App.refresh();
    });

    // Gestión inteligente de sincronización e indicadores de red
    const indicatorIsland = document.getElementById('offline-indicator');
    const verificarConectividad = () => {
      if (indicatorIsland) {
        if (State.isOnline) {
          indicatorIsland.hidden = true;
          indicatorIsland.style.display = 'none';
        } else {
          indicatorIsland.hidden = false;
          indicatorIsland.style.display = 'flex';
        }
      }
    };

    verificarConectividad();

    window.addEventListener('online', () => {
      State.isOnline = true;
      verificarConectividad();
      Toast.success('Se restableció el enlace con los servidores');
      App.refresh();
    });

    window.addEventListener('offline', () => {
      State.isOnline = false;
      verificarConectividad();
      Toast.warning('Modo Local Activo: Datos guardados en el almacenamiento del dispositivo');
    });
  }
};

/* ======================================================
   INICIALIZACIÓN DE LA APLICACIÓN (Punto de entrada)
====================================================== */
const App = {
  async init() {
    if (State.initialized) return;
    State.initialized = true;

    Toast.init();
    Events.init();
    
    // Inyección de la barra deslizante de fases del Mundial (Filtros)
    const filtersBar = document.querySelector('.filters-bar');
    if (filtersBar) {
      filtersBar.innerHTML = CONFIG.GROUPS.map(g => `
        <button class="filter-btn ${State.grupoActivo === g ? 'active' : ''}" data-group="${g}">
          Grupo ${g}
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

    // Inyección del Dock de navegación inferior estilo iOS
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) {
      bottomNav.innerHTML = `
        <button class="nav-item active" id="nav-action-fixture">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>
          <span>Partidos</span>
        </button>
        <button class="nav-item" id="nav-action-user">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
          <span>+ Integrante</span>
        </button>
      `;

      document.getElementById('nav-action-fixture').addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        Toast.info('Visualizando fase de grupos');
      });

      document.getElementById('nav-action-user').addEventListener('click', () => {
        Modal.show('modal-add-user');
      });
    }

    // Inicialización interna del Modal estructural para añadir familiares
    const modalContainer = document.getElementById('modal-add-user');
    if (modalContainer) {
      modalContainer.innerHTML = `
        <div class="apple-card-metallic" style="width: 100%; max-width: 320px; border: 1px solid var(--border-brushed);">
          <h3 style="margin-bottom: 14px; font-size: 15px; font-weight: 700; text-align: center; color:var(--titanium-light);">Añadir un Competidor</h3>
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <input type="text" id="input-new-username" placeholder="Nombre del familiar" style="width: 100%; height: 40px; background: #000; border: 1px solid var(--border-brushed); border-radius: 8px; color: #fff; padding: 0 12px; font-size: 14px; outline: none;">
            <div style="display: flex; gap: 8px; margin-top: 4px;">
              <button id="btn-modal-close" style="flex: 1; height: 36px; background: rgba(255,255,255,0.04); border: 1px solid var(--border-metallic); border-radius: 8px; color: var(--titanium-gray); font-weight: 600; cursor: pointer; font-size: 13px;">Cerrar</button>
              <button id="btn-modal-add" style="flex: 1; height: 36px; background: var(--primary-accent); border: none; border-radius: 8px; color: #000; font-weight: 700; cursor: pointer; font-size: 13px;">Guardar</button>
            </div>
          </div>
        </div>
      `;

      document.getElementById('btn-modal-close').addEventListener('click', () => Modal.hide('modal-add-user'));
      document.getElementById('btn-modal-add').addEventListener('click', () => {
        const input = document.getElementById('input-new-username');
        if (Users.add(input.value)) {
          input.value = '';
          Modal.hide('modal-add-user');
        }
      });
    }

    // Carga asíncrona de partidos
    try {
      State.isLoading = true;
      const grid = document.getElementById('grid-fixture');
      if (grid) grid.innerHTML = `<div style="text-align:center; padding:30px; color:var(--titanium-gray); font-size:13px;">Sincronizando con la central del Mundial...</div>`;
      
      State.fixture = await API.getMatches();
      Engine.run();
    } catch (error) {
      console.error(error);
      Toast.error('Error al instanciar el fixture de partidos');
    } finally {
      State.isLoading = false;
    }
  },

  async refresh() {
    try {
      localStorage.removeItem(CONFIG.CACHE_KEY);
      Toast.info('Actualizando resultados...');
      State.fixture = await API.getMatches();
      Engine.run();
      Toast.success('Marcadores e indicadores actualizados');
    } catch (error) {
      console.error(error);
      Toast.error('Incapaz de refrescar los datos desde el servidor');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});