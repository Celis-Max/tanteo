"""
Arma el paquete completo que consume la página: torneo con todas sus jornadas,
resultados, estadísticas de contexto, probabilidades, clima y noticias.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

import calendario as cal
import clima as cl
import datos as dat
import escudos as esc
import estadisticas as est
import modelo as mod
import noticias as noti

RAIZ = Path(__file__).resolve().parent
DIAS_PRONOSTICO = 15          # Open-Meteo da pronóstico ~16 días
DIAS_NOTICIAS = 9             # noticias solo para lo que está por jugarse
GOLES_WEB = 8


def matriz_web(m: np.ndarray) -> list[list[float]]:
    r = m[:GOLES_WEB, :GOLES_WEB]
    return [[round(float(x), 6) for x in fila] for fila in (r / r.sum())]


def historico_completo(hist: pd.DataFrame, torneo: dict) -> pd.DataFrame:
    """Suma al histórico los partidos ya jugados que football-data todavía no trae."""
    ultimo = hist.fecha.max()
    nuevos = [
        {"fecha": pd.Timestamp(p["fecha"]), "equipo_local": p["local"], "equipo_visita": p["visita"],
         "gl": p["gl"], "gv": p["gv"], "temporada": "en curso"}
        for p in torneo["partidos"]
        if p["jugado"] and pd.Timestamp(p["fecha"]) > ultimo
    ]
    if not nuevos:
        return hist
    return pd.concat([hist, pd.DataFrame(nuevos)], ignore_index=True).sort_values("fecha").reset_index(drop=True)


def cuotas_de(prox: pd.DataFrame) -> dict:
    """Cuotas disponibles, indexadas por partido."""
    salida = {}
    for _, p in prox.iterrows():
        clave = f"{p.equipo_local}|{p.equipo_visita}"
        c = {}
        for tipo in ("avg", "max", "ps"):
            for k in ("1", "X", "2"):
                v = p.get(f"c_{tipo}_{k}")
                c[f"{tipo}_{k}"] = float(v) if pd.notna(v) else None
        salida[clave] = c
    return salida


MODELOS_ENSAMBLE = {
    "Poisson": "PoissonGoalsModel", "Dixon-Coles (penaltyblog)": "DixonColesGoalModel",
    "Poisson bivariado": "BivariatePoissonGoalModel", "Binomial negativa": "NegativeBinomialGoalModel",
    "Poisson cero-inflado": "ZeroInflatedPoissonGoalsModel", "Cópula Weibull": "WeibullCopulaGoalsModel",
}


def usar_ensamble() -> bool:
    """
    Se adopta solo si en la competencia le ganó (RPS) a nuestro Dixon-Coles solo.
    El ensamble que gana es el completo (modelos de goles + Elo + pi-ratings):
    los de goles casi coinciden entre sí; Elo y pi aportan otra forma de ver al equipo.
    """
    c = _leer("comparativa.json")
    rps = {r["modelo"]: r["rps"] for r in c.get("tabla", [])}
    return "Ensamble de modelos" in rps and rps["Ensamble de modelos"] < rps.get("Nuestro Dixon-Coles", 9)


def ratings_actuales(hist: pd.DataFrame):
    """Elo y pi-ratings recorriendo todo el histórico, partido a partido (mismos parámetros que en la prueba)."""
    import penaltyblog as pb
    elo, pi = pb.ratings.Elo(k=20, home_field_advantage=80), pb.ratings.PiRatingSystem()
    for r in hist.sort_values("fecha").itertuples():
        elo.update_ratings(r.equipo_local, r.equipo_visita, 0 if r.gl > r.gv else (1 if r.gl == r.gv else 2))
        pi.update_ratings(r.equipo_local, r.equipo_visita, int(r.gl - r.gv))
    return elo, pi


def ajustar_ensamble(hist: pd.DataFrame, corte: pd.Timestamp, xi: float) -> dict:
    """Los modelos de penaltyblog, ajustados con los últimos 4 años y el mismo decaimiento."""
    import warnings
    import penaltyblog as pb
    warnings.filterwarnings("ignore")
    ent = hist[(hist.fecha < corte) & (hist.fecha >= corte - pd.Timedelta(days=4 * 365))]
    args = (np.array(ent.gl, dtype=np.int64).copy(), np.array(ent.gv, dtype=np.int64).copy(),
            np.array(ent.equipo_local, dtype=str).copy(), np.array(ent.equipo_visita, dtype=str).copy(),
            np.array(pb.models.dixon_coles_weights(ent.fecha, xi, base_date=corte), dtype=np.float64).copy())
    modelos = {}
    for nombre, clase in MODELOS_ENSAMBLE.items():
        try:
            m = getattr(pb.models, clase)(*args); m.fit(); modelos[nombre] = m
        except Exception as e:
            print(f"  ensamble: {nombre} no ajustó ({str(e)[:60]})")
    return modelos


def _leer(nombre: str) -> dict:
    ruta = RAIZ / "datos" / nombre
    return json.loads(ruta.read_text(encoding="utf-8")) if ruta.exists() else {}


def construir(xi: float = 0.0015, backtest: dict | None = None, refrescar: bool = False) -> dict:
    torneo = cal.cargar(refrescar=refrescar)
    hist = historico_completo(dat.historico(), torneo)
    cuotas = cuotas_de(dat.proximos())
    hoy = pd.Timestamp.now().normalize()

    equipos = dat.equipos_activos(hist, hoy + pd.Timedelta(days=1))
    m = mod.DixonColes(equipos, xi=xi).ajustar(hist, hoy + pd.Timedelta(days=1))
    fuerzas, globales = m.fuerzas()
    rho = globales["rho"]
    ensamble = ajustar_ensamble(hist, hoy + pd.Timedelta(days=1), xi) if usar_ensamble() else {}
    elo, pi = ratings_actuales(hist) if ensamble else (None, None)

    # clima y noticias solo donde aportan: partidos cercanos
    proximos_cercanos = [p for p in torneo["partidos"]
                         if not p["jugado"] and pd.Timestamp(p["fecha"]) <= hoy + pd.Timedelta(days=DIAS_PRONOSTICO)]
    climas = cl.clima_de_varios(proximos_cercanos, refrescar=refrescar) if proximos_cercanos else {}
    equipos_pronto = sorted({e for p in torneo["partidos"]
                             if not p["jugado"] and pd.Timestamp(p["fecha"]) <= hoy + pd.Timedelta(days=DIAS_NOTICIAS)
                             for e in (p["local"], p["visita"])})
    prensa = noti.de_equipos(equipos_pronto, refrescar=refrescar) if equipos_pronto else {}

    partidos = []
    for p in torneo["partidos"]:
        fecha = pd.Timestamp(p["fecha"])
        d = {
            "jornada": p["jornada"], "fecha": p["fecha"], "hora": p["hora"],
            "local": p["local"], "visita": p["visita"], "jugado": p["jugado"],
            "gl": p["gl"], "gv": p["gv"], "estado": p["estado"],
            "sede": p["sede"], "ciudad": p["ciudad"],
        }
        # contexto: cómo llegaban (o llegan) los dos equipos
        corte = fecha if p["jugado"] else hoy + pd.Timedelta(days=1)
        if p["local"] in m.idx and p["visita"] in m.idx:
            d["contexto"] = est.contexto(hist, p["local"], p["visita"], corte)

        if not p["jugado"] and p["local"] in m.idx and p["visita"] in m.idx:
            matriz = m.matriz(p["local"], p["visita"])
            lh, la = m.lambdas(p["local"], p["visita"])
            if ensamble:
                # 1X2 de cada modelo; el ensamble es su promedio (igual que en la competencia)
                base = mod.probabilidades(matriz)
                por_modelo = {"Nuestro Dixon-Coles": [base["1"], base["X"], base["2"]]}
                for nombre, em in ensamble.items():
                    try:
                        por_modelo[nombre] = [float(x) for x in em.predict(p["local"], p["visita"], max_goals=10).home_draw_away]
                    except Exception:
                        pass
                a = elo.calculate_match_probabilities(p["local"], p["visita"])
                b = pi.calculate_match_probabilities(p["local"], p["visita"])
                por_modelo["Elo"] = [float(a["home_win"]), float(a["draw"]), float(a["away_win"])]
                por_modelo["Pi-ratings"] = [float(b["home_win"]), float(b["draw"]), float(b["away_win"])]
                objetivo = np.mean(list(por_modelo.values()), axis=0)
                objetivo = objetivo / objetivo.sum()
                # Elo y pi no dan marcadores: se estiran los goles esperados hasta reproducir el 1X2 del
                # ensamble, así goles, ambos anotan y doble oportunidad salen coherentes con él.
                matriz, (lh_e, la_e), _ = mod.ajustar_a_mercado(matriz, (lh, la), rho, objetivo)
                d["goles_ensamble"] = [round(lh_e, 2), round(la_e, 2)]
                d["por_modelo"] = {n: [round(v[0], 3), round(v[1], 3), round(v[2], 3)] for n, v in por_modelo.items()}
            d["probabilidades"] = {k: round(v, 5) for k, v in mod.probabilidades(matriz).items()}
            d["goles_esperados"] = [round(lh, 2), round(la, 2)]
            d["matriz"] = matriz_web(matriz)
            d["base_modelo"] = f"ensamble de {len(d.get('por_modelo', {}))} modelos" if ensamble else "Dixon-Coles"

            c = cuotas.get(f"{p['local']}|{p['visita']}")
            if c:
                origen = next((t for t in ("ps", "max", "avg") if all(c[f"{t}_{k}"] for k in ("1", "X", "2"))), None)
                if origen:
                    base = [c[f"{origen}_{k}"] for k in ("1", "X", "2")]
                    mercado = mod.sin_margen_shin(base)
                    matriz_aj, lam_aj, _ = mod.ajustar_a_mercado(matriz, (lh, la), rho, np.array(mercado))
                    d["cuotas"] = c
                    d["mercado"] = {k: round(float(v), 5) for k, v in zip(("1", "X", "2"), mercado)}
                    d["origen_linea"] = {"ps": "Pinnacle", "max": "mejor cuota del mercado", "avg": "promedio del mercado"}[origen]
                    d["margen_casa"] = round((sum(1 / x for x in base) - 1) * 100, 2)
                    d["ajustadas"] = {k: round(v, 5) for k, v in mod.probabilidades(matriz_aj).items()}
                    d["goles_ajustados"] = [round(lam_aj[0], 2), round(lam_aj[1], 2)]
                    d["matriz_ajustada"] = matriz_web(matriz_aj)

            clave_clima = f"{p['local']}|{p['fecha']}|{p['hora']}"
            if clave_clima in climas:
                d["clima"] = climas[clave_clima] | {"texto": cl.descripcion(climas[clave_clima])}
            else:
                sede = cl.sede_de(p.get("sede"), p["local"])
                if sede:
                    d["clima"] = {"estadio": sede[3], "altitud": sede[2], "texto": f"altura {sede[2]} m"}

            if prensa and fecha <= hoy + pd.Timedelta(days=DIAS_NOTICIAS):
                d["noticias"] = {"local": noti.resumen(prensa, p["local"]), "visita": noti.resumen(prensa, p["visita"])}

        partidos.append(d)

    tabla = cal.tabla_general(torneo["partidos"])
    ventajas = est.ventaja_local_por_equipo(hist, hoy + pd.Timedelta(days=1))
    fuerza_tabla = []
    for e in equipos:
        f = fuerzas[e]
        fuerza_tabla.append({"equipo": e, "ataque": round(f["ataque"], 3), "defensa": round(f["defensa"], 3),
                             "rating": round(f["ataque"] + f["defensa"], 3),
                             "ventaja_casa": ventajas.get(e, {}).get("ventaja"),
                             "ppp_casa": ventajas.get(e, {}).get("ppp_casa"),
                             "ppp_fuera": ventajas.get(e, {}).get("ppp_fuera")})
    fuerza_tabla.sort(key=lambda x: -x["rating"])

    jugados = sum(1 for p in torneo["partidos"] if p["jugado"])
    return {
        "generado": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "torneo": f"{torneo['torneo']} {torneo['anio']}",
        "jornadas": max(p["jornada"] for p in torneo["partidos"]),
        "jugados": jugados, "total": len(torneo["partidos"]),
        "ultimo_partido": max((p["fecha"] for p in torneo["partidos"] if p["jugado"]), default=""),
        "n_historico": int(len(hist)),
        "xi": xi, "vida_media_dias": round(float(np.log(2) / xi)),
        "ventaja_local": round(globales["local"], 3), "rho": round(rho, 3),
        "partidos": partidos, "tabla": tabla, "equipos": fuerza_tabla,
        "liguilla": [
            {"ronda": "Play-in", "cuando": "tras la jornada 17", "nota": "puestos 7 al 10"},
            {"ronda": "Cuartos de final", "cuando": "noviembre", "nota": "los 8 clasificados"},
            {"ronda": "Semifinales", "cuando": "diciembre", "nota": "por definir"},
            {"ronda": "Final", "cuando": "diciembre", "nota": "por definir"},
        ],
        "backtest": backtest or {},
        "escudos": esc.cargar(),
        "marca": esc.marca(),
        "montecarlo": _leer("montecarlo.json"),
        "comparativa": _leer("comparativa.json"),
        "clima_efecto": _leer("clima_efecto.json"),
        "aficion": _leer("aficion.json"),
        "contexto_mercado": json.loads((RAIZ / "datos" / "contexto.json").read_text(encoding="utf-8"))
                            if (RAIZ / "datos" / "contexto.json").exists() else {},
        "estrategias": json.loads((RAIZ / "datos" / "estrategias.json").read_text(encoding="utf-8"))
                       if (RAIZ / "datos" / "estrategias.json").exists() else {},
    }


if __name__ == "__main__":
    import sys
    bt = {}
    ruta = RAIZ / "datos" / "backtest.json"
    if ruta.exists():
        bt = json.loads(ruta.read_text(encoding="utf-8"))
    d = construir(bt.get("xi", 0.0015), bt, refrescar="--refrescar" in sys.argv)
    (RAIZ / "datos" / "web.json").write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
    print(f"{d['torneo']}: {d['jugados']}/{d['total']} jugados · {d['jornadas']} jornadas")
    prox = [p for p in d["partidos"] if not p["jugado"]]
    print(f"con probabilidades: {sum(1 for p in prox if 'probabilidades' in p)} · con cuotas: {sum(1 for p in prox if 'cuotas' in p)} · con clima: {sum(1 for p in prox if 'clima' in p)} · con noticias: {sum(1 for p in prox if 'noticias' in p)}")
