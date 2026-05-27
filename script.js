/* ======================================================
   WORLD CUP 2026 • MOTOR EN LA NUBE PREMIUM V7.2
   Banderas HD Universales • Horario Peninsular • Sincronización Firebase Realtime
====================================================== */

'use strict';

const CONFIG = {
  API_KEY: '6a2a522096e243a4afec1a2de793e623',
  API_URL: 'https://api.football-data.org/v4/competitions/WC/matches',
  DATA_URL: './data/matches.json',
  CACHE_KEY: 'f_cache_matches_v7',
  CACHE_TTL: 10 * 60 * 1000,
  LOCK_MINUTES_BEFORE: 15,
  DEBOUNCE_MS: 400,
  GROUPS: ['A','B','C','D','E','F','G','H','I','J','K','L'],
  AVATARS: ['🦁','🦊','🐼','🐯','🐻','🐺','🐸','🐲','🦉','🐙','🦅','🦈']
};

// ☁️ TUS CREDENCIALES REALES DE FIREBASE INTEGRADAS
const firebaseConfig = {
  apiKey: "AIzaSyBTKmPAe4z5909LegTjY92l_DjlVOGWZRM",
  authDomain: "porra-mundial-2026-1f46b.firebaseapp.com",
  databaseURL: "https://porra-mundial-2026-1f46b-default-rtdb.europe-west1.firebasedatabase.app", 
  projectId: "porra-mundial-2026-1f46b",
  storageBucket: "porra-mundial-2026-1f46b.firebasestorage.app",
  messagingSenderId: "637268106404",
  appId: "1:637268106404:web:532557fe7ea33edc83da31"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const FIFA_TO_ISO = {
  'ARG': 'ar', 'AUS': 'au', 'AUT': 'at', 'BEL': 'be', 'BRA': 'br', 'CAN': 'ca', 'CHI': 'cl', 'CHN': 'cn',
  'COL': 'co', 'CRC': 'cr', 'CRO': 'hr', 'DEN': 'dk', 'ECU': 'ec', 'EGY': 'eg', 'ENG': 'gb-eng', 'ESP': 'es',
  'FRA': 'fr', 'GER': 'de', 'GHA': 'gh', 'GRE': 'gr', 'ITA': 'it', 'JPN': 'jp', 'KOR': 'kr', 'MEX': 'mx',
  'MAR': 'ma', 'NED': 'nl', 'NZL': 'nz', 'NGA': 'ng', 'POR': 'pt', 'QAT': 'qa', 'RSA': 'za', 'KSA': 'sa',
  'SCO': 'gb-sct', 'SEN': 'sn', 'SRB': 'rs', 'SUI': 'ch', 'SWE': 'se', 'TUN': 'tn', 'URU': 'uy', 'USA': 'us',
  'WAL': 'gb-wls', 'PER': 'pe', 'UKR': 'ua', 'PAR': 'py', 'VEN': 've', 'ALG': 'dz', 'CMR': 'cm', 'CIV': 'ci',
  'PAN': 'pa', 'HON': 'hn', 'JAM': 'jm', 'SLV': 'sv'
};

const State = { fixture: [], usuarios: [], porras: {}, grupoActivo: 'A', initialized: false };

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

const getAvatar = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return CONFIG.AVATARS[Math.abs(hash) % CONFIG.AVATARS.length];
};

const Toast = {
  container: null,
  init() {
    this.container = document.getElementById('toast-container');
    if (!this.container) {
      const c = document.createElement('div');
      c.id = 'toast-container';
      c.style = 'fixed; bottom:85px; right:20px; z-index:9999; display:flex; flex-direction:column; gap:8px; position:fixed;';
      document.body.appendChild(c);
      this.container = c;
    }
  },
  show(message, type = 'info') {
    this.init();
    const toast = document.createElement('div');
    toast.style = 'background:rgba(15,23,42,0.96); backdrop-filter:blur(8px); color:#fff; padding:12px 16px; border-radius:12px; font-size:13px; font-weight:700; border:1px solid rgba(255,255,255,0.08); box-shadow:0 10px 25px rgba(0,0,0,0.5); transition:all 0.3s ease;';
    const colorMap = { success: '#22c55e', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6', magic: '#a855f7' };
    toast.style.borderLeft = `4px solid ${colorMap[type] || '#fff'}`;
    toast.innerHTML = escapeHTML(message);
    this.container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3500);
  },
  success(msg) { this.show(msg, 'success'); },
  error(msg) { this.show(msg, 'error'); },
  warning(msg) { this.show(msg, 'warning'); },
  info(msg) { this.show(msg, 'info'); },
  magic(msg) { this.show(msg, 'magic'); }
};

const API = {
  async getMatches() {
    try {
      const cache = JSON.parse(localStorage.getItem(CONFIG.CACHE_KEY) || '{}');
      if (cache.timestamp && Date.now() - cache.timestamp < CONFIG.CACHE_TTL) return cache.data;
    } catch {}

    try {
      const response = await fetch(CONFIG.API_URL, { headers: { 'X-Auth-Token': CONFIG.API_KEY } });
      if (response.ok) {
        const data = await response.json();
        if (data && data.matches) {
          const trans = this.transformFormat(data.matches, 'API');
          this.setCache(trans);
          return trans;
        }
      }
    } catch (e) { console.warn("Modo local activado."); }

    try {
      const response = await fetch(CONFIG.DATA_URL);
      const data = await response.json();
      const trans = this.transformFormat(Array.isArray(data) ? data : (data.matches || []), 'LOCAL');
      this.setCache(trans);
      return trans;
    } catch (error) {
      Toast.error("Error al leer el calendario de partidos");
      return [];
    }
  },
  setCache(data) { try { localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() })); } catch {} },
  buildFlagTag(team) {
    if (!team) return '🏳️';
    const code = String(team.code || team.tla || '').toUpperCase();
    const iso = FIFA_TO_ISO[code];
    if (iso) return `<img src="https://flagcdn.com/w40/${iso}.png" style="width:24px; height:16px; border-radius:3px; object-fit:cover; display:inline-block; vertical-align:middle; box-shadow: 0 1px 3px rgba(0,0,0,0.3);" alt="${code}">`;
    return `<span style="font-size:11px; font-weight:800; background:#334155; padding:2px 4px; border-radius:4px; color:#fff;">${code || 'TBD'}</span>`;
  },
  transformFormat(rawArray, origen) {
    return rawArray.map((m, index) => {
      const rawDateStr = m.kickoffUTC || m.utcDate;
      let fechaEs = 'Por definir', horaEs = '--:--';
      if (rawDateStr) {
        const dateObj = new Date(rawDateStr);
        if (!isNaN(dateObj.getTime())) {
          let fStr = dateObj.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'short', day: '2-digit', month: 'short' });
          fechaEs = fStr.charAt(0).toUpperCase() + fStr.slice(1);
          horaEs = dateObj.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
        }
      }
      return {
        id: m.id || index + 1, grupo: origen === 'LOCAL' ? (m.group || 'A') : (m.group?.replace('GROUP_', '') || 'A'),
        fecha: fechaEs, hora: horaEs, estadio: m.venue || 'Estadio', eqA: (m.homeTeam?.shortName || m.homeTeam?.name || 'TBD'),
        eqB: (m.awayTeam?.shortName || m.awayTeam?.name || 'TBD'), flagA: this.buildFlagTag(m.homeTeam), flagB: this.buildFlagTag(m.awayTeam),
        scoreA: m.score?.fullTime?.home ?? null, scoreB: m.score?.fullTime?.away ?? null, status: m.status || 'SCHEDULED', utcDate: rawDateStr
      };
    });
  }
};

const Engine = {
  run() {
    const ranking = {};
    State.usuarios.forEach(u => ranking[u] = { puntos: 0, exactos: 0, partidosJugados: 0 });
    State.fixture.forEach(match => {
      State.usuarios.forEach(user => {
        const predA = parseInt(State.porras[`p_${user}_${match.id}_A`]);
        const predB = parseInt(State.porras[`p_${user}_${match.id}_B`]);
        if (isNaN(predA) || isNaN(predB) || match.scoreA == null) return;
        ranking[user].partidosJugados++;
        if (predA === match.scoreA && predB === match.scoreB) { ranking[user].puntos += 5; ranking[user].exactos++; }
        else if ((match.scoreA > match.scoreB && predA > predB) || (match.scoreA < match.scoreB && predA < predB) || (match.scoreA === match.scoreB && predA === predB)) ranking[user].puntos += 2;
      });
    });
    Fixture.render();
  }
};

const Fixture = {
  isLocked(match) { return (new Date(match.utcDate).getTime() - Date.now()) <= CONFIG.LOCK_MINUTES_BEFORE * 60000; },
  render() {
    const grid = document.getElementById('grid-fixture');
    if (!grid) return;
    grid.innerHTML = State.fixture.filter(m => m.grupo === State.grupoActivo).map(m => `
      <div class="match-card" style="padding:15px; border-bottom:1px solid #eee;">
        ${m.eqA} ${m.scoreA ?? '-'} - ${m.scoreB ?? '-'} ${m.eqB}
        <input class="prediction-input" data-match="${m.id}" data-team="A" type="number" value="${State.porras[`p_user_${m.id}_A`] || ''}">
      </div>`).join('');
  }
};

const Users = {
  add(name) { State.usuarios.push(name); db.ref('porra_mundial/usuarios').set(State.usuarios); },
  saveAll() { db.ref('porra_mundial/usuarios').set(State.usuarios); }
};

const App = {
  async init() {
    State.fixture = await API.getMatches();
    
    // Conexión real a la nube
    db.ref('porra_mundial').on('value', (snapshot) => {
      const data = snapshot.val() || {};
      State.usuarios = data.usuarios || [];
      State.porras = data.porras || {};
      Engine.run();
    });
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());