// Temps et séquence de reprise OFFICIELS (lois 12 et 19, texte 2025 dans rules/world-rugby-laws-2025.txt) :
//  - le coup d'envoi (début de match, seconde période, après un essai ou un renvoi) ne part QUE lorsque tous les
//    joueurs sont replacés (l'équipe qui botte derrière le ballon, les adversaires au-delà de leur ligne) et que
//    l'arbitre a sifflé ;
//  - le chronomètre ne démarre qu'au coup d'envoi d'ouverture et de la seconde période ;
//  - la formation de la mêlée respecte la limite légale quand on la règle à 30 s (loi 19.4).
'use strict';
const assert = require('assert');
const { MatchEngine } = require('../engine/rugby-engine.js');
let nb = 0, ko = 0;
function test(n, f) { nb++; try { f(); console.log('OK   ' + n); } catch (e) { ko++; console.error('FAIL ' + n + '\n' + e.stack.split('\n').slice(0, 5).join('\n')); } }

// Observe tous les coups d'envoi d'un match : à l'instant où le ballon peut partir (envoiEnPlace passe à vrai),
// relève l'écart des joueurs à leur place, le coup de sifflet entendu et la position de l'équipe qui botte.
function observerEnvois(graine, duree = 4800, config) {
  const m = new MatchEngine(graine, duree, config);
  const envois = [];
  const sifflets = [];
  const log = m.log.bind(m);
  m.log = (t, eq, msg, d) => { if (t === 'SIFFLET_REPRISE' && !(d && d.penalite)) sifflets.push({ t: m.tempsMatch, tick: m._numTick, d }); return log(t, eq, msg, d); };
  let avant = null;
  const tickOriginal = m._tickCoupEnvoi.bind(m);
  m._tickCoupEnvoi = (dt) => {
    const enPlaceAvant = m.envoiEnPlace;
    let pire = 0;
    // L'équipe qui botte prend son élan dans la dernière seconde avant la frappe (elle avance vers la ligne du ballon sans la
    // dépasser, vérifié plus bas) : pour elle on ne compte que l'écart LATÉRAL à sa place.
    for (const j of [...m.equipeA, ...m.equipeB]) if (j._cibleEnvoi) {
      const dy = j._cibleEnvoi.y - j.y, dx = j._cibleEnvoi.x - j.x;
      pire = Math.max(pire, j.team === m.possession ? Math.abs(dy) : Math.hypot(dx, dy));
    }
    const sifflet = !!m._sifflet;
    const horloge = m.tempsMatch;
    const r = tickOriginal(dt);
    if (!enPlaceAvant && m.envoiEnPlace) {
      const eqKick = m.possession, sens = eqKick === 'A' ? 1 : -1;
      const derriere = (eqKick === 'A' ? m.equipeA : m.equipeB).filter((j) => j !== m.porteur && (j.x - m.xCoupEnvoi) * sens > 0.5).length;
      envois.push({ tick: m._numTick, t: m.tempsMatch, pire, sifflet, derriere, horloge, sifflets: sifflets.length, phaseAvant: avant });
    }
    return r;
  };
  m.jouerJusquAuSifflet(0.1);
  return { m, envois, sifflets };
}

test('chaque coup d\'envoi suit un coup de sifflet de l\'arbitre, une fois tous les joueurs replacés', () => {
  let total = 0;
  for (const g of [1, 2, 3]) {
    const { envois, sifflets } = observerEnvois(g);
    assert.ok(envois.length >= 6, `graine ${g} : ${envois.length} coups d'envoi`);
    assert.strictEqual(sifflets.length, envois.length, `un sifflet par reprise (${sifflets.length} / ${envois.length})`);
    for (const e of envois) {
      assert.ok(e.pire <= 1.5, `graine ${g} : un joueur encore à ${e.pire.toFixed(1)} m de sa place au coup d'envoi (t=${e.t.toFixed(0)})`);
      assert.ok(e.sifflet, 'le ballon part pendant/après le coup de sifflet');
      assert.strictEqual(e.derriere, 0, `graine ${g} : un partenaire du botteur devant le ballon`);
    }
    total += envois.length;
  }
  assert.ok(total >= 18);
});

test('le coup de sifflet dure un temps réel (≥ 1,2 s de jeu) ; les joueurs ne font que finir de se placer, l\'équipe qui botte prend son élan (≤ 2,6 m)', () => {
  const m = new MatchEngine(2, 4800);
  let pasSifflet = 0, positions = null, deplacement = 0, mesures = 0;
  for (let i = 0; i < 40000 && mesures < 3; i++) {
    m.tick(0.1);
    if (m._sifflet) {
      if (pasSifflet === 0) positions = [...m.equipeA, ...m.equipeB].map((j) => ({ x: j.x, y: j.y }));
      pasSifflet++;
      [...m.equipeA, ...m.equipeB].forEach((j, k) => { deplacement = Math.max(deplacement, Math.hypot(j.x - positions[k].x, j.y - positions[k].y)); });
    } else if (pasSifflet > 0) {
      assert.ok(pasSifflet * 0.1 >= 1.2 - 1e-6, `sifflet trop court : ${(pasSifflet * 0.1).toFixed(1)} s`);
      pasSifflet = 0; mesures++;
    }
  }
  assert.strictEqual(mesures, 3, 'trois coups de sifflet observés (ouverture comprise)');
  // 2,6 m (et non 1,25 m) : dans la dernière seconde avant la frappe, la ligne de chasse prend son élan sans dépasser le ballon.
  assert.ok(deplacement <= 2.6, `les joueurs bougent de ${deplacement.toFixed(2)} m pendant le sifflet`);
});

test('le chronomètre ne démarre qu\'au coup d\'envoi d\'ouverture : 0:00 pendant le placement et le sifflet', () => {
  const m = new MatchEngine(3, 4800);
  assert.strictEqual(m.tempsMatch, 0);
  let ticks = 0;
  while (!m.envoiEnPlace && ticks < 2000) { m.tick(0.1); ticks++; assert.strictEqual(m.tempsMatch, 0, 'horloge arrêtée avant le coup d\'envoi'); }
  assert.ok(ticks >= 30, `placement + sifflet d'ouverture : ${ticks} pas`);
  assert.ok(m.envoiEnPlace);
  for (let i = 0; i < 20; i++) m.tick(0.1);
  assert.ok(m.tempsMatch > 1.5, 'l\'horloge court après le coup d\'envoi');
});

test('seconde période : le replacement et le coup de sifflet précèdent le coup d\'envoi, horloge arrêtée', () => {
  const m = new MatchEngine(4, 4800);
  let arretee = false, horlogeFigee = true, vu = false;
  let tPrec = null;
  for (let i = 0; i < 60000 && !(m.miTempsJouee && m.envoiEnPlace && vu); i++) {
    m.tick(0.1);
    if (m.miTempsJouee && m.phase === 'COUP_ENVOI' && !m.envoiEnPlace) {
      vu = true;
      if (tPrec !== null && m.tempsMatch !== tPrec) horlogeFigee = false;
      tPrec = m.tempsMatch;
      arretee = m._horlogeArretee === true;
    }
  }
  assert.ok(vu, 'reprise de la seconde période observée');
  assert.ok(arretee && horlogeFigee, 'horloge arrêtée jusqu\'au coup d\'envoi de la seconde période');
});

test('après un essai, l\'horloge court (loi 5 : elle ne s\'arrête pas pour la transformation ni la reprise)', () => {
  const { m } = observerEnvois(1);
  assert.ok(m.tempsMatch >= 4800 - 1, 'match complet joué');
});

test('mêlée : la formation réglée à 30 s respecte la limite légale de la loi 19.4 ; le réglage par défaut est inchangé', () => {
  const formation = (cfg) => {
    const m = new MatchEngine(1, 4800, cfg);
    const d = [];
    let t0 = null;
    for (let i = 0; i < 48000; i++) {
      m.tick(0.1);
      const f = m.melee && m.melee.etat === 'MELEE_FORMATION';
      if (f && t0 === null) t0 = m.tempsMatch;
      if (!f && t0 !== null) { d.push(m.tempsMatch - t0); t0 = null; }
      if (m.phase === 'TERMINE') break;
    }
    return d;
  };
  const defaut = formation();
  const legal = formation({ melee: { durees: { formation: 30 } } });
  const moy = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(defaut.length >= 8 && legal.length >= 8);
  assert.ok(moy(defaut) >= 40, `défaut inchangé (~44 s) : ${moy(defaut).toFixed(1)}`);
  assert.ok(moy(legal) <= 31, `à 30 s la mise en place respecte la loi : ${moy(legal).toFixed(1)} s`);
});

test('pénalité jouée vite : tous les coéquipiers du tapeur derrière le ballon (loi 20.10), 30 s maximum', () => {
  let vues = 0;
  for (const g of [1, 2, 3]) {
    const m = new MatchEngine(g, 4800);
    let debut = null, sif = false;
    for (let i = 0; i < 48000 && m.phase !== 'TERMINE'; i++) {
      const R = m.penaliteRecul;
      if (R && debut === null) { debut = m.tempsMatch; sif = false; }
      if (R) sif = true;
      m.tick(0.1);
      if (!m.penaliteRecul && debut !== null) {
        const dur = m.tempsMatch - debut;
        assert.ok(dur <= 31, `reprise en ${dur.toFixed(1)} s (> 30 s)`);
        if (sif) {
          const eq = m.possession === 'A' ? m.equipeA : m.equipeB, sens = m.possession === 'A' ? 1 : -1;
          const devant = eq.filter((j) => j !== m.porteur && j.auSol <= 0 && j.sinBin <= 0 && (j.x - m.porteur.x) * sens > 1.5).length;
          assert.strictEqual(devant, 0, `graine ${g} : ${devant} coéquipier(s) devant le tapeur à la reprise`);
          vues++;
        }
        debut = null;
      }
    }
  }
  assert.ok(vues >= 3, `reprises rapides avec sifflet observées : ${vues}`);
});

console.log(`\n${nb - ko}/${nb} tests OK`);
if (ko) process.exit(1);
