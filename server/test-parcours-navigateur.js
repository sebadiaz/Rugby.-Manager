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
  await page.click('#clubAutresClubsListe tbody tr:nth-child(1)');
  await page.waitForTimeout(150);
  const detailAdversaireTxt = await page.textContent('#clubAutresClubIdentite');
  verifier('club adverse : sa fiche affiche un contenu réel', detailAdversaireTxt.trim().length > 20);
  // TODO_AUDIT.md P1-19 : l'effectif adverse n'est PLUS recopié dans cet
  // onglet — il s'affiche dans l'écran Effectif commun. La fiche du club
  // propose des raccourcis qui y mènent en sélectionnant ce club.
  verifier('club adverse : son effectif n\'est plus dupliqué dans l\'onglet Autres clubs (écran unique)',
    await page.evaluate(() => !document.getElementById('clubAutresClubEffectif')));
  verifier('club adverse : des raccourcis mènent aux écrans communs (effectif/composition/tactique/calendrier)',
    (await page.$$('#clubAutresClubRaccourcis .btnRaccourciEquipe')).length === 4);
  await page.click('#clubAutresClubRaccourcis .btnRaccourciEquipe[data-onglet="effectif"]');
  await page.waitForTimeout(250);
  const apresRaccourciEffectif = await page.evaluate(() => ({
    ongletVisible: document.querySelector('.voletOnglet[data-volet="effectif"]').style.display !== 'none',
    equipe: document.getElementById('selEquipeContexte').value,
    lignes: document.querySelectorAll('#clubEffectif tr[data-joueur]').length,
    lectureSeule: !!document.querySelector('#contexteEquipeInfo .badgeEquipeMode.lecture'),
  }));
  verifier('club adverse : le raccourci "Effectif" ouvre l\'écran Effectif COMMUN avec ce club sélectionné, en lecture seule',
    apresRaccourciEffectif.ongletVisible && apresRaccourciEffectif.equipe.indexOf('adverse:') === 0
    && apresRaccourciEffectif.lignes === 15 && apresRaccourciEffectif.lectureSeule);
  // Offre de transfert : même fiche joueur que pour ses propres joueurs,
  // seule l'action proposée diffère.
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
  await pageEspoirs.evaluate((periode) => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    for (const f of s.calendrier) {
      if (f.journee < periode) { f.joue = true; f.score = { domicile: 20, exterieur: 15 }; }
    }
    localStorage.setItem('rugbyManager.club.v1', JSON.stringify(s));
  }, periode);
  await pageEspoirs.reload({ waitUntil: 'networkidle' });
  await pageEspoirs.waitForTimeout(200);
  await pageEspoirs.click('#btnContinuerClub');
  await pageEspoirs.waitForTimeout(300);
  await pageEspoirs.click('#btnJouerMatchClub');
  await pageEspoirs.waitForTimeout(800);
  const btnApercuLancerEspoirs = pageEspoirs.locator('#btnApercuLancerMatch');
  if (await btnApercuLancerEspoirs.isVisible({ timeout: 3000 }).catch(() => false)) await btnApercuLancerEspoirs.click();
  await pageEspoirs.waitForFunction(
    () => document.getElementById('btnJouerMatchClub') && !document.getElementById('btnJouerMatchClub').disabled,
    { timeout: 30000 }
  ).catch(() => {});
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
  await pageEG.waitForTimeout(800);
  const btnApercuLancerEG = pageEG.locator('#btnApercuLancerMatch');
  if (await btnApercuLancerEG.isVisible({ timeout: 3000 }).catch(() => false)) await btnApercuLancerEG.click();
  await pageEG.waitForFunction(
    () => document.getElementById('btnJouerMatchClub') && !document.getElementById('btnJouerMatchClub').disabled,
    { timeout: 30000 }
  ).catch(() => {});
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
  // Les 4 types d'équipe demandés, dans l'ordre : première équipe, équipe B,
  // équipe jeune, équipe adverse.
  const EQUIPES_A_TESTER = [
    { valeur: 'pro', nom: 'première équipe', modifiable: true },
    { valeur: 'b', nom: 'équipe B', modifiable: true },
    { valeur: 'jeunes', nom: 'équipe jeune (espoirs)', modifiable: true },
    { valeur: 'adverse:' + idAdversaireUnif, nom: 'équipe adverse', modifiable: false },
  ];
  // Le nœud qui porte le contenu de chaque écran — c'est LUI qui doit être
  // partagé par les 4 équipes (s'il en existait un par type d'équipe, la
  // refonte n'aurait servi à rien).
  const ECRANS_A_TESTER = [
    { onglet: 'effectif', nœud: '#clubEffectif', nom: 'effectif' },
    { onglet: 'composition', nœud: '#clubTerrain', nom: 'composition' },
    { onglet: 'tactique', nœud: '#clubTactique', nom: 'tactique' },
    { onglet: 'entrainement', nœud: '#clubEntrainement', nom: 'entraînement' },
    { onglet: 'calendrier', nœud: '#clubClassement', nom: 'calendrier & classement' },
    { onglet: 'personnel', nœud: '#clubPersonnelActuel', nom: 'personnel' },
  ];
  let toutesEquipesOntTousLesEcrans = true;
  let selecteurToujoursDansEcran = true;
  let contenuToujoursReel = true;
  let lectureSeuleRespectee = true;
  for (const equipe of EQUIPES_A_TESTER) {
    for (const ecran of ECRANS_A_TESTER) {
      await pageUnif.click(`.ongletBtn[data-onglet="${ecran.onglet}"]`);
      await pageUnif.waitForTimeout(120);
      await pageUnif.selectOption('#selEquipeContexte', equipe.valeur);
      await pageUnif.waitForTimeout(200);
      const etat = await pageUnif.evaluate((args) => {
        const volet = document.querySelector(`.voletOnglet[data-volet="${args.onglet}"]`);
        const nœud = document.querySelector(args.nœud);
        const selecteur = document.getElementById('selecteurEquipe');
        return {
          voletVisible: volet && volet.style.display !== 'none',
          // Le nœud de contenu doit exister ET appartenir à CE volet : preuve
          // qu'il n'y a pas d'écran parallèle ailleurs dans la page.
          nœudDansVolet: !!(nœud && volet && volet.contains(nœud)),
          contenu: nœud ? (nœud.innerText || '').trim().length : 0,
          // Un seul sélecteur dans toute la page, et il est dans l'écran actif.
          nbSelecteurs: document.querySelectorAll('#selecteurEquipe').length,
          selecteurDansVolet: !!(selecteur && volet && volet.contains(selecteur)),
          valeurSelecteur: document.getElementById('selEquipeContexte').value,
          modifiable: !!document.querySelector('#contexteEquipeInfo .badgeEquipeMode.dirigee'),
        };
      }, { onglet: ecran.onglet, nœud: ecran.nœud });
      if (!etat.voletVisible || !etat.nœudDansVolet) toutesEquipesOntTousLesEcrans = false;
      if (etat.nbSelecteurs !== 1 || !etat.selecteurDansVolet || etat.valeurSelecteur !== equipe.valeur) selecteurToujoursDansEcran = false;
      if (etat.contenu < 15) contenuToujoursReel = false;
      if (etat.modifiable !== equipe.modifiable) lectureSeuleRespectee = false;
    }
  }
  verifier('écrans uniques : les 4 types d\'équipe (1re, B, jeunes, adverse) passent par les MÊMES 6 écrans (mêmes nœuds DOM)',
    toutesEquipesOntTousLesEcrans);
  verifier('écrans uniques : il n\'existe QU\'UN sélecteur d\'équipe dans toute la page, déplacé dans l\'écran actif',
    selecteurToujoursDansEcran);
  verifier('écrans uniques : chaque écran affiche un contenu RÉEL pour chacune des 4 équipes (jamais une page vide)',
    contenuToujoursReel);
  verifier('écrans uniques : seules les équipes dirigées sont modifiables, un club adverse reste en lecture seule sur les 6 écrans',
    lectureSeuleRespectee);

  // L'équipe sélectionnée doit être CONSERVÉE en naviguant entre les 6
  // écrans — c'est explicitement demandé, et c'est ce qui rend la
  // consultation d'une équipe cohérente d'un écran à l'autre.
  await pageUnif.click('.ongletBtn[data-onglet="composition"]');
  await pageUnif.waitForTimeout(120);
  await pageUnif.selectOption('#selEquipeContexte', 'jeunes');
  await pageUnif.waitForTimeout(200);
  let equipeConservee = true;
  for (const ecran of ECRANS_A_TESTER) {
    await pageUnif.click(`.ongletBtn[data-onglet="${ecran.onglet}"]`);
    await pageUnif.waitForTimeout(150);
    const valeur = await pageUnif.evaluate(() => document.getElementById('selEquipeContexte').value);
    if (valeur !== 'jeunes') equipeConservee = false;
  }
  verifier('écrans uniques : l\'équipe sélectionnée est conservée en passant de la composition à la tactique, l\'entraînement, le calendrier et le personnel',
    equipeConservee);
  // ... et elle survit à un rechargement de page (sauvegardée, pas seulement
  // en mémoire).
  await pageUnif.reload({ waitUntil: 'networkidle' });
  await pageUnif.waitForTimeout(200);
  await pageUnif.click('#btnContinuerClub');
  await pageUnif.waitForTimeout(300);
  await pageUnif.click('.ongletBtn[data-onglet="effectif"]');
  await pageUnif.waitForTimeout(200);
  verifier('écrans uniques : l\'équipe sélectionnée survit à un rechargement de page (F5)',
    (await pageUnif.evaluate(() => document.getElementById('selEquipeContexte').value)) === 'jeunes');

  // Une équipe adverse doit être en lecture seule POUR DE VRAI : les
  // contrôles sont désactivés, et forcer l'action ne modifie rien.
  await pageUnif.click('.ongletBtn[data-onglet="composition"]');
  await pageUnif.waitForTimeout(120);
  await pageUnif.selectOption('#selEquipeContexte', 'adverse:' + idAdversaireUnif);
  await pageUnif.waitForTimeout(250);
  const controlesAdverse = await pageUnif.evaluate(() => ({
    selects: document.querySelectorAll('#clubTerrain select').length,
    desactives: document.querySelectorAll('#clubTerrain select[disabled]').length,
    encadrementDesactives: document.querySelectorAll('#clubEncadrement select[disabled]').length,
    boutonAutoMasque: document.getElementById('btnCompositionAuto').style.display === 'none',
  }));
  verifier('écrans uniques : la composition d\'un club adverse est le MÊME terrain 1-15, entièrement désactivé',
    controlesAdverse.selects === 15 && controlesAdverse.desactives === 15
    && controlesAdverse.encadrementDesactives === 3 && controlesAdverse.boutonAutoMasque);
  await pageUnif.click('.ongletBtn[data-onglet="tactique"]');
  await pageUnif.waitForTimeout(200);
  const tactiqueAdverse = await pageUnif.evaluate(() => {
    const axes = document.querySelectorAll('#clubTactique [data-axe]');
    return {
      axes: axes.length,
      desactives: document.querySelectorAll('#clubTactique [data-axe][disabled]').length,
      choisies: document.querySelectorAll('#clubTactique .ligneTactique.choisie').length,
      noteDeduite: !!document.querySelector('#clubTactique .noteLectureSeule'),
    };
  });
  verifier('écrans uniques : la tactique d\'un club adverse s\'affiche sur les MÊMES 6 axes, désactivés et signalés comme déduits',
    tactiqueAdverse.axes === 18 && tactiqueAdverse.desactives === 18
    && tactiqueAdverse.choisies === 6 && tactiqueAdverse.noteDeduite);
  // Tenter réellement de modifier la tactique d'un club qu'on ne dirige pas
  // ne doit RIEN changer dans la sauvegarde.
  const sauvegardeAvantForcage = await pageUnif.evaluate(() => localStorage.getItem('rugbyManager.club.v1'));
  await pageUnif.evaluate(() => {
    const bouton = document.querySelector('#clubTactique .ligneTactique:not(.choisie)');
    if (bouton) { bouton.disabled = false; bouton.click(); }
  });
  await pageUnif.waitForTimeout(250);
  verifier('écrans uniques : forcer un clic sur la tactique d\'un club adverse ne modifie RIEN (lecture seule réelle, pas cosmétique)',
    (await pageUnif.evaluate(() => localStorage.getItem('rugbyManager.club.v1'))) === sauvegardeAvantForcage);
  verifier('écrans uniques : aucune erreur console pendant tout le parcours des 4 équipes sur les 6 écrans',
    erreursUnif.length === 0);
  if (erreursUnif.length) console.error(erreursUnif.join('\n'));
  await contexteUnif.close();

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
