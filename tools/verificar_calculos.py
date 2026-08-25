"""Verifica que las cuentas compartidas no se hayan separado entre los dos paneles.

    python tools/verificar_calculos.py

La copia CANONICA es `calculos.js` de este repo. La otra vive en
`App Control Estaciones/src/static/calculos.js` y tiene que ser identica.

Por que existe este comando y no alcanza con "acordarse de copiar": las dos
cuentas que este archivo unifica --el puente de GNC y el margen bruto--
estuvieron devolviendo numeros distintos en cada panel durante meses, y nadie
lo noto. No se noto porque no habia forma de notarlo: eran dos textos parecidos
en dos repos distintos. Una regla que se chequea con un comando se cumple; una
que vive en la cabeza de alguien, no.

Devuelve 0 si son iguales, 1 si se despegaron o si falta alguna. Con `--copiar`
pisa la del escritorio con la canonica.
"""
from __future__ import annotations

import difflib
import io
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent.parent
CANONICA = AQUI / "calculos.js"
COPIA = AQUI.parent / "App Control Estaciones" / "src" / "static" / "calculos.js"


def _leer(p: Path) -> list[str] | None:
    if not p.exists():
        return None
    # newline='' y despues normalizar: el repo del escritorio esta en CRLF y el
    # del celular en LF. Comparar los saltos de linea daria "se despegaron"
    # todos los dias sin que nadie haya tocado una cuenta.
    return io.open(p, encoding="utf-8", newline="").read().replace("\r\n", "\n").splitlines()


def main() -> int:
    a, b = _leer(CANONICA), _leer(COPIA)
    if a is None:
        print(f"FALTA la canonica: {CANONICA}")
        return 1
    if b is None:
        print(f"FALTA la copia del escritorio: {COPIA}")
        print("Correr con --copiar para crearla.")
        return 1
    if a == b:
        print(f"calculos.js: identicas ({len(a)} lineas)")
        return 0

    if "--copiar" in sys.argv:
        io.open(COPIA, "w", encoding="utf-8", newline="\r\n").write("\n".join(a) + "\n")
        print(f"copiada la canonica sobre {COPIA}")
        print("OJO: los adaptadores de cada panel NO se copian. Si cambio una firma,")
        print("     hay que mirar los dos paneles a mano.")
        return 0

    print("Las dos copias de calculos.js SE DESPEGARON:\n")
    for ln in difflib.unified_diff(a, b, "canonica (panel-movil)",
                                   "copia (App Control Estaciones)", lineterm=""):
        print(" ", ln)
    print("\nPara sincronizar: python tools/verificar_calculos.py --copiar")
    return 1


if __name__ == "__main__":
    sys.exit(main())
