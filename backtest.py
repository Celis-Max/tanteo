"""
Evalúa el modelo como si hubiéramos apostado en vivo y guarda el reporte en
datos/backtest.json (lo lee la página). Tarda varios minutos la primera vez.

- El decaimiento (xi) se elige con 2016-2021 y se evalúa con 2021 en adelante,
  para no afinar con los mismos datos con los que se presume.
- El rival es el mercado: la cuota de cierre promedio, sin margen.
"""
from __future__ import annotations

import json
import os
import pickle
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd

import datos as dat
import validacion as val

RAIZ = Path(__file__).resolve().parent
CACHE = RAIZ / "datos" / "walkforward.pkl"
SALIDA = RAIZ / "datos" / "backtest.json"

XIS = (0.0015, 0.0025, 0.0035, 0.005)
CORTE_AFINADO = "2021-07-01"
UMBRAL = 0.05
KELLY = 0.25


def _un_xi(arg):
    """Un solo recorrido del walk-forward. Tiene que estar al nivel del módulo
    para que se pueda enviar a otro proceso."""
    hist, xi = arg
    d = val.walk_forward(hist, xi, "2016-01-01")
    print(f"  xi={xi} listo ({len(d):,} partidos)", flush=True)
    return xi, d


def predicciones(hist: pd.DataFrame, refrescar: bool = False) -> dict[float, pd.DataFrame]:
    if CACHE.exists() and not refrescar:
        with open(CACHE, "rb") as f:
            return pickle.load(f)

    # Cada xi es un recorrido independiente sobre el mismo histórico, y
    # `walk_forward` no toca nada de fuera: se reparten entre procesos sin más.
    # Medido en el servidor, un recorrido se lleva un núcleo entero al 100%
    # mientras el otro miraba; en serie se desperdiciaba la mitad de la máquina.
    #
    # Procesos = min(núcleos, cuántos xi hay). Más procesos que núcleos solo
    # haría que se peleen por la CPU, y cada uno carga su copia del histórico
    # (unos 265 MB medidos), así que tampoco conviene abrir de más.
    n = min(len(XIS), os.cpu_count() or 1)
    print(f"  caminando en el tiempo: {len(XIS)} valores de xi en {n} proceso(s)…", flush=True)

    if n > 1:
        with Pool(n) as pool:
            todo = dict(pool.map(_un_xi, [(hist, xi) for xi in XIS]))
    else:
        todo = dict(_un_xi((hist, xi)) for xi in XIS)

    CACHE.parent.mkdir(exist_ok=True)
    with open(CACHE, "wb") as f:
        pickle.dump(todo, f)
    return todo


def correr(refrescar: bool = False) -> dict:
    hist = dat.historico()
    todo = predicciones(hist, refrescar)

    # 1. elegir decaimiento con el periodo viejo
    afinado = {xi: val.metricas(d[d.fecha < CORTE_AFINADO], "m") for xi, d in todo.items()}
    xi = min(afinado, key=lambda k: afinado[k]["log_loss"])
    d = todo[xi]
    prueba = d[d.fecha >= CORTE_AFINADO].copy()

    # 2. peso de la mezcla modelo/mercado, también elegido con el periodo viejo
    viejo = d[d.fecha < CORTE_AFINADO]
    pesos = np.arange(0, 1.01, 0.05)
    w = float(min(pesos, key=lambda w: val.metricas(val.mezcla(viejo, w), "mx")["log_loss"]))

    modelo = val.metricas(prueba, "m")
    mercado = val.metricas(prueba, "mk")
    mezclado = val.metricas(val.mezcla(prueba, w), "mx")

    apuestas = val.simular_apuestas(prueba, "m", UMBRAL, KELLY, "max")
    apuestas_mezcla = val.simular_apuestas(val.mezcla(prueba, w), "mx", UMBRAL, KELLY, "max")

    reporte = {
        "xi": xi, "vida_media_dias": round(float(np.log(2) / xi)),
        "periodo": f"{prueba.fecha.min().date()} a {prueba.fecha.max().date()}",
        "umbral": UMBRAL, "kelly": KELLY, "peso_modelo": w,
        "modelo": modelo, "mercado": mercado, "mezcla": mezclado,
        "apuestas": apuestas, "apuestas_mezcla": apuestas_mezcla,
        "calibracion": val.calibracion(prueba, "m"),
        "afinado": {str(k): v for k, v in afinado.items()},
    }
    SALIDA.write_text(json.dumps(reporte, ensure_ascii=False, indent=1), encoding="utf-8")
    return reporte


if __name__ == "__main__":
    import sys
    r = correr("--refrescar" in sys.argv)
    print(f"\ndecaimiento elegido: xi={r['xi']} (vida media {r['vida_media_dias']} días)")
    print(f"periodo de prueba: {r['periodo']}")
    for nombre in ("modelo", "mercado", "mezcla"):
        m = r[nombre]
        print(f"  {nombre:8s} log-loss {m['log_loss']:.4f} | brier {m['brier']:.4f} | acierto {m['acierto']*100:.1f}%")
    a = r["apuestas"]
    print(f"apuestas con valor: {a['apuestas']} | yield {a['yield_pct']}% | banca 100 -> {a['banca_final']} | caída máxima {a['caida_maxima_pct']}%")
