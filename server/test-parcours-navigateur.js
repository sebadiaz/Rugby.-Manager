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

  // Même principe que clicOnglet, mais sur une page quelconque (les blocs de
  // test isolés ouvrent leur propre contexte).
  async function clicOngletSur(p, cle) {
    if (await p.isVisible('#btnMenuClub')) {
      await p.click('#btnMenuClub');
      await p.waitForTimeout(150);
    }
    await p.click(`.ongletBtn[data-onglet="${cle}"]`);
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
    'transferts', 'personnel', 'autresclubs', 'calendrier', 'monde', 'finances', 'medical', 'stats'];
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
  // Attente > au verrou anti-double-action (cf. clubUI.js, marcheActionVerrouillee,
  // maintenant 1500 ms) pour ne pas hériter du verrou encore actif posé par
  // le test précédent.
  await page.waitForTimeout(1700);
  const nomsAvantDoubleClicCoord = await page.$$eval('#clubMarche .ligneMarche .infosJoueur b', (els) => els.map((e) => e.textContent));
  verifier('double clic écran : au moins 2 joueurs sur le marché avant le test (scénario significatif)', nomsAvantDoubleClicCoord.length >= 2);
  // Les deux clics sont dispatchés dans UN SEUL page.evaluate (jamais deux
  // page.mouse.click() séparés) : deux allers-retours Playwright/CDP
  // introduisent un délai réseau variable entre les deux clics (quelques ms
  // en local, potentiellement bien plus sous charge — observé en CI : un
  // run a dépassé le verrou de 800 ms alors qu'aucun humain ne clique aussi
  // lentement). En dispatchant les deux MouseEvent synchronement au même
  // point écran, on reproduit fidèlement le pire cas réel (deux clics
  // quasi simultanés) sans dépendre de la latence de l'outil de test.
  await page.evaluate(() => {
    const box = document.querySelector('#clubMarche .ligneMarche:first-child .btnSigner').getBoundingClientRect();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    for (let i = 0; i < 2; i++) {
      const el = document.elementFromPoint(x, y);
      if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    }
  });
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
  const idsContrats = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    s.clubJoueur.effectif[0].contrat = 1;
    // Audit ("pas de gestion de contrat") : avant correctif, "Renouveler"
    // n'était proposé QUE pour un contrat expirant (<=1 an) — un joueur qui
    // ne laisse jamais un contrat filer jusque-là ne voit jamais ce bouton,
    // au point de penser que la fonctionnalité n'existe pas.
    s.clubJoueur.effectif[1].contrat = 3;
    localStorage.setItem('rugbyManager.club.v1', JSON.stringify(s));
    return { court: s.clubJoueur.effectif[0].id, long: s.clubJoueur.effectif[1].id };
  });
  const idJoueurContratCourt = idsContrats.court;
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  await page.click('#btnContinuerClub');
  await page.waitForTimeout(200);
  await clicOnglet('effectif');
  await page.waitForTimeout(150);
  await page.click(`#clubEffectif tr[data-joueur="${idsContrats.long}"]`);
  await page.waitForTimeout(150);
  verifier('négociation de contrat : le bouton de renouvellement est proposé MÊME avec 3 ans de contrat restants (pas seulement en fin de contrat)',
    await page.isVisible('#btnRenouveler'));
  await page.click('#btnFermerFicheJoueur');
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

  // 5c) Centre de formation (TODO_AUDIT.md P1-19) : plus de liste séparée —
  // les espoirs sont une ÉQUIPE du sélecteur commun, affichés dans le MÊME
  // écran Effectif que le premier XV, avec la MÊME fiche joueur. La
  // promotion vit désormais dans cette fiche.
  await clicOnglet('effectif');
  await page.waitForTimeout(150);
  await page.selectOption('#selEquipeContexte', 'jeunes');
  await page.waitForTimeout(250);
  const lignesEspoirs = await page.$$('#clubEffectif tr[data-joueur]');
  verifier('centre de formation : les espoirs s\'affichent dans le MÊME tableau d\'effectif que le premier XV',
    lignesEspoirs.length > 0);
  const effectifAvantPromotion = await page.evaluate(() => JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.effectif.length);
  if (lignesEspoirs.length > 0) {
    await lignesEspoirs[0].click();
    await page.waitForTimeout(200);
    verifier('centre de formation : un espoir s\'ouvre dans la MÊME fiche joueur (#clubJoueurDetail) que les joueurs pros',
      await page.isVisible('#clubJoueurDetail'));
    verifier('centre de formation : la fiche d\'un espoir propose "Promouvoir", et jamais "Libérer" (action réservée à l\'effectif pro)',
      await page.isVisible('#btnPromouvoirEspoir') && !(await page.isVisible('#btnLibererFiche')));
    await page.click('#btnPromouvoirEspoir');
    await page.waitForTimeout(150);
    verifier('centre de formation : promouvoir un espoir ouvre une fenêtre de confirmation intégrée (pas une boîte native)',
      await page.isVisible('#modalConfirmation.visible'));
    await page.click('#modalConfirmationValider');
    await page.waitForTimeout(250);
    const effectifApresPromotion = await page.evaluate(() => JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.effectif.length);
    verifier('centre de formation : promouvoir un espoir l\'ajoute réellement à l\'effectif professionnel', effectifApresPromotion === effectifAvantPromotion + 1);
  }
  // Retour au premier XV pour la suite du parcours (le sélecteur conserve
  // l'équipe choisie d'un écran à l'autre : c'est exactement le but).
  await page.selectOption('#selEquipeContexte', 'pro');
  await page.waitForTimeout(200);

  // 6) Affichage d'un club adverse + fiche joueur adverse + offre de transfert.
  await clicOnglet('autresclubs');
  await page.waitForTimeout(150);
  // Audit ("les autres championnats ne sont jamais simulés") : les 2 autres
  // paliers de la pyramide française (celui que le joueur n'occupe pas
  // cette saison) doivent afficher un classement réel, pas une carte vide.
  const autresPaliersTxt = await page.textContent('#clubAutresPaliersFrance');
  verifier('autres paliers de la pyramide française : un classement réel est affiché (pas une carte vide)', autresPaliersTxt.trim().length > 20);
  verifier('autres paliers de la pyramide française : les 2 paliers non occupés par le joueur sont bien nommés',
    autresPaliersTxt.includes('Ligue') && (autresPaliersTxt.match(/Ligue/g) || []).length >= 2);
  // TODO_AUDIT.md P1-20 : la liste des autres clubs n'est PAS un sélecteur —
  // ce sont des noms cliquables, exactement comme partout ailleurs, et ils
  // appellent la même fonction centrale d'ouverture de club.
  verifier('autres clubs : la liste propose des noms de clubs CLIQUABLES (pas un menu déroulant)',
    (await page.$$('#clubAutresClubsListe .lienClub')).length > 0
    && await page.evaluate(() => !document.querySelector('#clubAutresClubsListe select')));
  await page.click('#clubAutresClubsListe .lienClub');
  await page.waitForTimeout(300);
  const apresOuvertureClub = await page.evaluate(() => ({
    ongletVisible: document.querySelector('.voletOnglet[data-volet="composition"]').style.display !== 'none',
    entete: document.getElementById('clubEntete').innerText,
    retour: !!document.getElementById('btnRetourMonClub'),
    equipe: document.getElementById('selEquipeContexte').value,
  }));
  verifier('autres clubs : cliquer le nom d\'un club l\'ouvre directement sur sa Composition, équipe première sélectionnée',
    apresOuvertureClub.ongletVisible && apresOuvertureClub.equipe === 'pro');
  verifier('autres clubs : le nom du club ouvert apparaît en haut à gauche, avec "Club consulté" et le bouton de retour',
    apresOuvertureClub.entete.includes('Club consulté') && apresOuvertureClub.retour);
  // Sa vue d'ensemble (identité/forme/comparaison/confrontations) vit dans
  // l'onglet Vue d'ensemble du club ouvert, pas dans un écran séparé.
  await clicOnglet('dashboard');
  await page.waitForTimeout(200);
  const vueClubTxt = await page.textContent('#clubVueConsulteIdentite');
  verifier('club consulté : sa vue d\'ensemble affiche un contenu réel (identité, forme, classement)', vueClubTxt.trim().length > 20);
  verifier('club consulté : les cartes de gestion du tableau de bord sont masquées (aucune donnée du joueur affichée à sa place)',
    await page.evaluate(() => Array.from(document.querySelectorAll('.voletOnglet[data-volet="dashboard"] .carteMonClub'))
      .every((el) => el.style.display === 'none')));
  // Offre de transfert : même fiche joueur que pour ses propres joueurs,
  // seule l'action proposée diffère.
  await clicOnglet('effectif');
  await page.waitForTimeout(250);
  verifier('club consulté : son effectif s\'affiche dans l\'écran Effectif COMMUN, en lecture seule',
    (await page.$$('#clubEffectif tr[data-joueur]')).length === 15
    && !!(await page.$('#contexteEquipeInfo .badgeEquipeMode.lecture')));
  await page.click('#clubEffectif tr[data-joueur]');
  await page.waitForTimeout(200);
  verifier('club adverse : un de ses joueurs s\'ouvre dans la MÊME fiche joueur (#clubJoueurDetail) que les siens',
    await page.isVisible('#clubJoueurDetail'));
  verifier('club adverse : le bouton "Faire une offre de transfert" est proposé sur sa fiche joueur',
    await page.isVisible('#btnApprocherJoueurAdverse'));
  verifier('club adverse : aucune action de gestion (libérer/renouveler/prêter) n\'est proposée sur un joueur qu\'on ne dirige pas',
    !(await page.isVisible('#btnLibererFiche')) && !(await page.isVisible('#btnRenouveler'))
    && !(await page.isVisible('#btnPreterJoueur')));
  await page.click('#btnApprocherJoueurAdverse');
  await page.waitForTimeout(200);
  verifier('club adverse : cliquer "Faire une offre" ouvre bien une fenêtre intégrée pour le montant (pré-remplie du prix demandé)',
    await page.isVisible('#modalMontant.visible') && Number(await page.inputValue('#modalMontantInput')) > 0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  verifier('fenêtre de montant : Échap annule l\'offre sans la soumettre, revient à la fiche du joueur',
    !(await page.isVisible('#modalMontant.visible')) && await page.isVisible('#clubJoueurDetail'));
  verifier('retour arrière (Échap) : la fiche d\'un joueur adverse se referme comme celle d\'un joueur du club',
    await (async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(150); return !(await page.isVisible('#clubJoueurDetail')); })());
  await page.click('#btnRetourMonClub');
  await page.waitForTimeout(300);
  verifier('club consulté : "← Retour à mon club" ramène bien sur son propre club',
    (await page.textContent('#clubEntete')).includes('Mon club') && !(await page.isVisible('#btnRetourMonClub')));

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
  verifier('équipe B : un budget confortable rend bien le club éligible',
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
      return s.competitionB.eligibles.includes(s.clubJoueur.id);
    }));
  // TODO_AUDIT.md P1-19 : plus d'onglet "Équipe B" dédié — son championnat
  // s'affiche dans l'écran Calendrier & classement COMMUN, et sa composition
  // dans l'écran Composition COMMUN.
  verifier('équipe B : l\'onglet dédié a bien disparu (écrans communs, plus de doublon)',
    await page.evaluate(() => !document.querySelector('.ongletBtn[data-onglet="equipeb"]')
      && !document.querySelector('.voletOnglet[data-volet="equipeb"]')));
  await clicOnglet('calendrier');
  await page.waitForTimeout(150);
  await page.selectOption('#selEquipeContexte', 'b');
  await page.waitForTimeout(250);
  const equipeBCalendrier = await page.evaluate(() => ({
    titre: document.getElementById('titreClubClassement').textContent,
    lignesClassement: document.querySelectorAll('#clubClassement tbody tr').length,
    blocsCalendrier: document.querySelectorAll('#clubCalendrier .blocJournee').length,
  }));
  verifier('équipe B : son classement s\'affiche dans le MÊME écran Calendrier & classement que le premier XV',
    equipeBCalendrier.titre.includes('Équipe B') && equipeBCalendrier.lignesClassement >= 2);
  verifier('équipe B : son calendrier réel s\'affiche dans ce même écran commun',
    equipeBCalendrier.blocsCalendrier > 0);
  // Sa composition passe par l'écran Composition commun (terrain 1-15).
  await clicOnglet('composition');
  await page.waitForTimeout(250);
  const equipeBCompo = await page.evaluate(() => ({
    equipe: document.getElementById('selEquipeContexte').value,
    postes: document.querySelectorAll('#clubTerrain .chipTerrain').length,
    modifiable: !!document.querySelector('#contexteEquipeInfo .badgeEquipeMode.dirigee'),
  }));
  verifier('équipe B : l\'équipe sélectionnée est CONSERVÉE en passant du calendrier à la composition',
    equipeBCompo.equipe === 'b');
  verifier('équipe B : sa composition s\'édite sur le MÊME terrain 1-15 que le premier XV',
    equipeBCompo.postes === 15 && equipeBCompo.modifiable);
  // Choisit manuellement un remplaçant différent de l'auto-sélection pour le
  // n°1 (pilier), si le vivier du jour en propose au moins 2 — et vérifie
  // que ce choix est bien celui persisté dans le slot réellement joué.
  const optionsN1 = await page.locator('#clubTerrain select[data-numero="1"] option').allTextContents();
  const nbOptionsN1 = optionsN1.filter((t) => t.trim() && t.trim() !== '—').length;
  if (nbOptionsN1 >= 2) {
    const valeurAvant = await page.locator('#clubTerrain select[data-numero="1"]').inputValue();
    const autreValeur = await page.evaluate((avant) => {
      const sel = document.querySelector('#clubTerrain select[data-numero="1"]');
      const opt = Array.from(sel.options).find((o) => o.value && o.value !== avant);
      return opt ? opt.value : null;
    }, valeurAvant);
    if (autreValeur) {
      await page.selectOption('#clubTerrain select[data-numero="1"]', autreValeur);
      await page.waitForTimeout(250);
      const idPersiste = await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
        return s.clubJoueur.compositionsSecondaires.b.compositionTitulaires['1'];
      });
      verifier('équipe B : un choix manuel dans l\'écran Composition commun est bien persisté dans le slot réellement joué',
        idPersiste === autreValeur);
    }
  }
  await page.selectOption('#selEquipeContexte', 'pro');
  await page.waitForTimeout(200);

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

  // Calendrier daté (TODO_AUDIT.md P1-21) : l'Équipe B joue le LENDEMAIN du
  // championnat, pas le même jour. Elle ne doit donc pas encore avoir joué
  // au moment où le match du premier XV vient de se terminer — c'est la
  // preuve directe qu'aucun match n'est simulé avant sa date.
  const rondesBApresMatchPro = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    return s.competitionB.calendrier.filter((f) => f.joue).length;
  });
  verifier('calendrier daté : l\'Équipe B n\'a PAS encore joué le jour du match de championnat (sa date est le lendemain)',
    rondesBApresMatchPro === rondesJoueesAvant);
  const dateApresMatchPro = await page.evaluate(() => JSON.parse(localStorage.getItem('rugbyManager.club.v1')).temps);
  verifier('calendrier daté : le match de championnat s\'est bien joué un samedi',
    await page.evaluate((t) => window.RMClub.jourSemaine(t) === 6, dateApresMatchPro));
  // Un clic de plus sur « Continuer » avance au dimanche et joue l'Équipe B.
  const libelleAvantB = await page.textContent('#btnJouerMatchClub');
  verifier('calendrier daté : le bouton annonce la prochaine échéance datée (« Continuer jusqu\'au dimanche… »)',
    /Continuer jusqu'au dimanche/.test(libelleAvantB));
  await page.click('#btnJouerMatchClub');
  await page.waitForFunction(
    () => document.getElementById('panneauClub').classList.contains('visible')
      && !document.getElementById('btnJouerMatchClub').disabled,
    { timeout: 90000 }
  ).catch(() => {});
  await page.waitForTimeout(400);
  const rondesJoueesApres = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    return s.competitionB.calendrier.filter((f) => f.joue).length;
  });
  verifier('équipe B : sa journée se joue à SA date (le dimanche), après un clic « Continuer » supplémentaire',
    rondesJoueesApres > rondesJoueesAvant);
  const dateApresB = await page.evaluate(() => JSON.parse(localStorage.getItem('rugbyManager.club.v1')).temps);
  verifier('calendrier daté : la journée d\'Équipe B s\'est bien jouée un dimanche',
    await page.evaluate((t) => window.RMClub.jourSemaine(t) === 0, dateApresB));
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
  // Calendrier daté (TODO_AUDIT.md P1-21) : « Continuer » ne tombe plus
  // systématiquement sur un jour de championnat — il peut aussi s'arrêter le
  // dimanche (Équipe B) ou le mercredi (espoirs), qui se résolvent en
  // arrière-plan sans écran de préparation. La boucle gère donc les deux cas.
  // Durée courte : ce bloc sert à ATTEINDRE la fin de saison, pas à mesurer
  // un match — inutile de simuler 80 minutes des dizaines de fois.
  // (le sélecteur de durée vit dans l'onglet Dashboard : on est ici sur un
  // autre onglet, d'où l'affectation directe plutôt qu'un selectOption)
  await page.evaluate(() => { document.getElementById('selDureeClub').value = '300'; });
  let gardeFinSaison = 0;
  while (gardeFinSaison++ < 250) {
    const dejaTermine = await page.evaluate(() => document.getElementById('btnSaisonSuivante').style.display !== 'none');
    if (dejaTermine) break;
    const fixturesRestantes = await page.evaluate(() => document.getElementById('clubProchainMatch').textContent.includes('à jouer'));
    if (!fixturesRestantes) break;
    await page.click('#btnApercuMatchFlottant');
    const apercuOuvert = await page.waitForSelector('#panneauApercuMatch.visible', { timeout: 4000 })
      .then(() => true).catch(() => false);
    if (apercuOuvert) {
      await page.click('#btnApercuLancerMatch');
      await page.waitForSelector('#panneauResultat.visible', { timeout: 30000 });
      await page.click('#btnResultatFermer');
    }
    await page.waitForFunction(
      () => document.getElementById('panneauClub').classList.contains('visible')
        && !document.getElementById('btnJouerMatchClub').disabled,
      { timeout: 90000 }
    ).catch(() => {});
    await page.waitForTimeout(120);
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

  // 11) Match espoirs (audit "pas de tournois junior", cf. club-espoirs.js) :
  // le centre de formation dispute un vrai match RÉSERVÉ à lui seul, une
  // journée sur RMClub.PERIODE_JOURNEES_ESPOIRS. Contexte isolé : avance le
  // calendrier directement à la journée 4 (marque les journées 1-3 comme
  // déjà jouées, technique déjà utilisée ailleurs dans ce fichier) pour ne
  // pas payer le coût de 3 journées réelles supplémentaires juste pour
  // atteindre le déclencheur.
  const contexteEspoirs = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageEspoirs = await contexteEspoirs.newPage();
  await pageEspoirs.goto(`${URL_BASE}/index.html`, { waitUntil: 'networkidle' });
  await pageEspoirs.click('#btnAccueilModeClub');
  await pageEspoirs.fill('#inputNomClub', 'Test Espoirs');
  await pageEspoirs.click('#btnCreerClub');
  await pageEspoirs.waitForTimeout(300);
  const periode = await pageEspoirs.evaluate(() => window.RMClub && window.RMClub.PERIODE_JOURNEES_ESPOIRS);
  // Calendrier daté (TODO_AUDIT.md P1-21) : on avance AUSSI les journées
  // d'Équipe B (elles tombent le dimanche, elles seraient sinon la prochaine
  // échéance) et on positionne la date au mercredi du match espoirs — c'est
  // ce jour-là, et pas un autre, qu'il doit se jouer.
  await pageEspoirs.evaluate((periode) => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    for (const f of s.calendrier) {
      if (f.journee < periode) { f.joue = true; f.score = { domicile: 20, exterieur: 15 }; }
    }
    for (const f of s.competitionB.calendrier) {
      if (f.journee < periode) { f.joue = true; f.score = { domicile: 18, exterieur: 12 }; }
    }
    const mercredi = window.RMClub.dateDeJournee(s.numero, periode, 'jeunes');
    s.temps = Object.assign({}, s.temps, mercredi);
    localStorage.setItem('rugbyManager.club.v1', JSON.stringify(s));
  }, periode);
  await pageEspoirs.reload({ waitUntil: 'networkidle' });
  await pageEspoirs.waitForTimeout(200);
  await pageEspoirs.click('#btnContinuerClub');
  await pageEspoirs.waitForTimeout(300);
  // Un seul clic « Continuer » : on est déjà au mercredi, le match espoirs
  // se résout en arrière-plan (aucun écran de préparation pour lui).
  await pageEspoirs.click('#btnJouerMatchClub');
  await pageEspoirs.waitForFunction(
    () => document.getElementById('panneauClub').classList.contains('visible')
      && !document.getElementById('btnJouerMatchClub').disabled,
    { timeout: 60000 }
  ).catch(() => {});
  await pageEspoirs.waitForTimeout(400);
  const messagesEspoirs = await pageEspoirs.evaluate(() =>
    JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.messages.filter((m) => m.categorie === 'jeunes' && m.titre === 'Match espoirs'));
  verifier('match espoirs : un vrai match espoirs se joue à la journée déclencheuse (message réel avec un score)',
    messagesEspoirs.length === 1 && /\d+ - \d+/.test(messagesEspoirs[0].corps));
  await contexteEspoirs.close();

  // 11b) Équipe gérée (TODO_AUDIT.md P1-18) : le premier XV, l'Équipe B et
  // les Espoirs sont désormais gérés par les MÊMES écrans Composition/
  // Tactique (sélecteur d'équipe). Preuve que ce n'est pas qu'un affichage :
  // un choix manuel fait dans l'écran Composition (équipe "Espoirs") est
  // RÉELLEMENT celui utilisé au coup d'envoi du match espoirs — injecte un
  // 2e candidat au poste DM (n°9) pour pouvoir distinguer sans ambiguïté le
  // choix manuel de l'auto-complétion.
  const contexteEG = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageEG = await contexteEG.newPage();
  await pageEG.goto(`${URL_BASE}/index.html`, { waitUntil: 'networkidle' });
  await pageEG.click('#btnAccueilModeClub');
  await pageEG.fill('#inputNomClub', 'Test Équipe Gérée');
  await pageEG.click('#btnCreerClub');
  await pageEG.waitForTimeout(300);
  const periodeEG = await pageEG.evaluate(() => window.RMClub && window.RMClub.PERIODE_JOURNEES_ESPOIRS);
  const idDoublonDM = await pageEG.evaluate((periode) => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    for (const f of s.calendrier) {
      if (f.journee < periode) { f.joue = true; f.score = { domicile: 20, exterieur: 15 }; }
    }
    // cf. remarque du test précédent : Équipe B avancée elle aussi, et date
    // positionnée au mercredi du match espoirs (calendrier daté, P1-21).
    for (const f of s.competitionB.calendrier) {
      if (f.journee < periode) { f.joue = true; f.score = { domicile: 18, exterieur: 12 }; }
    }
    s.temps = Object.assign({}, s.temps, window.RMClub.dateDeJournee(s.numero, periode, 'jeunes'));
    const dmExistant = s.clubJoueur.jeunes.find((j) => j.poste === 'DM');
    const doublon = Object.assign({}, dmExistant, { id: 'jeuneDoublonDM', nom: 'Doublon Test DM', vitesse: 1, plaquage: 1 });
    s.clubJoueur.jeunes.push(doublon);
    localStorage.setItem('rugbyManager.club.v1', JSON.stringify(s));
    return doublon.id;
  }, periodeEG);
  await pageEG.reload({ waitUntil: 'networkidle' });
  await pageEG.waitForTimeout(200);
  await pageEG.click('#btnContinuerClub');
  await pageEG.waitForTimeout(300);
  await pageEG.click('[data-onglet="composition"]');
  await pageEG.waitForTimeout(200);
  await pageEG.selectOption('#selEquipeContexte', 'jeunes');
  await pageEG.waitForTimeout(250);
  await pageEG.selectOption('#clubTerrain select[data-numero="9"]', idDoublonDM);
  await pageEG.waitForTimeout(200);
  const compoApresChoix = await pageEG.evaluate(() =>
    JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.compositionsSecondaires.jeunes.compositionTitulaires['9']);
  verifier('équipe gérée : choisir un joueur dans le terrain Composition (équipe Espoirs) persiste bien dans le slot dédié',
    compoApresChoix === idDoublonDM);
  await pageEG.click('[data-onglet="dashboard"]');
  await pageEG.waitForTimeout(200);
  await pageEG.click('#btnJouerMatchClub');
  await pageEG.waitForFunction(
    () => document.getElementById('panneauClub').classList.contains('visible')
      && !document.getElementById('btnJouerMatchClub').disabled,
    { timeout: 60000 }
  ).catch(() => {});
  await pageEG.waitForTimeout(400);
  // Note : on ne vérifie PAS que "l'autre DM" n'a joué aucun match ce
  // jour-là — il reste un candidat valide pour l'Équipe B (qui pioche aussi
  // dans les Espoirs, cf. effectifDisponiblePourEquipeB) et sa propre
  // journée s'est jouée en même temps, sans rapport avec ce test. Seule
  // preuve recherchée ici : le joueur explicitement choisi dans l'écran
  // Composition a bien été titularisé au match ESPOIRS lui-même.
  const messagesEspoirsEG = await pageEG.evaluate(() =>
    JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.messages.filter((m) => m.categorie === 'jeunes' && m.titre === 'Match espoirs'));
  const doublonAJoue = await pageEG.evaluate((idDoublon) => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    const doublon = s.clubJoueur.jeunes.find((j) => j.id === idDoublon);
    return doublon && doublon.matchsJoues === 1;
  }, idDoublonDM);
  verifier('équipe gérée : le choix manuel fait dans l\'écran Composition (Espoirs) est RÉELLEMENT celui utilisé en match, pas recalculé',
    messagesEspoirsEG.length === 1 && doublonAJoue);
  await contexteEG.close();

  // 11c) ÉCRANS UNIQUES (TODO_AUDIT.md P1-19) — le cœur de la refonte : les
  // 6 écrans de gestion d'équipe (composition, effectif, entraînement,
  // tactique, calendrier/classement, personnel) doivent être LES MÊMES pour
  // les 4 types d'équipe (premier XV, Équipe B, Espoirs, club adverse). On
  // le vérifie de la seule façon qui compte vraiment : en parcourant
  // réellement chaque écran avec chaque équipe et en contrôlant que ce sont
  // les mêmes nœuds DOM qui portent le contenu, jamais des écrans parallèles.
  const contexteUnif = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageUnif = await contexteUnif.newPage();
  const erreursUnif = [];
  pageUnif.on('pageerror', (e) => erreursUnif.push(`PAGEERROR: ${e.message}`));
  pageUnif.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) erreursUnif.push(`CONSOLE: ${m.text()}`); });
  await pageUnif.goto(`${URL_BASE}/index.html`, { waitUntil: 'networkidle' });
  await pageUnif.click('#btnAccueilModeClub');
  await pageUnif.fill('#inputNomClub', 'Test Écrans Uniques');
  await pageUnif.click('#btnCreerClub');
  await pageUnif.waitForTimeout(300);
  // Budget confortable : rend l'Équipe B éligible de façon déterministe.
  await pageUnif.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    s.clubJoueur.budget = 5000;
    s.competitionB = null;
    localStorage.setItem('rugbyManager.club.v1', JSON.stringify(s));
  });
  await pageUnif.reload({ waitUntil: 'networkidle' });
  await pageUnif.waitForTimeout(200);
  await pageUnif.click('#btnContinuerClub');
  await pageUnif.waitForTimeout(300);

  const idAdversaireUnif = await pageUnif.evaluate(() =>
    JSON.parse(localStorage.getItem('rugbyManager.club.v1')).adversaires[0].id);

  // --- (a) AUCUN sélecteur de club nulle part (TODO_AUDIT.md P1-20) -------
  const inventaireSelects = await pageUnif.evaluate(() => {
    const noms = [];
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    noms.push(s.clubJoueur.nom);
    for (const a of s.adversaires) noms.push(a.nom);
    const fautifs = [];
    for (const sel of document.querySelectorAll('#clubGestion select')) {
      for (const opt of sel.options) {
        if (noms.some((n) => opt.text.includes(n))) fautifs.push(sel.id + ' → ' + opt.text);
      }
    }
    return { fautifs, valeursEquipe: Array.from(document.getElementById('selEquipeContexte').options).map((o) => o.value) };
  });
  verifier('navigation : AUCUN menu déroulant du Mode Club ne contient de nom de club',
    inventaireSelects.fautifs.length === 0);
  if (inventaireSelects.fautifs.length) console.error(inventaireSelects.fautifs.join('\n'));
  verifier('navigation : le sélecteur d\'équipe ne contient que des équipes ("pro"/"b"/"jeunes"), jamais un club encodé',
    inventaireSelects.valeursEquipe.every((v) => ['pro', 'b', 'jeunes'].indexOf(v) !== -1));

  // --- (b) Tous les noms de clubs sont cliquables, partout ---------------
  const ECRANS_AVEC_NOMS = [
    { onglet: 'dashboard', zone: '#clubProchainMatch', nom: 'prochain match' },
    { onglet: 'dashboard', zone: '#clubMiniClassement', nom: 'classement du tableau de bord' },
    { onglet: 'calendrier', zone: '#clubClassement', nom: 'classement' },
    { onglet: 'calendrier', zone: '#clubCalendrier', nom: 'calendrier' },
    { onglet: 'autresclubs', zone: '#clubAutresClubsListe', nom: 'liste des autres clubs' },
  ];
  let tousNomsCliquables = true;
  for (const e of ECRANS_AVEC_NOMS) {
    await pageUnif.click(`.ongletBtn[data-onglet="${e.onglet}"]`);
    await pageUnif.waitForTimeout(150);
    const n = await pageUnif.evaluate((z) => document.querySelectorAll(`${z} .lienClub`).length, e.zone);
    if (n === 0) { tousNomsCliquables = false; console.error(`aucun nom de club cliquable dans ${e.nom} (${e.zone})`); }
  }
  verifier('navigation : les noms de clubs sont cliquables partout où ils apparaissent (calendrier, classement, prochain match, liste des clubs)',
    tousNomsCliquables);

  // --- (c) Le parcours exigé : travailler sur une équipe, cliquer un nom,
  // revenir — le club, l'équipe ET l'écran doivent être restaurés. ---------
  await pageUnif.click('.ongletBtn[data-onglet="tactique"]');
  await pageUnif.waitForTimeout(150);
  await pageUnif.selectOption('#selEquipeContexte', 'b');
  await pageUnif.waitForTimeout(250);
  await pageUnif.click('.ongletBtn[data-onglet="calendrier"]');
  await pageUnif.waitForTimeout(200);
  const cibleClic = await pageUnif.evaluate(() => {
    const monClub = JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.id;
    const lien = Array.from(document.querySelectorAll('#clubCalendrier .lienClub')).find((l) => l.dataset.club !== monClub);
    return lien ? { id: lien.dataset.club, nom: lien.textContent } : null;
  });
  await pageUnif.evaluate((id) => document.querySelector(`#clubCalendrier .lienClub[data-club="${id}"]`).click(), cibleClic.id);
  await pageUnif.waitForTimeout(400);
  const ouvert = await pageUnif.evaluate(() => ({
    onglet: Array.from(document.querySelectorAll('#clubGestion .voletOnglet')).filter((v) => v.style.display !== 'none').map((v) => v.dataset.volet),
    entete: document.getElementById('clubEntete').innerText,
    retour: !!document.getElementById('btnRetourMonClub'),
    equipe: document.getElementById('selEquipeContexte').value,
    optionsEquipe: Array.from(document.getElementById('selEquipeContexte').options).map((o) => o.value),
    menu: Array.from(document.querySelectorAll('#barreOngletsClub .ongletBtn')).filter((b) => b.style.display !== 'none').map((b) => b.dataset.onglet),
    postes: document.querySelectorAll('#clubTerrain .chipTerrain').length,
    clubConsulte: JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.navigationClub.clubConsulteId,
  }));
  verifier('navigation : cliquer le nom d\'un club dans le calendrier ouvre CE club immédiatement',
    ouvert.clubConsulte === cibleClic.id);
  verifier('navigation : l\'ouverture affiche directement l\'écran Composition de son équipe première',
    ouvert.onglet.length === 1 && ouvert.onglet[0] === 'composition' && ouvert.equipe === 'pro' && ouvert.postes === 15);
  verifier('navigation : le nom du club ouvert apparaît en haut à gauche, marqué "Club consulté"',
    ouvert.entete.includes(cibleClic.nom) && ouvert.entete.includes('Club consulté'));
  verifier('navigation : le bouton "← Retour à mon club" apparaît pour un club consulté', ouvert.retour);
  verifier('navigation : le sélecteur ne propose alors QUE les équipes réellement disponibles pour ce club',
    ouvert.optionsEquipe.length === 1 && ouvert.optionsEquipe[0] === 'pro');
  verifier('navigation : le menu d\'un club consulté ne contient NI Tactique, NI Entraînement, NI Médical, NI Recrutement (absents, pas grisés)',
    ['tactique', 'entrainement', 'medical', 'transferts', 'finances', 'stats'].every((o) => ouvert.menu.indexOf(o) === -1));
  verifier('navigation : le menu d\'un club consulté garde bien Vue d\'ensemble, Effectif, Composition, Calendrier et Personnel',
    ['dashboard', 'effectif', 'composition', 'calendrier', 'personnel'].every((o) => ouvert.menu.indexOf(o) !== -1));
  // Un écran interdit ne doit pas non plus être atteignable par un autre chemin.
  await pageUnif.evaluate(() => {
    const b = document.querySelector('.ongletBtn[data-onglet="tactique"]');
    if (b) { b.style.display = ''; b.click(); }
  });
  await pageUnif.waitForTimeout(250);
  verifier('navigation : forcer l\'ouverture d\'un écran de gestion sur un club consulté retombe sur sa vue d\'ensemble',
    await pageUnif.evaluate(() => document.querySelector('.voletOnglet[data-volet="tactique"]').style.display === 'none'));

  await pageUnif.click('#btnRetourMonClub');
  await pageUnif.waitForTimeout(400);
  const revenu = await pageUnif.evaluate(() => ({
    onglet: Array.from(document.querySelectorAll('#clubGestion .voletOnglet')).filter((v) => v.style.display !== 'none').map((v) => v.dataset.volet),
    entete: document.getElementById('clubEntete').innerText,
    retour: !!document.getElementById('btnRetourMonClub'),
    equipe: document.getElementById('selEquipeContexte').value,
    menu: Array.from(document.querySelectorAll('#barreOngletsClub .ongletBtn')).filter((b) => b.style.display !== 'none').map((b) => b.dataset.onglet),
  }));
  verifier('navigation : "Retour à mon club" restaure le club du joueur (et fait disparaître le bouton)',
    revenu.entete.includes('Mon club') && !revenu.retour);
  verifier('navigation : "Retour à mon club" restaure l\'ÉQUIPE sur laquelle le joueur travaillait (Équipe B)',
    revenu.equipe === 'b');
  verifier('navigation : "Retour à mon club" restaure l\'ÉCRAN d\'où le joueur venait',
    revenu.onglet.length === 1 && revenu.onglet[0] === 'calendrier');
  verifier('navigation : le menu complet de gestion revient sur son propre club',
    ['tactique', 'entrainement', 'medical', 'transferts', 'finances'].every((o) => revenu.menu.indexOf(o) !== -1));

  // --- (d) Les MÊMES composants servent les deux cas ---------------------
  // Un club consulté et le club du joueur passent par les mêmes nœuds DOM
  // d'Effectif et de Composition — la seule différence est modifiable ou non.
  const ECRANS_COMMUNS = [
    { onglet: 'effectif', nœud: '#clubEffectif' },
    { onglet: 'composition', nœud: '#clubTerrain' },
  ];
  let memesComposants = true;
  for (const cas of [{ club: null, modifiable: true }, { club: idAdversaireUnif, modifiable: false }]) {
    if (cas.club) {
      await pageUnif.click('.ongletBtn[data-onglet="autresclubs"]');
      await pageUnif.waitForTimeout(150);
      await pageUnif.evaluate((id) => document.querySelector(`#clubAutresClubsListe .lienClub[data-club="${id}"]`).click(), cas.club);
      await pageUnif.waitForTimeout(350);
    }
    for (const e of ECRANS_COMMUNS) {
      await pageUnif.click(`.ongletBtn[data-onglet="${e.onglet}"]`);
      await pageUnif.waitForTimeout(200);
      const etat = await pageUnif.evaluate((args) => {
        const volet = document.querySelector(`.voletOnglet[data-volet="${args.onglet}"]`);
        const nœud = document.querySelector(args.nœud);
        return {
          dansVolet: !!(nœud && volet && volet.contains(nœud)),
          contenu: nœud ? (nœud.innerText || '').trim().length : 0,
          modifiable: !!document.querySelector('#contexteEquipeInfo .badgeEquipeMode.dirigee'),
        };
      }, { onglet: e.onglet, nœud: e.nœud });
      if (!etat.dansVolet || etat.contenu < 15 || etat.modifiable !== cas.modifiable) memesComposants = false;
    }
  }
  verifier('navigation : les écrans Effectif et Composition sont les MÊMES composants pour son club et pour un club consulté (seul le droit de modifier change)',
    memesComposants);
  await pageUnif.click('#btnRetourMonClub');
  await pageUnif.waitForTimeout(300);

  // --- (e) Les 3 équipes du club du joueur restent gérables normalement --
  let equipesJoueurOk = true;
  for (const equipe of ['pro', 'b', 'jeunes']) {
    await pageUnif.click('.ongletBtn[data-onglet="composition"]');
    await pageUnif.waitForTimeout(150);
    await pageUnif.selectOption('#selEquipeContexte', equipe);
    await pageUnif.waitForTimeout(250);
    const etat = await pageUnif.evaluate(() => ({
      postes: document.querySelectorAll('#clubTerrain .chipTerrain').length,
      modifiable: !!document.querySelector('#contexteEquipeInfo .badgeEquipeMode.dirigee'),
      desactives: document.querySelectorAll('#clubTerrain select[disabled]').length,
    }));
    if (etat.postes !== 15 || !etat.modifiable || etat.desactives !== 0) equipesJoueurOk = false;
  }
  verifier('navigation : les 3 équipes du club du joueur (première, B, espoirs) restent pleinement modifiables',
    equipesJoueurOk);

  verifier('navigation : aucune erreur console pendant tout le parcours de navigation entre clubs et équipes',
    erreursUnif.length === 0);
  if (erreursUnif.length) console.error(erreursUnif.join('\n'));
  await contexteUnif.close();

  // 11d) CARRIÈRE CALENDAIRE (TODO_AUDIT.md P1-21, tranche 1) : le jeu avance
  // désormais jour par jour jusqu'à la prochaine échéance, et un match ne se
  // joue QUE lorsque la date du calendrier atteint sa date prévue.
  const contexteTemps = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageTemps = await contexteTemps.newPage();
  const erreursTemps = [];
  pageTemps.on('pageerror', (e) => erreursTemps.push(`PAGEERROR: ${e.message}`));
  pageTemps.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) erreursTemps.push(`CONSOLE: ${m.text()}`); });
  await pageTemps.goto(`${URL_BASE}/index.html`, { waitUntil: 'networkidle' });
  await pageTemps.click('#btnAccueilModeClub');
  await pageTemps.fill('#inputNomClub', 'Test Carrière Datée');
  await pageTemps.click('#btnCreerClub');
  await pageTemps.waitForTimeout(400);
  await pageTemps.selectOption('#selDureeClub', '300'); // démo courte : le parcours reste rapide

  const etatInitial = await pageTemps.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    return {
      version: s.version, versionAttendue: window.RMClub.VERSION_SAUVEGARDE, temps: s.temps, graine: s.graine,
      dates: s.calendrier.map((f) => f.date),
      datesB: s.competitionB.calendrier.map((f) => f.date),
      joues: s.calendrier.filter((f) => f.joue).length,
      barre: document.getElementById('clubTopBarInfos').innerText,
      bouton: document.getElementById('btnJouerMatchClub').textContent,
    };
  });
  verifier('carrière datée : la saison porte une vraie date persistée (jour/mois/année) et une graine',
    etatInitial.version === etatInitial.versionAttendue && Number.isFinite(etatInitial.temps.annee)
    && Number.isFinite(etatInitial.temps.mois) && Number.isFinite(etatInitial.temps.jour)
    && Number.isFinite(etatInitial.graine));
  verifier('carrière datée : toutes les rencontres (championnat ET Équipe B) portent une vraie date',
    etatInitial.dates.length > 0 && etatInitial.dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    && etatInitial.datesB.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)));
  verifier('carrière datée : la date du jour est affichée en clair dans la barre supérieure',
    /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/i.test(etatInitial.barre)
    && /\b20\d\d\b/.test(etatInitial.barre));
  verifier('carrière datée : le bouton principal annonce la prochaine échéance datée (« Continuer jusqu\'au … »)',
    /Continuer jusqu'au /.test(etatInitial.bouton));
  verifier('carrière datée : AUCUN match n\'est joué tant que la date de la 1re journée n\'est pas atteinte',
    etatInitial.joues === 0);

  // Double clic RÉEL sur « Continuer » : la date ne doit avancer qu'une fois,
  // et surtout aucun match ne doit être lancé deux fois.
  await pageTemps.evaluate(() => {
    const b = () => document.getElementById('btnJouerMatchClub');
    if (b()) b().click();
    if (b()) b().click();
  });
  await pageTemps.waitForTimeout(700);
  const apresDoubleClicContinuer = await pageTemps.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    return {
      temps: s.temps, joues: s.calendrier.filter((f) => f.joue).length,
      apercu: document.getElementById('panneauApercuMatch').classList.contains('visible'),
      dateJ1: s.calendrier.find((f) => f.journee === 1).date,
    };
  });
  verifier('carrière datée : « Continuer » avance jusqu\'à la date de la 1re journée, sans la dépasser',
    `${apresDoubleClicContinuer.temps.annee}-${String(apresDoubleClicContinuer.temps.mois).padStart(2, '0')}-${String(apresDoubleClicContinuer.temps.jour).padStart(2, '0')}`
    === apresDoubleClicContinuer.dateJ1);
  verifier('carrière datée : double clic sur « Continuer » ne provoque aucune double progression ni double simulation',
    apresDoubleClicContinuer.joues === 0 && apresDoubleClicContinuer.apercu);

  // Rechargement de page : la date ne doit pas être perdue.
  await pageTemps.reload({ waitUntil: 'networkidle' });
  await pageTemps.waitForTimeout(250);
  await pageTemps.click('#btnContinuerClub');
  await pageTemps.waitForTimeout(400);
  const apresRechargement = await pageTemps.evaluate(() => JSON.parse(localStorage.getItem('rugbyManager.club.v1')).temps);
  verifier('carrière datée : la date survit à un rechargement de page (F5), sans perte',
    apresRechargement.annee === apresDoubleClicContinuer.temps.annee
    && apresRechargement.mois === apresDoubleClicContinuer.temps.mois
    && apresRechargement.jour === apresDoubleClicContinuer.temps.jour);

  // Le match se joue à SA date, et une seule fois.
  const mondeAvant = await pageTemps.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    const div = s.monde ? Object.values(s.monde.divisions)[0] : null;
    return {
      monde: div ? div.calendrier.filter((f) => f.joue).length : null,
      paliers: s.autresDivisionsFrance
        ? Object.values(s.autresDivisionsFrance.divisions)[0].calendrier.filter((f) => f.joue).length : null,
    };
  });
  await pageTemps.click('#btnJouerMatchClub'); // rouvre l'aperçu (idempotent : le match n'est pas sauté)
  await pageTemps.waitForSelector('#panneauApercuMatch.visible', { timeout: 8000 });
  await pageTemps.click('#btnApercuLancerMatch');
  await pageTemps.waitForSelector('#panneauResultat.visible', { timeout: 60000 });
  await pageTemps.click('#btnResultatFermer');
  await pageTemps.waitForTimeout(500);
  const apresMatch = await pageTemps.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    const div = s.monde ? Object.values(s.monde.divisions)[0] : null;
    const j1 = s.calendrier.filter((f) => f.journee === 1);
    return {
      joueesJ1: j1.filter((f) => f.joue).length, totalJ1: j1.length,
      joueesApresJ1: s.calendrier.filter((f) => f.journee > 1 && f.joue).length,
      bJoues: s.competitionB.calendrier.filter((f) => f.joue).length,
      monde: div ? div.calendrier.filter((f) => f.joue).length : null,
      paliers: s.autresDivisionsFrance
        ? Object.values(s.autresDivisionsFrance.divisions)[0].calendrier.filter((f) => f.joue).length : null,
    };
  });
  verifier('carrière datée : exactement la journée du jour est jouée à sa date (toutes ses rencontres, aucune autre)',
    apresMatch.joueesJ1 === apresMatch.totalJ1 && apresMatch.joueesApresJ1 === 0);
  verifier('carrière datée : aucune rencontre d\'une journée ULTÉRIEURE n\'est jouée avant sa date',
    apresMatch.joueesApresJ1 === 0 && apresMatch.bJoues === 0);
  // Le monde et les autres paliers avancent sans dépendre de l'ouverture de
  // leur écran (l'onglet Monde n'a jamais été ouvert dans ce parcours).
  verifier('carrière datée : le monde avance sans qu\'on ait jamais ouvert son écran',
    apresMatch.monde != null && (mondeAvant.monde == null || apresMatch.monde > mondeAvant.monde));
  verifier('carrière datée : les autres paliers de la pyramide avancent aussi, sans ouverture d\'écran',
    apresMatch.paliers != null && apresMatch.paliers > 0);

  // Première équipe, Équipe B et espoirs restent synchronisés sur la même
  // semaine sportive, chacun à son jour.
  const semaine = await pageTemps.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    const RM = window.RMClub;
    const pro = RM.dateDeJournee(s.numero, 4, 'pro');
    return {
      pro: RM.jourSemaine(pro),
      b: RM.jourSemaine(RM.dateDeJournee(s.numero, 4, 'b')),
      jeunes: RM.jourSemaine(RM.dateDeJournee(s.numero, 4, 'jeunes')),
      ecartB: RM.ecartJours(pro, RM.dateDeJournee(s.numero, 4, 'b')),
      ecartJeunes: RM.ecartJours(pro, RM.dateDeJournee(s.numero, 4, 'jeunes')),
    };
  });
  verifier('carrière datée : première équipe (samedi), Équipe B (dimanche) et espoirs (mercredi) restent synchronisés sur la même semaine',
    semaine.pro === 6 && semaine.b === 0 && semaine.jeunes === 3
    && semaine.ecartB === 1 && semaine.ecartJeunes === -3);
  verifier('carrière datée : aucune erreur console pendant tout le parcours calendaire',
    erreursTemps.length === 0);
  if (erreursTemps.length) console.error(erreursTemps.join('\n'));
  await contexteTemps.close();

  // 11d-bis) ÉVÉNEMENTS QUOTIDIENS (TODO_AUDIT.md P1-22, tranche 2) : les
  // jours traversés par « Continuer » sont réellement simulés — la fatigue
  // baisse, les blessures se résorbent, les prêts arrivent à terme — et
  // chaque événement affiché correspond à un changement vérifiable dans la
  // sauvegarde. Aucune carte décorative.
  const contexteJours = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageJours = await contexteJours.newPage();
  const erreursJours = [];
  pageJours.on('pageerror', (e) => erreursJours.push(`PAGEERROR: ${e.message}`));
  pageJours.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) erreursJours.push(`CONSOLE: ${m.text()}`); });
  await pageJours.goto(`${URL_BASE}/index.html`, { waitUntil: 'networkidle' });
  await pageJours.click('#btnAccueilModeClub');
  await pageJours.fill('#inputNomClub', 'Test Jours');
  await pageJours.click('#btnCreerClub');
  await pageJours.waitForTimeout(400);

  // Agenda des 7 prochains jours : dérivé du calendrier réel.
  const agenda = await pageJours.evaluate(() => {
    const lignes = Array.from(document.querySelectorAll('#clubAgenda .ligneAgenda'));
    return {
      nb: lignes.length,
      premiereEstAujourdhui: lignes.length > 0 && lignes[0].classList.contains('aujourdhui'),
      dates: lignes.map((l) => l.querySelector('.dateAgenda').textContent.trim()),
    };
  });
  verifier('événements quotidiens : le tableau de bord affiche l\'agenda des 7 prochains jours',
    agenda.nb === 7 && agenda.premiereEstAujourdhui);
  verifier('événements quotidiens : l\'agenda affiche 7 jours consécutifs distincts (pas une liste répétée)',
    new Set(agenda.dates).size === 7);

  // Prépare un état vérifiable : effectif fatigué, un blessé, un prêté.
  const etatAvantJours = await pageJours.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    for (const j of s.clubJoueur.effectif) j.fatigue = 70;
    s.clubJoueur.effectif[0].blessureJournees = 5;
    s.clubJoueur.effectif[1].pret = { dureeRestante: 4 };
    localStorage.setItem('rugbyManager.club.v1', JSON.stringify(s));
    return {
      fatigueMoyenne: 70,
      nomBlesse: s.clubJoueur.effectif[0].nom,
      nomPrete: s.clubJoueur.effectif[1].nom,
      messages: s.clubJoueur.messages.length,
    };
  });
  await pageJours.reload({ waitUntil: 'networkidle' });
  await pageJours.waitForTimeout(200);
  await pageJours.click('#btnContinuerClub');
  await pageJours.waitForTimeout(300);
  // L'onglet Médical doit exprimer l'indisponibilité en JOURS, avec une date
  // de retour réelle — plus en « journées » de championnat.
  await clicOngletSur(pageJours, 'medical');
  await pageJours.waitForTimeout(200);
  const texteMedical = await pageJours.textContent('#clubMedical');
  verifier('événements quotidiens : l\'onglet Médical exprime l\'indisponibilité en jours, avec une date de retour réelle',
    /Retour dans \d+ jour\(s\)/.test(texteMedical)
    && /\b(lun|mar|mer|jeu|ven|sam|dim)\./i.test(texteMedical));

  await clicOngletSur(pageJours, 'dashboard');
  await pageJours.waitForTimeout(200);
  await pageJours.click('#btnJouerMatchClub'); // avance de l'intersaison jusqu'au 1er match
  await pageJours.waitForTimeout(900);
  const apresJours = await pageJours.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    return {
      fatigueMax: Math.max.apply(null, s.clubJoueur.effectif.map((j) => j.fatigue || 0)),
      blesse: s.clubJoueur.effectif[0].blessureJournees,
      pret: s.clubJoueur.effectif[1].pret,
      messages: s.clubJoueur.messages.map((m) => m.titre + '|' + m.corps),
      joues: s.calendrier.filter((f) => f.joue).length,
    };
  });
  verifier('événements quotidiens : les jours écoulés font RÉELLEMENT baisser la fatigue de l\'effectif',
    apresJours.fatigueMax < etatAvantJours.fatigueMoyenne);
  verifier('événements quotidiens : une blessure se résorbe pendant les jours écoulés (pas seulement au match)',
    apresJours.blesse === 0 && apresJours.joues === 0);
  verifier('événements quotidiens : le retour de blessure produit un message RÉEL dans la boîte de réception',
    apresJours.messages.some((m) => m.startsWith('Retour de blessure|') && m.includes(etatAvantJours.nomBlesse)));
  verifier('événements quotidiens : un prêt arrive à terme au fil des jours et le joueur réintègre le groupe',
    apresJours.pret === null
    && apresJours.messages.some((m) => m.startsWith('Fin de prêt|') && m.includes(etatAvantJours.nomPrete)));
  verifier('événements quotidiens : aucune erreur console pendant le parcours quotidien',
    erreursJours.length === 0);
  if (erreursJours.length) console.error(erreursJours.join('\n'));
  await contexteJours.close();

  // 11d-ter) SEMAINE D'ENTRAÎNEMENT, SCOUTING DIFFÉRÉ ET DÉCISIONS DATÉES
  // (TODO_AUDIT.md P1-23, tranche 3).
  const contexteSemaine = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageSemaine = await contexteSemaine.newPage();
  const erreursSemaine = [];
  pageSemaine.on('pageerror', (e) => erreursSemaine.push(`PAGEERROR: ${e.message}`));
  pageSemaine.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) erreursSemaine.push(`CONSOLE: ${m.text()}`); });
  await pageSemaine.goto(`${URL_BASE}/index.html`, { waitUntil: 'networkidle' });
  await pageSemaine.click('#btnAccueilModeClub');
  await pageSemaine.fill('#inputNomClub', 'Test Semaine');
  await pageSemaine.click('#btnCreerClub');
  await pageSemaine.waitForTimeout(400);

  await clicOngletSur(pageSemaine, 'entrainement');
  await pageSemaine.waitForTimeout(250);
  const semaineUI = await pageSemaine.evaluate(() => {
    const lignes = Array.from(document.querySelectorAll('#clubSemaineEntrainement .ligneSeance'));
    return {
      nb: lignes.length,
      jours: lignes.map((l) => l.querySelector('.jourSeance').textContent.trim().toLowerCase()),
      activites: Array.from(document.querySelectorAll('#clubSemaineEntrainement select')).map((s2) => s2.value),
      unJourMarque: lignes.some((l) => l.classList.contains('aujourdhui')),
    };
  });
  verifier('semaine d\'entraînement : les 7 jours de la semaine sont affichés, une séance chacun',
    semaineUI.nb === 7 && semaineUI.activites.length === 7 && semaineUI.activites.every(Boolean));
  verifier('semaine d\'entraînement : les 7 jours sont bien distincts (du lundi au dimanche)',
    new Set(semaineUI.jours.map((j) => j.split(' ')[0])).size === 7);
  verifier('semaine d\'entraînement : le jour courant est mis en évidence', semaineUI.unJourMarque);

  // Modifier une séance persiste réellement.
  await pageSemaine.selectOption('#clubSemaineEntrainement select[data-jour="2"]', 'melee');
  await pageSemaine.waitForTimeout(250);
  verifier('semaine d\'entraînement : changer une séance est réellement persisté dans la sauvegarde',
    await pageSemaine.evaluate(() =>
      JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.semaineEntrainement['2'] === 'melee'));

  // Une semaine tout en physique doit RÉELLEMENT fatiguer, contrairement à
  // une semaine tout en repos : c'est l'arbitrage au cœur de la semaine.
  const mesurerSemaine = async (activite) => pageSemaine.evaluate((act) => {
    const K = 'rugbyManager.club.v1';
    const s = JSON.parse(localStorage.getItem(K));
    for (let j = 0; j <= 6; j++) s.clubJoueur.semaineEntrainement[j] = act;
    for (const j of s.clubJoueur.effectif) { j.fatigue = 0; j.blessureJournees = 0; }
    localStorage.setItem(K, JSON.stringify(s));
    const saison = JSON.parse(localStorage.getItem(K));
    const RM = window.RMClub;
    RM.avancerJusquA(saison, RM.ajouterJours(RM.dateCourante(saison), 7));
    return Math.max.apply(null, saison.clubJoueur.effectif.map((j) => j.fatigue || 0));
  }, activite);
  const fatiguePhysique = await mesurerSemaine('physique');
  const fatigueRepos = await mesurerSemaine('repos');
  verifier('semaine d\'entraînement : une semaine intense fatigue réellement, une semaine de repos non',
    fatiguePhysique > fatigueRepos && fatigueRepos === 0);

  // Scouting DIFFÉRÉ : la connaissance ne bouge pas à la commande.
  await clicOngletSur(pageSemaine, 'transferts');
  await pageSemaine.waitForTimeout(250);
  const avantScout = await pageSemaine.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    const bouton = document.querySelector('.btnScouter');
    const id = bouton ? bouton.dataset.joueur : null;
    const j = s.marche.find((x) => x.id === id);
    return { id, connaissance: j ? j.connaissance : null, budget: s.clubJoueur.budget };
  });
  if (avantScout.id) {
    await pageSemaine.click(`.btnScouter[data-joueur="${avantScout.id}"]`);
    await pageSemaine.waitForTimeout(350);
    const apresCommande = await pageSemaine.evaluate((id) => {
      const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
      const j = s.marche.find((x) => x.id === id);
      return {
        connaissance: j.connaissance, budget: s.clubJoueur.budget,
        rapports: (s.rapportsScouting || []).length,
        badge: !!document.querySelector('.rapportEnCours'),
      };
    }, avantScout.id);
    verifier('scouting différé : commander un rapport engage le budget MAIS ne change pas encore la connaissance',
      apresCommande.budget < avantScout.budget && apresCommande.connaissance === avantScout.connaissance
      && apresCommande.rapports === 1);
    verifier('scouting différé : le marché signale qu\'un rapport est en cours (avec sa date de remise)',
      apresCommande.badge);
    // Puis on laisse passer les jours : le rapport arrive.
    await clicOngletSur(pageSemaine, 'dashboard');
    await pageSemaine.waitForTimeout(200);
    await pageSemaine.click('#btnJouerMatchClub');
    await pageSemaine.waitForTimeout(1000);
    const apresRemise = await pageSemaine.evaluate((id) => {
      const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
      const j = s.marche.find((x) => x.id === id);
      return {
        connaissance: j ? j.connaissance : null,
        rapports: (s.rapportsScouting || []).length,
        message: s.clubJoueur.messages.some((m) => m.titre === 'Rapport de scouting'),
      };
    }, avantScout.id);
    verifier('scouting différé : à sa date, le rapport augmente RÉELLEMENT la connaissance et produit un message',
      apresRemise.connaissance > avantScout.connaissance && apresRemise.rapports === 0 && apresRemise.message);
  }

  // Décision DATÉE : l'échéance est affichée, et le silence vaut refus.
  const decision = await pageSemaine.evaluate(() => {
    const K = 'rugbyManager.club.v1';
    const s = JSON.parse(localStorage.getItem(K));
    const RM = window.RMClub;
    const j = s.clubJoueur.effectif[0];
    j.moral = 70;
    j.demandeTempsDeJeuEnAttente = true;
    RM.ajouterMessage(s, 'joueur', 'Demande de temps de jeu', `${j.nom} veut jouer.`, {
      type: 'tempsDeJeu', joueurId: j.id, resolu: false,
      // Échéance au lendemain : le prochain jour réellement traversé la
      // franchit, quel que soit l'endroit du calendrier où l'on se trouve.
      dateLimite: RM.dateISO(RM.ajouterJours(RM.dateCourante(s), 1)),
      options: [{ id: 'rassurer', libelle: 'Le rassurer' }, { id: 'ignorer', libelle: 'Ignorer sa demande' }],
    });
    localStorage.setItem(K, JSON.stringify(s));
    return { nom: j.nom, moral: j.moral };
  });
  await pageSemaine.reload({ waitUntil: 'networkidle' });
  await pageSemaine.waitForTimeout(250);
  await pageSemaine.click('#btnContinuerClub');
  await pageSemaine.waitForTimeout(350);
  verifier('décisions datées : l\'échéance de réponse est affichée dans la boîte de réception',
    (await pageSemaine.textContent('#clubMessages')).includes('Réponse attendue avant le'));
  // On se trouve peut-être déjà SUR un jour de match (« Continuer » y reste,
  // par idempotence) : on le joue d'abord, puis on avance réellement d'un
  // jour de plus pour franchir l'échéance.
  await pageSemaine.evaluate(() => { document.getElementById('selDureeClub').value = '300'; });
  await pageSemaine.click('#btnJouerMatchClub');
  const apercuOuvertDecision = await pageSemaine.waitForSelector('#panneauApercuMatch.visible', { timeout: 5000 })
    .then(() => true).catch(() => false);
  if (apercuOuvertDecision) {
    await pageSemaine.click('#btnApercuLancerMatch');
    await pageSemaine.waitForSelector('#panneauResultat.visible', { timeout: 60000 });
    await pageSemaine.click('#btnResultatFermer');
  }
  await pageSemaine.waitForFunction(
    () => document.getElementById('panneauClub').classList.contains('visible')
      && !document.getElementById('btnJouerMatchClub').disabled,
    { timeout: 90000 }
  ).catch(() => {});
  await pageSemaine.waitForTimeout(300);
  await pageSemaine.click('#btnJouerMatchClub');
  await pageSemaine.waitForFunction(
    () => document.getElementById('panneauClub').classList.contains('visible')
      && !document.getElementById('btnJouerMatchClub').disabled,
    { timeout: 90000 }
  ).catch(() => {});
  await pageSemaine.waitForTimeout(400);
  const apresEcheance = await pageSemaine.evaluate((nom) => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    const j = s.clubJoueur.effectif.find((x) => x.nom === nom);
    const m = s.clubJoueur.messages.find((x) => x.decision && x.decision.type === 'tempsDeJeu');
    return { moral: j ? j.moral : null, resolu: m && m.decision.resolu, expiree: m && !!m.decision.expiree, choix: m && m.decision.choix };
  }, decision.nom);
  verifier('décisions datées : une demande non tranchée à l\'échéance se résout comme un refus (conséquence réelle sur le moral)',
    apresEcheance.resolu && apresEcheance.expiree && apresEcheance.choix === 'ignorer'
    && apresEcheance.moral < decision.moral);
  verifier('semaine d\'entraînement : aucune erreur console sur le parcours entraînement/scouting/décisions',
    erreursSemaine.length === 0);
  if (erreursSemaine.length) console.error(erreursSemaine.join('\n'));
  await contexteSemaine.close();

  // 11e) Même parcours calendaire sur MOBILE : la date et le bouton
  // « Continuer » doivent rester lisibles et utilisables sur petit écran.
  const contexteMobileTemps = await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
  const pageMobileTemps = await contexteMobileTemps.newPage();
  const erreursMobileTemps = [];
  pageMobileTemps.on('pageerror', (e) => erreursMobileTemps.push(`PAGEERROR: ${e.message}`));
  await pageMobileTemps.goto(`${URL_BASE}/index.html`, { waitUntil: 'networkidle' });
  await pageMobileTemps.click('#btnAccueilModeClub');
  await pageMobileTemps.fill('#inputNomClub', 'Test Mobile Daté');
  await pageMobileTemps.click('#btnCreerClub');
  await pageMobileTemps.waitForTimeout(400);
  const mobile = await pageMobileTemps.evaluate(() => {
    const barre = document.getElementById('clubTopBarInfos');
    const chip = barre.querySelector('.chipDate');
    const flottant = document.getElementById('btnApercuMatchFlottant');
    const r = flottant.getBoundingClientRect();
    return {
      dateVisible: !!chip && chip.offsetParent !== null && chip.innerText.trim().length > 5,
      texteFlottant: document.getElementById('btnApercuMatchLabel').textContent,
      flottantDansEcran: r.width > 0 && r.right <= window.innerWidth + 1 && r.top >= 0 && r.bottom <= window.innerHeight + 1,
      debordementHorizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
  verifier('mobile : la date courante est visible dans la barre supérieure sur petit écran', mobile.dateVisible);
  verifier('mobile : le bouton « Continuer » flottant reste entièrement dans l\'écran et annonce sa date',
    mobile.flottantDansEcran && /Continuer|Match/.test(mobile.texteFlottant));
  verifier('mobile : l\'ajout de la date ne provoque aucun débordement horizontal de la page',
    !mobile.debordementHorizontal);
  // Et « Continuer » fonctionne réellement au doigt.
  await pageMobileTemps.tap('#btnApercuMatchFlottant');
  await pageMobileTemps.waitForTimeout(600);
  verifier('mobile : « Continuer » avance bien la date jusqu\'au jour du match (ouverture de sa préparation)',
    await pageMobileTemps.isVisible('#panneauApercuMatch.visible'));
  verifier('mobile : aucune erreur console sur le parcours calendaire mobile', erreursMobileTemps.length === 0);
  await contexteMobileTemps.close();

  // 12) Décision réelle dans la boîte de réception (audit "boîte de réception
  // avec décisions", cf. club-decisions.js) : injecte directement une
  // demande de temps de jeu (le déclenchement — plusieurs journées sans
  // sélection — est déjà couvert par server/test-parcours-club.js) pour
  // vérifier la partie propre au navigateur : de vrais boutons d'action
  // s'affichent (pas juste un texte à marquer comme lu), cliquer "Le
  // rassurer" tranche réellement la décision et se reflète dans la
  // sauvegarde ET l'affichage.
  const contexteDecision = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageDecision = await contexteDecision.newPage();
  await pageDecision.goto(`${URL_BASE}/index.html`, { waitUntil: 'networkidle' });
  await pageDecision.click('#btnAccueilModeClub');
  await pageDecision.fill('#inputNomClub', 'Test Décision');
  await pageDecision.click('#btnCreerClub');
  await pageDecision.waitForTimeout(300);
  await pageDecision.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    const joueur = s.clubJoueur.effectif[0];
    joueur.moral = 50;
    joueur.demandeTempsDeJeuEnAttente = true;
    s.clubJoueur.messages.unshift({
      id: 'msgTestDecision', categorie: 'joueur', titre: 'Demande de temps de jeu',
      corps: `${joueur.nom} veut plus de temps de jeu.`, saisonNumero: 1, lu: false,
      decision: {
        type: 'tempsDeJeu', joueurId: joueur.id, resolu: false,
        options: [{ id: 'rassurer', libelle: 'Le rassurer' }, { id: 'ignorer', libelle: 'Ignorer sa demande' }],
      },
    });
    localStorage.setItem('rugbyManager.club.v1', JSON.stringify(s));
  });
  await pageDecision.reload({ waitUntil: 'networkidle' });
  await pageDecision.waitForTimeout(200);
  await pageDecision.click('#btnContinuerClub');
  await pageDecision.waitForTimeout(300);
  const boutonsDecisionAvant = await pageDecision.locator('[data-msg="msgTestDecision"] .btnDecisionMessage').count();
  verifier('boîte de réception : une demande de temps de jeu affiche de vrais boutons d\'action (pas juste un texte)',
    boutonsDecisionAvant === 2);
  await pageDecision.click('[data-msg="msgTestDecision"] .btnDecisionMessage[data-option="rassurer"]');
  await pageDecision.waitForTimeout(200);
  const apresDecision = await pageDecision.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    const message = s.clubJoueur.messages.find((m) => m.id === 'msgTestDecision');
    return { moral: s.clubJoueur.effectif[0].moral, resolu: message.decision.resolu };
  });
  verifier('boîte de réception : cliquer "Le rassurer" tranche réellement la décision (sauvegardé) et améliore le moral',
    apresDecision.resolu === true && apresDecision.moral === 60);
  const boutonsDecisionApres = await pageDecision.locator('[data-msg="msgTestDecision"] .btnDecisionMessage').count();
  const resultatAffiche = await pageDecision.locator('[data-msg="msgTestDecision"] .decisionMessageResultat').count();
  verifier('boîte de réception : une fois tranchée, les boutons disparaissent au profit d\'un résultat affiché',
    boutonsDecisionApres === 0 && resultatAffiche === 1);
  await contexteDecision.close();

  // 13) Recommandation tactique dans l'aperçu du prochain match (audit
  // "stratégie selon l'adversaire : présent mais incomplet", cf.
  // club-analyse.js/recommanderTactique) : force un écart marqué et
  // déterministe (notre effectif nettement plus rapide et meilleur en
  // mêlée) pour garantir qu'au moins une recommandation s'affiche, puis
  // vérifie que "Appliquer les recommandations" modifie réellement la
  // tactique utilisée en match (pas juste un texte informatif).
  const contexteReco = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageReco = await contexteReco.newPage();
  await pageReco.goto(`${URL_BASE}/index.html`, { waitUntil: 'networkidle' });
  await pageReco.click('#btnAccueilModeClub');
  await pageReco.fill('#inputNomClub', 'Test Recommandation');
  await pageReco.click('#btnCreerClub');
  await pageReco.waitForTimeout(300);
  await pageReco.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    for (const j of s.clubJoueur.effectif) {
      j.vitesse = Math.min(99, j.vitesse + 30);
      j.melee = Math.min(99, (j.melee || 60) + 30);
    }
    localStorage.setItem('rugbyManager.club.v1', JSON.stringify(s));
  });
  await pageReco.reload({ waitUntil: 'networkidle' });
  await pageReco.waitForTimeout(200);
  await pageReco.click('#btnContinuerClub');
  await pageReco.waitForTimeout(300);
  await pageReco.click('#btnJouerMatchClub');
  await pageReco.waitForTimeout(500);
  verifier('aperçu du match : un écart marqué avec l\'adversaire affiche une vraie recommandation tactique actionnable',
    await pageReco.locator('#btnAppliquerRecommandations').isVisible().catch(() => false));
  const tactiqueAvantReco = await pageReco.evaluate(() => JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.tactique);
  await pageReco.click('#btnAppliquerRecommandations');
  await pageReco.waitForTimeout(300);
  const tactiqueApresReco = await pageReco.evaluate(() => JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.tactique);
  verifier('aperçu du match : "Appliquer les recommandations" modifie réellement la tactique persistée (pas juste affichée)',
    JSON.stringify(tactiqueAvantReco) !== JSON.stringify(tactiqueApresReco) && tactiqueApresReco.avants === 'proche');
  const carteTactiqueApres = await pageReco.locator('#apercuMatchCorps').textContent();
  verifier('aperçu du match : la carte "Ma tactique" reflète immédiatement le changement, sans rouvrir l\'écran',
    carteTactiqueApres.includes('Près du ruck'));
  await contexteReco.close();

  verifier('aucune erreur console/page sur tout le parcours', erreursConsole.length === 0);
  if (erreursConsole.length) console.error(erreursConsole.join('\n'));

  await browser.close();
  console.log(`\n${nbTests} test(s), ${nbEchecs} échec(s).`);
  process.exit(nbEchecs > 0 ? 1 : 0);
})();
