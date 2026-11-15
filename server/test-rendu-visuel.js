// Contrôle autonome du rendu de match : aucun navigateur ni dépendance npm.
// Usage : node server/test-rendu-visuel.js
// Vérifie les tailles Retina, la caméra mobile et le rendu des 30 joueurs
// sans exécuter le moteur ni changer son état.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const racine = path.join(__dirname, '..');
const rendererCode = fs.readFileSync(path.join(racine, 'docs/js/renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(racine, 'docs/index.html'), 'utf8');
const css = fs.readFileSync(path.join(racine, 'docs/css/style.css'), 'utf8');
const ui = fs.readFileSync(path.join(racine, 'docs/js/ui.js'), 'utf8');

let images = 0;
function contexte() {
  // Les attributs de Canvas 2D se règlent librement, toutes les primitives
  // utilisées sont simulées ; seule drawImage est comptée.
  const c = { createPattern: () => '#pattern', measureText: () => ({width: 10}) };
  for (const methode of ['save','restore','beginPath','moveTo','lineTo','closePath',
    'fill','stroke','fillRect','strokeRect','clearRect','rect','clip','arc',
    'ellipse','setLineDash','translate','rotate','scale','setTransform',
    'fillText','strokeText','quadraticCurveTo','putImageData']) c[methode] = () => {};
  c.drawImage = () => { images++; };
  c.getImageData = (x,y,w,h) => ({data: new Uint8ClampedArray(w*h*4)});
  return c;
}
function toile() {
  return { width:0, height:0, style:{}, getContext:()=>contexte() };
}
const windowMock = {
  innerWidth: 1280, innerHeight: 800, devicePixelRatio: 2,
  RugbyEngine: { LONGUEUR:100, LARGEUR:70 },
  RMConstants: { PROF_EN_BUT:10, MARGE_TOUCHE:5 },
  localStorage: {getItem:()=>null,setItem:()=>{}},
};
const documentMock = {
  documentElement: {clientWidth:1280},
  createElement: (tag) => {
    assert.equal(tag, 'canvas');
    return toile();
  },
};
let temps = 1000;
vm.runInNewContext(rendererCode, {
  window:windowMock, document:documentMock, performance:{now:()=>temps},
  Uint8ClampedArray, Math, Map, Number,
}, {filename:'renderer.js'});
const R = windowMock.RMRenderer, canvas = toile();
R.init(canvas);

function etat(phase) {
  const joueurs = (team) => Array.from({length:15}, (_,i)=>({
    team, numero:i+1, x:12+i*5, y:team==='A'? 15+i*1.7 : 55-i*1.7,
    sinBin:0, auSol:0, solVisuel:0,
  }));
  return {
    phase, possession:'A',
    teams:{A:joueurs('A'),B:joueurs('B')},
    ballon:{x:51,y:34,enVol:false,hauteur:0},
    ballonRendu:{x:51,y:34},
    porteur:{team:'A',numero:9,x:51,y:34},
    ball:{state:'HELD'},
    arbitre:{x:53,y:37},
    assistants:[],
  };
}
function verifierFormat(w,h,dpr,hud,seek,controls,portrait) {
  windowMock.innerWidth=w;windowMock.innerHeight=h;windowMock.devicePixelRatio=dpr;
  documentMock.documentElement.clientWidth=w;
  R.redimensionner(hud,seek,controls);
  assert.equal(canvas.width,Math.round(w*Math.min(2.5,dpr)));
  assert.equal(canvas.height,Math.round(Math.max(120,h-hud-seek-controls)*Math.min(2.5,dpr)));
  assert.equal(canvas.style.width,w+'px');
  assert.equal(R.camera().paysage,!portrait,'orientation automatique');
  const avant=images;
  for (const phase of ['PORTE','RUCK','MELEE','TOUCHE','COUP_DE_PIED_JEU','TERMINE']) {
    temps+=40;
    R.dessiner(etat(phase));
  }
  assert.ok(images-avant>=6*30,'Les sprites de 30 joueurs doivent être dessinés à chaque image.');
  const c=R.camera();
  assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.s) && c.s>0);
}
verifierFormat(1280,800,2,80,32,62,false);
verifierFormat(390,844,2.5,100,32,56,true);
assert.equal(R.etiquetteArbitre(),false,'Pas de texte arbitre sur téléphone vertical');
verifierFormat(844,390,2,40,24,45,false);
verifierFormat(360,640,3,95,32,56,true);
verifierFormat(1920,1080,1,85,34,60,false);

// Contrat du scoreboard et des règles CSS : les deux noms doivent avoir
// chacun leur propre espace. Les anciens clients restent pris en charge par ui.js.
for (const id of ['nomEquipeA','nomEquipeB','scoreA','scoreB']) {
  assert.ok(html.includes('id="'+id+'"'),'Élément scoreboard manquant : '+id);
}
assert.ok(ui.includes("if (scoreA)"),'Compatibilité du client historique');
assert.ok(css.includes('@media (max-height: 520px) and (orientation: landscape)'),
  'Mode téléphone horizontal manquant');
assert.ok(css.includes('#vueMatch #controls .controlsRangee.principale'),
  'Commandes tactiles adaptatives manquantes');
console.log('OK : rendu joueurs, Retina, orientation et interface (5 tailles, 30 joueurs, 6 phases).');
