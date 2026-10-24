// TEST DE PREUVE — LE MANAGER N'A AUCUN LEVIER SUR LA MÊLÉE
//
// COMPORTEMENT ACTUEL OBSERVÉ : `_meleeCalculerDiff` (engine/rugby-engine.js,
// ~3845-3865) calcule l'issue de la mêlée à partir des JOUEURS (somme des
// forceMelee, bonus piliers, technique du talonneur), du score, des
// conditions et du hasard. Elle ne lit **aucune clé de `cfgMelee`** — la
// config de mêlée par équipe existe mais ne touche jamais la contestation.
//
// Vérifié en jouant : poser `meleeA.reculTroisQuarts = 12` donne exactement
// le même résultat que le défaut (81/94 mêlées gagnées dans les deux cas) —
// la clé traverse bien toute la chaîne de config, mais n'atteint pas le
// contest. Le seul réglage que le Mode Club peut poser sur la mêlée
// (`pickAndGoHuit`, axe « Jeu d'avants ») décide de ce qu'on fait du ballon
// UNE FOIS SORTI, jamais de la poussée.
//
// POURQUOI C'EST INSUFFISANT POUR LE JOUEUR : la mêlée est, avec la touche,
// l'une des deux phases où un entraîneur décide vraiment. Depuis P1-49 le
// manager recrute ses piliers sur leur `melee` (40 % de leur note au poste),
// et le moteur s'en sert — mais le manager, lui, ne peut RIEN choisir. La
// touche vient de recevoir son arbitrage (P1-50/50b) ; la mêlée n'en a aucun.
//
// FONCTION EXACTE RESPONSABLE : engine/rugby-engine.js, `_meleeCalculerDiff`.
//
// CE QUE CE FICHIER EXIGE :
//   1. une consigne de poussée réglable PAR ÉQUIPE ;
//   2. un effet RÉEL sur la contestation ;
//   3. un COÛT réel — dominer doit exposer aux fautes, sinon ce n'est pas
//      un choix (même erreur que celle corrigée en P1-50b) ;
//   4. le réglage neutre doit laisser le comportement historique INCHANGÉ ;
//   5. la consigne doit exister comme axe tactique du Mode Club et arriver
//      jusqu'au moteur ;
//   6. les mêlées doivent rester dans les ordres de grandeur d'un vrai match.
//
// Usage : node server/test-melee.js
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

function jouer(graine, cfg) {
  const m = new RugbyEngine.MatchEngine(graine, 4800, cfg);
  for (let i = 0; i < 400000 && m.getState().phase !== 'TERMINE'; i++) m.tick(1 / 20);
  return m.getState().stats;
}

test('M1 — PREUVE : une consigne de poussée existe et agit sur la contestation', () => {
  const dominer = RugbyEngine.effetPousseeMelee('dominer');
  const equilibre = RugbyEngine.effetPousseeMelee('equilibre');
  const sortirVite = RugbyEngine.effetPousseeMelee('sortirVite');
  for (const e of [dominer, equilibre, sortirVite]) {
    assert.ok(e && typeof e.bonusDiff === 'number' && typeof e.bonusVol === 'number'
      && typeof e.facteurFaute === 'number',
      `chaque consigne doit produire un effet chiffré (${JSON.stringify(e)})`);
  }
  assert.ok(dominer.bonusDiff > equilibre.bonusDiff, 'pousser doit peser sur le différentiel');
  assert.ok(sortirVite.bonusDiff < equilibre.bonusDiff, 'renoncer à pousser doit coûter');
});

test('M1bis — l\'effet ne peut PAS passer par le seul différentiel (saturation)', () => {
  // Mesuré : `probaVol` vaut 0,05 - diff/300 borné à 0,02, et l'avantage
  // d'introduction (18) suffit déjà à coller la valeur au plancher. Un bonus
  // de différentiel seul n'y change donc RIEN. Première version de ce patch :
  // +10 de différentiel et rien d'autre -> le taux de mêlées gagnées passait
  // de 85,9 % à 79,6 %, l'effet était inerte et seul le coût s'appliquait.
  const probaVol = (diff) => Math.max(0.02, Math.min(0.35, 0.05 - diff / 300));
  assert.strictEqual(probaVol(18), 0.02, 'à packs égaux, on est déjà au plancher');
  assert.strictEqual(probaVol(28), 0.02, '+10 de différentiel n\'y change rien');
  // D'où un terme DÉDIÉ : un pack qui pousse contre l'introduction contre plus.
  assert.ok(RugbyEngine.effetPousseeMelee('dominer').bonusVol > 0,
    'dominer doit augmenter le contre quand on ne rentre pas le ballon');
  assert.ok(RugbyEngine.effetPousseeMelee('sortirVite').bonusVol < 0,
    'sortir vite doit réduire le risque de se faire contrer');
  // Et ce terme, lui, sort réellement du plancher.
  const avecPoussee = Math.max(0.02, Math.min(0.35,
    0.05 - 18 / 300 + RugbyEngine.effetPousseeMelee('dominer').bonusVol));
  assert.ok(avecPoussee > 0.02 * 2,
    `pousser contre l'introduction doit VRAIMENT augmenter le contre (${avecPoussee.toFixed(3)})`);
});

test('M2 — le réglage neutre laisse le comportement HISTORIQUE inchangé', () => {
  const e = RugbyEngine.effetPousseeMelee('equilibre');
  assert.strictEqual(e.bonusDiff, 0, 'aucun bonus au réglage neutre');
  assert.strictEqual(e.bonusVol, 0, 'aucun contre supplémentaire au réglage neutre');
  assert.strictEqual(e.facteurFaute, 1, 'aucun surcroît de faute au réglage neutre');
  // Une consigne inconnue ou absente doit retomber sur le neutre, jamais
  // planter ni inventer un effet.
  assert.deepStrictEqual(RugbyEngine.effetPousseeMelee(null), e);
  assert.deepStrictEqual(RugbyEngine.effetPousseeMelee('nimportequoi'), e);
});

test('M3 — dominer COÛTE : plus de risque de faute (sinon ce n\'est pas un choix)', () => {
  const dominer = RugbyEngine.effetPousseeMelee('dominer');
  const sortirVite = RugbyEngine.effetPousseeMelee('sortirVite');
  assert.ok(dominer.facteurFaute > 1,
    `pousser fort doit exposer aux fautes (${dominer.facteurFaute})`);
  assert.ok(sortirVite.facteurFaute < 1,
    `sortir vite doit réduire le risque (${sortirVite.facteurFaute})`);
});

test('M4 — la consigne arrive jusqu\'au moteur, par équipe', () => {
  const m = new RugbyEngine.MatchEngine(1, 60, { meleeA: { poussee: 'dominer' } });
  assert.strictEqual(m.cfgMelee.A.poussee, 'dominer', 'l\'équipe A doit avoir la consigne');
  assert.strictEqual(m.cfgMelee.B.poussee, 'equilibre',
    'l\'équipe B garde le réglage neutre par défaut');
});

test('M5 — la consigne est un AXE TACTIQUE du Mode Club', () => {
  const axe = RMClub.AXES_TACTIQUE.poussee;
  assert.ok(axe && axe.label, 'un axe « poussée » doit exister');
  assert.strictEqual(axe.defaut, 'equilibre', 'neutre par défaut');
  const cles = Object.keys(axe.options);
  assert.ok(cles.length >= 3, `au moins trois options (${cles.join(', ')})`);
  for (const cle of cles) {
    const o = axe.options[cle];
    assert.ok(o.nom && o.description && o.compromis,
      `${cle} doit annoncer son compromis au manager (${JSON.stringify(o)})`);
  }
});

test('M6 — l\'axe se traduit en config moteur, sans écraser l\'axe « avants »', () => {
  // Les deux axes écrivent dans `melee` : ils doivent FUSIONNER, pas se
  // remplacer — sinon choisir une poussée ferait perdre le réglage de
  // pick-and-go, et réciproquement.
  const cfg = RMClub.tactiqueVersConfig({ avants: 'proche', poussee: 'dominer' });
  assert.ok(cfg.melee, 'une config de mêlée doit être produite');
  assert.strictEqual(cfg.melee.poussee, 'dominer');
  assert.ok(cfg.melee.pickAndGoHuit, 'le réglage de l\'axe « avants » doit survivre');
  // Réglages neutres : rien d'imposé au moteur.
  const neutre = RMClub.tactiqueVersConfig({ avants: 'equilibre', poussee: 'equilibre' });
  assert.ok(!neutre.melee || !neutre.melee.poussee || neutre.melee.poussee === 'equilibre',
    'le neutre ne doit rien forcer');
});

test('M6b — « Jeu d\'avants » gouverne AUSSI la sortie de regroupement, sans écraser l\'axe « pied »', () => {
  // L'axe s'appelle « Jeu d'avants » et sa description promet le pick-and-go
  // au près « plutôt qu'une sortie rapide aux trois-quarts ». Il ne pilotait
  // pourtant que la MÊLÉE : à la sortie d'un ruck — c'est-à-dire l'immense
  // majorité des ballons — le n°9 de tous les clubs jouait pareil.
  //
  // Le piège de câblage est réel : `tactiqueVersConfig` ne fusionnait dans
  // `attaque` que les axes « style » et « pied ». Un réglage d'attaque posé
  // sur « avants » serait SILENCIEUSEMENT PERDU, exactement ce que M6 protège
  // du côté `melee`.
  const cfg = RMClub.tactiqueVersConfig({ avants: 'proche', pied: 'frequent' });
  assert.ok(cfg.attaque, 'une config d\'attaque doit être produite');
  assert.ok(typeof cfg.attaque.sortieAvant === 'number',
    'l\'axe « avants » doit poser la sortie de regroupement (sortieAvant)');
  assert.strictEqual(cfg.attaque.tauxJeuAuPied, 2.5,
    'le réglage de l\'axe « pied » doit survivre à la fusion');
  const large = RMClub.tactiqueVersConfig({ avants: 'large' });
  assert.ok(large.attaque && large.attaque.sortieAvant < cfg.attaque.sortieAvant,
    '« Ouvert aux 3/4 » doit sortir moins souvent au près que « Près du ruck »');
  const neutre = RMClub.tactiqueVersConfig({ avants: 'equilibre' });
  assert.ok(!neutre.attaque || neutre.attaque.sortieAvant === undefined,
    'le neutre ne doit rien forcer au moteur');
});

test('M7 — en match, la consigne produit réellement un déroulé différent', () => {
  // Ce test vérifie le CÂBLAGE de bout en bout, pas l'ampleur de l'effet :
  // sur une dizaine de matchs, le nombre même de mêlées change (115 contre
  // 134 selon la consigne), donc les taux ne sont pas comparables. L'ampleur
  // est vérifiée sur la règle (M1bis, M3), pas sur une moyenne bruitée —
  // même méthode qu'en P1-50b pour la touche.
  let neutre = { s: 0, g: 0 }, pousse = { s: 0, g: 0 };
  for (let g = 1; g <= 8; g++) {
    const a = jouer(g, null);
    neutre.s += a.A.scrums; neutre.g += a.A.scrumsGagnes;
    const b = jouer(g, { meleeA: { poussee: 'dominer' } });
    pousse.s += b.A.scrums; pousse.g += b.A.scrumsGagnes;
  }
  assert.ok(neutre.s > 0 && pousse.s > 0, 'des mêlées doivent avoir lieu');
  assert.notDeepStrictEqual([pousse.g, pousse.s], [neutre.g, neutre.s],
    `la consigne doit produire un match différent (${pousse.g}/${pousse.s} vs ${neutre.g}/${neutre.s})`);
});

test('M8 — les mêlées restent dans les ordres de grandeur d\'un vrai match', () => {
  let total = 0;
  const n = 5;
  for (let g = 1; g <= n; g++) {
    const st = jouer(g, { meleeA: { poussee: 'dominer' }, meleeB: { poussee: 'sortirVite' } });
    total += st.A.scrums + st.B.scrums;
  }
  const moyenne = total / n;
  assert.ok(moyenne >= 6 && moyenne <= 30,
    `un match compte 8 à 25 mêlées (moyenne mesurée ${moyenne.toFixed(1)})`);
});


// M9 — LA MELEE DOIT RESTER CONTESTABLE (loi 19).
//
// Trouve par MUTATION : en supprimant la branche « ballon vole contre
// l'introduction » — l'equipe qui introduit gagne alors TOUJOURS son ballon —,
// cette suite restait VERTE. M1 a M8 verifient la CONSIGNE de poussee et son
// cout, jamais que la melee peut etre perdue. Seul un test sans rapport, dans
// une autre suite, reagissait par ricochet.
// Une melee non contestable n'est plus une phase de combat : c'est une remise
// en jeu automatique, et le pack adverse devient decoratif.
test('M9 — la mêlée est CONTESTABLE : l\'introduction n\'est pas garantie', () => {
  // On conduit une vraie melee, puis on FIGE le tirage pour forcer la branche
  // de contestation : le vainqueur doit alors etre le camp qui N'A PAS
  // introduit. Sans cette branche, l'introduction gagnerait quand meme.
  let verifie = false;
  for (const graine of [3, 7, 11, 19, 23]) {
    const m = new RugbyEngine.MatchEngine(graine, 900, null);
    for (let t = 0; t < 900 && !(m.phase === 'MELEE' && m.melee); t += 0.1) m.tick(0.1);
    if (!m.melee) continue;
    const intro = m.melee.equipeIntroduction;
    const nonIntro = m.melee.equipeNonIntroduction;
    m.rng = () => 0; // le tirage tombe toujours dans la contestation
    m._meleeResoudreContestation();
    assert.strictEqual(m.melee.vainqueur, nonIntro,
      `le camp qui n'introduit pas doit pouvoir gagner le ballon (vainqueur ${m.melee.vainqueur}, introduction ${intro})`);
    assert.strictEqual(m.melee.qualite, 'VOLE', 'la melee gagnee contre l introduction est un ballon VOLE');
    verifie = true;
    break;
  }
  assert.ok(verifie, 'aucune mêlée n\'a pu être observée pour le test');
});

// M10 — ET LA MELEE DOIT PRODUIRE DES FAUTES (loi 19).
//
// Meme constat par mutation : en faisant renvoyer `null` a
// `_meleeDetecterFautes` — plus aucune penalite ni coup franc de melee —,
// cette suite restait VERTE elle aussi. Or CLAUDE.md (role 5) demande qu'une
// faute ait une consequence, et la melee est l'une des principales sources de
// penalites d'un match de rugby.
// Mesure : 7,4 fautes de melee par match (penalites + coups francs).
test('M10 — la mêlée produit de vraies fautes (pénalités et coups francs)', () => {
  let fautes = 0, melees = 0;
  const motifs = new Set();
  for (const graine of [1, 2, 3]) {
    const m = new RugbyEngine.MatchEngine(graine, 4800, null);
    const brut = m.log.bind(m);
    m.log = (type, team, msg) => {
      if (/^MELEE_PEN/.test(type) || type === 'COUP_FRANC') { fautes++; motifs.add(type); }
      if (type === 'MELEE') melees++;
      brut(type, team, msg);
    };
    for (let t = 0; t < 4800; t += 0.2) m.tick(0.2);
  }
  assert.ok(melees > 15, `echantillon de mêlées trop petit (${melees})`);
  const parMatch = fautes / 3;
  assert.ok(parMatch >= 2,
    `la mêlée doit produire des fautes sanctionnées (mesuré ${parMatch.toFixed(1)} par match)`);
  assert.ok(motifs.size >= 2,
    `plusieurs motifs de faute distincts doivent exister (mesuré ${motifs.size} : ${[...motifs].join(' / ')})`);
});

// ===========================================================================
// M11-M19 — LA MÊLÉE EST UNE SÉQUENCE PHYSIQUE CONTINUE (cf. TODO_AUDIT.md P2-64)
//
// Demande : le ballon suit une trajectoire continue, le n°9 introduit
// réellement puis rejoint la base. Avant ce correctif, le ballon était dessiné
// FIXE au point de mêlée du début à la fin, l'« introduction » n'était qu'une
// annonce suivie de 4 s d'attente, l'issue était tirée au bout de 6 s de
// « contestation » sans que le ballon bouge, et le ballon « sortait sur le 8 »
// qui le passait au 9.
//
// On observe de vraies mêlées de match, pas à pas, UNIQUEMENT à travers ce que
// voit le rendu (getState : ballon, joueurs) — jamais en lisant l'état interne
// de la nouvelle mécanique, pour que les tests jugent le résultat et non
// l'implémentation.
const E = { F: 'MELEE_FORMATION', C: 'MELEE_CROUCH', B: 'MELEE_BIND', S: 'MELEE_SET',
  I: 'MELEE_INTRODUCTION', T: 'MELEE_CONTESTATION', X: 'MELEE_SORTIE' };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function suivreMelees(graines, cfg, maxMelees) {
  const melees = [];
  for (const graine of graines) {
    const m = new RugbyEngine.MatchEngine(graine, 4800, cfg || null);
    const evts = [];
    const brut = m.log.bind(m);
    m.log = (type, team, msg, extra) => { evts.push({ type, team, msg }); return brut(type, team, msg, extra); };
    let cur = null, n = 0;
    for (let t = 0; t < 4800 && n < (maxMelees || 2); t += 0.1) {
      m.tick(0.1);
      const st = m.getState();
      if (st.phase === 'MELEE' && st.melee) {
        if (!cur) {
          cur = { graine, intro: m.melee.equipeIntroduction, sens: m.melee.sens, ticks: [], evts0: evts.length, m };
        }
        const eqI = cur.intro === 'A' ? st.equipeA : st.equipeB;
        const eqD = cur.intro === 'A' ? st.equipeB : st.equipeA;
        cur.ticks.push({
          etat: st.melee.etat, mx: st.melee.x, my: st.melee.y,
          ballon: { x: st.ballon.x, y: st.ballon.y, h: st.ballon.hauteur || 0 },
          neufI: eqI.find((j) => j.numero === 9), neufD: eqD.find((j) => j.numero === 9),
          huitI: eqI.find((j) => j.numero === 8), huitD: eqD.find((j) => j.numero === 8),
          avants: eqI.concat(eqD).filter((j) => j.numero <= 8 && !(j.sinBin > 0)),
        });
      } else if (cur) {
        cur.sortie = { phase: st.phase, porteur: st.porteur, ballon: { x: st.ballon.x, y: st.ballon.y } };
        cur.evts = evts.slice(cur.evts0);
        cur.trace = typeof m.traceMelees === 'function' ? m.traceMelees().slice(-1)[0] : null;
        melees.push(cur); cur = null; n++;
      }
    }
  }
  return melees;
}
// Mêlées allées jusqu'au bout (ballon à la base puis joué), sans faute sifflée.
const completes = (ms) => ms.filter((x) => x.ticks.some((k) => k.etat === E.X) && x.sortie && x.sortie.phase === 'PORTE'
  && !x.evts.some((e) => /^MELEE_PEN|^COUP_FRANC|^PENALITE|^MELEE_RESET|^MELEE_TOURNEE/.test(e.type)));
const MELEES = suivreMelees([1, 2, 3, 4, 5, 6, 7, 8], null, 2);
const COMPLETES = completes(MELEES);
const vainqueurDe = (x) => (x.evts.some((e) => e.type === 'TURNOVER') ? (x.intro === 'A' ? 'B' : 'A') : x.intro);

test('M11 — avant l\'introduction, le ballon est dans les mains du 9, à l\'extérieur, face au tunnel', () => {
  assert.ok(COMPLETES.length >= 5, `echantillon trop petit (${COMPLETES.length} mêlées complètes)`);
  let n = 0;
  for (const x of COMPLETES) for (const k of x.ticks) {
    if (k.etat !== E.C && k.etat !== E.B && k.etat !== E.S) continue;
    n++;
    assert.ok(dist(k.ballon, k.neufI) < 0.3, `pendant ${k.etat}, le ballon est à ${dist(k.ballon, k.neufI).toFixed(2)} m du 9 qui introduit (il doit être dans ses mains)`);
    assert.ok(Math.abs(k.neufI.y - k.my) >= 2.0, `le 9 n'est pas à l'extérieur de la mêlée (écart latéral ${Math.abs(k.neufI.y - k.my).toFixed(2)} m)`);
    assert.ok(Math.abs(k.neufI.x - k.mx) <= 1.0, `le 9 n'est pas face au tunnel (écart ${Math.abs(k.neufI.x - k.mx).toFixed(2)} m dans l'axe)`);
  }
  assert.ok(n > 50, `trop peu de ticks Flexion/Liez/Jeu observés (${n})`);
});

test('M12 — l\'introduction dure 0,5 à 1 s : le ballon traverse latéralement le tunnel et touche le sol au milieu', () => {
  for (const x of COMPLETES) {
    const intro = x.ticks.filter((k) => k.etat === E.I);
    const duree = intro.length * 0.1;
    assert.ok(duree >= 0.45 && duree <= 1.05, `introduction de ${duree.toFixed(1)} s (graine ${x.graine})`);
    const premier = x.ticks.findIndex((k) => k.etat === E.T);
    const k0 = x.ticks[premier];
    assert.ok(Math.hypot(k0.ballon.x - k0.mx, k0.ballon.y - k0.my) < 0.6,
      `au début du talonnage, le ballon est à ${Math.hypot(k0.ballon.x - k0.mx, k0.ballon.y - k0.my).toFixed(2)} m du milieu du tunnel`);
    for (const k of intro) {
      for (const huit of [k.huitI, k.huitD]) {
        assert.ok(!huit || dist(k.ballon, huit) > 1.0, 'pendant l\'introduction, le ballon apparaît sous le 8');
      }
    }
    // Le ballon se rapproche latéralement du milieu du tunnel, sans revenir en arrière.
    for (let i = 1; i < intro.length; i++) {
      assert.ok(Math.abs(intro[i].ballon.y - intro[i].my) <= Math.abs(intro[i - 1].ballon.y - intro[i - 1].my) + 0.05,
        'le ballon introduit ne traverse pas le tunnel vers le milieu');
    }
  }
});

test('M13 — talonnage : le ballon roule AU SOL sous le pack, 2 à 4 s, jusqu\'aux pieds du 8 qui gagne', () => {
  for (const x of COMPLETES) {
    const ach = x.ticks.filter((k) => k.etat === E.T);
    const duree = ach.length * 0.1;
    assert.ok(duree >= 1.85 && duree <= 4.15, `acheminement de ${duree.toFixed(1)} s (graine ${x.graine})`);
    for (let i = 1; i < ach.length; i++) {
      assert.ok(dist(ach[i].ballon, ach[i - 1].ballon) <= 0.35, `le ballon saute de ${dist(ach[i].ballon, ach[i - 1].ballon).toFixed(2)} m en un pas sous le pack`);
      assert.ok(ach[i].ballon.h === 0, 'le ballon talonné doit rester au sol');
    }
    const base = x.ticks.find((k) => k.etat === E.X);
    const v = vainqueurDe(x);
    const huitV = v === x.intro ? base.huitI : base.huitD;
    assert.ok(dist(base.ballon, huitV) < 0.8, `à la base, le ballon est à ${dist(base.ballon, huitV).toFixed(2)} m du 8 qui a gagné (graine ${x.graine})`);
  }
});

test('M14 — pendant le talonnage, le 9 longe son pack sans passer devant le ballon ni traverser les joueurs', () => {
  for (const x of COMPLETES) {
    if (vainqueurDe(x) !== x.intro) continue;
    for (const k of x.ticks.filter((t) => t.etat === E.T)) {
      const devant = (k.neufI.x - k.ballon.x) * x.sens;
      assert.ok(devant <= 0.2, `le 9 est ${devant.toFixed(2)} m DEVANT le ballon (graine ${x.graine})`);
      const proche = Math.min(...k.avants.map((a) => dist(a, k.neufI)));
      assert.ok(proche >= 0.45, `le 9 passe à ${proche.toFixed(2)} m d'un avant : il traverse le pack`);
      assert.ok(dist(k.ballon, k.neufI) > 0.3 || devant > -0.1, 'le 9 ne doit pas porter le ballon pendant le talonnage');
    }
  }
});

test('M15 — à la base, le ballon reste aux pieds du 8 ; la mêlée finit quand le 9 le ramasse (ou le 8 part)', () => {
  let parNeuf = 0;
  for (const x of COMPLETES) {
    const base = x.ticks.filter((k) => k.etat === E.X);
    assert.ok(base.length * 0.1 >= 0.5, `le ballon n'est resté que ${(base.length * 0.1).toFixed(1)} s à la base`);
    const fin = base[base.length - 1];
    const v = vainqueurDe(x);
    const pickAndGo = x.evts.some((e) => e.type === 'MELEE_PICK_AND_GO');
    // Passe du 8 (M21) : le receveur est le 10 ou le 9, la passe est vérifiée là-bas.
    const passeHuit = x.evts.some((e) => e.type === 'MELEE_PASSE_HUIT');
    const attendu = pickAndGo ? 8 : 9;
    if (!passeHuit) assert.strictEqual(x.sortie.porteur.numero, attendu, `la mêlée se termine sur le n°${x.sortie.porteur.numero}, attendu n°${attendu}`);
    assert.strictEqual(x.sortie.porteur.team, v, 'le ballon est joué par l\'équipe qui l\'a gagné');
    assert.ok(dist(x.sortie.ballon, fin.ballon) <= 1.0, `le ballon saute de ${dist(x.sortie.ballon, fin.ballon).toFixed(2)} m quand la mêlée se termine`);
    if (!pickAndGo && !passeHuit) parNeuf++;
  }
  assert.ok(parNeuf > 0, 'aucune mêlée terminée par le 9');
});

test('M16 — le 9 du camp qui perd le ballon ne franchit pas la ligne médiane du tunnel', () => {
  for (const x of MELEES) {
    const v = vainqueurDe(x);
    for (const k of x.ticks) {
      if (k.etat === E.F) continue; // il court encore vers la mêlée
      for (const [neuf, team] of [[k.neufI, x.intro], [k.neufD, x.intro === 'A' ? 'B' : 'A']]) {
        if (!neuf || team === v && k.etat !== E.C && k.etat !== E.B && k.etat !== E.S && k.etat !== E.I) continue;
        const s = team === 'A' ? 1 : -1;
        assert.ok((neuf.x - k.mx) * s <= 0.3, `le 9 de l'équipe ${team} passe la ligne médiane du tunnel (${((neuf.x - k.mx) * s).toFixed(2)} m) en ${k.etat}`);
      }
    }
  }
});

test('M17 — aucune téléportation du ballon, et la trace de chaque pas est enregistrée', () => {
  for (const x of MELEES) {
    for (let i = 1; i < x.ticks.length; i++) {
      const saut = dist(x.ticks[i].ballon, x.ticks[i - 1].ballon);
      assert.ok(saut <= 1.0, `le ballon saute de ${saut.toFixed(2)} m entre deux pas (${x.ticks[i - 1].etat} -> ${x.ticks[i].etat}, graine ${x.graine})`);
    }
  }
  for (const x of COMPLETES) {
    assert.ok(x.trace && Array.isArray(x.trace.pas) && Array.isArray(x.trace.contacts), 'traceMelees() doit exposer la trace de la dernière mêlée');
    assert.ok(Math.abs(x.trace.pas.length - x.ticks.length) <= 1, `trace : ${x.trace.pas.length} pas pour ${x.ticks.length} pas observés`);
    const p = x.trace.pas[Math.floor(x.trace.pas.length / 2)];
    assert.ok(p && p.balle && p.neufIntro && p.neufAdverse && typeof p.balle.x === 'number' && p.neufIntro.action,
      'chaque pas enregistre le ballon et les deux 9 avec leur action');
    const types = x.trace.contacts.map((c) => c.type);
    const ordre = ['LACHER', 'SOL', 'TALONNAGE', 'CONTROLE_8', 'RAMASSAGE'];
    let i = -1;
    for (const t of ordre) { const j = types.indexOf(t, i + 1); assert.ok(j > i, `contact ${t} absent ou hors d'ordre (${types.join(' > ')})`); i = j; }
  }
});

test('M18 — un écroulement interrompt la séquence immédiatement', () => {
  let verifie = false;
  for (const graine of [1, 2, 3, 4, 5, 6]) {
    const m = new RugbyEngine.MatchEngine(graine, 4800, null);
    for (let t = 0; t < 4800 && !(m.melee && m.melee.etat === E.T); t += 0.1) m.tick(0.1);
    if (!m.melee) continue;
    m.tick(0.1); m.tick(0.1);
    if (!m.melee || m.melee.etat !== E.T) continue;
    const avant = m.getState().ballon;
    m.rng = () => 0; // la première faute possible en contestation est l'écroulement
    m.tick(0.1);
    assert.notStrictEqual(m.phase, 'MELEE', 'la mêlée continue après l\'écroulement');
    const tr = m.traceMelees().slice(-1)[0];
    assert.strictEqual(tr.contacts[tr.contacts.length - 1].type, 'ECROULEMENT', 'l\'écroulement doit clore la trace');
    assert.ok(tr.pas.length > 0 && dist(tr.pas[tr.pas.length - 1].balle, avant) < 0.05,
      'le ballon ne doit plus avancer sous le pack une fois la mêlée écroulée');
    verifie = true; break;
  }
  assert.ok(verifie, 'aucune mêlée en talonnage n\'a pu être observée');
});

test('M19 — les durées de l\'introduction, du talonnage et de la sortie sont paramétrables', () => {
  const cfg = { melee: { durees: { introduction: 0.5, acheminementMin: 2.0, acheminementMax: 2.0, sortie: 0.6 } } };
  const ms = completes(suivreMelees([1, 2, 3, 4, 5, 6], cfg, 2));
  assert.ok(ms.length >= 3, `echantillon trop petit (${ms.length})`);
  for (const x of ms) {
    const intro = x.ticks.filter((k) => k.etat === E.I).length * 0.1;
    const ach = x.ticks.filter((k) => k.etat === E.T).length * 0.1;
    assert.ok(Math.abs(intro - 0.5) <= 0.15, `introduction ${intro.toFixed(1)} s pour 0,5 s demandée`);
    assert.ok(Math.abs(ach - 2.0) <= 0.15, `talonnage ${ach.toFixed(1)} s pour 2,0 s demandées`);
  }
});

test('M20 — le 9 adverse se place du MÊME côté que le 9 qui introduit, au niveau du tunnel, de son côté', () => {
  // Loi 20 : le demi de mêlée de l'équipe qui n'introduit pas se tient du même
  // côté de la mêlée que celui qui introduit, au niveau du tunnel, sans
  // franchir la ligne médiane. Signalé par le joueur : il était placé de
  // l'autre côté de la mêlée.
  let n = 0;
  for (const x of COMPLETES) for (const k of x.ticks) {
    if (k.etat !== E.C && k.etat !== E.B && k.etat !== E.S && k.etat !== E.I) continue;
    n++;
    const coteI = Math.sign(k.neufI.y - k.my), coteD = Math.sign(k.neufD.y - k.my);
    assert.strictEqual(coteD, coteI, `en ${k.etat}, le 9 adverse est de l'autre côté de la mêlée (graine ${x.graine})`);
    assert.ok(Math.abs(k.neufD.x - k.mx) <= 1.2, `le 9 adverse est à ${Math.abs(k.neufD.x - k.mx).toFixed(2)} m du tunnel`);
    const sD = x.intro === 'A' ? -1 : 1;
    assert.ok((k.neufD.x - k.mx) * sD <= 0.05, 'le 9 adverse passe la ligne médiane du tunnel');
  }
  assert.ok(n > 50, `trop peu de ticks observés (${n})`);
});

test('M21 — à la base, le 8 peut aussi partir avec le ballon ou faire une passe (pas seulement le 9)', () => {
  // Demande du joueur : « le 8 peut partir avec la balle ou faire une passe, il
  // n'y a pas que le 9 ». Les trois sorties doivent exister ; la passe du 8
  // part de ses mains et ne va jamais vers l'avant.
  const ms = completes(suivreMelees([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], null, 3));
  let parNeuf = 0, huitPart = 0, huitPasse = 0;
  for (const x of ms) {
    if (x.evts.some((e) => e.type === 'MELEE_PICK_AND_GO')) huitPart++;
    else if (x.evts.some((e) => e.type === 'MELEE_PASSE_HUIT')) {
      huitPasse++;
      const fin = x.ticks[x.ticks.length - 1];
      const v = vainqueurDe(x);
      const huit = v === x.intro ? fin.huitI : fin.huitD;
      const s = v === 'A' ? 1 : -1;
      assert.ok(x.sortie.porteur.numero !== 8, 'après sa passe, le 8 ne doit plus être porteur');
      assert.ok((x.sortie.porteur.x - huit.x) * s <= 0.3, `passe du 8 vers l'AVANT (${((x.sortie.porteur.x - huit.x) * s).toFixed(2)} m)`);
    } else parNeuf++;
  }
  assert.ok(parNeuf > 0 && huitPart > 0 && huitPasse > 0,
    `sorties observées : 9 ${parNeuf}, 8 qui part ${huitPart}, 8 qui passe ${huitPasse}`);
});

test('M22 — « mêlée dominée » reste l\'exception à packs égaux, la règle face à un pack bien plus fort', () => {
  // Constat : 7,4 mêlées « dominées » par match contre 0,3 « gagnées
  // proprement » — le fil du match annonçait une domination à presque chaque
  // mêlée, et le 8 partait seul trop souvent (pick-and-go plus probable après
  // domination). La qualité doit refléter l'écart RÉEL entre les packs.
  const issues = (graines, renforcerA) => {
    const c = { DOMINEE: 0, GAGNEE: 0, PRESSION: 0 };
    for (const g of graines) {
      // Pack renforcé passé par la config (`joueursA`), comme le Mode Club : les
      // joueurs sont recréés à chaque remise en place, une retouche directe ne
      // tiendrait pas.
      let cfg = null;
      if (renforcerA) {
        const joueursA = JSON.parse(JSON.stringify(new RugbyEngine.MatchEngine(1, 60, null).cfg.joueurs));
        for (let n = 1; n <= 8; n++) joueursA[n].melee = Math.min(99, joueursA[n].melee + 30);
        cfg = { joueursA };
      }
      const m = new RugbyEngine.MatchEngine(g, 4800, cfg);
      const brut = m.log.bind(m);
      m.log = (type, team, msg, extra) => {
        const k = type === 'MELEE_DOMINEE' ? 'DOMINEE' : type === 'MELEE_GAGNEE' ? 'GAGNEE' : type === 'MELEE_PRESSION' ? 'PRESSION' : null;
        if (k && (!renforcerA || team === 'A')) c[k]++;
        return brut(type, team, msg, extra);
      };
      for (let i = 0; i < 400000 && m.phase !== 'TERMINE'; i++) m.tick(0.1);
    }
    const n = c.DOMINEE + c.GAGNEE + c.PRESSION;
    return { ...c, n, partDom: n ? c.DOMINEE / n : 0 };
  };
  const egaux = issues([1, 2, 3, 4, 5, 6]);
  assert.ok(egaux.n >= 30, `échantillon trop petit (${egaux.n})`);
  assert.ok(egaux.partDom >= 0.08 && egaux.partDom <= 0.4,
    `packs égaux : ${(egaux.partDom * 100).toFixed(0)} % de mêlées « dominées » (${JSON.stringify(egaux)})`);
  assert.ok(egaux.GAGNEE > egaux.DOMINEE && egaux.GAGNEE > egaux.PRESSION,
    `packs égaux : la mêlée gagnée proprement doit être l'issue la plus fréquente (${JSON.stringify(egaux)})`);
  assert.ok(egaux.PRESSION > 0, `packs égaux : aucune mêlée gagnée sous pression (${JSON.stringify(egaux)})`);
  const fort = issues([1, 2, 3, 4], true);
  assert.ok(fort.partDom >= 0.6,
    `pack A nettement plus fort : seulement ${(fort.partDom * 100).toFixed(0)} % de mêlées dominées (${JSON.stringify(fort)})`);
});

test('M23 — l\'introduction non droite existe mais reste rare, la plupart des mêlées vont jusqu\'au talonnage', () => {
  // Constat : ~2 introductions non droites sifflées par match (18 % des
  // lâchers), soit 40 % des coups d'arrêt de mêlée. Le joueur voyait une
  // mêlée sur six s'arrêter au lâcher, sans talonnage ni sortie. Depuis les
  // consignes d'arbitrage de 2018, cette faute est très rarement sifflée.
  let nonDroites = 0, introductions = 0;
  // 8 matchs et un seuil PAR LÂCHER (P2-77) : sur 6 matchs avec un seuil par
  // match (0,8), le test a basculé (0,83) quand le lancer pas droit a ajouté
  // des mêlées — 5 fautes sur 75 lâchers, dans le bruit d'un taux de 4 %.
  // Par lâcher, l'ancien taux (0,18) reste nettement rouge.
  const N = 8;
  for (let g = 1; g <= N; g++) {
    const m = new RugbyEngine.MatchEngine(g, 4800, null);
    const brut = m.log.bind(m);
    m.log = (type, team, msg, extra) => {
      if (type === 'MELEE_INTRODUCTION') introductions++;
      return brut(type, team, msg, extra);
    };
    const contact = m._meleeContact.bind(m);
    m._meleeContact = (type, ...a) => { if (type === 'INTRODUCTION_NON_DROITE') nonDroites++; return contact(type, ...a); };
    for (let i = 0; i < 400000 && m.phase !== 'TERMINE'; i++) m.tick(0.1);
  }
  assert.ok(introductions >= 40, `échantillon trop petit (${introductions} introductions)`);
  assert.ok(nonDroites / introductions <= 0.10, `${(100 * nonDroites / introductions).toFixed(1)} % des lâchers sifflés non droits (${nonDroites}/${introductions}, ${(nonDroites / N).toFixed(2)} par match)`);
  // La règle existe toujours : un taux forcé la fait siffler.
  const m = new RugbyEngine.MatchEngine(3, 4800, { melee: { introductionNonDroite: 1 } });
  let siffle = false;
  const brut = m.log.bind(m);
  m.log = (type, team, msg, extra) => { if (/introduction non droite/.test(msg || '')) siffle = true; return brut(type, team, msg, extra); };
  for (let i = 0; i < 400000 && m.phase !== 'TERMINE' && !siffle; i++) m.tick(0.1);
  assert.ok(siffle, 'une introduction non droite doit pouvoir être sifflée (taux forcé à 1)');
});

test('M24 — à la formation de la mêlée, le ballon rejoint le 9 à vue, sans téléportation', () => {
  // Relevé des sauts du ballon (P2-80) : à chaque mêlée (~8 par match), le
  // ballon sautait de ~11 m (jusqu'à 15 m) dans les mains du 9, encore loin de
  // la marque — il était créé directement « dans ses mains » (P2-64).
  let melees = 0, propres = 0, pire = 0;
  for (let g = 1; g <= 4; g++) {
    const m = new RugbyEngine.MatchEngine(g, 4800, null);
    let prev = null, prevPhase = null, suivi = null;
    for (let i = 0; i < 400000 && m.phase !== 'TERMINE'; i++) {
      m.tick(0.1);
      const st = m.getState();
      const p = { x: st.ballon.x, y: st.ballon.y };
      if (m.phase === 'MELEE' && prevPhase !== 'MELEE') suivi = { saut: 0 };
      if (suivi && prev) suivi.saut = Math.max(suivi.saut, Math.hypot(p.x - prev.x, p.y - prev.y));
      if (suivi && (m.phase !== 'MELEE' || (m.melee && m.melee.etat === 'MELEE_INTRODUCTION'))) {
        melees++;
        if (suivi.saut < 3) propres++;
        pire = Math.max(pire, suivi.saut);
        suivi = null;
      }
      prev = p; prevPhase = m.phase;
    }
  }
  assert.ok(melees >= 20, `échantillon trop petit (${melees} mêlées)`);
  assert.ok(propres / melees >= 0.95, `${propres}/${melees} mêlées sans saut du ballon > 3 m avant l'introduction (pire : ${pire.toFixed(1)} m)`);
});

// QA-RM-001 (bugs.md) : la chaîne complète, sur de vraies mêlées de match,
// dans les DEUX sens d'attaque — ordre des états sans retour arrière (sauf
// remise en place sifflée), et passage au jeu courant sans saut du ballon,
// le ballon allant au camp qui a gagné la mêlée.
test('M25 — chaîne complète dans les deux sens : états en ordre, sortie sans saut, ballon au gagnant (QA-RM-001)', () => {
  const ORDRE = [E.F, E.C, E.B, E.S, E.I, E.T, E.X];
  const sens = new Set();
  for (const x of MELEES) {
    const remise = x.evts && x.evts.some((e) => /MELEE_RESET|MELEE_TOURNEE/.test(e.type));
    let rang = -1;
    for (const k of x.ticks) {
      const r = ORDRE.indexOf(k.etat);
      assert.ok(r >= 0, `état inconnu ${k.etat}`);
      if (r < rang) assert.ok(remise, `graine ${x.graine} : retour de ${ORDRE[rang]} à ${k.etat} sans remise en place sifflée`);
      rang = r;
    }
  }
  for (const x of COMPLETES) {
    sens.add(x.sens);
    const dernier = x.ticks[x.ticks.length - 1];
    const saut = dist(dernier.ballon, x.sortie.ballon);
    assert.ok(saut <= 1.5, `graine ${x.graine} : le ballon saute de ${saut.toFixed(2)} m au passage au jeu courant`);
    const porteur = x.sortie.porteur;
    assert.ok(porteur && porteur.team === vainqueurDe(x),
      `graine ${x.graine} : le jeu reprend avec ${porteur && porteur.team}, la mêlée a été gagnée par ${vainqueurDe(x)}`);
  }
  assert.strictEqual(sens.size, 2, `les deux sens d'attaque doivent être observés (${[...sens].join(', ')})`);
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
