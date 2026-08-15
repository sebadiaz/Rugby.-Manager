// Marché des transferts national (Mode Club) — domaine extrait de club.js
// (TODO_AUDIT.md P2-10, tranche 7) : génération du marché, scouting,
// signature, libération, favoris.
//
// Dépendances externes, restées dans club.js et appelées ici via RMClub.*
// (même mécanisme de fusion que les tranches précédentes) : choisir,
// genererJoueurEtendu, estimerValeurTransfert, ajouterMessage,
// GABARIT_EFFECTIF (nouvelle exportation de club.js pour ce découpage). Le
// transfert international (approcherJoueurAdverse/
// convertirJoueurAdverseEnEffectifEtendu) reste dans club.js : il mute
// directement compteurJoueurId, une variable de module hors de la fermeture
// de ce fichier — même genre de dépendance cachée que compteurPersonnelId en
// tranche 1, traité séparément plutôt que forcé ici.
(function (global) {
  'use strict';

  // Repérage façon "scouting" FM : un joueur libre n'est d'abord connu
  // qu'approximativement (connaissance basse, cf. statsApparentes) — un vrai
  // rapport de scout se précise avec l'investissement, il ne tombe pas tout
  // armé avec des statistiques exactes.
  const COUT_SCOUTING = 8; // k€ par action de repérage
  const SEUIL_CONNAISSANCE_COMPLETE = 90;
  // TOUS les attributs sur lesquels un scout peut se tromper — donc tous ceux
  // que le moteur utilise. Avant (TODO_AUDIT.md P1-49), le rapport n'en
  // exposait que deux : mesuré, les cinq piliers d'un même marché affichaient
  // la MÊME note (2★) alors que leur mêlée allait de 77 à 86. Recruter un
  // pilier était un tirage au sort, alors que la mêlée décide seule s'il
  // jouera (cf. noteAuPoste, correctif P0-composition).
  const ATTRIBUTS_SCOUTES = ['vitesse', 'plaquage', 'adresse', 'melee', 'touche',
    'puissance', 'endurance', 'passe', 'jeuPied', 'decision', 'discipline'];
  const AMPLITUDE_INCERTITUDE = 15;

  // Incertitude du rapport, attribut par attribut. Pour une sauvegarde
  // antérieure (qui n'a que `ecartVitesse`/`ecartPlaquage`), les écarts
  // manquants sont DÉRIVÉS de l'identifiant du joueur : une fonction pure,
  // donc deux lectures du même rapport donnent le même chiffre — un rapport
  // qui « flotte » à chaque affichage serait inutilisable. On fabrique ici
  // l'INCERTITUDE, jamais une statistique : la valeur réelle du joueur, elle,
  // n'est pas touchée.
  function ecartsDe(joueur) {
    if (joueur.ecarts) return joueur.ecarts;
    const base = { vitesse: joueur.ecartVitesse || 0, plaquage: joueur.ecartPlaquage || 0 };
    let h = 0x811c9dc5;
    const graine = String(joueur.id || joueur.nom || '');
    for (let i = 0; i < graine.length; i++) { h ^= graine.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    for (const attr of ATTRIBUTS_SCOUTES) {
      if (base[attr] != null && (attr === 'vitesse' || attr === 'plaquage')) continue;
      for (let i = 0; i < attr.length; i++) { h ^= attr.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
      base[attr] = Math.round(((h % 2001) / 1000 - 1) * AMPLITUDE_INCERTITUDE);
    }
    return base;
  }

  function genererJoueurLibre(rng, niveauMoyen) {
    const RMClub = global.RMClub;
    const poste = RMClub.choisir(rng, RMClub.GABARIT_EFFECTIF);
    const j = RMClub.genererJoueurEtendu(poste, rng, niveauMoyen);
    j.prixTransfert = RMClub.estimerValeurTransfert(j.vitesse, j.plaquage, j.age);
    // Premier repérage : connaissance faible (20-50 %) et incertitude fixe
    // sur chaque statistique (±15 au max), qui se résorbe avec la connaissance
    // — cf. statsApparentes. Fixée une fois pour toutes à la génération, pas
    // recalculée aléatoirement à chaque affichage (sinon le rapport "flotte").
    j.connaissance = 20 + Math.floor(rng() * 30);
    j.ecarts = {};
    for (const attr of ATTRIBUTS_SCOUTES) {
      j.ecarts[attr] = Math.round((rng() * 2 - 1) * AMPLITUDE_INCERTITUDE);
    }
    // Conservés pour les anciennes sauvegardes et les écrans qui les lisent
    // encore : ce sont exactement les mêmes valeurs, pas un second tirage.
    j.ecartVitesse = j.ecarts.vitesse;
    j.ecartPlaquage = j.ecarts.plaquage;
    return j;
  }
  function genererMarcheTransferts(rng, niveauMoyen, n) {
    const marche = [];
    for (let i = 0; i < (n || 6); i++) marche.push(genererJoueurLibre(rng, niveauMoyen));
    return marche;
  }

  // Ce que le RAPPORT DE SCOUT affiche pour ce joueur du marché — pas
  // forcément ses vraies statistiques tant qu'il n'est pas bien connu.
  // `complet` indique si on peut faire confiance aux valeurs affichées.
  function fiabiliteRapport(joueur) {
    if (joueur.connaissance == null) return 1; // joueur du club : rien à cacher
    return Math.min(1, joueur.connaissance / SEUIL_CONNAISSANCE_COMPLETE);
  }
  function statsApparentes(joueur) {
    const fiabilite = fiabiliteRapport(joueur);
    const ecarts = ecartsDe(joueur);
    const out = { complet: fiabilite >= 1, fiabilite };
    for (const attr of ATTRIBUTS_SCOUTES) {
      const reel = joueur[attr];
      if (reel == null) continue;
      out[attr] = Math.max(1, Math.min(99,
        Math.round(reel - (ecarts[attr] || 0) * (1 - fiabilite))));
    }
    return out;
  }

  // Note AU POSTE telle que le rapport la donne — même grille que la
  // composition (noteAuPoste), appliquée aux valeurs APPARENTES. C'est le
  // chiffre qui permet de choisir : les étoiles, elles, écrasent trop.
  function noteApparenteAuPoste(joueur, poste) {
    const RMClub = global.RMClub;
    const cible = poste || joueur.poste;
    const apparent = statsApparentes(joueur);
    // `poste` du joueur conservé : c'est ce qui déclenche la pénalité hors
    // poste de noteAuPoste (un pilier aligné à l'aile perd beaucoup).
    return RMClub.noteAuPoste(Object.assign({ poste: joueur.poste }, apparent), cible);
  }

  // Étoiles (1-5) : le résumé d'un coup d'œil, dérivé de la MÊME note au
  // poste. Grossier par nature — deux joueurs séparés de deux points de note
  // partagent la même étoile — c'est pourquoi l'écran affiche aussi la note.
  function estimationEtoiles(joueur, poste) {
    const note = noteApparenteAuPoste(joueur, poste);
    return Math.max(1, Math.min(5, Math.round((note - 30) / 13)));
  }

  // Dossier complet présenté au manager pour un joueur du marché : ce que le
  // scout croit savoir, ce qui compte à ce poste, et ce que ça donnerait
  // comparé au meilleur joueur RÉELLEMENT présent au même poste.
  function rapportScouting(saison, joueurId, poste) {
    const RMClub = global.RMClub;
    const j = (saison.marche || []).find((x) => x.id === joueurId);
    if (!j) return null;
    const cible = poste || j.poste;
    const apparent = statsApparentes(j);
    const cles = RMClub.attributsClesDuPoste(cible).map((a) => Object.assign({}, a, {
      valeur: apparent[a.attr] != null ? apparent[a.attr] : null,
    }));
    const effectif = (saison.clubJoueur && saison.clubJoueur.effectif) || [];
    const auPoste = effectif.filter((x) => x.poste === cible);
    const meilleurActuel = auPoste.length
      ? Math.max(...auPoste.map((x) => RMClub.noteAuPoste(x, cible)))
      : null;
    const note = noteApparenteAuPoste(j, cible);
    return {
      joueurId, nom: j.nom, poste: cible, posteNaturel: j.poste,
      note, etoiles: estimationEtoiles(j, cible),
      attributsCles: cles,
      fiabilite: apparent.fiabilite,
      complet: apparent.complet,
      meilleurActuel,
      ameliore: meilleurActuel == null ? null : note > meilleurActuel,
      prixTransfert: j.prixTransfert,
    };
  }

  // Investit dans le repérage d'un joueur du marché : coûte un peu de budget,
  // fait progresser la connaissance vers un rapport fiable.
  // Le recruteur (personnel, cf. effetPersonnel) réduit le coût et augmente
  // le gain de connaissance par action de scouting — sans lui, comportement
  // historique inchangé (coût plein, +30 de connaissance).
  function scouterJoueur(saison, joueurId, facteurRecruteur) {
    const fr = facteurRecruteur != null ? facteurRecruteur : 1;
    const cout = Math.max(3, Math.round(COUT_SCOUTING / fr));
    const j = saison.marche.find((x) => x.id === joueurId);
    if (!j) return { ok: false, motif: 'introuvable' };
    if (j.connaissance >= 100) return { ok: false, motif: 'deja_complet' };
    if (saison.clubJoueur.budget < cout) return { ok: false, motif: 'budget' };
    global.RMClub.tresorerie(saison, 'scouting', `Repérage de ${j.nom}`, -cout);
    j.connaissance = Math.min(100, j.connaissance + Math.round(30 * fr));
    return { ok: true, connaissance: j.connaissance, cout };
  }

  // --- Rapports de scouting DIFFÉRÉS (TODO_AUDIT.md P1-23) ----------------
  // Un recruteur ne rend pas son rapport dans la seconde : il part observer
  // le joueur et revient quelques jours plus tard. Commander un rapport
  // débite le budget TOUT DE SUITE (le déplacement est engagé) mais la
  // connaissance n'augmente qu'à la remise — c'est ce qui donne enfin un
  // sens au calendrier côté recrutement. Un bon recruteur va plus vite.
  const DELAI_SCOUTING_JOURS = 5;

  function commanderRapportScouting(saison, joueurId, facteurRecruteur) {
    const RMClub = global.RMClub;
    const fr = facteurRecruteur != null ? facteurRecruteur : 1;
    const cout = Math.max(3, Math.round(COUT_SCOUTING / fr));
    const j = saison.marche.find((x) => x.id === joueurId);
    if (!j) return { ok: false, motif: 'introuvable' };
    if (j.connaissance >= 100) return { ok: false, motif: 'deja_complet' };
    if (!Array.isArray(saison.rapportsScouting)) saison.rapportsScouting = [];
    if (saison.rapportsScouting.some((r) => r.joueurId === joueurId)) return { ok: false, motif: 'deja_commande' };
    if (saison.clubJoueur.budget < cout) return { ok: false, motif: 'budget' };
    RMClub.tresorerie(saison, 'scouting', `Rapport de repérage sur ${j.nom}`, -cout);
    const delai = Math.max(2, Math.round(DELAI_SCOUTING_JOURS / fr));
    const remise = RMClub.ajouterJours(RMClub.dateCourante(saison), delai);
    saison.rapportsScouting.push({
      joueurId, nom: j.nom, cout, delai,
      gain: Math.round(30 * fr),
      dateRemise: RMClub.dateISO(remise),
    });
    return { ok: true, cout, delai, dateRemise: remise };
  }

  // Remet les rapports arrivés à échéance : la connaissance augmente
  // RÉELLEMENT (les vraies statistiques du joueur deviennent visibles, cf.
  // statsApparentes) et un message le signale. Un joueur qui a quitté le
  // marché entre-temps voit son rapport simplement annulé — jamais un
  // rapport fantôme conservé indéfiniment.
  function remettreRapportsScouting(saison, date) {
    const RMClub = global.RMClub;
    if (!Array.isArray(saison.rapportsScouting) || !saison.rapportsScouting.length) return [];
    const remis = [];
    const restants = [];
    for (const r of saison.rapportsScouting) {
      const echeance = RMClub.dateDepuisISO(r.dateRemise);
      if (!echeance || RMClub.comparerDates(date, echeance) < 0) { restants.push(r); continue; }
      const j = saison.marche.find((x) => x.id === r.joueurId);
      if (!j) continue; // joueur parti du marché : rapport caduc
      j.connaissance = Math.min(100, (j.connaissance || 0) + r.gain);
      remis.push({ nom: j.nom, connaissance: j.connaissance });
      global.RMClub.ajouterMessage(saison, 'transfert', 'Rapport de scouting',
        `Ton recruteur a rendu son rapport sur ${j.nom} : connaissance du joueur portée à ${j.connaissance} %.`);
    }
    saison.rapportsScouting = restants;
    return remis;
  }

  function rapportScoutingEnCours(saison, joueurId) {
    return (saison.rapportsScouting || []).find((r) => r.joueurId === joueurId) || null;
  }

  // --- Fenêtres de transfert (TODO_AUDIT.md P1-24) -----------------------
  // Un club ne recrute pas n'importe quand : le marché n'est ouvert que sur
  // des périodes précises. Les dates sont DÉRIVÉES du calendrier réel de la
  // saison (cf. club-temps.js), pas fixées en dur — elles restent donc
  // justes quelle que soit la taille de la division.
  //
  //   - mercato d'été : de l'intersaison jusqu'à la 4e journée ;
  //   - mercato d'hiver : quatre semaines autour de la mi-championnat.
  //
  // Le REPÉRAGE (scouting) reste possible toute l'année : observer un joueur
  // n'est pas le recruter. Seules les signatures sont fermées hors fenêtre.
  const JOURNEE_FIN_MERCATO_ETE = 4;
  const DUREE_MERCATO_HIVER_JOURS = 28;

  function fenetresTransfert(saison) {
    const RMClub = global.RMClub;
    const numero = saison.numero || 1;
    const journees = new Set((saison.calendrier || []).map((f) => f.journee));
    const nbJournees = journees.size || 26;
    const miSaison = Math.max(2, Math.round(nbJournees / 2));
    const debutHiver = RMClub.dateDeJournee(numero, miSaison, 'pro');
    return [
      {
        cle: 'ete', nom: 'Mercato d\'été',
        debut: RMClub.debutDeSaison(numero),
        fin: RMClub.dateDeJournee(numero, Math.min(JOURNEE_FIN_MERCATO_ETE, nbJournees), 'pro'),
      },
      {
        cle: 'hiver', nom: 'Mercato d\'hiver',
        debut: debutHiver,
        fin: RMClub.ajouterJours(debutHiver, DUREE_MERCATO_HIVER_JOURS),
      },
    ];
  }

  // État du marché à une date donnée : ouverte ou non, et si non, quand elle
  // rouvre — pour que le manager sache ce qu'il attend, jamais un simple
  // « indisponible » sans explication.
  function etatFenetreTransfert(saison, date) {
    const RMClub = global.RMClub;
    const jour = date || RMClub.dateCourante(saison);
    const fenetres = fenetresTransfert(saison);
    for (const f of fenetres) {
      if (RMClub.comparerDates(jour, f.debut) >= 0 && RMClub.comparerDates(jour, f.fin) <= 0) {
        return { ouverte: true, nom: f.nom, cle: f.cle, ferme: f.fin };
      }
    }
    const prochaine = fenetres
      .filter((f) => RMClub.comparerDates(jour, f.debut) < 0)
      .sort((a, b) => RMClub.comparerDates(a.debut, b.debut))[0] || null;
    return { ouverte: false, nom: null, cle: null, prochaine: prochaine ? prochaine.nom : null, ouvre: prochaine ? prochaine.debut : null };
  }

  // Prime de signature (Mode Club) : frais d'arrivée réels en plus de
  // l'indemnité de transfert (agent, prime à la signature), proportionnelle
  // au salaire — un transfert ne coûte pas QUE l'indemnité, comme en vrai.
  function calculerPrimeSignature(joueur) {
    return Math.round(joueur.salaire * 0.2);
  }
  function signerJoueur(saison, joueurId) {
    const i = saison.marche.findIndex((j) => j.id === joueurId);
    if (i === -1) return { ok: false, motif: 'introuvable' };
    // Hors fenêtre de transfert, une signature est simplement impossible
    // (TODO_AUDIT.md P1-24) — le repérage, lui, reste ouvert toute l'année.
    const fenetre = etatFenetreTransfert(saison);
    if (!fenetre.ouverte) return { ok: false, motif: 'fenetre_fermee', fenetre };
    const joueur = saison.marche[i];
    const primeSignature = calculerPrimeSignature(joueur);
    const coutTotal = joueur.prixTransfert + primeSignature;
    if (saison.clubJoueur.budget < coutTotal) return { ok: false, motif: 'budget' };
    global.RMClub.tresorerie(saison, 'transfertAchat',
      `Transfert de ${joueur.nom} (${joueur.poste})`, -coutTotal);
    // Une fois signé, c'est TON joueur : plus de brouillard de scouting, ses
    // vraies statistiques s'affichent directement dans l'effectif.
    delete joueur.connaissance; delete joueur.ecartVitesse; delete joueur.ecartPlaquage;
    delete joueur.ecarts;
    saison.clubJoueur.effectif.push(joueur);
    saison.marche.splice(i, 1);
    // Un favori signé n'est plus "à scouter" : retiré de la liste (cf.
    // basculerFavori) pour ne pas laisser une entrée déjà recrutée dessus.
    if (saison.favoris) saison.favoris = saison.favoris.filter((j) => j.id !== joueurId);
    global.RMClub.ajouterMessage(saison, 'transfert', 'Nouveau transfert', `${joueur.nom} rejoint le club (${coutTotal} k€).`);
    return { ok: true, primeSignature, coutTotal };
  }

  // Refuse de libérer un joueur si ça viderait complètement son poste (sinon
  // la composition automatique ne pourrait plus aligner une équipe complète).
  function libererJoueur(saison, joueurId) {
    const effectif = saison.clubJoueur.effectif;
    const joueur = effectif.find((j) => j.id === joueurId);
    if (!joueur) return { ok: false, motif: 'introuvable' };
    const memePoste = effectif.filter((j) => j.poste === joueur.poste);
    if (memePoste.length <= 1) return { ok: false, motif: 'dernier_du_poste' };
    saison.clubJoueur.effectif = effectif.filter((j) => j.id !== joueurId);
    // Nettoie toute référence pendante vers ce joueur (composition, banc,
    // encadrement) : sinon la config moteur ou l'UI pointerait vers un id
    // qui n'existe plus (cf. completerComposition/completerCompositionBanc,
    // qui recomposent proprement autour des trous laissés ici).
    const c = saison.clubJoueur;
    if (c.capitaineId === joueurId) c.capitaineId = null;
    if (c.buteurId === joueurId) c.buteurId = null;
    if (c.lanceurToucheId === joueurId) c.lanceurToucheId = null;
    for (const compo of [c.compositionTitulaires, c.compositionBanc]) {
      if (!compo) continue;
      for (const numero of Object.keys(compo)) {
        if (compo[numero] === joueurId) delete compo[numero];
      }
    }
    global.RMClub.ajouterMessage(saison, 'transfert', 'Départ libre', `${joueur.nom} quitte le club librement.`);
    return { ok: true };
  }

  // Centre de scouting : liste de favoris (Mode Club) — les entrées du
  // marché sont régénérées à chaque rafraîchissement, donc un favori est une
  // COPIE conservée indépendamment (jamais une simple référence qui
  // disparaîtrait au prochain "Rafraîchir"). Nettoyé automatiquement si le
  // joueur est finalement signé (cf. signerJoueur).
  function basculerFavori(saison, joueur) {
    if (!saison.favoris) saison.favoris = [];
    const idx = saison.favoris.findIndex((j) => j.id === joueur.id);
    if (idx >= 0) { saison.favoris.splice(idx, 1); return { ok: true, favori: false }; }
    saison.favoris.push(joueur);
    return { ok: true, favori: true };
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    genererMarcheTransferts, statsApparentes, estimationEtoiles, noteApparenteAuPoste,
    rapportScouting, scouterJoueur, COUT_SCOUTING, commanderRapportScouting,
    remettreRapportsScouting, rapportScoutingEnCours, fenetresTransfert,
    etatFenetreTransfert, calculerPrimeSignature, signerJoueur, libererJoueur,
    basculerFavori,
  });
})(window);
