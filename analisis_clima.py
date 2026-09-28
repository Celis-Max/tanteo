"""
¿El clima influye en Liga MX más allá de lo que ya sabe la cuota?

1. Se baja el clima histórico hora por hora de cada estadio (Open-Meteo, 2016-2026).
2. Se cruza con la hora real de cada partido (football-data da hora de Londres).
3. Se mide: (a) cómo cambian los goles con lluvia, calor, viento y altura;
   (b) si eso agrega algo encima de lo que predecía el modelo para "más de 2.5";
   (c) si agrega algo encima de la cuota de Pinnacle para el 1X2.
"""
from __future__ import annotations

import json
import pickle
import time
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm

import clima as cl
import estrategias as es

RAIZ = Path(__file__).resolve().parent
DIR = RAIZ / "datos" / "clima_historico"
DESDE, HASTA = "2016-01-01", "2026-09-20"


def bajar_estadios() -> dict[str, pd.DataFrame]:
    DIR.mkdir(parents=True, exist_ok=True)
    salida = {}
    for equipo, (lat, lon, alt, nombre) in cl.ESTADIOS.items():
        f = DIR / f"{equipo.replace(' ', '_')}.json"
        if not f.exists():
            url = (f"https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={lon}"
                   f"&start_date={DESDE}&end_date={HASTA}&hourly=temperature_2m,precipitation,wind_speed_10m,relative_humidity_2m"
                   f"&timezone=America%2FMexico_City")
            d = {}
            for intento in range(6):            # el plan gratuito limita peticiones por minuto
                d = cl._json_url(url)
                if "hourly" in d:
                    break
                time.sleep(20 + 15 * intento)
            if "hourly" not in d:
                print("  sin datos:", equipo, str(d)[:120]); continue
            f.write_text(json.dumps(d["hourly"]), encoding="utf-8")
            time.sleep(8)
        h = json.loads(f.read_text(encoding="utf-8"))
        df = pd.DataFrame(h)
        df["time"] = pd.to_datetime(df["time"])
        salida[equipo] = df.set_index("time")
        print(f"  {equipo:20s} {len(df):6d} horas")
    return salida


def partidos_con_clima(climas: dict[str, pd.DataFrame]) -> pd.DataFrame:
    crudo = pd.read_csv(RAIZ / "datos" / "mex_historico.csv", encoding="utf-8-sig")
    crudo["inicio"] = (pd.to_datetime(crudo.Date + " " + crudo.Time.fillna("01:00"), format="%d/%m/%Y %H:%M", errors="coerce")
                       .dt.tz_localize("Europe/London", ambiguous="NaT", nonexistent="NaT")
                       .dt.tz_convert("America/Mexico_City").dt.tz_localize(None))
    h = es.preparar()
    h = h.merge(crudo[["Date", "Home", "Away", "inicio"]].assign(fecha=pd.to_datetime(crudo.Date, format="%d/%m/%Y"))
                .rename(columns={"Home": "equipo_local", "Away": "equipo_visita"})[["fecha", "equipo_local", "equipo_visita", "inicio"]],
                on=["fecha", "equipo_local", "equipo_visita"], how="left")
    temp, lluvia, viento, humedad = [], [], [], []
    for _, r in h.iterrows():
        df = climas.get(r.equipo_local)
        if df is None or pd.isna(r.inicio):
            temp.append(np.nan); lluvia.append(np.nan); viento.append(np.nan); humedad.append(np.nan); continue
        t0 = r.inicio.floor("h")
        ventana = df.loc[t0: t0 + pd.Timedelta(hours=2)]
        if len(ventana) == 0:
            temp.append(np.nan); lluvia.append(np.nan); viento.append(np.nan); humedad.append(np.nan); continue
        temp.append(float(ventana.temperature_2m.mean()))
        lluvia.append(float(ventana.precipitation.sum()))          # mm durante el partido
        viento.append(float(ventana.wind_speed_10m.mean()))
        humedad.append(float(ventana.relative_humidity_2m.mean()))
    h["temp"], h["lluvia_mm"], h["viento"], h["humedad"] = temp, lluvia, viento, humedad
    h["altitud"] = h.equipo_local.map(lambda e: cl.ESTADIOS.get(e, (0, 0, np.nan))[2])
    h["goles"] = h.gl + h.gv

    wf = pickle.load(open(RAIZ / "datos" / "walkforward.pkl", "rb"))
    xi = json.loads((RAIZ / "datos" / "backtest.json").read_text())["xi"]
    pm = wf[xi][["fecha", "local", "visita", "m_O25", "m_1", "m_2"]].rename(columns={"local": "equipo_local", "visita": "equipo_visita"})
    return h.merge(pm, on=["fecha", "equipo_local", "equipo_visita"], how="left")


def logit(p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


def analizar(h: pd.DataFrame) -> dict:
    d = h.dropna(subset=["lluvia_mm", "temp", "viento"]).copy()
    d["llueve"] = (d.lluvia_mm >= 0.5).astype(float)
    d["lluvia_fuerte"] = (d.lluvia_mm >= 3).astype(float)
    d["calor"] = (d.temp >= 30).astype(float)
    d["frio"] = (d.temp <= 12).astype(float)
    d["viento_fuerte"] = (d.viento >= 20).astype(float)
    salida = {"n": int(len(d)), "descriptivo": {}, "sobre_modelo_goles": {}, "sobre_mercado_1x2": {}}

    # (a) descriptivo: goles por condición
    for nombre, mascara in (("Sin lluvia", d.lluvia_mm < 0.5), ("Lluvia (≥0.5 mm)", d.lluvia_mm >= 0.5),
                            ("Lluvia fuerte (≥3 mm)", d.lluvia_mm >= 3), ("Calor (≥30°C)", d.temp >= 30),
                            ("Templado (12–30°C)", (d.temp > 12) & (d.temp < 30)), ("Frío (≤12°C)", d.temp <= 12),
                            ("Viento ≥20 km/h", d.viento >= 20), ("Altura ≥2000 m", d.altitud >= 2000),
                            ("Altura <1000 m", d.altitud < 1000)):
        g = d[mascara]
        salida["descriptivo"][nombre] = {"n": int(len(g)), "goles": round(float(g.goles.mean()), 2),
                                         "over25_pct": round(100 * float((g.goles > 2.5).mean()), 1),
                                         "empate_pct": round(100 * float((g.real == "X").mean()), 1),
                                         "local_pct": round(100 * float((g.real == "1").mean()), 1)}
    salida["descriptivo"]["Todos"] = {"n": int(len(d)), "goles": round(float(d.goles.mean()), 2),
                                      "over25_pct": round(100 * float((d.goles > 2.5).mean()), 1),
                                      "empate_pct": round(100 * float((d.real == "X").mean()), 1),
                                      "local_pct": round(100 * float((d.real == "1").mean()), 1)}

    # (b) ¿el clima mueve los goles más allá de lo que esperaba el modelo?
    b = d.dropna(subset=["m_O25"])
    X = sm.add_constant(b[["llueve", "lluvia_fuerte", "calor", "frio", "viento_fuerte"]])
    y = (b.goles > 2.5).astype(float)
    a = sm.GLM(y, X, family=sm.families.Binomial(), offset=logit(b.m_O25)).fit()
    salida["sobre_modelo_goles"] = {c: {"coef": round(float(a.params[c]), 3), "p": round(float(a.pvalues[c]), 3)}
                                    for c in X.columns if c != "const"}
    salida["sobre_modelo_goles"]["_n"] = int(len(b))

    # (c) ¿mueve el 1X2 más allá de la cuota? (la lluvia suele "emparejar": ¿ayuda al no favorito?)
    c = d.dropna(subset=["justa_1", "justa_2"]).copy()
    c["fav_local"] = (c.justa_1 >= c.justa_2).astype(float)
    c["lluvia_x_favlocal"] = c.llueve * c.fav_local
    for ev, prob in (("gana_local", "justa_1"), ("empate", "justa_X"), ("gana_visita", "justa_2")):
        yy = (c.real == {"gana_local": "1", "empate": "X", "gana_visita": "2"}[ev]).astype(float)
        cols = ["llueve", "lluvia_fuerte", "calor", "frio", "viento_fuerte", "lluvia_x_favlocal"]
        Xc = sm.add_constant(c[cols])
        a = sm.GLM(yy, Xc, family=sm.families.Binomial(), offset=logit(c[prob])).fit()
        salida["sobre_mercado_1x2"][ev] = {k: {"coef": round(float(a.params[k]), 3), "p": round(float(a.pvalues[k]), 3)} for k in cols}
    salida["sobre_mercado_1x2"]["_n"] = int(len(c))
    return salida


if __name__ == "__main__":
    print("clima histórico por estadio:")
    climas = bajar_estadios()
    h = partidos_con_clima(climas)
    r = analizar(h)
    (RAIZ / "datos" / "clima_efecto.json").write_text(json.dumps(r, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n{r['n']} partidos con clima\n\n(a) goles por condición:")
    for k, v in r["descriptivo"].items():
        print(f"   {k:24s} n={v['n']:5d} goles {v['goles']:.2f} · +2.5 {v['over25_pct']:4.1f}% · empate {v['empate_pct']:4.1f}% · local {v['local_pct']:4.1f}%")
    print(f"\n(b) ¿agrega algo sobre lo que esperaba el modelo para +2.5? (n={r['sobre_modelo_goles']['_n']})")
    for k, v in r["sobre_modelo_goles"].items():
        if k != "_n": print(f"   {k:16s} coef {v['coef']:+.3f} p={v['p']:.3f}{'  ← SIGNIFICATIVO' if v['p']<0.05 else ''}")
    print(f"\n(c) ¿agrega algo sobre la cuota de Pinnacle? (n={r['sobre_mercado_1x2']['_n']})")
    for ev, cs in r["sobre_mercado_1x2"].items():
        if ev == "_n": continue
        sig = [f"{k} {v['coef']:+.2f} (p={v['p']:.3f})" for k, v in cs.items() if v["p"] < 0.1]
        print(f"   {ev:12s} {'; '.join(sig) if sig else 'nada con p<0.10'}")
