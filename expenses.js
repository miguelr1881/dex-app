'use strict';

const DexExpenses = (() => {
  let month = '';
  let denomination = 'CRC';
  let mode = 'categories';
  let query = '';
  let searching = false;
  let chartGroups = [];
  let entranceAnimations = [];
  let selection = null;
  let selectedCards = [];
  let renderKey = '';
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
  const monthName = key => new Intl.DateTimeFormat(I18n.locale, {month: 'long', year: 'numeric', timeZone: 'UTC'}).format(new Date(key + '-01T12:00:00Z'));
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
    let cursor = keys[0];
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
      'bac-lifemiles-visa-black': {name: 'BAC LifeMiles Black Visa', image: 'card-bac-lifemiles.png'},
      'bac-amex-blue': {name: 'BAC Blue American Express', image: 'card-bac-amex-blue.png'}
    })[card.product] || null;
  }
  function cardMarkup(card, index, value) {
    const product = cardProduct(card);
    const selected = selectedCards.includes(card.id);
    const label = (product?.name || card.issuer || text('Tarjeta', 'Card')) + ' ' + cardName(card, index);
    return `<button type="button" class="expense-card" data-expense-card="${escapeHTML(card.id)}" aria-pressed="${selected}" aria-disabled="${selectedCards.length === 1 && selected}" aria-label="${escapeHTML(label)}" title="${escapeHTML(label)}"><span class="expense-card-surface">${product ? `<img class="expense-card-art" src="./${product.image}" width="557" height="352" alt="" draggable="false">` : `<span class="expense-card-fallback"><img src="./brand-bac.svg" width="32" height="32" alt="BAC"></span>`}</span><span class="expense-card-meta"><span data-no-translate>${escapeHTML(cardName(card, index))}</span><span class="expense-card-check" aria-hidden="true">${icon('check')}</span></span><strong class="sensitive">${amount(sum(rowsFor(value, card.id)))}</strong></button>`;
  }
  function cardName(card, index = 0) {
    return card?.last4 ? '\u2022\u2022 ' + card.last4 : text('Tarjeta ', 'Card ') + (index + 1);
  }
  function rowsFor(value, card = null) {
    return value.transactions.filter(row => (card ? row.card_id === card : selectedCards.includes(row.card_id)) && row.date.startsWith(month) && row.currency === denomination && ['purchase', 'tax', 'fee', 'refund'].includes(row.kind));
  }
  function reviewMarkup(value) {
    const insights = (value.insights || []).filter(item => item.date.startsWith(month) && item.currency === denomination && selectedCards.includes(item.card_id));
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
    select('.expense-ring-center .caption').textContent = selection ? selection.mode === 'categories' ? categoryName(selection.key) : selection.key : text('Gasto registrado', 'Recorded spending');
    select('#expense-total').innerHTML = headlineAmount(sum(selected));
    select('.expense-count').textContent = countLabel(selected.length);
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
    entranceAnimations.forEach(animation => animation.cancel());
    entranceAnimations = [];
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
    const rows = matching(rowsFor(value));
    if (!rows.length) {
      container.innerHTML = `<div class="empty">${icon(query ? 'search' : 'receipt-text')}<strong>${text(query ? 'Sin coincidencias' : 'Sin movimientos registrados', query ? 'No matches' : 'No recorded transactions')}</strong><span>${escapeHTML(monthName(month))} \u00b7 ${denomination}</span></div>`;
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
    const available = months(value);
    const cards = cardsFor(value);
    selectedCards = cards.filter(card => selectedCards.includes(card.id)).map(card => card.id);
    if (!selectedCards.length) selectedCards = cards.map(card => card.id);
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
    const nextKey = JSON.stringify([value, month, denomination, selectedCards, hiddenAmounts, I18n.language, getComputedStyle(document.documentElement).getPropertyValue('--fill-2')]);
    if (nextKey === renderKey && select('#expense-ring')) return;
    renderKey = nextKey;
    entranceAnimations.forEach(animation => animation.cancel());
    entranceAnimations = [];
    const rows = rowsFor(value);
    const statements = value.statements.filter(statement => selectedCards.includes(statement.card_id) && statement.start.slice(0, 7) <= month && statement.end.slice(0, 7) >= month);
    const covered = coverage(statements, month, selectedCards);
    const taxes = sum(rows.filter(row => ['tax', 'fee'].includes(row.kind)));
    const refunds = sum(rows.filter(row => row.kind === 'refund'));
    const position = available.indexOf(month);
    root.innerHTML = `<div class="expense-card-rail" role="group" aria-label="${text('Tarjetas de cr\u00e9dito', 'Credit cards')}">${cards.map((card, index) => cardMarkup(card, index, value)).join('')}</div><div class="expense-month-control">${button(text('Mes anterior', 'Previous month'), 'chevron-left', `data-expense-step="-1" ${position === 0 ? 'disabled' : ''}`)}<label class="expense-month"><span class="sr-only">${text('Mes de gastos', 'Spending month')}</span><select id="expense-month" aria-label="${text('Mes de gastos', 'Spending month')}">${available.map(key => `<option value="${key}" ${key === month ? 'selected' : ''}>${escapeHTML(monthName(key))}</option>`).join('')}</select>${icon('chevron-down')}</label>${button(text('Mes siguiente', 'Next month'), 'chevron-right', `data-expense-step="1" ${position === available.length - 1 ? 'disabled' : ''}`)}</div>
      <section class="expense-overview" aria-label="${text('Resumen del mes', 'Monthly overview')}"><div class="expense-ring-wrap"><canvas id="expense-ring" width="264" height="264" role="img" aria-label="${text(hiddenAmounts ? 'Importes ocultos' : 'Gastos por categor\u00eda', hiddenAmounts ? 'Amounts hidden' : 'Spending by category')}"></canvas><div class="expense-ring-center"><span class="caption">${text('Gasto registrado', 'Recorded spending')}</span><div id="expense-total" class="sensitive">${rows.length || covered ? headlineAmount(sum(rows)) : '\u2014'}</div><span class="expense-count">${countLabel(rows.length)}</span><div class="segmented expense-currency" role="group" aria-label="${text('Moneda de gastos', 'Spending currency')}">${['CRC', 'USD'].map(unit => `<button type="button" data-expense-currency="${unit}" aria-pressed="${unit === denomination}">${unit}</button>`).join('')}</div></div></div><div class="expense-meta"><span class="expense-source">${escapeHTML([...new Set(statements.map(statement => statement.issuer))].join(' \u00b7 ') || text('Sin informe', 'No statement'))}</span><button type="button" class="expense-coverage" id="expense-coverage">${icon(covered ? 'calendar-check' : 'circle-alert')}${text(covered ? 'Per\u00edodo cubierto' : 'Mes parcial', covered ? 'Period covered' : 'Partial month')}${icon('chevron-right')}</button></div>${taxes || refunds ? `<div class="expense-breakdown">${taxes ? `<span>${text('IVA y cargos', 'Tax & fees')}<strong>${amount(taxes)}</strong></span>` : ''}${refunds ? `<span>${text('Devoluciones', 'Refunds')}<strong>${amount(refunds)}</strong></span>` : ''}</div>` : ''}</section>
      <div class="expense-browser"><div class="expense-views" role="group" aria-label="${text('Agrupar gastos', 'Group expenses')}">${[['categories', text('Categor\u00edas', 'Categories')], ['merchants', text('Comercios', 'Merchants')], ['transactions', text('Movimientos', 'Transactions')]].map(([key, label]) => `<button type="button" data-expense-mode="${key}" aria-pressed="${mode === key}">${label}</button>`).join('')}</div>${button(text('Buscar gastos', 'Search spending'), 'search', `id="expense-search-toggle" aria-expanded="${searching}" aria-controls="expense-search-box"`)}</div>
      <label id="expense-search-box" class="search expense-search" ${searching ? '' : 'hidden'}>${icon('search')}<input id="expense-search" type="search" autocomplete="off" enterkeyhint="search" placeholder="${text('Buscar comercio o movimiento', 'Search merchant or transaction')}" aria-label="${text('Buscar gastos', 'Search spending')}" value="${escapeHTML(query)}"></label>${reviewMarkup(value)}<div id="expense-results"></div>`;
    all('[data-expense-card]').forEach(control => control.addEventListener('click', () => {
      const card = control.dataset.expenseCard;
      if (selectedCards.length === 1 && selectedCards.includes(card)) return;
      selectedCards = selectedCards.includes(card) ? selectedCards.filter(id => id !== card) : [...selectedCards, card];
      selection = null;
      query = '';
      render(0, true);
      icons();
      all('[data-expense-card]').find(item => item.dataset.expenseCard === card)?.focus({preventScroll: true});
    }));
    if (select('#expense-reviews')) bindDetails(select('#expense-reviews'));
    chartGroups = grouped(rows, 'categories');
    select('#expense-month').addEventListener('change', event => { const direction = event.target.value > month ? 1 : -1; month = event.target.value; query = ''; selection = null; render(direction, true); icons(); });
    all('[data-expense-step]').forEach(control => control.addEventListener('click', () => { const direction = Number(control.dataset.expenseStep); month = available[position + direction]; query = ''; selection = null; render(direction, true); icons(); select(`[data-expense-step="${direction}"]`).focus({preventScroll: true}); }));
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
    renderList(value);
    if (selection) updateCenter();
    if (animate && !select('#gastos').hidden) enter(direction);
    else paintChart();
  }
  function coverage(statements, selectedMonth, cards = [...new Set(statements.map(item => item.card_id))]) {
    if (!statements.length) return false;
    const first = selectedMonth + '-01';
    const last = selectedMonth + '-' + new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5)), 0).getDate();
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
    if (selection.coverage) {
      const statements = value.statements.filter(statement => selectedCards.includes(statement.card_id) && statement.start.slice(0, 7) <= month && statement.end.slice(0, 7) >= month);
      container.innerHTML = `<div class="detail-heading"><h2 id="detail-title">${escapeHTML(monthName(month))}</h2></div><p class="subtle">${text('Cobertura de los estados recibidos. No incluye otras tarjetas, efectivo ni compras pendientes de registrar.', 'Coverage of received statements. Excludes other cards, cash and purchases not yet posted.')}</p>${statements.map(statement => `<div class="expense-statement"><img src="./brand-bac.svg" width="36" height="36" alt=""><div><strong data-no-translate>${escapeHTML(statement.issuer)} \u00b7 ${escapeHTML(cardName(cardsFor(value).find(card => card.id === statement.card_id)))}</strong><p>${escapeHTML(dateLabel(statement.start))} \u2013 ${escapeHTML(dateLabel(statement.end, true))}</p></div></div>`).join('')}<p class="subtle">${text('Compras por fecha del movimiento. Los pagos de la tarjeta no se cuentan otra vez como gasto. Categor\u00edas sugeridas a partir del comercio.', 'Purchases by transaction date. Card payments are not counted again as spending. Categories are suggested from the merchant.')}</p>`;
    } else if (selection.transaction) {
      const row = value.transactions.find(item => item.id === selection.transaction);
      if (!row) { closeDetail(); return; }
      const statement = value.statements.find(item => item.id === row.statement_id);
      container.innerHTML = `<div class="detail-heading"><h2 id="detail-title" data-no-translate>${escapeHTML(row.merchant || row.description)}</h2></div><div class="expense-detail-total sensitive">${money(row.amount, row.currency)}</div>${line(text('Fecha', 'Date'), escapeHTML(dateLabel(row.date, true)))}${line(text('Tarjeta', 'Card'), escapeHTML(cardName(cardsFor(value).find(card => card.id === row.card_id))))}${line(text('Categor\u00eda sugerida', 'Suggested category'), escapeHTML(categoryName(row.category)))}${line(text('Moneda', 'Currency'), row.currency)}${line(text('Origen', 'Source'), escapeHTML(statement?.issuer || 'BAC'))}<div class="expense-original"><span class="caption">${text('Descripci\u00f3n del estado', 'Statement description')}</span><p data-no-translate>${escapeHTML(row.description)}</p></div>`;
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
  return {render, detail, grouped, coverage, months, enter};
})();