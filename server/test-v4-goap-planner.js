// Tests du planificateur GOAP SYMBOLIQUE, sans modifier le moteur de match.
// Une étape planifiée ne peut pas s'octroyer un ballon ou un plaquage : le
// branchement physique et la vérification par successGuard viendront ensuite.
'use strict';
const assert = require('assert');
const { planGoal, selectFeasibleGoal, stableKey, satisfies } =
  require('../engine/ai/goal-planner.js');

function run(name, fn) { fn(); console.log('OK GOAP ' + name); }
const actions = [
  { id:'MOVE_TO_RUCK', preconditions:{ atRuck:false, onside:true },
    effects:{ atRuck:true }, cost:1 },
  { id:'SECURE_BALL', preconditions:{ atRuck:true, available:true, secured:false },
    effects:{ secured:true, hasBall:true }, cost:1 },
  { id:'PASS_TO_10', preconditions:{ hasBall:true, tenOpen:true },
    effects:{ distributed:true, hasBall:false }, cost:1 },
  { id:'PASS_TO_POD', preconditions:{ hasBall:true, podOpen:true },
    effects:{ distributed:true, hasBall:false }, cost:2 },
];
const initial = {
  onside:true, atRuck:false, available:true, secured:false,
  hasBall:false, tenOpen:true, podOpen:true, distributed:false,
};

run('G01 : le 9 planifie trois actions avec dépendances', () => {
  const p=planGoal(initial,{distributed:true},actions);
  assert.strictEqual(p.status,'OK');
  assert.deepStrictEqual(p.steps,['MOVE_TO_RUCK','SECURE_BALL','PASS_TO_10']);
  assert.strictEqual(p.cost,3);
  assert.ok(satisfies(p.finalFacts,{distributed:true,hasBall:false}));
});
run('G02 : si le 10 est couvert, plan alternatif vers le pod', () => {
  const p=planGoal({...initial,tenOpen:false},{distributed:true},actions);
  assert.strictEqual(p.status,'OK');
  assert.deepStrictEqual(p.steps,['MOVE_TO_RUCK','SECURE_BALL','PASS_TO_POD']);
});
run('G03 : sans option de réception, aucun plan n’est inventé', () => {
  const p=planGoal({...initial,tenOpen:false,podOpen:false},{distributed:true},actions);
  assert.strictEqual(p.status,'NO_PLAN');
  assert.deepStrictEqual(p.steps,[]);
});
run('G04 : un 9 hors-jeu ne peut pas ramasser sans revenir onside', () => {
  const p=planGoal({...initial,onside:false},{distributed:true},actions);
  assert.strictEqual(p.status,'NO_PLAN');
});
run('G05 : ajouter GET_ONSIDE crée un nouveau plan légal', () => {
  const p=planGoal({...initial,onside:false},{distributed:true},[
    ...actions,
    { id:'GET_ONSIDE', preconditions:{onside:false},
      effects:{onside:true}, cost:2 },
  ]);
  assert.strictEqual(p.status,'OK');
  assert.deepStrictEqual(p.steps,
    ['GET_ONSIDE','MOVE_TO_RUCK','SECURE_BALL','PASS_TO_10']);
});
run('G06 : Dijkstra choisit le coût minimal, pas le premier chemin', () => {
  const p=planGoal({haveBall:false,done:false},{done:true},[
    {id:'Z_DIRECT',preconditions:{haveBall:false},effects:{done:true},cost:9},
    {id:'A_GET',preconditions:{haveBall:false},effects:{haveBall:true},cost:1},
    {id:'B_FINISH',preconditions:{haveBall:true},effects:{done:true},cost:1},
  ]);
  assert.deepStrictEqual(p.steps,['A_GET','B_FINISH']);
  assert.strictEqual(p.cost,2);
});
run('G07 : pas de mutation du snapshot ni de la définition des actions', () => {
  const input=JSON.parse(JSON.stringify(initial));
  const defs=JSON.parse(JSON.stringify(actions));
  planGoal(input,{distributed:true},defs);
  assert.deepStrictEqual(input,initial);
  assert.deepStrictEqual(defs,actions);
});
run('G08 : déterminisme malgré un ordre de catalogue inversé', () => {
  const p=planGoal(initial,{distributed:true},actions);
  for(let i=0;i<3;i++) {
    assert.deepStrictEqual(planGoal(initial,{distributed:true},actions.slice().reverse()),p);
  }
  assert.strictEqual(stableKey({b:2,a:1}),stableKey({a:1,b:2}));
});
run('G09 : budget de nœuds explicitement dépassé', () => {
  const p=planGoal(initial,{distributed:true},actions,{maxExpanded:1,maxDepth:8});
  assert.strictEqual(p.status,'BUDGET_EXCEEDED');
  assert.deepStrictEqual(p.steps,[]);
});
run('G10 : profondeur maximale explicite', () => {
  const p=planGoal(initial,{distributed:true},actions,{maxExpanded:128,maxDepth:2});
  assert.strictEqual(p.status,'DEPTH_LIMIT');
});
run('G11 : but déjà atteint', () => {
  const p=planGoal({...initial,distributed:true},{distributed:true},actions);
  assert.strictEqual(p.status,'ALREADY_SATISFIED');
  assert.deepStrictEqual(p.steps,[]);
});
run('G12 : priorité de buts + plan réellement réalisable', () => {
  const goals=[
    {id:'TRY_IMPOSSIBLE',priority:100,desiredFacts:{tryScored:true}},
    {id:'DISTRIBUTE',priority:50,desiredFacts:{distributed:true}},
  ];
  const r=selectFeasibleGoal(initial,goals,actions);
  assert.strictEqual(r.goalId,'DISTRIBUTE');
  assert.strictEqual(r.status,'OK');
});
run('G13 : les actions non valides ne sont pas acceptées', () => {
  assert.throws(()=>planGoal(initial,{distributed:true},[
    {id:'MAGIC_TELEPORT',preconditions:{},effects:{distributed:true},cost:-5},
  ]),/coût/);
  assert.throws(()=>planGoal(initial,{distributed:true},[actions[0],actions[0]]),/dupliqué/);
  assert.throws(()=>planGoal(initial,{distributed:true},actions,{maxExpanded:0}),/budget/);
});
run('G14 : but déjà atteint ne bloque pas un autre but actif', () => {
  const goals=[
    {id:'ALREADY_DONE',priority:100,desiredFacts:{distributed:true}},
    {id:'NEXT_PROGRESS',priority:20,desiredFacts:{followedUp:true}},
  ];
  const facts={...initial,distributed:true,followedUp:false};
  const newAction={id:'FOLLOW_UP',preconditions:{followedUp:false},
    effects:{followedUp:true},cost:1};
  const p=selectFeasibleGoal(facts,goals,[...actions,newAction]);
  assert.strictEqual(p.goalId,'NEXT_PROGRESS');
  assert.deepStrictEqual(p.steps,['FOLLOW_UP']);
  const done=selectFeasibleGoal({distributed:true},[
    {id:'ALREADY_DONE',priority:1,desiredFacts:{distributed:true}}
  ],[]);
  assert.strictEqual(done.status,'ALL_GOALS_SATISFIED');
});
console.log('14 tests GOAP symboliques OK ; contrôle des effets physiques à construire (RM4-G07)');
