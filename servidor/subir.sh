#!/usr/bin/env bash
# Sube el proyecto de la Mac al servidor. Se corre EN LA MAC.
#
#   ./servidor/subir.sh 123.45.67.89            sube el código (rápido)
#   ./servidor/subir.sh 123.45.67.89 --datos    sube también datos/ (84 MB)
#
# Por defecto NO sube datos/ porque el servidor los reconstruye solo en su
# primer ciclo. La excepción que sí conviene mandar es el clima histórico:
# son 69 MB que se bajaron a lo largo de muchas corridas y volver a pedirlos
# a Open-Meteo es lento y descortés.
set -euo pipefail

IP="${1:-}"
[ -n "$IP" ] || { echo "Uso: $0 IP_DEL_SERVIDOR [--datos]"; exit 1; }
LLAVE="${LLAVE_SSH:-$HOME/.ssh/tanteo}"
USUARIO=ubuntu
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

command -v rsync >/dev/null || { echo "Falta rsync."; exit 1; }
[ -f "$LLAVE" ] || { echo "No encuentro la llave $LLAVE"; exit 1; }

SSH="ssh -i $LLAVE -o StrictHostKeyChecking=accept-new"

echo "→ preparando /opt/tanteo…"
$SSH "$USUARIO@$IP" "sudo mkdir -p /opt/tanteo && sudo chown $USUARIO:$USUARIO /opt/tanteo"

echo "→ subiendo código…"
rsync -az --delete -e "$SSH" \
  --exclude '.git' --exclude '__pycache__' --exclude 'venv' \
  --exclude 'datos' --exclude '*.pyc' \
  "$RAIZ"/ "$USUARIO@$IP:/opt/tanteo/"

# El clima histórico siempre: es caro de volver a bajar.
echo "→ subiendo clima histórico…"
$SSH "$USUARIO@$IP" "mkdir -p /opt/tanteo/datos"
rsync -az -e "$SSH" "$RAIZ/datos/clima_historico/" \
  "$USUARIO@$IP:/opt/tanteo/datos/clima_historico/"

if [ "${2:-}" = "--datos" ]; then
  echo "→ subiendo datos/ completo (84 MB)…"
  rsync -az -e "$SSH" --exclude 'clima_historico' \
    "$RAIZ/datos/" "$USUARIO@$IP:/opt/tanteo/datos/"
fi

$SSH "$USUARIO@$IP" "chmod +x /opt/tanteo/actualizar.sh /opt/tanteo/servidor/*.sh"
echo "✓ subido a $IP:/opt/tanteo"
