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

  // Calendrier aller-retour : le club du joueur affronte chaque adversaire une
  // fois à domicile, une fois à l'extérieur — une petite saison complète et
  // lisible (avec 5 adversaires : 10 journées), pas un championnat interminable.
  function genererCalendrier(rng, clubJoueur, adversaires) {
    const fixtures = [];
    let journee = 1;
    for (const adv of adversaires) {
      fixtures.push({ id: 'f' + fixtures.length, journee: journee++, domicileId: clubJoueur.id, exterieurId: adv.id, joue: false, score: null });
    }
    for (const adv of adversaires) {
      fixtures.push({ id: 'f' + fixtures.length, journee: journee++, domicileId: adv.id, exterieurId: clubJoueur.id, joue: false, score: null });
    }
    // Mélange les journées (hors 1re) pour ne pas jouer tous les matchs à
    // domicile puis tous à l'extérieur d'affilée, comme un vrai calendrier.
    const tete = fixtures.slice(0, 1);
    const reste = fixtures.slice(1);
    for (let i = reste.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [reste[i], reste[j]] = [reste[j], reste[i]];
    }
    const toutes = tete.concat(reste);
    toutes.forEach((f, i) => { f.journee = i + 1; });
    return toutes;
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

  function prochaineJourneeNonJouee(saison) {
    return saison.calendrier.find((f) => !f.joue) || null;
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
      calendrier: genererCalendrier(rng, clubJoueur, adversaires),
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
    classementTrie, prochaineJourneeNonJouee, club,
    sauvegarderSaison, chargerSaison, effacerSaison,
  };
})(window);
