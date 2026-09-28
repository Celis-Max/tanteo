"""
Arma el paquete de datos del torneo y escribe web/index.html con todo incrustado
(se abre con doble clic, sin servidor ni internet).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

import construir_datos as cd
import simulador

RAIZ = Path(__file__).resolve().parent
XI_POR_DEFECTO = 0.0015


def escribir(datos_web: dict) -> Path:
    """Escribe `web/datos.js`, el único archivo que cambia con los datos.

    Las páginas (index, partidos, parlays, simulador) son estáticas y comparten
    `datos.js`, `comun.js` y `estilo.css`. Se cargan con <script src>, que sí
    funciona con doble clic (file://) a diferencia de fetch, así que la web
    sigue abriéndose sin servidor ni internet.
    """
    salida = RAIZ / "web" / "datos.js"
    salida.write_text(
        "const DATOS = " + json.dumps(datos_web, ensure_ascii=False) + ";\n",
        encoding="utf-8")
    return salida


if __name__ == "__main__":
    bt = {}
    ruta_bt = RAIZ / "datos" / "backtest.json"
    if ruta_bt.exists():
        bt = json.loads(ruta_bt.read_text(encoding="utf-8"))
    d = cd.construir(bt.get("xi", XI_POR_DEFECTO), bt, refrescar="--refrescar" in sys.argv)
    d["simulador"] = simulador.actualizar(d)
    (RAIZ / "datos" / "web.json").write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
    p = escribir(d)
    prox = [x for x in d["partidos"] if not x["jugado"]]
    print(f"{d['torneo']}: {d['jugados']}/{d['total']} jugados · {len(prox)} por jugar "
          f"({sum(1 for x in prox if 'cuotas' in x)} con cuotas) · datos: {p}")
