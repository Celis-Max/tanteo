/* ═══════════════════════════════════════════════════════════════════════
   TANTEO · portada

   Seis zonas, todas con datos reales:
     ticker · eyebrow · partido destacado · accesos · tres en vivo · tabla

   Igual que en "En vivo": lo que no se puede sostener con datos, no se
   dibuja. El ticker no inventa minutos y la tabla sale de `datos.js`.
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const D = typeof DATOS !== "undefined" ? DATOS : null;
  if (!D) return;

  const pct = x => Math.round(x * 100) + "%";
  const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  const fecha = f => { const d = new Date(f + "T12:00"); return `${d.getDate()} ${MESES[d.getMonth()]}`; };

  const MERCADOS = { "1":(a,b)=>a>b, "X":(a,b)=>a===b, "2":(a,b)=>a<b };
  function probs(p){
    const M = p.matriz_ajustada || p.matriz;
    if (!M) return p.probabilidades || {};
    const r = {};
    for (const k in MERCADOS){
      let s = 0;
      for (let a=0;a<M.length;a++) for (let b=0;b<M[a].length;b++)
        if (MERCADOS[k](a,b)) s += M[a][b];
      r[k] = s;
    }
    return r;
  }

  const ABR = {
    "Club America":"AME","Atlante":"ATE","Atlas":"ATL","Atl. San Luis":"SLU",
    "Cruz Azul":"CAZ","Juarez":"JUA","Guadalajara Chivas":"GDL","Club Leon":"LEO",
    "Monterrey":"MTY","Necaxa":"NEC","Pachuca":"PAC","Puebla":"PUE",
    "UNAM Pumas":"PUM","Queretaro":"QRO","Santos Laguna":"SAN","Tigres UANL":"TIG",
    "Club Tijuana":"TIJ","Toluca":"TOL","Mazatlan FC":"MAZ",
  };
  const abrev = e => ABR[e] || (e||"").replace(/[^A-Za-zÁÉÍÓÚÑ]/g,"").slice(0,3).toUpperCase();
  const ESC = D.escudos || {};
  const col  = e => (ESC[e]||{}).color  || "#1F5E47";
  const col2 = e => (ESC[e]||{}).color2 || "#F3EFE6";

  function climaDe(p){
    const c = p.clima;
    if (!c || c.temperatura == null) return "";
    return `${Math.round(c.temperatura)}°${c.lluvia > 0.2 ? " Lluvia" : ""}`;
  }

  /* Jornada en curso: la que más partidos tiene en la semana próxima.
     (Los datos traen jornadas encimadas, ver pagina-en-vivo.js) */
  const pend = D.partidos.filter(p => !p.jugado && typeof p.jornada === "number")
                         .sort((a,b) => a.fecha.localeCompare(b.fecha));
  const jornada = (() => {
    if (!pend.length) return Math.max(...D.partidos.filter(p=>typeof p.jornada==="number").map(p=>p.jornada));
    const hasta = new Date(new Date(pend[0].fecha+"T12:00").getTime() + 7*864e5).toISOString().slice(0,10);
    const c = {};
    pend.filter(p => p.fecha <= hasta).forEach(p => { c[p.jornada] = (c[p.jornada]||0)+1; });
    return +Object.entries(c).sort((a,b) => b[1]-a[1] || a[0]-b[0])[0][0];
  })();
  const deLaJornada = D.partidos.filter(p => p.jornada === jornada);

  const vivoDe = p => (typeof EnVivo !== "undefined" ? EnVivo.buscar(p) : null);

  /* ── Ticker ───────────────────────────────────────────────────────── */
  /* Encabezados con la jornada escrita a mano en el diseño. */
  function pintarRotulos(){
    document.querySelectorAll("*").forEach(el => {
      if (el.children.length) return;
      const t = el.textContent;
      if (t && /JORNADA\s*10/i.test(t) && t.length < 40)
        el.textContent = t.replace(/JORNADA\s*10/i, "JORNADA " + jornada);
    });
  }

  function pintarTicker(){
    const z = $("zona-ticker"); if (!z) return;
    const items = deLaJornada.map(p => {
      const v = vivoDe(p);
      let marcador, estado;
      if (v && v.enJuego){ marcador = `${v.gl}–${v.gv}`; estado = `<span style="color:#FF6B72">${v.minuto||""}</span>`; }
      else if (p.jugado){ marcador = `${p.gl}–${p.gv}`; estado = `<span style="color:#A9C2B6">Final</span>`; }
      else { marcador = "–"; estado = `<span style="color:#A9C2B6">${p.hora || fecha(p.fecha)}</span>`; }
      return `<span style="white-space:nowrap"><b>${abrev(p.local)}</b> ${marcador} <b>${abrev(p.visita)}</b> ${estado}</span>`;
    });
    z.innerHTML = `<span style="color:#FF6B72;letter-spacing:.14em;font-weight:800;white-space:nowrap">
        <span class="live" style="background:#C1121F"></span> LIGA MX · J${jornada}</span>`
      + items.map(x => `<span style="color:#9C7A33">♦</span>${x}`).join("");
  }

  /* ── Eyebrow del hero ─────────────────────────────────────────────── */
  function pintarEyebrow(){
    const z = $("zona-eyebrow"); if (!z) return;
    z.textContent = `Liga MX · ${D.torneo} · Jornada ${jornada}`;
  }

  /* ── Partido destacado (tarjetita del hero) ───────────────────────── */
  function elegir(){
    const jugando = deLaJornada.find(p => { const v = vivoDe(p); return v && v.enJuego; });
    return jugando || deLaJornada.find(p => !p.jugado) || deLaJornada[0];
  }

  /* El hero traía, en el diseño original, el arte de Tanteo de fondo con la
     tarjeta del partido encima. Al pintar aquí con innerHTML se borraba todo
     el contenedor y el arte desaparecía: solo se alcanzaba a ver en el
     parpadeo de la recarga, antes de que este código corriera.

     Ahora la tarjeta vive en su propio hueco dentro de la zona, y lo demás
     —el arte y el as quemado— se queda donde estaba. */
  function huecoDestacado(z){
    let h = z.querySelector("#tarjeta-destacada");
    if (h) return h;
    h = document.createElement("div");
    h.id = "tarjeta-destacada";
    h.style.cssText = "position:absolute;left:-40px;bottom:0;width:350px;z-index:2";
    /* Se retira la tarjeta de ejemplo de la plantilla, que ocupaba este
       mismo sitio; el arte y el as se conservan. */
    const ejemplo = z.querySelector(".paper.card");
    if (ejemplo) ejemplo.remove();
    z.appendChild(h);
    return h;
  }

  function pintarDestacado(){
    const z = $("zona-destacado"); if (!z) return;
    const p = elegir(); if (!p) return;
    const P = probs(p), v = vivoDe(p);
    const gl = v && v.gl != null ? v.gl : (p.jugado ? p.gl : "–");
    const gv = v && v.gv != null ? v.gv : (p.jugado ? p.gv : "–");
    const nota = v && v.enJuego ? v.minuto : (p.jugado ? "Final" : (p.hora || fecha(p.fecha)));
    const barra = (w, c) => `<i style="width:${w}%;background:${c}"></i>`;

    /* Se vuelve a poner la envoltura .paper.card: el id quedó en el contenedor
       de afuera, así que al reemplazar su contenido se perdía la carta y el
       texto quedaba rojo sobre el fieltro, ilegible. */
    huecoDestacado(z).innerHTML = `
      <div class="paper card" style="padding:20px 22px;display:flex;flex-direction:column;gap:4px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
        <span style="font-family:'Great Vibes',cursive;font-size:26px;color:#C1121F">${p.local} vs ${p.visita}</span>
        <span style="font-size:12px;color:#5A4C44;white-space:nowrap">${nota}</span>
      </div>
      <div style="display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;margin:10px 0 8px">
        ${escudo(p.local, "", "width:46px;height:52px;font-size:13px")}
        <span style="font-family:'Bodoni Moda',serif;font-size:36px;font-weight:700;text-align:center">
          ${gl} <span style="color:#C1121F;font-size:20px">·</span> ${gv}</span>
        ${escudo(p.visita, "", "width:46px;height:52px;font-size:13px")}
      </div>
      <div class="barra" style="display:flex;height:8px;border-radius:999px;overflow:hidden;background:#E2D6C6">
        ${barra(P["1"]*100, col(p.local))}${barra(P["X"]*100, "#1A1414")}${barra(P["2"]*100, col(p.visita))}
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:6px">
        <span style="color:${col(p.local)}"><b>${p.local} ${pct(P["1"])}</b></span>
        <span style="color:#5A4C44">Empate ${pct(P["X"])}</span>
        <span style="color:${col(p.visita)}"><b>${p.visita} ${pct(P["2"])}</b></span>
      </div></div>`;
  }

  /* ── Accesos ("Mesa principal") ───────────────────────────────────── */
  function pintarAccesos(){
    const z = $("zona-accesos"); if (!z) return;
    const enJuego = deLaJornada.filter(p => { const v = vivoDe(p); return v && v.enJuego; }).length;
    const porJugar = deLaJornada.filter(p => !p.jugado).length;
    const S = D.simulador || {}, T = S.totales || {};

    const tarjeta = (rotulo, titulo, texto, href) => `
      <a href="${href}" class="paper card" style="text-decoration:none;color:#1A1414;padding:22px 24px;
        display:flex;flex-direction:column;gap:7px;min-width:0">
        <span style="font-size:10.5px;letter-spacing:.18em;color:#9C7A33;font-weight:800">${rotulo}</span>
        <b style="font-family:'Bodoni Moda',serif;font-size:24px">${titulo}</b>
        <span style="font-size:13.5px;color:#5A4C44;line-height:1.5">${texto}</span>
        <span style="margin-top:auto;padding-top:10px;color:#C1121F;font-weight:700;font-size:13px">Entrar →</span>
      </a>`;

    /* La zona es una celda de la rejilla del diseño: sin esto, las cuatro
       tarjetas se apilaban dentro de una columna angosta. */
    z.style.gridColumn = "1 / -1";
    z.style.display = "block";
    z.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px">
        ${tarjeta(enJuego ? `${enJuego} EN JUEGO` : `${porJugar} POR JUGAR`, "En vivo",
                  "Marcadores y cómo cambia la probabilidad durante el partido.", "en-vivo.html")}
        ${tarjeta("COMBINACIONES", "Parlays más probables",
                  "Las combinaciones con mejor probabilidad de la jornada.", "parlays.html")}
        ${tarjeta(T.pendientes ? `${T.pendientes} EN JUEGO` : "ARMA LA TUYA", "Simulador",
                  "Cada jornada el sistema aparta $100 virtuales y guarda el ticket.", "simulador.html")}
        ${tarjeta("LIGA MX", "Tabla general",
                  `Puntos y posiciones del ${D.torneo}.`, "#zona-tabla")}
      </div>`;
  }

  /* ── Tres partidos de la jornada ──────────────────────────────────── */
  function pintarTresVivos(){
    const z = $("zona-tresvivos"); if (!z) return;
    const destacado = elegir();
    const tres = deLaJornada.filter(p => p !== destacado).slice(0, 3);

    z.innerHTML = tres.map(p => {
      const P = probs(p), v = vivoDe(p);
      const gl = v && v.gl != null ? v.gl : (p.jugado ? p.gl : "–");
      const gv = v && v.gv != null ? v.gv : (p.jugado ? p.gv : "–");
      const estado = v && v.enJuego ? `<span style="color:#C1121F;font-weight:700">${v.minuto||""}</span>`
                   : (p.jugado ? "Final" : (p.hora || fecha(p.fecha)));
      /* Los partidos ya jugados no guardan la matriz de marcadores, así que
         no hay probabilidad que mostrar: salía NaN%. Mejor no dibujar nada. */
      const hayProb = Number.isFinite(P["1"]) && Number.isFinite(P["X"]) && Number.isFinite(P["2"]);
      const ficha = (a, val, c) => `<span class="chip pr sm" style="--c:${c}"><small>${a}</small><b>${pct(val)}</b></span>`;
      const lado = (e, g) => `
        <div style="display:flex;align-items:center;gap:10px">
          ${escudo(e, "s")}
          <span style="font-weight:700;flex-grow:1;min-width:0">${e}</span>
          <span style="font-family:'Bodoni Moda',serif;font-size:26px;font-weight:700">${g}</span>
        </div>`;
      return `<div class="paper card" style="padding:18px 20px;display:flex;flex-direction:column;gap:10px">
        <div class="mh" style="display:flex;justify-content:space-between;gap:10px;font-size:11.5px">
          <span>${(p.sede || p.ciudad || "").toUpperCase()}</span>
          <span>${climaDe(p)} · ${estado}</span></div>
        ${lado(p.local, gl)}${lado(p.visita, gv)}
        ${hayProb ? `<div style="display:flex;gap:7px;justify-content:center;margin-top:2px">
          ${ficha(abrev(p.local), P["1"], col(p.local))}
          ${ficha("EMP", P["X"], "#1A1414")}
          ${ficha(abrev(p.visita), P["2"], col(p.visita))}
        </div>` : ""}</div>`;
    }).join("");
  }

  /* ── Tabla general ────────────────────────────────────────────────── */
  function pintarTabla(){
    const z = $("zona-tabla"); if (!z) return;
    const filas = (D.tabla || []).map((r, i) => `
      <tr>
        <td style="text-align:left;color:#8A7A70">${i+1}</td>
        <td style="text-align:left">
          ${escudo(r.equipo, "s", "display:inline-block;vertical-align:middle;margin-right:7px")}${r.equipo}</td>
        <td>${r.jj}</td><td>${r.dif > 0 ? "+" : ""}${r.dif}</td>
        <td><b>${r.pts}</b></td>
      </tr>`).join("");

    z.innerHTML = `
      <div style="font-family:'Great Vibes',cursive;font-size:32px;color:#C1121F;margin-bottom:2px">Hoja de tanteo</div>
      <div style="font-size:10.5px;letter-spacing:.2em;color:#9C7A33;font-weight:800;margin-bottom:10px">TABLA GENERAL</div>
      <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13.5px">
        <tr style="font-size:10px;letter-spacing:.14em;color:#9C7A33;text-transform:uppercase">
          <th style="text-align:left;padding:6px 7px">#</th>
          <th style="text-align:left;padding:6px 7px">Club</th>
          <th style="padding:6px 7px">PJ</th><th style="padding:6px 7px">DG</th><th style="padding:6px 7px">Pts</th>
        </tr>${filas}
      </table></div>
      <div style="font-size:11px;color:#8A7A70;margin-top:9px;line-height:1.5">
        ${D.jugados} de ${D.total} partidos jugados · actualizado ${D.generado}</div>`;
  }

  /* La ficha decorativa mostraba el porcentaje del diseño. Se le pone el
     del mejor parlay real de la jornada, que es lo que anuncia. */
  function pintarFichaParlay(){
    const f = $("ficha-parlay"); if (!f) return;
    const dosMejores = deLaJornada.filter(p => !p.jugado).map(p => {
      const P = probs(p);
      const v = Math.max(P["1"]||0, P["X"]||0, P["2"]||0);
      return Number.isFinite(v) ? v : null;
    }).filter(Boolean).sort((a,b) => b-a).slice(0, 3);
    if (dosMejores.length < 3){ f.style.display = "none"; return; }
    const valor = (dosMejores.reduce((a,v) => a*v, 1) * 100).toFixed(1) + "%";
    f.textContent = valor;
    const g = $("cifra-parlay");        // el mismo número, en grande, más abajo
    if (g) g.textContent = valor;
  }

  function pintarTodo(){
    pintarRotulos();
    pintarTicker(); pintarEyebrow(); pintarDestacado();
    pintarAccesos(); pintarTresVivos(); pintarTabla(); pintarFichaParlay();
  }

  document.addEventListener("DOMContentLoaded", () => {
    pintarTodo();
    if (typeof EnVivo !== "undefined"){
      EnVivo.alActualizar(pintarTodo);
      EnVivo.arrancar();
    }
  });
})();
