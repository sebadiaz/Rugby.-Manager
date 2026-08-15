// Contexte d'équipe (Mode Club) — SOURCE UNIQUE de vérité pour tous les
// écrans de gestion d'équipe.
//
// Avant ce module, chaque type d'équipe avait sa propre plomberie côté UI :
// le premier XV lisait `saison.clubJoueur`, l'Équipe B avait son onglet
// dédié avec SON classement et SON calendrier recopiés, les Espoirs vivaient
// dans une carte "centre de formation" à part, et un club adverse avait
// encore un autre écran avec sa propre table d'effectif et sa propre fiche
// joueur. Quatre présentations différentes pour les mêmes informations.
//
// Désormais un seul objet — le CONTEXTE — décrit l'équipe actuellement
// sélectionnée, quel que soit son type ('pro' | 'b' | 'jeunes' | 'adverse') :
// effectif, composition/tactique, calendrier, classement, personnel,
// entraînement. Les écrans (composition, effectif, entraînement, tactique,
// calendrier/classement, personnel) consomment CE contexte et rien d'autre :
// un seul écran et un seul composant par fonctionnalité, les données seules
// changent.
//
// Une équipe que le joueur ne dirige pas (`modifiable: false`) passe par
// EXACTEMENT les mêmes écrans, en lecture seule — jamais une page séparée.
// Ce qui n'est honnêtement pas connu d'un club adverse (son programme
// d'entraînement, son organigramme) est signalé comme non connu plutôt que
// fabriqué.
(function (global) {
  'use strict';

  // Une équipe est TOUJOURS une équipe DU CLUB actuellement affiché :
  // 'pro' | 'b' | 'jeunes'. Le club, lui, n'est jamais choisi dans une liste
  // — il s'ouvre en cliquant son nom là où il apparaît déjà (calendrier,
  // classement, analyse d'adversaire, fiche joueur...). Les deux questions
  // sont donc portées par deux états distincts : `clubConsulteId` répond à
  // « quel club ? », `equipeConsultee` à « quelle équipe DE ce club ? ».
  const TYPES_EQUIPE = {
    pro: { label: 'Équipe première', icone: '🏉' },
    b: { label: 'Équipe B', icone: '🥈' },
    jeunes: { label: 'Espoirs', icone: '🌱' },
  };

  // --- État de navigation -------------------------------------------------
  // Persisté dans la saison pour survivre à un rechargement. `clubPrecedentId`
  // / `equipePrecedente` / `ongletPrecedent` mémorisent d'où venait le joueur
  // au moment où il a ouvert un club adverse, pour que « ← Retour à mon
  // club » le ramène exactement là (son équipe ET son écran).
  function navigationClub(saison) {
    const c = saison.clubJoueur;
    if (!c.navigationClub || typeof c.navigationClub !== 'object') {
      c.navigationClub = {
        clubJoueurId: c.id,
        clubConsulteId: c.id,
        // Rétrocompat : reprend l'équipe de l'ancien champ `equipeGeree`
        // (et de la sélection encore plus ancienne) si elle existe.
        equipeConsultee: TYPES_EQUIPE[c.equipeGeree] ? c.equipeGeree : 'pro',
        clubPrecedentId: null,
        equipePrecedente: 'pro',
        ongletPrecedent: 'dashboard',
      };
    }
    const n = c.navigationClub;
    n.clubJoueurId = c.id;
    if (!TYPES_EQUIPE[n.equipeConsultee]) n.equipeConsultee = 'pro';
    if (!TYPES_EQUIPE[n.equipePrecedente]) n.equipePrecedente = 'pro';
    // Un club disparu (fin de saison, changement de palier) ne doit jamais
    // laisser la navigation bloquée sur une équipe fantôme. Recherche LARGE
    // (TODO_AUDIT.md P1-28) : un club d'un autre palier français ou de l'un
    // des 12 pays existe bel et bien — il ne doit pas être traité comme
    // disparu sous prétexte qu'il ne joue pas le championnat du joueur.
    if (!global.RMClub.clubPartout(saison, n.clubConsulteId)) n.clubConsulteId = c.id;
    // Un club adverse n'a qu'une équipe première dans ses données : ne
    // jamais rester sur une équipe qui n'existe pas pour lui.
    if (n.clubConsulteId !== c.id) n.equipeConsultee = 'pro';
    return n;
  }

  function consulteClubJoueur(saison) {
    return navigationClub(saison).clubConsulteId === saison.clubJoueur.id;
  }

  // LA fonction centrale d'ouverture d'un club (appelée par tous les noms de
  // clubs cliquables, quel que soit l'écran) : mémorise d'où l'on vient,
  // bascule sur le club cliqué et sélectionne son équipe première. L'écran à
  // ouvrir ensuite (Composition) est décidé côté UI, pas ici.
  function ouvrirClubDansNavigation(saison, clubId, ongletActuel) {
    const n = navigationClub(saison);
    // Recherche LARGE (TODO_AUDIT.md P1-28) : ouvrir un club d'un autre
    // palier français ou de l'un des 12 pays est un parcours légitime.
    if (!global.RMClub.clubPartout(saison, clubId)) return n;
    if (clubId === n.clubConsulteId) return n;
    // On ne mémorise un point de retour QUE si l'on quitte réellement son
    // propre club — enchaîner deux adversaires ne doit pas faire perdre le
    // chemin du retour.
    if (n.clubConsulteId === saison.clubJoueur.id) {
      n.clubPrecedentId = n.clubConsulteId;
      n.equipePrecedente = n.equipeConsultee;
      n.ongletPrecedent = ongletActuel || 'dashboard';
    }
    n.clubConsulteId = clubId;
    n.equipeConsultee = 'pro';
    return n;
  }

  // Retour à son propre club : restaure l'équipe ET l'écran d'où l'on venait.
  function retourClubJoueurDansNavigation(saison) {
    const n = navigationClub(saison);
    n.clubConsulteId = saison.clubJoueur.id;
    n.equipeConsultee = TYPES_EQUIPE[n.equipePrecedente] ? n.equipePrecedente : 'pro';
    const onglet = n.ongletPrecedent || 'dashboard';
    n.clubPrecedentId = null;
    return { navigation: n, onglet };
  }

  function definirEquipeConsultee(saison, equipe) {
    const n = navigationClub(saison);
    if (!TYPES_EQUIPE[equipe]) return n;
    if (equipesDisponiblesPourClub(saison, n.clubConsulteId).every((e) => e.valeur !== equipe)) return n;
    n.equipeConsultee = equipe;
    // Écrit aussi dans l'ancien champ : une sauvegarde relue par une version
    // antérieure du jeu retrouve son écran.
    if (n.clubConsulteId === saison.clubJoueur.id) saison.clubJoueur.equipeGeree = equipe;
    return n;
  }

  // Équipes RÉELLEMENT disponibles dans les données du club affiché — jamais
  // une entrée fabriquée. Le club du joueur a un effectif pro, un vivier
  // d'Équipe B et un centre de formation ; un club IA n'a qu'un effectif de
  // quinze joueurs (cf. genererEffectif), donc une seule équipe.
  function equipesDisponiblesPourClub(saison, clubId) {
    if (clubId !== saison.clubJoueur.id) {
      return [{ valeur: 'pro', label: TYPES_EQUIPE.pro.icone + ' ' + TYPES_EQUIPE.pro.label }];
    }
    return ['pro', 'b', 'jeunes'].map((t) => ({ valeur: t, label: TYPES_EQUIPE[t].icone + ' ' + TYPES_EQUIPE[t].label }));
  }

  // Écrans accessibles pour le club affiché. Pour un club que le joueur ne
  // dirige pas, les écrans de GESTION (tactique, entraînement, médical,
  // recrutement, transferts, finances, bilan) sont absents du menu — pas
  // grisés : ils n'ont simplement aucun sens, et les données correspondantes
  // n'existent pas pour un club IA.
  // « Préparer le match » (TODO_AUDIT.md P1-41) n'existe que pour le club
  // DIRIGÉ : on ne prépare pas la rencontre d'un club qu'on se contente de
  // consulter. Absent du menu, pas grisé — comme Tactique ou Entraînement.
  const ONGLETS_CLUB_JOUEUR = ['dashboard', 'preparer', 'effectif', 'composition', 'tactique', 'entrainement',
    'transferts', 'personnel', 'classement', 'calendrier', 'monde', 'finances', 'medical', 'developpement',
    // Club (P1-44) : infrastructures et investissements — réservé au club dirigé.
    'club', 'stats'];
  const ONGLETS_CLUB_CONSULTE = ['dashboard', 'effectif', 'composition', 'personnel', 'classement', 'calendrier', 'monde'];

  function ongletsDisponibles(saison) {
    return consulteClubJoueur(saison) ? ONGLETS_CLUB_JOUEUR.slice() : ONGLETS_CLUB_CONSULTE.slice();
  }

  // --- Tactique DÉDUITE d'un club adverse ---------------------------------
  // Un club que le joueur ne dirige pas n'a pas de tactique stockée : le
  // moteur le fait jouer avec ses réglages par défaut. Plutôt que d'afficher
  // un écran vide (ou pire, une tactique inventée), on DÉDUIT chaque axe des
  // moyennes d'attributs RÉELLES de son effectif — exactement l'information
  // dont dispose un manager qui a regardé jouer l'adversaire. Toujours
  // présentée comme une déduction, jamais comme un réglage certain.
  function deduireTactiqueAdverse(effectif) {
    if (!effectif || !effectif.length) return {};
    const moyenne = (attr) => effectif.reduce((s, j) => s + (j[attr] || 0), 0) / effectif.length;
    const passe = moyenne('passe'), vitesse = moyenne('vitesse'), jeuPied = moyenne('jeuPied');
    const puissance = moyenne('puissance'), melee = moyenne('melee'), touche = moyenne('touche');
    const endurance = moyenne('endurance'), plaquage = moyenne('plaquage');
    return {
      style: (passe + vitesse) / 2 >= 60 ? 'large' : (passe + vitesse) / 2 <= 50 ? 'sol' : 'equilibre',
      avants: puissance >= 62 ? 'proche' : vitesse >= 62 ? 'large' : 'equilibre',
      rythme: endurance >= 62 ? 'rapide' : endurance <= 50 ? 'lent' : 'normal',
      pied: jeuPied >= 58 ? 'frequent' : jeuPied <= 46 ? 'rare' : 'normal',
      ligneDef: plaquage >= 62 ? 'haute' : plaquage <= 50 ? 'basse' : 'normale',
      toucheMaul: (melee + touche) / 2 >= 60 ? 'maul' : (melee + touche) / 2 <= 50 ? 'sol' : 'equilibre',
      // Poussée en mêlée (P1-51) : déduite de la mêlée MOYENNE du groupe, la
      // même donnée que celle sur laquelle le manager recrute ses piliers.
      // Un pack qui pousse fort cherche le duel ; un pack faible sort vite
      // plutôt que de concéder des pénalités.
      poussee: melee >= 62 ? 'dominer' : melee <= 50 ? 'sortirVite' : 'equilibre',
    };
  }

  // Effectif d'un club adverse ramené à la MÊME forme que celui du club du
  // joueur : les joueurs IA sont indexés par numéro de maillot et n'ont pas
  // d'id stable (cf. genererJoueur) alors que tous les écrans travaillent par
  // id. On leur en dérive un, déterministe (même club + même numéro = même
  // id à chaque rendu), sur une COPIE — les données de la saison ne sont
  // jamais mutées pour un simple besoin d'affichage.
  function effectifAdverseNormalise(club) {
    // XV du jour + banc (TODO_AUDIT.md P1-29) : l'écran de composition doit
    // pouvoir résoudre les identifiants des DEUX, sinon les remplaçants
    // s'afficheraient comme des cases vides.
    const tous = (club.effectif || []).concat(club.banc || []);
    return tous.map((j, i) => Object.assign({}, j, {
      id: j.id || ('adv-' + club.id + '-' + (j.numero != null ? j.numero : i)),
    }));
  }

  // Slot de composition en LECTURE SEULE d'un club adverse, à la même forme
  // que celui du club du joueur ({compositionTitulaires, compositionBanc,
  // tactique, capitaineId, buteurId, lanceurToucheId}) — pour que les écrans
  // Composition/Tactique fonctionnent SANS aucune branche spécifique. Son
  // XV est son effectif tel qu'il descend réellement sur le terrain (un
  // joueur par numéro, cf. effectifVersJoueursCfg) ; l'encadrement suit la
  // même règle de désignation que le club du joueur.
  function slotAdverse(club, effectifNormalise) {
    const effectif = effectifNormalise || effectifAdverseNormalise(club);
    const compositionTitulaires = {};
    for (const j of effectif) {
      if (j.numero != null && global.RMClub.POSTE_REQUIS[j.numero]) compositionTitulaires[j.numero] = j.id;
    }
    const encadrement = global.RMClub.autoDesignerEncadrement(effectif, compositionTitulaires);
    // Banc RÉEL du club adverse (TODO_AUDIT.md P1-29) : il vient de son
    // groupe de 24, comme le XV. Jusqu'ici cet objet était vide et l'écran
    // de composition d'un adversaire affichait un banc désespérément blanc,
    // alors que le joueur, lui, doit composer le sien.
    const compositionBanc = {};
    for (const j of (club.banc || [])) {
      if (j.numero != null) compositionBanc[j.numero] = j.id;
    }
    return {
      compositionTitulaires,
      compositionBanc,
      tactique: deduireTactiqueAdverse(effectif),
      capitaineId: encadrement.capitaineId,
      buteurId: encadrement.buteurId,
      lanceurToucheId: encadrement.lanceurToucheId,
    };
  }

  // --- Matchs espoirs réellement joués ------------------------------------
  // Le centre de formation dispute de vrais matchs (cf. club-espoirs.js) mais
  // leur résultat ne vivait que dans un message de la boîte de réception :
  // impossible d'en tirer un calendrier ou un bilan. On les archive donc
  // comme n'importe quel autre résultat — jamais un chiffre fabriqué,
  // toujours le score réellement produit par le moteur.
  function enregistrerMatchEspoirs(saison, journee, adversaire, scorePour, scoreContre) {
    const c = saison.clubJoueur;
    if (!Array.isArray(c.matchsEspoirs)) c.matchsEspoirs = [];
    c.matchsEspoirs.push({ journee, adversaire, scorePour, scoreContre });
    // Marque AUSSI la rencontre correspondante du championnat espoirs
    // (TODO_AUDIT.md P1-31) : `journee` est la journée de CHAMPIONNAT à
    // laquelle la rencontre est adossée. Sans ça, l'archive et le calendrier
    // divergeraient — la rencontre resterait « à jouer » indéfiniment et
    // « Continuer » s'y arrêterait en boucle.
    const comp = global.RMClub.assurerCompetitionEspoirs(saison);
    const fixture = (comp.calendrier || []).find((f) => !f.joue
      && f.journeeChampionnat === journee
      && (f.domicileId === c.id || f.exterieurId === c.id));
    if (fixture) {
      const domicileEstJoueur = fixture.domicileId === c.id;
      global.RMClub.enregistrerResultatEspoirs(saison, fixture.id,
        domicileEstJoueur ? scorePour : scoreContre,
        domicileEstJoueur ? scoreContre : scorePour, 0, 0);
    }
    return c.matchsEspoirs;
  }

  // Bilan des espoirs à la même forme qu'une ligne de classement (j/g/n/p/
  // pointsPour/pointsContre/pts) pour être affiché par le MÊME composant de
  // tableau que les championnats. Il n'existe pas de championnat espoirs
  // multi-clubs (cf. club-espoirs.js) : c'est un bilan à une ligne, pas un
  // classement inventé.
  function bilanEspoirs(saison) {
    const matchs = saison.clubJoueur.matchsEspoirs || [];
    const ligne = {
      clubId: saison.clubJoueur.id, j: 0, g: 0, n: 0, p: 0, pts: 0,
      essaisPour: 0, essaisContre: 0, pointsPour: 0, pointsContre: 0,
      bonusOffensifs: 0, bonusDefensifs: 0,
    };
    for (const m of matchs) {
      ligne.j++;
      ligne.pointsPour += m.scorePour;
      ligne.pointsContre += m.scoreContre;
      if (m.scorePour > m.scoreContre) { ligne.g++; ligne.pts += 4; }
      else if (m.scorePour < m.scoreContre) { ligne.p++; }
      else { ligne.n++; ligne.pts += 2; }
    }
    return ligne;
  }

  // Calendrier des espoirs : les journées où un match espoirs a lieu (cf.
  // journeeDeMatchEspoirs) pour le club du joueur, à la même forme qu'une
  // fixture de championnat — déjà jouées (score réel archivé) ou à venir.
  function calendrierEspoirs(saison) {
    // Le vrai calendrier du championnat espoirs (TODO_AUDIT.md P1-31), à la
    // même forme qu'une fixture de championnat. Avant, ces rencontres
    // étaient FABRIQUÉES à la volée depuis le calendrier pro, contre une
    // académie synthétique dont le nom changeait à chaque affichage.
    const comp = global.RMClub.assurerCompetitionEspoirs(saison);
    const parId = {};
    for (const cl of comp.clubs) parId[cl.id] = cl;
    return comp.calendrier.map((f) => Object.assign({}, f, {
      libelleDomicile: (parId[f.domicileId] || {}).nom,
      libelleExterieur: (parId[f.exterieurId] || {}).nom,
    }));
  }

  // --- Le contexte : ce que consomment TOUS les écrans --------------------
  // Décrit l'équipe actuellement affichée — une équipe DU club actuellement
  // consulté. Sa forme est identique que ce soit une équipe du joueur ou
  // celle d'un club qu'il ne dirige pas : c'est ce qui permet aux écrans
  // Effectif et Composition d'être les MÊMES composants, la seule différence
  // étant `modifiable` (consultation et modification / lecture seule).
  function contexteEquipe(saison, navigationForcee) {
    const n = navigationForcee || navigationClub(saison);
    const c = saison.clubJoueur;
    const estClubJoueur = n.clubConsulteId === c.id;

    if (!estClubJoueur) {
      const club = global.RMClub.club(saison, n.clubConsulteId);
      // Club HORS du championnat du joueur (autre palier français, ou l'un
      // des 12 pays de l'écosystème mondial — TODO_AUDIT.md P1-28) : il
      // existe réellement, il a un nom, un niveau, un classement et un
      // calendrier, mais AUCUN effectif n'est simulé pour lui. On le dit,
      // on ne fabrique pas quinze joueurs pour remplir l'écran. Le même
      // écran sert, avec sa carte d'effectif vide et son motif expliqué —
      // exactement comme une Équipe B non qualifiée.
      if (!club) {
        const lointain = global.RMClub.clubPartout(saison, n.clubConsulteId);
        if (!lointain) return contexteEquipe(saison, Object.assign({}, n, { clubConsulteId: c.id }));
        const comp = global.RMClub.competitionDuClub(saison, lointain.id);
        return {
          type: 'pro', clubId: lointain.id, club: lointain, effectif: [],
          estClubJoueur: false,
          label: TYPES_EQUIPE.pro.label,
          nomClub: lointain.nom,
          sousTitre: comp ? `${comp.nom} — club consulté` : 'Club consulté',
          modifiable: false,
          slot: { compositionTitulaires: {}, compositionBanc: {}, tactique: {}, capitaineId: null, buteurId: null, lanceurToucheId: null },
          tactiqueDeduite: false,
          calendrier: comp ? comp.calendrier.filter((f) => f.domicileId === lointain.id || f.exterieurId === lointain.id) : [],
          classement: comp ? comp.classement : null,
          titreClassement: comp ? `Classement — ${comp.nom}` : 'Classement',
          personnel: null,
          entrainementFocus: null,
          disponible: false,
          motifIndisponible: "L'effectif de ce club n'est pas connu : il évolue hors de ton championnat, où seuls les résultats et le classement sont suivis. Son calendrier et sa position, eux, sont réels.",
        };
      }
      const effectif = effectifAdverseNormalise(club);
      return {
        type: 'pro', clubId: club.id, club, effectif,
        estClubJoueur: false,
        label: TYPES_EQUIPE.pro.label,
        nomClub: club.nom,
        sousTitre: 'Club consulté — lecture seule',
        modifiable: false,
        slot: slotAdverse(club, effectif),
        tactiqueDeduite: true,
        calendrier: saison.calendrier.filter((f) => f.domicileId === club.id || f.exterieurId === club.id),
        classement: saison.classement,
        titreClassement: 'Classement de la division',
        // Honnêteté : rien de tout ça n'est simulé pour un club IA. On le dit
        // au lieu d'inventer un organigramme ou un programme.
        personnel: null,
        entrainementFocus: null,
        disponible: true,
        motifIndisponible: null,
      };
    }

    const type = n.equipeConsultee;
    const effectif = global.RMClub.effectifPourEquipe(saison, type);
    const slot = global.RMClub.slotCompositionPourEquipe(saison, type);
    const base = {
      type, clubId: c.id, club: c, effectif, slot,
      estClubJoueur: true,
      label: TYPES_EQUIPE[type].label,
      nomClub: c.nom,
      modifiable: true,
      tactiqueDeduite: false,
      personnel: c.personnel || [],
      disponible: true,
      motifIndisponible: null,
    };

    if (type === 'b') {
      const compB = global.RMClub.assurerCompetitionB(saison);
      const eligible = compB.eligibles.indexOf(c.id) !== -1;
      const aChampionnat = eligible && compB.calendrier.length > 0;
      return Object.assign(base, {
        sousTitre: 'Réservistes du jour + centre de formation',
        // L'Équipe B partage l'entraînement du club : un seul staff, un seul
        // programme collectif — ce n'est pas une donnée « manquante ».
        entrainementFocus: c.entrainementFocus || 'physique',
        calendrier: aChampionnat ? compB.calendrier.filter((f) => f.domicileId === c.id || f.exterieurId === c.id) : [],
        classement: aChampionnat ? compB.classement : null,
        titreClassement: 'Classement Équipe B',
        disponible: aChampionnat,
        motifIndisponible: eligible
          ? (aChampionnat ? null : "Ton budget te qualifie pour une équipe B, mais aucun autre club de la ligue n'a les moyens d'en aligner une cette saison — pas de championnat B possible pour l'instant.")
          : `Budget insuffisant pour aligner une équipe B cette saison : seuls les ${compB.eligibles.length} clubs au budget le plus élevé de la ligue s'en offrent une.`,
      });
    }

    if (type === 'jeunes') {
      return Object.assign(base, {
        sousTitre: 'Centre de formation',
        entrainementFocus: c.entrainementFocus || 'physique',
        // Vrai championnat espoirs (TODO_AUDIT.md P1-31) : calendrier et
        // classement de la compétition réelle, plus un « bilan » d'un seul
        // club face à des adversaires jetables.
        calendrier: calendrierEspoirs(saison),
        classement: global.RMClub.assurerCompetitionEspoirs(saison).classement,
        titreClassement: 'Championnat des espoirs',
        disponible: true,
        motifIndisponible: null,
      });
    }

    return Object.assign(base, {
      sousTitre: 'Le XV qui joue le championnat',
      entrainementFocus: c.entrainementFocus || 'physique',
      calendrier: saison.calendrier,
      classement: saison.classement,
      titreClassement: 'Classement de la division',
    });
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    navigationClub, consulteClubJoueur, ouvrirClubDansNavigation, retourClubJoueurDansNavigation,
    definirEquipeConsultee, equipesDisponiblesPourClub, ongletsDisponibles,
    deduireTactiqueAdverse, effectifAdverseNormalise, slotAdverse, enregistrerMatchEspoirs,
    bilanEspoirs, calendrierEspoirs, contexteEquipe,
  });
})(window);
