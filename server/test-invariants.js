// Tests d'invariants simples (pas un framework de test, juste des assertions
// ciblées), complémentaires à server/simulate.js (qui vérifie surtout
// l'équilibrage statistique sur de longues parties). Usage : node server/test-invariants.js
'use strict';

const assert = require('assert');
const { MatchEngine, Referee, LONGUEUR, LARGEUR } = require('../engine/rugby-engine.js');

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
  // L'invariant protégé est « une mêlée se TERMINE toujours », pas « en moins
  // de 30 s ». L'ancien seuil (30 s) encodait une mêlée expédiée en 22,9 s,
  // c'est-à-dire l'anomalie de calibrage elle-même : une séquence de mêlée
  // réelle dure 45-70 s de l'octroi à la sortie du ballon, et l'expédier en
  // 23 s gonflait le ballon-en-jeu à 59,9 min sur 80 (réel ~35).
  //
  // Le seuil suit donc désormais le garde-fou anti-blocage du moteur (95 s à
  // pleine échelle), avec la marge d'une reformation : au-delà, il y a un vrai
  // blocage. Une mêlée qui durerait à nouveau moins de 30 s ne serait pas un
  // succès, ce serait le retour du défaut — c'est ce que mesure désormais
  // server/test-calibration-moteur.js, pas ce test-ci.
  assert.ok(globalMax < 130, `une mêlée est restée bloquée ${globalMax.toFixed(1)}s à pleine échelle (garde-fou moteur : 95 s)`);
});

// Loi 7 : une seule reprise réglementaire par séquence de faute.
//
// Défaut reproduit (graine 1 puis 20 graines) : l'arbitre laisse l'avantage à
// A (faute de B), puis siffle une NOUVELLE pénalité contre A — que B joue —
// et l'avantage de A reste armé. Au tick suivant, `_tickAvantage` voit que la
// possession est passée à l'équipe fautive et « revient à la sanction » : A
// obtient à son tour sa pénalité. Les DEUX équipes repartent d'une pénalité
// dans la même séquence, dont l'une après que l'autre a déjà été jouée.
//
//   [AVANTAGE]         [A] Avantage joue pour l'equipe A (faute de B)
//   [PENALITE]         [B] Penalite, equipe B joue rapidement et avance
//   [AVANTAGE_REVIENT] [A] Pas d'avantage : retour a la sanction pour A
//
// Mesuré avant correction : 11 séquences sur 20 matchs (0,6 par match).
test('avantage : une nouvelle sanction sifflée annule l\'avantage en cours (jamais deux pénalités contradictoires)', () => {
  let contradictions = 0;
  const exemples = [];
  for (let seed = 1; seed <= 20; seed++) {
    const m = new MatchEngine(seed, 4800);
    const journal = [];
    const logOrigine = m.log.bind(m);
    m.log = (type, equipe, texte) => {
      journal.push({ type, equipe, texte });
      return logOrigine(type, equipe, texte);
    };
    for (let t = 0; t < 4800; t += 0.2) m.tick(0.2);
    const pertinents = journal.filter((e) => /^(AVANTAGE|AVANTAGE_JOUE|AVANTAGE_REVIENT|PENALITE)$/.test(e.type));
    for (let i = 0; i < pertinents.length; i++) {
      if (pertinents[i].type !== 'AVANTAGE') continue;
      const beneficiaire = pertinents[i].equipe;
      for (let k = i + 1; k < pertinents.length; k++) {
        const e = pertinents[k];
        // Un nouvel avantage ou un avantage joué clôt proprement la séquence.
        if (e.type === 'AVANTAGE' || e.type === 'AVANTAGE_JOUE') break;
        if (e.type === 'AVANTAGE_REVIENT' && e.equipe === beneficiaire) {
          const entre = pertinents.slice(i + 1, k);
          const penaliteContraire = entre.find((x) => x.type === 'PENALITE' && x.equipe !== beneficiaire);
          if (penaliteContraire) {
            contradictions++;
            if (exemples.length < 2) {
              exemples.push(`graine ${seed} : ${pertinents[i].texte} | ${penaliteContraire.texte} | ${e.texte}`);
            }
          }
          break;
        }
      }
    }
  }
  assert.strictEqual(contradictions, 0,
    `${contradictions} séquence(s) où les DEUX équipes obtiennent une pénalité :\n  ${exemples.join('\n  ')}`);
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

// --- Remplacements planifiés (TODO_AUDIT.md P1-17, config.remplacements) :
// extension additive et strictement optionnelle du moteur — le banc de 8 du
// Mode Club était jusqu'ici jamais transmis au moteur. ---
test('remplacement planifié : s\'applique immédiatement à l\'instant prévu, ET persiste à travers les reprises de jeu suivantes', () => {
  // Important : _nouvelleManche (coup d'envoi après essai/pénalité/mi-temps)
  // RECRÉE entièrement equipeA/equipeB depuis this.cfg.joueursA/joueursB à
  // chaque reprise — l'identité de l'objet joueur n'est donc PAS garantie
  // sur tout un match (contrairement à sa position/son carton jaune, qui
  // eux sont explicitement reportés). Ce test vérifie les deux garanties
  // réellement utiles : l'effet est immédiat au moment prévu, ET il ne
  // s'efface pas à la prochaine reprise (cf. mise à jour de this.cfg dans
  // tick(), sans quoi le titulaire d'origine reviendrait sans prévenir).
  const config = {
    remplacements: [
      { equipe: 'A', numero: 10, minute: 1, joueur: { poste: 'OV', vitesse: 95, plaquage: 40, adresse: 90, melee: 40, touche: 40, puissance: 40, endurance: 40, passe: 90, jeuPied: 90, decision: 90, discipline: 90 } },
    ],
  };
  const m = new MatchEngine(55, 300, config);
  let verifieImmediat = false;
  for (let t = 0; t < 300; t += 0.1) {
    m.tick(0.1);
    // Vérifié DÈS que l'instant est franchi, pas seulement à la fin du match :
    // this.events est plafonné à 30 entrées (cf. log()) et un match de 5 min
    // en génère largement plus — l'événement REMPLACEMENT aurait le temps
    // d'être poussé hors du journal avant la fin de la boucle.
    if (!verifieImmediat && m.tempsMatch >= 60) {
      verifieImmediat = true;
      assert.ok(m.equipeA[9].vitesse > 80, 'le joueur au n°10 doit changer dès l\'instant prévu, pas seulement à la prochaine reprise');
      const evenement = m.events.find((e) => e.type === 'REMPLACEMENT');
      assert.ok(evenement, 'un événement REMPLACEMENT réel doit apparaître dans le journal du match');
      assert.ok(Math.abs(evenement.t - 60) < 1, 'l\'événement doit survenir au bon instant (minute 1 = 60s de jeu simulé)');
    }
  }
  assert.ok(verifieImmediat, 'le test doit avoir atteint la minute prévue');
  assert.strictEqual(m.cfg.joueursA[10].vitesse, 95, 'la config source doit aussi être mise à jour, sinon une reprise ultérieure ferait revenir le titulaire d\'origine');
});

test('remplacement planifié : rétrocompatibilité stricte — sans config.remplacements, comportement identique à avant', () => {
  const a = new MatchEngine(321, 300, null);
  const b = new MatchEngine(321, 300, { remplacements: [] });
  for (let t = 0; t < 300; t += 0.1) { a.tick(0.1); b.tick(0.1); }
  assert.deepStrictEqual(a.score, b.score);
  assert.strictEqual(a.equipeA[0].vitesse, b.equipeA[0].vitesse);
  assert.strictEqual(a.events.length, b.events.length);
});

test('remplacement planifié : un remplacement prévu APRÈS la fin du match choisi ne se produit jamais', () => {
  const config = { remplacements: [{ equipe: 'B', numero: 5, minute: 50, joueur: { poste: '2L', vitesse: 99, plaquage: 99, adresse: 60, melee: 90, touche: 90, puissance: 90, endurance: 60, passe: 60, jeuPied: 60, decision: 60, discipline: 60 } }] };
  const m = new MatchEngine(9, 300, config); // 300s = 5 min, la minute 50 (3000s) n'arrivera jamais
  for (let t = 0; t < 300; t += 0.1) m.tick(0.1);
  // Note : m.equipeB[4].vitesse n'est PAS un bon témoin ici — même sans
  // remplacement, ce champ fluctue naturellement à chaque reprise de jeu
  // (bruit RNG réappliqué à toute l'équipe, cf. _nouvelleManche). Les vrais
  // témoins d'un remplacement qui ne s'est jamais produit : le flag interne,
  // la config source (jamais touchée) et l'absence d'événement.
  assert.strictEqual(m._remplacements[0].applique, false, 'un remplacement dont l\'instant dépasse la durée du match ne doit jamais s\'appliquer');
  assert.ok(!(m.cfg.joueursB && m.cfg.joueursB[5] && m.cfg.joueursB[5].vitesse === 99), 'la config source ne doit pas non plus être modifiée');
  assert.ok(!m.events.some((e) => e.type === 'REMPLACEMENT'), 'aucun événement de remplacement ne doit être généré');
});

// --- P0-1 : le RYTHME du jeu courant ---------------------------------------
// Un joueur de rugby ne passe pas de l'arret a sa vitesse maximale en un
// dixieme de seconde : il ACCELERE. Sans cette inertie, tout le monde surgit
// a pleine vitesse des le premier tick apres un regroupement, le defenseur
// fond sur le porteur en ~0,5 s, et le match enchaine 3x trop de phases
// (mesure : 542 sequences de jeu courant par match, 407 rucks, contre ~150
// dans un vrai match).
test('un joueur ACCELERE : il ne part pas a pleine vitesse des le premier dixieme de seconde', () => {
  const m = new MatchEngine(4242, 600);
  const dt = 0.1;
  // On cherche un joueur reellement a l'arret (fin de regroupement) puis on
  // mesure ce qu'il parcourt pendant les instants qui suivent.
  let mesure = null;
  let precedent = new Map();
  for (let t = 0; t < 600 && !mesure; t += dt) {
    m.tick(dt);
    const s = m.getState();
    for (const j of [...s.equipeA, ...s.equipeB]) {
      const cle = `${j.team}${j.numero}`;
      const p = precedent.get(cle);
      precedent.set(cle, { x: j.x, y: j.y });
      if (!p) continue;
      const pas = Math.hypot(j.x - p.x, j.y - p.y);
      // Un joueur qui vient de demarrer (pas precedent quasi nul) ne peut pas
      // deja couvrir la distance d'un joueur lance (vitesseMs >= 3 m/s, soit
      // >= 0,30 m par dixieme de seconde).
      const pasPrecedent = p.pas || 0;
      if (pasPrecedent < 0.02 && pas > 0.02) mesure = { pas, cle };
      p.pas = pas;
      precedent.set(cle, { x: j.x, y: j.y, pas });
    }
  }
  assert.ok(mesure, 'aucun demarrage observe en 10 minutes de jeu');
  assert.ok(mesure.pas < 0.20,
    `un joueur qui demarre de l'arret ne doit pas couvrir ${mesure.pas.toFixed(3)} m en 0,1 s (ce serait ${(mesure.pas * 10).toFixed(1)} m/s instantanes)`);
});

test('le jeu courant RESPIRE : une sequence ballon en main dure en moyenne plus de 5,5 s', () => {
  // Reference reelle, calculee : un match international compte ~35 min de
  // ballon en jeu (2100 s) pour ~150 regroupements. Le regroupement lui-meme
  // consomme ~3,5 s (ballon au sol -> ballon sorti), les coups de pied, mauls
  // et coups d'envoi ~7 min. Il reste donc ~7 s par sequence de jeu courant :
  // course du 9, lancement de la ligne, deux ou trois passes, PLAQUAGE (le
  // porteur est tenu, porte, mis au sol, il presente le ballon), puis
  // regroupement. Une moyenne sous 5,5 s signifie que le contact tombe trop
  // vite : c'est ce qui gonfle mecaniquement rucks, passes, courses et
  // plaquages, tous mesures a 2 ou 3 fois leur volume reel.
  const durees = [];
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const m = new MatchEngine(seed, 2400);
    let phasePrecedente = null, debut = 0;
    for (let t = 0; t < 2400; t += 0.2) {
      m.tick(0.2);
      if (m.phase !== phasePrecedente) {
        if (phasePrecedente === 'PORTE') durees.push(m.tempsMatch - debut);
        if (m.phase === 'PORTE') debut = m.tempsMatch;
        phasePrecedente = m.phase;
      }
    }
  }
  assert.ok(durees.length > 100, 'echantillon de sequences trop petit');
  const moyenne = durees.reduce((a, b) => a + b, 0) / durees.length;
  // SEUIL DE NON-REGRESSION, pas la cible. Mesure au fil du travail : 2,20 s
  // au depart, 4,10 s aujourd'hui (inertie de course, vol du ballon, ligne
  // d'avantage). La cible reelle calculee ci-dessus reste ~7 s : le moteur
  // n'y est PAS. Ce seuil garde l'acquis (aucune modification ne doit
  // reraccourcir la sequence) sans faire croire que la cible est atteinte.
  assert.ok(moyenne > 3.8,
    `une sequence de jeu courant dure en moyenne ${moyenne.toFixed(2)} s : le contact tombe trop vite apres la sortie du ballon (cible reelle ~7 s)`);
});


// --- Loi 11 : L'ARBITRE SAIT RECONNAITRE UNE PASSE EN AVANT ----------------
// Enonce direct de la loi, pas une statistique de match. Sans ce test, la
// sanction de la passe en avant pouvait etre PUREMENT ET SIMPLEMENT
// SUPPRIMEE du moteur sans qu'aucune suite ne devienne rouge : verifie par
// mutation (Referee.passeEnAvant remplace par `return false`), seul un test
// de rythme sans rapport reagissait, par ricochet. Le test « loi 11 » qui
// suit ne posait, lui, qu'une borne HAUTE — satisfaite a zero passe en avant.
// CLAUDE.md (role 5) est explicite : « refuser le patch si les passes vers
// l'avant ne sont jamais sanctionnees ».
test('loi 11 : l arbitre reconnait une passe en avant, dans les deux sens de jeu', () => {
  assert.strictEqual(typeof Referee.passeEnAvant, 'function',
    'le moteur doit exposer la regle de la passe en avant');
  // Equipe qui attaque vers les x croissants.
  assert.strictEqual(Referee.passeEnAvant(1, { x: 50, y: 30 }, { x: 53, y: 34 }), true,
    'une passe a un partenaire situe 3 m DEVANT est en avant');
  assert.strictEqual(Referee.passeEnAvant(1, { x: 50, y: 30 }, { x: 47, y: 34 }), false,
    'une passe a un partenaire situe 3 m DERRIERE est legale');
  assert.strictEqual(Referee.passeEnAvant(1, { x: 50, y: 30 }, { x: 50, y: 38 }), false,
    'une passe strictement laterale est legale');
  // Equipe qui attaque vers les x decroissants : la regle doit s'inverser.
  assert.strictEqual(Referee.passeEnAvant(-1, { x: 50, y: 30 }, { x: 47, y: 34 }), true,
    'dans l autre sens de jeu, 3 m vers les x decroissants est EN AVANT');
  assert.strictEqual(Referee.passeEnAvant(-1, { x: 50, y: 30 }, { x: 53, y: 34 }), false,
    'dans l autre sens de jeu, 3 m vers les x croissants est legal');
});

// --- Lois 11/12 : la faute de main REALISTE --------------------------------
// Mesure sur 10 matchs avant correction : 11,2 passes en AVANT par match pour
// seulement 2,6 en-avants au contact et 2,6 passes lachees. C'est l'inverse
// d'un vrai match (1 a 3 passes en avant, 10 a 15 fautes de main au total).
// Cause : quand aucune option LEGALE (a hauteur ou en retrait) n'existait, le
// moteur passait quand meme au premier partenaire venu, forcement en avant.
// Un joueur ne fait pas ca : il garde le ballon et va au contact.
test('loi 11 : un joueur sans solution legale GARDE le ballon (pas 11 passes en avant par match)', () => {
  // 8 graines : sur 5 matchs, le nombre de fautes de main varie de +/- 2 d'un
  // echantillon a l'autre et le test devenait instable (la mesure de reference
  // reste server/simulate-batch.js sur 50 matchs).
  const GRAINES = [1, 2, 3, 4, 5, 6, 7, 8];
  let passesAvant = 0, fautesDeMain = 0;
  for (const seed of GRAINES) {
    const m = new MatchEngine(seed, 4800);
    const brut = m.log.bind(m);
    m.log = (type, team, msg) => { if (type === 'MELEE_AVANT') passesAvant++; brut(type, team, msg); };
    for (let t = 0; t < 4800; t += 0.2) m.tick(0.2);
    const s = m.getState();
    fautesDeMain += s.stats.A.knockOns + s.stats.B.knockOns;
  }
  const avantParMatch = passesAvant / GRAINES.length;
  const mainParMatch = fautesDeMain / GRAINES.length;
  // BORNE HAUTE **ET** BASSE. La borne haute seule etait satisfaite a zero :
  // supprimer la sanction rendait ce test plus vert que jamais.
  // La borne basse est fixee a ce que le moteur produit REELLEMENT (0,4 par
  // match) et non a la valeur reelle (1 a 3) : monter le taux de maladresse
  // pour s'en approcher remplace des touches par des melees et fait retomber
  // le moteur de 13/14 a 11/14 categories realistes (mesure). L'ecart est
  // assume et documente dans le moteur ; ce que ce test garde, c'est que la
  // sanction ne DISPARAISSE pas.
  assert.ok(avantParMatch >= 0.2,
    `une passe en avant doit encore etre SANCTIONNEE (mesuré ${avantParMatch.toFixed(1)} par match)`);
  assert.ok(avantParMatch <= 4,
    `une passe en avant reste une FAUTE RARE (mesuré ${avantParMatch.toFixed(1)} par match)`);
  assert.ok(mainParMatch >= 8,
    `un match produit 10 à 15 fautes de main (en-avant au contact, passe lâchée) : mesuré ${mainParMatch.toFixed(1)}`);
});



// --- Loi 16 : UN MAUL SE TERMINE TOUJOURS ---------------------------------
// Trouve par MUTATION : en retirant la date-limite du « use it » d'un maul
// arrete (timerUseIt porte a l'infini), AUCUNE suite ne devenait rouge.
// L'enquete a montre un trou plus large. Le moteur garantit explicitement
// qu'un RUCK se termine et qu'une MELEE se termine — les deux ont leur
// garde-fou anti-blocage et leur test ci-dessus. Le MAUL, lui, n'avait ni
// l'un ni l'autre : sa sortie ne dependait que du hasard. Mesure sur 10
// matchs : duree moyenne 15,5 s mais un maul observe a 64,8 s, et en figeant
// le tirage aleatoire le maul ne se termine JAMAIS.
// C'est a la fois un blocage latent (CLAUDE.md role 7 : « les joueurs restent
// bloques » est un motif de refus) et une invraisemblance : un arbitre ne
// laisse pas un maul vivre une minute.
test('loi 16 : un maul se termine toujours, meme si le hasard ne le denoue jamais', () => {
  let verifie = false;
  for (const seed of [5, 12, 33]) {
    const m = new MatchEngine(seed, 900);
    for (let t = 0; t < 900; t += 0.1) {
      m.tick(0.1);
      if (m.phase === 'PORTE' && m.porteur && !m.passeVisuelle && m.porteur.auSol === 0) break;
    }
    if (m.phase !== 'PORTE' || !m.porteur) continue;
    const def = m.defenseurs().filter((j) => j.auSol === 0)[0];
    if (!def) continue;
    m._formerMaul(m.porteur, def);
    if (m.phase !== 'MAUL') continue;
    // On FIGE le hasard : plus aucune sortie de ballon tiree au sort. Seule
    // une regle peut encore mettre fin au maul.
    m.rng = () => 0.999;
    const depart = m.tempsMatch;
    let duree = null;
    for (let k = 0; k < 1200 && m.phase === 'MAUL'; k++) m.tick(0.1);
    if (m.phase !== 'MAUL') duree = m.tempsMatch - depart;
    assert.ok(duree !== null,
      `un maul doit finir par etre siffle : toujours en cours apres ${(m.tempsMatch - depart).toFixed(0)} s de jeu`);
    // Le garde-fou du moteur siffle a 45 s ; on borne juste au-dessus. Mesure
    // sur 50 mauls de match reel : moyenne 14,8 s, maximum 45,0 s (contre
    // 64,8 s avant le garde-fou), et il ne se declenche que 2 fois sur 50 —
    // il borne le cas pathologique sans changer le jeu ordinaire.
    assert.ok(duree <= 50,
      `un maul ne dure pas ${duree.toFixed(0)} s : l'arbitre le siffle bien avant`);
    verifie = true;
    break;
  }
  assert.ok(verifie, 'aucun maul n a pu etre forme pour le test');
});

// --- Loi 19 : LE BALLON PORTE EN TOUCHE SORT ------------------------------
// Trouve par MUTATION : en supprimant le controle de sortie en touche du
// PORTEUR, aucune suite ne devenait rouge. La raison etait double, et les deux
// moities sont instructives.
//
// 1) Les deux voies de sortie — le porteur qui franchit la ligne et le coup de
//    pied qui trouve la touche — ecrivaient EXACTEMENT le meme evenement
//    (« Ballon porte en touche »), y compris sur un degagement. Impossible de
//    les distinguer, donc impossible de voir l'une disparaitre. Le fil du match
//    mentait d'ailleurs au joueur. Corrige : `_accorderTouche` prend desormais
//    la cause et libelle les deux differemment.
//
// 2) Une fois les deux separees, la mesure est sans appel : le moteur produit
//    0,0 ballon porte en touche par match — TOUTES les touches viennent du jeu
//    au pied. Le porteur n'est jamais plaque a moins de 6,18 m d'une ligne de
//    touche : les six derniers metres de chaque cote, soit 17 % de la largeur
//    du terrain, ne servent JAMAIS. C'est un vrai defaut de jeu, pas un detail
//    de test, et il n'est PAS corrige ici (l'ouvrir demande de revoir le jeu au
//    large, avec un risque reel sur l'equilibre du moteur).
//
// Ce test verifie donc la REGLE sur un cas construit, pas sa frequence : un
// plaquage au ras de la ligne de touche doit envoyer le ballon dehors.
test('loi 19 : un plaquage au ras de la ligne de touche envoie le ballon dehors', () => {
  let verifie = false;
  for (const seed of [3, 11, 27, 42]) {
    const m = new MatchEngine(seed, 900);
    // On amene le match en jeu courant, ballon en main, sans passe en vol.
    for (let t = 0; t < 900; t += 0.1) {
      m.tick(0.1);
      if (m.phase === 'PORTE' && m.porteur && !m.passeVisuelle && m.porteur.auSol === 0) break;
    }
    if (m.phase !== 'PORTE' || !m.porteur) continue;
    const equipeQuiPorte = m.possession;
    // Le porteur est colle a la ligne de touche, un defenseur sur lui.
    m.porteur.y = 0.8;
    const def = m.defenseurs().filter((j) => j.auSol === 0 && j.ruckRecovery <= 0 && !(j.horsJeuKick > 0));
    if (def.length === 0) continue;
    def[0].x = m.porteur.x + m.porteur.sensAttaque * 0.5;
    def[0].y = 0.8;
    def[0].missCooldown = 0; def[0].fixeCooldown = 0;
    // Plusieurs ticks : le plaquage n'est pas certain du premier coup (il peut
    // etre manque), mais la touche doit finir par arriver.
    for (let k = 0; k < 30 && m.phase === 'PORTE'; k++) {
      m.porteur.y = Math.min(m.porteur.y, 1.2);
      def[0].y = m.porteur.y; def[0].x = m.porteur.x + m.porteur.sensAttaque * 0.5;
      m.tick(0.1);
    }
    if (m.phase === 'TOUCHE') {
      assert.strictEqual(m.possession, equipeQuiPorte === 'A' ? 'B' : 'A',
        'la touche revient a l adversaire de l equipe qui porte le ballon dehors');
      verifie = true;
      break;
    }
  }
  assert.ok(verifie,
    'un plaquage au ras de la ligne de touche doit produire une touche pour l adversaire');
});

// --- Loi 15 : LE HORS-JEU AU RUCK ------------------------------------------
// Trouve par MUTATION, exactement comme ci-dessus : en faisant renvoyer `false`
// a `Referee.horsJeuRuck` — plus aucun hors-jeu au regroupement — les quatre
// suites restaient VERTES. Un defenseur pouvait donc franchir le regroupement
// et cueillir le porteur a la sortie sans que rien ne le sanctionne.
// CLAUDE.md (role 5) : « les hors-jeu doivent exister autour des rucks ».
test('loi 15 : l arbitre reconnait un defenseur hors-jeu au regroupement', () => {
  assert.strictEqual(typeof Referee.horsJeuRuck, 'function',
    'le moteur doit exposer la regle du hors-jeu au ruck');
  const pt = { x: 50, y: 35 };
  // L'equipe en possession attaque vers les x croissants : la ligne de
  // hors-jeu du defenseur passe par le point de regroupement, il doit rester
  // du cote de SON en-but (x > 50).
  assert.strictEqual(Referee.horsJeuRuck({ x: 46, y: 35 }, pt, 1), true,
    'un defenseur 4 m au-dela du regroupement est hors-jeu');
  assert.strictEqual(Referee.horsJeuRuck({ x: 54, y: 35 }, pt, 1), false,
    'un defenseur 4 m en retrait du regroupement est en jeu');
  // Sens de jeu inverse : la regle doit s'inverser aussi.
  assert.strictEqual(Referee.horsJeuRuck({ x: 54, y: 35 }, pt, -1), true,
    'dans l autre sens de jeu, 4 m au-dela est hors-jeu');
  assert.strictEqual(Referee.horsJeuRuck({ x: 46, y: 35 }, pt, -1), false,
    'dans l autre sens de jeu, 4 m en retrait est en jeu');
});

test('loi 15 : le hors-jeu au regroupement a une CONSEQUENCE en match', () => {
  // La loi doit vivre dans le match, pas seulement dans l'arbitre : un
  // hors-jeu au ruck ouvre un AVANTAGE (loi 7) pour l'equipe en possession.
  const GRAINES = [1, 2, 3];
  let avantages = 0;
  for (const seed of GRAINES) {
    const m = new MatchEngine(seed, 4800);
    const brut = m.log.bind(m);
    m.log = (type, team, msg) => { if (type === 'AVANTAGE') avantages++; brut(type, team, msg); };
    for (let t = 0; t < 4800; t += 0.2) m.tick(0.2);
  }
  const parMatch = avantages / GRAINES.length;
  assert.ok(parMatch >= 8,
    `les fautes doivent ouvrir des avantages (mesuré ${parMatch.toFixed(1)} par match)`);
});

// --- Le TEMPS MORT du rugby ------------------------------------------------
// Un match de 80 minutes ne contient que ~35 min de ballon en jeu. Le reste,
// ce sont les arrets, et les deux plus gros postes sont la MELEE et la TOUCHE :
// les paquets marchent jusqu'a la marque, s'alignent, se lient, l'arbitre
// annonce. De l'octroi a la sortie du ballon, une melee prend 60 a 90 s et une
// touche 40 a 60 s. Les expedier plus vite ne fait pas gagner du spectacle :
// ca multiplie mecaniquement les possessions, donc les rucks, les passes et
// les courses, tous mesures a 1,5-2 fois leur volume reel.
test('les temps morts durent ce qu ils durent : melee >= 45 s, touche >= 35 s', () => {
  const GRAINES = [1, 2, 3];
  const melees = [], touches = [];
  for (const seed of GRAINES) {
    const m = new MatchEngine(seed, 4800);
    let phase = null, debut = 0;
    for (let t = 0; t < 4800; t += 0.2) {
      m.tick(0.2);
      if (m.phase !== phase) {
        if (phase === 'MELEE') melees.push(m.tempsMatch - debut);
        if (phase === 'TOUCHE') touches.push(m.tempsMatch - debut);
        debut = m.tempsMatch;
        phase = m.phase;
      }
    }
  }
  assert.ok(melees.length > 20 && touches.length > 30, 'echantillon trop petit');
  const moy = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const mMelee = moy(melees), mTouche = moy(touches);
  assert.ok(mMelee >= 45, `une melee dure 60 a 90 s en vrai (mesuré ${mMelee.toFixed(1)} s)`);
  assert.ok(mTouche >= 35, `une touche dure 40 a 60 s en vrai (mesuré ${mTouche.toFixed(1)} s)`);
});

// --- LA LIGNE D'AVANTAGE ---------------------------------------------------
// Mesure avant correction : d'un regroupement au suivant, le ballon RECULE de
// 0,53 m en moyenne (mediane -1,05 m). Autrement dit l'attaque ne franchit
// JAMAIS la ligne d'avantage : elle recycle sur place. Consequence directe et
// mesuree : seulement 10 entrees dans les 22 adverses par match (un vrai match
// en compte une vingtaine, les deux equipes cumulees), donc presque aucun
// essai construit — les 3,7 essais du moteur naissent tous d'un jeu casse.
// C'est aussi ce qui fabrique le volume : sans avancee, une possession
// enchaine 10 temps de jeu au meme endroit au lieu de finir en essai, en coup
// de pied ou en penalite.
test('l attaque FRANCHIT la ligne d avantage : le ballon avance d un temps de jeu au suivant', () => {
  // 8 graines : sur 3 matchs l'avancee moyenne varie de +/- 0,5 m.
  const avancees = [];
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const m = new MatchEngine(seed, 4800);
    let precedent = null, sens = 1, phase = null;
    for (let t = 0; t < 4800; t += 0.2) {
      const avant = m.phase;
      m.tick(0.2);
      if (m.phase === 'RUCK' && avant !== 'RUCK') {
        if (precedent !== null) avancees.push((m.ruckPoint.x - precedent) * sens);
        precedent = m.ruckPoint.x;
        sens = m.porteur ? m.porteur.sensAttaque : 1;
      } else if (m.phase !== 'RUCK' && m.phase !== 'PORTE') {
        precedent = null; // nouvelle sequence (melee, touche, coup de pied) : on ne compare pas
      }
      phase = m.phase;
    }
  }
  assert.ok(avancees.length > 300, 'echantillon trop petit');
  const moyenne = avancees.reduce((a, b) => a + b, 0) / avancees.length;
  // SEUIL DE NON-REGRESSION : ce qui compte ici, c'est le SIGNE. Le ballon
  // reculait de 0,53 m par temps de jeu ; il avance desormais. La cible reelle
  // est +1 a +2 m et n'est PAS atteinte (mesure : +0,20 m) — mais une avancee
  // negative serait la reapparition du defaut, et c'est ce que ce test garde.
  assert.ok(moyenne > 0,
    `d'un regroupement au suivant, le ballon avance de ${moyenne.toFixed(2)} m : l'attaque ne franchit pas la ligne d'avantage (cible reelle +1 a +2 m)`);
});

// --- LE FRANCHISSEMENT DOIT PAYER ------------------------------------------
// Mesure avant correction : un franchissement (le porteur bat son vis-a-vis ET
// se retrouve en espace) ne rapporte que 6,5 m dans les 6 s qui suivent, et ne
// se transforme en essai que dans 1 % des cas. Dans un vrai match, une percee
// nette avance de 15 a 25 m et finit a l'essai une fois sur quatre ou cinq.
// C'est LE verrou du moteur : il marque 1,8 essai pour 100 regroupements quand
// un vrai match en marque 3,3. Tant qu'une percee ne paie pas, la seule facon
// de marquer est d'enchainer les temps de jeu — d'ou des volumes de rucks, de
// passes et de courses tres au-dessus du reel.
test('un franchissement PAIE : le porteur qui bat son vis-a-vis gagne du terrain', () => {
  // 8 graines : un match ne produit qu'une dizaine de franchissements, 5 matchs
  // ne suffisaient pas a stabiliser la moyenne (ni meme a atteindre la taille
  // d'echantillon minimale).
  const gains = [];
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const m = new MatchEngine(seed, 4800);
    let suivi = null;
    for (let t = 0; t < 4800; t += 0.2) {
      const avant = m.stats.A.franchissements + m.stats.B.franchissements;
      m.tick(0.2);
      const apres = m.stats.A.franchissements + m.stats.B.franchissements;
      if (apres > avant && m.porteur) {
        suivi = { x0: m.porteur.x, sens: m.porteur.sensAttaque, t0: m.tempsMatch, eq: m.possession };
      } else if (suivi && (m.tempsMatch - suivi.t0 >= 6 || m.phase === 'ESSAI' || m.possession !== suivi.eq)) {
        gains.push(m.porteur ? (m.porteur.x - suivi.x0) * suivi.sens : 0);
        suivi = null;
      }
    }
  }
  assert.ok(gains.length > 30, `echantillon trop petit (${gains.length})`);
  const moyenne = gains.reduce((a, b) => a + b, 0) / gains.length;
  // Mesure : 7,6 m quand un defenseur elimine repartait a pleine vitesse,
  // 17,3 m aujourd'hui — dans la fourchette reelle (15 a 25 m).
  assert.ok(moyenne >= 12,
    `apres un franchissement, l'attaque n'avance que de ${moyenne.toFixed(1)} m en 6 s : la percee ne paie pas (reference reelle 15-25 m)`);
});

// --- Loi 14 : LE PLAQUAGE PREND DU TEMPS -----------------------------------
// Entre le contact et le moment ou le ballon est jouable au sol, il se passe
// un vrai temps de jeu : le plaqueur tient le porteur, l'amene au sol, le
// porteur se retourne et PRESENTE le ballon. Un regroupement complet, du
// plaquage au ballon sorti, dure 5 a 6 s dans un vrai match (dont ~3,5 s de
// recyclage proprement dit, cf. cfg.ruck.profil et server/test-ruck.js).
// Le moteur enchainait plaquage et recyclage dans le meme dixieme de seconde :
// l'horloge du regroupement demarrait alors que personne n'avait encore rien
// fait, et le match jouait ~200 regroupements par match au lieu de 110-180.
test('loi 14 : du plaquage au ballon sorti, un regroupement dure plus de 4,5 s', () => {
  const durees = [];
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const m = new MatchEngine(seed, 4800);
    let debut = null;
    for (let t = 0; t < 4800; t += 0.2) {
      const avant = m.phase;
      m.tick(0.2);
      if (m.phase === 'RUCK' && avant !== 'RUCK') debut = m.tempsMatch;
      else if (avant === 'RUCK' && m.phase !== 'RUCK' && debut !== null) {
        durees.push(m.tempsMatch - debut);
        debut = null;
      }
    }
  }
  assert.ok(durees.length > 200, `echantillon trop petit (${durees.length})`);
  const moyenne = durees.reduce((a, b) => a + b, 0) / durees.length;
  // SEUIL DE NON-REGRESSION, pas la cible. Mesure : 3,08 s quand le plaquage
  // ne coutait rien, 3,7 s aujourd'hui. La cible reelle reste 5-6 s, et elle
  // n'est PAS atteinte : au-dela de 0,6 s de temps de plaquage, la defense se
  // replace parfaitement derriere chaque regroupement et le ballon se remet a
  // RECULER d'un temps de jeu au suivant (cf. DUREE_PLAQUAGE et le test de la
  // ligne d'avantage). Ce seuil garde l'acquis : le plaquage coute du temps.
  assert.ok(moyenne > 3.5,
    `un regroupement dure ${moyenne.toFixed(2)} s du plaquage au ballon sorti : le plaquage lui-meme ne coute rien (cible reelle 5-6 s)`);
});

// --- Loi 10 : HORS-JEU SUR COUP DE PIED ------------------------------------
// Au rugby, seuls les joueurs situes DERRIERE le botteur au moment du coup de
// pied peuvent chasser. Tous ceux qui sont devant sont HORS-JEU : ils doivent
// se retirer et ne peuvent ni jouer le ballon ni plaquer tant qu'ils ne sont
// pas remis en jeu (loi 10.1). Et une equipe n'envoie de toute facon pas
// quinze joueurs sur le point de chute : deux ou trois chasseurs montent, le
// reste tient sa ligne.
//
// Cette regle n'existait PAS dans le moteur. Mesure : a chaque coup de pied,
// 12,9 joueurs de l'equipe botteuse se trouvaient devant le botteur — tous
// hors-jeu — et les TRENTE joueurs des deux equipes couraient ensemble vers le
// point de chute. C'est un des hors-jeu que CLAUDE.md (role 5) demande
// explicitement de faire exister.
test('loi 10 : les joueurs devant le botteur sont hors-jeu et ne peuvent pas plaquer', () => {
  let coupsDePied = 0, marques = 0, plaquagesHorsJeu = 0, convergents = 0, receptions = 0;
  for (const seed of [1, 2, 3, 4]) {
    const m = new MatchEngine(seed, 4800);
    for (let t = 0; t < 4800; t += 0.2) {
      const phaseAvant = m.phase;
      const positions = new Map();
      for (const j of [...m.equipeA, ...m.equipeB]) positions.set(j, { x: j.x, horsJeu: j.horsJeuKick > 0 });
      const botteur = m.porteur;
      const avantTk = m.stats.A.tacklesAttempted + m.stats.B.tacklesAttempted;
      m.tick(0.2);
      // Coup de pied qui vient d'etre frappe : on compte qui est devant le
      // botteur, et on verifie que ceux-la sont bien marques hors-jeu.
      if (phaseAvant !== 'COUP_DE_PIED_JEU' && m.phase === 'COUP_DE_PIED_JEU' && botteur) {
        const equipe = botteur.team === 'A' ? m.equipeA : m.equipeB;
        const devant = equipe.filter((j) => j !== botteur && (j.x - botteur.x) * botteur.sensAttaque > 1);
        if (devant.length > 0) {
          coupsDePied++;
          if (devant.every((j) => j.horsJeuKick > 0)) marques++;
        }
      }
      // Aucun plaquage ne doit etre tente par un joueur hors-jeu.
      const apresTk = m.stats.A.tacklesAttempted + m.stats.B.tacklesAttempted;
      if (apresTk > avantTk) {
        for (const [j, p] of positions) if (p.horsJeu && j.horsJeuKick > 0 && j.team !== m.possession) {
          // le plaqueur potentiel est dans le camp qui defend ; on ne peut pas
          // l'identifier exactement, on borne par le nombre de hors-jeu proches
          // du porteur, qui doit rester nul.
          if (m.porteur && Math.hypot(j.x - m.porteur.x, j.y - m.porteur.y) < 2.2) plaquagesHorsJeu++;
        }
      }
      // Combien de joueurs sont masses autour du ballon AU MOMENT de la
      // reception : c'est la mesure qui compte pour le joueur, celle qui dit
      // si une relance est possible ou si le ballon tombe dans une melee
      // ouverte de vingt joueurs.
      if (phaseAvant === 'COUP_DE_PIED_JEU' && m.phase === 'PORTE' && m.porteur) {
        let n = 0;
        for (const j of [...m.equipeA, ...m.equipeB]) {
          if (Math.hypot(j.x - m.porteur.x, j.y - m.porteur.y) < 8) n++;
        }
        convergents += n; receptions++;
      }
    }
  }
  assert.ok(coupsDePied > 40, `echantillon trop petit (${coupsDePied})`);
  assert.strictEqual(marques, coupsDePied,
    `tout joueur devant le botteur doit etre marque hors-jeu (${marques}/${coupsDePied})`);
  assert.strictEqual(plaquagesHorsJeu, 0,
    `un joueur hors-jeu ne doit jamais se trouver en position de plaquer (${plaquagesHorsJeu} cas)`);
  // Mesure : 8,6 joueurs masses a moins de 8 m du receveur avant le correctif
  // (mediane 6, jusqu'a 29), 4,9 apres (mediane 4). Un coup de pied n'est plus
  // une melee ouverte de vingt joueurs : le receveur peut relancer.
  assert.ok(receptions > 100, `echantillon de receptions trop petit (${receptions})`);
  const masse = convergents / receptions;
  assert.ok(masse <= 6,
    `trop de joueurs masses autour du receveur d'un coup de pied (${masse.toFixed(1)} a moins de 8 m)`);
});

// --- Loi 8 : PLAQUE SUR LA LIGNE, IL APLATIT -------------------------------
// Un porteur plaque tout pres de l'en-but, et dont l'elan l'emmene malgre tout
// au-dela de la ligne, aplatit : c'est un essai. Le moteur formait au contraire
// un REGROUPEMENT DANS L'EN-BUT (mesure sur ce scenario : ruck a x=100,50 sur un
// terrain de 100 m) — la maniere la plus courante de marquer au ballon porte
// n'existait tout simplement pas. L'adversaire peut encore le tenir debout.

// Scenario construit : porteur a 40 cm de sa ligne d'en-but, UN defenseur au
// contact (les quatorze autres sont ecartes pour qu'aucun d'eux ne soit designe
// plaqueur a sa place), aucune sequence en cours.
function scenarioPlaqueSurLaLigne(seed, valeurRng) {
  const m = new MatchEngine(seed, 600);
  for (let t = 0; t < 30; t += 0.2) m.tick(0.2);
  m.phase = 'PORTE';
  m.timerPhase = 3;
  m.possession = 'A';
  m.passeVisuelle = null;
  m.combinaison = null;
  m.penaliteRecul = null;
  const porteur = m.equipeA.find((j) => j.numero === 8);
  const sens = porteur.sensAttaque;
  const ligne = sens > 0 ? LONGUEUR : 0;
  m.porteur = porteur;
  porteur.auSol = 0;
  porteur.x = ligne - sens * 0.4;
  porteur.y = 30;
  for (const j of m.equipeB) {
    j.auSol = 0; j.ruckRecovery = 0; j.horsJeuKick = 0; j.missCooldown = 0; j.fixeCooldown = 0;
    if (j.numero !== 6) { j.x = porteur.x - sens * 30; j.y = 60; }
  }
  const plaqueur = m.equipeB.find((j) => j.numero === 6);
  plaqueur.x = porteur.x + sens * 1.0;
  plaqueur.y = 30;
  m.rng = () => valeurRng;
  const scoreAvant = m.score.A;
  for (let t = 0; t < 2 && m.phase === 'PORTE'; t += 0.2) m.tick(0.2);
  return { m, sens, ligne, scoreAvant };
}

test("loi 8 : un porteur plaque dont l'elan franchit la ligne aplatit (essai)", () => {
  // 0,50 : plaquage reussi (proba >= 0,80), pas d'en-avant au contact (0,04),
  // pas de maul (0,085), et PAS tenu debout (tirage >= 0,35).
  const { m, scoreAvant } = scenarioPlaqueSurLaLigne(11, 0.5);
  assert.strictEqual(m.phase, 'ESSAI', `phase apres le plaquage sur la ligne : ${m.phase}`);
  assert.strictEqual(m.score.A - scoreAvant, 5, "l'essai doit valoir 5 points");
});

// Le pendant de la regle : TENU DEBOUT. Le ballon n'est pas aplati, le jeu
// continue — et surtout le regroupement ne se forme JAMAIS dans l'en-but.
test("loi 8 : tenu debout sur la ligne, pas d'essai et aucun regroupement dans l'en-but", () => {
  // 0,20 : plaquage reussi, pas d'en-avant, mais TENU DEBOUT (tirage < 0,35).
  const { m, sens, scoreAvant } = scenarioPlaqueSurLaLigne(11, 0.2);
  assert.notStrictEqual(m.phase, 'ESSAI', "tenu debout : pas d'essai");
  assert.strictEqual(m.score.A, scoreAvant, 'tenu debout : le score ne bouge pas');
  assert.ok(m.ruckPoint, 'un regroupement doit bien se former');
  const dansEnBut = sens > 0 ? m.ruckPoint.x >= LONGUEUR : m.ruckPoint.x <= 0;
  assert.ok(!dansEnBut, `regroupement forme DANS l'en-but (x=${m.ruckPoint.x.toFixed(2)})`);
});

// --- Le DERNIER DEFENSEUR couvre le coin ----------------------------------
// Quand le porteur a franchi la ligne de defense, l'arriere (n°15) est le seul
// homme entre le ballon et l'en-but : il doit COURIR AU POINT DE RENCONTRE, pas
// rester dans son couloir central. Mesure avant correctif, sur 20 matchs
// complets : le marqueur d'un essai recevait le ballon a 43 m de la ligne en
// mediane, 82 % des essais partaient de plus de 20 m, et les deux seuls ailiers
// marquaient 85 % des essais du match — le moteur ne produisait que des essais
// « en contre ».
test('le dernier defenseur (n°15) traverse pour couvrir un porteur qui a franchi', () => {
  const m = new MatchEngine(21, 600);
  for (let t = 0; t < 30; t += 0.2) m.tick(0.2);
  m.phase = 'PORTE';
  m.timerPhase = 3;
  m.possession = 'A';
  m.passeVisuelle = null;
  m.combinaison = null;
  m.penaliteRecul = null;
  const porteur = m.equipeA.find((j) => j.numero === 11);
  const sens = porteur.sensAttaque;
  m.porteur = porteur;
  porteur.auSol = 0;
  porteur.x = sens > 0 ? LONGUEUR - 45 : 45;
  porteur.y = 8; // lance le long de la touche
  // Toute la defense est BATTUE : plus personne devant le porteur, sauf l'arriere.
  for (const j of m.equipeB) {
    j.auSol = 0; j.horsJeuKick = 0; j.fixeCooldown = 0; j.ruckRecovery = 0;
    if (j.numero !== 15) { j.x = porteur.x - sens * 12; j.y = 35; }
  }
  const arriere = m.equipeB.find((j) => j.numero === 15);
  arriere.x = porteur.x + sens * 20;
  arriere.y = 35;
  for (let t = 0; t < 2 && m.phase === 'PORTE'; t += 0.2) m.tick(0.2);
  const ecartLateral = Math.abs(arriere.y - porteur.y);
  // Mesure sur ce scenario : 20,3 m avant correctif (il tient son couloir),
  // 15,7 m apres (il traverse). Le seuil refuse l'arriere qui ne traverse pas.
  assert.ok(ecartLateral < 18,
    `l'arriere ne traverse pas pour couvrir (ecart lateral ${ecartLateral.toFixed(1)} m)`);
});

// --- Loi 15 : LE PLAQUEUR AUSSI EST HORS-JEU ------------------------------
// La ligne de hors-jeu d'un regroupement vaut pour TOUS les defenseurs, y
// compris celui qui va plaquer. Le moteur clampait la ligne defensive mais PAS
// le plaqueur designe : il visait `porteur.x + 1,5 m` quelle que soit sa
// position et partait donc chercher le receveur EN AVANT du regroupement.
// Consequence mesuree : le contact tombait sur la ligne de depart et une equipe
// qui CONSERVE le ballon n'avancait que de 0,20 m d'un temps de jeu au suivant.
test("loi 15 : le plaqueur designe ne franchit pas la ligne de hors-jeu du regroupement", () => {
  const m = new MatchEngine(41, 600);
  for (let t = 0; t < 30; t += 0.2) m.tick(0.2);
  m.phase = 'PORTE';
  m.timerPhase = 1;
  m.possession = 'A';
  m.passeVisuelle = null;
  m.combinaison = null;
  m.penaliteRecul = null;
  const porteur = m.equipeA.find((j) => j.numero === 10);
  const sens = porteur.sensAttaque;
  m.porteur = porteur;
  porteur.auSol = 0;
  // Le porteur a recu le ballon 7 m DERRIERE le regroupement, comme un ouvreur.
  m.ruckPoint = { x: 55, y: 30, };
  porteur.x = 55 - sens * 7;
  porteur.y = 30;
  for (const j of m.equipeB) {
    j.auSol = 0; j.horsJeuKick = 0; j.fixeCooldown = 0; j.ruckRecovery = 0;
    j.x = 55 + sens * 25; j.y = 60; // tout le monde loin, sauf le plaqueur ci-dessous
  }
  // Le plaqueur designe est SUR la ligne de hors-jeu, face au porteur.
  const plaqueur = m.equipeB.find((j) => j.numero === 12);
  plaqueur.x = 55; plaqueur.y = 30;
  let franchissementMax = 0;
  for (let t = 0; t < 1.2; t += 0.2) {
    m.tick(0.2);
    if (m.phase !== 'PORTE') break;
    // De combien le plaqueur est-il passe DEVANT la ligne de hors-jeu
    // (c'est-a-dire du cote de l'attaque) ?
    const devant = (m.ruckPoint.x - plaqueur.x) * sens;
    if (devant > franchissementMax) franchissementMax = devant;
  }
  // Mesure sur ce scenario : le plaqueur franchissait la ligne de 2,44 m avant
  // le correctif (il allait cueillir l'ouvreur dans son camp), 0,00 m apres.
  assert.ok(franchissementMax < 0.5,
    `le plaqueur designe passe ${franchissementMax.toFixed(2)} m devant la ligne de hors-jeu du regroupement`);
});

// --- SORTIE DE REGROUPEMENT : la defense ne repart pas a QUINZE ------------
// Un joueur qui vient d'etre engage dans un ruck est au sol ou en train de se
// relever : il n'est pas dans le rideau defensif du temps de jeu suivant.
// AVANT, ruckRecovery ne faisait qu'une chose — empecher ce joueur d'etre
// DESIGNE plaqueur. Il continuait a tenir sa place dans la ligne et a GLISSER
// vers le ballon comme n'importe quel defenseur frais : la defense repartait a
// quinze a chaque temps de jeu et le ballon rapide ne payait pas.
test("un defenseur qui sort du regroupement ne glisse pas vers le ballon", () => {
  const m = new MatchEngine(31, 600);
  for (let t = 0; t < 30; t += 0.2) m.tick(0.2);
  m.phase = 'PORTE';
  m.timerPhase = 1;
  m.possession = 'A';
  m.passeVisuelle = null;
  m.combinaison = null;
  m.penaliteRecul = null;
  const porteur = m.equipeA.find((j) => j.numero === 12);
  m.porteur = porteur;
  porteur.auSol = 0;
  porteur.x = 50;
  porteur.y = 20;
  m.ruckPoint = { x: 55, y: 20 };
  for (const j of m.equipeB) { j.auSol = 0; j.horsJeuKick = 0; j.fixeCooldown = 0; j.ruckRecovery = 0; }
  // Quatre defenseurs viennent de sortir du regroupement, places au large.
  const sortants = m.equipeB.filter((j) => [1, 2, 3, 4].includes(j.numero));
  for (const j of sortants) {
    j.ruckRecovery = 4; // valeur reelle posee par _imposerRecuperationRuck
    j.x = m.ruckPoint.x;
    j.y = 55; // tres loin du porteur (y = 20)
  }
  const yAvant = sortants.map((j) => j.y);
  for (let t = 0; t < 1; t += 0.2) m.tick(0.2);
  // Glissement MOYEN SIGNE vers le ballon (le porteur est a y = 20, eux a
  // y = 55) : c'est le glissement defensif, pas le bruit de replacement.
  const glissement = sortants.reduce((a, j, i) => a + (yAvant[i] - j.y), 0) / sortants.length;
  // Mesure sur ce scenario, en 1 s : 1,79 m de glissement vers le ballon avant
  // le correctif, 0,00 m apres. Un joueur qui se releve ne defend pas la largeur.
  assert.ok(glissement < 0.5,
    `un defenseur en sortie de regroupement glisse encore de ${glissement.toFixed(2)} m vers le ballon`);
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
if (process.exitCode) {
  console.error('ECHEC : au moins un invariant violé.');
} else {
  console.log('OK : tous les invariants respectés.');
}
