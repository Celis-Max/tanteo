"""
Estadísticas de contexto: cómo llega cada equipo al partido.
Todo sale del histórico (football-data) más el torneo en curso (ESPN).
"""
from __future__ import annotations

from datetime import datetime

import numpy as np
import pandas as pd


def _resultado(gf: int, gc: int) -> str:
    return "G" if gf > gc else ("E" if gf == gc else "P")


def partidos_de(hist: pd.DataFrame, equipo: str, hasta: pd.Timestamp, n: int | None = None) -> pd.DataFrame:
    d = hist[((hist.equipo_local == equipo) | (hist.equipo_visita == equipo)) & (hist.fecha < hasta)]
    d = d.sort_values("fecha", ascending=False)
    return d.head(n) if n else d


def ficha(hist: pd.DataFrame, equipo: str, hasta: pd.Timestamp, n: int = 5) -> dict:
    """Forma reciente, racha, goles y rendimiento en casa/fuera."""
    ult = partidos_de(hist, equipo, hasta, n)
    forma, gf_l, gc_l = [], [], []
    for _, p in ult.iterrows():
        casa = p.equipo_local == equipo
        gf, gc = (p.gl, p.gv) if casa else (p.gv, p.gl)
        forma.append(_resultado(gf, gc)); gf_l.append(gf); gc_l.append(gc)

    # racha actual (sobre todos los partidos, no solo los últimos n)
    todos = partidos_de(hist, equipo, hasta)
    racha_tipo, racha = None, 0
    for _, p in todos.iterrows():
        casa = p.equipo_local == equipo
        r = _resultado(p.gl if casa else p.gv, p.gv if casa else p.gl)
        if racha_tipo is None:
            racha_tipo, racha = r, 1
        elif r == racha_tipo:
            racha += 1
        else:
            break

    temporada = todos[todos.fecha >= hasta - pd.Timedelta(days=200)]
    casa = temporada[temporada.equipo_local == equipo]
    fuera = temporada[temporada.equipo_visita == equipo]
    puntos = lambda serie: sum(3 if a > b else (1 if a == b else 0) for a, b in serie)

    return {
        "forma": "".join(reversed(forma)),   # el más reciente queda a la derecha
        "puntos_ult5": puntos(zip(gf_l, gc_l)),
        "goles_favor_ult5": round(float(np.mean(gf_l)), 2) if gf_l else 0,
        "goles_contra_ult5": round(float(np.mean(gc_l)), 2) if gc_l else 0,
        "racha": f"{racha} {'victorias' if racha_tipo=='G' else 'empates' if racha_tipo=='E' else 'derrotas'}" if racha_tipo else "—",
        "racha_tipo": racha_tipo or "",
        "dias_descanso": int((hasta - todos.fecha.iloc[0]).days) if len(todos) else None,
        "casa": {"jj": len(casa), "pts": puntos(zip(casa.gl, casa.gv)),
                 "gf": round(float(casa.gl.mean()), 2) if len(casa) else 0,
                 "gc": round(float(casa.gv.mean()), 2) if len(casa) else 0},
        "fuera": {"jj": len(fuera), "pts": puntos(zip(fuera.gv, fuera.gl)),
                  "gf": round(float(fuera.gv.mean()), 2) if len(fuera) else 0,
                  "gc": round(float(fuera.gl.mean()), 2) if len(fuera) else 0},
        "ambos_anotan_pct": round(100 * float(((temporada.gl > 0) & (temporada.gv > 0)).mean()), 0) if len(temporada) else 0,
        "over25_pct": round(100 * float(((temporada.gl + temporada.gv) > 2.5).mean()), 0) if len(temporada) else 0,
    }


def historial(hist: pd.DataFrame, local: str, visita: str, hasta: pd.Timestamp, n: int = 6) -> dict:
    """Cara a cara: cómo se han dado estos duelos."""
    d = hist[(((hist.equipo_local == local) & (hist.equipo_visita == visita)) |
              ((hist.equipo_local == visita) & (hist.equipo_visita == local))) & (hist.fecha < hasta)]
    d = d.sort_values("fecha", ascending=False).head(n)
    juegos = []
    gana_local = empates = gana_visita = 0
    for _, p in d.iterrows():
        juegos.append({"fecha": p.fecha.strftime("%Y-%m-%d"), "local": p.equipo_local,
                       "visita": p.equipo_visita, "marcador": f"{int(p.gl)}-{int(p.gv)}"})
        if p.gl == p.gv:
            empates += 1
        elif (p.gl > p.gv) == (p.equipo_local == local):
            gana_local += 1
        else:
            gana_visita += 1
    return {"juegos": juegos, "gana_local": gana_local, "empates": empates, "gana_visita": gana_visita,
            "goles_promedio": round(float((d.gl + d.gv).mean()), 2) if len(d) else None}


def contexto(hist: pd.DataFrame, local: str, visita: str, fecha: pd.Timestamp) -> dict:
    """Todo el contexto de un partido, listo para la página."""
    return {
        "local": ficha(hist, local, fecha),
        "visita": ficha(hist, visita, fecha),
        "historial": historial(hist, local, visita, fecha),
    }


def ventaja_local_por_equipo(hist: pd.DataFrame, hasta: pd.Timestamp, anios: float = 3.0, minimo: int = 12) -> dict:
    """
    Qué tanto rinde cada equipo en su casa comparado con fuera. Es la versión
    medible de "la afición cuenta": puntos por partido de local menos de visitante.
    """
    desde = hasta - pd.Timedelta(days=int(365 * anios))
    d = hist[(hist.fecha >= desde) & (hist.fecha < hasta)]
    salida = {}
    for e in sorted(set(d.equipo_local) | set(d.equipo_visita)):
        casa = d[d.equipo_local == e]; fuera = d[d.equipo_visita == e]
        if len(casa) < minimo or len(fuera) < minimo:
            continue
        ppp_casa = float(np.mean([3 if a > b else (1 if a == b else 0) for a, b in zip(casa.gl, casa.gv)]))
        ppp_fuera = float(np.mean([3 if a > b else (1 if a == b else 0) for a, b in zip(fuera.gv, fuera.gl)]))
        salida[e] = {
            "ppp_casa": round(ppp_casa, 2), "ppp_fuera": round(ppp_fuera, 2),
            "ventaja": round(ppp_casa - ppp_fuera, 2),
            "goles_casa": round(float(casa.gl.mean()), 2), "goles_fuera": round(float(fuera.gv.mean()), 2),
            "jj": len(casa) + len(fuera),
        }
    return salida
