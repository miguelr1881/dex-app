'use strict';

const DexPlan = (() => {
  let panel = 'goals';
  let saving = false;
  let comparisonDates = [];
  let calendarMonth = '';
  let reportPeriod = '';
  let reportMode = 'month';
  let inflationCountry = 'CRI';
  let inflationYear = '';
  let lastReport = null;
  const routes = {plan: ['goals', 'Metas'], metas: ['goals', 'Metas'], calendario: ['calendar', 'Calendario'], comparar: ['history', 'Comparar fechas'], hitos: ['milestones', 'Mis hitos'], mensual: ['reports', 'Resumen mensual'], anual: ['annual', 'Ficha anual'], inflacion: ['inflation', 'Poder de compra'], alertas: ['alerts', 'Alertas']};
  function route(target) {
    const destination = routes[target];
    if (!destination) return null;
    panel = destination[0];
    select('#plan').dataset.panel = panel;
    if (panel === 'annual') reportMode = 'year';
    if (panel === 'reports') reportMode = 'month';
    select('#plan-heading').textContent = I18n.translate(destination[1]);
    select('#plan').dataset.title = I18n.translate(destination[1]);
    if (snapshot) render();
    return destination[1];
  }
  const unit = 10n ** 20n;
  const positive = value => value > 0n ? value : 0n;
  const today = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
  const daysBetween = (first, last) => Math.round((Date.parse(last + 'T12:00:00Z') - Date.parse(first + 'T12:00:00Z')) / 86400000);
  const plan = () => snapshot?.planning || {revision: '0', items: [], alerts: {enabled: true, days: 14}};
  const value = (units, denomination = 'USD') => money(decimalString(units), denomination);
  const caption = text => `<p class="subtle">${escapeHTML(text)}</p>`;
  const action = (label, glyph, attributes) => `<button class="icon-button" type="button" title="${escapeHTML(label)}" aria-label="${escapeHTML(label)}" ${attributes}>${icon(glyph)}</button>`;
  const entryLabel = item => selectionNames[item.key] || snapshot.accounts.find(account => account.id === item.id)?.display_name || sources[item.source]?.name || item.source || item.id;

  function goalProgress(goal) {
    const account = goal.account_id ? snapshot.accounts.find(item => item.id === goal.account_id && item.currency === goal.currency) : null;
    if (goal.account_id && !account) return null;
    const saved = account ? positive(decimal(account.balance) - decimal(snapshot.deductions_by_account?.[account.id] || '0')) : decimal(goal.saved);
    const target = decimal(goal.amount);
    return {saved, remaining: positive(target - saved), percent: Number(saved * 1000n / target) / 10,
      days: daysBetween(today(), goal.date), account};
  }

  function observations() {
    return [...(snapshot.history?.points || [])].sort((first, second) => first.date.localeCompare(second.date));
  }

  function compare(first, last) {
    if (!first?.total_usd || !last?.total_usd || first.date >= last.date) return null;
    const start = selectedTotal(first.total_usd), end = selectedTotal(last.total_usd);
    if (start.net == null || end.net == null) return null;
    const before = new Map(start.items.map(item => [item.id, item]));
    const after = new Map(end.items.map(item => [item.id, item]));
    let fx = 0n;
    const rows = [...new Set([...before.keys(), ...after.keys()])].map(id => {
      const old = before.get(id), current = after.get(id);
      const delta = decimal(current?.usd_value || '0') - decimal(old?.usd_value || '0');
      let currencyEffect = 0n;
      const rate = first.total_usd.fx?.crc_per_usd;
      if (old && current && old.currency === 'CRC' && current.currency === 'CRC' && current.amount != null && rate && decimal(rate) > 0n) {
        currencyEffect = decimal(current.usd_value) - decimal(current.amount) * unit / decimal(rate);
      }
      fx += currencyEffect;
      return {name: entryLabel(current || old), delta, fx: currencyEffect, coverage: !old || !current,
        projection: (current || old).kind === 'projection'};
    }).sort((firstRow, lastRow) => {
      const firstSize = firstRow.delta < 0n ? -firstRow.delta : firstRow.delta;
      const lastSize = lastRow.delta < 0n ? -lastRow.delta : lastRow.delta;
      return firstSize > lastSize ? -1 : firstSize < lastSize ? 1 : 0;
    });
    const deductions = decimal(start.deductions || '0') - decimal(end.deductions || '0');
    const delta = decimal(end.net) - decimal(start.net);
    const accounted = rows.reduce((sum, row) => sum + row.delta, deductions);
    return {first: first.date, last: last.date, start: decimal(start.net), end: decimal(end.net), endRate: end.fx?.crc_per_usd, delta, fx,
      deductions, rows, rounding: delta - accounted};
  }

  function comparisonMarkup(result) {
    if (!result) return caption('No hay dos cortes completos comparables en este periodo.');
    return `<div class="plan-totals">${line('Inicio', value(result.start))}${line('Final', value(result.end))}${line('Cambio neto', value(result.delta))}</div>
      <h3>Qu\u00e9 movi\u00f3 mi patrimonio</h3><div class="plan-ledger">${result.rows.map(row => `<div class="detail-line"><span data-no-translate>${escapeHTML(row.name)}<small>${row.coverage ? 'Cambio de cobertura' : row.projection ? 'Proyecci\u00f3n de planilla' : 'Cambio de saldo'}</small></span><strong>${value(row.delta)}</strong></div>`).join('')}
      ${line('Cambio en restas', value(result.deductions))}${line('Redondeo', value(result.rounding))}</div>
      ${line('Efecto USD/CRC incluido arriba', value(result.fx))}
      ${caption('Cambio de patrimonio, no rentabilidad. Sin movimientos conciliados no se pueden separar aportes, retiros y ganancias. Las cuentas nuevas o ausentes cambian la cobertura.')}
      ${caption('Todo USD con la selecci\u00f3n de fuentes actual. Cada corte conserva su tipo de cambio; no se rellenan fechas sin datos.')}`;
  }

  function calendar() {
    const entries = plan().items.filter(item => item.kind !== 'goal' || !item.paused).map(item => ({...item, label: item.kind === 'goal' ? 'Meta' : item.kind === 'milestone' ? 'Hito' : 'Evento'}));
    const next = snapshot.payroll?.configured && snapshot.payroll.espp?.next_purchase_on;
    if (next) entries.push({id: 'scheduled-espp', kind: 'automatic', name: 'Compra ESPP', date: next, note: 'Fecha programada; no confirma la compra ni su conciliaci\u00f3n.', label: 'Programado'});
    return entries.sort((first, last) => first.date.localeCompare(last.date) || first.name.localeCompare(last.name));
  }

  function alerts() {
    if (!plan().alerts.enabled) return [];
    const messages = [];
    for (const goal of plan().items.filter(item => item.kind === 'goal' && !item.paused)) {
      const progress = goalProgress(goal);
      if (!progress) messages.push({name: goal.name, text: 'Cuenta vinculada no disponible'});
      else if (progress.remaining === 0n) messages.push({name: goal.name, text: 'Meta alcanzada'});
      else if (progress.days < 0) messages.push({name: goal.name, text: 'Fecha objetivo vencida'});
      else if (progress.days <= plan().alerts.days) messages.push({name: goal.name, text: `Fecha objetivo en ${progress.days} d\u00edas`});
    }
    for (const event of calendar().filter(item => item.kind === 'event' || item.kind === 'automatic')) {
      const days = daysBetween(today(), event.date);
      if (days >= 0 && days <= plan().alerts.days) messages.push({name: event.name, text: `En ${days} d\u00edas`});
    }
    const stale = snapshot.accounts.filter(account => account.as_of && daysBetween(account.as_of, today()) > 45);
    if (stale.length) messages.push({name: 'Fuentes pendientes', text: `${stale.length} cuenta(s) con corte de hace m\u00e1s de 45 d\u00edas`});
    return messages;
  }

  function renderGoals() {
    const goals = plan().items.filter(item => item.kind === 'goal');
    return `<div class="section-heading"><h2>Metas</h2>${action('Crear meta', 'plus', 'data-plan-new="goal"')}</div>` + (goals.length ? goals.map(goal => {
      const progress = goalProgress(goal);
      return `<article class="goal-row"><div class="section-heading"><h3 data-no-translate>${escapeHTML(goal.name)}</h3>${action('Editar meta', 'pencil', `data-plan-edit="${escapeHTML(goal.id)}"`)}</div>
        <p class="small-label">${escapeHTML(dateLabel(goal.date, true))} \u00b7 ${goal.paused ? 'Pausada' : progress?.remaining === 0n ? 'Alcanzada' : progress?.days < 0 ? 'Fecha vencida' : `${progress?.days ?? '\u00b7'} d\u00edas`}</p>
        ${progress ? `<div class="goal-balance">${value(progress.saved, goal.currency)}<span> / ${money(goal.amount, goal.currency)}</span></div><progress max="100" value="${hiddenAmounts ? 0 : Math.min(100, progress.percent)}" aria-label="Progreso de meta"></progress>${line('Falta', value(progress.remaining, goal.currency))}${progress.days > 0 && progress.remaining > 0n ? line('Por mes hasta la fecha', value(progress.remaining * 30n / BigInt(progress.days), goal.currency)) : ''}${caption(progress.account ? `${entryLabel(progress.account)} \u00b7 saldo menos restas vinculadas` : 'Monto apartado manualmente')}` : caption('La cuenta vinculada no est\u00e1 en el corte actual.')}
        ${goal.note ? `<p class="subtle" data-no-translate>${escapeHTML(goal.note)}</p>` : ''}</article>`;
    }).join('') : caption('Sin metas.'));
  }

  function renderCalendar() {
    const entries = calendar();
    const months = [...new Set([today().slice(0, 7), ...entries.map(item => item.date.slice(0, 7))])].sort();
    const shown = calendarMonth ? entries.filter(item => item.date.startsWith(calendarMonth)) : entries;
    return `<div class="section-heading"><h2>Calendario patrimonial</h2>${action('Crear evento', 'plus', 'data-plan-new="event"')}</div>
      <label class="plan-field">Mes<select id="plan-month"><option value="">Todas las fechas</option>${months.map(month => `<option ${month === calendarMonth ? 'selected' : ''}>${month}</option>`).join('')}</select></label>
      ${shown.map(item => `<article class="agenda-row"><div><span class="small-label">${escapeHTML(dateLabel(item.date, true))} \u00b7 ${item.label}</span><h3 data-no-translate>${escapeHTML(item.name)}</h3>${item.note ? `<p class="subtle" data-no-translate>${escapeHTML(item.note)}</p>` : ''}</div><div class="plan-actions">${item.kind !== 'automatic' ? action('Editar', 'pencil', `data-plan-edit="${item.id}"`) : ''}${action('Exportar evento privado', 'download', `data-plan-calendar="${item.id}"`)}</div></article>`).join('') || caption('Sin eventos en este periodo.')}`;
  }

  function renderHistory() {
    const points = observations();
    if (!points.some(item => item.date === comparisonDates[0])) comparisonDates[0] = points[0]?.date;
    if (!points.some(item => item.date === comparisonDates[1])) comparisonDates[1] = points.at(-1)?.date;
    const options = selected => points.map(item => `<option value="${item.date}" ${item.date === selected ? 'selected' : ''}>${escapeHTML(dateLabel(item.date, true))}</option>`).join('');
    const result = compare(points.find(item => item.date === comparisonDates[0]), points.find(item => item.date === comparisonDates[1]));
    if (panel === 'history') return `<div class="plan-fields"><label>Desde<select id="compare-from">${options(comparisonDates[0])}</select></label><label>Hasta<select id="compare-to">${options(comparisonDates[1])}</select></label></div>${comparisonMarkup(result)}`;
    return `<div class="section-heading"><h2>Bit\u00e1cora de hitos</h2>${action('Agregar hito', 'plus', 'data-plan-new="milestone"')}</div>
      ${plan().items.filter(item => item.kind === 'milestone').sort((first, last) => last.date.localeCompare(first.date)).map(item => `<article class="agenda-row"><div><span class="small-label">${escapeHTML(dateLabel(item.date, true))}</span><h3 data-no-translate>${escapeHTML(item.name)}</h3><p class="subtle" data-no-translate>${escapeHTML(item.note)}</p></div>${action('Editar hito', 'pencil', `data-plan-edit="${item.id}"`)}</article>`).join('') || caption('Sin hitos registrados.')}`;
  }

  function annualInflation(year) {
    const indices = snapshot.inflation?.countries?.[inflationCountry] || {};
    const before = indices[String(Number(year) - 1)], after = indices[year];
    if (!before || !after) return caption(`IPC anual ${year}: pendiente de publicaci\u00f3n o descarga.`);
    const rate = Number((decimal(after) - decimal(before)) * 10000n / decimal(before)) / 100;
    const denomination = inflationCountry === 'CRI' ? 'CRC' : 'USD';
    const nominal = lastReport && year === reportPeriod.slice(0, 4) ? (denomination === 'USD' ? lastReport.end : lastReport.endRate ? lastReport.end * decimal(lastReport.endRate) / unit : null) : null;
    const reference = nominal != null ? nominal * decimal(before) / decimal(after) : null;
    return `${line(`IPC ${Number(year) - 1} \u00b7 ${year}`, `${rate.toFixed(2)}%`)}${reference != null ? line('Saldo final a precios del a\u00f1o anterior', value(reference, denomination)) : ''}${caption('Referencia con IPC promedio anual, no inflaci\u00f3n exacta entre los d\u00edas del informe. No mide rentabilidad. Costa Rica se expresa en CRC con el tipo de cambio del corte final.')}`;
  }

  function renderReports() {
    const points = observations();
    const periods = [...new Set(points.map(item => item.date.slice(0, reportMode === 'year' ? 4 : 7)))].reverse();
    if (!periods.includes(reportPeriod)) reportPeriod = periods[0] || '';
    const selected = points.filter(item => item.date.startsWith(reportPeriod));
    const baseline = points.filter(item => item.date < (reportPeriod.length === 4 ? reportPeriod + '-01-01' : reportPeriod + '-01')).at(-1) || selected[0];
    lastReport = compare(baseline, selected.at(-1));
    const year = reportPeriod.slice(0, 4);
    const indexDate = snapshot.inflation?.country_updated_at?.[inflationCountry] || snapshot.inflation?.updated_at;
    const indexYears = [...new Set([year, ...Object.keys(snapshot.inflation?.countries?.[inflationCountry] || {})])].filter(Boolean).sort().reverse();
    if (!indexYears.includes(inflationYear)) inflationYear = year || indexYears[0] || '';
    return `<section ${panel === 'inflation' ? 'hidden' : ''}><div class="section-heading"><h2>${reportMode === 'year' ? 'Ficha anual' : 'Resumen mensual'}</h2>${action('Exportar informe privado', 'download', `id="plan-export" ${hiddenAmounts || !lastReport ? 'disabled' : ''}`)}</div>
      <div class="plan-fields"><label>Informe<select id="report-mode"><option value="month" ${reportMode === 'month' ? 'selected' : ''}>Mensual</option><option value="year" ${reportMode === 'year' ? 'selected' : ''}>Anual</option></select></label><label>Periodo<select id="report-period">${periods.map(period => `<option ${period === reportPeriod ? 'selected' : ''}>${period}</option>`).join('')}</select></label></div>
      ${lastReport ? caption(`Cortes disponibles: ${dateLabel(lastReport.first, true)} a ${dateLabel(lastReport.last, true)}. Puede ser un periodo parcial.`) : ''}${comparisonMarkup(lastReport)}
      <h3>Hitos del periodo</h3>${plan().items.filter(item => item.kind === 'milestone' && item.date.startsWith(reportPeriod)).map(item => `<p data-no-translate>${escapeHTML(dateLabel(item.date))}: ${escapeHTML(item.name)}</p>`).join('') || caption('Sin hitos en este periodo.')}
      </section><section><h2 ${panel === 'inflation' ? 'class="sr-only"' : ''}>Poder de compra</h2><div class="plan-fields"><label>Referencia de precios<select id="inflation-country"><option value="CRI" ${inflationCountry === 'CRI' ? 'selected' : ''}>Costa Rica</option><option value="USA" ${inflationCountry === 'USA' ? 'selected' : ''}>Estados Unidos</option></select></label><label>A\u00f1o del IPC<select id="inflation-year">${indexYears.map(indexYear => `<option ${indexYear === inflationYear ? 'selected' : ''}>${indexYear}</option>`).join('')}</select></label></div>${annualInflation(inflationYear)}
      ${caption(snapshot.inflation?.source === 'synthetic' ? 'IPC de ejemplo, no datos oficiales.' : `Fuente: Banco Mundial, FP.CPI.TOTL. ${indexDate ? 'Actualizado: ' + indexDate.slice(0, 10) : 'Datos a\u00fan no disponibles.'} ${['partial', 'stale'].includes(snapshot.inflation?.state) ? 'Algunas referencias no pudieron actualizarse.' : ''}`)}
      </section><section ${panel === 'inflation' ? 'hidden' : ''}><h3>Metas actuales</h3>${caption(`Estado al consultar el informe (${dateLabel(today(), true)}), no al cierre hist\u00f3rico.`)}${plan().items.filter(item => item.kind === 'goal').map(goal => { const progress = goalProgress(goal); return line(goal.name, progress ? value(progress.remaining, goal.currency) + ' por completar' : 'Cuenta no disponible'); }).join('')}
      <h3>Pr\u00f3ximas fechas</h3>${calendar().filter(item => item.date >= today()).slice(0, 5).map(item => line(item.name, escapeHTML(dateLabel(item.date, true)))).join('') || caption('Sin fechas pendientes.')}</section>`;
  }

  function render() {
    if (!snapshot) return;
    const notices = alerts();
    select('#plan-alert-count').textContent = notices.length ? String(notices.length) : '';
    select('#plan-status').textContent = Portal.enabled && snapshot.remote_editing?.requests?.some(item => item.kind === 'planning' && item.state === 'pending') ? 'Cambio de plan pendiente de aplicar en la ejecuci\u00f3n diaria.' : snapshot.demo ? 'Plan de demostraci\u00f3n' : '';
    const container = select('#plan-content');
    container.innerHTML = panel === 'goals' ? renderGoals() : panel === 'calendar' ? renderCalendar() : ['history', 'milestones'].includes(panel) ? renderHistory() : ['reports', 'annual', 'inflation'].includes(panel) ? renderReports() : `<div class="section-heading"><h2>Alertas</h2>${action('Configurar alertas', 'settings', 'data-plan-new="alerts"')}</div>${caption('Avisos dentro de DEX. No se env\u00edan notificaciones con la app cerrada.')}${notices.map(item => `<div class="agenda-row"><div><h3 data-no-translate>${escapeHTML(item.name)}</h3><p class="subtle">${escapeHTML(item.text)}</p></div></div>`).join('') || caption(plan().alerts.enabled ? 'Sin avisos pendientes.' : 'Alertas desactivadas.')}`;
    icons();
  }

  function form(identifier) {
    const item = plan().items.find(row => row.id === identifier);
    const kind = item?.kind || identifier;
    const revision = plan().revision;
    select('#detail-eyebrow').textContent = 'PLAN';
    if (kind === 'alerts') {
      select('#detail-content').innerHTML = `<h2 id="detail-title">Alertas</h2><form id="plan-form" class="adjustment-form"><label class="setting-row"><span>Activar avisos</span><input id="plan-enabled" type="checkbox" class="switch" ${plan().alerts.enabled ? 'checked' : ''}></label><label>Anticipaci\u00f3n<select id="plan-days">${[7, 14, 30].map(days => `<option value="${days}" ${days === plan().alerts.days ? 'selected' : ''}>${days} d\u00edas</option>`).join('')}</select></label><p id="plan-error" class="form-error" role="alert"></p><button class="primary-action" type="submit">${icon('check')}Guardar</button></form>`;
    } else {
      const goal = kind === 'goal';
      select('#detail-content').innerHTML = `<h2 id="detail-title">${item ? 'Editar' : 'Crear'} ${goal ? 'meta' : kind === 'milestone' ? 'hito' : 'evento'}</h2><form id="plan-form" class="adjustment-form">
        <label>Nombre<input id="plan-name" required maxlength="80" autocomplete="off" value="${escapeHTML(item?.name || '')}"></label>
        <label>${goal ? 'Fecha objetivo' : 'Fecha'}<input id="plan-date" type="date" required min="1900-01-01" max="2200-12-31" value="${item?.date || today()}"></label>
        ${goal ? `<div class="form-columns"><label>Monto objetivo<input id="plan-amount" required inputmode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" value="${escapeHTML(item?.amount || '')}"></label><label>Moneda<select id="plan-currency"><option ${item?.currency !== 'CRC' ? 'selected' : ''}>USD</option><option ${item?.currency === 'CRC' ? 'selected' : ''}>CRC</option></select></label></div>
          <label>Progreso desde<select id="plan-account"><option value="">Monto apartado manualmente</option>${snapshot.accounts.map(account => `<option value="${escapeHTML(account.id)}" ${account.id === item?.account_id ? 'selected' : ''}>${escapeHTML(entryLabel(account))} \u00b7 ${account.currency}</option>`).join('')}</select></label>
          <label id="plan-saved-row">Monto apartado<input id="plan-saved" required inputmode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" value="${escapeHTML(item?.saved || '0')}"></label>
          <label class="setting-row"><span>Pausar meta</span><input id="plan-paused" type="checkbox" class="switch" ${item?.paused ? 'checked' : ''}></label>${caption('No mueve dinero ni modifica el patrimonio. Una cuenta solo puede vincularse a una meta activa.')}` : ''}
        <label>Nota<input id="plan-note" maxlength="500" value="${escapeHTML(item?.note || '')}"></label><p id="plan-error" class="form-error" role="alert"></p>
        <div class="form-actions">${item ? action('Eliminar', 'trash-2', 'id="plan-delete"') : ''}<button class="primary-action" type="submit">${icon('check')}Guardar</button></div>
        ${item ? '<div id="plan-confirm" hidden><p>\u00bfEliminar este elemento?</p><button id="plan-delete-confirm" type="button" class="primary-action danger">Eliminar</button></div>' : ''}</form>`;
      if (goal) {
        const updateAccount = () => {
          const account = snapshot.accounts.find(row => row.id === select('#plan-account').value);
          select('#plan-saved-row').hidden = !!account;
          select('#plan-saved').disabled = !!account;
          select('#plan-currency').disabled = !!account;
          if (account) select('#plan-currency').value = account.currency;
        };
        select('#plan-account').addEventListener('change', updateAccount);
        updateAccount();
      }
      select('#plan-delete')?.addEventListener('click', () => { select('#plan-confirm').hidden = false; });
      select('#plan-delete-confirm')?.addEventListener('click', () => save({operation: 'delete', id: item.id, revision}));
    }
    select('#plan-form').addEventListener('submit', event => {
      event.preventDefault();
      if (kind === 'alerts') return save({operation: 'alerts', revision, enabled: select('#plan-enabled').checked, days: Number(select('#plan-days').value)});
      const change = {operation: 'save', revision, kind, ...(item ? {id: item.id} : {}), name: select('#plan-name').value.trim(), date: select('#plan-date').value, note: select('#plan-note').value.trim()};
      if (kind === 'goal') Object.assign(change, {amount: select('#plan-amount').value.replace(',', '.'), saved: select('#plan-account').value ? '0' : select('#plan-saved').value.replace(',', '.'), currency: select('#plan-currency').value, account_id: select('#plan-account').value || null, paused: select('#plan-paused').checked});
      save(change);
    });
  }

  async function save(change) {
    if (saving) return;
    saving = true;
    all('#plan-form button').forEach(button => { button.disabled = true; });
    try {
      if (Portal.enabled) { await queueRemoteChange('planning', change); return; }
      const response = await fetch('/api/planning', {method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: {'X-DEX-Client': 'pwa', 'Content-Type': 'application/json'}, body: JSON.stringify(change), signal: AbortSignal.timeout(12000)});
      if (!response.ok) throw new Error(response.status === 409 ? 'El plan cambi\u00f3. Cierra y actualiza antes de editar.' : response.status === 400 ? 'Revisa monto, fecha y cuenta. No puedes asignar la misma cuenta a dos metas activas.' : 'Guardado sin confirmar. Actualiza antes de reintentar.');
      const updated = await response.json();
      validateSnapshot(updated);
      snapshot = updated;
      currentDetail = null;
      closeSheet();
      globalThis.dispatchEvent(new Event('dex-plan-saved'));
      showToast('Plan guardado');
    } catch (error) {
      const target = select('#plan-error');
      if (target) target.textContent = error.message;
    } finally {
      saving = false;
      all('#plan-form button').forEach(button => { button.disabled = false; });
    }
  }

  async function exportFile(name, text, type) {
    const file = new File([text], name, {type});
    try {
      if (navigator.canShare?.({files: [file]})) { await navigator.share({files: [file], title: 'DEX'}); return; }
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) { if (error.name !== 'AbortError') showToast('No se pudo exportar.'); }
  }

  function calendarText(event) {
    const escape = text => String(text).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    const nextDay = new Date(Date.parse(event.date + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10).replaceAll('-', '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DEX//Patrimonio//ES', 'BEGIN:VEVENT', `UID:${event.id}@dex.local`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`, `DTSTART;VALUE=DATE:${event.date.replaceAll('-', '')}`, `DTEND;VALUE=DATE:${nextDay}`, `SUMMARY:${escape(event.name)}`, `DESCRIPTION:${escape(event.note || '')}`, 'END:VEVENT', 'END:VCALENDAR'];
    return lines.map(line => {
      const segments = []; let segment = ''; let size = 0;
      for (const character of line) {
        const bytes = new TextEncoder().encode(character).length;
        if (size + bytes > 73) { segments.push(segment); segment = ' '; size = 1; }
        segment += character; size += bytes;
      }
      segments.push(segment); return segments.join('\r\n');
    }).join('\r\n') + '\r\n';
  }

  document.addEventListener('click', event => {
    const target = event.target.closest('[data-plan-new], [data-plan-edit], [data-plan-calendar], #plan-export');
    if (!target || !snapshot) return;
    if (target.dataset.planNew || target.dataset.planEdit) {
      if (hiddenAmounts && (target.dataset.planNew === 'goal' || plan().items.find(item => item.id === target.dataset.planEdit)?.kind === 'goal')) { showToast('Muestra los importes antes de editar una meta.'); return; }
      openDetail('planning', target.dataset.planEdit || target.dataset.planNew);
    } else if (target.dataset.planCalendar) {
      const entry = calendar().find(item => item.id === target.dataset.planCalendar);
      if (entry) exportFile('dex-evento.ics', calendarText(entry), 'text/calendar');
    } else if (lastReport && !hiddenAmounts) {
      const content = select('#plan-content').innerText;
      exportFile(`dex-${reportPeriod}.txt`, `DEX - Informe privado\n${content}`, 'text/plain');
    }
  });
  document.addEventListener('change', event => {
    if (event.target.id === 'plan-month') calendarMonth = event.target.value;
    else if (event.target.id === 'compare-from') comparisonDates[0] = event.target.value;
    else if (event.target.id === 'compare-to') comparisonDates[1] = event.target.value;
    else if (event.target.id === 'report-mode') { location.hash = event.target.value === 'year' ? 'anual' : 'mensual'; return; }
    else if (event.target.id === 'report-period') { reportPeriod = event.target.value; inflationYear = reportPeriod.slice(0, 4); }
    else if (event.target.id === 'inflation-country') inflationCountry = event.target.value;
    else if (event.target.id === 'inflation-year') inflationYear = event.target.value;
    else return;
    render();
  });
  return {render, route, form, compare, goalProgress, calendarText, get saving() { return saving; }};
})();