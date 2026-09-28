# Tanteo en el servidor

Qué hace cada archivo y en qué orden se usan.

| Archivo | Dónde corre | Para qué |
|---|---|---|
| `subir.sh` | en la Mac | copia el proyecto al VPS con rsync |
| `instalar.sh` | en el VPS, una vez | Python, dependencias, nginx y temporizadores |
| `nginx-tanteo.conf` | VPS | sirve `web/` en el puerto 80 |
| `tanteo-diario.*` | VPS | ciclo diario a las 07:20 (hora de México) |
| `tanteo-semanal.*` | VPS | backtest y estrategias, lunes 04:00 |

## Pasos

```bash
# 1. En la Mac: subir el proyecto
./servidor/subir.sh TU_IP

# 2. Entrar e instalar
ssh -i ~/.ssh/tanteo ubuntu@TU_IP
sudo bash /opt/tanteo/servidor/instalar.sh

# 3. Primer ciclo a mano, para ver que todo jala
cd /opt/tanteo && ./actualizar.sh --sin-abrir

# 4. Congelar las versiones que sí funcionaron en ARM
/opt/tanteo/venv/bin/pip freeze > /opt/tanteo/requirements.lock
```

Después, `http://TU_IP` debe mostrar la página.

## El puerto 80 se abre en DOS lados

Es el tropiezo clásico de Oracle y cuesta horas si no se sabe:

1. **En la instancia** — lo hace `instalar.sh` con iptables.
2. **En la consola de Oracle** — Networking → VCN → la subred → Security List →
   *Add Ingress Rule*: origen `0.0.0.0/0`, TCP, puerto destino `80`.

Con uno solo de los dos la página no responde y parece que el servidor murió.

## Ver cómo va

```bash
systemctl list-timers 'tanteo-*'        # cuándo corre la próxima
journalctl -u tanteo-diario -n 50       # qué pasó en el último ciclo
systemctl start tanteo-diario           # forzar un ciclo ahora
```

## Qué NO se sube

`datos/` se queda en la Mac: el servidor lo reconstruye solo en su primer
ciclo. La excepción es `datos/clima_historico/` (69 MB), que sí se manda
siempre porque se juntó a lo largo de muchas corridas y volver a pedírselo a
Open-Meteo es lento y descortés.

El libro del simulador (`datos/simulador.json`) es el que **no** hay que pisar:
en cuanto el servidor empiece a llevarlo, esa copia manda. Si algún día
resubes datos completos con `--datos`, vas a sobrescribirlo con el de la Mac.
