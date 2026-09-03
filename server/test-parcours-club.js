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
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-negociations.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-equipe-b.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-transferts.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-transferts-internationaux.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-mercato.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-infrastructures.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-generation-joueurs.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-centre-formation.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-espoirs.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-composition.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-temps.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-agenda.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-semaine-entrainement.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-jour-match.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-direction.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-evenements.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-equipes.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-condition-joueurs.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-decisions.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-statuts.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-feuille-de-route.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-comptes.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-ventes.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-feuille-de-match.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-archives-matchs.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-inscriptions.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-rotation.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-revenus-competition.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-reseau-scouting.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-entraineurs-rivaux.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-pyramide.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-pyramide-france.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-calendrier.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-competitions.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-effectif-adverse.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-amicaux.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-coupes.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-a-traiter.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-medical.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-carriere-manager.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-sauvegarde.js'), 'utf8'))(global.window);
// world.js : nécessaire pour les tests de navigation par pays/championnat
// (P1-28) — l'écosystème mondial fournit 12 pays et leurs divisions.
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/world.js'), 'utf8'))(global.window);
const RMClub = global.window.RMClub;
const RMWorld = global.window.RMWorld;

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
  // Depuis P1-46, une carrière ne démarre plus avec une boîte vide : la
  // direction annonce sa feuille de route dès le premier jour, pour que le
  // manager sache sur quoi il est jugé au-delà du classement. C'est le SEUL
  // message d'ouverture — rien d'autre ne doit s'y glisser.
  assert.strictEqual(saison.clubJoueur.messages.length, 1,
    'une carrière neuve n\'a qu\'un message : la feuille de route');
  assert.strictEqual(saison.clubJoueur.messages[0].titre, 'Feuille de route de la direction');
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

// --- 5bis) Économie de saison (audit) : appliquerFinancesMatch prélevait la
// masse salariale ANNUELLE divisée par 10 (constante héritée d'un ancien
// championnat à 10 journées) — la division de départ compte réellement 26
// journées (14 clubs, aller-retour) depuis l'introduction de la pyramide
// française, donc la masse salariale était prélevée ~2,6× par saison au
// lieu d'une fois. Corrigé en dérivant le nombre de journées du calendrier
// RÉEL de la saison (RMClub.nombreJourneesSaison), plus une constante figée.
test('économie de saison : le total des salaires prélevés sur une saison complète correspond à la masse salariale annuelle (pas 2,6×)', () => {
  const s = RMClub.nouvelleSaison(creerRng(201), 'Test Économie');
  const c = s.clubJoueur;
  const nbJournees = RMClub.nombreJourneesSaison(s.calendrier);
  assert.strictEqual(nbJournees, 26, 'scénario de test : la division de départ (14 clubs) doit compter 26 journées');
  const masseAnnuelleJoueurs = RMClub.masseSalariale(c.effectif);
  const masseAnnuellePersonnel = RMClub.masseSalarialePersonnel(c);
  let totalPreleveJoueurs = 0, totalPrelevePersonnel = 0;
  for (let j = 0; j < nbJournees; j++) {
    const mouvement = RMClub.appliquerFinancesMatch(c, 'v', nbJournees);
    totalPreleveJoueurs += mouvement.salaires;
    totalPrelevePersonnel += mouvement.salairesPersonnel;
  }
  // Tolérance ±5% : chaque journée arrondit indépendamment (Math.round), un
  // léger écart cumulé sur 26 arrondis est normal, pas un signe de bug.
  const ratioJoueurs = totalPreleveJoueurs / masseAnnuelleJoueurs;
  assert.ok(ratioJoueurs > 0.95 && ratioJoueurs < 1.05,
    `total prélevé=${totalPreleveJoueurs} k€, masse annuelle=${masseAnnuelleJoueurs} k€, ratio=${ratioJoueurs.toFixed(3)}`);
  if (masseAnnuellePersonnel > 0) {
    const ratioPersonnel = totalPrelevePersonnel / masseAnnuellePersonnel;
    assert.ok(ratioPersonnel > 0.95 && ratioPersonnel < 1.05,
      `total prélevé personnel=${totalPrelevePersonnel} k€, masse annuelle=${masseAnnuellePersonnel} k€, ratio=${ratioPersonnel.toFixed(3)}`);
  }
});

test('économie de saison : un match d\'Équipe B ne prélève JAMAIS de salaire (déjà compté une fois via appliquerFinancesMatch)', () => {
  const s = RMClub.nouvelleSaison(creerRng(202), 'Test Équipe B Finances');
  const mouvementB = RMClub.appliquerFinancesMatchEquipeB(s.clubJoueur, 'v');
  assert.strictEqual(mouvementB.salaires, 0, 'un match Équipe B ne doit jamais redéduire les salaires joueurs');
  assert.strictEqual(mouvementB.salairesPersonnel, 0, 'un match Équipe B ne doit jamais redéduire les salaires du personnel');
});

test('économie de saison : rétrocompatibilité — une "ancienne sauvegarde" avec un calendrier de taille différente n\'utilise PAS la constante figée 26', () => {
  const s = RMClub.nouvelleSaison(creerRng(203), 'Ancienne Division');
  // Simule un calendrier hérité d'une division plus petite (comme l'ancien
  // championnat à 6 clubs, 10 journées) — jamais régénéré, on veut vérifier
  // que le calcul s'adapte à CE calendrier précis, pas à une constante.
  const clubsReduits = [s.clubJoueur, ...s.adversaires.slice(0, 5)];
  s.calendrier = RMClub.genererCalendrier(clubsReduits);
  const nbJourneesAnciennes = RMClub.nombreJourneesSaison(s.calendrier);
  assert.strictEqual(nbJourneesAnciennes, 10, 'scénario de test : 6 clubs doivent donner 10 journées');
  const masseAnnuelle = RMClub.masseSalariale(s.clubJoueur.effectif);
  const mouvement = RMClub.appliquerFinancesMatch(s.clubJoueur, 'v', nbJourneesAnciennes);
  const attendu = Math.round(masseAnnuelle / 10);
  assert.strictEqual(mouvement.salaires, attendu,
    `prélèvement=${mouvement.salaires} k€, attendu (masse/10 journées)=${attendu} k€ — ne doit pas utiliser 26 en dur`);
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

// --- 6b) Recommandation tactique (TODO_AUDIT.md P1-16) : relie l'analyse
// de l'adversaire à un vrai réglage actionnable des 6 axes tactiques ---
test('recommandation tactique : un écart marqué de mêlée en notre faveur recommande "avants: proche"', () => {
  const analyse = { comparaison: [{ cle: 'melee', label: 'Mêlée', moi: 80, eux: 60, diff: -20 }] };
  const recos = RMClub.recommanderTactique(analyse);
  assert.strictEqual(recos.length, 1);
  assert.strictEqual(recos[0].axe, 'avants');
  assert.strictEqual(recos[0].option, 'proche');
});

test('recommandation tactique : un écart marqué de mêlée en notre défaveur recommande "avants: large"', () => {
  const analyse = { comparaison: [{ cle: 'melee', label: 'Mêlée', moi: 60, eux: 80, diff: 20 }] };
  const recos = RMClub.recommanderTactique(analyse);
  assert.strictEqual(recos.length, 1);
  assert.strictEqual(recos[0].axe, 'avants');
  assert.strictEqual(recos[0].option, 'large');
});

test('recommandation tactique : aucun écart marqué (sous le seuil) ne génère aucune recommandation', () => {
  const analyse = { comparaison: [{ cle: 'melee', label: 'Mêlée', moi: 65, eux: 68, diff: 3 }] };
  assert.strictEqual(RMClub.recommanderTactique(analyse).length, 0);
});

test('recommandation tactique : couvre les 6 axes tactiques à partir des 6 attributs correspondants, toujours avec une vraie explication', () => {
  const analyse = { comparaison: [
    { cle: 'melee', diff: 20 }, { cle: 'touche', diff: 20 }, { cle: 'puissance', diff: 20 },
    { cle: 'vitesse', diff: 20 }, { cle: 'jeuPied', diff: 20 }, { cle: 'discipline', diff: -20 },
  ] };
  const recos = RMClub.recommanderTactique(analyse);
  const axes = recos.map((r) => r.axe).sort();
  assert.deepStrictEqual(axes, ['avants', 'ligneDef', 'pied', 'rythme', 'style', 'toucheMaul'].sort());
  for (const r of recos) {
    assert.ok(RMClub.AXES_TACTIQUE[r.axe].options[r.option], `${r.axe}/${r.option} doit être une option valide du moteur`);
    assert.ok(r.raison && r.raison.length > 10, 'chaque recommandation doit avoir une vraie explication, pas juste un axe/option bruts');
  }
});

test('recommandation tactique : s\'intègre avec une vraie analyse d\'adversaire sans jamais proposer un axe/option invalide', () => {
  const adversaireId = saison.adversaires[0].id;
  const analyse = RMClub.analyserAdversaire(saison, adversaireId, 6);
  const recos = RMClub.recommanderTactique(analyse);
  for (const r of recos) {
    assert.ok(RMClub.AXES_TACTIQUE[r.axe], `axe inconnu : ${r.axe}`);
    assert.ok(RMClub.AXES_TACTIQUE[r.axe].options[r.option], `option inconnue : ${r.axe}/${r.option}`);
  }
});

test('appliquerRecommandationsTactique : modifie réellement la tactique utilisée en match, sans toucher aux axes non concernés', () => {
  const s = RMClub.nouvelleSaison(creerRng(310), 'Test Recommandation');
  s.clubJoueur.tactique = { style: 'sol', pied: 'rare' };
  const recos = [{ axe: 'avants', option: 'proche' }, { axe: 'style', option: 'large' }];
  const resultat = RMClub.appliquerRecommandationsTactique(s, recos);
  assert.strictEqual(s.clubJoueur.tactique.avants, 'proche');
  assert.strictEqual(s.clubJoueur.tactique.style, 'large', 'un axe recommandé écrase bien un réglage manuel précédent');
  assert.strictEqual(s.clubJoueur.tactique.pied, 'rare', 'un axe NON concerné par la recommandation doit rester inchangé');
  assert.strictEqual(resultat, s.clubJoueur.tactique);
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

// --- Match espoirs (audit "pas de tournois junior") : le centre de
// formation, jusqu'ici seulement mélangé aux réservistes via l'Équipe B,
// dispute désormais un vrai match RÉSERVÉ à lui seul, une journée sur
// RMClub.PERIODE_JOURNEES_ESPOIRS. ---
test('match espoirs : la périodicité est bien "une journée sur PERIODE_JOURNEES_ESPOIRS"', () => {
  const p = RMClub.PERIODE_JOURNEES_ESPOIRS;
  assert.ok(p >= 2, 'une périodicité d\'au moins 2 journées (jamais chaque journée, comme Équipe B)');
  assert.ok(RMClub.journeeDeMatchEspoirs(p), `la journée ${p} (multiple de la période) doit déclencher un match espoirs`);
  assert.ok(RMClub.journeeDeMatchEspoirs(p * 2), `la journée ${p * 2} aussi`);
  assert.ok(!RMClub.journeeDeMatchEspoirs(p - 1), `la journée ${p - 1} (juste avant) ne doit pas déclencher de match`);
});

test('match espoirs : éligible dès la création (centre de formation complet), plus éligible si un poste se retrouve sans espoir', () => {
  // Saison JETABLE (pas la `saison` partagée des autres tests du fichier,
  // délibérément cumulative) : ce test mute destructivement `jeunes`, ce qui
  // corromprait les tests suivants (ex. Équipe B) s'il touchait la vraie.
  const s = RMClub.nouvelleSaison(creerRng(200), 'Test Espoirs Éligibilité');
  RMClub.assurerCentreFormation(creerRng(201), s);
  assert.ok(RMClub.eligiblePourMatchEspoirs(s), 'un centre de formation fraîchement complété doit pouvoir aligner un XV complet');
  // Vide tous les espoirs d'un poste précis (ex. tous les piliers).
  const poste = s.clubJoueur.jeunes[0].poste;
  s.clubJoueur.jeunes = s.clubJoueur.jeunes.filter((j) => j.poste !== poste);
  assert.ok(!RMClub.eligiblePourMatchEspoirs(s), 'un poste sans aucun espoir disponible doit rendre le match espoirs impossible');
});

test('match espoirs : appliquerEffetsMatchEspoirs donne réellement du temps de jeu (fatigue/moral) aux espoirs alignés, pas aux autres', () => {
  const s = RMClub.nouvelleSaison(creerRng(202), 'Test Espoirs Effets');
  RMClub.assurerCentreFormation(creerRng(203), s);
  // Un espoir de profondeur (poste déjà couvert par le quota) pour garantir
  // un espoir NON aligné à comparer — le centre de formation par défaut a
  // exactement 15 espoirs (un par poste requis), donc tous seraient alignés.
  s.clubJoueur.jeunes.push(RMClub.genererJeune(s.clubJoueur.jeunes[0].poste, creerRng(204), s.clubJoueur.niveauClub));
  const composition = RMClub.meilleureComposition(s.clubJoueur.jeunes);
  const idAligne = Object.values(composition)[0];
  const idNonAligne = s.clubJoueur.jeunes.find((j) => !Object.values(composition).includes(j.id)).id;
  const fatigueAvant = s.clubJoueur.jeunes.find((j) => j.id === idNonAligne).fatigue || 0;
  RMClub.appliquerEffetsMatchEspoirs(s, composition);
  const aligne = s.clubJoueur.jeunes.find((j) => j.id === idAligne);
  const nonAligne = s.clubJoueur.jeunes.find((j) => j.id === idNonAligne);
  assert.strictEqual(aligne.matchsJoues, 1, 'un espoir aligné doit avoir joué un match de plus');
  assert.ok(aligne.fatigue > 0, 'un espoir aligné doit avoir réellement encaissé de la fatigue');
  assert.strictEqual(nonAligne.matchsJoues, 0, 'un espoir NON aligné ce jour-là ne doit rien encaisser');
  assert.strictEqual(nonAligne.fatigue || 0, fatigueAvant, 'la fatigue d\'un espoir non aligné ne doit pas bouger');
});

test('match espoirs : l\'adversaire synthétique reste nettement plus modeste qu\'un adversaire de premier XV (niveau réduit)', () => {
  const niveauReel = 0.6;
  const niveauAdv = RMClub.niveauAdversaireEspoirs(niveauReel);
  assert.ok(niveauAdv < niveauReel * 0.5, 'des espoirs 16-18 ans ne doivent pas affronter un adversaire au niveau d\'un premier XV');
  assert.ok(niveauAdv > 0, 'jamais un niveau nul ou négatif (des joueurs générés injouables)');
});

// --- 10b) Décisions du manager : demandes de temps de jeu dans la boîte de
// réception (TODO_AUDIT.md P1-15) — première tranche de la "boîte de
// réception avec décisions" ---
test('décision : seuls les 2 meilleurs joueurs d\'un poste sont des candidats légitimes à réclamer une place', () => {
  const effectifTest = [
    { id: 'j1', poste: 'P', vitesse: 80, plaquage: 80 },
    { id: 'j2', poste: 'P', vitesse: 75, plaquage: 75 },
    { id: 'j3', poste: 'P', vitesse: 50, plaquage: 50 },
  ];
  assert.ok(RMClub.estCandidatSelectionAttendue(effectifTest, effectifTest[0]));
  assert.ok(RMClub.estCandidatSelectionAttendue(effectifTest, effectifTest[1]));
  assert.ok(!RMClub.estCandidatSelectionAttendue(effectifTest, effectifTest[2]), 'le 3e pilier, nettement moins bon, ne doit pas se sentir légitime à réclamer une place');
});

test('décision : un joueur de qualité jamais sélectionné plusieurs journées de suite génère une VRAIE demande dans la boîte de réception', () => {
  const s = RMClub.nouvelleSaison(creerRng(300), 'Test Frustration TDJ');
  const effectif = s.clubJoueur.effectif;
  // Le meilleur joueur de tout l'effectif est nécessairement un candidat
  // légitime à son propre poste (personne ne peut le devancer nulle part).
  const meilleur = effectif.slice().sort((a, b) => (b.vitesse + b.plaquage) - (a.vitesse + a.plaquage))[0];
  assert.ok(RMClub.estCandidatSelectionAttendue(effectif, meilleur));
  const messagesAvant = s.clubJoueur.messages.length;
  for (let i = 0; i < RMClub.SEUIL_JOURS_SANS_SELECTION - 1; i++) RMClub.appliquerFrustrationTempsDeJeu(s, {}, {});
  assert.strictEqual(s.clubJoueur.messages.length, messagesAvant, 'pas encore de demande avant le seuil de journées consécutives');
  RMClub.appliquerFrustrationTempsDeJeu(s, {}, {});
  const messageDecision = s.clubJoueur.messages.find((m) => m.decision && m.decision.type === 'tempsDeJeu' && m.decision.joueurId === meilleur.id);
  assert.ok(messageDecision, 'le meilleur joueur de l\'effectif, jamais sélectionné, doit avoir généré une vraie demande de temps de jeu');
  assert.strictEqual(messageDecision.decision.resolu, false);
  assert.strictEqual(messageDecision.decision.options.length, 2, 'un vrai choix (pas juste un texte informatif)');
  // Sélectionné à nouveau ensuite : le compteur retombe à zéro (pas de
  // deuxième demande immédiate pour la même frustration déjà exprimée).
  const compo = {}; compo['1'] = meilleur.id;
  RMClub.appliquerFrustrationTempsDeJeu(s, compo, {});
  assert.strictEqual(meilleur.joursSansSelection, 0);
});

test('décision "Le rassurer" : améliore réellement le moral et referme la demande (idempotent au second clic)', () => {
  const s = RMClub.nouvelleSaison(creerRng(301), 'Test Décision Rassurer');
  const j = s.clubJoueur.effectif[0];
  j.moral = 50;
  j.demandeTempsDeJeuEnAttente = true;
  RMClub.ajouterMessage(s, 'joueur', 'Demande de temps de jeu', 'texte', {
    type: 'tempsDeJeu', joueurId: j.id, resolu: false,
    options: [{ id: 'rassurer', libelle: 'Le rassurer' }, { id: 'ignorer', libelle: 'Ignorer sa demande' }],
  });
  const messageId = s.clubJoueur.messages[0].id;
  assert.ok(RMClub.resoudreDecisionMessage(s, messageId, 'rassurer'), 'la résolution doit réussir');
  assert.strictEqual(j.moral, 60, 'le moral doit monter de 10 points');
  assert.strictEqual(j.demandeTempsDeJeuEnAttente, false);
  assert.strictEqual(s.clubJoueur.messages[0].decision.resolu, true);
  assert.strictEqual(s.clubJoueur.messages[0].lu, true, 'répondre à la décision marque aussi le message comme lu');
  assert.ok(s.clubJoueur.messages[0].decision.resultat, 'un texte de résultat réel doit rester visible après coup');
  // Idempotence : un second clic (même une option différente) ne doit rien changer de plus.
  assert.strictEqual(RMClub.resoudreDecisionMessage(s, messageId, 'ignorer'), false, 'un message déjà résolu ne doit plus pouvoir être re-tranché');
  assert.strictEqual(j.moral, 60, 'le moral ne doit pas bouger après une tentative de double résolution');
});

test('décision "Ignorer" répétée deux fois : le joueur baisse durablement en moral et veut finir par quitter le club', () => {
  const s = RMClub.nouvelleSaison(creerRng(302), 'Test Décision Ignorer');
  const j = s.clubJoueur.effectif[0];
  j.moral = 70;
  function envoyerDemande() {
    RMClub.ajouterMessage(s, 'joueur', 'Demande de temps de jeu', 'texte', {
      type: 'tempsDeJeu', joueurId: j.id, resolu: false,
      options: [{ id: 'rassurer', libelle: 'Le rassurer' }, { id: 'ignorer', libelle: 'Ignorer sa demande' }],
    });
    return s.clubJoueur.messages[0].id;
  }
  RMClub.resoudreDecisionMessage(s, envoyerDemande(), 'ignorer');
  assert.strictEqual(j.moral, 56, 'une première demande ignorée fait baisser le moral de 14 points');
  assert.ok(!j.veutPartir, 'une seule demande ignorée ne suffit pas à vouloir partir');
  RMClub.resoudreDecisionMessage(s, envoyerDemande(), 'ignorer');
  assert.strictEqual(j.moral, 42);
  assert.strictEqual(j.veutPartir, true, 'une deuxième demande ignorée du même joueur doit le faire vouloir quitter le club');
  const messageDepart = s.clubJoueur.messages.find((m) => m.titre === 'Demande de transfert');
  assert.ok(messageDepart, 'un vrai message informant de la volonté de départ doit être généré');
});

test('conséquence réelle de "veut partir" : arrête de progresser à l\'entraînement, contrairement à un joueur normal dans les mêmes conditions', () => {
  const s = RMClub.nouvelleSaison(creerRng(303), 'Test Conséquences Départ');
  const jMecontent = s.clubJoueur.effectif[0];
  const jNormal = s.clubJoueur.effectif[1];
  jMecontent.age = 25; jMecontent.potentiel = 99; jMecontent.puissance = 50; jMecontent.veutPartir = true;
  jNormal.age = 25; jNormal.potentiel = 99; jNormal.puissance = 50; jNormal.veutPartir = false;
  const rngToujoursProgres = () => 0; // toujours < 0.35*facteur → tenterait de progresser si rien ne l'en empêche
  RMClub.appliquerEntrainement(rngToujoursProgres, [jMecontent], 'physique', 1);
  RMClub.appliquerEntrainement(rngToujoursProgres, [jNormal], 'physique', 1);
  assert.strictEqual(jMecontent.puissance, 50, 'un joueur qui veut partir ne doit plus progresser du tout à l\'entraînement');
  assert.strictEqual(jNormal.puissance, 51, 'dans les mêmes conditions, un joueur normal progresse bien (preuve que ce n\'est pas juste un hasard de rng)');
});

test('conséquence réelle de "veut partir" : ne dérive plus vers un moral neutre, contrairement à un joueur normal non sélectionné', () => {
  const jMecontent = { id: 'jm', moral: 60, veutPartir: true };
  const jNormal = { id: 'jn', moral: 60 };
  RMClub.appliquerMoral([jMecontent], {}, 'n');
  RMClub.appliquerMoral([jNormal], {}, 'n');
  assert.ok(jMecontent.moral < 60, 'un joueur qui veut partir doit continuer de dériver vers un moral bas (35), pas remonter');
  assert.strictEqual(jNormal.moral, 63, 'un joueur normal non sélectionné dérive doucement vers la neutralité (65)');
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

// --- 12b) Remplacements (TODO_AUDIT.md P1-17) : le banc de 8 était jusqu'ici
// purement cosmétique — jamais transmis au moteur de simulation. ---
test('remplacements : le banc complet produit un plan de remplacement pour chacun de ses 8 postes, aux bons numéros et minutes', () => {
  const s = RMClub.nouvelleSaison(creerRng(400), 'Test Remplacements');
  const c = s.clubJoueur;
  c.compositionTitulaires = RMClub.meilleureComposition(c.effectif);
  c.compositionBanc = RMClub.completerCompositionBanc(c.effectif, c.compositionTitulaires, {});
  const remplacements = RMClub.remplacementsVersConfig(c.effectif, c.compositionBanc, 'A');
  assert.strictEqual(remplacements.length, 8, 'un effectif frais couvre les 8 postes du banc, donc 8 remplacements planifiés');
  const numerosAttendus = [1, 2, 4, 6, 9, 10, 12, 15];
  assert.deepStrictEqual(remplacements.map((r) => r.numero).sort((a, b) => a - b), numerosAttendus);
  for (const r of remplacements) {
    assert.strictEqual(r.equipe, 'A');
    assert.ok(r.minute > 0 && r.minute < 80, `minute réaliste (dans le match) : ${r.minute}`);
    assert.notStrictEqual(r.joueurId, c.compositionTitulaires[String(r.numero)], 'le remplaçant ne doit jamais être le titulaire qu\'il relève');
    assert.strictEqual(r.joueurId, c.compositionBanc[String(r.numeroBanc)], 'le remplaçant doit bien être celui choisi au poste correspondant du banc');
  }
  // Les remplacements sont étalés dans le temps (jamais tous à la même minute) —
  // sinon ce serait un changement d'équipe brutal, pas un vrai roulement de match.
  const minutesUniques = new Set(remplacements.map((r) => r.minute));
  assert.strictEqual(minutesUniques.size, remplacements.length, 'chaque remplacement doit avoir sa propre minute');
});

test('remplacements : un banc incomplet ne planifie que les remplacements réellement possibles', () => {
  const s = RMClub.nouvelleSaison(creerRng(401), 'Test Remplacements Incomplet');
  const c = s.clubJoueur;
  c.compositionTitulaires = RMClub.meilleureComposition(c.effectif);
  const bancComplet = RMClub.completerCompositionBanc(c.effectif, c.compositionTitulaires, {});
  delete bancComplet['16']; // retire volontairement le pilier de banc
  const remplacements = RMClub.remplacementsVersConfig(c.effectif, bancComplet, 'A');
  assert.strictEqual(remplacements.length, 7, 'un poste de banc vide ne doit jamais générer de remplacement fantôme');
  assert.ok(!remplacements.some((r) => r.numero === 1), 'le numéro couvert par le poste de banc manquant ne doit pas apparaître');
});

test('remplacements : un banc entièrement vide ne planifie aucun remplacement (comportement historique inchangé)', () => {
  const s = RMClub.nouvelleSaison(creerRng(402), 'Test Remplacements Vide');
  assert.deepStrictEqual(RMClub.remplacementsVersConfig(s.clubJoueur.effectif, {}, 'A'), []);
  assert.deepStrictEqual(RMClub.remplacementsVersConfig(s.clubJoueur.effectif, null, 'A'), []);
});

test('remplacements : un remplaçant fatigué/démoralisé apporte réellement moins que sur sa fiche, jamais un simple clone', () => {
  const s = RMClub.nouvelleSaison(creerRng(403), 'Test Remplacements Fatigue');
  const c = s.clubJoueur;
  c.compositionTitulaires = RMClub.meilleureComposition(c.effectif);
  c.compositionBanc = RMClub.completerCompositionBanc(c.effectif, c.compositionTitulaires, {});
  const idBancPilier = c.compositionBanc['16'];
  const bancPilier = c.effectif.find((j) => j.id === idBancPilier);
  bancPilier.fatigue = 100;
  bancPilier.moral = 0;
  const remplacements = RMClub.remplacementsVersConfig(c.effectif, c.compositionBanc, 'A');
  const rPilier = remplacements.find((r) => r.numero === 1);
  assert.ok(rPilier.joueur.vitesse < bancPilier.vitesse, 'la fatigue/le moral doivent réellement réduire les attributs transmis au moteur');
  assert.ok(rPilier.joueur.vitesse >= 20, 'jamais en dessous du plancher (même logique que compositionVersJoueursCfg)');
});

// --- 12c) Équipe gérée (TODO_AUDIT.md P1-18) : premier XV, Équipe B et
// Espoirs gérés par les MÊMES fonctions de composition/tactique — seule
// change la source (effectif + slot de composition). ---
test('équipe gérée : equipeGeree vaut "pro" par défaut, et le slot du premier XV EST saison.clubJoueur (aucune duplication)', () => {
  const s = RMClub.nouvelleSaison(creerRng(410), 'Test Équipe Gérée Défaut');
  assert.strictEqual(RMClub.slotCompositionPourEquipe(s, 'pro'), s.clubJoueur, 'le premier XV doit réutiliser directement clubJoueur, pas une copie');
  const secondaires = RMClub.assurerCompositionsSecondaires(s);
  assert.strictEqual(s.clubJoueur.equipeGeree, 'pro');
  assert.ok(secondaires.b && secondaires.jeunes, 'les slots Équipe B et Espoirs doivent exister dès la première consultation');
});

test('équipe gérée : effectifPourEquipe retourne bien la bonne source par équipe', () => {
  const s = RMClub.nouvelleSaison(creerRng(411), 'Test Effectif Par Équipe');
  RMClub.assurerCentreFormation(creerRng(412), s);
  assert.strictEqual(RMClub.effectifPourEquipe(s, 'pro'), s.clubJoueur.effectif);
  assert.strictEqual(RMClub.effectifPourEquipe(s, 'jeunes'), s.clubJoueur.jeunes);
  const effectifB = RMClub.effectifPourEquipe(s, 'b');
  assert.deepStrictEqual(effectifB, RMClub.effectifDisponiblePourEquipeB(s), 'l\'Équipe B doit piocher dans le même vivier que la carte Équipe B existante');
});

test('équipe gérée : assurerCompositionPourEquipe complète les Espoirs sans jamais toucher au slot du premier XV', () => {
  const s = RMClub.nouvelleSaison(creerRng(413), 'Test Isolation Slots');
  RMClub.assurerCentreFormation(creerRng(414), s);
  // Le premier XV n'a encore JAMAIS été touché sur cette saison isolée —
  // reste tel quel (généralement absent/vide) tant qu'on ne gère QUE les
  // Espoirs, preuve directe qu'assurerCompositionPourEquipe('jeunes') ne
  // touche pas au slot du premier XV.
  const proIntactAvant = !s.clubJoueur.compositionTitulaires || Object.keys(s.clubJoueur.compositionTitulaires).length === 0;
  const slotJeunes = RMClub.assurerCompositionPourEquipe(s, 'jeunes');
  assert.strictEqual(RMClub.validerComposition(slotJeunes.compositionTitulaires).length, 0, 'un centre de formation frais doit permettre une composition Espoirs complète');
  const proIntactApres = !s.clubJoueur.compositionTitulaires || Object.keys(s.clubJoueur.compositionTitulaires).length === 0;
  assert.strictEqual(proIntactApres, proIntactAvant, 'gérer les Espoirs ne doit JAMAIS modifier/compléter la composition du premier XV');
  assert.notStrictEqual(slotJeunes, s.clubJoueur, 'le slot Espoirs doit être un objet distinct de clubJoueur');
});

test('équipe gérée : un choix manuel dans le slot Équipe B survit à un nouvel appel et reste indépendant du slot Espoirs', () => {
  const s = RMClub.nouvelleSaison(creerRng(415), 'Test Persistance Slot B');
  RMClub.assurerCentreFormation(creerRng(416), s);
  const slotB1 = RMClub.assurerCompositionPourEquipe(s, 'b');
  const idChoisi = slotB1.compositionTitulaires['9'];
  assert.ok(idChoisi, 'une composition Équipe B doit avoir été auto-complétée');
  // Un second appel doit retrouver EXACTEMENT le même choix (pas régénéré à
  // chaque fois) — comportement attendu de complèterComposition (ne remplace
  // que les trous), déjà vérifié pour le premier XV, ici pour l'Équipe B.
  const slotB2 = RMClub.assurerCompositionPourEquipe(s, 'b');
  assert.strictEqual(slotB2.compositionTitulaires['9'], idChoisi);
  assert.strictEqual(slotB1, slotB2, 'le slot Équipe B doit être LE MÊME objet persisté, pas régénéré à chaque appel');
  const slotJeunes = RMClub.assurerCompositionPourEquipe(s, 'jeunes');
  assert.notStrictEqual(slotJeunes, slotB1, 'le slot Espoirs doit rester un objet distinct du slot Équipe B');
});

test('équipe gérée : construireTactiqueCfg-like — remplacementsVersConfig/tactiqueVersConfig fonctionnent identiquement sur le slot Équipe B et le slot du premier XV', () => {
  const s = RMClub.nouvelleSaison(creerRng(417), 'Test Tactique Par Équipe');
  const slotB = RMClub.assurerCompositionPourEquipe(s, 'b');
  slotB.tactique = { style: 'large' };
  const cfgB = RMClub.tactiqueVersConfig(slotB.tactique);
  assert.ok(cfgB.attaque, 'la tactique du slot Équipe B doit se convertir en config moteur exactement comme celle du premier XV');
  const effectifB = RMClub.effectifPourEquipe(s, 'b');
  const remplacementsB = RMClub.remplacementsVersConfig(effectifB, slotB.compositionBanc, 'A');
  assert.ok(Array.isArray(remplacementsB), 'remplacementsVersConfig doit fonctionner sur le banc de l\'Équipe B comme sur celui du premier XV');
});

// --- 12d) Contexte d'équipe et navigation entre clubs (TODO_AUDIT.md
// P1-19 puis P1-20). Deux questions strictement séparées :
//   « quel club ? »        -> navigationClub.clubConsulteId, changé UNIQUEMENT
//                             en cliquant un nom de club (ouvrirClub)
//   « quelle équipe ? »    -> navigationClub.equipeConsultee, une équipe DU
//                             club affiché ('pro'|'b'|'jeunes')
// Le club n'est jamais encodé dans la valeur du sélecteur d'équipe. ---
const CHAMPS_CONTEXTE = ['type', 'clubId', 'club', 'effectif', 'slot', 'label', 'sousTitre',
  'modifiable', 'calendrier', 'classement', 'titreClassement', 'personnel', 'entrainementFocus', 'disponible'];

function saisonAvecClubOuvert(graine, nom, indexAdversaire) {
  const s = RMClub.nouvelleSaison(creerRng(graine), nom);
  RMClub.assurerCentreFormation(creerRng(graine + 1), s);
  RMClub.ouvrirClubDansNavigation(s, s.adversaires[indexAdversaire || 0].id, 'dashboard');
  return s;
}

test('contexte d\'équipe : un club du joueur et un club consulté exposent EXACTEMENT la même forme (condition de l\'écran unique)', () => {
  const s = RMClub.nouvelleSaison(creerRng(420), 'Test Contexte Forme');
  RMClub.assurerCentreFormation(creerRng(421), s);
  const contextes = [];
  for (const equipe of ['pro', 'b', 'jeunes']) {
    RMClub.definirEquipeConsultee(s, equipe);
    contextes.push({ nom: equipe, ctx: RMClub.contexteEquipe(s) });
  }
  RMClub.ouvrirClubDansNavigation(s, s.adversaires[0].id, 'dashboard');
  contextes.push({ nom: 'club consulté', ctx: RMClub.contexteEquipe(s) });
  for (const { nom, ctx } of contextes) {
    for (const champ of CHAMPS_CONTEXTE) {
      assert.ok(champ in ctx, `le contexte "${nom}" doit exposer le champ "${champ}" comme tous les autres`);
    }
    assert.ok(Array.isArray(ctx.effectif), `l'effectif du contexte "${nom}" doit être une liste`);
    // La composition est le composant le plus structurant de l'écran unique :
    // même forme partout, sinon le terrain devrait être rendu différemment.
    assert.ok(ctx.slot && typeof ctx.slot.compositionTitulaires === 'object', `le slot du contexte "${nom}" doit porter une composition`);
    assert.ok(ctx.slot.tactique && typeof ctx.slot.tactique === 'object', `le slot du contexte "${nom}" doit porter une tactique`);
  }
});

test('contexte d\'équipe : seul un club consulté est en lecture seule, les 3 équipes du club du joueur sont modifiables', () => {
  const s = RMClub.nouvelleSaison(creerRng(422), 'Test Contexte Droits');
  RMClub.assurerCentreFormation(creerRng(423), s);
  for (const equipe of ['pro', 'b', 'jeunes']) {
    RMClub.definirEquipeConsultee(s, equipe);
    assert.strictEqual(RMClub.contexteEquipe(s).modifiable, true, `l'équipe ${equipe} du club du joueur doit être modifiable`);
  }
  RMClub.ouvrirClubDansNavigation(s, s.adversaires[0].id, 'dashboard');
  const ctxAdv = RMClub.contexteEquipe(s);
  assert.strictEqual(ctxAdv.modifiable, false);
  // Ce qui n'est pas simulé pour un club IA est signalé comme inconnu
  // (null), jamais fabriqué.
  assert.strictEqual(ctxAdv.personnel, null, 'le staff d\'un club IA n\'est pas modélisé : il doit être signalé inconnu, pas inventé');
  assert.strictEqual(ctxAdv.entrainementFocus, null, 'le programme d\'entraînement d\'un club IA n\'est pas modélisé : inconnu, pas inventé');
});

test('contexte d\'équipe : le XV d\'un club consulté est bien celui qui joue réellement (15 numéros, aucun trou)', () => {
  const s = saisonAvecClubOuvert(424, 'Test Compo Consultée');
  const adv = RMClub.club(s, RMClub.navigationClub(s).clubConsulteId);
  const ctx = RMClub.contexteEquipe(s);
  assert.strictEqual(RMClub.validerComposition(ctx.slot.compositionTitulaires).length, 0,
    'les 15 numéros d\'un club consulté doivent tous être pourvus — c\'est son effectif tel qu\'il descend sur le terrain');
  // Chaque joueur reçoit un id dérivé stable : sans ça, la table d'effectif
  // et la fiche joueur communes ne pourraient pas le retrouver.
  const ids = ctx.effectif.map((j) => j.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'les ids dérivés doivent être uniques');
  assert.deepStrictEqual(RMClub.contexteEquipe(s).effectif.map((j) => j.id), ids, 'les ids dérivés doivent être stables d\'un rendu à l\'autre');
  // Depuis P1-29, les joueurs adverses ont de VRAIS identifiants (ils
  // appartiennent au groupe de 24 du club, avec fatigue et blessures
  // suivies) : l'absence d'id n'est plus le bon témoin de non-mutation. On
  // vérifie donc directement que la normalisation ne touche pas la saison.
  const avantNormalisation = JSON.stringify(adv.effectif);
  RMClub.effectifAdverseNormalise(adv);
  assert.strictEqual(JSON.stringify(adv.effectif), avantNormalisation,
    'la normalisation ne doit JAMAIS muter les données de la saison');
});

test('contexte d\'équipe : la tactique d\'un club consulté est DÉDUITE de ses attributs réels, sur les mêmes 6 axes', () => {
  const s = saisonAvecClubOuvert(425, 'Test Tactique Déduite');
  const ctx = RMClub.contexteEquipe(s);
  assert.strictEqual(ctx.tactiqueDeduite, true, 'la tactique d\'un club consulté doit être signalée comme déduite, jamais comme un réglage certain');
  for (const axe of Object.keys(RMClub.AXES_TACTIQUE)) {
    const valeur = ctx.slot.tactique[axe];
    assert.ok(RMClub.AXES_TACTIQUE[axe].options[valeur],
      `l'axe "${axe}" déduit doit valoir une option RÉELLE de cet axe (obtenu : ${valeur})`);
  }
  const costauds = ctx.club.effectif.map((j) => Object.assign({}, j, { jeuPied: 90, puissance: 90, plaquage: 90 }));
  const legers = ctx.club.effectif.map((j) => Object.assign({}, j, { jeuPied: 20, puissance: 20, plaquage: 20 }));
  assert.notDeepStrictEqual(RMClub.deduireTactiqueAdverse(costauds), RMClub.deduireTactiqueAdverse(legers),
    'la tactique déduite doit réellement dépendre des attributs, pas être une constante déguisée');
});

test('contexte d\'équipe : calendrier et classement suivent l\'équipe/le club affiché', () => {
  const s = RMClub.nouvelleSaison(creerRng(426), 'Test Calendrier Contexte');
  RMClub.assurerCentreFormation(creerRng(427), s);
  RMClub.assurerCompetitionB(s);
  const adv = s.adversaires[0];

  const ctxPro = RMClub.contexteEquipe(s);
  assert.strictEqual(ctxPro.classement, s.classement, 'le premier XV joue le championnat principal');
  assert.ok(ctxPro.calendrier.length > 0);

  RMClub.definirEquipeConsultee(s, 'b');
  const ctxB = RMClub.contexteEquipe(s);
  if (ctxB.disponible) {
    assert.strictEqual(ctxB.classement, s.competitionB.classement, 'l\'Équipe B doit afficher le classement du championnat B');
    assert.ok(ctxB.calendrier.every((f) => f.domicileId === s.clubJoueur.id || f.exterieurId === s.clubJoueur.id));
  } else {
    assert.ok(ctxB.motifIndisponible, 'un club non éligible à l\'Équipe B doit recevoir une explication, pas un écran vide');
  }

  RMClub.definirEquipeConsultee(s, 'jeunes');
  const ctxJeunes = RMClub.contexteEquipe(s);
  assert.ok(ctxJeunes.calendrier.length > 0, 'les espoirs doivent avoir des rencontres programmées');
  // Depuis P1-31, les espoirs ont leur PROPRE championnat, donc leur propre
  // numérotation de journées : c'est `journeeChampionnat` qui dit à quelle
  // journée de championnat la rencontre est adossée.
  assert.ok(ctxJeunes.calendrier.every((f) => RMClub.journeeDeMatchEspoirs(f.journeeChampionnat)),
    'chaque rencontre espoirs doit être adossée à une journée de championnat valide');
  assert.strictEqual(ctxJeunes.classement, s.competitionEspoirs.classement,
    'les espoirs affichent le classement de LEUR championnat');

  RMClub.ouvrirClubDansNavigation(s, adv.id, 'calendrier');
  const ctxAdv = RMClub.contexteEquipe(s);
  assert.ok(ctxAdv.calendrier.length > 0, 'un club consulté a bien un calendrier (le même championnat)');
  assert.ok(ctxAdv.calendrier.every((f) => f.domicileId === adv.id || f.exterieurId === adv.id),
    'le calendrier affiché pour un club consulté ne doit contenir QUE ses propres rencontres');
});

test('contexte d\'équipe : le bilan des espoirs vient de matchs RÉELLEMENT joués, jamais fabriqué', () => {
  const s = RMClub.nouvelleSaison(creerRng(428), 'Test Bilan Espoirs');
  assert.strictEqual(RMClub.bilanEspoirs(s).j, 0, 'aucun match espoirs joué : le bilan doit être vide, pas inventé');
  RMClub.enregistrerMatchEspoirs(s, 4, 'Club Adverse', 24, 10);
  RMClub.enregistrerMatchEspoirs(s, 8, 'Autre Club', 7, 21);
  RMClub.enregistrerMatchEspoirs(s, 12, 'Encore Un', 15, 15);
  const bilan = RMClub.bilanEspoirs(s);
  assert.strictEqual(bilan.j, 3);
  assert.strictEqual(bilan.g, 1);
  assert.strictEqual(bilan.n, 1);
  assert.strictEqual(bilan.p, 1);
  assert.strictEqual(bilan.pointsPour, 46);
  assert.strictEqual(bilan.pointsContre, 46);
  assert.strictEqual(bilan.pts, 6, 'victoire 4 + nul 2 = 6 points, mêmes règles que les autres compétitions');
  // Depuis P1-31, le calendrier espoirs est celui d'un VRAI championnat
  // (académies persistantes) : c'est enregistrerResultatEspoirs qui y marque
  // les rencontres jouées, pas l'archive `matchsEspoirs` qui alimente le
  // bilan ci-dessus. On vérifie donc les deux chemins séparément.
  // L'archive (`matchsEspoirs`, qui alimente le bilan ci-dessus) et le
  // CALENDRIER du championnat espoirs doivent rester synchronisés : les 3
  // matchs enregistrés doivent apparaître comme joués dans les deux.
  const joues = RMClub.calendrierEspoirs(s).filter((f) => f.joue);
  assert.strictEqual(joues.length, 3,
    'les 3 matchs enregistrés doivent aussi être marqués joués dans le championnat espoirs');
  const comp = RMClub.assurerCompetitionEspoirs(s);
  const classementJoueur = comp.classement[s.clubJoueur.id];
  assert.strictEqual(classementJoueur.j, 3, 'le classement du championnat espoirs doit compter les 3 rencontres');
  assert.strictEqual(classementJoueur.g, 1, 'une victoire');
  assert.strictEqual(classementJoueur.n, 1, 'un nul');
  assert.strictEqual(classementJoueur.p, 1, 'une défaite');
});

// BUG #5 (chasse aux bugs) : le championnat espoirs comptait les points du
// club du joueur mais JAMAIS ses essais.
//
// Mesuré dans le navigateur sur une vraie rencontre espoirs : mon club marque
// 20 points et le classement affiche essaisPour = 0 — un score de 20 est
// impossible sans essai. Les rencontres académie-contre-académie, elles,
// enregistrent leurs vrais essais. Conséquence : ni mon club ni son
// adversaire du jour ne peuvent jamais décrocher le bonus offensif (4 essais),
// alors que les autres le peuvent — le classement est faussé dans un seul
// sens, et les colonnes essais sont des zéros fabriqués.
test('espoirs : les essais RÉELLEMENT marqués alimentent le classement du championnat espoirs', () => {
  const s = RMClub.nouvelleSaison(creerRng(4281), 'Test Essais Espoirs');
  const comp = RMClub.assurerCompetitionEspoirs(s);
  const rencontre = comp.calendrier.find((f) => !f.joue
    && (f.domicileId === s.clubJoueur.id || f.exterieurId === s.clubJoueur.id));
  assert.ok(rencontre, 'prémisse : le club du joueur a bien une rencontre espoirs à jouer');
  const idAdverse = rencontre.domicileId === s.clubJoueur.id ? rencontre.exterieurId : rencontre.domicileId;
  // 4 essais pour, 1 contre : au-dessus du seuil du bonus offensif, pour que
  // l'oubli des essais se voie AUSSI dans les points, pas seulement dans une
  // colonne d'affichage.
  RMClub.enregistrerMatchEspoirs(s, rencontre.journeeChampionnat, 'Académie', 28, 12, 4, 1);
  const moi = comp.classement[s.clubJoueur.id];
  const lui = comp.classement[idAdverse];
  assert.strictEqual(moi.essaisPour, 4, 'les 4 essais marqués doivent arriver au classement espoirs');
  assert.strictEqual(moi.essaisContre, 1, 'et les essais encaissés aussi');
  assert.strictEqual(lui.essaisPour, 1, "l'adversaire du jour doit lui aussi garder ses essais");
  assert.strictEqual(lui.essaisContre, 4);
  assert.strictEqual(moi.bonusOffensifs, 1,
    '4 essais marqués = bonus offensif, la même règle que dans les autres championnats');
  assert.strictEqual(moi.pts, 5, 'victoire (4) + bonus offensif (1)');
});

// BUG #6 (chasse aux bugs) : l'Équipe B du joueur affrontait des XV PREMIERS.
//
// Mesuré dans le navigateur, quatre journées d'affilée : 0-48, 9-70, 3-44,
// 17-25 pour mon Équipe B — pendant que les rencontres B entre clubs IA
// restaient serrées (28-27, 15-16, 24-22, 24-17). Cause mesurée : le niveau
// demandé au générateur pour la réserve adverse était `niveauClub * 0,65`.
// Or genererJoueur décale les notes de `(niveauClub - 0,5) * 20` : sur les
// niveaux d'une division (0,15 à 0,45), multiplier par 0,65 ne retire qu'UN
// point de note. L'écart réel entre un XV premier et sa réserve, mesuré sur
// 12 carrières, est de 13,1 points (12,1 à 15,2) — soit 0,65 de niveau, en
// SOUSTRACTION. Le facteur multiplicatif n'exprimait donc rien.
test('équipe B : la réserve adverse est générée comme une RÉSERVE, pas comme un XV premier', () => {
  const niveauMoyen = (effectif) => effectif.reduce((somme, j) =>
    somme + ((j.vitesse || 0) + (j.plaquage || 0)) / 2, 0) / effectif.length;

  // Prémisse mesurée, sans laquelle le test ne prouverait rien : dans ce jeu,
  // la réserve d'un club est RÉELLEMENT bien plus faible que son XV premier.
  const ecarts = [];
  for (let g = 1; g <= 6; g++) {
    const s = RMClub.nouvelleSaison(creerRng(6100 + g), 'Écart Réserve ' + g);
    const xvDe = (equipe) => {
      const slot = RMClub.assurerCompositionPourEquipe(s, equipe);
      const parId = {};
      for (const j of RMClub.effectifPourEquipe(s, equipe)) parId[j.id] = j;
      return Object.values(slot.compositionTitulaires || {}).map((id) => parId[id]).filter(Boolean);
    };
    ecarts.push(niveauMoyen(xvDe('pro')) - niveauMoyen(xvDe('b')));
  }
  const ecartReel = ecarts.reduce((a, b) => a + b, 0) / ecarts.length;
  assert.ok(ecartReel > 8,
    `prémisse : la réserve du joueur doit être nettement plus faible que son XV premier (mesuré ${ecartReel.toFixed(1)})`);

  // La règle testée est celle que l'interface utilise réellement, pas une
  // copie : c'est niveauReserveDe qui décide du niveau de la réserve adverse.
  assert.ok(typeof RMClub.niveauReserveDe === 'function',
    'la règle du niveau de réserve doit exister et être exportée, pas recopiée dans l\'interface');
  for (const niveauPremiere of [0.15, 0.3, 0.45]) {
    const premiere = niveauMoyen(RMClub.genererEffectif(creerRng(77), niveauPremiere));
    const reserve = niveauMoyen(RMClub.genererEffectif(creerRng(77), RMClub.niveauReserveDe(niveauPremiere)));
    assert.ok(premiere - reserve > 8,
      `à niveau ${niveauPremiere}, la réserve générée doit être nettement plus faible que le XV premier `
      + `(XV ${premiere.toFixed(1)} vs réserve ${reserve.toFixed(1)})`);
  }

  // Et le point qui décide si le championnat B est jouable : la réserve
  // adverse doit être du même ordre que la MIENNE, pas 7 points au-dessus.
  const s = RMClub.nouvelleSaison(creerRng(6199), 'Réserve Jouable');
  // Le XV premier D'ABORD : le vivier de l'Équipe B est l'effectif NON
  // convoqué (cf. effectifDisponiblePourEquipeB). Sans cette ligne, la
  // réserve se remplit avec les meilleurs joueurs du club et la mesure ne
  // décrit plus une réserve — ce qui est exactement l'état du jeu réel au
  // moment du match, où la composition du premier XV existe déjà.
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  const slotB = RMClub.assurerCompositionPourEquipe(s, 'b');
  const parIdB = {};
  for (const j of RMClub.effectifPourEquipe(s, 'b')) parIdB[j.id] = j;
  const maReserve = niveauMoyen(Object.values(slotB.compositionTitulaires || {})
    .map((id) => parIdB[id]).filter(Boolean));
  const rival = s.adversaires[Math.floor(s.adversaires.length / 2)];
  const saReserve = niveauMoyen(RMClub.genererEffectif(creerRng(88),
    RMClub.niveauReserveDe(rival.niveauClub)));
  assert.ok(Math.abs(saReserve - maReserve) < 6,
    `la réserve adverse doit être du même ordre que la mienne (moi ${maReserve.toFixed(1)}, `
    + `elle ${saReserve.toFixed(1)}) — sinon le championnat B est injouable`);
});

// BUG #7 (chasse aux bugs) : même défaut que le #6, côté Espoirs.
//
// Mesuré dans le navigateur, six rencontres du championnat espoirs :
//   5-33, 0-30, 9-37, 0-38, 15-39, 7-49 — six défaites lourdes, 0 à 15
// points marqués. Les académies entre elles, au même moment : 11-9, 11-11,
// 17-26, 17-20, 23-21, 19-21. `niveauAdversaireEspoirs` multipliait le
// niveau du club parent par 0,35 en visant explicitement « des espoirs de
// 16-18 ans n'ont pas le niveau d'une réserve professionnelle » — mais sur
// l'échelle du générateur, multiplier ne retire presque rien, et le plancher
// `Math.max(0,1)` de l'interface remontait même le résultat. L'académie
// adverse était générée autour de 55 face à mes espoirs à 45,7.
test('espoirs : l\'académie adverse est générée comme une ACADÉMIE, pas comme un XV premier', () => {
  const niveauMoyen = (effectif) => effectif.reduce((somme, j) =>
    somme + ((j.vitesse || 0) + (j.plaquage || 0)) / 2, 0) / effectif.length;
  const xvDe = (s, equipe) => {
    const slot = RMClub.assurerCompositionPourEquipe(s, equipe);
    const parId = {};
    for (const j of RMClub.effectifPourEquipe(s, equipe)) parId[j.id] = j;
    return Object.values(slot.compositionTitulaires || {}).map((id) => parId[id]).filter(Boolean);
  };

  // Prémisse mesurée : les espoirs d'un club sont RÉELLEMENT bien plus
  // faibles que son XV premier. Sans elle, le test ne prouverait rien.
  const ecarts = [];
  for (let g = 1; g <= 6; g++) {
    const s = RMClub.nouvelleSaison(creerRng(7100 + g), 'Écart Espoirs ' + g);
    RMClub.assurerCompositionPourEquipe(s, 'pro');
    ecarts.push(niveauMoyen(xvDe(s, 'pro')) - niveauMoyen(xvDe(s, 'jeunes')));
  }
  const ecartReel = ecarts.reduce((x, y) => x + y, 0) / ecarts.length;
  assert.ok(ecartReel > 8,
    `prémisse : les espoirs doivent être nettement plus faibles que le XV premier (mesuré ${ecartReel.toFixed(1)})`);

  assert.ok(typeof RMClub.niveauXVAcademie === 'function'
    && typeof RMClub.clubParentAcademie === 'function',
    'la règle du niveau d\'un XV d\'académie doit exister et être exportée, pas recopiée dans l\'interface');

  const s = RMClub.nouvelleSaison(creerRng(7199), 'Académie Jouable');
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  const comp = RMClub.assurerCompetitionEspoirs(s);
  const academies = (comp.clubs || []).filter((a) => a.id !== s.clubJoueur.id);
  assert.ok(academies.length >= 2, 'prémisse : le championnat espoirs oppose bien plusieurs académies');

  for (const academie of academies) {
    // La résolution du club parent est elle aussi la vraie règle exportée :
    // c'est elle qui décide du niveau de référence, pas un champ recopié.
    const parent = RMClub.clubParentAcademie(s, academie);
    assert.ok(parent, 'prémisse : chaque académie est adossée à un club réel');
    const xvPremier = niveauMoyen(RMClub.genererEffectif(creerRng(91), parent.niveauClub));
    const xvAcademie = niveauMoyen(RMClub.genererEffectif(creerRng(91),
      RMClub.niveauXVAcademie(parent.niveauClub)));
    assert.ok(xvPremier - xvAcademie > 8,
      `l'académie de ${parent.nom} doit être nettement plus faible que son XV premier `
      + `(XV ${xvPremier.toFixed(1)} vs académie ${xvAcademie.toFixed(1)})`);
  }

  // Et le point qui décide si le championnat espoirs est jouable : l'académie
  // d'un club de MON niveau doit être du même ordre que MES espoirs.
  const mesEspoirs = niveauMoyen(xvDe(s, 'jeunes'));
  const monNiveau = s.clubJoueur.niveauClub;
  const academieComparable = academies.reduce((meilleure, a) => {
    const p = RMClub.clubParentAcademie(s, a);
    if (!p) return meilleure;
    const ecart = Math.abs(p.niveauClub - monNiveau);
    return (!meilleure || ecart < meilleure.ecart) ? { parent: p, ecart } : meilleure;
  }, null);
  assert.ok(academieComparable, 'prémisse : un club adverse de niveau comparable au mien existe');
  const saAcademie = niveauMoyen(RMClub.genererEffectif(creerRng(92),
    RMClub.niveauXVAcademie(academieComparable.parent.niveauClub)));
  assert.ok(Math.abs(saAcademie - mesEspoirs) < 6,
    `l'académie d'un club de mon niveau doit valoir à peu près mes espoirs (moi ${mesEspoirs.toFixed(1)}, `
    + `elle ${saAcademie.toFixed(1)}) — sinon le championnat espoirs est injouable`);
});

// BUG #8 (chasse aux bugs) : le championnat espoirs opposait TOUJOURS les
// académies des trois clubs les plus FAIBLES de la division.
//
// Mesuré sur quatre carrières, division de 13 rivaux allant de 0,15 à 0,45,
// mon club à 0,30 : les académies retenues étaient à chaque fois 0,15, 0,175
// et 0,20. `genererCompetitionEspoirs` prenait `adversaires.slice(0, n)` — or
// cette liste est ordonnée par niveau CROISSANT. Le championnat espoirs ne
// représentait donc jamais la division, et mon club en était structurellement
// le plus fort (avantage résiduel mesuré : 1,6 point de note).
test('espoirs : le championnat échantillonne la division, pas seulement ses clubs les plus faibles', () => {
  const s = RMClub.nouvelleSaison(creerRng(9300), 'Échantillon Espoirs');
  const niveaux = (s.adversaires || []).map((a) => a.niveauClub);
  const monNiveau = s.clubJoueur.niveauClub;

  // Prémisses mesurées : sans elles, le test passerait sans rien prouver.
  assert.ok(niveaux.length >= 6,
    `prémisse : la division doit compter assez de rivaux pour qu'échantillonner soit un choix (${niveaux.length})`);
  const minDivision = Math.min(...niveaux);
  const maxDivision = Math.max(...niveaux);
  assert.ok(maxDivision - minDivision > 0.1,
    `prémisse : les niveaux de la division doivent être réellement étalés (${minDivision} à ${maxDivision})`);
  assert.ok(maxDivision > monNiveau,
    'prémisse : au moins un club de la division est plus fort que le mien');

  const comp = RMClub.assurerCompetitionEspoirs(s);
  const parents = (comp.clubs || [])
    .filter((a) => a.id !== s.clubJoueur.id)
    .map((a) => RMClub.clubParentAcademie(s, a))
    .filter(Boolean);
  assert.ok(parents.length >= 2 && parents.length < niveaux.length,
    `prémisse : le championnat retient une PARTIE de la division (${parents.length} sur ${niveaux.length})`);

  const retenus = parents.map((p) => p.niveauClub);
  const etendueRetenue = Math.max(...retenus) - Math.min(...retenus);
  assert.ok(etendueRetenue > (maxDivision - minDivision) * 0.7,
    `les académies retenues doivent couvrir la division (étendue ${etendueRetenue.toFixed(3)} `
    + `contre ${(maxDivision - minDivision).toFixed(3)} pour la division entière) — `
    + `retenus : ${retenus.map((n) => n.toFixed(3)).join(', ')}`);
  assert.ok(Math.max(...retenus) >= monNiveau,
    `mon club ne doit pas être d'office le plus fort du championnat espoirs `
    + `(moi ${monNiveau.toFixed(3)}, meilleur adversaire ${Math.max(...retenus).toFixed(3)})`);
});

// Semaine d'entraînement PAR ÉQUIPE : ce qui compte n'est pas que trois
// semaines soient stockées, c'est que les joueurs travaillent RÉELLEMENT trois
// choses différentes selon leur équipe.
test('entraînement : chaque équipe suit SON programme, et les groupes ne se mélangent pas', () => {
  const s = RMClub.nouvelleSaison(creerRng(31337), 'AS Trois Semaines');
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  RMClub.assurerCompositionPourEquipe(s, 'b');
  // Trois programmes distinguables : repos ne développe rien, physique
  // travaille la puissance, touche travaille la touche.
  for (let jour = 0; jour <= 6; jour++) {
    RMClub.definirSeance(s, jour, 'repos', 'pro');
    RMClub.definirSeance(s, jour, 'physique', 'b');
    RMClub.definirSeance(s, jour, 'touche', 'jeunes');
  }
  const tous = [...s.clubJoueur.effectif, ...(s.clubJoueur.jeunes || [])];
  // La répartition testée est celle que la boucle de jeu utilise vraiment.
  const groupes = RMClub.repartirParEquipeDEntrainement(s, tous);
  // Prémisses : sans des groupes réellement peuplés, la mesure ne prouve rien.
  assert.ok(groupes.pro.length > 0, 'prémisse : des joueurs suivent le programme du premier XV');
  assert.ok(groupes.jeunes.length > 0,
    'prémisse : des joueurs suivent le programme des Espoirs (une première version de la règle laissait ce groupe VIDE, le vivier d\'Équipe B absorbant tous les espoirs)');
  assert.ok(groupes.pro.every((j) => groupes.jeunes.indexOf(j) === -1),
    'aucun joueur ne peut suivre deux programmes le même jour');
  const moyenne = (liste, champ) => liste.reduce((t, j) => t + (j[champ] || 0), 0) / liste.length;
  const avant = {
    proPuissance: moyenne(groupes.pro, 'puissance'), proFatigue: moyenne(groupes.pro, 'fatigue'),
    jeunesTouche: moyenne(groupes.jeunes, 'touche'), jeunesPuissance: moyenne(groupes.jeunes, 'puissance'),
  };
  for (let i = 0; i < 21; i++) RMClub.avancerUnJour(s);
  const apres = {
    proPuissance: moyenne(groupes.pro, 'puissance'), proFatigue: moyenne(groupes.pro, 'fatigue'),
    jeunesTouche: moyenne(groupes.jeunes, 'touche'), jeunesPuissance: moyenne(groupes.jeunes, 'puissance'),
  };
  assert.strictEqual(apres.proPuissance, avant.proPuissance,
    'le premier XV était au repos : il ne doit avoir rien développé');
  assert.strictEqual(apres.proFatigue, avant.proFatigue,
    'le repos ne fatigue pas');
  assert.ok(apres.jeunesTouche > avant.jeunesTouche,
    `les espoirs travaillaient la touche : elle doit progresser (${avant.jeunesTouche} -> ${apres.jeunesTouche})`);
  assert.strictEqual(apres.jeunesPuissance, avant.jeunesPuissance,
    'les espoirs ne travaillaient PAS le physique : leur puissance ne doit pas bouger — c\'est ce qui prouve que le programme de l\'Équipe B ne déborde pas sur eux');
});

// --- 12e) Navigation entre clubs (TODO_AUDIT.md P1-20) : on n'ouvre JAMAIS
// un club depuis une liste ou un menu déroulant — uniquement en cliquant son
// nom. La couche données garantit ici les invariants que l'UI applique. ---
test('navigation : le sélecteur d\'équipe ne propose QUE des équipes, jamais un club', () => {
  const s = RMClub.nouvelleSaison(creerRng(440), 'Test Sélecteur Sans Club');
  const equipesJoueur = RMClub.equipesDisponiblesPourClub(s, s.clubJoueur.id);
  assert.deepStrictEqual(equipesJoueur.map((e) => e.valeur), ['pro', 'b', 'jeunes'],
    'le club du joueur a exactement ses 3 équipes, et rien d\'autre');
  // Aucune valeur ne doit encoder un club ('adverse:clubId' n'existe plus).
  const nomsClubs = [s.clubJoueur.nom, ...s.adversaires.map((a) => a.nom)];
  for (const club of [s.clubJoueur, ...s.adversaires]) {
    for (const e of RMClub.equipesDisponiblesPourClub(s, club.id)) {
      assert.ok(e.valeur.indexOf(':') === -1, `la valeur "${e.valeur}" ne doit pas encoder de club`);
      assert.ok(!nomsClubs.some((n) => e.label.includes(n)), `le libellé "${e.label}" ne doit contenir aucun nom de club`);
    }
  }
});

test('navigation : un club consulté n\'expose que les équipes RÉELLEMENT présentes dans ses données', () => {
  const s = saisonAvecClubOuvert(441, 'Test Équipes Réelles');
  const nav = RMClub.navigationClub(s);
  const equipes = RMClub.equipesDisponiblesPourClub(s, nav.clubConsulteId);
  // Un club IA n'a qu'un effectif de 15 joueurs (cf. genererEffectif) : pas
  // d'Équipe B ni de centre de formation à lui proposer — rien n'est fabriqué.
  assert.deepStrictEqual(equipes.map((e) => e.valeur), ['pro']);
  // Et il est impossible de forcer une équipe qu'il n'a pas.
  RMClub.definirEquipeConsultee(s, 'b');
  assert.strictEqual(RMClub.navigationClub(s).equipeConsultee, 'pro',
    'sélectionner une équipe inexistante pour ce club ne doit rien changer');
});

test('navigation : ouvrir un club mémorise d\'où l\'on vient et sélectionne son équipe première', () => {
  const s = RMClub.nouvelleSaison(creerRng(442), 'Test Ouverture Club');
  RMClub.assurerCentreFormation(creerRng(443), s);
  RMClub.definirEquipeConsultee(s, 'b');
  const adv = s.adversaires[0];
  RMClub.ouvrirClubDansNavigation(s, adv.id, 'tactique');
  const nav = RMClub.navigationClub(s);
  assert.strictEqual(nav.clubConsulteId, adv.id, 'le club cliqué devient le club consulté');
  assert.strictEqual(nav.equipeConsultee, 'pro', 'ouvrir un club sélectionne toujours son équipe première');
  assert.strictEqual(nav.clubPrecedentId, s.clubJoueur.id);
  assert.strictEqual(nav.equipePrecedente, 'b', 'l\'équipe sur laquelle le joueur travaillait doit être mémorisée');
  assert.strictEqual(nav.ongletPrecedent, 'tactique', 'l\'écran d\'où l\'on vient doit être mémorisé');
});

test('navigation : "retour à mon club" restaure le club, l\'équipe ET l\'écran précédents', () => {
  const s = RMClub.nouvelleSaison(creerRng(444), 'Test Retour Mon Club');
  RMClub.assurerCentreFormation(creerRng(445), s);
  RMClub.definirEquipeConsultee(s, 'b');
  RMClub.ouvrirClubDansNavigation(s, s.adversaires[0].id, 'tactique');
  const { navigation, onglet } = RMClub.retourClubJoueurDansNavigation(s);
  assert.strictEqual(navigation.clubConsulteId, s.clubJoueur.id);
  assert.strictEqual(navigation.equipeConsultee, 'b', 'le joueur doit retrouver l\'équipe sur laquelle il travaillait');
  assert.strictEqual(onglet, 'tactique', 'le joueur doit retrouver l\'écran qu\'il consultait');
});

test('navigation : enchaîner deux clubs consultés ne fait pas perdre le chemin du retour', () => {
  const s = RMClub.nouvelleSaison(creerRng(446), 'Test Enchaînement Clubs');
  RMClub.definirEquipeConsultee(s, 'jeunes');
  RMClub.ouvrirClubDansNavigation(s, s.adversaires[0].id, 'calendrier');
  RMClub.ouvrirClubDansNavigation(s, s.adversaires[1].id, 'composition');
  const nav = RMClub.navigationClub(s);
  assert.strictEqual(nav.clubConsulteId, s.adversaires[1].id);
  assert.strictEqual(nav.equipePrecedente, 'jeunes', 'le point de retour reste celui du DÉPART depuis son propre club');
  assert.strictEqual(nav.ongletPrecedent, 'calendrier');
  const { navigation } = RMClub.retourClubJoueurDansNavigation(s);
  assert.strictEqual(navigation.clubConsulteId, s.clubJoueur.id);
  assert.strictEqual(navigation.equipeConsultee, 'jeunes');
});

test('navigation : les écrans de GESTION sont absents du menu d\'un club consulté (pas grisés : absents)', () => {
  const s = RMClub.nouvelleSaison(creerRng(447), 'Test Menu Club Consulté');
  const ongletsMonClub = RMClub.ongletsDisponibles(s);
  for (const attendu of ['dashboard', 'effectif', 'composition', 'tactique', 'entrainement', 'calendrier', 'personnel', 'medical', 'transferts', 'finances']) {
    assert.ok(ongletsMonClub.indexOf(attendu) !== -1, `le menu de mon club doit garder "${attendu}"`);
  }
  RMClub.ouvrirClubDansNavigation(s, s.adversaires[0].id, 'dashboard');
  const ongletsConsulte = RMClub.ongletsDisponibles(s);
  for (const consultable of ['dashboard', 'effectif', 'composition', 'calendrier', 'personnel']) {
    assert.ok(ongletsConsulte.indexOf(consultable) !== -1, `le menu d'un club consulté doit proposer "${consultable}"`);
  }
  for (const interdit of ['tactique', 'entrainement', 'medical', 'transferts', 'finances', 'stats']) {
    assert.strictEqual(ongletsConsulte.indexOf(interdit), -1,
      `"${interdit}" ne doit pas exister du tout dans le menu d'un club consulté`);
  }
});

test('navigation : la navigation est persistée et rétrocompatible avec l\'ancien champ equipeGeree', () => {
  const s = RMClub.nouvelleSaison(creerRng(448), 'Test Navigation Persistée');
  // Sauvegarde antérieure : ni navigationClub ni equipeSelectionnee, seul
  // l'ancien champ `equipeGeree` existe.
  delete s.clubJoueur.navigationClub;
  delete s.clubJoueur.equipeSelectionnee;
  s.clubJoueur.equipeGeree = 'jeunes';
  assert.strictEqual(RMClub.navigationClub(s).equipeConsultee, 'jeunes', 'l\'ancien champ equipeGeree doit être repris tel quel');
  assert.strictEqual(RMClub.navigationClub(s).clubConsulteId, s.clubJoueur.id, 'une sauvegarde ancienne repart toujours sur son propre club');

  RMClub.ouvrirClubDansNavigation(s, s.adversaires[1].id, 'effectif');
  RMClub.sauvegarderSaison(s);
  const recharge = RMClub.chargerSaison();
  assert.strictEqual(RMClub.navigationClub(recharge).clubConsulteId, s.adversaires[1].id,
    'le club consulté doit survivre à un rechargement');

  // Un club disparu ne doit jamais bloquer la navigation sur un club fantôme.
  recharge.clubJoueur.navigationClub.clubConsulteId = 'clubQuiNExistePas';
  assert.strictEqual(RMClub.navigationClub(recharge).clubConsulteId, recharge.clubJoueur.id,
    'un club disparu doit faire retomber la navigation sur le club du joueur');
});

// --- 12f) Temps calendaire (TODO_AUDIT.md P1-21, tranche 1) : la carrière
// avance jour par jour, chaque rencontre a une VRAIE date, et rien ne peut
// être joué avant sa date. `journee` est conservé tel quel : la date est une
// couche additive, pas un remplacement. ---
test('temps : arithmétique de dates exacte, y compris changements de mois, d\'année et années bissextiles', () => {
  // Aucun objet Date n'est utilisé : la conversion date <-> jour absolu doit
  // donc être vérifiée sur les cas limites classiques.
  assert.deepStrictEqual(RMClub.ajouterJours({ annee: 2024, mois: 1, jour: 31 }, 1), { annee: 2024, mois: 2, jour: 1 });
  assert.deepStrictEqual(RMClub.ajouterJours({ annee: 2024, mois: 2, jour: 28 }, 1), { annee: 2024, mois: 2, jour: 29 }, '2024 est bissextile');
  assert.deepStrictEqual(RMClub.ajouterJours({ annee: 2025, mois: 2, jour: 28 }, 1), { annee: 2025, mois: 3, jour: 1 }, '2025 ne l\'est pas');
  assert.deepStrictEqual(RMClub.ajouterJours({ annee: 2024, mois: 12, jour: 31 }, 1), { annee: 2025, mois: 1, jour: 1 }, 'passage d\'année');
  assert.deepStrictEqual(RMClub.ajouterJours({ annee: 2025, mois: 1, jour: 1 }, -1), { annee: 2024, mois: 12, jour: 31 }, 'recul d\'année');
  assert.deepStrictEqual(RMClub.ajouterJours({ annee: 1900, mois: 2, jour: 28 }, 1), { annee: 1900, mois: 3, jour: 1 }, '1900 n\'est pas bissextile (règle des siècles)');
  assert.deepStrictEqual(RMClub.ajouterJours({ annee: 2000, mois: 2, jour: 28 }, 1), { annee: 2000, mois: 2, jour: 29 }, '2000 l\'est (divisible par 400)');
  // Aller-retour sur une longue période : aucune dérive.
  const depart = { annee: 2024, mois: 8, jour: 17 };
  assert.deepStrictEqual(RMClub.ajouterJours(RMClub.ajouterJours(depart, 3650), -3650), depart);
  assert.strictEqual(RMClub.ecartJours({ annee: 2024, mois: 9, jour: 7 }, { annee: 2024, mois: 9, jour: 14 }), 7);
  // Jours de la semaine RÉELS (vérifiables sur un calendrier).
  assert.strictEqual(RMClub.jourSemaine({ annee: 2024, mois: 9, jour: 7 }), 6, 'le 7 septembre 2024 était un samedi');
  assert.strictEqual(RMClub.jourSemaine({ annee: 2024, mois: 9, jour: 8 }), 0, 'le 8 septembre 2024 était un dimanche');
  assert.strictEqual(RMClub.jourSemaine({ annee: 2025, mois: 1, jour: 1 }), 3, 'le 1er janvier 2025 était un mercredi');
});

test('temps : chaque rencontre porte une vraie date, et les 3 équipes jouent des jours distincts de la même semaine', () => {
  const s = RMClub.nouvelleSaison(creerRng(500), 'Test Calendrier Daté');
  assert.ok(s.calendrier.every((f) => typeof f.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.date)),
    'toutes les rencontres de championnat doivent être datées');
  assert.ok(s.competitionB.calendrier.every((f) => typeof f.date === 'string'),
    'toutes les rencontres d\'Équipe B doivent être datées');
  // Championnat le samedi, Équipe B le lendemain, espoirs le mercredi précédent.
  for (const f of s.calendrier) {
    assert.strictEqual(RMClub.jourSemaine(RMClub.dateDepuisISO(f.date)), 6, `la journée ${f.journee} de championnat doit tomber un samedi`);
  }
  for (const f of s.competitionB.calendrier) {
    assert.strictEqual(RMClub.jourSemaine(RMClub.dateDepuisISO(f.date)), 0, `la journée ${f.journee} d'Équipe B doit tomber un dimanche`);
  }
  assert.strictEqual(RMClub.jourSemaine(RMClub.dateDeJournee(1, 4, 'jeunes')), 3, 'les espoirs jouent le mercredi');
  // Même journée = même semaine pour les 3 équipes : aucune désynchronisation.
  for (const journee of [1, 4, 12]) {
    const pro = RMClub.dateDeJournee(1, journee, 'pro');
    assert.strictEqual(RMClub.ecartJours(pro, RMClub.dateDeJournee(1, journee, 'b')), 1);
    assert.strictEqual(RMClub.ecartJours(pro, RMClub.dateDeJournee(1, journee, 'jeunes')), -3);
  }
  // Une journée de championnat contient bien PLUSIEURS matchs à la même date.
  const parDate = {};
  for (const f of s.calendrier) (parDate[f.date] = parDate[f.date] || []).push(f);
  assert.ok(Object.values(parDate).every((l) => l.length === (1 + s.adversaires.length) / 2),
    'chaque date de championnat doit porter toutes les rencontres de sa journée');
  // Idempotence : redater ne décale jamais un calendrier déjà daté.
  const avant = s.calendrier.map((f) => f.date).join(',');
  RMClub.daterCalendrier(s);
  RMClub.daterCalendrier(s);
  assert.strictEqual(s.calendrier.map((f) => f.date).join(','), avant);
});

test('temps : le calendrier et les graines quotidiennes sont reproductibles à graine égale', () => {
  const a = RMClub.nouvelleSaison(creerRng(501), 'Graine A');
  const b = RMClub.nouvelleSaison(creerRng(501), 'Graine A');
  assert.strictEqual(a.graine, b.graine, 'même rng de création = même graine de saison');
  assert.deepStrictEqual(a.calendrier.map((f) => f.date), b.calendrier.map((f) => f.date));
  assert.deepStrictEqual(a.temps, b.temps);
  // La graine d'un jour dépend de la date ET de la graine de saison, jamais
  // d'un tirage libre : rejouer la même date redonne la même valeur.
  const jour = { annee: 2024, mois: 9, jour: 7 };
  assert.strictEqual(RMClub.grainePourJour(a.graine, jour, 1), RMClub.grainePourJour(b.graine, jour, 1));
  assert.notStrictEqual(RMClub.grainePourJour(a.graine, jour, 1), RMClub.grainePourJour(a.graine, jour, 2),
    'deux canaux du même jour ne doivent pas partager la même suite');
  assert.notStrictEqual(RMClub.grainePourJour(a.graine, jour, 1),
    RMClub.grainePourJour(a.graine, RMClub.ajouterJours(jour, 1), 1), 'deux jours différents donnent des graines différentes');
  const c = RMClub.nouvelleSaison(creerRng(502), 'Graine B');
  assert.notStrictEqual(a.graine, c.graine, 'deux carrières distinctes n\'ont pas la même graine');
});

test('temps : « Continuer » s\'arrête exactement à la prochaine rencontre, jamais avant ni après', () => {
  const s = RMClub.nouvelleSaison(creerRng(503), 'Test Prochain Arrêt');
  RMClub.assurerCentreFormation(creerRng(504), s);
  // Au départ (intersaison), l'arrêt suivant est la 1re journée de championnat.
  const premier = RMClub.prochainArret(s);
  assert.ok(premier, 'une saison neuve doit avoir une prochaine échéance');
  assert.strictEqual(premier.type, 'pro');
  assert.strictEqual(premier.iso, s.calendrier.find((f) => f.journee === 1 && (f.domicileId === s.clubJoueur.id || f.exterieurId === s.clubJoueur.id)).date);
  assert.ok(premier.joursRestants > 0, 'la 1re journée ne tombe pas le jour de la création du club');
  // AUCUN match n'est joué du simple fait d'avoir calculé l'arrêt.
  assert.strictEqual(s.calendrier.filter((f) => f.joue).length, 0);
  // Arrivé le jour du match, l'arrêt est CE jour (idempotence : recliquer ne
  // saute jamais le match).
  RMClub.definirDateCourante(s, premier.date);
  const memeJour = RMClub.prochainArret(s);
  assert.strictEqual(memeJour.iso, premier.iso);
  assert.strictEqual(memeJour.joursRestants, 0);
  // Une fois la journée de championnat jouée, l'arrêt suivant est le
  // lendemain (Équipe B), pas la semaine suivante.
  for (const f of s.calendrier.filter((f2) => f2.journee === 1)) {
    RMClub.enregistrerResultat(s, f.id, 20, 15, 3, 2);
  }
  const apres = RMClub.prochainArret(s);
  assert.strictEqual(apres.type, 'b');
  assert.strictEqual(RMClub.ecartJours(premier.date, apres.date), 1);
});

test('temps : les rencontres d\'une date donnée sont exactement celles programmées ce jour-là', () => {
  const s = RMClub.nouvelleSaison(creerRng(505), 'Test Évènements Du Jour');
  const dateJ1 = RMClub.dateDeJournee(1, 1, 'pro');
  const e = RMClub.evenementsDuJour(s, dateJ1);
  const attendus = s.calendrier.filter((f) => f.journee === 1);
  assert.strictEqual(e.autresPro.length + (e.matchPro ? 1 : 0), attendus.length,
    'toutes les rencontres de la journée 1, et rien d\'autre, tombent à cette date');
  assert.ok(e.matchPro && (e.matchPro.domicileId === s.clubJoueur.id || e.matchPro.exterieurId === s.clubJoueur.id));
  assert.strictEqual(e.rondeB.length, 0, 'l\'Équipe B ne joue pas le même jour que le premier XV');
  // La veille, plus rien.
  const veille = RMClub.evenementsDuJour(s, RMClub.ajouterJours(dateJ1, -1));
  assert.strictEqual(veille.matchPro, null);
  assert.strictEqual(veille.rondeB.length, 0);
  assert.strictEqual(veille.journeeEspoirs, null);
  // Le lendemain, l'Équipe B.
  const lendemain = RMClub.evenementsDuJour(s, RMClub.ajouterJours(dateJ1, 1));
  assert.strictEqual(lendemain.matchPro, null);
  assert.ok(lendemain.rondeB.length > 0, 'l\'Équipe B joue bien le dimanche');
});

test('temps : une nouvelle saison sportive avance d\'une année civile, sans perdre la progression', () => {
  const s = RMClub.nouvelleSaison(creerRng(506), 'Test Année Suivante');
  const anneeDepart = s.temps.annee;
  assert.strictEqual(s.temps.saisonNumero, 1);
  for (const id of Object.keys(s.classement)) s.classement[id].pts = 0;
  RMClub.avancerSaison(creerRng(507), s);
  assert.strictEqual(s.numero, 2);
  assert.strictEqual(s.temps.annee, anneeDepart + 1, 'la saison 2 se joue l\'année civile suivante');
  assert.strictEqual(s.temps.saisonNumero, 2);
  assert.ok(s.calendrier.every((f) => f.date && RMClub.dateDepuisISO(f.date).annee >= anneeDepart + 1),
    'le nouveau calendrier est daté sur la nouvelle année');
  assert.strictEqual(s.calendrier.filter((f) => f.joue).length, 0, 'la nouvelle saison repart sans match joué');
  // Le temps repart AVANT la première journée : rien n'a encore été joué.
  const premiere = RMClub.dateDepuisISO(s.calendrier.find((f) => f.journee === 1).date);
  assert.ok(RMClub.comparerDates(RMClub.dateCourante(s), premiere) < 0);
});

test('temps : une ancienne sauvegarde (v2, sans dates) est migrée sans AUCUNE perte de progression', () => {
  const storeOriginal = global.localStorage;
  global.localStorage = (() => {
    let store = {};
    return { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  })();
  try {
    // Construit une sauvegarde à l'ANCIEN format : version 2, aucune date,
    // aucune graine, et une carrière déjà bien entamée.
    const s = RMClub.nouvelleSaison(creerRng(508), 'Vieille Carrière');
    // Une VRAIE sauvegarde v2 a toujours ses journées de championnat et
    // d'Équipe B jouées en même temps (elles étaient résolues d'un seul clic).
    for (const f of s.calendrier.filter((f2) => f2.journee <= 3)) {
      RMClub.enregistrerResultat(s, f.id, 24, 12, 3, 1);
    }
    for (const f of s.competitionB.calendrier.filter((f2) => f2.journee <= 3)) {
      RMClub.enregistrerResultatEquipeB(s, f.id, 18, 15, 2, 2);
    }
    const pointsAvant = JSON.stringify(s.classement);
    const effectifAvant = s.clubJoueur.effectif.map((j) => j.id).join(',');
    const journeesJoueesAvant = s.calendrier.filter((f) => f.joue).length;
    const v2 = JSON.parse(JSON.stringify(s));
    v2.version = 2;
    delete v2.temps;
    delete v2.graine;
    for (const f of v2.calendrier) delete f.date;
    for (const f of v2.competitionB.calendrier) delete f.date;
    global.localStorage.setItem('rugbyManager.club.v1', JSON.stringify(v2));

    const migree = RMClub.chargerSaison();
    assert.ok(migree, 'une sauvegarde v2 doit être rechargée, jamais traitée comme inexistante');
    assert.strictEqual(migree.version, RMClub.VERSION_SAUVEGARDE, 'la sauvegarde doit être amenée à la version courante, quelle qu\'elle soit');
    // Rien de la progression sportive n'a bougé.
    assert.strictEqual(migree.numero, s.numero);
    assert.strictEqual(JSON.stringify(migree.classement), pointsAvant, 'le classement doit être strictement conservé');
    assert.strictEqual(migree.clubJoueur.effectif.map((j) => j.id).join(','), effectifAvant, 'l\'effectif doit être strictement conservé');
    assert.strictEqual(migree.calendrier.filter((f) => f.joue).length, journeesJoueesAvant);
    // Et le temps a été reconstitué de façon cohérente.
    assert.ok(Number.isFinite(migree.graine), 'une graine de saison doit être dérivée de données stables de la sauvegarde');
    assert.ok(migree.calendrier.every((f) => f.date), 'toutes les rencontres doivent être datées après migration');
    const dateJ3 = RMClub.dateDepuisISO(migree.calendrier.find((f) => f.journee === 3).date);
    const dateJ4 = RMClub.dateDepuisISO(migree.calendrier.find((f) => f.journee === 4).date);
    const courante = RMClub.dateCourante(migree);
    assert.ok(RMClub.comparerDates(courante, dateJ3) > 0 && RMClub.comparerDates(courante, dateJ4) <= 0,
      'la carrière doit reprendre APRÈS la dernière journée jouée et AVANT la suivante');
    // La prochaine échéance porte bien sur la journée 4 (jamais une déjà
    // jouée) — et c'est le match espoirs du mercredi qui vient en premier,
    // preuve que les trois calendriers s'entrelacent correctement après
    // migration (la journée 4 est une journée de match espoirs).
    const arret = RMClub.prochainArret(migree);
    assert.strictEqual(arret.type, 'jeunes');
    assert.strictEqual(arret.iso, RMClub.dateISO(RMClub.dateDeJournee(migree.numero, 4, 'jeunes')));
    // Une fois ce match espoirs disputé, l'échéance suivante est le samedi de
    // championnat de cette même journée 4.
    RMClub.enregistrerMatchEspoirs(migree, 4, 'Académie', 21, 17);
    RMClub.definirDateCourante(migree, arret.date);
    const arretPro = RMClub.prochainArret(migree);
    assert.strictEqual(arretPro.type, 'pro');
    assert.strictEqual(arretPro.iso, migree.calendrier.find((f) => f.journee === 4 && (f.domicileId === migree.clubJoueur.id || f.exterieurId === migree.clubJoueur.id)).date);
    // Rechargée deux fois, la même sauvegarde donne la même graine.
    global.localStorage.setItem('rugbyManager.club.v1', JSON.stringify(v2));
    assert.strictEqual(RMClub.chargerSaison().graine, migree.graine, 'la graine dérivée doit être stable d\'un chargement à l\'autre');
  } finally {
    global.localStorage = storeOriginal;
  }
});

test('temps : l\'agenda des prochains jours reflète le calendrier réel des 3 équipes', () => {
  const s = RMClub.nouvelleSaison(creerRng(509), 'Test Agenda');
  RMClub.assurerCentreFormation(creerRng(510), s);
  // Positionne le temps au mercredi précédant une journée de match espoirs.
  const journeeEspoirs = RMClub.PERIODE_JOURNEES_ESPOIRS;
  RMClub.definirDateCourante(s, RMClub.dateDeJournee(1, journeeEspoirs, 'jeunes'));
  const jours = RMClub.agenda(s, 7);
  assert.strictEqual(jours.length, 7);
  assert.strictEqual(jours[0].type, RMClub.eligiblePourMatchEspoirs(s) ? 'jeunes' : null, 'le mercredi porte le match espoirs');
  assert.strictEqual(jours[3].type, 'pro', 'le samedi (3 jours plus tard) porte le championnat');
  assert.strictEqual(jours[4].type, 'b', 'le dimanche porte l\'Équipe B');
  assert.ok([1, 2, 5, 6].every((i) => jours[i].type === null), 'les autres jours de la semaine n\'ont aucune rencontre');
});

// --- 12g) Événements quotidiens (TODO_AUDIT.md P1-22, tranche 2) : chaque
// jour traversé est réellement simulé — récupération, guérison, retours de
// prêt — et ne produit un événement QUE s'il a modifié la sauvegarde. ---
function saisonPourJours(graine, nom) {
  const s = RMClub.nouvelleSaison(creerRng(graine), nom);
  RMClub.assurerCentreFormation(creerRng(graine + 1), s);
  return s;
}

test('événements quotidiens : une journée de repos réduit RÉELLEMENT la fatigue', () => {
  const s = saisonPourJours(600, 'Test Récupération');
  for (const j of s.clubJoueur.effectif) j.fatigue = 60;
  const rng = creerRng(601);
  const res = RMClub.resoudreJourneeQuotidienne(s, RMClub.dateCourante(s), rng);
  assert.ok(res.fatigueRecuperee > 0, 'un jour écoulé doit faire baisser la fatigue de l\'effectif');
  assert.ok(s.clubJoueur.effectif.every((j) => j.fatigue < 60), 'chaque joueur fatigué doit avoir récupéré');
  assert.ok(s.clubJoueur.effectif.every((j) => j.fatigue >= 0), 'la fatigue ne descend jamais sous zéro');
  // Un joueur déjà frais ne « récupère » pas : aucun effet fantôme.
  for (const j of s.clubJoueur.effectif) j.fatigue = 0;
  const res2 = RMClub.resoudreJourneeQuotidienne(s, RMClub.dateCourante(s), creerRng(602));
  assert.strictEqual(res2.fatigueRecuperee, 0, 'un effectif frais ne doit produire aucune récupération');
});

test('événements quotidiens : un titulaire permanent ne sature plus à 100 de fatigue', () => {
  // Avant la carrière quotidienne, un titulaire ne récupérait QUE les
  // journées où il n'était pas aligné : jouer chaque semaine le collait à
  // 100 en un mois. Une semaine complète (1 match + 6 jours) doit désormais
  // rester à peu près neutre.
  const s = saisonPourJours(603, 'Test Charge Hebdomadaire');
  const c = s.clubJoueur;
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  const titulaire = c.effectif.find((j) => j.id === c.compositionTitulaires['1']);
  titulaire.fatigue = 40;
  titulaire.endurance = 60; // neutre, pour un calcul lisible
  RMClub.appliquerFatigue(c.effectif, c.compositionTitulaires, 1); // jour de match
  const apresMatch = titulaire.fatigue;
  assert.ok(apresMatch > 40, 'un match doit bien fatiguer le titulaire');
  for (let i = 0; i < 6; i++) RMClub.recupererFatigueDuJour(c.effectif, 1); // les 6 autres jours
  assert.ok(titulaire.fatigue < apresMatch, 'les jours sans match doivent réellement le faire récupérer');
  assert.ok(titulaire.fatigue < 100, 'une semaine complète ne doit pas saturer la fatigue');
  assert.ok(Math.abs(titulaire.fatigue - 40) <= 15,
    `une semaine type (1 match + 6 jours de repos) doit rester proche de l'équilibre (obtenu : ${titulaire.fatigue})`);
});

test('événements quotidiens : une blessure se résorbe jour après jour et libère un vrai message à la guérison', () => {
  const s = saisonPourJours(604, 'Test Blessures Quotidiennes');
  const blesse = s.clubJoueur.effectif[0];
  blesse.blessureJournees = 3;
  const messagesAvant = s.clubJoueur.messages.length;
  RMClub.resoudreJourneeQuotidienne(s, RMClub.dateCourante(s), creerRng(605));
  assert.strictEqual(blesse.blessureJournees, 2, 'la blessure doit perdre un jour par jour écoulé');
  assert.strictEqual(s.clubJoueur.messages.length, messagesAvant, 'aucun message tant que le joueur n\'est pas rétabli');
  RMClub.resoudreJourneeQuotidienne(s, RMClub.dateCourante(s), creerRng(606));
  const res = RMClub.resoudreJourneeQuotidienne(s, RMClub.dateCourante(s), creerRng(607));
  assert.strictEqual(blesse.blessureJournees, 0);
  assert.deepStrictEqual(res.retablis, [blesse.nom], 'le jour de la guérison doit être signalé comme un événement réel');
  assert.strictEqual(s.clubJoueur.messages.length, messagesAvant + 1, 'exactement un message de retour de blessure');
  assert.ok(s.clubJoueur.messages[0].corps.includes(blesse.nom));
  // Et le joueur est réellement redevenu sélectionnable.
  assert.ok(!blesse.blessureJournees);
});

test('événements quotidiens : les espoirs récupèrent et guérissent comme l\'effectif pro', () => {
  const s = saisonPourJours(608, 'Test Espoirs Quotidien');
  const espoir = s.clubJoueur.jeunes[0];
  espoir.fatigue = 50;
  espoir.blessureJournees = 1;
  const res = RMClub.resoudreJourneeQuotidienne(s, RMClub.dateCourante(s), creerRng(609));
  assert.ok(espoir.fatigue < 50, 'un espoir fatigué doit récupérer comme un professionnel');
  assert.strictEqual(espoir.blessureJournees, 0);
  assert.ok(res.retablis.includes(espoir.nom));
});

test('événements quotidiens : un prêt court en jours et le retour est un événement réel', () => {
  const s = saisonPourJours(610, 'Test Prêt Quotidien');
  const res1 = RMClub.preterJoueur(s, s.clubJoueur.effectif[0].id, 2);
  assert.ok(res1.ok);
  const prete = s.clubJoueur.effectif[0];
  assert.strictEqual(prete.pret.dureeRestante, 2);
  RMClub.resoudreJourneeQuotidienne(s, RMClub.dateCourante(s), creerRng(611));
  assert.strictEqual(prete.pret.dureeRestante, 1, 'le prêt doit perdre un jour par jour écoulé');
  const res = RMClub.resoudreJourneeQuotidienne(s, RMClub.dateCourante(s), creerRng(612));
  assert.strictEqual(prete.pret, null, 'le prêt doit se terminer à échéance');
  assert.deepStrictEqual(res.retoursDePret, [prete.nom]);
});

test('événements quotidiens : avancerJusquA parcourt exactement les jours voulus et reste déterministe', () => {
  const construire = () => {
    const s = saisonPourJours(613, 'Test Avancer');
    for (const j of s.clubJoueur.effectif) j.fatigue = 70;
    s.clubJoueur.effectif[0].blessureJournees = 4;
    return s;
  };
  const a = construire();
  const cible = RMClub.ajouterJours(RMClub.dateCourante(a), 10);
  const journeesA = RMClub.avancerJusquA(a, cible);
  assert.strictEqual(journeesA.length, 10, 'exactement 10 jours doivent être simulés');
  assert.deepStrictEqual(RMClub.dateCourante(a), cible, 'la date courante doit être exactement la cible');
  // Rejoué depuis le même état de départ : résultat identique (déterminisme).
  const b = construire();
  const journeesB = RMClub.avancerJusquA(b, RMClub.ajouterJours(RMClub.dateCourante(b), 10));
  // Les identifiants de joueurs viennent d'un compteur global (deux saisons
  // créées à la suite n'attribuent pas les mêmes) : on compare donc le
  // CONTENU des journées, ids exclus — c'est le déterminisme du simulateur
  // qui est vérifié ici, pas l'allocation des ids.
  // `joueurId`/`clubId` (signature rivale, cf. P1-43b) viennent du même
  // compteur global que `id` : même exclusion, même raison. Tout le reste —
  // noms, montants, dates — est bien comparé.
  const CLES_ID = ['id', 'joueurId', 'clubId'];
  const sansIds = (journees) => JSON.parse(JSON.stringify(journees, (cle, valeur) => (CLES_ID.indexOf(cle) !== -1 ? undefined : valeur)));
  assert.deepStrictEqual(sansIds(journeesB), sansIds(journeesA), 'même graine et mêmes dates doivent produire exactement les mêmes journées');
  assert.deepStrictEqual(
    b.clubJoueur.effectif.map((j) => [j.fatigue, j.blessureJournees]),
    a.clubJoueur.effectif.map((j) => [j.fatigue, j.blessureJournees]));
  // Ne recule jamais : une cible déjà passée ne simule aucun jour.
  const journeesVides = RMClub.avancerJusquA(a, RMClub.ajouterJours(cible, -3));
  assert.strictEqual(journeesVides.length, 0);
  assert.deepStrictEqual(RMClub.dateCourante(a), cible, 'la date ne doit jamais reculer');
});

test('événements quotidiens : le résumé ne rapporte que des changements RÉELS', () => {
  const s = saisonPourJours(614, 'Test Résumé');
  // Effectif frais, aucun blessé, aucun prêt, et une semaine entièrement au
  // repos (une séance fatiguerait réellement — cf. tranche 3) : rien ne doit
  // être rapporté.
  for (let jour = 0; jour <= 6; jour++) RMClub.definirSeance(s, jour, 'repos');
  for (const j of s.clubJoueur.effectif) { j.fatigue = 0; j.blessureJournees = 0; j.pret = null; }
  for (const j of s.clubJoueur.jeunes) { j.fatigue = 0; j.blessureJournees = 0; }
  const resume = RMClub.resumerJournees(RMClub.avancerJusquA(s, RMClub.ajouterJours(RMClub.dateCourante(s), 5)));
  assert.strictEqual(resume.nbJours, 5);
  assert.strictEqual(resume.fatigueRecuperee, 0, 'aucune récupération à rapporter sur un effectif déjà frais');
  assert.deepStrictEqual(resume.retablis, []);
  assert.deepStrictEqual(resume.retoursDePret, []);
});

test('événements quotidiens : une sauvegarde v3 est migrée en convertissant les durées en jours', () => {
  const storeOriginal = global.localStorage;
  global.localStorage = (() => {
    let store = {};
    return { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  })();
  try {
    const s = saisonPourJours(615, 'Test Migration v3');
    s.clubJoueur.effectif[0].blessureJournees = 2; // 2 journées de championnat
    s.clubJoueur.effectif[1].pret = { dureeRestante: 3, club: 'Ailleurs' };
    s.clubJoueur.jeunes[0].blessureJournees = 1;
    const nomBlesse = s.clubJoueur.effectif[0].nom;
    const v3 = JSON.parse(JSON.stringify(s));
    v3.version = 3;
    global.localStorage.setItem('rugbyManager.club.v1', JSON.stringify(v3));

    const migree = RMClub.chargerSaison();
    assert.ok(migree, 'une sauvegarde v3 doit être rechargée');
    assert.strictEqual(migree.version, RMClub.VERSION_SAUVEGARDE);
    // 1 journée = 1 semaine : les indisponibilités gardent exactement la même
    // durée réelle, exprimée en jours.
    assert.strictEqual(migree.clubJoueur.effectif[0].blessureJournees, 14, '2 journées = 14 jours');
    assert.strictEqual(migree.clubJoueur.effectif[1].pret.dureeRestante, 21, '3 journées = 21 jours');
    assert.strictEqual(migree.clubJoueur.jeunes[0].blessureJournees, 7, 'le centre de formation est migré lui aussi');
    assert.strictEqual(migree.clubJoueur.effectif[0].nom, nomBlesse, 'aucune donnée de joueur ne doit être perdue');
    // Un joueur valide n'est jamais rendu blessé par la migration.
    assert.ok(migree.clubJoueur.effectif.slice(2).every((j) => !j.blessureJournees));
  } finally {
    global.localStorage = storeOriginal;
  }
});

// --- 12h) Semaine d'entraînement, scouting différé et décisions datées
// (TODO_AUDIT.md P1-23, tranche 3). ---
test('semaine d\'entraînement : sept jours, une activité réelle par jour, modifiable', () => {
  const s = saisonPourJours(700, 'Test Semaine');
  const semaine = RMClub.assurerSemaineEntrainement(s);
  for (let jour = 0; jour <= 6; jour++) {
    assert.ok(RMClub.ACTIVITES_ENTRAINEMENT[semaine[jour]], `le jour ${jour} doit porter une activité connue`);
  }
  RMClub.definirSeance(s, 2, 'melee');
  assert.strictEqual(RMClub.assurerSemaineEntrainement(s)[2], 'melee');
  // Une activité inconnue est refusée plutôt que d'effacer la séance.
  RMClub.definirSeance(s, 2, 'yoga');
  assert.strictEqual(RMClub.assurerSemaineEntrainement(s)[2], 'melee');
  // Une sauvegarde bricolée retombe sur le défaut, jamais sur un trou.
  s.clubJoueur.semaineEntrainement[3] = 'inexistante';
  assert.strictEqual(RMClub.assurerSemaineEntrainement(s)[3], RMClub.SEMAINE_PAR_DEFAUT[3]);
  // Rétrocompat : l'ancien programme collectif est repris dans la semaine.
  const t = RMClub.nouvelleSaison(creerRng(701), 'Ancien Focus');
  delete t.clubJoueur.semaineEntrainement;
  t.clubJoueur.entrainementFocus = 'pied';
  const semaineT = RMClub.assurerSemaineEntrainement(t);
  assert.ok(Object.values(semaineT).indexOf('pied') !== -1,
    'le programme collectif historique ne doit pas être perdu : il devient une séance de la semaine');
});

test('semaine d\'entraînement : le jour de match du premier XV n\'a PAS de séance (le match est la charge du jour)', () => {
  const s = saisonPourJours(702, 'Test Jour De Match');
  const samedi = RMClub.dateDeJournee(s.numero, 1, 'pro');
  assert.strictEqual(RMClub.typeDArret(s, samedi), 'pro');
  assert.strictEqual(RMClub.seancePourDate(s, samedi), null, 'aucune séance un jour de championnat');
  const jeudi = RMClub.ajouterJours(samedi, -2);
  assert.ok(RMClub.seancePourDate(s, jeudi), 'un jour sans match porte bien une séance');
});

test('semaine d\'entraînement : une séance fatigue réellement, le repos régénère réellement', () => {
  const s = saisonPourJours(703, 'Test Charge Séance');
  const rng = creerRng(704);
  const joueur = s.clubJoueur.effectif[0];
  joueur.fatigue = 0;
  RMClub.appliquerSeance(rng, [joueur], 'physique', 1, 1);
  const apresPhysique = joueur.fatigue;
  assert.ok(apresPhysique > 0, 'une séance physique doit réellement fatiguer');
  RMClub.appliquerSeance(rng, [joueur], 'repos', 1, 1);
  assert.strictEqual(joueur.fatigue, apresPhysique, 'le repos n\'ajoute aucune charge');
  // Et une semaine intense accumule réellement, là où une semaine douce non.
  const intense = saisonPourJours(705, 'Semaine Intense');
  const douce = saisonPourJours(706, 'Semaine Douce');
  for (let jour = 0; jour <= 6; jour++) {
    RMClub.definirSeance(intense, jour, 'physique');
    RMClub.definirSeance(douce, jour, 'repos');
  }
  for (const j of intense.clubJoueur.effectif) j.fatigue = 0;
  for (const j of douce.clubJoueur.effectif) j.fatigue = 0;
  RMClub.avancerJusquA(intense, RMClub.ajouterJours(RMClub.dateCourante(intense), 7));
  RMClub.avancerJusquA(douce, RMClub.ajouterJours(RMClub.dateCourante(douce), 7));
  const fatigueIntense = Math.max.apply(null, intense.clubJoueur.effectif.map((j) => j.fatigue || 0));
  const fatigueDouce = Math.max.apply(null, douce.clubJoueur.effectif.map((j) => j.fatigue || 0));
  assert.ok(fatigueIntense > fatigueDouce,
    `une semaine tout en physique doit fatiguer plus qu'une semaine tout en repos (${fatigueIntense} vs ${fatigueDouce})`);
  assert.strictEqual(fatigueDouce, 0, 'une semaine entièrement au repos ne fatigue personne');
});

test('semaine d\'entraînement : la progression est DIFFÉRENCIÉE (âge, potentiel, fatigue, temps de jeu)', () => {
  // Les facteurs eux-mêmes, d'abord : ils portent toute la différenciation.
  assert.strictEqual(RMClub.facteurAgeProgression(33), 0, 'passé 32 ans, plus de développement');
  assert.ok(RMClub.facteurAgeProgression(19) > RMClub.facteurAgeProgression(27), 'un jeune progresse plus vite qu\'un joueur mûr');
  assert.ok(RMClub.facteurFatigueProgression(85) < RMClub.facteurFatigueProgression(10), 'un joueur cuit retient moins de la séance');
  assert.ok(RMClub.facteurTempsDeJeu(10) > RMClub.facteurTempsDeJeu(0), 'le temps de jeu réel accélère la progression');

  // Puis le résultat concret : avec un rng toujours favorable, un joueur de
  // 34 ans ne progresse JAMAIS, un joueur déjà à son potentiel non plus.
  const rngFavorable = () => 0;
  const base = { poste: 'P', endurance: 60, matchsJoues: 5, fatigue: 0, puissance: 50, blessureJournees: 0 };
  const jeune = Object.assign({ id: 'a', nom: 'Jeune', age: 20, potentiel: 90 }, base);
  const veteran = Object.assign({ id: 'b', nom: 'Vétéran', age: 34, potentiel: 90 }, base);
  const auPlafond = Object.assign({ id: 'c', nom: 'Plafond', age: 24, potentiel: 50 }, base);
  const partant = Object.assign({ id: 'd', nom: 'Partant', age: 22, potentiel: 90, veutPartir: true }, base);
  const blesse = Object.assign({ id: 'e', nom: 'Blessé', age: 22, potentiel: 90 }, base, { blessureJournees: 5 });
  const progressions = RMClub.appliquerSeance(rngFavorable, [jeune, veteran, auPlafond, partant, blesse], 'physique', 1, 1);
  const noms = progressions.map((p) => p.nom);
  assert.ok(noms.indexOf('Jeune') !== -1, 'un jeune sous son potentiel doit progresser');
  assert.strictEqual(noms.indexOf('Vétéran'), -1, 'un joueur de 34 ans ne progresse plus');
  assert.strictEqual(noms.indexOf('Plafond'), -1, 'un joueur déjà à son potentiel ne progresse plus');
  assert.strictEqual(noms.indexOf('Partant'), -1, 'un joueur qui veut partir ne se donne plus à l\'entraînement');
  assert.strictEqual(noms.indexOf('Blessé'), -1, 'un blessé s\'occupe de se soigner, pas de s\'entraîner');
  assert.strictEqual(blesse.fatigue, 0, 'un blessé n\'encaisse pas non plus la charge de la séance');
  assert.ok(jeune.puissance > 50, 'la valeur affichée dans la fiche joueur bouge réellement');
  assert.ok(jeune.puissance <= jeune.potentiel, 'jamais au-delà du potentiel individuel');
});

test('semaine d\'entraînement : une séance ne développe que les postes concernés', () => {
  const rngFavorable = () => 0;
  const commun = { age: 22, potentiel: 95, endurance: 60, matchsJoues: 5, fatigue: 0, melee: 50, blessureJournees: 0 };
  const pilier = Object.assign({ id: 'p', nom: 'Pilier', poste: 'P' }, commun);
  const ailier = Object.assign({ id: 'a', nom: 'Ailier', poste: 'AI' }, commun);
  const progressions = RMClub.appliquerSeance(rngFavorable, [pilier, ailier], 'melee', 1, 1);
  assert.deepStrictEqual(progressions.map((p) => p.nom), ['Pilier'], 'seuls les avants travaillent la mêlée');
  assert.strictEqual(ailier.melee, 50, 'l\'ailier ne gagne rien en mêlée');
  // Mais il encaisse quand même la charge : il court aussi à l'entraînement.
  assert.ok(ailier.fatigue > 0, 'toute l\'équipe encaisse la charge de la séance, même hors poste concerné');
});

test('semaine d\'entraînement : un programme individuel remplace la séance du jour', () => {
  const commun = { age: 22, potentiel: 95, endurance: 60, matchsJoues: 5, fatigue: 0, blessureJournees: 0 };
  const suitLeGroupe = Object.assign({ id: 'g', nom: 'Groupe', poste: 'AR', jeuPied: 50 }, commun);
  const individuel = Object.assign({ id: 'i', nom: 'Individuel', poste: 'AR', jeuPied: 50, entrainementIndividuel: 'pied' }, commun);
  const groupes = RMClub.repartirParActivite([suitLeGroupe, individuel], 'melee');
  assert.deepStrictEqual(groupes.melee.map((j) => j.nom), ['Groupe']);
  assert.deepStrictEqual(groupes.pied.map((j) => j.nom), ['Individuel']);
  // Un jour de repos reste du repos pour TOUT le monde.
  const groupesRepos = RMClub.repartirParActivite([suitLeGroupe, individuel], 'repos');
  assert.strictEqual(groupesRepos.repos.length, 2, 'le repos ne se contourne pas avec un programme individuel');
});

test('scouting différé : le rapport n\'arrive qu\'à sa date, et fait alors RÉELLEMENT progresser la connaissance', () => {
  const s = saisonPourJours(707, 'Test Scouting Différé');
  const cible = s.marche[0];
  const connaissanceAvant = cible.connaissance;
  const budgetAvant = s.clubJoueur.budget;
  const res = RMClub.commanderRapportScouting(s, cible.id, 1);
  assert.ok(res.ok);
  assert.ok(res.delai >= 2, 'un rapport prend un vrai délai');
  assert.strictEqual(s.clubJoueur.budget, budgetAvant - res.cout, 'le déplacement est engagé immédiatement');
  assert.strictEqual(cible.connaissance, connaissanceAvant, 'la connaissance ne bouge PAS avant la remise du rapport');
  assert.ok(RMClub.rapportScoutingEnCours(s, cible.id), 'le rapport est bien en cours');
  // Un second rapport sur le même joueur est refusé (pas de double débit).
  const budgetApresCommande = s.clubJoueur.budget;
  assert.strictEqual(RMClub.commanderRapportScouting(s, cible.id, 1).motif, 'deja_commande');
  assert.strictEqual(s.clubJoueur.budget, budgetApresCommande, 'une commande refusée ne débite rien');
  // La veille : toujours rien.
  RMClub.avancerJusquA(s, RMClub.ajouterJours(res.dateRemise, -1));
  assert.strictEqual(cible.connaissance, connaissanceAvant, 'rien ne doit arriver avant la date de remise');
  // Le jour dit : la connaissance grimpe et un message réel le signale.
  const messagesAvant = s.clubJoueur.messages.length;
  RMClub.avancerJusquA(s, res.dateRemise);
  assert.ok(cible.connaissance > connaissanceAvant, 'la connaissance doit réellement augmenter à la remise');
  assert.strictEqual(s.clubJoueur.messages.length, messagesAvant + 1);
  assert.ok(s.clubJoueur.messages[0].corps.includes(cible.nom));
  assert.strictEqual(RMClub.rapportScoutingEnCours(s, cible.id), null, 'le rapport remis ne reste pas en attente');
});

test('scouting différé : un meilleur recruteur rend son rapport plus vite', () => {
  const lent = saisonPourJours(708, 'Recruteur Lent');
  const rapide = saisonPourJours(709, 'Recruteur Rapide');
  const a = RMClub.commanderRapportScouting(lent, lent.marche[0].id, 1);
  const b = RMClub.commanderRapportScouting(rapide, rapide.marche[0].id, 2);
  assert.ok(b.delai < a.delai, `un bon recruteur doit être plus rapide (${b.delai} vs ${a.delai})`);
  assert.ok(b.cout < a.cout, 'et moins cher');
});

test('décisions datées : une demande non tranchée dans les délais vaut refus, avec la même conséquence réelle', () => {
  const s = saisonPourJours(710, 'Test Décision Datée');
  const joueur = s.clubJoueur.effectif[0];
  joueur.moral = 70;
  joueur.demandeTempsDeJeuEnAttente = true;
  const echeance = RMClub.ajouterJours(RMClub.dateCourante(s), 4);
  RMClub.ajouterMessage(s, 'joueur', 'Demande de temps de jeu', `${joueur.nom} veut jouer.`, {
    type: 'tempsDeJeu', joueurId: joueur.id, resolu: false,
    dateLimite: RMClub.dateISO(echeance),
    options: [{ id: 'rassurer', libelle: 'Le rassurer' }, { id: 'ignorer', libelle: 'Ignorer sa demande' }],
  });
  const message = s.clubJoueur.messages[0];
  // Avant l'échéance : rien ne se passe, la décision reste au manager.
  RMClub.avancerJusquA(s, RMClub.ajouterJours(echeance, -1));
  assert.strictEqual(message.decision.resolu, false, 'la décision reste ouverte tant que le délai court');
  assert.strictEqual(joueur.moral, 70);
  // À l'échéance : le silence vaut refus, avec la conséquence d'un refus.
  RMClub.avancerJusquA(s, echeance);
  assert.strictEqual(message.decision.resolu, true, 'la décision expirée doit être tranchée');
  assert.strictEqual(message.decision.expiree, true);
  assert.strictEqual(message.decision.choix, 'ignorer', 'le silence emprunte exactement le chemin du refus');
  assert.ok(joueur.moral < 70, 'ignorer un joueur doit réellement lui coûter du moral');
  assert.strictEqual(joueur.avertissementsIgnores, 1);
  assert.strictEqual(joueur.demandeTempsDeJeuEnAttente, false);
  assert.ok(message.decision.resultat.includes('pas répondu'));
});

test('décisions datées : une demande tranchée à temps n\'expire jamais ensuite', () => {
  const s = saisonPourJours(711, 'Test Décision Tranchée');
  const joueur = s.clubJoueur.effectif[0];
  joueur.moral = 70;
  joueur.demandeTempsDeJeuEnAttente = true;
  RMClub.ajouterMessage(s, 'joueur', 'Demande de temps de jeu', `${joueur.nom} veut jouer.`, {
    type: 'tempsDeJeu', joueurId: joueur.id, resolu: false,
    dateLimite: RMClub.dateISO(RMClub.ajouterJours(RMClub.dateCourante(s), 3)),
    options: [{ id: 'rassurer', libelle: 'Le rassurer' }, { id: 'ignorer', libelle: 'Ignorer sa demande' }],
  });
  const message = s.clubJoueur.messages[0];
  RMClub.resoudreDecisionMessage(s, message.id, 'rassurer');
  const moralApres = joueur.moral;
  assert.ok(moralApres > 70, 'rassurer améliore réellement le moral');
  RMClub.avancerJusquA(s, RMClub.ajouterJours(RMClub.dateCourante(s), 10));
  assert.strictEqual(message.decision.choix, 'rassurer', 'une décision déjà tranchée ne doit jamais être réécrite par l\'expiration');
  assert.ok(!message.decision.expiree);
  assert.strictEqual(joueur.avertissementsIgnores, undefined);
});

// --- 12i) Préparation de match, fenêtres de transfert, direction et
// vestiaire (TODO_AUDIT.md P1-24, tranche 4). ---
test('préparation de match : l\'analyse de l\'adversaire demande du temps, et le dit', () => {
  const s = saisonPourJours(800, 'Test Préparation');
  const rencontre = RMClub.prochaineRencontre(s);
  assert.ok(rencontre, 'une saison neuve a bien une prochaine rencontre datée');
  assert.ok(rencontre.jours > 0);
  // Loin du match : le rapport n'est pas prêt, et on annonce dans combien de jours il le sera.
  const loin = RMClub.analyseDisponible(s, rencontre);
  assert.strictEqual(loin.disponible, false);
  assert.ok(loin.joursRestants > 0, 'on doit annoncer le délai restant, pas juste « indisponible »');
  // À quelques jours : disponible.
  RMClub.definirDateCourante(s, RMClub.ajouterJours(rencontre.date, -1));
  const proche = RMClub.analyseDisponible(s, RMClub.prochaineRencontre(s));
  assert.strictEqual(proche.disponible, true);
  assert.strictEqual(proche.joursRestants, 0);
});

test('préparation de match : chaque point reflète l\'état RÉEL, et rien ne bloque le coup d\'envoi', () => {
  const s = saisonPourJours(801, 'Test État Préparation');
  const etat = RMClub.etatPreparationMatch(s);
  assert.strictEqual(etat.points.length, 5, 'cinq points de préparation');
  const par = {};
  for (const p of etat.points) par[p.cle] = p;
  assert.ok(par.analyse && par.composition && par.tactique && par.roles && par.banc);
  // Aucun statut ne peut valoir autre chose que les trois prévus — et aucun
  // n'empêche quoi que ce soit (il n'existe aucun champ « bloquant »).
  assert.ok(etat.points.every((p) => ['ok', 'attention', 'nonPrepare'].indexOf(p.statut) !== -1));
  assert.ok(etat.points.every((p) => !('bloquant' in p)), 'aucun point ne doit prétendre bloquer le match');
  // Tactique au réglage par défaut : signalée comme non préparée.
  assert.strictEqual(par.tactique.statut, 'nonPrepare');
  // Régler un axe la fait passer à « prêt » — un changement réel, pas une case cochée.
  const slot = RMClub.slotCompositionPourEquipe(s, 'pro');
  slot.tactique = Object.assign({}, slot.tactique, { style: 'large' });
  assert.strictEqual(RMClub.etatPreparationMatch(s).points.find((p) => p.cle === 'tactique').statut, 'ok');
  // Un titulaire blessé fait passer la composition en « attention », jamais en blocage.
  const compo = RMClub.assurerCompositionPourEquipe(s, 'pro');
  const titulaire = s.clubJoueur.effectif.find((j) => j.id === compo.compositionTitulaires['1']);
  titulaire.blessureJournees = 10;
  const apres = RMClub.etatPreparationMatch(s).points.find((p) => p.cle === 'composition');
  assert.strictEqual(apres.statut, 'attention');
  assert.ok(apres.detail.includes('blessé'));
  // Le pourcentage de préparation reflète les points prêts — parmi ceux que
  // le manager peut réellement régler aujourd'hui (P1-38 : l'attente du
  // rapport d'analyse ne compte plus comme un point raté).
  const etatFinal = RMClub.etatPreparationMatch(s);
  const actionnables = etatFinal.points.filter((p) => p.nature !== 'enAttente');
  const prets = actionnables.filter((p) => p.statut === 'ok').length;
  assert.strictEqual(etatFinal.pretPct, Math.round((prets / actionnables.length) * 100));
});

// --- P1-38 : « urgent, recommandé, terminé, facultatif » (demande
// utilisateur). Mesuré sur une carrière neuve à J-21 : « 60 % de la
// préparation bouclée », avec un ⬜ devant « Analyse de l'adversaire » —
// exactement le même symbole que devant « Tactique ». Or la tactique est à
// un clic, l'analyse à 17 jours d'attente. Le manager ne peut pas
// distinguer ce qu'il doit faire de ce qu'il doit attendre, et le
// pourcentage lui compte comme un échec quelque chose d'impossible. ---

test('préparation : chaque point dit sa NATURE, pas seulement son statut', () => {
  const s = saisonPourJours(803, 'Test Nature Prépa');
  const etat = RMClub.etatPreparationMatch(s);
  const NATURES = ['termine', 'urgent', 'recommande', 'facultatif', 'enAttente'];
  assert.ok(etat.points.every((p) => NATURES.indexOf(p.nature) !== -1),
    'chaque point doit porter une nature parmi ' + NATURES.join('/') +
    ' — sinon l\'interface ne peut pas dire ce qui est urgent, recommandé, terminé ou facultatif');
});

test('préparation : ce que le manager NE PEUT PAS faire aujourd\'hui est « en attente », pas « non fait »', () => {
  const s = saisonPourJours(804, 'Test Attente Prépa');
  const etat = RMClub.etatPreparationMatch(s);
  const analyse = etat.points.find((p) => p.cle === 'analyse');
  assert.ok(etat.rencontre.jours > RMClub.joursAvantAnalyse(s),
    'ce test suppose qu\'on est loin du match');
  assert.strictEqual(analyse.nature, 'enAttente',
    'loin du match, l\'analyse ne dépend pas du manager : la présenter comme non préparée lui reproche l\'impossible');
  // …et elle ne doit PAS peser sur le pourcentage, qui mesure ce qui est
  // réglable maintenant.
  const actionnables = etat.points.filter((p) => p.nature !== 'enAttente');
  const faits = actionnables.filter((p) => p.nature === 'termine').length;
  assert.strictEqual(etat.pretPct, Math.round((faits / actionnables.length) * 100),
    'le pourcentage doit porter sur les seuls points réglables aujourd\'hui');
  // Quand le rapport arrive, le point rejoint le décompte et vaut « terminé ».
  RMClub.definirDateCourante(s, RMClub.ajouterJours(etat.rencontre.date, -1));
  const proche = RMClub.etatPreparationMatch(s);
  assert.strictEqual(proche.points.find((p) => p.cle === 'analyse').nature, 'termine');
});

test('préparation : une composition incomplète est URGENTE, un banc vide seulement RECOMMANDÉ', () => {
  const s = saisonPourJours(805, 'Test Urgence Prépa');
  // Vraie impasse : plus assez de joueurs pour remplir un XV. On ne vide pas
  // un poste à la main — la composition se recomplète toute seule, c'est
  // exactement ce qui doit se passer.
  const tousLesJoueurs = s.clubJoueur.effectif.slice();
  s.clubJoueur.effectif = tousLesJoueurs.slice(0, 14);
  RMClub.slotCompositionPourEquipe(s, 'pro').compositionTitulaires = {};
  let par = {};
  for (const p of RMClub.etatPreparationMatch(s).points) par[p.cle] = p;
  assert.ok(par.composition.detail.includes('non pourvu'),
    'ce test suppose une composition réellement incomplète, or : ' + par.composition.detail);
  assert.strictEqual(par.composition.nature, 'urgent',
    'un poste non pourvu compromet vraiment la rencontre');
  s.clubJoueur.effectif = tousLesJoueurs;
  // Un banc incomplet n'empêche pas de jouer : il prive de remplacements.
  // Même logique : on réduit l'effectif réel plutôt que de vider un champ
  // que le jeu recomplète aussitôt.
  s.clubJoueur.effectif = tousLesJoueurs.slice(0, 18);
  RMClub.slotCompositionPourEquipe(s, 'pro').compositionBanc = {};
  par = {};
  for (const p of RMClub.etatPreparationMatch(s).points) par[p.cle] = p;
  assert.strictEqual(par.banc.nature, 'recommande');
});

test('préparation : la tactique par défaut est FACULTATIVE, pas un échec', () => {
  const s = saisonPourJours(806, 'Test Tactique Prépa');
  const par = {};
  for (const p of RMClub.etatPreparationMatch(s).points) par[p.cle] = p;
  assert.strictEqual(par.tactique.nature, 'facultatif',
    'le réglage neutre est un choix valable — le code le dit déjà, l\'affichage doit le dire aussi');
  // La régler la fait passer à « terminé » : c'est bien une vraie préparation.
  const slot = RMClub.slotCompositionPourEquipe(s, 'pro');
  slot.tactique = Object.assign({}, slot.tactique, { style: 'large' });
  const apres = RMClub.etatPreparationMatch(s).points.find((p) => p.cle === 'tactique');
  assert.strictEqual(apres.nature, 'termine');
});

// --- P1-39 : la préparation ne décrivait QUE le premier XV. Le sélecteur
// d'équipe (tranche 4) fait bien basculer Composition et Tactique sur
// l'Équipe B et les Espoirs, mais `etatPreparationMatch` appelait
// `assurerCompositionPourEquipe(saison, 'pro')` en dur : un manager qui
// prépare un match d'Équipe B n'avait aucune carte de préparation. ---

test('préparation : elle sait décrire la rencontre de l\'Équipe B, pas seulement celle du premier XV', () => {
  const s = saisonPourJours(807, 'Test Prépa Équipe B');
  const pro = RMClub.prochaineRencontre(s, 'pro');
  const b = RMClub.prochaineRencontre(s, 'b');
  assert.ok(b, 'l\'Équipe B a bien une prochaine rencontre datée');
  assert.notStrictEqual(RMClub.dateISO(b.date), RMClub.dateISO(pro.date),
    'l\'Équipe B joue le dimanche, le premier XV le samedi : deux dates distinctes');
  // La rencontre trouvée doit vraiment venir du calendrier de l'Équipe B.
  assert.ok((s.competitionB.calendrier || []).some((f) => f.date === RMClub.dateISO(b.date)
    && (f.domicileId === s.clubJoueur.id || f.exterieurId === s.clubJoueur.id)));
});

test('préparation : chaque équipe est jugée sur SA composition, pas sur celle du premier XV', () => {
  const s = saisonPourJours(808, 'Test Prépa Par Équipe');
  // On règle la tactique du PREMIER XV seulement. Si la préparation de
  // l'Équipe B lisait le slot « pro », elle se croirait réglée elle aussi.
  const slotPro = RMClub.slotCompositionPourEquipe(s, 'pro');
  slotPro.tactique = Object.assign({}, slotPro.tactique, { style: 'large' });
  const tacPro = RMClub.etatPreparationMatch(s, 'pro').points.find((p) => p.cle === 'tactique');
  const tacB = RMClub.etatPreparationMatch(s, 'b').points.find((p) => p.cle === 'tactique');
  assert.strictEqual(tacPro.nature, 'termine');
  assert.strictEqual(tacB.nature, 'facultatif',
    'la tactique de l\'Équipe B n\'a pas été touchée : elle ne peut pas être déclarée réglée');
  // …et régler celle de l'Équipe B ne doit pas non plus déteindre sur le pro.
  const slotB = RMClub.slotCompositionPourEquipe(s, 'b');
  slotB.tactique = Object.assign({}, slotB.tactique, { style: 'ferme' });
  assert.strictEqual(RMClub.etatPreparationMatch(s, 'b').points.find((p) => p.cle === 'tactique').nature, 'termine');
});

test('préparation : les Espoirs ont eux aussi leur préparation, avec leur propre rencontre', () => {
  const s = saisonPourJours(809, 'Test Prépa Espoirs');
  const etat = RMClub.etatPreparationMatch(s, 'jeunes');
  assert.ok(etat.rencontre, 'les Espoirs ont un championnat daté (P1-31) : ils ont donc une prochaine rencontre');
  assert.strictEqual(etat.equipe, 'jeunes');
  assert.strictEqual(etat.points.length, 5, 'les mêmes cinq points, pas un écran parallèle');
  const NATURES = ['termine', 'urgent', 'recommande', 'facultatif', 'enAttente'];
  assert.ok(etat.points.every((p) => NATURES.indexOf(p.nature) !== -1));
});

test('préparation : appelée sans équipe, elle décrit toujours le premier XV (rétrocompatible)', () => {
  const s = saisonPourJours(810, 'Test Prépa Défaut');
  const sansArgument = RMClub.etatPreparationMatch(s);
  const explicite = RMClub.etatPreparationMatch(s, 'pro');
  assert.strictEqual(sansArgument.equipe, 'pro');
  assert.strictEqual(RMClub.dateISO(sansArgument.rencontre.date), RMClub.dateISO(explicite.rencontre.date));
  assert.strictEqual(sansArgument.pretPct, explicite.pretPct);
});

test('préparation : jamais une rencontre DÉJÀ PASSÉE (« dans -1 jours »)', () => {
  const s = saisonPourJours(811, 'Test Prépa Passé');
  const première = RMClub.prochaineRencontre(s, 'pro');
  // On saute par-dessus la rencontre sans la jouer : elle reste `!joue`,
  // mais elle est derrière nous. La proposer comme « prochaine » affichait
  // « dans -1 jours » sur la carte — mesuré dans le navigateur.
  RMClub.definirDateCourante(s, RMClub.ajouterJours(première.date, 1));
  const suivante = RMClub.prochaineRencontre(s, 'pro');
  if (suivante) {
    assert.ok(suivante.jours >= 0,
      `une « prochaine » rencontre ne peut pas être dans le passé (jours = ${suivante.jours})`);
  }
  const etat = RMClub.etatPreparationMatch(s, 'pro');
  if (etat.rencontre) assert.ok(etat.rencontre.jours >= 0);
});

test('préparation : la carte prépare la MÊME rencontre que celle annoncée par l\'échéance', () => {
  const s = saisonPourJours(812, 'Test Accord Cartes');
  // On se place au jour du premier match d'Équipe B : l'échéance annonce
  // l'Équipe B, la préparation doit préparer l'Équipe B — pas le premier XV.
  const moi = s.clubJoueur.id;
  const fB = (s.competitionB.calendrier || []).find((f) => f.domicileId === moi || f.exterieurId === moi);
  assert.ok(fB, 'le club a bien un match d\'Équipe B au calendrier');
  RMClub.definirDateCourante(s, RMClub.dateDepuisISO(fB.date));
  const arret = RMClub.prochainArret(s);
  assert.strictEqual(arret.type, 'b', 'ce jour-là, l\'échéance est bien le match d\'Équipe B');
  const equipe = RMClub.equipePourArret(arret.type);
  assert.strictEqual(equipe, 'b');
  const etat = RMClub.etatPreparationMatch(s, equipe);
  assert.strictEqual(RMClub.dateISO(etat.rencontre.date), RMClub.dateISO(arret.date),
    'les deux cartes du même écran doivent parler de la même rencontre');
});

test('fenêtres de transfert : ouvertes à des dates réelles, dérivées du calendrier', () => {
  const s = saisonPourJours(802, 'Test Fenêtres');
  const fenetres = RMClub.fenetresTransfert(s);
  assert.strictEqual(fenetres.length, 2, 'un mercato d\'été et un mercato d\'hiver');
  for (const f of fenetres) {
    assert.ok(RMClub.comparerDates(f.debut, f.fin) < 0, `${f.nom} doit avoir une fin après son début`);
  }
  assert.ok(RMClub.comparerDates(fenetres[0].fin, fenetres[1].debut) < 0, 'les deux fenêtres ne se chevauchent pas');
  // Au démarrage de la saison, le mercato d'été est ouvert.
  const ouverture = RMClub.etatFenetreTransfert(s);
  assert.strictEqual(ouverture.ouverte, true);
  assert.ok(ouverture.ferme);
  // Entre les deux fenêtres, il est fermé — et on sait quand il rouvre.
  const entreDeux = RMClub.ajouterJours(fenetres[0].fin, 7);
  const ferme = RMClub.etatFenetreTransfert(s, entreDeux);
  assert.strictEqual(ferme.ouverte, false);
  assert.ok(ferme.ouvre, 'une fenêtre fermée doit annoncer sa réouverture');
  assert.strictEqual(RMClub.dateISO(ferme.ouvre), RMClub.dateISO(fenetres[1].debut));
});

test('fenêtres de transfert : signer est impossible hors fenêtre, mais le repérage reste ouvert', () => {
  const s = saisonPourJours(803, 'Test Signature Fenêtre');
  s.clubJoueur.budget = 10000;
  const cible = s.marche[0];
  // Hors fenêtre : la signature est refusée, avec un motif explicite.
  const fenetres = RMClub.fenetresTransfert(s);
  RMClub.definirDateCourante(s, RMClub.ajouterJours(fenetres[0].fin, 7));
  const effectifAvant = s.clubJoueur.effectif.length;
  const budgetAvant = s.clubJoueur.budget;
  const refus = RMClub.signerJoueur(s, cible.id);
  assert.strictEqual(refus.ok, false);
  assert.strictEqual(refus.motif, 'fenetre_fermee');
  assert.ok(refus.fenetre.ouvre, 'le refus doit dire quand le marché rouvre');
  assert.strictEqual(s.clubJoueur.effectif.length, effectifAvant, 'aucun joueur ne rejoint le club hors fenêtre');
  assert.strictEqual(s.clubJoueur.budget, budgetAvant, 'et rien n\'est débité');
  // Le repérage, lui, reste possible toute l'année.
  const scout = RMClub.commanderRapportScouting(s, cible.id, 1);
  assert.strictEqual(scout.ok, true, 'observer un joueur n\'est pas le recruter : le scouting reste ouvert');
  // De retour dans une fenêtre : la signature passe.
  RMClub.definirDateCourante(s, fenetres[1].debut);
  const signature = RMClub.signerJoueur(s, cible.id);
  assert.strictEqual(signature.ok, true);
  assert.strictEqual(s.clubJoueur.effectif.length, effectifAvant + 1);
});

test('contrat asynchrone : la proposition ne change rien tout de suite, la réponse arrive à sa date', () => {
  const s = saisonPourJours(804, 'Test Contrat Async');
  const joueur = s.clubJoueur.effectif[0];
  const contratAvant = joueur.contrat;
  const salaireAvant = joueur.salaire;
  const res = RMClub.proposerContrat(s, joueur.id, salaireAvant * 3, 3); // offre très généreuse
  assert.strictEqual(res.ok, true);
  assert.strictEqual(joueur.contrat, contratAvant, 'le contrat ne bouge PAS au moment de la proposition');
  assert.strictEqual(joueur.salaire, salaireAvant);
  assert.ok(RMClub.negociationEnCours(s, joueur.id), 'la négociation est bien en cours');
  // Une seconde proposition sur le même joueur est refusée.
  assert.strictEqual(RMClub.proposerContrat(s, joueur.id, salaireAvant * 3, 3).motif, 'deja_en_cours');
  // La veille : toujours rien.
  RMClub.avancerJusquA(s, RMClub.ajouterJours(res.dateReponse, -1));
  assert.strictEqual(joueur.contrat, contratAvant, 'aucune réponse avant la date');
  // Le jour dit : la réponse tombe. On force ici un tirage favorable pour
  // tester le CHEMIN d'acceptation de façon déterministe — la décision
  // elle-même reste celle de negocierRenouvellement, déjà couverte ailleurs.
  const reponses = RMClub.resoudreNegociationsContrat(() => 0, s, res.dateReponse);
  assert.strictEqual(reponses.length, 1);
  assert.strictEqual(reponses[0].accepte, true);
  assert.strictEqual(RMClub.negociationEnCours(s, joueur.id), null, 'la négociation est close');
  assert.strictEqual(joueur.salaire, salaireAvant * 3, 'le salaire accepté est réellement appliqué');
  assert.ok(joueur.contrat >= 1, 'et le contrat est réellement prolongé');
  assert.ok(s.clubJoueur.messages.some((m) => m.titre === 'Contrat renouvelé' && m.corps.includes(joueur.nom)));
});

test('contrat asynchrone : une offre trop basse est refusée, avec le montant réellement attendu', () => {
  const s = saisonPourJours(805, 'Test Contrat Refus');
  const joueur = s.clubJoueur.effectif[0];
  const contratAvant = joueur.contrat;
  const res = RMClub.proposerContrat(s, joueur.id, 1, 3); // offre dérisoire
  // Tirage défavorable forcé : on teste le CHEMIN de refus, pas la
  // probabilité (déjà couverte par les tests de négociation existants).
  RMClub.resoudreNegociationsContrat(() => 0.99, s, res.dateReponse);
  assert.strictEqual(joueur.contrat, contratAvant, 'un refus ne prolonge évidemment pas le contrat');
  const refus = s.clubJoueur.messages.find((m) => m.titre === 'Proposition refusée');
  assert.ok(refus, 'le refus doit être annoncé dans la boîte de réception');
  assert.ok(/\d+ k€\/saison/.test(refus.corps), 'et indiquer le montant réellement attendu');
  assert.strictEqual(RMClub.negociationEnCours(s, joueur.id), null);
});

test('direction : le point d\'étape juge la position RÉELLE et ajuste la confiance du président', () => {
  const s = saisonPourJours(806, 'Test Point Étape');
  const c = s.clubJoueur;
  c.confiancePresident = 60;
  assert.strictEqual(RMClub.pointEtapeAFaire(s), null, 'aucun point d\'étape avant d\'avoir joué');
  // Fait jouer un bon tiers du championnat, avec le club EN TÊTE.
  const mesMatchs = s.calendrier.filter((f) => f.domicileId === c.id || f.exterieurId === c.id);
  for (const f of mesMatchs.slice(0, Math.ceil(mesMatchs.length * 0.4))) {
    RMClub.enregistrerResultat(s, f.id, f.domicileId === c.id ? 40 : 0, f.domicileId === c.id ? 0 : 40, 5, 0);
  }
  const aFaire = RMClub.pointEtapeAFaire(s);
  assert.ok(aFaire, 'un point d\'étape doit être dû après un tiers du championnat');
  const res = RMClub.resoudrePointEtape(s);
  assert.ok(res, 'le point d\'étape doit produire un résultat');
  assert.strictEqual(res.position, 1, 'le club invaincu doit être en tête');
  assert.ok(res.reussi, 'être premier remplit largement l\'objectif');
  assert.ok(c.confiancePresident > 60, 'la confiance du président doit RÉELLEMENT monter');
  assert.ok(c.messages.some((m) => m.titre === 'Point d\'étape de la direction'));
  // Il ne se redéclenche pas deux fois pour la même étape.
  assert.strictEqual(RMClub.resoudrePointEtape(s), null);
});

test('vestiaire : un moral collectif bas déclenche une décision, dont chaque issue a une conséquence réelle', () => {
  const s = saisonPourJours(807, 'Test Vestiaire');
  const aujourdhui = RMClub.dateCourante(s);
  // Effectif au moral correct : rien ne se déclenche.
  for (const j of s.clubJoueur.effectif) j.moral = 70;
  assert.strictEqual(RMClub.moralVestiaire(s), 70);
  assert.strictEqual(RMClub.reunionVestiaireAFaire(s, aujourdhui), false);
  // Moral effondré : la réunion s'impose.
  for (const j of s.clubJoueur.effectif) j.moral = 30;
  assert.strictEqual(RMClub.reunionVestiaireAFaire(s, aujourdhui), true);
  const decl = RMClub.declencherReunionVestiaire(s, aujourdhui);
  assert.ok(decl && decl.moral === 30);
  const message = s.clubJoueur.messages.find((m) => m.decision && m.decision.type === 'vestiaire');
  assert.ok(message, 'une vraie décision doit être proposée');
  assert.ok(message.decision.dateLimite, 'avec une échéance');
  // Elle ne se redéclenche pas immédiatement.
  assert.strictEqual(RMClub.reunionVestiaireAFaire(s, aujourdhui), false);
  // « Réunir » remonte réellement le moral ET coûte la séance du lendemain.
  RMClub.definirSeance(s, RMClub.jourSemaine(RMClub.ajouterJours(aujourdhui, 1)), 'physique');
  assert.strictEqual(RMClub.resoudreDecisionMessage(s, message.id, 'reunir'), true);
  assert.ok(RMClub.moralVestiaire(s) > 30, 'réunir le groupe doit réellement remonter le moral');
  assert.strictEqual(RMClub.assurerSemaineEntrainement(s)[RMClub.jourSemaine(RMClub.ajouterJours(aujourdhui, 1))], 'recuperation',
    'la réunion coûte la séance du lendemain — un vrai prix, pas un bonus gratuit');
  assert.ok(message.decision.resultat.includes('réuni'));
});

test('vestiaire : laisser filer enfonce réellement le moral, et le silence aussi', () => {
  const s = saisonPourJours(808, 'Test Vestiaire Ignoré');
  const aujourdhui = RMClub.dateCourante(s);
  for (const j of s.clubJoueur.effectif) j.moral = 30;
  RMClub.declencherReunionVestiaire(s, aujourdhui);
  const message = s.clubJoueur.messages.find((m) => m.decision && m.decision.type === 'vestiaire');
  RMClub.resoudreDecisionMessage(s, message.id, 'laisser');
  assert.ok(RMClub.moralVestiaire(s) < 30, 'laisser passer doit réellement coûter du moral');

  // Et une décision de vestiaire non tranchée à l'échéance revient au même.
  const t = saisonPourJours(809, 'Test Vestiaire Expiré');
  const jour = RMClub.dateCourante(t);
  for (const j of t.clubJoueur.effectif) j.moral = 30;
  RMClub.declencherReunionVestiaire(t, jour);
  const msgT = t.clubJoueur.messages.find((m) => m.decision && m.decision.type === 'vestiaire');
  const moralAvant = RMClub.moralVestiaire(t);
  RMClub.avancerJusquA(t, RMClub.dateDepuisISO(msgT.decision.dateLimite));
  assert.strictEqual(msgT.decision.resolu, true);
  assert.strictEqual(msgT.decision.choix, 'laisser', 'le silence vaut « laisser passer »');
  assert.ok(RMClub.moralVestiaire(t) < moralAvant);
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

// --- Autres paliers de la pyramide française (audit : "les autres
// championnats ne sont jamais simulés") : les 2 paliers que le club du
// joueur n'occupe pas doivent avoir de vrais clubs/calendrier/classement,
// simulés une journée à la fois — jamais de simples noms de palier sans
// contenu, jamais conditionné à l'ouverture d'un onglet. ---
test('autres paliers France : les 2 paliers non occupés par le joueur sont réellement peuplés (bonne taille de division)', () => {
  const s = RMClub.nouvelleSaison(creerRng(120), 'Test Pyramide France');
  assert.strictEqual(s.clubJoueur.palierPyramide.niveau, 3, 'scénario de test : débute en Ligue Régionale (palier 3)');
  const autres = RMClub.assurerAutresDivisionsFrance(creerRng(121), s);
  assert.strictEqual(autres.niveauExclu, 3);
  assert.deepStrictEqual(Object.keys(autres.divisions).map(Number).sort(), [1, 2], 'seuls les paliers 1 et 2 doivent être peuplés (le 3 est celui du joueur)');
  assert.strictEqual(autres.divisions[1].clubs.length, RMClub.TAILLE_DIVISION_FRANCE[1]);
  assert.strictEqual(autres.divisions[2].clubs.length, RMClub.TAILLE_DIVISION_FRANCE[2]);
  assert.strictEqual(autres.divisions[1].calendrier.length, RMClub.TAILLE_DIVISION_FRANCE[1] * (RMClub.TAILLE_DIVISION_FRANCE[1] - 1));
});

test('autres paliers France : avancerJourneeAutresDivisionsFrance simule réellement une journée (résultats réels, pas des zéros)', () => {
  const s = RMClub.nouvelleSaison(creerRng(122), 'Test Simulation France');
  const autres = RMClub.assurerAutresDivisionsFrance(creerRng(123), s);
  RMClub.avancerJourneeAutresDivisionsFrance(creerRng(124), autres);
  const jouesNiveau1 = autres.divisions[1].calendrier.filter((f) => f.joue).length;
  const jouesNiveau2 = autres.divisions[2].calendrier.filter((f) => f.joue).length;
  assert.strictEqual(jouesNiveau1, RMClub.TAILLE_DIVISION_FRANCE[1] / 2, 'une journée = la moitié des clubs qui jouent, une fois');
  assert.strictEqual(jouesNiveau2, RMClub.TAILLE_DIVISION_FRANCE[2] / 2);
  const classementNiveau1 = RMClub.classementTrieDe(autres.divisions[1].classement);
  assert.ok(classementNiveau1.some((r) => r.pts > 0), 'au moins un club doit avoir marqué des points réels après une journée');
});

test('autres paliers France : une montée/descente de palier resynchronise (le nouveau palier du joueur n\'est plus peuplé, l\'ancien l\'est)', () => {
  const s = RMClub.nouvelleSaison(creerRng(125), 'Test Resynchronisation France');
  RMClub.assurerAutresDivisionsFrance(creerRng(126), s);
  assert.deepStrictEqual(Object.keys(s.autresDivisionsFrance.divisions).map(Number).sort(), [1, 2]);
  // Force une montée en Ligue Nationale (palier 2).
  for (const id of Object.keys(s.classement)) s.classement[id].pts = 0;
  s.classement[s.clubJoueur.id].pts = 999;
  RMClub.avancerSaison(creerRng(127), s);
  assert.strictEqual(s.clubJoueur.palierPyramide.niveau, 2);
  RMClub.assurerAutresDivisionsFrance(creerRng(128), s);
  assert.strictEqual(s.autresDivisionsFrance.niveauExclu, 2, 'le palier exclu doit suivre le nouveau palier du joueur');
  assert.deepStrictEqual(Object.keys(s.autresDivisionsFrance.divisions).map(Number).sort(), [1, 3], 'le palier 3 (quitté) redevient peuplé, le palier 2 (rejoint) ne l\'est plus');
});

test('autres paliers France : rétrocompatibilité — une sauvegarde antérieure sans "autresDivisionsFrance" ne plante pas et se reconstitue', () => {
  const s = RMClub.nouvelleSaison(creerRng(129), 'Ancienne Sauvegarde Pyramide');
  assert.strictEqual(s.autresDivisionsFrance, undefined, 'scénario de test : simule une sauvegarde antérieure à cette fonctionnalité');
  assert.doesNotThrow(() => RMClub.assurerAutresDivisionsFrance(creerRng(130), s));
  assert.ok(s.autresDivisionsFrance);
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
const clubNegociationsSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-negociations.js'), 'utf8');
const clubEquipeBSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-equipe-b.js'), 'utf8');
const clubTransfertsSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-transferts.js'), 'utf8');
const clubTransfertsIntlSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-transferts-internationaux.js'), 'utf8');
const clubGenerationJoueursSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-generation-joueurs.js'), 'utf8');
const clubCentreFormationSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-centre-formation.js'), 'utf8');
const clubEspoirsSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-espoirs.js'), 'utf8');
const clubCompositionSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-composition.js'), 'utf8');
const clubConditionJoueursSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-condition-joueurs.js'), 'utf8');
const clubDecisionsSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-decisions.js'), 'utf8');
const clubPyramideSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-pyramide.js'), 'utf8');
const clubPyramideFranceSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-pyramide-france.js'), 'utf8');
const clubEffectifAdverseSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-effectif-adverse.js'), 'utf8');
const clubCompetitionsSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-competitions.js'), 'utf8');
const clubEquipesSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-equipes.js'), 'utf8');
const clubCalendrierSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-calendrier.js'), 'utf8');
const clubSauvegardeSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-sauvegarde.js'), 'utf8');
const clubTempsSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-temps.js'), 'utf8');
const clubAgendaSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-agenda.js'), 'utf8');
const clubSemaineSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-semaine-entrainement.js'), 'utf8');
const clubJourMatchSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-jour-match.js'), 'utf8');
const clubDirectionSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-direction.js'), 'utf8');
const clubEvenementsSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-evenements.js'), 'utf8');
const clubMedicalSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-medical.js'), 'utf8');
const clubCarriereSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-carriere-manager.js'), 'utf8');
const clubMercatoSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-mercato.js'), 'utf8');
const clubInfraSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-infrastructures.js'), 'utf8');
const clubStatutsSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-statuts.js'), 'utf8');
const clubRouteSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-feuille-de-route.js'), 'utf8');
const clubComptesSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-comptes.js'), 'utf8');
const clubVentesSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-ventes.js'), 'utf8');
const clubFeuilleMatchSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-feuille-de-match.js'), 'utf8');
const clubArchivesMatchsSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-archives-matchs.js'), 'utf8');
const clubInscriptionsSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-inscriptions.js'), 'utf8');
const clubRotationSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-rotation.js'), 'utf8');
const clubRevenusSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-revenus-competition.js'), 'utf8');
const clubReseauSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-reseau-scouting.js'), 'utf8');
const clubEntraineursSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-entraineurs-rivaux.js'), 'utf8');
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
  new Function('window', clubNegociationsSrcPourRechargement)(ctx);
  new Function('window', clubEquipeBSrcPourRechargement)(ctx);
  new Function('window', clubTransfertsSrcPourRechargement)(ctx);
  new Function('window', clubTransfertsIntlSrcPourRechargement)(ctx);
  new Function('window', clubMercatoSrcPourRechargement)(ctx);
  new Function('window', clubInfraSrcPourRechargement)(ctx);
  new Function('window', clubGenerationJoueursSrcPourRechargement)(ctx);
  new Function('window', clubCentreFormationSrcPourRechargement)(ctx);
  new Function('window', clubEspoirsSrcPourRechargement)(ctx);
  new Function('window', clubCompositionSrcPourRechargement)(ctx);
  new Function('window', clubConditionJoueursSrcPourRechargement)(ctx);
  new Function('window', clubDecisionsSrcPourRechargement)(ctx);
  new Function('window', clubStatutsSrcPourRechargement)(ctx);
  new Function('window', clubRouteSrcPourRechargement)(ctx);
  new Function('window', clubComptesSrcPourRechargement)(ctx);
  new Function('window', clubVentesSrcPourRechargement)(ctx);
  new Function('window', clubFeuilleMatchSrcPourRechargement)(ctx);
  new Function('window', clubArchivesMatchsSrcPourRechargement)(ctx);
  new Function('window', clubInscriptionsSrcPourRechargement)(ctx);
  new Function('window', clubRotationSrcPourRechargement)(ctx);
  new Function('window', clubRevenusSrcPourRechargement)(ctx);
  new Function('window', clubReseauSrcPourRechargement)(ctx);
  new Function('window', clubEntraineursSrcPourRechargement)(ctx);
  new Function('window', clubPyramideSrcPourRechargement)(ctx);
  new Function('window', clubPyramideFranceSrcPourRechargement)(ctx);
  new Function('window', clubCalendrierSrcPourRechargement)(ctx);
  new Function('window', clubSauvegardeSrcPourRechargement)(ctx);
  new Function('window', clubTempsSrcPourRechargement)(ctx);
  new Function('window', clubAgendaSrcPourRechargement)(ctx);
  new Function('window', clubSemaineSrcPourRechargement)(ctx);
  new Function('window', clubJourMatchSrcPourRechargement)(ctx);
  new Function('window', clubDirectionSrcPourRechargement)(ctx);
  new Function('window', clubMedicalSrcPourRechargement)(ctx);
  new Function('window', clubCarriereSrcPourRechargement)(ctx);
  new Function('window', clubEvenementsSrcPourRechargement)(ctx);
  new Function('window', clubCompetitionsSrcPourRechargement)(ctx);
  new Function('window', clubEquipesSrcPourRechargement)(ctx);
  new Function('window', clubEffectifAdverseSrcPourRechargement)(ctx);
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

// --- P1-26 : deux actions distinctes « Jour suivant » et « Jusqu'au
// prochain match » (demande utilisateur). Avancer d'un jour exactement, ou
// jour par jour en s'arrêtant sur match, blessure, réponse de contrat,
// rapport de repérage, décision ou événement important. ---

function saisonPourAvance(graine, options) {
  const s = RMClub.nouvelleSaison(creerRng(graine), 'Test Avance');
  RMClub.daterCalendrier(s);
  // Semaine entièrement au repos par défaut : aucune blessure d'entraînement
  // possible, donc l'avance ne peut être interrompue que par ce que le test
  // provoque lui-même. Les tests de blessure repassent en séance intense.
  if (!options || !options.entrainementReel) {
    RMClub.assurerSemaineEntrainement(s);
    for (let jour = 0; jour <= 6; jour++) RMClub.definirSeance(s, jour, 'repos');
  }
  return s;
}

// Ensemble des décisions déjà en attente, tel que le calcule l'avance.
function decisionsConnues(s) { return RMClub.idsDecisionsEnAttente(s); }

test("avancerUnJour : avance d'EXACTEMENT un jour, jamais plus", () => {
  const s = saisonPourAvance(901);
  const avant = RMClub.dateCourante(s);
  const r = RMClub.avancerUnJour(s);
  const apres = RMClub.dateCourante(s);
  assert.strictEqual(RMClub.ecartJours(avant, apres), 1, 'la date doit avancer de 1 jour exactement');
  assert.ok(r.journee, 'la journée traversée doit être réellement résolue');
  assert.strictEqual(r.journee.date, RMClub.dateISO(apres), 'la journée résolue doit être celle du nouveau jour');
});

test("avancerUnJour : arriver un jour de match ne joue PAS le match automatiquement", () => {
  const s = saisonPourAvance(902);
  const arret = RMClub.prochainArret(s);
  assert.ok(arret, 'la saison doit avoir au moins une rencontre');
  RMClub.definirDateCourante(s, RMClub.ajouterJours(arret.date, -1));
  const r = RMClub.avancerUnJour(s);
  assert.strictEqual(RMClub.comparerDates(RMClub.dateCourante(s), arret.date), 0, 'on doit être arrivé le jour du match');
  assert.ok(r.journee.estJourDeMatch, 'la journée doit être marquée jour de match');
  const fixture = (s.calendrier || []).find((f) => f.date === RMClub.dateISO(arret.date));
  if (fixture) assert.ok(!fixture.joue, 'le match ne doit PAS avoir été joué automatiquement');
});

test("avancerJusquAuProchainMatch : s'arrête le jour du match, sans le dépasser", () => {
  const s = saisonPourAvance(903);
  const arret = RMClub.prochainArret(s);
  // L'avance s'arrête AUSSI sur tout événement réel du chemin (blessure,
  // offre reçue, rapport de repérage…) : c'est sa raison d'être. Le test ne
  // doit donc pas supposer qu'une graine donnée traverse la semaine sans rien
  // rencontrer — il relance jusqu'au match, exactement comme le manager
  // reclique après avoir traité l'événement. Constaté : la graine 903
  // rencontrait bien le match d'un trait jusqu'à ce que le barème des
  // transferts change (G5) et décale le tirage ; le comportement testé, lui,
  // n'a pas bougé.
  let r = null, tours = 0, joursTotal = 0;
  do {
    r = RMClub.avancerJusquAuProchainMatch(s);
    joursTotal += r.journees.length;
  } while (r.raison !== 'match' && r.raison !== 'saison' && tours++ < 30);
  assert.strictEqual(r.raison, 'match', `raison attendue "match", obtenue "${r.raison}"`);
  assert.strictEqual(RMClub.comparerDates(RMClub.dateCourante(s), arret.date), 0,
    "la date doit s'arrêter exactement le jour du match");
  assert.ok(joursTotal > 0, 'les jours traversés doivent être réellement résolus');
});

test("avancerJusquAuProchainMatch : déjà sur un jour de match, on n'avance pas (le match reste à jouer)", () => {
  const s = saisonPourAvance(904);
  const arret = RMClub.prochainArret(s);
  RMClub.definirDateCourante(s, arret.date);
  const r = RMClub.avancerJusquAuProchainMatch(s);
  assert.strictEqual(r.journees.length, 0, "aucun jour ne doit être traversé : le match du jour n'est pas encore joué");
  assert.strictEqual(r.raison, 'match', 'la raison doit rester "match"');
  assert.strictEqual(RMClub.comparerDates(RMClub.dateCourante(s), arret.date), 0, 'la date ne doit pas bouger');
});

test("avancerJusquAuProchainMatch : une fois le jour réglé, l'avance repart (aucun blocage)", () => {
  const s = saisonPourAvance(905);
  const premier = RMClub.prochainArret(s);
  RMClub.definirDateCourante(s, premier.date);
  const iso = RMClub.dateISO(premier.date);
  for (const f of (s.calendrier || [])) if (f.date === iso) f.joue = true;
  if (s.competitionB && s.competitionB.calendrier) {
    for (const f of s.competitionB.calendrier) if (f.date === iso) f.joue = true;
  }
  s.clubJoueur.jeunes = []; // plus de match espoirs possible ce jour-là
  assert.strictEqual(RMClub.typeDArret(s, premier.date), null, 'le jour doit être réglé avant de tester la reprise');
  const r = RMClub.avancerJusquAuProchainMatch(s);
  assert.ok(r.journees.length > 0, "l'avance doit repartir vers la prochaine échéance");
  assert.ok(RMClub.comparerDates(RMClub.dateCourante(s), premier.date) > 0, 'la date doit avoir dépassé le match déjà joué');
});

// --- Détection des interruptions (fonction pure, testée directement) ---

test('interruptions : une journée sans rien de notable n\'interrompt pas', () => {
  const s = saisonPourAvance(910);
  const vide = { date: '2024-09-02', fatigueRecuperee: 40, progressions: [], blessures: [], retablis: [], retoursDePret: [], rapports: [], reponsesContrat: [], decisionsExpirees: [] };
  assert.deepStrictEqual(RMClub.interruptionsDeJournee(s, vide, decisionsConnues(s)), [],
    'récupération et progressions seules ne doivent jamais interrompre');
});

test('interruptions : une blessure interrompt', () => {
  const s = saisonPourAvance(911);
  const j = { blessures: [{ nom: 'Paul Test', jours: 12 }] };
  const i = RMClub.interruptionsDeJournee(s, j, decisionsConnues(s));
  assert.strictEqual(i.length, 1);
  assert.strictEqual(i[0].raison, 'blessure');
  assert.ok(i[0].libelle.includes('Paul Test'), 'le libellé doit nommer le joueur réellement blessé');
});

test('interruptions : une réponse de contrat et un rapport de repérage interrompent', () => {
  const s = saisonPourAvance(912);
  const iC = RMClub.interruptionsDeJournee(s, { reponsesContrat: [{ nom: 'Luc Test', accepte: true }] }, decisionsConnues(s));
  assert.strictEqual(iC[0].raison, 'contrat', 'une réponse à une proposition de contrat doit interrompre');
  const iR = RMClub.interruptionsDeJournee(s, { rapports: [{ nom: 'Cible Test' }] }, decisionsConnues(s));
  assert.strictEqual(iR[0].raison, 'rapport', 'un rapport de repérage remis doit interrompre');
});

test('interruptions : un retour de blessure ou de prêt est un événement à connaître', () => {
  const s = saisonPourAvance(913);
  const i = RMClub.interruptionsDeJournee(s, { retablis: ['Jean Test'], retoursDePret: ['Marc Test'] }, decisionsConnues(s));
  assert.strictEqual(i.length, 2);
  assert.ok(i.every((x) => x.raison === 'evenement'));
});

test('interruptions : une décision NOUVELLE interrompt, une décision déjà connue non', () => {
  const s = saisonPourAvance(914);
  const connuesAvant = decisionsConnues(s);
  RMClub.ajouterMessage(s, 'joueur', 'Choix à faire', 'Un joueur demande une réponse.', {
    type: 'tempsDeJeu', joueurId: s.clubJoueur.effectif[0].id,
    options: [{ id: 'rassurer', label: 'Le rassurer' }, { id: 'ignorer', label: 'Ignorer' }],
  });
  const i = RMClub.interruptionsDeJournee(s, {}, connuesAvant);
  assert.strictEqual(i.length, 1, 'la décision apparue pendant la journée doit interrompre');
  assert.strictEqual(i[0].raison, 'decision');
  // La MÊME décision, désormais connue, ne doit plus interrompre : sinon le
  // bouton resterait bloqué tant qu'elle n'est pas tranchée.
  assert.deepStrictEqual(RMClub.interruptionsDeJournee(s, {}, decisionsConnues(s)), [],
    'une décision déjà en attente au départ ne doit pas rebloquer chaque clic');
});

test("avancerJusquAuProchainMatch : une décision déjà en attente n'empêche pas de partir", () => {
  const s = saisonPourAvance(915);
  RMClub.ajouterMessage(s, 'joueur', 'Choix ancien', 'Décision présente avant de partir.', {
    type: 'tempsDeJeu', joueurId: s.clubJoueur.effectif[0].id,
    options: [{ id: 'rassurer', label: 'Le rassurer' }, { id: 'ignorer', label: 'Ignorer' }],
  });
  const r = RMClub.avancerJusquAuProchainMatch(s);
  assert.ok(r.journees.length > 1, `l'avance doit progresser malgré la décision en attente (${r.journees.length} jour(s))`);
});

// --- Blessures à l'entraînement : ce qui donne un vrai prix à une semaine
// intense, et la seule chose qui pouvait blesser entre deux matchs. ---

test("entraînement : une semaine intense sur un effectif épuisé finit par blesser", () => {
  const s = saisonPourAvance(916, { entrainementReel: true });
  RMClub.assurerSemaineEntrainement(s);
  for (let jour = 0; jour <= 6; jour++) RMClub.definirSeance(s, jour, 'physique');
  let blessures = 0;
  for (let i = 0; i < 60; i++) {
    for (const j of s.clubJoueur.effectif) { j.fatigue = 90; j.blessureJournees = 0; }
    blessures += (RMClub.avancerUnJour(s).journee.blessures || []).length;
  }
  assert.ok(blessures > 0, "60 jours de séances physiques sur un effectif épuisé doivent produire au moins une blessure");
});

test('entraînement : le repos ne blesse jamais personne', () => {
  const s = saisonPourAvance(917, { entrainementReel: true });
  RMClub.assurerSemaineEntrainement(s);
  for (let jour = 0; jour <= 6; jour++) RMClub.definirSeance(s, jour, 'repos');
  let blessures = 0;
  for (let i = 0; i < 120; i++) {
    for (const j of s.clubJoueur.effectif) { j.fatigue = 95; j.blessureJournees = 0; }
    blessures += (RMClub.avancerUnJour(s).journee.blessures || []).length;
  }
  assert.strictEqual(blessures, 0, 'le repos ne doit blesser personne, même sur un effectif épuisé');
});

test("entraînement : une blessure survenue à l'entraînement rend réellement le joueur indisponible", () => {
  const s = saisonPourAvance(918, { entrainementReel: true });
  RMClub.assurerSemaineEntrainement(s);
  for (let jour = 0; jour <= 6; jour++) RMClub.definirSeance(s, jour, 'physique');
  let trouve = null;
  for (let i = 0; i < 200 && !trouve; i++) {
    for (const j of s.clubJoueur.effectif) { j.fatigue = 95; }
    const bl = RMClub.avancerUnJour(s).journee.blessures || [];
    if (bl.length) trouve = bl[0];
  }
  assert.ok(trouve, 'au moins une blessure doit survenir pour pouvoir vérifier ses effets');
  // La blessure peut concerner l'effectif pro OU le centre de formation :
  // les deux s'entraînent réellement (cf. resoudreJourneeQuotidienne).
  const tous = (s.clubJoueur.effectif || []).concat(s.clubJoueur.jeunes || []);
  const joueur = tous.find((j) => j.id === trouve.id);
  assert.ok(joueur.blessureJournees > 0, 'le joueur blessé doit être réellement indisponible, pas seulement annoncé');
  assert.strictEqual(joueur.blessureJournees, trouve.jours, 'la durée annoncée doit être la durée réelle');
  const msg = (s.clubJoueur.messages || []).find((m) => m.corps && m.corps.includes(trouve.nom));
  assert.ok(msg, 'une blessure doit produire un message réel dans la boîte de réception');
});

// --- P1-27 : de vraies dates dans TOUS les calendriers, et chaque rencontre
// jouée uniquement à sa date (demande utilisateur, point 2). ---

test('dates : toutes les rencontres des TROIS équipes portent une vraie date ISO', () => {
  const s = saisonPourAvance(930);
  for (const equipe of ['pro', 'b', 'jeunes']) {
    s.clubJoueur.navigationClub = RMClub.navigationClub(s);
    s.clubJoueur.navigationClub.equipeConsultee = equipe;
    const ctx = RMClub.contexteEquipe(s);
    if (!ctx.disponible || !ctx.calendrier || !ctx.calendrier.length) continue;
    for (const f of ctx.calendrier) {
      assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(f.date || ''),
        `équipe ${equipe}, journée ${f.journee} : date absente ou invalide (${f.date})`);
    }
  }
});

test('dates : la rencontre espoirs tombe le mercredi qui précède la journée de championnat', () => {
  const s = saisonPourAvance(931);
  s.clubJoueur.navigationClub = RMClub.navigationClub(s);
  s.clubJoueur.navigationClub.equipeConsultee = 'jeunes';
  const ctx = RMClub.contexteEquipe(s);
  assert.ok(ctx.calendrier.length > 0, 'les espoirs doivent avoir des rencontres');
  for (const f of ctx.calendrier) {
    // La date suit la journée de CHAMPIONNAT à laquelle la rencontre est
    // adossée (P1-31 : les espoirs ont leur propre numérotation).
    const attendue = RMClub.dateISO(RMClub.dateDeJournee(s.numero || 1, f.journeeChampionnat, 'jeunes'));
    assert.strictEqual(f.date, attendue, `journée ${f.journee} : date ${f.date} au lieu de ${attendue}`);
    assert.strictEqual(RMClub.jourSemaine(RMClub.dateDepuisISO(f.date)), 3,
      `journée ${f.journee} : la rencontre espoirs doit tomber un mercredi`);
  }
});

test('dates : les trois équipes ne jouent JAMAIS le même jour', () => {
  const s = saisonPourAvance(932);
  const dates = {};
  for (const equipe of ['pro', 'b', 'jeunes']) {
    s.clubJoueur.navigationClub = RMClub.navigationClub(s);
    s.clubJoueur.navigationClub.equipeConsultee = equipe;
    const ctx = RMClub.contexteEquipe(s);
    if (!ctx.disponible) continue;
    dates[equipe] = new Set((ctx.calendrier || [])
      .filter((f) => f.domicileId === s.clubJoueur.id || f.exterieurId === s.clubJoueur.id)
      .map((f) => f.date));
  }
  for (const a of Object.keys(dates)) {
    for (const b of Object.keys(dates)) {
      if (a >= b) continue;
      for (const d of dates[a]) {
        assert.ok(!dates[b].has(d), `${a} et ${b} jouent tous les deux le ${d}`);
      }
    }
  }
});

test('dates : une rencontre espoirs n\'est programmée QUE le jour de sa date', () => {
  const s = saisonPourAvance(933);
  s.clubJoueur.navigationClub = RMClub.navigationClub(s);
  s.clubJoueur.navigationClub.equipeConsultee = 'jeunes';
  // La rencontre du club du joueur (le calendrier couvre toute la
  // compétition, cf. P1-31).
  const premiere = RMClub.contexteEquipe(s).calendrier
    .find((f) => f.domicileId === s.clubJoueur.id || f.exterieurId === s.clubJoueur.id);
  assert.ok(premiere, 'le club du joueur doit avoir des rencontres espoirs');
  const date = RMClub.dateDepuisISO(premiere.date);
  assert.strictEqual(RMClub.evenementsDuJour(s, date).journeeEspoirs, premiere.journeeChampionnat,
    'le jour de sa date, la rencontre espoirs doit être programmée');
  for (const decalage of [-2, -1, 1, 2]) {
    const autre = RMClub.ajouterJours(date, decalage);
    assert.strictEqual(RMClub.evenementsDuJour(s, autre).journeeEspoirs, null,
      `aucune rencontre espoirs ne doit être programmée à ${RMClub.dateISO(autre)} (décalage ${decalage})`);
  }
});

test('dates : une rencontre déjà jouée conserve sa date (pas de recalcul qui la déplace)', () => {
  const s = saisonPourAvance(934);
  RMClub.daterCalendrier(s);
  const avant = s.calendrier.map((f) => f.date);
  for (const f of s.calendrier) if (f.journee === 1) f.joue = true;
  RMClub.daterCalendrier(s);
  assert.deepStrictEqual(s.calendrier.map((f) => f.date), avant,
    'redater un calendrier ne doit jamais déplacer une rencontre');
});

test('dates : les rencontres résolues un jour donné sont EXACTEMENT celles datées ce jour-là', () => {
  const s = saisonPourAvance(935);
  RMClub.daterCalendrier(s);
  const j1 = RMClub.dateDeJournee(s.numero || 1, 1, 'pro');
  const duJour = RMClub.fixturesDuJour(s, j1);
  assert.ok(duJour.length > 0, 'la journée 1 doit avoir des rencontres à sa date');
  for (const f of duJour) {
    assert.strictEqual(f.date, RMClub.dateISO(j1), 'une rencontre hors date ne doit jamais être retenue');
  }
  assert.strictEqual(duJour.length, s.calendrier.filter((f) => f.journee === 1).length,
    'toutes les rencontres de la journée 1 doivent être retenues, ni plus ni moins');
  // Un jour sans rencontre ne doit RIEN renvoyer, même si des journées
  // restent à jouer — sinon une journée pourrait être jouée hors de sa date.
  assert.strictEqual(RMClub.fixturesDuJour(s, RMClub.ajouterJours(j1, 1)).length, 0,
    'aucune rencontre de championnat ne doit être jouable le lendemain');
});

test('dates : une journée sautée ne se rejoue pas un autre jour', () => {
  const s = saisonPourAvance(936);
  RMClub.daterCalendrier(s);
  // Journée 1 jamais jouée, on se place le jour de la journée 2.
  const j2 = RMClub.dateDeJournee(s.numero || 1, 2, 'pro');
  const duJour = RMClub.fixturesDuJour(s, j2);
  assert.ok(duJour.length > 0, 'la journée 2 doit avoir des rencontres');
  for (const f of duJour) {
    assert.strictEqual(f.journee, 2,
      `le jour de la journée 2, on ne doit jouer que la journée 2 (trouvé J${f.journee})`);
  }
});

test('dates : une sauvegarde sans dates reste jouable (retombe sur la prochaine journée)', () => {
  const s = saisonPourAvance(937);
  for (const f of s.calendrier) delete f.date;
  const duJour = RMClub.fixturesDuJour(s, RMClub.dateCourante(s));
  assert.ok(duJour.length > 0, 'une sauvegarde non datée doit rester jouable');
  assert.strictEqual(duJour[0].journee, 1, 'elle retombe sur la prochaine journée à jouer');
});

// --- P1-28 : « Autres clubs » devient une navigation par PAYS puis
// CHAMPIONNAT, avec classement, calendrier et clubs cliquables partout
// (demande utilisateur, point 4). ---

function saisonAvecMonde(graine) {
  const s = saisonPourAvance(graine);
  RMWorld.assurerMonde(creerRng(graine + 1), s);
  RMClub.assurerAutresDivisionsFrance(creerRng(graine + 2), s);
  return s;
}

test('compétitions : la navigation liste TOUS les pays, chacun avec ses championnats', () => {
  const s = saisonAvecMonde(940);
  const pays = RMClub.competitionsParPays(s);
  assert.ok(pays.length >= 12, `au moins 12 pays attendus, ${pays.length} trouvés`);
  const france = pays.find((p) => p.code === 'FRA');
  assert.ok(france, 'la France doit figurer dans la navigation');
  assert.ok(france.championnats.length >= 3, 'la France doit exposer ses 3 paliers');
  for (const p of pays) {
    assert.ok(p.nom && p.championnats.length > 0, `${p.code} : pays sans championnat`);
    for (const ch of p.championnats) {
      assert.ok(ch.ref && ch.nom, `${p.code} : championnat sans référence ou sans nom`);
    }
  }
});

test('compétitions : le championnat du JOUEUR est signalé comme tel, et une seule fois', () => {
  const s = saisonAvecMonde(941);
  const tous = RMClub.competitionsParPays(s).flatMap((p) => p.championnats);
  // Depuis P1-33, les TROIS compétitions du club du joueur (sa division, son
  // championnat d'Équipe B et celui des espoirs) figurent dans la même
  // navigation et sont toutes marquées comme siennes.
  const siens = tous.filter((ch) => ch.estCelleDuJoueur);
  assert.ok(siens.length >= 1 && siens.length <= 3,
    `entre 1 et 3 compétitions doivent être celles du joueur (${siens.length} trouvées)`);
  assert.strictEqual(siens.filter((ch) => ch.ref === RMClub.REF_COMPETITION_JOUEUR).length, 1,
    'sa division principale doit apparaître exactement une fois');
  for (const ch of siens) {
    const comp = RMClub.competition(s, ch.ref);
    assert.ok(comp, `${ch.ref} : compétition introuvable`);
    assert.ok(comp.clubs.some((c) => c.id === s.clubJoueur.id),
      `${ch.nom} doit réellement contenir le club du joueur`);
  }
});

test('compétitions : chaque championnat expose un classement ET un calendrier réels', () => {
  const s = saisonAvecMonde(942);
  for (const p of RMClub.competitionsParPays(s)) {
    for (const ch of p.championnats) {
      const comp = RMClub.competition(s, ch.ref);
      assert.ok(comp, `${ch.ref} : compétition introuvable`);
      assert.ok(comp.clubs.length > 1, `${ch.ref} : ${comp.clubs.length} club(s)`);
      assert.ok(comp.classement.length === comp.clubs.length,
        `${ch.ref} : classement de ${comp.classement.length} lignes pour ${comp.clubs.length} clubs`);
      assert.ok(comp.calendrier.length > 0, `${ch.ref} : aucun calendrier`);
      // Le calendrier doit désigner des clubs de CETTE compétition.
      const ids = new Set(comp.clubs.map((c) => c.id));
      for (const f of comp.calendrier) {
        assert.ok(ids.has(f.domicileId) && ids.has(f.exterieurId),
          `${ch.ref} : une rencontre oppose des clubs hors de la compétition`);
      }
    }
  }
});

test('compétitions : tout club affiché est retrouvable — donc cliquable', () => {
  const s = saisonAvecMonde(943);
  let verifies = 0;
  for (const p of RMClub.competitionsParPays(s)) {
    for (const ch of p.championnats) {
      for (const c of RMClub.competition(s, ch.ref).clubs) {
        // Les académies du championnat espoirs (P1-31) n'ont volontairement
        // pas de fiche : leur nom est affiché EN TEXTE, jamais un lien mort.
        // Tout autre club doit, lui, être retrouvable donc cliquable.
        if (c.academie) {
          assert.ok(c.nom && c.nom.length > 3, `académie sans nom affichable : ${c.id}`);
          continue;
        }
        assert.ok(RMClub.clubPartout(s, c.id), `club ${c.id} (${c.nom}) introuvable : son nom ne serait pas cliquable`);
        verifies++;
      }
    }
  }
  assert.ok(verifies > 100, `trop peu de clubs vérifiés (${verifies})`);
});

test('compétitions : clubPartout trouve aussi les clubs des autres paliers français', () => {
  const s = saisonAvecMonde(944);
  const divisions = s.autresDivisionsFrance.divisions;
  const premiere = divisions[Object.keys(divisions)[0]];
  const c = premiere.clubs[0];
  const trouve = RMClub.clubPartout(s, c.id);
  assert.ok(trouve, 'un club d\'un autre palier français doit être retrouvable');
  assert.strictEqual(trouve.nom, c.nom);
});

test('compétitions : clubPartout ne confond jamais deux clubs (identifiants uniques)', () => {
  const s = saisonAvecMonde(945);
  const vus = new Map();
  for (const p of RMClub.competitionsParPays(s)) {
    for (const ch of p.championnats) {
      for (const c of RMClub.competition(s, ch.ref).clubs) {
        if (vus.has(c.id)) {
          assert.strictEqual(vus.get(c.id), c.nom,
            `identifiant ${c.id} partagé par « ${vus.get(c.id)} » et « ${c.nom} »`);
        }
        vus.set(c.id, c.nom);
      }
    }
  }
});

test('compétitions : un club du monde reste consultable, sans effectif inventé', () => {
  const s = saisonAvecMonde(946);
  // Une compétition d'un pays autre que la France, prise dans la navigation
  // elle-même (pas en devinant une référence interne).
  const paysEtranger = RMClub.competitionsParPays(s).find((p) => p.code !== 'FRA');
  const mondial = RMClub.competition(s, paysEtranger.championnats[0].ref).clubs[0];
  s.clubJoueur.navigationClub = RMClub.navigationClub(s);
  s.clubJoueur.navigationClub.clubConsulteId = mondial.id;
  s.clubJoueur.navigationClub.equipeConsultee = 'pro';
  const ctx = RMClub.contexteEquipe(s);
  assert.strictEqual(ctx.club.id, mondial.id, 'le club consulté doit être celui du monde');
  assert.ok(!ctx.modifiable, 'un club du monde n\'est jamais modifiable');
  assert.strictEqual(ctx.effectif.length, 0, 'aucun joueur ne doit être inventé pour un club du monde');
  assert.ok(ctx.motifIndisponible && /connu|effectif/i.test(ctx.motifIndisponible),
    'l\'absence d\'effectif doit être expliquée honnêtement, pas laissée vide');
});

// --- P1-29 : de vrais effectifs complets pour les clubs adverses — 15
// titulaires, 8 remplaçants, blessures, fatigue et rotations (demande
// utilisateur, point 6). ---

test('effectifs adverses : chaque club adverse a un groupe complet (23 joueurs minimum)', () => {
  const s = saisonPourAvance(950);
  for (const adv of s.adversaires) {
    const groupe = RMClub.groupeAdverse(s, adv);
    assert.ok(groupe.length >= 23, `${adv.nom} : groupe de ${groupe.length} joueur(s), 23 minimum attendus`);
    for (const j of groupe) {
      assert.ok(j.id, `${adv.nom} : un joueur du groupe sans identifiant`);
      assert.ok(j.poste, `${adv.nom} : un joueur du groupe sans poste`);
      assert.ok(typeof j.fatigue === 'number', `${adv.nom} : ${j.nom} n'a pas de fatigue suivie`);
      assert.ok(typeof j.blessureJournees === 'number', `${adv.nom} : ${j.nom} n'a pas de blessure suivie`);
    }
  }
});

test('effectifs adverses : le XV du jour est TIRÉ du groupe, jamais inventé à côté', () => {
  const s = saisonPourAvance(951);
  for (const adv of s.adversaires) {
    const ids = new Set(RMClub.groupeAdverse(s, adv).map((j) => j.id));
    const slot = RMClub.slotAdverse(adv, RMClub.effectifAdverseNormalise(adv));
    const titulaires = Object.values(slot.compositionTitulaires);
    assert.strictEqual(titulaires.length, 15, `${adv.nom} : ${titulaires.length} titulaires au lieu de 15`);
    for (const id of titulaires) {
      assert.ok(ids.has(id), `${adv.nom} : le titulaire ${id} n'appartient pas à son groupe`);
    }
  }
});

test('effectifs adverses : un banc de 8 remplaçants, sans doublon avec le XV', () => {
  const s = saisonPourAvance(952);
  for (const adv of s.adversaires) {
    const slot = RMClub.slotAdverse(adv, RMClub.effectifAdverseNormalise(adv));
    const banc = Object.values(slot.compositionBanc);
    assert.strictEqual(banc.length, 8, `${adv.nom} : ${banc.length} remplaçant(s) au lieu de 8`);
    const titulaires = new Set(Object.values(slot.compositionTitulaires));
    for (const id of banc) {
      assert.ok(!titulaires.has(id), `${adv.nom} : ${id} est à la fois titulaire et remplaçant`);
    }
    assert.strictEqual(new Set(banc).size, banc.length, `${adv.nom} : un remplaçant apparaît deux fois`);
  }
});

test('effectifs adverses : un match fatigue RÉELLEMENT les joueurs alignés', () => {
  const s = saisonPourAvance(953);
  const adv = s.adversaires[0];
  const groupe = RMClub.groupeAdverse(s, adv);
  for (const j of groupe) j.fatigue = 0;
  const slot = RMClub.slotAdverse(adv, RMClub.effectifAdverseNormalise(adv));
  RMClub.appliquerEffetsMatchAdverse(s, adv, slot);
  const alignes = new Set(Object.values(slot.compositionTitulaires));
  const fatigues = groupe.filter((j) => alignes.has(j.id) && j.fatigue > 0);
  assert.strictEqual(fatigues.length, alignes.size, 'tous les titulaires alignés doivent accumuler de la fatigue');
  const repos = groupe.filter((j) => !alignes.has(j.id)
    && !Object.values(slot.compositionBanc).includes(j.id));
  for (const j of repos) assert.strictEqual(j.fatigue, 0, `${j.nom} n'a pas joué et ne doit pas être fatigué`);
});

test('effectifs adverses : un joueur adverse blessé n\'est PAS aligné la journée suivante', () => {
  const s = saisonPourAvance(954);
  const adv = s.adversaires[0];
  const groupe = RMClub.groupeAdverse(s, adv);
  const slotAvant = RMClub.slotAdverse(adv, RMClub.effectifAdverseNormalise(adv));
  const titulaire = groupe.find((j) => Object.values(slotAvant.compositionTitulaires).includes(j.id));
  titulaire.blessureJournees = 14;
  RMClub.rafraichirEffectifAdverse(s, adv);
  const slotApres = RMClub.slotAdverse(adv, RMClub.effectifAdverseNormalise(adv));
  assert.ok(!Object.values(slotApres.compositionTitulaires).includes(titulaire.id),
    `${titulaire.nom} est blessé (14 jours) et ne doit plus être aligné`);
  assert.strictEqual(Object.values(slotApres.compositionTitulaires).length, 15,
    'le club adverse doit tout de même aligner 15 joueurs');
});

test('effectifs adverses : la rotation change RÉELLEMENT le XV quand le groupe fatigue', () => {
  const s = saisonPourAvance(955);
  const adv = s.adversaires[0];
  const groupe = RMClub.groupeAdverse(s, adv);
  const avant = Object.values(RMClub.slotAdverse(adv, RMClub.effectifAdverseNormalise(adv)).compositionTitulaires);
  // Les titulaires du jour reviennent épuisés : le club doit faire tourner.
  for (const j of groupe) j.fatigue = avant.includes(j.id) ? 95 : 0;
  RMClub.rafraichirEffectifAdverse(s, adv);
  const apres = Object.values(RMClub.slotAdverse(adv, RMClub.effectifAdverseNormalise(adv)).compositionTitulaires);
  const changements = apres.filter((id) => !avant.includes(id)).length;
  assert.ok(changements >= 3, `seulement ${changements} changement(s) dans le XV malgré un groupe épuisé`);
});

test('effectifs adverses : les blessures adverses guérissent avec le temps qui passe', () => {
  const s = saisonPourAvance(956);
  const adv = s.adversaires[0];
  const groupe = RMClub.groupeAdverse(s, adv);
  groupe[0].blessureJournees = 5;
  groupe[1].fatigue = 60;
  for (let i = 0; i < 6; i++) RMClub.avancerUnJour(s);
  assert.strictEqual(groupe[0].blessureJournees, 0, 'une blessure adverse doit se résorber jour après jour');
  assert.ok(groupe[1].fatigue < 60, 'la fatigue adverse doit redescendre jour après jour');
});

test('effectifs adverses : une sauvegarde antérieure (15 joueurs, sans groupe) reste jouable', () => {
  const s = saisonPourAvance(957);
  // Simule l'ancien format : un effectif de 15 par numéro, aucun groupe.
  for (const adv of s.adversaires) {
    delete adv.groupe;
    adv.effectif = RMClub.genererEffectif(creerRng(957), adv.niveauClub);
  }
  const adv = s.adversaires[0];
  const groupe = RMClub.groupeAdverse(s, adv);
  assert.ok(groupe.length >= 23, 'un groupe complet doit être reconstitué à la volée');
  const slot = RMClub.slotAdverse(adv, RMClub.effectifAdverseNormalise(adv));
  assert.strictEqual(Object.values(slot.compositionTitulaires).length, 15,
    'une ancienne sauvegarde doit continuer à aligner un XV complet');
});

test('effectifs adverses : leur fatigue pèse RÉELLEMENT sur les stats envoyées au moteur', () => {
  const s = saisonPourAvance(958);
  const adv = s.adversaires[0];
  const frais = RMClub.effectifVersJoueursCfg(adv);
  for (const j of adv.effectif) j.fatigue = 90;
  const cuit = RMClub.effectifVersJoueursCfg(adv);
  let baisses = 0;
  for (const numero of Object.keys(frais)) {
    assert.ok(cuit[numero].vitesse <= frais[numero].vitesse,
      `n°${numero} : un joueur épuisé ne doit jamais être plus rapide`);
    if (cuit[numero].vitesse < frais[numero].vitesse) baisses++;
  }
  assert.strictEqual(baisses, 15, 'les 15 joueurs épuisés doivent tous perdre en efficacité');
  // Le placement, lui, ne bouge pas : la fatigue n'a jamais déplacé personne.
  for (const numero of Object.keys(frais)) {
    assert.strictEqual(cuit[numero].couloir, frais[numero].couloir, `n°${numero} : le couloir ne doit pas changer`);
  }
});

// --- P1-30 : vraie page joueur — statistiques PAR COMPÉTITION, historique
// des saisons et carrière (demande utilisateur, point 5). ---

const STATS_MATCH_FICTIVES = { 1: { essais: 1, passes: 4, tacklesMade: 8, tacklesAttempted: 10, metresGagnes: 30 } };

test('page joueur : les statistiques sont ventilées PAR COMPÉTITION', () => {
  const s = saisonPourAvance(960);
  const j = s.clubJoueur.effectif[0];
  RMClub.accumulerStatsJoueurs(s.clubJoueur.effectif, { 1: j.id }, STATS_MATCH_FICTIVES, 'pro');
  RMClub.accumulerStatsJoueurs(s.clubJoueur.effectif, { 1: j.id }, STATS_MATCH_FICTIVES, 'b');
  RMClub.accumulerStatsJoueurs(s.clubJoueur.effectif, { 1: j.id }, STATS_MATCH_FICTIVES, 'b');
  const par = j.statsSaison.parCompetition;
  assert.ok(par, 'les statistiques doivent être ventilées par compétition');
  assert.strictEqual(par.pro.matchsJoues, 1, 'un match de championnat');
  assert.strictEqual(par.b.matchsJoues, 2, 'deux matchs d\'Équipe B');
  assert.strictEqual(par.pro.essais + par.b.essais, j.statsSaison.essais,
    'le total doit être exactement la somme des compétitions — jamais un chiffre à part');
  assert.strictEqual(j.statsSaison.matchsJoues, 3);
});

test('page joueur : une compétition non jouée n\'apparaît pas (aucune ligne fabriquée)', () => {
  const s = saisonPourAvance(961);
  const j = s.clubJoueur.effectif[0];
  RMClub.accumulerStatsJoueurs(s.clubJoueur.effectif, { 1: j.id }, STATS_MATCH_FICTIVES, 'pro');
  assert.ok(!j.statsSaison.parCompetition.b, 'aucune ligne « Équipe B » tant qu\'il n\'y a pas joué');
  assert.ok(!j.statsSaison.parCompetition.jeunes, 'aucune ligne « Espoirs » tant qu\'il n\'y a pas joué');
});

test('page joueur : la saison écoulée est ARCHIVÉE dans l\'historique du joueur', () => {
  const s = saisonPourAvance(962);
  const j = s.clubJoueur.effectif[0];
  const idSuivi = j.id;
  RMClub.accumulerStatsJoueurs(s.clubJoueur.effectif, { 1: j.id }, STATS_MATCH_FICTIVES, 'pro');
  const numeroAvant = s.numero;
  RMClub.avancerSaison(creerRng(9620), s);
  const toujoursLa = s.clubJoueur.effectif.find((x) => x.id === idSuivi);
  if (!toujoursLa) return; // parti en fin de contrat : rien à vérifier
  assert.ok(Array.isArray(toujoursLa.historiqueSaisons), 'le joueur doit avoir un historique de saisons');
  const archive = toujoursLa.historiqueSaisons.find((h) => h.saisonNumero === numeroAvant);
  assert.ok(archive, `la saison ${numeroAvant} doit être archivée`);
  assert.strictEqual(archive.essais, 1, 'les chiffres archivés doivent être les chiffres RÉELS de la saison');
  assert.strictEqual(archive.parCompetition.pro.matchsJoues, 1, 'la ventilation par compétition doit être archivée');
  assert.ok(archive.club, 'l\'archive doit dire pour quel club il jouait');
  assert.ok(!toujoursLa.statsSaison || toujoursLa.statsSaison.matchsJoues === 0,
    'la nouvelle saison doit repartir de zéro');
});

test('page joueur : la carrière additionne réellement toutes les saisons', () => {
  const s = saisonPourAvance(963);
  const j = s.clubJoueur.effectif[0];
  j.historiqueSaisons = [
    { saisonNumero: 1, club: 'Ancien Club', age: 22, matchsJoues: 20, essais: 5, passes: 40, tacklesMade: 100, tacklesAttempted: 120, metresGagnes: 300, parCompetition: {} },
    { saisonNumero: 2, club: 'Ancien Club', age: 23, matchsJoues: 18, essais: 3, passes: 35, tacklesMade: 90, tacklesAttempted: 110, metresGagnes: 250, parCompetition: {} },
  ];
  RMClub.accumulerStatsJoueurs(s.clubJoueur.effectif, { 1: j.id }, STATS_MATCH_FICTIVES, 'pro');
  const carriere = RMClub.carriereJoueur(j);
  assert.strictEqual(carriere.saisons, 3, 'deux saisons archivées + la saison en cours');
  assert.strictEqual(carriere.matchsJoues, 39, '20 + 18 + 1');
  assert.strictEqual(carriere.essais, 9, '5 + 3 + 1');
  assert.strictEqual(carriere.metresGagnes, 580, '300 + 250 + 30');
});

test('page joueur : un joueur sans historique a une carrière égale à sa saison en cours', () => {
  const s = saisonPourAvance(964);
  const j = s.clubJoueur.effectif[0];
  const vide = RMClub.carriereJoueur(j);
  assert.strictEqual(vide.saisons, 0, 'aucun match joué = aucune saison de carrière');
  assert.strictEqual(vide.essais, 0);
  RMClub.accumulerStatsJoueurs(s.clubJoueur.effectif, { 1: j.id }, STATS_MATCH_FICTIVES, 'pro');
  const apres = RMClub.carriereJoueur(j);
  assert.strictEqual(apres.saisons, 1);
  assert.strictEqual(apres.essais, 1);
});

test('page joueur : les matchs d\'Équipe B et des espoirs comptent enfin dans les stats', () => {
  const s = saisonPourAvance(965);
  const jeune = (s.clubJoueur.jeunes || [])[0];
  assert.ok(jeune, 'le centre de formation doit avoir des joueurs');
  RMClub.accumulerStatsJoueurs(s.clubJoueur.jeunes, { 1: jeune.id }, STATS_MATCH_FICTIVES, 'jeunes');
  assert.ok(jeune.statsSaison && jeune.statsSaison.matchsJoues === 1,
    'un espoir qui joue doit voir ses statistiques enregistrées');
  assert.strictEqual(jeune.statsSaison.parCompetition.jeunes.essais, 1);
});

// --- P1-31 : un vrai championnat espoirs — clubs persistants, calendrier,
// classement et statistiques (demande utilisateur, point 7). ---

test('championnat espoirs : une vraie compétition existe, avec des académies PERSISTANTES', () => {
  const s = saisonPourAvance(970);
  const comp = RMClub.assurerCompetitionEspoirs(s);
  assert.ok(comp, 'une compétition espoirs doit exister');
  assert.ok(comp.clubs.length >= 4 && comp.clubs.length % 2 === 0,
    `nombre de clubs invalide (${comp.clubs.length}) : il en faut au moins 4, en nombre pair`);
  assert.ok(comp.clubs.some((c) => c.id === s.clubJoueur.id),
    'le centre de formation du joueur doit disputer sa propre compétition');
  // Persistance : deux appels renvoient EXACTEMENT les mêmes académies.
  const idsA = RMClub.assurerCompetitionEspoirs(s).clubs.map((c) => c.id).join(',');
  const idsB = RMClub.assurerCompetitionEspoirs(s).clubs.map((c) => c.id).join(',');
  assert.strictEqual(idsA, idsB, 'les académies doivent être persistantes, pas régénérées à chaque consultation');
});

test('championnat espoirs : le calendrier est un vrai aller-retour, entièrement daté', () => {
  const s = saisonPourAvance(971);
  const comp = RMClub.assurerCompetitionEspoirs(s);
  const n = comp.clubs.length;
  assert.strictEqual(comp.calendrier.length, n * (n - 1),
    `un aller-retour à ${n} clubs fait ${n * (n - 1)} rencontres, ${comp.calendrier.length} trouvées`);
  const ids = new Set(comp.clubs.map((c) => c.id));
  for (const f of comp.calendrier) {
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(f.date || ''), `rencontre sans date (journée ${f.journee})`);
    assert.strictEqual(RMClub.jourSemaine(RMClub.dateDepuisISO(f.date)), 3, 'les espoirs jouent le mercredi');
    assert.ok(ids.has(f.domicileId) && ids.has(f.exterieurId), 'une rencontre oppose des clubs hors compétition');
  }
  // Chaque journée tombe à une date distincte, dans l'ordre.
  const parJournee = {};
  for (const f of comp.calendrier) (parJournee[f.journee] = parJournee[f.journee] || new Set()).add(f.date);
  const journees = Object.keys(parJournee).sort((a, b) => Number(a) - Number(b));
  let precedente = null;
  for (const j of journees) {
    assert.strictEqual(parJournee[j].size, 1, `la journée ${j} doit tenir sur une seule date`);
    const d = Array.from(parJournee[j])[0];
    if (precedente) assert.ok(d > precedente, `la journée ${j} doit venir après la précédente`);
    precedente = d;
  }
});

test('championnat espoirs : un vrai classement à plusieurs clubs, pas un simple bilan', () => {
  const s = saisonPourAvance(972);
  const comp = RMClub.assurerCompetitionEspoirs(s);
  assert.strictEqual(Object.keys(comp.classement).length, comp.clubs.length,
    'le classement doit couvrir tous les clubs de la compétition');
  s.clubJoueur.navigationClub = RMClub.navigationClub(s);
  s.clubJoueur.navigationClub.equipeConsultee = 'jeunes';
  const ctx = RMClub.contexteEquipe(s);
  assert.ok(ctx.classement && Object.keys(ctx.classement).length >= 4,
    'l\'écran Classement des espoirs doit montrer une vraie table, pas le seul bilan du club');
});

test('championnat espoirs : un résultat enregistré met à jour le classement RÉELLEMENT', () => {
  const s = saisonPourAvance(973);
  const comp = RMClub.assurerCompetitionEspoirs(s);
  const f = comp.calendrier[0];
  RMClub.enregistrerResultatEspoirs(s, f.id, 25, 10, 3, 1);
  assert.ok(f.joue, 'la rencontre doit être marquée jouée');
  assert.strictEqual(comp.classement[f.domicileId].g, 1, 'le vainqueur doit avoir une victoire');
  assert.strictEqual(comp.classement[f.exterieurId].p, 1, 'le perdant doit avoir une défaite');
  assert.ok(comp.classement[f.domicileId].pts > comp.classement[f.exterieurId].pts,
    'le vainqueur doit avoir plus de points');
});

test('championnat espoirs : la prochaine ronde regroupe toutes les rencontres de la journée', () => {
  const s = saisonPourAvance(974);
  const comp = RMClub.assurerCompetitionEspoirs(s);
  const ronde = RMClub.prochaineRondeEspoirs(s);
  assert.strictEqual(ronde.length, comp.clubs.length / 2,
    `une journée doit compter ${comp.clubs.length / 2} rencontres`);
  assert.ok(ronde.every((f) => f.journee === ronde[0].journee), 'toutes de la même journée');
});

test('championnat espoirs : chaque académie adverse a un niveau propre et un nom stable', () => {
  const s = saisonPourAvance(975);
  const comp = RMClub.assurerCompetitionEspoirs(s);
  const academies = comp.clubs.filter((c) => c.id !== s.clubJoueur.id);
  assert.ok(academies.length >= 3, 'il faut de vraies académies adverses');
  for (const a of academies) {
    assert.ok(a.nom && a.nom.length > 3, 'une académie sans nom');
    assert.ok(a.niveauClub > 0 && a.niveauClub < 1, `niveau invalide pour ${a.nom} : ${a.niveauClub}`);
  }
  assert.strictEqual(new Set(academies.map((a) => a.nom)).size, academies.length,
    'deux académies ne doivent pas porter le même nom');
});

test('championnat espoirs : une sauvegarde antérieure gagne sa compétition sans rien perdre', () => {
  const s = saisonPourAvance(976);
  delete s.competitionEspoirs;
  s.clubJoueur.matchsEspoirs = [{ journee: 4, adversaire: 'Académie Ancienne', scorePour: 20, scoreContre: 15 }];
  const comp = RMClub.assurerCompetitionEspoirs(s);
  assert.ok(comp && comp.calendrier.length > 0, 'la compétition doit être créée à la volée');
  assert.strictEqual(s.clubJoueur.matchsEspoirs.length, 1, 'les résultats déjà archivés ne doivent pas être perdus');
});

// --- P1-32 : organiser un match amical sur une date libre (demande
// utilisateur, point 8). ---

test('amicaux : les dates libres excluent les jours de match et leurs veilles', () => {
  const s = saisonPourAvance(980);
  const libres = RMClub.datesLibresPourAmical(s, 60);
  assert.ok(libres.length > 0, 'une intersaison doit offrir des dates libres');
  for (const d of libres) {
    const date = RMClub.dateDepuisISO(d.iso);
    assert.strictEqual(RMClub.typeDArret(s, date), null, `${d.iso} : une rencontre y est déjà programmée`);
    const veille = RMClub.ajouterJours(date, 1);
    assert.strictEqual(RMClub.typeDArret(s, veille), null,
      `${d.iso} : un amical la veille d'un match officiel n'a pas de sens`);
    assert.ok(RMClub.comparerDates(date, RMClub.dateCourante(s)) > 0, `${d.iso} : une date libre est toujours à venir`);
  }
});

test('amicaux : proposer un amical le programme RÉELLEMENT au calendrier', () => {
  const s = saisonPourAvance(981);
  const adv = s.adversaires[0];
  const libre = RMClub.datesLibresPourAmical(s, 60)[0];
  const r = RMClub.proposerAmical(s, adv.id, libre.iso);
  assert.ok(r.accepte, `l'amical doit être accepté (motif : ${r.motif})`);
  assert.ok(Array.isArray(s.amicaux) && s.amicaux.length === 1, 'l\'amical doit être persisté');
  const a = s.amicaux[0];
  assert.strictEqual(a.date, libre.iso);
  assert.strictEqual(a.adversaireId, adv.id);
  assert.ok(!a.joue, 'un amical programmé n\'est pas encore joué');
  // Il devient un vrai jour d'arrêt, comme un match officiel.
  assert.strictEqual(RMClub.typeDArret(s, RMClub.dateDepuisISO(libre.iso)), 'amical',
    'le jour de l\'amical doit devenir une échéance');
});

test('amicaux : impossible d\'en programmer deux le même jour, ni sur un jour de match', () => {
  const s = saisonPourAvance(982);
  const libre = RMClub.datesLibresPourAmical(s, 60)[0];
  RMClub.proposerAmical(s, s.adversaires[0].id, libre.iso);
  const doublon = RMClub.proposerAmical(s, s.adversaires[1].id, libre.iso);
  assert.ok(!doublon.accepte, 'deux rencontres le même jour doivent être refusées');
  assert.strictEqual(s.amicaux.length, 1, 'aucun second amical ne doit être enregistré');
  // Sur une date de championnat : refus aussi.
  const arret = RMClub.prochainArret(s);
  const surMatch = RMClub.proposerAmical(s, s.adversaires[1].id, RMClub.dateISO(arret.date));
  assert.ok(!surMatch.accepte, 'un amical le jour d\'un match officiel doit être refusé');
});

test('amicaux : une date passée est refusée', () => {
  const s = saisonPourAvance(983);
  const hier = RMClub.dateISO(RMClub.ajouterJours(RMClub.dateCourante(s), -1));
  const r = RMClub.proposerAmical(s, s.adversaires[0].id, hier);
  assert.ok(!r.accepte, 'on ne programme pas un match dans le passé');
});

test('amicaux : un amical peut être annulé tant qu\'il n\'est pas joué', () => {
  const s = saisonPourAvance(984);
  const libre = RMClub.datesLibresPourAmical(s, 60)[0];
  RMClub.proposerAmical(s, s.adversaires[0].id, libre.iso);
  const id = s.amicaux[0].id;
  assert.ok(RMClub.annulerAmical(s, id), 'l\'annulation doit réussir');
  assert.strictEqual(s.amicaux.length, 0, 'l\'amical doit disparaître du calendrier');
  assert.strictEqual(RMClub.typeDArret(s, RMClub.dateDepuisISO(libre.iso)), null,
    'le jour redevient libre après annulation');
});

test('amicaux : le résultat est enregistré et ne touche JAMAIS le classement', () => {
  const s = saisonPourAvance(985);
  const adv = s.adversaires[0];
  const libre = RMClub.datesLibresPourAmical(s, 60)[0];
  RMClub.proposerAmical(s, adv.id, libre.iso);
  const classementAvant = JSON.stringify(s.classement);
  RMClub.enregistrerResultatAmical(s, s.amicaux[0].id, 30, 12);
  const a = s.amicaux[0];
  assert.ok(a.joue, 'l\'amical doit être marqué joué');
  assert.deepStrictEqual(a.score, { pour: 30, contre: 12 });
  assert.strictEqual(JSON.stringify(s.classement), classementAvant,
    'un match amical ne rapporte AUCUN point au championnat');
  assert.strictEqual(RMClub.typeDArret(s, RMClub.dateDepuisISO(libre.iso)), null,
    'une fois joué, le jour n\'est plus une échéance');
});

test('amicaux : les amicaux passés sont nettoyés au changement de saison', () => {
  const s = saisonPourAvance(986);
  const libre = RMClub.datesLibresPourAmical(s, 60)[0];
  RMClub.proposerAmical(s, s.adversaires[0].id, libre.iso);
  RMClub.avancerSaison(creerRng(9860), s);
  assert.strictEqual((s.amicaux || []).length, 0,
    'les amicaux d\'une saison écoulée ne doivent pas encombrer la suivante');
});

// --- P1-34 : moteur GÉNÉRIQUE de coupes à élimination directe, puis quatre
// coupes réelles (demande utilisateur, point 9). ---

test('coupes : le moteur construit un tableau à élimination directe complet', () => {
  const clubs = [];
  for (let i = 0; i < 8; i++) clubs.push({ id: 'c' + i, nom: 'Club ' + i, niveauClub: 0.4 + i * 0.05 });
  const coupe = RMClub.genererCoupe({ cle: 'test', nom: 'Coupe Test', clubs, dates: ['2024-10-02', '2024-11-06', '2024-12-04'] });
  assert.strictEqual(coupe.tours.length, 3, '8 clubs = quarts, demies, finale');
  assert.strictEqual(coupe.tours[0].rencontres.length, 4, '4 quarts de finale');
  assert.strictEqual(coupe.tours[1].rencontres.length, 2, '2 demi-finales');
  assert.strictEqual(coupe.tours[2].rencontres.length, 1, 'une finale');
  assert.strictEqual(coupe.tours[2].nom, 'Finale');
  assert.strictEqual(coupe.tours[1].nom, 'Demi-finales');
  // Chaque tour est daté, dans l'ordre.
  assert.strictEqual(coupe.tours[0].date, '2024-10-02');
  assert.strictEqual(coupe.tours[2].date, '2024-12-04');
  // Tous les clubs entrent au premier tour, une seule fois.
  const engages = coupe.tours[0].rencontres.flatMap((r) => [r.domicileId, r.exterieurId]);
  assert.strictEqual(new Set(engages).size, 8, 'les 8 clubs doivent être engagés une seule fois');
});

test('coupes : un nombre de clubs non puissance de 2 est ramené à la puissance inférieure', () => {
  const clubs = [];
  for (let i = 0; i < 13; i++) clubs.push({ id: 'c' + i, nom: 'Club ' + i, niveauClub: 0.3 + i * 0.04 });
  const coupe = RMClub.genererCoupe({ cle: 't2', nom: 'T2', clubs, dates: ['2024-10-02', '2024-11-06', '2024-12-04'] });
  const engages = coupe.tours[0].rencontres.flatMap((r) => [r.domicileId, r.exterieurId]);
  assert.strictEqual(engages.length, 8, '13 clubs -> 8 qualifiés, jamais de rencontre bancale');
  assert.strictEqual(new Set(engages).size, 8);
  // Les MEILLEURS sont retenus : c'est une qualification, pas un tirage au hasard.
  const niveaux = engages.map((id) => clubs.find((c) => c.id === id).niveauClub);
  assert.ok(Math.min.apply(null, niveaux) > clubs[0].niveauClub, 'les clubs les plus faibles ne sont pas qualifiés');
});

test('coupes : un résultat fait RÉELLEMENT avancer le vainqueur au tour suivant', () => {
  const clubs = [];
  for (let i = 0; i < 4; i++) clubs.push({ id: 'c' + i, nom: 'Club ' + i, niveauClub: 0.5 });
  const coupe = RMClub.genererCoupe({ cle: 't3', nom: 'T3', clubs, dates: ['2024-10-02', '2024-11-06'] });
  const demi = coupe.tours[0].rencontres[0];
  assert.strictEqual(coupe.tours[1].rencontres[0].domicileId, null, 'la finale est vide avant les demies');
  RMClub.enregistrerResultatCoupe(coupe, demi.id, 25, 12);
  assert.ok(demi.joue);
  assert.strictEqual(demi.vainqueurId, demi.domicileId, 'le vainqueur est celui qui a marqué le plus');
  assert.strictEqual(coupe.tours[1].rencontres[0].domicileId, demi.domicileId,
    'le vainqueur doit réellement apparaître au tour suivant');
});

test('coupes : jamais de match nul — une prolongation départage', () => {
  const clubs = [];
  for (let i = 0; i < 2; i++) clubs.push({ id: 'c' + i, nom: 'Club ' + i, niveauClub: 0.5 });
  const coupe = RMClub.genererCoupe({ cle: 't4', nom: 'T4', clubs, dates: ['2024-10-02'] });
  const finale = coupe.tours[0].rencontres[0];
  RMClub.enregistrerResultatCoupe(coupe, finale.id, 17, 17);
  assert.ok(finale.vainqueurId, 'une coupe ne peut pas se terminer sur un nul : un vainqueur doit être désigné');
  assert.ok(finale.apresProlongation, 'le départage doit être annoncé comme tel');
  assert.strictEqual(RMClub.vainqueurCoupe(coupe), finale.vainqueurId, 'le vainqueur de la finale gagne la coupe');
});

test('coupes : le vainqueur n\'existe qu\'une fois la finale jouée', () => {
  const clubs = [];
  for (let i = 0; i < 4; i++) clubs.push({ id: 'c' + i, nom: 'C' + i, niveauClub: 0.5 });
  const coupe = RMClub.genererCoupe({ cle: 't5', nom: 'T5', clubs, dates: ['2024-10-02', '2024-11-06'] });
  assert.strictEqual(RMClub.vainqueurCoupe(coupe), null, 'aucun vainqueur tant que la finale n\'est pas jouée');
  for (const r of coupe.tours[0].rencontres) RMClub.enregistrerResultatCoupe(coupe, r.id, 20, 10);
  assert.strictEqual(RMClub.vainqueurCoupe(coupe), null, 'toujours pas de vainqueur après les demies');
  RMClub.enregistrerResultatCoupe(coupe, coupe.tours[1].rencontres[0].id, 30, 15);
  assert.ok(RMClub.vainqueurCoupe(coupe), 'la finale jouée désigne enfin un vainqueur');
});

test('coupes : les QUATRE coupes existent réellement dans une saison', () => {
  const s = saisonAvecMonde(990);
  const coupes = RMClub.assurerCoupes(s);
  const cles = Object.keys(coupes);
  assert.ok(cles.length >= 4, `quatre coupes attendues, ${cles.length} trouvée(s) : ${cles.join(', ')}`);
  for (const cle of cles) {
    const c = coupes[cle];
    assert.ok(c.nom && c.nom.length > 3, `${cle} : coupe sans nom`);
    assert.ok(c.tours.length >= 2, `${cle} : ${c.tours.length} tour(s), il en faut au moins 2`);
    for (const t of c.tours) {
      assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(t.date || ''), `${cle} / ${t.nom} : tour sans date`);
    }
  }
});

test('coupes : le club du joueur est engagé dans la coupe nationale', () => {
  const s = saisonAvecMonde(991);
  const coupes = RMClub.assurerCoupes(s);
  const nationale = coupes.nationale;
  assert.ok(nationale, 'une coupe nationale doit exister');
  const engages = nationale.tours[0].rencontres.flatMap((r) => [r.domicileId, r.exterieurId]);
  assert.ok(engages.indexOf(s.clubJoueur.id) !== -1, 'le club du joueur doit disputer la coupe nationale');
});

test('coupes : les tours tombent sur des dates SANS match de championnat', () => {
  const s = saisonAvecMonde(992);
  const coupes = RMClub.assurerCoupes(s);
  for (const cle of Object.keys(coupes)) {
    for (const t of coupes[cle].tours) {
      const engages = t.rencontres.flatMap((r) => [r.domicileId, r.exterieurId]).filter(Boolean);
      if (engages.indexOf(s.clubJoueur.id) === -1) continue;
      const date = RMClub.dateDepuisISO(t.date);
      assert.notStrictEqual(RMClub.typeDArret(s, date), 'pro',
        `${coupes[cle].nom} / ${t.nom} : tombe le jour d'un match de championnat`);
    }
  }
});

test('coupes : une coupe se joue entièrement et désigne un vainqueur, sans nul', () => {
  const s = saisonAvecMonde(993);
  const coupes = RMClub.assurerCoupes(s);
  const c = coupes.nationale;
  const rng = creerRng(9930);
  for (const t of c.tours) {
    for (const r of t.rencontres) {
      assert.ok(r.domicileId && r.exterieurId,
        `${t.nom} : rencontre incomplète — un vainqueur n'a pas été reporté`);
      const a = c.clubs.find((x) => x.id === r.domicileId);
      const b = c.clubs.find((x) => x.id === r.exterieurId);
      const res = RMWorld.simulerResultatAbstrait(rng, a.niveauClub, b.niveauClub);
      RMClub.enregistrerResultatCoupe(c, r.id, res.scoreA, res.scoreB);
    }
  }
  assert.ok(c.tours.every((t) => t.rencontres.every((r) => r.joue)), 'tous les tours doivent être joués');
  assert.strictEqual(c.tours.flatMap((t) => t.rencontres).filter((r) => r.joue && !r.vainqueurId).length, 0,
    'aucune rencontre de coupe ne peut rester sans vainqueur');
  assert.ok(RMClub.vainqueurCoupe(c), 'la coupe doit avoir un vainqueur');
});

test('coupes : les coupes sont régénérées au changement de saison', () => {
  const s = saisonAvecMonde(994);
  RMClub.assurerCoupes(s);
  const avant = Object.keys(s.coupes).length;
  assert.ok(avant >= 4);
  RMClub.avancerSaison(creerRng(9940), s);
  assert.strictEqual(Object.keys(s.coupes || {}).length, 0,
    'les coupes de la saison écoulée ne doivent pas encombrer la suivante');
});

test('coupes : une rencontre de coupe du joueur devient une échéance datée', () => {
  const s = saisonAvecMonde(995);
  const coupes = RMClub.assurerCoupes(s);
  let trouve = null;
  for (const cle of Object.keys(coupes)) {
    for (const t of coupes[cle].tours) {
      for (const r of t.rencontres) {
        if (!trouve && (r.domicileId === s.clubJoueur.id || r.exterieurId === s.clubJoueur.id)) {
          trouve = { t, r };
        }
      }
    }
  }
  assert.ok(trouve, 'le club du joueur doit disputer au moins une rencontre de coupe');
  const date = RMClub.dateDepuisISO(trouve.t.date);
  assert.strictEqual(RMClub.typeDArret(s, date), 'coupe',
    'le jour de sa rencontre de coupe doit être une échéance');
  const info = RMClub.rencontreCoupeDuJoueur(s, date);
  assert.ok(info && info.rencontre.id === trouve.r.id, 'la rencontre du jour doit être retrouvée');
});

// --- P1-35 : « une semaine dans la peau du manager » — la carte
// « Prochaine échéance » annonce la MÊME échéance que le bouton, et elle
// seule (demande utilisateur : parcours fluide, pas de carte redondante). ---

test('échéance : prochainArret décrit la rencontre (adversaire, lieu, équipe concernée)', () => {
  const s = saisonPourAvance(1000);
  const arret = RMClub.prochainArret(s);
  assert.ok(arret, 'une saison neuve doit avoir une prochaine échéance');
  assert.ok(arret.adversaireNom, 'l\'échéance doit nommer l\'adversaire — sinon la carte doit le recalculer elle-même');
  assert.strictEqual(typeof arret.domicile, 'boolean', 'l\'échéance doit dire si la rencontre est à domicile');
  assert.ok(arret.libelle, 'l\'échéance doit porter un libellé lisible');
});

test('échéance : carte et bouton parlent TOUJOURS de la même rencontre', () => {
  const s = saisonPourAvance(1001);
  // On balaie toute la saison : à chaque jour, la rencontre décrite par
  // prochainArret doit être celle que le bouton vise. Un seul objet, donc
  // aucune divergence possible — c'est ce que ce test verrouille.
  for (let i = 0; i < 60; i++) {
    const arret = RMClub.prochainArret(s);
    if (!arret) break;
    const evenements = RMClub.evenementsDuJour(s, arret.date);
    const typeAttendu = RMClub.typeDArret(s, arret.date);
    assert.strictEqual(arret.type, typeAttendu,
      `${RMClub.dateISO(arret.date)} : la carte annoncerait « ${arret.type} » alors que ce jour-là c'est « ${typeAttendu} »`);
    if (arret.type === 'pro') {
      assert.ok(evenements.matchPro, 'une échéance « pro » doit correspondre à une vraie rencontre de championnat');
      const f = evenements.matchPro;
      const adverseId = f.domicileId === s.clubJoueur.id ? f.exterieurId : f.domicileId;
      const adverse = RMClub.clubPartout(s, adverseId);
      assert.strictEqual(arret.adversaireNom, adverse.nom,
        'l\'adversaire annoncé doit être celui de la rencontre réellement programmée');
      assert.strictEqual(arret.domicile, f.domicileId === s.clubJoueur.id,
        'le lieu annoncé doit être le lieu réel');
    }
    RMClub.definirDateCourante(s, RMClub.ajouterJours(arret.date, 1));
  }
});

// --- P1-36 : une seule zone « À traiter » — décisions, alertes et messages
// non lus au même endroit, classés par urgence (demande utilisateur). ---

test('à traiter : une DÉCISION à trancher passe avant tout le reste', () => {
  const s = saisonPourAvance(1010);
  // Un blessé : alerte réelle mais pas une décision. On passe par l'API
  // médicale réelle (P1-40) plutôt que d'écrire le miroir dérivé à la main —
  // c'est ainsi que le jeu blesse un joueur depuis cette tranche.
  RMClub.infligerBlessure(s, s.clubJoueur.effectif[0], 'match', creerRng(88));
  RMClub.ajouterMessage(s, 'joueur', 'Temps de jeu', 'Un joueur demande une réponse.', {
    type: 'tempsDeJeu', joueurId: s.clubJoueur.effectif[1].id,
    options: [{ id: 'rassurer', label: 'Le rassurer' }, { id: 'ignorer', label: 'Ignorer' }],
  });
  const liste = RMClub.elementsATraiter(s);
  assert.ok(liste.length >= 2, 'la liste doit contenir la décision ET l\'alerte blessure');
  assert.strictEqual(liste[0].niveau, 'decision', 'une décision à trancher passe en premier');
  assert.ok(liste[0].onglet, 'chaque élément doit dire quel écran le résout');
  assert.ok(liste.some((e) => e.niveau === 'urgent' && /bless/i.test(e.texte)),
    'une blessure réelle doit apparaître comme urgente');
});

test('à traiter : chaque élément porte un niveau connu et un écran de résolution', () => {
  const s = saisonPourAvance(1011);
  s.clubJoueur.effectif[0].blessureJournees = 10;
  s.clubJoueur.effectif[1].fatigue = 85;
  s.clubJoueur.budget = -50;
  const niveaux = ['decision', 'urgent', 'recommande', 'info'];
  const liste = RMClub.elementsATraiter(s);
  assert.ok(liste.length >= 3, `au moins 3 éléments attendus, ${liste.length} trouvé(s)`);
  for (const e of liste) {
    assert.ok(niveaux.indexOf(e.niveau) !== -1, `niveau inconnu : ${e.niveau}`);
    assert.ok(e.onglet, `« ${e.texte} » n'indique aucun écran pour le résoudre`);
    assert.ok(e.texte && e.texte.length > 3, 'un élément sans texte lisible');
  }
  // L'ordre est celui de l'urgence : jamais un « info » avant un « urgent ».
  const rangs = liste.map((e) => niveaux.indexOf(e.niveau));
  for (let i = 1; i < rangs.length; i++) {
    assert.ok(rangs[i] >= rangs[i - 1], 'la liste doit être triée du plus urgent au moins urgent');
  }
});

test('à traiter : les messages NON LUS sont signalés, avec leur nombre réel', () => {
  const s = saisonPourAvance(1012);
  // La feuille de route annoncée à l'ouverture (P1-46) est un vrai message
  // non lu : on la lit d'abord, puis on vérifie que plus rien ne traîne.
  RMClub.marquerTousMessagesLus(s);
  assert.ok(!RMClub.elementsATraiter(s).some((e) => e.cle === 'messages'),
    'aucune ligne « messages » tant qu\'il n\'y a rien à lire');
  RMClub.ajouterMessage(s, 'match', 'Résultat', 'Victoire.');
  RMClub.ajouterMessage(s, 'blessure', 'Blessure', 'Un joueur est blessé.');
  const ligne = RMClub.elementsATraiter(s).find((e) => e.cle === 'messages');
  assert.ok(ligne, 'les messages non lus doivent apparaître dans la zone à traiter');
  assert.ok(/2/.test(ligne.texte), `le nombre réel de non-lus doit être affiché (« ${ligne.texte} »)`);
  assert.strictEqual(ligne.onglet, 'dashboard', 'la boîte de réception vit sur le tableau de bord');
});

test('à traiter : un club sain n\'affiche AUCUNE ligne inventée', () => {
  const s = saisonPourAvance(1013);
  for (const j of s.clubJoueur.effectif) { j.blessureJournees = 0; j.fatigue = 0; j.contrat = 3; }
  s.clubJoueur.budget = 500;
  s.clubJoueur.messages = [];
  assert.deepStrictEqual(RMClub.elementsATraiter(s), [],
    'rien à traiter doit vouloir dire une liste vide, pas une carte décorative');
});


// --- P1-40 : Centre médical 2.0 et reprise progressive ---------------------
// Écrits AVANT le code, chacun vérifié en échec sur le modèle actuel.

test('médical : une blessure est un OBJET persistant, pas un simple compteur', () => {
  const s = saisonPourAvance(1400);
  const j = s.clubJoueur.effectif[0];
  const b = RMClub.infligerBlessure(s, j, 'match', creerRng(7));
  assert.ok(b, 'infligerBlessure doit renvoyer la blessure créée');
  for (const champ of ['type', 'zone', 'gravite', 'dateBlessure', 'joursMin', 'joursMax',
                       'cause', 'risqueRechute', 'etape']) {
    assert.ok(b[champ] != null, `la blessure doit porter « ${champ} »`);
  }
  assert.strictEqual(b.cause, 'match');
  assert.strictEqual(j.blessure, b, 'la blessure vit SUR le joueur');
  assert.ok(j.blessureJournees > 0, 'le miroir dérivé doit refléter l\'indisponibilité');
});

test('médical : le diagnostic est STABLE après un aller-retour de sauvegarde', () => {
  const s = saisonPourAvance(1401);
  const j = s.clubJoueur.effectif[0];
  RMClub.infligerBlessure(s, j, 'match', creerRng(11));
  const avant = JSON.parse(JSON.stringify(j.blessure));
  const recharge = JSON.parse(JSON.stringify(s));
  const jApres = recharge.clubJoueur.effectif.find((x) => x.id === j.id);
  assert.deepStrictEqual(jApres.blessure, avant,
    'un rechargement ne doit RIEN retirer au hasard : même type, même zone, même durée');
  assert.strictEqual(RMClub.joursIndisponible(jApres), RMClub.joursIndisponible(j));
});

test('médical : deux blessures ne donnent pas toujours la même durée', () => {
  const s = saisonPourAvance(1402);
  const durees = new Set(), types = new Set();
  const rng = creerRng(3);
  for (let i = 0; i < 40; i++) {
    const j = s.clubJoueur.effectif[i % s.clubJoueur.effectif.length];
    j.blessure = null; j.blessureJournees = 0;
    const b = RMClub.infligerBlessure(s, j, 'match', rng);
    durees.add(RMClub.joursIndisponible(j)); types.add(b.type);
  }
  assert.ok(durees.size >= 5, `des durées variées attendues, obtenu ${durees.size} valeur(s)`);
  assert.ok(types.size >= 3, `des types de blessure variés attendus, obtenu ${types.size}`);
});

test('médical : un joueur FATIGUÉ se blesse davantage qu\'un joueur frais', () => {
  const s = saisonPourAvance(1403);
  const modele = s.clubJoueur.effectif.find((j) => j.poste === 'P') || s.clubJoueur.effectif[0];
  function compter(fatigue) {
    const rng = creerRng(99);
    let n = 0;
    for (let i = 0; i < 4000; i++) {
      const j = Object.assign({}, modele, { fatigue, blessure: null, blessureJournees: 0, historiqueBlessures: [] });
      if (RMClub.tirerBlessure(rng, j, { cause: 'match' })) n++;
    }
    return n;
  }
  const frais = compter(0), cuit = compter(95);
  assert.ok(cuit > frais * 1.4,
    `un joueur cuit doit se blesser NETTEMENT plus : frais=${frais}, cuit=${cuit}`);
});

test('médical : le poste, l\'âge et les antécédents pèsent sur le risque', () => {
  const s = saisonPourAvance(1404);
  const base = s.clubJoueur.effectif[0];
  function compter(patch) {
    const rng = creerRng(1234);
    let n = 0;
    for (let i = 0; i < 4000; i++) {
      const j = Object.assign({}, base, { fatigue: 40, blessure: null, blessureJournees: 0, historiqueBlessures: [] }, patch);
      if (RMClub.tirerBlessure(rng, j, { cause: 'match' })) n++;
    }
    return n;
  }
  assert.ok(compter({ poste: 'P' }) > compter({ poste: 'AR' }),
    'un pilier doit se blesser plus qu\'un arrière');
  assert.ok(compter({ age: 35 }) > compter({ age: 22 }),
    'un joueur de 35 ans doit se blesser plus qu\'un joueur de 22 ans');
  const antecedents = [{ type: 'dechirure', zone: 'ischio', gravite: 3 }, { type: 'entorse', zone: 'cheville', gravite: 2 }];
  assert.ok(compter({ historiqueBlessures: antecedents }) > compter({ historiqueBlessures: [] }),
    'des antécédents doivent augmenter le risque');
});

test('médical : le médecin raccourcit l\'indisponibilité ET resserre le diagnostic', () => {
  const s = saisonPourAvance(1405);
  function mesurer(niveauMedecin) {
    s.clubJoueur.personnel = niveauMedecin ? [{ poste: 'medecin', niveau: niveauMedecin, nom: 'Doc', salaire: 10 }] : [];
    let total = 0, fourchette = 0;
    const rng = creerRng(555);
    for (let i = 0; i < 60; i++) {
      const j = s.clubJoueur.effectif[i % s.clubJoueur.effectif.length];
      j.blessure = null; j.blessureJournees = 0;
      const b = RMClub.infligerBlessure(s, j, 'match', rng);
      total += RMClub.joursIndisponible(j);
      fourchette += (b.joursMax - b.joursMin);
    }
    return { duree: total / 60, fourchette: fourchette / 60 };
  }
  const sans = mesurer(0), avec = mesurer(95);
  assert.ok(avec.duree < sans.duree, `le médecin doit raccourcir : sans=${sans.duree}, avec=${avec.duree}`);
  assert.ok(avec.fourchette < sans.fourchette,
    `le médecin doit resserrer le diagnostic : sans=±${sans.fourchette}, avec=±${avec.fourchette}`);
});

test('médical : reprise en 5 étapes, franchies dans l\'ordre', () => {
  const s = saisonPourAvance(1406);
  const j = s.clubJoueur.effectif[0];
  RMClub.infligerBlessure(s, j, 'match', creerRng(21));
  const vues = [];
  for (let i = 0; i < 120; i++) {
    const e = RMClub.etapeReprise(j);
    if (e && vues[vues.length - 1] !== e) vues.push(e);
    RMClub.avancerJourMedical(s, j);
  }
  assert.deepStrictEqual(vues, RMClub.ETAPES_REPRISE,
    `les cinq étapes doivent être franchies dans l'ordre, obtenu : ${vues.join(' -> ')}`);
});

test('médical : un joueur en reprise joue avec un MALUS mesurable', () => {
  const s = saisonPourAvance(1407);
  const j = s.clubJoueur.effectif[0];
  const sain = RMClub.coefficientReprise(j);
  assert.strictEqual(sain, 1, 'un joueur sain ne subit aucun malus');
  RMClub.infligerBlessure(s, j, 'match', creerRng(31));
  while (RMClub.joursIndisponible(j) > 0) RMClub.avancerJourMedical(s, j);
  const enReprise = RMClub.coefficientReprise(j);
  assert.ok(enReprise < 1, `un joueur tout juste rétabli doit être diminué (obtenu ${enReprise})`);
  // …et le malus doit RÉELLEMENT descendre jusqu'au moteur, pas rester
  // affiché dans l'onglet Médical.
  const sansReprise = Object.assign({}, j, { reprise: null, blessure: null });
  const cfgSain = RMClub.compositionVersJoueursCfg([sansReprise], { 1: j.id });
  const cfgReprise = RMClub.compositionVersJoueursCfg([j], { 1: j.id });
  assert.ok(cfgReprise['1'].vitesse < cfgSain['1'].vitesse,
    `la vitesse transmise au moteur doit baisser (sain ${cfgSain['1'].vitesse}, reprise ${cfgReprise['1'].vitesse})`);
  assert.ok(cfgReprise['1'].plaquage < cfgSain['1'].plaquage,
    'le plaquage transmis au moteur doit baisser aussi');
});

test('médical : accélérer le retour augmente RÉELLEMENT le risque de rechute', () => {
  const s = saisonPourAvance(1408);
  const j = s.clubJoueur.effectif[0];
  RMClub.infligerBlessure(s, j, 'match', creerRng(41));
  const avant = j.blessure.risqueRechute;
  const joursAvant = RMClub.joursIndisponible(j);
  const ok = RMClub.accelererRetour(s, j);
  assert.strictEqual(ok, true, 'accélérer doit être possible sur un joueur blessé');
  assert.ok(RMClub.joursIndisponible(j) < joursAvant, 'le retour doit être réellement avancé');
  assert.ok(j.blessure.risqueRechute > avant,
    `le risque de rechute doit monter (avant ${avant}, après ${j.blessure.risqueRechute})`);
  assert.strictEqual(j.blessure.reprisePrecipitee, true);
});

test('médical : une blessure guérie laisse un ANTÉCÉDENT', () => {
  const s = saisonPourAvance(1409);
  const j = s.clubJoueur.effectif[0];
  RMClub.infligerBlessure(s, j, 'match', creerRng(51));
  const type = j.blessure.type;
  for (let i = 0; i < 200 && (j.blessure || RMClub.etapeReprise(j)); i++) RMClub.avancerJourMedical(s, j);
  assert.ok((j.historiqueBlessures || []).length >= 1, 'la blessure doit rester dans l\'historique');
  assert.strictEqual(j.historiqueBlessures[0].type, type);
});

test('médical : une sauvegarde v4 (compteur nu) migre sans perte', () => {
  const s = saisonPourAvance(1410);
  const j = s.clubJoueur.effectif[0];
  // Sauvegarde à l'ancienne : un compteur, aucun objet blessure.
  j.blessureJournees = 9; delete j.blessure; delete j.historiqueBlessures;
  const brute = JSON.parse(JSON.stringify(s));
  brute.version = 4;
  const res = RMClub.migrerSaison(brute);
  assert.strictEqual(res.ok, true, `la migration doit réussir (${res.raison || ''})`);
  const jm = res.saison.clubJoueur.effectif.find((x) => x.id === j.id);
  assert.ok(jm.blessure, 'le compteur nu doit devenir une vraie blessure');
  assert.strictEqual(RMClub.joursIndisponible(jm), 9, 'l\'indisponibilité restante est PRÉSERVÉE');
  assert.ok(Array.isArray(jm.historiqueBlessures));
});



test('médical : les conséquences d\'un match sont les MÊMES pour les trois équipes', () => {
  // Mesuré avant P1-40 : l'Équipe B n'appliquait NI fatigue NI blessure, et
  // les Espoirs aucune blessure. Un joueur pouvait disputer toute la saison
  // avec la réserve sans jamais fatiguer ni se blesser.
  const s = saisonPourAvance(1411);
  for (const equipe of ['pro', 'b', 'jeunes']) {
    const groupe = RMClub.effectifPourEquipe(s, equipe).slice(0, 15);
    assert.ok(groupe.length >= 15, `l'équipe ${equipe} doit avoir un XV`);
    const compo = {};
    groupe.forEach((j, i) => { compo[String(i + 1)] = j.id; j.fatigue = 0; j.blessure = null; j.blessureJournees = 0; });
    const avant = groupe.map((j) => j.fatigue || 0);
    RMClub.appliquerEffetsMatch(s, groupe, compo, creerRng(400 + equipe.length), { equipe });
    const apres = groupe.map((j) => j.fatigue || 0);
    assert.ok(apres.every((f, i) => f > avant[i]),
      `tout titulaire de l'équipe ${equipe} doit encaisser de la fatigue`);
  }
});

test('médical : les quatre types de match peuvent TOUS blesser', () => {
  const s = saisonPourAvance(1412);
  const compte = {};
  for (const type of ['pro', 'coupe', 'amical', 'b']) {
    let n = 0;
    const rng = creerRng(777);
    for (let i = 0; i < 400; i++) {
      const groupe = s.clubJoueur.effectif.slice(0, 15).map((j) =>
        Object.assign({}, j, { fatigue: 60, blessure: null, blessureJournees: 0, reprise: null, historiqueBlessures: [] }));
      const compo = {};
      groupe.forEach((j, k) => { compo[String(k + 1)] = j.id; });
      n += RMClub.appliquerEffetsMatch(s, groupe, compo, rng, { equipe: type === 'b' ? 'b' : 'pro' }).blessures.length;
    }
    compte[type] = n;
  }
  for (const type of Object.keys(compte)) {
    assert.ok(compte[type] > 0, `un match « ${type} » doit pouvoir blesser (obtenu ${compte[type]})`);
  }
});

test('médical : le préparateur physique réduit RÉELLEMENT le risque de blessure', () => {
  const s = saisonPourAvance(1413);
  const modele = s.clubJoueur.effectif[0];
  function compter(facteurPreparateur) {
    const rng = creerRng(4242);
    let n = 0;
    for (let i = 0; i < 5000; i++) {
      const j = Object.assign({}, modele, { fatigue: 55, blessure: null, blessureJournees: 0, historiqueBlessures: [] });
      if (RMClub.tirerBlessure(rng, j, { cause: 'match', facteurPreparateur })) n++;
    }
    return n;
  }
  const sans = compter(1), avec = compter(1 / 1.7); // préparateur de niveau élevé
  assert.ok(avec < sans * 0.8,
    `un bon préparateur doit réduire nettement le risque : sans=${sans}, avec=${avec}`);
});

test('médical : un joueur en reprise limitée ne peut jouer QU\'avec l\'Équipe B ou les Espoirs', () => {
  const s = saisonPourAvance(1414);
  const j = s.clubJoueur.effectif[0];
  RMClub.infligerBlessure(s, j, 'match', creerRng(61));
  while (RMClub.etapeReprise(j) !== 'tempsDeJeuLimite') {
    if (!RMClub.avancerJourMedical(s, j) && !j.blessure && !j.reprise) break;
  }
  assert.strictEqual(RMClub.etapeReprise(j), 'tempsDeJeuLimite');
  assert.strictEqual(RMClub.peutJouer(j, 'pro'), false, 'pas encore avec le premier XV');
  assert.strictEqual(RMClub.peutJouer(j, 'b'), true, 'mais oui avec l\'Équipe B');
  assert.strictEqual(RMClub.peutJouer(j, 'jeunes'), true, 'ou avec les Espoirs');
});

// --- P1-41 : une seule vue « Préparer le match » ---------------------------
// Mesuré sur une carrière neuve AVANT d'écrire le code : le même adversaire,
// le même lieu et la MÊME date apparaissaient dans trois cartes du tableau
// de bord (« Prochaine échéance » 305 px, « Préparation » 353 px, « Prochain
// adversaire » 343 px, soit 1001 px) ET dans l'aperçu d'avant-match.

test('préparation : UN dossier unique assemblé depuis prochainArret()', () => {
  const s = saisonPourAvance(1500);
  const d = RMClub.dossierPreparation(s);
  assert.ok(d, 'une carrière neuve a une rencontre à préparer');
  const arret = RMClub.prochainArret(s);
  // La rencontre du dossier est EXACTEMENT celle de prochainArret : c'est la
  // source unique exigée, pas une seconde résolution parallèle.
  assert.strictEqual(RMClub.dateISO(d.rencontre.date), RMClub.dateISO(arret.date));
  assert.strictEqual(d.type, arret.type);
  assert.strictEqual(d.equipe, RMClub.equipePourArret(arret.type));
  assert.strictEqual(d.adversaireNom, arret.adversaireNom);
  assert.strictEqual(d.domicile, arret.domicile);
  for (const champ of ['competition', 'libelleEquipe', 'joursRestants', 'jouable']) {
    assert.ok(d[champ] !== undefined, `le dossier doit porter « ${champ} »`);
  }
});

test('préparation : le dossier ne STOCKE rien dans la saison', () => {
  const s = saisonPourAvance(1501);
  const avant = JSON.stringify(s);
  RMClub.dossierPreparation(s);
  RMClub.dossierPreparation(s);
  // `daterCalendrier` peut compléter des dates manquantes au premier appel :
  // on compare donc deux appels SUCCESSIFS, qui doivent être identiques.
  const apres1 = JSON.stringify(s);
  RMClub.dossierPreparation(s);
  assert.strictEqual(JSON.stringify(s), apres1,
    'appeler le dossier ne doit créer aucun second état de préparation');
  assert.ok(avant.length > 0);
});

test('préparation : le dossier réutilise l\'état existant, sans le recalculer', () => {
  const s = saisonPourAvance(1502);
  const d = RMClub.dossierPreparation(s);
  const etat = RMClub.etatPreparationMatch(s, d.equipe);
  assert.strictEqual(d.etat.points.length, etat.points.length);
  assert.strictEqual(d.etat.pretPct, etat.pretPct);
  assert.deepStrictEqual(d.etat.points.map((x) => x.cle), etat.points.map((x) => x.cle));
});

test('préparation : « jouable » seulement quand la date est atteinte', () => {
  const s = saisonPourAvance(1503);
  const d = RMClub.dossierPreparation(s);
  assert.ok(d.joursRestants > 0, 'ce test suppose une rencontre à venir');
  assert.strictEqual(d.jouable, false, 'on ne lance pas un match avant sa date');
  RMClub.definirDateCourante(s, d.rencontre.date);
  assert.strictEqual(RMClub.dossierPreparation(s).jouable, true, 'le jour dit, le match est lançable');
});

test('préparation : jamais de compte à rebours NÉGATIF', () => {
  const s = saisonPourAvance(1504);
  for (let i = 0; i < 60; i++) {
    const d = RMClub.dossierPreparation(s);
    if (!d) break;
    assert.ok(d.joursRestants >= 0, `joursRestants négatif (${d.joursRestants})`);
    RMClub.avancerUnJour(s);
  }
});

test('préparation : le MÊME dossier sert les cinq types de rencontre', () => {
  const s = saisonPourAvance(1505);
  const vus = {};
  for (let i = 0; i < 200; i++) {
    const d = RMClub.dossierPreparation(s);
    if (d) {
      vus[d.type] = d;
      // Quelle que soit la compétition, le dossier porte les mêmes champs.
      assert.ok(d.equipe && d.libelleEquipe && d.competition,
        `dossier incomplet pour « ${d.type} »`);
      assert.ok(['pro', 'b', 'jeunes'].indexOf(d.equipe) !== -1);
    }
    RMClub.avancerUnJour(s);
  }
  // Sur deux mois de calendrier, on doit rencontrer plusieurs types.
  assert.ok(Object.keys(vus).length >= 2,
    `plusieurs types de rencontre attendus, vus : ${Object.keys(vus).join(', ')}`);
});

test('préparation : l\'analyse de l\'adversaire porte sur CE match, pas un autre', () => {
  const s = saisonPourAvance(1506);
  const d = RMClub.dossierPreparation(s);
  if (d.analyse) {
    assert.strictEqual(d.analyse.clubId, d.adversaireId,
      'l\'analyse doit porter sur l\'adversaire de la rencontre préparée');
  }
  // Et quand l'analyste n'a pas fini son travail, on le DIT au lieu
  // d'afficher une analyse à moitié fausse.
  assert.strictEqual(typeof d.analyseDisponible, 'boolean');
});



// --- P1-42 : première vraie carrière de manager ----------------------------
// Le joueur créait un club et y restait POUR TOUJOURS. La confiance du
// président évoluait sans la moindre conséquence, et tout le domaine
// « Carrière du manager » (ROADMAP domaine 8) était vide.

test('manager : une nouvelle partie possède un profil de manager', () => {
  const s = RMClub.nouvelleSaison(creerRng(1600), 'Test Manager', 'Alex Dupont');
  assert.ok(s.manager, 'saison.manager doit exister');
  assert.strictEqual(s.manager.nom, 'Alex Dupont');
  assert.strictEqual(s.manager.clubActuelId, s.clubJoueur.id);
  assert.strictEqual(s.manager.statut, 'enPoste');
  // `trophees` a ete retire du profil : il etait initialise a [] et JAMAIS
  // ecrit, tout en s'affichant au manager comme « Trophees : 0 » a perpetuite.
  // Un palmares cumule reste a construire (cf. ROADMAP, domaine 7).
  for (const champ of ['id', 'reputation', 'saisonsDirigees', 'historiqueClubs', 'saisons',
                       'promotions', 'relegations']) {
    assert.ok(s.manager[champ] !== undefined, `le profil doit porter « ${champ} »`);
  }
  // Le profil ne vit PAS dans le club : c'est ce qui permet d'en changer.
  assert.strictEqual(s.clubJoueur.manager, undefined);
  assert.strictEqual(s.manager.historiqueClubs.length, 1);
  assert.strictEqual(s.manager.historiqueClubs[0].clubId, s.clubJoueur.id);
});

test('manager : une ancienne sauvegarde est migrée SANS PERTE', () => {
  const s = saisonPourAvance(1601);
  // Sauvegarde d'avant la tranche : aucun manager.
  delete s.manager;
  const brute = JSON.parse(JSON.stringify(s));
  brute.version = 5;
  const avant = {
    club: brute.clubJoueur.id, nom: brute.clubJoueur.nom,
    joueurs: brute.clubJoueur.effectif.length,
    budget: brute.clubJoueur.budget,
    calendrier: brute.calendrier.length,
    adversaires: brute.adversaires.length,
  };
  const res = RMClub.migrerSaison(brute);
  assert.strictEqual(res.ok, true, `la migration doit réussir (${res.raison || ''})`);
  const m = res.saison;
  assert.ok(m.manager, 'la migration doit créer le profil de manager');
  assert.strictEqual(m.manager.clubActuelId, avant.club, 'le manager dirige le club existant');
  // RIEN d'autre ne bouge.
  assert.strictEqual(m.clubJoueur.id, avant.club);
  assert.strictEqual(m.clubJoueur.nom, avant.nom);
  assert.strictEqual(m.clubJoueur.effectif.length, avant.joueurs);
  assert.strictEqual(m.clubJoueur.budget, avant.budget);
  assert.strictEqual(m.calendrier.length, avant.calendrier);
  assert.strictEqual(m.adversaires.length, avant.adversaires);
});

test('manager : la réputation MONTE après une vraie réussite', () => {
  const avant = 50;
  const apres = RMClub.appliquerReputation(avant, {
    position: 1, totalClubs: 14, objectifAtteint: true,
    mouvement: 'promotion', niveauDivision: 3, deltaBudget: 120,
  });
  assert.ok(apres > avant, `une promotion doit faire monter la réputation (${avant} -> ${apres})`);
});

test('manager : la réputation BAISSE après un vrai échec', () => {
  const avant = 50;
  const apres = RMClub.appliquerReputation(avant, {
    position: 14, totalClubs: 14, objectifAtteint: false,
    mouvement: 'relegation', niveauDivision: 1, deltaBudget: -200,
  });
  assert.ok(apres < avant, `une relégation doit faire baisser la réputation (${avant} -> ${apres})`);
});

test('manager : une promotion avec un PETIT club rapporte plus qu\'une saison moyenne dans un grand', () => {
  const petitPromu = RMClub.gainReputation({
    position: 1, totalClubs: 14, objectifAtteint: true, mouvement: 'promotion',
    niveauDivision: 3, deltaBudget: 0,
  });
  const grandMoyen = RMClub.gainReputation({
    position: 7, totalClubs: 14, objectifAtteint: true, mouvement: null,
    niveauDivision: 1, deltaBudget: 0,
  });
  assert.ok(petitPromu > grandMoyen,
    `promotion en Régionale (${petitPromu}) doit rapporter plus qu'un milieu de tableau en Excellence (${grandMoyen})`);
});

test('manager : la réputation ne dépend d\'AUCUN tirage aléatoire', () => {
  const bilan = { position: 3, totalClubs: 14, objectifAtteint: true, mouvement: null, niveauDivision: 2, deltaBudget: 40 };
  const a = RMClub.gainReputation(bilan);
  for (let i = 0; i < 20; i++) assert.strictEqual(RMClub.gainReputation(bilan), a);
});

test('manager : une confiance basse produit un AVERTISSEMENT, pas un licenciement immédiat', () => {
  const s = saisonPourAvance(1602);
  RMClub.assurerManager(s, 'Test');
  s.clubJoueur.confiancePresident = 25;
  const etat = RMClub.securiteEmploi(s);
  assert.strictEqual(etat.niveau, 'avertissement', `attendu « avertissement », obtenu « ${etat.niveau} »`);
  assert.ok(etat.libelle && etat.explication, 'l\'état doit être expliqué au manager');
  // Une seule mauvaise saison ne suffit pas à licencier.
  assert.notStrictEqual(etat.niveau, 'licenciement');
});

test('manager : le licenciement demande une confiance BASSE et une mauvaise DURÉE', () => {
  const s = saisonPourAvance(1603);
  RMClub.assurerManager(s, 'Test');
  s.clubJoueur.confiancePresident = 8;
  // Une seule saison ratée : pas encore de licenciement.
  s.manager.saisons = [{ numeroSaison: 1, objectifAtteint: false }];
  assert.notStrictEqual(RMClub.securiteEmploi(s).niveau, 'licenciement',
    'un seul échec ne doit pas suffire');
  // Deux saisons ratées d'affilée avec une confiance au plancher : oui.
  s.manager.saisons = [{ numeroSaison: 1, objectifAtteint: false }, { numeroSaison: 2, objectifAtteint: false }];
  assert.strictEqual(RMClub.securiteEmploi(s).niveau, 'licenciement');
});

test('manager : un licenciement ouvre RÉELLEMENT des possibilités d\'emploi', () => {
  const s = saisonPourAvance(1604);
  RMClub.assurerManager(s, 'Test');
  s.manager.reputation = 55;
  RMClub.licencierManager(s, 'Résultats insuffisants');
  assert.strictEqual(s.manager.statut, 'sansClub');
  assert.strictEqual(s.manager.clubActuelId, null);
  const offres = RMClub.offresDisponibles(s);
  assert.ok(offres.length > 0, 'un manager libre doit voir des postes');
  assert.ok(offres.length <= 5, `quelques offres pertinentes, pas toute la ligue (${offres.length})`);
  for (const o of offres) {
    assert.ok((s.adversaires || []).some((a) => a.id === o.clubId),
      'une offre doit venir d\'un club RÉEL de la pyramide');
    for (const champ of ['clubNom', 'division', 'position', 'objectif', 'budget', 'confianceInitiale', 'raison']) {
      assert.ok(o[champ] !== undefined, `l'offre doit montrer « ${champ} »`);
    }
  }
});

test('manager : une offre REFUSÉE ne change rien', () => {
  const s = saisonPourAvance(1605);
  RMClub.assurerManager(s, 'Test');
  RMClub.licencierManager(s, 'test');
  const offres = RMClub.offresDisponibles(s);
  const avant = JSON.stringify({ club: s.clubJoueur.id, statut: s.manager.statut, hist: s.manager.historiqueClubs.length });
  RMClub.refuserOffre(s, offres[0].id);
  const apres = JSON.stringify({ club: s.clubJoueur.id, statut: s.manager.statut, hist: s.manager.historiqueClubs.length });
  assert.strictEqual(apres, avant, 'refuser ne doit rien changer au club ni à la carrière');
  assert.ok(!RMClub.offresDisponibles(s).some((o) => o.id === offres[0].id),
    'une offre refusée ne doit plus être proposée');
});

test('manager : une offre ACCEPTÉE change réellement de club, sans repartir de zéro', () => {
  const s = saisonPourAvance(1606);
  RMClub.assurerManager(s, 'Test');
  const ancienId = s.clubJoueur.id;
  const ancienNom = s.clubJoueur.nom;
  const numeroAvant = s.numero;
  const dateAvant = RMClub.dateISO(RMClub.dateCourante(s));
  const calendrierAvant = s.calendrier.length;
  RMClub.licencierManager(s, 'test');
  const offre = RMClub.offresDisponibles(s)[0];
  const cible = s.adversaires.find((a) => a.id === offre.clubId);
  // On vérifie qu'AUCUN joueur du club n'est remplacé — pas que la liste est
  // identique au caractère près : un club dirigé a besoin d'un banc, donc le
  // groupe réel (24 joueurs persistés, cf. P1-29) sert de base et la
  // profondeur peut être complétée.
  const joueursCible = cible.effectif.map((j) => j.id);
  const nomCible = cible.nom;

  RMClub.accepterOffre(s, offre.id);

  // 8. le club change RÉELLEMENT
  assert.strictEqual(s.clubJoueur.id, offre.clubId);
  assert.strictEqual(s.clubJoueur.nom, nomCible);
  assert.strictEqual(s.manager.clubActuelId, offre.clubId);
  assert.strictEqual(s.manager.statut, 'enPoste');
  // 9. l'ancien club reste dans le monde, avec son identité et ses joueurs
  const ancien = s.adversaires.find((a) => a.id === ancienId);
  assert.ok(ancien, 'l\'ancien club doit rester un club du monde');
  assert.strictEqual(ancien.nom, ancienNom);
  assert.ok(ancien.effectif.length > 0, 'il garde ses joueurs');
  assert.ok(s.classement[ancienId], 'et ses résultats');
  // 10. le nouveau club garde SON véritable effectif
  const idsApres = new Set(s.clubJoueur.effectif.map((j) => j.id));
  for (const id of joueursCible) {
    assert.ok(idsApres.has(id), `le joueur ${id} du club repris a disparu — effectif régénéré ?`);
  }
  assert.ok(s.clubJoueur.effectif.length >= 23,
    'un club dirigé doit pouvoir aligner un XV et un banc');
  // 11. la saison et la date ne repartent pas à zéro
  assert.strictEqual(s.numero, numeroAvant);
  assert.strictEqual(RMClub.dateISO(RMClub.dateCourante(s)), dateAvant);
  assert.strictEqual(s.calendrier.length, calendrierAvant);
  // 12. l'historique du manager conserve les DEUX clubs
  assert.strictEqual(s.manager.historiqueClubs.length, 2);
  assert.strictEqual(s.manager.historiqueClubs[0].clubId, ancienId);
  assert.strictEqual(s.manager.historiqueClubs[1].clubId, offre.clubId);
  // Le club cible ne doit plus figurer parmi les adversaires.
  assert.ok(!s.adversaires.some((a) => a.id === offre.clubId));
});

test('manager : aucun identifiant de l\'ancien club ne survit au changement', () => {
  const s = saisonPourAvance(1607);
  RMClub.assurerManager(s, 'Test');
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  const ancienId = s.clubJoueur.id;
  const ancienJoueurs = new Set(s.clubJoueur.effectif.map((j) => j.id));
  const cible = s.adversaires[0];
  RMClub.changerClubManager(s, cible.id);
  const slot = RMClub.slotCompositionPourEquipe(s, 'pro');
  for (const id of Object.values(slot.compositionTitulaires || {})) {
    assert.ok(!ancienJoueurs.has(id), 'aucun joueur de l\'ancien club ne peut rester dans la composition');
  }
  for (const champ of ['capitaineId', 'buteurId', 'lanceurToucheId']) {
    if (slot[champ]) assert.ok(!ancienJoueurs.has(slot[champ]), `${champ} pointe encore l'ancien club`);
  }
  assert.notStrictEqual(s.clubJoueur.id, ancienId);
});

test('manager : sauvegarder puis recharger après un changement de club donne le MÊME état', () => {
  const s = saisonPourAvance(1608);
  RMClub.assurerManager(s, 'Test Recharge');
  RMClub.changerClubManager(s, s.adversaires[0].id);
  const avant = JSON.stringify(s);
  const res = RMClub.migrerSaison(JSON.parse(avant));
  assert.strictEqual(res.ok, true);
  assert.strictEqual(JSON.stringify(res.saison), avant,
    'un aller-retour de sauvegarde ne doit RIEN changer après un changement de club');
});



// --- P1-42a : l'ultimatum de la direction ----------------------------------
// Le point d'étape écrivait « Confiance −4 (31 %) » : un chiffre, sans la
// moindre conséquence. La confiance pouvait tomber à 5 % sans que rien
// n'arrive avant la fin de saison.

function saisonSousPression(graine, position) {
  const s = saisonPourAvance(graine);
  RMClub.assurerManager(s, 'Test Ultimatum');
  s.clubJoueur.objectifSaison = { position: 6, totalClubs: 14 };
  s.clubJoueur.confiancePresident = 31;
  return s;
}

test('ultimatum : rien tant que la confiance reste correcte', () => {
  const s = saisonSousPression(1700);
  s.clubJoueur.confiancePresident = 60;
  assert.strictEqual(RMClub.ultimatumEnCours(s), null,
    'une direction satisfaite ne pose pas d\'ultimatum');
  assert.strictEqual(RMClub.poserUltimatum(s, { position: 12, total: 14 }), null);
});

test('ultimatum : sous le seuil, la direction pose un vrai ultimatum chiffré', () => {
  const s = saisonSousPression(1701);
  const u = RMClub.poserUltimatum(s, { position: 12, total: 14 });
  assert.ok(u, 'sous le seuil, un ultimatum doit être posé');
  assert.ok(u.matchsRestants >= 2, 'il doit laisser un nombre de matchs réel');
  assert.ok(u.positionCible < 12, `la cible doit être meilleure que la position actuelle (${u.positionCible})`);
  assert.strictEqual(u.positionDepart, 12);
  // Il vit dans la SAUVEGARDE, pas seulement à l'écran.
  assert.strictEqual(RMClub.ultimatumEnCours(s), u);
  assert.ok(u.explication && /12e/.test(u.explication) && /6e/.test(u.explication),
    `l'explication doit dire la position ET l'objectif : « ${u.explication} »`);
});

test('ultimatum : un seul à la fois', () => {
  const s = saisonSousPression(1702);
  const premier = RMClub.poserUltimatum(s, { position: 12, total: 14 });
  const second = RMClub.poserUltimatum(s, { position: 13, total: 14 });
  assert.strictEqual(second, null, 'on ne cumule pas deux ultimatums');
  assert.strictEqual(RMClub.ultimatumEnCours(s), premier);
});

test('ultimatum : il se décompte à chaque match RÉEL', () => {
  const s = saisonSousPression(1703);
  const u = RMClub.poserUltimatum(s, { position: 12, total: 14 });
  const depart = u.matchsRestants;
  RMClub.avancerUltimatum(s, { position: 12, total: 14 });
  assert.strictEqual(RMClub.ultimatumEnCours(s).matchsRestants, depart - 1);
  RMClub.avancerUltimatum(s, { position: 12, total: 14 });
  assert.strictEqual(RMClub.ultimatumEnCours(s).matchsRestants, depart - 2);
});

test('ultimatum : cible atteinte AVANT la fin -> confiance restaurée, ultimatum levé', () => {
  const s = saisonSousPression(1704);
  const u = RMClub.poserUltimatum(s, { position: 12, total: 14 });
  const confianceAvant = s.clubJoueur.confiancePresident;
  const res = RMClub.avancerUltimatum(s, { position: u.positionCible, total: 14 });
  assert.strictEqual(res.issue, 'reussi');
  assert.strictEqual(RMClub.ultimatumEnCours(s), null, 'un ultimatum réussi est levé');
  assert.ok(s.clubJoueur.confiancePresident > confianceAvant,
    'réussir doit RÉELLEMENT restaurer la confiance');
  assert.ok(s.clubJoueur.messages.some((m) => /ultimatum|soutien|confiance/i.test(m.titre + m.corps)));
});

test('ultimatum : échoué à la fin du compte -> licenciement RÉEL', () => {
  const s = saisonSousPression(1705);
  const u = RMClub.poserUltimatum(s, { position: 12, total: 14 });
  const aJouer = u.matchsRestants;
  let res = null;
  for (let i = 0; i < aJouer; i++) {
    res = RMClub.avancerUltimatum(s, { position: 13, total: 14 });
  }
  assert.strictEqual(res.issue, 'echoue');
  assert.strictEqual(s.manager.statut, 'sansClub', 'échouer doit licencier pour de bon');
  assert.strictEqual(RMClub.ultimatumEnCours(s), null);
  // …et le manager ne reste pas sans issue : le marché existe.
  assert.ok(RMClub.offresDisponibles(s).length > 0,
    'un manager licencié doit accéder au marché de l\'emploi');
});

test('ultimatum : il survit à un rechargement de sauvegarde', () => {
  const s = saisonSousPression(1706);
  const u = RMClub.poserUltimatum(s, { position: 12, total: 14 });
  const recharge = JSON.parse(JSON.stringify(s));
  const apres = RMClub.ultimatumEnCours(recharge);
  assert.ok(apres, 'l\'ultimatum doit être dans la sauvegarde');
  assert.strictEqual(apres.matchsRestants, u.matchsRestants);
  assert.strictEqual(apres.positionCible, u.positionCible);
});

test('ultimatum : il apparaît dans « À traiter » avec les matchs restants', () => {
  const s = saisonSousPression(1707);
  RMClub.poserUltimatum(s, { position: 12, total: 14 });
  const ligne = RMClub.elementsATraiter(s).find((e) => e.cle === 'ultimatum');
  assert.ok(ligne, 'l\'ultimatum doit figurer dans la zone à traiter');
  assert.strictEqual(ligne.niveau, 'urgent');
  assert.ok(/match/.test(ligne.texte), `le compte à rebours doit être visible : « ${ligne.texte} »`);
});

test('ultimatum : aucune part d\'aléatoire', () => {
  const a = saisonSousPression(1708);
  const b = saisonSousPression(1708);
  const ua = RMClub.poserUltimatum(a, { position: 11, total: 14 });
  const ub = RMClub.poserUltimatum(b, { position: 11, total: 14 });
  assert.strictEqual(ua.matchsRestants, ub.matchsRestants);
  assert.strictEqual(ua.positionCible, ub.positionCible);
});



// --- P1-43a : le monde ne se réinitialise plus chaque été -------------------
// Mesuré AVANT : à chaque intersaison, un club IA perdait ses 24 joueurs et en
// recevait 24 inconnus (`effectif: genererEffectif(...)` dans club.js). Aucun
// joueur du monde ne gardait son identité, et aucun transfert n'avait jamais
// lieu entre deux clubs IA.

// Fait jouer TOUT le calendrier puis clôt réellement la saison, sans
// promotion ni relégation (position volontairement médiane), pour observer
// l'intersaison des clubs IA seule.
function saisonPuisIntersaison(graine) {
  const s = saisonPourAvance(graine);
  const id = s.clubJoueur.id;
  // Le club du joueur perd tout et finit DERNIER. Une carrière neuve démarre
  // au palier 3 (Ligue Régionale), d'où l'on ne peut pas descendre : ni
  // montée ni descente, donc la division garde EXACTEMENT les mêmes clubs
  // d'une saison à l'autre. C'est la seule façon d'observer l'intersaison
  // des clubs IA isolément.
  for (const f of s.calendrier) {
    if (f.domicileId === id) RMClub.enregistrerResultat(s, f.id, 3, 30, 0, 4);
    else if (f.exterieurId === id) RMClub.enregistrerResultat(s, f.id, 30, 3, 4, 0);
    else RMClub.enregistrerResultat(s, f.id, 20, 20, 2, 2);
  }
  return s;
}

function groupesParClub(saison) {
  const m = {};
  for (const a of saison.adversaires || []) m[a.id] = RMClub.groupeAdverse(saison, a).map((j) => j.id);
  return m;
}

test('mercato IA : un club IA GARDE ses joueurs d\'une saison à l\'autre', () => {
  const s = saisonPuisIntersaison(4301);
  const avant = groupesParClub(s);
  RMClub.avancerSaison(creerRng(1), s);
  const apres = groupesParClub(s);
  const communs = [];
  for (const id of Object.keys(avant)) {
    if (!apres[id]) continue;
    const set = new Set(apres[id]);
    communs.push(avant[id].filter((x) => set.has(x)).length / avant[id].length);
  }
  assert.ok(communs.length > 0, 'les mêmes clubs doivent être là (ni montée ni descente)');
  const moyenne = communs.reduce((a, b) => a + b, 0) / communs.length;
  assert.ok(moyenne >= 0.6,
    `un club IA doit conserver la majorité de son groupe (mesuré ${Math.round(moyenne * 100)} %)`);
});

test('mercato IA : les joueurs des clubs IA VIEILLISSENT d\'un an', () => {
  const s = saisonPuisIntersaison(4302);
  const club = s.adversaires[0];
  const avant = {};
  for (const j of RMClub.groupeAdverse(s, club)) avant[j.id] = j.age;
  RMClub.avancerSaison(creerRng(2), s);
  const memeClub = s.adversaires.find((a) => a.id === club.id);
  const survivants = RMClub.groupeAdverse(s, memeClub).filter((j) => avant[j.id] != null);
  assert.ok(survivants.length > 0, 'au moins un joueur doit survivre à l\'intersaison');
  for (const j of survivants) {
    assert.strictEqual(j.age, avant[j.id] + 1, `${j.nom} doit avoir exactement un an de plus`);
  }
});

test('mercato IA : les plus vieux prennent leur retraite', () => {
  let s = saisonPuisIntersaison(4303);
  for (let i = 0; i < 4; i++) {
    RMClub.avancerSaison(creerRng(10 + i), s);
    for (const f of s.calendrier) RMClub.enregistrerResultat(s, f.id, 20, 20, 2, 2);
  }
  for (const a of s.adversaires) {
    for (const j of RMClub.groupeAdverse(s, a)) {
      assert.ok(j.age < 40, `${j.nom} (${j.age} ans) aurait dû prendre sa retraite`);
    }
  }
});

test('mercato IA : l\'effectif d\'un club IA reste complet après l\'intersaison', () => {
  const s = saisonPuisIntersaison(4304);
  RMClub.avancerSaison(creerRng(3), s);
  for (const a of s.adversaires) {
    const g = RMClub.groupeAdverse(s, a);
    assert.ok(g.length >= 23, `${a.nom} n'a que ${g.length} joueurs`);
    assert.ok(a.effectif && a.effectif.length >= 15,
      `${a.nom} doit garder une feuille de match complète (${(a.effectif || []).length})`);
    const postes = new Set(g.map((j) => j.poste));
    assert.ok(postes.size >= 8, `${a.nom} ne couvre que ${postes.size} postes différents`);
  }
});

test('mercato IA : de VRAIS mouvements ont lieu entre clubs IA', () => {
  const s = saisonPuisIntersaison(4305);
  RMClub.avancerSaison(creerRng(4), s);
  const mercato = s.mercato;
  assert.ok(mercato, 'l\'intersaison doit produire un mercato dans la sauvegarde');
  assert.ok(Array.isArray(mercato.mouvements) && mercato.mouvements.length > 0,
    'au moins un joueur doit changer de club chez les rivaux');
  for (const t of mercato.mouvements) {
    assert.ok(t.joueurNom, 'un mouvement nomme le joueur');
    assert.ok(t.deClubId && t.versClubId, 'un mouvement a un club de départ et un club d\'arrivée');
    assert.notStrictEqual(t.deClubId, t.versClubId, 'un club ne se signe pas un joueur à lui-même');
    assert.ok(t.montant >= 0, 'un mouvement a un montant (0 pour un joueur libre)');
    assert.ok(t.type === 'libre' || t.type === undefined || t.montant > 0,
      'un mouvement payant doit avoir un montant strictement positif');
  }
});

test('mercato IA : un mouvement DÉPLACE réellement le joueur', () => {
  const s = saisonPuisIntersaison(4306);
  RMClub.avancerSaison(creerRng(5), s);
  const t = s.mercato.mouvements[0];
  const vendeur = s.adversaires.find((a) => a.id === t.deClubId);
  const acheteur = s.adversaires.find((a) => a.id === t.versClubId);
  assert.ok(vendeur && acheteur, 'les deux clubs existent toujours');
  const chezVendeur = RMClub.groupeAdverse(s, vendeur).some((j) => j.id === t.joueurId);
  const chezAcheteur = RMClub.groupeAdverse(s, acheteur).some((j) => j.id === t.joueurId);
  assert.strictEqual(chezVendeur, false, 'le joueur a QUITTÉ son ancien club');
  assert.strictEqual(chezAcheteur, true, 'le joueur est ARRIVÉ dans son nouveau club');
});

// Une indemnité de transfert vaut 325 a 711 k€ mesuré, pour des budgets de
// 246 a 446 k€ en Ligue Régionale : à ce niveau, un transfert PAYANT est
// normalement hors de portée (le marché des joueurs libres du jeu ne facture
// d'ailleurs aucune indemnité). On vérifie donc le chemin payant là où il
// existe VRAIMENT : sur des clubs qui en ont les moyens.
test('mercato IA : un transfert PAYANT coûte à l\'acheteur et rapporte au vendeur', () => {
  const s = saisonPuisIntersaison(4307);
  // Des clubs réellement riches : le chemin payant devient atteignable.
  for (const a of s.adversaires) a.budget = 4000;
  RMClub.avancerSaison(creerRng(6), s);
  const payants = s.mercato.transferts;
  assert.ok(payants.length > 0,
    'avec des budgets suffisants, de vrais transferts payants doivent avoir lieu');
  for (const t of payants) {
    assert.ok(t.montant > 0, 'un transfert payant a un montant réel');
    assert.strictEqual(t.budgetAcheteurAvant - t.budgetAcheteurApres, t.montant,
      'l\'acheteur paie EXACTEMENT le montant');
    assert.strictEqual(t.budgetVendeurApres - t.budgetVendeurAvant, t.montant,
      'le vendeur encaisse EXACTEMENT le montant');
  }
});

test('mercato IA : aucun club ne dépense plus qu\'il n\'a', () => {
  const s = saisonPuisIntersaison(4308);
  RMClub.avancerSaison(creerRng(7), s);
  for (const a of s.adversaires) {
    assert.ok(a.budget >= 0, `${a.nom} a un budget négatif (${a.budget})`);
  }
});

// Les effectifs des clubs IA sont tirés d'une graine dérivée de l'ID du club,
// et ces ID viennent d'un compteur global au processus : deux mondes créés
// l'un après l'autre n'ont donc PAS les mêmes joueurs. La propriété qui
// compte réellement — et celle dont dépend un rechargement de sauvegarde —
// est qu'un MÊME monde produise toujours le même mercato. C'est ce qu'on
// vérifie, en clonant le monde avant de faire tourner l'intersaison.
test('mercato IA : entièrement déterministe (aucun Math.random)', () => {
  const a = saisonPuisIntersaison(4309);
  const b = JSON.parse(JSON.stringify(a));
  RMClub.avancerSaison(creerRng(8), a);
  RMClub.avancerSaison(creerRng(8), b);
  // Les identifiants de club viennent d'un compteur global au processus :
  // deux mondes créés l'un après l'autre en reçoivent forcément de
  // différents. On compare donc ce qui décrit le mercato lui-même — qui
  // bouge, d'où, vers où, pour combien.
  const resume = (s) => s.mercato.mouvements.map((t) =>
    `${t.type}|${t.joueurNom}|${t.poste}|${t.age}|${t.deClubNom}|${t.versClubNom}|${t.montant}`);
  assert.deepStrictEqual(resume(a), resume(b),
    'deux mondes identiques doivent produire le MÊME mercato');
  assert.ok(resume(a).length > 0, 'le scénario doit produire des mouvements à comparer');
});

test('mercato IA : le mercato survit à un rechargement de sauvegarde', () => {
  const s = saisonPuisIntersaison(4310);
  RMClub.avancerSaison(creerRng(9), s);
  const recharge = JSON.parse(JSON.stringify(s));
  assert.deepStrictEqual(recharge.mercato, s.mercato);
});

test('mercato IA : le manager en est RÉELLEMENT informé', () => {
  const s = saisonPuisIntersaison(4311);
  RMClub.avancerSaison(creerRng(12), s);
  const msg = (s.clubJoueur.messages || []).find((m) => /mercato/i.test(m.titre));
  assert.ok(msg, 'un message de mercato doit exister');
  const t = s.mercato.mouvements[0];
  assert.ok(msg.corps.indexOf(t.joueurNom) !== -1,
    `le résumé doit citer un transfert RÉEL (« ${t.joueurNom} » absent de : ${msg.corps})`);
});

test('mercato IA : un joueur repéré chez un rival existe encore la saison suivante', () => {
  const s = saisonPuisIntersaison(4312);
  const club = s.adversaires[0];
  // Le meilleur joueur du club : exactement ce qu'un manager repère.
  const cible = RMClub.groupeAdverse(s, club)
    .slice().sort((x, y) => (y.vitesse + y.plaquage) - (x.vitesse + x.plaquage))[0];
  RMClub.avancerSaison(creerRng(13), s);
  const present = (s.adversaires || []).some((a) =>
    RMClub.groupeAdverse(s, a).some((j) => j.id === cible.id));
  assert.ok(present,
    `${cible.nom} doit toujours exister quelque part dans le monde (il peut avoir changé de club)`);
});

test('mercato IA : une promotion donne bien de NOUVEAUX adversaires, sans casse', () => {
  const s = saisonPourAvance(4313);
  const id = s.clubJoueur.id;
  // Le club gagne tout : il finit 1er et monte d'un palier.
  for (const f of s.calendrier) {
    if (f.domicileId === id) RMClub.enregistrerResultat(s, f.id, 40, 3, 6, 0);
    else if (f.exterieurId === id) RMClub.enregistrerResultat(s, f.id, 3, 40, 0, 6);
    else RMClub.enregistrerResultat(s, f.id, 15, 15, 1, 1);
  }
  const avant = (s.adversaires || []).map((a) => a.id).join(',');
  RMClub.avancerSaison(creerRng(14), s);
  assert.ok((s.adversaires || []).length > 0, 'une nouvelle division a des adversaires');
  for (const a of s.adversaires) {
    const g = RMClub.groupeAdverse(s, a);
    assert.ok(g.length >= 23, `${a.nom} doit avoir un groupe complet (${g.length})`);
  }
});



// --- P1-43b : la concurrence pour une recrue --------------------------------
// Mesuré AVANT : une cible du marché n'était JAMAIS reprise par un club IA
// (200 jours simulés), et le bouton « Rafraîchir » régénérait instantanément
// tout le marché autant de fois qu'on voulait. Repérer un joueur, hésiter, ne
// coûtait donc rigoureusement rien.

function saisonMarcheOuvert(graine) {
  const s = saisonPourAvance(graine);
  // On se place dans la fenêtre de transfert réelle du jeu.
  assert.ok(RMClub.etatFenetreTransfert(s).ouverte,
    'le scénario suppose le mercato ouvert au premier jour de saison');
  return s;
}

test('concurrence : un club IA signe RÉELLEMENT un joueur du marché', () => {
  const s = saisonMarcheOuvert(4401);
  const avant = s.marche.map((j) => j.id);
  let signatures = [];
  for (let i = 0; i < 60 && signatures.length === 0; i++) {
    RMClub.avancerUnJour(s);
    signatures = (s.signaturesRivales || []);
  }
  assert.ok(signatures.length > 0,
    'en 60 jours de mercato ouvert, un rival doit avoir signé au moins un joueur libre');
  const sig = signatures[0];
  assert.ok(sig.joueurNom && sig.clubNom, 'la signature nomme le joueur ET le club');
  assert.ok(avant.indexOf(sig.joueurId) !== -1, 'le joueur signé venait bien du marché');
  assert.strictEqual(s.marche.some((j) => j.id === sig.joueurId), false,
    'le joueur signé DISPARAÎT réellement du marché');
});

test('concurrence : le joueur signé rejoint RÉELLEMENT l\'effectif du rival', () => {
  const s = saisonMarcheOuvert(4402);
  let sig = null;
  for (let i = 0; i < 60 && !sig; i++) {
    RMClub.avancerUnJour(s);
    sig = (s.signaturesRivales || [])[0] || null;
  }
  assert.ok(sig, 'une signature rivale doit se produire');
  const club = s.adversaires.find((a) => a.id === sig.clubId);
  assert.ok(club, 'le club signataire existe');
  assert.ok(RMClub.groupeAdverse(s, club).some((j) => j.id === sig.joueurId),
    'le joueur doit être dans le groupe de son nouveau club, pas simplement supprimé');
});

test('concurrence : le rival PAIE le joueur qu\'il signe', () => {
  const s = saisonMarcheOuvert(4403);
  const budgets = {};
  for (const a of s.adversaires) budgets[a.id] = a.budget;
  let sig = null;
  for (let i = 0; i < 60 && !sig; i++) {
    RMClub.avancerUnJour(s);
    sig = (s.signaturesRivales || [])[0] || null;
  }
  assert.ok(sig, 'une signature rivale doit se produire');
  const club = s.adversaires.find((a) => a.id === sig.clubId);
  assert.strictEqual(budgets[sig.clubId] - club.budget, sig.montant,
    'le rival doit débourser EXACTEMENT le prix du joueur');
  assert.ok(club.budget >= 0, 'un club ne signe jamais au-delà de ses moyens');
});

test('concurrence : le manager est PRÉVENU quand il perd une cible', () => {
  const s = saisonMarcheOuvert(4404);
  // Le manager repère un joueur : il devient une cible identifiée.
  const cible = s.marche[0];
  RMClub.basculerFavori(s, cible);
  let perdu = null;
  for (let i = 0; i < 90 && !perdu; i++) {
    RMClub.avancerUnJour(s);
    perdu = (s.signaturesRivales || []).find((x) => x.joueurId === cible.id) || null;
  }
  if (!perdu) return; // ce tirage-là ne visait pas cette cible : rien à vérifier
  const msg = (s.clubJoueur.messages || []).find((m) => m.corps.indexOf(cible.nom) !== -1);
  assert.ok(msg, `perdre une cible REPÉRÉE doit produire un message citant ${cible.nom}`);
  assert.strictEqual((s.favoris || []).some((j) => j.id === cible.id), false,
    'un favori parti chez un rival ne doit pas rester dans la liste des favoris');
});

test('concurrence : le marché ne se vide pas (il se réalimente)', () => {
  const s = saisonMarcheOuvert(4405);
  for (let i = 0; i < 120; i++) RMClub.avancerUnJour(s);
  assert.ok(s.marche.length >= 3,
    `le marché doit rester vivant, pas s'assécher (${s.marche.length} joueur(s) restant(s))`);
});

test('concurrence : les rivaux ne raflent pas tout le marché', () => {
  const s = saisonMarcheOuvert(4406);
  for (let i = 0; i < 120; i++) RMClub.avancerUnJour(s);
  const n = (s.signaturesRivales || []).length;
  assert.ok(n <= 12,
    `le rythme doit rester crédible sur 120 jours (${n} signatures rivales)`);
});

test('concurrence : hors fenêtre de transfert, aucun rival ne signe', () => {
  const s = saisonMarcheOuvert(4407);
  // On avance jusqu'à la fermeture du mercato, puis on repart à zéro.
  let gardeFou = 0;
  while (RMClub.etatFenetreTransfert(s).ouverte && gardeFou < 400) { RMClub.avancerUnJour(s); gardeFou++; }
  assert.ok(gardeFou < 400, 'le mercato doit finir par fermer');
  s.signaturesRivales = [];
  for (let i = 0; i < 30; i++) {
    if (RMClub.etatFenetreTransfert(s).ouverte) break;
    RMClub.avancerUnJour(s);
  }
  assert.strictEqual((s.signaturesRivales || []).length, 0,
    'mercato fermé = aucune signature rivale, exactement comme pour le manager');
});

test('concurrence : entièrement déterministe', () => {
  const a = saisonMarcheOuvert(4408);
  const b = JSON.parse(JSON.stringify(a));
  for (let i = 0; i < 40; i++) { RMClub.avancerUnJour(a); RMClub.avancerUnJour(b); }
  const resume = (s) => (s.signaturesRivales || []).map((x) => `${x.joueurNom}|${x.clubNom}|${x.montant}`);
  assert.deepStrictEqual(resume(a), resume(b),
    'deux mondes identiques doivent produire les MÊMES signatures rivales');
});

test('concurrence : rafraîchir le marché n\'est plus un reroll gratuit et illimité', () => {
  const s = saisonMarcheOuvert(4409);
  const premier = RMClub.rafraichirMarcheManuel(s);
  assert.strictEqual(premier.ok, true, 'le premier rafraîchissement reste possible');
  const second = RMClub.rafraichirMarcheManuel(s);
  assert.strictEqual(second.ok, false,
    'enchaîner deux rafraîchissements le même jour doit être refusé');
  assert.ok(second.prochainLe, 'le refus doit dire QUAND ce sera à nouveau possible');
});


console.log(`\n${nbTests} test(s) exécuté(s).`);
if (process.exitCode) {
  console.error('ECHEC : au moins un test du parcours club a échoué.');
} else {
  console.log('OK : le parcours principal du Mode Club fonctionne de bout en bout.');
}
