/**
 * app.js – Modelora V7
 * All fixes: sidebar toggle, lock overlay, micro-refresh (5s alerts only),
 * arena runs all categories top-10, what-if all model types,
 * axis shows string labels, axis point colours, 20 chart types.
 */

// ── State ─────────────────────────────────────────────────────────────────────
const S = {
  token:   localStorage.getItem('ml_token') || '',
  user:    localStorage.getItem('ml_user')  || '',
  dataset: null,
  result:  null,
  cols:    [],
  numCols: [],
  algos:   {},
  vizMode: 'default',
  userVizData: null,
  isDemo:  localStorage.getItem('ml_demo') === '1',
  isLocked: false,
};

function escHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (!S.token) { window.location = '/login'; return; }
  applyTheme(localStorage.getItem('ml_theme') || 'dark');
  fetchAndApplyPublicTheme();
  injectPageIcons();

  document.getElementById('ld-text').textContent = 'Loading Dashboard…';
  document.getElementById('ld-sub').textContent  = 'Preparing your workspace';

  await Promise.all([loadMeEnhanced(), loadAlgos()]);
  loadAnnouncements();
  buildAlgoGrid();
  setupUpload();
  setupAlgoCascade();
  loadHistory();

  // ── Micro-refresh every 3s (notifications, lock, logout, alerts ONLY)
  setInterval(pollAdminNotifs, 3000);
  setInterval(refreshSessionState, 3000);
  // Announcements less frequently
  setInterval(loadAnnouncements, 30000);
  // Inactivity auto-logout: 30 min
  startUserInactivityTimer();

  if (S.isDemo) showDemoBadge();
  if (localStorage.getItem('ml_tutorial_done') !== '1') startTutorial();
  setTimeout(() => hideLoad(), 600);
});

// ── Sidebar Toggle ────────────────────────────────────────────────────────────
function toggleSidebar() {
  const isMobile = window.innerWidth <= 900;
  if (isMobile) {
    document.body.classList.toggle('sb-mobile-open');
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('open');
    document.body.classList.remove('sb-hidden');
  } else {
    document.body.classList.toggle('sb-hidden');
    const collapsed = document.body.classList.contains('sb-hidden');
    localStorage.setItem('ml_sb_hidden', collapsed ? '1' : '0');
    // Clear any stale inline styles
    const mainEl = document.getElementById('main');
    const hdrEl  = document.getElementById('header');
    if (mainEl) mainEl.style.marginLeft = '';
    if (hdrEl)  hdrEl.style.left = '';
  }
}

// Mobile sidebar overlay
(function setupSbOverlay() {
  let overlay = document.getElementById('sb-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sb-overlay';
    document.body.appendChild(overlay);
  }
  overlay.addEventListener('click', () => {
    document.body.classList.remove('sb-mobile-open');
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('open');
  });
})();

// Inject reopen button outside sidebar (desktop only)
(function injectReopenBtn() {
  if (document.getElementById('sidebar-reopen')) return;
  const btn = document.createElement('div');
  btn.id = 'sidebar-reopen';
  btn.title = 'Open sidebar';
  btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
  btn.onclick = toggleSidebar;
  document.body.appendChild(btn);
  // Restore desktop collapsed state
  if (localStorage.getItem('ml_sb_hidden') === '1' && window.innerWidth > 900) {
    document.body.classList.add('sb-hidden');
  }
})();

// ── Auth / Lock ───────────────────────────────────────────────────────────────
function logout() {
  // Preserve lock state across logout so login page can show it
  const token = S.token || localStorage.getItem('ml_token');
  // Fire-and-forget server logout
  if (token) fetch('/api/auth/logout', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } }).catch(() => {});
  localStorage.clear();
  window.location = '/login';
}

function showLockScreen() {
  S.isLocked = true;
  // Mark as locked so login page shows message and blocks re-login
  // Invalidate token — user cannot re-enter without admin unlock
  localStorage.removeItem('ml_token');

  const el = document.getElementById('lock-overlay');
  if (el) {
    el.classList.add('show');
    const msgEl = el.querySelector('.lock-msg');
    if (msgEl) msgEl.textContent = 'Your account has been locked by an administrator. Contact support to have your access restored.';
  }
  // Redirect to login after short delay so user sees the lock animation
  setTimeout(() => { window.location = '/login'; }, 3200);
}

async function loadMeEnhanced() {
  const d = await api('GET', '/api/auth/me');
  if (!d || !d.ok) {
    if (d?.is_locked) showLockScreen();
    else if (d?.msg?.includes('Unauthorized') || d?.msg?.includes('Invalid')) logout();
    return;
  }

  // Check lock status
  if (d.is_locked || d.user?.is_locked) { showLockScreen(); return; }

  const dname = d.display_name || d.user?.display_name || d.username || S.user || '?';
  const email  = d.email || d.user?.email || S.user || '';
  const role   = d.role || d.user?.role || 'user';
  localStorage.setItem('ml_display_name', dname);
  // Show admin back button for admin accounts
  const adminBtn = document.getElementById('admin-to-dash-btn');
  if (adminBtn) { role === 'admin' ? adminBtn.classList.add('show') : adminBtn.classList.remove('show'); }

  ['sb-avatar','h-avatar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = dname[0]?.toUpperCase() || '?';
  });
  ['sb-name','h-uname','ud-dname'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.textContent = i < 2 ? dname : dname;
  });
  const ue = document.getElementById('ud-email'); if (ue) ue.textContent = email;
  const exps = d.stats?.total || d.experiments || 0;
  const se = document.getElementById('sb-exp');
  if (se) se.textContent = `${exps} experiment${exps !== 1 ? 's' : ''}`;

  // Check for session time limit
  const timeLimit = d.time_limit || d.user?.time_limit || 0;
  const lastLogin = d.last_login || d.user?.last_login || 0;
  if (timeLimit > 0 && lastLogin > 0) {
    const endTime = (lastLogin + timeLimit * 60) * 1000;
    if (_sessionEndTime !== endTime) {
      startSessionCountdown(endTime);
    }
  } else {
    hideSessionCountdown();
  }
}

async function refreshSessionState() {
  if (!S.token) return;
  const d = await api('GET', '/api/auth/me');
  if (!d || !d.ok) {
    if (d?.is_locked || d?.user?.is_locked) showLockScreen();
    else if (d?.msg?.includes('Unauthorized') || d?.msg?.includes('Invalid')) logout();
    return;
  }
  const timeLimit = d.time_limit || d.user?.time_limit || 0;
  const lastLogin = d.last_login || d.user?.last_login || 0;
  if (timeLimit > 0 && lastLogin > 0) {
    const endTime = (lastLogin + timeLimit * 60) * 1000;
    if (_sessionEndTime !== endTime) {
      startSessionCountdown(endTime);
    }
  } else {
    hideSessionCountdown();
  }
}

// ── Micro-refresh: only polls notifications/lock/logout (NOT full reload) ─────
async function pollAdminNotifs() {
  try {
    const uname = localStorage.getItem('ml_user');
    if (!uname || !S.token) return;
    const r = await api('GET', `/api/admin/notifications/${encodeURIComponent(uname)}`);
    if (!r || !r.ok) return;
    const notes = r.notifications || [];
  if (notes.length) {
    // Refresh user session info immediately when admin sends any notification.
    await loadMeEnhanced();
  }
  notes.forEach(n => {
      if (n.action === 'lock' || n.type === 'lock') {
        showLockScreen();
        return;
      }
      if (n.action === 'force_logout' || n.type === 'force_logout') {
        toast('You have been logged out by an administrator.', 'warning', 3000);
        setTimeout(() => logout(), 2000);
        return;
      }
      toast(n.msg || n.message || '', n.severity || n.type || 'info', 6000);
    });
  } catch (e) {}
}

// ── Inactivity auto-logout (30 min) ──────────────────────────────────────────
let _inactTimer = null;
const INACT_MS = 30 * 60 * 1000; // 30 min
function resetUserInactivity() { clearTimeout(_inactTimer); _inactTimer = setTimeout(doInactLogout, INACT_MS); }
function doInactLogout() {
  toast('Session expired due to 30 min inactivity. Logging out…', 'warning', 4000);
  setTimeout(() => logout(), 3500);
}
function startUserInactivityTimer() {
  resetUserInactivity();
  ['mousemove','keydown','click','scroll','touchstart'].forEach(ev =>
    document.addEventListener(ev, resetUserInactivity, { passive: true })
  );
}

function showDemoBadge() {
  const badge = document.createElement('div');
  badge.id = 'demo-badge';
  badge.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#ffb700;color:#000;padding:7px 18px;border-radius:99px;font-size:12px;font-weight:700;z-index:999;display:flex;align-items:center;gap:6px;box-shadow:0 4px 16px rgba(255,183,0,0.4)';
  badge.innerHTML = 'Demo Mode — <a href="/login" style="color:inherit;text-decoration:underline">Sign in</a> to upload data';
  document.body.appendChild(badge);
  badge.querySelector('a')?.addEventListener('click', clearDemoSession);
}

function clearDemoSession() {
  localStorage.removeItem('ml_token');
  localStorage.removeItem('ml_user');
  localStorage.removeItem('ml_role');
  localStorage.removeItem('ml_display_name');
  localStorage.removeItem('ml_tutorial_done');
  localStorage.removeItem('ml_demo');
}

function exitDemoToSignup() {
  clearDemoSession();
  window.location = '/login?signup=1';
}

function showDemoGate(feature = 'This feature') {
  showCustomModal({
    title: `${feature} requires an account`,
    body: 'You\'re in demo mode. Create a free account to upload your own datasets, save experiments, and access all features.',
    icon: 'info', confirmText: 'Sign In / Register', cancelText: 'Continue Demo',
    onConfirm: exitDemoToSignup
  });
}

// ── API ───────────────────────────────────────────────────────────────────────
async function api(method, url, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${S.token}` }
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 15000);
    const r    = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(tid);
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      return { ok: false, msg: `Server error (${r.status})` };
    }
    return await r.json();
  } catch (e) {
    return { ok: false, msg: e.name === 'AbortError' ? 'Request timed out' : String(e) };
  }
}

// ── Theme ─────────────────────────────────────────────────────────────────────
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  updateThemeIcon(t);
  localStorage.setItem('ml_theme', t);
  // Restore any custom CSS vars saved by admin theme
  try {
    const vars = JSON.parse(localStorage.getItem('ml_theme_vars') || '{}');
    Object.entries(vars).forEach(([k,v]) => document.documentElement.style.setProperty(k, v));
  } catch(e) {}
}

async function fetchAndApplyPublicTheme() {
  try {
    const r = await fetch('/api/config/public');
    const d = await r.json();
    if (!d.ok || !d.theme) return;
    const t = d.theme;
    const map = {primary:'--primary',secondary:'--second',accent:'--accent',success:'--success',warning:'--warning',danger:'--danger'};
    const vars = {};
    Object.entries(map).forEach(([k,v]) => { if(t[k]){document.documentElement.style.setProperty(v,t[k]);vars[v]=t[k];} });
    if (t.border_radius) { const r=t.border_radius+'px'; document.documentElement.style.setProperty('--radius',r); vars['--radius']=r; }
    if (t.font && t.font!=='DM Sans') {
      const fv = `'${t.font}',sans-serif`;
      document.documentElement.style.setProperty('--font', fv);
      vars['--font'] = fv;
    }
    // Cache for offline use
    localStorage.setItem('ml_theme_vars', JSON.stringify(vars));
    // Apply default theme (light/dark) from admin config, only if user hasn't manually overridden
    if (t.default_theme) {
      const userOverride = localStorage.getItem('ml_theme_user_override');
      if (!userOverride) {
        applyTheme(t.default_theme);
      }
    }
  } catch(e) {}
}
function updateThemeIcon(t) {
  const btn = document.getElementById('theme-btn');
  if (!btn) return;
  const moonSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  const sunSvg  = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  btn.innerHTML = t === 'light' ? moonSvg : sunSvg;
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  localStorage.setItem('ml_theme_user_override', '1'); // user manually chose
  applyTheme(cur);
  if (window._currentVizName) openViz(window._currentVizName);
}

function injectPageIcons() {
  document.querySelectorAll('.si[data-icon], .tab-icon[data-icon]').forEach(el => {
    const name = el.getAttribute('data-icon');
    const sz   = el.classList.contains('tab-icon') ? 15 : 16;
    const svg  = window.renderIcon ? renderIcon(name, sz) : '';
    if (svg) el.innerHTML = svg;
  });
}

// ── Toast — minimal pill notification ────────────────────────────────────────
function toast(msg, type = 'info', dur = 4000) {
  const wrap = document.getElementById('toasts');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const icons = {success:'OK', error:'!', warning:'!', info:'·'};
  el.innerHTML = `<span class="t-dot"></span><span class="t-msg">${String(msg).replace(/</g,'&lt;')}</span><button class="t-x" onclick="this.parentNode.remove()">×</button>`;
  wrap.appendChild(el);
  const tid = setTimeout(() => { el.style.opacity='0'; el.style.transform='translateX(110%)'; setTimeout(()=>el.remove(),300); }, dur);
  el.querySelector('.t-x').addEventListener('click', ()=>clearTimeout(tid));
}

// ── Loading ───────────────────────────────────────────────────────────────────
function showLoad(text = 'Processing…', sub = 'Please wait') {
  document.getElementById('ld-text').textContent = text;
  document.getElementById('ld-sub').textContent  = sub;
  document.getElementById('overlay').classList.add('show');
}
function hideLoad() { document.getElementById('overlay').classList.remove('show'); }

// ── Tabs ──────────────────────────────────────────────────────────────────────
function switchTab(btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tp').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  const tp = document.getElementById('tab-' + btn.dataset.tab);
  if (tp) tp.classList.add('active');
}

// ── Steps ─────────────────────────────────────────────────────────────────────
function setStep(n) {
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById(`sn-${i}`);
    const st = document.getElementById(`step-${i}`);
    if (!el || !st) continue;
    el.className = i < n ? 'snum done' : i === n ? 'snum active' : 'snum inactive';
    st.className = `step${i === n ? ' active' : i < n ? ' done' : ''}`;
  }
}

// ── Upload ────────────────────────────────────────────────────────────────────

// ── Dataset notes / warnings ──────────────────────────────────────────────────
const DATASET_NOTES = {
  digits: { type: 'warn', msg: 'Digits dataset has 64 features (8×8 pixels). Processing may take 10–30s. Best with SML Classification algorithms.' },
  '20news_small': { type: 'warn', msg: 'Text dataset — requires TF-IDF vectorization. Only use with compatible classifiers. May be slow to load.' },
  california: { type: 'warn', msg: 'Large dataset (~20k rows). Loading and correlation analysis may take 15–30s.' },
  olivetti: { type: 'warn', msg: 'Image PCA dataset. Correlation chart may be slow. Best used with Unsupervised algorithms.' },
  swiss_roll: { type: 'info', msg: 'ℹ 3D manifold dataset. Use with Dim. Reduction algorithms (t-SNE, UMAP, PCA). No meaningful target column.' },
  s_curve: { type: 'info', msg: 'ℹ 3D curve dataset. Best with Dim. Reduction. Select numeric columns as features.' },
  no_structure: { type: 'info', msg: 'Uniform random data — no clusters or patterns by design. Good for testing anomaly detection.' },
  stock_sim: { type: 'info', msg: 'ℹ Time-series simulation. Use with Regression algorithms. Set a numeric column as target.' },
  sensor_sim: { type: 'info', msg: 'ℹ Simulated IoT sensor readings. Best for Regression or Anomaly Detection.' },
  linnerud: { type: 'warn', msg: 'Very small dataset (20 rows). Results may be unstable — prefer low CV folds (3-fold).' },
  olivetti_pca: { type: 'warn', msg: 'Olivetti is an image dataset. Correlation is skipped. Use with Clustering/PCA.' },
};

function onBuiltinChange(sel) {
  const val = sel.value;
  showDatasetNote(val);
}

function showDatasetNote(datasetKey) {
  const noteEl = document.getElementById('dataset-info-note');
  if (!noteEl) return;
  const note = DATASET_NOTES[datasetKey];
  if (note) {
    noteEl.textContent = note.msg;
    noteEl.className = 'dataset-info-note' + (note.type === 'info' ? ' info' : '');
    noteEl.style.display = 'block';
  } else {
    noteEl.style.display = 'none';
  }
}

function setupUpload() {
  const zone = document.getElementById('upload-zone');
  const inp  = document.getElementById('file-input');
  
  // Hide upload zone for demo users
  if (S.isDemo) {
    zone.style.display = 'none';
    const note = document.getElementById('dataset-info-note');
    note.style.display = 'block';
    note.innerHTML = '<div style="background:rgba(0,212,255,.1);border:1px solid rgba(0,212,255,.3);border-radius:6px;padding:8px;font-size:11px;color:var(--accent);margin-top:8px;text-align:center">Demo Mode: Only built-in datasets available. <a href="/login" style="color:var(--primary);text-decoration:underline">Sign up</a> for full access.</div>';
    return;
  }
  
  inp.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  document.getElementById('builtin-sel').addEventListener('change', async e => {
    if (!e.target.value) return;
    const label = e.target.options[e.target.selectedIndex].text;
    showDatasetNote(e.target.value);
    showLoad('Loading dataset…', label);
    try {
      const d = await api('POST', '/api/dataset/builtin', { name: e.target.value });
      hideLoad();
      if (d.ok) {
        onDataLoaded(d, label);
      } else {
        toast(d.msg || 'Failed to load dataset', 'error');
        e.target.value = '';
      }
    } catch (err) {
      hideLoad();
      toast('Network error loading dataset: ' + err.message, 'error');
      e.target.value = '';
    }
  });
}

async function handleFile(file) {
  if (file.size > 50 * 1024 * 1024) { toast('File exceeds 50 MB limit', 'error'); return; }
  showLoad('Uploading & processing…', file.name);
  const content = await new Promise((res, rej) => {
    const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsDataURL(file);
  });
  const d = await api('POST', '/api/dataset/upload', { content, filename: file.name });
  hideLoad();
  d.ok ? onDataLoaded(d, file.name) : toast(d.msg || 'Upload failed', 'error');
}

function onDataLoaded(d, label) {
  S.dataset = d;
  S.cols    = d.columns || [];
  S.numCols = d.summary?.numeric_cols || S.cols;
  toast(`Loaded "${d.name}" — ${d.summary.rows.toLocaleString()} × ${d.summary.cols} cols`, 'success');
  
  // Reset builtin selector after loading
  const builtinSel = document.getElementById('builtin-sel');
  if (builtinSel) builtinSel.value = '';
  
  setStep(2);
  document.getElementById('h-dsname').textContent = d.name;
  const meta = document.getElementById('h-dsmeta');
  meta.textContent = `${d.summary.rows.toLocaleString()} rows × ${d.summary.cols} cols`;
  meta.classList.remove('hidden');
  populateCols();
  renderOverview();
  renderPreprocessing();
  setStep(3);
  document.getElementById('run-btn').disabled = false;
  document.getElementById('welcome-block').style.display = 'none';
  document.getElementById('overview-block').classList.remove('hidden');
  document.getElementById('pp-empty').style.display = 'none';
  document.getElementById('pp-block').classList.remove('hidden');
  document.getElementById('ch-empty').style.display = 'none';
  document.getElementById('ch-block').classList.remove('hidden');
  document.getElementById('arena-empty').style.display = 'none';
  document.getElementById('arena-block').classList.remove('hidden');
  switchTab(document.querySelector('[data-tab="overview"]'));
  renderAutoCharts();
  // Build user viz data
  if (S.numCols.length >= 2) {
    const [c0, c1] = S.numCols;
    const c2 = S.numCols[2] || null;
    const prev = d.summary.preview || [];
    S.userVizData = prev.filter(r => r[c0] != null && r[c1] != null)
      .map(r => [parseFloat(r[c0]) || 0, parseFloat(r[c1]) || 0, c2 ? (parseFloat(r[c2]) || 0) : 0]);
  }
  const lw = d.warnings || [];
  const lwEl = document.getElementById('leak-warn');
  if (lw.length) { lwEl.innerHTML = lw.join('<br>'); lwEl.classList.remove('hidden'); }
  else lwEl.classList.add('hidden');
}

function populateCols() {
  const cols = S.cols;
  const opts = cols.map(c => `<option value="${c}">${c}</option>`).join('');
  document.getElementById('target-col').innerHTML = `<option value="">Select target…</option>${opts}`;
  // Update hidden select (for backward compat)
  document.getElementById('feat-cols').innerHTML = cols.map(c => `<option value="${c}" selected>${c}</option>`).join('');
  // Update checkbox list
  const wrap = document.getElementById('feat-checks-wrap');
  if (wrap) {
    wrap.innerHTML = cols.map(c => `
      <label style="display:flex;align-items:center;gap:7px;padding:3px 4px;border-radius:5px;cursor:pointer;font-size:12px;color:var(--text2)" class="feat-chk-row">
        <input type="checkbox" value="${String(c).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}" checked style="accent-color:var(--primary);width:13px;height:13px" onchange="syncFeatSelFromChecks()">
        <span>${String(c).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</span>
      </label>`).join('');
  }
  ['ch-x', 'ch-y', 'ch-z'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = (id === 'ch-z' ? '<option value="">None</option>' : '') + opts;
  });
  const ds = document.getElementById('dist-sel');
  if (ds) { ds.innerHTML = opts; renderDist(); }
}

// ── Algorithm dropdowns ───────────────────────────────────────────────────────
async function loadAlgos() {
  const d = await api('GET', '/api/ml/algorithms');
  if (d.ok) S.algos = d.algorithms;
}

function setupAlgoCascade() {
  document.getElementById('algo-cat').addEventListener('change', e => {
    const cat = e.target.value;
    const typeEl = document.getElementById('algo-type');
    const nameEl = document.getElementById('algo-name');
    typeEl.innerHTML = '<option value="">Select type…</option>';
    nameEl.innerHTML = '<option value="">Select algorithm…</option>';
    if (!cat || !S.algos[cat]) return;
    const types = Object.keys(S.algos[cat]);
    types.forEach(t => { const o = document.createElement('option'); o.value = o.textContent = t; typeEl.appendChild(o); });
    if (types.length === 1) { typeEl.value = types[0]; populateAlgoNames(cat, types[0]); }
    const needTarget = cat === 'SML' || cat === 'SSVML';
    document.getElementById('target-wrap').style.display = needTarget ? '' : 'none';
    ['pp-clusters','pp-dbscan','pp-components','pp-contamination'].forEach(id => document.getElementById(id).classList.remove('show'));
  });
  document.getElementById('algo-type').addEventListener('change', e => {
    populateAlgoNames(document.getElementById('algo-cat').value, e.target.value);
  });
  document.getElementById('algo-name').addEventListener('change', e => {
    updateParamPanels(e.target.value);
  });
}

function populateAlgoNames(cat, type) {
  const nameEl = document.getElementById('algo-name');
  nameEl.innerHTML = '<option value="">Select algorithm…</option>';
  (S.algos[cat]?.[type] || []).forEach(n => {
    const o = document.createElement('option'); o.value = o.textContent = n; nameEl.appendChild(o);
  });
}

function updateParamPanels(name) {
  const CLUSTER  = new Set(['K-Means','Hierarchical','Gaussian Mixture','Spectral Clustering','Mini-Batch K-Means','Birch','MeanShift','Affinity Propagation']);
  const DIM      = new Set(['PCA','t-SNE','Truncated SVD','UMAP','Kernel PCA','Factor Analysis','FastICA','NMF','ISOMAP','MDS']);
  const ANOMALY  = new Set(['Isolation Forest','Local Outlier Factor','One-Class SVM','Elliptic Envelope']);
  // Algorithms that support cross-validation (supervised only)
  const CV_ALGOS = new Set([
    'Logistic Regression','Decision Tree','Random Forest','KNN','Naive Bayes',
    'SVM (RBF)','SVM (Linear)','Gradient Boosting','AdaBoost','Extra Trees',
    'Linear Discriminant Analysis','Ridge Classifier','Bagging Classifier',
    'Passive Aggressive','SGD Classifier','XGBoost','LightGBM','MLP Classifier',
    'Linear Regression','Ridge','Lasso','ElasticNet','SVR','Huber','BayesianRidge',
    'ARD Regression','XGBoost Regressor','LightGBM Regressor','MLP Regressor',
    'Label Propagation','Label Spreading','Self-Training',
  ]);
  ['pp-clusters','pp-dbscan','pp-components','pp-contamination'].forEach(id => document.getElementById(id).classList.remove('show'));
  if (CLUSTER.has(name))   document.getElementById('pp-clusters').classList.add('show');
  else if (name==='DBSCAN'||name==='OPTICS') document.getElementById('pp-dbscan').classList.add('show');
  else if (DIM.has(name))  document.getElementById('pp-components').classList.add('show');
  else if (ANOMALY.has(name)) document.getElementById('pp-contamination').classList.add('show');
  // Show/hide CV folds
  const cvWrap = document.getElementById('cv-folds-wrap');
  if (cvWrap) cvWrap.style.display = CV_ALGOS.has(name) ? '' : 'none';
}

function updateSplitLabel() {
  const slider = document.getElementById('train-ratio');
  const v = parseInt(slider?.value || 80);
  const trainPct = document.getElementById('train-pct'); if(trainPct) trainPct.textContent = v;
  const testPct = document.getElementById('test-pct'); if(testPct) testPct.textContent = 100 - v;
  const info = document.getElementById('split-info'); if(info) info.textContent = `${v}% training / ${100-v}% testing`;
  // Update slider gradient to show split visually
  if (slider) {
    const pct = ((v - 10) / (95 - 10)) * 100;
    slider.style.background = `linear-gradient(90deg, var(--primary) 0%, var(--primary) ${pct}%, var(--bg3) ${pct}%, var(--bg3) 100%)`;
  }
}

// ── Feature column helpers ────────────────────────────────────────────────────
function getSelectedFeats() {
  const checks = document.querySelectorAll('#feat-checks-wrap input[type="checkbox"]:checked');
  if (checks.length) return Array.from(checks).map(c => c.value);
  // Fallback to select
  return Array.from(document.getElementById('feat-cols').selectedOptions).map(o => o.value);
}
function syncFeatSelFromChecks() {
  // Sync hidden select to match checkboxes
  const sel = document.getElementById('feat-cols');
  const checked = new Set(Array.from(document.querySelectorAll('#feat-checks-wrap input[type="checkbox"]:checked')).map(c=>c.value));
  Array.from(sel.options).forEach(o => { o.selected = checked.has(o.value); });
}
function selectAllFeats() {
  document.querySelectorAll('#feat-checks-wrap input[type="checkbox"]').forEach(c => c.checked = true);
  syncFeatSelFromChecks();
}
function selectNoneFeats() {
  document.querySelectorAll('#feat-checks-wrap input[type="checkbox"]').forEach(c => c.checked = false);
  syncFeatSelFromChecks();
}

// ── Run pipeline ──────────────────────────────────────────────────────────────
async function runPipeline() {
  const cat    = document.getElementById('algo-cat').value;
  const atype  = document.getElementById('algo-type').value;
  const aname  = document.getElementById('algo-name').value;
  const target = document.getElementById('target-col').value;
  const feats  = getSelectedFeats();
  const trainR = parseInt(document.getElementById('train-ratio').value) / 100;
  const cvF    = parseInt(document.getElementById('cv-folds').value);
  const k      = parseInt(document.getElementById('n-clusters').value) || 3;
  const eps    = parseFloat(document.getElementById('dbscan-eps').value) || 0.5;
  const minPts = parseInt(document.getElementById('dbscan-min').value) || 5;
  const nc     = parseInt(document.getElementById('n-components').value) || 2;
  const cont   = parseFloat(document.getElementById('contamination').value) || 0.1;

  if (!cat || !aname) { toast('Select a category and algorithm', 'warning'); return; }
  if ((cat === 'SML' || cat === 'SSVML') && !target) { toast('Select a target column', 'warning'); return; }

  setStep(4);
  showLoad(`Training ${aname}…`, `${(trainR*100).toFixed(0)}% train / ${((1-trainR)*100).toFixed(0)}% test`);

  const d = await api('POST', '/api/ml/run', {
    algo_category: cat, algo_type: atype, algo_name: aname,
    target_col: target || null, feature_cols: feats.length ? feats : null,
    n_clusters: k, train_ratio: trainR, cv_folds: cvF,
    eps, min_samples: minPts, n_components: nc, contamination: cont,
  });
  hideLoad();

  if (!d.ok) { toast(d.msg || 'Pipeline failed', 'error'); setStep(3); return; }
  S.result = d;
  toast(`${aname} completed!`, 'success');
  setStep(5);

  const badge = document.getElementById('h-algo-badge');
  badge.innerHTML = `<span class="badge b-purple">${aname}</span>`;
  badge.classList.remove('hidden');

  renderResults(d);
  buildWhatIf(d);
  document.getElementById('res-empty').style.display = 'none';
  document.getElementById('res-block').classList.remove('hidden');
  switchTab(document.querySelector('[data-tab="results"]'));
  loadMeEnhanced();
  loadHistory();
}

// ── Overview rendering ────────────────────────────────────────────────────────
function renderOverview() {
  const s = S.dataset.summary;
  animVal('m-rows', s.rows);
  animVal('m-cols', s.cols);
  animVal('m-miss', Object.values(s.missing || {}).reduce((a, b) => a + (b || 0), 0));
  animVal('m-num', (s.numeric_cols || []).length);
  const q = S.dataset.quality;
  if (q) {
    const el = document.getElementById('m-qual');
    el.textContent = q.score;
    el.className = 'val ' + (q.score >= 80 ? 'text-s' : q.score >= 60 ? 'text-w' : 'text-d');
  }
  document.getElementById('prev-badge').textContent = `${Math.min(s.rows, 100)} of ${s.rows.toLocaleString()} rows`;
  const prev = s.preview || [];
  if (prev.length) {
    const cols = Object.keys(prev[0]);
    let h = `<table><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>`;
    prev.slice(0, 25).forEach(row => { h += `<tr>${cols.map(c => `<td>${row[c] ?? ''}</td>`).join('')}</tr>`; });
    document.getElementById('prev-table').innerHTML = h + '</tbody></table>';
  }
  const dt = s.dtypes || {}, ms = s.missing || {};
  let h2 = `<table><thead><tr><th>Column</th><th>Type</th><th>Missing</th></tr></thead><tbody>`;
  Object.entries(dt).forEach(([c, t]) => {
    const bc = t.includes('float') || t.includes('int') ? 'b-blue' : t === 'object' ? 'b-yellow' : 'b-green';
    h2 += `<tr><td>${c}</td><td><span class="badge ${bc}">${t}</span></td><td>${ms[c] > 0 ? `<span style="color:var(--warning)">${ms[c]}</span>` : 0}</td></tr>`;
  });
  document.getElementById('col-table').innerHTML = h2 + '</tbody></table>';
  renderCorr();
  renderDist();
}

function animVal(id, to) {
  const el = document.getElementById(id); if (!el) return;
  const start = performance.now();
  const upd = ts => {
    const p = Math.min((ts - start) / 500, 1), e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(to * e).toLocaleString();
    if (p < 1) requestAnimationFrame(upd);
  };
  requestAnimationFrame(upd);
}

function renderCorr() {
  const corr = S.dataset.analysis?.correlation;
  if (!corr?.columns) return;
  Plotly.newPlot('corr-chart', [{
    type: 'heatmap', z: corr.values, x: corr.columns, y: corr.columns,
    colorscale: 'RdBu', zmid: 0,
    text: corr.values.map(r => r.map(v => v.toFixed(2))),
    texttemplate: '%{text}', textfont: { size: 9 },
    hovertemplate: '%{y} vs %{x}: %{z:.3f}<extra></extra>'
  }], plo('', 300), { responsive: true, displayModeBar: false });
}

function renderDist() {
  const col = document.getElementById('dist-sel')?.value;
  const d   = S.dataset?.analysis?.distributions?.[col];
  if (!d) return;
  Plotly.newPlot('dist-chart', [{ type: 'bar', x: d.hist_x, y: d.hist_y, marker: { color: '#7c5cfc', opacity: .88 } }],
    { ...plo(`Distribution: ${col}`, 268),
      shapes: [
        { type: 'line', x0: d.mean, x1: d.mean, y0: 0, y1: Math.max(...d.hist_y), line: { color: '#ffb700', dash: 'dash', width: 2 } },
        { type: 'line', x0: d.median, x1: d.median, y0: 0, y1: Math.max(...d.hist_y), line: { color: '#00e5a0', dash: 'dot', width: 2 } },
      ]
    }, { responsive: true, displayModeBar: false });
}

// ── Preprocessing ─────────────────────────────────────────────────────────────
function renderPreprocessing() {
  const d = S.dataset;
  const report = d.report || [];
  document.getElementById('pp-report').innerHTML = report.length
    ? report.map(r => `<div class="pp-report-item"><div class="pp-badge" style="background:rgba(124,92,252,.15);color:var(--primary)">OK</div><div style="font-size:12px;color:var(--text2)">${r}</div></div>`).join('')
    : '<div style="color:var(--muted);font-size:12px">No preprocessing steps applied.</div>';
  const q = d.quality;
  if (q) {
    document.getElementById('pp-quality').innerHTML = `
      <div style="display:flex;align-items:center;gap:16px">
        <div style="text-align:center">
          <div style="font-size:32px;font-weight:800;color:${q.score>=80?'var(--success)':q.score>=60?'var(--warning)':'var(--danger)'}">${q.score}</div>
          <div style="font-size:10px;color:var(--muted)">/ 100</div>
        </div>
        <div style="flex:1">${[['Completeness',q.completeness],['Uniqueness',q.uniqueness],['Cardinality',q.cardinality]].map(([l,v])=>`
          <div class="dq-row"><span class="dq-lbl">${l}</span>
            <div style="flex:1;height:6px;background:var(--bg3);border-radius:3px;overflow:hidden"><div style="height:100%;width:${v||0}%;background:${(v||0)>=80?'var(--success)':(v||0)>=60?'var(--warning)':'var(--danger)'};border-radius:3px"></div></div>
            <span class="dq-val">${v||0}%</span></div>`).join('')}
        </div>
      </div>`;
  }
  const schema = d.schema || {};
  let sh = `<table><thead><tr><th>Column</th><th>Detected Type</th></tr></thead><tbody>`;
  Object.entries(schema).forEach(([c, t]) => {
    const b = t === 'numeric' ? 'b-blue' : t === 'datetime' ? 'b-green' : 'b-yellow';
    sh += `<tr><td>${c}</td><td><span class="badge ${b}">${t}</span></td></tr>`;
  });
  document.getElementById('pp-schema').innerHTML = sh + '</tbody></table>';
  const out = d.analysis?.outliers || {};
  const oc  = Object.entries(out).filter(([, v]) => v > 0);
  if (oc.length) {
    Plotly.newPlot('pp-outlier', [{ type: 'bar', x: oc.map(x => x[0]), y: oc.map(x => x[1]), marker: { color: '#ff4d6d', opacity: .88 } }],
      plo('Outlier Counts (|Z|>3)', 210), { responsive: true, displayModeBar: false });
  } else document.getElementById('pp-outlier').innerHTML = '<div class="empty">No significant outliers</div>';
  const mp = d.summary?.missing_pct || {};
  const mc = Object.entries(mp);
  if (mc.some(([, v]) => v > 0)) {
    Plotly.newPlot('pp-missing', [{
      type: 'bar', x: mc.map(x => x[0]), y: mc.map(x => x[1]),
      text: mc.map(x => `${x[1]}%`), textposition: 'outside',
      marker: { color: mc.map(([, v]) => v > 20 ? '#ff4d6d' : v > 5 ? '#ffb700' : '#7c5cfc'), opacity: .88 }
    }], plo('Missing Values %', 190), { responsive: true, displayModeBar: false });
  } else document.getElementById('pp-missing').innerHTML = '<div class="empty">No missing values</div>';
}

// ── Results ───────────────────────────────────────────────────────────────────
function renderResults(d) {
  const mEl = document.getElementById('res-metrics');
  mEl.innerHTML = '';
  function addM(label, val, cls = '') {
    const c = document.createElement('div');
    c.className = `mc ${cls}`;
    c.innerHTML = `<div class="lbl">${label}</div><div class="val">${val}</div>`;
    mEl.appendChild(c);
  }
  // Overfitting
  const ov = d.overfit;
  if (ov) {
    const cls = ov.level === 'severe' ? 'overfit-severe' : ov.level === 'moderate' ? 'overfit-moderate' : ov.level === 'underfitting' ? 'overfit-underfitting' : 'overfit-none';
    let html = `<div class="overfit-box ${cls}"><div class="overfit-title">
      ${ov.level === 'none' ? 'No Significant Overfitting' : ov.level === 'underfitting' ? 'Underfitting Detected' : `${ov.level === 'severe' ? 'Severe' : 'Moderate'} Overfitting (gap: ${(ov.gap * 100).toFixed(1)}%)`}
    </div>`;
    (ov.diagnoses || []).forEach(x => { html += `<div class="overfit-item">• ${x}</div>`; });
    if (ov.suggestions?.length) {
      html += '<div style="margin-top:8px"><strong style="font-size:11px">Suggestions:</strong><ul style="padding-left:16px;margin-top:4px">';
      ov.suggestions.forEach(s => { html += `<li style="font-size:11px;line-height:1.8;color:var(--muted)">${s}</li>`; });
      html += '</ul></div>';
    }
    html += '</div>';
    document.getElementById('overfit-box').innerHTML = html;
  } else document.getElementById('overfit-box').innerHTML = '';

  // CV
  const cv = d.cv;
  if (cv) {
    let cvHtml = `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="font-size:11px;font-weight:800;color:var(--text2);margin-bottom:10px">${cv.cv_folds || 5}-Fold Cross-Validation</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px">`;
    if (cv.cv_accuracy) {
      [['Accuracy', cv.cv_accuracy], ['Precision', cv.cv_precision], ['Recall', cv.cv_recall], ['F1', cv.cv_f1]].forEach(([l, m]) => {
        if (!m) return;
        cvHtml += `<div style="background:var(--bg3);border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">${l}</div>
          <div style="font-size:18px;font-weight:800;color:var(--primary)">${(m.mean * 100).toFixed(1)}%</div>
          <div style="font-size:10px;color:var(--muted)">±${(m.std * 100).toFixed(1)}%</div></div>`;
      });
    } else if (cv.cv_r2) {
      [['R²', cv.cv_r2], ['MAE', cv.cv_mae], ['MSE', cv.cv_mse]].forEach(([l, m]) => {
        if (!m) return;
        cvHtml += `<div style="background:var(--bg3);border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">${l}</div>
          <div style="font-size:18px;font-weight:800;color:var(--primary)">${m.mean.toFixed(4)}</div>
          <div style="font-size:10px;color:var(--muted)">±${m.std.toFixed(4)}</div></div>`;
      });
    }
    cvHtml += '</div></div>';
    document.getElementById('cv-block').innerHTML = cvHtml;
    document.getElementById('cv-block').classList.remove('hidden');
  } else document.getElementById('cv-block').classList.add('hidden');

  const cat = d.algo_category;
  if (cat === 'SML') {
    if (d.algo_type === 'Classification') {
      addM('Accuracy', `${(d.accuracy * 100).toFixed(2)}%`, '');
      addM('Precision', `${(d.precision * 100).toFixed(2)}%`, 'c-blue');
      addM('Recall', `${(d.recall * 100).toFixed(2)}%`, 'c-green');
      addM('F1 Score', `${(d.f1 * 100).toFixed(2)}%`, 'c-pink');
      addM('Train Size', String(d.train_size || '—'), 'c-blue');
      addM('Test Size',  String(d.test_size  || '—'));
      document.getElementById('cm-title').textContent = 'Confusion Matrix';
      if (d.confusion_matrix) renderConfMatrix(d.confusion_matrix, d.classes || []);
    } else {
      addM('R² Score', d.r2?.toFixed(4) || '—', '');
      addM('MAE',  d.mae?.toFixed(4)  || '—', 'c-blue');
      addM('MSE',  d.mse?.toFixed(4)  || '—', 'c-yellow');
      addM('RMSE', d.rmse?.toFixed(4) || '—', 'c-green');
      if (d.mape != null) addM('MAPE %', d.mape?.toFixed(2) + '%', 'c-pink');
      document.getElementById('cm-title').textContent = 'Actual vs Predicted';
      if (d.predictions?.length) {
        const act = d.predictions.map(p => p.actual), pred = d.predictions.map(p => p.predicted);
        const mn = Math.min(...act, ...pred), mx = Math.max(...act, ...pred);
        Plotly.newPlot('cm-chart', [
          { type: 'scatter', mode: 'markers', x: act, y: pred, name: 'Predictions', marker: { color: '#7c5cfc', opacity: .65, size: 7, line: { color: '#a070ff', width: 1 } } },
          { type: 'scatter', mode: 'lines', x: [mn, mx], y: [mn, mx], name: 'Ideal', line: { color: '#ff4d6d', dash: 'dash', width: 2 } },
        ], { ...plo('Actual vs Predicted', 340), ...axLabel('Actual', 'Predicted') }, { responsive: true, displayModeBar: false });
      }
    }
  } else if (cat === 'UNSML') {
    addM('Clusters', String(d.n_clusters ?? d.n_anomalies ?? '—'));
    if (d.inertia    != null) addM('Inertia', d.inertia.toFixed(2), 'c-blue');
    if (d.silhouette != null) addM('Silhouette', d.silhouette.toFixed(3), 'c-green');
    if (d.explained_variance) addM('Var Explained', d.explained_variance.map(v => (v * 100).toFixed(1) + '%').join(' / '), 'c-pink');
    if (d.n_anomalies != null) addM('Anomalies', String(d.n_anomalies), 'c-red');
    document.getElementById('cm-title').textContent = 'Cluster / Projection Plot';
    const coords = d.pca_coords || d.coords || d.components;
    if (coords?.length) {
      const labels = d.labels || Array(coords.length).fill(0);
      const ul = [...new Set(labels)];
      const colors = ['#7c5cfc', '#00e5a0', '#ffb700', '#ff4d6d', '#00d4ff', '#e040fb', '#ffd700', '#84cc16'];
      Plotly.newPlot('cm-chart', ul.map((l, li) => {
        const pts = coords.filter((_, i) => labels[i] === l);
        return { type: 'scatter', mode: 'markers', name: l === -1 ? 'Noise' : `Cluster ${l}`,
          x: pts.map(p => p[0]), y: pts.map(p => p[1] || 0),
          marker: { color: l === -1 ? '#6b7280' : colors[li % colors.length], opacity: .72, size: 7, line: { color: '#fff', width: .5 } } };
      }), { ...plo('Cluster Plot (PCA 2D)', 340), ...axLabel('PC1', 'PC2') }, { responsive: true, displayModeBar: false });
    }
    if (d.elbow_data) {
      document.getElementById('fi-title').textContent = 'Elbow Chart';
      Plotly.newPlot('fi-chart', [{ type: 'scatter', mode: 'lines+markers', x: d.elbow_data.map(e => e.k), y: d.elbow_data.map(e => e.inertia), line: { color: '#7c5cfc', width: 2 }, marker: { size: 7, color: '#00d4ff' } }],
        { ...plo('Inertia vs K', 340), ...axLabel('K', 'Inertia') }, { responsive: true, displayModeBar: false });
      return;
    }
  } else if (cat === 'RL') {
    addM('Max Reward',   Math.max(...(d.rewards || [0])).toFixed(2), 'c-green');
    addM('Final Reward', d.rewards?.slice(-1)[0]?.toFixed(2) || '—');
    addM('Episodes',     String(d.rewards?.length || 0), 'c-blue');
    document.getElementById('cm-title').textContent = 'Reward Curve';
    if (d.rewards?.length) {
      const sm = d.rewards.map((v, i, a) => { const sl = a.slice(Math.max(0, i - 20), i + 1); return sl.reduce((x, y) => x + y, 0) / sl.length; });
      Plotly.newPlot('cm-chart', [
        { type: 'scatter', mode: 'lines', y: d.rewards, name: 'Raw', line: { color: '#a8b8d8', width: 1 }, opacity: .5 },
        { type: 'scatter', mode: 'lines', y: sm, name: 'Smoothed', line: { color: '#7c5cfc', width: 2.5 } },
      ], { ...plo('Reward Curve', 340), ...axLabel('Episode', 'Total Reward') }, { responsive: true, displayModeBar: false });
    }
  } else if (cat === 'SSVML') {
    addM('Accuracy', `${(d.accuracy * 100).toFixed(2)}%`);
    addM('Labeled',   String(d.labeled || '—'), 'c-green');
    addM('Unlabeled', String(d.unlabeled || '—'), 'c-blue');
  } else if (cat === 'DL') {
    if (d.accuracy)  addM('Accuracy', `${(d.accuracy * 100).toFixed(2)}%`);
    if (d.loss    != null) addM('Loss',  d.loss.toFixed(4), 'c-red');
    if (d.val_loss != null) addM('Val Loss', d.val_loss.toFixed(4), 'c-yellow');
    if (d.epochs)  addM('Epochs', String(d.epochs), 'c-blue');
  }

  // Feature importance
  if (d.feature_importance && Object.keys(d.feature_importance).length) {
    document.getElementById('fi-title').textContent = 'Feature Importance';
    const items = Object.entries(d.feature_importance).sort((a, b) => b[1] - a[1]).slice(0, 20);
    Plotly.newPlot('fi-chart', [{ type: 'bar', orientation: 'h', x: items.map(i => i[1]), y: items.map(i => i[0]),
      marker: { color: items.map((_, i) => `hsl(${260 + i * 8},70%,${68 - i * 1.5}%)`) } }],
      { ...plo('', 340), yaxis: { autorange: 'reversed', color: 'var(--text2)', gridcolor: 'var(--border)' } },
      { responsive: true, displayModeBar: false });
  } else if (!d.elbow_data) {
    document.getElementById('fi-chart').innerHTML = '<div class="empty">No feature importance for this algorithm.</div>';
  }

  // Predictions table
  if (d.predictions?.length) {
    const rows = d.predictions.slice(0, 100);
    const keys = Object.keys(rows[0]);
    let ht = `<table><thead><tr>${keys.map(k => `<th>${k}</th>`).join('')}</tr></thead><tbody>`;
    rows.forEach(r => {
      const match = String(r.actual) === String(r.predicted);
      ht += `<tr class="${match ? 'tr-right' : 'tr-wrong'}">${keys.map(k => `<td>${typeof r[k] === 'number' ? r[k].toFixed(4) : r[k]}</td>`).join('')}</tr>`;
    });
    document.getElementById('pred-table').innerHTML = ht + '</tbody></table>';
    document.getElementById('pred-badge').textContent = `${Math.min(d.predictions.length, 100)} of ${d.predictions.length}`;
  }
}

function renderConfMatrix(cm, classes) {
  Plotly.newPlot('cm-chart', [{
    type: 'heatmap', z: cm, x: classes, y: classes,
    colorscale: [[0, '#0c1220'], [0.5, '#4a20c8'], [1, '#b09cff']], showscale: false,
    text: cm.map(r => r.map(String)), texttemplate: '<b>%{text}</b>', textfont: { size: 16, color: '#fff' },
    hovertemplate: 'Actual:%{y}<br>Pred:%{x}<br>Count:%{z}<extra></extra>'
  }], { ...plo('', 340), yaxis: { autorange: 'reversed', color: 'var(--text2)' }, xaxis: { color: 'var(--text2)' } },
    { responsive: true, displayModeBar: false });
}

// ── Charts builder ────────────────────────────────────────────────────────────
function onChartTypeChange() {
  const t = document.getElementById('ch-type').value;
  const noX = ['heatmap', 'pairs', 'parallel', 'sunburst'];
  const noY = ['histogram', 'pie', 'heatmap', 'pairs', 'parallel', 'funnel', 'radar', 'sunburst'];
  document.getElementById('cx-wrap').style.display = noX.includes(t) ? 'none' : '';
  document.getElementById('cy-wrap').style.display = noY.includes(t) ? 'none' : '';
}

function renderChart() {
  if (!S.dataset) { toast('No dataset loaded', 'warning'); return; }
  const type = document.getElementById('ch-type').value;
  const x  = document.getElementById('ch-x').value;
  const y  = document.getElementById('ch-y').value;
  const zc = document.getElementById('ch-z').value;
  const prev = S.dataset.summary?.preview || [];
  if (!prev.length) return;
  const xs = prev.map(r => r[x]), ys = prev.map(r => r[y]);
  // Detect if axis values are strings or numbers
  const xIsNum = xs.every(v => v == null || !isNaN(parseFloat(v)));
  const yIsNum = ys.every(v => v == null || !isNaN(parseFloat(v)));
  let traces = [], layout = plo('', 470);

  const PALETTE = ['#7c5cfc', '#00e5a0', '#ffb700', '#ff4d6d', '#00d4ff', '#e040fb', '#ffd700', '#84cc16'];

  if (type === 'scatter') {
    traces = [{ type: 'scatter', mode: 'markers', x: xs, y: ys,
      marker: { color: zc ? prev.map(r => r[zc]) : '#7c5cfc', colorscale: zc ? 'Viridis' : null,
        opacity: .72, size: 8, line: { color: '#ffffff30', width: .5 } } }];
    layout = { ...layout, ...axLabel(x, y) };
    if (!xIsNum) layout.xaxis = { ...layout.xaxis, type: 'category' };
    if (!yIsNum) layout.yaxis = { ...layout.yaxis, type: 'category' };
  } else if (type === 'bar') {
    const cnt = {}; xs.forEach((v, i) => { cnt[v] = cnt[v] || { s: 0, n: 0 }; cnt[v].s += parseFloat(ys[i]) || 0; cnt[v].n++; });
    const bk = Object.keys(cnt), bv = bk.map(k => cnt[k].s / cnt[k].n);
    traces = [{ type: 'bar', x: bk, y: bv, marker: { color: PALETTE[0], opacity: .88 } }];
    if (!xIsNum) layout.xaxis = { ...layout.xaxis, type: 'category' };
  } else if (type === 'line') {
    const s2 = [...prev].sort((a, b) => (parseFloat(a[x]) || 0) - (parseFloat(b[x]) || 0));
    traces = [{ type: 'scatter', mode: 'lines+markers', x: s2.map(r => r[x]), y: s2.map(r => r[y]),
      line: { color: '#7c5cfc', width: 2 }, marker: { color: '#00d4ff', size: 6 } }];
    layout = { ...layout, ...axLabel(x, y) };
  } else if (type === 'histogram') {
    traces = [{ type: 'histogram', x: xs, nbinsx: 30, marker: { color: '#7c5cfc', opacity: .88 } }];
    if (!xIsNum) layout.xaxis = { ...layout.xaxis, type: 'category' };
  } else if (type === 'box') {
    traces = S.numCols.slice(0, 8).map((c, i) => ({ type: 'box', y: prev.map(r => r[c]), name: c, marker: { color: PALETTE[i % 8] } }));
  } else if (type === 'pie') {
    const cnt2 = {}; xs.forEach(v => { cnt2[String(v)] = (cnt2[String(v)] || 0) + 1; });
    traces = [{ type: 'pie', labels: Object.keys(cnt2), values: Object.values(cnt2), hole: .3, marker: { colors: PALETTE } }];
  } else if (type === 'heatmap') {
    const corr = S.dataset.analysis?.correlation;
    if (corr) traces = [{ type: 'heatmap', z: corr.values, x: corr.columns, y: corr.columns, colorscale: 'RdBu', zmid: 0,
      text: corr.values.map(r => r.map(v => v.toFixed(2))), texttemplate: '%{text}' }];
  } else if (type === 'scatter3d') {
    traces = [{ type: 'scatter3d', mode: 'markers', x: xs, y: ys, z: prev.map(r => r[zc]),
      marker: { color: zc ? prev.map(r => r[zc]) : '#7c5cfc', colorscale: 'Viridis', opacity: .72, size: 4 } }];
    layout.scene = { xaxis: { title: x, color: 'var(--text2)' }, yaxis: { title: y, color: 'var(--text2)' }, zaxis: { title: zc, color: 'var(--text2)' }, bgcolor: 'rgba(0,0,0,0)' };
  } else if (type === 'bubble') {
    traces = [{ type: 'scatter', mode: 'markers', x: xs, y: ys,
      marker: { size: prev.map(r => Math.max(6, Math.min(45, Math.abs(parseFloat(r[zc]) || 1) * 2))),
        color: PALETTE[0], opacity: .7, line: { color: '#a070ff', width: 1 } } }];
  } else if (type === 'violin') {
    traces = S.numCols.slice(0, 5).map((c, i) => ({ type: 'violin', y: prev.map(r => r[c]), name: c,
      box: { visible: true }, meanline: { visible: true }, fillcolor: PALETTE[i], opacity: .75, line: { color: 'white', width: .5 } }));
  } else if (type === 'pairs') {
    // SPLOM has browser compatibility issues - use overlaid scatter plots instead
    const cols2use = S.numCols.slice(0, 4);
    if (cols2use.length >= 2) {
      traces = cols2use.slice(1).map((c, i) => ({
        type: 'scatter', mode: 'markers',
        x: prev.map(r => r[cols2use[0]]),
        y: prev.map(r => r[c]),
        name: `${cols2use[0]} vs ${c}`,
        marker: { color: PALETTE[i % PALETTE.length], opacity: .6, size: 5 }
      }));
      layout = { ...layout, ...axLabel(cols2use[0], 'Values'), showlegend: true };
    } else { toast('Need at least 2 numeric columns', 'warning'); return; }
  } else if (type === 'area') {
    const s2 = [...prev].sort((a, b) => (parseFloat(a[x]) || 0) - (parseFloat(b[x]) || 0));
    traces = [{ type: 'scatter', mode: 'lines', fill: 'tozeroy', x: s2.map(r => r[x]), y: s2.map(r => r[y]),
      line: { color: '#7c5cfc', width: 2 }, fillcolor: 'rgba(124,92,252,.18)' }];
  } else if (type === 'funnel') {
    const cnt3 = {}; xs.forEach(v => { cnt3[String(v)] = (cnt3[String(v)] || 0) + 1; });
    const sorted = Object.entries(cnt3).sort((a, b) => b[1] - a[1]).slice(0, 12);
    traces = [{ type: 'funnel', y: sorted.map(e => e[0]), x: sorted.map(e => e[1]), marker: { color: PALETTE } }];
  } else if (type === 'waterfall') {
    traces = [{ type: 'waterfall', x: xs.slice(0, 20), y: ys.slice(0, 20), connector: { line: { color: 'var(--border)' } },
      increasing: { marker: { color: '#00e5a0' } }, decreasing: { marker: { color: '#ff4d6d' } }, totals: { marker: { color: '#7c5cfc' } } }];
  } else if (type === 'radar') {
    const nc6 = S.numCols.slice(0, 6);
    const means = nc6.map(c => { const vs = prev.map(r => parseFloat(r[c]) || 0); return vs.reduce((a, b) => a + b, 0) / vs.length; });
    traces = [{ type: 'scatterpolar', r: [...means, means[0]], theta: [...nc6, nc6[0]], fill: 'toself', fillcolor: 'rgba(124,92,252,.2)', line: { color: '#7c5cfc' } }];
    layout.polar = { radialaxis: { visible: true, color: 'var(--text2)' } };
  } else if (type === 'strip') {
    traces = S.numCols.slice(0, 5).map((c, i) => ({ type: 'strip', y: prev.map(r => r[c]), name: c, marker: { color: PALETTE[i] } }));
  } else if (type === 'density') {
    traces = [{ type: 'histogram2dcontour', x: xs, y: ys, colorscale: 'Viridis', ncontours: 15 }];
  } else if (type === 'parallel') {
    const dims2 = S.numCols.slice(0, 8).map(c => ({ range: [Math.min(...prev.map(r => r[c])), Math.max(...prev.map(r => r[c]))], label: c, values: prev.map(r => r[c]) }));
    traces = [{ type: 'parcoords', dimensions: dims2, line: { color: '#7c5cfc', colorscale: 'Viridis' } }];
  } else if (type === 'ternary') {
    const [a, b, cc] = S.numCols;
    if (a && b && cc) {
      traces = [{ type: 'scatterternary', a: prev.map(r => parseFloat(r[a]) || 0), b: prev.map(r => parseFloat(r[b]) || 0), c: prev.map(r => parseFloat(r[cc]) || 0), mode: 'markers', marker: { color: '#7c5cfc', opacity: .7, size: 6 } }];
      layout.ternary = { aaxis: { title: a }, baxis: { title: b }, caxis: { title: cc } };
    }
  } else if (type === 'sunburst') {
    // Sunburst has WebGL issues on some browsers - use donut pie chart instead
    const catCols = S.cols.filter(c => !S.numCols.includes(c));
    const colToUse = catCols[0] || S.cols[0];
    if (colToUse) {
      const cnt4 = {};
      prev.forEach(r => { const k = String(r[colToUse]||'?'); cnt4[k] = (cnt4[k]||0)+1; });
      const sorted = Object.entries(cnt4).sort((a,b)=>b[1]-a[1]).slice(0,20);
      traces = [{ type: 'pie', labels: sorted.map(e=>e[0]), values: sorted.map(e=>e[1]),
        hole: .42, marker: { colors: PALETTE }, textinfo: 'label+percent',
        textfont: { color: '#eef2ff', size: 11 } }];
    } else { toast('No columns available for this chart', 'warning'); return; }
  }
  Plotly.newPlot('custom-chart', traces, layout, { responsive: true, displayModeBar: true });
}

function renderAutoCharts() {
  const grid = document.getElementById('auto-charts');
  if (!S.dataset || !grid) return;
  const s = S.dataset.summary, num = S.numCols.slice(0, 6), prev = s.preview || [];
  grid.innerHTML = '';
  const add = (id, title) => {
    const d = document.createElement('div'); d.className = 'card';
    d.innerHTML = `<div class="ch"><h3>${title}</h3></div><div class="cb"><div id="${id}" style="height:230px"></div></div>`;
    grid.appendChild(d);
  };
  const PALETTE = ['#7c5cfc', '#00e5a0', '#ffb700', '#ff4d6d', '#00d4ff', '#e040fb'];
  const delays = [];
  if (num[0]) { add('ac0', `Histogram: ${num[0]}`); delays.push([0, () => Plotly.newPlot('ac0', [{ type: 'histogram', x: prev.map(r => r[num[0]]), nbinsx: 25, marker: { color: '#7c5cfc', opacity: .88 } }], plo('', 220), { responsive: true, displayModeBar: false })]); }
  if (num[1]) { add('ac1', `${num[0]} vs ${num[1]}`); delays.push([60, () => Plotly.newPlot('ac1', [{ type: 'scatter', mode: 'markers', x: prev.map(r => r[num[0]]), y: prev.map(r => r[num[1]]), marker: { color: '#00e5a0', opacity: .65, size: 6, line: { color: '#ffffff30', width: .5 } } }], plo('', 220), { responsive: true, displayModeBar: false })]); }
  if (num.length >= 3) { add('ac2', 'Box Plot'); delays.push([120, () => Plotly.newPlot('ac2', num.slice(0, 4).map((c, i) => ({ type: 'box', y: prev.map(r => r[c]), name: c, marker: { color: PALETTE[i] } })), plo('', 220), { responsive: true, displayModeBar: false })]); }
  if (S.dataset.analysis?.correlation?.columns?.length >= 2) { add('ac3', 'Correlations'); delays.push([180, () => { const corr = S.dataset.analysis.correlation; Plotly.newPlot('ac3', [{ type: 'heatmap', z: corr.values, x: corr.columns, y: corr.columns, colorscale: 'RdBu', zmid: 0, text: corr.values.map(r => r.map(v => v.toFixed(2))), texttemplate: '%{text}', textfont: { size: 9 } }], plo('', 220), { responsive: true, displayModeBar: false }); }]); }
  if (S.dataset.analysis?.class_balance) { add('ac4', 'Class Balance'); delays.push([240, () => { const cb = S.dataset.analysis.class_balance; Plotly.newPlot('ac4', [{ type: 'bar', x: cb.labels, y: cb.counts, marker: { color: PALETTE } }], { ...plo('', 220), xaxis: { type: 'category', color: 'var(--text2)', gridcolor: 'var(--border)' } }, { responsive: true, displayModeBar: false }); }]); }
  if (num[1]) { add('ac5', 'Violin'); delays.push([300, () => Plotly.newPlot('ac5', num.slice(0, 4).map((c, i) => ({ type: 'violin', y: prev.map(r => r[c]), name: c, box: { visible: true }, meanline: { visible: true }, fillcolor: PALETTE[i], opacity: .75, line: { color: 'white', width: .5 } })), plo('', 220), { responsive: true, displayModeBar: false })]); }
  delays.forEach(([ms, fn]) => setTimeout(fn, ms));
}

// ── What-If (works for all model types) ──────────────────────────────────────
function buildWhatIf(d) {
  const feats = d.feature_cols || [];
  if (!feats.length) { document.getElementById('wi-empty').textContent = 'No feature columns detected.'; return; }
  const prev  = S.dataset?.summary?.preview || [];
  const stats = S.dataset?.summary?.stats || {};
  const fields = document.getElementById('wi-fields');
  fields.innerHTML = feats.map(f => {
    const mn   = stats[f]?.min  ?? 0;
    const mx   = stats[f]?.max  ?? 1;
    const mean = stats[f]?.mean ?? ((mn + mx) / 2);
    const step = Math.abs(mx - mn) / 100 || 0.01;
    // Check if column has categorical values
    const catVals = prev.length ? [...new Set(prev.map(r => r[f]).filter(v => v != null && isNaN(parseFloat(v))))] : [];
    if (catVals.length > 0 && catVals.length <= 20) {
      return `<div class="wi-field"><label>${f}</label>
        <select id="wif-${f}" style="width:100%">
          ${catVals.map(v => `<option value="${v}">${v}</option>`).join('')}
        </select></div>`;
    }
    return `<div class="wi-field"><label>${f}</label>
      <input type="number" id="wif-${f}" value="${mean.toFixed(4)}" step="${step.toFixed(4)}"></div>`;
  }).join('');
  const badge = document.getElementById('wi-model-badge');
  if (badge) badge.textContent = `${d.algo_name} (${d.algo_category})`;
  document.getElementById('wi-empty').style.display = 'none';
  document.getElementById('wi-block').classList.remove('hidden');
}

async function runWhatIf() {
  if (!S.result) { toast('Run a model first', 'warning'); return; }
  const feats  = S.result?.feature_cols || [];
  const values = {};
  feats.forEach(f => {
    const el = document.getElementById(`wif-${f}`);
    if (!el) return;
    values[f] = isNaN(parseFloat(el.value)) ? el.value : parseFloat(el.value);
  });
  showLoad('Predicting…', 'Running model on your values');
  const d = await api('POST', '/api/ml/whatif', { values });
  hideLoad();
  if (!d.ok) { toast(d.msg || 'Prediction failed', 'error'); return; }
  const resEl = document.getElementById('wi-result');
  let html = `<div class="wi-result"><div class="wi-pred">${d.prediction ?? d.cluster ?? d.label ?? '—'}</div>
    <div class="wi-conf">Model: ${S.result?.algo_name || '—'} · Category: ${S.result?.algo_category || '—'}</div>`;
  if (d.probabilities) {
    const entries = Object.entries(d.probabilities).sort((a, b) => b[1] - a[1]);
    html += `<div class="prob-bar-wrap">${entries.map(([cls, prob]) => `
      <div class="prob-bar-item"><span class="pbl">${cls}</span>
        <div class="pbr"><div class="pbf" style="width:${(prob * 100).toFixed(1)}%"></div></div>
        <span class="pbv">${(prob * 100).toFixed(1)}%</span></div>`).join('')}</div>`;
  }
  if (d.anomaly_score != null) html += `<div class="wi-conf">Anomaly Score: ${d.anomaly_score.toFixed(4)}</div>`;
  html += '</div>';
  resEl.innerHTML = html;
  resEl.classList.remove('hidden');
}

// ── Model Arena (all categories, top 10) ──────────────────────────────────────
async function runArena() {
  if (!S.dataset) { toast('Load a dataset first', 'warning'); return; }
  const target = document.getElementById('target-col').value;
  const feats  = getSelectedFeats();
  const btn    = document.getElementById('arena-btn');
  btn.disabled = true;
  document.getElementById('arena-progress').classList.remove('hidden');
  document.getElementById('arena-results').innerHTML = '';

  // Build full list from all categories
  const allTasks = [];
  for (const [cat, types] of Object.entries(S.algos)) {
    for (const [type, algos] of Object.entries(types)) {
      for (const algo of algos) {
        allTasks.push({ cat, type, algo });
      }
    }
  }

  const results = [];
  const total = allTasks.length;

  for (let i = 0; i < total; i++) {
    const { cat, type, algo } = allTasks[i];
    document.getElementById('arena-status').textContent = `Testing: ${algo} (${i + 1}/${total})`;
    document.getElementById('arena-pb').style.width = `${((i + 1) / total) * 100}%`;
    try {
      const d = await api('POST', '/api/ml/run', {
        algo_category: cat, algo_type: type, algo_name: algo,
        target_col: (cat === 'SML' || cat === 'SSVML') ? (target || null) : null,
        feature_cols: feats.length ? feats : null,
        train_ratio: 0.8, cv_folds: 3,
      });
      if (d.ok) {
        const score = d.accuracy ?? d.r2 ?? (d.silhouette || 0) ?? 0;
        const label = d.accuracy != null ? 'Accuracy' : d.r2 != null ? 'R²' : d.silhouette != null ? 'Silhouette' : 'Score';
        results.push({ name: algo, cat, type, score: typeof score === 'number' ? score : 0, label, d });
      }
    } catch (e) {}
  }

  // Rank top 10 by score
  results.sort((a, b) => b.score - a.score);
  const top10 = results.slice(0, 10);
  const maxScore = top10[0]?.score || 1;
  const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];
  function rankBadge(i) {
    const cls = i===0?'rank-1':i===1?'rank-2':i===2?'rank-3':'rank-other';
    return `<div class="arena-rank-badge ${cls}">${i<3?['1','2','3'][i]:ROMAN[i]}</div>`;
  }
  const CAT_BADGE = { SML: 'b-purple', UNSML: 'b-green', SSVML: 'b-teal', RL: 'b-yellow', DL: 'b-red' };

  let html = `<div style="font-size:11px;color:var(--muted);margin-bottom:10px">Ranked top 10 from ${results.length} algorithms tested across all categories</div>`;
  top10.forEach((r, i) => {
    const pct = Math.round((r.score / maxScore) * 100);
    html += `<div class="arena-row">
      ${rankBadge(i)}
      <div style="flex:0 0 190px"><div class="arena-name" style="font-size:13px;font-weight:700">${r.name}</div>
        <div><span class="badge ${CAT_BADGE[r.cat] || 'b-p'}" style="font-size:9px">${r.cat}</span> <span style="font-size:10px;color:var(--muted)">${r.type}</span></div></div>
      <div class="arena-bar-wrap"><div class="arena-bar" style="width:${pct}%"></div></div>
      <span class="arena-score">${(r.score * 100).toFixed(1)}${r.label === 'Accuracy' ? '%' : r.label === 'R²' ? '' : ''}</span>
    </div>`;
  });
  if (!top10.length) html = '<div class="empty">No results. Make sure a dataset is loaded and target column selected for supervised methods.</div>';
  document.getElementById('arena-results').innerHTML = html;
  document.getElementById('arena-progress').classList.add('hidden');
  btn.disabled = false;
  toast(`Arena complete — ${results.length} models evaluated, top 10 shown`, 'success');
}

// ── Visualizer ────────────────────────────────────────────────────────────────
const VIZ_ALGOS = [
  // Supervised Classification
  { name: 'Logistic Regression',    icon: 'chart-down',  cat: 'Supervised',    desc: 'Sigmoid decision boundary — probability output for binary/multi-class.' },
  { name: 'Decision Tree',          icon: 'tree',        cat: 'Supervised',    desc: 'Recursive feature splits using Gini impurity or entropy.' },
  { name: 'KNN',                    icon: 'search',      cat: 'Supervised',    desc: 'K-nearest neighbour voting — interactive query point placement.' },
  { name: 'Naive Bayes',            icon: 'dice',        cat: 'Supervised',    desc: 'Bayes theorem with conditional independence assumption.' },
  { name: 'SVM (RBF)',              icon: 'svm',         cat: 'Supervised',    desc: 'Maximum-margin hyperplane with radial basis kernel.' },
  { name: 'Perceptron',             icon: 'neuron',      cat: 'Supervised',    desc: 'Single-layer online learning — misclassification weight update.' },
  { name: 'Ridge Classifier',       icon: 'control',     cat: 'Supervised',    desc: 'Regularised linear classifier — L2 penalty on weights.' },
  // Supervised Regression
  { name: 'Linear Regression',      icon: 'line-chart',  cat: 'Supervised',    desc: 'Gradient-descent minimising MSE — watch the regression line fit.' },
  { name: 'Polynomial Regression',  icon: 'curve',       cat: 'Supervised',    desc: 'Non-linear regression via feature expansion.' },
  { name: 'Ridge / Lasso',          icon: 'control',     cat: 'Supervised',    desc: 'Regularisation shrinks coefficients — compare L1 vs L2.' },
  // Ensemble
  { name: 'Random Forest',          icon: 'forest',      cat: 'Ensemble',      desc: 'Bagging of decision trees — majority vote emerges.' },
  { name: 'AdaBoost',               icon: 'boost',       cat: 'Ensemble',      desc: 'Misclassified points gain weight — sequential boosting.' },
  { name: 'Gradient Boosting',      icon: 'chart',       cat: 'Ensemble',      desc: 'Residual-correcting sequential trees — watch ensemble improve.' },
  { name: 'XGBoost',                icon: 'lightning',   cat: 'Ensemble',      desc: 'Regularised gradient boosting with second-order derivatives.' },
  // Unsupervised Clustering
  { name: 'K-Means',                icon: 'cluster',     cat: 'Unsupervised',  desc: 'Iterative centroid assignment — Voronoi regions update live.' },
  { name: 'DBSCAN',                 icon: 'wave',        cat: 'Unsupervised',  desc: 'Density-reachability clusters — noise points auto-detected.' },
  { name: 'Hierarchical',           icon: 'tree',        cat: 'Unsupervised',  desc: 'Bottom-up agglomerative merging — watch dendrogram grow.' },
  { name: 'Gaussian Mixture',       icon: 'bubble',      cat: 'Unsupervised',  desc: 'EM algorithm fits overlapping Gaussian blobs.' },
  { name: 'OPTICS',                 icon: 'scope',       cat: 'Unsupervised',  desc: 'Density ordering for variable-density cluster detection.' },
  { name: 'Mean Shift',             icon: 'vortex',      cat: 'Unsupervised',  desc: 'Mode-seeking centroid drift toward density peaks.' },
  { name: 'Spectral Clustering',    icon: 'wave',        cat: 'Unsupervised',  desc: 'Graph Laplacian eigen-decomposition then K-Means.' },
  // Dimensionality Reduction
  { name: 'PCA',                    icon: 'scope',       cat: 'Dim. Reduction', desc: 'Principal components rotate to maximum-variance directions.' },
  { name: 't-SNE',                  icon: 'vortex',      cat: 'Dim. Reduction', desc: 'Neighbourhood-preserving non-linear 2D projection.' },
  { name: 'UMAP',                   icon: 'wave',        cat: 'Dim. Reduction', desc: 'Uniform manifold approximation — faster than t-SNE.' },
  { name: 'Kernel PCA',             icon: 'scope',       cat: 'Dim. Reduction', desc: 'Non-linear PCA via kernel trick mapping.' },
  { name: 'Factor Analysis',        icon: 'chart',       cat: 'Dim. Reduction', desc: 'Latent factor model for shared variance.' },
  { name: 'FastICA',                icon: 'wave',        cat: 'Dim. Reduction', desc: 'Independent component analysis — cocktail party problem.' },
  { name: 'NMF',                    icon: 'bubble',      cat: 'Dim. Reduction', desc: 'Non-negative matrix factorisation for parts-based representation.' },
  { name: 'Truncated SVD',          icon: 'scope',       cat: 'Dim. Reduction', desc: 'Low-rank SVD for sparse data (e.g., text TF-IDF).' },
  // Neural Networks / Deep Learning
  { name: 'Neural Network',         icon: 'brain',       cat: 'Deep Learning', desc: 'Multi-layer perceptron — forward/backward pass animated.' },
  { name: 'MLP Classifier',         icon: 'brain',       cat: 'Deep Learning', desc: 'Fully-connected classifier with ReLU activations.' },
  { name: 'MLP Regressor',          icon: 'brain',       cat: 'Deep Learning', desc: 'Fully-connected regression network.' },
  // Anomaly Detection
  { name: 'Isolation Forest',       icon: 'anomaly',     cat: 'Anomaly',       desc: 'Random partitioning isolates anomalies with fewer splits.' },
  { name: 'Local Outlier Factor',   icon: 'search',      cat: 'Anomaly',       desc: 'Local density deviation from k-nearest neighbours.' },
  { name: 'One-Class SVM',          icon: 'svm',         cat: 'Anomaly',       desc: 'Tight hypersphere boundary around normal data.' },
  { name: 'Elliptic Envelope',      icon: 'bubble',      cat: 'Anomaly',       desc: 'Gaussian covariance envelope — Mahalanobis outlier detection.' },
  // Optimization
  { name: 'Gradient Descent',       icon: 'gd',          cat: 'Optimization',  desc: 'Loss surface navigation — watch the ball find the minimum.' },
  { name: 'Stochastic GD',          icon: 'gd',          cat: 'Optimization',  desc: 'Noisy mini-batch updates vs. full-batch gradient descent.' },
  { name: 'Adam Optimizer',         icon: 'lightning',   cat: 'Optimization',  desc: 'Adaptive moment estimation — momentum + RMS step scaling.' },
  // Semi-supervised
  { name: 'Label Propagation',      icon: 'wave',        cat: 'Supervised',    desc: 'Graph-based label spreading to unlabelled points.' },
  { name: 'Label Spreading',        icon: 'wave',        cat: 'Supervised',    desc: 'Soft label propagation with regularisation parameter.' },
  { name: 'Self-Training',          icon: 'robot',       cat: 'Supervised',    desc: 'Confident pseudo-labels iteratively added to training set.' },
  // Reinforcement Learning
  { name: 'Q-Learning',             icon: 'robot',       cat: 'RL',            desc: 'Off-policy TD control — Q-table updates live in grid world.' },
  { name: 'SARSA',                  icon: 'robot',       cat: 'RL',            desc: 'On-policy TD control — agent updates while following policy.' },
  // Clustering extras
  { name: 'Birch',                  icon: 'tree',        cat: 'Unsupervised',  desc: 'CF-Tree incremental clustering — O(N), great for large data.' },
  { name: 'Mini-Batch K-Means',     icon: 'cluster',     cat: 'Unsupervised',  desc: 'Stochastic K-Means — fast batched centroid updates.' },
  // Association
  { name: 'Apriori',                icon: 'chart',       cat: 'Association',   desc: 'Frequent itemset mining — support / confidence / lift.' },
  { name: 'FP-Growth',              icon: 'tree',        cat: 'Association',   desc: 'Tree-based frequent patterns — faster than Apriori.' },
  // Misc supervised
  { name: 'Bayesian Ridge',         icon: 'dice',        cat: 'Supervised',    desc: 'Probabilistic ridge regression with automatic λ tuning.' },
  { name: 'Elastic Net',            icon: 'control',     cat: 'Supervised',    desc: 'L1 + L2 combined regularisation — feature selection + stability.' },
  { name: 'Gradient Descent (vis)', icon: 'gd',          cat: 'Optimization',  desc: 'Watch learning rate affect convergence speed.' },
];

const CAT_COLORS = {
  Supervised: 'b-purple', Ensemble: 'b-pink', Unsupervised: 'b-green',
  'Deep Learning': 'b-red', 'Dim. Reduction': 'b-blue', Optimization: 'b-yellow',
  Anomaly: 'b-r', RL: 'b-y', Association: 'b-yellow', Optimization: 'b-blue',
};

let _vizCatFilter = '';
function filterVizCat(cat) {
  _vizCatFilter = cat;
  document.querySelectorAll('.viz-cat-btn').forEach(b => b.classList.remove('active', 'btn-primary'));
  document.querySelectorAll('.viz-cat-btn').forEach(b => b.classList.add('btn-secondary'));
  event.target.classList.add('active', 'btn-primary');
  event.target.classList.remove('btn-secondary');
  buildAlgoGrid();
}

function buildAlgoGrid() {
  const filtered = _vizCatFilter ? VIZ_ALGOS.filter(a => a.cat === _vizCatFilter) : VIZ_ALGOS;
  document.getElementById('algo-grid').innerHTML = filtered.map(a => {
    const safe = a.name.replace(/[\s()\/]/g, '_');
    return `<div class="acard" onclick="openViz('${a.name}')" id="ac-${safe}">
      <div class="aic" style="font-size:10px;font-weight:800;color:var(--primary);text-transform:uppercase;letter-spacing:.05em">${escHtml(a.cat)}</div>
      <div class="an">${escHtml(a.name)}</div>
      <div class="ad">${escHtml(a.desc)}</div>
    </div>`;
  }).join('');
}

let _vizMode = 'default';
function setVizMode(m) {
  _vizMode = m;
  document.getElementById('vmode-default').className = `btn ${m === 'default' ? 'btn-primary' : 'btn-secondary'} btn-sm`;
  document.getElementById('vmode-user').className    = `btn ${m === 'user'    ? 'btn-primary' : 'btn-secondary'} btn-sm`;
  const hasUD = S.userVizData && S.userVizData.length >= 10;
  document.getElementById('viz-mode-label').textContent = m === 'user'
    ? (hasUD ? `Using your dataset (${S.userVizData.length} pts)` : 'No dataset loaded — using demo data')
    : 'Using synthetic demo data';
  if (window._currentVizName) openViz(window._currentVizName);
}

function openViz(name) {
  window._currentVizName = name;
  document.querySelectorAll('.acard').forEach(c => c.classList.remove('active'));
  const safe = name.replace(/[\s()\/]/g, '_');
  const card = document.getElementById(`ac-${safe}`);
  if (card) { card.classList.add('active'); card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  const cont = document.getElementById('viz-container');
  cont.classList.remove('hidden');
  cont.classList.remove('show-anim');
  void cont.offsetWidth; // force reflow
  cont.classList.add('show-anim');
  document.getElementById('viz-title').textContent = name;
  document.getElementById('viz-canvas-wrap').innerHTML = '<div class="empty" style="padding:24px">Loading…</div>';
  document.getElementById('viz-info').innerHTML = '';
  document.getElementById('viz-controls').innerHTML = '';
  cont.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  const ud = (_vizMode === 'user' && S.userVizData?.length >= 10) ? S.userVizData : null;
  setTimeout(() => {
    if (window.launchViz) launchViz(name, document.getElementById('viz-canvas-wrap'), document.getElementById('viz-info'), document.getElementById('viz-controls'), ud);
    else document.getElementById('viz-canvas-wrap').innerHTML = '<div class="empty">Visualizer not loaded.</div>';
  }, 80);
}

// ── History ───────────────────────────────────────────────────────────────────
async function loadHistory() {
  const d  = await api('GET', '/api/experiments');
  const el = document.getElementById('history-table');
  if (!el) return;
  if (!d.ok || !d.experiments?.length) { el.innerHTML = '<div class="empty">No experiments yet.</div>'; return; }
  let h = `<table><thead><tr><th>Algorithm</th><th>Type</th><th>Dataset</th><th>Key Metric</th><th>Time</th></tr></thead><tbody>`;
  d.experiments.forEach(e => {
    const dt  = e.ts ? new Date(e.ts * 1000).toLocaleString() : '—';
    const m   = e.metrics || {};
    const met = m.accuracy != null ? `Acc: ${(m.accuracy * 100).toFixed(1)}%` : m.r2 != null ? `R²: ${m.r2.toFixed(3)}` : m.inertia != null ? `Inertia: ${m.inertia.toFixed(1)}` : '—';
    h += `<tr><td><b>${e.algo}</b></td><td><span class="badge b-purple">${e.algo_type || e.dataset}</span></td><td>${e.dataset}</td><td><span class="badge b-green">${met}</span></td><td style="color:var(--muted);font-size:11px">${dt}</td></tr>`;
  });
  el.innerHTML = h + '</tbody></table>';
}

// ── Export ────────────────────────────────────────────────────────────────────
function doExport(type) {
  fetch(`/api/export/${type}`, { headers: { 'Authorization': `Bearer ${S.token}` } })
    .then(r => { if (!r.ok) { toast('Export unavailable — run a pipeline first', 'warning'); return null; } return r.blob(); })
    .then(b => {
      if (!b) return;
      const u = URL.createObjectURL(b), a = document.createElement('a');
      a.href = u; a.download = `ml_${type}_${Date.now()}.${type === 'summary' ? 'json' : 'csv'}`; a.click();
      URL.revokeObjectURL(u); toast(`${type} exported`, 'success');
    });
}

// ── Announcements ─────────────────────────────────────────────────────────────
const _shownAnnouncements = new Set();

async function loadAnnouncements() {
  try {
    const r = await api('GET', '/api/announcements');
    if (!r?.ok) return;
    const ann = r.announcements || [];
    ann.forEach(a => {
      const key = `${a.created_at}_${(a.text||'').slice(0,20)}`;
      if (_shownAnnouncements.has(key)) return;
      _shownAnnouncements.add(key);
      showAnnouncementPopup(a.text||a.message||'', a.type||'info', a.created_at);
    });
  } catch (e) {}
}

function showAnnouncementPopup(text, type, ts) {
  const wrap = document.getElementById('announce-popup-wrap');
  if (!wrap) return;
  const icons = { info: 'i', warn: '!', warning: '!', danger: '!', success: 'OK' };
  const colorMap = {
    info:    'background:rgba(8,14,28,.95);border:1px solid rgba(124,92,252,.5);color:#a78bfa',
    warn:    'background:rgba(8,14,28,.95);border:1px solid rgba(255,183,0,.5);color:#fbbf24',
    warning: 'background:rgba(8,14,28,.95);border:1px solid rgba(255,183,0,.5);color:#fbbf24',
    danger:  'background:rgba(8,14,28,.95);border:1px solid rgba(255,77,109,.5);color:#f87171',
    success: 'background:rgba(8,14,28,.95);border:1px solid rgba(0,229,160,.5);color:#34d399',
  };
  const el = document.createElement('div');
  el.style.cssText = `
    width:100%;border-radius:16px;padding:16px 20px;
    display:flex;align-items:flex-start;gap:14px;
    box-shadow:0 20px 60px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.07);
    pointer-events:all;backdrop-filter:blur(20px);
    animation:popupIn .4s cubic-bezier(.34,1.56,.64,1) both;
    ${colorMap[type]||colorMap.info}`;
  el.innerHTML = `
    <div style="font-size:16px;font-weight:800;flex-shrink:0">${icons[type]||'i'}</div>
    <div style="flex:1">
      <div style="font-size:14px;font-weight:700;line-height:1.5">${escHtml(text)}</div>
      ${ts?`<div style="font-size:11px;opacity:.6;margin-top:3px">${new Date(ts*1000).toLocaleString()}</div>`:''}
    </div>
    <button onclick="this.parentNode.remove()" style="background:none;border:none;cursor:pointer;color:inherit;opacity:.6;font-size:20px;padding:0;flex-shrink:0;line-height:1">×</button>`;
  wrap.appendChild(el);
  // Auto-dismiss after 12 seconds
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(-10px)';
    setTimeout(() => el.remove(), 350);
  }, 12000);
}

// ── Tutorial ──────────────────────────────────────────────────────────────────
const TUT_STEPS = [
  { icon: '1', title: 'Welcome to Modelora!', body: '5 quick steps to get started. Use the sidebar toggle to collapse/expand the panel for full-screen working space.' },
  { icon: '2', title: 'Step 1 — Load Data', body: 'Upload a CSV/XLSX/JSON file or pick one of 30+ built-in datasets (Iris, California Housing, stock simulations…).' },
  { icon: '3', title: 'Step 2 — Configure', body: 'Choose a category (SML, UNSML, DL, RL…), pick an algorithm, then set your target column and features for supervised tasks.' },
  { icon: '4', title: 'Step 3 — Run Pipeline', body: 'Click Run Pipeline. You\'ll get metrics, CV scores, overfitting diagnosis, feature importance, and prediction tables — honestly reported.' },
  { icon: '5', title: 'Step 4 — Visualize & Compare', body: 'Explore 50+ algorithm animations in the Visualizer, compare all models in the Arena (top-10 ranked), or try What-If predictions on any model type.' },
];
let _tutStep = 0;
function startTutorial() {
  _tutStep = 0; document.getElementById('tutorial').classList.add('show'); renderTutStep();
}
function renderTutStep() {
  const st = TUT_STEPS[_tutStep];
  document.getElementById('tut-step').textContent = `Step ${_tutStep + 1} of ${TUT_STEPS.length}`;
  document.getElementById('tut-icon').textContent  = st.icon;
  document.getElementById('tut-title').textContent = st.title;
  document.getElementById('tut-body').textContent  = st.body;
  document.getElementById('tut-next').textContent  = _tutStep >= TUT_STEPS.length - 1 ? 'Start Exploring!' : 'Next →';
  document.getElementById('tut-dots').innerHTML = TUT_STEPS.map((_, i) => `<div class="tut-dot ${i === _tutStep ? 'active' : ''}"></div>`).join('');
}
function nextTutStep() { if (_tutStep >= TUT_STEPS.length - 1) { skipTutorial(); return; } _tutStep++; renderTutStep(); }
function skipTutorial() { document.getElementById('tutorial').classList.remove('show'); localStorage.setItem('ml_tutorial_done', '1'); api('POST', '/api/auth/tutorial_done'); }


// ── Privacy Policy / Terms modals ────────────────────────────────────────────
function showPrivacyPolicy() {
  showCustomModal({
    title: 'Privacy Policy',
    body: `<div class="policy-modal-content">
      <h4>Data Collection</h4>
      <p>Modelora collects your email address, username, and usage data (experiments, algorithm choices) to provide personalised features and improve the platform.</p>
      <h4>Data Storage</h4>
      <p>Your account data is stored securely using PBKDF2-SHA256 password hashing. We do not store plain-text passwords. Dataset files are held temporarily during your session only.</p>
      <h4>Cookies &amp; Local Storage</h4>
      <p>We use browser localStorage to maintain your login session and preferences (theme, tutorial status). No third-party tracking cookies are used.</p>
      <h4>Data Sharing</h4>
      <p>We do not sell, rent, or share your personal data with third parties. Aggregate anonymised usage statistics may be used for platform improvements.</p>
      <h4>Your Rights</h4>
      <p>You may request deletion of your account and associated data at any time by contacting our support. Feedback messages you submit may be reviewed by administrators.</p>
      <h4>Contact</h4>
      <p>For privacy questions: <strong>privacy@modelora.ai</strong></p>
    </div>`,
    icon: 'info',
    confirmText: 'Close',
    cancelText: ''
  });
}

function showTerms() {
  showCustomModal({
    title: 'Terms of Use',
    body: `<div class="policy-modal-content">
      <h4>Acceptable Use</h4>
      <p>Modelora is an educational ML platform. You agree not to upload malicious files, attempt to access other users' data, or use the platform for any illegal purpose.</p>
      <h4>Data Uploads</h4>
      <p>You retain ownership of any data you upload. By uploading, you grant us temporary permission to process it for the ML pipeline. Files are not shared with other users.</p>
      <h4>Service Availability</h4>
      <p>Modelora is provided as-is for educational and research purposes. We do not guarantee 100% uptime and are not liable for any loss arising from platform downtime.</p>
      <h4>Account Termination</h4>
      <p>We reserve the right to suspend or terminate accounts that violate these terms. Administrators may lock accounts for security reasons.</p>
      <h4>Changes</h4>
      <p>These terms may be updated periodically. Continued use of the platform constitutes acceptance of the updated terms.</p>
    </div>`,
    icon: 'info',
    confirmText: 'Accept',
    cancelText: ''
  });
}

// ── Feedback ──────────────────────────────────────────────────────────────────
async function sendFeedback() {
  const subject = (document.getElementById('feedback-subject')?.value || '').trim() || 'General Feedback';
  const message = (document.getElementById('feedback-message')?.value || '').trim();
  const btn     = document.getElementById('feedback-send-btn');
  if (!message) { toast('Please enter your feedback message.', 'warning'); return; }
  if (btn) btn.disabled = true;
  const d = await api('POST', '/api/feedback', { subject, message, page: 'user_dashboard' });
  if (btn) btn.disabled = false;
  d.ok ? (toast(d.msg || 'Feedback sent — thank you!', 'success'), clearFeedbackForm())
       : toast(d.msg || 'Unable to send feedback.', 'error');
}
function clearFeedbackForm() {
  const s = document.getElementById('feedback-subject'); if (s) s.value = '';
  const m = document.getElementById('feedback-message'); if (m) m.value = '';
}

// ── User dropdown ─────────────────────────────────────────────────────────────
let _ddOpen = false;
function toggleUserDropdown() { _ddOpen = !_ddOpen; document.getElementById('user-dropdown')?.classList.toggle('open', _ddOpen); }
function closeDropdown() { _ddOpen = false; document.getElementById('user-dropdown')?.classList.remove('open'); }
document.addEventListener('click', e => {
  const chip = document.getElementById('user-chip');
  const dd   = document.getElementById('user-dropdown');
  if (chip && dd && !chip.contains(e.target)) { _ddOpen = false; dd.classList.remove('open'); }
});

// ── Custom Modal ──────────────────────────────────────────────────────────────
const MODAL_ICONS = {
  danger:  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  warn:    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  info:    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  success: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
};

function showCustomModal({ title = '', body = '', icon = 'info', confirmText = 'OK', cancelText = '', onConfirm, onCancel, dangerous = false } = {}) {
  const bg = document.getElementById('modal-bg'); if (!bg) return;
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  const iconEl = document.getElementById('modal-icon-wrap');
  if (iconEl) { iconEl.className = `modal-icon-wrap mi-${icon}`; iconEl.innerHTML = MODAL_ICONS[icon] || MODAL_ICONS.info; }
  const confirmEl = document.getElementById('modal-confirm');
  confirmEl.textContent = confirmText;
  confirmEl.className   = `btn ${dangerous ? 'btn-danger' : 'btn-primary'}`;
  confirmEl.onclick     = () => { closeCustomModal(); if (onConfirm) onConfirm(); };
  const cancelEl = document.getElementById('modal-cancel');
  if (cancelText) { cancelEl.textContent = cancelText; cancelEl.style.display = ''; cancelEl.onclick = () => { closeCustomModal(); if (onCancel) onCancel(); }; }
  else cancelEl.style.display = 'none';
  bg.classList.remove('hidden');
}
function closeCustomModal() { document.getElementById('modal-bg')?.classList.add('hidden'); }
function showCustomAlert(title, body, icon = 'info') { showCustomModal({ title, body, icon, confirmText: 'OK', cancelText: '' }); }

// ── Plotly helpers ────────────────────────────────────────────────────────────
function plo(title, h = 340) {
  const dark = document.documentElement.getAttribute('data-theme') !== 'light';
  const tc = dark ? '#a8b8d8' : '#384878';
  const gc = dark ? '#1e3050' : '#c8d4f0';
  const bc = 'rgba(0,0,0,0)';
  return {
    title: title ? { text: title, font: { color: tc, size: 12 }, x: 0 } : undefined,
    height: h, paper_bgcolor: bc, plot_bgcolor: bc,
    font: { color: tc, family: 'DM Sans,sans-serif', size: 11 },
    margin: { l: 54, r: 16, t: title ? 34 : 10, b: 46 },
    xaxis: { gridcolor: gc, zerolinecolor: gc, color: tc },
    yaxis: { gridcolor: gc, zerolinecolor: gc, color: tc },
    legend: { bgcolor: bc, bordercolor: gc, font: { color: tc } },
    transition: { duration: 350, easing: 'cubic-in-out' },
  };
}
function axLabel(x, y) {
  const dark = document.documentElement.getAttribute('data-theme') !== 'light';
  const tc   = dark ? '#5878a0' : '#6070a0';
  return {
    xaxis: { title: { text: x, font: { color: tc } } },
    yaxis: { title: { text: y, font: { color: tc } } },
  };
}

// ── Session Countdown ──────────────────────────────────────────────────────
let _countdownTimer = null;
let _sessionEndTime = null;

function startSessionCountdown(endTime) {
  if (_sessionEndTime === endTime) return;
  _sessionEndTime = endTime;
  clearInterval(_countdownTimer);
  const banner = document.getElementById('session-countdown');
  const timerEl = document.getElementById('countdown-timer');
  
  function updateCountdown() {
    const now = Date.now();
    const remaining = Math.max(0, endTime - now);
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    if (remaining <= 60000 && remaining > 0) { // Last minute
      banner.style.background = 'linear-gradient(90deg,var(--danger),#ff4444)';
      if (remaining <= 10000) { // Last 10 seconds
        timerEl.style.animation = 'blink 0.5s infinite';
      }
    }
    
    if (remaining <= 0) {
      clearInterval(_countdownTimer);
      banner.style.display = 'none';
      toast('Session time limit reached. Logging out…', 'warning', 3000);
      setTimeout(() => logout(), 3000);
    }
  }
  
  banner.style.display = 'block';
  updateCountdown();
  _countdownTimer = setInterval(updateCountdown, 1000);
}

function hideSessionCountdown() {
  clearInterval(_countdownTimer);
  _sessionEndTime = null;
  document.getElementById('session-countdown').style.display = 'none';
}
