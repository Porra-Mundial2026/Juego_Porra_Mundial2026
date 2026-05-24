/* ======================================================
   WORLD CUP 2026 • APPLE EDITION • PRO ENGINE 2.0
   football-data.org powered • PWA Ready
   ====================================================== */

'use strict';

/* ======================================================
   1. CONFIGURATION
   ====================================================== */

const CONFIG = {
  API_KEY: '6a2a522096e243a4afec1a2de793e623',
  API_URL: 'https://api.football-data.org/v4/competitions/WC/matches',
  DATA_URL: './data/matches.json',
  CACHE_KEY: 'f_cache_matches',
  CACHE_TTL: 15 * 60 * 1000, // 15 minutos
  LOCK_MINUTES_BEFORE: 15,
  MAX_RETRY: 2,
  DEBOUNCE_MS: 400,
  GROUPS: ['A','B','C','D','E','F','G','H','I','J','K','L'],
  TIMEZONES: {
    'Canada': 'America/Toronto',
    'Mexico': 'America/Mexico_City',
    'United States': 'America/New_York',
    'USA': 'America/New_York'
  }
};

/* ======================================================
   2. STATE MANAGEMENT
   ====================================================== */

const State = {
  fixture: [],
  usuarios: JSON.parse(localStorage.getItem('f_usuarios')) || [],
  porras: JSON.parse(localStorage.getItem('f_porras')) || {},
  grupoActivo: 'A',
  filtroActivo: 'grupo', // 'grupo' | 'espana' | 'todos'
  isOnline: navigator.onLine,
  isLoading: false
};

/* ======================================================
   3. UTILITIES
   ====================================================== */

// Debounce: evita que una función se ejecute demasiadas veces
const debounce = (fn, ms = CONFIG.DEBOUNCE_MS) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), ms);
  };
};

// Escape HTML para prevenir XSS
const escapeHTML = (str) => {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
};

// Vibración háptica (si está disponible)
const haptic = (pattern = 10) => {
  if ('vibrate' in navigator) {
    try { navigator.vibrate(pattern); } catch {}
  }
};

// Formateador de fecha cacheado (mejor rendimiento)
const dateFormatters = new Map();
const getFormatter = (locale, options) => {
  const key = `${locale}_${JSON.stringify(options)}`;
  if (!dateFormatters.has(key)) {
    dateFormatters.set(key, new Intl.DateTimeFormat(locale, options));
  }
  return dateFormatters.get(key);
};

/* ======================================================
   4. TOAST SYSTEM (reemplaza alert)
   ====================================================== */

const Toast = {
  container: null,
  
  init() {
    this.container = document.getElementById('toast-container');
  },
  
  show(message, type = 'info', duration = 3000) {
    if (!this.container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-icon" aria-hidden="true">
        ${this.getIcon(type)}
      </div>
      <span>${escapeHTML(message)}</span>
    `;
    
    this.container.appendChild(toast);
    
    // Auto-remove
    setTimeout(() => {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 300);
    }, duration);
    
    haptic(type === 'error' ? [30, 50, 30] : 10);
  },
  
  getIcon(type) {
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };
    return icons[type] || icons.info;
  },
  
  success(msg) { this.show(msg, 'success'); },
  error(msg) { this.show(msg, 'error', 4000); },
  warning(msg) { this.show(msg, 'warning', 3500); },
  info(msg) { this.show(msg, 'info'); }
};

/* ======================================================
   5. MODAL SYSTEM (reemplaza confirm)
   ====================================================== */

const Modal = {
  show(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    
    // Focus trap
    const focusable = modal.querySelector('input, button');
    focusable?.focus();
  },
  
  hide(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
  },
  
  confirm(message, onConfirm, title = '¿Estás seguro?') {
    const modal = document.getElementById('modal-confirm');
    if (!modal) {
      // Fallback
      if (confirm(message)) onConfirm();
      return;
    }
    
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    
    const okBtn = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');
    
    const cleanup = () => {
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      this.hide('modal-confirm');
    };
    
    okBtn.onclick = () => { cleanup(); onConfirm(); };
    cancelBtn.onclick = () => cleanup();
    
    this.show('modal-confirm');
  }
};

/* ======================================================
   6. FLAGS CDN
   ====================================================== */

const obtenerBandera = (code) => {
  if (!code) return 'https://flagcdn.com/w160/un.png';
  return `https://flagcdn.com/w160/${code.toLowerCase()}.png`;
};

/* ======================================================
   7. CLOCKS
   ====================================================== */

const Clock = {
  interval: null,
  
  getTime(timezone) {
    try {
      return getFormatter('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: timezone || 'Europe/Madrid'
      }).format(new Date());
    } catch {
      return '--:--';
    }
  },
  
  start() {
    this.update();
    this.interval = setInterval(() => this.update(), 1000);
  },
  
  update() {
    document.querySelectorAll('.live-clock').forEach(clock => {
      const tz = clock.dataset.timezone;
      clock.textContent = `🕒 ${this.getTime(tz)}`;
    });
  }
};

/* ======================================================
   8. API LAYER (con cache + retry)
   ====================================================== */

const API = {
  async fetchWithRetry(url, options = {}, retries = CONFIG.MAX_RETRY) {
    for (let i = 0; i <= retries; i++) {
      try {
        const response = await fetch(url, options);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response;
      } catch (err) {
        if (i === retries) throw err;
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
  },
  
  getCache() {
    try {
      const cached = localStorage.getItem(CONFIG.CACHE_KEY);
      if (!cached) return null;
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp > CONFIG.CACHE_TTL) return null;
      return data;
    } catch {
      return null;
    }
  },
  
  setCache(data) {
    try {
      localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch {}
  },
  
  async getMatches() {
    // 1. Intentar cache
    const cached = this.getCache();
    if (cached) {
      console.log('✅ Cache hit');
      return cached;
    }
    
    // 2. Intentar API
    try {
      const response = await this.fetchWithRetry(CONFIG.API_URL, {
        headers: { 'X-Auth-Token': CONFIG.API_KEY }
      });
      const data = await response.json();
      
      if (data.matches && data.matches.length > 0) {
        const transformed = this.transformAPI(data.matches);
        this.setCache(transformed);
        return transformed;
      }
      
      throw new Error('API vacía');
    } catch (err) {
      console.warn('⚠️ API falló, usando JSON local:', err.message);
      return await this.getLocalJSON();
    }
  },
  
  async getLocalJSON() {
    try {
      const response = await fetch(CONFIG.DATA_URL);
      if (!response.ok) throw new Error('JSON local no disponible');
      let data = await response.json();
      
      // Soporta tanto array como objeto único
      if (!Array.isArray(data)) data = [data];
      
      return this.transformLocal(data);
    } catch (err) {
      console.error('❌ Error cargando JSON local:', err);
      Toast.error('No se pudieron cargar los partidos');
      return [];
    }
  },
  
  transformAPI(matches) {
    return matches.map((m, index) => {
      const home = m.homeTeam || {};
      const away = m.awayTeam || {};
      const utc = new Date(m.utcDate);
      
      return {
        id: m.id || index,
        grupo: this.detectGroup(m, index),
        fecha: getFormatter('es-ES', {
          day: '2-digit', month: 'short', year: 'numeric'
        }).format(utc),
        hora: getFormatter('es-ES', {
          hour: '2-digit', minute: '2-digit'
        }).format(utc),
        estadio: m.venue || 'World Cup Stadium',
        ciudad: m.area?.name || '',
        timezone: this.detectTimezone(m.area?.name),
        eqA: home.shortName || home.name || 'TBD',
        eqB: away.shortName || away.name || 'TBD',
        flagA: obtenerBandera(home.tla || home.crest),
        flagB: obtenerBandera(away.tla || away.crest),
        esp: home.name === 'Spain' || away.name === 'Spain',
        scoreA: m.status === 'FINISHED' ? m.score?.fullTime?.home : null,
        scoreB: m.status === 'FINISHED' ? m.score?.fullTime?.away : null,
        utcDate: m.utcDate,
        status: m.status
      };
    });
  },
  
  transformLocal(matches) {
    return matches.map((m, index) => {
      const home = m.homeTeam || {};
      const away = m.awayTeam || {};
      const utc = m.kickoffUTC ? new Date(m.kickoffUTC) : new Date();
      
      return {
        id: m.id || index,
        grupo: m.group || CONFIG.GROUPS[index % CONFIG.GROUPS.length],
        fecha: getFormatter('es-ES', {
          day: '2-digit', month: 'short', year: 'numeric'
        }).format(utc),
        hora: m.localTime?.stadium || getFormatter('es-ES', {
          hour: '2-digit', minute: '2-digit'
        }).format(utc),
        estadio: m.venue?.stadium || 'World Cup Stadium',
        ciudad: m.venue?.city || '',
        timezone: m.localTime?.timezone || 'Europe/Madrid',
        eqA: home.name || 'TBD',
        eqB: away.name || 'TBD',
        flagA: obtenerBandera(home.code),
        flagB: obtenerBandera(away.code),
        esp: home.name === 'España' || away.name === 'España' ||
             home.name === 'Spain' || away.name === 'Spain',
        scoreA: m.score?.home ?? null,
        scoreB: m.score?.away ?? null,
        utcDate: m.kickoffUTC || utc.toISOString(),
        status: m.status || 'SCHEDULED'
      };
    });
  },
  
  detectGroup(match, index) {
    if (match.group) return match.group.replace('GROUP_', '');
    return CONFIG.GROUPS[index % CONFIG.GROUPS.length];
  },
  
  detectTimezone(city) {
    if (!city) return 'Europe/Madrid';
    for (const [key, tz] of Object.entries(CONFIG.TIMEZONES)) {
      if (city.includes(key)) return tz;
    }
    return 'Europe/Madrid';
  }
};

/* ======================================================
   9. USERS MANAGEMENT
   ====================================================== */

const Users = {
  add(nombre) {
    nombre = nombre.trim();
    if (!nombre) {
      Toast.warning('Escribe un nombre');
      return false;
    }
    
    if (nombre.length > 20) {
      Toast.warning('Máximo 20 caracteres');
      return false;
    }
    
    if (State.usuarios.some(u => u.toLowerCase() === nombre.toLowerCase())) {
      Toast.warning('Ese participante ya existe');
      return false;
    }
    
    State.usuarios.push(nombre);
    this.save();
    Toast.success(`${nombre} añadido`);
    haptic(20);
    return true;
  },
  
  remove(nombre) {
    Modal.confirm(
      `¿Eliminar a ${nombre}? Se borrarán todas sus predicciones.`,
      () => {
        State.usuarios = State.usuarios.filter(u => u !== nombre);
        // Borrar porras del usuario
        Object.keys(State.porras).forEach(key => {
          if (key.includes(`_${nombre}_`)) delete State.porras[key];
        });
        this.save();
        localStorage.setItem('f_porras', JSON.stringify(State.porras));
        Engine.run();
        Toast.info(`${nombre} eliminado`);
      },
      'Eliminar participante'
    );
  },
  
  save() {
    localStorage.setItem('f_usuarios', JSON.stringify(State.usuarios));
    Engine.run();
  }
};

/* ======================================================
   10. POINTS ENGINE
   ====================================================== */

const Engine = {
  run() {
    const ranking = this.calculateRanking();
    this.renderLeaderboard(ranking);
    this.renderStats(ranking);
    Fixture.render();
    Stats.update();
  },
  
  calculateRanking() {
    const ranking = {};
    
    State.usuarios.forEach(user => {
      ranking[user] = {
        puntos: 0, exactos: 0, acertados: 0,
        golesExactos: 0, diferenciaExacta: 0,
        bonusEspana: 0, fallados: 0, partidos: 0,
        porcentaje: 0, rachaActual: 0, mejorRacha: 0
      };
    });
    
    State.fixture.forEach(p => {
      if (p.scoreA == null || p.scoreB == null) return;
      
      State.usuarios.forEach(user => {
        const pA = parseInt(State.porras[`p_${user}_${p.id}_A`]);
        const pB = parseInt(State.porras[`p_${user}_${p.id}_B`]);
        
        if (isNaN(pA) || isNaN(pB)) {
          ranking[user].fallados++;
          return;
        }
        
        ranking[user].partidos++;
        let puntos = this.calculateMatchPoints(p, pA, pB, ranking[user]);
        ranking[user].puntos += puntos;
      });
    });
    
    // Calcular porcentajes
    Object.values(ranking).forEach(r => {
      r.porcentaje = r.partidos > 0
        ? Math.round((r.acertados / r.partidos) * 100)
        : 0;
    });
    
    return ranking;
  },
  
  calculateMatchPoints(p, pA, pB, stats) {
    let puntos = 0;
    
    const ganadorReal = p.scoreA > p.scoreB ? 'A' : p.scoreA < p.scoreB ? 'B' : 'E';
    const ganadorUser = pA > pB ? 'A' : pA < pB ? 'B' : 'E';
    
    // Resultado exacto (+5)
    if (pA === p.scoreA && pB === p.scoreB) {
      puntos += 5;
      stats.exactos++;
    }
    
    // Ganador (+2)
    if (ganadorReal === ganadorUser) {
      puntos += 2;
      stats.acertados++;
    }
    
    // Goles exactos (+1 cada uno)
    if (pA === p.scoreA) { puntos += 1; stats.golesExactos++; }
    if (pB === p.scoreB) { puntos += 1; stats.golesExactos++; }
    
    // Diferencia exacta (+1)
    if (p.scoreA - p.scoreB === pA - pB) {
      puntos += 1;
      stats.diferenciaExacta++;
    }
    
    // Bonus España (+3)
    if (p.esp && pA === p.scoreA && pB === p.scoreB) {
      puntos += 3;
      stats.bonusEspana++;
    }
    
    // Rachas
    if (puntos > 0) {
      stats.rachaActual++;
      if (stats.rachaActual > stats.mejorRacha) {
        stats.mejorRacha = stats.rachaActual;
      }
    } else {
      stats.rachaActual = 0;
    }
    
    return puntos;
  },
  
  renderLeaderboard(ranking) {
    const cont = document.getElementById('tabla-clasificacion');
    if (!cont) return;
    
    const ordenados = Object.entries(ranking).sort((a, b) => b[1].puntos - a[1].puntos);
    
    if (ordenados.length === 0) {
      cont.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>No hay participantes aún</span>
        </div>
      `;
      return;
    }
    
    cont.innerHTML = ordenados.map(([name, r], index) => `
      <div class="leaderboard-item" data-user="${escapeHTML(name)}">
        <div class="leader-rank">${index + 1}</div>
        <div class="leader-info">
          <div class="leader-name">${escapeHTML(name)}</div>
          <div class="leader-stats">
            🎯 ${r.exactos} · ✅ ${r.acertados} · 🔥 ${r.mejorRacha}
          </div>
        </div>
        <div class="score-pill">${r.puntos}</div>
        <button
          class="icon-button-sm delete-btn"
          data-action="delete-user"
          data-user="${escapeHTML(name)}"
          aria-label="Eliminar ${escapeHTML(name)}"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    `).join('');
  },
  
  renderStats(ranking) {
    const box = document.getElementById('estadisticas-avanzadas');
    if (!box) return;
    
    const entries = Object.entries(ranking);
    if (entries.length === 0) {
      box.innerHTML = '';
      return;
    }
    
    const lider = entries.sort((a, b) => b[1].puntos - a[1].puntos)[0];
    
    box.innerHTML = `
      <div class="advanced-stats-grid">
        <div class="stat-card">
          <div class="stat-title">👑 Líder</div>
          <div class="stat-value">${escapeHTML(lider[0])}</div>
        </div>
        <div class="stat-card">
          <div class="stat-title">🏆 Puntos</div>
          <div class="stat-value">${lider[1].puntos}</div>
        </div>
        <div class="stat-card">
          <div class="stat-title">🎯 Exactos</div>
          <div class="stat-value">${lider[1].exactos}</div>
        </div>
        <div class="stat-card">
          <div class="stat-title">🔥 Mejor racha</div>
          <div class="stat-value">${lider[1].mejorRacha}</div>
        </div>
      </div>
    `;
  }
};

/* ======================================================
   11. FIXTURE RENDERING
   ====================================================== */

const Fixture = {
  isLocked(partido) {
    if (!partido.utcDate) return false;
    const diff = new Date(partido.utcDate).getTime() - Date.now();
    return diff <= CONFIG.LOCK_MINUTES_BEFORE * 60 * 1000;
  },
  
  getFiltered() {
    if (State.filtroActivo === 'todos') return State.fixture;
    if (State.filtroActivo === 'espana') return State.fixture.filter(p => p.esp);
    return State.fixture.filter(p => p.grupo === State.grupoActivo);
  },
  
  render() {
    const grid = document.getElementById('grid-fixture');
    if (!grid) return;
    
    const partidos = this.getFiltered();
    
    const contador = document.getElementById('txt-contador');
    if (contador) {
      contador.textContent = `${partidos.length} ${partidos.length === 1 ? 'partido' : 'partidos'}`;
    }
    
    if (partidos.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 9h6v6H9z" />
          </svg>
          <span>No hay partidos para este filtro</span>
        </div>
      `;
      return;
    }
    
    // Usar DocumentFragment para mejor rendimiento
    const fragment = document.createDocumentFragment();
    
    partidos.forEach(p => {
      const card = document.createElement('article');
      card.className = 'match-card glass-card';
      card.setAttribute('role', 'listitem');
      card.innerHTML = this.renderCard(p);
      fragment.appendChild(card);
    });
    
    grid.innerHTML = '';
    grid.appendChild(fragment);
  },
  
  renderCard(p) {
    const bloqueado = this.isLocked(p);
    const estadoBadge = this.getEstadoBadge(p);
    
    return `
      <div class="match-header">
        <div>
          <div class="flex gap-2 flex-wrap">
            <span class="group-pill">Grupo ${escapeHTML(p.grupo)}</span>
            ${p.esp ? '<span class="spain-pill">🇪🇸 ESPAÑA</span>' : ''}
            ${estadoBadge}
          </div>
          <div class="stadium-text">📍 ${escapeHTML(p.estadio)}</div>
          ${p.ciudad ? `<div class="stadium-timezone">${escapeHTML(p.ciudad)}</div>` : ''}
        </div>
        <div class="text-right">
          <div class="date-text">${escapeHTML(p.fecha)}</div>
          <div class="hour-text">${escapeHTML(p.hora)}</div>
          <div class="live-clock" data-timezone="${escapeHTML(p.timezone)}">🕒 --:--</div>
        </div>
      </div>
      
      <div class="teams-grid">
        <div class="team-side">
          <img
            src="${p.flagA}"
            class="flag-img"
            loading="lazy"
            alt="Bandera ${escapeHTML(p.eqA)}"
            onerror="this.src='https://flagcdn.com/w160/un.png'"
          />
          <div class="team-name">${escapeHTML(p.eqA)}</div>
        </div>
        <div class="score-center">
          ${p.scoreA != null
            ? `<div class="score-live">${p.scoreA} - ${p.scoreB}</div>`
            : `<div class="vs-text">VS</div>`
          }
        </div>
        <div class="team-side">
          <img
            src="${p.flagB}"
            class="flag-img"
            loading="lazy"
            alt="Bandera ${escapeHTML(p.eqB)}"
            onerror="this.src='https://flagcdn.com/w160/un.png'"
          />
          <div class="team-name">${escapeHTML(p.eqB)}</div>
        </div>
      </div>
      
      ${State.usuarios.length > 0 ? `
        <div class="predictions">
          ${State.usuarios.map(user => this.renderPredictionRow(user, p, bloqueado)).join('')}
        </div>
      ` : `
        <div class="empty-state" style="padding: 1rem;">
          <span>Añade participantes para empezar</span>
        </div>
      `}
    `;
  },
  
  renderPredictionRow(user, p, bloqueado) {
    const valA = State.porras[`p_${user}_${p.id}_A`] ?? '';
    const valB = State.porras[`p_${user}_${p.id}_B`] ?? '';
    
    return `
      <div class="prediction-row">
        <div class="prediction-user">${escapeHTML(user)}</div>
        <div class="prediction-inputs">
          <input
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            maxlength="2"
            value="${valA}"
            class="prediction-input"
            data-user="${escapeHTML(user)}"
            data-match="${p.id}"
            data-team="A"
            ${bloqueado ? 'disabled' : ''}
            aria-label="Goles ${escapeHTML(p.eqA)} para ${escapeHTML(user)}"
          />
          <span aria-hidden="true">-</span>
          <input
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            maxlength="2"
            value="${valB}"
            class="prediction-input"
            data-user="${escapeHTML(user)}"
            data-match="${p.id}"
            data-team="B"
            ${bloqueado ? 'disabled' : ''}
            aria-label="Goles ${escapeHTML(p.eqB)} para ${escapeHTML(user)}"
          />
        </div>
      </div>
    `;
  },
  
  getEstadoBadge(p) {
    const estados = {
      'IN_PLAY': '<span class="live-pill-mini"><span class="live-dot-mini"></span>EN VIVO</span>',
      'PAUSED': '<span class="spain-pill">DESCANSO</span>',
      'FINISHED': '<span class="group-pill">FINALIZADO</span>'
    };
    return estados[p.status] || '';
  }
};

/* ======================================================
12. FILTERS & TABS (con <select> desplegable)
====================================================== */
const Filters = {
  renderTabs() {
    const select = document.getElementById('select-grupo');
    if (!select) return;
    
    // Solo regenerar si está vacío
    if (select.options.length === 0) {
      select.innerHTML = CONFIG.GROUPS.map(g => 
        `<option value="${g}" ${State.grupoActivo === g ? 'selected' : ''}>Grupo ${g}</option>`
      ).join('');
    } else {
      // Solo actualizar el selected
      select.value = State.grupoActivo;
    }
  },
  setActiveFilter(filtro) {
    State.filtroActivo = filtro;
    this.updateButtons();
    if ('startViewTransition' in document) {
      document.startViewTransition(() => Fixture.render());
    } else {
      Fixture.render();
    }
  },
  selectGroup(g) {
    State.grupoActivo = g;
    State.filtroActivo = 'grupo';
    this.updateButtons();
    if ('startViewTransition' in document) {
      document.startViewTransition(() => Fixture.render());
    } else {
      Fixture.render();
    }
  },
  updateButtons() {
    ['grupo', 'espana', 'todos'].forEach(btn => {
      const el = document.getElementById(`btn-filtro-${btn}`);
      if (!el) return;
      el.className = State.filtroActivo === btn
        ? 'filter-button active-filter'
        : 'filter-button';
      el.setAttribute('aria-selected', State.filtroActivo === btn);
    });
  }
};

/* ======================================================
   13. STATS (Hero)
   ====================================================== */

const Stats = {
  update() {
    const total = State.fixture.length;
    const jugados = State.fixture.filter(p =>
      p.scoreA != null && p.scoreB != null
    ).length;
    const live = State.fixture.filter(p => p.status === 'IN_PLAY').length;
    
    this.animateNumber('totalPartidos', total);
    this.animateNumber('totalJugados', jugados);
    this.animateNumber('totalLive', live);
    this.animateNumber('totalUsers', State.usuarios.length);
  },
  
  animateNumber(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    const current = parseInt(el.textContent) || 0;
    if (current === target) return;
    
    const duration = 500;
    const start = performance.now();
    
    const step = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      el.textContent = Math.round(current + (target - current) * progress);
      if (progress < 1) requestAnimationFrame(step);
    };
    
    requestAnimationFrame(step);
  }
};

/* ======================================================
   14. SAVE PREDICTIONS (con debounce)
   ====================================================== */

const savePorra = debounce((user, matchId, team, value) => {
  // Validar input
  const num = parseInt(value);
  if (value !== '' && (isNaN(num) || num < 0 || num > 99)) {
    Toast.warning('Número inválido');
    return;
  }
  
  State.porras[`p_${user}_${matchId}_${team}`] = value;
  localStorage.setItem('f_porras', JSON.stringify(State.porras));
  
  haptic(5);
  Engine.run();
}, CONFIG.DEBOUNCE_MS);

/* ======================================================
   15. WEB SHARE API
   ====================================================== */

const Share = {
  async open() {
    const ranking = Engine.calculateRanking();
    const ordenados = Object.entries(ranking).sort((a, b) => b[1].puntos - a[1].puntos);
    
    if (ordenados.length === 0) {
      Toast.warning('Añade participantes primero');
      return;
    }
    
    const texto = ordenados.slice(0, 5).map(([name, r], i) =>
      `${['🥇','🥈','🥉','4️⃣','5️⃣'][i]} ${name}: ${r.puntos} pts`
    ).join('\n');
    
    const shareData = {
      title: '🏆 World Cup 2026 - Clasificación',
      text: `Clasificación Familiar:\n\n${texto}\n\n🌐 World Cup Predictor 2026`
    };
    
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        Toast.success('¡Compartido!');
      } else {
        await navigator.clipboard.writeText(shareData.text);
        Toast.success('Copiado al portapapeles');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        Toast.error('No se pudo compartir');
      }
    }
  }
};

/* ======================================================
   16. OFFLINE DETECTION
   ====================================================== */

const Network = {
  init() {
    window.addEventListener('online', () => this.update(true));
    window.addEventListener('offline', () => this.update(false));
    this.update(navigator.onLine);
  },
  
  update(online) {
    State.isOnline = online;
    const banner = document.getElementById('offline-banner');
    if (banner) banner.hidden = online;
    
    if (!online) {
      Toast.warning('Sin conexión · Datos guardados disponibles');
    } else {
      Toast.success('Conexión restaurada');
    }
  }
};

/* ======================================================
   17. BOTTOM NAVIGATION
   ====================================================== */

const BottomNav = {
  init() {
    document.querySelectorAll('.bottom-nav-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const section = e.currentTarget.dataset.section;
        this.activate(section);
      });
    });
  },
  
  activate(section) {
    document.querySelectorAll('.bottom-nav-item').forEach(b => {
      b.classList.toggle('active', b.dataset.section === section);
    });
    
    const targets = {
      matches: '#grid-fixture',
      leaderboard: '#tabla-clasificacion',
      users: '#lista-usuarios'
    };
    
    const target = document.querySelector(targets[section]);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    if (section === 'users') {
      Modal.show('modal-add-user');
    }
  }
};

/* ======================================================
   18. EVENT DELEGATION (mejor rendimiento)
   ====================================================== */

const Events = {
  init() {
    // Event delegation global
    document.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      
      const action = target.dataset.action;
      
      switch (action) {
        case 'select-group':
          Filters.selectGroup(target.dataset.group);
          break;
        case 'delete-user':
          Users.remove(target.dataset.user);
          break;
        case 'refresh':
          App.refresh();
          break;
// Select de grupos
const selectGrupo = document.getElementById('select-grupo');
if (selectGrupo) {
  selectGrupo.addEventListener('change', (e) => {
    Filters.selectGroup(e.target.value);
  });
}
      }
    });
    
    // Cambio en inputs de predicciones (con debounce)
    document.addEventListener('input', (e) => {
      if (e.target.classList.contains('prediction-input')) {
        const { user, match, team } = e.target.dataset;
        savePorra(user, parseInt(match), team, e.target.value);
      }
    });
    
    // Enter en inputs de predicciones → saltar al siguiente
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.classList.contains('prediction-input')) {
        e.preventDefault();
        const inputs = [...document.querySelectorAll('.prediction-input:not([disabled])')];
        const idx = inputs.indexOf(e.target);
        if (idx >= 0 && idx < inputs.length - 1) {
          inputs[idx + 1].focus();
        }
      }
    });
    
    // Cerrar modales
    document.querySelectorAll('[data-close-modal]').forEach(el => {
      el.addEventListener('click', () => {
        el.closest('.modal').hidden = true;
        document.body.style.overflow = '';
      });
    });
    
    // Form añadir usuario
    const form = document.getElementById('form-add-user');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('input-usuario-modal');
        if (Users.add(input.value)) {
          input.value = '';
          Modal.hide('modal-add-user');
        }
      });
    }
    
    // Botón refresh
    document.getElementById('btn-refresh')?.addEventListener('click', () => App.refresh());
    
    // Botón share
    document.getElementById('btn-share')?.addEventListener('click', () => Share.open());
    
    // FAB añadir usuario
    document.getElementById('fab-add-user')?.addEventListener('click', () => {
      Modal.show('modal-add-user');
    });
    
    // Botón abrir modal desde sidebar
    document.getElementById('btn-open-add-user')?.addEventListener('click', () => {
      Modal.show('modal-add-user');
    });
    
    // Filtros
    document.getElementById('btn-filtro-grupo')?.addEventListener('click', () => Filters.setActiveFilter('grupo'));
    document.getElementById('btn-filtro-espana')?.addEventListener('click', () => Filters.setActiveFilter('espana'));
    document.getElementById('btn-filtro-todos')?.addEventListener('click', () => Filters.setActiveFilter('todos'));
    
    // ESC para cerrar modales
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal:not([hidden])').forEach(m => {
          m.hidden = true;
          document.body.style.overflow = '';
        });
      }
    });
  }
};

/* ======================================================
   19. APP CONTROLLER
   ====================================================== */

const App = {
  async init() {
    console.log('🚀 World Cup Predictor 2026 • Apple Ultra');
    
    // Inicializar módulos
    Toast.init();
    Network.init();
    BottomNav.init();
    Events.init();
    
    // Mostrar skeletons
    this.showSkeletons();
    
    try {
      // Cargar datos
      State.fixture = await API.getMatches();
      
      if (State.fixture.length === 0) {
        Toast.warning('No hay partidos disponibles');
      } else {
        Toast.success(`${State.fixture.length} partidos cargados`);
      }
      
      // Renderizar
      Filters.renderTabs();
      Filters.updateButtons();
      Clock.start();
      Engine.run();
      
      // Auto-refresh cada 5 minutos si hay partidos en vivo
      this.startAutoRefresh();
      
    } catch (err) {
      console.error('❌ Error inicialización:', err);
      Toast.error('Error al cargar la aplicación');
    }
  },
  
  showSkeletons() {
    const grid = document.getElementById('grid-fixture');
    if (grid) {
      grid.innerHTML = Array(3).fill(`
        <div class="skeleton-match glass-card" aria-hidden="true"></div>
      `).join('');
    }
  },
  
  startAutoRefresh() {
    const hayLive = State.fixture.some(p => p.status === 'IN_PLAY');
    if (hayLive) {
      setInterval(() => this.refresh(false), 60000); // Cada minuto
    }
  },
  
  async refresh(showToast = true) {
    if (State.isLoading) return;
    State.isLoading = true;
    
    const btn = document.getElementById('btn-refresh');
    if (btn) btn.disabled = true;
    
    try {
      // Limpiar cache para forzar refresco
      localStorage.removeItem(CONFIG.CACHE_KEY);
      State.fixture = await API.getMatches();
      Engine.run();
      Clock.update();
      if (showToast) Toast.success('Datos actualizados');
      haptic([10, 50, 10]);
    } catch (err) {
      if (showToast) Toast.error('Error al actualizar');
    } finally {
      State.isLoading = false;
      if (btn) btn.disabled = false;
    }
  }
};

/* ======================================================
   20. INICIALIZACIÓN
   ====================================================== */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}

// Exponer funciones globales necesarias (mínimas)
window.darDeBaja = Users.remove.bind(Users);
window.resetearTodo = () => {
  Modal.confirm(
    '¿Eliminar TODOS los datos? Esta acción no se puede deshacer.',
    () => {
      localStorage.clear();
      location.reload();
    },
    'Resetear aplicación'
  );
};