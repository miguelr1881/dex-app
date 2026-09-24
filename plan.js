'use strict';

const DexPlan = (() => {
  let panel = 'goals';
  let saving = false;
  let comparisonDates = [];
  let calendarMonth = '';
  let calendarDay = '';
  let reportPeriod = '';
  let reportMode = 'month';
  let lastReport = null;
  const routes = {plan: ['goals', 'Metas'], metas: ['goals', 'Metas'], calendario: ['calendar', 'Calendario'], comparar: ['history', 'Comparar fechas'], mensual: ['reports', 'Resumen mensual'], anual: ['annual', 'Ficha anual'], alertas: ['alerts', 'Alertas']};
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
    const entries = plan().items.filter(item => item.kind === 'event').map(item => ({...item, label: 'Evento'}));
    const next = snapshot.payroll?.configured && snapshot.payroll.espp?.next_purchase_on;
    if (next) entries.push({id: 'scheduled-espp', kind: 'automatic', name: 'Compra ESPP', date: next, note: 'Fecha programada; no confirma la compra ni su conciliaci\u00f3n.', label: 'Programado'});
    return entries.sort((first, last) => first.date.localeCompare(last.date) || first.name.localeCompare(last.name));
  }

  function alerts() {
    if (!plan().alerts.enabled) return [];
    const messages = [];
    for (const event of calendar().filter(item => item.kind === 'event' || item.kind === 'automatic')) {
      const days = daysBetween(today(), event.date);
      if (days >= 0 && days <= plan().alerts.days) messages.push({name: event.name, text: `En ${days} d\u00edas`});
    }
    const stale = snapshot.accounts.filter(account => account.as_of && daysBetween(account.as_of, today()) > 45);
    if (stale.length) messages.push({name: 'Fuentes pendientes', text: `${stale.length} cuenta(s) con corte de hace m\u00e1s de 45 d\u00edas`});
    return messages;
  }

  function renderGoals() {
    const thresholds = [10000, 25000, 50000, 100000, 250000, 500000, 750000, 1000000];
    const total = selectedTotal();
    const net = total.net == null ? null : decimal(total.net);
    const target = decimal('1000000');
    const visible = net != null && !hiddenAmounts;
    const percent = visible ? Math.min(100, Number(positive(net) * 1000n / target) / 10) : 0;
    const next = net == null ? null : thresholds.find(amount => decimal(String(amount)) > net);
    return `<section class="wealth-goal" aria-label="${I18n.translate('Objetivo patrimonial')}"><p class="small-label">Objetivo patrimonial</p><h2 data-no-translate>USD 1M</h2>
      ${line('Patrimonio actual', net == null ? '\u2014' : value(net))}
      <div class="wealth-progress" ${visible ? '' : 'hidden'}><progress max="100" value="${percent}" aria-label="${I18n.translate('Progreso hacia 1M')}"></progress><span data-no-translate>${percent.toLocaleString(I18n.locale)}%</span></div>
      ${line('Falta para 1M', net == null ? '\u2014' : value(positive(target - net)))}
      ${caption('Todo USD, con las fuentes seleccionadas y las restas aplicadas.')}</section>
      <ol class="wealth-milestones" aria-label="${I18n.translate('Hitos de patrimonio')}">${thresholds.map(amount => {
        const reached = visible && net >= decimal(String(amount));
        const upcoming = visible && amount === next;
        return `<li data-wealth-target="${amount}" class="${reached ? 'reached' : upcoming ? 'upcoming' : ''}"><span class="wealth-marker" aria-hidden="true">${reached ? icon('check') : upcoming ? icon('chevron-right') : ''}</span><strong data-no-translate>USD ${amount === 1000000 ? '1M' : amount / 1000 + 'k'}</strong><span class="small-label">${!visible ? '\u2014' : reached ? 'Alcanzada' : upcoming ? 'Pr\u00f3xima meta' : 'Pendiente'}</span></li>`;
      }).join('')}</ol>`;
  }

  function renderCalendar() {
    const entries = calendar();
    const currentDay = today();
    calendarMonth ||= currentDay.slice(0, 7);
    if (!calendarDay.startsWith(calendarMonth)) calendarDay = currentDay.startsWith(calendarMonth) ? currentDay : calendarMonth + '-01';
    const first = new Date(calendarMonth + '-01T12:00:00Z');
    const offset = (first.getUTCDay() + 6) % 7;
    const weekdays = Array.from({length: 7}, (_, index) => new Intl.DateTimeFormat(I18n.locale, {weekday: 'short', timeZone: 'UTC'}).format(new Date(Date.UTC(2024, 0, 1 + index))));
    const cells = Array.from({length: 42}, (_, index) => {
      const date = new Date(first.getTime() + (index - offset) * 86400000).toISOString().slice(0, 10);
      const count = entries.filter(item => item.date === date).length;
      return `<button type="button" class="calendar-day ${date.startsWith(calendarMonth) ? '' : 'outside-month'}" data-calendar-day="${date}" tabindex="${date === calendarDay ? 0 : -1}" aria-label="${escapeHTML(dateLabel(date, true))}${count ? `, ${count} ${I18n.translate('Eventos')}` : ''}" aria-pressed="${date === calendarDay}" ${date === currentDay ? 'aria-current="date"' : ''} ${date < '1900-01-01' || date > '2200-12-31' ? 'disabled' : ''}><span>${Number(date.slice(8))}</span><span class="calendar-marker" aria-hidden="true">${count ? '<i></i>' : ''}</span></button>`;
    }).join('');
    const shown = entries.filter(item => item.date === calendarDay);
    return `<div class="section-heading"><h2>Calendario</h2>${action('Crear evento', 'plus', 'data-plan-new="event"')}</div>
      <div class="calendar-toolbar">${action('Mes anterior', 'chevron-right', 'data-calendar-step="-1"')}
      <input id="plan-month" type="month" min="1900-01" max="2200-12" value="${calendarMonth}" aria-label="Mes">
      ${action('Mes siguiente', 'chevron-right', 'data-calendar-step="1"')}${action('Hoy', 'calendar-days', 'data-calendar-today')}</div>
      <div class="calendar-weekdays" aria-hidden="true">${weekdays.map(day => `<span data-no-translate>${escapeHTML(day)}</span>`).join('')}</div>
      <div class="calendar-grid" role="group" aria-label="${escapeHTML(new Intl.DateTimeFormat(I18n.locale, {month: 'long', year: 'numeric', timeZone: 'UTC'}).format(first))}">${cells}</div>
      <section class="calendar-agenda" aria-live="polite"><h3 data-no-translate>${escapeHTML(dateLabel(calendarDay, true))}</h3>
      ${shown.map(item => `<article class="agenda-row"><div><span class="small-label">${item.label}</span><h3 data-no-translate>${escapeHTML(item.name)}</h3>${item.note ? `<p class="subtle" data-no-translate>${escapeHTML(item.note)}</p>` : ''}</div><div class="plan-actions">${item.kind !== 'automatic' ? action('Editar', 'pencil', `data-plan-edit="${item.id}"`) : ''}${action('Exportar evento privado', 'download', `data-plan-calendar="${item.id}"`)}</div></article>`).join('') || caption('Sin eventos para este d\u00eda.')}</section>`;
  }

  function selectCalendarDay(date, focus = false) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '1900-01-01' || date > '2200-12-31') return;
    calendarDay = date;
    calendarMonth = date.slice(0, 7);
    render();
    if (focus) select(`[data-calendar-day="${date}"]`)?.focus({preventScroll: true});
  }

  function shiftCalendarMonth(step, focus = false) {
    const date = new Date(calendarMonth + '-01T12:00:00Z');
    date.setUTCMonth(date.getUTCMonth() + step);
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    selectCalendarDay(date.toISOString().slice(0, 7) + '-' + String(Math.min(Number(calendarDay.slice(8)), last)).padStart(2, '0'), focus);
  }

  function renderHistory() {
    const points = observations();
    if (!points.some(item => item.date === comparisonDates[0])) comparisonDates[0] = points[0]?.date;
    if (!points.some(item => item.date === comparisonDates[1])) comparisonDates[1] = points.at(-1)?.date;
    const options = selected => points.map(item => `<option value="${item.date}" ${item.date === selected ? 'selected' : ''}>${escapeHTML(dateLabel(item.date, true))}</option>`).join('');
    const result = compare(points.find(item => item.date === comparisonDates[0]), points.find(item => item.date === comparisonDates[1]));
    return `<div class="plan-fields"><label>Desde<select id="compare-from">${options(comparisonDates[0])}</select></label><label>Hasta<select id="compare-to">${options(comparisonDates[1])}</select></label></div>${comparisonMarkup(result)}`;
  }

  function renderReports() {
    const points = observations();
    const periods = [...new Set(points.map(item => item.date.slice(0, reportMode === 'year' ? 4 : 7)))].reverse();
    if (!periods.includes(reportPeriod)) reportPeriod = periods[0] || '';
    const selected = points.filter(item => item.date.startsWith(reportPeriod));
    const baseline = points.filter(item => item.date < (reportPeriod.length === 4 ? reportPeriod + '-01-01' : reportPeriod + '-01')).at(-1) || selected[0];
    lastReport = compare(baseline, selected.at(-1));
    return `<section><div class="section-heading"><h2>${reportMode === 'year' ? 'Ficha anual' : 'Resumen mensual'}</h2>${action('Exportar informe privado', 'download', `id="plan-export" ${hiddenAmounts || !lastReport ? 'disabled' : ''}`)}</div>
      <div class="plan-fields"><label>Informe<select id="report-mode"><option value="month" ${reportMode === 'month' ? 'selected' : ''}>Mensual</option><option value="year" ${reportMode === 'year' ? 'selected' : ''}>Anual</option></select></label><label>Periodo<select id="report-period">${periods.map(period => `<option ${period === reportPeriod ? 'selected' : ''}>${period}</option>`).join('')}</select></label></div>
      ${lastReport ? caption(`Cortes disponibles: ${dateLabel(lastReport.first, true)} a ${dateLabel(lastReport.last, true)}. Puede ser un periodo parcial.`) : ''}${comparisonMarkup(lastReport)}
      </section><section><h3>Objetivo patrimonial</h3>${line('Meta final', '<span data-no-translate>USD 1M</span>')}
      <h3>Pr\u00f3ximas fechas</h3>${calendar().filter(item => item.date >= today()).slice(0, 5).map(item => line(item.name, escapeHTML(dateLabel(item.date, true)))).join('') || caption('Sin fechas pendientes.')}</section>`;
  }

  function render() {
    if (!snapshot) return;
    const notices = alerts();
    select('#plan-alert-count').textContent = notices.length ? String(notices.length) : '';
    select('#plan-status').textContent = Portal.enabled && snapshot.remote_editing?.requests?.some(item => item.kind === 'planning' && item.state === 'pending') ? 'Cambio de plan pendiente de aplicar en la ejecuci\u00f3n diaria.' : snapshot.demo ? 'Plan de demostraci\u00f3n' : '';
    const container = select('#plan-content');
    container.innerHTML = panel === 'goals' ? renderGoals() : panel === 'calendar' ? renderCalendar() : panel === 'history' ? renderHistory() : ['reports', 'annual'].includes(panel) ? renderReports() : `<div class="section-heading"><h2>Alertas</h2>${action('Configurar alertas', 'settings', 'data-plan-new="alerts"')}</div>${caption('Avisos dentro de DEX. No se env\u00edan notificaciones con la app cerrada.')}${notices.map(item => `<div class="agenda-row"><div><h3 data-no-translate>${escapeHTML(item.name)}</h3><p class="subtle">${escapeHTML(item.text)}</p></div></div>`).join('') || caption(plan().alerts.enabled ? 'Sin avisos pendientes.' : 'Alertas desactivadas.')}`;
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
        <label>${goal ? 'Fecha objetivo' : 'Fecha'}<input id="plan-date" type="date" required min="1900-01-01" max="2200-12-31" value="${item?.date || (panel === 'calendar' ? calendarDay : today())}"></label>
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
      if (panel === 'calendar' && change.operation === 'save') { calendarDay = change.date; calendarMonth = change.date.slice(0, 7); }
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
    const calendarTarget = event.target.closest('[data-calendar-day], [data-calendar-step], [data-calendar-today]');
    if (calendarTarget && snapshot) {
      if (calendarTarget.dataset.calendarDay) selectCalendarDay(calendarTarget.dataset.calendarDay, true);
      else if (calendarTarget.hasAttribute('data-calendar-today')) selectCalendarDay(today(), true);
      else {
        const step = Number(calendarTarget.dataset.calendarStep);
        shiftCalendarMonth(step);
        select(`[data-calendar-step="${step}"]`)?.focus({preventScroll: true});
      }
      return;
    }
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
    if (event.target.id === 'plan-month') {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value) || !event.target.validity.valid) return;
      selectCalendarDay(event.target.value + '-01'); return;
    }
    else if (event.target.id === 'compare-from') comparisonDates[0] = event.target.value;
    else if (event.target.id === 'compare-to') comparisonDates[1] = event.target.value;
    else if (event.target.id === 'report-mode') { location.hash = event.target.value === 'year' ? 'anual' : 'mensual'; return; }
    else if (event.target.id === 'report-period') reportPeriod = event.target.value;
    else return;
    render();
  });
  document.addEventListener('keydown', event => {
    const date = event.target.dataset.calendarDay;
    if (!date) return;
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault(); shiftCalendarMonth(event.key === 'PageUp' ? -1 : 1, true); return;
    }
    const weekday = (new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7;
    const offset = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -weekday, End: 6 - weekday}[event.key];
    if (offset == null) return;
    event.preventDefault();
    selectCalendarDay(new Date(Date.parse(date + 'T12:00:00Z') + offset * 86400000).toISOString().slice(0, 10), true);
  });
  return {render, route, form, compare, goalProgress, calendarText, get saving() { return saving; }};
})();