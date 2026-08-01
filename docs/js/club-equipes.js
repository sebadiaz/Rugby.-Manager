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

  const TYPES_EQUIPE = {
    pro: { label: 'Première équipe', icone: '🏉', modifiable: true },
    b: { label: 'Équipe B', icone: '🥈', modifiable: true },
    jeunes: { label: 'Espoirs', icone: '🌱', modifiable: true },
    adverse: { label: 'Club adverse', icone: '🏟️', modifiable: false },
  };

  // Valeur du <select> unique ↔ sélection interne. Un club adverse a besoin
  // de son id en plus du type, d'où l'encodage "adverse:<clubId>".
  function encoderSelection(selection) {
    if (!selection || selection.type !== 'adverse') return (selection && selection.type) || 'pro';
    return 'adverse:' + selection.clubId;
  }
  function decoderSelection(valeur) {
    const brut = String(valeur || 'pro');
    if (brut.indexOf('adverse:') === 0) return { type: 'adverse', clubId: brut.slice('adverse:'.length) };
    return { type: TYPES_EQUIPE[brut] ? brut : 'pro', clubId: null };
  }

  // Sélection courante, normalisée et rétrocompatible : une sauvegarde
  // antérieure porte l'ancien champ `equipeGeree` ('pro'|'b'|'jeunes'), une
  // sauvegarde encore plus ancienne n'a rien du tout. Une sélection qui
  // pointe vers un club adverse disparu (fin de saison, changement de
  // palier) retombe silencieusement sur le premier XV plutôt que de laisser
  // les écrans sur une équipe fantôme.
  function selectionEquipe(saison) {
    const c = saison.clubJoueur;
    if (!c.equipeSelectionnee || typeof c.equipeSelectionnee !== 'object') {
      c.equipeSelectionnee = { type: TYPES_EQUIPE[c.equipeGeree] ? c.equipeGeree : 'pro', clubId: null };
    }
    const sel = c.equipeSelectionnee;
    if (!TYPES_EQUIPE[sel.type]) { sel.type = 'pro'; sel.clubId = null; }
    if (sel.type === 'adverse' && !global.RMClub.club(saison, sel.clubId)) { sel.type = 'pro'; sel.clubId = null; }
    return sel;
  }

  function definirSelectionEquipe(saison, type, clubId) {
    const sel = selectionEquipe(saison);
    if (!TYPES_EQUIPE[type]) return sel;
    if (type === 'adverse' && !global.RMClub.club(saison, clubId)) return sel;
    sel.type = type;
    sel.clubId = type === 'adverse' ? clubId : null;
    // `equipeGeree` reste écrit pour les 3 équipes du club : une sauvegarde
    // relue par une version antérieure du jeu retrouve son écran.
    if (type !== 'adverse') saison.clubJoueur.equipeGeree = type;
    return sel;
  }

  // Toutes les équipes proposables dans le sélecteur unique — les 3 équipes
  // du club puis TOUS les clubs de la division, dans l'ordre du classement
  // réel (pas un ordre de génération arbitraire).
  function equipesDisponibles(saison) {
    const liste = [
      { valeur: 'pro', label: TYPES_EQUIPE.pro.icone + ' ' + TYPES_EQUIPE.pro.label, groupe: 'Mon club' },
      { valeur: 'b', label: TYPES_EQUIPE.b.icone + ' ' + TYPES_EQUIPE.b.label, groupe: 'Mon club' },
      { valeur: 'jeunes', label: TYPES_EQUIPE.jeunes.icone + ' ' + TYPES_EQUIPE.jeunes.label, groupe: 'Mon club' },
    ];
    const rangs = {};
    global.RMClub.classementTrie(saison).forEach((r, i) => { rangs[r.clubId] = i + 1; });
    const adversaires = (saison.adversaires || []).slice()
      .sort((a, b) => (rangs[a.id] || 99) - (rangs[b.id] || 99));
    for (const adv of adversaires) {
      liste.push({ valeur: 'adverse:' + adv.id, label: adv.nom, groupe: 'Autres clubs de la division' });
    }
    return liste;
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
    };
  }

  // Effectif d'un club adverse ramené à la MÊME forme que celui du club du
  // joueur : les joueurs IA sont indexés par numéro de maillot et n'ont pas
  // d'id stable (cf. genererJoueur) alors que tous les écrans travaillent par
  // id. On leur en dérive un, déterministe (même club + même numéro = même
  // id à chaque rendu), sur une COPIE — les données de la saison ne sont
  // jamais mutées pour un simple besoin d'affichage.
  function effectifAdverseNormalise(club) {
    return (club.effectif || []).map((j, i) => Object.assign({}, j, {
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
    return {
      compositionTitulaires,
      compositionBanc: {},
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
    const c = saison.clubJoueur;
    const joues = c.matchsEspoirs || [];
    const parJournee = {};
    for (const m of joues) parJournee[m.journee] = m;
    const fixtures = [];
    for (const f of saison.calendrier) {
      if (f.domicileId !== c.id && f.exterieurId !== c.id) continue;
      if (!global.RMClub.journeeDeMatchEspoirs(f.journee)) continue;
      const joue = parJournee[f.journee];
      const adverseId = f.domicileId === c.id ? f.exterieurId : f.domicileId;
      const clubAdverse = global.RMClub.club(saison, adverseId);
      fixtures.push({
        id: 'esp' + f.journee,
        journee: f.journee,
        domicileId: c.id,
        exterieurId: adverseId,
        // L'adversaire est une académie synthétique du club affronté ce
        // jour-là (cf. simulerMatchEspoirs) — nommée telle quelle, pas
        // confondue avec l'équipe première adverse.
        libelleExterieur: 'Académie ' + ((joue && joue.adversaire) || (clubAdverse ? clubAdverse.nom : '?')),
        joue: !!joue,
        score: joue ? { domicile: joue.scorePour, exterieur: joue.scoreContre } : null,
      });
    }
    return fixtures;
  }

  // --- Le contexte : ce que consomment TOUS les écrans --------------------
  function contexteEquipe(saison, selectionForcee) {
    const sel = selectionForcee || selectionEquipe(saison);
    const type = sel.type;
    const infosType = TYPES_EQUIPE[type];
    const c = saison.clubJoueur;

    if (type === 'adverse') {
      const club = global.RMClub.club(saison, sel.clubId);
      const effectif = effectifAdverseNormalise(club);
      return {
        type, clubId: club.id, club, effectif,
        label: club.nom,
        sousTitre: 'Club adverse — consultation en lecture seule',
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

    const effectif = global.RMClub.effectifPourEquipe(saison, type);
    const slot = global.RMClub.slotCompositionPourEquipe(saison, type);
    const base = {
      type, clubId: c.id, club: c, effectif, slot,
      label: infosType.label,
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
        calendrier: calendrierEspoirs(saison),
        classement: { [c.id]: bilanEspoirs(saison) },
        titreClassement: 'Bilan des espoirs',
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
    TYPES_EQUIPE, encoderSelection, decoderSelection,
    selectionEquipe, definirSelectionEquipe, equipesDisponibles,
    deduireTactiqueAdverse, effectifAdverseNormalise, slotAdverse,
    enregistrerMatchEspoirs, bilanEspoirs, calendrierEspoirs,
    contexteEquipe,
  });
})(window);
