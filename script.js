/* ======================================================
   WORLD CUP 2026 • MOTOR LOGICO PREMIUM COPA ULTRA
   Estilo Casa de Apuestas • Horario Español • Conexión Resiliente
====================================================== */

'use strict';

const CONFIG = {
  API_KEY: '6a2a522096e243a4afec1a2de793e623',
  API_URL: 'https://api.football-data.org/v4/competitions/WC/matches',
  DATA_URL: './matches.json', // Ruta directa a tu JSON local subido
  CACHE_KEY: 'f_cache_matches_v4',
  CACHE_TTL: 10 * 60 * 1000, // 10 Minutos
  LOCK_MINUTES_BEFORE: 15,
  MAX_RETRY: 2,
  DEBOUNCE_MS: 400,
  GROUPS: ['A','B','C','D','E','F','G','H','I','J','K','L']
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
   UTILIDADES
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

/* ======================================================
   TOAST NOTIFICATIONS (iOS Dark Style)
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
    toast.style.backdropFilter = 'blur(8px)';
    toast.style.color = '#fff';
    toast.style.padding = '12px 16px';
    toast.style.borderRadius = '12px';
    toast.style.fontSize = '13px';
    toast.style.fontWeight = '600';
    toast.style.border = '1px solid rgba(255,255,255,0.08)';
    toast.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
    toast.style.transition = 'all 0.3s ease';
    
    const colorMap = { success: '#22c55e', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
    toast.style.borderLeft = `4px solid ${colorMap[type] || '#fff'}`;
    toast.innerHTML = escapeHTML(message);
    
    this.container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3500);
  },
  success(msg) { this.show(msg, 'success'); },
  error(msg) { this.show(msg, 'error'); },
  warning(msg) { this.show(msg, 'warning'); },
  info(msg) { this.show(msg, 'info'); }
};

/* ======================================================
   CAPA DE RED PROTOCOLO HÍBRIDO (API + LOCAL JSON)
====================================================== */
const API = {
  async getMatches() {
    // 1. Intentar Caché primero
    try {
      const cache = JSON.parse(localStorage.getItem(CONFIG.CACHE_KEY) || '{}');
      if (cache.timestamp && Date.now() - cache.timestamp < CONFIG.CACHE_TTL) {
        return cache.data;
      }
    } catch {}

    // 2. Intentar API Pública Externa de Internet
    try {
      const response = await fetch(CONFIG.API_URL, {
        headers: { 'X-Auth-Token': CONFIG.API_KEY }
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.matches) {
          const trans = this.transformFormat(data.matches, 'API');
          this.setCache(trans);
          return trans;
        }
      }
    } catch (e) {
      console.warn("API Externa no disponible, recurriendo a base de datos local...");
    }

    // 3. Fallback absoluto a tu archivo matches.json local
    try {
      const response = await fetch(CONFIG.DATA_URL);
      const data = await response.json();
      const rawMatches = Array.isArray(data) ? data : (data.matches || []);
      const trans = this.transformFormat(rawMatches, 'LOCAL');
      this.setCache(trans);
      return trans;
    } catch (error) {
      console.error("Error crítico leyendo archivos de datos:", error);
      Toast.error("Error al conectar con el servidor de datos");
      return [];
    }
  },

  setCache(data) {
    try { localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() })); } catch {}
  },

  transformFormat(rawArray, origen) {
    return rawArray.map((m, index) => {
      // Normalización de fechas a Horario de España (Europa/Madrid)
      const rawDateStr = m.kickoffUTC || m.utcDate;
      const dateObj = rawDateStr ? new Date(rawDateStr) : new Date();
      
      const fechaEs = new Intl.DateTimeFormat('es-ES', { 
        timeZone: 'Europe/Madrid', day: '2-digit', month: 'short', year: 'numeric' 
      }).format(dateObj);
      
      const horaEs = new Intl.DateTimeFormat('es-ES', { 
        timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false 
      }).format(dateObj);

      // Normalización de equipos según origen de datos (API o JSON Propio)
      let eqA = 'TBD', eqB = 'TBD', flagA = '', flagB = '';
      let grupo = 'A';

      if (origen === 'LOCAL') {
        eqA = m.homeTeam?.name || 'TBD';
        eqB = m.awayTeam?.name || 'TBD';
        flagA = m.homeTeam?.code ? `https://flagcdn.com/w160/${m.homeTeam.code.slice(0,2).toLowerCase()}.png` : '';
        flagB = m.awayTeam?.code ? `https://flagcdn.com/w160/${m.awayTeam.code.slice(0,2).toLowerCase()}.png` : '';
        grupo = m.group || 'A';
      } else {
        eqA = m.homeTeam?.shortName || m.homeTeam?.name || 'TBD';
        eqB = m.awayTeam?.shortName || m.awayTeam?.name || 'TBD';
        flagA = m.homeTeam?.tla ? `https://flagcdn.com/w160/${m.homeTeam.tla.slice(0,2).toLowerCase()}.png` : '';
        flagB = m.awayTeam?.tla ? `https://flagcdn.com/w160/${m.awayTeam.tla.slice(0,2).toLowerCase()}.png` : '';
        grupo = m.group?.replace('GROUP_', '') || 'A';
      }

      // Detectar si juega la selección de España
      const esEspana = eqA.toLowerCase().includes('esp') || eqB.toLowerCase().includes('esp');

      // Puntuaciones reales consolidadas
      let scoreA = null, scoreB = null;
      if (m.status === 'FINISHED' || m.score?.fullTime?.home !== null) {
        scoreA = m.score?.fullTime?.home ?? m.score?.home ?? null;
        scoreB = m.score?.fullTime?.away ?? m.score?.away ?? null;
      }

      return {
        id: m.id || index + 1,
        grupo: grupo,
        fecha: fechaEs,
        hora: horaEs,
        estadio: m.venue?.stadium || m.venue || 'Estadio Oficial',
        eqA, eqB, flagA, flagB,
        scoreA, scoreB,
        esp: esEspana,
        utcDate: rawDateStr,
        status: m.status || 'SCHEDULED'
      };
    });
  }
};

/* ======================================================
   GESTIÓN DE PARTICIPANTES (Clan Familiar)
====================================================== */
const Users = {
  add(name) {
    name = name.trim();
    if (!name) return false;
    if (State.usuarios.some(u => u.toLowerCase() === name.toLowerCase())) {
      Toast.warning('Este nombre ya existe en el clan');
      return false;
    }
    State.usuarios.push(name);
    this.save();
    return true;
  },
  remove(name) {
    State.usuarios = State.usuarios.filter(u => u !== name);
    Object.keys(State.porras).forEach(k => { if (k.includes(`_${name}_`)) delete State.porras[k]; });
    this.save();
  },
  save() {
    localStorage.setItem('f_usuarios', JSON.stringify(State.usuarios));
    Engine.run();
  }
};

/* ======================================================
   MOTOR DE PUNTOS REGLAMENTO PREMIUM (Estilo Apuestas)
====================================================== */
const Engine = {
  run() {
    const ranking = {};
    State.usuarios.forEach(u => {
      ranking[u] = { puntos: 0, exactos: 0, signos: 0, golesAcertados: 0, partidosJugados: 0 };
    });

    // Calcular puntos de cada participante
    State.fixture.forEach(match => {
      if (match.scoreA == null || match.scoreB == null) return;

      State.usuarios.forEach(user => {
        const predA = parseInt(State.porras[`p_${user}_${match.id}_A`]);
        const predB = parseInt(State.porras[`p_${user}_${match.id}_B`]);
        if (isNaN(predA) || isNaN(predB)) return;

        ranking[user].partidosJugados++;
        
        const realA = match.scoreA;
        const realB = match.scoreB;

        const signoReal = realA > realB ? '1' : realA < realB ? '2' : 'X';
        const signoUser = predA > predB ? '1' : predA < predB ? '2' : 'X';

        let ptsPartido = 0;

        // 1. Pleno Absoluto (Resultado exacto) -> +5 Puntos
        if (predA === realA && predB === realB) {
          ptsPartido += 5;
          ranking[user].exactos++;
          // Multiplicador Selección Española -> +3 Puntos extra
          if (match.esp) ptsPartido += 3;
        }

        // 2. Acertar el Ganador o Empate (Signo 1X2) -> +2 Puntos
        if (signoReal === signoUser) {
          ptsPartido += 2;
          ranking[user].signos++;
        }

        // 3. Puntos por Goles Individuales -> +1 por cada uno
        if (predA === realA) { ptsPartido += 1; ranking[user].golesAcertados++; }
        if (predB === realB) { ptsPartido += 1; ranking[user].golesAcertados++; }

        // 4. Acertar Diferencia Exacta de goles (siempre que no sea empate ya sumado)
        if ((realA - realB) === (predA - predB) && signoReal !== 'X') {
          ptsPartido += 1;
        }

        ranking[user].puntos += ptsPartido;
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
      container.innerHTML = `
        <h3 class="leaderboard-title">📊 Clasificación Familiar</h3>
        <div style="text-align:center; padding:20px; color:var(--text); opacity:0.5; font-size:13px;">
          Añade competidores en el menú inferior para iniciar la porra.
        </div>`;
      return;
    }

    let html = `
      <h3 class="leaderboard-title">📊 Clasificación General</h3>
      <table class="premium-table" style="width:100%; border-collapse:collapse; margin-top:10px;">
        <thead>
          <tr style="text-align:left; font-size:12px; opacity:0.7; border-bottom:1px solid var(--border);">
            <th style="padding:8px 4px;">Pos</th>
            <th>Usuario</th>
            <th style="text-align:center;">Porras</th>
            <th style="text-align:center;">🎯 Plenos</th>
            <th style="text-align:right; padding-right:8px;">Puntos</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
    `;

    ordenados.forEach(([name, data], idx) => {
      html += `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.02); font-size:14px;">
          <td style="padding:12px 4px; font-weight:700; color:${idx===0?'var(--warning)':idx===1?'#cbd5e1':'#b45309'}">#${idx+1}</td>
          <td style="font-weight:600; color:var(--text);">${escapeHTML(name)}</td>
          <td style="text-align:center; opacity:0.6;">${data.partidosJugados}</td>
          <td style="text-align:center; color:var(--success); font-weight:700;">${data.exactos}</td>
          <td style="text-align:right; font-weight:800; color:var(--text); padding-right:8px; font-size:15px;">${data.puntos} pts</td>
          <td style="text-align:center;">
            <button onclick="Users.remove('${escapeHTML(name)}')" style="background:none; border:none; color:var(--danger); font-size:12px; cursor:pointer; padding:4px;">✕</button>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
  },

  renderStatsPanel(ranking) {
    const container = document.getElementById('estadisticas-avanzadas');
    if (!container) return;

    const ordenados = Object.entries(ranking).sort((a,b) => b[1].puntos - a[1].puntos);
    if (ordenados.length === 0) { container.innerHTML = ''; return; }

    const [nombreLider, datosLider] = ordenados[0];
    
    // Buscar el rey de los plenos (quien tenga más resultados exactos)
    const masPlenos = [...ordenados].sort((a,b) => b[1].exactos - a[1].exactos)[0];

    container.innerHTML = `
      <h3 style="font-size:14px; font-weight:700; margin-bottom:12px; letter-spacing:0.5px;">📈 Panel de Rendimiento (Reglas de Apuesta)</h3>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
        <div class="stat-card" style="background:rgba(255,255,255,0.02); border:1px solid var(--border); padding:12px; border-radius:12px;">
          <span style="font-size:11px; color:var(--warning); font-weight:700; display:block; margin-bottom:4px;">👑 LÍDER ACTUAL</span>
          <span style="font-size:16px; font-weight:700; color:#fff;">${escapeHTML(nombreLider)}</span>
          <small style="display:block; opacity:0.5; font-size:10px; margin-top:2px;">Dominando la porra familiar</small>
        </div>
        <div class="stat-card" style="background:rgba(255,255,255,0.02); border:1px solid var(--border); padding:12px; border-radius:12px;">
          <span style="font-size:11px; color:var(--success); font-weight:700; display:block; margin-bottom:4px;">🎯 REY DEL PLENO</span>
          <span style="font-size:16px; font-weight:700; color:#fff;">${escapeHTML(masPlenos[0])}</span>
          <small style="display:block; opacity:0.5; font-size:10px; margin-top:2px;">${masPlenos[1].exactos} resultados exactos (+5)</small>
        </div>
      </div>
      
      <div style="margin-top:12px; background:rgba(59,130,246,0.05); border:1px solid rgba(59,130,246,0.15); border-radius:8px; padding:10px; font-size:11px; line-height:1.4; color:#93c5fd;">
        <strong>Distribución del Reglamento:</strong> Resultado Exacto (<b>+5 pts</b>) | Signo 1X2 (<b>+2 pts</b>) | Goles de un equipo (<b>+1 pt</b>) | Especial España (<b>+3 pts extra</b>).
      </div>
    `;
  },

  updateGlobalCounters() {
    const total = State.fixture.length;
    const finalizados = State.fixture.filter(m => m.scoreA != null && m.scoreB != null).length;
    const enVivo = State.fixture.filter(m => m.status === 'LIVE' || m.status === 'IN_PLAY').length;

    const tM = document.getElementById('totalMatches'); if(tM) tM.textContent = total;
    const tP = document.getElementById('totalPlayed'); if(tP) tP.textContent = finalizados;
    const tL = document.getElementById('totalLive'); if(tL) tL.textContent = enVivo;
    const tU = document.getElementById('totalUsers'); if(tU) tU.textContent = State.usuarios.length;
  }
};

/* ======================================================
   FIXTURE (Estructura de Tarjetas Adaptable)
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

    if (filtrados.length === 0) {
      grid.innerHTML = `<div style="text-align:center; padding:30px; opacity:0.5; font-size:13px; color:#fff;">No hay partidos cargados para el Grupo ${State.grupoActivo}.</div>`;
      return;
    }

    grid.innerHTML = filtrados.map(match => {
      const blocked = this.isLocked(match);
      const enVivo = match.status === 'LIVE' || match.status === 'IN_PLAY';
      
      return `
        <article class="match-card" style="background:var(--bg-card); border:1px solid ${match.esp ? 'rgba(239,68,68,0.25)' : 'var(--border)'}; border-radius:var(--radius); padding:16px; margin-bottom:12px; position:relative;">
          ${match.esp ? '<div style="position:absolute; top:0; right:16px; background:#ef4444; color:#fff; font-size:9px; font-weight:800; padding:2px 8px; border-radius:0 0 6px 6px; letter-spacing:0.5px;">PARTIDO ESPECIAL (+3 PTS)</div>': ''}
          
          <div class="match-header" style="display:flex; justify-content:between; align-items:center; margin-bottom:12px; font-size:11px; font-weight:700; opacity:0.8;">
            <span style="color:var(--primary);">GRUPO ${match.grupo}</span>
            <span style="margin-left:auto; color:${enVivo ? 'var(--danger)' : 'var(--success)'};">
              ${enVivo ? '• EN VIVO' : match.status === 'FINISHED' ? 'FINALIZADO' : 'HORARIO ESPAÑA'}
            </span>
          </div>

          <div class="match-body-row" style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <div style="display:flex; align-items:center; gap:8px;">
              ${match.flagA ? `<img src="${match.flagA}" style="width:20px; height:14px; border-radius:2px; object-fit:cover;">` : '🏳️'}
              <span style="font-weight:600; font-size:14px;">${escapeHTML(match.eqA)}</span>
            </div>
            <div style="background:rgba(255,255,255,0.05); font-weight:800; padding:4px 10px; border-radius:6px; font-size:15px; min-width:32px; text-align:center;">
              ${match.scoreA ?? '-'}
            </div>
          </div>

          <div class="match-body-row" style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
            <div style="display:flex; align-items:center; gap:8px;">
              ${match.flagB ? `<img src="${match.flagB}" style="width:20px; height:14px; border-radius:2px; object-fit:cover;">` : '🏳️'}
              <span style="font-weight:600; font-size:14px;">${escapeHTML(match.eqB)}</span>
            </div>
            <div style="background:rgba(255,255,255,0.05); font-weight:800; padding:4px 10px; border-radius:6px; font-size:15px; min-width:32px; text-align:center;">
              ${match.scoreB ?? '-'}
            </div>
          </div>

          <div class="predictions-area" style="border-top:1px solid rgba(255,255,255,0.04); padding-top:10px; display:flex; flex-direction:column; gap:8px;">
            ${State.usuarios.length === 0 ? '<div style="font-size:11px; opacity:0.5; text-align:center; padding:4px;">Registra un familiar abajo para escribir pronósticos.</div>' : ''}
            ${State.usuarios.map(user => {
              const valA = State.porras[`p_${user}_${match.id}_A`] ?? '';
              const valB = State.porras[`p_${user}_${match.id}_B`] ?? '';
              return `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                  <span style="font-size:12px; font-weight:500; opacity:0.8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:120px;">👤 ${escapeHTML(user)}</span>
                  <div style="display:flex; align-items:center; gap:4px;">
                    <input type="number" inputmode="numeric" min="0" max="15" value="${valA}" 
                      class="prediction-input" data-user="${escapeHTML(user)}" data-match="${match.id}" data-team="A" ${blocked ? 'disabled' : ''}
                      style="width:36px; height:28px; text-align:center; background:var(--bg-input); border:1px solid var(--border); color:#fff; border-radius:6px; font-weight:700; font-size:13px;">
                    <span style="opacity:0.3; font-weight:700;">:</span>
                    <input type="number" inputmode="numeric" min="0" max="15" value="${valB}" 
                      class="prediction-input" data-user="${escapeHTML(user)}" data-match="${match.id}" data-team="B" ${blocked ? 'disabled' : ''}
                      style="width:36px; height:28px; text-align:center; background:var(--bg-input); border:1px solid var(--border); color:#fff; border-radius:6px; font-weight:700; font-size:13px;">
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <div class="match-footer" style="margin-top:10px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.02); display:flex; justify-content:space-between; font-size:11px; opacity:0.5;">
            <span style="max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">📍 ${escapeHTML(match.estadio)}</span>
            <span style="font-weight:700; color:var(--text); opacity:0.9;">🇪🇸 ${match.fecha} • ${match.hora}</span>
          </div>
        </article>
      `;
    }).join('');
  }
};

/* ======================================================
   GUARDADO AUTOMÁTICO ANTIRREBOTES
====================================================== */
const salvarPorraInmediato = debounce((user, matchId, team, value) => {
  State.porras[`p_${user}_${matchId}_${team}`] = value;
  localStorage.setItem('f_porras', JSON.stringify(State.porras));
  Engine.run();
}, CONFIG.DEBOUNCE_MS);

/* ======================================================
   INICIALIZACIÓN DE LA APLICACIÓN
====================================================== */
const App = {
  async init() {
    if (State.initialized) return;
    State.initialized = true;

    // Escuchar inputs dinámicos de los marcadores de la porra
    document.addEventListener('input', e => {
      if (e.target.classList.contains('prediction-input')) {
        salvarPorraInmediato(e.target.dataset.user, e.target.dataset.match, e.target.dataset.team, e.target.value);
      }
    });

    // Evento manual para el botón refrescar superior
    document.getElementById('btn-refresh')?.addEventListener('click', () => this.refresh());

    // Generar la barra de botones de grupos (A - L)
    const filtersBar = document.querySelector('.filters-bar');
    if (filtersBar) {
      filtersBar.innerHTML = CONFIG.GROUPS.map(g => `
        <button class="filter-btn ${State.grupoActivo === g ? 'active' : ''}" data-group="${g}" style="padding:6px 12px; margin-right:6px; border-radius:8px; border:1px solid var(--border); background:rgba(255,255,255,0.02); color:#fff; cursor:pointer; font-weight:600; font-size:12px;">
          Grupo ${g}
        </button>
      `).join('');

      filtersBar.addEventListener('click', e => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;
        document.querySelectorAll('.filter-btn').forEach(b => {
          b.classList.remove('active');
          b.style.background = 'rgba(255,255,255,0.02)';
        });
        btn.classList.add('active');
        btn.style.background = 'var(--primary)';
        State.grupoActivo = btn.dataset.group;
        Fixture.render();
      });
    }

    // Configurar menú inferior de navegación e inserción de participantes
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) {
      bottomNav.innerHTML = `
        <button class="nav-item active" id="nav-fixture" style="flex:1; background:none; border:none; color:#fff; display:flex; flex-direction:column; align-items:center; font-size:11px; gap:2px; cursor:pointer;">
          <span style="font-size:16px;">⚽</span><span>Partidos</span>
        </button>
        <button class="nav-item" id="nav-add-user" style="flex:1; background:none; border:none; color:#fff; display:flex; flex-direction:column; align-items:center; font-size:11px; gap:2px; cursor:pointer;">
          <span style="font-size:16px;">➕</span><span>Añadir Familiar</span>
        </button>
      `;

      document.getElementById('nav-fixture').addEventListener('click', () => window.scrollTo({top:0, behavior:'smooth'}));
      document.getElementById('nav-add-user').addEventListener('click', () => {
        const nuevoNombre = prompt("Introduce el nombre del nuevo participante de la porra:");
        if (nuevoNombre && Users.add(nuevoNombre)) {
          Toast.success(`¡${nuevoNombre} añadido a la porra!`);
        }
      });
    }

    // Carga inicial de datos
    await this.cargarDatos();
  },

  async cargarDatos() {
    try {
      State.isLoading = true;
      State.fixture = await API.getMatches();
      Engine.run();
    } catch (err) {
      console.error(err);
    } finally {
      State.isLoading = false;
    }
  },

  async refresh() {
    localStorage.removeItem(CONFIG.CACHE_KEY);
    Toast.info("Sincronizando marcadores en tiempo real...");
    await this.cargarDatos();
    Toast.success("Datos y posiciones actualizados con éxito");
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());