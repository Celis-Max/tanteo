#!/usr/bin/env bash
# Baja todo lo nuevo (resultados, cuotas, clima, noticias) y recalcula la página.
#
# Corre igual en la Mac y en el servidor. La diferencia es el final: en la Mac
# abre la página; en el servidor no hay navegador que abrir, así que no lo hace.
# Antes era un script de zsh con `open`, que en Linux truena.
#
#   ./actualizar.sh              ciclo diario
#   ./actualizar.sh --backtest   además revalida el modelo (varios minutos)
#   ./actualizar.sh --sin-abrir  no abre el navegador aunque haya
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Si existe un entorno virtual propio, se usa. En el servidor lo habrá.
if [ -x "venv/bin/python" ]; then
  PY="venv/bin/python"
else
  PY="$(command -v python3)"
fi

CON_BACKTEST=0
ABRIR=1
for arg in "$@"; do
  case "$arg" in
    --backtest)  CON_BACKTEST=1 ;;
    --sin-abrir) ABRIR=0 ;;
  esac
done
# Sin terminal interactiva (cron, systemd) no hay a quién abrirle nada.
[ -t 1 ] || ABRIR=0

# Las fuentes externas se caen o cambian de formato de vez en cuando. Que una
# falle no debe tirar el ciclo: hay datos en caché y la página se puede
# regenerar igual. Se avisa y se sigue; el fallo queda en el journal.
paso_blando(){
  local nombre="$1"; shift
  # Con llaves: sin ellas, bash se traga los bytes de "…" como parte del nombre.
  echo "→ ${nombre}…"
  if ! "$@"; then
    echo "  ⚠ falló $nombre; se sigue con lo que ya había en caché."
    FALLOS=$((FALLOS + 1))
  fi
}
FALLOS=0

paso_blando "resultados y cuotas" \
  "$PY" -c "import datos; datos.descargar()"

paso_blando "calendario del torneo (ESPN)" \
  "$PY" -c "import calendario; d=calendario.descargar(); print('  ', sum(1 for p in d['partidos'] if p['jugado']), 'jugados de', len(d['partidos']))"

echo "→ Monte Carlo del torneo (20,000 simulaciones)…"
"$PY" montecarlo.py 20000 > /dev/null

echo "→ estadísticas, clima y noticias…"
"$PY" generar.py --refrescar

if [ "$CON_BACKTEST" = "1" ]; then
  echo "→ revalidando modelo, estrategias y factores (varios minutos)…"
  "$PY" backtest.py --refrescar
  "$PY" estrategias.py
  "$PY" analisis_contexto.py
  "$PY" analisis_clima.py
  "$PY" analisis_aficion.py
  "$PY" generar.py
fi

if [ "$ABRIR" = "1" ] && command -v open >/dev/null 2>&1; then
  open web/index.html
fi

if [ "$FALLOS" -gt 0 ]; then
  echo "✓ listo con $FALLOS fuente(s) caída(s) · $(date '+%Y-%m-%d %H:%M')"
else
  echo "✓ listo · $(date '+%Y-%m-%d %H:%M')"
fi
