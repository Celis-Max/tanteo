/* ═══════════════════════════════════════════════════════════════════════
   TANTEO · la mesa viva

   Ruleta girando, cartas repartiéndose, fichas que puedes arrastrar y luces
   barriendo el paño. Todo dibujado en SVG, sin imágenes.

   REGLA DE RENDIMIENTO, aprendida a golpes en este mismo proyecto:
   solo se animan `transform` y `opacity`. Un `filter: drop-shadow` sobre
   elementos que animan, o un `mix-blend-mode` por tarjeta, obligan al
   navegador a rasterizar en cada cuadro y llegaron a congelar la pestaña.
   Las sombras van pintadas DENTRO del SVG.

   Todo se apaga si el sistema pide menos movimiento, y hay interruptor.
   ═══════════════════════════════════════════════════════════════════════ */

const MESA = (() => {
  "use strict";

  const LLAVE = "tanteo.movimiento";
  const apagado = (() => { try { return localStorage.getItem(LLAVE) === "0"; } catch(e){ return false; } })();
  const quieto = apagado || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const chico = () => innerWidth < 900;
  const azar = (a,b) => a + Math.random()*(b-a);

  /* ── Ruleta ───────────────────────────────────────────────────────── */
  function svgRuleta(){
    const N = 24, celdas = [];
    for (let i = 0; i < N; i++){
      const a0 = (i / N) * 2*Math.PI, a1 = ((i+1) / N) * 2*Math.PI;
      const R = 96, r = 62;
      const p = (ang, rad) => `${100 + rad*Math.cos(ang)} ${100 + rad*Math.sin(ang)}`;
      celdas.push(`<path d="M ${p(a0,R)} A ${R} ${R} 0 0 1 ${p(a1,R)} L ${p(a1,r)} A ${r} ${r} 0 0 0 ${p(a0,r)} Z"
        fill="${i % 2 ? "#0F0F0F" : "#A50F1A"}"/>`);
    }
    /* Los radios dorados y el buje van en un grupo aparte para girar. */
    const radios = [...Array(8)].map((_,i) =>
      `<rect x="98.6" y="16" width="2.8" height="68" rx="1.4" fill="#C9A227" opacity=".95"
        transform="rotate(${i*45} 100 100)"/>`).join("");
    return `<svg viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="106" r="96" fill="#000" opacity=".3"/>
      <circle cx="100" cy="100" r="99" fill="#3B1114"/>
      <circle cx="100" cy="100" r="92" fill="#5A1A20"/>
      <g class="rueda">
        ${celdas.join("")}
        <circle cx="100" cy="100" r="62" fill="#4A1216"/>
        ${radios}
        <circle cx="100" cy="100" r="17" fill="#C9A227"/>
        <circle cx="100" cy="100" r="9"  fill="#6B4E12"/>
      </g>
      <circle cx="100" cy="100" r="99" fill="none" stroke="#E4C877" stroke-width="2.5" opacity=".55"/>
      <circle class="bola" cx="100" cy="24" r="5.5" fill="#F6F1E6"/>
    </svg>`;
  }

  /* ── Ficha de póker ───────────────────────────────────────────────── */
  const TONOS = [
    ["#C1121F","#8E0D17"], ["#14402F","#0B291D"], ["#1F4E8C","#0E2A5A"],
    ["#1A1414","#000000"], ["#E4C877","#9C7A33"],
  ];
  function svgFicha(claro, oscuro){
    const marcas = [...Array(8)].map((_,i) =>
      `<rect x="46" y="4" width="8" height="13" rx="2" fill="#F3EFE6" opacity=".9"
        transform="rotate(${i*45} 50 50)"/>`).join("");
    return `<svg viewBox="0 0 104 110" aria-hidden="true">
      <ellipse cx="52" cy="104" rx="40" ry="5" fill="#000" opacity=".3"/>
      <g transform="translate(2 1)">
        <circle cx="50" cy="50" r="48" fill="${oscuro}"/>
        <circle cx="50" cy="50" r="45" fill="${claro}"/>
        ${marcas}
        <circle cx="50" cy="50" r="30" fill="${oscuro}" opacity=".5"/>
        <circle cx="50" cy="50" r="27" fill="none" stroke="#F3EFE6" stroke-width="2" opacity=".5"/>
      </g></svg>`;
  }

  /* ── Naipe ────────────────────────────────────────────────────────── */
  const PALOS = {
    corazon:  ["#C1121F","M50 86C24 66 12 52 12 38 12 25 22 16 33 16c7 0 13 3 17 9 4-6 10-9 17-9 11 0 21 9 21 22 0 14-12 28-38 48z"],
    picas:    ["#1A1414","M50 12C36 30 18 42 18 57c0 9 7 16 16 16 5 0 9-2 12-6-1 9-5 17-10 21h28c-5-4-9-12-10-21 3 4 7 6 12 6 9 0 16-7 16-16 0-15-18-27-32-45z"],
    trebol:   ["#1A1414","M50 12c-8 0-15 7-15 15 0 3 1 6 2 8-2-1-5-2-8-2-8 0-15 7-15 15s7 15 15 15c6 0 11-3 13-8-1 9-5 17-10 21h36c-5-4-9-12-10-21 2 5 7 8 13 8 8 0 15-7 15-15s-7-15-15-15c-3 0-6 1-8 2 1-2 2-5 2-8 0-8-7-15-15-15z"],
    diamante: ["#C1121F","M50 10 82 50 50 90 18 50z"],
  };
  function svgNaipe(palo){
    const [c,d] = PALOS[palo];
    return `<svg viewBox="0 0 74 104" aria-hidden="true">
      <rect x="4" y="6" width="67" height="97" rx="8" fill="#000" opacity=".28"/>
      <rect x="1.5" y="1.5" width="67" height="97" rx="8" fill="#F6F1E6" stroke="#C9BCA8" stroke-width="1.5"/>
      <rect x="5" y="5" width="60" height="90" rx="5" fill="none" stroke="${c}" stroke-width=".8" opacity=".35"/>
      <g transform="translate(35 50) scale(.42) translate(-50 -50)"><path d="${d}" fill="${c}" opacity=".92"/></g>
      <text x="9" y="18" font-family="Bodoni Moda, serif" font-size="13" fill="${c}">A</text>
    </svg>`;
  }

  /* ── Sembrar la mesa ──────────────────────────────────────────────── */
  let capa = null;

  function sembrar(){
    if (quieto) return null;
    capa = document.createElement("div");
    capa.className = "mesa-viva";
    capa.setAttribute("aria-hidden","true");

    /* Dos focos que vagan sobre el paño y un reflejo que lo cruza. */
    capa.insertAdjacentHTML("beforeend",
      `<div class="luz luz-a"></div><div class="luz luz-b"></div><div class="barrido"></div>`);

    /* La ruleta: una sola, grande, girando despacio. */
    const r = document.createElement("div");
    r.className = "pieza ruleta";
    r.innerHTML = svgRuleta();
    r.style.setProperty("--x", "calc(100vw - 230px)");
    r.style.setProperty("--y", "56vh");
    r.style.width = "240px";
    capa.appendChild(r);

    /* Fichas y naipes. Pocos: cada uno es una capa que el navegador compone
       aparte y de más se nota en máquinas lentas. */
    const piezas = [];
    const cuantas = chico() ? 4 : 9;
    for (let i = 0; i < cuantas; i++){
      const [c,o] = TONOS[i % TONOS.length];
      piezas.push({ html: svgFicha(c,o), clase:"ficha", tam: azar(36,74) });
    }
    const palos = Object.keys(PALOS);
    for (let i = 0; i < (chico() ? 2 : 4); i++)
      piezas.push({ html: svgNaipe(palos[i % palos.length]), clase:"naipe", tam: azar(50,82) });

    piezas.forEach((p,i) => {
      const el = document.createElement("div");
      el.className = "pieza " + p.clase;
      el.innerHTML = p.html;
      el.style.setProperty("--x", azar(2,88) + "vw");
      el.style.setProperty("--y", azar(6,88) + "vh");
      el.style.setProperty("--giro", azar(-30,30) + "deg");
      el.style.setProperty("--dur", azar(14,30) + "s");
      el.style.setProperty("--retraso", (-azar(0,18)) + "s");
      el.style.setProperty("--hondo", (0.16 + (i % 4) * 0.08).toFixed(2));
      el.style.width = Math.round(p.tam * (0.7 + (i % 4) * 0.12)) + "px";
      capa.appendChild(el);
    });

    /* Delante del contenido en el árbol, detrás de él al pintar. */
    const mesa = document.querySelector(".table") || document.body;
    mesa.insertBefore(capa, mesa.firstChild);
    arrastrables();
    return capa;
  }

  /* Agarra una ficha y muévela. Detalle tonto, y por eso gusta. */
  function arrastrables(){
    let llevo = null;
    capa.addEventListener("pointerdown", e => {
      const pieza = e.target.closest(".pieza");
      if (!pieza) return;
      const r = pieza.getBoundingClientRect();
      llevo = { pieza, dx: e.clientX - r.left - r.width/2, dy: e.clientY - r.top - r.height/2 };
      pieza.classList.add("agarrada");
      try { pieza.setPointerCapture(e.pointerId); } catch(err){}
      e.preventDefault();
    });
    capa.addEventListener("pointermove", e => {
      if (!llevo) return;
      llevo.pieza.style.setProperty("--x", (e.clientX - llevo.dx) + "px");
      llevo.pieza.style.setProperty("--y", (e.clientY - llevo.dy) + "px");
    });
    const soltar = () => { llevo = null; };
    capa.addEventListener("pointerup", soltar);
    capa.addEventListener("pointercancel", soltar);
  }

  /* ── Paralaje: un solo transform sobre la capa entera ──────────────── */
  function paralaje(){
    if (quieto || !capa) return;
    let mx = 0, my = 0, sy = 0, pedido = false;
    const pintar = () => {
      pedido = false;
      capa.style.transform = `translate3d(${mx*20}px, ${my*20 - sy*0.05}px, 0)`;
    };
    const pedir = () => { if (!pedido){ pedido = true; requestAnimationFrame(pintar); } };
    addEventListener("pointermove", e => {
      mx = (e.clientX/innerWidth - .5)*2; my = (e.clientY/innerHeight - .5)*2; pedir();
    }, { passive:true });
    addEventListener("scroll", () => { sy = scrollY; pedir(); }, { passive:true });
  }

  /* ── Reparto de cartas ────────────────────────────────────────────── */
  let observador = null;
  function repartir(){
    if (quieto) return;
    if (!observador){
      observador = new IntersectionObserver(es => {
        es.forEach(e => {
          if (!e.isIntersecting) return;
          soltar(e.target);
          observador.unobserve(e.target);
        });
      }, { rootMargin: "90px 0px", threshold: .03 });
    }

    /* El estilo en línea le gana a cualquier hoja de estilos, y estas
       tarjetas traen su `transform: rotate(Ndeg)` en el atributo. Si lo
       dejamos, la animación de reparto simplemente no ocurre: se ve la
       tarjeta quieta y uno jura que el CSS está mal. Lo movemos a --base
       y lo volvemos a componer desde movimiento.css. */
    const nuevas = [...document.querySelectorAll(".paper.card:not(.por-repartir)")];
    nuevas.forEach((el,i) => {
      const base = el.style.transform;
      if (base) el.style.setProperty("--base", base);
      el.style.removeProperty("transform");
      el.classList.add("por-repartir");
      el.style.setProperty("--orden", Math.min(i, 7));

      /* Una tarjeta de 860 px girando 13° se ve como un error, no como un
         reparto: el gesto tiene que encogerse conforme crece la carta. */
      const ancho = el.offsetWidth || 320;
      const f = Math.max(.22, Math.min(1, 340 / ancho));
      el.style.setProperty("--cae",   (34 * f).toFixed(1) + "px");
      el.style.setProperty("--sesgo", (-13 * f).toFixed(1) + "deg");
      el.style.setProperty("--merma", (1 - .07 * f).toFixed(3));
      observador.observe(el);
    });

    /* Red de seguridad: las tarjetas arrancan invisibles y es el observador
       quien las muestra. Si por lo que sea no disparara, el adorno estaría
       escondiendo el contenido. A los 2.5 s se reparten solas. */
    setTimeout(() => nuevas.forEach(soltar), 2500);
  }

  /* Al terminar el reparto se cambia a `asentada`, que suelta la transición
     larga para que la inclinación siga al cursor sin retraso. */
  function soltar(el){
    if (el.classList.contains("repartida")) return;
    el.classList.add("repartida");
    const listo = () => el.classList.add("asentada");
    el.addEventListener("transitionend", listo, { once:true });
    setTimeout(listo, 1400);
  }

  /* ── Inclinación 3D con brillo que sigue al cursor ─────────────────── */
  function inclinar(){
    if (quieto || matchMedia("(hover: none)").matches) return;
    let activa = null, ultimo = null, pedido = false;
    /* getBoundingClientRect fuerza recálculo de diseño: agrupado en un cuadro
       se llama una vez por repintado, no una por gesto del ratón. */
    const aplicar = () => {
      pedido = false;
      if (!activa || !ultimo) return;
      const r = activa.getBoundingClientRect();
      const px = (ultimo.x - r.left)/r.width - .5, py = (ultimo.y - r.top)/r.height - .5;
      activa.style.setProperty("--rx", (-py*3.4).toFixed(2) + "deg");
      activa.style.setProperty("--ry", (px*4.6).toFixed(2) + "deg");
      activa.style.setProperty("--luz", ((px+.5)*100).toFixed(1) + "%");
    };
    document.addEventListener("pointermove", e => {
      const t = e.target.closest(".paper.card.asentada");
      if (t !== activa){
        if (activa){ activa.style.removeProperty("--rx"); activa.style.removeProperty("--ry"); }
        activa = t;
      }
      if (!t) return;
      ultimo = { x:e.clientX, y:e.clientY };
      if (!pedido){ pedido = true; requestAnimationFrame(aplicar); }
    }, { passive:true });
  }

  return {
    quieto, apagado,
    alternar(){
      try { localStorage.setItem(LLAVE, quieto ? "1" : "0"); } catch(e){}
      location.reload();
    },
    interruptor(){
      const b = document.createElement("button");
      b.className = "boton-movimiento";
      b.type = "button";
      b.textContent = quieto ? "\u25B6" : "\u23F8";
      b.title = quieto ? "Encender el movimiento de la mesa"
                       : "Detener el movimiento de la mesa";
      b.setAttribute("aria-label", b.title);
      b.addEventListener("click", () => MESA.alternar());
      document.body.appendChild(b);
    },
    iniciar(){
      this.interruptor();
      if (quieto){ document.body.classList.add("sin-movimiento"); return; }
      sembrar(); paralaje(); inclinar(); repartir();
      /* Las páginas repintan listas con JS: hay que volver a marcar. */
      const obs = new MutationObserver(() => repartir());
      obs.observe(document.body, { childList:true, subtree:true });
    },
  };
})();

document.addEventListener("DOMContentLoaded", () => MESA.iniciar());
