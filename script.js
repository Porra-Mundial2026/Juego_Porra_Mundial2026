/* ======================================================
WORLD CUP 2026
APPLE EDITION • LIVE API VERSION
football-data.org powered
====================================================== */

/* ======================================================
CONFIG
====================================================== */

const API_KEY = "TU_API_KEY_AQUI";

const API_URL =
"https://api.football-data.org/v4/competitions/WC/matches";

const DATA_URL = "./data/matches.json";

/* ======================================================
STATE
====================================================== */

let FixtureOficial = [];

let registrados =
JSON.parse(localStorage.getItem("f_usuarios")) || [];

let porras =
JSON.parse(localStorage.getItem("f_porras")) || {};

let reales =
JSON.parse(localStorage.getItem("f_reales")) || {};

let grupoSeleccionado = "A";
let filtroActual = "grupo";

/* ======================================================
FLAGS CDN
====================================================== */

function obtenerBandera(code){

    if(!code){

        return "https://flagcdn.com/w160/un.png";

    }

    return `https://flagcdn.com/w160/${code.toLowerCase()}.png`;

}

/* ======================================================
CLOCKS
====================================================== */

function obtenerHoraLocal(timezone){

    try{

        return new Intl.DateTimeFormat("es-ES",{

            hour:"2-digit",
            minute:"2-digit",
            second:"2-digit",
            timeZone: timezone || "Europe/Madrid"

        }).format(new Date());

    }catch(err){

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

    document
    .querySelectorAll(".live-clock")
    .forEach(clock=>{

        const timezone =
        clock.dataset.timezone;

        clock.innerHTML =
        `🕒 ${obtenerHoraLocal(timezone)}`;

    });

}

/* ======================================================
LOAD
====================================================== */

window.onload = async ()=>{

    try{

        await cargarPartidos();

        renderTabs();

        alternarBotones();

        ejecutarMotor();

        iniciarRelojes();

        actualizarStats();

    }catch(err){

        console.error(err);

    }

};

/* ======================================================
API FOOTBALL DATA
====================================================== */

async function cargarPartidos(){

    try{

        const response = await fetch(API_URL,{

            headers:{
                "X-Auth-Token":API_KEY
            }

        });

        if(!response.ok){

            console.warn(
                "API FALLBACK → matches.json"
            );

            return await cargarJSONLocal();

        }

        const data =
        await response.json();

        if(!data.matches){

            return await cargarJSONLocal();

        }

        FixtureOficial =
        transformarPartidosAPI(data.matches);

        actualizarStats();

        dibujarFixture();

    }catch(err){

        console.error(err);

        await cargarJSONLocal();

    }

}

/* ======================================================
LOCAL FALLBACK
====================================================== */

async function cargarJSONLocal(){

    try{

        const response =
        await fetch(DATA_URL);

        FixtureOficial =
        await response.json();

        actualizarStats();

        dibujarFixture();

    }catch(err){

        console.error(
            "ERROR JSON:",
            err
        );

    }

}

/* ======================================================
TRANSFORM API
====================================================== */

function transformarPartidosAPI(matches){

    return matches.map((m,index)=>{

        const home =
        m.homeTeam || {};

        const away =
        m.awayTeam || {};

        const utc =
        new Date(m.utcDate);

        const grupo =
        obtenerGrupo(index);

        return{

            id:m.id || index,

            grupo:grupo,

            fecha:
            utc.toLocaleDateString("es-ES"),

            hora:
            utc.toLocaleTimeString("es-ES",{
                hour:"2-digit",
                minute:"2-digit"
            }),

            estadio:
            m.venue || "World Cup Stadium",

            ciudad:
            m.area?.name || "",

            timezone:
            detectarTimezone(
                m.area?.name
            ),

            eqA:
            home.name || "TBD",

            eqB:
            away.name || "TBD",

            flagA:
            obtenerBandera(
                home.tla
            ),

            flagB:
            obtenerBandera(
                away.tla
            ),

            esp:
            (
                home.name === "Spain" ||
                away.name === "Spain"
            ),

            scoreA:
            m.score?.fullTime?.home,

            scoreB:
            m.score?.fullTime?.away,

            status:
            m.status

        };

    });

}

/* ======================================================
GROUPS
====================================================== */

function obtenerGrupo(index){

    const grupos =
    ["A","B","C","D","E","F","G","H","I","J","K","L"];

    return grupos[
        index % grupos.length
    ];

}

/* ======================================================
TIMEZONES
====================================================== */

function detectarTimezone(city){

    const zonas = {

        "Canada":"America/Toronto",
        "Mexico":"America/Mexico_City",
        "United States":"America/New_York",
        "USA":"America/New_York"

    };

    return zonas[city]
    || "Europe/Madrid";

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

        alert(
            "Ese usuario ya existe"
        );

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

/* ======================================================
POINTS ENGINE
====================================================== */

function ejecutarMotor(){

    const puntos = {};

    registrados.forEach(u=>{

        puntos[u] = 0;

    });

    FixtureOficial.forEach(p=>{

        if(
            p.scoreA == null ||
            p.scoreB == null
        ) return;

        registrados.forEach(user=>{

            const pA =
            parseInt(
                porras[
                    `p_${user}_${p.id}_A`
                ]
            );

            const pB =
            parseInt(
                porras[
                    `p_${user}_${p.id}_B`
                ]
            );

            if(
                isNaN(pA) ||
                isNaN(pB)
            ) return;

            if(
                pA === p.scoreA &&
                pB === p.scoreB
            ){

                puntos[user] += 3;

            }else if(

                (
                    p.scoreA > p.scoreB &&
                    pA > pB
                ) ||

                (
                    p.scoreA < p.scoreB &&
                    pA < pB
                ) ||

                (
                    p.scoreA === p.scoreB &&
                    pA === pB
                )

            ){

                puntos[user] += 1;

            }

        });

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
    .sort((a,b)=>
        b.score-a.score
    );

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

            <div class="flex items-center gap-3">

                <div class="score-pill">
                    ${u.score} pts
                </div>

                <button
                    onclick="darDeBaja('${u.name}')"
                    class="delete-button"
                >
                    ✕
                </button>

            </div>

        </div>

        `;

    });

}

/* ======================================================
FILTERS
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
                ${
                    grupoSeleccionado===g
                    ? 'active-tab'
                    : ''
                }
            "
        >
            Grupo ${g}
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
FIXTURE
====================================================== */

function dibujarFixture(){

    const grid =
    document.getElementById(
        "grid-fixture"
    );

    grid.innerHTML = "";

    let partidos = [];

    if(filtroActual==="todos"){

        partidos = FixtureOficial;

    }
    else if(
        filtroActual==="espana"
    ){

        partidos =
        FixtureOficial.filter(
            p=>p.esp
        );

    }else{

        partidos =
        FixtureOficial.filter(
            p=>p.grupo===grupoSeleccionado
        );

    }

    document.getElementById(
        "txt-contador"
    ).innerText =
    `${partidos.length} partidos`;

    partidos.forEach(p=>{

        const card =
        document.createElement("div");

        card.className =
        "match-card";

        card.innerHTML = `

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
                        : ""
                    }

                </div>

                <div class="stadium-text">
                    📍 ${p.estadio}
                </div>

                <div class="stadium-timezone">
                    🌍 ${p.timezone}
                </div>

            </div>

            <div class="text-right">

                <div class="date-text">
                    ${p.fecha}
                </div>

                <div class="hour-text">
                    ${p.hora}
                </div>

                <div
                    class="live-clock"
                    data-timezone="${p.timezone}"
                >
                    🕒 --
                </div>

            </div>

        </div>

        <div class="teams-grid">

            <div class="team-side">

                <img
                    src="${p.flagA}"
                    class="flag-img"
                    loading="lazy"
                >

                <div class="team-name">
                    ${p.eqA}
                </div>

            </div>

            <div class="score-center">

                ${
                    p.scoreA != null
                    ? `
                    <div class="score-live">
                        ${p.scoreA} - ${p.scoreB}
                    </div>
                    `
                    : `
                    <div class="vs-text">
                        VS
                    </div>
                    `
                }

            </div>

            <div class="team-side">

                <img
                    src="${p.flagB}"
                    class="flag-img"
                    loading="lazy"
                >

                <div class="team-name">
                    ${p.eqB}
                </div>

            </div>

        </div>

        <div class="predictions">

            ${
                registrados.length===0
                ? `
                <div class="empty-state">
                    No hay participantes
                </div>
                `
                : ""
            }

            ${registrados.map(user=>{

                const valA =
                porras[
                    `p_${user}_${p.id}_A`
                ] || "";

                const valB =
                porras[
                    `p_${user}_${p.id}_B`
                ] || "";

                return `

                <div class="prediction-row">

                    <div class="prediction-user">
                        ${user}
                    </div>

                    <div class="prediction-inputs">

                        <input
                            type="number"
                            value="${valA}"
                            class="prediction-input"
                            oninput="
                            actualizarPorraUser(
                            '${user}',
                            ${p.id},
                            'A',
                            this.value
                            )"
                        >

                        <span>-</span>

                        <input
                            type="number"
                            value="${valB}"
                            class="prediction-input"
                            oninput="
                            actualizarPorraUser(
                            '${user}',
                            ${p.id},
                            'B',
                            this.value
                            )"
                        >

                    </div>

                </div>

                `;

            }).join("")}

        </div>

        `;

        grid.appendChild(card);

    });

}

/* ======================================================
SAVE BETS
====================================================== */

function actualizarPorraUser(
    user,
    id,
    campo,
    val
){

    porras[
        `p_${user}_${id}_${campo}`
    ] = val;

    localStorage.setItem(
        "f_porras",
        JSON.stringify(porras)
    );

    ejecutarMotor();

}

/* ======================================================
STATS
====================================================== */

function actualizarStats(){

    document.getElementById(
        "totalPartidos"
    ).innerText =
    FixtureOficial.length;

    document.getElementById(
        "totalUsers"
    ).innerText =
    registrados.length;

    const jugados =
    FixtureOficial.filter(
        p=>
        p.scoreA != null &&
        p.scoreB != null
    ).length;

    document.getElementById(
        "totalJugados"
    ).innerText =
    jugados;

    const live =
    FixtureOficial.filter(
        p=>
        p.status==="IN_PLAY"
    ).length;

    document.getElementById(
        "totalLive"
    ).innerText =
    live;

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