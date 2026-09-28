"""
Laboratorio de estrategias con cuotas de cierre reales (2016-2026).

Regla contra el autoengaño: cada estrategia tiene parámetros; se eligen con
2016-2021 ("afinado") y se juzgan SOLO con 2021-2026 ("prueba"). Además se
reporta el estadístico t: con muchas estrategias probadas, alguna sale bien
por pura suerte, así que un yield sin t alto no significa nada.

Todas las apuestas son de 1 unidad (así el t es limpio y comparable).
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

import datos as dat
import modelo as mod

RAIZ = Path(__file__).resolve().parent
CORTE = pd.Timestamp("2021-07-01")
INICIO = pd.Timestamp("2016-01-01")
R = ["1", "X", "2"]


def preparar() -> pd.DataFrame:
    h = dat.historico()
    h = h[h.fecha >= INICIO].copy()
    h["real"] = np.where(h.gl > h.gv, "1", np.where(h.gl == h.gv, "X", "2"))
    ok = h[[f"c_ps_{k}" for k in R]].notna().all(axis=1)
    justas = np.full((len(h), 3), np.nan)
    for n, (i, r) in enumerate(h.iterrows()):
        if ok.loc[i]:
            justas[n] = mod.sin_margen_shin([r[f"c_ps_{k}"] for k in R])
    for j, k in enumerate(R):
        h[f"justa_{k}"] = justas[:, j]              # probabilidad "verdadera" según Pinnacle sin margen
    h["temporada_num"] = h.fecha.dt.year + (h.fecha.dt.month >= 7)
    return h


def resultado(apuestas: pd.DataFrame) -> dict:
    """apuestas: columnas fecha, cuota, gana (bool)."""
    if len(apuestas) == 0:
        return {"n": 0, "yield_pct": 0.0, "t": 0.0, "acierto_pct": 0.0, "cuota_media": 0.0,
                "caida_max_u": 0.0, "por_temporada": {}}
    g = np.where(apuestas.gana, apuestas.cuota - 1, -1.0)
    n = len(g)
    t = float(g.mean() / (g.std(ddof=1) / np.sqrt(n))) if n > 2 and g.std() > 0 else 0.0
    curva = np.cumsum(g)
    caida = float(np.max(np.maximum.accumulate(curva) - curva)) if n else 0.0
    temporadas = {}
    for temp, grupo in apuestas.assign(g=g).groupby(apuestas.fecha.dt.year):
        temporadas[int(temp)] = round(100 * float(grupo.g.mean()), 1)
    return {
        "n": int(n), "yield_pct": round(100 * float(g.mean()), 2), "t": round(t, 2),
        "acierto_pct": round(100 * float(apuestas.gana.mean()), 1),
        "cuota_media": round(float(apuestas.cuota.mean()), 2),
        "caida_max_u": round(caida, 1),
        "beneficio_u": round(float(g.sum()), 1),
        "por_temporada": temporadas,
        "curva": [round(float(x), 1) for x in curva[:: max(1, n // 100)]],
    }


# ------------------------------------------------------------------ estrategias

def valor_contra_linea(h: pd.DataFrame, casa: str, umbral: float) -> pd.DataFrame:
    """
    La estrategia clásica de los apostadores profesionales: la línea de Pinnacle
    sin margen es la mejor estimación de la probabilidad real. Si otra casa paga
    más de lo justo por encima del umbral, se apuesta ahí.
    """
    filas = []
    for _, r in h.iterrows():
        for k in R:
            c, p = r[f"c_{casa}_{k}"], r[f"justa_{k}"]
            if pd.notna(c) and pd.notna(p) and c > 1 and p * c - 1 > umbral:
                filas.append({"fecha": r.fecha, "cuota": c, "gana": r.real == k, "ev": p * c - 1})
    return pd.DataFrame(filas)


def por_rango_de_cuota(h: pd.DataFrame, casa: str, desde: float, hasta: float, lado: str | None = None) -> pd.DataFrame:
    """Sesgo favorito-longshot: ¿los favoritos o las sorpresas están mal pagados?"""
    filas = []
    for _, r in h.iterrows():
        for k in (R if lado is None else [lado]):
            c = r[f"c_{casa}_{k}"]
            if pd.notna(c) and desde <= c < hasta:
                filas.append({"fecha": r.fecha, "cuota": c, "gana": r.real == k})
    return pd.DataFrame(filas)


def empates_cerrados(h: pd.DataFrame, casa: str, min_prob_empate: float) -> pd.DataFrame:
    """Empate cuando el partido está parejo según la línea afilada."""
    filas = []
    for _, r in h.iterrows():
        p, c = r["justa_X"], r[f"c_{casa}_X"]
        if pd.notna(p) and pd.notna(c) and p >= min_prob_empate:
            filas.append({"fecha": r.fecha, "cuota": c, "gana": r.real == "X"})
    return pd.DataFrame(filas)


def local_no_favorito(h: pd.DataFrame, casa: str, min_cuota: float) -> pd.DataFrame:
    """Local que la casa da por debajo (cuota alta): ¿se subestima la localía?"""
    filas = []
    for _, r in h.iterrows():
        c = r[f"c_{casa}_1"]
        if pd.notna(c) and c >= min_cuota:
            filas.append({"fecha": r.fecha, "cuota": c, "gana": r.real == "1"})
    return pd.DataFrame(filas)


def favorito(h: pd.DataFrame, casa: str, rango: tuple[float, float], lado: str | None = None) -> pd.DataFrame:
    """Al favorito del partido (local o visita) si su cuota cae en el rango."""
    filas = []
    for _, r in h.iterrows():
        c1, c2 = r[f"c_{casa}_1"], r[f"c_{casa}_2"]
        if pd.isna(c1) or pd.isna(c2):
            continue
        k, c = ("1", c1) if c1 <= c2 else ("2", c2)
        if lado and k != lado:
            continue
        if rango[0] <= c < rango[1]:
            filas.append({"fecha": r.fecha, "cuota": c, "gana": r.real == k})
    return pd.DataFrame(filas)


def favorito_con_valor(h: pd.DataFrame, casa: str, umbral: float) -> pd.DataFrame:
    """Valor contra Pinnacle, pero solo en favoritos (cuota < 2.5): junta las dos ideas que funcionan."""
    v = valor_contra_linea(h, casa, umbral)
    return v[v.cuota < 2.5] if len(v) else v


def parlay_favoritos(h: pd.DataFrame, casa: str, piernas: int, rango=(1.3, 2.0), semilla: int = 1) -> pd.DataFrame:
    """
    Parlays de favoritos de la misma semana. Se arman al azar (sin mirar el
    resultado) para medir lo que cuesta combinar, no para presumir aciertos.
    """
    rnd = np.random.default_rng(semilla)
    base = favorito(h, casa, rango)
    if len(base) == 0:
        return base
    base = base.assign(semana=base.fecha.dt.to_period("W"))
    filas = []
    for _, g in base.groupby("semana"):
        idx = rnd.permutation(len(g))
        for i in range(0, len(idx) - piernas + 1, piernas):
            sel = g.iloc[idx[i:i + piernas]]
            filas.append({"fecha": sel.fecha.max(), "cuota": float(np.prod(sel.cuota)), "gana": bool(sel.gana.all())})
    return pd.DataFrame(filas)


def kaunitz(h: pd.DataFrame, casa: str, alfa: float) -> pd.DataFrame:
    """
    Kaunitz, Zhong y Kreiner (2017): la probabilidad real es 1/promedio de cuotas
    menos un margen α; se apuesta a la mejor cuota cuando supera 1/(prob − α).
    No necesita a Pinnacle: solo el promedio y la máxima del mercado.
    """
    filas = []
    for r in h.itertuples():
        for k in R:
            prom, mx = getattr(r, f"c_avg_{k}"), getattr(r, f"c_{casa}_{k}")
            if prom == prom and mx == mx and prom > 1 and (1 / prom - alfa) > 0 and mx > 1 / (1 / prom - alfa):
                filas.append({"fecha": r.fecha, "cuota": mx, "gana": r.real == k})
    return pd.DataFrame(filas)


CATALOGO = {
    "valor_max":   ("Valor contra Pinnacle · mejor cuota del mercado", valor_contra_linea, "max", [0.0, 0.01, 0.02, 0.03, 0.05, 0.08]),
    "valor_b365":  ("Valor contra Pinnacle · Bet365", valor_contra_linea, "b365", [0.0, 0.01, 0.02, 0.03, 0.05]),
    "valor_avg":   ("Valor contra Pinnacle · casa promedio", valor_contra_linea, "avg", [0.0, 0.02, 0.05]),
    "empates":     ("Empate en partidos parejos (mejor cuota)", empates_cerrados, "max", [0.27, 0.29, 0.31]),
    "local_dog":   ("Local no favorito (mejor cuota)", local_no_favorito, "max", [3.0, 3.5, 4.0]),
    "kaunitz":     ("Kaunitz et al. (2017): mejor cuota contra el consenso", kaunitz, "max", [0.03, 0.05, 0.07]),
    "fav_max":     ("Favorito a la mejor cuota", favorito, "max", [(1.0, 1.5), (1.3, 1.8), (1.5, 2.0), (1.0, 2.0)]),
    "fav_avg":     ("Favorito a cuota promedio (sin buscar cuota)", favorito, "avg", [(1.0, 1.5), (1.3, 1.8), (1.5, 2.0), (1.0, 2.0)]),
    "fav_valor":   ("Favorito con valor contra Pinnacle", favorito_con_valor, "max", [0.0, 0.01, 0.02, 0.03]),
    "parlay2_max": ("Parlay de 2 favoritos · mejor cuota", parlay_favoritos, "max", [2]),
    "parlay2_avg": ("Parlay de 2 favoritos · cuota promedio", parlay_favoritos, "avg", [2]),
    "parlay3_avg": ("Parlay de 3 favoritos · cuota promedio", parlay_favoritos, "avg", [3]),
    "parlay4_avg": ("Parlay de 4 favoritos · cuota promedio", parlay_favoritos, "avg", [4]),
}


def correr() -> dict:
    h = preparar()
    viejo, nuevo = h[h.fecha < CORTE], h[h.fecha >= CORTE]
    salida = {"estrategias": [], "sesgo_cuotas": [], "periodo_afinado": f"{viejo.fecha.min().date()} a {viejo.fecha.max().date()}",
              "periodo_prueba": f"{nuevo.fecha.min().date()} a {nuevo.fecha.max().date()}"}

    for clave, (nombre, f, casa, params) in CATALOGO.items():
        # el parámetro se elige SOLO con el periodo viejo (por yield con al menos 100 apuestas)
        candidatos = []
        for prm in params:
            r = resultado(f(viejo, casa, prm))
            if r["n"] >= (60 if clave.startswith("parlay") else 100):
                candidatos.append((r["yield_pct"], prm, r))
        if not candidatos:
            continue
        _, prm, r_viejo = max(candidatos, key=lambda x: x[0])
        r_nuevo = resultado(f(nuevo, casa, prm))
        salida["estrategias"].append({"clave": clave, "nombre": nombre, "casa": casa, "parametro": prm,
                                      "afinado": {k: v for k, v in r_viejo.items() if k != "curva"},
                                      "prueba": r_nuevo})

    # Bet365 solo tiene cierres desde 2025-08: se reporta aparte, sin separar afinado/prueba
    b = h[h[[f"c_b365_{k}" for k in R]].notna().all(axis=1)]
    salida["exploratorio_b365"] = {
        "periodo": f"{b.fecha.min().date()} a {b.fecha.max().date()}" if len(b) else "—",
        "valor_2pct": resultado(valor_contra_linea(b, "b365", 0.02)),
        "favoritos": resultado(favorito(b, "b365", (1.0, 2.0))),
        "todo": resultado(por_rango_de_cuota(b, "b365", 1.0, 100.0)),
    }

    # arbitraje: cuando las mejores cuotas de distintas casas suman menos de 100%
    suma = (1 / h[[f"c_max_{k}" for k in R]]).sum(axis=1)
    hay = suma < 1
    salida["arbitraje"] = {
        "pct_partidos": round(100 * float(hay.mean()), 1),
        "ganancia_mediana_pct": round(100 * float(((1 / suma[hay]) - 1).median()), 2) if hay.any() else 0,
        "por_anio": {int(a): round(100 * float(v), 1) for a, v in hay.groupby(h.fecha.dt.year).mean().items()},
    }

    # sesgo favorito-longshot en el periodo completo, para entender el mercado
    for desde, hasta in ((1.0, 1.5), (1.5, 2.0), (2.0, 3.0), (3.0, 5.0), (5.0, 10.0), (10.0, 100.0)):
        for casa in ("avg", "max"):
            r = resultado(por_rango_de_cuota(h, casa, desde, hasta))
            salida["sesgo_cuotas"].append({"rango": f"{desde:g}–{hasta:g}", "casa": casa,
                                           "n": r["n"], "yield_pct": r["yield_pct"], "t": r["t"]})
    (RAIZ / "datos" / "estrategias.json").write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")
    return salida


if __name__ == "__main__":
    s = correr()
    print(f"afinado {s['periodo_afinado']} · prueba {s['periodo_prueba']}\n")
    print(f"{'estrategia':50s} {'param':>6s} │ {'afinado':>18s} │ {'PRUEBA (lo que cuenta)':>34s}")
    for e in s["estrategias"]:
        a, p = e["afinado"], e["prueba"]
        prm = e['parametro']; prm = f"{prm[0]:g}-{prm[1]:g}" if isinstance(prm, (tuple, list)) else f"{prm:g}"
        print(f"{e['nombre'][:50]:50s} {prm:>7s} │ n={a['n']:4d} y={a['yield_pct']:+6.2f}% │ "
              f"n={p['n']:4d} yield={p['yield_pct']:+6.2f}% t={p['t']:+5.2f} cuota {p['cuota_media']:.2f}")
    eb = s["exploratorio_b365"]
    print(f"\nBet365 exploratorio ({eb['periodo']}): valor>2% n={eb['valor_2pct']['n']} y={eb['valor_2pct']['yield_pct']:+.2f}% t={eb['valor_2pct']['t']:+.2f} | "
          f"favoritos y={eb['favoritos']['yield_pct']:+.2f}% | todo y={eb['todo']['yield_pct']:+.2f}%")
    print("\nsesgo por rango de cuota (todo el periodo, 1 unidad a todo lo que cae en el rango):")
    for x in s["sesgo_cuotas"]:
        print(f"  cuota {x['rango']:9s} {x['casa']:4s} n={x['n']:5d} yield {x['yield_pct']:+6.2f}% t={x['t']:+5.2f}")
