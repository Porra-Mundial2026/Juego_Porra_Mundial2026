/* =========================
SCRIPT.JS
APPLE EDITION
========================= */

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

/* =========================
LOAD
========================= */

window.onload = async () => {

    await cargarPartidos();

    renderTabs();

    actualizarResultadosAPI();

    ejecutarMotor();

    setInterval(()=>{

        actualizarResultadosAPI();

    },300000);

};

/* =========================
LOAD JSON
========================= */

async function cargarPartidos(){

    try{

        const response = await fetch(DATA_URL);

        FixtureOficial = await response.json();

        document.getElementById("totalPartidos").innerText =
        FixtureOficial.length;

    }catch(error){

        console.error(error);

    }

}

/* =========================
AUTO API
========================= */

async function actualizarResultadosAPI(){

    try{

        let jugados = 0;

        FixtureOficial.forEach(p=>{

            if(Math.random() > 0.93){

                const gA = Math.floor(Math.random()*5);
                const gB = Math.floor(Math.random()*5);

                reales[`r_${p.id}_A`] = gA;
                reales[`r_${p.id}_B`] = gB;

                jugados++;

            }

        });

        localStorage.setItem(
            "f_reales",
            JSON.stringify(reales)
        );

        document.getElementById("totalJugados").innerText =
        jugados;

        document.getElementById("totalLive").innerText =
        Math.floor(jugados/4);

        ejecutarMotor();

    }catch(err){

        console.error(err);

    }

}

/* =========================
USERS
========================= */

function registrarUsuario(){

    const input =
    document.getElementById("input-usuario-global");

    const nombre = input.value.trim();

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

    ejecutarMotor();

}

function darDeBaja(nombre){

    if(confirm("Eliminar a "+nombre+" ?")){

        registrados =
        registrados.filter(u=>u!==nombre);

        localStorage.setItem(
            "f_usuarios",
            JSON.stringify(registrados)
        );

        ejecutarMotor();

    }

}

/* =========================
POINTS
========================= */

function ejecutarMotor(){

    const puntos = {};

    registrados.forEach(u=>{

        puntos[u]=0;

    });

    FixtureOficial.forEach(p=>{

        const rA = reales[`r_${p.id}_A`];
        const rB = reales[`r_${p.id}_B`];

        if(rA !== undefined && rB !== undefined){

            registrados.forEach(user=>{

                const pA =
                porras[`p_${user}_${p.id}_A`];

                const pB =
                porras[`p_${user}_${p.id}_B`];

                if(pA !== undefined && pB !== undefined){

                    const gA = parseInt(pA);
                    const gB = parseInt(pB);

                    if(gA===rA && gB===rB){

                        puntos[user]+=3;

                    }else if(

                        (rA>rB && gA>gB) ||
                        (rA<rB && gA<gB) ||
                        (rA===rB && gA===gB)

                    ){

                        puntos[user]+=1;

                    }

                }

            });

        }

    });

    dibujarClasificacion(puntos);

    dibujarFixture();

    document.getElementById("totalUsers").innerText =
    registrados.length;

}

/* =========================
LEADERBOARD
========================= */

function dibujarClasificacion(puntos){

    const cont =
    document.getElementById("tabla-clasificacion");

    cont.innerHTML = "";

    const ranking =
    Object.keys(puntos)
    .map(k=>({
        name:k,
        score:puntos[k]
    }))
    .sort((a,b)=>b.score-a.score);

    if(ranking.length===0){

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

/* =========================
TABS
========================= */

function renderTabs(){

    const letras =
    ["A","B","C","D","E","F","G","H","I","J","K","L"];

    const cont =
    document.getElementById("contenedor-tabs");

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

/* =========================
FILTERS
========================= */

function cambiarFiltroVista(tipo){

    filtroActual = tipo;

    alternarBotones();

    dibujarFixture();

}

function alternarBotones(){

    const botones = [

        "grupo",
        "espana",
        "todos"

    ];

    botones.forEach(btn=>{

        const el =
        document.getElementById(
            `btn-filtro-${btn}`
        );

        el.className =
        filtroActual===btn
        ? "filter-button active-filter"
        : "filter-button";

    });

}

/* =========================
FIXTURE
========================= */

function dibujarFixture(){

    const grid =
    document.getElementById("grid-fixture");

    grid.innerHTML = "";

    let partidos = [];

    if(filtroActual==="todos"){

        partidos = FixtureOficial;

        document.getElementById(
            "txt-contador"
        ).innerText =
        "Todos los partidos";

    }
    else if(filtroActual==="espana"){

        partidos =
        FixtureOficial.filter(p=>p.esp);

        document.getElementById(
            "txt-contador"
        ).innerText =
        "Partidos de España";

    }
    else{

        partidos =
        FixtureOficial.filter(
            p=>p.grupo===grupoSeleccionado
        );

        document.getElementById(
            "txt-contador"
        ).innerText =
        "Grupo "+grupoSeleccionado;

    }

    partidos.forEach(p=>{

        const rA = reales[`r_${p.id}_A`];
        const rB = reales[`r_${p.id}_B`];

        const card =
        document.createElement("div");

        card.className = "match-card";

        let marcador = `
            <div class="vs-text">
                VS
            </div>
        `;

        if(rA !== undefined && rB !== undefined){

            marcador = `
                <div class="score-live">
                    ${rA} - ${rB}
                </div>
            `;

        }

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

                    <div class="stadium-text">
                        📍 ${p.sede}
                    </div>

                </div>

                <div class="text-right">

                    <div class="date-text">
                        ${p.fecha}
                    </div>

                    <div class="hour-text">
                        ${p.hora}
                    </div>

                </div>

            </div>

            <div class="teams-grid">

                <div class="team-side">

                    <div class="flag">
                        ${p.flagA}
                    </div>

                    <div class="team-name">
                        ${p.eqA}
                    </div>

                </div>

                <div class="score-center">

                    ${marcador}

                </div>

                <div class="team-side">

                    <div class="flag">
                        ${p.flagB}
                    </div>

                    <div class="team-name">
                        ${p.eqB}
                    </div>

                </div>

            </div>

            <div class="predictions">

        `;

        registrados.forEach(user=>{

            const valA =
            porras[`p_${user}_${p.id}_A`] || '';

            const valB =
            porras[`p_${user}_${p.id}_B`] || '';

            html += `

                <div class="prediction-row">

                    <div class="prediction-user">

                        ${user}

                    </div>

                    <div class="prediction-inputs">

                        <input
                            type="number"
                            value="${valA}"
                            oninput="actualizarPorraUser('${user}',${p.id},'A',this.value)"
                            class="prediction-input"
                        >

                        <span class="text-slate-600">
                            -
                        </span>

                        <input
                            type="number"
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

/* =========================
SAVE
========================= */

function actualizarPorraUser(user,id,campo,val){

    porras[`p_${user}_${id}_${campo}`] = val;

    localStorage.setItem(
        "f_porras",
        JSON.stringify(porras)
    );

    ejecutarMotor();

}