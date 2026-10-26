// Rendu Canvas pur : ne contient aucune règle de jeu, seulement comment
// dessiner un état déjà calculé par le moteur (cf. docs/js/matchState.js).
(function (global) {
  'use strict';

  const { LONGUEUR, LARGEUR } = global.RugbyEngine;
  const { PROF_EN_BUT, MARGE_TOUCHE } = global.RMConstants;

  let canvas, ctx;
  let scale = 1, offsetX = 0, offsetY = 0;
  // Sens de dessin du terrain. `false` = portrait (la longueur du terrain suit
  // la hauteur de l'ecran), `true` = paysage (elle suit la largeur). Choisi a
  // chaque redimensionnement par redimensionner(), jamais fige.
  let paysage = false;

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
    // ORIENTATION : le terrain est dessiné dans le sens qui le rend LE PLUS
    // GRAND à l'écran, au lieu d'être toujours en portrait. Mesuré sur le jeu
    // réel avant ce choix : dans une fenêtre 1400x1000, le terrain n'occupait
    // que 482 px de large sur 1400 (30 % de la surface, 1 m = 6,9 px) et les
    // deux tiers de l'écran étaient du vert vide ; dans une fenêtre 900x600,
    // 1 m ne valait plus que 3,4 px, si bien qu'un joueur (rayon fixe de 10 px)
    // couvrait 6 m de terrain et que la ligne de trois-quarts n'était plus
    // qu'un amas. Un téléphone en portrait reste en portrait : c'est ce sens
    // qui y donne la plus grande échelle, la règle le choisit toute seule.
    const echellePortrait = Math.min(w / largeurTotale, h / longueurTotale);
    const echellePaysage = Math.min(w / longueurTotale, h / largeurTotale);
    paysage = echellePaysage > echellePortrait;
    scale = paysage ? echellePaysage : echellePortrait;
    if (paysage) {
      offsetX = (w - longueurTotale * scale) / 2 + PROF_EN_BUT * scale;
      offsetY = h / 2;
    } else {
      offsetX = w / 2;
      offsetY = (h - longueurTotale * scale) / 2 + PROF_EN_BUT * scale;
    }
  }

  // Convertit des coordonnées terrain (mètres, x = longueur en-but à en-but,
  // y = largeur touche à touche) en coordonnées canvas (pixels). Seule cette
  // fonction connaît l'orientation : tout le reste du rendu (lignes, zones,
  // joueurs, ballon, arbitre) passe par elle et n'a pas eu à changer.
  function versCanvas(x, y) {
    return paysage
      ? { px: offsetX + x * scale, py: offsetY + (y - LARGEUR / 2) * scale }
      : { px: offsetX + (y - LARGEUR / 2) * scale, py: offsetY + x * scale };
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

  // Rayon d'un joueur À L'ÉCHELLE DU TERRAIN : ~1,4 m, borné entre 6,5 px
  // (numéro encore lisible) et 10 px (taille historique, inchangée sur grand
  // écran). À rayon fixe de 10 px, sur téléphone (1 m ~ 4,7 px), un joueur
  // couvrait plus de 4 m : en touche, maul ou ruck, les disques se
  // recouvraient et les numéros devenaient illisibles (P2-74).
  function rayonJoueur() {
    return Math.max(6.5, Math.min(10, scale * 1.4));
  }

  function dessinerJoueur(j, estPorteur) {
    const { px, py } = versCanvas(j.x, j.y);
    const r = rayonJoueur();
    // Dessiné couché si réellement au sol (plaqué, figé) OU s'il vient de plaquer
    // (marqueur visuel pur solVisuel) : la définition officielle du plaquage veut
    // que le plaqueur aille aussi au sol.
    const auSol = j.auSol > 0 || j.solVisuel > 0;
    ctx.save();
    ctx.beginPath();
    if (auSol) {
      // Joueur AU SOL : dessiné couché (ellipse aplatie) et atténué, pour qu'on
      // voie d'un coup d'œil qu'il est à terre et ne participe pas (plaqué qui
      // ne s'est pas encore relevé).
      ctx.ellipse(px, py, r * 1.2, r * 0.5, 0, 0, Math.PI * 2);
    } else {
      ctx.arc(px, py, r, 0, Math.PI * 2);
    }
    ctx.fillStyle = j.team === 'A' ? '#1565c0' : '#c62828';
    if (auSol) ctx.globalAlpha = 0.5;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (estPorteur) {
      // Porteur du ballon nettement marqué : anneau jaune épais + halo.
      ctx.lineWidth = Math.max(2.5, r * 0.4);
      ctx.strokeStyle = '#ffeb3b';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, py, r + 4, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255,235,59,0.5)';
      ctx.stroke();
    }
    ctx.fillStyle = auSol ? 'rgba(255,255,255,0.65)' : '#fff';
    ctx.font = Math.round(auSol ? r * 0.8 : Math.max(7.5, r)) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(j.numero, px, py);
    ctx.restore();
  }

  function dessinerBallon(state) {
    const ballon = state.ballon || { x: state.porteur.x, y: state.porteur.y, enVol: false, hauteur: 0 };
    // Position lissée du ballon au sol / en mains : la boucle de rendu fait
    // glisser `ballonRendu` vers sa cible logique (comme les joueurs) pour
    // supprimer les téléportations du ballon d'une marque à l'autre (sortie
    // de ruck, de mêlée, changement de porteur). En vol, on garde la position
    // physique du moteur (la cloche est déjà animée tick par tick).
    const posSol = (!ballon.enVol && state.ballonRendu) ? state.ballonRendu : ballon;
    const sol = versCanvas(posSol.x, posSol.y);
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
      // Ballon qui roule (P2-100) : il rebondit et tourne sur lui-même, avec
      // son ombre au sol ; posé à plat une fois arrêté.
      const rebond = ballon.rebond || 0;
      if (rebond > 0) {
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.ellipse(sol.px, sol.py, 5, 2.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#000';
        ctx.fill();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.ellipse(sol.px, sol.py - rebond * 40, 6, 3.8, Math.PI / 4 + (ballon.rotation || 0), 0, Math.PI * 2);
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
    // Ballon de mêlée (P2-64) : lâché par le 9, il roule AU SOL sous le pack
    // jusqu'aux pieds du 8 — dessiné au sol, à sa position réelle.
    if (state.ball && (state.ball.state === 'RUCK' || state.ball.state === 'SCRUM')) {
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
    // On part de la position lissée (`sol`) plutôt que de la position brute du
    // porteur : lors d'un changement de porteur (sortie de mêlée sur le 8 puis
    // relais au 9, passe interceptée…) le ballon glisse jusqu'aux nouvelles
    // mains au lieu de s'y téléporter.
    ctx.beginPath();
    ctx.ellipse(sol.px + 12, sol.py - 8, 5, 3.2, Math.PI / 4, 0, Math.PI * 2);
    ctx.fillStyle = '#8d5524';
    ctx.fill();
  }

  // Repère du ballon sous le pack : le ballon lui-même est caché par les corps
  // (dessiné dessous) ; un anneau pointillé clair, tracé par-dessus les
  // joueurs, permet de suivre son trajet du tunnel jusqu'aux pieds du 8.
  function dessinerRepereBallon(state) {
    const ballon = state.ballon;
    if (!ballon) return;
    const pos = state.ballonRendu || ballon;
    const { px, py } = versCanvas(pos.x, pos.y);
    ctx.save();
    // Liseré sombre puis pointillé clair : lisible sur les maillots des deux
    // couleurs comme sur la pelouse.
    ctx.beginPath();
    ctx.ellipse(px, py + 5, 9, 6, 0, 0, Math.PI * 2);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.stroke();
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffe066';
    ctx.stroke();
    ctx.restore();
  }

  // L'arbitre est toujours dessiné, près de l'action (ruck ou porteur) :
  // visible en permanence pour qu'on comprenne qui décide des
  // pénalités/mêlées et où il se trouve.
  // L'étiquette texte « arbitre » n'est écrite qu'à pleine échelle (grand
  // écran) : sur téléphone, elle chevauchait les joueurs du regroupement que
  // l'arbitre suit de près (P2-75). Le disque « A » reste toujours dessiné.
  function etiquetteArbitre() {
    return rayonJoueur() >= 10;
  }

  function dessinerArbitre(state) {
    const { px, py } = versCanvas(state.arbitre.x, state.arbitre.y);
    const ra = Math.min(7, rayonJoueur() * 0.7);
    ctx.beginPath();
    ctx.arc(px, py, ra, 0, Math.PI * 2);
    ctx.fillStyle = '#212121';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#f9a825';
    ctx.stroke();
    ctx.fillStyle = '#f9a825';
    ctx.font = 'bold ' + Math.round(ra * 1.3) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('A', px, py);
    if (!etiquetteArbitre()) return;
    ctx.font = '9px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('arbitre', px, py + 14);
  }

  // Ordre des couches : pendant une mêlée, le ballon est AU SOL SOUS les
  // packs — on le dessine avant les joueurs, qui le recouvrent en partie ;
  // seul son repère (anneau au sol) passe au-dessus.
  // Sinon il est dans les mains (ou en l'air) et passe par-dessus.
  function ordreCouches(state) {
    return state && state.ball && state.ball.state === 'SCRUM'
      ? ['terrain', 'ballon', 'joueurs', 'repere', 'arbitre']
      : ['terrain', 'joueurs', 'arbitre', 'ballon'];
  }

  function dessiner(state) {
    // Pendant que le ballon est en vol ou au sol après un coup de pied
    // (personne ne l'a encore rejoint), on ne met aucun joueur en
    // surbrillance : le dernier porteur (le buteur) ne l'a plus en main.
    const sansPorteur = (state.ballon && state.ballon.enVol) || (state.ball && (state.ball.state === 'LOOSE' || state.ball.state === 'SCRUM'));
    const estPorteur = j => !sansPorteur && j.team === state.porteur.team && j.numero === state.porteur.numero;
    const couches = {
      terrain: dessinerTerrain,
      ballon: () => dessinerBallon(state),
      joueurs: () => {
        // Un joueur exclu (carton jaune) a quitté le terrain : il n'y reste pas
        // planté, immobile, pendant ses dix minutes.
        for (const j of state.teams.A) if (!(j.sinBin > 0)) dessinerJoueur(j, estPorteur(j));
        for (const j of state.teams.B) if (!(j.sinBin > 0)) dessinerJoueur(j, estPorteur(j));
      },
      repere: () => dessinerRepereBallon(state),
      arbitre: () => dessinerArbitre(state),
    };
    for (const c of ordreCouches(state)) couches[c]();
  }

  global.RMRenderer = { init, redimensionner, versCanvas, dessiner, ordreCouches, rayonJoueur, etiquetteArbitre };
})(window);
