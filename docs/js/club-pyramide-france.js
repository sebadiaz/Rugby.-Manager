// Autres divisions de la pyramide française (Mode Club) — domaine dédié,
// dépendant uniquement de docs/js/club.js et docs/js/club-pyramide.js
// (jamais de world.js, qui lui dépend de club.js — même principe
// d'autonomie déjà documenté dans club-pyramide.js).
//
// Audit ("les autres championnats ne sont jamais simulés") : la pyramide
// française (Ligue Régionale/Nationale/Excellence, cf. club-pyramide.js)
// n'existait RÉELLEMENT que pour le palier occupé par le club du joueur —
// les deux autres paliers n'avaient ni clubs, ni calendrier, ni classement :
// une simple étiquette de nom, régénérée à zéro à chaque montée/descente
// comme si l'ancien palier n'avait jamais existé. Ce fichier leur donne un
// contenu réel (clubs + calendrier + classement), simulé une fois par
// journée jouée par le joueur — pas seulement si un onglet est ouvert (cf.
// TODO_AUDIT.md, limite déjà documentée pour l'écosystème mondial : ne pas
// reproduire ce même défaut ici).
(function (global) {
  'use strict';

  // --- LE barème des matchs résolus en abstrait (G19) ---------------------
  //
  // Résultat statistique, pas le moteur physique : une trentaine de clubs sur
  // deux divisions ne peuvent pas tourner sur le moteur complet à chaque
  // journée du joueur, sans quoi une seule journée prendrait des minutes.
  // Mais c'est ce barème qui écrit la QUASI-TOTALITÉ des classements que le
  // jeu affiche : les 156 rencontres IA-IA du championnat du joueur, les deux
  // autres divisions françaises, les tours de coupe qu'il ne dispute pas, et
  // les douze pays du monde.
  //
  // Il vivait en DEUX exemplaires — ici et dans world.js — pour éviter une
  // dépendance. Deux copies, donc deux barèmes à corriger le jour où l'un
  // change : exactement le défaut que ce projet corrige partout ailleurs.
  // C'est désormais la seule implémentation ; `RMWorld.simulerResultatAbstrait`
  // y délègue et ne garde sa propre copie que comme repli, pour les harnais
  // qui chargent world.js sans ce module.
  //
  // La calibration n'est pas devinée : elle est ANCRÉE SUR LE MOTEUR du jeu.
  // Mesuré sur 500 matchs joués par le vrai moteur (`test-stats-matchs`) :
  // 43,3 points au total par match, 5,4 essais — soit 8,0 points par essai,
  // conversions et pénalités comprises.
  //
  // Le barème abstrait doit produire les mêmes ordres de grandeur, sans quoi
  // le club du joueur (dont les matchs passent par le moteur) écrase toutes
  // les colonnes « points pour / contre » du classement face à des rivaux
  // résolus en abstrait. Mesuré avant : le joueur marquait 43 points par
  // match pendant que les rencontres IA de son championnat en produisaient
  // 23 à deux — un facteur deux sur la même page.
  //
  //                    avant (18/14/6,5)      après (35/6/8)
  //   Régionale bas    22,8 pts · 3,5 essais  37,0 pts · 4,7 essais
  //   Régionale haut   29,8 pts · 4,6         40,0 pts · 5,2
  //   Nationale        31,9 pts · 4,9         40,9 pts · 5,3
  //   Excellence       38,9 pts · 6,0         43,9 pts · 5,7
  //   (moteur, pour comparaison)              43,3 pts · 5,4
  //
  // La correction porte surtout sur la PENTE : `base` dépendait linéairement
  // du niveau des clubs (× 14), si bien qu'un championnat de division
  // inférieure produisait des matchs à 22 points. Or un match de Régionale
  // n'est pas un demi-match : il oppose des joueurs moins bons, ce qui change
  // la QUALITÉ du jeu, pas le nombre de points au tableau d'affichage. La
  // pente tombe de 14 à 6 et la base monte de 18 à 35 — un gradient demeure
  // (37 points en bas, 44 en haut), et les deux extrémités tiennent dans la
  // fourchette du rugby réel comme dans celle du moteur.
  //
  // `ECART_NIVEAU` et `AMPLITUDE_BRUIT` sont INCHANGÉS : ils réglaient déjà
  // correctement la hiérarchie (un club nettement supérieur gagne 90 % du
  // temps) et le suspense (écart moyen de 6,7 points à niveau égal).
  const BASE_SCORE = 35;
  const PENTE_NIVEAU = 6;
  const ECART_NIVEAU = 22;
  const AMPLITUDE_BRUIT = 20;
  // Points par essai, MESURÉS sur le moteur (43,3 / 5,4 = 8,0) plutôt que
  // supposés : l'ancienne valeur de 6,5 traitait presque chaque point comme
  // un essai et gonflait donc leur nombre d'un tiers.
  const POINTS_PAR_ESSAI = 8;

  function simulerResultatAbstrait(rng, niveauA, niveauB) {
    const base = BASE_SCORE + (niveauA + niveauB) * PENTE_NIVEAU;
    const ecartForce = (niveauA - niveauB) * ECART_NIVEAU;
    const bruitA = (rng() - 0.5) * AMPLITUDE_BRUIT;
    const bruitB = (rng() - 0.5) * AMPLITUDE_BRUIT;
    const scoreA = Math.max(0, Math.round(base / 2 + ecartForce / 2 + bruitA));
    const scoreB = Math.max(0, Math.round(base / 2 - ecartForce / 2 + bruitB));
    const essaisA = Math.max(0, Math.round(scoreA / POINTS_PAR_ESSAI));
    const essaisB = Math.max(0, Math.round(scoreB / POINTS_PAR_ESSAI));
    return { scoreA, scoreB, essaisA, essaisB };
  }
  // Nom historique conservé pour les appels internes de ce module.
  const simulerResultatAbstraitFrance = simulerResultatAbstrait;

  // Club léger (pas d'effectif complet — inutile pour une simulation
  // abstraite, cf. RMWorld.genererClubMonde, même principe) pour peupler
  // une division française que le joueur n'occupe pas.
  function genererClubDivisionFrance(rng, niveau) {
    const RMClub = global.RMClub;
    const bande = RMClub.bandeNiveauPalier(niveau);
    const niveauClub = Math.max(0.05, Math.min(0.95, bande.min + rng() * (bande.max - bande.min)));
    return {
      id: RMClub.genererProchainIdClub(),
      nom: RMClub.genererNomClub(rng),
      niveauClub,
      budget: RMClub.budgetInitial(niveauClub, rng),
    };
  }

  function genererDivisionFrance(rng, niveau) {
    const RMClub = global.RMClub;
    const clubs = [];
    for (let i = 0; i < RMClub.TAILLE_DIVISION_FRANCE[niveau]; i++) clubs.push(genererClubDivisionFrance(rng, niveau));
    return {
      niveau, nom: RMClub.nomPalierFrance(niveau),
      clubs,
      calendrier: RMClub.genererCalendrier(clubs),
      classement: RMClub.classementInitial(clubs),
    };
  }

  // Les 2 paliers que le club du joueur n'occupe PAS cette saison, réellement
  // peuplés (clubs/calendrier/classement) — jamais le palier du joueur lui-
  // même, déjà géré par saison.adversaires/calendrier/classement.
  function genererAutresDivisionsFrance(rng, niveauExclu) {
    const divisions = {};
    for (const niveau of [1, 2, 3]) {
      if (niveau === niveauExclu) continue;
      divisions[niveau] = genererDivisionFrance(rng, niveau);
    }
    return { niveauExclu, divisions };
  }

  // Rétrocompat (ancienne sauvegarde sans ce champ) ET resynchronisation
  // après une montée/descente (le palier exclu doit toujours correspondre au
  // palier RÉEL du joueur — sinon son ancien palier resterait figé et le
  // nouveau resterait doublement peuplé). Ne carry-over PAS l'identité des
  // clubs d'un palier quitté : régénéré à neuf, comme saison.adversaires
  // l'est déjà pour le palier du joueur (cf. avancerSaison, club.js) — une
  // amélioration ultérieure pourra faire persister l'identité des clubs
  // d'un palier à l'autre, hors périmètre de cette première tranche.
  function assurerAutresDivisionsFrance(rng, saison) {
    const niveauActuel = (saison.clubJoueur.palierPyramide || { niveau: 3 }).niveau;
    if (!saison.autresDivisionsFrance || saison.autresDivisionsFrance.niveauExclu !== niveauActuel) {
      saison.autresDivisionsFrance = genererAutresDivisionsFrance(rng, niveauActuel);
    }
    // Marché des entraîneurs (G24) : dès que ces divisions existent, leurs
    // bancs sont occupés. Ici plutôt que dans les trois écrans qui appellent
    // cette fonction — un club sans entraîneur est invisible pour le marché
    // (`entraineurDuClub` renvoie null et il est écarté en silence), et
    // l'oubli ne se verrait nulle part. Appel défensif : un banc d'essai
    // partiel qui ne charge pas ce module continue de fonctionner.
    if (global.RMClub.assurerEntraineursRivaux) {
      global.RMClub.assurerEntraineursRivaux(rng, saison);
    }
    return saison.autresDivisionsFrance;
  }

  // Avance chaque division d'une journée (prochaine ronde non jouée) —
  // appelée une fois par journée RÉELLEMENT jouée par le joueur (cf.
  // clubUI.js, lancerLaJournee), jamais conditionnée à l'ouverture d'un
  // onglet particulier.
  // `saison` est facultatif et arrive en TROISIÈME position : les quatre
  // appels existants passent déjà (rng, autresDivisions) et continuent de
  // fonctionner tels quels — sans lui, l'effet du banc de touche est
  // simplement absent, jamais une erreur.
  function avancerJourneeAutresDivisionsFrance(rng, autresDivisions, saison) {
    if (!autresDivisions) return;
    for (const niveau of Object.keys(autresDivisions.divisions)) {
      const div = autresDivisions.divisions[niveau];
      const prochaine = div.calendrier.find((f) => !f.joue);
      if (!prochaine) continue;
      const ronde = div.calendrier.filter((f) => f.journee === prochaine.journee);
      const parId = {};
      for (const c of div.clubs) parId[c.id] = c;
      for (const f of ronde) {
        const a = parId[f.domicileId], b = parId[f.exterieurId];
        if (!a || !b) continue;
        // Le banc de touche compte (G25). `niveauAvecEntraineur` est la seule
        // fonction qui applique l'effet, ici comme dans les matchs IA de la
        // division du joueur — jamais un barème recopié.
        const avecBanc = (club) => (saison && global.RMClub.niveauAvecEntraineur
          ? global.RMClub.niveauAvecEntraineur(saison, club)
          : club.niveauClub);
        const r = simulerResultatAbstraitFrance(rng, avecBanc(a), avecBanc(b));
        global.RMClub.enregistrerResultatDans(div.calendrier, div.classement, f.id, r.scoreA, r.scoreB, r.essaisA, r.essaisB);
      }
    }
  }

  // --- Le monde ne s'efface plus quand le joueur change de palier (G15) ----
  //
  // Mesuré avant : une saison SANS changement de palier conservait tout
  // (14/14, 16/16, 13/13 clubs). Une saison AVEC promotion conservait
  // 0/14, 0/16, 0/13 — **43 clubs effacés et 43 créés**. Les adversaires du
  // nouveau palier étaient tirés à neuf (`niveauxAdversairesPourPalier` +
  // `genererClub`), et les deux autres divisions étaient régénérées par
  // `assurerAutresDivisionsFrance`, dont le garde-fou repart de zéro dès que
  // `niveauExclu` change.
  //
  // Conséquence en jeu : la Ligue Nationale qu'on regardait toute la saison
  // n'était pas celle qu'on rejoignait, et le club qui vous avait battu
  // l'an dernier n'existait plus. Une montée effaçait le monde au lieu d'y
  // faire monter le club.
  //
  // Ici, les clubs ne sont ni créés ni détruits : ils CHANGENT DE DIVISION.

  // Un club d'une division « abstraite » n'a que son identité, son niveau et
  // son budget (cf. genererClubDivisionFrance) : il n'a jamais eu besoin d'un
  // effectif nominatif tant que personne ne l'affrontait. Le jour où il
  // devient un adversaire réel, on le lui donne — à SON niveau, sans toucher
  // à son identité.
  // Dérive de niveau d'un club selon son classement final — la règle qui
  // existait déjà pour les rivaux du joueur (cf. avancerSaison), désormais
  // appliquée à toute la pyramide.
  const DERIVE_NIVEAU_HAUT = 0.05;
  const DERIVE_NIVEAU_BAS = -0.05;

  function assurerEffectifClub(rng, club) {
    const RMClub = global.RMClub;
    if (Array.isArray(club.effectif) && club.effectif.length >= 15) return club;
    club.effectif = RMClub.genererEffectif(rng, club.niveauClub != null ? club.niveauClub : 0.5);
    if (!club.couleur && RMClub.COULEURS) club.couleur = RMClub.choisir(rng, RMClub.COULEURS);
    return club;
  }

  // Classement RÉEL d'une division abstraite, du meilleur au moins bon.
  // Sans classement exploitable (division tout juste créée), on retombe sur
  // le niveau des clubs : jamais un tirage au sort.
  function clubsOrdonnes(division) {
    const RMClub = global.RMClub;
    const clubs = (division.clubs || []).slice();
    const trie = (division.classement && RMClub.classementTrieDe)
      ? RMClub.classementTrieDe(division.classement) : [];
    if (trie.length) {
      const rang = {};
      trie.forEach((r, i) => { rang[r.clubId] = i; });
      return clubs.sort((a, b) => (rang[a.id] != null ? rang[a.id] : 999) - (rang[b.id] != null ? rang[b.id] : 999));
    }
    return clubs.sort((a, b) => (b.niveauClub || 0) - (a.niveauClub || 0));
  }

  // Fait changer le joueur de palier SANS rien effacer. Renvoie la nouvelle
  // liste d'adversaires (clubs réels du palier rejoint) et laisse
  // `saison.autresDivisionsFrance` cohérent avec le nouveau palier.
  //
  // `options.clubQuitte` : le club que le joueur ABANDONNE (cas d'un
  // entraîneur qui signe ailleurs, cf. club-carriere-manager.js). Il rejoint
  // alors son ancienne division comme club IA, et aucun autre club n'a besoin
  // de bouger. Sans cette option, c'est un mouvement SPORTIF : le joueur
  // emmène son club, et un club croise sa route en sens inverse.
  function echangerPalierFrance(rng, saison, nouveauNiveau, options) {
    const RMClub = global.RMClub;
    const o = options || {};
    // Le palier de DÉPART, jamais relu sur le club : au moment où cette
    // fonction est appelée, le club du joueur a pu être remplacé (un
    // entraîneur qui signe ailleurs arrive avec le palier de son NOUVEAU
    // club). L'appelant, lui, sait d'où l'on vient.
    const ancienNiveau = o.ancienNiveau != null
      ? o.ancienNiveau : (saison.clubJoueur.palierPyramide || { niveau: 3 }).niveau;
    const autres = saison.autresDivisionsFrance;
    // Pas de monde à préserver (sauvegarde antérieure, ou divisions jamais
    // créées) : on laisse l'appelant retomber sur son ancien chemin.
    if (!autres || !autres.divisions) return null;

    // 1. Photographie de TOUTES les divisions, sous la même forme.
    const parNiveau = {};
    for (const niveau of [1, 2, 3]) {
      if (niveau === ancienNiveau) parNiveau[niveau] = (saison.adversaires || []).slice();
      else if (autres.divisions[niveau]) parNiveau[niveau] = (autres.divisions[niveau].clubs || []).slice();
      else parNiveau[niveau] = null; // division inconnue : on ne peut rien garantir
    }
    if (!parNiveau[nouveauNiveau] || !parNiveau[ancienNiveau]) return null;

    if (o.clubQuitte) {
      // L'entraîneur part, son club RESTE dans sa division : ce n'est pas le
      // club qui change de palier, c'est l'homme qui change de club. Le club
      // rejoint est déjà dans la liste de SA division (realiserEngagement ne
      // l'en retire pas) : il en sortira plus bas, au moment de composer les
      // adversaires.
      parNiveau[ancienNiveau].push(o.clubQuitte);
    } else {
      // Mouvement SPORTIF : le club du joueur fait partie de sa division
      // comme les autres. C'est la règle générale ci-dessous qui l'emmène,
      // exactement comme n'importe quel rival.
      parNiveau[ancienNiveau].push(saison.clubJoueur);
    }

    // Montées et descentes RÉELLES dans toute la pyramide (G17).
    //
    // Mesuré avant : sur huit saisons simulées, ZÉRO club avait changé de
    // division sans que le joueur bouge. Un club pouvait finir dernier de
    // Ligue d'Excellence dix saisons de suite sans jamais descendre — alors
    // que la règle existait déjà, et était même affichée au manager
    // (placesPyramideFrance : deux montées et deux descentes par palier, sauf
    // le sommet et la base).
    //
    // On applique donc CETTE règle, à toutes les divisions, sans exception.
    // Les tailles se conservent d'elles-mêmes : la division 2 perd 2 promus
    // et 2 relégués, et reçoit 2 relégués de la 1 et 2 promus de la 3.
    const ordres = {};
    for (const niveau of [1, 2, 3]) {
      if (!parNiveau[niveau]) continue;
      if (niveau === ancienNiveau) {
        // Le championnat du joueur : son classement réel, encore intact.
        const trie = RMClub.classementTrie(saison);
        const index = {};
        for (const c of parNiveau[niveau]) index[c.id] = c;
        const liste = trie.map((r) => index[r.clubId]).filter(Boolean);
        if (liste.length === parNiveau[niveau].length) ordres[niveau] = liste;
      } else if (autres.divisions[niveau]) {
        // Une division qui n'a disputé AUCUNE rencontre n'a ni champion ni
        // relégué : son classement est à zéro partout et le trier donnerait
        // un ordre arbitraire. On n'invente pas de mouvement (cf. P14/Q10).
        const jouees = (autres.divisions[niveau].calendrier || []).filter((f) => f.joue).length;
        if (jouees) ordres[niveau] = clubsOrdonnes(autres.divisions[niveau]);
      }
    }
    // Dérive de niveau selon le classement final, appliquée à TOUTE la
    // pyramide (elle ne valait jusqu'ici que pour les rivaux du joueur, et
    // seulement les saisons sans mouvement de palier) : finir en tête
    // renforce un peu, finir dernier affaiblit un peu. C'est ce qui empêche
    // une division de se figer sur le même champion année après année.
    for (const cle of Object.keys(ordres)) {
      const liste = ordres[cle];
      const total = liste.length;
      liste.forEach((club, i) => {
        const rang = i + 1;
        const delta = rang <= 2 ? DERIVE_NIVEAU_HAUT : rang >= total - 1 ? DERIVE_NIVEAU_BAS : 0;
        if (!delta || !club) return;
        club.niveauClub = Math.max(0.05, Math.min(0.95,
          (club.niveauClub != null ? club.niveauClub : 0.5) + delta));
      });
    }

    // Les mouvements se font par PAIRE de divisions voisines, et seulement
    // si les DEUX ont réellement disputé leur saison. C'est ce qui conserve
    // les tailles en toute circonstance : autant de montées que de descentes
    // entre deux paliers. Sans cette symétrie, une division au repos recevait
    // deux promus sans reléguer personne — mesuré, la Ligue Nationale passait
    // à 18 clubs.
    const echanges = [];
    for (const bas of [2, 3]) {
      const haut = bas - 1;
      if (!ordres[bas] || !ordres[haut]) continue;
      const nb = Math.min(
        RMClub.placesPyramideFrance(bas).promus,
        RMClub.placesPyramideFrance(haut).relegues);
      if (nb <= 0) continue;
      echanges.push({
        haut, bas,
        montent: ordres[bas].slice(0, nb),
        descendent: ordres[haut].slice(ordres[haut].length - nb),
      });
    }

    // Repli quand le voisin n'a pas joué : le club du JOUEUR doit tout de
    // même rejoindre le palier que son classement lui a valu — la promotion
    // lui a déjà été annoncée. Un seul club fait alors le chemin inverse,
    // comme avant cette tranche.
    const idJoueur = saison.clubJoueur.id;
    const clubMobile = o.clubQuitte ? null : saison.clubJoueur;
    const dejaDeplace = echanges.some((e) =>
      e.montent.concat(e.descendent).some((c) => c.id === idJoueur));
    if (clubMobile && !dejaDeplace && nouveauNiveau !== ancienNiveau
        && parNiveau[nouveauNiveau] && parNiveau[ancienNiveau]) {
      const ordonnes = autres.divisions[nouveauNiveau]
        ? clubsOrdonnes(autres.divisions[nouveauNiveau]) : parNiveau[nouveauNiveau].slice();
      const monte = nouveauNiveau < ancienNiveau;
      const echange = ordonnes.filter((c) => c.id !== idJoueur);
      const contrepartie = monte ? echange[echange.length - 1] : echange[0];
      if (contrepartie) {
        echanges.push(monte
          ? { haut: nouveauNiveau, bas: ancienNiveau, montent: [clubMobile], descendent: [contrepartie] }
          : { haut: ancienNiveau, bas: nouveauNiveau, montent: [contrepartie], descendent: [clubMobile] });
      }
    }

    const deplaces = new Set();
    for (const e of echanges) {
      for (const c of e.montent.concat(e.descendent)) deplaces.add(c.id);
    }
    for (const niveau of [1, 2, 3]) {
      if (!parNiveau[niveau]) continue;
      parNiveau[niveau] = parNiveau[niveau].filter((c) => !deplaces.has(c.id));
    }
    for (const e of echanges) {
      for (const c of e.montent) if (parNiveau[e.haut]) parNiveau[e.haut].push(c);
      for (const c of e.descendent) if (parNiveau[e.bas]) parNiveau[e.bas].push(c);
    }

    // Où le joueur se retrouve-t-il ? Pour un mouvement sportif, c'est la
    // division où la règle a emmené SON club. Pour un changement
    // d'entraîneur, c'est celle du club qu'il rejoint.
    let niveauJoueur = null;
    for (const niveau of [1, 2, 3]) {
      if (parNiveau[niveau] && parNiveau[niveau].some((c) => c.id === idJoueur)) { niveauJoueur = niveau; break; }
    }
    if (niveauJoueur == null) niveauJoueur = nouveauNiveau;

    // 2. Les clubs du palier du joueur deviennent de VRAIS adversaires — lui
    //    excepté, évidemment.
    const adversaires = (parNiveau[niveauJoueur] || [])
      .filter((c) => c.id !== idJoueur)
      .map((c) => assurerEffectifClub(rng, c));

    // 3. Les deux autres divisions repartent avec leurs clubs RÉELS, un
    //    calendrier et un classement tout neufs — comme le championnat du
    //    joueur, qui est régénéré juste après par avancerSaison.
    const divisions = {};
    for (const niveau of [1, 2, 3]) {
      if (niveau === niveauJoueur) continue;
      const clubs = parNiveau[niveau];
      if (!clubs) continue;
      divisions[niveau] = {
        niveau, nom: RMClub.nomPalierFrance(niveau), clubs,
        calendrier: RMClub.genererCalendrier(clubs),
        classement: RMClub.classementInitial(clubs),
      };
    }
    saison.autresDivisionsFrance = { niveauExclu: niveauJoueur, divisions };
    adversaires.niveauJoueur = niveauJoueur;
    return adversaires;
  }

  // --- Les clubs du monde ont enfin une histoire (G16) --------------------
  //
  // Mesuré avant, après quatre saisons jouées : le club du joueur avait 4
  // entrées d'historique, chaque club adverse en avait ZÉRO
  // (`historiqueSaisons` absent, `palmares` absent). Et pourtant la
  // simulation produisait déjà des histoires — sur ces quatre saisons,
  // « Valfleur Ours » avait été champion QUATRE FOIS DE SUITE. Ce n'était
  // écrit nulle part : l'information n'existait que sous forme d'une chaîne
  // `champion` dans les lignes d'historique du joueur, et disparaissait dès
  // qu'il changeait de division.
  //
  // Depuis G15, les clubs SURVIVENT aux montées et aux descentes. Il leur
  // manquait la mémoire de ce qu'ils ont vécu.
  //
  // Une entrée volontairement MAIGRE (5 champs) : elle est écrite pour 43
  // clubs à chaque saison, et une sauvegarde doit rester chargeable.

  const MAX_SAISONS_HISTORIQUE_CLUB = 12;

  function ajouterSaisonClub(club, entree) {
    if (!club) return;
    if (!Array.isArray(club.historiqueSaisons)) club.historiqueSaisons = [];
    // Idempotence : rejouer une fin de saison ne doit pas doubler la ligne.
    if (club.historiqueSaisons.some((h) => h.numero === entree.numero)) return;
    club.historiqueSaisons.push(entree);
    while (club.historiqueSaisons.length > MAX_SAISONS_HISTORIQUE_CLUB) club.historiqueSaisons.shift();
  }

  // Enregistre la saison écoulée pour TOUS les clubs français : ceux du
  // palier du joueur (classement réel de son championnat) et ceux des deux
  // autres divisions (classement réel de LEUR championnat). Les positions
  // sont lues, jamais recalculées ni tirées.
  //
  // Appelée par avancerSaison AVANT que les paliers soient échangés : les
  // classements sont encore ceux de la saison qui s'achève.
  function enregistrerSaisonClubsFrance(saison, numeroSaison) {
    const RMClub = global.RMClub;
    const niveauJoueur = (saison.clubJoueur.palierPyramide || { niveau: 3 }).niveau;

    // 1. Le championnat du joueur — son club compris : il a déjà son propre
    //    historique riche (cf. club.js), on n'y touche pas, mais les clubs
    //    adverses, eux, n'avaient rien.
    const trie = RMClub.classementTrie(saison);
    const parId = {};
    for (const a of (saison.adversaires || [])) parId[a.id] = a;
    trie.forEach((ligne, i) => {
      const club = parId[ligne.clubId];
      if (!club) return; // le club du joueur : traité par avancerSaison
      ajouterSaisonClub(club, {
        numero: numeroSaison,
        position: i + 1,
        totalClubs: trie.length,
        palierNiveau: niveauJoueur,
        titre: i === 0,
      });
    });

    // 2. Les deux autres divisions, chacune avec SON classement.
    const autres = (saison.autresDivisionsFrance || {}).divisions || {};
    for (const cle of Object.keys(autres)) {
      const division = autres[cle];
      if (!division || !division.clubs) continue;
      const niveau = Number(division.niveau) || Number(cle);
      const classe = RMClub.classementTrieDe
        ? RMClub.classementTrieDe(division.classement || {}) : [];
      if (!classe.length) continue;
      // Une division dont la saison n'a PAS été disputée n'a pas de champion.
      // Son classement existe pourtant (il est initialisé à zéro), et le
      // trier renvoie un ordre arbitraire mais stable : enregistrer son
      // premier comme champion fabriquerait un titre, et le MÊME club aurait
      // été sacré chaque saison. On ne consigne donc que ce qui a été joué.
      const journeesJouees = (division.calendrier || []).filter((f) => f.joue).length;
      if (!journeesJouees) continue;
      const index = {};
      for (const c of division.clubs) index[c.id] = c;
      classe.forEach((ligne, i) => {
        ajouterSaisonClub(index[ligne.clubId], {
          numero: numeroSaison,
          position: i + 1,
          totalClubs: classe.length,
          palierNiveau: niveau,
          titre: i === 0,
        });
      });
    }
  }

  // Historique d'un club, où qu'il soit dans le monde. Renvoie toujours un
  // tableau : un club sans passé n'est pas une erreur, et un club inconnu
  // non plus.
  function historiqueClub(saison, clubId) {
    const RMClub = global.RMClub;
    const club = RMClub.clubPartout ? RMClub.clubPartout(saison, clubId) : null;
    if (!club || !Array.isArray(club.historiqueSaisons)) return [];
    return club.historiqueSaisons;
  }

  // Palmarès DÉRIVÉ de l'historique — jamais un compteur tenu à part, qui
  // pourrait diverger. Une seule source de vérité, valable aussi bien pour
  // le club du joueur (dont les lignes sont plus riches) que pour un club IA.
  function palmaresClub(saison, clubId) {
    const lignes = historiqueClub(saison, clubId);
    const out = {
      saisons: lignes.length, titres: 0, montees: 0, descentes: 0,
      meilleurePosition: null, dernierePosition: null, paliers: [],
    };
    let palierPrecedent = null;
    for (const h of lignes) {
      if (h.titre) out.titres++;
      if (h.position != null) {
        if (out.meilleurePosition == null || h.position < out.meilleurePosition) out.meilleurePosition = h.position;
        out.dernierePosition = h.position;
      }
      const niveau = h.palierNiveau;
      if (niveau != null) {
        if (out.paliers.indexOf(niveau) === -1) out.paliers.push(niveau);
        // Un palier qui DIMINUE est une montée (1 = sommet de la pyramide).
        if (palierPrecedent != null && niveau < palierPrecedent) out.montees++;
        if (palierPrecedent != null && niveau > palierPrecedent) out.descentes++;
        palierPrecedent = niveau;
      }
    }
    return out;
  }

  // Nouvelle saison pour les deux divisions que le joueur ne fréquente pas.
  //
  // Défaut MESURÉ, antérieur à cette tranche et rendu visible par le
  // palmarès : sans changement de palier, ces divisions n'étaient JAMAIS
  // réinitialisées. Leur calendrier restait à 182/182 rencontres jouées, donc
  // `avancerJourneeAutresDivisionsFrance` ne trouvait plus rien à jouer et
  // leur classement restait figé sur celui de la saison 1 — pour toute la
  // carrière. La Ligue d'Excellence que le manager consultait affichait le
  // même tableau final année après année.
  //
  // Les clubs sont CONSERVÉS (c'est l'acquis de G15) ; leur niveau dérive
  // selon leur classement final, avec exactement la même règle que les
  // adversaires du joueur (cf. avancerSaison) : finir en tête renforce un peu,
  // finir dernier affaiblit un peu.
  function nouvelleSaisonAutresDivisionsFrance(saison) {
    const RMClub = global.RMClub;
    const autres = saison.autresDivisionsFrance;
    if (!autres || !autres.divisions) return null;
    let rejouees = 0;
    for (const cle of Object.keys(autres.divisions)) {
      const division = autres.divisions[cle];
      if (!division || !division.clubs) continue;
      const classe = RMClub.classementTrieDe
        ? RMClub.classementTrieDe(division.classement || {}) : [];
      const total = classe.length;
      if (total) {
        const rang = {};
        classe.forEach((r, i) => { rang[r.clubId] = i + 1; });
        for (const club of division.clubs) {
          const r = rang[club.id];
          if (!r) continue;
          const delta = r <= 2 ? DERIVE_NIVEAU_HAUT : r >= total - 1 ? DERIVE_NIVEAU_BAS : 0;
          if (delta) {
            club.niveauClub = Math.max(0.05, Math.min(0.95,
              (club.niveauClub != null ? club.niveauClub : 0.5) + delta));
          }
        }
      }
      division.calendrier = RMClub.genererCalendrier(division.clubs);
      division.classement = RMClub.classementInitial(division.clubs);
      rejouees++;
    }
    return rejouees;
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    assurerAutresDivisionsFrance, avancerJourneeAutresDivisionsFrance,
    echangerPalierFrance, enregistrerSaisonClubsFrance, simulerResultatAbstrait,
    nouvelleSaisonAutresDivisionsFrance,
    historiqueClub, palmaresClub, MAX_SAISONS_HISTORIQUE_CLUB,
  });
})(window);
