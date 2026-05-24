/* ======================================================
WORLD CUP 2026
APPLE EDITION • PRO ENGINE
football-data.org powered
====================================================== */

/* ======================================================
CONFIG
====================================================== */

const API_KEY = "a1b2c3d4e5f6g7";

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

        iniciarRelojes();

        ejecutarMotor();

        actualizarStats();

    }catch(err){

        console.error(err);

    }

};

/* ======================================================
API
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
                "API FALLBACK → JSON"
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

        ejecutarMotor();

    }catch(err){

        console.error(err);

        await cargarJSONLocal();

    }

}

/* ======================================================
LOCAL JSON
====================================================== */

async function cargarJSONLocal(){

    try{

        const response =
        await fetch(DATA_URL);

        FixtureOficial =
        await response.json();

        actualizarStats();

        ejecutarMotor();

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

        return{

            id:m.id || index,

            grupo:
            obtenerGrupo(index),

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
            m.status === "FINISHED"
            ? m.score?.fullTime?.home
            : null,

            scoreB:
            m.status === "FINISHED"
            ? m.score?.fullTime?.away
            : null,

            utcDate:
            m.utcDate,

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

    ejecutarMotor();

}

/* ======================================================
POINTS ENGINE
====================================================== */

function ejecutarMotor(){

    const ranking = {};

    registrados.forEach(user=>{

        ranking[user] = {

            puntos:0,
            exactos:0,
            acertados:0,
            golesExactos:0,
            diferenciaExacta:0,
            bonusEspana:0,
            fallados:0,
            partidos:0,
            porcentaje:0,
            rachaActual:0,
            mejorRacha:0

        };

    });

    FixtureOficial.forEach(p=>{

        if(
            p.scoreA == null ||
            p.scoreB == null
        ) return;

        registrados.forEach(user=>{

            const pA = parseInt(
                porras[`p_${user}_${p.id}_A`]
            );

            const pB = parseInt(
                porras[`p_${user}_${p.id}_B`]
            );

            if(
                isNaN(pA) ||
                isNaN(pB)
            ){

                ranking[user].fallados++;
                return;

            }

            ranking[user].partidos++;

            let puntosPartido = 0;

            const ganadorReal =
                p.scoreA > p.scoreB
                ? "A"
                : p.scoreA < p.scoreB
                ? "B"
                : "E";

            const ganadorUser =
                pA > pB
                ? "A"
                : pA < pB
                ? "B"
                : "E";

            /* ======================
            RESULTADO EXACTO
            ====================== */

            if(
                pA === p.scoreA &&
                pB === p.scoreB
            ){

                puntosPartido += 5;

                ranking[user]
                .exactos++;

            }

            /* ======================
            GANADOR
            ====================== */

            if(
                ganadorReal === ganadorUser
            ){

                puntosPartido += 2;

                ranking[user]
                .acertados++;

            }

            /* ======================
            GOLES EXACTOS
            ====================== */

            if(pA === p.scoreA){

                puntosPartido += 1;

                ranking[user]
                .golesExactos++;

            }

            if(pB === p.scoreB){

                puntosPartido += 1;

                ranking[user]
                .golesExactos++;

            }

            /* ======================
            DIFERENCIA EXACTA
            ====================== */

            const diffReal =
            p.scoreA - p.scoreB;

            const diffUser =
            pA - pB;

            if(diffReal === diffUser){

                puntosPartido += 1;

                ranking[user]
                .diferenciaExacta++;

            }

            /* ======================
            BONUS ESPAÑA
            ====================== */

            if(
                p.esp &&
                pA === p.scoreA &&
                pB === p.scoreB
            ){

                puntosPartido += 3;

                ranking[user]
                .bonusEspana++;

            }

            /* ======================
            RACHAS
            ====================== */

            if(puntosPartido > 0){

                ranking[user]
                .rachaActual++;

                if(
                    ranking[user]
                    .rachaActual >
                    ranking[user]
                    .mejorRacha
                ){

                    ranking[user]
                    .mejorRacha =
                    ranking[user]
                    .rachaActual;

                }

            }else{

                ranking[user]
                .rachaActual = 0;

            }

            ranking[user]
            .puntos += puntosPartido;

        });

    });

    Object.keys(ranking).forEach(user=>{

        const r = ranking[user];

        r.porcentaje =
        r.partidos > 0
        ? Math.round(
            (
                r.acertados /
                r.partidos
            ) * 100
          )
        : 0;

    });

    dibujarClasificacion(ranking);

    dibujarEstadisticas(ranking);

    dibujarFixture();

    actualizarStats();

}

/* ======================================================
LEADERBOARD TABLE
====================================================== */

function dibujarClasificacion(ranking){

    const cont =
    document.getElementById(
        "tabla-clasificacion"
    );

    if(!cont) return;

    const ordenados =
    Object.entries(ranking)
    .sort((a,b)=>
        b[1].puntos - a[1].puntos
    );

    if(ordenados.length===0){

        cont.innerHTML = `
            <div class="empty-state">
                No hay participantes
            </div>
        `;

        return;

    }

    cont.innerHTML = `

    <div class="table-wrapper">

        <table class="ranking-table">

            <thead>

                <tr>

                    <th>#</th>
                    <th>Jugador</th>
                    <th>Pts</th>
                    <th>🎯</th>
                    <th>✅</th>
                    <th>⚽</th>
                    <th>%</th>
                    <th>🔥</th>
                    <th></th>

                </tr>

            </thead>

            <tbody>

                ${ordenados.map((u,index)=>{

                    const name = u[0];
                    const r = u[1];

                    return `

                    <tr>

                        <td>
                            ${index+1}
                        </td>

                        <td>
                            ${name}
                        </td>

                        <td>
                            <strong>
                                ${r.puntos}
                            </strong>
                        </td>

                        <td>
                            ${r.exactos}
                        </td>

                        <td>
                            ${r.acertados}
                        </td>

                        <td>
                            ${r.golesExactos}
                        </td>

                        <td>
                            ${r.porcentaje}%
                        </td>

                        <td>
                            ${r.mejorRacha}
                        </td>

                        <td>

                            <button
                                onclick="darDeBaja('${name}')"
                                class="delete-button"
                            >
                                ✕
                            </button>

                        </td>

                    </tr>

                    `;

                }).join("")}

            </tbody>

        </table>

    </div>

    `;

}

/* ======================================================
ADVANCED STATS
====================================================== */

function dibujarEstadisticas(ranking){

    const box =
    document.getElementById(
        "estadisticas-avanzadas"
    );

    if(!box) return;

    const entries =
    Object.entries(ranking);

    if(entries.length===0){

        box.innerHTML = "";

        return;

    }

    const lider =
    entries.sort((a,b)=>
        b[1].puntos - a[1].puntos
    )[0];

    box.innerHTML = `

    <div class="advanced-stats-grid">

        <div class="stat-card">

            <div class="stat-title">
                👑 Líder
            </div>

            <div class="stat-value">
                ${lider[0]}
            </div>

        </div>

        <div class="stat-card">

            <div class="stat-title">
                🏆 Puntos
            </div>

            <div class="stat-value">
                ${lider[1].puntos}
            </div>

        </div>

        <div class="stat-card">

            <div class="stat-title">
                🎯 Exactos
            </div>

            <div class="stat-value">
                ${lider[1].exactos}
            </div>

        </div>

        <div class="stat-card">

            <div class="stat-title">
                🔥 Mejor racha
            </div>

            <div class="stat-value">
                ${lider[1].mejorRacha}
            </div>

        </div>

    </div>

    `;

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
LOCK PREDICTIONS
====================================================== */

function partidoBloqueado(partido){

    if(!partido.utcDate){

        return false;

    }

    const now =
    new Date().getTime();

    const inicio =
    new Date(partido.utcDate)
    .getTime();

    const diff =
    inicio - now;

    return diff <= 15 * 60 * 1000;

}

/* ======================================================
FIXTURE
====================================================== */

function dibujarFixture(){

    const grid =
    document.getElementById(
        "grid-fixture"
    );

    if(!grid) return;

    grid.innerHTML = "";

    let partidos = [];

    if(filtroActual==="todos"){

        partidos = FixtureOficial;

    }else if(
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

        const bloqueado =
        partidoBloqueado(p);

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
                            ${bloqueado ? "disabled" : ""}
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
                            ${bloqueado ? "disabled" : ""}
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

    const total =
    FixtureOficial.length;

    const jugados =
    FixtureOficial.filter(
        p=>
        p.scoreA != null &&
        p.scoreB != null
    ).length;

    document.getElementById(
        "totalPartidos"
    ).innerText = total;

    document.getElementById(
        "totalUsers"
    ).innerText =
    registrados.length;

    document.getElementById(
        "totalJugados"
    ).innerText = jugados;

    document.getElementById(
        "totalLive"
    ).innerText =
    FixtureOficial.filter(
        p=>p.status==="IN_PLAY"
    ).length;

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