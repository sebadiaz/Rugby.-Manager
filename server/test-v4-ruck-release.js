'use strict';

const assert = require('node:assert/strict');
const { MatchEngine } = require('../engine/rugby-engine.js');
const { configGOAP } = require('../engine/ai/goap-mode.js');

function scene(equipe, { soutien, neuf, contest, hasard = 0.3 }) {
  const m = new MatchEngine(9, 4800, configGOAP());
  m.possession = equipe;
  m.ballonEnVol = false;
  const attaque = m.attaquants(), defense = m.defenseurs();
  const sens = equipe === 'A' ? 1 : -1;
  for (const j of attaque) Object.assign(j, { x: 50 - sens * 20, y: 35, auSol: 0 });
  for (const j of defense) Object.assign(j, { x: 50 + sens * 20, y: 52, auSol: 0 });
  const cherche = (groupe, n) => groupe.find(j => j.numero === n);
  const porteur = cherche(attaque, 8), plaqueur = cherche(defense, 7);
  Object.assign(porteur, { x: 50, y: 35 });
  if (contest) Object.assign(plaqueur, { x: 50 + sens, y: 35, ...contest });
  if (soutien) Object.assign(cherche(attaque, 10), { x: 50 - sens * soutien, y: 35 });
  if (neuf) Object.assign(cherche(attaque, 9), { x: 50 - sens * neuf, y: 35 });
  m._plaquerSurPlace(porteur, plaqueur);
  // Fin du délai de recyclage, après une arrivée initialement tardive.
  m.ruckPlaquage = 0;
  m.timerPhase = 20;
  m.ruckTempsSansSoutien = 4;
  m.rng = () => hasard;
  m._tirerFauteRuck = () => null;
  return { m, plaqueur };
}

for (const equipe of ['A', 'B']) {
  const adverse = equipe === 'A' ? 'B' : 'A';
  {
    const { m } = scene(equipe, { soutien: 1.5, neuf: 2, contest: {} });
    m._tickRuck(0.05);
    assert.equal(m.phase, 'PORTE');
    assert.equal(m.porteur.numero, 9, 'un soutien arrivé efface le motif d’isolement à la sortie');
    assert.equal(m.possession, equipe);
    assert.equal(m.stats[equipe].penalitesConcedees, 0);
  }
  {
    const { m } = scene(equipe, { soutien: 3.5, contest: { auSol: 2 }, hasard: 0 });
    m._neufLibre = true;
    m._tickRuck(0.05);
    assert.equal(m.phase, 'PORTE');
    assert.equal(m.porteur.numero, 10, 'un relais proche peut servir quand le 9 est en retard');
    assert.equal(m._neufLibre, false, 'seul le vrai relais bénéficie de la prise de balle');
    assert.equal(m.stats[adverse].turnovers, 0, 'un défenseur au sol ne gratte pas');
    assert.equal(m.stats[equipe].penalitesConcedees, 0);
  }
  {
    const { m } = scene(equipe, { contest: {} });
    m._tickRuck(0.05);
    assert.equal(m.stats[equipe].penalitesConcedees, 1, 'le plaqué qui retient face à un gratteur peut être sanctionné');
  }
  {
    const { m } = scene(equipe, { contest: {}, soutien: -1.5 });
    m._tickRuck(0.05);
    assert.equal(m.stats[equipe].penalitesConcedees, 1, 'un joueur en avant du ballon ne constitue pas encore un soutien');
  }
  {
    const { m, plaqueur } = scene(equipe, { contest: {}, hasard: 0 });
    m._tickRuck(0.05);
    assert.equal(m.possession, adverse);
    assert.equal(m.porteur, plaqueur, 'le gratteur réellement arrivé récupère le ballon');
    assert.equal(m.stats[adverse].turnovers, 1);
  }
  {
    const { m } = scene(equipe, {});
    m._tickRuck(0.05);
    assert.equal(m.phase, 'MELEE', 'une balle injouable sans relais donne une mêlée');
    assert.equal(m.stats[equipe].rucksConserves, 0);
    assert.equal(m.stats[equipe].penalitesConcedees, 0);
  }
}
console.log('OK : six situations de ruck vérifiées dans les deux sens du terrain');
