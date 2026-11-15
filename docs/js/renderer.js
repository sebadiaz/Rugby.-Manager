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

  function redimensionner(hudH, seekH, ctrlH) {
    W = window.innerWidth;
    H = Math.max(120, window.innerHeight - (hudH || 0) - (seekH || 0) - (ctrlH || 0));
    canvas.width = W;
    canvas.height = H;
    canvas.style.marginTop = (hudH || 0) + 'px';
    paysage = W >= H;
    // Échelle initiale : vue large, recalée dès la première image par la caméra.
    cam.s = echelleCible('PORTE');
    scale = cam.s;
  }

  // --- CAMÉRA -----------------------------------------------------------------
  // Étendue visible le long de l'axe horizontal de l'écran (mètres), par phase.
  // En paysage : longueur du terrain ; en portrait : largeur.
  const ETENDUE = {
    paysage: { PORTE: 48, RUCK: 42, MAUL: 38, MELEE: 34, TOUCHE: 40, COUP_DE_PIED_JEU: 64, COUP_ENVOI: 66,
      ESSAI: 48, TRANSFORMATION: 54, PENALITE_TIR: 54, MI_TEMPS: 130, TERMINE: 130 },
    portrait: { PORTE: 38, RUCK: 33, MAUL: 30, MELEE: 27, TOUCHE: 31, COUP_DE_PIED_JEU: 52, COUP_ENVOI: 54,
      ESSAI: 40, TRANSFORMATION: 44, PENALITE_TIR: 44, MI_TEMPS: 80, TERMINE: 80 },
  };
  function echelleCible(phase) {
    const t = paysage ? ETENDUE.paysage : ETENDUE.portrait;
    const etendue = t[phase] || t.PORTE;
    let s = W / etendue;
    // Toujours assez de profondeur visible pour lire les lignes (≥ 30 m sur l'autre axe).
    const profondeur = H / (s * INCLINAISON);
    if (profondeur < 30) s = H / (30 * INCLINAISON);
    // Jamais plus petit que la vue du terrain entier (les joueurs restent lisibles).
    const sMin = paysage ? Math.min(W / (LONGUEUR + 2 * PROF_EN_BUT + 8), H / ((LARGEUR + 16) * INCLINAISON))
      : Math.min(W / (LARGEUR + 16), H / ((LONGUEUR + 2 * PROF_EN_BUT + 8) * INCLINAISON));
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

  // Dessine un personnage, pieds en (sx, sy). Repère local en mètres : x vers
  // l'avant du joueur (retourné selon `sens`), y vers le haut.
  function dessinerPersonnage(sx, sy, j, a, posture, couleurs, opts) {
    const k = cam.s * HAUTEUR_VUE * SPRITE;
    if (k < 2) return;
    const g = gabarit(j);
    const T = g.taille / 1.85;
    const larg = g.largeur;
    const cle = j.team + j.numero;
    const peau = PEAUX[hash(cle) % PEAUX.length], cheveux = CHEVEUX[hash(cle + 'h') % CHEVEUX.length];
    const casque = j.numero <= 5 && hash(cle + 'c') % 3 === 0;
    // Vue : profil (gauche/droite), face ou dos, selon la direction à l'écran.
    const e = versEcran(a.fx, a.fy);
    const vueProfil = Math.abs(e.x) >= Math.abs(e.y) * 0.8;
    const vue = vueProfil ? 'profil' : (e.y > 0 ? 'face' : 'dos');
    const sens = (vueProfil ? Math.sign(e.x) : a.dirAction) || 1;
    const v = Math.min(1, a.vit / 7);
    const ph = a.phase;
    const balanceJ = Math.sin(ph) * 0.42 * v;   // jambes
    const balanceB = -Math.sin(ph) * 0.5 * v;   // bras (opposés)
    const rebond = Math.abs(Math.sin(ph)) * 0.05 * v;

    // Ombre.
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(sx, sy, 0.45 * cam.s * SPRITE * larg, 0.2 * cam.s * SPRITE, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(sx, sy);
    let incl = 0, hausse = 0, flechi = 0;
    switch (posture) {
      case 'sol': incl = Math.PI / 2; break;
      case 'chute': incl = (Math.PI / 2) * Math.min(1, a.chute); break;
      case 'releve': flechi = 0.45; break;
      case 'ruck': incl = 0.85; flechi = 0.25; break;
      case 'maul': incl = 0.6; flechi = 0.15; break;
      case 'melee': incl = 1.25; flechi = 0.35; break;
      case 'saut': hausse = 0.9 * Math.sin(Math.PI * Math.min(1, (opts.prog || 0) * 1.1)) + 0.3; break;
      default: break;
    }
    if (posture === 'sol' || posture === 'chute') ctx.globalAlpha = 0.92;
    ctx.scale(sens * k * (vue === 'profil' ? 1 : 1), -k);
    ctx.translate(0, hausse + rebond);
    ctx.rotate(-incl); // penché vers l'avant
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const lw = (m) => { ctx.lineWidth = m; };

    const hanche = (0.92 - flechi) * T, epaule = (1.48 - flechi * 0.6) * T, tete = (1.66 - flechi * 0.6) * T;
    const demiCorps = (vue === 'profil' ? 0.17 : 0.25) * larg;
    const ecartJ = vue === 'profil' ? 0.02 : 0.11 * larg;

    // Jambes (chaussettes + cuisses), de la hanche au pied.
    const jambe = (cote, ang) => {
      const pied = vue === 'profil'
        ? { x: Math.sin(ang) * 0.55, y: Math.max(0, Math.cos(ang + Math.PI / 2) * 0.12) }
        : { x: cote * ecartJ, y: Math.max(0, Math.sin(ang * cote) * 0.18) };
      if (posture === 'melee' || posture === 'ruck') { pied.x = -0.35 - cote * 0.05; }
      if (posture === 'releve') { pied.x = cote > 0 ? 0.35 : -0.15; }
      const genou = { x: (pied.x + cote * ecartJ) / 2 + (vue === 'profil' ? 0.06 : 0), y: hanche * 0.5 + pied.y * 0.4 };
      lw(0.19 * larg); ctx.strokeStyle = couleurs.chaussette;
      ctx.beginPath(); ctx.moveTo(genou.x, genou.y); ctx.lineTo(pied.x, pied.y + 0.04); ctx.stroke();
      lw(0.2 * larg); ctx.strokeStyle = peau;
      ctx.beginPath(); ctx.moveTo(cote * ecartJ, hanche - 0.1); ctx.lineTo(genou.x, genou.y + 0.05); ctx.stroke();
      ctx.fillStyle = '#111';
      ctx.fillRect(pied.x - 0.06, pied.y, 0.18, 0.07);
    };
    let angG = balanceJ, angD = -balanceJ;
    if (posture === 'frappe') { angD = 1.3 * Math.sin(Math.PI * Math.min(1, 1 - a.frappe / 0.45)); angG = -0.2; }
    jambe(-1, angG);
    jambe(1, angD);

    // Short.
    ctx.fillStyle = couleurs.short;
    ctx.fillRect(-demiCorps, hanche - 0.18, demiCorps * 2, 0.24);
    // Maillot (torse).
    ctx.fillStyle = couleurs.maillot;
    ctx.beginPath();
    ctx.moveTo(-demiCorps, hanche);
    ctx.lineTo(-demiCorps * 1.08, epaule);
    ctx.lineTo(demiCorps * 1.08, epaule);
    ctx.lineTo(demiCorps, hanche);
    ctx.closePath();
    ctx.fill();
    // Col.
    ctx.fillStyle = couleurs.col;
    ctx.fillRect(-0.06, epaule - 0.04, 0.12, 0.04);

    // Bras.
    const bras = (cote, ang, versHaut) => {
      const ep = { x: (vue === 'profil' ? 0.02 : cote * demiCorps * 1.05), y: epaule - 0.04 };
      let main;
      if (versHaut) main = { x: ep.x + 0.05 * cote, y: ep.y + 0.62 };
      else if (posture === 'passe') main = { x: ep.x + 0.5, y: ep.y - 0.12 };
      else if (posture === 'porte' && cote > 0) main = { x: ep.x + 0.22, y: ep.y - 0.3 };
      else if (posture === 'ruck' || posture === 'maul' || posture === 'melee') main = { x: ep.x + 0.42, y: ep.y - 0.1 };
      else if (posture === 'reception') main = { x: ep.x + 0.35, y: ep.y + 0.25 };
      else main = vue === 'profil' ? { x: ep.x + Math.sin(ang) * 0.42, y: ep.y - Math.cos(ang) * 0.5 }
        : { x: ep.x + cote * 0.06, y: ep.y - 0.5 + Math.max(0, Math.sin(ang * cote)) * 0.12 };
      lw(0.16 * larg); ctx.strokeStyle = couleurs.maillot;
      const coude = { x: (ep.x + main.x) / 2, y: (ep.y + main.y) / 2 };
      ctx.beginPath(); ctx.moveTo(ep.x, ep.y); ctx.lineTo(coude.x, coude.y); ctx.stroke();
      lw(0.13 * larg); ctx.strokeStyle = peau;
      ctx.beginPath(); ctx.moveTo(coude.x, coude.y); ctx.lineTo(main.x, main.y); ctx.stroke();
      return main;
    };
    const brasHaut = posture === 'saut' || posture === 'leveur';
    bras(-1, balanceB, brasHaut);
    const mainD = bras(1, -balanceB, brasHaut);

    // Tête.
    ctx.fillStyle = peau;
    ctx.beginPath(); ctx.arc(vue === 'profil' ? 0.02 : 0, tete + 0.02, 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = casque ? couleurs.maillot : cheveux;
    ctx.beginPath();
    if (vue === 'dos' || casque) ctx.arc(0, tete + 0.03, 0.155, 0, Math.PI * 2);
    else ctx.arc(vue === 'profil' ? -0.02 : 0, tete + 0.07, 0.14, 0, Math.PI);
    ctx.fill();

    // Ballon tenu : contre la poitrine, dans la main côté avant.
    let ballon = null;
    if (opts.porteBallon && posture !== 'sol' && posture !== 'chute') {
      const bx = vue === 'profil' ? mainD.x + 0.06 : 0.0, by = vue === 'profil' ? mainD.y + 0.04 : epaule - 0.32;
      ctx.save(); ctx.translate(bx, by); ctx.rotate(0.6);
      ctx.fillStyle = '#8d5524'; ctx.beginPath(); ctx.ellipse(0, 0, 0.17, 0.11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#f2e6d0'; lw(0.015); ctx.beginPath(); ctx.moveTo(-0.08, 0); ctx.lineTo(0.08, 0); ctx.stroke();
      ctx.restore();
      ballon = true;
    }
    ctx.restore();

    // Numéro (repère écran, non retourné) : dans le dos, sur le côté du maillot,
    // ou au-dessus de la tête quand l'échelle est trop petite pour le lire sur le corps.
    const hautCorps = (posture === 'sol' || posture === 'chute') ? 0.25 : ((1.2 - flechi) * T + hausse);
    const tailleNum = Math.round(0.34 * k);
    if (j.team === 'ARB') return null;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const penche = posture === 'melee' || posture === 'ruck' || posture === 'maul';
    if (penche && tailleNum < 14) { ctx.restore(); return ballon; }
    if (tailleNum >= 8 && posture !== 'sol' && posture !== 'chute' && incl < 0.9) {
      ctx.font = 'bold ' + tailleNum + 'px sans-serif';
      ctx.fillStyle = vue === 'face' ? 'rgba(255,255,255,0.75)' : couleurs.numero;
      ctx.fillText(String(j.numero), sx, sy - hautCorps * k);
    } else if (posture !== 'sol') {
      ctx.font = 'bold ' + Math.max(8, Math.round(rayonJoueur())) + 'px sans-serif';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      const yNum = sy - (2.05 * T + hausse) * k - 4;
      ctx.strokeText(String(j.numero), sx, yNum);
      ctx.fillStyle = couleurs.maillot === '#1b1b1b' ? '#f9a825' : '#fff';
      ctx.fillText(String(j.numero), sx, yNum);
    }
    ctx.restore();
    // Porteur : discret anneau doré au sol, lisible même dans un regroupement.
    if (opts.estPorteur) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,214,0,0.9)';
      ctx.lineWidth = Math.max(1.5, 0.08 * cam.s);
      ctx.beginPath(); ctx.ellipse(sx, sy, 0.62 * cam.s * SPRITE, 0.28 * cam.s * SPRITE, 0, 0, Math.PI * 2); ctx.stroke();
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
        if (auSol && !a.solPrec) a.chute = 0;
        a.chute = auSol ? Math.min(1, a.chute + dt / 0.32) : 0;
        a.solPrec = auSol;
        a.passe = Math.max(0, a.passe - dt);
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
  function etiquetteArbitre() { return rayonJoueur() >= 10; }

  function dessinerArbitre(state) {
    const arb = state.arbitre;
    if (!arb) return;
    const a = etatAnim('ARB');
    suivrePosition(a, arb, 0);
    const { px, py } = versCanvas(arb.x, arb.y);
    const faux = { team: 'ARB', numero: 0 };
    const signal = arb.signal === 'AVANTAGE' || arb.signal === 'ESSAI';
    dessinerPersonnage(px, py, faux, a, signal ? 'leveur' : 'course', COULEURS.ARB, {});
    if (etiquetteArbitre()) {
      ctx.save();
      ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      ctx.fillText('arbitre', px, py + 12);
      ctx.restore();
    }
  }

  function dessinerAssistants(state) {
    for (const assistant of (state.assistants || [])) {
      const { px, py } = versCanvas(assistant.x, assistant.y);
      const k = cam.s * HAUTEUR_VUE;
      const haut = assistant.signal === 'TOUCHE';
      ctx.save();
      ctx.fillStyle = '#1b1b1b';
      ctx.fillRect(px - 0.18 * k, py - 1.5 * k, 0.36 * k, 0.9 * k);
      ctx.fillStyle = '#e0ac69';
      ctx.beginPath(); ctx.arc(px, py - 1.68 * k, 0.13 * k, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = Math.max(1.5, 0.1 * k);
      ctx.beginPath(); ctx.moveTo(px + 0.15 * k, py - 1.3 * k); ctx.lineTo(px + 0.3 * k, py - (haut ? 2.6 : 1.0) * k); ctx.stroke();
      ctx.fillStyle = '#ffdf50';
      const fy = py - (haut ? 2.6 : 1.0) * k;
      ctx.beginPath(); ctx.moveTo(px + 0.3 * k, fy); ctx.lineTo(px + 0.85 * k, fy + 0.18 * k); ctx.lineTo(px + 0.3 * k, fy + 0.38 * k); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  // --- MINI-CARTE ---------------------------------------------------------------------
  function dessinerMiniCarte(state) {
    // Petite en portrait (téléphone) : à 30 % de la largeur elle masquait des joueurs.
    const w = Math.round(paysage ? Math.min(190, W * 0.18) : Math.min(64, W * 0.17));
    const longueurTot = LONGUEUR + 2 * PROF_EN_BUT;
    const h = Math.round(paysage ? w * LARGEUR / longueurTot : w * longueurTot / LARGEUR);
    const x0 = W - w - 10, y0 = 10;
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
    camera: () => ({ x: cam.x, y: cam.y, s: cam.s, paysage }), postures: () => Object.assign({}, dernieresPostures) };
})(window);
