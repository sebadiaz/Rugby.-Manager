'use strict';

const assert = require('node:assert/strict');
const { configGOAP } = require('../engine/ai/goap-mode.js');
const { lirePorteur, intercepter } = require('../engine/ai/open-play.js');
const { individualPlacement } = require('../engine/ai/individual-placement.js');
const { AgentContext } = require('../engine/ai/agent-context.js');
const { deriveSituation, profilePour } = require('../engine/ai/goals.js');
const { createScenarioEngine } = require('./v4/scenario-harness.js');

function scene({ marque = 'interieur', team = 'A', zone = 48, numero = 4 } = {}) {
  const x = (distance) => team === 'A' ? distance : 100 - distance;
  const positions = { A: {}, B: {} };
  const defense = team === 'A' ? 'B' : 'A';
  Object.assign(positions[team], { [numero]: [zone, 35], 8: [zone - 2, 42], 12: [zone - 2, 28] });
  Object.assign(positions[defense], {
    1: [zone + 5, 35],
    2: [zone + 2, marque === 'interieur' ? 42 : 28],
    3: [zone + 4, marque === 'interieur' ? 43 : 27],
  });
  const players = [];
  for (const t of ['A', 'B']) for (let n = 1; n <= 15; n++) {
    const [px, y] = positions[t][n] || [t === team ? 0 : 100, (n * 4) % 70];
    players.push({ id: t + n, team: t, number: n, x: x(px), y });
  }
  const m = createScenarioEngine({
    id: 'lecture locale', seed: 7, phase: 'PORTE',
    setup: { possession: team, ball: { x: x(zone), y: 35, carrier: team + numero }, players },
  }, { strict: true, config: configGOAP() });
  m.rng = () => 0.5;
  return m;
}

function lecture(m, team = 'A', numero = 4) {
  const b = new AgentContext({ team, numero }, { fovDeg: 360 }).update(m.getState());
  return lirePorteur(b, deriveSituation(b), profilePour(numero), {});
}

for (const team of ['A', 'B']) {
  const interieur = scene({ team });
  const exterieur = scene({ team, marque: 'exterieur' });
  assert.equal(lecture(interieur, team).vers, 12);
  assert.equal(lecture(exterieur, team).vers, 8);
  for (const [m, vers] of [[interieur, 12], [exterieur, 8]]) {
    const a = m.porteur;
    // Faire choisir aussi le vrai agent, via scheduler puis moteur.
    for (let i = 0; i < 8 && m.porteur === a; i++) m.tick(0.05);
    assert.equal(m.porteur.numero, vers);
    assert.equal(m.porteur.team, team);
    assert.equal(m.stats[team].passes, 1);
    assert.ok(m.passeVisuelle, 'la passe emprunte le vol normal du ballon');
    assert.equal(m.getState().ball.carrierNumber, null, 'pendant le vol aucun porteur ne peut jouer ou être plaqué');
    const agent = m._pilote.agents.find(j => j.id === team + 4);
    const choix = agent.events.find(e => e.type === 'OPEN_PLAY_CHOSEN' && e.action === 'PASS');
    assert.equal(choix?.vers, vers);
  }
}
console.log('OK : même porteur, deux véritables destinataires selon la couverture, dans les deux sens');

{
  const m = scene();
  const c = m.porteur;
  const r = m.equipeA.find(j => j.numero === 8);
  const initial = { x: r.x, y: r.y };
  for (const changement of [{ x: c.x + 2 }, { auSol: 1 }, { sinBin: 5 }, { horsJeuKick: 1 }, { y: 69 }]) {
    Object.assign(r, initial, { auSol: 0, sinBin: 0, horsJeuKick: 0 }, changement);
    assert.equal(m._tenterPasse(c, false, r.numero), false);
    assert.equal(m.porteur, c);
    assert.equal(m.stats.A.passesTentees, 0);
  }
}
console.log('OK : aucune redirection si le receveur a dépassé le porteur, est indisponible ou hors de portée');

{
  const m = scene({ zone: 17, numero: 10 });
  m.equipeA.find(j => j.numero === 8).x = 3;
  m.equipeA.find(j => j.numero === 12).x = 3;
  assert.equal(lecture(m, 'A', 10).action, 'KICK');
  for (let i = 0; i < 9 && m.phase === 'PORTE'; i++) m.tick(0.05);
  assert.equal(m.phase, 'COUP_DE_PIED_JEU');
  assert.equal(m.stats.A.kicks, 1);
  assert.ok(m._pilote.agents.find(j => j.id === 'A10').events.some(e => e.type === 'OPEN_PLAY_CHOSEN' && e.action === 'KICK'));
}
console.log('OK : sous pression dans ses 22 sans soutien, l’ouvreur déclenche un dégagement réel');

{
  const m = scene({ zone: 85, numero: 4 });
  for (const n of [2, 3]) m.equipeB.find(j => j.numero === n).y += 15;
  const d = m.equipeB.find(j => j.numero === 1);
  d.x = 92; d.y = 31;
  assert.equal(lecture(m).action, 'RUN');
  const x = m.porteur.x;
  for (let i = 0; i < 6; i++) m.tick(0.05);
  assert.ok(m.porteur.x > x && m.porteur.numero === 4);
}
console.log('OK : devant un espace libre, le porteur avance balle en main');

{
  const m = scene();
  const a = { team: 'A', numero: 8 };
  const cible = () => {
    const b = new AgentContext(a, { fovDeg: 360 }).update(m.getState());
    return individualPlacement(b, 'BE_PASS_OPTION', {}, profilePour(a.numero), true);
  };
  const r1 = cible();
  const d = m.equipeB.find(j => j.numero === 2);
  d.y = r1.target.y;
  const r2 = cible();
  assert.ok(r1.placementGoal === 'ATTACK_GAP' || r2.placementGoal === 'ATTACK_GAP');
  assert.notDeepEqual(r1.target, r2.target);
  assert.ok(r2.target.x <= m.porteur.x);

  const cote = { lastSeen: { x: 70, y: 32 }, vx: -5, vy: 4, age: 0.1 };
  const me = { x: 61, y: 33 };
  const droite = intercepter(me, cote, 6);
  const gauche = intercepter(me, { ...cote, vy: -4 }, 6);
  assert.ok(droite.y > cote.lastSeen.y && gauche.y < cote.lastSeen.y);
  assert.ok(droite.x < cote.lastSeen.x);
}
console.log('OK : le soutien change de course et le défenseur anticipe le changement de direction');

for (const team of ['A', 'B']) {
  const couvert = (y) => {
    const m = scene({ team, zone: 17, numero: 10 });
    const partenaires = team === 'A' ? m.equipeA : m.equipeB;
    const adversaires = team === 'A' ? m.equipeB : m.equipeA;
    for (const j of partenaires.filter(j => j.numero === 8 || j.numero === 12)) j.x = team === 'A' ? 3 : 97;
    const arriere = adversaires.find(j => j.numero === 15);
    arriere.x = team === 'A' ? 57 : 43;
    arriere.y = y;
    return m;
  };
  for (const y of [19, 51]) {
    const m = couvert(y);
    const choix = lecture(m, team, 10);
    assert.equal(choix.kick, 'DEGAGEMENT');
    assert.ok((choix.cibleY - 35) * (y - 35) < 0, 'l’ouvreur vise à l’opposé de la couverture');
    for (let i = 0; i < 9 && m.phase === 'PORTE'; i++) m.tick(0.05);
    assert.equal(m.phase, 'COUP_DE_PIED_JEU');
    assert.equal(m.cibleCoupDePiedY, choix.cibleY, 'le couloir choisi devient la vraie cible du vol');
  }

  const m = couvert(19);
  m.porteur.y = 3;
  m._tenterCoupDePiedJeu(m.porteur, 'DEGAGEMENT');
  assert.ok(m.cibleCoupDePiedY >= 9 && m.cibleCoupDePiedY <= 61);
  for (let i = 0; i < 60 && m.phase === 'COUP_DE_PIED_JEU'; i++) m.tick(0.1);
  assert.notEqual(m.phase, 'TOUCHE', 'un dégagement du bord peut être relancé');

  const touche = couvert(19);
  touche.porteur.y = 3;
  touche._tenterCoupDePiedJeu(touche.porteur, 'TOUCHE');
  for (let i = 0; i < 60 && touche.phase === 'COUP_DE_PIED_JEU'; i++) touche.tick(0.1);
  assert.equal(touche.phase, 'TOUCHE');
  assert.notEqual(touche.possession, team, 'une touche volontaire depuis les 22 rend le lancer');
}
console.log('OK : dégagement orienté selon la couverture, ballon relançable et touche volontaire dans les deux sens');

{
  const m = scene({ zone: 18, numero: 10 });
  const plaqueur = m.equipeB.find(j => j.numero === 1);
  m.rng = () => 0;
  m._porteApresPied = true;
  m.timerPhase = 1.2;
  assert.notEqual(m.choisirActionPorteur(m.porteur, plaqueur, 8, 0.1), 'KICK');
  assert.equal(m.choisirActionPorteur(m.porteur, plaqueur, 4, 0.1), 'KICK', 'un receveur sous pression peut dégager');
  m.timerPhase = 3;
  assert.equal(m.choisirActionPorteur(m.porteur, plaqueur, 8, 0.1), 'KICK', 'la possibilité revient après le départ de la relance');
}
console.log('OK : fenêtre pour relancer après réception et dégagement encore possible sous pression');

for (const y of [1.1, 68.9]) {
  const versBord = y < 35 ? -1 : 1;
  for (const pousseeVersBord of [true, false]) {
    const m = scene({ zone: 48, numero: 4 });
    m.porteur.y = y;
    m.porteur.vitesseCourante = 0;
    const plaqueur = m.equipeB.find(j => j.numero === 1);
    plaqueur.x = m.porteur.x + 0.5;
    plaqueur.y = y - versBord * (pousseeVersBord ? 1.5 : -1);
    m.tick(0.1);
    assert.equal(m.stats.B.tacklesMade, 1);
    assert.equal(m.phase, pousseeVersBord ? 'TOUCHE' : 'RUCK',
      'le même porteur peut finir en touche ou au sol dans le terrain selon l’angle du plaqueur');
    assert.equal(m.possession, pousseeVersBord ? 'B' : 'A');
    if (pousseeVersBord) assert.equal(m.ruckPoint.y, versBord < 0 ? 0 : 70, 'la marque est sur la ligne');
  }
}
console.log('OK : un plaquage vers le bord sort le ballon, un plaquage vers le terrain crée un ruck');

function perceeSurAile(team) {
  const m = scene({ team, zone: 72, numero: 14 });
  const x = distance => team === 'A' ? distance : 100 - distance;
  const def = team === 'A' ? m.equipeB : m.equipeA;
  const att = team === 'A' ? m.equipeA : m.equipeB;
  for (const j of [...att, ...def]) Object.assign(j, { x: x(53), y: 57, vitesseCourante: 0 });
  Object.assign(m.porteur, { x: x(72), y: 11, vitesseCourante: 7.4, vitesse: 85, orientation: team === 'A' ? 0 : Math.PI });
  const arriere = def.find(j => j.numero === 15);
  Object.assign(arriere, { x: x(89), y: 19, orientation: team === 'A' ? Math.PI : 0, vitesse: 83 });
  return { m, arriere, def, x };
}

for (const team of ['A', 'B']) {
  const { m, arriere, def, x } = perceeSurAile(team);
  const placement = () => {
    const b = new AgentContext({ team: arriere.team, numero: 15 }, { fovDeg: 360 }).update(m.getState());
    return individualPlacement(b, 'COVER_BACKFIELD', {}, profilePour(15), true);
  };
  const libre = placement();
  assert.equal(libre.placementGoal, 'COVER_BREAK');
  assert.ok((libre.target.x - m.porteur.x) * m.porteur.sensAttaque > 4);
  assert.ok(Math.abs(libre.target.y - m.porteur.y) <= 1);
  const ailier = def.find(j => j.numero === 11);
  Object.assign(ailier, { x: x(80), y: 12 });
  assert.equal(placement().placementGoal, 'COVER_BACKFIELD');
  ailier.missCooldown = 1;
  assert.equal(placement().placementGoal, 'COVER_BREAK', 'un défenseur battu ne compte plus comme couverture');
  Object.assign(ailier, { x: x(53), y: 57, missCooldown: 0 });
  arriere.horsJeuKick = 2;
  assert.equal(placement().placementGoal, 'COVER_BACKFIELD');
  arriere.horsJeuKick = 0;

  for (let i = 0; i < 60 && m.phase === 'PORTE'; i++) m.tick(0.1);
  assert.ok(m.phase === 'RUCK' || m.phase === 'TOUCHE', 'le plaquage de couverture arrête la course');
  assert.ok(m.getState().statsJoueurs[arriere.team][15].tacklesMade > 0, 'le moteur crédite le plaquage du n°15');
  assert.equal(m.score[team], 0);

  const absent = perceeSurAile(team);
  absent.arriere.sinBin = 120;
  for (let i = 0; i < 60 && absent.m.phase === 'PORTE'; i++) absent.m.tick(0.1);
  assert.equal(absent.m.score[team], 5, 'sans arrière disponible la percée peut aller à l’essai');
}
console.log('OK : le n°15 coupe une percée avec un vrai plaquage, garde le fond si l’aile est couverte ou s’il est hors-jeu');
