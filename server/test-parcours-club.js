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
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-espoirs.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-composition.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-equipes.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-condition-joueurs.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-decisions.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-pyramide.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-pyramide-france.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-calendrier.js'), 'utf8'))(global.window);
new Function('window', require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-sauvegarde.js'), 'utf8'))(global.window);
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

// --- 12d) Contexte d'équipe (TODO_AUDIT.md P1-19) : les 4 types d'équipe
// (premier XV, Équipe B, Espoirs, club adverse) passent par UN SEUL objet de
// contexte, qui expose toujours la même forme — c'est ce qui permet aux
// écrans de composition/effectif/entraînement/tactique/calendrier/personnel
// d'être communs, sans branche par type d'équipe. ---
const CHAMPS_CONTEXTE = ['type', 'clubId', 'club', 'effectif', 'slot', 'label', 'sousTitre',
  'modifiable', 'calendrier', 'classement', 'titreClassement', 'personnel', 'entrainementFocus', 'disponible'];

test('contexte d\'équipe : les 4 types exposent EXACTEMENT la même forme (condition de l\'écran unique)', () => {
  const s = RMClub.nouvelleSaison(creerRng(420), 'Test Contexte Forme');
  RMClub.assurerCentreFormation(creerRng(421), s);
  const selections = [
    { type: 'pro', clubId: null },
    { type: 'b', clubId: null },
    { type: 'jeunes', clubId: null },
    { type: 'adverse', clubId: s.adversaires[0].id },
  ];
  for (const sel of selections) {
    const ctx = RMClub.contexteEquipe(s, sel);
    for (const champ of CHAMPS_CONTEXTE) {
      assert.ok(champ in ctx, `le contexte de l'équipe "${sel.type}" doit exposer le champ "${champ}" comme tous les autres`);
    }
    assert.ok(Array.isArray(ctx.effectif), `l'effectif du contexte "${sel.type}" doit être une liste`);
    // La composition est le composant le plus structurant de l'écran unique :
    // elle doit avoir la même forme pour les 4 types, sinon le terrain
    // devrait être rendu différemment selon l'équipe.
    assert.ok(ctx.slot && typeof ctx.slot.compositionTitulaires === 'object', `le slot du contexte "${sel.type}" doit porter une composition`);
    assert.ok(ctx.slot.tactique && typeof ctx.slot.tactique === 'object', `le slot du contexte "${sel.type}" doit porter une tactique`);
  }
});

test('contexte d\'équipe : seul un club adverse est en lecture seule, les 3 équipes du club sont modifiables', () => {
  const s = RMClub.nouvelleSaison(creerRng(422), 'Test Contexte Droits');
  RMClub.assurerCentreFormation(creerRng(423), s);
  assert.strictEqual(RMClub.contexteEquipe(s, { type: 'pro' }).modifiable, true);
  assert.strictEqual(RMClub.contexteEquipe(s, { type: 'b' }).modifiable, true);
  assert.strictEqual(RMClub.contexteEquipe(s, { type: 'jeunes' }).modifiable, true);
  const ctxAdv = RMClub.contexteEquipe(s, { type: 'adverse', clubId: s.adversaires[0].id });
  assert.strictEqual(ctxAdv.modifiable, false);
  // Ce qui n'est pas simulé pour un club IA est signalé comme inconnu
  // (null), jamais fabriqué.
  assert.strictEqual(ctxAdv.personnel, null, 'le staff d\'un club IA n\'est pas modélisé : il doit être signalé inconnu, pas inventé');
  assert.strictEqual(ctxAdv.entrainementFocus, null, 'le programme d\'entraînement d\'un club IA n\'est pas modélisé : inconnu, pas inventé');
});

test('contexte d\'équipe : le XV d\'un club adverse est bien celui qui joue réellement (15 numéros, aucun trou)', () => {
  const s = RMClub.nouvelleSaison(creerRng(424), 'Test Compo Adverse');
  const adv = s.adversaires[0];
  const ctx = RMClub.contexteEquipe(s, { type: 'adverse', clubId: adv.id });
  assert.strictEqual(RMClub.validerComposition(ctx.slot.compositionTitulaires).length, 0,
    'les 15 numéros d\'un club adverse doivent tous être pourvus — c\'est son effectif tel qu\'il descend sur le terrain');
  // Chaque joueur adverse reçoit un id dérivé stable : sans ça, la table
  // d'effectif et la fiche joueur communes ne pourraient pas le retrouver.
  const ids = ctx.effectif.map((j) => j.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'les ids dérivés des joueurs adverses doivent être uniques');
  const ctxBis = RMClub.contexteEquipe(s, { type: 'adverse', clubId: adv.id });
  assert.deepStrictEqual(ctxBis.effectif.map((j) => j.id), ids, 'les ids dérivés doivent être stables d\'un rendu à l\'autre');
  assert.ok(adv.effectif.every((j) => j.id === undefined), 'la normalisation ne doit JAMAIS muter les données de la saison');
});

test('contexte d\'équipe : la tactique d\'un club adverse est DÉDUITE de ses attributs réels, sur les mêmes 6 axes', () => {
  const s = RMClub.nouvelleSaison(creerRng(425), 'Test Tactique Déduite');
  const ctx = RMClub.contexteEquipe(s, { type: 'adverse', clubId: s.adversaires[0].id });
  assert.strictEqual(ctx.tactiqueDeduite, true, 'la tactique adverse doit être signalée comme déduite, jamais comme un réglage certain');
  for (const axe of Object.keys(RMClub.AXES_TACTIQUE)) {
    const valeur = ctx.slot.tactique[axe];
    assert.ok(RMClub.AXES_TACTIQUE[axe].options[valeur],
      `l'axe "${axe}" déduit doit valoir une option RÉELLE de cet axe (obtenu : ${valeur}) — sinon l'écran commun ne saurait pas l'afficher`);
  }
  // Deux effectifs franchement différents doivent produire des déductions
  // différentes : sinon la « déduction » ne dit rien du club observé.
  const costauds = s.adversaires[0].effectif.map((j) => Object.assign({}, j, { jeuPied: 90, puissance: 90, plaquage: 90 }));
  const legers = s.adversaires[0].effectif.map((j) => Object.assign({}, j, { jeuPied: 20, puissance: 20, plaquage: 20 }));
  assert.notDeepStrictEqual(RMClub.deduireTactiqueAdverse(costauds), RMClub.deduireTactiqueAdverse(legers),
    'la tactique déduite doit réellement dépendre des attributs, pas être une constante déguisée');
});

test('contexte d\'équipe : calendrier et classement suivent l\'équipe sélectionnée (championnat, Équipe B, espoirs, adversaire)', () => {
  const s = RMClub.nouvelleSaison(creerRng(426), 'Test Calendrier Contexte');
  RMClub.assurerCentreFormation(creerRng(427), s);
  RMClub.assurerCompetitionB(s);
  const adv = s.adversaires[0];

  const ctxPro = RMClub.contexteEquipe(s, { type: 'pro' });
  assert.strictEqual(ctxPro.classement, s.classement, 'le premier XV joue le championnat principal');
  assert.ok(ctxPro.calendrier.length > 0);

  const ctxAdv = RMClub.contexteEquipe(s, { type: 'adverse', clubId: adv.id });
  assert.ok(ctxAdv.calendrier.length > 0, 'un club adverse a bien un calendrier (le même championnat)');
  assert.ok(ctxAdv.calendrier.every((f) => f.domicileId === adv.id || f.exterieurId === adv.id),
    'le calendrier affiché pour un club adverse ne doit contenir QUE ses propres rencontres');

  const ctxB = RMClub.contexteEquipe(s, { type: 'b' });
  if (ctxB.disponible) {
    assert.strictEqual(ctxB.classement, s.competitionB.classement, 'l\'Équipe B doit afficher le classement du championnat B, pas celui du premier XV');
    assert.ok(ctxB.calendrier.every((f) => f.domicileId === s.clubJoueur.id || f.exterieurId === s.clubJoueur.id));
  } else {
    assert.ok(ctxB.motifIndisponible, 'un club non éligible à l\'Équipe B doit recevoir une explication, pas un écran vide');
  }

  const ctxJeunes = RMClub.contexteEquipe(s, { type: 'jeunes' });
  assert.ok(ctxJeunes.calendrier.length > 0, 'les espoirs doivent avoir des rencontres programmées (une journée sur PERIODE_JOURNEES_ESPOIRS)');
  assert.ok(ctxJeunes.calendrier.every((f) => RMClub.journeeDeMatchEspoirs(f.journee)));
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
  // Le calendrier espoirs doit refléter ces résultats réels.
  const joues = RMClub.calendrierEspoirs(s).filter((f) => f.joue);
  assert.strictEqual(joues.length, 3, 'les 3 matchs archivés doivent apparaître comme joués dans le calendrier espoirs');
  assert.deepStrictEqual(joues[0].score, { domicile: 24, exterieur: 10 });
});

test('contexte d\'équipe : la sélection est persistée et rétrocompatible avec l\'ancien champ equipeGeree', () => {
  const s = RMClub.nouvelleSaison(creerRng(429), 'Test Sélection Persistée');
  // Sauvegarde antérieure : seul `equipeGeree` existe.
  delete s.clubJoueur.equipeSelectionnee;
  s.clubJoueur.equipeGeree = 'jeunes';
  assert.strictEqual(RMClub.selectionEquipe(s).type, 'jeunes', 'l\'ancien champ equipeGeree doit être repris tel quel');

  RMClub.definirSelectionEquipe(s, 'adverse', s.adversaires[1].id);
  assert.strictEqual(RMClub.contexteEquipe(s).type, 'adverse');
  RMClub.sauvegarderSaison(s);
  const recharge = RMClub.chargerSaison();
  assert.strictEqual(RMClub.contexteEquipe(recharge).type, 'adverse',
    'l\'équipe sélectionnée doit survivre à un rechargement — c\'est ce qui la conserve d\'un écran à l\'autre');

  // Une sélection qui pointe vers un club disparu ne doit jamais bloquer les
  // écrans sur une équipe fantôme.
  recharge.clubJoueur.equipeSelectionnee = { type: 'adverse', clubId: 'clubQuiNExistePas' };
  assert.strictEqual(RMClub.selectionEquipe(recharge).type, 'pro', 'une équipe disparue doit retomber sur le premier XV');
});

test('contexte d\'équipe : le sélecteur propose bien les 3 équipes du club ET tous les clubs de la division', () => {
  const s = RMClub.nouvelleSaison(creerRng(430), 'Test Liste Équipes');
  const liste = RMClub.equipesDisponibles(s);
  const valeurs = liste.map((e) => e.valeur);
  assert.ok(valeurs.indexOf('pro') !== -1 && valeurs.indexOf('b') !== -1 && valeurs.indexOf('jeunes') !== -1);
  for (const adv of s.adversaires) {
    assert.ok(valeurs.indexOf('adverse:' + adv.id) !== -1, `le club ${adv.nom} doit être proposé dans le sélecteur commun`);
  }
  assert.strictEqual(valeurs.length, 3 + s.adversaires.length);
  // Aller-retour d'encodage : le <select> ne transporte qu'une chaîne.
  for (const v of valeurs) {
    assert.strictEqual(RMClub.encoderSelection(RMClub.decoderSelection(v)), v);
  }
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
const clubCalendrierSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-calendrier.js'), 'utf8');
const clubSauvegardeSrcPourRechargement = require('fs').readFileSync(require('path').join(__dirname, '../docs/js/club-sauvegarde.js'), 'utf8');
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
  new Function('window', clubEspoirsSrcPourRechargement)(ctx);
  new Function('window', clubCompositionSrcPourRechargement)(ctx);
  new Function('window', clubConditionJoueursSrcPourRechargement)(ctx);
  new Function('window', clubDecisionsSrcPourRechargement)(ctx);
  new Function('window', clubPyramideSrcPourRechargement)(ctx);
  new Function('window', clubPyramideFranceSrcPourRechargement)(ctx);
  new Function('window', clubCalendrierSrcPourRechargement)(ctx);
  new Function('window', clubSauvegardeSrcPourRechargement)(ctx);
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
