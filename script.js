/* =========================
CONFIG
========================= */

const GITHUB_FIXTURE_URL = "./data/matches.json";

/* =========================
STATE
========================= */

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

    detectarConexion();

    await cargarFixture();

    renderTabs();

    ejecutarMotor();

    setInterval(async()=>{

        await cargarFixture(true);

    },300000);

};

/* =========================
CONEXION
========================= */

function detectarConexion(){

    const badge = document.getElementById("connectionBadge");

    function update(){

        if(navigator.onLine){

            badge.innerHTML = "🌐 ONLINE";
            badge.className = "badge badge-emerald";

        }else{

            badge.innerHTML = "📴 OFFLINE";
            badge.className = "badge badge-rose";

        }

    }

    window.addEventListener("online",update);
    window.addEventListener("offline",update);

    update();

}

/* =========================
LOAD FIXTURE
========================= */

async function cargarFixture(silent=false){

    try{

        const response = await fetch(
            GITHUB_FIXTURE_URL + "?v=" + Date.now()
        );

        const data = await response.json();

        FixtureOficial = data;

        localStorage.setItem(
            "fixture_cache",
            JSON.stringify(data)
        );

        if(!silent){

            console.log("Fixture cargado desde GitHub");

        }

    }catch(err){

        console.error(err);

        const cache = localStorage.getItem("fixture_cache");

        if(cache){

            FixtureOficial = JSON.parse(cache);

            console.log("Usando fixture cache");

        }

    }

    ejecutarMotor();

}

/* =========================
USUARIOS
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
PUNTOS
========================= */

function ejecutarMotor(){

    const puntos = {};

    registrados.forEach(u=>puntos[u]=0);

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

                    if(gA === rA && gB === rB){

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

    actualizarStats();

}

/* =========================
STATS
========================= */

function actualizarStats(){

    document.getElementById("totalPartidos")
    .innerText = FixtureOficial.length;

    let jugados = 0;

    FixtureOficial.forEach(p=>{

        if(
            reales[`r_${p.id}_A`] !== undefined &&
            reales[`r_${p.id}_B`] !== undefined
        ){

            jugados++;

        }

    });

    document.getElementById("totalJugados")
    .innerText = jugados;

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
                No hay participantes aún
            </div>
        `;

        return;

    }

    ranking.forEach((u,idx)=>{

        let icon="🔹";

        if(idx===0) icon="👑";
        if(idx===1) icon="🥈";
        if(idx===2) icon="🥉";

        cont.innerHTML += `

            <div class="leaderboard-item">

                <div class="leader-left">

                    <div class="leader-icon">
                        ${icon}
                    </div>

                    <div>

                        <div class="leader-name">
                            ${u.name}
                        </div>

                        <div class="leader-role">
                            Participante
                        </div>

                    </div>

                </div>

                <div class="leader-right">

                    <div class="leader-score">
                        ${u.score} pts
                    </div>

                    <button
                        onclick="darDeBaja('${u.name}')"
                        class="delete-btn"
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

    const letras = [
        "A","B","C","D","E","F",
        "G","H","I","J","K","L"
    ];

    const cont =
    document.getElementById("contenedor-tabs");

    cont.innerHTML = "";

    letras.forEach(g=>{

        cont.innerHTML += `

            <button
                onclick="seleccionarGrupo('${g}')"
                class="
                    tab-btn
                    ${grupoSeleccionado===g
                        ? 'active'
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

    document
    .querySelectorAll(".filter-btn")
    .forEach(btn=>btn.classList.remove("active"));

    if(filtroActual==="grupo")
        document
        .getElementById("btn-filtro-grupo")
        .classList.add("active");

    if(filtroActual==="espana")
        document
        .getElementById("btn-filtro-espana")
        .classList.add("active");

    if(filtroActual==="todos")
        document
        .getElementById("btn-filtro-todos")
        .classList.add("active");

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

        document.getElementById("txt-contador")
        .innerText = "Todos los partidos";

    }else if(filtroActual==="espana"){

        partidos =
        FixtureOficial.filter(p=>p.esp);

        document.getElementById("txt-contador")
        .innerText = "Partidos de España";

    }else{

        partidos =
        FixtureOficial.filter(
            p=>p.grupo===grupoSeleccionado
        );

        document.getElementById("txt-contador")
        .innerText = "Grupo "+grupoSeleccionado;

    }

    partidos.forEach(p=>{

        const rA = reales[`r_${p.id}_A`];
        const rB = reales[`r_${p.id}_B`];

        const card =
        document.createElement("div");

        card.className = "match-card";

        let html = `

            <div class="match-header">

                <div>

                    <div class="match-badges">

                        <span class="badge badge-indigo">
                            Grupo ${p.grupo}
                        </span>

                        ${p.esp ? `
                            <span class="badge badge-gold">
                                🇪🇸 ESPAÑA
                            </span>
                        `:''}

                    </div>

                    <div class="match-stadium">
                        📍 ${p.sede}
                    </div>

                </div>

                <div class="match-date">

                    <div class="match-day">
                        ${p.fecha}
                    </div>

                    <div class="match-hour">
                        ${p.hora}
                    </div>

                </div>

            </div>

            <div class="match-main">

                <div class="team-box">

                    <div class="team-flag">
                        ${p.flagA}
                    </div>

                    <div class="team-name">
                        ${p.eqA}
                    </div>

                </div>

                <div class="score-box">

                    ${
                        rA !== undefined
                        ? `
                            <div class="score-live">
                                ${rA} - ${rB}
                            </div>
                        `
                        : `
                            <div class="vs-text">
                                VS
                            </div>
                        `
                    }

                </div>

                <div class="team-box">

                    <div class="team-flag">
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
                            class="score-input"
                        >

                        <span>-</span>

                        <input
                            type="number"
                            value="${valB}"
                            oninput="actualizarPorraUser('${user}',${p.id},'B',this.value)"
                            class="score-input"
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

/* =========================
UPDATE MANUAL
========================= */

async function actualizarDesdeGitHub(){

    await cargarFixture();

    alert("Fixture actualizado");

}

/* =========================
RESET
========================= */

function resetearTodo(){

    if(confirm("Eliminar todos los datos locales?")){

        localStorage.clear();

        location.reload();

    }

}