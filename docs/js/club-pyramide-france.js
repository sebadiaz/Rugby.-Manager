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

  // Résultat ABSTRAIT (statistique, pas le moteur physique) — même formule
  // que RMWorld.simulerResultatAbstrait, DUPLIQUÉE ici (pas importée) pour
  // ne créer aucune dépendance vers world.js. Une trentaine de clubs sur 2
  // divisions ne peuvent pas tourner sur le moteur complet à chaque journée
  // du joueur, sans quoi une seule journée prendrait des minutes à générer.
  function simulerResultatAbstraitFrance(rng, niveauA, niveauB) {
    const base = 18 + (niveauA + niveauB) * 14;
    const ecartForce = (niveauA - niveauB) * 22;
    const bruitA = (rng() - 0.5) * 20;
    const bruitB = (rng() - 0.5) * 20;
    const scoreA = Math.max(0, Math.round(base / 2 + ecartForce / 2 + bruitA));
    const scoreB = Math.max(0, Math.round(base / 2 - ecartForce / 2 + bruitB));
    const essaisA = Math.max(0, Math.round(scoreA / 6.5));
    const essaisB = Math.max(0, Math.round(scoreB / 6.5));
    return { scoreA, scoreB, essaisA, essaisB };
  }

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
    return saison.autresDivisionsFrance;
  }

  // Avance chaque division d'une journée (prochaine ronde non jouée) —
  // appelée une fois par journée RÉELLEMENT jouée par le joueur (cf.
  // clubUI.js, lancerLaJournee), jamais conditionnée à l'ouverture d'un
  // onglet particulier.
  function avancerJourneeAutresDivisionsFrance(rng, autresDivisions) {
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
        const r = simulerResultatAbstraitFrance(rng, a.niveauClub, b.niveauClub);
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
    if (ancienNiveau === nouveauNiveau) return null;
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
      // L'entraîneur part, son club reste : il rejoint sa propre division.
      parNiveau[ancienNiveau].push(o.clubQuitte);
      // Et le club qu'il rejoint quitte la liste des adversaires du palier.
      parNiveau[nouveauNiveau] = parNiveau[nouveauNiveau].filter((c) => c.id !== saison.clubJoueur.id);
    } else {
      // Mouvement sportif : un club fait le chemin inverse pour que les deux
      // divisions gardent leur taille. Le joueur monte → c'est le dernier du
      // palier supérieur qui descend ; le joueur descend → c'est le premier
      // du palier inférieur qui monte.
      const ordonnes = autres.divisions[nouveauNiveau]
        ? clubsOrdonnes(autres.divisions[nouveauNiveau]) : parNiveau[nouveauNiveau].slice();
      const monte = nouveauNiveau < ancienNiveau;
      const echange = monte ? ordonnes[ordonnes.length - 1] : ordonnes[0];
      if (!echange) return null;
      parNiveau[nouveauNiveau] = parNiveau[nouveauNiveau].filter((c) => c.id !== echange.id);
      parNiveau[ancienNiveau].push(echange);
    }

    // 2. Les clubs du palier rejoint deviennent de VRAIS adversaires.
    const adversaires = parNiveau[nouveauNiveau].map((c) => assurerEffectifClub(rng, c));

    // 3. Les deux autres divisions repartent avec leurs clubs RÉELS, un
    //    calendrier et un classement tout neufs — comme le championnat du
    //    joueur, qui est régénéré juste après par avancerSaison.
    const divisions = {};
    for (const niveau of [1, 2, 3]) {
      if (niveau === nouveauNiveau) continue;
      const clubs = parNiveau[niveau];
      if (!clubs) continue;
      divisions[niveau] = {
        niveau, nom: RMClub.nomPalierFrance(niveau), clubs,
        calendrier: RMClub.genererCalendrier(clubs),
        classement: RMClub.classementInitial(clubs),
      };
    }
    saison.autresDivisionsFrance = { niveauExclu: nouveauNiveau, divisions };
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
  const DERIVE_NIVEAU_HAUT = 0.05;
  const DERIVE_NIVEAU_BAS = -0.05;

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
    echangerPalierFrance, enregistrerSaisonClubsFrance,
    nouvelleSaisonAutresDivisionsFrance,
    historiqueClub, palmaresClub, MAX_SAISONS_HISTORIQUE_CLUB,
  });
})(window);
