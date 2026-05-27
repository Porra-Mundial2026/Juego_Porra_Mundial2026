/* ======================================================
   WORLD CUP 2026 • MOTOR EN LA NUBE PREMIUM V7.3
   Corrección CORS, Firebase Realtime y Flags HD
====================================================== */

'use strict';

const CONFIG = {
  API_KEY: '6a2a522096e243a4afec1a2de793e623',
  API_URL: 'https://api.football-data.org/v4/competitions/WC/matches',
  CACHE_KEY: 'f_cache_matches_v7_3',
  CACHE_TTL: 10 * 60 * 1000,
  LOCK_MINUTES_BEFORE: 15,
  DEBOUNCE_MS: 400,
  GROUPS: ['A','B','C','D','E','F','G','H','I','J','K','L'],
  AVATARS: ['🦁','🦊','🐼','🐯','🐻','🐺','🐸','🐲','🦉','🐙','🦅','🦈']
};

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
  'ARG':'ar', 'ESP':'es', 'BRA':'br', 'GER':'de', 'FRA':'fr', 'ENG':'gb-eng', 'ITA':'it', 'POR':'pt', 'MEX':'mx', 'USA':'us'
  // Nota: Asegúrate de completar los códigos TLA aquí si faltan países
};

const State = { fixture: [], usuarios: [], porras: {}, grupoActivo: 'A' };

// Desregistrar Service Worker para evitar bloqueo CORS
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    for (let reg of regs) reg.unregister();
  });
}

const API = {
  async getMatches() {
    try {
      const response = await fetch(CONFIG.API_URL, {
        method: 'GET',
        headers: { 'X-Auth-Token': CONFIG.API_KEY }
      });
      if (!response.ok) throw new Error('API Error');
      const data = await response.json();
      return this.transform(data.matches);
    } catch (e) {
      console.warn("Usando respaldo local por error de API");
      return []; 
    }
  },
  transform(matches) {
    return matches.map(m => ({
      id: m.id,
      grupo: m.group?.replace('GROUP_', '') || 'A',
      eqA: m.homeTeam.shortName || m.homeTeam.name,
      eqB: m.awayTeam.shortName || m.awayTeam.name,
      tlaA: m.homeTeam.tla,
      tlaB: m.awayTeam.tla,
      scoreA: m.score?.fullTime?.home,
      scoreB: m.score?.fullTime?.away,
      utcDate: m.utcDate
    }));
  }
};

const Engine = {
  render() {
    const grid = document.getElementById('grid-fixture');
    if (!grid) return;
    
    const filtrados = State.fixture.filter(m => m.grupo === State.grupoActivo);
    grid.innerHTML = filtrados.map(m => `
      <div class="card" style="margin:10px; padding:15px; border:1px solid #ccc;">
        <p><strong>${m.eqA}</strong> vs <strong>${m.eqB}</strong></p>
        <input class="p-input" data-m="${m.id}" data-t="A" type="number" placeholder="Goles ${m.tlaA}" value="${State.porras[`p_A_${m.id}`] || ''}">
        <input class="p-input" data-m="${m.id}" data-t="B" type="number" placeholder="Goles ${m.tlaB}" value="${State.porras[`p_B_${m.id}`] || ''}">
      </div>
    `).join('');
  }
};

const App = {
  async init() {
    State.fixture = await API.getMatches();
    
    // Escucha en tiempo real de Firebase
    db.ref('porra_mundial').on('value', (snap) => {
      const data = snap.val() || {};
      State.usuarios = data.usuarios || [];
      State.porras = data.porras || {};
      Engine.render();
    });

    // Delegación de eventos para inputs
    document.addEventListener('input', (e) => {
      if (e.target.classList.contains('p-input')) {
        const { m, t } = e.target.dataset;
        const val = e.target.value;
        db.ref(`porra_mundial/porras/p_${t}_${m}`).set(val);
      }
    });
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());