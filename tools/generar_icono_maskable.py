"""Genera el icono maskable de la PWA a partir del icono comun, y lo verifica.

Por que hace falta un archivo APARTE y no alcanza con poner `purpose: maskable`
en el que ya hay: un icono maskable tiene DOS requisitos que el comun no cumple.

  1. Tiene que pintar hasta el borde. Android lo recorta con la forma que tenga
     configurada -- circulo, cuadrado redondeado, gota -- y esa forma puede
     llegar a las esquinas. `icon-512.png` es un cuadrado redondeado sobre fondo
     TRANSPARENTE: bajo una mascara cuadrada se le ven las esquinas vacias.

  2. Lo que importa tiene que entrar en el circulo central de radio 40%. En
     `icon-512.png` el dibujo llega a 214 px del centro y la zona segura son
     205: se le comen 9 px de las esquinas de las barras de los extremos.

Asi que este script toma el icono comun, lo achica y lo pega centrado sobre un
fondo del mismo color, a sangre.

    python tools/generar_icono_maskable.py            # genera y verifica
    python tools/generar_icono_maskable.py --verificar  # solo verifica

Lo segundo es lo que corre el banco de pruebas no puede correr: leer pixeles de
un PNG desde Node no vale la pena. Aca es una linea.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / "icon-512.png"
DESTINO = RAIZ / "icon-maskable-512.png"

# Cuanto del ancho ocupa el icono comun adentro del maskable. Con 0.85 el dibujo
# queda a ~182 px del centro, comodo adentro de los 205 de la zona segura.
ESCALA = 0.85
FONDO = (28, 28, 26, 255)      # el mismo oscuro del cuadrado, opaco y a sangre


def _lejos(im: Image.Image, fondo: tuple[int, int, int]) -> tuple[float, tuple[int, int]]:
    """A que distancia del centro llega el DIBUJO (lo que no es fondo ni vacio)."""
    w, h = im.size
    cx, cy = w / 2, h / 2
    px = im.load()
    lejos, punto = 0.0, (0, 0)
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if p[3] < 24:
                continue
            if sum(abs(a - b) for a, b in zip(p[:3], fondo)) <= 60:
                continue
            d = math.hypot(x - cx, y - cy)
            if d > lejos:
                lejos, punto = d, (x, y)
    return lejos, punto


def generar() -> None:
    base = Image.open(ORIGEN).convert("RGBA")
    lado = base.width
    chico = base.resize((round(lado * ESCALA), round(lado * ESCALA)), Image.LANCZOS)
    out = Image.new("RGBA", (lado, lado), FONDO)
    off = (lado - chico.width) // 2
    out.alpha_composite(chico, (off, off))
    out.save(DESTINO, optimize=True)
    print(f"generado {DESTINO.name} ({lado}x{lado})")


def verificar() -> int:
    fallos = []
    if not DESTINO.exists():
        print(f"FALTA {DESTINO.name} — correr sin --verificar para generarlo")
        return 1
    im = Image.open(DESTINO).convert("RGBA")
    w, h = im.size
    px = im.load()

    # 1. A sangre: ninguna esquina transparente.
    esquinas = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    vacias = [e for e in esquinas if px[e][3] < 250]
    if vacias:
        fallos.append(f"tiene esquinas transparentes ({len(vacias)} de 4): "
                      "bajo una mascara cuadrada se ven vacias")

    # 2. El dibujo, adentro del circulo seguro.
    lejos, punto = _lejos(im, FONDO[:3])
    seguro = w * 0.4
    if lejos > seguro:
        fallos.append(f"el dibujo llega a {lejos:.0f} px del centro y la zona "
                      f"segura son {seguro:.0f} (punto {punto}): se recorta")

    for f in fallos:
        print("FALLA:", f)
    if not fallos:
        print(f"{DESTINO.name}: a sangre, y el dibujo llega a {lejos:.0f} px "
              f"de los {seguro:.0f} que permite la zona segura")
    return 1 if fallos else 0


if __name__ == "__main__":
    if "--verificar" not in sys.argv:
        generar()
    sys.exit(verificar())
