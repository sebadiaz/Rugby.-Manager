// Contrat documentaire GOAP : catalogue des 51 buts et 66 actions.
// Le passage ne prouve PAS leur intégration au moteur de rugby.
'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const source=fs.readFileSync(path.join(__dirname,
  '../docs/SIMULATION_V4/05_CATALOGUE_GOALS_ACTIONS.md'),'utf8');

function rows(prefix) {
  const regex=new RegExp('^\\| ('+prefix+'[0-9]{2}) \\| \x60([A-Z][A-Z0-9_]*)\x60 \\| (.+?) \\|$', 'gm');
  const items=[];
  for(const m of source.matchAll(regex)){
    const cols=m[3].split(' | ');
    if(prefix==='G'){
      assert.strictEqual(cols.length,2,m[1]+' 2 colonnes après ID/nom');
    }else{
      assert.strictEqual(cols.length,3,m[1]+' 3 colonnes après ID/nom');
    }
    assert.ok(cols.every(c=>c.trim().length>=3),m[1]+' colonne vide ou non explicite');
    assert.ok(cols[0].trim().length>=10,m[1]+' préconditions/succès trop courts');
    items.push({id:m[1],name:m[2]});
  }
  return items;
}
const goals=rows('G'),actions=rows('A');
assert.strictEqual(goals.length,51,'51 buts documentés attendus');
assert.strictEqual(actions.length,66,'66 actions documentées attendues');
for(const [arr,prefix] of [[goals,'G'],[actions,'A']]){
  const ids=new Set(), names=new Set();
  for(let i=0;i<arr.length;i++){
    const entry=arr[i],expect=prefix+String(i+1).padStart(2,'0');
    assert.strictEqual(entry.id,expect,'ordre ou ID manquant pour '+expect);
    assert.ok(!ids.has(entry.id),'id dupliqué : '+entry.id);
    assert.ok(!names.has(entry.name),'but/action dupliqué : '+entry.name);
    ids.add(entry.id);names.add(entry.name);
  }
}
for(const name of ['DEFEND','COVER_BACKFIELD','CLOSE_NEAREST_GAP',
  'EXPLOIT_SCRUM_EXIT','RELEASE_MAUL_WHEN_USEFUL',
  'CONTEST_AERIAL_BALL','TRANSITION_AFTER_TURNOVER',
  'READ_AND_INTERCEPT','CHOOSE_PENALTY_RESTART',
  'KEEP_BALL_WITH_OFFLOAD','INSERT_FROM_BLINDSIDE',
  'CREATE_CREDIBLE_DECOY','READ_DEFENDER_COMMITMENT','OPEN_SHORT_PASS_LANE',
  'DEFEND_MULTIPLE_RECEIVER_OPTIONS','SUPPORT_AFTER_SHORT_KICK',
  'ABORT_CONFLICTING_SCRUM_PICK','RETURN_HOOKER_AS_RECEIVER',
  'EXPLOIT_BLIND_SIDE_IF_AVAILABLE']){
  assert.ok(goals.some(g=>g.name===name),'but absent : '+name);
}
for(const name of ['SCRUM_8_PICK_FROM_BACK','MAUL_RELEASE_TO_9',
  'MAUL_PEEL_AND_CARRY','KICK_GRUBBER_BEHIND',
  'KICK_HIGH_CONTEST','OFFLOAD_AFTER_CONTACT',
  'READ_PASS_AND_INTERCEPT','CUT_INSIDE_FROM_BLINDSIDE',
  'RUN_CREDIBLE_DECOY','DUMMY_PASS_AND_CARRY','TRACK_DEFENDER_COMMITMENT',
  'FIX_THEN_DELAY_RELEASE','SHORT_FLAT_PASS_TO_GAP','CUT_INSIDE_BEHIND_SUPPORT',
  'SWITCH_MARKING_TARGET','HOLD_TRYLINE_DEPTH','SIDESTEP_LAST_DEFENDER',
  'GRUBBER_TO_BLIND_SIDE','REJOIN_ATTACK_AFTER_LINEOUT_THROW',
  'GIVE_AND_GO_WITH_HOOKER','ABORT_SCRUM_BASE_PICK_ON_HEARD_CALL',
  'CHASE_TEAMMATE_GROUND_KICK','REPLAN_AFTER_FAILED_DECOY',
  'TRANSITION_TO_DEFENSE_ON_LOST_KICK']){
  assert.ok(actions.some(a=>a.name===name),'action absente : '+name);
}
console.log('Catalogue GOAP valide : 51 buts uniques et 66 actions uniques ; moteur non raccordé.');
