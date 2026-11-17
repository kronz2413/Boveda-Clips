(function () {
  'use strict';

  var CFG = window.BOVEDA_CONFIG || {};
  var BUCKET = CFG.BUCKET || 'clips';
  var MAX = (CFG.MAX_MB || 50) * 1024 * 1024;
  var EXT_OF = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
  var TYPE_OF = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };

  var ICONS = {
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M6 10l6-6 6 6M4 20h16"/></svg>',
    dl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M6 10l6 6 6-6M4 20h16"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8z"/></svg>'
  };

  var S = {
    sb: null, uid: null, token: null, configured: false, authFailed: false, ready: false, failed: false,
    items: [], filter: 'all', confirm: null, busy: {}, open: null, lbKey: null, lastFocus: null,
    queue: [], tiles: {}
  };

  var $ = function (id) { return document.getElementById(id); };
  var grid = $('grid'), empty = $('empty'), queueEl = $('queue'), notice = $('notice');

  function h(tag, props) {
    var el = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v === false || v == null) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var kid = arguments[i];
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(kid));
    }
    return el;
  }
  function icon(name) { var s = h('span', { 'aria-hidden': 'true' }); s.innerHTML = ICONS[name]; s.style.display = 'inline-flex'; return s; }
  document.querySelectorAll('[data-icon]').forEach(function (n) { n.innerHTML = ICONS[n.getAttribute('data-icon')]; n.style.display = 'inline-flex'; });
  $('limit').textContent = String(CFG.MAX_MB || 50);

  /* ---------- utilidades ---------- */
  function fmtSize(b) {
    if (!b && b !== 0) return '';
    if (b < 1024 * 1024) return Math.max(1, Math.round(b / 1024)) + ' KB';
    return (b / 1048576).toFixed(b >= 10485760 ? 1 : 2) + ' MB';
  }
  function fmtTime(d) {
    if (d == null) return '';
    var s = Math.round(d), m = Math.floor(s / 60), r = s % 60;
    if (m >= 60) { var hh = Math.floor(m / 60); m = m % 60; return hh + ':' + String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0'); }
    return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
  }
  function ratio(w, hh) {
    if (!w || !hh) return '';
    var r = w / hh;
    var c = [[9 / 16, '9:16'], [16 / 9, '16:9'], [1, '1:1'], [4 / 5, '4:5'], [5 / 4, '5:4'], [3 / 4, '3:4'], [4 / 3, '4:3'], [2 / 3, '2:3'], [3 / 2, '3:2']];
    for (var i = 0; i < c.length; i++) if (Math.abs(r - c[i][0]) / c[i][0] < 0.02) return c[i][1];
    return '';
  }
  function fmtDate(ms) {
    try { return new Date(ms).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; }
  }
  function typeOf(file) {
    var t = (file.type || '').toLowerCase();
    if (t === 'image/jpg') t = 'image/jpeg';
    if (EXT_OF[t]) return t;
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    return TYPE_OF[ext] || null;
  }
  function kindOf(type) { return type.indexOf('video/') === 0 ? 'video' : 'image'; }
  function rnd() { return Math.random().toString(36).slice(2, 10); }
  function canUpload() { return !!(S.configured && S.uid); }
  function canDelete(it) { return !!S.uid && it.owner === S.uid; }
  function whoName(it) { return it.owner === S.uid ? 'Tú' : (it.author || 'Visitante'); }
  function safeName(it) {
    var base = it.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'clip';
    return base + '.' + EXT_OF[it.type];
  }

  var toastTimer = null;
  function toast(msg, isErr) {
    var t = $('toast');
    t.textContent = msg; t.className = 'toast' + (isErr ? ' err' : ''); t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 4200);
  }

  function uploadErr(e) {
    var s = e && e.status;
    if (s === 413) return 'Pasa del límite de ' + (CFG.MAX_MB || 50) + ' MB. Exporta una versión más ligera.';
    if (s === 401 || s === 403) return 'Sin permiso para subir. Revisa que el acceso anónimo esté activado en Supabase.';
    if (s === 429) return 'Demasiado rápido. Espera unos segundos e inténtalo de nuevo.';
    if (s === 0) return 'Se cortó la conexión. Inténtalo otra vez.';
    if (e && e.message && /mime|type/i.test(e.message)) return 'Formato no admitido por el servidor.';
    return 'No se pudo completar. Inténtalo otra vez.';
  }

  /* ---------- metadatos ---------- */
  function readMeta(file, kind) {
    return new Promise(function (res) {
      var url = URL.createObjectURL(file), done = false, timer;
      function fin(m) { if (done) return; done = true; clearTimeout(timer); URL.revokeObjectURL(url); res(m || {}); }
      timer = setTimeout(function () { fin({}); }, 8000);
      if (kind === 'image') {
        var im = new Image();
        im.onload = function () { fin({ w: im.naturalWidth, h: im.naturalHeight }); };
        im.onerror = function () { fin({}); };
        im.src = url;
      } else {
        var v = document.createElement('video');
        v.preload = 'metadata'; v.muted = true;
        v.onloadedmetadata = function () { fin({ w: v.videoWidth, h: v.videoHeight, d: isFinite(v.duration) ? v.duration : null }); };
        v.onerror = function () { fin({}); };
        v.src = url;
      }
    });
  }

  /* ---------- Supabase ---------- */
  function publicUrl(path, download) {
    var opts = download ? { download: download } : undefined;
    return S.sb.storage.from(BUCKET).getPublicUrl(path, opts).data.publicUrl;
  }
  function toItem(r) {
    return { id: r.id, owner: r.owner, path: r.path, name: r.name, type: r.type, size: r.size, w: r.width, h: r.height, d: r.duration, author: r.author, at: Date.parse(r.created_at) || 0, url: publicUrl(r.path) };
  }
  function load() {
    return S.sb.from('media').select('*').order('created_at', { ascending: false }).limit(1000).then(function (r) {
      if (r.error) throw r.error;
      S.items = (r.data || []).filter(function (x) { return EXT_OF[x.type]; }).map(toItem);
      S.ready = true; S.failed = false; applyAccess(); refresh();
    }).catch(function (e) { S.failed = true; S.failMsg = loadErrMsg(e); S.ready = true; applyAccess(); refresh(); });
  }
  function loadErrMsg(e) {
    var msg = String((e && e.message) || ''), code = String((e && e.code) || '');
    if (code === 'PGRST205' || code === '42P01' || /could not find the table|does not exist|schema cache/i.test(msg))
      return 'Falta crear la tabla «media» en Supabase. Ejecuta el archivo supabase/setup.sql en el SQL Editor de tu proyecto y recarga.';
    if (/invalid api key|invalid jwt|apikey|unauthorized/i.test(msg) || (e && e.status === 401))
      return 'La clave de config.js no es válida. Copia la Publishable key desde Settings → API Keys en Supabase.';
    if (/fetch|network|load failed/i.test(msg))
      return 'No se pudo llegar a Supabase. Revisa que la URL de config.js sea correcta y que el proyecto no esté pausado.';
    return 'No se pudo leer la bóveda' + (code || msg ? ' (' + (code ? code + ': ' : '') + msg.slice(0, 120) + ')' : '') + '.';
  }
  var loadTimer = null;
  function loadSoon() { clearTimeout(loadTimer); loadTimer = setTimeout(load, 250); }

  function xhrUpload(path, file, type, token, onPct) {
    return new Promise(function (res, rej) {
      var x = new XMLHttpRequest();
      x.open('POST', CFG.SUPABASE_URL + '/storage/v1/object/' + BUCKET + '/' + path);
      x.setRequestHeader('Authorization', 'Bearer ' + token);
      x.setRequestHeader('apikey', CFG.SUPABASE_ANON_KEY);
      x.setRequestHeader('Content-Type', type);
      x.setRequestHeader('Cache-Control', 'max-age=31536000');
      x.setRequestHeader('x-upsert', 'false');
      x.upload.onprogress = function (e) { if (e.lengthComputable) onPct(e.loaded / e.total); };
      x.onload = function () {
        if (x.status >= 200 && x.status < 300) return res();
        var m = ''; try { m = JSON.parse(x.responseText).message || ''; } catch (e) {}
        rej({ status: x.status, message: m });
      };
      x.onerror = function () { rej({ status: 0 }); };
      x.send(file);
    });
  }

  /* ---------- cola y subida ---------- */
  function renderQueue() {
    queueEl.replaceChildren.apply(queueEl, S.queue.map(function (q) {
      var li = h('li', { class: 'q ' + q.state },
        h('span', { class: 'q-name', text: q.name }),
        h('span', { class: 'q-size mono', text: fmtSize(q.size) }),
        q.state === 'error' ? h('button', { class: 'q-x', type: 'button', 'aria-label': 'Quitar de la lista', onclick: function () { dropQ(q); } }, '×') : h('span'),
        h('span', { class: 'q-state', text: q.msg }));
      if (q.state === 'up') {
        var bar = h('span', { class: 'q-bar det' });
        bar.style.width = Math.round((q.pct || 0) * 100) + '%';
        li.append(bar);
      }
      return li;
    }));
    queueEl.hidden = !S.queue.length;
  }
  function dropQ(q) { S.queue = S.queue.filter(function (x) { return x !== q; }); renderQueue(); }
  function setQ(q, state, msg) { q.state = state; q.msg = msg; renderQueue(); }

  function processOne(q) {
    var file = q.file, type = typeOf(file);
    if (!type) {
      var ext = (file.name.split('.').pop() || '').toLowerCase();
      return setQ(q, 'error', 'Formato no admitido' + (ext && ext !== file.name.toLowerCase() ? ' (.' + ext + ')' : '') + '. Usa MP4, WebM, MOV, PNG, JPG, WebP o GIF.');
    }
    if (file.size > MAX) return setQ(q, 'error', 'Pesa ' + fmtSize(file.size) + ' y el límite es ' + (CFG.MAX_MB || 50) + ' MB. Exporta una versión más ligera.');
    if (!file.size) return setQ(q, 'error', 'El archivo está vacío.');
    q.pct = 0; setQ(q, 'up', 'Subiendo el original…');
    var kind = kindOf(type), path = S.uid + '/' + Date.now() + '-' + rnd() + '.' + EXT_OF[type];
    var author = ($('who-in').value || '').trim().slice(0, 40) || null;
    var meta;
    return readMeta(file, kind).then(function (m) {
      meta = m;
      return S.sb.auth.getSession();
    }).then(function (r) {
      var tok = r.data && r.data.session && r.data.session.access_token;
      if (!tok) throw { status: 401 };
      var last = 0;
      return xhrUpload(path, file, type, tok, function (p) {
        if (p - last >= 0.02 || p === 1) { last = p; q.pct = p; renderQueue(); }
      });
    }).then(function () {
      return S.sb.from('media').insert({
        path: path, name: file.name.slice(0, 160), type: type, size: file.size,
        width: meta.w || null, height: meta.h || null, duration: meta.d == null ? null : Math.round(meta.d * 10) / 10, author: author
      });
    }).then(function (r) {
      if (r.error) {
        S.sb.storage.from(BUCKET).remove([path]);
        throw { status: 500, message: r.error.message };
      }
      setQ(q, 'done', 'Listo, subido sin cambios');
      setTimeout(function () { dropQ(q); }, 2600);
      return load();
    }).catch(function (e) { setQ(q, 'error', uploadErr(e)); });
  }

  var uploading = false;
  function handleFiles(list) {
    if (!canUpload()) { toast('No tienes permiso para subir archivos aquí.', true); return; }
    var files = Array.prototype.slice.call(list || []);
    if (!files.length) return;
    files.forEach(function (f) { S.queue.push({ file: f, name: f.name, size: f.size, state: 'wait', msg: 'En cola', pct: 0 }); });
    renderQueue();
    if (uploading) return;
    uploading = true;
    (function next() {
      var q = S.queue.filter(function (x) { return x.state === 'wait'; })[0];
      if (!q) { uploading = false; return; }
      Promise.resolve(processOne(q)).then(next, next);
    })();
  }

  /* ---------- descargar ---------- */
  function downloadItem(it) {
    // La URL pide al servidor el archivo original con Content-Disposition: attachment, sin pasar por la memoria de la página.
    var a = h('a', { href: publicUrl(it.path, safeName(it)), download: safeName(it), rel: 'noopener' });
    document.body.append(a); a.click(); a.remove();
    toast('Descargando el original, sin cambios');
  }

  /* ---------- eliminar ---------- */
  function removeItem(it) {
    if (S.busy[it.id]) return;
    S.busy[it.id] = 1; refresh();
    S.sb.storage.from(BUCKET).remove([it.path]).then(function (r) {
      if (r.error) throw r.error;
      return S.sb.from('media').delete().eq('id', it.id).select();
    }).then(function (r) {
      if (r.error) throw r.error;
      if (!r.data || !r.data.length) throw { denied: true };
      S.items = S.items.filter(function (x) { return x.id !== it.id; });
      S.confirm = null; toast('Archivo eliminado');
      if (S.open === it.id) closeLb();
    }).catch(function (e) {
      S.confirm = null;
      toast(e && e.denied ? 'Solo quien subió el archivo puede eliminarlo.' : 'No se pudo eliminar. Inténtalo otra vez.', true);
    }).then(function () { delete S.busy[it.id]; refresh(); });
  }

  /* ---------- acciones ---------- */
  function actions(it) {
    var busy = !!S.busy[it.id];
    var wrap = h('div', { class: 'acts' });
    if (S.confirm === it.id) {
      wrap.append(
        h('span', { class: 'ask', text: '¿Eliminar para siempre? Esto lo borra para todos.' }),
        h('button', { class: 'btn danger', type: 'button', disabled: busy, onclick: function () { removeItem(it); } }, busy ? 'Eliminando…' : 'Sí, eliminar'),
        h('button', { class: 'btn ghost', type: 'button', disabled: busy, onclick: function () { S.confirm = null; refresh(); } }, 'Cancelar'));
      return wrap;
    }
    wrap.append(h('button', { class: 'btn primary', type: 'button', 'aria-label': 'Descargar ' + it.name, onclick: function () { downloadItem(it); } }, icon('dl'), 'Descargar'));
    if (canDelete(it)) {
      wrap.append(h('button', { class: 'btn ghost icon-only', type: 'button', title: 'Eliminar', 'aria-label': 'Eliminar ' + it.name, onclick: function () { S.confirm = it.id; refresh(); } }, icon('trash')));
    }
    return wrap;
  }

  /* ---------- tarjetas ---------- */
  function metaLine(it) {
    var parts = [];
    if (it.w && it.h) parts.push(it.w + '×' + it.h);
    parts.push(fmtSize(it.size));
    return parts.join(' · ');
  }
  function mediaEl(it, big) {
    var el;
    if (kindOf(it.type) === 'video') {
      el = h('video', { preload: 'metadata', playsinline: true, tabindex: big ? null : '-1' });
      el.muted = true;
      if (big) el.setAttribute('controls', '');
      el.src = it.url + (big ? '' : '#t=0.1');
    } else {
      el = h('img', { alt: it.name, loading: big ? 'eager' : 'lazy', decoding: 'async' });
      el.src = it.url;
    }
    el.addEventListener('error', function () {
      var ph = h('div', { class: 'ph', text: 'Este navegador no puede mostrar la vista previa. Puedes descargar el archivo.' });
      if (el.parentNode) el.replaceWith(ph);
    });
    return el;
  }
  function createTile(it) {
    var isV = kindOf(it.type) === 'video', rt = ratio(it.w, it.h);
    var well = h('button', { class: 'well', type: 'button', 'aria-label': 'Abrir ' + it.name, onclick: function () { openLb(it.id); } },
      mediaEl(it, false),
      h('span', { class: 'badge l', text: rt || (isV ? 'VIDEO' : 'IMG') }),
      h('span', { class: 'badge r mono', text: isV ? (fmtTime(it.d) || EXT_OF[it.type].toUpperCase()) : EXT_OF[it.type].toUpperCase() }),
      isV ? h('span', { class: 'play' }, icon('play')) : null);
    var t = { el: null, name: h('div', { class: 'name' }), meta: h('div', { class: 'meta mono' }), by: h('div', { class: 'by' }), acts: h('div') };
    t.el = h('article', { class: 'tile' }, well, h('div', { class: 'info' }, t.name, t.meta, t.by, t.acts));
    return t;
  }
  function updateTile(t, it) {
    t.name.textContent = it.name; t.name.title = it.name;
    t.meta.textContent = metaLine(it);
    t.by.textContent = whoName(it) + ' · ' + fmtDate(it.at);
    var a = actions(it); t.acts.replaceWith(a); t.acts = a;
  }

  function filtered() {
    return S.items.filter(function (it) {
      if (S.filter === 'video') return kindOf(it.type) === 'video';
      if (S.filter === 'image') return kindOf(it.type) === 'image';
      if (S.filter === 'mine') return it.owner === S.uid;
      return true;
    });
  }

  function render() {
    var list = filtered(), seen = {};
    list.forEach(function (it, i) {
      seen[it.id] = 1;
      var t = S.tiles[it.id];
      if (!t) t = S.tiles[it.id] = createTile(it);
      updateTile(t, it);
      if (grid.children[i] !== t.el) grid.insertBefore(t.el, grid.children[i] || null);
    });
    Object.keys(S.tiles).forEach(function (k) { if (!seen[k]) { S.tiles[k].el.remove(); delete S.tiles[k]; } });

    var total = S.items.length, bytes = S.items.reduce(function (a, x) { return a + (x.size || 0); }, 0);
    $('stats').textContent = S.ready ? (S.failed ? 'Sin conexión' : total + (total === 1 ? ' archivo' : ' archivos') + ' · ' + fmtSize(bytes)) : 'Conectando…';
    $('count').textContent = total ? 'Mostrando ' + list.length + ' de ' + total : '';
    empty.hidden = !(S.ready && !S.failed && !list.length);
    if (S.ready && !list.length && total) {
      empty.querySelector('strong').textContent = 'Nada en este filtro';
      empty.querySelector('span').textContent = 'Prueba con otro tipo o vuelve a Todo.';
    } else if (S.ready && !total) {
      empty.querySelector('strong').textContent = 'Todavía no hay clips';
      empty.querySelector('span').textContent = canUpload() ? 'Arrastra el primero a la zona de arriba. Aparecerá aquí para todos los que abran esta página.' : 'Cuando alguien suba archivos, aparecerán aquí.';
    }
    document.querySelectorAll('.seg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-f') === S.filter)); });
  }

  /* ---------- visor ---------- */
  function itemById(id) { for (var i = 0; i < S.items.length; i++) if (S.items[i].id === id) return S.items[i]; return null; }
  function openLb(id) {
    S.lastFocus = document.activeElement; S.open = id; S.lbKey = null;
    $('lb').hidden = false; document.body.style.overflow = 'hidden';
    renderLb(); $('lbClose').focus();
  }
  function closeLb() {
    var st = $('lbStage'), v = st.querySelector('video');
    if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
    st.replaceChildren();
    S.open = null; S.lbKey = null; $('lb').hidden = true; document.body.style.overflow = '';
    if (S.lastFocus && S.lastFocus.focus) { try { S.lastFocus.focus(); } catch (e) {} }
  }
  function step(dir) {
    var list = filtered(), i = -1;
    for (var n = 0; n < list.length; n++) if (list[n].id === S.open) i = n;
    if (i < 0 || list.length < 2) return;
    S.confirm = null; S.open = list[(i + dir + list.length) % list.length].id; renderLb();
  }
  function fact(dl, label, value) { if (value) dl.append(h('dt', { text: label }), h('dd', { text: value })); }
  function renderLb() {
    if (!S.open) return;
    var it = itemById(S.open);
    if (!it) { closeLb(); return; }
    if (S.lbKey !== S.open) {
      var st = $('lbStage'), old = st.querySelector('video'); if (old) old.pause();
      st.replaceChildren(mediaEl(it, true)); S.lbKey = S.open;
    }
    $('lbName').textContent = it.name;
    var dl = $('lbFacts'); dl.replaceChildren();
    fact(dl, 'Tipo', EXT_OF[it.type].toUpperCase());
    fact(dl, 'Resolución', it.w && it.h ? it.w + '×' + it.h : '');
    fact(dl, 'Formato', ratio(it.w, it.h));
    fact(dl, 'Duración', it.d != null ? fmtTime(it.d) : '');
    fact(dl, 'Tamaño', fmtSize(it.size));
    fact(dl, 'Subido por', whoName(it));
    fact(dl, 'Fecha', fmtDate(it.at));
    $('lbActions').replaceChildren(actions(it));
    var multi = filtered().length > 1;
    $('lbPrev').hidden = !multi; $('lbNext').hidden = !multi;
  }
  function refresh() { render(); renderLb(); }

  $('lbClose').addEventListener('click', closeLb);
  $('lbPrev').addEventListener('click', function () { step(-1); });
  $('lbNext').addEventListener('click', function () { step(1); });
  $('lb').addEventListener('click', function (e) { if (e.target === $('lb')) closeLb(); });
  document.addEventListener('keydown', function (e) {
    if ($('lb').hidden) return;
    if (e.key === 'Escape') closeLb();
    else if (e.key === 'ArrowLeft' && e.target.tagName !== 'VIDEO') step(-1);
    else if (e.key === 'ArrowRight' && e.target.tagName !== 'VIDEO') step(1);
  });
  document.querySelectorAll('.seg button').forEach(function (b) {
    b.addEventListener('click', function () { S.filter = b.getAttribute('data-f'); render(); });
  });

  /* ---------- zona de carga ---------- */
  var drop = $('drop'), input = $('file-in'), who = $('who-in');
  try { who.value = localStorage.getItem('boveda-nombre') || ''; } catch (e) {}
  who.addEventListener('input', function () { try { localStorage.setItem('boveda-nombre', who.value); } catch (e) {} });
  $('pick').addEventListener('click', function () { input.click(); });
  input.addEventListener('change', function () { var f = input.files; handleFiles(f); input.value = ''; });
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); if (canUpload()) drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { handleFiles(e.dataTransfer && e.dataTransfer.files); });
  ['dragover', 'drop'].forEach(function (ev) {
    window.addEventListener(ev, function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) e.preventDefault(); });
  });

  function applyAccess() {
    var ok = canUpload();
    drop.classList.toggle('off', !ok);
    $('pick').disabled = !ok;
    var msg = '';
    if (!S.configured) msg = 'Falta configurar Supabase. Abre config.js y pega la URL y la anon key de tu proyecto (mira el README).';
    else if (S.failed) msg = S.failMsg || 'No se pudo conectar con la bóveda. Revisa tu conexión y recarga la página.';
    else if (S.authFailed) msg = 'Puedes ver y descargar archivos, pero no se pudo iniciar la sesión para subir. Activa «Allow anonymous sign-ins» en Supabase (Authentication → Sign In / Providers).';
    notice.textContent = msg; notice.hidden = !msg;
  }

  /* ---------- inicio ---------- */
  function start() {
    S.configured = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && CFG.SUPABASE_URL.indexOf('TU-PROYECTO') < 0 && CFG.SUPABASE_ANON_KEY !== 'TU-ANON-KEY');
    if (!S.configured || !window.supabase) { S.ready = true; applyAccess(); render(); return; }
    S.sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    S.sb.auth.getSession().then(function (r) {
      if (r.data && r.data.session) return r.data.session;
      return S.sb.auth.signInAnonymously().then(function (x) { return x.data && x.data.session; });
    }).catch(function () { return null; }).then(function (session) {
      if (session && session.user) S.uid = session.user.id; else S.authFailed = true;
      applyAccess();
      return load();
    }).then(function () {
      S.sb.channel('media-feed').on('postgres_changes', { event: '*', schema: 'public', table: 'media' }, loadSoon).subscribe();
      document.addEventListener('visibilitychange', function () { if (!document.hidden) loadSoon(); });
    });
  }

  render();
  start();
})();
