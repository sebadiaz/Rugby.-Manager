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
test('création de carrière : club du joueur + 5 adversaires + calendrier complet', () => {
  const rng = creerRng(1);
  saison = RMClub.nouvelleSaison(rng, 'Club de Test');
  assert.strictEqual(saison.clubJoueur.nom, 'Club de Test');
  assert.strictEqual(saison.adversaires.length, 5);
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
  const rng = creerRng(3);
  const { partis, arrivees } = RMClub.avancerSaison(rng, saison);
  assert.strictEqual(saison.numero, numeroAvant + 1);
  assert.strictEqual(c.effectif.length, RMClub.TAILLE_EFFECTIF_CIBLE);
  assert.strictEqual(c.compositionTitulaires, null, 'la composition doit être remise à zéro (effectif renouvelé)');
  assert.ok(c.historiqueSaisons.length >= 1);
  assert.ok(Array.isArray(partis) && Array.isArray(arrivees));
  assert.strictEqual(saison.adversaires.length, 5, 'identité des 5 adversaires conservée (pas régénérée de zéro)');
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
  for (const id of Object.keys(saison.classement)) saison.classement[id].pts = 999;
  saison.classement[c.id].pts = 0;
  const confianceAvant = c.confiancePresident;
  RMClub.avancerSaison(creerRng(4), saison);
  assert.strictEqual(c.historiqueSaisons[c.historiqueSaisons.length - 1].position, 6, 'dernière place bien archivée');
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
test('centre de formation : le club en dispose dès la création, avec au moins un espoir par ligne de poste', () => {
  const c = saison.clubJoueur;
  assert.ok(Array.isArray(c.jeunes) && c.jeunes.length > 0, 'un centre de formation doit exister dès la création du club');
  const postes = new Set(c.jeunes.map((j) => j.poste));
  for (const poste of ['P', 'T', '2L', '3L', 'DM', 'OV', 'CE', 'AI', 'AR']) {
    assert.ok(postes.has(poste), `aucun espoir au poste ${poste}`);
  }
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

console.log(`\n${nbTests} test(s) exécuté(s).`);
if (process.exitCode) {
  console.error('ECHEC : au moins un test du parcours club a échoué.');
} else {
  console.log('OK : le parcours principal du Mode Club fonctionne de bout en bout.');
}
