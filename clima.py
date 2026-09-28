"""
Clima de cada partido con Open-Meteo (sin llave): pronóstico para lo que viene y
archivo histórico para medir si de verdad afecta a los goles en Liga MX.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
CACHE = RAIZ / "datos" / "clima.json"

# Estadio de cada equipo (lat, lon, altitud en metros).
ESTADIOS = {
    "Club America":       (19.3029, -99.1505, 2250, "Estadio Azteca, CDMX"),
    "Atlante":            (19.7008, -99.1980, 2270, "Estadio Ciudad de los Deportes / Cancún"),
    "Atlas":              (20.6817, -103.4625, 1560, "Estadio Jalisco, Guadalajara"),
    "Atl. San Luis":      (22.1494, -100.9370, 1860, "Estadio Alfonso Lastras, San Luis Potosí"),
    "Cruz Azul":          (19.3029, -99.1505, 2250, "Estadio Azteca / CU, CDMX"),
    "Juarez":             (31.6904, -106.4245, 1140, "Estadio Olímpico Benito Juárez"),
    "Guadalajara Chivas": (20.6819, -103.4625, 1560, "Estadio Akron, Guadalajara"),
    "Club Leon":          (21.1222, -101.6820, 1815, "Estadio Nou Camp, León"),
    "Monterrey":          (25.6690, -100.2440, 540,  "Estadio BBVA, Monterrey"),
    "Necaxa":             (21.8790, -102.2870, 1880, "Estadio Victoria, Aguascalientes"),
    "Pachuca":            (20.1197, -98.7360, 2400, "Estadio Hidalgo, Pachuca"),
    "Puebla":             (19.0333, -98.2410, 2160, "Estadio Cuauhtémoc, Puebla"),
    "UNAM Pumas":         (19.3316, -99.1857, 2270, "Estadio Olímpico Universitario, CDMX"),
    "Queretaro":          (20.5980, -100.4020, 1820, "Estadio Corregidora, Querétaro"),
    "Santos Laguna":      (25.5630, -103.4110, 1120, "Estadio Corona, Torreón"),
    "Tigres UANL":        (25.7220, -100.3100, 500,  "Estadio Universitario, Monterrey"),
    "Club Tijuana":       (32.4740, -116.9270, 130,  "Estadio Caliente, Tijuana"),
    "Toluca":             (19.2920, -99.6540, 2660, "Estadio Nemesio Díez, Toluca"),
    "Mazatlan FC":        (23.2320, -106.4200, 10,   "Estadio El Encanto, Mazatlán"),
}


# Coordenadas por estadio: varios equipos comparten sede (el Azteca, hoy Banorte,
# lo usan América, Cruz Azul y Atlante), así que mandan sobre el equipo local.
SEDES = {
    "banorte": (19.3029, -99.1505, 2250, "Estadio Banorte (Azteca), CDMX"),
    "azteca": (19.3029, -99.1505, 2250, "Estadio Azteca, CDMX"),
    "olímpico universitario": (19.3316, -99.1857, 2270, "Estadio Olímpico Universitario, CDMX"),
    "ciudad de los deportes": (19.3960, -99.1790, 2240, "Estadio Ciudad de los Deportes, CDMX"),
    "akron": (20.6819, -103.4625, 1560, "Estadio Akron, Zapopan"),
    "jalisco": (20.7137, -103.3290, 1560, "Estadio Jalisco, Guadalajara"),
    "victoria": (21.8790, -102.2870, 1880, "Estadio Victoria, Aguascalientes"),
    "caliente": (32.4740, -116.9270, 130, "Estadio Caliente, Tijuana"),
    "libertad financiera": (22.1494, -100.9370, 1860, "Estadio Libertad Financiera, San Luis Potosí"),
    "alfonso lastras": (22.1494, -100.9370, 1860, "Estadio Alfonso Lastras, San Luis Potosí"),
    "benito juárez": (31.6904, -106.4245, 1140, "Estadio Olímpico Benito Juárez, Cd. Juárez"),
    "corregidora": (20.5980, -100.4020, 1820, "Estadio Corregidora, Querétaro"),
    "corona": (25.5630, -103.4110, 1120, "Estadio Corona, Torreón"),
    "bbva": (25.6690, -100.2440, 540, "Estadio BBVA, Monterrey"),
    "universitario": (25.7220, -100.3100, 500, "Estadio Universitario, Monterrey"),
    "hidalgo": (20.1197, -98.7360, 2400, "Estadio Hidalgo, Pachuca"),
    "cuauhtémoc": (19.0333, -98.2410, 2160, "Estadio Cuauhtémoc, Puebla"),
    "nemesio": (19.2920, -99.6540, 2660, "Estadio Nemesio Díez, Toluca"),
    "nou camp": (21.1222, -101.6820, 1815, "Estadio Nou Camp, León"),
    "león": (21.1222, -101.6820, 1815, "Estadio León"),
    "encanto": (23.2320, -106.4200, 10, "Estadio El Encanto, Mazatlán"),
    "kraken": (23.2320, -106.4200, 10, "Estadio El Kraken, Mazatlán"),
}


def sede_de(nombre_sede: str | None, equipo_local: str):
    """Coordenadas por nombre de estadio; si no se reconoce, las del equipo local."""
    if nombre_sede:
        n = nombre_sede.lower()
        for clave, datos in SEDES.items():
            if clave in n:
                return datos
    return ESTADIOS.get(equipo_local)


def _json_url(url: str) -> dict:
    if shutil.which("curl"):
        r = subprocess.run(["curl", "-sSL", "--max-time", "60", url], capture_output=True, text=True)
        if r.returncode == 0 and r.stdout.strip():
            return json.loads(r.stdout)
    import urllib.request, ssl
    ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(url, timeout=60, context=ctx) as resp:
        return json.loads(resp.read())


def _serie(lat: float, lon: float, desde: str, hasta: str, archivo: bool) -> dict:
    base = "https://archive-api.open-meteo.com/v1/archive" if archivo else "https://api.open-meteo.com/v1/forecast"
    url = (f"{base}?latitude={lat}&longitude={lon}&start_date={desde}&end_date={hasta}"
           f"&hourly=temperature_2m,precipitation,wind_speed_10m,relative_humidity_2m&timezone=America%2FMexico_City")
    return _json_url(url)


def clima_de(equipo_local: str, fecha: str, hora: str, archivo: bool | None = None, sede_nombre: str | None = None) -> dict | None:
    """Clima a la hora del partido, en el estadio donde se juega."""
    sede = sede_de(sede_nombre, equipo_local)
    if not sede:
        return None
    lat, lon, alt, nombre = sede
    if archivo is None:
        archivo = datetime.fromisoformat(fecha) < datetime.now()
    try:
        d = _serie(lat, lon, fecha, fecha, archivo)
        horas = d["hourly"]["time"]
        objetivo = f"{fecha}T{(hora or '20:00')[:2]}:00"
        i = horas.index(objetivo) if objetivo in horas else min(range(len(horas)),
            key=lambda k: abs(int(horas[k][11:13]) - int((hora or "20")[:2])))
        return {
            "estadio": nombre, "altitud": alt,
            "temperatura": d["hourly"]["temperature_2m"][i],
            "lluvia": d["hourly"]["precipitation"][i],
            "viento": d["hourly"]["wind_speed_10m"][i],
            "humedad": d["hourly"]["relative_humidity_2m"][i],
        }
    except Exception:
        return None


def clima_de_varios(partidos: list[dict], refrescar: bool = False) -> dict:
    """Clima para una lista de partidos [{local, fecha, hora}], con caché en disco."""
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() and not refrescar else {}
    for p in partidos:
        clave = f"{p['local']}|{p['fecha']}|{p.get('hora','')}"
        if clave in cache:
            continue
        c = clima_de(p["local"], p["fecha"], p.get("hora", ""), sede_nombre=p.get("sede"))
        if c:
            cache[clave] = c
    CACHE.parent.mkdir(exist_ok=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    return cache


def descripcion(c: dict) -> str:
    if not c:
        return ""
    partes = [f"{c['temperatura']:.0f}°C"]
    if c["lluvia"] >= 2:   partes.append("lluvia fuerte")
    elif c["lluvia"] >= 0.3: partes.append("lluvia ligera")
    if c["viento"] >= 25:  partes.append(f"viento {c['viento']:.0f} km/h")
    if c["altitud"] >= 2200: partes.append(f"altura {c['altitud']} m")
    return " · ".join(partes)
