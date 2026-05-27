/* ======================================================
   WORLD CUP 2026 • MOTOR LÓGICO PREMIUM COPA ULTRA V5
   Banderas Nativas • Horario Español Garantizado • Gamificación
====================================================== */

'use strict';

const CONFIG = {
  API_KEY: '6a2a522096e243a4afec1a2de793e623',
  API_URL: 'https://api.football-data.org/v4/competitions/WC/matches',
  DATA_URL: './data/matches.json',
  CACHE_KEY: 'f_cache_matches_v6',
  CACHE_TTL: 10 * 60 * 1000, // 10 minutos
  LOCK_MINUTES_BEFORE: 15,
  MAX_RETRY: 2,
  DEBOUNCE_MS: 400,
  GROUPS: ['A','B','C','D','E','F','G','H','I','J','K','L'],
  AVATARS: ['🦁','🦊','🐼','🐯','🐻','🐺','🐸','🐲','🦉','🐙','🦅','🦈']
};

/* ======================================================
   ESTADO GLOBAL DE LA APP
====================================================== */
const State = {
  fixture: [],
  usuarios: JSON.parse(localStorage.getItem('f_usuarios')) || [],
  porras: JSON.parse(localStorage.getItem('f_porras')) || {},
  grupoActivo: 'A',
  isOnline: navigator.onLine,
  isLoading: false,
  initialized: false
};

/* ======================================================
   UTILIDADES, AVATARES Y DICCIONARIO DE BANDERAS
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

// Generador de avatares según el nombre para dar identidad a la familia
const getAvatar = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return CONFIG.AVATARS[Math.abs(hash) % CONFIG.AVATARS.length];
};

/* ======================================================
   TOAST NOTIFICATIONS (Alertas HUD)
====================================================== */
const Toast = {
  container: null,
  init() {
    this.container = document.getElementById('toast-container');
    if (!this.container) {
      const c = document.createElement('div');
      c.id = 'toast-container';
      c.style.position = 'fixed';
      c.style.bottom = '80px';
      c.style.right = '20px';
      c.style.zIndex = '9999';
      c.style.display = 'flex';
      c.style.flexDirection = 'column';
      c.style.gap = '8px';
      document.body.appendChild(c);
      this.container = c;
    }
  },
  show(message, type = 'info') {
    this.init();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.background = 'rgba(15, 23, 42, 0.95)';
    toast.style.backdropFilter = 'blur(10px)';
    toast.style.color = '#fff';
    toast.style.padding = '12px 16px';
    toast.style.borderRadius = '12px';
    toast.style.fontSize = '13px';
    toast.style.fontWeight = '600';
    toast.style.border = '1px solid rgba(255,255,255,0.08)';
    toast.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)';
    toast.style.transition = 'all 0.3s ease';
    
    const colorMap = { success: '#22c55e', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6', magic: '#a855f7' };
    toast.style.borderLeft = `4px solid ${colorMap[type] || '#fff'}`;
    toast.innerHTML = escapeHTML(message);
    
    this.container.appendChild(toast);
    if ('vibrate' in navigator) navigator.vibrate(10);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3500);
  },
  success(msg) { this.show(msg, 'success'); },
  error(msg) { this.show(msg, 'error'); },
  warning(msg) { this.show(msg, 'warning'); },
  info(msg) { this.show(msg, 'info'); },
  magic(msg) { this.show(msg, 'magic'); }
};

/* ======================================================
   CAPA DE DATOS Y TRADUCTOR DE FORMATOS
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
    } catch (e) { console.warn("Entrando en modo local/offline..."); }

    try {
      const response = await fetch(CONFIG.DATA_URL);
      const data = await response.json();
      const rawMatches = Array.isArray(data) ? data : (data.matches || []);
      const trans = this.transformFormat(rawMatches, 'LOCAL');
      this.setCache(trans);
      return trans;
    } catch (error) {
      Toast.error("Error crítico al cargar el calendario");
      return [];
    }
  },

  setCache(data) {
    try { localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() })); } catch {}
  },

  getTeamFlag(team) {
    if (!team) return '🏳️';
    // Si ya viene un emoji de bandera directo en el JSON, lo usamos directamente
    if (team.flag && team.flag.length <= 4) return team.flag;
    
    // Diccionario infalible de códigos FIFA a Emojis para el Mundial 2026
    const FIFA_FLAGS = {
      'ARG': '🇦🇷', 'AUS': '🇦🇺', 'AUT': '🇦🇹', 'BEL': '🇧🇪', 'BRA': '🇧🇷', 'CAN': '🇨🇦', 'CHI': '🇨🇱', 'CHN': '🇨🇳',
      'COL': '🇨🇴', 'CRC': '🇨🇷', 'CRO': '🇭🇷', 'DEN': '🇩🇰', 'ECU': '🇪🇨', 'EGY': '🇪🇬', 'ENG': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'ESP': '🇪🇸',
      'FRA': '🇫🇷', 'GER': '🇩🇪', 'GHA': '🇬🇭', 'GRE': '🇬🇷', 'ITA': '🇮🇹', 'JPN': '🇯🇵', 'KOR': '🇰🇷', 'MEX': '🇲🇽',
      'MAR': '🇲🇦', 'NED': '🇳🇱', 'NZL': '🇳🇿', 'NGA': '🇳🇬', 'POR': '🇵🇹', 'QAT': '🇶🇦', 'RSA': '🇿🇦', 'KSA': '🇸🇦',
      'SCO': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'SEN': '🇸🇳', 'SRB': '🇷🇸', 'SUI': '🇨🇭', 'SWE': '🇸🇪', 'TUN': '🇹🇳', 'URU': '🇺🇾', 'USA': '🇺🇸',
      'WAL': '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'PER': '🇵🇪', 'UKR': '🇺🇦', 'PAR': '🇵🇾', 'VEN': '🇻🇪', 'ALG': '🇩🇿', 'CMR': '🇨🇲', 'CIV': '🇨🇮',
      'PAN': '🇵🇦', 'HON': '🇭🇳', 'JAM': '🇯🇲', 'SLV': '🇸🇻'
    };

    const code = String(team.code || '').toUpperCase();
    if (FIFA_FLAGS[code]) return FIFA_FLAGS[code];
    
    // Fallback por si la API nos da una URL de escudo tradicional
    if (team.crest) {
      return `<img src="${team.crest}" style="width:22px; height:15px; border-radius:2px; object-fit:contain; display:inline-block; vertical-align:middle;">`;
    }
    return '🏳️';
  },

  transformFormat(rawArray, origen) {
    return rawArray.map((m, index) => {
      const rawDateStr = m.kickoffUTC || m.utcDate;
      let fechaEs = 'Por definir', horaEs = '--:--';
      
      // GARANTÍA DE HORARIO ESPAÑOL: Forzamos Zona de Madrid en la conversión
      if (rawDateStr) {
        const dateObj = new Date(rawDateStr);
        if (!isNaN(dateObj.getTime())) {
          let fStr = dateObj.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'short', day: '2-digit', month: 'short' });
          fechaEs = fStr.charAt(0).toUpperCase() + fStr.slice(1); // Capitalizar día
          horaEs = dateObj.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
        }
      } else if (origen === 'LOCAL' && m.horaEspana) {
        horaEs = m.horaEspana;
        fechaEs = m.fecha || 'TBD';
      }

      const flagA = this.getTeamFlag(m.homeTeam);
      const flagB = this.getTeamFlag(m.awayTeam);
      
      const eqA = origen === 'LOCAL' ? (m.homeTeam?.name || 'TBD') : (m.homeTeam?.shortName || m.homeTeam?.name || 'TBD');
      const eqB = origen === 'LOCAL' ? (m.awayTeam?.name || 'TBD') : (m.awayTeam?.shortName || m.awayTeam?.name || 'TBD');
      const grupo = origen === 'LOCAL' ? (m.group || 'A') : (m.group?.replace('GROUP_', '') || 'A');

      let scoreA = null, scoreB = null;
      if (m.status === 'FINISHED' || (m.score?.fullTime?.home !== null && m.score?.fullTime?.home !== undefined)) {
        scoreA = m.score?.fullTime?.home ?? m.score?.home ?? null;
        scoreB = m.score?.fullTime?.away ?? m.score?.away ?? null;
      }

      const esEspana = eqA.toLowerCase().includes('esp') || eqB.toLowerCase().includes('esp') || eqA.toLowerCase().includes('aña') || eqB.toLowerCase().includes('aña');

      return {
        id: m.id || index + 1, grupo, fecha: fechaEs, hora: horaEs, estadio: m.venue?.stadium || m.venue || 'Estadio',
        eqA, eqB, flagA, flagB, scoreA, scoreB, esp: esEspana,
        utcDate: rawDateStr, status: m.status || 'SCHEDULED'
      };
    });
  }
};

/* ======================================================
   MOTOR DE JUEGO (Puntuaciones y Clasificación)
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
    this.updateGlobalCounters();
  },

  renderLeaderboard(ranking) {
    const container = document.getElementById('tabla-clasificacion');
    if (!container) return;

    const ordenados = Object.entries(ranking).sort((a,b) => b[1].puntos - a[1].puntos);
    if (ordenados.length === 0) {
      container.innerHTML = `<h3 class="leaderboard-title">📊 Clasificación Familiar</h3><div style="text-align:center; padding:20px; opacity:0.5; font-size:13px;">Añade un miembro de la familia abajo para empezar el pique.</div>`;
      return;
    }

    let html = `
      <h3 class="leaderboard-title">🏆 Salón de la Fama Familiar</h3>
      <table class="premium-table" style="width:100%; border-collapse:collapse; margin-top:10px;">
        <thead><tr style="text-align:left; font-size:11px; opacity:0.6; border-bottom:1px solid var(--border);">
          <th style="padding:8px 4px;">Puesto</th><th>Familiar</th><th style="text-align:center;">Jugados</th>
          <th style="text-align:center;">Plenos 🎯</th><th style="text-align:right; padding-right:8px;">PUNTOS</th><th></th>
        </tr></thead><tbody>
    `;

    ordenados.forEach(([name, data], idx) => {
      let medalla = `#${idx+1}`;
      if (idx === 0) medalla = '🥇'; else if (idx === 1) medalla = '🥈'; else if (idx === 2) medalla = '🥉';
      
      const rachaFuego = data.exactos >= 3 ? '<span style="font-size:14px; margin-left:4px;" title="¡Racha de Plenos en llamas!">🔥</span>' : '';
      
      html += `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.02); font-size:14px;">
          <td style="padding:14px 4px; font-weight:800; font-size:16px; text-align:center;">${medalla}</td>
          <td style="font-weight:700; color:#fff;">${getAvatar(name)} ${escapeHTML(name)} ${rachaFuego}</td>
          <td style="text-align:center; opacity:0.6; font-size:12px;">${data.partidosJugados}</td>
          <td style="text-align:center; color:var(--success); font-weight:800; font-size:15px;">${data.exactos}</td>
          <td style="text-align:right; font-weight:900; color:var(--primary); padding-right:8px; font-size:17px;">${data.puntos}</td>
          <td style="text-align:center;"><button onclick="if(confirm('¿Seguro que quieres eliminar a ${escapeHTML(name)}?')) Users.remove('${escapeHTML(name)}')" style="background:none; border:none; color:var(--danger); font-size:13px; cursor:pointer; padding:4px;">✕</button></td>
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
      <h3 style="font-size:13px; font-weight:800; margin-bottom:12px; color:#64748b; letter-spacing:0.5px;">🎭 PERFILES DE LA FAMILIA</h3>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <div style="background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.2); padding:10px; border-radius:12px;">
          <div style="font-size:9px; color:#22c55e; font-weight:900; letter-spacing:0.5px;">FRANCOTIRADOR 🎯</div>
          <div style="font-size:14px; font-weight:700; color:#fff; margin-top:2px;">${getAvatar(masPlenos[0])} ${escapeHTML(masPlenos[0])}</div>
          <div style="font-size:11px; opacity:0.7; margin-top:1px;">${masPlenos[1].exactos} Resultados exactos</div>
        </div>
        <div style="background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.2); padding:10px; border-radius:12px;">
          <div style="font-size:9px; color:#ef4444; font-weight:900; letter-spacing:0.5px;">EL OPTIMISTA 🚀</div>
          <div style="font-size:14px; font-weight:700; color:#fff; margin-top:2px;">${getAvatar(elLoco[0])} ${escapeHTML(elLoco[0])}</div>
          <div style="font-size:11px; opacity:0.7; margin-top:1px;">${elLoco[1].golesApostados} Goles pronosticados</div>
        </div>
        <div style="background:rgba(168,85,247,0.08); border:1px solid rgba(168,85,247,0.2); padding:10px; border-radius:12px; grid-column: span 2;">
          <div style="font-size:9px; color:#a855f7; font-weight:900; letter-spacing:0.5px;">EL CEMENTO ARMADO 🧱</div>
          <div style="font-size:13px; font-weight:600; color:#fff; margin-top:2px;">
            ${getAvatar(elCemento[0])} ${escapeHTML(elCemento[0])} es un amarrategui. Ha apostado solo por ${elCemento[1].golesApostados} goles en total.
          </div>
        </div>
      </div>
    `;
  },

  updateGlobalCounters() {
    const m = State.fixture;
    const id = (el, v) => { const e = document.getElementById(el); if(e) e.textContent = v; };
    id('totalMatches', m.length); id('totalPlayed', m.filter(x => x.status === 'FINISHED').length);
    id('totalLive', m.filter(x => x.status === 'LIVE' || x.status === 'IN_PLAY').length); id('totalUsers', State.usuarios.length);
  }
};

/* ======================================================
   CONTROLADORES DEL PANEL DE PARTIDOS
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
      ? `<div style="text-align:center; padding:30px; opacity:0.5; font-size:13px;">No hay encuentros disponibles para el Grupo ${State.grupoActivo}.</div>`
      : filtrados.map(m => this.card(m)).join('');
  },

  card(match) {
    const blocked = this.isLocked(match);
    const isLive = match.status === 'LIVE' || match.status === 'IN_PLAY';
    const isFinished = match.status === 'FINISHED';

    return `
      <article class="match-card" style="background:var(--bg-card); border:1px solid ${match.esp ? '#ef4444' : 'var(--border)'}; border-radius:var(--radius); padding:16px; margin-bottom:12px; position:relative;">
        ${match.esp ? '<div style="position:absolute; top:0; right:16px; background:#ef4444; color:#fff; font-size:9px; font-weight:900; padding:3px 8px; border-radius:0 0 6px 6px; letter-spacing:0.5px;">PARTIDO DE ESPAÑA (+3 PTS)</div>': ''}
        
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; background:rgba(255,255,255,0.02); padding:6px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.04);">
          <div style="display:flex; flex-direction:column;">
            <span style="color:var(--primary); font-size:10px; font-weight:900; text-transform:uppercase; letter-spacing:0.5px;">GRUPO ${match.grupo}</span>
            <span style="color:#f8fafc; font-size:12px; font-weight:800; margin-top:2px;">⏰ ${match.fecha} • ${match.hora}</span>
          </div>
          <span style="background:${isLive ? 'rgba(239,68,68,0.15)' : isFinished ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.05)'}; color:${isLive ? '#ef4444' : isFinished ? '#22c55e' : '#94a3b8'}; font-size:10px; font-weight:900; padding:4px 8px; border-radius:6px;">
            ${isLive ? '🔴 EN VIVO' : isFinished ? '✓ FINALIZADO' : '⏳ PRÓXIMO'}
          </span>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:20px; width:24px; text-align:center; display:inline-block; line-height:1;">${match.flagA}</span>
            <span style="font-weight:700; font-size:15px; color:#fff;">${escapeHTML(match.eqA)}</span>
          </div>
          <div style="background:rgba(255,255,255,0.06); font-weight:800; padding:4px 12px; border-radius:6px; font-size:16px; min-width:34px; text-align:center;">${match.scoreA ?? '-'}</div>
        </div>
        
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:20px; width:24px; text-align:center; display:inline-block; line-height:1;">${match.flagB}</span>
            <span style="font-weight:700; font-size:15px; color:#fff;">${escapeHTML(match.eqB)}</span>
          </div>
          <div style="background:rgba(255,255,255,0.06); font-weight:800; padding:4px 12px; border-radius:6px; font-size:16px; min-width:34px; text-align:center;">${match.scoreB ?? '-'}</div>
        </div>

        <div style="border-top:1px solid rgba(255,255,255,0.05); padding-top:10px; display:flex; flex-direction:column; gap:8px;">
          ${State.usuarios.length === 0 ? '<div style="font-size:11px; opacity:0.5; text-align:center; padding:4px;">Dale al botón inferior de "Añadir" para registrar a la familia.</div>' : ''}
          ${State.usuarios.map(user => {
            const vA = State.porras[`p_${user}_${match.id}_A`] ?? '';
            const vB = State.porras[`p_${user}_${match.id}_B`] ?? '';
            
            // SEMÁFORO DE ACIERTOS INTEGRADO (Color dinámico al finalizar)
            let sColor = "background:var(--bg-input); border:1px solid var(--border); color:#fff;";
            if (isFinished && vA !== '' && vB !== '') {
              const exacto = (parseInt(vA) === match.scoreA && parseInt(vB) === match.scoreB);
              const signoReal = match.scoreA > match.scoreB ? '1' : match.scoreA < match.scoreB ? '2' : 'X';
              const signoUser = parseInt(vA) > parseInt(vB) ? '1' : parseInt(vA) < parseInt(vB) ? '2' : 'X';
              
              if (exacto) { sColor = "background:rgba(34,197,94,0.12); border:1px solid #22c55e; color:#22c55e; box-shadow:0 0 8px rgba(34,197,94,0.1);"; }
              else if (signoReal === signoUser) { sColor = "background:rgba(245,158,11,0.12); border:1px solid #f59e0b; color:#f59e0b;"; }
              else { sColor = "background:rgba(239,68,68,0.05); border:1px solid rgba(239,68,68,0.3); color:#ef4444; opacity:0.6;"; }
            }

            return `
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:13px; font-weight:600; opacity:0.9; color:#e2e8f0;">${getAvatar(user)} ${escapeHTML(user)}</span>
                <div style="display:flex; align-items:center; gap:4px;">
                  <input type="number" inputmode="numeric" min="0" max="15" value="${vA}" class="prediction-input" data-user="${escapeHTML(user)}" data-match="${match.id}" data-team="A" ${blocked ? 'disabled' : ''} style="width:36px; height:30px; text-align:center; border-radius:6px; font-weight:800; font-size:14px; transition:all 0.2s; ${sColor}">
                  <span style="opacity:0.3; font-weight:800; color:#fff;">-</span>
                  <input type="number" inputmode="numeric" min="0" max="15" value="${vB}" class="prediction-input" data-user="${escapeHTML(user)}" data-match="${match.id}" data-team="B" ${blocked ? 'disabled' : ''} style="width:36px; height:30px; text-align:center; border-radius:6px; font-weight:800; font-size:14px; transition:all 0.2s; ${sColor}">
                </div>
              </div>`;
          }).join('')}
        </div>
        <div style="margin-top:10px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.01); font-size:10px; color:#475569; text-align:left;">
          🏟️ ${escapeHTML(match.estadio)}
        </div>
      </article>`;
  }
};

/* ======================================================
   GESTIÓN DE USUARIOS Y EVENTOS AUTOMÁTICOS
====================================================== */
const Users = {
  add(name) { 
    name = name.trim(); 
    if (!name || State.usuarios.includes(name)) return; 
    State.usuarios.push(name); 
    this.save(); 
  },
  remove(name) { 
    State.usuarios = State.usuarios.filter(u => u !== name); 
    this.save(); 
  },
  save() { 
    localStorage.setItem('f_usuarios', JSON.stringify(State.usuarios)); 
    Engine.run(); 
  }
};

const salvarPorraInmediato = debounce((u, m, t, v) => {
  State.porras[`p_${u}_${m}_${t}`] = v;
  localStorage.setItem('f_porras', JSON.stringify(State.porras));
  Engine.run();
}, CONFIG.DEBOUNCE_MS);

// Botón de emergencia familiar: Rellena con azar inteligente lo que esté vacío
const rellenarSuerte = () => {
  const matches = State.fixture.filter(m => m.grupo === State.grupoActivo && !Fixture.isLocked(m));
  if (matches.length === 0 || State.usuarios.length === 0) {
    return Toast.warning('No hay partidos abiertos para rellenar en esta sección.');
  }
  
  matches.forEach(m => {
    State.usuarios.forEach(u => {
      if (!State.porras[`p_${u}_${m.id}_A`]) State.porras[`p_${u}_${m.id}_A`] = Math.floor(Math.random() * 4);
      if (!State.porras[`p_${u}_${m.id}_B`]) State.porras[`p_${u}_${m.id}_B`] = Math.floor(Math.random() * 4);
    });
  });
  localStorage.setItem('f_porras', JSON.stringify(State.porras));
  Engine.run();
  Toast.magic('🎲 ¡Suerte echada! Espacios vacíos rellenados.');
};

/* ======================================================
   ORQUESTADOR DE ARRANQUE (App Init)
====================================================== */
const App = {
  async init() {
    if (State.initialized) return; 
    State.initialized = true;

    // Escucha en tiempo real de los marcadores introducidos
    document.addEventListener('input', e => { 
      if (e.target.classList.contains('prediction-input')) {
        salvarPorraInmediato(e.target.dataset.user, e.target.dataset.match, e.target.dataset.team, e.target.value); 
      }
    });

    document.getElementById('btn-refresh')?.addEventListener('click', () => this.refresh());

    // Generador dinámico de botones de grupo superiores
    const filtersBar = document.querySelector('.filters-bar');
    if (filtersBar) {
      filtersBar.innerHTML = CONFIG.GROUPS.map(g => `
        <button class="filter-btn ${State.grupoActivo === g ? 'active' : ''}" data-group="${g}" style="padding:6px 12px; margin-right:6px; border-radius:20px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.04); color:#fff; cursor:pointer; font-weight:700; font-size:12px; transition:all 0.2s;">
          Grupo ${g}
        </button>
      `).join('');
      
      filtersBar.addEventListener('click', e => {
        const btn = e.target.closest('.filter-btn'); 
        if (!btn) return;
        document.querySelectorAll('.filter-btn').forEach(b => { 
          b.classList.remove('active'); 
          b.style.background = 'rgba(255,255,255,0.04)'; 
        });
        btn.classList.add('active'); 
        btn.style.background = 'var(--primary)'; 
        State.grupoActivo = btn.dataset.group; 
        Fixture.render();
      });
    }

    // Inyección de botones en el menú de navegación inferior (Sin alterar HTML)
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) {
      bottomNav.innerHTML = `
        <button id="nav-fixture" style="flex:1; background:none; border:none; color:#fff; display:flex; flex-direction:column; align-items:center; font-size:10px; font-weight:700; gap:4px; cursor:pointer;"><span style="font-size:18px;">⚽</span>Partidos</button>
        <button id="nav-random" style="flex:1; background:none; border:none; color:#a855f7; display:flex; flex-direction:column; align-items:center; font-size:10px; font-weight:800; gap:4px; cursor:pointer;"><span style="font-size:18px;">🎲</span>Suerte</button>
        <button id="nav-add-user" style="flex:1; background:none; border:none; color:#fff; display:flex; flex-direction:column; align-items:center; font-size:10px; font-weight:700; gap:4px; cursor:pointer;"><span style="font-size:18px;">➕</span>Añadir</button>
      `;
      document.getElementById('nav-fixture').addEventListener('click', () => window.scrollTo({top:0, behavior:'smooth'}));
      document.getElementById('nav-random').addEventListener('click', rellenarSuerte);
      document.getElementById('nav-add-user').addEventListener('click', () => {
        const n = prompt("Nombre del familiar:"); 
        if (n) { Users.add(n); Toast.success(`¡${n} se une a la porra!`); }
      });
    }

    await this.cargarDatos();
  },
  
  async cargarDatos() { 
    State.fixture = await API.getMatches(); 
    Engine.run(); 
  },
  
  async refresh() { 
    localStorage.removeItem(CONFIG.CACHE_KEY); 
    Toast.info("Sincronizando con los servidores..."); 
    await this.cargarDatos(); 
    Toast.success("Calendario y resultados al día"); 
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());