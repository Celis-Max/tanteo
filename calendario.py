"""
Calendario completo del torneo desde ESPN (sin llave de API): todas las jornadas,
las jugadas con su marcador y las que faltan sin resultado.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from datetime import datetime, timedelta
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
CACHE = RAIZ / "datos" / "calendario.json"
BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/mex.1"

# ESPN usa otros nombres que football-data; aquí se emparejan.
NOMBRES = {
    "América": "Club America", "Atlante": "Atlante", "Atlas": "Atlas",
    "Atlético de San Luis": "Atl. San Luis", "Cruz Azul": "Cruz Azul", "FC Juarez": "Juarez",
    "Guadalajara": "Guadalajara Chivas", "León": "Club Leon", "Monterrey": "Monterrey",
    "Necaxa": "Necaxa", "Pachuca": "Pachuca", "Puebla": "Puebla", "Pumas UNAM": "UNAM Pumas",
    "Querétaro": "Queretaro", "Santos": "Santos Laguna", "Tigres UANL": "Tigres UANL",
    "Tijuana": "Club Tijuana", "Toluca": "Toluca", "Mazatlán FC": "Mazatlan FC",
}


def _json(url: str) -> dict:
    if shutil.which("curl"):
        r = subprocess.run(["curl", "-sSL", "--max-time", "45", url], capture_output=True, text=True)
        if r.returncode == 0 and r.stdout.strip():
            return json.loads(r.stdout)
    import urllib.request, ssl
    ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(url, timeout=45, context=ctx) as resp:
        return json.loads(resp.read())


def _evento(e: dict) -> dict | None:
    c = e["competitions"][0]
    equipos = {x["homeAway"]: x for x in c["competitors"]}
    if "home" not in equipos or "away" not in equipos:
        return None
    local = NOMBRES.get(equipos["home"]["team"]["displayName"], equipos["home"]["team"]["displayName"])
    visita = NOMBRES.get(equipos["away"]["team"]["displayName"], equipos["away"]["team"]["displayName"])
    estado = c["status"]["type"]
    jugado = estado.get("completed", False)
    sede = (c.get("venue") or {})
    return {
        "fecha": e["date"][:10], "hora": e["date"][11:16], "utc": e["date"],
        "local": local, "visita": visita,
        "jugado": jugado,
        "gl": int(equipos["home"].get("score") or 0) if jugado else None,
        "gv": int(equipos["away"].get("score") or 0) if jugado else None,
        "estado": estado.get("description", ""),
        "sede": sede.get("fullName", ""), "ciudad": (sede.get("address") or {}).get("city", ""),
        "forma_local": equipos["home"].get("form", ""), "forma_visita": equipos["away"].get("form", ""),
        "asistencia": c.get("attendance") or 0,
    }


def descargar() -> dict:
    tablero = _json(f"{BASE}/scoreboard")
    liga = tablero["leagues"][0]
    fechas = [d[:10].replace("-", "") for d in liga.get("calendar", [])]
    partidos = []
    for f in fechas:
        try:
            d = _json(f"{BASE}/scoreboard?dates={f}")
        except Exception:
            continue
        for e in d.get("events", []):
            p = _evento(e)
            if p:
                partidos.append(p)
    partidos.sort(key=lambda p: p["utc"])
    datos = {
        "torneo": liga["season"].get("slug", "").replace("-", " ").title() or "Torneo",
        "anio": liga["season"].get("year"),
        "descargado": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "partidos": asignar_jornadas(partidos),
    }
    CACHE.parent.mkdir(exist_ok=True)
    CACHE.write_text(json.dumps(datos, ensure_ascii=False), encoding="utf-8")
    return datos


def asignar_jornadas(partidos: list[dict]) -> list[dict]:
    """
    La API no numera las jornadas, así que se reconstruyen. En un torneo de todos
    contra todos cada jornada es un emparejamiento perfecto: los 18 equipos juegan
    una vez. Se van extrayendo esos emparejamientos en orden de fecha (con vuelta
    atrás cuando un camino no cierra), así los partidos pospuestos caen en la
    jornada que les tocaba y no inventan jornadas nuevas.
    """
    if not partidos:
        return partidos
    equipos = {e for p in partidos for e in (p["local"], p["visita"])}
    restantes = sorted(partidos, key=lambda p: p["utc"])

    def extraer(disponibles: list[dict], ventana: int | None) -> list[dict] | None:
        """
        Busca una jornada completa entre los partidos que quedan, dando prioridad
        a los que se juegan cerca del arranque de esa jornada ([ventana] días).
        """
        objetivo = len(equipos) if len(disponibles) * 2 >= len(equipos) else 0
        if not objetivo:
            return disponibles[:]                      # cola final: lo que sobre
        ancla = datetime.fromisoformat(disponibles[0]["fecha"])
        def lejania(p):
            return abs((datetime.fromisoformat(p["fecha"]) - ancla).days)
        if ventana is not None:
            disponibles = [p for p in disponibles if lejania(p) <= ventana]
            if len(disponibles) * 2 < objetivo:
                return None

        def dfs(usados: set[str], elegidos: list[dict], desde: int):
            if len(usados) == objetivo:
                return elegidos
            # el equipo libre con menos opciones primero: evita caminos muertos
            libres = equipos - usados
            mejor, candidatos = None, None
            for e in libres:
                opciones = [p for p in disponibles if e in (p["local"], p["visita"])
                            and p["local"] not in usados and p["visita"] not in usados
                            and p not in elegidos]
                opciones.sort(key=lejania)
                if candidatos is None or len(opciones) < len(candidatos):
                    mejor, candidatos = e, opciones
                if not opciones:
                    break
            if not candidatos:
                return None
            for p in candidatos:
                r = dfs(usados | {p["local"], p["visita"]}, elegidos + [p], desde)
                if r:
                    return r
            return None

        return dfs(set(), [], 0)

    jornada = 0
    while restantes:
        jornada += 1
        ronda = next((r for v in (4, 8, 15, 30, None) if (r := extraer(restantes, v))), None)
        if not ronda:
            ronda = restantes[:]                      # por si el calendario no es regular
        for p in ronda:
            p["jornada"] = jornada
        restantes = [p for p in restantes if p not in ronda]

    partidos.sort(key=lambda p: (p["jornada"], p["utc"]))
    return partidos


def cargar(refrescar: bool = False) -> dict:
    if CACHE.exists() and not refrescar:
        return json.loads(CACHE.read_text(encoding="utf-8"))
    return descargar()


def tabla_general(partidos: list[dict]) -> list[dict]:
    """Tabla de posiciones con lo que ya se jugó."""
    t: dict[str, dict] = {}
    for p in partidos:
        if not p["jugado"]:
            continue
        for e, gf, gc, casa in ((p["local"], p["gl"], p["gv"], True), (p["visita"], p["gv"], p["gl"], False)):
            r = t.setdefault(e, {"equipo": e, "jj": 0, "g": 0, "e": 0, "p": 0, "gf": 0, "gc": 0, "pts": 0,
                                 "casa_pts": 0, "fuera_pts": 0, "ultimos": []})
            r["jj"] += 1; r["gf"] += gf; r["gc"] += gc
            pts = 3 if gf > gc else (1 if gf == gc else 0)
            r["pts"] += pts
            r["casa_pts" if casa else "fuera_pts"] += pts
            r["g" if gf > gc else ("e" if gf == gc else "p")] += 1
            r["ultimos"].append("G" if gf > gc else ("E" if gf == gc else "P"))
    for r in t.values():
        r["dif"] = r["gf"] - r["gc"]
        r["ultimos"] = r["ultimos"][-5:]
    return sorted(t.values(), key=lambda r: (-r["pts"], -r["dif"], -r["gf"]))


if __name__ == "__main__":
    d = descargar()
    jugados = sum(1 for p in d["partidos"] if p["jugado"])
    jornadas = max((p["jornada"] for p in d["partidos"]), default=0)
    print(f"{d['torneo']} {d['anio']}: {len(d['partidos'])} partidos, {jornadas} jornadas, {jugados} jugados")
    for j in range(1, jornadas + 1):
        ps = [p for p in d["partidos"] if p["jornada"] == j]
        print(f"  J{j:2d}: {len(ps)} partidos · {sum(1 for p in ps if p['jugado'])} jugados · {ps[0]['fecha']}")
