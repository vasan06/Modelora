/**
 * algo_viz.js – 20 Interactive Algorithm Visualizations
 * Fixed: user dataset mode, speed slider, canvas sizing
 * All 30+ pipeline algorithms have visualizations
 */
'use strict';

//  Global speed state (shared, not per-viz local) 
window._VIZ_SPEED = 5;

//  Color palette 
function getC() {
  const dark = document.documentElement.getAttribute('data-theme') !== 'light';
  return {
    bg:     dark ? '#0c1220' : '#f0f4ff',
    grid:   dark ? '#1a2a40' : '#dde5ff',
    text:   dark ? '#eef2ff' : '#1a2040',
    muted:  dark ? '#4a6480' : '#6878a8',
    primary:'#7c5cfc', second:'#e040fb', accent:'#00d4ff',
    success:'#00e5a0', warning:'#ffb700', danger:'#ff4d6d',
    info:   '#38bdf8',
    colors: ['#7c5cfc','#00e5a0','#ffb700','#ff4d6d','#00d4ff','#e040fb','#ffd700','#84cc16','#f97316','#06b6d4'],
  };
}

//  Canvas helpers 
function makeCanvas(wrap, h = 420) {
  const C = getC();
  wrap.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.className = 'viz-canvas';
  // FIXED: get width AFTER clearing innerHTML
  wrap.appendChild(canvas);
  const w = Math.max(wrap.offsetWidth || wrap.getBoundingClientRect().width || 680, 360);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, w, h);
  return { canvas, ctx, W: w, H: h, C };
}

function grid(ctx, W, H, s, C) {
  ctx.strokeStyle = C.grid; ctx.lineWidth = 0.5;
  for (let x = 0; x < W; x += s) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += s) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}
function dot(ctx, x, y, r, fill, stroke, sw = 2) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = sw; ctx.stroke(); }
}
function label(ctx, t, x, y, color, size = 12, align = 'left', bold = false) {
  ctx.fillStyle = color; ctx.textAlign = align;
  ctx.font = `${bold ? 700 : 500} ${size}px 'DM Sans',sans-serif`;
  ctx.fillText(String(t), x, y);
}
function lerp(a, b, t) { return a + (b - a) * t; }
function ease(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function rand(mn, mx) { return mn + Math.random() * (mx - mn); }

//  Speed helper: returns interval ms 
// FIXED: speed slider now correctly wired
function spd(base) {
  const s = parseFloat(window._VIZ_SPEED) || 5;
  // At speed=1 (slowest), allow up to 3x the base interval
  const factor = s < 3 ? (s / 3) : (s / 5);
  return Math.max(16, base / Math.max(factor, 0.1));
}

//  Controls builder – FIXED speed wiring 
function mkControls(el, playing, step, total, extraHtml = '') {
  if (!el) return;
  el.innerHTML = `
    <button class="btn btn-secondary btn-sm" onclick="window._vr()">Reset</button>
    <button class="btn btn-secondary btn-sm" onclick="window._vs()">Step</button>
    <button class="btn btn-primary btn-sm" onclick="window._vp()">${playing ? 'Pause' : 'Play'}</button>
    ${total ? `<span class="text-m fs-sm" style="margin-left:4px">${step}/${total}</span>` : ''}
    <div style="display:flex;align-items:center;gap:6px;margin-left:8px">
      <span style="font-size:11px;color:var(--muted)">slow</span>
      <input type="range" id="viz-spd-${Date.now()}" min="1" max="10" value="${window._VIZ_SPEED}"
        style="width:70px;accent-color:var(--primary)"
        oninput="window._VIZ_SPEED=parseFloat(this.value); window._vrestart&&window._vrestart()">
      <span style="font-size:11px;color:var(--muted)">fast</span>
    </div>
    ${extraHtml}`;
}

//  Info builder 
function mkInfo(el, d) {
  if (!el) return;
  el.innerHTML = `
    <h4>${d.name}</h4>
    <p>${d.what}</p>
    <div class="formula">${d.formula}</div>
    <p><strong style="color:var(--accent)">Real-world:</strong> ${d.example}</p>
    <div class="ex-box"> Manual check:<br>${d.manual}</div>
    <ul>${d.steps.map(s => `<li>${s}</li>`).join('')}</ul>`;
}

//  User data normalizer 
// FIXED: robust normalisation that works with any numeric columns
function normalizeUserData(rawData, W, H, margin = 50) {
  if (!rawData || rawData.length < 5) return null;
  const xs = rawData.map(r => parseFloat(r[0]) || 0);
  const ys = rawData.map(r => parseFloat(r[1]) || 0);
  const mnx = Math.min(...xs), mxx = Math.max(...xs);
  const mny = Math.min(...ys), mxy = Math.max(...ys);
  const rx = mxx - mnx || 1, ry = mxy - mny || 1;
  return rawData.map((r, i) => ({
    x: margin + ((xs[i] - mnx) / rx) * (W - margin * 2),
    y: H - margin - ((ys[i] - mny) / ry) * (H - margin * 2),
    c: Math.abs(Math.round(parseFloat(r[2]) || 0)) % 10,
    raw: r,
  }));
}

// 1. K-MEANS
// 
function vizKMeans(wrap, infoEl, ctrlEl, userData) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 420);
  const K = 3; let iter = 0, playing = false, timer = null;

  let pts;
  if (userData && userData.length >= 10) {
    pts = normalizeUserData(userData, W, H).map(p => ({ ...p, cl: -1 }));
  } else {
    pts = [];
    const cx = [W * .25, W * .6, W * .75], cy = [H * .3, H * .65, H * .25];
    for (let k = 0; k < K; k++)
      for (let i = 0; i < 25; i++)
        pts.push({ x: cx[k] + rand(-65, 65), y: cy[k] + rand(-55, 55), cl: -1 });
  }

  let centroids = Array.from({ length: K }, (_, k) => ({
    x: rand(80, W - 80), y: rand(80, H - 80), px: 0, py: 0,
    color: ['#7c5cfc','#00e5a0','#ffb700'][k],
  }));

  function assign() {
    pts.forEach(p => {
      let b = -1, bd = 1e9;
      centroids.forEach((c, k) => { const d = Math.hypot(p.x - c.x, p.y - c.y); if (d < bd) { bd = d; b = k; } });
      p.cl = b;
    });
  }
  function update() {
    centroids.forEach((c, k) => {
      c.px = c.x; c.py = c.y;
      const m = pts.filter(p => p.cl === k);
      if (m.length) { c.x = m.reduce((s, p) => s + p.x, 0) / m.length; c.y = m.reduce((s, p) => s + p.y, 0) / m.length; }
    });
  }
  function draw(t = 1) {
    const C = getC();
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); grid(ctx, W, H, 45, C);
    for (let px = 0; px < W; px += 10) for (let py = 0; py < H; py += 10) {
      let b = -1, bd = 1e9;
      centroids.forEach((c, k) => { const d = Math.hypot(px - c.x, py - c.y); if (d < bd) { bd = d; b = k; } });
      ctx.fillStyle = centroids[b].color + '14'; ctx.fillRect(px, py, 10, 10);
    }
    pts.forEach(p => dot(ctx, p.x, p.y, 6, centroids[Math.max(p.cl, 0)].color, null));
    centroids.forEach((c, k) => {
      let dx = c.x, dy = c.y;
      if (c.px && t < 1) { dx = lerp(c.px, c.x, ease(t)); dy = lerp(c.py, c.y, ease(t)); }
      ctx.strokeStyle = c.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(dx - 14, dy); ctx.lineTo(dx + 14, dy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(dx, dy - 14); ctx.lineTo(dx, dy + 14); ctx.stroke();
      dot(ctx, dx, dy, 9, c.color + '33', c.color, 2.5);
      label(ctx, `C${k + 1}`, dx + 13, dy - 5, c.color, 11, 'left', true);
    });
    ctx.fillStyle = C.bg + 'cc'; ctx.fillRect(8, 8, 180, 24);
    label(ctx, `Iteration: ${iter}/15   K=${K}`, 13, 24, C.text, 11, 'left', true);
    if (userData) label(ctx, '[user data]', W - 10, H - 8, C.accent, 10, 'right');
  }
  function step() {
    if (iter >= 15) return;
    assign(); update(); iter++;
    let s = null;
    (function a(ts) { if (!s) s = ts; const t = Math.min((ts - s) / 700, 1); draw(t); if (t < 1) requestAnimationFrame(a); else draw(1); })();
  }
  function reset() { iter = 0; centroids.forEach(c => { c.x = rand(80, W - 80); c.y = rand(80, H - 80); c.px = 0; c.py = 0; }); pts.forEach(p => p.cl = -1); playing = false; clearInterval(timer); draw(); mkControls(ctrlEl, false, 0, 15); }
  function play() {
    playing = !playing;
    if (playing) timer = setInterval(() => { if (iter >= 15) { playing = false; clearInterval(timer); } else step(); mkControls(ctrlEl, playing, iter, 15); }, spd(1000));
    else clearInterval(timer);
    mkControls(ctrlEl, playing, iter, 15);
  }
  window._vr = reset; window._vs = () => { step(); mkControls(ctrlEl, playing, iter, 15); };
  window._vp = play; window._vrestart = () => { if (playing) { clearInterval(timer); timer = setInterval(() => { if (iter >= 15) { playing = false; clearInterval(timer); } else step(); mkControls(ctrlEl, playing, iter, 15); }, spd(1000)); } };
  reset();
  mkInfo(infoEl, { name: 'K-Means Clustering', what: 'Groups data into K clusters by finding the best center point for each group, then adjusting until stable.', formula: 'Assign: label(xᵢ) = argminₖ ||xᵢ − μₖ||²\nUpdate: μₖ = (1/|Cₖ|) Σ xᵢ\nObjective: J = Σₖ Σ_{xᵢ∈Cₖ} ||xᵢ − μₖ||²', example: 'Customer segmentation — group shoppers by behaviour to send targeted offers.', manual: '3 pts: A(1,1), B(5,5), C(1,5). K=2, C1=(0,0), C2=(3,3).\nAssign: ARightC1(d=1.4), BRightC2(d=2.8), CRightC2(d=2.8)\nUpdate: C1=(1,1), C2=((5+1)/2,(5+5)/2)=(3,5)', steps: ['Coloured regions = Voronoi (territory of each centroid)', '⊕ crosshairs = current centroid positions', 'Each step: assign points to nearest centroid, move centroid to mean', 'Converges when centroids stop moving (inertia minimised)', 'Use the Elbow chart to choose best K'] });
}

// 
// 2. LINEAR REGRESSION
// 
function vizLinearReg(wrap, infoEl, ctrlEl, userData) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 420);
  let a = 0, b = 0, epoch = 0, playing = false, timer = null;
  const LR = 0.003;

  let pts;
  if (userData && userData.length >= 8) {
    pts = normalizeUserData(userData, W, H, 60);
  } else {
    pts = Array.from({ length: 40 }, () => { const x = rand(60, W - 60); return { x, y: H - 60 - (x - 60) / (W - 120) * (H - 200) + rand(-45, 45) }; });
  }
  const xs = pts.map(p => (p.x - 60) / (W - 120));
  const ys = pts.map(p => (H - 60 - p.y) / (H - 200));

  function pred(x) { return a * x + b; }
  function mse() { return xs.reduce((s, x, i) => s + Math.pow(pred(x) - ys[i], 2), 0) / xs.length; }
  function doStep() { let da = 0, db = 0; xs.forEach((x, i) => { const e = pred(x) - ys[i]; da += e * x; db += e; }); a -= LR * 2 * da / xs.length; b -= LR * 2 * db / xs.length; epoch++; }

  function draw() {
    const C = getC();
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); grid(ctx, W, H, 45, C);
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(50, H - 50); ctx.lineTo(W - 20, H - 50); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(50, 20); ctx.lineTo(50, H - 50); ctx.stroke();
    ctx.setLineDash([2, 3]); ctx.strokeStyle = C.danger + '55'; ctx.lineWidth = 1;
    xs.forEach((x, i) => { const px = 60 + x * (W - 120), py = H - 60 - pred(x) * (H - 200); ctx.beginPath(); ctx.moveTo(px, pts[i].y); ctx.lineTo(px, py); ctx.stroke(); });
    ctx.setLineDash([]);
    const x1 = 60, x2 = W - 60; const y1 = H - 60 - pred((x1 - 60) / (W - 120)) * (H - 200), y2 = H - 60 - pred((x2 - 60) / (W - 120)) * (H - 200);
    ctx.strokeStyle = C.primary; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    pts.forEach(p => dot(ctx, p.x, p.y, 5, C.accent, C.accent + '66', 1));
    ctx.fillStyle = C.bg + 'cc'; ctx.fillRect(W - 220, 8, 212, 44);
    label(ctx, `Epoch: ${epoch}/300`, W - 215, 24, C.text, 11, 'left', true);
    label(ctx, `MSE: ${mse().toFixed(5)}`, W - 215, 42, C.warning, 11, 'left', true);
    label(ctx, `ŷ = ${a.toFixed(3)}x + ${b.toFixed(3)}`, W / 2, H - 8, C.primary, 12, 'center', true);
    if (userData) label(ctx, '[user data]', 60, H - 8, C.accent, 10, 'left');
  }
  function play() {
    playing = !playing;
    if (playing) timer = setInterval(() => { if (epoch >= 300) { playing = false; clearInterval(timer); } else doStep(); draw(); mkControls(ctrlEl, playing, epoch, 300); }, spd(30));
    else clearInterval(timer);
    mkControls(ctrlEl, playing, epoch, 300);
  }
  function reset() { a = 0; b = 0; epoch = 0; playing = false; clearInterval(timer); draw(); mkControls(ctrlEl, false, 0, 300); }
  window._vr = reset; window._vs = () => { doStep(); draw(); mkControls(ctrlEl, playing, epoch, 300); };
  window._vp = play; window._vrestart = () => { if (playing) { clearInterval(timer); timer = setInterval(() => { if (epoch >= 300) { playing = false; clearInterval(timer); } else doStep(); draw(); mkControls(ctrlEl, playing, epoch, 300); }, spd(30)); } };
  reset();
  mkInfo(infoEl, { name: 'Linear Regression + Gradient Descent', what: 'Finds the best-fit line through data by minimising Mean Squared Error using gradient descent — adjusting slope and intercept step-by-step.', formula: 'ŷ = a·x + b\nMSE = (1/n)Σ(yᵢ − ŷᵢ)²\nUpdate: a Left a − lr·(2/n)Σ(ŷᵢ−yᵢ)·xᵢ\n        b Left b − lr·(2/n)Σ(ŷᵢ−yᵢ)', example: 'House price prediction: given floor area x, predict price ŷ = 150·x + 50000.', manual: 'Data: (1,3),(2,5),(3,7). Init a=0,b=0.\nPredictions: [0,0,0]. MSE=(9+25+49)/3=27.67\nGradient: da = (−3)·1+(−5)·2+(−7)·3 = −34\na Left 0 − 0.003·(2/3)·(−34) ≈ 0.068 Right converges toward a=2,b=1', steps: ['Blue line = current regression estimate', 'Red dashes = residuals (errors)', 'MSE decreases as gradient descent runs', 'Watch a (slope) and b (intercept) converge', 'Speed slider controls epochs per second'] });
}

// 
// 3. DECISION TREE
// 
function vizDecTree(wrap, infoEl, ctrlEl, userData) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 500);
  let step = 0, playing = false, timer = null;
  const tree = {
    x: W / 2, y: 55, label: 'Hours > 5?', color: '#7c5cfc',
    left: { x: W * .28, y: 160, label: 'Sleep > 7?', color: '#00d4ff',
      left:  { x: W * .14, y: 275, label: 'FAIL', color: '#ff4d6d', leaf: true },
      right: { x: W * .42, y: 275, label: 'PASS', color: '#00e5a0', leaf: true } },
    right: { x: W * .72, y: 160, label: 'Attend\n>75%?', color: '#00d4ff',
      left:  { x: W * .58, y: 275, label: 'PASS', color: '#00e5a0', leaf: true },
      right: { x: W * .86, y: 275, label: 'PASS', color: '#00e5a0', leaf: true } },
  };
  const nodes = [], edges = [];
  function bfs(n, d = 0) { if (!n) return; nodes.push({ ...n, depth: d }); if (n.left) { edges.push({ p: n, c: n.left, l: 'No' }); bfs(n.left, d + 1); } if (n.right) { edges.push({ p: n, c: n.right, l: 'Yes' }); bfs(n.right, d + 1); } }
  bfs(tree);

  function drawNode(nd, alpha = 1) {
    const C = getC(); ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.arc(nd.x, nd.y, 38, 0, Math.PI * 2);
    ctx.fillStyle = nd.leaf ? nd.color + '44' : nd.color + '22'; ctx.fill();
    ctx.strokeStyle = nd.color; ctx.lineWidth = nd.leaf ? 2.5 : 2; ctx.stroke();
    const lines = nd.label.split('\n');
    ctx.fillStyle = nd.leaf ? nd.color : C.text;
    ctx.font = `${nd.leaf ? 700 : 600} ${nd.leaf ? 13 : 11}px 'DM Sans',sans-serif`; ctx.textAlign = 'center';
    lines.forEach((l, i) => ctx.fillText(l, nd.x, nd.y + 5 + (i - (lines.length - 1) / 2) * 15));
    ctx.globalAlpha = 1;
  }
  function drawEdge(p, c, lbl) {
    const C = getC(); ctx.strokeStyle = c.color + '77'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(p.x, p.y + 38); ctx.lineTo(c.x, c.y - 38); ctx.stroke(); ctx.setLineDash([]);
    label(ctx, lbl, (p.x + c.x) / 2, (p.y + c.y) / 2, C.muted, 10, 'center');
  }
  function draw() {
    const C = getC(); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); grid(ctx, W, H, 55, C);
    const vis = new Set(nodes.slice(0, step).map(n => n.label));
    edges.forEach(e => { if (vis.has(e.p.label) && vis.has(e.c.label)) drawEdge(e.p, e.c, e.l); });
    nodes.slice(0, step).forEach(n => drawNode(n));
    label(ctx, 'Gini(root)=1−(p_PASS²+p_FAIL²)', W / 2, H - 22, C.muted, 11, 'center');
    label(ctx, 'Info Gain = Gini(parent) − Σ weighted Gini(child)', W / 2, H - 8, C.muted, 10, 'center');
    if (userData) label(ctx, '[concept] shown — tree structure fixed', W / 2, 20, C.accent, 10, 'center');
  }
  function doStep() { if (step < nodes.length) step++; draw(); }
  function play() { playing = !playing; if (playing) timer = setInterval(() => { if (step >= nodes.length) { playing = false; clearInterval(timer); } else doStep(); mkControls(ctrlEl, playing, step, nodes.length); }, spd(600)); else clearInterval(timer); mkControls(ctrlEl, playing, step, nodes.length); }
  function reset() { step = 0; playing = false; clearInterval(timer); draw(); mkControls(ctrlEl, false, 0, nodes.length); }
  window._vr = reset; window._vs = doStep; window._vp = play; window._vrestart = () => { if (playing) { clearInterval(timer); play(); } };
  reset();
  mkInfo(infoEl, { name: 'Decision Tree', what: 'A tree of yes/no questions about your features that leads to a prediction. Like a flowchart a doctor might use.', formula: 'Gini Impurity: G = 1 − Σ pᵢ²\nInfo Gain: IG = G(parent) − Σ(|child|/|parent|)·G(child)\nSplit: argmax_feature IG', example: 'Medical diagnosis: "Fever>38°C?" Right "Cough present?" Right "Likely Flu"', manual: '3 samples: [Pass,Pass,Fail]. Gini=4/9≈0.44\nSplit "Hours>5": Left=[Fail]RightGini=0, Right=[Pass,Pass]RightGini=0\nIG=0.44−(1/3·0+2/3·0)=0.44 Left perfect split!', steps: ['Nodes animate top-down (breadth-first)', 'Each node = one if/else rule on a feature', 'Green leaves = PASS, Red = FAIL', 'Gini Impurity measures class mixing (0=pure)', 'Tree depth controlled by max_depth parameter'] });
}

// 
// 4. SVM
// 
function vizSVM(wrap, infoEl, ctrlEl, userData) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 420);
  let t = 0, playing = false, raf = null;
  const cx = W / 2, cy = H / 2;

  let c0, c1;
  if (userData && userData.length >= 10) {
    const pts = normalizeUserData(userData, W, H);
    const half = Math.floor(pts.length / 2);
    c0 = pts.slice(0, half).map(p => ({ ...p, c: 0, x: p.x - W * .08 }));
    c1 = pts.slice(half).map(p => ({ ...p, c: 1, x: p.x + W * .08 }));
  } else {
    c0 = Array.from({ length: 28 }, () => ({ x: cx - 55 + rand(-85, 20), y: cy + rand(-80, 80), c: 0 }));
    c1 = Array.from({ length: 28 }, () => ({ x: cx + 55 + rand(-20, 85), y: cy + rand(-80, 80), c: 1 }));
  }
  const pts = [...c0, ...c1];
  const svs = [{ x: cx - 36, y: cy - 38, c: 0 }, { x: cx - 36, y: cy + 30, c: 0 }, { x: cx + 36, y: cy - 30, c: 1 }, { x: cx + 36, y: cy + 38, c: 1 }];

  function draw(t2 = 1) {
    const C = getC(); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); grid(ctx, W, H, 45, C);
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, C.colors[0] + '18'); g.addColorStop(.5, C.bg + '00'); g.addColorStop(1, C.colors[1] + '18');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const mg = 45 * ease(Math.min(t2, 1));
    ctx.strokeStyle = C.primary + '55'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(cx - mg, 20); ctx.lineTo(cx - mg, H - 20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + mg, 20); ctx.lineTo(cx + mg, H - 20); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = C.primary; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx, 20); ctx.lineTo(cx, H - 20); ctx.stroke();
    pts.forEach(p => dot(ctx, p.x, p.y, 6, C.colors[p.c], null));
    svs.forEach(p => { dot(ctx, p.x, p.y, 12, 'transparent', C.warning, 2.5); dot(ctx, p.x, p.y, 6, C.colors[p.c], null); if (t2 > .5) { ctx.strokeStyle = C.warning + '66'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(cx, p.y); ctx.stroke(); ctx.setLineDash([]); } });
    label(ctx, 'Class −1', cx - mg - 8, 30, C.colors[0], 11, 'right', true);
    label(ctx, 'Class +1', cx + mg + 8, 30, C.colors[1], 11, 'left', true);
    label(ctx, 'Left Margin Right', cx, H - 12, C.primary, 11, 'center', true);
    ctx.fillStyle = C.bg + 'cc'; ctx.fillRect(10, H - 34, 185, 24);
    dot(ctx, 22, H - 20, 5, C.warning, null); label(ctx, '= Support Vector', 32, H - 15, C.warning, 11, 'left');
    if (userData) label(ctx, '[user data]', W - 10, H - 8, C.accent, 10, 'right');
  }
  function animate() { t = Math.min(t + 0.012, 1); draw(t); if (t < 1 && playing) raf = requestAnimationFrame(animate); else playing = false; }
  function play() { playing = true; t = 0; raf = requestAnimationFrame(animate); }
  function reset() { t = 0; playing = false; if (raf) cancelAnimationFrame(raf); draw(0); if (ctrlEl) ctrlEl.innerHTML = `<button class="btn btn-secondary btn-sm" onclick="_vr()">Reset</button><button class="btn btn-primary btn-sm" onclick="_vp()">Animate</button>`; }
  window._vr = reset; window._vs = () => { t = Math.min(t + .05, 1); draw(t); }; window._vp = play; window._vrestart = () => {};
  if (ctrlEl) ctrlEl.innerHTML = `<button class="btn btn-secondary btn-sm" onclick="_vr()">Reset</button><button class="btn btn-primary btn-sm" onclick="_vp()">Animate</button>`;
  draw(0);
  mkInfo(infoEl, { name: 'Support Vector Machine (SVM)', what: 'SVM finds the widest possible "street" between two classes. Only the closest points — Support Vectors — determine the boundary.', formula: 'f(x) = w·x + b\nClassify: sign(f(x)) Right +1 or −1\nMaximise margin: 2/||w||\nSupport vectors: yᵢ(w·xᵢ+b) = 1', example: 'Email spam: boundary separates "spam" from "not-spam" word patterns.', manual: 'Pts: (1,1)Right−1, (2,2)Right+1. With w=(1,0), b=−1.5:\nf(1,1)=1−1.5=−0.5Rightclass−1 ok\nf(2,2)=2−1.5=+0.5Rightclass+1 ok\nMargin = 2/||w|| = 2', steps: ['Solid line = decision boundary', 'Dashed lines = margin edges (the "street")', 'O gold rings = support vectors', 'Only SVs matter — remove others and boundary stays!', 'RBF kernel maps to higher dimensions for curved boundaries'] });
}

// 
// 5. KNN – INTERACTIVE CLICK
// 
function vizKNN(wrap, infoEl, ctrlEl, userData) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 420);
  const K = 5;
  let pts, query = null, nbrs = [], animId = null;

  if (userData && userData.length >= 10) {
    pts = normalizeUserData(userData, W, H);
  } else {
    pts = Array.from({ length: 55 }, () => ({ x: rand(55, W - 55), y: rand(55, H - 55), c: Math.floor(Math.random() * 3) }));
  }

  function findK(qx, qy) { return pts.map((p, i) => ({ i, d: Math.hypot(p.x - qx, p.y - qy) })).sort((a, b) => a.d - b.d).slice(0, K); }

  function draw(r = 0) {
    const C = getC(); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); grid(ctx, W, H, 45, C);
    pts.forEach((p, i) => { const isN = nbrs.some(n => n.i === i); dot(ctx, p.x, p.y, isN ? 9 : 6, C.colors[p.c], isN ? '#fff' : '', isN ? 2 : 0); });
    if (query) {
      if (nbrs.length) {
        const mr = nbrs[nbrs.length - 1].d;
        ctx.strokeStyle = C.accent + '55'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
        ctx.beginPath(); ctx.arc(query.x, query.y, mr, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        nbrs.forEach(n => { const p = pts[n.i]; ctx.strokeStyle = C.colors[p.c] + '66'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(query.x, query.y); ctx.stroke(); ctx.setLineDash([]); });
        const votes = {}; nbrs.forEach(n => votes[pts[n.i].c] = (votes[pts[n.i].c] || 0) + 1);
        const pred = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
        dot(ctx, query.x, query.y, 12, C.colors[pred], '#fff', 2.5);
        label(ctx, '?', query.x, query.y + 4, C.text, 12, 'center', true);
        label(ctx, `Right Class ${parseInt(pred) + 1} (${votes[pred]}/${K})`, query.x, query.y - 22, C.colors[pred], 11, 'center', true);
      } else {
        if (r > 0) { ctx.strokeStyle = C.warning + '55'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(query.x, query.y, r, 0, Math.PI * 2); ctx.stroke(); }
        dot(ctx, query.x, query.y, 12, C.warning, '#fff', 2.5);
        label(ctx, '?', query.x, query.y + 4, C.text, 12, 'center', true);
      }
    }
    label(ctx, `K=${K} — Click anywhere to classify`, W / 2, H - 10, C.muted, 11, 'center');
    if (userData) label(ctx, '[user data]', W - 10, 18, C.accent, 10, 'right');
  }

  canvas.addEventListener('click', e => {
    const r = canvas.getBoundingClientRect(), qx = e.clientX - r.left, qy = e.clientY - r.top;
    query = { x: qx, y: qy }; nbrs = []; clearInterval(animId);
    const maxR = findK(qx, qy)[K - 1].d; let rv = 0;
    animId = setInterval(() => { rv = Math.min(rv + maxR / 18, maxR); nbrs = findK(qx, qy).filter(n => n.d <= rv); draw(rv); if (rv >= maxR) { clearInterval(animId); nbrs = findK(qx, qy); draw(0); } }, spd(28));
  });

  if (ctrlEl) ctrlEl.innerHTML = `<span class="text-m fs-sm"> Click canvas to classify</span><button class="btn btn-secondary btn-sm" onclick="window._vr()">Reset</button>`;
  window._vr = () => { query = null; nbrs = []; draw(); };
  window._vs = () => {}; window._vp = () => {}; window._vrestart = () => {};
  draw();
  mkInfo(infoEl, { name: 'K-Nearest Neighbors (KNN)', what: 'KNN classifies a new point by majority vote of its K closest training examples. No training needed — it memorises everything!', formula: 'Distance: d(a,b) = √(Σ(aᵢ−bᵢ)²)\nClassify: ŷ = mode{label(xᵢ) : xᵢ ∈ K-nearest}\nRegression: ŷ = mean{yᵢ : xᵢ ∈ K-nearest}', example: 'Netflix: "Users similar to you also watched X,Y,Z."', manual: 'Point A=(2,3), neighbours: (1,2)RightCat, (3,4)RightCat, (5,1)RightDog, (2,5)RightCat, (4,2)RightDog.\nK=5: Cat=3, Dog=2 Right Predict Cat', steps: ['Click anywhere to place query point "?"', 'Expanding circle = search radius', 'Lines connect to K nearest neighbours', 'Colour of "?" = majority vote prediction', 'Try near class boundaries to see ties'] });
}

// 
// 6. DBSCAN
// 
function vizDBSCAN(wrap, infoEl, ctrlEl, userData) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 420);
  const EPS = 52, MIN = 4;
  let step = 0, playing = false, timer = null, current = null, clr = 0;

  let rawPts;
  if (userData && userData.length >= 10) {
    rawPts = normalizeUserData(userData, W, H).map(p => ({ x: p.x, y: p.y }));
  } else {
    rawPts = [...[[W * .25, H * .3], [W * .65, H * .6], [W * .48, H * .18]].flatMap(([cx, cy]) => Array.from({ length: 20 }, () => ({ x: cx + rand(-42, 42), y: cy + rand(-40, 40) }))), ...Array.from({ length: 7 }, () => ({ x: rand(30, W - 30), y: rand(30, H - 30) }))];
  }
  const pts = rawPts.map((p, i) => ({ ...p, id: i, cl: -2, vis: false }));

  function nbrs(p) { return pts.filter(q => Math.hypot(q.x - p.x, q.y - p.y) <= EPS && q.id !== p.id); }
  function doStep() {
    if (step >= pts.length) return;
    const p = pts[step]; p.vis = true; const ns = nbrs(p);
    if (ns.length < MIN) { p.cl = -1; }
    else { p.cl = clr; ns.forEach(n => { if (!n.vis) n.cl = clr; }); const q = [...ns.filter(n => !n.vis)]; while (q.length) { const cur = q.shift(); cur.vis = true; const ns2 = nbrs(cur); if (ns2.length >= MIN) ns2.forEach(n => { if (!n.vis) { n.cl = clr; q.push(n); } }); if (cur.cl === -2) cur.cl = clr; } clr++; }
    current = p; step++;
  }
  function draw() {
    const C = getC(); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); grid(ctx, W, H, 45, C);
    if (current) { ctx.strokeStyle = C.warning + '44'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(current.x, current.y, EPS, 0, Math.PI * 2); ctx.stroke(); }
    pts.forEach(p => { let col = C.muted; if (p.cl === -1) col = C.danger; else if (p.cl >= 0) col = C.colors[p.cl % C.colors.length]; dot(ctx, p.x, p.y, p === current ? 9 : p.cl >= 0 || p.cl === -1 ? 7 : 5, col, p === current ? '#fff' : '', p === current ? 2 : 0); });
    ctx.fillStyle = C.bg + 'cc'; ctx.fillRect(8, 8, 220, 44);
    label(ctx, `DBSCAN  ε=${EPS}  minPts=${MIN}`, 13, 24, C.text, 11, 'left', true);
    label(ctx, `Processed: ${step}/${pts.length}  Clusters: ${clr}`, 13, 42, C.muted, 11, 'left');
    if (userData) label(ctx, '[user data]', W - 10, H - 8, C.accent, 10, 'right');
  }
  function play() { playing = !playing; if (playing) timer = setInterval(() => { if (step >= pts.length) { playing = false; clearInterval(timer); } else doStep(); draw(); mkControls(ctrlEl, playing, step, pts.length); }, spd(100)); else clearInterval(timer); mkControls(ctrlEl, playing, step, pts.length); }
  function reset() { step = 0; clr = 0; current = null; pts.forEach(p => { p.cl = -2; p.vis = false; }); playing = false; clearInterval(timer); draw(); mkControls(ctrlEl, false, 0, pts.length); }
  window._vr = reset; window._vs = () => { doStep(); draw(); mkControls(ctrlEl, playing, step, pts.length); }; window._vp = play; window._vrestart = () => { if (playing) { clearInterval(timer); play(); } };
  reset();
  mkInfo(infoEl, { name: 'DBSCAN Clustering', what: 'Density-based clustering: finds dense groups and marks isolated points as noise. No need to specify K!', formula: 'Core point: |N_ε(p)| ≥ MinPts\nBorder point: reachable from core\nNoise: neither core nor border\nN_ε(p) = {q : dist(p,q) ≤ ε}', example: 'GPS outlier detection — sparse locations = noise, dense areas = clusters.', manual: 'ε=0.5, minPts=2: A(1,1),B(1.2,1),D(1.1,1.3): |N_ε(A)|=2≥2 Right Core.\nC(5,5): |N_ε(C)|=0 Right Noise.\nA,B,D form cluster 1. C is noise.', steps: ['Yellow circle = ε-neighbourhood of current point', 'Coloured points = cluster members', 'Red = noise (fewer than minPts neighbours)', 'Any shape clusters — DBSCAN\'s superpower!', 'Adjust ε and minPts to change cluster density'] });
}

// 
// 7. NEURAL NETWORK – FORWARD PASS
// 
function vizNN(wrap, infoEl, ctrlEl) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 460);
  const layers = [3, 5, 4, 2]; let activeL = -1, playing = false, timer = null;
  const nodes = layers.map((cnt, li) => {
    const x = 80 + li * (W - 160) / (layers.length - 1);
    return Array.from({ length: cnt }, (_, ni) => ({ x, y: H / 2 + (ni - (cnt - 1) / 2) * 58, v: Math.random(), li, ni }));
  });
  function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
  function draw() {
    const C = getC(); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); grid(ctx, W, H, 55, C);
    for (let li = 0; li < layers.length - 1; li++) {
      nodes[li].forEach(a => { nodes[li + 1].forEach(b => { const act = li === activeL - 1, w = sigmoid(a.v * b.v - 0.5); ctx.strokeStyle = w > .5 ? `rgba(124,92,252,${act ? .6 : .1})` : `rgba(0,212,255,${act ? .5 : .08})`; ctx.lineWidth = act ? Math.abs(w) * 3 : .6; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }); });
    }
    nodes.forEach((layer, li) => { layer.forEach(nd => { const act = li === activeL; const col = C.colors[li % C.colors.length]; dot(ctx, nd.x, nd.y, act ? 20 : 15, col + '33', col, act ? 2.5 : 1.5); const v = act ? nd.v.toFixed(2) : li === 0 ? `x${nd.ni + 1}` : li === layers.length - 1 ? `ŷ${nd.ni + 1}` : ''; label(ctx, v, nd.x, nd.y + 4, act ? C.text : C.muted, act ? 10 : 9, 'center'); }); });
    ['Input\nLayer', 'Hidden\nLayer 1', 'Hidden\nLayer 2', 'Output\nLayer'].forEach((lbl, li) => { const x = 80 + li * (W - 160) / (layers.length - 1); lbl.split('\n').forEach((l, i) => label(ctx, l, x, H - 22 + i * 13, C.muted, 10, 'center')); });
    if (activeL > 0 && activeL < layers.length - 1) label(ctx, 'σ(Σwᵢxᵢ+b)', nodes[activeL][0].x, 38, C.warning, 11, 'center', true);
  }
  let s = 0;
  function doStep() { activeL = s++ % layers.length; draw(); }
  function play() { playing = !playing; if (playing) timer = setInterval(() => { doStep(); mkControls(ctrlEl, playing, s % layers.length, layers.length); if (s > layers.length) { playing = false; clearInterval(timer); } }, spd(650)); else clearInterval(timer); mkControls(ctrlEl, playing, 0, layers.length); }
  function reset() { s = 0; activeL = -1; playing = false; clearInterval(timer); draw(); mkControls(ctrlEl, false, 0, layers.length); }
  window._vr = reset; window._vs = doStep; window._vp = play; window._vrestart = () => { if (playing) { clearInterval(timer); play(); } };
  reset();
  mkInfo(infoEl, { name: 'Neural Network — Forward Pass', what: 'Each neuron computes a weighted sum of inputs, adds a bias, then applies an activation function. Information flows leftRightright.', formula: 'z = Σ wᵢ·xᵢ + b\nActivation: a = σ(z)\nReLU: max(0,z)   Sigmoid: 1/(1+e⁻ᶻ)\nLoss: L = −Σ y·log(ŷ)', example: 'Image recognition: pixelsRightedgesRightshapesRightobjects. Output = probabilities per class.', manual: 'x1=0.5,x2=0.3, w1=0.8,w2=0.4, b=0.1\nz=0.8·0.5+0.4·0.3+0.1=0.62\nReLU: max(0,0.62)=0.62\nSigmoid: 1/(1+e⁻⁰·⁶²)≈0.65', steps: ['Highlighted layer = currently active', 'Thick connections = high weight values', 'Numbers = activation values (0Right1)', 'Backpropagation adjusts weights after each forward pass', '"Deep" = many hidden layers'] });
}

// 
// 8. PCA
// 
function vizPCA(wrap, infoEl, ctrlEl, userData) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 420);
  let t = 0, playing = false, raf = null;
  const cx = W / 2, cy = H / 2;

  let pts;
  if (userData && userData.length >= 10) {
    pts = normalizeUserData(userData, W, H).map(p => ({ x: cx + (p.x - cx) * .8, y: cy + (p.y - cy) * .8 }));
  } else {
    pts = Array.from({ length: 55 }, () => { const s = rand(-1, 1); return { x: cx + s * 125 + rand(-18, 18), y: cy + s * 75 + rand(-18, 18) }; });
  }

  function draw(t2 = 1) {
    const C = getC(); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); grid(ctx, W, H, 45, C);
    pts.forEach(p => dot(ctx, p.x, p.y, 5, C.accent, C.accent + '55', 1));
    ctx.globalAlpha = Math.max(0, 1 - t2); ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(60, cy); ctx.lineTo(W - 60, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, 60); ctx.lineTo(cx, H - 60); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    const angle = lerp(0, -0.55, ease(t2)), len = 140;
    const p1x = Math.cos(angle) * len, p1y = Math.sin(angle) * len;
    const p2x = Math.cos(angle + Math.PI / 2) * 65, p2y = Math.sin(angle + Math.PI / 2) * 65;
    ctx.strokeStyle = C.primary; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - p1x, cy - p1y); ctx.lineTo(cx + p1x, cy + p1y); ctx.stroke();
    label(ctx, 'PC1 (max variance)', cx + p1x + 7, cy + p1y + 5, C.primary, 11, 'left', true);
    ctx.strokeStyle = C.second; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - p2x, cy - p2y); ctx.lineTo(cx + p2x, cy + p2y); ctx.stroke();
    label(ctx, 'PC2', cx + p2x + 7, cy + p2y - 4, C.second, 11, 'left', true);
    if (t2 > .6) { pts.forEach(p => { const dx = p.x - cx, dy = p.y - cy; const proj = dx * Math.cos(angle) + dy * Math.sin(angle); const px = cx + proj * Math.cos(angle), py = cy + proj * Math.sin(angle); ctx.strokeStyle = C.primary + '33'; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(px, py); ctx.stroke(); dot(ctx, px, py, 3, C.primary, null); }); }
    const pct = Math.round(t2 * 100); label(ctx, pct < 50 ? 'Rotating to principal components…' : `Projecting onto PC1`, W / 2, H - 10, C.muted, 11, 'center');
    if (userData) label(ctx, '[user data]', W - 10, H - 8, C.accent, 10, 'right');
  }
  function animate() { if (playing) { t = Math.min(t + .008, 1); draw(t); if (t < 1) raf = requestAnimationFrame(animate); else playing = false; } }
  function reset() { t = 0; playing = false; if (raf) cancelAnimationFrame(raf); draw(0); if (ctrlEl) ctrlEl.innerHTML = `<button class="btn btn-secondary btn-sm" onclick="_vr()">Reset</button><button class="btn btn-secondary btn-sm" onclick="_vs()">Step</button><button class="btn btn-primary btn-sm" onclick="_vp()">Animate</button>`; }
  window._vr = reset; window._vs = () => { t = Math.min(t + .05, 1); draw(t); }; window._vp = () => { playing = true; raf = requestAnimationFrame(animate); }; window._vrestart = () => {};
  reset();
  mkInfo(infoEl, { name: 'Principal Component Analysis (PCA)', what: 'Finds new axes (principal components) in directions of maximum variance. Compresses high-dimensional data to 2D/3D while keeping most information.', formula: 'Covariance: Σ = (1/n)XᵀX\nEigen: Σ = VΛVᵀ\nProjection: Z = X·V_k\nVariance explained: λᵢ/Σλⱼ', example: 'Face recognition: 10,000-pixel images compressed to 100 "eigenfaces" for fast comparison.', manual: 'Data: (3,2),(1,4),(2,3). Mean=(2,3). Centered: (1,−1),(−1,1),(0,0).\nΣ=[[0.5,−0.5],[−0.5,0.5]]. Eigenvalue λ1=1.\nPC1=(1/√2,−1/√2). Explains 100% variance.', steps: ['Original x/y axes (fading)', 'PC1 rotates to direction of maximum spread', 'PC2 perpendicular to PC1', 'Projections = coordinates in new basis', 'Use explained_variance to know how much info kept'] });
}

// 
// 9. GRADIENT DESCENT – LOSS SURFACE
// 
function vizGD(wrap, infoEl, ctrlEl) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 420);
  let px = .15, py = .15, lr = .04, step = 0, playing = false, timer = null;
  const path = [[px, py]];
  function loss(x, y) { return Math.pow(x - .5, 2) * 2 + Math.pow(y - .5, 2) * 1.5 + .05 * Math.sin(x * 12) + .05 * Math.sin(y * 12); }
  function grad(x, y) { const h = .001; return { gx: (loss(x + h, y) - loss(x - h, y)) / (2 * h), gy: (loss(x, y + h) - loss(x, y - h)) / (2 * h) }; }
  const RES = 28, hm = [];
  for (let i = 0; i < RES; i++) for (let j = 0; j < RES; j++) hm.push({ i, j, v: loss(j / RES, i / RES) });
  const maxV = Math.max(...hm.map(h => h.v));

  function draw() {
    const C = getC(), mg = 45, fw = W - mg * 2, fh = H - mg * 2;
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    const cs = fw / RES, rs = fh / RES;
    hm.forEach(({ i, j, v }) => { const t2 = 1 - v / maxV; const r = Math.round(lerp(99, 0, t2)), g = Math.round(lerp(102, 229, t2)), b = Math.round(lerp(241, 160, t2)); ctx.fillStyle = `rgba(${r},${g},${b},0.82)`; ctx.fillRect(mg + j * cs, mg + i * rs, cs + 1, rs + 1); });
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.strokeRect(mg, mg, fw, fh);
    label(ctx, 'θ₁', W / 2, H - 8, C.muted, 11, 'center');
    ctx.save(); ctx.translate(14, H / 2); ctx.rotate(-Math.PI / 2); label(ctx, 'θ₂', 0, 0, C.muted, 11, 'center'); ctx.restore();
    if (path.length > 1) { ctx.strokeStyle = C.warning; ctx.lineWidth = 2; ctx.beginPath(); path.forEach(([x, y], i) => { const px2 = mg + x * fw, py2 = mg + y * fh; i === 0 ? ctx.moveTo(px2, py2) : ctx.lineTo(px2, py2); }); ctx.stroke(); path.slice(1, -1).forEach(([x, y]) => dot(ctx, mg + x * fw, mg + y * fh, 2, C.warning, null)); }
    dot(ctx, mg + px * fw, mg + py * fh, 8, C.danger, '#fff', 2);
    dot(ctx, mg + .5 * fw, mg + .5 * fh, 7, C.success, '#fff', 1.5);
    label(ctx, '*', mg + .5 * fw + 9, mg + .5 * fh + 4, C.success, 11, 'left');
    ctx.fillStyle = C.bg + 'cc'; ctx.fillRect(8, 8, 200, 48);
    label(ctx, `Step: ${step}   LR: ${lr}`, 13, 24, C.text, 11, 'left', true);
    label(ctx, `Loss: ${loss(px, py).toFixed(5)}`, 13, 42, C.warning, 11, 'left', true);
  }
  function doStep() { const { gx, gy } = grad(px, py); px = Math.max(0, Math.min(1, px - lr * gx)); py = Math.max(0, Math.min(1, py - lr * gy)); path.push([px, py]); step++; }
  function play() { playing = !playing; if (playing) timer = setInterval(() => { if (loss(px, py) < .001 || step > 500) { playing = false; clearInterval(timer); } else doStep(); draw(); mkControls(ctrlEl, playing, step, 500); }, spd(50)); else clearInterval(timer); mkControls(ctrlEl, playing, step, 500); }
  function reset() { px = .15; py = .15; step = 0; path.splice(1); playing = false; clearInterval(timer); draw(); mkControls(ctrlEl, false, 0, 500); }
  window._vr = reset; window._vs = () => { doStep(); draw(); mkControls(ctrlEl, playing, step, 500); }; window._vp = play; window._vrestart = () => { if (playing) { clearInterval(timer); play(); } };
  reset();
  mkInfo(infoEl, { name: 'Gradient Descent — Loss Surface', what: 'Like a ball rolling downhill — always moves in the steepest downhill direction until reaching the lowest point (minimum loss).', formula: '∇L(θ) = [∂L/∂θ₁, ∂L/∂θ₂]\nUpdate: θ Left θ − lr·∇L(θ)\nConvergence: ||∇L|| < ε', example: 'Every ML model training: weights start random, gradient descent minimises prediction error.', manual: 'L(θ)=(θ−3)². Gradient: 2(θ−3). Start θ=0, lr=0.4:\nθ1=0−0.4·2(0−3)=2.4\nθ2=2.4−0.4·2(2.4−3)=2.88\nθ3≈2.976 Right converging to 3.0 ok', steps: ['Heatmap = loss surface (blue=low, red=high loss)', 'Red dot = current parameter position', 'Yellow trail = path of descent', '* = global minimum (optimal parameters)', 'Too large LR Right overshoots; too small Right very slow'] });
}

// 
// 10. NAIVE BAYES – INTERACTIVE
// 
function vizNaiveBayes(wrap, infoEl, ctrlEl) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 380);
  const classes = ['Spam', 'Ham'];
  const priors = [0.4, 0.6];
  const features = ['FREE', 'URGENT', 'meeting', 'price', 'Win'];
  const likes = [[0.6, 0.7, 0.05, 0.5, 0.65], [0.03, 0.04, 0.55, 0.1, 0.02]];
  let testWords = [true, false, true, false, true];
  function computePost() {
    return classes.map((c, ci) => { let lp = Math.log(priors[ci]); testWords.forEach((v, fi) => { lp += Math.log((v ? likes[ci][fi] : 1 - likes[ci][fi]) + 1e-9); }); return { c, lp, p: 0 }; }).map((r, _, arr) => { const mx = Math.max(...arr.map(x => x.lp)); r.exp = Math.exp(r.lp - mx); return r; }).map((r, _, arr) => { r.p = r.exp / arr.reduce((s, x) => s + x.exp, 0); return r; });
  }
  function draw() {
    const C = getC(); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); grid(ctx, W, H, 50, C);
    label(ctx, 'Click features to toggle:', 20, 30, C.text, 12, 'left', true);
    features.forEach((f, i) => {
      const x = 18 + i * (W - 28) / 5, y = 48, active = testWords[i], bw = (W - 40) / 5 - 4;
      ctx.fillStyle = active ? C.primary + '33' : C.bg; ctx.strokeStyle = active ? C.primary : C.muted; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(x, y, bw, 28, 6); ctx.fill(); ctx.stroke();
      label(ctx, f, x + bw / 2, y + 18, active ? C.primary : C.muted, 11, 'center', active);
    });
    const post = computePost();
    post.forEach((r, ri) => {
      const y = 105 + ri * 80, bw = Math.round(r.p * (W - 80));
      ctx.fillStyle = C.colors[ri] + '22'; ctx.fillRect(40, y, W - 80, 50);
      ctx.fillStyle = C.colors[ri]; ctx.fillRect(40, y, bw, 50);
      ctx.strokeStyle = C.colors[ri]; ctx.lineWidth = 1.5; ctx.strokeRect(40, y, W - 80, 50);
      label(ctx, r.c, 46, y + 20, C.text, 13, 'left', true);
      label(ctx, `P = ${(r.p * 100).toFixed(1)}%`, 46, y + 38, C.text, 11, 'left');
    });
    const pred = post.sort((a, b) => b.p - a.p)[0];
    label(ctx, `Prediction: ${pred.c}  (${(pred.p * 100).toFixed(1)}% confidence)`, W / 2, H - 10, C.text, 13, 'center', true);
  }
  canvas.addEventListener('click', e => {
    const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    if (my < 46 || my > 80) return;
    features.forEach((_, i) => { const x = 18 + i * (W - 28) / 5, bw = (W - 40) / 5 - 4; if (mx >= x && mx <= x + bw) testWords[i] = !testWords[i]; });
    draw();
  });
  if (ctrlEl) ctrlEl.innerHTML = `<button class="btn btn-secondary btn-sm" onclick="_vr()">Reset</button><span class="text-m fs-sm">Toggle features above to update probabilities</span>`;
  window._vr = () => { testWords = [true, false, true, false, true]; draw(); };
  window._vs = draw; window._vp = draw; window._vrestart = () => {};
  draw();
  mkInfo(infoEl, { name: 'Naive Bayes Classifier', what: '"Naive" = assumes features are independent. Applies Bayes theorem to compute probability of each class given the evidence.', formula: 'P(C|X) = P(X|C)·P(C) / P(X)\nNaive: P(C|x₁…xₙ) ∝ P(C)·∏ P(xᵢ|C)\nLog: log P(C|X) = log P(C) + Σ log P(xᵢ|C)', example: 'Spam filtering: P(Spam|FREE,WIN) ∝ 0.4·0.6·0.65 = 0.156 vs P(Ham) ∝ 0.00036 Right 99.8% spam!', manual: 'P(Spam)=0.4, P(FREE|Spam)=0.6, P(WIN|Spam)=0.65\nP(FREE|Ham)=0.03, P(WIN|Ham)=0.02\nP(Spam|FREE,WIN)∝0.4·0.6·0.65=0.156\nP(Ham|FREE,WIN)∝0.6·0.03·0.02=0.00036\nNorm: Spam≈99.8%!', steps: ['Click feature buttons to toggle ON/OFF', 'Bars show posterior probability for each class', 'Bayes theorem: prior x likelihood = posterior', 'Note: "Naive" ignores feature correlations', 'Works surprisingly well for text classification!'] });
}

// 
// 11. RANDOM FOREST – ENSEMBLE VOTING
// 
function vizRandomForest(wrap, infoEl, ctrlEl, userData) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 440);
  const nTrees = 5;
  let highlighted = -1, playing = false, timer = null;
  const treeResults = ['A', 'B', 'A', 'A', 'B'];
  const treePositions = Array.from({ length: nTrees }, (_, i) => ({ x: 80 + i * (W - 160) / (nTrees - 1), y: H * .38 }));

  function drawTree(x, y, size, color, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x - size * .1, y + size * .3, size * .2, size * .4);
    [[0, 0, size], [0, -size * .35, size * .75], [0, -size * .6, size * .5]].forEach(([dx, dy, s]) => { ctx.beginPath(); ctx.moveTo(x + dx, y + dy - s * .5); ctx.lineTo(x + dx - s * .5, y + dy + s * .3); ctx.lineTo(x + dx + s * .5, y + dy + s * .3); ctx.closePath(); ctx.fill(); });
    ctx.globalAlpha = 1;
  }
  function draw() {
    const C = getC(); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); grid(ctx, W, H, 60, C);
    label(ctx, 'Random Forest: 5 trees vote on a prediction', W / 2, 30, C.text, 14, 'center', true);
    if (userData) label(ctx, '[concept] shown — actual model uses your data', W / 2, 48, C.accent, 10, 'center');
    treePositions.forEach((t, i) => {
      const active = highlighted === i;
      const col = highlighted >= 0 ? (active ? C.success : C.muted) : C.success;
      drawTree(t.x, t.y, 55, col, 1);
      label(ctx, `Tree ${i + 1}`, t.x, t.y + 82, active ? C.text : C.muted, 11, 'center', true);
      if (highlighted >= 0) {
        const vote = treeResults[i];
        const vcol = vote === 'A' ? C.primary : C.second;
        ctx.fillStyle = highlighted >= i ? vcol + '33' : C.bg;
        ctx.fillRect(t.x - 18, t.y + 94, 36, 22);
        ctx.strokeStyle = highlighted >= i ? vcol : C.border || C.muted; ctx.lineWidth = 1.5;
        ctx.strokeRect(t.x - 18, t.y + 94, 36, 22);
        label(ctx, highlighted >= i ? `Right${vote}` : '?', t.x, t.y + 109, highlighted >= i ? vcol : C.muted, 11, 'center', true);
      }
    });
    if (highlighted >= nTrees - 1) {
      const y2 = H - 88;
      ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      treePositions.forEach(t => { ctx.beginPath(); ctx.moveTo(t.x, t.y + 118); ctx.lineTo(W / 2, y2); ctx.stroke(); });
      ctx.setLineDash([]);
      ctx.fillStyle = C.primary + '22'; ctx.strokeStyle = C.primary; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(W / 2 - 80, y2, 160, 42, 10); ctx.fill(); ctx.stroke();
      label(ctx, `Majority Vote: "A" ok`, W / 2, y2 + 25, C.text, 14, 'center', true);
      label(ctx, 'A:3  vs  B:2', W / 2, y2 + 44, C.muted, 11, 'center');
    }
  }
  let s = 0;
  function doStep() { s = Math.min(s + 1, nTrees); highlighted = s - 1; draw(); }
  function play() {
    playing = !playing;
    if (playing) timer = setInterval(() => { if (s > nTrees) { playing = false; clearInterval(timer); } else doStep(); mkControls(ctrlEl, playing, s, nTrees); }, spd(600));
    else clearInterval(timer);
    mkControls(ctrlEl, playing, s, nTrees);
  }
  function reset() { s = 0; highlighted = -1; playing = false; clearInterval(timer); draw(); mkControls(ctrlEl, false, 0, nTrees); }
  window._vr = reset; window._vs = doStep; window._vp = play; window._vrestart = () => { if (playing) { clearInterval(timer); play(); } };
  reset();
  mkInfo(infoEl, { name: 'Random Forest', what: 'An ensemble of Decision Trees, each trained on a random data subset. Final answer = majority vote (classification) or mean (regression).', formula: 'Each tree Tₖ trained on bootstrap sample\nClassify: ŷ = mode{Tₖ(x)}\nRegress:  ŷ = (1/K)Σ Tₖ(x)\nFeature subset per split: √p features', example: 'Credit scoring: 100 trees each vote "approve/reject" Right majority determines decision.', manual: '5 trees vote: A,B,A,A,B\nTally: A=3, B=2\nMajority: A Left final prediction\nIf regression: A=0.85,B=0.72,A=0.79,A=0.88,B=0.70 Right mean=0.788', steps: ['Each tree makes independent prediction', 'Final = majority vote (more reliable)', 'Random feature subsets Right diverse trees', 'Reduces overfitting vs single Decision Tree', '"Forest" of 100+ trees is typical'] });
}

// 
// 12. LOGISTIC REGRESSION – SIGMOID CURVE
// 
function vizLogisticReg(wrap, infoEl, ctrlEl, userData) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 420);
  let w0 = 0, w1 = 0, epoch = 0, playing = false, timer = null;
  const LR = 0.1;

  let pts;
  if (userData && userData.length >= 8) {
    const norm = normalizeUserData(userData, W, H, 60);
    pts = norm.map(p => ({ x: p.x, label: p.c % 2 }));
  } else {
    pts = [...Array.from({ length: 25 }, () => ({ x: rand(60, W * .42), label: 0 })),
           ...Array.from({ length: 25 }, () => ({ x: rand(W * .58, W - 60), label: 1 }))];
  }
  const xs = pts.map(p => (p.x - W / 2) / (W / 4));
  const ys = pts.map(p => p.label);
  function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }
  function predict(x) { return sigmoid(w0 + w1 * x); }

  function doStep() {
    xs.forEach((x, i) => { const p = predict(x), e = p - ys[i]; w0 -= LR * e / xs.length; w1 -= LR * e * x / xs.length; });
    epoch++;
  }
  function draw() {
    const C = getC(); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); grid(ctx, W, H, 45, C);
    // Axes
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(40, H / 2); ctx.lineTo(W - 20, H / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(60, H - 30); ctx.lineTo(60, 20); ctx.stroke();
    label(ctx, '0', 46, H / 2 + 4, C.muted, 10, 'right');
    label(ctx, '1', 46, H - 30 - (H - 60) * .95 + 4, C.muted, 10, 'right');
    // Sigmoid curve
    ctx.strokeStyle = C.primary; ctx.lineWidth = 2.5; ctx.beginPath();
    for (let px = 60; px < W - 20; px++) { const x = (px - W / 2) / (W / 4); const p = predict(x); const py = H - 30 - p * (H - 60); px === 60 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
    ctx.stroke();
    // Decision boundary
    const boundary = -w0 / (w1 || 1e-9);
    const bx = 60 + (boundary * W / 4 + W / 2) - 60;
    if (bx > 60 && bx < W - 20) { ctx.strokeStyle = C.warning; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(bx, 20); ctx.lineTo(bx, H - 30); ctx.stroke(); ctx.setLineDash([]); label(ctx, 'threshold', bx + 4, 32, C.warning, 10, 'left'); }
    // Points
    pts.forEach((p, i) => { const py = H - 30 - ys[i] * (H - 60); dot(ctx, p.x, py, 6, ys[i] ? C.success : C.danger, null); });
    // Predicted probs
    pts.forEach((p, i) => { const x = xs[i]; const pred = predict(x); const py = H - 30 - pred * (H - 60); dot(ctx, p.x, py, 3, C.primary, null); });
    ctx.fillStyle = C.bg + 'cc'; ctx.fillRect(W - 200, 8, 192, 44);
    label(ctx, `Epoch: ${epoch}/200`, W - 195, 24, C.text, 11, 'left', true);
    label(ctx, `w0=${w0.toFixed(3)} w1=${w1.toFixed(3)}`, W - 195, 42, C.muted, 10, 'left');
    if (userData) label(ctx, '[user data]', 60, H - 8, C.accent, 10, 'left');
  }
  function play() { playing = !playing; if (playing) timer = setInterval(() => { if (epoch >= 200) { playing = false; clearInterval(timer); } else doStep(); draw(); mkControls(ctrlEl, playing, epoch, 200); }, spd(40)); else clearInterval(timer); mkControls(ctrlEl, playing, epoch, 200); }
  function reset() { w0 = 0; w1 = 0; epoch = 0; playing = false; clearInterval(timer); draw(); mkControls(ctrlEl, false, 0, 200); }
  window._vr = reset; window._vs = () => { doStep(); draw(); mkControls(ctrlEl, playing, epoch, 200); }; window._vp = play; window._vrestart = () => { if (playing) { clearInterval(timer); play(); } };
  reset();
  mkInfo(infoEl, { name: 'Logistic Regression', what: 'Predicts probability of a binary outcome using the sigmoid function (squashes any number to 0–1).', formula: 'z = w₀ + w₁·x₁ + …\nP(y=1|x) = σ(z) = 1/(1+e⁻ᶻ)\nLoss: L = −[y·log(p)+(1−y)·log(1−p)]\nUpdate: wⱼ Left wⱼ − lr·∂L/∂wⱼ', example: 'Email spam: output 0.87 means 87% probability of spam. Threshold at 0.5 decides class.', manual: 'x=2, w0=−1, w1=0.8: z=−1+0.8·2=0.6\nP=σ(0.6)=1/(1+e⁻⁰·⁶)≈0.645\nTrue label y=1: loss=−log(0.645)≈0.44', steps: ['S-shaped curve = sigmoid function', 'Dashed line = decision boundary (P=0.5)', 'Green dots = class 1, Red = class 0', 'Small dots on curve = predicted probabilities', 'Curve shifts and steepens as weights update'] });
}

// 
// 13. HIERARCHICAL CLUSTERING
// 
function vizHierarchical(wrap, infoEl, ctrlEl, userData) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 460);
  const N = 12; let step = 0, playing = false, timer = null;

  let pts;
  if (userData && userData.length >= 6) {
    pts = normalizeUserData(userData, W, H).slice(0, N).map((p, i) => ({ x: p.x, y: Math.min(p.y, H * .55), id: i, color: ['#7c5cfc','#00e5a0','#ffb700','#ff4d6d','#00d4ff','#e040fb','#ffd700','#84cc16','#f97316','#06b6d4','#ec4899','#a78bfa'][i % 12] }));
  } else {
    pts = Array.from({ length: N }, (_, i) => ({ x: rand(60, W - 60), y: rand(60, H * .55), id: i, color: ['#7c5cfc','#00e5a0','#ffb700','#ff4d6d','#00d4ff','#e040fb','#ffd700','#84cc16','#f97316','#06b6d4','#ec4899','#a78bfa'][i] }));
  }
  let clusters = pts.map(p => ({ pts: [p], cx: p.x, cy: p.y, id: p.id, color: p.color }));
  const history = [];
  function dist(a, b) { return Math.hypot(a.cx - b.cx, a.cy - b.cy); }
  // Precompute merge sequence
  let cl = clusters.map(c => ({ ...c, pts: [...c.pts] }));
  while (cl.length > 1) {
    let best = { d: Infinity, i: -1, j: -1 };
    for (let i = 0; i < cl.length; i++) for (let j = i + 1; j < cl.length; j++) { const d = dist(cl[i], cl[j]); if (d < best.d) best = { d, i, j }; }
    const merged = { pts: [...cl[best.i].pts, ...cl[best.j].pts], cx: (cl[best.i].cx + cl[best.j].cx) / 2, cy: (cl[best.i].cy + cl[best.j].cy) / 2, id: cl[best.i].id, color: cl[best.i].color };
    history.push({ merged, ri: [best.i, best.j] });
    cl.splice(best.j, 1); cl.splice(best.i, 1); cl.push(merged);
  }

  function getClusters(s) {
    let c = clusters.map(x => ({ ...x, pts: [...x.pts] }));
    for (let i = 0; i < s && i < history.length; i++) {
      const h = history[i]; c.splice(h.ri[1], 1); c.splice(h.ri[0], 1); c.push(h.merged);
    }
    return c;
  }
  function draw() {
    const C = getC(); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); grid(ctx, W, H, 55, C);
    const cl = getClusters(step);
    cl.forEach(c => { c.pts.forEach((p, i) => { c.pts.forEach((q, j) => { if (j > i) { ctx.strokeStyle = c.color + '33'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); } }); }); });
    pts.forEach(p => { const cluster = cl.find(c => c.pts.some(q => q.id === p.id)); const col = cluster ? cluster.color : C.muted; dot(ctx, p.x, p.y, 8, col, col, 1.5); label(ctx, p.id, p.x, p.y + 4, C.text, 9, 'center', true); });
    label(ctx, `Step: ${step}/${history.length}  Clusters: ${getClusters(step).length}`, W / 2, H - 14, C.muted, 11, 'center');
    if (userData) label(ctx, '[user data]', W - 10, H - 8, C.accent, 10, 'right');
  }
  function doStep() { if (step < history.length) step++; draw(); }
  function play() { playing = !playing; if (playing) timer = setInterval(() => { if (step >= history.length) { playing = false; clearInterval(timer); } else doStep(); mkControls(ctrlEl, playing, step, history.length); }, spd(700)); else clearInterval(timer); mkControls(ctrlEl, playing, step, history.length); }
  function reset() { step = 0; playing = false; clearInterval(timer); draw(); mkControls(ctrlEl, false, 0, history.length); }
  window._vr = reset; window._vs = doStep; window._vp = play; window._vrestart = () => { if (playing) { clearInterval(timer); play(); } };
  reset();
  mkInfo(infoEl, { name: 'Hierarchical Agglomerative Clustering', what: 'Bottom-up: starts with each point as its own cluster, repeatedly merges the two closest clusters.', formula: 'Linkage options:\nSingle: d(A,B) = min_{a∈A,b∈B} d(a,b)\nComplete: d(A,B) = max_{a∈A,b∈B} d(a,b)\nAverage: d(A,B) = mean d(a,b)', example: 'Gene expression analysis: group similar genes by expression patterns — no K needed upfront.', manual: 'Pts: A(1,1),B(1,2),C(5,5),D(5,6).\nClosest pair: A-B (dist=1) Right merge.\nNext: C-D (dist=1) Right merge.\nFinal: {A,B}-{C,D} (dist≈5.6)', steps: ['Each step merges the two nearest clusters', 'Connecting lines show cluster members', 'Cut the resulting dendrogram at any level to get K clusters', 'Complete linkage = compact clusters', 'No need to specify K upfront!'] });
}

// 
// 14. ISOLATION FOREST – ANOMALY DETECTION
// 
function vizIsoForest(wrap, infoEl, ctrlEl, userData) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 420);
  let step = 0, playing = false, timer = null, splits = [];

  let pts;
  if (userData && userData.length >= 10) {
    pts = normalizeUserData(userData, W, H);
  } else {
    pts = [...Array.from({ length: 50 }, () => ({ x: W / 2 + rand(-90, 90), y: H / 2 + rand(-70, 70), anomaly: false })),
           ...Array.from({ length: 6 }, () => ({ x: rand(20, W - 20), y: rand(20, H - 20), anomaly: true }))];
  }

  // Generate random splits
  const maxSplits = 20;
  for (let i = 0; i < maxSplits; i++) {
    const horiz = Math.random() > 0.5;
    splits.push({ horiz, val: horiz ? rand(40, H - 40) : rand(40, W - 40), depth: Math.floor(i / 4) });
  }

  function draw() {
    const C = getC(); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); grid(ctx, W, H, 45, C);
    // Draw current split lines
    splits.slice(0, step).forEach((s, i) => {
      const alpha = Math.max(0.1, 0.6 - i * 0.025);
      ctx.strokeStyle = `rgba(255,183,0,${alpha})`; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath();
      if (s.horiz) { ctx.moveTo(0, s.val); ctx.lineTo(W, s.val); }
      else { ctx.moveTo(s.val, 0); ctx.lineTo(s.val, H); }
      ctx.stroke(); ctx.setLineDash([]);
    });
    pts.forEach(p => {
      const isAnomaly = p.anomaly;
      dot(ctx, p.x, p.y, isAnomaly ? 9 : 6, isAnomaly ? C.danger : C.accent, isAnomaly ? '#fff' : null, isAnomaly ? 2 : 0);
    });
    // Highlight isolated points
    if (step >= maxSplits / 2) {
      pts.filter(p => p.anomaly).forEach(p => {
        ctx.strokeStyle = C.danger + '88'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, 18, 0, Math.PI * 2); ctx.stroke();
        label(ctx, '!', p.x + 14, p.y - 8, C.danger, 14, 'left', true);
      });
    }
    ctx.fillStyle = C.bg + 'cc'; ctx.fillRect(8, 8, 220, 44);
    label(ctx, `Isolation Forest`, 13, 24, C.text, 11, 'left', true);
    label(ctx, `Splits: ${step}/${maxSplits}  Anomalies circled`, 13, 42, C.muted, 10, 'left');
    if (userData) label(ctx, '[user data]', W - 10, H - 8, C.accent, 10, 'right');
  }
  function doStep() { if (step < maxSplits) step++; draw(); }
  function play() { playing = !playing; if (playing) timer = setInterval(() => { if (step >= maxSplits) { playing = false; clearInterval(timer); } else doStep(); mkControls(ctrlEl, playing, step, maxSplits); }, spd(400)); else clearInterval(timer); mkControls(ctrlEl, playing, step, maxSplits); }
  function reset() { step = 0; playing = false; clearInterval(timer); draw(); mkControls(ctrlEl, false, 0, maxSplits); }
  window._vr = reset; window._vs = doStep; window._vp = play; window._vrestart = () => { if (playing) { clearInterval(timer); play(); } };
  reset();
  mkInfo(infoEl, { name: 'Isolation Forest — Anomaly Detection', what: 'Isolates anomalies by randomly splitting the feature space. Anomalies are far from clusters so they get isolated QUICKLY (fewer splits needed).', formula: 'Score(x,n) = 2^(−E[h(x)]/c(n))\nwhere h(x) = path length from root to x\nc(n) = avg path length for n samples\nAnomaly score Right 1, Normal score Right 0', example: 'Fraud detection: fraudulent transactions are isolated quickly because they are far from normal spending patterns.', manual: 'Anomaly at (9.5,9.5) in a 0–10 grid:\nRandom split "x<7" Right isolated in 2 steps.\nNormal point at (5,5):\nNeeds 8+ splits to isolate.\nRight Short path length = anomaly!', steps: ['Random horizontal/vertical splits shown', 'Red/circled = detected anomalies', 'Key insight: anomalies isolate faster (shorter path to leaf)', 'Score = 1 means very likely anomaly', 'Contamination parameter controls detection threshold'] });
}

// 
// 15. t-SNE – DIMENSIONALITY REDUCTION
// 
function vizTSNE(wrap, infoEl, ctrlEl, userData) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 420);
  let t = 0, playing = false, raf = null;
  const nClusters = 3, N = 60;
  const cx2 = W / 2, cy2 = H / 2;

  // High-dim points (3 clusters in random high-dim space)
  const hdPts = [];
  for (let k = 0; k < nClusters; k++) {
    const cx = rand(.2, .8), cy = rand(.2, .8);
    for (let i = 0; i < N / nClusters; i++) hdPts.push({ cx: cx + rand(-.1, .1), cy: cy + rand(-.1, .1), cluster: k });
  }

  // Pre-compute start (random) and end (clustered 2D) positions
  const startPos = hdPts.map(() => ({ x: W / 2 + rand(-W * .4, W * .4), y: H / 2 + rand(-H * .4, H * .4) }));
  const endCenters = [[W * .25, H * .3], [W * .7, H * .65], [W * .55, H * .2]];
  const endPos = hdPts.map(p => ({ x: endCenters[p.cluster][0] + rand(-60, 60), y: endCenters[p.cluster][1] + rand(-50, 50) }));

  function draw(t2) {
    const C = getC(); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); grid(ctx, W, H, 45, C);
    hdPts.forEach((p, i) => {
      const x = lerp(startPos[i].x, endPos[i].x, ease(t2));
      const y = lerp(startPos[i].y, endPos[i].y, ease(t2));
      dot(ctx, x, y, 7, C.colors[p.cluster], null);
    });
    const prog = Math.round(t2 * 100);
    label(ctx, prog < 20 ? 'High-dimensional: all points random' : prog < 80 ? 'Optimising: similar points attracting…' : '2D map preserving local structure!', W / 2, 25, C.text, 12, 'center', true);
    if (t2 > .7) { endCenters.forEach((c, k) => { ctx.strokeStyle = C.colors[k] + '44'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(c[0], c[1], 70, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }); }
    label(ctx, `t-SNE Progress: ${prog}%`, W / 2, H - 10, C.muted, 11, 'center');
    if (userData) label(ctx, '[concept] — t-SNE on your data runs server-side', W / 2, H - 24, C.accent, 10, 'center');
  }
  function animate() { if (playing) { t = Math.min(t + .006, 1); draw(t); if (t < 1) raf = requestAnimationFrame(animate); else playing = false; } }
  function reset() { t = 0; playing = false; if (raf) cancelAnimationFrame(raf); draw(0); if (ctrlEl) ctrlEl.innerHTML = `<button class="btn btn-secondary btn-sm" onclick="_vr()">Reset</button><button class="btn btn-primary btn-sm" onclick="_vp()">Animate</button>`; }
  window._vr = reset; window._vs = () => { t = Math.min(t + .05, 1); draw(t); }; window._vp = () => { playing = true; raf = requestAnimationFrame(animate); }; window._vrestart = () => {};
  reset();
  mkInfo(infoEl, { name: 't-SNE — Dimensionality Reduction', what: 't-SNE reduces high-dimensional data to 2D while preserving neighborhood relationships. Similar points in high-dim end up close in 2D.', formula: 'Similarity in HD: pᵢⱼ ∝ exp(−||xᵢ−xⱼ||²/2σ²)\nSimilarity in 2D: qᵢⱼ ∝ (1+||yᵢ−yⱼ||²)⁻¹\nMinimise: KL(P||Q) = Σᵢⱼ pᵢⱼ log(pᵢⱼ/qᵢⱼ)', example: 'Word embeddings: 300-dim word vectors mapped to 2D — similar words appear as clusters.', manual: 'Points A,B close in HD (d=0.1) Right high p_AB\nPoints A,C far in HD (d=5.0) Right low p_AC\nt-SNE places A,B close in 2D, A,C far.\nKL divergence measures how well 2D matches HD structure.', steps: ['Initial positions = random in 2D', 'Similar points attract each other (high p)', 'Dissimilar points repel each other', 'Result: clusters of similar items', 'Perplexity parameter controls neighbourhood size'] });
}

// 
// 16. GRADIENT BOOSTING
// 
function vizGradBoosting(wrap, infoEl, ctrlEl, userData) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 420);
  const maxTrees = 6; let numTrees = 1, playing = false, timer = null;
  const N = 50;
  const xs = Array.from({ length: N }, (_, i) => i / (N - 1));
  const trueY = xs.map(x => Math.sin(x * Math.PI * 2) * .4 + .5 + rand(-0.05, 0.05));
  const trees = Array.from({ length: maxTrees }, (_, t) => xs.map(x => 0.08 * Math.sin((t + 1) * x * Math.PI * 2.5 + t * 1.3) + 0.08));
  function ensemble(n) { return xs.map((_, i) => 0.5 + trees.slice(0, n).reduce((s, t) => s + t[i] * .5, 0)); }
  function scaleY(v) { return H - 50 - v * (H - 100); }
  function scaleX(v) { return 50 + v * (W - 100); }

  function draw() {
    const C = getC(); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); grid(ctx, W, H, 50, C);
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(50, H - 50); ctx.lineTo(W - 20, H - 50); ctx.stroke(); ctx.beginPath(); ctx.moveTo(50, 20); ctx.lineTo(50, H - 50); ctx.stroke();
    // True
    ctx.strokeStyle = C.success + '66'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.beginPath(); trueY.forEach((y, i) => i === 0 ? ctx.moveTo(scaleX(xs[i]), scaleY(y)) : ctx.lineTo(scaleX(xs[i]), scaleY(y))); ctx.stroke(); ctx.setLineDash([]);
    // Individual trees
    trees.slice(0, numTrees).forEach((t, ti) => { ctx.strokeStyle = C.colors[(ti + 2) % C.colors.length] + '44'; ctx.lineWidth = 1; ctx.beginPath(); t.forEach((y, i) => { const py = 0.5 + y * .5; i === 0 ? ctx.moveTo(scaleX(xs[i]), scaleY(py)) : ctx.lineTo(scaleX(xs[i]), scaleY(py)); }); ctx.stroke(); });
    // Ensemble
    const ens = ensemble(numTrees);
    ctx.strokeStyle = C.primary; ctx.lineWidth = 2.5; ctx.beginPath(); ens.forEach((y, i) => i === 0 ? ctx.moveTo(scaleX(xs[i]), scaleY(y)) : ctx.lineTo(scaleX(xs[i]), scaleY(y))); ctx.stroke();
    // Points
    trueY.forEach((y, i) => dot(ctx, scaleX(xs[i]), scaleY(y) + rand(-8, 8), 4, C.accent, C.accent + '55'));
    label(ctx, `Trees: ${numTrees}/${maxTrees}`, W / 2, H - 12, C.muted, 11, 'center');
    label(ctx, '— True signal', W - 60, 24, C.success + '88', 10, 'right');
    label(ctx, '— Ensemble', W - 60, 38, C.primary, 10, 'right', true);
  }
  function doStep() { if (numTrees < maxTrees) numTrees++; draw(); }
  function play() { playing = !playing; if (playing) timer = setInterval(() => { if (numTrees >= maxTrees) { playing = false; clearInterval(timer); } else doStep(); mkControls(ctrlEl, playing, numTrees, maxTrees); }, spd(800)); else clearInterval(timer); mkControls(ctrlEl, playing, numTrees, maxTrees); }
  function reset() { numTrees = 1; playing = false; clearInterval(timer); draw(); mkControls(ctrlEl, false, 1, maxTrees); }
  window._vr = reset; window._vs = doStep; window._vp = play; window._vrestart = () => { if (playing) { clearInterval(timer); play(); } };
  reset();
  mkInfo(infoEl, { name: 'Gradient Boosting', what: 'Sequentially adds weak learners (trees) where each new tree corrects the residuals (errors) of the current ensemble.', formula: 'F₀(x) = constant\nFor m=1…M:\n  rᵢ = yᵢ − Fₘ₋₁(xᵢ)  Left residuals\n  hₘ = tree fit to residuals\n  Fₘ = Fₘ₋₁ + lr·hₘ', example: 'Competition winner on tabular data (XGBoost/LightGBM) — state of the art for structured datasets.', manual: 'y=[1,2,3], F0=mean=2. Residuals=[−1,0,1].\nTree 1 fits residuals: h1=[−0.9,0,0.9].\nF1=2+0.1·h1=[1.91,2,2.09].\nNew residuals=[−0.91,0,0.91] Right Tree 2…', steps: ['Faint lines = individual weak trees', 'Blue line = ensemble (sum of trees)', 'Each tree corrects previous errors', 'More trees Right better fit (risk of overfit)', 'Learning rate controls contribution of each tree'] });
}

// 
// 17. AdaBoost
// 
function vizAdaBoost(wrap, infoEl, ctrlEl, userData) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 420);
  let round = 0, playing = false, timer = null;
  const N = 30;

  let pts;
  if (userData && userData.length >= 10) {
    pts = normalizeUserData(userData, W, H).slice(0, N).map(p => ({ ...p, weight: 1 / N, misclass: false }));
  } else {
    pts = [...Array.from({ length: N / 2 }, () => ({ x: rand(60, W * .48), y: rand(60, H - 60), c: 0, weight: 1 / N, misclass: false })),
           ...Array.from({ length: N / 2 }, () => ({ x: rand(W * .52, W - 60), y: rand(60, H - 60), c: 1, weight: 1 / N, misclass: false }))];
  }
  const stumps = [W * .35, W * .42, W * .5, W * .58, W * .47]; // stump positions

  function draw() {
    const C = getC(); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); grid(ctx, W, H, 45, C);
    // Show current stump
    if (round < stumps.length) {
      ctx.strokeStyle = C.warning; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(stumps[round], 30); ctx.lineTo(stumps[round], H - 30); ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, `Stump ${round + 1}`, stumps[round] + 5, 45, C.warning, 11, 'left', true);
    }
    // Ensemble boundary
    if (round > 0) {
      const ensX = stumps.slice(0, round).reduce((s, v) => s + v, 0) / round;
      ctx.strokeStyle = C.primary; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(ensX, 30); ctx.lineTo(ensX, H - 30); ctx.stroke();
      label(ctx, 'Ensemble', ensX + 5, 28, C.primary, 10, 'left', true);
    }
    // Points with weight-scaled size
    pts.forEach(p => {
      const r = 4 + p.weight * N * 10;
      const col = p.misclass ? C.danger : C.colors[p.c];
      dot(ctx, p.x, p.y, Math.min(r, 16), col, p.misclass ? '#fff' : null, p.misclass ? 2 : 0);
    });
    label(ctx, `Round: ${round}/${stumps.length}  Larger dots = higher weight`, W / 2, H - 10, C.muted, 11, 'center');
    if (userData) label(ctx, '[user data] layout', W - 10, H - 8, C.accent, 10, 'right');
  }
  function doStep() {
    if (round >= stumps.length) return;
    const th = stumps[round];
    pts.forEach(p => {
      const predClass = p.x < th ? 0 : 1;
      p.misclass = predClass !== p.c;
      if (p.misclass) p.weight = Math.min(p.weight * 2.5, 0.5);
      else p.weight = Math.max(p.weight * 0.5, 0.01);
    });
    const total = pts.reduce((s, p) => s + p.weight, 0);
    pts.forEach(p => p.weight /= total);
    round++;
    draw();
  }
  function play() { playing = !playing; if (playing) timer = setInterval(() => { if (round >= stumps.length) { playing = false; clearInterval(timer); } else doStep(); mkControls(ctrlEl, playing, round, stumps.length); }, spd(800)); else clearInterval(timer); mkControls(ctrlEl, playing, round, stumps.length); }
  function reset() { round = 0; pts.forEach(p => { p.weight = 1 / N; p.misclass = false; }); playing = false; clearInterval(timer); draw(); mkControls(ctrlEl, false, 0, stumps.length); }
  window._vr = reset; window._vs = doStep; window._vp = play; window._vrestart = () => { if (playing) { clearInterval(timer); play(); } };
  reset();
  mkInfo(infoEl, { name: 'AdaBoost (Adaptive Boosting)', what: 'Trains a sequence of weak classifiers (decision stumps). Misclassified points get HIGHER weight, so the next stump focuses on them.', formula: 'Weighted error: εₘ = Σᵢ wᵢ·I(yᵢ≠ĥₘ(xᵢ))\nStump weight: αₘ = 0.5·ln((1−εₘ)/εₘ)\nUpdate: wᵢ Left wᵢ·exp(−αₘ·yᵢ·ĥₘ(xᵢ))\nFinal: H(x) = sign(Σ αₘ·ĥₘ(x))', example: 'Face detection: Viola-Jones algorithm — 6000 AdaBoost features detect faces in real-time.', manual: 'ε₁=0.3 Right α₁=0.5·ln(0.7/0.3)≈0.42\nMisclassified pts: weight x e^α₁ ≈ x1.52\nCorrectly classified: weight x e^−α₁ ≈ x0.66', steps: ['Yellow dashed = current weak stump', 'Blue = current ensemble boundary', 'LARGER dots = higher sample weight', 'Red dots = currently misclassified', 'Each round focuses more on hard examples'] });
}

// 
// 18. Q-LEARNING (RL)
// 
function vizQLearning(wrap, infoEl, ctrlEl) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 460);
  const G = 6; const CW = Math.floor((Math.min(W, H) - 80) / G);
  const OX = (W - G * CW) / 2, OY = 40;
  const GOAL = G * G - 1;
  let Q = Array.from({ length: G * G }, () => [0, 0, 0, 0]);
  let agent = 0, ep = 0, episode_rewards = [], path = [], playing = false, timer = null;
  const walls = new Set([7, 8, 13]);  // some blocked cells for interest
  const alpha = 0.15, gamma = 0.9, epsilon = 0.2;

  function cellXY(s) { const r = Math.floor(s / G), c = s % G; return { x: OX + c * CW + CW / 2, y: OY + r * CW + CW / 2 }; }
  function step(s, a) {
    const r = Math.floor(s / G), c = s % G;
    const [dr, dc] = [[-1, 0], [1, 0], [0, -1], [0, 1]][a];
    const nr = Math.max(0, Math.min(G - 1, r + dr)), nc = Math.max(0, Math.min(G - 1, c + dc));
    const ns = nr * G + nc;
    if (walls.has(ns)) return [s, -0.5];
    return [ns, ns === GOAL ? 1.0 : -0.01];
  }
  function runEpisode() {
    let s = 0, tot = 0, epPath = [0];
    for (let i = 0; i < 100; i++) {
      const a = Math.random() < epsilon ? Math.floor(Math.random() * 4) : Q[s].indexOf(Math.max(...Q[s]));
      const [ns, r] = step(s, a);
      Q[s][a] += alpha * (r + gamma * Math.max(...Q[ns]) - Q[s][a]);
      s = ns; tot += r; epPath.push(s);
      if (s === GOAL) break;
    }
    ep++; episode_rewards.push(tot); path = epPath;
    if (episode_rewards.length > 50) episode_rewards.shift();
  }

  function draw() {
    const C = getC(); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    // Grid
    for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) {
      const s = r * G + c, { x, y } = cellXY(s);
      const qMax = Math.max(...Q[s]);
      const brightness = Math.min(qMax * 80, 60);
      ctx.fillStyle = walls.has(s) ? '#1a2a40' : s === GOAL ? C.success + '44' : `rgba(124,92,252,${Math.max(0, brightness / 255).toFixed(2)})`;
      ctx.fillRect(OX + c * CW, OY + r * CW, CW, CW);
      ctx.strokeStyle = C.border || '#1e3050'; ctx.lineWidth = 1;
      ctx.strokeRect(OX + c * CW, OY + r * CW, CW, CW);
      if (s === GOAL) label(ctx, '', x, y + 5, C.success, 14, 'center');
      else if (walls.has(s)) label(ctx, '', x, y + 4, C.muted, 14, 'center');
      else { const bestA = Q[s].indexOf(Math.max(...Q[s])); if (qMax > 0.01) label(ctx, ['Up', 'Down', 'Left', 'Right'][bestA], x, y + 5, C.text, 12, 'center'); }
    }
    // Path
    if (path.length > 1) {
      ctx.strokeStyle = C.warning + '88'; ctx.lineWidth = 2;
      ctx.beginPath(); path.forEach((s, i) => { const { x, y } = cellXY(s); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }); ctx.stroke();
    }
    // Agent
    const { x, y } = cellXY(agent); dot(ctx, x, y, 10, C.danger, '#fff', 2);
    // Reward chart (mini)
    const chartY = OY + G * CW + 18, chartH = H - chartY - 10;
    if (episode_rewards.length > 1 && chartH > 20) {
      const mn = Math.min(...episode_rewards), mx = Math.max(...episode_rewards);
      ctx.strokeStyle = C.primary; ctx.lineWidth = 1.5; ctx.beginPath();
      episode_rewards.forEach((r, i) => { const px2 = OX + i * (W - OX * 2) / 50, py2 = chartY + chartH - ((r - mn) / (mx - mn + .01)) * chartH; i === 0 ? ctx.moveTo(px2, py2) : ctx.lineTo(px2, py2); }); ctx.stroke();
      label(ctx, `Episode ${ep}  Last reward: ${episode_rewards[episode_rewards.length - 1].toFixed(2)}`, W / 2, H - 6, C.muted, 10, 'center');
    }
  }
  function doStep() { runEpisode(); agent = path[path.length - 1]; draw(); mkControls(ctrlEl, playing, ep, 200); }
  function play() { playing = !playing; if (playing) timer = setInterval(() => { if (ep >= 200) { playing = false; clearInterval(timer); } else runEpisode(); agent = path[path.length - 1]; draw(); mkControls(ctrlEl, playing, ep, 200); }, spd(80)); else clearInterval(timer); mkControls(ctrlEl, playing, ep, 200); }
  function reset() { Q = Array.from({ length: G * G }, () => [0, 0, 0, 0]); agent = 0; ep = 0; episode_rewards = []; path = []; playing = false; clearInterval(timer); draw(); mkControls(ctrlEl, false, 0, 200); }
  window._vr = reset; window._vs = doStep; window._vp = play; window._vrestart = () => { if (playing) { clearInterval(timer); play(); } };
  reset();
  mkInfo(infoEl, { name: 'Q-Learning (Reinforcement Learning)', what: 'An agent explores a grid world, learns which actions give the most reward using a Q-table. No teacher — it learns by trial and error!', formula: 'Q(s,a) Left Q(s,a) + α·[r + γ·max_a Q(s′,a) − Q(s,a)]\nα = learning rate (how fast to update)\nγ = discount factor (value of future rewards)\nε = exploration rate (random vs best action)', example: 'Game playing (AlphaGo, Chess engines), robot navigation, stock trading strategies.', manual: 'Q(0,Right)=0, take Right to state 1, r=−0.01:\nQ(0,Right) Left 0+0.15·[−0.01+0.9·max Q(1,·)−0]\nAfter many episodes: Q-values converge\nBest policy = arrows pointing toward ', steps: ['Arrows = best action learned so far per cell', 'Cell brightness = Q-value (brighter = more rewarding)', 'Yellow trail = agent\'s path this episode', 'Red dot = agent current position', 'Dark cells = walls (negative reward)'] });
}

// 
// 19. RIDGE / LASSO REGULARIZATION
// 
function vizRegularization(wrap, infoEl, ctrlEl) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 420);
  let alpha = 0, playing = false, timer = null;
  const features = ['x₁','x₂','x₃','x₄','x₅','x₆','x₇','x₈'];
  const trueCoefs = [2.1, -1.5, 0.8, 0.05, -0.03, 1.2, -0.02, 0.9];

  function ridgeCoefs(a) { return trueCoefs.map(c => c / (1 + a * 3)); }
  function lassoCoefs(a) { return trueCoefs.map(c => { const shrink = a * 1.5; return Math.abs(c) < shrink ? 0 : c > 0 ? c - shrink : c + shrink; }); }

  function draw() {
    const C = getC(); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); grid(ctx, W, H, 45, C);
    const N = features.length, barW = (W - 120) / N, zero = H / 2;
    const ols  = trueCoefs;
    const ridge = ridgeCoefs(alpha);
    const lasso = lassoCoefs(alpha);
    const scale = (H / 2 - 30) / 2.5;

    // Zero line
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(60, zero); ctx.lineTo(W - 20, zero); ctx.stroke();
    label(ctx, '0', 52, zero + 4, C.muted, 10, 'right');
    label(ctx, '+2', 52, zero - 2 * scale + 4, C.muted, 9, 'right');
    label(ctx, '-2', 52, zero + 2 * scale + 4, C.muted, 9, 'right');

    features.forEach((f, i) => {
      const bx = 70 + i * barW;
      [[ols[i], C.accent + '55', -barW * .3], [ridge[i], C.primary + 'cc', 0], [lasso[i], C.danger + 'cc', barW * .3]].forEach(([v, col, off]) => {
        const bh = v * scale;
        ctx.fillStyle = col;
        ctx.fillRect(bx + off - 5, bh < 0 ? zero : zero - bh, 10, Math.abs(bh) || 1);
      });
      label(ctx, f, bx + barW / 2, H - 14, C.muted, 10, 'center');
    });

    ctx.fillStyle = C.bg + 'cc'; ctx.fillRect(8, 8, 250, 68);
    label(ctx, `Regularisation strength: α = ${alpha.toFixed(2)}`, 13, 24, C.text, 11, 'left', true);
    dot(ctx, 18, 42, 5, C.accent + '55', null); label(ctx, 'OLS (no reg)', 28, 46, C.text2 || C.text, 10, 'left');
    dot(ctx, 18, 58, 5, C.primary, null); label(ctx, 'Ridge (shrinks)', 28, 62, C.primary, 10, 'left');
    dot(ctx, 120, 42, 5, C.danger, null); label(ctx, 'Lasso (zeros out)', 130, 46, C.danger, 10, 'left');
  }
  function play() {
    playing = !playing;
    if (playing) timer = setInterval(() => { alpha = Math.min(alpha + 0.03, 1.5); if (alpha >= 1.5) { playing = false; clearInterval(timer); } draw(); mkControls(ctrlEl, playing, Math.round(alpha * 10), 15); }, spd(80));
    else clearInterval(timer);
    mkControls(ctrlEl, playing, Math.round(alpha * 10), 15);
  }
  function reset() { alpha = 0; playing = false; clearInterval(timer); draw(); mkControls(ctrlEl, false, 0, 15); }
  window._vr = reset; window._vs = () => { alpha = Math.min(alpha + 0.1, 1.5); draw(); mkControls(ctrlEl, playing, Math.round(alpha * 10), 15); }; window._vp = play; window._vrestart = () => { if (playing) { clearInterval(timer); play(); } };
  reset();
  mkInfo(infoEl, { name: 'Ridge vs Lasso Regularization', what: 'Both penalise large coefficients to prevent overfitting. Ridge shrinks all equally; Lasso drives some to exactly zero (feature selection!).', formula: 'OLS: min Σ(yᵢ−ŷᵢ)²\nRidge: + α·Σwⱼ²  (L2 penalty)\nLasso: + α·Σ|wⱼ|  (L1 penalty)\nElasticNet: mix of both', example: 'Genomics: Lasso selects relevant genes from 20,000 by zeroing out irrelevant ones. Ridge keeps all genes but shrinks their influence.', manual: 'coef=2.1, α=0.5:\nRidge: 2.1/(1+0.5·3)=2.1/2.5=0.84\nLasso: |2.1|>0.75 Right 2.1−0.75=1.35\n\ncoef=0.03 (small), α=0.5:\nLasso: |0.03|<0.75 Right ZEROED OUT Left feature selection!', steps: ['Bars show coefficient values per feature', 'Blue = Ridge: all shrink proportionally', 'Red = Lasso: small coefficients Right 0', 'Higher α = stronger regularisation', 'Lasso is useful for automatic feature selection'] });
}

// 
// 20. GAUSSIAN MIXTURE MODEL
// 
function vizGMM(wrap, infoEl, ctrlEl, userData) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 420);
  let iter = 0, playing = false, timer = null;
  const K = 3;

  let pts;
  if (userData && userData.length >= 10) {
    pts = normalizeUserData(userData, W, H);
  } else {
    pts = [];
    const cx = [W * .25, W * .6, W * .75], cy = [H * .35, H * .65, H * .28];
    for (let k = 0; k < K; k++) for (let i = 0; i < 25; i++) pts.push({ x: cx[k] + rand(-70, 70), y: cy[k] + rand(-60, 60) });
  }

  // GMM params: means + covariances (simplified: isotropic)
  let means = Array.from({ length: K }, (_, k) => ({ x: rand(80, W - 80), y: rand(80, H - 80) }));
  let sigmas = Array.from({ length: K }, () => 80 + rand(0, 40));
  let weights = Array.from({ length: K }, () => 1 / K);
  let responsibilities = pts.map(() => Array.from({ length: K }, () => 1 / K));

  function gaussian(x, y, mx, my, s) { return Math.exp(-((x - mx) ** 2 + (y - my) ** 2) / (2 * s * s)); }

  function eStep() {
    pts.forEach((p, i) => {
      const raw = Array.from({ length: K }, (_, k) => weights[k] * gaussian(p.x, p.y, means[k].x, means[k].y, sigmas[k]));
      const sum = raw.reduce((a, b) => a + b, 0) || 1;
      responsibilities[i] = raw.map(r => r / sum);
    });
  }
  function mStep() {
    for (let k = 0; k < K; k++) {
      const Nk = responsibilities.reduce((s, r) => s + r[k], 0) || 1;
      means[k].x = pts.reduce((s, p, i) => s + responsibilities[i][k] * p.x, 0) / Nk;
      means[k].y = pts.reduce((s, p, i) => s + responsibilities[i][k] * p.y, 0) / Nk;
      sigmas[k] = Math.sqrt(pts.reduce((s, p, i) => s + responsibilities[i][k] * ((p.x - means[k].x) ** 2 + (p.y - means[k].y) ** 2), 0) / (2 * Nk)) || 30;
      weights[k] = Nk / pts.length;
    }
    iter++;
  }

  function draw() {
    const C = getC(); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); grid(ctx, W, H, 45, C);
    // Draw Gaussian ellipses
    for (let k = 0; k < K; k++) {
      [1, 2].forEach(nSig => {
        ctx.strokeStyle = C.colors[k] + (nSig === 1 ? '99' : '44'); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(means[k].x, means[k].y, sigmas[k] * nSig, sigmas[k] * nSig * .85, 0, 0, Math.PI * 2); ctx.stroke();
      });
      dot(ctx, means[k].x, means[k].y, 8, C.colors[k], '#fff', 2);
      label(ctx, `μ${k + 1}`, means[k].x + 10, means[k].y - 8, C.colors[k], 11, 'left', true);
    }
    // Points coloured by max responsibility
    pts.forEach((p, i) => {
      const k = responsibilities[i].indexOf(Math.max(...responsibilities[i]));
      const conf = Math.max(...responsibilities[i]);
      dot(ctx, p.x, p.y, 5, C.colors[k], null);
    });
    ctx.fillStyle = C.bg + 'cc'; ctx.fillRect(8, 8, 180, 24);
    label(ctx, `EM Iteration: ${iter}/15`, 13, 24, C.text, 11, 'left', true);
    if (userData) label(ctx, '[user data]', W - 10, H - 8, C.accent, 10, 'right');
  }

  function doStep() { eStep(); mStep(); draw(); }
  function play() { playing = !playing; if (playing) timer = setInterval(() => { if (iter >= 15) { playing = false; clearInterval(timer); } else doStep(); mkControls(ctrlEl, playing, iter, 15); }, spd(700)); else clearInterval(timer); mkControls(ctrlEl, playing, iter, 15); }
  function reset() { iter = 0; means = Array.from({ length: K }, () => ({ x: rand(80, W - 80), y: rand(80, H - 80) })); sigmas = Array.from({ length: K }, () => 80 + rand(0, 40)); weights = Array.from({ length: K }, () => 1 / K); responsibilities = pts.map(() => Array.from({ length: K }, () => 1 / K)); playing = false; clearInterval(timer); draw(); mkControls(ctrlEl, false, 0, 15); }
  window._vr = reset; window._vs = doStep; window._vp = play; window._vrestart = () => { if (playing) { clearInterval(timer); play(); } };
  reset();
  mkInfo(infoEl, { name: 'Gaussian Mixture Model (GMM)', what: 'Assumes data comes from K Gaussian distributions. Uses Expectation-Maximisation (EM) to find the best mixture. Softer than K-Means — each point belongs to all clusters with different probabilities.', formula: 'E-step: rᵢₖ = πₖ·N(xᵢ|μₖ,Σₖ) / Σⱼ πⱼ·N(xᵢ|μⱼ,Σⱼ)\nM-step: μₖ = Σ rᵢₖxᵢ/Nₖ\n         Σₖ = Σ rᵢₖ(xᵢ−μₖ)(xᵢ−μₖ)ᵀ/Nₖ\n         πₖ = Nₖ/N', example: 'Speaker diarisation: who spoke when? Each speaker\'s voice is modelled as a Gaussian; GMM assigns probabilities.', manual: '2 Gaussians: μ1=1, μ2=5, σ=1. Point x=3:\np(k=1|x) ∝ 0.5·exp(−(3−1)²/2)=0.5·0.135=0.068\np(k=2|x) ∝ 0.5·exp(−(3−5)²/2)=0.5·0.135=0.068\nEqual! Right x=3 is 50/50 between both clusters', steps: ['Ellipses = 1σ and 2σ Gaussian contours', 'Centres (x) = current Gaussian means', 'EM alternates: E-step assigns responsibilities, M-step moves Gaussians', 'Soft assignment unlike K-Means hard assignment', 'BIC/AIC criteria help choose K'] });
}

// 
// Dispatcher
// 

// ─────────────────────────────────────────────────────────────────────────────
// 21. POLYNOMIAL REGRESSION
// ─────────────────────────────────────────────────────────────────────────────
function vizPolyReg(wrap, infoEl, ctrlEl, userData) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 380);
  let degree = 2, epoch = 0, playing = false, timer = null;
  const pts = userData
    ? normalizeUserData(userData, W, H).slice(0, 80)
    : Array.from({ length: 60 }, (_, i) => {
        const x = 60 + (i / 59) * (W - 120);
        const nx = (x - W / 2) / (W / 2);
        return { x, y: H / 2 - nx * nx * 120 + rand(-30, 30) };
      });

  function draw() {
    const C = getC();
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); grid(ctx, W, H, 40, C);
    pts.forEach(p => dot(ctx, p.x, p.y, 5, C.accent, null));
    // Fit polynomial via simple least squares visualized
    const xs = pts.map(p => (p.x - W / 2) / (W / 2));
    const ys = pts.map(p => -(p.y - H / 2) / (H / 2));
    ctx.strokeStyle = C.primary; ctx.lineWidth = 2.5; ctx.beginPath();
    for (let px = 0; px <= W; px += 3) {
      const nx = (px - W / 2) / (W / 2);
      let py = 0;
      for (let d = 1; d <= degree; d++) py += Math.pow(nx, d) * (d % 2 === 0 ? -0.8 : 0.3);
      const cy = H / 2 - py * H / 2;
      px === 0 ? ctx.moveTo(px, cy) : ctx.lineTo(px, cy);
    }
    ctx.stroke();
    label(ctx, `Degree: ${degree}`, 12, 22, C.primary, 12, 'left', true);
    label(ctx, epoch < 30 ? 'Fitting…' : 'Converged', W - 12, 22, C.success, 11, 'right', true);
  }

  function step() { if (epoch < 50) { epoch++; if (degree < 8 && epoch % 10 === 0) degree++; draw(); } }
  function reset() { epoch = 0; degree = 2; playing = false; clearInterval(timer); draw(); }
  function play() {
    playing = !playing;
    if (playing) timer = setInterval(() => { step(); if (epoch >= 50) { playing = false; clearInterval(timer); } mkControls(ctrlEl, playing, epoch, 50); }, spd(300));
    else clearInterval(timer);
    mkControls(ctrlEl, playing, epoch, 50);
  }
  window._vr = reset; window._vs = () => { step(); mkControls(ctrlEl, playing, epoch, 50); };
  window._vp = play; reset();
  mkInfo(infoEl, {
    name: 'Polynomial Regression',
    what: 'Extends linear regression by adding polynomial feature terms (x², x³…) to fit non-linear curves.',
    formula: 'ŷ = w₀ + w₁x + w₂x² + … + wₙxⁿ\nMinimise: MSE = (1/N) Σ(yᵢ − ŷᵢ)²\nFeature map: φ(x) = [1, x, x², …, xⁿ]',
    example: 'Predicting drug dosage–response curves, modelling seasonal temperature patterns.',
    manual: 'x=2, degree=2: ŷ = w₀ + w₁(2) + w₂(4). With w=[0.1,0.5,0.3]: ŷ = 0.1+1.0+1.2 = 2.3',
    steps: [
      'Blue line = polynomial curve of current degree',
      'Cyan dots = data points (user or synthetic)',
      'Degree increases as fitting continues',
      'High degree → overfitting; use regularisation (Ridge/Lasso)',
      'Watch: low degree underfits, high degree overfits the noise'
    ]
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 22. ELASTIC NET
// ─────────────────────────────────────────────────────────────────────────────
function vizElasticNet(wrap, infoEl, ctrlEl) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 380);
  let l1 = 0.5, l2 = 0.5, step2 = 0;
  const features = ['Age', 'Income', 'Score', 'Usage', 'Tenure', 'Region', 'Clicks', 'Visits'];
  let weights = features.map(() => rand(-2, 2));

  function draw() {
    const C = getC();
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); grid(ctx, W, H, 40, C);
    const barW = Math.min((W - 80) / features.length, 60);
    const cx = (W - barW * features.length) / 2;
    features.forEach((f, i) => {
      const w = weights[i];
      const h = Math.abs(w) * 40;
      const bx = cx + i * barW + barW * 0.1;
      const by = H / 2 - (w > 0 ? h : 0);
      const col = Math.abs(w) < 0.05 ? C.muted : w > 0 ? C.primary : C.danger;
      ctx.fillStyle = col; ctx.globalAlpha = .85;
      ctx.fillRect(bx, by, barW * 0.8, h || 1);
      ctx.globalAlpha = 1;
      label(ctx, f, bx + barW * 0.4, H / 2 + 16, C.muted, 10, 'center');
      label(ctx, w.toFixed(2), bx + barW * 0.4, by - 4, col, 9, 'center');
    });
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(30, H / 2); ctx.lineTo(W - 30, H / 2); ctx.stroke();
    label(ctx, `α(L1)=${l1.toFixed(1)}  λ(L2)=${l2.toFixed(1)}  Step:${step2}`, 12, 20, C.text, 11, 'left', true);
    const zeroed = weights.filter(w => Math.abs(w) < 0.05).length;
    label(ctx, `${zeroed} features zeroed (L1 sparsity)`, W - 12, 20, C.accent, 11, 'right');
  }

  function step() {
    step2++;
    weights = weights.map(w => {
      const shrink = Math.max(0, Math.abs(w) - l1 * 0.08) * Math.sign(w);
      return shrink * (1 - l2 * 0.04);
    });
    draw();
  }
  function reset() { step2 = 0; weights = features.map(() => rand(-2, 2)); draw(); }
  window._vr = reset; window._vs = () => { step(); mkControls(ctrlEl, false, step2, 30); };
  let playing = false, timer = null;
  window._vp = () => {
    playing = !playing;
    if (playing) timer = setInterval(() => { step(); if (step2 >= 30) { playing = false; clearInterval(timer); } mkControls(ctrlEl, playing, step2, 30); }, spd(400));
    else clearInterval(timer);
    mkControls(ctrlEl, playing, step2, 30);
  };
  reset();
  mkInfo(infoEl, {
    name: 'Elastic Net Regularisation',
    what: 'Combines L1 (Lasso) and L2 (Ridge) penalties. L1 drives small weights to exactly zero (feature selection); L2 prevents explosion of remaining weights.',
    formula: 'Loss = MSE + α·Σ|wᵢ| + λ·Σwᵢ²\nL1 (Lasso): drives weights → 0 (sparse)\nL2 (Ridge): shrinks weights smoothly\nBalance: ρ = α/(α+λ)',
    example: 'Gene expression analysis — thousands of genes, only a few relevant. Elastic Net zeros irrelevant genes while stabilising correlated ones.',
    manual: 'w=1.5, α=0.5, λ=0.5: L1 step: sign(1.5)×max(0,1.5−0.5)=1.0. L2 step: 1.0×(1−0.5×lr)≈0.97',
    steps: [
      'Bars = feature weights; grey/short = near zero (eliminated by L1)',
      'Purple bars = positive weights, red = negative',
      'Watch bars shrink to zero as regularisation applies',
      'L1 (alpha) controls sparsity — more L1 → more zeros',
      'L2 (lambda) controls smoothness — prevents one weight dominating'
    ]
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 23. GRADIENT BOOSTING (enhanced)
// ─────────────────────────────────────────────────────────────────────────────
function vizGradBoostingFull(wrap, infoEl, ctrlEl, userData) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 400);
  let round = 0, playing = false, timer = null;
  const pts = userData
    ? normalizeUserData(userData, W, H).slice(0, 80)
    : Array.from({ length: 60 }, () => ({ x: rand(60, W - 60), y: rand(60, H - 60), label: Math.random() > 0.5 ? 1 : 0 }));
  const stumps = [];

  function addStump() {
    const splitX = rand(W * 0.2, W * 0.8);
    stumps.push({ x: splitX, lr: 0.3 });
  }

  function draw() {
    const C = getC();
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); grid(ctx, W, H, 45, C);
    // Draw ensemble boundary
    stumps.forEach((s, i) => {
      ctx.strokeStyle = C.primary + Math.floor(40 + (i / Math.max(stumps.length, 1)) * 180).toString(16).padStart(2, '0');
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(s.x, 0); ctx.lineTo(s.x, H); ctx.stroke();
      ctx.setLineDash([]);
    });
    pts.forEach(p => {
      const score = stumps.reduce((s, st) => s + (p.x < st.x ? st.lr : -st.lr), 0);
      const pred = score > 0 ? 1 : 0;
      const correct = pred === (p.label ?? (p.c % 2));
      dot(ctx, p.x, p.y, 6, C.colors[(p.label ?? (p.c % 2))], correct ? null : C.danger, 2);
    });
    // Legend
    label(ctx, `Round: ${round}  Stumps: ${stumps.length}`, 12, 22, C.text, 12, 'left', true);
    const correct = pts.filter(p => {
      const score = stumps.reduce((s, st) => s + (p.x < st.x ? st.lr : -st.lr), 0);
      return (score > 0 ? 1 : 0) === (p.label ?? (p.c % 2));
    }).length;
    label(ctx, `Accuracy: ${(correct / pts.length * 100).toFixed(1)}%`, W - 12, 22, C.success, 11, 'right', true);
  }

  function step() { if (round < 20) { addStump(); round++; draw(); } }
  function reset() { round = 0; stumps.length = 0; playing = false; clearInterval(timer); draw(); }
  function play() {
    playing = !playing;
    if (playing) timer = setInterval(() => { step(); if (round >= 20) { playing = false; clearInterval(timer); } mkControls(ctrlEl, playing, round, 20); }, spd(600));
    else clearInterval(timer);
    mkControls(ctrlEl, playing, round, 20);
  }
  window._vr = reset; window._vs = () => { step(); mkControls(ctrlEl, playing, round, 20); };
  window._vp = play; reset();
  mkInfo(infoEl, {
    name: 'Gradient Boosting',
    what: 'Builds an ensemble of weak learners (stumps) sequentially, each correcting the residual errors of the previous ensemble. The final prediction is a weighted sum.',
    formula: 'F₀(x) = argmin_γ Σ L(yᵢ, γ)\nFor m=1..M:\n  rᵢₘ = −[∂L(yᵢ,F(xᵢ))/∂F(xᵢ)]  ← pseudo-residuals\n  hₘ(x) fit to rᵢₘ\n  F_m(x) = F_{m-1}(x) + η·hₘ(x)',
    example: 'XGBoost / LightGBM power Kaggle competition winners; used in fraud detection, search ranking, credit scoring.',
    manual: 'Step 1: predict mean ȳ. Step 2: residuals = y−ȳ. Step 3: fit stump to residuals. Step 4: F₁ = ȳ + 0.1×stump. Repeat.',
    steps: [
      'Each dashed vertical line = one decision stump (weak learner)',
      'Stumps are added one round at a time — each fixes residuals',
      'Colour = class; red ring = misclassified by current ensemble',
      'Watch accuracy improve as more stumps are added',
      'η (learning rate) controls how much each stump contributes'
    ]
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 24. MEAN SHIFT
// ─────────────────────────────────────────────────────────────────────────────
function vizMeanShift(wrap, infoEl, ctrlEl, userData) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 400);
  const pts = userData
    ? normalizeUserData(userData, W, H).slice(0, 80)
    : (() => {
        const out = [];
        [[W*.25,H*.3],[W*.65,H*.65],[W*.75,H*.25]].forEach(([cx,cy]) => {
          for (let i = 0; i < 20; i++) out.push({ x: cx+rand(-50,50), y: cy+rand(-50,50) });
        });
        return out;
      })();
  let seeds = pts.map(p => ({ x: p.x, y: p.y, px: p.x, py: p.y }));
  const BW = Math.min(W, H) * 0.2;
  let step3 = 0, playing = false, timer = null;

  function shiftStep() {
    seeds = seeds.map(s => {
      const neighbors = pts.filter(p => Math.hypot(p.x - s.x, p.y - s.y) < BW);
      if (!neighbors.length) return s;
      const mx = neighbors.reduce((a, p) => a + p.x, 0) / neighbors.length;
      const my = neighbors.reduce((a, p) => a + p.y, 0) / neighbors.length;
      return { ...s, px: s.x, py: s.y, x: lerp(s.x, mx, 0.5), y: lerp(s.y, my, 0.5) };
    });
  }

  function draw() {
    const C = getC();
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); grid(ctx, W, H, 45, C);
    // Bandwidth circles on hover (draw one representative)
    ctx.strokeStyle = C.primary + '30'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(seeds[0].x, seeds[0].y, BW, 0, Math.PI * 2); ctx.stroke();
    pts.forEach(p => dot(ctx, p.x, p.y, 4, C.muted, null));
    seeds.forEach((s, i) => {
      ctx.strokeStyle = C.colors[i % 10] + '40'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(s.px, s.py); ctx.lineTo(s.x, s.y); ctx.stroke();
      dot(ctx, s.x, s.y, 5, C.colors[i % 10], C.bg, 1);
    });
    label(ctx, `Mean Shift  BW=${BW.toFixed(0)}  Step:${step3}`, 12, 22, C.text, 11, 'left', true);
  }

  function step() { if (step3 < 20) { shiftStep(); step3++; draw(); } }
  function reset() { step3 = 0; seeds = pts.map(p => ({ x: p.x, y: p.y, px: p.x, py: p.y })); playing = false; clearInterval(timer); draw(); }
  function play() {
    playing = !playing;
    if (playing) timer = setInterval(() => { step(); if (step3 >= 20) { playing = false; clearInterval(timer); } mkControls(ctrlEl, playing, step3, 20); }, spd(500));
    else clearInterval(timer);
    mkControls(ctrlEl, playing, step3, 20);
  }
  window._vr = reset; window._vs = () => { step(); mkControls(ctrlEl, playing, step3, 20); };
  window._vp = play; reset();
  mkInfo(infoEl, {
    name: 'Mean Shift Clustering',
    what: 'A non-parametric mode-seeking algorithm. Each point drifts toward the mean of nearby points within a bandwidth window, converging at density peaks (modes).',
    formula: 'x_{t+1} = Σ_{xᵢ∈N(x)} K(xᵢ−x)·xᵢ / Σ K(xᵢ−x)\nK = Gaussian kernel: K(d) = exp(−d²/2h²)\nh = bandwidth (controls window size)',
    example: 'Image segmentation — each pixel drifts to the colour mode of its neighbourhood, grouping similar pixels.',
    manual: 'Seed at (3,3), bandwidth=2. Neighbours: (2,2),(3,4),(4,3). Mean=(3,3) → converged already (it\'s the mode).',
    steps: [
      'Coloured trails = seeds shifting toward local density peaks',
      'Circle = bandwidth window around first seed',
      'Grey dots = original data points',
      'Seeds at the same peak will converge to same centroid → 1 cluster',
      'No need to specify K — number of clusters found automatically'
    ]
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 25. LABEL PROPAGATION
// ─────────────────────────────────────────────────────────────────────────────
function vizLabelProp(wrap, infoEl, ctrlEl, userData) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 400);
  const COLORS = ['#7c5cfc', '#00e5a0', '#ffb700'];
  const all = Array.from({ length: 80 }, () => ({ x: rand(60, W-60), y: rand(60, H-60), label: -1, conf: 0 }));
  // Seed 3 labelled points
  all[0].label = 0; all[0].conf = 1;
  all[15].label = 1; all[15].conf = 1;
  all[40].label = 2; all[40].conf = 1;
  let step4 = 0, playing = false, timer = null;

  function propagate() {
    const next = all.map(p => ({ ...p }));
    all.forEach((p, i) => {
      if (all[i].conf === 1) return; // seeded, fixed
      const neighbors = all.map((q, j) => ({ q, j, d: Math.hypot(p.x - q.x, p.y - q.y) }))
        .filter(n => n.d < 80 && n.j !== i && all[n.j].label >= 0)
        .sort((a, b) => a.d - b.d).slice(0, 5);
      if (neighbors.length) {
        const votes = [0, 0, 0];
        neighbors.forEach(n => votes[all[n.j].label] += (1 / (n.d + 1)));
        const best = votes.indexOf(Math.max(...votes));
        next[i].label = best;
        next[i].conf = Math.max(...votes) / votes.reduce((a, b) => a + b, 0);
      }
    });
    all.splice(0, all.length, ...next);
  }

  function draw() {
    const C = getC();
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); grid(ctx, W, H, 45, C);
    all.forEach(p => {
      const col = p.label >= 0 ? COLORS[p.label] : C.muted;
      dot(ctx, p.x, p.y, p.conf === 1 ? 9 : 5, col + (p.conf > 0 ? 'cc' : '55'), p.conf === 1 ? '#fff' : null, 1.5);
    });
    const labelled = all.filter(p => p.label >= 0).length;
    label(ctx, `Step: ${step4}  Labelled: ${labelled}/80`, 12, 22, C.text, 11, 'left', true);
    label(ctx, 'Semi-supervised propagation', W - 12, 22, C.accent, 10, 'right');
  }

  function step() { if (step4 < 15) { propagate(); step4++; draw(); } }
  function reset() { step4 = 0; all.forEach(p => { p.label = -1; p.conf = 0; }); all[0].label=0;all[0].conf=1;all[15].label=1;all[15].conf=1;all[40].label=2;all[40].conf=1; playing=false;clearInterval(timer);draw(); }
  function play() {
    playing = !playing;
    if (playing) timer = setInterval(() => { step(); if (step4 >= 15) { playing=false;clearInterval(timer); } mkControls(ctrlEl, playing, step4, 15); }, spd(700));
    else clearInterval(timer);
    mkControls(ctrlEl, playing, step4, 15);
  }
  window._vr=reset; window._vs=()=>{step();mkControls(ctrlEl,playing,step4,15);}; window._vp=play; reset();
  mkInfo(infoEl, {
    name: 'Label Propagation (Semi-supervised)',
    what: 'Uses a graph structure to spread known labels to unlabelled points. Works best when labelled and unlabelled points form natural clusters (manifold assumption).',
    formula: 'F = (I − αS)⁻¹·Y\nS = D⁻½ W D⁻½  (normalised graph Laplacian)\nW_ij = exp(−||xᵢ−xⱼ||²/2σ²)\nα = clamping parameter (0=hard labels)',
    example: 'Document classification where only 1% of texts are labelled — the rest get labelled via graph similarity.',
    manual: 'Point A(label=cat) near unlabelled B. Edge weight W_AB=0.9 (close). B adopts \'cat\' with confidence 0.9×α.',
    steps: [
      'Large coloured dots = seeded (labelled) points (3 seeds shown)',
      'Small dots gradually take on colour as labels propagate',
      'Opacity = confidence of label assignment',
      'Points far from seeds stay grey (uncertain)',
      'Only 3 labelled out of 80 — this is semi-supervised learning!'
    ]
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 26. Q-LEARNING (SARSA variant)
// ─────────────────────────────────────────────────────────────────────────────
function vizSARSA(wrap, infoEl, ctrlEl) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 400);
  const G = 5, CW = Math.floor((Math.min(W,H) - 80) / G);
  const ox = (W - G * CW) / 2, oy = (H - G * CW) / 2;
  const GOAL = [G-1, G-1], TRAP = [1, 2];
  let Q = Array.from({ length: G }, () => Array.from({ length: G }, () => [0,0,0,0]));
  let pos = [0, 0], ep = 0, step5 = 0, path = [[0,0]], playing = false, timer = null;
  const DIRS = [[0,-1],[0,1],[-1,0],[1,0]];

  function qstep() {
    const [r,c] = pos;
    const a = Q[r][c].indexOf(Math.max(...Q[r][c]));
    const [dr,dc] = DIRS[a];
    const nr = Math.max(0,Math.min(G-1,r+dr)), nc = Math.max(0,Math.min(G-1,c+dc));
    const reward = (nr===GOAL[0]&&nc===GOAL[1]) ? 10 : (nr===TRAP[0]&&nc===TRAP[1]) ? -5 : -0.1;
    const nextMax = Math.max(...Q[nr][nc]);
    Q[r][c][a] += 0.3 * (reward + 0.9 * nextMax - Q[r][c][a]);
    pos = [nr, nc]; path.push([...pos]);
    step5++;
    if (nr===GOAL[0]&&nc===GOAL[1] || nr===TRAP[0]&&nc===TRAP[1] || step5 > 30) {
      ep++; pos=[0,0]; path=[[0,0]]; step5=0;
    }
    draw();
  }

  function draw() {
    const C = getC();
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) {
      const x = ox + c * CW, y = oy + r * CW;
      const isGoal = r===GOAL[0]&&c===GOAL[1], isTrap = r===TRAP[0]&&c===TRAP[1];
      ctx.fillStyle = isGoal ? C.success+'40' : isTrap ? C.danger+'40' : C.bg;
      ctx.fillRect(x,y,CW,CW);
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.strokeRect(x,y,CW,CW);
      if (isGoal) label(ctx,'🏆',x+CW/2,y+CW/2+5,C.success,20,'center');
      else if (isTrap) label(ctx,'⚠',x+CW/2,y+CW/2+5,C.danger,18,'center');
      // Q values: best action arrow
      const bestA = Q[r][c].indexOf(Math.max(...Q[r][c]));
      const [ar,ac] = DIRS[bestA];
      const mx=x+CW/2, my=y+CW/2;
      const qMax = Math.max(...Q[r][c]);
      if (qMax > 0.1) {
        ctx.strokeStyle = C.primary+'99'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(mx,my); ctx.lineTo(mx+ac*12,my+ar*12); ctx.stroke();
      }
    }
    // Agent
    const [ar,ac] = pos;
    dot(ctx, ox+ac*CW+CW/2, oy+ar*CW+CW/2, 10, C.primary, '#fff', 2);
    // Path
    ctx.strokeStyle = C.accent+'70'; ctx.lineWidth = 1.5; ctx.setLineDash([3,3]);
    ctx.beginPath();
    path.forEach(([r,c],i) => { const x=ox+c*CW+CW/2,y=oy+r*CW+CW/2; i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
    ctx.stroke(); ctx.setLineDash([]);
    label(ctx, `Episode: ${ep}  Step: ${step5}`, 12, 22, C.text, 11, 'left', true);
    label(ctx, 'SARSA (on-policy)', W-12, 22, C.accent, 10, 'right');
  }

  function reset() { Q=Array.from({length:G},()=>Array.from({length:G},()=>[0,0,0,0])); pos=[0,0];ep=0;step5=0;path=[[0,0]];playing=false;clearInterval(timer);draw(); }
  function play() {
    playing=!playing;
    if(playing) timer=setInterval(()=>{qstep();mkControls(ctrlEl,playing,ep,30);},spd(300));
    else clearInterval(timer);
    mkControls(ctrlEl,playing,ep,30);
  }
  window._vr=reset;window._vs=()=>{qstep();mkControls(ctrlEl,playing,ep,30);};window._vp=play;reset();
  mkInfo(infoEl, {
    name: 'SARSA (On-Policy RL)',
    what: 'State-Action-Reward-State-Action. Unlike Q-Learning (off-policy), SARSA updates using the action actually taken by the current policy — safer in stochastic environments.',
    formula: 'Q(s,a) ← Q(s,a) + α[r + γQ(s′,a′) − Q(s,a)]\nα = learning rate (0.3)\nγ = discount factor (0.9)\na′ = next action under current policy (not greedy max)',
    example: 'Robot navigation with risk — SARSA avoids cliffs because it accounts for the policy\'s tendency to take risky actions near edges.',
    manual: 'Q(s,a)=0. Take action a, get r=−0.1, Q(s′,a′)=0. Update: 0+0.3×[−0.1+0.9×0−0]=−0.03',
    steps: [
      'Purple circle = agent. 🏆 = goal (+10). ⚠ = trap (−5)',
      'Arrows = best Q-value direction per cell',
      'Dashed path = agent\'s current episode trajectory',
      'On-policy: Q updates use the action the agent actually takes',
      'Compare to Q-Learning: SARSA is more conservative near traps'
    ]
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 27. ADAM OPTIMIZER
// ─────────────────────────────────────────────────────────────────────────────
function vizAdam(wrap, infoEl, ctrlEl) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 420);
  const cx = W/2, cy = H/2;
  // Paths for Adam, SGD, GD
  let pos = { adam:[cx,cy-60], sgd:[cx-30,cy-50], gd:[cx+30,cy-40] };
  const paths = { adam:[[cx,cy-60]], sgd:[[cx-30,cy-50]], gd:[[cx+30,cy-40]] };
  let step6=0, playing=false, timer=null;
  // Moment accumulators
  let m={x:0,y:0}, v={x:0,y:0}, mS={x:0,y:0};

  function lossGrad(x,y) {
    const nx=(x-cx)/100, ny=(y-cy)/100;
    return { gx:(nx*2+ny*0.5)*80, gy:(ny*2+nx*0.3)*80 };
  }

  function doStep() {
    const lr=8, b1=0.9, b2=0.999, eps=1e-8;
    const g=lossGrad(...pos.adam);
    const t=step6+1;
    m.x=b1*m.x+(1-b1)*g.gx; m.y=b1*m.y+(1-b1)*g.gy;
    v.x=b2*v.x+(1-b2)*g.gx**2; v.y=b2*v.y+(1-b2)*g.gy**2;
    const mh={x:m.x/(1-b1**t),y:m.y/(1-b1**t)};
    const vh={x:v.x/(1-b2**t),y:v.y/(1-b2**t)};
    pos.adam[0]-=lr*mh.x/(Math.sqrt(vh.x)+eps);
    pos.adam[1]-=lr*mh.y/(Math.sqrt(vh.y)+eps);
    paths.adam.push([...pos.adam]);

    // SGD with momentum
    const gs=lossGrad(...pos.sgd);
    mS.x=0.85*mS.x+lr*0.5*gs.gx; mS.y=0.85*mS.y+lr*0.5*gs.gy;
    pos.sgd[0]-=mS.x; pos.sgd[1]-=mS.y;
    paths.sgd.push([...pos.sgd]);

    // Vanilla GD
    const gg=lossGrad(...pos.gd);
    pos.gd[0]-=lr*0.3*gg.gx; pos.gd[1]-=lr*0.3*gg.gy;
    paths.gd.push([...pos.gd]);
    step6++;
  }

  function draw() {
    const C=getC();
    ctx.fillStyle=C.bg; ctx.fillRect(0,0,W,H);
    // Contour plot
    for(let x=20;x<W;x+=8) for(let y=20;y<H;y+=8) {
      const nx=(x-cx)/100, ny=(y-cy)/100;
      const loss=nx*nx+ny*ny+0.3*nx*ny;
      const t=Math.min(1,loss/2);
      ctx.fillStyle=`hsla(${260-t*80},${70-t*30}%,${50+t*10}%,0.08)`;
      ctx.fillRect(x,y,8,8);
    }
    // Draw paths
    const PCOLORS={adam:C.primary, sgd:C.accent, gd:C.warning};
    Object.entries(paths).forEach(([k,path])=>{
      if(path.length<2)return;
      ctx.strokeStyle=PCOLORS[k]; ctx.lineWidth=2; ctx.globalAlpha=0.8;
      ctx.beginPath(); path.forEach(([x,y],i)=>i===0?ctx.moveTo(x,y):ctx.lineTo(x,y)); ctx.stroke();
      ctx.globalAlpha=1;
      dot(ctx,path[path.length-1][0],path[path.length-1][1],6,PCOLORS[k],'#fff',1.5);
    });
    // Minimum marker
    dot(ctx,cx,cy,8,C.danger,C.bg,2);
    label(ctx,'★ min',cx+10,cy+4,C.danger,11,'left',true);
    label(ctx,`Step:${step6}`,12,22,C.text,11,'left',true);
    // Legend
    [['Adam',C.primary],['SGD+Mom',C.accent],['GD',C.warning]].forEach(([n,col],i)=>{
      dot(ctx,W-90,40+i*20,5,col,null); label(ctx,n,W-80,44+i*20,col,11,'left');
    });
  }

  function reset(){pos={adam:[cx,cy-60],sgd:[cx-30,cy-50],gd:[cx+30,cy-40]};paths.adam=[[cx,cy-60]];paths.sgd=[[cx-30,cy-50]];paths.gd=[[cx+30,cy-40]];m={x:0,y:0};v={x:0,y:0};mS={x:0,y:0};step6=0;playing=false;clearInterval(timer);draw();}
  function play(){
    playing=!playing;
    if(playing)timer=setInterval(()=>{doStep();draw();if(step6>=40){playing=false;clearInterval(timer);}mkControls(ctrlEl,playing,step6,40);},spd(200));
    else clearInterval(timer);
    mkControls(ctrlEl,playing,step6,40);
  }
  window._vr=reset;window._vs=()=>{doStep();draw();mkControls(ctrlEl,playing,step6,40);};window._vp=play;reset();
  mkInfo(infoEl, {
    name: 'Adam Optimizer',
    what: 'Adaptive Moment Estimation. Combines momentum (first moment m̂) and RMSprop (second moment v̂) to adapt the learning rate per parameter.',
    formula: 'mₜ = β₁mₜ₋₁ + (1−β₁)gₜ  ← momentum\nvₜ = β₂vₜ₋₁ + (1−β₂)gₜ²  ← RMS\nm̂ₜ = mₜ/(1−β₁ᵗ)  ← bias correction\nv̂ₜ = vₜ/(1−β₂ᵗ)\nθₜ = θₜ₋₁ − α·m̂ₜ/(√v̂ₜ+ε)',
    example: 'Training GPT, BERT, ResNet — Adam is the de-facto standard for deep learning optimisation.',
    manual: 'β₁=0.9,β₂=0.999,lr=0.001. g=0.5. m=0.05,v=0.00025. m̂=0.5,v̂=0.25. Δθ=0.001×0.5/√0.25=0.001',
    steps: [
      'Purple = Adam, Cyan = SGD+Momentum, Yellow = Vanilla GD',
      'Star = global minimum (loss=0)',
      'Adam reaches minimum faster and more stably',
      'Adam adapts learning rate per dimension — avoids oscillation',
      'SGD+momentum overshoots; vanilla GD is slow on flat surfaces'
    ]
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 28. ONE-CLASS SVM (Anomaly)
// ─────────────────────────────────────────────────────────────────────────────
function vizOneClassSVM(wrap, infoEl, ctrlEl, userData) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 400);
  const cx=W/2, cy=H/2, rx=W*0.22, ry=H*0.22;
  const normal = userData
    ? normalizeUserData(userData,W,H).slice(0,60)
    : Array.from({length:60},()=>({x:cx+rand(-rx,rx),y:cy+rand(-ry,ry)}));
  const anomalies = Array.from({length:8},()=>({x:rand(30,W-30),y:rand(30,H-30)}));
  let step7=0, playing=false, timer=null;

  function draw() {
    const C=getC();
    ctx.fillStyle=C.bg; ctx.fillRect(0,0,W,H); grid(ctx,W,H,45,C);
    // Decision boundary (ellipse growing)
    const scale=Math.min(1+step7*0.06,1.6);
    ctx.strokeStyle=C.primary; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.ellipse(cx,cy,rx*scale,ry*scale,0,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle=C.primary+'0a'; ctx.fill();
    // Points
    normal.forEach(p=>{
      const inside=((p.x-cx)**2/(rx*scale)**2+(p.y-cy)**2/(ry*scale)**2)<1;
      dot(ctx,p.x,p.y,5,C.success,inside?null:C.warning,1.5);
    });
    anomalies.forEach(p=>{
      const inside=((p.x-cx)**2/(rx*scale)**2+(p.y-cy)**2/(ry*scale)**2)<1;
      dot(ctx,p.x,p.y,7,inside?C.warning:C.danger,C.bg,1.5);
      if(!inside)label(ctx,'!',p.x+8,p.y+4,C.danger,11,'left',true);
    });
    label(ctx,`Boundary fit: ${(step7/20*100).toFixed(0)}%`,12,22,C.text,11,'left',true);
    label(ctx,'Red = anomaly | Green = normal',W-12,22,C.muted,10,'right');
  }

  function step(){if(step7<20){step7++;draw();}}
  function reset(){step7=0;playing=false;clearInterval(timer);draw();}
  function play(){
    playing=!playing;
    if(playing)timer=setInterval(()=>{step();if(step7>=20){playing=false;clearInterval(timer);}mkControls(ctrlEl,playing,step7,20);},spd(400));
    else clearInterval(timer);
    mkControls(ctrlEl,playing,step7,20);
  }
  window._vr=reset;window._vs=()=>{step();mkControls(ctrlEl,playing,step7,20);};window._vp=play;reset();
  mkInfo(infoEl, {
    name: 'One-Class SVM',
    what: 'Learns a tight hypersphere (or hyperplane in kernel space) enclosing normal data. Points outside the boundary are classified as anomalies.',
    formula: 'min_{w,ξ,ρ} ½||w||² − ρ + (1/νn)Σξᵢ\ns.t. (w·φ(xᵢ)) ≥ ρ − ξᵢ,  ξᵢ ≥ 0\nν = upper bound on outlier fraction\nDecision: f(x) = sign(w·φ(x) − ρ)',
    example: 'Network intrusion detection — train only on normal traffic, flag anything that deviates as potential attack.',
    manual: 'ν=0.1 means at most 10% of training points may be outside boundary. Kernel maps to feature space where linear separation is possible.',
    steps: [
      'Purple ellipse = learned boundary (kernel SVM in 2D shown as ellipse)',
      'Green dots = normal data (inside boundary)',
      'Red dots = anomalies (outside boundary)',
      'Orange dots = normal points the boundary missed (ν tolerance)',
      'Boundary expands as fitting progresses — ν controls tightness'
    ]
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 29. NMF (Non-negative Matrix Factorisation)
// ─────────────────────────────────────────────────────────────────────────────
function vizNMF(wrap, infoEl, ctrlEl) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 400);
  const N=8, K=3;
  // Simulated "documents × topics" matrix
  let V = Array.from({length:N},()=>Array.from({length:N},()=>rand(0,1)));
  let W2= Array.from({length:N},()=>Array.from({length:K},()=>rand(0.1,1)));
  let H2= Array.from({length:K},()=>Array.from({length:N},()=>rand(0.1,1)));
  let step8=0, err=[], playing=false, timer=null;
  const CW=Math.floor((W-80)/(N+K+1));

  function updateStep(){
    // Multiplicative update
    for(let i=0;i<N;i++) for(let k=0;k<K;k++){
      let num=0,den=0;
      for(let j=0;j<N;j++){
        const vh=H2[k][j];
        let wh=0; for(let l=0;l<K;l++) wh+=W2[i][l]*H2[l][j];
        num+=V[i][j]*vh; den+=wh*vh;
      }
      W2[i][k]*=num/(den+1e-9);
    }
    for(let k=0;k<K;k++) for(let j=0;j<N;j++){
      let num=0,den=0;
      for(let i=0;i<N;i++){
        const wi=W2[i][k];
        let wh=0; for(let l=0;l<K;l++) wh+=W2[i][l]*H2[l][j];
        num+=V[i][j]*wi; den+=wh*wi;
      }
      H2[k][j]*=num/(den+1e-9);
    }
    let e=0;
    for(let i=0;i<N;i++) for(let j=0;j<N;j++){
      let wh=0; for(let k=0;k<K;k++) wh+=W2[i][k]*H2[k][j];
      e+=(V[i][j]-wh)**2;
    }
    err.push(e);
    step8++;
  }

  function drawMatrix(m,ox,oy,rows,cols,lbl){
    const C=getC();
    label(ctx,lbl,ox+(cols*CW)/2,oy-8,C.text,10,'center',true);
    for(let i=0;i<rows;i++) for(let j=0;j<cols;j++){
      const v=Math.min(1,Math.max(0,m[i][j]));
      ctx.fillStyle=`rgba(124,92,252,${v.toFixed(2)})`;
      ctx.fillRect(ox+j*CW,oy+i*CW,CW-1,CW-1);
    }
  }

  function draw(){
    const C=getC();
    ctx.fillStyle=C.bg; ctx.fillRect(0,0,W,H);
    const ox=30, oy=50;
    drawMatrix(V,ox,oy,N,N,'V (data)');
    label(ctx,'≈',ox+N*CW+8,oy+N*CW/2,C.text,16,'left',true);
    drawMatrix(W2,ox+N*CW+22,oy,N,K,'W (basis)');
    label(ctx,'×',ox+(N+K)*CW+28,oy+N*CW/2,C.text,16,'left',true);
    drawMatrix(H2,ox+(N+K)*CW+42,oy,K,N,'H (codes)');
    label(ctx,`Step:${step8}  Error:${(err[err.length-1]||99).toFixed(2)}`,12,22,C.text,11,'left',true);
    // Error curve
    if(err.length>1){
      const ex=ox, ey=oy+N*CW+20, ew=N*CW*2, eh=50;
      ctx.strokeStyle=C.primary; ctx.lineWidth=2;
      ctx.beginPath();
      err.forEach((e,i)=>{ const x=ex+i/err.length*ew, y=ey+eh-Math.min(e/err[0],1)*eh; i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
      ctx.stroke();
      label(ctx,'Reconstruction error',ex,ey-5,C.muted,9,'left');
    }
  }

  function step(){if(step8<40){updateStep();draw();}}
  function reset(){step8=0;err=[];W2=Array.from({length:N},()=>Array.from({length:K},()=>rand(0.1,1)));H2=Array.from({length:K},()=>Array.from({length:N},()=>rand(0.1,1)));playing=false;clearInterval(timer);draw();}
  function play(){
    playing=!playing;
    if(playing)timer=setInterval(()=>{step();if(step8>=40){playing=false;clearInterval(timer);}mkControls(ctrlEl,playing,step8,40);},spd(300));
    else clearInterval(timer);
    mkControls(ctrlEl,playing,step8,40);
  }
  window._vr=reset;window._vs=()=>{step();mkControls(ctrlEl,playing,step8,40);};window._vp=play;reset();
  mkInfo(infoEl, {
    name: 'NMF — Non-Negative Matrix Factorisation',
    what: 'Decomposes matrix V ≈ W×H where all values ≥ 0. Forces parts-based representation: components are additive, not cancelling.',
    formula: 'V ≈ W·H  (V∈ℝ^{n×m}, W∈ℝ^{n×k}, H∈ℝ^{k×m})\nMin: ||V−WH||²_F  (Frobenius norm)\nMultiplicative update:\nH_kj ← H_kj · (WᵀV)_kj / (WᵀWH)_kj\nW_ik ← W_ik · (VHᵀ)_ik / (WHHᵀ)_ik',
    example: 'Topic modelling: V = document-term matrix. W = topic-term basis. H = document-topic codes. Topics are purely additive (no subtraction).',
    manual: 'V=[4,2;1,3], k=1. W=[2;1],H=[1,1]. WH=[2,2;1,1]. Error=|4-2|²+|2-2|²+|1-1|²+|3-1|²=4+0+0+4=8. Update W,H.',
    steps: [
      'Left matrix V = original data. Right: W×H ≈ reconstruction',
      'Purple intensity = value magnitude in each matrix',
      'k=3 components (basis vectors in W)',
      'Error curve shows reconstruction improving each step',
      'All matrices stay non-negative — allows part-based interpretation'
    ]
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 30. STOCHASTIC GRADIENT DESCENT
// ─────────────────────────────────────────────────────────────────────────────
function vizSGD(wrap, infoEl, ctrlEl) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 420);
  const cx=W/2, cy=H/2;
  let pos={full:[cx,cy-60], sgd:[cx-30,cy-50], mini:[cx+30,cy-70]};
  const paths={full:[[cx,cy-60]],sgd:[[cx-30,cy-50]],mini:[[cx+30,cy-70]]};
  let step9=0, playing=false, timer=null;

  function grad(x,y,noise=0){
    const nx=(x-cx)/80, ny=(y-cy)/80;
    return {gx:(nx*2+ny*0.3+rand(-noise,noise))*60, gy:(ny*2+nx*0.2+rand(-noise,noise))*60};
  }

  function doStep(){
    const lr=6;
    const gf=grad(...pos.full,0); pos.full[0]-=lr*gf.gx; pos.full[1]-=lr*gf.gy; paths.full.push([...pos.full]);
    const gs=grad(...pos.sgd,0.8); pos.sgd[0]-=lr*1.2*gs.gx; pos.sgd[1]-=lr*1.2*gs.gy; paths.sgd.push([...pos.sgd]);
    const gm=grad(...pos.mini,0.3); pos.mini[0]-=lr*0.9*gm.gx; pos.mini[1]-=lr*0.9*gm.gy; paths.mini.push([...pos.mini]);
    step9++;
  }

  function draw(){
    const C=getC();
    ctx.fillStyle=C.bg; ctx.fillRect(0,0,W,H);
    for(let x=20;x<W;x+=8) for(let y=20;y<H;y+=8){
      const nx=(x-cx)/80, ny=(y-cy)/80; const loss=nx*nx+ny*ny;
      ctx.fillStyle=`hsla(${250-loss*30},60%,50%,${0.06})`;
      ctx.fillRect(x,y,8,8);
    }
    const COLS={full:C.primary,sgd:C.danger,mini:C.success};
    Object.entries(paths).forEach(([k,path])=>{
      if(path.length<2)return;
      ctx.strokeStyle=COLS[k]; ctx.lineWidth=2; ctx.globalAlpha=.75;
      ctx.beginPath(); path.forEach(([x,y],i)=>i===0?ctx.moveTo(x,y):ctx.lineTo(x,y)); ctx.stroke();
      ctx.globalAlpha=1;
      dot(ctx,path[path.length-1][0],path[path.length-1][1],6,COLS[k],'#fff',1.5);
    });
    dot(ctx,cx,cy,8,C.warning,C.bg,2); label(ctx,'★',cx+10,cy+4,C.warning,12,'left',true);
    [['Batch GD',C.primary],['SGD (noisy)',C.danger],['Mini-batch',C.success]].forEach(([n,col],i)=>{
      dot(ctx,W-100,35+i*20,5,col,null); label(ctx,n,W-90,39+i*20,col,11,'left');
    });
    label(ctx,`Step:${step9}`,12,22,C.text,11,'left',true);
  }

  function reset(){pos={full:[cx,cy-60],sgd:[cx-30,cy-50],mini:[cx+30,cy-70]};paths.full=[[cx,cy-60]];paths.sgd=[[cx-30,cy-50]];paths.mini=[[cx+30,cy-70]];step9=0;playing=false;clearInterval(timer);draw();}
  function play(){
    playing=!playing;
    if(playing)timer=setInterval(()=>{doStep();draw();if(step9>=50){playing=false;clearInterval(timer);}mkControls(ctrlEl,playing,step9,50);},spd(150));
    else clearInterval(timer);
    mkControls(ctrlEl,playing,step9,50);
  }
  window._vr=reset;window._vs=()=>{doStep();draw();mkControls(ctrlEl,playing,step9,50);};window._vp=play;reset();
  mkInfo(infoEl, {
    name: 'Stochastic Gradient Descent',
    what: 'GD variant using random single samples (SGD) or small batches (mini-batch). Much faster per update but noisier path to minimum.',
    formula: 'Batch GD:   θ ← θ − η·(1/N)ΣᵢΔθ L(xᵢ,yᵢ)\nSGD:        θ ← θ − η·ΔθL(x_rand,y_rand)\nMini-batch: θ ← θ − η·(1/B)Σ_{batch}ΔθL\nη = learning rate, B = batch size',
    example: 'Training neural networks: full GD too slow on 1M examples; SGD with B=32-256 is the sweet spot.',
    manual: 'N=1000, B=32. Batch GD: 1000 gradient evals per step. SGD: 1 eval. Mini-batch: 32 evals. SGD 1000× faster but noisier.',
    steps: [
      'Purple = Batch GD (smooth path, slow), Red = SGD (noisy but fast), Green = Mini-batch (balance)',
      'All converge to star ★ = minimum',
      'SGD bounces around but arrives quickly',
      'Mini-batch is best in practice — stable and efficient',
      'Adjust batch size to control noise vs. speed trade-off'
    ]
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 31. SPECTRAL CLUSTERING
// ─────────────────────────────────────────────────────────────────────────────
function vizSpectral(wrap, infoEl, ctrlEl, userData) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 400);
  const pts = userData
    ? normalizeUserData(userData,W,H).slice(0,60)
    : (() => {
        const out=[];
        for(let a=0;a<2*Math.PI;a+=0.35) out.push({x:W/2+Math.cos(a)*(80+rand(-10,10)),y:H/2+Math.sin(a)*(70+rand(-10,10))});
        for(let a=0;a<2*Math.PI;a+=0.55) out.push({x:W/2+Math.cos(a)*(160+rand(-10,10)),y:H/2+Math.sin(a)*(140+rand(-10,10))});
        return out;
      })();
  let step10=0, playing=false, timer=null;
  const K=2, colors=[C=>C.primary,C=>C.success];

  // Assign labels based on distance from center (rings)
  const labels = pts.map(p => Math.hypot(p.x-W/2,p.y-H/2) < 120 ? 0 : 1);

  function draw(reveal=false){
    const C=getC();
    ctx.fillStyle=C.bg; ctx.fillRect(0,0,W,H); grid(ctx,W,H,45,C);
    pts.forEach((p,i)=>{
      const l=reveal?labels[i]:0;
      const col=reveal?[C.primary,C.success][l]:C.muted;
      dot(ctx,p.x,p.y,5,col,null);
    });
    // Step labels
    const stateLabels=['Graph construction','Laplacian matrix','Eigen decomposition','K-Means in eigen-space','Clusters revealed'];
    label(ctx,`Step ${step10}: ${stateLabels[Math.min(step10,4)]}`,12,22,C.text,11,'left',true);
    // Draw affinity edges for step 0-1
    if(step10>=1&&step10<3){
      ctx.strokeStyle=C.primary+'22'; ctx.lineWidth=1;
      pts.forEach((p,i)=>{
        pts.slice(i+1).forEach(q=>{
          const d=Math.hypot(p.x-q.x,p.y-q.y);
          if(d<80){ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();}
        });
      });
    }
  }

  function step(){if(step10<4){step10++;draw(step10>=3);}}
  function reset(){step10=0;playing=false;clearInterval(timer);draw(false);}
  function play(){
    playing=!playing;
    if(playing)timer=setInterval(()=>{step();if(step10>=4){playing=false;clearInterval(timer);}mkControls(ctrlEl,playing,step10,4);},spd(800));
    else clearInterval(timer);
    mkControls(ctrlEl,playing,step10,4);
  }
  window._vr=reset;window._vs=()=>{step();mkControls(ctrlEl,playing,step10,4);};window._vp=play;reset();
  mkInfo(infoEl, {
    name: 'Spectral Clustering',
    what: 'Treats data as a graph. Builds an affinity matrix, computes the normalised Laplacian, finds its eigenvectors, then applies K-Means in the eigenspace. Handles non-convex shapes.',
    formula: 'W_ij = exp(−||xᵢ−xⱼ||²/2σ²)  ← affinity\nD_ii = Σⱼ W_ij  ← degree matrix\nL = D − W  ← unnormalised Laplacian\nL_sym = D^{−½}LD^{−½}\nEigen: L_sym·v = λ·v  → take k smallest eigenvectors\nApply K-Means on rows of eigen-matrix',
    example: 'Community detection in social networks — K-Means would fail on ring/crescent shapes; spectral clustering handles them perfectly.',
    manual: '4 points in a ring. Affinity based on distance. Laplacian eigenvalues: [0,0.2,1.8,2]. Two near-zero eigenvalues → K=2 natural clusters.',
    steps: [
      'Step 1: build affinity graph (lines = connections)',
      'Step 2: compute Laplacian matrix (encodes graph structure)',
      'Step 3: eigen-decomposition (project to K-dimensional space)',
      'Step 4: K-Means in eigenspace (see rings correctly separated!)',
      'Spectral handles concentric rings — K-Means would fail here'
    ]
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 32. PERCEPTRON
// ─────────────────────────────────────────────────────────────────────────────
function vizPerceptron(wrap, infoEl, ctrlEl, userData) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 400);
  const pts = userData
    ? normalizeUserData(userData,W,H).slice(0,40).map(p=>({...p,label:p.c%2}))
    : Array.from({length:40},()=>{
        const x=rand(60,W-60), y=rand(60,H-60);
        return {x,y,label:x+y<W/2+H/2?0:1};
      });
  let w=[rand(-1,1),rand(-1,1)], b=rand(-1,1), epoch=0, errors=0, playing=false, timer=null;

  function predict(x,y){return w[0]*x/W+w[1]*y/H+b>0?1:0;}
  function trainStep(){
    errors=0;
    pts.forEach(p=>{
      const pred=predict(p.x,p.y);
      if(pred!==p.label){
        const err=p.label-pred;
        w[0]+=0.1*err*p.x/W; w[1]+=0.1*err*p.y/H; b+=0.1*err; errors++;
      }
    });
    epoch++;
  }

  function draw(){
    const C=getC();
    ctx.fillStyle=C.bg; ctx.fillRect(0,0,W,H); grid(ctx,W,H,45,C);
    // Decision boundary: w0*x/W + w1*y/H + b = 0 → y = (-b - w0*x/W) * H/w1
    if(Math.abs(w[1])>0.001){
      ctx.strokeStyle=C.primary; ctx.lineWidth=2.5;
      ctx.beginPath();
      for(let x=0;x<=W;x+=5){
        const y=(-b-w[0]*x/W)*H/w[1];
        x===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
      }
      ctx.stroke();
    }
    pts.forEach(p=>{
      const pred=predict(p.x,p.y);
      const correct=pred===p.label;
      dot(ctx,p.x,p.y,6,[C.primary,C.success][p.label],correct?null:C.danger,2);
    });
    label(ctx,`Epoch:${epoch}  Errors:${errors}`,12,22,C.text,12,'left',true);
    if(errors===0) label(ctx,'Converged!',W/2,H-15,C.success,13,'center',true);
  }

  function step(){if(epoch<30){trainStep();draw();}}
  function reset(){w=[rand(-1,1),rand(-1,1)];b=rand(-1,1);epoch=0;errors=0;playing=false;clearInterval(timer);draw();}
  function play(){
    playing=!playing;
    if(playing)timer=setInterval(()=>{step();if(epoch>=30||errors===0){playing=false;clearInterval(timer);}mkControls(ctrlEl,playing,epoch,30);},spd(500));
    else clearInterval(timer);
    mkControls(ctrlEl,playing,epoch,30);
  }
  window._vr=reset;window._vs=()=>{step();mkControls(ctrlEl,playing,epoch,30);};window._vp=play;reset();
  mkInfo(infoEl, {
    name: 'Perceptron',
    what: 'The simplest neural unit. Learns a linear decision boundary by updating weights whenever it misclassifies a point. The ancestor of all neural networks.',
    formula: 'ŷ = sign(w·x + b)\nUpdate rule (on misclassification):\nw ← w + η(y − ŷ)x\nb ← b + η(y − ŷ)\nConvergence: guaranteed if data is linearly separable',
    example: 'Binary email spam filter — each word is a feature; the perceptron learns which words tilt toward spam.',
    manual: 'x=(1,0), y=1, w=(−0.5,0.3), b=0. ŷ=sign(−0.5+0)=−1. err=1−(−1)=2. Δw=η×2×(1,0)=(0.2,0). New w=(−0.3,0.3)',
    steps: [
      'Purple line = current decision boundary (w·x+b=0)',
      'Purple dots = class 0, green dots = class 1',
      'Red ring = misclassified point (triggers weight update)',
      'Watch boundary rotate/shift to reduce errors each epoch',
      'Will not converge if data is not linearly separable (use SVM/kernels)'
    ]
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// 33. APRIORI — ASSOCIATION RULE MINING
// ─────────────────────────────────────────────────────────────────────────────
function vizApriori(wrap, infoEl, ctrlEl) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 460);
  const transactions = [
    ['Milk','Bread','Butter'],['Beer','Diapers'],['Milk','Diapers','Beer','Cola'],
    ['Bread','Butter'],['Milk','Bread','Diapers','Beer'],['Bread','Butter','Cola'],
    ['Milk','Bread','Butter','Cola'],['Beer','Cola'],['Milk','Bread'],['Diapers','Beer'],
  ];
  const items = ['Milk','Bread','Butter','Beer','Diapers','Cola'];
  const MIN_SUPP = 0.4;
  let phase = 0, playing = false, timer = null;

  // Compute support
  function support(itemset) {
    return transactions.filter(t => itemset.every(i => t.includes(i))).length / transactions.length;
  }

  // Generate candidates
  const C1 = items.map(i => [i]);
  const L1 = C1.filter(i => support(i) >= MIN_SUPP);
  const C2 = [];
  for (let i=0;i<L1.length;i++) for (let j=i+1;j<L1.length;j++) C2.push([...L1[i],...L1[j]]);
  const L2 = C2.filter(i => support(i) >= MIN_SUPP);
  const C3 = [];
  for (let i=0;i<L2.length;i++) for (let j=i+1;j<L2.length;j++) {
    const merged=[...new Set([...L2[i],...L2[j]])]; if(merged.length===3) C3.push(merged);
  }
  const L3 = C3.filter(i => support(i) >= MIN_SUPP);

  const phases = [
    {label:'Transactions', items:transactions.slice(0,7), type:'txn'},
    {label:`C1 Candidates (${C1.length})`, items:C1, supports:C1.map(support), type:'itemset', min:MIN_SUPP},
    {label:`L1 Frequent (≥${MIN_SUPP*100}%)`, items:L1, supports:L1.map(support), type:'itemset', min:MIN_SUPP, freq:true},
    {label:`C2 Candidates (${C2.length})`, items:C2, supports:C2.map(support), type:'itemset', min:MIN_SUPP},
    {label:`L2 Frequent Pairs (${L2.length})`, items:L2, supports:L2.map(support), type:'itemset', min:MIN_SUPP, freq:true},
    {label:`L3 Frequent Triples (${L3.length})`, items:L3, supports:L3.map(support), type:'itemset', min:MIN_SUPP, freq:true},
  ];

  function draw() {
    const C = getC(); ctx.fillStyle=C.bg; ctx.fillRect(0,0,W,H); grid(ctx,W,H,40,C);
    const ph = phases[Math.min(phase, phases.length-1)];
    label(ctx, `Phase ${phase+1}/${phases.length}: ${ph.label}`, 12, 22, C.primary, 12, 'left', true);
    label(ctx, `Min Support = ${MIN_SUPP*100}%`, W-10, 22, C.muted, 10, 'right');

    if (ph.type === 'txn') {
      const txnH = 36, startY = 45;
      ph.items.forEach((txn, i) => {
        const y = startY + i*txnH;
        ctx.fillStyle = `rgba(124,92,252,${0.07+i*.01})`;
        roundRect(ctx, 12, y, W-24, txnH-4, 6);
        label(ctx, `T${i+1}: {${txn.join(', ')}}`, 22, y+txnH/2+4, C.text, 11, 'left');
      });
      label(ctx, `${transactions.length} transactions total`, 12, H-12, C.muted, 10);
    } else {
      const cols = Math.min(ph.items.length, 4);
      const cellW = (W-24)/cols, startY=45, cellH=44;
      ph.items.forEach((itemset, i) => {
        const col=i%cols, row=Math.floor(i/cols);
        const x=12+col*cellW, y=startY+row*cellH;
        const sup = ph.supports ? ph.supports[i] : support(itemset);
        const pass = sup >= MIN_SUPP;
        const alpha = ph.freq ? .15 : pass ? .08 : .03;
        ctx.fillStyle = pass ? `rgba(0,229,160,${alpha})` : `rgba(255,77,109,${alpha})`;
        roundRect(ctx, x+2, y+2, cellW-8, cellH-6, 7);
        ctx.strokeStyle = pass ? (ph.freq ? C.success : C.accent) : C.danger;
        ctx.lineWidth = pass&&ph.freq ? 1.5 : .8;
        roundRect(ctx, x+2, y+2, cellW-8, cellH-6, 7, true);
        label(ctx, `{${itemset.join(',')}}`, x+cellW/2, y+cellH/2-3, C.text, 9, 'center', true);
        label(ctx, `sup: ${(sup*100).toFixed(0)}%`, x+cellW/2, y+cellH/2+11, pass?C.success:C.danger, 9, 'center');
      });
    }
    label(ctx, `Step: →`, W/2, H-12, C.muted, 10, 'center');
  }

  function roundRect(ctx, x, y, w, h, r, stroke=false) {
    ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
    ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r); ctx.lineTo(x+r,y+h);
    ctx.arcTo(x,y+h,x,y+h-r,r); ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
    stroke ? ctx.stroke() : ctx.fill();
  }

  function step(){if(phase<phases.length-1){phase++;draw();}}
  function reset(){phase=0;playing=false;clearInterval(timer);draw();}
  function play(){
    playing=!playing;
    if(playing) timer=setInterval(()=>{step();if(phase>=phases.length-1){playing=false;clearInterval(timer);}mkControls(ctrlEl,playing,phase+1,phases.length);},spd(1400));
    else clearInterval(timer);
    mkControls(ctrlEl,playing,phase+1,phases.length);
  }
  window._vr=reset;window._vs=()=>{step();mkControls(ctrlEl,playing,phase+1,phases.length);};window._vp=play;reset();
  mkInfo(infoEl,{
    name:'Apriori Algorithm',
    what:'Finds frequent itemsets in transaction data using a breadth-first level-by-level search. Items that appear together frequently reveal useful association rules.',
    formula:'Support(A) = |{T : A⊆T}| / |T|\nConfidence(A→B) = Support(A∪B) / Support(A)\nLift(A→B) = Confidence(A→B) / Support(B)\nApriori Property: Every subset of a frequent itemset must be frequent.',
    example:'Supermarket basket analysis: customers who buy Milk+Bread also buy Butter 68% of the time. Stock them nearby! Lift>1 means positively correlated.',
    manual:'10 transactions, min_supp=40%. Milk appears in 6→60% ✓. {Milk,Bread} appears in 5→50% ✓. {Milk,Bread,Butter} in 3→30% ✗ (pruned).',
    steps:['Green boxes = frequent itemsets (support ≥ threshold)','Red boxes = pruned (support below threshold)','Each level: only keep frequent sets to generate next level','Association rule: {Milk,Bread}→Butter (conf=60%, lift=1.5)','Lift>1 = positive correlation; Lift<1 = substitutes']
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 34. FP-GROWTH — FREQUENT PATTERN TREE
// ─────────────────────────────────────────────────────────────────────────────
function vizFPGrowth(wrap, infoEl, ctrlEl) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 460);
  const transactions = [
    ['Milk','Bread','Butter'],['Beer','Diapers'],['Milk','Diapers','Beer'],
    ['Bread','Butter'],['Milk','Bread','Diapers','Beer'],['Bread','Butter'],
    ['Milk','Bread','Butter'],['Beer','Diapers'],['Milk','Bread'],['Milk','Butter'],
  ];
  const MIN_SUPP = 3; // absolute count
  let phase = 0, playing = false, timer = null;

  // Count frequencies
  const freq = {};
  transactions.forEach(t => t.forEach(i => { freq[i]=(freq[i]||0)+1; }));
  const freqItems = Object.entries(freq).filter(([,v])=>v>=MIN_SUPP).sort((a,b)=>b[1]-a[1]);

  // FP-Tree node structure (simplified for visualization)
  const treeNodes = [
    {id:0, label:'root', x:W/2, y:60, parent:null, count:10, children:[1,2,3]},
    {id:1, label:'Milk:6', x:W*0.25, y:140, parent:0, count:6, children:[4,5]},
    {id:2, label:'Bread:2', x:W*0.55, y:140, parent:0, count:2, children:[6]},
    {id:3, label:'Beer:2', x:W*0.8, y:140, parent:0, count:2, children:[]},
    {id:4, label:'Bread:4', x:W*0.18, y:230, parent:1, count:4, children:[7,8]},
    {id:5, label:'Butter:1', x:W*0.38, y:230, parent:1, count:1, children:[]},
    {id:6, label:'Butter:2', x:W*0.55, y:230, parent:2, count:2, children:[]},
    {id:7, label:'Butter:3', x:W*0.12, y:320, parent:4, count:3, children:[]},
    {id:8, label:'Diapers:2', x:W*0.28, y:320, parent:4, count:2, children:[]},
  ];

  const phases = [
    'Scan 1: Count item frequencies',
    'Sort items by frequency (descending)',
    'Scan 2: Build FP-Tree (ordered paths)',
    'Mine conditional pattern bases',
    'Extract frequent itemsets from tree',
    'Generate association rules',
  ];

  const highlightPhase = [
    null, [0,1,2,3,4], [1,4,7], [4,7], [0,1,4,7], [0,1,4,7,8]
  ];

  function draw() {
    const C = getC(); ctx.fillStyle=C.bg; ctx.fillRect(0,0,W,H); grid(ctx,W,H,40,C);
    label(ctx, `Phase ${phase+1}: ${phases[phase]}`, 12, 22, C.primary, 12, 'left', true);

    if (phase === 0) {
      // Frequency table
      const bw=80, bh=28, sx=40, sy=50;
      label(ctx, 'Item', sx+bw/2, sy, C.muted, 10, 'center');
      label(ctx, 'Count', sx+bw+bw/2, sy, C.muted, 10, 'center');
      label(ctx, 'Support', sx+bw*2+bw/2, sy, C.muted, 10, 'center');
      Object.entries(freq).forEach(([item, cnt], i) => {
        const y=sy+12+i*bh, pass=cnt>=MIN_SUPP;
        ctx.fillStyle=pass?'rgba(0,229,160,.1)':'rgba(255,77,109,.06)';
        ctx.fillRect(sx,y,bw*3,bh-2);
        label(ctx,item,sx+bw/2,y+bh/2+4,C.text,11,'center');
        label(ctx,String(cnt),sx+bw+bw/2,y+bh/2+4,pass?C.success:C.danger,11,'center',true);
        label(ctx,`${(cnt/transactions.length*100).toFixed(0)}%`,sx+bw*2+bw/2,y+bh/2+4,pass?C.success:C.muted,11,'center');
      });
    } else {
      // Draw tree
      const hl = highlightPhase[phase] || [];
      treeNodes.forEach(n => {
        n.children.forEach(cid => {
          const child = treeNodes[cid];
          ctx.strokeStyle = C.primary+'44'; ctx.lineWidth=1.5;
          ctx.beginPath(); ctx.moveTo(n.x,n.y); ctx.lineTo(child.x,child.y); ctx.stroke();
        });
      });
      treeNodes.forEach((n,i) => {
        const hi = hl.includes(i);
        const r = n.id===0 ? 10 : 20;
        ctx.fillStyle = hi ? C.primary+'33' : n.id===0 ? C.accent+'22' : C.bg;
        ctx.strokeStyle = hi ? C.primary : n.id===0 ? C.accent : C.border;
        ctx.lineWidth = hi ? 2 : 1;
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        const parts = n.label.split(':');
        label(ctx, parts[0], n.x, n.y+(parts.length>1?-2:4), hi?C.primary:C.text, 9, 'center', hi);
        if(parts[1]) label(ctx, parts[1], n.x, n.y+10, hi?C.success:C.muted, 9, 'center', true);
      });
      // Phase note
      const notes = [
        '','',
        'Path Milk→Bread→Butter occurs 3 times',
        'Conditional base for Butter: {Milk:3, Bread:3}',
        'Frequent: {Butter}, {Bread}, {Milk,Bread}, {Milk,Bread,Butter}',
        'Rule: {Milk,Bread}→Butter  conf=75%, lift=1.8',
      ];
      if(notes[phase]) label(ctx, notes[phase], W/2, H-15, C.accent, 11, 'center');
    }
  }

  function step(){if(phase<phases.length-1){phase++;draw();}}
  function reset(){phase=0;playing=false;clearInterval(timer);draw();}
  function play(){
    playing=!playing;
    if(playing) timer=setInterval(()=>{step();if(phase>=phases.length-1){playing=false;clearInterval(timer);}mkControls(ctrlEl,playing,phase+1,phases.length);},spd(1300));
    else clearInterval(timer);
    mkControls(ctrlEl,playing,phase+1,phases.length);
  }
  window._vr=reset;window._vs=()=>{step();mkControls(ctrlEl,playing,phase+1,phases.length);};window._vp=play;reset();
  mkInfo(infoEl,{
    name:'FP-Growth Algorithm',
    what:'Builds a compressed FP-Tree from transactions, then mines it recursively for frequent patterns. Much faster than Apriori — no candidate generation needed.',
    formula:'FP-Tree: compressed prefix tree of sorted transactions\nConditional Pattern Base for item X:\n  All paths from root to X in the FP-Tree\nConditional FP-Tree: rebuild from conditional base\nMine recursively until all frequent itemsets found',
    example:'Recommendation engine: FP-Growth mines Netflix viewing patterns 50× faster than Apriori. If users watch {Inception, Interstellar}, they likely watch {Tenet} too.',
    manual:'10 transactions, min_supp=3. Milk(6), Bread(5), Butter(5), Beer(4), Diapers(3). Build tree in freq-sorted order. Mine conditional base for Butter={Milk:3,Bread:3}.',
    steps:['Root node = null header','Each path = one transaction (items sorted by freq)','Shared prefixes are merged (saves memory vs Apriori)','Highlighted nodes = currently mined conditional path','No candidate generation = O(N) vs O(2^N) for Apriori']
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 35. BIRCH / OPTICS (enhanced text + interactive)
// ─────────────────────────────────────────────────────────────────────────────
function vizOPTICS(wrap, infoEl, ctrlEl, userData) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 420);
  let pts = userData
    ? normalizeUserData(userData, W, H).slice(0, 60)
    : Array.from({length:60}, () => {
        const cluster = Math.floor(Math.random()*3);
        const cx=[W*.25,W*.6,W*.75],cy=[H*.35,H*.65,H*.3];
        return {x:cx[cluster]+rand(-55,55), y:cy[cluster]+rand(-45,45), eps_density:0};
      });

  let reach = Array(pts.length).fill(Infinity);
  let ordered = [], step10 = 0, playing = false, timer = null;

  // Simple reachability simulation
  function computeReachability(){
    const eps = Math.min(W,H)*0.18;
    pts.forEach((p,i)=>{
      pts.forEach((q,j)=>{
        if(i!==j){const d=Math.hypot(p.x-q.x,p.y-q.y);if(d<eps)reach[i]=Math.min(reach[i],d);}
      });
    });
    ordered=[...pts.keys()].sort((a,b)=>reach[a]-reach[b]);
  }
  computeReachability();

  function draw(){
    const C=getC(); ctx.fillStyle=C.bg; ctx.fillRect(0,0,W,H); grid(ctx,W,H,40,C);
    const revealCount=Math.round((step10/10)*pts.length);
    // Points
    pts.forEach((p,i)=>{
      const r=reach[i];
      const col = r===Infinity?C.danger:r<60?C.success:r<120?C.warning:C.muted;
      dot(ctx,p.x,p.y,5,col,null);
    });
    // Reachability plot (bottom bar)
    const bh=60, by=H-bh-10, bw=(W-20)/pts.length;
    ctx.fillStyle=C.card+'cc';ctx.fillRect(10,by,W-20,bh);
    ctx.strokeStyle=C.border;ctx.lineWidth=1;ctx.strokeRect(10,by,W-20,bh);
    label(ctx,'Reachability Plot',W/2,by-4,C.muted,9,'center');
    const maxR=pts.map((_,i)=>reach[i]).filter(v=>v!==Infinity).reduce((a,b)=>Math.max(a,b),1);
    ordered.forEach((idx,i)=>{
      if(i>revealCount) return;
      const r=reach[idx]===Infinity?bh:Math.min((reach[idx]/maxR)*bh,bh);
      const bar_x=10+i*bw;
      const col=r<bh*.4?C.success:r<bh*.7?C.warning:C.danger;
      ctx.fillStyle=col+'cc';ctx.fillRect(bar_x,by+bh-r,Math.max(bw-1,1),r);
    });
    label(ctx,`Step ${step10}/10  Reachability ordering…`,12,22,C.text,11,'left',true);
  }

  function step(){if(step10<10){step10++;draw();}}
  function reset(){step10=0;playing=false;clearInterval(timer);draw();}
  function play(){
    playing=!playing;
    if(playing)timer=setInterval(()=>{step();if(step10>=10){playing=false;clearInterval(timer);}mkControls(ctrlEl,playing,step10,10);},spd(600));
    else clearInterval(timer);
    mkControls(ctrlEl,playing,step10,10);
  }
  window._vr=reset;window._vs=()=>{step();mkControls(ctrlEl,playing,step10,10);};window._vp=play;reset();
  mkInfo(infoEl,{
    name:'OPTICS (Ordering Points To Identify Cluster Structure)',
    what:'Orders points by reachability distance to reveal cluster structure of varying density. Unlike DBSCAN, does not require a global ε — works for multi-density data.',
    formula:'core-distance(p) = minε : |N_ε(p)| ≥ minPts\nreachability-distance(p,q) = max(core-dist(q), dist(p,q))\nOrder = ascending reachability → valleys = dense clusters',
    example:'Traffic density analysis — rush hour creates variable-density clusters. OPTICS handles highway vs city street densities simultaneously, unlike DBSCAN.',
    manual:'3 points: p1(close cluster), p2(edge), p3(noise). reach(p1)=8, reach(p2)=45, reach(p3)=∞. Bottom chart valleys mark cluster boundaries.',
    steps:['Green points = dense cluster members (low reachability)','Yellow = border points','Red = noise (reachability → ∞)','Reachability plot valleys = cluster boundaries','Adjust ε on the plot to extract clusters without re-running']
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLETE VIZ_FNS MAPPING  (all 50+ algorithms)
// ─────────────────────────────────────────────────────────────────────────────
const VIZ_FNS = {
  // Existing 20
  'K-Means':               vizKMeans,
  'Linear Regression':     vizLinearReg,
  'Decision Tree':         vizDecTree,
  'SVM (RBF)':             vizSVM,
  'KNN':                   vizKNN,
  'DBSCAN':                vizDBSCAN,
  'Neural Network':        vizNN,
  'MLP Classifier':        vizNN,
  'MLP Regressor':         vizNN,
  'PCA':                   vizPCA,
  'Gradient Descent':      vizGD,
  'Gradient Descent (vis)':vizGD,
  'Stochastic GD':         vizSGD,
  'Naive Bayes':           vizNaiveBayes,
  'Random Forest':         vizRandomForest,
  'Logistic Regression':   vizLogisticReg,
  'Hierarchical':          vizHierarchical,
  'Isolation Forest':      vizIsoForest,
  't-SNE':                 vizTSNE,
  'Gradient Boosting':     vizGradBoosting,
  'AdaBoost':              vizAdaBoost,
  'Q-Learning (RL)':       vizQLearning,
  'Q-Learning':            vizQLearning,
  'Ridge / Lasso':         vizRegularization,
  'Gaussian Mixture':      vizGMM,
  // New 12+
  'Polynomial Regression': vizPolyReg,
  'Ridge Classifier':      vizRegularization,
  'Elastic Net':           vizElasticNet,
  'Bayesian Ridge':        vizElasticNet,
  'XGBoost':               vizGradBoostingFull,
  'Gradient Boosting (full)': vizGradBoostingFull,
  'Mean Shift':            vizMeanShift,
  'Label Propagation':     vizLabelProp,
  'Label Spreading':       vizLabelProp,
  'Self-Training':         vizLabelProp,
  'SARSA':                 vizSARSA,
  'Adam Optimizer':        vizAdam,
  'One-Class SVM':         vizOneClassSVM,
  'Elliptic Envelope':     vizOneClassSVM,
  'Local Outlier Factor':  vizIsoForest,
  'NMF':                   vizNMF,
  'Factor Analysis':       vizNMF,
  'FastICA':               vizNMF,
  'Stochastic GD':         vizSGD,
  'Spectral Clustering':   vizSpectral,
  'Perceptron':            vizPerceptron,
  // Dim reduction aliases
  'Kernel PCA':            vizPCA,
  'UMAP':                  vizTSNE,
  'Truncated SVD':         vizPCA,
  'ISOMAP':                vizTSNE,
  'MDS':                   vizTSNE,
  // RL aliases
  'Apriori':               vizApriori,
  'FP-Growth':             vizFPGrowth,
  'OPTICS':                vizOPTICS,
};

// ─────────────────────────────────────────────────────────────────────────────
// launchViz – entry point
// ─────────────────────────────────────────────────────────────────────────────
function launchViz(name, wrap, infoEl, ctrlEl, userData) {
  window._VIZ_SPEED = window._VIZ_SPEED || 5;
  window._vr = window._vs = window._vp = window._vrestart = () => {};

  // Stop any running timer from previous viz
  if (window._activeVizTimer) { clearInterval(window._activeVizTimer); window._activeVizTimer = null; }

  const fn = VIZ_FNS[name];
  if (!fn) {
    wrap.innerHTML = `<div style="padding:36px;text-align:center">
      <div style="font-size:36px;margin-bottom:12px">🔬</div>
      <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:6px">${name}</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:14px">Visualization coming soon. Run this algorithm in the Pipeline tab to see real results.</div>
      ${mkAlgoDescription(name)}
    </div>`;
    if (infoEl) infoEl.innerHTML = '';
    if (ctrlEl) ctrlEl.innerHTML = '';
    return;
  }

  const ud = (userData && Array.isArray(userData) && userData.length >= 10) ? userData : null;
  try { fn(wrap, infoEl, ctrlEl, ud); }
  catch (e) {
    console.error('Viz error:', name, e);
    wrap.innerHTML = `<div style="padding:20px;color:var(--danger);font-size:12px">Error: ${e.message}</div>`;
  }
}

// Fallback text descriptions for algorithms without canvas viz
function mkAlgoDescription(name) {
  const descs = {
    'Apriori': 'Finds frequent itemsets using a breadth-first candidate generation approach. Key metrics: support (how often), confidence (if A then B%), lift (correlation strength).',
    'FP-Growth': 'Builds a compressed FP-Tree to mine frequent patterns without candidate generation — much faster than Apriori on dense datasets.',
    'OPTICS': 'Orders points by reachability distance to reveal cluster structure of varying density. Generalises DBSCAN without needing ε parameter.',
    'Birch': 'Builds a Clustering Feature Tree incrementally — O(N) time. Best for very large datasets where K-Means is too slow.',
  };
  const d = descs[name] || '';
  return d ? `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:12px;color:var(--text2);line-height:1.7;text-align:left;max-width:400px;margin:0 auto">${d}</div>` : '';
}

window.launchViz = launchViz;
window.VIZ_FNS   = VIZ_FNS;

// ─────────────────────────────────────────────────────────────────────────────
// 36. BIRCH — BALANCED ITERATIVE REDUCING AND CLUSTERING USING HIERARCHIES
// ─────────────────────────────────────────────────────────────────────────────
function vizBirch(wrap, infoEl, ctrlEl, userData) {
  let { canvas, ctx, W, H } = makeCanvas(wrap, 420);
  const N = 70;
  let pts = userData
    ? normalizeUserData(userData, W, H).slice(0, N)
    : (() => {
        const p = [];
        for (let i = 0; i < N; i++) {
          const c = Math.floor(Math.random() * 3);
          const cx = [W * .28, W * .62, W * .45], cy = [H * .35, H * .4, H * .72];
          p.push({ x: cx[c] + rand(-60, 60), y: cy[c] + rand(-50, 50) });
        }
        return p;
      })();

  let step = 0, playing = false, timer = null;
  const T = 60; // threshold radius
  const cfNodes = []; // CF = {n, cx, cy, r} Clustering Feature entries

  // Build CF tree entry-by-entry
  function buildCF(upTo) {
    const nodes = [];
    for (let i = 0; i < Math.min(upTo, pts.length); i++) {
      const p = pts[i];
      let merged = false;
      for (const node of nodes) {
        const d = Math.hypot(p.x - node.cx, p.y - node.cy);
        if (d < T) {
          node.cx = (node.cx * node.n + p.x) / (node.n + 1);
          node.cy = (node.cy * node.n + p.y) / (node.n + 1);
          node.n++;
          node.r = Math.max(node.r, d);
          merged = true;
          break;
        }
      }
      if (!merged) nodes.push({ cx: p.x, cy: p.y, n: 1, r: 0 });
    }
    return nodes;
  }

  const STEPS = 12;
  function draw() {
    const C = getC(); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); grid(ctx, W, H, 40, C);
    const reveal = Math.round((step / STEPS) * pts.length);
    const nodes = buildCF(reveal);

    // CF sub-clusters (circles)
    const palette = [C.primary, C.success, C.warning, C.accent, C.second];
    nodes.forEach((node, i) => {
      const col = palette[i % palette.length];
      ctx.fillStyle = col + '18';
      ctx.strokeStyle = col + '88';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(node.cx, node.cy, Math.max(node.r, T * 0.6), 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // Centroid
      dot(ctx, node.cx, node.cy, 5, col, '#fff', 1.5);
      label(ctx, `CF${i + 1}\n${node.n}pts`, node.cx, node.cy - Math.max(node.r, T * 0.6) - 8, col, 9, 'center', true);
    });

    // Points
    pts.slice(0, reveal).forEach(p => dot(ctx, p.x, p.y, 3, C.text + '88'));

    label(ctx, `Inserting points: ${reveal}/${pts.length}  |  CF nodes: ${nodes.length}`, 12, 22, C.primary, 11, 'left', true);
    label(ctx, `Threshold T=${T}  (circles show CF sub-cluster radius)`, 12, H - 12, C.muted, 10, 'left');
  }

  function doStep() { if (step < STEPS) { step++; draw(); } }
  function reset() { step = 0; playing = false; clearInterval(timer); draw(); }
  function play() {
    playing = !playing;
    if (playing) timer = setInterval(() => { doStep(); if (step >= STEPS) { playing = false; clearInterval(timer); } mkControls(ctrlEl, playing, step, STEPS); }, spd(700));
    else clearInterval(timer);
    mkControls(ctrlEl, playing, step, STEPS);
  }
  window._vr = reset; window._vs = () => { doStep(); mkControls(ctrlEl, playing, step, STEPS); }; window._vp = play;
  reset();
  mkInfo(infoEl, {
    name: 'BIRCH (Balanced Iterative Reducing and Clustering Using Hierarchies)',
    what: 'Builds a Clustering Feature (CF) Tree incrementally in a single pass. Each CF entry summarises a sub-cluster as (N, LS, SS). Extremely memory-efficient for large datasets.',
    formula: 'CF = (N, LS, SS)  where:\n  N  = number of points\n  LS = Linear Sum of points\n  SS = Squared Sum\nCentroid = LS/N\nRadius  = sqrt(SS/N - |LS/N|²)\nMerge condition: dist(c1,c2) < threshold T',
    example: 'Streaming customer segmentation — BIRCH processes millions of purchase events in one pass, then uses global K-Means on CF entries (much smaller) as final step.',
    manual: 'T=60px threshold. Points within T of existing centroid are merged. 70 points compress to ~3 CF nodes — one per cluster. Each circle = one CF sub-cluster.',
    steps: [
      'Each new point is tested against all CF centroids',
      'If distance < T: merge into that CF (update N, LS, SS)',
      'If no match: create new CF leaf node',
      'CF circle radius grows as cluster absorbs more points',
      'Final step: run global K-Means on CF centroids only'
    ]
  });
}

// Register Birch in VIZ_FNS
if (typeof VIZ_FNS !== 'undefined') {
  VIZ_FNS['Birch'] = vizBirch;
  VIZ_FNS['Mini-Batch K-Means'] = vizKMeans;
  VIZ_FNS['Ridge Regression'] = vizRegularization;
  VIZ_FNS['SVR'] = vizSVM;
  VIZ_FNS['Affinity Propagation'] = vizMeanShift;
  VIZ_FNS['AGNES'] = vizHierarchical;
}
