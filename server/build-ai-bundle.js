// Fabrique docs/rugby-ai.js : les modules CommonJS de engine/ai/ regroupés pour le NAVIGATEUR
// (window.RugbyAI.configGOAP). Une seule source : engine/ai/*.js. `node server/build-ai-bundle.js [--check]`.
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'engine', 'ai');
const SORTIE = path.join(__dirname, '..', 'docs', 'rugby-ai.js');
const fichiers = fs.readdirSync(DIR).filter((f) => f.endsWith('.js')).sort();
let out = "/* GÉNÉRÉ par server/build-ai-bundle.js depuis engine/ai/*.js — ne pas éditer. */\n(function (global) {\n  'use strict';\n  var defs = {}, cache = {};\n  function req(nom) {\n    var cle = nom.replace(/^\\.\\//, '');\n    if (cache[cle]) return cache[cle].exports;\n    if (!defs[cle]) throw new Error('module IA introuvable : ' + nom);\n    var m = cache[cle] = { exports: {} };\n    defs[cle](m, m.exports, req);\n    return m.exports;\n  }\n";
for (const f of fichiers) out += `  defs[${JSON.stringify(f)}] = function (module, exports, require) {\n${fs.readFileSync(path.join(DIR, f), 'utf8')}\n  };\n`;
out += "  var mode = req('goap-mode.js');\n  global.RugbyAI = { configGOAP: mode.configGOAP, creerPiloteGOAP: mode.creerPiloteGOAP };\n})(typeof window !== 'undefined' ? window : globalThis);\n";
if (process.argv.includes('--check')) {
  const actuel = fs.existsSync(SORTIE) ? fs.readFileSync(SORTIE, 'utf8') : '';
  if (actuel !== out) { console.error('docs/rugby-ai.js est périmé : lancer node server/build-ai-bundle.js'); process.exit(1); }
  console.log('OK : docs/rugby-ai.js à jour');
} else { fs.writeFileSync(SORTIE, out); console.log('écrit', SORTIE, (out.length / 1024).toFixed(0) + ' Ko'); }
