// COUVERTURE — inscription des joueurs aux compétitions.
//
// Audit mesuré avant cette tranche : AUCUNE occurrence d'inscription ou
// d'éligibilité à une compétition dans tout docs/js. Un joueur recruté la
// veille d'une finale pouvait la disputer ; un joueur de 30 ans pouvait jouer
// le championnat espoirs. Le manager n'avait donc aucune décision d'effectif
// à prendre en début de saison, et recruter tard ne coûtait rien.
//
// Usage : node server/test-inscriptions.js
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

let graine = 71000;
function carriere() {
  const s = RMClub.nouvelleSaison(creerRng(graine++), 'AS Inscriptions');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  RMClub.assurerCompetitionB(s);
  RMClub.assurerCompetitionEspoirs(s);
  RMClub.assurerCoupes(s);
  RMClub.assurerInscriptions(s);
  return s;
}

test('I1 — chaque compétition a une liste d\'inscrits et une date limite', () => {
  const s = carriere();
  for (const ref of ['joueur', 'equipeB', 'espoirs']) {
    const d = RMClub.dossierInscriptions(s, ref);
    assert.ok(d, `${ref} doit avoir un dossier d'inscription`);
    assert.ok(d.dateLimite, `${ref} doit avoir une date limite réelle`);
    assert.ok(d.inscrits.length > 0, `${ref} doit avoir des inscrits`);
    assert.ok(d.maxJoueurs > 0, `${ref} doit avoir un plafond`);
  }
});

test('I2 — l\'effectif de départ est inscrit d\'office (aucune partie cassée)', () => {
  // Une carrière existante ne doit pas se retrouver incapable d'aligner une
  // équipe : à la création, on inscrit l'effectif éligible.
  const s = carriere();
  const compo = RMClub.slotCompositionPourEquipe(s, 'pro').compositionTitulaires;
  const manquants = RMClub.joueursNonInscrits(s, 'joueur', compo);
  assert.deepStrictEqual(manquants, [],
    `le XV de départ doit être inscrit (${JSON.stringify(manquants)})`);
});

test('I3 — le championnat espoirs a une limite d\'ÂGE réelle', () => {
  const s = carriere();
  const regles = RMClub.reglesInscription('espoirs');
  assert.ok(regles.ageMax, 'les espoirs doivent avoir un âge maximum');
  const d = RMClub.dossierInscriptions(s, 'espoirs');
  const jeunes = RMClub.effectifPourEquipe(s, 'jeunes');
  for (const id of d.inscrits) {
    const j = jeunes.find((x) => x.id === id);
    assert.ok(j && j.age <= regles.ageMax,
      `${j ? j.nom + ' (' + j.age + ' ans)' : id} ne peut pas être inscrit en espoirs`);
  }
});

test('I4 — un espoir devenu trop âgé est refusé, avec un motif lisible', () => {
  // Le vrai scénario : un jeune passe la limite d'âge et perd sa place dans
  // la compétition — une conséquence que le manager doit anticiper.
  const s = carriere();
  const jeunes = RMClub.effectifPourEquipe(s, 'jeunes');
  const cible = jeunes[0];
  RMClub.desinscrireJoueur(s, 'espoirs', cible.id);
  cible.age = RMClub.reglesInscription('espoirs').ageMax + 2;
  const r = RMClub.inscrireJoueur(s, 'espoirs', cible.id);
  assert.strictEqual(r.ok, false, 'l\'inscription doit être refusée');
  assert.strictEqual(r.motif, 'age');
  assert.ok(r.message && r.message.length > 10, 'avec un message explicite');
  // Et un professionnel n'est pas « introuvable » : il n'est pas de l'équipe.
  const pro = RMClub.effectifPourEquipe(s, 'pro')[0];
  const r2 = RMClub.inscrireJoueur(s, 'espoirs', pro.id);
  assert.strictEqual(r2.motif, 'horsEffectif',
    `un pro doit être refusé pour la bonne raison (${r2.motif})`);
});

test('I5 — le plafond d\'inscrits est réellement appliqué', () => {
  const s = carriere();
  const d = RMClub.dossierInscriptions(s, 'joueur');
  const max = d.maxJoueurs;
  // Remplit jusqu'au plafond avec de vrais joueurs de l'effectif.
  const pro = RMClub.effectifPourEquipe(s, 'pro');
  for (const j of pro) RMClub.inscrireJoueur(s, 'joueur', j.id);
  const apres = RMClub.dossierInscriptions(s, 'joueur');
  assert.ok(apres.inscrits.length <= max,
    `jamais plus que le plafond (${apres.inscrits.length} > ${max})`);
});

test('I6 — après la date limite, on ne peut plus inscrire', () => {
  const s = carriere();
  const d = RMClub.dossierInscriptions(s, 'joueur');
  // On désinscrit un joueur, puis on avance après la date limite.
  const cible = d.inscrits[d.inscrits.length - 1];
  assert.ok(RMClub.desinscrireJoueur(s, 'joueur', cible).ok, 'désinscription possible avant la limite');
  RMClub.definirDateCourante(s,
    RMClub.ajouterJours(RMClub.dateDepuisISO(d.dateLimite), 1));
  const apres = RMClub.dossierInscriptions(s, 'joueur');
  assert.strictEqual(apres.ouverte, false, 'la fenêtre doit être fermée');
  const r = RMClub.inscrireJoueur(s, 'joueur', cible);
  assert.strictEqual(r.ok, false, 'plus d\'inscription après la limite');
  assert.strictEqual(r.motif, 'fenetreFermee');
});

test('I7 — un joueur recruté après la limite N\'EST PAS inscrit', () => {
  // Le cœur de la décision : recruter tard coûte une saison de compétition.
  const s = carriere();
  const d = RMClub.dossierInscriptions(s, 'joueur');
  RMClub.definirDateCourante(s,
    RMClub.ajouterJours(RMClub.dateDepuisISO(d.dateLimite), 5));
  const recrue = RMClub.genererJoueurEtendu(RMClub.GABARIT_EFFECTIF[0], creerRng(99), 0.6);
  recrue.id = 'recrue-tardive';
  s.clubJoueur.effectif.push(recrue);
  RMClub.assurerInscriptions(s);
  assert.strictEqual(RMClub.estInscrit(s, 'joueur', recrue.id), false,
    'une recrue tardive ne doit pas être inscrite d\'office');
  const r = RMClub.inscrireJoueur(s, 'joueur', recrue.id);
  assert.strictEqual(r.ok, false, 'et le manager ne peut pas l\'inscrire non plus');
});

test('I8 — une composition contenant un non-inscrit est REFUSÉE', () => {
  const s = carriere();
  const compo = Object.assign({}, RMClub.slotCompositionPourEquipe(s, 'pro').compositionTitulaires);
  const numero = Object.keys(compo)[0];
  const remplacant = RMClub.effectifPourEquipe(s, 'pro')
    .find((j) => !Object.values(compo).includes(j.id));
  assert.ok(remplacant, 'il faut un joueur hors composition');
  RMClub.desinscrireJoueur(s, 'joueur', remplacant.id);
  compo[numero] = remplacant.id;
  const manquants = RMClub.joueursNonInscrits(s, 'joueur', compo);
  assert.strictEqual(manquants.length, 1, 'le non-inscrit doit être signalé');
  assert.strictEqual(manquants[0].id, remplacant.id);
  assert.ok(manquants[0].nom, 'avec son nom, pour que le message soit lisible');
});

test('I9 — les coupes suivent l\'inscription de LEUR équipe', () => {
  // Une coupe des espoirs ne se dispute pas avec les inscrits du championnat
  // professionnel : la règle d'équipe est celle du moteur (equipePourCoupe).
  const s = carriere();
  for (const cle of Object.keys(s.coupes || {})) {
    const ref = 'coupe:' + cle;
    const regles = RMClub.reglesInscription(ref);
    assert.strictEqual(regles.equipe, RMClub.equipePourCoupe(cle),
      `${ref} doit s'appuyer sur l'équipe qui la dispute`);
  }
});

test('I10 — tout survit à une sauvegarde/rechargement', () => {
  const s = carriere();
  const cible = RMClub.dossierInscriptions(s, 'joueur').inscrits[0];
  RMClub.desinscrireJoueur(s, 'joueur', cible);
  const avant = RMClub.dossierInscriptions(s, 'joueur').inscrits.slice();
  RMClub.sauvegarderSaison(s);
  const rechargee = RMClub.chargerSaison();
  assert.ok(rechargee, 'la sauvegarde doit se recharger');
  const apres = RMClub.dossierInscriptions(rechargee, 'joueur').inscrits;
  assert.deepStrictEqual(apres, avant, 'la liste d\'inscrits doit être identique');
  assert.strictEqual(RMClub.estInscrit(rechargee, 'joueur', cible), false,
    'la désinscription doit avoir survécu');
});

test('I11 — une sauvegarde antérieure se charge et s\'inscrit toute seule', () => {
  const s = carriere();
  const ancienne = JSON.parse(JSON.stringify(s));
  delete ancienne.inscriptions;
  ancienne.version = 9;
  RMClub.sauvegarderSaison(ancienne);
  const rechargee = RMClub.chargerSaison();
  assert.ok(rechargee, 'la sauvegarde v9 doit rester chargeable');
  assert.strictEqual(rechargee.version, RMClub.VERSION_SAUVEGARDE);
  const d = RMClub.dossierInscriptions(rechargee, 'joueur');
  assert.ok(d.inscrits.length > 0,
    'une carrière en cours ne doit pas se retrouver sans aucun inscrit');
  const compo = RMClub.slotCompositionPourEquipe(rechargee, 'pro').compositionTitulaires;
  assert.deepStrictEqual(RMClub.joueursNonInscrits(rechargee, 'joueur', compo), [],
    'et son XV doit rester alignable');
});

test('I12 — le dossier dit qui est éligible et POURQUOI il ne l\'est pas', () => {
  const s = carriere();
  const d = RMClub.dossierInscriptions(s, 'espoirs');
  assert.ok(Array.isArray(d.candidats), 'une liste de candidats doit exister');
  const refuses = d.candidats.filter((c) => !c.eligible);
  for (const c of refuses) {
    assert.ok(c.motif, `${c.nom} doit dire pourquoi il n'est pas éligible`);
    assert.ok(c.message, 'avec un texte lisible pour le manager');
  }
  assert.ok(d.candidats.some((c) => c.eligible), 'et des joueurs éligibles');
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
