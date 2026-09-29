/* ═══════════════════════════════════════════════════════════════════════
   TANTEO · página "En vivo"

   Junta dos fuentes que no saben una de la otra:

     · `datos.js`  — la foto diaria: calendario, modelo, probabilidades,
                     clima, tabla. Es quien manda sobre qué partidos hay.
     · `EnVivo`    — ESPN, cada minuto: marcador en curso, minuto, posesión,
                     tiros y el minuto de cada gol.

   Regla: si ESPN no sabe de un partido, se muestra lo del modelo y ya. No
   se rellena ningún hueco con estimaciones. Un minuto inventado en una
   página que dice "en vivo" es mentira, no es diseño.
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const pct = x => Math.round(x * 100) + "%";
  const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

  const D = typeof DATOS !== "undefined" ? DATOS : null;
  if (!D) return;

  /* ── Probabilidades: se derivan de la matriz de marcadores, igual que en
     el resto del proyecto. El campo `probabilidades` viene del ensamble y
     difiere hasta 0.4 puntos; mezclarlos daría números que no cuadran entre
     páginas. ───────────────────────────────────────────────────────────── */
  const MERCADOS = {
    "1":  (a,b) => a > b,   "X": (a,b) => a === b,  "2": (a,b) => a < b,
    "BTTS": (a,b) => a > 0 && b > 0,
    "O35": (a,b) => a + b > 3,
  };
  function probs(p){
    const M = p.matriz_ajustada || p.matriz;
    if (!M) return p.probabilidades || {};
    const r = {};
    for (const k in MERCADOS){
      let s = 0;
      for (let a = 0; a < M.length; a++)
        for (let b = 0; b < M[a].length; b++)
          if (MERCADOS[k](a,b)) s += M[a][b];
      r[k] = s;
    }
    return r;
  }

  const ESC = D.escudos || {};
  const color = e => (ESC[e] || {}).color  || "#1F5E47";
  const color2 = e => (ESC[e] || {}).color2 || "#F3EFE6";
  const posTabla = e => {
    const i = (D.tabla || []).findIndex(r => r.equipo === e);
    return i >= 0 ? (i + 1) + "º en la tabla" : "";
  };

  const fecha = (f, h) => {
    const d = new Date(f + "T12:00");
    return `${d.getDate()} ${MESES[d.getMonth()]}${h ? " · " + h : ""}`;
  };

  /* El clima viene de clima.py con estos campos: temperatura, lluvia, viento,
     humedad, altitud. No hay "cielo" ni "temp": buscarlos devolvía vacío. */
  function climaDe(p){
    const c = p.clima;
    if (!c || c.temperatura == null) return "";
    const partes = [`${Math.round(c.temperatura)}°`];
    partes.push(c.lluvia > 0.2 ? "con lluvia" : "sin lluvia");
    if (c.viento >= 20) partes.push(`viento ${Math.round(c.viento)} km/h`);
    if (c.altitud >= 2200) partes.push(`altura ${c.altitud} m`);
    return partes.join(" · ");
  }

  /* Los escudos no traen abreviatura, y derivarla del nombre da resultados
     feos ("Atl. San Luis" → "ATL", igual que Atlas). Se escriben las 18. */
  const ABR = {
    "Club America":"AME", "Atlante":"ATE", "Atlas":"ATL", "Atl. San Luis":"SLU",
    "Cruz Azul":"CAZ", "Juarez":"JUA", "Guadalajara Chivas":"GDL", "Club Leon":"LEO",
    "Monterrey":"MTY", "Necaxa":"NEC", "Pachuca":"PAC", "Puebla":"PUE",
    "UNAM Pumas":"PUM", "Queretaro":"QRO", "Santos Laguna":"SAN", "Tigres UANL":"TIG",
    "Club Tijuana":"TIJ", "Toluca":"TOL", "Mazatlan FC":"MAZ",
  };
  const abrev = e => ABR[e] || (e || "").replace(/[^A-Za-zÁÉÍÓÚÑ]/g, "").slice(0, 3).toUpperCase();

  /* ── Jornada en curso: la primera con partidos por jugar ──────────────── */
  /* Cuál es "la jornada en curso" no es obvio: puede haber un partido
     pospuesto de una jornada vieja jugándose hoy (pasó con Atlante–Monterrey
     de la J8). Tomar la menor jornada pendiente mandaba a la J8 entera cuando
     la que importa es la J9. Se resuelve por fecha: la jornada del próximo
     partido por jugar y, si dos caen el mismo día, la más avanzada. */
  const pendientes = D.partidos
    .filter(p => !p.jugado && typeof p.jornada === "number")
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  /* Los datos traen jornadas encimadas: el 26 de septiembre hay partidos de
     la J9 y de la J10 a la vez. Desempatar por "la jornada más avanzada"
     mandaba a la J10 por un solo partido. Gana la jornada con más partidos
     en la semana que viene, que es la que de verdad se está jugando. */
  const jornada = (() => {
    if (!pendientes.length)
      return Math.max(...D.partidos.filter(p => typeof p.jornada === "number").map(p => p.jornada));
    const desde = pendientes[0].fecha;
    const hasta = new Date(new Date(desde + "T12:00").getTime() + 7 * 864e5)
      .toISOString().slice(0, 10);
    const cuenta = {};
    pendientes.filter(p => p.fecha <= hasta)
      .forEach(p => { cuenta[p.jornada] = (cuenta[p.jornada] || 0) + 1; });
    return +Object.entries(cuenta).sort((a, b) =>
      b[1] - a[1] || a[0] - b[0])[0][0];
  })();
  const deLaJornada = D.partidos.filter(p => p.jornada === jornada);

  /* ── Tarjeta compacta ─────────────────────────────────────────────────── */
  function filaPartido(p){
    const P = probs(p);
    const vivo = typeof EnVivo !== "undefined" ? EnVivo.buscar(p) : null;
    const mayor = Math.max(P["1"] || 0, P["X"] || 0, P["2"] || 0);
    const ficha = (v, c) => `<span class="chip pr sm${v === mayor ? " on" : ""}" style="--c: ${c}"><b>${pct(v)}</b></span>`;

    let pie;
    if (vivo && vivo.enJuego)      pie = `<b style="color:#C1121F">En juego · ${vivo.minuto || ""}</b> · ${vivo.gl}–${vivo.gv}`;
    else if (p.jugado)             pie = `Final · ${p.gl}–${p.gv}`;
    else                           pie = `${fecha(p.fecha, p.hora)}${climaDe(p) ? " · " + climaDe(p) : ""}`;

    return `<div class="paper card" style="padding: 18px 22px; display: flex; align-items: center; gap: 12px">
      ${escudo(p.local, "s")}
      ${escudo(p.visita, "s")}
      <div style="flex-grow: 1; min-width: 0">
        <div style="font-weight: 800; font-size: 16px">${p.local} vs ${p.visita}</div>
        <div style="font-size: 13px; color: #5A4C44">${pie}</div>
      </div>
      <div style="display: flex; gap: 6px">
        ${ficha(P["1"] || 0, "#C1121F")}${ficha(P["X"] || 0, "#1A1414")}${ficha(P["2"] || 0, "#1F4E8C")}
      </div></div>`;
  }

  /* ── Tarjeta destacada: el partido en juego, o el más próximo ─────────── */
  function elegirDestacado(){
    if (typeof EnVivo !== "undefined"){
      const jugando = deLaJornada.find(p => { const v = EnVivo.buscar(p); return v && v.enJuego; });
      if (jugando) return jugando;
    }
    return deLaJornada.find(p => !p.jugado) || deLaJornada[0];
  }

  function pintarDestacado(p){
    if (!p) return;
    const P = probs(p);
    const vivo = typeof EnVivo !== "undefined" ? EnVivo.buscar(p) : null;
    const pon = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };

    pon("d-sede", (p.sede || p.ciudad || "").toUpperCase());
    pon("d-clima", climaDe(p) || "sin dato de clima");

    if (vivo && vivo.enJuego)
      pon("d-estado", `<span class="live" style="background:#FFFFFF;box-shadow:0 0 0 4px rgba(255,255,255,.3)"></span>EN VIVO · ${vivo.minuto || ""}`);
    else if (p.jugado)  pon("d-estado", "FINAL");
    else                pon("d-estado", fecha(p.fecha, p.hora).toUpperCase());

    pon("d-local", p.local);
    pon("d-visita", p.visita);
    /* Los dos escudos grandes de la tarjeta principal. Si el club no tiene
       imagen se cae al banderín de colores con las iniciales, que es lo que
       traía la plantilla. */
    const marca = (id, e) => {
      const el = $(id);
      if (!el) return;
      const d = (ESC[e] || {});
      if (d.img){
        el.className = (el.className.replace(/\bcon-escudo\b/g, "").trim() + " con-escudo").trim();
        el.title = e;
        el.style.background = "";
        el.innerHTML = `<img src="${d.img}" alt="${e}">`;
      } else {
        el.className = el.className.replace(/\bcon-escudo\b/g, "").trim();
        el.textContent = abrev(e);
        el.style.background = `linear-gradient(135deg, ${color(e)} 50%, ${color2(e)} 50%)`;
      }
    };
    marca("d-abr-local", p.local);
    marca("d-abr-visita", p.visita);
    pon("d-local-pos", "Local · " + posTabla(p.local));
    pon("d-visita-pos", "Visitante · " + posTabla(p.visita));

    /* Marcador: el de ESPN si hay, el nuestro si ya se jugó, guiones si falta. */
    const gl = vivo && vivo.gl != null ? vivo.gl : (p.jugado ? p.gl : null);
    const gv = vivo && vivo.gv != null ? vivo.gv : (p.jugado ? p.gv : null);
    const marcador = document.querySelector('#d-local')?.closest('[style*="grid-template-columns"]')
      ?.querySelector('[style*="font-size: 100px"]');
    if (marcador){
      const rombo = marcador.querySelector('span');
      marcador.childNodes[0] && (marcador.childNodes[0].nodeValue = gl != null ? String(gl) : "–");
      if (rombo && rombo.nextSibling) rombo.nextSibling.nodeValue = gv != null ? String(gv) : "–";
    }

    pon("d-nota", vivo && vivo.descanso ? "medio tiempo"
       : (p.jugado ? p.estado || "" : "aún no empieza"));

    /* La barra y los porcentajes son SIEMPRE del modelo. ESPN da el marcador;
       la probabilidad la calcula Tanteo. */
    pon("d-p1", `${p.local} ${pct(P["1"] || 0)}`);
    pon("d-px", `Empate ${pct(P["X"] || 0)}`);
    pon("d-p2", `${p.visita} ${pct(P["2"] || 0)}`);
    pon("d-antes", `Goles esperados del modelo: ${p.local} ${(p.goles_esperados || [0,0])[0].toFixed(2)} · ${p.visita} ${(p.goles_esperados || [0,0])[1].toFixed(2)}`);
    pon("d-cambio", vivo && vivo.posesion && vivo.posesion[0]
        ? `Posesión ${vivo.posesion[0]}% – ${vivo.posesion[1]}%` : "");
  }

  /* ── Contadores de los filtros ───────────────────────────────────────── */
  function pintarFiltros(){
    const enJuego = deLaJornada.filter(p => { const v = typeof EnVivo!=="undefined" && EnVivo.buscar(p); return v && v.enJuego; }).length;
    const fin = deLaJornada.filter(p => p.jugado).length;
    const prox = deLaJornada.length - fin - enJuego;
    /* Por ancho se colaban dos tréboles decorativos. Se buscan por su
       rótulo, que es lo que de verdad las identifica. */
    const porRotulo = { "Todos": deLaJornada.length, "En juego": enJuego,
                        "Finalizados": fin, "Próximos": prox };
    document.querySelectorAll("button").forEach(b => {
      const rotulo = Object.keys(porRotulo).find(r => b.textContent.trim().endsWith(r));
      if (!rotulo) return;
      const ficha = b.querySelector(".chip");
      if (ficha) ficha.textContent = porRotulo[rotulo];
    });
  }

  function pintarTitulo(){
    const h1 = document.querySelector("h1");
    if (h1) h1.innerHTML = h1.innerHTML.replace(/Jornada\s*\d+/, "Jornada " + jornada);
    const eyebrow = document.querySelector(".eyebrow");
    if (eyebrow) eyebrow.innerHTML = eyebrow.innerHTML.replace(/APERTURA\s*\d+/i, (D.torneo || "").toUpperCase());
  }

  function pintarTodo(){
    const lista = $("lista-partidos");
    const destacado = elegirDestacado();
    if (lista)
      lista.innerHTML = deLaJornada.filter(p => p !== destacado).map(filaPartido).join("");
    pintarDestacado(destacado);
    pintarFiltros();

    /* Las zonas del diseño (línea de tiempo, estadísticas, lectura, otras
       probabilidades, combinación y recientes) viven en su propio archivo. */
    if (window.ZONAS){
      const vivo = typeof EnVivo !== "undefined" ? EnVivo.buscar(destacado) : null;
      ZONAS.pintarNav(jornada);
      ZONAS.pintarLinea(destacado, vivo);
      ZONAS.pintarStats(destacado, vivo);
      ZONAS.pintarLectura(destacado);
      ZONAS.pintarOtras(destacado);
      ZONAS.pintarCombo(deLaJornada);
      ZONAS.pintarRecientes();
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    pintarTitulo();
    pintarTodo();
    if (typeof EnVivo !== "undefined"){
      EnVivo.alActualizar(pintarTodo);   // repinta en cuanto ESPN conteste
      EnVivo.arrancar();
    }
  });
})();
