"""
Simulador de parlays: cada jornada el sistema aparta 100 pesos virtuales en el
parlay de mayor probabilidad y guarda el ticket en `datos/simulador.json`.

Es un libro que solo crece. Un ticket se escribe UNA vez, con las probabilidades
que había antes de que se jugara la jornada, y después solo se resuelve contra el
marcador real. Nunca se reescribe: reescribirlo sería mirar el futuro, que es
justo lo que el resto del proyecto se cuida de no hacer.

Por lo mismo no se rellenan jornadas viejas. El modelo se ajusta con todo el
histórico, así que hoy ya "sabe" cómo terminaron; un ticket inventado para la
jornada 3 no sería una apuesta, sería una trampa. El libro arranca en la primera
jornada que estaba por jugarse cuando se corrió esto por primera vez.

Las piernas se eligen con el mismo criterio que la página (`generarParlays` en
`web/comun.js`): una apuesta por partido, mercados con probabilidad entre
45% y 95%, las 3 mejores de cada partido, y de todas las combinaciones la de
mayor probabilidad.
"""
from __future__ import annotations

import json
from itertools import combinations, product
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
RUTA = RAIZ / "datos" / "simulador.json"

MONTO = 100          # lo que se apuesta por jornada
PIERNAS = 2          # tu propio backtest: 2 piernas es la que menos pierde
PROB_MIN = 0.45      # mismos cortes que la página
PROB_MAX = 0.95
POR_PARTIDO = 3      # cuántas apuestas se consideran de cada partido

# Cada mercado sabe leer un marcador y decir si pegó. (a = goles local, b = visita)
MERCADOS = {
    "1":      ("Gana local",        lambda a, b: a > b),
    "X":      ("Empate",            lambda a, b: a == b),
    "2":      ("Gana visita",       lambda a, b: a < b),
    "1X":     ("Local o empate",    lambda a, b: a >= b),
    "12":     ("No hay empate",     lambda a, b: a != b),
    "X2":     ("Visita o empate",   lambda a, b: a <= b),
    "O15":    ("Más de 1.5 goles",  lambda a, b: a + b > 1),
    "U15":    ("Menos de 1.5",      lambda a, b: a + b < 2),
    "O25":    ("Más de 2.5 goles",  lambda a, b: a + b > 2),
    "U25":    ("Menos de 2.5",      lambda a, b: a + b < 3),
    "O35":    ("Más de 3.5 goles",  lambda a, b: a + b > 3),
    "U35":    ("Menos de 3.5",      lambda a, b: a + b < 4),
    "BTTS":   ("Ambos anotan",      lambda a, b: a > 0 and b > 0),
    "NOBTTS": ("No ambos anotan",   lambda a, b: a == 0 or b == 0),
}


def clave(p: dict) -> str:
    """Identifica un partido entre corridas. No hay id en los datos, así que se
    arma con jornada, fecha y los dos equipos."""
    return f"{p['jornada']}|{p['fecha']}|{p['local']}|{p['visita']}"


def nombre_apuesta(k: str, p: dict) -> str:
    """'Gana local' → 'Gana Toluca', para que la pierna se lea sola."""
    n = MERCADOS[k][0]
    return n.replace("local", p["local"]).replace("visita", p["visita"])


def probs_de(p: dict) -> dict:
    """Probabilidad de cada mercado sumando las casillas de la matriz de marcadores.

    Se deriva de la matriz y no del campo `probabilidades` porque es lo que hace
    `probsDe()` en la página: el campo viene del ensamble y difiere hasta 0.4
    puntos. Si el simulador usara otro número podría elegir un parlay distinto al
    que la página muestra como el mejor, y la sección dejaría de cuadrar.
    """
    M = p.get("matriz_ajustada") or p.get("matriz")
    if not M:
        return p.get("probabilidades", {})
    return {
        k: sum(M[a][b] for a in range(len(M)) for b in range(len(M[a])) if f(a, b))
        for k, (_, f) in MERCADOS.items()
    }


def candidatos(partidos: list[dict], jornada) -> list[dict]:
    """Partidos por jugar de esa jornada, cada uno con sus mejores apuestas."""
    salida = []
    for p in partidos:
        if p["jugado"] or p["jornada"] != jornada:
            continue
        P = probs_de(p)
        if not P:
            continue
        opciones = [
            {"k": k, "prob": P[k]}
            for k in MERCADOS
            if k in P and PROB_MIN <= P[k] <= PROB_MAX
        ]
        opciones.sort(key=lambda o: -o["prob"])
        if opciones:
            salida.append({"p": p, "opciones": opciones[:POR_PARTIDO]})
    return salida


def mejor_parlay(cands: list[dict], piernas: int = PIERNAS) -> dict | None:
    """De todas las combinaciones (una apuesta por partido, nunca dos del mismo
    para no caer en la correlación), la de mayor probabilidad."""
    if len(cands) < piernas:
        return None
    mejor = None
    for grupo in combinations(cands, piernas):
        for eleccion in product(*[m["opciones"] for m in grupo]):
            prob = 1.0
            for o in eleccion:
                prob *= o["prob"]
            if mejor is None or prob > mejor["prob"]:
                mejor = {
                    "prob": prob,
                    "piernas": [
                        {
                            "partido": clave(m["p"]),
                            "local": m["p"]["local"],
                            "visita": m["p"]["visita"],
                            "fecha": m["p"]["fecha"],
                            "mercado": o["k"],
                            "apuesta": nombre_apuesta(o["k"], m["p"]),
                            "prob": round(o["prob"], 5),
                        }
                        for m, o in zip(grupo, eleccion)
                    ],
                }
    return mejor


def jornada_apostable(partidos: list[dict]):
    """La primera jornada que todavía tiene partidos por jugar."""
    pendientes = [p["jornada"] for p in partidos
                  if not p["jugado"] and isinstance(p["jornada"], int)]
    return min(pendientes) if pendientes else None


def _leer(ruta: Path) -> dict:
    if ruta.exists():
        return json.loads(ruta.read_text(encoding="utf-8"))
    return {"criterio": "mayor probabilidad", "piernas": PIERNAS, "monto": MONTO,
            "pago": "cuota justa", "tickets": []}


def _resolver(ticket: dict, por_clave: dict) -> bool:
    """Intenta cerrar un ticket pendiente. Devuelve True si lo cerró."""
    marcadores = []
    for pierna in ticket["piernas"]:
        p = por_clave.get(pierna["partido"])
        if p is None or not p["jugado"] or p.get("gl") is None:
            return False
        marcadores.append((p["gl"], p["gv"]))

    todas = True
    for pierna, (gl, gv) in zip(ticket["piernas"], marcadores):
        pego = bool(MERCADOS[pierna["mercado"]][1](gl, gv))
        pierna["marcador"] = f"{gl}-{gv}"
        pierna["pego"] = pego
        todas = todas and pego

    ticket["estado"] = "ganado" if todas else "perdido"
    ticket["pago"] = round(ticket["monto"] * ticket["cuota_justa"], 2) if todas else 0.0
    ticket["neto"] = round(ticket["pago"] - ticket["monto"], 2)
    return True


def actualizar(datos: dict, ruta: Path = RUTA) -> dict:
    """Resuelve lo pendiente y, si falta, abre el ticket de la jornada en curso."""
    libro = _leer(ruta)
    partidos = datos["partidos"]
    por_clave = {clave(p): p for p in partidos}

    for ticket in libro["tickets"]:
        if ticket["estado"] == "pendiente":
            _resolver(ticket, por_clave)

    jornada = jornada_apostable(partidos)
    ya = {t["jornada"] for t in libro["tickets"]}
    if jornada is not None and jornada not in ya:
        mejor = mejor_parlay(candidatos(partidos, jornada))
        if mejor:
            libro["tickets"].append({
                "jornada": jornada,
                "creado": datos.get("generado", "")[:10],
                "estado": "pendiente",
                "monto": MONTO,
                "prob": round(mejor["prob"], 5),
                "cuota_justa": round(1 / mejor["prob"], 4),
                "piernas": mejor["piernas"],
                "pago": None,
                "neto": None,
            })

    libro["tickets"].sort(key=lambda t: t["jornada"])

    # Totales y banca corrida, solo sobre lo ya resuelto.
    banca, resueltos, ganados, invertido, devuelto = 0.0, 0, 0, 0.0, 0.0
    for t in libro["tickets"]:
        if t["estado"] == "pendiente":
            t["banca"] = round(banca, 2)
            continue
        resueltos += 1
        ganados += t["estado"] == "ganado"
        invertido += t["monto"]
        devuelto += t["pago"]
        banca += t["neto"]
        t["banca"] = round(banca, 2)

    libro["totales"] = {
        "tickets": len(libro["tickets"]),
        "resueltos": resueltos,
        "ganados": ganados,
        "pendientes": len(libro["tickets"]) - resueltos,
        "invertido": round(invertido, 2),
        "devuelto": round(devuelto, 2),
        "neto": round(devuelto - invertido, 2),
        "yield": round((devuelto - invertido) / invertido, 4) if invertido else None,
    }

    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(json.dumps(libro, ensure_ascii=False, indent=1), encoding="utf-8")
    return libro


if __name__ == "__main__":
    d = json.loads((RAIZ / "datos" / "web.json").read_text(encoding="utf-8"))
    libro = actualizar(d)
    t = libro["totales"]
    print(f"tickets: {t['tickets']} ({t['resueltos']} resueltos, {t['pendientes']} pendientes) · "
          f"ganados {t['ganados']} · neto {t['neto']:+.2f}")
