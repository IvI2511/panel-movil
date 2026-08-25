"""Mide el panel en un navegador de verdad, a varios anchos.

    python tools/verificar_layout.py

Por que existe. El banco de pruebas (`tests/test_panel.js`) corre el JavaScript
real contra un DOM de mentira: mide lo que la pagina DICE, no como se ve. No
hay ancho, ni alto, ni media queries. Y hay una familia entera de defectos que
solo existe del lado de como se ve:

  - Las tarjetas quedaron **pegadas, 0 px entre una y otra**, cuando se
    agregaron las pestanas: dejaron de ser hijas directas de `.wrap` y con eso
    perdieron su separacion. Todo el JavaScript seguia en verde.
  - En el celular EN HORIZONTAL las tres pestanas quedaron como columnas de la
    grilla y se estiraron a **1.304 px de alto**. Tambien en verde.

Los dos los vio Ivan en el telefono, con el panel ya publicado. Cada
comprobacion de aca es un defecto que paso de verdad, no una precaucion.

Necesita Playwright (`pip install playwright && playwright install chromium`).
Si no esta, avisa y no falla: es una herramienta, no parte del build.
"""
from __future__ import annotations

import http.server
import socketserver
import subprocess
import sys
import threading
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PUERTO = 8899
# 390 y 844 son el mismo telefono, parado y acostado. 1024 la tablet, 1280 la
# pantalla grande donde aparece la barra lateral.
ANCHOS = [(390, 844), (844, 390), (1024, 768), (1280, 800)]
MINIMO_TACTIL = 43.5     # 44 real; 43,5 porque el layout redondea a 43,99
MINIMO_HUECO = 8         # px entre dos tarjetas apiladas
MAXIMO_PESTANAS = 90     # la barra de pestanas es una fila, no una columna

_fallas: list[str] = []


def check(cond, titulo: str) -> None:
    print(("  ok    " if cond else "  FALLA ") + titulo)
    if not cond:
        _fallas.append(titulo)


MEDIR = """() => {
  const chicos = [];
  document.querySelectorAll('button, a.nota, .hb, .chip, .tab, .menu').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.height < 43.5)
      chicos.push((el.className || el.tagName) + ' ' + r.height.toFixed(1) + 'px');
  });
  const huecos = [];
  document.querySelectorAll('.gr:not([hidden]), .wrap').forEach(cont => {
    const cs = [...cont.children].filter(c => c.classList.contains('card'));
    for (let i = 1; i < cs.length; i++) {
      const a = cs[i-1].getBoundingClientRect(), b = cs[i].getBoundingClientRect();
      if (b.top >= a.bottom - 1) huecos.push(Math.round(b.top - a.bottom));
    }
  });
  // Las etiquetas del eje de cada grafico: cuatro iguales no son un eje. Pasó
  // con el precio por litro — el eje truncado entre 2.281 y 2.321 y `kf`
  // abreviando a un decimal en miles daba «2,3 k» cuatro veces, justo en el
  // grafico donde se trunco el eje PARA poder distinguirlas.
  const ejes = [];
  document.querySelectorAll('.card svg').forEach(svg => {
    const et = [...svg.querySelectorAll('text[text-anchor="end"]')].map(x => x.textContent);
    if (et.length >= 2 && new Set(et).size < et.length) {
      const h = svg.closest('.card').querySelector('h2');
      ejes.push((h ? h.textContent.slice(0, 24) : '?') + ': ' + et.join('/'));
    }
  });
  const t = document.querySelector('#eTabs');
  const cortados = [];
  document.querySelectorAll('.hb .n, .card h2').forEach(el => {
    if (el.scrollWidth > el.clientWidth + 1) cortados.push(el.textContent.trim().slice(0, 30));
  });
  return {
    chicos, huecos, cortados,
    ejes,
    pestanas: t ? Math.round(t.getBoundingClientRect().height) : null,
    desborde: document.documentElement.scrollWidth - window.innerWidth,
  };
}"""


def _servir():
    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=str(RAIZ), **k)

        def log_message(self, *a):
            pass

    socketserver.TCPServer.allow_reuse_address = True
    sv = socketserver.TCPServer(("127.0.0.1", PUERTO), H)
    threading.Thread(target=sv.serve_forever, daemon=True).start()
    return sv


def _fixture() -> str:
    """Genera el JSON de prueba desde fixtures.js, que es la fuente."""
    destino = RAIZ / "tests" / "fixtures" / "conMinimercado.json"
    destino.parent.mkdir(exist_ok=True)
    subprocess.run(
        ["node", "-e",
         "const f=require('./tests/fixtures.js');"
         "require('fs').writeFileSync('tests/fixtures/conMinimercado.json',"
         "JSON.stringify(f.conMinimercado()));"],
        cwd=str(RAIZ), check=True)
    return "conMinimercado.json"


CARGAR = """async (f) => {
  const datos = await (await fetch('/tests/fixtures/' + f)).json();
  localStorage.setItem('ce_gist', 'a'.repeat(32));
  localStorage.setItem('ce_cache', JSON.stringify({t: Date.now(), datos}));
}"""


def main() -> int:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("  ---  Playwright no esta instalado: esta herramienta no se corre.")
        print("       pip install playwright && playwright install chromium")
        return 0

    fx = _fixture()
    sv = _servir()
    url = f"http://127.0.0.1:{PUERTO}/"
    print("el panel en un navegador de verdad\n")
    try:
        with sync_playwright() as p:
            nav = p.chromium.launch()
            for ancho, alto in ANCHOS:
                ctx = nav.new_context(viewport={"width": ancho, "height": alto},
                                      locale="es-AR")
                pg = ctx.new_page()
                errores: list[str] = []
                pg.on("pageerror", lambda e: errores.append(str(e)))
                pg.goto(url)
                pg.evaluate(CARGAR, fx)
                pg.goto(url)
                pg.wait_for_selector(".kpi", timeout=15000)
                etq = f"{ancho}x{alto}"
                # La vista general y la estacion con sus pestanas: los defectos
                # aparecieron en la estacion, que es la que tiene mas piezas.
                for vista, hash_ in (("general", "#general"), ("estacion", "#est/adrogue")):
                    pg.evaluate(f"location.hash='{hash_}'")
                    pg.wait_for_timeout(500)
                    pestanas = pg.query_selector_all("#eTabs .tab")
                    for i in range(max(1, len(pestanas))):
                        if pestanas:
                            pestanas[i].click()
                            pg.wait_for_timeout(250)
                        m = pg.evaluate(MEDIR)
                        d = f"{etq} {vista}" + (f" pestana {i+1}" if pestanas else "")
                        check(m["desborde"] <= 1,
                              f"{d}: sin scroll horizontal (sobra {m['desborde']}px)")
                        check(not m["chicos"],
                              f"{d}: nada tocable por debajo de {MINIMO_TACTIL}px"
                              + (" — " + ", ".join(m["chicos"][:3]) if m["chicos"] else ""))
                        malos = [h for h in m["huecos"] if h < MINIMO_HUECO]
                        check(not malos,
                              f"{d}: las tarjetas apiladas se separan"
                              + (f" — {len(malos)} pegadas: {malos[:4]}" if malos else ""))
                        if m["pestanas"] is not None:
                            check(m["pestanas"] <= MAXIMO_PESTANAS,
                                  f"{d}: la barra de pestanas es una fila "
                                  f"({m['pestanas']}px, tope {MAXIMO_PESTANAS})")
                        check(not m["ejes"],
                              f"{d}: ningun eje con etiquetas repetidas"
                              + (" — " + "; ".join(m["ejes"][:2]) if m["ejes"] else ""))
                        check(not m["cortados"],
                              f"{d}: ningun titulo ni etiqueta cortado"
                              + (" — " + ", ".join(m["cortados"][:2]) if m["cortados"] else ""))
                        if not pestanas:
                            break
                check(not errores, f"{etq}: sin errores de JavaScript"
                      + (" — " + errores[0][:70] if errores else ""))
                ctx.close()
            nav.close()
    finally:
        sv.shutdown()

    print()
    if _fallas:
        print(f"FALLARON: {len(_fallas)}")
        return 1
    print("Todo OK.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
