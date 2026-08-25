/* Datos de prueba del panel movil.
   Imitan lo que arma movil.armar(): 6 estaciones, `dias` del mes en curso y
   `prev` del anterior (que SOLO trae fecha y liq, igual que en movil.py).
   Cada estacion esta puesta para reproducir un caso concreto: ver README. */

const MES = '2026-08';
const PREV = '2026-07';
const dd = n => MES + '-' + String(n).padStart(2, '0');

/* Un dia con la forma que manda movil.py: los campos en cero NO viajan. */
function dia(n, {liq, gnc = 0, fact = 0, enc = 'Encargado', obs = ''} = {}) {
  const d = {fecha: dd(n), liq};
  if (gnc) d.gnc = gnc;
  if (fact) d.fact = fact;
  if (enc) d.encargado = enc;
  if (obs) d.obs = obs;
  // Reparto de productos: la suma da `liq`, como en la planilla.
  d.vpn = Math.round(liq * 0.18);
  d.sup = Math.round(liq * 0.42);
  d.vpd = Math.round(liq * 0.15);
  d.form = liq - d.vpn - d.sup - d.vpd;
  d.pg_efectivo = Math.round(liq * 900);
  d.pg_tarjetas = Math.round(liq * 500);
  // Los precios NO se cargan todos los dias: el encargado los anota cuando
  // cambian. Aca se ponen solo los dias 3 y 15, para ejercitar el arrastre
  // hacia adelante Y hacia atras que hace preciosFF en el escritorio.
  if (n === 3 || n === 15) {
    // Un 1,3%: es lo que se mueve un precio de verdad en un mes. Estuvo en 1.10
    // --un 10%-- y con ese salto el eje del precio quedaba tan ancho que el
    // abreviado en miles alcanzaba a distinguir las etiquetas, asi que el
    // defecto de las «cuatro veces 2,3 k» no se reproducia en las pruebas
    // aunque estuviera en la app.
    const sube = n === 15 ? 1.013 : 1;
    d.pr_vpn = Math.round(2500 * sube);
    d.pr_sup = Math.round(2100 * sube);
    d.pr_vpd = Math.round(2400 * sube);
    d.pr_form = Math.round(2200 * sube);
    d.pr_gnc = Math.round(650 * sube);
    d.pr_aceite = Math.round(6000 * sube);
  }
  return d;
}

/* El mes anterior. `gnc` viaja desde el 25-ago: hasta entonces `prev` traia
   solo fecha y liq, y por eso la proyeccion de GNC decia «Cerró julio: s/d»
   siempre, aunque julio tuviera GNC. Se vio en produccion. */
const prevDias = (base, gncBase = 0) =>
  Array.from({length: 31}, (_, i) => {
    const d = {fecha: PREV + '-' + String(i + 1).padStart(2, '0'), liq: base + (i % 5) * 100};
    if (gncBase) d.gnc = gncBase + (i % 4) * 50;
    return d;
  });

/* dias 1..hasta. `gncDe(n)` decide cuanto GNC vendio ese dia. */
function mes(hasta, {base, gncDe = () => 0, enc = 'Encargado'} = {}) {
  const dias = Array.from({length: hasta}, (_, i) =>
    dia(i + 1, {liq: base + (i % 7) * 220, gnc: gncDe(i + 1), fact: (base + i * 90) * 620, enc}));
  // `pu` es la lectura del PUENTE de GNC: un contador acumulado, no el
  // consumo del dia. El panel saca el consumo restando dos lecturas. Se le
  // suma 20 por dia para que quede una diferencia contra lo que marcaron
  // los surtidores, que es justo lo que el control mira.
  let acum = 100000;
  dias.forEach((d, i) => {
    if (!d.gnc) return;
    acum += d.gnc + 20;
    // El anteultimo dia queda SIN lectura a proposito: el encargado no siempre
    // la anota. El control tiene que saltearlo y restar contra la ultima que
    // haya, no contra el dia anterior a secas.
    if (i !== dias.length - 2) d.pu = acum;
  });
  return dias;
}

/* El dia mas nuevo del grupo: fechaMax = 2026-08-21.
   Las fechas van FIJAS a proposito. Se probo hacerlas relativas a hoy --para
   que el panel no las viera atrasadas-- y eso metia la fecha de corrida en
   TODOS los promedios: siete checks de porcentajes se rompian solos cada
   mañana. El «hoy» lo controla el arnes (crearEntorno({hoy})), que es donde
   tiene que estar. */
const HOY = 21;

const base = () => ({
  generado: '2026-08-22T07:14:03',
  publicado_por: 'Automatizacion',
  estaciones: [
    // Al dia, con GNC todos los dias. El caso normal.
    {clave: 'adrogue', nombre: 'Adrogue', dias: mes(HOY, {base: 9000, gncDe: () => 1400, enc: 'Aníbal'}),
     prev: prevDias(8600, 1300),
     // Los camiones traen el importe pagado: es lo que permite el margen bruto.
     camiones: [{d: 5, m: 8, litros: 30000, boleta: 'B-1001', importe: 61200000,
                 'SUPER': 20000, 'V-POWER': 10000},
                {d: 18, m: 8, litros: 20000, boleta: 'B-1042', importe: 41000000,
                 'V/P DIESEL': 12000, 'Evolux D': 8000}]},
    // Al dia y CON GNC el mes entero, pero el ULTIMO dia el compresor no
    // vendio: es el caso de PORT-44 #2.
    {clave: 'bigblue', nombre: 'Big Blue', dias: mes(HOY, {base: 7400, gncDe: n => (n === HOY ? 0 : 1100), enc: 'Delia'}),
     prev: prevDias(7100, 1050)},
    // ATRASADA 3 dias y con un ultimo dia muy alto: entra al top 3 del ticker
    // con un dato viejo. Es el caso de PORT-44 #3.
    {clave: 'temperley', nombre: 'Temperley', dias: mes(HOY - 3, {base: 6200, gncDe: () => 900, enc: 'Tito'}).concat([]),
     prev: prevDias(6000)},
    {clave: 'gasoil', nombre: 'Gasoil', dias: mes(HOY, {base: 8100, gncDe: () => 1250, enc: 'Ramona'}),
     prev: prevDias(7900, 1200)},
    // Sin GNC nunca (como las Dellepiane reales).
    {clave: 'delle1', nombre: 'Dellepiane 1', dias: mes(HOY, {base: 5300, enc: 'Elsa'}),
     prev: prevDias(5100)},
    // NI UNA FILA en el mes. Es el caso de PORT-38.
    {clave: 'delle2', nombre: 'Dellepiane 2', dias: [], prev: prevDias(4800)},
  ],
  zona: {},
  notas: [
    {f: '2026-08-21', fu: 'Surtidores', t: 'Suben los combustibles', u: 'https://surtidores.com.ar/nota-1'},
    {f: '2026-08-20', fu: 'Ambito', t: 'El litro en el AMBA'},   // SIN url: el caso viejo
    // Las noticias vienen de un feed de afuera: el panel no puede confiar en
    // que la URL sea navegable. Si esta no queda bloqueada, el check de
    // urlSegura esta pasando sin mirar nada.
    {f: '2026-08-19', fu: 'Feed dudoso', t: 'Titular con URL que no es http', u: 'javascript:alert(1)'},
    {f: '2026-08-19', fu: 'Surtidores', t: 'Nuevo esquema de biocombustibles', u: 'https://surtidores.com.ar/nota-3'},
    {f: '2026-08-18', fu: 'La Nacion', t: 'Repunta la venta de GNC', u: 'https://lanacion.com.ar/nota-4'},
  ],
});

/* Hace que el ultimo dia de `temperley` sea muy alto, para que gane el top 3
   del ticker aun estando atrasada (PORT-44 #3). */
function conAtrasadaLider() {
  const d = base();
  const t = d.estaciones.find(e => e.clave === 'temperley');
  t.dias[t.dias.length - 1].liq = 19800;
  return d;
}

/* Las 6 al dia: para el camino feliz («Sin faltantes · 6/6»). */
function todasAlDia() {
  const d = base();
  const t = d.estaciones.find(e => e.clave === 'temperley');
  t.dias = mes(HOY, {base: 6200, gncDe: () => 900, enc: 'Tito'});
  const d2 = d.estaciones.find(e => e.clave === 'delle2');
  d2.dias = mes(HOY, {base: 4900, enc: 'Ovidio'});
  return d;
}

/* Las otras cinco al dia y delle2 sin NINGUNA fila: es el titular de PORT-38
   ("Sin faltantes - 5/5 planillas al dia" siendo 6 estaciones). Es el unico
   caso donde el numero de la banda distingue el mundo roto del arreglado. */
function soloFaltaLaVacia() {
  const d = todasAlDia();
  d.estaciones.find(e => e.clave === 'delle2').dias = [];
  return d;
}

/* Una estacion CON surtidor de GNC, arrancando el mes, que todavia no cargo
   ni un dia con GNC: el caso literal de PORT-44 #2. */
function arranqueDeMes() {
  const d = base();
  d.estaciones.forEach(e => { e.dias = e.dias.slice(0, 2).map(x => { const y = {...x}; delete y.gnc; return y; }); });
  return d;
}

/* NINGUNA estacion cargo un dia del mes: es el 1o de mes antes de la primera
   publicacion. Sin fechaMax no hay titulo, ni proyeccion, ni graficos — todo
   sale de ahi. Era la unica rama de la tanda sin un caso que la ejerciera. */
function mesEnBlanco() {
  const d = base();
  d.estaciones.forEach(e => { e.dias = []; });
  return d;
}

/* Payloads hostiles en los campos que HOY salen de constantes del repo que
   arma el JSON (perfiles.NOMBRES, columnas_tanques). No son alcanzables por un
   encargado tipeando en la planilla — pero el JSON viaja entre dos repos que se
   publican por separado, y el escapado cuesta tres lineas. */
const XSS_TEXTO = '<img src=x onerror="window.__BOOM=1">';
const XSS_ATRIB = 'x"><img src=x onerror="window.__BOOM=1">';

function hostil() {
  const d = base();
  d.estaciones[0].nombre = XSS_TEXTO;
  d.estaciones[1].clave = XSS_ATRIB;
  d.estaciones[2].tanques = [{tk: XSS_TEXTO, prod: 'Super', venta: 100, med: 90}];
  // El dia y el mes del camion se dibujan con padStart, sin escapar y sin
  // tope de largo. Se le escaparon a la primera pasada de escapado.
  d.estaciones[0].camiones = [{d: XSS_TEXTO, m: XSS_TEXTO, litros: 30000, boleta: 'B1'}];
  d.generado = '2026-08-22T</b><img src=x onerror="window.__BOOM=1">';
  return d;
}

/* La banda «Sin faltantes» es OTRA rama que la de «Falta N», y es la unica
   con `hora` sin escapar. hostil() se arma sobre base(), donde falta una
   planilla, asi que nunca entraba ahi: el check pasaba por el costado. */
function hostilTodasAlDia() {
  const d = todasAlDia();
  // `hora` es generado.slice(11,16): CINCO caracteres. El payload largo de
  // antes se recortaba a '</b><' y el check no podia dispararse nunca — el
  // test pasaba por el costado, que es justo lo que venia a arreglar.
  // Los indices 11..15 de esto son exactamente '<img '.
  d.generado = '2026-08-22T<img src=x onerror="window.__BOOM=1">';
  d.estaciones[0].nombre = 'Shell & Cía';   // un & de verdad, no un ataque
  return d;
}

/* Los dias al reves: el panel toma el ULTIMO elemento como el mas nuevo y no
   valida el orden en ningun lado. Con el orden invertido inventaba un
   «↑ 0,0%» y un «sin GNC este mes» justo debajo de 2.650 m3. */
function diasAlReves() {
  const d = base();
  d.estaciones.forEach(e => { e.dias = e.dias.slice().reverse(); });
  return d;
}

/* Un camion SIN importe cargado entre los que si lo tienen. En julio-2026 los
   datos reales son todo o nada (solo BigBlue carga importes), pero si un mes
   viene mezclado, sumar los litros de los camiones sin importe hunde el costo
   por litro y el margen sale inventado, sin avisar. */
/* Una estacion CON datos de personal: quienes trabajan hoy y el calendario
   del mes. `base()` no los trae, asi que la pestana Personal no existe ahi.
   La forma es la que arma movil._francos: {hoy:[{n,c,e,t,s}], cal:[{n,c}]}. */
function conPersonal() {
  const d = base();
  const e = d.estaciones.find(x => x.clave === 'adrogue');
  e.francos = {
    hoy: [{n: 'Aristóbulo', c: 'P', e: 'trabaja', t: 'TM'},
          {n: 'Nélida', c: 'P', e: 'trabaja', t: 'TT'},
          {n: 'Cacho', c: 'F', e: 'franco'}],
    cal: [{n: 'Aristóbulo', c: {'1': 'P', '2': 'P', '3': 'F'}},
          {n: 'Nélida', c: {'1': 'F', '2': 'P', '3': 'P'}}],
  };
  return d;
}

/* El minimercado, con la forma que arma movil._minimercado: el resumen
   recortado a lo que se dibuja, `n` en vez de la lista dia por dia, y los
   meses cerrados con cinco cifras. Los numeros son del mismo orden de
   magnitud que los reales pero NO son los de nadie: este repo es publico
   (lo necesita GitHub Pages) y el historial de git no se borra. Big Blue queda con el mini del mes PASADO,
   que es lo que pasa el 1 de cada mes. */
function conMinimercado() {
  const d = base();
  d.estaciones.find(x => x.clave === 'adrogue').minimercado = {
    ym: '2026-08', archivo: 'ADROGUE-18-08-2026-Minimercado-ENCARGADO.xlsx', n: 18,
    r: {ventas: 31207640, ventas_netas: 30861155, egresos: 22470318,
        resultado: 8390837, margen: 0.2958, resultado_neto: -5218904,
        empleados: 5, costo_personal: 11400000,
        efectivo: 16240880, mercado_pago: 10118455, tarjeta: 3402190,
        red: 18270, shellbox: 481630,
        mercaderia: 20713640, insumos: 1145030, gasto: 428760,
        retenciones: 0, ingresos_playa: 4100000,
        ven: 88400, consumo: 91250, devoluciones: 133700},
    previos: {'2026-07': {ventas: 58904310, ventas_netas: 57612480,
                          egresos: 40318970, resultado: 17293510}},
  };
  d.estaciones.find(x => x.clave === 'bigblue').minimercado = {
    ym: '2026-07', archivo: 'BIG_BLUE-Minimercado.xlsx', n: 31,
    r: {ventas: 39884270, ventas_netas: 39740355, egresos: 24905180,
        resultado: 14835175, margen: 0.3695},
  };
  return d;
}

/* El paquete con la forma cambiada: `liq` renombrado a `litros`, que es lo
   que pasaria si el repo que arma el JSON le cambia el nombre a un campo.
   OJO con la diferencia que importa: aca los dias EXISTEN y ninguno trae
   `liq`. Eso no es lo mismo que un mes sin planillas todavia (mesEnBlanco),
   donde no hay dias en absoluto — y ese caso SI es legitimo. */
function formaCambiada() {
  // Sobre todasAlDia y no sobre base(): con estaciones faltantes de verdad el
  // panel no llega a decir «Sin faltantes», que es justo la afirmacion
  // peligrosa. Con todas al dia, la dice sobre datos que no pudo leer.
  const d = todasAlDia();
  d.estaciones.forEach(e => e.dias.forEach(x => { x.litros = x.liq; delete x.liq; }));
  return d;
}

/* EL PAQUETE QUE ESTA PUBLICADO HOY, tal cual, con los campos que la version
   nueva del programa agrega SACADOS a mano.

   Por que existe: cuando se publica la pagina nueva, las estaciones siguen
   generando el paquete con el programa VIEJO hasta que alguien recompile e
   instale. O sea que durante horas o dias corre la pagina nueva sobre el JSON
   viejo, y eso tiene que andar. Ya paso una vez al reves --una version nueva
   que las apps viejas no podian leer-- y es de las cosas que no se ven hasta
   que estan publicadas. */
function paqueteViejo() {
  const d = base();
  delete d.zona;
  (d.notas || []).forEach(n => { delete n.u; });          // PORT-36 todavia no
  d.estaciones.forEach(e => {
    delete e.minimercado;                                  // PORT-37 todavia no
    e.dias.forEach(x => {
      ['vpn', 'sup', 'vpd', 'form', 'gnc', 'aceite'].forEach(k => delete x['pr_' + k]);
      delete x.pu; delete x.ac_lts; delete x.cambio;
      ['pg_mpago', 'pg_shellbox', 'pg_redencion', 'pg_flota', 'pg_ctacte',
       'pg_consumo'].forEach(k => delete x[k]);
    });
    (e.prev || []).forEach(x => { delete x.gnc; });          // el mes anterior, sin GNC
    (e.camiones || []).forEach(c => { delete c.importe; });
  });
  return d;
}

function camionSinImporte() {
  const d = base();
  const e = d.estaciones.find(x => x.clave === 'adrogue');
  e.camiones.push({d: 28, m: 8, anio: 2026, boleta: '999999', litros: 36000});
  return d;
}

/* La planilla vino marcada con cambio de precio (el flag SI/NO del nombre del
   archivo). En julio-2026 paso 6 veces en el grupo. */
/* Una estacion que vendio todo el mes y no tiene NINGUN precio cargado. La
   facturacion estimada no se puede calcular ahi, y lo que no se puede
   calcular no se suma al total del grupo: se dice cuantas entraron. */
function unaSinPrecios() {
  const d = base();
  const e = d.estaciones.find(x => x.clave === 'gasoil');
  e.dias.forEach(x => ['vpn', 'sup', 'vpd', 'form', 'gnc', 'aceite']
    .forEach(k => delete x['pr_' + k]));
  return d;
}

/* Los precios de la zona, con la forma exacta que arma zona.py y reenvia
   movil.py: solo `en_radio`, `radio_km` y `medianas` (banderas y competencia
   no viajan al celular). HOY esto llega vacio en el paquete real porque
   ninguna estacion tiene lat/lon cargadas en la config del escritorio, asi
   que el fixture es la unica forma de ejercitar la tarjeta. */
function conZona() {
  const d = base();
  d.zona = {
    adrogue: {en_radio: 9, radio_km: 3,
              medianas: {vpn: 2680, sup: 2280, vpd: 2600, form: 2400, gnc: 700}},
  };
  return d;
}

function conCambioDePrecio() {
  const d = base();
  const e = d.estaciones.find(x => x.clave === 'adrogue');
  e.dias[e.dias.length - 1].cambio = 'SI';
  return d;
}

module.exports = {conMinimercado, formaCambiada, paqueteViejo, base, conAtrasadaLider, todasAlDia, soloFaltaLaVacia, arranqueDeMes, unaSinPrecios, conPersonal, conZona, camionSinImporte, conCambioDePrecio,
                  hostil, hostilTodasAlDia, diasAlReves, XSS_TEXTO, XSS_ATRIB,
                  mesEnBlanco, MES, PREV, HOY, dd};
