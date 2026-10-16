'use strict';

const DexExpenses = (() => {
  const firstMonth = '2026-01';
  let month = '';
  let denomination = 'CRC';
  let mode = 'categories';
  let query = '';
  let searching = false;
  let chartGroups = [];
  let entranceAnimations = [];
  let selection = null;
  let selectedCards = [];
  let sourceScope = 'all';
  let monthlyCurrency = 'separate';
  let monthlyPeriod = '12';
  let monthlySelection = null;
  let monthlyModel = null;
  let cardsInitialized = false;
  let renderKey = '';
  let layoutKey = '';
  let layoutWidth = innerWidth;
  const labels = {
    food: ['Comidas y caf\u00e9', 'Food & coffee', 'utensils', '#da8b66'],
    groceries: ['Supermercado', 'Groceries', 'shopping-basket', '#7fb898'],
    transport: ['Transporte', 'Transport', 'fuel', '#87a9d5'],
    shopping: ['Compras', 'Shopping', 'shopping-bag', '#d38c9e'],
    entertainment: ['Entretenimiento', 'Entertainment', 'ticket', '#c9ad74'],
    services: ['Servicios', 'Services', 'shield-check', '#82bbb8'],
    pets: ['Mascotas', 'Pets', 'heart', '#c88f78'],
    education: ['Educaci\u00f3n', 'Education', 'book-open', '#83a990'],
    vehicle: ['Veh\u00edculo', 'Vehicle', 'wrench', '#879fb8'],
    fitness: ['Gimnasio y deporte', 'Fitness', 'dumbbell', '#93ac6e'],
    health: ['Salud', 'Health', 'heart', '#c98995'],
    subscriptions: ['Servicios digitales', 'Digital services', 'repeat', '#9b91b5'],
    travel: ['Viajes', 'Travel', 'plane', '#72aeb1'],
    home: ['Hogar', 'Home', 'house', '#bc9c75'],
    taxes: ['IVA y cargos', 'Tax & fees', 'receipt-text', '#a3a9b2'],
    other: ['Sin clasificar', 'Uncategorized', 'shapes', '#a9a2b9']
  };
  const text = (spanish, english) => I18n.language === 'en' ? english : spanish;
  const countLabel = count => `${count} ${count === 1 ? text('movimiento', 'transaction') : text('movimientos', 'transactions')}`;
  const clean = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const amount = value => money(decimalString(value), denomination);
  const headlineAmount = value => amount(value).replace(/([\u20a1$])/, '<span class="expense-currency-mark">$1</span>');
  const sum = rows => rows.reduce((total, row) => total + decimal(row.amount), 0n);
  const category = key => labels[key] || labels.other;
  const categoryName = key => category(key)[I18n.language === 'en' ? 1 : 0];
  const monthName = key => key.length === 4 ? key : new Intl.DateTimeFormat(I18n.locale, {month: 'long', year: 'numeric', timeZone: 'UTC'}).format(new Date(key + '-01T12:00:00Z'));
  const button = (label, glyph, attrs = '') => `<button type="button" class="icon-button plain" aria-label="${escapeHTML(label)}" title="${escapeHTML(label)}" ${attrs}>${icon(glyph)}</button>`;
  function data() {
    const value = snapshot?.expenses;
    if (!value) return {state: 'empty', transactions: [], statements: []};
    if (value.version !== 1 || !Array.isArray(value.transactions) || !Array.isArray(value.statements)) throw new Error('Invalid expenses');
    value.transactions.forEach(row => {
      if (!row.id || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !['CRC', 'USD'].includes(row.currency) || typeof row.description !== 'string') throw new Error('Invalid expense');
      decimal(row.amount);
    });
    return value;
  }
  function months(value) {
    const keys = value.transactions.map(row => row.date.slice(0, 7));
    value.statements.forEach(statement => keys.push(statement.start.slice(0, 7), statement.end.slice(0, 7)));
    if (!keys.length) return [];
    const last = keys.sort().at(-1);
    const result = [];
    let cursor = keys[0] < firstMonth ? firstMonth : keys[0];
    while (cursor <= last && result.length < 240) {
      result.push(cursor);
      const next = new Date(cursor + '-01T12:00:00Z');
      next.setUTCMonth(next.getUTCMonth() + 1);
      cursor = next.toISOString().slice(0, 7);
    }
    return result.filter(key => !(value.withheld_months || []).includes(key));
  }
  function cardsFor(value) {
    const cards = value.cards || [...new Map(value.statements.map(statement => [statement.card_id, {id: statement.card_id, issuer: statement.issuer, last4: statement.last4 || '', product: statement.product || ''}])).values()];
    return [...cards].sort((first, last) => (first.last4 || first.id).localeCompare(last.last4 || last.id));
  }
  function cardProduct(card) {
    return ({
      'bac-lifemiles-visa-black': {name: 'BAC LifeMiles Black Visa', short: 'LifeMiles', image: 'card-bac-lifemiles.png'},
      'bac-amex-blue': {name: 'BAC Blue American Express', short: 'Amex Blue', image: 'card-bac-amex-blue.png'}
    })[card.product] || null;
  }
  function cardMarkup(card, index, value) {
    const product = cardProduct(card);
    const selected = selectedCards.includes(card.id);
    const label = (product?.name || card.issuer || text('Tarjeta', 'Card')) + ' ' + cardName(card, index);
    return `<button type="button" class="expense-card" data-expense-card="${escapeHTML(card.id)}" aria-pressed="${selected}" aria-label="${escapeHTML(label)}" title="${escapeHTML(label)}"><span class="expense-card-surface">${product ? `<img class="expense-card-art" src="./${product.image}" width="557" height="352" alt="" draggable="false">` : `<span class="expense-card-fallback"><img src="./brand-bac.svg" width="24" height="24" alt="BAC"></span>`}</span><span class="expense-card-label"><strong data-no-translate>${escapeHTML(product?.short || card.issuer || text('Tarjeta', 'Card'))}</strong><small data-no-translate>${escapeHTML(cardName(card, index))}</small></span><strong class="sensitive">${amount(sum(rowsFor(value, card.id)))}</strong></button>`;
  }
  function cardName(card, index = 0) {
    return card?.last4 ? '\u2022\u2022 ' + card.last4 : text('Tarjeta ', 'Card ') + (index + 1);
  }
  function selectedSources(value, unit = denomination) {
    return [...(sourceScope === 'bank' ? [] : selectedCards), ...(sourceScope === 'cards' ? [] : (value.bank_accounts || []).filter(account => !unit || account.currency === unit).map(account => account.id))];
  }
  function monthlySeries(value, {sources, conversion = 'separate', period = '12', through = '', fx = null}) {
    const available = months(value);
    const currencies = conversion === 'separate' ? ['CRC', 'USD'] : [conversion];
    const points = [];
    if (!available.length) return {points, currencies};
    let last = through.length === 4 ? through + '-12' : through || available.at(-1);
    if (last > available.at(-1)) last = available.at(-1);
    let cursor = available[0];
    while (cursor <= last && points.length < 240) {
      points.push({month: cursor});
      const next = new Date(cursor + '-01T12:00:00Z');
      next.setUTCMonth(next.getUTCMonth() + 1);
      cursor = next.toISOString().slice(0, 7);
    }
    const banks = value.bank_accounts || [];
    const rows = value.transactions.filter(row => sources.includes(row.card_id) && ['purchase', 'tax', 'fee', 'refund'].includes(row.kind));
    let rate = null;
    try { if (['current', 'stale'].includes(fx?.state) && decimal(fx.crc_per_usd) > 0n) rate = decimal(fx.crc_per_usd); } catch {}
    for (const point of points) {
      point.values = {}; point.complete = {}; point.estimated = {};
      point.withheld = (value.withheld_months || []).includes(point.month);
      const active = {};
      for (const unit of ['CRC', 'USD']) {
        const identifiers = sources.filter(identifier => !banks.some(bank => bank.id === identifier && bank.currency !== unit));
        active[unit] = identifiers.length > 0;
        const selected = rows.filter(row => row.currency === unit && row.date.startsWith(point.month));
        const missingCard = (value.bank_outflows || []).some(row => identifiers.includes(row.card_id) && row.currency === unit && row.date.startsWith(point.month) && row.card_statement_missing);
        point.complete[unit] = !point.withheld && !missingCard && coverage(value.statements, point.month, identifiers);
        point.values[unit] = !point.withheld && (selected.length || point.complete[unit]) ? sum(selected) : null;
        point.estimated[unit] = selected.some(row => row.classification === 'unidentified');
      }
      if (conversion !== 'separate') {
        const opposite = conversion === 'USD' ? 'CRC' : 'USD';
        const own = point.values[conversion], foreign = point.values[opposite];
        point.values = {[conversion]: own == null && foreign == null || foreign != null && foreign !== 0n && !rate ? null
          : (own || 0n) + (!foreign ? 0n : conversion === 'USD' ? foreign * 10n ** 20n / rate : foreign * rate / 10n ** 20n)};
        point.complete = {[conversion]: (!active[conversion] || point.complete[conversion]) && (!active[opposite] || point.complete[opposite]) && point.values[conversion] != null};
        point.estimated = {[conversion]: point.estimated.CRC || point.estimated.USD};
      }
    }
    return {points: period === 'all' ? points : points.slice(-Number(period)), currencies, rate, fx};
  }
  function monthlyStatus(point, unit) {
    if (point.withheld) return text('Pendiente', 'Pending');
    if (point.values[unit] == null) return text('Sin dato', 'No data');
    return [point.complete[unit] ? text('Cubierto', 'Covered') : text('Parcial', 'Partial'), point.estimated[unit] ? text('Por confirmar', 'Unconfirmed') : ''].filter(Boolean).join(' \u00b7 ');
  }
  function selectMonthlyPoint(index) {
    if (!monthlyModel || hiddenAmounts) return;
    const {chart, context, image, points, currencies, scale, height, width, positions, colors} = monthlyModel;
    index = Math.max(0, Math.min(points.length - 1, index));
    const point = points[index];
    monthlyModel.index = index;
    monthlySelection = point.month;
    context.putImageData(image, 0, 0);
    context.save(); context.setTransform(scale, 0, 0, scale, 0, 0);
    context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--chart-guide');
    context.lineWidth = 1;
    const horizontal = points.length === 1 ? width / 2 : 18 + index / (points.length - 1) * (width - 36);
    context.beginPath(); context.moveTo(horizontal, 4); context.lineTo(horizontal, height - 4); context.stroke();
    currencies.forEach((unit, lane) => {
      const position = positions[lane][index];
      if (position == null) return;
      context.fillStyle = colors[lane]; context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg'); context.lineWidth = 3;
      context.beginPath(); context.arc(horizontal, position, 5, 0, Math.PI * 2); context.fill(); context.stroke();
    });
    context.restore();
    select('#expense-monthly-date').textContent = monthName(point.month);
    const previous = points[index - 1];
    select('#expense-monthly-values').innerHTML = currencies.map(unit => {
      const value = point.values[unit];
      const comparable = previous && point.complete[unit] && previous.complete[unit] && value != null && previous.values[unit] != null;
      const delta = comparable ? value - previous.values[unit] : null;
      return `<span><strong class="sensitive">${value == null ? '\u2014' : money(decimalString(value), unit)}</strong><small>${escapeHTML(monthlyStatus(point, unit))}</small><small>${delta == null ? '' : `${delta > 0n ? '+' : ''}${money(decimalString(delta), unit)} ${text('vs. mes anterior', 'vs. previous month')}`}</small></span>`;
    }).join('');
    const open = select('#expense-monthly-open');
    open.disabled = point.withheld || currencies.every(unit => point.values[unit] == null);
    open.setAttribute('aria-label', `${text('Ver movimientos de', 'View transactions for')} ${monthName(point.month)}`);
    chart.setAttribute('aria-valuenow', String(index));
    chart.setAttribute('aria-valuetext', `${monthName(point.month)}: ${currencies.map(unit => `${unit} ${point.values[unit] == null ? text('Sin dato', 'No data') : money(decimalString(point.values[unit]), unit)}; ${monthlyStatus(point, unit)}`).join('; ')}`);
  }
  function paintMonthly() {
    const chart = select('#expense-monthly-chart');
    if (!chart || !chart.clientWidth || hiddenAmounts || !monthlyModel?.points.length) return;
    const {points, currencies} = monthlyModel;
    const width = chart.clientWidth, height = 220, scale = Math.min(devicePixelRatio || 1, 3);
    chart.width = Math.round(width * scale); chart.height = Math.round(height * scale);
    const context = chart.getContext('2d'); context.scale(scale, scale);
    const theme = getComputedStyle(document.documentElement);
    const colors = [theme.getPropertyValue('--tint').trim(), labels.transport[3]];
    const positions = [];
    currencies.forEach((unit, lane) => {
      const amounts = points.map(point => point.values[unit]).filter(value => value != null);
      const minimum = amounts.reduce((first, second) => first < second ? first : second, 0n);
      const maximum = amounts.reduce((first, second) => first > second ? first : second, 0n);
      const range = maximum - minimum;
      const laneHeight = height / currencies.length, top = lane * laneHeight + 26, bottom = (lane + 1) * laneHeight - 16;
      const vertical = value => range === 0n ? (top + bottom) / 2 : top + Number((maximum - value) * 10000n / range) / 10000 * (bottom - top);
      context.font = `500 11px ${theme.getPropertyValue('--font-body') || 'sans-serif'}`;
      context.fillStyle = theme.getPropertyValue('--label-2');
      context.textAlign = 'left'; context.fillText(unit, 2, lane * laneHeight + 13);
      context.textAlign = 'right';
      if (amounts.length) context.fillText(new Intl.NumberFormat(I18n.locale, {notation: 'compact', maximumFractionDigits: 1}).format(Number(decimalString(maximum))), width - 2, lane * laneHeight + 13);
      context.save(); context.setLineDash([2, 5]); context.strokeStyle = theme.getPropertyValue('--chart-guide'); context.lineWidth = 1;
      context.beginPath(); context.moveTo(0, vertical(0n)); context.lineTo(width, vertical(0n)); context.stroke(); context.restore();
      context.strokeStyle = colors[lane]; context.fillStyle = colors[lane]; context.lineWidth = 2.4; context.lineJoin = 'round'; context.lineCap = 'round';
      const lanePositions = points.map(point => point.values[unit] == null ? null : vertical(point.values[unit]));
      positions.push(lanePositions);
      points.forEach((point, index) => {
        const position = lanePositions[index];
        if (position == null) return;
        const horizontal = points.length === 1 ? width / 2 : 18 + index / (points.length - 1) * (width - 36);
        if (index && lanePositions[index - 1] != null) {
          context.save(); if (!point.complete[unit] || !points[index - 1].complete[unit]) context.setLineDash([4, 4]);
          context.beginPath(); context.moveTo(18 + (index - 1) / (points.length - 1) * (width - 36), lanePositions[index - 1]); context.lineTo(horizontal, position); context.stroke(); context.restore();
        }
        context.beginPath(); context.arc(horizontal, position, 3, 0, Math.PI * 2);
        if (point.complete[unit]) context.fill(); else context.stroke();
      });
    });
    Object.assign(monthlyModel, {chart, context, width, height, scale, positions, colors, image: context.getImageData(0, 0, chart.width, chart.height)});
    const selected = points.findIndex(point => point.month === monthlySelection);
    selectMonthlyPoint(selected < 0 ? points.length - 1 : selected);
  }
  function openMonthlyMonth(key) {
    changeMonth(key);
    select('#expense-month').focus({preventScroll: true});
    select('.expense-month-control').scrollIntoView({block: 'start', behavior: DexNative.reduced() ? 'instant' : 'smooth'});
  }
  function renderMonthly(value = data()) {
    const root = select('#expense-monthly');
    if (!root) return;
    const model = monthlySeries(value, {sources: selectedSources(value, null), conversion: monthlyCurrency, period: monthlyPeriod, through: month, fx: snapshot?.total_usd?.fx});
    monthlyModel = model;
    const {points, currencies, rate, fx} = model;
    const available = points.some(point => currencies.some(unit => point.values[unit] != null));
    const shortDate = key => new Intl.DateTimeFormat(I18n.locale, {month: 'short', year: 'numeric', timeZone: 'UTC'}).format(new Date(key + '-01T12:00:00Z'));
    const updated = typeof fx?.updated_at === 'number' ? fx.updated_at * 1000 : Date.parse(fx?.updated_at);
    const date = Number.isFinite(updated) ? new Intl.DateTimeFormat(I18n.locale, {dateStyle: 'medium', timeZone: 'UTC'}).format(new Date(updated)) : text('Fecha no disponible', 'Date unavailable');
    const note = hiddenAmounts ? text('Importes ocultos', 'Amounts hidden') : monthlyCurrency === 'separate' ? text('Importes en moneda original.', 'Amounts in original currency.') : rate ? `${text('Conversi\u00f3n estimada', 'Estimated conversion')} \u00b7 1 USD = ${money(decimalString(rate), 'CRC')} \u00b7 ${escapeHTML(date)}. ${text('No es el cambio hist\u00f3rico.', 'Not the historical rate.')} ${fx.state === 'stale' ? text('Cambio pendiente de actualizar.', 'Exchange rate awaiting update.') : ''}` : text('Tipo de cambio no disponible. Conversi\u00f3n pendiente.', 'Exchange rate unavailable. Conversion pending.');
    root.innerHTML = `<div class="section-heading"><h2>${text('Gastos mensuales', 'Monthly spending')}</h2></div><div class="segmented expense-monthly-currency" role="group" aria-label="${text('Moneda de la gr\u00e1fica', 'Chart currency')}">${[['USD',text('Todo USD','All USD')],['CRC',text('Todo CRC','All CRC')],['separate',text('Separado','Separate')]].map(([key,label]) => `<button type="button" data-expense-monthly-currency="${key}" aria-pressed="${monthlyCurrency === key}">${label}</button>`).join('')}</div><div class="expense-monthly-readout"><div class="expense-monthly-date"><span id="expense-monthly-date"></span>${button(text('Ver movimientos del mes', 'View month transactions'), 'arrow-up-right', 'id="expense-monthly-open" disabled')}</div><div id="expense-monthly-values"></div></div><div class="expense-monthly-plot"><canvas id="expense-monthly-chart" role="slider" tabindex="0" aria-label="${text('Gastos mensuales', 'Monthly spending')}" aria-valuemin="0" aria-valuemax="${Math.max(0,points.length - 1)}" aria-valuenow="0" ${hiddenAmounts || !available ? 'hidden' : ''}></canvas><p class="subtle" ${!hiddenAmounts && available ? 'hidden' : ''}>${text(hiddenAmounts ? 'Importes ocultos' : 'Sin datos en este intervalo', hiddenAmounts ? 'Amounts hidden' : 'No data in this range')}</p></div><div class="chart-range">${points.length ? [points[0], points.at(-1)].map(point => `<time datetime="${point.month}">${escapeHTML(shortDate(point.month))}</time>`).join('') : ''}</div><div class="period-chips" role="group" aria-label="${text('Intervalo de gastos', 'Spending range')}">${[['3','3M'],['6','6M'],['12','1A'],['all',text('Todo','All')]].map(([key,label]) => `<button type="button" data-expense-monthly-period="${key}" aria-pressed="${monthlyPeriod === key}">${I18n.language === 'en' && key === '12' ? '1Y' : label}</button>`).join('')}</div><p class="expense-monthly-note subtle">${note}${!hiddenAmounts && monthlyCurrency !== 'separate' && rate ? ' <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">Exchange Rate API</a>' : ''}</p><details class="disclosure expense-monthly-observations" ${hiddenAmounts ? 'hidden' : ''}><summary>${text('Meses', 'Months')}</summary><div class="expense-monthly-rows">${points.map(point => `<button type="button" data-expense-monthly-open="${point.month}" ${point.withheld || currencies.every(unit => point.values[unit] == null) ? 'disabled' : ''}><span>${escapeHTML(shortDate(point.month))}</span><span>${currencies.map(unit => `<strong class="sensitive">${point.values[unit] == null ? '\u2014' : money(decimalString(point.values[unit]), unit)}</strong><small>${escapeHTML(monthlyStatus(point, unit))}</small>`).join('')}</span>${icon('chevron-right')}</button>`).join('')}</div></details>`;
    root.querySelector('.segmented').style.setProperty('--index', ['USD','CRC','separate'].indexOf(monthlyCurrency));
    root.querySelectorAll('[data-expense-monthly-currency], [data-expense-monthly-period]').forEach(control => control.addEventListener('click', () => {
      if (control.dataset.expenseMonthlyCurrency) monthlyCurrency = control.dataset.expenseMonthlyCurrency;
      else monthlyPeriod = control.dataset.expenseMonthlyPeriod;
      const selector = control.dataset.expenseMonthlyCurrency ? `[data-expense-monthly-currency="${monthlyCurrency}"]` : `[data-expense-monthly-period="${monthlyPeriod}"]`;
      renderMonthly(); icons(); select(selector).focus({preventScroll:true});
    }));
    root.querySelectorAll('[data-expense-monthly-open]').forEach(control => control.addEventListener('click', () => openMonthlyMonth(control.dataset.expenseMonthlyOpen)));
    select('#expense-monthly-open').addEventListener('click', () => { if (monthlySelection) openMonthlyMonth(monthlySelection); });
    const chart = select('#expense-monthly-chart');
    let origin = null;
    const atPointer = event => {
      if (!monthlyModel?.image) return;
      const bounds = chart.getBoundingClientRect();
      selectMonthlyPoint(Math.round((event.clientX - bounds.left - 18) / Math.max(1, bounds.width - 36) * (points.length - 1)));
    };
    chart.addEventListener('pointerdown', event => { if (event.isPrimary === false) return; origin = {horizontal:event.clientX, vertical:event.clientY}; if (event.pointerType === 'mouse') atPointer(event); });
    chart.addEventListener('pointermove', event => {
      if (event.isPrimary === false) return;
      if (event.pointerType === 'mouse') { if (lastMousePosition?.horizontal !== event.clientX || lastMousePosition?.vertical !== event.clientY) atPointer(event); }
      else if (origin && Math.abs(event.clientX - origin.horizontal) > 8 && Math.abs(event.clientX - origin.horizontal) > Math.abs(event.clientY - origin.vertical)) atPointer(event);
    });
    chart.addEventListener('pointerup', event => { if (origin && Math.abs(event.clientX - origin.horizontal) < 8 && Math.abs(event.clientY - origin.vertical) < 8) atPointer(event); origin = null; });
    chart.addEventListener('pointercancel', () => { origin = null; });
    chart.addEventListener('keydown', event => {
      const index = monthlyModel?.index || 0;
      const target = {ArrowLeft:index - 1, ArrowRight:index + 1, Home:0, End:points.length - 1}[event.key];
      if (target != null) { event.preventDefault(); selectMonthlyPoint(target); }
      else if (event.key === 'Enter' && !select('#expense-monthly-open').disabled) { event.preventDefault(); openMonthlyMonth(monthlySelection); }
    });
    paintMonthly();
  }
  function sourceName(value, identifier) {
    const account = (value.bank_accounts || []).find(item => item.id === identifier);
    return account ? `${account.issuer} ${account.currency} \u2022\u2022 ${account.last4}` : cardName(cardsFor(value).find(card => card.id === identifier));
  }
  function rowsFor(value, card = null) {
    const sources = selectedSources(value);
    return value.transactions.filter(row => (card ? row.card_id === card : sources.includes(row.card_id)) && row.date.startsWith(month) && row.currency === denomination && ['purchase', 'tax', 'fee', 'refund'].includes(row.kind));
  }
  function bankRows(value) {
    const sources = selectedSources(value);
    return (value.bank_outflows || []).filter(row => sources.includes(row.card_id) && row.date.startsWith(month) && row.currency === denomination);
  }
  function bankBreakdown(value) {
    const rows = bankRows(value);
    if (!rows.length) return '';
    const unknown = rows.filter(row => row.classification === 'unidentified');
    const labels = [['expense', text('Gastos identificados', 'Identified spending')], ['unidentified', text('Incluidos por confirmar', 'Included, unconfirmed')], ['own_transfer', text('Entre mis cuentas \u00b7 excluido', 'Own transfers \u00b7 excluded')], ['card_payment', text('Pagos de tarjeta \u00b7 excluido', 'Card payments \u00b7 excluded')], ['investment', text('Inversiones \u00b7 excluido', 'Investments \u00b7 excluded')]];
    return `<section class="expense-explanation"><h3>${text('Transferencias y cuentas', 'Transfers and accounts')}</h3>${labels.map(([key, label]) => { const items = rows.filter(row => row.classification === key); return items.length ? line(label, amount(sum(items))) : ''; }).join('')}${rows.some(row => row.card_statement_missing) ? `<p class="subtle">${text('Hay pagos de tarjetas sin estado recibido. Se excluyen los pagos; falta cobertura de sus compras.', 'Some card payments have no matching statement. Payments are excluded; their purchases are not fully covered.')}</p>` : ''}${unknown.length ? `<p class="subtle">${text('Estas salidas s\u00ed est\u00e1n incluidas en el total estimado. El estado no permite confirmar su destino o prop\u00f3sito.', 'These outflows are included in the estimated total. The statement does not establish their destination or purpose.')}</p><details class="expense-insight"><summary><span>${text('Destino por confirmar', 'Destination unconfirmed')}</span><strong>${unknown.length}</strong>${icon('chevron-down')}</summary>${transactionRows(unknown)}</details>` : ''}</section>`;
  }
  function reviewMarkup(value) {
    const insights = (value.insights || []).filter(item => item.kind !== 'recurring_payment' && item.date.startsWith(month) && item.currency === denomination && selectedSources(value).includes(item.card_id));
    if (!insights.length) return '';
    return `<details class="expense-reviews" id="expense-reviews"><summary>${icon('circle-alert')}<span>${text('Para revisar', 'To review')}</span><strong>${insights.length}</strong>${icon('chevron-down')}</summary><div>${insights.map(item => {
      const increased = item.kind === 'recurring_increase';
      const rows = value.transactions.filter(row => item.transaction_ids.includes(row.id));
      const card = cardsFor(value).find(card => card.id === item.card_id);
      return `<details class="expense-insight"><summary><span><strong>${text(increased ? 'Aumento recurrente' : 'Posible cobro repetido', increased ? 'Recurring increase' : 'Possible duplicate charge')}</strong><small data-no-translate>${escapeHTML(item.merchant)} \u00b7 ${escapeHTML(cardName(card))}</small></span>${icon('chevron-down')}</summary>${increased ? `<div class="expense-insight-values">${line(text('Antes', 'Before'), money(item.previous_amount, item.currency))}${line(text('Ahora', 'Now'), money(item.amount, item.currency))}${line(text('Diferencia anual estimada', 'Estimated annual difference'), money(item.annual_change, item.currency))}</div><p class="subtle">${text('Dos cargos mensuales iguales y uno mayor. Estimaci\u00f3n anual si el nuevo importe se mantiene; no confirma una suscripci\u00f3n.', 'Two equal monthly charges followed by a higher one. Annual estimate assumes the new price continues; this does not confirm a subscription.')}</p>` : `<p class="subtle">${text('Mismo comercio e importe en un intervalo de un d\u00eda. Pueden ser compras distintas; no se ha eliminado ning\u00fan cargo.', 'Same merchant and amount within one day. These may be separate purchases; no charge has been removed.')}</p>`}${transactionRows(rows)}</details>`;
    }).join('')}</div></details>`;
  }
  function grouped(rows, key) {
    const groups = new Map();
    rows.forEach(row => {
      const name = key === 'categories' ? row.category || 'other' : row.merchant || row.description;
      if (!groups.has(name)) groups.set(name, {key: name, rows: [], total: 0n});
      const group = groups.get(name);
      group.rows.push(row);
      group.total += decimal(row.amount);
    });
    return [...groups.values()].sort((first, second) => first.total > second.total ? -1 : first.total < second.total ? 1 : first.key.localeCompare(second.key));
  }
  function compareMonths(value, currentMonth, currency, cards) {
    const previous = new Date((currentMonth.length === 4 ? currentMonth + '-01' : currentMonth) + '-01T12:00:00Z');
    previous.setUTCMonth(previous.getUTCMonth() - 1);
    const previousMonth = previous.toISOString().slice(0, currentMonth.length);
    if ([currentMonth, previousMonth].some(key => key.slice(0, 4) < firstMonth.slice(0, 4))) return null;
    if ([currentMonth, previousMonth].some(key => (value.withheld_months || []).some(withheld => withheld.startsWith(key)) || !coverage(value.statements, key, cards))) return null;
    if ((value.bank_outflows || []).some(row => row.card_statement_missing && cards.includes(row.card_id) && row.currency === currency && [currentMonth, previousMonth].some(key => row.date.startsWith(key)))) return null;
    const rows = key => value.transactions.filter(row => cards.includes(row.card_id) && row.date.startsWith(key) && row.currency === currency && ['purchase', 'tax', 'fee', 'refund'].includes(row.kind));
    const currentRows = rows(currentMonth), previousRows = rows(previousMonth);
    const current = sum(currentRows), prior = sum(previousRows);
    const differences = field => {
      const groups = new Map();
      for (const [entries, direction] of [[currentRows, 1n], [previousRows, -1n]]) entries.forEach(row => {
        const label = field === 'category' ? row.category || 'other' : row.merchant || row.description || 'other';
        const key = field === 'category' ? label : clean(label).replace(/[_*\s]+/g, ' ').trim();
        if (!groups.has(key)) groups.set(key, {key, label, delta: 0n});
        groups.get(key).delta += direction * decimal(row.amount);
      });
      const magnitude = value => value < 0n ? -value : value;
      return [...groups.values()].filter(item => item.delta !== 0n).sort((first, second) => magnitude(first.delta) > magnitude(second.delta) ? -1 : magnitude(first.delta) < magnitude(second.delta) ? 1 : first.key.localeCompare(second.key));
    };
    return {current, prior, delta: current - prior, previousMonth, categories: differences('category'), merchants: differences('merchant')};
  }
  function matching(rows) {
    const term = clean(query.trim());
    return rows.filter(row => clean(`${row.merchant || ''} ${row.description} ${categoryName(row.category)}`).includes(term));
  }
  function transactionRows(rows) {
    const sorted = [...rows].sort((first, second) => second.date.localeCompare(first.date) || first.id.localeCompare(second.id));
    let day = '';
    return sorted.map(row => {
      const heading = day !== row.date ? `<h3 class="expense-day">${escapeHTML(dateLabel(row.date, true))}</h3>` : '';
      day = row.date;
      return `${heading}<button type="button" class="expense-transaction" data-expense-id="${escapeHTML(row.id)}"><span class="expense-symbol" data-category="${escapeHTML(labels[row.category] ? row.category : 'other')}">${icon(category(row.category)[2])}</span><span class="expense-row-name"><strong data-no-translate>${escapeHTML(row.merchant || row.description)}</strong><small>${escapeHTML(categoryName(row.category))}${row.kind === 'refund' ? ' \u00b7 ' + text('Devoluci\u00f3n', 'Refund') : ''}</small></span><strong class="expense-row-amount sensitive">${amount(decimal(row.amount))}</strong>${icon('chevron-right')}</button>`;
    }).join('');
  }
  function bindDetails(container, back = null) {
    container.querySelectorAll('[data-expense-id]').forEach(control => control.addEventListener('click', () => openDetail('expense', {transaction: control.dataset.expenseId, back}, control)));
    container.querySelectorAll('[data-expense-group]').forEach(control => control.addEventListener('click', () => selectGroup(control.dataset.expenseGroup)));
  }
  function updateCenter() {
    const rows = rowsFor(data());
    const selected = selection ? matching(rows).filter(row => (selection.mode === 'categories' ? row.category || 'other' : row.merchant || row.description) === selection.key) : rows;
    const estimated = selected.some(row => row.classification === 'unidentified');
    select('.expense-ring-center .caption').textContent = selection ? selection.mode === 'categories' ? categoryName(selection.key) : selection.key : estimated ? text(month.length === 4 ? 'Acumulado estimado' : 'Gasto estimado', month.length === 4 ? 'Estimated year total' : 'Estimated spending') : month.length === 4 ? text('Acumulado registrado', 'Recorded year total') : text('Gasto registrado', 'Recorded spending');
    select('#expense-total').innerHTML = headlineAmount(sum(selected));
    select('.expense-count').textContent = countLabel(selected.length);
    fitTotal();
  }
  function fitTotal() {
    const total = select('#expense-total');
    if (!total || !total.clientWidth) return;
    total.style.fontSize = '26px';
    for (let size = 25; total.scrollWidth > total.clientWidth && size >= 10; size--) total.style.fontSize = `${size}px`;
  }
  function resetGroup() {
    selection = null;
    updateCenter();
    paintChart();
    renderList();
  }
  function changeMonth(next) {
    const direction = next > month ? 1 : -1;
    month = next;
    query = '';
    selection = null;
    render(direction, true);
    icons();
  }
  function selectGroup(key, groupMode = mode, fromChart = false) {
    if (fromChart) {
      query = '';
      select('#expense-search').value = '';
      mode = groupMode;
      all('[data-expense-mode]').forEach(control => control.setAttribute('aria-pressed', String(control.dataset.expenseMode === mode)));
      select('.expense-views').style.setProperty('--index', ['categories', 'merchants', 'transactions'].indexOf(mode));
    }
    selection = selection?.key === key && selection.mode === groupMode ? null : {key, mode: groupMode};
    updateCenter();
    paintChart();
    renderList();
    if (!fromChart) all('[data-expense-group]').find(control => control.dataset.expenseGroup === key)?.focus({preventScroll: true});
    entranceAnimations.forEach(animation => animation.cancel());
    entranceAnimations = DexNative.reduced() ? [] : [select('.expense-ring-center').animate([
      {opacity: .65, transform: 'translateY(4px)'}, {opacity: 1, transform: 'translateY(0)'}
    ], {duration: 200, easing: 'ease-out'})];
  }
  function paintChart() {
    const canvas = select('#expense-ring');
    if (!canvas) return;
    const size = 264;
    const ratio = Math.min(devicePixelRatio || 1, 3);
    canvas.width = size * ratio;
    canvas.height = size * ratio;
    const context = canvas.getContext('2d');
    context.scale(ratio, ratio);
    const total = chartGroups.reduce((result, group) => result + (group.total > 0n ? group.total : 0n), 0n);
    const track = getComputedStyle(document.documentElement).getPropertyValue('--fill-2').trim();
      context.clearRect(0, 0, size, size);
      context.lineWidth = 17;
      context.lineCap = 'round';
      context.strokeStyle = track;
      context.beginPath(); context.arc(132, 132, 116, 0, Math.PI * 2); context.stroke();
      let cursor = -Math.PI / 2;
      if (!hiddenAmounts && total > 0n) chartGroups.forEach(group => {
        if (group.total <= 0n) return;
        const share = Number(group.total * 1000000n / total) / 1000000;
        const angle = share * Math.PI * 2;
        const gap = Math.min(.055, angle * .18);
        const sweep = angle - gap;
        if (sweep > .002) {
          context.globalAlpha = selection?.mode === 'categories' && selection.key !== group.key ? .22 : 1;
          context.strokeStyle = category(group.key)[3];
          context.lineWidth = 17;
          context.lineCap = 'butt';
          context.beginPath(); context.arc(132, 132, 116, cursor + gap / 2, cursor + gap / 2 + sweep); context.stroke();
        }
        cursor += angle;
      });
    context.globalAlpha = 1;
    canvas.onclick = event => {
      if (hiddenAmounts || total <= 0n) return;
      const bounds = canvas.getBoundingClientRect();
      const horizontal = (event.clientX - bounds.left) * size / bounds.width - 132;
      const vertical = (event.clientY - bounds.top) * size / bounds.height - 132;
      const radius = Math.hypot(horizontal, vertical);
      if (radius < 96 || radius > 132) return;
      const angle = (Math.atan2(vertical, horizontal) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
      let cursor = 0;
      const group = chartGroups.filter(item => item.total > 0n).find(item => {
        cursor += Number(item.total * 1000000n / total) / 1000000 * Math.PI * 2;
        return angle <= cursor;
      });
      if (group) selectGroup(group.key, 'categories', true);
    };
  }
  function enter(direction = 0, summary = true) {
    paintMonthly();
    entranceAnimations.forEach(animation => animation.cancel());
    entranceAnimations = [];
    fitTotal();
    if (summary) paintChart();
    if (DexNative.reduced() || select('#gastos').hidden) return;
    const elements = [...(summary ? [select('.expense-ring-center')] : []), ...all('#expense-results .expense-category, #expense-results .expense-transaction').slice(0, 4)].filter(Boolean);
    entranceAnimations = elements.map((element, index) => element.animate([
      {opacity: 0, transform: `translate(${direction * 12}px, ${index ? 10 : 4}px)`},
      {opacity: 1, transform: 'translate(0, 0)'}
    ], {duration: 460, delay: index * 45, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'backwards'}));
  }
  function renderList(value = data()) {
    const container = select('#expense-results');
    if (!container) return;
    const root = select('#expenses-content');
    const nextLayout = JSON.stringify([month, denomination, mode, I18n.language]);
    if (nextLayout !== layoutKey) {
      root.style.minHeight = '';
      layoutKey = nextLayout;
    }
    const rows = matching(rowsFor(value));
    if (!rows.length) {
      container.innerHTML = `<div class="empty">${icon(query ? 'search' : 'receipt-text')}<strong>${text(!selectedSources(value).length ? 'Sin tarjetas seleccionadas' : query ? 'Sin coincidencias' : 'Sin movimientos registrados', !selectedSources(value).length ? 'No cards selected' : query ? 'No matches' : 'No recorded transactions')}</strong><span>${escapeHTML(monthName(month))} \u00b7 ${denomination}</span></div>`;
    } else if (mode === 'transactions') {
      container.innerHTML = `<div class="expense-result-count">${countLabel(rows.length)}<strong class="sensitive">${amount(sum(rows))}</strong></div>${transactionRows(rows)}`;
    } else {
      const groups = grouped(rows, mode);
      const positive = groups.reduce((total, group) => total + (group.total > 0n ? group.total : 0n), 0n);
      container.innerHTML = `<div class="expense-result-count">${mode === 'categories' ? text('En qu\u00e9 se fue', 'Where it went') : text('Tus comercios', 'Your merchants')}<span>${text('Mayor gasto primero', 'Highest spend first')}</span></div><div class="expense-groups">${groups.map(group => {
        const key = mode === 'categories' ? group.key : group.rows[0].category;
        const name = mode === 'categories' ? categoryName(key) : group.key;
        const percent = positive && group.total > 0n ? Number(group.total * 1000n / positive) / 10 : 0;
        const selected = selection?.key === group.key && selection.mode === mode;
        return `<button type="button" class="expense-category" data-category="${escapeHTML(labels[key] ? key : 'other')}" data-expense-group="${escapeHTML(group.key)}" aria-expanded="${selected}"><span class="expense-symbol">${icon(category(key)[2])}</span><span class="expense-row-name"><strong data-no-translate>${escapeHTML(name)}</strong><small>${countLabel(group.rows.length)}</small></span><span class="expense-category-value"><strong class="sensitive">${amount(group.total)}</strong><small>${hiddenAmounts ? '' : percent.toLocaleString(I18n.locale) + '%'}</small></span>${icon(selected ? 'chevron-up' : 'chevron-down')}<span class="expense-track" aria-hidden="true"><span></span></span></button>${selected ? `<div class="expense-group-transactions">${transactionRows(group.rows)}</div>` : ''}`;
      }).join('')}</div>`;
      container.querySelectorAll('.expense-track>span').forEach((bar, index) => {
        const total = groups[index].total;
        bar.style.width = hiddenAmounts || positive === 0n || total <= 0n ? '0%' : `${Number(total * 10000n / positive) / 100}%`;
      });
    }
    bindDetails(container);
    icons();
  }
  function render(direction = 0, animate = false) {
    const root = select('#expenses-content');
    let value;
    try { value = data(); } catch {
      root.innerHTML = `<div class="empty">${icon('circle-alert')}${text('Gastos no disponibles', 'Expenses unavailable')}</div>`;
      return;
    }
    select('#expenses-heading').textContent = text('Gastos', 'Spending');
    select('#gastos').dataset.title = text('Gastos', 'Spending');
    const availableMonths = months(value);
    const available = month.length === 4 ? [...new Set(availableMonths.map(key => key.slice(0, 4)))] : availableMonths;
    const cards = cardsFor(value);
    selectedCards = cards.filter(card => selectedCards.includes(card.id)).map(card => card.id);
    if (!cardsInitialized && cards.length) {
      selectedCards = cards.map(card => card.id);
      cardsInitialized = true;
    }
    if (!available.length) {
      renderKey = '';
      selection = null;
      root.innerHTML = `<div class="expense-empty empty">${icon('receipt-text')}<h2>${text('Todav\u00eda no hay estados de tarjeta', 'No card statements yet')}</h2><p>${text('Sin movimientos registrados', 'No recorded transactions')}</p></div>`;
      return;
    }
    if (!available.includes(month)) {
      const previous = new Date();
      previous.setUTCDate(1); previous.setUTCMonth(previous.getUTCMonth() - 1);
      month = available.includes(previous.toISOString().slice(0, 7)) ? previous.toISOString().slice(0, 7) : available.at(-1);
    }
    const nextKey = JSON.stringify([value, month, denomination, selectedCards, sourceScope, snapshot?.total_usd?.fx, hiddenAmounts, I18n.language, getComputedStyle(document.documentElement).getPropertyValue('--fill-2')]);
    if (nextKey === renderKey && select('#expense-ring')) return;
    renderKey = nextKey;
    entranceAnimations.forEach(animation => animation.cancel());
    entranceAnimations = [];
    const rows = rowsFor(value);
    const sources = selectedSources(value);
    const statements = value.statements.filter(statement => sources.includes(statement.card_id) && statement.start.slice(0, month.length) <= month && statement.end.slice(0, month.length) >= month);
    const covered = coverage(statements, month, sources) && !bankRows(value).some(row => row.card_statement_missing);
    const taxes = sum(rows.filter(row => ['tax', 'fee'].includes(row.kind)));
    const refunds = sum(rows.filter(row => row.kind === 'refund'));
    const position = available.indexOf(month);
    root.innerHTML = `<div class="expense-month-control">${button(text('Mes anterior', 'Previous month'), 'chevron-left', `data-expense-step="-1" ${position === 0 ? 'disabled' : ''}`)}<button type="button" class="expense-month" id="expense-month" data-month="${month}" aria-haspopup="dialog" aria-label="${text('Mes de gastos', 'Spending month')}: ${escapeHTML(monthName(month))}"><span>${escapeHTML(monthName(month))}</span>${icon('chevron-down')}</button>${button(text('Mes siguiente', 'Next month'), 'chevron-right', `data-expense-step="1" ${position === available.length - 1 ? 'disabled' : ''}`)}</div><div class="expense-card-rail" role="group" aria-label="${text('Tarjetas de cr\u00e9dito', 'Credit cards')}">${cards.map((card, index) => cardMarkup(card, index, value)).join('')}</div>
      <section class="expense-overview" aria-label="${text('Resumen del periodo', 'Period overview')}"><div class="expense-ring-wrap"><canvas id="expense-ring" width="264" height="264" role="img" aria-label="${text(hiddenAmounts ? 'Importes ocultos' : 'Gastos por categor\u00eda', hiddenAmounts ? 'Amounts hidden' : 'Spending by category')}"></canvas><div class="expense-ring-center"><button type="button" id="expense-reset" aria-label="${text('Mostrar total del periodo', 'Show period total')}" title="${text('Mostrar total del periodo', 'Show period total')}"><span class="caption">${text('Gasto registrado', 'Recorded spending')}</span><span id="expense-total" class="sensitive">${headlineAmount(sum(rows))}</span><span class="expense-count">${countLabel(rows.length)}</span></button><div class="segmented expense-currency" role="group" aria-label="${text('Moneda de gastos', 'Spending currency')}">${['CRC', 'USD'].map(unit => `<button type="button" data-expense-currency="${unit}" aria-pressed="${unit === denomination}">${unit}</button>`).join('')}</div></div></div><div class="expense-meta"><span class="expense-source">${escapeHTML([...new Set(statements.map(statement => statement.issuer))].join(' \u00b7 ') || text('Sin informe', 'No statement'))}</span><button type="button" class="expense-coverage" id="expense-coverage" ${sources.length ? '' : 'disabled'}>${icon(covered ? 'calendar-check' : 'circle-alert')}${text(!sources.length ? 'Sin selecci\u00f3n' : covered ? 'Per\u00edodo cubierto' : month.length === 4 ? 'A\u00f1o parcial' : 'Mes parcial', !sources.length ? 'No selection' : covered ? 'Period covered' : month.length === 4 ? 'Partial year' : 'Partial month')}${icon('chevron-right')}</button></div><div class="expense-breakdown">${taxes ? `<span>${text('IVA y cargos', 'Tax & fees')}<strong>${amount(taxes)}</strong></span>` : ''}${refunds ? `<span>${text('Devoluciones', 'Refunds')}<strong>${amount(refunds)}</strong></span>` : ''}</div></section>
      <div class="expense-browser"><div class="expense-views" role="group" aria-label="${text('Agrupar gastos', 'Group expenses')}">${[['categories', text('Categor\u00edas', 'Categories')], ['merchants', text('Comercios', 'Merchants')], ['transactions', text('Movimientos', 'Transactions')]].map(([key, label]) => `<button type="button" data-expense-mode="${key}" aria-pressed="${mode === key}">${label}</button>`).join('')}</div>${button(text('Buscar gastos', 'Search spending'), 'search', `id="expense-search-toggle" aria-expanded="${searching}" aria-controls="expense-search-box"`)}</div>
      <label id="expense-search-box" class="search expense-search" ${searching ? '' : 'hidden'}>${icon('search')}<input id="expense-search" type="search" autocomplete="off" enterkeyhint="search" placeholder="${text('Buscar comercio o movimiento', 'Search merchant or transaction')}" aria-label="${text('Buscar gastos', 'Search spending')}" value="${escapeHTML(query)}"></label><div class="expense-ledger" role="region" aria-label="${text('Detalle de gastos', 'Spending details')}"><div class="expense-analysis"><button type="button" id="expense-compare" ${sources.length ? '' : 'disabled'}>${icon('chart-no-axes-combined')}${text('Comparar', 'Compare')}</button><button type="button" id="expense-recurring" ${sources.length ? '' : 'disabled'}>${icon('repeat')}${text('Recurrentes', 'Recurring')}</button></div>${reviewMarkup(value)}<div id="expense-results"></div></div>`;
    if ((value.bank_accounts || []).length) {
      select('.expense-month-control').insertAdjacentHTML('afterend', `<div class="segmented expense-origins" role="group" aria-label="${text('Origen de gastos', 'Spending source')}">${[['all', text('Todo', 'All')], ['cards', text('Tarjetas', 'Cards')], ['bank', text('Transferencias', 'Transfers')]].map(([key, label]) => `<button type="button" data-expense-origin="${key}" aria-pressed="${sourceScope === key}">${label}</button>`).join('')}</div>`);
      select('.expense-origins').style.setProperty('--index', ['all', 'cards', 'bank'].indexOf(sourceScope));
      all('[data-expense-origin]').forEach(control => control.addEventListener('click', () => {
        root.style.minHeight = `${root.getBoundingClientRect().height}px`;
        sourceScope = control.dataset.expenseOrigin;
        selection = null;
        query = '';
        render();
        icons();
        select(`[data-expense-origin="${sourceScope}"]`).focus({preventScroll: true});
      }));
      all('[data-expense-card]').forEach(control => { control.disabled = sourceScope === 'bank'; });
    }
    select('.expense-overview').insertAdjacentHTML('afterend', `<section id="expense-monthly" class="expense-monthly" aria-label="${text('Gastos mensuales', 'Monthly spending')}"></section>`);
    renderMonthly(value);
    const unknown = bankRows(value).filter(row => row.classification === 'unidentified');
    if (unknown.length) select('.expense-ledger').insertAdjacentHTML('afterbegin', `<button type="button" id="expense-unidentified" class="expense-unidentified">${icon('circle-help')}<span>${unknown.length} ${text('por confirmar', 'unconfirmed')}</span><strong class="sensitive">${amount(sum(unknown))}</strong>${icon('chevron-right')}</button>`);
    if (select('#expense-unidentified')) select('#expense-unidentified').addEventListener('click', event => openDetail('expense', {coverage: true}, event.currentTarget));
    all('[data-expense-card]').forEach(control => control.addEventListener('click', () => {
      const card = control.dataset.expenseCard;
      root.style.minHeight = `${root.getBoundingClientRect().height}px`;
      selectedCards = selectedCards.includes(card) ? selectedCards.filter(id => id !== card) : [...selectedCards, card];
      selection = null;
      query = '';
      render();
      icons();
      all('[data-expense-card]').find(item => item.dataset.expenseCard === card)?.focus({preventScroll: true});
    }));
    if (select('#expense-reviews')) bindDetails(select('#expense-reviews'));
    chartGroups = grouped(rows, 'categories');
    select('#expense-month').addEventListener('click', event => openDetail('expense', {months: true}, event.currentTarget));
    all('[data-expense-step]').forEach(control => control.addEventListener('click', () => { const direction = Number(control.dataset.expenseStep); changeMonth(available[position + direction]); select(`[data-expense-step="${direction}"]`).focus({preventScroll: true}); }));
    all('[data-expense-currency]').forEach(control => control.addEventListener('click', () => { if (denomination === control.dataset.expenseCurrency) return; denomination = control.dataset.expenseCurrency; selection = null; render(0, true); icons(); select(`[data-expense-currency="${denomination}"]`).focus({preventScroll: true}); }));
    all('[data-expense-mode]').forEach(control => control.addEventListener('click', () => {
      mode = control.dataset.expenseMode;
      selection = null;
      updateCenter();
      paintChart();
      all('[data-expense-mode]').forEach(item => item.setAttribute('aria-pressed', String(item === control)));
      select('.expense-views').style.setProperty('--index', ['categories', 'merchants', 'transactions'].indexOf(mode));
      renderList(value);
      enter(0, false);
    }));
    select('.expense-currency').style.setProperty('--index', denomination === 'USD' ? 1 : 0);
    select('.expense-views').style.setProperty('--index', ['categories', 'merchants', 'transactions'].indexOf(mode));
    select('#expense-search').addEventListener('input', event => { query = event.target.value; selection = null; updateCenter(); paintChart(); renderList(); });
    select('#expense-search-toggle').addEventListener('click', () => {
      searching = !searching;
      select('#expense-search-box').hidden = !searching;
      select('#expense-search-toggle').setAttribute('aria-expanded', String(searching));
      if (searching) select('#expense-search').focus();
      else { query = ''; selection = null; select('#expense-search').value = ''; updateCenter(); paintChart(); renderList(); }
    });
    select('#expense-coverage').addEventListener('click', event => openDetail('expense', {coverage: true}, event.currentTarget));
    select('#expense-reset').addEventListener('click', resetGroup);
    select('#expense-compare').addEventListener('click', event => openDetail('expense', {compare: true}, event.currentTarget));
    select('#expense-recurring').addEventListener('click', event => openDetail('expense', {recurring: true}, event.currentTarget));
    renderList(value);
    updateCenter();
    fitTotal();
    document.fonts.ready.then(fitTotal);
    if (animate && !select('#gastos').hidden) enter(direction);
    else paintChart();
  }
  function coverage(statements, selectedMonth, cards = [...new Set(statements.map(item => item.card_id))]) {
    if (!statements.length) return false;
    const first = selectedMonth + (selectedMonth.length === 4 ? '-01-01' : '-01');
    const last = selectedMonth.length === 4 ? selectedMonth + '-12-31' : selectedMonth + '-' + new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5)), 0).getDate();
    return cards.length > 0 && cards.every(card => {
      let cursor = first;
      for (const statement of statements.filter(item => item.card_id === card).sort((start, end) => start.start.localeCompare(end.start))) {
        if (statement.start > cursor) return false;
        if (statement.end >= last) return true;
        if (statement.end >= cursor) cursor = new Date(Date.parse(statement.end + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
      }
      return false;
    });
  }
  function detail(selection) {
    const value = data();
    const container = select('#detail-content');
    select('#detail-eyebrow').textContent = text('GASTOS', 'SPENDING');
    if (selection.months) {
      const available = months(value);
      const options = [...new Set(available.map(key => key.slice(0, 4)))].reverse().flatMap(year => [year, ...available.filter(key => key.startsWith(year)).reverse()]);
      container.innerHTML = `<div class="detail-heading"><h2 id="detail-title">${text('Periodo de gastos', 'Spending period')}</h2></div><div class="expense-month-options">${options.map(key => `<button type="button" class="expense-month-choice" data-expense-month-option="${key}" aria-pressed="${key === month}">${escapeHTML(monthName(key))}${key.length === 4 ? ` <span class="subtle">\u00b7 ${text('Acumulado', 'Year total')}</span>` : ''}</button>`).join('')}</div>`;
      container.querySelectorAll('[data-expense-month-option]').forEach(control => control.addEventListener('click', () => {
        closeDetail();
        changeMonth(control.dataset.expenseMonthOption);
        select('#expense-month').focus({preventScroll: true});
      }));
    } else if (selection.compare) {
      const comparison = compareMonths(value, month, denomination, selectedSources(value));
      container.innerHTML = `<div class="detail-heading"><h2 id="detail-title">${month.length === 4 ? text('A\u00f1o a a\u00f1o', 'Year to year') : text('Mes a mes', 'Month to month')}</h2></div>${comparison ? `<p class="subtle">${text('Periodos completos, mismas fuentes', 'Complete periods, same sources')} \u00b7 ${denomination}</p>${line(escapeHTML(monthName(comparison.previousMonth)), amount(comparison.prior))}${line(escapeHTML(monthName(month)), amount(comparison.current))}${line(text('Diferencia de gasto', 'Spending difference'), amount(comparison.delta))}${comparison.prior > 0n ? line(text('Variaci\u00f3n', 'Change'), hiddenAmounts ? '\u2022\u2022\u2022\u2022' : (Number(comparison.delta * 1000n / comparison.prior) / 10).toLocaleString(I18n.locale) + '%') : ''}` : `<p class="subtle">${text('Falta cobertura del periodo actual o del anterior para las mismas fuentes. No se comparan periodos incompletos.', 'Complete coverage is missing in the current or previous period for the same sources. Incomplete periods are not compared.')}</p>`}`;
      if (comparison) {
        const leading = comparison.categories.slice(0, 3);
        const remainder = comparison.delta - leading.reduce((total, item) => total + item.delta, 0n);
        const deltaLabel = delta => `${delta > 0n && !hiddenAmounts ? '+' : ''}${amount(delta)}`;
        container.insertAdjacentHTML('beforeend', `<section class="expense-explanation"><h3>${text('Qu\u00e9 cambi\u00f3', 'What changed')}</h3>${leading.map(item => line(escapeHTML(categoryName(item.key)), deltaLabel(item.delta))).join('')}${remainder ? line(text('Otros cambios', 'Other changes'), deltaLabel(remainder)) : ''}${!comparison.categories.length ? `<p class="subtle">${text('Sin cambios por categor\u00eda.', 'No category changes.')}</p>` : ''}<details class="expense-insight"><summary><span>${text('Por comercio', 'By merchant')}</span>${icon('chevron-down')}</summary>${comparison.merchants.map(item => line(escapeHTML(item.label), deltaLabel(item.delta))).join('')}</details></section>`);
      }
    } else if (selection.recurring) {
      const items = (value.insights || []).filter(item => item.kind === 'recurring_payment' && item.date.startsWith(month) && item.currency === denomination && selectedSources(value).includes(item.card_id));
      container.innerHTML = `<div class="detail-heading"><h2 id="detail-title">${text('Posibles recurrentes', 'Possible recurring payments')}</h2></div><p class="subtle">${escapeHTML(monthName(month))} \u00b7 ${denomination}</p><p class="subtle">${text('Tres meses completos con un cargo mensual. El patr\u00f3n no confirma una suscripci\u00f3n.', 'Three complete months with one monthly charge. This pattern does not confirm a subscription.')}</p>${items.length ? items.map(item => `<details class="expense-insight"><summary><span><strong data-no-translate>${escapeHTML(item.merchant)}</strong><small>${escapeHTML(cardName(cardsFor(value).find(card => card.id === item.card_id)))}</small></span><strong class="sensitive">${money(item.amount, item.currency)}</strong>${icon('chevron-down')}</summary>${line(text('Cambio mensual', 'Monthly change'), money(item.change, item.currency))}${transactionRows(value.transactions.filter(row => item.transaction_ids.includes(row.id)))}</details>`).join('') : `<div class="empty"><strong>${text('Sin patrones suficientes', 'Not enough evidence')}</strong></div>`}`;
      bindDetails(container, selection);
    } else if (selection.coverage) {
      const sources = selectedSources(value);
      const statements = value.statements.filter(statement => sources.includes(statement.card_id) && statement.start.slice(0, month.length) <= month && statement.end.slice(0, month.length) >= month);
      const periods = month.length === 4 ? Array.from({length: 12}, (_, index) => month + '-' + String(index + 1).padStart(2, '0')) : [];
      container.innerHTML = `<div class="detail-heading"><h2 id="detail-title">${escapeHTML(monthName(month))}</h2></div><p class="subtle">${text('Cobertura de los estados recibidos. Incluye salidas pendientes de identificar como gasto estimado. No incluye efectivo ni se estiman meses faltantes.', 'Coverage of received statements. Unidentified outflows are included as estimated spending. Excludes cash and does not estimate missing months.')}</p>${periods.length ? `<div class="expense-year-coverage">${periods.map(key => { const complete = coverage(statements, key, sources) && !bankRows(value).some(row => row.card_statement_missing && row.date.startsWith(key)); return line(escapeHTML(monthName(key)), text((value.withheld_months || []).includes(key) ? 'Pendiente' : complete ? 'Completo' : statements.some(item => item.start.slice(0, 7) <= key && item.end.slice(0, 7) >= key) ? 'Parcial' : 'Sin cobertura', (value.withheld_months || []).includes(key) ? 'Pending' : complete ? 'Complete' : statements.some(item => item.start.slice(0, 7) <= key && item.end.slice(0, 7) >= key) ? 'Partial' : 'No coverage')); }).join('')}</div>` : statements.map(statement => `<div class="expense-statement"><img src="./${statement.source === 'multimoney' ? 'brand-multimoney.svg' : 'brand-bac.svg'}" width="36" height="36" alt=""><div><strong data-no-translate>${escapeHTML(sourceName(value, statement.card_id))}</strong><p>${escapeHTML(dateLabel(statement.start))} \u2013 ${escapeHTML(dateLabel(statement.end, true))}</p></div></div>`).join('')}${bankBreakdown(value)}`;
      bindDetails(container, selection);
    } else if (selection.transaction) {
      const row = value.transactions.find(item => item.id === selection.transaction) || (value.bank_outflows || []).find(item => item.id === selection.transaction);
      if (!row) { closeDetail(); return; }
      const statement = value.statements.find(item => item.id === row.statement_id);
      container.innerHTML = `<div class="detail-heading"><h2 id="detail-title" data-no-translate>${escapeHTML(row.merchant || row.description)}</h2></div><div class="expense-detail-total sensitive">${money(row.amount, row.currency)}</div>${row.classification === 'unidentified' ? `<p class="subtle">${text('Incluido en el gasto estimado. Destino o prop\u00f3sito por confirmar.', 'Included in estimated spending. Destination or purpose unconfirmed.')}</p>` : ''}${line(text('Fecha', 'Date'), escapeHTML(dateLabel(row.date, true)))}${line(row.source === 'bank' ? text('Cuenta', 'Account') : text('Tarjeta', 'Card'), escapeHTML(sourceName(value, row.card_id)))}${line(text('Categor\u00eda sugerida', 'Suggested category'), escapeHTML(categoryName(row.category)))}${line(text('Moneda', 'Currency'), row.currency)}${line(text('Origen', 'Source'), escapeHTML(statement?.issuer || 'BAC'))}<div class="expense-original"><span class="caption">${text('Descripci\u00f3n del estado', 'Statement description')}</span><p data-no-translate>${escapeHTML(row.description)}</p></div>`;
      if (selection.back) {
        container.insertAdjacentHTML('afterbegin', button(text('Volver', 'Back'), 'chevron-left', 'id="expense-back"'));
        select('#expense-back').addEventListener('click', event => openDetail('expense', selection.back, event.currentTarget));
      }
    } else {
      const rows = (selection.unfiltered ? rowsFor(value) : matching(rowsFor(value))).filter(row => (selection.mode === 'categories' ? row.category || 'other' : row.merchant || row.description) === selection.group);
      const name = selection.mode === 'categories' ? categoryName(selection.group) : selection.group;
      container.innerHTML = `<div class="detail-heading"><h2 id="detail-title" data-no-translate>${escapeHTML(name)}</h2></div><p class="subtle">${escapeHTML(monthName(month))} \u00b7 ${denomination}</p><div class="expense-detail-total sensitive">${amount(sum(rows))}</div>${transactionRows(rows)}`;
      bindDetails(container, selection);
    }
  }
  window.addEventListener('resize', () => {
    if (innerWidth !== layoutWidth) {
      const root = select('#expenses-content');
      if (root) root.style.minHeight = '';
      layoutWidth = innerWidth;
    }
    fitTotal();
    paintMonthly();
  });
  return {render, detail, grouped, coverage, months, compareMonths, monthlySeries, enter};
})();