(() => {
  const $ = (id) => document.getElementById(id);
  const editor = $('editor');          // Markdown source (Split mode)
  const preview = $('preview');        // Rendered page; editable in Edit/Split
  const previewPane = $('preview-pane');
  const tabsEl = $('tabs');
  const outlineEl = $('outline');
  const recentEl = $('recent');
  let recent = [];
  let headings = [];

  // Each open file is a tab; filePath/savedText mirror the active tab
  let tabs = [];
  let active = null;
  let nextId = 1;
  let tabsSig = '';
  let filePath = null;
  let savedText = '';
  let mode = 'read';
  let renderTimer = null;
  let richTimer = null;
  let richPending = false;
  let lastTarget = 'rich'; // which surface the formatting bar acts on in Split mode

  marked.setOptions({ gfm: true, breaks: false });
  document.execCommand('defaultParagraphSeparator', false, 'p');
  document.execCommand('styleWithCSS', false, false);

  // ---------- HTML -> Markdown ----------
  const td = new TurndownService({
    headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-',
    emDelimiter: '*', strongDelimiter: '**', hr: '---',
  });
  td.use(turndownPluginGfm.gfm);
  td.addRule('image', {
    filter: 'img',
    replacement: (_c, node) => {
      const src = node.getAttribute('data-src') || node.getAttribute('src') || '';
      const alt = node.getAttribute('alt') || '';
      return src ? `![${alt}](${src})` : '';
    },
  });

  // ---------- helpers ----------
  const dirname = (p) => p.replace(/[\\/][^\\/]*$/, '');
  const basename = (p) => p.split(/[\\/]/).pop();
  const toFileUrl = (p) => 'file:///' + p.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:');
  const slug = (t) => t.toLowerCase().trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const isEditable = () => mode !== 'read';

  function resolveImg(src) {
    if (!filePath || /^([a-z]+:|\/\/|#)/i.test(src)) return src;
    return new URL(src, toFileUrl(dirname(filePath)) + '/').href;
  }

  function updateStats() {
    const text = editor.value;
    const words = (text.match(/\S+/g) || []).length;
    $('stats').textContent = `${words} words · ${text.length} characters`;
  }

  const nameOf = (t) => (t.path ? basename(t.path) : 'Untitled');
  const textOf = (t) => (t === active ? editor.value : t.text);
  const isDirty = (t) => textOf(t) !== t.saved;

  function updateTitle() {
    const dirty = active ? isDirty(active) : false;
    document.title = `${dirty ? '● ' : ''}${active ? nameOf(active) : 'Untitled'} - PageSmithMD`;
    window.api.setDirty(tabs.some(isDirty));
    $('saved').textContent = dirty ? 'Unsaved changes' : '';
    renderTabs();
  }

  function renderTabs() {
    const sig = tabs.map((t) => `${t.id}:${nameOf(t)}:${isDirty(t)}:${t === active}`).join('|');
    if (sig === tabsSig) return;
    tabsSig = sig;
    tabsEl.textContent = '';
    for (const t of tabs) {
      const el = document.createElement('div');
      el.className = 'tab' + (t === active ? ' active' : '');
      el.setAttribute('role', 'tab');
      el.title = t.path || 'Untitled';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = nameOf(t);
      el.appendChild(name);
      if (isDirty(t)) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.textContent = '●';
        el.appendChild(dot);
      }
      const x = document.createElement('button');
      x.className = 'x'; x.type = 'button'; x.title = 'Close tab (Ctrl+W)'; x.textContent = '×';
      x.addEventListener('click', (e) => { e.stopPropagation(); closeTab(t); });
      el.appendChild(x);
      el.addEventListener('click', () => { if (t !== active) activate(t); });
      el.addEventListener('auxclick', (e) => { if (e.button === 1) closeTab(t); });
      tabsEl.appendChild(el);
    }
    const plus = document.createElement('button');
    plus.className = 'plus'; plus.type = 'button'; plus.title = 'New document (Ctrl+N)'; plus.textContent = '+';
    plus.addEventListener('click', () => openDoc(null));
    tabsEl.appendChild(plus);
    tabsEl.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // ---------- Markdown -> page ----------
  function render() {
    preview.innerHTML = DOMPurify.sanitize(marked.parse(editor.value));
    preview.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      img.setAttribute('data-src', src);
      img.src = resolveImg(src);
    });
    preview.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h) => { h.id = slug(h.textContent); });
    preview.querySelectorAll('pre code').forEach((c) => {
      try { hljs.highlightElement(c); } catch (_) { /* unknown language */ }
    });
    applyCheckboxState();
    if (isEditable() && !preview.firstChild) preview.innerHTML = '<p><br></p>';
    updateStats();
    buildOutline();
  }

  // ---------- sidebar: outline ----------
  function buildOutline() {
    headings = [...preview.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter((h) => h.textContent.trim());
    outlineEl.textContent = '';
    if (!headings.length) {
      const p = document.createElement('div');
      p.className = 'sb-empty';
      p.textContent = 'No headings';
      outlineEl.appendChild(p);
      return;
    }
    const top = Math.min(...headings.map((h) => +h.tagName[1]));
    headings.forEach((h, i) => {
      const a = document.createElement('a');
      const level = +h.tagName[1];
      a.dataset.level = level;
      a.dataset.i = i;
      a.style.setProperty('--lvl', level - top);
      a.textContent = h.textContent.trim();
      a.title = a.textContent;
      a.addEventListener('click', () => {
        previewPane.scrollTo({ top: h.offsetTop - preview.offsetTop, behavior: 'smooth' });
      });
      outlineEl.appendChild(a);
    });
    markCurrentHeading();
  }

  function markCurrentHeading() {
    if (!headings.length) return;
    const y = previewPane.scrollTop + preview.offsetTop + 40;
    let cur = 0;
    headings.forEach((h, i) => { if (h.offsetTop <= y) cur = i; });
    outlineEl.querySelectorAll('a').forEach((a) => {
      const on = +a.dataset.i === cur;
      if (on && !a.classList.contains('current')) a.scrollIntoView({ block: 'nearest' });
      a.classList.toggle('current', on);
    });
  }
  previewPane.addEventListener('scroll', () => requestAnimationFrame(markCurrentHeading));

  // ---------- sidebar: recent files ----------
  function renderRecent() {
    recentEl.textContent = '';
    if (!recent.length) {
      const li = document.createElement('li');
      li.className = 'sb-empty';
      li.textContent = 'No recent files';
      recentEl.appendChild(li);
      return;
    }
    const cur = (filePath || '').toLowerCase();
    for (const p of recent) {
      const li = document.createElement('li');
      if (p.toLowerCase() === cur) li.className = 'current';
      const open = document.createElement('button');
      open.type = 'button'; open.className = 'open'; open.title = p;
      const n = document.createElement('span'); n.className = 'n'; n.textContent = basename(p);
      const d = document.createElement('span'); d.className = 'd'; d.textContent = dirname(p);
      open.append(n, d);
      open.addEventListener('click', () => window.api.openPath(p));
      const rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'rm'; rm.title = 'Remove from list'; rm.textContent = '×';
      rm.addEventListener('click', () => window.api.removeRecent(p));
      li.append(open, rm);
      recentEl.appendChild(li);
    }
  }

  // ---------- sidebar show/hide, theme ----------
  function setSidebar(open, persist = true) {
    document.body.classList.toggle('sidebar-closed', !open);
    const b = $('sb-toggle');
    b.title = (open ? 'Hide' : 'Show') + ' sidebar (Ctrl+Shift+L)';
    b.setAttribute('aria-label', open ? 'Hide sidebar' : 'Show sidebar');
    if (persist) window.api.setSidebar(open);
  }
  const sidebarOpen = () => !document.body.classList.contains('sidebar-closed');
  $('sb-toggle').addEventListener('click', () => setSidebar(!sidebarOpen()));

  const THEMES = ['system', 'light', 'dark'];
  const THEME_LABEL = { system: 'Theme: Windows', light: 'Theme: Light', dark: 'Theme: Dark' };
  let theme = 'system';
  function showTheme(t) {
    theme = t;
    const b = $('theme-btn');
    b.textContent = THEME_LABEL[t];
    b.title = 'Click to switch: Follow Windows → Light → Dark (also View → Theme)';
  }
  $('theme-btn').addEventListener('click', () => {
    window.api.setTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]);
  });
  window.api.onTheme(showTheme);
  window.api.onRecent((list) => { recent = list; renderRecent(); });

  function applyCheckboxState() {
    preview.querySelectorAll('input[type=checkbox]').forEach((c) => { c.disabled = !isEditable(); });
  }

  // Turndown pads list markers to 4 columns ("-   item"); make them "- item", leaving code fences alone
  function tidy(md) {
    let fence = false;
    return md.replace(/ /g, ' ').split('\n').map((line) => {
      if (/^\s*(```|~~~)/.test(line)) { fence = !fence; return line; }
      return fence ? line : line.replace(/^(\s*)([-*+]|\d+\.)\s{2,}(\[[ xX]\])?\s*/, (_m, ind, mark, box) => `${ind}${mark} ${box ? box + ' ' : ''}`);
    }).join('\n').replace(/\n{3,}/g, '\n\n');
  }

  // ---------- page -> Markdown (live editing) ----------
  function syncFromRich() {
    clearTimeout(richTimer);
    if (!richPending) return;
    richPending = false;
    const copy = preview.cloneNode(true);
    copy.querySelectorAll('td br, th br').forEach((b) => b.remove()); // empty table cells hold a <br>
    let md = tidy(td.turndown(copy.innerHTML));
    if (md.trim()) md = md.replace(/\s+$/, '') + '\n'; else md = '';
    editor.value = md;
    updateStats();
    updateTitle();
    buildOutline();
  }
  function scheduleRichSync() {
    richPending = true;
    clearTimeout(richTimer);
    richTimer = setTimeout(syncFromRich, 150);
    window.api.setDirty(true);
  }

  preview.addEventListener('input', scheduleRichSync);
  preview.addEventListener('change', scheduleRichSync); // checkboxes
  editor.addEventListener('input', () => {
    updateTitle();
    updateStats();
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 120);
  });

  // Paste: keep basic formatting from other apps, but sanitised
  preview.addEventListener('paste', (e) => {
    if (!isEditable()) return;
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    if (html) {
      document.execCommand('insertHTML', false, DOMPurify.sanitize(html, { FORBID_ATTR: ['style', 'class', 'id'] }));
    } else {
      document.execCommand('insertText', false, text);
    }
  });

  // ---------- dialog ----------
  const dlg = $('dlg');
  function ask(label, value, label2) {
    return new Promise((resolve) => {
      $('dlg-label').textContent = label;
      const i1 = $('dlg-input'), i2 = $('dlg-input2');
      i1.value = value || '';
      i2.value = '';
      i2.style.display = label2 ? '' : 'none';
      i2.placeholder = label2 || '';
      $('dlg-ok').value = 'ok';
      dlg.returnValue = '';
      dlg.addEventListener('close', () => {
        resolve(dlg.returnValue === 'ok' ? [i1.value.trim(), i2.value.trim()] : null);
      }, { once: true });
      dlg.showModal();
      i1.focus();
      i1.select();
    });
  }
  $('dlg-cancel').addEventListener('click', () => dlg.close('cancel'));

  // ---------- formatting actions ----------
  const target = () => (mode === 'edit' ? 'rich' : (document.activeElement === editor ? 'src' : (document.activeElement === preview ? 'rich' : (lastTarget === 'src' ? 'src' : 'rich'))));
  document.addEventListener('focusin', (e) => {
    if (e.target === editor) lastTarget = 'src';
    else if (e.target === preview) lastTarget = 'rich';
  });

  // Source (textarea) helpers - use execCommand so Ctrl+Z keeps working
  function srcInsert(text, selStart, selEnd) {
    editor.focus();
    document.execCommand('insertText', false, text);
    if (selStart != null) editor.setSelectionRange(selStart, selEnd);
  }
  function srcWrap(before, after, placeholder) {
    const s = editor.selectionStart, e = editor.selectionEnd;
    const sel = editor.value.slice(s, e) || placeholder;
    editor.focus();
    editor.setSelectionRange(s, e);
    srcInsert(before + sel + after, s + before.length, s + before.length + sel.length);
  }
  function srcLines(fn) {
    const v = editor.value;
    const s = editor.selectionStart, e = editor.selectionEnd;
    const ls = v.lastIndexOf('\n', s - 1) + 1;
    let le = v.indexOf('\n', e);
    if (le < 0) le = v.length;
    const out = v.slice(ls, le).split('\n').map(fn).join('\n');
    editor.focus();
    editor.setSelectionRange(ls, le);
    srcInsert(out, ls, ls + out.length);
  }
  const srcPrefix = (prefix) => srcLines((l) => (l.startsWith(prefix) ? l.slice(prefix.length) : prefix + l));
  const srcHeading = (n) => srcLines((l) => {
    const had = (l.match(/^(#{1,6})\s/) || [])[1];
    const bare = l.replace(/^#{1,6}\s+/, '');
    return had && had.length === n ? bare : '#'.repeat(n) + ' ' + bare;
  });
  function srcBlock(text) {
    const s = editor.selectionStart;
    const pre = s > 0 && editor.value[s - 1] !== '\n' ? '\n\n' : '';
    editor.focus();
    srcInsert(pre + text + '\n');
  }

  // Rich (WYSIWYG) helpers
  const exec = (cmd, val) => { preview.focus(); document.execCommand(cmd, false, val); };
  const blockName = () => (document.queryCommandValue('formatBlock') || '').toLowerCase().replace(/[<>]/g, '');
  const selText = () => String(window.getSelection());
  const inside = (sel) => {
    const n = window.getSelection().anchorNode;
    const el = n && (n.nodeType === 1 ? n : n.parentElement);
    return el && preview.contains(el) ? el.closest(sel) : null;
  };
  function saveRange() {
    const s = window.getSelection();
    return s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
  }
  function restoreRange(r) {
    preview.focus();
    if (!r) return;
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  const actions = {
    bold:   { src: () => srcWrap('**', '**', 'bold text'),   rich: () => exec('bold') },
    italic: { src: () => srcWrap('*', '*', 'italic text'),   rich: () => exec('italic') },
    strike: { src: () => srcWrap('~~', '~~', 'text'),        rich: () => exec('strikeThrough') },
    code: {
      src: () => srcWrap('`', '`', 'code'),
      rich: () => {
        preview.focus();
        const c = inside('code');
        if (c && !c.closest('pre')) { document.execCommand('insertText', false, c.textContent); return; }
        document.execCommand('insertHTML', false, `<code>${esc(selText() || 'code')}</code>`);
      },
    },
    h1: { src: () => srcHeading(1), rich: () => exec('formatBlock', blockName() === 'h1' ? 'p' : 'h1') },
    h2: { src: () => srcHeading(2), rich: () => exec('formatBlock', blockName() === 'h2' ? 'p' : 'h2') },
    h3: { src: () => srcHeading(3), rich: () => exec('formatBlock', blockName() === 'h3' ? 'p' : 'h3') },
    ul: { src: () => srcPrefix('- '), rich: () => exec('insertUnorderedList') },
    ol: {
      src: () => { let i = 0; srcLines((l) => (/^\d+\.\s/.test(l) ? l.replace(/^\d+\.\s/, '') : `${++i}. ${l}`)); },
      rich: () => exec('insertOrderedList'),
    },
    task: {
      src: () => srcPrefix('- [ ] '),
      rich: () => {
        preview.focus();
        document.execCommand('insertHTML', false, `<ul><li><input type="checkbox">&nbsp;${esc(selText() || '')}</li></ul>`);
      },
    },
    quote: {
      src: () => srcPrefix('> '),
      rich: () => (inside('blockquote') ? exec('outdent') : exec('formatBlock', 'blockquote')),
    },
    link: {
      src: async () => {
        const s = editor.selectionStart, e = editor.selectionEnd;
        const text = editor.value.slice(s, e);
        const r = await ask('Link address', 'https://');
        if (!r || !r[0]) return;
        editor.focus();
        editor.setSelectionRange(s, e);
        srcInsert(`[${text || r[0]}](${r[0]})`);
      },
      rich: async () => {
        const range = saveRange();
        const text = selText();
        const r = await ask('Link address', 'https://');
        restoreRange(range);
        if (!r || !r[0]) return;
        if (text) document.execCommand('createLink', false, r[0]);
        else document.execCommand('insertHTML', false, `<a href="${esc(r[0])}">${esc(r[0])}</a>`);
      },
    },
    image: {
      src: async () => {
        const s = editor.selectionStart, e = editor.selectionEnd;
        const r = await ask('Image address or path', '', 'Description (alt text)');
        if (!r || !r[0]) return;
        editor.focus();
        editor.setSelectionRange(s, e);
        srcInsert(`![${r[1] || editor.value.slice(s, e)}](${r[0]})`);
      },
      rich: async () => {
        const range = saveRange();
        const r = await ask('Image address or path', '', 'Description (alt text)');
        restoreRange(range);
        if (!r || !r[0]) return;
        document.execCommand('insertHTML', false,
          `<img src="${esc(resolveImg(r[0]))}" data-src="${esc(r[0])}" alt="${esc(r[1])}">`);
      },
    },
    codeblock: {
      src: () => {
        const sel = editor.value.slice(editor.selectionStart, editor.selectionEnd);
        srcBlock('```\n' + sel + '\n```');
      },
      rich: () => {
        preview.focus();
        document.execCommand('insertHTML', false, `<pre><code>${esc(selText() || 'code')}</code></pre><p><br></p>`);
      },
    },
    table: {
      src: () => srcBlock('| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |'),
      rich: () => {
        preview.focus();
        document.execCommand('insertHTML', false,
          '<table><thead><tr><th>Column 1</th><th>Column 2</th><th>Column 3</th></tr></thead>' +
          '<tbody><tr><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table><p><br></p>');
      },
    },
    hr: { src: () => srcBlock('---'), rich: () => exec('insertHorizontalRule') },
    undo: { src: () => { editor.focus(); document.execCommand('undo'); }, rich: () => exec('undo') },
  };

  const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const items = [
    ['bold', 'Bold (Ctrl+B)', '<span style="font-weight:700">B</span>'],
    ['italic', 'Italic (Ctrl+I)', '<span style="font-style:italic;font-family:Georgia,serif;font-weight:500">I</span>'],
    ['strike', 'Strikethrough', '<span style="text-decoration:line-through;font-weight:500">S</span>'],
    ['code', 'Inline code', svg('<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 5l-4 14"/>')],
    '|',
    ['h1', 'Heading 1', 'H<sub>1</sub>'],
    ['h2', 'Heading 2', 'H<sub>2</sub>'],
    ['h3', 'Heading 3', 'H<sub>3</sub>'],
    '|',
    ['ul', 'Bulleted list', svg('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r=".9"/><circle cx="4.5" cy="12" r=".9"/><circle cx="4.5" cy="18" r=".9"/>')],
    ['ol', 'Numbered list', svg('<path d="M10 6h10M10 12h10M10 18h10M4 5l1.5-1v5M3.5 14.5c0-1.2 2.6-1.2 2.6 0 0 1.2-2.6 1.8-2.6 3h2.6"/>')],
    ['task', 'Task list', svg('<path d="M3 6l1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17M11 6h9M11 12h9M11 18h9"/>')],
    ['quote', 'Quote', svg('<path d="M5 12h4v5H5zM5 12c0-3 1-4.500 3-5.500M14 12h4v5h-4zM14 12c0-3 1-4.500 3-5.500"/>')],
    '|',
    ['link', 'Link (Ctrl+K)', svg('<path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1"/>')],
    ['image', 'Image', svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.600"/><path d="M4 18l5-5 4 4 3-3 4 4"/>')],
    ['codeblock', 'Code block', svg('<path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/><path d="M4 3h3M17 3h3M4 21h3M17 21h3" opacity=".5"/>')],
    ['table', 'Table', svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M3 15h18M9 5v14M15 5v14"/>')],
    ['hr', 'Horizontal rule', svg('<path d="M4 12h16"/>')],
    '|',
    ['undo', 'Undo (Ctrl+Z)', svg('<path d="M4 8v5h5"/><path d="M5 13a8 8 0 1 1 2.500 5.800"/>')],
  ];
  const bar = $('fmt-tools');
  for (const it of items) {
    if (it === '|') { const g = document.createElement('span'); g.className = 'gap'; bar.appendChild(g); continue; }
    const [id, title, html] = it;
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.action = id; b.title = title; b.innerHTML = html;
    b.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus/selection where it was
    b.addEventListener('click', () => runAction(id));
    bar.appendChild(b);
  }
  function runAction(id) {
    if (!isEditable()) return;
    const a = actions[id];
    return target() === 'src' ? a.src() : a.rich();
  }

  // Highlight B / I / S / lists when the caret is inside them
  document.addEventListener('selectionchange', () => {
    if (!isEditable() || document.activeElement !== preview) return;
    const map = { bold: 'bold', italic: 'italic', strike: 'strikeThrough', ul: 'insertUnorderedList', ol: 'insertOrderedList' };
    for (const [id, cmd] of Object.entries(map)) {
      const b = bar.querySelector(`[data-action="${id}"]`);
      if (b) b.classList.toggle('active', document.queryCommandState(cmd));
    }
  });

  // ---------- modes / files ----------
  function setMode(m) {
    if (mode !== 'read') syncFromRich();
    mode = m;
    document.body.classList.remove('mode-read', 'mode-edit', 'mode-split');
    document.body.classList.add('mode-' + m);
    preview.contentEditable = m === 'read' ? 'false' : 'true';
    applyCheckboxState();
    if (m !== 'read' && !preview.firstChild) preview.innerHTML = '<p><br></p>';
    if (m === 'edit') { lastTarget = 'rich'; preview.focus(); }
    if (m === 'split') editor.focus();
  }

  // ---------- tabs ----------
  function stash() {
    if (!active) return;
    syncFromRich();
    active.text = editor.value;
    active.mode = mode;
    active.scroll = previewPane.scrollTop;
    active.path = filePath;
    active.saved = savedText;
  }

  function activate(t) {
    stash();
    active = t;
    filePath = t.path;
    savedText = t.saved;
    editor.value = t.text;
    richPending = false;
    render();
    setMode(t.mode);
    updateTitle();
    previewPane.scrollTop = t.scroll || 0;
    renderRecent();
    markCurrentHeading();
  }

  // file = {path, content}, or null for a blank document
  function openDoc(file) {
    if (file) {
      const same = tabs.find((t) => t.path && t.path.toLowerCase() === file.path.toLowerCase());
      if (same) { activate(same); return; }
    }
    // The textarea works in \n, so normalise here and put the file's own line endings / BOM back on save
    let content = file ? file.content : '';
    const bom = content.charCodeAt(0) === 0xFEFF;
    if (bom) content = content.slice(1);
    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    content = content.replace(/\r\n/g, '\n');
    const t = {
      id: nextId++, path: file ? file.path : null, eol, bom,
      saved: content, text: content,
      mode: file ? 'read' : 'edit', scroll: 0,
    };
    // A single blank, untouched tab is replaced rather than kept beside the new file
    if (file && tabs.length === 1 && !tabs[0].path && !isDirty(tabs[0]) && textOf(tabs[0]) === '') {
      tabs = [t];
      active = null;
    } else {
      tabs.push(t);
    }
    activate(t);
  }

  async function closeTab(t) {
    if (isDirty(t)) {
      if (t !== active) activate(t);
      const choice = await window.api.confirmSave(nameOf(t));
      if (choice === 'cancel') return false;
      if (choice === 'save' && !(await save(false))) return false;
    }
    const i = tabs.indexOf(t);
    tabs.splice(i, 1);
    if (!tabs.length) { active = null; openDoc(null); }
    else if (t === active) { active = null; activate(tabs[Math.min(i, tabs.length - 1)]); }
    else renderTabs();
    return true;
  }

  async function closeWindow() {
    for (const t of [...tabs]) {
      if (!isDirty(t)) continue;
      activate(t);
      const choice = await window.api.confirmSave(nameOf(t));
      if (choice === 'cancel') return;
      if (choice === 'save' && !(await save(false))) return;
    }
    window.api.closeNow();
  }

  function cycleTab(dir) {
    if (tabs.length < 2) return;
    activate(tabs[(tabs.indexOf(active) + dir + tabs.length) % tabs.length]);
  }

  async function save(saveAs) {
    syncFromRich();
    let out = editor.value;
    if (active.eol === '\r\n') out = out.replace(/\n/g, '\r\n');
    if (active.bom) out = '﻿' + out;
    const p = await window.api.save(out, !!saveAs, filePath);
    if (!p) return false;
    const changed = p !== filePath;
    filePath = p;
    savedText = editor.value;
    active.path = p;
    active.saved = savedText;
    updateTitle();
    if (changed) { const keep = previewPane.scrollTop; render(); previewPane.scrollTop = keep; }
    return true;
  }

  // Keep the page roughly aligned with the source in Split mode
  editor.addEventListener('scroll', () => {
    if (mode !== 'split') return;
    const r = editor.scrollTop / Math.max(1, editor.scrollHeight - editor.clientHeight);
    previewPane.scrollTop = r * (previewPane.scrollHeight - previewPane.clientHeight);
  });

  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && !e.shiftKey && !e.altKey && isEditable()) {
      const k = e.key.toLowerCase();
      const id = { b: 'bold', i: 'italic', k: 'link' }[k];
      if (id) { e.preventDefault(); runAction(id); }
    }
  });

  // Links: click opens in Read mode; Ctrl+click while editing
  preview.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    if (isEditable() && !e.ctrlKey) return;
    const href = a.getAttribute('href') || '';
    if (href.startsWith('#')) {
      const t = document.getElementById(decodeURIComponent(href.slice(1)));
      if (t) t.scrollIntoView({ behavior: 'smooth' });
    } else if (href) {
      window.api.openLink(href, filePath);
    }
  });

  document.querySelectorAll('.seg button').forEach((b) =>
    b.addEventListener('click', () => setMode(b.dataset.mode)));

  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    for (const f of e.dataTransfer.files) {
      const p = window.api.pathForFile(f);
      if (p) window.api.openPath(p);
    }
  });

  window.api.onOpenFile(openDoc);
  window.api.onCommand(async (cmd) => {
    switch (cmd) {
      case 'save': return save(false);
      case 'save-as': return save(true);
      case 'new-tab': return openDoc(null);
      case 'close-tab': return active && closeTab(active);
      case 'next-tab': return cycleTab(1);
      case 'prev-tab': return cycleTab(-1);
      case 'close-request': return closeWindow();
      case 'mode-read': return setMode('read');
      case 'mode-edit': return setMode('edit');
      case 'mode-split': return setMode('split');
      case 'export-pdf': syncFromRich(); return window.api.exportPdf(filePath);
      case 'print': return window.api.print();
      case 'toggle-sidebar': return setSidebar(!sidebarOpen());
    }
  });

  (async () => {
    const st = await window.api.getSettings();
    showTheme(st.theme);
    setSidebar(st.sidebarOpen, false);
    recent = st.recent;
    renderRecent();
    const initial = await window.api.getInitial();
    if (initial.length) {
      initial.forEach(openDoc);
      activate(tabs[0]);
    } else {
      openDoc(null); // a blank document opens ready to type in
    }
  })();
})();
