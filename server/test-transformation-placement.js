// Après un essai, les défenseurs s'ÉTALENT sur la ligne d'en-but (pas groupés sous les poteaux, là où le
// ballon de la transformation vole) ; l'équipe qui a marqué s'étale derrière le tee.
const { MatchEngine } = require('../engine/rugby-engine.js');
let ok = 0, ko = 0;
const t = (nom, c) => { if (c) { ok++; console.log('OK  ', nom); } else { ko++; console.log('FAIL', nom); } };
let vus = 0, sousPoteaux = 0, etale = 0, attaqueEtalee = 0;
for (let seed = 1; seed <= 10; seed++) {
  const m = new MatchEngine(seed, 4800);
  for (let i = 0; i < 40000 && m.phase !== 'TERMINE'; i++) {
    m.tick(0.1);
    if (m.phase === 'TRANSFORMATION' && m.timerPhase > 20) {
      const def = (m.essaiEquipe === 'A' ? m.equipeB : m.equipeA).filter(j => j.sinBin <= 0);
      const att = (m.essaiEquipe === 'A' ? m.equipeA : m.equipeB).filter(j => j.sinBin <= 0 && j !== m.porteur);
      vus++;
      sousPoteaux += def.filter(j => Math.abs(j.y - 35) < 4).length;
      const ys = def.map(j => j.y);
      if (Math.max(...ys) - Math.min(...ys) > 55) etale++;
      const ya = att.map(j => j.y);
      if (Math.max(...ya) - Math.min(...ya) > 40) attaqueEtalee++;
      break;
    }
  }
}
t('des transformations ont été observées', vus >= 8);
t('au plus 1 défenseur sur 15 dans le couloir des poteaux', sousPoteaux <= vus);
t('la défense est étalée sur plus de 55 m de large', etale === vus);
t('l\'équipe qui a marqué est étalée aussi', attaqueEtalee === vus);
console.log(`${ok} OK, ${ko} KO`);
process.exit(ko ? 1 : 0);
