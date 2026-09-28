"""
¿La afición cuenta más allá de la cuota?

Tres pruebas:
1. Experimento natural: en la pandemia (2020) se jugó sin público. ¿Bajó la
   ventaja de local? ¿La cuota lo notó?
2. Estadio lleno o vacío (asistencia real de fbref, 2021-2024) contra el
   promedio de ese equipo: ¿el local rinde más de lo que dice la cuota?
3. "Peso de la casa" de cada equipo (calculado solo con partidos anteriores):
   ¿los equipos que se hacen fuertes en casa ganan más de lo que dice la cuota?
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm

import estrategias as es

RAIZ = Path(__file__).resolve().parent
FBREF = {"America": "Club America", "Atlas": "Atlas", "Atletico": "Atl. San Luis", "Cruz Azul": "Cruz Azul",
         "FC Juarez": "Juarez", "Guadalajara": "Guadalajara Chivas", "Leon": "Club Leon", "Mazatlan": "Mazatlan FC",
         "Monterrey": "Monterrey", "Necaxa": "Necaxa", "Pachuca": "Pachuca", "Puebla": "Puebla",
         "Pumas UNAM": "UNAM Pumas", "Queretaro": "Queretaro", "Santos Laguna": "Santos Laguna",
         "Tijuana": "Club Tijuana", "Toluca": "Toluca", "UANL": "Tigres UANL"}


def logit(p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


def glm(y, X, off):
    return sm.GLM(y, sm.add_constant(X), family=sm.families.Binomial(), offset=off).fit()


def ppp(a, b):
    return 3 if a > b else (1 if a == b else 0)


def correr() -> dict:
    h = es.preparar()
    h = h[h[[f"justa_{k}" for k in es.R]].notna().all(axis=1)].copy()
    h["gana_local"] = (h.real == "1").astype(float)
    salida = {}

    # 1. pandemia: sin público del 24-jul-2020 al 31-ene-2021 (Guard1anes 2020)
    h["sin_publico"] = ((h.fecha >= "2020-07-24") & (h.fecha <= "2021-01-31")).astype(float)
    grupos = {}
    for nombre, m in (("Con público", h.sin_publico == 0), ("Sin público (pandemia)", h.sin_publico == 1)):
        g = h[m]
        grupos[nombre] = {"n": int(len(g)),
                          "local_gana_pct": round(100 * float(g.gana_local.mean()), 1),
                          "cuota_decia_pct": round(100 * float(g.justa_1.mean()), 1),
                          "pts_local": round(float(np.mean([ppp(a, b) for a, b in zip(g.gl, g.gv)])), 2),
                          "pts_visita": round(float(np.mean([ppp(b, a) for a, b in zip(g.gl, g.gv)])), 2)}
    a = glm(h.gana_local, h[["sin_publico"]], logit(h.justa_1))
    salida["pandemia"] = {"grupos": grupos, "coef": round(float(a.params["sin_publico"]), 3),
                          "p": round(float(a.pvalues["sin_publico"]), 3)}

    # 2. asistencia real (fbref)
    f = pd.read_csv(RAIZ / "datos" / "fbref_2021_2024.csv")
    f = f[f.Venue == "Home"].copy()
    f["equipo_local"] = f.Team.map(FBREF)
    f["fecha_f"] = pd.to_datetime(f.Date)
    f = f.dropna(subset=["equipo_local", "Attendance"])
    f["media_equipo"] = f.groupby("equipo_local").Attendance.transform("mean")
    f["relativa"] = f.Attendance / f.media_equipo
    filas = []
    idx = h.set_index(["equipo_local", "fecha"])
    for _, r in f.iterrows():
        for delta in (0, 1, -1):                               # fbref usa fecha local; football-data la de Londres
            clave = (r.equipo_local, r.fecha_f + pd.Timedelta(days=delta))
            if clave in idx.index:
                x = idx.loc[clave]
                x = x.iloc[0] if isinstance(x, pd.DataFrame) else x
                filas.append({"relativa": r.relativa, "asistencia": r.Attendance,
                              "gana_local": float(x.real == "1"), "justa_1": x.justa_1})
                break
    asis = pd.DataFrame(filas)
    asis["lleno"] = (asis.relativa >= 1.25).astype(float)
    asis["flojo"] = (asis.relativa <= 0.75).astype(float)
    a2 = glm(asis.gana_local, asis[["lleno", "flojo"]], logit(asis.justa_1))
    salida["asistencia"] = {
        "n": int(len(asis)),
        "grupos": {nombre: {"n": int(m.sum()), "local_gana_pct": round(100 * float(asis.gana_local[m].mean()), 1),
                            "cuota_decia_pct": round(100 * float(asis.justa_1[m].mean()), 1)}
                   for nombre, m in (("Estadio lleno (≥125% de su promedio)", asis.lleno == 1),
                                     ("Normal", (asis.lleno == 0) & (asis.flojo == 0)),
                                     ("Flojo (≤75% de su promedio)", asis.flojo == 1))},
        "lleno": {"coef": round(float(a2.params["lleno"]), 3), "p": round(float(a2.pvalues["lleno"]), 3)},
        "flojo": {"coef": round(float(a2.params["flojo"]), 3), "p": round(float(a2.pvalues["flojo"]), 3)},
    }

    # 3. peso de la casa de cada equipo, con partidos ANTERIORES (3 años)
    todo = es.dat.historico().sort_values("fecha")
    pesos = []
    for _, r in h.iterrows():
        v = todo[(todo.fecha < r.fecha) & (todo.fecha >= r.fecha - pd.Timedelta(days=3 * 365))]
        casa = v[v.equipo_local == r.equipo_local]; fuera = v[v.equipo_visita == r.equipo_local]
        if len(casa) >= 15 and len(fuera) >= 15:
            pesos.append(np.mean([ppp(a, b) for a, b in zip(casa.gl, casa.gv)]) - np.mean([ppp(b, a) for a, b in zip(fuera.gl, fuera.gv)]))
        else:
            pesos.append(np.nan)
    h["peso_casa"] = pesos
    c = h.dropna(subset=["peso_casa"])
    a3 = glm(c.gana_local, c[["peso_casa"]], logit(c.justa_1))
    alto = c.peso_casa >= c.peso_casa.quantile(0.8)
    salida["peso_casa"] = {"n": int(len(c)), "coef": round(float(a3.params["peso_casa"]), 3), "p": round(float(a3.pvalues["peso_casa"]), 3),
                           "top20": {"n": int(alto.sum()), "local_gana_pct": round(100 * float(c.gana_local[alto].mean()), 1),
                                     "cuota_decia_pct": round(100 * float(c.justa_1[alto].mean()), 1)}}
    (RAIZ / "datos" / "aficion.json").write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")
    return salida


if __name__ == "__main__":
    r = correr()
    p = r["pandemia"]
    print("1. PANDEMIA (experimento natural)")
    for k, v in p["grupos"].items():
        print(f"   {k:24s} n={v['n']:4d} · local gana {v['local_gana_pct']}% (la cuota decía {v['cuota_decia_pct']}%) · pts local {v['pts_local']} vs visita {v['pts_visita']}")
    print(f"   ¿la cuota se equivocó sin público? coef {p['coef']:+.3f} p={p['p']:.3f}")
    a = r["asistencia"]
    print(f"\n2. ASISTENCIA REAL (n={a['n']})")
    for k, v in a["grupos"].items():
        print(f"   {k:38s} n={v['n']:4d} · local gana {v['local_gana_pct']}% (la cuota decía {v['cuota_decia_pct']}%)")
    print(f"   lleno: coef {a['lleno']['coef']:+.3f} p={a['lleno']['p']:.3f} · flojo: coef {a['flojo']['coef']:+.3f} p={a['flojo']['p']:.3f}")
    c = r["peso_casa"]
    print(f"\n3. PESO DE LA CASA POR EQUIPO (n={c['n']}): coef {c['coef']:+.3f} p={c['p']:.3f}")
    print(f"   20% de equipos más fuertes en casa: local gana {c['top20']['local_gana_pct']}% (la cuota decía {c['top20']['cuota_decia_pct']}%)")
