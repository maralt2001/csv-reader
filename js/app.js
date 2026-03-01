// ── Tab State ─────────────────────────────────────────────────────────────────
function createTab(file) {
  return {
    id: Date.now(),
    fileName: file.name,
    allRows: [], headers: [],
    hiddenCols: new Set(),
    sortCol: null, sortDir: 1,
    searchTerm: '', regexMode: false,
    delimiter: ',',
    currentPage: 1, pageSize: 100,
    colWidths: {},
  };
}
let tabs = [];
let activeTabIdx = -1;
let detailRow = null;
function activeTab() { return tabs[activeTabIdx]; }

// ── DOM ──────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const dropZone      = $('drop-zone');
const fileInput     = $('file-input');
const tabBar        = $('tab-bar');
const toolbar       = $('toolbar');
const fileInfo      = $('file-info');
const tableWrap     = $('table-wrap');
const tableHead     = $('table-head');
const tableBody     = $('table-body');
const searchInput   = $('search-input');
const colPanel      = $('col-panel');
const colToggles    = $('col-toggles');
const statusBar     = $('status-bar');
const exportMenu    = $('export-menu');
const regexCheckbox = $('regex-checkbox');
const globalPanel   = $('global-panel');
const globalInput   = $('global-input');
const globalRegex   = $('global-regex');
const globalResults = $('global-results');
const addTabBtn     = $('add-tab-btn');
const pagePrev      = $('page-prev');
const pageNext      = $('page-next');
const pageSizeSelect = $('page-size-select');
const detailPanel   = $('detail-panel');

// ── Drag & Drop ──────────────────────────────────────────────────────────────
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  for (const file of e.dataTransfer.files) addTab(file);
});
dropZone.addEventListener('click', e => { if (e.target.id !== 'browse-btn') fileInput.click(); });
$('browse-btn').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => {
  for (const file of e.target.files) addTab(file);
  fileInput.value = '';
});
addTabBtn.addEventListener('click', () => fileInput.click());

// ── Tab Operations ────────────────────────────────────────────────────────────
function addTab(file) {
  const tab = createTab(file);
  tabs.push(tab);
  activeTabIdx = tabs.length - 1;
  renderTabBar();
  syncUIFromTab();
  loadFile(file, tab);
}

function switchTab(idx) {
  closeDetailPanel();
  activeTabIdx = idx;
  renderTabBar();
  buildColumnToggles();
  syncUIFromTab();
  render();
}

function closeTab(idx) {
  closeDetailPanel();
  tabs.splice(idx, 1);
  if (tabs.length === 0) { activeTabIdx = -1; hideUI(); return; }
  activeTabIdx = Math.min(idx, tabs.length - 1);
  renderTabBar();
  buildColumnToggles();
  syncUIFromTab();
  render();
}

function renderTabBar() {
  tabBar.querySelectorAll('.tab-item').forEach(el => el.remove());
  const addBtn = addTabBtn;
  tabs.forEach((tab, idx) => {
    const item = document.createElement('div');
    item.className = 'tab-item' + (idx === activeTabIdx ? ' active' : '');

    const label = document.createElement('span');
    label.className = 'tab-label';
    label.textContent = tab.fileName;
    label.title = tab.fileName;
    label.addEventListener('click', () => switchTab(idx));

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.title = 'Tab schließen';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', e => { e.stopPropagation(); closeTab(idx); });

    item.appendChild(label);
    item.appendChild(closeBtn);
    tabBar.insertBefore(item, addBtn);
  });
}

function syncUIFromTab() {
  const tab = activeTab();
  if (!tab) return;
  searchInput.value = tab.searchTerm;
  regexCheckbox.checked = tab.regexMode;
  searchInput.classList.remove('regex-error');
  searchInput.placeholder = tab.regexMode
    ? 'Regex eingeben … z.B. ^Berlin|München$'
    : 'In allen Spalten suchen …';
  pageSizeSelect.value = tab.pageSize === Infinity ? 'all' : String(tab.pageSize);
}

// ── File Loading ─────────────────────────────────────────────────────────────
function loadFile(file, tab) {
  const reader = new FileReader();
  reader.onload = e => parseCSV(e.target.result, tab);
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

function parseCSV(text, tab) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length === 0) return;

  tab.delimiter = detectDelimiter(lines[0]);
  tab.headers   = parseRow(lines[0], tab.delimiter);
  tab.allRows   = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = parseRow(lines[i], tab.delimiter);
    const row  = {};
    tab.headers.forEach((h, idx) => { row[h] = vals[idx] !== undefined ? vals[idx] : ''; });
    tab.allRows.push(row);
  }

  tab.hiddenCols  = new Set();
  tab.sortCol     = null;
  tab.sortDir     = 1;
  tab.searchTerm  = '';
  tab.currentPage = 1;
  tab.colWidths   = {};

  if (tabs.indexOf(tab) === activeTabIdx) {
    searchInput.value = '';
    showUI();
    buildColumnToggles();
    render();
  }
}

// ── UI Visibility ────────────────────────────────────────────────────────────
function showUI() {
  dropZone.style.display = 'none';
  tabBar.classList.add('visible');
  toolbar.classList.add('visible');
  fileInfo.classList.add('visible');
  tableWrap.classList.add('visible');
  statusBar.classList.add('visible');
  $('pagination-bar').classList.add('visible');
}

function hideUI() {
  dropZone.style.display = '';
  tabBar.classList.remove('visible');
  toolbar.classList.remove('visible');
  fileInfo.classList.remove('visible');
  tableWrap.classList.remove('visible');
  statusBar.classList.remove('visible');
  $('pagination-bar').classList.remove('visible');
  colPanel.classList.remove('visible');
  globalPanel.classList.remove('visible');
  closeDetailPanel();
  fileInput.value = '';
  renderTabBar();
}

// ── Column Toggles ───────────────────────────────────────────────────────────
function buildColumnToggles() {
  const tab = activeTab();
  colToggles.innerHTML = '';
  tab.headers.forEach(h => {
    const label = document.createElement('label');
    label.className = 'col-toggle';
    const cb = document.createElement('input');
    cb.type    = 'checkbox';
    cb.checked = !tab.hiddenCols.has(h);
    cb.addEventListener('change', () => {
      tab.hiddenCols[cb.checked ? 'delete' : 'add'](h);
      tab.currentPage = 1;
      render();
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(h));
    colToggles.appendChild(label);
  });
}

// ── Pagination ────────────────────────────────────────────────────────────────
function paginateRows(rows) {
  const tab = activeTab();
  if (tab.pageSize === Infinity) return rows;
  const start = (tab.currentPage - 1) * tab.pageSize;
  return rows.slice(start, start + tab.pageSize);
}

function totalPages(count) {
  const tab = activeTab();
  if (tab.pageSize === Infinity) return 1;
  return Math.ceil(count / tab.pageSize) || 1;
}

function renderPagination(filteredCount) {
  const tab   = activeTab();
  const pages = totalPages(filteredCount);
  $('page-info').textContent = `Seite ${tab.currentPage} von ${pages}`;
  pagePrev.disabled = tab.currentPage <= 1;
  pageNext.disabled = tab.currentPage >= pages;
}

function goToPage(n) {
  activeTab().currentPage = n;
  render();
}

// ── Render ───────────────────────────────────────────────────────────────────
function render() {
  const tab = activeTab();
  if (!tab) return;

  const visCols     = tab.headers.filter(h => !tab.hiddenCols.has(h));
  const allFiltered = sortRows(filterRows());
  const pages       = totalPages(allFiltered.length);

  if (tab.currentPage > pages) tab.currentPage = pages;
  if (tab.currentPage < 1)     tab.currentPage = 1;

  const pageRows = paginateRows(allFiltered);
  const startIdx = tab.pageSize === Infinity ? 0 : (tab.currentPage - 1) * tab.pageSize;

  // Head
  tableHead.innerHTML = '';
  const htr = document.createElement('tr');
  const thN = document.createElement('th');
  thN.className   = 'row-num-head';
  thN.textContent = '#';
  htr.appendChild(thN);
  const colWidth = `calc((100% - 44px) / ${visCols.length})`;
  visCols.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col;
    th.style.width = tab.colWidths[col] || colWidth;
    if (tab.sortCol === col) th.classList.add(tab.sortDir === 1 ? 'sort-asc' : 'sort-desc');
    th.addEventListener('click', () => {
      if (tab.sortCol === col) tab.sortDir *= -1;
      else { tab.sortCol = col; tab.sortDir = 1; }
      tab.currentPage = 1;
      render();
    });
    addResizeHandle(th, col);
    htr.appendChild(th);
  });
  tableHead.appendChild(htr);

  // Body
  tableBody.innerHTML = '';
  pageRows.forEach((row, idx) => {
    const tr = document.createElement('tr');
    const tdN = document.createElement('td');
    tdN.className   = 'row-num';
    tdN.textContent = startIdx + idx + 1;
    tr.appendChild(tdN);
    visCols.forEach(col => {
      const td = document.createElement('td');
      td.appendChild(renderCell(row[col]));
      tr.appendChild(td);
    });
    tr.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      if (row === detailRow) { closeDetailPanel(); return; }
      openDetailPanel(row, startIdx + idx + 1);
    });
    if (row === detailRow) tr.classList.add('row-active');
    tableBody.appendChild(tr);
  });

  // File info
  $('info-name').textContent  = tab.fileName;
  $('info-rows').textContent  = tab.allRows.length;
  $('info-cols').textContent  = tab.headers.length;
  $('info-delim').textContent = `Trennzeichen: ${tab.delimiter === '\t' ? 'Tab' : `"${tab.delimiter}"`}`;

  // Status
  if (tab.pageSize === Infinity || allFiltered.length === 0) {
    $('status-left').textContent = `${allFiltered.length} von ${tab.allRows.length} Zeilen`;
  } else {
    const start = startIdx + 1;
    const end   = Math.min(startIdx + tab.pageSize, allFiltered.length);
    $('status-left').textContent = `${start}–${end} von ${allFiltered.length} Zeilen`;
  }
  $('status-right').textContent = `${visCols.length} von ${tab.headers.length} Spalten`;

  renderPagination(allFiltered.length);
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

// ── Shared Helpers ────────────────────────────────────────────────────────────
function escapeHTML(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function textMatches(text, rx, termLower) {
  return rx ? rx.test(text) : text.toLowerCase().includes(termLower);
}

// ── JSON Syntax Highlighter ──────────────────────────────────────────────────
function highlightJSON(json) {
  const escaped = escapeHTML(json);

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

// ── Column Resize ─────────────────────────────────────────────────────────────
function addResizeHandle(th, col) {
  const handle = document.createElement('div');
  handle.className = 'col-resize-handle';
  handle.addEventListener('click', e => e.stopPropagation());
  handle.addEventListener('mousedown', e => {
    e.stopPropagation();
    e.preventDefault();
    const startX     = e.clientX;
    const startWidth = th.offsetWidth;
    handle.classList.add('resizing');
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(e) {
      const w = Math.max(60, startWidth + e.clientX - startX);
      th.style.width = w + 'px';
      activeTab().colWidths[col] = w + 'px';
    }
    function onUp() {
      handle.classList.remove('resizing');
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
  th.appendChild(handle);
}

// ── Filter & Sort ────────────────────────────────────────────────────────────
function filterRows() {
  const tab = activeTab();
  if (!tab.searchTerm) return [...tab.allRows];

  let rx = null;
  if (tab.regexMode) {
    try {
      rx = new RegExp(tab.searchTerm, 'im');
      searchInput.classList.remove('regex-error');
    } catch {
      searchInput.classList.add('regex-error');
      return [...tab.allRows];
    }
  }
  const termLower = tab.searchTerm.toLowerCase();
  return tab.allRows.filter(row => tab.headers.some(h => textMatches(searchableText(row[h]), rx, termLower)));
}

function sortRows(rows) {
  const tab = activeTab();
  if (!tab.sortCol) return rows;
  return [...rows].sort((a, b) => {
    const av = a[tab.sortCol] ?? '', bv = b[tab.sortCol] ?? '';
    const an = Number(av), bn = Number(bv);
    if (!isNaN(an) && !isNaN(bn) && av !== '' && bv !== '') return (an - bn) * tab.sortDir;
    return String(av).localeCompare(String(bv), undefined, { numeric: true }) * tab.sortDir;
  });
}

// ── Events ───────────────────────────────────────────────────────────────────
searchInput.addEventListener('input', e => {
  const tab = activeTab();
  if (!tab) return;
  tab.searchTerm = e.target.value;
  tab.currentPage = 1;
  render();
});

regexCheckbox.addEventListener('change', e => {
  const tab = activeTab();
  if (!tab) return;
  tab.regexMode = e.target.checked;
  tab.currentPage = 1;
  searchInput.classList.remove('regex-error');
  searchInput.placeholder = tab.regexMode
    ? 'Regex eingeben … z.B. ^Berlin|München$'
    : 'In allen Spalten suchen …';
  render();
});

$('toggle-cols-btn').addEventListener('click', () => colPanel.classList.toggle('visible'));
$('clear-btn').addEventListener('click', () => closeTab(activeTabIdx));

$('export-btn').addEventListener('click', e => { e.stopPropagation(); exportMenu.classList.toggle('open'); });
document.addEventListener('click', () => exportMenu.classList.remove('open'));

$('export-csv').addEventListener('click', () => {
  const tab = activeTab();
  if (!tab) return;
  const rows  = sortRows(filterRows());
  const lines = [tab.headers.join(tab.delimiter)];
  rows.forEach(row => lines.push(tab.headers.map(h => quoteCSV(row[h], tab.delimiter)).join(tab.delimiter)));
  download(lines.join('\n'), tab.fileName || 'export.csv', 'text/csv');
  exportMenu.classList.remove('open');
});

$('export-json').addEventListener('click', () => {
  const tab = activeTab();
  if (!tab) return;
  const rows = sortRows(filterRows());
  const data = rows.map(row => {
    const obj = {};
    tab.headers.forEach(h => {
      const parsed = tryParseJSON(row[h]);
      obj[h] = parsed !== null ? parsed : row[h];
    });
    return obj;
  });
  download(JSON.stringify(data, null, 2), tab.fileName.replace(/\.\w+$/, '.json'), 'application/json');
  exportMenu.classList.remove('open');
});

pagePrev.addEventListener('click', () => {
  const tab = activeTab();
  if (tab && tab.currentPage > 1) goToPage(tab.currentPage - 1);
});

pageNext.addEventListener('click', () => {
  const tab = activeTab();
  if (!tab) return;
  const pages = totalPages(sortRows(filterRows()).length);
  if (tab.currentPage < pages) goToPage(tab.currentPage + 1);
});

pageSizeSelect.addEventListener('change', e => {
  const tab = activeTab();
  if (!tab) return;
  tab.pageSize = e.target.value === 'all' ? Infinity : Number(e.target.value);
  tab.currentPage = 1;
  render();
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function quoteCSV(val, delimiter) {
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

// ── Detail Panel ─────────────────────────────────────────────────────────────
function openDetailPanel(row, rowNum) {
  detailRow = row;
  $('detail-title').textContent = `Zeile #${rowNum}`;
  const body = $('detail-body');
  body.innerHTML = '';
  activeTab().headers.forEach(h => {
    const field = document.createElement('div');
    field.className = 'detail-field';

    const label = document.createElement('div');
    label.className = 'detail-label';
    label.textContent = h;

    const valueEl = document.createElement('div');
    valueEl.className = 'detail-value';
    const val = row[h];

    if (val === '' || val == null) {
      const empty = document.createElement('span');
      empty.className = 'cell-empty';
      empty.textContent = 'leer';
      valueEl.appendChild(empty);
    } else {
      const parsed = tryParseJSON(val);
      if (parsed !== null) {
        const pre = document.createElement('pre');
        pre.className = 'detail-json';
        pre.innerHTML = highlightJSON(JSON.stringify(parsed, null, 2));
        valueEl.appendChild(pre);
      } else {
        valueEl.textContent = val;
      }
    }

    field.appendChild(label);
    field.appendChild(valueEl);
    body.appendChild(field);
  });
  detailPanel.classList.add('visible');
}

function closeDetailPanel() {
  detailRow = null;
  detailPanel.classList.remove('visible');
}

$('detail-close').addEventListener('click', closeDetailPanel);

// ── JSON Modal ────────────────────────────────────────────────────────────────
const jsonModal    = $('json-modal');
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
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (jsonModal.classList.contains('open')) closeModal();
    else closeDetailPanel();
  }
});

// ── Globale Suche ─────────────────────────────────────────────────────────────
$('global-search-btn').addEventListener('click', () => {
  globalPanel.classList.toggle('visible');
  if (globalPanel.classList.contains('visible')) {
    globalInput.focus();
  } else {
    closeGlobalPanel();
  }
});
$('global-close-btn').addEventListener('click', closeGlobalPanel);

function closeGlobalPanel() {
  globalPanel.classList.remove('visible');
  globalResults.innerHTML = '';
  globalInput.value = '';
  globalInput.classList.remove('regex-error');
  tabs.forEach(tab => {
    tab.searchTerm = '';
    tab.regexMode = false;
    tab.currentPage = 1;
  });
  if (activeTab()) {
    showUI();
    syncUIFromTab();
    render();
  }
}
globalInput.addEventListener('keydown', e => { if (e.key === 'Enter') runGlobalSearch(); });
$('global-run-btn').addEventListener('click', runGlobalSearch);

function runGlobalSearch() {
  const term = globalInput.value.trim();
  const useRegex = globalRegex.checked;
  if (!term) { globalResults.innerHTML = ''; return; }

  let rx = null;
  if (useRegex) {
    try { rx = new RegExp(term, 'im'); }
    catch { globalInput.classList.add('regex-error'); return; }
  }
  globalInput.classList.remove('regex-error');

  const termLower = term.toLowerCase();
  let totalHits = 0;
  const groups = [];
  tabs.forEach((tab, tabIdx) => {
    const matches = [];
    tab.allRows.forEach((row, rowIdx) => {
      const hitCols = tab.headers.filter(h => textMatches(searchableText(row[h]), rx, termLower));
      if (hitCols.length) matches.push({ rowIdx, row, hitCols });
    });
    if (matches.length) { groups.push({ tab, tabIdx, matches }); totalHits += matches.length; }
  });

  renderGlobalResults(groups, term, useRegex, totalHits);
  hideTableArea();
}

function hideTableArea() {
  tableWrap.classList.remove('visible');
  $('pagination-bar').classList.remove('visible');
  statusBar.classList.remove('visible');
  fileInfo.classList.remove('visible');
  colPanel.classList.remove('visible');
}

function highlightTerm(text, term, useRegex) {
  const esc = escapeHTML(text);
  try {
    const rx = useRegex
      ? new RegExp(term, 'gim')
      : new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return esc.replace(rx, m => `<mark>${m}</mark>`);
  } catch { return esc; }
}

function renderGlobalResults(groups, term, useRegex, totalHits) {
  globalResults.innerHTML = '';

  if (groups.length === 0) {
    globalResults.innerHTML = '<div class="global-no-results">Keine Treffer gefunden.</div>';
    return;
  }

  const summaryEl = document.createElement('div');
  summaryEl.className = 'global-summary';
  summaryEl.textContent = `${totalHits} Treffer in ${groups.length} Tab${groups.length !== 1 ? 's' : ''}`;
  globalResults.appendChild(summaryEl);

  groups.forEach(({ tab, tabIdx, matches }) => {
    const details = document.createElement('details');
    details.className = 'global-group';
    details.open = true;

    const sum = document.createElement('summary');
    sum.className = 'global-group-header';

    const tabName = document.createElement('span');
    tabName.className = 'global-tab-name';
    tabName.textContent = tab.fileName;

    const countEl = document.createElement('span');
    countEl.className = 'global-count';
    countEl.textContent = matches.length;

    sum.appendChild(tabName);
    sum.appendChild(countEl);
    details.appendChild(sum);

    matches.forEach(({ rowIdx, row, hitCols }) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'global-row';
      rowEl.addEventListener('click', () => jumpToResult(tabIdx, rowIdx, term, useRegex));

      const numEl = document.createElement('span');
      numEl.className = 'global-row-num';
      numEl.textContent = `#${rowIdx + 1}`;

      const colsEl = document.createElement('span');
      colsEl.className = 'global-row-cols';

      const displayCols = hitCols.slice(0, 3);
      displayCols.forEach((h, i) => {
        const val = String(row[h] ?? '');
        const isJSON = tryParseJSON(val) !== null;

        const colNameEl = document.createElement('span');
        colNameEl.className = 'global-col-name';
        colNameEl.textContent = h + ': ';

        const valEl = document.createElement('span');
        if (isJSON) {
          valEl.textContent = '[JSON …]';
          valEl.style.color = 'var(--violet)';
        } else {
          valEl.innerHTML = highlightTerm(val, term, useRegex);
        }

        colsEl.appendChild(colNameEl);
        colsEl.appendChild(valEl);

        if (i < displayCols.length - 1) {
          const sep = document.createElement('span');
          sep.className = 'global-sep';
          sep.textContent = ' · ';
          colsEl.appendChild(sep);
        }
      });

      if (hitCols.length > 3) {
        const moreEl = document.createElement('span');
        moreEl.className = 'global-col-name';
        moreEl.textContent = ` +${hitCols.length - 3} weitere`;
        colsEl.appendChild(moreEl);
      }

      rowEl.appendChild(numEl);
      rowEl.appendChild(colsEl);
      details.appendChild(rowEl);
    });

    globalResults.appendChild(details);
  });
}

function jumpToResult(tabIdx, rowIdx, term, useRegex) {
  activeTabIdx = tabIdx;
  const tab = tabs[tabIdx];
  tab.searchTerm = term;
  tab.regexMode = useRegex;
  tab.sortCol = null;
  tab.sortDir = 1;

  // Position im gefilterten Ergebnis bestimmen (filterRows() nutzt jetzt den neuen searchTerm)
  const filtered = filterRows();
  const targetRow = tab.allRows[rowIdx];
  const filteredIdx = filtered.indexOf(targetRow);
  const effectiveIdx = filteredIdx >= 0 ? filteredIdx : 0;

  if (tab.pageSize !== Infinity) {
    tab.currentPage = Math.ceil((effectiveIdx + 1) / tab.pageSize);
  } else {
    tab.currentPage = 1;
  }

  showUI();
  renderTabBar();
  syncUIFromTab();
  buildColumnToggles();
  render();

  requestAnimationFrame(() => {
    const startIdx = tab.pageSize === Infinity ? 0 : (tab.currentPage - 1) * tab.pageSize;
    const localIdx = effectiveIdx - startIdx;
    const rows = tableBody.querySelectorAll('tr');
    const targetTr = rows[localIdx];
    if (targetTr) {
      targetTr.scrollIntoView({ block: 'center', behavior: 'smooth' });
      targetTr.classList.add('row-highlight');
      setTimeout(() => targetTr.classList.remove('row-highlight'), 1500);
    }
  });
}
