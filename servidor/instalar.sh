#!/usr/bin/env bash
# Deja el servidor listo: Python, dependencias, nginx y los temporizadores.
# Se corre UNA vez, ya dentro del VPS, con el proyecto copiado en /opt/tanteo.
#
#   sudo bash /opt/tanteo/servidor/instalar.sh
#
# Es idempotente: volver a correrlo no rompe nada.
set -euo pipefail

RAIZ=/opt/tanteo
USUARIO=ubuntu

[ -d "$RAIZ" ] || { echo "No existe $RAIZ. Copia el proyecto primero."; exit 1; }

echo "→ paquetes del sistema…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq python3 python3-venv python3-pip nginx tzdata

echo "→ zona horaria en hora de México…"
timedatectl set-timezone America/Mexico_City || true

# ── Memoria de intercambio ───────────────────────────────────────────────
# Con los 12 GB de la A1.Flex esto sobra: Tanteo llega a 230 MB en su punto
# más alto (medido). Se deja porque no estorba —swappiness en 10, así que no
# se toca salvo apuro real— y porque el día que haya que rehacer la instancia
# puede tocar una E2.1.Micro de 1 GB, donde sí es la diferencia entre que el
# ciclo termine o que el kernel lo mate a media madrugada.
if ! swapon --show | grep -q '/swapfile'; then
  echo "→ creando 2 GB de memoria de intercambio…"
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  # Que use el swap solo cuando de verdad haga falta, no por costumbre.
  sysctl -w vm.swappiness=10 >/dev/null
  grep -q 'vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
fi

echo "→ entorno virtual y dependencias…"
sudo -u "$USUARIO" python3 -m venv "$RAIZ/venv"
sudo -u "$USUARIO" "$RAIZ/venv/bin/pip" install --upgrade pip -q
sudo -u "$USUARIO" "$RAIZ/venv/bin/pip" install -q -r "$RAIZ/requirements.txt"
echo "   $("$RAIZ/venv/bin/python" -V) · paquetes instalados"

echo "→ nginx…"
cp "$RAIZ/servidor/nginx-tanteo.conf" /etc/nginx/sites-available/tanteo
ln -sf /etc/nginx/sites-available/tanteo /etc/nginx/sites-enabled/tanteo
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

echo "→ temporizadores…"
cp "$RAIZ"/servidor/tanteo-*.service /etc/systemd/system/
cp "$RAIZ"/servidor/tanteo-*.timer   /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now tanteo-diario.timer tanteo-semanal.timer

# ── El tropiezo clásico de Oracle ────────────────────────────────────────
# Abrir el puerto en la security list de la VCN no basta: las imágenes de
# Ubuntu en OCI traen reglas de iptables que tiran el tráfico igual. Sin
# esto la web no responde y parece que el servidor está muerto.
echo "→ abriendo el puerto 80 en el cortafuegos de la instancia…"
iptables -I INPUT 5 -p tcp --dport 80 -j ACCEPT || true
if command -v netfilter-persistent >/dev/null 2>&1; then
  netfilter-persistent save || true
else
  apt-get install -y -qq iptables-persistent && netfilter-persistent save || true
fi

echo
echo "✓ listo."
echo "  Falta abrir el puerto 80 también en la security list de la VCN,"
echo "  desde la consola de Oracle. Con uno solo de los dos NO funciona."
echo
systemctl list-timers 'tanteo-*' --no-pager || true
