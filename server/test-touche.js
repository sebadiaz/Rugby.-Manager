// TEST DE PREUVE — LE SAUTEUR EN TOUCHE NE COMPTE POUR RIEN
//
// COMPORTEMENT ACTUEL OBSERVÉ (mesuré) : on monte deux packs identiques où un
// SEUL avant est un vrai sauteur (n°5, touche 95) et les sept autres sont
// nuls en touche (20). Puis on joue dix matchs complets, d'abord sans rien
// désigner, ensuite en forçant `toucheA.sauteurs = [5]` — c'est-à-dire en
// disant au moteur de ne viser QUE le bon sauteur :
//
//   sans désigner de sauteur         : 120/115 touches gagnées
//   en désignant le SEUL bon sauteur : 120/115 touches gagnées
//   => écart : 0,0 point
//
// Strictement aucune différence. Deux raisons, dans le moteur :
//   1. `tirerSauteur` choisit UNIFORMÉMENT dans le pool : un sauteur à 88 et
//      un à 45 sont visés aussi souvent l'un que l'autre ;
//   2. `probaVolAdverse` ne regarde que la SOMME de `forceTouche` sur les
//      huit avants — la qualité de celui qui monte réellement au ballon
//      n'entre nulle part.
//
// POURQUOI C'EST INSUFFISANT POUR LE JOUEUR : depuis P1-49, le manager
// recrute un deuxième ligne en regardant sa touche. En match, cet attribut
// n'existe que noyé dans une somme de huit, et le manager ne peut même pas
// dire qui saute. La touche est pourtant, avec la mêlée, l'une des deux
// phases où un entraîneur décide vraiment.
//
// FONCTIONS EXACTES RESPONSABLES : engine/rugby-engine.js, `_tickTouche`
// (tirage uniforme du sauteur, probabilité de vol calculée sans lui).
//
// CE QUE CE FICHIER EXIGE :
//   1. un sauteur VISÉ plus souvent quand il est meilleur ;
//   2. sa qualité propre doit peser sur l'issue de la touche ;
//   3. le Mode Club doit permettre de DÉSIGNER ses sauteurs ;
//   4. ce choix doit arriver jusqu'au moteur ;
//   5. les touches doivent rester dans les ordres de grandeur d'un vrai match.
//
// Usage : node server/test-touche.js
'use strict';

const assert = require('assert');
global.window = global;
let stockage = {};
global.localStorage = {
  getItem: (k) => (k in stockage ? stockage[k] : null),
  setItem: (k, v) => { stockage[k] = String(v); },
  removeItem: (k) => { delete stockage[k]; },
};
const RugbyEngine = require('../docs/rugby-engine.js');
global.window.RugbyEngine = RugbyEngine;
const { chargerRMClub, creerRng } = require('./charger-club.js');
const RMClub = chargerRMClub();

let nbTests = 0;
function test(nom, fn) {
  nbTests++;
  try { fn(); console.log(`OK   ${nom}`); }
  catch (e) { process.exitCode = 1; console.error(`FAIL ${nom}`); console.error('     ' + e.message); }
}

const BASE = RugbyEngine.DEFAULT_CONFIG.joueurs;
// Pack où UN SEUL avant est un vrai sauteur ; le reste des attributs est
// inchangé, pour n'isoler QUE la touche.
function pack(bon, valeurBonne, valeurAutres) {
  const j = {};
  for (let n = 1; n <= 15; n++) {
    j[n] = Object.assign({}, BASE[n], { touche: n === bon ? valeurBonne : valeurAutres });
  }
  return j;
}
function jouer(graine, cfg) {
  const m = new RugbyEngine.MatchEngine(graine, 4800, cfg);
  for (let i = 0; i < 400000 && m.getState().phase !== 'TERMINE'; i++) m.tick(1 / 20);
  return m.getState().stats;
}

test('T1 — PREUVE : DÉSIGNER le bon sauteur change l\'issue des touches', () => {
  // Le pack est STRICTEMENT le même dans les deux cas — mêmes attributs, donc
  // même force collective. Seule la DÉSIGNATION change : d'un côté le moteur
  // vise n'importe lequel des cinq sauteurs, de l'autre on lui dit de viser
  // le seul qui sait sauter. Mesuré avant ce patch : 0,0 point d'écart.
  let sansChoix = { l: 0, g: 0 }, avecChoix = { l: 0, g: 0 };
  for (let g = 1; g <= 10; g++) {
    const a = jouer(g, { joueursA: pack(5, 95, 20), joueursB: pack(5, 95, 20) });
    sansChoix.l += a.A.lineouts; sansChoix.g += a.A.lineoutsGagnes;
    const b = jouer(g, { joueursA: pack(5, 95, 20), joueursB: pack(5, 95, 20),
      toucheA: { sauteurs: [5] } });
    avecChoix.l += b.A.lineouts; avecChoix.g += b.A.lineoutsGagnes;
  }
  const part = (x) => (x.l ? x.g / x.l : 0);
  assert.ok(part(avecChoix) > part(sansChoix),
    `désigner le seul bon sauteur doit faire gagner plus de touches ` +
    `(${avecChoix.g}/${avecChoix.l} vs ${sansChoix.g}/${sansChoix.l})`);
});

test('T2 — le sauteur désigné est RÉELLEMENT visé plus souvent', () => {
  // Trois sauteurs possibles, un seul excellent. On compte qui réceptionne.
  const cfg = { joueursA: pack(5, 95, 20), joueursB: pack(5, 95, 20) };
  const m = new RugbyEngine.MatchEngine(4242, 4800, cfg);
  const receptions = {};
  const vraiLog = m.log.bind(m);
  m.log = function (type, equipe, texte) {
    if (type === 'TOUCHE_GAGNEE' || type === 'TOUCHE_RECEPTION') {
      const found = /n°(\d+)/.exec(texte || '');
      if (found) receptions[found[1]] = (receptions[found[1]] || 0) + 1;
    }
    return vraiLog(type, equipe, texte);
  };
  for (let i = 0; i < 400000 && m.getState().phase !== 'TERMINE'; i++) m.tick(1 / 20);
  // Le comptage passe par les logs : s'ils ne portent pas le numéro, on se
  // rabat sur la vérification directe du tirage pondéré.
  const total = Object.values(receptions).reduce((a, b) => a + b, 0);
  if (total >= 10) {
    const partDuBon = (receptions['5'] || 0) / total;
    assert.ok(partDuBon > 1 / 5 + 0.1,
      `le meilleur sauteur doit être visé nettement plus qu'au hasard (${Math.round(partDuBon * 100)} %)`);
  } else {
    // Tirage pondéré vérifié directement — plus robuste qu'un parsing de log.
    const pool = [4, 5, 6, 7, 8].map((n) => Object.assign({ numero: n }, pack(5, 95, 20)[n]));
    const compte = {};
    const rng = creerRng(77);
    for (let i = 0; i < 3000; i++) {
      const j = RugbyEngine.tirerSauteurPondere(pool, rng);
      compte[j.numero] = (compte[j.numero] || 0) + 1;
    }
    assert.ok(compte[5] / 3000 > 1 / 5 + 0.1,
      `le meilleur sauteur doit être tiré nettement plus souvent (${JSON.stringify(compte)})`);
  }
});

test('T3 — un sauteur faible n\'est jamais totalement exclu', () => {
  const pool = [4, 5, 6, 7, 8].map((n) => Object.assign({ numero: n }, pack(5, 95, 20)[n]));
  const rng = creerRng(78);
  const compte = {};
  for (let i = 0; i < 3000; i++) {
    const j = RugbyEngine.tirerSauteurPondere(pool, rng);
    compte[j.numero] = (compte[j.numero] || 0) + 1;
  }
  for (const n of [4, 6, 7, 8]) {
    assert.ok((compte[n] || 0) > 0,
      `le n°${n} doit rester une option (variation des appels) — ${JSON.stringify(compte)}`);
  }
});

test('T4 — le Mode Club permet de DÉSIGNER ses sauteurs', () => {
  const s = RMClub.nouvelleSaison(creerRng(500), 'AS Touche');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  const c = s.clubJoueur;
  const dossier = RMClub.dossierSauteurs(s);
  assert.ok(dossier && Array.isArray(dossier.candidats),
    'un dossier de sauteurs doit exister');
  assert.ok(dossier.candidats.length >= 3, `plusieurs candidats attendus (${dossier.candidats.length})`);
  for (const cd of dossier.candidats) {
    assert.ok(cd.nom && typeof cd.touche === 'number' && typeof cd.numero === 'number',
      `chaque candidat doit porter son numéro et sa touche (${JSON.stringify(cd)})`);
    assert.ok(cd.numero >= 4 && cd.numero <= 8,
      `seuls les avants de l'alignement sautent (n°${cd.numero})`);
  }
  // Trié par qualité en touche : le manager voit tout de suite qui sauter.
  for (let i = 1; i < dossier.candidats.length; i++) {
    assert.ok(dossier.candidats[i].touche <= dossier.candidats[i - 1].touche,
      'les candidats doivent être triés par qualité en touche');
  }
  const meilleur = dossier.candidats[0];
  assert.strictEqual(RMClub.basculerSauteur(s, meilleur.id).designe, true);
  assert.deepStrictEqual(RMClub.sauteursDesignes(s), [meilleur.id]);
  assert.strictEqual(RMClub.basculerSauteur(s, meilleur.id).designe, false);
  assert.deepStrictEqual(RMClub.sauteursDesignes(s), []);
});

test('T5 — le choix arrive jusqu\'au moteur, en NUMÉROS de maillot', () => {
  const s = RMClub.nouvelleSaison(creerRng(501), 'AS Touche');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  const dossier = RMClub.dossierSauteurs(s);
  const choisi = dossier.candidats[0];
  RMClub.basculerSauteur(s, choisi.id);
  const cfg = RMClub.sauteursVersConfig(s);
  assert.ok(Array.isArray(cfg) && cfg.length === 1, `un numéro attendu (${JSON.stringify(cfg)})`);
  assert.strictEqual(cfg[0], choisi.numero, 'le moteur doit recevoir le NUMÉRO, pas l\'id');
  // Sans désignation : null, pour que le moteur garde son pool par défaut
  // plutôt que de recevoir une liste vide (aucun sauteur = touche cassée).
  RMClub.basculerSauteur(s, choisi.id);
  assert.strictEqual(RMClub.sauteursVersConfig(s), null);
});

test('T6 — un sauteur qui n\'est plus titulaire est ignoré, pas propagé', () => {
  const s = RMClub.nouvelleSaison(creerRng(502), 'AS Touche');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  const choisi = RMClub.dossierSauteurs(s).candidats[0];
  RMClub.basculerSauteur(s, choisi.id);
  // Il sort du XV (blessure, choix tactique...) : sa désignation ne doit pas
  // envoyer un numéro qu'il n'occupe plus.
  const compo = s.clubJoueur.compositionTitulaires;
  for (const n of Object.keys(compo)) if (compo[n] === choisi.id) delete compo[n];
  assert.strictEqual(RMClub.sauteursVersConfig(s), null,
    'un sauteur non titulaire ne doit pas être transmis au moteur');
});

test('T7 — les touches restent dans les ordres de grandeur d\'un vrai match', () => {
  let total = 0;
  const n = 6;
  for (let g = 1; g <= n; g++) {
    const st = jouer(g, null);
    total += st.A.lineouts + st.B.lineouts;
  }
  const moyenne = total / n;
  assert.ok(moyenne >= 12 && moyenne <= 40,
    `un match de rugby compte 15 à 35 touches (moyenne mesurée ${moyenne.toFixed(1)})`);
});

test('T8 — PREUVE : restreindre l\'alignement a un COÛT quand il n\'apporte rien', () => {
  // Mesuré avant ce patch, en jouant : avec cinq sauteurs STRICTEMENT
  // équivalents (donc aucun gain de qualité), n'en désigner qu'un faisait
  // passer le taux de touches gagnées de 95,1 % à 97,8 %. Désigner était
  // GRATUIT, donc toujours gagnant — un choix sans contrepartie n'est pas un
  // choix.
  //
  // La règle est vérifiée DIRECTEMENT, pas à travers la moyenne de quelques
  // matchs : un écart de deux points sur 145 touches ne se distingue pas du
  // bruit (constaté en essayant, 140/145 contre 136/143 — inexploitable).
  const commun = { forceLanceur: 700, forceAdverse: 700, qualiteSauteur: 80 };
  const libre = RugbyEngine.probaVolTouche(Object.assign({ taillePool: 5 }, commun));
  const restreint = RugbyEngine.probaVolTouche(Object.assign({ taillePool: 1 }, commun));
  assert.ok(restreint > libre,
    `à qualité égale, un alignement lisible doit augmenter le risque de vol ` +
    `(${restreint.toFixed(4)} vs ${libre.toFixed(4)})`);
  // Et le coût doit être PROPORTIONNEL : trois sauteurs se situent entre les deux.
  const trois = RugbyEngine.probaVolTouche(Object.assign({ taillePool: 3 }, commun));
  assert.ok(trois > libre && trois < restreint,
    `le coût doit croître à mesure qu'on restreint (${libre.toFixed(4)} / ${trois.toFixed(4)} / ${restreint.toFixed(4)})`);
});

test('T8bis — le compromis penche du bon côté pour un VRAI spécialiste', () => {
  // Un sauteur nettement au-dessus (forceTouche 94, soit touche ~95) désigné
  // seul, contre un alignement libre dont le sauteur moyen vaut 80 : le gain
  // de qualité doit l'emporter sur le coût de lisibilité.
  const specialisteSeul = RugbyEngine.probaVolTouche({
    forceLanceur: 700, forceAdverse: 700, qualiteSauteur: 94, taillePool: 1 });
  const alignementLibre = RugbyEngine.probaVolTouche({
    forceLanceur: 700, forceAdverse: 700, qualiteSauteur: 80, taillePool: 5 });
  assert.ok(specialisteSeul < alignementLibre,
    `désigner un vrai spécialiste doit rester payant ` +
    `(${specialisteSeul.toFixed(4)} vs ${alignementLibre.toFixed(4)})`);
  // À qualité identique, en revanche, c'est perdant — c'est tout l'arbitrage.
  const banalSeul = RugbyEngine.probaVolTouche({
    forceLanceur: 700, forceAdverse: 700, qualiteSauteur: 80, taillePool: 1 });
  assert.ok(banalSeul > alignementLibre,
    'désigner un sauteur banal doit coûter des ballons');
});

test('T9 — mais désigner un VRAI spécialiste reste payant', () => {
  // Le compromis doit pencher du bon côté quand le sauteur désigné est
  // nettement meilleur que les autres : sinon la désignation ne servirait
  // jamais à rien, ce qui serait le défaut inverse.
  let libre = { l: 0, g: 0 }, restreint = { l: 0, g: 0 };
  for (let g = 1; g <= 12; g++) {
    const a = jouer(g, { joueursA: pack(5, 95, 20), joueursB: pack(5, 95, 20) });
    libre.l += a.A.lineouts; libre.g += a.A.lineoutsGagnes;
    const b = jouer(g, { joueursA: pack(5, 95, 20), joueursB: pack(5, 95, 20),
      toucheA: { sauteurs: [5] } });
    restreint.l += b.A.lineouts; restreint.g += b.A.lineoutsGagnes;
  }
  const part = (x) => (x.l ? x.g / x.l : 0);
  assert.ok(part(restreint) > part(libre),
    `désigner le seul vrai sauteur doit rester gagnant malgré la lisibilité ` +
    `(${restreint.g}/${restreint.l} vs ${libre.g}/${libre.l})`);
});

test('T10 — le compromis est ANNONCÉ au manager, chiffré', () => {
  const s = RMClub.nouvelleSaison(creerRng(503), 'AS Touche');
  RMClub.daterCalendrier(s);
  RMClub.assurerCompositionPourEquipe(s, 'pro');
  const avant = RMClub.dossierSauteurs(s);
  assert.strictEqual(avant.lisibilite, 0, 'un alignement complet n\'est pas lisible');
  RMClub.basculerSauteur(s, avant.candidats[0].id);
  const apres = RMClub.dossierSauteurs(s);
  assert.ok(apres.lisibilite > 0,
    `restreindre l'alignement doit être annoncé comme lisible (${apres.lisibilite})`);
  assert.ok(apres.risqueVolSupplementaire > 0,
    'le surcroît de risque doit être chiffré, pas seulement suggéré');
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
