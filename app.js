'use strict';

const VERSION = '0.7.0';
const sources = {
  ibkr: {name: 'Interactive Brokers', short: 'IB', icon: 'chart-no-axes-combined', category: 'investments'},
  multimoney: {name: 'MultiMoney', short: 'M', icon: 'sprout', category: 'cash'},
  bac_bank: {name: 'BAC', short: 'BAC', icon: 'landmark', category: 'cash'},
  bac_pension: {name: 'BAC Pensiones', short: 'BAC', icon: 'landmark', category: 'pension'},
  binance: {name: 'Binance', icon: 'bitcoin', category: 'investments'},
  espp: {name: 'ESPP', icon: 'briefcase-business', category: 'espp'},
  asociacion: {name: 'Asociaci\u00f3n solidarista', icon: 'building-2', category: 'association'}
};
const categories = {investments: 'Inversiones', cash: 'Ahorro y cuentas', pension: 'Pensiones', association: 'Asociaci\u00f3n', espp: 'ESPP', other: 'Sin clasificar'};
const colors = {investments: '#293e3a', cash: '#6aada3', pension: '#718eb1', association: '#b39458', espp: '#73977a', other: '#b6bec7'};
const availability = {available: 'Disponible', restricted: 'Restringido', conditional: 'Condicionado', mixed: 'Disponibilidad mixta'};
const productNames = {brokerage: 'Inversiones', checking: 'Cuenta bancaria', savings: 'Ahorro', rop: 'ROP', fcl: 'FCL', bank: 'Cuenta bancaria'};
const select = selector => document.querySelector(selector);
const all = selector => [...document.querySelectorAll(selector)];
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
const icon = name => `<i data-lucide="${escapeHTML(name)}"></i>`;
function icons() { if (globalThis.lucide) lucide.createIcons({attrs: {'aria-hidden': 'true'}}); }
function preference(key, fallback) { try { return localStorage.getItem('dex.' + key) ?? fallback; } catch { return fallback; } }
function savePreference(key, value) { try { localStorage.setItem('dex.' + key, String(value)); } catch { showToast('Preferencia temporal en este navegador'); } }
let currency = ['USD', 'CRC', 'TOTAL'].includes(preference('currency', 'TOTAL')) ? preference('currency', 'TOTAL') : 'TOTAL';
let hiddenAmounts = preference('privacy', 'true') === 'true';
let filter = 'all';
let snapshot = null;
let currentDetail = null;
let toastTimer;
let pending = false;
let failedRefresh = false;
let currentView = 'resumen';
let savingAdjustment = false;
let adjustmentRevision = null;
let savingSalary = false;
const selectionNames = {...Object.fromEntries(Object.entries(sources).map(([key, value]) => [key, value.name])),
  'association-personal': 'Asociaci\u00f3n \u00b7 ahorro personal', 'association-employer': 'Asociaci\u00f3n \u00b7 aporte patronal'};
let excludedSources = new Set();
try { const saved = JSON.parse(preference('excluded-sources', '[]')); if (Array.isArray(saved)) excludedSources = new Set(saved.filter(key => Object.hasOwn(selectionNames, key))); } catch {}
let historyPeriod = 'all';
let historyMetric = 'worth';
let btcQuote = null;
let marketPending = false;
let marketAttempt = 0;
let automationStatus = null;

function renderMarket() {
  const age = btcQuote?.received_at ? Date.now() / 1000 - btcQuote.received_at : Infinity;
  const valid = btcQuote?.price != null && age >= 0 && age <= 900;
  select('#btc-price').innerHTML = valid ? money(btcQuote.price, 'USD') : '\u2014';
  select('#btc-price-note').textContent = valid ? `${btcQuote.state === 'stale' || age > 120 ? I18n.translate('Precio desactualizado') : I18n.translate('Consultado')} \u00b7 ${new Intl.DateTimeFormat(I18n.locale, {hour: '2-digit', minute: '2-digit'}).format(new Date(btcQuote.received_at * 1000))}` : I18n.translate('Precio no disponible');
}
async function loadMarket() {
  renderMarket();
  if (Portal.enabled && !Portal.connected) return;
  if (document.hidden || currentView !== 'rendimiento' || marketPending || Date.now() - marketAttempt < 60000) return;
  marketPending = true; marketAttempt = Date.now();
  try {
    const response = await fetch(Portal.enabled ? 'https://api.coinbase.com/v2/prices/BTC-USD/spot' : '/api/market/btc', {headers: Portal.enabled ? {} : {'X-DEX-Client': 'pwa'}, credentials: Portal.enabled ? 'omit' : 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000)});
    if (!response.ok) throw new Error('Unavailable');
    const payload = await response.json();
    const result = Portal.enabled ? {state: 'current', base: payload.data?.base, currency: payload.data?.currency, price: payload.data?.amount, received_at: Date.now() / 1000} : payload;
    if (result.price != null && (result.base !== 'BTC' || result.currency !== 'USD' || decimal(result.price) <= 0n || !Number.isFinite(result.received_at))) throw new Error('Invalid price');
    btcQuote = result;
  } catch { if (btcQuote) btcQuote = {...btcQuote, state: 'stale'}; }
  finally { marketPending = false; renderMarket(); }
}
function renderAutomation() {
  if (Portal.enabled) {
    select('#automation-state').textContent = 'Importaciones alojadas pendientes';
    select('#automation-jobs').replaceChildren();
    return;
  }
  const jobs = automationStatus?.jobs || {};
  select('#automation-state').textContent = !automationStatus ? 'Estado no disponible' : !automationStatus.enabled ? 'Actualizaci\u00f3n autom\u00e1tica desactivada' : Object.values(jobs).some(job => job.state === 'failed') ? 'Actualizaci\u00f3n con errores' : 'Actualizaci\u00f3n autom\u00e1tica local';
  const names = {bank: 'Gmail', ibkr: 'IBKR', summary: 'Resumen', history: 'Historial', backup: 'Respaldo', sheets: 'Sheets'};
  const states = {running: 'En curso', succeeded: 'Actualizado', failed: 'Error', pending: 'Pendiente'};
  select('#automation-jobs').innerHTML = Object.entries(jobs).map(([name, job]) => line(names[name] || name, `${escapeHTML(I18n.translate(states[job.state] || 'Pendiente'))}${job.last_success ? `<small class="subtle"> \u00b7 ${escapeHTML(new Intl.DateTimeFormat(I18n.locale, {dateStyle: 'short', timeStyle: 'short'}).format(new Date(job.last_success * 1000)))}</small>` : ''}`)).join('');
}
async function loadAutomation() {
  if (Portal.enabled) { renderAutomation(); return; }
  if (document.hidden || currentView !== 'ajustes') return;
  try {
    const response = await fetch('/api/automation', {headers: {'X-DEX-Client': 'pwa'}, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error('Unavailable');
    automationStatus = await response.json();
  } catch { automationStatus = null; }
  renderAutomation();
}

function positionProfit(accounts) {
  const positions = accounts.filter(account => account.source === 'ibkr').flatMap(account => account.positions || []);
  return positions.length && positions.every(position => position.currency === 'USD' && position.unrealized_pnl != null)
    ? decimalString(positions.reduce((sum, position) => sum + decimal(position.unrealized_pnl), 0n)) : null;
}
function renderHistory() {
  const history = snapshot.history || {state: 'not_recording', points: []};
  const lastDate = history.points.at(-1)?.date;
  const cutoff = lastDate ? Date.parse(lastDate + 'T12:00:00Z') - Number(historyPeriod) * 86400000 : 0;
  const points = history.points.filter(point => historyPeriod === 'all' || Date.parse(point.date + 'T12:00:00Z') >= cutoff).map(point => ({date: point.date,
    value: historyMetric === 'btc' ? null : historyMetric === 'stocks' ? point.stock_unrealized_usd ?? null : currency === 'TOTAL' ? selectedTotal(point.total_usd).net : point.adjusted_totals[currency] ?? null}));
  const known = points.filter(point => point.value != null);
  const denomination = historyMetric === 'stocks' || currency === 'TOTAL' ? 'USD' : currency;
  const chart = select('#history-chart');
  chart.hidden = hiddenAmounts || !known.length;
  select('#history-observations').hidden = hiddenAmounts || !known.length;
  select('#history-summary').innerHTML = known.length ? money(known.at(-1).value, denomination) : '\u2014';
  const delta = known.length > 1 ? decimalString(decimal(known.at(-1).value) - decimal(known[0].value)) : null;
  const metricNote = historyMetric === 'stocks' ? I18n.translate('Ganancia de posiciones abiertas.') : '';
  select('#history-note').innerHTML = hiddenAmounts ? 'Importes ocultos.' : historyMetric === 'btc' ? 'BTC pendiente de conectar.' : history.state === 'unavailable' ? 'Historial no disponible.' : !known.length ? 'Sin datos en este periodo.' : `${delta != null ? `${I18n.language === 'en' ? 'Change' : 'Cambio'} ${money(delta, denomination)}` : I18n.translate(`Historial desde el ${escapeHTML(dateLabel(known[0].date))}.`)} ${metricNote}`;
  select('#history-summary').hidden = historyMetric === 'worth';
  select('#history-rows').innerHTML = hiddenAmounts ? '' : points.slice().reverse().map(point => line(dateLabel(point.date, true), point.value == null ? 'Sin dato' : money(point.value, denomination))).join('');
  chart.setAttribute('aria-label', hiddenAmounts ? 'Importes ocultos' : `${historyMetric === 'stocks' ? 'P/L no realizado' : 'Patrimonio'} en ${denomination}. ${known.length} observaciones. Datos en Observaciones.`);
  const context = chart.getContext('2d');
  context.clearRect(0, 0, chart.width, chart.height);
  if (chart.hidden) return;
  const width = Math.max(240, chart.clientWidth);
  const height = 210;
  const scale = Math.min(devicePixelRatio || 1, 3);
  chart.width = Math.round(width * scale); chart.height = Math.round(height * scale);
  context.scale(scale, scale);
  const amounts = known.map(point => decimal(point.value));
  const minimum = amounts.reduce((first, second) => first < second ? first : second);
  const maximum = amounts.reduce((first, second) => first > second ? first : second);
  const range = maximum - minimum;
  const start = Date.parse(points[0].date + 'T12:00:00Z');
  const end = Date.parse(points.at(-1).date + 'T12:00:00Z');
  const horizontal = point => end === start ? width / 2 : 14 + (Date.parse(point.date + 'T12:00:00Z') - start) / (end - start) * (width - 28);
  const vertical = point => range === 0n ? 104 : 158 - Number((decimal(point.value) - minimum) * 12000n / range) / 100;
  context.font = `11px ${getComputedStyle(document.body).fontFamily}`;
  context.strokeStyle = '#dfe5e5'; context.lineWidth = 1;
  for (const level of [38, 98, 158]) { context.beginPath(); context.moveTo(0, level); context.lineTo(width, level); context.stroke(); }
  context.fillStyle = '#59696b'; context.textAlign = 'left';
  context.fillText(money(decimalString(maximum), denomination), 0, 17);
  context.fillText(dateLabel(points[0].date), 0, 198);
  context.textAlign = 'right'; context.fillText(dateLabel(points.at(-1).date), width, 198);
  context.strokeStyle = '#267d71'; context.lineWidth = 2.5;
  let previous = null;
  points.forEach(point => {
    if (point.value == null) { previous = null; return; }
    const position = {horizontal: horizontal(point), vertical: vertical(point), date: Date.parse(point.date + 'T12:00:00Z')};
    if (previous && position.date - previous.date <= 86400000) {
      context.beginPath(); context.moveTo(previous.horizontal, previous.vertical); context.lineTo(position.horizontal, position.vertical); context.stroke();
    }
    context.fillStyle = '#267d71'; context.beginPath(); context.arc(position.horizontal, position.vertical, 3.5, 0, Math.PI * 2); context.fill();
    previous = position;
  });
}
function renderPerformance() {
  const accounts = snapshot.accounts.filter(account => account.source === 'ibkr');
  const positions = accounts.flatMap(account => (account.positions || []).map(position => ({...position, date: position.as_of || account.as_of})));
  accounts.forEach(account => positions.push({symbol: 'CASH', cash: true, currency: account.currency,
    market_value: account.components?.cash ?? null, date: account.as_of}));
  const sort = select('#performance-sort').value;
  positions.sort((first, second) => {
    if (first[sort] == null) return second[sort] == null ? String(first.symbol).localeCompare(String(second.symbol)) : 1;
    if (second[sort] == null) return -1;
    const difference = decimal(second[sort]) - decimal(first[sort]);
    return difference > 0n ? 1 : difference < 0n ? -1 : String(first.symbol).localeCompare(String(second.symbol));
  });
  const valueField = sort === 'mark_price' ? 'mark_price' : 'market_value';
  select('#performance-column').textContent = valueField === 'mark_price' ? 'Precio USD' : 'Valor USD';
  const known = positions.filter(position => position.currency === 'USD' && position.unrealized_pnl != null);
  const total = positionProfit(accounts);
  select('#performance-total').innerHTML = total == null ? '\u2014' : money(total, 'USD');
  select('#performance-total').className = 'history-summary' + (!hiddenAmounts && total != null ? decimal(total) < 0n ? ' loss' : ' gain' : '');
  select('#performance-list').innerHTML = positions.map(position => {
    const valid = position.currency === 'USD' && position.unrealized_pnl != null;
    const amount = valid ? decimal(position.unrealized_pnl) : 0n;
    const basis = position.cost_basis != null ? decimal(position.cost_basis) : 0n;
    const percent = valid && basis > 0n && !hiddenAmounts ? `${(Number(amount * 10000n / basis) / 100).toFixed(2)}%` : '';
    const value = position.cash ? position.market_value : position[valueField];
    return `<div class="pnl-row"${position.cash ? ' data-cash="true"' : ''}><strong>${escapeHTML(position.symbol)}</strong><span>${value == null ? '\u2014' : money(value, position.currency || 'USD')}${position.cash ? `<small>Saldo ${escapeHTML(position.currency)}</small>` : ''}</span><span class="${!hiddenAmounts && valid ? amount < 0n ? 'loss' : 'gain' : ''}">${valid ? money(position.unrealized_pnl, 'USD') : '\u2014'}<small>${position.cash ? 'No aplica' : percent}</small></span></div>`;
  }).join('');
  const dates = [...new Set(accounts.map(account => account.as_of))].sort();
  all('#performance-list strong').forEach(node => node.setAttribute('data-no-translate', ''));
  select('#performance-note').textContent = known.length ? `Informe del ${dates.map(date => dateLabel(date, true)).join(' / ')}` : 'Ganancias pendientes en el informe.';
}

function totalParts(total) {
  return total.items.flatMap(item => item.parts?.length ? item.parts.map(part => ({...item, ...part, id: part.key, parts: undefined})) : [{...item, key: item.source}]);
}
function selectedTotal(total = snapshot.total_usd) {
  const parts = totalParts(total);
  const items = parts.filter(item => !excludedSources.has(item.key));
  const valid = ['current', 'stale'].includes(total.fx?.state) && !items.some(item => item.usd_value == null) && !['unsupported_currency', 'fx_unavailable'].includes(total.state);
  const sum = rows => decimalString(rows.reduce((amount, item) => amount + decimal(item.usd_value), 0n));
  const gross = valid ? sum(items) : null;
  return {...total, items, gross, net: valid ? decimalString(decimal(gross) - decimal(total.deductions || '0')) : null,
    available_before_deductions: valid ? sum(items.filter(item => item.availability === 'available')) : null,
    excludedCount: new Set(parts.filter(item => excludedSources.has(item.key)).map(item => item.key)).size};
}
function renderComposition() {
  select('#detail-eyebrow').textContent = 'TODO USD';
  const keys = [...new Set(totalParts(snapshot.total_usd).map(item => item.key))];
  select('#detail-content').innerHTML = `<h2 id="detail-title">Incluir en mi patrimonio</h2><div>${keys.map(key => `<label class="setting-row"><span class="setting-label">${escapeHTML(selectionNames[key] || key)}</span><input type="checkbox" class="switch" role="switch" data-include="${escapeHTML(key)}" ${excludedSources.has(key) ? '' : 'checked'}></label>`).join('')}</div><p class="detail-callout">Los saldos originales se conservan. Las restas personales siguen descont\u00e1ndose del total seleccionado.</p>`;
  all('[data-include]').forEach(input => input.addEventListener('change', () => {
    if (input.checked) excludedSources.delete(input.dataset.include); else excludedSources.add(input.dataset.include);
    savePreference('excluded-sources', JSON.stringify([...excludedSources]));
    renderSummary(); renderPayroll(); renderHistory(); icons();
  }));
}

function decimal(value) {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match || match[2].length > 40 || (match[3] || '').length > 20) throw new Error('Invalid amount');
  const units = BigInt(match[2]) * 10n ** 20n + BigInt((match[3] || '').padEnd(20, '0'));
  return match[1] ? -units : units;
}
function decimalString(units) {
  const sign = units < 0n ? '-' : '';
  const absolute = units < 0n ? -units : units;
  return `${sign}${absolute / 10n ** 20n}.${String(absolute % 10n ** 20n).padStart(20, '0')}`;
}
function money(value, denomination = currency, split = false) {
  if (hiddenAmounts) return '<span class="masked" aria-label="Importe oculto">&bull;&bull;&bull;&bull;&bull;&bull;</span>';
  const units = decimal(value);
  const absolute = units < 0n ? -units : units;
  const cents = (absolute + 5n * 10n ** 17n) / 10n ** 18n;
  const whole = new Intl.NumberFormat('en-US').format(cents / 100n);
  const fraction = String(cents % 100n).padStart(2, '0');
  return `${units < 0n ? '\u2212' : ''}${denomination === 'CRC' ? '\u20a1' : '$'}${whole}${split ? '<span class="money-frac">' : ''}.${fraction}${split ? '</span>' : ''}`;
}
function dateLabel(value, full = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return 'Fecha pendiente';
  return new Intl.DateTimeFormat(I18n.locale, {day: 'numeric', month: full ? 'long' : 'short', ...(full ? {year: 'numeric'} : {}), timeZone: 'UTC'}).format(new Date(value + 'T12:00:00Z'));
}
function product(account) {
  const raw = String(account.product || '').toLowerCase();
  if (raw.includes('rop')) return 'ROP';
  if (raw.includes('fcl')) return 'FCL';
  return productNames[raw] || (account.source === 'bac_pension' ? 'Pensi\u00f3n' : account.source === 'multimoney' ? 'Ahorro' : account.source === 'ibkr' ? 'Inversiones' : 'Cuenta bancaria');
}
function accountTitle(account) {
  if (account.display_name) return I18n.translate(account.display_name);
  if (account.source === 'bac_pension') return product(account);
  if (account.source === 'multimoney') return I18n.translate(`Ahorro ${account.currency}`);
  if (account.source === 'ibkr') return 'Interactive Brokers';
  return `${product(account)} ${account.currency}`;
}
function entity(source) { return sources[source] || {name: 'Otra cuenta', icon: 'wallet', category: 'other'}; }
function entityIcon(source) { const data = entity(source); return `<span class="entity-icon ${escapeHTML(source)}">${data.short ? escapeHTML(data.short) : icon(data.icon)}</span>`; }
function accountRow(account) {
  return `<button class="account-row" data-account="${escapeHTML(account.id)}" aria-label="Abrir ${escapeHTML(entity(account.source).name)} ${escapeHTML(accountTitle(account))}">
    ${entityIcon(account.source)}<span class="account-info"><span class="account-name">${escapeHTML(accountTitle(account))}</span><span class="account-sub">${escapeHTML(account.source === 'ibkr' ? 'Acciones y efectivo' : entity(account.source).name)}</span></span>
    <span class="account-amount sensitive">${money(account.balance, account.currency)}</span>${icon('chevron-right').replace('<i ', '<i class="account-chevron" ')}
  </button>`;
}
function showToast(message) {
  clearTimeout(toastTimer);
  select('#toast').textContent = message;
  select('#toast').hidden = false;
  toastTimer = setTimeout(() => { select('#toast').hidden = true; }, 3200);
}
function setNotice() {
  const notice = select('#banner');
  const offline = !navigator.onLine;
  notice.classList.toggle('error', failedRefresh);
  notice.hidden = !snapshot?.demo && !failedRefresh && !offline;
  notice.textContent = failedRefresh ? (snapshot ? 'No se pudo actualizar. Se conserva la vista anterior.' : 'Resumen no disponible. Comprueba el servidor local y vuelve a actualizar.') : offline ? 'Sin conexi\u00f3n. No hay actualizaciones disponibles.' : 'Demostraci\u00f3n \u00b7 Datos de ejemplo, no tus saldos.';
  if (Portal.enabled && failedRefresh) notice.textContent = 'No se pudo actualizar el resumen. Se conserva la vista anterior si est\u00e1 disponible.';
  if (Portal.enabled && Portal.persistent && Portal.cached && !failedRefresh) {
    notice.hidden = false;
    notice.textContent = '\u00daltima copia guardada. No se pudo comprobar una publicaci\u00f3n m\u00e1s reciente.';
  }
}
function renderDistribution(accounts) {
  const grouped = {};
  accounts.forEach(account => {
    const amount = decimal(account.balance);
    if (amount <= 0n) return;
    const category = entity(account.source).category;
    grouped[category] = (grouped[category] || 0n) + amount;
  });
  const entries = Object.entries(grouped).sort((first, second) => first[1] > second[1] ? -1 : first[1] < second[1] ? 1 : first[0].localeCompare(second[0]));
  const total = entries.reduce((sum, [, value]) => sum + value, 0n);
  let cursor = 0;
  const stops = [];
  entries.forEach(([category, value], index) => {
    const end = index === entries.length - 1 ? 100 : cursor + Number(value * 10000n / total) / 100;
    stops.push(`${colors[category]} ${cursor}% ${end}%`);
    cursor = end;
  });
  select('.donut').style.background = entries.length ? `conic-gradient(from -90deg, ${stops.join(',')})` : '#e5e8eb';
  select('#distribution-currency').textContent = currency === 'TOTAL' ? 'USD' : currency;
  select('#allocation-chart').setAttribute('aria-label', `Distribuci\u00f3n de saldos positivos en ${currency === 'TOTAL' ? 'USD' : currency}, ${entries.length} categor\u00edas`);
  select('#allocation-legend').innerHTML = entries.length ? entries.map(([category, value]) => `<div class="legend-row"><span class="legend-dot ${category}"></span><span>${categories[category]}</span><strong>${hiddenAmounts ? '&bull;&bull;' : `${(Number(value * 1000n / total) / 10).toFixed(1)}%`}</strong></div>`).join('') : '<p class="subtle">Sin saldos positivos registrados.</p>';
  all('#allocation-legend .legend-dot').forEach((dot, index) => { dot.style.background = colors[entries[index][0]]; });
}
function renderSummary() {
  const combined = currency === 'TOTAL';
  const combinedTotal = selectedTotal();
  const denomination = combined ? 'USD' : currency;
  const accounts = snapshot.accounts.filter(account => combined ? !excludedSources.has(account.source) : account.currency === currency);
  const total = combined ? combinedTotal.net : snapshot.adjusted_totals[currency];
  const deduction = (combined ? combinedTotal.deductions : snapshot.deductions_by_currency[currency]) || '0';
  const gross = combined ? combinedTotal.gross : snapshot.totals[currency];
  select('#balance-label').textContent = combined ? (combinedTotal.excludedCount ? 'Tu selecci\u00f3n' : 'Total') : currency === 'USD' ? 'Cuentas en d\u00f3lares' : 'Cuentas en colones';
  select('#composition-open').hidden = !combined;
  select('#composition-label').textContent = combinedTotal.excludedCount ? `${combinedTotal.excludedCount} excluido(s)` : 'Incluir en el total';
  select('#deduction-breakdown').hidden = decimal(deduction) === 0n;
  select('#deduction-breakdown').innerHTML = line(combined ? 'Antes de restas' : 'Saldo registrado', gross == null ? '\u2014' : money(gross, denomination)) + line('Dinero excluido', '\u2212' + money(deduction, denomination));
  select('#balance').innerHTML = total == null ? '\u2014' : money(total, denomination, true);
  renderFx(combined);
  select('#balance').classList.toggle('compact', !hiddenAmounts && select('#balance').textContent.length > 13);
  renderDistribution(combined ? combinedTotal.items.filter(item => item.usd_value != null).map(item => ({...item, balance: item.usd_value})) : accounts);
}
function renderFx(combined) {
  select('#fx-info').hidden = !combined;
  if (!combined) return;
  const total = selectedTotal();
  const fx = total.fx;
  const missing = total.missing_sources.map(source => entity(source).name).join(', ');
  let status = '';
  if (fx.crc_per_usd && fx.updated_at) {
    status = '';
    if (fx.state === 'stale') status = 'Cambio pendiente de actualizar';
    if (fx.state === 'expired') status = 'Cambio vencido';
  } else status = 'Tipo de cambio pendiente';
  select('#fx-info').innerHTML = `${status ? `<p>${status}</p>` : ''}${total.net == null && total.state === 'espp_reconciliation_pending' ? '<p>Compra ESPP pendiente de confirmar en IBKR.</p>' : ''}${missing ? `<p>${escapeHTML(missing)} pendiente de incluir.</p>` : ''}<a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">Rates By Exchange Rate API</a>`;
}
function renderAccounts() {
  if (!snapshot) return;
  const query = select('#search').value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const filtered = snapshot.accounts.filter(account => {
    const text = `${entity(account.source).name} ${accountTitle(account)} ${account.currency}`.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return text.includes(query) && (filter === 'all' || filter === account.currency || (filter === 'investments' && entity(account.source).category === 'investments'));
  });
  const sort = select('#sort').value;
  filtered.sort((first, second) => {
    if (sort === 'date') return second.as_of.localeCompare(first.as_of);
    if (sort === 'balance') {
      if (first.currency !== second.currency) return first.currency.localeCompare(second.currency);
      const diff = decimal(second.balance) - decimal(first.balance);
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    }
    return entity(first.source).name.localeCompare(entity(second.source).name);
  });
  select('#all-accounts').innerHTML = filtered.length ? filtered.map(accountRow).join('') : `<div class="empty">${icon('search')}No hay cuentas con este filtro.</div>`;
}
function renderSettings() {
  if (!snapshot) return;
  select('#connections-list').innerHTML = snapshot.coverage.map(source => `<button class="setting-row" data-connection="${escapeHTML(source.source)}">${entityIcon(source.source)}<span class="setting-label">${escapeHTML(entity(source.source).name)}${source.enabled ? '<span>Validaci\u00f3n pendiente</span>' : ''}</span><span class="connection-state ${source.state === 'observed' ? 'observed' : ''}">${icon(source.state === 'observed' ? 'circle-check' : 'clock-3')}${source.state === 'observed' ? 'Registrado' : source.state === 'projected' ? 'Proyecci\u00f3n' : source.enabled ? 'Habilitado' : 'Pendiente'}</span>${icon('chevron-right').replace('<i ', '<i class="account-chevron" ')}</button>`).join('');
  select('#about-mode').textContent = snapshot.demo ? 'Demostraci\u00f3n local' : 'Resumen privado local';
}
function renderPrivacy() {
  select('#privacy').setAttribute('aria-pressed', String(hiddenAmounts));
  const label = hiddenAmounts ? 'Mostrar importes' : 'Ocultar importes';
  select('#privacy').setAttribute('aria-label', label);
  select('#privacy').title = label;
  select('#privacy').innerHTML = icon(hiddenAmounts ? 'eye-off' : 'eye');
  select('#privacy-setting').checked = hiddenAmounts;
}
function render() {
  if (!snapshot) return;
  renderSummary(); renderAccounts(); renderSettings(); renderPrivacy(); renderAdjustments(); renderPayroll(); renderHistory(); renderPerformance(); renderMarket(); renderAutomation(); setNotice();
  if (currentDetail && !['adjustment', 'salary'].includes(currentDetail.kind) && select('#detail').open) renderDetail(currentDetail);
  icons();
  if (Portal.enabled) {
    all('[data-new-adjustment], #salary-setting').forEach(button => { button.disabled = !snapshot.remote_editing?.enabled; });
    select('#about-mode').textContent = 'Sheets privado';
    select('.settings-footnote').textContent = 'Datos privados en Google Sheets. Importaciones de solo lectura.';
    const date = snapshot.published_at;
    select('#portal-date').textContent = date ? I18n.translate('Resumen publicado') + ': ' + new Intl.DateTimeFormat(I18n.locale, {dateStyle: 'long', timeStyle: 'short'}).format(new Date(date)) : I18n.translate('Fecha de publicaci\u00f3n no disponible');
    renderRemoteEdits();
  }
}
function renderRemoteEdits() {
  if (!Portal.enabled || !snapshot) return;
  const status = snapshot.remote_editing;
  select('#portal-edit-consent').hidden = !status?.enabled || Portal.canEdit;
  select('#google-edit').disabled = Portal.editConnecting;
  select('#portal-edit-permission').hidden = !Portal.canEdit;
  select('#portal-edit-permission').textContent = I18n.translate('Edici\u00f3n autorizada en esta sesi\u00f3n');
  const container = select('#portal-edit-status');
  container.hidden = !status?.enabled;
  if (!status?.enabled) return;
  if (Portal.persistent && !Portal.canEdit) { container.hidden = true; return; }
  if (!status.queue_available) { container.textContent = I18n.translate('Estado de cambios no disponible. Actualiza antes de editar.'); return; }
  const requests = status.requests || [];
  const pendingRequests = requests.filter(item => item.state === 'pending');
  const recent = requests.filter(item => item.state !== 'pending').slice(-3);
  const labels = {pending: 'Pendiente de la pr\u00f3xima ejecuci\u00f3n diaria', applied: 'Aplicado', conflict: 'No aplicado: cambi\u00f3 en otra sesi\u00f3n. Revisa y vuelve a editar.', invalid: 'No aplicado: datos no v\u00e1lidos. Revisa y vuelve a editar.'};
  container.innerHTML = [...pendingRequests, ...recent].map(item => `<p class="subtle">${escapeHTML(I18n.translate(item.kind === 'salary' ? 'Salario mensual' : 'Resta'))}: ${escapeHTML(I18n.translate(labels[item.state] || labels.invalid))}</p>`).join('');
  container.hidden = !requests.length;
}
async function queueRemoteChange(kind, change) {
  const result = await Portal.submit(kind, change);
  const status = snapshot.remote_editing;
  status.requests ||= [];
  if (!status.requests.some(item => item.id === result.id)) status.requests.push({id: result.id, kind, state: 'pending'});
  select('#detail').close(); currentDetail = null;
  render();
  showToast('Solicitud enviada. Pendiente de aplicar.');
  await load();
}
function line(label, content) { return `<div class="detail-line"><span>${escapeHTML(label)}</span><span>${content}</span></div>`; }
function renderPayroll() {
  const payroll = snapshot.payroll;
  select('#payroll-section').hidden = !payroll?.configured;
  select('#salary-setting').hidden = !payroll?.configured;
  select('#estimated-net-worth').hidden = !payroll?.configured || currency !== 'CRC';
  if (!payroll?.configured) return;
  select('#estimated-net-worth').innerHTML = `<span class="small-label">Incluyendo proyecci\u00f3n de planilla</span><strong class="sensitive">${snapshot.estimated_total_crc == null ? 'Pendiente de conciliaci\u00f3n' : money(snapshot.estimated_total_crc, 'CRC')}</strong>`;
  select('#salary-value').innerHTML = money(payroll.monthly_salary, 'CRC');
  const value = (id, crc) => {
    if (currency !== 'TOTAL') return money(crc, 'CRC');
    const items = selectedTotal().items.filter(row => id === 'payroll-association' ? row.source === 'asociacion' : row.id === id);
    if (!items.length) return 'Excluido';
    return items.every(item => item.usd_value != null) ? money(decimalString(items.reduce((sum, item) => sum + decimal(item.usd_value), 0n)), 'USD') : '\u2014';
  };
  select('#payroll-unit').textContent = currency === 'TOTAL' ? 'USD' : 'CRC';
  select('#payroll-list').innerHTML = `<button class="adjustment-row" data-payroll="espp">${icon('briefcase-business')}<span>ESPP<small>Compra ${escapeHTML(dateLabel(payroll.espp.next_purchase_on, true))}</small></span><strong class="sensitive">${value('payroll-espp', payroll.espp.estimated_accumulated_crc)}</strong>${icon('chevron-right')}</button><button class="adjustment-row" data-payroll="association">${icon('building-2')}<span>Asociaci\u00f3n<small>Base ${escapeHTML(dateLabel(payroll.association.confirmed_as_of))} \u00b7 proyectado a hoy</small></span><strong class="sensitive">${value('payroll-association', payroll.association.estimated_total)}</strong>${icon('chevron-right')}</button>${payroll.espp.pending_transfers.length ? `<p class="form-error">${payroll.espp.pending_transfers.length} compra(s) ESPP en tr\u00e1nsito, pendiente(s) de conciliar con IBKR.</p>` : ''}`;
}
function renderPayrollDetail(kind) {
  const payroll = snapshot.payroll;
  select('#detail-eyebrow').textContent = 'PLANILLA \u00b7 CRC';
  if (kind === 'association') {
    const association = payroll.association;
    select('#detail-content').innerHTML = `<h2 id="detail-title">Asociaci\u00f3n</h2><p class="coverage-text">Saldo registrado al ${escapeHTML(dateLabel(association.confirmed_as_of, true))}</p>${line('Ahorro personal', money(association.confirmed_personal, 'CRC'))}${line('Aporte patronal', money(association.confirmed_employer, 'CRC'))}<div class="detail-block"><h3>Por quincena</h3>${line('Personal \u00b7 5%', money(payroll.per_payday.personal, 'CRC'))}${line('Patronal \u00b7 5,33%', money(payroll.per_payday.employer, 'CRC'))}</div><div class="detail-block"><h3>Proyectado a hoy</h3>${line('Personal', money(association.estimated_personal, 'CRC'))}${line('Patronal', money(association.estimated_employer, 'CRC'))}${line('Total', money(association.estimated_total, 'CRC'))}</div><p class="detail-callout">Sin intereses, retiros ni rendimientos estimados. Disponibilidad del aporte patronal por confirmar.</p>`;
  } else {
    const espp = payroll.espp;
    select('#detail-content').innerHTML = `<h2 id="detail-title">ESPP</h2><p class="small-label">Acumulado estimado del ciclo</p><p class="detail-balance">${money(espp.estimated_accumulated_crc, 'CRC')}</p>${line('Por quincena \u00b7 15%', money(payroll.per_payday.espp, 'CRC'))}${line('Pr\u00f3xima compra', escapeHTML(dateLabel(espp.next_purchase_on, true)))}${line('Compras anuales', '19 febrero \u00b7 19 agosto')}<p class="coverage-text">Rebajos los d\u00edas 15 y \u00faltimo de mes. El importe en CRC es una estimaci\u00f3n de planilla, no efectivo confirmado en USD.</p>${espp.pending_transfers.length ? `<div class="detail-block"><h3>En tr\u00e1nsito a IBKR</h3>${espp.pending_transfers.map(item => line(dateLabel(item.purchase_on, true), money(item.amount_crc, 'CRC'))).join('')}</div>` : ''}<p class="detail-callout">En la fecha de compra comienza un ciclo en cero. El anterior queda pendiente de conciliaci\u00f3n: no es un gasto ni se vuelve a sumar a las acciones de IBKR.</p>`;
  }
}
function renderSalaryForm() {
  const payroll = snapshot.payroll;
  const revision = payroll.revision;
  select('#detail-eyebrow').textContent = 'PLANILLA';
  select('#detail-content').innerHTML = `<h2 id="detail-title">Salario mensual</h2><form id="salary-form" class="adjustment-form"><label>Salario bruto \u00b7 CRC<input id="salary-amount" required inputmode="decimal" autocomplete="off" pattern="[0-9]+([.,][0-9]{1,2})?" value="${escapeHTML(payroll.scheduled_salary?.monthly_salary || payroll.monthly_salary)}"></label><p class="subtle">Vigente desde la siguiente quincena. Los aportes anteriores se conservan.</p>${payroll.scheduled_salary ? `<p class="subtle">Cambio programado: ${escapeHTML(dateLabel(payroll.scheduled_salary.effective_on, true))}</p>` : ''}${line('ESPP', '15%')}${line('Asociaci\u00f3n personal', '5%')}${line('Asociaci\u00f3n patronal', '5,33%')}<p id="salary-error" class="form-error" role="alert" hidden></p><div class="form-actions"><button class="primary-action" type="submit">${icon('check')}Guardar</button></div></form>`;
  select('#salary-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (savingSalary) return;
    savingSalary = true;
    select('#salary-form button').disabled = true;
    try {
      if (Portal.enabled) {
        await queueRemoteChange('salary', {monthly_salary: select('#salary-amount').value.trim().replace(',', '.'), revision});
        return;
      }
      const response = await fetch('/api/payroll/salary', {method: 'POST', headers: {'X-DEX-Client': 'pwa', 'Content-Type': 'application/json'}, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(12000), body: JSON.stringify({monthly_salary: select('#salary-amount').value.trim().replace(',', '.'), revision})});
      if (!response.ok) throw new Error(response.status === 409 ? 'El salario cambi\u00f3 en otra vista. Cierra y actualiza.' : 'No se pudo confirmar el cambio. Revisa el importe y actualiza antes de reintentar.');
      const data = await response.json(); validateSnapshot(data); snapshot = data;
      select('#detail').close(); currentDetail = null; render(); showToast('Salario programado para la siguiente quincena');
    } catch (error) { select('#salary-error').hidden = false; select('#salary-error').textContent = error.message; }
    finally { savingSalary = false; if (select('#salary-form button')) select('#salary-form button').disabled = false; }
  });
}
function renderAdjustments() {
  const items = snapshot.adjustments.filter(item => currency === 'TOTAL' || item.currency === currency);
  select('#adjustment-list').innerHTML = items.length ? items.map(item => `<button class="adjustment-row" data-adjustment="${escapeHTML(item.id)}"><span>${escapeHTML(item.name)}<small>${escapeHTML(item.currency)}${item.account_id ? ' \u00b7 ' + escapeHTML(entity(snapshot.accounts.find(account => account.id === item.account_id)?.source).name) : ''}</small></span><strong class="sensitive">\u2212${money(item.amount, item.currency)}</strong>${icon('chevron-right')}</button>`).join('') : '<p class="subtle">Sin restas en esta moneda.</p>';
  all('#adjustment-list .adjustment-row>span').forEach(node => node.setAttribute('data-no-translate', ''));
}
function accountOptions(denomination, selected) {
  return '<option value="">Sin cuenta espec\u00edfica</option>' + snapshot.accounts.filter(account => account.currency === denomination).map((account, index) => `<option value="${escapeHTML(account.id)}" ${account.id === selected ? 'selected' : ''}>${escapeHTML(entity(account.source).name)} \u00b7 ${escapeHTML(product(account))} \u00b7 ${account.currency} (${index + 1})</option>`).join('');
}
function renderAdjustmentForm(identifier) {
  const item = snapshot.adjustments.find(row => row.id === identifier);
  const denomination = item?.currency || (currency === 'TOTAL' ? 'USD' : currency);
  adjustmentRevision = snapshot.adjustments_revision;
  select('#detail-eyebrow').textContent = 'PATRIMONIO';
  select('#detail-content').innerHTML = `<h2 id="detail-title">${item ? 'Editar resta' : 'Restar del patrimonio'}</h2><form id="adjustment-form" class="adjustment-form"><label>Nombre<input id="adjustment-name" maxlength="80" required autocomplete="off" placeholder="Dinero de pap\u00e1" value="${escapeHTML(item?.name || '')}"></label><div class="form-columns"><label>Importe<input id="adjustment-amount" inputmode="decimal" required autocomplete="off" placeholder="0.00" pattern="[0-9]+([.,][0-9]{1,2})?" value="${escapeHTML(item?.amount || '')}"></label><label>Moneda<select id="adjustment-currency"><option ${denomination === 'USD' ? 'selected' : ''}>USD</option><option ${denomination === 'CRC' ? 'selected' : ''}>CRC</option></select></label></div><label>Cuenta<select id="adjustment-account">${accountOptions(denomination, item?.account_id)}</select></label><p class="subtle">Resta fija al patrimonio. El saldo del banco no cambia.</p><p id="adjustment-error" class="form-error" role="alert" hidden></p><div class="form-actions">${item ? `<button type="button" class="icon-button danger" id="adjustment-delete" title="Eliminar resta" aria-label="Eliminar resta">${icon('trash-2')}</button>` : ''}<button class="primary-action" type="submit">${icon('check')}Guardar</button></div>${item ? '<div id="delete-confirmation" hidden><p>\u00bfEliminar esta resta del patrimonio?</p><div class="form-actions"><button type="button" class="text-action" id="delete-cancel">Cancelar</button><button type="button" class="primary-action danger" id="delete-confirm">Eliminar resta</button></div></div>' : ''}</form>`;
  select('#adjustment-amount').setAttribute('pattern', '(?:-|\u2212)?[0-9]+([.,][0-9]{1,2})?');
  select('#adjustment-form .subtle').textContent = 'Resta activa hasta que la elimines, incluso cuando cambie el saldo del banco.';
  select('#adjustment-currency').addEventListener('change', event => { select('#adjustment-account').innerHTML = accountOptions(event.target.value); });
  select('#adjustment-form').addEventListener('submit', event => {
    event.preventDefault();
    saveAdjustment({operation: 'save', ...(item ? {id: item.id} : {}), name: select('#adjustment-name').value.trim(), amount: select('#adjustment-amount').value.trim().replace(/^[-\u2212]/, '').replace(',', '.'), currency: select('#adjustment-currency').value, account_id: select('#adjustment-account').value || null});
  });
  if (item) {
    select('#adjustment-delete').addEventListener('click', () => { select('#delete-confirmation').hidden = false; });
    select('#delete-cancel').addEventListener('click', () => { select('#delete-confirmation').hidden = true; });
    select('#delete-confirm').addEventListener('click', () => saveAdjustment({operation: 'delete', id: item.id}));
  }
}
async function saveAdjustment(change) {
  if (savingAdjustment) return;
  savingAdjustment = true;
  all('#adjustment-form button').forEach(button => { button.disabled = true; });
  select('#adjustment-error').hidden = true;
  try {
    if (Portal.enabled) { await queueRemoteChange('adjustment', {...change, revision: adjustmentRevision}); return; }
    const response = await fetch('/api/adjustments', {method: 'POST', headers: {'X-DEX-Client': 'pwa', 'Content-Type': 'application/json'}, credentials: 'same-origin', cache: 'no-store', body: JSON.stringify({...change, revision: adjustmentRevision}), signal: AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error(response.status === 409 ? 'Este ajuste cambi\u00f3 en otra vista. Cierra y actualiza antes de editar.' : response.status === 400 ? 'Revisa nombre, importe positivo y moneda de la cuenta.' : 'No se pudo confirmar el guardado. Actualiza antes de volver a intentarlo.');
    const data = await response.json();
    validateSnapshot(data);
    snapshot = data;
    select('#detail').close();
    currentDetail = null;
    render();
    showToast(change.operation === 'delete' ? 'Resta eliminada' : 'Resta guardada');
  } catch (error) {
    if (select('#adjustment-error')) { select('#adjustment-error').textContent = error.message; select('#adjustment-error').hidden = false; }
  } finally { savingAdjustment = false; all('#adjustment-form button').forEach(button => { button.disabled = false; }); }
}
function renderDetail(detail) {
  const container = select('#detail-content');
  if (detail.kind === 'composition') {
    renderComposition();
  } else if (detail.kind === 'performance') {
    select('#detail-eyebrow').textContent = 'RENDIMIENTO';
    container.innerHTML = `<h2 id="detail-title">Sobre las ganancias</h2><p class="coverage-text">Valor de tus posiciones abiertas menos lo que costaron, seg\u00fan el \u00faltimo informe de IBKR. Son ganancias o p\u00e9rdidas que a\u00fan no se han realizado vendiendo.</p>${line('Precio', 'Importe por acci\u00f3n')}${line('Valor', 'Importe total de la posici\u00f3n')}${line('Porcentaje', 'Ganancia dividida entre costo')}<p class="detail-callout">No incluye ventas anteriores ni dividendos. Los precios corresponden a la fecha del informe, no a cotizaciones en vivo. BTC sigue pendiente de datos reales.</p>`;
  } else if (detail.kind === 'salary') {
    renderSalaryForm();
  } else if (detail.kind === 'payroll') {
    renderPayrollDetail(detail.id);
  } else if (detail.kind === 'adjustment') {
    renderAdjustmentForm(detail.id);
  } else if (detail.kind === 'account') {
    const account = snapshot.accounts.find(item => item.id === detail.id);
    if (!account) { closeDetail(); return; }
    select('#detail-eyebrow').textContent = 'CUENTA';
    const componentNames = {stock_value: 'Posiciones', cash: 'Efectivo', interest_accruals: 'Intereses devengados', dividend_accruals: 'Dividendos devengados'};
    container.innerHTML = `<div class="sheet-title">${entityIcon(account.source)}<div><h2 id="detail-title">${escapeHTML(entity(account.source).name)}</h2><p class="subtle">${escapeHTML(product(account))} &middot; ${escapeHTML(account.currency)}</p></div></div><p class="small-label">Saldo al corte</p><p class="detail-balance sensitive">${money(account.balance, account.currency)}</p><p class="subtle">${escapeHTML(dateLabel(account.as_of, true))}</p><div class="detail-block">${line('Disponibilidad', escapeHTML(availability[account.availability] || 'Por confirmar'))}${line('Valoraci\u00f3n', 'Estado de cuenta')}${line('Cotizaci\u00f3n en vivo', 'No aplicada')}</div>${account.components ? `<div class="detail-block"><h3>Composici\u00f3n del saldo</h3>${Object.entries(componentNames).filter(([key]) => account.components[key] != null).map(([key, label]) => line(label, money(account.components[key], account.currency))).join('')}</div>` : ''}${account.positions?.length ? `<div class="detail-block"><h3>Posiciones <span class="small-label">${account.positions.length}</span></h3>${account.positions.map(position => `<div class="detail-line"><span><strong class="position-symbol">${escapeHTML(position.symbol || 'Posici\u00f3n')}</strong><span class="position-name">${escapeHTML(position.description || '')}</span></span><span class="sensitive">${money(position.market_value, position.currency || account.currency)}<span class="position-name">${hiddenAmounts ? '\u2022\u2022' : escapeHTML(position.quantity ?? position.position ?? '\u2014')} unidades</span></span></div>`).join('')}</div><p class="detail-callout">Las posiciones ya forman parte del saldo de esta cuenta. No se suman de nuevo.</p>` : `<p class="detail-callout">Este es el saldo confirmado a la fecha del estado de cuenta, no un saldo bancario en vivo.</p>`}`;
  } else if (detail.kind === 'connection') {
    const source = snapshot.coverage.find(item => item.source === detail.id);
    const accounts = snapshot.accounts.filter(item => item.source === detail.id);
    const observed = source?.state === 'observed';
    select('#detail-eyebrow').textContent = 'CONEXI\u00d3N';
    container.innerHTML = `<div class="sheet-title">${entityIcon(detail.id)}<h2 id="detail-title">${escapeHTML(entity(detail.id).name)}</h2></div>${line('Estado', observed ? 'Datos registrados' : 'Validaci\u00f3n pendiente')}${line('Acceso', 'Solo lectura')}${line('Cuentas observadas', String(accounts.length))}<p class="coverage-text">${detail.id === 'binance' ? 'Conector preparado. La conexi\u00f3n real y la cobertura de Spot y Earn est\u00e1n pendientes de validar desde el alojamiento final.' : observed ? 'Los importes conservan la fecha de cada estado de cuenta. Actualizar esta vista no solicita nuevos documentos al proveedor.' : 'Esta fuente a\u00fan no est\u00e1 incorporada al resumen.'}</p>${accounts.map(accountRow).join('')}${!observed ? '<p class="detail-callout">Una fuente pendiente no equivale a un saldo de cero.</p>' : ''}`;
  } else {
    select('#detail-eyebrow').textContent = 'DATOS';
    const fx = snapshot.total_usd.fx;
    container.innerHTML = `<h2 id="detail-title">Datos y tipo de cambio</h2><p class="coverage-text">Los saldos son los de tus \u00faltimos informes, no los de este instante. Cada cuenta conserva su fecha; los movimientos posteriores se ver\u00e1n al recibir un informe nuevo.</p>${snapshot.accounts.map(account => line(`${entity(account.source).name} \u00b7 ${accountTitle(account)}`, escapeHTML(dateLabel(account.as_of, true)))).join('')}<div class="detail-block"><h3>Conversi\u00f3n a d\u00f3lares</h3><p class="coverage-text">Total estimado: convierte colones con una referencia diaria. No es el cambio de compra o venta de tu banco. Incluye las proyecciones de ESPP y asociaci\u00f3n que tengas seleccionadas.</p>${line('Un d\u00f3lar', fx.crc_per_usd ? '\u20a1' + escapeHTML(fx.crc_per_usd) : 'Cambio pendiente')}${fx.updated_at ? line('Referencia del', escapeHTML(new Intl.DateTimeFormat(I18n.locale, {dateStyle: 'long', timeZone: 'America/Costa_Rica'}).format(new Date(fx.updated_at * 1000)))) : ''}</div>${line('Binance', 'Pendiente de incluir')}${line('Deudas', 'Por confirmar')}<p class="detail-callout">El cambio del patrimonio puede incluir aportes, restas y variaciones de moneda; no equivale a rentabilidad de inversiones.</p>`;
  }
  if (detail.kind === 'account') {
    const account = snapshot.accounts.find(item => item.id === detail.id);
    select('#detail-title').textContent = accountTitle(account);
    select('.sheet-title .subtle').textContent = entity(account.source).name;
    select('#detail-content>.small-label').textContent = 'Saldo del informe';
    select('#detail-content>.subtle').textContent = 'Informe del ' + dateLabel(account.as_of, true);
    const deduction = snapshot.deductions_by_account[detail.id] || '0';
    if (decimal(deduction) > 0n) container.insertAdjacentHTML('beforeend', `<div class="detail-block"><h3>Tu parte</h3>${line('Dinero excluido', '\u2212' + money(deduction, account.currency))}${line('Saldo menos restas', money(decimalString(decimal(account.balance) - decimal(deduction)), account.currency))}</div>`);
  }
  if (detail.kind === 'connection' && detail.id === 'binance') {
    container.querySelector('.coverage-text').textContent = 'Habilitado. Al subir estos archivos a main en GitHub se intentar\u00e1 consultar permisos, Spot y Earn. El resultado o error estar\u00e1 en Actions. Requiere los secretos de Binance; todav\u00eda no hay saldos validados.';
  }
  if (detail.kind === 'payroll' && detail.id === 'espp') container.querySelector('.detail-callout').textContent = 'El 19 de febrero y agosto el acumulado vuelve a cero. Las acciones se reflejan con el siguiente informe de IBKR, sin confirmaciones manuales. Hasta entonces el total puede verse temporalmente menor.';
  if (detail.kind === 'performance') container.insertAdjacentHTML('beforeend', '<p class="detail-callout">CASH es el efectivo del informe de IBKR, ya incluido en el total de esa cuenta. No se suma otra vez ni tiene precio por acci\u00f3n o ganancia calculada.</p>');
  all('#detail-content .position-symbol, #detail-content .position-symbol + .position-name').forEach(node => node.setAttribute('data-no-translate', ''));
  icons();
}
function openDetail(kind, id) {
  if (!snapshot) return;
  if (Portal.enabled && ['salary', 'adjustment'].includes(kind)) {
    if (!snapshot.remote_editing?.enabled) { showToast('Edici\u00f3n remota no disponible. Actualiza el resumen.'); return; }
    if (!Portal.canEdit) {
      select('#portal-edit-consent').hidden = false;
      select('#portal-edit-consent').open = true;
      select('#portal-edit-consent').scrollIntoView({block: 'nearest'});
      showToast('Autoriza la edici\u00f3n con Google.'); return;
    }
    if (!snapshot.remote_editing.queue_available) { showToast('Edici\u00f3n remota no disponible. Actualiza el resumen.'); return; }
    if (snapshot.remote_editing.requests?.some(item => item.kind === kind && item.state === 'pending')) { showToast('Hay un cambio pendiente. Actualiza antes de editar de nuevo.'); return; }
  }
  if (kind === 'connection' && snapshot.payroll?.configured && ['espp', 'asociacion'].includes(id)) {
    kind = 'payroll'; id = id === 'asociacion' ? 'association' : 'espp';
  }
  currentDetail = {kind, id};
  renderDetail(currentDetail);
  const dialog = select('#detail');
  if (!dialog.open) dialog.showModal();
  document.body.classList.add('modal-open');
  dialog.scrollTop = 0;
  select('#detail-close').focus({preventScroll: true});
}
function closeDetail() { if (!savingAdjustment && !savingSalary) select('#detail').close(); }
function navigate() {
  const target = location.hash.slice(1) || 'resumen';
  const view = ['resumen', 'rendimiento', 'cuentas', 'ajustes'].includes(target) ? target : 'resumen';
  const changed = view !== currentView;
  all('.view').forEach(section => { section.hidden = section.id !== view; });
  all('.navigation>a').forEach(link => { if (link.dataset.view === view) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  document.title = `${{resumen: 'Resumen', rendimiento: 'Rendimiento', cuentas: 'Cuentas', ajustes: 'Ajustes'}[view]} \u00b7 DEX`;
  currentView = view;
  if (view === 'resumen' || view === 'rendimiento') {
    const performance = view === 'rendimiento';
    select(performance ? '#performance-history-slot' : '#summary-history-slot').append(select('[aria-labelledby="history-heading"]'));
    select('.history-metric-label').hidden = !performance;
    historyMetric = performance ? select('#history-metric').value : 'worth';
    select('#history-heading').textContent = performance ? 'Evoluci\u00f3n de ganancias' : 'Evoluci\u00f3n';
    if (snapshot) renderHistory();
  }
  if (changed) {
    select('#main').focus({preventScroll: true});
    window.scrollTo({top: 0, behavior: 'instant'});
    requestAnimationFrame(() => window.scrollTo({top: 0, behavior: 'instant'}));
  }
  loadMarket(); loadAutomation();
}
function validateSnapshot(data) {
  if (data.version !== VERSION || typeof data.demo !== 'boolean' || !Array.isArray(data.accounts) || !Array.isArray(data.coverage) || !data.totals || data.net_worth_complete !== false) throw new Error('Unsupported summary');
  Object.values(data.totals).forEach(decimal);
  if (!Array.isArray(data.adjustments) || typeof data.adjustments_revision !== 'string') throw new Error('Invalid adjustments');
  Object.values(data.adjusted_totals).forEach(decimal);
  Object.values(data.deductions_by_currency).forEach(decimal);
  if (!data.total_usd || !Array.isArray(data.total_usd.items)) throw new Error('Invalid USD total');
  for (const key of ['gross', 'net', 'deductions', 'available_before_deductions']) if (data.total_usd[key] != null) decimal(data.total_usd[key]);
  data.total_usd.items.forEach(item => { if (item.usd_value != null) decimal(item.usd_value); (item.parts || []).forEach(part => decimal(part.usd_value)); });
  if (data.estimated_total_crc != null) decimal(data.estimated_total_crc);
  if (data.payroll?.configured) {
    decimal(data.payroll.monthly_salary);
    Object.values(data.payroll.per_payday).forEach(decimal);
    decimal(data.payroll.espp.estimated_accumulated_crc);
    decimal(data.payroll.association.estimated_total);
  }
  data.accounts.forEach(account => {
    if (!['USD', 'CRC'].includes(account.currency) || !account.id || !/^\d{4}-\d{2}-\d{2}$/.test(account.as_of)) throw new Error('Invalid account');
    decimal(account.balance);
    Object.values(account.components || {}).forEach(decimal);
    (account.positions || []).forEach(position => { decimal(position.market_value); for (const key of ['cost_basis', 'unrealized_pnl']) if (position[key] != null) decimal(position[key]); });
  });
}
async function load(userInitiated = false) {
  if (Portal.enabled && !Portal.connected) return;
  if (pending) return;
  pending = true;
  select('#refresh').disabled = true;
  select('#refresh').classList.add('spinning');
  try {
    let data;
    if (Portal.enabled) data = await Portal.summary();
    else {
      const response = await fetch('/api/summary', {headers: {'X-DEX-Client': 'pwa'}, cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(12000)});
      if (!response.ok) throw new Error('Unavailable');
      data = await response.json();
    }
    validateSnapshot(data);
    if (!snapshot && data.demo && preference('privacy', '') === '') hiddenAmounts = false;
    snapshot = data;
    failedRefresh = false;
    select('#mode-badge').textContent = data.demo ? 'DEMO' : 'LOCAL';
    select('#mode-badge').classList.toggle('demo', data.demo);
    render();
    if (userInitiated) showToast(Portal.enabled ? (Portal.cached ? 'Mostrando copia guardada' : 'Resumen publicado actualizado') : 'Resumen local actualizado');
  } catch {
    failedRefresh = true;
    setNotice();
    if (!snapshot) {
      select('#all-accounts').innerHTML = '<p class="empty">Sin datos disponibles.</p>';
    }
  } finally { pending = false; select('#refresh').disabled = false; select('#refresh').classList.remove('spinning'); }
}
function setPrivacy(value) { hiddenAmounts = value; savePreference('privacy', value); renderPrivacy(); render(); icons(); }
document.addEventListener('portal-connected', () => { document.body.classList.add('connected'); load(); loadMarket(); });
document.addEventListener('portal-edit-permission', renderRemoteEdits);
document.addEventListener('portal-disconnected', () => {
  snapshot = null; btcQuote = null; currentDetail = null;
  document.body.classList.remove('connected');
  if (select('#detail').open) select('#detail').close();
  all('.view').forEach(section => { section.hidden = true; });
  select('#history-chart').getContext('2d').clearRect(0, 0, select('#history-chart').width, select('#history-chart').height);
  location.reload();
});
select('#privacy').addEventListener('click', () => setPrivacy(!hiddenAmounts));
select('#language-setting').value = I18n.language;
select('#language-setting').addEventListener('change', event => I18n.setLanguage(event.target.value));
document.addEventListener('languagechange', () => { select('#language-setting').value = I18n.language; render(); navigate(); I18n.refresh(); });
select('#privacy-setting').addEventListener('change', event => setPrivacy(event.target.checked));
select('#refresh').addEventListener('click', () => load(true));
select('#composition-open').addEventListener('click', () => openDetail('composition'));
select('#performance-sort').addEventListener('change', renderPerformance);
select('[data-performance-info]').addEventListener('click', () => openDetail('performance'));
all('[data-period]').forEach(button => button.addEventListener('click', () => { historyPeriod = button.dataset.period; all('[data-period]').forEach(item => item.setAttribute('aria-pressed', String(item === button))); renderHistory(); }));
select('#history-metric').addEventListener('change', event => { historyMetric = event.target.value; renderHistory(); });
new ResizeObserver(() => { if (snapshot && ['resumen', 'rendimiento'].includes(currentView)) renderHistory(); }).observe(select('.history-section'));
all('[data-currency]').forEach(button => button.addEventListener('click', () => {
  currency = button.dataset.currency;
  savePreference('currency', currency);
  updateCurrency(); render();
}));
function updateCurrency() { all('[data-currency]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.currency === currency))); select('#default-currency').value = currency; }
select('#default-currency').value = currency;
select('#default-currency').addEventListener('change', event => { currency = event.target.value; savePreference('currency', currency); updateCurrency(); render(); });
all('[data-filter]').forEach(button => button.addEventListener('click', () => { filter = button.dataset.filter; all('[data-filter]').forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', String(item === button)); }); renderAccounts(); icons(); }));
select('#search').addEventListener('input', () => { renderAccounts(); icons(); });
select('#sort').addEventListener('change', () => { renderAccounts(); icons(); });
select('#sort option[value="date"]').textContent = 'Informe reciente';
document.addEventListener('click', event => {
  const account = event.target.closest('[data-account]');
  const connection = event.target.closest('[data-connection]');
  const adjustment = event.target.closest('[data-adjustment]');
  const payroll = event.target.closest('[data-payroll]');
  if (payroll) openDetail('payroll', payroll.dataset.payroll);
  else if (event.target.closest('#salary-setting')) openDetail('salary');
  else if (event.target.closest('[data-new-adjustment]')) openDetail('adjustment');
  else if (adjustment) openDetail('adjustment', adjustment.dataset.adjustment);
  else if (account) openDetail('account', account.dataset.account);
  else if (connection) openDetail('connection', connection.dataset.connection);
});
select('#coverage-open').addEventListener('click', () => openDetail('coverage'));
select('#detail-close').addEventListener('click', closeDetail);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && select('#detail').open) { event.preventDefault(); closeDetail(); }
});
select('#detail').addEventListener('click', event => { const bounds = event.currentTarget.getBoundingClientRect(); if (event.target === event.currentTarget && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) closeDetail(); });
select('#detail').addEventListener('close', () => { currentDetail = null; document.body.classList.remove('modal-open'); });
select('#detail').addEventListener('cancel', event => { if (savingAdjustment || savingSalary) event.preventDefault(); });
select('#motion-setting').checked = preference('motion', 'false') === 'true';
document.body.classList.toggle('reduce-motion', select('#motion-setting').checked);
select('#motion-setting').addEventListener('change', event => { document.body.classList.toggle('reduce-motion', event.target.checked); savePreference('motion', event.target.checked); });
document.addEventListener('visibilitychange', () => { if (document.hidden && snapshot && !snapshot.demo && preference('privacy', 'true') === 'true') { hiddenAmounts = true; render(); } });
function automaticRefresh() { if (!document.hidden && !select('#detail').open && !savingAdjustment && !savingSalary) load(); }
document.addEventListener('visibilitychange', automaticRefresh);
setInterval(automaticRefresh, 60000);
setInterval(() => { loadMarket(); loadAutomation(); }, 60000);
window.addEventListener('hashchange', navigate);
window.addEventListener('online', setNotice);
window.addEventListener('offline', setNotice);
all('[data-version]').forEach(node => { node.textContent = VERSION; });
updateCurrency(); renderPrivacy(); navigate(); icons(); I18n.refresh(); load();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});