/* ═══════════════════════════════════════════════════════════════════════
   TANTEO · parlays más probables

   Genera todas las combinaciones de la jornada y muestra las mejores.

   DOS REGLAS QUE NO SE NEGOCIAN:
   · Una apuesta por partido, nunca dos del mismo. Dos piernas del mismo
     partido están correlacionadas y multiplicarlas como si fueran
     independientes es el error que cobra la casa.
   · Todo sale de la misma matriz de marcadores, así que los mercados son
     coherentes entre sí.

   Y un recordatorio que va en pantalla: combinar multiplica el margen.
   El backtest con cuotas reales da −1.6% con dos piernas, −2.8% con tres
   y −6.9% con cuatro. Que sea "el más probable" no lo hace rentable.
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const D = typeof DATOS !== "undefined" ? DATOS : null;
  if (!D) return;

  const pct = x => (x * 100).toFixed(1) + "%";
  const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  const fecha = (f,h) => { const d = new Date(f+"T12:00"); return `${d.getDate()} ${MESES[d.getMonth()]}${h?" · "+h:""}`; };

  const MERCADOS = {
    "1":  { n:"gana",              f:(a,b)=>a>b,        lado:"local" },
    "X":  { n:"empate",            f:(a,b)=>a===b,      lado:"" },
    "2":  { n:"gana",              f:(a,b)=>a<b,        lado:"visita" },
    "1X": { n:"gana o empata",     f:(a,b)=>a>=b,       lado:"local" },
    "X2": { n:"gana o empata",     f:(a,b)=>a<=b,       lado:"visita" },
    "12": { n:"no hay empate",     f:(a,b)=>a!==b,      lado:"" },
    "O15":{ n:"más de 1.5 goles",  f:(a,b)=>a+b>1,      lado:"", goles:true },
    "U15":{ n:"menos de 1.5",      f:(a,b)=>a+b<2,      lado:"", goles:true },
    "O25":{ n:"más de 2.5 goles",  f:(a,b)=>a+b>2,      lado:"", goles:true },
    "U25":{ n:"menos de 2.5",      f:(a,b)=>a+b<3,      lado:"", goles:true },
    "O35":{ n:"más de 3.5 goles",  f:(a,b)=>a+b>3,      lado:"", goles:true },
    "U35":{ n:"menos de 3.5",      f:(a,b)=>a+b<4,      lado:"", goles:true },
    "BTTS":{ n:"ambos anotan",     f:(a,b)=>a>0&&b>0,   lado:"", goles:true },
    "NOBTTS":{ n:"no ambos anotan",f:(a,b)=>a===0||b===0, lado:"", goles:true },
  };

  function probs(p){
    const M = p.matriz_ajustada || p.matriz;
    if (!M) return null;
    const r = {};
    for (const k in MERCADOS){
      let s = 0;
      for (let a=0;a<M.length;a++) for (let b=0;b<M[a].length;b++)
        if (MERCADOS[k].f(a,b)) s += M[a][b];
      r[k] = s;
    }
    return r;
  }

  const ESC = D.escudos || {};
  const col  = e => (ESC[e]||{}).color  || "#1F5E47";
  const col2 = e => (ESC[e]||{}).color2 || "#F3EFE6";
  const ABR = {
    "Club America":"AME","Atlante":"ATE","Atlas":"ATL","Atl. San Luis":"SLU",
    "Cruz Azul":"CAZ","Juarez":"JUA","Guadalajara Chivas":"GDL","Club Leon":"LEO",
    "Monterrey":"MTY","Necaxa":"NEC","Pachuca":"PAC","Puebla":"PUE",
    "UNAM Pumas":"PUM","Queretaro":"QRO","Santos Laguna":"SAN","Tigres UANL":"TIG",
    "Club Tijuana":"TIJ","Toluca":"TOL","Mazatlan FC":"MAZ",
  };
  const abrev = e => ABR[e] || (e||"").replace(/[^A-Za-zÁÉÍÓÚÑ]/g,"").slice(0,3).toUpperCase();

  function nombra(p, k){
    const m = MERCADOS[k];
    const quien = m.lado === "local" ? p.local : m.lado === "visita" ? p.visita : "";
    return quien ? `${quien} ${m.n}` : `${abrev(p.local)}–${abrev(p.visita)}: ${m.n}`;
  }

  /* Jornada en curso (misma regla que el resto del sitio). */
  const pend = D.partidos.filter(p => !p.jugado && typeof p.jornada === "number")
                         .sort((a,b) => a.fecha.localeCompare(b.fecha));
  const jornada = pend.length ? (() => {
    const hasta = new Date(new Date(pend[0].fecha+"T12:00").getTime()+7*864e5).toISOString().slice(0,10);
    const c = {};
    pend.filter(p => p.fecha <= hasta).forEach(p => { c[p.jornada] = (c[p.jornada]||0)+1; });
    return +Object.entries(c).sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0][0];
  })() : null;

  /* Candidatos: por partido, las mejores apuestas dentro de un rango sensato.
     Menos de 45% no aporta a una combinación; más de 95% es ruido. */
  const candidatos = D.partidos
    .filter(p => !p.jugado && p.jornada === jornada)
    .map(p => {
      const P = probs(p);
      if (!P) return null;
      const ops = Object.keys(MERCADOS)
        .map(k => ({ k, v: P[k], goles: !!MERCADOS[k].goles, local: MERCADOS[k].lado === "local" }))
        .filter(o => o.v >= .45 && o.v <= .95)
        .sort((a,b) => b.v - a.v);
      return ops.length ? { p, ops } : null;
    }).filter(Boolean);

  /* Mejor combinación de n piernas, con un filtro opcional de tipo. */
  function mejor(n, filtro){
    const lista = candidatos
      .map(c => {
        const ops = filtro ? c.ops.filter(filtro) : c.ops;
        return ops.length ? { p: c.p, o: ops[0] } : null;
      })
      .filter(Boolean)
      .sort((a,b) => b.o.v - a.o.v)
      .slice(0, n);
    if (lista.length < n) return null;
    const prob = lista.reduce((a,x) => a * x.o.v, 1);
    const esperados = lista.reduce((a,x) => a + x.o.v, 0);
    return { piernas: lista, prob, esperados };
  }

  function pierna(x){
    const { p, o } = x;
    return `<div style="display:flex;align-items:center;gap:11px;padding:10px 0;
        border-top:1px solid rgba(26,20,20,.14)">
      <span class="crest s" style="background:linear-gradient(135deg, ${col(p.local)} 50%, ${col2(p.local)} 50%)"></span>
      <div style="flex-grow:1;min-width:0">
        <div style="font-weight:700;font-size:14.5px">${nombra(p, o.k)}</div>
        <div style="font-size:12px;color:#5A4C44">${p.local} vs ${p.visita} · ${fecha(p.fecha, p.hora)}</div>
      </div>
      <b style="font-family:'Bodoni Moda',serif;font-size:19px">${Math.round(o.v*100)}%</b>
    </div>`;
  }

  function pintarEyebrow(){
    const z = $("zona-eyebrow");
    if (z) z.textContent = jornada ? `Liga MX · Jornada ${jornada}` : "Liga MX";
  }

  function pintarMejor(){
    const z = $("zona-mejor"); if (!z) return;
    const m = mejor(4);
    if (!m){
      z.innerHTML = `<div class="paper card" style="padding:22px">
        <b style="font-family:'Bodoni Moda',serif;font-size:22px">Sin combinación disponible</b>
        <div style="color:#5A4C44;font-size:13.5px;margin-top:6px">
          Hacen falta al menos 4 partidos por jugar en la jornada.</div></div>`;
      return;
    }
    z.innerHTML = `<div class="paper card" style="padding:26px 28px">
      <div style="font-size:10.5px;letter-spacing:.18em;color:#9C7A33;font-weight:800">
        LIGA MX · ${m.piernas.length} PRONÓSTICOS</div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin:4px 0 10px">
        <b style="font-family:'Bodoni Moda',serif;font-size:30px">El más probable</b>
        <div style="text-align:right">
          <div style="font-size:10px;letter-spacing:.16em;color:#9C7A33;font-weight:800">PROBABILIDAD</div>
          <div style="font-family:'Bodoni Moda',serif;font-size:32px;font-weight:700;line-height:1">${pct(m.prob)}</div>
          <div style="font-size:12px;color:#5A4C44">1 en ${(1/m.prob).toFixed(1)}</div>
        </div>
      </div>
      ${m.piernas.map(pierna).join("")}
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;
        margin-top:12px;padding-top:11px;border-top:1px solid rgba(26,20,20,.14);font-size:13px">
        <span>Aciertos esperados <b>${m.esperados.toFixed(1)} de ${m.piernas.length}</b></span>
        <a href="simulador.html" style="color:#C1121F;font-weight:700;text-decoration:none">Abrir en el simulador →</a>
      </div>
      <div style="margin-top:10px;font-size:11.5px;color:#8A7A70;line-height:1.55">
        Que sea el más probable no lo hace rentable: combinar multiplica el margen de la casa.
        Con cuotas reales, el backtest da <b>−6.9%</b> en parlays de cuatro piernas.</div>
    </div>`;
    /* La ficha decorativa traía el porcentaje del diseño y contradecía
       al de la tarjeta. */
    const f = $("ficha-prob");
    if (f) f.textContent = pct(m.prob);
  }

  function pintarTemas(){
    const z = $("zona-temas"); if (!z) return;
    const temas = [
      { rotulo:"GOLES",    titulo:"Jornada con goles", filtro:o => o.goles },
      { rotulo:"LOCALÍA",  titulo:"Pesa la casa",      filtro:o => o.local },
      { rotulo:"SEGURAS",  titulo:"Las más probables", filtro:null },
    ];
    const tarjetas = temas.map(t => {
      const m = mejor(3, t.filtro);
      if (!m) return "";
      return `<div class="paper card" style="padding:20px 22px;display:flex;flex-direction:column;gap:2px">
        <div style="font-size:10px;letter-spacing:.18em;color:#9C7A33;font-weight:800">${t.rotulo}</div>
        <b style="font-family:'Bodoni Moda',serif;font-size:22px;margin-bottom:4px">${t.titulo}</b>
        ${m.piernas.map(pierna).join("")}
        <div style="display:flex;justify-content:space-between;gap:10px;margin-top:10px;
          padding-top:10px;border-top:1px solid rgba(26,20,20,.14)">
          <span style="font-size:12px;color:#5A4C44">1 en ${(1/m.prob).toFixed(1)} · esperados ${m.esperados.toFixed(1)} de 3</span>
          <b style="font-family:'Bodoni Moda',serif;font-size:20px">${pct(m.prob)}</b>
        </div></div>`;
    }).filter(Boolean).join("");

    z.innerHTML = tarjetas
      ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px">${tarjetas}</div>`
      : `<div class="paper card" style="padding:20px;color:#5A4C44">
           No hay partidos suficientes por jugar para armar combinaciones.</div>`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    pintarEyebrow(); pintarMejor(); pintarTemas();
  });
})();
