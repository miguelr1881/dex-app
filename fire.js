'use strict';

const DexFire = (() => {
  function validate(settings) {
    const limits = {age: [18, 100], retirementAge: [18, 100], pensionAge: [18, 100], monthlyExpense: [1, 1e8], annualReturn: [-.5, .3], inflation: [0, .2], withdrawal: [.01, .1], capital: [-1e12, 1e12], restricted: [0, 1e12], houseAge: [18, 100], houseCost: [0, 1e9], constructionMonths: [1, 60], downPayment: [0, 1], loanRate: [0, .3], loanYears: [1, 40], loanFees: [0, .2], loanInsurance: [0, .1]};
    for (const [name, [minimum, maximum]] of Object.entries(limits)) {
      if (!Number.isFinite(settings[name]) || settings[name] < minimum || settings[name] > maximum) throw new Error('Invalid FIRE setting: ' + name);
    }
    if (!Number.isInteger(settings.constructionMonths) || !Number.isInteger(settings.loanYears)) throw new Error('Invalid FIRE term');
    if (typeof settings.salaryPaysLoan !== 'boolean') throw new Error('Invalid payment source');
    if (!['base', 'cash', 'credit'].includes(settings.scenario)) throw new Error('Invalid FIRE scenario');
    if (settings.scenario !== 'base' && settings.houseAge < settings.age) throw new Error('House date is in the past');
    return settings;
  }

  function payment(principal, annualRate, months) {
    if (principal === 0) return 0;
    const rate = annualRate / 12;
    return rate === 0 ? principal / months : principal * rate / -Math.expm1(-months * Math.log1p(rate));
  }

  function calculate(options) {
    const settings = validate(options);
    const {age, capital, restricted, annualReturn, inflation, withdrawal, monthlyExpense} = settings;
    const growth = Math.pow((1 + annualReturn) / (1 + inflation), 1 / 12);
    const inflationMonthly = Math.pow(1 + inflation, 1 / 12);
    const retirementMonth = Math.max(0, Math.ceil((settings.retirementAge - age) * 12));
    const houseMonth = Math.max(1, Math.ceil((settings.houseAge - age) * 12));
    const loanMonths = settings.loanYears * 12;
    const horizon = Math.ceil((Math.min(120, Math.max(90, settings.retirementAge + 30, settings.houseAge + settings.loanYears + 1)) - age) * 12);
    const target = monthlyExpense * 12 / withdrawal;
    const principal = settings.scenario === 'credit' ? settings.houseCost * (1 - settings.downPayment) : 0;
    const installment = payment(principal, settings.loanRate, loanMonths);
    const insurance = principal * settings.loanInsurance / 12;
    const costs = Array.from({length: Math.max(horizon, houseMonth + loanMonths + settings.constructionMonths) + 1}, () => ({purchase: 0, mortgage: 0}));
    if (settings.scenario === 'cash') {
      for (let month = houseMonth; month < houseMonth + settings.constructionMonths; month++) costs[month].purchase = settings.houseCost / settings.constructionMonths;
    } else if (settings.scenario === 'credit') {
      costs[houseMonth].purchase = settings.houseCost * settings.downPayment + principal * settings.loanFees;
      for (let month = houseMonth; month < houseMonth + loanMonths; month++) costs[month].mortgage = installment + insurance;
    }
    const actualCosts = costs.map((cost, month) => (cost.purchase + (settings.salaryPaysLoan && month <= retirementMonth ? 0 : cost.mortgage)) / Math.pow(inflationMonthly, month));
    const allCosts = costs.map((cost, month) => (cost.purchase + cost.mortgage) / Math.pow(inflationMonthly, month));
    const presentCost = actualCosts.reduce((sum, amount, month) => sum + amount / Math.pow(growth, month), 0);
    const coastTarget = target / Math.pow(growth, retirementMonth) + presentCost;
    const remaining = Array(costs.length).fill(0);
    for (let month = costs.length - 2; month >= 0; month--) remaining[month] = (remaining[month + 1] + allCosts[month + 1]) / growth;
    const retirementReserve = actualCosts.reduce((sum, amount, month) => month > retirementMonth ? sum + amount / Math.pow(growth, month - retirementMonth) : sum, 0);
    let balance = capital;
    let workingBalance = capital;
    let firstShortfall = capital < 0 ? age : null;
    let fireAge = capital >= target + remaining[0] ? age : null;
    let atRetirement = retirementMonth === 0 ? capital : null;
    let debt = 0;
    const points = [{age, capital, restricted, target, debt: 0}];
    for (let month = 1; month <= horizon; month++) {
      const cost = costs[month];
      balance = Math.max(0, balance) * growth - actualCosts[month];
      workingBalance = workingBalance * growth - (cost.purchase + (settings.salaryPaysLoan ? 0 : cost.mortgage)) / Math.pow(inflationMonthly, month);
      if (month === retirementMonth) atRetirement = balance;
      if (month > retirementMonth) balance -= monthlyExpense;
      if (firstShortfall == null && balance < 0) firstShortfall = age + month / 12;
      if (fireAge == null && workingBalance >= target + remaining[month]) fireAge = age + month / 12;
      if (settings.scenario === 'credit' && month === houseMonth) debt = principal;
      if (debt > 0 && month >= houseMonth) debt = Math.max(0, debt * (1 + settings.loanRate / 12) - installment);
      points.push({age: age + month / 12, capital: balance, restricted: restricted * Math.pow(growth, month), target, debt: debt / Math.pow(inflationMonthly, month)});
    }
    const atPension = points[Math.min(horizon, Math.max(0, Math.ceil((settings.pensionAge - age) * 12)))];
    return {points, target, coastTarget, coastReached: capital >= coastTarget, fireAge, atRetirement, retirementTarget: target + retirementReserve,
      firstShortfall, installment, insurance, principal, totalInterest: installment * loanMonths - principal,
      totalLoanCost: (installment + insurance) * loanMonths + principal * settings.loanFees - principal,
      salaryCondition: settings.scenario === 'credit' && principal > 0 && settings.salaryPaysLoan && retirementMonth >= houseMonth,
      pensionCapital: atPension.restricted, houseMonth, retirementMonth};
  }

  const defaults = {birthDate: '', retirementAge: 50, pensionAge: 65, annualReturn: .08, inflation: .03, withdrawal: .04,
    baseExpense: null, houseExpense: null, houseAge: 35, houseCost: null, constructionMonths: 12,
    downPayment: .2, loanRate: .07, loanYears: 20, loanFees: .02, loanInsurance: .003, salaryPaysLoan: true, includeFcl: false};
  let settings = null;
  let owner = '';
  let loading = '';
  let storageError = false;
  let saving = false;
  let view = 'base';
  let finance = 'cash';
  let denomination = 'CRC';
  let chartEnd = 65;
  let chartIndex = null;
  let renderKey = '';
  let current = null;
  const text = (spanish, english) => I18n.language === 'en' ? english : spanish;
  const dateNow = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
  function ageOn(birthDate, today = dateNow()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !Number.isFinite(Date.parse(birthDate)) || new Date(birthDate + 'T12:00:00Z').toISOString().slice(0, 10) !== birthDate) throw new Error('Fecha de nacimiento inv\u00e1lida');
    const currentDate = Date.parse(today + 'T12:00:00Z');
    let year = Number(today.slice(0, 4));
    const anniversary = value => Date.parse(value + birthDate.slice(4) + 'T12:00:00Z');
    if (currentDate < anniversary(year)) year--;
    return year - Number(birthDate.slice(0, 4)) + (currentDate - anniversary(year)) / (anniversary(year + 1) - anniversary(year));
  }
  function profile() {
    return snapshot.demo ? 'demo' : snapshot.remote_editing?.spreadsheet || snapshot.accounts.map(account => account.id).sort().join(':');
  }
  async function privateRecord(operation, value, identity) {
    const connection = await new Promise((resolve, reject) => {
      const request = indexedDB.open('dex-fire-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('settings');
      request.onsuccess = () => resolve(request.result);
      request.onerror = request.onblocked = () => reject(new Error('Almacenamiento privado no disponible'));
    });
    try {
      return await new Promise((resolve, reject) => {
        const transaction = connection.transaction('settings', operation === 'read' ? 'readonly' : 'readwrite');
        const store = transaction.objectStore('settings');
        const request = operation === 'read' ? store.get(identity) : store.put(value, identity);
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = transaction.onabort = () => reject(new Error('No se pudo guardar la configuraci\u00f3n'));
      });
    } finally { connection.close(); }
  }
  function checked(input) {
    const next = {...defaults, ...input};
    const age = ageOn(next.birthDate);
    for (const field of ['baseExpense', 'houseExpense', 'houseCost']) if (typeof next[field] !== 'number' || !Number.isFinite(next[field]) || next[field] <= 0 || next[field] > 1e9) throw new Error('Revisa los importes');
    validate({...next, age, capital: 0, restricted: 0, monthlyExpense: next.baseExpense, scenario: 'base'});
    if (typeof next.includeFcl !== 'boolean') throw new Error('Disponibilidad de FCL inv\u00e1lida');
    return Object.fromEntries(Object.keys(defaults).map(key => [key, next[key]]));
  }
  async function hydrate(identity) {
    loading = identity;
    try {
      const record = await privateRecord('read', null, identity);
      let restored = null;
      if (record) {
        const plaintext = await crypto.subtle.decrypt({name: 'AES-GCM', iv: record.nonce, additionalData: new TextEncoder().encode(identity)}, record.key, record.ciphertext);
        restored = checked(JSON.parse(new TextDecoder().decode(plaintext)));
      }
      if (loading !== identity) return;
      settings = restored;
      storageError = false;
    } catch { if (loading === identity) { settings = null; storageError = true; } }
    if (loading !== identity) return;
    owner = identity; loading = ''; renderKey = '';
    if (document.querySelector('#plan')?.dataset.panel === 'fire') render();
  }
  async function configure(input) {
    const identity = profile();
    const next = checked(input);
    const key = await crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv: nonce, additionalData: new TextEncoder().encode(identity)}, key, new TextEncoder().encode(JSON.stringify(next)));
    await privateRecord('write', {key, nonce, ciphertext}, identity);
    if (profile() !== identity) throw new Error('El perfil ha cambiado');
    loading = ''; owner = identity; settings = next; storageError = false; renderKey = ''; chartIndex = null;
    render(true);
  }
  function inputs() {
    const total = selectedTotal();
    const rate = Number(total.fx?.crc_per_usd);
    if (total.net == null || !Number.isFinite(rate) || rate <= 0) return null;
    let excluded = 0n;
    let pension = 0n;
    let conditional = 0n;
    for (const item of total.items) {
      const account = snapshot.accounts.find(account => account.id === item.id);
      const amount = decimal(item.usd_value);
      if (account?.product === 'rop') pension += amount;
      const eligible = item.kind !== 'projection' && (['available', 'mixed'].includes(item.availability) || (settings.includeFcl && account?.product === 'fcl'));
      if (!eligible) excluded += amount;
      if (!eligible && account?.product !== 'rop') conditional += amount;
    }
    return {age: ageOn(settings.birthDate), capital: Number(decimalString(decimal(total.net) - excluded)), restricted: Number(decimalString(pension)),
      net: Number(total.net), conditional: Number(decimalString(conditional)), rate, stale: total.fx.state === 'stale', total};
  }
  function options(source, scenario) {
    return {...settings, ...source, scenario, monthlyExpense: (scenario === 'base' ? settings.baseExpense : settings.houseExpense) / source.rate};
  }
  function amount(value, unit = denomination) {
    if (!Number.isFinite(value)) return '\u2014';
    const converted = value * (unit === 'CRC' ? current.source.rate : 1);
    return money(converted.toFixed(2), unit);
  }
  const ageLabel = value => value == null ? text('No alcanzado', 'Not reached') : `${Math.ceil(value)} ${text('a\u00f1os', 'years')}`;
  const button = (label, glyph, attributes) => `<button type="button" class="icon-button" title="${escapeHTML(label)}" aria-label="${escapeHTML(label)}" ${attributes}>${icon(glyph)}</button>`;
  function render(animate = false) {
    const container = document.querySelector('#plan-content');
    if (!container || !snapshot || document.querySelector('#plan').dataset.panel !== 'fire') return;
    const identity = profile();
    if (owner !== identity) {
      if (loading !== identity) hydrate(identity);
      container.innerHTML = '<p class="subtle" role="status">Cargando configuraci\u00f3n privada...</p>'; return;
    }
    if (!settings) {
      container.innerHTML = `<section class="fire-setup"><div class="fire-symbol">${icon('sunrise')}</div><h2>${text('Tu pr\u00f3ximo horizonte', 'Your next horizon')}</h2><p class="subtle">FIRE \u00b7 Coast FIRE</p>${storageError ? '<p class="form-error" role="alert">No se pudo leer la configuraci\u00f3n privada. No se ha reemplazado.</p>' : ''}<button type="button" class="primary-action" data-fire-settings>${icon('sliders-horizontal')}${text('Configurar', 'Set up')}</button></section>`;
      icons(); return;
    }
    const source = inputs();
    if (!source) { container.innerHTML = '<p class="subtle">El patrimonio o el tipo de cambio no est\u00e1n disponibles. No se ha supuesto un saldo cero.</p>'; return; }
    const key = JSON.stringify([settings, source, view, finance, denomination, chartEnd, hiddenAmounts, document.documentElement.dataset.theme, I18n.language]);
    if (key === renderKey && container.querySelector('#fire-chart')) return;
    if (document.activeElement?.id === 'fire-retirement') return;
    renderKey = key;
    if (view === 'house' && settings.houseAge < source.age) { view = 'base'; showToast('La fecha de la casa ya pas\u00f3. Revisa el plan antes de descontarla otra vez.'); }
    const scenario = view === 'base' ? 'base' : finance;
    const result = calculate(options(source, scenario));
    const reference = view === 'house' ? calculate({...options(source, 'base'), monthlyExpense: settings.houseExpense / source.rate}) : null;
    const comparison = view === 'house' ? calculate(options(source, finance === 'cash' ? 'credit' : 'cash')) : null;
    current = {source, result, reference};
    const progress = Math.max(0, Math.min(100, source.capital / result.coastTarget * 100));
    const metric = (label, content) => `<div class="fire-metric"><span>${label}</span><strong data-no-translate>${content}</strong></div>`;
    const privateAge = value => hiddenAmounts ? '\u2022\u2022\u2022' : ageLabel(value);
    const stage = hiddenAmounts ? 'Coast FIRE' : result.coastReached ? text('Coast alcanzado', 'Coast reached') : text('Camino a Coast', 'Towards Coast');
    const previousToolbar = container.querySelector('.fire-toolbar');
    const active = document.activeElement?.closest('[data-fire-view], [data-fire-finance], [data-fire-unit], [data-fire-end]');
    const focusAttribute = active ? [...active.attributes].find(attribute => attribute.name.startsWith('data-fire-')) : null;
    container.innerHTML = `<div class="fire-dashboard">
      <div class="fire-toolbar"><div class="segmented fire-scenarios" role="group" aria-label="Escenario">${[['base', 'Sin casa'], ['house', 'Con casa']].map(([key, label]) => `<button type="button" data-fire-view="${key}" aria-pressed="${view === key}">${I18n.translate(label)}</button>`).join('')}</div>${button(text('Supuestos', 'Assumptions'), 'sliders-horizontal', 'data-fire-settings')}</div>
      <section class="fire-hero"><p class="small-label">${stage}</p><h2 data-no-translate>${amount(Math.max(0, result.coastTarget - source.capital))}</h2><p class="subtle">${result.coastReached ? text('Brecha de capital cubierta', 'Capital gap covered') : text('Para financiar el retiro sin nuevos aportes', 'To fund retirement without new contributions')}</p>
        <div class="fire-progress" ${hiddenAmounts ? 'hidden' : ''}><progress max="100" value="${progress}" aria-label="Progreso Coast FIRE"></progress><span>${progress.toFixed(1)}%</span></div>
        ${result.salaryCondition ? '<p class="fire-condition">' + icon('briefcase-business') + 'Condicionado a pagar cuotas con ingresos antes del retiro.</p>' : ''}
      </section>
      <div class="fire-controls"><label for="fire-retirement">${text('Retiro', 'Retirement')}</label><div class="fire-stepper">${button('Un a\u00f1o antes', 'minus', 'data-fire-step="-1"')}<input id="fire-retirement" type="number" min="${Math.ceil(source.age)}" max="100" step="1" value="${settings.retirementAge}" aria-label="Edad de retiro">${button('Un a\u00f1o despu\u00e9s', 'plus', 'data-fire-step="1"')}</div><div class="segmented fire-units" role="group" aria-label="Moneda">${['CRC', 'USD'].map(unit => `<button type="button" data-fire-unit="${unit}" aria-pressed="${denomination === unit}">${unit}</button>`).join('')}</div></div>
      ${view === 'house' ? `<div class="segmented fire-finance" role="group" aria-label="Financiamiento"><button type="button" data-fire-finance="cash" aria-pressed="${finance === 'cash'}">Contado</button><button type="button" data-fire-finance="credit" aria-pressed="${finance === 'credit'}">Cr\u00e9dito</button></div>` : ''}
      <section class="fire-chart-wrap" aria-label="Proyecci\u00f3n"><div class="fire-chart-caption"><span id="fire-point-age"></span><strong id="fire-point-amount" data-no-translate></strong></div><canvas id="fire-chart" height="250" role="slider" tabindex="0" aria-label="Capital proyectado por edad" aria-valuemin="${Math.floor(source.age)}" aria-valuemax="${Math.max(chartEnd, settings.retirementAge)}"></canvas><div class="fire-chart-legend"><span><i></i>Capital disponible</span><span><i class="fire-target-dot"></i>Meta FIRE</span>${reference ? '<span><i class="fire-reference-dot"></i>Sin obra</span>' : ''}</div><div class="fire-chart-range"><span>Dinero de hoy</span><div class="segmented" role="group" aria-label="Horizonte"><button type="button" data-fire-end="65" aria-pressed="${chartEnd === 65}">65 a\u00f1os</button><button type="button" data-fire-end="90" aria-pressed="${chartEnd === 90}">90 a\u00f1os</button></div></div></section>
      <div class="fire-metrics">${metric('Meta FIRE', amount(result.retirementTarget))}${metric('Retiro posible', privateAge(result.fireAge))}${metric('Proyectado a los ' + settings.retirementAge, amount(Math.max(0, result.atRetirement)))}${metric('Coast necesario hoy', amount(result.coastTarget))}</div>
      ${result.firstShortfall != null && !hiddenAmounts ? `<p class="fire-warning">${icon('triangle-alert')}El capital no alcanza desde los ${Math.floor(result.firstShortfall)} a\u00f1os en este escenario.</p>` : ''}
      ${view === 'house' ? `<section class="fire-section"><div class="section-heading"><h3>${icon('house')} Casa a los ${settings.houseAge}</h3><strong data-no-translate>${amount(settings.houseCost, 'USD')}</strong></div><p class="subtle">Presupuesto nominal total \u00b7 inicio a los ${settings.houseAge} \u00b7 ${settings.constructionMonths} meses de obra</p>${line(finance === 'cash' ? 'Desembolso mensual de obra' : 'Prima + gastos de cr\u00e9dito', amount(finance === 'cash' ? settings.houseCost / settings.constructionMonths : settings.houseCost * settings.downPayment + result.principal * settings.loanFees, 'USD'))}${finance === 'credit' ? line('Cuota + seguro inicial estimado', amount(result.installment + result.insurance, 'USD')) + line('Intereses + gastos + seguro nominales', amount(result.totalLoanCost, 'USD')) : ''}<div class="fire-comparison">${metric(finance === 'cash' ? 'Coast con cr\u00e9dito' : 'Coast de contado', amount(comparison.coastTarget))}${metric(finance === 'cash' ? 'Retiro con cr\u00e9dito' : 'Retiro de contado', privateAge(comparison.fireAge))}</div><p class="subtle">La casa no se cuenta como cartera invertida. El cr\u00e9dito es ilustrativo, no una oferta. La comparaci\u00f3n usa el mismo gasto mensual.</p></section>` : ''}
      <details class="fire-section"><summary>Patrimonio y disponibilidad</summary>${line('NW seleccionado', amount(source.net))}${line('Capital para FIRE', amount(source.capital))}${line('ROP separado', amount(source.restricted))}${line('Otros saldos condicionados / estimados', amount(source.conditional))}${line('ROP te\u00f3rico a los ' + settings.pensionAge, amount(result.pensionCapital))}<p class="subtle">ROP no incluido en el capital para FIRE ni liberado autom\u00e1ticamente a los ${settings.pensionAge}. Su pago depende del derecho a pensi\u00f3n y la modalidad. No se ha supuesto una pensi\u00f3n mensual CCSS. FCL excluido salvo disponibilidad confirmada en supuestos.</p></details>
      <details class="fire-section"><summary>Supuestos y alcance</summary><p class="subtle">${(settings.annualReturn * 100).toFixed(1)}% nominal \u00b7 ${(settings.inflation * 100).toFixed(1)}% inflaci\u00f3n \u00b7 ${(settings.withdrawal * 100).toFixed(1)}% retiro inicial. Proyecci\u00f3n determinista, no garant\u00eda: no simula volatilidad ni cambios legales. Los retiros de vida empiezan al retirarte y mantienen poder de compra. La regla del retiro no certifica sostenibilidad.</p><p class="subtle">Los aportes reales entran con nuevos res\u00famenes; no se inventan aportes futuros. FX fijo de referencia: ${money(String(source.rate), 'CRC')} / USD${source.stale ? ' (desactualizado)' : ''}. No predice el tipo de cambio futuro ni impuestos sobre ventas de inversiones.</p><p class="subtle">Cr\u00e9dito: prima y gastos al inicio; pr\u00e9stamo desembolsado completo y cuotas desde el primer mes. Seguro estimado sobre principal inicial. Costos, tasa y plazo editables.</p><p class="subtle">Configuraci\u00f3n cifrada en este navegador; no sincronizada ni incluida en el respaldo financiero. Edad calculada desde la fecha de nacimiento.</p></details>
      <p class="fire-footnote">${snapshot.published_at ? 'Resumen: ' + escapeHTML(dateLabel(snapshot.published_at.slice(0, 10), true)) : 'Fuentes del resumen actual'} \u00b7 ${source.total.excludedCount ? source.total.excludedCount + ' fuentes excluidas' : 'Selecci\u00f3n de patrimonio actual'}</p>
    </div>`;
    if (previousToolbar) container.querySelector('.fire-toolbar').replaceWith(previousToolbar);
    container.querySelectorAll('[data-fire-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.fireView === view)));
    container.querySelectorAll('.segmented').forEach(group => {
      group.removeAttribute('style');
      const buttons = [...group.querySelectorAll('button')];
      group.style.setProperty('--count', String(buttons.length));
      group.style.setProperty('--index', String(buttons.findIndex(button => button.getAttribute('aria-pressed') === 'true')));
    });
    if (focusAttribute) container.querySelector(`[${focusAttribute.name}="${focusAttribute.value}"]`)?.focus({preventScroll: true});
    icons();
    requestAnimationFrame(() => { container.querySelectorAll('.fire-metric strong, .fire-hero h2').forEach(fitAmount); paint(); });
    if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches && !document.body.classList.contains('reduce-motion')) {
      container.querySelectorAll('.fire-hero, .fire-chart-wrap, .fire-metrics').forEach((node, index) => node.animate([{opacity: .4, transform: 'translateY(6px)'}, {opacity: 1, transform: 'translateY(0)'}], {duration: 280, delay: index * 25, easing: 'cubic-bezier(.22,1,.36,1)'}));
    }
  }

  function fitAmount(node) {
    node.style.whiteSpace = 'nowrap';
    let size = parseFloat(getComputedStyle(node).fontSize);
    while (size > 12 && node.scrollWidth > node.clientWidth) { size -= .5; node.style.fontSize = size + 'px'; }
  }
  function paint() {
    const canvas = document.querySelector('#fire-chart');
    if (!canvas || !current || !canvas.clientWidth) return;
    const {source, result, reference} = current;
    const points = result.points.filter(point => point.age <= Math.max(chartEnd, settings.retirementAge));
    const width = canvas.clientWidth, height = 250, scale = devicePixelRatio || 1;
    canvas.width = Math.round(width * scale); canvas.height = height * scale;
    const context = canvas.getContext('2d'); context.scale(scale, scale);
    const colors = getComputedStyle(document.documentElement);
    if (hiddenAmounts) {
      context.fillStyle = colors.getPropertyValue('--label-3'); context.font = '16px ' + colors.getPropertyValue('--font'); context.textAlign = 'center'; context.fillText('\u2022\u2022\u2022', width / 2, height / 2);
      document.querySelector('#fire-point-age').textContent = 'Proyecci\u00f3n'; document.querySelector('#fire-point-amount').textContent = '\u2022\u2022\u2022';
      canvas.setAttribute('aria-valuetext', 'Importes ocultos'); return;
    }
    const maximum = Math.max(1, result.target, ...points.map(point => Math.max(0, point.capital)), ...(reference ? reference.points.slice(0, points.length).map(point => Math.max(0, point.capital)) : [])) * 1.08;
    const left = 48, right = width - 10, top = 18, bottom = height - 28;
    const horizontal = index => left + index / Math.max(1, points.length - 1) * (right - left);
    const vertical = value => bottom - Math.max(0, value) / maximum * (bottom - top);
    context.font = '11px ' + colors.getPropertyValue('--font');
    for (const fraction of [0, .5, 1]) {
      const value = maximum * fraction, position = vertical(value);
      context.strokeStyle = colors.getPropertyValue('--sep'); context.lineWidth = .5;
      context.beginPath(); context.moveTo(left, position); context.lineTo(right, position); context.stroke();
      context.fillStyle = colors.getPropertyValue('--label-2'); context.textAlign = 'right';
      context.fillText(new Intl.NumberFormat(I18n.locale, {notation: 'compact', maximumFractionDigits: 1}).format(value * (denomination === 'CRC' ? source.rate : 1)), left - 7, position + 3);
    }
    context.fillStyle = colors.getPropertyValue('--label-2'); context.textAlign = 'center';
    for (const fraction of [0, .5, 1]) { const index = Math.round((points.length - 1) * fraction); context.fillText(Math.round(points[index].age), horizontal(index), height - 7); }
    const stroke = (values, color, dash, fill = false) => {
      context.beginPath(); values.forEach((value, index) => index ? context.lineTo(horizontal(index), vertical(value)) : context.moveTo(horizontal(index), vertical(value)));
      context.strokeStyle = color; context.lineWidth = fill ? 2.4 : 1.3; context.setLineDash(dash); context.stroke(); context.setLineDash([]);
      if (fill) { context.lineTo(right, bottom); context.lineTo(left, bottom); context.closePath(); const gradient = context.createLinearGradient(0, top, 0, bottom); gradient.addColorStop(0, color.trim() + '28'); gradient.addColorStop(1, color.trim() + '00'); context.fillStyle = gradient; context.fill(); }
    };
    if (reference) stroke(reference.points.slice(0, points.length).map(point => point.capital), colors.getPropertyValue('--label-3'), [3, 4]);
    stroke(points.map(() => result.target), colors.getPropertyValue('--orange'), [5, 4]);
    stroke(points.map(point => point.capital), colors.getPropertyValue('--tint'), [], true);
    for (const [age, label] of [[settings.retirementAge, 'Retiro'], ...(view === 'house' ? [[settings.houseAge, 'Casa']] : [])]) {
      const index = Math.round((age - source.age) * 12);
      if (index < 0 || index >= points.length) continue;
      context.strokeStyle = colors.getPropertyValue('--label-3'); context.setLineDash([2, 4]); context.beginPath(); context.moveTo(horizontal(index), top + 12); context.lineTo(horizontal(index), bottom); context.stroke(); context.setLineDash([]);
      context.fillStyle = colors.getPropertyValue('--label-2'); context.fillText(label, Math.min(right - 18, Math.max(left + 18, horizontal(index))), top - 4);
    }
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const choose = index => {
      chartIndex = Math.min(points.length - 1, Math.max(0, index));
      const point = points[chartIndex];
      context.putImageData(image, 0, 0); context.strokeStyle = colors.getPropertyValue('--label-2'); context.lineWidth = 1;
      context.beginPath(); context.moveTo(horizontal(chartIndex), top); context.lineTo(horizontal(chartIndex), bottom); context.stroke();
      context.fillStyle = colors.getPropertyValue('--tint'); context.beginPath(); context.arc(horizontal(chartIndex), vertical(point.capital), 4, 0, Math.PI * 2); context.fill();
      document.querySelector('#fire-point-age').textContent = `${Math.floor(point.age)} a\u00f1os \u00b7 ${Math.floor((point.age % 1) * 12)} meses`;
      document.querySelector('#fire-point-amount').innerHTML = amount(Math.max(0, point.capital));
      fitAmount(document.querySelector('#fire-point-amount'));
      canvas.setAttribute('aria-valuenow', point.age.toFixed(2)); canvas.setAttribute('aria-valuetext', `${Math.floor(point.age)} a\u00f1os, ${document.querySelector('#fire-point-amount').textContent}`);
    };
    choose(chartIndex ?? Math.min(result.retirementMonth, points.length - 1));
    const fromPointer = event => choose(Math.round((event.clientX - canvas.getBoundingClientRect().left - left) / (right - left) * (points.length - 1)));
    let pointer = null;
    canvas.onpointerdown = event => { pointer = {horizontal: event.clientX, vertical: event.clientY}; if (event.pointerType !== 'touch') fromPointer(event); };
    canvas.onpointermove = event => { if (pointer && Math.abs(event.clientX - pointer.horizontal) > Math.abs(event.clientY - pointer.vertical) + 8) fromPointer(event); };
    canvas.onpointerup = event => { if (pointer && Math.abs(event.clientY - pointer.vertical) < 8) fromPointer(event); pointer = null; };
    canvas.onpointercancel = () => { pointer = null; };
    canvas.onkeydown = event => { const next = {Home: 0, End: points.length - 1, ArrowLeft: chartIndex - 12, ArrowRight: chartIndex + 12}[event.key]; if (next != null) { event.preventDefault(); choose(next); } };
  }

  function form() {
    const values = settings || defaults;
    const field = (name, label, minimum, maximum, step = '1', multiplier = 1) => `<label>${label}<input name="${name}" type="number" min="${minimum}" max="${maximum}" step="${step}" required value="${values[name] == null ? '' : Number((values[name] * multiplier).toFixed(6))}"></label>`;
    document.querySelector('#detail-eyebrow').textContent = 'FIRE';
    document.querySelector('#detail-content').innerHTML = `<h2 id="detail-title">Supuestos</h2><form id="fire-form" class="adjustment-form"><label>Fecha de nacimiento<input name="birthDate" type="date" required value="${escapeHTML(values.birthDate)}"></label><div class="form-columns">${field('retirementAge', 'Edad de retiro', 18, 100)}${field('pensionAge', 'Edad de referencia ROP', 18, 100)}</div><div class="form-columns">${field('baseExpense', 'Gasto mensual sin casa (CRC de hoy)', 1, 1e9, '.01')}${field('houseExpense', 'Gasto mensual con casa (CRC de hoy)', 1, 1e9, '.01')}</div><div class="form-columns">${field('annualReturn', 'Rendimiento nominal (%)', -50, 30, '.1', 100)}${field('inflation', 'Inflaci\u00f3n (%)', 0, 20, '.1', 100)}</div>${field('withdrawal', 'Retiro inicial anual (%)', 1, 10, '.1', 100)}<label class="setting-row"><span>FCL con disponibilidad confirmada</span><input name="includeFcl" type="checkbox" class="switch" ${values.includeFcl ? 'checked' : ''}></label><h3>Casa</h3>${field('houseCost', 'Presupuesto nominal total (USD)', 1, 1e9, '.01')}<div class="form-columns">${field('houseAge', 'Edad al iniciar', 18, 100)}${field('constructionMonths', 'Meses de obra', 1, 60)}</div><h3>Cr\u00e9dito ilustrativo</h3><div class="form-columns">${field('downPayment', 'Prima (%)', 0, 100, '.1', 100)}${field('loanYears', 'Plazo (a\u00f1os)', 1, 40)}${field('loanRate', 'Inter\u00e9s nominal anual (%)', 0, 30, '.1', 100)}${field('loanFees', 'Gastos iniciales sobre pr\u00e9stamo (%)', 0, 20, '.1', 100)}</div>${field('loanInsurance', 'Seguro anual sobre principal inicial (%)', 0, 10, '.1', 100)}<label class="setting-row"><span>Cuotas desde ingresos hasta retirarme</span><input name="salaryPaysLoan" type="checkbox" class="switch" ${values.salaryPaysLoan ? 'checked' : ''}></label><p class="subtle">Gasto de vida sin cuota hipotecaria; despu\u00e9s del retiro la cuota se descuenta aparte. 12 meses de obra, 20% de prima, 20 a\u00f1os, 7% de inter\u00e9s y gastos son ejemplos editables, no una oferta.</p><p id="fire-error" class="form-error" role="alert"></p><button class="primary-action" type="submit">${icon('check')}Guardar en este navegador</button></form>`;
    document.querySelector('#fire-form').onsubmit = async event => {
      event.preventDefault(); if (saving) return;
      const form = event.currentTarget, data = new FormData(form), next = {};
      for (const key of Object.keys(defaults)) next[key] = key === 'birthDate' ? data.get(key) : ['salaryPaysLoan', 'includeFcl'].includes(key) ? data.has(key) : Number(data.get(key));
      for (const key of ['annualReturn', 'inflation', 'withdrawal', 'downPayment', 'loanRate', 'loanFees', 'loanInsurance']) next[key] /= 100;
      saving = true; form.querySelector('button[type="submit"]').disabled = true;
      try { await configure(next); currentDetail = null; closeSheet(); showToast('Supuestos guardados en este navegador'); }
      catch (error) { document.querySelector('#fire-error').textContent = error.message; }
      finally { saving = false; form.querySelector('button[type="submit"]').disabled = false; }
    };
  }
  async function changeRetirement(value) {
    if (saving || !settings) return;
    saving = true;
    try {
      if (value < Math.ceil(ageOn(settings.birthDate))) throw new Error('La edad de retiro debe ser actual o futura');
      document.querySelector('#fire-retirement')?.blur();
      await configure({...settings, retirementAge: value});
    }
    catch (error) { showToast(error.message); renderKey = ''; render(); }
    finally { saving = false; }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('click', event => {
      const target = event.target.closest('[data-fire-settings], [data-fire-view], [data-fire-finance], [data-fire-unit], [data-fire-step], [data-fire-end]');
      if (!target) return;
      if (target.hasAttribute('data-fire-settings')) { if (hiddenAmounts) { showToast('Muestra los importes para editar los supuestos'); return; } target.focus({preventScroll: true}); openDetail('fire', null, target); return; }
      if (target.dataset.fireStep) { changeRetirement(settings.retirementAge + Number(target.dataset.fireStep)); return; }
      if (target.dataset.fireView) view = target.dataset.fireView;
      if (target.dataset.fireFinance) finance = target.dataset.fireFinance;
      if (target.dataset.fireUnit) denomination = target.dataset.fireUnit;
      if (target.dataset.fireEnd) chartEnd = Number(target.dataset.fireEnd);
      chartIndex = null; render(true);
    });
    document.addEventListener('change', event => { if (event.target.id === 'fire-retirement') changeRetirement(Number(event.target.value)); });
    document.addEventListener('blur', event => { if (event.target.id === 'fire-retirement') requestAnimationFrame(() => render()); }, true);
    globalThis.addEventListener('resize', () => { if (document.querySelector('#fire-chart')) requestAnimationFrame(paint); });
  }
  return {calculate, payment, ageOn, configure, render, form, get saving() { return saving; }};
})();