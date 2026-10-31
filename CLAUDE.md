# CLAUDE.md

## Esta página está congelada (Iván, 31-oct-2026)

El panel pasa a ser una sola web con login (project «El panel de control, una sola
web con login» en Linear, decisión CTRL-65). Hasta que la web reemplace a esta página
(fase 5, CTRL-56):

- **Acá sólo entran arreglos de números que mienten.** Nada nuevo: ni tarjetas, ni
  gráficos, ni pantallas, ni cambios de diseño.
- **Lo nuevo va sólo a `panel.html`** de App Control Estaciones, que es el que pasa a
  la web. Una mejora pedida para el celu espera a la web o se ve sólo en la PC.
- **Las cuentas nuevas van a `calculos.js`**, que comparten los dos. El original vive
  acá y se copia al escritorio (`tools/verificar_calculos.py` controla que sean iguales).

La pantalla única de la web sale de `panel.html` y se trae de esta página el diseño de
pantalla chica: cortes en 760 y 1.100 px, cajón y barra fija, y escondido por ancho lo
que el dueño vetó para el celu (caja TM/TT/TN, clima).

## Antes de pushear

El repo es **público** (lo exige GitHub Pages) y pushear es publicar. Ni los fixtures ni
el historial pueden llevar cifras del negocio.
