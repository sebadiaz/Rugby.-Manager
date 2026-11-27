// Audit des lois PENDANT la simulation : vérifie à chaque tick et à chaque événement.
const R=require('path').join(__dirname,'..')+'/';
const { MatchEngine } = require(R+'engine/rugby-engine.js');
const { configGOAP } = require(R+'engine/ai/goap-mode.js');
const graine=+process.argv[2], mode=process.argv[3]||'LEGACY';
const m=new MatchEngine(graine,4800,mode==='GOAP'?configGOAP():undefined);
const V={}, N={}; const viol=(k,msg)=>{ V[k]=(V[k]||0)+1; (V[k+'_ex']=V[k+'_ex']||[]).length<2&&V[k+'_ex'].push('t='+m.tempsMatch.toFixed(0)+' '+msg); };
const ok=(k)=>{N[k]=(N[k]||0)+1;};
const tous=()=>m.equipeA.concat(m.equipeB);
const sensDe=(eq)=>eq==='A'?1:-1;
let echappe=null, dernierFaute=null, avantageOuvert=null, essaiAttente=null, ptsAvant={A:0,B:0};
const l=m.log.bind(m);
m.log=(t,e,msg,d)=>{
  const sens=sensDe(e);
  if(t==='PASSE'&&d){ const eq=e==='A'?m.equipeA:m.equipeB; const p=eq.find(j=>j.numero===d.de), r=eq.find(j=>j.numero===d.vers);
    if(p&&r){ ok('passes'); if((r.x-p.x)*sens>3) viol('L11 passe vers l\'avant acceptée (>3 m)',`${e}${d.de}->${d.vers} +${((r.x-p.x)*sens).toFixed(1)} m`);} }
  if(t==='MELEE_AVANT'||t==='MELEE_ENAVANT'||t==='PASSE_RATEE'){ dernierFaute=e; ok('en-avants/passes avant sanctionnés'); }
  if(t==='BALLON_ECHAPPE'){ ok('ballons échappés en arrière laissés en jeu (L11)'); echappe=e; }
  if(t==='MELEE'&&echappe&&!dernierFaute) viol('L11 mêlée sur un ballon échappé en arrière (pas un en-avant)',msg);
  if(t!=='BALLON_ECHAPPE'&&t!=='MELEE') echappe=null;
  if(t==='MELEE'){ if(dernierFaute){ ok('melee apres en-avant'); if(e===dernierFaute&&!/passe en avant|en-avant/i.test(msg)) viol('L11/12 mêlée après en-avant introduite par le fautif',e+' '+msg); dernierFaute=null; } }
  if(t==='ESSAI'){ ok('essais'); const p=m.porteur; if(p){ const dansBut=(p.team==='A'&&p.x>=98.5)||(p.team==='B'&&p.x<=1.5); if(!dansBut) viol('L8 essai hors de l\'en-but adverse',`x=${p.x.toFixed(1)} equipe ${p.team}`);} essaiAttente=m.tempsMatch; }
  if(t==='AVANTAGE'){ avantageOuvert={t:m.tempsMatch,e}; }
  if(t==='AVANTAGE_JOUE'||/PENALITE|COUP_FRANC|MELEE$/.test(t)&&avantageOuvert){ if(avantageOuvert){ ok('avantage resolu'); avantageOuvert=null; } }
  if(t==='TRANSFORMATION_REUSSIE'||t==='TRANSFORMATION_RATEE'){ ok('transformations'); if(essaiAttente==null) viol('L8 transformation sans essai',''); essaiAttente=null; }
  if(t==='PENALITE'||t==='COUP_FRANC') ok('sanctions');
  return l(t,e,msg,d); };
let ruckT=0, envoiVu=false; const devantDepuis={};
for(let i=0;i<60000&&m.phase!=='TERMINE';i++){
  m.tick(0.1);
  if(i%10===0){ const b=m.getState().ballon||{}; if(!(Number.isFinite(b.x)&&Number.isFinite(b.y))) viol('ballon à coordonnées invalides',''); else ok('ballon ok'); }
  if(m.phase==='COUP_ENVOI'&&m.envoiEnPlace&&!envoiVu){ envoiVu=true; ok('coups d\'envoi (placement)'); const kick=m.possession; const opp=kick==='A'?m.equipeB:m.equipeA; const pres=opp.filter(j=>j.sinBin<=0&&Math.abs(j.x-m.xCoupEnvoi)<9.5).length; const dev=(kick==='A'?m.equipeA:m.equipeB).filter(j=>j!==m.porteur&&j.sinBin<=0&&(j.x-m.xCoupEnvoi)*(kick==='A'?1:-1)>0.8).length; if(pres) viol('L12 adversaire à moins de 10 m au coup d\'envoi',pres+' joueur(s)'); if(dev) viol('L12 partenaire du botteur devant le ballon',dev+' joueur(s)'); }
  if(m.phase!=='COUP_ENVOI') envoiVu=false;
  if(m.porteur&&m.porteur.auSol>0&&m.phase==='PORTE'&&!m.passeVisuelle&&!m.penaliteRecul) viol('porteur au sol pendant le jeu courant',m.porteur.team+m.porteur.numero);
  for(const eq of ['A','B']){ const L=eq==='A'?m.equipeA:m.equipeB; const sur=L.filter(j=>j.sinBin<=0).length; if(sur<12) viol('moins de 12 joueurs sur le terrain',eq+':'+sur); }
  for(const j of tous()){ if(j.sinBin>0)continue; if(j.x<-10||j.x>110||j.y<-2||j.y>72) viol('joueur hors du terrain',j.team+j.numero+` (${j.x.toFixed(1)},${j.y.toFixed(1)})`); }
  // Loi 19 : mêlée — les trois-quarts non-demis restent à 5 m au moins derrière le pied du talonneur
  if(m.phase==='MELEE'&&m.melee&&!m.melee.simulee&&m.melee.x!=null&&m.melee.etat==='MELEE_CONTESTATION'){
    for(const j of tous()){ if(j.numero<10||j.sinBin>0||j.auSol>0) continue; const cote=j.team==='A'?-1:1; const ecart=(j.x-m.melee.x)*cote; 
      if(ecart<3.5) viol('L19 trois-quarts à moins de 5 m de la mêlée',`${j.team}${j.numero} à ${ecart.toFixed(1)} m`); else ok('3/4 mêlée ok'); } }
  // Loi 15 : au regroupement, hors-jeu = devant le pied arrière (tolérance 2 m, 1,6 s après le plaquage)
  if(m.phase==='RUCK'&&m.ruckPoint){ for(const j of tous()){ const k=j.team+j.numero; const cote=j.team==='A'?-1:1; const ecart=(j.x-m.ruckPoint.x)*cote; const loin=Math.hypot(j.x-m.ruckPoint.x,j.y-m.ruckPoint.y)>3.5;
      if(ecart<-1.5&&loin&&!(j.sinBin>0)&&!(j.auSol>0)&&!(j.horsJeuKick>0)){ if(!devantDepuis[k]){ devantDepuis[k]=0.1; devantDepuis[k+'e']=ecart; } else devantDepuis[k]+=0.1; if(devantDepuis[k]>4.0&&Math.abs(devantDepuis[k]-4.05)<0.06&&(ecart-devantDepuis[k+'e'])<2) viol('L15 joueur hors-jeu actif au ruck (immobile devant le pied arrière > 4 s)',`${k} ${(-ecart).toFixed(1)} m devant`); } else devantDepuis[k]=0; } } else for(const k in devantDepuis) devantDepuis[k]=0;
}
const st=m.stats;
const { recomposerScore } = require('./audit-score.js');
const sc={A:recomposerScore(st.A),B:recomposerScore(st.B)};
const termine=m.phase==='TERMINE';
const scoreEgal=sc.A===m.score.A&&sc.B===m.score.B;
// Règles que ce script NE contrôle PAS : à ne jamais déclarer conformes sur la seule foi de ce rapport.
const nonCouvert=['L14 lâcher du ballon au plaquage','L16 liaisons du maul','L17 légalité d\'une marque (et loi 17.4 : aucune sur coup d\'envoi)','L12 ligne à franchir d\'un renvoi (10 m / 22 m / 5 m)','L6 geste dessiné de l\'assistant de touche'];
console.log(JSON.stringify({g:graine,mode,termine,scoreEgal,score:m.score,recompose:sc,essais:[st.A.essais,st.B.essais],violations:Object.fromEntries(Object.entries(V).filter(([k])=>!k.endsWith('_ex')&&true).map(([k,v])=>[k,{n:v,ex:V[k+'_ex']}])),verifie:N,nonCouvert}));
if(!termine){ console.error('ATTENTION : la limite de pas a été atteinte avant la fin du match (phase '+m.phase+') ; rapport incomplet'); process.exitCode=2; }
if(!scoreEgal){ console.error('ATTENTION : score recomposé '+sc.A+'-'+sc.B+' différent du score du moteur '+m.score.A+'-'+m.score.B); process.exitCode=1; }
