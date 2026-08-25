/* Service worker del panel.
 *
 * Para qué existe (PORT-52). El panel guarda una copia de los datos en el
 * teléfono para cuando no hay señal. Pero SIN service worker, sin señal el
 * navegador ni siquiera llega a bajar el index.html: muestra su pantalla de
 * "no se puede acceder al sitio" y la página nunca arranca. El código que sabe
 * leer esa copia no llega a correr nunca. La copia local existía para un caso
 * que no podía ocurrir.
 *
 * ---- La decisión que hace que esto sea seguro ----
 *
 * El miedo razonable con un service worker es que se quede con una versión
 * vieja y te la siga sirviendo, dejando a las tres personas clavadas en el
 * panel de hace semanas sin enterarse. En un panel cuyo punto es tener los
 * números de hoy, eso es peor que el problema que resuelve.
 *
 * Por eso acá va **la red primero**, no la caché primero:
 *
 *   - Con señal: se pide a la red SIEMPRE y se guarda una copia al pasar. Un
 *     `git push` se ve en la próxima recarga, igual que ahora. Es imposible
 *     quedarse en una versión vieja estando en línea.
 *   - Sin señal: recién ahí sale la copia guardada, y el panel abre.
 *
 * Se paga con que estando en línea la carga espera a la red, que es
 * exactamente lo que pasa hoy. No se gana velocidad; se gana que abra sin
 * señal, que es lo único que se pedía.
 *
 * ---- Lo que NO se toca ----
 *
 * Los datos (el Gist) van derecho a la red, sin pasar por acá: tienen su
 * propia copia en localStorage, con su propia lógica de frescura y su propio
 * aviso en pantalla. Meter una segunda capa de caché sobre los mismos datos es
 * como se arma un panel que muestra números de anteayer sin que nadie sepa por
 * qué. La regla es la del origen: si no sale de esta misma página, no se toca.
 */
const VERSION = 'panel-2026-08-25';

/* El esqueleto: lo mínimo para que la página abra y se vea bien sin red. Los
   datos no están acá — los pone la propia página desde su copia local. */
const ESQUELETO = [
  './',
  './index.html',
  // Lo mas importante de la lista despues del index: la pagina lo carga como
  // <script src> y sin el no hay una sola cuenta. Si esto faltara, sin senal
  // el panel abriria y no dibujaria nada.
  './calculos.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', ev => {
  // `addAll` falla entero si UN archivo falla, y ahí el service worker no se
  // instala y no queda nada guardado. Se piden de a uno para que la falta de
  // un ícono no deje al panel sin poder abrir sin señal.
  ev.waitUntil(caches.open(VERSION).then(c =>
    Promise.all(ESQUELETO.map(u => c.add(u).catch(() => null)))));
});

self.addEventListener('activate', ev => {
  // Las cachés de versiones anteriores se borran: si no, el teléfono se llena
  // con una copia por cada publicación.
  ev.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  // Todo lo que no sea de esta misma página --el Gist, las fuentes-- va derecho
  // a la red. Ver el encabezado: los datos tienen su propia copia.
  if (new URL(req.url).origin !== self.location.origin) return;

  ev.respondWith(
    fetch(req)
      .then(res => {
        // Sólo se guarda lo que salió bien. Guardar un 404 o un 500 significa
        // servir esa misma pantalla de error para siempre cuando no haya red.
        if (res && res.ok && res.type === 'basic') {
          const copia = res.clone();
          caches.open(VERSION).then(c => c.put(req, copia));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then(r =>
          // Si lo pedido no está pero es una navegación, sirve el index: es lo
          // que hace que abrir la app instalada sin señal muestre el panel y no
          // la pantalla de error del navegador.
          r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))));
});
