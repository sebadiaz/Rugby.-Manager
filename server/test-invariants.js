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
    assert.ok(['CARRIED', 'AIR', 'LOOSE', 'RUCK', 'MAUL', 'OUT'].includes(s.ball.state), `état de balle invalide : ${s.ball.state}`);
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
  // sortie) mesurée jusqu'à ~10.6s max sur 40 graines avec _echelleArret au
  // plancher (dureeMatch=300s) : la phase FORMATION attend désormais que les
  // avants convergent réellement en courant vers le point de mêlée (cf.
  // _capFormationMelee) plutôt que de les téléporter ou d'annoncer "Crouch"
  // alors qu'ils sont encore loin ; un en-avant survenu à l'autre bout du
  // terrain peut donc légitimement prendre quelques secondes de plus à se
  // reformer. La marge couvre en plus une chaîne de reformations (loi 20,
  // mêlée qui tourne ou ballon bloqué) sans tomber dans un blocage réel.
  // Ce seuil de 16s n'est garanti qu'à ce régime (_echelleArret au plancher,
  // dureeMatch<=720s) : à pleine échelle (_echelleArret=1, dureeMatch=4800,
  // le régime utilisé par server/simulate-many.js pour le calibrage), la même
  // mêlée qui tourne prend mécaniquement plus de temps réel à se reformer ;
  // cf. le test suivant pour la garantie "jamais bloquée" à cette échelle.
  assert.ok(globalMax < 16, `une mêlée est restée bloquée ${globalMax.toFixed(1)}s (devrait toujours se résoudre sous ~16s)`);
});

test('une mêlée se termine toujours, même à pleine échelle (_echelleArret=1)', () => {
  let globalMax = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const m = new MatchEngine(seed, 4800);
    let tempsEnMeleeContinu = 0;
    for (let t = 0; t < 4800; t += 0.1) {
      m.tick(0.1);
      if (m.phase === 'MELEE') {
        tempsEnMeleeContinu += 0.1;
        globalMax = Math.max(globalMax, tempsEnMeleeContinu);
      } else {
        tempsEnMeleeContinu = 0;
      }
    }
  }
  // Mesuré jusqu'à ~22.9s max sur 20 graines à dureeMatch=4800 (match complet
  // de 80 min, sans compression) : le délai de convergence des avants
  // (_capFormationMelee, plafonné à 10s) plus une mêlée qui tourne et se
  // reforme (loi 20) peuvent s'additionner ; la marge reste un garde-fou
  // contre un blocage réel, pas une borne de confort.
  assert.ok(globalMax < 30, `une mêlée est restée bloquée ${globalMax.toFixed(1)}s à pleine échelle (devrait toujours se résoudre sous ~30s)`);
});

test('la réception d\'un coup de pied ne téléporte jamais un joueur (course réelle jusqu\'au point de chute)', () => {
  // Avant le passage à l'échelle des durées de ruck, la réception d'un coup
  // de pied tactique plaçait directement le joueur gagnant sur le point de
  // chute, quelle que soit sa distance réelle au moment de la résolution
  // (cf. _tickReceptionCoupDePied) : ce test garde le bug fermé en bornant
  // le déplacement par tick à la vitesse de course maximale + marge.
  const VITESSE_MAX = 8.0; // cf. vitesseMs() : 3.0 + (100/100)*5.0
  // La marque (loi 11, cf. _traiterCoupFranc) avance délibérément le
  // receveur d'environ 5 m pour jouer vite son coup franc : ce saut existait
  // déjà avant ce correctif et n'est pas le bug visé (qui plaçait le joueur
  // directement sur le point de chute, à n'importe quelle distance). On
  // élargit donc la marge pour couvrir chasse + marque, sans la rendre
  // infinie : un vrai téléport vers le point de chute (souvent >15-20 m) la
  // dépasserait encore largement.
  const AVANCE_MARQUE = 5.0;
  for (let seed = 1; seed <= 25; seed++) {
    const m = new MatchEngine(seed, 300);
    for (let t = 0; t < 300; t += 0.1) {
      const enPhaseCoupDePied = m.phase === 'COUP_DE_PIED_JEU';
      const avant = enPhaseCoupDePied
        ? new Map([...m.equipeA, ...m.equipeB].map(j => [j.team + j.numero, { x: j.x, y: j.y }]))
        : null;
      m.tick(0.1);
      if (!enPhaseCoupDePied) continue;
      // Une sortie en touche pendant ce tick forme immédiatement la touche
      // (les joueurs se placent sur la ligne de touche, conformément à la
      // mécanique de touche existante, indépendante de ce correctif) : on
      // n'evalue le non-téléportation que pour la chasse/réception réelle.
      if (m.phase === 'TOUCHE') continue;
      for (const j of [...m.equipeA, ...m.equipeB]) {
        const prev = avant.get(j.team + j.numero);
        const dist = Math.hypot(j.x - prev.x, j.y - prev.y);
        const pasMax = VITESSE_MAX * 0.1 * 1.5 + AVANCE_MARQUE;
        assert.ok(dist <= pasMax, `${j.team}${j.numero} a parcouru ${dist.toFixed(2)}m en un seul tick (0.1s) pendant un coup de pied (téléportation suspectée)`);
      }
    }
  }
});

test('aucun joueur ne se téléporte pendant une mêlée ou une touche ni à la sortie du ballon', () => {
  // Règle demandée : un joueur ne doit JAMAIS se déplacer sans courir. À la
  // mêlée, plusieurs snaps existaient (le demi de mêlée projeté à l'entrée du
  // tunnel jusqu'à ~27 m, le porteur projeté sur la base à la sortie ~9 m, un
  // avant projeté sur la marque de pénalité ~5-6 m, le jeu rapide qui avançait
  // le porteur de 8 m d'un coup). À la touche, les trois-quarts non participants
  // n'étaient pas repositionnés du tout (ils restaient figés n'importe où), et
  // se replacent désormais à la course derrière la ligne des 10 m (loi 18).
  // Tous ces mouvements doivent se faire à la course : on borne le déplacement
  // par tick à la vitesse de course maximale + marge. On n'évalue QUE les
  // phases de mêlée/touche et leurs sorties en jeu courant : les vraies remises
  // en jeu (coup de pied au but, retour sous les poteaux, engagement après
  // essai/mi-temps) sont des reprises où le replacement est licite et reste
  // hors de ce périmètre.
  const VITESSE_MAX = 8.0; // cf. vitesseMs() : 3.0 + (100/100)*5.0
  const PAS_MAX = VITESSE_MAX * 0.1 * 2; // 1.6 m/tick, large marge sur 0.8 m réel
  const PHASES_STATIQUES = ['MELEE', 'TOUCHE'];
  for (let seed = 1; seed <= 12; seed++) {
    const m = new MatchEngine(seed, 4800);
    let phaseAvant = m.phase;
    for (let t = 0; t < 4800; t += 0.1) {
      const avant = new Map(
        [...m.equipeA, ...m.equipeB].map(j => [j.team + j.numero, { x: j.x, y: j.y }])
      );
      m.tick(0.1);
      // Tick concerné : on est en mêlée/touche, ou on vient d'en sortir balle en
      // main (PORTE/MAUL : les transitions censées garder les mêmes joueurs en
      // jeu courant ; les sorties vers un tir/un engagement sont des reprises
      // licites, exclues ici).
      const concerne = PHASES_STATIQUES.includes(m.phase)
        || (PHASES_STATIQUES.includes(phaseAvant) && (m.phase === 'PORTE' || m.phase === 'MAUL'));
      if (concerne) {
        for (const j of [...m.equipeA, ...m.equipeB]) {
          const prev = avant.get(j.team + j.numero);
          const dist = Math.hypot(j.x - prev.x, j.y - prev.y);
          assert.ok(
            dist <= PAS_MAX,
            `${j.team}${j.numero} a parcouru ${dist.toFixed(2)}m en un tick (0.1s) en phase mêlée/touche (téléportation) [graine ${seed}, t=${t.toFixed(1)}, ${phaseAvant}->${m.phase}]`
          );
        }
      }
      phaseAvant = m.phase;
    }
  }
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
