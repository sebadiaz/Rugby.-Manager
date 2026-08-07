// Mercato des clubs IA (TODO_AUDIT.md P1-43a).
//
// AVANT ce module, l'intersaison faisait ceci pour chaque club adverse
// (docs/js/club.js) :
//
//   return { id: ancien.id, nom: ancien.nom, ..., effectif: genererEffectif(...) };
//
// L'objet reconstruit abandonnait `groupe` et `banc` et re-tirait `effectif` :
// MESURÉ, 24 partis et 24 arrivées sur chaque club, chaque été. Aucun joueur
// du monde ne gardait son identité. Trois mécaniques déjà écrites en
// souffraient : `approcherJoueurAdverse` (acheter un joueur à un rival),
// `analyserAdversaire` (comparer des attributs réels) et le repérage — la
// cible repérée cette saison n'existait plus la suivante.
//
// Ici, les clubs IA vivent : leurs joueurs vieillissent (par la MÊME fonction
// que l'effectif du joueur, `RMClub.vieillirEffectif` — aucune seconde règle
// de vieillissement), les vieux prennent leur retraite, les trous sont
// comblés, puis les clubs s'échangent RÉELLEMENT des joueurs selon leurs
// besoins et leur budget.
//
// Entièrement déterministe : aucun `Math.random`, tout passe par le rng
// fourni. Aucune dépendance au DOM.
(function (global) {
  'use strict';

  // Un club n'engage jamais tout son budget sur un seul joueur : la part
  // maximale qu'il accepte de mettre sur un transfert.
  const PART_BUDGET_MAX = 0.35;
  // Nombre maximal de recrues par club et par intersaison. Deux suffisent à
  // faire bouger une division sans transformer le monde en loterie.
  const RECRUES_MAX_PAR_CLUB = 2;
  // Un club ne vend pas son effectif : il ne cède qu'un joueur en surplus à
  // son poste, et jamais plus de ce nombre par été.
  const VENTES_MAX_PAR_CLUB = 2;
  // Écart minimal de niveau pour qu'un transfert ait un sens sportif : sans
  // ça, les clubs échangeraient des joueurs équivalents sans rien y gagner.
  const GAIN_MINIMAL = 3;

  function niveauJoueur(j) {
    return (j.vitesse + j.plaquage) / 2;
  }

  // Le groupe RÉEL du club (24 joueurs persistés depuis P1-29), pas sa seule
  // feuille de match à 15.
  function groupeDe(saison, club) {
    const RMClub = global.RMClub;
    return RMClub.groupeAdverse ? RMClub.groupeAdverse(saison, club) : (club.effectif || []);
  }

  // Prix demandé pour un joueur : exactement la formule déjà utilisée quand
  // c'est le MANAGER qui achète (calculerPrixDemandeAdverse), pour qu'un club
  // IA et le joueur paient le même prix pour le même joueur. Aucune seconde
  // grille tarifaire.
  function prixDe(saison, club, joueur) {
    const RMClub = global.RMClub;
    if (RMClub.calculerPrixDemandeAdverse) {
      // La fonction lit `clubAdverse.effectif` pour situer le joueur dans son
      // équipe : on lui passe le groupe complet, qui est la vraie référence.
      return RMClub.calculerPrixDemandeAdverse(joueur, { effectif: groupeDe(saison, club) });
    }
    return Math.round(RMClub.estimerValeurTransfert(joueur.vitesse, joueur.plaquage, joueur.age) * 1.6);
  }

  // Effectif attendu à chaque poste, dérivé du gabarit commun — jamais une
  // liste parallèle.
  function cibleParPoste() {
    const cible = {};
    for (const p of (global.RMClub.GABARIT_EFFECTIF || [])) cible[p] = (cible[p] || 0) + 1;
    return cible;
  }

  // Ce qu'un club CHERCHE : le poste où il est le plus faible, mesuré sur son
  // meilleur joueur à ce poste. Un club ne recrute pas au hasard.
  function besoinsDe(saison, club) {
    const groupe = groupeDe(saison, club);
    const parPoste = {};
    for (const j of groupe) (parPoste[j.poste] = parPoste[j.poste] || []).push(j);
    const besoins = [];
    for (const poste of Object.keys(cibleParPoste())) {
      const liste = (parPoste[poste] || []).slice().sort((a, b) => niveauJoueur(b) - niveauJoueur(a));
      besoins.push({ poste, meilleur: liste.length ? niveauJoueur(liste[0]) : 0, effectif: liste.length });
    }
    besoins.sort((a, b) => a.meilleur - b.meilleur);
    return besoins;
  }

  // Ce qu'un club peut CÉDER : un joueur qui n'est PAS le meilleur à son
  // poste, là où le club en aligne au moins deux. Un club ne vend jamais son
  // titulaire, mais il vend un remplaçant — et le remplace ensuite par un
  // jeune (cf. completerGroupe), exactement comme le club du joueur comble
  // ses départs à l'intersaison.
  //
  // Mesuré : un groupe IA colle exactement au gabarit (24 joueurs, chaque
  // poste à son compte cible). Exiger un SURPLUS au-dessus du gabarit rendait
  // donc tout transfert impossible — aucun club n'avait jamais un joueur à
  // vendre.
  function cessiblesDe(saison, club) {
    const groupe = groupeDe(saison, club);
    const parPoste = {};
    for (const j of groupe) (parPoste[j.poste] = parPoste[j.poste] || []).push(j);
    const cessibles = [];
    for (const poste of Object.keys(parPoste)) {
      const liste = parPoste[poste].slice().sort((a, b) => niveauJoueur(b) - niveauJoueur(a));
      if (liste.length < 2) continue; // un poste à un seul joueur ne se vide pas
      for (let i = 1; i < liste.length; i++) cessibles.push(liste[i]);
    }
    return cessibles;
  }

  // Comble les trous laissés par les ventes, avec des jeunes du niveau du
  // club — même générateur que partout ailleurs (`genererJoueurEtendu`).
  function completerGroupe(rng, saison, club) {
    const RMClub = global.RMClub;
    const groupe = groupeDe(saison, club);
    const cible = cibleParPoste();
    const compte = {};
    for (const j of groupe) compte[j.poste] = (compte[j.poste] || 0) + 1;
    const arrivees = [];
    for (const poste of Object.keys(cible)) {
      for (let i = compte[poste] || 0; i < cible[poste]; i++) {
        const jeune = RMClub.genererJoueurEtendu(poste, rng, club.niveauClub != null ? club.niveauClub : 0.5);
        jeune.age = 18 + Math.floor(rng() * 3);
        jeune.contrat = 2 + Math.floor(rng() * 2);
        jeune.salaire = RMClub.calculerSalaire(jeune.vitesse, jeune.plaquage, jeune.age);
        jeune.id = 'adv-' + club.id + '-' + (RMClub.genererProchainIdJoueur
          ? RMClub.genererProchainIdJoueur() : Math.round(rng() * 1e9));
        groupe.push(jeune);
        arrivees.push(jeune);
      }
    }
    club.groupe = groupe;
    return arrivees;
  }

  // Retire un joueur du club : du groupe ET de la feuille de match, dont la
  // place est reprise par un remplaçant réel du groupe (jamais un inconnu
  // généré, sinon on recréerait le problème qu'on corrige).
  function retirerDuClub(saison, club, joueur) {
    club.groupe = groupeDe(saison, club).filter((j) => j.id !== joueur.id);
    const idxFeuille = (club.effectif || []).findIndex((j) => j.id === joueur.id);
    if (idxFeuille !== -1) {
      const numero = club.effectif[idxFeuille].numero;
      const dejaAlignes = new Set(club.effectif.map((j) => j.id));
      const remplacant = club.groupe
        .filter((j) => !dejaAlignes.has(j.id) && j.poste === joueur.poste)
        .sort((a, b) => niveauJoueur(b) - niveauJoueur(a))[0]
        || club.groupe.filter((j) => !dejaAlignes.has(j.id))
          .sort((a, b) => niveauJoueur(b) - niveauJoueur(a))[0];
      if (remplacant) club.effectif[idxFeuille] = Object.assign({}, remplacant, { numero });
      else club.effectif.splice(idxFeuille, 1);
    }
  }

  function ajouterAuClub(saison, club, joueur) {
    const groupe = groupeDe(saison, club);
    groupe.push(joueur);
    club.groupe = groupe;
  }

  // --- Le mercato lui-même -------------------------------------------------
  // Chaque club, du plus riche au plus pauvre (celui qui a les moyens sert
  // d'abord — c'est aussi ce qui rend l'ordre déterministe), cherche à
  // renforcer son poste le plus faible en achetant le meilleur joueur
  // cessible du monde à ce poste, dans la limite de son budget.
  function mercatoClubsIA(rng, saison) {
    const clubs = (saison.adversaires || []).slice();
    if (clubs.length < 2) return [];
    const transferts = [];
    const ventes = {}, recrues = {};
    for (const c of clubs) { ventes[c.id] = 0; recrues[c.id] = 0; }

    const ordre = clubs.slice().sort((a, b) => (b.budget || 0) - (a.budget || 0) || (a.id < b.id ? -1 : 1));
    for (const acheteur of ordre) {
      for (let tour = 0; tour < RECRUES_MAX_PAR_CLUB; tour++) {
        const besoin = besoinsDe(saison, acheteur)[0];
        if (!besoin) break;
        const plafond = Math.floor((acheteur.budget || 0) * PART_BUDGET_MAX);
        if (plafond <= 0) break;

        // Le meilleur joueur disponible à ce poste, chez un autre club, qui
        // améliore RÉELLEMENT l'acheteur et qu'il peut payer.
        let meilleur = null;
        for (const vendeur of clubs) {
          if (vendeur.id === acheteur.id) continue;
          if (ventes[vendeur.id] >= VENTES_MAX_PAR_CLUB) continue;
          for (const j of cessiblesDe(saison, vendeur)) {
            if (j.poste !== besoin.poste) continue;
            if (niveauJoueur(j) < besoin.meilleur + GAIN_MINIMAL) continue;
            const prix = prixDe(saison, vendeur, j);
            if (prix > plafond) continue;
            if (!meilleur || niveauJoueur(j) > niveauJoueur(meilleur.joueur)) {
              meilleur = { vendeur, joueur: j, prix };
            }
          }
        }
        if (!meilleur) break;

        // Un club ne cède pas toujours : la probabilité dépend de ce que le
        // joueur représente pour lui. Un club en surplus vend plus volontiers.
        const surplus = cessiblesDe(saison, meilleur.vendeur).filter((j) => j.poste === besoin.poste).length;
        const probaVente = Math.max(0.25, Math.min(0.9, 0.35 + surplus * 0.2));
        if (rng() >= probaVente) break;

        const budgetAcheteurAvant = acheteur.budget || 0;
        const budgetVendeurAvant = meilleur.vendeur.budget || 0;
        acheteur.budget = budgetAcheteurAvant - meilleur.prix;
        meilleur.vendeur.budget = budgetVendeurAvant + meilleur.prix;
        retirerDuClub(saison, meilleur.vendeur, meilleur.joueur);
        ajouterAuClub(saison, acheteur, meilleur.joueur);
        ventes[meilleur.vendeur.id] += 1;
        recrues[acheteur.id] += 1;
        transferts.push({
          joueurId: meilleur.joueur.id, joueurNom: meilleur.joueur.nom, poste: meilleur.joueur.poste,
          age: meilleur.joueur.age,
          deClubId: meilleur.vendeur.id, deClubNom: meilleur.vendeur.nom,
          versClubId: acheteur.id, versClubNom: acheteur.nom,
          montant: meilleur.prix,
          budgetAcheteurAvant, budgetAcheteurApres: acheteur.budget,
          budgetVendeurAvant, budgetVendeurApres: meilleur.vendeur.budget,
        });
      }
    }
    return transferts;
  }

  // --- L'intersaison complète d'un club IA ---------------------------------
  function vieillirClubIA(rng, saison, club) {
    const RMClub = global.RMClub;
    const groupe = groupeDe(saison, club);
    // Un club IA ancien (sauvegarde d'avant P1-29) peut n'avoir qu'une feuille
    // de match : on ne casse rien, on vieillit ce qu'on a.
    const evolution = RMClub.vieillirEffectif(rng, groupe, club.niveauClub != null ? club.niveauClub : 0.5);
    // Les recrues générées par vieillirEffectif n'ont pas encore d'identifiant
    // stable côté monde : on leur en donne un, sinon deux clubs pourraient
    // porter le même id de joueur.
    for (const j of evolution.reste) {
      if (!j.id) j.id = 'adv-' + club.id + '-' + (RMClub.genererProchainIdJoueur
        ? RMClub.genererProchainIdJoueur() : Math.round(rng() * 1e9));
    }
    club.groupe = evolution.reste;
    return evolution;
  }

  // Reconstruit la feuille de match à 15 à partir du groupe réel, par la même
  // fonction que le reste du jeu (rafraichirEffectifAdverse choisit le XV du
  // jour). Ici on se contente d'assurer que `effectif` reste cohérent.
  function resynchroniserFeuille(saison, club) {
    const groupe = groupeDe(saison, club);
    const parId = new Set(groupe.map((j) => j.id));
    const feuille = (club.effectif || []).filter((j) => parId.has(j.id));
    const dejaLa = new Set(feuille.map((j) => j.id));
    const reste = groupe.filter((j) => !dejaLa.has(j.id))
      .sort((a, b) => niveauJoueur(b) - niveauJoueur(a));
    let n = 0;
    while (feuille.length < 15 && n < reste.length) {
      feuille.push(Object.assign({}, reste[n], { numero: feuille.length + 1 }));
      n++;
    }
    for (let i = 0; i < feuille.length; i++) if (feuille[i].numero == null) feuille[i].numero = i + 1;
    club.effectif = feuille;
    // Le banc est recalculé au prochain match (cf. assurerEffectifsAdverses) :
    // le laisser périmé alignerait des joueurs partis.
    club.banc = null;
  }

  // --- Les joueurs libres --------------------------------------------------
  //
  // MESURÉ dans l'économie réelle du jeu : une indemnité de transfert vaut
  // 325 à 711 k€ (calculerPrixDemandeAdverse) alors qu'un club de Ligue
  // Régionale dispose de 246 à 446 k€. À ce niveau, presque personne ne peut
  // acheter — et c'est cohérent, le marché des joueurs libres du jeu ne
  // facture d'ailleurs AUCUNE indemnité, seulement un salaire.
  //
  // On ne gonfle donc pas les budgets pour faire semblant : comme dans le vrai
  // rugby amateur et semi-pro, l'essentiel du mercato se joue sur les FINS DE
  // CONTRAT. Un joueur dont le contrat s'achève quitte son club et devient
  // libre ; un autre club le récupère sans indemnité. Les transferts payants
  // existent aussi, mais seulement quand un club peut réellement se les
  // offrir — donc surtout dans les divisions supérieures.
  function recruterJoueursLibres(rng, saison, libres) {
    const mouvements = [];
    if (!libres.length) return mouvements;
    const clubs = (saison.adversaires || []).slice()
      // Les clubs les plus attractifs (meilleur niveau sportif) servent en
      // premier — ordre déterministe, jamais un tirage.
      .sort((a, b) => (b.niveauClub || 0) - (a.niveauClub || 0) || (a.id < b.id ? -1 : 1));
    for (const club of clubs) {
      for (let tour = 0; tour < RECRUES_MAX_PAR_CLUB; tour++) {
        const besoin = besoinsDe(saison, club)[0];
        if (!besoin) break;
        // Le meilleur joueur libre à ce poste, s'il améliore RÉELLEMENT le
        // club — un club ne signe pas un joueur plus faible que ce qu'il a.
        let idx = -1;
        for (let i = 0; i < libres.length; i++) {
          const j = libres[i].joueur;
          if (j.poste !== besoin.poste) continue;
          if (niveauJoueur(j) < besoin.meilleur + GAIN_MINIMAL) continue;
          if (idx === -1 || niveauJoueur(j) > niveauJoueur(libres[idx].joueur)) idx = i;
        }
        if (idx === -1) break;
        const pris = libres.splice(idx, 1)[0];
        const j = pris.joueur;
        // Un joueur libre signe un nouveau contrat : sans ça il repartirait
        // immédiatement à la fin de l'intersaison suivante.
        j.contrat = 2 + Math.floor(rng() * 2);
        ajouterAuClub(saison, club, j);
        // Un club qui reprend SON propre joueur en fin de contrat ne le
        // « transfère » pas : il le prolonge. On ne fait pas passer une
        // prolongation pour un mouvement de marché.
        mouvements.push({
          type: pris.clubId === club.id ? 'prolongation' : 'libre',
          joueurId: j.id, joueurNom: j.nom, poste: j.poste, age: j.age,
          deClubId: pris.clubId, deClubNom: pris.clubNom,
          versClubId: club.id, versClubNom: club.nom,
          montant: 0,
        });
      }
    }
    return mouvements;
  }

  // Point d'entrée unique de l'intersaison des clubs IA, appelé par
  // avancerSaison. Retourne de quoi informer le manager avec des faits RÉELS.
  function avancerIntersaisonClubsIA(rng, saison) {
    const retraites = [];
    const libres = [];
    for (const club of (saison.adversaires || [])) {
      const evolution = vieillirClubIA(rng, saison, club);
      for (const p of evolution.partis) {
        if (p.motif === 'retraite') { retraites.push({ club: club.nom, nom: p.nom, poste: p.poste }); continue; }
        // Fin de contrat : le joueur ne DISPARAÎT pas, il devient libre.
        if (p.joueur) libres.push({ joueur: p.joueur, clubId: club.id, clubNom: club.nom });
      }
    }
    const signatures = recruterJoueursLibres(rng, saison, libres);
    const signaturesLibres = signatures.filter((t) => t.type === 'libre');
    const prolongations = signatures.filter((t) => t.type === 'prolongation');
    const transferts = mercatoClubsIA(rng, saison);
    // Les vendeurs et les clubs qui n'ont pas trouvé sur le marché ont un
    // trou à combler : ils promeuvent un jeune, comme le club du joueur le
    // fait pour ses propres départs.
    for (const club of (saison.adversaires || [])) {
      completerGroupe(rng, saison, club);
      resynchroniserFeuille(saison, club);
    }
    const mouvements = signaturesLibres.concat(transferts);
    const mercato = {
      saison: saison.numero || 1,
      mouvements, transferts, signaturesLibres, prolongations, retraites,
      // Joueurs libres que personne n'a voulu : ils quittent réellement le
      // monde (fin de carrière), on ne fait pas semblant qu'ils existent.
      nonRetenus: libres.length,
    };
    saison.mercato = mercato;
    return mercato;
  }

  // Résumé lisible, construit UNIQUEMENT à partir des mouvements réellement
  // survenus — jamais un texte générique. Le manager voit qui a bougé chez
  // ses rivaux et pour combien.
  function messageMercato(saison, mercato) {
    const RMClub = global.RMClub;
    if (!mercato || (!mercato.mouvements.length && !mercato.retraites.length)) return null;
    const lignes = [];
    if (mercato.mouvements.length) {
      lignes.push(`${mercato.mouvements.length} mouvement(s) chez tes rivaux :`);
      for (const t of mercato.mouvements.slice(0, 8)) {
        const prix = t.montant > 0 ? `pour ${t.montant} k€` : 'libre';
        lignes.push(`• ${t.joueurNom} (${t.poste}, ${t.age} ans) : ${t.deClubNom} → ${t.versClubNom} (${prix})`);
      }
      if (mercato.mouvements.length > 8) lignes.push(`• …et ${mercato.mouvements.length - 8} autre(s).`);
    }
    if (mercato.retraites.length) {
      lignes.push(`${mercato.retraites.length} joueur(s) ont pris leur retraite dans la division.`);
    }
    const corps = lignes.join('\n');
    RMClub.ajouterMessage(saison, 'transfert', 'Mercato de la division', corps);
    return corps;
  }

  global.RMClub = Object.assign(global.RMClub || {}, {
    PART_BUDGET_MAX_MERCATO: PART_BUDGET_MAX,
    RECRUES_MAX_PAR_CLUB, VENTES_MAX_PAR_CLUB,
    besoinsDe, cessiblesDe, completerGroupe, mercatoClubsIA,
    avancerIntersaisonClubsIA, messageMercato,
  });
})(window);
