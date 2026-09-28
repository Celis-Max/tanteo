"""
¿Algún factor le agrega información al mercado?

La probabilidad de Pinnacle (sin margen) entra como "offset": el punto de partida
que ya sabe casi todo. Encima se prueban descanso, viaje, altitud, forma y el
modelo. Si un factor tiene coeficiente distinto de cero Y mejora la predicción
fuera de muestra, ahí hay ventaja real. Si no, es ruido que el mercado ya cobró.
"""
from __future__ import annotations

import json
import math
import pickle
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm

import clima as cl
import estrategias as es

RAIZ = Path(__file__).resolve().parent


def km(a, b):
    (la1, lo1), (la2, lo2) = a, b
    p1, p2 = math.radians(la1), math.radians(la2)
    dl, dp = math.radians(lo2 - lo1), p2 - p1
    x = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(x))


def features() -> pd.DataFrame:
    h = es.preparar()
    h = h[h[[f"justa_{k}" for k in es.R]].notna().all(axis=1)].copy()

    # descanso y forma de cada equipo, con el histórico completo
    todo = es.dat.historico().sort_values("fecha")
    ultimo, puntos = {}, {}
    descanso_l, descanso_v, forma_l, forma_v = [], [], [], []
    idx_h = {(r.fecha, r.equipo_local, r.equipo_visita): i for i, r in h.iterrows()}
    registros = {}
    for _, r in todo.iterrows():
        clave = (r.fecha, r.equipo_local, r.equipo_visita)
        dl = (r.fecha - ultimo[r.equipo_local]).days if r.equipo_local in ultimo else np.nan
        dv = (r.fecha - ultimo[r.equipo_visita]).days if r.equipo_visita in ultimo else np.nan
        fl = sum(puntos.get(r.equipo_local, [])[-5:]); fv = sum(puntos.get(r.equipo_visita, [])[-5:])
        if clave in idx_h:
            registros[idx_h[clave]] = (dl, dv, fl, fv)
        ultimo[r.equipo_local] = r.fecha; ultimo[r.equipo_visita] = r.fecha
        pl = 3 if r.gl > r.gv else (1 if r.gl == r.gv else 0)
        pv = 3 if r.gv > r.gl else (1 if r.gl == r.gv else 0)
        puntos.setdefault(r.equipo_local, []).append(pl); puntos.setdefault(r.equipo_visita, []).append(pv)
    reg = pd.DataFrame.from_dict(registros, orient="index", columns=["desc_l", "desc_v", "forma_l", "forma_v"])
    h = h.join(reg)
    h["descanso_dif"] = (h.desc_l.clip(2, 14) - h.desc_v.clip(2, 14))
    h["forma_dif"] = h.forma_l - h.forma_v

    # viaje y altitud del visitante (sede = estadio del local)
    viaje, alt = [], []
    for _, r in h.iterrows():
        a, b = cl.ESTADIOS.get(r.equipo_local), cl.ESTADIOS.get(r.equipo_visita)
        if a and b:
            viaje.append(km(a[:2], b[:2])); alt.append(a[2] - b[2])
        else:
            viaje.append(np.nan); alt.append(np.nan)
    h["viaje_km"] = viaje
    h["sube_m"] = alt                                  # >0: el visitante juega más alto que en su casa

    # el modelo, tal como predecía en su momento (walk-forward)
    wf = pickle.load(open(RAIZ / "datos" / "walkforward.pkl", "rb"))
    xi = json.loads((RAIZ / "datos" / "backtest.json").read_text())["xi"]
    pm = wf[xi][["fecha", "local", "visita", "m_1", "m_2"]].rename(columns={"local": "equipo_local", "visita": "equipo_visita"})
    h = h.merge(pm, on=["fecha", "equipo_local", "equipo_visita"], how="left")
    return h


def logit(p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


def probar(h: pd.DataFrame) -> dict:
    salida = {"eventos": {}}
    h = h.dropna(subset=["descanso_dif", "forma_dif", "viaje_km", "sube_m", "m_1", "m_2"]).copy()
    h["modelo_1"] = logit(h.m_1) - logit(h.justa_1)
    h["modelo_2"] = logit(h.m_2) - logit(h.justa_2)
    h["viaje_100km"] = h.viaje_km / 100
    h["sube_1000m"] = h.sube_m / 1000
    for evento, prob, modelo in (("gana_local", "justa_1", "modelo_1"), ("gana_visita", "justa_2", "modelo_2")):
        y = (h.real == ("1" if evento == "gana_local" else "2")).astype(float)
        X_cols = ["descanso_dif", "forma_dif", "viaje_100km", "sube_1000m", modelo]
        off = logit(h[prob])
        entreno, prueba = h.fecha < es.CORTE, h.fecha >= es.CORTE

        # 1) coeficientes con todo el periodo (¿se distinguen de cero?)
        X = sm.add_constant(h[X_cols])
        ajuste = sm.GLM(y, X, family=sm.families.Binomial(), offset=off).fit()
        coefs = {c: {"coef": round(float(ajuste.params[c]), 4), "p": round(float(ajuste.pvalues[c]), 4)} for c in X_cols}

        # 2) fuera de muestra: ¿mejora al mercado solo?
        Xe = sm.add_constant(h.loc[entreno, X_cols])
        a2 = sm.GLM(y[entreno], Xe, family=sm.families.Binomial(), offset=off[entreno]).fit()
        Xp = sm.add_constant(h.loc[prueba, X_cols], has_constant="add")
        pred = 1 / (1 + np.exp(-(Xp @ a2.params + off[prueba])))
        base = h.loc[prueba, prob]
        ll = lambda p: float(-np.mean(y[prueba] * np.log(np.clip(p, 1e-9, 1)) + (1 - y[prueba]) * np.log(np.clip(1 - p, 1e-9, 1))))
        salida["eventos"][evento] = {
            "n_total": int(len(h)), "n_prueba": int(prueba.sum()),
            "coeficientes": coefs,
            "logloss_mercado": round(ll(base), 5), "logloss_con_factores": round(ll(pred), 5),
            "mejora_pct": round(100 * (ll(base) - ll(pred)) / ll(base), 3),
        }
    return salida


if __name__ == "__main__":
    h = features()
    r = probar(h)
    (RAIZ / "datos" / "contexto.json").write_text(json.dumps(r, ensure_ascii=False, indent=1), encoding="utf-8")
    nombres = {"descanso_dif": "Descanso (días de diferencia)", "forma_dif": "Forma (pts últimos 5, dif.)",
               "viaje_100km": "Viaje del visitante (por 100 km)", "sube_1000m": "Altitud que sube el visitante (por 1000 m)",
               "modelo_1": "Modelo vs mercado", "modelo_2": "Modelo vs mercado"}
    for ev, d in r["eventos"].items():
        print(f"\n== {ev.replace('_',' ')} · {d['n_total']} partidos (prueba {d['n_prueba']})")
        for c, v in d["coeficientes"].items():
            marca = "  ← SIGNIFICATIVO" if v["p"] < 0.05 else ""
            print(f"   {nombres[c]:42s} coef {v['coef']:+.4f}  p={v['p']:.3f}{marca}")
        print(f"   log-loss fuera de muestra: mercado {d['logloss_mercado']:.5f} → con factores {d['logloss_con_factores']:.5f} ({d['mejora_pct']:+.3f}%)")
