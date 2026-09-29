/* ═══════════════════════════════════════════════════════════════════════
   TANTEO · marcadores en vivo

   `datos.js` es una foto que genera `actualizar.sh` una vez al día: sabe
   qué se jugó, no qué está pasando ahora. Este módulo pide a ESPN el
   marcador en curso y el minuto, y los mezcla encima de esa foto.

   Se puede llamar directo desde el navegador porque ESPN responde con
   `access-control-allow-origin: *` (verificado). No hace falta proxy.

   Si ESPN no contesta, la página no se rompe: se queda con lo que traía
   `datos.js` y avisa que el vivo está caído. Nunca inventa un minuto.
   ═══════════════════════════════════════════════════════════════════════ */

const EnVivo = (() => {
  "use strict";

  const API = "https://site.api.espn.com/apis/site/v2/sports/soccer/mex.1/scoreboard";
  const CADA = 60000;          // un sondeo por minuto: el marcador no cambia más rápido

  let reloj = null, suscriptores = [], ultimo = { partidos: [], error: null, cuando: null };

  /* ESPN escribe los nombres a su manera ("Guadalajara", "Tigres UANL") y
     nuestros datos vienen de otra fuente ("Guadalajara Chivas"). Se comparan
     normalizados y por coincidencia parcial, que para 18 equipos basta. */
  const normal = s => (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\b(fc|cf|club|deportivo|de|the)\b/g, "")
    .replace(/[^a-z0-9]/g, "");

  function mismoEquipo(a, b){
    const x = normal(a), y = normal(b);
    if (!x || !y) return false;
    return x === y || x.includes(y) || y.includes(x);
  }

  function traducir(evento){
    const c = (evento.competitions || [])[0];
    if (!c) return null;
    const local   = (c.competitors || []).find(t => t.homeAway === "home");
    const visita  = (c.competitors || []).find(t => t.homeAway === "away");
    if (!local || !visita) return null;

    const st = c.status || {};
    const tipo = (st.type || {}).name || "";
    const enJuego  = tipo === "STATUS_IN_PROGRESS" || tipo === "STATUS_HALFTIME";
    const terminado = tipo === "STATUS_FINAL" || tipo === "STATUS_FULL_TIME";

    /* ESPN publica estadísticas reales del partido: posesión, tiros y tiros a
       gol. No trae xG; para eso usamos los goles esperados de nuestro modelo,
       que es otra cosa y se rotula como tal. */
    const stats = t => Object.fromEntries(
      (t.statistics || []).map(x => [x.name, x.displayValue]));
    const sl = stats(local), sv = stats(visita);

    /* La línea de tiempo: solo los goles, con su minuto real. */
    const goles = (c.details || [])
      .filter(d => d.scoringPlay)
      .map(d => ({
        minuto: ((d.clock || {}).displayValue || "").replace(/'/g, ""),
        equipoId: (d.team || {}).id,
        tipo: (d.type || {}).text || "Gol",
      }));

    return {
      local:  local.team.displayName,
      visita: visita.team.displayName,
      idLocal: local.team.id, idVisita: visita.team.id,
      posesion: [sl.possessionPct, sv.possessionPct],
      tiros:    [sl.totalShots, sv.totalShots],
      aGol:     [sl.shotsOnTarget, sv.shotsOnTarget],
      goles,
      gl: local.score  != null ? parseInt(local.score, 10)  : null,
      gv: visita.score != null ? parseInt(visita.score, 10) : null,
      enJuego, terminado,
      descanso: tipo === "STATUS_HALFTIME",
      /* displayClock viene como "67'". Es lo único que sabemos del minuto:
         no lo redondeamos ni lo estimamos si falta. */
      minuto: st.displayClock || null,
      periodo: st.period || null,
      detalle: (st.type || {}).shortDetail || "",
      fecha: evento.date || null,
    };
  }

  async function sondear(){
    try {
      const r = await fetch(API, { cache: "no-store" });
      if (!r.ok) throw new Error("ESPN " + r.status);
      const d = await r.json();
      ultimo = {
        partidos: (d.events || []).map(traducir).filter(Boolean),
        error: null,
        cuando: new Date(),
      };
    } catch (e) {
      /* Se conserva lo último bueno: mejor un marcador de hace un minuto
         que la página en blanco. */
      ultimo = { ...ultimo, error: e.message || "sin conexión" };
    }
    suscriptores.forEach(f => { try { f(ultimo); } catch (e) { console.error(e); } });
    return ultimo;
  }

  return {
    /* Busca el partido en vivo que corresponde a uno de los nuestros. */
    buscar(p){
      return ultimo.partidos.find(v =>
        mismoEquipo(v.local, p.local) && mismoEquipo(v.visita, p.visita)) || null;
    },
    estado(){ return ultimo; },
    alActualizar(f){ suscriptores.push(f); },

    arrancar(){
      if (reloj) return;
      sondear();
      reloj = setInterval(sondear, CADA);
      /* Sin esto el navegador acumula sondeos mientras la pestaña está oculta
         y al volver dispara todos juntos. */
      document.addEventListener("visibilitychange", () => {
        if (document.hidden){ clearInterval(reloj); reloj = null; }
        else if (!reloj){ sondear(); reloj = setInterval(sondear, CADA); }
      });
    },
  };
})();
