'use strict';
/* ======================================================
   WORLD CUP 2026 • APPLE EDITION • PRO ENGINE 2.0
   Optimizado para Android Mobile
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
  TIMEZONES: { 'Canada': 'America/Toronto', 'Mexico': 'America/Mexico_City', 'United States': 'America/New_York', 'USA': 'America/New_York' }
};

const State = {
  fixture: [],
  usuarios: JSON.parse(localStorage.getItem('f_usuarios')) || [],
  porras: JSON.parse(localStorage.getItem('f_porras')) || {},
  grupoActivo: 'A',
  filtroActivo: 'grupo',
  isOnline: navigator.onLine,
  isLoading: false
};

const debounce = (fn, ms = CONFIG.DEBOUNCE_MS) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), ms);
  };
};

const escapeHTML = (str) => {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
};

const haptic = (pattern = 10) => { if ('vibrate' in navigator) { try { navigator.vibrate(pattern); } catch {} } };

const dateFormatters = new Map();
const getFormatter = (locale, options) => {
  const key = `${locale}_${JSON.stringify(options)}`;
  if (!dateFormatters.has(key)) dateFormatters.set(key, new Intl.DateTimeFormat(locale, options));
  return dateFormatters.get(key);
};

const Toast = {
  container: null,
  init() { this.container = document.getElementById('toast-container'); },
  show(message, type = 'info', duration = 3000) {
    if (!this.container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<div class="toast-icon" aria-hidden="true">${this.getIcon(type)}</div><span>${escapeHTML(message)}</span>`;
    this.container.appendChild(toast);
    setTimeout(() => { toast.classList.add('toast-exit'); setTimeout(() => toast.remove(), 300); }, duration);
    haptic(type === 'error' ? [30, 50, 30] : 10);
  },
  getIcon(type) { return { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' }[type] || 'ℹ'; },
  success(msg) { this.show(msg, 'success'); }, error(msg) { this.show(msg, 'error', 4000); },
  warning(msg) { this.show(msg, 'warning', 3500); }, info(msg) { this.show(msg, 'info'); }
};

const Modal = {
  show(id) { const m = document.getElementById(id); if (!m) return; m.hidden = false; document.body.style.overflow = 'hidden'; m.querySelector('input, button')?.focus(); },
  hide(id) { const m = document.getElementById(id); if (!m) return; m.hidden = true; document.body.style.overflow = ''; },
  confirm(message, onConfirm, title = '¿Estás seguro?') {
    const modal = document.getElementById('modal-confirm'); if (!modal) { if (confirm(message)) onConfirm(); return; }
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    const ok = document.getElementById('confirm-ok'), cancel = document.getElementById('confirm-cancel');
    const cleanup = () => { ok.onclick = null; cancel.onclick = null; this.hide('modal-confirm'); };
    ok.onclick = () => { cleanup(); onConfirm(); }; cancel.onclick = () => cleanup();
    this.show('modal-confirm');
  }
};

const obtenerBandera = (code) => !code ? 'https://flagcdn.com/w160/un.png' : `https://flagcdn.com/w160/${code.toLowerCase()}.png`;

const Clock = {
  interval: null,
  getTime(tz) { try { return getFormatter('es-ES', { hour:'2-digit', minute:'2-digit', second:'2-digit', timeZone: tz || 'Europe/Madrid' }).format(new Date()); } catch { return '--:--'; } },
  start() { this.update(); this.interval = setInterval(() => this.update(), 1000); },
  update() { document.querySelectorAll('.live-clock').forEach(c => { c.textContent = `🕒 ${this.getTime(c.dataset.timezone)};` }); }
};

const API = {
  async fetchWithRetry(url, options = {}, retries = CONFIG.MAX_RETRY) {
    for (let i = 0; i <= retries; i++) {
      try { const r = await fetch(url, options); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r; } 
      catch (e) { if (i === retries) throw e; await new Promise(r => setTimeout(r, 1000 * (i + 1))); }
    }
  },
  getCache() {
    try { const c = JSON.parse(localStorage.getItem(CONFIG.CACHE_KEY) || '{}'); if (Date.now() - c.timestamp > CONFIG.CACHE_TTL) return null; return c.data; } catch { return null; }
  },
  setCache(data) { try { localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() })); } catch {} },
  async getMatches() {
    const c = this.getCache(); if (c) return c;
    try {
      const r = await this.fetchWithRetry(CONFIG.API_URL, { headers: { 'X-Auth-Token': CONFIG.API_KEY } });
      const d = await r.json(); if (d.matches?.length) { const t = this.transformAPI(d.matches); this.setCache(t); return t; }
      throw new Error('API vacía');
    } catch { return await this.getLocalJSON(); }
  },
  async getLocalJSON() {
    try { const r = await fetch(CONFIG.DATA_URL); if (!r.ok) throw new Error('No JSON local'); let d = await r.json(); return Array.isArray(d) ? d : [d]; } 
    catch { Toast.error('Datos offline no disponibles'); return []; }
  },
  transformAPI(matches) {
    return matches.map((m, i) => {
      const h = m.homeTeam || {}, a = m.awayTeam || {}, u = new Date(m.utcDate);
      return {
        id: m.id || i, grupo: this.detectGroup(m, i),
        fecha: getFormatter('es-ES', { day:'2-digit', month:'short', year:'numeric' }).format(u),
        hora: getFormatter('es-ES', { hour:'2-digit', minute:'2-digit' }).format(u),
        estadio: m.venue || 'Estadio', ciudad: m.area?.name || '', timezone: this.detectTimezone(m.area?.name),
        eqA: h.shortName || h.name || 'TBD', eqB: a.shortName || a.name || 'TBD',
        flagA: obtenerBandera(h.tla || h.code), flagB: obtenerBandera(a.tla || a.code),
        esp: h.name === 'Spain' || a.name === 'Spain',
        scoreA: m.status === 'FINISHED' ? m.score?.fullTime?.home : null,
        scoreB: m.status === 'FINISHED' ? m.score?.fullTime?.away : null,
        utcDate: m.utcDate, status: m.status
      };
    });
  },
  transformLocal(matches) {
    return matches.map((m, i) => {
      const h = m.homeTeam || {}, a = m.awayTeam || {}, u = m.kickoffUTC ? new Date(m.kickoffUTC) : new Date();
      return { id: m.id || i, grupo: m.group || CONFIG.GROUPS[i % CONFIG.GROUPS.length],
        fecha: getFormatter('es-ES', { day:'2-digit', month:'short', year:'numeric' }).format(u),
        hora: getFormatter('es-ES', { hour:'2-digit', minute:'2-digit' }).format(u),
        estadio: m.venue?.stadium || 'Estadio', ciudad: m.venue?.city || '', timezone: m.localTime?.timezone || 'Europe/Madrid',
        eqA: h.name || 'TBD', eqB: a.name || 'TBD', flagA: obtenerBandera(h.code), flagB: obtenerBandera(a.code),
        esp: h.name?.includes('España') || a.name?.includes('España'),
        scoreA: m.score?.home ?? null, scoreB: m.score?.away ?? null, utcDate: m.kickoffUTC || u.toISOString(), status: m.status || 'SCHEDULED' };
    });
  },
  detectGroup(m, i) { return m.group?.replace('GROUP_', '') || CONFIG.GROUPS[i % CONFIG.GROUPS.length]; },
  detectTimezone(city) { for (const [k, v] of Object.entries(CONFIG.TIMEZONES)) if (city?.includes(k)) return v; return 'Europe/Madrid'; }
};

const Users = {
  add(n) {
    n = n.trim(); if (!n) return Toast.warning('Escribe un nombre'), false;
    if (n.length > 20) return Toast.warning('Máx. 20 caracteres'), false;
    if (State.usuarios.some(u => u.toLowerCase() === n.toLowerCase())) return Toast.warning('Ya existe'), false;
    State.usuarios.push(n); this.save(); Toast.success(`${n} añadido`); haptic(20); return true;
  },
  remove(n) {
    Modal.confirm(`¿Eliminar a ${n}?`, () => {
      State.usuarios = State.usuarios.filter(u => u !== n);
      Object.keys(State.porras).forEach(k => { if (k.includes(`_${n}_`)) delete State.porras[k]; });
      this.save(); localStorage.setItem('f_porras', JSON.stringify(State.porras)); Engine.run(); Toast.info(`${n} eliminado`);
    }, 'Eliminar participante');
  },
  save() { localStorage.setItem('f_usuarios', JSON.stringify(State.usuarios)); Engine.run(); }
};

const Engine = {
  run() { const r = this.calculateRanking(); this.renderLeaderboard(r); this.renderStats(r); Fixture.render(); Stats.update(); },
  calculateRanking() {
    const r = {}; State.usuarios.forEach(u => { r[u] = { puntos: 0, exactos: 0, acertados: 0, golesExactos: 0, diferenciaExacta: 0, bonusEspana: 0, fallados: 0, partidos: 0, porcentaje: 0, rachaActual: 0, mejorRacha: 0 }; });
    State.fixture.forEach(p => {
      if (p.scoreA == null || p.scoreB == null) return;
      State.usuarios.forEach(u => {
        const a = parseInt(State.porras[`p_${u}_${p.id}_A`]), b = parseInt(State.porras[`p_${u}_${p.id}_B`]);
        if (isNaN(a) || isNaN(b)) return r[u].fallados++;
        r[u].partidos++; r[u].puntos += this.calculatePoints(p, a, b, r[u]);
      });
    });
    Object.values(r).forEach(s => s.porcentaje = s.partidos ? Math.round((s.acertados / s.partidos) * 100) : 0);
    return r;
  },
  calculatePoints(p, a, b, s) {
    let pts = 0; const wReal = p.scoreA > p.scoreB ? 'A' : p.scoreA < p.scoreB ? 'B' : 'E', wUser = a > b ? 'A' : a < b ? 'B' : 'E';
    if (a === p.scoreA && b === p.scoreB) { pts += 5; s.exactos++; }
    if (wReal === wUser) { pts += 2; s.acertados++; }
    if (a === p.scoreA) { pts++; s.golesExactos++; } if (b === p.scoreB) { pts++; s.golesExactos++; }
    if (p.scoreA - p.scoreB === a - b) { pts++; s.diferenciaExacta++; }
    if (p.esp && a === p.scoreA && b === p.scoreB) { pts += 3; s.bonusEspana++; }
    if (pts > 0) { s.rachaActual++; if (s.rachaActual > s.mejorRacha) s.mejorRacha = s.rachaActual; } else s.rachaActual = 0;
    return pts;
  },
  renderLeaderboard(r) {
    const c = document.getElementById('tabla-clasificacion'); if (!c) return;
    const sorted = Object.entries(r).sort((a, b) => b[1].puntos - a[1].puntos);
    c.innerHTML = sorted.length === 0 ? `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span>Sin participantes aún</span></div>` :
      sorted.map(([n, s], i) => `<div class="leaderboard-item" data-user="${escapeHTML(n)}"><div class="leader-rank">${i+1}</div><div class="leader-info"><div class="leader-name">${escapeHTML(n)}</div><div class="leader-stats">🎯 ${s.exactos} · ✅ ${s.acertados} · 🔥 ${s.mejorRacha}</div></div><div class="score-pill">${s.puntos}</div><button class="icon-button-sm delete-btn" data-action="delete-user" data-user="${escapeHTML(n)}" aria-label="Eliminar ${escapeHTML(n)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>`).join('');
  },
  renderStats(r) {
    const c = document.getElementById('estadisticas-avanzadas'); if (!c) return;
    const sorted = Object.entries(r).sort((a, b) => b[1].puntos - a[1].puntos);
    if (!sorted.length) return c.innerHTML = '';
    const [n, s] = sorted[0];
    c.innerHTML = `<div class="advanced-stats-grid"><div class="stat-card"><div class="stat-title">👑 Líder</div><div class="stat-value">${escapeHTML(n)}</div></div><div class="stat-card"><div class="stat-title">🏆 Puntos</div><div class="stat-value">${s.puntos}</div></div><div class="stat-card"><div class="stat-title">🎯 Exactos</div><div class="stat-value">${s.exactos}</div></div><div class="stat-card"><div class="stat-title">🔥 Racha</div><div class="stat-value">${s.mejorRacha}</div></div></div>`;
  }
};

const Fixture = {
  isLocked(p) { return !p.utcDate ? false : (new Date(p.utcDate).getTime() - Date.now()) <= CONFIG.LOCK_MINUTES_BEFORE * 60000; },
  getFiltered() { return State.filtroActivo === 'todos' ? State.fixture : State.filtroActivo === 'espana' ? State.fixture.filter(p => p.esp) : State.fixture.filter(p => p.grupo === State.grupoActivo); },
  render() {
    const g = document.getElementById('grid-fixture'); if (!g) return; const p = this.getFiltered();
    document.getElementById('txt-contador').textContent = `${p.length} ${p.length === 1 ? 'partido' : 'partidos'}`;
    if (!p.length) return g.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6v6H9z"/></svg><span>No hay partidos</span></div>`;
    const f = document.createDocumentFragment(); p.forEach(m => { const c = document.createElement('article'); c.className = 'match-card glass-card'; c.setAttribute('role', 'listitem'); c.innerHTML = this.card(m); f.appendChild(c); });
    g.innerHTML = ''; g.appendChild(f);
  },
  card(p) {
    const bloq = this.isLocked(p);
    return `<div class="match-header"><div><div class="flex gap-2 flex-wrap"><span class="group-pill">Grupo ${escapeHTML(p.grupo)}</span>${p.esp ? '<span class="spain-pill">🇪🇸 ESPAÑA</span>' : ''}${this.badge(p.status)}</div><div class="stadium-text">📍 ${escapeHTML(p.estadio)}</div>${p.ciudad ? `<div class="stadium-timezone">${escapeHTML(p.ciudad)}</div>` : ''}</div><div class="text-right"><div class="date-text">${escapeHTML(p.fecha)}</div><div class="hour-text">${escapeHTML(p.hora)}</div><div class="live-clock" data-timezone="${escapeHTML(p.timezone)}">🕒 --:--</div></div></div><div class="teams-grid"><div class="team-side"><img src="${p.flagA}" class="flag-img" loading="lazy" alt="Bandera ${escapeHTML(p.eqA)}" onerror="this.src='https://flagcdn.com/w160/un.png'"><div class="team-name">${escapeHTML(p.eqA)}</div></div><div class="score-center">${p.scoreA != null ? `<div class="score-live">${p.scoreA} - ${p.scoreB}</div>` : '<div class="vs-text">VS</div>'}</div><div class="team-side"><img src="${p.flagB}" class="flag-img" loading="lazy" alt="Bandera ${escapeHTML(p.eqB)}" onerror="this.src='https://flagcdn.com/w160/un.png'"><div class="team-name">${escapeHTML(p.eqB)}</div></div></div>${State.usuarios.length ? `<div class="predictions">${State.usuarios.map(u => this.row(u, p, bloq)).join('')}</div>` : '<div class="empty-state" style="padding:1rem"><span>Añade participantes</span></div>'}`;
  },
  row(u, p, bloq) {
    const a = State.porras[`p_${u}_${p.id}_A`] ?? '', b = State.porras[`p_${u}_${p.id}_B`] ?? '';
    return `<div class="prediction-row"><div class="prediction-user">${escapeHTML(u)}</div><div class="prediction-inputs"><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" value="${a}" class="prediction-input" data-user="${escapeHTML(u)}" data-match="${p.id}" data-team="A" ${bloq?'disabled':''} aria-label="Goles ${escapeHTML(p.eqA)} para ${escapeHTML(u)}"><span>-</span><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" value="${b}" class="prediction-input" data-user="${escapeHTML(u)}" data-match="${p.id}" data-team="B" ${bloq?'disabled':''} aria-label="Goles ${escapeHTML(p.eqB)} para ${escapeHTML(u)}"></div></div>`;
  },
  badge(s) { return { 'IN_PLAY':'<span class="live-pill-mini"><span class="live-dot-mini"></span>EN VIVO</span>', 'PAUSED':'<span class="spain-pill">DESCANSO</span>', 'FINISHED':'<span class="group-pill">FINALIZADO</span>' }[s] || ''; }
};

const Filters = {
  renderTabs() {
    const s = document.getElementById('select-grupo'); if (!s) return;
    if (!s.options.length) s.innerHTML = CONFIG.GROUPS.map(g => `<option value="${g}" ${State.grupoActivo===g?'selected':''}>Grupo ${g}</option>`).join('');
    s.value = State.grupoActivo;
  },
  setActive(f) { State.filtroActivo = f; this.update(); Fixture.render(); },
  selectGroup(g) { State.grupoActivo = g; State.filtroActivo = 'grupo'; this.update(); Fixture.render(); },
  update() { ['grupo','espana','todos'].forEach(b => { const e = document.getElementById(`btn-filtro-${b}`); if (!e) return; e.className = State.filtroActivo===b ? 'filter-button active-filter' : 'filter-button'; }); }
};

const Stats = {
  update() {
    document.getElementById('totalPartidos').textContent = State.fixture.length;
    document.getElementById('totalJugados').textContent = State.fixture.filter(p => p.scoreA!=null && p.scoreB!=null).length;
    document.getElementById('totalLive').textContent = State.fixture.filter(p => p.status==='IN_PLAY').length;
    document.getElementById('totalUsers').textContent = State.usuarios.length;
  }
};

const savePorra = debounce((user, matchId, team, val) => {
  if (val !== '' && isNaN(parseInt(val))) return;
  State.porras[`p_${user}_${matchId}_${team}`] = val;
  localStorage.setItem('f_porras', JSON.stringify(State.porras)); haptic(5); Engine.run();
}, CONFIG.DEBOUNCE_MS);

const Share = {
  async open() {
    const r = Engine.calculateRanking(), sorted = Object.entries(r).sort((a, b) => b[1].puntos - a[1].puntos);
    if (!sorted.length) return Toast.warning('Añade participantes primero');
    const txt = sorted.slice(0,5).map(([n, s], i) => `${['🥇','🥈','🥉','4️⃣','5️⃣'][i]} ${n}: ${s.puntos} pts`).join('\n');
    try { await (navigator.share ? navigator.share({ title: '🏆 Clasificación WC2026', text: `Clasificación:\n\n${txt}` }) : navigator.clipboard.writeText(txt)); Toast.success(navigator.share ? '¡Compartido!' : 'Copiado'); } catch(e) { if(e.name!=='AbortError') Toast.error('Error al compartir'); }
  }
};

const Network = {
  init() { window.addEventListener('online', () => this.up(true)); window.addEventListener('offline', () => this.up(false)); this.up(navigator.onLine); },
  up(on) { State.isOnline = on; const b = document.getElementById('offline-banner'); if(b) b.hidden = on; Toast[on?'success':'warning'](on ? 'Conexión restaurada' : 'Sin conexión'); }
};

const BottomNav = {
  init() { document.querySelectorAll('.bottom-nav-item').forEach(b => b.addEventListener('click', e => this.act(e.currentTarget.dataset.section))); },
  act(sec) { document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.toggle('active', b.dataset.section===sec)); const t = { matches:'#grid-fixture', leaderboard:'#tabla-clasificacion', users:'#modal-add-user' }[sec]; if(t?.startsWith('#modal')) Modal.show(t); else document.querySelector(t)?.scrollIntoView({ behavior:'smooth' }); }
};

const Events = {
  init() {
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-action]'); if (!t) return;
      const a = t.dataset.action;
      if (a === 'select-group') Filters.selectGroup(t.dataset.group);
      else if (a === 'delete-user') Users.remove(t.dataset.user);
      else if (a === 'refresh') App.refresh();
    });

    document.getElementById('select-grupo')?.addEventListener('change', e => Filters.selectGroup(e.target.value));

    document.addEventListener('input', e => {
      if (e.target.classList.contains('prediction-input')) {
        // Sanitización Android: solo números
        e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
        savePorra(e.target.dataset.user, e.target.dataset.match, e.target.dataset.team, e.target.value);
      }
    });

    document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('prediction-input')) { e.preventDefault(); const i = [...document.querySelectorAll('.prediction-input:not([disabled])')], x = i.indexOf(e.target); if(x>=0 && x<i.length-1) i[x+1].focus(); } });

    document.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => { b.closest('.modal').hidden = true; document.body.style.overflow = ''; }));
    
    document.getElementById('form-add-user')?.addEventListener('submit', e => { e.preventDefault(); const i = document.getElementById('input-usuario-modal'); if (Users.add(i.value)) { i.value = ''; Modal.hide('modal-add-user'); } });
    document.getElementById('btn-refresh')?.addEventListener('click', () => App.refresh());
    document.getElementById('btn-share')?.addEventListener('click', () => Share.open());
    document.getElementById('fab-add-user')?.addEventListener('click', () => Modal.show('modal-add-user'));
    ['grupo','espana','todos'].forEach(f => document.getElementById(`btn-filtro-${f}`)?.addEventListener('click', () => Filters.setActive(f)));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal:not([hidden])').forEach(m => { m.hidden = true; document.body.style.overflow = ''; }); });
  }
};

const App = {
  async init() {
    Toast.init(); Network.init(); BottomNav.init(); Events.init();
    this.showSkeletons();
    try {
      State.fixture = await API.getMatches();
      if (!State.fixture.length) Toast.warning('No hay partidos');
      else Toast.success(`${State.fixture.length} partidos cargados`);
      Filters.renderTabs(); Filters.update(); Clock.start(); Engine.run(); this.autoRefresh();
    } catch (e) { console.error(e); Toast.error('Error al cargar'); }
  },
  showSkeletons() { const g = document.getElementById('grid-fixture'); if(g) g.innerHTML = Array(3).fill('<div class="skeleton-match glass-card"></div>').join(''); },
  autoRefresh() { if (State.fixture.some(p => p.status==='IN_PLAY')) setInterval(() => this.refresh(false), 60000); },
  async refresh(show = true) {
    if (State.isLoading) return; State.isLoading = true;
    const b = document.getElementById('btn-refresh'); if(b) b.disabled = true;
    try { localStorage.removeItem(CONFIG.CACHE_KEY); State.fixture = await API.getMatches(); Engine.run(); Clock.update(); if(show) Toast.success('Actualizado'); haptic([10,50,10]); } 
    catch { if(show) Toast.error('Error al actualizar'); } 
    finally { State.isLoading = false; if(b) b.disabled = false; }
  }
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => App.init()); else App.init();
window.resetearTodo = () => Modal.confirm('¿Borrar TODO?', () => { localStorage.clear(); location.reload(); }, 'Resetear');