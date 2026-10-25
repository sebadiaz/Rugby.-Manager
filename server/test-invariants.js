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
    // SCRUM (P2-64) : ballon au sol sous le pack pendant la mêlée.
    assert.ok(['CARRIED', 'AIR', 'LOOSE', 'RUCK', 'MAUL', 'OUT', 'SCRUM'].includes(s.ball.state), `état de balle invalide : ${s.ball.state}`);
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
  // P2-64 : la mêlée se termine désormais par une SÉQUENCE PHYSIQUE de vrai
  // jeu (introduction 0,8 s, ballon roulé sous le pack 2 à 4 s, base ~1 s),
  // qui n'est pas comprimée comme les temps morts sur ce format court.
  // Mesuré sur 2 x 40 graines : médiane 11,9 -> 14,2 s, maximum 15,0 ->
  // 18,3 / 19,2 s (une seule reformation). Plafond porté à 24 s : il garde
  // ce qu'il protège, une mêlée qui ne finirait jamais.
  assert.ok(globalMax < 24, `une mêlée est restée bloquée ${globalMax.toFixed(1)}s (devrait toujours se résoudre sous ~24s)`);
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

test('le jeu courant RESPIRE : la sequence ballon vivant reste dans la fourchette reelle (2,8 a 3,7 s)', () => {
  // CIBLE REELLE, RECALCULEE (P2-53). La premiere version visait ~7 s : elle
  // divisait le temps de jeu par ~150 regroupements seulement. Or une
  // sequence de jeu courant commence a CHAQUE remise en mouvement du ballon :
  // sortie de ruck, reception de coup de pied, touche ou melee gagnee, coup
  // d'envoi. Avec les chiffres reels du depot (docs/ANALYSE_MATCH_REEL.md,
  // France-Irlande 2026) :
  //   ballon en jeu ~35 min = 2100 s ;
  //   181 rucks x 3 a 4 s (profil reel 55/33/12 % -> 3,57 s en moyenne) ;
  //   78 coups de pied x 2,5 a 4 s (frappe -> reception) ;
  //   mauls ~90 s, coups d'envoi ~14 x 8 s ;
  //   sequences : 181 + 78 + ~38 phases statiques + ~14 coups d'envoi = ~311.
  // Reste 860 a 1160 s de jeu courant, soit 2,8 a 3,7 s par sequence (~3,3 s
  // au milieu). Le meme calcul sur le moteur donne un cycle ruck-a-ruck de
  // 10,5 s contre 11,6 s en reel : la duree des sequences n'est PAS le
  // defaut qu'on croyait.
  //
  // CE TEST MESURAIT AUSSI DU TEMPS MORT (P2-49). La mise en place d'un jeu
  // rapide sur penalite (l'arbitre siffle, les fautifs reculent, le ballon
  // n'est PAS en jeu) se deroule DANS la phase PORTE. La sequence est comptee
  // a partir du moment ou le ballon est vivant (coup de pied tape, pas
  // sifflet).
  //
  // SEQUENCES NEES D'UN RUCK SEULEMENT (P2-94). La moyenne de TOUTES les
  // sequences depend de la part de chandelles : sur un box kick dispute, le
  // receveur est plaque en ~0,4 s (un chasseur a moins de 0,5 m dans 100 %
  // des cas, comme en vrai), et ces sequences tirent la moyenne vers le bas
  // des que le match a plus de jeu au pied. Avec les touches a 30 s, la
  // moyenne generale passait de 2,80-3,02 s a 2,73-2,89 s sans que le jeu
  // apres un ruck ait change (3,00 / 2,97 s). On mesure donc ce que le test
  // veut garder : la respiration du jeu entre deux rucks. Graines 1-12.
  const durees = [], apresRuck = [];
  for (let seed = 1; seed <= 12; seed++) {
    const m = new MatchEngine(seed, 2400);
    let phasePrecedente = null, debutVivant = null, origine = null;
    for (let t = 0; t < 2400; t += 0.2) {
      m.tick(0.2);
      if (m.phase === 'PORTE' && !m.penaliteRecul && debutVivant === null) debutVivant = m.tempsMatch;
      if (m.phase !== phasePrecedente) {
        if (phasePrecedente === 'PORTE' && debutVivant !== null) {
          durees.push(m.tempsMatch - debutVivant);
          if (origine === 'RUCK') apresRuck.push(m.tempsMatch - debutVivant);
        }
        if (m.phase === 'PORTE') { debutVivant = m.penaliteRecul ? null : m.tempsMatch; origine = phasePrecedente; }
        phasePrecedente = m.phase;
      }
    }
  }
  assert.ok(apresRuck.length > 500, 'echantillon de sequences trop petit');
  const moyenneGenerale = durees.reduce((a, b) => a + b, 0) / durees.length;
  const moyenne = apresRuck.reduce((a, b) => a + b, 0) / apresRuck.length;
  // Seuil = borne basse de la fourchette reelle. Moteur au moment de l'ecrire :
  // 3,49 s (graines 1-6), 3,51 s (7-12). Mutant verifie : sans inertie de
  // course (ACCELERATION x10), le contact tombe en 2,62 s et le test rougit.
  // Une defense sans rampe de montee donne 3,10 s : c'est encore du rugby
  // reel, ce n'est plus une regression.
  // Seuil 2,8 -> 2,75 (P2-64) : la borne basse CALCULEE ci-dessus est 2,77 s
  // (ruck 4 s, coup de pied 4 s) ; 2,8 en etait l'arrondi. La passe du 8 au 9
  // a la sortie de melee, que le 9 ne recoit plus (il ramasse a la base),
  // ajoutait ~0,1 s a la sequence suivante : 2,79-2,83 s mesures sur quatre
  // jeux de graines. Le mutant sans inertie reste rouge (2,62 s).
  // Apres un ruck (P2-94) : moteur 3,00 / 2,97 s (graines 1-6 / 7-12), mutant
  // sans inertie de course 2,57 / 2,34 s -> rouge.
  assert.ok(moyenne > 2.8,
    `apres un ruck, une sequence de jeu courant dure en moyenne ${moyenne.toFixed(2)} s ballon vivant : le contact tombe trop vite apres la sortie du ballon (fourchette reelle 2,8 a 3,7 s)`);
  assert.ok(moyenneGenerale < 4.5,
    `une sequence de jeu courant dure en moyenne ${moyenneGenerale.toFixed(2)} s ballon vivant : les porteurs courent sans jamais etre plaques (fourchette reelle 2,8 a 3,7 s)`);
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
  // 60 graines, et non 8. Le nombre de fautes de main a un ecart-type de 2,90
  // PAR MATCH (mesure sur 60 matchs, moyenne 8,87) : 8 matchs ne le situent
  // donc qu'a +/-2,01 pres, pour un plancher a 8, c'est-a-dire une marge de
  // 0,87. Le test etait un tirage a pile ou face, et il est effectivement
  // tombe au rouge a 7,63 sur un changement de moteur qui ne touchait pas les
  // fautes de main (le grattage au ruck : passes -5,7 +/- 9,1 sur 300 matchs
  // apparies, non etabli). Son predecesseur etait passe de 5 a 8 graines pour
  // la meme raison — c'etait la bonne intuition, pas la bonne taille.
  //    8 graines -> +/-2,01      40 graines -> +/-0,90
  //   20 graines -> +/-1,27      60 graines -> +/-0,73  (retenu)
  // AUCUN SEUIL n'a ete touche : seule la taille de l'echantillon change.
  const GRAINES = Array.from({ length: 60 }, (_, i) => i + 1);
  let passesAvant = 0;
  for (const seed of GRAINES) {
    const m = new MatchEngine(seed, 4800);
    const brut = m.log.bind(m);
    m.log = (type, team, msg) => { if (type === 'MELEE_AVANT') passesAvant++; brut(type, team, msg); };
    for (let t = 0; t < 4800; t += 0.2) m.tick(0.2);
  }
  const avantParMatch = passesAvant / GRAINES.length;
  // BORNE HAUTE **ET** BASSE. La borne haute seule etait satisfaite a zero :
  // supprimer la sanction rendait ce test plus vert que jamais.
  // La borne basse est fixee a ce que le moteur produit REELLEMENT (0,4 par
  // match) et non a la valeur reelle (1 a 3) : monter le taux de maladresse
  // pour s'en approcher remplace des touches par des melees et fait retomber
  // le moteur de 13/14 a 11/14 categories realistes (mesure). L'ecart est
  // assume et documente dans le moteur ; ce que ce test garde, c'est que la
  // sanction ne DISPARAISSE pas.
  // SEUL LE PLAFOND RESTE ICI. Les deux PLANCHERS (la sanction existe encore ;
  // un match produit 10 a 15 fautes de main) ont ete deplaces dans
  // server/test-stats-matchs.js, qui tourne sur 500 matchs chaque nuit. Mesure
  // de leur puissance a 60 matchs, la taille disponible ici :
  //   passe en avant : ~0,33 par match, soit ~20 evenements, donc +/-0,15 a
  //     95 % — le plancher de 0,2 n'etait qu'a 0,9 ecart-type, et il est
  //     effectivement passe au rouge sur des correctifs etrangers a la loi.
  //   fautes de main : 8,87 par match, ecart-type 2,90, donc +/-0,73 — le
  //     plancher de 8 n'etait qu'a 1,2 ecart-type.
  // A 500 matchs les MEMES seuils valent ~5 et ~3,5 ecarts-types. Aucun seuil
  // n'a ete baisse : un garde-fou qui bascule sur du bruit ne protege rien, et
  // il a suffi de lui donner l'echantillon que sa question exige.
  //
  // Le PLAFOND, lui, est large (0,33 mesure contre 4 autorise) : il reste ici,
  // ou il ne coute rien et attrape tout de suite une regression grossiere.
  assert.ok(avantParMatch <= 4,
    `une passe en avant reste une FAUTE RARE (mesuré ${avantParMatch.toFixed(1)} par match)`);
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
    // Le garde-fou du moteur force la sequence legale a 35 s, qui ajoute au
    // plus 5 s de « use it » : on borne a 50 s, au-dessus des 40,0 s mesurees
    // comme maximum reel.
    //
    // CE COMMENTAIRE A MENTI PENDANT UN TEMPS, et il faut savoir pourquoi.
    // Il annoncait « il ne se declenche que 2 fois sur 50 — il borne le cas
    // pathologique sans changer le jeu ordinaire ». C'etait vrai quand un maul
    // durait 8,4 s. Apres le correctif de poussee, le garde-fou est passe a
    // 26 % des mauls au pas reel du jeu : il etait devenu le jeu ordinaire, et
    // il sifflait une melee sur des mauls qui avancaient encore (illegal, cf.
    // le test « loi 16 : un maul qui AVANCE... » plus bas). Un chiffre ecrit
    // dans un commentaire vaut pour l'etat du moteur au jour ou il a ete
    // mesure, pas pour toujours.
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
// touche ~25 s (sources : docs/ANALYSE_MATCH_REEL.md ; les « 40 a 60 s » que
// ce test exigeait n'avaient pas de source, cf. P2-94). Une touche ne doit pas
// non plus trainer : la loi limite sa mise en place a 30 s.
// Les expedier plus vite ne fait pas gagner du spectacle :
// ca multiplie mecaniquement les possessions, donc les rucks, les passes et
// les courses, tous mesures a 1,5-2 fois leur volume reel.
test('les temps morts durent ce qu ils durent : melee >= 45 s, touche entre 22 et 40 s', () => {
  // 6 graines et non 3 : le nombre de melees varie fortement d'un match a
  // l'autre (33 sur les graines 1-3 a un etat du moteur, 20 a un autre — pour
  // une moyenne inchangee de ~12 par match sur 20 graines). Le garde-fou
  // d'echantillon de ce test tombait alors a zero sans que les DUREES, qui sont
  // la propriete verifiee ici, aient bouge d'une seconde. On elargit
  // l'echantillon ; on ne baisse pas le seuil.
  const GRAINES = [1, 2, 3, 4, 5, 6];
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
  assert.ok(mTouche >= 22 && mTouche <= 40, `une touche dure ~25 s en vrai, mise en place limitee a 30 s (mesuré ${mTouche.toFixed(1)} s)`);
});

// --- PRES DE LA LIGNE, LES AVANTS PORTENT LE BALLON ------------------------
// Un PORTAGE se compte comme le moteur le compte lui-meme (stats.carries) :
// un porteur AMENE AU CONTACT. Un n°9 qui ramasse au pied du regroupement et
// relaie aussitot n'est pas un porteur — c'est ce que comptait une premiere
// version de ce test, et elle surevaluait mecaniquement la part des
// trois-quarts d'un facteur deux.
//
// Mesure sur 40 matchs complets, avant correction : dans les cinq derniers
// metres, les avants ne signaient que 22,9 % des portages, alors qu'un vrai
// match y joue le pack (60 a 70 %) — il n'y a plus d'espace au large et la
// defense est massee. Consequence mesuree : les avants ne marquaient que 13,8 %
// des essais (repere reel ~33 %) pendant que les deux ailiers en marquaient
// 69,8 %, si bien que le joueur voyait toujours les deux memes maillots aplatir.
//
// Cause : a la sortie d'un regroupement, le n°9 donnait au n°10 quasi
// systematiquement, y compris a 3 m de la ligne d'en-but, l'option « avant
// lance » n'etant tiree qu'a 18 % partout sur le terrain.
//
// Seuil a 29 % : l'echantillon (40 matchs, ~400 portages dans la zone) situe la
// proportion a +/-4,5 points pres, donc 22,9 % est nettement en dessous et
// 34,6 % nettement au-dessus. Ce n'est PAS le repere reel (60-70 %) : c'est le
// garde-fou qui empeche de revenir a une attaque qui ignore ses avants.
test('pres de la ligne adverse, les AVANTS portent le ballon au contact', () => {
  let dans5 = 0, dans5Avants = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const m = new MatchEngine(seed, 4800);
    for (let t = 0; t < 4800; t += 0.2) {
      const cA = m.stats.A.carries, cB = m.stats.B.carries;
      const porteur = m.porteur, phase = m.phase;
      m.tick(0.2);
      if ((m.stats.A.carries > cA || m.stats.B.carries > cB) && porteur && phase === 'PORTE') {
        const dist = porteur.sensAttaque > 0 ? (100 - porteur.x) : porteur.x;
        if (dist > 5) continue;
        dans5++;
        if (porteur.numero <= 8) dans5Avants++;
      }
    }
  }
  assert.ok(dans5 >= 200, `echantillon trop petit (${dans5} portages a moins de 5 m)`);
  const part = dans5Avants / dans5;
  assert.ok(part >= 0.29,
    `dans les cinq derniers metres, les avants ne signent que ${(100 * part).toFixed(1)} % des portages `
    + `(${dans5Avants}/${dans5}) ; a 5 m de la ligne un vrai match joue le pack (60 a 70 %). `
    + `Mesure avant correction : 22,9 %.`);
});

// --- ON PASSE AU SUIVANT S'IL EST MIEUX SERVI QUE SOI ----------------------
// La chaine des trois-quarts (10->12->13->aile) se deroulait jusqu'au bout a
// TOUS LES COUPS : le porteur cherchait un partenaire onside, a portee, avec un
// peu d'air, et lui donnait — sans jamais comparer cet air au SIEN. Un centre
// avec neuf metres devant lui redonnait donc au large exactement comme un centre
// pris au collet. C'est ce qui fait marquer 71,2 % des essais aux deux ailiers
// (mesure sur 40 matchs ; repere reel : environ 28 %).
//
// COMMENT CE TEST MESURE. Pas en simulant des matchs (l'ecart serait noye), ni
// en laissant tourner le scenario quelques secondes : essaye, le defenseur
// COURT vers le porteur, si bien qu'au bout d'une seconde ce n'est plus la
// chaine qui decide mais la passe avant contact — le scenario mesurait alors
// une tout autre branche et donnait 40 % contre 55 %, dans le mauvais sens. On
// interroge donc la DECISION elle-meme, etat fige, sans laisser personne
// bouger : 400 tirages par graine, 5 graines, soit 2000 decisions par cas
// (precision ~0,8 point).
test('un trois-quarts ne passe que si le suivant est MIEUX SERVI que lui', () => {
  function tauxDecision(espacePorteur, espaceSuivant) {
    let passes = 0, n = 0;
    for (const seed of [11, 12, 13, 14, 15]) {
      const m = new MatchEngine(seed, 600);
      for (let t = 0; t < 30; t += 0.2) m.tick(0.2);
      m.phase = 'PORTE'; m.timerPhase = 2; m.possession = 'A';
      m.passeVisuelle = null; m.combinaison = null; m.penaliteRecul = null;
      m.ruckPoint = null; m._neufLibre = false;
      const porteur = m.equipeA.find((j) => j.numero === 12);
      const suivant = m.equipeA.find((j) => j.numero === 13);
      m.porteur = porteur;
      porteur.auSol = 0; porteur.x = 50; porteur.y = 30; porteur._enchaine = 0;
      suivant.auSol = 0; suivant.x = 49.5; suivant.y = 42;
      for (const j of m.equipeA) if (j !== porteur && j !== suivant) { j.auSol = 0; j.x = 25; j.y = 5; }
      for (const j of m.equipeB) {
        j.auSol = 0; j.horsJeuKick = 0; j.fixeCooldown = 0; j.missCooldown = 0;
        j.ruckRecovery = 0; j.x = 95; j.y = 68;
      }
      const dPorteur = m.equipeB.find((j) => j.numero === 6);
      const dSuivant = m.equipeB.find((j) => j.numero === 7);
      dPorteur.x = porteur.x + espacePorteur; dPorteur.y = porteur.y;
      dSuivant.x = suivant.x + espaceSuivant; dSuivant.y = suivant.y;
      for (let k = 0; k < 400; k++) {
        const a = m.choisirActionPorteur(porteur, dPorteur, espacePorteur, 0.2);
        n++;
        if (a === 'PASS' || a === 'JEU_LARGE') passes++;
      }
    }
    return 100 * passes / n;
  }
  // Le 13 est au large, le 12 est pris : la ligne doit vivre.
  const suivantMieuxServi = tauxDecision(3.0, 9.0);
  // C'est le 12 qui a l'espace, le 13 est marque a 3 m : il y va.
  const porteurMieuxServi = tauxDecision(9.0, 3.0);
  assert.ok(suivantMieuxServi >= 20,
    `quand le suivant est nettement mieux servi, le porteur ne lui donne que dans `
    + `${suivantMieuxServi.toFixed(1)} % des decisions : la ligne ne vit plus`);
  assert.ok(porteurMieuxServi <= 8,
    `le porteur, avec neuf metres devant lui, redonne quand meme dans `
    + `${porteurMieuxServi.toFixed(1)} % des decisions alors que le suivant est pris a 3 m `
    + `(mesure avant correction : 15,1 % ; apres : 3,0 %). Un trois-quarts qui a l espace y `
    + `va — sinon la chaine finit toujours sur l aile.`);
});


// --- AU CONTACT, LA PUISSANCE DU PORTEUR NE COMPTAIT PAS -------------------
// `avanceContact` ne dependait que du RIDEAU defensif (0,55 / 1,00 / 1,55 m
// selon le nombre de defenseurs devant). Ni la puissance du porteur, ni son
// elan n'entraient dans le calcul : un pilier de 90 de puissance et un ailier
// de 35 percutant le MEME rideau gagnaient exactement le meme terrain.
//
// Mesure en contact construit (meme geometrie, meme plaqueur, 40 graines) :
//   rideau de 0 : puissance 90 -> 1,50 m   puissance 35 -> 1,50 m
//   rideau de 2 : puissance 90 -> 0,53 m   puissance 35 -> 0,53 m
// Identique au centieme.
//
// Sur des matchs complets l'effet est meme INVERSE : les porteurs les plus
// puissants gagnent MOINS de terrain au contact que les plus legers (0,50 m
// contre 1,07 m, terciles de puissance sur 1 998 contacts). La raison est
// mecanique : les avants percutent pres du regroupement, donc face a un rideau
// fourni, et les trois-quarts dans l'espace. Le moteur creditait DONC OU l'on
// percute, jamais QUI percute — l'exact contraire du rugby, ou l'on donne le
// ballon au plus lourd precisement pour avancer dans le trafic
// (cf. CLAUDE.md role 4 : « les avants doivent etre meilleurs pour les
// contacts »).
//
// ON REPARTIT, ON NE GONFLE PAS : le facteur est centre sur la puissance
// MESUREE au contact (moyenne 57), de sorte qu'un porteur moyen gagne
// exactement ce qu'il gagnait avant.
//
// SEULE LA PUISSANCE EST AJOUTEE, PAS L'ELAN. J'avais ecrit un second test
// (« un porteur lance avance plus qu'un porteur a l'arret ») : il etait VERT
// sur le moteur NON corrige. L'elan agit deja, non par une regle de contact
// mais par la distance que le porteur parcourt avant que le contact ne se
// resolve (rideau de 2 : 1,17 m lance contre 0,53 m a l'arret). Il n'y a donc
// pas de defaut de ce cote, et un test qui passe sans correctif ne protege
// rien : il a ete retire plutot que livre.
function gainContactConstruit(puissance, vitesse, nbRideau) {
  let total = 0, n = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const m = new MatchEngine(seed, 600);
    for (let t = 0; t < 30; t += 0.2) m.tick(0.2);
    m.phase = 'PORTE'; m.timerPhase = 3; m.possession = 'A';
    m.passeVisuelle = null; m.combinaison = null; m.penaliteRecul = null;
    m.ruckPoint = null; m._neufLibre = false; m.maul = null;
    const porteur = m.equipeA.find((j) => j.numero === 12);
    m.porteur = porteur;
    porteur.auSol = 0; porteur.x = 50; porteur.y = 35; porteur._enchaine = 0;
    porteur._percee = 0; porteur.puissance = puissance; porteur.vitesseCourante = vitesse;
    for (const j of m.equipeA) if (j !== porteur) { j.auSol = 0; j.x = 40; j.y = 35; }
    for (const j of m.equipeB) {
      j.auSol = 0; j.horsJeuKick = 0; j.fixeCooldown = 0; j.missCooldown = 0;
      j.ruckRecovery = 0; j.sinBin = 0; j.x = 95; j.y = 68;
    }
    const pl = m.equipeB.find((j) => j.numero === 6);
    pl.x = 52.0; pl.y = 35; pl.plaquage = 70;
    m.equipeB.filter((j) => j.numero <= 5).slice(0, nbRideau)
      .forEach((j, i) => { j.x = 53 + i; j.y = 34 + i; });
    const x0 = porteur.x;
    for (let k = 0; k < 6 && !m.ruckPoint; k++) m.tick(0.2);
    if (m.ruckPoint) { total += (m.ruckPoint.x - x0) * porteur.sensAttaque; n++; }
  }
  return n ? total / n : NaN;
}
test('au contact, un porteur PUISSANT avance plus qu un porteur leger', () => {
  for (const rideau of [0, 2]) {
    const lourd = gainContactConstruit(90, 5.3, rideau);
    const leger = gainContactConstruit(35, 5.3, rideau);
    assert.ok(lourd - leger >= 0.30,
      `rideau de ${rideau} : puissance 90 gagne ${lourd.toFixed(2)} m contre ${leger.toFixed(2)} m `
      + `pour puissance 35 — la puissance du porteur ne compte pas au contact `
      + `(mesure avant correctif : identique au centieme)`);
  }
});

// --- L'ENDURANCE NE JOUAIT PAS ---------------------------------------------
// La fatigue de fin de match etait GLOBALE : un seul multiplicateur de vitesse,
// le meme chiffre pour les trente joueurs (1 au coup d'envoi, 0,90 a la 80e).
// L'attribut `endurance` n'etait donc JAMAIS lu par le moteur — verifie par
// balayage (+20 a une equipe, -20 a l'autre, 24 graines appariees) : l'ecart de
// score reproduisait le temoin AU CHIFFRE PRES (-3,0 points, -0,29 essai, 38 %
// de victoires dans les deux cas).
//
// Or l'ecran de composition PONDERE l'endurance — 10 % de la note d'un pilier,
// 12 % d'une deuxieme ligne, 18 % d'une troisieme ligne (POIDS_PAR_POSTE dans
// docs/js/club-composition.js). Le manager recrutait sur un attribut mort.
//
// CE TEST A ETE REECRIT — ET C'EST LA GRANDEUR QUI A CHANGE, PAS LE SEUIL.
// La premiere version mesurait la DISTANCE TOTALE parcourue en fin de match
// rapportee au debut. Elle etait fragile : son temoin (deux equipes
// rigoureusement identiques) valait -0,0244 a sa creation, puis +0,0590 apres
// un correctif SANS RAPPORT avec la fatigue, et l'effet mesure passait de
// +0,035 a -0,0475 — un changement de SIGNE. Un invariant doit survivre aux
// correctifs des autres ; celui-la transformait chaque patch en faux echec.
//
// Mon erreur d'origine : mon etude de resolution ne faisait varier que le
// NOMBRE DE GRAINES sur UN SEUL moteur. Cela mesure le bruit d'echantillonnage,
// pas la robustesse au changement de moteur — qui est precisement ce qu'un
// invariant encaisse.
//
// La grandeur retenue est la VITESSE DE POINTE. `vitesseMs` PLAFONNE le
// deplacement par tick : un joueur atteint ce plafond des qu'il court
// librement, donc son maximum observe mesure la regle presque directement,
// alors que la distance totale depend de tout le deroule du match.
// Validee sur DEUX lots de graines disjoints ET sur DEUX versions du moteur,
// dont celle qui avait fait basculer l'ancienne :
//   moteur courant : +0,0768 et +0,0530
//   moteur modifie : +0,0378 et +0,0515
// Quatre valeurs positives, aucun changement de signe. Seuil a 0,02, sous la
// plus petite (0,0378) avec de la marge. Valeur theorique attendue a la 80e :
// 0,11 (facteur de fatigue 0,944 contre 0,834) ; la mesure en recupere environ
// la moitie, un joueur n'atteignant pas son plafond a chaque instant.
//
// PIEGE D'INSTRUMENT, rencontre en ecrivant ce test : le moteur RECREE les
// objets joueurs (remplacements, reprises) — 300 objets distincts pour un match
// a 30 joueurs. Suivre un joueur par l'identite de son objet le perd a la
// premiere recreation. On cle donc par EQUIPE + NUMERO.
//
// Le test compare DEUX DIFFERENCES : les equipes A et B ne sont pas symetriques
// dans le moteur (sens de jeu, coup d'envoi), et cet ecart vaut a lui seul
// -0,036 a +0,075 selon les cas. Comparer A et B directement ferait passer une
// asymetrie pour un effet de l'endurance.
function ecartVitessePointe(config, graines) {
  const DUREE = 4800, DT = 0.2;
  const rA = [], rB = [];
  for (const seed of graines) {
    const m = new MatchEngine(seed, DUREE, config);
    const prec = new Map(), vmax = new Map();
    for (let t = 0; t < DUREE; t += DT) {
      m.tick(DT);
      const tot = t < 600, tard = t > DUREE - 600;
      for (const [nomEq, eq] of [['A', m.equipeA], ['B', m.equipeB]]) for (const j of eq) {
        const cle = nomEq + j.numero;
        const p = prec.get(cle);
        if (p && (tot || tard)) {
          const d = Math.hypot(j.x - p.x, j.y - p.y) / DT;
          if (d < 12) { // on ignore les teleportations de remise en jeu
            const cur = vmax.get(cle) || { tot: [], tard: [], eq: nomEq };
            (tot ? cur.tot : cur.tard).push(d);
            vmax.set(cle, cur);
          }
        }
        prec.set(cle, { x: j.x, y: j.y });
      }
    }
    // Vitesse de pointe = moyenne des 10 meilleures mesures de la fenetre, pas
    // le seul maximum (P2-92) : le maximum depend d'UN sprint, et donc du
    // hasard de qui a couru apres quel ballon. Sur trois lots de 32 graines,
    // l'ecart mesure au maximum valait 0,007 / 0,060 / 0,106 ; avec les 10
    // meilleures mesures, 0,076 / 0,086 / 0,100. Mutant « l'endurance n'agit
    // plus » : exactement 0 avec les deux estimateurs.
    const pointe = (a) => { const s = [...a].sort((x, y) => y - x).slice(0, 10); return s.reduce((x, y) => x + y, 0) / s.length; };
    for (const v of vmax.values()) {
      if (!v.tot.length || !v.tard.length) continue;
      if (Math.max(...v.tot) > 3 && Math.max(...v.tard) > 3) (v.eq === 'A' ? rA : rB).push(pointe(v.tard) / pointe(v.tot));
    }
  }
  const moy = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return moy(rA) - moy(rB);
}
test('un joueur endurant garde sa vitesse de pointe en fin de match, un autre non', () => {
  // 16 graines, pas 8 (P2-57) : sur les graines 1-8, le moteur d'avant ne
  // donnait que +0,022 pour un seuil de 0,02 ; une modification sans rapport
  // avec la fatigue l'a fait passer a -0,010, alors que les graines 9-16
  // donnaient +0,096 avant et +0,094 apres. L'estimateur (maximum de vitesse
  // observe) est bruite : 8 graines ne suffisaient pas a separer l'effet du
  // bruit. Mutant « l'endurance n'agit plus » : rouge (cf. TODO_AUDIT.md P2-57).
  // 32 graines depuis P2-69 : le tirage des pods change qui sprinte, et
  // l'ecart mesure est passe de ~0,09 a ~0,04 en moyenne (0,019 / 0,056 /
  // 0,045 sur les graines 1-16 / 17-32 / 33-48). Le mutant donne exactement 0
  // sur les trois lots : le mecanisme agit toujours, l'estimateur est bruite.
  const graines = Array.from({ length: 32 }, (_, i) => i + 1);
  const cfg = { joueursA: {}, joueursB: {} };
  for (let n = 1; n <= 15; n++) { cfg.joueursA[n] = { endurance: 90 }; cfg.joueursB[n] = { endurance: 30 }; }
  const avec = ecartVitessePointe(cfg, graines);
  const sans = ecartVitessePointe(undefined, graines);
  assert.ok(avec - sans >= 0.04,
    `l equipe endurante garde ${(avec - sans).toFixed(4)} de vitesse de pointe en plus que ne `
    + `l explique l asymetrie A/B (ecart avec config ${avec.toFixed(4)}, temoin ${sans.toFixed(4)}) : `
    + `l endurance ne change rien a la fin de match (avant correctif du moteur : exactement zero, `
    + `les deux configurations produisaient des matchs identiques)`);
});

// --- LA PENALITE TAPEE EN TOUCHE PART AU COIN ------------------------------
// `_accorderPenaliteTouche` gagnait `10 + rng() * 10` metres, soit 15 m en
// moyenne. Une vraie penalite tapee en touche part AU COIN : depuis 45 m, un
// buteur trouve la touche a 5-10 m de la ligne, soit 35-40 m gagnes.
//
// Consequence mesuree sur 20 matchs : 3,95 penalites tapees en touche par
// match, mais seulement 0,40 touche dans les 22 adverses — et comme 64 % des
// penalites sont sifflees au-dela de 45 m des buts, avec 15 m de gain elles
// atterrissaient loin de la ligne. La sequence la plus banale du rugby moderne
// — penalite au coin, touche a 5 m, maul — ne se construisait pas.
// Avec la portee reelle : 1,40 touche dans les 22 adverses, soit trois fois
// plus, sans envolee du score (essais 5,95 -> 6,20, points 51,9 -> 53,0).
//
// PAS DE DEFAUT DE CE COTE-LA : zero touche a moins de 5 m avant comme apres.
// C'est la LOI 18 — une ligne de touche ne peut pas etre formee a moins de 5 m
// de la ligne de but. Le moteur l'appliquait deja ; c'est mon decoupage de
// mesure qui l'avait pris pour une anomalie.
//
// CE QUE CE TEST MESURE, ET POURQUOI. Il porte sur le GAIN, pas sur le nombre
// de touches dans les 22. Resolution etudiee avant de choisir, sur deux lots de
// graines disjoints :
//   gain moyen      reference 13,8 a 15,2 m    correctif 27,7 a 29,4 m
//   touches dans 22 reference 0,20 a 0,67      correctif 0,90 a 1,47
// La seconde grandeur se CHEVAUCHE a 10 graines (1,00 contre 0,90) : un
// garde-fou fonde dessus basculerait sur du bruit. La premiere est nette.
test('une penalite tapee en touche part au coin, pas a dix metres', () => {
  const gains = [];
  for (let seed = 1; seed <= 10; seed++) {
    const m = new MatchEngine(seed, 4800);
    const orig = m._accorderPenaliteTouche.bind(m);
    m._accorderPenaliteTouche = (eq, pos) => {
      const r = orig(eq, pos);
      gains.push((m.ruckPoint.x - pos.x) * (eq === 'A' ? 1 : -1));
      return r;
    };
    for (let t = 0; t < 4800; t += 0.2) m.tick(0.2);
  }
  const moy = gains.reduce((a, b) => a + b, 0) / gains.length;
  assert.ok(gains.length > 25, `echantillon trop petit (${gains.length} penalites en touche)`);
  assert.ok(moy >= 22,
    `une penalite tapee en touche ne gagne que ${moy.toFixed(1)} m : elle ne part pas au coin `
    + `(mesure avant correctif : 14 m)`);
});
test('la portee de la penalite en touche depend du BUTEUR, pas du hasard seul', () => {
  function gainMoyen(jeuPied) {
    const cfg = { joueursA: {}, joueursB: {} };
    for (let n = 1; n <= 15; n++) { cfg.joueursA[n] = { jeuPied }; cfg.joueursB[n] = { jeuPied }; }
    const gains = [];
    for (let seed = 1; seed <= 6; seed++) {
      const m = new MatchEngine(seed, 4800, cfg);
      const orig = m._accorderPenaliteTouche.bind(m);
      m._accorderPenaliteTouche = (eq, pos) => {
        const r = orig(eq, pos);
        gains.push((m.ruckPoint.x - pos.x) * (eq === 'A' ? 1 : -1));
        return r;
      };
      for (let t = 0; t < 4800; t += 0.2) m.tick(0.2);
    }
    return gains.reduce((a, b) => a + b, 0) / gains.length;
  }
  const bon = gainMoyen(95), mauvais = gainMoyen(25);
  assert.ok(bon - mauvais >= 10,
    `buteur a 95 de jeu au pied : ${bon.toFixed(1)} m, buteur a 25 : ${mauvais.toFixed(1)} m — `
    + `le choix du buteur ne change pas la portee (avant correctif : identique, le gain etait un `
    + `tirage sans attribut)`);
});

// --- LE MAUL PENETRANT : LE DE POUSSAIT PLUS FORT QUE LES DEUX PACKS -------
// La poussee valait `(fAtt - fDef) / 200 + (alea - 0,5) * 0,5`. L'ecart de
// force entre les deux packs vaut 27 points en moyenne, soit 0,135 m/s, quand
// le terme de hasard vaut +/-0,25 m/s : LE DE PESAIT DEUX FOIS LES TRENTE
// AVANTS. Et comme « use it » se declenche apres 1 s sous 0,2 m/s, le maul
// mourait des que le tirage tombait mal.
//
// Mesure sur 20 matchs : le maul avancait de 2,38 m (repere reel 5 a 15 m),
// 0,79 m seulement a moins de 10 m de la ligne, et produisait ZERO essai par
// match — une des deux machines a essais des avants n'existait pas.
//
// CE QUE J'AI CRU, ET QUE LA MESURE A DEMENTI. J'ai d'abord craint qu'inverser
// le rapport (packs 5x le de) rende l'issue deterministe. C'est le contraire :
// plus il y a de hasard, plus le maul OSCILLE autour du seuil d'arret, ni
// n'avance franchement ni ne s'arrete proprement. Dosages intermediaires
// mesures (rapport packs/de) :
//   0,54x (avant)  avancee 2,38 m  duree 14,3 s  essais 0,00  melee  9 %
//   1,7x           avancee 4,73 m  duree 20,9 s  essais 0,05  melee 24 %
//   2,2x           avancee 6,84 m  duree 23,6 s  essais 0,20  melee 24 %
//   3,0x           avancee 6,52 m  duree 20,8 s  essais 0,25  melee 21 %
//   5,0x (retenu)  avancee 7,61 m  duree 18,9 s  essais 0,20  melee 13 %
// ATTENTION A LA DERNIERE COLONNE : en choisissant ce dosage j'ai ecrit qu'il
// etait « le seul a ne pas faire finir un maul sur quatre en melee ». Le
// controle d'arbitrage a montre que ces melees n'etaient pas des melees de loi
// 16.17 mais les coups de sifflet du garde-fou anti-blocage, sur des mauls qui
// avancaient encore. Le classement tient, l'argument etait mal nomme ; le
// garde-fou est corrige et garde par le test de loi 16 plus haut.
// Le dosage retenu est le seul qui donne une avancee reelle SANS faire finir un
// maul sur quatre en melee. Et ce n'est pas un rail : deux packs equivalents
// donnent un ecart nul, donc un maul qui ne bouge pas — c'est du rugby.
//
// LE BLOCAGE DE P2-25 EST LEVE, ET DANS L'AUTRE SENS. Cette entree avait refuse
// trois calibrations parce qu'elles coutaient 15 a 20 % des portages dans les
// cinq metres, le maul monopolisant la possession pres de la ligne. Mesure ici :
//   portages a moins de 5 m  8,55 -> 10,10 par match (+18 %)
//   part des avants          28,7 % -> 32,7 %
// En avancant reellement, le maul AMENE le ballon dans les cinq metres au lieu
// d'y mourir quinze metres plus loin : il en cree au lieu d'en consommer.
test('un maul penetrant avance vraiment, et un pack dominant le pousse plus loin', () => {
  // L'INSTRUMENT MESURE L'AVANCEE DE L'EQUIPE QU'ON FAIT VARIER. Premiere
  // version : je moyennais TOUS les mauls du match. Quand on donne le pack
  // lourd a A, les mauls de B (pack leger) entraient dans la meme moyenne, et
  // l'ecart mesure sortait a l'envers (8,69 m contre 10,68 m). On filtre donc
  // sur maul.equipePossession, et on prend le sens du maul lui-meme.
  function avanceeMaul(config, graines, equipe) {
    let total = 0, n = 0;
    for (const seed of graines) {
      const m = new MatchEngine(seed, 4800, config);
      let cur = null, phaseAvant = m.phase;
      for (let t = 0; t < 4800; t += 0.2) {
        m.tick(0.2);
        if (m.phase === 'MAUL' && phaseAvant !== 'MAUL' && m.maul) {
          cur = (!equipe || m.maul.equipePossession === equipe)
            ? { x0: m.maul.x, sens: m.maul.sens, xFin: m.maul.x } : null;
        } else if (m.phase !== 'MAUL' && phaseAvant === 'MAUL' && cur) {
          total += (cur.xFin - cur.x0) * cur.sens; n++; cur = null;
        }
        if (m.phase === 'MAUL' && m.maul && cur) cur.xFin = m.maul.x;
        phaseAvant = m.phase;
      }
    }
    return n ? total / n : NaN;
  }
  const graines = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  // 1. Le maul doit AVANCER. Repere reel : 5 a 15 m pour un maul lance.
  //    Seuil a 4 m, sous la valeur mesuree sur le moteur livre (7,44 m sur 59
  //    mauls) avec de la marge, et tres au-dessus de l'ancienne (2,88 m sur ces
  //    memes graines, 2,38 m sur 20 matchs).
  const avance = avanceeMaul(undefined, graines);
  assert.ok(avance >= 4,
    `un maul n avance que de ${avance.toFixed(2)} m (mesure avant correctif : 2,38 m ; `
    + `repere reel 5 a 15 m) : le maul penetrant n existe pas`);
  // 2. CE SONT LES PACKS QUI DECIDENT, PAS LE DE. Deux packs opposes en
  //    puissance doivent produire des mauls tres differents. Avant le
  //    correctif, le terme de hasard ecrasait cet ecart.
  //
  //    LE SEUIL VIENT D'UN AUDIT DE CREUSAGE, PAS D'UNE INTUITION. J'ai
  //    fabrique deux moteurs AVEUGLES AUX PACKS (poussee constante 0,35 puis
  //    0,45 au lieu de (fAtt - fDef)/70), qui passent l'assertion 1 — le maul
  //    avance bien — mais ou la force des packs ne joue plus aucun role. Ecart
  //    residuel mesure : +1,00 m et -1,34 m. Ce residu n'est pas nul parce
  //    qu'un pack lourd change quand meme OU et COMBIEN DE TEMPS le maul vit.
  //    Le moteur livre donne +23,07 m (pack lourd 21,45 m contre pack leger
  //    -1,62 m : le pack leger RECULE). Le seuil de 2 m est donc au-dessus du
  //    residu aveugle et dix fois sous la valeur reelle.
  //
  //    P2-25 avait retire une version de ce garde-fou parce que son ecart
  //    mesure (1,86 m) portait une incertitude de +/-2,0 m : il basculait au
  //    tirage. Ici l'ecart est douze fois plus grand que cette incertitude.
  //
  //    VERIFIE HORS DE SES PROPRES GRAINES (lecon des garde-fous fragiles
  //    precedents : un seuil cale sur un seul jeu de graines bascule ailleurs).
  //    Sur les graines 11-20, disjointes de celles du test : avancee 7,83 m
  //    (seuil 4) et ecart 18,04 m (seuil 2). Les deux assertions tiennent
  //    largement des deux cotes.
  const lourd = {}, leger = {};
  for (let n = 1; n <= 8; n++) { lourd[n] = { puissance: 95 }; leger[n] = { puissance: 25 }; }
  const packFort = avanceeMaul({ joueursA: lourd, joueursB: leger }, graines, 'A');
  const packFaible = avanceeMaul({ joueursA: leger, joueursB: lourd }, graines, 'A');
  assert.ok(packFort - packFaible >= 2,
    `pack lourd ${packFort.toFixed(2)} m contre pack leger ${packFaible.toFixed(2)} m : `
    + `l ecart de ${(packFort - packFaible).toFixed(2)} m ne se voit pas — au maul, ce sont les `
    + `deux packs qui doivent decider, pas le tirage`);
});

// --- UNE PENALITE HORS DE PORTEE SE JOUE EN TOUCHE --------------------------
// Hors de portee de tir, le moteur ne tapait en touche que 35 % du temps : le
// reste partait en jeu rapide a la main. Mesure au pas reel : 8,6 jeux rapides
// par match pour 4,3 coups de pied en touche. Le joueur voyait une equipe
// jouer a la main une penalite sifflee dans son propre camp, presque a chaque
// fois. Verifie ROUGE avant correctif (49 % de jeux rapides, 21 % en touche
// sur 81 penalites), VERT apres. Cf. TODO_AUDIT.md P2-50.
test('une penalite hors de portee se joue EN TOUCHE, le jeu rapide reste l exception', () => {
  const choix = { touche: 0, but: 0, rapide: 0 };
  for (const seed of [1, 2, 3, 4]) {
    const m = new MatchEngine(seed, 4800);
    const orig = m.log.bind(m);
    m.log = (t, e, x) => {
      if (t === 'PENALITE') {
        if (/touche/.test(x)) choix.touche++; else if (/coup de pied au but/.test(x)) choix.but++; else if (/rapidement/.test(x)) choix.rapide++;
      }
      return orig(t, e, x);
    };
    for (let t = 0; t < 4800; t += 0.1) m.tick(0.1);
  }
  const total = choix.touche + choix.but + choix.rapide;
  assert.ok(total > 40, `trop peu de penalites observees (${total})`);
  const partRapide = choix.rapide / total, partTouche = choix.touche / total;
  assert.ok(partRapide < 0.25 && partTouche > 0.35,
    `sur ${total} penalites : ${choix.rapide} jeux rapides (${(100 * partRapide).toFixed(0)} %), ${choix.touche} en touche (${(100 * partTouche).toFixed(0)} %), ${choix.but} au but — une penalite dans son camp se joue en touche, pas a la main`);
});

// --- REEQUILIBRAGE, ETAPES 1 ET 2 : LA DEFENSE MONTE, LE JEU RAPIDE EST RAPIDE --
// Cf. TODO_AUDIT.md P2-48 et P2-49. Le moteur marquait surtout sur de longues
// chevauchees : 57 % des essais au bout d'une course de 30 m ou plus, dont la
// moitie nee d'un coup de pied rattrape et 44 % sans un seul ruck. Les
// defenseurs places DEVANT le futur marqueur passaient 62 % de la course a
// « tenir leur ligne » et 90 % finissaient plus loin de lui qu'au depart.
//
// Trois regles, a livrer ENSEMBLE (chacune seule, mesuree, ne changeait rien
// aux essais longs ou faisait deborder le score) :
//  1. le defenseur de face monte au contact, en visant le point de rencontre ;
//  2. apres un coup de pied rattrape, la defense arrive lancee (pas de rampe) ;
//  3. un jeu rapide sur penalite se joue en 8 s, pas en 26 s.
//
// Les trois tests ci-dessous ont ete verifies ROUGES sur le moteur d'avant et
// VERTS apres. Les scenarios remettent a zero l'etat herite de l'echauffement :
// un avantage en cours revenait a la penalite au premier tick et une cible de
// passe memorisee faisait passer le porteur — deux scenarios sur six
// mesuraient autre chose que ce qu'ils annonçaient avant cette remise a zero.
// Scenario commun : porteur n°11 de A lance dans l'axe, a 45 m de l'en-but
// adverse, phase de jeu deja installee (rampe terminee sauf si on la veut).
function scenario(seed, { timerPhase = 10, apresPied = false } = {}) {
  const m = new MatchEngine(seed, 600);
  for (let t = 0; t < 30; t += 0.2) m.tick(0.2);
  m.phase = 'PORTE'; m.timerPhase = timerPhase; m.possession = 'A';
  m.passeVisuelle = null; m.combinaison = null; m.penaliteRecul = null; m.ruckPoint = null;
  m._passeCibleForcee = null; m._neufLibre = false; m.avantage = null; // etat herite de l'echauffement : un avantage en cours revenait a la penalite au 1er tick
  m._porteApresPied = apresPied;
  // Le scenario teste la DEFENSE : le porteur ne doit ni passer (soutiens
  // eloignes, plus bas) ni taper. Sans ce verrou, un ailier qui tape au pied
  // terminait la phase avant tout plaquage, selon le tirage (P2-57). Note :
  // `tauxJeuAuPied || 1` dans le moteur, d'ou une valeur infime plutot que 0.
  m.cfgAttaque.A = Object.assign({}, m.cfgAttaque.A, { tauxJeuAuPied: 1e-9 });
  const p = m.equipeA.find(j => j.numero === 11);
  const sens = p.sensAttaque;
  m.porteur = p; p.auSol = 0; p.vitesseCourante = 0;
  p.x = sens > 0 ? LONGUEUR - 45 : 45; p.y = 35;
  for (const j of m.equipeA) if (j !== p) { j.x = p.x - sens * 40; j.auSol = 0; } // soutiens hors de portee de passe : le porteur court
  for (const j of m.equipeB) {
    j.auSol = 0; j.horsJeuKick = 0; j.fixeCooldown = 0; j.ruckRecovery = 0; j.missCooldown = 0; j.sinBin = 0;
    j.vitesseCourante = 0;
    j.x = p.x - sens * 25; j.y = j.channelY; // toute la defense est battue, loin derriere
  }
  return { m, p, sens };
}

test('le defenseur DE FACE monte au contact, meme si un defenseur battu est plus proche', () => {
  // Un defenseur BATTU juste derriere le porteur (3 m, hors de portee de
  // plaquage) est « le plus proche » ; un defenseur DE FACE attend 9 m devant,
  // decale de 6 m dans son couloir. Avant correctif, seul le plus proche
  // montait : le defenseur de face tenait sa ligne, a distance constante.
  const mins = [];
  for (const seed of [21, 22, 23, 24, 25, 26]) {
    const { m, p, sens } = scenario(seed);
    const battu = m.equipeB.find(j => j.numero === 7);
    battu.x = p.x - sens * 3; battu.y = p.y;
    const face = m.equipeB.find(j => j.numero === 13);
    face.x = p.x + sens * 9; face.y = p.y + 6; face.channelY = face.y;
    let dmin = 99;
    const plaq0 = m.stats.B.tacklesAttempted;
    for (let t = 0; t < 4.0 && m.phase === 'PORTE' && m.porteur === p; t += 0.1) {
      m.tick(0.1);
      dmin = Math.min(dmin, Math.hypot(face.x - p.x, face.y - p.y));
    }
    // Un plaquage resolu dans le tick ou le defenseur entre a portee met fin
    // a la phase avant qu'on ait pu mesurer la distance : on compte donc le
    // plaquage lui-meme comme « monte au contact ».
    mins.push(m.stats.B.tacklesAttempted > plaq0 ? 0 : dmin);
  }
  const atteints = mins.filter(v => v < 2.2).length;
  assert.ok(atteints >= 5, `le defenseur de face n'atteint le porteur que dans ${atteints} scenario(s) sur 6 (plus courte distance : ${mins.map(v => v.toFixed(1)).join(' / ')} m) : il tient sa ligne au lieu de monter au plaquage`);
});

test('apres un coup de pied rattrape, la defense arrive LANCEE (pas de remontee depuis 35 %)', () => {
  // Meme situation, debut de phase (timerPhase 0) : le defenseur de face doit
  // refermer bien plus vite quand le jeu nait d'un coup de pied que lorsqu'il
  // nait d'un regroupement, ou la ligne se reorganise legitimement.
  const ferme = (apresPied) => {
    let total = 0;
    for (const seed of [21, 22, 23, 24, 25, 26]) {
      const { m, p, sens } = scenario(seed, { timerPhase: 0, apresPied });
      const face = m.equipeB.find(j => j.numero === 13);
      face.x = p.x + sens * 14; face.y = p.y; face.channelY = face.y;
      // La ligne de chasse ARRIVE en courant : sur un coup de pied, le
      // defenseur n'est pas a l'arret. (Partir de l'arret masquait tout : son
      // inertie le bride plus que la rampe pendant les 2,7 premieres secondes.)
      face.vitesseCourante = 6;
      // On mesure la distance que le defenseur COURT lui-meme : l'ecart avec
      // le porteur melangerait sa course et celle du porteur.
      let couru = 0, px = face.x, py = face.y;
      for (let t = 0; t < 1.5 && m.phase === 'PORTE'; t += 0.1) {
        m.tick(0.1); couru += Math.hypot(face.x - px, face.y - py); px = face.x; py = face.y;
      }
      total += couru;
    }
    return total / 6;
  };
  const apresPied = ferme(true), apresRuck = ferme(false);
  assert.ok(apresPied - apresRuck > 2, `en 1,5 s, le defenseur de face court ${apresPied.toFixed(2)} m apres un coup de pied contre ${apresRuck.toFixed(2)} m apres un regroupement : il repart de 35 % de sa vitesse alors qu'il arrive lance`);
});

test('le ballon VIT dans le contact : des offloads a chaque match, pas une rarete', () => {
  // Reel (docs/ANALYSE_MATCH_REEL.md, France-Irlande 2026) : 25 offloads. Le
  // moteur en produisait 4,4 par match : un porteur plaque finissait au ruck
  // presque a tous les coups, alors que CLAUDE.md demande des passes « avant ou
  // pendant le contact ». Cf. TODO_AUDIT.md P2-52.
  // 12 graines : d'un match a l'autre, de 6 a 26 offloads (moyenne ~15) ; sur
  // 4 graines, une seule bifurcation suffisait a passer sous 9 (P2-90).
  let offloads = 0;
  const N = 12;
  for (let seed = 1; seed <= N; seed++) {
    const m = new MatchEngine(seed, 4800);
    for (let t = 0; t < 4800; t += 0.1) m.tick(0.1);
    offloads += m.stats.A.offloads + m.stats.B.offloads;
  }
  const parMatch = offloads / N;
  assert.ok(parMatch > 9, `${parMatch.toFixed(1)} offloads par match (reel : 25) : le porteur plaque ne libere presque jamais le ballon dans le contact`);
});

test('loi 20.14 : jeu rapide joué vite, le fautif encore dans les 10 m est hors-jeu et ne peut pas plaquer', () => {
  // Signale par le controle d'arbitrage du paquet P2-52 : la mise en place du
  // jeu rapide ignorait les fautifs au sol (`if (j.auSol > 0) continue`). Un
  // fautif encore a terre dans les 10 m ne bloquait pas la reprise ; il se
  // relevait ensuite DANS les 10 m, libre de plaquer. Avec un plancher de
  // 26 s il etait presque toujours releve et replie avant ; a 8 s, non.
  const m = new MatchEngine(7, 4800) // match complet : les temps morts sont a l'echelle de la duree;
  for (let t = 0; t < 30; t += 0.1) m.tick(0.1);
  m.avantage = null; m._passeCibleForcee = null; m.passeVisuelle = null; m.combinaison = null;
  m.possession = 'A';
  const tapeur = m.equipeA.find(j => j.numero === 9);
  m.porteur = tapeur; tapeur.auSol = 0; tapeur.x = 50; tapeur.y = 35;
  for (const j of m.equipeB) { j.auSol = 0; j.sinBin = 0; j.x = 75; j.y = j.channelY; }
  const fautif = m.equipeB.find(j => j.numero === 6);
  fautif.x = 55; fautif.y = 36; fautif.auSol = 12; fautif._solX = 55; fautif._solY = 36;
  m._porteApresPied = true; // phase nee d'un coup de pied juste avant la faute
  m._lancerJeuRapidePenalite('A', { x: 50, y: 35 });
  assert.ok(!m._porteApresPied, 'apres une penalite, la defense ne doit plus etre consideree « lancee » apres un coup de pied');
  const ligne = m.penaliteRecul.ligne, sens = m.penaliteRecul.sens;
  let t = 0;
  while (m.penaliteRecul && t < 60) { m.tick(0.1); t += 0.1; }
  assert.ok(!m.penaliteRecul, 'la mise en place du jeu rapide ne se termine jamais');
  // Le jeu rapide se joue VITE (P2-123, retour joueur) : on n'attend plus que
  // tous les fautifs aient reculé. Chaque fautif resté dans les 10 m est
  // HORS-JEU au moment de la frappe : il ne peut pas plaquer avant de s'être
  // replié — c'est ce que garantit la loi, pas un temps d'attente.
  assert.ok(t <= 3, `le jeu rapide doit se jouer vite (repris après ${t.toFixed(1)} s)`);
  const enDeca = m.equipeB.filter(j => (j.x - ligne) * sens < -0.5);
  assert.ok(enDeca.includes(fautif), 'scénario : le fautif au sol est bien encore dans les 10 m à la frappe');
  for (const j of enDeca) {
    assert.ok(j.horsJeuKick > 0, `n°${j.numero} encore dans les 10 m à la frappe sans être hors-jeu (loi 20.14)`);
  }
  // Il ne plaque jamais tant qu'il n'est pas revenu derrière la ligne des 10 m.
  for (let k = 0; k < 60; k++) {
    const p = m.porteur, avant = m.stats.B.tacklesAttempted;
    const dedans = (fautif.x - ligne) * sens < -0.5;
    m.tick(0.1);
    if (m.stats.B.tacklesAttempted > avant && dedans && p && m.ruckPoint) {
      const plaqueur = m.equipeB.find(j => m.contestants && j.numero === m.contestants[0]);
      assert.notStrictEqual(plaqueur, fautif, 'le fautif plaque depuis les 10 m alors qu il est hors-jeu');
    }
  }
});

test('une CHANDELLE tient en l air et se dispute : les chasseurs arrivent dessous', () => {
  // Une chandelle (box kick du n°9, up-and-under) n'a de sens que par son
  // temps de vol : ~4 s en l'air, le temps que la ligne de chasse arrive sous
  // le ballon et le dispute. Le moteur faisait voler TOUS les coups de pied a
  // 16 m/s, plafonnes a 2,2 s : une chandelle de 15 m retombait en 0,97 s, le
  // chasseur le plus proche encore a 10,5 m, et l'equipe qui tapait n'en
  // regagnait que 9 %. Cf. TODO_AUDIT.md P2-55.
  const vols = []; let n = 0, regagnees = 0;
  for (let seed = 1; seed <= 4; seed++) {
    const m = new MatchEngine(seed, 4800);
    let pp = m.phase, cur = null;
    for (let t = 0; t < 4800; t += 0.1) {
      const k0 = m.stats.A.kicks + m.stats.B.kicks;
      m.tick(0.1);
      if (m.stats.A.kicks + m.stats.B.kicks > k0 && m.phase === 'COUP_DE_PIED_JEU' && m.typeCoupDePiedJeu === 'CHANDELLE') {
        cur = { eq: m.equipeCoupDePiedJeu, t0: m.tempsMatch, vol: null };
      }
      if (cur && cur.vol === null && m.phase === 'COUP_DE_PIED_JEU' && !m.ballonEnVol) cur.vol = m.tempsMatch - cur.t0;
      if (cur && pp === 'COUP_DE_PIED_JEU' && m.phase !== 'COUP_DE_PIED_JEU') {
        n++; if (cur.vol !== null) vols.push(cur.vol);
        if (m.phase !== 'TOUCHE' && m.possession === cur.eq) regagnees++;
        cur = null;
      }
      pp = m.phase;
    }
  }
  assert.ok(n > 20, `echantillon trop petit : ${n} chandelles`);
  const vol = vols.reduce((a, b) => a + b, 0) / vols.length;
  assert.ok(vol >= 3.5, `une chandelle reste ${vol.toFixed(2)} s en l air (reel ~4 s) : elle retombe avant que la chasse arrive`);
  assert.ok(regagnees / n > 0.15, `l equipe qui tape ne regagne que ${(100 * regagnees / n).toFixed(0)} % de ses chandelles : elles ne sont jamais disputees`);
});

test('une chandelle DISPUTEE peut etre echappee : en-avant, melee adverse', () => {
  // Sous une chandelle disputee, deux joueurs sautent pour le meme ballon : en
  // vrai, une part notable finit en en-avant (ballon echappe vers l'avant sous
  // la pression), donc en melee pour l'adversaire. C'est le risque qui fait de
  // la chandelle un pari. Le moteur n'en produisait jamais. Cf. TODO_AUDIT.md
  // P2-56.
  let disputees = 0, enAvants = 0, melees = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const m = new MatchEngine(seed, 4800);
    const orig = m.log.bind(m);
    m.log = (type, eq, msg, extra) => {
      if (type === 'RECEPTION_DISPUTEE') disputees++;
      if (type === 'MELEE_ENAVANT' && /chandelle/.test(msg)) enAvants++;
      return orig(type, eq, msg, extra);
    };
    let pp = m.phase;
    for (let t = 0; t < 4800; t += 0.1) {
      const enAvant0 = enAvants;
      m.tick(0.1);
      if (enAvants > enAvant0 && m.phase === 'MELEE') melees++;
      pp = m.phase;
    }
  }
  assert.ok(disputees > 30, `echantillon trop petit : ${disputees} receptions disputees`);
  const part = enAvants / disputees;
  assert.ok(part > 0.05 && part < 0.3, `${(100 * part).toFixed(0)} % des receptions disputees finissent en en-avant (${enAvants}/${disputees}) : attendu entre 5 et 30 %`);
  assert.strictEqual(melees, enAvants, 'un en-avant a la reception doit donner une melee');
});

test('le jeu au pied appartient aux demis et a l arriere, pas aux avants', () => {
  // En rugby a XV, le demi de melee (chandelle depuis la base du ruck),
  // l'ouvreur et l'arriere tapent l'essentiel des coups de pied ; un avant ne
  // tape presque jamais. Le moteur laissait n'importe quel porteur decider de
  // taper au meme taux : 29 % des coups de pied etaient tapes par des AVANTS,
  // 8 % seulement par le n°9. Cf. TODO_AUDIT.md P2-57.
  // 16 graines : sur 4 graines, la part du n°9 varie de 19 a 27 % d'un bloc
  // a l'autre (moyenne 23 % sur 24 graines) ; cf. TODO_AUDIT.md P2-88.
  const par = {}; let tot = 0;
  for (let seed = 1; seed <= 16; seed++) {
    const m = new MatchEngine(seed, 4800);
    for (let t = 0; t < 4800; t += 0.1) {
      const k0 = m.stats.A.kicks + m.stats.B.kicks; const p = m.porteur;
      m.tick(0.1);
      if (m.stats.A.kicks + m.stats.B.kicks > k0 && p) {
        tot++; const g = p.numero <= 8 ? 'avants' : p.numero; par[g] = (par[g] || 0) + 1;
      }
    }
  }
  const part = (g) => (par[g] || 0) / tot;
  assert.ok(tot > 120, `echantillon trop petit : ${tot} coups de pied`);
  assert.ok(part('avants') < 0.08, `${(100 * part('avants')).toFixed(0)} % des coups de pied sont tapes par des avants`);
  assert.ok(part(9) > 0.2, `le demi de melee ne tape que ${(100 * part(9)).toFixed(0)} % des coups de pied (chandelle depuis la base)`);
  assert.ok(part(9) + part(10) + part(15) > 0.55, `n°9, 10 et 15 ne tapent que ${(100 * (part(9) + part(10) + part(15))).toFixed(0)} % des coups de pied`);
});

test('le ballon est EN JEU des l introduction en melee et des le lancer en touche', () => {
  // Definition du temps de jeu effectif (World Rugby) : le chronometre du
  // ballon en jeu tourne des que le ballon est introduit dans la melee, ou
  // lance en touche. Le moteur annoncait n'exclure que la FORMATION (liaison
  // des packs, alignement avant le lancer), mais excluait les phases MELEE et
  // TOUCHE entieres : ~1,5 a 2 min de vrai jeu par match disparaissaient du
  // temps de jeu effectif et de la possession. Cf. TODO_AUDIT.md P2-59.
  let vivantsCompte = 0, vivants = 0, mortsCompte = 0, morts = 0;
  const VIVANTS = ['MELEE_INTRODUCTION', 'MELEE_CONTESTATION', 'MELEE_SORTIE'];
  for (const seed of [1, 2]) {
    const m = new MatchEngine(seed, 4800);
    for (let t = 0; t < 4800; t += 0.1) {
      const phase = m.phase, etat = m.melee ? m.melee.etat : null, lancer = !!m.toucheLancer;
      const avant = m.tempsJeuEffectif;
      m.tick(0.1);
      if (m.phase !== phase) continue; // tick de transition : on ne juge que les ticks stables
      const compte = m.tempsJeuEffectif > avant;
      if ((phase === 'MELEE' && VIVANTS.includes(etat)) || (phase === 'TOUCHE' && lancer)) { vivants++; if (compte) vivantsCompte++; }
      if ((phase === 'MELEE' && etat === 'MELEE_FORMATION') || (phase === 'TOUCHE' && !lancer)) { morts++; if (compte) mortsCompte++; }
    }
  }
  assert.ok(vivants > 200 && morts > 2000, `echantillon trop petit (${vivants} / ${morts})`);
  assert.ok(vivantsCompte / vivants > 0.95, `ballon introduit ou lance mais pas compte en jeu : ${vivantsCompte}/${vivants} ticks`);
  assert.strictEqual(mortsCompte, 0, `formation de melee ou alignement de touche compte comme du jeu : ${mortsCompte} ticks`);
});

test('un porteur qui PASSE la ligne de defense est compte et annonce comme un franchissement', () => {
  // Definition courante (Opta) : le porteur franchit la premiere ligne de
  // defense, qu'il ait ou non battu un plaqueur. Le moteur ne comptait qu'apres
  // un plaquage MANQUE suivi d'espace : 4,7 franchissements par match (reel :
  // 18), alors que 69 % des essais suivent une course ou le porteur n'a plus
  // personne devant lui. La feuille de match montrait « 2 - 3 franchissements »
  // apres des essais de 50 m. Cf. TODO_AUDIT.md P2-60.
  let franchissements = 0, annonces = 0;
  const N = 4;
  for (let seed = 1; seed <= N; seed++) {
    const m = new MatchEngine(seed, 4800);
    const o = m.log.bind(m);
    m.log = (type, eq, msg, extra) => { if (type === 'FRANCHISSEMENT') annonces++; return o(type, eq, msg, extra); };
    for (let t = 0; t < 4800; t += 0.1) m.tick(0.1);
    franchissements += m.stats.A.franchissements + m.stats.B.franchissements;
  }
  const parMatch = franchissements / N;
  assert.ok(parMatch >= 8 && parMatch <= 30, `${parMatch.toFixed(1)} franchissements par match (reel ~18)`);
  assert.ok(annonces > 0 && annonces <= franchissements, `${annonces} franchissements annonces pour ${franchissements} comptes`);
});

test('le tableau de marque se reconstruit a partir des statistiques, et les compteurs sont coherents', () => {
  // Transformations, penalites au but, drops, rucks conserves, melees et
  // touches gagnees sur SON ballon : CLAUDE.md (role 6) les exige, la feuille
  // de match ne les montrait pas. Comptes la ou l'action a lieu — le score doit
  // donc se reconstruire EXACTEMENT a partir d'eux. Cf. TODO_AUDIT.md P2-63.
  let rucks = 0, conserves = 0, melees = 0, meleesIntro = 0, touches = 0, touchesLancer = 0, transfoT = 0, transfoR = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const m = new MatchEngine(seed, 4800);
    for (let t = 0; t < 4800; t += 0.1) m.tick(0.1);
    for (const e of ['A', 'B']) {
      const s = m.stats[e];
      const points = 5 * (s.essais - s.essaisPenalite) + 7 * s.essaisPenalite
        + 2 * s.transformationsReussies + 3 * s.penalitesButReussies + 3 * s.dropsReussis;
      assert.strictEqual(points, m.score[e], `graine ${seed}, equipe ${e} : les statistiques donnent ${points} points, le score ${m.score[e]}`);
      assert.ok(s.transformationsReussies <= s.transformationsTentees && s.penalitesButReussies <= s.penalitesButTentees
        && s.dropsReussis <= s.dropsTentes, `graine ${seed}, equipe ${e} : plus de tirs reussis que tentes`);
      assert.ok(s.transformationsTentees <= s.essais - s.essaisPenalite, `graine ${seed} : plus de transformations que d'essais`);
      rucks += s.rucks; conserves += s.rucksConserves; melees += s.scrums; meleesIntro += s.scrumsGagnesIntro;
      touches += s.lineouts; touchesLancer += s.lineoutsGagnesLancer; transfoT += s.transformationsTentees; transfoR += s.transformationsReussies;
    }
  }
  // Coherence, pas realisme : jamais plus de reussites que de tentatives,
  // et des proportions qui ont un sens. Les ECARTS AU REEL (rucks conserves
  // 86 % contre 93-95, melees sur introduction 72 % contre ~90,
  // transformations 59 % contre ~70-75) sont consignes en TODO_AUDIT.md
  // P2-63 : des seuils poses juste sous les valeurs du moteur basculeraient
  // sur du bruit.
  const pc = (a, b) => a / b;
  for (const [nom, a, b] of [['rucks conserves', conserves, rucks], ['melees gagnees sur introduction', meleesIntro, melees],
    ['touches gagnees sur lancer', touchesLancer, touches], ['transformations reussies', transfoR, transfoT]]) {
    assert.ok(b > 0 && pc(a, b) > 0.3 && pc(a, b) <= 1, `${nom} : ${a}/${b}`);
  }
});

// --- UNE REMISE EN JEU DEPUIS LES 22 M N'EST PAS UN COUP D'ENVOI -----------
// Apres une penalite au but ou un drop manques, le ballon repart de la ligne
// des 22 m de l'equipe qui defendait — le moteur le faisait bien. Mais il
// l'annonçait « Coup d'envoi botte par l'equipe B, l'equipe A doit rester a
// 10 m » : 2,75 remises en jeu par match sur 20 matchs (1,95 apres une penalite
// manquee, 0,80 apres un drop manque). Le joueur lisait « coup d'envoi » en
// voyant le ballon partir des 22 m, avec la consigne des 10 m qui n'est pas
// celle du renvoi.
//
// L'assertion est SYMETRIQUE et c'est verifie dans les deux sens : rouge sur le
// moteur d'avant (aucun renvoi annonce, un « coup d'envoi » botte depuis
// x = 78), rouge aussi sur un mutant qui annonce TOUT en renvoi (aucun coup
// d'envoi observe). Le libelle doit suivre le point de depart, dans les deux sens.
test("une remise en jeu depuis les 22 m est annoncee RENVOI AUX 22 M, pas coup d'envoi", () => {
  let envois = 0, renvois = 0;
  const fautifs = [];
  for (let seed = 1; seed <= 4; seed++) {
    const m = new MatchEngine(seed, 4800);
    const orig = m.log.bind(m);
    m.log = (type, eq, txt) => {
      if (type === 'COUP_ENVOI' || type === 'RENVOI_22') {
        // Le point de remise en jeu est `xCoupEnvoi`. Depuis P2-84, au moment
        // de l'annonce, le ballon est encore là où il était (il revient ensuite
        // au botteur, à vue) : `ballonVolX` n'est plus ce point.
        const x = m.xCoupEnvoi;
        const auMilieu = Math.abs(x - LONGUEUR / 2) < 0.5;
        if (type === 'COUP_ENVOI') envois++; else renvois++;
        if ((type === 'COUP_ENVOI') !== auMilieu) fautifs.push(`${type} depuis x=${x.toFixed(1)} : « ${txt} »`);
      }
      return orig(type, eq, txt);
    };
    for (let t = 0; t < 4800; t += 0.1) m.tick(0.1);
  }
  assert.ok(envois > 0, 'aucun coup d envoi observe : le test ne mesure rien');
  assert.ok(renvois > 0, `aucun renvoi aux 22 m annonce sur 4 matchs alors que le moteur en joue ~2,75 par `
    + `match : ils sont annonces « Coup d'envoi ». Exemple : ${fautifs[0] || '-'}`);
  assert.strictEqual(fautifs.length, 0, `${fautifs.length} remise(s) en jeu mal annoncee(s), ex. ${fautifs[0]}`);
});

// --- LE BANC DE MESURE DOIT TOURNER AU PAS DU JEU --------------------------
// Defaut trouve en faisant tourner la calibration au pas REEL du navigateur :
// elle tournait a 0,2 s, le jeu tourne a 0,1 s (docs/js/constants.js PAS_FIXE),
// et au pas reel le moteur ECHOUAIT sa propre calibration — 11/14, categorie
// essentielle « lineouts » a 18,1 pour une fourchette [20-35] — pendant que le
// banc annoncait 12/14. Le match affiche a l'ecran n'avait jamais ete calibre.
//
// Le pas change VRAIMENT le jeu : meme moteur, memes graines, 47,6 coups de
// pied a 0,1 s contre 59,0 a 0,2 s, 18,1 touches contre 21,3. Ce n'est donc pas
// un detail d'outil. Ce test empeche les deux pas de diverger a nouveau en
// silence : c'est la seule chose qui garantit que ce qu'on mesure est ce qu'on
// joue. Cf. TODO_AUDIT.md P2-41.
test('le banc de calibration tourne au PAS DE SIMULATION DU JEU', () => {
  const fs = require('fs');
  const path = require('path');
  const racine = path.join(__dirname, '..');
  const lire = (fichier, motif, quoi) => {
    const texte = fs.readFileSync(path.join(racine, fichier), 'utf8');
    const m = texte.match(motif);
    assert.ok(m, `impossible de lire ${quoi} dans ${fichier} — le motif a change, ce test ne protege plus rien`);
    return parseFloat(m[1]);
  };
  const pasDuJeu = lire('docs/js/constants.js', /const PAS_FIXE\s*=\s*([0-9.]+)/, 'PAS_FIXE');
  const pasDuBanc = lire('server/test-calibration-moteur.js', /^const DT = ([0-9.]+);/m, 'DT');
  assert.strictEqual(pasDuBanc, pasDuJeu,
    `le banc de calibration mesure a ${pasDuBanc} s alors que le jeu tourne a ${pasDuJeu} s. `
    + `Mesure : le meme moteur produit 47,6 coups de pied et 18,1 touches a 0,1 s, contre 59,0 `
    + `et 21,3 a 0,2 s. Calibrer a un pas qu'on ne joue pas, c'est regler une partie qui n'existe pas.`);
});

// --- LOI 16 : UNE MELEE NE SE SIFFLE PAS SUR UN MAUL QUI AVANCE ------------
// Trouve par un CONTROLE D'ARBITRAGE apres le correctif de poussee du maul,
// pas par la suite de tests : aucun test ne regardait la CAUSE de la fin d'un
// maul. Le garde-fou anti-blocage appelait `_maulMeleeInjouable()` des 45 s.
// La loi 16.16/16.17 ne permet la melee que sur ballon injouable, ecroulement
// ou « use it » non execute — jamais parce que le maul dure.
//
// CE QUE MON PROPRE CORRECTIF AVAIT FAIT. Tant que les mauls mouraient a 8,4 s
// le garde-fou ne servait presque jamais (2 % des mauls). En les allongeant a
// 23 s, il est devenu la sortie PRINCIPALE : 27 mauls sur 104 (26 %) au pas
// reel du jeu, dont 24 EN MOUVEMENT. La possession changeait sans declencheur
// legal, et systematiquement au detriment du pack dominant.
//
// LE TEST INTERROGE LES DEUX PAS DE SIMULATION, ET C'EST VOULU. Le moteur
// tourne a 0,1 s dans le navigateur (docs/js/constants.js PAS_FIXE) mais a
// 0,2 s sur les bancs de mesure (server/test-calibration-moteur.js). Le defaut
// etait DEUX FOIS PLUS FREQUENT au pas reel qu'au pas du banc (26 % contre
// 13 %) : un test qui n'aurait regarde que 0,2 s aurait sous-estime de moitie
// ce que le joueur subit.
//
// ROUGE PUIS VERT, verifie : 11 mauls illegaux sur 50 avant correctif, 0 apres.
test('loi 16 : un maul qui AVANCE ne peut pas etre termine par une melee', () => {
  function meleesSurMaulEnMouvement(pas, graines) {
    let mauls = 0, illegales = 0;
    for (const seed of graines) {
      const m = new MatchEngine(seed, 4800);
      let avant = m.phase;
      for (let t = 0; t < 4800; t += pas) {
        // L'etat est lu AVANT le tick : _maulMeleeInjouable() detruit l'objet
        // maul pendant le tick. Premiere version de cet instrument : je lisais
        // maul.timerGlobal apres coup et je comparais a 45 — le tick exact du
        // coup de sifflet etait rate, et l'instrument annoncait 0 %.
        const etatAvant = m.maul ? m.maul.etat : null;
        m.tick(pas);
        if (avant === 'MAUL' && m.phase !== 'MAUL') {
          mauls++;
          if (m.phase === 'MELEE' && etatAvant === 'MAUL_MOVING') illegales++;
        }
        avant = m.phase;
      }
    }
    return { mauls, illegales };
  }
  const graines = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  for (const pas of [0.1, 0.2]) {
    const r = meleesSurMaulEnMouvement(pas, graines);
    assert.strictEqual(r.illegales, 0,
      `pas de simulation ${pas} : ${r.illegales} maul(s) sur ${r.mauls} se terminent par une `
      + `melee alors qu'ils AVANCENT encore. La loi 16 ne permet la melee que sur ballon `
      + `injouable, ecroulement, ou "use it" non execute — jamais parce que le maul dure.`);
  }
});

// --- LE DEMI DE MELEE DOIT SE SERVIR DE SES AVANTS -------------------------
// P1-xx a rendu le jeu au pres PILOTABLE dans les cinq derniers metres
// (cfgAttaque.jeuAuPresLigne, module par profilJeuAuPres). Partout AILLEURS le
// taux est reste la constante historique 0,18 — `tauxAvantLance` vaut
// litteralement `zone === 'CINQ_M' ? tauxPres : zone === 'OPP_22' ?
// tauxPres * 0.35 : 0.18`. Sur les trois quarts du terrain, donc, le n°9 de
// TOUS les clubs sort le ballon exactement de la meme facon.
//
// Mesure sur 10 matchs, cible REELLE de chaque passe du n°9 (1 825 passes) :
//   vers le n°10      63,5 %   recul -4,51 m
//   vers un AVANT     16,9 %   recul -2,45 m
//   vers le n°15      10,2 %   recul -7,12 m
// Un vrai demi de melee alterne : environ un tiers des sorties de regroupement
// partent au pres (pick-and-go, passe a plat a un avant lance).
//
// CE QUE CE CORRECTIF N'APPORTE PAS, ET IL FAUT LE DIRE : du terrain.
// Comparaison APPARIEE sur 300 graines (Bonferroni) : gain/temps de jeu
// -0,062 +/- 0,162, NON ETABLI, comme les dix autres metriques du banc. Le jeu
// confine au milieu du terrain (P2-15) reste entier.
//
// NB : ce commentaire a porte une decomposition de ce gain (course contre
// recul des passes). Elle etait FAUSSE et a ete retiree — cf. TODO_AUDIT.md
// P2-33 pour le detail de l'erreur d'instrument et de ce qui reste etabli.
//
// Ce que le correctif apporte est ailleurs, et c'est un critere de refus
// EXPLICITE de CLAUDE.md : « les avants et les trois-quarts jouent exactement
// pareil », « les memes actions se repetent tout le temps ». Sur les trois
// quarts du terrain, le n°9 de tous les clubs sortait le ballon a l'identique.
//
// CE N'EST PAS UN RAIL. Comme le jeu au pres pres de la ligne, le taux devient
// une CONSIGNE D'EQUIPE (`cfgAttaque.sortieAvant`, pilotable par le Mode Club
// via attaqueA / attaqueB) modulee par l'EFFECTIF REELLEMENT ALIGNE (meme
// `profilJeuAuPres` : puissance du pack contre vitesse de la ligne). Deux
// equipes ne sortent donc pas le ballon de la meme facon, et le joueur decide.
function partAvantsSortieNeuf(config, graines) {
  let avants = 0, total = 0;
  for (const seed of graines) {
    const m = new MatchEngine(seed, 4800, config);
    let attente = null;
    const brut = m.log.bind(m);
    m.log = (type, team, msg, extra) => {
      if ((type === 'PASSE' || type === 'JEU_LARGE') && extra && extra.de === 9 && m.porteur) {
        attente = { vers: extra.vers };
      }
      return brut(type, team, msg, extra);
    };
    for (let t = 0; t < 4800; t += 0.2) {
      m.tick(0.2);
      if (attente) { total++; if (attente.vers <= 8) avants++; attente = null; }
    }
  }
  return { part: 100 * avants / total, total };
}
test('le demi de melee se sert de ses avants a la sortie du regroupement', () => {
  const r = partAvantsSortieNeuf(undefined, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(r.total > 800, `echantillon trop petit (${r.total} passes du n°9)`);
  // Seuil a 22 % : la revendication defendable est « un quart a un tiers des
  // passes du 9 », pas un chiffre au point pres. Il reste mordant — l'ancien
  // comportement (16,9 %) le fait rougir avec de la marge.
  assert.ok(r.part >= 22,
    `le n°9 ne sert un avant que dans ${r.part.toFixed(1)} % de ses passes : il sort `
    + `mecaniquement vers l ouvreur (mesure avant correctif : 16,9 %)`);
});
test('la sortie de regroupement est une CONSIGNE d equipe, pas un rail', () => {
  const graines = [1, 2, 3, 4, 5, 6];
  const auPres = partAvantsSortieNeuf({ attaqueA: { sortieAvant: 0.75 }, attaqueB: { sortieAvant: 0.75 } }, graines);
  const auLarge = partAvantsSortieNeuf({ attaqueA: { sortieAvant: 0.05 }, attaqueB: { sortieAvant: 0.05 } }, graines);
  assert.ok(auPres.part - auLarge.part >= 15,
    `consigne « au pres » ${auPres.part.toFixed(1)} % contre « au large » ${auLarge.part.toFixed(1)} % : `
    + `la consigne d equipe ne change pas assez le jeu pour que le joueur la voie`);
});
test('la sortie de regroupement depend de l EFFECTIF aligne, pas seulement de la consigne', () => {
  // Meme consigne, deux effectifs opposes : un pack lourd devant une ligne
  // lente doit jouer plus au pres qu'un pack leger devant une ligne rapide.
  // C'est la garantie que les joueurs du club comptent vraiment.
  const lourd = {}, leger = {};
  for (let n = 1; n <= 8; n++) { lourd[n] = { puissance: 95 }; leger[n] = { puissance: 35 }; }
  for (let n = 9; n <= 15; n++) { lourd[n] = { vitesse: 45 }; leger[n] = { vitesse: 95 }; }
  const graines = [1, 2, 3, 4, 5, 6];
  const a = partAvantsSortieNeuf({ joueursA: lourd, joueursB: lourd }, graines);
  const b = partAvantsSortieNeuf({ joueursA: leger, joueursB: leger }, graines);
  assert.ok(a.part - b.part >= 5,
    `pack lourd/ligne lente ${a.part.toFixed(1)} % contre pack leger/ligne rapide ${b.part.toFixed(1)} % : `
    + `l effectif reellement aligne ne change pas la sortie de regroupement`);
});

// --- UNE INTERCEPTION, C'EST UNE PASSE LONGUE ------------------------------
// L'interception etait tiree a TAUX PLAT (PROBA_INTERCEPTION, module par la
// seule adresse du defenseur) des qu'un defenseur se trouvait a moins de 1,2 m
// du couloir de passe. La LONGUEUR de la passe n'entrait nulle part.
//
// Consequence mesuree sur 30 matchs, en instrumentant la fonction elle-meme :
// la passe interceptee moyenne faisait 4,3 m, la mediane 2,7 m. Le moteur
// n'interceptait donc pas des passes : il ramassait des POPS a deux metres,
// c'est-a-dire des ballons que le receveur a deja dans les mains. Les trois
// quarts des prises (0,39 sur 0,52 par match) etaient sur des passes de moins
// de six metres.
//
// En rugby, l'interception est l'evenement de la passe LONGUE : la sautee, la
// croisee, le renversement. Elle existe parce que le ballon reste EN L'AIR
// assez longtemps pour qu'un defenseur la lise et parte dessus — un pop a deux
// metres ne dure pas assez pour cela, et personne n'intercepte une passe de
// fixation. Deux choses doivent donc dependre de la longueur : le temps de
// lecture (probabilite de prise) et la distance que le defenseur peut couvrir
// pendant le vol (largeur du couloir).
test('une interception, c est une passe LONGUE, pas un pop a deux metres', () => {
  // 1. A GEOMETRIE EGALE, la passe longue doit etre plus interceptable.
  // Etat fige : meme defenseur, meme adresse, meme ecart perpendiculaire au
  // couloir, meme position relative (mi-chemin) — seule la longueur change.
  function tauxPrise(longueurPasse, ecartCouloir) {
    let pris = 0, n = 0;
    for (const seed of [11, 12, 13, 14, 15]) {
      const m = new MatchEngine(seed, 600);
      for (let t = 0; t < 30; t += 0.2) m.tick(0.2);
      m.possession = 'A';
      const passeur = m.equipeA.find((j) => j.numero === 10);
      const cible = m.equipeA.find((j) => j.numero === 14);
      passeur.x = 50; passeur.y = 30; passeur.auSol = 0;
      cible.x = 49; cible.y = 30 + longueurPasse; cible.auSol = 0;
      for (const j of m.equipeB) {
        j.auSol = 0; j.horsJeuKick = 0; j.sinBin = 0; j.x = 95; j.y = 68;
        j.adresse = 60;
      }
      const d = m.equipeB.find((j) => j.numero === 13);
      d.x = (passeur.x + cible.x) / 2 + ecartCouloir;
      d.y = (passeur.y + cible.y) / 2;
      for (let k = 0; k < 400; k++) { n++; if (m._chercherInterception(passeur, cible)) pris++; }
    }
    return 100 * pris / n;
  }
  const courte = tauxPrise(3, 0.6);   // un pop de fixation
  const longue = tauxPrise(16, 0.6);  // une sautee
  assert.ok(longue > courte * 3,
    `a geometrie identique, la sautee de 16 m est prise dans ${longue.toFixed(1)} % des cas `
    + `et le pop de 3 m dans ${courte.toFixed(1)} % : la longueur de la passe ne change rien `
    + `(mesure avant correction : 6,9 % contre 6,9 %)`);
  assert.ok(courte < 1.5,
    `un pop de 3 m est intercepte dans ${courte.toFixed(1)} % des cas : le receveur a deja `
    + `le ballon dans les mains (mesure avant correction : 6,9 %)`);

  // 2. SUR DE VRAIS MATCHS, la passe interceptee doit RESSEMBLER a une sautee.
  // C'est l'assertion qui compte : elle ne lit pas une formule, elle mesure la
  // longueur des passes que le moteur intercepte reellement en 80 minutes.
  let sommeL = 0, prises = 0;
  const GRAINES = 12, DUREE = 4800, DT = 0.2;
  for (let seed = 1; seed <= GRAINES; seed++) {
    const m = new MatchEngine(seed, DUREE);
    const orig = m._chercherInterception.bind(m);
    m._chercherInterception = function (passeur, cible) {
      const r = orig(passeur, cible);
      if (r) { prises++; sommeL += Math.hypot(cible.x - passeur.x, cible.y - passeur.y); }
      return r;
    };
    for (let t = 0; t < DUREE; t += DT) m.tick(DT);
  }
  const longueurMoyenne = sommeL / prises;
  const parMatch = prises / GRAINES;
  assert.ok(longueurMoyenne >= 9,
    `la passe interceptee moyenne fait ${longueurMoyenne.toFixed(1)} m : le moteur ramasse des `
    + `pops, pas des sautees (mesure avant correction : 4,3 m, mediane 2,7 m)`);
  // Garde-fou de frequence : l'interception est RARE (~1 par match en vrai).
  // Une pluie d'interceptions se verrait a l'ecran autant qu'une absence.
  assert.ok(parMatch >= 0.4 && parMatch <= 2.2,
    `${parMatch.toFixed(2)} interception(s) par match : hors de la fourchette reelle (0,4 a 2,2)`);
});

// --- DEUX EQUIPES NE JOUENT PAS PAREIL AU MEME ENDROIT ---------------------
// Un joueur decide de jouer comme il le souhaite : ce n'est pas un jeu de
// voiture sur rail ou tout le monde suit la meme trajectoire. Le jeu au pres
// dans les cinq derniers metres est donc un REGLAGE D'EQUIPE
// (`cfgAttaque.jeuAuPresLigne`, pilotable par le Mode Club via attaqueA /
// attaqueB), module par l'effectif REELLEMENT aligne (cf. profilJeuAuPres :
// pack puissant contre ligne rapide).
//
// Ce test verifie que la consigne change VRAIMENT le jeu : la meme graine, le
// meme terrain, la meme situation — mais deux intentions opposees doivent
// produire deux matchs qui ne se jouent pas de la meme facon pres de la ligne.
test('la consigne de l equipe change le jeu : deux intentions opposees ne se jouent pas pareil', () => {
  // CE TEST A ETE REECRIT : LA GRANDEUR A CHANGE, ET LE SEUIL EST DEVENU PLUS
  // EXIGEANT, PAS MOINS.
  //
  // Il mesurait la PART DES AVANTS dans les portages des cinq derniers metres —
  // une trace agregee du comportement, sur ~230 portages par branche. Cette
  // grandeur est trop bruitee pour porter un garde-fou :
  //   seuil 15 -> tombe a 12,6 puis 13,8 sur des correctifs sans rapport
  //   seuil  8 -> tombe a  7,9 sur un correctif de penalite en touche
  // Mesure sur trois lots de graines disjoints, 48 graines chacun : l'ecart va
  // de 7,7 a 15,1 SUR LE MEME MOTEUR. Doubler l'echantillon n'y suffit pas (la
  // dispersion ne decroit pas comme sqrt(n) : les graines sont correlees), et
  // elargir la zone aux 22 m degrade le rapport signal/bruit (effet 3,1 points
  // pour +/-3,7, la consigne n'y agissant qu'a 0,35x).
  //
  // On interroge donc LA DECISION ELLE-MEME, en etat fige : le n°9 tient le
  // ballon a 3 m de la ligne adverse, un avant lance a plat a cote de lui,
  // l'ouvreur en retrait — exactement la situation que `jeuAuPresLigne` pilote.
  // 400 interrogations par graine, sans laisser personne bouger.
  //
  // Le gain est de deux ordres de grandeur :
  //                        effet mesure    dispersion entre lots
  //   part des portages     7,7 a 15,1        7,4 points
  //   decision en etat fige  83,9 a 84,5      0,6 point
  // Et la mesure est IDENTIQUE A LA DECIMALE sur deux versions du moteur, dont
  // celle qui avait fait echouer l'ancienne version de ce test.
  function tauxAvantServi(consigne) {
    let avant = 0, n = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const m = new MatchEngine(seed, 600, {
        attaqueA: { jeuAuPresLigne: consigne }, attaqueB: { jeuAuPresLigne: consigne },
      });
      for (let t = 0; t < 30; t += 0.2) m.tick(0.2);
      m.phase = 'PORTE'; m.timerPhase = 3; m.possession = 'A';
      m.passeVisuelle = null; m.combinaison = null; m.penaliteRecul = null;
      m.ruckPoint = { x: 97, y: 30 }; m.maul = null;
      const neuf = m.equipeA.find((j) => j.numero === 9);
      const huit = m.equipeA.find((j) => j.numero === 8);
      const dix = m.equipeA.find((j) => j.numero === 10);
      m.porteur = neuf;
      neuf.auSol = 0; neuf.x = 97; neuf.y = 30; neuf._enchaine = 0;
      huit.auSol = 0; huit.x = 97; huit.y = 33;   // avant lance, a plat
      dix.auSol = 0; dix.x = 92; dix.y = 26;      // ouvreur en retrait
      for (const j of m.equipeA) if (j !== neuf && j !== huit && j !== dix) { j.auSol = 0; j.x = 60; j.y = 5; }
      for (const j of m.equipeB) {
        j.auSol = 0; j.horsJeuKick = 0; j.fixeCooldown = 0; j.missCooldown = 0;
        j.ruckRecovery = 0; j.sinBin = 0; j.x = 99; j.y = 68;
      }
      const def = m.equipeB.find((j) => j.numero === 6);
      def.x = 99; def.y = 30;
      for (let k = 0; k < 400; k++) {
        m._neufLibre = true; m._passeCibleForcee = null;
        if (m.choisirActionPorteur(neuf, def, 2.0, 0.2) === 'PASS') {
          n++;
          if (m._passeCibleForcee && m._passeCibleForcee.numero <= 8) avant++;
        }
      }
    }
    return n ? 100 * avant / n : NaN;
  }
  const auPres = tauxAvantServi(0.95);   // « on joue le pack »
  const auLarge = tauxAvantServi(0.10);  // « on ecarte, meme a 3 m »
  // Seuil a 60 : la plus petite valeur mesuree vaut 83,9, et neutraliser la
  // consigne donne ~0. Ce garde-fou est donc NETTEMENT plus exigeant que la
  // version precedente (8 points), tout en etant beaucoup plus stable.
  assert.ok(auPres - auLarge >= 60,
    `consigne "au pres" ${auPres.toFixed(1)} % d avants servis contre "au large" `
    + `${auLarge.toFixed(1)} % : l ecart de ${(auPres - auLarge).toFixed(1)} points ne se voit pas. `
    + `La consigne de l equipe ne doit pas etre decorative.`);
});

// --- PERCUTER N'EST PAS LA MEME CHOSE QUE TROUVER L'ESPACE -----------------
// Mesure au banc A/B sur 300 matchs apparies, cinq variantes du passage au
// contact (cf. TODO_AUDIT.md P2-22) : `gain par temps de jeu` vaut 1,46 m pour
// le moteur et 1,45 a 1,51 m pour TOUTES les variantes. Autrement dit, le
// moteur rendait exactement autant de terrain quand le porteur percutait au ras
// d'une defense en place que quand il attaquait un espace. Aller au contact
// etait une option GRATUITE, et la decision du porteur — la premiere que
// CLAUDE.md (role 4) exige de lui — n'avait aucune consequence visible.
//
// Au rugby, une percussion d'un homme dans une defense en place gagne 0 a 1 m ;
// c'est le ballon qui circule et cree le surnombre qui gagne du terrain.
//
// Le scenario ci-dessous isole exactement cette difference : meme porteur, meme
// plaqueur, meme position — seul change ce qu'il y a DEVANT lui.
test("percuter une defense en place ne rapporte pas autant que trouver l espace", () => {
  // Gain de terrain au contact selon le nombre de defenseurs (en plus du
  // plaqueur) postes dans le couloir devant le porteur.
  function gainAuContact(nbDevant, seed) {
    const m = new MatchEngine(seed, 600);
    for (let t = 0; t < 30; t += 0.2) m.tick(0.2);
    m.phase = 'PORTE';
    m.timerPhase = 2;
    m.possession = 'A';
    m.passeVisuelle = null;
    m.combinaison = null;
    m.penaliteRecul = null;
    m.ruckPoint = null;
    m._porteApresPied = false; // etat herite de l'echauffement (P2-52)
    const porteur = m.equipeA.find((j) => j.numero === 8);
    m.porteur = porteur;
    porteur.auSol = 0;
    porteur.x = 50;
    porteur.y = 35;
    // Les coequipiers sont loin : aucune passe possible, le porteur va au contact.
    for (const j of m.equipeA) {
      if (j === porteur) continue;
      j.auSol = 0; j.x = 20; j.y = 5;
    }
    // Toute la defense est renvoyee au loin, sauf ceux qu'on place exprès.
    for (const j of m.equipeB) {
      j.auSol = 0; j.horsJeuKick = 0; j.fixeCooldown = 0; j.missCooldown = 0;
      j.ruckRecovery = 0; j.x = 95; j.y = 65;
    }
    const defenseurs = m.equipeB.filter((j) => j.numero <= 8);
    // Le plaqueur, juste dans le rayon de contact.
    defenseurs[0].x = 52.0;
    defenseurs[0].y = 35;
    // Le rideau devant lui (defense en place) ou rien du tout (espace).
    for (let i = 0; i < nbDevant; i++) {
      defenseurs[i + 1].x = 53.5 + i * 0.8;
      defenseurs[i + 1].y = 33 + i * 2;
    }
    const xDepart = porteur.x;
    for (let t = 0; t < 6; t += 0.2) {
      m.tick(0.2);
      if (m.phase === 'RUCK' && m.ruckPoint) return m.ruckPoint.x - xDepart;
      if (m.phase !== 'PORTE') return null; // essai, touche, penalite : hors sujet
    }
    return null;
  }
  // Plusieurs graines : le plaquage dominant est tire au sort (30 % quand le
  // plaqueur domine nettement), donc un seul contact ne dit rien.
  const enPlace = [], espace = [];
  // 36 graines, pas 12 : le scenario herite de 30 s d'echauffement, donc toute
  // modification du moteur change l'etat de depart. Sur 12 graines, l'ecart
  // variait de 0,72 a 1,23 m d'un jeu de graines a l'autre pour le MEME
  // moteur, et une modification sans rapport le faisait passer sous le seuil
  // (P2-52). Sur 36 graines : 0,99 m.
  for (let seed = 31; seed <= 66; seed++) {
    const a = gainAuContact(3, seed);
    const b = gainAuContact(0, seed);
    if (a !== null) enPlace.push(a);
    if (b !== null) espace.push(b);
  }
  assert.ok(enPlace.length >= 8 && espace.length >= 8,
    `echantillon trop petit (${enPlace.length} contacts en place, ${espace.length} en espace)`);
  const moy = (t) => t.reduce((x, y) => x + y, 0) / t.length;
  const gEnPlace = moy(enPlace), gEspace = moy(espace);
  // Une seule assertion, et c'est la bonne : l'ECART entre les deux situations.
  // J'avais d'abord ajoute un plancher absolu (« percuter doit rapporter moins
  // de 0,6 m »), mais il confondait deux choses : la chute en avant au contact,
  // qui est le parametre reglé dans le moteur, et le gain NET du scenario, qui
  // comprend aussi la course du porteur et les ~15 % de plaquages manques. Un
  // seuil absolu sur la seconde ne dit rien de la premiere. L'ecart, lui, annule
  // ces termes communs : c'est exactement la propriete mesuree nulle au banc.
  assert.ok(gEspace - gEnPlace >= 0.6,
    `percuter une defense en place rapporte ${gEnPlace.toFixed(2)} m et attaquer l espace `
    + `${gEspace.toFixed(2)} m : l ecart de ${(gEspace - gEnPlace).toFixed(2)} m ne se voit pas. `
    + `Tant qu il est nul, le choix du porteur entre passer et percuter n a aucune consequence.`);
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
  // 16 graines (P2-58) : rejoue sur des graines decalees (+1000, +2000), le
  // MEME moteur tombait a 26 franchissements (echantillon trop petit) ou a
  // 11,9 m pour un seuil de 12. Sur 16 graines : ~14 m.
  const gains = [];
  for (let seed = 1; seed <= 16; seed++) {
    const m = new MatchEngine(seed, 4800);
    let suivi = null;
    for (let t = 0; t < 4800; t += 0.2) {
      const avant = m.stats.A.franchissements + m.stats.B.franchissements;
      const manquesAvant = m.stats.A.missedTackles + m.stats.B.missedTackles;
      m.tick(0.2);
      const apres = m.stats.A.franchissements + m.stats.B.franchissements;
      // Le porteur qui BAT SON VIS-A-VIS : franchissement ne d'un plaquage
      // manque dans ce pas. Depuis P2-60, le compteur compte aussi le porteur
      // qui passe la ligne sans etre touche, et ce comptage tombe en fin de
      // course (ligne passee + 5 m) : le suivre mesurait la fin de l'action,
      // pas la percee.
      const manque = m.stats.A.missedTackles + m.stats.B.missedTackles > manquesAvant;
      if (apres > avant && manque && m.porteur) {
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
  let coupsDePied = 0, marques = 0, plaquagesHorsJeu = 0;
  const masse = { libre: { n: 0, s: 0 }, disputee: { n: 0, s: 0 } };
  // 6 graines, pas 4 (P2-58) : rejoue sur des graines decalees, le meme
  // moteur ne donnait que 56 a 60 receptions de coups de pied non disputes,
  // sous la taille d'echantillon exigee plus bas.
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const m = new MatchEngine(seed, 4800);
    let typeCoup = null;
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
        // Position AU MOMENT DE LA FRAPPE (loi 10), enregistree par le moteur :
        // le botteur peut encore bouger de quelques centimetres dans le meme
        // pas de temps. Mesure sur sa position apres le pas, un coequipier a
        // 0,9 m devant le point de frappe (donc en jeu) etait compte « devant »
        // (P2-57, graine 4 : chandelle du n°9 frappee a 9,8 m, botteur a 9,7 m).
        const xFrappe = m.xCoupDePiedJeu;
        // Devant AVANT et APRÈS le pas : la frappe a lieu au milieu du pas, et
        // seule cette double condition garantit « devant au moment de la
        // frappe ». Mesuré après le pas seulement, un talonneur à 1,0 m — en
        // jeu à la frappe, quelques centimètres plus loin à la fin du pas —
        // était compté non marqué (P2-78, graine 4, 198/199).
        const devant = equipe.filter((j) => j !== botteur && (j.x - xFrappe) * botteur.sensAttaque > 1
          && (positions.get(j).x - xFrappe) * botteur.sensAttaque > 1);
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
      if (m.phase === 'COUP_DE_PIED_JEU') typeCoup = m.typeCoupDePiedJeu;
      if (phaseAvant === 'COUP_DE_PIED_JEU' && m.phase === 'PORTE' && m.porteur) {
        let n = 0;
        for (const j of [...m.equipeA, ...m.equipeB]) {
          if (Math.hypot(j.x - m.porteur.x, j.y - m.porteur.y) < 8) n++;
        }
        const k = (typeCoup === 'CHANDELLE' || typeCoup === 'CHIP') ? masse.disputee : masse.libre;
        k.s += n; k.n++;
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
  //
  // DEUX MESURES, PAS UNE (P2-57). Depuis qu'une chandelle tient ~4 s en l'air
  // et se dispute (P2-55/P2-56), chasseurs et receveurs se retrouvent SOUS le
  // ballon par construction : la moyenne melangeait ce duel voulu et le defaut
  // que ce test garde. On separe donc :
  //  - coups de pied NON disputes (occupation, degagement) : seuil d'origine,
  //    6 (moteur : ~5,0) ;
  //  - chandelles et coups de pied a suivre : un duel, pas une melee ouverte,
  //    12 au plus (moteur : ~8,9).
  // Mutant « les quinze au ballon » : ~8,5 et 23,6 — rouge sur les deux.
  assert.ok(masse.libre.n > 60 && masse.disputee.n > 40,
    `echantillon de receptions trop petit (${masse.libre.n} libres, ${masse.disputee.n} disputees)`);
  const mLibre = masse.libre.s / masse.libre.n, mDisputee = masse.disputee.s / masse.disputee.n;
  assert.ok(mLibre <= 6,
    `trop de joueurs masses autour du receveur d'un coup de pied non dispute (${mLibre.toFixed(1)} a moins de 8 m)`);
  assert.ok(mDisputee <= 12,
    `une chandelle tourne a la melee ouverte (${mDisputee.toFixed(1)} joueurs a moins de 8 m du receveur)`);
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
test("loi 8 : tenu debout sur la ligne, pas d'essai, renvoi depuis l'en-but", () => {
  // 0,20 : plaquage reussi, pas d'en-avant, mais TENU DEBOUT (tirage < 0,35).
  const { m, sens, scoreAvant } = scenarioPlaqueSurLaLigne(11, 0.2);
  assert.notStrictEqual(m.phase, 'ESSAI', "tenu debout : pas d'essai");
  assert.strictEqual(m.score.A, scoreAvant, 'tenu debout : le score ne bouge pas');
  // Depuis P2-99 (loi en vigueur depuis 2022) : ballon tenu dans l'en-but ->
  // renvoi depuis l'en-but par la défense, plus de ruck sur la ligne.
  assert.notStrictEqual(m.phase, 'RUCK', 'tenu debout : aucun regroupement sur ou dans l en-but');
  assert.ok(m.phase === 'COUP_ENVOI' && m.renvoiEnBut, `tenu debout : renvoi depuis l'en-but attendu (phase ${m.phase})`);
  assert.strictEqual(m.possession, sens > 0 ? 'B' : 'A', 'le renvoi depuis l en-but est tapé par la défense');
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
  // TROIS VERSIONS DE CE TEST, ET C'EST LA BONNE. Les deux precedentes ne
  // mesuraient pas ce qu'elles annoncaient :
  //
  // 1. UNE SEULE graine, 2 s de jeu, aucun etat remis a zero. Mesure sur 12
  //    graines du moteur INCHANGE : 12,7 / 12,8 / 9,8 / 10,7 / 4,1 / 11,8 /
  //    12,8 / 12,2 / 13,1 / 4,2 / 9,2 / 7,6 — moyenne 10,1 pour un seuil a 10.
  //    Il tenait a une graine heureuse et basculait au moindre changement du
  //    moteur, qu'il touche ou non a la couverture. Pire : une fois la vitesse
  //    courante remise a zero, la traversee tombe a 4,9 m en 2 s — les
  //    « 12,6 m » sur lesquels le seuil avait ete bati venaient surtout de
  //    l'ELAN RESIDUEL de l'arriere.
  // 2. Contraste entre un porteur le long de la touche et un porteur dans
  //    l'axe. Deterministe, mais HOLLOW : en neutralisant la branche de
  //    couverture (`if (franchi)`), le test restait VERT. Quand la branche ne
  //    s'applique pas, l'arriere suit quand meme le ballon par la voie normale,
  //    et c'est ce suivi-la que le contraste mesurait.
  //
  // Ce que la branche apporte VRAIMENT, mesure en neutralisant celle-ci (8
  // graines, etat remis a zero, porteur le long de la touche) :
  //     fenetre 4 s : 12,63 m avec la branche contre 9,15 m sans
  //     fenetre 6 s : 22,97 m (ecart-type 6,37) contre 9,83 m (ecart-type 0,40)
  // Sans elle, l'arriere PLAFONNE a ~9,8 m : il suit le ballon mais ne va
  // jamais au point de rencontre. Le seuil est place a 13 m — trois
  // ecarts-types sous la valeur du moteur correct, et tres au-dessus des 9,8 m
  // quasi deterministes du moteur ampute.
  function traverseeArriere() {
    const valeurs = [];
    for (const seed of [21, 22, 23, 24, 25, 26, 27, 28]) {
      const m = new MatchEngine(seed, 600);
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
      // L'ETAT RESIDUEL EST REMIS A ZERO : sans cela ce sont les elans herites
      // de la mise en route qui dominent la mesure (cf. en-tete).
      for (const j of [...m.equipeA, ...m.equipeB]) {
        j.vitesseCourante = 0; j._percee = 0; j.missCooldown = 0;
      }
      const yAvant = arriere.y;
      for (let t = 0; t < 6 && m.phase === 'PORTE'; t += 0.2) m.tick(0.2);
      valeurs.push(Math.abs(yAvant - arriere.y));
    }
    return valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
  }
  const traverse = traverseeArriere();
  assert.ok(traverse >= 13,
    `l'arriere ne traverse que ${traverse.toFixed(1)} m pour couvrir un porteur lance le long `
    + `de la touche. Sans la lecture du point de rencontre il plafonne a 9,8 m : il suit le `
    + `ballon au lieu d'aller le couper.`);
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
  // On ne mesure QUE tant que le jeu reste en jeu courant. Si le porteur tape au
  // pied ou se fait plaquer pendant la seconde mesuree, ce sont les
  // replacements de la NOUVELLE phase (couverture du coup de pied, formation du
  // ruck) qui deplacent les joueurs, pas le glissement defensif teste ici.
  // Confondant reel : le passage du porteur au contact a change sa decision sur
  // ce scenario (il botte desormais au 3e tick), et le test est passe au rouge a
  // 0,95 m alors que la mecanique verifiee n'avait pas bouge d'une ligne — en
  // s'arretant au changement de phase, le glissement mesure vaut 0,00 m.
  // Le SEUIL n'a pas ete touche : seul le confondant a ete retire.
  for (let t = 0; t < 1; t += 0.2) { m.tick(0.2); if (m.phase !== 'PORTE') break; }
  // Glissement MOYEN SIGNE vers le ballon (le porteur est a y = 20, eux a
  // y = 55) : c'est le glissement defensif, pas le bruit de replacement.
  const glissement = sortants.reduce((a, j, i) => a + (yAvant[i] - j.y), 0) / sortants.length;
  // Mesure sur ce scenario, en 1 s : 1,79 m de glissement vers le ballon avant
  // le correctif, 0,00 m apres. Un joueur qui se releve ne defend pas la largeur.
  assert.ok(glissement < 0.5,
    `un defenseur en sortie de regroupement glisse encore de ${glissement.toFixed(2)} m vers le ballon`);
});

// --- LE PLAQUAGE A DEUX -----------------------------------------------------
// Un plaquage de rugby est souvent le fait de deux defenseurs, et le releve
// officiel les compte tous les deux. Le moteur ne creditait que celui qu'il
// avait DESIGNE : il sous-estimait structurellement le total (215 par match
// mesures, contre 240 a 360 reels). Le second plaqueur n'est credite que s'il
// est REELLEMENT dans le rayon de contact — c'est une action simulee, pas un
// compteur ajoute (CLAUDE.md role 6).
function scenarioPlaquageADeux(distanceSecondDefenseur) {
  const m = new MatchEngine(51, 600);
  for (let t = 0; t < 30; t += 0.2) m.tick(0.2);
  m.phase = 'PORTE';
  m.timerPhase = 3;
  m.possession = 'A';
  m.passeVisuelle = null;
  m.combinaison = null;
  m.penaliteRecul = null;
  const porteur = m.equipeA.find((j) => j.numero === 12);
  const sens = porteur.sensAttaque;
  m.porteur = porteur;
  porteur.auSol = 0;
  porteur.x = 50; porteur.y = 30;
  m.ruckPoint = { x: 48, y: 30 };
  for (const j of m.equipeB) {
    j.auSol = 0; j.ruckRecovery = 0; j.horsJeuKick = 0; j.missCooldown = 0; j.fixeCooldown = 0;
    j.x = porteur.x + sens * 40; j.y = 60;
  }
  const plaqueur = m.equipeB.find((j) => j.numero === 6);
  plaqueur.x = porteur.x + sens * 1.0; plaqueur.y = 30;
  const second = m.equipeB.find((j) => j.numero === 7);
  second.x = porteur.x + sens * distanceSecondDefenseur; second.y = 30;
  // 0,50 : plaquage reussi, pas d'en-avant, pas de maul, pas tenu debout.
  m.rng = () => 0.5;
  const avant = m.stats.B.tacklesMade;
  for (let t = 0; t < 2 && m.phase === 'PORTE'; t += 0.2) m.tick(0.2);
  return m.stats.B.tacklesMade - avant;
}
test('un plaquage a deux credite les DEUX plaqueurs', () => {
  // Mesure : 1 plaquage compte avant le correctif, 2 apres.
  assert.strictEqual(scenarioPlaquageADeux(1.6), 2,
    'le second defenseur, dans le rayon de contact, doit etre credite lui aussi');
});
test("un defenseur HORS du rayon de contact n'est PAS credite d'un plaquage", () => {
  // Le garde-fou de la regle : sans lui, le correctif ci-dessus deviendrait le
  // compteur fabrique que CLAUDE.md interdit.
  assert.strictEqual(scenarioPlaquageADeux(4.0), 1,
    'un defenseur a 4 m du contact ne plaque pas');
});

// --- L'INTERCEPTION --------------------------------------------------------
// Le fait de jeu le plus spectaculaire du rugby n'existait pas : le moteur ne
// pouvait perdre le ballon sur une passe qu'en la RATANT. Les changements de
// possession ne venaient que de trois sources (grattage au ruck 6,9, touche
// volee 1,9, melee contre l'introduction 0,4 = 9,2 par match, contre 12 a 18
// en vrai).
//
// Le defenseur doit etre REELLEMENT dans le couloir de passe. Le second test
// est le garde-fou : sans lui, la regle deviendrait un changement de possession
// au hasard.
function scenarioInterception(yDefenseur) {
  const m = new MatchEngine(77, 600);
  for (let t = 0; t < 30; t += 0.2) m.tick(0.2);
  m.phase = 'PORTE';
  m.timerPhase = 2;
  m.possession = 'A';
  m.passeVisuelle = null;
  m.combinaison = null;
  m.penaliteRecul = null;
  const porteur = m.equipeA.find((j) => j.numero === 10);
  const cible = m.equipeA.find((j) => j.numero === 12);
  m.porteur = porteur;
  // Tous les autres partenaires ecartes : la seule option de passe est `cible`.
  for (const j of m.equipeA) { j.auSol = 0; j.x = 20; j.y = 5; }
  porteur.x = 50; porteur.y = 30;
  cible.x = 49.5; cible.y = 40; // a hauteur, jamais devant (loi 11)
  for (const j of m.equipeB) { j.auSol = 0; j.horsJeuKick = 0; j.sinBin = 0; j.x = 80; j.y = 65; }
  const intercepteur = m.equipeB.find((j) => j.numero === 13);
  intercepteur.x = 49.8;
  intercepteur.y = yDefenseur;
  m.rng = () => 0.01; // lecture parfaite : si la position le permet, il la prend
  // DELTA, jamais le total : les 30 s de mise en route ci-dessus sont un vrai
  // match, et elles peuvent tres bien y produire un turnover. Compter en absolu
  // rendait ce test dependant de tout changement AILLEURS dans le moteur — il
  // est effectivement passe au rouge sur un correctif de la chaine de passes
  // qu'il n'a aucune raison de voir (le scenario appelle _tenterPasse
  // directement, sans passer par la decision du porteur).
  const turnoversAvant = m.stats.B.turnovers;
  m._tenterPasse(porteur, false);
  return {
    possession: m.possession,
    porteur: m.porteur && m.porteur.numero,
    turnovers: m.stats.B.turnovers - turnoversAvant,
  };
}
test("un defenseur dans le couloir de passe INTERCEPTE et le ballon change de camp", () => {
  const r = scenarioInterception(35); // pile entre le passeur (y=30) et la cible (y=40)
  assert.strictEqual(r.possession, 'B', 'la possession doit changer de camp');
  assert.strictEqual(r.porteur, 13, "l'intercepteur devient le porteur");
  assert.strictEqual(r.turnovers, 1, 'le turnover doit etre comptabilise');
});
test("un defenseur HORS du couloir de passe n'intercepte pas", () => {
  // Le garde-fou : sans lui, l'interception serait un changement de possession
  // au hasard plutot qu'une lecture de trajectoire.
  const r = scenarioInterception(55); // 15 m a cote de la ligne de passe
  assert.strictEqual(r.possession, 'A', 'la possession ne doit PAS changer');
  assert.strictEqual(r.porteur, 12, 'la passe arrive normalement a son destinataire');
});

// --- Loi 19 : ON PEUT ETRE PLAQUE EN TOUCHE --------------------------------
// Sortie de rugby parfaitement banale — le porteur longe la ligne, la defense
// le pousse dehors — et elle n'existait pas : 0,05 par match mesure, contre 2 a
// 4 en vrai. Cause : le porteur crocheta vers l'interieur des qu'il passait
// sous 8 m de la touche, c'est-a-dire tout le couloir. Il s'ecartait donc de la
// ligne bien avant de l'approcher, et TOUTES les touches du match venaient du
// jeu au pied ou d'une penalite jouee au coin.
test('loi 19 : un porteur peut etre plaque en touche (pas seulement le jeu au pied)', () => {
  let plaquesEnTouche = 0, touches = 0;
  const GRAINES = [1, 2, 3, 4, 5, 6];
  for (const seed of GRAINES) {
    const m = new MatchEngine(seed, 4800);
    const brut = m.log.bind(m);
    m.log = (type, team, msg, extra) => {
      if (type === 'PLAQUE_EN_TOUCHE') plaquesEnTouche++;
      if (type === 'TOUCHE') touches++;
      return brut(type, team, msg, extra);
    };
    for (let t = 0; t < 4800; t += 0.2) m.tick(0.2);
  }
  const parMatch = plaquesEnTouche / GRAINES.length;
  assert.ok(touches / GRAINES.length > 10, `echantillon de touches trop petit (${touches})`);
  // Mesure : 0,05 par match avant le correctif, ~1,5 apres. Le repere reel est
  // de 2 a 4 : le seuil garde l'EXISTENCE de la sortie, pas sa frequence exacte.
  assert.ok(parMatch >= 0.5,
    `le ballon n'est presque jamais porte en touche (${parMatch.toFixed(2)} par match)`);
});

test('drop-goal : une décision de buteur en fin de match serré, pas un tirage au hasard', () => {
  // Constat (40 matchs) : 1,5 drop tenté par match, à n'importe quel moment et
  // par n'importe quel trois-quarts (taux fixe 0,012/s dans les 8-38 m) — un
  // ailier pouvait dropper à la 10e minute avec 20 points d'avance.
  const m = new MatchEngine(5, 4800);
  m.tempsMatch = 4800 * 0.95; m.score = { A: 20, B: 21 };
  const serre = m._facteurContexteDrop('A');
  m.tempsMatch = 600; m.score = { A: 20, B: 0 };
  const tranquille = m._facteurContexteDrop('A');
  assert.ok(serre > 1, `fin de match à un point : le drop doit devenir PLUS probable (facteur ${serre})`);
  assert.ok(tranquille < 0.5, `10e minute, 20 points d'avance : le drop doit rester rare (facteur ${tranquille})`);
  let tentes = 0, parNonButeur = 0;
  const N = 16;
  for (let g = 1; g <= N; g++) {
    const e = new MatchEngine(g, 4800);
    const brut = e.log.bind(e);
    e.log = (type, team, msg, extra) => {
      if (type === 'DROP_GOAL_REUSSI' || type === 'DROP_GOAL_RATE') {
        tentes++;
        if (!(e.porteur && e.porteur.jeuPied >= 60)) parNonButeur++;
      }
      return brut(type, team, msg, extra);
    };
    for (let i = 0; i < 400000 && e.getState().phase !== 'TERMINE'; i++) e.tick(0.1);
  }
  assert.ok(tentes / N <= 0.7, `${(tentes / N).toFixed(2)} drops tentés par match`);
  assert.strictEqual(parNonButeur, 0, `${parNonButeur} drop(s) tenté(s) par un joueur qui n'est pas buteur`);
});

test('touche : un lancer pas droit existe, rare, et donne une mêlée à l\'adversaire (loi 18)', () => {
  // Constat : la touche n'avait AUCUNE faute — ni lancer pas droit, ni
  // hors-jeu. Le lancer était toujours parfait, quelle que soit la qualité
  // du lanceur, et la touche ne pouvait jamais se retourner sur une faute.
  const m0 = new MatchEngine(1, 4800);
  assert.strictEqual(typeof m0._probaLancerPasDroit, 'function', 'fonction de probabilité absente');
  const pBon = m0._probaLancerPasDroit({ touche: 95 }), pMauvais = m0._probaLancerPasDroit({ touche: 20 });
  assert.ok(pMauvais > pBon && pBon > 0, `un lanceur médiocre doit lancer plus souvent de travers (${pMauvais} contre ${pBon})`);
  let fautes = 0, suivisMelee = 0, touches = 0;
  const N = 12;
  for (let g = 1; g <= N; g++) {
    const m = new MatchEngine(g, 4800);
    let attendue = null;
    const brut = m.log.bind(m);
    m.log = (type, team, msg, extra) => {
      if (type === 'TOUCHE_LANCER') touches++;
      if (type === 'TOUCHE_PAS_DROIT') { fautes++; attendue = team === 'A' ? 'B' : 'A'; }
      else if (type === 'MELEE' && attendue) { if (team === attendue) suivisMelee++; attendue = null; }
      return brut(type, team, msg, extra);
    };
    for (let i = 0; i < 400000 && m.getState().phase !== 'TERMINE'; i++) m.tick(0.1);
  }
  assert.ok(touches >= 150, `échantillon trop petit (${touches} lancers)`);
  assert.ok(fautes / N >= 0.2 && fautes / N <= 2, `${(fautes / N).toFixed(2)} lancers pas droits par match`);
  assert.strictEqual(suivisMelee, fautes, `${suivisMelee}/${fautes} lancers pas droits suivis d'une mêlée introduite par l'adversaire`);
});

test('touche : le hors-jeu existe — un trois-quarts qui part avant la fin de la touche est pénalisé (loi 18)', () => {
  // CLAUDE.md (rôle 5) : les hors-jeu doivent exister autour des touches. Il
  // n'y en avait aucun : les trois-quarts défensifs restaient toujours
  // exactement sur leur ligne des 10 m.
  const m0 = new MatchEngine(1, 4800);
  assert.strictEqual(typeof m0._probaHorsJeuTouche, 'function', 'fonction de probabilité absente');
  assert.ok(m0._probaHorsJeuTouche({ discipline: 30 }) > m0._probaHorsJeuTouche({ discipline: 90 }),
    'un joueur indiscipliné doit partir plus souvent trop tôt');
  let fautes = 0, sanctionnees = 0, sortisDeLigne = 0;
  const N = 12;
  for (let g = 1; g <= N; g++) {
    const m = new MatchEngine(g, 4800);
    let attendue = null;
    const brut = m.log.bind(m);
    m.log = (type, team, msg, extra) => {
      if (type === 'TOUCHE_HORS_JEU') {
        fautes++;
        attendue = team;
        const num = +((msg || '').match(/n°(\d+)/) || [])[1];
        const eqF = team === 'A' ? m.equipeB : m.equipeA;
        const j = eqF.find((x) => x.numero === num);
        const sensF = team === 'A' ? -1 : 1; // l'équipe fautive défend vers son propre camp
        if (j && m.ruckPoint && (j.x - m.ruckPoint.x) * sensF > -8) sortisDeLigne++;
      } else if (type === 'PENALITE' && attendue) { if (team === attendue) sanctionnees++; attendue = null; }
      return brut(type, team, msg, extra);
    };
    for (let i = 0; i < 400000 && m.getState().phase !== 'TERMINE'; i++) m.tick(0.1);
  }
  assert.ok(fautes / N >= 0.2 && fautes / N <= 2, `${(fautes / N).toFixed(2)} hors-jeu en touche par match`);
  assert.strictEqual(sanctionnees, fautes, `${sanctionnees}/${fautes} hors-jeu en touche suivis d'une pénalité pour l'équipe qui lance`);
  assert.strictEqual(sortisDeLigne, fautes, `${sortisDeLigne}/${fautes} fautifs visiblement sortis de leur ligne des 10 m au coup de sifflet`);
});

test('pénalité en touche : le buteur frappe depuis la marque et le ballon vole jusqu\'à la touche', () => {
  // Constat : ~10 fois par match, « Pénalité, équipe A joue en touche » puis le
  // ballon apparaissait directement dans les mains du talonneur, 22 à 40 m
  // plus loin. Personne ne frappait, aucun ballon ne volait vers la touche.
  let cas = 0, departMarque = 0, sansSaut = 0, enVol = 0;
  for (const seed of [1, 2, 3, 4]) {
    const m = new MatchEngine(seed, 4800);
    let suivi = null;
    const orig = m._accorderPenaliteTouche.bind(m);
    m._accorderPenaliteTouche = (eq, pos) => { suivi = { marque: { x: pos.x, y: pos.y }, pts: [], vol: false }; return orig(eq, pos); };
    const brut = m.log.bind(m);
    m.log = (type, team, msg, extra) => {
      if (type === 'PENALITE_TOUCHE_FRAPPE' && suivi) suivi.frappe = suivi.pts[suivi.pts.length - 1];
      if (type === 'TOUCHE_LANCER' && suivi) {
        cas++;
        // Le ballon est SUR LA MARQUE au moment de la frappe (il peut y être
        // ramené à vue depuis le ruck ou le lancer, cf. P2-91).
        const p0 = suivi.frappe;
        if (p0 && Math.hypot(p0.x - suivi.marque.x, p0.y - suivi.marque.y) < 3) departMarque++;
        let saut = 0;
        for (let i = 1; i < suivi.pts.length; i++) saut = Math.max(saut, Math.hypot(suivi.pts[i].x - suivi.pts[i - 1].x, suivi.pts[i].y - suivi.pts[i - 1].y));
        if (saut < 3) sansSaut++;
        if (suivi.vol) enVol++;
        suivi = null;
      }
      return brut(type, team, msg, extra);
    };
    for (let i = 0; i < 400000 && m.getState().phase !== 'TERMINE'; i++) {
      m.tick(0.1);
      if (suivi && m.phase === 'TOUCHE') {
        const b = m.getState().ballon;
        suivi.pts.push({ x: b.x, y: b.y });
        if (b.enVol && (b.hauteur || 0) > 0.3) suivi.vol = true;
      }
    }
  }
  assert.ok(cas >= 15, `échantillon trop petit (${cas} pénalités en touche)`);
  assert.strictEqual(departMarque, cas, `${departMarque}/${cas} pénalités en touche où le ballon part de la marque`);
  assert.strictEqual(sansSaut, cas, `${sansSaut}/${cas} pénalités en touche sans téléportation du ballon (> 3 m en 0,1 s)`);
  assert.strictEqual(enVol, cas, `${enVol}/${cas} pénalités en touche où le ballon vole réellement vers la touche`);
});

test('interception : le ballon vole jusqu\'à l\'intercepteur, à vue', () => {
  // Relevé des sauts (P2-88) : à l'interception (~0,9 par match), la passe
  // visuelle était effacée et le ballon apparaissait d'un coup dans les mains
  // de l'intercepteur (~6 m).
  let cas = 0, propres = 0, pire = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const m = new MatchEngine(seed, 4800);
    let prev = null, suivi = null;
    const brut = m.log.bind(m);
    m.log = (type, team, msg, extra) => { if (type === 'INTERCEPTION') suivi = { saut: 0, n: 0 }; return brut(type, team, msg, extra); };
    for (let i = 0; i < 400000 && m.getState().phase !== 'TERMINE'; i++) {
      m.tick(0.1);
      const b = m.getState().ballon;
      const p = { x: b.x, y: b.y };
      if (suivi && prev) {
        suivi.saut = Math.max(suivi.saut, Math.hypot(p.x - prev.x, p.y - prev.y));
        if (++suivi.n >= 10) { cas++; if (suivi.saut < 3) propres++; pire = Math.max(pire, suivi.saut); suivi = null; }
      }
      prev = p;
    }
  }
  assert.ok(cas >= 5, `échantillon trop petit (${cas} interceptions)`);
  assert.strictEqual(propres, cas, `${propres}/${cas} interceptions sans saut du ballon > 3 m (pire : ${pire.toFixed(1)} m)`);
});

test('élimination directe : égalité -> prolongation, puis essais marqués, puis tirs au but (jamais les identifiants)', () => {
  // BUG-RM-001. Une égalité en coupe était « départagée » par un hash des
  // identifiants des clubs et annoncée « après prolongation » sans qu'aucune
  // minute ne soit jouée. Règlement retenu (inspiré de la Champions Cup) :
  // prolongation de 20 minutes ; si l'égalité persiste, l'équipe qui a marqué
  // le plus d'essais ; sinon séance de tirs au but (5 chacun puis mort subite),
  // qui ne change pas le score du match.
  function jusquA(m, t) { for (let i = 0; i < 400000 && m.tempsMatch < t && m.phase !== 'TERMINE'; i++) m.tick(0.1); }
  function finir(m) { for (let i = 0; i < 400000 && m.phase !== 'TERMINE'; i++) m.tick(0.1); }
  // Juste avant le sifflet, hors séquence de marque (un essai ou un tir en
  // cours ajouterait des points après qu'on a fixé l'égalité).
  const MARQUE = ['ESSAI', 'TRANSFORMATION', 'PENALITE_TIR'];
  function avantSifflet(m) {
    for (let i = 0; i < 400000 && m.phase !== 'TERMINE'
      && (m.tempsMatch < m.dureeMatch - 0.15 || MARQUE.includes(m.phase)); i++) m.tick(0.1);
  }
  // Tient l'égalité jusqu'à la vérification de fin elle-même : une action de
  // marque lancée dans les dernières secondes ne doit pas défaire le scénario.
  function egaliteAuSifflet(m, pts, essais) {
    const fin = m.dureeMatch;
    for (let i = 0; i < 400000 && m.phase !== 'TERMINE' && m.dureeMatch === fin; i++) {
      m.score.A = pts; m.score.B = pts;
      if (essais) { m.stats.A.essais = essais[0]; m.stats.B.essais = essais[1]; }
      m.tick(0.1);
    }
  }
  // 1) Égalité au coup de sifflet : la prolongation se JOUE.
  const m = new MatchEngine(4, 4800, { eliminationDirecte: true });
  avantSifflet(m);
  egaliteAuSifflet(m, 20);
  jusquA(m, 4805);
  assert.ok(m.prolongationJouee, 'à égalité au coup de sifflet, une prolongation doit commencer');
  assert.ok(Math.abs(m.dureeMatch - 6000) < 1, `prolongation de 20 minutes : fin prévue à ${m.dureeMatch} s`);
  // 2) Égalité persistante, essais différents : l'équipe qui en a marqué le plus.
  avantSifflet(m);
  egaliteAuSifflet(m, 27, [3, 2]);
  finir(m);
  assert.strictEqual(m.phase, 'TERMINE');
  assert.ok(m.departage && m.departage.type === 'essais' && m.departage.vainqueur === 'A',
    `égalité persistante : l'équipe aux 3 essais l'emporte (${JSON.stringify(m.departage)})`);
  // 3) Égalité de score ET d'essais : tirs au but, score du match inchangé.
  const n = new MatchEngine(6, 4800, { eliminationDirecte: true });
  avantSifflet(n); egaliteAuSifflet(n, 15);
  jusquA(n, 4805);
  avantSifflet(n); egaliteAuSifflet(n, 15, [1, 1]);
  finir(n);
  assert.ok(n.departage && n.departage.type === 'tirs' && (n.departage.vainqueur === 'A' || n.departage.vainqueur === 'B'),
    `égalité totale : séance de tirs au but (${JSON.stringify(n.departage)})`);
  assert.notStrictEqual(n.departage.tirs.A, n.departage.tirs.B, 'la séance de tirs au but a un vainqueur');
  assert.ok(n.score.A === 15 && n.score.B === 15, 'les tirs au but ne s ajoutent pas au score du match');
  // 4) Hors élimination directe, un nul reste un nul.
  const c = new MatchEngine(4, 4800);
  avantSifflet(c); egaliteAuSifflet(c, 20); finir(c);
  assert.ok(!c.prolongationJouee && !c.departage, 'un match de championnat nul reste nul');
});

test('statistiques individuelles : chaque action est attribuée à un joueur, et les joueurs font le total de l équipe', () => {
  // P2-103. Le moteur ne suivait par joueur que les essais, passes, plaquages
  // et mètres. Il attribue désormais chaque action à celui qui la fait :
  // courses, défenseurs battus, franchissements, offloads, plaquages manqués,
  // ballons gagnés (grattage, interception, touche volée), en-avants, cartons,
  // coups de pied, points au pied, touches gagnées et passes décisives. Garde-fou
  // contre une stat inventée ou oubliée : la somme des quinze joueurs doit
  // donner EXACTEMENT le total de l'équipe.
  const paires = [['courses', 'carries'], ['defenseursBattus', 'defenseursBattus'], ['franchissements', 'franchissements'],
    ['offloads', 'offloads'], ['plaquagesManques', 'missedTackles'], ['enAvants', 'knockOns'], ['cartonsJaunes', 'cartonsJaunes'],
    ['touchesGagnees', 'lineoutsGagnes'], ['coupsDePied', 'kicks']];
  let decisives = 0, essais = 0, ballonsJoueurs = 0, ballonsEquipe = 0;
  for (let seed = 1; seed <= 4; seed++) {
    const m = new MatchEngine(seed, 4800);
    for (let i = 0; i < 400000 && m.phase !== 'TERMINE'; i++) m.tick(0.1);
    const sj = m.getState().statsJoueurs;
    for (const e of ['A', 'B']) {
      const S = m.stats[e];
      const somme = (k) => Object.values(sj[e] || {}).reduce((p, j) => p + (j[k] || 0), 0);
      for (const [kj, ke] of paires) {
        assert.strictEqual(somme(kj), S[ke], `graine ${seed}, équipe ${e} : ${kj} des joueurs ${somme(kj)} pour ${S[ke]} à l'équipe`);
      }
      const pointsPied = 2 * S.transformationsReussies + 3 * S.penalitesButReussies + 3 * S.dropsReussis;
      assert.strictEqual(somme('pointsAuPied'), pointsPied, `graine ${seed}, équipe ${e} : points au pied des joueurs`);
      decisives += somme('passesDecisives'); essais += S.essais;
      ballonsJoueurs += somme('turnoversGagnes'); ballonsEquipe += S.turnovers;
    }
  }
  // Une mêlée volée est un ballon gagné collectif : la somme des joueurs ne
  // peut que rester en dessous du total de l'équipe.
  assert.ok(ballonsJoueurs <= ballonsEquipe && ballonsJoueurs >= 0.8 * ballonsEquipe, `ballons gagnés : joueurs ${ballonsJoueurs}, équipe ${ballonsEquipe}`);
  assert.ok(decisives > 0.4 * essais && decisives < essais, `${decisives} passes décisives pour ${essais} essais`);
});

test('mètres gagnés : comptés au-delà de la ligne d avantage, pas depuis la réception', () => {
  // P2-102 (remarque de l'utilisateur : la stat existe par joueur). Le moteur
  // comptait tout le terrain couru vers l'avant depuis la réception : le n°10,
  // qui reçoit 10 m derrière le ruck et court avant de passer, « gagnait »
  // 217 m par match, plus que les ailiers, et une équipe 1233 m. Repères réels :
  // record du Tournoi 116 m par match (Kinghorn 2025, 580 m en 5 matchs) ;
  // Irlande 2023, meilleure équipe, 857 m par match pour 139 courses.
  // 40 matchs (pas de 0,2 s) : les mètres de l'ouvreur varient beaucoup d'un
  // match à l'autre, et 6 graines faisaient basculer le test au moindre
  // changement de tirage (63 m contre 52 sur 1-6, 54 contre 59 sur 1-40).
  const parNum = {}; let equipes = 0, total = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const m = new MatchEngine(seed, 4800);
    for (let i = 0; i < 400000 && m.phase !== 'TERMINE'; i++) m.tick(0.2);
    const sj = m.getState().statsJoueurs;
    for (const e of ['A', 'B']) {
      equipes++; total += m.stats[e].metresGagnes;
      for (const [num, st] of Object.entries(sj[e] || {})) parNum[num] = (parNum[num] || 0) + (st.metresGagnes || 0);
    }
  }
  const pm = (k) => (parNum[k] || 0) / equipes;
  const ailiers = (pm(11) + pm(14)) / 2;
  assert.ok(pm(10) < ailiers, `l'ouvreur gagne ${pm(10).toFixed(0)} m par match, les ailiers ${ailiers.toFixed(0)} : il passe plus qu'il ne perce`);
  assert.ok(pm(9) < 40, `le demi de mêlée gagne ${pm(9).toFixed(0)} m par match`);
  assert.ok(total / equipes <= 950, `une équipe gagne ${(total / equipes).toFixed(0)} m par match (Irlande 2023 : 857)`);
  assert.ok(total / equipes >= 300, `une équipe ne gagne que ${(total / equipes).toFixed(0)} m par match`);
  // LE PROFIL DU JOUEUR COMPTE (remarque de l'utilisateur). Un ailier rapide
  // gagne plus de terrain qu'un ailier lent ; un avant puissant plus qu'un
  // avant léger, grâce au terrain pris DANS le plaquage, désormais compté.
  // Sur trois lots de 6 graines : vitesse x2,7 à x3,6 ; puissance x1,21 à x1,54.
  function metres(nums, attr, v) {
    const cfg = { joueursA: {}, joueursB: {} };
    for (const k of nums) cfg.joueursA[k] = { [attr]: v };
    let t = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const m = new MatchEngine(seed, 4800, cfg);
      for (let i = 0; i < 400000 && m.phase !== 'TERMINE'; i++) m.tick(0.1);
      const sj = m.getState().statsJoueurs.A;
      for (const k of nums) t += (sj[k] && sj[k].metresGagnes) || 0;
    }
    return t;
  }
  const rapides = metres([11, 14], 'vitesse', 95), lents = metres([11, 14], 'vitesse', 50);
  assert.ok(rapides >= 1.8 * lents, `ailiers rapides ${rapides.toFixed(0)} m contre lents ${lents.toFixed(0)} m`);
  const avants = [1, 2, 3, 4, 5, 6, 7, 8];
  const puissants = metres(avants, 'puissance', 95), legers = metres(avants, 'puissance', 40);
  assert.ok(puissants >= 1.12 * legers, `avants puissants ${puissants.toFixed(0)} m contre légers ${legers.toFixed(0)} m`);
});

test('choix du capitaine : menée en fin de match, elle joue la touche ; devant au score, elle prend les points', () => {
  // P2-101. Le choix entre poteaux, touche et jeu rapide ne dépendait que de la
  // distance : à 30 m des poteaux, une équipe menée de 10 points à 5 minutes
  // de la fin tapait au but comme en début de match. On construit la même
  // pénalité (A, 30 m des poteaux, dans l'axe) dans trois contextes.
  function choix(scoreA, scoreB, tempsMatch) {
    const r = { TIR: 0, TOUCHE: 0, AUTRE: 0 };
    const m = new MatchEngine(9, 4800);
    for (let i = 0; i < 300; i++) {
      m.score.A = scoreA; m.score.B = scoreB; m.tempsMatch = tempsMatch;
      m.phase = 'PORTE'; m.avantage = null; m.penaliteRecul = null; m.passeVisuelle = null; m.penTouche = null;
      m._traiterPenalite('A', { x: LONGUEUR - 30, y: LARGEUR / 2 });
      if (m.phase === 'PENALITE_TIR') r.TIR++; else if (m.phase === 'TOUCHE') r.TOUCHE++; else r.AUTRE++;
    }
    return r;
  }
  const debut = choix(0, 0, 600), menee = choix(3, 13, 4500), devant = choix(13, 10, 4500);
  assert.ok(debut.TIR >= 0.75 * 300, `en début de match, à 30 m, on tape au but (${JSON.stringify(debut)})`);
  assert.ok(menee.TOUCHE >= 0.65 * 300, `menée de 10 points à 5 minutes de la fin, on joue la touche (${JSON.stringify(menee)})`);
  assert.ok(devant.TIR >= 0.95 * 300, `devant au score en fin de match, on prend les points (${JSON.stringify(devant)})`);
});

test('ballon tenu dans l en-but : renvoi depuis l en-but par la défense', () => {
  // P2-99. Un porteur qui franchit la ligne mais est TENU DEBOUT ne marque
  // pas. Le moteur formait alors un ruck à 30 cm de la ligne, et l'attaque
  // gardait le ballon. Loi (depuis 2022) : ballon tenu dans l'en-but -> renvoi
  // depuis la ligne d'en-but par l'équipe qui défendait.
  let tenus = 0, renvois = 0;
  // 24 graines : ~0,17 ballon tenu dans l'en-but par match.
  for (let seed = 1; seed <= 24; seed++) {
    const m = new MatchEngine(seed, 4800);
    const brut = m.log.bind(m);
    let attendu = null;
    m.log = (type, team, msg, extra) => { if (type === 'EN_BUT_TENU') attendu = team === 'A' ? 'B' : 'A'; return brut(type, team, msg, extra); };
    for (let i = 0; i < 400000 && m.phase !== 'TERMINE'; i++) {
      m.tick(0.1);
      if (attendu) {
        tenus++;
        const ligne = m.xCoupEnvoi <= 0.5 || m.xCoupEnvoi >= LONGUEUR - 0.5;
        if (m.phase === 'COUP_ENVOI' && m.possession === attendu && ligne && m.renvoiEnBut) renvois++;
        attendu = null;
      }
    }
  }
  assert.ok(tenus >= 3, `seulement ${tenus} ballons tenus dans l'en-but en 24 matchs`);
  assert.strictEqual(renvois, tenus, `${renvois}/${tenus} ballons tenus dans l'en-but suivis d'un renvoi depuis l'en-but par la défense`);
});

test('touche rapide : relancée par l équipe qui a le lancer, ballon vers un partenaire à 5 m ou plus, à vue', () => {
  // P2-98, loi 18. Après un coup de pied en touche, un joueur de l'équipe qui a
  // le lancer peut relancer tout de suite, avant que l'alignement ne se forme,
  // vers un partenaire à au moins 5 m de la ligne de touche. Le moteur n'avait
  // que la touche ordonnée.
  let n = 0, bonneEquipe = 0, cinqMetres = 0, sansSaut = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const m = new MatchEngine(seed, 4800);
    const brut = m.log.bind(m);
    let suivi = null, prev = null;
    m.log = (type, team, msg, extra) => {
      if (type === 'TOUCHE_RAPIDE') suivi = { equipe: team, saut: 0, n: 0 };
      return brut(type, team, msg, extra);
    };
    for (let i = 0; i < 400000 && m.getState().phase !== 'TERMINE'; i++) {
      m.tick(0.1);
      const b = m.getState().ballon, p = { x: b.x, y: b.y };
      if (suivi && suivi.n === 0) {
        n++;
        if (m.possession === suivi.equipe && m.phase === 'PORTE') bonneEquipe++;
        const cible = m.passeVisuelle && m.passeVisuelle.cible;
        if (cible && cible.y >= 5 && cible.y <= LARGEUR - 5) cinqMetres++;
      }
      if (suivi && prev) {
        suivi.saut = Math.max(suivi.saut, Math.hypot(p.x - prev.x, p.y - prev.y));
        if (++suivi.n >= 15) { if (suivi.saut < 3.5) sansSaut++; suivi = null; }
      }
      prev = p;
    }
  }
  assert.ok(n >= 3, `seulement ${n} touches rapides en 12 matchs`);
  assert.strictEqual(bonneEquipe, n, `${bonneEquipe}/${n} touches rapides jouées par l'équipe qui a le lancer`);
  assert.strictEqual(cinqMetres, n, `${cinqMetres}/${n} touches rapides lancées vers un partenaire à 5 m ou plus de la touche`);
  assert.strictEqual(sansSaut, n, `${sansSaut}/${n} touches rapides sans saut du ballon`);
});

test('transformation : sur un essai excentré, le buteur recule pour ouvrir l angle', () => {
  // P2-97. La loi laisse le buteur poser son tee n'importe où sur l'axe de
  // l'essai. Le moteur le posait toujours à 10 m : 56 % de réussite au total
  // (49 % dès 10 m d'écart latéral) pour ~75 % en réel.
  let excentres = 0, recules = 0, tentees = 0, reussies = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const m = new MatchEngine(seed, 4800);
    const brut = m.log.bind(m);
    m.log = (type, team, msg, extra) => {
      if (type === 'TRANSFORMATION_REUSSIE' || type === 'TRANSFORMATION_RATEE') {
        tentees++; if (type === 'TRANSFORMATION_REUSSIE') reussies++;
      }
      return brut(type, team, msg, extra);
    };
    let vu = false;
    for (let i = 0; i < 400000 && m.phase !== 'TERMINE'; i++) {
      m.tick(0.1);
      if (m.phase !== 'TRANSFORMATION') { vu = false; continue; }
      // Au moment de la frappe (ballon parti), distance du buteur à la ligne.
      if (!vu && m.ballonEnVol && Math.abs(m.essaiY - LARGEUR / 2) >= 20) {
        vu = true; excentres++;
        if (Math.abs(m.porteur.x - m.essaiX) >= 18) recules++;
      }
    }
  }
  assert.ok(excentres >= 15, `échantillon trop petit (${excentres} transformations excentrées)`);
  assert.strictEqual(recules, excentres, `${recules}/${excentres} buteurs reculent d'au moins 18 m sur un essai à 20 m ou plus des poteaux`);
  // Avant : 56 % (30 graines). Avec le recul : 63 % (30 graines), 59 % (1-12).
  assert.ok(reussies / tentees >= 0.55, `transformations réussies ${(100 * reussies / tentees).toFixed(0)} % (réel ~75 %)`);
});

test('50:22 : tapé de son camp, rebond dans le terrain, touche dans les 22 adverses -> lancer au botteur', () => {
  // P2-96, loi 18 (50:22). Un coup de pied tapé depuis son propre camp, qui
  // rebondit dans le terrain puis sort en touche dans les 22 m adverses, donne
  // le lancer à l'équipe qui a botté. Sinon, la touche en rebond revient à
  // l'adversaire, comme toute touche en jeu courant.
  let n5022 = 0, lancerBotteur = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const m = new MatchEngine(seed, 4800);
    const brut = m.log.bind(m);
    let attendu = null;
    m.log = (type, team, msg, extra) => { if (type === 'CINQUANTE_VINGT_DEUX') attendu = team; return brut(type, team, msg, extra); };
    for (let i = 0; i < 400000 && m.phase !== 'TERMINE'; i++) {
      m.tick(0.1);
      if (attendu) { n5022++; if (m.phase === 'TOUCHE' && m.possession === attendu) lancerBotteur++; attendu = null; }
    }
  }
  assert.ok(n5022 >= 2, `seulement ${n5022} 50:22 en 12 matchs`);
  assert.strictEqual(lancerBotteur, n5022, `${lancerBotteur}/${n5022} 50:22 donnent le lancer au botteur`);
  // Cas construits : l'équipe A tape, le ballon rebondit dans le terrain et
  // sort en touche à 85 m (dans les 22 de B). Depuis 45 m (son camp) : 50:22.
  // Depuis 55 m (camp adverse) : touche en rebond ordinaire, lancer à B.
  for (const [xFrappe, lancer] of [[45, 'A'], [55, 'B']]) {
    const m = new MatchEngine(3, 4800);
    for (let t = 0; t < 60; t += 0.1) m.tick(0.1);
    m.avantage = null; m.passeVisuelle = null; m.penaliteRecul = null; m.combinaison = null;
    m.possession = 'A'; m.phase = 'PORTE';
    const botteur = m.equipeA.find(j => j.numero === 10);
    botteur.x = xFrappe; botteur.y = 20; botteur.auSol = 0; m.porteur = botteur;
    m._tenterCoupDePiedJeu(botteur, 'TOUCHE');
    m.cibleCoupDePiedX = 84; m.cibleCoupDePiedY = 2;
    for (const j of [...m.equipeA, ...m.equipeB]) { if (j !== botteur) { j.x = 50; j.y = 50; j.horsJeuKick = 0; } }
    for (let t = 0; t < 15 && m.phase === 'COUP_DE_PIED_JEU'; t += 0.1) m.tick(0.1);
    assert.strictEqual(m.phase, 'TOUCHE', `frappe à ${xFrappe} m : le ballon doit rouler en touche (phase ${m.phase})`);
    assert.strictEqual(m.possession, lancer, `frappe à ${xFrappe} m, sortie dans les 22 adverses : lancer pour ${lancer}`);
  }
});

test('loi 18 : coup de pied direct en touche, lancer adverse, et pas de terrain gagné hors de ses 22 m', () => {
  // P2-95. Le moteur donnait le lancer à l'équipe qui avait botté quand elle
  // tapait directement en touche depuis ses 22 m (un tiers des cas), et
  // plaçait la touche au point de sortie quand elle tapait de plus loin. Loi
  // 18 : en jeu courant, le lancer revient TOUJOURS à l'adversaire (seule la
  // pénalité garde le lancer) ; tapé directement en touche hors de ses 22 m,
  // le ballon ne fait gagner aucun terrain : touche au niveau du point de frappe.
  let directs = 0, lancerAdverse = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const m = new MatchEngine(seed, 4800);
    for (let i = 0; i < 400000 && m.phase !== 'TERMINE'; i++) {
      const enVol = m.phase === 'COUP_DE_PIED_JEU' && m.ballonEnVol;
      const kick = m.equipeCoupDePiedJeu;
      const direct = enVol && (m.cibleCoupDePiedY <= 0.01 || m.cibleCoupDePiedY >= LARGEUR - 0.01);
      m.tick(0.1);
      if (direct && m.phase === 'TOUCHE') { directs++; if (m.possession !== kick) lancerAdverse++; }
    }
  }
  assert.ok(directs >= 30, `échantillon trop petit (${directs} coups de pied directs en touche)`);
  assert.strictEqual(lancerAdverse, directs, `${lancerAdverse}/${directs} coups de pied directs en touche donnent le lancer à l'adversaire`);
  // Hors de ses 22 m, les équipes visent désormais la touche en rebond : le
  // direct en touche y est rare, on le construit. L'équipe A tape depuis 40 m
  // de sa ligne, le ballon sort directement 25 m plus loin.
  const m = new MatchEngine(3, 4800);
  for (let t = 0; t < 60; t += 0.1) m.tick(0.1);
  m.avantage = null; m.passeVisuelle = null; m.penaliteRecul = null; m.combinaison = null;
  m.possession = 'A'; m.phase = 'PORTE';
  const botteur = m.equipeA.find(j => j.numero === 10);
  botteur.x = 40; botteur.y = 20; botteur.auSol = 0; m.porteur = botteur;
  m._tenterCoupDePiedJeu(botteur, 'DEGAGEMENT');
  m.cibleCoupDePiedX = 65; m.cibleCoupDePiedY = -2;
  for (let t = 0; t < 10 && m.phase === 'COUP_DE_PIED_JEU'; t += 0.1) m.tick(0.1);
  assert.strictEqual(m.phase, 'TOUCHE', `le ballon sorti directement doit donner une touche (phase ${m.phase})`);
  assert.strictEqual(m.possession, 'B', 'lancer à l adversaire du botteur');
  assert.ok(Math.abs(m.ruckPoint.x - 40) <= 1, `touche au niveau du point de frappe (40 m), pas du point de sortie (65 m) : ${m.ruckPoint.x.toFixed(1)} m`);
});

test('coup de pied dans l en-but : le défenseur aplatit (renvoi aux 22 m) ou le chasseur marque', () => {
  // P2-93 : un ballon qui roulait jusqu'à la ligne d'en-but s'y arrêtait, et
  // le receveur repartait de là en jeu courant. En vrai, un ballon dans l'en-but
  // est aplati par le défenseur (renvoi aux 22 m, loi 12) ou par un chasseur
  // de l'équipe qui a botté (essai, loi 8).
  let enBut = 0, renvois = 0, essais = 0, autres = 0;
  for (let seed = 1; seed <= 24; seed++) {  // ~0,3 par match : petits coups de pied à suivre
    const m = new MatchEngine(seed, 4800);
    let suivi = null;
    for (let i = 0; i < 400000 && m.phase !== 'TERMINE'; i++) {
      const avant = m._ballonEnBut;
      const kick = m.equipeCoupDePiedJeu;
      const s0 = { A: m.score.A, B: m.score.B };
      m.tick(0.1);
      if (avant && !m._ballonEnBut) {
        enBut++;
        const defense = kick === 'A' ? 'B' : 'A';
        if (m.phase === 'COUP_ENVOI' && m.renvoi22 && m.possession === defense) renvois++;
        else if (m.phase === 'ESSAI' && m.score[kick] === s0[kick] + 5) essais++;
        else if (m.phase === 'MELEE') { /* en-avant sur ballon disputé : mêlée */ }
        else autres++;
      }
    }
  }
  assert.ok(enBut >= 2, `seulement ${enBut} ballons dans l'en-but en 24 matchs`);
  assert.strictEqual(autres, 0, `${autres}/${enBut} ballons dans l'en-but sans aplatissement ni essai`);
  // Les deux issues, construites (le ballon dans l'en-but est rare en match,
  // ~0,2 à 0,3 fois : en compter un nombre fixe rendait le test fragile). Un
  // petit coup de pied de l'équipe A roule dans l'en-but de B ; le premier
  // arrivé est un défenseur, puis un chasseur.
  for (const premier of ['defenseur', 'chasseur']) {
    const m = new MatchEngine(5, 4800);
    for (let t = 0; t < 60; t += 0.1) m.tick(0.1);
    m.avantage = null; m.passeVisuelle = null; m.penaliteRecul = null; m.combinaison = null;
    m.possession = 'A'; m.phase = 'PORTE';
    const botteur = m.equipeA.find(j => j.numero === 10);
    botteur.x = 85; botteur.y = 35; botteur.auSol = 0; m.porteur = botteur;
    m._tenterCoupDePiedJeu(botteur, 'CHIP');
    m.cibleCoupDePiedX = LONGUEUR + 2; m.cibleCoupDePiedY = 35;
    // Tout le monde loin, sauf le joueur qui doit arriver le premier.
    for (const j of [...m.equipeA, ...m.equipeB]) { j.x = 60; j.y = 10 + (j.numero % 15) * 3; j.horsJeuKick = 0; j.auSol = 0; }
    const proche = premier === 'defenseur' ? m.equipeB.find(j => j.numero === 15) : m.equipeA.find(j => j.numero === 13);
    proche.x = LONGUEUR - 3; proche.y = 35;
    const s0 = m.score.A;
    for (let t = 0; t < 20 && m.phase === 'COUP_DE_PIED_JEU'; t += 0.1) m.tick(0.1);
    if (premier === 'defenseur') {
      assert.ok(m.phase === 'COUP_ENVOI' && m.renvoi22 && m.possession === 'B',
        `ballon aplati par la défense dans son en-but : renvoi aux 22 m attendu (phase ${m.phase}, possession ${m.possession})`);
    } else {
      assert.ok(m.phase === 'ESSAI' && m.score.A === s0 + 5,
        `ballon aplati par un chasseur dans l'en-but : essai attendu (phase ${m.phase}, score ${s0} -> ${m.score.A})`);
    }
  }
});

test('le ballon qui roule REBONDIT à l écran, et se pose quand il s arrête', () => {
  // P2-100. Depuis P2-92, le ballon roule après la chute, mais il glissait à
  // plat. getState expose la hauteur de rebond (ballon.rebond) : des rebonds
  // qui s'amortissent avec la vitesse, nuls une fois le ballon arrêté.
  let roulants = 0, avecRebond = 0, arretesAPlat = 0, arretes = 0;
  for (let seed = 1; seed <= 4; seed++) {
    const m = new MatchEngine(seed, 4800);
    for (let i = 0; i < 400000 && m.phase !== 'TERMINE'; i++) {
      m.tick(0.1);
      if (!m._receptionEnAttente) continue;
      const b = m.getState().ballon;
      if (m._rouleBallon) { roulants++; if ((b.rebond || 0) > 0.02) avecRebond++; }
      else { arretes++; if (!(b.rebond > 0)) arretesAPlat++; }
    }
  }
  assert.ok(roulants >= 100, `échantillon trop petit (${roulants} images de ballon qui roule)`);
  assert.ok(avecRebond >= 0.5 * roulants, `le ballon ne rebondit que sur ${avecRebond}/${roulants} images où il roule`);
  assert.strictEqual(arretesAPlat, arretes, 'un ballon arrêté au sol ne rebondit pas');
});

test('coup de pied tactique : le ballon qui tombe sans receveur ROULE, et peut finir en touche', () => {
  // P2-92 : un dégagement qui tombait sans personne dessous restait collé au
  // point de chute, immobile jusqu'à 4 s. En vrai, le ballon rebondit et
  // roule : c'est ce qui fait gagner du terrain au dégagement et ce qui crée
  // la course pour le récupérer. Le ballon qui roule hors du terrain donne une
  // touche (loi 18) à l'adversaire, là où il est sorti.
  let longs = 0, roules = 0, enTouche = 0, horsTerrainSansTouche = 0;
  // 24 graines : la touche en rebond est rare (~0,2 a 0,4 par match ; 1 seule
  // sur les graines 1-8 a l'ecriture du test, 0 apres P2-94).
  for (let seed = 1; seed <= 24; seed++) {
    const m = new MatchEngine(seed, 4800);
    let chute = null;
    for (let i = 0; i < 400000 && m.phase !== 'TERMINE'; i++) {
      const attente = m._receptionEnAttente;
      m.tick(0.1);
      if (!attente && m._receptionEnAttente) {
        const libre = ![...m.equipeA, ...m.equipeB].some(j => Math.hypot(j.x - m.ballonVolX, j.y - m.ballonVolY) <= 1.3);
        chute = { x: m.ballonVolX, y: m.ballonVolY, libre, long: libre && (m.typeCoupDePiedJeu === 'DEGAGEMENT' || m.typeCoupDePiedJeu === 'OCCUPATION') };
      } else if (chute && m._receptionEnAttente) {
        if (m.ballonVolY < 0 || m.ballonVolY > LARGEUR) horsTerrainSansTouche++;
        chute.fin = { x: m.ballonVolX, y: m.ballonVolY };
      } else if (chute && !m._receptionEnAttente) {
        if (chute.long) {
          longs++;
          const f = chute.fin || chute;
          if (Math.hypot(f.x - chute.x, f.y - chute.y) >= 2) roules++;
        }
        // Touche en rebond, quel que soit le coup de pied (depuis P2-95, la
        // touche visée hors de ses 22 m se cherche en rebond).
        if (chute.libre && m.phase === 'TOUCHE') enTouche++;
        chute = null;
      }
    }
  }
  assert.ok(longs >= 90, `échantillon trop petit (${longs} dégagements sans receveur)`);
  assert.ok(roules >= 0.8 * longs, `seulement ${roules}/${longs} dégagements tombés sans receveur ont roulé d'au moins 2 m`);
  assert.ok(enTouche >= 2, `${enTouche} ballon(s) seulement sorti(s) en touche en roulant en 24 matchs`);
  assert.strictEqual(horsTerrainSansTouche, 0, 'le ballon a roulé hors du terrain sans que la touche soit sifflée');
});

test('ballon au sol après un coup de pied : il est ramassé par un joueur arrivé au contact, jamais à distance', () => {
  // Relevé des sauts (P2-90) : un dégagement profond tombe parfois à 25 m de
  // tout le monde. Le joueur le plus proche y court (~6 m/s), mais le délai
  // de grâce de 4 s lui donnait le ballon à 2-17 m de lui : saut à l'écran.
  let cas = 0, propres = 0, pire = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const m = new MatchEngine(seed, 4800);
    for (let i = 0; i < 400000 && m.phase !== 'TERMINE'; i++) {
      const attente = m._receptionEnAttente, bx = m.ballonVolX, by = m.ballonVolY;
      m.tick(0.1);
      // En-avant sous la chandelle -> mêlée : le porteur est le n°9 adverse,
      // le ballon rejoint la mêlée à vue (cf. M24, P2-81). Ballon roulé en
      // touche (P2-92) : le porteur est le talonneur qui va lancer. Ballon
      // aplati dans l'en-but (P2-93) : renvoi aux 22 m, le botteur du renvoi.
      if (attente && !m._receptionEnAttente && m.porteur && !['MELEE', 'TOUCHE', 'COUP_ENVOI'].includes(m.phase)) {
        const d = Math.hypot(m.porteur.x - bx, m.porteur.y - by);
        cas++; if (d <= 1.6) propres++; pire = Math.max(pire, d);
      }
    }
  }
  assert.ok(cas >= 100, `échantillon trop petit (${cas} ballons au sol)`);
  assert.strictEqual(propres, cas, `${propres}/${cas} ballons ramassés au contact (pire : ${pire.toFixed(1)} m)`);
});

test('pénalité tapée en touche : le ballon rejoint la marque à vue avant la frappe', () => {
  // Relevé des sauts (P2-91) : après un hors-jeu en touche (P2-78) ou une
  // faute au ruck, le ballon passait d'un coup du vol du lancer (ou du ruck) à
  // la marque de pénalité, 2,5 à 6,7 m plus loin.
  let cas = 0, propres = 0, pire = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const m = new MatchEngine(seed, 4800);
    let prev = null, suivi = null;
    const brut = m.log.bind(m);
    m.log = (type, team, msg, extra) => {
      if (type === 'PENALITE' && /joue en touche/.test(msg)) suivi = { saut: 0 };
      return brut(type, team, msg, extra);
    };
    for (let i = 0; i < 400000 && m.getState().phase !== 'TERMINE'; i++) {
      m.tick(0.1);
      const b = m.getState().ballon;
      const p = { x: b.x, y: b.y };
      if (suivi && prev) {
        const P = m.penTouche;
        if (!P || P.etape !== 'APPROCHE') { cas++; if (suivi.saut < 3) propres++; pire = Math.max(pire, suivi.saut); suivi = null; }
        else suivi.saut = Math.max(suivi.saut, Math.hypot(p.x - prev.x, p.y - prev.y));
      }
      prev = p;
    }
  }
  assert.ok(cas >= 50, `échantillon trop petit (${cas} pénalités en touche)`);
  assert.strictEqual(propres, cas, `${propres}/${cas} pénalités en touche sans saut du ballon > 3 m avant la frappe (pire : ${pire.toFixed(1)} m)`);
});

test('jeu rapide (pénalité, coup franc) : le ballon est posé sur la marque, le tapeur le rejoint à vue', () => {
  // Relevé des sauts (P2-89) : sur une pénalité jouée vite après un ruck
  // (~0,6 par match), le n°9 du bénéficiaire devenait porteur là où il était
  // et le ballon sautait du ruck jusque dans ses mains (~8 m).
  let cas = 0, propres = 0, pire = 0, surMarque = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const m = new MatchEngine(seed, 4800);
    let prev = null, suivi = null;
    const brut = m.log.bind(m);
    m.log = (type, team, msg, extra) => {
      if ((type === 'PENALITE' && /rapidement/.test(msg)) || type === 'COUP_FRANC') suivi = { saut: 0, vu: false };
      return brut(type, team, msg, extra);
    };
    for (let i = 0; i < 400000 && m.getState().phase !== 'TERMINE'; i++) {
      m.tick(0.1);
      const b = m.getState().ballon;
      const p = { x: b.x, y: b.y };
      if (suivi && prev) {
        suivi.saut = Math.max(suivi.saut, Math.hypot(p.x - prev.x, p.y - prev.y));
        const R = m.penaliteRecul;
        if (R) { suivi.vu = true; suivi.d = Math.hypot(p.x - R.markX, p.y - R.markY); }
        if (!R || m.phase !== 'PORTE') {
          if (suivi.vu) {
            cas++; if (suivi.saut < 3) propres++; pire = Math.max(pire, suivi.saut);
            if (suivi.d < 1.5) surMarque++;
          }
          suivi = null;
        }
      }
      prev = p;
    }
  }
  assert.ok(cas >= 10, `échantillon trop petit (${cas} jeux rapides)`);
  assert.strictEqual(propres, cas, `${propres}/${cas} jeux rapides sans saut du ballon > 3 m (pire : ${pire.toFixed(1)} m)`);
  assert.ok(surMarque >= 0.9 * cas, `le ballon n'est sur la marque à la frappe que ${surMarque}/${cas} fois`);
});

test('tir au but : le ballon rejoint le buteur à vue avant la frappe (pénalité, transformation)', () => {
  // Relevé des sauts (P2-85) : à chaque pénalité au but (~4 par match) et à
  // chaque transformation (~5,5), le ballon sautait de ~10-11 m — du ruck ou
  // du marqueur dans l'en-but jusque dans les mains du buteur.
  let tirs = 0, propres = 0, pire = 0;
  for (const seed of [1, 2, 3]) {
    const m = new MatchEngine(seed, 4800);
    let prev = null, suivi = null, prevPhase = null;
    for (let i = 0; i < 400000 && m.getState().phase !== 'TERMINE'; i++) {
      m.tick(0.1);
      const b = m.getState().ballon;
      const p = { x: b.x, y: b.y };
      const tir = m.phase === 'PENALITE_TIR' || m.phase === 'TRANSFORMATION';
      const vol = b.enVol && (b.hauteur || 0) > 0;
      if (tir && prevPhase !== m.phase) suivi = { saut: prev ? Math.hypot(p.x - prev.x, p.y - prev.y) : 0 };
      else if (suivi && tir && !vol) suivi.saut = Math.max(suivi.saut, Math.hypot(p.x - prev.x, p.y - prev.y));
      if (suivi && (!tir || vol)) {
        tirs++;
        if (suivi.saut < 3) propres++;
        pire = Math.max(pire, suivi.saut);
        suivi = null;
      }
      prev = p; prevPhase = m.phase;
    }
  }
  assert.ok(tirs >= 20, `échantillon trop petit (${tirs} tirs au but)`);
  assert.ok(propres / tirs >= 0.95, `${propres}/${tirs} tirs au but sans saut du ballon > 3 m avant la frappe (pire : ${pire.toFixed(1)} m)`);
});

test('coup d\'envoi : après des points, le ballon revient au centre à vue, sans téléportation', () => {
  // Relevé des sauts (P2-84) : ~24 fois par match, au début de la mise en
  // place d'un coup d'envoi, le ballon sautait de ~49 m — des poteaux, où il
  // venait de retomber, jusque dans les mains du botteur.
  let mises = 0, propres = 0, pire = 0;
  for (const seed of [1, 2, 3]) {
    const m = new MatchEngine(seed, 4800);
    let prev = null, suivi = null, prevPhase = null;
    for (let i = 0; i < 400000 && m.getState().phase !== 'TERMINE'; i++) {
      m.tick(0.1);
      const b = m.getState().ballon;
      const p = { x: b.x, y: b.y };
      if (m.phase === 'COUP_ENVOI' && prevPhase !== 'COUP_ENVOI') suivi = { saut: prev ? Math.hypot(p.x - prev.x, p.y - prev.y) : 0 };
      else if (suivi && m.phase === 'COUP_ENVOI' && !m.envoiEnPlace) suivi.saut = Math.max(suivi.saut, Math.hypot(p.x - prev.x, p.y - prev.y));
      if (suivi && (m.phase !== 'COUP_ENVOI' || m.envoiEnPlace)) {
        mises++;
        if (suivi.saut < 3) propres++;
        pire = Math.max(pire, suivi.saut);
        suivi = null;
      }
      prev = p; prevPhase = m.phase;
    }
  }
  assert.ok(mises >= 30, `échantillon trop petit (${mises} mises en place)`);
  assert.ok(propres / mises >= 0.95, `${propres}/${mises} mises en place de coup d'envoi sans saut du ballon > 3 m (pire : ${pire.toFixed(1)} m)`);
});

test('coup d\'envoi : la mise en place n\'est pas du temps de jeu effectif', () => {
  // Le ballon n'est pas en jeu avant la frappe. La mise en place (les joueurs
  // regagnent leur moitié, le botteur rejoint le centre) était pourtant
  // comptée : 1,87 min de « jeu effectif » par match qui n'en était pas.
  let pasMiseEnPlace = 0, comptes = 0;
  for (const seed of [1, 2]) {
    const m = new MatchEngine(seed, 4800);
    for (let i = 0; i < 400000 && m.getState().phase !== 'TERMINE'; i++) {
      const avant = m.tempsJeuEffectif, enPlace = m.envoiEnPlace, phase = m.phase;
      m.tick(0.1);
      if (phase === 'COUP_ENVOI' && !enPlace && m.phase === 'COUP_ENVOI' && !m.envoiEnPlace) {
        pasMiseEnPlace++;
        if (m.tempsJeuEffectif > avant) comptes++;
      }
    }
  }
  assert.ok(pasMiseEnPlace > 100, `échantillon trop petit (${pasMiseEnPlace})`);
  assert.strictEqual(comptes, 0, `${comptes}/${pasMiseEnPlace} pas de mise en place du coup d'envoi comptés comme du jeu`);
});

test('coup d\'envoi : le ballon vole, à vue, de la frappe à la réception', () => {
  // Constat : sur 647 pas de vol de coup d'envoi, le ballon n'était affiché en
  // l'air que 39 fois — la phase de placement le déclarait « tenu par le
  // botteur » et le vol ne le remettait jamais en l'air. Le joueur voyait le
  // ballon rester dans les mains du botteur puis apparaître 20 à 50 m plus
  // loin chez le receveur, ~17 fois par match.
  let pasVol = 0, affiches = 0, envois = 0, sansSaut = 0;
  for (const seed of [1, 2, 3]) {
    const m = new MatchEngine(seed, 4800);
    let suivi = null;
    for (let i = 0; i < 400000 && m.getState().phase !== 'TERMINE'; i++) {
      m.tick(0.1);
      const s = m.getState();
      const enVolEnvoi = m.phase === 'COUP_ENVOI' && m.envoiEnPlace && m.timerPhase > 0;
      if (enVolEnvoi) {
        pasVol++;
        if (s.ballon.enVol) affiches++;
        if (!suivi) suivi = { pts: [] };
        suivi.pts.push({ x: s.ballon.x, y: s.ballon.y });
      } else if (suivi) {
        // Premier pas après la réception : le ballon ne doit pas sauter non plus.
        // (Coup d'envoi trop court -> mêlée : le saut vers le 9 relève de la
        // mêlée, traitée à part — cf. P2-81.)
        if (m.phase !== 'MELEE') {
          suivi.pts.push({ x: s.ballon.x, y: s.ballon.y });
          envois++;
          let saut = 0;
          for (let k = 1; k < suivi.pts.length; k++) saut = Math.max(saut, Math.hypot(suivi.pts[k].x - suivi.pts[k - 1].x, suivi.pts[k].y - suivi.pts[k - 1].y));
          // 4 m par pas de 0,1 s : un ballon frappé va jusqu'à ~25 m/s, plus
          // l'écart (<= 1,5 m) entre le botteur et le centre au départ. Avant
          // correctif, les sauts mesuraient 10 à 17 m (frappe) et 3 à 7 m
          // (réception).
          if (saut < 4) sansSaut++;
        }
        suivi = null;
      }
    }
  }
  assert.ok(envois >= 30, `échantillon trop petit (${envois} coups d'envoi)`);
  assert.ok(affiches / pasVol >= 0.95, `ballon affiché en vol sur ${affiches}/${pasVol} pas de vol de coup d'envoi`);
  assert.ok(sansSaut / envois >= 0.95, `${sansSaut}/${envois} coups d'envoi sans saut du ballon > 4 m (vol et réception)`);
});

// --- bugs.md BUG-RM-006 : une passe réussie a d'abord été tentée -----------
// Les offloads comptaient comme passes réussies sans être tentés : 266 succès
// pour 263 tentatives sur une équipe, impossible.
test('passes : chaque passe réussie, offload compris, est aussi une passe tentée (BUG-RM-006)', () => {
  let offloads = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const m = new MatchEngine(seed, 2400);
    while (m.phase !== 'TERMINE') m.tick(0.2);
    for (const e of ['A', 'B']) {
      const s = m.stats[e];
      offloads += s.offloads;
      assert.ok(s.passes <= s.passesTentees,
        `graine ${seed}, équipe ${e} : ${s.passes} passes réussies pour ${s.passesTentees} tentées`);
      // Les tentatives manquées ont une cause : passe en avant, interception ou passe ratée.
      assert.ok(s.passesTentees - s.passes <= s.knockOns + s.turnoversConcedes + 2,
        `graine ${seed}, équipe ${e} : ${s.passesTentees - s.passes} tentatives sans issue connue`);
    }
  }
  assert.ok(offloads >= 20, `échantillon sans offloads (${offloads})`);
});

// --- Courses : une par ballon porté, pas une par contact --------------------
// Un porteur qui casse un plaquage puis se fait reprendre faisait DEUX courses
// (46 par match en trop : 307 au lieu de 261). Comme en analyse de match, il
// fait une course et bat un défenseur.
test('courses : un plaquage cassé puis un second contact reste une seule course du même porteur', () => {
  let doubles = 0, battus = 0, courses = 0, rucks = 0, oublis = 0;
  for (let seed = 1; seed <= 4; seed++) {
    const m = new MatchEngine(seed, 2400);
    // Par joueur : une course de plus alors qu'il a déjà fait la sienne sans
    // avoir lâché le ballon (il est resté porteur d'un pas à l'autre).
    const avant = {}, dejaCompte = {};
    while (m.phase !== 'TERMINE') {
      const p0 = m.phase === 'PORTE' && m.porteur ? m.porteur.team + m.porteur.numero : null;
      m.tick(0.1);
      // Et jamais une de moins : un porteur plaqué qui fait un ruck a couru.
      if (p0 && m.phase === 'RUCK') {
        rucks++;
        const l = m.statsJoueurs[p0[0]][p0.slice(1)];
        if (!dejaCompte[p0] && !(l && l.courses > (avant[p0] || 0))) oublis++;
      }
      for (const e of ['A', 'B']) {
        for (const [num, l] of Object.entries(m.statsJoueurs[e])) {
          const cle = e + num, c = l.courses;
          if (c > (avant[cle] || 0)) { if (dejaCompte[cle]) doubles += c - avant[cle]; dejaCompte[cle] = true; }
          avant[cle] = c;
          if (!m.porteur || m.porteur.team + m.porteur.numero !== cle) dejaCompte[cle] = false;
        }
      }
    }
    for (const e of ['A', 'B']) {
      battus += m.stats[e].defenseursBattus; courses += m.stats[e].carries;
      const lignes = Object.values(m.statsJoueurs[e]).concat(m.statsJoueursSortis[e].map((r) => r.stats || {}));
      const indiv = lignes.reduce((s, l) => s + (l.courses || 0), 0);
      assert.strictEqual(indiv, m.stats[e].carries, `graine ${seed}, équipe ${e} : courses individuelles et d'équipe`);
    }
  }
  assert.strictEqual(doubles, 0, `${doubles} courses comptées deux fois pour le même porteur`);
  assert.ok(rucks >= 200 && oublis === 0, `${oublis} porteurs plaqués sans course sur ${rucks} rucks`);
  assert.ok(battus >= 40, `les défenseurs battus restent comptés (${battus})`);
  assert.ok(courses >= 300, `échantillon trop petit (${courses} courses)`);
});

// --- bugs.md BUG-RM-010 : un match se lit au coup de sifflet, pas à 80:00 ----
// Graine 4 : 31-18 à 80:00 pendant une transformation, 33-18 au sifflet.
test('jouerJusquAuSifflet : le match se lit au coup de sifflet, tir engagé compris (BUG-RM-010)', () => {
  // Une transformation en cours au chrono n'arrive pas à chaque match : on
  // cherche jusqu'à en trouver une, sur 80 graines au plus.
  let differents = 0;
  for (let seed = 1; seed <= 80 && differents < 2; seed++) {
    const coupe = new MatchEngine(seed, 600);
    for (let t = 0; t < 600; t += 0.2) coupe.tick(0.2);
    const complet = new MatchEngine(seed, 600);
    assert.strictEqual(complet.jouerJusquAuSifflet(0.2), complet, 'renvoie le moteur');
    assert.strictEqual(complet.phase, 'TERMINE', `graine ${seed} : match non terminé`);
    assert.ok(complet.tempsMatch < 600 + 60, `graine ${seed} : sifflet à ${complet.tempsMatch.toFixed(1)} s`);
    if (coupe.score.A !== complet.score.A || coupe.score.B !== complet.score.B) {
      differents++;
      assert.notStrictEqual(coupe.phase, 'TERMINE', 'seul un match coupé avant le sifflet peut différer');
    }
  }
  assert.ok(differents >= 1, 'la boucle à durée fixe doit manquer au moins un point sur 80 matchs (sinon le test ne prouve rien)');
  // Garde bornée : un match qui ne finit pas est une erreur, jamais un résultat.
  const bloque = new MatchEngine(1, 600);
  bloque.tick = function () { this.tempsMatch += 0.2; };
  assert.throws(() => bloque.jouerJusquAuSifflet(0.2), /non termin/);
});

// --- bugs.md BUG-RM-007 : le remplaçant a SES statistiques -----------------
// Le moteur indexait les actions par numéro de maillot : tout le match allait
// au titulaire, l'entrant n'avait aucune ligne.
test('remplacement : les actions du sortant sont closes à sa sortie, l entrant repart de zéro (BUG-RM-007)', () => {
  let lignesEntrants = 0;
  for (let seed = 1; seed <= 4; seed++) {
    const remplacements = [
      { equipe: 'A', numero: 10, minute: 40, joueurId: 'entrant-10', joueur: { poste: 'Demi d ouverture' } },
      { equipe: 'B', numero: 3, minute: 50, joueurId: 'entrant-3', joueur: { poste: 'Pilier' } },
      { equipe: 'B', numero: 3, minute: 70, joueurId: 'entrant-3bis', joueur: { poste: 'Pilier' } },
    ];
    const m = new MatchEngine(seed, 4800, { remplacements });
    m.jouerJusquAuSifflet(0.2);
    const st = m.getState();
    assert.deepStrictEqual(st.remplacementsEffectues.map((r) => [r.equipe, r.numero, r.joueurId]),
      [['A', 10, 'entrant-10'], ['B', 3, 'entrant-3'], ['B', 3, 'entrant-3bis']]);
    assert.deepStrictEqual(st.statsJoueursSortis.B.map((x) => x.numero), [3, 3], 'deux sorties au n°3');
    const sortie10 = st.statsJoueursSortis.A[0];
    assert.ok(Math.abs(sortie10.sortie - 2400) < 1, `sortie du 10 à ${sortie10.sortie}`);
    assert.ok(sortie10.stats && sortie10.stats.passes > 0, 'le 10 titulaire a joué 40 minutes : il a des passes');
    if (st.statsJoueurs.A[10]) lignesEntrants++;
    // Rien ne se perd ni ne se compte deux fois : sortants + présents = équipe.
    for (const e of ['A', 'B']) {
      for (const [kj, ke] of [['passes', 'passes'], ['tacklesMade', 'tacklesMade'], ['essais', 'essais'], ['courses', 'carries']]) {
        let somme = 0;
        for (const ligne of Object.values(st.statsJoueurs[e])) somme += ligne[kj] || 0;
        for (const x of st.statsJoueursSortis[e]) somme += (x.stats && x.stats[kj]) || 0;
        // Un essai de pénalité n'a pas de marqueur.
        const attendu = st.stats[e][ke] - (kj === 'essais' ? (st.stats[e].essaisPenalite || 0) : 0);
        assert.strictEqual(somme, attendu, `graine ${seed}, équipe ${e}, ${kj} : ${somme} pour ${attendu}`);
      }
    }
  }
  assert.ok(lignesEntrants >= 3, `l'entrant au n°10 doit avoir sa propre ligne (${lignesEntrants}/4)`);
  // Sans remplacement : rien ne change.
  const sans = new MatchEngine(1, 600).jouerJusquAuSifflet(0.2).getState();
  assert.deepStrictEqual(sans.statsJoueursSortis, { A: [], B: [] });
  assert.deepStrictEqual(sans.remplacementsEffectues, []);
});

// --- Loi 11 : la passe trop plate sous pression est jugée en avant -----------
// Le moteur ne sifflait une passe en avant que lorsque le porteur n'avait
// AUCUNE option légale : 0,1 à 0,2 par match, contre 1 à 3 en vrai. En vrai,
// elle naît surtout d'une passe PLATE lâchée sous pression, le receveur
// lancé : on interroge la décision de l'arbitre, état figé.
test('loi 11 : une passe plate sous pression est parfois jugée en avant, jamais une passe en retrait (P2-112)', () => {
  const taux = (recul, distDef, passe) => {
    const m = new MatchEngine(3, 4800);
    m.possession = 'A';
    const att = m.attaquants(), def = m.defenseurs();
    const porteur = att[9], cible = att[11];
    porteur.sensAttaque = 1; porteur.x = 50; porteur.y = 30; porteur.passe = passe;
    cible.x = 50 - recul; cible.y = 36;
    for (const d of def) { d.x = 90; d.y = 5; d.auSol = 0; }
    def[0].x = 50 + distDef; def[0].y = 30;
    let n = 0;
    for (let i = 0; i < 2000; i++) if (m._passePlateJugeeEnAvant(porteur, cible)) n++;
    return n / 2000;
  };
  const sousPression = taux(0.2, 1, 60);
  assert.ok(sousPression > 0.05 && sousPression < 0.5, `passe plate sous pression : ${sousPression}`);
  assert.strictEqual(taux(0.2, 8, 60), 0, 'sans pression, une passe plate passe');
  assert.strictEqual(taux(2.5, 1, 60), 0, 'une passe nettement en retrait n est jamais en avant');
  assert.ok(taux(0.2, 1, 90) < taux(0.2, 1, 30), 'un bon passeur la rate moins');
  // En match : la loi devient visible, sans submerger le jeu de mêlées.
  let avant = 0;
  const N = 8;
  for (let seed = 1; seed <= N; seed++) {
    const m = new MatchEngine(seed, 4800);
    const log = m.log.bind(m);
    m.log = (t, ...r) => { if (t === 'MELEE_AVANT') avant++; return log(t, ...r); };
    m.jouerJusquAuSifflet(0.2);
  }
  assert.ok(avant / N >= 0.7 && avant / N <= 3, `${(avant / N).toFixed(2)} passe(s) en avant sifflée(s) par match (réel : 1 à 3)`);
});

// --- Point de départ d'un essai : la marque de la phase, pas la position d'avant
// Une touche obtenue sur pénalité prenait la position du botteur : un essai de
// touche à 40 m de la ligne était compté « au-delà de 50 m ».
test("essai : son point de départ est celui de la touche ou de la mêlée qui l'a lancé", () => {
  let verifies = 0;
  const ecarts = [];
  for (let seed = 1; seed <= 6; seed++) {
    const m = new MatchEngine(seed, 4800);
    let derniere = null;
    const log = m.log.bind(m);
    m.log = (t, team, msg, extra, ...r) => {
      const p = m.porteur;
      if (t === 'TOUCHE_RAPIDE') derniere = null; // relancée hors de l'alignement : non vérifiée ici
      if (p && (t === 'TOUCHE_BALLON_GAGNE' || t === 'MELEE_BALLON_SORTI' || (t === 'TURNOVER' && m.phase === 'TOUCHE'))) {
        const sens = m.possession === 'A' ? 1 : -1;
        derniere = { origine: t === 'MELEE_BALLON_SORTI' ? 'MELEE' : 'TOUCHE', team: m.possession, dist: sens > 0 ? LONGUEUR - p.x : p.x };
      }
      if (t === 'ESSAI' && extra && derniere && extra.origine === derniere.origine && team === derniere.team) {
        verifies++;
        if (Math.abs(extra.depuis - derniere.dist) > 3) ecarts.push(`graine ${seed} : ${extra.origine} à ${derniere.dist.toFixed(0)} m, essai « depuis ${extra.depuis} m »`);
      }
      return log(t, team, msg, extra, ...r);
    };
    m.jouerJusquAuSifflet(0.1);
  }
  assert.ok(verifies >= 12, `échantillon trop petit (${verifies} essais de touche ou de mêlée)`);
  assert.deepStrictEqual(ecarts, []);
});

// --- Touche à 5 m de la ligne : le pack monte le maul ------------------------
// Une touche gagnée à 5 m ne donnait un maul qu'une fois sur 2,3 (43 %, comme à
// 16 m) : l'arme n°1 des avants près de l'en-but restait rare. La consigne
// « jeu au sol » garde son effet.
test('touche gagnée à 5 m de la ligne adverse : maul le plus souvent, pas plus qu à 16 m ailleurs', () => {
  function taux(x, config) {
    let gagnees = 0, mauls = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const m = new MatchEngine(seed, 4800, config);
      for (let i = 0; i < 20; i++) m.tick(0.1);
      let etat = null;
      const log = m.log.bind(m);
      m.log = (t, team, ...r) => {
        if (t === 'TOUCHE_BALLON_GAGNE' && team === 'A') { gagnees++; etat = 'gagnee'; }
        else if (etat === 'gagnee') { if (t === 'MAUL') mauls++; etat = 'fini'; }
        return log(t, team, ...r);
      };
      m._accorderTouche('B', { x, y: 0 }, 'COUP_DE_PIED');
      for (let i = 0; i < 600 && etat !== 'fini'; i++) m.tick(0.1);
    }
    assert.ok(gagnees >= 50, `échantillon trop petit (${gagnees} touches gagnées)`);
    return mauls / gagnees;
  }
  const cinq = taux(95), seize = taux(84);
  const sol = taux(95, { toucheA: { tauxMaul: { proche: 0.15, loin: 0.02 } } });
  assert.ok(cinq >= 0.6, `maul sur ${(100 * cinq).toFixed(0)} % des touches gagnées à 5 m`);
  assert.ok(seize >= 0.3 && seize <= 0.6, `maul sur ${(100 * seize).toFixed(0)} % à 16 m (réglage de base inchangé)`);
  assert.ok(sol <= cinq - 0.25, `consigne jeu au sol : ${(100 * sol).toFixed(0)} % de mauls à 5 m contre ${(100 * cinq).toFixed(0)} %`);
});

// --- bugs.md QA-RM-007 : événements, joueurs et équipe disent la même chose ---
test('rapprochement : réussis ≤ tentés partout, et chaque essai ou but du compteur a son événement (QA-RM-007)', () => {
  for (let seed = 1; seed <= 4; seed++) {
    const m = new MatchEngine(seed, 4800).jouerJusquAuSifflet(0.2);
    const st = m.getState();
    for (const e of ['A', 'B']) {
      const s = st.stats[e];
      for (const [r, t] of [['passes', 'passesTentees'], ['tacklesMade', 'tacklesAttempted'],
        ['transformationsReussies', 'transformationsTentees'], ['penalitesButReussies', 'penalitesButTentees'],
        ['dropsReussis', 'dropsTentes']]) {
        assert.ok(s[r] <= s[t], `graine ${seed}, équipe ${e} : ${r} ${s[r]} > ${t} ${s[t]}`);
      }
      for (const [num, l] of Object.entries(st.statsJoueurs[e])) {
        assert.ok(l.tacklesMade <= l.tacklesAttempted, `graine ${seed}, ${e} n°${num} : ${l.tacklesMade} plaquages réussis pour ${l.tacklesAttempted}`);
      }
      const ev = (type) => st.chronologie.filter((x) => x.type === type && x.team === e);
      assert.strictEqual(ev('ESSAI').length + ev('ESSAI_PENALITE').length, s.essais, `graine ${seed}, ${e} : essais`);
      assert.strictEqual(ev('TRANSFORMATION_REUSSIE').length, s.transformationsReussies, `graine ${seed}, ${e} : transformations`);
      assert.strictEqual(ev('PENALITE_REUSSIE').length, s.penalitesButReussies, `graine ${seed}, ${e} : pénalités`);
      // Chaque but porte son buteur et sa distance, chaque essai son marqueur et son origine.
      for (const x of ev('TRANSFORMATION_REUSSIE').concat(ev('PENALITE_REUSSIE'))) {
        assert.ok(x.buteur >= 1 && x.distance >= 5 && x.distance <= 60, `but sans buteur ou distance : ${JSON.stringify(x)}`);
      }
      for (const x of ev('ESSAI')) assert.ok(x.marqueur >= 1 && x.origine, `essai sans marqueur ou origine : ${JSON.stringify(x)}`);
    }
  }
});

// --- bugs.md QA-RM-002 : le ballon, son porteur et la possession concordent --
test('cohérence : celui qui tient le ballon est de l équipe en possession, et ne tient pas le ballon au sol (QA-RM-002)', () => {
  let tirs = 0, ticks = 0;
  for (let seed = 1; seed <= 3; seed++) {
    const m = new MatchEngine(seed, 4800);
    while (m.phase !== 'TERMINE') {
      m.tick(0.2); ticks++;
      const st = m.getState();
      const b = st.ball;
      if (st.phase === 'PENALITE_TIR') tirs++;
      if (!b.carrierTeam) continue;
      assert.strictEqual(b.carrierTeam, st.possession,
        `graine ${seed}, ${st.tempsMatch.toFixed(1)} s, ${st.phase} : le ballon est tenu par ${b.carrierTeam}, possession ${st.possession}`);
      if (st.phase === 'PORTE') {
        const p = (b.carrierTeam === 'A' ? st.equipeA : st.equipeB).find((j) => j.numero === b.carrierNumber);
        assert.ok(!(p.auSol > 0), `graine ${seed}, ${st.tempsMatch.toFixed(1)} s : le porteur court au sol (n°${p.numero})`);
      }
    }
  }
  assert.ok(tirs > 0, 'échantillon sans pénalité au but');
});

// --- P2-119 : après un franchissement, les dépassés poursuivent ------------
// Scénario figé : le centre A a passé la ligne, trois défenseurs B sont 3 m
// derrière lui, l'arrière est loin. Ils tenaient « leur ligne » à 85 % de leur
// vitesse et le perceur s'envolait ; ils doivent sprinter et le reprendre.
test('franchissement : les défenseurs dépassés poursuivent le perceur à pleine vitesse (P2-119)', () => {
  let ecartFinal = 0, n = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const m = new MatchEngine(seed, 600);
    for (let t = 0; t < 30; t += 0.2) m.tick(0.2);
    m.phase = 'PORTE'; m.timerPhase = 6; m.possession = 'A';
    m.passeVisuelle = null; m.combinaison = null; m.penaliteRecul = null;
    m.ruckPoint = null; m._neufLibre = false; m.maul = null; m._porteApresPied = true;
    const porteur = m.equipeA.find((j) => j.numero === 12);
    m.porteur = porteur;
    Object.assign(porteur, { auSol: 0, x: 40, y: 35, _enchaine: 0, _percee: 2.5, vitesseCourante: 6 });
    for (const j of m.equipeA) if (j !== porteur) Object.assign(j, { auSol: 0, x: 30, y: 35 });
    for (const j of m.equipeB) Object.assign(j, { auSol: 0, horsJeuKick: 0, fixeCooldown: 0, missCooldown: 1,
      ruckRecovery: 0, sinBin: 0, x: 99, y: 5 });
    const depasses = m.equipeB.filter((j) => [4, 7, 13].includes(j.numero));
    depasses.forEach((j, i) => Object.assign(j, { x: 37, y: 30 + 5 * i, vitesseCourante: 6 }));
    for (let k = 0; k < 10 && m.phase === 'PORTE' && m.porteur === porteur; k++) m.tick(0.2);
    for (const d of depasses) { ecartFinal += Math.hypot(d.x - porteur.x, d.y - porteur.y); n++; }
  }
  const moyen = ecartFinal / n;
  assert.ok(moyen < 4.5, `les dépassés finissent à ${moyen.toFixed(1)} m du perceur en 2 s (ils doivent revenir sur lui)`);
});

console.log(`\n${nbTests} test(s) exécuté(s).`);
if (process.exitCode) {
  console.error('ECHEC : au moins un invariant violé.');
} else {
  console.log('OK : tous les invariants respectés.');
}
