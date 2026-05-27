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
  GROUPS: ['A','B','C','D','E','F','G','H','I','J','K','L','R32','R16','QF','SF','F'],
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
   MODALS / CLOCK / FLAGS
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
  if (!code || code === 'TBD' || code === 'UN') return 'https://flagcdn.com/w160/un.png';
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
   API LAYER (Fusión inteligente: Esqueleto + Datos API)
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

    // Primero cargamos de forma obligatoria el esqueleto maestro local de 104 partidos
    const localSkeleton = await this.getLocalJSONSkeleton();

    try {
      const response = await this.fetchWithRetry(CONFIG.API_URL, {
        headers: { 'X-Auth-Token': CONFIG.API_KEY }
      });
      const data = await response.json();
      
      if (data && data.matches && Array.isArray(data.matches)) {
        // Ordenamos cronológicamente los partidos de la API para alinearlos 1-a-1 con el fixture
        const apiMatchesSorted = data.matches.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
        
        // Si no se pudo leer el esqueleto local, usamos directamente la transformación limpia de la API
        if (localSkeleton.length === 0) {
          const transformed = this.transformAPI(apiMatchesSorted);
          this.setCache(transformed);
          return transformed;
        }

        // FUSIÓN MÁGICA: Inyectamos resultados y equipos confirmados sobre el esqueleto inicial
        const mergedMatches = localSkeleton.map((skMatch, idx) => {
          const apiMatch = apiMatchesSorted[idx];
          if (!apiMatch) return skMatch;

          const home = apiMatch.homeTeam || {};
          const away = apiMatch.awayTeam || {};

          // Solo sustituimos nombres si la API ya tiene equipos reales asignados (no nulos ni TBD)
          const apiHasRealHome = home.tla && home.tla !== 'TBD';
          const apiHasRealAway = away.tla && away.tla !== 'TBD';

          const isLiveOrDone = apiMatch.status === 'FINISHED' || apiMatch.status === 'IN_PLAY' || apiMatch.status === 'LIVE';

          return {
            ...skMatch,
            grupo: this.detectGroup(apiMatch, idx),
            status: apiMatch.status || skMatch.status,
            scoreA: isLiveOrDone ? apiMatch.score?.fullTime?.home : null,
            scoreB: isLiveOrDone ? apiMatch.score?.fullTime?.away : null,
            eqA: apiHasRealHome ? (home.shortName || home.name) : skMatch.eqA,
            eqB: apiHasRealAway ? (away.shortName || away.name) : skMatch.eqB,
            flagA: apiHasRealHome ? obtenerBandera(home.tla || home.code) : skMatch.flagA,
            flagB: apiHasRealAway ? obtenerBandera(away.tla || away.code) : skMatch.flagB,
            esp: home.name === 'Spain' || away.name === 'Spain' || home.shortName === 'España' || away.shortName === 'España' || skMatch.esp
          };
        });

        this.setCache(mergedMatches);
        return mergedMatches;
      }
      throw new Error('Formato API inválido');
    } catch (error) {
      console.warn('API bloqueada o sin internet → Mostrando esqueleto puro sin resultados vivos.', error);
      return localSkeleton;
    }
  },

  async getLocalJSONSkeleton() {
    try {
      const response = await fetch(CONFIG.DATA_URL);
      if (!response.ok) throw new Error('No local matches.json file');
      const data = await response.json();
      
      let arrayPartidos = [];
      if (data && data.matches && Array.isArray(data.matches)) {
        arrayPartidos = data.matches;
      } else if (Array.isArray(data)) {
        arrayPartidos = data;
      }
      return this.transformAPI(arrayPartidos);
    } catch (error) {
      console.error('Error crítico leyendo esqueleto local:', error);
      return [];
    }
  },

  transformAPI(matches) {
    if (!Array.isArray(matches)) return [];
    return matches.map((match, index) => {
      const home = match.homeTeam || {};
      const away = match.awayTeam || {};
      const utc = match.utcDate ? new Date(match.utcDate) : new Date();
      const calculatedGroup = this.detectGroup(match, index);

      return {
        id: match.id ?? index + 1,
        grupo: calculatedGroup,
        fecha: getFormatter('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(utc),
        hora: getFormatter('es-ES', { hour: '2-digit', minute: '2-digit' }).format(utc),
        estadio: match.venue || 'Estadio del Mundial',
        ciudad: match.area?.name || '',
        timezone: this.detectTimezone(match.area?.name),
        eqA: home.shortName || home.name || `Por determinar`,
        eqB: away.shortName || away.name || `Por determinar`,
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
    const stage = match.stage || '';
    const g = match.group || match.grupo || '';
    
    if (g && g.includes('GROUP_')) return g.replace('GROUP_', '');
    if (['A','B','C','D','E','F','G','H','I','J','K','L','R32','R16','QF','SF','F'].includes(g)) return g;

    if (stage === 'LAST_32' || stage === 'ROUND_OF_32' || stage === 'Round of 32') return 'R32';
    if (stage === 'LAST_16' || stage === 'ROUND_OF_16' || stage === 'Round of 16') return 'R16';
    if (stage === 'QUARTER_FINALS' || stage === 'Quarter-finals') return 'QF';
    if (stage === 'SEMI_FINALS' || stage === 'Semi-finals') return 'SF';
    if (stage === 'THIRD_PLACE' || stage === 'FINAL' || stage === 'Final') return 'F';

    // Fallback secuencial matemático para asegurar los 104 partidos ordenados
    if (index >= 72) {
      if (index < 88) return 'R32';  // 16 partidos de dieciseisavos
      if (index < 96) return 'R16';  // 8 partidos de octavos
      if (index < 100) return 'QF';  // 4 partidos de cuartos
      if (index < 102) return 'SF';  // 2 partidos de semifinales
      return 'F';                    // 3º puesto y Final
    }
    return 'A';
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
   FIXTURE
====================================================== */
const Fixture = {
  isLocked(match) {
    if (!match.utcDate) return false;
    return (new Date(match.utcDate).getTime() - Date.now()) <= CONFIG.LOCK_MINUTES_BEFORE * 60000;
  },

  getFiltered() {
    return State.fixture.filter(match => match.grupo === State.grupoActivo);
  },

  render() {
    const grid = document.getElementById('grid-fixture');
    if (!grid) return;

    const matches = this.getFiltered();
    if (matches.length === 0) {
      grid.innerHTML = `<div style="text-align:center; padding:30px; opacity:0.5;">No hay partidos cargados para esta fase todavía.</div>`;
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

    const getFaseTitle = (g) => {
      const dict = { 'R32': '16AVOS DE FINAL', 'R16': 'OCTAVOS DE FINAL', 'QF': 'CUARTOS DE FINAL', 'SF': 'SEMIFINALES', 'F': 'FINAL / 3