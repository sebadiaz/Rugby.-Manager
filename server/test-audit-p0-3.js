// Audit P0-3 (TODO_AUDIT.md) : le nom du club — la SEULE donnée librement
// saisie par le joueur qui est ensuite réaffichée — était interpolé sans
// échappement dans plusieurs templates assignés à innerHTML. Un nom
// contenant du HTML (ex. une balise <img onerror=...>) s'exécutait
// réellement dans le navigateur (XSS DOM confirmé, cf. TODO_AUDIT.md).
//
// Prérequis (non fourni par ce dépôt, volontairement — le jeu lui-même reste
// sans dépendance) : Node.js + le paquet "playwright". Installation locale :
// npm install --no-save playwright
//
// Usage : servir docs/ en HTTP (ex. `python3 -m http.server 8099` depuis
// docs/), puis : node server/test-audit-p0-3.js [http://localhost:8099]
'use strict';

const URL_BASE = process.argv[2] || 'http://localhost:8099';

function resoudreChromium() {
  try { return require('playwright').chromium; } catch (e) { /* essaie playwright-core ensuite */ }
  try { return require('playwright-core').chromium; } catch (e) {
    console.error('Ni "playwright" ni "playwright-core" ne sont installés. Voir l\'en-tête de ce fichier.');
    process.exit(1);
  }
}

function optionsLancement() {
  const fs = require('fs');
  for (const p of ['/opt/pw-browsers/chromium-1228/chrome-linux/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome']) {
    if (fs.existsSync(p)) return { executablePath: p };
  }
  return {};
}

let nbTests = 0, nbEchecs = 0;
function verifier(nom, condition) {
  nbTests++;
  if (condition) { console.log(`OK   ${nom}`); }
  else { nbEchecs++; console.error(`FAIL ${nom}`); }
}

(async () => {
  const chromium = resoudreChromium();
  const browser = await chromium.launch(optionsLancement());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const erreursConsole = [];
  page.on('pageerror', (e) => erreursConsole.push(`PAGEERROR: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) erreursConsole.push(`CONSOLE: ${m.text()}`);
  });

  await page.evaluate(() => { window.__p03xss = false; });
  await page.goto(`${URL_BASE}/index.html`, { waitUntil: 'networkidle' });
  await page.click('#btnAccueilModeClub');
  await page.waitForTimeout(150);

  const nomMalicieux = '<img src=x onerror="window.__p03xss = true">';
  await page.fill('#inputNomClub', nomMalicieux);
  await page.click('#btnCreerClub');
  await page.waitForTimeout(300);

  const xssDashboard = await page.evaluate(() => window.__p03xss === true);
  verifier('P0-3a : le nom du club (avec balise HTML) n\'exécute AUCUN script sur le Dashboard (entête du club)', !xssDashboard);
  const enteteContientTexteBrut = await page.evaluate(() => document.getElementById('clubEntete').textContent.includes('<img src=x'));
  verifier('P0-3a bis : le nom malicieux reste visible EN TEXTE (pas supprimé, juste neutralisé)', enteteContientTexteBrut);
  const enteteEchappe = await page.evaluate(() => !document.getElementById('clubEntete').innerHTML.includes('<img'));
  verifier('P0-3a ter : innerHTML de l\'entête ne contient plus de balise <img> réelle (échappée en texte)', enteteEchappe);

  // Rechargement : la carte d'accueil ("Continuer ma carrière") réaffiche
  // aussi le nom — même vérification après un F5, sur un autre point d'entrée.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  await page.evaluate(() => { window.__p03xss = false; });
  await page.waitForTimeout(200);
  const xssAccueil = await page.evaluate(() => window.__p03xss === true);
  verifier('P0-3b : le nom du club (avec balise HTML) n\'exécute AUCUN script sur la carte d\'accueil "Continuer"', !xssAccueil);
  const accueilContientTexteBrut = await page.evaluate(() =>
    (document.getElementById('continuerClubInfos') || {}).textContent && document.getElementById('continuerClubInfos').textContent.includes('<img src=x'));
  verifier('P0-3b bis : le nom malicieux reste visible EN TEXTE sur la carte d\'accueil', accueilContientTexteBrut);

  // Aperçu du match (façon Football Manager) : affiche aussi "Mon club — Adversaire".
  await page.click('#btnContinuerClub');
  await page.waitForTimeout(200);
  // « Continuer » ne fonce plus jusqu'au match : il s'arrête sur tout
  // événement réel du chemin (blessure d'entraînement, rapport de repérage,
  // décision — cf. TODO_AUDIT.md P1-26). On reclique donc jusqu'à l'aperçu,
  // exactement comme le joueur. Borné : un vrai blocage échoue quand même.
  for (let i = 0; i < 15; i++) {
    if (await page.isVisible('#panneauApercuMatch.visible')) break;
    await page.click('#btnApercuMatchFlottant');
    await page.waitForTimeout(600);
  }
  await page.waitForSelector('#panneauApercuMatch.visible', { timeout: 5000 });
  await page.evaluate(() => { window.__p03xss = false; });
  await page.waitForTimeout(200);
  const xssApercu = await page.evaluate(() => window.__p03xss === true);
  verifier('P0-3c : le nom du club n\'exécute AUCUN script dans l\'aperçu du match', !xssApercu);
  const apercuContientTexteBrut = await page.evaluate(() => document.getElementById('apercuMatchCorps').textContent.includes('<img src=x'));
  verifier('P0-3c bis : le nom malicieux reste visible EN TEXTE dans l\'aperçu du match', apercuContientTexteBrut);

  verifier('aucune erreur console/page pendant ce parcours', erreursConsole.length === 0);
  if (erreursConsole.length) console.error(erreursConsole.join('\n'));

  await browser.close();
  console.log(`\n${nbTests} test(s), ${nbEchecs} échec(s).`);
  process.exit(nbEchecs > 0 ? 1 : 0);
})();
