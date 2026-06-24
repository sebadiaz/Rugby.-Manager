// Tests d'invariants simples (pas un framework de test, juste des assertions
// ciblées), complémentaires à server/simulate.js (qui vérifie surtout
// l'équilibrage statistique sur de longues parties). Usage : node server/test-invariants.js
'use strict';

const assert = require('assert');
const { MatchEngine, LONGUEUR, LARGEUR } = require('../engine/rugby-engine.js');

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

test('même graine = même déroulé de match', () => {
  const a = new MatchEngine(123, 60);
  const b = new MatchEngine(123, 60);
  for (let t = 0; t < 60; t += 0.1) { a.tick(0.1); b.tick(0.1); }
  const sa = a.getState(), sb = b.getState();
  assert.deepStrictEqual(sa.score, sb.score);
  assert.strictEqual(sa.equipeA[0].x, sb.equipeA[0].x);
  assert.strictEqual(sa.events.length, sb.events.length);
});

test('un seul porteur de balle à la fois (ball.state cohérent avec porteur)', () => {
  const m = new MatchEngine(7, 120);
  for (let t = 0; t < 120; t += 0.1) {
    m.tick(0.1);
    const s = m.getState();
    const porteurs = [...s.equipeA, ...s.equipeB].filter(
      j => j.team === s.porteur.team && j.numero === s.porteur.numero
    );
    assert.strictEqual(porteurs.length, 1, 'doit y avoir exactement un porteur identifiable');
    assert.ok(['CARRIED', 'AIR', 'RUCK', 'MAUL', 'OUT'].includes(s.ball.state), `état de balle invalide : ${s.ball.state}`);
  }
});

test('un essai ajoute bien 5 points', () => {
  let trouve = false;
  for (let seed = 1; seed <= 30 && !trouve; seed++) {
    const m = new MatchEngine(seed, 600);
    let avantA = 0, avantB = 0;
    for (let t = 0; t < 600; t += 0.1) {
      m.tick(0.1);
      for (const e of m.events) {
        if (e.type !== 'ESSAI') continue;
        const score = m.getState().score;
        const delta = e.equipe === 'A' ? score.A - avantA : score.B - avantB;
        // Le score peut bouger plusieurs fois le même tick (essai puis
        // transformation au tick suivant) : on vérifie juste qu'à l'instant
        // de l'essai lui-même, l'équipe marqueuse vient de gagner 5 points.
        if (delta === 5) trouve = true;
      }
      avantA = m.score.A; avantB = m.score.B;
    }
  }
  assert.ok(trouve, 'aucun essai à +5 points observé sur 30 graines');
});

test('une transformation réussie ajoute bien 2 points', () => {
  let trouve = false;
  for (let seed = 1; seed <= 30 && !trouve; seed++) {
    const m = new MatchEngine(seed, 600);
    let avant = { A: 0, B: 0 };
    for (let t = 0; t < 600; t += 0.1) {
      m.tick(0.1);
      const score = m.getState().score;
      for (const eq of ['A', 'B']) {
        if (score[eq] - avant[eq] === 2) trouve = true;
      }
      avant = score;
    }
  }
  assert.ok(trouve, 'aucune transformation à +2 points observée sur 30 graines');
});

test('un ruck se termine toujours (jamais bloqué indéfiniment)', () => {
  const m = new MatchEngine(99, 300);
  let tempsEnRuckContinu = 0;
  let maxTempsEnRuck = 0;
  for (let t = 0; t < 300; t += 0.1) {
    m.tick(0.1);
    if (m.phase === 'RUCK') {
      tempsEnRuckContinu += 0.1;
      maxTempsEnRuck = Math.max(maxTempsEnRuck, tempsEnRuckContinu);
    } else {
      tempsEnRuckContinu = 0;
    }
  }
  // Ruck à résolution variable (rucks rapides 2-4s, moyens 4-7s, lents
  // 7-11s, cf. _tickRuck), mis à l'échelle par _echelleArret selon la durée
  // du match (300s ici => plancher 0.15, donc tiers réels ~0.3-1.65s) : la
  // borne haute du test reste volontairement large (durée non mise à
  // l'échelle, palier lent 11s + marge hors-jeu 1.5s) pour rester un garde-fou
  // valide même si la durée de match ou l'échelle changent.
  assert.ok(maxTempsEnRuck < 13, `un ruck est resté bloqué ${maxTempsEnRuck.toFixed(1)}s (devrait toujours se résoudre sous ~12.5s avec la résolution à trois paliers)`);
});

test('un maul bloqué déclenche bien "use it"', () => {
  let trouve = false;
  for (let seed = 1; seed <= 20 && !trouve; seed++) {
    const m = new MatchEngine(seed, 600);
    for (let t = 0; t < 600; t += 0.1) {
      m.tick(0.1);
      if (m.events.some(e => e.type === 'MAUL_USE_IT')) { trouve = true; break; }
    }
  }
  assert.ok(trouve, 'aucun évènement MAUL_USE_IT observé sur 20 graines');
});

test('une mêlée se termine toujours (jamais bloquée indéfiniment)', () => {
  let globalMax = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const m = new MatchEngine(seed, 300);
    let tempsEnMeleeContinu = 0;
    for (let t = 0; t < 300; t += 0.1) {
      m.tick(0.1);
      if (m.phase === 'MELEE') {
        tempsEnMeleeContinu += 0.1;
        globalMax = Math.max(globalMax, tempsEnMeleeContinu);
      } else {
        tempsEnMeleeContinu = 0;
      }
    }
  }
  // Séquence complète (formation/Crouch/Bind/Set/introduction/contestation/
  // sortie) mesurée à ~2.3s max sur 40 graines avec _echelleArret au plancher
  // (dureeMatch=300s) ; la marge couvre une chaîne de reformations (loi 20,
  // mêlée qui tourne ou ballon bloqué) sans tomber dans un blocage réel.
  assert.ok(globalMax < 8, `une mêlée est restée bloquée ${globalMax.toFixed(1)}s (devrait toujours se résoudre sous ~8s)`);
});

test('le ballon ne disparaît jamais (toujours des coordonnées numériques valides)', () => {
  const m = new MatchEngine(55, 300);
  for (let t = 0; t < 300; t += 0.1) {
    m.tick(0.1);
    const { ball } = m.getState();
    assert.ok(Number.isFinite(ball.x) && Number.isFinite(ball.y), `ballon à des coordonnées invalides : ${ball.x}, ${ball.y}`);
  }
});

test('les joueurs restent dans les limites du terrain (avec marge en-but)', () => {
  const m = new MatchEngine(2024, 300);
  for (let t = 0; t < 300; t += 0.1) {
    m.tick(0.1);
    for (const j of [...m.equipeA, ...m.equipeB]) {
      assert.ok(j.x >= -1 && j.x <= LONGUEUR + 1, `${j.team}${j.numero} hors limites en x : ${j.x}`);
      assert.ok(j.y >= -1 && j.y <= LARGEUR + 1, `${j.team}${j.numero} hors limites en y : ${j.y}`);
    }
  }
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
if (process.exitCode) {
  console.error('ECHEC : au moins un invariant violé.');
} else {
  console.log('OK : tous les invariants respectés.');
}
