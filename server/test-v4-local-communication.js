// Contrats de transport des appels locaux. NE PROUVE PAS que les agents
// du match produisent ou interprètent déjà ces appels (RM4-G04/G08/G10).
'use strict';
const assert = require('assert');
const { CALLS, LocalCommunication } = require('../engine/ai/local-communication.js');

let tests = 0;
function test(name, fn) { fn(); tests++; console.log('OK COM-' + String(tests).padStart(2, '0') + ' ' + name); }
const actor = (id, x, y, time, extra={}) => ({
  listenerId: id, team: id[0], x, y, time, ...extra
});
const speaker = (id, kind, x, y, time, extra={}) => ({
  speakerId: id, team: id[0], kind, x, y, time, ...extra
});

test('catalogue court fermé, descriptions intelligibles', () => {
  assert.deepStrictEqual(Object.keys(CALLS), [
    'MINE', 'BALL', 'INSIDE', 'OUTSIDE', 'SUPPORT', 'HOLD', 'UP',
    'SLIDE', 'COVER', 'KICK', 'LEAVE'
  ]);
  for (const spec of Object.values(CALLS)) {
    assert.ok(typeof spec.label === 'string' && spec.label.includes('!'));
    assert.ok(spec.radiusM > 0 && spec.ttlSeconds > 0);
  }
});
test('un appel est entendu après un délai de propagation, pas immédiatement', () => {
  const com = new LocalCommunication();
  assert.deepStrictEqual(com.emit(speaker('A9', 'BALL', 50, 30, 1)), {accepted:true,id:'CALL-1'});
  assert.deepStrictEqual(com.hear(actor('A10',52,30,1.12)), []);
  const heard = com.hear(actor('A10',52,30,1.13));
  assert.strictEqual(heard.length,1);
  assert.strictEqual(heard[0].kind,'BALL');
  assert.strictEqual(heard[0].from,'A9');
  assert.strictEqual(heard[0].heardAt,1.13);
  assert.strictEqual(heard[0].spokenAt,1);
  assert.strictEqual(Object.hasOwn(heard[0],'target'),false);
});
test('un destinataire ne reçoit le même appel qu’une seule fois', () => {
  const com = new LocalCommunication();
  com.emit(speaker('A9','INSIDE',50,30,0));
  assert.strictEqual(com.hear(actor('A12',54,32,.3)).length,1);
  assert.strictEqual(com.hear(actor('A12',54,32,.4)).length,0);
  assert.strictEqual(com.hear(actor('A13',54,32,.4)).length,1);
});
test('un adversaire ne reçoit jamais les messages d’équipe', () => {
  const com = new LocalCommunication();
  com.emit(speaker('A9','KICK',50,30,0));
  assert.deepStrictEqual(com.hear(actor('B9',51,30,.5)),[]);
  assert.strictEqual(com.hear(actor('A10',51,30,.5)).length,1);
});
test('distance hors de portée : aucune livraison, sans mutation du message', () => {
  const com = new LocalCommunication();
  com.emit(speaker('A9','HOLD',10,10,0));
  assert.deepStrictEqual(com.hear(actor('A12',60,60,1)),[]);
  assert.strictEqual(com.pendingCount(),1);
});
test('un joueur éloigné peut entendre avant expiration s’il se rapproche', () => {
  const com = new LocalCommunication();
  com.emit(speaker('A11','SUPPORT',50,10,0));
  assert.deepStrictEqual(com.hear(actor('A12',90,10,.3)),[]);
  assert.strictEqual(com.hear(actor('A12',55,10,.5)).length,1);
});
test('une information sonore expire et ne crée pas de mémoire éternelle', () => {
  const com = new LocalCommunication();
  com.emit(speaker('A9','LEAVE',50,10,0));
  assert.deepStrictEqual(com.hear(actor('A12',55,10,1.2)),[]);
  assert.strictEqual(com.prune(1.3),1);
  assert.strictEqual(com.pendingCount(),0);
});
test('le locuteur ne réentend pas sa propre voix comme un message', () => {
  const com = new LocalCommunication();
  com.emit(speaker('A9','BALL',10,10,0));
  assert.deepStrictEqual(com.hear(actor('A9',10,10,.5)),[]);
});
test('joueur indisponible ou sourd : aucun appel reçu', () => {
  const com = new LocalCommunication();
  assert.strictEqual(com.emit(speaker('A9','BALL',10,10,0,{available:false})).accepted,false);
  com.emit(speaker('A9','BALL',10,10,0));
  assert.deepStrictEqual(com.hear(actor('A10',11,10,.4,{available:false})),[]);
  assert.deepStrictEqual(com.hear(actor('A10',11,10,.4,{hearing:0})),[]);
  assert.strictEqual(com.hear(actor('A10',11,10,.4)).length,1);
});
test('limite de fréquence : pas de cris permanents à chaque tick', () => {
  const com = new LocalCommunication();
  assert.strictEqual(com.emit(speaker('A9','BALL',20,20,0)).accepted,true);
  assert.deepStrictEqual(com.emit(speaker('A9','KICK',20,20,.3)), {
    accepted:false,reason:'COOLDOWN'
  });
  assert.strictEqual(com.emit(speaker('A9','KICK',20,20,.7)).accepted,true);
});
test('plusieurs messages simultanés : ordre stable et aucune affectation', () => {
  const com = new LocalCommunication();
  com.emit(speaker('A9','BALL',50,35,0));
  com.emit(speaker('A12','COVER',50,35,0));
  const received = com.hear(actor('A13',51,35,.4));
  assert.deepStrictEqual(received.map(m=>m.kind),['BALL','COVER']);
  for (const msg of received) {
    assert.strictEqual('goal' in msg,false);
    assert.strictEqual('plan' in msg,false);
    assert.strictEqual('target' in msg,false);
    assert.strictEqual('position' in msg,false);
    assert.ok(msg.confidence > 0 && msg.confidence <= 1);
  }
});
test('mêmes entrées : mêmes appels à chaque exécution, sans RNG', () => {
  function replay() {
    const com = new LocalCommunication();
    const result = [];
    result.push(com.emit(speaker('A7','COVER',42,36,1)));
    result.push(com.emit(speaker('A9','INSIDE',40,35,1)));
    result.push(...com.hear(actor('A8',41,35,1.3)));
    return JSON.stringify(result);
  }
  assert.strictEqual(replay(),replay());
});
test('capacité bornée : un appel excédentaire est rejeté sans écraser les autres', () => {
  const com = new LocalCommunication({maxPending:1});
  assert.strictEqual(com.emit(speaker('A9','BALL',50,30,0)).accepted,true);
  assert.deepStrictEqual(com.emit(speaker('A10','COVER',52,30,0)),{
    accepted:false,reason:'QUEUE_FULL'
  });
  assert.strictEqual(com.hear(actor('A11',51,30,.5)).length,1);
});
test('paramètres et événements invalides refusés', () => {
  const com = new LocalCommunication();
  assert.throws(()=>new LocalCommunication({soundSpeedMps:0}),/invalides/);
  assert.throws(()=>new LocalCommunication({maxPending:0}),/invalides/);
  assert.throws(()=>com.emit(speaker('A9','BANANA',10,10,0)),/inconnu/);
  assert.throws(()=>com.emit(speaker('A9','BALL',NaN,10,0)),/fini/);
  assert.throws(()=>com.hear(actor('B16',10,10,0)),/invalide/);
  assert.throws(()=>com.hear(actor('A10',10,10,0,{hearing:1.1})),/hors/);
});
test('coupure du système : aucun signal émis ni reçu', () => {
  const com = new LocalCommunication({enabled:false});
  assert.strictEqual(com.emit(speaker('A9','BALL',50,35,0)).accepted,false);
  assert.deepStrictEqual(com.hear(actor('A10',51,35,.3)),[]);
});
test('aucune donnée des agents ni état de match modifiés', () => {
  const com = new LocalCommunication();
  const p=speaker('A9','BALL',10,10,0), q=actor('A10',11,11,.5);
  const oldP=JSON.stringify(p),oldQ=JSON.stringify(q);
  com.emit(p);com.hear(q);
  assert.strictEqual(JSON.stringify(p),oldP);
  assert.strictEqual(JSON.stringify(q),oldQ);
});
console.log(tests+' tests de communication locale réussis (transport seul)');
