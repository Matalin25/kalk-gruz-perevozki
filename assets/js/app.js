/* Калькулятор сборных грузоперевозок — логика приложения */
(function () {
  'use strict';

  const STORAGE = { data: 'kg_data_v1', url: 'kg_url_v1', orders: 'kg_orders_v1' };
  const $ = (sel, root) => (root || document).querySelector(sel);

  const state = {
    data: null,
    cargoType: 'standard',
    services: new Set(),
    result: null,
    onlineOrder: true,
    deferredInstall: null
  };

  /* ------------------------- Утилиты ------------------------- */
  const num = (v) => {
    const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
    return isFinite(n) ? n : 0;
  };
  const money = (n) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' ₽';
  const numFmt = (n, d = 2) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: d }).format(n);

  function toast(msg, type) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast show ' + (type || '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.className = 'toast ' + (type || ''); }, 3200);
  }

  /* ------------------------- Загрузка данных ------------------------- */
  function deepMerge(base, extra) {
    const out = JSON.parse(JSON.stringify(base));
    if (!extra) return out;
    ['settings', 'meta'].forEach((k) => { if (extra[k]) Object.assign(out[k], extra[k]); });
    ['cities', 'cargoTypes', 'services', 'directions'].forEach((k) => {
      if (Array.isArray(extra[k]) && extra[k].length) out[k] = extra[k];
    });
    return out;
  }

  function parsePriceRows(rows) {
    const density = (window.DEFAULT_DATA.settings.volumetricDensity) || 250;
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].map((c) => String(c == null ? '' : c).toLowerCase());
      if (r.some((c) => c.includes('город отправления'))) { headerIdx = i; break; }
    }
    if (headerIdx < 0) throw new Error('Не найдена строка заголовков');

    const header = rows[headerIdx].map((c) => String(c == null ? '' : c).toLowerCase().trim());
    const find = (needle) => header.findIndex((h) => h.includes(needle));
    const cFrom = find('отправления');
    const cTo = find('доставки');
    const cWeight = find('вес');
    const cVol = find('объём') >= 0 ? find('объём') : find('объем');
    const cBase = find('ставка');
    const cComment = find('комментарий');

    if (cFrom < 0 || cTo < 0) throw new Error('Не найдены колонки маршрутов');

    const cities = new Set();
    const map = new Map();
    const isRealPlace = (s) => s && s.length > 1 && !/^\d/.test(s);

    // Ячейки, отформатированные как дата (dd.mmm / mmm.yy), при чтении с
    // { cellDates: true } приходят как Date. Такие значения не являются
    // весом/объёмом/габаритом и должны игнорироваться.
    const isDateCell = (v) => v instanceof Date || (v && typeof v === 'object' && typeof v.getTime === 'function');
    const parseNum = (v) => {
      if (v == null || isDateCell(v)) return NaN;
      if (typeof v === 'number') return isFinite(v) ? v : NaN;
      const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
      return isFinite(n) ? n : NaN;
    };
    const sanitize = (v, max) => {
      const n = parseNum(v);
      return isFinite(n) && n > 0 && n <= max ? n : NaN;
    };

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const from = String(r[cFrom] == null ? '' : r[cFrom]).trim();
      const to = String(r[cTo] == null ? '' : r[cTo]).trim();
      if (!isRealPlace(from) || !isRealPlace(to)) continue;

      const base = sanitize(r[cBase], 1e9);
      if (!isFinite(base)) continue;

      // Вес (кг) и объём (м³). Даты-сериалы и мусор отбрасываются по границам.
      const weight = sanitize(r[cWeight], 100000);
      const volume = sanitize(r[cVol], 1000);

      const parts = [];
      if (isFinite(weight)) parts.push(weight);
      if (isFinite(volume)) parts.push(volume * density);
      const chargeable = parts.length ? Math.max.apply(null, parts) : NaN;
      if (!isFinite(chargeable) || chargeable <= 0) continue;

      const ratePerKg = +(base / chargeable).toFixed(2);

      cities.add(from); cities.add(to);
      map.set(from + '→' + to, {
        from, to, ratePerKg,
        days: undefined,
        comment: cComment >= 0 ? String(r[cComment] == null ? '' : r[cComment]) : ''
      });
    }
    if (!cities.size) throw new Error('Не удалось собрать города');
    return { cities: Array.from(cities), directions: Array.from(map.values()) };
  }

  async function fetchFromYandex(url) {
    const api = 'https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=' + encodeURIComponent(url);
    const info = await (await fetch(api, { cache: 'no-store' })).json();
    if (!info || !info.href) throw new Error('Яндекс.Диск: ссылка недоступна');
    const buf = await (await fetch(info.href)).arrayBuffer();
    if (typeof XLSX === 'undefined') throw new Error('Парсер таблиц не загружен');
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    return parsePriceRows(rows);
  }

  function normalizeData(d) {
    const daysByRoute = new Map(window.DEFAULT_DATA.directions.map((x) => [x.from + '→' + x.to, x.days]));
    (d.directions || []).forEach((x) => {
      if (!x.days) x.days = daysByRoute.get(x.from + '→' + x.to) || d.settings.defaultDays;
    });
    return d;
  }

  function setStatus(kind, text) {
    const dot = $('#dataDot');
    dot.className = 'dot ' + (kind || '');
    $('#dataStatusText').textContent = text;
  }

  async function loadData(force) {
    const url = localStorage.getItem(STORAGE.url) || window.DEFAULT_DATA.meta.sourceUrl;
    let base = deepMerge(window.DEFAULT_DATA, null);

    const cached = localStorage.getItem(STORAGE.data);
    if (cached) {
      try { base = deepMerge(window.DEFAULT_DATA, JSON.parse(cached)); } catch (e) { /* ignore */ }
    }

    if (!force && cached) { state.data = normalizeData(base); return; }

    setStatus('loading', 'Обновление с Яндекс.Диска…');
    try {
      const remote = await fetchFromYandex(url);
      state.data = normalizeData(deepMerge(window.DEFAULT_DATA, remote));
      localStorage.setItem(STORAGE.data, JSON.stringify(remote));
      localStorage.setItem(STORAGE.url, url);
      setStatus('', 'Данные обновлены · ' + new Date().toLocaleDateString('ru-RU'));
    } catch (err) {
      state.data = normalizeData(base);
      setStatus('offline', cached ? 'Офлайн-данные' : 'Локальные тарифы');
      if (force) toast('Не удалось обновить с Яндекс.Диска: ' + err.message, 'err');
    }
  }

  /* ------------------------- Рендер интерфейса ------------------------- */
  function fillSelect(sel, cities, value) {
    sel.innerHTML = cities.map((c) => `<option value="${c}">${c}</option>`).join('');
    if (value && cities.includes(value)) sel.value = value;
  }

  function renderCities() {
    const cities = state.data.cities.slice().sort((a, b) => a.localeCompare(b, 'ru'));
    const fromSel = $('#from'), toSel = $('#to');
    const prevFrom = fromSel.value, prevTo = toSel.value;
    fillSelect(fromSel, cities, prevFrom || 'Москва');
    fillSelect(toSel, cities, prevTo || (cities.includes('Казань') ? 'Казань' : cities[1]));
    if (fromSel.value === toSel.value) {
      const alt = cities.find((c) => c !== fromSel.value);
      if (alt) toSel.value = alt;
    }
  }

  function renderCargoChips() {
    const box = $('#cargoChips');
    box.innerHTML = state.data.cargoTypes.map((t) => `
      <button type="button" class="chip ${t.id === state.cargoType ? 'active' : ''}" data-cargo="${t.id}">
        <span class="chip-ico">${t.icon || '📦'}</span>${t.name}
      </button>`).join('');
    box.querySelectorAll('[data-cargo]').forEach((el) => {
      el.addEventListener('click', () => {
        state.cargoType = el.dataset.cargo;
        renderCargoChips();
        calculate();
      });
    });
    const t = state.data.cargoTypes.find((x) => x.id === state.cargoType);
    $('#cargoHint').textContent = t ? `Коэффициент к тарифу: ×${t.coef}` : '';
  }

  function renderServices() {
    const box = $('#servicesList');
    box.innerHTML = state.data.services.map((s) => `
      <div class="svc ${state.services.has(s.id) ? 'active' : ''}" data-svc="${s.id}">
        <div class="svc-ico">${s.icon || '➕'}</div>
        <div class="svc-body">
          <div class="svc-name">${s.name}</div>
          <div class="svc-hint">${s.hint || ''}</div>
        </div>
        <div class="svc-price">${money(s.price)}</div>
        <div class="check">✓</div>
      </div>`).join('');
    box.querySelectorAll('[data-svc]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.svc;
        if (state.services.has(id)) state.services.delete(id); else state.services.add(id);
        renderServices();
        calculate();
      });
    });
  }

  /* ------------------------- Расчёт ------------------------- */
  function computeVolume() {
    const l = num($('#len').value), w = num($('#wid').value), h = num($('#hei').value);
    const places = Math.max(1, parseInt($('#places').value, 10) || 1);
    const dimV = l > 0 && w > 0 && h > 0 ? l * w * h * places : 0;
    const hint = $('#volCalcHint');
    if (dimV > 0) {
      hint.innerHTML = `Расчётный объём по габаритам: <b class="mono-hint">${numFmt(dimV, 3)} м³</b> (${places} мест). Для расчёта берётся наибольший объём.`;
    } else {
      hint.textContent = '';
    }
    return dimV;
  }

  function calculate() {
    if (!state.data) return;
    const density = state.data.settings.volumetricDensity;
    const from = $('#from').value, to = $('#to').value;

    const weight = num($('#weight').value);
    const vEntered = num($('#volume').value);
    const dimV = computeVolume();
    const volume = Math.max(vEntered, dimV);
    const volWeight = volume * density;
    const chargeable = Math.max(weight, volWeight);

    const dir = state.data.directions.find((d) => d.from === from && d.to === to);
    const rate = dir ? dir.ratePerKg : state.data.settings.defaultRatePerKg;
    let days = dir && dir.days ? dir.days : state.data.settings.defaultDays;
    const cargo = state.data.cargoTypes.find((c) => c.id === state.cargoType) || state.data.cargoTypes[0];
    if (cargo.id === 'temp') days += state.data.settings.tempExtraDays;

    let transport = chargeable * rate;
    let minApplied = false;
    if (transport > 0 && transport < state.data.settings.minCharge) {
      transport = state.data.settings.minCharge;
      minApplied = true;
    }
    transport *= cargo.coef;

    const chosen = state.data.services.filter((s) => state.services.has(s.id));
    const servicesTotal = chosen.reduce((sum, s) => sum + s.price, 0);

    const subtotal = transport + servicesTotal;
    const discPct = state.data.settings.onlineDiscountPercent;
    const discount = state.onlineOrder ? subtotal * discPct / 100 : 0;
    const total = Math.max(0, subtotal - discount);

    state.result = {
      from, to, weight, volume, dimV, volWeight, chargeable, rate, days, cargo,
      transport, minApplied, services: chosen, servicesTotal, subtotal, discount, total,
      chargedByVolume: volWeight > weight && volWeight > 0
    };

    renderResult();
  }

  /* ------------------------- Вывод результата ------------------------- */
  function renderBadges(r) {
    const b = [];
    b.push(`<span class="badge">🗓 Срок ~${r.days} дн.</span>`);
    b.push(`<span class="badge">${r.cargo.icon || ''} ${r.cargo.short || r.cargo.name}</span>`);
    if (r.chargeable > 0) b.push(`<span class="badge">⚖️ К оплате ${numFmt(r.chargeable, 0)} кг</span>`);
    if (r.chargedByVolume) b.push(`<span class="badge good">объёмный вес</span>`);
    $('#resultBadges').innerHTML = b.join('');
  }

  function renderResult() {
    const r = state.result;
    if (!r) return;

    const amountEl = $('#totalAmount');
    animateNumber(amountEl, r.total);
    $('#routeLabel').textContent = `${r.from} → ${r.to}`;
    renderBadges(r);

    const rows = [];
    const add = (k, v, cls) => rows.push(`<div class="brow ${cls || ''}"><span class="k">${k}</span><span class="v">${v}</span></div>`);

    add('Вес груза', numFmt(r.weight, 2) + ' кг');
    add('Объём груза', numFmt(r.volume, 3) + ' м³' + (r.dimV > 0 && r.dimV >= r.volume ? ' (по габаритам)' : ''));
    add('Объёмный вес', numFmt(r.volWeight, 1) + ' кг');
    add('Расчётный вес', numFmt(r.chargeable, 1) + ' кг');
    add('Тариф', numFmt(r.rate, 2) + ' ₽/кг');
    add('Перевозка', money(r.chargeable * r.rate));
    if (r.cargo.coef !== 1) add(`Тип груза (×${r.cargo.coef})`, money(r.transport - r.chargeable * r.rate));
    if (r.minApplied) add('Минимальная стоимость рейса', money(state.data.settings.minCharge));
    if (r.servicesTotal) add('Дополнительные услуги', money(r.servicesTotal));
    if (r.discount) add(`Скидка за онлайн-заказ (${state.data.settings.onlineDiscountPercent}%)`, '−' + money(r.discount), 'discount');
    add('Итого к оплате', money(r.total), 'total');

    $('#breakdown').innerHTML = rows.join('');
    $('#sourceHint').innerHTML = `Тариф по направлению «${r.from} → ${r.to}»`;
  }

  function animateNumber(el, target) {
    const start = num(el.dataset.val || 0);
    const dur = 480, t0 = performance.now();
    el.dataset.val = target;
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    function step(now) {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = money(start + (target - start) * eased);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = money(target);
    }
    requestAnimationFrame(step);
  }

  /* ------------------------- Онлайн-заявка ------------------------- */
  function openModal() {
    if (!state.result) { toast('Сначала рассчитайте стоимость', 'err'); return; }
    const r = state.result;
    const dims = [num($('#len').value), num($('#wid').value), num($('#hei').value)];
    $('#oDims').value = (dims[0] || dims[1] || dims[2]) ? dims.map((d) => numFmt(d, 2)).join(' × ') + ' м' : '—';
    $('#oPlaces').value = ($('#places').value || 1) + ' шт';
    $('#oWeight').value = numFmt(r.weight, 2) + ' кг';
    $('#oVolume').value = numFmt(r.volume, 3) + ' м³';
    if (!$('#oDate').value) {
      const d = new Date(); d.setDate(d.getDate() + 1);
      $('#oDate').value = d.toISOString().slice(0, 10);
    }

    const svc = r.services.length
      ? r.services.map((s) => `• ${s.name} — ${money(s.price)}`).join('<br>')
      : '— не выбраны —';

    $('#orderSummary').innerHTML = `
      <div class="line"><span class="k">Маршрут</span><span>${r.from} → ${r.to}</span></div>
      <div class="line"><span class="k">Груз</span><span>${numFmt(r.weight, 2)} кг · ${numFmt(r.volume, 3)} м³ · ${$('#places').value} мест</span></div>
      <div class="line"><span class="k">Срок доставки</span><span>~${r.days} дн.</span></div>
      <div class="line"><span class="k">Доп. услуги</span><span style="text-align:right">${svc}</span></div>
      <div class="line total"><span>Итого</span><span>${money(r.total)}</span></div>`;

    $('#modal').classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('#oName').focus(), 250);
  }

  function closeModal() {
    $('#modal').classList.remove('open');
    document.body.style.overflow = '';
  }

  function buildOrderText(r) {
    const s = (v) => (v && String(v).trim()) || '—';
    const chosen = r.services.length ? r.services.map((x) => `- ${x.name} (${money(x.price)})`).join('\n') : '- нет';
    return [
      'ЗАЯВКА НА ПЕРЕВОЗКУ СБОРНОГО ГРУЗА',
      'Дата: ' + new Date().toLocaleString('ru-RU'),
      '',
      'МАРШРУТ: ' + r.from + ' → ' + r.to,
      'Срок доставки: ~' + r.days + ' дн.',
      'Тип груза: ' + r.cargo.name,
      'Дата отправки: ' + s($('#oDate').value) + (($('#oTime').value) ? ' в ' + $('#oTime').value : ''),
      '',
      'ОПИСАНИЕ ГРУЗА',
      'Наименование: ' + s($('#oName').value),
      'Габариты: ' + s($('#oDims').value) + ', мест: ' + s($('#oPlaces').value),
      'Вес: ' + s($('#oWeight').value) + ', объём: ' + s($('#oVolume').value),
      'Примечания: ' + s($('#oNotes').value),
      '',
      'ДОПОЛНИТЕЛЬНЫЕ УСЛУГИ:',
      chosen,
      '',
      'ОПЛАТА: ' + s($('#oPay').value),
      '',
      'ОТПРАВИТЕЛЬ: ' + s($('#sName').value) + ', тел. ' + s($('#sPhone').value),
      'Адрес: ' + s($('#sAddr').value),
      'ПОЛУЧАТЕЛЬ: ' + s($('#rName').value) + ', тел. ' + s($('#rPhone').value),
      'Адрес: ' + s($('#rAddr').value),
      '',
      (r.discount ? 'Скидка за онлайн-заказ: −' + money(r.discount) + '\n' : '') + 'ИТОГО К ОПЛАТЕ: ' + money(r.total)
    ].join('\n');
  }

  function collectOrder(r) {
    const val = (s) => { const el = $(s); return el ? el.value.trim() : ''; };
    return {
      ref: 'ЗК-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + String(Date.now()).slice(-4),
      cargo: val('#oName') || (r ? r.cargo.name : ''),
      dims: val('#oDims'), places: val('#oPlaces'),
      weight: val('#oWeight'), volume: val('#oVolume'),
      notes: val('#oNotes'), date: val('#oDate'), time: val('#oTime'), pay: val('#oPay'),
      clientEmail: val('#oEmail'),
      sName: val('#sName'), sPhone: val('#sPhone'), sAddr: val('#sAddr'),
      rName: val('#rName'), rPhone: val('#rPhone'), rAddr: val('#rAddr')
    };
  }

  function buildOrderForm(order, r, text) {
    const services = r.services.length ? r.services.map((s) => `${s.name} (${money(s.price)})`).join(', ') : 'нет';
    const fd = new FormData();
    fd.append('form-name', 'order');
    fd.append('ref', order.ref);
    fd.append('route', `${r.from} → ${r.to}`);
    fd.append('cargo', [order.cargo, `${order.weight} кг`, `${order.volume} м³`, `${order.places} мест`, order.dims].filter(Boolean).join(', '));
    fd.append('services', services);
    fd.append('total', money(r.total));
    fd.append('sender', [order.sName, order.sPhone, order.sAddr].filter(Boolean).join(', '));
    fd.append('recipient', [order.rName, order.rPhone, order.rAddr].filter(Boolean).join(', '));
    fd.append('clientEmail', order.clientEmail);
    fd.append('message', text);
    // Спец-поля Formspree: тема письма, reply-to и копия клиенту.
    fd.append('_subject', `Заявка ${order.ref} — ${r.from} → ${r.to}`);
    if (order.clientEmail) {
      fd.append('email', order.clientEmail);
      fd.append('_cc', order.clientEmail);
    }
    fd.append('_gotcha', '');
    return fd;
  }

  async function submitOrder(fd) {
    const meta = (state.data && state.data.meta) || {};
    const endpoint = (meta.orderEndpoint || '').trim();

    let res;
    if (endpoint) {
      // Vanilla JS (Ajax): отправка заявки на Formspree.
      if (meta.orderAccessKey) fd.append('access_key', meta.orderAccessKey);
      res = await fetch(endpoint, {
        method: 'POST',
        body: fd,
        headers: { Accept: 'application/json' }
      });
    } else {
      // Резерв: Netlify Forms
      res = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fd).toString()
      });
    }

    let data = null;
    try { data = await res.json(); } catch (e) { /* ответ без JSON */ }

    if (!res.ok || (data && data.ok === false)) {
      const details = data && Array.isArray(data.errors)
        ? data.errors.map((x) => (x && (x.message || x.field)) || '').filter(Boolean).join('; ')
        : ((data && data.error) || ('HTTP ' + res.status));
      throw new Error(details || 'Не удалось отправить заявку');
    }
    return data;
  }

  function openMailto(order, r, text) {
    const meta = (state.data && state.data.meta) || {};
    const to = meta.orderEmail || 'matalin@inbox.ru';
    const subject = encodeURIComponent(`Заявка ${order.ref} на перевозку ${r.from} → ${r.to}`);
    const body = encodeURIComponent(text);
    let link = `mailto:${to}?subject=${subject}&body=${body}`;
    if (order.clientEmail) link += `&cc=${encodeURIComponent(order.clientEmail)}`;
    window.location.href = link;
  }

  async function sendOrder() {
    const r = state.result;
    if (!r) { toast('Сначала рассчитайте стоимость', 'err'); return; }

    const order = collectOrder(r);
    if (!order.sName || !order.sPhone) { toast('Укажите контактное лицо и телефон отправителя', 'err'); return; }

    const text = buildOrderText(r);
    try {
      const hist = JSON.parse(localStorage.getItem(STORAGE.orders) || '[]');
      hist.unshift({ created: new Date().toISOString(), ref: order.ref, result: r, order: order, text: text });
      localStorage.setItem(STORAGE.orders, JSON.stringify(hist.slice(0, 50)));
    } catch (e) { /* ignore */ }

    const btn = $('#sendBtn');
    const prev = btn.innerHTML;
    btn.disabled = true; btn.textContent = 'Отправка…';
    try {
      await submitOrder(buildOrderForm(order, r, text));
      closeModal();
      showSuccess(order.ref, r, false);
    } catch (err) {
      console.warn('Formspree error:', err && err.message);
      closeModal();
      showSuccess(order.ref, r, true);
      openMailto(order, r, text);
    } finally {
      btn.disabled = false; btn.innerHTML = prev;
    }
  }

  function showSuccess(ref, r, viaMail) {
    $('#successRef').textContent = ref;
    const sub = document.querySelector('.success-sub');
    if (sub) {
      sub.textContent = viaMail
        ? 'Заявка подготовлена и открыта в вашем почтовом клиенте. Проверьте письмо и отправьте его, если оно не ушло автоматически.'
        : 'Мы получили заявку и свяжемся с вами в ближайшее время для подтверждения расчёта и условий доставки.';
    }
    const chosen = r.services.length ? r.services.map((s) => s.name).join(', ') : 'не выбраны';
    $('#successSummary').innerHTML = `
      <div class="brow"><span class="k">Маршрут</span><span class="v">${r.from} → ${r.to}</span></div>
      <div class="brow"><span class="k">Груз</span><span class="v">${numFmt(r.weight, 2)} кг · ${numFmt(r.volume, 3)} м³</span></div>
      <div class="brow"><span class="k">Доп. услуги</span><span class="v">${chosen}</span></div>
      <div class="brow total"><span class="k">Итого</span><span class="v">${money(r.total)}</span></div>`;
    const m = $('#successModal');
    m.classList.add('open');
    m.querySelector('.success-modal').classList.remove('open'); void m.offsetWidth;
    m.querySelector('.success-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('#successClose').focus(), 300);
  }

  function closeSuccess() {
    $('#successModal').classList.remove('open');
    document.body.style.overflow = '';
  }

  /* ------------------------- Анимация кнопок ------------------------- */
  function attachRipple() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn');
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const span = document.createElement('span');
      span.className = 'ripple';
      span.style.width = span.style.height = size + 'px';
      span.style.left = (e.clientX - rect.left - size / 2) + 'px';
      span.style.top = (e.clientY - rect.top - size / 2) + 'px';
      btn.appendChild(span);
      setTimeout(() => span.remove(), 620);
    });
  }

  /* ------------------------- PWA ------------------------- */
  function initPWA() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
      });
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      state.deferredInstall = e;
      const btn = $('#refreshBtn').cloneNode(true);
      btn.id = 'installBtn';
      btn.textContent = '⬇';
      btn.title = 'Установить приложение';
      btn.style.display = 'grid';
      btn.addEventListener('click', async () => {
        btn.remove();
        state.deferredInstall.prompt();
        try { await state.deferredInstall.userChoice; } catch (err) { /* ignore */ }
        state.deferredInstall = null;
      });
      $('#dataStatus').after(btn);
    });
  }

  /* ------------------------- Инициализация ------------------------- */
  function wire() {
    ['#from', '#to'].forEach((s) => $(s).addEventListener('change', calculate));
    ['#weight', '#volume', '#len', '#wid', '#hei', '#places'].forEach((s) =>
      $(s).addEventListener('input', calculate));
    $('#onlineOrder').addEventListener('change', (e) => { state.onlineOrder = e.target.checked; calculate(); });
    $('#refreshBtn').addEventListener('click', async () => { await loadData(true); renderAll(); toast('Данные обновлены', 'ok'); });
    $('#submitBtn').addEventListener('click', openModal);
    $('#modalClose').addEventListener('click', closeModal);
    $('#cancelBtn').addEventListener('click', closeModal);
    $('#sendBtn').addEventListener('click', sendOrder);
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
    $('#successClose').addEventListener('click', closeSuccess);
    $('#successModal').addEventListener('click', (e) => { if (e.target.id === 'successModal') closeSuccess(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeSuccess(); } });
  }

  function renderAll() {
    renderCities();
    renderCargoChips();
    renderServices();
    $('#discountPctLabel').textContent = state.data.settings.onlineDiscountPercent + '%';
    calculate();
  }

  async function init() {
    $('#discountPctLabel').textContent = window.DEFAULT_DATA.settings.onlineDiscountPercent + '%';
    await loadData(false);
    renderAll();
    wire();
    attachRipple();
    initPWA();
    // фоновая попытка обновления с Яндекс.Диска
    if (!localStorage.getItem(STORAGE.data)) {
      loadData(true).then(renderAll);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
