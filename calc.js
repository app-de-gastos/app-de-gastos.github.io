// Cálculo puro: sin pantalla ni almacenamiento, para poder reusarlo en una app de tienda.
(function (g) {
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const days = (a, b) => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5);
  // Período: va de un día de cobro al siguiente. offset 0 = el que contiene la fecha.
  function period(dateStr, payday, offset) {
    const d = parse(dateStr);
    const m = d.getMonth() + (d.getDate() < payday ? -1 : 0) + (offset || 0);
    return { start: iso(new Date(d.getFullYear(), m, payday)), end: iso(new Date(d.getFullYear(), m + 1, payday)) };
  }
  const toArs = (x, rate) => x.cur === 'USD' ? x.amount * (x.rate || rate) : x.amount;
  const inP = (x, p) => x.date >= p.start && x.date < p.end;
  const monthIdx = s => { const d = parse(s); return d.getFullYear() * 12 + d.getMonth(); };
  const sum = a => a.reduce((t, x) => t + x, 0);
  // Cuota que cae en el período (0 si todavía no empezó o ya terminó).
  function installment(i, p, payday, rate) {
    const n = monthIdx(p.start) - monthIdx(period(i.first, payday).start);
    return n >= 0 && n < i.n ? { number: n + 1, amount: toArs({ amount: i.total / i.n, cur: i.cur }, rate) } : { number: 0, amount: 0 };
  }
  const isSalary = x => x.kind === 'sueldo' || x.kind === 'parte';
  // Sueldos cobrados para un período ("for" permite cobrar unos días antes).
  const salaries = (s, p) => s.incomes.filter(x => isSalary(x) && x.for >= p.start && x.for < p.end);
  // Sueldo esperado: el último completo cobrado, salvo que se haya editado después en Ajustes.
  function expected(s, p) {
    const c = s.cfg, full = s.incomes.filter(x => x.kind === 'sueldo' && x.for < p.start && (!c.incomeAt || x.date >= c.incomeAt)).sort((a, b) => a.for < b.for ? 1 : -1)[0];
    return full ? sum(salaries(s, period(full.for, c.payday)).map(x => toArs(x, c.rate))) : c.income;
  }
  function compute(s, today) {
    const c = s.cfg, pd = c.payday, p = period(today, pd);
    const spentIn = q => sum(s.expenses.filter(e => inP(e, q)).map(e => toArs(e, c.rate)));
    const extra = sum(s.incomes.filter(e => !isSalary(e) && inP(e, p)).map(e => toArs(e, c.rate)));
    const exp = expected(s, p), sal = salaries(s, p), salary = sum(sal.map(x => toArs(x, c.rate)));
    const paid = sal.some(x => x.kind === 'sueldo');
    const base0 = paid ? salary : Math.max(exp, salary); // con un adelanto, se sigue esperando el resto
    const income = base0 + extra;
    const fixed = sum(s.fixed.map(f => toArs(f, c.rate)));
    const inst = sum(s.installments.map(i => installment(i, p, pd, c.rate).amount));
    // Solo períodos completos desde que se usa la app.
    const hist = [];
    for (let k = 1; k <= 6; k++) {
      const q = period(today, pd, -k);
      if (q.start < c.since) break;
      hist.push({ ...q, spent: spentIn(q), saved: sum(s.savings.filter(e => inP(e, q)).map(e => toArs(e, c.rate))), target: s.targets[q.start] });
    }
    // Un mes enseña solo si se anotaron gastos en 10 días distintos; si no, el promedio engaña.
    const daysLogged = q => new Set(s.expenses.filter(e => inP(e, q)).map(e => e.date)).size;
    const valid = hist.filter(h => daysLogged(h) >= 10).slice(0, 3);
    const typical = valid.length ? sum(valid.map(h => h.spent)) / valid.length : Math.max(0, c.estimate - fixed - inst); // estimate = total del mes, con fijos y cuotas adentro
    const spent = spentIn(p);
    const base = income - fixed - inst;
    const margin = base - Math.max(typical, spent);
    // Escalera: +5 puntos por cada mes seguido que se cumplió; tope 80%.
    let streak = 0;
    for (const h of hist) { if (h.target > 0 && h.saved >= h.target) streak++; else break; }
    const share = Math.min(80, 50 + 5 * streak);
    const target = margin > 0 ? margin * share / 100 : 0;
    const pct = income > 0 ? target / income * 100 : 0;
    const saved = sum(s.savings.filter(e => inP(e, p)).map(e => toArs(e, c.rate)));
    const spentToday = sum(s.expenses.filter(e => e.date === today).map(e => toArs(e, c.rate)));
    const left = days(parse(today), parse(p.end));
    const pool = base - Math.max(target, saved) - (spent - spentToday);
    const dayBudget = pool / left;
    return { p, expected: exp, salary, paid, base0, income, extra, fixed, inst, typical, spent, margin, share, streak, target, pct, saved, spentToday, left, dayBudget, today: dayBudget - spentToday, remaining: pool - spentToday, hist, learned: valid.length, over: !valid.length && fixed + inst > c.estimate };
  }
  g.Calc = { compute, expected, isSalary, period, installment, toArs, iso, parse, inP };
})(typeof window !== 'undefined' ? window : globalThis);
