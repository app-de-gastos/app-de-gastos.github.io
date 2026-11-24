const KEY = 'gastos-v1', $ = s => document.querySelector(s);
const CATS = ['Comida', 'Súper', 'Transporte', 'Salidas', 'Casa', 'Salud', 'Ropa', 'Otros'];
const fresh = () => ({ cfg: null, expenses: [], incomes: [], savings: [], fixed: [], installments: [], goal: null, targets: {}, lastBackup: null });
// Modo prueba: fecha simulada y datos en otra clave; los reales no se tocan.
const SIMKEY = 'gastos-sim', SIMDATE = 'gastos-sim-fecha';
let SIM = null;
try { SIM = localStorage.getItem(SIMKEY) ? localStorage.getItem(SIMDATE) : null; } catch (e) {}
const key = () => SIM ? SIMKEY : KEY;
let S = load(), tab = 'hoy';
function load() { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(key()) || '{}') }; } catch (e) { return fresh(); } }
function save() { try { localStorage.setItem(key(), JSON.stringify(S)); return true; } catch (e) { alert('No se pudo guardar en este celular. Exportá una copia desde Ajustes.'); return false; } }
const today = () => SIM || Calc.iso(new Date());
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const nf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }), nf2 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const money = (n, cur) => (n < 0 && Math.round(n) ? '−' : '') + (cur === 'USD' ? 'US$ ' + nf2.format(Math.abs(n)) : '$ ' + nf.format(Math.abs(n)));
const num = v => { const n = Number(String(v || '').replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
const fd = s => Calc.parse(s).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const show = n => n ? nf2.format(n) : '';
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('on'), 2000); }
// Formato argentino mientras se escribe: 12.500,50
document.addEventListener('input', e => {
  if (!e.target.matches('[data-n]')) return;
  let v = e.target.value;
  if (e.inputType === 'insertText' && v.endsWith('.')) v = v.slice(0, -1) + ',';
  v = v.replace(/[^\d,]/g, '');
  const i = v.indexOf(','), a = i < 0 ? v : v.slice(0, i);
  e.target.value = a.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+$)/g, '.') + (i < 0 ? '' : ',' + v.slice(i + 1).replace(/,/g, '').slice(0, 2));
});

// ---- formularios
const inp = (l, n, v, x = '') => `<label>${l}<input name="${n}" value="${esc(v)}" ${x}></label>`;
const N = 'data-n inputmode="decimal" autocomplete="off"';
const amt = (v, l = 'Monto') => inp(l, 'amount', show(v), N + ' class="amt" placeholder="0"');
const chips = (n, arr, sel) => `<div class="chips">${arr.map(([v, t]) => `<label><input type="radio" name="${n}" value="${esc(v)}" ${v === sel ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>`;
const curs = c => chips('cur', [['ARS', 'Pesos'], ['USD', 'Dólares']], c || 'ARS');
function sheet(title, html, onSave, onDelete) {
  const d = $('#dlg');
  d.innerHTML = `<form novalidate><h1>${title}</h1>${html}<p class="bad" id="err" role="alert"></p><button class="btn">Guardar</button>${onDelete ? '<button type="button" class="btn d" id="del">Borrar</button>' : ''}<button type="button" class="btn s" id="no">Cancelar</button></form>`;
  d.querySelector('form').onsubmit = e => {
    e.preventDefault();
    const err = onSave(Object.fromEntries(new FormData(e.target)));
    if (err) { $('#err').textContent = err; return; }
    if (save()) { d.close(); render(); toast(sheet.msg || 'Guardado'); sheet.msg = ''; }
  };
  $('#no').onclick = () => d.close();
  if (onDelete) $('#del').onclick = () => { if (confirm('¿Borrar? No se puede deshacer.')) { onDelete(); save(); d.close(); render(); } };
  d.showModal();
  const a = d.querySelector('.amt'); if (a) a.focus();
}
function entry(list, id, title, extra, preset, more) {
  const o = S[list].find(x => x.id === id), x = o || { date: today(), ...preset };
  sheet(title, amt(x.amount) + curs(x.cur) + extra(x) + inp('Fecha', 'date', x.date, `type="date" max="${today()}"`), f => {
    const amount = num(f.amount);
    if (!(amount > 0)) return 'Poné un monto mayor a cero.';
    if (!f.date || f.date > today()) return 'Elegí una fecha de hoy o anterior.';
    const v = { amount, cur: f.cur, cat: f.cat, note: (f.note || '').trim(), date: f.date };
    // El dólar queda a la cotización del día en que se anotó.
    v.rate = f.cur === 'USD' ? (o && o.cur === 'USD' ? o.rate : S.cfg.rate) : undefined;
    if (more) Object.assign(v, more(f));
    const before = Calc.compute(S, today()).target;
    o ? Object.assign(o, v) : S[list].push({ id: uid(), ...v });
    const after = Calc.compute(S, today()).target;
    if (list === 'incomes' && Math.round(after) !== Math.round(before)) sheet.msg = `Ahorro sugerido: ${money(before)} → ${money(after)}`;
  }, o && (() => { S[list] = S[list].filter(y => y.id !== id); }));
}
const note = x => inp('Nota (opcional)', 'note', x.note, 'autocomplete="off"');
const cfgFields = c => inp('¿Cuánto cobrás por mes, aproximado? (en pesos)', 'income', show(c.income), N) + inp('Día de cobro (1 a 28)', 'payday', c.payday || 1, 'inputmode="numeric"') + inp('¿Cuánto calculás gastar en todo el mes, aproximado? Incluí todo: alquiler, servicios, cuotas, comida, salidas…', 'estimate', show(c.estimate), N) + inp('Cotización del dólar que usás', 'rate', show(c.rate), N);
function setCfg(f) {
  const payday = Number(f.payday), income = num(f.income), rate = num(f.rate), estimate = num(f.estimate);
  if (!(income > 0)) return 'Poné tu sueldo.';
  if (!Number.isInteger(payday) || payday < 1 || payday > 28) return 'El día de cobro va de 1 a 28.';
  if (!(estimate > 0)) return 'Poné cuánto calculás gastar en el mes.';
  if (!(rate > 0)) return 'Poné la cotización del dólar.';
  const was = S.cfg && Calc.expected(S, Calc.period(today(), S.cfg.payday));
  S.cfg = { ...(S.cfg || { since: today() }), ...(S.cfg && income !== was ? { incomeAt: today() } : {}), income: S.cfg && income === was ? S.cfg.income : income, payday, estimate, rate };
}
const forms = {
  expenses: id => entry('expenses', id, id ? 'Editar gasto' : 'Nuevo gasto', x => chips('cat', [...new Set([...CATS, ...(x.cat ? [x.cat] : [])])].map(c => [c, esc(c)]), x.cat || 'Otros') + note(x)),
  incomes: id => entry('incomes', id, 'Ingreso extra', x => '<p class="mut">Un laburo, una venta, un regalo. Cuenta solo para este mes.</p>' + note(x)),
  salary: id => {
    const pd = S.cfg.payday, r = Calc.compute(S, today()), p = r.p, next = Calc.period(today(), pd, 1);
    const left = Math.max(0, r.base0 - r.salary);
    const near = r.left <= 7;
    entry('incomes', id, 'Cobré el sueldo', x => chips('kind', [['sueldo', 'Completo'], ['parte', 'Una parte']], x.kind)
      + (id ? '' : chips('for', [[p.start, 'Para este mes'], [next.start, 'Para el que viene']], x.for)) + note(x),
    { amount: near ? r.expected : left, kind: 'sueldo', for: near ? next.start : p.start }, f => ({ kind: f.kind, ...(f.for ? { for: f.for } : {}) }));
  },
  savings: id => entry('savings', id, 'Guardé plata', note),
  fixed: id => {
    const o = S.fixed.find(x => x.id === id), x = o || {};
    sheet('Gasto fijo mensual', amt(x.amount) + curs(x.cur) + inp('Nombre', 'name', x.name, 'placeholder="Alquiler, internet…"'), f => {
      const v = { amount: num(f.amount), cur: f.cur, name: f.name.trim() };
      if (!(v.amount > 0) || !v.name) return 'Completá el nombre y el monto.';
      o ? Object.assign(o, v) : S.fixed.push({ id: uid(), ...v });
    }, o && (() => { S.fixed = S.fixed.filter(y => y.id !== id); }));
  },
  installments: id => {
    const o = S.installments.find(x => x.id === id), x = o || { n: 3, first: Calc.period(today(), S.cfg.payday, 1).start };
    sheet('Compra en cuotas', amt(x.total, 'Monto total (con interés)') + curs(x.cur) + inp('Qué compraste', 'name', x.name) + inp('Cantidad de cuotas', 'n', x.n, 'inputmode="numeric"') + inp('Fecha de la primera cuota', 'first', x.first, 'type="date"'), f => {
      const n = Number(f.n), total = num(f.amount);
      if (!(total > 0) || !f.name.trim()) return 'Completá qué compraste y el total.';
      if (!Number.isInteger(n) || n < 1 || n > 60) return 'Las cuotas van de 1 a 60.';
      if (!f.first) return 'Elegí la fecha de la primera cuota.';
      const v = { total, cur: f.cur, name: f.name.trim(), n, first: f.first };
      o ? Object.assign(o, v) : S.installments.push({ id: uid(), ...v });
    }, o && (() => { S.installments = S.installments.filter(y => y.id !== id); }));
  },
  goal: () => {
    const x = S.goal || { cur: 'USD' };
    sheet('Meta de ahorro', amt(x.amount) + curs(x.cur) + inp('Para qué', 'name', x.name, 'placeholder="Viaje, fondo de emergencia…"') + inp('Ya tenía ahorrado (misma moneda)', 'initial', show(x.initial), N), f => {
      if (!(num(f.amount) > 0) || !f.name.trim()) return 'Completá para qué es y el monto.';
      S.goal = { amount: num(f.amount), cur: f.cur, name: f.name.trim(), initial: num(f.initial) };
    }, S.goal && (() => { S.goal = null; }));
  },
  cfg: () => sheet('Tus números', cfgFields({ ...S.cfg, income: Calc.expected(S, Calc.period(today(), S.cfg.payday)) }), setCfg)
};
function addMenu() {
  const d = $('#dlg');
  d.innerHTML = `<h1>¿Qué anotamos?</h1>${[['expenses', 'Gasto'], ['installments', 'Compra en cuotas'], ['savings', 'Guardé plata'], ['salary', 'Cobré el sueldo'], ['incomes', 'Ingreso extra']].map(([k, t]) => `<button class="btn s" data-f="${k}">${t}</button>`).join('')}<button class="btn d" id="no">Cancelar</button>`;
  $('#no').onclick = () => d.close();
  d.showModal();
}

// ---- pantallas
const row = (k, x, t, sub, v) => `<button class="row" data-f="${k}" data-id="${esc(x.id)}"><span>${esc(t)}<small>${esc(sub)}</small></span><b>${v}</b></button>`;
const line = (t, v) => `<div class="row"><span>${t}</span><b>${v}</b></div>`;
const bar = p => `<div class="bar"><i style="width:${Math.min(100, p)}%"></i></div>`;
const V = {
  hoy(r) {
    const ex = S.expenses.filter(e => e.date === today()).reverse(), g = S.goal;
    let goal = '<button class="btn s" data-f="goal">Crear una meta</button>';
    if (g) {
      const have = (g.initial || 0) + S.savings.reduce((t, x) => {
        const ars = Calc.toArs(x, S.cfg.rate);
        return t + (x.cur === g.cur ? x.amount : g.cur === 'USD' ? ars / S.cfg.rate : ars);
      }, 0);
      const p = have / g.amount * 100;
      goal = `<button class="card row block" data-f="goal"><b>${esc(g.name)}</b>${bar(p)}<small>${money(have, g.cur)} de ${money(g.amount, g.cur)} · ${nf.format(p)}%</small></button>`;
    }
    const bk = S.expenses.length > 15 && (!S.lastBackup || Date.now() - S.lastBackup > 14 * 864e5);
    return `<p class="mut">${r.today >= 0 ? 'Hoy podés gastar' : 'Hoy te pasaste por'}</p><div class="big ${r.today < 0 ? 'bad' : ''}">${money(Math.abs(r.today))}</div>
    <p class="mut">${r.remaining < 0 ? `Vas ${money(-r.remaining)} por encima del mes.` : `Quedan ${money(r.remaining)} para ${r.left} ${r.left === 1 ? 'día' : 'días'}, ya separado el ahorro.`}</p>
    <button class="btn" data-f="expenses">Anotar gasto</button>
    <div class="card"><p class="mut">Ingresos de este mes</p><b>${money(r.income)}</b><p class="mut">${r.paid ? `Sueldo cobrado ${money(r.salary)}` : r.salary ? `Cobraste ${money(r.salary)} del sueldo; esperás ${money(r.base0)}` : `Sueldo esperado ${money(r.expected)}, todavía sin cobrar`}${r.extra ? ` · extras ${money(r.extra)}` : ''}</p>${r.paid ? '' : '<button class="btn s" data-f="salary">Cobré el sueldo</button>'}<button class="btn s" data-f="incomes">Me entró un extra</button></div>
    <div class="card hero"><p class="mut">Ahorro sugerido este mes</p>${r.target > 0
      ? `<div class="pct">${nf2.format(Math.round(r.pct * 10) / 10)}%</div><p><b>${money(r.target)}</b> · aprox. ${money(r.target / S.cfg.rate, 'USD')}</p>${bar(r.saved / r.target * 100)}<p class="mut">Guardaste ${money(r.saved)}</p>`
      : `<div class="pct">0%</div><p>De los ${money(r.income)} que ganás, ${r.spent > r.typical ? 'lo gastado más los fijos y cuotas suma' : 'calculamos que vas a usar'} ${money(r.fixed + r.inst + Math.max(r.typical, r.spent))}: no sobra para ahorrar.</p>`}${r.over ? `<p class="bad">Tus fijos y cuotas (${money(r.fixed + r.inst)}) ya superan los ${money(S.cfg.estimate)} que calculaste para el mes. Revisalo en Ajustes.</p>` : ''}<button class="btn s" data-f="savings">Guardé plata</button></div>
    ${goal}
    ${bk ? '<div class="card"><b>Hacé una copia</b><p class="mut">Tus datos están solo en este celular.</p><button class="btn s" data-a="export">Exportar copia</button></div>' : ''}
    <h2>Gastos de hoy</h2><div class="card">${ex.map(e => row('expenses', e, e.note || e.cat, e.cat, money(e.amount, e.cur))).join('') || '<p class="mut">Todavía no anotaste nada.</p>'}</div>`;
  },
  mes(r) {
    const by = {};
    S.expenses.filter(e => Calc.inP(e, r.p)).forEach(e => { by[e.cat] = (by[e.cat] || 0) + Calc.toArs(e, S.cfg.rate); });
    const cs = Object.entries(by).sort((a, b) => b[1] - a[1]);
    const all = [...S.expenses.map(x => ['expenses', x, x.note || x.cat]), ...S.incomes.map(x => Calc.isSalary(x) ? ['salary', x, x.note || 'Sueldo'] : ['incomes', x, x.note || 'Ingreso extra']), ...S.savings.map(x => ['savings', x, x.note || 'Ahorro'])].filter(a => Calc.inP(a[1], r.p)).sort((a, b) => b[1].date.localeCompare(a[1].date));
    return `<h1>Tu mes</h1><p class="mut">Desde el ${fd(r.p.start)} hasta el próximo cobro, ${fd(r.p.end)}</p>
    <h2>Cómo sale el ahorro</h2>${r.learned ? '' : `<p class="mut">Calculaste gastar ${money(S.cfg.estimate)} en todo el mes. Es una previsión, todavía no figura como gastado.</p>`}<div class="card">${line(r.paid ? 'Sueldo cobrado' : 'Sueldo esperado', money(r.base0))}${r.extra ? line('Extras de este mes', money(r.extra)) : ''}${line('Gastos fijos', money(-r.fixed))}${line('Cuotas', money(-r.inst))}${line('Día a día ' + (r.spent > r.typical ? '(ya gastado)' : r.learned ? '(tu promedio)' : '(lo que queda de tu estimación)'), money(-Math.max(r.typical, r.spent)))}${line('Margen', money(r.margin))}${line(`Ahorro: ${r.share}% del margen`, money(r.target))}</div>
    <p class="mut">${r.streak ? `Cumpliste ${r.streak} ${r.streak === 1 ? 'mes' : 'meses'} seguidos.` : 'Cada mes que cumplas, la parte a ahorrar sube 5 puntos.'}</p>
    <h2>En qué se fue</h2><div class="card">${cs.map(([c, v]) => `<div class="row block"><span class="split">${esc(c)}<b>${money(v)}</b></span>${bar(v / cs[0][1] * 100)}</div>`).join('') || '<p class="mut">Sin gastos este mes.</p>'}</div>
    ${r.hist.length ? `<h2>Meses anteriores</h2><div class="card">${r.hist.map(h => line('Desde el ' + fd(h.start), money(h.spent) + `<small>Ahorro ${money(h.saved)}</small>`)).join('')}</div>` : ''}
    <h2>Movimientos</h2><div class="card">${all.map(([k, x, t]) => row(k, x, t, fd(x.date), (k === 'incomes' || k === 'salary' ? '+' : '') + money(x.amount, x.cur))).join('') || '<p class="mut">Nada por ahora.</p>'}</div>`;
  },
  fijos(r) {
    const cuota = x => {
      const i = Calc.installment(x, r.p, S.cfg.payday, S.cfg.rate);
      return row('installments', x, x.name, i.number ? `Cuota ${i.number} de ${x.n}` : x.first >= r.p.end ? `${x.n} cuotas, desde ${fd(x.first)}` : 'Terminada', money(x.total / x.n, x.cur));
    };
    return `<h1>Fijos y cuotas</h1><p class="mut">Ya están incluidos en tu estimación del mes: no se restan dos veces.</p><h2>Gastos fijos · ${money(r.fixed)}</h2><div class="card">${S.fixed.map(x => row('fixed', x, x.name, 'Todos los meses', money(x.amount, x.cur))).join('') || '<p class="mut">Alquiler, internet, gimnasio…</p>'}</div><button class="btn s" data-f="fixed">Agregar gasto fijo</button>
    <h2>Cuotas este mes · ${money(r.inst)}</h2><div class="card">${S.installments.map(cuota).join('') || '<p class="mut">No hay compras en cuotas.</p>'}</div><button class="btn s" data-f="installments">Agregar compra en cuotas</button>`;
  },
  ajustes() {
    const c = S.cfg;
    return `<h1>Ajustes</h1><button class="card row" data-f="cfg"><span>Tus números<small>Sueldo esperado ${money(Calc.expected(S, Calc.period(today(), c.payday)))} · gasto estimado ${money(c.estimate)} · cobro el ${c.payday} · dólar ${money(c.rate)}</small></span><b>Editar</b></button><button class="card row" data-f="goal"><span>Meta<small>${esc(S.goal ? S.goal.name : 'Sin meta')}</small></span><b>Editar</b></button>
    ${SIM ? '' : '<h2>Modo prueba</h2><p class="mut">Simulá un principio de mes: cobrás, gastás y adelantás los días. No cambia tus datos.</p><button class="btn s" data-a="sim">Simular principio de mes</button>'}
    ${SIM ? '<p class="mut">La copia de seguridad está pausada durante la prueba.</p>' : `<h2>Copia de seguridad</h2><p class="mut">Tus datos no salen de este celular. Exportá una copia cada tanto y guardala en Archivos o iCloud.</p><button class="btn" data-a="export">Exportar copia</button><button class="btn s" data-a="import">Restaurar copia</button><input type="file" id="file" accept=".json,application/json" hidden>
    <p class="mut">${S.lastBackup ? 'Última copia: ' + new Date(S.lastBackup).toLocaleDateString('es-AR') : 'Todavía no exportaste ninguna copia.'}</p>`}`;
  }
};
function onboarding() {
  $('#nav').style.display = 'none';
  $('#app').innerHTML = `<h1>Empecemos</h1><p class="mut">Con esto calculamos cuánto podés ahorrar. Se guarda solo en este celular.</p><form id="ob" novalidate>${cfgFields({})}${inp('¿Cuánto ya gastaste desde el último cobro? Poné un aproximado, sin gastos fijos ni cuotas', 'already', '', N)}<p class="bad" id="oberr" role="alert"></p><button class="btn">Empezar</button></form><button class="btn s" data-a="import">Restaurar copia</button><input type="file" id="file" accept=".json,application/json" hidden>`;
  $('#ob').onsubmit = e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target)), er = setCfg(f);
    if (er) { $('#oberr').textContent = er; return; }
    const a = num(f.already), p = Calc.period(today(), S.cfg.payday);
    if (a > 0) S.expenses.push({ id: uid(), amount: a, cur: 'ARS', cat: 'Otros', note: 'Antes de usar la app', date: p.start });
    if (a > 0) S.cfg.since = p.start;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    save(); tab = 'fijos'; render(); toast('Ahora cargá tus gastos fijos');
  };
}
function render() {
  if (!S.cfg) return onboarding();
  const r = Calc.compute(S, today());
  if (S.targets[r.p.start] !== r.target) { S.targets[r.p.start] = r.target; save(); }
  $('#app').innerHTML = (SIM ? simBar() : '') + V[tab](r);
  $('#nav').style.display = '';
  const b = (k, t) => `<button data-t="${k}" ${tab === k ? 'aria-current="page"' : ''}>${t}</button>`;
  $('#nav').innerHTML = b('hoy', 'Hoy') + b('mes', 'Mes') + '<button class="add" data-a="add" aria-label="Agregar movimiento">+</button>' + b('fijos', 'Fijos') + b('ajustes', 'Ajustes');
}
const simBar = () => `<div class="card"><b>Modo prueba · ${fd(SIM)}</b><p class="mut">Nada de esto toca tus datos reales.</p><div class="chips"><button class="btn s mini" data-a="day">+1 día</button><button class="btn s mini" data-a="week">+7 días</button><button class="btn s mini" data-a="month">Próximo cobro</button><button class="btn d mini" data-a="simEnd">Salir</button></div></div>`;
function simStart() {
  if (SIM || !confirm('Vas a probar un principio de mes con una copia de tu sueldo, fijos y cuotas. Tus datos reales no cambian. ¿Empezamos?')) return;
  const p = Calc.period(today(), S.cfg.payday, 1), cfg = { ...S.cfg, income: Calc.expected(S, p), since: p.start };
  delete cfg.incomeAt;
  const copy = { ...fresh(), ...JSON.parse(JSON.stringify({ fixed: S.fixed, installments: S.installments, goal: S.goal })), cfg, lastBackup: Date.now() };
  try { localStorage.setItem(SIMKEY, JSON.stringify(copy)); localStorage.setItem(SIMDATE, p.start); } catch (e) { alert('No se pudo iniciar la prueba.'); return; }
  SIM = p.start; S = load(); tab = 'hoy'; render(); scrollTo(0, 0);
}
function simMove(date) {
  SIM = date; localStorage.setItem(SIMDATE, SIM); render(); scrollTo(0, 0);
}
function simDays(n) { const d = Calc.parse(SIM); d.setDate(d.getDate() + n); simMove(Calc.iso(d)); }
function simEnd() {
  if (!confirm('Se borra la prueba y volvés a tus datos reales. ¿Salimos?')) return;
  localStorage.removeItem(SIMKEY); localStorage.removeItem(SIMDATE);
  SIM = null; S = load(); tab = 'hoy'; render(); scrollTo(0, 0); toast('Volviste a tus datos reales');
}
async function exportar() {
  if (SIM) return;
  const file = new File([JSON.stringify(S, null, 1)], `gastos-${today()}.json`, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file] });
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 9e3); }
    S.lastBackup = Date.now(); save(); render();
  } catch (e) { if (e.name !== 'AbortError') alert('No se pudo exportar la copia.'); }
}
function validBackup(d) {
  const day = s => /^\d{4}-\d\d-\d\d$/.test(s), c = d.cfg;
  const list = (a, k, dk) => Array.isArray(a) && a.every(x => typeof x.id === 'string' && x[k] > 0 && ['ARS', 'USD'].includes(x.cur) && (!dk || day(x[dk])));
  return c.income > 0 && c.rate > 0 && c.estimate > 0 && day(c.since) && Number.isInteger(c.payday) && c.payday >= 1 && c.payday <= 28
    && ['expenses', 'incomes', 'savings'].every(k => list(d[k], 'amount', 'date')) && d.incomes.every(x => !Calc.isSalary(x) || day(x.for)) && list(d.fixed, 'amount')
    && list(d.installments, 'total', 'first') && d.installments.every(x => Number.isInteger(x.n) && x.n > 0);
}
function importar() {
  if (SIM) return;
  const i = $('#file');
  i.value = '';
  i.onchange = async () => {
    try {
      const d = JSON.parse(await i.files[0].text());
      if (!validBackup(d)) throw new Error('inválida');
      if (S.cfg && !confirm('Esto reemplaza todo lo que hay en este celular. ¿Seguimos?')) return;
      S = { ...fresh(), ...d }; save(); tab = 'hoy'; render(); toast('Copia restaurada');
    } catch (e) { alert('Ese archivo no es una copia válida.'); }
  };
  i.click();
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-t],[data-f],[data-a]');
  if (!b) return;
  if (b.dataset.t) { tab = b.dataset.t; render(); scrollTo(0, 0); }
  else if (b.dataset.f) { if ($('#dlg').open) $('#dlg').close(); forms[b.dataset.f](b.dataset.id); }
  else ({ add: addMenu, export: exportar, import: importar, sim: simStart, simEnd, day: () => simDays(1), week: () => simDays(7), month: () => simMove(Calc.period(SIM, S.cfg.payday, 1).start) })[b.dataset.a]();
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#dlg').open && S.cfg) render(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render();
