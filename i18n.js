'use strict';

const I18n = (() => {
  let language = 'es';
  try { if (localStorage.getItem('dex.language') === 'en') language = 'en'; } catch {}
  const catalog = new Map([
    ['Cliente web de Google', 'Google web client'], ['ID del archivo de Sheets', 'Sheets file ID'],
    ['Continuar con Google', 'Continue with Google'], ['Sheets privado', 'Private Sheets'],
    ['Cerrar sesi\u00f3n', 'Sign out'], ['Olvidar conexi\u00f3n', 'Forget connection'],
    ['Lectura remota. Edita salario y restas en la app local.', 'Remote read access. Edit salary and deductions in the local app.'],
    ['No se pudo conectar. Revisa la cuenta de Google y el acceso al archivo.', 'Could not connect. Check your Google account and file access.'],
    ['No se pudo leer Sheets. Revisa la conexi\u00f3n y los permisos de Google.', 'Could not read Sheets. Check your connection and Google permissions.'],
    ['Importaciones alojadas pendientes', 'Hosted imports pending'], ['Edita este dato en la app local', 'Edit this in the local app'],
    ['Resumen publicado', 'Summary published'], ['Fecha de publicaci\u00f3n no disponible', 'Publication date unavailable'],
    ['Resumen de Sheets actualizado', 'Sheets summary refreshed'],
    ['Precio BTC/USD', 'BTC/USD price'], ['Precio pendiente', 'Price pending'], ['Precio no disponible', 'Price unavailable'],
    ['Precio desactualizado', 'Outdated price'], ['Consultado', 'Checked'], ['Posici\u00f3n pendiente de Binance', 'Holdings pending from Binance'],
    ['Actualizaci\u00f3n autom\u00e1tica pendiente', 'Automatic updates pending'], ['Estado no disponible', 'Status unavailable'],
    ['Actualizaci\u00f3n autom\u00e1tica desactivada', 'Automatic updates disabled'], ['Actualizaci\u00f3n con errores', 'Update errors'],
    ['Actualizaci\u00f3n autom\u00e1tica local', 'Local automatic updates'], ['Historial', 'History'], ['Respaldo', 'Backup'], ['En curso', 'Running'], ['Actualizado', 'Updated'],
    ['Resumen', 'Summary'], ['Rendimiento', 'Performance'], ['Cuentas', 'Accounts'], ['Ajustes', 'Settings'],
    ['Ir al contenido', 'Skip to content'], ['DEX, resumen', 'DEX, summary'], ['Navegaci\u00f3n principal', 'Main navigation'],
    ['SOLO LECTURA', 'READ ONLY'], ['Patrimonio', 'Net worth'], ['Tu patrimonio', 'Your net worth'],
    ['Total del patrimonio', 'Total net worth'], ['Moneda', 'Currency'], ['Todo USD', 'All USD'], ['TODO USD', 'ALL USD'],
    ['Tu selecci\u00f3n', 'Your selection'], ['Cuentas en d\u00f3lares', 'USD accounts'], ['Cuentas en colones', 'CRC accounts'],
    ['Incluir en el total', 'Include in total'], ['Incluir en mi patrimonio', 'Include in my net worth'],
    ['Antes de restas', 'Before deductions'], ['Saldo registrado', 'Recorded balance'], ['Dinero excluido', 'Excluded money'],
    ['Distribuci\u00f3n', 'Allocation'], ['Distribuci\u00f3n del patrimonio', 'Net worth allocation'],
    ['Inversiones', 'Investments'], ['Ahorro y cuentas', 'Savings and accounts'], ['Pensiones', 'Pensions'],
    ['Asociaci\u00f3n', 'Association'], ['Asociaci\u00f3n solidarista', 'Employee association'], ['Sin clasificar', 'Unclassified'],
    ['Asociaci\u00f3n \u00b7 ahorro personal', 'Association \u00b7 personal savings'], ['Asociaci\u00f3n \u00b7 aporte patronal', 'Association \u00b7 employer contribution'],
    ['Evoluci\u00f3n', 'History'], ['Evoluci\u00f3n de ganancias', 'Profit history'], ['Periodo del historial', 'History period'],
    ['Todo', 'All'], ['Activo', 'Asset'], ['Acciones y ETF', 'Stocks and ETFs'], ['BTC \u00b7 pendiente', 'BTC \u00b7 pending'],
    ['Evoluci\u00f3n del patrimonio', 'Net worth history'], ['Ver fechas e importes', 'View dates and amounts'],
    ['Ganancia de posiciones abiertas.', 'Unrealized profit.'], ['Importes ocultos.', 'Amounts hidden.'],
    ['Importes ocultos', 'Amounts hidden'], ['Importe oculto', 'Amount hidden'], ['BTC pendiente de conectar.', 'BTC holdings not connected.'],
    ['Historial no disponible.', 'History unavailable.'], ['Sin datos en este periodo.', 'No data for this period.'], ['Sin dato', 'No data'],
    ['Agregar resta al patrimonio', 'Add net worth deduction'], ['Sobre las ganancias', 'About profit'],
    ['Ganancia de las posiciones abiertas', 'Unrealized profit'], ['Posiciones', 'Positions'], ['Posiciones IBKR', 'IBKR positions'],
    ['Ordenar inversiones de mayor a menor', 'Sort investments highest first'], ['Precio: mayor primero', 'Price: highest first'],
    ['Valor: mayor primero', 'Value: highest first'], ['Ganancia: mayor primero', 'Profit: highest first'],
    ['Precio USD', 'Price USD'], ['Valor USD', 'Value USD'], ['Ganancia USD', 'Profit USD'], ['Saldo USD', 'Balance USD'], ['No aplica', 'Not applicable'],
    ['Ganancias pendientes en el informe.', 'Profit unavailable in the report.'],
    ['Buscar cuenta o entidad', 'Search account or institution'], ['Ordenar cuentas', 'Sort accounts'], ['Entidad', 'Institution'],
    ['Corte reciente', 'Latest report'], ['Informe reciente', 'Latest report'], ['Saldo por moneda', 'Balance by currency'],
    ['Filtrar cuentas', 'Filter accounts'], ['Todas', 'All'], ['Aportes', 'Contributions'], ['Acciones y efectivo', 'Stocks and cash'],
    ['Ahorro CRC', 'Savings CRC'], ['Planilla CRC', 'Payroll CRC'], ['Ahorro USD', 'Savings USD'],
    ['Ahorro', 'Savings'], ['Cuenta bancaria', 'Bank account'], ['Pensi\u00f3n', 'Pension'], ['Otra cuenta', 'Other account'],
    ['No hay cuentas con este filtro.', 'No accounts match this filter.'], ['A TU MANERA', 'YOUR PREFERENCES'],
    ['Preferencias', 'Preferences'], ['Idioma', 'Language'], ['Ocultar importes', 'Hide amounts'], ['Mostrar importes', 'Show amounts'],
    ['Privacidad en todas las vistas', 'Privacy across all views'], ['Vista de inicio', 'Default view'], ['Reducir movimiento', 'Reduce motion'],
    ['Salario mensual', 'Monthly salary'], ['Conexiones', 'Connections'], ['Acerca de DEX', 'About DEX'], ['Vista local', 'Local view'],
    ['Demostraci\u00f3n local', 'Local demo'], ['Resumen privado local', 'Private local summary'], ['Validaci\u00f3n pendiente', 'Validation pending'],
    ['Registrado', 'Recorded'], ['Proyecci\u00f3n', 'Projection'], ['Habilitado', 'Enabled'], ['Pendiente', 'Pending'],
    ['Acceso local en esta computadora. Sin sincronizaci\u00f3n alojada ni recuperaci\u00f3n en otro dispositivo todav\u00eda.', 'Local access on this computer. Hosted sync and recovery on another device are not available yet.'],
    ['DETALLE', 'DETAIL'], ['Cerrar detalle', 'Close details'], ['Cerrar', 'Close'],
    ['DEX necesita JavaScript para mostrar tus cuentas.', 'DEX needs JavaScript to display your accounts.'],
    ['Actualizar resumen', 'Refresh summary'], ['Resumen local actualizado', 'Local summary refreshed'], ['Fecha pendiente', 'Date pending'],
    ['Preferencia temporal en este navegador', 'Temporary preference in this browser'],
    ['No se pudo actualizar. Se conserva la vista anterior.', 'Could not refresh. The previous view is preserved.'],
    ['Resumen no disponible. Comprueba el servidor local y vuelve a actualizar.', 'Summary unavailable. Check the local server and refresh again.'],
    ['Sin conexi\u00f3n. No hay actualizaciones disponibles.', 'Offline. Updates are unavailable.'],
    ['Demostraci\u00f3n \u00b7 Datos de ejemplo, no tus saldos.', 'Demo \u00b7 Sample data, not your balances.'],
    ['Sin saldos positivos registrados.', 'No positive balances recorded.'], ['Sin datos disponibles.', 'No data available.'],
    ['Cambio pendiente de actualizar', 'Exchange rate update pending'], ['Cambio vencido', 'Exchange rate expired'],
    ['Tipo de cambio pendiente', 'Exchange rate pending'], ['Cambio pendiente', 'Exchange rate pending'],
    ['Compra ESPP pendiente de confirmar en IBKR.', 'ESPP purchase confirmation pending in IBKR.'],
    ['Los saldos originales se conservan. Las restas personales siguen descont\u00e1ndose del total seleccionado.', 'Original balances are preserved. Personal deductions still apply to the selected total.'],
    ['Incluyendo proyecci\u00f3n de planilla', 'Including projected payroll contributions'], ['Pendiente de conciliaci\u00f3n', 'Reconciliation pending'], ['Excluido', 'Excluded'],
    ['PLANILLA \u00b7 CRC', 'PAYROLL \u00b7 CRC'], ['PLANILLA', 'PAYROLL'], ['Ahorro personal', 'Personal savings'], ['Aporte patronal', 'Employer contribution'],
    ['Por quincena', 'Per payday'], ['Personal \u00b7 5%', 'Personal \u00b7 5%'], ['Patronal \u00b7 5,33%', 'Employer \u00b7 5.33%'],
    ['Proyectado a hoy', 'Projected through today'], ['Personal', 'Personal'], ['Patronal', 'Employer'],
    ['Sin intereses, retiros ni rendimientos estimados. Disponibilidad del aporte patronal por confirmar.', 'No estimated interest, withdrawals or returns. Availability of the employer contribution is unconfirmed.'],
    ['Acumulado estimado del ciclo', 'Estimated cycle savings'], ['Por quincena \u00b7 15%', 'Per payday \u00b7 15%'],
    ['Pr\u00f3xima compra', 'Next purchase'], ['Compras anuales', 'Annual purchases'], ['19 febrero \u00b7 19 agosto', 'February 19 \u00b7 August 19'],
    ['Rebajos los d\u00edas 15 y \u00faltimo de mes. El importe en CRC es una estimaci\u00f3n de planilla, no efectivo confirmado en USD.', 'Contributions on the 15th and last day of each month. The CRC amount is a payroll estimate, not confirmed USD cash.'],
    ['En tr\u00e1nsito a IBKR', 'In transit to IBKR'],
    ['El 19 de febrero y agosto el acumulado vuelve a cero. Las acciones se reflejan con el siguiente informe de IBKR, sin confirmaciones manuales. Hasta entonces el total puede verse temporalmente menor.', 'Savings reset to zero on February 19 and August 19. Shares appear with the next IBKR report, with no manual confirmation. Until then, the total may temporarily look lower.'],
    ['Salario bruto \u00b7 CRC', 'Gross salary \u00b7 CRC'], ['Vigente desde la siguiente quincena. Los aportes anteriores se conservan.', 'Effective next payday. Previous contributions are preserved.'],
    ['Asociaci\u00f3n personal', 'Association personal'], ['Asociaci\u00f3n patronal', 'Association employer'], ['5,33%', '5.33%'], ['Guardar', 'Save'],
    ['El salario cambi\u00f3 en otra vista. Cierra y actualiza.', 'Salary changed in another view. Close and refresh.'],
    ['No se pudo confirmar el cambio. Revisa el importe y actualiza antes de reintentar.', 'Could not confirm the change. Check the amount and refresh before retrying.'],
    ['Salario programado para la siguiente quincena', 'Salary scheduled for next payday'], ['Sin restas en esta moneda.', 'No deductions in this currency.'],
    ['Sin cuenta espec\u00edfica', 'No specific account'], ['PATRIMONIO', 'NET WORTH'], ['Editar resta', 'Edit deduction'], ['Restar del patrimonio', 'Deduct from net worth'],
    ['Nombre', 'Name'], ['Dinero de pap\u00e1', "Dad's money"], ['Importe', 'Amount'], ['Cuenta', 'Account'],
    ['Resta fija al patrimonio. El saldo del banco no cambia.', 'Fixed net worth deduction. The bank balance does not change.'],
    ['Resta activa hasta que la elimines, incluso cuando cambie el saldo del banco.', 'Deduction stays active until deleted, even when the bank balance changes.'],
    ['Eliminar resta', 'Delete deduction'], ['\u00bfEliminar esta resta del patrimonio?', 'Delete this net worth deduction?'], ['Cancelar', 'Cancel'],
    ['Este ajuste cambi\u00f3 en otra vista. Cierra y actualiza antes de editar.', 'This deduction changed in another view. Close and refresh before editing.'],
    ['Revisa nombre, importe positivo y moneda de la cuenta.', 'Check the name, positive amount and account currency.'],
    ['No se pudo confirmar el guardado. Actualiza antes de volver a intentarlo.', 'Could not confirm the save. Refresh before retrying.'],
    ['Resta eliminada', 'Deduction deleted'], ['Resta guardada', 'Deduction saved'], ['RENDIMIENTO', 'PERFORMANCE'],
    ['Valor de tus posiciones abiertas menos lo que costaron, seg\u00fan el \u00faltimo informe de IBKR. Son ganancias o p\u00e9rdidas que a\u00fan no se han realizado vendiendo.', 'Value of your open positions minus their cost, according to the latest IBKR report. These gains or losses have not been realized by selling.'],
    ['Precio', 'Price'], ['Importe por acci\u00f3n', 'Amount per share'], ['Valor', 'Value'], ['Importe total de la posici\u00f3n', 'Total position value'],
    ['Porcentaje', 'Percentage'], ['Ganancia dividida entre costo', 'Profit divided by cost'],
    ['No incluye ventas anteriores ni dividendos. Los precios corresponden a la fecha del informe, no a cotizaciones en vivo. BTC sigue pendiente de datos reales.', 'Excludes previous sales and dividends. Prices are from the report date, not live market prices. BTC holdings are still pending.'],
    ['CASH es el efectivo del informe de IBKR, ya incluido en el total de esa cuenta. No se suma otra vez ni tiene precio por acci\u00f3n o ganancia calculada.', 'CASH is the cash balance in the IBKR report, already included in the account total. It is not added again and has no share price or calculated profit.'],
    ['CUENTA', 'ACCOUNT'], ['Saldo al corte', 'Statement balance'], ['Saldo del informe', 'Report balance'],
    ['Disponible', 'Available'], ['Restringido', 'Restricted'], ['Condicionado', 'Conditional'], ['Disponibilidad mixta', 'Mixed availability'],
    ['Disponibilidad', 'Availability'], ['Por confirmar', 'Unconfirmed'], ['Valoraci\u00f3n', 'Valuation'], ['Estado de cuenta', 'Statement'],
    ['Cotizaci\u00f3n en vivo', 'Live market price'], ['No aplicada', 'Not applied'], ['Composici\u00f3n del saldo', 'Balance breakdown'],
    ['Efectivo', 'Cash'], ['Intereses devengados', 'Accrued interest'], ['Dividendos devengados', 'Accrued dividends'], ['Posici\u00f3n', 'Position'],
    ['Las posiciones ya forman parte del saldo de esta cuenta. No se suman de nuevo.', 'Positions are already included in the account balance. They are not added again.'],
    ['Este es el saldo confirmado a la fecha del estado de cuenta, no un saldo bancario en vivo.', 'This is the confirmed balance as of the statement date, not a live bank balance.'],
    ['CONEXI\u00d3N', 'CONNECTION'], ['Estado', 'Status'], ['Datos registrados', 'Recorded data'], ['Acceso', 'Access'], ['Solo lectura', 'Read only'], ['Cuentas observadas', 'Recorded accounts'],
    ['Los importes conservan la fecha de cada estado de cuenta. Actualizar esta vista no solicita nuevos documentos al proveedor.', 'Amounts retain their statement date. Refreshing this view does not request new documents from the provider.'],
    ['Esta fuente a\u00fan no est\u00e1 incorporada al resumen.', 'This source is not yet included in the summary.'],
    ['Una fuente pendiente no equivale a un saldo de cero.', 'A pending source does not mean a zero balance.'],
    ['Habilitado. Al subir estos archivos a main en GitHub se intentar\u00e1 consultar permisos, Spot y Earn. El resultado o error estar\u00e1 en Actions. Requiere los secretos de Binance; todav\u00eda no hay saldos validados.', 'Enabled. Uploading these files to main on GitHub will attempt to read permissions, Spot and Earn. Results or errors will appear in Actions. Binance secrets are required; balances are not validated yet.'],
    ['DATOS', 'DATA'], ['Datos y tipo de cambio', 'Data and exchange rate'],
    ['Los saldos son los de tus \u00faltimos informes, no los de este instante. Cada cuenta conserva su fecha; los movimientos posteriores se ver\u00e1n al recibir un informe nuevo.', 'Balances come from your latest reports, not this instant. Each account retains its date; later transactions appear when a new report arrives.'],
    ['Conversi\u00f3n a d\u00f3lares', 'USD conversion'],
    ['Total estimado: convierte colones con una referencia diaria. No es el cambio de compra o venta de tu banco. Incluye las proyecciones de ESPP y asociaci\u00f3n que tengas seleccionadas.', 'Estimated total: converts colones using a daily reference rate, not your bank\u2019s buy or sell rate. Includes your selected ESPP and association projections.'],
    ['Un d\u00f3lar', 'One dollar'], ['Referencia del', 'Reference date'], ['Pendiente de incluir', 'Not yet included'], ['Deudas', 'Liabilities'],
    ['El cambio del patrimonio puede incluir aportes, restas y variaciones de moneda; no equivale a rentabilidad de inversiones.', 'Net worth changes may include contributions, deductions and currency movements; they are not investment returns.'],
    ['Tu parte', 'Your share'], ['Saldo menos restas', 'Balance after deductions']
  ]);
  const patterns = [
    [/^(.+) \u00b7 (Inversiones|Ahorro|Cuenta bancaria|ROP|FCL) \u00b7 (USD|CRC) \((\d+)\)$/, (name, product, unit, count) => `${name} \u00b7 ${catalog.get(product) || product} \u00b7 ${unit} (${count})`],
    [/^(Cuenta bancaria|Inversiones) (USD|CRC)$/, (product, unit) => `${catalog.get(product)} ${unit}`],
    [/^(.+) excluido\(s\)$/, count => `${count} excluded`], [/^Informe del (.+)$/, date => `Report dated ${date}`],
    [/^Historial desde el (.+)\.$/, date => `History since ${date}.`], [/^Cambio (.*)$/, amount => `Change ${amount}`],
    [/^Compra (.+)$/, date => `Purchase ${date}`], [/^Base (.+) \u00b7 proyectado a hoy$/, date => `Baseline ${date} \u00b7 projected through today`],
    [/^Saldo registrado al (.+)$/, date => `Balance recorded on ${date}`], [/^Cambio programado: (.+)$/, date => `Scheduled change: ${date}`],
    [/^(.+) pendiente de incluir\.$/, name => `${name} not yet included.`], [/^(.*) unidades$/, quantity => `${quantity} units`],
    [/^Abrir (.+)$/, name => `Open ${name}`], [/^(Resumen|Rendimiento|Cuentas|Ajustes) \u00b7 DEX$/, name => `${catalog.get(name)} \u00b7 DEX`],
    [/^Distribuci\u00f3n de saldos positivos en (.+), (\d+) categor\u00edas$/, (unit, count) => `Positive balance allocation in ${unit}, ${count} categories`],
    [/^(P\/L no realizado|Patrimonio) en (.+)\. (\d+) observaciones\. Datos en Observaciones\.$/, (metric, unit, count) => `${metric === 'Patrimonio' ? 'Net worth' : 'Unrealized P/L'} in ${unit}. ${count} observations. Data in observations.`]
  ];
  function translate(text) {
    if (language === 'es') return text;
    const trimmed = text.trim();
    let result = catalog.get(trimmed);
    if (result === undefined) for (const [pattern, format] of patterns) {
      const match = pattern.exec(trimmed);
      if (match) { result = format(...match.slice(1)); break; }
    }
    return result === undefined ? text : text.replace(trimmed, result);
  }
  const originals = new WeakMap();
  function localize(node, attribute) {
    const current = attribute ? node.getAttribute(attribute) : node.nodeValue;
    const records = originals.get(node) || {};
    const key = attribute || 'text';
    const record = records[key];
    const source = record && current === record.translated ? record.source : current;
    const translated = translate(source);
    records[key] = {source, translated};
    originals.set(node, records);
    if (current !== translated) {
      if (attribute) node.setAttribute(attribute, translated); else node.nodeValue = translated;
    }
  }
  function apply(root = document.documentElement) {
    if (root.nodeType === Node.TEXT_NODE) {
      if (!root.parentElement?.closest('script,style,textarea,[data-no-translate]')) localize(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE || root.closest('script,style,textarea,[data-no-translate]')) return;
    for (const attribute of ['title', 'aria-label', 'placeholder']) if (root.hasAttribute(attribute)) localize(root, attribute);
    root.childNodes.forEach(child => apply(child));
  }
  const observer = new MutationObserver(records => {
    observer.disconnect();
    records.forEach(record => {
      if (record.type === 'childList') record.addedNodes.forEach(node => apply(node));
      else apply(record.target);
    });
    observe();
  });
  function observe() { observer.observe(document.documentElement, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['title', 'aria-label', 'placeholder']}); }
  function refresh() { observer.disconnect(); document.documentElement.lang = language; apply(); observe(); }
  function setLanguage(value) {
    if (!['es', 'en'].includes(value)) return;
    language = value;
    try { localStorage.setItem('dex.language', value); } catch {}
    refresh();
    document.dispatchEvent(new Event('languagechange'));
  }
  refresh();
  return {translate, setLanguage, refresh, get language() { return language; }, get locale() { return language === 'en' ? 'en-US' : 'es-CR'; }};
})();