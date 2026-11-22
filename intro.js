

(function () {
    "use strict";

    if (window.__biomaintIntroStarted) return;
    window.__biomaintIntroStarted = true;

    /* APPAREILS DE L'INTRODUCTION */
    const MACHINES = [
        { src: "assets/cobas.webp", brand: "Roche", name: "COBAS C 311", type: "Analyseur de biochimie", alt: "Analyseur de biochimie cobas c 311" },
        { src: "assets/moniteur.webp", brand: "BLT", name: "M1000", type: "Moniteur multiparamétrique", alt: "Moniteur multiparamétrique" },
        { src: "assets/ventilateur.webp", brand: "Dräger", name: "Evita V500", type: "Ventilateur de réanimation", alt: "Ventilateur de réanimation" },
        { src: "assets/echographe.webp", brand: "Mindray", name: "DP-9900Plus", type: "Échographe numérique", alt: "Échographe numérique" },
        { src: "assets/analyseur.webp", brand: "Genrui", name: "KT-6400", type: "Analyseur d'hématologie", alt: "Analyseur d'hématologie" },
        { src: "assets/sterilisateur.webp", brand: "Autoclave", name: "E6 - 18 L", type: "Stérilisateur médical", alt: "Autoclave stérilisateur" },
        { src: "assets/centrifugeuse.webp", brand: "ScanSpeed", name: "CTZ-6K", type: "Centrifugeuse de laboratoire", alt: "Centrifugeuse" },
        { src: "assets/anesthesie.webp", brand: "Dräger", name: "Fabius GS Premium", type: "Appareil d'anesthésie", alt: "Appareil d'anesthésie" },
        { src: "assets/oxymetre.webp", brand: "Contec", name: "PO100", type: "Oxymètre de pouls", alt: "Oxymètre de pouls" },
        { src: "assets/kenza.webp", brand: "", name: "Kenza 240 TX", type: "Analyseur de biochimie", alt: "Analyseur de biochimie Kenza 240 TX" },
        { src: "assets/ionogramme.webp", brand: "Ionogramme", name: "EX3", type: "Analyseur d'électrolytes", alt: "Analyseur d'électrolytes" },
        { src: "assets/bistouri.webp", brand: "Valleylab", name: "Force FX", type: "Bistouri électrique", alt: "Bistouri électrique" },
    ];
    const fullName = m => [m.brand, m.name].filter(Boolean).join(" ");
    let idx = 0;
    try {
        idx = (parseInt(localStorage.getItem("bm_intro_i"), 10) + 1) % MACHINES.length;
        if (isNaN(idx)) idx = 0;
        localStorage.setItem("bm_intro_i", idx);
    } catch (e) { idx = 0; }
    const M = MACHINES[idx] || MACHINES[0];

    const style = document.createElement("style");

    style.textContent = `

    * {
        box-sizing: border-box;
    }

    #bm-intro {
        position: fixed;
        inset: 0;
        z-index: 9999999;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        background:
            radial-gradient(ellipse at 50% 45%, #12384b 0%, #071624 48%, #020711 100%);
        font-family: "Segoe UI", Arial, sans-serif;
        color: white;
        opacity: 1;
        transition: opacity .8s ease;
    }

    #bm-intro.hide {
        opacity: 0;
        pointer-events: none;
    }

    .bm-grid {
        position: absolute;
        inset: 0;
        opacity: .24;
        background-image:
            linear-gradient(rgba(44,190,205,.12) 1px, transparent 1px),
            linear-gradient(90deg, rgba(44,190,205,.12) 1px, transparent 1px);
        background-size: 55px 55px;
        transform: perspective(500px) rotateX(60deg) scale(2);
        transform-origin: center bottom;
        animation: bm-grid-move 12s linear infinite;
    }

    @keyframes bm-grid-move {
        from { background-position: 0 0; }
        to { background-position: 0 55px; }
    }

    .bm-particles {
        position: absolute;
        inset: 0;
        pointer-events: none;
    }

    .bm-particle {
        position: absolute;
        width: 3px;
        height: 3px;
        border-radius: 50%;
        background: #55f5df;
        box-shadow: 0 0 12px #32e9dc;
        animation: bm-float 5s infinite ease-in-out;
    }

    @keyframes bm-float {
        0%,100% { transform: translateY(0); opacity: .25; }
        50% { transform: translateY(-45px); opacity: 1; }
    }

    .bm-top {
        position: absolute;
        top: 35px;
        left: 0;
        right: 0;
        text-align: center;
        font-size: 11px;
        letter-spacing: 4px;
        color: #80b7c9;
        text-transform: uppercase;
    }

    .bm-stage {
        position: absolute;
        top: 47%;
        left: 50%;
        width: min(760px, 90vw);
        height: min(390px, 52vh);
        transform: translate(-50%, -50%);
        perspective: 1100px;
    }

    .bm-machine {
        position: absolute;
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        opacity: 0;
        transform: translateY(35px) rotateY(-12deg) scale(.78);
        animation: bm-machine-in 2s .3s forwards;
        filter: drop-shadow(0 0 35px rgba(45,220,210,.24));
    }

    .bm-machine img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        animation: bm-machine-float 5s 2s ease-in-out infinite;
    }

    @keyframes bm-machine-in {
        to {
            opacity: 1;
            transform: translateY(0) rotateY(-5deg) scale(1);
        }
    }

    @keyframes bm-machine-float {
        0%,100% { transform: translateY(0) rotateY(-2deg); }
        50% { transform: translateY(-9px) rotateY(2deg); }
    }

    /* Plaque d'identification de l'équipement */
    .bm-id {
        position: absolute;
        left: 50%;
        top: 100%;
        margin-top: 6px;
        transform: translateX(-50%);
        min-width: 220px;
        max-width: 96%;
        padding: 9px 22px 10px;
        text-align: center;
        border: 1px solid rgba(67,239,218,.55);
        border-radius: 8px;
        background: linear-gradient(180deg, rgba(5,38,56,.92), rgba(3,22,35,.92));
        box-shadow: 0 0 22px rgba(43,225,210,.22);
        opacity: 0;
        animation: bm-id-in .8s 1.6s forwards;
    }

    .bm-id small {
        display: block;
        font-size: 10px;
        letter-spacing: 4px;
        text-transform: uppercase;
        color: #80b7c9;
    }

    .bm-id small:empty { display: none; }

    .bm-id b {
        display: block;
        font-size: 22px;
        line-height: 1.2;
        letter-spacing: 2px;
        text-transform: uppercase;
        color: #e8fffb;
        text-shadow: 0 0 14px rgba(67,239,218,.7);
    }

    .bm-id span {
        display: block;
        margin-top: 2px;
        font-size: 11px;
        letter-spacing: 2px;
        color: #8ffff0;
    }

    @keyframes bm-id-in {
        from { opacity: 0; transform: translateX(-50%) translateY(10px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }

    .bm-scan {
        position: absolute;
        left: 8%;
        right: 8%;
        height: 3px;
        top: 10%;
        opacity: 0;
        background: linear-gradient(
            90deg,
            transparent,
            #35ffe1,
            #ffffff,
            #35ffe1,
            transparent
        );
        box-shadow: 0 0 18px #35ffe1, 0 0 40px #35ffe1;
        animation: bm-scan 3s 2.5s ease-in-out forwards;
    }

    @keyframes bm-scan {
        0% { top: 10%; opacity: 0; }
        10% { opacity: 1; }
        85% { opacity: 1; }
        100% { top: 90%; opacity: 0; }
    }

    .bm-ring {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 440px;
        height: 160px;
        max-width: 90%;
        border: 1px solid rgba(63,239,218,.6);
        border-radius: 50%;
        transform: translate(-50%,-50%) rotateX(70deg);
        box-shadow: 0 0 20px rgba(41,233,211,.25);
        animation: bm-ring 5s linear infinite;
    }

    .bm-ring.second {
        width: 520px;
        height: 190px;
        border-color: rgba(63,166,255,.4);
        animation-direction: reverse;
    }

    @keyframes bm-ring {
        from { transform: translate(-50%,-50%) rotateX(70deg) rotateZ(0); }
        to { transform: translate(-50%,-50%) rotateX(70deg) rotateZ(360deg); }
    }

    .bm-label {
        position: absolute;
        padding: 8px 13px;
        border: 1px solid rgba(67,239,218,.55);
        background: rgba(3,25,39,.85);
        color: #8ffff0;
        font-size: 10px;
        letter-spacing: 1px;
        border-radius: 5px;
        opacity: 0;
        box-shadow: 0 0 18px rgba(43,225,210,.15);
    }

    .bm-label.one {
        left: 2%;
        top: 30%;
        animation: bm-label-in .7s 3.5s forwards;
    }

    .bm-label.two {
        right: 2%;
        top: 55%;
        animation: bm-label-in .7s 4s forwards;
    }

    .bm-label.three {
        left: 10%;
        bottom: 12%;
        animation: bm-label-in .7s 4.5s forwards;
    }

    @keyframes bm-label-in {
        from { opacity: 0; transform: translateY(12px); }
        to { opacity: 1; transform: translateY(0); }
    }

    /* Intelligence artificielle */

    .bm-ai {
        position: absolute;
        top: 8%;
        right: 13%;
        width: 75px;
        height: 75px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        color: #c8fff7;
        font-size: 22px;
        font-weight: 800;
        background: radial-gradient(circle, #43e8d4, #087caa 55%, #031a30);
        box-shadow: 0 0 25px #21d8d0, 0 0 65px rgba(28,224,210,.5);
        opacity: 0;
        animation: bm-ai-in .9s 5s forwards, bm-ai-pulse 2s 6s infinite;
    }

    .bm-ai::before,
    .bm-ai::after {
        content: "";
        position: absolute;
        inset: -12px;
        border: 1px solid #42e8d4;
        border-radius: 50%;
        animation: bm-ai-spin 5s linear infinite;
    }

    .bm-ai::after {
        inset: -20px;
        border-color: rgba(74,161,255,.7);
        animation-direction: reverse;
    }

    @keyframes bm-ai-in {
        to { opacity: 1; }
    }

    @keyframes bm-ai-pulse {
        50% { box-shadow: 0 0 45px #21d8d0, 0 0 90px rgba(28,224,210,.7); }
    }

    @keyframes bm-ai-spin {
        to { transform: rotate(360deg); }
    }

    /* Documents techniques */

    .bm-documents {
        position: absolute;
        right: 3%;
        bottom: 7%;
        display: flex;
        gap: 9px;
        opacity: 0;
        animation: bm-doc-in 1s 6s forwards;
    }

    @keyframes bm-doc-in {
        from { opacity: 0; transform: translateY(35px) rotateY(-20deg); }
        to { opacity: 1; transform: translateY(0) rotateY(0); }
    }

    .bm-document {
        width: 75px;
        height: 105px;
        padding: 9px 7px;
        background: linear-gradient(145deg,#f5ffff,#c8e4e9);
        color: #163e52;
        border-radius: 4px;
        box-shadow: 0 0 22px rgba(60,224,215,.35);
        transform: rotateY(-12deg);
        animation: bm-document-float 3s ease-in-out infinite;
    }

    .bm-document:nth-child(2) {
        animation-delay: .4s;
        transform: translateY(-12px) rotateY(5deg);
    }

    .bm-document:nth-child(3) {
        animation-delay: .8s;
    }

    @keyframes bm-document-float {
        50% { transform: translateY(-10px) rotateY(8deg); }
    }

    .bm-document b {
        display: block;
        font-size: 8px;
        margin-bottom: 10px;
        color: #087e91;
    }

    .bm-document .doc-lines {
        height: 2px;
        margin: 6px 0;
        background: #91b6c0;
    }

    .bm-document .doc-diagram {
        height: 27px;
        margin: 7px 0;
        border: 1px solid #299da5;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
    }

    /* Connexion IA / documentation */

    .bm-connection {
        position: absolute;
        top: 35%;
        right: 13%;
        width: 28%;
        height: 2px;
        background: linear-gradient(90deg,transparent,#4cf3db,transparent);
        transform: rotate(35deg);
        opacity: 0;
        animation: bm-connection 2s 6.2s forwards;
    }

    @keyframes bm-connection {
        0% { opacity: 0; width: 0; }
        100% { opacity: 1; width: 28%; }
    }

    /* Signature finale */

    .bm-brand {
        position: absolute;
        bottom: 8%;
        left: 0;
        right: 0;
        text-align: center;
        opacity: 0;
        animation: bm-brand-in 1.1s 7.2s forwards;
    }

    @keyframes bm-brand-in {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .bm-brand h1 {
        font-size: clamp(32px,5vw,52px);
        margin: 0;
        letter-spacing: 3px;
        font-weight: 800;
        text-shadow: 0 0 25px rgba(52,230,216,.35);
    }

    .bm-brand h1 span {
        color: #43e8d4;
    }

    .bm-brand p {
        margin-top: 10px;
        font-size: 12px;
        color: #a9c7d6;
        letter-spacing: 3px;
        text-transform: uppercase;
    }

    .bm-skip {
        position: absolute;
        right: 20px;
        bottom: 20px;
        font-size: 10px;
        color: #8ba9bb;
        letter-spacing: 1px;
    }

    @media(max-width:600px) {
        .bm-stage {
            width: 96vw;
            height: 38vh;
            top: 44%;
        }

        .bm-label {
            font-size: 8px;
            padding: 6px;
        }

        .bm-id { min-width: 250px; padding: 7px 14px 8px; }
        .bm-id b { font-size: 18px; letter-spacing: 1px; }
        .bm-id small { font-size: 9px; letter-spacing: 3px; }
        .bm-id span { font-size: 10px; }

        .bm-documents {
            transform: scale(.7);
            transform-origin: bottom right;
            right: 0;
        }

        .bm-ai {
            width: 55px;
            height: 55px;
            font-size: 17px;
        }

        .bm-ring {
            width: 300px;
            height: 120px;
        }
    }

    `;

    document.head.appendChild(style);

    const root = document.createElement("div");
    root.id = "bm-intro";

    root.innerHTML = `

        <div class="bm-grid"></div>

        <div class="bm-particles" id="bm-particles"></div>

        <div class="bm-top">
            SYSTÈME DE MAINTENANCE BIOMÉDICALE
        </div>

        <div class="bm-stage">

            <div class="bm-ring"></div>
            <div class="bm-ring second"></div>

            <div class="bm-machine">
                <img
                    src="${M.src}"
                    alt="${M.alt}"
                >
            </div>

            <div class="bm-id" id="bm-id">
                <small>${M.brand}</small>
                <b>${M.name}</b>
                <span>${M.type}</span>
            </div>

            <div class="bm-scan"></div>

            <div class="bm-label one">
                ◈ ANALYSE DE L'ÉQUIPEMENT
            </div>

            <div class="bm-label two">
                ✓ CONTRÔLE TECHNIQUE
            </div>

            <div class="bm-label three">
                ⚙ MAINTENANCE BIOMÉDICALE
            </div>

            <div class="bm-ai">IA</div>

            <div class="bm-connection"></div>

            <div class="bm-documents">

                <div class="bm-document">
                    <b>MANUEL TECHNIQUE</b>
                    <div class="doc-diagram">⚙</div>
                    <div class="doc-lines"></div>
                    <div class="doc-lines"></div>
                    <div class="doc-lines"></div>
                    <div class="doc-lines"></div>
                </div>

                <div class="bm-document">
                    <b>DOCUMENTATION</b>
                    <div class="doc-diagram">⌘</div>
                    <div class="doc-lines"></div>
                    <div class="doc-lines"></div>
                    <div class="doc-lines"></div>
                    <div class="doc-lines"></div>
                </div>

                <div class="bm-document">
                    <b>DIAGNOSTIC</b>
                    <div class="doc-diagram">⌕</div>
                    <div class="doc-lines"></div>
                    <div class="doc-lines"></div>
                    <div class="doc-lines"></div>
                    <div class="doc-lines"></div>
                </div>

            </div>

        </div>

        <div class="bm-brand">
            <h1>BioMaint <span>IA</span></h1>
            <p>Diagnostiquer · Maintenir · Comprendre</p>
        </div>

        <div class="bm-skip">
            TOUCHER POUR PASSER ›
        </div>

    `;

    document.body.appendChild(root);

    /* Image introuvable : retour à l'appareil par défaut */
    root.querySelector(".bm-machine img").onerror = function () {
        if (!this.src.endsWith(MACHINES[0].src)) {
            this.src = MACHINES[0].src;
            const id = root.querySelector("#bm-id"), m0 = MACHINES[0];
            if (id) { id.querySelector("small").textContent = m0.brand; id.querySelector("b").textContent = m0.name; id.querySelector("span").textContent = m0.type; }
            M.__fallback = m0;
            const top = root.querySelector(".bm-top");
            if (top && /^RECONNAISSANCE/.test(top.textContent)) top.textContent = "RECONNAISSANCE DE L'ÉQUIPEMENT " + fullName(m0);
        }
    };

    /* Particules lumineuses */

    const particleContainer = root.querySelector("#bm-particles");

    for (let i = 0; i < 65; i++) {

        const particle = document.createElement("div");

        particle.className = "bm-particle";

        particle.style.left = Math.random() * 100 + "%";
        particle.style.top = Math.random() * 100 + "%";

        particle.style.animationDelay = Math.random() * 5 + "s";
        particle.style.animationDuration =
            (3 + Math.random() * 4) + "s";

        particleContainer.appendChild(particle);
    }

    /* Messages évolutifs */

    const status = root.querySelector(".bm-top");

    const messages = [
        [0, "RECONNAISSANCE DE L'ÉQUIPEMENT " + fullName(M.__fallback || M)],
        [2500, "SCAN ET DIAGNOSTIC DE MAINTENANCE"],
        [4800, "ACTIVATION DE L'INTELLIGENCE ARTIFICIELLE"],
        [6200, "RECHERCHE DES MANUELS TECHNIQUES"],
        [8500, "ANALYSE DOCUMENTAIRE ET ASSISTANCE TECHNIQUE"]
    ];

    const timers = messages.map(([delay, message]) =>
        setTimeout(() => {
            if (!finished) status.textContent = message;
        }, delay)
    );

    let finished = false;

    function closeIntro() {

        if (finished) return;

        finished = true;

        timers.forEach(clearTimeout);

        root.classList.add("hide");

        window.removeEventListener("keydown", keyHandler);

        setTimeout(() => {
            root.remove();
            style.remove();

            const pin = document.getElementById("pin");

            if (pin) {
                try {
                    pin.focus({ preventScroll: true });
                } catch (e) {
                    pin.focus();
                }
            }

        }, 850);
    }

    function keyHandler(event) {

        if (
            event.key === "Escape" ||
            event.key === " " ||
            event.key === "Enter"
        ) {
            event.preventDefault();
            closeIntro();
        }
    }

    root.addEventListener("click", closeIntro);

    root.addEventListener(
        "touchstart",
        closeIntro,
        { passive: true }
    );

    window.addEventListener("keydown", keyHandler);

    /* Fermeture automatique après 12 secondes */

    setTimeout(closeIntro, 12000);

})();