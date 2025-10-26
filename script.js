/*
  script.js — input reading, validation, localStorage, calculation, animation and theme
  Notes: preserves original ROI and NPV formulas (calculation logic unchanged)
*/

// Constants & defaults
const STORAGE_KEYS = { inputs: 'fw_inputs', theme: 'fw_theme' };

const DEFAULTS = {
  price: 260000,
  reno: 17000,
  mgmt: 2639,
  tax: 3022,
  rent: 1700,
  discount: 2,
  years: 30
};

// Formatting helpers
function fmtCurrency(n){
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}
function fmtNumber(n, d = 2){
  return Number.isFinite(n) ? Number(n).toLocaleString(undefined, { maximumFractionDigits: d }) : '—';
}
function qs(id){ return document.getElementById(id); }

// Read & validate inputs
function readInputValue(id, fallback = 0){
  const el = qs(id);
  if (!el) return fallback;
  const v = parseFloat(el.value);
  return Number.isFinite(v) ? v : fallback;
}
function setFieldMessage(id, msg){ const el = qs(id); if(el) el.textContent = msg || ''; }

function validateAndReadAll(){
  const vals = {};
  vals.price = readInputValue('price', DEFAULTS.price);
  vals.reno = readInputValue('reno', DEFAULTS.reno);
  vals.mgmt = readInputValue('mgmt', DEFAULTS.mgmt);
  vals.tax = readInputValue('tax', DEFAULTS.tax);
  vals.rent = readInputValue('rent', DEFAULTS.rent);
  vals.discount = readInputValue('discount', DEFAULTS.discount);
  vals.years = Math.max(1, Math.floor(readInputValue('years', DEFAULTS.years)));

  setFieldMessage('price-msg', vals.price <= 0 ? 'Price must be positive' : '');
  setFieldMessage('reno-msg', vals.reno < 0 ? 'Renovation must be non-negative' : '');
  setFieldMessage('mgmt-msg', vals.mgmt < 0 ? 'Management fee must be non-negative' : '');
  setFieldMessage('tax-msg', vals.tax < 0 ? 'Property tax must be non-negative' : '');
  setFieldMessage('rent-msg', vals.rent < 0 ? 'Rent must be non-negative' : '');
  setFieldMessage('discount-msg', (vals.discount < -99 || vals.discount > 1000) ? 'Discount rate seems unusual' : '');
  setFieldMessage('years-msg', vals.years <= 0 ? 'Years must be at least 1' : '');
  return vals;
}

// Write results into cards with animation
function animateTo(el, target, fmt = v => String(v), opts = {}){
  if(!el) return;
  const startText = el.dataset.current ? parseFloat(el.dataset.current) : 0;
  const start = Number.isFinite(startText) ? startText : 0;
  const end = Number.isFinite(target) ? target : 0;
  const duration = opts.duration || 700;
  const startTime = performance.now();
  cancelAnimationFrame(el._animId || 0);
  function step(now){
    const t = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const current = start + (end - start) * eased;
    el.textContent = fmt(current);
    el.dataset.current = String(current);
    if(t < 1){ el._animId = requestAnimationFrame(step); } else { el.dataset.current = String(end); }
  }
  el._animId = requestAnimationFrame(step);
}
function writeResultsToCards(results){
  animateTo(qs('card-invest').querySelector('.card-value'), results.invest, v => fmtCurrency(v));
  animateTo(qs('card-net').querySelector('.card-value'), results.annualNet, v => fmtCurrency(v));
  animateTo(qs('card-roi').querySelector('.card-value'), results.roi, v => `${fmtNumber(v,2)}%`);
  const paybackEl = qs('card-payback').querySelector('.card-value');
  if (results.payback === Infinity) paybackEl.textContent = '—';
  else animateTo(paybackEl, results.payback, v => `${fmtNumber(v,2)} years`);
}

// Calculation logic
function calcROI(values){
  const price = values.price, reno = values.reno, mgmt = values.mgmt, tax = values.tax, rent = values.rent;
  const invest = price + reno;
  const annualRent = rent * 12;
  const annualNet = annualRent - (mgmt + tax);
  const roi = invest === 0 ? 0 : (annualNet / invest * 100);
  const payback = annualNet > 0 ? invest / annualNet : Infinity;
  return { invest, annualRent, annualCosts: mgmt + tax, annualNet, roi, payback };
}
const pv = (fv, r, t) => fv / Math.pow(1 + r, t);
function calcNPV(values){
  const price = values.price, reno = values.reno, mgmt = values.mgmt, tax = values.tax, rent = values.rent;
  const discountPct = values.discount; const years = Math.max(1, Math.floor(values.years));
  const r = Math.max(-0.99, discountPct / 100);

  const invest = price + reno;
  const inflowAnnual = rent * 12;
  const outflowAnnual = mgmt + tax;
  const netAnnual = inflowAnnual - outflowAnnual;

  let cumulative = 0; const rows = [];
  const y0 = { year: 0, net: -invest, factor: 1, pv: -invest };
  cumulative += y0.pv; rows.push({ ...y0, cumulative });

  for (let t = 1; t <= years; t++){
    const factor = 1 / Math.pow(1 + r, t);
    const pvVal = netAnnual * factor;
    cumulative += pvVal;
    rows.push({ year: t, net: netAnnual, factor, pv: pvVal, cumulative });
  }
  const npv = cumulative;
  return { npv, rows, discountPct, years };
}

// Table rendering
function renderNPVTable(npvResult){
  const tbody = qs('pv-merged-body');
  if(!tbody) return;
  let highlight = null;
  for(const r of npvResult.rows){ if(r.cumulative >= 0){ highlight = r.year; break; } }
  tbody.innerHTML = npvResult.rows.map(row => {
    const clsNet = row.net >= 0 ? 'positive' : 'negative';
    return `
      <tr class="${highlight!==null && row.year===highlight ? 'highlight' : ''}">
        <td>${row.year}</td>
        <td class="${clsNet}">${row.year===0 ? '—' : fmtCurrency(row.net)}</td>
        <td>${fmtNumber(row.factor,4)}</td>
        <td class="${row.pv>=0?'positive':'negative'}">${fmtCurrency(row.pv)}</td>
        <td class="${row.cumulative>=0?'positive':'negative'}">${fmtCurrency(row.cumulative)}</td>
      </tr>`;
  }).join('');
}

// Local storage helpers
function saveInputs(values){
  try{ localStorage.setItem(STORAGE_KEYS.inputs, JSON.stringify(values)); } catch(e){}
}
function loadInputs(){
  try{
    const raw = localStorage.getItem(STORAGE_KEYS.inputs);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch(e){ return null; }
}

// Theme helpers
function applyTheme(theme){
  if(theme === 'light') document.documentElement.classList.add('theme-light');
  else document.documentElement.classList.remove('theme-light');
  try{ localStorage.setItem(STORAGE_KEYS.theme, theme); }catch(e){}
}
function loadTheme(){
  const t = localStorage.getItem(STORAGE_KEYS.theme);
  if(t) applyTheme(t);
  else {
    const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(dark ? 'dark' : 'light');
  }
}

// Calculation entrypoint
async function calculate(){
  const btn = qs('calcBtn');
  if(btn) { btn.disabled = true; btn.classList.add('working'); }
  try{
    const inputs = validateAndReadAll();
    saveInputs(inputs);

    const roiRes = calcROI(inputs);
    const npvRes = calcNPV(inputs);

    writeResultsToCards(roiRes);
    renderNPVTable(npvRes);

    const resultsPanel = qs('card-invest')?.closest('.panel') || qs('.panel-results');
    if(resultsPanel) resultsPanel.hidden = false;

  // Show NPV detail table only when NPV tab is active
    const activeTab = document.querySelector('.tab-btn[aria-selected="true"]');
    const npvPanel = qs('npv-panel');
    if(npvPanel) npvPanel.hidden = !(activeTab && activeTab.dataset.tab === 'npv');
  }catch(err){ console.error(err); }
  finally{ if(btn){ btn.disabled=false; btn.classList.remove('working'); } }
}

// Bindings & initialization
function populateInputs(values){
  Object.keys(DEFAULTS).forEach(k => {
    const el = qs(k);
    if(el) el.value = (values[k] !== undefined) ? values[k] : DEFAULTS[k];
  });
}

function setup(){
  loadTheme();
  const saved = loadInputs();
  populateInputs(Object.assign({}, DEFAULTS, saved || {}));

  const themeSwitch = qs('themeSwitch');
  if(themeSwitch){
    themeSwitch.checked = !document.documentElement.classList.contains('theme-light');
    themeSwitch.addEventListener('change', e => applyTheme(e.target.checked ? 'dark' : 'light'));
  }

  // Tab switching: show/hide NPV-only fieldset
  const tabs = Array.from(document.querySelectorAll('.tab-btn'));
  const npvFieldset = document.querySelector('fieldset[data-section="npv"]');
  const roiFieldset = document.querySelector('fieldset[data-section="roi"]');
  const npvPanel = qs('npv-panel');

  function showForTab(tabKey){
    const isNPV = tabKey === 'npv';
    if (npvFieldset) npvFieldset.hidden = !isNPV;          // show only for NPV
    // ROI group remains visible; enable toggling above if desired
    // if (roiFieldset) roiFieldset.hidden = isNPV;
    if (npvPanel) npvPanel.hidden = true;                  // hide detail panel on tab change; calculate() controls reveal
  }

  tabs.forEach(btn => btn.addEventListener('click', () => {
    tabs.forEach(b => { b.setAttribute('aria-selected','false'); b.classList.remove('active'); });
    btn.setAttribute('aria-selected','true'); btn.classList.add('active');
    showForTab(btn.dataset.tab);
  }));

  const active = document.querySelector('.tab-btn[aria-selected="true"]');
  showForTab(active ? active.dataset.tab : 'roi');

  // Input persistence (debounced)
  const inputIds = ['price','reno','mgmt','tax','rent','discount','years'];
  let persistTimer = 0;
  inputIds.forEach(id => {
    const el = qs(id);
    if(!el) return;
    el.addEventListener('input', ()=>{
      clearTimeout(persistTimer);
      persistTimer = setTimeout(()=>{ const values = validateAndReadAll(); saveInputs(values); }, 300);
    });
    el.addEventListener('blur', ()=> { const values = validateAndReadAll(); saveInputs(values); });
  });

  // Buttons
  const calcBtn = qs('calcBtn'); if(calcBtn) calcBtn.addEventListener('click', calculate);
  const resetBtn = qs('resetBtn'); if(resetBtn) resetBtn.addEventListener('click', ()=>{
    populateInputs(DEFAULTS);
    saveInputs(DEFAULTS);
    const resultsPanel = qs('.panel-results'); if(resultsPanel) resultsPanel.hidden = true;
    if(npvPanel) npvPanel.hidden = true;
  });

  // Assign tooltip text from hidden tip elements
  document.querySelectorAll('.info').forEach(b => {
    const tip = b.dataset.tip; if(!tip) return;
    const el = qs(tip);
    if(el) b.title = el.textContent || '';
  });
}

window.addEventListener('DOMContentLoaded', setup);
