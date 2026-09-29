/* ═══════════════════════════════════════════════════════════════════════
   TANTEO · pasar por la intro al entrar

   La intro vive en index.html. El problema era que, una vez dentro, nada
   te regresaba: el logotipo del navbar apunta a inicio.html. Así que solo
   la veías la primerísima vez.

   Esto manda a la intro cuando entras al sitio, y no cuando navegas dentro
   de él. La marca vive en sessionStorage, o sea que muere al cerrar la
   pestaña: abrir el sitio de nuevo vuelve a repartir, pero moverse entre
   páginas —o recargar— no.

   Descartada la vía de mirar document.referrer: sobre file:// viene vacío
   siempre, así que la intro saldría en cada clic.

   Va en el <head> y sin `defer` a propósito: tiene que decidir antes de que
   se pinte nada, o se vería un destello de la página antes de saltar.
   ═══════════════════════════════════════════════════════════════════════ */

(function(){
  "use strict";
  var LLAVE = "tanteo.enmesa";

  var visto;
  try {
    visto = sessionStorage.getItem(LLAVE);
  } catch (e) {
    /* Navegación privada estricta: sessionStorage lanza al tocarlo. Sin
       memoria no hay forma de saber si ya pasamos por la intro, y redirigir
       a ciegas sería un bucle. Mejor quedarse. */
    return;
  }
  if (visto) return;

  var aqui = location.pathname.split("/").pop() || "inicio.html";
  /* replace y no assign: así el botón «atrás» no rebota entre la intro y
     la página. */
  location.replace("index.html?ir=" + encodeURIComponent(aqui));
})();
