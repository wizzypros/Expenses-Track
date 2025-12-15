const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

const store = {
  load() {
    try {
      const raw = localStorage.getItem('expense-track-store');
      if (!raw) return { groups: [], currentGroupId: null };
      const data = JSON.parse(raw);
      if (data.groups && Array.isArray(data.groups)) {
        const groups = data.groups.map(g => ({
          id: g.id || uid(),
          name: g.name || 'Group',
          members: Array.isArray(g.members) ? g.members : [],
          expenses: Array.isArray(g.expenses) ? g.expenses : [],
          closed: !!g.closed,
        }));
        const current = data.currentGroupId && groups.find(g => g.id === data.currentGroupId) ? data.currentGroupId : (groups[0]?.id || null);
        return { groups, currentGroupId: current };
      }
      const members = Array.isArray(data.members) ? data.members : [];
      const expenses = Array.isArray(data.expenses) ? data.expenses : [];
      const g = { id: uid(), name: 'Group 1', members, expenses, closed: false };
      return { groups: [g], currentGroupId: g.id };
    } catch {
      return { groups: [], currentGroupId: null };
    }
  },
  save(state) {
    localStorage.setItem('expense-track-store', JSON.stringify(state));
  },
};

const state = store.load();

const els = {
  groupForm: document.getElementById('group-form'),
  groupName: document.getElementById('group-name'),
  groupSelect: document.getElementById('group-select'),
  groupDelete: document.getElementById('group-delete'),
  groupClose: document.getElementById('group-close'),
  groupStatus: document.getElementById('group-status'),
  memberForm: document.getElementById('member-form'),
  memberName: document.getElementById('member-name'),
  memberList: document.getElementById('member-list'),
  expenseForm: document.getElementById('expense-form'),
  expenseTitle: document.getElementById('expense-title'),
  expenseCategory: document.getElementById('expense-category'),
  expenseAmount: document.getElementById('expense-amount'),
  expensePayer: document.getElementById('expense-payer'),
  includeMembers: document.getElementById('include-members'),
  includeAll: document.getElementById('include-all'),
  includeClear: document.getElementById('include-clear'),
  percentageInputs: document.getElementById('percentage-inputs'),
  percentageList: document.getElementById('percentage-list'),
  percentageTotal: document.getElementById('percentage-total'),
  sharesInputs: document.getElementById('shares-inputs'),
  sharesList: document.getElementById('shares-list'),
  sharesTotal: document.getElementById('shares-total'),
  expenseList: document.getElementById('expense-list'),
  expenseEmpty: document.getElementById('expense-empty'),
  balanceList: document.getElementById('balance-list'),
  settlementList: document.getElementById('settlement-list'),
  submitExpense: document.getElementById('submit-expense'),
  cancelEdit: document.getElementById('cancel-edit'),
};

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

let editingId = null;

function group() {
  return state.groups.find(g => g.id === state.currentGroupId) || state.groups[0];
}

function renderGroups() {
  if (!els.groupSelect) return;
  els.groupSelect.innerHTML = '';
  state.groups.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    els.groupSelect.appendChild(opt);
  });
  if (state.currentGroupId) {
    els.groupSelect.value = state.currentGroupId;
  } else if (state.groups[0]) {
    state.currentGroupId = state.groups[0].id;
    els.groupSelect.value = state.currentGroupId;
  }
  if (els.groupDelete) {
    els.groupDelete.disabled = state.groups.length <= 1;
  }
  const g = group();
  if (els.groupStatus) {
    els.groupStatus.textContent = g?.closed ? 'Status: Closed — no changes allowed' : 'Status: Active';
  }
  if (els.groupClose) {
    els.groupClose.disabled = !g || g.closed;
  }
}

function renderMembers() {
  els.memberList.innerHTML = '';
  const g = group();
  const closed = !!g?.closed;
  g.members.forEach((name, idx) => {
    const li = document.createElement('li');
    li.className = 'chip';
    const span = document.createElement('span');
    span.className = 'name';
    span.textContent = name;
    const btn = document.createElement('button');
    btn.className = 'btn danger';
    btn.textContent = 'Remove';
    btn.disabled = closed;
    btn.addEventListener('click', () => {
      g.members.splice(idx, 1);
      g.expenses = g.expenses.map(e => {
        const included = e.includedMembers.filter(m => m !== name);
        const shares = Object.fromEntries(Object.entries(e.shares).filter(([m]) => m !== name));
        return { ...e, includedMembers: included, shares };
      });
      store.save(state);
      renderAll();
    });
    li.append(span, btn);
    els.memberList.appendChild(li);
  });

  els.expensePayer.innerHTML = '';
  g.members.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    els.expensePayer.appendChild(opt);
  });

  els.includeMembers.innerHTML = '';
  g.members.forEach(name => {
    const wrap = document.createElement('div');
    wrap.className = 'include-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.disabled = closed;
    cb.dataset.member = name;
    const label = document.createElement('label');
    label.textContent = name;
    wrap.append(cb, label);
    els.includeMembers.appendChild(wrap);
  });

  renderPercentageInputs();
}

function getSelectedSplitType() {
  const radios = document.querySelectorAll('input[name="split-type"]');
  for (const r of radios) if (r.checked) return r.value;
  return 'equal';
}

function getIncludedMembers() {
  const cbs = els.includeMembers.querySelectorAll('input[type="checkbox"]');
  return Array.from(cbs)
    .filter(cb => cb.checked)
    .map(cb => cb.dataset.member);
}

function distributePercentagesEqually(members) {
  if (!members.length) return {};
  const base = Math.floor((1000 / members.length)) / 10;
  const result = {};
  let sum = 0;
  members.forEach((m, i) => {
    const val = i === members.length - 1 ? +(100 - sum).toFixed(1) : base;
    result[m] = val;
    sum = +(sum + val).toFixed(1);
  });
  return result;
}

function renderPercentageInputs() {
  const type = getSelectedSplitType();
  if (type !== 'percentage') {
    els.percentageInputs.classList.add('hidden');
    return;
  }
  els.percentageInputs.classList.remove('hidden');
  els.percentageList.innerHTML = '';
  const included = getIncludedMembers();
  const equal = distributePercentagesEqually(included);
  included.forEach(name => {
    const row = document.createElement('div');
    row.className = 'percentage-item';
    const label = document.createElement('span');
    label.textContent = name;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '100';
    input.step = '0.1';
    input.value = String(equal[name] ?? 0);
    input.dataset.member = name;
    input.addEventListener('input', updatePercentageTotal);
    row.append(label, input, document.createTextNode('%'));
    els.percentageList.appendChild(row);
  });
  updatePercentageTotal();
}

function updatePercentageTotal() {
  const inputs = els.percentageList.querySelectorAll('input[type="number"]');
  const total = Array.from(inputs).reduce((sum, i) => sum + Number(i.value || 0), 0);
  els.percentageTotal.textContent = `Total: ${total.toFixed(1)}%`;
  els.percentageTotal.style.color = Math.abs(total - 100) < 0.001 ? 'var(--muted)' : 'var(--danger)';
}

function renderSharesInputs() {
  const type = getSelectedSplitType();
  if (type !== 'shares') {
    els.sharesInputs.classList.add('hidden');
    return;
  }
  els.sharesInputs.classList.remove('hidden');
  els.sharesList.innerHTML = '';
  const included = getIncludedMembers();
  included.forEach(name => {
    const row = document.createElement('div');
    row.className = 'share-item';
    const label = document.createElement('span');
    label.textContent = name;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '0.1';
    input.value = '1';
    input.dataset.member = name;
    input.addEventListener('input', updateSharesTotal);
    row.append(label, input);
    els.sharesList.appendChild(row);
  });
  updateSharesTotal();
}

function updateSharesTotal() {
  const inputs = els.sharesList.querySelectorAll('input[type="number"]');
  const total = Array.from(inputs).reduce((sum, i) => sum + Number(i.value || 0), 0);
  els.sharesTotal.textContent = `Total shares: ${total.toFixed(1)}`;
  els.sharesTotal.style.color = total > 0 ? 'var(--muted)' : 'var(--danger)';
}

function addMember(name) {
  const clean = name.trim();
  if (!clean) return;
  const g = group();
  if (g.closed) return;
  if (g.members.includes(clean)) return;
  g.members.push(clean);
  store.save(state);
  renderAll();
}

function roundINR(n) {
  return Math.round(n * 100) / 100;
}

function calculateShares(amount, includedMembers, type) {
  if (includedMembers.length === 0) return {};
  const shares = {};
  if (type === 'equal') {
    const per = amount / includedMembers.length;
    let sum = 0;
    includedMembers.forEach((m, i) => {
      const v = i === includedMembers.length - 1 ? roundINR(amount - sum) : roundINR(per);
      shares[m] = v;
      sum = roundINR(sum + v);
    });
    return shares;
  }
  const inputs = els.percentageList.querySelectorAll('input[type="number"]');
  const map = {};
  inputs.forEach(inp => { map[inp.dataset.member] = Number(inp.value || 0); });
  const totalPct = includedMembers.reduce((sum, m) => sum + (map[m] || 0), 0);
  if (Math.abs(totalPct - 100) > 0.001) {
    alert('Percentages must add up to 100%');
    return null;
  }
  let sum = 0;
  includedMembers.forEach((m, i) => {
    const pct = map[m] || 0;
    const raw = (pct / 100) * amount;
    const v = i === includedMembers.length - 1 ? roundINR(amount - sum) : roundINR(raw);
    shares[m] = v;
    sum = roundINR(sum + v);
  });
  return shares;
}

function calculateSharesByCount(amount, includedMembers) {
  const inputs = els.sharesList.querySelectorAll('input[type="number"]');
  const countMap = {};
  inputs.forEach(inp => { countMap[inp.dataset.member] = Number(inp.value || 0); });
  const total = includedMembers.reduce((sum, m) => sum + (countMap[m] || 0), 0);
  if (total <= 0) {
    alert('Total shares must be greater than 0');
    return null;
  }
  const shares = {};
  let sum = 0;
  includedMembers.forEach((m, i) => {
    const c = countMap[m] || 0;
    const raw = (c / total) * amount;
    const v = i === includedMembers.length - 1 ? roundINR(amount - sum) : roundINR(raw);
    shares[m] = v;
    sum = roundINR(sum + v);
  });
  return shares;
}

function addExpense() {
  const title = els.expenseTitle.value.trim();
  const category = els.expenseCategory.value.trim();
  const amount = Number(els.expenseAmount.value);
  const payer = els.expensePayer.value;
  const type = getSelectedSplitType();
  const included = getIncludedMembers();
  const g = group();
  if (g.closed) return;
  if (!title || !amount || !payer) return;
  if (!included.includes(payer)) {
    included.push(payer); // payer must be part of split
  }
  const shares = type === 'shares' ? calculateSharesByCount(amount, included) : calculateShares(amount, included, type);
  if (!shares) return;
  if (editingId) {
    g.expenses = g.expenses.map(e => e.id === editingId ? {
      ...e,
      title,
      category,
      amount,
      payer,
      splitType: type,
      includedMembers: included,
      shares,
    } : e);
    editingId = null;
    els.submitExpense.textContent = 'Add Expense';
    els.cancelEdit.classList.add('hidden');
  } else {
    const expense = {
      id: uid(),
      title,
      category,
      amount,
      payer,
      date: new Date().toISOString(),
      splitType: type,
      includedMembers: included,
      shares,
    };
    group().expenses.unshift(expense);
  }
  els.expenseForm.reset();
  store.save(state);
  renderAll();
}

function renderExpenses() {
  const g = group();
  const closed = !!g?.closed;
  const has = g.expenses.length > 0;
  els.expenseEmpty.style.display = has ? 'none' : 'block';
  els.expenseList.innerHTML = '';
  g.expenses.forEach(exp => {
    const li = document.createElement('li');
    li.className = 'expense-card';

    const top = document.createElement('div');
    top.className = 'top';
    const left = document.createElement('div');
    const tag = exp.category ? `<span class="tag">${exp.category}</span>` : '';
    left.innerHTML = `<strong>${exp.title}</strong>${tag}<div class="meta">Paid by ${exp.payer} &middot; ${exp.splitType}</div>`;
    const right = document.createElement('div');
    right.innerHTML = `<strong>${INR.format(exp.amount)}</strong>`;
    top.append(left, right);

    const shares = document.createElement('div');
    shares.className = 'shares';
    exp.includedMembers.forEach(m => {
      const row = document.createElement('div');
      row.className = 'share-row';
      row.innerHTML = `<span>${m}</span><span>${INR.format(exp.shares[m] || 0)}</span>`;
      shares.appendChild(row);
    });

    const actions = document.createElement('div');
    actions.style.marginTop = '8px';
    const del = document.createElement('button');
    del.className = 'btn danger';
    del.textContent = 'Delete';
    del.disabled = closed;
    del.addEventListener('click', () => {
      g.expenses = g.expenses.filter(e => e.id !== exp.id);
      store.save(state);
      renderAll();
    });
    const edit = document.createElement('button');
    edit.className = 'btn primary';
    edit.style.marginLeft = '8px';
    edit.textContent = 'Edit';
    edit.disabled = closed;
    edit.addEventListener('click', () => {
      editingId = exp.id;
      els.expenseTitle.value = exp.title;
      els.expenseCategory.value = exp.category || '';
      els.expenseAmount.value = String(exp.amount);
      els.expensePayer.value = exp.payer;
      const radios = document.querySelectorAll('input[name="split-type"]');
      radios.forEach(r => r.checked = r.value === exp.splitType);
      els.includeMembers.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = exp.includedMembers.includes(cb.dataset.member);
      });
      renderPercentageInputs();
      renderSharesInputs();
      if (exp.splitType === 'percentage' && exp.amount > 0) {
        const inputs = els.percentageList.querySelectorAll('input[type="number"]');
        const mems = exp.includedMembers.slice();
        const pctMap = {};
        let sum = 0;
        mems.forEach((m, i) => {
          const pct = (exp.shares[m] / exp.amount) * 100;
          const v = i === mems.length - 1 ? +(100 - sum).toFixed(1) : +pct.toFixed(1);
          pctMap[m] = v;
          sum = +(sum + v).toFixed(1);
        });
        inputs.forEach(inp => { inp.value = String(pctMap[inp.dataset.member] || 0); });
        updatePercentageTotal();
      } else if (exp.splitType === 'shares' && exp.amount > 0) {
        const inputs = els.sharesList.querySelectorAll('input[type="number"]');
        const mems = exp.includedMembers.slice();
        const min = Math.min(...mems.map(m => exp.shares[m]).filter(v => v > 0));
        const counts = {};
        mems.forEach(m => {
          const ratio = min > 0 ? exp.shares[m] / min : 0;
          counts[m] = +ratio.toFixed(1);
        });
        inputs.forEach(inp => { inp.value = String(counts[inp.dataset.member] || 0); });
        updateSharesTotal();
      }
      els.submitExpense.textContent = 'Save Changes';
      els.cancelEdit.classList.remove('hidden');
      els.expenseTitle.focus();
    });
    actions.appendChild(del);
    actions.appendChild(edit);

    li.append(top, shares, actions);
    els.expenseList.appendChild(li);
  });
}

function renderBalances() {
  const g = group();
  const totals = Object.fromEntries(g.members.map(m => [m, 0]));
  g.expenses.forEach(exp => {
    totals[exp.payer] += exp.amount;
    exp.includedMembers.forEach(m => {
      totals[m] -= exp.shares[m] || 0;
    });
  });
  els.balanceList.innerHTML = '';
  g.members.forEach(m => {
    const net = totals[m] || 0;
    const li = document.createElement('li');
    li.className = 'balance-row ' + (net >= 0 ? 'positive' : 'negative');
    li.innerHTML = `<span>${m}</span><span>${INR.format(net)}</span>`;
    els.balanceList.appendChild(li);
  });
}

function computeSettlements() {
  const g = group();
  const totals = Object.fromEntries(g.members.map(m => [m, 0]));
  g.expenses.forEach(exp => {
    totals[exp.payer] += exp.amount;
    exp.includedMembers.forEach(m => {
      totals[m] -= exp.shares[m] || 0;
    });
  });
  const creditors = [];
  const debtors = [];
  Object.entries(totals).forEach(([m, v]) => {
    const n = roundINR(v);
    if (n > 0) creditors.push({ m, a: n });
    else if (n < 0) debtors.push({ m, a: roundINR(-n) });
  });
  creditors.sort((a, b) => b.a - a.a);
  debtors.sort((a, b) => b.a - a.a);
  const transfers = [];
  while (creditors.length && debtors.length) {
    const c = creditors[0];
    const d = debtors[0];
    const amt = roundINR(Math.min(c.a, d.a));
    if (amt > 0) transfers.push({ from: d.m, to: c.m, amount: amt });
    c.a = roundINR(c.a - amt);
    d.a = roundINR(d.a - amt);
    if (c.a <= 0.001) creditors.shift();
    if (d.a <= 0.001) debtors.shift();
    creditors.sort((a, b) => b.a - a.a);
    debtors.sort((a, b) => b.a - a.a);
  }
  return transfers;
}

function renderSettlements() {
  els.settlementList.innerHTML = '';
  const transfers = computeSettlements();
  if (!transfers.length) {
    const li = document.createElement('li');
    li.className = 'settlement-row';
    li.innerHTML = `<span>All settled</span><span>${INR.format(0)}</span>`;
    els.settlementList.appendChild(li);
    return;
  }
  transfers.forEach(t => {
    const li = document.createElement('li');
    li.className = 'settlement-row';
    li.innerHTML = `<span>${t.from} → ${t.to}</span><span>${INR.format(t.amount)}</span>`;
    els.settlementList.appendChild(li);
  });
}

function renderAll() {
  renderGroups();
  renderMembers();
  renderExpenses();
  renderBalances();
  renderSettlements();
  const g = group();
  const closed = !!g?.closed;
  // Disable forms when closed
  if (els.memberForm) {
    els.memberForm.querySelectorAll('input, button, select, fieldset').forEach(el => el.disabled = closed && el.type !== 'hidden');
  }
  if (els.expenseForm) {
    els.expenseForm.querySelectorAll('input, button, select, fieldset').forEach(el => el.disabled = closed && el.id !== 'group-select');
  }
}

els.memberForm.addEventListener('submit', (e) => {
  e.preventDefault();
  addMember(els.memberName.value);
  els.memberForm.reset();
});

els.expenseForm.addEventListener('submit', (e) => {
  e.preventDefault();
  addExpense();
});

document.querySelectorAll('input[name="split-type"]').forEach(r => {
  r.addEventListener('change', () => { renderPercentageInputs(); renderSharesInputs(); });
});

els.includeMembers.addEventListener('change', () => { renderPercentageInputs(); renderSharesInputs(); });

els.includeAll.addEventListener('click', () => {
  els.includeMembers.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
  renderPercentageInputs();
});
els.includeClear.addEventListener('click', () => {
  els.includeMembers.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  renderPercentageInputs();
});

els.cancelEdit.addEventListener('click', () => {
  editingId = null;
  els.expenseForm.reset();
  els.submitExpense.textContent = 'Add Expense';
  els.cancelEdit.classList.add('hidden');
  renderPercentageInputs();
});

if (els.groupForm) {
  els.groupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = els.groupName.value.trim();
    if (!name) return;
    const g = { id: uid(), name, members: [], expenses: [] };
    state.groups.push(g);
    state.currentGroupId = g.id;
    store.save(state);
    els.groupForm.reset();
    renderAll();
  });
}
if (els.groupSelect) {
  els.groupSelect.addEventListener('change', (e) => {
    state.currentGroupId = e.target.value;
    store.save(state);
    renderAll();
  });
}
if (els.groupDelete) {
  els.groupDelete.addEventListener('click', () => {
    if (state.groups.length <= 1) return;
    state.groups = state.groups.filter(g => g.id !== state.currentGroupId);
    state.currentGroupId = state.groups[0]?.id || null;
    store.save(state);
    renderAll();
  });
}
if (els.groupClose) {
  els.groupClose.addEventListener('click', () => {
    const g = group();
    if (!g || g.closed) return;
    const transfers = computeSettlements();
    if (transfers.length > 0) {
      const ok = confirm('There are pending settlements. Close group anyway?');
      if (!ok) return;
    }
    g.closed = true;
    store.save(state);
    renderAll();
  });
}

renderAll();
