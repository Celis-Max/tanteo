"""
Monte Carlo del torneo: se juega lo que falta N veces.

Cada partido pendiente se decide sorteando un marcador exacto de su tabla de
probabilidades (así la diferencia de goles sale realista). Con la tabla final
se arma la liguilla con el formato de Liga MX y se juega también:

  1-6 directo a cuartos · 7-10 play-in (7v8: ganador es el 7; el perdedor
  va contra el ganador de 9v10 por el lugar 8) · cuartos 1v8, 2v7, 3v6, 4v5
  a ida y vuelta (empate global: pasa el mejor ubicado) · semifinales
  reordenadas · final a ida y vuelta (empate global: penales 50/50).
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd

import calendario as cal
import construir_datos as cd
import datos as dat
import modelo as mod

RAIZ = Path(__file__).resolve().parent


class Simulador:
    """
    incertidumbre: desviación de la fuerza de cada equipo entre bloques de
    simulación. Sin esto, se trata la fuerza estimada como exacta y las
    probabilidades salen demasiado seguras. 0.08 ≈ error típico de estimar
    ataque/defensa con dos temporadas de partidos.
    """
    def __init__(self, n: int = 10000, semilla: int = 2026, xi: float = 0.0015,
                 incertidumbre: float = 0.08, bloques: int = 25):
        self.n = n
        self.incertidumbre = incertidumbre
        self.bloques = bloques
        self._ruido: dict[str, tuple[float, float]] = {}
        self.rnd = np.random.default_rng(semilla)
        torneo = cal.cargar()
        self.torneo = torneo
        hist = cd.historico_completo(dat.historico(), torneo)
        hoy = pd.Timestamp.now().normalize() + pd.Timedelta(days=1)
        self.equipos = sorted({e for p in torneo["partidos"] for e in (p["local"], p["visita"])})
        self.modelo = mod.DixonColes(dat.equipos_activos(hist, hoy), xi=xi).ajustar(hist, hoy)
        self._cache: dict[tuple[str, str], np.ndarray] = {}

    def nuevo_bloque(self):
        """Sortea una versión plausible de la fuerza de cada equipo."""
        s = self.incertidumbre
        self._ruido = {e: (self.rnd.normal(0, s), self.rnd.normal(0, s)) for e in self.equipos}
        self._cache = {}

    def matriz(self, local: str, visita: str) -> np.ndarray:
        clave = (local, visita)
        if clave not in self._cache:
            lh, la = self.modelo.lambdas(local, visita)
            (al, dl), (av, dv) = self._ruido.get(local, (0, 0)), self._ruido.get(visita, (0, 0))
            lh *= np.exp(al - dv); la *= np.exp(av - dl)       # ataque propio contra defensa rival
            rho = self.modelo._desempaquetar(self.modelo.params)[4]
            g = np.arange(9)
            from scipy.stats import poisson
            m = np.outer(poisson.pmf(g, lh), poisson.pmf(g, la))
            m[0, 0] *= 1 - lh * la * rho; m[1, 0] *= 1 + la * rho; m[0, 1] *= 1 + lh * rho; m[1, 1] *= 1 - rho
            self._cache[clave] = m / m.sum()
        return self._cache[clave]

    def sortear(self, local: str, visita: str, veces: int):
        """Marcadores (goles local, goles visita) sorteados de la matriz del partido."""
        m = self.matriz(local, visita)
        idx = self.rnd.choice(m.size, size=veces, p=m.ravel())
        return idx // m.shape[1], idx % m.shape[1]

    # ---------------------------------------------------------------- fase regular
    def fase_regular(self):
        n, eq = self.n, self.equipos
        pos = {e: i for i, e in enumerate(eq)}
        pts = np.zeros((n, len(eq))); gf = np.zeros((n, len(eq))); gc = np.zeros((n, len(eq)))
        tam = int(np.ceil(n / self.bloques))
        pendientes = [p["jornada"] for p in self.torneo["partidos"] if not p["jugado"]]
        limite = (min(pendientes) + 1) if pendientes else 0
        self.resultados_sim = {}                      # índice del partido → +1 gana local, 0 empate, -1 gana visita
        for n_p, p in enumerate(self.torneo["partidos"]):
            i, j = pos[p["local"]], pos[p["visita"]]
            if p["jugado"]:
                a = np.full(n, p["gl"]); b = np.full(n, p["gv"])
            else:
                a = np.empty(n, dtype=int); b = np.empty(n, dtype=int)
                for k, ruido in enumerate(self._ruidos):
                    self._ruido = ruido; self._cache = self._caches[k]
                    ini, fin = k * tam, min(n, (k + 1) * tam)
                    a[ini:fin], b[ini:fin] = self.sortear(p["local"], p["visita"], fin - ini)
                if p["jornada"] <= limite:
                    self.resultados_sim[n_p] = np.sign(a - b)
            gf[:, i] += a; gc[:, i] += b; gf[:, j] += b; gc[:, j] += a
            pts[:, i] += np.where(a > b, 3, np.where(a == b, 1, 0))
            pts[:, j] += np.where(b > a, 3, np.where(a == b, 1, 0))
        # desempate: puntos, diferencia, goles a favor (más un sorteo mínimo para no dejar empates)
        clave = pts * 1e6 + (gf - gc) * 1e3 + gf + self.rnd.random(pts.shape) * 1e-3
        orden = np.argsort(-clave, axis=1)                   # orden[s] = equipos del 1º al último
        return orden, pts

    # ---------------------------------------------------------------- liguilla
    def partido_unico(self, local, visita):
        a, b = self.sortear(local, visita, 1)
        if a[0] != b[0]:
            return local if a[0] > b[0] else visita
        return local if self.rnd.random() < 0.5 else visita   # penales

    def ida_y_vuelta(self, mejor, peor, final=False):
        """El mejor sembrado cierra en casa. Empate global: pasa el mejor (o penales en la final)."""
        a1, b1 = self.sortear(peor, mejor, 1)                 # ida en casa del peor
        a2, b2 = self.sortear(mejor, peor, 1)                 # vuelta en casa del mejor
        g_mejor, g_peor = b1[0] + a2[0], a1[0] + b2[0]
        if g_mejor != g_peor:
            return mejor if g_mejor > g_peor else peor
        if final:
            return mejor if self.rnd.random() < 0.5 else peor
        return mejor

    def liguilla(self, tabla: list[str]) -> dict[str, str]:
        """tabla: equipos del 1º al último. Devuelve hasta dónde llegó cada uno."""
        llego = {e: "fuera" for e in tabla}
        for e in tabla[6:10]:
            llego[e] = "play-in"
        g78 = self.partido_unico(tabla[6], tabla[7]); p78 = tabla[7] if g78 == tabla[6] else tabla[6]
        g910 = self.partido_unico(tabla[8], tabla[9])
        ultimo = self.partido_unico(p78, g910)
        sembrados = tabla[:6] + [g78, ultimo]
        for e in sembrados:
            llego[e] = "cuartos"
        rango = {e: i for i, e in enumerate(sembrados)}
        cuartos = [self.ida_y_vuelta(sembrados[a], sembrados[b]) for a, b in ((0, 7), (1, 6), (2, 5), (3, 4))]
        for e in cuartos:
            llego[e] = "semis"
        cuartos.sort(key=lambda e: rango[e])                  # semifinales reordenadas
        semis = [self.ida_y_vuelta(cuartos[0], cuartos[3]), self.ida_y_vuelta(cuartos[1], cuartos[2])]
        for e in semis:
            llego[e] = "final"
        semis.sort(key=lambda e: rango[e])
        campeon = self.ida_y_vuelta(semis[0], semis[1], final=True)
        llego[campeon] = "campeón"
        return llego

    # ---------------------------------------------------------------- todo
    def correr(self) -> dict:
        # una "versión del mundo" por bloque: misma fuerza para liga y liguilla de ese bloque
        self._ruidos, self._caches = [], []
        for _ in range(self.bloques):
            self.nuevo_bloque(); self._ruidos.append(self._ruido); self._caches.append({})
        orden, pts = self.fase_regular()
        tam = int(np.ceil(self.n / self.bloques))
        eq = self.equipos
        n_eq = len(eq)
        posiciones = np.zeros((n_eq, n_eq))
        rondas = defaultdict(lambda: defaultdict(int))
        nivel = {"fuera": 0, "play-in": 1, "cuartos": 2, "semis": 3, "final": 4, "campeón": 5}
        llegada = np.zeros((self.n, n_eq), dtype=np.int8)
        top6 = np.zeros((self.n, n_eq), dtype=bool)
        for s in range(self.n):
            k = min(s // tam, self.bloques - 1)
            self._ruido, self._cache = self._ruidos[k], self._caches[k]
            tabla = [eq[k2] for k2 in orden[s]]
            for lugar, e in enumerate(tabla):
                posiciones[eq.index(e), lugar] += 1
                if lugar < 6:
                    top6[s, eq.index(e)] = True
            for e, r in self.liguilla(tabla).items():
                rondas[e][r] += 1
                llegada[s, eq.index(e)] = nivel[r]
        escala = ["fuera", "play-in", "cuartos", "semis", "final", "campeón"]
        salida = []
        for i, e in enumerate(eq):
            dist = posiciones[i] / self.n
            llego = rondas[e]
            al_menos = lambda r: sum(llego[x] for x in escala[escala.index(r):]) / self.n
            salida.append({
                "equipo": e,
                "puntos_esperados": round(float(pts[:, i].mean()), 1),
                "puntos_p10": int(np.percentile(pts[:, i], 10)), "puntos_p90": int(np.percentile(pts[:, i], 90)),
                "lugar_esperado": round(float((dist * np.arange(1, n_eq + 1)).sum()), 1),
                "posiciones": [round(float(x), 4) for x in dist],
                "lider": round(float(dist[0]), 4),
                "top6": round(float(dist[:6].sum()), 4),
                "playin": round(float(dist[6:10].sum()), 4),
                "eliminado": round(float(dist[10:].sum()), 4),
                "cuartos": round(al_menos("cuartos"), 4),
                "semis": round(al_menos("semis"), 4),
                "final": round(al_menos("final"), 4),
                "campeon": round(al_menos("campeón"), 4),
            })
        salida.sort(key=lambda x: x["lugar_esperado"])

        # lo que está en juego: probabilidad de liguilla según el resultado del partido
        en_juego = {}
        for n_p, res in self.resultados_sim.items():
            p = self.torneo["partidos"][n_p]
            d = {}
            for lado, e, signo in (("local", p["local"], 1), ("visita", p["visita"], -1)):
                k = eq.index(e)
                cond = {}
                for etiqueta, mask in (("gana", res == signo), ("empata", res == 0), ("pierde", res == -signo)):
                    if mask.sum() >= 50:
                        cond[etiqueta] = {"liguilla": round(float((llegada[mask, k] >= 2).mean()), 4),
                                          "top6": round(float(top6[mask, k].mean()), 4),
                                          "campeon": round(float((llegada[mask, k] == 5).mean()), 4)}
                d[lado] = {"equipo": e, "base_liguilla": round(float((llegada[:, k] >= 2).mean()), 4), **cond}
                if "gana" in cond and "pierde" in cond:
                    d[lado]["importancia"] = round(cond["gana"]["liguilla"] - cond["pierde"]["liguilla"], 4)
            en_juego[f"{p['local']}|{p['visita']}"] = d
        return {"simulaciones": self.n, "equipos": salida, "incertidumbre": self.incertidumbre, "en_juego": en_juego,
                "pendientes": sum(1 for p in self.torneo["partidos"] if not p["jugado"])}


def banca_montecarlo(apuestas_historicas: pd.DataFrame, n_apuestas: int = 150, caminos: int = 20000,
                     stake_pct: float = 0.02, semilla: int = 7) -> dict:
    """
    Remuestrea apuestas reales de una estrategia para ver el abanico de destinos:
    ¿qué tan probable es terminar arriba después de una temporada de apuestas?
    """
    if len(apuestas_historicas) < 30:
        return {}
    rnd = np.random.default_rng(semilla)
    cuotas = apuestas_historicas.cuota.to_numpy()
    gana = apuestas_historicas.gana.to_numpy()
    idx = rnd.integers(0, len(cuotas), size=(caminos, n_apuestas))
    retorno = np.where(gana[idx], cuotas[idx] - 1, -1.0)
    banca = np.cumprod(1 + stake_pct * retorno, axis=1) * 100
    final = banca[:, -1]
    caida = 1 - (banca / np.maximum.accumulate(banca, axis=1)).min(axis=1)
    return {
        "apuestas": n_apuestas, "stake_pct": stake_pct, "caminos": caminos,
        "prob_ganar": round(float((final > 100).mean()), 4),
        "mediana": round(float(np.median(final)), 1),
        "p10": round(float(np.percentile(final, 10)), 1), "p90": round(float(np.percentile(final, 90)), 1),
        "prob_perder_mitad": round(float((final < 50).mean()), 4),
        "caida_mediana_pct": round(100 * float(np.median(caida)), 1),
        "abanico": [[round(float(np.percentile(banca[:, t], q)), 1) for q in (10, 50, 90)]
                    for t in range(0, n_apuestas, max(1, n_apuestas // 50))],
    }


if __name__ == "__main__":
    import sys
    import time
    import estrategias as es

    n = int(sys.argv[1]) if len(sys.argv) > 1 else 10000
    t0 = time.time()
    r = Simulador(n=n).correr()
    print(f"{r['simulaciones']} torneos simulados ({r['pendientes']} partidos pendientes) en {time.time()-t0:.0f}s\n")
    print(f"{'equipo':20s} {'pts esp':>7s} {'rango 80%':>10s} {'líder':>6s} {'top 6':>6s} {'play-in':>7s} {'cuartos':>7s} {'semis':>6s} {'final':>6s} {'campeón':>7s}")
    for e in r["equipos"]:
        print(f"{e['equipo'][:20]:20s} {e['puntos_esperados']:7.1f} {e['puntos_p10']:4d}–{e['puntos_p90']:<4d} "
              f"{e['lider']*100:5.1f}% {e['top6']*100:5.1f}% {e['playin']*100:6.1f}% {e['cuartos']*100:6.1f}% "
              f"{e['semis']*100:5.1f}% {e['final']*100:5.1f}% {e['campeon']*100:6.1f}%")

    # banca: remuestreo de apuestas reales de cada estrategia (periodo de prueba)
    h = es.preparar(); nuevo = h[h.fecha >= es.CORTE]
    bancas = {
        "fav_valor": banca_montecarlo(es.favorito_con_valor(nuevo, "max", 0.02)),
        "fav_avg": banca_montecarlo(es.favorito(nuevo, "avg", (1.3, 1.8))),
        "sorpresas_avg": banca_montecarlo(es.por_rango_de_cuota(nuevo, "avg", 3.0, 5.0)),
        "parlay3_avg": banca_montecarlo(es.parlay_favoritos(nuevo, "avg", 3)),
    }
    print("\nbanca de 100, 150 apuestas al 2% (remuestreo de apuestas reales):")
    for k, b in bancas.items():
        if b: print(f"  {k:14s} P(terminar arriba) {b['prob_ganar']*100:5.1f}% · mediana {b['mediana']:6.1f} · 80% entre {b['p10']:.0f} y {b['p90']:.0f} · P(perder la mitad) {b['prob_perder_mitad']*100:.1f}%")
    print("\nlo que está en juego en la próxima jornada (probabilidad de liguilla si gana → si pierde):")
    for clave, d in list(r["en_juego"].items())[:9]:
        l, v = d["local"], d["visita"]
        if "gana" in l and "pierde" in l:
            print(f"  {l['equipo'][:16]:16s} {l['gana']['liguilla']*100:5.1f}% → {l['pierde']['liguilla']*100:5.1f}%  |  "
                  f"{v['equipo'][:16]:16s} {v['gana']['liguilla']*100:5.1f}% → {v['pierde']['liguilla']*100:5.1f}%")
    (RAIZ / "datos" / "montecarlo.json").write_text(json.dumps({**r, "bancas": bancas}, ensure_ascii=False), encoding="utf-8")
