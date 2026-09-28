"""
Competencia de modelos sobre Liga MX, todos bajo la misma regla: predecir cada
partido solo con información anterior (walk-forward) y calificar sobre los
MISMOS partidos.

Participantes
- 6 modelos de goles de penaltyblog: Poisson, Dixon-Coles, Poisson bivariado,
  binomial negativa, Poisson cero-inflado, cópula Weibull.
- Ratings: Elo y pi-ratings (Constantinou y Fenton, 2013).
- FiveThirtyEight SPI (sus predicciones reales archivadas, 2016-2023).
- Nuestro Dixon-Coles.
- Mercado: Pinnacle sin margen (Shin), promedio de casas sin margen, y el
  consenso de Kaunitz et al. (2017): 1/promedio de cuotas.
- Ensambles: promedio de modelos y mezcla modelo+mercado (peso elegido con 2019-2021).

Métricas: RPS (la estándar en pronóstico de fútbol; menor es mejor), log-loss,
Brier y acierto.
"""
from __future__ import annotations

import json
import pickle
import time
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import penaltyblog as pb

import datos as dat
import estrategias as es
import modelo as mod

warnings.filterwarnings("ignore")
RAIZ = Path(__file__).resolve().parent
DESDE = pd.Timestamp("2019-07-01")
CORTE = pd.Timestamp("2021-07-01")               # antes: afinar pesos; después: calificar
XI = 0.0015
MODELOS_GOLES = {
    "Poisson": ("PoissonGoalsModel", 14),
    "Dixon-Coles (penaltyblog)": ("DixonColesGoalModel", 14),
    "Poisson bivariado": ("BivariatePoissonGoalModel", 14),
    "Binomial negativa": ("NegativeBinomialGoalModel", 14),
    "Poisson cero-inflado": ("ZeroInflatedPoissonGoalsModel", 14),
    "Cópula Weibull": ("WeibullCopulaGoalsModel", 28),
}
NOMBRES_538 = {"Atlas": "Atlas", "Atlético San Luis": "Atl. San Luis", "Club América": "Club America",
               "Cruz Azul": "Cruz Azul", "FC Juárez": "Juarez", "Guadalajara": "Guadalajara Chivas",
               "León": "Club Leon", "Mazatlán FC": "Mazatlan FC", "Monterrey": "Monterrey", "Necaxa": "Necaxa",
               "Pachuca": "Pachuca", "Puebla": "Puebla", "Pumas Unam": "UNAM Pumas", "Querétaro": "Queretaro",
               "Santos Laguna": "Santos Laguna", "Tigres UANL": "Tigres UANL", "Tijuana": "Club Tijuana",
               "Toluca": "Toluca", "Veracruz": "Veracruz", "Lobos de la BUAP": "Lobos BUAP",
               "Chiapas FC": "Chiapas", "Morelia": "Monarcas"}


def clave(df):
    return df.fecha.dt.strftime("%Y-%m-%d") + "|" + df.equipo_local + "|" + df.equipo_visita


def modelos_de_goles(h: pd.DataFrame) -> dict[str, dict[str, np.ndarray]]:
    salida = {n: {} for n in MODELOS_GOLES}
    fin = h.fecha.max() + pd.Timedelta(days=1)
    for nombre, (clase, paso) in MODELOS_GOLES.items():
        t0 = time.time()
        corte = DESDE
        while corte < fin:
            sig = corte + pd.Timedelta(days=paso)
            prueba = h[(h.fecha >= corte) & (h.fecha < sig)]
            if len(prueba):
                ent = h[(h.fecha < corte) & (h.fecha >= corte - pd.Timedelta(days=4 * 365))]
                equipos = set(ent.equipo_local) | set(ent.equipo_visita)
                w = np.array(pb.models.dixon_coles_weights(ent.fecha, XI, base_date=corte), dtype=np.float64).copy()
                try:
                    m = getattr(pb.models, clase)(np.array(ent.gl, dtype=np.int64).copy(), np.array(ent.gv, dtype=np.int64).copy(),
                                                  np.array(ent.equipo_local, dtype=str).copy(), np.array(ent.equipo_visita, dtype=str).copy(), w)
                    m.fit()
                    for _, p in prueba.iterrows():
                        if p.equipo_local in equipos and p.equipo_visita in equipos:
                            g = m.predict(p.equipo_local, p.equipo_visita, max_goals=10)
                            salida[nombre][f"{p.fecha:%Y-%m-%d}|{p.equipo_local}|{p.equipo_visita}"] = np.array(g.home_draw_away, dtype=float)
                except Exception as e:
                    print(f"   {nombre} {corte.date()}: {str(e)[:80]}")
            corte = sig
        print(f"  {nombre:28s} {len(salida[nombre]):5d} partidos · {time.time()-t0:5.0f} s", flush=True)
    return salida


def ratings(h_completo: pd.DataFrame) -> dict[str, dict[str, np.ndarray]]:
    """Elo y pi-ratings se actualizan partido a partido desde 2012; se predice antes de actualizar."""
    elo, pi = pb.ratings.Elo(k=20, home_field_advantage=80), pb.ratings.PiRatingSystem()
    salida = {"Elo": {}, "Pi-ratings": {}}
    for _, p in h_completo.sort_values("fecha").iterrows():
        k = f"{p.fecha:%Y-%m-%d}|{p.equipo_local}|{p.equipo_visita}"
        if p.fecha >= DESDE:
            a = elo.calculate_match_probabilities(p.equipo_local, p.equipo_visita)
            b = pi.calculate_match_probabilities(p.equipo_local, p.equipo_visita)
            salida["Elo"][k] = np.array([a["home_win"], a["draw"], a["away_win"]], dtype=float)
            salida["Pi-ratings"][k] = np.array([b["home_win"], b["draw"], b["away_win"]], dtype=float)
        res = 0 if p.gl > p.gv else (1 if p.gl == p.gv else 2)
        elo.update_ratings(p.equipo_local, p.equipo_visita, res)
        pi.update_ratings(p.equipo_local, p.equipo_visita, int(p.gl - p.gv))
    return salida


def fivethirtyeight(h: pd.DataFrame) -> dict[str, np.ndarray]:
    d = pd.read_csv(RAIZ / "datos" / "fivethirtyeight_spi.csv")
    d = d[d.league.str.contains("Mexic", na=False)].copy()
    d["local"] = d.team1.map(NOMBRES_538); d["visita"] = d.team2.map(NOMBRES_538)
    d["f"] = pd.to_datetime(d.date)
    indice = {(r.equipo_local, r.equipo_visita, r.fecha): f"{r.fecha:%Y-%m-%d}|{r.equipo_local}|{r.equipo_visita}" for r in h.itertuples()}
    salida = {}
    for r in d.itertuples():
        for delta in (0, 1, -1):              # 538 usa fecha local; football-data la de Londres
            k = indice.get((r.local, r.visita, r.f + pd.Timedelta(days=delta)))
            if k:
                salida[k] = np.array([r.prob1, r.probtie, r.prob2], dtype=float); break
    return salida


def mercados(h: pd.DataFrame) -> dict[str, dict[str, np.ndarray]]:
    salida = {"Mercado · Pinnacle (Shin)": {}, "Mercado · promedio de casas": {}, "Mercado · consenso Kaunitz": {}}
    for r in h.itertuples():
        k = f"{r.fecha:%Y-%m-%d}|{r.equipo_local}|{r.equipo_visita}"
        if not np.isnan(r.justa_1):
            salida["Mercado · Pinnacle (Shin)"][k] = np.array([r.justa_1, r.justa_X, r.justa_2])
        prom = [r.c_avg_1, r.c_avg_X, r.c_avg_2]
        if all(x == x and x > 1 for x in prom):
            salida["Mercado · promedio de casas"][k] = mod.sin_margen(prom)
            inv = np.array([1 / x for x in prom]); salida["Mercado · consenso Kaunitz"][k] = inv / inv.sum()
    return salida


def nuestro() -> dict[str, np.ndarray]:
    wf = pickle.load(open(RAIZ / "datos" / "walkforward.pkl", "rb"))
    xi = json.loads((RAIZ / "datos" / "backtest.json").read_text())["xi"]
    d = wf[xi]
    return {f"{r.fecha:%Y-%m-%d}|{r.local}|{r.visita}": np.array([r.m_1, r.m_X, r.m_2]) for r in d.itertuples()}


# ------------------------------------------------------------------ métricas

def metricas(P: np.ndarray, y: np.ndarray) -> dict:
    """P: n×3 (local, empate, visita); y: índice del resultado."""
    P = np.clip(P, 1e-9, 1); P = P / P.sum(axis=1, keepdims=True)
    Y = np.eye(3)[y]
    acum_p, acum_y = np.cumsum(P, axis=1)[:, :2], np.cumsum(Y, axis=1)[:, :2]
    return {"rps": float(np.mean(np.sum((acum_p - acum_y) ** 2, axis=1) / 2)),
            "log_loss": float(-np.mean(np.log(P[np.arange(len(y)), y]))),
            "brier": float(np.mean(np.sum((P - Y) ** 2, axis=1))),
            "acierto": float(np.mean(P.argmax(axis=1) == y)), "n": int(len(y))}


def calificar(fuentes: dict[str, dict[str, np.ndarray]], resultado: dict[str, int], claves: list[str]) -> list[dict]:
    y = np.array([resultado[k] for k in claves])
    tabla = [{"modelo": n, **metricas(np.vstack([f[k] for k in claves]), y)} for n, f in fuentes.items()]
    return sorted(tabla, key=lambda r: r["rps"])


def estrategia_kaunitz(h: pd.DataFrame) -> list[dict]:
    """Regla original: apostar a la cuota máxima si supera 1/(1/promedio − α)."""
    filas = []
    for alfa in (0.03, 0.05, 0.07):
        for periodo, d in (("afinado", h[h.fecha < es.CORTE]), ("prueba", h[h.fecha >= es.CORTE])):
            ap = []
            for r in d.itertuples():
                for k in es.R:
                    prom, mx = getattr(r, f"c_avg_{k}"), getattr(r, f"c_max_{k}")
                    if prom == prom and mx == mx and prom > 1 and (1 / prom - alfa) > 0 and mx > 1 / (1 / prom - alfa):
                        ap.append({"fecha": r.fecha, "cuota": mx, "gana": r.real == k})
            res = es.resultado(pd.DataFrame(ap))
            filas.append({"alfa": alfa, "periodo": periodo, **{k: res[k] for k in ("n", "yield_pct", "t", "acierto_pct", "cuota_media")}})
    return filas


if __name__ == "__main__":
    t0 = time.time()
    hist_todo = dat.historico()
    h = es.preparar()
    h = h[h.fecha >= DESDE - pd.Timedelta(days=4 * 365)].copy()
    ev = h[h.fecha >= DESDE]
    resultado = {f"{r.fecha:%Y-%m-%d}|{r.equipo_local}|{r.equipo_visita}": {"1": 0, "X": 1, "2": 2}[r.real] for r in ev.itertuples()}

    cache = RAIZ / "datos" / "comparativa_predicciones.pkl"
    if cache.exists():
        fuentes = pickle.load(open(cache, "rb"))
        print("predicciones de modelos: desde caché", flush=True)
    else:
        print("walk-forward de los modelos de goles (penaltyblog):", flush=True)
        fuentes = modelos_de_goles(h)
        print("ratings Elo y pi…", flush=True); fuentes |= ratings(hist_todo)
        pickle.dump(fuentes, open(cache, "wb"))
    fuentes["Nuestro Dixon-Coles"] = nuestro()
    fuentes |= mercados(ev)
    f538 = fivethirtyeight(ev)
    print(f"FiveThirtyEight: {len(f538)} partidos emparejados", flush=True)

    # ensambles (el peso de la mezcla se elige solo con 2019-2021)
    modelos_puros = [n for n in fuentes if not n.startswith("Mercado") and not n.startswith("Ensamble")]
    comunes = [k for k in resultado if all(k in fuentes[n] for n in fuentes)]
    fuentes["Ensamble de modelos"] = {k: np.mean([fuentes[n][k] for n in modelos_puros], axis=0) for k in comunes}
    # el que sirve en producción: solo modelos que dan marcador exacto (Elo y pi no)
    de_goles = list(MODELOS_GOLES) + ["Nuestro Dixon-Coles"]
    fuentes["Ensamble de modelos de goles"] = {k: np.mean([fuentes[n][k] for n in de_goles], axis=0) for k in comunes}
    viejos = [k for k in comunes if k < f"{CORTE:%Y-%m-%d}"]
    mejor_w, mejor_rps = 0.0, 9.0
    for w in np.arange(0, 1.01, 0.05):
        P = np.vstack([w * fuentes["Ensamble de modelos"][k] + (1 - w) * fuentes["Mercado · Pinnacle (Shin)"][k] for k in viejos])
        r = metricas(P, np.array([resultado[k] for k in viejos]))["rps"]
        if r < mejor_rps: mejor_w, mejor_rps = float(w), r
    fuentes[f"Mezcla ensamble {mejor_w:.0%} + Pinnacle"] = {
        k: mejor_w * fuentes["Ensamble de modelos"][k] + (1 - mejor_w) * fuentes["Mercado · Pinnacle (Shin)"][k] for k in comunes}

    prueba = [k for k in comunes if k >= f"{CORTE:%Y-%m-%d}"]
    tabla = calificar(fuentes, resultado, prueba)
    # sobre los partidos que también predijo FiveThirtyEight
    con_538 = [k for k in comunes if k in f538]
    tabla_538 = calificar({**fuentes, "FiveThirtyEight SPI": f538}, resultado, con_538)

    salida = {"periodo_prueba": f"{prueba[0][:10]} a {prueba[-1][:10]}", "n_prueba": len(prueba),
              "periodo_538": f"{con_538[0][:10]} a {con_538[-1][:10]}" if con_538 else "—", "n_538": len(con_538),
              "peso_ensamble": mejor_w, "tabla": tabla, "tabla_538": tabla_538, "kaunitz": estrategia_kaunitz(h[h.fecha >= "2016-01-01"])}
    (RAIZ / "datos" / "comparativa.json").write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"\n=== Prueba {salida['periodo_prueba']} · {len(prueba)} partidos (los mismos para todos) ===")
    print(f"{'modelo':38s} {'RPS':>7s} {'log-loss':>9s} {'Brier':>7s} {'acierto':>8s}")
    for r in tabla: print(f"{r['modelo'][:38]:38s} {r['rps']:.4f} {r['log_loss']:9.4f} {r['brier']:.4f} {r['acierto']*100:7.1f}%")
    print(f"\n=== Contra FiveThirtyEight · {salida['periodo_538']} · {len(con_538)} partidos ===")
    for r in tabla_538: print(f"{r['modelo'][:38]:38s} {r['rps']:.4f} {r['log_loss']:9.4f} {r['brier']:.4f} {r['acierto']*100:7.1f}%")
    print("\n=== Estrategia Kaunitz en Liga MX ===")
    for r in salida["kaunitz"]: print(f"  α={r['alfa']:.2f} {r['periodo']:8s} n={r['n']:5d} yield {r['yield_pct']:+6.2f}% t={r['t']:+.2f} acierto {r['acierto_pct']}% cuota {r['cuota_media']}")
    print(f"\ntiempo total {time.time()-t0:.0f} s")
