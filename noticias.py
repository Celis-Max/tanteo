"""
Noticias por equipo desde el RSS de Google News (español, México) y detección de
señales en los titulares: bajas, lesiones, cambio de técnico, castigos, refuerzos,
ambiente de la afición.

Ojo: esto NO mueve las probabilidades solo. Es contexto para que quien apuesta
decida; la página tiene un ajuste manual para aplicar ese criterio.
"""
from __future__ import annotations

import html
import json
import re
import shutil
import subprocess
import urllib.parse
from datetime import datetime, timedelta
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
CACHE = RAIZ / "datos" / "noticias.json"

# Cómo se busca cada equipo en las noticias (el nombre de football-data no siempre sirve).
BUSQUEDA = {
    "Club America": "Club América", "Atlante": "Atlante", "Atlas": "Atlas FC",
    "Atl. San Luis": "Atlético de San Luis", "Cruz Azul": "Cruz Azul", "Juarez": "FC Juárez",
    "Guadalajara Chivas": "Chivas Guadalajara", "Club Leon": "Club León", "Monterrey": "Rayados Monterrey",
    "Necaxa": "Necaxa", "Pachuca": "Tuzos Pachuca", "Puebla": "Club Puebla", "UNAM Pumas": "Pumas UNAM",
    "Queretaro": "Gallos Blancos Querétaro", "Santos Laguna": "Santos Laguna", "Tigres UANL": "Tigres UANL",
    "Club Tijuana": "Xolos Tijuana", "Toluca": "Toluca FC", "Mazatlan FC": "Mazatlán FC",
}

SEÑALES = {
    "baja": (r"\b(baja|bajas|no jugará|no estará|se pierde el|fuera del partido|descartad)", "Posible baja"),
    "lesion": (r"\b(lesi[oó]n|lesionad|desgarr|esguince|rotura|molestias|entra al quir[oó]fano)", "Lesión"),
    "duda": (r"\b(duda|en veremos|podr[ií]a no|es baja sensible|reaparece|regresa|vuelve)", "Duda o regreso"),
    "castigo": (r"\b(suspendid|expulsad|sancion|castigo|veto|multa)", "Castigo o suspensión"),
    "tecnico": (r"\b(nuevo t[eé]cnico|cesad|destituid|renunci|interino|dt |director t[eé]cnico)", "Cambio en el banquillo"),
    "refuerzo": (r"\b(refuerzo|fichaje|llega a|presentad|debutar[aá])", "Refuerzo o debut"),
    "crisis": (r"\b(crisis|racha negativa|no gana|presi[oó]n|abucheo|silbad)", "Crisis o presión"),
    "afición": (r"\b(afici[oó]n|hinchada|boletos agotados|lleno|estadio lleno|porra|banderazo)", "Ambiente de la afición"),
    "clima": (r"\b(lluvia|tormenta|granizo|calor extremo|cancha pesada)", "Clima"),
}


def _bajar(url: str) -> str:
    if shutil.which("curl"):
        r = subprocess.run(["curl", "-sSL", "--max-time", "35", "-A", "Mozilla/5.0", url],
                           capture_output=True, text=True)
        if r.returncode == 0:
            return r.stdout
    return ""


def _titulares(equipo: str, dias: int = 7, maximo: int = 12) -> list[dict]:
    consulta = urllib.parse.quote(f'"{BUSQUEDA.get(equipo, equipo)}" when:{dias}d')
    xml = _bajar(f"https://news.google.com/rss/search?q={consulta}&hl=es-419&gl=MX&ceid=MX:es-419")
    if not xml:
        return []
    salida = []
    for item in re.findall(r"<item>(.*?)</item>", xml, re.S)[:maximo]:
        titulo = re.search(r"<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", item, re.S)
        enlace = re.search(r"<link>(.*?)</link>", item, re.S)
        fecha = re.search(r"<pubDate>(.*?)</pubDate>", item, re.S)
        fuente = re.search(r"<source[^>]*>(.*?)</source>", item, re.S)
        if not titulo:
            continue
        t = html.unescape(titulo.group(1)).strip()
        salida.append({
            "titulo": t,
            "enlace": enlace.group(1).strip() if enlace else "",
            "fuente": html.unescape(fuente.group(1)).strip() if fuente else "",
            "fecha": fecha.group(1)[:16] if fecha else "",
            "señales": señales_de(t),
        })
    return salida


def señales_de(texto: str) -> list[str]:
    t = texto.lower()
    return sorted({etiqueta for patron, etiqueta in SEÑALES.values() if re.search(patron, t)})


def de_equipos(equipos: list[str], refrescar: bool = False, horas_cache: int = 6) -> dict:
    """Titulares por equipo, con caché para no golpear el RSS a cada rato."""
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    ahora = datetime.now()
    for e in equipos:
        guardado = cache.get(e)
        if guardado and not refrescar:
            visto = datetime.fromisoformat(guardado["actualizado"])
            if ahora - visto < timedelta(hours=horas_cache):
                continue
        notas = _titulares(e)
        if notas or not guardado:
            cache[e] = {"actualizado": ahora.isoformat(timespec="seconds"), "titulares": notas}
    CACHE.parent.mkdir(exist_ok=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    # Archivo diario: no existe historia de titulares para probar si las noticias
    # anticipan algo que la cuota no tenga; guardándolas, en una temporada se podrá.
    archivo = CACHE.parent / "noticias_historial" / f"{ahora:%Y%m%d}.json"
    archivo.parent.mkdir(exist_ok=True)
    previo = json.loads(archivo.read_text(encoding="utf-8")) if archivo.exists() else {}
    previo.update({e: cache[e] for e in equipos if e in cache})
    archivo.write_text(json.dumps(previo, ensure_ascii=False), encoding="utf-8")
    return cache


def resumen(noticias: dict, equipo: str) -> dict:
    """Cuántas señales de cada tipo trae el equipo esta semana."""
    notas = (noticias.get(equipo) or {}).get("titulares", [])
    conteo: dict[str, int] = {}
    for n in notas:
        for s in n["señales"]:
            conteo[s] = conteo.get(s, 0) + 1
    return {"n": len(notas), "señales": conteo,
            "titulares": [n for n in notas if n["señales"]][:4] or notas[:3]}
