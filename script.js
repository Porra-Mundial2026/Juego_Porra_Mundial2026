/* ======================================================
APPLE WORLD CUP 2026
ULTRA EDITION
LIVE CLOCKS + LIVE STATS + RESPONSIVE
====================================================== */

const DATA_URL = "./data/matches.json";

let FixtureOficial = [];

let registrados =
JSON.parse(localStorage.getItem("f_usuarios")) || [];

let porras =
JSON.parse(localStorage.getItem("f_porras")) || {};

let reales =
JSON.parse(localStorage.getItem("f_reales")) || {};

let grupoSeleccionado = "A";
let filtroActual = "todos";

/* ======================================================
FLAGS CDN
====================================================== */

const FLAG_CDN = "https://flagcdn.com";

/* ======================================================
COUNTRY FLAGS
====================================================== */

function obtenerBandera(pais){

    const flags = {

        "España":"es",
        "Brasil":"br",
        "Argentina":"ar",
        "Francia":"fr",
        "Alemania":"de",
        "Portugal":"pt",
        "Inglaterra":"gb-eng",
        "Estados Unidos":"us",
        "México":"mx",
        "Canadá":"ca",
        "Japón":"jp",
        "Corea del Sur":"kr",
        "Australia":"au",
        "Uruguay":"uy",
        "Marruecos":"ma",
        "Croacia":"hr",
        "Países Bajos":"nl",
        "Bélgica":"be",
        "Suiza":"ch",
        "Senegal":"sn",
        "Dinamarca":"dk",
        "Serbia":"rs",
        "Polonia":"pl",
        "Arabia Saudí":"sa",
        "Cabo Verde":"cv"

    };

    const code = flags[pais] || "un";

    return `${FLAG_CDN}/w160/${code}.png`;

}

/* ======================================================
LOAD
====================================================== */

window.onload = async () => {

    try{

        await cargarPartidos();

        renderTabs();

        alternarBotones();

        actualizarResultadosAPI();

        ejecutarMotor();

        iniciarRelojes();

        iniciarStatsLive();

        setInterval(()=>{

            actualizarResultadosAPI();

        },300000);

    }catch(err){

        console.error(err);

    }

};

/* ======================================================
LOAD JSON
====================================================== */

async function cargarPartidos(){

    try{

        const response =
        await fetch(DATA_URL + "?v=" + Date.now());

        if(!response.ok){

            throw new Error("JSON ERROR");

        }

        FixtureOficial =
        await response.json();

        document.getElementById(
            "totalPartidos"
        ).innerText =
        FixtureOficial.length;

    }catch(error){

        console.error(error);

        document.getElementById(
            "grid-fixture"
        ).innerHTML = `

            <div class="col-span-full text-center py-20 text-red-400">

                Error cargando matches.json

            </div>

        `;

    }

}

/* ======================================================
WORLD CLOCKS
====================================================== */

function obtenerHoraLocal(timezone){

    try{

        return new Intl.DateTimeFormat("es-ES",{

            hour:"2-digit",
            minute:"2-digit",
            second:"2-digit",
            timeZone: timezone || "Europe/Madrid"

        }).format(new Date());

    }catch{

        return "--:--";

    }

}

function iniciarRelojes(){

    actualizarRelojes();

    setInterval(()=>{

        actualizarRelojes();

    },1000);

}

function actualizarRelojes(){

    document.querySelectorAll(".live-clock")
    .forEach(clock=>{

        const timezone =
        clock.dataset.timezone;

        clock.innerHTML =
        `🕒 ${obtenerHoraLocal(timezone)}`;

    });

}

/* ======================================================
LIVE STATS
====================================================== */

function iniciarStatsLive(){

    actualizarStats();

    setInterval(()=>{

        actualizarStats();

    },5000);

}

function actualizarStats(){

    const total =
    FixtureOficial.length;

    const jugados =
    Object.keys(reales)
    .filter(k=>k.includes("_A"))
    .length;

    const live =
    Math.floor(jugados * 0.18);

    const participantes =
    registrados.length;

    document.getElementById(
        "totalPartidos"
    ).innerText = total;

    document.getElementById(
        "totalJugados"
    ).innerText = jugados;

    document.getElementById(
        "totalLive"
    ).innerText = live;

    document.getElementById(
        "totalUsers"
    ).innerText = participantes;

}

/* ======================================================
LIVE API SIMULATION
====================================================== */

function actualizarResultadosAPI(){

    try{

        FixtureOficial.forEach(p=>{

            const existe =
            reales[`r_${p.id}_A`] !== undefined;

            if(!existe && Math.random() > 0.986){

                reales[`r_${p.id}_A`] =
                Math.floor(Math.random()*5);

                reales[`r_${p.id}_B`] =
                Math.floor(Math.random()*5);

            }

        });

        localStorage.setItem(
            "f_reales",
            JSON.stringify(reales)
        );

        ejecutarMotor();

    }catch(err){

        console.error(err);

    }

}

/* ======================================================
USERS
====================================================== */

function registrarUsuario(){

    const input =
    document.getElementById(
        "input-usuario-global"
    );

    const nombre =
    input.value.trim();

    if(!nombre) return;

    if(registrados.includes(nombre)){

        alert("Ese usuario ya existe");

        return;

    }

    registrados.push(nombre);

    localStorage.setItem(
        "f_usuarios",
        JSON.stringify(registrados)
    );

    input.value = "";

    actualizarStats();

    ejecutarMotor();

}

function darDeBaja(nombre){

    if(confirm(`Eliminar a ${nombre}?`)){

        registrados =
        registrados.filter(
            u=>u!==nombre
        );

        localStorage.setItem(
            "f_usuarios",
            JSON.stringify(registrados)
        );

        actualizarStats();

        ejecutarMotor();

    }

}

/* ======================================================
POINTS ENGINE
====================================================== */

function ejecutarMotor(){

    const puntos = {};

    registrados.forEach(u=>{

        puntos[u] = 0;

    });

    FixtureOficial.forEach(p=>{

        const rA =
        reales[`r_${p.id}_A`];

        const rB =
        reales[`r_${p.id}_B`];

        if(rA !== undefined && rB !== undefined){

            registrados.forEach(user=>{

                const pA =
                porras[`p_${user}_${p.id}_A`];

                const pB =
                porras[`p_${user}_${p.id}_B`];

                if(
                    pA !== undefined &&
                    pB !== undefined &&
                    pA !== "" &&
                    pB !== ""
                ){

                    const gA = parseInt(pA);
                    const gB = parseInt(pB);

                    if(gA === rA && gB === rB){

                        puntos[user] += 3;

                    }
                    else if(

                        (rA > rB && gA > gB) ||
                        (rA < rB && gA < gB) ||
                        (rA === rB && gA === gB)

                    ){

                        puntos[user] += 1;

                    }

                }

            });

        }

    });

    dibujarClasificacion(puntos);

    dibujarFixture();

}

/* ======================================================
LEADERBOARD
====================================================== */

function dibujarClasificacion(puntos){

    const cont =
    document.getElementById(
        "tabla-clasificacion"
    );

    cont.innerHTML = "";

    const ranking =
    Object.keys(puntos)
    .map(k=>({
        name:k,
        score:puntos[k]
    }))
    .sort((a,b)=>b.score-a.score);

    if(ranking.length === 0){

        cont.innerHTML = `

            <div class="empty-state">

                No hay participantes

            </div>

        `;

        return;

    }

    ranking.forEach((u,idx)=>{

        let icon = "🔹";

        if(idx===0) icon="👑";
        if(idx===1) icon="🥈";
        if(idx===2) icon="🥉";

        cont.innerHTML += `

            <div class="leaderboard-item">

                <div class="flex items-center gap-4">

                    <div class="leader-icon">
                        ${icon}
                    </div>

                    <div>

                        <div class="font-bold">
                            ${u.name}
                        </div>

                        <div class="text-xs text-slate-500">
                            Participante
                        </div>

                    </div>

                </div>

                <div class="score-pill">
                    ${u.score} pts
                </div>

            </div>

        `;

    });

}

/* ======================================================
GROUP TABS
====================================================== */

function renderTabs(){

    const letras =
    ["A","B","C","D","E","F","G","H","I","J","K","L"];

    const cont =
    document.getElementById(
        "contenedor-tabs"
    );

    cont.innerHTML = "";

    letras.forEach(g=>{

        cont.innerHTML += `

            <button
                onclick="seleccionarGrupo('${g}')"
                class="
                    tab-button
                    ${grupoSeleccionado===g
                        ? 'active-tab'
                        : ''
                    }
                "
            >
                ${g}
            </button>

        `;

    });

}

function seleccionarGrupo(g){

    grupoSeleccionado = g;

    filtroActual = "grupo";

    renderTabs();

    alternarBotones();

    dibujarFixture();

}

/* ======================================================
FILTERS
====================================================== */

function cambiarFiltroVista(tipo){

    filtroActual = tipo;

    alternarBotones();

    dibujarFixture();

}

function alternarBotones(){

    ["grupo","espana","todos"]
    .forEach(btn=>{

        const el =
        document.getElementById(
            `btn-filtro-${btn}`
        );

        if(!el) return;

        el.className =
        filtroActual===btn
        ? "filter-button active-filter"
        : "filter-button";

    });

}

/* ======================================================
FIXTURE UI
====================================================== */

function dibujarFixture(){

    const grid =
    document.getElementById(
        "grid-fixture"
    );

    if(!grid) return;

    grid.innerHTML = "";

    let partidos = [];

    if(filtroActual === "todos"){

        partidos = FixtureOficial;

    }
    else if(filtroActual === "espana"){

        partidos =
        FixtureOficial.filter(p=>p.esp);

    }
    else{

        partidos =
        FixtureOficial.filter(
            p=>p.grupo === grupoSeleccionado
        );

    }

    document.getElementById(
        "txt-contador"
    ).innerText =
    `${partidos.length} partidos`;

    partidos.forEach(p=>{

        const rA =
        reales[`r_${p.id}_A`];

        const rB =
        reales[`r_${p.id}_B`];

        const marcador =
        (rA !== undefined)
        ? `
            <div class="score-live">
                ${rA} - ${rB}
            </div>
        `
        : `
            <div class="vs-text">
                VS
            </div>
        `;

        const card =
        document.createElement("div");

        card.className =
        "match-card";

        let html = `

            <div class="match-header">

                <div>

                    <div class="flex gap-2 flex-wrap">

                        <span class="group-pill">
                            Grupo ${p.grupo}
                        </span>

                        ${
                            p.esp
                            ? `
                                <span class="spain-pill">
                                    🇪🇸 ESPAÑA
                                </span>
                            `
                            : ''
                        }

                    </div>

                    <div class="stadium-text mt-3">

                        📍 ${p.estadio || ""}

                    </div>

                    <div class="stadium-timezone">

                        ${p.ciudad || ""}

                    </div>

                    <div class="stadium-timezone">

                        🌍 ${p.timezone || "Europe/Madrid"}

                    </div>

                </div>

                <div class="text-right">

                    <div class="date-text">

                        ${p.fecha || ""}

                    </div>

                    <div class="hour-text">

                        🇪🇸 ${p.hora || ""}

                    </div>

                    <div
                        class="live-clock"
                        data-timezone="${p.timezone || 'Europe/Madrid'}"
                    >

                        🕒 ${obtenerHoraLocal(p.timezone)}

                    </div>

                </div>

            </div>

            <div class="teams-grid">

                <div class="team-side">

                    <img
                        src="${obtenerBandera(p.eqA)}"
                        alt="${p.eqA}"
                        loading="lazy"
                        class="flag-img"
                    >

                    <div class="team-name">

                        ${p.eqA}

                    </div>

                </div>

                <div class="score-center">

                    ${marcador}

                </div>

                <div class="team-side">

                    <img
                        src="${obtenerBandera(p.eqB)}"
                        alt="${p.eqB}"
                        loading="lazy"
                        class="flag-img"
                    >

                    <div class="team-name">

                        ${p.eqB}

                    </div>

                </div>

            </div>

            <div class="predictions">
        `;

        registrados.forEach(user=>{

            const valA =
            porras[`p_${user}_${p.id}_A`] || "";

            const valB =
            porras[`p_${user}_${p.id}_B`] || "";

            html += `

                <div class="prediction-row">

                    <div class="prediction-user">

                        ${user}

                    </div>

                    <div class="prediction-inputs">

                        <input
                            type="number"
                            min="0"
                            max="9"
                            value="${valA}"
                            oninput="actualizarPorraUser('${user}',${p.id},'A',this.value)"
                            class="prediction-input"
                        >

                        <span>-</span>

                        <input
                            type="number"
                            min="0"
                            max="9"
                            value="${valB}"
                            oninput="actualizarPorraUser('${user}',${p.id},'B',this.value)"
                            class="prediction-input"
                        >

                    </div>

                </div>

            `;

        });

        html += `</div>`;

        card.innerHTML = html;

        grid.appendChild(card);

    });

}

/* ======================================================
SAVE
====================================================== */

function actualizarPorraUser(user,id,campo,val){

    porras[`p_${user}_${id}_${campo}`] = val;

    localStorage.setItem(
        "f_porras",
        JSON.stringify(porras)
    );

}

/* ======================================================
RESET
====================================================== */

function resetearTodo(){

    if(confirm(
        "Eliminar todos los datos?"
    )){

        localStorage.clear();

        location.reload();

    }

}