# Tests del panel móvil

```bash
node tests/test_panel.js
```

Sin dependencias y sin instalar nada: sale `las N comprobaciones pasaron` o
lista las que fallan. Devuelve 1 si hay alguna falla.

## Qué corren

**El script real de `index.html`**, no una copia. `test_panel.js` extrae el
`<script>` del archivo y lo ejecuta con `vm` adentro de un shim de DOM
(`dom.js`) contra datos de prueba (`fixtures.js`). Si alguien cambia
`index.html`, los tests miran ese cambio — no una versión paralela que se
despega.

El shim no parsea HTML: guarda el texto que el panel le escribe a cada
selector, que es justo lo que los tests miran. `render()` vive dentro del
closure de `iniciar()`, así que para llegar a la pantalla de una estación los
tests disparan el listener de `hashchange`, igual que un toque en el menú.

## Las guardas

Cada bloque abre con una comprobación de que el fixture **reproduzca la
condición**. Sin eso un test queda verde comparando cero contra cero: pasó con
el KPI de GNC, donde pedir «que aparezca un %» se cumplía con el % de
cualquier otra tarjeta. Ahora se lee el `<div class="sub">` de *ese* KPI y el
mensaje del test dice qué texto encontró.

Cuando un test nunca se vio fallar, se lo verifica **rompiendo el código a
propósito** y confirmando que cae. Así se comprobó el filtro `http(s)` de los
links de noticias.

## Los fixtures

`fixtures.js` arma 6 estaciones, cada una puesta para un caso:

| Estación | Qué reproduce |
| -- | -- |
| Adrogué | el caso normal: al día, con GNC todos los días |
| Big Blue | vende GNC todo el mes pero **no el último día** |
| Temperley | **atrasada** 3 días |
| Gasoil | al día |
| Dellepiane 1 | **nunca** vendió GNC |
| Dellepiane 2 | **ni una fila** en el mes |

Y cuatro variantes: `base()`, `soloFaltaLaVacia()` (las otras cinco al día — es
donde el panel llegaba a decir «Sin faltantes · 5/5» siendo 6),
`conAtrasadaLider()` (la atrasada entra al top 3 del ticker) y
`arranqueDeMes()` (día 2, todavía sin GNC cargado).

## Probarlo a ojo en un navegador

Los `.json` para el navegador se generan (no se versionan):

```bash
node -e "const f=require('./tests/fixtures.js'),s=require('fs');for(const k of ['base','soloFaltaLaVacia','todasAlDia','conAtrasadaLider'])s.writeFileSync('tests/fixtures/'+k+'.json',JSON.stringify(f[k]()))"
```

Servir la carpeta (`python -m http.server 8777`), abrirla, y en la consola del
navegador cargar uno como si fuera lo último bajado del Gist:

```js
fetch('/tests/fixtures/base.json').then(r => r.json()).then(d => {
  localStorage.setItem('ce_gist', 'a'.repeat(32));   // código inexistente: el Gist falla
  localStorage.setItem('ce_cache', JSON.stringify({t: Date.now(), datos: d}));
  location.reload();
});
```

El código inexistente hace fallar el fetch al Gist a propósito, así el panel
cae al camino de la copia local — que es el mismo que usa el celular cuando se
queda sin señal en la estación.
