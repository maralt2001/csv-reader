// ── State ────────────────────────────────────────────────────────────────────
let allRows    = [];
let headers    = [];
let hiddenCols = new Set();
let sortCol    = null;
let sortDir    = 1;       // 1 = asc, -1 = desc
let searchTerm  = '';
let regexMode   = false;
let fileName    = '';
let delimiter   = ',';

// ── DOM ──────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const dropZone    = $('drop-zone');
const fileInput   = $('file-input');
const toolbar     = $('toolbar');
const fileInfo    = $('file-info');
const tableWrap   = $('table-wrap');
const tableHead   = $('table-head');
const tableBody   = $('table-body');
const searchInput = $('search-input');
const colPanel      = $('col-panel');
const colToggles    = $('col-toggles');
const statusBar     = $('status-bar');
const exportMenu    = $('export-menu');
const regexCheckbox = $('regex-checkbox');

// ── Drag & Drop ──────────────────────────────────────────────────────────────
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) loadFile(file);
});
dropZone.addEventListener('click', e => { if (e.target.id !== 'browse-btn') fileInput.click(); });
$('browse-btn').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0]); });

// ── File Loading ─────────────────────────────────────────────────────────────
function loadFile(file) {
  fileName = file.name;
  const reader = new FileReader();
  reader.onload = e => parseCSV(e.target.result);
  reader.readAsText(file, 'UTF-8');
}

// ── Delimiter Detection ──────────────────────────────────────────────────────
function detectDelimiter(firstLine) {
  const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  let inQ = false;
  for (const ch of firstLine) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (!inQ && counts[ch] !== undefined) counts[ch]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

// ── CSV Parser (RFC 4180) ────────────────────────────────────────────────────
function parseRow(line, delim) {
  const result = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') { inQ = true; }
      else if (ch === delim) { result.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
  }
  result.push(cur.trim());
  return result;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length === 0) return;

  delimiter = detectDelimiter(lines[0]);
  headers   = parseRow(lines[0], delimiter);
  allRows   = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = parseRow(lines[i], delimiter);
    const row  = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] !== undefined ? vals[idx] : ''; });
    allRows.push(row);
  }

  hiddenCols = new Set();
  sortCol    = null;
  sortDir    = 1;
  searchTerm = '';
  searchInput.value = '';

  showUI();
  buildColumnToggles();
  render();
}

// ── UI Visibility ────────────────────────────────────────────────────────────
function showUI() {
  dropZone.style.display = 'none';
  toolbar.classList.add('visible');
  fileInfo.classList.add('visible');
  tableWrap.classList.add('visible');
  statusBar.classList.add('visible');
  $('info-name').textContent  = fileName;
  $('info-rows').textContent  = allRows.length;
  $('info-cols').textContent  = headers.length;
  $('info-delim').textContent = `Trennzeichen: ${delimiter === '\t' ? 'Tab' : `"${delimiter}"`}`;
}

function hideUI() {
  dropZone.style.display = '';
  toolbar.classList.remove('visible');
  fileInfo.classList.remove('visible');
  tableWrap.classList.remove('visible');
  statusBar.classList.remove('visible');
  colPanel.classList.remove('visible');
  fileInput.value = '';
  allRows = []; headers = [];
}

// ── Column Toggles ───────────────────────────────────────────────────────────
function buildColumnToggles() {
  colToggles.innerHTML = '';
  headers.forEach(h => {
    const label = document.createElement('label');
    label.className = 'col-toggle';
    const cb = document.createElement('input');
    cb.type    = 'checkbox';
    cb.checked = true;
    cb.addEventListener('change', () => {
      hiddenCols[cb.checked ? 'delete' : 'add'](h);
      render();
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(h));
    colToggles.appendChild(label);
  });
}

// ── Render ───────────────────────────────────────────────────────────────────
function render() {
  const visCols = headers.filter(h => !hiddenCols.has(h));
  const rows    = sortRows(filterRows());

  // Head
  tableHead.innerHTML = '';
  const htr = document.createElement('tr');
  const thN = document.createElement('th');
  thN.className   = 'row-num-head';
  thN.textContent = '#';
  htr.appendChild(thN);

  visCols.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col;
    if (sortCol === col) th.classList.add(sortDir === 1 ? 'sort-asc' : 'sort-desc');
    th.addEventListener('click', () => {
      if (sortCol === col) sortDir *= -1;
      else { sortCol = col; sortDir = 1; }
      render();
    });
    htr.appendChild(th);
  });
  tableHead.appendChild(htr);

  // Body
  tableBody.innerHTML = '';
  rows.forEach((row, idx) => {
    const tr = document.createElement('tr');
    const tdN = document.createElement('td');
    tdN.className   = 'row-num';
    tdN.textContent = idx + 1;
    tr.appendChild(tdN);

    visCols.forEach(col => {
      const td = document.createElement('td');
      td.appendChild(renderCell(row[col]));
      tr.appendChild(td);
    });
    tableBody.appendChild(tr);
  });

  // Status
  $('info-rows').textContent    = allRows.length;
  $('status-left').textContent  = `${rows.length} von ${allRows.length} Zeilen`;
  $('status-right').textContent = `${visCols.length} von ${headers.length} Spalten`;
}

// ── Cell Rendering ───────────────────────────────────────────────────────────
function renderCell(value) {
  if (value === '' || value == null) {
    const s = document.createElement('span');
    s.className   = 'cell-empty';
    s.textContent = 'leer';
    return s;
  }

  const parsed = tryParseJSON(value);
  if (parsed !== null) {
    const jsonStr   = JSON.stringify(parsed, null, 2);
    const lineCount = jsonStr.split('\n').length;
    const isLong    = lineCount > 15;

    const wrap = document.createElement('div');
    wrap.className = 'json-cell';

    const btn = document.createElement('button');
    btn.className = 'json-toggle';
    btn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg><span class="json-arrow"></span>{ } JSON`;

    const preWrap = document.createElement('div');
    preWrap.className = 'json-preview-wrap';

    const pre = document.createElement('pre');
    pre.className = 'json-preview';
    pre.innerHTML = highlightJSON(jsonStr);
    preWrap.appendChild(pre);

    let modalBtn = null;
    if (isLong) {
      modalBtn = document.createElement('button');
      modalBtn.className = 'json-modal-btn';
      modalBtn.style.display = 'none';
      modalBtn.innerHTML = `<span class="json-modal-btn-inner"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>${lineCount} Zeilen — Vollansicht</span>`;
      modalBtn.addEventListener('click', () => openModal(jsonStr));
    }

    btn.addEventListener('click', () => {
      const open = preWrap.classList.toggle('open');
      btn.classList.toggle('open', open);
      if (modalBtn) modalBtn.style.display = open ? 'inline-flex' : 'none';
    });

    wrap.appendChild(btn);
    wrap.appendChild(preWrap);
    if (modalBtn) wrap.appendChild(modalBtn);
    return wrap;
  }

  const span = document.createElement('span');
  span.textContent = value;
  return span;
}

// ── JSON Syntax Highlighter ──────────────────────────────────────────────────
function highlightJSON(json) {
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped.replace(
    /("(?:\\u[0-9a-fA-F]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    match => {
      if (/^"/.test(match))  return `<span class="${/:$/.test(match) ? 'hl-key' : 'hl-string'}">${match}</span>`;
      if (/true|false/.test(match)) return `<span class="hl-bool">${match}</span>`;
      if (/null/.test(match))       return `<span class="hl-null">${match}</span>`;
      return `<span class="hl-number">${match}</span>`;
    }
  );
}

function tryParseJSON(str) {
  if (typeof str !== 'string') return null;
  const s = str.trim();
  if (!((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']')))) return null;
  try { return JSON.parse(s); } catch { return null; }
}

// Extrahiert alle Schlüssel und Leaf-Werte aus einem JSON-Knoten
// und schreibt sie als separate Zeilen in parts[].
// Damit kann ^pattern den Anfang jedes einzelnen Wertes matchen.
function collectParts(node, parts) {
  if (node === null) { parts.push('null'); return; }
  if (Array.isArray(node)) { node.forEach(item => collectParts(item, parts)); return; }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) { parts.push(k); collectParts(v, parts); }
    return;
  }
  parts.push(String(node));
}

// Liefert den durchsuchbaren Text eines Zellwerts.
// JSON-Werte werden in einzelne Zeilen (Schlüssel + Werte) aufgeteilt,
// damit Anker wie ^ und $ pro Wert greifen.
function searchableText(value) {
  const raw = String(value ?? '');
  const parsed = tryParseJSON(raw);
  if (parsed !== null) {
    const parts = [];
    collectParts(parsed, parts);
    return parts.join('\n');
  }
  return raw;
}

// ── Filter & Sort ────────────────────────────────────────────────────────────
function filterRows() {
  if (!searchTerm) return [...allRows];

  if (regexMode) {
    let rx;
    try {
      rx = new RegExp(searchTerm, 'im');
      searchInput.classList.remove('regex-error');
    } catch {
      searchInput.classList.add('regex-error');
      return [...allRows];
    }
    return allRows.filter(row => headers.some(h => rx.test(searchableText(row[h]))));
  }

  const term = searchTerm.toLowerCase();
  return allRows.filter(row => headers.some(h => searchableText(row[h]).toLowerCase().includes(term)));
}

function sortRows(rows) {
  if (!sortCol) return rows;
  return [...rows].sort((a, b) => {
    const av = a[sortCol] ?? '', bv = b[sortCol] ?? '';
    const an = Number(av), bn = Number(bv);
    if (!isNaN(an) && !isNaN(bn) && av !== '' && bv !== '') return (an - bn) * sortDir;
    return String(av).localeCompare(String(bv), undefined, { numeric: true }) * sortDir;
  });
}

// ── Events ───────────────────────────────────────────────────────────────────
searchInput.addEventListener('input', e => { searchTerm = e.target.value; render(); });
regexCheckbox.addEventListener('change', e => {
  regexMode = e.target.checked;
  searchInput.classList.remove('regex-error');
  searchInput.placeholder = regexMode ? 'Regex eingeben … z.B. ^Berlin|München$' : 'In allen Spalten suchen …';
  render();
});

$('toggle-cols-btn').addEventListener('click', () => colPanel.classList.toggle('visible'));
$('clear-btn').addEventListener('click', hideUI);

$('export-btn').addEventListener('click', e => { e.stopPropagation(); exportMenu.classList.toggle('open'); });
document.addEventListener('click', () => exportMenu.classList.remove('open'));

$('export-csv').addEventListener('click', () => {
  const rows = sortRows(filterRows());
  const lines = [headers.join(delimiter)];
  rows.forEach(row => lines.push(headers.map(h => quoteCSV(row[h])).join(delimiter)));
  download(lines.join('\n'), fileName || 'export.csv', 'text/csv');
  exportMenu.classList.remove('open');
});

$('export-json').addEventListener('click', () => {
  const rows = sortRows(filterRows());
  const data = rows.map(row => {
    const obj = {};
    headers.forEach(h => {
      const parsed = tryParseJSON(row[h]);
      obj[h] = parsed !== null ? parsed : row[h];
    });
    return obj;
  });
  download(JSON.stringify(data, null, 2), fileName.replace(/\.\w+$/, '.json'), 'application/json');
  exportMenu.classList.remove('open');
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function quoteCSV(val) {
  if (val == null) return '';
  const s = String(val);
  return (s.includes(delimiter) || s.includes('"') || s.includes('\n'))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

function download(content, name, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── JSON Modal ────────────────────────────────────────────────────────────────
const jsonModal   = $('json-modal');
const modalContent = $('modal-content');

function openModal(jsonStr) {
  modalContent.innerHTML = highlightJSON(jsonStr);
  jsonModal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  jsonModal.classList.remove('open');
  document.body.style.overflow = '';
}

$('modal-close').addEventListener('click', closeModal);
jsonModal.addEventListener('click', e => { if (e.target === jsonModal) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
