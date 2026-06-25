// Rendu Canvas pur : ne contient aucune règle de jeu, seulement comment
// dessiner un état déjà calculé par le moteur (cf. docs/js/matchState.js).
(function (global) {
  'use strict';

  const { LONGUEUR, LARGEUR } = global.RugbyEngine;
  const { PROF_EN_BUT, MARGE_TOUCHE } = global.RMConstants;

  let canvas, ctx;
  let scale = 1, offsetX = 0, offsetY = 0;

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    redimensionner();
  }

  function redimensionner(hudH, seekH, ctrlH) {
    const w = window.innerWidth;
    const h = window.innerHeight - hudH - seekH - ctrlH;
    canvas.width = w;
    canvas.height = h;
    canvas.style.marginTop = hudH + 'px';
    const longueurTotale = LONGUEUR + 2 * PROF_EN_BUT;
    const largeurTotale = LARGEUR + 2 * MARGE_TOUCHE;
    scale = Math.min(w / largeurTotale, h / longueurTotale);
    offsetX = w / 2;
    offsetY = (h - longueurTotale * scale) / 2 + PROF_EN_BUT * scale;
  }

  // Convertit des coordonnées terrain (mètres, x = longueur en-but à en-but,
  // y = largeur touche à touche) en coordonnées canvas (pixels).
  function versCanvas(x, y) {
    return { px: offsetX + (y - LARGEUR / 2) * scale, py: offsetY + x * scale };
  }

  function ligneTerrain(x1, y1, x2, y2, { couleur = '#ffffff', largeur = 2, alpha = 1, dash = null } = {}) {
    const a = versCanvas(x1, y1), b = versCanvas(x2, y2);
    ctx.save();
    ctx.setLineDash(dash || []);
    ctx.globalAlpha = alpha;
    ctx.lineWidth = largeur;
    ctx.strokeStyle = couleur;
    ctx.beginPath();
    ctx.moveTo(a.px, a.py);
    ctx.lineTo(b.px, b.py);
    ctx.stroke();
    ctx.restore();
  }

  function zoneTerrain(x1, y1, x2, y2, couleur) {
    const a = versCanvas(x1, y1), b = versCanvas(x2, y2);
    ctx.fillStyle = couleur;
    ctx.fillRect(Math.min(a.px, b.px), Math.min(a.py, b.py), Math.abs(b.px - a.px), Math.abs(b.py - a.py));
  }

  // Poteaux en H sur la ligne d'essai : deux montants espacés de 5,6 m reliés
  // par la barre transversale (vue de dessus, la barre suit la largeur).
  function dessinerPoteaux(xLigne) {
    const demiEcart = 2.8;
    const cy = LARGEUR / 2;
    ligneTerrain(xLigne, cy - demiEcart, xLigne, cy + demiEcart, { couleur: '#f5f5f5', largeur: 3 });
    for (const dy of [-demiEcart, demiEcart]) {
      const p = versCanvas(xLigne, cy + dy);
      ctx.beginPath();
      ctx.arc(p.px, p.py, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#fdfdfd';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#9e9e9e';
      ctx.stroke();
    }
  }

  function dessinerTerrain() {
    ctx.fillStyle = '#2e7d32';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    zoneTerrain(-PROF_EN_BUT, 0, 0, LARGEUR, '#256528');
    zoneTerrain(LONGUEUR, 0, LONGUEUR + PROF_EN_BUT, LARGEUR, '#256528');

    ligneTerrain(-PROF_EN_BUT, 0, LONGUEUR + PROF_EN_BUT, 0, { largeur: 2 });
    ligneTerrain(-PROF_EN_BUT, LARGEUR, LONGUEUR + PROF_EN_BUT, LARGEUR, { largeur: 2 });
    ligneTerrain(-PROF_EN_BUT, 0, -PROF_EN_BUT, LARGEUR, { largeur: 2 });
    ligneTerrain(LONGUEUR + PROF_EN_BUT, 0, LONGUEUR + PROF_EN_BUT, LARGEUR, { largeur: 2 });

    ligneTerrain(0, 0, 0, LARGEUR, { largeur: 3 });
    ligneTerrain(LONGUEUR, 0, LONGUEUR, LARGEUR, { largeur: 3 });
    for (const x of [22, 50, 78]) ligneTerrain(x, 0, x, LARGEUR, { largeur: 2, alpha: 0.85 });

    for (const x of [40, 60, 5, 95]) ligneTerrain(x, 0, x, LARGEUR, { largeur: 2, alpha: 0.6, dash: [10, 8] });

    for (const y of [5, 15, LARGEUR - 15, LARGEUR - 5]) {
      ligneTerrain(0, y, LONGUEUR, y, { largeur: 1, alpha: 0.35, dash: [4, 10] });
    }

    dessinerPoteaux(0);
    dessinerPoteaux(LONGUEUR);
  }

  function dessinerJoueur(j, estPorteur) {
    const { px, py } = versCanvas(j.x, j.y);
    ctx.beginPath();
    ctx.arc(px, py, 10, 0, Math.PI * 2);
    ctx.fillStyle = j.team === 'A' ? '#1565c0' : '#c62828';
    if (j.auSol > 0) ctx.fillStyle = j.team === 'A' ? '#5c7fa3' : '#a36a6a';
    ctx.fill();
    if (estPorteur) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffeb3b';
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(j.numero, px, py);
  }

  function dessinerBallon(state) {
    const ballon = state.ballon || { x: state.porteur.x, y: state.porteur.y, enVol: false, hauteur: 0 };
    const sol = versCanvas(ballon.x, ballon.y);
    if (ballon.enVol) {
      // Coup d'envoi en cloche : ombre au sol (qui rétrécit quand le ballon
      // monte) + ballon décalé vers le haut et nettement grossi à l'apogée,
      // pour bien montrer qu'il est haut dans les airs.
      const lift = ballon.hauteur * 60;
      ctx.save();
      ctx.globalAlpha = 0.28 - ballon.hauteur * 0.12;
      ctx.beginPath();
      ctx.ellipse(sol.px, sol.py, 6 - ballon.hauteur * 2, 3 - ballon.hauteur, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.restore();
      const taille = 6 + ballon.hauteur * 8;
      ctx.beginPath();
      ctx.ellipse(sol.px, sol.py - lift, taille, taille * 0.6, Math.PI / 4, 0, Math.PI * 2);
      ctx.fillStyle = '#8d5524';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#5d3a1a';
      ctx.stroke();
      return;
    }
    // Ballon au sol après un coup de pied tactique, pas encore récupéré :
    // posé au point de chute réel, jamais dans des mains (personne ne l'a
    // encore rejoint en courant) — cf. MatchEngine._tickReceptionCoupDePied.
    if (state.ball && state.ball.state === 'LOOSE') {
      ctx.beginPath();
      ctx.ellipse(sol.px, sol.py, 6, 3.8, Math.PI / 4, 0, Math.PI * 2);
      ctx.fillStyle = '#8d5524';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#5d3a1a';
      ctx.stroke();
      return;
    }
    // Ballon au ruck : personne ne le tient, il est au sol au point de
    // regroupement (le porteur affiché n'est que le dernier joueur plaqué,
    // couché dessus) — sinon le ballon semblait toujours "en mains" même
    // pendant la phase de jeu la plus fréquente du match.
    if (state.ball && state.ball.state === 'RUCK') {
      ctx.beginPath();
      ctx.ellipse(sol.px, sol.py + 5, 5.5, 3.4, Math.PI / 4, 0, Math.PI * 2);
      ctx.fillStyle = '#8d5524';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#5d3a1a';
      ctx.stroke();
      return;
    }
    // Ballon tenu : dessiné dans les mains du porteur, légèrement décalé.
    const main = versCanvas(state.porteur.x, state.porteur.y);
    ctx.beginPath();
    ctx.ellipse(main.px + 12, main.py - 8, 5, 3.2, Math.PI / 4, 0, Math.PI * 2);
    ctx.fillStyle = '#8d5524';
    ctx.fill();
  }

  // L'arbitre est toujours dessiné, près de l'action (ruck ou porteur) :
  // visible en permanence pour qu'on comprenne qui décide des
  // pénalités/mêlées et où il se trouve.
  function dessinerArbitre(state) {
    const { px, py } = versCanvas(state.arbitre.x, state.arbitre.y);
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#212121';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#f9a825';
    ctx.stroke();
    ctx.fillStyle = '#f9a825';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('A', px, py);
    ctx.font = '9px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('arbitre', px, py + 14);
  }

  function dessiner(state) {
    dessinerTerrain();
    // Pendant que le ballon est en vol ou au sol après un coup de pied
    // (personne ne l'a encore rejoint), on ne met aucun joueur en
    // surbrillance : le dernier porteur (le buteur) ne l'a plus en main.
    const sansPorteur = (state.ballon && state.ballon.enVol) || (state.ball && state.ball.state === 'LOOSE');
    const estPorteur = j => !sansPorteur && j.team === state.porteur.team && j.numero === state.porteur.numero;
    for (const j of state.teams.A) dessinerJoueur(j, estPorteur(j));
    for (const j of state.teams.B) dessinerJoueur(j, estPorteur(j));
    dessinerArbitre(state);
    dessinerBallon(state);
  }

  global.RMRenderer = { init, redimensionner, versCanvas, dessiner };
})(window);
