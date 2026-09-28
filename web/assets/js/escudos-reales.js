/* ═══════════════════════════════════════════════════════════════════════
   TANTEO · escudos de verdad

   La plantilla dibuja cada equipo como un banderín: un `clip-path` con los
   dos colores del club. Se ve bien, pero no es el escudo. Y los escudos
   reales ya venían en `datos.js` desde hace tiempo —`escudos.py` los baja
   de la API de ESPN y los incrusta como data URI—, solo que la plantilla
   nueva nunca los usó.

   Primero intenté sustituirlos recorriendo el DOM, leyendo la abreviatura
   del propio banderín. No funciona: la plantilla los dibuja VACÍOS, solo
   con color, así que en la página no queda nada que diga de qué equipo es.
   Por eso esto es una función, y se llama desde donde sí se sabe el nombre.

   Si un equipo no tiene escudo se devuelve su banderín de siempre. El
   respaldo es el diseño original, no un hueco.
   ═══════════════════════════════════════════════════════════════════════ */

var escudo = (function(){
  "use strict";

  var ESC = (typeof DATOS !== "undefined" && DATOS.escudos) ? DATOS.escudos : {};

  var ABR = {
    "Club America":"AME","Atlante":"ATE","Atlas":"ATL","Atl. San Luis":"SLU",
    "Cruz Azul":"CAZ","Juarez":"JUA","Guadalajara Chivas":"GDL","Club Leon":"LEO",
    "Monterrey":"MTY","Necaxa":"NEC","Pachuca":"PAC","Puebla":"PUE",
    "UNAM Pumas":"PUM","Queretaro":"QRO","Santos Laguna":"SAN","Tigres UANL":"TIG",
    "Club Tijuana":"TIJ","Toluca":"TOL","Mazatlan FC":"MAZ"
  };

  function esc(t){ return String(t).replace(/"/g, "&quot;"); }

  function abrev(nombre){
    return ABR[nombre] || String(nombre || "").replace(/[^A-Za-zÁÉÍÓÚÑ]/g, "").slice(0,3).toUpperCase();
  }

  /* nombre  : equipo tal como viene en datos.js
     clase   : "s" u otra variante de la plantilla, o nada
     estilo  : CSS extra en línea (tamaños, márgenes) */
  function f(nombre, clase, estilo){
    var e = ESC[nombre] || {};
    var cls = "crest" + (clase ? " " + clase : "");
    var st  = estilo || "";

    if (e.img){
      return '<span class="' + cls + ' con-escudo" title="' + esc(nombre) + '" style="' + st + '">' +
             '<img src="' + e.img + '" alt="' + esc(nombre) + '"></span>';
    }
    var c  = e.color  || "#1F5E47";
    var c2 = e.color2 || "#F3EFE6";
    return '<span class="' + cls + '" style="background:linear-gradient(135deg,' + c + ' 50%,' + c2 + ' 50%);' + st + '">' + abrev(nombre) + '</span>';
  };

  f.abrev = abrev;
  return f;
})();

/* ── Segunda vía: el simulador ────────────────────────────────────────
   simulador.html no tiene un archivo propio que pinte; se dibuja con el
   motor de plantillas de la plantilla (`{{m.hs}}`, `{{m.hc}}`…), y meterle
   mano exigiría reescribir su componente entero.

   Pero ahí los banderines SÍ llevan la abreviatura como texto —al revés
   que en las demás páginas, donde están vacíos—, así que basta con
   recorrer el DOM y cambiarlos. Esto no sirve como método general, por eso
   arriba está la función; aquí es un complemento para lo que ya se pintó. */
(function(){
  "use strict";
  var ESC = (typeof DATOS !== "undefined" && DATOS.escudos) ? DATOS.escudos : {};
  if (!Object.keys(ESC).length) return;

  var POR_ABR = {};
  Object.keys(ESC).forEach(function(nombre){
    POR_ABR[escudo.abrev(nombre)] = nombre;
  });

  function pintar(){
    var l = document.querySelectorAll(".crest:not(.con-escudo)");
    for (var i = 0; i < l.length; i++){
      var el = l[i];
      var nombre = POR_ABR[(el.textContent || "").trim().toUpperCase()];
      var e = nombre && ESC[nombre];
      if (!e || !e.img) continue;      // sin marcar: puede llegar con texto más tarde
      el.className += " con-escudo";
      el.title = nombre;
      el.innerHTML = '<img src="' + e.img + '" alt="' + nombre + '">';
    }
  }

  pintar();
  document.addEventListener("DOMContentLoaded", pintar);
  /* Cambiar el innerHTML de un banderín es una mutación de childList y
     vuelve a disparar esto, pero la segunda pasada ya no lo encuentra
     (lleva `con-escudo`) y ahí se detiene. */
  new MutationObserver(pintar).observe(document.documentElement, { childList: true, subtree: true });
})();
