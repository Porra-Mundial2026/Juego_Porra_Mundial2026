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
  // Añadimos manualmente la URL de tu base de datos para que conecte directo
  databaseURL: "https://porra-mundial-2026-1f46b-default-rtdb.europe-west1.firebasedatabase.app", 
  projectId: "porra-mundial-2026-1f46b",
  storageBucket: "porra-mundial-2026-1f46b.firebasestorage.app",
  messagingSenderId: "637268106404",
  appId: "1:637268106404:web:532557fe7ea33edc83da31"
};

// Inicializamos Firebase con la librería clásica del navegador
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Mapas de conversión FIFA de 3 letras a ISO de 2 letras para las banderas HD universales
const FIFA_TO_ISO = {
  'ARG': 'ar', 'AUS': 'au', 'AUT': 'at', 'BEL': 'be', 'BRA': 'br', 'CAN': 'ca', 'CHI': 'cl', 'CHN': 'cn',
  'COL': 'co', 'CRC': 'cr', 'CRO': 'hr', 'DEN': 'dk', 'ECU': 'ec', 'EGY': 'eg', 'ENG': 'gb-eng', 'ESP': 'es',
  'FRA': 'fr', 'GER': 'de', 'GHA': 'gh', 'GRE': 'gr', 'ITA': 'it', 'JPN': 'jp', 'KOR': 'kr', 'MEX': 'mx',
  'MAR': 'ma', 'NED': 'nl', 'NZL': 'nz', 'NGA': 'ng', 'POR': 'pt', 'QAT': 'qa', 'RSA': 'za', 'KSA': 'sa',
  'SCO': 'gb-sct', 'SEN': 'sn', 'SRB': 'rs', 'SUI': 'ch', 'SWE': 'se', 'TUN': 'tn', 'URU': 'uy', 'USA': 'us',
  'WAL': 'gb-wls', 'PER': 'pe', 'UKR': 'ua', 'PAR': 'py', 'VEN': 've', 'ALG': 'dz', 'CMR': 'cm', 'CIV': 'ci',
  'PAN': 'pa', 'HON': 'hn', 'JAM': 'jm', 'SLV': 'sv'
};

const State = {
  fixture: [],
  usuarios: [],
  porras: {},
  grupoActivo: 'A',
  initialized: false
};

/* ======================================================
   UTILIDADES Y HERRAMIENTAS VISUALES
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

const getAvatar = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return CONFIG.AVATARS[Math.abs(hash) % CONFIG.AVATARS.length];
};

/* ======================================================
   SISTEMA DE NOTIFICACIONES (TOASTS)
====================================================== */
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

/* ======================================================
   PROCESADOR DE RED Y BANDERAS
====================================================== */
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

  setCache(data) {
    try { localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() })); } catch {}
  },

  buildFlagTag(team) {
    if (!team) return '🏳️';
    const code = String(team.code || team.tla || '').toUpperCase();
    const iso = FIFA_TO_ISO[code];
    
    if (iso) {
      return `<img src="https://flagcdn.com/w40/${iso}.png" style="width:24px; height:16px; border-radius:3px; object-fit:cover; display:inline-block; vertical-align:middle; box-shadow: 0 1px 3px rgba(0,0,0,0.3);" alt="${code}">`;
    }
    if (team.crest || team.flag) {
      const src = team.crest || team.flag;
      if(src.startsWith('http')) {
        return `<img src="${src}" style="width:24px; height:16px; border-radius:3px; object-fit:contain; display:inline-block; vertical-align:middle;">`;
      }
    }
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

      const flagA = this.buildFlagTag(m.homeTeam);
      const flagB = this.buildFlagTag(m.awayTeam);
      
      const eqA = origen === 'LOCAL' ? (m.homeTeam?.name || 'TBD') : (m.homeTeam?.shortName || m.homeTeam?.name || 'TBD');
      const eqB = origen === 'LOCAL' ? (m.awayTeam?.name || 'TBD') : (m.awayTeam?.shortName || m.awayTeam?.name || 'TBD');
      const grupo = origen === 'LOCAL' ? (m.group || 'A') : (m.group?.replace('GROUP_', '') || 'A');

      let scoreA = null, scoreB = null;
      if (m.status === 'FINISHED' || m.score?.fullTime?.home !== null) {
        scoreA = m.score?.fullTime?.home ?? m.score?.home ?? null;
        scoreB = m.score?.fullTime?.away ?? m.score?.away ?? null;
      }

      const esEspana = eqA.toLowerCase().includes('esp') || eqB.toLowerCase().includes('esp') || eqA.toLowerCase().includes('aña') || eqB.toLowerCase().includes('aña');

      let nombreEstadio = 'Estadio';
      if (m.venue) {
        nombreEstadio = typeof m.venue === 'object' ? (m.venue.name || m.venue.stadium || 'Estadio') : m.venue;
      }

      return {
        id: m.id || index + 1, grupo, fecha: fechaEs, hora: horaEs, estadio: nombreEstadio,
        eqA, eqB, flagA, flagB, scoreA, scoreB, esp: esEspana, utcDate: rawDateStr, status: m.status || 'SCHEDULED'
      };
    });
  }
};

/* ======================================================
   MOTOR DE PUNTOS Y CLASIFICACIÓN FAMILIAR
====================================================== */
const Engine = {
  run() {
    const ranking = {};
    State.usuarios.forEach(u => {
      ranking[u] = { puntos: 0, exactos: 0, signos: 0, golesAcertados: 0, partidosJugados: 0, golesApostados: 0 };
    });

    State.fixture.forEach(match => {
      State.usuarios.forEach(user => {
        const predA = parseInt(State.porras[`p_${user}_${match.id}_A`]);
        const predB = parseInt(State.porras[`p_${user}_${match.id}_B`]);
        if (isNaN(predA) || isNaN(predB)) return;

        ranking[user].partidosJugados++;
        ranking[user].golesApostados += (predA + predB);
        
        if (match.scoreA == null || match.scoreB == null) return;
        
        const realA = match.scoreA; const realB = match.scoreB;
        const sR = realA > realB ? '1' : realA < realB ? '2' : 'X';
        const sU = predA > predB ? '1' : predA < predB ? '2' : 'X';
        let pts = 0;

        if (predA === realA && predB === realB) { pts += 5; ranking[user].exactos++; if (match.esp) pts += 3; }
        if (sR === sU) { pts += 2; ranking[user].signos++; }
        if (predA === realA) { pts += 1; ranking[user].golesAcertados++; }
        if (predB === realB) { pts += 1; ranking[user].golesAcertados++; }
        if ((realA - realB) === (predA - predB) && sR !== 'X') pts += 1;

        ranking[user].puntos += pts;
      });
    });

    this.renderLeaderboard(ranking);
    this.renderStatsPanel(ranking);
    Fixture.render();
  },

  renderLeaderboard(ranking) {
    const container = document.getElementById('tabla-clasificacion');
    if (!container) return;

    const ordenados = Object.entries(ranking).sort((a,b) => b[1].puntos - a[1].puntos);
    if (ordenados.length === 0) {
      container.innerHTML = `<h3 class="leaderboard-title">📊 Clasificación Familiar</h3><div style="text-align:center; padding:20px; opacity:0.5; font-size:13px;">Registra a la familia abajo para encender la porra.</div>`;
      return;
    }

    let html = `
      <h3 class="leaderboard-title">🏆 Salón de la Fama Familiar</h3>
      <table class="premium-table" style="width:100%; border-collapse:collapse; margin-top:10px;">
        <thead><tr style="text-align:left; font-size:11px; opacity:0.6; border-bottom:1px solid var(--border);">
          <th style="padding:8px 4px; text-align:center;">Pos</th><th>Familiar</th><th style="text-align:center;">PJ</th>
          <th style="text-align:center;">Plenos 🎯</th><th style="text-align:right; padding-right:8px;">PTS</th><th></th>
        </tr></thead><tbody>
    `;

    ordenados.forEach(([name, data], idx) => {
      let medalla = `#${idx+1}`;
      if (idx === 0) medalla = '🥇'; else if (idx === 1) medalla = '🥈'; else if (idx === 2) medalla = '🥉';
      const rachaFuego = data.exactos >= 3 ? '<span style="font-size:13px; margin-left:4px;">🔥</span>' : '';
      
      html += `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.02); font-size:14px;">
          <td style="padding:14px 4px; font-weight:800; text-align:center; font-size:15px;">${medalla}</td>
          <td style="font-weight:700; color:#fff;">${getAvatar(name)} ${escapeHTML(name)} ${rachaFuego}</td>
          <td style="text-align:center; opacity:0.6; font-size:12px;">${data.partidosJugados}</td>
          <td style="text-align:center; color:var(--success); font-weight:800;">${data.exactos}</td>
          <td style="text-align:right; font-weight:900; color:var(--primary); padding-right:8px; font-size:16px;">${data.puntos}</td>
          <td style="text-align:center;"><button onclick="if(confirm('¿Eliminar a ${escapeHTML(name)}?')) Users.remove('${escapeHTML(name)}')" style="background:none; border:none; color:var(--danger); font-size:13px; cursor:pointer;">✕</button></td>
        </tr>`;
    });
    container.innerHTML = html + `</tbody></table>`;
  },

  renderStatsPanel(ranking) {
    const container = document.getElementById('estadisticas-avanzadas');
    if (!container) return;
    const ord = Object.entries(ranking).sort((a,b) => b[1].puntos - a[1].puntos);
    if (ord.length === 0) { container.innerHTML = ''; return; }

    const masPlenos = [...ord].sort((a,b) => b[1].exactos - a[1].exactos)[0];
    const elLoco = [...ord].sort((a,b) => b[1].golesApostados - a[1].golesApostados)[0];
    const elCemento = [...ord].sort((a,b) => a[1].golesApostados - b[1].golesApostados)[0];

    container.innerHTML = `
      <h3 style="font-size:13px; font-weight:800; margin-bottom:12px; color:#64748b;">🎭 PERFILES PICADOS</h3>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <div style="background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.2); padding:10px; border-radius:12px;">
          <div style="font-size:9px; color:#22c55e; font-weight:900;">FRANCOTIRADOR 🎯</div>
          <div style="font-size:14px; font-weight:700; color:#fff; margin-top:2px;">${getAvatar(masPlenos[0])} ${escapeHTML(masPlenos[0])}</div>
          <div style="font-size:11px; opacity:0.7;">${masPlenos[1].exactos} Plenos exactos</div>
        </div>
        <div style="background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.2); padding:10px; border-radius:12px;">
          <div style="font-size:9px; color:#ef4444; font-weight:900;">EL OPTIMISTA 🚀</div>
          <div style="font-size:14px; font-weight:700; color:#fff; margin-top:2px;">${getAvatar(elLoco[0])} ${escapeHTML(elLoco[0])}</div>
          <div style="font-size:11px; opacity:0.7;">${elLoco[1].golesApostados} Goles imaginados</div>
        </div>
        <div style="background:rgba(168,85,247,0.08); border:1px solid rgba(168,85,247,0.2); padding:10px; border-radius:12px; grid-column: span 2;">
          <div style="font-size:9px; color:#a855f7; font-weight:900;">EL CEMENTO 🧱</div>
          <div style="font-size:13px; font-weight:600; color:#fff; margin-top:2px;">
            ${getAvatar(elCemento[0])} ${escapeHTML(elCemento[0])} no arriesga nada, solo predice empates o pocos goles (${elCemento[1].golesApostados} en total).
          </div>
        </div>
      </div>
    `;
  }
};

/* ======================================================
   RENDERIZADOR DE PARTIDOS 
====================================================== */
const Fixture = {
  isLocked(match) {
    if (!match.utcDate) return false;
    return (new Date(match.utcDate).getTime() - Date.now()) <= CONFIG.LOCK_MINUTES_BEFORE * 60000;
  },

  render() {
    const grid = document.getElementById('grid-fixture');
    if (!grid) return;
    const filtrados = State.fixture.filter(m => m.grupo === State.grupoActivo);

    grid.innerHTML = filtrados.length === 0 
      ? `<div style="text-align:center; padding:30px; opacity:0.5; font-size:13px;">No hay encuentros en el Grupo ${State.grupoActivo}.</div>`
      : filtrados.map(m => this.card(m)).join('');
  },

  card(match) {
    const blocked = this.isLocked(match);
    const isLive = match.status === 'LIVE' || match.status === 'IN_PLAY';
    const isFinished = match.status === 'FINISHED';

    return `
      <article class="match-card" style="background:var(--bg-card); border:1px solid ${match.esp ? '#ef4444' : 'var(--border)'}; border-radius:var(--radius); padding:16px; margin-bottom:12px; position:relative;">
        ${match.esp ? '<div style="position:absolute; top:0; right:16px; background:#ef4444; color:#fff; font-size:9px; font-weight:900; padding:3px 8px; border-radius:0 0 6px 6px;">PARTIDO DE ESPAÑA (+3 PTS EXTRAS)</div>': ''}
        
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; background:rgba(255,255,255,0.02); padding:6px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.04);">
          <div style="display:flex; flex-direction:column;">
            <span style="color:var(--primary); font-size:10px; font-weight:900;">GRUPO ${match.grupo}</span>
            <span style="color:#f8fafc; font-size:12px; font-weight:800; margin-top:2px;">⏰ ${match.fecha} a las ${match.hora}</span>
            <span style="color:#64748b; font-size:10px; font-weight:600; margin-top:1px;">🏟️ ${escapeHTML(match.estadio)}</span>
          </div>
          <span style="background:${isLive ? 'rgba(239,68,68,0.15)' : isFinished ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.05)'}; color:${isLive ? '#ef4444' : isFinished ? '#22c55e' : '#94a3b8'}; font-size:10px; font-weight:900; padding:4px 8px; border-radius:6px;">
            ${isLive ? '🔴 VIVO' : isFinished ? 'FINALIZADO' : 'PRÓXIMO'}
          </span>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:10px;">
            ${match.flagA}
            <span style="font-weight:700; font-size:15px; color:#fff;">${escapeHTML(match.eqA)}</span>
          </div>
          <div style="background:rgba(255,255,255,0.06); font-weight:800; padding:4px 12px; border-radius:6px; font-size:16px; min-width:34px; text-align:center;">${match.scoreA ?? '-'}</div>
        </div>
        
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <div style="display:flex; align-items:center; gap:10px;">
            ${match.flagB}
            <span style="font-weight:700; font-size:15px; color:#fff;">${escapeHTML(match.eqB)}</span>
          </div>
          <div style="background:rgba(255,255,255,0.06); font-weight:800; padding:4px 12px; border-radius:6px; font-size:16px; min-width:34px; text-align:center;">${match.scoreB ?? '-'}</div>
        </div>

        <div style="border-top:1px solid rgba(255,255,255,0.05); padding-top:10px; display:flex; flex-direction:column; gap:8px;">
          ${State.usuarios.map(user => {
            const vA = State.porras[`p_${user}_${match.id}_A`] ?? '';
            const vB = State.porras[`p_${user}_${match.id}_B`] ?? '';
            
            let sColor = "background:var(--bg-input); border:1px solid var(--border); color:#fff;";
            if (isFinished && vA !== '' && vB !== '') {
              const exacto = (parseInt(vA) === match.scoreA && parseInt(vB) === match.scoreB);
              const signoReal = match.scoreA > match.scoreB ? '1' : match.scoreA < match.scoreB ? '2' : 'X';
              const signoUser = parseInt(vA) > parseInt(vB) ? '1' : parseInt(vA) < parseInt(vB) ? '2' : 'X';
              
              if (exacto) { sColor = "background:rgba(34,197,94,0.12); border:1px solid #22c55e; color:#22c55e;"; }
              else if (signoReal === signoUser) { sColor = "background:rgba(245,158,11,0.12); border:1px solid #f59e0b; color:#f59e0b;"; }
              else { sColor = "background:rgba(239,68,68,0.04); border:1px solid rgba(239,68,68,0.2); color:#ef4444; opacity:0.6;"; }
            }

            return `
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:13px; font-weight:600; opacity:0.9;">${getAvatar(user)} ${escapeHTML(user)}</span>
                <div style="display:flex; align-items:center; gap:4px;">
                  <input type="number" value="${vA}" class="prediction-input" data-user="${escapeHTML(user)}" data-match="${match.id}" data-team="A" ${blocked ? 'disabled' : ''} style="width:36px; height:30px; text-align:center; border-radius:6px; font-weight:800; ${sColor}">
                  <span style="opacity:0.3; color:#fff;">-</span>
                  <input type="number" value="${vB}" class="prediction-input" data-user="${escapeHTML(user)}" data-match="${match.id}" data-team="B" ${blocked ? 'disabled' : ''} style="width:36px; height:30px; text-align:center; border-radius:6px; font-weight:800; ${sColor}">
                </div>
              </div>`;
          }).join('')}
        </div>
      </article>`;
  }
};

/* ======================================================
   SISTEMA DE PERSISTENCIA EN LA NUBE (FIREBASE)
====================================================== */
const Users = {
  add(name) {
    name = name.trim();
    if (!name || State.usuarios.includes(name)) return;
    State.usuarios.push(name);
    this.saveAll();
  },
  remove(name) {
    State.usuarios = State.usuarios.filter(u => u !== name);
    this.saveAll();
  },
  saveAll() {
    db.ref('porra_mundial/usuarios').set(State.usuarios);
  }
};

const salvarPorraInmediato = debounce((u, m, t, v) => {
  State.porras[`p_${u}_${m}_${t}`] = v;
  db.ref(`porra_mundial/porras/p_${u}_${m}_${t}`).set(v);
}, CONFIG.DEBOUNCE_MS);

const rellenarSuerte = () => {
  const matches = State.fixture.filter(m => m.grupo === State.grupoActivo && !Fixture.isLocked(m));
  if (matches.length === 0 || State.usuarios.length === 0) return Toast.warning('Sin casillas libres activas.');
  
  const actualizaciones = {};
  matches.forEach(m => {
    State.usuarios.forEach(u => {
      if (!State.porras[`p_${u}_${m.id}_A`]) {
        const rA = Math.floor(Math.random() * 3);
        State.porras[`p_${u}_${m.id}_A`] = rA;
        actualizaciones[`p_${u}_${m.id}_A`] = rA;
      }
      if (!State.porras[`p_${u}_${m.id}_B`]) {
        const rB = Math.floor(Math.random() * 3);
        State.porras[`p_${u}_${m.id}_B`] = rB;
        actualizaciones[`p_${u}_${m.id}_B`] = rB;
      }
    });
  });
  
  db.ref('porra_mundial/porras').update(actualizaciones);
  Toast.magic('🎲 ¡Suerte echada en la nube!');
};

/* ======================================================
   ARRANQUE GLOBAL Y ESCUCHA EN TIEMPO REAL
====================================================== */
const App = {
  async init() {
    if (State.initialized) return; 
    State.initialized = true;

    document.addEventListener('input', e => { 
      if (e.target.classList.contains('prediction-input')) {
        salvarPorraInmediato(e.target.dataset.user, e.target.dataset.match, e.target.dataset.team, e.target.value); 
      }
    });

    const filtersBar = document.querySelector('.filters-bar');
    if (filtersBar) {
      filtersBar.innerHTML = CONFIG.GROUPS.map(g => `<button class="filter-btn ${State.grupoActivo === g ? 'active' : ''}" data-group="${g}" style="padding:6px 12px; margin-right:6px; border-radius:20px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.04); color:#fff; cursor:pointer; font-weight:700; font-size:12px;">Grupo ${g}</button>`).join('');
      filtersBar.addEventListener('click', e => {
        const btn = e.target.closest('.filter-btn'); if (!btn) return;
        document.querySelectorAll('.filter-btn').forEach(b => { b.classList.remove('active'); b.style.background = 'rgba(255,255,255,0.04)'; });
        btn.classList.add('active'); btn.style.background = 'var(--primary)'; State.grupoActivo = btn.dataset.group; Fixture.render();
      });
    }

    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) {
      bottomNav.innerHTML = `
        <button id="nav-fixture" style="flex:1; background:none; border:none; color:#fff; display:flex; flex-direction:column; align-items:center; font-size:10px; font-weight:700; gap:4px; cursor:pointer;"><span style="font-size:18px;">⚽</span>Partidos</button>
        <button id="nav-random" style="flex:1; background:none; border:none; color:#a855f7; display:flex; flex-direction:column; align-items:center; font-size:10px; font-weight:800; gap:4px; cursor:pointer;"><span style="font-size:18px;">🎲</span>Suerte</button>
        <button id="nav-cloud-status" style="flex:1; background:none; border:none; color:#22c55e; display:flex; flex-direction:column; align-items:center; font-size:10px; font-weight:800; gap:4px; cursor:pointer;"><span style="font-size:18px;">☁️</span>Nube OK</button>
        <button id="nav-add-user" style="flex:1; background:none; border:none; color:#fff; display:flex; flex-direction:column; align-items:center; font-size:10px; font-weight:700; gap:4px; cursor:pointer;"><span style="font-size:18px;">➕</span>Añadir</button>
      `;
      document.getElementById('nav-fixture').addEventListener('click', () => window.scrollTo({top:0, behavior:'smooth'}));
      document.getElementById('nav-random').addEventListener('click', rellenarSuerte);
      document.getElementById('nav-cloud-status').addEventListener('click', () => Toast.info("Conectado en vivo con la base de datos central"));
      document.getElementById('nav-add-user').addEventListener('click', () => {
        const n = prompt("Nombre del familiar:"); if (n) { Users.add(n); Toast.success(`¡${n} añadido a la nube!`); }
      });
    }

    State.fixture = await API.getMatches();

    db.ref('porra_mundial').on('value', (snapshot) => {
      const data = snapshot.val() || {};
      State.usuarios = data.usuarios || [];
      State.porras = data.porras || {};
      
      // Apagamos el aviso de "Modo sin conexión" si la plantilla lo tiene
      const connectionBadge = document.querySelector('.offline-badge') || document.querySelector('[style*="#ef4444"]');
      if(connectionBadge && connectionBadge.textContent.includes("conexión")) {
         connectionBadge.style.display = 'none';
      }
      
      Engine.run();
    });
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());