// TRANCHE VERTICALE — Effectif → contrats → négociations → transferts →
// finances → réactions du joueur et de la direction.
//
// AUDIT DE L'EXISTANT (vérifié dans le code, pas supposé) :
//
//   CE QUI MARCHAIT DÉJÀ
//   - Écran Effectif : tableau triable (10 colonnes), filtres, comparaison,
//     fiche joueur cliquable.
//   - Contrats : `contrat` (saisons restantes) + `salaire`, expiration RÉELLE
//     à l'intersaison (`vieillirEffectif` fait partir tout contrat à zéro).
//   - Proposition asynchrone : `proposerContrat` → réponse 3 jours plus tard.
//   - Offres REÇUES : les clubs adverses achètent mes joueurs, avec décision
//     dans la boîte de réception et budgets réellement débités.
//   - Finances : grand livre complet, invariant vérifié.
//
//   CE QUI N'EXISTAIT PAS
//   - Deux issues seulement à une négociation : oui ou non. Ni
//     contre-proposition, ni délai de réflexion, ni rupture des discussions.
//   - Aucune prime, aucune satisfaction contractuelle, aucune volonté
//     exprimée de prolonger, aucune saison d'échéance lisible.
//   - Impossible de faire une offre pour le joueur d'un club adverse : le
//     marché ne contient que des joueurs libres (`genererJoueurLibre`).
//   - Impossible de rompre un contrat en cours, ni d'annoncer un
//     non-renouvellement.
//   - Les clubs IA ne PROLONGENT jamais personne avant expiration : ils
//     subissent leur effectif.
//
// Ce fichier vérifie les douze cas exigés, de la règle jusqu'à la
// conséquence financière et à la reprise après sauvegarde.
//
// Usage : node server/test-contrats-transferts.js
'use strict';

const assert = require('assert');
global.window = global;
let stockage = {};
global.localStorage = {
  getItem: (k) => (k in stockage ? stockage[k] : null),
  setItem: (k, v) => { stockage[k] = String(v); },
  removeItem: (k) => { delete stockage[k]; },
};
global.window.RugbyEngine = require('../docs/rugby-engine.js');
const { chargerRMClub, creerRng } = require('./charger-club.js');
const RMClub = chargerRMClub();

let nbTests = 0;
function test(nom, fn) {
  nbTests++;
  try { fn(); console.log(`OK   ${nom}`); }
  catch (e) { process.exitCode = 1; console.error(`FAIL ${nom}`); console.error('     ' + e.message); }
}

let graine = 5000;
function nouvelleSaison(nom) {
  const s = RMClub.nouvelleSaison(creerRng(graine++), nom || 'AS Contrats');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  RMClub.assurerInfrastructures(s);
  return s;
}
// Avance jusqu'à la date de réponse d'une négociation et résout la journée,
// comme le fait le jeu (cf. resoudreJourneeQuotidienne).
function attendreReponse(s, dateReponse) {
  RMClub.avancerJusquA(s, dateReponse);
  return s;
}
function messagesDe(s, titre) {
  return (s.clubJoueur.messages || []).filter((m) => m.titre === titre);
}
function decisionEnAttente(s, type) {
  return (s.clubJoueur.messages || [])
    .find((m) => m.decision && m.decision.type === type && !m.decision.resolu);
}

// --- 0. Les champs de contrat exigés existent et sont réels ---------------

test('T0 — chaque joueur porte les champs de contrat exigés', () => {
  const s = nouvelleSaison();
  const d = RMClub.dossierContrats(s);
  assert.ok(d.lignes.length >= 20, `tout l'effectif doit figurer (${d.lignes.length})`);
  for (const l of d.lignes) {
    for (const champ of ['salaire', 'valeur', 'saisonFin', 'moral', 'satisfaction',
      'volonte', 'niveau', 'age', 'poste', 'contrat', 'interet', 'exigence']) {
      assert.ok(l[champ] !== undefined && l[champ] !== null,
        `${champ} manquant pour ${l.nom} (${JSON.stringify(l)})`);
    }
    assert.ok(l.satisfaction >= 0 && l.satisfaction <= 100, `satisfaction bornée (${l.satisfaction})`);
    assert.ok(['souhaite', 'ouvert', 'reticent', 'refuse'].includes(l.volonte),
      `volonté lisible (${l.volonte})`);
    assert.strictEqual(l.saisonFin, (s.numero || 1) + l.contrat,
      'la saison de fin doit découler du contrat réel');
  }
  assert.strictEqual(d.masseSalariale,
    d.lignes.reduce((a, l) => a + l.salaire, 0), 'la masse salariale est la somme réelle');
});

test('T0bis — la satisfaction et la volonté dérivent de faits RÉELS', () => {
  const s = nouvelleSaison();
  const j = s.clubJoueur.effectif[0];
  const marche = RMClub.salaireDeMarche(j);
  j.salaire = Math.round(marche * 1.4); j.moral = 90; j.veutPartir = false;
  const haute = RMClub.satisfactionContrat(s, j);
  j.salaire = Math.round(marche * 0.5); j.moral = 25;
  const basse = RMClub.satisfactionContrat(s, j);
  assert.ok(haute > basse + 20,
    `être bien payé et de bonne humeur doit se voir (${haute} vs ${basse})`);
  assert.strictEqual(RMClub.volonteProlonger(s, j), 'refuse',
    'un joueur sous-payé et démoralisé ne veut pas prolonger');
  j.salaire = Math.round(marche * 1.4); j.moral = 90;
  assert.strictEqual(RMClub.volonteProlonger(s, j), 'souhaite');
  // Un joueur qui a demandé son transfert ne veut pas prolonger, quoi qu'il gagne.
  j.veutPartir = true;
  assert.strictEqual(RMClub.volonteProlonger(s, j), 'refuse');
});

// --- 1 à 3. Les issues d'une négociation ---------------------------------

test('T1 — PROLONGATION ACCEPTÉE : contrat, salaire et masse salariale changent', () => {
  const s = nouvelleSaison();
  const j = s.clubJoueur.effectif[0];
  const masseAvant = RMClub.masseSalariale(s.clubJoueur.effectif);
  const exigence = RMClub.exigenceSalariale(s, j, { duree: 3 });
  const res = RMClub.ouvrirNegociation(s, j.id, { salaire: Math.round(exigence * 1.2), duree: 3 });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(j.contrat, s.clubJoueur.effectif[0].contrat,
    'rien ne bouge au moment de la proposition');
  attendreReponse(s, res.dateReponse);
  assert.strictEqual(j.contrat, 3, `le contrat doit être réellement porté à 3 (${j.contrat})`);
  assert.strictEqual(j.salaire, Math.round(exigence * 1.2), 'le salaire accepté est appliqué');
  assert.ok(messagesDe(s, 'Contrat renouvelé').length >= 1,
    'la boîte de réception doit l\'annoncer');
  const masseApres = RMClub.masseSalariale(s.clubJoueur.effectif);
  assert.notStrictEqual(masseApres, masseAvant, 'la masse salariale doit avoir changé');
  assert.strictEqual(RMClub.negociationDe(s, j.id), null, 'la négociation est close');
});

test('T2 — CONTRE-PROPOSITION : le joueur renvoie ses conditions, décidables', () => {
  const s = nouvelleSaison();
  const j = s.clubJoueur.effectif[1];
  const exigence = RMClub.exigenceSalariale(s, j, { duree: 2 });
  // Juste en dessous : la zone de contre-proposition.
  const res = RMClub.ouvrirNegociation(s, j.id, { salaire: Math.round(exigence * 0.95), duree: 2 });
  assert.strictEqual(res.ok, true);
  attendreReponse(s, res.dateReponse);
  const msg = messagesDe(s, 'Contre-proposition')[0];
  assert.ok(msg, 'une contre-proposition doit arriver dans la boîte de réception');
  const d = msg.decision;
  assert.ok(d && d.type === 'negociationContrat' && !d.resolu, 'et être une VRAIE décision');
  assert.ok(d.salaire > Math.round(exigence * 0.95), 'il demande plus que l\'offre');
  assert.ok(d.prime > 0, 'et une prime');
  assert.deepStrictEqual(d.options.map((o) => o.id), ['accepter', 'compromis', 'ignorer'],
    'trois suites possibles');
  // Accepter ses conditions conclut réellement le contrat.
  assert.strictEqual(RMClub.resoudreDecisionMessage(s, msg.id, 'accepter'), true);
  assert.strictEqual(j.salaire, d.salaire, 'le salaire négocié est appliqué');
  assert.strictEqual(j.contrat, d.duree, 'la durée négociée aussi');
  assert.strictEqual(j.primeContrat, d.prime, 'et la prime est enregistrée');
});

test('T2bis — le COMPROMIS relance une vraie négociation', () => {
  const s = nouvelleSaison();
  const j = s.clubJoueur.effectif[2];
  const exigence = RMClub.exigenceSalariale(s, j, { duree: 2 });
  const res = RMClub.ouvrirNegociation(s, j.id, { salaire: Math.round(exigence * 0.95), duree: 2 });
  attendreReponse(s, res.dateReponse);
  const msg = messagesDe(s, 'Contre-proposition')[0];
  assert.ok(msg);
  RMClub.resoudreDecisionMessage(s, msg.id, 'compromis');
  const nego = RMClub.negociationDe(s, j.id);
  assert.ok(nego, 'une nouvelle négociation doit être ouverte');
  // Bornes inclusives : sur de petits salaires, l'arrondi du milieu peut
  // tomber exactement sur l'une des deux bornes.
  assert.ok(nego.salaire >= Math.round(exigence * 0.95) && nego.salaire <= msg.decision.salaire,
    `le compromis est entre l'offre et la demande (${Math.round(exigence * 0.95)} <= ${nego.salaire} <= ${msg.decision.salaire})`);
});

test('T3 — REFUS motivé, et RUPTURE après insistance', () => {
  const s = nouvelleSaison();
  const j = s.clubJoueur.effectif[3];
  const moralAvant = j.moral;
  const contratAvant = j.contrat;
  const exigence = RMClub.exigenceSalariale(s, j, { duree: 2 });
  const res = RMClub.ouvrirNegociation(s, j.id, { salaire: Math.round(exigence * 0.7), duree: 2 });
  attendreReponse(s, res.dateReponse);
  const refus = messagesDe(s, 'Proposition refusée')[0];
  assert.ok(refus, 'le refus doit être annoncé');
  assert.ok(/\d+ k€\/saison/.test(refus.corps), 'avec le montant réellement attendu');
  assert.strictEqual(j.contrat, contratAvant, 'un refus ne prolonge pas');
  assert.ok(j.moral < moralAvant, 'et coûte du moral');
  assert.strictEqual(j.refusContratSaison, 1, 'le refus est compté');
  // Insister avec la même offre : deuxième refus, puis rupture.
  const res2 = RMClub.ouvrirNegociation(s, j.id, { salaire: Math.round(exigence * 0.7), duree: 2 });
  assert.strictEqual(res2.ok, true);
  attendreReponse(s, res2.dateReponse);
  assert.strictEqual(j.negociationRompue, true,
    'au bout de deux refus, l\'agent met fin aux discussions');
  assert.strictEqual(RMClub.ouvrirNegociation(s, j.id, { salaire: exigence * 5 }).motif, 'rompue',
    'et plus aucune proposition n\'est possible');
  assert.strictEqual(RMClub.volonteProlonger(s, j), 'refuse');
});

test('T3bis — DÉLAI DE RÉFLEXION : le joueur ne répond pas toujours tout de suite', () => {
  // Zone intermédiaire : ni assez pour accepter, ni assez bas pour refuser.
  const exigence = 100;
  const res = RMClub.evaluerOffreContrat(exigence, { salaire: 82, duree: 2 }, {});
  assert.strictEqual(res.verdict, 'reflexion', `82 % de l'exigence -> réflexion (${res.verdict})`);
  // Une seule fois : la deuxième, il tranche.
  const res2 = RMClub.evaluerOffreContrat(exigence, { salaire: 82, duree: 2 }, { aDejaReflechi: true });
  assert.strictEqual(res2.verdict, 'refuse', 'après réflexion, il tranche');
  // Les cinq issues existent et sont ordonnées.
  assert.strictEqual(RMClub.evaluerOffreContrat(100, { salaire: 120, duree: 2 }, {}).verdict, 'accepte');
  assert.strictEqual(RMClub.evaluerOffreContrat(100, { salaire: 95, duree: 2 }, {}).verdict, 'contre');
  // 60 % de l'exigence, c'est bas mais pas insultant : c'est un refus.
  assert.strictEqual(RMClub.evaluerOffreContrat(100, { salaire: 60, duree: 2 }, {}).verdict, 'refuse');
  // En dessous de 55 %, l'agent claque la porte tout de suite.
  assert.strictEqual(RMClub.evaluerOffreContrat(100, { salaire: 40, duree: 2 }, {}).verdict, 'rompt');
  assert.strictEqual(
    RMClub.evaluerOffreContrat(100, { salaire: 120, duree: 2 }, { refusPrecedents: 2 }).verdict,
    'rompt', 'après deux refus, même une bonne offre arrive trop tard');
  // La prime compte, ramenée à l'année.
  const sansPrime = RMClub.evaluerOffreContrat(100, { salaire: 95, duree: 2, prime: 0 });
  const avecPrime = RMClub.evaluerOffreContrat(100, { salaire: 95, duree: 2, prime: 40 });
  assert.strictEqual(sansPrime.verdict, 'contre');
  assert.strictEqual(avecPrime.verdict, 'accepte', 'une prime peut emporter la décision');
});

test('T3ter — l\'exigence dépend bien des facteurs annoncés', () => {
  const s = nouvelleSaison();
  const base = s.clubJoueur.effectif[4];
  const ref = () => RMClub.exigenceSalariale(s, base, { duree: 2, interet: 0 });
  base.moral = 70; const moralHaut = ref();
  base.moral = 20; const moralBas = ref();
  assert.ok(moralBas > moralHaut, `un joueur démoralisé exige plus (${moralBas} vs ${moralHaut})`);
  base.moral = 70;
  const sansInteret = RMClub.exigenceSalariale(s, base, { duree: 2, interet: 0 });
  const avecInteret = RMClub.exigenceSalariale(s, base, { duree: 2, interet: 3 });
  assert.ok(avecInteret > sansInteret,
    `un joueur courtisé exige plus (${avecInteret} vs ${sansInteret})`);
});

// --- 4 et 5. Expiration et départ libre ----------------------------------

test('T4 — CONTRAT EXPIRÉ : il descend vraiment et finit par expirer', () => {
  const s = nouvelleSaison();
  const j = s.clubJoueur.effectif.find((x) => x.contrat >= 2) || s.clubJoueur.effectif[0];
  const id = j.id, avant = j.contrat;
  RMClub.avancerSaison(creerRng(11), s);
  const apres = s.clubJoueur.effectif.find((x) => x.id === id);
  assert.ok(apres, 'un joueur sous contrat reste au club');
  assert.strictEqual(apres.contrat, avant - 1, 'le contrat perd une saison par an');
  // Et l'écran le signale avant l'échéance.
  apres.contrat = 1;
  const d = RMClub.dossierContrats(s);
  const ligne = d.lignes.find((l) => l.id === id);
  assert.strictEqual(ligne.expire, true, 'un contrat à un an doit être signalé comme expirant');
  assert.ok(d.expirants >= 1, 'et compté dans le dossier');
});

test('T5 — DÉPART LIBRE : un joueur non prolongé quitte réellement le club', () => {
  const s = nouvelleSaison();
  // Un poste bien fourni, pour que le garde-fou "dernier au poste" ne joue pas.
  const parPoste = {};
  for (const j of s.clubJoueur.effectif) (parPoste[j.poste] = parPoste[j.poste] || []).push(j);
  const poste = Object.keys(parPoste).find((p) => parPoste[p].length >= 3);
  const j = parPoste[poste][0];
  const id = j.id;
  j.contrat = 0;
  const res = RMClub.basculerNonRenouvellement(s, id);
  assert.strictEqual(res.nonRenouvele, true, 'le manager peut annoncer un non-renouvellement');
  assert.ok(messagesDe(s, 'Contrat non renouvelé').length >= 1, 'et l\'annoncer au joueur');
  const evolution = RMClub.avancerSaison(creerRng(12), s);
  assert.ok(!s.clubJoueur.effectif.some((x) => x.id === id),
    'un contrat à zéro fait réellement partir le joueur');
  assert.ok(evolution.partis.some((p) => p.motif === 'fin de contrat'),
    `le départ est motivé (${JSON.stringify(evolution.partis.map((p) => p.motif))})`);
});

test('T5bis — ROMPRE un contrat en cours coûte une indemnité RÉELLE', () => {
  const s = nouvelleSaison();
  const parPoste = {};
  for (const j of s.clubJoueur.effectif) (parPoste[j.poste] = parPoste[j.poste] || []).push(j);
  const poste = Object.keys(parPoste).find((p) => parPoste[p].length >= 3);
  const j = parPoste[poste][0];
  j.contrat = 2;
  const indemnite = RMClub.indemniteRupture(j);
  assert.ok(indemnite > 0, `rompre coûte (${indemnite} k€)`);
  const budgetAvant = s.clubJoueur.budget;
  const masseAvant = RMClub.masseSalariale(s.clubJoueur.effectif);
  const res = RMClub.rompreContrat(s, j.id);
  assert.strictEqual(res.ok, true, `la rupture doit passer (${res.motif})`);
  assert.strictEqual(s.clubJoueur.budget, budgetAvant - indemnite, 'le budget paie réellement');
  assert.ok(RMClub.masseSalariale(s.clubJoueur.effectif) < masseAvant,
    'et la masse salariale baisse');
  assert.ok(RMClub.totauxComptes(s).salaires < 0, 'l\'indemnité est tracée au grand livre');
  // Budget insuffisant : refus EXPLIQUÉ, jamais un bouton inerte.
  const s2 = nouvelleSaison();
  const j2 = s2.clubJoueur.effectif.find((x) => x.contrat >= 2) || s2.clubJoueur.effectif[0];
  s2.clubJoueur.budget = 1;
  const echec = RMClub.rompreContrat(s2, j2.id);
  assert.strictEqual(echec.ok, false);
  assert.strictEqual(echec.motif, 'budget');
  assert.ok(echec.manque > 0, `et dire combien il manque (${echec.manque} k€)`);
});

// --- 6 à 8. Le marché des transferts -------------------------------------

test('T6 — LISTE DES TRANSFERTS : y placer un joueur change son marché', () => {
  const s = nouvelleSaison();
  const j = s.clubJoueur.effectif[5];
  const valeurAvant = RMClub.valeurMarchande(s, j);
  const res = RMClub.basculerListeTransfert(s, j.id);
  assert.strictEqual(res.surListe, true);
  assert.strictEqual(j.surListeTransfert, true);
  assert.ok(RMClub.valeurMarchande(s, j) < valeurAvant,
    'un joueur affiché sur la liste se négocie moins cher');
  assert.ok(RMClub.dossierContrats(s).lignes.find((l) => l.id === j.id).surListeTransfert,
    'et l\'écran Contrats le montre');
  RMClub.basculerListeTransfert(s, j.id);
  assert.ok(!j.surListeTransfert, 'la bascule est réversible');
});

test('T7 — OFFRE D\'UN CLUB IA : décision réelle et vente effective', () => {
  const s = nouvelleSaison();
  const j = s.clubJoueur.effectif[6];
  const club = s.adversaires[0];
  club.budget = 5000;
  const montant = Math.max(50, RMClub.valeurMarchande(s, j));
  const res = RMClub.enregistrerOffreAchat(s, { joueurId: j.id, clubId: club.id, montant, tirageContre: 0.99 });
  assert.strictEqual(res.ok, true, `l'offre doit être enregistrée (${res.motif})`);
  const msg = decisionEnAttente(s, 'offreAchat');
  assert.ok(msg, 'elle doit arriver comme décision dans la boîte de réception');
  const budgetAvant = s.clubJoueur.budget;
  const budgetClubAvant = club.budget;
  assert.strictEqual(RMClub.resoudreDecisionMessage(s, msg.id, 'accepter'), true);
  assert.ok(!s.clubJoueur.effectif.some((x) => x.id === j.id), 'le joueur part vraiment');
  assert.strictEqual(s.clubJoueur.budget, budgetAvant + montant, 'mon budget encaisse');
  assert.strictEqual(club.budget, budgetClubAvant - montant, 'et le club acheteur paie');
  assert.ok((club.groupe || []).some((x) => x.id === j.id), 'il rejoint réellement son groupe');
});

test('T8 — TRANSFERT FINALISÉ dans l\'autre sens : acheter chez un adversaire', () => {
  const s = nouvelleSaison();
  const cibles = RMClub.joueursDesClubsAdverses(s, { limite: 5 });
  assert.ok(cibles.length >= 1, 'les joueurs des clubs adverses doivent être recrutables');
  const cible = cibles[0];
  assert.ok(cible.prixDemande > 0 && cible.clubNom, `avec un prix et un club (${JSON.stringify(cible)})`);
  s.clubJoueur.budget = cible.prixDemande * 4;
  const effectifAvant = s.clubJoueur.effectif.length;
  const budgetAvant = s.clubJoueur.budget;
  const club = s.adversaires.find((a) => a.id === cible.clubId);
  const budgetVendeurAvant = club.budget;
  // Offre largement au-dessus du prix demandé : le club vend.
  const res = RMClub.proposerOffreTransfert(s, cible.clubId, cible.joueurId,
    Math.round(cible.prixDemande * 2));
  assert.strictEqual(res.ok, true, `l'offre doit partir (${res.motif})`);
  assert.ok(messagesDe(s, 'Offre transmise').length >= 1, 'et être tracée');
  attendreReponse(s, RMClub.dateDepuisISO(s.offresSortantes[0].dateReponse));
  assert.ok(s.clubJoueur.effectif.some((x) => x.id === cible.joueurId),
    'le joueur doit avoir rejoint mon effectif');
  assert.strictEqual(s.clubJoueur.effectif.length, effectifAvant + 1);
  assert.ok(!(club.groupe || []).some((x) => x.id === cible.joueurId),
    'et avoir quitté son ancien club');
  assert.ok(s.clubJoueur.budget < budgetAvant, 'mon budget a payé');
  assert.ok(club.budget > budgetVendeurAvant, 'le club vendeur a encaissé');
  assert.ok(RMClub.totauxComptes(s).transfertAchat < 0, 'l\'achat est au grand livre');
  assert.ok(messagesDe(s, 'Transfert conclu').length >= 1, 'et annoncé au manager');
});

test('T8bis — le club vendeur peut REFUSER ou CONTRE-PROPOSER', () => {
  const s = nouvelleSaison();
  const cible = RMClub.joueursDesClubsAdverses(s, { limite: 3 })[0];
  s.clubJoueur.budget = cible.prixDemande * 5;
  // Offre trop basse : refus motivé, avec le prix attendu.
  const res = RMClub.proposerOffreTransfert(s, cible.clubId, cible.joueurId,
    Math.max(1, Math.round(cible.prixDemande * 0.3)));
  assert.strictEqual(res.ok, true);
  attendreReponse(s, RMClub.dateDepuisISO(s.offresSortantes[0].dateReponse));
  const refus = messagesDe(s, 'Offre refusée')[0];
  assert.ok(refus, 'un refus doit arriver');
  assert.ok(/\d+ k€/.test(refus.corps), 'avec le prix réellement attendu');
  assert.ok(!s.clubJoueur.effectif.some((x) => x.id === cible.joueurId), 'et aucun transfert');
  // La règle de décision du vendeur, vérifiée directement.
  // La règle du vendeur, vérifiée par rapport à SON seuil réel : il monte ses
  // prétentions quand le joueur lui est indispensable, donc un montant absolu
  // ne dit rien tant qu'on ne connaît pas ce seuil.
  const club = s.adversaires.find((a) => a.id === cible.clubId);
  const joueur = (club.groupe || []).find((j) => j.id === cible.joueurId);
  const bas = RMClub.decisionVendeur(s, club, joueur, 1, 100);
  assert.strictEqual(bas.verdict, 'refuse', 'une offre à 1 k€ est refusée');
  const seuil = bas.attendu;
  assert.ok(seuil > 0, `le refus doit annoncer le prix attendu (${seuil})`);
  assert.strictEqual(RMClub.decisionVendeur(s, club, joueur, seuil, 100).verdict, 'accepte',
    'à son prix, il vend');
  assert.strictEqual(RMClub.decisionVendeur(s, club, joueur, Math.round(seuil * 0.85), 100).verdict,
    'contre', 'juste en dessous, il contre-propose');
});

test('T9 — BUDGET INSUFFISANT : l\'opération est refusée ET expliquée', () => {
  const s = nouvelleSaison();
  const cible = RMClub.joueursDesClubsAdverses(s, { limite: 3 })[0];
  s.clubJoueur.budget = 10;
  const res = RMClub.proposerOffreTransfert(s, cible.clubId, cible.joueurId, 800);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.motif, 'budget', 'le motif doit être explicite');
  assert.strictEqual(res.manque, 790, `et chiffré (${res.manque} k€ manquants)`);
  assert.strictEqual((s.offresSortantes || []).length, 0, 'aucune offre ne part');
  assert.strictEqual(s.clubJoueur.budget, 10, 'et rien n\'est débité');
});

test('T10 — MASSE SALARIALE : elle suit chaque opération, et les finances aussi', () => {
  const s = nouvelleSaison();
  const j = s.clubJoueur.effectif[7];
  const salaireAvant = j.salaire;
  const masse0 = RMClub.masseSalariale(s.clubJoueur.effectif);
  // Prolongation à un salaire plus élevé.
  const exigence = RMClub.exigenceSalariale(s, j, { duree: 2 });
  const nouveau = Math.round(exigence * 1.3);
  const res = RMClub.ouvrirNegociation(s, j.id, { salaire: nouveau, duree: 2, prime: 20 });
  attendreReponse(s, res.dateReponse);
  assert.strictEqual(j.salaire, nouveau, 'le salaire doit avoir été appliqué');
  const masse1 = RMClub.masseSalariale(s.clubJoueur.effectif);
  assert.strictEqual(masse1 - masse0, nouveau - salaireAvant,
    `la masse salariale bouge exactement du delta du salaire ` +
    `(${masse1 - masse0} vs ${nouveau - salaireAvant})`);
  // La prime est décaissée immédiatement et tracée.
  assert.strictEqual(j.primeContrat, 20);
  assert.ok(RMClub.totauxComptes(s).salaires <= -20, 'la prime sort réellement du budget');
  // Le prévisionnel repose sur cette masse. Il n'existe qu'une fois une
  // journée réellement encaissée (son dénominateur) : on en joue une, comme
  // le jeu le fait.
  RMClub.appliquerFinancesMatch(s.clubJoueur, 'v',
    RMClub.nombreJourneesSaison(s.calendrier), { domicile: true });
  const prevision = RMClub.previsionTresorerie(s, 5);
  assert.ok(prevision, 'la prévision doit exister une fois une journée encaissée');
  assert.ok(typeof prevision.soldeNetMoyen === 'number',
    'et refléter les charges réelles, salaires compris');
});

test('T11 — SAUVEGARDE : une négociation en cours survit au rechargement', () => {
  stockage = {};
  const s = nouvelleSaison('AS Sauvegarde');
  const j = s.clubJoueur.effectif[8];
  const exigence = RMClub.exigenceSalariale(s, j, { duree: 3 });
  const res = RMClub.ouvrirNegociation(s, j.id, { salaire: Math.round(exigence * 1.2), duree: 3, prime: 15 });
  assert.strictEqual(res.ok, true);
  // Et une offre sortante en parallèle.
  const cible = RMClub.joueursDesClubsAdverses(s, { limite: 2 })[0];
  s.clubJoueur.budget = cible.prixDemande * 4;
  RMClub.proposerOffreTransfert(s, cible.clubId, cible.joueurId, Math.round(cible.prixDemande * 2));
  RMClub.sauvegarderSaison(s);
  const rechargee = RMClub.chargerSaison();
  assert.ok(rechargee, 'la sauvegarde doit être rechargeable');
  const nego = RMClub.negociationDe(rechargee, j.id);
  assert.ok(nego, 'la négociation de contrat doit survivre');
  assert.strictEqual(nego.salaire, Math.round(exigence * 1.2));
  assert.strictEqual(nego.duree, 3);
  assert.strictEqual(nego.prime, 15, 'la prime aussi');
  assert.strictEqual((rechargee.offresSortantes || []).length, 1,
    'l\'offre de transfert en cours doit survivre');
  // Et elle se conclut normalement APRÈS le rechargement.
  attendreReponse(rechargee, RMClub.dateDepuisISO(nego.dateReponse));
  const jr = rechargee.clubJoueur.effectif.find((x) => x.id === j.id);
  assert.strictEqual(jr.contrat, 3, 'la négociation reprise aboutit réellement');
});

test('T12 — DÉCISIONS AUTONOMES DES CLUBS IA : ils prolongent leurs joueurs', () => {
  const s = nouvelleSaison();
  // Sans prolongation, tous les contrats à 1 an disparaissent à l'intersaison.
  const club = s.adversaires[0];
  const groupe = club.groupe || club.effectif;
  club.budget = 5000;
  for (const j of groupe) j.contrat = 1;
  const prolonges = RMClub.prolongationsClubIA(() => 0.01, s, club);
  assert.ok(prolonges.length > 0,
    `un club IA doit retenir ses joueurs (${prolonges.length} prolongations)`);
  for (const p of prolonges) {
    assert.ok(p.duree >= 1 && p.salaire > 0, `avec un vrai contrat (${JSON.stringify(p)})`);
  }
  // Il ne prolonge pas ce qu'il ne peut pas payer.
  const club2 = s.adversaires[1];
  const groupe2 = club2.groupe || club2.effectif;
  for (const j of groupe2) j.contrat = 1;
  club2.budget = 0;
  assert.strictEqual(RMClub.prolongationsClubIA(() => 0.01, s, club2).length, 0,
    'un club sans moyens ne prolonge personne');
  // Et un joueur de 34 ans et plus n'est jamais prolongé.
  for (const j of groupe2) j.age = 35;
  club2.budget = 5000;
  assert.strictEqual(RMClub.prolongationsClubIA(() => 0.01, s, club2).length, 0,
    'un club ne prolonge pas un joueur de 35 ans');
});

test('T12bis — l\'intersaison RÉELLE passe par ces prolongations', () => {
  const s = nouvelleSaison();
  for (const club of s.adversaires) {
    club.budget = 5000;
    for (const j of (club.groupe || club.effectif)) j.contrat = 1;
  }
  // `avancerIntersaisonClubsIA` EST le point d'entrée que `avancerSaison`
  // appelle (club.js) — hors montée/descente, où l'intersaison suit un autre
  // chemin. On l'appelle donc directement pour ne pas dépendre du palier tiré.
  const mercato = RMClub.avancerIntersaisonClubsIA(creerRng(21), s);
  assert.ok(mercato, 'un mercato doit être produit');
  assert.ok(Array.isArray(mercato.prolongationsIA),
    'les prolongations décidées par les clubs IA doivent y figurer');
  const total = mercato.prolongationsIA.reduce((a, x) => a + x.prolonges.length, 0);
  assert.ok(total > 0,
    `des clubs IA doivent réellement avoir prolongé (${total})`);
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
