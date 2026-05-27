'use strict';

/* ======================================================
   WORLD CUP 2026 • MOBILE APP EDITION 3.0
   Capacitor + Android + iPhone Ready
====================================================== */

const CONFIG = {
  API_KEY: '6a2a522096e243a4afec1a2de793e623',

  API_URL:
    'https://api.football-data.org/v4/competitions/WC/matches',

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

  usuarios:
    JSON.parse(localStorage.getItem('f_usuarios')) || [],

  porras:
    JSON.parse(localStorage.getItem('f_porras')) || {},

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

    timeout = setTimeout(() => {
      fn.apply(this, args);
    }, ms);
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
    try {
      navigator.vibrate(pattern);
    } catch {}
  }
};


const sleep = (ms) =>
  new Promise(resolve => setTimeout(resolve, ms));


/* ======================================================
   DATE FORMATTERS CACHE
====================================================== */

const dateFormatters = new Map();

const getFormatter = (locale, options) => {
  const key = `${locale}_${JSON.stringify(options)}`;

  if (!dateFormatters.has(key)) {
    dateFormatters.set(
      key,
      new Intl.DateTimeFormat(locale, options)
    );
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

      document.body.appendChild(this.container);
    }
  },


  show(message, type = 'info', duration = 3000) {

    if (!this.container) return;

    const toast = document.createElement('div');

    toast.className = `toast toast-${type}`;

    toast.innerHTML = `
      <div class="toast-icon">
        ${this.getIcon(type)}
      </div>

      <span>${escapeHTML(message)}</span>
    `;

    this.container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('toast-visible');
    });

    setTimeout(() => {
      toast.classList.remove('toast-visible');

      setTimeout(() => {
        toast.remove();
      }, 300);

    }, duration);

    haptic(type === 'error' ? [40, 40, 40] : 10);
  },


  getIcon(type) {
    return {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    }[type] || 'ℹ';
  },


  success(msg) {
    this.show(msg, 'success');
  },

  error(msg) {
    this.show(msg, 'error', 4000);
  },

  warning(msg) {
    this.show(msg, 'warning', 3500);
  },

  info(msg) {
    this.show(msg, 'info');
  }
};


/* ======================================================
   MODALS
====================================================== */

const Modal = {

  show(id) {
    const modal = document.getElementById(id);

    if (!modal) return;

    modal.hidden = false;

    document.body.style.overflow = 'hidden';

    modal.querySelector('input, button')?.focus();
  },


  hide(id) {
    const modal = document.getElementById(id);

    if (!modal) return;

    modal.hidden = true;

    document.body.style.overflow = '';
  },


  confirm(message, onConfirm, title = '¿Estás seguro?') {

    const modal = document.getElementById('modal-confirm');

    if (!modal) {
      if (confirm(message)) onConfirm();
      return;
    }

    document.getElementById('confirm-title').textContent = title;

    document.getElementById('confirm-message').textContent = message;

    const ok = document.getElementById('confirm-ok');
    const cancel = document.getElementById('confirm-cancel');

    const cleanup = () => {
      ok.onclick = null;
      cancel.onclick = null;
      this.hide('modal-confirm');
    };

    ok.onclick = () => {
      cleanup();
      onConfirm();
    };

    cancel.onclick = cleanup;

    this.show('modal-confirm');
  }
};


/* ======================================================
   FLAGS
====================================================== */

const obtenerBandera = (code) => {
  if (!code) {
    return 'https://flagcdn.com/w160/un.png';
  }

  return `https://flagcdn.com/w160/${code.toLowerCase()}.png`;
};


/* ======================================================
   CLOCK
====================================================== */

const Clock = {

  interval: null,

  getTime(tz) {
    try {
      return getFormatter('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: tz || 'Europe/Madrid'
      }).format(new Date());

    } catch {
      return '--:--';
    }
  },


  start() {
    this.stop();

    this.update();

    this.interval = setInterval(() => {
      this.update();
    }, 1000);
  },


  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  },


  update() {
    document.querySelectorAll('.live-clock').forEach(clock => {
      clock.textContent =
        `🕒 ${this.getTime(clock.dataset.timezone)}`;
    });
  }
};


/* ======================================================
   API
====================================================== */

const API = {

  async fetchWithRetry(
    url,
    options = {},
    retries = CONFIG.MAX_RETRY
  ) {

    for (let i = 0; i <= retries; i++) {

      try {
        const response = await fetch(url, options);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return response;

      } catch (error) {

        if (i === retries) {
          throw error;
        }

        await sleep(1000 * (i + 1));
      }
    }
  },


  getCache() {

    try {
      const cache = JSON.parse(
        localStorage.getItem(CONFIG.CACHE_KEY) || '{}'
      );

      if (!cache.timestamp) return null;

      const expired =
        Date.now() - cache.timestamp > CONFIG.CACHE_TTL;

      if (expired) return null;

      return cache.data;

    } catch {
      return null;
    }
  },


  setCache(data) {

    try {
      localStorage.setItem(
        CONFIG.CACHE_KEY,
        JSON.stringify({
          data,
          timestamp: Date.now()
        })
      );

    } catch {}
  },


  async getMatches() {

    const cached = this.getCache();

    if (cached) {
      return cached;
    }


    try {

      const response = await this.fetchWithRetry(
        CONFIG.API_URL,
        {
          headers: {
            'X-Auth-Token': CONFIG.API_KEY
          }
        }
      );


      const data = await response.json();

      if (data.matches?.length) {

        const transformed =
          this.transformAPI(data.matches);

        this.setCache(transformed);

        return transformed;
      }

      throw new Error('API vacía');

    } catch (error) {

      console.warn('API fallback → local JSON', error);

      return await this.getLocalJSON();
    }
  },


  async getLocalJSON() {

    try {

      const response = await fetch(CONFIG.DATA_URL);

      if (!response.ok) {
        throw new Error('No local JSON');
      }

      const data = await response.json();

      return Array.isArray(data)
        ? data
        : [data];

    } catch (error) {

      console.error(error);

      Toast.error('Datos offline no disponibles');

      return [];
    }
  },


  transformAPI(matches) {

    return matches.map((match, index) => {

      const home = match.homeTeam || {};
      const away = match.awayTeam || {};

      const utc = new Date(match.utcDate);

      return {

        id: match.id || index,

        grupo:
          this.detectGroup(match, index),

        fecha:
          getFormatter('es-ES', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          }).format(utc),

        hora:
          getFormatter('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
          }).format(utc),

        estadio:
          match.venue || 'Estadio',

        ciudad:
          match.area?.name || '',

        timezone:
          this.detectTimezone(match.area?.name),

        eqA:
          home.shortName || home.name || 'TBD',

        eqB:
          away.shortName || away.name || 'TBD',

        flagA:
          obtenerBandera(home.tla || home.code),

        flagB:
          obtenerBandera(away.tla || away.code),

        esp:
          home.name === 'Spain' ||
          away.name === 'Spain',

        scoreA:
          match.status === 'FINISHED'
            ? match.score?.fullTime?.home
            : null,

        scoreB:
          match.status === 'FINISHED'
            ? match.score?.fullTime?.away
            : null,

        utcDate:
          match.utcDate,

        status:
          match.status
      };
    });
  },


  detectGroup(match, index) {

    return (
      match.group?.replace('GROUP_', '') ||
      CONFIG.GROUPS[index % CONFIG.GROUPS.length]
    );
  },


  detectTimezone(city) {

    for (const [key, value] of Object.entries(CONFIG.TIMEZONES)) {

      if (city?.includes(key)) {
        return value;
      }
    }

    return 'Europe/Madrid';
  }
};


/* ======================================================
   USERS
====================================================== */

const Users = {

  add(name) {

    name = name.trim();

    if (!name) {
      Toast.warning('Escribe un nombre');
      return false;
    }

    if (name.length > 20) {
      Toast.warning('Máximo 20 caracteres');
      return false;
    }

    const exists = State.usuarios.some(
      user => user.toLowerCase() === name.toLowerCase()
    );

    if (exists) {
      Toast.warning('Ese usuario ya existe');
      return false;
    }

    State.usuarios.push(name);

    this.save();

    Toast.success(`${name} añadido`);

    haptic(20);

    return true;
  },


  remove(name) {

    Modal.confirm(
      `¿Eliminar a ${name}?`,

      () => {

        State.usuarios =
          State.usuarios.filter(user => user !== name);


        Object.keys(State.porras).forEach(key => {

          if (key.includes(`_${name}_`)) {
            delete State.porras[key];
          }
        });


        this.save();

        localStorage.setItem(
          'f_porras',
          JSON.stringify(State.porras)
        );

        Engine.run();

        Toast.info(`${name} eliminado`);
      },

      'Eliminar participante'
    );
  },


  save() {
    localStorage.setItem(
      'f_usuarios',
      JSON.stringify(State.usuarios)
    );

    Engine.run();
  }
};


/* ======================================================
   ENGINE
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

      ranking[user] = {
        puntos: 0,
        exactos: 0,
        acertados: 0,
        rachaActual: 0,
        mejorRacha: 0,
        partidos: 0
      };
    });


    State.fixture.forEach(match => {

      if (
        match.scoreA == null ||
        match.scoreB == null
      ) {
        return;
      }


      State.usuarios.forEach(user => {

        const a = parseInt(
          State.porras[`p_${user}_${match.id}_A`]
        );

        const b = parseInt(
          State.porras[`p_${user}_${match.id}_B`]
        );


        if (isNaN(a) || isNaN(b)) {
          return;
        }


        ranking[user].partidos++;

        ranking[user].puntos +=
          this.calculatePoints(
            match,
            a,
            b,
            ranking[user]
          );
      });
    });

    return ranking;
  },


  calculatePoints(match, a, b, stats) {

    let pts = 0;


    const winnerReal =
      match.scoreA > match.scoreB
        ? 'A'
        : match.scoreA < match.scoreB
          ? 'B'
          : 'E';


    const winnerUser =
      a > b
        ? 'A'
        : a < b
          ? 'B'
          : 'E';


    if (
      a === match.scoreA &&
      b === match.scoreB
    ) {
      pts += 5;
      stats.exactos++;
    }


    if (winnerReal === winnerUser) {
      pts += 2;
      stats.acertados++;
    }


    if (a === match.scoreA) pts++;

    if (b === match.scoreB) pts++;


    if (
      (match.scoreA - match.scoreB) ===
      (a - b)
    ) {
      pts++;
    }


    if (
      match.esp &&
      a === match.scoreA &&
      b === match.scoreB
    ) {
      pts += 3;
    }


    if (pts > 0) {

      stats.rachaActual++;

      if (stats.rachaActual > stats.mejorRacha) {
        stats.mejorRacha = stats.rachaActual;
      }

    } else {
      stats.rachaActual = 0;
    }


    return pts;
  },


  renderLeaderboard(ranking) {

    const container =
      document.getElementById('tabla-clasificacion');

    if (!container) return;


    const sorted = Object.entries(ranking)
      .sort((a, b) => b[1].puntos - a[1].puntos);


    if (sorted.length === 0) {

      container.innerHTML = `
        <div class="empty-state">
          <span>Sin participantes todavía</span>
        </div>
      `;

      return;
    }


    container.innerHTML = sorted.map(([name, stats], index) => `

      <div class="leaderboard-item">

        <div class="leader-rank">
          ${index + 1}
        </div>

        <div class="leader-name">
          ${escapeHTML(name)}
        </div>

        <div class="score-pill">
          ${stats.puntos}
        </div>

        <button
          class="delete-btn"
          data-action="delete-user"
          data-user="${escapeHTML(name)}"
        >
          ✕
        </button>

      </div>

    `).join('');
  },


  renderStats(ranking) {

    const container =
      document.getElementById('estadisticas-avanzadas');

    if (!container) return;


    const sorted = Object.entries(ranking)
      .sort((a, b) => b[1].puntos - a[1].puntos);


    if (!sorted.length) {
      container.innerHTML = '';
      return;
    }


    const [name, stats] = sorted[0];


    container.innerHTML = `

      <div class="advanced-stats-grid">

        <div class="stat-card">
          <div>👑 Líder</div>
          <div>${escapeHTML(name)}</div>
        </div>

        <div class="stat-card">
          <div>🏆 Puntos</div>
          <div>${stats.puntos}</div>
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


    return (
      new Date(match.utcDate).getTime() - Date.now()
    ) <= CONFIG.LOCK_MINUTES_BEFORE * 60000;
  },


  getFiltered() {

    if (State.filtroActivo === 'todos') {
      return State.fixture;
    }


    if (State.filtroActivo === 'espana') {
      return State.fixture.filter(match => match.esp);
    }


    return State.fixture.filter(
      match => match.grupo === State.grupoActivo
    );
  },


  render() {

    const grid = document.getElementById('grid-fixture');

    if (!grid) return;


    const matches = this.getFiltered();


    grid.innerHTML = matches.map(match => `

      <article class="match-card glass-card">
        ${this.card(match)}
      </article>

    `).join('');
  },


  card(match) {

    const blocked = this.isLocked(match);


    return `

      <div class="match-header">

        <span class="group-pill">
          G ${match.grupo}
        </span>

        <span class="stadium-text">
          ${escapeHTML(match.estadio)}
        </span>

      </div>


      <div class="teams-grid">

        <div class="team-side">
          <span>${escapeHTML(match.eqA)}</span>
        </div>

        <div class="score-center">
          ${match.scoreA ?? 'VS'}
        </div>

        <div class="team-side">
          <span>${escapeHTML(match.eqB)}</span>
        </div>

      </div>


      <div class="predictions">
        ${State.usuarios.map(user =>
          this.row(user, match, blocked)
        ).join('')}
      </div>
    `;
  },


  row(user, match, blocked) {

    const a =
      State.porras[`p_${user}_${match.id}_A`] ?? '';

    const b =
      State.porras[`p_${user}_${match.id}_B`] ?? '';


    return `

      <div class="prediction-row">

        <span>
          ${escapeHTML(user)}
        </span>


        <input
          type="number"
          inputmode="numeric"
          min="0"
          max="20"
          value="${a}"
          class="prediction-input"
          data-user="${escapeHTML(user)}"
          data-match="${match.id}"
          data-team="A"
          ${blocked ? 'disabled' : ''}
        >


        <span>-</span>


        <input
          type="number"
          inputmode="numeric"
          min="0"
          max="20"
          value="${b}"
          class="prediction-input"
          data-user="${escapeHTML(user)}"
          data-match="${match.id}"
          data-team="B"
          ${blocked ? 'disabled' : ''}
        >

      </div>
    `;
  }
};


/* ======================================================
   STATS
====================================================== */

const Stats = {

  update() {

    const totalPartidos = State.fixture.length;

    const totalJugados = State.fixture.filter(
      match =>
        match.scoreA != null &&
        match.scoreB != null
    ).length;


    const totalLive = State.fixture.filter(
      match => match.status === 'IN_PLAY'
    ).length;


    this.set('totalPartidos', totalPartidos);
    this.set('totalJugados', totalJugados);
    this.set('totalLive', totalLive);
    this.set('totalUsers', State.usuarios.length);
  },


  set(id, value) {

    const el = document.getElementById(id);

    if (el) {
      el.textContent = value;
    }
  }
};


/* ======================================================
   SAVE PORRA
====================================================== */

const savePorra = debounce((user, matchId, team, value) => {

  State.porras[
    `p_${user}_${matchId}_${team}`
  ] = value;


  localStorage.setItem(
    'f_porras',
    JSON.stringify(State.porras)
  );


  haptic(5);

  Engine.run();

}, CONFIG.DEBOUNCE_MS);


/* ======================================================
   EVENTS
====================================================== */

const Events = {

  init() {

    document.addEventListener('input', event => {

      const target = event.target;


      if (
        target.classList.contains('prediction-input')
      ) {

        savePorra(
          target.dataset.user,
          target.dataset.match,
          target.dataset.team,
          target.value
        );
      }
    });


    document.addEventListener('click', event => {

      const target = event.target.closest('[data-action]');

      if (!target) return;


      if (target.dataset.action === 'delete-user') {
        Users.remove(target.dataset.user);
      }


      if (target.dataset.action === 'refresh') {
        App.refresh();
      }
    });


    window.addEventListener('online', () => {
      State.isOnline = true;
      Toast.success('Conexión restaurada');
    });


    window.addEventListener('offline', () => {
      State.isOnline = false;
      Toast.warning('Modo offline');
    });


    document.addEventListener('visibilitychange', () => {

      if (document.hidden) {
        Clock.stop();
      } else {
        Clock.start();
      }
    });
  }
};


/* ======================================================
   APP
====================================================== */

const App = {

  async init() {

    if (State.initialized) return;


    State.initialized = true;


    Toast.init();

    Events.init();

    Clock.start();


    try {

      State.isLoading = true;


      State.fixture = await API.getMatches();


      Engine.run();


      Toast.success('Aplicación cargada');

    } catch (error) {

      console.error(error);

      Toast.error('Error al cargar partidos');

    } finally {
      State.isLoading = false;
    }
  },


  async refresh() {

    try {

      localStorage.removeItem(CONFIG.CACHE_KEY);


      Toast.info('Actualizando datos...');


      State.fixture = await API.getMatches();


      Engine.run();


      Toast.success('Datos actualizados');

    } catch (error) {

      console.error(error);

      Toast.error('No se pudo actualizar');
    }
  }
};


/* ======================================================
   START
====================================================== */

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

