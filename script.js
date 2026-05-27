/* ======================================================
   WORLD CUP 2026 • MOTOR LOGICO PREMIUM COPA ULTRA
   Gamificación Avanzada • Avatares • Semáforo de Aciertos
====================================================== */

'use strict';

const CONFIG = {
  API_KEY: '6a2a522096e243a4afec1a2de793e623',
  API_URL: 'https://api.football-data.org/v4/competitions/WC/matches',
  DATA_URL: './data/matches.json',
  CACHE_KEY: 'f_cache_matches_v5',
  CACHE_TTL: 10 * 60 * 1000,
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
   UTILIDADES Y AVATARES
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

// Generador pseudo-aleatorio de avatar basado en el nombre
const getAvatar = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return CONFIG.AVATARS[Math.abs(hash) % CONFIG.AVATARS.length];
};

/* ======================================================
   TOAST NOTIFICATIONS (Sistema HUD)
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
    toast.style.background = 'rgba(15, 23, 42, 0.9)';
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
   CAPA DE RED PROTOCOLO HÍBRIDO (API + LOCAL JSON)
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
    } catch (e) { console.warn("Modo Local Activo..."); }

    try {
      const response = await fetch(CONFIG.DATA_URL);
      const data = await response.json();
      const rawMatches = Array.isArray(data) ? data : (data.matches || []);
      const trans = this.transformFormat(rawMatches, 'LOCAL');
      this.setCache(trans);
      return trans;
    } catch (error) {
      Toast.error("Error al cargar los datos del campeonato");
      return [];
    }
  },

  setCache(data) {
    try { localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() })); } catch {}
  },

  transformFormat(rawArray, origen) {
    return rawArray.map((m, index) => {
      const rawDateStr = m.kickoffUTC || m.utcDate;
      const dateObj = rawDateStr ? new Date(rawDateStr) : new Date();
      const fechaEs = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: 'short', year: 'numeric' }).format(dateObj);
      const horaEs = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false }).format(dateObj);

      let eqA = 'TBD', eqB = 'TBD', flagA = '🏳️', flagB = '🏳️', grupo = 'A';

      if (origen === 'LOCAL') {
        eqA = m.homeTeam?.name || 'TBD'; eqB = m.awayTeam?.name || 'TBD';
        grupo = m.group || 'A';
        const cA = m.homeTeam?.code?.slice(0,2).toLowerCase(); const cB = m.awayTeam?.code?.slice(0,2).toLowerCase();
        flagA = cA ? `<img src="https://flagcdn.com/w40/${cA}.png" onerror="this.outerHTML='${m.homeTeam.flag || '🏳️'}'" style="width:24px; height:16px; border-radius:3px; object-fit:cover;">` : (m.homeTeam?.flag || '🏳️');
        flagB = cB ? `<img src="https://flagcdn.com/w40/${cB}.png" onerror="this.outerHTML='${m.awayTeam.flag || '🏳️'}'" style="width:24px; height:16px; border-radius:3px; object-fit:cover;">` : (m.awayTeam?.flag || '🏳️');
      } else {
        eqA = m.homeTeam?.shortName || m.homeTeam?.name || 'TBD'; eqB = m.awayTeam?.shortName || m.awayTeam?.name || 'TBD';
        grupo = m.group?.replace('GROUP_', '') || 'A';
        const tA = m.homeTeam?.tla?.slice(0,2).toLowerCase(); const tB = m.awayTeam?.tla?.slice(0,2).toLowerCase();
        flagA = tA ? `<img src="https://flagcdn.com/w40/${tA}.png" onerror="this.outerHTML='🏳️'" style="width:24px; height:16px; border-radius:3px; object-fit:cover;">` : '🏳️';
        flagB = tB ? `<img src="https://flagcdn.com/w40/${tB}.png" onerror="this.outerHTML='🏳️'" style="width:24px; height:16px; border-radius:3px; object-fit:cover;">` : '🏳️';
      }

      let scoreA = null, scoreB = null;
      if (m.status === 'FINISHED' || m.score?.fullTime?.home !== null) {
        scoreA = m.score?.fullTime?.home ?? m.score?.home ?? null;
        scoreB = m.score?.fullTime?.away ?? m.score?.away ?? null;
      }

      return {
        id: m.id || index + 1, grupo, fecha: fechaEs, hora: horaEs, estadio: m.venue?.stadium || m.venue || 'Estadio',
        eqA, eqB, flagA, flagB, scoreA, scoreB, esp: eqA.toLowerCase().includes('esp') || eqB.toLowerCase().includes('esp'),
        utcDate: rawDateStr, status: m.status || 'SCHEDULED'
      };
    });
  }
};

/* ======================================================
   MOTOR DE JUEGO (Cálculo de Reglas y Perfiles)
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
      container.innerHTML = `<h3 class="leaderboard-title">📊 Clasificación Familiar</h3><div style="text-align:center; padding:20px; opacity:0.5; font-size:13px;">Registra un familiar abajo para empezar.</div>`;
      return;
    }

    let html = `
      <h3 class="leaderboard-title">🏆 Salón de la Fama</h3>
      <table class="premium-table" style="width:100%; border-collapse:collapse; margin-top:10px;">
        <thead><tr style="text-align:left; font-size:11px; opacity:0.6; border-bottom:1px solid var(--border);">
          <th style="padding:8px 4px;">Rank</th><th>Familiar</th><th style="text-align:center;">J</th>
          <th style="text-align:center;">🎯</th><th style="text-align:right; padding-right:8px;">PTS</th><th></th>
        </tr></thead><tbody>
    `;

    ordenados.forEach(([name, data], idx) => {
      let medalla = `#${idx+1}`;
      if (idx === 0) medalla = '🥇'; else if (idx === 1) medalla = '🥈'; else if (idx === 2) medalla = '🥉';
      
      const rachaFuego = data.exactos >= 3 ? '<span style="font-size:14px; margin-left:4px;" title="Racha imparable">🔥</span>' : '';
      
      html += `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.02); font-size:14px;">
          <td style="padding:14px 4px; font-weight:800; font-size:16px;">${medalla}</td>
          <td style="font-weight:700;">${getAvatar(name)} ${escapeHTML(name)} ${rachaFuego}</td>
          <td style="text-align:center; opacity:0.5; font-size:12px;">${data.partidosJugados}</td>
          <td style="text-align:center; color:var(--success); font-weight:800;">${data.exactos}</td>
          <td style="text-align:right; font-weight:900; color:var(--primary); padding-right:8px; font-size:16px;">${data.puntos}</td>
          <td style="text-align:center;"><button onclick="if(confirm('¿Eliminar a ${escapeHTML(name)}?')) Users.remove('${escapeHTML(name)}')" style="background:none; border:none; color:var(--danger); font-size:14px; cursor:pointer;">✕</button></td>
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
      <h3 style="font-size:14px; font-weight:700; margin-bottom:12px; color:#94a3b8;">🎭 LOS PERFILES</h3>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <div style="background:rgba(34,197,94,0.1); border:1px solid rgba(34,197,94,0.3); padding:10px; border-radius:10px;">
          <div style="font-size:10px; color:#22c55e; font-weight:800;">FRANCOTIRADOR 🎯</div>
          <div style="font-size:14px; font-weight:700; color:#fff;">${getAvatar(masPlenos[0])} ${escapeHTML(masPlenos[0])}</div>
          <div style="font-size:11px; opacity:0.7; margin-top:2px;">${masPlenos[1].exactos} Plenos exactos</div>
        </div>
        <div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); padding:10px; border-radius:10px;">
          <div style="font-size:10px; color:#ef4444; font-weight:800;">EL GOLEADOR 🚀</div>
          <div style="font-size:14px; font-weight:700; color:#fff;">${getAvatar(elLoco[0])} ${escapeHTML(elLoco[0])}</div>
          <div style="font-size:11px; opacity:0.7; margin-top:2px;">${elLoco[1].golesApostados} goles apostados</div>
        </div>
        <div style="background:rgba(168,85,247,0.1); border:1px solid rgba(168,85,247,0.3); padding:10px; border-radius:10px; grid-column: span 2;">
          <div style="font-size:10px; color:#a855f7; font-weight:800;">EL CEMENTO ARMADO 🧱</div>
          <div style="font-size:13px; font-weight:600; color:#fff;">${getAvatar(elCemento[0])} ${escapeHTML(elCemento[0])} predice partidos muy cerrados (${elCemento[1].golesApostados} goles en total).</div>
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
   FIXTURE Y SEMÁFORO DE ACIERTOS
====================================================== */
const Fixture = {
  render() {
    const grid = document.getElementById('grid-fixture');
    if (!grid) return;
    const filtrados = State.fixture.filter(m => m.grupo === State.grupoActivo);

    grid.innerHTML = filtrados.length === 0 
      ? `<div style="text-align:center; padding:30px; opacity:0.5; font-size:13px;">Sin partidos en el Grupo ${State.grupoActivo}.</div>`
      : filtrados.map(m => this.card(m)).join('');
  },

  card(match) {
    const blocked = (new Date(match.utcDate).getTime() - Date.now()) <= CONFIG.LOCK_MINUTES_BEFORE * 60000;
    const isLive = match.status === 'LIVE' || match.status === 'IN_PLAY';
    const isFinished = match.status === 'FINISHED';

    return `
      <article class="match-card" style="background:var(--bg-card); border:1px solid ${match.esp ? '#ef4444' : 'var(--border)'}; border-radius:var(--radius); padding:16px; margin-bottom:12px; position:relative;">
        ${match.esp ? '<div style="position:absolute; top:0; right:16px; background:#ef4444; color:#fff; font-size:9px; font-weight:800; padding:2px 8px; border-radius:0 0 6px 6px;">PARTIDO ESPAÑA (+3)</div>': ''}
        
        <div style="display:flex; justify-content:space-between; margin-bottom:12px; font-size:11px; font-weight:800;">
          <span style="color:var(--primary);">GRUPO ${match.grupo}</span>
          <span style="color:${isLive ? 'var(--warning)' : isFinished ? 'var(--success)' : '#94a3b8'};">${isLive ? '• EN VIVO' : isFinished ? 'FINALIZADO' : 'PROGRAMADO'}</span>
        </div>

        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:8px;">${match.flagA} <span style="font-weight:700; font-size:15px;">${escapeHTML(match.eqA)}</span></div>
          <div style="background:rgba(255,255,255,0.1); font-weight:800; padding:4px 10px; border-radius:6px; font-size:16px;">${match.scoreA ?? '-'}</div>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:14px;">
          <div style="display:flex; align-items:center; gap:8px;">${match.flagB} <span style="font-weight:700; font-size:15px;">${escapeHTML(match.eqB)}</span></div>
          <div style="background:rgba(255,255,255,0.1); font-weight:800; padding:4px 10px; border-radius:6px; font-size:16px;">${match.scoreB ?? '-'}</div>
        </div>

        <div style="border-top:1px solid rgba(255,255,255,0.05); padding-top:10px; display:flex; flex-direction:column; gap:8px;">
          ${State.usuarios.length === 0 ? '<div style="font-size:11px; opacity:0.5; text-align:center;">Añade familiares para apostar.</div>' : ''}
          ${State.usuarios.map(user => {
            const vA = State.porras[`p_${user}_${match.id}_A`] ?? '';
            const vB = State.porras[`p_${user}_${match.id}_B`] ?? '';
            
            // Lógica Semáforo (Feedback visual si el partido acabó)
            let sA = "background:var(--bg-input); border:1px solid var(--border); color:#fff;";
            let sB = sA;
            if (isFinished && vA !== '' && vB !== '') {
              const exact = (vA == match.scoreA && vB == match.scoreB);
              const sign = ((vA>vB && match.scoreA>match.scoreB) || (vA<vB && match.scoreA<match.scoreB) || (vA==vB && match.scoreA==match.scoreB));
              if (exact) { sA = sB = "background:rgba(34,197,94,0.15); border:1px solid #22c55e; color:#22c55e;"; }
              else if (sign) { sA = sB = "background:rgba(245,158,11,0.15); border:1px solid #f59e0b; color:#f59e0b;"; }
              else { sA = sB = "background:rgba(239,68,68,0.1); border:1px solid #ef4444; color:#ef4444; opacity:0.7;"; }
            }

            return `
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:13px; font-weight:600; opacity:0.9;">${getAvatar(user)} ${escapeHTML(user)}</span>
                <div style="display:flex; align-items:center; gap:4px;">
                  <input type="number" inputmode="numeric" min="0" max="15" value="${vA}" class="prediction-input" data-user="${escapeHTML(user)}" data-match="${match.id}" data-team="A" ${blocked ? 'disabled' : ''} style="width:36px; height:30px; text-align:center; border-radius:6px; font-weight:800; font-size:14px; transition:all 0.2s; ${sA}">
                  <span style="opacity:0.3; font-weight:800;">-</span>
                  <input type="number" inputmode="numeric" min="0" max="15" value="${vB}" class="prediction-input" data-user="${escapeHTML(user)}" data-match="${match.id}" data-team="B" ${blocked ? 'disabled' : ''} style="width:36px; height:30px; text-align:center; border-radius:6px; font-weight:800; font-size:14px; transition:all 0.2s; ${sB}">
                </div>
              </div>`;
          }).join('')}
        </div>
        <div style="margin-top:12px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.02); font-size:10px; color:#94a3b8; display:flex; justify-content:space-between;">
          <span>🏟️ ${escapeHTML(match.estadio)}</span><span>🇪🇸 ${match.fecha} • ${match.hora}</span>
        </div>
      </article>`;
  }
};

/* ======================================================
   EVENTOS, AUTO-PORRA Y ARRANQUE
====================================================== */
const Users = {
  add(name) { name = name.trim(); if (!name || State.usuarios.includes(name)) return; State.usuarios.push(name); this.save(); },
  remove(name) { State.usuarios = State.usuarios.filter(u => u !== name); this.save(); },
  save() { localStorage.setItem('f_usuarios', JSON.stringify(State.usuarios)); Engine.run(); }
};

const salvarPorraInmediato = debounce((u, m, t, v) => {
  State.porras[`p_${u}_${m}_${t}`] = v;
  localStorage.setItem('f_porras', JSON.stringify(State.porras));
  Engine.run();
}, CONFIG.DEBOUNCE_MS);

// Función "Bot" para rellenar al azar los espacios vacíos del grupo activo
const rellenarSuerte = () => {
  const matches = State.fixture.filter(m => m.grupo === State.grupoActivo && !Fixture.isLocked(m));
  if (matches.length === 0 || State.usuarios.length === 0) return Toast.warning('No hay partidos libres para rellenar en este grupo.');
  
  matches.forEach(m => {
    State.usuarios.forEach(u => {
      if (!State.porras[`p_${u}_${m.id}_A`]) State.porras[`p_${u}_${m.id}_A`] = Math.floor(Math.random() * 4);
      if (!State.porras[`p_${u}_${m.id}_B`]) State.porras[`p_${u}_${m.id}_B`] = Math.floor(Math.random() * 4);
    });
  });
  localStorage.setItem('f_porras', JSON.stringify(State.porras));
  Engine.run();
  Toast.magic('¡La ruleta ha hablado! Pronósticos rellenados.');
};

const App = {
  async init() {
    if (State.initialized) return; State.initialized = true;

    document.addEventListener('input', e => { if (e.target.classList.contains('prediction-input')) salvarPorraInmediato(e.target.dataset.user, e.target.dataset.match, e.target.dataset.team, e.target.value); });
    document.getElementById('btn-refresh')?.addEventListener('click', () => this.refresh());

    const filtersBar = document.querySelector('.filters-bar');
    if (filtersBar) {
      filtersBar.innerHTML = CONFIG.GROUPS.map(g => `<button class="filter-btn ${State.grupoActivo === g ? 'active' : ''}" data-group="${g}" style="padding:6px 14px; margin-right:6px; border-radius:20px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.05); color:#fff; cursor:pointer; font-weight:700; font-size:12px;">Grupo ${g}</button>`).join('');
      filtersBar.addEventListener('click', e => {
        const btn = e.target.closest('.filter-btn'); if (!btn) return;
        document.querySelectorAll('.filter-btn').forEach(b => { b.classList.remove('active'); b.style.background = 'rgba(255,255,255,0.05)'; });
        btn.classList.add('active'); btn.style.background = 'var(--primary)'; State.grupoActivo = btn.dataset.group; Fixture.render();
      });
    }

    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) {
      bottomNav.innerHTML = `
        <button id="nav-fixture" style="flex:1; background:none; border:none; color:#fff; display:flex; flex-direction:column; align-items:center; font-size:10px; font-weight:700; gap:4px; cursor:pointer;"><span style="font-size:18px;">⚽</span>Partidos</button>
        <button id="nav-random" style="flex:1; background:none; border:none; color:#a855f7; display:flex; flex-direction:column; align-items:center; font-size:10px; font-weight:800; gap:4px; cursor:pointer;"><span style="font-size:18px;">🎲</span>Rellenar</button>
        <button id="nav-add-user" style="flex:1; background:none; border:none; color:#fff; display:flex; flex-direction:column; align-items:center; font-size:10px; font-weight:700; gap:4px; cursor:pointer;"><span style="font-size:18px;">➕</span>Añadir</button>
      `;
      document.getElementById('nav-fixture').addEventListener('click', () => window.scrollTo({top:0, behavior:'smooth'}));
      document.getElementById('nav-random').addEventListener('click', rellenarSuerte);
      document.getElementById('nav-add-user').addEventListener('click', () => {
        const n = prompt("Nuevo participante:"); if (n) { Users.add(n); Toast.success(`¡${n} entra en la batalla!`); }
      });
    }

    await this.cargarDatos();
  },
  async cargarDatos() { State.fixture = await API.getMatches(); Engine.run(); },
  async refresh() { localStorage.removeItem(CONFIG.CACHE_KEY); Toast.info("Sincronizando la central de datos..."); await this.cargarDatos(); Toast.success("Datos en vivo"); }
};

document.addEventListener('DOMContentLoaded', () => App.init());