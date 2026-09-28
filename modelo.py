"""
Modelo Dixon-Coles para Liga MX.

Cada equipo tiene fuerza de ataque y de defensa; los goles de local y visitante
salen de dos Poisson acopladas por el factor tau (corrige los marcadores bajos,
que en la vida real ocurren más de lo que dice Poisson puro). Los partidos viejos
pesan menos: el decaimiento es exponencial por día.
"""
from __future__ import annotations

import numpy as np
from scipy.optimize import minimize
from scipy.special import gammaln
from scipy.stats import poisson

MAX_GOLES = 10


def tau(hg, ag, lh, la, rho):
    """Corrección Dixon-Coles para 0-0, 1-0, 0-1 y 1-1."""
    t = np.ones_like(lh, dtype=float)
    m00 = (hg == 0) & (ag == 0); t[m00] = 1 - lh[m00] * la[m00] * rho
    m10 = (hg == 1) & (ag == 0); t[m10] = 1 + la[m10] * rho
    m01 = (hg == 0) & (ag == 1); t[m01] = 1 + lh[m01] * rho
    m11 = (hg == 1) & (ag == 1); t[m11] = 1 - rho
    return np.maximum(t, 1e-10)


class DixonColes:
    def __init__(self, equipos, xi=0.0025):
        self.equipos = list(equipos)
        self.idx = {e: i for i, e in enumerate(self.equipos)}
        self.xi = xi          # decaimiento por día
        self.params = None

    # ---------- ajuste ----------
    def _desempaquetar(self, p):
        n = len(self.equipos)
        ataque = np.append(p[: n - 1], -p[: n - 1].sum())   # suma cero: identifica el modelo
        defensa = p[n - 1 : 2 * n - 1]
        return ataque, defensa, p[-3], p[-2], p[-1]          # local, mu, rho

    def _log_verosimilitud(self, p, ih, ia, hg, ag, w, lgh, lga):
        ataque, defensa, local, mu, rho = self._desempaquetar(p)
        lh = np.exp(mu + local + ataque[ih] - defensa[ia])
        la = np.exp(mu + ataque[ia] - defensa[ih])
        lh = np.clip(lh, 1e-6, 12); la = np.clip(la, 1e-6, 12)
        # log Poisson a mano (scipy.stats es ~20x más lento llamándolo miles de veces)
        ll = (hg * np.log(lh) - lh - lgh) + (ag * np.log(la) - la - lga) + np.log(tau(hg, ag, lh, la, rho))
        return -np.sum(w * ll)

    def ajustar(self, partidos, hasta, inicio=None):
        """partidos: DataFrame con columnas equipo_local, equipo_visita, gl, gv, fecha."""
        d = partidos[partidos.fecha < hasta]
        d = d[d.equipo_local.isin(self.idx) & d.equipo_visita.isin(self.idx)]
        if len(d) < 60:
            raise ValueError("pocos partidos para ajustar")
        dias = (hasta - d.fecha).dt.days.to_numpy()
        w = np.exp(-self.xi * dias)
        ih = d.equipo_local.map(self.idx).to_numpy()
        ia = d.equipo_visita.map(self.idx).to_numpy()
        hg = d.gl.to_numpy(); ag = d.gv.to_numpy()

        n = len(self.equipos)
        p0 = inicio if inicio is not None and len(inicio) == 2 * n + 2 else np.concatenate(
            [np.zeros(n - 1), np.zeros(n), [0.25, 0.1, -0.05]])
        lim = [(-2, 2)] * (n - 1) + [(-2, 2)] * n + [(-0.5, 1.0), (-1.5, 1.5), (-0.4, 0.4)]
        lgh = gammaln(hg + 1.0); lga = gammaln(ag + 1.0)
        r = minimize(self._log_verosimilitud, p0, args=(ih, ia, hg, ag, w, lgh, lga),
                     method="L-BFGS-B", bounds=lim, options={"maxiter": 400, "ftol": 1e-9})
        self.params = r.x
        return self

    # ---------- predicción ----------
    def lambdas(self, local, visita):
        ataque, defensa, vlocal, mu, _ = self._desempaquetar(self.params)
        i, j = self.idx[local], self.idx[visita]
        return float(np.exp(mu + vlocal + ataque[i] - defensa[j])), float(np.exp(mu + ataque[j] - defensa[i]))

    def matriz(self, local, visita):
        """Probabilidad de cada marcador exacto (0..MAX_GOLES)."""
        lh, la = self.lambdas(local, visita)
        _, _, _, _, rho = self._desempaquetar(self.params)
        g = np.arange(MAX_GOLES + 1)
        m = np.outer(poisson.pmf(g, lh), poisson.pmf(g, la))
        m[0, 0] *= 1 - lh * la * rho
        m[1, 0] *= 1 + la * rho
        m[0, 1] *= 1 + lh * rho
        m[1, 1] *= 1 - rho
        return m / m.sum()

    def fuerzas(self):
        ataque, defensa, vlocal, mu, rho = self._desempaquetar(self.params)
        return {e: {"ataque": float(ataque[i]), "defensa": float(defensa[i])} for i, e in enumerate(self.equipos)}, \
               {"local": float(vlocal), "mu": float(mu), "rho": float(rho)}


# ---------- mercados derivados de la matriz de marcadores ----------

def mascaras(n=MAX_GOLES + 1):
    gl, gv = np.meshgrid(np.arange(n), np.arange(n), indexing="ij")
    total = gl + gv
    return {
        "1": gl > gv, "X": gl == gv, "2": gl < gv,
        "1X": gl >= gv, "12": gl != gv, "X2": gl <= gv,
        "O15": total > 1.5, "U15": total < 1.5,
        "O25": total > 2.5, "U25": total < 2.5,
        "O35": total > 3.5, "U35": total < 3.5,
        "BTTS": (gl > 0) & (gv > 0), "NOBTTS": (gl == 0) | (gv == 0),
    }


MASCARAS = mascaras()

ETIQUETAS = {
    "1": "Gana local", "X": "Empate", "2": "Gana visita",
    "1X": "Local o empate", "12": "No empate", "X2": "Visita o empate",
    "O15": "Más de 1.5 goles", "U15": "Menos de 1.5 goles",
    "O25": "Más de 2.5 goles", "U25": "Menos de 2.5 goles",
    "O35": "Más de 3.5 goles", "U35": "Menos de 3.5 goles",
    "BTTS": "Ambos anotan", "NOBTTS": "No ambos anotan",
}


def probabilidades(matriz):
    return {k: float(matriz[m].sum()) for k, m in MASCARAS.items()}


def probabilidad_conjunta(matriz, claves):
    """Probabilidad exacta de varias apuestas del MISMO partido (respeta la correlación)."""
    m = np.ones_like(MASCARAS["1"])
    for k in claves:
        m = m & MASCARAS[k]
    return float(matriz[m].sum())


def sin_margen_shin(cuotas, iteraciones: int = 60):
    """
    Quita el margen con el método de Shin: supone que parte del margen viene de
    apostadores informados, y reparte mejor que dividir proporcionalmente
    (el método proporcional infla al favorito).
    """
    inv = np.array([1 / c if c and c > 1 else 0.0 for c in cuotas], dtype=float)
    if inv.sum() <= 0:
        return inv
    if (inv <= 0).any():
        return inv / inv.sum()
    suma = inv.sum()
    lo, hi = 0.0, 0.5
    for _ in range(iteraciones):
        z = (lo + hi) / 2
        p = (np.sqrt(z ** 2 + 4 * (1 - z) * inv ** 2 / suma) - z) / (2 * (1 - z))
        if p.sum() > 1:
            lo = z
        else:
            hi = z
    p = np.clip(p, 1e-9, 1)
    return p / p.sum()


def ajustar_a_mercado(matriz_base, lambdas, rho, objetivo, maxg=MAX_GOLES):
    """
    Estira los goles esperados hasta que el 1X2 del modelo coincida con la línea
    del mercado (Pinnacle sin margen). Así los mercados derivados —goles, ambos
    anotan, doble oportunidad— heredan la información del mercado, que en 1X2
    demostró ser mejor que el modelo solo.
    """
    from scipy.optimize import minimize as _min

    g = np.arange(maxg + 1)
    lgam = gammaln(g + 1.0)

    def matriz_de(s):
        lh, la = float(np.exp(s[0]) * lambdas[0]), float(np.exp(s[1]) * lambdas[1])
        ph = np.exp(g * np.log(lh) - lh - lgam)
        pa = np.exp(g * np.log(la) - la - lgam)
        m = np.outer(ph, pa)
        m[0, 0] *= 1 - lh * la * rho; m[1, 0] *= 1 + la * rho
        m[0, 1] *= 1 + lh * rho; m[1, 1] *= 1 - rho
        return m / m.sum()

    def error(s):
        m = matriz_de(s)
        gl, gv = np.meshgrid(g, g, indexing="ij")
        p = np.array([m[gl > gv].sum(), m[gl == gv].sum(), m[gl < gv].sum()])
        return float(np.sum((p - objetivo) ** 2) * 1e4)

    r = _min(error, np.zeros(2), method="Nelder-Mead",
             options={"xatol": 1e-5, "fatol": 1e-9, "maxiter": 600})
    m = matriz_de(r.x)
    return m, (float(np.exp(r.x[0]) * lambdas[0]), float(np.exp(r.x[1]) * lambdas[1])), float(np.sqrt(r.fun / 1e4))


def sin_margen(cuotas):
    """Quita el margen de la casa (método proporcional) y devuelve probabilidades."""
    inv = np.array([1 / c if c and c > 1 else 0.0 for c in cuotas])
    s = inv.sum()
    return inv / s if s > 0 else inv
