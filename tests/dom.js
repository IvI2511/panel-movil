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
    classList: {add() {}, remove() {}, toggle() {}, contains: () => false},
    addEventListener() {}, removeEventListener() {},
    setAttribute() {}, getAttribute: () => null,
    prepend() {}, append() {}, appendChild() {}, remove() {},
    closest: () => null,
    querySelector: () => elemento(nombre + ' >'),
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({left: 0, top: 0, width: 520, height: 200}),
  };
  return el;
}

function crearEntorno({localStorage = new Map(), fetch, hash = ''} = {}) {
  const reg = new Map();
  const listeners = {};   // tipo -> [fn]
  const dame = sel => {
    if (!reg.has(sel)) reg.set(sel, elemento(sel));
    return reg.get(sel);
  };

  const document = {
    querySelector: dame,
    querySelectorAll: () => [],
    getElementById: id => dame('#' + id),
    createElement: t => elemento('<' + t + '>'),
    addEventListener(tipo, fn) { (listeners[tipo] = listeners[tipo] || []).push(fn); },
    body: elemento('body'),
    documentElement: elemento('html'),
  };

  const location = {hash, reload() {}, href: 'http://localhost/'};

  const ventana = {
    document, location,
    history: {replaceState(_a, _b, h) { if (h) location.hash = h; }},
    scrollTo() {},
    addEventListener(tipo, fn) { (listeners[tipo] = listeners[tipo] || []).push(fn); },
    localStorage: {
      getItem: k => (localStorage.has(k) ? localStorage.get(k) : null),
      setItem: (k, v) => localStorage.set(k, String(v)),
      removeItem: k => localStorage.delete(k),
    },
    fetch: fetch || (() => Promise.reject(new Error('sin red en los tests'))),
    console, Intl, Date, Math, JSON, Number, String, Array, Object, Set, Map,
    setTimeout, clearTimeout, setInterval, clearInterval,
    // lo que el panel lee de si mismo
    navigator: {userAgent: 'node'},
  };
  ventana.window = ventana;
  ventana.globalThis = ventana;

  return {
    ventana, document, location, listeners,
    /** El innerHTML que quedo escrito en un selector (o '' si nadie lo toco). */
    html: sel => (reg.has(sel) ? reg.get(sel).innerHTML : ''),
    texto: sel => (reg.has(sel) ? reg.get(sel).textContent : ''),
    /** Dispara los listeners registrados de un tipo (p.ej. 'hashchange'). */
    disparar(tipo) { (listeners[tipo] || []).forEach(fn => fn({})); },
  };
}

module.exports = {crearEntorno};
