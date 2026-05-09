/**
 * admin.js — Modelora V6 Admin Dashboard
 * All fixes: active sessions only, health history, SSE cross-browser,
 * styled modals, lock→force-logout on client, filter fixes, score/time charts,
 * theme preview, system limits per-user, maintenance styled page
 */
'use strict';

const A = {
  token: localStorage.getItem('ml_token') || '',
  user:  localStorage.getItem('ml_user')  || '',
  role:  '',
  sse:   null,
  pollingInterval: null,
  userPage: 1,
  expPage:  1,
  cfg:  {},
  healthHist: { cpu: [], mem: [], ts: [] },
};

document.addEventListener('DOMContentLoaded', async () => {
  if (!A.token) { window.location = '/login'; return; }
  applyTheme(localStorage.getItem('ml_theme') || 'dark');
  showLoad();
  const ok = await verifyAdmin();
  if (!ok) { window.location = '/login'; return; }
  hideLoad();
  setupAdminSidebarOverlay();
  injectNavIcons();
  setupSSE();
  await loadOverview();
  loadAnnouncements();
  loadAnnouncementHistory();
  setInterval(loadOverview, 30000);
  setInterval(snapshotHealth, 30000);
  snapshotHealth();
  startInactivityTimer();
  // NOTE: Users table and Security panel are NOT auto-refreshed to prevent
  // lock state from appearing to toggle. They refresh only on explicit user action.
  // Restore sidebar collapsed state
  if (localStorage.getItem('admin_sb_collapsed') === '1') {
    document.body.classList.add('admin-sidebar-collapsed');
  }
});

// ── Admin Sidebar Toggle ────────────────────────────────────────────────────
function toggleAdminSidebar() {
  const isMobile = window.innerWidth <= 900;
  if (isMobile) {
    const sb = document.getElementById('admin-sidebar');
    const isOpen = document.body.classList.contains('admin-sb-mobile-open') || (sb && sb.classList.contains('admin-sb-open'));
    if (isOpen) {
      closeAdminMobileSidebar();
    } else {
      document.body.classList.add('admin-sb-mobile-open');
      if (sb) sb.classList.add('admin-sb-open');
    }
  } else {
    const collapsed = document.body.classList.toggle('admin-sidebar-collapsed');
    localStorage.setItem('admin_sb_collapsed', collapsed ? '1' : '0');
  }
}

function closeAdminMobileSidebar() {
  document.body.classList.remove('admin-sb-mobile-open');
  const sb = document.getElementById('admin-sidebar');
  if (sb) {
    sb.classList.remove('admin-sb-open');
    sb.classList.remove('open');
  }
}

function setupAdminSidebarOverlay() {
  let overlay = document.querySelector('.admin-sb-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'admin-sb-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlay);
  }
  overlay.addEventListener('click', closeAdminMobileSidebar);
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) closeAdminMobileSidebar();
  });
}

function injectNavIcons() {
  const iconMap = {
    'overview': ICONS.overview, 'live': ICONS.liveIcon, 'health': ICONS.health,
    'users': ICONS.users, 'sessions': ICONS.sessions, 'audit': ICONS.audit,
    'experiments': ICONS.experiments, 'security': ICONS.security,
    'config': ICONS.customise, 'announce': ICONS.announce,
  };
  document.querySelectorAll('.a-nav-item[data-panel]').forEach(item => {
    const span = item.querySelector('.nav-icon');
    const fn = iconMap[item.dataset.panel];
    if (span && fn) span.innerHTML = fn(15);
  });
  const logoIcon = document.querySelector('.a-logo-icon');
  if (logoIcon) logoIcon.innerHTML = ICONS.mlLogo(36);
}

async function verifyAdmin() {
  let d;
  try { d = await api('GET', '/api/auth/me'); } catch(e) { return false; }
  if (!d?.ok) { localStorage.clear(); return false; }
  const role = d.role || d.user?.role || 'user';
  if (role !== 'admin') { toast('Admin access required', 'error'); setTimeout(()=>window.location='/dashboard',1500); return false; }
  A.role = role;
  const u = d.display_name || d.user?.display_name || d.email || A.user;
  const av = document.getElementById('sb-avatar'); if(av) av.textContent = (u||'A')[0].toUpperCase();
  const nm = document.getElementById('sb-name');   if(nm) nm.textContent = u || 'Admin';
  return true;
}

async function api(method, url, body = null) {
  const opts = { method, headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${A.token}` } };
  if (body) opts.body = JSON.stringify(body);
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(tid);
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return { ok:false, msg:`Non-JSON (${r.status})` };
    return await r.json();
  } catch(e) {
    return { ok:false, msg: e.name==='AbortError'?'Timeout':String(e) };
  }
}

// ── Custom styled modal (no browser alert) ──────────────────────────────────
function showAdminModal({title, body, icon='info', confirmText='Confirm', cancelText='Cancel', onConfirm, onCancel, dangerous=false}={}) {
  document.getElementById('adm-modal-title').textContent = title;
  document.getElementById('adm-modal-body').innerHTML = body;
  const iconSvg = {
    danger: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warn:   `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info:   `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    success:`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
  };
  const iconWrap = document.getElementById('adm-modal-icon');
  iconWrap.className = `adm-modal-icon-wrap adm-mi-${icon}`;
  iconWrap.innerHTML = iconSvg[icon] || iconSvg.info;
  const cb = document.getElementById('adm-modal-confirm');
  cb.textContent = confirmText;
  cb.className = `btn ${dangerous?'btn btn-danger':'btn btn-primary'}`;
  cb.onclick = () => { closeAdminModal(); if(onConfirm) onConfirm(); };
  const ca = document.getElementById('adm-modal-cancel');
  ca.textContent = cancelText;
  ca.onclick = () => { closeAdminModal(); if(onCancel) onCancel(); };
  document.getElementById('adm-modal-bg').style.display = 'flex';
}
function closeAdminModal() { document.getElementById('adm-modal-bg').style.display = 'none'; }

function toast(msg, type='info', dur=4000) {
  const wrap = document.getElementById('a-toasts');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = `a-toast ${type}`;
  const dots = {success:'OK', error:'!', info:'·', warning:'!'};
  el.innerHTML = `<span style="font-size:11px;font-weight:800">${dots[type]||'·'}</span><span style="flex:1">${escHtml(msg)}</span><button onclick="this.parentNode.remove()" style="background:none;border:none;cursor:pointer;color:currentColor;opacity:.5;font-size:15px;padding:0 0 0 6px;flex-shrink:0">×</button>`;
  wrap.appendChild(el);
  const tid = setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateX(50px)'; setTimeout(()=>el.remove(),300); }, dur);
  el.querySelector('button').addEventListener('click',()=>clearTimeout(tid));
}

function escHtml(s) {
  return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function syncAdminCounts({ totalUsers, activeSessions } = {}) {
  if (Number.isFinite(totalUsers)) {
    const bu = document.getElementById('badge-users'); if (bu) bu.textContent = totalUsers;
    const su = document.getElementById('st-users'); if (su) su.textContent = Number(totalUsers).toLocaleString();
  }
  if (Number.isFinite(activeSessions)) {
    const ba = document.getElementById('badge-active'); if (ba) ba.textContent = activeSessions;
    const ss = document.getElementById('st-sess'); if (ss) ss.textContent = Number(activeSessions).toLocaleString();
    const lsc = document.getElementById('live-sess-count'); if (lsc) lsc.textContent = `${activeSessions} online`;
    const rr = document.getElementById('rt-req'); if (rr) rr.textContent = activeSessions;
  }
}

function showLoad() { document.getElementById('a-overlay').classList.add('show'); }
function hideLoad() { document.getElementById('a-overlay').classList.remove('show'); }

function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('ml_theme', t);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.innerHTML = t==='light'
    ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
    : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
}
function toggleTheme() { applyTheme(document.documentElement.getAttribute('data-theme')==='light'?'dark':'light'); }

const PANEL_TITLES = {
  overview:'Overview', live:'Live Feed', health:'System Health',
  users:'User Management', sessions:'Session Monitor', audit:'Audit Log',
  experiments:'Experiment Analytics', security:'Security Centre',
  config:'Customise Platform', announce:'Announcements',
};

function switchPanel(el) {
  document.querySelectorAll('.a-nav-item').forEach(n=>n.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  el.classList.add('active');
  const id = el.dataset.panel;
  document.getElementById('panel-'+id).classList.add('active');
  document.getElementById('topbar-title').textContent = PANEL_TITLES[id]||id;
  const loaders = {
    users: loadUsers, sessions: loadSessions, audit: loadAudit,
    experiments: loadExperiments, security: loadSecurity,
    config: async()=>{ await loadConfig(); await loadFeedback(); await loadTimeLimitsTable(); },
    announce: loadAnnouncements, health: loadHealth, live: loadLiveFeed,
  };
  if (loaders[id]) loaders[id]();
}

function goToPanel(panelName) {
  const navItem = document.querySelector(`.a-nav-item[data-panel="${panelName}"]`);
  if (navItem) switchPanel(navItem);
}

// ── Inactivity auto-logout (30 min) ──────────────────────────────────────────
let _inactiveTimer = null;
const INACTIVE_LIMIT_MS = 30 * 60 * 1000; // 30 minutes
const INACTIVE_WARN_MS  = 29 * 60 * 1000; // warn at 29 min

function resetInactivityTimer() {
  clearTimeout(_inactiveTimer);
  _inactiveTimer = setTimeout(() => {
    toast('Session expired due to inactivity. Logging out…', 'warning', 4000);
    setTimeout(() => adminLogout(), 3500);
  }, INACTIVE_LIMIT_MS);
}

function startInactivityTimer() {
  resetInactivityTimer();
  ['mousemove','keydown','click','scroll','touchstart'].forEach(ev =>
    document.addEventListener(ev, resetInactivityTimer, { passive: true })
  );
  // Warn at 29 min
  setInterval(() => {
    if (_inactiveTimer) {
      const remaining = _inactiveTimer._idleStart ? (INACTIVE_LIMIT_MS - (Date.now() - _inactiveTimer._idleStart)) : null;
      // Simple approach: just show warning if no activity in 29min
    }
  }, INACTIVE_WARN_MS);
}

// ── Per-user session timer display ──────────────────────────────────────────
const _userTimers = {}; // username -> { endsAt, interval }

function startSessionTimerDisplay(username, endsAt) {
  if (_userTimers[username]) clearInterval(_userTimers[username].interval);
  const id = setInterval(() => {
    const remaining = Math.max(0, endsAt - Date.now());
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    const badge = document.querySelector(`[data-timer="${CSS.escape(username)}"]`);
    if (badge) {
      badge.textContent = remaining > 0 ? `${mins}m ${secs}s` : 'Expired';
      badge.style.color = remaining < 60000 ? 'var(--danger)' : remaining < 300000 ? 'var(--warning)' : 'var(--success)';
    }
    if (remaining === 0) clearInterval(id);
  }, 1000);
  _userTimers[username] = { endsAt, interval: id };
}

function adminLogout() {
  api('POST','/api/auth/logout').finally(()=>{ localStorage.clear(); window.location='/login'; });
}

// ── SSE – uses polling fallback so cross-browser works ──────────────────────
function setupSSE() {
  // Clear any polling fallback when we try SSE again
  if (A.pollingInterval) {
    clearInterval(A.pollingInterval);
    A.pollingInterval = null;
  }

  // Try SSE first
  try {
    if (A.sse) A.sse.close();
    A.sse = new EventSource(`/api/admin/stream?token=${encodeURIComponent(A.token)}`);
    A.sse.onmessage = e => { try { handleSSE(JSON.parse(e.data)); } catch(_){} };
    A.sse.onerror = () => { if (A.sse) A.sse.close(); A.sse = null; startPollingFallback(); };
  } catch(e) { startPollingFallback(); }
}
function startPollingFallback() {
  if (A.pollingInterval) return;
  A.pollingInterval = setInterval(async () => {
    const d = await api('GET', '/api/admin/stats').catch(()=>null);
    if (d?.ok) handleSSE({ stats: d.stats, health: d.health });
    const lf = await api('GET', '/api/admin/livefeed').catch(()=>null);
    if (lf?.ok) handleSSE({ active: lf.active_sessions, alerts: lf.activity });
  }, 5000);
}

function handleSSE(d) {
  const ts = new Date().toLocaleTimeString();
  const luEl = document.getElementById('last-updated');
  if (luEl) luEl.textContent = `Updated ${ts}`;
  if (d.stats) {
    const s = d.stats;
    syncAdminCounts({ totalUsers: s.total_users || 0, activeSessions: s.active_sessions || 0 });
  }
  if (d.health?.psutil) {
    const rc = document.getElementById('rt-cpu'); if(rc) rc.textContent = `${d.health.cpu_pct}%`;
    const rm = document.getElementById('rt-mem'); if(rm) rm.textContent = `${d.health.mem_pct}%`;
    A.healthHist.cpu.push(d.health.cpu_pct);
    A.healthHist.mem.push(d.health.mem_pct);
    A.healthHist.ts.push(ts);
    if (A.healthHist.cpu.length > 60) { A.healthHist.cpu.shift(); A.healthHist.mem.shift(); A.healthHist.ts.shift(); }
    if (document.getElementById('panel-health')?.classList.contains('active')) renderHealthHistoryChart();
  }
  if (d.active && document.getElementById('panel-live')?.classList.contains('active')) {
    renderActiveSessions(d.active, 'live-sessions-table');
    syncAdminCounts({ activeSessions: d.active.length || 0 });
  }
  if (d.alerts?.length) {
    renderFeed(d.alerts, 'live-activity', 10);
    const ac = document.getElementById('alert-count'); if(ac) ac.textContent = d.alerts.length;
    renderFeed(d.alerts, 'alert-feed', 8);
  }
}

async function snapshotHealth() {
  // Store health snapshot for history chart
  const d = await api('GET', '/api/admin/health');
  if (d?.ok && d.health?.psutil) {
    const h = d.health;
    const ts = new Date().toLocaleTimeString();
    A.healthHist.cpu.push(h.cpu_pct);
    A.healthHist.mem.push(h.mem_pct);
    A.healthHist.ts.push(ts);
    if (A.healthHist.cpu.length > 60) { A.healthHist.cpu.shift(); A.healthHist.mem.shift(); A.healthHist.ts.shift(); }
    if (document.getElementById('panel-health')?.classList.contains('active')) renderHealthHistoryChart();
  }
}

function renderHealthHistoryChart() {
  const el = document.getElementById('health-chart');
  if (!el) return;
  if (!window.Plotly) {
    el.innerHTML = '<div class="empty">Chart library is still loading — please wait a moment and click Refresh</div>';
    return;
  }
  if (A.healthHist.cpu.length < 2) {
    el.innerHTML = '<div class="empty" style="padding:40px;text-align:center"><div style="font-size:28px;margin-bottom:8px"></div>Collecting CPU and memory samples…<br><span style="font-size:11px;color:var(--muted)">Data will appear after the first 2 snapshots. Click Refresh to speed this up.</span></div>';
    return;
  }
  try {
    Plotly.react(el, [
      { type:'scatter', mode:'lines+markers', y:A.healthHist.cpu, x:A.healthHist.ts, name:'CPU %',
        line:{color:'#7c5cfc',width:2}, marker:{size:4,color:'#7c5cfc'} },
      { type:'scatter', mode:'lines+markers', y:A.healthHist.mem, x:A.healthHist.ts, name:'Memory %',
        line:{color:'#00e5a0',width:2}, marker:{size:4,color:'#00e5a0'} },
    ], ploAdmin('CPU & Memory History', 260), { responsive:true, displayModeBar:false });
  } catch(e) {
    el.innerHTML = '<div class="empty">Chart render error — try refreshing</div>';
  }
}

function fmtTs(ts) { if(!ts) return '—'; return new Date(ts*1000).toLocaleString(); }
function fmtAge(ts) {
  if (!ts) return '—';
  const s = Math.floor((Date.now()/1000)-ts);
  if (s<60) return `${s}s ago`;
  if (s<3600) return `${Math.floor(s/60)}m ago`;
  if (s<86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

// ── Overview ──────────────────────────────────────────────────────────────────
function makeStatClickable() {
  const map = { 'st-users':'users', 'st-active':'sessions', 'st-sess':'live',
                'st-locked':'security', 'st-failed':'security', 'st-exp':'experiments' };
  Object.entries(map).forEach(([id, panel]) => {
    const card = document.getElementById(id)?.closest('.stat-card');
    if (card && !card.dataset.clickBound) {
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => {
        const navItem = document.querySelector(`.a-nav-item[data-panel="${panel}"]`);
        if (navItem) switchPanel(navItem);
      });
      card.dataset.clickBound = '1';
    }
  });
}
async function loadOverview() {
  const d = await api('GET', '/api/admin/stats');
  if (!d.ok) return;
  const s = d.stats, h = d.health;
  animNum('st-users',  s.total_users);
  const uSub = document.getElementById('st-users-sub'); if(uSub) uSub.textContent = `+${s.new_this_week} this week`;
  animNum('st-active', s.active_today);
  animNum('st-exp',    s.total_experiments);
  const eSub = document.getElementById('st-exp-sub'); if(eSub) eSub.textContent = `${s.experiments_today} today`;
  animNum('st-sess',   s.active_sessions);
  syncAdminCounts({ totalUsers: s.total_users || 0, activeSessions: s.active_sessions || 0 });
  animNum('st-locked', s.locked_users);
  animNum('st-failed', s.failed_logins_today);
  makeStatClickable();
  if (s.top_algorithms?.length) {
    const items = s.top_algorithms.slice(0,10);
    Plotly.newPlot('algo-chart',[{type:'bar',orientation:'h',
      x:items.map(i=>i.count), y:items.map(i=>escHtml(i.name)),
      text:items.map(i=>`${i.count} runs`), textposition:'outside',
      marker:{color:'#7c5cfc',opacity:.88},
    }], ploAdmin('',250), {responsive:true,displayModeBar:false});
  }
  renderHealthGrid(h,'health-grid');
}

function animNum(id, to) {
  const el = document.getElementById(id); if(!el) return;
  if (typeof to !== 'number') { el.textContent = to??'—'; return; }
  const start=Date.now(), from=0;
  const upd=()=>{const p=Math.min((Date.now()-start)/600,1);el.textContent=Math.round(from+(to-from)*(1-Math.pow(1-p,3))).toLocaleString();if(p<1)requestAnimationFrame(upd);};
  requestAnimationFrame(upd);
}

// ── Health ────────────────────────────────────────────────────────────────────
async function loadHealth() {
  const d = await api('GET', '/api/admin/health');
  if (!d.ok) return;
  if (d.health?.psutil) {
    const ts = new Date().toLocaleTimeString();
    A.healthHist.cpu.push(d.health.cpu_pct);
    A.healthHist.mem.push(d.health.mem_pct);
    A.healthHist.ts.push(ts);
    // Seed a second synthetic point if chart only has 1 so graph renders immediately
    if (A.healthHist.cpu.length === 1) {
      const t2 = new Date(Date.now()-3000).toLocaleTimeString();
      A.healthHist.cpu.unshift(d.health.cpu_pct);
      A.healthHist.mem.unshift(d.health.mem_pct);
      A.healthHist.ts.unshift(t2);
    }
    if (A.healthHist.cpu.length > 60) { A.healthHist.cpu.shift(); A.healthHist.mem.shift(); A.healthHist.ts.shift(); }
  }
  renderHealthGrid(d.health, 'health-detail');
  renderHealthGrid(d.health, 'health-grid');
  const note = document.getElementById('health-note');
  if (note) note.textContent = d.health?.psutil ? '' : 'Install psutil for live metrics: pip install psutil';
  renderHealthHistoryChart();
}

function renderHealthGrid(h, containerId) {
  const el = document.getElementById(containerId); if(!el) return;
  if (!h?.psutil) { el.innerHTML = '<div class="empty">psutil not installed — <code>pip install psutil</code></div>'; return; }
  const clr = v => v>80?'text-d':v>60?'text-w':'text-s';
  el.innerHTML = [
    {lbl:'CPU Usage',   val:`${h.cpu_pct}%`,  pct:h.cpu_pct,  cls:clr(h.cpu_pct)},
    {lbl:'Memory Used', val:`${h.mem_pct}%`,  pct:h.mem_pct,  cls:clr(h.mem_pct)},
    {lbl:'Memory',      val:`${h.mem_used_mb}MB / ${h.mem_total_mb}MB`, pct:h.mem_pct, cls:'text-s'},
    {lbl:'Disk Used',   val:`${h.disk_pct}%`, pct:h.disk_pct, cls:clr(h.disk_pct)},
    {lbl:'Disk Space',  val:`${h.disk_used_gb}GB / ${h.disk_total_gb}GB`, pct:h.disk_pct, cls:'text-s'},
  ].map(i=>`<div class="health-item"><div class="health-lbl">${escHtml(i.lbl)}</div><div class="health-val ${i.cls}">${escHtml(i.val)}</div><div class="health-bar"><div class="health-fill" style="width:${Math.min(i.pct||0,100)}%;background:${i.cls==='text-d'?'var(--danger)':i.cls==='text-w'?'var(--warning)':'var(--success)'}"></div></div></div>`).join('');
}

// ── Live Feed ─────────────────────────────────────────────────────────────────
async function loadLiveFeed() {
  const d = await api('GET', '/api/admin/livefeed');
  if (!d.ok) { toast('Failed to load live feed: ' + (d.msg||''), 'error'); return; }
  const now = Date.now()/1000;
  // Include all sessions that are_active, whether or not expires_at is set
  const active = (d.active_sessions||[]).filter(s => {
    if (!s.is_active) return false;
    if (s.expires_at && s.expires_at < now) return false;
    return true;
  });
  renderActiveSessions(active, 'live-sessions-table');
  syncAdminCounts({ activeSessions: active.length });
  renderFeed(d.activity||[], 'live-activity', 20);
  if (d.health?.psutil) {
    const rc = document.getElementById('rt-cpu'); if(rc) rc.textContent = `${d.health.cpu_pct}%`;
    const rm = document.getElementById('rt-mem'); if(rm) rm.textContent = `${d.health.mem_pct}%`;
  }
}

// ── Users ─────────────────────────────────────────────────────────────────────
// Use event delegation on the container for reliable action button handling
document.addEventListener('click', e => {
  const menuBtn = e.target.closest('[data-user-menu-toggle]');
  if (menuBtn) {
    e.preventDefault();
    e.stopPropagation();
    openUserActionMenu(menuBtn);
    return;
  }

  const btn = e.target.closest('[data-user-action]');
  if (btn) {
    const action   = btn.dataset.userAction;
    const username = btn.dataset.username;
    if (!action || !username) return;
    e.stopPropagation();
    closeUserActionMenu();
    if (action === 'detail') { openUserDetail(username); return; }
    if (action === 'delete') { doUserAction(username, 'delete'); return; }
    doUserAction(username, action);
    return;
  }

  if (e.target.closest('.user-action-popover')) return;

  const row = e.target.closest('[data-user-row]');
  if (row && !e.target.closest('button,a,input,select,textarea')) {
    openUserDetail(row.dataset.username);
    return;
  }

  closeUserActionMenu();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeUserActionMenu();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-user-row]')) {
    e.preventDefault();
    openUserDetail(e.target.closest('[data-user-row]').dataset.username);
  }
});

function closeUserActionMenu() {
  document.querySelectorAll('.user-action-popover').forEach(el => el.remove());
  document.querySelectorAll('[data-user-menu-toggle][aria-expanded="true"]').forEach(btn => btn.setAttribute('aria-expanded', 'false'));
}

function openUserActionMenu(btn) {
  const username = btn.dataset.username || '';
  const locked = btn.dataset.locked === '1';
  const role = btn.dataset.role || 'user';
  const existing = document.querySelector('.user-action-popover');
  const alreadyOpen = existing && existing.dataset.username === username;
  closeUserActionMenu();
  if (alreadyOpen) return;

  const actions = [
    locked
      ? { action: 'unlock', label: 'Unlock', cls: 'success' }
      : { action: 'lock', label: 'Lock', cls: 'warn' },
    role === 'admin'
      ? { action: 'demote', label: 'Demote', cls: 'ghost' }
      : { action: 'promote', label: 'Promote', cls: 'ghost' },
    { action: 'force_logout', label: 'Force logout', cls: 'ghost' },
    { action: 'delete', label: 'Delete', cls: 'danger' },
  ];

  const pop = document.createElement('div');
  pop.className = 'user-action-popover';
  pop.dataset.username = username;
  pop.innerHTML = `
    <div class="user-action-popover-head">
      <strong>${escHtml(username)}</strong>
      <button type="button" class="user-action-close" aria-label="Close actions">x</button>
    </div>
    <div class="user-action-popover-list">
      ${actions.map(a => `<button type="button" class="user-action-item ${a.cls}" data-user-action="${a.action}" data-username="${escHtml(username)}">${escHtml(a.label)}</button>`).join('')}
    </div>`;
  document.body.appendChild(pop);
  pop.querySelector('.user-action-close')?.addEventListener('click', closeUserActionMenu);

  const rect = btn.getBoundingClientRect();
  const pr = pop.getBoundingClientRect();
  let left = rect.right - pr.width;
  let top = rect.bottom + 8;
  left = Math.max(12, Math.min(left, window.innerWidth - pr.width - 12));
  if (top + pr.height > window.innerHeight - 12) top = rect.top - pr.height - 8;
  pop.style.left = `${left}px`;
  pop.style.top = `${Math.max(12, top)}px`;
  btn.setAttribute('aria-expanded', 'true');
}

async function loadUsers() {
  const search = document.getElementById('user-search')?.value||'';
  const role   = document.getElementById('user-role-filter')?.value||'';
  const d = await api('GET', `/api/admin/users?page=${A.userPage}&limit=50&search=${encodeURIComponent(search)}${role?'&role='+encodeURIComponent(role):''}`);
  if (!d.ok) { toast('Failed to load users: ' + (d.msg||'Unknown error'), 'error'); return; }
  syncAdminCounts({ totalUsers: d.total || 0 });
  const el = document.getElementById('users-table');
  if (!d.users?.length) { el.innerHTML='<div class="empty">No users found</div>'; return; }
  let h = `<table class="admin-users-table"><thead><tr>
    <th style="width:28px;text-align:center">#</th>
    <th>Username</th><th style="text-align:center">Role</th>
    <th>Email</th><th style="text-align:center">Last Login</th>
    <th style="text-align:center">Expts</th>
    <th style="text-align:center">Time Limit</th>
    <th style="text-align:center">Status</th>
    <th style="text-align:center">Actions</th>
  </tr></thead><tbody>`;
  d.users.forEach((u,i)=>{
    const isDemo = u.email==='demo@ml.local';
    const locked = u.is_locked
      ? '<span class="badge b-r" title="Admin-locked">Locked</span>'
      : '<span class="badge b-g">Active</span>';
    const role_b = u.role==='admin'
      ? '<span class="badge b-admin">ADMIN</span>'
      : `<span class="badge b-user">user</span>${isDemo?'<span class="badge" style="background:rgba(0,212,255,.12);color:var(--accent);margin-left:3px">Demo</span>':''}`;
    const uSafe = escHtml(u.username);
    const tl = u.time_limit||0;
    const tlBadge = tl>0
      ? `<span class="badge b-y" style="cursor:pointer" title="Edit time limit">${tl}m</span>`
      : `<span style="color:var(--muted);font-size:11px">&#8734;</span>`;
    h += `<tr class="user-row" data-user-row data-username="${uSafe}" tabindex="0" title="Click to view full user details" style="${u.is_locked?'background:rgba(255,77,109,.04)':''}">
      <td style="color:var(--muted);text-align:center">${(A.userPage-1)*50+i+1}</td>
      <td><span class="clickable fw7" style="cursor:pointer;color:var(--primary)">${uSafe}</span></td>
      <td style="text-align:center">${role_b}</td>
      <td style="font-size:11px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(u.email||'—')}</td>
      <td style="text-align:center;font-size:11px">${fmtAge(u.last_login)}</td>
      <td style="text-align:center">${u.experiments||0}</td>
      <td style="text-align:center">${tlBadge}</td>
      <td style="text-align:center">${locked}</td>
      <td class="user-actions-cell">
        <button type="button" class="user-menu-btn" data-user-menu-toggle data-username="${uSafe}" data-locked="${u.is_locked?'1':'0'}" data-role="${escHtml(u.role||'user')}" aria-label="Open actions for ${uSafe}" aria-expanded="false">
          <span></span><span></span><span></span>
        </button>
      </td></tr>`;
  });
  el.innerHTML = h+'</tbody></table>';
  const pg = document.getElementById('users-pagination');
  if(pg) {
    pg.innerHTML='';
    for(let p=1;p<=d.pages;p++){
      const b=document.createElement('button');
      b.className=`pg-btn${p===d.page?' active':''}`;
      b.textContent=p;
      b.onclick=()=>{A.userPage=p;loadUsers();};
      pg.appendChild(b);
    }
  }
}
async function doUserAction(username, action) {
  const actionLabels = { lock:'Lock', unlock:'Unlock', promote:'Promote to Admin', demote:'Demote to User', force_logout:'Force Logout', delete:'DELETE' };
  const dangerous = ['delete','lock'].includes(action);
  showAdminModal({
    title: `${actionLabels[action]} — ${username}`,
    body: action==='delete'
      ? `<strong>Permanently delete</strong> user <code>${escHtml(username)}</code> and all their data?<br><br>This <strong>cannot be undone</strong>.`
      : `Apply <strong>${actionLabels[action]}</strong> to <code>${escHtml(username)}</code>?`,
    icon: dangerous?'danger':'warn',
    confirmText: actionLabels[action],
    cancelText: 'Cancel',
    dangerous,
    onConfirm: async () => {
      const d = await api('POST', `/api/admin/users/${encodeURIComponent(username)}/action`, { action });
      if (d.ok) {
        toast(`${actionLabels[action]} applied to ${username}`, 'success');
        // Push notification to client (no emoji in message)
        if (action==='lock')         pushUserNotification(username, 'Your account has been locked by an administrator. Contact support.', 'danger');
        if (action==='force_logout') pushUserNotification(username, 'You have been logged out by an administrator.', 'warning');
        if (action==='unlock')       pushUserNotification(username, 'Your account has been unlocked. You may log in again.', 'success');
      } else toast(d.msg||'Failed','error');
      // Hard-reload users table so lock status is accurate; do NOT auto-refresh security panel
      await loadUsers();
      loadOverview();
    }
  });
}

async function pushUserNotification(username, msg, type) {
  // Store via backend admin endpoint
  await api('POST', `/api/admin/users/${encodeURIComponent(username)}/notify`, { msg, type });
}

function confirmDeleteUser(username) { doUserAction(username, 'delete'); }

function renderUserDetailRows(title, rows, type) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return `<div class="user-detail-section"><h4>${escHtml(title)}</h4><div class="empty compact">No records</div></div>`;
  const body = list.slice(0, 8).map(item => {
    if (type === 'session') {
      return `<div class="user-detail-row">
        <strong>${item.is_active ? 'Active' : 'Closed'}</strong>
        <span>${escHtml(item.current_page || 'dashboard')}</span>
        <em>${fmtAge(item.last_activity || item.created_at)}${item.logout_reason ? ' - '+escHtml(item.logout_reason) : ''}</em>
      </div>`;
    }
    if (type === 'experiment') {
      const metric = item.metrics?.accuracy ?? item.metrics?.r2 ?? item.metrics?.score ?? '';
      return `<div class="user-detail-row">
        <strong>${escHtml(item.algo || item.algo_name || 'Algorithm')}</strong>
        <span>${escHtml(item.dataset || 'dataset')}${item.algo_type ? ' - '+escHtml(item.algo_type) : ''}</span>
        <em>${metric !== '' ? 'score '+Number(metric).toFixed(3)+' - ' : ''}${fmtAge(item.ts || item.timestamp)}</em>
      </div>`;
    }
    return `<div class="user-detail-row">
      <strong>${escHtml(item.filename || item.name || 'Dataset')}</strong>
      <span>${Number(item.rows || 0).toLocaleString()} rows - ${Number(item.cols || item.columns || 0).toLocaleString()} cols</span>
      <em>${fmtAge(item.ts || item.timestamp)}</em>
    </div>`;
  }).join('');
  const more = list.length > 8 ? `<div class="user-detail-more">Showing latest 8 of ${list.length}</div>` : '';
  return `<div class="user-detail-section"><h4>${escHtml(title)}</h4>${body}${more}</div>`;
}

// ── User Detail Modal ─────────────────────────────────────────────────────────
async function openUserDetail(username) {
  document.getElementById('user-modal').classList.add('show');
  document.getElementById('modal-uname').textContent = username;
  document.getElementById('modal-avatar').textContent = username[0].toUpperCase();
  document.getElementById('modal-body').innerHTML = '<div class="empty">Loading…</div>';
  const d = await api('GET', `/api/admin/users/${encodeURIComponent(username)}`);
  if (!d.ok) { document.getElementById('modal-body').innerHTML='<div class="empty">Failed to load</div>'; return; }
  const u = d.user;
  const expCount = u.experiment_count ?? (Array.isArray(u.experiments) ? u.experiments.length : (u.experiments || 0));
  document.getElementById('modal-role-badge').innerHTML = u.role==='admin'?'<span class="badge b-admin">ADMIN</span>':'<span class="badge b-user">user</span>';
  // Clean fields — only show relevant info
  document.getElementById('modal-body').innerHTML = `
    <div class="g2 mb12">
      <div>
        <div class="stat-lbl">Email</div><div class="fw7 mb8">${escHtml(u.email||'—')}</div>
        <div class="stat-lbl">Display Name</div><div class="fw7 mb8">${escHtml(u.display_name||u.username||'—')}</div>
        <div class="stat-lbl">Role</div><div class="mb8">${u.role==='admin'?'<span class="badge b-admin">ADMIN</span>':'<span class="badge b-user">user</span>'}</div>
        <div class="stat-lbl">Status</div><div class="mb8">${u.is_locked?'<span class="badge b-r">Locked</span>':'<span class="badge b-g">Active</span>'}</div>
        <div class="stat-lbl">Experiments</div><div class="fw7 mb8" style="color:var(--primary)">${expCount}</div>
      </div>
      <div>
        <div class="stat-lbl">Registered</div><div class="fw7 mb8">${fmtTs(u.created_at)}</div>
        <div class="stat-lbl">Last Login</div><div class="fw7 mb8">${fmtTs(u.last_login)}</div>
        <div class="stat-lbl">Login Count</div><div class="fw7 mb8">${u.login_count||0}</div>
        <div class="stat-lbl">Failed Attempts</div><div class="fw7 mb8">${u.failed_attempts||0}</div>
        <div class="stat-lbl">Time Limit</div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <input type="number" id="um-timelimit" value="${u.time_limit||0}" min="0" max="1440" style="width:70px;padding:5px 8px;font-size:12px;border-radius:7px;border:1px solid var(--border);background:var(--bg2);color:var(--text)">
          <span style="font-size:11px;color:var(--muted)">min (0 = unlimited)</span>
          <button class="btn btn-primary btn-xs" onclick="setUserTimeLimit('${escHtml(u.username)}')">Set Limit</button>
          ${(u.time_limit||0)>0
            ? `<button class="btn btn-ghost btn-xs" onclick="removeUserTimeLimit('${escHtml(u.username)}')" style="color:var(--danger)">Remove</button>`
            : ''
          }
        </div>
        ${(u.time_limit||0)>0
          ? `<div style="margin-top:4px;font-size:10px;color:var(--warning)">Current limit: ${u.time_limit} min — shown in Announce tab</div>`
          : `<div style="margin-top:4px;font-size:10px;color:var(--muted)">No limit set</div>`
        }
      </div>
    </div>
    <div class="user-detail-grid">
      ${renderUserDetailRows('Recent Sessions', u.sessions, 'session')}
      ${renderUserDetailRows('Recent Experiments', u.experiments_list || u.experiment_history || (Array.isArray(u.experiments) ? u.experiments : []), 'experiment')}
      ${renderUserDetailRows('Recent Uploads', u.uploads, 'upload')}
    </div>
    <div class="sep"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      ${u.is_locked
        ?`<button class="btn btn-success btn-xs" onclick="doUserAction('${escHtml(u.username)}','unlock');closeModal()">Unlock</button>`
        :`<button class="btn btn-warn btn-xs" onclick="doUserAction('${escHtml(u.username)}','lock');closeModal()">Lock</button>`}
      <button class="btn btn-ghost btn-xs" onclick="doUserAction('${escHtml(u.username)}','force_logout');closeModal()">Force Logout</button>
      ${u.role==='admin'
        ?`<button class="btn btn-ghost btn-xs" onclick="doUserAction('${escHtml(u.username)}','demote');closeModal()">Demote</button>`
        :`<button class="btn btn-ghost btn-xs" onclick="doUserAction('${escHtml(u.username)}','promote');closeModal()">Promote</button>`}
      <button class="btn btn-danger btn-xs" onclick="confirmDeleteUser('${escHtml(u.username)}');closeModal()">Delete</button>
    </div>`;
}

async function setUserTimeLimit(username) {
  const mins = parseInt(document.getElementById('um-timelimit')?.value||0);
  const d = await api('POST', `/api/admin/users/${encodeURIComponent(username)}/time_limit`, { minutes:mins });
  if (d.ok) {
    const label = mins > 0 ? `${mins} min` : 'unlimited';
    toast(`Time limit set: ${label} for ${username}`, 'success');
    // Post announcement so it shows in Announce tab
    const annMsg = mins > 0
      ? `Session time limit of ${mins} minutes has been set for user: ${username}.`
      : `Session time limit removed for user: ${username} (now unlimited).`;
    await api('POST', '/api/admin/announce', { msg: annMsg, type: mins > 0 ? 'warning' : 'info' });
    // Reload users table so time limit badge updates
    loadUsers();
    // Refresh announcements if visible
    if (document.getElementById('panel-announce')?.classList.contains('active')) loadAnnouncements();
  } else {
    toast(d.msg||'Failed','error');
  }
}

async function removeUserTimeLimit(username) {
  document.getElementById('um-timelimit').value = 0;
  await setUserTimeLimit(username);
}

function closeModal() { document.getElementById('user-modal').classList.remove('show'); }
document.addEventListener('DOMContentLoaded',()=>{
  const m = document.getElementById('user-modal');
  if (m) m.addEventListener('click', e=>{ if(e.target===e.currentTarget) closeModal(); });
});

// ── Sessions ─────────────────────────────────────────────────────────────────
async function loadSessions() {
  const d = await api('GET', '/api/admin/sessions');
  if (!d.ok) return;
  const now = Date.now()/1000;
  // Fix: only truly active sessions
  const active = (d.active||[]).filter(s => s.is_active && (s.expires_at||0) > now);
  const cnt = document.getElementById('sess-active-cnt'); if(cnt) cnt.textContent = `${active.length} active`;
  renderActiveSessions(active, 'active-sess-table');
  renderSessionHistory(d.history||[], 'sess-history-table');
}

function renderActiveSessions(sessions, tableId) {
  const el = document.getElementById(tableId); if(!el) return;
  if (!sessions.length) { el.innerHTML='<div class="empty" style="padding:28px;text-align:center;color:var(--muted)">No active sessions at this time</div>'; return; }
  let h=`<table class="session-table active-session-table"><thead><tr>
    <th style="width:32px;text-align:center">#</th>
    <th style="width:20%">User</th>
    <th style="width:13%">IP Address</th>
    <th style="width:15%">Current Page</th>
    <th style="width:12%">Started</th>
    <th style="width:12%">Last Active</th>
    <th style="width:14%">Expires</th>
    <th style="width:82px;text-align:center">Action</th>
  </tr></thead><tbody>`;
  sessions.forEach((s,i)=>{
    const tokenId = s.token_hash || '';
    const expiry = s.expires_at ? new Date(s.expires_at*1000).toLocaleTimeString() : '—';
    const timeLimit = s.time_limit_mins;
    const timerHtml = timeLimit > 0
      ? `<span class="badge b-y" data-timer="${escHtml(s.username||'')}">—</span>`
      : `<span style="color:var(--muted);font-size:11px">${expiry}</span>`;
    const initials = (s.username||'?').slice(0,2).toUpperCase();
    h+=`<tr>
      <td style="text-align:center;color:var(--muted);font-size:11px">${i+1}</td>
      <td><div class="session-user">
        <div class="sess-avatar">${initials}</div>
        <div><strong>${escHtml(s.username||'?')}</strong><div class="flex" style="gap:4px;margin-top:2px"><span class="sess-active-dot"></span><span style="font-size:10px;color:var(--muted)">online</span></div></div>
      </div></td>
      <td style="font-family:'DM Mono',monospace;font-size:10px;overflow:hidden;text-overflow:ellipsis">${escHtml(s.ip_address||'?')}</td>
      <td style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text2)">${escHtml((s.current_page||'—').slice(0,30))}</td>
      <td style="font-size:11px;color:var(--text2)">${fmtAge(s.created_at)}</td>
      <td style="font-size:11px;color:var(--text2)">${fmtAge(s.last_activity)}</td>
      <td style="font-size:11px">${timerHtml}</td>
      <td style="text-align:center"><button class="btn btn-danger btn-xs" onclick="killSession('${escHtml(tokenId)}','${escHtml(s.username||'')}')">Kill</button></td>
    </tr>`;
    if (timeLimit > 0 && s.created_at) {
      const endsAt = (s.created_at + timeLimit * 60) * 1000;
      startSessionTimerDisplay(s.username, endsAt);
    }
  });
  el.innerHTML=h+'</tbody></table>';
}

function renderSessionHistory(sessions, tableId) {
  const el = document.getElementById(tableId); if(!el) return;
  if (!sessions.length) { el.innerHTML='<div class="empty" style="padding:28px;text-align:center">No session history yet</div>'; return; }
  let h=`<table class="session-table session-history-table"><thead><tr>
    <th style="width:36px;text-align:center">#</th>
    <th>User</th>
    <th>IP Address</th>
    <th>Login</th>
    <th>Logout</th>
    <th>Reason</th>
  </tr></thead><tbody>`;
  sessions.slice(0,100).forEach((s,i)=>{
    const initials = (s.username||'?').slice(0,2).toUpperCase();
    const statusBadge = s.logout_at
      ? `<span style="font-size:11px;color:var(--text2)">${fmtTs(s.logout_at)}</span>`
      : `<span class="badge b-g" style="font-size:9px">Active</span>`;
    const reason = s.logout_reason||'—';
    const reasonColor = reason==='expired'?'var(--warning)':reason==='killed'?'var(--danger)':'var(--muted)';
    h+=`<tr>
      <td style="text-align:center;color:var(--muted);font-size:11px">${i+1}</td>
      <td><div class="session-user">
        <div class="sess-avatar" style="width:24px;height:24px;font-size:9px">${initials}</div>
        <strong>${escHtml(s.username||'?')}</strong>
      </div></td>
      <td style="font-family:'DM Mono',monospace;font-size:10px">${escHtml(s.ip_address||'?')}</td>
      <td style="font-size:11px;color:var(--text2)">${fmtTs(s.created_at)}</td>
      <td style="font-size:11px">${statusBadge}</td>
      <td><span style="font-size:11px;color:${reasonColor};font-weight:600">${escHtml(reason)}</span></td>
    </tr>`;
  });
  el.innerHTML=h+'</tbody></table>';
}

async function killSession(tokenHash, username) {
  const who = username ? `<strong>${escHtml(username)}</strong>` : 'this session';
  showAdminModal({ title:'Kill Session', body:`Force-terminate ${who}? They will be immediately logged out.`, icon:'warn', confirmText:'Kill Session', cancelText:'Cancel', dangerous:true,
    onConfirm: async() => {
      let d = {ok:false};
      // Try token-based kill first
      if (tokenHash) d = await api('POST',`/api/admin/sessions/${encodeURIComponent(tokenHash)}/kill`);
      // Fallback: force_logout via user action (works even without token)
      if (!d.ok && username) d = await api('POST',`/api/admin/users/${encodeURIComponent(username)}/action`,{action:'force_logout'});
      if (d.ok) {
        toast('Session killed — user logged out','success');
        if (username) await api('POST',`/api/admin/users/${encodeURIComponent(username)}/notify`,{msg:'Your session was terminated by an administrator.',type:'force_logout'});
      } else toast(d.msg||'Kill failed','error');
      setTimeout(()=>{loadSessions();loadLiveFeed();},500);
    }
  });
}

// ── Audit log ─────────────────────────────────────────────────────────────────
async function loadAudit() {
  const sev   = document.getElementById('audit-severity')?.value||'';
  const actor = document.getElementById('audit-actor')?.value||'';
  const d = await api('GET',`/api/admin/audit?limit=200${sev?'&severity='+sev:''}${actor?'&actor='+encodeURIComponent(actor):''}`);
  if (!d.ok) return;
  renderAuditTable(d.logs||[],'audit-table');
}

function humanizeAuditDetails(action, details) {
  // Strip verbose prefixes like email=, role=, target=, changes={...}
  if (!details) return '—';
  const d = details;
  // Common patterns -> human readable
  const targetM = d.match(/target=([\w@.+-]+)/);
  const emailM  = d.match(/email=([\w@.+-]+)/);
  const roleM   = d.match(/role=([\w]+)/);
  const keyM    = d.match(/key=([\w_]+)/);
  const pageM   = d.match(/page=([\w/_-]+)/);
  const changesM= d.match(/changes=\{([^}]+)\}/);
  const sessionM= d.match(/session=([\w.]+)/);

  if (action === 'force_logout' && targetM) return `Forced logout of ${targetM[1]}`;
  if (action === 'user_locked'  && targetM) return `Locked account: ${targetM[1]}`;
  if (action === 'user_unlocked'&& targetM) return `Unlocked account: ${targetM[1]}`;
  if (action === 'user_updated' && targetM && changesM) return `Updated ${targetM[1]}: ${changesM[1].replace(/['"{}]/g,'')}`;
  if (action === 'user_updated' && targetM) return `Updated ${targetM[1]}`;
  if (action === 'login_success'&& emailM)  return `${emailM[1]}${roleM?' ('+roleM[1]+')':''}`;
  if (action === 'login_failed' && emailM)  return `Failed: ${emailM[1]}`;
  if (action === 'logout'       && emailM)  return `${emailM[1]}`;
  if (action === 'config_updated'&& keyM)   return `Changed: ${keyM[1].replace(/_/g,' ')}`;
  if (action === 'feedback_submitted' && emailM) return `From ${emailM[1]}${pageM?' on '+pageM[1]:''}`;
  if (action === 'session_killed' && sessionM) return `Session ended${targetM?' for '+targetM[1]:''}`;
  if (action === 'user_deleted' && targetM) return `Deleted: ${targetM[1]}`;
  if (action === 'announcement_deleted') {
    const txt = d.replace(/^text=/,'').slice(0,50);
    return `Removed: "${txt}"`;
  }
  // Generic: strip key=value format
  return d.replace(/[a-z_]+=(?=[\s,{]|$)/g,'').replace(/[{}'"]/g,'').trim().slice(0,60) || action;
}

function renderAuditTable(logs, tableId) {
  const el = document.getElementById(tableId); if(!el) return;
  if (!logs.length) { el.innerHTML='<div class="empty">No log entries</div>'; return; }
  const sevColor = {info:'b-b',warn:'b-y',critical:'b-r'};
  let h=`<table style="width:100%"><thead><tr><th style="width:36px">#</th><th style="width:130px">Time</th><th style="width:80px;text-align:center">Level</th><th style="width:130px">Actor</th><th style="width:130px">Action</th><th>Details</th><th style="width:80px">IP</th></tr></thead><tbody>`;
  logs.forEach((l,i)=>{
    const sev=l.severity||'info';
    const actorShort = (l.actor||'system').replace(/@.*$/,'…');
    const friendly = humanizeAuditDetails(l.action||'', l.details||'—');
    const actionLabel = (l.action||'—').replace(/_/g,' ');
    h+=`<tr>
      <td style="text-align:center;color:var(--muted)">${i+1}</td>
      <td style="font-variant-numeric:tabular-nums;font-size:11px;white-space:nowrap">${fmtTs(l.timestamp)}</td>
      <td style="text-align:center"><span class="badge ${sevColor[sev]||'b-b'}">${escHtml(sev.toUpperCase())}</span></td>
      <td class="fw7" style="font-size:11px" title="${escHtml(l.actor||'')}">${escHtml(actorShort)}</td>
      <td style="font-size:11px;color:var(--text2)">${escHtml(actionLabel)}</td>
      <td style="font-size:12px" title="${escHtml(l.details||'')}">${escHtml(friendly)}</td>
      <td style="font-family:'DM Mono',monospace;font-size:10px">${escHtml(l.ip_address||'—')}</td>
    </tr>`;
  });
  el.innerHTML=h+'</tbody></table>';
}

// ── Experiments ───────────────────────────────────────────────────────────────
async function loadExperiments() {
  const user = document.getElementById('exp-user')?.value||'';
  const algo = document.getElementById('exp-algo')?.value||'';
  const d = await api('GET',`/api/admin/experiments?page=${A.expPage}&limit=100${user?'&user='+encodeURIComponent(user):''}${algo?'&algo='+encodeURIComponent(algo):''}`);
  if (!d.ok) return;
  const el = document.getElementById('exp-table');
  if (!d.experiments?.length) { el.innerHTML='<div class="empty">No experiments found</div>'; return; }
  let h=`<table><thead><tr><th>#</th><th>User</th><th>Algorithm</th><th>Type</th><th>Dataset</th><th>Key Metric</th><th>Time</th></tr></thead><tbody>`;
  d.experiments.forEach((e,i)=>{
    const m=e.metrics||{};
    const met=m.accuracy!=null?`Acc: ${(m.accuracy*100).toFixed(1)}%`:m.r2!=null?`R²: ${m.r2.toFixed(3)}`:m.inertia!=null?`Inertia: ${m.inertia.toFixed(1)}`:'—';
    h+=`<tr>
      <td style="text-align:center;color:var(--muted)">${(A.expPage-1)*100+i+1}</td>
      <td class="fw7">${escHtml(e.username||'?')}</td>
      <td>${escHtml(e.algo||'?')}</td>
      <td style="text-align:center"><span class="badge b-p">${escHtml(e.algo_type||'?')}</span></td>
      <td>${escHtml(e.dataset||'?')}</td>
      <td style="text-align:center"><span class="badge b-g">${escHtml(met)}</span></td>
      <td style="font-size:11px">${fmtTs(e.ts)}</td>
    </tr>`;
  });
  el.innerHTML=h+'</tbody></table>';
  // Score distribution chart
  if (d.score_distribution) {
    const sd = d.score_distribution;
    Plotly.newPlot('score-dist-chart',[{type:'bar',x:Object.keys(sd),y:Object.values(sd),marker:{color:'#7c5cfc',opacity:.85}}],
      ploAdmin('Score Distribution',200),{responsive:true,displayModeBar:false});
  }
  // Experiments over time chart
  if (d.experiments_over_time) {
    const ot = d.experiments_over_time;
    Plotly.newPlot('exp-time-chart',[{type:'scatter',mode:'lines+markers',x:Object.keys(ot),y:Object.values(ot),line:{color:'#00e5a0',width:2},marker:{size:5}}],
      ploAdmin('Experiments Over Time',200),{responsive:true,displayModeBar:false});
  }
  // Pagination
  const total=d.total||0, pages=Math.ceil(total/100);
  const pgEl=document.getElementById('exp-pagination'); pgEl.innerHTML='';
  for(let p=1;p<=Math.min(pages,10);p++){const b=document.createElement('button');b.className=`pg-btn${p===A.expPage?' active':''}`;b.textContent=p;b.onclick=()=>{A.expPage=p;loadExperiments();};pgEl.appendChild(b);}
}

// ── Security ─────────────────────────────────────────────────────────────────
async function loadSecurity() {
  // Failed logins from audit log
  const d = await api('GET', '/api/admin/audit?action=login_failed&limit=50');
  if (d.ok) {
    const logs = (d.logs || []).filter(l => l.action === 'login_failed');
    if (!logs.length) {
      document.getElementById('sec-failed-table').innerHTML = '<div class="empty">No failed logins recorded</div>';
    } else {
      let h = `<table><thead><tr><th>Time</th><th>Actor / Email</th><th>IP</th><th>Details</th></tr></thead><tbody>`;
      logs.forEach(l => {
        h += `<tr>
          <td style="font-size:11px;white-space:nowrap">${fmtTs(l.timestamp)}</td>
          <td class="fw7">${escHtml(l.actor||'—')}</td>
          <td style="font-family:'DM Mono',monospace;font-size:10px">${escHtml(l.ip_address||'—')}</td>
          <td style="font-size:11px">${escHtml((l.details||'').slice(0,60))}</td>
        </tr>`;
      });
      document.getElementById('sec-failed-table').innerHTML = h + '</tbody></table>';
    }
  }

  // All locked accounts (both auto-locked and admin-locked)
  const dL = await api('GET', '/api/admin/users?limit=200');
  if (dL.ok) {
    const locked = (dL.users || []).filter(u => u.is_locked);
    const el = document.getElementById('sec-locked-table');
    const badge = document.getElementById('locked-count');
    if (!locked.length) {
      el.innerHTML = '<div class="empty">No locked accounts</div>';
      if (badge) badge.style.display = 'none';
    } else {
      if (badge) { badge.textContent = `${locked.length} locked`; badge.style.display = ''; }
      let h = `<table><thead><tr><th>Username</th><th>Email</th><th>Failed Attempts</th><th>Locked Since</th><th>Action</th></tr></thead><tbody>`;
      locked.forEach(u => {
        const since = u.locked_until ? fmtTs(u.locked_until) : (u.locked_at ? fmtTs(u.locked_at) : '—');
        h += `<tr>
          <td class="fw7" style="color:var(--danger)">${escHtml(u.username)}</td>
          <td style="font-size:11px">${escHtml(u.email||'—')}</td>
          <td style="text-align:center">${u.failed_attempts||0}</td>
          <td style="font-size:11px">${since}</td>
          <td>
            <button class="btn btn-success btn-xs" onclick="doUserAction('${escHtml(u.username)}','unlock')">
              Unlock
            </button>
          </td>
        </tr>`;
      });
      el.innerHTML = h + '</tbody></table>';
    }
  }

  // Rate limit events
  const dR = await api('GET', '/api/admin/audit?action=rate_limit&limit=30');
  if (dR.ok) renderAuditTable(dR.logs || [], 'sec-ratelimit-table');
}

// ── Config ────────────────────────────────────────────────────────────────────
async function loadConfig() {
  const d = await api('GET','/api/admin/config');
  if (!d.ok) return;
  A.cfg = d.config;
  const theme = d.config.theme||{};
  // Color fields with live preview swatches
  const colorFields=[['primary','Primary'],['secondary','Secondary'],['accent','Accent'],['success','Success'],['warning','Warning'],['danger','Danger']];
  document.getElementById('color-fields').innerHTML = colorFields.map(([k,lbl])=>`
    <div class="config-field">
      <label>${lbl}</label>
      <div class="color-row">
        <input type="color" id="col-${k}" value="${theme[k]||'#7c5cfc'}" oninput="syncColor('${k}')">
        <input type="text" id="colt-${k}" value="${theme[k]||'#7c5cfc'}" style="flex:1;font-family:monospace" oninput="syncColorText('${k}')">
      </div>
    </div>`).join('');

  const dtEl=document.getElementById('cfg-default-theme'); if(dtEl) dtEl.value=theme.default_theme||'dark';
  const fEl=document.getElementById('cfg-font'); if(fEl) fEl.value=theme.font||'DM Sans';
  const rEl=document.getElementById('cfg-radius'); if(rEl) rEl.value=theme.border_radius||'12';
  updateThemePreview();
  renderThemePresets();

  // Contact
  const contact=d.config.contact||{};
  const ceEl=document.getElementById('contact-admin-feedback-email'); if(ceEl) ceEl.value=contact.admin_feedback_email||'';
  setToggle('contact-feedback-mail-enabled', contact.feedback_mail_enabled!==false);

  // Limits — now with per-user time limit section
  const limits=d.config.limits||{};
  const limitFields=[['max_file_mb','Max File MB'],['max_train_rows','Max Train Rows'],['cv_folds_default','CV Folds Default'],['max_clusters','Max Clusters'],['preview_rows','Preview Rows']];
  document.getElementById('limits-fields').innerHTML = limitFields.map(([k,lbl])=>`
    <div class="config-field"><label>${lbl}</label><input type="number" id="lim-${k}" value="${limits[k]??''}"></div>`).join('');

  // Algorithm toggles
  const features=d.config.features||{};
  const enabled=new Set(features.algorithms_enabled||[]);
  const ALL_ALGOS=['Logistic Regression','Decision Tree','Random Forest','KNN','Naive Bayes','SVM (RBF)','SVM (Linear)','Gradient Boosting','AdaBoost','Extra Trees','Linear Discriminant Analysis','Ridge Classifier','Bagging Classifier','Passive Aggressive','SGD Classifier','XGBoost','LightGBM','MLP Classifier','Linear Regression','Ridge','Lasso','ElasticNet','SVR','Huber','BayesianRidge','ARD Regression','XGBoost Regressor','LightGBM Regressor','MLP Regressor','K-Means','Hierarchical','DBSCAN','Gaussian Mixture','Spectral Clustering','Mini-Batch K-Means','OPTICS','Birch','MeanShift','Affinity Propagation','FP-Growth (Assoc)','Apriori (Assoc)','PCA','t-SNE','Truncated SVD','Kernel PCA','UMAP','FastICA','NMF','ISOMAP','MDS','Isolation Forest','Local Outlier Factor','One-Class SVM','Elliptic Envelope','Label Propagation','Label Spreading','Self-Training','Q-Learning Demo','SARSA Demo'];
  document.getElementById('algo-toggles').innerHTML = ALL_ALGOS.map(a=>`<div class="algo-toggle-item${enabled.has(a)?'':' off'}" onclick="this.classList.toggle('off')">${escHtml(a)}</div>`).join('');
  setToggle('feat-whatif',  features.whatif_enabled!==false);
  setToggle('feat-arena',   features.arena_enabled!==false);
  setToggle('feat-viz',     features.visualizer_enabled!==false);
  setToggle('feat-reg',     d.config.registration_open!==false);
  setToggle('feat-maint',   !!d.config.maintenance_mode);
}

// ── Theme presets & reset ─────────────────────────────────────────────────────
const THEME_PRESETS = {
  'Default Purple': { primary:'#7c5cfc', secondary:'#e040fb', accent:'#00d4ff', success:'#00e5a0', warning:'#ffb700', danger:'#ff4757' },
  'Ocean Blue':     { primary:'#2979ff', secondary:'#00bcd4', accent:'#00e5ff', success:'#00e676', warning:'#ffd600', danger:'#ff1744' },
  'Emerald Forest': { primary:'#00c853', secondary:'#1de9b6', accent:'#69f0ae', success:'#b9f6ca', warning:'#ffe57f', danger:'#ff6d00' },
  'Sunset Glow':    { primary:'#ff6b35', secondary:'#f7c59f', accent:'#fffbfe', success:'#06d6a0', warning:'#ffd166', danger:'#ef476f' },
  'Deep Slate':     { primary:'#5c6bc0', secondary:'#7e57c2', accent:'#80cbc4', success:'#26a69a', warning:'#ffa726', danger:'#ef5350' },
  'Rose Gold':      { primary:'#e91e8c', secondary:'#9c27b0', accent:'#ff80ab', success:'#00e676', warning:'#ffea00', danger:'#ff1744' },
  'Arctic Ice':     { primary:'#00b4d8', secondary:'#0077b6', accent:'#90e0ef', success:'#52b788', warning:'#f4a261', danger:'#e63946' },
  'Neon Cyber':     { primary:'#39ff14', secondary:'#ff2079', accent:'#fff01f', success:'#00ff9f', warning:'#ff6700', danger:'#ff0080' },
  'Midnight Gold':  { primary:'#ffd700', secondary:'#ff8c00', accent:'#fffacd', success:'#98fb98', warning:'#ffa500', danger:'#ff4500' },
  'Soft Pastel':    { primary:'#a78bfa', secondary:'#f9a8d4', accent:'#7dd3fc', success:'#86efac', warning:'#fde68a', danger:'#fca5a5' },
};
const THEME_DEFAULTS = { primary:'#7c5cfc', secondary:'#e040fb', accent:'#00d4ff', success:'#00e5a0', warning:'#ffb700', danger:'#ff4757' };

function renderThemePresets() {
  const wrap = document.getElementById('theme-presets-wrap');
  if (!wrap) return;
  wrap.innerHTML = Object.entries(THEME_PRESETS).map(([name, colors]) =>
    `<button class="btn btn-ghost btn-xs" style="font-size:10px;display:flex;align-items:center;gap:4px;margin:2px;padding:4px 10px;border-radius:8px;transition:all .2s" onclick="applyThemePreset('${name}')" title="${name}">
      <span style="display:inline-flex;gap:2px">${Object.values(colors).slice(0,4).map(c=>`<span style="width:10px;height:10px;border-radius:50%;background:${c};display:inline-block;box-shadow:0 0 4px ${c}40"></span>`).join('')}</span>
      <span style="font-size:10px">${name}</span>
    </button>`
  ).join('');
}

function applyThemePreset(name) {
  const colors = THEME_PRESETS[name];
  if (!colors) return;
  Object.entries(colors).forEach(([k,v]) => {
    const c = document.getElementById(`col-${k}`); if(c) c.value = v;
    const t = document.getElementById(`colt-${k}`); if(t) t.value = v;
  });
  updateThemePreview();
  // Apply CSS vars IMMEDIATELY so admin sees live preview
  const cssVarMap={primary:'--primary',secondary:'--second',accent:'--accent',success:'--success',warning:'--warning',danger:'--danger'};
  const savedVars={};
  Object.entries(cssVarMap).forEach(([k,v])=>{ if(colors[k]){document.documentElement.style.setProperty(v,colors[k]);savedVars[v]=colors[k];} });
  // Save so user dashboard ALSO picks up new theme
  localStorage.setItem('ml_theme_vars', JSON.stringify(savedVars));
  toast(`Preset "${name}" applied — click Save to persist to server`, 'info', 3500);
}

function resetThemeDefaults() {
  showAdminModal({
    title: 'Reset Theme',
    body: 'Reset all colours to the default Modelora theme?',
    icon: 'warn', confirmText: 'Reset', cancelText: 'Cancel',
    onConfirm: () => {
      applyThemePreset('Default Purple');
      toast('Theme reset to defaults', 'success');
    }
  });
}

function syncColor(k) {
  const v = document.getElementById(`col-${k}`)?.value;
  const t = document.getElementById(`colt-${k}`); if(t) t.value=v;
  updateThemePreview();
}
function syncColorText(k) {
  const v = document.getElementById(`colt-${k}`)?.value;
  const c = document.getElementById(`col-${k}`); if(c && /^#[0-9a-f]{6}$/i.test(v)) c.value=v;
  updateThemePreview();
}
function updateThemePreview() {
  const p = document.getElementById('col-primary')?.value||'#7c5cfc';
  const s = document.getElementById('col-secondary')?.value||'#e040fb';
  const a = document.getElementById('col-accent')?.value||'#00d4ff';
  const pr = document.getElementById('theme-preview'); if(!pr) return;
  pr.style.cssText = `--pv:${p};--sv:${s};--av:${a};padding:12px;border-radius:10px;background:var(--card);border:1px solid var(--border)`;
  pr.innerHTML = `<div style="font-size:11px;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.08em">Live Preview</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <div style="padding:6px 14px;border-radius:8px;background:${p};color:#fff;font-size:12px;font-weight:700">Primary</div>
      <div style="padding:6px 14px;border-radius:8px;background:${s};color:#fff;font-size:12px;font-weight:700">Secondary</div>
      <div style="padding:6px 14px;border-radius:8px;background:${a};color:#000;font-size:12px;font-weight:700">Accent</div>
      <div style="padding:6px 14px;border-radius:8px;border:1px solid ${p};color:${p};font-size:12px;font-weight:700">Outline</div>
    </div>
    <div style="height:4px;border-radius:2px;background:linear-gradient(90deg,${p},${s},${a});margin-top:10px"></div>`;
}

function setToggle(id, on) { const el=document.getElementById(id); if(el) el.className='toggle'+(on?' on':''); }
function isOn(id) { return document.getElementById(id)?.classList.contains('on'); }

async function saveConfig(key) {
  let value = {};
  if (key==='contact') {
    value = { admin_feedback_email:document.getElementById('contact-admin-feedback-email')?.value.trim()||'', feedback_mail_enabled:isOn('contact-feedback-mail-enabled') };
  } else if (key==='theme') {
    const t=A.cfg.theme||{};
    ['primary','secondary','accent','success','warning','danger'].forEach(k=>{ value[k]=document.getElementById(`col-${k}`)?.value||t[k]; });
    value.default_theme=document.getElementById('cfg-default-theme')?.value||'dark';
    value.font=document.getElementById('cfg-font')?.value||'DM Sans';
    value.border_radius=document.getElementById('cfg-radius')?.value||'12';
    value.bg_dark=t.bg_dark||'#000000'; value.bg_light=t.bg_light||'#f0f4ff';
    value.card_dark=t.card_dark||'#0a1020'; value.card_light=t.card_light||'#ffffff';
    // Apply CSS vars live so admin sees instant effect
    const cssVarMap={primary:'--primary',secondary:'--second',accent:'--accent',success:'--success',warning:'--warning',danger:'--danger'};
    const savedVars={};
    Object.entries(cssVarMap).forEach(([k,v])=>{ if(value[k]){document.documentElement.style.setProperty(v,value[k]);savedVars[v]=value[k];} });
    const rad=(value.border_radius||'12')+('px');
    document.documentElement.style.setProperty('--radius',rad); savedVars['--radius']=rad;
    // Persist so user dashboard picks up the new theme too
    localStorage.setItem('ml_theme_vars', JSON.stringify(savedVars));
    if (value.default_theme) applyTheme(value.default_theme);
  } else if (key==='limits') {
    ['max_file_mb','max_train_rows','cv_folds_default','max_clusters','preview_rows'].forEach(k=>{const el=document.getElementById(`lim-${k}`);if(el)value[k]=parseInt(el.value)||0;});
  } else if (key==='features') {
    const enabled=[]; document.querySelectorAll('.algo-toggle-item:not(.off)').forEach(el=>enabled.push(el.textContent.trim()));
    value = { algorithms_enabled:enabled, whatif_enabled:isOn('feat-whatif'), arena_enabled:isOn('feat-arena'), visualizer_enabled:isOn('feat-viz'), charts_enabled:(A.cfg.features||{}).charts_enabled||[], upload_formats:(A.cfg.features||{}).upload_formats||[] };
    await api('POST','/api/admin/config',{key:'registration_open',value:isOn('feat-reg')});
    await api('POST','/api/admin/config',{key:'maintenance_mode',value:isOn('feat-maint')});
  }
  const d = await api('POST','/api/admin/config',{key,value});
  d.ok ? toast(`${key} saved`,'success') : toast(d.msg||'Failed','error');
}

// ── Announcements ─────────────────────────────────────────────────────────────
// In-memory history log (augmented from API data)
const _annHistory = [];

async function loadAnnouncements() {
  const d = await api('GET','/api/announcements');
  if (!d.ok) return;
  const el=document.getElementById('ann-list'); if(!el) return;

  // Also load users to show time limit entries inline
  const ud = await api('GET','/api/admin/users');
  const usersWithLimit = (ud.ok && ud.users) ? ud.users.filter(u => (u.time_limit||0) > 0) : [];

  const ann=d.announcements||[];

  let html = '';

  // Time limit section at the top
  if (usersWithLimit.length > 0) {
    html += `<div style="margin-bottom:12px">
      <div class="sess-section-title">Session Time Limits</div>
      ${usersWithLimit.map(u=>`
        <div class="announce-item warning" style="align-items:center;gap:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:160px">
            <strong style="color:var(--text)">${escHtml(u.username)}</strong>
            <span style="color:var(--muted);font-size:11px"> — current limit: <strong style="color:var(--warning)">${u.time_limit} min</strong></span>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
            <input type="number" id="ann-tl-${escHtml(u.username)}" value="${u.time_limit}" min="1" max="1440"
              style="width:64px;padding:4px 7px;font-size:12px;border-radius:6px;border:1px solid var(--border);background:var(--bg2);color:var(--text)">
            <span style="font-size:10px;color:var(--muted)">min</span>
            <button class="btn btn-primary btn-xs" onclick="updateAnnTimeLimit('${escHtml(u.username)}')">Update</button>
            <button class="btn btn-danger btn-xs" onclick="removeAnnTimeLimit('${escHtml(u.username)}')">Remove</button>
          </div>
        </div>`).join('')}
    </div>`;
  }

  // Regular announcements
  if (ann.length) {
    html += `<div class="sess-section-title" style="${usersWithLimit.length?'':'display:none'}">Announcements</div>`;
    html += ann.map((a,i)=>`
      <div class="announce-item ${escHtml(a.type||'info')}" id="ann-item-${i}">
        <span style="flex:1;color:var(--text);font-weight:600">${escHtml(a.text||a.message||'')}</span>
        <span class="fs-xs text-m">${fmtAge(a.created_at)}</span>
        <button class="btn btn-danger btn-xs" onclick="dismissAnnouncement(${i},this)">Delete</button>
      </div>`).join('');
  }

  if (!usersWithLimit.length && !ann.length) {
    html = '<div class="empty">No active announcements</div>';
  }

  el.innerHTML = html;
}

async function updateAnnTimeLimit(username) {
  const inp = document.getElementById(`ann-tl-${username}`);
  const mins = parseInt(inp?.value||0);
  if (!mins || mins < 1) { toast('Enter a valid number of minutes','error'); return; }
  const d = await api('POST', `/api/admin/users/${encodeURIComponent(username)}/time_limit`, { minutes: mins });
  if (d.ok) {
    toast(`Time limit updated to ${mins} min for ${username}`, 'success');
    await api('POST', '/api/admin/announce', { msg: `Session time limit updated to ${mins} minutes for user: ${username}.`, type: 'warning' });
    loadAnnouncements();
    loadUsers();
  } else toast(d.msg||'Failed','error');
}

async function removeAnnTimeLimit(username) {
  const d = await api('POST', `/api/admin/users/${encodeURIComponent(username)}/time_limit`, { minutes: 0 });
  if (d.ok) {
    toast(`Time limit removed for ${username}`, 'success');
    await api('POST', '/api/admin/announce', { msg: `Session time limit removed for user: ${username} (now unlimited).`, type: 'info' });
    loadAnnouncements();
    loadUsers();
  } else toast(d.msg||'Failed','error');
}

async function loadAnnouncementHistory() {
  const el = document.getElementById('ann-history-table'); if (!el) return;
  // Fetch from audit log for announcement events
  const d = await api('GET', '/api/admin/audit?limit=200');
  const histItems = (d.logs||[]).filter(l => l.action === 'announcement_deleted' || l.action === 'announcement_sent');
  // Also get current active
  const d2 = await api('GET', '/api/announcements');
  const active = d2.announcements || [];
  
  let rows = active.map(a => ({ text: a.text||a.message||'', type: a.type||'info', ts: a.created_at, status: 'active' }));
  histItems.forEach(l => {
    const txt = (l.details||'').replace(/^text=/, '').replace(/…$/, '');
    rows.push({ text: txt, type: 'info', ts: l.timestamp, status: l.action === 'announcement_deleted' ? 'deleted' : 'sent' });
  });
  rows.sort((a,b) => (b.ts||0) - (a.ts||0));
  
  if (!rows.length) { el.innerHTML = '<div class="empty">No announcement history</div>'; return; }
  let h = `<table style="width:100%;table-layout:fixed"><thead><tr>
    <th style="width:55%">Message</th>
    <th style="width:15%;text-align:center">Type</th>
    <th style="width:15%;text-align:center">Status</th>
    <th style="width:15%;text-align:right">Time</th>
  </tr></thead><tbody>`;
  rows.slice(0,50).forEach(r => {
    const statusCls = r.status === 'active' ? 'b-g' : r.status === 'deleted' ? 'b-r' : 'b-b';
    h += `<tr>
      <td style="text-align:left;max-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(r.text||'—')}</td>
      <td style="text-align:center"><span class="badge b-b">${escHtml(r.type)}</span></td>
      <td style="text-align:center"><span class="badge ${statusCls}">${escHtml(r.status)}</span></td>
      <td style="text-align:right;font-size:11px;color:var(--muted)">${fmtAge(r.ts)}</td>
    </tr>`;
  });
  el.innerHTML = h + '</tbody></table>';
}

async function sendAnnouncement() {
  const text=document.getElementById('ann-text')?.value.trim();
  const atype=document.getElementById('ann-type')?.value||'info';
  if (!text) { toast('Enter announcement text','warning'); return; }
  const d=await api('POST','/api/admin/announce',{text,type:atype});
  if (d.ok) {
    toast('Announcement sent','success');
    document.getElementById('ann-text').value='';
    loadAnnouncements();
    loadAnnouncementHistory();
    // Also show it as a popup on admin side
    showAdminAnnouncementPopup(text, atype);
  }
  else toast(d.msg||'Failed','error');
}

function showAdminAnnouncementPopup(text, type) {
  const wrap = document.getElementById('announce-popup-wrap');
  if (!wrap) return;
  const icons = { info: 'i', warn: '!', danger: '!', success: 'OK' };
  const el = document.createElement('div');
  el.className = `announce-popup ${type}`;
  el.innerHTML = `
    <div class="announce-popup-icon">${icons[type]||'i'}</div>
    <div class="announce-popup-text">
      <div class="announce-popup-msg">${escHtml(text)}</div>
      <div class="announce-popup-meta">Sent to all users just now</div>
    </div>
    <button class="announce-popup-close" onclick="this.parentNode.remove()">×</button>`;
  wrap.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, 7000);
}

async function dismissAnnouncement(idx, btn) {
  if (btn) btn.disabled = true;
  const d = await api('DELETE', `/api/admin/announce/${idx}`);
  if (d.ok) {
    toast('Announcement removed', 'success');
    loadAnnouncements();
    loadAnnouncementHistory();
  } else {
    toast(d.msg||'Failed to delete', 'error');
    if (btn) btn.disabled = false;
  }
}

// ── Live feed ─────────────────────────────────────────────────────────────────
const _feedSeen = {}; // deduplicate by (actor+action+ts) per container
function renderFeed(items, containerId, limit=10) {
  const el=document.getElementById(containerId); if(!el) return;
  // Deduplicate: use timestamp+actor+action as unique key
  const seen = _feedSeen[containerId] || new Set();
  const unique = [];
  for (const l of (items||[])) {
    const key = `${l.actor}|${l.action}|${Math.floor(l.timestamp||0)}`;
    if (!seen.has(key)) { unique.push(l); if (unique.length >= limit) break; }
  }
  // Keep seen set from growing unboundedly
  if (seen.size > 500) seen.clear();
  unique.forEach(l => seen.add(`${l.actor}|${l.action}|${Math.floor(l.timestamp||0)}`));
  _feedSeen[containerId] = seen;

  const actionLabel = a => (a||'—').replace(/_/g,' ');
  el.innerHTML=unique.slice(0,limit).map(l=>`
    <div class="feed-item">
      <div class="feed-dot ${l.severity||'info'}"></div>
      <div class="feed-text"><strong>${escHtml((l.actor||'system').replace(/@.*$/,''))}</strong> — ${escHtml(actionLabel(l.action))}${l.details?` <span style="color:var(--muted);font-size:11px">${escHtml(humanizeAuditDetails(l.action,l.details))}</span>`:''}
      </div>
      <div class="feed-time">${fmtAge(l.timestamp)}</div>
    </div>`).join('')||'<div class="empty">No events</div>';
}

// ── Feedback ─────────────────────────────────────────────────────────────────
async function loadFeedback() {
  const box=document.getElementById('feedback-list'); if(!box) return;
  box.innerHTML='<div class="empty">Loading…</div>';
  const d=await api('GET','/api/admin/feedback');
  if (!d.ok) { box.innerHTML=`<div class="empty" style="color:var(--danger)">Unable to load: ${escHtml(d.msg||'error')}</div>`; return; }
  const rows=d.feedback||[];
  if (!rows.length) { box.innerHTML='<div class="empty">No feedback yet.</div>'; return; }
  box.innerHTML=rows.map((item,i)=>`
    <div class="fb-item" style="animation-delay:${i*.04}s">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
        <div>
          <div class="fb-from">${escHtml(item.user_email||'Unknown')}</div>
          <div style="font-weight:700;color:var(--text);margin-top:2px">${escHtml(item.subject||'Feedback')}</div>
          <div class="fb-meta">${escHtml(item.page||'dashboard')} · ${item.ip?'IP: '+escHtml(item.ip):''}</div>
        </div>
        <div class="fs-xs" style="color:var(--muted);white-space:nowrap">${item.timestamp?new Date(item.timestamp*1000).toLocaleString():'—'}</div>
      </div>
      <div class="fb-msg" style="margin-top:8px;white-space:pre-wrap;line-height:1.6">${escHtml(item.message||'')}</div>
    </div>`).join('');
}

// ── Export ────────────────────────────────────────────────────────────────────
function exportResource(type) {
  fetch(`/api/admin/export/${type}`,{headers:{'Authorization':`Bearer ${A.token}`}})
    .then(r=>r.ok?r.blob():null).then(b=>{
      if(!b){toast('Export failed','error');return;}
      const u=URL.createObjectURL(b),a=document.createElement('a');
      a.href=u;a.download=`admin_${type}_${Date.now()}.csv`;a.click();URL.revokeObjectURL(u);
      toast(`${type} exported`,'success');
    });
}

function ploAdmin(title, h=250) {
  const dark=document.documentElement.getAttribute('data-theme')!=='light';
  const tc=dark?'#a8b8d8':'#364070', gc=dark?'#1a2a40':'#c8d4f0';
  return { title:title?{text:title,font:{color:tc,size:12},x:0}:undefined, height:h, paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)', font:{color:tc,family:'DM Sans,sans-serif',size:11}, margin:{l:48,r:16,t:title?32:8,b:42}, xaxis:{gridcolor:gc,zerolinecolor:gc,color:tc}, yaxis:{gridcolor:gc,zerolinecolor:gc,color:tc} };
}

function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};}

async function setTimeLimitFromConfig() {
  const username = document.getElementById('tl-username')?.value.trim();
  const minutes  = parseInt(document.getElementById('tl-minutes')?.value||0);
  if (!username) { toast('Enter a username','warning'); return; }
  const d = await api('POST', `/api/admin/users/${encodeURIComponent(username)}/time_limit`, { minutes });
  if (d.ok) {
    toast(`Time limit set: ${minutes} min for ${username}`, 'success');
    // Activate timer display: fetch user sessions to get start time
    const sd = await api('GET', '/api/admin/sessions');
    const sess = (sd.active||[]).find(s => s.username === username);
    if (sess && minutes > 0) {
      const endsAt = (sess.created_at + minutes * 60) * 1000;
      startSessionTimerDisplay(username, endsAt);
      // Push notification to user
      const remaining = Math.max(0, endsAt - Date.now());
      await api('POST', `/api/admin/users/${encodeURIComponent(username)}/notify`, {
        msg: `Your session is limited to ${minutes} minutes. Auto-logout in ${Math.ceil(remaining/60000)} minute(s).`,
        type: 'warning'
      });
    }
    loadSessions();
  }
  else toast(d.msg||'Failed','error');
}

async function loadTimeLimitsTable() {
  const d = await api('GET', '/api/admin/users?limit=1000'); // Load all users for config
  if (!d.ok) { 
    document.getElementById('time-limits-table').innerHTML = '<div class="empty">Failed to load users</div>';
    return; 
  }
  if (!d.users?.length) { 
    document.getElementById('time-limits-table').innerHTML = '<div class="empty">No users found</div>';
    return; 
  }
  let h = `<table class="admin-users-table"><thead><tr>
    <th>Username</th><th>Email</th><th>Role</th><th>Current Limit</th><th>New Limit (min)</th>
  </tr></thead><tbody>`;
  d.users.forEach(u => {
    const uSafe = escHtml(u.username);
    const tl = u.time_limit || 0;
    const role_b = u.role === 'admin' ? 'ADMIN' : 'user';
    h += `<tr>
      <td><span class="clickable fw7" style="cursor:pointer;color:var(--primary)" onclick="openUserDetail('${uSafe}')">${uSafe}</span></td>
      <td style="font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis">${escHtml(u.email || '—')}</td>
      <td>${role_b}</td>
      <td style="text-align:center">${tl > 0 ? `${tl}m` : 'unlimited'}</td>
      <td style="text-align:center"><input type="number" class="tl-input" data-username="${uSafe}" value="${tl}" min="0" max="1440" style="width:80px;padding:4px;font-size:12px;border-radius:6px;border:1px solid var(--border);background:var(--bg2);color:var(--text)"></td>
    </tr>`;
  });
  h += '</tbody></table>';
  document.getElementById('time-limits-table').innerHTML = h;
}

async function saveAllTimeLimits() {
  const inputs = document.querySelectorAll('.tl-input');
  let updated = 0;
  for (const input of inputs) {
    const username = input.dataset.username;
    const minutes = parseInt(input.value) || 0;
    const d = await api('POST', `/api/admin/users/${encodeURIComponent(username)}/time_limit`, { minutes });
    if (d.ok) {
      updated++;
      await pushUserNotification(username, `Your session time limit has been set to ${minutes > 0 ? `${minutes} minutes` : 'unlimited'}.`, 'warning');
    } else {
      toast(`Failed to update ${username}: ${d.msg}`, 'error');
    }
  }
  if (updated > 0) {
    toast(`Updated time limits for ${updated} user(s)`, 'success');
    loadTimeLimitsTable(); // Refresh table
    loadUsers(); // Refresh users table
  }
}
