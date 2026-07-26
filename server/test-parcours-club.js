// Tests du parcours principal du Mode Club (couche données, sans navigateur),
// même esprit que server/test-invariants.js — assertions ciblées, pas un
// framework de test. Couvre le minimum demandé pour un vrai parcours de
// gestion : création/chargement d'une carrière, sauvegarde/rechargement,
// composition valide, recrutement, progression d'une journée, consultation
// d'un club adverse, fin de saison. Usage : node server/test-parcours-club.js
'use strict';

const assert = require('assert');

global.window = global;
global.localStorage = (() => {
  let store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
})();

global.window.RugbyEngine = require('../docs/rugby-engine.js');
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club.js'), 'utf8'))(global.window);
// club-personnel.js (TODO_AUDIT.md P2-10) : domaine extrait de club.js, à
// charger de la même façon (ordre indifférent, fusion via Object.assign).
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-personnel.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-objectif.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-analyse.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-prets.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-contrats.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-equipe-b.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-transferts.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-transferts-internationaux.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-generation-joueurs.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-centre-formation.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-composition.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-condition-joueurs.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-pyramide.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-calendrier.js'), 'utf8'))(global.window);
const RMClub = global.window.RMClub;

function creerRng(graine) {
  let s = graine >>> 0 || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

let nbTests = 0;
function test(nom, fn) {
  nbTests++;
  try {
    fn();
    console.log(`OK   ${nom}`);
  } catch (e) {
    console.error(`FAIL ${nom}`);
    console.error(e);
    process.exitCode = 1;
  }
}

// --- 1) Création et chargement d'une carrière ---
let saison;
test('création de carrière : club du joueur débute en Ligue Régionale, avec une vraie division de 14 clubs et un calendrier complet', () => {
  const rng = creerRng(1);
  saison = RMClub.nouvelleSaison(rng, 'Club de Test');
  assert.strictEqual(saison.clubJoueur.nom, 'Club de Test');
  assert.strictEqual(saison.adversaires.length, RMClub.TAILLE_DIVISION_FRANCE[3] - 1, 'Ligue Régionale : 14 clubs au total, dont le club du joueur');
  assert.strictEqual(saison.clubJoueur.effectif.length, RMClub.TAILLE_EFFECTIF_CIBLE);
  assert.ok(saison.calendrier.length > 0);
  assert.deepStrictEqual(saison.clubJoueur.messages, []);
});

// --- 2) Sauvegarde et rechargement ---
test('sauvegarde puis rechargement : la carrière survit à un rechargement de page', () => {
  const ok = RMClub.sauvegarderSaison(saison);
  assert.strictEqual(ok, true);
  const rechargee = RMClub.chargerSaison();
  assert.ok(rechargee);
  assert.strictEqual(rechargee.clubJoueur.nom, saison.clubJoueur.nom);
  assert.strictEqual(rechargee.clubJoueur.effectif.length, saison.clubJoueur.effectif.length);
});

// --- 3) Composition valide ---
test('composition : auto-remplissage produit toujours une équipe complète et valide', () => {
  const c = saison.clubJoueur;
  c.compositionTitulaires = RMClub.completerComposition(c.effectif, {});
  c.compositionBanc = RMClub.completerCompositionBanc(c.effectif, c.compositionTitulaires, {});
  const manquants = RMClub.validerComposition(c.compositionTitulaires);
  assert.strictEqual(manquants.length, 0, `postes manquants : ${JSON.stringify(manquants)}`);
  assert.strictEqual(Object.keys(c.compositionTitulaires).length, 15);
  const idsUniques = new Set(Object.values(c.compositionTitulaires));
  assert.strictEqual(idsUniques.size, 15, 'un même joueur ne doit jamais occuper deux numéros à la fois');
});

test('composition : prêter le dernier joueur disponible à un poste est refusé (rendrait la composition invalide)', () => {
  const c = saison.clubJoueur;
  const piliers = c.effectif.filter((j) => j.poste === 'P' && !j.pret);
  // Prête tous les piliers sauf un.
  for (let i = 0; i < piliers.length - 1; i++) {
    const r = RMClub.preterJoueur(saison, piliers[i].id, 3);
    assert.strictEqual(r.ok, true);
  }
  const dernier = piliers[piliers.length - 1];
  const refus = RMClub.preterJoueur(saison, dernier.id, 3);
  assert.strictEqual(refus.ok, false);
  assert.strictEqual(refus.motif, 'dernier_du_poste');
  // Rappelle tout pour ne pas fausser les tests suivants.
  for (const p of piliers) RMClub.rappelerJoueur(saison, p.id);
  c.compositionTitulaires = RMClub.completerComposition(c.effectif, {});
  assert.strictEqual(RMClub.validerComposition(c.compositionTitulaires).length, 0);
});

// --- 4) Recrutement ---
test('recrutement : signer un joueur du marché débite le budget et l\'ajoute à l\'effectif', () => {
  const c = saison.clubJoueur;
  const avantEffectif = c.effectif.length;
  const avantBudget = c.budget;
  const cible = saison.marche.slice().sort((a, b) => a.prixTransfert - b.prixTransfert)[0];
  const res = RMClub.signerJoueur(saison, cible.id);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(c.effectif.length, avantEffectif + 1);
  assert.strictEqual(c.budget, avantBudget - res.coutTotal);
  assert.ok(c.effectif.some((j) => j.id === cible.id));
});

// --- 4b) Transfert international : approcher un joueur d'un club ADVERSE
// (pas seulement le marché des joueurs libres) ---
test('transfert international : une offre dérisoire est refusée sans effet de bord', () => {
  const adv = saison.adversaires[0];
  const avantAdv = adv.effectif.length, avantMoi = saison.clubJoueur.effectif.length;
  const refus = RMClub.approcherJoueurAdverse(() => 0.99, saison, adv.id, 0, 1);
  assert.strictEqual(refus.ok, false);
  assert.strictEqual(refus.motif, 'refuse');
  assert.strictEqual(adv.effectif.length, avantAdv);
  assert.strictEqual(saison.clubJoueur.effectif.length, avantMoi);
});

test('transfert international : une offre acceptée débite le budget, transfère le joueur et laisse l\'adversaire à 15', () => {
  const adv = saison.adversaires[1];
  const cible = adv.effectif[2];
  const prixDemande = RMClub.calculerPrixDemandeAdverse(cible, adv);
  saison.clubJoueur.budget = prixDemande * 3; // s'assure que le budget n'est pas le facteur limitant ici
  const budgetAvant = saison.clubJoueur.budget;
  const montant = prixDemande * 2;
  const res = RMClub.approcherJoueurAdverse(() => 0.01, saison, adv.id, 2, montant);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.joueur.nom, cible.nom);
  assert.strictEqual(saison.clubJoueur.budget, budgetAvant - montant);
  assert.ok(saison.clubJoueur.effectif.some((j) => j.id === res.joueur.id && j.contrat != null));
  assert.strictEqual(adv.effectif.length, 15, 'le club adverse recrute immédiatement un remplaçant du même numéro');
  assert.strictEqual(saison.clubJoueur.messages[0].categorie, 'transfert');
  const compo = RMClub.completerComposition(saison.clubJoueur.effectif, {});
  assert.strictEqual(RMClub.validerComposition(compo).length, 0, 'le joueur transféré reste utilisable en composition');
});

// --- 4c) Scénarios négatifs (TODO_AUDIT.md P1-7) : budget insuffisant,
// dernier joueur d'un poste, joueur déjà transféré/prêté, action répétée
// (double clic / rejouée) — chaque garde doit refuser proprement, sans
// aucun effet de bord (budget/effectif inchangés), plutôt que planter ou
// corrompre silencieusement l'état de la carrière. ---
test('recrutement : signer un joueur du marché est refusé si le budget est insuffisant (aucun effet de bord)', () => {
  const c = saison.clubJoueur;
  const cible = saison.marche[0];
  const budgetAvant = (c.budget = 0); // budget insuffisant, quel que soit le prix du joueur
  const avantEffectif = c.effectif.length, avantMarche = saison.marche.length;
  const res = RMClub.signerJoueur(saison, cible.id);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.motif, 'budget');
  assert.strictEqual(c.budget, budgetAvant, 'un refus ne doit jamais débiter le budget');
  assert.strictEqual(c.effectif.length, avantEffectif, 'un refus ne doit jamais ajouter le joueur à l\'effectif');
  assert.strictEqual(saison.marche.length, avantMarche, 'un refus ne doit jamais retirer le joueur du marché');
  assert.ok(saison.marche.some((j) => j.id === cible.id), 'le joueur refusé doit rester disponible sur le marché');
  c.budget = 100000; // restaure un budget confortable pour la suite des tests
});

test('transfert international : une offre est refusée pour budget insuffisant, distinct d\'un refus pour prix trop bas', () => {
  const adv = saison.adversaires[2];
  const budgetAvant = (saison.clubJoueur.budget = 5);
  const avantMoi = saison.clubJoueur.effectif.length, avantAdv = adv.effectif.length;
  // Offre largement supérieure au budget disponible (donc pas "dérisoire" :
  // le refus doit venir du budget, pas d'un tirage de probabilité d'acceptation).
  const res = RMClub.approcherJoueurAdverse(() => 0.01, saison, adv.id, 3, 500);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.motif, 'budget');
  assert.strictEqual(saison.clubJoueur.budget, budgetAvant);
  assert.strictEqual(saison.clubJoueur.effectif.length, avantMoi);
  assert.strictEqual(adv.effectif.length, avantAdv, 'le club adverse ne doit pas générer de remplaçant pour une offre refusée côté budget');
  saison.clubJoueur.budget = 100000;
});

test('effectif : libérer le dernier joueur disponible à un poste est refusé (rendrait la composition invalide)', () => {
  const c = saison.clubJoueur;
  const poste = c.effectif[0].poste;
  const memePoste = c.effectif.filter((j) => j.poste === poste);
  for (const j of memePoste.slice(1)) RMClub.libererJoueur(saison, j.id);
  const dernier = c.effectif.filter((j) => j.poste === poste);
  assert.strictEqual(dernier.length, 1, 'scénario de test : un seul joueur restant à ce poste');
  const avantEffectif = c.effectif.length;
  const refus = RMClub.libererJoueur(saison, dernier[0].id);
  assert.strictEqual(refus.ok, false);
  assert.strictEqual(refus.motif, 'dernier_du_poste');
  assert.strictEqual(c.effectif.length, avantEffectif, 'le dernier joueur du poste doit rester dans l\'effectif après le refus');
});

test('prêt : prêter un joueur déjà prêté est refusé (pas de double prêt / double indemnité)', () => {
  const c = saison.clubJoueur;
  const poste = c.effectif.find((j) => j.poste === 'pilier' && !j.pret) ? 'pilier' : c.effectif[1].poste;
  const candidats = c.effectif.filter((j) => j.poste === poste && !j.pret);
  if (candidats.length < 2) return; // scénario non applicable après les libérations du test précédent
  const joueur = candidats[0];
  const premierPret = RMClub.preterJoueur(saison, joueur.id, 3);
  assert.strictEqual(premierPret.ok, true);
  const budgetApresPremierPret = c.budget;
  const rePret = RMClub.preterJoueur(saison, joueur.id, 3);
  assert.strictEqual(rePret.ok, false);
  assert.strictEqual(rePret.motif, 'deja_prete');
  assert.strictEqual(c.budget, budgetApresPremierPret, 'un second prêt refusé ne doit pas générer une seconde indemnité');
  RMClub.rappelerJoueur(saison, joueur.id); // remet le joueur à disposition pour la suite des tests
});

test('recrutement : signer deux fois le même joueur du marché (double clic / action répétée) ne débite le budget qu\'une seule fois', () => {
  const c = saison.clubJoueur;
  c.budget = 100000;
  const cible = saison.marche[0];
  const budgetAvant = c.budget;
  const premiereSignature = RMClub.signerJoueur(saison, cible.id);
  assert.strictEqual(premiereSignature.ok, true);
  const budgetApresPremiereSignature = c.budget;
  const occurrencesApresPremiereSignature = c.effectif.filter((j) => j.id === cible.id).length;
  assert.strictEqual(occurrencesApresPremiereSignature, 1);
  // Rejoue exactement la même action (ex. double clic avant le rafraîchissement
  // de la liste, ou nouvel essai après un rechargement qui n'aurait pas
  // rafraîchi l'affichage du marché) : le joueur n'est plus sur le marché,
  // le second appel doit être refusé proprement, jamais dupliquer l'effectif
  // ni débiter le budget une seconde fois.
  const secondeSignature = RMClub.signerJoueur(saison, cible.id);
  assert.strictEqual(secondeSignature.ok, false);
  assert.strictEqual(secondeSignature.motif, 'introuvable');
  assert.strictEqual(c.budget, budgetApresPremiereSignature, 'la seconde tentative ne doit pas débiter le budget une seconde fois');
  assert.strictEqual(c.effectif.filter((j) => j.id === cible.id).length, 1, 'le joueur ne doit jamais apparaître deux fois dans l\'effectif');
  assert.notStrictEqual(budgetAvant, budgetApresPremiereSignature);
});

test('saison terminée : une fois toutes les journées jouées, aucune prochaine rencontre n\'est renvoyée (pas de journée fantôme)', () => {
  const calendrierTest = saison.calendrier.map((f) => Object.assign({}, f, { joue: true }));
  const saisonTerminee = Object.assign({}, saison, { calendrier: calendrierTest });
  assert.deepStrictEqual(RMClub.prochainesFixtures(saisonTerminee), []);
});

// --- 5) Progression d'une journée (le match du club du joueur) ---
test('progression d\'une journée : résultat enregistré, finances/fatigue/moral/entraînement appliqués', () => {
  const c = saison.clubJoueur;
  c.compositionTitulaires = RMClub.completerComposition(c.effectif, c.compositionTitulaires);
  c.compositionBanc = RMClub.completerCompositionBanc(c.effectif, c.compositionTitulaires, {});
  const fixture = saison.calendrier.find((f) => f.domicileId === c.id || f.exterieurId === c.id);
  assert.ok(fixture);
  const budgetAvant = c.budget;
  RMClub.enregistrerResultat(saison, fixture.id, 24, 10, 3, 1);
  assert.strictEqual(fixture.joue, true);
  const mouvement = RMClub.appliquerFinancesMatch(c, 'v');
  RMClub.enregistrerMouvementFinances(c, fixture.journee, mouvement);
  assert.notStrictEqual(c.budget, budgetAvant);
  const rng = creerRng(2);
  RMClub.faireProgresserBlessures(rng, c.effectif, c.compositionTitulaires, 1, saison);
  RMClub.appliquerFatigue(c.effectif, c.compositionTitulaires, 1);
  RMClub.appliquerMoral(c.effectif, c.compositionTitulaires, 'v');
  RMClub.progresserPrets(c.effectif);
  RMClub.appliquerEntrainement(rng, c.effectif, c.entrainementFocus, 1);
  const titulaireId = Object.values(c.compositionTitulaires)[0];
  const titulaire = c.effectif.find((j) => j.id === titulaireId);
  assert.ok(titulaire.fatigue > 0, 'un titulaire ayant joué doit avoir accumulé de la fatigue');
  const adversaireId = fixture.domicileId === c.id ? fixture.exterieurId : fixture.domicileId;
  RMClub.enregistrerResultatClubJoueur(saison, adversaireId, 24, 10, fixture.journee);
  assert.strictEqual(c.messages[0].categorie, 'match');
  assert.strictEqual(c.historiqueConfrontations[adversaireId].length, 1);
});

// --- 6) Affichage d'un club adverse ---
test('club adverse : identité, effectif complet et analyse comparative disponibles', () => {
  const adversaireId = saison.adversaires[0].id;
  const adv = RMClub.club(saison, adversaireId);
  assert.ok(adv);
  assert.strictEqual(adv.effectif.length, 15);
  assert.ok(adv.budget != null);
  const analyse = RMClub.analyserAdversaire(saison, adversaireId, 6);
  assert.ok(analyse);
  assert.strictEqual(analyse.comparaison.length, 7);
  assert.ok(Array.isArray(analyse.confrontations));
});

// --- 7) Fin de saison ---
test('fin de saison : vieillissement/renouvellement d\'effectif, archive et remise à zéro de la composition', () => {
  const c = saison.clubJoueur;
  const numeroAvant = saison.numero;
  const nbAdversairesAvant = saison.adversaires.length;
  // Force une position bien milieu de tableau (ni promotion ni relégation) :
  // ce test vérifie la conservation d'IDENTITÉ des adversaires en l'absence
  // de changement de palier, pas la mécanique de montée/descente elle-même
  // (couverte séparément par les tests "pyramide"), donc doit rester
  // déterministe plutôt que dépendre du classement réel déjà accumulé.
  const idsClassement = Object.keys(saison.classement);
  idsClassement.forEach((id, i) => { saison.classement[id].pts = 100 - i; });
  const milieu = idsClassement[Math.floor(idsClassement.length / 2)];
  [saison.classement[saison.clubJoueur.id].pts, saison.classement[milieu].pts] =
    [saison.classement[milieu].pts, saison.classement[saison.clubJoueur.id].pts];
  const rng = creerRng(3);
  const { partis, arrivees } = RMClub.avancerSaison(rng, saison);
  assert.strictEqual(saison.numero, numeroAvant + 1);
  assert.strictEqual(c.effectif.length, RMClub.TAILLE_EFFECTIF_CIBLE);
  assert.strictEqual(c.compositionTitulaires, null, 'la composition doit être remise à zéro (effectif renouvelé)');
  assert.ok(c.historiqueSaisons.length >= 1);
  assert.ok(Array.isArray(partis) && Array.isArray(arrivees));
  assert.strictEqual(saison.adversaires.length, nbAdversairesAvant, 'identité des adversaires conservée (pas régénérée de zéro) en l\'absence de changement de palier');
  assert.ok(saison.adversaires.every((a) => a.budget != null && a.effectif.length === 15));
  // La saison suivante doit rester jouable derechef.
  const compo = RMClub.completerComposition(c.effectif, {});
  assert.strictEqual(RMClub.validerComposition(compo).length, 0);
});

// --- 8) Objectif de la saison / confiance du président ---
test('objectif de la saison : bilan réel en fin de saison, confiance ajustée, nouvel objectif fixé', () => {
  const c = saison.clubJoueur;
  assert.ok(c.objectifSaison, 'un objectif doit déjà être fixé pour la saison en cours (saison 2, après le test précédent)');
  assert.ok(c.confiancePresident >= 0 && c.confiancePresident <= 100);
  // Force un classement connu : le club du joueur termine dernier.
  const nbClubsLigue = Object.keys(saison.classement).length;
  for (const id of Object.keys(saison.classement)) saison.classement[id].pts = 999;
  saison.classement[c.id].pts = 0;
  const confianceAvant = c.confiancePresident;
  RMClub.avancerSaison(creerRng(4), saison);
  assert.strictEqual(c.historiqueSaisons[c.historiqueSaisons.length - 1].position, nbClubsLigue, 'dernière place bien archivée');
  assert.ok(c.confiancePresident < confianceAvant, 'objectif manqué largement : la confiance doit baisser');
  assert.ok(c.messages.some((m) => m.titre.startsWith('Objectif manqué')));
  assert.ok(c.objectifSaison.position >= c.objectifSaison.totalClubs - 1, 'nouvel objectif de maintien après une dernière place');
});

// --- 9) Négociation de contrat ---
test('négociation de contrat : une offre dérisoire est refusée, fait baisser le moral, ne change rien au contrat', () => {
  const joueur = saison.clubJoueur.effectif[0];
  const contratAvant = joueur.contrat, salaireAvant = joueur.salaire;
  const moralAvant = joueur.moral;
  const offre = RMClub.calculerOffreRenouvellement(joueur);
  const res = RMClub.negocierRenouvellement(() => 0.99, saison, joueur.id, 1, offre.dureeMax);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.motif, 'refuse');
  assert.ok(res.salaireMinimumEstime > 0);
  assert.strictEqual(joueur.contrat, contratAvant, 'un refus ne modifie pas le contrat en cours');
  assert.strictEqual(joueur.salaire, salaireAvant, 'un refus ne modifie pas le salaire en cours');
  assert.ok(joueur.moral < moralAvant, 'une offre dérisoire refusée frustre le joueur (moral en baisse)');
});

test('négociation de contrat : une offre généreuse acceptée met à jour contrat/salaire et améliore le moral', () => {
  const joueur = saison.clubJoueur.effectif[1];
  joueur.moral = 50;
  const offre = RMClub.calculerOffreRenouvellement(joueur);
  const montant = Math.round(offre.salaire * 1.3);
  const res = RMClub.negocierRenouvellement(() => 0.01, saison, joueur.id, montant, offre.dureeMax);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(joueur.contrat, offre.dureeMax);
  assert.strictEqual(joueur.salaire, montant);
  assert.ok(joueur.moral > 50, 'une offre généreuse acceptée redonne confiance au joueur');
  assert.ok(saison.clubJoueur.messages.some((m) => m.titre === 'Contrat renouvelé'));
});

// --- 10) Centre de formation (espoirs promouvables en équipe première) ---
test('centre de formation : le club en dispose dès la création, avec assez d\'espoirs par ligne de poste pour aligner une équipe B complète à lui seul', () => {
  const c = saison.clubJoueur;
  assert.ok(Array.isArray(c.jeunes) && c.jeunes.length > 0, 'un centre de formation doit exister dès la création du club');
  // Quota dérivé de POSTE_REQUIS (2 piliers, 2 deuxième ligne, 3 troisième
  // ligne, 2 centres, 2 ailiers...) — pas seulement "au moins un par poste" :
  // le centre de formation doit pouvoir fournir une équipe B complète à lui
  // seul, même sans aucune réserve pro senior disponible ce jour-là.
  const quotas = { P: 2, T: 1, '2L': 2, '3L': 3, DM: 1, OV: 1, CE: 2, AI: 2, AR: 1 };
  for (const [poste, quota] of Object.entries(quotas)) {
    const compte = c.jeunes.filter((j) => j.poste === poste).length;
    assert.ok(compte >= quota, `poste ${poste} : ${compte} espoir(s), quota attendu ${quota}`);
  }
  assert.strictEqual(c.jeunes.length, 15, 'centre de formation à quota plein');
  // Le pool a déjà traversé 2 changements de saison (tests précédents) :
  // un espoir non promu ne dépasse jamais 19 ans (cf. progresserCentreFormation).
  for (const j of c.jeunes) assert.ok(j.age <= 19, `un espoir du centre de formation ne doit jamais dépasser 19 ans (${j.nom} a ${j.age} ans)`);
});

test('centre de formation : promouvoir un espoir le fait quitter le vivier et rejoindre l\'effectif pro, utilisable en composition', () => {
  const c = saison.clubJoueur;
  const jeune = c.jeunes[0];
  const effectifAvant = c.effectif.length, jeunesAvant = c.jeunes.length;
  const res = RMClub.promouvoirJeune(saison, jeune.id);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(c.effectif.length, effectifAvant + 1);
  assert.strictEqual(c.jeunes.length, jeunesAvant - 1);
  assert.ok(c.effectif.some((j) => j.id === jeune.id), 'l\'espoir promu doit être dans l\'effectif pro');
  assert.ok(!c.jeunes.some((j) => j.id === jeune.id), 'l\'espoir promu ne doit plus être dans le centre de formation');
  assert.ok(c.messages.some((m) => m.titre === 'Promotion en équipe première'));
  const compo = RMClub.completerComposition(c.effectif, {});
  assert.strictEqual(RMClub.validerComposition(compo).length, 0, 'un espoir promu reste un joueur normal, sélectionnable en composition');
});

test('centre de formation : rétrocompatibilité — une sauvegarde antérieure sans champ "jeunes" ne plante pas et se reconstitue', () => {
  const c = saison.clubJoueur;
  delete c.jeunes;
  const rng = creerRng(9);
  let jeunes;
  assert.doesNotThrow(() => { jeunes = RMClub.assurerCentreFormation(rng, saison); });
  assert.ok(Array.isArray(jeunes) && jeunes.length > 0);
  assert.strictEqual(c.jeunes, jeunes, 'le centre de formation reconstitué doit être persisté sur clubJoueur.jeunes');
});

test('centre de formation : vieillit à chaque fin de saison, un espoir non promu de plus de 19 ans quitte le club', () => {
  const c = saison.clubJoueur;
  RMClub.assurerCentreFormation(creerRng(11), saison);
  // Force un espoir à 19 ans : la prochaine fin de saison doit le faire partir.
  const cible = c.jeunes[0];
  cible.age = 19;
  const nomCible = cible.nom;
  const poste = cible.poste;
  RMClub.avancerSaison(creerRng(12), saison);
  assert.ok(!c.jeunes.some((j) => j.nom === nomCible && j.poste === poste), 'un espoir de plus de 19 ans doit quitter le centre de formation');
  assert.ok(c.jeunes.some((j) => j.poste === poste), 'la ligne de poste laissée vacante doit être reconstituée');
  assert.ok(c.messages.some((m) => m.categorie === 'jeunes' && m.corps.includes(nomCible)));
});

// --- 11) Équipe B (championnat réservé aux clubs les plus riches) ---
test('équipe B : éligibilité pair, cohérente avec le nombre de clubs, calendrier/classement bien formés', () => {
  const c = saison.clubJoueur;
  assert.ok(saison.competitionB, 'competitionB doit être généré dès la création (via nouvelleSaison)');
  const nbClubs = 1 + saison.adversaires.length;
  assert.strictEqual(saison.competitionB.eligibles.length % 2, 0, 'un nombre pair de clubs éligibles (round-robin par paires)');
  assert.ok(saison.competitionB.eligibles.length >= 2 && saison.competitionB.eligibles.length <= nbClubs);
  const idsValides = new Set([c.id, ...saison.adversaires.map((a) => a.id)]);
  for (const f of saison.competitionB.calendrier) {
    assert.ok(idsValides.has(f.domicileId) && idsValides.has(f.exterieurId), 'chaque rencontre B implique deux clubs réels');
    assert.notStrictEqual(f.domicileId, f.exterieurId, 'un club ne joue jamais contre lui-même');
    assert.ok(saison.competitionB.eligibles.includes(f.domicileId) && saison.competitionB.eligibles.includes(f.exterieurId));
  }
  assert.strictEqual(Object.keys(saison.competitionB.classement).length, saison.competitionB.eligibles.length);
  // Le championnat principal (6 clubs) reste totalement indépendant.
  assert.strictEqual(RMClub.classementTrie(saison).length, nbClubs);
});

test('équipe B : les plus riches clubs sont bien ceux retenus (tri par budget décroissant)', () => {
  const tousLesClubs = [saison.clubJoueur, ...saison.adversaires];
  const eligibles = RMClub.determinerEligiblesEquipeB(tousLesClubs);
  const budgetMinEligible = Math.min(...eligibles.map((c) => c.budget));
  const nonEligibles = tousLesClubs.filter((c) => !eligibles.some((e) => e.id === c.id));
  for (const c of nonEligibles) assert.ok(c.budget <= budgetMinEligible, `${c.nom} non éligible devrait avoir un budget <= au plus petit budget éligible`);
});

test('équipe B : le vivier disponible exclut titulaires/banc du jour, blessés et prêtés, inclut le centre de formation', () => {
  const c = saison.clubJoueur;
  c.compositionTitulaires = RMClub.completerComposition(c.effectif, {});
  c.compositionBanc = RMClub.completerCompositionBanc(c.effectif, c.compositionTitulaires, {});
  const convoques = new Set([...Object.values(c.compositionTitulaires), ...Object.values(c.compositionBanc)]);
  const pool = RMClub.effectifDisponiblePourEquipeB(saison);
  for (const j of pool) {
    if (c.effectif.includes(j)) assert.ok(!convoques.has(j.id), `${j.nom} est convoqué en premier XV/banc aujourd'hui, ne devrait pas apparaître dans le vivier B`);
  }
  for (const j of c.effectif) {
    if (convoques.has(j.id)) assert.ok(!pool.includes(j), `${j.nom} convoqué aujourd'hui ne doit pas être dans le vivier B`);
  }
  for (const j of (c.jeunes || [])) assert.ok(pool.includes(j), `${j.nom} (centre de formation) doit faire partie du vivier B`);
});

test('équipe B : jouer un match met à jour le classement B, les stats des joueurs alignés, sans toucher au championnat principal', () => {
  const c = saison.clubJoueur;
  // Force le club du joueur dans une compétition B à 2 (lui + un adversaire),
  // pour un scénario entièrement déterministe.
  const adversaireB = saison.adversaires[0];
  const tousLesClubs = [c, adversaireB];
  saison.competitionB = RMClub.genererCompetitionB(tousLesClubs);
  const fixture = saison.competitionB.calendrier[0];
  const pool = RMClub.effectifDisponiblePourEquipeB(saison);
  const composition = RMClub.meilleureComposition(pool);
  assert.strictEqual(RMClub.validerComposition(composition).length, 0, 'le vivier (réservistes + centre de formation) doit permettre une composition complète');
  const joueurAligne = pool.find((j) => Object.values(composition).includes(j.id));
  const matchsAvant = joueurAligne.matchsJoues || 0, fatigueAvant = joueurAligne.fatigue || 0;
  const classementMainAvant = JSON.stringify(saison.classement);
  RMClub.enregistrerResultatEquipeB(saison, fixture.id, 24, 10, 3, 1);
  RMClub.appliquerEffetsMatchEquipeB(saison, composition);
  assert.strictEqual(fixture.joue, true);
  const ligne = RMClub.classementTrieDe(saison.competitionB.classement).find((r) => r.clubId === fixture.domicileId);
  assert.ok(ligne.j >= 1, 'le classement B doit refléter le match joué');
  assert.strictEqual(joueurAligne.matchsJoues, matchsAvant + 1, 'un joueur aligné en équipe B doit voir son compteur de matchs progresser');
  assert.ok(joueurAligne.fatigue > fatigueAvant, 'jouer un match B fatigue réellement le joueur');
  assert.strictEqual(JSON.stringify(saison.classement), classementMainAvant, 'le championnat principal ne doit jamais être affecté par un résultat B');
});

test('équipe B : un match rapporte une petite recette de billetterie, sans redéduire les salaires (déjà comptés via le premier XV)', () => {
  const c = saison.clubJoueur;
  const budgetAvant = c.budget;
  const mouvement = RMClub.appliquerFinancesMatchEquipeB(c, 'v');
  assert.strictEqual(c.budget, budgetAvant + mouvement.recette, 'la recette doit créditer directement le budget');
  assert.ok(mouvement.recette > 0);
  assert.strictEqual(mouvement.salaires, 0, 'les salaires ne doivent jamais être redéduits pour un match B (déjà comptés une fois par journée)');
  assert.strictEqual(mouvement.source, 'equipeB');
  const mouvementDefaite = RMClub.appliquerFinancesMatchEquipeB(Object.assign({}, c, { budget: 0 }), 'd');
  assert.ok(mouvementDefaite.recette < mouvement.recette, 'une victoire rapporte davantage qu\'une défaite, comme le championnat principal');
  const historiqueAvant = (c.historiqueFinances || []).length;
  RMClub.enregistrerMouvementFinances(c, 7, mouvement);
  assert.strictEqual(c.historiqueFinances.length, historiqueAvant + 1);
  assert.strictEqual(c.historiqueFinances[c.historiqueFinances.length - 1].source, 'equipeB', 'le journal financier doit distinguer un mouvement Équipe B du championnat principal');
});

test('équipe B : rétrocompatibilité — une sauvegarde antérieure sans champ "competitionB" se reconstitue sans planter', () => {
  delete saison.competitionB;
  let compB;
  assert.doesNotThrow(() => { compB = RMClub.assurerCompetitionB(saison); });
  assert.ok(compB && Array.isArray(compB.eligibles) && compB.eligibles.length >= 2);
  assert.strictEqual(saison.competitionB, compB, 'doit être persisté sur saison.competitionB');
});

// --- 11b) Points de bonus (offensif : 4 essais ou plus ; défensif : défaite
// par 7 points ou moins) — règle standard du rugby professionnel, absente
// jusqu'ici du classement (victoire/nul/défaite = 4/2/0 uniquement). ---
test('points de bonus : une victoire nette sans bonus offensif ni défensif ne rapporte que 4 points', () => {
  const clubA = { id: 'ba1', budget: 100 };
  const clubB = { id: 'ba2', budget: 100 };
  const classement = RMClub.classementInitial([clubA, clubB]);
  const calendrier = [{ id: 'fx1', journee: 1, domicileId: 'ba1', exterieurId: 'ba2', joue: false, score: null }];
  // 15-10 : le perdant (10, 1 essai) n'a pas 4 essais → pas de bonus
  // offensif, mais l'écart de 5 points (<= 7) lui donne bien un bonus
  // défensif. Le vainqueur (15, 2 essais) n'a pas non plus de bonus offensif.
  RMClub.enregistrerResultatDans(calendrier, classement, 'fx1', 15, 10, 2, 1);
  assert.strictEqual(classement.ba1.pts, 4, 'victoire sans bonus offensif (2 essais < 4) : 4 points, pas plus');
  assert.strictEqual(classement.ba1.bonusOffensifs, 0);
  assert.strictEqual(classement.ba2.pts, 1, 'défaite par 5 points (<= 7) : bonus défensif, donc 1 point malgré la défaite');
  assert.strictEqual(classement.ba2.bonusDefensifs, 1);
  assert.strictEqual(classement.ba2.bonusOffensifs, 0);
});

test('points de bonus : une défaite par plus de 7 points ne rapporte aucun bonus défensif', () => {
  const clubA = { id: 'bb1', budget: 100 };
  const clubB = { id: 'bb2', budget: 100 };
  const classement = RMClub.classementInitial([clubA, clubB]);
  const calendrier = [{ id: 'fx2', journee: 1, domicileId: 'bb1', exterieurId: 'bb2', joue: false, score: null }];
  RMClub.enregistrerResultatDans(calendrier, classement, 'fx2', 30, 10, 4, 1);
  assert.strictEqual(classement.bb1.pts, 5, 'victoire + bonus offensif (4 essais) : 5 points');
  assert.strictEqual(classement.bb1.bonusOffensifs, 1);
  assert.strictEqual(classement.bb2.pts, 0, 'défaite par 20 points (> 7) : aucun bonus défensif');
  assert.strictEqual(classement.bb2.bonusDefensifs, 0);
});

test('points de bonus : le bonus offensif s\'applique même en cas de défaite (4 essais ou plus)', () => {
  const clubA = { id: 'bc1', budget: 100 };
  const clubB = { id: 'bc2', budget: 100 };
  const classement = RMClub.classementInitial([clubA, clubB]);
  const calendrier = [{ id: 'fx3', journee: 1, domicileId: 'bc1', exterieurId: 'bc2', joue: false, score: null }];
  // Le perdant marque 4 essais (beaucoup de pénalités manquées côté vainqueur) :
  // bonus offensif ET défensif cumulables (règle standard, pas exclusifs).
  RMClub.enregistrerResultatDans(calendrier, classement, 'fx3', 25, 22, 2, 4);
  assert.strictEqual(classement.bc2.pts, 2, 'défaite par 3 (bonus défensif) + 4 essais (bonus offensif) = 0+1+1 = 2 points');
  assert.strictEqual(classement.bc2.bonusOffensifs, 1);
  assert.strictEqual(classement.bc2.bonusDefensifs, 1);
});

test('points de bonus : rétrocompatibilité — une ligne de classement antérieure sans ces champs ne devient pas NaN', () => {
  const classement = { bd1: { clubId: 'bd1', j: 0, g: 0, n: 0, p: 0, pts: 0, essaisPour: 0, essaisContre: 0, pointsPour: 0, pointsContre: 0 },
    bd2: { clubId: 'bd2', j: 0, g: 0, n: 0, p: 0, pts: 0, essaisPour: 0, essaisContre: 0, pointsPour: 0, pointsContre: 0 } };
  const calendrier = [{ id: 'fx4', journee: 1, domicileId: 'bd1', exterieurId: 'bd2', joue: false, score: null }];
  RMClub.enregistrerResultatDans(calendrier, classement, 'fx4', 20, 15, 4, 2);
  assert.ok(Number.isFinite(classement.bd1.pts) && Number.isFinite(classement.bd2.pts), 'pts ne doit jamais devenir NaN sur une ancienne ligne de classement');
  assert.strictEqual(classement.bd1.pts, 5);
});

// --- 12) Polyvalence : n'importe quel joueur peut dépanner à n'importe
// quel poste (le poste naturel reste prioritaire, mais n'est plus une
// obligation) — scénario isolé (nouvelle saison dédiée) pour rester
// déterministe plutôt que de dépendre de l'effectif déjà bien mélangé par
// les tests précédents. ---
test('polyvalence : plus aucun joueur au poste naturel → l\'auto-remplissage dépanne avec un autre poste plutôt que de laisser un trou', () => {
  const s = RMClub.nouvelleSaison(creerRng(77), 'Test Polyvalence');
  const c = s.clubJoueur;
  // Prête tous les deuxième ligne (postes '2L', numéros 4 et 5) : plus aucun
  // joueur naturel disponible pour ces deux titularisations.
  for (const j of c.effectif.filter((j) => j.poste === '2L')) {
    const r = RMClub.preterJoueur(s, j.id, 3);
    // Le garde-fou "dernier du poste" refuse de prêter le tout dernier —
    // c'est attendu : on veut justement finir à zéro 2L disponible pour
    // tester le dépannage, donc on force la fin manuellement si refusé.
    if (!r.ok) j.pret = { dureeRestante: 3 };
  }
  assert.strictEqual(c.effectif.filter((j) => j.poste === '2L' && !j.pret).length, 0, 'plus aucun 2L disponible (scénario du test)');
  const composition = RMClub.meilleureComposition(c.effectif);
  assert.ok(composition['4'] && composition['5'], 'les deux titularisations 2L doivent être comblées par un autre poste plutôt que laissées vides');
  assert.strictEqual(RMClub.validerComposition(composition).length, 0);
  const joueur4 = c.effectif.find((j) => j.id === composition['4']);
  assert.notStrictEqual(joueur4.poste, '2L', 'le joueur dépanneur ne doit pas être un 2L (il n\'y en a plus de disponible)');
});

test('polyvalence : un choix manuel hors poste naturel survit au rafraîchissement de la composition (n\'est pas écrasé)', () => {
  const s = RMClub.nouvelleSaison(creerRng(88), 'Test Polyvalence 2');
  const c = s.clubJoueur;
  const composition = RMClub.meilleureComposition(c.effectif);
  // Choisit délibérément un pilier pour occuper le numéro 9 (demi de mêlée) —
  // un dépannage hors poste totalement volontaire du manager.
  const pilier = c.effectif.find((j) => j.poste === 'P' && j.id !== composition['1'] && j.id !== composition['3']);
  composition['9'] = pilier.id;
  const recomplete = RMClub.completerComposition(c.effectif, composition);
  assert.strictEqual(recomplete['9'], pilier.id, 'le choix manuel hors poste doit survivre à completerComposition, pas être remplacé au tour suivant');
  assert.strictEqual(RMClub.validerComposition(recomplete).length, 0);
});

// --- 13) Pyramide française : le club du joueur débute en petite division
// et progresse réellement (montée/descente selon le classement final,
// nouveaux adversaires au bon niveau, qualification européenne). Scénarios
// isolés (nouvelle saison dédiée) pour un contrôle déterministe du
// classement final. ---
test('pyramide : une nouvelle carrière débute en Ligue Régionale (palier 3), avec des adversaires et un budget modestes', () => {
  const s = RMClub.nouvelleSaison(creerRng(101), 'Petit Club');
  const c = s.clubJoueur;
  assert.deepStrictEqual(c.palierPyramide, { pays: 'FRA', niveau: 3 });
  assert.ok(c.niveauClub < 0.5, 'un club qui débute en Ligue Régionale doit être plus modeste qu\'un club moyen');
  assert.ok(s.adversaires.every((a) => a.niveauClub <= 0.5), 'les adversaires de Ligue Régionale doivent rester modestes');
});

test('pyramide : finir dans le top 2 fait monter d\'un palier, avec de nouveaux adversaires plus forts', () => {
  const s = RMClub.nouvelleSaison(creerRng(102), 'Club Ambitieux');
  const c = s.clubJoueur;
  for (const id of Object.keys(s.classement)) s.classement[id].pts = 0;
  s.classement[c.id].pts = 999; // garantit la 1re place
  const idsAdversairesAvant = s.adversaires.map((a) => a.id).sort();
  RMClub.avancerSaison(creerRng(103), s);
  assert.deepStrictEqual(c.palierPyramide, { pays: 'FRA', niveau: 2 }, 'la 1re place doit faire monter de Ligue Régionale en Ligue Nationale');
  assert.ok(c.messages.some((m) => m.titre === 'Promotion !'));
  const idsAdversairesApres = s.adversaires.map((a) => a.id).sort();
  assert.notDeepStrictEqual(idsAdversairesApres, idsAdversairesAvant, 'une montée de palier doit apporter de nouveaux rivaux (nouvelle division)');
  assert.ok(s.adversaires.some((a) => a.niveauClub > 0.5), 'les adversaires de Ligue Nationale doivent être plus forts qu\'en Ligue Régionale');
  assert.strictEqual(s.adversaires.length, RMClub.TAILLE_DIVISION_FRANCE[2] - 1, 'Ligue Nationale : 16 clubs au total, dont le club du joueur');
  assert.strictEqual(s.calendrier.length, RMClub.TAILLE_DIVISION_FRANCE[2] * (RMClub.TAILLE_DIVISION_FRANCE[2] - 1), 'calendrier aller-retour complet pour 16 clubs');
});

test('pyramide : finir dans les 2 dernières places fait descendre d\'un palier (sauf déjà tout en bas)', () => {
  const s = RMClub.nouvelleSaison(creerRng(104), 'Club en Difficulté');
  const c = s.clubJoueur;
  // Fait d'abord monter le club en Ligue Nationale (palier 2) pour pouvoir
  // tester une VRAIE descente ensuite (déjà tout en bas sinon).
  for (const id of Object.keys(s.classement)) s.classement[id].pts = 0;
  s.classement[c.id].pts = 999;
  RMClub.avancerSaison(creerRng(105), s);
  assert.strictEqual(c.palierPyramide.niveau, 2);
  // Puis dernière place cette saison-là : doit redescendre en Ligue Régionale.
  for (const id of Object.keys(s.classement)) s.classement[id].pts = 999;
  s.classement[c.id].pts = 0;
  RMClub.avancerSaison(creerRng(106), s);
  assert.deepStrictEqual(c.palierPyramide, { pays: 'FRA', niveau: 3 });
  assert.ok(c.messages.some((m) => m.titre === 'Relégation'));
});

test('pyramide : impossible de descendre plus bas que la Ligue Régionale (déjà le palier le plus bas)', () => {
  const s = RMClub.nouvelleSaison(creerRng(107), 'Club Modeste');
  const c = s.clubJoueur;
  for (const id of Object.keys(s.classement)) s.classement[id].pts = 999;
  s.classement[c.id].pts = 0; // dernière place, déjà en palier 3
  RMClub.avancerSaison(creerRng(108), s);
  assert.strictEqual(c.palierPyramide.niveau, 3, 'aucune division sous la Ligue Régionale : le palier ne doit pas dépasser 3');
  assert.ok(!c.messages.some((m) => m.titre === 'Relégation'));
});

test('pyramide : qualification européenne uniquement depuis la Ligue d\'Excellence (palier 1), selon la position finale', () => {
  const s = RMClub.nouvelleSaison(creerRng(109), 'Club Historique');
  const c = s.clubJoueur;
  c.palierPyramide = { pays: 'FRA', niveau: 1 }; // déjà au sommet
  for (const id of Object.keys(s.classement)) s.classement[id].pts = 0;
  s.classement[c.id].pts = 999; // 1re place
  RMClub.avancerSaison(creerRng(110), s);
  assert.strictEqual(c.palierPyramide.niveau, 1, 'déjà au sommet : aucune montée possible au-delà');
  assert.strictEqual(c.qualificationEuropeenne, 'continentale', '1re place en Ligue d\'Excellence qualifie pour la Continentale');
  assert.ok(c.messages.some((m) => m.titre === 'Qualification européenne !'));
});

test('pyramide : rétrocompatibilité — une sauvegarde antérieure sans "palierPyramide" repart en Ligue d\'Excellence (pas de rétrogradation punitive)', () => {
  const s = RMClub.nouvelleSaison(creerRng(111), 'Ancienne Sauvegarde');
  const c = s.clubJoueur;
  delete c.palierPyramide;
  delete c.qualificationEuropeenne;
  assert.doesNotThrow(() => RMClub.avancerSaison(creerRng(112), s));
  assert.ok(c.palierPyramide && c.palierPyramide.niveau === 1, 'une sauvegarde antérieure à cette fonctionnalité doit repartir au palier le plus haut, pas être rétrogradée rétroactivement');
});

// --- Carrière longue (TODO_AUDIT.md P1-9) : 12 saisons, avec un VRAI
// rechargement de page simulé (nouvelle exécution indépendante de club.js,
// cf. server/test-audit-p0-1.js) plusieurs fois par saison, entrecoupées
// d'actions réalistes (transferts, prêts, rappels, renouvellements de
// contrat, personnel, scouting, favoris, promotions du centre de
// formation). Critères : aucun id dupliqué, aucun NaN/Infinity nulle part
// dans la saison, aucune donnée perdue (identité du club, progression des
// saisons), composition toujours complétable après chaque rechargement. ---
const clubSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club.js'), 'utf8');
const clubPersonnelSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-personnel.js'), 'utf8');
const clubObjectifSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-objectif.js'), 'utf8');
const clubAnalyseSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-analyse.js'), 'utf8');
const clubPretsSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-prets.js'), 'utf8');
const clubContratsSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-contrats.js'), 'utf8');
const clubEquipeBSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-equipe-b.js'), 'utf8');
const clubTransfertsSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-transferts.js'), 'utf8');
const clubTransfertsIntlSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-transferts-internationaux.js'), 'utf8');
const clubGenerationJoueursSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-generation-joueurs.js'), 'utf8');
const clubCentreFormationSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-centre-formation.js'), 'utf8');
const clubCompositionSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-composition.js'), 'utf8');
const clubConditionJoueursSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-condition-joueurs.js'), 'utf8');
const clubPyramideSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-pyramide.js'), 'utf8');
const clubCalendrierSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-calendrier.js'), 'utf8');
function chargerInstanceFraicheClub() {
  const ctx = {};
  ctx.window = ctx;
  ctx.RugbyEngine = global.window.RugbyEngine;
  new Function('window', clubSrcPourRechargement)(ctx);
  new Function('window', clubPersonnelSrcPourRechargement)(ctx);
  new Function('window', clubObjectifSrcPourRechargement)(ctx);
  new Function('window', clubAnalyseSrcPourRechargement)(ctx);
  new Function('window', clubPretsSrcPourRechargement)(ctx);
  new Function('window', clubContratsSrcPourRechargement)(ctx);
  new Function('window', clubEquipeBSrcPourRechargement)(ctx);
  new Function('window', clubTransfertsSrcPourRechargement)(ctx);
  new Function('window', clubTransfertsIntlSrcPourRechargement)(ctx);
  new Function('window', clubGenerationJoueursSrcPourRechargement)(ctx);
  new Function('window', clubCentreFormationSrcPourRechargement)(ctx);
  new Function('window', clubCompositionSrcPourRechargement)(ctx);
  new Function('window', clubConditionJoueursSrcPourRechargement)(ctx);
  new Function('window', clubPyramideSrcPourRechargement)(ctx);
  new Function('window', clubCalendrierSrcPourRechargement)(ctx);
  return ctx.RMClub;
}

function walkNombres(valeur, callback, vus) {
  if (valeur == null || typeof valeur !== 'object') { if (typeof valeur === 'number') callback(valeur); return; }
  if (vus.has(valeur)) return;
  vus.add(valeur);
  for (const cle of Object.keys(valeur)) walkNombres(valeur[cle], callback, vus);
}

function verifierCarriereSaine(Club, s, label) {
  // Aucun NaN/Infinity, où que ce soit dans la saison (budget, classement,
  // attributs des joueurs, finances...).
  let nombresVerifies = 0;
  walkNombres(s, (n) => {
    nombresVerifies++;
    assert.ok(Number.isFinite(n), `${label} : valeur numérique non finie (NaN/Infinity) trouvée dans la saison`);
  }, new Set());
  assert.ok(nombresVerifies > 200, `${label} : scénario de test — une vraie saison doit contenir de nombreuses valeurs numériques`);

  // Aucun id dupliqué, dans chaque espace de noms d'id (cf. P0-1 : un seul
  // compteur par type, partagé par toutes les collections concernées).
  const c = s.clubJoueur;
  const sansDoublons = (ids, quoi) => {
    const doublons = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert.deepStrictEqual(doublons, [], `${label} : ids de ${quoi} dupliqués : ${doublons.join(', ')}`);
  };
  sansDoublons([
    ...c.effectif.map((j) => j.id),
    ...(c.jeunes || []).map((j) => j.id),
    ...s.marche.map((j) => j.id),
    ...(s.favoris || []).map((j) => j.id),
  ], 'joueurs (effectif/jeunes/marché/favoris)');
  sansDoublons([c.id, ...s.adversaires.map((a) => a.id)], 'clubs');
  sansDoublons((c.messages || []).map((m) => m.id), 'messages');
  sansDoublons([...(c.personnel || []).map((p) => p.id), ...(s.marchePersonnel || []).map((p) => p.id)], 'personnel');

  // Composition toujours complétable après un rechargement (aucun trou que
  // l'auto-remplissage ne saurait combler).
  const compo = Club.completerComposition(c.effectif, {});
  assert.deepStrictEqual(Club.validerComposition(compo), [], `${label} : composition incomplète malgré l'auto-remplissage`);

  // Aucune donnée perdue : identité du club et effectif jouable.
  assert.strictEqual(c.nom, 'Carrière Longue', `${label} : le nom du club ne doit jamais changer tout seul`);
  assert.ok(c.effectif.length >= 15, `${label} : l'effectif doit toujours permettre d'aligner une équipe complète`);
}

test('carrière longue : 12 saisons avec rechargements réguliers — aucun id dupliqué, NaN, donnée perdue ni composition impossible', () => {
  const storeOriginal = global.localStorage;
  const storeLongue = {};
  global.localStorage = {
    getItem: (k) => (k in storeLongue ? storeLongue[k] : null),
    setItem: (k, v) => { storeLongue[k] = String(v); },
    removeItem: (k) => { delete storeLongue[k]; },
  };
  try {
    let graine = 5000;
    const prochainRng = () => creerRng(graine++);

    let Club = chargerInstanceFraicheClub();
    let s = Club.nouvelleSaison(prochainRng(), 'Carrière Longue');
    Club.sauvegarderSaison(s);

    const NB_SAISONS = 12;
    for (let saisonIdx = 0; saisonIdx < NB_SAISONS; saisonIdx++) {
      // Rechargement (F5) en tout début de saison.
      Club = chargerInstanceFraicheClub();
      s = Club.chargerSaison();
      assert.ok(s, `saison ${saisonIdx} : le rechargement doit réussir`);
      verifierCarriereSaine(Club, s, `saison ${saisonIdx}, après rechargement initial`);

      const c = s.clubJoueur;
      const rng = prochainRng();

      // Recrutement si abordable.
      const cible = s.marche.find((j) => j.prixTransfert + Club.calculerPrimeSignature(j) <= c.budget);
      if (cible) Club.signerJoueur(s, cible.id);

      // Prêt puis rappel d'un joueur (si l'effectif le permet).
      const pretable = c.effectif.find((j) => !j.pret);
      if (pretable) {
        const resPret = Club.preterJoueur(s, pretable.id, 3);
        if (resPret.ok) Club.rappelerJoueur(s, pretable.id);
      }

      // Renouvellement de contrat pour un joueur en fin de contrat.
      const enFinDeContrat = c.effectif.find((j) => j.contrat <= 1);
      if (enFinDeContrat) {
        const offre = Club.calculerOffreRenouvellement(enFinDeContrat);
        Club.negocierRenouvellement(rng, s, enFinDeContrat.id, offre.salaire, offre.dureeMax);
      }

      // Centre de formation : promeut un espoir si disponible.
      Club.assurerCentreFormation(rng, s);
      if ((c.jeunes || []).length > 0) Club.promouvoirJeune(s, c.jeunes[0].id);

      // Personnel : embauche puis licencie (stresse marchePersonnel/personnel).
      if ((s.marchePersonnel || []).length > 0) {
        const candidatStaff = s.marchePersonnel[0];
        const resEmbauche = Club.embaucherPersonnel(s, candidatStaff.id);
        if (resEmbauche.ok) Club.licencierPersonnel(s, candidatStaff.id);
      }

      // Scouting + favoris sur un joueur du marché restant.
      const aScouter = s.marche[0];
      if (aScouter && c.budget >= 20) Club.scouterJoueur(s, aScouter.id, 1);
      if (aScouter) Club.basculerFavori(s, aScouter);

      // Rafraîchit les deux marchés (regénère des ids, comme un vrai clic
      // "Rafraîchir" en jeu) — stresse davantage compteurJoueurId/compteurPersonnelId.
      s.marche = Club.genererMarcheTransferts(rng, c.niveauClub, 6);
      s.marchePersonnel = Club.genererMarchePersonnel(rng, 5);

      Club.sauvegarderSaison(s);

      // Rechargement (F5) en milieu de saison, avant de jouer les journées.
      Club = chargerInstanceFraicheClub();
      s = Club.chargerSaison();
      verifierCarriereSaine(Club, s, `saison ${saisonIdx}, milieu de saison`);

      // Joue toutes les journées de la saison (scores synthétisés, comme
      // server/test-parcours-club.js le fait déjà pour "progression d'une
      // journée" — inutile de repasser par le vrai moteur pour ce test de
      // robustesse des données sur de nombreuses saisons).
      let fixtures = Club.prochainesFixtures(s);
      while (fixtures.length > 0) {
        for (const f of fixtures) {
          const scoreDomicile = 10 + Math.floor(rng() * 30);
          const scoreExterieur = 10 + Math.floor(rng() * 30);
          Club.enregistrerResultat(s, f.id, scoreDomicile, scoreExterieur,
            Math.floor(scoreDomicile / 7), Math.floor(scoreExterieur / 7));
          const concerneJoueur = f.domicileId === s.clubJoueur.id || f.exterieurId === s.clubJoueur.id;
          if (concerneJoueur) {
            const cc = s.clubJoueur;
            cc.compositionTitulaires = Club.completerComposition(cc.effectif, cc.compositionTitulaires);
            cc.compositionBanc = Club.completerCompositionBanc(cc.effectif, cc.compositionTitulaires, {});
            const forme = f.domicileId === cc.id ? (scoreDomicile >= scoreExterieur ? 'v' : 'd') : (scoreExterieur >= scoreDomicile ? 'v' : 'd');
            const mouvement = Club.appliquerFinancesMatch(cc, forme);
            Club.enregistrerMouvementFinances(cc, f.journee, mouvement);
            Club.faireProgresserBlessures(rng, cc.effectif, cc.compositionTitulaires, 1, s);
            Club.appliquerFatigue(cc.effectif, cc.compositionTitulaires, 1);
            Club.appliquerMoral(cc.effectif, cc.compositionTitulaires, forme);
            Club.progresserPrets(cc.effectif);
            Club.appliquerEntrainement(rng, cc.effectif, cc.entrainementFocus, 1);
            const adversaireId = f.domicileId === cc.id ? f.exterieurId : f.domicileId;
            Club.enregistrerResultatClubJoueur(s, adversaireId, forme === 'v' ? scoreDomicile : scoreExterieur, forme === 'v' ? scoreExterieur : scoreDomicile, f.journee);
          }
        }
        fixtures = Club.prochainesFixtures(s);
      }
      Club.sauvegarderSaison(s);

      // Rechargement (F5) juste avant la bascule de fin de saison.
      Club = chargerInstanceFraicheClub();
      s = Club.chargerSaison();
      verifierCarriereSaine(Club, s, `saison ${saisonIdx}, fin de saison avant bascule`);

      const numeroAvant = s.numero;
      Club.avancerSaison(prochainRng(), s);
      assert.strictEqual(s.numero, numeroAvant + 1, `saison ${saisonIdx} : le numéro de saison doit progresser d'exactement 1`);
      Club.sauvegarderSaison(s);

      // Rechargement (F5) juste après la bascule de fin de saison.
      Club = chargerInstanceFraicheClub();
      s = Club.chargerSaison();
      verifierCarriereSaine(Club, s, `saison ${saisonIdx}, après bascule de fin de saison`);
    }

    assert.strictEqual(s.numero, NB_SAISONS + 1, `la carrière doit avoir atteint la saison ${NB_SAISONS + 1} après ${NB_SAISONS} saisons complètes`);
  } finally {
    global.localStorage = storeOriginal;
  }
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
if (process.exitCode) {
  console.error('ECHEC : au moins un test du parcours club a échoué.');
} else {
  console.log('OK : le parcours principal du Mode Club fonctionne de bout en bout.');
}
