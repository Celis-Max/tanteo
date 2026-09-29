

const MERCADOS = {
  "1":{n:"Gana local",f:(a,b)=>a>b}, "X":{n:"Empate",f:(a,b)=>a===b}, "2":{n:"Gana visita",f:(a,b)=>a<b},
  "1X":{n:"Local o empate",f:(a,b)=>a>=b}, "12":{n:"No hay empate",f:(a,b)=>a!==b}, "X2":{n:"Visita o empate",f:(a,b)=>a<=b},
  "O15":{n:"Más de 1.5 goles",f:(a,b)=>a+b>1}, "U15":{n:"Menos de 1.5",f:(a,b)=>a+b<2},
  "O25":{n:"Más de 2.5 goles",f:(a,b)=>a+b>2}, "U25":{n:"Menos de 2.5",f:(a,b)=>a+b<3},
  "O35":{n:"Más de 3.5 goles",f:(a,b)=>a+b>3}, "U35":{n:"Menos de 3.5",f:(a,b)=>a+b<4},
  "BTTS":{n:"Ambos anotan",f:(a,b)=>a>0&&b>0}, "NOBTTS":{n:"No ambos anotan",f:(a,b)=>a===0||b===0},
};
const GRUPOS=[["Resultado",["1","X","2"]],["Doble oportunidad",["1X","12","X2"]],
  ["Goles",["O15","U15","O25","U25","O35","U35"]],["Ambos anotan",["BTTS","NOBTTS"]]];
const MESES=["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const fmt=(x,d=1)=>(x*100).toFixed(d)+"%";
const fecha=(f,h)=>{const d=new Date(f+"T12:00");return `${d.getDate()} ${MESES[d.getMonth()]}${h?" · "+h:""}`};
let parlay=[], jornadaSel=null, ajustes={}, abiertos=new Set();

/* ---------- matriz de marcadores: permite recalcular con el ajuste manual ---------- */
function poisson(lam,k){let p=Math.exp(-lam);for(let i=1;i<=k;i++)p*=lam/i;return p}
function matrizDe(p,i){
  const aj=ajustes[i];
  const base=(p.matriz_ajustada&&!aj)?p.matriz_ajustada:(aj?null:p.matriz);
  if(base) return base;
  const g=(p.goles_ajustados||p.goles_esperados||[1.2,1.1]);
  const lh=Math.max(.05,g[0]+(aj?.local||0)), la=Math.max(.05,g[1]+(aj?.visita||0)), rho=DATOS.rho||0;
  const n=8, M=[];
  for(let a=0;a<n;a++){M.push([]);for(let b=0;b<n;b++)M[a].push(poisson(lh,a)*poisson(la,b))}
  M[0][0]*=1-lh*la*rho; M[1][0]*=1+la*rho; M[0][1]*=1+lh*rho; M[1][1]*=1-rho;
  const s=M.flat().reduce((x,y)=>x+y,0);
  return M.map(f=>f.map(x=>x/s));
}
function probsDe(p,i){
  const M=matrizDe(p,i), r={};
  for(const k in MERCADOS){let s=0;
    for(let a=0;a<M.length;a++)for(let b=0;b<M[a].length;b++) if(MERCADOS[k].f(a,b)) s+=M[a][b];
    r[k]=s;}
  return r;
}
function probConjunta(p,i,claves){
  const M=matrizDe(p,i); let s=0;
  for(let a=0;a<M.length;a++)for(let b=0;b<M[a].length;b++)
    if(claves.every(k=>MERCADOS[k].f(a,b))) s+=M[a][b];
  return s;
}
const cuotaDe=(i,k)=>{const e=document.getElementById(`cuota-${i}-${k}`);const v=e?parseFloat(e.value):NaN;
  return isFinite(v)&&v>1?v:null};

/* ---------- jornadas ---------- */
function jornadasDisponibles(){
  const js=[...new Set(DATOS.partidos.map(p=>p.jornada))].sort((a,b)=>a-b);
  return js;
}
function proximaJornada(){
  const p=DATOS.partidos.find(p=>!p.jugado);
  return p?p.jornada:jornadasDisponibles().slice(-1)[0];
}
function pintarTabs(){
  const cont=document.getElementById("tabs-jornada"); if(!cont) return;
  cont.innerHTML = jornadasDisponibles().map(j=>{
    const ps=DATOS.partidos.filter(p=>p.jornada===j);
    const jugados=ps.filter(p=>p.jugado).length;
    const clase = j===jornadaSel?"sel":(jugados===ps.length?"jugada":(jugados?"viva":""));
    return `<button class="tab ${clase}" onclick="verJornada(${j})">J${j}</button>`;
  }).join("") + `<button class="tab ${jornadaSel==="liguilla"?"sel":""}" onclick="verJornada('liguilla')">Liguilla</button>`;
}
function verJornada(j){ jornadaSel=j; abiertos=new Set();
  if(typeof EFECTOS!=="undefined") setTimeout(()=>EFECTOS.repintar(),0);
  if(document.getElementById("tabs-jornada")) pintarTabs();
  if(document.getElementById("partidos")) pintarPartidos();
  if(document.getElementById("hero")) pintarHero();
  if(document.getElementById("sugeridos")) pintarSugeridos();
  window.scrollTo({top:0,behavior:"smooth"}); }

/* ---------- partidos ---------- */
function pintarPartidos(){
  const cont=document.getElementById("partidos"), res=document.getElementById("resumen-jornada");
  if(!cont) return;
  if(jornadaSel==="liguilla"){
    res.textContent="La liguilla se define al terminar la jornada 17.";
    cont.innerHTML = DATOS.liguilla.map(r=>`<div class="tarjeta"><div class="cabeza" style="cursor:default">
      <div><div class="vs">${r.ronda}</div><div class="cuando">${r.cuando} · ${r.nota}</div></div>
      <div class="sub">por definir</div></div></div>`).join("");
    return;
  }
  const ps=DATOS.partidos.filter(p=>p.jornada===jornadaSel);
  const jugados=ps.filter(p=>p.jugado).length;
  res.innerHTML=`Jornada ${jornadaSel} · ${ps.length} partidos · ${jugados} jugados${jugados<ps.length?` · ${ps.length-jugados} por jugar`:""}
    ${ps.some(p=>p.cuotas)?"":" · <span style='color:var(--tinta3)'>las cuotas se publican unos días antes</span>"}`;
  cont.innerHTML = ps.map(p=>tarjetaPartido(p, DATOS.partidos.indexOf(p))).join("");
  ps.forEach(p=>{const i=DATOS.partidos.indexOf(p);
    Object.keys(MERCADOS).forEach(k=>actualizarVentaja(i,k));});
  abiertos.forEach(i=>document.getElementById("t"+i)?.classList.add("abierta"));
}

const ESC=()=>DATOS.escudos||{};
function escudo(equipo,clase="escudo"){const e=ESC()[equipo];
  return e&&e.img?`<img class="${clase}" src="${e.img}" alt="">`:"";}
function colorEquipo(equipo){const e=ESC()[equipo];
  const c=e?.color||"#6ea8ff"; return (c.toLowerCase()==="#ffffff"||c.toLowerCase()==="#ffff91")?(e?.color2||c):c;}
function formaHTML(f){ return `<span class="forma">${(f||"").split("").map(c=>`<b class="f${c}">${c}</b>`).join("")}</span>` }

function tarjetaPartido(p,i){
  const P = p.jugado?null:probsDe(p,i);
  const ctx=p.contexto;
  const centro = p.jugado
    ? `<div class="tablero"><b>${p.gl}</b><i>:</i><b>${p.gv}</b></div>
       <div class="cuando">${p.estado}</div>`
    : `<div class="tablero pendiente"><i>vs</i></div>
       <div class="cuando">${fecha(p.fecha,p.hora)}</div>`;
  const barra = (!p.jugado && P)
    ? `<div class="probs">
         <div class="barra"><i class="b1" style="width:${P["1"]*100}%"></i><i class="bx" style="width:${P["X"]*100}%"></i><i class="b2" style="width:${P["2"]*100}%"></i></div>
         <div class="pct"><span>Local <b>${fmt(P["1"],0)}</b></span><span>Empate <b>${fmt(P["X"],0)}</b></span><span>Visita <b>${fmt(P["2"],0)}</b></span></div>
       </div>`
    : (p.jugado?"":`<div class="probs"><div class="sub">sin datos</div></div>`);
  return `<div class="tarjeta partido" id="t${i}" style="--cL:${colorEquipo(p.local)};--cV:${colorEquipo(p.visita)}">
    <div class="aura" aria-hidden="true"></div>
    <div class="cabeza" onclick="alternar(${i})">
      <div class="lado">${escudo(p.local,"escudo lg")}<span class="nom">${p.local}</span></div>
      <div class="centro">${centro}</div>
      <div class="lado der"><span class="nom">${p.visita}</span>${escudo(p.visita,"escudo lg")}</div>
    </div>
    <div class="meta">${p.sede||p.ciudad||""}${ctx?` · ${formaHTML(ctx.local.forma)} <span class="sep">vs</span> ${formaHTML(ctx.visita.forma)}`:""}</div>
    ${barra}
    <div class="cuerpo">${p.jugado?cuerpoJugado(p):cuerpoProximo(p,i)}</div>
  </div>`;
}
function bloqueEquipo(nombre,f,casa){
  const d=casa?f.casa:f.fuera;
  return `<div class="bloque"><h4>${nombre} ${casa?"(en casa)":"(de visita)"}</h4>
    <div class="dato"><span>Últimos 5</span><b>${formaHTML(f.forma)}</b></div>
    <div class="dato"><span>Racha</span><b>${f.racha}</b></div>
    <div class="dato"><span>Puntos últimos 5</span><b>${f.puntos_ult5} de 15</b></div>
    <div class="dato"><span>Goles últimos 5</span><b>${f.goles_favor_ult5} a favor · ${f.goles_contra_ult5} en contra</b></div>
    <div class="dato"><span>${casa?"De local":"De visitante"} (temporada)</span><b>${d.pts} pts en ${d.jj} · ${d.gf} gf · ${d.gc} gc</b></div>
    <div class="dato"><span>Descanso</span><b>${f.dias_descanso!=null?f.dias_descanso+" días":"—"}</b></div>
    <div class="dato"><span>Sus partidos con +2.5 goles</span><b>${f.over25_pct}%</b></div>
    <div class="dato"><span>Sus partidos con ambos anotan</span><b>${f.ambos_anotan_pct}%</b></div>
  </div>`;
}

function bloqueHistorial(h){
  if(!h||!h.juegos.length) return `<div class="bloque"><h4>Cara a cara</h4><div class="sub">Sin antecedentes recientes.</div></div>`;
  return `<div class="bloque"><h4>Cara a cara · últimos ${h.juegos.length}</h4>
    <div class="dato"><span>Balance</span><b>${h.gana_local}G · ${h.empates}E · ${h.gana_visita}P <span style="color:var(--tinta3)">(para el local de hoy)</span></b></div>
    <div class="dato"><span>Goles por partido</span><b>${h.goles_promedio ?? "—"}</b></div>
    ${h.juegos.map(j=>`<div class="dato"><span>${j.fecha} · ${j.local} vs ${j.visita}</span><b>${j.marcador}</b></div>`).join("")}
  </div>`;
}

function cuerpoJugado(p){
  const c=p.contexto;
  return `<div class="cols">
    ${c?bloqueEquipo(p.local,c.local,true):""}
    ${c?bloqueEquipo(p.visita,c.visita,false):""}
  </div><div class="cols">${c?bloqueHistorial(c.historial):""}
    <div class="bloque"><h4>Resultado</h4>
      <div class="dato"><span>Marcador</span><b>${p.local} ${p.gl} – ${p.gv} ${p.visita}</b></div>
      <div class="dato"><span>Fecha</span><b>${fecha(p.fecha,p.hora)}</b></div>
      <div class="dato"><span>Sede</span><b>${p.sede||"—"}</b></div>
      <div class="sub" style="margin-top:6px">Las estadísticas de arriba son como llegaban al partido, no incluyen este resultado.</div>
    </div></div>`;
}

function cuerpoProximo(p,i){
  const c=p.contexto, aj=ajustes[i]||{local:0,visita:0};
  const g=(p.goles_ajustados||p.goles_esperados||[0,0]);
  const tablas = GRUPOS.map(([titulo,claves])=>{
    const P=probsDe(p,i);
    return `<div style="font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:var(--tinta3);padding:10px 6px 4px">${titulo}</div>
    <table><tr><th>Apuesta</th><th>Prob.</th><th>Cuota justa</th><th>Tu cuota</th><th>Ventaja</th><th>Regla</th><th></th></tr>
    ${claves.map(k=>`<tr class="pick"><td>${MERCADOS[k].n}</td><td>${fmt(P[k])}</td><td>${(1/P[k]).toFixed(2)}</td>
      <td><input class="cuota" id="cuota-${i}-${k}" value="${p.cuotas?.["max_"+k] ?? ""}" placeholder="—" oninput="actualizarVentaja(${i},'${k}')"></td>
      <td class="ventaja" id="v-${i}-${k}">—</td><td id="r-${i}-${k}"></td><td><button class="add" onclick="agregar(${i},'${k}')">+</button></td></tr>`).join("")}
    </table>`;}).join("");
  const clima=p.clima?`<div class="bloque"><h4>Clima y cancha</h4>
      <div class="dato"><span>Estadio</span><b>${p.clima.estadio||p.sede}</b></div>
      ${p.clima.temperatura!=null?`<div class="dato"><span>Temperatura</span><b>${p.clima.temperatura}°C</b></div>
      <div class="dato"><span>Lluvia</span><b>${p.clima.lluvia} mm</b></div>
      <div class="dato"><span>Viento</span><b>${p.clima.viento} km/h</b></div>
      <div class="dato"><span>Humedad</span><b>${p.clima.humedad}%</b></div>`:`<div class="sub">El pronóstico aparece ~15 días antes.</div>`}
      <div class="dato"><span>Altitud</span><b>${p.clima.altitud} m</b></div></div>`:"";
  const noticias=p.noticias?`<div class="bloque"><h4>Noticias de la semana</h4>
      ${["local","visita"].map(lado=>{const n=p.noticias[lado], eq=lado==="local"?p.local:p.visita;
        const señales=Object.entries(n.señales||{}).map(([s,c])=>`<span class="etq">${s}${c>1?" ×"+c:""}</span>`).join("");
        return `<div style="margin-bottom:8px"><div class="dato"><span>${eq}</span><b>${n.n} titulares ${señales}</b></div>
          ${(n.titulares||[]).slice(0,3).map(t=>`<a class="noticia" href="${t.enlace}" target="_blank">${t.titulo}
            ${t.señales.map(s=>`<span class="etq">${s}</span>`).join("")}</a>`).join("")}</div>`}).join("")}
      <div class="sub" style="margin-top:6px">Detectado por palabras clave en los titulares; júzgalo tú y usa el ajuste de abajo.</div></div>`:"";
  return `<div class="cols">
      ${c?bloqueEquipo(p.local,c.local,true):""}
      ${c?bloqueEquipo(p.visita,c.visita,false):""}
    </div>
    <div class="cols">${c?bloqueHistorial(c.historial):""}${clima||noticias?`<div>${clima}${noticias?'<div style="height:12px"></div>'+noticias:""}</div>`:""}</div>
    ${bloqueEnJuego(p)}
    ${bloquePorModelo(p)}
    <div class="cols"><div class="bloque"><h4>Ajuste manual · lo que tú sabes</h4>
      <div class="sub" style="margin-bottom:6px">Mueve los goles esperados si hay bajas, cancha pesada o un equipo sin nada en juego.</div>
      <div class="dato"><span>${p.local}</span><b id="aj-l-${i}">${g[0]} ${aj.local?`(${aj.local>0?"+":""}${aj.local.toFixed(2)})`:""}</b></div>
      <input type="range" min="-0.8" max="0.8" step="0.05" value="${aj.local}" oninput="ajustar(${i},'local',this.value)">
      <div class="dato"><span>${p.visita}</span><b id="aj-v-${i}">${g[1]} ${aj.visita?`(${aj.visita>0?"+":""}${aj.visita.toFixed(2)})`:""}</b></div>
      <input type="range" min="-0.8" max="0.8" step="0.05" value="${aj.visita}" oninput="ajustar(${i},'visita',this.value)">
      <div style="margin-top:8px"><button onclick="ajustar(${i},'reset',0)">Quitar ajuste</button></div>
      ${p.mercado?`<div class="sub" style="margin-top:8px">Línea de ${p.origen_linea} (margen ${p.margen_casa}%): L ${fmt(p.mercado["1"],0)} · E ${fmt(p.mercado["X"],0)} · V ${fmt(p.mercado["2"],0)}</div>`:""}
    </div>
    <div class="bloque"><h4>Mercados</h4><div class="sub">Cuota justa = lo mínimo que deberían pagarte. Escribe la cuota de tu casa para ver la ventaja.</div>${tablas}</div></div>`;
}

function bloquePorModelo(p){
  if(!p.por_modelo) return "";
  const filas=Object.entries(p.por_modelo).map(([n,v])=>`<tr><td>${n}</td><td>${fmt(v[0],0)}</td><td>${fmt(v[1],0)}</td><td>${fmt(v[2],0)}</td></tr>`).join("");
  const M=p.mercado?`<tr><td><b>Mercado (${p.origen_linea})</b></td><td><b>${fmt(p.mercado["1"],0)}</b></td><td><b>${fmt(p.mercado["X"],0)}</b></td><td><b>${fmt(p.mercado["2"],0)}</b></td></tr>`:"";
  return `<div class="cols"><div class="bloque" style="grid-column:1/-1"><h4>Qué dice cada modelo · base: ${p.base_modelo}</h4>
    <table><tr><th>Modelo</th><th>Local</th><th>Empate</th><th>Visita</th></tr>${filas}
    <tr><td><b>Ensamble (lo que usa la página)</b></td><td><b>${fmt(p.probabilidades["1"],0)}</b></td><td><b>${fmt(p.probabilidades["X"],0)}</b></td><td><b>${fmt(p.probabilidades["2"],0)}</b></td></tr>${M}</table>
    <div class="sub" style="margin-top:6px">Si los modelos casi coinciden, el pronóstico es estable; si discrepan mucho, hay más incertidumbre en ese partido.</div></div></div>`;
}
function bloqueEnJuego(p){
  const J=((DATOS.montecarlo||{}).en_juego||{})[`${p.local}|${p.visita}`]; if(!J) return "";
  const lado=(d)=>{ if(!d||!d.gana) return "";
    const f=x=>x?fmt(x.liguilla,0):"—";
    const imp=d.importancia??0, nivel=imp>=0.25?["se juega mucho","var(--ambar)"]:(imp>=0.1?["importante","var(--tinta)"]:["poco en juego","var(--tinta3)"]);
    return `<div class="bloque"><h4>${d.equipo} · probabilidad de liguilla</h4>
      <div class="dato"><span>Hoy</span><b>${fmt(d.base_liguilla,0)}</b></div>
      <div class="dato"><span>Si gana</span><b style="color:var(--verde)">${f(d.gana)}</b></div>
      <div class="dato"><span>Si empata</span><b>${f(d.empata)}</b></div>
      <div class="dato"><span>Si pierde</span><b style="color:var(--rojo)">${f(d.pierde)}</b></div>
      <div class="dato"><span>Qué se juega</span><b style="color:${nivel[1]}">${nivel[0]} (${(imp*100).toFixed(0)} pts)</b></div></div>`;};
  return `<div class="cols">${lado(J.local)}${lado(J.visita)}</div>`;
}
function alternar(i){const el=document.getElementById("t"+i);el.classList.toggle("abierta");
  el.classList.contains("abierta")?abiertos.add(i):abiertos.delete(i);}
function ajustar(i,lado,v){
  ajustes[i]=ajustes[i]||{local:0,visita:0};
  if(lado==="reset") delete ajustes[i]; else ajustes[i][lado]=parseFloat(v);
  const abierto=new Set(abiertos); pintarPartidos(); abiertos=abierto;
  abiertos.forEach(k=>document.getElementById("t"+k)?.classList.add("abierta"));
  pintarParlay();
}
/*
 * La regla que mejor salió en la prueba histórica: favorito (cuota < 2.5) y
 * pagando al menos 2% más que la línea justa del mercado. Solo aplica al 1X2
 * y solo si hay línea de mercado (con el modelo solo, la prueba perdió dinero).
 */
function regla(p,i,k,c){
  if(!c) return {txt:"",cls:""};
  const esResultado=["1","X","2"].includes(k);
  if(esResultado && c>=3) return {txt:"cuota alta",cls:"rojo",tip:"Cuota ≥ 3: en Liga MX estas apuestas pierden ~10% (cuota 3–5) y ~23% (5–10) a la larga."};
  if(!esResultado) return {txt:"sin prueba",cls:"gris",tip:"No hay cuotas históricas de este mercado para probar una regla."};
  if(!p.mercado) return {txt:"sin línea",cls:"gris",tip:"Sin línea de mercado la regla no aplica: el modelo solo perdió dinero en la prueba."};
  const v=probsDe(p,i)[k]*c-1;
  if(c<2.5 && v>=0.02) return {txt:"✓ cumple",cls:"verde",tip:`Favorito pagando ${(v*100).toFixed(1)}% sobre la línea justa. Históricamente: +14% (n=159, t=1.85).`};
  if(c<2.5) return {txt:"sin valor",cls:"gris",tip:"Favorito, pero no paga al menos 2% sobre la línea justa."};
  return {txt:"no aplica",cls:"gris",tip:"La regla solo cubre favoritos (cuota < 2.5)."};
}
/* Segunda señal: la regla de Kaunitz et al. (2017), que solo necesita el promedio del mercado. */
function reglaKaunitz(p,k,c){
  const prom=p.cuotas?.["avg_"+k];
  if(!c||!prom||!["1","X","2"].includes(k)) return null;
  const real=1/prom-0.03;
  if(real<=0) return null;
  return c>1/real
    ? {txt:"✓ Kaunitz",cls:"verde",tip:`Tu cuota supera ${(1/real).toFixed(2)} (consenso del mercado − 3%). En Liga MX: +9.5% en prueba, 497 apuestas, t=1.4.`}
    : {txt:"",cls:"gris",tip:""};
}
const COLOR_REGLA={verde:"var(--verde)",rojo:"var(--rojo)",gris:"var(--tinta3)"};

function actualizarVentaja(i,k){
  const c=cuotaDe(i,k), celda=document.getElementById(`v-${i}-${k}`), cr=document.getElementById(`r-${i}-${k}`);
  if(!celda) return;
  const p=DATOS.partidos[i], r=regla(p,i,k,c), kz=reglaKaunitz(p,k,c);
  if(cr){cr.innerHTML=(r.txt?`<span title="${r.tip||""}" style="font-size:11px;color:${COLOR_REGLA[r.cls]};font-weight:600">${r.txt}</span>`:"")+
    (kz?`<br><span title="${kz.tip}" style="font-size:11px;color:${COLOR_REGLA[kz.cls]};font-weight:600">${kz.txt}</span>`:"");}
  if(!c){celda.textContent="—";celda.className="ventaja neg";pintarParlay();return}
  const v=probsDe(p,i)[k]*c-1;
  celda.textContent=(v>=0?"+":"")+(v*100).toFixed(1)+"%";
  celda.className="ventaja "+(v>0.02?"pos":"neg");
  pintarParlay();
  clearTimeout(window._tsug); window._tsug=setTimeout(pintarSugeridos,400);
}

/* ---------- parlay ---------- */
function agregar(i,k){ if(!parlay.some(x=>x.i===i&&x.k===k)){parlay.push({i,k});pintarParlay();} }
function quitar(n){parlay.splice(n,1);pintarParlay()}
function limpiar(){parlay=[];pintarParlay()}
function guardarEnUrl(){const h=parlay.map(x=>`${x.i}:${x.k}`).join(",");
  history.replaceState(null,"",h?"#"+h:location.pathname);
  guardarParlay();}
function leerDeUrl(){
  const h=decodeURIComponent(location.hash.replace(/^#/,""));if(!h)return;
  h.split(",").forEach(t=>{
    const [i,k]=t.split(":");
    if(k==="abrir" && DATOS.partidos[i]){        // abre esa tarjeta (sirve para compartir un partido)
      const p=DATOS.partidos[i]; jornadaSel=p.jornada; pintarTabs(); pintarPartidos();
      abiertos.add(parseInt(i)); document.getElementById("t"+i)?.classList.add("abierta");
      document.getElementById("t"+i)?.scrollIntoView({block:"start"});
    } else if(DATOS.partidos[i]&&MERCADOS[k]) parlay.push({i:parseInt(i),k});
  });}

function pintarParlay(){
  const cont=document.getElementById("piernas"),res=document.getElementById("resumen"),consejo=document.getElementById("consejo");
  if(!cont) return;
  if(!parlay.length){cont.innerHTML='<div class="vacio">Abre un partido y toca <b>+</b> en la apuesta que quieras.</div>';
    res.innerHTML="";consejo.innerHTML="";guardarEnUrl();return}
  cont.innerHTML=parlay.map((x,n)=>{const p=DATOS.partidos[x.i],c=cuotaDe(x.i,x.k);
    return `<div class="pierna"><div>${MERCADOS[x.k].n}<small>${escudo(p.local,"escudo sm")} ${p.local} vs ${p.visita} ${escudo(p.visita,"escudo sm")} · J${p.jornada}</small></div>
      <div style="text-align:right;white-space:nowrap">${fmt(probsDe(p,x.i)[x.k],0)} · ${c?c.toFixed(2):"sin cuota"}
      <button onclick="quitar(${n})" style="background:none;border:none;color:var(--tinta3)">✕</button></div></div>`}).join("");
  const porPartido={};
  parlay.forEach(x=>(porPartido[x.i]=porPartido[x.i]||[]).push(x.k));
  let prob=1,probIndep=1,cuota=1,faltaCuota=false,mismoPartido=false;
  for(const i in porPartido){const claves=porPartido[i],p=DATOS.partidos[i];
    prob*=probConjunta(p,i,claves); claves.forEach(k=>{probIndep*=probsDe(p,i)[k]});
    if(claves.length>1)mismoPartido=true}
  parlay.forEach(x=>{const c=cuotaDe(x.i,x.k); c?cuota*=c:faltaCuota=true});
  const ev=faltaCuota?null:prob*cuota-1;
  const banca=parseFloat(document.getElementById("banca").value)||0;
  const kf=parseFloat(document.getElementById("kelly").value)||0;
  const kelly=(!faltaCuota&&cuota>1)?Math.max(0,(prob*cuota-1)/(cuota-1))*kf:0;
  res.innerHTML=`<div class="celda"><span>Probabilidad</span><b>${fmt(prob,1)}</b></div>
    <div class="celda"><span>Pega 1 de cada</span><b>${prob>0?(1/prob).toFixed(1):"—"}</b></div>
    <div class="celda"><span>Cuota justa</span><b>${prob>0?(1/prob).toFixed(2):"—"}</b></div>
    <div class="celda"><span>Cuota combinada</span><b>${faltaCuota?"—":cuota.toFixed(2)}</b></div>
    <div class="celda" style="grid-column:1/-1"><span>Valor esperado</span>
      <b class="${ev===null?"":(ev>0?"pos":"neg")}">${ev===null?"escribe las cuotas":(ev>0?"+":"")+(ev*100).toFixed(1)+"%"}</b></div>`;
  let notas="";
  if(ev!==null&&ev>0) notas+=`<div class="aviso">Tiene valor: apuesta <b>${(banca*kelly).toFixed(0)}</b> de ${banca.toFixed(0)} (Kelly ${kf}). Pega ${(prob*100).toFixed(0)} de cada 100 veces.</div>`;
  else if(ev!==null) notas+=`<div class="aviso">Valor esperado negativo: a la larga pierde ${(-ev*100).toFixed(1)}% de lo apostado.</div>`;
  if(mismoPartido) notas+=`<div class="aviso">Hay piernas del mismo partido: la probabilidad mostrada es la exacta (${fmt(prob,1)}); multiplicándolas daría ${fmt(probIndep,1)}.</div>`;
  const sorpresas=parlay.filter(x=>["1","X","2"].includes(x.k)&&(cuotaDe(x.i,x.k)||0)>=3).length;
  if(sorpresas) notas+=`<div class="aviso" style="border-color:var(--rojo)">${sorpresas} pierna(s) con cuota ≥ 3. En Liga MX es lo que más pierde: −10% a −23% por apuesta a la larga.</div>`;
  if(parlay.length>2) notas+=`<div class="aviso">Con ${parlay.length} piernas el margen se acumula. En la prueba histórica, parlays de favoritos a cuota promedio: 2 piernas −1.6%, 3 piernas −2.8%, 4 piernas −6.9%.</div>`;
  consejo.innerHTML=notas; guardarEnUrl();
}

/* ---------- generador de parlays ----------
 * Arma combinaciones de partidos distintos (nunca dos apuestas del mismo partido,
 * que es donde la casa gana con la correlación) y las ordena por probabilidad real.
 */
let PIERNAS_SUG = 2;
function jornadaParlay(){
  // se arman con la jornada que estás viendo; si ya se jugó toda, con la siguiente pendiente
  const sel=DATOS.partidos.filter(p=>p.jornada===jornadaSel && !p.jugado);
  return sel.length?jornadaSel:proximaJornada();
}
function candidatos(){
  const j=jornadaParlay();
  return DATOS.partidos.map((p,i)=>({p,i}))
    .filter(({p})=>!p.jugado && p.probabilidades && p.jornada===j)
    .map(({p,i})=>{
      const P=probsDe(p,i);
      const opciones=Object.keys(MERCADOS)
        .map(k=>({k,prob:P[k],cuota:cuotaDe(i,k)}))
        .filter(o=>o.prob>=0.45 && o.prob<=0.95)
        .sort((a,b)=>b.prob-a.prob)
        .slice(0,3);
      return {i,p,opciones};
    }).filter(m=>m.opciones.length);
}
function combinaciones(lista,n){
  const salida=[];
  (function rec(desde,acc){
    if(acc.length===n){salida.push(acc.slice());return}
    for(let j=desde;j<lista.length;j++){acc.push(lista[j]);rec(j+1,acc);acc.pop();}
  })(0,[]);
  return salida;
}
function generarParlays(n){
  const ms=candidatos(); if(ms.length<n) return [];
  const salida=[];
  for(const grupo of combinaciones(ms,n)){
    const opciones=grupo.map(m=>m.opciones);
    const total=opciones.reduce((a,o)=>a*o.length,1);
    for(let c=0;c<total;c++){
      let resto=c, prob=1, cuota=1, faltan=false, piernas=[];
      for(let g=0;g<grupo.length;g++){
        const o=opciones[g][resto%opciones[g].length]; resto=Math.floor(resto/opciones[g].length);
        prob*=o.prob; if(o.cuota) cuota*=o.cuota; else faltan=true;
        piernas.push({i:grupo[g].i,k:o.k,prob:o.prob,cuota:o.cuota});
      }
      salida.push({piernas,prob,cuota:faltan?null:cuota,justa:1/prob,ev:faltan?null:prob*cuota-1});
    }
  }
  return salida;
}
/* "Gana local" → "Gana Toluca", para que la pierna se lea sola */
function nombreApuesta(k,p){
  return MERCADOS[k].n.replace(/\blocal\b/i, p.local).replace(/\bvisita\b/i, p.visita);
}
function pintarSugeridos(){
  const sel=document.getElementById("orden-parlay"); if(!sel) return;
  const orden=sel.value;
  document.getElementById("tabs-piernas").innerHTML=[2,3,4].map(n=>
    `<button class="tab ${n===PIERNAS_SUG?"sel":""}" onclick="PIERNAS_SUG=${n};pintarSugeridos()">${n} piernas</button>`).join("");
  let lista=generarParlays(PIERNAS_SUG);
  const conCuota=lista.filter(x=>x.ev!==null).length;
  if(orden==="valor") lista=lista.filter(x=>x.ev!==null).sort((a,b)=>b.ev-a.ev);
  else if(orden==="pago") lista=lista.filter(x=>x.prob>=0.25).sort((a,b)=>b.justa-a.justa);
  else lista.sort((a,b)=>b.prob-a.prob);
  const top=lista.slice(0,8);
  document.getElementById("sug-nota").innerHTML = top.length
    ? `Jornada ${jornadaParlay()} · ${lista.length.toLocaleString("es-MX")} combinaciones posibles, una apuesta por partido.
       ${conCuota?"":"<b>Sin cuotas publicadas todavía</b>: se muestra la cuota justa, escribe las tuyas para ver el valor."}`
    : "No hay suficientes partidos por jugar para armar parlays.";
  document.getElementById("sugeridos").innerHTML = top.map((x,n)=>{
    const piernas=x.piernas.map(l=>{const p=DATOS.partidos[l.i];
      return `<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:3px 0;border-top:1px solid var(--linea)">
        <span>${escudo(p.local,"escudo sm")}${escudo(p.visita,"escudo sm")} ${nombreApuesta(l.k,p)}
          <small style="color:var(--tinta3);display:block;margin-left:40px">${p.local} vs ${p.visita}</small></span>
        <span style="color:var(--tinta3);white-space:nowrap">${fmt(l.prob,0)} · ${(1/l.prob).toFixed(2)}</span></div>`}).join("");
    const color=x.prob>=0.5?"var(--verde)":(x.prob>=0.3?"var(--ambar)":"var(--tinta2)");
    return `<div class="bloque" style="margin-top:8px;padding:10px 12px">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <b style="color:${color};font-size:17px">${fmt(x.prob,0)}</b>
        <span class="sub">pega 1 de cada ${(1/x.prob).toFixed(1)} · justa ${x.justa.toFixed(2)}${x.cuota?` · tuya ${x.cuota.toFixed(2)}`:""}
        ${x.ev!==null?` · <b style="color:${x.ev>0?"var(--verde)":"var(--rojo)"}">${x.ev>0?"+":""}${(x.ev*100).toFixed(0)}%</b>`:""}</span>
      </div>
      ${piernas}
      <button style="margin-top:8px;width:100%;font-size:12px" onclick='usarSugerido(${JSON.stringify(x.piernas.map(l=>[l.i,l.k]))})'>Usar este parlay</button>
    </div>`}).join("");
}
function avisarEfectos(){ if(typeof EFECTOS!=="undefined") EFECTOS.repintar(); }

function usarSugerido(piernas){
  parlay = piernas.map(([i,k])=>({i,k}));
  pintarParlay();
  document.querySelector(".panel-parlay").scrollIntoView({behavior:"smooth",block:"start"});
}

/* ---------- simulador: libro de tickets de $100 por jornada ---------- */
function pintarSimulador(){
  const S=DATOS.simulador, cont=document.getElementById("simulador");
  const h2=document.getElementById("h2-simulador");
  if(!S || !S.tickets || !S.tickets.length){ if(cont)cont.style.display="none"; if(h2)h2.style.display="none"; return; }
  const T=S.totales, pesos=n=>(n<0?"−":"")+"$"+Math.abs(n).toFixed(0);

  document.getElementById("sim-intro").innerHTML=
    `Cada jornada el sistema aparta <b>$${S.monto}</b> virtuales en el parlay de <b>${S.criterio}</b>
     con <b>${S.piernas} piernas</b>, el mismo que encabeza los sugeridos de arriba. El ticket se escribe
     antes de que se juegue la jornada y ya no se toca: después solo se resuelve contra el marcador.`;

  const celda=(et,val,color)=>`<div class="celda"><span>${et}</span>
    <b${color?` style="color:${color}"`:""}>${val}</b></div>`;
  const colorNeto=T.neto>0?"var(--verde)":(T.neto<0?"var(--rojo)":null);
  document.getElementById("sim-kpis").innerHTML=
    celda("Resultado", T.resueltos?pesos(T.neto):"—", T.resueltos?colorNeto:null)+
    celda("Tickets", `${T.resueltos} resueltos${T.pendientes?` · ${T.pendientes} en juego`:""}`)+
    celda("Pegados", T.resueltos?`${T.ganados} de ${T.resueltos}`:"—")+
    celda("Apostado", T.invertido?pesos(T.invertido):"—")+
    celda("Yield", T.yield===null||T.yield===undefined?"—":`${T.yield>0?"+":""}${(T.yield*100).toFixed(1)}%`,
          T.yield>0?"var(--verde)":(T.yield<0?"var(--rojo)":null));

  const ticket=t=>{
    const piernas=t.piernas.map(l=>{
      const marca = l.pego===true?`<span class="ok">✓</span>`:(l.pego===false?`<span class="no">✗</span>`:"");
      return `<div class="pierna-sim">
        <span>${marca} ${l.apuesta}<span class="quien">${l.local} vs ${l.visita}</span></span>
        <span style="color:var(--tinta3);white-space:nowrap;text-align:right">${fmt(l.prob,0)}${
          l.marcador?`<span class="quien">${l.marcador}</span>`:""}</span></div>`;
    }).join("");
    const et={ganado:"Pegó",perdido:"No pegó",pendiente:"En juego"}[t.estado];
    const res = t.estado==="pendiente"
      ? `paga <b>${pesos(t.monto*t.cuota_justa)}</b> si pega`
      : `<b style="color:${t.neto>0?"var(--verde)":"var(--rojo)"}">${t.neto>0?"+":"−"}$${Math.abs(t.neto).toFixed(0)}</b>
         · banca ${pesos(t.banca)}`;
    return `<div class="bloque ticket ${t.estado}">
      <div class="ticket-cab">
        <b>Jornada ${t.jornada}</b>
        <span class="estado ${t.estado}">${et}</span>
      </div>
      <div class="sub" style="font-size:12px;margin:3px 0 6px">
        $${t.monto} · ${fmt(t.prob,0)} de probabilidad · cuota justa ${t.cuota_justa.toFixed(2)} · ${res}</div>
      ${piernas}</div>`;
  };

  const abiertos=S.tickets.filter(t=>t.estado==="pendiente");
  const cerrados=S.tickets.filter(t=>t.estado!=="pendiente").reverse();
  document.getElementById("sim-abierto").innerHTML = abiertos.length
    ? `<h4 style="margin:18px 0 0;font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:var(--tinta3)">En juego</h4>`
      + abiertos.map(ticket).join("") : "";
  document.getElementById("sim-historial").innerHTML = cerrados.length
    ? `<h4 style="margin:18px 0 0;font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:var(--tinta3)">Historial</h4>`
      + cerrados.map(ticket).join("")
    : `<div class="vacio" style="margin-top:14px">Todavía no se resuelve ningún ticket. El primero se cierra cuando termine la jornada.</div>`;

  document.getElementById("sim-nota").innerHTML=
    `<b>Se paga a cuota justa</b> (1 ÷ probabilidad, sin el margen de la casa), porque para esta jornada
     ninguna casa ha publicado cuotas. Eso hace que el simulador mida <b>solo la suerte</b>: a cuota justa el
     valor esperado es exactamente cero. Con cuotas reales el resultado sería peor, y por cuánto lo dice el
     backtest: un parlay de 2 piernas rinde −1.6%. No se rellenaron jornadas viejas a propósito: el modelo
     está ajustado con todo el histórico y ya sabe cómo terminaron, así que un ticket retroactivo no sería
     una apuesta sino una trampa. El libro vive en <code>datos/simulador.json</code>.`;
}

/* ---------- tablas y backtest ---------- */
function pintarHero(){
  const el=document.getElementById("hero"); if(!el) return;
  const liguilla = jornadaSel==="liguilla";
  const ps=DATOS.partidos.filter(p=>p.jornada===jornadaSel);
  const porJugar=ps.filter(p=>!p.jugado);
  const fechas=[...new Set(ps.map(p=>p.fecha))].sort();
  const lider=(DATOS.tabla||[])[0];
  const mc=(DATOS.montecarlo||{}).equipos||[];
  const favorito=mc.slice().sort((a,b)=>b.campeon-a.campeon)[0];
  const rango = fechas.length?`${fecha(fechas[0])} – ${fecha(fechas[fechas.length-1])}`:"";
  const estado = liguilla?"por definir":(porJugar.length?`${porJugar.length} por jugar`:"jornada completa");
  const cifra=(et,val,pie)=>val?`<div class="cifra"><span>${et}</span><b>${val}</b>${pie?`<i>${pie}</i>`:""}</div>`:"";
  el.innerHTML=`
    <div class="destello"></div>
    <div class="hero-id">
      <span class="et">${liguilla?"Fase":"Jornada"}</span>
      <b class="num${liguilla?" texto":""}">${liguilla?"Liguilla":jornadaSel}</b>
      <div class="hero-sub">${[rango,estado].filter(Boolean).join(" · ")}</div>
    </div>
    <div class="hero-cifras">
      ${cifra("Líder", lider?lider.equipo:"", lider?`${lider.pts} pts`:"")}
      ${cifra("Favorito al título", favorito?favorito.equipo:"", favorito?fmt(favorito.campeon,0):"")}
      ${cifra("Jugados", `${DATOS.jugados}<small>/${DATOS.total}</small>`, "del torneo")}
      ${cifra("Modelo", (DATOS.partidos.find(p=>p.base_modelo)||{}).base_modelo||"Dixon-Coles", "base de las probabilidades")}
    </div>`;
}
/* pintarTablas se partió en tres porque cada pedazo vive en una página distinta. */
function pintarMarca(){
  const M=DATOS.marca||{};
  const el=id=>document.getElementById(id);
  if(M.logo&&el("logo")) el("logo").src=M.logo;
  if(M.palabra&&el("palabra")) el("palabra").src=M.palabra;
  if(M.favicon&&el("favicon")) el("favicon").href=M.favicon;
  if(el("rotulo-torneo")) el("rotulo-torneo").textContent =
    `Liga MX · ${DATOS.torneo} · Jornada ${(DATOS.partidos.find(p=>!p.jugado)||{}).jornada || ""}`;
  if(el("subtitulo")) el("subtitulo").innerHTML=`<b style="color:var(--cal)">La corazonada, en números.</b>
    ${DATOS.torneo} · calendario, estadísticas y parlays medidos. <b>No predice resultados</b>: estima probabilidades.`;
  if(el("chips")) el("chips").innerHTML=`
    <div class="chip"><b>${DATOS.jugados}</b>/${DATOS.total} partidos jugados</div>
    <div class="chip">Último <b>${DATOS.ultimo_partido}</b></div>
    <div class="chip">Histórico <b>${DATOS.n_historico}</b> partidos</div>
    <div class="chip">Ventaja de local <b>${(Math.exp(DATOS.ventaja_local)*100-100).toFixed(0)}%</b> más goles</div>
    <div class="chip">Generado <b>${DATOS.generado}</b></div>`;
}

function pintarGenerales(){
  document.getElementById("tabla-general").innerHTML=
    `<tr><th>#</th><th>Equipo</th><th>JJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>Dif</th><th>Pts</th><th>Últimos 5</th></tr>`+
    DATOS.tabla.map((r,n)=>`<tr><td>${n+1}</td><td>${escudo(r.equipo,"escudo sm")} ${r.equipo}</td><td>${r.jj}</td><td>${r.g}</td><td>${r.e}</td><td>${r.p}</td>
      <td>${r.gf}</td><td>${r.gc}</td><td>${r.dif>0?"+":""}${r.dif}</td><td><b>${r.pts}</b></td>
      <td>${formaHTML(r.ultimos.join(""))}</td></tr>`).join("");
  document.getElementById("tabla-equipos").innerHTML=
    `<tr><th>Equipo</th><th>Ataque</th><th>Defensa</th><th>Rating</th><th>Pts casa</th><th>Pts fuera</th><th>Peso de su casa</th></tr>`+
    DATOS.equipos.map(e=>`<tr><td>${e.equipo}</td><td>${e.ataque>0?"+":""}${e.ataque}</td><td>${e.defensa>0?"+":""}${e.defensa}</td>
      <td><b>${e.rating}</b></td><td>${e.ppp_casa ?? "—"}</td><td>${e.ppp_fuera ?? "—"}</td>
      <td>${e.ventaja_casa!=null?`<b style="color:var(--ambar)">${e.ventaja_casa>0?"+":""}${e.ventaja_casa}</b>`:"—"}</td></tr>`).join("")+
    `<tr><td colspan="7" class="sub" style="text-align:left">Ataque y defensa son del modelo (0 = promedio). "Peso de su casa" son los puntos por partido que saca en casa menos los de visitante en 3 años: la versión medible de que la afición cuenta.</td></tr>`;
}

function pintarBacktest(){
  const b=DATOS.backtest||{};
  if(b.modelo){
    const a=b.apuestas||{};
    document.getElementById("kpis").innerHTML=`
      <div class="celda"><span>Partidos evaluados</span><b>${b.modelo.n}</b></div>
      <div class="celda"><span>Acierto del modelo</span><b>${(b.modelo.acierto*100).toFixed(1)}%</b></div>
      <div class="celda"><span>Log-loss modelo</span><b>${b.modelo.log_loss.toFixed(4)}</b></div>
      <div class="celda"><span>Log-loss mercado</span><b>${b.mercado.log_loss.toFixed(4)}</b></div>
      <div class="celda"><span>Brier modelo</span><b>${b.modelo.brier.toFixed(4)}</b></div>
      <div class="celda"><span>Retorno medio por apuesta</span><b class="${(a.retorno_medio_pct??0)>0?"pos":"neg"}">${a.retorno_medio_pct ?? "—"}%</b></div>`;
    document.getElementById("conclusion").innerHTML=`<b>Conclusión honesta:</b> el modelo <b>no le gana al mercado</b> en el 1X2.
      Está bien calibrado, pero el mercado predice mejor. Apostando solo con sus señales la banca habría caído de 100 a ${a.banca_final ?? "—"}
      (retorno medio ${a.retorno_medio_pct}% por apuesta, t=${a.t}). Al mezclarlo con el mercado, el peso óptimo del modelo fue ${((b.peso_modelo??0)*100).toFixed(0)}%.
      Por eso: cuando hay cuotas, las probabilidades se anclan a la línea; el modelo aporta los mercados que esa línea no publica y el contexto queda a tu criterio.`;
    document.getElementById("graficas").innerHTML=graficaCalibracion(b.calibracion||[])+graficaBanca(a.curva||[]);
  }
}

function pintarEstrategias(){
  const E=DATOS.estrategias||{}; if(!E.estrategias) return;
  document.getElementById("estr-intro").innerHTML=`Cada estrategia se afinó con <b>${E.periodo_afinado}</b> y se juzga solo con
    <b>${E.periodo_prueba}</b>, con cuotas de cierre reales y 1 unidad por apuesta. El <b>t</b> dice si el resultado se distingue de la suerte:
    arriba de 2 empieza a ser serio.`;
  document.getElementById("reglas").innerHTML=`
    <div class="cols" style="padding:0">
      <div class="bloque" style="border-left:3px solid var(--verde)"><h4>Lo que sí tiene evidencia</h4>
        <div class="dato"><span>1. Busca siempre la mejor cuota</span><b>+2 a +8 pts de yield</b></div>
        <div class="dato"><span>2. Favoritos (cuota &lt; 2.5) que paguen ≥2% sobre la línea justa</span><b>+14% en prueba</b></div>
        <div class="dato"><span>3. Si haces parlay, pocas piernas y de favoritos</span><b>2 piernas ≈ neutro</b></div>
      </div>
      <div class="bloque" style="border-left:3px solid var(--rojo)"><h4>Lo que pierde seguro</h4>
        <div class="dato"><span>Sorpresas (cuota 3–5) a cuota promedio</span><b style="color:var(--rojo)">−9.9% (t=−4.7)</b></div>
        <div class="dato"><span>Cuota 5–10</span><b style="color:var(--rojo)">−22.6%</b></div>
        <div class="dato"><span>Parlays de 4 piernas</span><b style="color:var(--rojo)">−6.9%</b></div>
        <div class="dato"><span>Apostar con el modelo solo</span><b style="color:var(--rojo)">−9.4%</b></div>
      </div>
    </div>`;
  const veredicto=r=>r.n<50?["poca muestra","var(--tinta3)"]:(r.t>=2?["significativa","var(--verde)"]:(r.yield_pct>3&&r.t>=1?["prometedora","var(--ambar)"]:(r.yield_pct<-3?["pierde","var(--rojo)"]:["ruido","var(--tinta3)"])));
  const prm=v=>Array.isArray(v)?`${v[0]}–${v[1]}`:(v<1&&v>0?(v*100).toFixed(0)+"%":v);
  document.getElementById("tabla-estrategias").innerHTML=`<tr><th>Estrategia</th><th>Parámetro</th><th>Afinado</th><th>Apuestas</th>
    <th>Yield prueba</th><th>t</th><th>Acierto</th><th>Cuota media</th><th>Veredicto</th></tr>`+
    E.estrategias.slice().sort((a,b)=>b.prueba.yield_pct-a.prueba.yield_pct).map(e=>{const r=e.prueba,[v,c]=veredicto(r);
      return `<tr><td>${e.nombre}</td><td>${prm(e.parametro)}</td><td style="color:var(--tinta3)">${e.afinado.yield_pct>0?"+":""}${e.afinado.yield_pct}%</td>
      <td>${r.n}</td><td><b style="color:${r.yield_pct>0?"var(--verde)":"var(--rojo)"}">${r.yield_pct>0?"+":""}${r.yield_pct}%</b></td>
      <td>${r.t}</td><td>${r.acierto_pct}%</td><td>${r.cuota_media}</td><td style="color:${c};font-weight:600">${v}</td></tr>`}).join("");
  // gráfica: sesgo por rango de cuota, promedio vs mejor cuota
  const S=E.sesgo_cuotas||[], rangos=[...new Set(S.map(x=>x.rango))];
  const W=440,H=260,m=40, bw=(W-m-10)/rangos.length;
  const y=v=>H/2-(Math.max(-30,Math.min(10,v))/30)*(H/2-20);
  const barras=rangos.map((rg,j)=>["avg","max"].map((casa,n)=>{const d=S.find(x=>x.rango===rg&&x.casa===casa);if(!d)return"";
    const x0=m+j*bw+4+n*(bw/2-4), yy=y(d.yield_pct), y0=y(0);
    return `<rect x="${x0}" y="${Math.min(yy,y0)}" width="${bw/2-6}" height="${Math.abs(yy-y0)}" fill="${casa==="avg"?"var(--rojo)":"var(--azul)"}" opacity=".8"/>`}).join("")+
    `<text x="${m+j*bw+bw/2}" y="${H-6}" fill="var(--tinta3)" font-size="10" text-anchor="middle">${rg}</text>`).join("");
  const curvaFav=(E.estrategias.find(e=>e.clave==="fav_valor")||{}).prueba?.curva||[];
  document.getElementById("graf-estr").innerHTML=`<div><b style="font-size:14px">Sesgo favorito–sorpresa</b>
    <div class="sub">Yield por rango de cuota · <span style="color:var(--rojo)">■</span> cuota promedio <span style="color:var(--azul)">■</span> mejor cuota</div>
    <svg viewBox="0 0 ${W} ${H}"><line x1="${m}" y1="${y(0)}" x2="${W-10}" y2="${y(0)}" stroke="var(--linea)"/>
    <text x="${m-6}" y="${y(0)+4}" fill="var(--tinta3)" font-size="10" text-anchor="end">0%</text>
    <text x="${m-6}" y="${y(-20)+4}" fill="var(--tinta3)" font-size="10" text-anchor="end">−20%</text>${barras}</svg></div>`+
    (curvaFav.length?graficaUnidades(curvaFav,"Favorito con valor (prueba)"):"");
  document.getElementById("estr-cuidado").innerHTML=`<b>Cuidado con esto:</b> probé ${E.estrategias.length} estrategias; con tantas, alguna sale bien por suerte.
    La "mejor cuota del mercado" es la mejor de decenas de casas al cierre, incluidas algunas que no operan en México y líneas que duran segundos:
    es un techo, no lo que vas a conseguir. En la práctica: ten cuenta en 2 o 3 casas, compara contra la línea justa de esta página y apuesta
    solo cuando la tuya pague claramente más. Bet365 solo tiene historia desde agosto de 2025, así que no entra en la prueba.`;
}
function pintarMontecarlo(){
  const M=DATOS.montecarlo; if(!M||!M.equipos) return;
  document.getElementById("mc-intro").innerHTML=`${M.simulaciones.toLocaleString("es-MX")} torneos simulados: los ${M.pendientes} partidos que faltan se juegan sorteando
    marcadores del modelo, con incertidumbre en la fuerza de cada equipo (no se da por exacta). Formato supuesto: 1–6 directo a cuartos,
    7–10 play-in, cuartos y semis a ida y vuelta con ventaja al mejor ubicado.`;
  const celda=(v,col)=>`<td style="background:linear-gradient(90deg,${col}33 ${v*100}%,transparent ${v*100}%)">${v>=0.995?">99%":(v<0.005?(v>0?"<1%":"—"):fmt(v,0))}</td>`;
  document.getElementById("tabla-mc").innerHTML=`<tr><th>Equipo</th><th>Pts esperados</th><th>Rango 80%</th><th>Líder</th><th>Top 6</th>
    <th>Play-in</th><th>Liguilla</th><th>Semis</th><th>Final</th><th>Campeón</th></tr>`+
    M.equipos.map(e=>`<tr><td>${e.equipo}</td><td><b>${e.puntos_esperados}</b></td><td style="color:var(--tinta3)">${e.puntos_p10}–${e.puntos_p90}</td>
      ${celda(e.lider,"#ffb454")}${celda(e.top6,"#3ddc97")}${celda(e.playin,"#9aa6bd")}${celda(e.cuartos,"#3ddc97")}
      ${celda(e.semis,"#6ea8ff")}${celda(e.final,"#6ea8ff")}${celda(e.campeon,"#ffb454")}</tr>`).join("");
}

/* El bloque de bancas se pinta aparte porque su contenedor (#bancas) vive en la
   sección de estrategias, que está en otra página que la tabla de Monte Carlo. */
function pintarBancas(){
  const cont=document.getElementById("bancas"); if(!cont) return;
  const M=DATOS.montecarlo||{};
  const B=M.bancas||{}, N={fav_valor:"Favorito con valor (≥2% sobre la línea)",fav_avg:"Favoritos a cuota promedio",
    sorpresas_avg:"Sorpresas (cuota 3–5)",parlay3_avg:"Parlays de 3 favoritos"};
  const cards=Object.entries(B).filter(([k,b])=>b&&b.caminos).map(([k,b])=>`<div class="celda">
    <span>${N[k]||k}</span><b style="color:${b.prob_ganar>=0.5?"var(--verde)":"var(--rojo)"}">${fmt(b.prob_ganar,0)}</b>
    <div class="sub">de terminar arriba · mediana ${b.mediana} · 80% entre ${b.p10} y ${b.p90}${b.prob_perder_mitad>0.005?` · ${fmt(b.prob_perder_mitad,0)} pierde la mitad`:""}</div></div>`).join("");
  if(cards) cont.innerHTML=`<b style="font-size:14px">Tu banca en 150 apuestas · Monte Carlo</b>
    <div class="sub" style="margin-bottom:8px">Banca de 100, 2% por apuesta, remuestreando ${(Object.values(B)[0]||{}).caminos?.toLocaleString("es-MX")} veces apuestas reales de cada estrategia.
    Supone que el resultado histórico se repite; si la ventaja era suerte, esto también lo es.</div>
    <div class="kpi">${cards}</div>`;
}

function pintarInfluye(){
  const C=DATOS.clima_efecto||{}, A=DATOS.aficion||{}, el=document.getElementById("influye");
  if(!C.descriptivo && !A.pandemia){el.innerHTML='<div class="vacio">Corre <code>./actualizar.sh --backtest</code> para medirlo.</div>';return}
  const filas=Object.entries(C.descriptivo||{}).filter(([k,v])=>v.n>0).map(([k,v])=>`<tr><td>${k}</td><td>${v.n}</td><td><b>${v.goles}</b></td>
    <td>${v.over25_pct}%</td><td>${v.empate_pct}%</td><td>${v.local_pct}%</td></tr>`).join("");
  const P=A.pandemia?.grupos||{}, S=A.asistencia?.grupos||{};
  el.innerHTML=`
   <div class="cols" style="padding:0">
    <div class="bloque"><h4>Clima · ${C.n?.toLocaleString("es-MX")||"—"} partidos con clima real del estadio</h4>
      <div style="overflow-x:auto"><table><tr><th>Condición</th><th>n</th><th>Goles</th><th>+2.5</th><th>Empate</th><th>Gana local</th></tr>${filas}</table></div>
      <div class="aviso"><b>No influye de forma aprovechable.</b> Los goles casi no cambian (la lluvia fuerte hasta trae un poco más).
      Encima de lo que ya esperaba el modelo, ningún factor de clima es significativo, y encima de la cuota solo sale una señal
      (con lluvia el visitante favorito rinde menos de lo esperado) que, tras 18 pruebas, cabe perfecto en el azar.</div></div>
    <div class="bloque"><h4>Afición</h4>
      <div class="dato"><span>Con público: gana el local</span><b>${P["Con público"]?.local_gana_pct}% <span style="color:var(--tinta3)">(cuota: ${P["Con público"]?.cuota_decia_pct}%)</span></b></div>
      <div class="dato"><span>Sin público (pandemia 2020)</span><b>${P["Sin público (pandemia)"]?.local_gana_pct}% <span style="color:var(--tinta3)">(cuota: ${P["Sin público (pandemia)"]?.cuota_decia_pct}%)</span></b></div>
      ${Object.entries(S).map(([k,v])=>`<div class="dato"><span>${k}</span><b>${v.local_gana_pct}% <span style="color:var(--tinta3)">(cuota: ${v.cuota_decia_pct}%)</span></b></div>`).join("")}
      <div class="dato"><span>Equipos más fuertes en casa</span><b>${A.peso_casa?.top20?.local_gana_pct}% <span style="color:var(--tinta3)">(cuota: ${A.peso_casa?.top20?.cuota_decia_pct}%)</span></b></div>
      <div class="aviso"><b>Tampoco da ventaja, y hay una sorpresa:</b> sin público los locales ganaron <b>más</b>, y la cuota esperaba lo contrario.
      En Liga MX la ventaja de local viene más del viaje, la altura y la costumbre de la cancha que del grito de la tribuna. Con estadio lleno
      el local ganó incluso menos de lo que decía la cuota (se llena en partidos contra rivales fuertes). El peso de la casa de cada equipo,
      el mercado ya lo cobra exacto.</div></div>
   </div>
   <div class="bloque" style="margin-top:14px"><h4>Noticias</h4>
     <div class="sub" style="font-size:13px;line-height:1.55">No se pueden probar hacia atrás: no existe un archivo de titulares viejos. Lo que sí sabemos es que el
     mercado ya absorbe lo público (la forma no agrega nada, el clima tampoco), y una lesión anunciada en un titular es pública: cuando la
     lees, la cuota normalmente ya se movió. Por eso la página <b>guarda los titulares y las cuotas cada día</b>. En una temporada se podrá
     medir si las señales (bajas, crisis, cambio de técnico) anticipaban algo que la cuota no tenía. Mientras tanto, úsalas con el ajuste manual.</div></div>
   <div class="aviso" style="border-color:var(--verde)"><b>En resumen:</b> clima, afición y forma ya vienen dentro de la cuota. Lo que sí mueve tu
   resultado es a qué precio apuestas: busca la mejor cuota, apuesta favoritos solo cuando paguen más que la línea justa, evita cuotas altas
   y parlays largos. La única pista física que queda abierta es la <b>altitud</b>.</div>`;
}

/* Calificación contra el mercado: cuánto peor (en RPS) que Pinnacle, que es la vara a vencer. */
function calificacion(rps, base){
  const d=(rps-base)/base*100;
  if(d<=0.3) return ["A","var(--verde)","igual o mejor que el mercado"];
  if(d<=1.5) return ["B","var(--verde)",`${d.toFixed(1)}% peor que el mercado`];
  if(d<=3)   return ["C","var(--ambar)",`${d.toFixed(1)}% peor`];
  if(d<=6)   return ["D","var(--ambar)",`${d.toFixed(1)}% peor`];
  return ["F","var(--rojo)",`${d.toFixed(1)}% peor`];
}
const ORIGEN={
  "Poisson":"Maher (1982) · penaltyblog","Dixon-Coles (penaltyblog)":"Dixon y Coles (1997) · penaltyblog",
  "Poisson bivariado":"Karlis y Ntzoufras (2003) · penaltyblog","Binomial negativa":"penaltyblog",
  "Poisson cero-inflado":"penaltyblog","Cópula Weibull":"Boshnakov et al. (2017) · penaltyblog",
  "Elo":"Elo adaptado al fútbol (Hvattum y Arntzen, 2010)","Pi-ratings":"Constantinou y Fenton (2013)",
  "Nuestro Dixon-Coles":"este proyecto","FiveThirtyEight SPI":"FiveThirtyEight (predicciones reales archivadas)",
  "Mercado · Pinnacle (Shin)":"la casa más afilada, sin margen","Mercado · promedio de casas":"promedio de ~30 casas, sin margen",
  "Mercado · consenso Kaunitz":"Kaunitz, Zhong y Kreiner (2017)","Ensamble de modelos":"promedio de los 9 modelos (goles + Elo + pi) · lo que usa la página",
  "Ensamble de modelos de goles":"promedio de los 7 modelos de goles (sin Elo ni pi)"};
function tablaModelos(filas){
  const base=(filas.find(r=>r.modelo.startsWith("Mercado · Pinnacle"))||filas[0]).rps;
  return `<table><tr><th>#</th><th>Modelo / sistema</th><th>De dónde viene</th><th>RPS</th><th>Log-loss</th><th>Brier</th><th>Acierto</th><th>Nota</th></tr>`+
    filas.map((r,n)=>{const [g,c,t]=calificacion(r.rps,base);
      return `<tr><td>${n+1}</td><td><b>${r.modelo}</b></td><td style="color:var(--tinta3);text-align:left">${ORIGEN[r.modelo]||(r.modelo.startsWith("Mezcla")?"ensamble + Pinnacle, peso elegido con 2019-21":"")}</td>
      <td>${r.rps.toFixed(4)}</td><td>${r.log_loss.toFixed(4)}</td><td>${r.brier.toFixed(4)}</td><td>${(r.acierto*100).toFixed(1)}%</td>
      <td title="${t}"><b style="color:${c};font-size:15px">${g}</b> <span class="sub">${t}</span></td></tr>`}).join("")+`</table>`;
}
function pintarComparativa(){
  const C=DATOS.comparativa, el=document.getElementById("comparativa"); if(!C||!C.tabla){el.innerHTML='<div class="vacio">Corre <code>python3 comparativa.py</code>.</div>';return}
  const K=C.kaunitz||[];
  const kfila=a=>{const af=K.find(x=>x.alfa===a&&x.periodo==="afinado"),pr=K.find(x=>x.alfa===a&&x.periodo==="prueba");
    return af&&pr?`<tr><td>α = ${a}</td><td>${af.n}</td><td>${af.yield_pct>0?"+":""}${af.yield_pct}%</td><td>${pr.n}</td>
      <td><b style="color:${pr.yield_pct>0?"var(--verde)":"var(--rojo)"}">${pr.yield_pct>0?"+":""}${pr.yield_pct}%</b></td><td>${pr.t}</td><td>${pr.cuota_media}</td></tr>`:""};
  el.innerHTML=`
    <div class="sub">Todos compiten con la misma regla: predecir cada partido viendo solo lo anterior, y se califican sobre
      <b>los mismos ${C.n_prueba} partidos</b> (${C.periodo_prueba}). La métrica principal es el <b>RPS</b>
      (Ranked Probability Score, la estándar en pronóstico de fútbol; menor es mejor). La nota compara contra Pinnacle, que es la vara a vencer.</div>
    <div style="overflow-x:auto;margin-top:12px">${tablaModelos(C.tabla)}</div>
    <h4 style="margin:20px 0 6px;font-size:14px">Contra FiveThirtyEight · ${C.n_538} partidos (${C.periodo_538})</h4>
    <div class="sub">FiveThirtyEight cerró su sección deportiva en 2023; estas son sus predicciones reales de Liga MX, recuperadas del archivo de internet.</div>
    <div style="overflow-x:auto;margin-top:8px">${tablaModelos(C.tabla_538)}</div>
    <h4 style="margin:20px 0 6px;font-size:14px">La estrategia de Kaunitz et al. (2017) aplicada a Liga MX</h4>
    <div class="sub">Su regla: la probabilidad real es 1/promedio de cuotas; se apuesta a la cuota máxima cuando supera 1/(prob − α). En su estudio
      (56,435 apuestas, 818 ligas) ganó +3.5% y funcionó con dinero real hasta que las casas los limitaron.</div>
    <div style="overflow-x:auto;margin-top:8px"><table><tr><th>Umbral</th><th>Apuestas afinado</th><th>Yield afinado</th><th>Apuestas prueba</th><th>Yield prueba</th><th>t</th><th>Cuota media</th></tr>
      ${[0.03,0.05,0.07].map(kfila).join("")}</table></div>
    <div class="cols" style="padding:0;margin-top:16px">
      <div class="bloque"><h4>Sitios de pronósticos de Liga MX</h4>
        <div class="dato"><span>Forebet, FootyStats, Vitibet, MyGameOdds</span><b style="color:var(--rojo)">no verificables</b></div>
        <div class="dato"><span>Dimers, Squawka Signal</span><b style="color:var(--ambar)">método descrito, sin historial descargable</b></div>
        <div class="sub" style="margin-top:6px">Publican porcentajes de acierto sin muestra ni método comprobable (hay quien presume 71% de acierto con 3 partidos).
          Squawka describe algo casi idéntico a Dixon-Coles: ataque y defensa de dos temporadas más localía.</div></div>
      <div class="bloque"><h4>Qué se tomó de cada uno</h4>
        <div class="dato"><span>Kaunitz et al.</span><b>el consenso del mercado como "probabilidad real"</b></div>
        <div class="dato"><span>Egidi, Pauli y Torelli (2018)</span><b>usar las cuotas como información previa del modelo</b></div>
        <div class="dato"><span>penaltyblog</span><b>6 modelos de goles, Elo, pi-ratings y el RPS</b></div>
        <div class="dato"><span>FiveThirtyEight</span><b>importancia del partido y simular el torneo</b></div>
        <div class="dato"><span>Soccer Prediction Challenge 2017</span><b>calificar con RPS sobre partidos comunes</b></div></div>
    </div>
    <div class="aviso" id="comp-conclusion"></div>`;
  const orden=C.tabla.map(r=>r.modelo), pin=C.tabla.find(r=>r.modelo.startsWith("Mercado · Pinnacle"));
  const mejorModelo=C.tabla.find(r=>!r.modelo.startsWith("Mercado")&&!r.modelo.startsWith("Mezcla"));
  const t538=C.tabla_538.find(r=>r.modelo==="FiveThirtyEight SPI");
  document.getElementById("comp-conclusion").innerHTML=`<b>Lectura:</b> el mejor modelo puro fue <b>${mejorModelo.modelo}</b>
    (RPS ${mejorModelo.rps.toFixed(4)}), contra ${pin.rps.toFixed(4)} de Pinnacle. ${t538?`FiveThirtyEight, con xG y un equipo de analistas, quedó en el lugar
    ${C.tabla_538.indexOf(t538)+1} de ${C.tabla_538.length} en sus partidos.`:""} Ningún modelo le gana al mercado, lo cual coincide con la literatura:
    la información útil ya está en las cuotas. Por eso la página usa la línea del mercado como base y los modelos solo para lo que el mercado no publica.`;
}

function pintarFactores(){
  const C=(DATOS.contexto_mercado||{}).eventos; if(!C) return;
  const N={descanso_dif:"Descanso (diferencia de días)",forma_dif:"Forma: vienen de ganar o perder",viaje_100km:"Viaje del visitante",
    sube_1000m:"Altitud que sube el visitante",modelo_1:"El modelo",modelo_2:"El modelo"};
  const lectura=p=>p<0.01?["fuerte","var(--verde)"]:(p<0.06?["en el límite","var(--ambar)"]:["nada","var(--tinta3)"]);
  const L=C.gana_local, V=C.gana_visita, claves=Object.keys(L.coeficientes);
  document.getElementById("tabla-factores").innerHTML=`<tr><th>Factor</th><th>Para que gane el local</th><th>p</th><th>Para que gane la visita</th><th>p</th><th>Señal</th></tr>`+
    claves.map((k,j)=>{const a=L.coeficientes[k], kv=Object.keys(V.coeficientes)[j], b=V.coeficientes[kv];
      const [txt,col]=lectura(Math.min(a.p,b.p));
      return `<tr><td>${N[k]||k}</td><td>${a.coef>0?"+":""}${a.coef}</td><td>${a.p}</td><td>${b.coef>0?"+":""}${b.coef}</td><td>${b.p}</td>
        <td style="color:${col};font-weight:600">${txt}</td></tr>`}).join("");
  const A=(DATOS.estrategias||{}).arbitraje;
  document.getElementById("factores-conclusion").innerHTML=`<b>Lectura:</b> la forma reciente no agrega nada (el mercado ya sabe si vienen de ganar o perder),
    y el modelo tampoco. La única pista es la <b>altitud</b>: cuando el visitante sube a jugar, el local gana un poco más de lo que dice la cuota (p≈0.05),
    creíble pero sin demostrar. El descanso sale "significativo" solo para la visita, con un signo que no tiene lógica, y fuera de muestra empeora:
    con 10 pruebas, uno así aparece por azar. Fuera de muestra, todos los factores juntos mejoran al mercado apenas ${L.mejora_pct}% (local) y ${V.mejora_pct}% (visita).
    ${A?`<br><br><b>Arbitraje entre casas:</b> al cierre hubo arbitraje en ${A.pct_partidos}% de los partidos, con ganancia mediana de ${A.ganancia_mediana_pct}%,
    pero se está extinguiendo (${Object.entries(A.por_anio).filter(([a])=>a>=2016).map(([a,v])=>`${a}: ${v}%`).join(" · ")}) y las casas limitan a quien lo hace.`:""}`;
}
function graficaUnidades(curva,titulo){
  const W=420,H=260,m=36, min=Math.min(0,...curva), max=Math.max(1,...curva);
  const x=i=>m+(i/(curva.length-1||1))*(W-m-10), y=v=>H-m-((v-min)/(max-min||1))*(H-m-14);
  const d=curva.map((v,i)=>`${i?"L":"M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return `<div><b style="font-size:14px">${titulo}</b><div class="sub">Unidades acumuladas apostando 1 por apuesta · final ${curva[curva.length-1]>0?"+":""}${curva[curva.length-1]} u</div>
  <svg viewBox="0 0 ${W} ${H}"><line x1="${m}" y1="${y(0)}" x2="${W-10}" y2="${y(0)}" stroke="var(--linea)" stroke-dasharray="4 4"/>
  <path d="${d}" fill="none" stroke="${curva[curva.length-1]>=0?"var(--verde)":"var(--rojo)"}" stroke-width="2"/></svg></div>`;
}
function graficaCalibracion(c){
  if(!c.length)return"";const W=420,H=280,m=36;
  const x=v=>m+v*(W-m-10),y=v=>H-m-v*(H-m-14);
  return `<div><b style="font-size:14px">Calibración</b><div class="sub">Si digo 60%, ¿pasa el 60%?</div>
  <svg viewBox="0 0 ${W} ${H}"><line x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}" stroke="var(--linea)" stroke-dasharray="4 4"/>
  <line x1="${m}" y1="${H-m}" x2="${W-10}" y2="${H-m}" stroke="var(--linea)"/><line x1="${m}" y1="14" x2="${m}" y2="${H-m}" stroke="var(--linea)"/>
  ${c.map(b=>`<circle cx="${x(b.predicho)}" cy="${y(b.real)}" r="${Math.max(3,Math.min(9,Math.sqrt(b.n)/3))}" fill="var(--verde)" opacity=".85"/>`).join("")}
  <text x="${W/2}" y="${H-8}" fill="var(--tinta3)" font-size="11" text-anchor="middle">probabilidad del modelo</text></svg></div>`;
}
function graficaBanca(curva){
  if(!curva.length)return"";const W=420,H=280,m=36;
  const v=curva.map(p=>p.banca),min=Math.min(...v,100),max=Math.max(...v);
  const x=i=>m+(i/(curva.length-1))*(W-m-10),y=b=>H-m-((b-min)/(max-min||1))*(H-m-14);
  const d=curva.map((p,i)=>`${i?"L":"M"}${x(i).toFixed(1)},${y(p.banca).toFixed(1)}`).join(" ");
  const fin=v[v.length-1];
  return `<div><b style="font-size:14px">Banca simulada</b><div class="sub">100 al inicio → ${fin.toFixed(0)} al final</div>
  <svg viewBox="0 0 ${W} ${H}"><line x1="${m}" y1="${y(100)}" x2="${W-10}" y2="${y(100)}" stroke="var(--linea)" stroke-dasharray="4 4"/>
  <path d="${d}" fill="none" stroke="${fin>=100?"var(--verde)":"var(--rojo)"}" stroke-width="2"/>
  <text x="${W/2}" y="${H-8}" fill="var(--tinta3)" font-size="11" text-anchor="middle">apuestas en orden de fecha</text></svg></div>`;
}

function ocultarCarga(){const c=document.getElementById("cargando"); if(c) c.classList.add("listo");}

/* ══════════════════════════════════════════════════════════════════════
   Cromo común: barra de navegación, pie y arranque.
   Las páginas son estáticas y comparten datos.js, estilo.css y este
   archivo. Cada una trae solo las secciones que le tocan, así que el
   arranque llama a un pintor únicamente si su contenedor existe.
   ══════════════════════════════════════════════════════════════════════ */

const PAGINAS = [
  {href:"index.html",     t:"Inicio"},
  {href:"partidos.html",  t:"Partidos y resultados"},
  {href:"parlays.html",   t:"Mejores parlays"},
  {href:"simulador.html", t:"Simulador"},
];

function pintarNavbar(){
  const cont=document.getElementById("navbar"); if(!cont) return;
  const aqui=(location.pathname.split("/").pop()||"index.html");
  cont.innerHTML=`
    <a class="nav-marca" href="index.html">
      <span class="nav-palabra">Tanteo</span>
    </a>
    <nav class="nav-links">
      ${PAGINAS.map(p=>`<a href="${p.href}" class="${p.href===aqui?"sel":""}">${p.t}</a>`).join("")}
    </nav>`;
}

function pintarPie(){
  const cont=document.getElementById("pie"); if(!cont) return;
  const D=typeof DATOS!=="undefined"?DATOS:{};
  cont.innerHTML=`
    <div class="pie-fila">
      <div>
        <b class="pie-marca">tanteo</b>
        <div class="pie-lema">La corazonada, en números.</div>
      </div>
      <nav class="pie-links">${PAGINAS.map(p=>`<a href="${p.href}">${p.t}</a>`).join("")}</nav>
    </div>
    <div class="pie-fila pie-abajo">
      <div>Datos: football-data.co.uk (resultados y cuotas de cierre) · ESPN (calendario y escudos) ·
        Open-Meteo (clima) · Google News (titulares).</div>
      <div>${D.torneo?`${D.torneo} · `:""}${D.generado?`generado ${D.generado}`:""}</div>
    </div>
    <div class="pie-acciones">
      <button type="button" id="btn-efectos" class="pie-boton"></button>
    </div>
    <div class="pie-aviso"><b>No predice resultados</b>: estima probabilidades y las compara contra la cuota.
      El modelo no le gana al mercado y el parlay multiplica el margen de la casa. Apuesta lo que puedas perder.</div>`;

  const b=document.getElementById("btn-efectos");
  if(b && typeof EFECTOS!=="undefined"){
    b.textContent = EFECTOS.quieto ? "Encender la mesa viva" : "Apagar la mesa viva";
    b.onclick = () => EFECTOS.alternar();
  } else if(b){ b.remove(); }
}

/* El parlay se guarda para que sobreviva al cambiar de página: la URL ya no
   basta porque ahora hay varias. La URL sigue mandando cuando trae algo,
   para que un link compartido siga funcionando. */
const LLAVE_PARLAY="tanteo.parlay";
function guardarParlay(){
  try{ localStorage.setItem(LLAVE_PARLAY, JSON.stringify(parlay)); }catch(e){}
}
function recuperarParlay(){
  if(location.hash.replace(/^#/,"")) return;          // la URL manda
  try{
    const g=JSON.parse(localStorage.getItem(LLAVE_PARLAY)||"[]");
    if(Array.isArray(g)) parlay=g.filter(x=>DATOS.partidos[x.i]&&MERCADOS[x.k]);
  }catch(e){}
}

/* Portada: tarjetas de acceso y un vistazo rápido. */
function pintarPortada(){
  const cont=document.getElementById("portada"); if(!cont) return;
  const prox=DATOS.partidos.filter(p=>!p.jugado);
  const jornada=prox.length?Math.min(...prox.filter(p=>typeof p.jornada==="number").map(p=>p.jornada)):null;
  const S=DATOS.simulador, T=S&&S.totales;
  const pesos=n=>(n<0?"−":"")+"$"+Math.abs(n).toFixed(0);
  const tarjetas=[
    {href:"partidos.html", t:"Partidos y resultados",
     d:"Las 17 jornadas con sus marcadores y, las que faltan, con probabilidades. Cómo llega cada equipo, cara a cara, clima y noticias.",
     pie: jornada?`Jornada ${jornada} · ${prox.filter(p=>p.jornada===jornada).length} por jugar`:"Torneo completo"},
    {href:"parlays.html", t:"Mejores parlays",
     d:"Todas las combinaciones de la jornada ordenadas por probabilidad, pago o valor. Arma la tuya y mira el valor esperado real.",
     pie:"Una apuesta por partido, nunca dos del mismo"},
    {href:"simulador.html", t:"Simulador",
     d:"Cada jornada el sistema aparta $100 virtuales en el mejor parlay y guarda el ticket. Después se resuelve solo contra el marcador.",
     pie: T&&T.resueltos?`${T.resueltos} resueltos · ${pesos(T.neto)}`:(T?`${T.pendientes} en juego`:"Sin tickets todavía")},
  ];
  cont.innerHTML=tarjetas.map(x=>`
    <a class="acceso" href="${x.href}">
      <b>${x.t}</b>
      <p>${x.d}</p>
      <span class="acceso-pie">${x.pie} <i>→</i></span>
    </a>`).join("");
}

function ocultarCarga(){const c=document.getElementById("cargando"); if(c) c.classList.add("listo");}

function arrancar(){
  /* red de seguridad: si algo fallara al pintar, la pantalla no se queda pegada */
  setTimeout(ocultarCarga,8000);
  pintarNavbar(); pintarMarca(); pintarPie();
  jornadaSel=proximaJornada();

  /* Cada sección va en su propio try: si una falla, las demás se pintan igual
     y la pantalla de carga no se queda puesta. */
  const seccion=(id,f)=>{ if(!document.getElementById(id)) return;
    try{ f(); }catch(e){ console.error("sección "+id+":", e); } };

  seccion("portada",           pintarPortada);
  seccion("tabs-jornada",      pintarTabs);
  seccion("partidos",          pintarPartidos);
  seccion("hero",              pintarHero);
  seccion("tabla-general",     pintarGenerales);
  seccion("tabla-mc",          pintarMontecarlo);
  seccion("bancas",            pintarBancas);
  seccion("influye",           pintarInfluye);
  seccion("tabla-estrategias", pintarEstrategias);
  seccion("tabla-factores",    pintarFactores);
  seccion("comparativa",       pintarComparativa);
  seccion("kpis",              pintarBacktest);
  seccion("simulador",         pintarSimulador);
  seccion("piernas",           ()=>{ recuperarParlay(); leerDeUrl(); pintarParlay(); });
  seccion("sugeridos",         pintarSugeridos);

  /* setTimeout y no requestAnimationFrame: rAF no corre en pestañas ocultas
     y la pantalla de carga se quedaría puesta hasta el respaldo. */
  /* Los efectos son decorado: si el archivo no cargó, la página va igual. */
  if (typeof EFECTOS !== "undefined") EFECTOS.iniciar();

  setTimeout(ocultarCarga,0);
}

document.addEventListener("DOMContentLoaded", arrancar);
