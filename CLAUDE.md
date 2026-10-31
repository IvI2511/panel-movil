# CLAUDE.md

## Las cuentas viven en `calculos.js`

`calculos.js` es compartido con el panel de escritorio. El original vive acá y se copia a
`App Control Estaciones/src/static/`. `tools/verificar_calculos.py` controla que las dos
copias sean iguales.

Una cuenta nueva o un arreglo de una cuenta va en `calculos.js`, no en `index.html`, para
que el celu y la PC no den números distintos.

## Antes de pushear

El repo es **público** (lo exige GitHub Pages) y pushear es publicar. Ni los fixtures ni
el historial pueden llevar cifras del negocio.
