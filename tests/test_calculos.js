/* Tests de calculos.js — las cuentas que comparten los dos paneles.
 *
 *     node tests/test_calculos.js
 *
 * Van aparte del banco del panel a propósito: éste no dibuja nada ni necesita
 * el shim del DOM. Son funciones puras, y probarlas así es lo que permite
 * fijar los casos raros —el precio que falta, el camión sin importe, la
 * lectura del puente salteada— sin armar una pantalla entera alrededor.
 *
 * Los números no son redondos a propósito: un test con 100 y 200 no distingue
 * una fórmula bien escrita de una que casualmente da lo mismo. Pero tampoco son
 * los reales de nadie — este repo es público (lo necesita GitHub Pages) y el
 * historial de git no se borra.
 */
'use strict';
const C = require('../calculos.js');

let fallas = 0, total = 0;
function check(cond, titulo) {
  total++;
  console.log((cond ? '  ok    ' : '  FALLA ') + titulo);
  if (!cond) fallas++;
}
function seccion(t) { console.log('\n' + t); }

// ---------------------------------------------------------------------------
seccion('rellenarPrecios — el precio se anota sólo cuando cambia');
{
  const r = C.rellenarPrecios([0, 0, 2310, 0, 0, 2420, 0]);
  check(r[0] === 2310 && r[1] === 2310,
    'los días ANTERIORES al primer precio heredan ese primero (si no, facturarían cero)');
  check(r[3] === 2310 && r[4] === 2310, 'y los de después heredan el último conocido');
  check(r[6] === 2420, 'hasta el final');
  check(C.rellenarPrecios([0, 0, 0]).every(x => x === null),
    'sin ningún precio en todo el mes, queda todo en null y no en cero: no es lo mismo');
  check(C.rellenarPrecios([]).length === 0, 'una serie vacía no explota');
}

// ---------------------------------------------------------------------------
seccion('mix — el % Premium incluye el gasoil premium, no sólo la nafta');
{
  const m = C.mix({vpn: 1000, sup: 3000, vpd: 500, form: 500}, 1400);
  check(m.liq === 5000, 'el líquido suma los cuatro productos');
  check(m.premium === 1500, 'premium = V-Power nafta + V/P Diesel');
  check(m.comun === 3500, 'y el común es el resto');
  check(Math.round(m.pctPremium) === 30, 'el % premium se calcula sobre el líquido (30%)');
  // El bug original del escritorio: contar sólo la nafta premium.
  check(Math.round(1000 / 5000 * 100) !== Math.round(m.pctPremium),
    'guarda: contando sólo la nafta daría 20% y no 30 — por eso el gasoil entra');
  check(m.gnc === 1400 && m.liq === 5000, 'el GNC va aparte y NO entra al líquido');
  check(C.mix({}, 0).pctPremium === null,
    'sin litros no hay porcentaje: null, no cero');
  // El panel de escritorio usa ademas los porcentajes sobre el TOTAL (con GNC).
  check(m.total === 6400, 'el total incluye el GNC');
  check(Math.round(m.pctNafta) === 80 && Math.round(m.pctDiesel) === 20,
    'los porcentajes sobre el liquido');
  check(Math.round(m.pctGncT) === 22 && Math.round(m.pctNaftaT) === 63,
    'y los porcentajes sobre el total, que son otra cosa');
  check(C.mix({}, 0).pctGncT === null, 'sin nada, tambien null');
}

// ---------------------------------------------------------------------------
seccion('factEstimada — lo que no se puede estimar no se inventa');
{
  const litros = {sup: [100, 200], vpn: [50, 50]};
  const precios = {sup: [2310, 0], vpn: [2750, 0]};
  const f = C.factEstimada(litros, precios, ['sup', 'vpn']);
  check(f.ok, 'con precios, estima');
  check(f.liq[0] === 100 * 2310 + 50 * 2750, 'el día 1 es litros × precio del día');
  check(f.liq[1] === 200 * 2310 + 50 * 2750,
    'y el día 2 hereda el precio, que es lo que hace rellenarPrecios');

  const sin = C.factEstimada({sup: [100, 200]}, {sup: [0, 0]}, ['sup']);
  check(sin.ok === false,
    'si un producto se vendió y no tiene NINGÚN precio, devuelve ok:false');
  const noVendido = C.factEstimada({sup: [0, 0]}, {sup: [0, 0]}, ['sup']);
  check(noVendido.ok === true,
    'pero un producto que no se vendió no bloquea nada, aunque no tenga precio');

  // El líquido y el total son cosas distintas: el precio por litro del líquido
  // se calcula sobre esa base, y meterle el GNC lo ensuciaría.
  const conGnc = C.factEstimada({sup: [100], gnc: [1000]},
                                {sup: [2310], gnc: [715]}, ['sup']);
  check(conGnc.liq[0] === 231000 && conGnc.total[0] === 231000 + 715000,
    'el GNC entra al total pero NO al líquido');
}

// ---------------------------------------------------------------------------
seccion('puenteGnc — el consumo del puente contra los surtidores');
{
  const seguidas = [
    {fecha: '2026-08-19', pu: 100000, gnc: 1200},
    {fecha: '2026-08-20', pu: 101420, gnc: 1400},
  ];
  const g = C.puenteGnc(seguidas);
  check(g.consumo === 1420, 'el consumo es la RESTA de dos lecturas, no la lectura');
  check(g.dif === 20, 'y la diferencia contra lo que marcaron los surtidores');
  check(Math.round(g.pct * 10) / 10 === 1.4, 'con su porcentaje (1,4%)');

  // El caso que el escritorio calcula mal, y que en julio pasó 4 veces.
  const salteada = [
    {fecha: '2026-08-18', pu: 98600, gnc: 1100},
    {fecha: '2026-08-19', pu: 0, gnc: 1200},        // el encargado no anotó
    {fecha: '2026-08-20', pu: 101420, gnc: 1400},
  ];
  const s = C.puenteGnc(salteada);
  check(s.span === 2,
    'si falta una lectura, avisa cuántos días abarca el puente (2)');
  check(s.desde === '2026-08-18', 'y desde cuándo');
  check(s.dif === undefined,
    'y NO devuelve una diferencia: restar dos días contra un día de surtidores ' +
    'daría ' + (s.consumo - s.gnc) + ' m³, un número alarmante y falso');

  check(C.puenteGnc([{fecha: '2026-08-20', pu: 0, gnc: 1400}]).nd === true,
    'sin lectura del día, no hay control (nd), que no es lo mismo que cero');
  check(C.puenteGnc([]) === null, 'y sin días, null');
  const alReves = C.puenteGnc([
    {fecha: '2026-08-19', pu: 101420, gnc: 1200},
    {fecha: '2026-08-20', pu: 100000, gnc: 1400},   // el contador bajó: imposible
  ]);
  check(alReves.nd === true,
    'un contador que BAJA es un error de carga, no un consumo negativo');
}

// ---------------------------------------------------------------------------
seccion('margen — sólo cuentan los camiones que traen importe');
{
  const buenos = [{importe: 80000000, litros: 36000}, {importe: 80000000, litros: 36100}];
  const liqMes = 200000, fact = 463400000;
  const m = C.margen(buenos, fact, liqMes);
  check(Math.round(m.costo) === Math.round(160000000 / 72100),
    'el costo es importe ÷ litros descargados');
  check(Math.round(m.pv) === Math.round(fact / liqMes),
    'y el precio de venta es la facturación del líquido ÷ litros vendidos');
  check(Math.round(m.mg) === Math.round(m.pv - m.costo), 'el margen es la resta');
  check(Math.round(m.delMes) === Math.round(m.mg * liqMes), 'y el del mes, × los litros');

  // El bug del escritorio.
  const conVacio = buenos.concat([{importe: 0, litros: 36000}]);
  const m2 = C.margen(conVacio, fact, liqMes);
  check(Math.round(m2.costo) === Math.round(m.costo),
    'un camión SIN importe no cambia el costo: sus litros no entran al divisor');
  const malo = 160000000 / (72100 + 36000);
  check(Math.round(malo) < Math.round(m.costo) * 0.8,
    'guarda: contándolo, el costo caería de $ ' + Math.round(m.costo) +
    ' a $ ' + Math.round(malo) + ' y el margen se multiplicaría');

  check(C.margen([], fact, liqMes) === null, 'sin camiones no se estima: null, no cero');
  check(C.margen([{importe: 0, litros: 36000}], fact, liqMes) === null,
    'ni con camiones que no traen importe');
  check(C.margen(buenos, fact, 0) === null, 'ni sin litros vendidos');
}

// ---------------------------------------------------------------------------
seccion('proyeccion — a este ritmo, cuánto cierra');
{
  check(C.proyeccion(100000, 10, 31) === 310000,
    'divide por los días CON datos, no por los transcurridos');
  check(C.proyeccion(0, 0, 31) === null,
    'sin un solo día cargado no hay proyección: null, no cero');
}

console.log('');
if (fallas) { console.log(fallas + ' de ' + total + ' comprobaciones FALLARON'); process.exit(1); }
console.log('las ' + total + ' comprobaciones pasaron');
