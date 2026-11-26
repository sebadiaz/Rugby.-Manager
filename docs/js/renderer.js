// Rendu Canvas pur : ne contient aucune règle de jeu, seulement comment
// dessiner un état déjà calculé par le moteur (cf. docs/js/matchState.js).
//
// Vue de retransmission (inspirée des CONVENTIONS des jeux de rugby rétro :
// vue aérienne légèrement inclinée, personnages lisibles, caméra qui suit le
// jeu ; aucun sprite ni asset repris) :
//  - caméra qui suit le ballon en douceur, anticipe le sens de l'attaque et
//    adapte son zoom à la phase (jeu courant, ruck, mêlée, touche, pied) ;
//  - terrain texturé (bandes de tonte, lignes réglementaires, poteaux en H,
//    en-buts, panneaux) ;
//  - 30 personnages 2D dessinés (maillot, short, chaussettes, numéro), plus
//    massifs devant que derrière, animés selon LEUR vitesse réelle et l'action
//    en cours (course, plaquage, chute et relève, ruck, maul, mêlée, levée en
//    touche, passe, frappe, réception) — tout vient des positions et des
//    événements de la simulation, rien n'est une séquence indépendante ;
//  - mini-carte avec la position des 30 joueurs et le cadre de la caméra.
(function (global) {
  'use strict';

  const { LONGUEUR, LARGEUR } = global.RugbyEngine;
  const { PROF_EN_BUT, MARGE_TOUCHE } = global.RMConstants;

  // Inclinaison de la vue : la profondeur (axe vertical de l'écran) est
  // légèrement écrasée, les hauteurs (corps, poteaux, ballon) se lisent vers le haut.
  const INCLINAISON = 0.72;
  const HAUTEUR_VUE = 0.92;
  // Les personnages sont légèrement EXAGÉRÉS par rapport à l'échelle du terrain (convention des jeux de rugby
  // vus de haut) : à l'échelle exacte, un joueur de 1,85 m ne faisait que ~40 px et devenait une silhouette fil de fer.
  const SPRITE = 1.45;

  let canvas, ctx;
  let W = 0, H = 0;
  let densite = 1; // pixels physiques par pixel CSS, pour les écrans Retina
  // Sens de dessin : `paysage` = la longueur du terrain suit la largeur de l'écran.
  let paysage = true;
  // Caméra : centre (mètres terrain) et échelle (pixels par mètre).
  const cam = { x: LONGUEUR / 2, y: LARGEUR / 2, s: 10, pret: false, cible: null };
  let scale = 10;
  let dernierMs = null;
  // État d'animation propre à chaque joueur (rendu seulement).
  const anims = new Map();
  let dernierPorteur = null, dernierePhase = null, ballonPrec = null, motifHerbe = null;
  const dernieresPostures = {};

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    redimensionner(0, 0, 0);
  }

  // Orientation du terrain : 'auto' (vertical sur un écran en hauteur type téléphone, horizontal
  // sur un écran en largeur type ordinateur), ou imposée par le joueur ('portrait' / 'paysage').
  const CLE_ORIENTATION = 'rugbyManager.orientationTerrain';
  let modeOrientation = 'auto';
  try { const m = window.localStorage.getItem(CLE_ORIENTATION); if (m === 'portrait' || m === 'paysage') modeOrientation = m; } catch (e) { /* stockage indisponible */ }
  let dernieresZones = [0, 0, 0];
  function orientation(mode) {
    if (mode === undefined) return modeOrientation;
    if (mode !== 'auto' && mode !== 'portrait' && mode !== 'paysage') return modeOrientation;
    modeOrientation = mode;
    try { window.localStorage.setItem(CLE_ORIENTATION, mode); } catch (e) { /* stockage indisponible */ }
    if (canvas) { redimensionner(...dernieresZones); cam.pret = false; }
    return modeOrientation;
  }

  function redimensionner(hudH, seekH, ctrlH) {
    dernieresZones = [hudH || 0, seekH || 0, ctrlH || 0];
    // Le canvas suit les dimensions RÉELLES disponibles, sans étirer les joueurs.
    // La résolution du bitmap est indépendante de la taille CSS (écrans 2x/3x).
    const nouveauW = Math.max(1, document.documentElement.clientWidth || window.innerWidth);
    const nouveauH = Math.max(120, window.innerHeight - (hudH || 0) - (seekH || 0) - (ctrlH || 0));
    const nouvelleOrientation = modeOrientation === 'auto' ? window.innerWidth >= window.innerHeight : modeOrientation === 'paysage';
    const nouveauDpr = Math.min(2.5, Math.max(1, window.devicePixelRatio || 1));
    const orientationChange = nouvelleOrientation !== paysage;
    const changement = nouveauW !== W || nouveauH !== H || nouveauDpr !== densite || orientationChange;
    W = nouveauW; H = nouveauH; paysage = nouvelleOrientation; densite = nouveauDpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    canvas.style.marginTop = (hudH || 0) + 'px';
    if (changement) {
      canvas.width = Math.round(W * densite);
      canvas.height = Math.round(H * densite);
      ctx.setTransform(densite, 0, 0, densite, 0, 0);
      // Lors d'une rotation, recadrer tout de suite la vue (elle ne doit
      // pas rester au zoom de l'ancien format pendant plusieurs secondes).
      // En revanche, une notification qui agrandit le HUD ne réinitialise
      // jamais la caméra.
      if (orientationChange) cam.pret = false;
      if (!cam.pret) { cam.s = echelleCible('PORTE'); scale = cam.s; }
    }
  }

  // --- CAMÉRA -----------------------------------------------------------------
  // Étendue visible le long de l'axe horizontal de l'écran (mètres), par phase.
  // En paysage : longueur du terrain ; en portrait : largeur.
  const ETENDUE = {
    paysage: { PORTE: 64, RUCK: 53, MAUL: 50, MELEE: 51, TOUCHE: 55, COUP_DE_PIED_JEU: 79, COUP_ENVOI: 78,
      ESSAI: 48, TRANSFORMATION: 54, PENALITE_TIR: 54, MI_TEMPS: 130, TERMINE: 130 },
    portrait: { PORTE: 51, RUCK: 45, MAUL: 42, MELEE: 43, TOUCHE: 46, COUP_DE_PIED_JEU: 62, COUP_ENVOI: 65,
      ESSAI: 40, TRANSFORMATION: 44, PENALITE_TIR: 44, MI_TEMPS: 80, TERMINE: 80 },
  };
  // Échelle cible : une LONGUEUR de terrain visible selon la phase (le long de l'axe x du terrain) et
  // une LARGEUR minimale toujours visible, quelle que soit l'orientation de l'écran.
  function echelleCible(phase) {
    const longueur = (paysage ? ETENDUE.paysage : ETENDUE.portrait)[phase] || (paysage ? ETENDUE.paysage.PORTE : ETENDUE.portrait.PORTE);
    const largeurMin = paysage ? 37 : 36;
    const ecranLongueur = paysage ? W : H / INCLINAISON;   // pixels disponibles le long de x terrain
    const ecranLargeur = paysage ? H / INCLINAISON : W;    // pixels disponibles le long de y terrain
    let s = Math.min(ecranLongueur / longueur, ecranLargeur / largeurMin);
    // Jamais plus petit que la vue du terrain entier (les joueurs restent lisibles).
    const sMin = Math.min(ecranLongueur / (LONGUEUR + 2 * PROF_EN_BUT + 8), ecranLargeur / (LARGEUR + 16));
    return Math.max(sMin, s);
  }

  function attaqueSens(state) {
    const eq = state.possession && state.teams[state.possession];
    const j = eq && eq[0];
    return j && j.sensAttaque ? j.sensAttaque : 0;
  }

  function majCamera(state, dt) {
    const b = state.ballonRendu || state.ballon || state.porteur || { x: LONGUEUR / 2, y: LARGEUR / 2 };
    // Vitesse du ballon (m/s réel) pour suivre un coup de pied ou une passe sans à-coup.
    let vx = 0, vy = 0;
    if (ballonPrec && dt > 0) { vx = (b.x - ballonPrec.x) / dt; vy = (b.y - ballonPrec.y) / dt; }
    ballonPrec = { x: b.x, y: b.y };
    const vv = Math.hypot(vx, vy);
    if (vv > 60) { vx = vx / vv * 60; vy = vy / vv * 60; }
    const phase = state.phase;
    const sens = attaqueSens(state);
    const avance = phase === 'PORTE' ? 7 : phase === 'RUCK' || phase === 'MAUL' ? 5 : 0;
    const anticipation = (phase === 'COUP_DE_PIED_JEU' || phase === 'COUP_ENVOI') ? 0.7 : 0.35;
    let tx = b.x + sens * avance + vx * anticipation;
    let ty = b.y + vy * anticipation * 0.6;
    // On garde de la largeur visible : le centre latéral est tiré vers le milieu du terrain.
    ty = ty * 0.75 + (LARGEUR / 2) * 0.25;
    if (phase === 'MI_TEMPS' || phase === 'TERMINE') { tx = LONGUEUR / 2; ty = LARGEUR / 2; }
    const sCible = echelleCible(phase);
    if (!cam.pret) { cam.x = tx; cam.y = ty; cam.s = sCible; cam.pret = true; }
    else {
      const kp = 1 - Math.exp(-dt * 3.2), kz = 1 - Math.exp(-dt * 1.4);
      cam.x += (tx - cam.x) * kp;
      cam.y += (ty - cam.y) * kp;
      cam.s += (sCible - cam.s) * kz;
      // Le ballon ne sort jamais de la zone centrale : si le jeu va plus vite que le lissage
      // (coup de pied, longue passe), la caméra se recale juste assez pour le garder en vue.
      const vxDemi = (paysage ? W : H / INCLINAISON) / 2 / cam.s, vyDemi = (paysage ? H / INCLINAISON : W) / 2 / cam.s;
      const mx = vxDemi * 0.62, my = vyDemi * 0.6;
      if (b.x > cam.x + mx) cam.x = b.x - mx; else if (b.x < cam.x - mx) cam.x = b.x + mx;
      if (b.y > cam.y + my) cam.y = b.y - my; else if (b.y < cam.y - my) cam.y = b.y + my;
    }
    // Bornes : la vue ne s'éloigne pas du terrain (8 m de marge autour de l'en-but et des touches).
    const demiH = (paysage ? W : H / INCLINAISON) / 2 / cam.s; // demi-étendue visible le long de x (m)
    const demiL = (paysage ? H / INCLINAISON : W) / 2 / cam.s; // le long de y
    const xMin = -PROF_EN_BUT - 6 + demiH, xMax = LONGUEUR + PROF_EN_BUT + 6 - demiH;
    cam.x = xMin > xMax ? LONGUEUR / 2 : Math.max(xMin, Math.min(xMax, cam.x));
    const yMin = -MARGE_TOUCHE - 6 + demiL, yMax = LARGEUR + MARGE_TOUCHE + 6 - demiL;
    cam.y = yMin > yMax ? LARGEUR / 2 : Math.max(yMin, Math.min(yMax, cam.y));
    scale = cam.s;
  }

  // Convertit des coordonnées terrain (mètres) en coordonnées canvas (pixels),
  // pieds au sol. Seule cette fonction connaît la caméra et l'orientation.
  function versCanvas(x, y) {
    const s = cam.s;
    return paysage
      ? { px: W / 2 + (x - cam.x) * s, py: H / 2 + (y - cam.y) * s * INCLINAISON }
      : { px: W / 2 + (y - cam.y) * s, py: H / 2 + (x - cam.x) * s * INCLINAISON };
  }
  // Vecteur écran (non normalisé) d'un déplacement terrain (dx, dy).
  function versEcran(dx, dy) {
    return paysage ? { x: dx, y: dy * INCLINAISON } : { x: dy, y: dx * INCLINAISON };
  }

  // Rayon d'un joueur à l'échelle du terrain (~1,4 m, borné 6,5–10 px) :
  // conservé pour la compatibilité (tests, contrôles de lisibilité).
  function rayonJoueur() {
    return Math.max(6.5, Math.min(10, scale * 1.4));
  }

  // --- TERRAIN ------------------------------------------------------------------
  function polygoneTerrain(x1, y1, x2, y2) {
    const a = versCanvas(x1, y1), b = versCanvas(x2, y1), c = versCanvas(x2, y2), d = versCanvas(x1, y2);
    ctx.beginPath(); ctx.moveTo(a.px, a.py); ctx.lineTo(b.px, b.py); ctx.lineTo(c.px, c.py); ctx.lineTo(d.px, d.py); ctx.closePath();
  }
  function zoneTerrain(x1, y1, x2, y2, couleur) {
    polygoneTerrain(x1, y1, x2, y2);
    ctx.fillStyle = couleur;
    ctx.fill();
  }
  function ligneTerrain(x1, y1, x2, y2, { couleur = '#ffffff', largeur = 0.12, alpha = 1, dash = null } = {}) {
    const a = versCanvas(x1, y1), b = versCanvas(x2, y2);
    ctx.save();
    ctx.setLineDash(dash ? dash.map((d) => d * cam.s) : []);
    ctx.globalAlpha = alpha;
    ctx.lineWidth = Math.max(1.2, largeur * cam.s);
    ctx.strokeStyle = couleur;
    ctx.beginPath(); ctx.moveTo(a.px, a.py); ctx.lineTo(b.px, b.py); ctx.stroke();
    ctx.restore();
  }

  // Texture d'herbe : petit motif de brins clairs/sombres, généré une fois
  // (générateur déterministe, aucune dépendance au hasard de la simulation).
  function motif() {
    if (motifHerbe) return motifHerbe;
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d');
    let r = 1234567;
    const alea = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };
    for (let i = 0; i < 900; i++) {
      g.fillStyle = alea() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
      g.fillRect(alea() * 96, alea() * 96, 1, 2 + alea() * 2);
    }
    motifHerbe = ctx.createPattern(c, 'repeat');
    return motifHerbe;
  }

  function dessinerTerrain() {
    // Abords du stade : pelouse plus sombre puis piste.
    ctx.fillStyle = '#1f5a24';
    ctx.fillRect(0, 0, W, H);
    zoneTerrain(-PROF_EN_BUT - 5, -MARGE_TOUCHE - 3, LONGUEUR + PROF_EN_BUT + 5, LARGEUR + MARGE_TOUCHE + 3, '#2c6e30');
    // Bandes de tonte (5 m, perpendiculaires à la longueur), en-buts compris.
    for (let x = -PROF_EN_BUT; x < LONGUEUR + PROF_EN_BUT; x += 5) {
      const i = Math.round((x + PROF_EN_BUT) / 5);
      zoneTerrain(x, 0, Math.min(x + 5, LONGUEUR + PROF_EN_BUT), LARGEUR, i % 2 ? '#3f9644' : '#378a3c');
    }
    // En-buts légèrement plus sombres.
    zoneTerrain(-PROF_EN_BUT, 0, 0, LARGEUR, 'rgba(0,40,0,0.12)');
    zoneTerrain(LONGUEUR, 0, LONGUEUR + PROF_EN_BUT, LARGEUR, 'rgba(0,40,0,0.12)');
    // Texture.
    polygoneTerrain(-PROF_EN_BUT - 5, -MARGE_TOUCHE - 3, LONGUEUR + PROF_EN_BUT + 5, LARGEUR + MARGE_TOUCHE + 3);
    ctx.fillStyle = motif();
    ctx.fill();

    // Lignes réglementaires.
    ligneTerrain(-PROF_EN_BUT, 0, LONGUEUR + PROF_EN_BUT, 0);
    ligneTerrain(-PROF_EN_BUT, LARGEUR, LONGUEUR + PROF_EN_BUT, LARGEUR);
    ligneTerrain(-PROF_EN_BUT, 0, -PROF_EN_BUT, LARGEUR);
    ligneTerrain(LONGUEUR + PROF_EN_BUT, 0, LONGUEUR + PROF_EN_BUT, LARGEUR);
    ligneTerrain(0, 0, 0, LARGEUR, { largeur: 0.16 });
    ligneTerrain(LONGUEUR, 0, LONGUEUR, LARGEUR, { largeur: 0.16 });
    for (const x of [22, LONGUEUR - 22]) ligneTerrain(x, 0, x, LARGEUR, { largeur: 0.14 });
    ligneTerrain(LONGUEUR / 2, 0, LONGUEUR / 2, LARGEUR, { largeur: 0.14 });
    for (const x of [40, 60]) ligneTerrain(x, 0, x, LARGEUR, { alpha: 0.85, dash: [2, 1.5] });
    for (const x of [5, LONGUEUR - 5]) ligneTerrain(x, 0, x, LARGEUR, { alpha: 0.7, dash: [1, 1.5] });
    for (const y of [5, 15, LARGEUR - 15, LARGEUR - 5]) ligneTerrain(0, y, LONGUEUR, y, { alpha: 0.55, dash: [1, 2.5] });
    // Panneaux publicitaires génériques le long des touches.
    dessinerPanneaux();
  }

  function dessinerPanneaux() {
    if (cam.s < 6) return;
    for (const y of [-MARGE_TOUCHE - 1.6, LARGEUR + MARGE_TOUCHE + 1.6]) {
      for (let x = -4; x < LONGUEUR + 4; x += 12) {
        const a = versCanvas(x, y), b = versCanvas(x + 11, y);
        const h = 0.9 * cam.s * HAUTEUR_VUE;
        ctx.fillStyle = (Math.round(x / 12) % 2) ? '#0d47a1' : '#f9a825';
        if (paysage) ctx.fillRect(a.px, a.py - h, b.px - a.px, h);
        else ctx.fillRect(a.px - h * 0.3, a.py, h * 0.6, b.py - a.py);
        if (paysage && cam.s >= 12) {
          ctx.fillStyle = (Math.round(x / 12) % 2) ? '#ffffff' : '#0d1b2a';
          ctx.font = 'bold ' + Math.round(h * 0.55) + 'px sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('RUGBY MANAGER', (a.px + b.px) / 2, a.py - h / 2);
        }
      }
    }
  }

  // Poteaux en H dressés (hauteur visible), barre à 3 m, protections au pied.
  function dessinerPoteaux(xLigne) {
    const k = cam.s * HAUTEUR_VUE;
    const pieds = [-2.8, 2.8].map((dy) => versCanvas(xLigne, LARGEUR / 2 + dy));
    ctx.save();
    ctx.lineCap = 'round';
    for (const p of pieds) {
      ctx.fillStyle = '#c62828';
      ctx.fillRect(p.px - 0.25 * cam.s, p.py - 2 * k, 0.5 * cam.s, 2 * k);
      ctx.strokeStyle = '#f4f4f4';
      ctx.lineWidth = Math.max(2, 0.18 * cam.s);
      ctx.beginPath(); ctx.moveTo(p.px, p.py - 2 * k); ctx.lineTo(p.px, p.py - 12 * k); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(pieds[0].px, pieds[0].py - 3 * k); ctx.lineTo(pieds[1].px, pieds[1].py - 3 * k); ctx.stroke();
    ctx.restore();
  }

  // --- PERSONNAGES --------------------------------------------------------------
  const COULEURS = {
    A: { maillot: '#1565c0', col: '#e3f2fd', short: '#f5f5f5', chaussette: '#1565c0', bande: '#ffffff', numero: '#ffffff' },
    B: { maillot: '#c62828', col: '#fff3e0', short: '#212121', chaussette: '#c62828', bande: '#ffffff', numero: '#ffffff' },
    ARB: { maillot: '#1b1b1b', col: '#f9a825', short: '#1b1b1b', chaussette: '#1b1b1b', bande: '#f9a825', numero: '#f9a825' },
  };
  const PEAUX = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a0673b'];
  const CHEVEUX = ['#2b1b0f', '#4a3020', '#1a1a1a', '#7a5230', '#c9a86a', '#3b2a1e'];
  const hash = (k) => { let h = 7; for (const c of k) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

  // Gabarit selon le poste (et le profil connu du joueur) : les avants plus massifs.
  function gabarit(j) {
    if (j.team === 'ARB') return { largeur: 0.95, taille: 1.8 };
    const n = j.numero;
    const massif = n === 1 || n === 3 ? 1.32 : n <= 5 ? 1.22 : n <= 8 ? 1.15 : n === 9 ? 0.92 : 1.0;
    const taille = n === 4 || n === 5 ? 1.98 : n <= 3 ? 1.84 : n <= 8 ? 1.92 : n === 9 ? 1.74 : 1.84;
    return { largeur: massif, taille };
  }

  function etatAnim(cle) {
    let a = anims.get(cle);
    if (!a) { a = { rx: null, ry: null, vx: 0, vy: 0, vit: 0, phase: 0, fx: 1, fy: 0, chute: 0, solPrec: false, passe: 0, frappe: 0, reception: 0, dirAction: 1 }; anims.set(cle, a); }
    return a;
  }

  // Position rendue : suit la position simulée ; un saut (replacement de reprise)
  // n'est jamais téléporté, le joueur glisse rapidement jusqu'à sa place.
  function suivrePosition(a, j, dt) {
    if (a.rx === null) { a.rx = j.x; a.ry = j.y; return; }
    const dx = j.x - a.rx, dy = j.y - a.ry, d = Math.hypot(dx, dy);
    const ancienX = a.rx, ancienY = a.ry;
    if (d <= 3 || dt === 0) { a.rx = j.x; a.ry = j.y; }
    else { const pas = Math.min(d, Math.max(25, d * 4) * dt); a.rx += dx / d * pas; a.ry += dy / d * pas; }
    if (dt > 0) {
      const ivx = (a.rx - ancienX) / dt, ivy = (a.ry - ancienY) / dt;
      const k = 1 - Math.exp(-dt * 10);
      a.vx += (ivx - a.vx) * k; a.vy += (ivy - a.vy) * k;
    }
    a.vit = Math.hypot(a.vx, a.vy);
  }

  function pose(j, a, state, estPorteur) {
    const auSol = j.auSol > 0 || j.solVisuel > 0;
    const phase = state.phase;
    const pres = (p, r) => p && Math.hypot(a.rx - p.x, a.ry - p.y) <= r;
    if (a.plonge && a.plonge.t < 0.55 && !auSol) return 'penche';
    if (auSol) return a.chute < 1 ? 'chute' : (j.auSol > 0 && j.auSol < 0.5 ? 'releve' : 'sol');
    const ts = state.toucheSauteur;
    if (ts && phase === 'TOUCHE') {
      if (ts.team === j.team && ts.numero === j.numero) return 'saut';
      const sauteur = state.teams[ts.team].find((x) => x.numero === ts.numero);
      if (j.team === ts.team && j.numero <= 8 && sauteur && Math.hypot(j.x - sauteur.x, j.y - sauteur.y) <= 1.9) return 'leveur';
    }
    if (phase === 'MELEE' && state.melee && j.numero <= 8 && pres(state.melee, 5) && state.melee.etat !== 'MELEE_FORMATION') return 'melee';
    if (phase === 'MAUL' && state.maul && pres(state.maul, 3.2)) return 'maul';
    if (phase === 'RUCK' && state.ruck && pres(state.ruck, 2.4)) return 'ruck';
    if (a.frappe > 0) return 'frappe';
    if (a.passe > 0) return 'passe';
    if (a.reception > 0) return 'reception';
    return estPorteur ? 'porte' : 'course';
  }

  // --- SPRITES PIXEL ART (dessinés par le code, aucun asset externe) ----------------------
  // Chaque sprite fait 24 x 30 pixels « rétro », pieds sur la dernière ligne, puis il est
  // agrandi sans lissage. Variantes : vue (profil/face/dos), image du cycle de course (4),
  // posture (course, penché, mêlée, relève, saut, levée, frappe, passe), gabarit (avant
  // massif ou trois-quarts), couleurs de l'équipe, peau et cheveux. Chaque variante est
  // dessinée une seule fois puis mise en cache.
  const SW = 32, SH = 30; // largeur généreuse : un joueur penché (mêlée, ruck) tient dans la toile
  const cacheSprites = new Map();
  // Le sprite HD pèse plus qu'une ancienne texture pixel art. Une limite
  // LRU évite de saturer la mémoire des téléphones après plusieurs matchs.
  const MAX_SPRITES = 360;
  function assombrir(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
    return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => c(v).toString(16).padStart(2, '0')).join('');
  }
  function fabriquerSprite(pal, vue, posture, image, massif) {
    const c = document.createElement('canvas');
    c.width = SW; c.height = SH;
    const g = c.getContext('2d');
    const p = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), w, h); };
    const membre = (x0, y0, x1, y1, ep, col) => {
      const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
      const horizontal = Math.abs(x1 - x0) > Math.abs(y1 - y0);
      for (let i = 0; i <= n; i++) {
        const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
        if (horizontal) p(x, y - Math.floor(ep / 2), 1, ep, col); else p(x - Math.floor(ep / 2), y, ep, 1, col);
      }
    };
    const profil = vue === 'profil';
    // Accroupissement (lignes) et inclinaison vers l'avant (pixels par ligne au-dessus des hanches).
    const crouch = { penche: 2, melee: 5, releve: 6 }[posture] || 0;
    const incl = { penche: 0.5, melee: 0.85, course: image % 2 ? 0.12 : 0.08 }[posture] || 0;
    const hanche = 18 + crouch;
    const dx = (y) => (profil ? Math.round((hanche - y) * incl) : 0); // décalage du haut du corps
    // Centre de la toile ; les postures penchées sont reculées pour que le haut du corps tienne dans la toile.
    const cx = SW / 2 - ({ melee: 5, penche: 2 }[posture] || 0);
    const demi = profil ? (massif ? 4 : 3) : (massif ? 5 : 4);
    // --- Jambes (de la hanche au pied) ---
    const jambe = (hx, px, py, cote) => {
      membre(hx, hanche + 1, (hx + px) / 2, hanche + (py - hanche) * 0.45, massif ? 3 : 2, pal.peau);          // cuisse
      membre((hx + px) / 2, hanche + (py - hanche) * 0.45 + 1, px, py - 1, massif ? 3 : 2, pal.chaussette);     // chaussette
      p((hx + px) / 2 - 1, hanche + (py - hanche) * 0.45 + 1, massif ? 3 : 2, 1, pal.bande);
      p(px - 1 + (profil ? 1 : 0), py - 1, profil ? 3 : 2, 2, '#161616');                                       // crampon
    };
    if (profil) {
      let avant, arriere;
      if (posture === 'saut' || posture === 'leveur') { avant = { x: cx + 1, y: 29 }; arriere = { x: cx - 1, y: 29 }; }
      else if (posture === 'frappe') { avant = { x: cx + 7, y: 21 }; arriere = { x: cx - 1, y: 29 }; }
      else if (posture === 'melee') { avant = { x: cx - 3, y: 29 }; arriere = { x: cx - 6, y: 29 }; }
      else if (posture === 'releve') { avant = { x: cx + 3, y: 29 }; arriere = { x: cx - 4, y: 29 }; }
      else if (posture === 'penche') { avant = { x: cx + 2, y: 29 }; arriere = { x: cx - 3, y: 29 }; }
      else {
        const pas = [[4, 29, -4, 28], [1, 29, -1, 26], [-4, 28, 4, 29], [-1, 26, 1, 29]][image % 4];
        avant = { x: cx + pas[0], y: pas[1] }; arriere = { x: cx + pas[2], y: pas[3] };
        if (posture === 'arret' || posture === 'touche') { avant = { x: cx + 1, y: 29 }; arriere = { x: cx - 1, y: 29 }; }
      }
      // Jambe arrière plus sombre (plus loin), jambe avant par-dessus.
      const palLoin = Object.assign({}, pal, { peau: pal.peauOmbre, chaussette: assombrir(pal.chaussette, 0.75) });
      const sauve = pal; pal = palLoin; jambe(cx, arriere.x, arriere.y, -1); pal = sauve;
      jambe(cx + 1, avant.x, avant.y, 1);
    } else {
      const lever = posture === 'course' ? [[1, 0], [0, 0], [0, 1], [0, 0]][image % 4] : [0, 0];
      const ecart = massif ? 3 : 2;
      if (posture === 'releve') { jambe(cx - ecart, cx - ecart - 1, 29, -1); jambe(cx + ecart, cx + ecart, 26, 1); }
      else { jambe(cx - ecart, cx - ecart, 29 - lever[0] * 2, -1); jambe(cx + ecart, cx + ecart, 29 - lever[1] * 2, 1); }
    }
    // --- Short ---
    p(cx - demi + dx(hanche - 1), hanche - 2, demi * 2 + 1, 3, pal.short);
    p(cx - demi + dx(hanche - 1), hanche, demi * 2 + 1, 1, pal.shortOmbre);
    // --- Bras arrière (profil) ---
    const epaule = hanche - 8;
    const brasProfil = (versAvant, col, peau) => {
      const ex = cx + dx(epaule), ey = epaule + 1;
      let mx, my;
      if (posture === 'saut' || posture === 'leveur') { mx = ex + 1; my = ey - 8; }
      else if (posture === 'passe') { mx = ex + 7; my = ey + 2; }
      else if (posture === 'penche' || posture === 'melee') { mx = ex + 5; my = ey + 3; }
      else { const sw = [-2, 0, 2, 0][image % 4] * (versAvant ? 1 : -1); mx = ex + sw; my = ey + 6; }
      membre(ex, ey, (ex + mx) / 2, (ey + my) / 2, 2, col);
      membre((ex + mx) / 2, (ey + my) / 2, mx, my, 2, peau);
    };
    const sansBras = posture === 'touche'; // l'assistant de touche : ses deux bras sont dessinés à part (cf. dessinerAssistants)
    if (profil && !sansBras) brasProfil(false, assombrir(pal.maillot, 0.7), pal.peauOmbre);
    // --- Torse (maillot) ---
    for (let y = epaule; y <= hanche - 2; y++) {
      const larg = demi * 2 + 1 + (y === epaule ? 0 : 0);
      p(cx - demi + dx(y), y, larg, 1, pal.maillot);
      p(cx - demi + dx(y), y, 1, 1, pal.maillotOmbre);                       // bord ombré
      if (!profil) p(cx + demi + dx(y), y, 1, 1, pal.maillotOmbre);
    }
    // Col.
    if (vue === 'face') { p(cx - 1, epaule, 3, 1, pal.col); p(cx, epaule + 1, 1, 1, pal.col); }
    else if (profil) p(cx + dx(epaule) + 1, epaule, 2, 1, pal.col);
    else p(cx - 1, epaule, 3, 1, pal.col);
    // --- Bras ---
    if (sansBras) { /* pas de bras de sprite */ }
    else if (profil) brasProfil(true, pal.maillot, pal.peau);
    else {
      for (const cote of [-1, 1]) {
        const ex = cx + cote * (demi + 1), ey = epaule + 1;
        if (posture === 'saut' || posture === 'leveur') { membre(ex, ey, ex + cote, ey - 4, 2, pal.maillot); membre(ex + cote, ey - 4, ex + cote, ey - 8, 2, pal.peau); continue; }
        const lev = posture === 'course' ? ([[0, 1], [0, 0], [1, 0], [0, 0]][image % 4][cote > 0 ? 1 : 0]) : 0;
        if (posture === 'penche' || posture === 'melee' || posture === 'passe') { membre(ex, ey, ex - cote, ey + 3, 2, pal.maillot); membre(ex - cote, ey + 3, cx - cote, ey + 4, 2, pal.peau); continue; }
        membre(ex, ey, ex, ey + 3 - lev, 2, pal.maillot);
        membre(ex, ey + 4 - lev, ex, ey + 6 - lev, 2, pal.peau);
      }
    }
    // --- Tête ---
    const tx = cx + dx(epaule - 4) - (profil ? 2 : 3), ty = epaule - 7;
    p(tx, ty + 1, 6, 6, pal.peau);
    p(tx + 1, ty + 7, 4, 1, pal.peauOmbre); // cou
    if (vue === 'dos') { p(tx, ty, 6, 5, pal.cheveux); p(tx + 1, ty + 5, 4, 1, pal.cheveux); }
    else if (profil) {
      p(tx, ty, 6, 2, pal.cheveux); p(tx, ty + 2, 2, 3, pal.cheveux);
      p(tx + 4, ty + 3, 1, 1, '#1b1b1b');            // œil
      p(tx + 6, ty + 4, 1, 1, pal.peauOmbre);       // nez
    } else {
      p(tx, ty, 6, 2, pal.cheveux); p(tx, ty + 2, 1, 1, pal.cheveux); p(tx + 5, ty + 2, 1, 1, pal.cheveux);
      p(tx + 1, ty + 3, 1, 1, '#1b1b1b'); p(tx + 4, ty + 3, 1, 1, '#1b1b1b');
      p(tx + 2, ty + 5, 2, 1, pal.peauOmbre);
    }
    if (pal.casque) { p(tx - 1, ty, 8, 3, pal.casque); p(tx - 1, ty + 3, 1, 3, pal.casque); p(tx + 6, ty + 3, 1, 3, pal.casque); }
    // --- Contour sombre (lisibilité sur le gazon) ---
    const img = g.getImageData(0, 0, SW, SH), d = img.data;
    const plein = (x, y) => x >= 0 && y >= 0 && x < SW && y < SH && d[(y * SW + x) * 4 + 3] > 0;
    const contour = [];
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
      if (plein(x, y)) continue;
      if (plein(x - 1, y) || plein(x + 1, y) || plein(x, y - 1) || plein(x, y + 1)) contour.push([x, y]);
    }
    for (const [x, y] of contour) { const i = (y * SW + x) * 4; d[i] = 20; d[i + 1] = 22; d[i + 2] = 24; d[i + 3] = 235; }
    g.putImageData(img, 0, 0);
    return c;
  }
  function spriteCouche(debout) {
    const c = document.createElement('canvas');
    // Accepte les anciens sprites ou les nouveaux dessins HD.
    c.width = debout.height; c.height = debout.width;
    const g = c.getContext('2d');
    g.translate(debout.height, 0); g.rotate(Math.PI / 2);
    g.drawImage(debout, 0, 0);
    return c;
  }
  function palette(j, couleurs) {
    const cle = j.team + j.numero;
    const pal = {
      maillot: couleurs.maillot, maillotOmbre: assombrir(couleurs.maillot, 0.72), col: couleurs.col,
      short: couleurs.short, shortOmbre: assombrir(couleurs.short, 0.75), chaussette: couleurs.chaussette, bande: couleurs.bande,
      peau: PEAUX[hash(cle) % PEAUX.length], cheveux: CHEVEUX[hash(cle + 'h') % CHEVEUX.length],
      // Casque de mêlée : fréquent chez les avants de devant, plus rare en troisième ligne, exceptionnel derrière.
      casque: j.team !== 'ARB' && hash(cle + 'c') % 100 < (j.numero <= 5 ? 38 : j.numero <= 8 ? 18 : 4) ? assombrir(couleurs.maillot, 0.55) : null,
      // Coiffure, barbe, strapping : variété purement visuelle, stable pour un même joueur (tirée de son équipe et de son numéro).
      coiffure: j.team === 'ARB' ? 'court' : ['court', 'court', 'rase', 'chignon', 'bandeau', 'court'][hash(cle + 'f') % 6],
      barbe: j.team !== 'ARB' && hash(cle + 'b') % 100 < 30,
      strapping: j.team !== 'ARB' && (j.numero === 4 || j.numero === 5 || hash(cle + 's') % 100 < 12),
      bandeau: couleurs.bande || couleurs.col,
    };
    pal.peauOmbre = assombrir(pal.peau, 0.8);
    return pal;
  }
  // Personnages modernes : silhouettes vectorielles 2.5D rendues dans une
  // texture haute définition puis mises en cache. Le joueur ne ressemble plus
  // à un amas de gros pixels : tête, épaules, musculature, maillot, short,
  // chaussettes, crampons et gestes se distinguent même sur mobile.
  // Les poses dépendent toujours de l'état moteur, jamais d'animations fictives.
  function fabriquerSpriteModerne(pal, vue, posture, image, massif, physique) {
    const c = document.createElement('canvas');
    const definition = 4;
    c.width = SW * definition; c.height = SH * definition;
    const g = c.getContext('2d');
    g.scale(definition, definition);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    const profil = vue === 'profil', dos = vue === 'dos';
    const anime = posture === 'course' || posture === 'arret';
    const avance = anime ? [3.5, 1.3, -3.5, -1.3][image % 4] : 0;
    const penche = posture === 'melee' ? 5.2 : posture === 'penche' ? 3.8 : posture === 'frappe' ? 1.4 : 0;
    const baisse = posture === 'melee' ? 4.8 : posture === 'penche' ? 2.4 : posture === 'releve' ? 5 : 0;
    const saut = posture === 'saut' ? 2.5 : 0;
    const x = 16, hanches = 18.4 + (1.84 - physique.taille) * 3 + baisse - saut;
    const haut = hanches - 11.6 * (physique.taille / 1.84);
    const torseX = x + (profil ? penche : penche * 0.34);
    // Les piliers ont un buste large et court, les deuxième-lignes sont plus
    // hauts, les demis sont plus fins : différences visibles entre les postes.
    const epaule = 5.1 * physique.largeur, bassin = 3.45 * physique.largeur;
    const peau = pal.peau, peauSombre = pal.peauOmbre;
    function ovale(cx,cy,rx,ry,couleur) {
      g.fillStyle=couleur; g.beginPath(); g.ellipse(cx,cy,rx,ry,0,0,Math.PI*2); g.fill();
    }
    function trait(x1,y1,x2,y2,largeur,couleur) {
      g.strokeStyle=couleur; g.lineWidth=largeur; g.beginPath(); g.moveTo(x1,y1); g.lineTo(x2,y2); g.stroke();
    }
    function forme(points,couleur,contour,epaisseur=0.65) {
      g.beginPath(); g.moveTo(points[0][0],points[0][1]);
      for(let i=1;i<points.length;i++)g.lineTo(points[i][0],points[i][1]);
      g.closePath();g.fillStyle=couleur;g.fill();
      if(contour){g.strokeStyle=contour;g.lineWidth=epaisseur;g.stroke();}
    }
    // Jambe arrière, puis jambe avant : foulées distinctes, flexion au contact.
    for (const cote of [-1,1]) {
      const lateral = profil ? (cote*1.35) : cote*2.6;
      let piedX = x + lateral + (profil ? cote*avance : cote*(image%2?0.7:1.4));
      let piedY = 28.1 - saut;
      if (posture==='frappe' && cote===1) {piedX+=7.5;piedY-=6.4;}
      if (posture==='releve' && cote===1) {piedX+=3;piedY-=3;}
      if (posture==='melee') {piedX-=penche*0.3+2;piedY=28.6;}
      const hancheX = x + lateral*0.7;
      const genouX=(hancheX+piedX)*0.53 + (profil?cote*1.2:0);
      const genouY=hanches + (piedY-hanches)*0.52 - Math.abs(avance)*0.23;
      const ombre=cote===-1;
      trait(hancheX,hanches,genouX,genouY,massif?3.5:3.1,ombre?peauSombre:peau);
      if (pal.strapping) { // strapping blanc à mi-cuisse (sauteurs de touche, soulevés par les cuisses)
        const mx=(hancheX+genouX)/2, my=(hanches+genouY)/2;
        trait(mx-(massif?1.9:1.6),my-.15,mx+(massif?1.9:1.6),my+.15,.9,ombre?'#c9c9c4':'#f4f3ee');
      }
      trait(genouX,genouY,piedX,piedY-1.3,massif?2.8:2.55,ombre?assombrir(pal.chaussette,.75):pal.chaussette);
      trait(genouX,genouY+2.1,genouX+(piedX-genouX)*.2,genouY+2.1,1,pal.bande);
      ovale(piedX+(profil?1:0),piedY,2.35,1.18,'#19252b');
      trait(piedX-1,piedY-.2,piedX+1.5,piedY-.2,.55,'#53636a');
    }
    // Short technique et deux pans : taille étroite, volume aux cuisses.
    forme([[x-bassin,hanches-4.1],[x+bassin,hanches-4.1],[x+bassin+.5,hanches+1],[x+.65,hanches+1.7],[x,hanches-.15],[x-.65,hanches+1.7],[x-bassin-.5,hanches+1]],pal.short,assombrir(pal.short,.63));
    trait(x-bassin+.5,hanches-3,x+bassin-.5,hanches-3,.75,assombrir(pal.short,.72));
    // Bras en arrière-plan, avec coude et main différenciés.
    const passes=posture==='passe', leve=posture==='saut'||posture==='leveur';
    function bras(cote,devant) {
      if (posture==='touche') return; // assistant de touche : ses bras sont dessinés à part (cf. dessinerAssistants), pas ceux du sprite
      const px=torseX+cote*epaule*.9,py=haut+2.2;
      let coudeX=px+cote*(profil?1.0:2.3), coudeY=haut+6.6;
      let mainX=coudeX+cote*.6,mainY=haut+10.6;
      if (leve) {coudeX=px+cote*2;coudeY=haut-3.1;mainX=px+cote*1.2;mainY=haut-7.2;}
      else if (passes) {coudeX=px+cote*3.4;coudeY=haut+2.5;mainX=px+cote*5.2;mainY=haut+1.1;}
      else if (posture==='melee'||posture==='penche') {coudeX=px+3.2;coudeY=haut+4.5;mainX=px+5.3;mainY=haut+8;}
      else if (posture==='frappe') {coudeX=px+cote*3.2;coudeY=haut+4;mainX=px+cote*4;mainY=haut+6.2;}
      else if (anime) {const swing=cote*avance*.45;coudeX+=swing;mainX+=swing*1.6;mainY+=Math.abs(swing)*.5;}
      trait(px,py,coudeX,coudeY,massif?3.75:3.25,devant?pal.maillot:pal.maillotOmbre);
      trait(coudeX,coudeY,mainX,mainY,massif?2.6:2.15,devant?peau:peauSombre);
      ovale(mainX,mainY,1.2,1.2,devant?peau:peauSombre);
    }
    bras(profil?-1:-1,false);
    // Silhouette avec épaules larges et taille cintrée + ombre textile.
    forme([[torseX-epaule,haut+1.5],[torseX-epaule*.79,haut-.3],
      [torseX+epaule*.79,haut-.3],[torseX+epaule,haut+1.5],
      [x+bassin*.98,hanches-3],[x-bassin*.98,hanches-3]],
      pal.maillot,assombrir(pal.maillot,.56),.8);
    forme([[torseX+epaule*.55,haut+.5],[torseX+epaule,haut+1.3],
      [x+bassin*.97,hanches-3],[x+bassin*.48,hanches-3]],
      assombrir(pal.maillot,.8));
    trait(torseX-epaule+.9,haut+1.65,torseX+epaule-.9,haut+1.65,.55,'rgba(255,255,255,.35)');
    trait(x-bassin,hanches-3,x+bassin,hanches-3,.7,pal.col);
    // Liseré d'épaule : identité des équipes et maillot vraiment structuré.
    trait(torseX-epaule+.6,haut+.9,torseX-epaule+1.3,haut+3.9,1.35,pal.col);
    trait(torseX+epaule-.6,haut+.9,torseX+epaule-1.3,haut+3.9,1.35,pal.col);
    if(dos) {
      g.fillStyle=pal.col;g.font='bold 5px system-ui,sans-serif';g.textAlign='center';
      // Numéro détaillé de la texture, le numéro principal reste celui affiché par le HUD.
      g.fillText('•',torseX,haut+7.2);
    } else {
      ovale(torseX,haut+4,1.25,1.25,pal.col); // petit écusson
    }
    bras(profil?1:1,true);
    // Cou, tête au relief doux, cheveux et expression orientée vers l'action.
    const teteX=torseX+(profil?penche*.33:0), teteY=haut-3.45;
    trait(teteX,haut+.4,teteX,haut-1.3,2.65,peauSombre);
    ovale(teteX+.55,teteY+.5,3.1,3.75,peauSombre);
    ovale(teteX-.2,teteY-.22,3,3.55,peau);
    // Cheveux selon la coiffure du joueur.
    if (pal.coiffure === 'rase') {
      g.globalAlpha=.35; g.fillStyle=pal.cheveux; g.beginPath(); g.ellipse(teteX-.25,teteY-1.6,2.95,1.5,-.12,Math.PI,Math.PI*2.07); g.fill(); g.globalAlpha=1;
    } else {
      g.fillStyle=pal.cheveux;g.beginPath();
      g.ellipse(teteX-.25,teteY-2.1,3.05,1.8,-.12,Math.PI,Math.PI*2.07);g.lineTo(teteX+2.8,teteY-1.05);g.quadraticCurveTo(teteX,teteY-2.45,teteX-3.1,teteY-1.1);g.fill();
      if (pal.coiffure === 'chignon') ovale(teteX-(profil?1.6:0),teteY-3.55,1.25,1.05,pal.cheveux);
    }
    if (pal.coiffure === 'bandeau') trait(teteX-3,teteY-1.55,teteX+2.85,teteY-1.55,.95,pal.bandeau);
    // Barbe : ombre de la mâchoire, côté visage (pas de dos).
    if (pal.barbe && !dos) {
      g.globalAlpha=.78; g.fillStyle=pal.cheveux; g.beginPath();
      g.ellipse(teteX+(profil?.7:-.1),teteY+1.55,profil?2.1:2.45,1.25,0,0,Math.PI); g.fill(); g.globalAlpha=1;
    }
    if(!dos) {
      if(profil){ovale(teteX+1.3,teteY-.22,.47,.5,'#2a2b26');}
      else {ovale(teteX-1.1,teteY-.3,.37,.42,'#2c2721');ovale(teteX+1.1,teteY-.3,.37,.42,'#2c2721');}
    }
    if(pal.casque){
      g.strokeStyle=pal.casque;g.lineWidth=1.8;g.beginPath();g.arc(teteX,teteY-.4,3.2,Math.PI*1.03,Math.PI*1.97);g.stroke();
      trait(teteX-3.1,teteY-1.2,teteX+2.9,teteY-1.2,.9,pal.casque);
    }
    return c;
  }

  function sprite(j, couleurs, vue, posture, image) {
    const pal = palette(j, couleurs);
    const massif = j.team !== 'ARB' && j.numero <= 8;
    const physique = gabarit(j);
    const imageCle = posture === 'course' ? image % 4 : 0;
    const cle = [pal.maillot, pal.short, pal.chaussette, pal.peau, pal.cheveux, pal.casque, pal.coiffure, pal.barbe, pal.strapping, massif, physique.largeur, physique.taille, vue, posture, imageCle].join('|');
    let s = cacheSprites.get(cle);
    if (s) {
      // Réinsérer en dernier : les sprites utilisés dans les images récentes
      // restent en cache, ceux des anciennes phases sont libérés.
      cacheSprites.delete(cle);
      cacheSprites.set(cle, s);
    } else {
      if (posture === 'sol') s = spriteCouche(sprite(j, couleurs, 'profil', 'arret', 0));
      else s = fabriquerSpriteModerne(pal, vue, posture, imageCle, massif, physique);
      cacheSprites.set(cle, s);
      if (cacheSprites.size > MAX_SPRITES) cacheSprites.delete(cacheSprites.keys().next().value);
    }
    return s;
  }

  // Taille d'affichage d'un pixel de sprite (pixels écran) : le joueur fait ~2,6 fois sa taille
  // au sol en mètres (exagération de lisibilité des jeux vus de haut), jamais moins de 1 px.
  function pixelSprite() { return Math.max(1, cam.s * 0.092); }

  // Dessine un joueur (sprite pixel art), pieds en (sx, sy).
  function dessinerPersonnage(sx, sy, j, a, posture, couleurs, opts) {
    const ps = pixelSprite();
    if (ps * SH < 8) return null;
    const e = versEcran(a.fx, a.fy);
    const vueProfil = Math.abs(e.x) >= Math.abs(e.y) * 0.8;
    const vue = vueProfil ? 'profil' : (e.y > 0 ? 'face' : 'dos');
    const sens = (vueProfil ? Math.sign(e.x) : a.dirAction) || 1;
    let p = posture;
    if (p === 'porte' || p === 'reception') p = 'course';
    if (p === 'course' && a.vit < 0.6) p = 'arret';
    if (p === 'ruck' || p === 'maul') p = 'penche';
    if (p === 'chute') p = a.chute > 0.5 ? 'sol' : 'penche';
    const image = Math.floor(a.phase / (Math.PI / 2));
    const vueEff = (p === 'melee' || p === 'penche' || p === 'frappe' || p === 'passe') && !vueProfil ? 'profil' : vue;
    const spr = sprite(j, couleurs, p === 'sol' ? 'profil' : vueEff, p, image);
    // Ombre.
    ctx.save();
    ctx.globalAlpha = 0.3; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(sx, sy, (p === 'sol' ? 13 : p === 'melee' ? 10 : 7) * ps, 2.6 * ps, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // Saut en touche : le sauteur s'élève au-dessus de l'alignement.
    const hausse = p === 'saut' ? (6 + 9 * Math.sin(Math.PI * Math.min(1, (opts.prog || 0) * 1.1))) * ps : 0;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Un joueur à l'arrêt ne reste pas figé : il respire et reporte son poids d'un pied sur l'autre (déphasé par joueur,
    // il avance avec le temps de jeu, donc s'arrête en pause).
    const phi = p === 'arret' ? (hash(j.team + j.numero + 'i') % 628) / 100 : 0;
    const balance = p === 'arret' ? Math.sin((a.idle || 0) * 2.2 + phi) * 0.6 * ps : 0;
    const respire = p === 'arret' ? 1 + 0.014 * Math.sin((a.idle || 0) * 3.1 + phi) : 1;
    ctx.translate(sx + balance, sy - hausse);
    if ((p === 'sol' ? a.dirAction : sens) < 0) ctx.scale(-1, 1);
    if (respire !== 1) ctx.scale(1, respire);
    if (p === 'sol') ctx.drawImage(spr, -SH / 2 * ps, -SW * ps * 0.55, SH * ps, SW * ps);
    else ctx.drawImage(spr, -SW / 2 * ps, -SH * ps, SW * ps, SH * ps);
    ctx.restore();
    // Ballon tenu, contre la poitrine.
    let ballon = null;
    if (opts.porteBallon && p !== 'sol') {
      const bx = sx + (vueEff === 'profil' ? sens * 4.5 * ps : 0), by = sy - hausse - 14 * ps;
      ctx.save(); ctx.translate(bx, by); ctx.rotate(0.5);
      ctx.fillStyle = '#7a4a1f'; ctx.strokeStyle = '#2a170a'; ctx.lineWidth = Math.max(1, ps * 0.6);
      ctx.beginPath(); ctx.ellipse(0, 0, 2.6 * ps, 1.7 * ps, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
      ballon = true;
    }
    if (j.team === 'ARB') return ballon;
    // Numéro : dans le dos ou sur le flanc du maillot ; au-dessus de la tête quand le sprite est trop petit.
    const penche = p === 'melee' || p === 'penche' || p === 'sol';
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (ps >= 1.7 && !penche && vueEff !== 'face') {
      ctx.font = 'bold ' + Math.round(5.2 * ps) + 'px sans-serif';
      ctx.lineWidth = Math.max(1.5, ps * 0.7); ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      const y = sy - hausse - 15 * ps;
      ctx.strokeText(String(j.numero), sx, y); ctx.fillStyle = '#fff'; ctx.fillText(String(j.numero), sx, y);
    } else if (!penche && (ps < 1.7 || vueEff === 'face')) {
      ctx.font = 'bold ' + Math.max(8, Math.round(rayonJoueur())) + 'px sans-serif';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      const y = sy - hausse - SH * ps - 5;
      ctx.strokeText(String(j.numero), sx, y); ctx.fillStyle = '#fff'; ctx.fillText(String(j.numero), sx, y);
    }
    ctx.restore();
    if (opts.estPorteur) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,214,0,0.95)'; ctx.lineWidth = Math.max(1.5, ps * 0.8);
      ctx.beginPath(); ctx.ellipse(sx, sy, 9 * ps, 3.4 * ps, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    return ballon;
  }

  // Mise à jour des états d'animation (vitesse, cycle de course, chute, passe, frappe).
  function majAnimations(state, dt) {
    const porteurCle = state.porteur ? state.porteur.team + state.porteur.numero : null;
    const enVol = state.ballon && state.ballon.enVol;
    for (const team of ['A', 'B']) {
      for (const j of state.teams[team]) {
        const a = etatAnim(team + j.numero);
        suivrePosition(a, j, dt);
        // Cycle de foulée : avance avec la distance parcourue (≈ 2 foulées par 3,2 m).
        a.phase += (a.vit * dt) * 1.95;
        if (a.vit > 0.6) { a.fx = a.vx / a.vit; a.fy = a.vy / a.vit; }
        else {
          // À l'arrêt : regarde le ballon.
          const b = state.ballonRendu || state.ballon;
          if (b) { const dx = b.x - a.rx, dy = b.y - a.ry, d = Math.hypot(dx, dy); if (d > 0.5) { a.fx = dx / d; a.fy = dy / d; } }
        }
        const e = versEcran(a.fx, a.fy);
        if (Math.abs(e.x) > 0.2) a.dirAction = Math.sign(e.x);
        const auSol = j.auSol > 0 || j.solVisuel > 0;
        if (auSol && !a.solPrec) {
          a.chute = 0;
          // PLAQUAGE : le joueur tombe dans le sens où il est poussé (du plaqueur vers lui) — et non toujours du même
          // côté — et le plaqueur le plonge dessus au lieu de rester à plusieurs mètres.
          // Le PLAQUEUR est l'adversaire qui vient de plaquer (solVisuel, posé par le moteur au plaquage) ; à défaut, le plus proche debout.
          // L'exclure (comme avant) faisait plonger un AUTRE défenseur pendant que le vrai plaqueur restait couché à 2-4 m du porteur.
          const rivaux = state.teams[team === 'A' ? 'B' : 'A'];
          let pl = null, dm = 5, plDebout = null, dmDebout = 5;
          for (const r of rivaux) {
            if (r.auSol > 0) continue;
            const ar = etatAnim((team === 'A' ? 'B' : 'A') + r.numero);
            const d = Math.hypot(ar.rx - a.rx, ar.ry - a.ry);
            if (r.solVisuel > 0) { if (d < dm) { dm = d; pl = ar; } }
            else if (d < dmDebout) { dmDebout = d; plDebout = ar; }
          }
          if (!pl) { pl = plDebout; dm = dmDebout; }
          if (pl) {
            const ep = versEcran(a.rx - pl.rx, a.ry - pl.ry);
            if (Math.abs(ep.x) > 0.15) a.dirAction = Math.sign(ep.x);
            else { const ev = versEcran(a.vx, a.vy); if (Math.abs(ev.x) > 0.1) a.dirAction = Math.sign(ev.x); }
            pl.plonge = { t: 0, cible: a, d0: dm };
          }
        }
        if (a.plonge) {
          // PLONGEON DU PLAQUEUR : il fond sur le porteur en 0,22 s et RESTE au contact (0,65 m, les corps se touchent) tant qu'il est au
          // sol ; il ne se détache qu'en se relevant, en 0,4 s. Purement visuel : la simulation garde ses positions.
          const pg = a.plonge; pg.t += dt;
          const auSolMoi = j.auSol > 0 || j.solVisuel > 0;
          const c = pg.cible, dx = c.rx - a.rx, dy = c.ry - a.ry, d = Math.hypot(dx, dy) || 1;
          const reste = Math.max(0, d - 0.65);
          let p;
          if (pg.t < 0.22) p = pg.t / 0.22;
          else if ((auSolMoi && pg.t < 4) || pg.t < 0.55) { p = 1; pg.lache = 0; }
          else { pg.lache = (pg.lache || 0) + dt; p = Math.max(0, 1 - pg.lache / 0.4); }
          a.rx += dx / d * reste * p; a.ry += dy / d * reste * p;
          if (pg.t < 0.55) { a.fx = dx / d; a.fy = dy / d; a.vit = Math.max(a.vit, 0.7); }
          if (pg.lache >= 0.4) a.plonge = null;
        }
        a.chute = auSol ? Math.min(1, a.chute + dt / 0.32) : 0;
        a.solPrec = auSol;
        a.passe = Math.max(0, a.passe - dt);
        a.idle = (a.idle || 0) + dt; // temps de jeu écoulé : anime un joueur à l'arrêt (cf. dessinerPersonnage)
        a.frappe = Math.max(0, a.frappe - dt);
        a.reception = Math.max(0, a.reception - dt);
      }
    }
    // Changement de porteur : passe du précédent, réception du nouveau.
    if (porteurCle && dernierPorteur && porteurCle !== dernierPorteur && !enVol) {
      const pa = anims.get(dernierPorteur), pn = anims.get(porteurCle);
      if (pa && pn && Math.hypot(pa.rx - pn.rx, pa.ry - pn.ry) > 1.5) {
        pa.passe = 0.32; pn.reception = 0.28;
        const e = versEcran(pn.rx - pa.rx, pn.ry - pa.ry);
        if (Math.abs(e.x) > 0.1) pa.dirAction = Math.sign(e.x);
      }
    }
    // Départ d'un coup de pied : le dernier porteur frappe.
    const phasePied = state.phase === 'COUP_DE_PIED_JEU' || state.phase === 'COUP_ENVOI';
    if (enVol && phasePied && dernierePhase !== state.phase && dernierPorteur) {
      const pa = anims.get(dernierPorteur); if (pa) pa.frappe = 0.45;
    }
    if (!enVol) dernierPorteur = porteurCle;
    dernierePhase = state.phase;
  }

  // --- BALLON ---------------------------------------------------------------------
  function hauteurVol(state) {
    if (state.phase === 'TOUCHE') return 3.2;
    if (state.phase === 'TRANSFORMATION' || state.phase === 'PENALITE_TIR') return 8;
    return 12;
  }
  function dessinerBallonLibre(x, y, haut, rotation) {
    const sol = versCanvas(x, y);
    const k = cam.s * HAUTEUR_VUE;
    const t = Math.max(0.13 * cam.s, 3);
    ctx.save();
    ctx.globalAlpha = Math.max(0.12, 0.3 - haut * 0.01);
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(sol.px, sol.py, t * 1.2, t * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    const grossi = 1 + Math.min(0.6, haut * 0.04);
    // Le ballon haut reste à l'écran : sa hauteur affichée est plafonnée au-dessus du bord (son ombre, au sol,
    // garde la position vraie).
    const leve = Math.min(haut * k, Math.max(0, sol.py - Math.max(12, t * 2)));
    ctx.save();
    ctx.translate(sol.px, sol.py - leve);
    ctx.rotate(rotation);
    ctx.fillStyle = '#8d5524';
    ctx.beginPath(); ctx.ellipse(0, 0, t * 1.5 * grossi, t * 0.95 * grossi, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#4e2c10'; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = '#f2e6d0'; ctx.beginPath(); ctx.moveTo(-t * 0.6, 0); ctx.lineTo(t * 0.6, 0); ctx.stroke();
    ctx.restore();
  }

  function dessinerBallon(state, porteurDessine) {
    const ballon = state.ballon || { x: state.porteur.x, y: state.porteur.y, enVol: false, hauteur: 0 };
    const rot = (performance.now() / 120) % (Math.PI * 2);
    if (ballon.enVol) { dessinerBallonLibre(ballon.x, ballon.y, (ballon.hauteur || 0) * hauteurVol(state), rot); return; }
    const pos = state.ballonRendu || ballon;
    if (state.ball && state.ball.state === 'LOOSE') { dessinerBallonLibre(pos.x, pos.y, (ballon.rebond || 0) * 1.5, (ballon.rotation || 0) + Math.PI / 4); return; }
    if (state.ball && (state.ball.state === 'RUCK' || state.ball.state === 'SCRUM')) { dessinerBallonLibre(pos.x, pos.y, 0.1, Math.PI / 4); return; }
    // En transit (sortie de regroupement, passe) : le ballon rendu n'est pas encore dans les mains.
    if (!porteurDessine || (state.porteur && Math.hypot(pos.x - state.porteur.x, pos.y - state.porteur.y) > 1.2)) {
      dessinerBallonLibre(pos.x, pos.y, 1.1, rot);
    }
  }

  // Repère du ballon sous le pack (mêlée) : anneau pointillé par-dessus les corps.
  function dessinerRepereBallon(state) {
    const ballon = state.ballon;
    if (!ballon) return;
    const pos = state.ballonRendu || ballon;
    const { px, py } = versCanvas(pos.x, pos.y);
    const r = Math.max(8, 0.55 * cam.s);
    ctx.save();
    ctx.beginPath(); ctx.ellipse(px, py, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)'; ctx.stroke();
    ctx.setLineDash([4, 3]); ctx.lineWidth = 2; ctx.strokeStyle = '#ffe066'; ctx.stroke();
    ctx.restore();
  }

  // --- OFFICIELS ---------------------------------------------------------------------
  // L'étiquette « arbitre » n'est écrite que sur grand écran : sur téléphone elle chevauchait les
  // joueurs du regroupement que l'arbitre suit de près (P2-75), quel que soit le zoom de la caméra.
  function etiquetteArbitre() { return W >= 700 && rayonJoueur() >= 10; }

  function dessinerArbitre(state) {
    const arb = state.arbitre;
    if (!arb) return;
    const a = etatAnim('ARB');
    suivrePosition(a, arb, 0);
    const { px, py } = versCanvas(arb.x, arb.y);
    const faux = { team: 'ARB', numero: 0 };
    const signal = arb.signal === 'AVANTAGE' || arb.signal === 'ESSAI' || arb.signal === 'SIFFLET';
    dessinerPersonnage(px, py, faux, a, signal ? 'leveur' : 'course', COULEURS.ARB, {});
    if (etiquetteArbitre()) {
      ctx.save();
      ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      ctx.fillText('arbitre', px, py + 12);
      ctx.restore();
    }
  }

  // Les juges de touche sont de vrais arbitres (même personnage et même tenue que l'arbitre central), HORS du terrain : ils
  // longent leur touche, fanion à la main, bras levé quand ils signalent la touche. Sur un tir au but, ils se tiennent derrière
  // l'en-but, un à chaque pied de poteau : drapeau LEVÉ si le ballon passe, laissé BAS (pendant le long du corps) s'il ne passe pas.
  function dessinerAssistants(state) {
    for (const assistant of (state.assistants || [])) {
      const a = etatAnim('ASS' + assistant.cote);
      suivrePosition(a, assistant, 0);
      const { px, py } = versCanvas(assistant.x, assistant.y);
      const haut = assistant.signal === 'TOUCHE' || assistant.signal === 'DRAPEAU_HAUT';
      const bas = assistant.signal === 'DRAPEAU_BAS';
      const k = cam.s * HAUTEUR_VUE;
      // TOUCHE : l'assistant lève le drapeau d'un bras et TEND L'AUTRE BRAS vers l'équipe qui lance (sa direction d'attaque).
      if (assistant.signal === 'TOUCHE' && (assistant.pour === 'A' || assistant.pour === 'B')) {
        dessinerPersonnage(px, py, { team: 'ARB', numero: 0 }, a, 'touche', COULEURS.ARB, {});
        const sens = assistant.pour === 'A' ? 1 : -1;
        const q = versCanvas(assistant.x + sens, assistant.y);
        let dx = q.px - px, dy = q.py - py; const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
        const Hs = pixelSprite() * SH; // hauteur réelle du sprite en pixels
        // Orientation portrait : la direction d'attaque est quasi verticale à l'écran et le bras se confondrait avec le corps ;
        // on l'écarte alors en diagonale (vers l'avant de l'équipe qui lance) pour qu'il reste lisible.
        if (Math.abs(dx) < 0.5) { dy = (dy >= 0 ? 1 : -1) * Math.sqrt(0.75); dx = dx < 0 ? -0.5 : 0.5; }
        const cote = dx > 0.15 ? 1 : dx < -0.15 ? -1 : 1;
        const epaule = { x: px + cote * 0.11 * Hs, y: py - 0.69 * Hs }; // épaule du bras tendu
        const epauleDrap = { x: px - cote * 0.11 * Hs, y: py - 0.69 * Hs }; // épaule du bras qui tient le drapeau
        const bout = { x: epaule.x + dx * 0.5 * Hs, y: epaule.y + dy * 0.5 * Hs + 0.02 * Hs };
        // Le bras tendu part du côté vers lequel il montre ; le drapeau est levé de l'AUTRE bras, côté opposé.
        const flag = { x: epauleDrap.x - cote * 0.1 * Hs, y: py - 1.08 * Hs };
        const manche = COULEURS.ARB.maillot, peau = '#f2c9a0';
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = manche; ctx.lineWidth = Math.max(2, 0.085 * Hs);
        ctx.beginPath(); ctx.moveTo(epaule.x, epaule.y); ctx.lineTo(bout.x, bout.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(epauleDrap.x, epauleDrap.y); ctx.lineTo(flag.x, flag.y); ctx.stroke();
        ctx.fillStyle = peau;
        ctx.beginPath(); ctx.arc(bout.x, bout.y, Math.max(1.6, 0.05 * Hs), 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(flag.x, flag.y, Math.max(1.6, 0.05 * Hs), 0, Math.PI * 2); ctx.fill();
        const haut2 = flag.y - 0.55 * Hs;
        ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = Math.max(1.2, 0.035 * Hs);
        ctx.beginPath(); ctx.moveTo(flag.x, flag.y); ctx.lineTo(flag.x, haut2); ctx.stroke();
        ctx.fillStyle = '#ffdf50';
        const sensDrap = -cote; // le fanion flotte à l'opposé du bras tendu
        ctx.beginPath(); ctx.moveTo(flag.x, haut2); ctx.lineTo(flag.x + sensDrap * 0.32 * Hs, haut2 + 0.09 * Hs); ctx.lineTo(flag.x, haut2 + 0.2 * Hs); ctx.closePath(); ctx.fill();
        ctx.restore();
        continue;
      }
      dessinerPersonnage(px, py, { team: 'ARB', numero: 0 }, a, haut ? 'leveur' : 'course', COULEURS.ARB, {});
      // Fanion tenu à la main, côté terrain : DRESSÉ au signal (levé), BAISSÉ (pend vers le sol) après un tir manqué, relevé
      // à mi-hauteur au repos.
      const mainX = px + 0.38 * k;
      let mainY, boutY, tissu;
      if (bas) { mainY = py - 0.95 * k; boutY = py - 0.3 * k; tissu = [[0, 0.12], [0.5, 0.25], [0, 0.38]].map(([dx, dy]) => [mainX + dx * k, mainY + dy * k + 0.3 * k]); }
      else {
        mainY = py - (haut ? 1.55 : 0.95) * k; boutY = py - (haut ? 2.7 : 1.55) * k;
        tissu = [[0, 0], [0.6, 0.17], [0, 0.36]].map(([dx, dy]) => [mainX + dx * k, boutY + dy * k]);
      }
      ctx.save();
      ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = Math.max(1.2, 0.07 * k);
      ctx.beginPath(); ctx.moveTo(mainX, mainY); ctx.lineTo(mainX, boutY); ctx.stroke();
      ctx.fillStyle = '#ffdf50';
      ctx.beginPath(); ctx.moveTo(tissu[0][0], tissu[0][1]); ctx.lineTo(tissu[1][0], tissu[1][1]); ctx.lineTo(tissu[2][0], tissu[2][1]); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  // --- MINI-CARTE ---------------------------------------------------------------------
  function dessinerMiniCarte(state) {
    // Aperçu tactique ancré en bas à droite, en dehors du score.
    const w = Math.round(paysage ? Math.min(170, W * 0.16) : Math.min(70, W * 0.19));
    const longueurTot = LONGUEUR + 2 * PROF_EN_BUT;
    const h = Math.round(paysage ? w * LARGEUR / longueurTot : w * longueurTot / LARGEUR);
    const x0 = W - w - 12, y0 = H - h - 12;
    const versMini = (x, y) => paysage
      ? { x: x0 + (x + PROF_EN_BUT) / longueurTot * w, y: y0 + y / LARGEUR * h }
      : { x: x0 + y / LARGEUR * w, y: y0 + (x + PROF_EN_BUT) / longueurTot * h };
    ctx.save();
    ctx.globalAlpha = paysage ? 0.86 : 0.72;
    ctx.fillStyle = '#1b3d1f'; ctx.fillRect(x0 - 3, y0 - 3, w + 6, h + 6);
    ctx.fillStyle = '#3a8f3e'; ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
    for (const x of [0, 22, 50, 78, 100]) { const a = versMini(x, 0), b = versMini(x, LARGEUR); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    for (const team of ['A', 'B']) {
      ctx.fillStyle = COULEURS[team].maillot;
      for (const j of state.teams[team]) {
        if (j.sinBin > 0) continue;
        const p = versMini(j.x, j.y);
        ctx.beginPath(); ctx.arc(p.x, p.y, paysage ? 2.2 : 1.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    const b = state.ballonRendu || state.ballon;
    if (b) { const p = versMini(b.x, b.y); ctx.fillStyle = '#ffeb3b'; ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2); ctx.fill(); }
    // Cadre de la caméra.
    const hx = (paysage ? W : H / INCLINAISON) / 2 / cam.s, hy = (paysage ? H / INCLINAISON : W) / 2 / cam.s;
    const c1 = versMini(cam.x - hx, cam.y - hy), c2 = versMini(cam.x + hx, cam.y + hy);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1.5;
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
    ctx.strokeRect(Math.min(c1.x, c2.x), Math.min(c1.y, c2.y), Math.abs(c2.x - c1.x), Math.abs(c2.y - c1.y));
    ctx.restore();
    ctx.restore();
  }

  // --- ORDRE ET BOUCLE ---------------------------------------------------------------------
  // Pendant une mêlée, le ballon est AU SOL SOUS les packs : dessiné avant les
  // joueurs ; son repère (anneau au sol) passe au-dessus. Sinon il est dans les
  // mains ou en l'air et passe par-dessus.
  function ordreCouches(state) {
    return state && state.ball && state.ball.state === 'SCRUM'
      ? ['terrain', 'ballon', 'joueurs', 'repere', 'assistants', 'arbitre']
      : ['terrain', 'joueurs', 'assistants', 'arbitre', 'ballon'];
  }

  function dessiner(state) {
    // L'unité de tous les dessins demeure le pixel CSS (texte, terrain, caméra).
    // On réinitialise explicitement la matrice, y compris après un resize Retina.
    ctx.setTransform(densite, 0, 0, densite, 0, 0);
    const maintenant = performance.now();
    const dt = dernierMs === null ? 0 : Math.min(0.1, (maintenant - dernierMs) / 1000);
    dernierMs = maintenant;
    majAnimations(state, dt);
    majCamera(state, dt);

    const sansPorteur = (state.ballon && state.ballon.enVol) || (state.ball && (state.ball.state === 'LOOSE' || state.ball.state === 'SCRUM' || state.ball.state === 'RUCK'));
    const estPorteur = (j) => !sansPorteur && state.porteur && j.team === state.porteur.team && j.numero === state.porteur.numero;
    let porteurDessine = false;
    const couches = {
      terrain: () => { dessinerTerrain(); dessinerPoteaux(0); dessinerPoteaux(LONGUEUR); },
      ballon: () => dessinerBallon(state, porteurDessine),
      joueurs: () => {
        // Tri par profondeur : un joueur plus bas à l'écran (plus proche) passe devant.
        const liste = [];
        for (const team of ['A', 'B']) for (const j of state.teams[team]) {
          if (j.sinBin > 0) continue; // exclu temporaire : hors du terrain
          const a = anims.get(team + j.numero);
          const p = versCanvas(a.rx, a.ry);
          liste.push({ j, a, p });
        }
        liste.sort((u, v) => u.p.py - v.p.py);
        for (const { j, a, p } of liste) {
          const porteur = estPorteur(j);
          const posture = pose(j, a, state, porteur);
          dernieresPostures[j.team + j.numero] = posture;
          const ts = state.toucheSauteur;
          const pris = dessinerPersonnage(p.px, p.py, j, a, posture, COULEURS[j.team],
            { estPorteur: porteur, porteBallon: porteur, prog: ts ? ts.prog : 0 });
          if (porteur && pris) porteurDessine = true;
        }
      },
      repere: () => dessinerRepereBallon(state),
      assistants: () => dessinerAssistants(state),
      arbitre: () => dessinerArbitre(state),
    };
    for (const c of ordreCouches(state)) couches[c]();
    dessinerMiniCarte(state);
  }

  global.RMRenderer = { init, redimensionner, versCanvas, dessiner, ordreCouches, rayonJoueur, etiquetteArbitre,
    orientation, camera: () => ({ x: cam.x, y: cam.y, s: cam.s, paysage }), postures: () => Object.assign({}, dernieresPostures) };
})(window);
