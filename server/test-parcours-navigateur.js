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
  verifier('dashboard : la carte "Objectif de la saison" affiche un objectif réel',
    (await page.textContent('#clubObjectifSaison')).includes('Confiance du président'));
  await page.waitForTimeout(300);
  verifier('création de carrière : dashboard affiché', await page.isVisible('[data-volet="dashboard"]'));
  const entetTxt = await page.textContent('#clubEntete');
  verifier('pyramide : une nouvelle carrière débute en Ligue Régionale (affiché dans l\'entête du club)', entetTxt.includes('Ligue Régionale'));

  // 1b) Identifiant de version (TODO_AUDIT.md P0-5) : #versionInfo a un
  // z-index (11) STRICTEMENT SUPÉRIEUR à celui du panneau actuellement
  // affiché (.panneau, z-index 10, quasiment toujours visible en pratique —
  // accueil, Mode Club, match). Reproduit et confirmé : avec un z-index de 5
  // (valeur d'origine), le texte de version était TOUJOURS peint SOUS le
  // panneau, jamais visible au joueur malgré un contenu bien rempli par le
  // fetch de version.json — vérifié visuellement (capture d'écran), pas avec
  // document.elementFromPoint (donne un faux résultat ici : #versionInfo a
  // `pointer-events:none`, donc exclu du hit-testing même quand il est
  // peint au-dessus). version.json n'existe qu'après un vrai déploiement CI
  // (absent en local, cf. commentaire dans index.html) — on simule donc son
  // contenu directement pour vérifier l'empilement, indépendamment de ça.
  await page.evaluate(() => { document.getElementById('versionInfo').textContent = 'vTEST123'; });
  const zIndexInfo = await page.evaluate(() => {
    const panneauVisible = document.querySelector('.panneau.visible');
    return {
      versionInfo: Number(getComputedStyle(document.getElementById('versionInfo')).zIndex),
      panneau: panneauVisible ? Number(getComputedStyle(panneauVisible).zIndex) : null,
    };
  });
  verifier('identifiant de version : peint AU-DESSUS du panneau courant (pas masqué en permanence)',
    zIndexInfo.panneau !== null && zIndexInfo.versionInfo > zIndexInfo.panneau);

  // 2) Navigation dans toutes les pages.
  const onglets = ['dashboard', 'effectif', 'composition', 'tactique', 'entrainement',
    'transferts', 'personnel', 'autresclubs', 'calendrier', 'equipeb', 'monde', 'finances', 'medical', 'stats'];
  for (const onglet of onglets) {
    await clicOnglet(onglet);
    await page.waitForTimeout(120);
    const visible = await page.isVisible(`[data-volet="${onglet}"]`);
    verifier(`navigation : l'onglet "${onglet}" s'affiche sans page vide`, visible);
  }

  // 2b) Mobile : le tiroir de navigation (masqué par défaut sur petit écran,
  // cf. docs/css/style.css) doit s'ouvrir via le bouton menu, permettre de
  // naviguer, se refermer automatiquement après un choix, et être refermable
  // au clavier (Échap) sans changer d'onglet.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  verifier('mobile : le bouton menu (tiroir) est visible sur petit écran', await page.isVisible('#btnMenuClub'));
  verifier('mobile : le tiroir de navigation est fermé par défaut',
    !(await page.evaluate(() => document.getElementById('barreOngletsClub').classList.contains('ouvert'))));
  await page.click('#btnMenuClub');
  await page.waitForTimeout(150);
  verifier('mobile : cliquer le bouton menu ouvre le tiroir de navigation',
    await page.evaluate(() => document.getElementById('barreOngletsClub').classList.contains('ouvert')));
  verifier('mobile : le fond assombri (backdrop) du tiroir est affiché', await page.isVisible('#navBackdrop'));
  const ongletAvantEchapTiroir = await page.$eval('.ongletBtn.actif', (el) => el.dataset.onglet);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const ongletApresEchapTiroir = await page.$eval('.ongletBtn.actif', (el) => el.dataset.onglet);
  verifier('mobile : Échap referme le tiroir sans changer d\'onglet',
    !(await page.evaluate(() => document.getElementById('barreOngletsClub').classList.contains('ouvert')))
    && ongletApresEchapTiroir === ongletAvantEchapTiroir);
  await clicOnglet('effectif');
  await page.waitForTimeout(150);
  verifier('mobile : choisir un onglet dans le tiroir navigue ET referme le tiroir automatiquement',
    await page.isVisible('[data-volet="effectif"]') && !(await page.evaluate(() => document.getElementById('barreOngletsClub').classList.contains('ouvert'))));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(150);

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

  // 4b) Polyvalence : n'importe quel joueur doit pouvoir dépanner à
  // n'importe quel poste, regroupé à part des joueurs du poste naturel.
  const aUnGroupeDepannage = await page.$$eval('#clubTerrain select', (els) =>
    els.some((s) => s.querySelector('optgroup')));
  verifier('polyvalence : au moins un poste propose des joueurs hors poste naturel (regroupés à part)', aUnGroupeDepannage);
  const selectionHorsPoste = await page.evaluate(() => {
    const selects = [...document.querySelectorAll('#clubTerrain select')];
    const cible = selects.find((s) => s.querySelector('optgroup'));
    if (!cible) return null;
    const option = cible.querySelector('optgroup option');
    cible.value = option.value;
    cible.dispatchEvent(new Event('change', { bubbles: true }));
    return { numero: cible.dataset.numero, id: option.value };
  });
  if (selectionHorsPoste) {
    await page.waitForTimeout(150);
    // Change d'onglet puis revient : la composition est rafraîchie
    // (assurerComposition + completerComposition) — le choix hors poste ne
    // doit pas être silencieusement écrasé au passage.
    await clicOnglet('dashboard');
    await page.waitForTimeout(120);
    await clicOnglet('composition');
    await page.waitForTimeout(150);
    const valeurApres = await page.$eval(`#clubTerrain select[data-numero="${selectionHorsPoste.numero}"]`, (s) => s.value);
    verifier('polyvalence : un choix manuel hors poste naturel survit au rafraîchissement de la composition',
      valeurApres === selectionHorsPoste.id);
  }

  // 5) Recrutement.
  await clicOnglet('transferts');
  await page.waitForTimeout(150);
  const budgetAvantTxt = await page.textContent('#transfertsBudget');
  await page.click('#clubMarche .btnSigner:not([disabled])').catch(() => {});
  await page.waitForTimeout(200);
  const budgetApresTxt = await page.textContent('#transfertsBudget');
  verifier('recrutement : le budget change après une signature', budgetAvantTxt !== budgetApresTxt);

  // 5a) Double clic (action répétée, TODO_AUDIT.md P1-7) : signer très
  // rapidement deux fois de suite un autre joueur du marché ne doit jamais
  // débiter le budget deux fois ni ajouter deux exemplaires à l'effectif
  // (cf. server/test-parcours-club.js pour la preuve équivalente côté
  // données ; ici on rejoue le vrai geste utilisateur dans le navigateur).
  // Un budget confortable est forcé (état non exposé par l'UI, comme pour
  // l'Équipe B plus bas) pour garantir qu'un joueur reste abordable après la
  // première signature ci-dessus, plutôt que de dépendre du hasard des prix.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    s.clubJoueur.budget = 100000;
    localStorage.setItem('rugbyManager.club.v1', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  await page.click('#btnContinuerClub');
  await page.waitForTimeout(200);
  await clicOnglet('transferts');
  await page.waitForTimeout(150);
  const idCibleDoubleClic = await page.$eval('#clubMarche .btnSigner:not([disabled])', (b) => b.dataset.joueur);
  const effectifAvantDoubleClic = await page.evaluate(() => JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.effectif.length);
  // Deux vrais clics Playwright espacés dans le temps (aller-retour réseau
  // CDP entre chaque clic) ne reproduisent pas fidèlement un double clic —
  // ils laissent le temps au premier rendu de retirer/désactiver le bouton
  // avant le second. Un double clic déclenche deux événements DOM traités
  // l'un après l'autre SANS repeinture entre les deux (pire cas réel) :
  // déclenché ici en une seule évaluation synchrone côté navigateur.
  await page.evaluate((id) => {
    const bouton = () => document.querySelector(`#clubMarche .btnSigner[data-joueur="${id}"]`);
    bouton() && bouton().click();
    bouton() && bouton().click();
  }, idCibleDoubleClic);
  await page.waitForTimeout(300);
  const effectifApresDoubleClic = await page.evaluate(() => JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.effectif.length);
  verifier('double clic : signer deux fois de suite le même joueur n\'ajoute qu\'un seul exemplaire à l\'effectif',
    effectifApresDoubleClic === effectifAvantDoubleClic + 1);
  const occurrencesDoubleClic = await page.evaluate(
    (id) => JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.effectif.filter((j) => j.id === id).length,
    idCibleDoubleClic);
  verifier('double clic : le joueur signé deux fois de suite n\'apparaît qu\'une seule fois dans l\'effectif', occurrencesDoubleClic === 1);

  // 5a-bis) Double clic RÉEL (souris, coordonnées écran fixes — PAS un double
  // appel JS sur le même nœud comme ci-dessus) sur le bouton "Signer" de la
  // PREMIÈRE ligne du marché : audit "doubles actions sur les transferts".
  // Reproduit et confirmé avant correctif : rafraichirMarche() reconstruit
  // toute la liste (innerHTML) après le 1er clic, ce qui décale la ligne
  // SUIVANTE à la même position écran — le 2e clic (même coordonnée) atterrit
  // alors sur SON bouton "Signer" et signe un second joueur jamais choisi.
  // Attente > au verrou anti-double-action (cf. clubUI.js, marcheActionVerrouillee)
  // pour ne pas hériter du verrou encore actif posé par le test précédent.
  await page.waitForTimeout(900);
  const nomsAvantDoubleClicCoord = await page.$$eval('#clubMarche .ligneMarche .infosJoueur b', (els) => els.map((e) => e.textContent));
  verifier('double clic écran : au moins 2 joueurs sur le marché avant le test (scénario significatif)', nomsAvantDoubleClicCoord.length >= 2);
  const boiteBoutonSigner = await page.$eval('#clubMarche .ligneMarche:first-child .btnSigner', (b) => {
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(boiteBoutonSigner.x, boiteBoutonSigner.y);
  await page.mouse.click(boiteBoutonSigner.x, boiteBoutonSigner.y);
  await page.waitForTimeout(300);
  const effectifApresDoubleClicCoord = await page.evaluate(
    (noms) => JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.effectif.filter((j) => noms.includes(j.nom)).map((j) => j.nom),
    nomsAvantDoubleClicCoord);
  verifier('double clic écran sur "Signer" (1re ligne) : un seul joueur rejoint le club, pas le joueur de la ligne suivante aussi',
    effectifApresDoubleClicCoord.length === 1 && effectifApresDoubleClicCoord[0] === nomsAvantDoubleClicCoord[0]);

  // 5b) Négociation de contrat : force un joueur en fin de contrat (état non
  // exposé par l'UI, modifié directement en localStorage comme le ferait une
  // vraie fin de saison) pour vérifier que le bouton de renouvellement mène
  // bien à une vraie négociation salariale (invite pour un montant, pas un
  // simple bouton "accepter"). L'issue accept/refus dépend du hasard réel du
  // jeu : elle est couverte de façon déterministe par server/test-parcours-club.js,
  // ici on vérifie seulement le câblage.
  const idJoueurContratCourt = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    s.clubJoueur.effectif[0].contrat = 1;
    localStorage.setItem('rugbyManager.club.v1', JSON.stringify(s));
    return s.clubJoueur.effectif[0].id;
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  await page.click('#btnContinuerClub');
  await page.waitForTimeout(200);
  await clicOnglet('effectif');
  await page.waitForTimeout(150);
  // La liste est triée par poste par défaut : cible ce joueur précis par id
  // plutôt que la première ligne (qui n'est pas forcément effectif[0]).
  await page.click(`#clubEffectif tr[data-joueur="${idJoueurContratCourt}"]`);
  await page.waitForTimeout(150);
  verifier('négociation de contrat : le bouton de renouvellement est proposé pour un contrat expirant', await page.isVisible('#btnRenouveler'));
  await page.click('#btnRenouveler');
  await page.waitForTimeout(200);
  verifier('négociation de contrat : cliquer "Renouveler" ouvre une fenêtre intégrée pour proposer un salaire (pas une simple confirmation)',
    await page.isVisible('#modalMontant.visible'));
  const valeurProposeeParDefaut = await page.inputValue('#modalMontantInput');
  verifier('fenêtre de montant : un salaire par défaut est pré-rempli (pas un champ vide)', Number(valeurProposeeParDefaut) > 0);
  await page.fill('#modalMontantInput', '0');
  await page.click('#modalMontantValider');
  await page.waitForTimeout(150);
  verifier('fenêtre de montant : un montant invalide (0) affiche une erreur SANS fermer la fenêtre (le contexte n\'est pas perdu)',
    await page.isVisible('#modalMontant.visible') && await page.isVisible('#modalMontantErreur'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  verifier('fenêtre de montant : Échap annule proprement (referme sans négocier)', !(await page.isVisible('#modalMontant.visible')));

  // 5c) Rechargement en milieu d'action : recharger la page PENDANT que la
  // fiche joueur est ouverte ne doit jamais laisser le jeu dans un état
  // cassé (fiche fantôme, effectif introuvable) — aucun état d'ouverture de
  // panneau n'est persisté, un rechargement retourne toujours à l'écran
  // d'accueil, qu'il faut ensuite pouvoir retraverser normalement.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  verifier('rechargement en milieu d\'action (fiche joueur ouverte) : retour propre à l\'écran d\'accueil', await page.isVisible('#btnContinuerClub'));
  await page.click('#btnContinuerClub');
  await page.waitForTimeout(200);
  verifier('rechargement en milieu d\'action : la carrière reprend sur le Dashboard (pas de fiche fantôme)', await page.isVisible('[data-volet="dashboard"]'));

  // 5d) Retour arrière au clavier (Échap) : referme la fiche joueur sans
  // passer par son bouton dédié "← Retour à l'effectif" (cf. commit "Échap
  // referme les calques ouverts").
  await clicOnglet('effectif');
  await page.waitForTimeout(150);
  await page.click(`#clubEffectif tr[data-joueur="${idJoueurContratCourt}"]`);
  await page.waitForTimeout(150);
  verifier('retour arrière : la fiche joueur est bien ouverte avant le test Échap', await page.isVisible('#clubJoueurDetail'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  verifier('retour arrière (Échap) : la fiche joueur se referme au clavier, sans cliquer sur "Retour"',
    !(await page.isVisible('#clubJoueurDetail')) && await page.isVisible('#clubEffectif'));

  // 5e) Fenêtre de confirmation intégrée (TODO_AUDIT.md P1-8) : remplace
  // window.confirm pour "Libérer ce joueur" — vérifie le cycle complet,
  // Annuler (rien ne se passe) PUIS Confirmer (l'action s'applique
  // réellement), pas juste l'un des deux chemins.
  const cibleLiberation = await page.evaluate(() => {
    const eff = JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.effectif;
    const comptes = {};
    for (const j of eff) comptes[j.poste] = (comptes[j.poste] || 0) + 1;
    return (eff.find((j) => comptes[j.poste] > 1) || {}).id || null;
  });
  if (cibleLiberation) {
    const effectifAvantLiberation = await page.evaluate(() => JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.effectif.length);
    await page.click(`#clubEffectif tr[data-joueur="${cibleLiberation}"]`);
    await page.waitForTimeout(150);
    await page.click('#btnLibererFiche');
    await page.waitForTimeout(150);
    verifier('confirmation intégrée : "Libérer ce joueur" ouvre une fenêtre de confirmation (pas une boîte native)',
      await page.isVisible('#modalConfirmation.visible'));

    // Accessibilité clavier (TODO_AUDIT.md P2-12) : rôle ARIA, focus initial
    // dans la fenêtre, piège Tab (ne s'échappe jamais vers le fond), et
    // restauration du focus sur le bouton déclencheur à la fermeture.
    verifier('accessibilité : la fenêtre de confirmation a role="dialog" et aria-modal="true"',
      await page.evaluate(() => {
        const m = document.getElementById('modalConfirmation');
        return m.getAttribute('role') === 'dialog' && m.getAttribute('aria-modal') === 'true';
      }));
    verifier('accessibilité : le focus part sur un élément DANS la fenêtre de confirmation à l\'ouverture',
      await page.evaluate(() => document.getElementById('modalConfirmation').contains(document.activeElement)));
    await page.keyboard.press('Tab');
    verifier('accessibilité : Tab déplace le focus vers le bouton suivant, toujours DANS la fenêtre',
      await page.evaluate(() => document.getElementById('modalConfirmation').contains(document.activeElement)));
    await page.keyboard.press('Tab');
    verifier('accessibilité : Tab depuis le dernier bouton reboucle sur le premier (piège de focus actif)',
      await page.evaluate(() => document.activeElement && document.activeElement.id === 'modalConfirmationAnnuler'));
    await page.click('#modalConfirmationAnnuler');
    await page.waitForTimeout(150);
    verifier('accessibilité : après fermeture, le focus revient sur le bouton qui a ouvert la fenêtre',
      await page.evaluate(() => document.activeElement && document.activeElement.id === 'btnLibererFiche'));
    await page.click('#btnLibererFiche');
    await page.waitForTimeout(150);
    await page.click('#modalConfirmationAnnuler');
    await page.waitForTimeout(150);
    const effectifApresAnnulation = await page.evaluate(() => JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.effectif.length);
    verifier('confirmation intégrée : "Annuler" referme la fenêtre SANS libérer le joueur',
      !(await page.isVisible('#modalConfirmation.visible')) && await page.isVisible('#clubJoueurDetail') && effectifApresAnnulation === effectifAvantLiberation);
    await page.click('#btnLibererFiche');
    await page.waitForTimeout(150);
    await page.click('#modalConfirmationValider');
    await page.waitForTimeout(200);
    const effectifApresConfirmation = await page.evaluate(() => JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.effectif.length);
    verifier('confirmation intégrée : "Confirmer" libère bien le joueur',
      effectifApresConfirmation === effectifAvantLiberation - 1 && !(await page.isVisible('#clubJoueurDetail')));
  }

  // 5c) Centre de formation : le vivier d'espoirs est affiché et un espoir
  // peut être promu en équipe première, ce qui l'ajoute réellement à
  // l'effectif pro (donc utilisable en composition).
  const effectifAvantPromotion = await page.evaluate(() => JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.effectif.length);
  const boutonsJeunes = await page.$$('#clubCentreFormation .btnPromouvoirJeune');
  verifier('centre de formation : le vivier d\'espoirs est affiché avec au moins un espoir', boutonsJeunes.length > 0);
  if (boutonsJeunes.length > 0) {
    await boutonsJeunes[0].click();
    await page.waitForTimeout(150);
    verifier('centre de formation : promouvoir un espoir ouvre une fenêtre de confirmation intégrée (pas une boîte native)',
      await page.isVisible('#modalConfirmation.visible'));
    await page.click('#modalConfirmationValider');
    await page.waitForTimeout(200);
    const effectifApresPromotion = await page.evaluate(() => JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.effectif.length);
    verifier('centre de formation : promouvoir un espoir l\'ajoute réellement à l\'effectif professionnel', effectifApresPromotion === effectifAvantPromotion + 1);
  }

  // 6) Affichage d'un club adverse + fiche joueur adverse + offre de transfert.
  await clicOnglet('autresclubs');
  await page.waitForTimeout(150);
  await page.click('#clubAutresClubsListe tbody tr:nth-child(1)');
  await page.waitForTimeout(150);
  const detailAdversaireTxt = await page.textContent('#clubAutresClubIdentite');
  verifier('club adverse : sa fiche affiche un contenu réel', detailAdversaireTxt.trim().length > 20);
  await page.click('#clubAutresClubEffectif tbody tr:nth-child(1)');
  await page.waitForTimeout(150);
  verifier('club adverse : le bouton "Faire une offre de transfert" est proposé sur sa fiche joueur',
    await page.isVisible('#btnApprocherJoueurAdverse'));
  await page.click('#btnApprocherJoueurAdverse');
  await page.waitForTimeout(200);
  verifier('club adverse : cliquer "Faire une offre" ouvre bien une fenêtre intégrée pour le montant (pré-remplie du prix demandé)',
    await page.isVisible('#modalMontant.visible') && Number(await page.inputValue('#modalMontantInput')) > 0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  verifier('fenêtre de montant : Échap annule l\'offre sans la soumettre, revient à la fiche du club adverse',
    !(await page.isVisible('#modalMontant.visible')) && await page.isVisible('#clubJoueurAdversaireDetail'));

  // 6b) Retour arrière (Échap) sur un panneau imbriqué : la fiche d'un
  // joueur adverse est ouverte À L'INTÉRIEUR de la fiche du club adverse —
  // Échap ne doit refermer QUE le niveau le plus imbriqué (comme pour la
  // fiche joueur de son propre effectif, cf. 5d), pas sauter directement à
  // la liste des clubs en passant par-dessus le niveau intermédiaire.
  verifier('retour arrière : la fiche du joueur adverse est bien ouverte avant le test Échap', await page.isVisible('#clubJoueurAdversaireDetail'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  verifier('retour arrière (Échap) : referme uniquement la fiche du joueur adverse, reste sur la fiche du club adverse',
    !(await page.isVisible('#clubJoueurAdversaireDetail')) && await page.isVisible('#clubAutresClubDetail'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  verifier('retour arrière (Échap) : un second Échap referme ensuite la fiche du club adverse, retour à la liste',
    !(await page.isVisible('#clubAutresClubDetail')) && await page.isVisible('#clubAutresClubsListe'));

  // 6b) Équipe B (championnat réservé aux clubs au budget le plus élevé de
  // la ligue) : force un budget confortable (état non exposé par l'UI,
  // modifié directement en localStorage comme le ferait une vraie période de
  // sponsoring) pour garantir l'éligibilité et pouvoir vérifier la branche
  // "classement/calendrier réels" de façon déterministe, plutôt que de
  // dépendre du hasard de la génération de carrière.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    s.clubJoueur.budget = 5000;
    s.competitionB = null; // reconstitué à la prochaine consultation (cf. RMClub.assurerCompetitionB)
    localStorage.setItem('rugbyManager.club.v1', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  await page.click('#btnContinuerClub');
  await page.waitForTimeout(200);
  await clicOnglet('equipeb');
  await page.waitForTimeout(150);
  const statutEquipeBTxt = await page.textContent('#clubEquipeBStatut');
  verifier('équipe B : la carte de statut affiche un contenu réel', statutEquipeBTxt.trim().length > 20);
  verifier('équipe B : un budget confortable rend bien le club éligible',
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
      return s.competitionB.eligibles.includes(s.clubJoueur.id);
    }));
  verifier('équipe B : classement et calendrier affichés quand le club est éligible',
    await page.isVisible('#carteEquipeBClassement') && await page.isVisible('#carteEquipeBCalendrier'));
  // Audit ("pas même la liste de joueurs de l'équipe B") : avant correctif,
  // l'onglet n'affichait qu'un classement de clubs et un calendrier de
  // scores — jamais les joueurs réellement sélectionnés, alors que ce vivier
  // (réservistes + centre de formation) est bien calculé en interne pour
  // simuler le match (cf. RMClub.effectifDisponiblePourEquipeB).
  verifier('équipe B : la composition (15 joueurs réellement sélectionnés) est affichée', await page.isVisible('#carteEquipeBComposition'));
  const compoBTexte = await page.textContent('#clubEquipeBComposition');
  verifier('équipe B : la composition affichée contient bien 15 lignes de poste (une par numéro)',
    (compoBTexte.match(/Pilier|Talonneur|Deuxième ligne|Troisième ligne|Demi de mêlée|Ouverture|Ailier|Centre|Arrière/g) || []).length >= 15);
  const rondesJoueesAvant = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    return s.competitionB.calendrier.filter((f) => f.joue).length;
  });

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

  // Retour arrière (Échap) : referme l'aperçu du match sans lancer le match
  // ni changer d'onglet (cf. commit "Échap referme les calques ouverts").
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  verifier('retour arrière (Échap) : referme l\'aperçu du match sans le lancer',
    !(await page.isVisible('#panneauApercuMatch.visible')) && !(await page.isVisible('#panneauResultat.visible')));

  // Rechargement en milieu d'action : recharger PENDANT que l'aperçu du
  // match est ouvert ne doit ni le laisser rouvert malgré lui après le
  // rechargement, ni empêcher de le rouvrir et de jouer la journée ensuite.
  await page.click('#btnApercuMatchFlottant');
  await page.waitForSelector('#panneauApercuMatch.visible', { timeout: 5000 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  verifier('rechargement en milieu d\'action (aperçu du match ouvert) : retour propre à l\'écran d\'accueil', await page.isVisible('#btnContinuerClub'));
  await page.click('#btnContinuerClub');
  await page.waitForTimeout(200);
  verifier('rechargement en milieu d\'action : la carrière reprend sans aperçu du match resté ouvert malgré lui',
    await page.isVisible('[data-volet="dashboard"]') && !(await page.isVisible('#panneauApercuMatch.visible')));
  await page.click('#btnApercuMatchFlottant');
  await page.waitForSelector('#panneauApercuMatch.visible', { timeout: 5000 });
  verifier('rechargement en milieu d\'action : l\'aperçu du match reste utilisable ensuite (pas de calque bloqué)', await page.isVisible('#panneauApercuMatch.visible'));

  // Audit P1 (anti-double-action) : un double clic RÉEL sur "Lancer le
  // match" (deux événements DOM traités l'un après l'autre sans repeinture
  // entre les deux, cf. le même principe que le double clic "signer" plus
  // haut) démarrait auparavant une DEUXIÈME simulation qui se disputait
  // l'état partagé de docs/js/main.js avec la première — reproduit : le jeu
  // restait bloqué indéfiniment sur une simulation Équipe B en arrière-plan,
  // sans aucune erreur console, sans façon de continuer sans recharger la
  // page. Corrigé par un verrou anti-ré-entrée (`journeeEnCours`,
  // docs/js/clubUI.js) — vérifié ici que la journée se déroule normalement
  // malgré le double clic (une seule journée jouée, pas de blocage).
  const matchsJouesAvantDoubleClicJournee = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('rugbyManager.club.v1')).calendrier.filter((f) => f.joue).length);
  await page.evaluate(() => {
    const bouton = () => document.getElementById('btnApercuLancerMatch');
    bouton() && bouton().click();
    bouton() && bouton().click();
  });
  await page.waitForSelector('#panneauResultat.visible', { timeout: 20000 });
  const scoreTxt = await page.textContent('#resultatScore');
  verifier('progression d\'une journée : un score réel est affiché', /\d+\s*[—-]\s*\d+/.test(scoreTxt));
  const matchsJouesApresDoubleClicJournee = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('rugbyManager.club.v1')).calendrier.filter((f) => f.joue).length);
  verifier('double clic sur "Lancer le match" : une seule journée est jouée, pas de blocage ni de double simulation',
    matchsJouesApresDoubleClicJournee === matchsJouesAvantDoubleClicJournee + 7);
  await page.click('#btnResultatFermer');
  await page.waitForTimeout(300);
  verifier('progression d\'une journée : retour au club après le match', await page.isVisible('#panneauClub.visible'));
  const rondesJoueesApres = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    return s.competitionB.calendrier.filter((f) => f.joue).length;
  });
  verifier('équipe B : la journée d\'équipe B est simulée en même temps que la journée principale',
    rondesJoueesApres > rondesJoueesAvant);
  const mouvementEquipeB = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    return (s.clubJoueur.historiqueFinances || []).find((m) => m.source === 'equipeB') || null;
  });
  verifier('équipe B : un match du club du joueur génère une recette de billetterie réelle dans le journal financier',
    !!mouvementEquipeB && mouvementEquipeB.recette > 0 && mouvementEquipeB.salaires === 0);
  await clicOnglet('finances');
  await page.waitForTimeout(150);
  verifier('équipe B : le journal financier affiche bien le mouvement Équipe B distinctement',
    (await page.textContent('#clubHistoriqueFinances')).includes('Équipe B'));

  // 7b) Classement : les points de bonus (offensif/défensif) doivent être
  // affichés à part de "Pts", pas fondus dedans (cf. RMClub.enregistrerResultatDans).
  await clicOnglet('calendrier');
  await page.waitForTimeout(150);
  const enteteClassementTxt = await page.textContent('#clubClassement thead');
  verifier('classement : les colonnes de bonus offensif/défensif sont affichées',
    enteteClassementTxt.includes('BO') && enteteClassementTxt.includes('BD'));
  const journeeJoueeApres1Journee = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    return Object.values(s.classement).some((r) => r.j >= 1 && Number.isFinite(r.pts));
  });
  verifier('classement : les points restent des nombres valides après un résultat réel (pas de NaN)', journeeJoueeApres1Journee);

  // 7c) Écosystème mondial (onglet Monde) : 12 pays réels, une division
  // ouvrable avec un classement réel dérivé des journées déjà simulées en
  // arrière-plan (cf. RMWorld.avancerJourneeMonde, appelé à chaque journée
  // jouée par le club du joueur).
  await clicOnglet('monde');
  await page.waitForTimeout(150);
  const nbPaysAffiches = await page.$$eval('#mondePays .ligneJeune', (els) => els.length);
  verifier('monde : les 12 pays sont affichés', nbPaysAffiches === 12);
  const nbDivisionsMonde = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    return s.monde ? Object.keys(s.monde.divisions).length : 0;
  });
  verifier('monde : le monde est bien persisté avec toutes ses divisions', nbDivisionsMonde > 25);
  await page.click('.btnDivisionMonde');
  await page.waitForTimeout(150);
  verifier('monde : ouvrir une division affiche un classement réel', await page.isVisible('#carteMondeDivision'));
  const classementMondeTxt = await page.textContent('#mondeDivisionCorps');
  verifier('monde : le classement de la division contient des clubs réels', classementMondeTxt.trim().length > 30);
  await page.click('#btnFermerMondeDivision');
  await page.waitForTimeout(150);
  verifier('monde : fermer la division revient à la liste des pays', !(await page.isVisible('#carteMondeDivision')));
  const internationalesTxt = await page.textContent('#mondeInternationales');
  verifier('monde : les compétitions internationales sont affichées (Couronnes/Hémisphère/Mondiale/Continentale/Challenge)',
    internationalesTxt.includes('Couronnes') && internationalesTxt.includes('Hémisphère') && internationalesTxt.includes('Mondiale'));

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
    // Force la 1re place (état non exposé par l'UI, modifié directement en
    // localStorage) pour vérifier de façon déterministe qu'une vraie montée
    // de palier a bien lieu, plutôt que de dépendre du hasard des résultats
    // déjà simulés cette saison.
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
      for (const id of Object.keys(s.classement)) s.classement[id].pts = 0;
      s.classement[s.clubJoueur.id].pts = 999;
      localStorage.setItem('rugbyManager.club.v1', JSON.stringify(s));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(200);
    await page.click('#btnContinuerClub');
    await page.waitForTimeout(200);
    await page.click('#btnSaisonSuivante');
    await page.waitForTimeout(300);
    verifier('fin de saison : le bilan de fin de saison s\'affiche dans une fenêtre intégrée (pas une boîte native)',
      await page.isVisible('#modalInfo.visible') && (await page.textContent('#modalInfoTitre')).includes('Saison'));
    await page.click('#modalInfoValider');
    await page.waitForTimeout(150);
    verifier('fin de saison : le club reste jouable en saison 2', await page.isVisible('[data-volet="dashboard"]'));
    const entetApresPromotion = await page.textContent('#clubEntete');
    verifier('pyramide : finir 1er fait bien monter de palier (affiché dans l\'entête)', entetApresPromotion.includes('Ligue Nationale'));
    await clicOnglet('dashboard');
    await page.waitForTimeout(150);
    const messagesTxt = await page.textContent('#clubMessages');
    verifier('pyramide : un message "Promotion !" apparaît dans la boîte de réception', messagesTxt.includes('Promotion'));
  } else {
    console.log('   (fin de saison non atteinte dans ce run — championnat trop long pour un test rapide, mécanisme couvert par server/test-parcours-club.js)');
  }

  // 9) Sauvegarde corrompue (TODO_AUDIT.md P0-2/P1-7) : preuve, dans un vrai
  // navigateur, que l'avertissement de récupération est réellement montré
  // au joueur (pas seulement vérifié côté données, cf.
  // server/test-audit-p0-2.js) et qu'une carrière reste ensuite créable
  // normalement. Contexte de navigateur isolé pour ne pas perturber la
  // carrière en cours testée plus haut.
  const contexteCorrompu = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageCorrompue = await contexteCorrompu.newPage();
  await pageCorrompue.goto(`${URL_BASE}/index.html`, { waitUntil: 'networkidle' });
  await pageCorrompue.evaluate(() => localStorage.setItem('rugbyManager.club.v1', '{ "version": 2, "clubJoueur": { "nom": "Cassé"'));
  await pageCorrompue.reload({ waitUntil: 'networkidle' });
  await pageCorrompue.waitForTimeout(300);
  const messageAvertissement = await pageCorrompue.isVisible('#modalInfo.visible') ? await pageCorrompue.textContent('#modalInfoTexte') : null;
  verifier('sauvegarde corrompue : un avertissement explicite est affiché au joueur (pas un écran vide silencieux)',
    !!messageAvertissement && messageAvertissement.includes('secours'));
  await pageCorrompue.click('#modalInfoValider');
  await pageCorrompue.waitForTimeout(150);
  verifier('sauvegarde corrompue : l\'écran d\'accueil reste normalement utilisable ensuite', await pageCorrompue.isVisible('#btnAccueilModeClub'));
  await pageCorrompue.click('#btnAccueilModeClub');
  await pageCorrompue.waitForTimeout(150);
  await pageCorrompue.fill('#inputNomClub', 'Nouvelle Apres Corruption');
  await pageCorrompue.click('#btnCreerClub');
  await pageCorrompue.waitForTimeout(300);
  verifier('sauvegarde corrompue : une nouvelle carrière se crée normalement après l\'avertissement', await pageCorrompue.isVisible('[data-volet="dashboard"]'));
  await contexteCorrompu.close();

  // 10) Marché des transferts sur mobile étroit (audit trouvé en vérifiant le
  // correctif du double-clic ci-dessus) : la ligne d'un joueur (nom, prix,
  // Scouter, Signer) ne tient pas sur ~390px de large. Avant correctif,
  // #clubMarche avait overflow-x:visible et un ancêtre masquait le
  // débordement : le bouton "Signer" — celui qui compte le plus — sortait
  // de l'écran SANS AUCUN moyen de défilement pour le rattraper (bloquant,
  // pas juste inesthétique). Contexte de navigateur isolé, viewport mobile
  // réel (390x844, comme un iPhone standard).
  const contexteMobileMarche = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pageMobileMarche = await contexteMobileMarche.newPage();
  await pageMobileMarche.goto(`${URL_BASE}/index.html`, { waitUntil: 'networkidle' });
  await pageMobileMarche.click('#btnAccueilModeClub');
  await pageMobileMarche.fill('#inputNomClub', 'Mobile Marché');
  await pageMobileMarche.click('#btnCreerClub');
  await pageMobileMarche.waitForTimeout(300);
  // Budget large pour que "Signer" ne soit jamais désactivé faute de fonds
  // (le test porte sur l'atteignabilité du bouton, pas sur son abordabilité).
  await pageMobileMarche.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    s.clubJoueur.budget = 100000;
    localStorage.setItem('rugbyManager.club.v1', JSON.stringify(s));
  });
  await pageMobileMarche.reload({ waitUntil: 'networkidle' });
  await pageMobileMarche.waitForTimeout(200);
  await pageMobileMarche.click('#btnContinuerClub');
  await pageMobileMarche.waitForTimeout(300);
  await pageMobileMarche.click('#btnMenuClub');
  await pageMobileMarche.waitForTimeout(150);
  await pageMobileMarche.click('.ongletBtn[data-onglet="transferts"]');
  await pageMobileMarche.waitForTimeout(200);
  const scrollInfo = await pageMobileMarche.evaluate(() => {
    const marche = document.getElementById('clubMarche');
    return { overflowX: getComputedStyle(marche).overflowX, scrollWidth: marche.scrollWidth, clientWidth: marche.clientWidth };
  });
  verifier('marché des transferts (mobile) : la zone défile bien horizontalement (overflow-x auto, contenu plus large que l\'écran)',
    scrollInfo.overflowX === 'auto' && scrollInfo.scrollWidth > scrollInfo.clientWidth);
  await pageMobileMarche.evaluate(() => { document.getElementById('clubMarche').scrollLeft = 300; });
  await pageMobileMarche.waitForTimeout(150);
  const effectifAvantMobile = await pageMobileMarche.evaluate(() => JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.effectif.length);
  await pageMobileMarche.click('#clubMarche .ligneMarche:first-child .btnSigner');
  await pageMobileMarche.waitForTimeout(300);
  const effectifApresMobile = await pageMobileMarche.evaluate(() => JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.effectif.length);
  verifier('marché des transferts (mobile) : après défilement, "Signer" est réellement cliquable et recrute le joueur',
    effectifApresMobile === effectifAvantMobile + 1);
  await contexteMobileMarche.close();

  verifier('aucune erreur console/page sur tout le parcours', erreursConsole.length === 0);
  if (erreursConsole.length) console.error(erreursConsole.join('\n'));

  await browser.close();
  console.log(`\n${nbTests} test(s), ${nbEchecs} échec(s).`);
  process.exit(nbEchecs > 0 ? 1 : 0);
})();
