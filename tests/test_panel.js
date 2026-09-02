/* Tests del panel movil.
 *
 * Corren el script REAL de index.html (no una copia) adentro de un shim de
 * DOM, contra fixtures que reproducen cada bug. Sin dependencias:
 *     node tests/test_panel.js
 *
 * Las guardas del principio verifican que el caso de prueba reproduzca la
 * condicion. Sin eso un test puede quedar verde comparando 0 contra 0.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {crearEntorno} = require('./dom.js');
const fx = require('./fixtures.js');

const RAIZ = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(RAIZ, 'manifest.json'), 'utf8'));

/* Los ids que existen en el markup estatico de index.html. El shim los
   necesita para poder decir que NO existe: un getElementById que siempre
   devuelve algo esconde las ramas de fallback. */
const IDS_ESTATICOS = (() => {
  const cuerpo = HTML.slice(0, HTML.indexOf('<script>'));
  const ids = [];
  const re = /id="([A-Za-z0-9_-]+)"/g;
  let m;
  while ((m = re.exec(cuerpo))) ids.push(m[1]);
  return ids;
})();

const SCRIPT = (() => {
  const a = HTML.indexOf('<script>');
  const b = HTML.lastIndexOf('</scr' + 'ipt>');
  if (a < 0 || b < 0) throw new Error('no encontre el script de index.html');
  return HTML.slice(a + '<script>'.length, b);
})();

let fallos = 0, corridos = 0;
const pendientes = [];   // los checks asincronicos se esperan al final
function check(cond, msg) {
  corridos++;
  if (cond) { console.log('  ok    ' + msg); return true; }
  fallos++; console.log('  FALLA ' + msg); return false;
}
function seccion(t) { console.log('\n' + t); }

/** Carga el panel con unos datos y devuelve el entorno para mirar el HTML. */
/** Las cuentas viven en calculos.js, que la pagina carga como <script src>. El
 *  arnes corre el script INLINE en un contexto propio, asi que ese archivo hay
 *  que meterlo a mano o `Calculos` no existe ahi adentro. Va concatenado en
 *  CADA contexto y no solo en correr(): hay una decena que se arman aparte
 *  para probar el arranque, y sin esto reventaban con `Calculos is not defined`.
 *  `SCRIPT` a secas se sigue usando para los checks que leen el codigo. */
const CALCULOS = require('fs').readFileSync('calculos.js', 'utf8');

function correr(datos, opciones) {
  const env = crearEntorno({hash: (opciones || {}).hash || '',
                            hoy: (opciones || {}).hoy,
                            idsEstaticos: IDS_ESTATICOS});
  vm.createContext(env.ventana);
  vm.runInContext(CALCULOS + SCRIPT, env.ventana, {filename: 'index.html'});
  env.ventana.iniciar(datos);
  return env;
}

/** Navega a una vista. Es la unica puerta: render() vive dentro del closure
 *  de iniciar() y desde afuera solo se lo alcanza por el hashchange. */
function irA(env, hash) {
  env.location.hash = hash;
  env.disparar('hashchange');
  return env.html('#vista');
}

const sinTags = s => String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

/** Mismo abreviado que `kf` en index.html: vive dentro del closure de
 *  iniciar() y desde aca no se alcanza, asi que se reescribe igual. */
const abrevK = x => x >= 1e6 ? (x / 1e6).toLocaleString('es-AR', {maximumFractionDigits: 1}) + ' M'
               : x >= 1000 ? (x / 1000).toLocaleString('es-AR', {maximumFractionDigits: 1}) + ' k'
               : x.toLocaleString('es-AR');

/** Compara porcentajes sin pelearse por el separador decimal: el panel escribe
 *  «8,8%» y `toFixed` da «8.8». Lo que el test mira es la CIFRA. */
const unaComa = t => String(t).replace(/,/g, '.');

/** El texto chico de un KPI concreto. Sin esto un check de "%"" se cumple con
 *  el % de cualquier otra tarjeta y no distingue el mundo roto del arreglado. */
function subDeKpi(html, etiqueta) {
  // [^] es "cualquier caracter, salto de linea incluido", sin backslashes que
  // se pierdan al armar el RegExp desde un string.
  const re = new RegExp('<div class="lbl">' + etiqueta +
    '[^]*?<div class="sub">([^]*?)</div>');
  const m = String(html).match(re);
  return m ? sinTags(m[1]).trim() : null;
}

// ===================================================================
seccion('Guardas: que los fixtures reproduzcan de verdad cada caso');
// ===================================================================
{
  const d = fx.base();
  const vacias = d.estaciones.filter(e => !e.dias.length);
  check(d.estaciones.length === 6 && vacias.length === 1 && vacias[0].clave === 'delle2',
    'el fixture trae 6 estaciones y exactamente una sin ninguna fila (delle2)');

  const bb = d.estaciones.find(e => e.clave === 'bigblue');
  const gncMes = bb.dias.some(x => x.gnc);
  const gncUlt = !!bb.dias[bb.dias.length - 1].gnc;
  check(gncMes && !gncUlt,
    'bigblue vendio GNC en el mes pero NO el ultimo dia (el caso de PORT-44 #2)');

  const tp = d.estaciones.find(e => e.clave === 'temperley');
  const ad = d.estaciones.find(e => e.clave === 'adrogue');
  check(tp.dias[tp.dias.length - 1].fecha < ad.dias[ad.dias.length - 1].fecha,
    'temperley esta atrasada respecto del dia mas nuevo del grupo');

  const d1 = d.estaciones.find(e => e.clave === 'delle1');
  check(!d1.dias.some(x => x.gnc), 'delle1 no vendio GNC ni un dia del mes');
}

// ===================================================================
seccion('PORT-38 - una estacion sin filas tiene que figurar como faltante');
// ===================================================================
{
  let env = null, exploto = null;
  try { env = correr(fx.base()); } catch (e) { exploto = e; }
  if (!check(!exploto, 'iniciar() no explota con una estacion sin ninguna fila' +
      (exploto ? ' -> ' + exploto.message : ''))) {
    console.log('        (los demas checks de PORT-38 no pueden correr)');
  } else {
    const general = sinTags(env.html('#vista'));
    check(/Planillas 4\/6/.test(general),
      'el KPI de planillas dice 4/6 (delle2 cuenta como faltante)');
    check(/Dellepiane 2/.test(general),
      'la banda de faltantes nombra a Dellepiane 2');
    // El titular del issue: con las otras cinco al dia, el panel llega a decir
    // "Sin faltantes - 5/5" siendo 6. Es el numero que cambia entre los dos
    // mundos; contar estaciones "visibles" da lo mismo roto y arreglado.
    const solo = sinTags(correr(fx.soloFaltaLaVacia()).html('#vista'));
    check(!/Sin faltantes/.test(solo),
      'con las otras cinco al dia NO dice "Sin faltantes" (delle2 no cargo nada)');
    check(/Planillas 5\/6/.test(solo),
      'y el contador dice 5/6, no 5/5');
    const cinta = sinTags(env.html('#cinta'));
    check(/FALTAN[^|]*Dellepiane 2/.test(cinta),
      'el ticker nombra a Dellepiane 2 entre las que faltan');
    check(/Dellepiane 2/.test(sinTags(env.html('#navEst'))),
      'el menu lateral lista a Dellepiane 2');

    let vista = null, exploto2 = null;
    try { vista = irA(env, '#est/delle2'); } catch (e) { exploto2 = e; }
    check(!exploto2 && vista && /Dellepiane 2/.test(sinTags(vista)),
      'la pantalla de una estacion sin datos abre y se explica' +
      (exploto2 ? ' -> ' + exploto2.message : ''));
  }
}

// ===================================================================
seccion('El 1o de mes: ninguna estacion cargo nada todavia');
// ===================================================================
{
  const d = fx.mesEnBlanco();
  check(d.estaciones.length === 6 && d.estaciones.every(e => !e.dias.length),
    'guarda: el fixture trae las 6 estaciones sin un solo dia');

  let env = null, exploto = null;
  try { env = correr(d); } catch (e) { exploto = e; }
  check(!exploto, 'iniciar() no explota sin fechaMax' +
    (exploto ? ' -> ' + exploto.message : ''));
  if (!exploto) {
    const v = sinTags(env.html('#vista'));
    check(/Todavia no hay planillas|Todavía no hay planillas/.test(v),
      'avisa "Todavia no hay planillas" (dice: ' + v.slice(0, 90) + ')');
    check(/Reintentar/.test(v), 'y ofrece un boton para reintentar');
    check(!/undefined|NaN|Invalid Date/.test(v),
      'sin "undefined", "NaN" ni "Invalid Date" en pantalla');
  }
}

// ===================================================================
seccion('Un paquete nuevo ROTO no puede destruir la copia buena');
// ===================================================================
{
  // El fetch guardaba en `ce_cache` ANTES de dibujar. Si el JSON nuevo venia
  // mal, pisaba la copia buena, iniciar() tiraba, el catch iba a buscar la
  // copia... y encontraba la que se acababa de envenenar. Con el removeItem
  // que se agrego por PORT-44 #1, ademas la borraba: el usuario se quedaba sin
  // panel y sin respaldo hasta que alguien arreglara el JSON del otro repo.
  const bueno = fx.base();
  const roto = fx.base();
  delete roto.estaciones[0].dias[3].fecha;   // rompe a iniciar() de verdad

  let rompe = false;
  try { correr(roto); } catch (e) { rompe = true; }
  check(rompe, 'guarda: el payload de prueba realmente hace fallar a iniciar()');

  const store = new Map([['ce_gist', 'a'.repeat(32)],
                         ['ce_cache', JSON.stringify({t: 111, datos: bueno})]]);
  const env = crearEntorno({idsEstaticos: IDS_ESTATICOS,
    
    localStorage: store,
    fetch: () => Promise.resolve({ok: true, json: () => Promise.resolve(roto)}),
  });
  vm.createContext(env.ventana);
  vm.runInContext(CALCULOS + SCRIPT, env.ventana, {filename: 'index.html'});

  pendientes.push(env.ventana.cargar().then(() => {
    const v = sinTags(env.html('#vista'));
    check(/Planillas 4\/6/.test(v),
      'con un paquete nuevo roto, se sigue viendo la copia buena (dice: ' +
      (v.match(/Planillas \d+\/\d+/) || ['nada'])[0] + ')');
    const c = store.get('ce_cache');
    check(!!c && JSON.parse(c).t === 111,
      'la copia buena NO se piso con el paquete roto');
  }, e => check(false, 'cargar() no puede tirar -> ' + e.message)));
}

// ===================================================================
seccion('El 1o de mes: la pantalla de aviso no puede tener botones muertos');
// ===================================================================
{
  const env = correr(fx.mesEnBlanco());
  // El `return` de la guarda sale de iniciar() ANTES de cablear el menu, el
  // velo, el Escape y el hashchange. La hamburguesa quedaba en pantalla sin
  // hacer nada: en un celular eso se lee como "la app se colgo".
  check(env.estilo('#btnMenu').display === 'none',
    'la hamburguesa se esconde en la pantalla de aviso (display: ' +
    (env.estilo('#btnMenu').display || 'sin tocar') + ')');
  const v = sinTags(env.html('#vista'));
  check(!/de las 0 estaciones/.test(v),
    'no dice "de las 0 estaciones" cuando el JSON no trae ninguna');
  check(/Todavía|día|añ|ó/.test(env.html('#vista')),
    'la pantalla de aviso lleva acentos como el resto del panel');
}

// ===================================================================
seccion('La estacion sin planillas se ve como faltante en TODOS lados');
// ===================================================================
{
  // Cuatro restos de sacar el .filter(): la ficha cae en la columna angosta
  // (mide 87 px contra 163 de las demas), el punto del menu sigue verde como
  // si estuviera al dia, el "—" de la comparativa viene con un munon de barra
  // azul, y la cinta queda vacia pero dibujada.
  const env = correr(fx.base());
  const v = env.html('#vista');

  const ficha = (v.match(/<div class="est[^"]*"[^>]*data-ruta="#est\/delle2"/) || [''])[0];
  check(/class="est [^"]*vacia/.test(ficha) || /class="est vacia/.test(ficha),
    'la ficha sin planillas lleva su propia clase para no caer en la grilla de dos columnas');

  const nav = env.html('#navEst');
  const item = (nav.match(/<button class="navit"[^>]*data-ruta="#est\/delle2"[^]*?<\/button>/) || [''])[0];
  check(/var\(--warn\)/.test(item),
    'el punto del menu de la estacion sin planillas NO es el verde de "al dia"');

  const fila = (v.match(/<button class="hb"[^>]*data-ruta="#est\/temperley"[^]*?<\/button>/) || [''])[0];
  check(/min-width:0/.test(fila),
    'la fila sin medicion no dibuja el munon de barra (min-width:0)');

  const vacio = correr(fx.mesEnBlanco());
  check(vacio.estilo('.ticker').display === 'none',
    'con el mes en blanco la cinta se esconde en vez de quedar vacia (display: ' +
    (vacio.estilo('.ticker').display || 'sin tocar') + ')');
}

// ===================================================================
seccion('Camino feliz - que los arreglos no rompan el caso normal');
// ===================================================================
{
  const env = correr(fx.todasAlDia());
  const g = sinTags(env.html('#vista'));
  check(/Sin faltantes/.test(g) && /Planillas 6\/6/.test(g),
    'con las 6 al dia dice "Sin faltantes" y 6/6');
  check(/Proyeccion de cierre|Proyección de cierre/.test(g),
    'la proyeccion de cierre se sigue dibujando');
  check(/Medios de pago del mes/.test(g) && /Por dia de la semana|Por día de la semana/.test(g),
    'las secciones del mes siguen ahi');
  const e1 = sinTags(irA(env, '#est/adrogue'));
  check(/Adrogue/.test(e1) && /Combustibles/.test(e1),
    'el panel de una estacion normal abre completo');
  check(!/undefined|NaN/.test(g + ' ' + e1),
    'no quedan "undefined" ni "NaN" en pantalla');
}

// ===================================================================
seccion('PORT-45 y PORT-44 #2 - el KPI de GNC compara, no afirma');
// ===================================================================
{
  const env = correr(fx.base());
  const general = sinTags(env.html('#vista'));
  check(!/estaciones con GNC/.test(general),
    'el panel general ya no dice "N estaciones con GNC"');
  const subGen = subDeKpi(env.html('#vista'), 'GNC');
  check(subGen !== null, 'guarda: se encontro el KPI de GNC del panel general');
  check(subGen !== null && /%/.test(subGen),
    'el sub del KPI de GNC del general es una variacion en % (dice: ' + subGen + ')');

  const bbHtml = irA(env, '#est/bigblue');
  const subBb = subDeKpi(bbHtml, 'GNC');
  check(subBb !== null && /%/.test(subBb),
    'el sub del KPI de GNC de bigblue es una variacion en % (dice: ' + subBb + ')');

  // El caso literal de PORT-44 #2: arranque de mes, una estacion CON surtidor
  // de GNC que todavia no cargo ni un dia con GNC. Hoy el panel afirma que no
  // vende. El JSON no trae con que saberlo, asi que la afirmacion se va.
  const arr = correr(fx.arranqueDeMes());
  const vistas = ['adrogue', 'bigblue', 'temperley', 'gasoil', 'delle1']
    .map(c => sinTags(irA(arr, '#est/' + c))).join(' || ');
  check(!/no vende GNC/.test(vistas),
    'arrancando el mes, ninguna estacion afirma "no vende GNC"');

  const d1 = sinTags(irA(env, '#est/delle1'));
  check(/sin GNC este mes/i.test(d1),
    'delle1 (nunca vendio GNC) dice "sin GNC este mes"');
}

// ===================================================================
seccion('De la misma familia: no mostrar un numero donde no hubo medicion');
// ===================================================================
{
  // Aparecieron mirando el panel arreglado en el navegador. Son el mismo
  // defecto que PORT-38 y PORT-44 #2 en otras dos tarjetas: un cero o un
  // "Sin GNC" que se leen como una medicion y son un dato que no existe.
  const env = correr(fx.base());
  const v = env.html('#vista');

  // Anclado al boton de la comparativa: sin eso el regex arranca en el
  // "Temperley" de la banda de faltantes y agarra el valor de otra estacion.
  const comp = (v.match(/<button class="hb"[^>]*data-ruta="#est\/temperley"[^]*?<span class="v">([^<]*)</) || [])[1];
  check(comp !== undefined, 'guarda: se encontro a Temperley en la comparativa del dia');
  check(comp !== undefined && comp.trim() === '—',
    'Temperley (atrasada) muestra "—" y no "0" en la comparativa del dia (dice: ' + comp + ')');
  // El otro lado: con un check de un solo lado, poner "—" para TODAS borraba
  // los numeros del panel entero sin que cayera nada.
  const compAd = (v.match(/<button class="hb"[^>]*data-ruta="#est\/adrogue"[^]*?<span class="v">([^<]*)</) || [])[1];
  check(compAd !== undefined && /^[\d.]+$/.test(compAd.trim()),
    'Adrogue (al dia) sigue mostrando su numero, no "—" (dice: ' + compAd + ')');

  const ficha = (v.match(/Big Blue[^]*?<div class="gnc">([^<]*)</) || [])[1];
  check(ficha !== undefined, 'guarda: se encontro la ficha de Big Blue');
  // Prohibir el texto viejo no alcanza: "Sin GNC este mes" tambien lo cumple,
  // y para Big Blue es FALSO (vendio GNC todo el mes menos ese dia).
  check(ficha !== undefined && /GNC 0 m³ ese d[ií]a/.test(ficha),
    'la ficha de Big Blue dice "GNC 0 m³ ese día" (dice: ' + ficha + ')');

  const fichaD1 = (v.match(/Dellepiane 1[^]*?<div class="gnc">([^<]*)</) || [])[1];
  check(fichaD1 !== undefined && /sin GNC este mes/i.test(fichaD1),
    'la ficha de Dellepiane 1 (nunca GNC) dice "sin GNC este mes" (dice: ' + fichaD1 + ')');
}

// ===================================================================
seccion('Los KPI del grupo comparan contra el MISMO conjunto de estaciones');
// ===================================================================
{
  // El numerador de los KPI del dia suma solo lo del dia mas nuevo, asi que una
  // estacion atrasada aporta 0. Si el denominador (el promedio del mes) la
  // sigue contando, la planilla que falta se lee como caida de ventas.
  // Medido sobre base(): los litros decian ↓10,6% un dia en que las estaciones
  // que si cargaron habian subido +8,1%. El signo estaba invertido.
  //
  // Estos checks fijan el NUMERO, no "que haya un %": un check que solo pide un
  // porcentaje queda verde con el promedio falseado (comprobado por mutacion).
  const casos = [
    {fx: 'base', litros: '↑ 8,1%', gnc: '↓ 28,3%'},
    {fx: 'todasAlDia', litros: '↑ 8,8%', gnc: '↓ 22,8%'},
  ];
  casos.forEach(c => {
    const v = correr(fx[c.fx]()).html('#vista');
    const sl = subDeKpi(v, 'Litros');
    const sg = subDeKpi(v, 'GNC');
    check(sl !== null && sg !== null, 'guarda: se encontraron los dos KPI en ' + c.fx);
    check(sl !== null && sl.indexOf(c.litros) === 0,
      c.fx + ': el KPI de Litros dice "' + c.litros + '" (dice: ' + sl + ')');
    check(sg !== null && sg.indexOf(c.gnc) === 0,
      c.fx + ': el KPI de GNC dice "' + c.gnc + '" (dice: ' + sg + ')');
  });

  // Y la guarda que prueba que el caso distingue los dos mundos: en base() hay
  // estaciones que NO aportaron el dia mas nuevo. Sin eso los dos criterios dan
  // el mismo numero y el check no mira nada.
  const d = fx.base();
  const fmax = [...new Set(d.estaciones.flatMap(e => e.dias.map(x => x.fecha)))].sort().pop();
  const atrasadas = d.estaciones.filter(e => !e.dias.some(x => x.fecha === fmax));
  check(atrasadas.length === 2,
    'guarda: en base() hay 2 estaciones que no aportaron el dia mas nuevo (hay ' +
    atrasadas.length + ')');
}

// ===================================================================
seccion('La proyeccion compara agosto contra el julio de LAS MISMAS estaciones');
// ===================================================================
{
  // Regresion que introdujo esta misma tanda: al sacar el .filter() de ESTS,
  // `grupoPrev` empezo a sumar el julio COMPLETO de una estacion que en agosto
  // no aporto un solo dia. Numerador con 5 estaciones, denominador con 6.
  // Medido sobre base(): la proyeccion pasaba de ↑7,3% a ↓5,9% — el signo dado
  // vuelta en el numero con el que se decide la compra de combustible.
  // Ventana fija desde el titulo: un regex perezoso hasta "</div></div>" corta
  // la tarjeta antes de llegar a "Cerró julio".
  const tarjeta = (html) => {
    const i = String(html).indexOf('Proyecci');
    return i < 0 ? '' : sinTags(String(html).slice(i, i + 560));
  };
  const v = correr(fx.base()).html('#vista');
  const t = tarjeta(v);
  check(t.length > 0, 'guarda: se encontro la tarjeta de proyeccion');
  check(/↑ 7,3%/.test(t),
    'la proyeccion dice "↑ 7,3%" vs julio (dice: ' +
    ((t.match(/[↑↓] [\d,]+%/) || ['nada'])[0]) + ')');
  // La tarjeta abrevia con kf(): 1.105.700 -> "1,1 M" y 1.260.500 -> "1,3 M".
  // Se distinguen, que es lo unico que hace falta.
  check(/1,1 M/.test(t),
    'y "Cerró julio" da 1,1 M (no 1,3 M, que incluiria el julio de la que no cargo nada) (dice: ' +
    ((t.match(/Cerr[^]{0,40}/) || ['nada'])[0]) + ')');

  // El control que aisla la causa: con las 6 al dia los dos criterios coinciden,
  // asi que si este check se rompe el problema es otro.
  const t2 = tarjeta(correr(fx.todasAlDia()).html('#vista'));
  check(/↑ 10,3%/.test(t2),
    'control: con las 6 al dia la proyeccion dice "↑ 10,3%" (dice: ' +
    ((t2.match(/[↑↓] [\d,]+%/) || ['nada'])[0]) + ')');
}

// ===================================================================
seccion('PORT-44 #4 - nada declarado y sin usar');
// ===================================================================
{
  // Casi todo el archivo declara con `const camelCase = ... =>`, que el regex
  // viejo no veia: una funcion muerta de esa forma pasaba sin que cayera nada.
  // Y los usos se cuentan sobre el fuente SIN comentarios: una funcion muerta
  // nombrada en un comentario tambien pasaba.
  const limpio = SCRIPT.replace(/\/\*[^]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
  const nombres = new Set();
  const re = /(?:^|\n)\s*(?:function\s+([A-Za-z_$][\w$]*)\s*\(|const\s+([A-Za-z_$][\w$]*)\s*=)/g;
  let m;
  while ((m = re.exec(limpio))) nombres.add(m[1] || m[2]);
  const muertos = [...nombres].filter(n => {
    // \b no sirve de borde para `$`: se usa un lookaround por caracter de identificador.
    const usos = limpio.match(
      new RegExp('(?<![\\w$])' + n.replace(/\$/g, '\\$') + '(?![\\w$])', 'g')) || [];
    return usos.length <= 1;
  });
  check(muertos.length === 0,
    'no quedan funciones ni constantes declaradas y nunca usadas' +
    (muertos.length ? ' -> ' + muertos.join(', ') : ''));
}

// ===================================================================
seccion('PORT-44 #3 - el top 3 del ticker no vende un dato viejo como de hoy');
// ===================================================================
{
  const env = correr(fx.conAtrasadaLider());
  const cinta = sinTags(env.html('#cinta'));
  check(/Temperley/.test(cinta), 'guarda: Temperley (atrasada) entra igual al top 3');
  const item = (cinta.match(/Temperley[^|]{0,80}?\)/) || [''])[0];
  check(/\d{1,2}\/\d{2}/.test(item),
    'el item de Temperley en el ticker lleva la fecha de su ultima planilla');
  // El otro lado: la fecha es la MARCA de la atrasada. Si la llevan todas, no
  // distingue nada.
  const itemAd = (cinta.match(/Dellepiane 1[^|]{0,80}?\)/) || [''])[0];
  check(itemAd && !/\d{1,2}\/\d{2}/.test(itemAd),
    'la estacion al dia en el top 3 NO lleva fecha (dice: ' + (itemAd || 'no entro al top 3') + ')');
}

// ===================================================================
seccion('PORT-36 - las noticias enlazan cuando el JSON trae la URL');
// ===================================================================
{
  const env = correr(fx.base());
  const v = env.html('#vista');
  check(/<a[^>]+href="https:\/\/surtidores\.com\.ar\/nota-1"/.test(v),
    'la noticia que trae URL sale como enlace');
  check(/rel="noopener/.test(v) && /target="_blank"/.test(v),
    'el enlace abre en otra pestana con rel=noopener');
  check(!/href="javascript:/i.test(v),
    'una URL que no sea http(s) no llega a salir como enlace');
  check(!/href="undefined"/.test(v) && !/href=""/.test(v),
    'la noticia SIN URL no genera un enlace roto');
  check(/El litro en el AMBA/.test(sinTags(v)),
    'la noticia sin URL se sigue viendo, como texto');
  // La mitad del arreglo vive en el CSS y el shim no lo ve. Medido en
  // Chromium: sin display:block el enlace pasa de 53 a 43 px de alto, y sin
  // la otra regla queda azul y subrayado.
  check(/\.nota\{[^}]*display:block/.test(HTML),
    'la regla .nota declara display:block (un <a> es inline y pierde el padding)');
  check(/a\.nota\{[^}]*color:inherit[^}]*text-decoration:none/.test(HTML),
    'a.nota anula el azul y el subrayado del enlace');
  // El toast arranca en display:none y se muestra con .ver. Sin esa regla el
  // aviso existe en el DOM y no se ve nunca: la mutacion no hacia caer nada.
  check(/#toast\{[^}]*display:none/.test(HTML),
    '#toast arranca escondido');
  check(/#toast\.ver\{[^}]*display:block/.test(HTML),
    'y la clase .ver es la que lo muestra');
  // `left:50%` sin ancho deja viewport/2 para el ajuste, asi que el max-width
  // no se alcanza nunca y el mensaje se parte. Medido: 195px de caja en un
  // telefono de 390, cuatro lineas a 320. Con max-content: 359 y dos lineas.
  check(/#toast\{[^}]*width:max-content/.test(HTML),
    '#toast usa width:max-content (sin eso el max-width no vale y el texto se parte)');
  check(/#toast\{[^}]*max-width:/.test(HTML),
    'y tiene un max-width que lo contiene en pantallas angostas');
  // Guarda del ORDEN: el panel dibuja NOTAS.slice(0,4). Si la nota dudosa se
  // corre mas alla de la cuarta, el check del javascript: deja de mirar nada.
  const dudosa = fx.base().notas.findIndex(x => /^javascript:/i.test(x.u || ''));
  check(dudosa >= 0 && dudosa < 4,
    'guarda: la noticia con URL no-http entra en las 4 que se dibujan (esta en la ' +
    (dudosa + 1) + ')');
}

// ===================================================================
seccion('Ningun dato del JSON llega crudo al HTML');
// ===================================================================
{
  // Todo el panel se arma concatenando strings y se inyecta con innerHTML.
  // Verificado en un navegador de verdad: nombre de estacion, clave y numero
  // de tanque salian SIN escapar, y un <img onerror> ejecutaba. Hoy los tres
  // vienen de constantes del otro repo, asi que no es alcanzable — pero el
  // JSON cruza el limite entre dos repos que se publican por separado.
  const env = correr(fx.hostil());
  const todo = env.html('#vista') + env.html('#cinta') +
               env.html('#navEst') + env.html('#cuando') +
               irA(env, '#est/temperley');

  check(todo.indexOf('<img') === -1,
    'no queda ni un <img> crudo del payload en el HTML generado');
  // No se chequea la cadena "onerror=" suelta: sobrevive como TEXTO y es
  // inofensiva, porque lo que decide es que el "<" este escapado. Lo que se
  // mide es que no haya quedado ninguna etiqueta abierta por el payload.
  // El panel dibuja sus propios <svg> (sparklines, donut, barras), asi que svg
  // no sirve de centinela. img/script/iframe si: la app no usa ninguno.
  check(!/<\s*(img|script|iframe)/i.test(todo),
    'el payload no abrio ninguna etiqueta (la app no usa img, script ni iframe propios)');
  check(todo.indexOf('&lt;img') !== -1,
    'guarda: el payload SI llego al HTML, escapado (si no, el test no mira nada)');

  // La clave viaja a un ATRIBUTO (data-ruta) y ademas al hash de navegacion:
  // ahi no alcanza con escapar, hay que restringir el juego de caracteres.
  const rutas = (todo.match(/data-ruta="[^"]*"/g) || []);
  check(rutas.length > 0, 'guarda: se encontraron atributos data-ruta');
  check(rutas.every(r => /^data-ruta="#(general|est\/[A-Za-z0-9_-]+)"$/.test(r)),
    'todo data-ruta es una ruta limpia (mal: ' +
    (rutas.filter(r => !/^data-ruta="#(general|est\/[A-Za-z0-9_-]+)"$/.test(r))[0] || '—') + ')');
}

// ===================================================================
seccion('El arranque no puede dejar la pantalla en blanco ni encerrar al usuario');
// ===================================================================
{
  const ID = 'a'.repeat(32);
  const arrancar = (opts) => {
    const env = crearEntorno({idsEstaticos: IDS_ESTATICOS, ...opts});
    vm.createContext(env.ventana);
    vm.runInContext(CALCULOS + SCRIPT, env.ventana, {filename: 'index.html'});
    return env;
  };

  // --- el codigo del link viene en mayusculas (teclado del celular) ---
  const may = arrancar({hash: '#' + 'A1B2C3D4E5'.repeat(3) + 'AB',
                        fetch: () => Promise.reject(new Error('sin red'))});
  pendientes.push(may.ventana.cargar().then(() => {
    check(!/Falta el código/.test(sinTags(may.html('#vista'))),
      'un codigo en MAYUSCULAS se acepta (no manda a "Falta el codigo")');
  }));

  // --- el storage bloqueado (Safari privado) no puede dejar la pantalla muda ---
  const sinLs = arrancar({romperStorage: true,
                          fetch: () => Promise.reject(new Error('sin red'))});
  pendientes.push(sinLs.ventana.cargar().then(() => {
    const v = sinTags(sinLs.html('#vista'));
    check(v.trim().length > 0, 'con el storage bloqueado la pantalla NO queda vacia');
    check(/guardar datos|modo privado|no deja/i.test(v),
      'y explica que el navegador no deja guardar (dice: ' + v.slice(0, 80) + ')');
  }, e => check(false, 'cargar() no puede tirar con el storage bloqueado -> ' + e.message)));

  // --- un codigo equivocado tiene que tener salida ---
  const store = new Map([['ce_gist', 'b'.repeat(40)]]);
  const malo = arrancar({localStorage: store,
                         fetch: () => Promise.resolve({ok: false, status: 404})});
  pendientes.push(malo.ventana.cargar().then(() => {
    const v = sinTags(malo.html('#vista'));
    check(/otro código|otro codigo|cambiar el código/i.test(v),
      'con un codigo que no sirve, ofrece poner otro (dice: ' + v.slice(0, 90) + ')');
  }));

  // --- una publicacion VACIA no puede pisar la copia buena ---
  const store2 = new Map([['ce_gist', ID],
                          ['ce_cache', JSON.stringify({t: 222, datos: fx.base()})]]);
  const vacio = arrancar({localStorage: store2,
                          fetch: () => Promise.resolve({ok: true, json: () => Promise.resolve({})})});
  pendientes.push(vacio.ventana.cargar().then(() => {
    const c = store2.get('ce_cache');
    check(!!c && JSON.parse(c).t === 222,
      'un paquete VACIO no pisa la copia buena (un paquete vacio no tira: cae en la guarda y sigue)');
  }));
}

// ===================================================================
seccion('Vuelta 2: lo que el refutador tumbo');
// ===================================================================
{
  // --- el escapado, ahora sobre las DOS ramas de la banda ---
  [['hostil', fx.hostil()], ['hostilTodasAlDia', fx.hostilTodasAlDia()]].forEach(([nom, datos]) => {
    const env = correr(datos);
    const todo = env.html('#vista') + env.html('#cinta') + env.html('#navEst') +
                 env.html('#cuando') + irA(env, '#est/adrogue');
    check(!/<\s*(img|script|iframe)/i.test(todo),
      nom + ': ningun campo del JSON abre una etiqueta');
  });

  // --- el nombre no puede salir DOBLE escapado en la barra de arriba ---
  const amp = correr(fx.hostilTodasAlDia());
  irA(amp, '#est/adrogue');
  check(amp.texto('#titVista') === 'Shell & Cía',
    'el titulo de la barra muestra el & tal cual, sin doble escapado (dice: ' +
    amp.texto('#titVista') + ')');

  // --- si no queda mes anterior, las leyendas no pueden anunciarlo ---
  const soloVaciaConPrev = fx.base();
  soloVaciaConPrev.estaciones.forEach(e => { if (e.dias.length) e.prev = []; });
  const sp = correr(soloVaciaConPrev).html('#vista');
  const dibujaLinea = /stroke-dasharray="5 4"/.test(sp);
  check(!dibujaLinea, 'guarda: sin mes anterior no se dibuja la linea punteada');
  check(!/media de /.test(sinTags(sp)),
    'y la leyenda NO anuncia una «media de» que no esta dibujada');
  // La otra leyenda, la del acumulado, se podia dejar incondicional sin que
  // cayera nada: son dos tarjetas distintas.
  const refs = (sp.match(/<div class="ref">[^]*?<\/div>/g) || []).map(sinTags);
  const acum = refs.filter(r => /agosto/.test(r) && !/media/.test(r))[0];
  check(acum !== undefined && !/julio/.test(acum),
    'la leyenda del acumulado tampoco nombra un mes que no se dibuja (dice: ' +
    (acum || 'no se encontro') + ')');

  // --- los dias al reves no pueden producir numeros con cara de medidos ---
  const rev = sinTags(correr(fx.diasAlReves()).html('#vista'));
  check(/Planillas 4\/6/.test(rev),
    'con los dias en orden invertido el panel sigue contando bien (dice: ' +
    ((rev.match(/Planillas \d+\/\d+/) || ['nada'])[0]) + ')');
}

// ===================================================================
seccion('Vuelta 2: los arreglos que ningun check medía');
// ===================================================================
{
  const ID = 'a'.repeat(32);
  const arrancar = (opts) => {
    const env = crearEntorno({idsEstaticos: IDS_ESTATICOS, ...opts});
    vm.createContext(env.ventana);
    vm.runInContext(CALCULOS + SCRIPT, env.ventana, {filename: 'index.html'});
    return env;
  };

  // --- H3: es `return true` al final de iniciar() lo que sostiene la cache.
  // Borrandolo, el panel se dibuja igual y NUNCA MAS se guarda la copia:
  // el celular en la estacion se queda sin panel offline y nadie se entera.
  const store = new Map([['ce_gist', ID]]);
  const feliz = arrancar({localStorage: store,
    fetch: () => Promise.resolve({ok: true, json: () => Promise.resolve(fx.base())})});
  pendientes.push(new Promise(r => setImmediate(() => setImmediate(r))).then(() => {
    check(/Planillas 4\/6/.test(sinTags(feliz.html('#vista'))),
      'guarda: el arranque feliz dibujo el panel');
    const c = store.get('ce_cache');
    check(!!c && (JSON.parse(c).datos.estaciones || []).length === 6,
      'y despues de dibujar SI se guarda la copia local (la que salva al que se queda sin senal)');
  }));

  // --- H7: un paquete vacio con copia buena tiene que mostrar la copia.
  // Antes se preservaba el respaldo y se mostraba un cartel: el panel de
  // ayer estaba en el telefono, intacto, y el usuario no lo veia.
  const store2 = new Map([['ce_gist', ID],
                          ['ce_cache', JSON.stringify({t: 333, datos: fx.base()})]]);
  const vac = arrancar({localStorage: store2,
    fetch: () => Promise.resolve({ok: true, json: () => Promise.resolve(fx.mesEnBlanco())})});
  pendientes.push(new Promise(r => setImmediate(() => setImmediate(r))).then(() => {
    const v = sinTags(vac.html('#vista'));
    check(/Planillas 4\/6/.test(v),
      'con un paquete vacio se muestra el panel de la copia buena (dice: ' +
      ((v.match(/Planillas \d+\/\d+/) || ['nada'])[0]) + ')');
    check(JSON.parse(store2.get('ce_cache')).t === 333,
      'y la copia buena sigue intacta');
  }));

  // --- H2: sin red, NINGUN boton puede recargar. El navegador no tiene el
  // HTML guardado: recargar deja la pantalla en blanco y sin salida, y se
  // lleva puesto hasta el propio boton de reintentar.
  const off = arrancar({localStorage: new Map([['ce_gist', ID]]), enLinea: false,
    fetch: () => Promise.reject(new Error('sin red'))});
  pendientes.push(new Promise(r => setImmediate(() => setImmediate(r))).then(() => {
    check(/No se pudo cargar/.test(sinTags(off.html('#vista'))),
      'guarda: sin red y sin copia, se llega a la pantalla de error');
    const antes = off.location.recargas;
    off.ventana.recargar();
    check(off.location.recargas === antes,
      'sin red, Reintentar NO recarga (recargas: ' + antes + ' -> ' + off.location.recargas + ')');
    const on = arrancar({localStorage: new Map([['ce_gist', ID]]), enLinea: true,
      fetch: () => Promise.reject(new Error('sin red'))});
    return new Promise(r => setImmediate(() => setImmediate(r))).then(() => {
      const a2 = on.location.recargas;
      on.ventana.recargar();
      check(on.location.recargas === a2 + 1,
        'y CON red sigue recargando normal (recargas: ' + a2 + ' -> ' + on.location.recargas + ')');
    });
  }));
}

// ===================================================================
seccion('Vuelta 3: el cableado, no solo el helper');
// ===================================================================
{
  const ID = 'a'.repeat(32);
  const arrancar = (opts) => {
    const env = crearEntorno({idsEstaticos: IDS_ESTATICOS, ...opts});
    vm.createContext(env.ventana);
    vm.runInContext(CALCULOS + SCRIPT, env.ventana, {filename: 'index.html'});
    return env;
  };
  const luego = () => new Promise(r => setImmediate(() => setImmediate(r)));

  // --- El CABLEADO. El check anterior llamaba a recargar() directo, asi que
  // probaba el helper y no que los botones lo usaran: los tres onclick se
  // podian revertir a location.reload() y las 99 seguian en verde.
  check(!/onclick="location\.reload\(\)"/.test(HTML),
    'ningun boton llama a location.reload() directo: todos pasan por recargar()');
  // Y los dos que recargan desde JS tienen que consultar sinRed() antes.
  ['guardarId', 'olvidarId'].forEach(fn => {
    const cuerpo = (SCRIPT.match(new RegExp('function ' + fn + '\\([^]*?\\n\\}')) || [''])[0];
    check(/sinRed\(\)/.test(cuerpo),
      fn + '() consulta sinRed() antes de recargar (ademas borra cosas antes)');
  });

  // --- H4: paquete vacio SIN copia. El diagnostico correcto lo dibujo
  // iniciar(); mandarlo a «Revisa la senal» con la red perfecta era peor.
  const solo = arrancar({localStorage: new Map([['ce_gist', ID]]),
    fetch: () => Promise.resolve({ok: true, json: () => Promise.resolve(fx.mesEnBlanco())})});
  pendientes.push(luego().then(() => {
    const v = sinTags(solo.html('#vista'));
    check(/Todavía no hay planillas|Todavia no hay planillas/.test(v),
      'paquete vacio sin copia: dice «Todavía no hay planillas» (dice: ' + v.slice(0, 60) + ')');
    check(!/No se pudo cargar/.test(v),
      'y NO manda a revisar la senal, que esta perfecta');
  }));

  // --- H5 + el texto de la banda: paquete vacio CON copia buena.
  const store = new Map([['ce_gist', ID],
                         ['ce_cache', JSON.stringify({t: 444, datos: fx.base()})]]);
  const resc = arrancar({localStorage: store,
    fetch: () => Promise.resolve({ok: true, json: () => Promise.resolve(fx.mesEnBlanco())})});
  pendientes.push(luego().then(() => {
    check(/Planillas 4\/6/.test(sinTags(resc.html('#vista'))),
      'guarda: se rescato el panel de la copia');
    // iniciar() corre DOS veces (el paquete vacio y despues la copia): la
    // primera esconde la hamburguesa y la cinta, y no las reponia nadie.
    check(resc.estilo('#btnMenu').display !== 'none',
      'el panel rescatado NO queda con la hamburguesa escondida (display: ' +
      (resc.estilo('#btnMenu').display || 'sin tocar') + ')');
    check(resc.estilo('.ticker').display !== 'none',
      'ni con la cinta escondida');
    // La banda tiene que decir POR QUE se esta viendo la copia. Con la red
    // perfecta, «Sin conexión» manda a buscar un problema que no existe.
    const v = sinTags(resc.html('#vista'));
    check(/La publicación de hoy vino vacía/.test(v),
      'la banda dice que la publicacion vino vacia, no «Sin conexión» (dice: ' +
      v.slice(0, 60) + ')');
  }));

  // --- H6: paquete vacio Y copia vacia. La banda no puede anunciar que
  // muestra lo ultimo descargado encima de una pantalla que no muestra nada.
  const store2 = new Map([['ce_gist', ID],
                          ['ce_cache', JSON.stringify({t: 555, datos: fx.mesEnBlanco()})]]);
  const dosVacios = arrancar({localStorage: store2,
    fetch: () => Promise.resolve({ok: true, json: () => Promise.resolve(fx.mesEnBlanco())})});
  pendientes.push(luego().then(() => {
    const v = sinTags(dosVacios.html('#vista'));
    // El observable NO puede ser la banda: se inserta con prepend() sobre .wrap
    // y el shim no lo simula, asi que un check sobre ella pasa sin mirar nada
    // (comprobado: la mutacion sobrevivia). Lo que SI distingue los dos mundos
    // es que cartel queda en pantalla.
    check(/Todavía no hay planillas|Todavia no hay planillas/.test(v),
      'con las dos vacias queda el cartel correcto (dice: ' + v.slice(0, 60) + ')');
    check(!/No se pudo cargar/.test(v),
      'y no lo tapa con «No se pudo cargar», que manda a revisar una senal que esta bien');
    check(!/Mostrando lo último descargado/.test(v),
      'ni cuelga la banda de «Mostrando lo último descargado» sobre una pantalla vacia');
  }));

  // --- El camino FELIZ sin senal: copia buena y banda ambar. Hasta ahora no se
  // podia testear porque el shim no simulaba el prepend sobre .wrap (que en el
  // HTML real es el mismo nodo que #vista). Es el caso mas comun del panel.
  const store3 = new Map([['ce_gist', ID],
                          ['ce_cache', JSON.stringify({t: 666, datos: fx.base()})]]);
  const off2 = arrancar({localStorage: store3, enLinea: false,
    fetch: () => Promise.reject(new Error('sin red'))});
  pendientes.push(luego().then(() => {
    const v = sinTags(off2.html('#vista'));
    check(/Planillas 4\/6/.test(v), 'guarda: sin red se dibujo el panel de la copia');
    check(/Sin conexión/.test(v),
      'y encima va la banda «Sin conexión» (dice: ' + v.slice(0, 70) + ')');
    check(/Mostrando lo último descargado/.test(v),
      'que dice desde cuando son los datos');
    // Anclado a «Sin conexión»: `class="banda"` ya aparece por la banda de
    // faltantes que dibuja vGeneral, asi que un check suelto pasa sin mirar nada.
    check(/class="banda"[^>]*>(?:(?!<\/div>)[^])*?Sin conexión/.test(off2.html('#vista')),
      'y la banda de «Sin conexión» conserva su clase (sin ella queda un texto suelto sin estilo)');
    const av = off2.ventana.document.createElement ? null : null;
    check(/var\(--warn/.test(off2.html('#vista')),
      'y sus colores de aviso (la clase sola no la pinta: el fondo va inline)');
  }));
}

// ===================================================================
seccion('Vuelta 4: el aviso de «sin señal» y el estado tras un rescate fallido');
// ===================================================================
{
  const ID = 'a'.repeat(32);
  const arrancar = (opts) => {
    const env = crearEntorno({idsEstaticos: IDS_ESTATICOS, ...opts});
    vm.createContext(env.ventana);
    vm.runInContext(CALCULOS + SCRIPT, env.ventana, {filename: 'index.html'});
    return env;
  };
  const luego = () => new Promise(r => setImmediate(() => setImmediate(r)));

  // --- El toast. Es el arreglo principal de su commit y NO lo medía nadie:
  // siete mutantes sobrevivian (borrar el div, avisar() como no-op, no poner
  // la clase, no escribir el texto, invertir la precedencia, borrar el CSS,
  // borrar el setTimeout). Desde el panel normal no hay #avisoRecarga, asi
  // que el aviso TIENE que salir por el toast o no sale por ningun lado.
  const store = new Map([['ce_gist', ID],
                         ['ce_cache', JSON.stringify({t: 777, datos: fx.base()})]]);
  const panel = arrancar({localStorage: store, enLinea: false,
    fetch: () => Promise.reject(new Error('sin red'))});
  pendientes.push(luego().then(() => {
    check(/Planillas 4\/6/.test(sinTags(panel.html('#vista'))),
      'guarda: se dibujo el panel normal (no una pantalla de error)');
    panel.ventana.recargar();
    const t = panel.ventana.document.getElementById('toast');
    check(!!t && /sin señal/i.test(t.textContent || ''),
      'desde el panel normal, el aviso sale por el toast (dice: ' +
      ((t && t.textContent) || 'NADA') + ')');
    check(!!t && t.classList.contains('ver'),
      'y el toast se muestra (lleva la clase .ver)');
    check(panel.location.recargas === 0, 'y la app no recargo');
  }));

  // --- Desde la pantalla de error gana #avisoRecarga, que es lo correcto:
  // queda inline abajo del boton en vez de flotando.
  const err = arrancar({localStorage: new Map([['ce_gist', ID]]), enLinea: false,
    fetch: () => Promise.reject(new Error('sin red'))});
  pendientes.push(luego().then(() => {
    check(/No se pudo cargar/.test(sinTags(err.html('#vista'))),
      'guarda: se llego a la pantalla de error');
    err.ventana.recargar();
    const a = err.ventana.document.getElementById('avisoRecarga');
    check(!!a && /sin señal/i.test(a.textContent || ''),
      'en la pantalla de error el aviso va inline, no en el toast');
  }));

  // --- H1: paquete vacio + copia que TIRA al dibujarse. iniciar() corre dos
  // veces: la segunda repone el menu y la cinta y despues tira. Quedaba
  // «ninguna estacion cargo nada» con el menu al lado listando las seis con
  // sus litros, y la copia que produjo esos numeros recien borrada.
  const rota = fx.base();
  rota.notas = 'esto no es un array';   // NOTAS.slice(...).map tira
  const store3 = new Map([['ce_gist', ID],
                          ['ce_cache', JSON.stringify({t: 888, datos: rota})]]);
  const inc = arrancar({localStorage: store3,
    fetch: () => Promise.resolve({ok: true, json: () => Promise.resolve(fx.mesEnBlanco())})});
  pendientes.push(luego().then(() => {
    check(sinTags(inc.html('#navEst')).trim() === '',
      'tras un rescate fallido el menu queda vacio (decia: ' +
      sinTags(inc.html('#navEst')).slice(0, 50) + ')');
    check(inc.estilo('#btnMenu').display === 'none',
      'y la hamburguesa escondida (display: ' +
      (inc.estilo('#btnMenu').display || 'sin tocar') + ')');
    check(inc.estilo('.ticker').display === 'none', 'y la cinta escondida');
  }));

  // El check que estaba aca era un grep sobre el fuente, y lo satisfacia un
  // COMENTARIO: invertir la guarda dejaba las 129 en verde. Lo reemplaza el
  // de comportamiento de la seccion "Vuelta 5".
  check((SCRIPT.match(/navigator\.onLine/g) || []).length === 1,
    'y navigator.onLine se lee en un solo lugar (hay ' +
    ((SCRIPT.match(/navigator\.onLine/g) || []).length) + ')');
}

// ===================================================================
seccion('Vuelta 5: medir el COMPORTAMIENTO, no el texto del fuente');
// ===================================================================
{
  const ID = 'a'.repeat(32);
  const DIEZ_MIN = 10 * 60 * 1000;

  /* El refresco automatico es el unico reload que dispara SOLO. Se lo
     ejercita de verdad: se adelanta `_oculto` (un let del script, visible en
     el contexto) y se dispara el listener que el propio panel registro.

     El check anterior era un grep sobre SCRIPT.match(/visibilitychange.../),
     que recorta el fuente CON COMENTARIOS -- y el comentario de arriba de la
     guarda contiene el literal `sinRed()`. O sea que el check lo satisfacia
     un comentario: invertir la guarda a `if(!sinRed())return;`, que hace que
     la app se recargue SOLO cuando no hay red (la catastrofe exacta que la
     guarda evita), dejaba las 129 en verde. */
  const refrescar = ({enLinea, minutos, tipeando}) => {
    const ids = IDS_ESTATICOS.concat(tipeando === undefined ? [] : ['inId']);
    const env = crearEntorno({idsEstaticos: ids, enLinea,
      localStorage: new Map([['ce_gist', ID],
                             ['ce_cache', JSON.stringify({t: 1, datos: fx.base()})]]),
      fetch: () => Promise.reject(new Error('sin red'))});
    // `_oculto` es un `let` del script: NO vive en el objeto global, asi que no
    // se puede adelantar desde afuera. Lo que se controla es el reloj que el
    // script consulta, ANTES de correrlo.
    let reloj = 1e12;
    env.ventana.Date = new Proxy(Date, {
      get(orig, k) { return k === 'now' ? () => reloj : Reflect.get(orig, k); },
    });
    vm.createContext(env.ventana);
    vm.runInContext(CALCULOS + SCRIPT, env.ventana, {filename: 'index.html'});
    if (tipeando !== undefined) {
      env.ventana.document.getElementById('inId').value = tipeando;
    }
    env.document.hidden = true;
    env.disparar('visibilitychange');          // aca el panel anota que se fue
    reloj += minutos * 60 * 1000;
    const antes = env.location.recargas;
    env.document.hidden = false;
    env.disparar('visibilitychange');          // y aca vuelve
    return env.location.recargas - antes;
  };

  check(refrescar({enLinea: true, minutos: 11}) === 1,
    'con red y 11 minutos afuera, el panel se refresca solo');
  check(refrescar({enLinea: false, minutos: 11}) === 0,
    'SIN RED no se refresca: un reload sin senal se lleva puesta la app entera');
  check(refrescar({enLinea: true, minutos: 5}) === 0,
    'y a los 5 minutos tampoco (el umbral son 10)');
  check(refrescar({enLinea: true, minutos: 11, tipeando: 'abc123'}) === 0,
    'ni encima de un codigo a medio tipear');
  check(refrescar({enLinea: true, minutos: 11, tipeando: '   '}) === 1,
    'pero un campo con solo espacios no frena el refresco');

  /* El toast se apaga solo. Sin el setTimeout queda pegado en pantalla para
     siempre, encima de la cinta -- y el mutante sobrevivia. */
  const env2 = crearEntorno({idsEstaticos: IDS_ESTATICOS, enLinea: false,
    localStorage: new Map([['ce_gist', ID],
                           ['ce_cache', JSON.stringify({t: 1, datos: fx.base()})]]),
    fetch: () => Promise.reject(new Error('sin red'))});
  vm.createContext(env2.ventana);
  vm.runInContext(CALCULOS + SCRIPT, env2.ventana, {filename: 'index.html'});
  pendientes.push(new Promise(r => setImmediate(() => setImmediate(r))).then(() => {
    env2.ventana.recargar();
    const t = env2.ventana.document.getElementById('toast');
    check(!!t && t.classList.contains('ver'), 'guarda: el toast se prendio');
    return new Promise(r => setTimeout(r, 4300)).then(() => {
      check(!t.classList.contains('ver'),
        'y se apaga solo a los 4 segundos (sin eso queda pegado para siempre)');
    });
  }));

  /* Tras limpiar el chrome, algo LEGIBLE tiene que quedar. Los checks solo
     afirmaban cosas escondidas: esconder tambien #vista los dejaba verdes y
     al usuario con una pantalla en blanco. */
  const store = new Map([['ce_gist', ID]]);
  const env3 = crearEntorno({idsEstaticos: IDS_ESTATICOS, localStorage: store,
    fetch: () => Promise.reject(new Error('sin red'))});
  vm.createContext(env3.ventana);
  vm.runInContext(CALCULOS + SCRIPT, env3.ventana, {filename: 'index.html'});
  pendientes.push(new Promise(r => setImmediate(() => setImmediate(r))).then(() => {
    check(env3.estilo('#vista').display !== 'none',
      'la pantalla de error NO se esconde a si misma');
    check(sinTags(env3.html('#vista')).trim().length > 20,
      'y deja un texto legible, no una pantalla en blanco');
    check(!env3.ventana.document.body.classList.contains('nav'),
      'y el cajon del menu no queda abierto sobre ella');
  }));
}

// ===================================================================
seccion('Paridad: los precios que ya viajaban y nadie dibujaba');
// ===================================================================
{
  /* El JSON trae los 6 precios diarios (pr_*) desde siempre y el movil no
     los leia ni una vez. Con ellos se destraban cinco cosas que el panel de
     escritorio si muestra. Las formulas se copian de alla (preciosFF,
     factEstimada, mixComb), no se inventan. */
  const env = correr(fx.base());
  const vista = irA(env, '#est/adrogue');
  const t = sinTags(vista);

  // --- Facturacion estimada del dia: litros x precio, con arrastre ---
  // A mano, sobre el ultimo dia de adrogue en base():
  const d = fx.base().estaciones.find(e => e.clave === 'adrogue');
  const ult = d.dias[d.dias.length - 1];
  // Los precios del dia 15 se arrastran hasta el final (el 21 no trae).
  const p15 = d.dias.find(x => x.pr_vpn);
  const pr = d.dias.filter(x => x.pr_vpn).pop();
  check(!!pr && !ult.pr_vpn,
    'guarda: el ultimo dia NO trae precios propios, asi que hay que arrastrarlos');
  check(!!p15, 'guarda: hay al menos un dia con precios en el fixture');
  const esperado = ult.vpn * pr.pr_vpn + ult.sup * pr.pr_sup +
                   ult.vpd * pr.pr_vpd + ult.form * pr.pr_form +
                   (ult.gnc || 0) * pr.pr_gnc;
  const subFact = subDeKpi(vista, 'Facturación estimada');
  check(subFact !== null, 'la estacion muestra un KPI de facturacion estimada');
  // Se compara el numero abreviado, que es como lo muestra la tarjeta.
  // [^]*? porque el template literal deja un salto de linea entre los dos divs.
  const valFact = (vista.match(
    /<div class="lbl">Facturación estimada<\/div>[^]*?<div class="val">([^<]*)</) || [])[1];
  check(valFact !== undefined && /\d/.test(valFact),
    'con un numero (dice: ' + valFact + ')');
  // Y que el numero sea el de la cuenta a mano, no cualquiera. `kf` vive dentro
  // del closure de iniciar() y no se alcanza desde afuera, asi que se
  // des-abrevia lo que muestra la tarjeta: "$ 26,5 M" -> 26.500.000. La
  // tolerancia es la del redondeo de kf (un decimal en millones).
  const desabreviar = txt => {
    const m = String(txt).match(/([\d.,]+)\s*(M|k)?/);
    if (!m) return null;
    const v = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
    return m[2] === 'M' ? v * 1e6 : m[2] === 'k' ? v * 1e3 : v;
  };
  const mostrado = desabreviar(valFact);
  check(mostrado !== null && Math.abs(mostrado - esperado) / esperado < 0.01,
    'y coincide con la cuenta a mano: ' + Math.round(esperado).toLocaleString('es-AR') +
    ' (la tarjeta dice ' + valFact + ' = ' + Math.round(mostrado || 0).toLocaleString('es-AR') + ')');

  // El arrastre hacia ATRAS solo toca los dias ANTERIORES al primer precio
  // cargado, asi que mirando el ultimo dia no se nota. El acumulado del mes si:
  // sin el, esos primeros dias aportan cero.
  const P = {};
  ['vpn','sup','vpd','form','gnc'].forEach(k => {
    const arr = d.dias.map(x => x['pr_'+k] > 0 ? x['pr_'+k] : null);
    let v = null;
    for (let i = 0; i < arr.length; i++) { if (arr[i] != null) v = arr[i]; else arr[i] = v; }
    v = null;
    for (let i = arr.length - 1; i >= 0; i--) { if (arr[i] != null) v = arr[i]; else arr[i] = v; }
    P[k] = arr;
  });
  const mesEsperado = d.dias.reduce((a, x, i) =>
    a + x.vpn * P.vpn[i] + x.sup * P.sup[i] + x.vpd * P.vpd[i] + x.form * P.form[i] +
    (x.gnc || 0) * P.gnc[i], 0);
  const sinDias = d.dias.filter(x => !x.pr_vpn).length;
  check(!d.dias[0].pr_vpn && !d.dias[1].pr_vpn,
    'guarda: los dos primeros dias del mes NO traen precio, asi que hay que arrastrar hacia atras');
  check(sinDias === d.dias.length - 2,
    'guarda: solo 2 de ' + d.dias.length + ' dias traen precio propio');
  const mesMostrado = desabreviar((subFact || '').replace(/[^\d.,Mk]/g, ' '));
  check(mesMostrado !== null && Math.abs(mesMostrado - mesEsperado) / mesEsperado < 0.01,
    'el acumulado del mes coincide con la cuenta a mano: ' +
    Math.round(mesEsperado).toLocaleString('es-AR') + ' (dice: ' + subFact + ')');

  // --- % Premium: incluye el gasoil premium (vpn + vpd), no solo la nafta.
  // El escritorio documenta que calcularlo solo con vpn daba 17,7% donde la
  // planilla decia 37,5%. Es el bug que NO hay que reintroducir. ---
  const liqUlt = ult.vpn + ult.sup + ult.vpd + ult.form;
  const pctEsperado = Math.round((ult.vpn + ult.vpd) / liqUlt * 100);
  const valPrem = (vista.match(
    /<div class="lbl">% Premium<\/div><div class="val">([^<]*)</) || [])[1];
  check(valPrem !== undefined,
    'la estacion muestra un KPI de % Premium');
  check(valPrem !== undefined && valPrem.trim() === pctEsperado + '%',
    '% Premium = (V-Power + V/P Diesel) / liquido = ' + pctEsperado +
    '% (dice: ' + valPrem + ')');
  check(pctEsperado > 25,
    'guarda: el caso distingue el bug viejo (solo vpn daria ~la mitad de ' +
    pctEsperado + '%)');

  // --- El importe de los camiones tambien viajaba sin dibujarse ---
  check(/B-1001/.test(t), 'guarda: la tabla de camiones se dibujo');
  // El numero se lee del fixture, no va escrito a mano: estaba fijo en «66 M» y
  // al ajustar el costo del camion quedo apuntando a un valor que ya no existe.
  const impCam = d.camiones[0].importe;
  const impTxt = (impCam / 1e6).toLocaleString('es-AR', {maximumFractionDigits: 1}) + ' M';
  check(t.indexOf('$ ' + impTxt) >= 0,
    'cada camion muestra el importe que se pago (dice: ' +
    ((t.match(/B-1001[^·]{0,60}/) || ['nada'])[0]) + ')');
}

// ===================================================================
seccion('Tablet: el look del escritorio, sin tocar el celular');
// ===================================================================
{
  // El shim no evalua media queries, asi que esto se mide sobre el CSS. Lo
  // visual se verifico en Chromium a 390, 820, 1180 y 1560 px.
  // Se corta BALANCEANDO llaves y no con un recorte fijo de 1.400 caracteres:
  // agregar dos reglas al principio del bloque empujaba las de mas abajo
  // afuera de la ventana y el check fallaba sin que el CSS hubiera cambiado.
  const mq = (ancho) => {
    const i = HTML.indexOf('@media (min-width: ' + ancho + 'px)');
    if (i < 0) return '';
    let nivel = 0, j = HTML.indexOf('{', i);
    for (let k = j; k < HTML.length; k++) {
      if (HTML[k] === '{') nivel++;
      else if (HTML[k] === '}' && --nivel === 0) return HTML.slice(i, k + 1);
    }
    return HTML.slice(i);
  };

  const t = mq(760);
  check(t.length > 0, 'hay una media query para tablet y pantallas grandes');
  // Los valores se COPIAN del panel de escritorio: si alguien los cambia por
  // otros, deja de verse como el.
  check(/max-width:1560px/.test(t),
    'el ancho maximo del contenido es el del escritorio (1560px)');
  check(/\.kpis\{grid-template-columns:repeat\(auto-fit,minmax\(160px,1fr\)\)\}/.test(t),
    'los KPI usan la grilla del escritorio (auto-fit de 160px)');
  check(/padding:20px 26px 60px/.test(t),
    'y su padding de contenido (20px 26px 60px)');

  const s2 = mq(1100);
  check(s2.length > 0, 'y otra para cuando entra la barra lateral');
  check(/\.drawer\{transform:none/.test(s2) && /width:238px/.test(s2),
    'que deja el cajon fijo, con los 238px de ancho del escritorio');
  check(/\.topbar \.menu\{display:none\}/.test(s2),
    'y esconde la hamburguesa, que ya no hace falta');

  // Lo mas importante: que el CELULAR no se haya tocado. Las reglas base
  // tienen que seguir FUERA de toda media query.
  const base = HTML.slice(0, HTML.indexOf('@media (min-width: 760px)'));
  check(/\.wrap\{max-width:560px/.test(base),
    'el celular sigue con su columna de 560px, fuera de toda media query');
  check(/\.kpis\{display:grid; grid-template-columns:1fr 1fr/.test(base),
    'y con sus KPI de a dos');
  // La ficha usa `118px 1fr` en TODOS los tamanos: el sparkline se coloca
  // primero (grid-row:2/4) y con el orden inverso se quedaba con la columna
  // elastica, dejando los numeros apretados en 118px.
  check(/\.est\{[^}]*grid-template-columns:118px 1fr/.test(base),
    'la ficha da la columna elastica a los numeros, no al sparkline');
}

// ===================================================================
seccion('Paridad: control de GNC, margen bruto y precios vigentes');
// ===================================================================
{
  const env = correr(fx.base());
  const vista = irA(env, '#est/adrogue');
  const t = sinTags(vista);
  const d = fx.base().estaciones.find(e => e.clave === 'adrogue');

  // ---- Control de GNC: consumo del puente vs. lo que marcaron los
  // surtidores. La formula es gncCtrl() del escritorio: se busca hacia atras
  // la ULTIMA lectura anterior (puede haber dias sin lectura) y se restan. ----
  const ultimo = d.dias[d.dias.length - 1];
  let anterior = null;
  for (let i = d.dias.length - 2; i >= 0; i--) { if (d.dias[i].pu > 0) { anterior = d.dias[i]; break; } }
  check(!!ultimo.pu && !!anterior,
    'guarda: el fixture trae dos lecturas de puente para poder restar');
  check(!d.dias[d.dias.length - 2].pu,
    'guarda: el anteultimo dia NO trae lectura, asi que hay que saltearlo hacia atras');
  const consumo = ultimo.pu - anterior.pu;
  check(/GNC · puente|puente/i.test(t),
    'la estacion muestra el control del puente de GNC');
  check(t.indexOf(consumo.toLocaleString('es-AR')) >= 0,
    'con el consumo del puente = ' + consumo.toLocaleString('es-AR') + ' m³');
  // Faltando la lectura del anteultimo dia, el puente abarca DOS dias y los
  // surtidores uno: restarlos daria +1.440 m³, un numero alarmante y falso.
  // El escritorio lo muestra igual; aca se dice que no se puede comparar.
  check(/No se puede comparar/.test(t),
    'y avisa que no se puede comparar, en vez de restar periodos distintos');
  check(t.indexOf('2 días') >= 0,
    'diciendo cuantos dias abarca el puente');
  // Y con las lecturas de dias consecutivos SI se resta.
  const seguidas = fx.base();
  const ad = seguidas.estaciones.find(e => e.clave === 'adrogue');
  const penu = ad.dias[ad.dias.length - 2];
  penu.pu = ad.dias[ad.dias.length - 1].pu - (ad.dias[ad.dias.length - 1].gnc + 20);
  const t2 = sinTags(irA(correr(seguidas), '#est/adrogue'));
  check(t2.indexOf('Diferencia') >= 0 && t2.indexOf('+20 m³') >= 0,
    'con lecturas de dias seguidos, la diferencia es +20 m³ (dice: ' +
    ((t2.match(/Diferencia[^)]*\)/) || ['nada'])[0]) + ')');
  // El GNC va SIN semaforo: es spec del usuario (22-jul-2026, v1.4.1). No
  // hay colores por rango ni alertas, es dato de referencia.
  const bloque = (vista.match(/puente[^]{0,700}/i) || [''])[0];
  check(!/var\(--bad\)|var\(--ok\)/.test(bloque),
    'y SIN semaforo: el GNC es dato de referencia, no tiene colores por rango');

  // ---- Margen bruto: lo que se paga al camion contra el precio de venta ----
  const cams = d.camiones || [];
  const impMes = cams.reduce((a, c) => a + (c.importe || 0), 0);
  const ltsMes = cams.reduce((a, c) => a + (c.litros || 0), 0);
  check(impMes > 0 && ltsMes > 0,
    'guarda: los camiones del fixture traen importe y litros');
  const costo = impMes / ltsMes;
  check(/Margen bruto/.test(t), 'la estacion muestra el margen bruto');
  const costoTxt = Math.round(costo).toLocaleString('es-AR');
  check(new RegExp(costoTxt.replace('.', '\\.')).test(t),
    'con el costo del camion = $ ' + costoTxt + ' /L (importe ÷ litros descargados)');
  // El precio de venta va PONDERADO por litros: facturacion estimada del
  // liquido dividido los litros vendidos del mes. Sin ponderar da un numero
  // gigante y el margen sale absurdo, pero el texto de la tarjeta es el mismo:
  // por eso se fija el valor, no la etiqueta.
  // `P` es de otro bloque: se rearma aca el arrastre de precios en los dos
  // sentidos, igual que preciosFF.
  const PP = {};
  ['vpn', 'sup', 'vpd', 'form'].forEach(k => {
    const arr = d.dias.map(x => x['pr_' + k] > 0 ? x['pr_' + k] : null);
    let v = null;
    for (let i = 0; i < arr.length; i++) { if (arr[i] != null) v = arr[i]; else arr[i] = v; }
    v = null;
    for (let i = arr.length - 1; i >= 0; i--) { if (arr[i] != null) v = arr[i]; else arr[i] = v; }
    PP[k] = arr;
  });
  const liqFact = d.dias.reduce((a, x, i) =>
    a + x.vpn * PP.vpn[i] + x.sup * PP.sup[i] + x.vpd * PP.vpd[i] + x.form * PP.form[i], 0);
  const liqMes = d.dias.reduce((a, x) => a + (x.liq || 0), 0);
  const pvEsperado = Math.round(liqFact / liqMes);
  check(/Precio de venta prom|venta prom/i.test(t),
    'y el precio de venta promedio, ponderado por litros vendidos');
  // Sin regex: `'\$ '` en un string de JS es solo `$`, o sea un ancla de fin
  // de linea, y el check no matcheaba nunca aunque el numero estuviera.
  check(t.indexOf('$ ' + pvEsperado.toLocaleString('es-AR')) >= 0,
    'que vale $ ' + pvEsperado.toLocaleString('es-AR') + ' /L (facturación del líquido ÷ litros del mes)');
  check(Math.abs(pvEsperado - costo) > 50,
    'guarda: el precio de venta ($ ' + pvEsperado + ') y el costo del camion ($ ' +
    Math.round(costo) + ') son distintos, si no el margen no distingue nada');
  // El VALOR del margen, no solo su titulo: sin este check, sacar la resta
  // (mg = pv en vez de pv - costo) no tumbaba ninguna comprobacion.
  const mgEsperado = Math.round(pvEsperado - costo);
  check(t.indexOf('$ ' + mgEsperado.toLocaleString('es-AR')) >= 0,
    'y el margen es la resta de los dos: $ ' + mgEsperado + ' /L');
  // Este NO distingue si el % se saca sobre el precio o sobre el costo: con un
  // margen de 4%, 97/2317 y 97/2220 redondean los dos a 4%. Es el margen real
  // del combustible; deformar el fixture para separarlos seria mentirle al test.
  check(t.indexOf(Math.round(mgEsperado / pvEsperado * 100) + '% sobre el precio') >= 0,
    'con el ' + Math.round(mgEsperado / pvEsperado * 100) + '% que representa sobre el precio');

  // ---- Precios vigentes ----
  const pr = d.dias.filter(x => x.pr_vpn).pop();
  check(/Precios/.test(t), 'la estacion muestra los precios vigentes');
  check(new RegExp(pr.pr_sup.toLocaleString('es-AR')).test(t),
    'con el ultimo precio cargado de Super (' + pr.pr_sup.toLocaleString('es-AR') + ')');
}

// ===================================================================
seccion('Paridad: el margen solo cuenta los camiones que traen importe');
// ===================================================================
{
  const d0 = fx.base().estaciones.find(e => e.clave === 'adrogue');
  const cs0 = d0.camiones;
  const costoBien = cs0.reduce((a, c) => a + c.importe, 0) /
                    cs0.reduce((a, c) => a + c.litros, 0);
  const t0 = sinTags(irA(correr(fx.base()), '#est/adrogue'));
  check(t0.indexOf('$ ' + Math.round(costoBien).toLocaleString('es-AR')) >= 0,
    'guarda: sin camiones raros el costo es $ ' + Math.round(costoBien));

  // Ahora con un camion mas, de 36.000 L y sin importe.
  const mez = fx.camionSinImporte();
  const dm = mez.estaciones.find(e => e.clave === 'adrogue');
  check(dm.camiones.some(c => !c.importe) && dm.camiones.some(c => c.importe),
    'guarda: el fixture mezcla camiones con importe y sin importe');
  const costoMal = dm.camiones.reduce((a, c) => a + (c.importe || 0), 0) /
                   dm.camiones.reduce((a, c) => a + (c.litros || 0), 0);
  check(Math.round(costoMal) < Math.round(costoBien) * 0.9,
    'guarda: sumar sus litros hundiria el costo a $ ' + Math.round(costoMal) +
    ' (' + Math.round(costoBien) + ' es el bueno)');
  const tm = sinTags(irA(correr(mez), '#est/adrogue'));
  check(tm.indexOf('$ ' + Math.round(costoBien).toLocaleString('es-AR')) >= 0,
    'el costo sigue siendo $ ' + Math.round(costoBien) + ': el camion sin importe no entra');
  check(tm.indexOf('$ ' + Math.round(costoMal).toLocaleString('es-AR')) < 0,
    'y NO aparece el costo hundido de $ ' + Math.round(costoMal));
}

// ===================================================================
seccion('Paridad: cobrado digital dia a dia, facturacion y proyeccion de GNC');
// ===================================================================
{
  const env = correr(fx.base());
  const gen = irA(env, '#');
  const est = irA(env, '#est/adrogue');
  const d = fx.base().estaciones.find(e => e.clave === 'adrogue');

  // ---- Cobrado digital dia a dia (el escritorio: detFact) ----
  check(d.dias.filter(x => x.fact > 0).length > 20,
    'guarda: el fixture trae cobrado digital casi todos los dias');
  check(/Cobrado digital por día|Cobrado digital · día a día/i.test(sinTags(est)),
    'la estacion tiene el grafico de cobrado digital dia a dia');

  // ---- Facturacion estimada en la vista GENERAL, no solo en la estacion ----
  check(/Facturación estimada/.test(sinTags(gen)),
    'la vista general muestra la facturacion estimada del grupo');

  // ---- Proyeccion de GNC, aparte de la de liquido (el escritorio hace las dos) ----
  check(d.dias.some(x => x.gnc > 0), 'guarda: el fixture trae GNC');
  // Contar la palabra «Proyección» NO sirve: ya aparece dos veces en la
  // tarjeta del liquido (el titulo y el pie), asi que el check pasaba en
  // verde sin que hubiera ninguna proyeccion de GNC. Va por el titulo exacto.
  check(est.indexOf('Proyección de cierre · GNC') >= 0,
    'la estacion proyecta el GNC ademas del liquido');
  const cGnc = (est.split('Proyección de cierre · GNC')[1] || '').slice(0, 700);
  check(sinTags(cGnc).indexOf('m³') >= 0, 'y esa proyeccion va en m³, no en litros');
  const proyGnc = Math.round(
    d.dias.reduce((a, x) => a + (x.gnc || 0), 0) /
    d.dias.filter(x => x.gnc > 0).length * 31);
  // Mismo abreviado que usa la pagina (kf): vive dentro del closure de
  // iniciar() y desde aca no se alcanza, asi que se reescribe igual.
  const abrev = x => x >= 1e6 ? (x / 1e6).toLocaleString('es-AR', {maximumFractionDigits: 1}) + ' M'
                  : x >= 1000 ? (x / 1000).toLocaleString('es-AR', {maximumFractionDigits: 1}) + ' k'
                  : x.toLocaleString('es-AR');
  check(sinTags(cGnc).indexOf(abrev(proyGnc)) >= 0,
    'con el valor proyectado = ' + abrev(proyGnc) + ' m³ (promedio diario × 31)');
  // Las estaciones sin GNC no tienen que mostrar una proyeccion vacia.
  const sinG = irA(env, '#est/delle1');
  check(!fx.base().estaciones.find(e => e.clave === 'delle1').dias.some(x => x.gnc > 0),
    'guarda: delle1 no vende GNC');
  check(sinG.indexOf('Proyección de cierre · GNC') < 0,
    'y una estacion sin GNC no muestra la proyeccion de GNC');

  // ---- La misma proyeccion de GNC, pero del GRUPO. Sin este check, tomar los
  // litros liquidos en vez del GNC pasaba en verde: nadie miraba el numero. ----
  const fechas = [...new Set(fx.base().estaciones.flatMap(e => e.dias.map(x => x.fecha)))].sort();
  const gncDia = fechas.map(f => fx.base().estaciones.reduce((a, e) => {
    const x = e.dias.find(y => y.fecha === f); return a + ((x && x.gnc) || 0); }, 0));
  const conGnc = gncDia.filter(v2 => v2 > 0).length;
  const proyGrupo = Math.round(gncDia.reduce((a, b) => a + b, 0) / conGnc * 31);
  const liqDia = fechas.map(f => fx.base().estaciones.reduce((a, e) => {
    const x = e.dias.find(y => y.fecha === f); return a + ((x && x.liq) || 0); }, 0));
  check(Math.round(liqDia.reduce((a, b) => a + b, 0) / liqDia.filter(v2 => v2 > 0).length * 31)
        !== proyGrupo,
    'guarda: la proyeccion de GNC del grupo y la de litros dan distinto');
  check(gen.indexOf('Proyección de cierre · GNC') >= 0,
    'la vista general tambien proyecta el GNC del grupo');
  const cg = (gen.split('Proyección de cierre · GNC')[1] || '').slice(0, 700);
  check(sinTags(cg).indexOf(abrev(proyGrupo)) >= 0,
    'con el valor del GRUPO = ' + abrev(proyGrupo) + ' m³, no el de litros');

  // ---- Lo que no se puede estimar no se suma ni se inventa ----
  const sp = fx.unaSinPrecios();
  const eg = sp.estaciones.find(e => e.clave === 'gasoil');
  check(eg.dias.some(x => x.sup > 0) && !eg.dias.some(x => x.pr_sup > 0),
    'guarda: gasoil vendio todo el mes y quedo sin un solo precio cargado');
  const gsp = irA(correr(sp), '#');
  check(gsp.indexOf('Facturación estimada') >= 0,
    'el grupo sigue mostrando la facturacion estimada de las demas');
  check(/de \d+ estaciones/.test(sinTags(gsp)),
    'y avisa que no entraron todas (dice: ' +
    ((sinTags(gsp).match(/\d+ de \d+ estaciones/) || ['nada'])[0]) + ')');
}

// ===================================================================
seccion('Paridad: medios de pago del dia y precio promedio del litro');
// ===================================================================
{
  const env = correr(fx.base());
  const est = irA(env, '#est/adrogue');
  const gen = irA(env, '#');
  const d = fx.base().estaciones.find(e => e.clave === 'adrogue');
  const ult = d.dias[d.dias.length - 1];

  // ---- Medios de pago DEL DIA. El movil solo tenia los del mes; el
  // escritorio muestra los dos, y el del dia incluye el efectivo. ----
  const PGS = ['pg_efectivo','pg_tarjetas','pg_mpago','pg_shellbox',
               'pg_redencion','pg_flota','pg_ctacte','pg_consumo'];
  const delDia = PGS.reduce((a2, k) => a2 + (ult[k] || 0), 0);
  const delMes = PGS.reduce((a2, k) => a2 + d.dias.reduce((b, x) => b + (x[k] || 0), 0), 0);
  check(delDia > 0 && Math.round(delDia) !== Math.round(delMes),
    'guarda: el fixture trae medios del dia ($ ' + Math.round(delDia) +
    ') distintos de los del mes ($ ' + Math.round(delMes) + ')');
  check(est.indexOf('Medios de pago del día') >= 0,
    'la estacion muestra los medios de pago del dia, no solo los del mes');
  check(est.indexOf('Medios de pago del mes') >= 0,
    'y sigue mostrando los del mes');
  const cDia = (est.split('Medios de pago del día')[1] || '').split('Medios de pago del mes')[0];
  // hbars ABREVIA con kf: 9.288.000 sale «9,3 M». Pedir el numero entero era
  // pedir texto que la pagina no escribe en ningun lado.
  check(sinTags(cDia).indexOf('$ ' + abrevK(ult.pg_efectivo)) >= 0,
    'con el efectivo del dia ($ ' + abrevK(ult.pg_efectivo) +
    '), que es lo que el del mes no tenia separado');
  check(gen.indexOf('Medios de pago del día') >= 0,
    'y la vista general tambien los muestra');

  // ---- Precio promedio del litro, dia a dia: facturacion estimada del
  // liquido dividido los litros vendidos. Es detPerL del escritorio. ----
  check(est.indexOf('Precio promedio del litro') >= 0,
    'la estacion muestra el precio promedio del litro');
  // El valor del ultimo dia, calculado aparte.
  const PP = {};
  ['vpn','sup','vpd','form'].forEach(k => {
    const arr = d.dias.map(x => x['pr_' + k] > 0 ? x['pr_' + k] : null);
    let v = null;
    for (let i = 0; i < arr.length; i++) { if (arr[i] != null) v = arr[i]; else arr[i] = v; }
    v = null;
    for (let i = arr.length - 1; i >= 0; i--) { if (arr[i] != null) v = arr[i]; else arr[i] = v; }
    PP[k] = arr;
  });
  const i0 = d.dias.length - 1;
  const perL = Math.round((ult.vpn * PP.vpn[i0] + ult.sup * PP.sup[i0] +
                           ult.vpd * PP.vpd[i0] + ult.form * PP.form[i0]) / ult.liq);
  // El grafico solo muestra el numero al tocar una barra, y en el celular no
  // hay hover: por eso la tarjeta lo dice ademas en el subtitulo.
  const cPer = (est.split('Precio promedio del litro')[1] || '').slice(0, 1400);
  check(sinTags(cPer).indexOf('$ ' + perL.toLocaleString('es-AR') + ' /L') >= 0,
    'con el valor del ultimo dia a la vista = $ ' + perL.toLocaleString('es-AR') + ' /L');
  // Al tocar una barra, el peso va ADELANTE del numero, como en el resto del
  // panel («$ 2.466», no «2.466 $»). `tocable` nacio solo para litros, donde la
  // unidad va atras, y las dos tarjetas nuevas son las primeras en pasarle $.
  const SC = require('fs').readFileSync('index.html', 'utf8');
  const i1 = SC.indexOf('function tocable');
  const cuerpo = i1 < 0 ? '' : SC.slice(i1, i1 + 600);
  check(cuerpo.length > 0, 'guarda: se encontro el cuerpo de tocable()');
  check(cuerpo.indexOf("unidad==='$'") >= 0,
    'tocable() distingue el peso de las unidades que van atras del numero');

  // Sin precios no se inventa un promedio.
  const sp = irA(correr(fx.unaSinPrecios()), '#est/gasoil');
  check(sp.indexOf('Precio promedio del litro') < 0,
    'y una estacion sin precios no muestra un promedio inventado');
}

// ===================================================================
seccion('«Al dia» respecto de HOY, no de si mismo');
// ===================================================================
// El panel decia «Sin faltantes · las 6 planillas al dia» comparando cada
// estacion contra la MAS NUEVA DEL PAQUETE. Si las seis estaban igual de
// atrasadas, las seis eran «frescas» y afirmaba que no faltaba ninguna sobre
// datos de hace dos dias. Lo vio Ivan un lunes, con el ultimo cierre del
// sabado, y es la afirmacion de fondo del panel: si llegaron las planillas.
{
  const d = fx.todasAlDia();
  const fmax = [...new Set(d.estaciones.flatMap(e => e.dias.map(x => x.fecha)))].sort().pop();
  check(fmax === '2026-08-21', 'guarda: el ultimo cierre del fixture es el 21 (dio ' + fmax + ')');

  // Al dia: el cierre de ayer. La planilla de un dia se carga al siguiente.
  const alDia = sinTags(irA(correr(d, {hoy: '2026-08-22'}), '#'));
  check(/Sin faltantes/.test(alDia) && /todas al día/.test(alDia),
    'con el cierre de AYER dice «Sin faltantes · todas al día»');

  // Dos dias despues: las seis siguen parejas, pero falta un dia de planillas.
  const tarde = sinTags(irA(correr(d, {hoy: '2026-08-23'}), '#'));
  check(!/Sin faltantes/.test(tarde),
    'con un dia de atraso YA NO dice «Sin faltantes», aunque las seis esten parejas');
  check(!/todas al día/.test(tarde), 'ni «todas al día»');
  check(/último cierre/i.test(tarde),
    'sino cual es el ultimo cierre');
  check(tarde.indexOf('vie 21/08') >= 0, 'con su fecha (vie 21/08)');
  check(/falta 1 día/.test(tarde),
    'y cuantos dias de planillas faltan (1)');

  // Cuatro dias: el numero acompaña.
  const muyTarde = sinTags(irA(correr(d, {hoy: '2026-08-26'}), '#'));
  check(/faltan 4 días/.test(muyTarde),
    'con cuatro dias de atraso dice «faltan 4 días» (dice: ' +
    ((muyTarde.match(/falta[n]? \d+ días?/) || ['nada'])[0]) + ')');

  // Y el KPI de planillas deja de afirmar que estan todas al dia.
  const kpi = subDeKpi(irA(correr(d, {hoy: '2026-08-23'}), '#'), 'Planillas');
  check(kpi.indexOf('todas al día') < 0,
    'el KPI de Planillas tampoco dice «todas al día» (dice: ' + kpi.trim() + ')');

  // Lo que NO cambia: si de verdad falta una estacion, eso manda.
  const falta = sinTags(irA(correr(fx.base(), {hoy: '2026-08-22'}), '#'));
  check(/Falta/.test(falta) && !/Sin faltantes/.test(falta),
    'y cuando falta una estacion de verdad, sigue diciendo cual');
}

// ===================================================================
seccion('Dos defectos vistos en produccion el 25-ago');
// ===================================================================
// El ALTO de las barras no se puede medir aca: el SVG lo inyecta el JS despues
// del innerHTML y el shim no lo sigue. La cuenta de la escala vive en
// calculos.js y se prueba ahi (`escalaBarras`); esto mira que el panel la use
// donde corresponde, y el resto se verifica en Chromium.
{
  const d = fx.conMinimercado();
  const e = d.estaciones.find(x => x.clave === 'adrogue');
  const est = irA(correr(d), '#est/adrogue');
  const SC = require('fs').readFileSync('index.html', 'utf8');

  // ---- 1. El grafico del precio por litro salia como un bloque naranja ----
  // Los precios del mes van de ~2.280 a ~2.320: contra una escala desde CERO
  // las 23 barras llegan al mismo tope y no se ve una sola fluctuacion.
  const iPer = SC.indexOf("$('#ePerL')");
  const bloquePer = iPer < 0 ? '' : SC.slice(iPer, iPer + 700);
  check(bloquePer.indexOf('desdeMinimo:true') >= 0,
    'el grafico del precio pide la escala truncada, que es la que deja ver la fluctuacion');
  check(bloquePer.indexOf('no en cero') >= 0,
    'y avisa en pantalla que la escala no arranca en cero: truncar EXAGERA las ' +
    'diferencias y hay que decirlo');
  // El de litros NO: ahi el cero es la referencia y truncarlo mentiria.
  const iVen = SC.indexOf("$('#eVentas')");
  check(SC.slice(iVen, iVen + 300).indexOf('desdeMinimo') < 0,
    'el de litros vendidos sigue arrancando en cero, que ahi el cero SI es la referencia');

  // ---- 2. La proyeccion de GNC decia «Cerró julio: s/d» ----
  // El `prev` que viajaba traia solo fecha y liq, sin gnc. Al agregar la
  // proyeccion de GNC nadie miro eso -- estaba hasta anotado en la memoria del
  // proyecto -- asi que el mes anterior era s/d siempre.
  check(e.prev.length > 0 && e.prev.some(p => p.gnc > 0),
    'guarda: el mes anterior del fixture trae GNC (que es lo que faltaba viajar)');
  const cg = (est.split('Proyección de cierre · GNC')[1] || '').slice(0, 900);
  check(cg.length > 0, 'guarda: la tarjeta de proyeccion de GNC existe');
  check(sinTags(cg).indexOf('s/d') < 0,
    'la proyeccion de GNC ya no dice «s/d» del mes pasado');
  const cerro = Math.round(e.prev.reduce((a2, p) => a2 + (p.gnc || 0), 0));
  const ab = x => x >= 1e6 ? (x/1e6).toLocaleString('es-AR',{maximumFractionDigits:1}) + ' M'
              : x >= 1000 ? (x/1000).toLocaleString('es-AR',{maximumFractionDigits:1}) + ' k'
              : String(x);
  check(sinTags(cg).indexOf(ab(cerro)) >= 0,
    'sino cuanto cerro de verdad (' + ab(cerro) + ' m³)');

  // Con un paquete viejo, que no manda el gnc del mes pasado, no puede
  // inventarlo: ahi «s/d» es la verdad.
  const viejo = fx.paqueteViejo();
  const cgv = (irA(correr(viejo), '#est/adrogue').split('Proyección de cierre · GNC')[1] || '');
  check(cgv.length === 0 || sinTags(cgv.slice(0, 900)).indexOf('s/d') >= 0,
    'pero con un paquete que no lo manda, sigue diciendo s/d en vez de inventar un cero');

  // ---- 3. Y lo mismo en la vista del GRUPO, que es la que se ve al abrir ----
  // Arriba se arreglo `prev` (el dato viaja) y la ficha de UNA estacion, que
  // lee `e.prev` derecho. Pero el grupo no: su mes anterior sale de
  // `grupoPrev`, que suma las estaciones dia por dia y devolvia {fecha, liq}
  // -- el gnc se caia ahi, en el armado. Resultado: cada estacion mostraba su
  // comparativa de GNC y el grupo decia «s/d», que es justo la pantalla que se
  // abre primero. Visto en produccion el 28-ago-2026, con el dato completo en
  // el JSON publicado y la pagina al dia.
  const gen = irA(correr(d), '#');
  const cgg = (gen.split('Proyección de cierre · GNC')[1] || '').slice(0, 900);
  check(cgg.length > 0, 'guarda: la tarjeta de GNC del grupo existe');
  check(sinTags(cgg).indexOf('s/d') < 0,
    'la proyeccion de GNC DEL GRUPO tampoco dice «s/d» del mes pasado');
  const cerroG = Math.round(d.estaciones
    .filter(x => (x.dias || []).length)
    .reduce((a2, x) => a2 + (x.prev || []).reduce((b, p) => b + (p.gnc || 0), 0), 0));
  check(sinTags(cgg).indexOf(ab(cerroG)) >= 0,
    'sino cuanto cerro el grupo de verdad (' + ab(cerroG) + ' m³)');
}

// ===================================================================
seccion('Compatibilidad: la pagina NUEVA sobre el paquete VIEJO');
// ===================================================================
// Cuando se publique esta pagina, las estaciones van a seguir generando el
// paquete con el programa viejo hasta que alguien recompile e instale. Durante
// ese rato corre lo nuevo sobre lo viejo, y tiene que andar. No es hipotetico:
// ya paso una vez al reves, con apps viejas que no podian leer un gist nuevo.
{
  const v = fx.paqueteViejo();
  const dv = v.estaciones.find(e => e.clave === 'adrogue');
  check(!dv.minimercado && !dv.dias.some(x => x.pr_sup) && !dv.dias.some(x => x.pu) &&
        !(dv.camiones || []).some(c => c.importe) && !v.zona,
    'guarda: el paquete no trae NADA de lo que agrega la version nueva');

  const env = correr(v);
  const gen = irA(env, '#');
  const tg = sinTags(gen);
  check(/Litros/.test(tg) && /Estaciones/.test(tg),
    'la vista general se dibuja igual');
  check(!/no se pudo leer/i.test(tg),
    'y NO se lo confunde con un paquete roto: los litros estan donde tienen que estar');
  const litros = dv.dias[dv.dias.length - 1].liq;
  check(tg.indexOf(litros.toLocaleString('es-AR')) >= 0,
    'con los litros del dia (' + litros.toLocaleString('es-AR') + ')');

  const est = irA(env, '#est/adrogue');
  const te = sinTags(est);
  check(te.indexOf('Ventas diarias') >= 0 && te.indexOf('Camiones del mes') >= 0,
    'la estacion tambien, con lo que el paquete SI trae');
  // Y lo que necesita datos nuevos simplemente no aparece. Ninguna tarjeta a
  // medias, ningun cero disfrazado de medicion.
  [['Facturación estimada', 'sin precios no se estima'],
   ['Margen bruto', 'sin importes no hay margen'],
   ['Precio promedio del litro', 'sin precios tampoco'],
   ['Precios de la zona', 'sin bloque de zona'],
   ['data-g="mini"', 'sin minimercado, sin pestana Mini']].forEach(par => {
    check(est.indexOf(par[0]) < 0, 'no dibuja «' + par[0] + '»: ' + par[1]);
  });
  // Ojo con este: la tarjeta del puente SI aparecia, diciendo «falta la lectura
  // en la planilla de este día». Pero con el paquete viejo el campo no viaja
  // para NADIE, asi que ese mensaje le echa la culpa a la planilla de algo que
  // es del programa, y lo diria en las cuatro estaciones todos los dias.
  check(te.indexOf('GNC · puente') < 0,
    'ni el control del puente: si ninguna estacion trae lectura, el campo no viaja');
  // Las noticias, sin URL, siguen siendo texto: no un enlace roto.
  check(gen.indexOf('Noticias') >= 0 && !/<a class="nota"/.test(gen),
    'las noticias se ven, pero sin enlace (que es como estan hoy)');
}

// ===================================================================
seccion('PORT-52 - el service worker, para que abra sin senal');
// ===================================================================
// El arnes mide la FORMA del sw.js y que la pagina lo registre. Que abra sin
// senal de verdad se prueba en Chromium con la red cortada, que es lo unico
// que demuestra el issue; aca no hay service workers.
{
  const fs = require('fs');
  check(fs.existsSync('sw.js'), 'existe el sw.js');
  const sw = fs.readFileSync('sw.js', 'utf8');
  const html = fs.readFileSync('index.html', 'utf8');

  check(/navigator\.serviceWorker/.test(html) && /register\(/.test(html),
    'y la pagina lo registra');
  // Sin esto el registro tumba el panel en cualquier navegador que no los
  // tenga, y en http: los service workers solo viven en https o localhost.
  check(/'serviceWorker' in navigator|"serviceWorker" in navigator/.test(html),
    'preguntando primero si el navegador los tiene');
  check(/catch\(/.test(html.slice(html.indexOf('serviceWorker'))),
    'y sin que un fallo del registro pueda voltear la pagina');

  // Lo que hace que esto sea seguro: la RED PRIMERO. Con cache primero, un
  // push no llega hasta que el service worker decida, y las tres personas se
  // quedan en la version de hace semanas sin enterarse.
  const fetchH = sw.slice(sw.indexOf("addEventListener('fetch'"));
  check(fetchH.indexOf('fetch(req)') < fetchH.indexOf('caches.match'),
    'el fetch va a la RED primero y a la copia solo si falla (no al reves)');
  check(/\.catch\(/.test(fetchH),
    'con la copia como plan B, no como plan A');

  // Los datos NO pasan por aca: tienen su propia copia en localStorage.
  check(/origin !== self\.location\.origin/.test(sw),
    'lo que no es de esta pagina --el Gist-- va derecho a la red');
  check(/res\.ok/.test(fetchH),
    'y no se guarda una respuesta con error, que se serviria para siempre');

  // El esqueleto tiene que incluir lo que hace falta para abrir.
  // calculos.js es el mas importante de la lista: la pagina lo carga como
  // <script src> y sin el no hay una sola cuenta. Si falta aca, sin senal el
  // panel abre y no dibuja nada.
  ['index.html', 'calculos.js', 'manifest.json', 'icon-192.png'].forEach(f =>
    check(sw.indexOf(f) >= 0, 'el esqueleto guarda ' + f));
  check(/navigate/.test(sw),
    'y una navegacion sin red cae en el index, no en la pantalla de error del navegador');

  // Las cachas viejas se borran, o el telefono junta una por publicacion.
  check(/caches\.delete/.test(sw), 'las copias de versiones anteriores se borran');
  check(/const VERSION/.test(sw), 'y hay una version para poder distinguirlas');
}

// ===================================================================
seccion('PORT-53 - un paquete ilegible no puede dibujarse como ceros');
// ===================================================================
{
  const fc = fx.formaCambiada();
  const dias = fc.estaciones.flatMap(e => e.dias);
  check(dias.length > 0 && dias.every(d => d.liq === undefined) && dias[0].litros > 0,
    'guarda: hay ' + dias.length + ' dias y ninguno trae `liq` (el campo cambio de nombre)');
  const v = irA(correr(fc), '#');
  const tv = sinTags(v);
  // Lo peor que hacia: afirmar «Sin faltantes» y «todas al dia». Es una
  // afirmacion sobre la que el que recibe las planillas puede actuar.
  check(tv.indexOf('Sin faltantes') < 0,
    'no dice «Sin faltantes» sobre un paquete que no pudo leer');
  check(!/todas al día/i.test(tv),
    'ni «todas al día»');
  // Sin regex: el `` de la primera version se escribio como caracter
  // BACKSPACE literal y el check no medía nada, igual que aquel `[sS]`.
  check(tv.indexOf(' 0 L') < 0, 'ni dibuja 0 L como si fuera una medicion');
  check(/no se pudo leer|no se puede leer|no se entiende/i.test(tv),
    'dice que el paquete no se pudo leer (dice: ' +
    ((tv.match(/[^.]*no se p[^.]*\./i) || ['nada'])[0]).trim() + ')');

  // UN dia raro no puede voltear el panel entero: la guarda pregunta si NINGUNO
  // trae la clave, no si alguno la pierde. Sin este check, cambiar `some` por
  // `every` pasaba en verde y una fila corrupta dejaba la pantalla en blanco.
  const uno = fx.base();
  const vic = uno.estaciones.find(e => e.dias.length);
  delete vic.dias[3].liq;
  check(vic.dias[3].liq === undefined && vic.dias.some(d => typeof d.liq === 'number'),
    'guarda: a un dia de una estacion le falta `liq` y a los demas no');
  const tu = sinTags(irA(correr(uno), '#'));
  check(!/no se pudo leer/i.test(tu),
    'con un solo dia sin `liq` el panel se dibuja igual, no se da por ilegible');
  check(/Litros/.test(tu) && /Estaciones/.test(tu),
    'y sigue mostrando los litros y las estaciones');

  // Y el caso legitimo NO puede confundirse con este: un mes que todavia no
  // tiene planillas no trae dias, y eso se sigue diciendo como siempre.
  const vacio = fx.mesEnBlanco();
  check(vacio.estaciones.every(e => !(e.dias || []).length),
    'guarda: en el mes en blanco no hay ni un dia');
  const tb = sinTags(irA(correr(vacio), '#'));
  check(/Todavía no hay planillas/i.test(tb),
    'el mes sin planillas sigue diciendo «Todavía no hay planillas»');
  check(!/no se pudo leer/i.test(tb),
    'y NO lo trata como paquete roto, que es un mes normal el dia 1');
}

// ===================================================================
seccion('PORT-37 - el minimercado en el celular');
// ===================================================================
{
  const sinMM = irA(correr(fx.base()), '#est/adrogue');
  check(sinMM.indexOf('data-g="mini"') < 0,
    'guarda: sin datos de minimercado, esa pestana no existe');

  const d = fx.conMinimercado();
  const mm = d.estaciones.find(e => e.clave === 'adrogue').minimercado;
  const est = irA(correr(d), '#est/adrogue');
  check(est.indexOf('data-g="mini"') >= 0, 'con datos, la estacion suma la pestana Mini');
  const g = (est.split('class="gr" data-g="mini"')[1] || '').split('class="gr"')[0];
  const tg = sinTags(g);
  check(tg.length > 200, 'guarda: la pestana tiene contenido');

  const abrev = x => x >= 1e6 ? (x/1e6).toLocaleString('es-AR',{maximumFractionDigits:1}) + ' M'
                   : x >= 1000 ? (x/1000).toLocaleString('es-AR',{maximumFractionDigits:1}) + ' k'
                   : Math.round(x).toLocaleString('es-AR');
  check(tg.indexOf('$ ' + abrev(mm.r.ventas)) >= 0,
    'con la venta del mes ($ ' + abrev(mm.r.ventas) + ')');
  check(tg.indexOf(mm.n + ' días') >= 0,
    'diciendo cuantos dias hay cargados (' + mm.n + ')');
  const prom = Math.round(mm.r.ventas / mm.n);
  check(tg.indexOf('$ ' + abrev(prom)) >= 0,
    'y el promedio diario ($ ' + abrev(prom) + ' = ventas ÷ dias)');
  check(tg.indexOf('$ ' + abrev(mm.r.ventas_netas)) >= 0, 'las ventas netas');
  check(tg.indexOf('$ ' + abrev(mm.r.egresos)) >= 0, 'lo que salio de la caja');
  check(tg.indexOf('$ ' + abrev(mm.r.resultado)) >= 0, 'y el margen bruto');
  check(tg.indexOf(Math.round(mm.r.margen * 100) + '%') >= 0,
    'con el ' + Math.round(mm.r.margen * 100) + '% que representa sobre las netas');
  // El resultado final es NEGATIVO en el caso real: no se puede dibujar como si nada.
  check(mm.r.resultado_neto < 0, 'guarda: el resultado final del fixture da en rojo');
  // El signo va delante del peso: «−$ 6,1 M», que es como se lee en castellano.
  const neto = '−$ ' + abrev(Math.abs(mm.r.resultado_neto));
  check(tg.indexOf(neto) >= 0,
    'y el resultado final se muestra con su signo (' + neto + ')');
  check(tg.indexOf(mm.r.empleados + ' empleados') >= 0,
    'diciendo cuantos empleados se le descontaron');

  check(tg.indexOf('Efectivo') >= 0 && tg.indexOf('Mercado Pago') >= 0 &&
        tg.indexOf('Shell Box') >= 0,
    'el desglose de como se cobro');
  check(tg.indexOf('Mercadería') >= 0 && tg.indexOf('Insumos') >= 0,
    'y el de que salio de la caja');
  check(tg.indexOf('Retenciones') < 0,
    'sin los renglones en cero (retenciones vale 0 y no se dibuja)');
  check(tg.indexOf('Ingresos de playa') < 0,
    'y sin los ingresos de playa, que no son un egreso y confundirian en esa lista');
  check(/vencida|No entró plata/i.test(tg),
    'avisa de la mercaderia vencida, el consumo y las devoluciones');

  // El numero se lee del fixture y no va escrito a mano: cuando se limpiaron
  // las cifras reales del repo (que es publico), este check quedo apuntando a
  // un valor que ya no existia.
  const jul = mm.previos['2026-07'].ventas;
  check(tg.indexOf('julio') >= 0 && tg.indexOf('$ ' + abrev(jul)) >= 0,
    'y la tabla de meses ya cerrados, con las ventas de julio ($ ' + abrev(jul) + ')');
  // Del nombre del archivo, no un pedazo escrito a mano: llevaba el nombre de
  // un encargado y este repo es publico.
  check(tg.indexOf(mm.archivo.split('-')[0]) >= 0,
    'con el archivo de donde sale');

  // --- el «vs mes pasado» (PORT-42) ---------------------------------
  // La trampa: Adrogue va por el dia 18 y julio tiene 31. Comparar los totales
  // dice -47,0% y suena a derrumbe, cuando por dia viene 8,8% abajo. El mes en
  // curso se compara POR DIA; los totales recien cuando el mes cierra.
  check(mm.cerrado === false && mm.n === 18 && mm.prev_ym === '2026-07',
    'guarda: el fixture tiene el mes ABIERTO (dia ' + mm.n + ') y con que comparar');
  const un = unaComa;
  const pctDe = (a, b) => Math.abs((a - b) / b * 100).toFixed(1);
  const porDia = pctDe(mm.r.ventas / mm.n, mm.prev.ventas / 31);
  const enTotal = pctDe(mm.r.ventas, mm.prev.ventas);
  const subVenta = subDeKpi(g, 'Venta del mes');
  check(un(subVenta || '').indexOf(un(porDia + '%')) >= 0 && /por día/.test(subVenta || ''),
    'la venta del mes se compara POR DIA contra julio (' + porDia + '%): ' + subVenta);
  check(un(subVenta || '').indexOf(un(enTotal + '%')) < 0,
    'CORRECCION: y NO en totales (' + enTotal + '%), que compara 18 dias contra 31 ' +
    'y hace pasar por derrumbe un mes que viene apenas abajo');
  check(/julio/i.test(subVenta || ''),
    'diciendo contra que mes compara, no un «vs mes pasado» a secas');
  check(/por día/.test(subDeKpi(g, 'Ventas netas') || ''),
    'las ventas netas tambien');
  // El margen y el resultado final NO se comparan con el mes abierto: el
  // personal y la estructura se descuentan enteros desde el dia 1.
  check(!/vs |por día/.test(subDeKpi(g, 'Margen bruto') || ''),
    'el margen NO se compara con el mes abierto: ' + subDeKpi(g, 'Margen bruto'));
  check(!/vs |por día/.test(subDeKpi(g, 'Resultado final') || ''),
    'ni el resultado final: hasta que el mes cierre vienen hundidos por construccion');

  // Big Blue es el otro lado: mes CERRADO (los 31 dias de julio) y el mes
  // anterior sacado de lo GUARDADO, no de la planilla.
  const gbb = (irA(correr(d), '#est/bigblue').split('class="gr" data-g="mini"')[1] || '')
    .split('class="gr"')[0];
  const mbb = d.estaciones.find(e => e.clave === 'bigblue').minimercado;
  check(mbb.cerrado === true && mbb.prev_origen === 'base',
    'guarda: el fixture de Big Blue tiene el mes CERRADO y el anterior de la base');
  const subBb = subDeKpi(gbb, 'Venta del mes');
  const totBb = pctDe(mbb.r.ventas, mbb.prev.ventas);
  check(un(subBb || '').indexOf(un(totBb + '%')) >= 0 && !/por día/.test(subBb || ''),
    'con el mes CERRADO se comparan los totales (' + totBb + '%, sin «por día»): ' + subBb);
  check(/junio/i.test(subBb || ''), 'contra junio, que es su mes anterior');
  check(/vs /.test(subDeKpi(gbb, 'Margen bruto') || ''),
    'y con el mes cerrado el margen SI se compara');

  // Sin mes anterior no se dibuja nada: ni un «—» ni un 0%, que se leeria
  // como «no cambio».
  const dsp = fx.conMinimercado();
  const msp = dsp.estaciones.find(e => e.clave === 'adrogue').minimercado;
  delete msp.prev; delete msp.prev_ym;
  const gsp = (irA(correr(dsp), '#est/adrogue').split('class="gr" data-g="mini"')[1] || '')
    .split('class="gr"')[0];
  check(!/vs |por día/.test(subDeKpi(gsp, 'Venta del mes') || ''),
    'sin mes anterior no se compara nada: ' + subDeKpi(gsp, 'Venta del mes'));
  check((subDeKpi(gsp, 'Venta del mes') || '').indexOf('días cargados') >= 0,
    'pero el resto del renglon sigue igual');

  // Big Blue tiene el mini del mes PASADO: hay que decirlo, no hacerlo pasar
  // por el mes en curso. Es lo que ocurre el 1 de cada mes.
  const bb = sinTags((irA(correr(d), '#est/bigblue').split('class="gr" data-g="mini"')[1] || '')
    .split('class="gr"')[0]);
  const vbb = d.estaciones.find(e => e.clave === 'bigblue').minimercado.r.ventas;
  check(bb.indexOf('$ ' + abrev(vbb)) >= 0, 'guarda: Big Blue muestra su minimercado');
  check(/julio/i.test(bb) && !/agosto/i.test(bb),
    'y dice que es de JULIO, no lo hace pasar por el mes en curso');
}

// ===================================================================
seccion('el mes no es una opcion adentro del dia');
// ===================================================================
{
  // El escritorio tiene DOS tarjetas, detPieDia en «Del dia» y detPie en «Del
  // mes». Aca habia una sola en «Del dia» con un selector El dia / El mes: el
  // mes escondido como opcion de la pestaña equivocada.
  const grupo = (h, g) => (h.split('class="gr" data-g="' + g + '"')[1] || '').split('class="gr"')[0];
  const d = fx.base();
  const est = d.estaciones.find(e => e.clave === 'adrogue');
  const ult = est.dias[est.dias.length - 1];
  const nf = n => n.toLocaleString('es-AR', {maximumFractionDigits: 0});
  const dia = nf(ult.sup), mes = nf(est.dias.reduce((a, x) => a + (x.sup || 0), 0));
  check(dia !== mes,
    'guarda: el super del dia (' + dia + ' L) y el del mes (' + mes + ' L) dan distinto, ' +
    'si no el check no distinguiria una tarjeta de la otra');

  const h = irA(correr(d), '#est/adrogue');
  const gDia = grupo(h, 'dia'), gMes = grupo(h, 'mes');
  check(!!gDia && !!gMes, 'guarda: los dos grupos existen');

  check(sinTags(gDia).indexOf('Combustibles del día') >= 0,
    '«Del día» tiene la tarjeta del dia');
  check(gDia.indexOf('>' + dia + ' L<') >= 0 && gDia.indexOf('>' + mes + ' L<') < 0,
    'y dibuja el dia (' + dia + ' L), no el mes');
  check(sinTags(gMes).indexOf('Combustibles del mes') >= 0,
    '«Del mes» tiene la tarjeta del mes');
  check(gMes.indexOf('>' + mes + ' L<') >= 0,
    'y dibuja el mes (' + mes + ' L)');

  check(gDia.indexOf('data-m="mes"') < 0 && sinTags(gDia).indexOf('El mes') < 0,
    'y en «Del día» ya no queda el selector que metia el mes adentro del dia');
}

// ===================================================================
seccion('el resumen de los minimercados en la vista general');
// ===================================================================
{
  const card = env => {
    const h = irA(env, '#general');
    // Hasta la seccion que la sigue: cortar por '</div>' agarra el primer
    // cierre anidado y deja afuera casi toda la tarjeta (los checks pasaban a
    // fallar de a siete sin que la tarjeta tuviera nada malo).
    return h.indexOf('id="gMini"') < 0 ? '' : h.split('id="gMini"')[1].split('<section').shift();
  };

  check(!card(correr(fx.base())),
    'sin un solo minimercado, la tarjeta no existe (ni su divisor)');

  // --- los dos en el MISMO mes: aca el total suma de verdad ---
  const d2 = fx.dosMinis();
  const ms = d2.estaciones.filter(e => e.minimercado).map(e => e.minimercado);
  check(ms.length === 2 && ms[0].ym === ms[1].ym,
    'guarda: el fixture tiene DOS minimercados y en el mismo mes (' + ms.map(m => m.ym).join(', ') + ')');
  const c2 = sinTags(card(correr(d2)));
  check(!!c2, 'guarda: con datos, la tarjeta esta');

  const sum = k => ms.reduce((a, m) => a + (m.r[k] || 0), 0);
  [['ventas', 'la venta del mes'], ['ventas_netas', 'las ventas netas'],
   ['egresos', 'lo que salio de la caja'], ['resultado', 'el margen bruto']].forEach(par => {
    const v = '$ ' + abrevK(sum(par[0]));
    check(c2.indexOf(v) >= 0, par[1] + ' es la SUMA de los dos (' + v + ')');
  });

  // El cociente NO se promedia. Con estas dos cifras el promedio ingenuo da
  // 32% y la cuenta buena 33%: un punto de diferencia, que es justo lo que
  // hace falta para que el check pruebe algo.
  const pctBien = Math.round(sum('resultado') / sum('ventas_netas') * 100) + '%';
  const pctProm = Math.round(ms.reduce((a, m) => a + m.r.margen, 0) / 2 * 100) + '%';
  check(pctBien !== pctProm,
    'guarda: la cuenta buena (' + pctBien + ') y el promedio de los margenes (' +
    pctProm + ') dan distinto, si no el check no probaria nada');
  check(c2.indexOf(pctBien + ' de las netas') >= 0,
    'el margen del grupo se REHACE desde las sumas (' + pctBien + ')');
  check(c2.indexOf(pctProm + ' de las netas') < 0,
    'y no es el promedio de los margenes de cada uno (' + pctProm + ')');

  // `resultado_neto` lo trae una sola de las dos: el total no puede pasar por
  // el del grupo sin decir sobre cuantas se armo.
  const conNeto = ms.filter(m => m.r.resultado_neto != null);
  check(conNeto.length === 1 && ms.length === 2,
    'guarda: solo 1 de los 2 minimercados trae el resultado final');
  check(c2.indexOf('1 de 2 minimercados') >= 0,
    'el resultado final dice sobre cuantos se armo (1 de 2)');

  // --- el «vs mes pasado» del grupo (PORT-42) ---
  // Misma trampa que en la tarjeta de una estacion, y una mas: la comparacion
  // solo puede sumar los minis que tienen mes anterior, y tiene que sumar los
  // DOS meses sobre ESE MISMO subconjunto. Un total de agosto sobre 2 contra
  // uno de julio sobre 1 compara cosas distintas.
  const conPrev = ms.filter(m => m.prev && m.prev_ym);
  check(conPrev.length === 2 && ms.every(m => !m.cerrado) &&
        conPrev[0].prev_ym === conPrev[1].prev_ym,
    'guarda: los dos minis del fixture tienen mes anterior (el mismo) y ninguno cerro');
  const sp = k => conPrev.reduce((a, m) => a + (m.prev[k] || 0), 0);
  const nd = conPrev.reduce((a, m) => a + m.n, 0);
  const pctG = (a, b) => Math.abs((a - b) / b * 100).toFixed(1);
  // Por estacion-dia: las dos sumas divididas por sus propios dias cargados.
  const gPorDia = pctG(sum('ventas') / nd, sp('ventas') / (conPrev.length * 31));
  const gTotal = pctG(sum('ventas'), sp('ventas'));
  const subG = subDeKpi(card(correr(d2)), 'Venta del mes');
  check(unaComa(subG || '').indexOf(unaComa(gPorDia + '%')) >= 0 && /por día/.test(subG || ''),
    'el resumen del grupo compara POR DIA contra julio (' + gPorDia + '%): ' + subG);
  check(unaComa(subG || '').indexOf(unaComa(gTotal + '%')) < 0,
    'CORRECCION: y no en totales (' + gTotal + '%), que compara 33 dias cargados ' +
    'contra dos meses enteros y da vuelta el signo');

  // Si uno de los dos no tiene mes anterior, la comparacion sale SOLO del que
  // lo tiene --y lo dice--, en vez de comparar 2 minis contra 1.
  const d3 = fx.dosMinis();
  const mbb3 = d3.estaciones.find(e => e.clave === 'bigblue').minimercado;
  delete mbb3.prev; delete mbb3.prev_ym;
  const c3 = card(correr(d3));
  const mad3 = d3.estaciones.find(e => e.clave === 'adrogue').minimercado;
  const soloAd = pctG(mad3.r.ventas / mad3.n, mad3.prev.ventas / 31);
  const subG3 = subDeKpi(c3, 'Venta del mes');
  check(unaComa(subG3 || '').indexOf(unaComa(soloAd + '%')) >= 0,
    'con uno solo comparable, la variacion es la de ese (' + soloAd + '%): ' + subG3);
  check(/1 de 2/.test(subG3 || ''),
    'y dice sobre cuantos se armo, como hace el resultado final: ' + subG3);
  const mezclaG = pctG(sum('ventas') / nd, mad3.prev.ventas / 31);
  check(unaComa(subG3 || '').indexOf(unaComa(mezclaG + '%')) < 0,
    'CORRECCION: no compara la venta de LOS DOS contra el mes anterior de UNO ' +
    '(' + mezclaG + '%), que es el error facil');

  // --- meses distintos: el de julio NO entra al total ---
  const d1 = fx.conMinimercado();
  const mAd = d1.estaciones.find(e => e.clave === 'adrogue').minimercado;
  const mBb = d1.estaciones.find(e => e.clave === 'bigblue').minimercado;
  check(mAd.ym !== mBb.ym, 'guarda: el fixture tiene los minis en meses distintos (' +
    mAd.ym + ' vs ' + mBb.ym + ')');
  const c1 = sinTags(card(correr(d1)));
  check(c1.indexOf('$ ' + abrevK(mAd.r.ventas)) >= 0 &&
        c1.indexOf('1 de 2 con la planilla de agosto') >= 0,
    'el total sale solo de los que comparten el mes mas nuevo (1 de 2, agosto)');
  const mezcla = '$ ' + abrevK(mAd.r.ventas + mBb.r.ventas);
  check(c1.indexOf(mezcla) < 0,
    'y NO suma agosto con julio, que daria un total de ningun periodo (' + mezcla + ')');
  check(c1.indexOf('$ ' + abrevK(mBb.r.ventas)) >= 0 && /julio/i.test(c1),
    'pero el de julio se ve igual, aparte y con su mes');

  // --- la fecha del archivo, que dice hasta cuando llega cada planilla ---
  check(/-18-08-2026-/.test(mAd.archivo) && !/-\d{2}-\d{2}-\d{4}-/.test(mBb.archivo),
    'guarda: un archivo del fixture trae fecha en el nombre y el otro no');
  check(c1.indexOf('al 18/08') >= 0,
    'el resumen dice hasta cuando llega la planilla de cada uno (al 18/08)');
  check(sinTags(irA(correr(d1), '#est/adrogue')).indexOf('planilla al 18/08') >= 0,
    'y la ficha de la estacion tambien');
  // Del que no la trae no se inventa ninguna: ni un «al », ni un «—».
  const crudo1 = card(correr(d1));
  const bb = sinTags((crudo1.split('#est/bigblue')[1] || '').split('</button>').shift());
  check(!!bb && bb.indexOf('al ') < 0,
    'del que no trae fecha en el nombre no se inventa ninguna');

  check(crudo1.indexOf('data-ruta="#est/adrogue"') >= 0,
    'y cada renglon lleva al panel de esa estacion');
}

// ===================================================================
seccion('PORT-55 - higiene de la PWA');
// ===================================================================
{
  const fs = require('fs');
  const crudo = fs.readFileSync('index.html', 'utf8');
  check(/^<!DOCTYPE html>/i.test(crudo.trim()),
    'la pagina declara el doctype: sin el, el navegador la renderiza en modo quirks');
  check(/<html[^>]*\slang="es"/.test(crudo),
    'y declara el idioma, para que el lector de pantalla la lea en castellano');

  const man = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  const mask = (man.icons || []).filter(i => (i.purpose || '').split(/\s+/).includes('maskable'));
  check(mask.length > 0, 'el manifest declara un icono maskable');
  check(mask.every(i => fs.existsSync(i.src)),
    'y el archivo que nombra existe (' + mask.map(i => i.src).join(', ') + ')');
  // El icono comun NO puede decir maskable: su dibujo se sale de la zona segura
  // por 9 px y sus esquinas son transparentes. Son dos archivos distintos.
  const comun = (man.icons || []).filter(i => i.src === 'icon-512.png');
  check(comun.length === 1 && !(comun[0].purpose || '').includes('maskable'),
    'y el icono comun no se declara maskable, que su dibujo se sale de la zona segura');
}

// ===================================================================
seccion('La estacion se divide en pestanas, como el escritorio');
// ===================================================================
// La paridad le sumo 7 tarjetas a la estacion: de 2.538 px paso a 4.195,
// medido en Chromium a 390 px. De 3 pantallas de scroll a 5. El escritorio
// se topo con lo mismo el 11-ago y lo resolvio con sub-pestanas (GRUPOS_DET
// en panel.html): «antes era una sola columna interminable». Esto copia eso.
//
// El arnes mide la ESTRUCTURA. El cambio de pestana al tocar no se puede
// probar aca -- el shim tiene addEventListener como no-op -- y se verifica
// en Chromium.
{
  // `base()` NO trae francos, asi que ahi la pestana Personal no existe -- y
  // esta bien que no exista. Para los tres grupos hace falta el fixture que si
  // los trae; pedirselos a base() era pedir una pestana sin datos.
  const est = irA(correr(fx.conPersonal()), '#est/adrogue');
  check(est.indexOf('data-g="dia"') >= 0 && est.indexOf('data-g="mes"') >= 0,
    'la estacion trae los grupos Del dia y Del mes');
  check(est.indexOf('data-g="per"') >= 0,
    'y el de Personal, que en el escritorio tambien es su propia pestana');
  // El activo sale como class="tab act": contar el literal `class="tab"` dejaba
  // afuera justo al primero.
  const tabs = (est.match(/class="tab[ "]/g) || []).length;
  check(tabs === 3, 'con un boton por grupo (hay ' + tabs + ')');

  // Cada tarjeta, en el grupo que le toca.
  // Los BOTONES tambien llevan data-g, y son los primeros del documento: buscar
  // el atributo suelto devolvia el boton y el recorte salia vacio. Va por el div.
  const marca = g => 'class="gr" data-g="' + g + '"';
  const grupo = g => {
    const i = est.indexOf(marca(g));
    if (i < 0) return '';
    const sig = ['dia','mes','per'].map(x => est.indexOf(marca(x), i + 5)).filter(x => x > i);
    return est.slice(i, sig.length ? Math.min.apply(null, sig) : est.length);
  };
  const dia = grupo('dia'), mes = grupo('mes'), per = grupo('per');
  check(dia.length > 100 && mes.length > 100 && per.length > 50,
    'guarda: los tres grupos tienen contenido');
  // Este es el que estaba mal: lo agregue debajo del divisor «Del mes».
  check(dia.indexOf('Medios de pago del día') >= 0 &&
        mes.indexOf('Medios de pago del día') < 0,
    'los medios de pago DEL DIA van en Del dia, no colgados de Del mes');
  check(mes.indexOf('Medios de pago del mes') >= 0,
    'y los del mes en Del mes');
  check(dia.indexOf('GNC · puente') >= 0 && dia.indexOf('Precios') >= 0,
    'el puente de GNC y los precios son del dia');
  check(mes.indexOf('Margen bruto') >= 0 && mes.indexOf('Camiones del mes') >= 0,
    'el margen y los camiones son del mes');
  check(per.indexOf('Calendario del personal') >= 0 && per.indexOf('Quiénes trabajan') >= 0,
    'y las dos del personal quedan juntas, que antes estaban una en cada punta');

  // Arranca mostrando Del dia y esconde los otros dos.
  check(/data-g="dia"(?![^>]*hidden)/.test(est),
    'arranca con Del dia a la vista');
  check(/data-g="mes"[^>]*hidden/.test(est) && /data-g="per"[^>]*hidden/.test(est),
    'y los otros dos escondidos: es lo que acorta la pagina');

  // El mismo error de ubicacion en la vista GENERAL: ahi no hay pestanas (el
  // escritorio tampoco las tiene en la general) pero si divisores, y los medios
  // del dia habian quedado abajo del de «Del mes».
  const gen = irA(correr(fx.base()), '#');
  const iDia = gen.indexOf('>Del día<'), iMes = gen.indexOf('>Del mes<');
  const iPg = gen.indexOf('Medios de pago del día');
  check(iDia >= 0 && iMes > iDia && iPg >= 0,
    'guarda: la general tiene los dos divisores y la tarjeta de medios del dia');
  check(iPg < iMes,
    'y en la general los medios del dia van bajo «Del día», no bajo «Del mes»');

  // Una estacion sin francos no tiene por que ofrecer la pestana Personal.
  const sp = fx.conPersonal();
  sp.estaciones.forEach(x => { delete x.francos; });
  const t2 = irA(correr(sp), '#est/adrogue');
  check(t2.indexOf('data-g="per"') < 0,
    'y sin datos de personal, esa pestana no aparece');
}

// ===================================================================
seccion('Paridad: los precios de la zona');
// ===================================================================
{
  const sinZ = irA(correr(fx.base()), '#est/adrogue');
  check(sinZ.indexOf('Precios de la zona') < 0,
    'guarda: sin datos de zona la tarjeta no aparece (es lo que pasa hoy en el paquete real)');

  const dz = fx.conZona();
  const z = dz.zona.adrogue;
  const e = dz.estaciones.find(x => x.clave === 'adrogue');
  const miSup = e.dias.filter(x => x.pr_sup > 0).pop().pr_sup;
  check(miSup !== z.medianas.sup,
    'guarda: mi Super (' + miSup + ') y la mediana de la zona (' + z.medianas.sup + ') son distintos');
  const t2 = sinTags(irA(correr(dz), '#est/adrogue'));
  check(t2.indexOf('Precios de la zona') >= 0, 'con datos, la estacion muestra los precios de la zona');
  check(t2.indexOf(z.en_radio + ' estaciones en ' + z.radio_km + ' km') >= 0,
    'diciendo contra cuantas se compara y en que radio');
  check(t2.indexOf(z.medianas.sup.toLocaleString('es-AR')) >= 0,
    'con la mediana de Super de la zona (' + z.medianas.sup.toLocaleString('es-AR') + ')');
  // Buscar el numero suelto en toda la pantalla no sirve: «30» aparece en
  // otros lados y el check pasaba en verde sin la tarjeta. Va adentro de ella.
  const dif = miSup - z.medianas.sup;
  const card = (irA(correr(dz), '#est/adrogue').split('Precios de la zona')[1] || '').slice(0, 1600);
  check(sinTags(card).indexOf((dif >= 0 ? '+' : '−') + Math.abs(dif).toLocaleString('es-AR')) >= 0,
    'y adentro de la tarjeta, la diferencia contra mi precio (' +
    (dif >= 0 ? '+' : '−') + Math.abs(dif) + ')');
  check(sinTags(card).indexOf(miSup.toLocaleString('es-AR')) >= 0,
    'junto a mi propio precio (' + miSup.toLocaleString('es-AR') + ')');
  // Una estacion que no esta en el bloque de zona no muestra la de otra.
  check(sinTags(irA(correr(dz), '#est/gasoil')).indexOf('Precios de la zona') < 0,
    'y una estacion sin datos de zona propios no muestra los de otra');
}

// ===================================================================
seccion('Paridad: el aviso de cambio de precio');
// ===================================================================
{
  // La etiqueta dice «Cambio de precio», no «cambió»: el primer check que
  // escribi buscaba la forma verbal y daba en verde por los dos lados, con y
  // sin el flag. La funcion ya estaba en la app; el que estaba mal era el test.
  const sinC = sinTags(irA(correr(fx.base()), '#est/adrogue'));
  check(sinC.indexOf('Cambio de precio') < 0,
    'guarda: sin el flag, la estacion no muestra la etiqueta de cambio de precio');
  const conC = fx.conCambioDePrecio();
  const dc = conC.estaciones.find(e => e.clave === 'adrogue');
  check(dc.dias[dc.dias.length - 1].cambio === 'SI',
    'guarda: el fixture marca la ultima planilla con cambio de precio');
  check(sinTags(irA(correr(conC), '#est/adrogue')).indexOf('Cambio de precio') >= 0,
    'con el flag, la estacion avisa que la planilla vino marcada con cambio de precio');
}

// ===================================================================
seccion('PORT-39 - el color de la app instalada acompana al tema');
// ===================================================================
{
  const claro = (HTML.match(/<meta name="theme-color" content="([^"]+)" media="\(prefers-color-scheme: light\)"/) || [])[1];
  check(!!claro, 'guarda: index.html declara un theme-color para modo claro');
  check(MANIFEST.theme_color === claro,
    'el theme_color del manifest es el claro del index (' + claro + '), no ' + MANIFEST.theme_color);
  check(MANIFEST.theme_color === MANIFEST.background_color,
    'theme_color y background_color del manifest son consistentes entre si');
  // PORT-39 es sobre claro/oscuro: borrar el meta oscuro no hacia caer nada.
  const oscuro = (HTML.match(
    /<meta name="theme-color" content="([^"]+)" media="\(prefers-color-scheme: dark\)"/) || [])[1];
  check(!!oscuro && oscuro !== claro,
    'index.html sigue declarando un theme-color distinto para modo oscuro (dice: ' + oscuro + ')');
}

// ===================================================================
// El unico test asincronico va al final: cargar() es async.
// ===================================================================
(function () {
  seccion('PORT-44 #1 - una copia de respaldo rota no puede colgar la carga');
  const ROTA = '{"t":1,"datos":{"estaciones":';   // JSON cortado a la mitad
  let rompe = false;
  try { JSON.parse(ROTA); } catch (e) { rompe = true; }
  check(rompe, 'guarda: la copia de prueba realmente rompe JSON.parse');

  const store = new Map([['ce_gist', 'a'.repeat(32)], ['ce_cache', ROTA]]);
  const env = crearEntorno({idsEstaticos: IDS_ESTATICOS,
    
    localStorage: store,
    fetch: () => Promise.reject(new Error('sin red')),
  });
  vm.createContext(env.ventana);
  // index.html llama a cargar() en su ULTIMA linea: esa es la corrida que hay
  // que medir, la del arranque con la copia rota. Llamarlo de nuevo a mano
  // medía otra cosa — la primera corrida ya se habia comido y borrado la
  // copia, asi que el check recorria el camino "no hay ninguna copia", que
  // ya andaba desde antes del arreglo. Con el bug puesto a proposito
  // (restaurado=true en el catch) NO caia ni un check.
  vm.runInContext(CALCULOS + SCRIPT, env.ventana, {filename: 'index.html'});

  Promise.all(pendientes)
    .then(() => new Promise(r => setImmediate(() => setImmediate(r))))
    .then(() => {
      const v = sinTags(env.html('#vista'));
      check(!/Cargando los datos/.test(v),
        'no queda colgado en "Cargando los datos..." con la copia rota');
      check(/No se pudo cargar/.test(v), 'muestra la pantalla de error');
      // Aparte: con un OR, sacar el boton entero no hacia caer nada.
      check(/>Reintentar</.test(env.html('#vista')),
        'la pantalla de error trae el boton Reintentar');
      check(!store.has('ce_cache') || store.get('ce_cache') !== ROTA,
        'tira la copia rota para que el proximo arranque no vuelva a tropezar');
    })
    .catch(e => {
      check(false, 'cargar() no puede terminar en excepcion sin manejar -> ' + e.message);
    })
    .then(() => {
      console.log('\n' + (fallos
        ? fallos + ' de ' + corridos + ' comprobaciones FALLARON'
        : 'las ' + corridos + ' comprobaciones pasaron'));
      process.exit(fallos ? 1 : 0);
    });
})();
