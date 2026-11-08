// Contrat documentaire GOAP : catalogue des 43 buts et 50 actions.
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
    assert.ok(cols.every(c=>c.trim().length>=10),m[1]+' description non suffisamment précise');
    items.push({id:m[1],name:m[2]});
  }
  return items;
}
const goals=rows('G'),actions=rows('A');
assert.strictEqual(goals.length,43,'43 buts documentés attendus');
assert.strictEqual(actions.length,50,'50 actions documentées attendues');
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
  'KEEP_BALL_WITH_OFFLOAD','INSERT_FROM_BLINDSIDE']){
  assert.ok(goals.some(g=>g.name===name),'but absent : '+name);
}
for(const name of ['SCRUM_8_PICK_FROM_BACK','MAUL_RELEASE_TO_9',
  'MAUL_PEEL_AND_CARRY','KICK_GRUBBER_BEHIND',
  'KICK_HIGH_CONTEST','OFFLOAD_AFTER_CONTACT',
  'READ_PASS_AND_INTERCEPT','CUT_INSIDE_FROM_BLINDSIDE']){
  assert.ok(actions.some(a=>a.name===name),'action absente : '+name);
}
console.log('Catalogue GOAP valide : 43 buts uniques et 50 actions uniques ; moteur non raccordé.');
