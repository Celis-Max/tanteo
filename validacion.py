"""
Validación caminando en el tiempo (walk-forward).

Regla de oro: para predecir la jornada del día X, el modelo solo ve partidos
anteriores a X. Se reajusta cada semana. Así el resultado se parece a lo que
pasaría apostando en vivo, no a un ajuste con el diario de ayer.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import datos as dat
import modelo as mod

RESULTADOS = ["1", "X", "2"]


def walk_forward(hist: pd.DataFrame, xi: float, desde: str, hasta: str | None = None, dias: int = 7) -> pd.DataFrame:
    desde = pd.Timestamp(desde)
    hasta = pd.Timestamp(hasta) if hasta else hist.fecha.max() + pd.Timedelta(days=1)
    filas, params = [], None
    corte = desde
    while corte < hasta:
        fin = corte + pd.Timedelta(days=dias)
        ventana = hist[(hist.fecha >= corte) & (hist.fecha < fin)]
        if len(ventana):
            equipos = dat.equipos_activos(hist, corte)
            try:
                m = mod.DixonColes(equipos, xi=xi).ajustar(hist, corte, inicio=params)
                params = m.params
            except ValueError:
                corte = fin; continue
            for _, p in ventana.iterrows():
                if p.equipo_local not in m.idx or p.equipo_visita not in m.idx:
                    continue
                pm = mod.probabilidades(m.matriz(p.equipo_local, p.equipo_visita))
                real = "1" if p.gl > p.gv else ("X" if p.gl == p.gv else "2")
                fila = {"fecha": p.fecha, "local": p.equipo_local, "visita": p.equipo_visita,
                        "gl": p.gl, "gv": p.gv, "real": real,
                        "total": p.gl + p.gv, "btts": int(p.gl > 0 and p.gv > 0)}
                fila |= {f"m_{k}": pm[k] for k in ("1", "X", "2", "O25", "BTTS")}
                for tipo in ("avg", "max", "ps"):
                    for r in RESULTADOS:
                        fila[f"c_{tipo}_{r}"] = p.get(f"c_{tipo}_{r}", np.nan)
                filas.append(fila)
        corte = fin
    d = pd.DataFrame(filas)
    if len(d):
        imp = np.array([mod.sin_margen([r[f"c_avg_{k}"] for k in RESULTADOS]) for _, r in d.iterrows()])
        for i, k in enumerate(RESULTADOS):
            d[f"mk_{k}"] = imp[:, i]
    return d


def _prob_real(d: pd.DataFrame, prefijo: str) -> np.ndarray:
    return np.array([r[f"{prefijo}_{r['real']}"] for _, r in d.iterrows()])


def metricas(d: pd.DataFrame, prefijo: str) -> dict:
    p = np.clip(_prob_real(d, prefijo), 1e-9, 1)
    probs = d[[f"{prefijo}_{k}" for k in RESULTADOS]].to_numpy()
    y = np.array([[1.0 if r["real"] == k else 0.0 for k in RESULTADOS] for _, r in d.iterrows()])
    return {
        "n": int(len(d)),
        "log_loss": float(-np.mean(np.log(p))),
        "brier": float(np.mean(np.sum((probs - y) ** 2, axis=1))),
        "acierto": float(np.mean(probs.argmax(axis=1) == y.argmax(axis=1))),
    }


def mezcla(d: pd.DataFrame, w: float) -> pd.DataFrame:
    """w = peso del modelo; 1-w = peso del mercado (cuotas sin margen)."""
    e = d.copy()
    for k in RESULTADOS:
        e[f"mx_{k}"] = w * d[f"m_{k}"] + (1 - w) * d[f"mk_{k}"]
    return e


def calibracion(d: pd.DataFrame, prefijo: str, bins: int = 10) -> list[dict]:
    """¿Cuándo digo 60%, pasa el 60% de las veces?"""
    pr, ac = [], []
    for k in RESULTADOS:
        pr.append(d[f"{prefijo}_{k}"].to_numpy())
        ac.append((d.real == k).astype(float).to_numpy())
    pr = np.concatenate(pr); ac = np.concatenate(ac)
    bordes = np.linspace(0, 1, bins + 1)
    salida = []
    for i in range(bins):
        m = (pr >= bordes[i]) & (pr < bordes[i + 1])
        if m.sum() >= 20:
            salida.append({"desde": float(bordes[i]), "hasta": float(bordes[i + 1]),
                           "predicho": float(pr[m].mean()), "real": float(ac[m].mean()), "n": int(m.sum())})
    return salida


def simular_apuestas(d: pd.DataFrame, prefijo: str, umbral: float = 0.05, kelly: float = 0.25,
                     cuota: str = "max", banca: float = 100.0) -> dict:
    """Apuesta cuando la probabilidad del modelo supera a la cuota; stake de Kelly fraccionado."""
    banca_actual = banca
    historial, apuestas, retornos = [], 0, []
    ganadas = 0
    invertido = beneficio = 0.0
    pico = banca; caida_max = 0.0
    for _, r in d.sort_values("fecha").iterrows():
        for k in RESULTADOS:
            c = r.get(f"c_{cuota}_{k}", np.nan)
            p = r[f"{prefijo}_{k}"]
            if not (isinstance(c, (int, float)) and c > 1) or np.isnan(c):
                continue
            ventaja = p * c - 1
            if ventaja <= umbral:
                continue
            f = max(0.0, min(0.05, kelly * (p * c - 1) / (c - 1)))  # tope 5% de la banca
            stake = banca_actual * f
            if stake <= 0.01:
                continue
            apuestas += 1; invertido += stake
            if r["real"] == k:
                gana = stake * (c - 1); ganadas += 1
            else:
                gana = -stake
            retornos.append(gana / stake)
            beneficio += gana; banca_actual += gana
            pico = max(pico, banca_actual)
            caida_max = max(caida_max, (pico - banca_actual) / pico)
            historial.append({"fecha": str(r["fecha"].date()), "banca": round(banca_actual, 2)})
    # ¿El yield es señal o ruido? t = media / (desviación / raíz(n))
    r = np.array(retornos)
    t = float(r.mean() / (r.std(ddof=1) / np.sqrt(len(r)))) if len(r) > 2 and r.std() > 0 else 0.0
    return {
        "apuestas": apuestas, "ganadas": ganadas,
        "t": round(t, 2), "significativo": bool(abs(t) > 2),
        "retorno_medio_pct": round(100 * float(r.mean()), 2) if len(r) else 0.0,
        "acierto": round(ganadas / apuestas, 4) if apuestas else 0,
        "invertido": round(invertido, 2), "beneficio": round(beneficio, 2),
        "yield_pct": round(100 * beneficio / invertido, 2) if invertido else 0,
        "banca_final": round(banca_actual, 2),
        "crecimiento_pct": round(100 * (banca_actual / banca - 1), 2),
        "caida_maxima_pct": round(100 * caida_max, 2),
        "curva": historial[::max(1, len(historial) // 120)] if historial else [],
    }
