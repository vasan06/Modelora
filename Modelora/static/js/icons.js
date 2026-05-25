/**
 * icons.js — ML Dashboard SVG Icon System
 * All icons are inline SVG, sized via currentColor / width/height attrs.
 * Usage: ICONS.brain(20) → SVG string at 20px
 */

const ICONS = (() => {
  const svg = (path, vb = '0 0 24 24', extra = '') =>
    (size = 18) =>
      `<svg width="${size}" height="${size}" viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra} style="display:inline-block;vertical-align:middle;flex-shrink:0">${path}</svg>`;

  const filled = (path, vb = '0 0 24 24') =>
    (size = 18) =>
      `<svg width="${size}" height="${size}" viewBox="${vb}" fill="currentColor" ${''} style="display:inline-block;vertical-align:middle;flex-shrink:0">${path}</svg>`;

  return {
    // ── Brand / Logo ────────────────────────────────────────────────────────
    logo: filled(`<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>`, '0 0 24 24'),

    // Custom ML brain logo — neural network nodes
    mlLogo: (size = 40) => {
      const uid = 'lg' + Math.random().toString(36).slice(2,6);
      return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="g1${uid}" x1="0" y1="0" x2="48" y2="48">
            <stop offset="0%" stop-color="#7c5cfc"/>
            <stop offset="100%" stop-color="#00d4ff"/>
          </linearGradient>
          <linearGradient id="g2${uid}" x1="0" y1="48" x2="48" y2="0">
            <stop offset="0%" stop-color="#e040fb"/>
            <stop offset="100%" stop-color="#00e5a0"/>
          </linearGradient>
        </defs>
        <!-- Rounded square base -->
        <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#g1${uid})" opacity=".1"/>
        <rect x="2" y="2" width="44" height="44" rx="13" stroke="url(#g1${uid})" stroke-width="1.5"/>
        <!-- Neural network node cluster — abstract, no letters -->
        <!-- Left node -->
        <circle cx="13" cy="24" r="4" fill="url(#g1${uid})" opacity=".9"/>
        <!-- Right node -->
        <circle cx="35" cy="24" r="4" fill="url(#g1${uid})" opacity=".9"/>
        <!-- Top-center node -->
        <circle cx="24" cy="13" r="4" fill="url(#g2${uid})" opacity=".9"/>
        <!-- Bottom-center node -->
        <circle cx="24" cy="35" r="3" fill="#00e5a0" opacity=".95"/>
        <!-- Center node - bright -->
        <circle cx="24" cy="24" r="5.5" fill="url(#g1${uid})"/>
        <circle cx="24" cy="24" r="3" fill="#fff" opacity=".9"/>
        <!-- Connections -->
        <line x1="17" y1="24" x2="18.5" y2="24" stroke="url(#g1${uid})" stroke-width="1.2" opacity=".6"/>
        <line x1="29.5" y1="24" x2="31" y2="24" stroke="url(#g1${uid})" stroke-width="1.2" opacity=".6"/>
        <line x1="24" y1="17" x2="24" y2="18.5" stroke="url(#g2${uid})" stroke-width="1.2" opacity=".6"/>
        <line x1="24" y1="29.5" x2="24" y2="32" stroke="#00e5a0" stroke-width="1.2" opacity=".6"/>
        <line x1="16.8" y1="21.2" x2="21.2" y2="16.8" stroke="url(#g1${uid})" stroke-width="1" opacity=".35"/>
        <line x1="26.8" y1="16.8" x2="31.2" y2="21.2" stroke="url(#g1${uid})" stroke-width="1" opacity=".35"/>
        <line x1="16.8" y1="26.8" x2="21.2" y2="31.2" stroke="url(#g2${uid})" stroke-width="1" opacity=".35"/>
        <line x1="26.8" y1="31.2" x2="31.2" y2="26.8" stroke="url(#g2${uid})" stroke-width="1" opacity=".35"/>
      </svg>`;
    },
    // ── Navigation ──────────────────────────────────────────────────────────
    overview:    svg(`<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>`),
    dataset:     svg(`<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>`),
    preprocess:  svg(`<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>`),
    results:     svg(`<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>`),
    charts:      svg(`<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>`),
    whatif:      svg(`<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17" stroke-width="3"/>`),
    arena:       svg(`<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>`),
    visualizer:  svg(`<polygon points="5 3 19 12 5 21 5 3"/>`),
    history:     svg(`<polyline points="12 8 12 12 14 14"/><path d="M3.05 11a9 9 0 1 1 .5 4m-.5-4v-4h4"/>`),
    upload:      svg(`<polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>`),
    download:    svg(`<polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.11"/>`),
    export:      svg(`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>`),
    settings:    svg(`<circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M4.93 19.07l1.41-1.41M19.07 19.07l-1.41-1.41M12 2v2m0 16v2M2 12h2m16 0h2"/>`),
    config:      svg(`<line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="20" y2="12"/><line x1="12" y1="18" x2="20" y2="18"/><circle cx="4" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="8" cy="18" r="2" fill="currentColor" stroke="none"/>`),
    announce:    svg(`<path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"/>`),

    // ── Admin nav icons ─────────────────────────────────────────────────────
    liveIcon:    svg(`<circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/>`),
    health:      svg(`<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>`),
    users:       svg(`<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`),
    sessions:    svg(`<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>`),
    audit:       svg(`<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>`),
    experiments: svg(`<path d="M6 2v6l4 4-4 4v6h12v-6l-4-4 4-4V2z"/><line x1="12" y1="10" x2="12" y2="14"/>`),
    security:    svg(`<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>`),
    customise:   svg(`<circle cx="12" cy="12" r="3"/><path d="M20.188 10.934l.94-1.625a1 1 0 0 0-.364-1.366l-1-.577a1 1 0 0 1-.5-.866V5.5a1 1 0 0 0-1-1h-1a1 1 0 0 1-.707-.293L15.85 3.5a1 1 0 0 0-1.414 0l-.707.707A1 1 0 0 1 13.022 4.5h-1a1 1 0 0 0-1 1v1a1 1 0 0 1-.5.866l-1 .577a1 1 0 0 0-.364 1.366l.94 1.625"/>`),

    // ── ML / Data icons ─────────────────────────────────────────────────────
    brain:       svg(`<path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.88A2.5 2.5 0 0 1 9.5 2"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.88A2.5 2.5 0 0 0 14.5 2"/>`),
    algorithm:   svg(`<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>`),
    model:       svg(`<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m9 9 6 6m-6 0 6-6"/>`),
    pipeline:    svg(`<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><line x1="7" y1="12" x2="10" y2="12"/><line x1="14" y1="12" x2="17" y2="12"/>`),
    scatter:     svg(`<circle cx="7.5" cy="16.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="11" cy="7" r="1.5" fill="currentColor" stroke="none"/><circle cx="16.5" cy="11.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="13.5" cy="17.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="5.5" cy="10.5" r="1.5" fill="currentColor" stroke="none"/>`),
    cluster:     svg(`<circle cx="8" cy="8" r="4"/><circle cx="16" cy="16" r="4"/><circle cx="8" cy="16" r="1.5" fill="currentColor" stroke="none"/><circle cx="16" cy="8" r="1.5" fill="currentColor" stroke="none"/>`),
    tree:        svg(`<path d="M17 12h-5V6"/><path d="M17 18h-7a4 4 0 0 1-4-4V6"/><circle cx="17" cy="6" r="2"/><circle cx="17" cy="12" r="2"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="6" r="2"/>`),
    network:     svg(`<circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><line x1="12" y1="7" x2="5" y2="17"/><line x1="12" y1="7" x2="19" y2="17"/><line x1="5" y1="17" x2="19" y2="17"/>`),
    regression:  svg(`<line x1="3" y1="20" x2="21" y2="4"/><circle cx="6" cy="17" r="1.5" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="14" cy="8" r="1.5" fill="currentColor" stroke="none"/><circle cx="18" cy="6" r="1.5" fill="currentColor" stroke="none"/>`),
    metric:      svg(`<path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/>`),

    // ── UI / Actions ────────────────────────────────────────────────────────
    play:        svg(`<polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none"/>`),
    pause:       svg(`<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`),
    reset:       svg(`<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3"/>`),
    step:        svg(`<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>`),
    close:       svg(`<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`),
    check:       svg(`<polyline points="20 6 9 17 4 12"/>`),
    warning:     svg(`<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17" stroke-width="3"/>`),
    error:       svg(`<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>`),
    info:        svg(`<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16" stroke-width="3"/>`),
    success:     svg(`<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>`),
    lock:        svg(`<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`),
    unlock:      svg(`<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>`),
    user:        svg(`<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`),
    logout:      svg(`<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>`),
    filter:      svg(`<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>`),
    search:      svg(`<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>`),
    refresh:     svg(`<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>`),
    menu:        svg(`<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>`),
    chevronDown: svg(`<polyline points="6 9 12 15 18 9"/>`),
    chevronRight:svg(`<polyline points="9 18 15 12 9 6"/>`),
    sun:         svg(`<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`),
    moon:        svg(`<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`),
    expand:      svg(`<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>`),
    collapse:    svg(`<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>`),
    save:        svg(`<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13"/><polyline points="7 3 7 8 15 8"/>`),
    trash:       svg(`<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>`),
    edit:        svg(`<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>`),
    eye:         svg(`<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`),
    link:        svg(`<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>`),
    cpu:         svg(`<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>`),
    disk:        svg(`<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>`),
    memory:      svg(`<path d="M6 19v-3M10 19v-3M14 19v-3M18 19v-3M8 11V9m0 0V7a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m0 0v2M8 9h8"/><rect x="3" y="11" width="18" height="8" rx="2"/>`),
    globe:       svg(`<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>`),
    speed:       svg(`<path d="M12 2a10 10 0 0 1 10 10"/><polyline points="12 6 12 12 16 14"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>`),

    // ── Dataset icons ────────────────────────────────────────────────────────
    table:       svg(`<path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 0-2-2V9m0 0h18"/>`),
    barChart:    svg(`<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>`),
    lineChart:   svg(`<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>`),
    pieChart:    svg(`<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>`),
    heatmap:     svg(`<rect x="3" y="3" width="4" height="4" rx=".5"/><rect x="10" y="3" width="4" height="4" rx=".5" opacity=".6"/><rect x="17" y="3" width="4" height="4" rx=".5" opacity=".3"/><rect x="3" y="10" width="4" height="4" rx=".5" opacity=".6"/><rect x="10" y="10" width="4" height="4" rx=".5"/><rect x="17" y="10" width="4" height="4" rx=".5" opacity=".6"/><rect x="3" y="17" width="4" height="4" rx=".5" opacity=".3"/><rect x="10" y="17" width="4" height="4" rx=".5" opacity=".6"/><rect x="17" y="17" width="4" height="4" rx=".5"/>`),
    scatter3d:   svg(`<circle cx="7" cy="16" r="2" fill="currentColor" stroke="none"/><circle cx="12" cy="8" r="2" fill="currentColor" stroke="none"/><circle cx="17" cy="13" r="2" fill="currentColor" stroke="none"/><circle cx="5" cy="11" r="2" fill="currentColor" stroke="none"/><path d="M3 20 L21 4" stroke-width="1" opacity=".3"/>`),

    // ── Algo category icons ──────────────────────────────────────────────────
    supervised:  svg(`<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>`),
    unsupervised:svg(`<circle cx="8" cy="8" r="4"/><circle cx="17" cy="16" r="4"/><line x1="8" y1="8" x2="17" y2="16" stroke-width="1" opacity=".5"/>`),
    semisupervised: svg(`<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/><circle cx="12" cy="12" r="4" opacity=".4" fill="currentColor" stroke="none"/>`),
    rl:          svg(`<path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 .49-3"/>`),

    // ── Status / misc ────────────────────────────────────────────────────────
    online:      filled(`<circle cx="12" cy="12" r="6"/>`),
    loading:     svg(`<line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>`),
    plus:        svg(`<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>`),
    minus:       svg(`<line x1="5" y1="12" x2="19" y2="12"/>`),
    arrowRight:  svg(`<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>`),
    arrowUp:     svg(`<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>`),
    arrowDown:   svg(`<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>`),
    drag:        svg(`<circle cx="9" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="19" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="19" r="1" fill="currentColor" stroke="none"/>`),
    turtle:      svg(`<path d="M12 6C7 6 4 8.5 4 12s3 6 8 6 8-2.5 8-6-3-6-8-6z"/><path d="M8 6V4m8 2V4m-4 14v2m-3-2l-2 2m10-2l2 2"/>`),
    rabbit:      svg(`<path d="M20 8c0-3.31-2.69-6-6-6-2.06 0-3.87 1.04-4.97 2.62"/><path d="M4 8c0-1.1.9-2 2-2h2v4H6c-1.1 0-2-.9-2-2z"/><path d="M16 10h2c1.1 0 2 .9 2 2v2c0 1.1-.9 2-2 2h-2"/><path d="M8 16c0 2.21 1.79 4 4 4s4-1.79 4-4"/><path d="M8 10v8"/><path d="M16 10v6"/>`),
  };
})();

// ── Icon helper for use in HTML strings ────────────────────────────────────
window.ICONS = ICONS;

// ── Render icon into element ───────────────────────────────────────────────
function renderIcon(name, size = 16, color = '') {
  const fn = ICONS[name];
  if (!fn) return '';
  const result = fn(size);
  if (color) return result.replace('stroke="currentColor"', `stroke="${color}"`).replace('fill="currentColor"', `fill="${color}"`);
  return result;
}
window.renderIcon = renderIcon;

/* ═══════════════════════════════════════════════════════════
   LIVE ANIMATED LOGOS — three distinct designs
   ═══════════════════════════════════════════════════════════

   Login page   → DNA / double-helix  (rotating spiral of nodes)
   User dash    → Orbital rings       (planets orbiting core)
   Admin dash   → Fractal tree        (branching neural tree)

   Each draws into a <canvas> and is fully self-contained.
   Call initLogoCanvas(canvasId, variant) from DOMContentLoaded.
   ═══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  // ── Shared helpers ─────────────────────────────────────────
  function prepCanvas(id, size) {
    const cv = document.getElementById(id);
    if (!cv) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width  = size * dpr;
    cv.height = size * dpr;
    cv.style.width  = size + 'px';
    cv.style.height = size + 'px';
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    return { cv, ctx, size, dpr };
  }

  function hsl(h, s, l, a = 1) {
    return `hsla(${h},${s}%,${l}%,${a})`;
  }

  // ── Variant 1: DNA Helix  (Login page) ─────────────────────
  function drawDNA(ctx, size, t) {
    ctx.clearRect(0, 0, size, size);
    const cx = size / 2, cy = size / 2;
    const r = size * 0.38;
    const turns = 2.5;
    const nodes = 28;

    // Two strands, offset by π
    for (let strand = 0; strand < 2; strand++) {
      const offset = strand * Math.PI;
      ctx.beginPath();
      let first = true;
      for (let i = 0; i <= nodes * 4; i++) {
        const frac = i / (nodes * 4);
        const angle = frac * turns * Math.PI * 2 + t * 0.6 + offset;
        const y = cy - r + frac * r * 2;
        const x = cx + Math.cos(angle) * (r * 0.45 * Math.sin(frac * Math.PI));
        if (first) { ctx.moveTo(x, y); first = false; }
        else ctx.lineTo(x, y);
      }
      const col = strand === 0 ? [252, 92, 140] : [92, 200, 252];
      ctx.strokeStyle = `rgba(${col},0.5)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Cross-links + nodes
    for (let i = 0; i <= nodes; i++) {
      const frac = i / nodes;
      const angle = frac * turns * Math.PI * 2 + t * 0.6;
      const y = cy - r + frac * r * 2;
      const envelope = Math.sin(frac * Math.PI);
      const xA = cx + Math.cos(angle)           * (r * 0.45 * envelope);
      const xB = cx + Math.cos(angle + Math.PI) * (r * 0.45 * envelope);

      // Rung
      const rungAlpha = 0.15 + 0.15 * envelope;
      ctx.beginPath(); ctx.moveTo(xA, y); ctx.lineTo(xB, y);
      ctx.strokeStyle = `rgba(200,180,255,${rungAlpha})`; ctx.lineWidth = 0.8; ctx.stroke();

      // Node dots
      const pulse = (Math.sin(t * 2 + i * 0.7) + 1) / 2;
      [{ x: xA, c: [252, 92, 200] }, { x: xB, c: [92, 200, 252] }].forEach(({ x, c }) => {
        const nr = 2.2 + pulse * 1.2;
        ctx.beginPath(); ctx.arc(x, y, nr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${c},${0.7 + pulse * 0.3})`;
        ctx.shadowColor = `rgba(${c},0.8)`; ctx.shadowBlur = 8;
        ctx.fill(); ctx.shadowBlur = 0;
      });
    }

    // Center glow
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.3);
    glow.addColorStop(0, 'rgba(124,92,252,0.15)');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, size, size);
  }

  // ── Variant 2: Orbital Rings  (User Dashboard) ─────────────
  function drawOrbital(ctx, size, t) {
    ctx.clearRect(0, 0, size, size);
    const cx = size / 2, cy = size / 2;

    // Orbits
    const orbits = [
      { r: size * 0.32, speed: 0.8,  color: [124, 92, 252], tilt: 0.3,  nodes: 1 },
      { r: size * 0.22, speed: -1.3, color: [0, 229, 160],  tilt: -0.5, nodes: 2 },
      { r: size * 0.14, speed: 2.1,  color: [0, 212, 255],  tilt: 0.8,  nodes: 1 },
    ];

    orbits.forEach(({ r, speed, color, tilt, nodes: n }) => {
      // Ellipse (tilted orbit ring)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(tilt);
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.35, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${color},0.18)`; ctx.lineWidth = 1; ctx.stroke();

      // Orbiting planets
      for (let i = 0; i < n; i++) {
        const angle = t * speed + (i / n) * Math.PI * 2;
        const px = Math.cos(angle) * r;
        const py = Math.sin(angle) * r * 0.35;
        const depth = (Math.sin(angle) + 1) / 2; // 0=back, 1=front
        const pr = 3 + depth * 3;
        const alpha = 0.4 + depth * 0.6;

        const g = ctx.createRadialGradient(px, py, 0, px, py, pr * 1.8);
        g.addColorStop(0, `rgba(${color},${alpha})`);
        g.addColorStop(1, 'transparent');
        ctx.shadowColor = `rgba(${color},0.9)`; ctx.shadowBlur = 12 * depth;
        ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0;
      }
      ctx.restore();
    });

    // Core star
    const pulse = (Math.sin(t * 1.5) + 1) / 2;
    const coreR = size * 0.08 + pulse * size * 0.02;
    const coreG = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2);
    coreG.addColorStop(0, 'rgba(255,255,255,0.95)');
    coreG.addColorStop(0.4, 'rgba(124,92,252,0.8)');
    coreG.addColorStop(1, 'transparent');
    ctx.shadowColor = 'rgba(124,92,252,0.9)'; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fillStyle = coreG; ctx.fill(); ctx.shadowBlur = 0;
  }

  // ── Variant 3: Fractal Tree  (Admin Dashboard) ─────────────
  function drawFractalTree(ctx, size, t) {
    ctx.clearRect(0, 0, size, size);

    // Dark bg
    const bg = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size*0.6);
    bg.addColorStop(0, 'rgba(18,8,40,1)'); bg.addColorStop(1, 'rgba(8,4,20,1)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);

    function branch(x1, y1, angle, len, depth) {
      if (depth === 0 || len < 1.5) return;
      const x2 = x1 + Math.cos(angle) * len;
      const y2 = y1 + Math.sin(angle) * len;
      const pulse = (Math.sin(t * 1.5 + depth * 0.9) + 1) / 2;
      const h = 240 + depth * 20 + pulse * 40;
      const alpha = 0.15 + (depth / 7) * 0.6 + pulse * 0.15;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.strokeStyle = hsl(h, 70, 60, alpha);
      ctx.lineWidth = Math.max(0.5, depth * 0.4);
      ctx.stroke();

      if (depth <= 2) {
        // Leaf glow
        const lg = ctx.createRadialGradient(x2, y2, 0, x2, y2, 3 + pulse * 2);
        lg.addColorStop(0, hsl(h, 90, 75, 0.8 + pulse * 0.2));
        lg.addColorStop(1, 'transparent');
        ctx.beginPath(); ctx.arc(x2, y2, 3 + pulse * 2, 0, Math.PI * 2);
        ctx.fillStyle = lg; ctx.fill();
      }

      const swing = Math.sin(t * 0.4 + depth) * 0.08;
      const angleL = angle - 0.45 - swing;
      const angleR = angle + 0.45 + swing;
      branch(x2, y2, angleL, len * 0.68, depth - 1);
      branch(x2, y2, angleR, len * 0.68, depth - 1);
    }

    const rootLen = size * 0.28;
    branch(size / 2, size * 0.88, -Math.PI / 2, rootLen, 7);

    // Root glow
    const rg = ctx.createRadialGradient(size/2, size*0.88, 0, size/2, size*0.88, 8);
    rg.addColorStop(0, 'rgba(0,229,160,0.7)'); rg.addColorStop(1, 'transparent');
    ctx.beginPath(); ctx.arc(size/2, size*0.88, 4, 0, Math.PI*2);
    ctx.fillStyle = rg; ctx.fill();
  }

  // ── Animation loop for a single canvas ─────────────────────
  function animate(id, size, drawFn) {
    const c = prepCanvas(id, size);
    if (!c) return;
    const { ctx } = c;
    let t = 0;
    let running = true;
    function loop() {
      if (!running || !document.body.contains(c.cv)) { running = false; return; }
      drawFn(ctx, size, t);
      t += 0.022;
      requestAnimationFrame(loop);
    }
    loop();
    return () => { running = false; };
  }

  // ── Public API ──────────────────────────────────────────────
  window.initLogoCanvas = function(id, variant, size) {
    size = size || 76;
    const map = { dna: drawDNA, orbital: drawOrbital, tree: drawFractalTree };
    return animate(id, size, map[variant] || drawDNA);
  };

  // ── Login background particle network ────────────────────
  function initBgParticles(id) {
    const cv = document.getElementById(id);
    if (!cv) return;
    const ctx = cv.getContext('2d');
    let W, H, nodes = [];
    function resize() {
      W = cv.width = window.innerWidth;
      H = cv.height = window.innerHeight;
      nodes = Array.from({length: 55}, () => ({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35,
        r: 1.2 + Math.random() * 2, phase: Math.random() * Math.PI * 2
      }));
    }
    window.addEventListener('resize', resize); resize();
    let t = 0;
    function loop() {
      ctx.clearRect(0, 0, W, H);
      const light = document.documentElement.getAttribute('data-theme') === 'light';
      const nc = light ? '80,40,200,' : '124,92,252,';
      nodes.forEach(n => {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0) n.x = W; if (n.x > W) n.x = 0;
        if (n.y < 0) n.y = H; if (n.y > H) n.y = 0;
        const p = (Math.sin(t * .025 + n.phase) + 1) / 2;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r + p * .6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + nc + (0.35 + p * .35) + ')'; ctx.fill();
      });
      for (let i = 0; i < nodes.length; i++) for (let j = i+1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
        const d = Math.sqrt(dx*dx + dy*dy);
        if (d < 115) {
          ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.strokeStyle = 'rgba(' + nc + (.13 * (1 - d/115)) + ')';
          ctx.lineWidth = .6; ctx.stroke();
        }
      }
      t++; requestAnimationFrame(loop);
    }
    loop();
  }

  // Auto-init on DOMContentLoaded for known canvas IDs
  document.addEventListener('DOMContentLoaded', () => {
    // Shared live Modelora orbital logo
    if (document.getElementById('logo-canvas'))       animate('logo-canvas',       76,  drawOrbital);
    // Login background particles
    if (document.getElementById('ml-bg-canvas'))      initBgParticles('ml-bg-canvas');
    // User dashboard sidebar logo (orbital)
    if (document.getElementById('user-logo-cv'))      animate('user-logo-cv',      36,  drawOrbital);
    // Admin dashboard sidebar logo
    if (document.getElementById('admin-logo-cv'))     animate('admin-logo-cv',     36,  drawOrbital);
    if (document.getElementById('landing-logo-cv'))   animate('landing-logo-cv',   36,  drawOrbital);
    if (document.getElementById('landing-footer-logo-cv')) animate('landing-footer-logo-cv', 36, drawOrbital);
    // Dashboard loader (orbital)
    if (document.getElementById('loader-canvas'))     animate('loader-canvas',    120,  drawOrbital);
    // Admin loader
    if (document.getElementById('admin-loader-cv'))   animate('admin-loader-cv',   90,  drawOrbital);
  });
}());
