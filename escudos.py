"""
Escudos y colores de cada equipo (ESPN). Se guardan en web/escudos/ y se
incrustan como data URI en la página para que funcione sin internet.
"""
from __future__ import annotations

import base64
import json
import shutil
import subprocess
from pathlib import Path

import calendario as cal

RAIZ = Path(__file__).resolve().parent
DIR = RAIZ / "web" / "escudos"
API = "https://site.api.espn.com/apis/site/v2/sports/soccer/mex.1/teams"


def descargar() -> dict:
    DIR.mkdir(parents=True, exist_ok=True)
    d = cal._json(API)
    salida = {}
    for t in d["sports"][0]["leagues"][0]["teams"]:
        e = t["team"]
        nombre = cal.NOMBRES.get(e["displayName"], e["displayName"])
        archivo = DIR / f"{e['id']}.png"
        if not archivo.exists():
            url = (e.get("logos") or [{}])[0].get("href")
            if url and shutil.which("curl"):
                subprocess.run(["curl", "-sSL", "--max-time", "45", "-o", str(archivo), url], check=False)
        salida[nombre] = {"id": e["id"], "archivo": archivo.name if archivo.exists() else None,
                          "color": "#" + (e.get("color") or "888888"),
                          "color2": "#" + (e.get("alternateColor") or "ffffff")}
    (DIR / "equipos.json").write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")
    return salida


def _reducido(archivo: Path, lado: int = 96) -> bytes:
    """Versión chica del escudo: la página lleva 18 y no debe pesar de más."""
    chico = archivo.with_name(archivo.stem + f"_{lado}.png")
    if not chico.exists():
        from PIL import Image
        im = Image.open(archivo).convert("RGBA")
        im.thumbnail((lado, lado), Image.LANCZOS)
        im.save(chico)
    return chico.read_bytes()


def cargar(incrustar: bool = True, lado: int = 96) -> dict:
    ruta = DIR / "equipos.json"
    d = json.loads(ruta.read_text(encoding="utf-8")) if ruta.exists() else descargar()
    if incrustar:
        for nombre, info in d.items():
            f = DIR / (info.get("archivo") or "")
            if info.get("archivo") and f.exists():
                info["img"] = "data:image/png;base64," + base64.b64encode(_reducido(f, lado)).decode()
    return d


def marca() -> dict:
    """El logo de la app, incrustado, en los tamaños que usa la página."""
    dir_marca = RAIZ / "web" / "marca"
    salida = {}
    for clave, archivo in (("logo", "tanteo-256.png"), ("palabra", "tanteo-palabra.png"),
                           ("icono", "tanteo-64.png"), ("favicon", "tanteo-32.png")):
        f = dir_marca / archivo
        if f.exists():
            salida[clave] = "data:image/png;base64," + base64.b64encode(f.read_bytes()).decode()
    return salida


if __name__ == "__main__":
    d = descargar()
    print(f"{sum(1 for v in d.values() if v['archivo'])} escudos en {DIR}")
    for n, v in sorted(d.items()):
        print(f"  {n:20s} {v['archivo'] or 'FALTA':12s} {v['color']}")
