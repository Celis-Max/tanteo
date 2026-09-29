/* ═══════════════════════════════════════════════════════════════════════
   TANTEO · competiciones internacionales

   Pinta lo que trae ligas.js. La cifra grande es SIEMPRE la del mercado sin
   margen; el modelo, cuando existe, va debajo y en pequeño. No es estética:
   la validación sobre 16,361 partidos dice que el modelo pierde contra las
   casas en las cinco grandes, así que darle el sitio de honor sería vender
   algo que no se sostiene.
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";
  if (typeof LIGAS === "undefined") return;

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pct = v => (v * 100).toFixed(0) + "%";

  /* «sáb 11 oct». Las horas vienen en UTC desde la API; el navegador las
     pasa a la hora de quien mira, que es lo que quiere saber. */
  function dia(f) {
    const d = new Date(f + "T12:00:00");
    if (isNaN(d)) return f;
    return d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  }

  let actual = LIGAS.orden[0];

  function pintarCinta() {
    $("cinta-comp").innerHTML = LIGAS.orden.map(c => {
      const x = LIGAS.competiciones[c];
      return `<button class="comp-pill ${c === actual ? "on" : ""}" data-c="${c}">
        ${esc(x.nombre)}<small>${x.partidos.length}</small></button>`;
    }).join("");
    document.querySelectorAll(".comp-pill").forEach(b => {
      b.onclick = () => { actual = b.dataset.c; pintarCinta(); pintarPartidos(); };
    });
  }

  function duelo(p, conModelo) {
    const m = p.mercado;
    const c = p.cuotas;
    // El contraste con el modelo solo cuando de verdad lo hay: inventar un
    // número para rellenar el hueco sería peor que dejarlo vacío.
    const contraste = p.modelo
      ? `<div class="contraste">Modelo: <b>${pct(p.modelo["1"])}</b> · ${pct(p.modelo["X"])} · <b>${pct(p.modelo["2"])}</b></div>`
      : (conModelo ? `<div class="contraste" style="opacity:.6">Modelo: sin datos de estos equipos</div>` : "");

    return `<article class="duelo-liga">
      <div class="duelo-hora">${esc(p.hora)}<small>HRS</small></div>
      <div class="duelo-equipos">
        <b>${esc(p.local)} <span class="duelo-vs">vs</span> ${esc(p.visita)}</b>
        <div class="barra-merc">
          <i class="l" style="width:${m["1"] * 100}%"></i>
          <i class="e" style="width:${m["X"] * 100}%"></i>
          <i class="v" style="width:${m["2"] * 100}%"></i>
        </div>
        <div class="cifras-merc">
          <span>Local <b>${pct(m["1"])}</b></span>
          <span>Empate <b>${pct(m["X"])}</b></span>
          <span>Visita <b>${pct(m["2"])}</b></span>
        </div>
      </div>
      <div class="duelo-lado">
        <div class="cuota-trio">
          <span>${c.avg_1 ?? "–"}</span><span>${c.avg_X ?? "–"}</span><span>${c.avg_2 ?? "–"}</span>
        </div>
        <div class="duelo-meta">${p.casas} casas · margen ${p.margen}%</div>
        ${contraste}
      </div>
    </article>`;
  }

  function pintarPartidos() {
    const x = LIGAS.competiciones[actual];
    const cont = $("lista-partidos-liga");
    if (!x || !x.partidos.length) {
      cont.innerHTML = `<div class="aviso-modelo">Todavía no hay partidos con cuotas publicadas
        en ${esc(x ? x.nombre : "esta competición")}.</div>`;
      return;
    }

    const aviso = x.con_modelo
      ? `<div class="aviso-modelo">Las cifras grandes son <b>la probabilidad del mercado sin su
         margen</b>. El modelo aparece debajo como contraste: medido sobre 16,361 partidos,
         <b>no le gana a las casas</b> en esta liga.</div>`
      : `<div class="aviso-modelo">En ${esc(x.nombre)} solo se publica <b>la línea del mercado
         sin margen</b>: no hay histórico de esta competición para ajustar un modelo, y preferimos
         decirlo antes que inventar un número.</div>`;

    // Agrupado por día, que es como se mira un calendario.
    const dias = {};
    x.partidos.forEach(p => (dias[p.fecha] = dias[p.fecha] || []).push(p));

    cont.innerHTML = aviso + Object.keys(dias).sort().map(f =>
      `<div class="jornada-dia">${esc(dia(f))}</div>` +
      dias[f].map(p => duelo(p, x.con_modelo)).join("")
    ).join("");
  }

  $("nota-ligas").textContent = LIGAS.nota;
  $("sello-ligas").textContent =
    `${LIGAS.total} partidos · ${LIGAS.orden.length} competiciones · actualizado ${LIGAS.generado}`;
  pintarCinta();
  pintarPartidos();
})();
