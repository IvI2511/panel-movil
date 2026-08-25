/* calculos.js — las cuentas que comparten el panel de escritorio y el del
 * celular. FUENTE CANÓNICA: este archivo, en el repo `panel-movil`.
 *
 * ---- Por qué existe ----
 *
 * Los dos paneles dibujan los mismos números y hasta el 24-ago-2026 cada uno
 * los calculaba por su cuenta. Al copiar las fórmulas de uno al otro
 * aparecieron **dos cuentas del escritorio que devuelven números falsos sin
 * avisar**, y no se encontraron leyendo el código: se encontraron porque hubo
 * que escribir la misma cuenta dos veces y los resultados no dieron igual.
 *
 *   1. El puente de GNC restaba lecturas de días no consecutivos y comparaba
 *      ese consumo contra los surtidores de UN día. En julio-2026 pasó 4 veces.
 *   2. El margen bruto dividía los importes por los litros de TODOS los
 *      camiones, incluidos los que vienen con importe en cero: con uno de
 *      36.000 L sin importe entre dos que sí, el costo cae de $ 2.220 a $ 1.291.
 *
 * Las dos están arregladas acá. Mientras las cuentas vivan en un solo lado, un
 * arreglo alcanza a los dos paneles y una diferencia entre ellos es imposible.
 *
 * ---- Cómo se mantiene ----
 *
 * Igual que `perfiles_v4.py` en el resto del portafolio: la copia canónica es
 * ésta, se copia a `App Control Estaciones/src/static/calculos.js`, y
 * `tools/verificar_calculos.py` falla si se despegan.
 *
 * ---- Por qué las funciones toman arrays y no los objetos de cada panel ----
 *
 * Porque los dos guardan los datos distinto: el escritorio lee los precios de
 * `d.precios[k]` y el celular de `d.pr_vpn`. Si este archivo conociera una de
 * las dos formas, sería una copia de ese panel y no algo compartido. Así que
 * recibe series de números y devuelve series de números; cada panel arma sus
 * arrays desde su propia forma, que son tres líneas de cada lado.
 */
(function (raiz) {
  'use strict';

  /* Rellena los huecos de una serie de precios en los DOS sentidos.
   *
   * El encargado anota el precio sólo cuando cambia, así que un día sin precio
   * hereda el último conocido. Y los días ANTERIORES al primer precio cargado
   * heredan ese primero: sin eso, la facturación estimada de esos días daría
   * cero, que no es "no se vendió" sino "no sabemos a cuánto".
   *
   * Entra: array de números o null/0. Sale: array del mismo largo. */
  function rellenarPrecios(serie) {
    const arr = serie.map(v => (v > 0 ? v : null));
    let v = null;
    for (let i = 0; i < arr.length; i++) { if (arr[i] != null) v = arr[i]; else arr[i] = v; }
    v = null;
    for (let i = arr.length - 1; i >= 0; i--) { if (arr[i] != null) v = arr[i]; else arr[i] = v; }
    return arr;
  }

  /* Mix de combustibles y el % Premium.
   *
   * El % Premium incluye el GASOIL premium, no sólo la nafta. El escritorio
   * documenta el bug original: calcularlo con V-Power nafta solo daba 17,7%
   * donde la planilla decía 37,5%. Vive acá para que el KPI del día y el
   * bloque del mes no puedan volver a despegarse. */
  function mix(o, gnc) {
    const nafta = (o.vpn || 0) + (o.sup || 0);
    const diesel = (o.vpd || 0) + (o.form || 0);
    const premium = (o.vpn || 0) + (o.vpd || 0);
    const liq = nafta + diesel;
    const g = gnc || 0, tot = liq + g;
    const p = (x, base) => (base ? x / base * 100 : null);
    return {
      nafta: nafta, diesel: diesel, premium: premium, comun: liq - premium,
      liq: liq, gnc: g, total: tot,
      // Los porcentajes sobre el LÍQUIDO y sobre el TOTAL son cosas distintas y
      // los dos paneles usan unos u otros: van todos, y cada uno toma los suyos.
      pctPremium: p(premium, liq), pctNafta: p(nafta, liq), pctDiesel: p(diesel, liq),
      pctNaftaT: p(nafta, tot), pctDieselT: p(diesel, tot), pctGncT: p(g, tot),
    };
  }

  /* Facturación estimada día a día: litros × precio del día.
   *
   * `litros` y `precios` son {clave: serie}, del mismo largo. `liquidos` dice
   * cuáles claves suman al combustible líquido (el resto —GNC, aceite— entra
   * al total pero no al líquido, porque el precio por litro del líquido se
   * calcula sobre esa base).
   *
   * Devuelve `{ok:false}` si un producto que SÍ se vendió no tiene ningún
   * precio en todo el mes. Ahí no se estima nada: un número inventado con
   * cara de medición es peor que un renglón que dice que falta el dato. */
  function factEstimada(litros, precios, liquidos) {
    const claves = Object.keys(litros);
    const P = {};
    claves.forEach(k => { P[k] = rellenarPrecios(precios[k] || []); });
    const sinPrecio = k =>
      (litros[k] || []).some(v => (v || 0) > 0) && P[k].every(x => x == null);
    if (claves.some(sinPrecio)) return {ok: false};

    const n = claves.length ? (litros[claves[0]] || []).length : 0;
    const liq = [], total = [];
    for (let i = 0; i < n; i++) {
      let l = 0, t = 0;
      claves.forEach(k => {
        const x = (litros[k][i] || 0) * (P[k][i] || 0);
        t += x;
        if (liquidos.indexOf(k) >= 0) l += x;
      });
      liq.push(l); total.push(t);
    }
    return {ok: true, liq: liq, total: total};
  }

  /* Control del GNC: el consumo que marcó el PUENTE contra lo que marcaron los
   * surtidores.
   *
   * `lecturas` es [{fecha:'YYYY-MM-DD', pu, gnc}] ordenado por fecha. `pu` es
   * un contador ACUMULADO, no el consumo del día: el consumo sale de restar
   * dos lecturas. No todos los días traen lectura, así que se busca hacia
   * atrás la última que haya.
   *
   * **Acá está la divergencia deliberada con el escritorio.** Si la lectura
   * anterior no es del día previo, la resta abarca más de una jornada y
   * compararla contra los surtidores de UNA da una diferencia enorme y sin
   * sentido. En julio-2026 pasó 4 veces (Adrogué el 05, Temperley el 01, 02 y
   * 07). El escritorio la muestra igual; acá se devuelve `span` y el panel
   * dice que el período no coincide en vez de afirmar una diferencia falsa. */
  function puenteGnc(lecturas) {
    if (!lecturas || !lecturas.length) return null;
    const L = lecturas[lecturas.length - 1];
    let prev = null;
    for (let i = lecturas.length - 2; i >= 0; i--) {
      if (lecturas[i].pu > 0) { prev = lecturas[i]; break; }
    }
    if (!L.pu || !prev || L.pu <= prev.pu) return {nd: true, gnc: L.gnc || 0};
    const consumo = L.pu - prev.pu;
    const dd = (a, b) =>
      Math.round((new Date(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) -
                  new Date(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
    const span = dd(prev.fecha, L.fecha);
    if (span !== 1) {
      return {consumo: consumo, gnc: L.gnc || 0, span: span, desde: prev.fecha};
    }
    const dif = consumo - (L.gnc || 0);
    return {consumo: consumo, dif: dif, pct: L.gnc ? dif / L.gnc * 100 : 0, gnc: L.gnc || 0};
  }

  /* Margen bruto estimado: lo que se paga por litro al camión contra el precio
   * de venta promedio del mes.
   *
   * **Sólo entran los camiones que TRAEN importe.** El escritorio suma los
   * litros de todos, incluidos los que vienen en cero: con un camión de
   * 36.000 L sin importe entre dos que sí lo tienen, el costo por litro cae de
   * $ 2.220 a $ 1.291 y el margen se multiplica, sin ningún aviso. En
   * julio-2026 es todo o nada (sólo Big Blue carga importes) y por eso no se
   * nota, pero es un número de plata y no puede depender de que siga así.
   *
   * Devuelve null si no se puede calcular, que no es lo mismo que cero. */
  function margen(camiones, factLiquido, litrosVendidos) {
    const cs = (camiones || []).filter(c => c.importe > 0);
    const imp = cs.reduce((a, c) => a + c.importe, 0);
    const lts = cs.reduce((a, c) => a + (c.litros || 0), 0);
    if (!(imp > 0 && lts > 0 && litrosVendidos > 0)) return null;
    const costo = imp / lts;
    const pv = factLiquido / litrosVendidos;
    const mg = pv - costo;
    return {costo: costo, pv: pv, mg: mg, pct: pv ? mg / pv * 100 : 0,
            delMes: mg * litrosVendidos};
  }

  /* Proyección de cierre de mes: a este ritmo, cuánto cerraría.
   *
   * Divide por los días CON datos, no por los transcurridos: si no, el día 3
   * la proyección se dispara o se hunde según cuántos se hayan cargado. */
  function proyeccion(acumulado, diasConDatos, diasDelMes) {
    if (!diasConDatos) return null;
    return acumulado / diasConDatos * diasDelMes;
  }

  const API = {rellenarPrecios: rellenarPrecios, mix: mix,
               factEstimada: factEstimada, puenteGnc: puenteGnc,
               margen: margen, proyeccion: proyeccion};

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.Calculos = API;
})(typeof self !== 'undefined' ? self : this);
