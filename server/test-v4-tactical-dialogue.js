// Jeu de scénarios de DIALOGUE symbolique pour le 9, le 10 et les avants.
// Cela valide l'échange de messages, PAS l'IA tactique du match ni la
// possibilité d'obtenir une poussée, un lancer ou une réception.
'use strict';
const assert = require('assert');
const { LocalCommunication, CALLS } =
  require('../engine/ai/local-communication.js');
let n=0;
function test(name,fn){fn();n++;console.log('OK DIA-'+String(n).padStart(2,'0')+' '+name);}
const say=(who,kind,t,toId,replyTo)=>({
  speakerId:who,team:who[0],kind,x:50,y:35,time:t,
  ...(toId?{toId}:{}),...(replyTo?{replyTo}:{})
});
const hear=(who,t,x=51,y=35)=>({listenerId:who,team:who[0],x,y,time:t});

test('touche : c est le 9 qui pose la question au 10',()=>{
  const c=new LocalCommunication({cooldownSeconds:0});
  const q=c.emit(say('A9','LINEOUT_ASK',1,'A10'));
  assert.strictEqual(q.accepted,true);
  assert.deepStrictEqual(c.hear(hear('A2',1.3)),[]);
  assert.strictEqual(c.hear(hear('A10',1.3))[0].kind,'LINEOUT_ASK');
});
test('touche : 10 répond au 9 puis le 9 annonce sa propre demande',()=>{
  const c=new LocalCommunication({cooldownSeconds:0});
  const q=c.emit(say('A9','LINEOUT_ASK',1,'A10'));
  c.hear(hear('A10',1.3));
  c.emit(say('A10','LINEOUT_BACK',1.4,'A9',q.id));
  const advice=c.hear(hear('A9',1.7));
  assert.strictEqual(advice.length,1);
  assert.strictEqual(advice[0].replyTo,q.id);
  // Le 9 reste libre de demander une option différente de l'avis du 10.
  c.emit(say('A9','LINEOUT_FRONT',2.2));
  assert.strictEqual(c.hear(hear('A2',2.5))[0].kind,'LINEOUT_FRONT');
});
test('mêlée : demande 9 vers 8, état transmis puis demande de stabilité',()=>{
  const c=new LocalCommunication({cooldownSeconds:0});
  const q=c.emit(say('A9','SCRUM_ASK',4,'A8'));
  assert.strictEqual(c.hear(hear('A8',4.3))[0].kind,'SCRUM_ASK');
  c.emit(say('A8','SCRUM_UNSTABLE',4.4,'A9',q.id));
  assert.strictEqual(c.hear(hear('A9',4.7))[0].replyTo,q.id);
  c.emit(say('A9','SCRUM_STEADY',4.8));
  assert.strictEqual(c.hear(hear('A3',5.1))[0].kind,'SCRUM_STEADY');
});
test('mêlée : pousser fort est une demande, pas une garantie de victoire',()=>{
  const c=new LocalCommunication();
  c.emit(say('A9','SCRUM_DRIVE',2));
  const heard=c.hear(hear('A2',2.4));
  assert.strictEqual(heard.length,1);
  assert.strictEqual(heard[0].kind,'SCRUM_DRIVE');
  for(const x of ['score','scrumWinner','force','target','goal','plan']){
    assert.strictEqual(Object.hasOwn(heard[0],x),false);
  }
});
test('mêlée : aucune commande standard pour tourner illégalement ou écrouler',()=>{
  assert.strictEqual(Object.hasOwn(CALLS,'SCRUM_COLLAPSE'),false);
  assert.strictEqual(Object.hasOwn(CALLS,'SCRUM_TURN'),false);
  assert.strictEqual(CALLS.SCRUM_PRESSURE.label,'Ça tourne !');
});
test('jeu courant : le 9 annonce la chandelle avant la tentative de pied',()=>{
  const c=new LocalCommunication();
  const kickTime=12.0;
  c.emit(say('A9','KICK_HIGH',11.0));
  const heard=c.hear(hear('A14',11.3,57,35));
  assert.strictEqual(heard.length,1);
  assert.strictEqual(heard[0].kind,'KICK_HIGH');
  assert.ok(heard[0].spokenAt < kickTime);
});
test('jeu courant : un trois-quarts lointain ne reçoit pas une intention magique',()=>{
  const c=new LocalCommunication();
  c.emit(say('A9','KICK_HIGH',11.0));
  assert.deepStrictEqual(c.hear(hear('A11',11.5,95,35)),[]);
});
test('annonce de chandelle annulable : message ne produit aucun coup de pied',()=>{
  const c=new LocalCommunication();
  c.emit(say('A9','KICK_HIGH',11.0));
  const intent=c.hear(hear('A12',11.3))[0];
  assert.strictEqual(intent.kind,'KICK_HIGH');
  assert.strictEqual(Object.hasOwn(intent,'ballState'),false);
  assert.strictEqual(Object.hasOwn(intent,'kickDone'),false);
  assert.strictEqual(Object.hasOwn(intent,'carrierId'),false);
});
test('9 peut recevoir plusieurs réponses sans intelligence collective',()=>{
  const c=new LocalCommunication({cooldownSeconds:0});
  const q=c.emit(say('A9','SCRUM_ASK',10));
  c.emit(say('A8','SCRUM_STEADY',10.2,'A9',q.id));
  c.emit(say('A3','SCRUM_PRESSURE',10.3,'A9',q.id));
  const received=c.hear(hear('A9',10.6));
  assert.deepStrictEqual(received.map(x=>x.kind),['SCRUM_STEADY','SCRUM_PRESSURE']);
  assert.ok(received.every(x=>x.replyTo===q.id));
});
test('mêmes entrées : même conversation et ordre indépendants des FPS',()=>{
  function sim(){
    const c=new LocalCommunication({cooldownSeconds:0});
    const q=c.emit(say('A9','LINEOUT_ASK',1,'A10'));
    c.hear(hear('A10',1.3));
    c.emit(say('A10','LINEOUT_MAUL',1.4,'A9',q.id));
    return JSON.stringify(c.hear(hear('A9',1.7)));
  }
  assert.strictEqual(sim(),sim());
});
console.log(n+' scénarios de dialogues tactiques symboliques réussis ; intégration GOAP à réaliser');
