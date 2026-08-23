/* Shim de DOM minimo para correr el script de index.html en Node.

   No parsea HTML: cada querySelector devuelve un elemento de mentira y guarda
   el innerHTML que le escriban. Alcanza porque lo que el panel produce es
   texto — y es lo que los tests miran. Los listeners quedan registrados para
   poder dispararlos a mano (asi se navega a la vista de una estacion, que de
   otro modo es inalcanzable: vive adentro del closure de iniciar()). */

function elemento(nombre) {
  const el = {
    _nombre: nombre, innerHTML: '', textContent: '', className: '', value: '',
    style: {}, dataset: {},
    // Las clases se siguen de verdad: el toast se muestra agregando `.ver`,
    // y con un classList de mentira eso no se podia medir.
    classList: {
      _c: new Set(),
      add(c) { this._c.add(c); },
      remove(c) { this._c.delete(c); },
      toggle(c, f) { if (f === undefined) f = !this._c.has(c);
                     if (f) this._c.add(c); else this._c.delete(c); },
      contains(c) { return this._c.has(c); },
    },
    addEventListener() {}, removeEventListener() {},
    setAttribute() {}, getAttribute: () => null,
    // prepend() era un no-op, y con el la banda de «Sin conexión» no llegaba
    // nunca: cualquier check sobre ella pasaba sin mirar nada. Ahora antepone
    // el HTML, que es lo que los tests leen.
    prepend(hijo) {
      // Se conserva la CLASE del nodo: prependiendo solo su innerHTML se perdia
      // el <div class="banda">, y un mutante que borrara esa clase sobrevivia.
      if (!hijo) return;
      const cls = hijo.className ? ' class="' + hijo.className + '"' : '';
      el.innerHTML = '<div' + cls + '>' + (hijo.innerHTML || '') + '</div>' + el.innerHTML;
    },
    append() {}, appendChild() {}, remove() {},
    closest: () => null,
    querySelector: () => elemento(nombre + ' >'),
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({left: 0, top: 0, width: 520, height: 200}),
  };
  return el;
}

function crearEntorno({localStorage = new Map(), fetch, hash = '',
                       romperStorage = false, enLinea = true,
                       idsEstaticos = []} = {}) {
  const reg = new Map();
  const listeners = {};   // tipo -> [fn]
  // En el HTML real `.wrap` y `#vista` son EL MISMO nodo
  // (<main class="wrap" id="vista">). Sin este alias el shim los trataba como
  // dos elementos distintos y todo lo que se inserta por `.wrap` desaparecia.
  const ALIAS = {'.wrap': '#vista'};
  const dame = sel0 => {
    const sel = ALIAS[sel0] || sel0;
    if (!reg.has(sel)) reg.set(sel, elemento(sel));
    return reg.get(sel);
  };

  const document = {
    querySelector: dame,
    querySelectorAll: () => [],
    // Un id EXISTE si esta en el markup estatico o si alguna pantalla ya lo
    // escribio. Devolver siempre un elemento hacia que `avisar()` tomara
    // siempre la rama de #avisoRecarga y el toast quedara sin cobertura.
    getElementById(id) {
      if (idsEstaticos.indexOf(id) >= 0 || reg.has('#' + id)) return dame('#' + id);
      const escrito = [...reg.values()].some(
        e => String(e.innerHTML).indexOf('id="' + id + '"') >= 0);
      return escrito ? dame('#' + id) : null;
    },
    createElement: t => elemento('<' + t + '>'),
    addEventListener(tipo, fn) { (listeners[tipo] = listeners[tipo] || []).push(fn); },
    body: elemento('body'),
    documentElement: elemento('html'),
  };

  // Se cuentan las recargas: sin service worker, recargar sin red se lleva
  // puesta la app, asi que "no recargo" es una propiedad que hay que medir.
  const location = {hash, recargas: 0, reload() { this.recargas++; },
                    href: 'http://localhost/'};

  const ventana = {
    document, location,
    history: {replaceState(_a, _b, h) { if (h) location.hash = h; }},
    scrollTo() {},
    addEventListener(tipo, fn) { (listeners[tipo] = listeners[tipo] || []).push(fn); },
    // `romperStorage` simula Safari en modo privado o la cuota llena: cualquier
    // acceso tira. Es un caso real y el panel no puede quedarse en blanco.
    localStorage: {
      getItem: k => { if (romperStorage) throw new Error('SecurityError');
                      return localStorage.has(k) ? localStorage.get(k) : null; },
      setItem: (k, v) => { if (romperStorage) throw new Error('QuotaExceededError');
                           localStorage.set(k, String(v)); },
      removeItem: k => { if (romperStorage) throw new Error('SecurityError');
                         localStorage.delete(k); },
    },
    fetch: fetch || (() => Promise.reject(new Error('sin red en los tests'))),
    console, Intl, Date, Math, JSON, Number, String, Array, Object, Set, Map,
    setTimeout, clearTimeout, setInterval, clearInterval,
    // lo que el panel lee de si mismo
    // `onLine` decide si los botones de recargar pueden recargar.
    navigator: {userAgent: 'node', onLine: enLinea},
  };
  ventana.window = ventana;
  ventana.globalThis = ventana;

  return {
    ventana, document, location, listeners,
    /** El innerHTML que quedo escrito en un selector (o '' si nadie lo toco). */
    // Pasan por dame() para que el ALIAS valga tambien aca: si no, un
    // env.html('.wrap') devuelve '' en silencio y cualquier asercion negativa
    // sobre el pasa sola.
    html: sel => dame(sel).innerHTML,
    /** El objeto style de un selector, para verificar que algo se escondio. */
    estilo: sel => dame(sel).style,
    texto: sel => (reg.has(sel) ? reg.get(sel).textContent : ''),
    /** Dispara los listeners registrados de un tipo (p.ej. 'hashchange'). */
    disparar(tipo) { (listeners[tipo] || []).forEach(fn => fn({})); },
  };
}

module.exports = {crearEntorno};
