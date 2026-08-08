// Composition et tactique (Mode Club) — domaine extrait de club.js
// (TODO_AUDIT.md P2-10, tranche 11) : conversion tactique → config moteur,
// conversion effectif/composition → config joueurs pour MatchEngine, choix
// automatique de composition (titulaires + banc), validation, désignation
// automatique du capitaine/buteur/lanceur en touche.
//
// Domaine le plus autonome à ce jour : aucun état de module (pas de
// compteur, pas de fermeture partagée) — toutes les dépendances externes
// (AXES_TACTIQUE, POSTE_REQUIS, POSTE_REQUIS_BANC déplacé ici) sont soit
// déjà exportées de club.js, soit purement locales à ce fichier.
(function (global) {
  'use strict';

  // Config moteur (attaque/défense/mêlée/touche PAR ÉQUIPE) résultant de la
  // COMBINAISON des 6 axes — `tactique` peut être partiel ou absent, chaque
  // axe retombe sur son défaut (comportement du moteur inchangé si rien
  // n'est choisi, et compatible avec une ancienne sauvegarde à 3 axes).
  function tactiqueVersConfig(tactique) {
    const AXES_TACTIQUE = global.RMClub.AXES_TACTIQUE;
    const defauts = {};
    for (const axe of Object.keys(AXES_TACTIQUE)) defauts[axe] = AXES_TACTIQUE[axe].defaut;
    const t = Object.assign(defauts, (tactique && typeof tactique === 'object') ? tactique : {});
    function option(axe) {
      return AXES_TACTIQUE[axe].options[t[axe]] || AXES_TACTIQUE[axe].options[AXES_TACTIQUE[axe].defaut];
    }
    const optStyle = option('style'), optAvants = option('avants'), optRythme = option('rythme'),
      optPied = option('pied'), optLigne = option('ligneDef'), optToucheMaul = option('toucheMaul');
    const attaque = Object.assign({}, optStyle.attaque || null, optPied.attaque || null);
    const cfg = {};
    if (Object.keys(attaque).length) cfg.attaque = attaque;
    if (optLigne.defense) cfg.defense = optLigne.defense;
    if (optAvants.melee) cfg.melee = optAvants.melee;
    if (optRythme.ruck) cfg.ruck = optRythme.ruck;
    if (optToucheMaul.touche) cfg.touche = optToucheMaul.touche;
    return cfg;
  }

  // Convertit l'effectif d'un club ADVERSAIRE (15, un par numéro) en config
  // joueursA/joueursB consommée par MatchEngine (cf. engine/rugby-engine.js) :
  // {numero: {poste, vitesse, plaquage, tendance, couloir}}.
  function effectifVersJoueursCfg(club) {
    const cfg = {};
    for (const j of club.effectif) {
      // MÊME formule que compositionVersJoueursCfg (TODO_AUDIT.md P1-29) :
      // depuis que les clubs adverses ont un vrai groupe dont la fatigue et
      // le moral sont réellement suivis, ces valeurs doivent peser sur leurs
      // stats effectives comme elles pèsent sur celles du joueur. Sinon la
      // fatigue adverse serait purement décorative — et le joueur resterait
      // le seul des deux à être pénalisé par la sienne.
      const malusFatigue = Math.round(((j.fatigue || 0) / 100) * 12);
      const ajustMoral = Math.round((((j.moral != null ? j.moral : 65) - 60) / 100) * 8);
      const ajustement = ajustMoral - malusFatigue;
      cfg[j.numero] = {
        poste: j.poste,
        vitesse: Math.max(20, j.vitesse + ajustement),
        plaquage: Math.max(20, j.plaquage + ajustement),
        tendance: j.tendance, couloir: j.couloir,
        adresse: j.adresse, melee: j.melee, touche: j.touche, puissance: j.puissance,
        endurance: j.endurance, passe: j.passe, jeuPied: j.jeuPied, decision: j.decision, discipline: j.discipline,
      };
    }
    return cfg;
  }

  // Même conversion, mais pour le club du JOUEUR : `composition` associe
  // chaque numéro (1-15) à l'id du joueur de l'effectif étendu qui le porte
  // ce jour-là (cf. meilleureComposition / choix manuel dans l'UI). La fatigue
  // accumulée (cf. appliquerFatigue) réduit réellement la vitesse/le plaquage
  // effectifs transmis au moteur — pas un simple badge cosmétique.
  function compositionVersJoueursCfg(effectif, composition) {
    const POSTE_REQUIS = global.RMClub.POSTE_REQUIS;
    // Placement de départ du MAILLOT, pas du joueur (cf. plus bas) :
    // DEFAULT_CONFIG.joueurs est indexé par NUMÉRO côté moteur.
    const PROFIL_MAILLOT = global.RugbyEngine.DEFAULT_CONFIG.joueurs;
    const parId = {};
    for (const j of effectif) parId[j.id] = j;
    const cfg = {};
    for (const numero of Object.keys(POSTE_REQUIS)) {
      const j = parId[composition[numero]];
      if (!j) continue;
      const maillot = PROFIL_MAILLOT[numero];
      const malusFatigue = Math.round(((j.fatigue || 0) / 100) * 12);
      // Moral (0-100, neutre 60-70 à la génération) : un joueur au moral haut
      // joue légèrement au-dessus de son niveau, un joueur démoralisé en
      // dessous — petit effet borné, jamais décoratif (cf. appliquerMoral).
      const ajustMoral = Math.round((((j.moral != null ? j.moral : 65) - 60) / 100) * 8);
      const ajustement = ajustMoral - malusFatigue;
      // Reprise après blessure (TODO_AUDIT.md P1-40) : un joueur qui sort de
      // l'infirmerie n'est PAS celui d'avant. Son coefficient de reprise
      // (0,72 au premier palier, 0,96 au dernier) multiplie réellement ce que
      // le moteur reçoit — c'est ce qui rend le retour progressif mesurable
      // en match, et pas seulement affiché dans l'onglet Médical.
      const coefReprise = global.RMClub.coefficientReprise ? global.RMClub.coefficientReprise(j) : 1;
      const enReprise = coefReprise > 0 && coefReprise < 1;
      const app = (valeur) => {
        const base = Math.max(20, valeur + ajustement);
        return enReprise ? Math.max(20, Math.round(base * coefReprise)) : base;
      };
      cfg[numero] = {
        poste: POSTE_REQUIS[numero],
        vitesse: app(j.vitesse),
        plaquage: app(j.plaquage),
        // `couloir` (couloir latéral au repos, 0-70 m) et `tendance`
        // (proximité au ballon) décrivent le POSTE OCCUPÉ CE JOUR-LÀ, pas
        // l'individu : c'est le maillot qui dit où se place un joueur, comme
        // sur une vraie feuille de match. L'effectif du joueur étant généré
        // par CATÉGORIE de poste (cf. GABARIT_EFFECTIF), tous les joueurs
        // d'une même catégorie héritaient du couloir du PREMIER numéro de
        // cette catégorie (ARCHETYPE_PAR_POSTE) : les deux ailiers se
        // plaçaient tous les deux sur l'aile du n°11, les deux piliers, les
        // deux deuxièmes lignes, les trois troisièmes lignes et les deux
        // centres se superposaient aussi. Le XV du joueur n'occupait que 7
        // couloirs distincts au lieu de 12, laissant une aile entière libre —
        // il encaissait ~43 points de plus qu'un XV IA de niveau identique
        // (mesuré par server/simulate-ecarts.js). Les ATTRIBUTS, eux, restent
        // ceux du joueur : il apporte ses qualités, le maillot son placement.
        tendance: maillot.tendance, couloir: maillot.couloir, adresse: j.adresse,
        melee: j.melee, touche: j.touche, puissance: j.puissance,
        endurance: j.endurance, passe: j.passe, jeuPied: j.jeuPied,
        decision: j.decision, discipline: j.discipline,
      };
    }
    return cfg;
  }

  // Meilleur candidat dispo pour un NUMÉRO donné (donc un poste requis) :
  // priorité aux joueurs de ce poste naturel, mais un joueur d'un autre poste
  // peut dépanner si le poste naturel n'a plus personne de disponible (cf.
  // rafraichirTerrain/rafraichirBanc côté UI, qui offre le même choix
  // manuellement — un vrai effectif de rugby fait tourner ses polyvalents
  // plutôt que de jouer à 14). Un joueur prêté (cf. preterJoueur) reste une
  // exclusion DURE : il n'est tout simplement pas dans l'effectif du jour.
  // --- Évaluation PAR POSTE (TODO_AUDIT.md P0-composition) ------------------
  //
  // Avant, le tri était :
  //     pool.sort((a, b) => (b.vitesse + b.plaquage) - (a.vitesse + a.plaquage));
  // Deux attributs, les mêmes pour les quinze postes. Mêlée, touche,
  // puissance, endurance, passe, jeu au pied, décision et discipline ne
  // pesaient RIEN — alors qu'ils existent sur chaque joueur et que le moteur,
  // lui, les utilise. Un pilier 90 vitesse / 90 plaquage / 25 mêlée passait
  // devant un pilier 60 / 65 / 85 : le travail de recrutement du manager ne
  // se traduisait pas dans l'équipe alignée.
  //
  // Chaque poste a maintenant sa propre grille de lecture. Les poids somment
  // à 1, donc une note reste sur la même échelle 0-100 que les attributs et
  // se compare d'un poste à l'autre.
  const POIDS_PAR_POSTE = {
    // Première ligne : la mêlée d'abord, puis le gabarit.
    P: { melee: 0.40, puissance: 0.25, plaquage: 0.15, endurance: 0.10, discipline: 0.05, vitesse: 0.05 },
    // Talonneur : il lance en touche — c'est ce qui le distingue d'un pilier.
    T: { touche: 0.30, melee: 0.25, puissance: 0.15, plaquage: 0.12, adresse: 0.08, endurance: 0.05, discipline: 0.05 },
    // Deuxième ligne : sauteur en touche et puissance de poussée.
    '2L': { touche: 0.28, puissance: 0.27, plaquage: 0.18, endurance: 0.12, melee: 0.10, vitesse: 0.05 },
    // Troisième ligne : le volume de plaquage et l'endurance, avec de la
    // vitesse pour arriver sur les rucks.
    '3L': { plaquage: 0.28, puissance: 0.22, endurance: 0.18, vitesse: 0.15, melee: 0.10, decision: 0.07 },
    // Demi de mêlée : la qualité de passe commande tout le jeu.
    DM: { passe: 0.35, decision: 0.20, vitesse: 0.15, jeuPied: 0.12, adresse: 0.10, plaquage: 0.08 },
    // Ouvreur : le pied et la lecture du jeu, pas le plaquage.
    OV: { jeuPied: 0.28, decision: 0.25, passe: 0.20, adresse: 0.12, vitesse: 0.10, plaquage: 0.05 },
    // Centre : percuter et défendre au centre du terrain.
    CE: { plaquage: 0.25, puissance: 0.22, vitesse: 0.20, passe: 0.13, decision: 0.12, adresse: 0.08 },
    // Ailier : la vitesse, très largement, et les mains.
    AI: { vitesse: 0.40, adresse: 0.20, plaquage: 0.15, puissance: 0.12, decision: 0.08, jeuPied: 0.05 },
    // Arrière : dernier rempart et jeu au pied de dégagement.
    AR: { jeuPied: 0.28, vitesse: 0.22, adresse: 0.20, decision: 0.15, plaquage: 0.15 },
  };

  // Avants / trois-quarts : dépanner un ailier au centre coûte moins cher que
  // le faire jouer pilier. La pénalité hors poste n'est donc pas uniforme.
  const AVANTS = new Set(['P', 'T', '2L', '3L']);
  const PENALITE_MEME_FAMILLE = 0.92;
  const PENALITE_AUTRE_FAMILLE = 0.80;

  // Note d'un joueur POUR UN POSTE donné, sur 100. Exportée : c'est elle qui
  // doit être testable, pas seulement le résultat du tri.
  function noteAuPoste(joueur, poste) {
    const poids = POIDS_PAR_POSTE[poste];
    if (!joueur) return 0;
    if (!poids) return ((joueur.vitesse || 0) + (joueur.plaquage || 0)) / 2;
    let note = 0;
    for (const attr of Object.keys(poids)) {
      // Un attribut absent (vieille sauvegarde, joueur adverse simplifié) vaut
      // 60, la valeur neutre de génération — jamais 0, qui écraserait la note.
      const v = joueur[attr] != null ? joueur[attr] : 60;
      note += v * poids[attr];
    }
    if (joueur.poste && joueur.poste !== poste) {
      const memeFamille = AVANTS.has(joueur.poste) === AVANTS.has(poste);
      note *= memeFamille ? PENALITE_MEME_FAMILLE : PENALITE_AUTRE_FAMILLE;
    }
    return Math.round(note * 10) / 10;
  }

  function meilleurCandidatPourNumero(effectif, poste, utilises) {
    let candidats = effectif.filter((j) => j.poste === poste && !j.pret && !utilises.has(j.id));
    if (candidats.length === 0) candidats = effectif.filter((j) => !j.pret && !utilises.has(j.id));
    if (candidats.length === 0) return null;
    const disponibles = candidats.filter((j) => !j.blessureJournees);
    const pool = disponibles.length > 0 ? disponibles : candidats;
    pool.sort((a, b) => noteAuPoste(b, poste) - noteAuPoste(a, poste));
    return pool[0];
  }

  // Compose automatiquement la meilleure équipe disponible : pour chaque
  // numéro, le meilleur candidat dispo (cf. meilleurCandidatPourNumero),
  // NON BLESSÉ de préférence, qui n'est pas déjà titularisé ailleurs.
  function meilleureComposition(effectif) {
    const POSTE_REQUIS = global.RMClub.POSTE_REQUIS;
    const utilises = new Set();
    const composition = {};
    for (const numero of Object.keys(POSTE_REQUIS)) {
      const meilleur = meilleurCandidatPourNumero(effectif, POSTE_REQUIS[numero], utilises);
      if (!meilleur) continue;
      composition[numero] = meilleur.id;
      utilises.add(meilleur.id);
    }
    return composition;
  }

  // Complète une composition PARTIELLE (choix déjà faits par le joueur, ou
  // chargée depuis une saison sauvegardée) sans écraser les choix valides :
  // ne remplace que les numéros vides ou invalides (joueur libéré, doublon)
  // par le meilleur joueur disponible restant. N'importe quel joueur peut
  // occuper n'importe quel poste (polyvalence assumée, cf.
  // meilleurCandidatPourNumero) — un choix manuel hors poste naturel doit
  // donc survivre au rafraîchissement, pas être écrasé au tour suivant.
  // Utilisé à l'ouverture de l'écran de composition — la version "table
  // rase" reste meilleureComposition (bouton "meilleure équipe possible").
  function completerComposition(effectif, compositionPartielle) {
    const POSTE_REQUIS = global.RMClub.POSTE_REQUIS;
    const parId = {};
    for (const j of effectif) parId[j.id] = j;
    const composition = {};
    const utilises = new Set();
    for (const numero of Object.keys(POSTE_REQUIS)) {
      const id = compositionPartielle && compositionPartielle[numero];
      const j = id && parId[id];
      if (j && !j.pret && !utilises.has(id)) {
        composition[numero] = id;
        utilises.add(id);
      }
    }
    for (const numero of Object.keys(POSTE_REQUIS)) {
      if (composition[numero]) continue;
      const meilleur = meilleurCandidatPourNumero(effectif, POSTE_REQUIS[numero], utilises);
      if (!meilleur) continue;
      composition[numero] = meilleur.id;
      utilises.add(meilleur.id);
    }
    return composition;
  }

  // Vérifie qu'un numéro a bien un joueur assigné à CHAQUE poste avant de
  // lancer un match — completerComposition peut laisser un numéro vide si
  // aucun joueur de ce poste n'est disponible (tous prêtés/partis), ce qui
  // enverrait une config incomplète au moteur. Retourne les postes manquants
  // (liste vide = composition valide).
  function validerComposition(composition) {
    const POSTE_REQUIS = global.RMClub.POSTE_REQUIS;
    const manquants = [];
    for (const numero of Object.keys(POSTE_REQUIS)) {
      if (!composition || !composition[numero]) manquants.push({ numero: Number(numero), poste: POSTE_REQUIS[numero] });
    }
    return manquants;
  }

  // Banc de 8 remplaçants (numéros 16-23), choisis parmi les joueurs NON
  // titularisés. Un par catégorie de poste NON DÉJÀ ÉPUISÉE par les titulaires
  // (GABARIT_EFFECTIF ne prévoit qu'UN seul joueur de profondeur par poste,
  // sauf l'aile qui reste en réserve non convoquée ce jour-là — comme un vrai
  // groupe de 23 sur un effectif de 24-25). Même logique "complète sans
  // écraser" que completerComposition.
  const POSTE_REQUIS_BANC = { 16: 'P', 17: 'T', 18: '2L', 19: '3L', 20: 'DM', 21: 'OV', 22: 'CE', 23: 'AR' };

  function completerCompositionBanc(effectif, compositionTitulaires, bancPartiel) {
    const parId = {};
    for (const j of effectif) parId[j.id] = j;
    const utilisesTitulaires = new Set(Object.values(compositionTitulaires || {}));
    const banc = {};
    const utilisesBanc = new Set();
    for (const numero of Object.keys(POSTE_REQUIS_BANC)) {
      const id = bancPartiel && bancPartiel[numero];
      const j = id && parId[id];
      if (j && !j.pret && !utilisesTitulaires.has(id) && !utilisesBanc.has(id)) {
        banc[numero] = id;
        utilisesBanc.add(id);
      }
    }
    for (const numero of Object.keys(POSTE_REQUIS_BANC)) {
      if (banc[numero]) continue;
      const exclus = new Set([...utilisesTitulaires, ...utilisesBanc]);
      const meilleur = meilleurCandidatPourNumero(effectif, POSTE_REQUIS_BANC[numero], exclus);
      if (!meilleur) continue;
      banc[numero] = meilleur.id;
      utilisesBanc.add(meilleur.id);
    }
    return banc;
  }

  // Retrouve le numéro de maillot (titulaire) porté par un joueur donné dans
  // une composition — sert à convertir capitaineId/buteurId/lanceurToucheId
  // (id joueur) en numéro pour la config moteur (buteurA/toucheLanceurA).
  function numeroDuJoueurDansComposition(composition, joueurId) {
    if (!joueurId || !composition) return null;
    for (const numero of Object.keys(composition)) {
      if (composition[numero] === joueurId) return numero;
    }
    return null;
  }

  // Désigne automatiquement capitaine (meilleur niveau global), buteur
  // (meilleure adresse au pied) et lanceur en touche (le talonneur titulaire,
  // n°2, comme en match réel) parmi les 15 titulaires — utilisé tant que le
  // joueur n'a rien choisi lui-même, et comme filet de sécurité si son choix
  // précédent n'est plus titulaire (blessure, transfert...).
  function autoDesignerEncadrement(effectif, compositionTitulaires) {
    const parId = {};
    for (const j of effectif) parId[j.id] = j;
    const titulaires = Object.values(compositionTitulaires || {}).map((id) => parId[id]).filter(Boolean);
    if (titulaires.length === 0) return { capitaineId: null, buteurId: null, lanceurToucheId: null };
    const capitaine = titulaires.slice().sort((a, b) => (b.vitesse + b.plaquage) - (a.vitesse + a.plaquage))[0];
    const buteur = titulaires.slice().sort((a, b) => (b.adresse || 0) - (a.adresse || 0))[0];
    const lanceur = parId[compositionTitulaires['2']] || titulaires.find((j) => j.poste === 'T') || titulaires[0];
    return { capitaineId: capitaine.id, buteurId: buteur.id, lanceurToucheId: lanceur.id };
  }

  // Remplacements planifiés (TODO_AUDIT.md P1-17) : traduit le banc de 8
  // (déjà choisi par le joueur, cf. completerCompositionBanc) en un vrai plan
  // de remplacements transmis au moteur (cf. engine/rugby-engine.js,
  // config.remplacements) — jusqu'ici purement cosmétique, jamais utilisé en
  // match. Une minute fixe par catégorie de poste (avants d'abord, comme un
  // vrai groupe de 23) ; pour les catégories qui couvrent PLUSIEURS numéros
  // titulaires (P : 1/3, 2L : 4/5, 3L : 6/7/8, CE : 12/13), toujours le plus
  // petit numéro du groupe — convention simple et déterministe, pas une
  // décision tactique fine du joueur dans cette première tranche (cf.
  // ROADMAP_FOOTBALL_MANAGER.md). L'aile (postes 11/14) n'a volontairement
  // aucune couverture de banc (même limite déjà connue de l'effectif étendu).
  const CIBLE_REMPLACEMENT_BANC = { 16: 1, 17: 2, 18: 4, 19: 6, 20: 9, 21: 10, 22: 12, 23: 15 };
  const MINUTE_REMPLACEMENT_BANC = { 16: 50, 17: 54, 18: 58, 19: 62, 20: 65, 21: 68, 22: 71, 23: 75 };

  function remplacementsVersConfig(effectif, compositionBanc, lettreEquipe) {
    const parId = {};
    for (const j of effectif) parId[j.id] = j;
    const remplacements = [];
    for (const bancNumero of Object.keys(CIBLE_REMPLACEMENT_BANC)) {
      const j = compositionBanc && parId[compositionBanc[bancNumero]];
      if (!j) continue;
      // Même formule que compositionVersJoueursCfg : un remplaçant fatigué ou
      // démoralisé apporte réellement moins que sur le papier, pas un simple
      // clone de sa fiche.
      const malusFatigue = Math.round(((j.fatigue || 0) / 100) * 12);
      const ajustMoral = Math.round((((j.moral != null ? j.moral : 65) - 60) / 100) * 8);
      const ajustement = ajustMoral - malusFatigue;
      const numeroCible = CIBLE_REMPLACEMENT_BANC[bancNumero];
      // Même règle que compositionVersJoueursCfg : le remplaçant prend la
      // PLACE du maillot qu'il relève, pas celle de sa catégorie de poste.
      // Sans ça, chaque entrée en jeu (à partir de la 50ᵉ minute) déformait
      // à nouveau la ligne — le moteur recharge la config à chaque reprise
      // de jeu (cf. _nouvelleManche dans engine/rugby-engine.js).
      const maillot = global.RugbyEngine.DEFAULT_CONFIG.joueurs[numeroCible];
      remplacements.push({
        equipe: lettreEquipe,
        numero: numeroCible,
        minute: MINUTE_REMPLACEMENT_BANC[bancNumero],
        // numeroBanc/joueurId : ignorés par le moteur (qui ne lit que
        // equipe/numero/minute/joueur), utiles côté clubUI.js pour créditer
        // le bon joueur (fatigue, moral, temps de jeu) une fois le match
        // résolu — cf. remarque plus bas, "compositionAvecRemplacants".
        numeroBanc: Number(bancNumero),
        joueurId: j.id,
        joueur: {
          nom: j.nom, poste: j.poste,
          vitesse: Math.max(20, j.vitesse + ajustement),
          plaquage: Math.max(20, j.plaquage + ajustement),
          tendance: maillot.tendance, couloir: maillot.couloir, adresse: j.adresse,
          melee: j.melee, touche: j.touche, puissance: j.puissance,
          endurance: j.endurance, passe: j.passe, jeuPied: j.jeuPied,
          decision: j.decision, discipline: j.discipline,
        },
      });
    }
    return remplacements;
  }

  // --- Équipe gérée (TODO_AUDIT.md P1-18) : premier XV, Équipe B ou Espoirs
  // (centre de formation) sont désormais gérés par les MÊMES écrans
  // Composition/Tactique — seule change l'équipe actuellement sélectionnée
  // (cf. saison.clubJoueur.equipeGeree). Le premier XV réutilise directement
  // saison.clubJoueur (comportement historique inchangé, zéro risque de
  // régression) ; les 2 autres équipes un "slot" dédié à la MÊME FORME
  // ({compositionTitulaires, compositionBanc, tactique, capitaineId,
  // buteurId, lanceurToucheId}) pour que toute la logique de rendu/édition
  // déjà écrite pour le premier XV fonctionne SANS aucune modification,
  // quelle que soit l'équipe sélectionnée. ---
  function assurerCompositionsSecondaires(saison) {
    const c = saison.clubJoueur;
    if (!c.compositionsSecondaires) {
      const slotVide = () => ({ compositionTitulaires: {}, compositionBanc: {}, tactique: {}, capitaineId: null, buteurId: null, lanceurToucheId: null });
      c.compositionsSecondaires = { b: slotVide(), jeunes: slotVide() };
    }
    if (!c.equipeGeree) c.equipeGeree = 'pro';
    return c.compositionsSecondaires;
  }

  // Pool de joueurs de l'équipe `equipe` ('pro'|'b'|'jeunes') — l'Équipe B
  // n'a pas d'effectif propre : elle pioche parmi les réservistes du jour et
  // le centre de formation (cf. effectifDisponiblePourEquipeB, déjà exporté
  // depuis club-equipe-b.js).
  function effectifPourEquipe(saison, equipe) {
    const c = saison.clubJoueur;
    if (equipe === 'jeunes') return c.jeunes || [];
    if (equipe === 'b') return global.RMClub.effectifDisponiblePourEquipeB(saison);
    return c.effectif;
  }

  // Slot de composition de l'équipe `equipe` — même forme que saison.clubJoueur
  // pour le premier XV (voir commentaire plus haut).
  function slotCompositionPourEquipe(saison, equipe) {
    if (equipe === 'pro') return saison.clubJoueur;
    return assurerCompositionsSecondaires(saison)[equipe];
  }

  // Version générale de la logique historique d'auto-complétion (jusqu'ici
  // dupliquée dans clubUI.js UNIQUEMENT pour le premier XV, cf.
  // assurerComposition) : complète titulaires/banc/encadrement pour
  // N'IMPORTE QUELLE équipe, sans jamais écraser un choix déjà fait par le
  // joueur — même garantie que completerComposition/completerCompositionBanc.
  function assurerCompositionPourEquipe(saison, equipe) {
    const effectif = effectifPourEquipe(saison, equipe);
    const slot = slotCompositionPourEquipe(saison, equipe);
    slot.compositionTitulaires = completerComposition(effectif, slot.compositionTitulaires);
    slot.compositionBanc = completerCompositionBanc(effectif, slot.compositionTitulaires, slot.compositionBanc);
    const titulaireIds = new Set(Object.values(slot.compositionTitulaires));
    const auto = autoDesignerEncadrement(effectif, slot.compositionTitulaires);
    if (!slot.capitaineId || !titulaireIds.has(slot.capitaineId)) slot.capitaineId = auto.capitaineId;
    if (!slot.buteurId || !titulaireIds.has(slot.buteurId)) slot.buteurId = auto.buteurId;
    if (!slot.lanceurToucheId || !titulaireIds.has(slot.lanceurToucheId)) slot.lanceurToucheId = auto.lanceurToucheId;
    return slot;
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    tactiqueVersConfig, effectifVersJoueursCfg, compositionVersJoueursCfg,
    meilleurCandidatPourNumero, noteAuPoste, POIDS_PAR_POSTE, meilleureComposition, completerComposition,
    validerComposition, POSTE_REQUIS_BANC, completerCompositionBanc,
    numeroDuJoueurDansComposition, autoDesignerEncadrement,
    CIBLE_REMPLACEMENT_BANC, MINUTE_REMPLACEMENT_BANC, remplacementsVersConfig,
    assurerCompositionsSecondaires, effectifPourEquipe, slotCompositionPourEquipe, assurerCompositionPourEquipe,
  });
})(window);
