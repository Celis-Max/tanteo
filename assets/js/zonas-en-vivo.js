/* ═══════════════════════════════════════════════════════════════════════
   TANTEO · las zonas de la página "En vivo"

   Cada bloque del diseño se vuelve a dibujar con datos reales. Lo que no
   se puede sostener con datos, no se dibuja.

   UNA DECISIÓN QUE IMPORTA — "resultados recientes":
   el diseño mostraba «Modelo: Toluca 58% ✓ ACERTÓ». Eso aquí sería trampa.
   Las probabilidades de `datos.js` salen de un modelo ajustado con TODO el
   histórico, incluidos esos mismos partidos: decir que "acertó" es presumir
   de adivinar algo que ya había visto. Así que esa zona muestra el marcador
   y nada más. El acierto honesto del modelo, medido caminando en el tiempo,
   vive en el backtest y es 49%, por debajo del mercado.
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const D = typeof DATOS !== "undefined" ? DATOS : null;
  if (!D) return;

  const pct = x => Math.round(x * 100) + "%";
  const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

  /* Mercados derivados de la matriz de marcadores: todos coherentes entre sí
     porque salen de la misma tabla, que es el punto del modelo. */
  const MERCADOS = {
    "1":(a,b)=>a>b, "X":(a,b)=>a===b, "2":(a,b)=>a<b,
    "1X":(a,b)=>a>=b, "12":(a,b)=>a!==b, "X2":(a,b)=>a<=b,
    "O25":(a,b)=>a+b>2, "U25":(a,b)=>a+b<3, "O35":(a,b)=>a+b>3,
    "BTTS":(a,b)=>a>0&&b>0, "NOBTTS":(a,b)=>a===0||b===0,
  };
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
  const col = e => (ESC[e]||{}).color || "#1F5E47";
  const col2 = e => (ESC[e]||{}).color2 || "#F3EFE6";
  const fecha = f => { const d = new Date(f+"T12:00"); return `${d.getDate()} ${MESES[d.getMonth()]}`; };

  /* ── Línea de tiempo de goles ──────────────────────────────────────── */
  function pintarLinea(p, vivo){
    const z = $("zona-linea"); if (!z) return;
    const goles = (vivo && vivo.goles) || [];

    if (!goles.length){
      z.innerHTML = `<div style="text-align:center;color:#8A7A70;font-size:13px;padding:14px 0">
        ${p.jugado ? "Sin detalle de goles para este partido."
                   : "La línea de tiempo aparece cuando arranca el partido."}</div>`;
      return;
    }
    const puntos = goles.map(g => {
      const min = Math.min(95, parseInt(g.minuto, 10) || 0);
      const esLocal = vivo && g.equipoId === vivo.idLocal;
      const x = Math.max(2, Math.min(98, (min / 95) * 100));
      return `<div style="position:absolute;left:${x}%;top:0;transform:translateX(-50%);text-align:center">
        <div style="font-size:11px;font-weight:700;color:#1A1414;white-space:nowrap">${min}' ${abrev(esLocal?p.local:p.visita)}</div>
        <div style="width:13px;height:13px;border-radius:50%;margin:4px auto 0;
          background:${esLocal?col(p.local):col(p.visita)};box-shadow:0 0 0 2px #F6F1E6"></div></div>`;
    }).join("");

    z.innerHTML = `<div style="position:relative;height:46px;margin:6px 0 2px">
        <div style="position:absolute;left:0;right:0;top:26px;height:3px;background:#C9BCA8;border-radius:2px"></div>
        ${puntos}
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#8A7A70">
        <span>0'</span><span>90'</span></div>`;
  }

  /* ── Estadísticas ─────────────────────────────────────────────────── */
  function pintarStats(p, vivo){
    const z = $("zona-stats"); if (!z) return;
    const ge = p.goles_esperados || [null, null];

    const fila = (izq, rotulo, der) => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;padding:7px 0;
        border-bottom:1px dashed rgba(26,20,20,.16)">
        <span style="font-family:'Bodoni Moda',serif;font-size:19px;font-weight:700;min-width:54px">${izq}</span>
        <span style="color:#5A4C44;font-size:12px;letter-spacing:.08em;text-transform:uppercase">${rotulo}</span>
        <span style="font-family:'Bodoni Moda',serif;font-size:19px;font-weight:700;min-width:54px;text-align:right">${der}</span>
      </div>`;

    let html = "";
    if (vivo && vivo.posesion && vivo.posesion[0] != null){
      html += fila(vivo.posesion[0] + "%", "Posesión", vivo.posesion[1] + "%");
      html += fila(vivo.tiros[0] ?? "—", "Tiros", vivo.tiros[1] ?? "—");
      html += fila(vivo.aGol[0] ?? "—", "Tiros a gol", vivo.aGol[1] ?? "—");
    }
    /* xG no lo da ESPN. Lo que sí tenemos son los goles esperados del modelo,
       que es otra cosa: una predicción previa, no una medición del partido.
       Se rotula como tal para no confundirlos. */
    if (ge[0] != null)
      html += fila(ge[0].toFixed(2), "Goles esperados · modelo", ge[1].toFixed(2));

    if (!html)
      html = `<div style="text-align:center;color:#8A7A70;font-size:13px;padding:10px 0">
        Las estadísticas aparecen cuando el partido empieza.</div>`;
    z.innerHTML = html;
  }

  /* ── "¿Por qué X%?" — la lectura del modelo ───────────────────────── */
  function pintarLectura(p){
    const z = $("zona-lectura"); if (!z) return;
    const P = probs(p);
    const favorito = P["1"] >= P["2"] ? p.local : p.visita;
    const pf = Math.max(P["1"], P["2"]);
    const ge = p.goles_esperados || [0,0];
    const c = p.clima || {};
    const ctx = p.contexto || {};

    const razones = [];
    razones.push(`Goles esperados: <b>${p.local} ${ge[0].toFixed(2)}</b> contra <b>${p.visita} ${ge[1].toFixed(2)}</b>.`);
    if (ctx.local && ctx.local.forma)
      razones.push(`Forma reciente: ${p.local} <b>${ctx.local.forma}</b> · ${p.visita} <b>${(ctx.visita||{}).forma||"—"}</b>.`);
    if (c.altitud >= 2200)
      razones.push(`Altura de <b>${c.altitud} m</b>: la única pista de contexto que el backtest no descartó.`);
    else if (c.temperatura != null)
      razones.push(`Clima en ${c.estadio || "el estadio"}: <b>${Math.round(c.temperatura)}°</b>, ${c.lluvia > 0.2 ? "con lluvia" : "sin lluvia"}.`);
    razones.push(`Empate en <b>${pct(P["X"])}</b>: en Liga MX es de los mercados más probables y el que más se subestima.`);

    z.innerHTML = `
      <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#E4C877;font-weight:800">Lectura del modelo</div>
      <div style="font-family:'Great Vibes',cursive;font-size:34px;color:#F3EFE6;line-height:1.1;margin:2px 0 10px">
        ¿Por qué ${pct(pf)}?</div>
      ${razones.map(r => `<div style="display:flex;gap:9px;margin-bottom:8px;font-size:13.5px;line-height:1.5;color:#EADBD0">
        <span style="color:#E4C877">♦</span><span>${r}</span></div>`).join("")}
      <div style="margin-top:10px;padding-top:9px;border-top:1px solid rgba(243,220,146,.25);
        font-size:11.5px;color:#B99C92;line-height:1.5">
        El favorito es <b>${favorito}</b>. El modelo no le gana al mercado: esto es una lectura, no un pronóstico.</div>`;
  }

  /* ── "Otras probabilidades" ───────────────────────────────────────── */
  function pintarOtras(p){
    const z = $("zona-otras"); if (!z) return;
    const P = probs(p);
    const linea = (nombre, v) => `
      <div class="mkt"><div style="display:flex;justify-content:space-between;gap:10px">
        <span>${nombre}</span><b style="font-family:'Bodoni Moda',serif;font-size:17px">${pct(v)}</b></div></div>`;
    z.innerHTML = `
      <div style="font-family:'Bodoni Moda',serif;font-size:20px;font-weight:700;margin-bottom:4px">Otras probabilidades</div>
      <div style="font-size:12px;color:#5A4C44;letter-spacing:.06em;margin-bottom:8px">${abrev(p.local)} vs ${abrev(p.visita)}</div>
      ${linea("Ambos anotan", P["BTTS"])}
      ${linea("Más de 2.5 goles", P["O25"])}
      ${linea("Más de 3.5 goles", P["O35"])}
      ${linea(`${p.local} o empate`, P["1X"])}
      ${linea(`${p.visita} o empate`, P["X2"])}
      <div style="font-size:11px;color:#8A7A70;margin-top:8px;line-height:1.5">
        Todas salen de la misma tabla de marcadores, así que son coherentes entre sí.</div>`;
  }

  /* ── "Tu combinación": el parlay más probable de la jornada ───────── */
  function pintarCombo(partidos){
    const z = $("zona-combo"); if (!z) return;
    const caja = z.parentElement || z;

    /* Una apuesta por partido, nunca dos del mismo: combinarlas multiplicando
       sería el error que cobra la casa. */
    const cands = partidos.filter(p => !p.jugado).map(p => {
      const P = probs(p);
      const mejor = Object.entries(P)
        .filter(([k,v]) => v >= .45 && v <= .95)
        .sort((a,b) => b[1]-a[1])[0];
      return mejor ? { p, k: mejor[0], v: mejor[1] } : null;
    }).filter(Boolean).sort((a,b) => b.v - a.v).slice(0, 2);

    if (cands.length < 2){
      caja.innerHTML = `<div style="padding:14px;color:#8A7A70;font-size:13px">
        No hay suficientes partidos por jugar para armar una combinación.</div>`;
      return;
    }
    const NOMBRES = { "1":"gana", "2":"gana", "X":"empate", "1X":"o empate", "X2":"o empate",
                      "12":"no hay empate", "O25":"más de 2.5 goles", "O35":"más de 3.5 goles",
                      "BTTS":"ambos anotan", "U25":"menos de 2.5", "NOBTTS":"no ambos anotan" };
    const juntas = cands.reduce((a,c) => a * c.v, 1);

    caja.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:8px">
        <span style="font-family:'Great Vibes',cursive;font-size:30px;color:#C1121F">Tu combinación</span>
        <span style="font-size:11px;letter-spacing:.1em;color:#5A4C44">${cands.length} PRONÓSTICOS</span>
      </div>
      ${cands.map(c => `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid rgba(26,20,20,.14)">
          ${escudo(c.p.local, "s")}
          <div style="flex-grow:1;min-width:0">
            <div style="font-weight:700;font-size:14px">${c.k==="1"?c.p.local:c.k==="2"?c.p.visita:c.p.local} ${NOMBRES[c.k]||c.k}</div>
            <div style="font-size:12px;color:#5A4C44">vs ${c.p.visita} · ${fecha(c.p.fecha)}</div>
          </div>
          <b style="font-family:'Bodoni Moda',serif;font-size:18px">${pct(c.v)}</b>
        </div>`).join("")}
      <div style="margin-top:10px;padding-top:9px;border-top:1px solid rgba(26,20,20,.14);font-size:12.5px">
        Las dos juntas: <b style="font-family:'Bodoni Moda',serif;font-size:17px">${pct(juntas)}</b>
        <div style="color:#8A7A70;font-size:11.5px;margin-top:4px;line-height:1.5">
          Combinar multiplica el margen de la casa. Con dos piernas el backtest da −1.6% de rendimiento.</div>
      </div>`;
  }

  /* ── Resultados recientes ─────────────────────────────────────────── */
  function pintarRecientes(){
    const z = $("zona-recientes"); if (!z) return;
    const ult = D.partidos.filter(p => p.jugado && p.gl != null)
      .slice(-3).reverse();
    z.innerHTML = ult.map(p => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px dashed rgba(26,20,20,.16)">
        ${escudo(p.local, "s")}
        <div style="flex-grow:1;min-width:0">
          <div style="font-weight:700;font-size:14px">${p.local} ${p.gl}–${p.gv} ${p.visita}</div>
          <div style="font-size:12px;color:#5A4C44">${fecha(p.fecha)} · J${p.jornada}</div>
        </div>
      </div>`).join("") + `
      <div style="font-size:11px;color:#8A7A70;margin-top:8px;line-height:1.5">
        Solo el marcador. No se muestra si el modelo "acertó": sus probabilidades
        se calculan con un ajuste que ya vio estos partidos, y presumir de eso
        sería trampa. El acierto real, medido caminando en el tiempo, es 49%.</div>`;
  }

  /* ── Navegador de jornada ─────────────────────────────────────────── */
  function pintarNav(jornada){
    const n = $("nav-jornada");
    if (n) n.textContent = "Jornada " + jornada;
  }

  window.ZONAS = { pintarLinea, pintarStats, pintarLectura, pintarOtras,
                   pintarCombo, pintarRecientes, pintarNav };
})();
