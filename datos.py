"""Descarga y normaliza los datos de Liga MX (football-data.co.uk)."""
from __future__ import annotations

import shutil
import ssl
import subprocess
import urllib.request
from pathlib import Path

import pandas as pd

RAIZ = Path(__file__).resolve().parent
DIR_DATOS = RAIZ / "datos"
URL_HIST = "https://football-data.co.uk/new/MEX.csv"
# Ojo con la ruta: `/new_league_fixtures.csv` (sin /new/) empezó a devolver el
# archivo separado por TABULADORES, y pandas metía todo el encabezado en una
# sola columna. La de abajo sigue entregando CSV con comas.
URL_FIXTURES = "https://www.football-data.co.uk/new/new_league_fixtures.csv"


def _bajar(url: str, destino: Path) -> Path:
    """Descarga con curl (el Python de python.org no trae certificados) y si no, con urllib."""
    DIR_DATOS.mkdir(exist_ok=True)
    if shutil.which("curl"):
        r = subprocess.run(["curl", "-sSL", "--max-time", "90", "-o", str(destino), url],
                           capture_output=True, text=True)
        if r.returncode == 0 and destino.exists() and destino.stat().st_size > 1000:
            return destino
    contexto = ssl.create_default_context()
    try:
        import certifi
        contexto = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        contexto.check_hostname = False
        contexto.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers={"User-Agent": "parlay-ligamx/1.0"})
    with urllib.request.urlopen(req, timeout=90, context=contexto) as r:
        destino.write_bytes(r.read())
    return destino


def descargar(forzar: bool = True) -> tuple[Path, Path]:
    h = DIR_DATOS / "mex_historico.csv"
    f = DIR_DATOS / "fixtures.csv"
    if forzar or not h.exists():
        _bajar(URL_HIST, h)
    if forzar or not f.exists():
        anterior = f.read_bytes() if f.exists() else b""
        _bajar(URL_FIXTURES, f)
        # Cada foto distinta de las cuotas se guarda: con el tiempo permite comparar
        # la cuota a la que apostaste contra la de cierre (el "CLV" de los profesionales).
        if f.read_bytes() != anterior:
            historial = DIR_DATOS / "cuotas_historial"
            historial.mkdir(exist_ok=True)
            from datetime import datetime
            (historial / f"cuotas_{datetime.now():%Y%m%d_%H%M}.csv").write_bytes(f.read_bytes())
    return h, f


def historico() -> pd.DataFrame:
    d = pd.read_csv(DIR_DATOS / "mex_historico.csv", encoding="utf-8-sig")
    d = d.rename(columns={"Home": "equipo_local", "Away": "equipo_visita", "HG": "gl", "AG": "gv",
                          "Season": "temporada", "Res": "resultado"})
    d["fecha"] = pd.to_datetime(d.Date, format="%d/%m/%Y", errors="coerce")
    d = d.dropna(subset=["fecha", "gl", "gv"]).copy()
    d["gl"] = d.gl.astype(int); d["gv"] = d.gv.astype(int)
    # Cuotas de cierre: promedio del mercado, la mejor disponible y Pinnacle.
    for destino, origen in (("avg", "AvgC"), ("max", "MaxC"), ("ps", "PSC"), ("b365", "B365C")):
        for r, s in (("1", "H"), ("X", "D"), ("2", "A")):
            col = f"{origen}{s}"
            d[f"c_{destino}_{r}"] = pd.to_numeric(d[col], errors="coerce") if col in d else pd.NA
    return d.sort_values("fecha").reset_index(drop=True)


def _leer_flexible(ruta: Path) -> pd.DataFrame:
    """Lee el CSV aunque cambie el separador.

    football-data ya sirvió el mismo archivo con comas y con tabuladores. Se
    intenta con comas y, si todo cae en una sola columna, se deja que pandas
    deduzca el separador.
    """
    d = pd.read_csv(ruta, encoding="utf-8-sig")
    if len(d.columns) == 1:
        d = pd.read_csv(ruta, encoding="utf-8-sig", sep=None, engine="python")
    return d


def proximos() -> pd.DataFrame:
    d = _leer_flexible(DIR_DATOS / "fixtures.csv")
    if "Country" not in d.columns:
        raise ValueError(
            "fixtures.csv no trae la columna Country. Columnas: "
            + ", ".join(map(str, d.columns[:8])))
    d = d[d.Country.str.contains("Mexico", case=False, na=False)].copy()
    d = d.rename(columns={"Home": "equipo_local", "Away": "equipo_visita"})
    d["fecha"] = pd.to_datetime(d.Date, format="%d/%m/%Y", errors="coerce")
    for destino, origen in (("avg", "Avg"), ("max", "Max"), ("ps", "PS")):
        for r, s in (("1", "H"), ("X", "D"), ("2", "A")):
            col = f"{origen}{s}"
            d[f"c_{destino}_{r}"] = pd.to_numeric(d[col], errors="coerce") if col in d else pd.NA
    return d.dropna(subset=["fecha"]).sort_values(["fecha", "Time"]).reset_index(drop=True)


def equipos_activos(hist: pd.DataFrame, hasta, anios: float = 3.0) -> list[str]:
    """Equipos con partidos recientes: evita arrastrar clubes que ya no juegan."""
    desde = hasta - pd.Timedelta(days=int(365 * anios))
    r = hist[(hist.fecha >= desde) & (hist.fecha < hasta)]
    return sorted(set(r.equipo_local) | set(r.equipo_visita))
