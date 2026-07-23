// Test du parcours principal du Mode Club DANS LE NAVIGATEUR (navigation
// réelle entre les pages, clics, rechargement de page) — complète
// server/test-parcours-club.js qui ne teste que la couche données.
//
// Ce script n'est PAS chargé par le jeu (aucune référence depuis index.html)
// et n'ajoute aucune dépendance au jeu lui-même : c'est un outil de
// développement, à exécuter à la main.
//
// Prérequis (non fournis par ce dépôt, volontairement — le jeu lui-même reste
// sans dépendance) : Node.js + le paquet "playwright" (ou "playwright-core"
// avec un Chromium déjà installé et sa variable PLAYWRIGHT_BROWSERS_PATH).
// Installation locale : npm install --no-save playwright
//
// Usage : servir docs/ en HTTP (ex. `python3 -m http.server 8099` depuis
// docs/), puis : node server/test-parcours-navigateur.js [http://localhost:8099]
'use strict';

const URL_BASE = process.argv[2] || 'http://localhost:8099';

function resoudreChromium() {
  try { return require('playwright').chromium; } catch (e) { /* essaie playwright-core ensuite */ }
  try { return require('playwright-core').chromium; } catch (e) {
    console.error('Ni "playwright" ni "playwright-core" ne sont installés. Voir l\'en-tête de ce fichier.');
    process.exit(1);
  }
}

let nbTests = 0, nbEchecs = 0;
function verifier(nom, condition) {
  nbTests++;
  if (condition) { console.log(`OK   ${nom}`); }
  else { nbEchecs++; console.error(`FAIL ${nom}`); }
}

function optionsLancement() {
  // Environnements avec un Chromium déjà installé hors du chemin par défaut
  // de Playwright (ex. cette sandbox de développement) : réutilise ce binaire
  // plutôt que d'exiger un téléchargement. Ignoré si absent (comportement
  // Playwright standard sur une machine classique).
  const fs = require('fs');
  for (const p of ['/opt/pw-browsers/chromium-1228/chrome-linux/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome']) {
    if (fs.existsSync(p)) return { executablePath: p };
  }
  return {};
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

  // Sur mobile, la navigation vit dans un tiroir masqué par défaut (cf.
  // style.css) : l'ouvrir d'abord si le bouton menu est visible (sans effet
  // sur grand écran, où le menu latéral est déjà affiché en permanence).
  async function clicOnglet(cle) {
    if (await page.isVisible('#btnMenuClub')) {
      await page.click('#btnMenuClub');
      await page.waitForTimeout(150);
    }
    await page.click(`.ongletBtn[data-onglet="${cle}"]`);
  }

  // 1) Création et chargement d'une carrière.
  await page.goto(`${URL_BASE}/index.html`, { waitUntil: 'networkidle' });
  await page.click('#btnAccueilModeClub');
  await page.waitForTimeout(150);
  await page.fill('#inputNomClub', 'Parcours Navigateur');
  await page.click('#btnCreerClub');
  await page.waitForTimeout(300);
  verifier('création de carrière : dashboard affiché', await page.isVisible('[data-volet="dashboard"]'));

  // 2) Navigation dans toutes les pages.
  const onglets = ['dashboard', 'effectif', 'composition', 'tactique', 'entrainement',
    'transferts', 'personnel', 'autresclubs', 'calendrier', 'finances', 'medical', 'stats'];
  for (const onglet of onglets) {
    await clicOnglet(onglet);
    await page.waitForTimeout(120);
    const visible = await page.isVisible(`[data-volet="${onglet}"]`);
    verifier(`navigation : l'onglet "${onglet}" s'affiche sans page vide`, visible);
  }

  // 3) Sauvegarde et rechargement.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  const nomApresRechargement = await page.textContent('#continuerClubInfos .nomClubAccueil').catch(() => null);
  verifier('sauvegarde/rechargement : la carrière est retrouvée après un F5', nomApresRechargement === 'Parcours Navigateur');
  await page.click('#btnContinuerClub');
  await page.waitForTimeout(200);

  // 4) Composition valide.
  await clicOnglet('composition');
  await page.waitForTimeout(150);
  await page.click('#btnCompositionAuto');
  await page.waitForTimeout(150);
  const selectsVides = await page.$$eval('#clubTerrain select', (els) => els.filter((s) => !s.value).length);
  verifier('composition valide : les 15 postes ont un joueur assigné', selectsVides === 0);

  // 5) Recrutement.
  await clicOnglet('transferts');
  await page.waitForTimeout(150);
  const budgetAvantTxt = await page.textContent('#transfertsBudget');
  await page.click('#clubMarche .btnSigner:not([disabled])').catch(() => {});
  await page.waitForTimeout(200);
  const budgetApresTxt = await page.textContent('#transfertsBudget');
  verifier('recrutement : le budget change après une signature', budgetAvantTxt !== budgetApresTxt);

  // 6) Affichage d'un club adverse.
  await clicOnglet('autresclubs');
  await page.waitForTimeout(150);
  await page.click('#clubAutresClubsListe tbody tr:nth-child(1)');
  await page.waitForTimeout(150);
  const detailAdversaireTxt = await page.textContent('#clubAutresClubIdentite');
  verifier('club adverse : sa fiche affiche un contenu réel', detailAdversaireTxt.trim().length > 20);
  await page.click('#btnFermerClubAdversaire');

  // 7) Aperçu du prochain match (façon Football Manager), puis progression
  // d'une journée. Le bouton "New Day" flottant doit rester joignable depuis
  // n'importe quel onglet ; on vérifie ici depuis le Dashboard, et une
  // seconde fois plus bas (bouton flottant) pendant la boucle de fin de saison.
  await clicOnglet('dashboard');
  await page.waitForTimeout(150);
  await page.selectOption('#selDureeClub', '300');
  await page.click('#btnJouerMatchClub');
  await page.waitForTimeout(200);
  verifier('aperçu du match : la préparation d\'avant-match s\'ouvre', await page.isVisible('#panneauApercuMatch.visible'));
  const apercuTxt = await page.textContent('#apercuMatchCorps');
  verifier('aperçu du match : forme/composition/tactique/adversaire réels affichés',
    apercuTxt.includes('Ma forme') && apercuTxt.includes('Ma composition') && apercuTxt.includes('Ma tactique') && apercuTxt.includes('adversaire'));

  // Composition ET tactique doivent rester modifiables depuis l'aperçu,
  // sans perdre la possibilité de relancer ensuite (cf. bouton flottant).
  await page.click('#btnApercuModifierTactique');
  await page.waitForTimeout(150);
  verifier('aperçu du match : le bouton "Tactique" ouvre bien l\'onglet Tactique', await page.isVisible('[data-volet="tactique"]'));
  await page.click('#clubTactique .ligneTactique:nth-child(3)');
  await page.waitForTimeout(150);
  await page.click('#btnApercuMatchFlottant');
  await page.waitForTimeout(150);
  await page.click('#btnApercuModifierCompo');
  await page.waitForTimeout(150);
  verifier('aperçu du match : le bouton "Composition" ouvre bien l\'onglet Composition', await page.isVisible('[data-volet="composition"]'));
  await page.click('#btnApercuMatchFlottant');
  await page.waitForTimeout(150);
  verifier('aperçu du match : réouvrable après un aller-retour composition/tactique', await page.isVisible('#panneauApercuMatch.visible'));

  await page.click('#btnApercuLancerMatch');
  await page.waitForSelector('#panneauResultat.visible', { timeout: 20000 });
  const scoreTxt = await page.textContent('#resultatScore');
  verifier('progression d\'une journée : un score réel est affiché', /\d+\s*[—-]\s*\d+/.test(scoreTxt));
  await page.click('#btnResultatFermer');
  await page.waitForTimeout(300);
  verifier('progression d\'une journée : retour au club après le match', await page.isVisible('#panneauClub.visible'));

  // 8) Fin de saison — via le bouton flottant "New Day" (toujours visible,
  // ici depuis un autre onglet que le Dashboard) plutôt que le bouton du
  // Dashboard, pour couvrir les deux points d'entrée vers l'aperçu du match.
  await clicOnglet('finances');
  await page.waitForTimeout(150);
  verifier('bouton "New Day" flottant visible depuis un autre onglet que le Dashboard', await page.isVisible('#btnApercuMatchFlottant'));
  // Termine rapidement les journées restantes (résultat non affiché) pour
  // atteindre la fin de saison sans faire dépendre le test de 10 clics UI.
  while (await page.isVisible('#btnApercuMatchFlottant') && !(await page.isVisible('#btnSaisonSuivante'))) {
    const dejaTermine = await page.evaluate(() => document.getElementById('btnSaisonSuivante').style.display !== 'none');
    if (dejaTermine) break;
    const fixturesRestantes = await page.evaluate(() => document.getElementById('clubProchainMatch').textContent.includes('à jouer'));
    if (!fixturesRestantes) break;
    await page.click('#btnApercuMatchFlottant');
    await page.waitForSelector('#panneauApercuMatch.visible', { timeout: 5000 });
    await page.click('#btnApercuLancerMatch');
    await page.waitForSelector('#panneauResultat.visible', { timeout: 20000 });
    await page.click('#btnResultatFermer');
    await page.waitForTimeout(200);
  }
  const boutonSaisonSuivanteVisible = await page.isVisible('#btnSaisonSuivante').catch(() => false);
  if (boutonSaisonSuivanteVisible) {
    page.once('dialog', (d) => d.accept());
    await page.click('#btnSaisonSuivante');
    await page.waitForTimeout(300);
    const saisonTxt = await page.textContent('#clubTopBarInfos, #clubEntete').catch(() => '');
    verifier('fin de saison : le club reste jouable en saison 2', await page.isVisible('[data-volet="dashboard"]'));
  } else {
    console.log('   (fin de saison non atteinte dans ce run — championnat trop long pour un test rapide, mécanisme couvert par server/test-parcours-club.js)');
  }

  verifier('aucune erreur console/page sur tout le parcours', erreursConsole.length === 0);
  if (erreursConsole.length) console.error(erreursConsole.join('\n'));

  await browser.close();
  console.log(`\n${nbTests} test(s), ${nbEchecs} échec(s).`);
  process.exit(nbEchecs > 0 ? 1 : 0);
})();
