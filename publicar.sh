#!/usr/bin/env bash
# Publica web/ en GitHub Pages (rama gh-pages de Celis-Max/tanteo).
#
#   ./publicar.sh              publica lo que haya en web/
#   ./publicar.sh --actualizar corre antes el ciclo de datos
#
# La rama gh-pages se rehace entera en cada publicación, con un commit
# huérfano y push forzado. Es a propósito: `datos.js` pesa 648 KB y cambia
# a diario, así que un historial de verdad haría crecer el repo cientos de
# megas al año sin que nadie fuera a consultar esas versiones. Lo que sí
# tiene historia es el código, que vive en `main`.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

REPO="https://github.com/Celis-Max/tanteo.git"

if [ "${1:-}" = "--actualizar" ]; then
  ./actualizar.sh --sin-abrir
fi

[ -s web/datos.js ] || { echo "✗ web/datos.js no existe o está vacío. Corre ./actualizar.sh primero."; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp -R web/. "$TMP/"
# Sin esto Pages pasa el sitio por Jekyll, que se salta las carpetas que
# empiezan con guion bajo.
touch "$TMP/.nojekyll"

cd "$TMP"
git init -q
git add -A
git commit -q -m "Sitio de Tanteo · $(date '+%Y-%m-%d %H:%M')"
git push -q --force "$REPO" HEAD:gh-pages

echo "✓ publicado · https://celis-max.github.io/tanteo/"
echo "  (Pages tarda de uno a dos minutos en servir la versión nueva)"
