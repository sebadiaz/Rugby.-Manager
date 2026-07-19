// Mode Club : modèle de données minimal pour gérer un club fictif à travers
// une saison (effectif, calendrier, classement), au-dessus du même moteur de
// match (engine/rugby-engine.js) que le mode « Match rapide ». Aucune règle de
// jeu ici — uniquement club/effectif/calendrier/classement et leur persistance
// (localStorage), séparés du rendu (cf. docs/js/clubUI.js).
(function (global) {
  'use strict';

  const { DEFAULT_CONFIG } = global.RugbyEngine;
  const CLE_CLUB = 'rugbyManager.club.v1';

  // --- Génération de noms (club fictif, aucune référence à un club/joueur réel) ---
  const PRENOMS = ['Thomas', 'Lucas', 'Hugo', 'Louis', 'Jules', 'Nathan', 'Enzo', 'Léo',
    'Mathis', 'Gabriel', 'Raphaël', 'Arthur', 'Noah', 'Tom', 'Ethan', 'Clément',
    'Antoine', 'Baptiste', 'Maxime', 'Romain', 'Kevin', 'Alexandre', 'Julien', 'Paul'];
  const NOMS = ['Girard', 'Bernard', 'Dubois', 'Moreau', 'Lefèvre', 'Simon', 'Laurent',
    'Michel', 'Garcia', 'Roux', 'Fournier', 'Morel', 'Girard', 'André', 'Mercier',
    'Blanc', 'Guerin', 'Boyer', 'Fontaine', 'Chevalier', 'François', 'Legrand', 'Gauthier', 'Perrin'];
  const NOMS_CLUB = ['Aiglons', 'Béliers', 'Ours', 'Loups', 'Faucons', 'Taureaux',
    'Lions', 'Sangliers', 'Étoiles', 'Dragons', 'Chamois', 'Guerriers'];
  const VILLES = ['Vallouse', 'Roquebrune', 'Montorel', 'Castelnau', 'Bellerive',
    'Fontclair', 'Hautecombe', 'Riverange', 'Solerac', 'Bourgnac', 'Aiglemont', 'Valfleur'];
  const COULEURS = ['#1565c0', '#c62828', '#2e7d32', '#f9a825', '#6a1b9a', '#00838f', '#ef6c00', '#37474f'];

  function choisir(rng, liste) { return liste[Math.floor(rng() * liste.length)]; }

  function genererNomJoueur(rng) {
    return `${choisir(rng, PRENOMS)} ${choisir(rng, NOMS)}`;
  }

  function genererNomClub(rng) {
    return `${choisir(rng, VILLES)} ${choisir(rng, NOMS_CLUB)}`;
  }

  // Génère un joueur d'effectif pour le numéro donné : archétype de poste tiré
  // de DEFAULT_CONFIG.joueurs (même baseline que le moteur), avec une variance
  // liée au NIVEAU DU CLUB (0 = modeste, 1 = très fort) — c'est ce qui rend les
  // clubs adverses inégaux, comme en vrai championnat.
  function genererJoueur(numero, rng, niveauClub) {
    const base = DEFAULT_CONFIG.joueurs[numero];
    const ecartNiveau = (niveauClub - 0.5) * 20; // -10..+10 selon le niveau du club
    const bruit = () => (rng() * 12 - 6); // variance individuelle, comme le moteur
    const borne = (v) => Math.max(30, Math.min(95, Math.round(v)));
    return {
      numero,
      nom: genererNomJoueur(rng),
      poste: base.poste,
      age: 18 + Math.floor(rng() * 17), // 18-34 ans
      vitesse: borne(base.vitesse + ecartNiveau + bruit()),
      plaquage: borne(base.plaquage + ecartNiveau + bruit()),
      tendance: base.tendance,
      couloir: base.couloir,
    };
  }

  function genererEffectif(rng, niveauClub) {
    const effectif = [];
    for (let n = 1; n <= 15; n++) effectif.push(genererJoueur(n, rng, niveauClub));
    return effectif;
  }

  let compteurId = 1;
  function genererClub(rng, { nom, niveauClub = 0.5 } = {}) {
    return {
      id: 'club' + (compteurId++),
      nom: nom || genererNomClub(rng),
      couleur: choisir(rng, COULEURS),
      niveauClub,
      effectif: genererEffectif(rng, niveauClub),
    };
  }

  // Convertit l'effectif d'un club (15 joueurs) en config joueursA/joueursB
  // consommée par MatchEngine (cf. engine/rugby-engine.js, creerJoueur) :
  // {numero: {poste, vitesse, plaquage, tendance, couloir}}.
  function effectifVersJoueursCfg(club) {
    const cfg = {};
    for (const j of club.effectif) {
      cfg[j.numero] = { poste: j.poste, vitesse: j.vitesse, plaquage: j.plaquage, tendance: j.tendance, couloir: j.couloir };
    }
    return cfg;
  }

  // Calendrier aller-retour complet (méthode du cercle, championnat classique) :
  // TOUS les clubs s'affrontent deux fois chacun (une fois à domicile, une
  // fois à l'extérieur), et chaque JOURNÉE fait jouer TOUS les clubs en même
  // temps (n/2 matchs simultanés) — pas seulement le club du joueur. Avec 6
  // clubs (le joueur + 5 adversaires) : 3 matchs/journée, 10 journées. Exige
  // un nombre pair de clubs (sinon un club serait au repos chaque journée).
  function genererCalendrier(clubs) {
    const n = clubs.length;
    const ids = clubs.map((c) => c.id);
    const fixe = ids[0];
    const tournant = ids.slice(1);
    const rondesAller = [];
    for (let r = 0; r < n - 1; r++) {
      const ordre = [fixe, ...tournant];
      const ronde = [];
      for (let i = 0; i < n / 2; i++) {
        const a = ordre[i], b = ordre[n - 1 - i];
        // Alterne qui reçoit d'une ronde à l'autre pour équilibrer domicile/extérieur.
        ronde.push(r % 2 === 0 ? [a, b] : [b, a]);
      }
      rondesAller.push(ronde);
      tournant.push(tournant.shift());
    }
    const fixtures = [];
    let id = 0;
    rondesAller.forEach((ronde, r) => {
      for (const [domicileId, exterieurId] of ronde) {
        fixtures.push({ id: 'f' + id++, journee: r + 1, domicileId, exterieurId, joue: false, score: null });
      }
    });
    const decalage = rondesAller.length;
    rondesAller.forEach((ronde, r) => {
      for (const [domicileId, exterieurId] of ronde) {
        // Match retour : domicile/extérieur inversés par rapport à l'aller.
        fixtures.push({ id: 'f' + id++, journee: decalage + r + 1, domicileId: exterieurId, exterieurId: domicileId, joue: false, score: null });
      }
    });
    return fixtures;
  }

  function classementInitial(clubs) {
    const table = {};
    for (const c of clubs) table[c.id] = { clubId: c.id, j: 0, g: 0, n: 0, p: 0, pts: 0, essaisPour: 0, essaisContre: 0, pointsPour: 0, pointsContre: 0 };
    return table;
  }

  // Points de classement classiques (rugby à XV) : victoire 4, nul 2, défaite 0.
  // Pas de points de bonus pour cette première version — cf. README/roadmap.
  function enregistrerResultat(saison, fixtureId, scoreDomicile, scoreExterieur, essaisDomicile, essaisExterieur) {
    const f = saison.calendrier.find((x) => x.id === fixtureId);
    if (!f || f.joue) return;
    f.joue = true;
    f.score = { domicile: scoreDomicile, exterieur: scoreExterieur };
    const td = saison.classement[f.domicileId];
    const te = saison.classement[f.exterieurId];
    td.j++; te.j++;
    td.pointsPour += scoreDomicile; td.pointsContre += scoreExterieur;
    te.pointsPour += scoreExterieur; te.pointsContre += scoreDomicile;
    td.essaisPour += essaisDomicile || 0; td.essaisContre += essaisExterieur || 0;
    te.essaisPour += essaisExterieur || 0; te.essaisContre += essaisDomicile || 0;
    if (scoreDomicile > scoreExterieur) { td.g++; td.pts += 4; te.p++; }
    else if (scoreDomicile < scoreExterieur) { te.g++; te.pts += 4; td.p++; }
    else { td.n++; te.n++; td.pts += 2; te.pts += 2; }
  }

  function classementTrie(saison) {
    return Object.values(saison.classement).sort((a, b) =>
      b.pts - a.pts || (b.pointsPour - b.pointsContre) - (a.pointsPour - a.pointsContre) || b.pointsPour - a.pointsPour);
  }

  // Renvoie TOUS les matchs de la prochaine journée non jouée (pas un seul) —
  // avec un calendrier complet, une journée fait jouer tous les clubs à la
  // fois (cf. genererCalendrier). Tableau vide si la saison est terminée.
  function prochainesFixtures(saison) {
    const prochaine = saison.calendrier.find((f) => !f.joue);
    if (!prochaine) return [];
    return saison.calendrier.filter((f) => f.journee === prochaine.journee);
  }

  function club(saison, clubId) {
    if (saison.clubJoueur.id === clubId) return saison.clubJoueur;
    return saison.adversaires.find((c) => c.id === clubId) || null;
  }

  // Crée une nouvelle saison complète : le club du joueur + 5 adversaires de
  // niveaux variés, calendrier aller-retour, classement à zéro.
  function nouvelleSaison(rng, nomClubJoueur) {
    const clubJoueur = genererClub(rng, { nom: nomClubJoueur, niveauClub: 0.5 });
    const adversaires = [];
    const niveaux = [0.25, 0.4, 0.5, 0.6, 0.75]; // du plus faible au plus fort
    for (const niveauClub of niveaux) adversaires.push(genererClub(rng, { niveauClub }));
    const tousLesClubs = [clubJoueur, ...adversaires];
    return {
      clubJoueur,
      adversaires,
      calendrier: genererCalendrier(tousLesClubs),
      classement: classementInitial(tousLesClubs),
    };
  }

  function sauvegarderSaison(saison) {
    try { localStorage.setItem(CLE_CLUB, JSON.stringify(saison)); } catch (e) { /* stockage indisponible (file://, quota) : la saison reste en mémoire pour cette session */ }
  }
  function chargerSaison() {
    try {
      const brut = localStorage.getItem(CLE_CLUB);
      return brut ? JSON.parse(brut) : null;
    } catch (e) { return null; }
  }
  function effacerSaison() {
    try { localStorage.removeItem(CLE_CLUB); } catch (e) { /* ignore */ }
  }

  global.RMClub = {
    genererNomClub, genererClub, genererEffectif, effectifVersJoueursCfg,
    nouvelleSaison, genererCalendrier, classementInitial, enregistrerResultat,
    classementTrie, prochainesFixtures, club,
    sauvegarderSaison, chargerSaison, effacerSaison,
  };
})(window);
