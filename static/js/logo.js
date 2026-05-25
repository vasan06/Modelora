(function () {
  const SELECTOR = '#landing-logo-cv,#landing-footer-logo-cv,#user-logo-cv,#logo-canvas,#loader-canvas';

  function mount(canvas) {
    if (!canvas || canvas.dataset.modeloraLogoMounted === '1') return;
    canvas.dataset.modeloraLogoMounted = '1';
    const ctx = canvas.getContext('2d');
    let frame = 0;

    function render() {
      const w = canvas.width || canvas.clientWidth || 48;
      const h = canvas.height || canvas.clientHeight || 48;
      const s = Math.min(w, h);
      const cx = w / 2;
      const cy = h / 2;
      const dark = document.documentElement.getAttribute('data-theme') !== 'light';
      frame += 1;

      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(cx, cy);

      const pad = s * 0.08;
      const r = s / 2 - pad;
      const bg = ctx.createLinearGradient(-r, -r, r, r);
      bg.addColorStop(0, dark ? 'rgba(8,13,30,.95)' : 'rgba(255,255,255,.95)');
      bg.addColorStop(1, dark ? 'rgba(18,28,52,.95)' : 'rgba(230,238,255,.95)');
      ctx.fillStyle = bg;
      roundRect(ctx, -r, -r, r * 2, r * 2, s * 0.22);
      ctx.fill();

      const a = frame * 0.035;
      ctx.rotate(a);
      const ring = ctx.createLinearGradient(-r, 0, r, 0);
      ring.addColorStop(0, '#00d4ff');
      ring.addColorStop(0.48, '#7c5cff');
      ring.addColorStop(1, '#e040fb');
      ctx.strokeStyle = ring;
      ctx.lineWidth = Math.max(2, s * 0.075);
      ctx.lineCap = 'round';
      ctx.setLineDash([r * 1.25, r * 0.42]);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.rotate(-a);

      ctx.lineWidth = Math.max(1, s * 0.035);
      ctx.strokeStyle = dark ? 'rgba(124,92,252,.45)' : 'rgba(90,46,216,.38)';
      const nodes = [
        [-0.36, -0.14], [-0.12, -0.36], [0.16, -0.16],
        [0.38, -0.34], [0.36, 0.18], [0.02, 0.36], [-0.32, 0.28],
      ].map(([x, y]) => [x * s, y * s]);
      for (let i = 0; i < nodes.length; i++) {
        const [x1, y1] = nodes[i];
        const [x2, y2] = nodes[(i + 2) % nodes.length];
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      nodes.forEach(([x, y], i) => {
        const pulse = 1 + 0.18 * Math.sin(frame * 0.08 + i);
        const nr = s * 0.055 * pulse;
        const g = ctx.createRadialGradient(x, y, 0, x, y, nr * 3);
        g.addColorStop(0, i % 2 ? '#e040fb' : '#00d4ff');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, nr * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = i % 2 ? '#e040fb' : '#00d4ff';
        ctx.beginPath();
        ctx.arc(x, y, nr, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.strokeStyle = dark ? '#eef2ff' : '#1a2040';
      ctx.lineWidth = Math.max(2, s * 0.07);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-s * 0.28, s * 0.23);
      ctx.lineTo(-s * 0.28, -s * 0.18);
      ctx.lineTo(0, s * 0.09);
      ctx.lineTo(s * 0.28, -s * 0.18);
      ctx.lineTo(s * 0.28, s * 0.23);
      ctx.stroke();

      ctx.restore();
      requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function boot() {
    document.querySelectorAll(SELECTOR).forEach(mount);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.ModeloraLogo = { mount };
})();
