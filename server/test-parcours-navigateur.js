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

  // « Continuer » ne fonce plus jusqu'au match : il s'arrête sur tout
  // événement réel du chemin (blessure d'entraînement, rapport de repérage,
  // réponse de contrat, décision — cf. TODO_AUDIT.md P1-26). Un test qui veut
  // ATTEINDRE le match reclique donc jusqu'à l'aperçu, exactement comme le
  // joueur. Borné : un blocage réel se traduit toujours par un échec.
  async function continuerJusquAuMatch(p, selecteur) {
    const bouton = selecteur || '#btnJouerMatchClub';
    for (let i = 0; i < 15; i++) {
      if (await p.isVisible('#panneauApercuMatch.visible')) return true;
      await p.click(bouton);
      await p.waitForTimeout(600);
    }
    return await p.isVisible('#panneauApercuMatch.visible');
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
    'transferts', 'personnel', 'classement', 'calendrier', 'monde', 'finances', 'medical', 'stats'];
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
  // Comparaison par IDENTIFIANT, jamais par nom : les noms sont tirés de
  // listes finies, donc un joueur du marché peut parfaitement porter le même
  // nom qu'un joueur déjà à l'effectif. Ce test comptait les joueurs de
  // l'effectif « dont le nom figure au marché » et voyait alors 3 recrues
  // là où une seule avait signé — un faux échec, reproduit et diagnostiqué
  // (un seul toast de signature émis, protection intacte).
  const marcheAvantDoubleClic = await page.$$eval('#clubMarche .ligneMarche .btnSigner',
    (els) => els.map((e) => e.dataset.joueur));
  verifier('double clic écran : au moins 2 joueurs sur le marché avant le test (scénario significatif)',
    marcheAvantDoubleClic.length >= 2);
  const effectifIdsAvant = await page.evaluate(
    () => JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.effectif.map((j) => j.id));
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
  const nouveauxIds = await page.evaluate(
    (avant) => JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.effectif
      .map((j) => j.id).filter((id) => !avant.includes(id)),
    effectifIdsAvant);
  verifier('double clic écran sur "Signer" (1re ligne) : un seul joueur rejoint le club, pas le joueur de la ligne suivante aussi',
    nouveauxIds.length === 1);
  verifier('double clic écran sur "Signer" : c\'est bien le joueur de la LIGNE CLIQUÉE qui signe',
    nouveauxIds.length === 1 && marcheAvantDoubleClic.indexOf(nouveauxIds[0]) === 0);

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
  await clicOnglet('classement');
  await page.waitForTimeout(150);
  // Audit ("les autres championnats ne sont jamais simulés") : les 2 autres
  // paliers de la pyramide française (celui que le joueur n'occupe pas
  // cette saison) doivent afficher un classement réel, pas une carte vide.
  // Navigation pays -> championnat (TODO_AUDIT.md P1-28) : la France est
  // ouverte par défaut, avec ses 3 paliers (celui du joueur marqué ⭐).
  const championnatsFrTxt = await page.textContent('#clubNavChampionnats');
  verifier('autres paliers de la pyramide française : les 3 paliers sont proposés à la navigation',
    (championnatsFrTxt.match(/Ligue/g) || []).length >= 3);
  const classementNavTxt = await page.textContent('#clubCompetitionClassement');
  verifier('navigation par championnat : un classement réel est affiché (pas une carte vide)',
    classementNavTxt.trim().length > 20);
  verifier('navigation par championnat : le calendrier du championnat est affiché',
    (await page.textContent('#clubCalendrier')).includes('Journée'));
  // TODO_AUDIT.md P1-20 : les clubs ne sont PAS choisis dans un sélecteur —
  // ce sont des noms cliquables, exactement comme partout ailleurs, et ils
  // appellent la même fonction centrale d'ouverture de club.
  verifier('autres clubs : le classement propose des noms de clubs CLIQUABLES (pas un menu déroulant)',
    (await page.$$('#clubCompetitionClassement .lienClub')).length > 0
    && await page.evaluate(() => !document.querySelector('#clubCompetitionClassement select')));
  // Le club du joueur est en tête du classement au départ : on ouvre le
  // SUIVANT, sinon on « ouvrirait » son propre club.
  await page.click('#clubCompetitionClassement .lienClub:not([data-club="' +
    (await page.evaluate(() => JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.id)) + '"])');
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
  // 23 et non 15 depuis TODO_AUDIT.md P1-29 : un club adverse aligne
  // désormais une vraie feuille de match — 15 titulaires ET 8 remplaçants,
  // tirés de son groupe de 24. Son banc n'est plus vide.
  const nbJoueursAdverses = (await page.$$('#clubEffectif tr[data-joueur]')).length;
  verifier('club consulté : sa feuille de match complète s\'affiche dans l\'écran Effectif COMMUN, en lecture seule',
    nbJoueursAdverses === 23
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
  // Depuis TODO_AUDIT.md P1-33, Classement et Calendrier sont DEUX pages
  // distinctes, pilotées par la même navigation de compétitions — le
  // championnat d'Équipe B y figure comme n'importe quel autre.
  await clicOnglet('classement');
  await page.waitForTimeout(200);
  await page.locator('.btnChampionnatNav', { hasText: 'Équipe B' }).first().click();
  await page.waitForTimeout(300);
  const classementB = await page.evaluate(() => ({
    titre: document.getElementById('titreCompetitionChoisie').textContent,
    lignes: document.querySelectorAll('#clubCompetitionClassement tbody tr').length,
    calendrierDansLaPage: !!document.querySelector('.voletOnglet[data-volet="classement"] #clubCalendrier'),
  }));
  verifier('classement : la page Classement ne contient AUCUN calendrier (deux écrans distincts)',
    !classementB.calendrierDansLaPage);
  await clicOnglet('calendrier');
  await page.waitForTimeout(300);
  const classementLignesB = classementB.lignes;
  const equipeBCalendrier = await page.evaluate((n) => ({
    titre: document.getElementById('titreCalendrierCompetition').textContent,
    lignesClassement: n,
    blocsCalendrier: document.querySelectorAll('#clubCalendrier .blocJournee').length,
    classementDansLaPage: !!document.querySelector('.voletOnglet[data-volet="calendrier"] #clubCompetitionClassement'),
  }), classementLignesB);
  verifier('calendrier : la page Calendrier ne contient AUCUN classement (deux écrans distincts)',
    !equipeBCalendrier.classementDansLaPage);
  verifier('équipe B : son classement s\'affiche dans l\'écran Classement COMMUN, via la navigation de compétitions',
    classementB.titre.includes('Équipe B') && equipeBCalendrier.lignesClassement >= 2);
  verifier('équipe B : son calendrier réel s\'affiche dans l\'écran Calendrier COMMUN',
    equipeBCalendrier.titre.includes('Équipe B') && equipeBCalendrier.blocsCalendrier > 0);
  // Sa composition passe par l'écran Composition commun (terrain 1-15). Le
  // sélecteur d'équipe ne vit plus sur les écrans Classement/Calendrier
  // (P1-33, ils suivent la compétition) : on sélectionne l'Équipe B depuis
  // l'écran Effectif, puis on vérifie qu'elle est CONSERVÉE jusqu'à la
  // Composition — c'est toujours le même invariant : un seul sélecteur,
  // partagé, jamais réinitialisé en changeant d'écran.
  await clicOnglet('effectif');
  await page.waitForTimeout(200);
  await page.selectOption('#selEquipeContexte', 'b');
  await page.waitForTimeout(250);
  await clicOnglet('composition');
  await page.waitForTimeout(250);
  const equipeBCompo = await page.evaluate(() => ({
    equipe: document.getElementById('selEquipeContexte').value,
    postes: document.querySelectorAll('#clubTerrain .chipTerrain').length,
    modifiable: !!document.querySelector('#contexteEquipeInfo .badgeEquipeMode.dirigee'),
  }));
  verifier('équipe B : l\'équipe sélectionnée est CONSERVÉE en passant de l\'effectif à la composition',
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
  await continuerJusquAuMatch(page);
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
  const enteteClassementTxt = await page.textContent('#clubCompetitionClassement thead');
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
    // Un jour de COUPE ou d'AMICAL (P1-32/P1-34) ne passe pas par l'aperçu :
    // le match démarre directement et c'est l'écran de résultat qui s'ouvre.
    // Le bouton flottant est alors invisible — on le clique via evaluate,
    // puis on traite l'un OU l'autre des deux écrans possibles.
    await page.evaluate(() => {
      const b = document.getElementById('btnApercuMatchFlottant');
      if (b) b.click();
    });
    const apercuOuvert = await page.waitForSelector('#panneauApercuMatch.visible', { timeout: 4000 })
      .then(() => true).catch(() => false);
    if (apercuOuvert) {
      await page.click('#btnApercuLancerMatch');
      await page.waitForSelector('#panneauResultat.visible', { timeout: 30000 });
      await page.click('#btnResultatFermer');
    } else if (await page.isVisible('#panneauResultat.visible')) {
      await page.click('#btnResultatFermer');
      await page.waitForTimeout(400);
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
    // Le mini-classement du tableau de bord a été retiré (P1-37) : il répétait
    // la page Classement, qui est vérifiée ci-dessous. Rien n'est perdu.
    { onglet: 'calendrier', zone: '#clubCalendrier', nom: 'calendrier' },
    { onglet: 'calendrier', zone: '#clubCalendrier', nom: 'calendrier' },
    { onglet: 'classement', zone: '#clubCompetitionClassement', nom: 'classement du championnat choisi' },
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
      await pageUnif.click('.ongletBtn[data-onglet="classement"]');
      await pageUnif.waitForTimeout(150);
      await pageUnif.evaluate((id) => document.querySelector(`#clubCompetitionClassement .lienClub[data-club="${id}"]`).click(), cas.club);
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

  // Double clic RÉEL sur « Continuer » : une seule avance doit partir.
  // Mesuré en instrumentant la fonction d'avance elle-même (plus précis que
  // comparer des dates : depuis TODO_AUDIT.md P1-26 une avance s'arrête sur
  // le premier événement, donc sa longueur n'est plus prévisible).
  const appelsAvance = await pageTemps.evaluate(() => {
    window.__nbAvances = 0;
    const original = window.RMClub.avancerJusquAuProchainMatch;
    window.RMClub.avancerJusquAuProchainMatch = function () {
      window.__nbAvances++;
      return original.apply(this, arguments);
    };
    const b = () => document.getElementById('btnJouerMatchClub');
    if (b()) b().click();
    if (b()) b().click();
    window.RMClub.avancerJusquAuProchainMatch = original;
    return window.__nbAvances;
  });
  await pageTemps.waitForTimeout(700);
  verifier('carrière datée : double clic sur « Continuer » ne lance qu\'UNE seule avance',
    appelsAvance === 1);
  const jouesApresDoubleClic = await pageTemps.evaluate(
    () => JSON.parse(localStorage.getItem('rugbyManager.club.v1')).calendrier.filter((f) => f.joue).length);
  verifier('carrière datée : le double clic ne simule aucun match avant sa date', jouesApresDoubleClic === 0);

  // Puis on rejoint réellement la 1re journée, en recliquant à chaque arrêt
  // (chaque arrêt est un vrai événement, cf. P1-26) — la date doit tomber
  // EXACTEMENT sur la date de la journée 1, jamais après.
  await continuerJusquAuMatch(pageTemps);
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
  verifier('carrière datée : aucun match n\'a été joué avant l\'ouverture de son aperçu',
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
    // Depuis P1-40 le libellé annonce une FOURCHETTE (« Retour estimé entre
    // X et Y jour(s) ») plutôt qu'un compteur exact : l'intention du test —
    // des JOURS et une vraie date, plus des « journées » de championnat —
    // reste vérifiée, avec le vocabulaire actuel.
    /Retour estim[ée] .*\d+ jour\(s\)/.test(texteMedical)
    && /\b(lun|mar|mer|jeu|ven|sam|dim)\./i.test(texteMedical));

  await clicOngletSur(pageJours, 'dashboard');
  await pageJours.waitForTimeout(200);
  // Avance de l'intersaison jusqu'au 1er match, en recliquant à chaque arrêt
  // (une avance s'interrompt sur tout événement réel, cf. P1-26).
  await continuerJusquAuMatch(pageJours);
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
    // Boucle BORNÉE plutôt qu'un clic unique : depuis P1-26 une avance
    // s'ARRÊTE dès qu'un événement survient, et P1-40 en produit davantage
    // (blessures avec diagnostic). Le nombre de clics nécessaires dépend donc
    // de la graine — un test qui en suppose un seul est faux par construction,
    // pas « instable ». On avance jusqu'à la remise, au plus 25 fois.
    for (let essai = 0; essai < 25; essai++) {
      const livre = await pageSemaine.evaluate((id) => {
        const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
        return (s.rapportsScouting || []).length === 0;
      }, avantScout.id);
      if (livre) break;
      if (await pageSemaine.isVisible('#btnJouerMatchClub')) {
        await pageSemaine.click('#btnJouerMatchClub');
      } else if (await pageSemaine.isVisible('#btnContinuerClub')) {
        await pageSemaine.click('#btnContinuerClub');
      }
      await pageSemaine.waitForTimeout(450);
      if (await pageSemaine.isVisible('#btnApercuFermer')) {
        await pageSemaine.click('#btnApercuFermer');
        await pageSemaine.waitForTimeout(200);
      }
    }
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

  // 11d-quater) PRÉPARATION DE MATCH, FENÊTRES DE TRANSFERT, DIRECTION ET
  // VESTIAIRE (TODO_AUDIT.md P1-24, tranche 4).
  const contextePrep = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pagePrep = await contextePrep.newPage();
  const erreursPrep = [];
  pagePrep.on('pageerror', (e) => erreursPrep.push(`PAGEERROR: ${e.message}`));
  pagePrep.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) erreursPrep.push(`CONSOLE: ${m.text()}`); });
  await pagePrep.goto(`${URL_BASE}/index.html`, { waitUntil: 'networkidle' });
  await pagePrep.click('#btnAccueilModeClub');
  await pagePrep.fill('#inputNomClub', 'Test Préparation');
  await pagePrep.click('#btnCreerClub');
  await pagePrep.waitForTimeout(400);

  // Depuis P1-41, la préparation ne vit plus sur le tableau de bord mais dans
  // l'onglet « Préparer le match » — une seule vue pour toutes les équipes.
  // L'intention de ces tests est inchangée ; seule leur cible a bougé.
  await clicOngletSur(pagePrep, 'preparer');
  await pagePrep.waitForTimeout(350);
  const prepLoin = await pagePrep.evaluate(() => ({
    visible: document.querySelector('.voletOnglet[data-volet="preparer"]').style.display !== 'none',
    points: document.querySelectorAll('#clubPreparer .lignePreparation').length,
    texte: document.getElementById('clubPreparer').innerText,
    pct: (document.querySelector('.pctPreparation') || {}).textContent || '',
  }));
  verifier('préparation de match : la carte affiche les 5 points de préparation, plusieurs jours avant la rencontre',
    prepLoin.visible && prepLoin.points === 5);
  verifier('préparation de match : loin du match, l\'analyse de l\'adversaire annonce son délai (pas juste « indisponible »)',
    /analyste a besoin d'encore \d+ jour/.test(prepLoin.texte));
  verifier('préparation de match : un pourcentage de préparation réel est affiché',
    /\d+ %/.test(prepLoin.pct));

  // --- P1-38 : distinguer ce qu'on doit FAIRE de ce qu'on doit ATTENDRE.
  // Mesuré avant : à J-21, « 60 % de la préparation bouclée » et un ⬜ devant
  // « Analyse de l'adversaire » — le même symbole que devant « Tactique »,
  // alors que l'un demande 17 jours d'attente et l'autre un seul clic. ---
  const niveaux = await pagePrep.evaluate(() => Array.from(
    document.querySelectorAll('#clubPreparer .lignePreparation')).map((l) => ({
      libelle: (l.querySelector('b') || {}).textContent || '',
      nature: l.dataset.nature || null,
      badge: (l.querySelector('.badgeNature') || {}).textContent || null,
    })));
  verifier('préparation : chaque point porte sa nature (terminé / urgent / recommandé / facultatif / en attente)',
    niveaux.length === 5 && niveaux.every((n) => !!n.nature && !!n.badge));
  verifier('préparation : le point hors de portée du manager est marqué « en attente », pas « à faire »',
    (niveaux.find((n) => n.libelle.includes('Analyse')) || {}).nature === 'enAttente');
  verifier('préparation : ce qui attend et ce qui se règle ne portent PAS le même libellé',
    (niveaux.find((n) => n.libelle.includes('Analyse')) || {}).badge
      !== (niveaux.find((n) => n.libelle.includes('Tactique')) || {}).badge);
  verifier('préparation : la tactique par défaut est annoncée FACULTATIVE, pas comme un manque',
    (niveaux.find((n) => n.libelle.includes('Tactique')) || {}).nature === 'facultatif');
  verifier('préparation : le pourcentage annonce sur quoi il porte (le réglable, pas l\'attente)',
    /r[ée]glable|aujourd'hui|de pr[eé]t/i.test(prepLoin.pct));
  // Le compte est honnête : 3 points réglés sur 4 réglables = 75 %, et non
  // 60 % obtenus en comptant l'attente de l'analyste comme un échec.
  verifier('préparation : le pourcentage ne compte plus l\'attente de l\'analyste comme un point raté',
    /\b75 %/.test(prepLoin.pct));
  // Aucun blocage : le bouton « Continuer » reste actif malgré des points non préparés.
  verifier('préparation de match : rien ne bloque — « Continuer » reste utilisable avec des points non préparés',
    await pagePrep.evaluate(() => !document.getElementById('btnJouerMatchClub').disabled));
  // Cliquer un point emmène sur l'écran concerné.
  await pagePrep.click('#clubPreparer .lignePreparation[data-onglet="tactique"]');
  await pagePrep.waitForTimeout(250);
  verifier('préparation de match : cliquer un point ouvre l\'écran où le régler',
    await pagePrep.evaluate(() => document.querySelector('.voletOnglet[data-volet="tactique"]').style.display !== 'none'));
  // Régler un axe fait réellement basculer le point à « prêt ».
  await pagePrep.click('#clubTactique [data-axe="style"][data-valeur="large"]');
  await pagePrep.waitForTimeout(250);
  await clicOngletSur(pagePrep, 'preparer');
  await pagePrep.waitForTimeout(300);
  verifier('préparation de match : régler la tactique fait réellement passer ce point à « prêt »',
    await pagePrep.evaluate(() => {
      const l = Array.from(document.querySelectorAll('#clubPreparer .lignePreparation'))
        .find((x) => x.textContent.includes('Tactique'));
      return !!l && l.classList.contains('ok');
    }));
  // À l'approche du match, l'analyse devient disponible.
  await pagePrep.evaluate(() => {
    const K = 'rugbyManager.club.v1';
    const s = JSON.parse(localStorage.getItem(K));
    const RM = window.RMClub;
    s.temps = Object.assign({}, s.temps, RM.ajouterJours(RM.dateDeJournee(s.numero, 1, 'pro'), -1));
    localStorage.setItem(K, JSON.stringify(s));
  });
  await pagePrep.reload({ waitUntil: 'networkidle' });
  await pagePrep.waitForTimeout(250);
  await pagePrep.click('#btnContinuerClub');
  await pagePrep.waitForTimeout(350);
  await clicOngletSur(pagePrep, 'preparer');
  await pagePrep.waitForTimeout(350);
  verifier('préparation de match : à l\'approche de la rencontre, le rapport de l\'analyste devient disponible',
    (await pagePrep.textContent('#clubPreparer')).includes('Rapport de ton analyste disponible'));

  // --- P1-39 : le jour d'un match d'Équipe B, la préparation doit préparer
  // CE match. Mesuré avant : l'échéance annonçait « MATCH DE L'ÉQUIPE B /
  // Castelnau Étoiles / aujourd'hui » pendant que la préparation affichait
  // « Riverange Taureaux · samedi 7 septembre 2024 (dans -1 jours) ». ---
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageB = await ctxB.newPage();
  const erreursB = [];
  pageB.on('pageerror', (e) => erreursB.push(`PAGEERROR: ${e.message}`));
  pageB.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) erreursB.push(`CONSOLE: ${m.text()}`); });
  await pageB.goto(`${URL_BASE}/index.html`, { waitUntil: 'networkidle' });
  await pageB.click('#btnAccueilModeClub');
  await pageB.fill('#inputNomClub', 'Test Jour Équipe B');
  await pageB.click('#btnCreerClub');
  await pageB.waitForTimeout(500);
  await pageB.evaluate(() => {
    const K = 'rugbyManager.club.v1';
    const s = JSON.parse(localStorage.getItem(K));
    const moi = s.clubJoueur.id;
    const f = (s.competitionB.calendrier || []).find((x) => x.domicileId === moi || x.exterieurId === moi);
    s.temps = Object.assign({}, s.temps, window.RMClub.dateDepuisISO(f.date));
    localStorage.setItem(K, JSON.stringify(s));
  });
  await pageB.reload({ waitUntil: 'networkidle' });
  await pageB.waitForTimeout(250);
  await pageB.click('#btnContinuerClub');
  await pageB.waitForTimeout(650);
  // P1-41 : la préparation vit dans son onglet, plus sur le tableau de bord.
  if (await pageB.isVisible('#btnMenuClub')) { await pageB.click('#btnMenuClub'); await pageB.waitForTimeout(200); }
  await pageB.click('.ongletBtn[data-onglet="preparer"]');
  await pageB.waitForTimeout(400);
  const jourB = await pageB.evaluate(() => ({
    // On compare à prochainArret, la SOURCE, plutôt qu'à la carte du tableau
    // de bord : celle-ci est masquée pendant qu'on regarde l'onglet Préparer,
    // et innerText d'un élément caché est vide — la comparaison porterait
    // alors sur du vide au lieu de vérifier l'accord.
    echeance: (() => {
      const s2 = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
      const a = window.RMClub.prochainArret(s2);
      return a ? `${a.adversaireNom} ${window.RMClub.dateISO(a.date)} ${a.type}` : '';
    })(),
    prep: (document.getElementById('clubPreparer') || {}).innerText || '',
    titrePrep: (document.getElementById('clubPreparer') || {}).innerText || '',
  }));
  verifier('préparation par équipe : le jour d\'un match d\'Équipe B, la carte prépare CETTE équipe',
    jourB.titrePrep.includes('Équipe B'));
  verifier('préparation par équipe : elle nomme le MÊME adversaire que la carte « Prochaine échéance »',
    (() => {
      const adv = jourB.echeance.split(' ')[0];
      return !!adv && jourB.prep.includes(adv);
    })());
  verifier('préparation par équipe : plus jamais de compte à rebours négatif (« dans -1 jours »)',
    !/dans -\d+ jour/.test(jourB.prep));
  verifier('préparation par équipe : aucune erreur console', erreursB.length === 0);
  await ctxB.close();

  // --- P1-40 : Centre médical 2.0. Le diagnostic doit SURVIVRE au
  // rechargement (durée tirée une fois, jamais re-tirée à l'affichage), et la
  // décision d'accélérer doit avoir une conséquence réelle et persistée. ---
  const ctxMed = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageMed = await ctxMed.newPage();
  const erreursMed = [];
  pageMed.on('pageerror', (e) => erreursMed.push(`PAGEERROR: ${e.message}`));
  pageMed.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) erreursMed.push(`CONSOLE: ${m.text()}`); });
  await pageMed.goto(`${URL_BASE}/index.html`, { waitUntil: 'networkidle' });
  await pageMed.click('#btnAccueilModeClub');
  await pageMed.fill('#inputNomClub', 'Test Médical');
  await pageMed.click('#btnCreerClub');
  await pageMed.waitForTimeout(500);
  const diagPose = await pageMed.evaluate(() => {
    const K = 'rugbyManager.club.v1';
    const s = JSON.parse(localStorage.getItem(K));
    const j = s.clubJoueur.effectif[0];
    let seed = 24680;
    const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const b = window.RMClub.infligerBlessure(s, j, 'match', rng);
    localStorage.setItem(K, JSON.stringify(s));
    return { nom: j.nom, type: b.type, zone: b.zone, jours: b.joursReels, rechute: b.risqueRechute };
  });
  await pageMed.reload({ waitUntil: 'networkidle' });
  await pageMed.waitForTimeout(250);
  await pageMed.click('#btnContinuerClub');
  await pageMed.waitForTimeout(500);
  await clicOngletSur(pageMed, 'medical');
  await pageMed.waitForTimeout(350);
  const ecranMed = await pageMed.evaluate(() => ({
    texte: (document.getElementById('clubMedical') || {}).innerText || '',
    bouton: !!document.querySelector('.btnAccelerer'),
    badge: (document.querySelector('.badgeGravite') || {}).textContent || '',
  }));
  verifier('médical : le diagnostic (type et zone) survit au rechargement',
    ecranMed.texte.includes(diagPose.zone) && /Déchirure|Entorse|Contusion|Fracture|Luxation|Commotion/i.test(ecranMed.texte));
  verifier('médical : l\'écran annonce une FOURCHETTE de retour, pas un compteur nu',
    /Retour estimé/.test(ecranMed.texte) && /jour\(s\)/.test(ecranMed.texte));
  verifier('médical : la gravité est affichée en toutes lettres',
    /Légère|Modérée|Sérieuse|Grave/i.test(ecranMed.badge));
  verifier('médical : le risque de rechute est affiché', /Risque de rechute/.test(ecranMed.texte));
  // La décision d'accélérer : conséquence RÉELLE et persistée.
  const joursAvant = await pageMed.evaluate(() =>
    JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.effectif[0].blessureJournees);
  await pageMed.click('.btnAccelerer');
  await pageMed.waitForTimeout(250);
  await pageMed.click('#modalConfirmationValider');
  await pageMed.waitForTimeout(400);
  const apresAccel = await pageMed.evaluate(() => {
    const j = JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.effectif[0];
    return { jours: j.blessureJournees, rechute: j.blessure.risqueRechute, precipite: j.blessure.reprisePrecipitee };
  });
  verifier('médical : accélérer le retour raccourcit RÉELLEMENT l\'indisponibilité (sauvegardé)',
    apresAccel.jours < joursAvant);
  verifier('médical : accélérer augmente RÉELLEMENT le risque de rechute (sauvegardé)',
    apresAccel.rechute > diagPose.rechute && apresAccel.precipite === true);
  verifier('médical : aucune erreur console', erreursMed.length === 0);
  await ctxMed.close();

  // --- P1-41 : UNE vue « Préparer le match ». Mesuré avant : le même
  // adversaire, le même lieu et la MÊME date dans trois cartes du tableau de
  // bord (1001 px cumulés) et dans l'aperçu d'avant-match. ---
  const ctxPrep2 = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const pageP = await ctxPrep2.newPage();
  const erreursP = [];
  pageP.on('pageerror', (e) => erreursP.push(`PAGEERROR: ${e.message}`));
  pageP.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) erreursP.push(`CONSOLE: ${m.text()}`); });
  await pageP.goto(`${URL_BASE}/index.html`, { waitUntil: 'networkidle' });
  await pageP.click('#btnAccueilModeClub');
  await pageP.fill('#inputNomClub', 'Test Préparer');
  await pageP.click('#btnCreerClub');
  await pageP.waitForTimeout(600);

  // Le tableau de bord ne répète plus toute l'analyse de l'adversaire.
  const dash = await pageP.evaluate(() => {
    const v = document.querySelector('.voletOnglet[data-volet="dashboard"]');
    return {
      cartes: [...v.querySelectorAll('.carteClub')].filter((c) => c.offsetHeight > 0)
        .map((c) => ((c.querySelector('h3') || {}).textContent || '').trim()),
      hauteur: document.getElementById('clubMain').scrollHeight,
      bouton: !!document.getElementById('btnVersPreparer'),
      analyseComplete: !!v.querySelector('.ligneAdversaireAttr'),
    };
  });
  verifier('préparer : le tableau de bord propose un bouton « Préparer le match »', dash.bouton);
  verifier('préparer : le tableau de bord ne répète plus toute l\'analyse de l\'adversaire',
    !dash.analyseComplete);
  verifier('préparer : le tableau de bord tient en moins de 1600 px (mesuré à 1926 px avant)',
    dash.hauteur < 1600);

  // Le bouton mène à la vue unique.
  await pageP.click('#btnVersPreparer');
  await pageP.waitForTimeout(450);
  const vue = await pageP.evaluate(() => {
    const v = document.querySelector('.voletOnglet[data-volet="preparer"]');
    return {
      visible: v && v.style.display !== 'none',
      titres: [...v.querySelectorAll('.blocPreparer h3')].map((h) => h.textContent.trim()),
      texte: (document.getElementById('clubPreparer') || {}).innerText || '',
      boutonJouer: !!document.getElementById('btnLancerDepuisPreparer'),
      versCompo: !!v.querySelector('[data-vers="composition"]'),
      versTactique: !!v.querySelector('[data-vers="tactique"]'),
    };
  });
  verifier('préparer : le bouton ouvre la vue unique', vue.visible);
  verifier('préparer : les sections apparaissent dans l\'ordre demandé',
    vue.titres.length >= 4 && /rencontre/i.test(vue.titres[0]) && /régler/i.test(vue.titres[1]));
  verifier('préparer : la vue offre les raccourcis vers Composition ET Tactique',
    vue.versCompo && vue.versTactique);
  verifier('préparer : loin du match, AUCUN bouton « Jouer » n\'est proposé', !vue.boutonJouer);
  verifier('préparer : aucun compte à rebours négatif', !/dans -\d+/.test(vue.texte));

  // La date, l'adversaire et l'équipe sont IDENTIQUES entre le résumé du
  // tableau de bord et la vue de préparation.
  const coherence = await pageP.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    const d = window.RMClub.dossierPreparation(s);
    const arret = window.RMClub.prochainArret(s);
    return {
      memeDate: window.RMClub.dateISO(d.rencontre.date) === window.RMClub.dateISO(arret.date),
      memeAdv: d.adversaireNom === arret.adversaireNom,
      memeType: d.type === arret.type,
      vueContientAdv: (document.getElementById('clubPreparer').innerText || '').includes(d.adversaireNom || '@@'),
    };
  });
  verifier('préparer : la vue décrit la MÊME rencontre que prochainArret (date, adversaire, type)',
    coherence.memeDate && coherence.memeAdv && coherence.memeType && coherence.vueContientAdv);

  // Un réglage fait dans Tactique est CONSERVÉ au retour.
  await pageP.click('[data-vers="tactique"]');
  await pageP.waitForTimeout(350);
  await pageP.click('#clubTactique [data-axe="style"][data-valeur="large"]');
  await pageP.waitForTimeout(300);
  await clicOngletSur(pageP, 'preparer');
  await pageP.waitForTimeout(400);
  const conserve = await pageP.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    const slot = window.RMClub.slotCompositionPourEquipe(s, 'pro');
    return { style: slot.tactique && slot.tactique.style,
      texte: (document.getElementById('clubPreparer') || {}).innerText || '' };
  });
  verifier('préparer : un réglage fait dans Tactique est CONSERVÉ au retour',
    conserve.style === 'large' && /Tactique/.test(conserve.texte));
  // Les CINQ types de rencontre, y compris ceux dont l'adversaire n'est pas
  // un club consultable. Mesuré : pour un match d'Espoirs, `lienClub`
  // renvoyait « ? » et le nom de l'académie DISPARAISSAIT de la vue.
  const parType = await pageP.evaluate(() => {
    const K = 'rugbyManager.club.v1';
    const s = JSON.parse(localStorage.getItem(K));
    const moi = s.clubJoueur.id;
    const out = {};
    const fB = ((s.competitionB || {}).calendrier || []).find((f) => f.domicileId === moi || f.exterieurId === moi);
    if (fB) out.b = fB.date;
    window.RMClub.assurerCompetitionEspoirs(s);
    const fE = ((s.competitionEspoirs || {}).calendrier || []).find((f) => f.domicileId === moi || f.exterieurId === moi);
    if (fE) out.jeunes = fE.date;
    localStorage.setItem(K, JSON.stringify(s));
    return out;
  });
  for (const type of Object.keys(parType)) {
    await pageP.evaluate((iso) => {
      const K = 'rugbyManager.club.v1';
      const s = JSON.parse(localStorage.getItem(K));
      s.temps = Object.assign({}, s.temps, window.RMClub.dateDepuisISO(iso));
      localStorage.setItem(K, JSON.stringify(s));
    }, parType[type]);
    await pageP.reload({ waitUntil: 'networkidle' });
    await pageP.waitForTimeout(250);
    await pageP.click('#btnContinuerClub');
    await pageP.waitForTimeout(450);
    await pageP.evaluate(() => {
      const e = document.getElementById('panneauApercuMatch');
      if (e) e.classList.remove('visible');
    });
    await clicOngletSur(pageP, 'preparer');
    await pageP.waitForTimeout(400);
    const r = await pageP.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
      const d = window.RMClub.dossierPreparation(s);
      const z = document.getElementById('clubPreparer');
      return { type: d && d.type, equipe: d && d.equipe, adv: d && d.adversaireNom,
        nomme: !!(d && d.adversaireNom && z.innerText.includes(d.adversaireNom)),
        neg: /dans -\d+/.test(z.innerText) };
    });
    verifier(`préparer : la vue NOMME l'adversaire d'un match « ${type} » (${r.adv || '?'})`, r.nomme);
    verifier(`préparer : le type « ${type} » est bien reconnu`, r.type === type && !r.neg);
  }

  verifier('préparer : aucune erreur console', erreursP.length === 0);
  await ctxPrep2.close();

  // Fenêtres de transfert.
  await clicOngletSur(pagePrep, 'transferts');
  await pagePrep.waitForTimeout(250);
  const fenetreOuverte = await pagePrep.evaluate(() => ({
    texte: document.getElementById('clubFenetreTransfert').innerText,
    signerActifs: document.querySelectorAll('.btnSigner:not([disabled])').length,
  }));
  verifier('fenêtres de transfert : la fenêtre ouverte est annoncée avec sa date de fermeture',
    /ouvert/i.test(fenetreOuverte.texte) && /\b20\d\d\b/.test(fenetreOuverte.texte));
  verifier('fenêtres de transfert : pendant la fenêtre, les signatures sont bien possibles',
    fenetreOuverte.signerActifs > 0);
  // Hors fenêtre : boutons désactivés et explication affichée.
  await pagePrep.evaluate(() => {
    const K = 'rugbyManager.club.v1';
    const s = JSON.parse(localStorage.getItem(K));
    const RM = window.RMClub;
    const f = RM.fenetresTransfert(s);
    s.temps = Object.assign({}, s.temps, RM.ajouterJours(f[0].fin, 7));
    localStorage.setItem(K, JSON.stringify(s));
  });
  await pagePrep.reload({ waitUntil: 'networkidle' });
  await pagePrep.waitForTimeout(250);
  await pagePrep.click('#btnContinuerClub');
  await pagePrep.waitForTimeout(300);
  await clicOngletSur(pagePrep, 'transferts');
  await pagePrep.waitForTimeout(250);
  const fenetreFermee = await pagePrep.evaluate(() => ({
    texte: document.getElementById('clubFenetreTransfert').innerText,
    signerActifs: document.querySelectorAll('.btnSigner:not([disabled])').length,
    scouterActifs: document.querySelectorAll('.btnScouter:not([disabled])').length,
  }));
  verifier('fenêtres de transfert : hors fenêtre, le marché est annoncé fermé AVEC sa date de réouverture',
    /fermé/i.test(fenetreFermee.texte) && /Réouverture le/.test(fenetreFermee.texte));
  verifier('fenêtres de transfert : hors fenêtre, aucune signature n\'est possible',
    fenetreFermee.signerActifs === 0);
  verifier('fenêtres de transfert : le repérage, lui, reste ouvert toute l\'année',
    fenetreFermee.scouterActifs > 0);

  // Contrat ASYNCHRONE : la proposition part, le contrat ne bouge pas encore.
  await clicOngletSur(pagePrep, 'effectif');
  await pagePrep.waitForTimeout(250);
  await pagePrep.click('#clubEffectif tr[data-joueur]');
  await pagePrep.waitForTimeout(250);
  const avantContrat = await pagePrep.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    const id = window.__idFiche = document.querySelector('#clubEffectif tr[data-joueur]')
      ? null : null;
    return { negociations: (s.negociationsContrat || []).length };
  });
  if (await pagePrep.isVisible('#btnRenouveler')) {
    const salairesAvant = await pagePrep.evaluate(() =>
      JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.effectif.map((j) => j.salaire).join(','));
    await pagePrep.click('#btnRenouveler');
    await pagePrep.waitForSelector('#modalMontant.visible', { timeout: 5000 });
    await pagePrep.click('#modalMontantValider');
    await pagePrep.waitForTimeout(350);
    const apresProposition = await pagePrep.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
      return {
        negociations: (s.negociationsContrat || []).length,
        salaires: s.clubJoueur.effectif.map((j) => j.salaire).join(','),
        noteAttente: (document.getElementById('clubJoueurDetail') || {}).innerText || '',
      };
    });
    verifier('contrat asynchrone : proposer un contrat ouvre une négociation SANS rien changer immédiatement',
      apresProposition.negociations === avantContrat.negociations + 1
      && apresProposition.salaires === salairesAvant);
    verifier('contrat asynchrone : la fiche joueur annonce la date de réponse attendue au lieu de reproposer',
      /réponse attendue le/i.test(apresProposition.noteAttente));
  }

  // Direction : le point d'étape juge la position réelle.
  const pointEtape = await pagePrep.evaluate(() => {
    const K = 'rugbyManager.club.v1';
    const s = JSON.parse(localStorage.getItem(K));
    const RM = window.RMClub;
    const c = s.clubJoueur;
    c.confiancePresident = 60;
    const miens = s.calendrier.filter((f) => f.domicileId === c.id || f.exterieurId === c.id);
    for (const f of miens.slice(0, Math.ceil(miens.length * 0.4))) {
      RM.enregistrerResultat(s, f.id, f.domicileId === c.id ? 40 : 0, f.domicileId === c.id ? 0 : 40, 5, 0);
    }
    const res = RM.resoudrePointEtape(s);
    localStorage.setItem(K, JSON.stringify(s));
    return { res, confiance: c.confiancePresident, message: c.messages.some((m) => m.titre === "Point d'étape de la direction") };
  });
  verifier('direction : le point d\'étape juge la position RÉELLE et fait bouger la confiance du président',
    pointEtape.res && pointEtape.res.position === 1 && pointEtape.confiance > 60 && pointEtape.message);

  // Vestiaire : moral effondré → décision réelle, avec conséquence.
  const vestiaire = await pagePrep.evaluate(() => {
    const K = 'rugbyManager.club.v1';
    const s = JSON.parse(localStorage.getItem(K));
    const RM = window.RMClub;
    for (const j of s.clubJoueur.effectif) j.moral = 28;
    RM.declencherReunionVestiaire(s, RM.dateCourante(s));
    localStorage.setItem(K, JSON.stringify(s));
    return { moralAvant: RM.moralVestiaire(s) };
  });
  await pagePrep.reload({ waitUntil: 'networkidle' });
  await pagePrep.waitForTimeout(250);
  await pagePrep.click('#btnContinuerClub');
  await pagePrep.waitForTimeout(350);
  verifier('vestiaire : un moral collectif effondré déclenche une vraie décision dans la boîte de réception',
    (await pagePrep.textContent('#clubMessages')).includes('Ambiance du vestiaire'));
  const boutonReunir = await pagePrep.$('.btnDecisionMessage[data-option="reunir"]');
  verifier('vestiaire : la décision propose de vrais boutons d\'action', !!boutonReunir);
  if (boutonReunir) {
    await boutonReunir.click();
    await pagePrep.waitForTimeout(350);
    const apresReunion = await pagePrep.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
      const RM = window.RMClub;
      return {
        moral: RM.moralVestiaire(s),
        seanceLendemain: s.clubJoueur.semaineEntrainement[RM.jourSemaine(RM.ajouterJours(RM.dateCourante(s), 1))],
      };
    });
    verifier('vestiaire : réunir le groupe remonte RÉELLEMENT le moral et coûte la séance du lendemain',
      apresReunion.moral > vestiaire.moralAvant && apresReunion.seanceLendemain === 'recuperation');
  }
  verifier('tranche 4 : aucune erreur console sur le parcours préparation/transferts/direction/vestiaire',
    erreursPrep.length === 0);
  if (erreursPrep.length) console.error(erreursPrep.join('\n'));
  await contextePrep.close();

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
  // Recliqué à chaque arrêt, comme sur grand écran (une avance s'interrompt
  // sur tout événement réel, cf. TODO_AUDIT.md P1-26) — mais au doigt.
  for (let i = 0; i < 15 && !(await pageMobileTemps.isVisible('#panneauApercuMatch.visible')); i++) {
    await pageMobileTemps.tap('#btnApercuMatchFlottant');
    await pageMobileTemps.waitForTimeout(600);
  }
  verifier('mobile : « Continuer » avance bien la date jusqu\'au jour du match (ouverture de sa préparation)',
    await pageMobileTemps.isVisible('#panneauApercuMatch.visible'));
  verifier('mobile : aucune erreur console sur le parcours calendaire mobile', erreursMobileTemps.length === 0);
  await contexteMobileTemps.close();

  // 11 bis) Deux actions distinctes (TODO_AUDIT.md P1-26) : « Jour suivant »
  // avance d'exactement un jour, « Continuer » file vers le match mais
  // s'arrête sur tout événement réel (blessure d'entraînement, rapport,
  // réponse de contrat, décision). Testé dans un contexte propre, sur une
  // carrière neuve.
  const contexteAvance = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageAvance = await contexteAvance.newPage();
  const erreursAvance = [];
  pageAvance.on('pageerror', (e) => erreursAvance.push(`PAGEERROR: ${e.message}`));
  pageAvance.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) erreursAvance.push(`CONSOLE: ${m.text()}`);
  });
  await pageAvance.goto(`${URL_BASE}/index.html`, { waitUntil: 'networkidle' });
  await pageAvance.click('#btnAccueilModeClub');
  await pageAvance.fill('#inputNomClub', 'Test Avance Jour');
  await pageAvance.click('#btnCreerClub');
  await pageAvance.waitForTimeout(400);

  const dateAffichee = () => pageAvance.evaluate(
    () => window.RMClub.dateISO(window.RMClub.dateCourante(window.RMClub.chargerSaison())));

  verifier('avance : les DEUX boutons existent et sont distincts',
    (await pageAvance.isVisible('#btnJourSuivant')) && (await pageAvance.isVisible('#btnJouerMatchClub')));
  const libelleJour = (await pageAvance.textContent('#btnJourSuivant')).trim();
  verifier('avance : « Jour suivant » annonce la date qu\'il va atteindre (pas un libellé abstrait)',
    /^→ /.test(libelleJour) && libelleJour.length > 4);

  const dateAvant = await dateAffichee();
  await pageAvance.click('#btnJourSuivant');
  await pageAvance.waitForTimeout(350);
  const dateApres = await dateAffichee();
  const ecartUnJour = await pageAvance.evaluate(([a, b]) => {
    const R = window.RMClub;
    return R.ecartJours(R.dateDepuisISO(a), R.dateDepuisISO(b));
  }, [dateAvant, dateApres]);
  verifier('avance : « Jour suivant » avance d\'EXACTEMENT un jour', ecartUnJour === 1);
  verifier('avance : le libellé du bouton suit la nouvelle date',
    (await pageAvance.textContent('#btnJourSuivant')).trim() !== libelleJour);

  // « Continuer » : au plus quelques clics doivent mener au match (chaque
  // arrêt intermédiaire est un vrai événement, jamais un blocage).
  let clics = 0;
  let apercuOuvert = false;
  while (clics < 12 && !apercuOuvert) {
    await pageAvance.click('#btnJouerMatchClub');
    await pageAvance.waitForTimeout(700);
    apercuOuvert = await pageAvance.isVisible('#panneauApercuMatch.visible');
    clics++;
  }
  verifier('avance : « Continuer » finit toujours par atteindre le match (aucun blocage)', apercuOuvert);
  verifier('avance : le match est atteint en quelques clics, pas en dizaines', clics <= 12);
  verifier('avance : « Jour suivant » disparaît le jour du match (il le sauterait)',
    !(await pageAvance.isVisible('#btnJourSuivant')));
  verifier('avance : aucune erreur console sur le parcours des deux actions', erreursAvance.length === 0);
  await contexteAvance.close();

  // 11 ter) De vraies dates dans TOUS les calendriers (TODO_AUDIT.md P1-27) :
  // l'écran Calendrier n'affichait que « Journée N », alors que la carrière
  // est datée depuis P1-21. Vérifié pour les TROIS équipes, via le même
  // écran unique et le sélecteur d'équipe commun.
  const contexteDates = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageDates = await contexteDates.newPage();
  const erreursDates = [];
  pageDates.on('pageerror', (e) => erreursDates.push(`PAGEERROR: ${e.message}`));
  pageDates.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) erreursDates.push(`CONSOLE: ${m.text()}`);
  });
  await pageDates.goto(`${URL_BASE}/index.html`, { waitUntil: 'networkidle' });
  await pageDates.click('#btnAccueilModeClub');
  await pageDates.fill('#inputNomClub', 'Test Dates Calendrier');
  await pageDates.click('#btnCreerClub');
  await pageDates.waitForTimeout(400);

  const MOTIF_DATE = /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b \d{1,2} \p{L}+ 20\d\d/u;

  // Depuis P1-35 la carte n'annonce plus qu'UNE rencontre : elle la date donc
  // en toutes lettres (« samedi 7 septembre 2024 ») plutôt qu'en abrégé, qui
  // n'avait de sens que pour une liste de sept lignes.
  verifier('dates : la carte « Prochaine échéance » date la rencontre en clair',
    MOTIF_DATE.test(await pageDates.textContent('#clubProchainMatch')));

  const datesParEquipe = {};
  for (const equipe of ['pro', 'b', 'jeunes']) {
    // Depuis P1-33, le Calendrier suit la COMPÉTITION choisie dans la
    // navigation partagée, plus l'équipe sélectionnée.
    await clicOngletSur(pageDates, 'calendrier');
    await pageDates.waitForTimeout(250);
    // Le championnat du joueur porte ⭐ : « Ligue » seul matcherait aussi les
    // deux autres paliers français, dont les calendriers sont abstraits.
    const libelleCompetition = { pro: 'Ligue Régionale', b: 'Équipe B', jeunes: 'espoirs' }[equipe];
    const bouton = pageDates.locator('.btnChampionnatNav', { hasText: libelleCompetition }).first();
    if (!(await bouton.count())) continue;
    await bouton.click();
    await pageDates.waitForTimeout(350);
    const texte = await pageDates.textContent('#clubCalendrier');
    datesParEquipe[equipe] = (texte.match(MOTIF_DATE) || [])[0] || null;
    verifier(`dates : le calendrier de l'équipe « ${equipe} » affiche une vraie date en clair`,
      MOTIF_DATE.test(texte));
  }
  // Les trois équipes ne jouent pas le même jour : c'est visible à l'écran,
  // pas seulement dans les données (mercredi espoirs, samedi pro, dimanche B).
  const joursDistincts = new Set(Object.values(datesParEquipe).filter(Boolean));
  verifier('dates : les calendriers des trois équipes affichent des jours DIFFÉRENTS',
    joursDistincts.size === Object.values(datesParEquipe).filter(Boolean).length);
  verifier('dates : la rencontre des espoirs est bien annoncée un mercredi',
    !datesParEquipe.jeunes || /mercredi/.test(datesParEquipe.jeunes));
  verifier('dates : aucune erreur console sur l\'écran Calendrier daté', erreursDates.length === 0);
  await contexteDates.close();

  // 11 quater) Navigation PAYS -> CHAMPIONNAT (TODO_AUDIT.md P1-28) : on doit
  // pouvoir parcourir les 12 pays, ouvrir n'importe quel championnat avec son
  // classement ET son calendrier, et cliquer le nom de n'importe quel club —
  // y compris à l'autre bout du monde.
  const contexteNav = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageNav = await contexteNav.newPage();
  const erreursNav = [];
  pageNav.on('pageerror', (e) => erreursNav.push(`PAGEERROR: ${e.message}`));
  pageNav.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) erreursNav.push(`CONSOLE: ${m.text()}`);
  });
  await pageNav.goto(`${URL_BASE}/index.html`, { waitUntil: 'networkidle' });
  await pageNav.click('#btnAccueilModeClub');
  await pageNav.fill('#inputNomClub', 'Test Navigation Monde');
  await pageNav.click('#btnCreerClub');
  await pageNav.waitForTimeout(400);
  await clicOngletSur(pageNav, 'classement');
  await pageNav.waitForTimeout(400);

  const nbPays = await pageNav.evaluate(() => document.querySelectorAll('.btnPaysNav').length);
  verifier('navigation monde : les 12 pays sont proposés', nbPays >= 12);
  verifier('navigation monde : le championnat du joueur est signalé (⭐)',
    (await pageNav.textContent('#clubNavChampionnats')).includes('⭐'));
  verifier('navigation monde : aucun SÉLECTEUR de club (règle P1-20)',
    await pageNav.evaluate(() => !document.querySelector('#clubCompetitionClassement select')
      && !document.querySelector('#clubNavPays select')));

  // Aller au Japon : un pays où le joueur n'a aucun club.
  await pageNav.locator('.btnPaysNav', { hasText: 'Japon' }).first().click();
  await pageNav.waitForTimeout(400);
  const titreJapon = await pageNav.textContent('#titreCompetitionChoisie');
  verifier('navigation monde : ouvrir un pays étranger affiche son championnat',
    titreJapon.length > 3 && !titreJapon.includes('ton championnat'));
  const classementJapon = await pageNav.textContent('#clubCompetitionClassement');
  verifier('navigation monde : le classement étranger affiche de VRAIS noms de clubs (pas « ? »)',
    classementJapon.trim().length > 40 && !/\?\s*0\s*0/.test(classementJapon));
  verifier('navigation monde : le calendrier du championnat étranger est affiché',
    (await pageNav.textContent('#clubCalendrier')).includes('Journée'));
  const clubsCliquablesJapon = await pageNav.evaluate(
    () => document.querySelectorAll('#clubCompetitionClassement .lienClub').length);
  verifier('navigation monde : les clubs étrangers sont cliquables', clubsCliquablesJapon >= 8);

  // Ouvrir un club étranger : il doit s'ouvrir réellement, et dire
  // honnêtement que son effectif n'est pas connu — sans rien inventer.
  const nomClubEtranger = (await pageNav.locator('#clubCompetitionClassement .lienClub').first().textContent()).trim();
  await pageNav.locator('#clubCompetitionClassement .lienClub').first().click();
  await pageNav.waitForTimeout(600);
  const enteteEtranger = await pageNav.textContent('#clubEntete');
  verifier('navigation monde : cliquer un club étranger ouvre RÉELLEMENT sa fiche',
    enteteEtranger.includes(nomClubEtranger) && enteteEtranger.includes('Club consulté'));
  verifier('navigation monde : un retour vers son propre club est proposé',
    await pageNav.isVisible('#btnRetourMonClub'));
  const vueEtranger = await pageNav.textContent('#clubVueConsulteAnalyse');
  verifier('navigation monde : l\'effectif inconnu est annoncé honnêtement, jamais fabriqué',
    /n\'est pas simulé|pas connu/i.test(vueEtranger));
  await clicOngletSur(pageNav, 'effectif');
  await pageNav.waitForTimeout(300);
  const effectifEtranger = await pageNav.textContent('#clubEffectif');
  verifier('navigation monde : aucun joueur inventé pour un club étranger',
    !/\d+\s*an\(s\)/.test(effectifEtranger));

  // Retour à son club : la carrière reprend normalement.
  await pageNav.click('#btnRetourMonClub');
  await pageNav.waitForTimeout(400);
  verifier('navigation monde : « Retour à mon club » ramène bien à son propre club',
    (await pageNav.textContent('#clubEntete')).includes('Test Navigation Monde'));
  verifier('navigation monde : aucune erreur console sur tout le parcours', erreursNav.length === 0);
  await contexteNav.close();

  // 11 quinquies) Effectifs complets des clubs adverses (TODO_AUDIT.md P1-29) :
  // leur banc doit être RÉEL et visible, et leur groupe persisté.
  const contexteAdv = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageAdv = await contexteAdv.newPage();
  const erreursAdv = [];
  pageAdv.on('pageerror', (e) => erreursAdv.push(`PAGEERROR: ${e.message}`));
  pageAdv.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) erreursAdv.push(`CONSOLE: ${m.text()}`);
  });
  await pageAdv.goto(`${URL_BASE}/index.html`, { waitUntil: 'networkidle' });
  await pageAdv.click('#btnAccueilModeClub');
  await pageAdv.fill('#inputNomClub', 'Test Effectifs Adverses');
  await pageAdv.click('#btnCreerClub');
  await pageAdv.waitForTimeout(500);

  const etatAdv = await pageAdv.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    return {
      groupes: s.adversaires.map((a) => (a.groupe || []).length),
      bancs: s.adversaires.map((a) => (a.banc || []).length),
      tailleKo: Math.round(localStorage.getItem('rugbyManager.club.v1').length / 1024),
    };
  });
  verifier('effectifs adverses : chaque club adverse a un groupe complet persisté',
    etatAdv.groupes.length > 0 && etatAdv.groupes.every((n) => n >= 23));
  verifier('effectifs adverses : chaque club adverse a un banc de 8 persisté',
    etatAdv.bancs.every((n) => n === 8));
  verifier('effectifs adverses : la sauvegarde reste d\'une taille raisonnable (< 3 Mo)',
    etatAdv.tailleKo < 3072);

  await clicOngletSur(pageAdv, 'classement');
  await pageAdv.waitForTimeout(400);
  const idJoueurAdv = await pageAdv.evaluate(
    () => JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.id);
  await pageAdv.click(`#clubCompetitionClassement .lienClub:not([data-club="${idJoueurAdv}"])`);
  await pageAdv.waitForTimeout(600);
  await clicOngletSur(pageAdv, 'composition');
  await pageAdv.waitForTimeout(500);
  const bancAdverse = await pageAdv.textContent('#clubBanc');
  verifier('effectifs adverses : le banc d\'un adversaire est RÉELLEMENT affiché (plus « pas connu »)',
    /N°16/.test(bancAdverse) && /N°23/.test(bancAdverse) && !/n\'est pas connu/.test(bancAdverse));
  verifier('effectifs adverses : les remplaçants adverses portent de vrais noms',
    (bancAdverse.match(/N°\d+ · /g) || []).length >= 8);
  verifier('effectifs adverses : aucune erreur console', erreursAdv.length === 0);
  await contexteAdv.close();

  // 11 sexies) Page joueur (TODO_AUDIT.md P1-30) : statistiques par
  // compétition, historique des saisons et totaux de carrière — tous dérivés
  // de données réelles, aucun tableau vide décoratif.
  const contexteFiche = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const pageFiche = await contexteFiche.newPage();
  const erreursFiche = [];
  pageFiche.on('pageerror', (e) => erreursFiche.push(`PAGEERROR: ${e.message}`));
  pageFiche.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) erreursFiche.push(`CONSOLE: ${m.text()}`);
  });
  await pageFiche.goto(`${URL_BASE}/index.html`, { waitUntil: 'networkidle' });
  await pageFiche.click('#btnAccueilModeClub');
  await pageFiche.fill('#inputNomClub', 'Test Page Joueur');
  await pageFiche.click('#btnCreerClub');
  await pageFiche.waitForTimeout(400);

  // Un joueur tout neuf n'a RIEN joué : aucun des trois blocs ne doit
  // apparaître (pas de tableau vide pour faire joli).
  const idPremier = await pageFiche.evaluate(
    () => JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.effectif[0].id);
  await clicOngletSur(pageFiche, 'effectif');
  await pageFiche.waitForTimeout(300);
  await pageFiche.click(`#clubEffectif tr[data-joueur="${idPremier}"]`);
  await pageFiche.waitForTimeout(300);
  const ficheVierge = await pageFiche.textContent('#clubJoueurDetail');
  verifier('page joueur : aucun tableau de statistiques pour un joueur qui n\'a rien joué',
    !/Par compétition/.test(ficheVierge) && !/Historique des saisons/.test(ficheVierge) && !/Carrière/.test(ficheVierge));

  // Puis avec des données RÉELLES injectées dans la sauvegarde.
  await pageFiche.evaluate((id) => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    const j = s.clubJoueur.effectif.find((x) => x.id === id);
    j.statsSaison = { matchsJoues: 9, essais: 4, passes: 31, tacklesMade: 70, tacklesAttempted: 82, metresGagnes: 210,
      parCompetition: {
        pro: { matchsJoues: 6, essais: 3, passes: 22, tacklesMade: 50, tacklesAttempted: 58, metresGagnes: 160 },
        b: { matchsJoues: 3, essais: 1, passes: 9, tacklesMade: 20, tacklesAttempted: 24, metresGagnes: 50 },
      } };
    j.historiqueSaisons = [{ saisonNumero: 1, club: 'Test Page Joueur', age: 23, matchsJoues: 22, essais: 6,
      passes: 80, tacklesMade: 180, tacklesAttempted: 210, metresGagnes: 520, parCompetition: {} }];
    localStorage.setItem('rugbyManager.club.v1', JSON.stringify(s));
  }, idPremier);
  await pageFiche.reload({ waitUntil: 'networkidle' });
  await pageFiche.waitForTimeout(250);
  await pageFiche.click('#btnContinuerClub');
  await pageFiche.waitForTimeout(400);
  await clicOngletSur(pageFiche, 'effectif');
  await pageFiche.waitForTimeout(300);
  await pageFiche.click(`#clubEffectif tr[data-joueur="${idPremier}"]`);
  await pageFiche.waitForTimeout(400);
  const fiche = (await pageFiche.textContent('#clubJoueurDetail')).replace(/\s+/g, ' ');
  verifier('page joueur : les statistiques sont ventilées par compétition (Championnat ET Équipe B)',
    /Par compétition/.test(fiche) && /Championnat/.test(fiche) && /Équipe B/.test(fiche));
  verifier('page joueur : l\'historique des saisons est affiché avec le club et l\'âge',
    /Historique des saisons/.test(fiche) && /Test Page Joueur/.test(fiche));
  verifier('page joueur : les totaux de carrière additionnent réellement historique + saison en cours',
    /Carrière/.test(fiche) && /Saisons jouées ?2/.test(fiche.replace(/\s/g, ' '))
    && fiche.includes('31') && fiche.includes('730'));
  verifier('page joueur : aucune erreur console', erreursFiche.length === 0);
  await contexteFiche.close();

  // 11 septies) Championnat des espoirs (TODO_AUDIT.md P1-31) : un vrai
  // classement à plusieurs académies, un calendrier daté, et des noms réels.
  const contexteEsp = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageEsp = await contexteEsp.newPage();
  const erreursEsp = [];
  pageEsp.on('pageerror', (e) => erreursEsp.push(`PAGEERROR: ${e.message}`));
  pageEsp.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) erreursEsp.push(`CONSOLE: ${m.text()}`);
  });
  await pageEsp.goto(`${URL_BASE}/index.html`, { waitUntil: 'networkidle' });
  await pageEsp.click('#btnAccueilModeClub');
  await pageEsp.fill('#inputNomClub', 'Test Championnat Espoirs');
  await pageEsp.click('#btnCreerClub');
  await pageEsp.waitForTimeout(400);
  await clicOngletSur(pageEsp, 'classement');
  await pageEsp.waitForTimeout(250);
  await pageEsp.locator('.btnChampionnatNav', { hasText: 'espoirs' }).first().click();
  await pageEsp.waitForTimeout(400);

  verifier('championnat espoirs : l\'écran annonce un CHAMPIONNAT, plus un simple bilan',
    (await pageEsp.textContent('#titreCompetitionChoisie')).includes('Championnat des espoirs'));
  const classementEsp = await pageEsp.textContent('#clubCompetitionClassement');
  verifier('championnat espoirs : le classement compte plusieurs académies, toutes NOMMÉES (pas de « ? »)',
    (classementEsp.match(/Académie /g) || []).length >= 3 && !/\?\s*0\s*0/.test(classementEsp));
  await clicOngletSur(pageEsp, 'calendrier');
  await pageEsp.waitForTimeout(350);
  const calendrierEsp = await pageEsp.textContent('#clubCalendrier');
  verifier('championnat espoirs : son calendrier est daté et tombe un mercredi',
    /mercredi \d{1,2} \p{L}+ 20\d\d/u.test(calendrierEsp));

  // Jouer jusqu'à la première journée espoirs : le classement doit bouger.
  await clicOngletSur(pageEsp, 'dashboard');
  await pageEsp.waitForTimeout(200);
  await pageEsp.evaluate(() => { document.getElementById('selDureeClub').value = '300'; });
  let rencontresJouees = 0;
  for (let i = 0; i < 25 && rencontresJouees === 0; i++) {
    rencontresJouees = await pageEsp.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
      return ((s.competitionEspoirs || {}).calendrier || []).filter((f) => f.joue).length;
    });
    if (rencontresJouees > 0) break;
    await pageEsp.click('#btnJouerMatchClub');
    await pageEsp.waitForTimeout(900);
    if (await pageEsp.isVisible('#panneauApercuMatch.visible')) {
      await pageEsp.click('#btnApercuLancerMatch');
      await pageEsp.waitForSelector('#panneauResultat.visible', { timeout: 60000 });
      await pageEsp.click('#btnResultatFermer');
      await pageEsp.waitForTimeout(500);
    }
  }
  verifier('championnat espoirs : une journée entière se joue (pas seulement le match du joueur)',
    rencontresJouees >= 2);
  await clicOngletSur(pageEsp, 'classement');
  await pageEsp.waitForTimeout(250);
  await pageEsp.locator('.btnChampionnatNav', { hasText: 'espoirs' }).first().click();
  await pageEsp.waitForTimeout(400);
  const classementApresEsp = await pageEsp.textContent('#clubCompetitionClassement');
  verifier('championnat espoirs : le classement bouge RÉELLEMENT après une journée',
    classementApresEsp !== classementEsp && /[1-9]/.test(classementApresEsp));
  verifier('championnat espoirs : aucune erreur console', erreursEsp.length === 0);
  await contexteEsp.close();

  // 11 octies) Match amical (TODO_AUDIT.md P1-32) : proposé depuis la page du
  // club consulté, programmé sur une date libre, joué à SA date, sans jamais
  // toucher le championnat.
  const contexteAmi = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageAmi = await contexteAmi.newPage();
  const erreursAmi = [];
  pageAmi.on('pageerror', (e) => erreursAmi.push(`PAGEERROR: ${e.message}`));
  pageAmi.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) erreursAmi.push(`CONSOLE: ${m.text()}`);
  });
  await pageAmi.goto(`${URL_BASE}/index.html`, { waitUntil: 'networkidle' });
  await pageAmi.click('#btnAccueilModeClub');
  await pageAmi.fill('#inputNomClub', 'Test Amical');
  await pageAmi.click('#btnCreerClub');
  await pageAmi.waitForTimeout(400);
  await pageAmi.evaluate(() => { document.getElementById('selDureeClub').value = '300'; });

  // On ouvre un club en cliquant son NOM (jamais un sélecteur d'adversaire).
  await clicOngletSur(pageAmi, 'classement');
  await pageAmi.waitForTimeout(400);
  const idJoueurAmi = await pageAmi.evaluate(
    () => JSON.parse(localStorage.getItem('rugbyManager.club.v1')).clubJoueur.id);
  await pageAmi.click(`#clubCompetitionClassement .lienClub:not([data-club="${idJoueurAmi}"])`);
  await pageAmi.waitForTimeout(600);
  await clicOngletSur(pageAmi, 'dashboard');
  await pageAmi.waitForTimeout(400);

  verifier('amical : la proposition vit sur la page du club consulté (pas de sélecteur d\'adversaire)',
    (await pageAmi.isVisible('#btnProposerAmical'))
    && await pageAmi.evaluate(() => !document.querySelector('#clubVueConsulteAmical select[id*="Club"]')));
  const nbDatesLibres = await pageAmi.evaluate(() => document.querySelectorAll('#selDateAmical option').length);
  verifier('amical : de vraies dates libres sont proposées', nbDatesLibres > 0);

  await pageAmi.selectOption('#selDateAmical', { index: 0 });
  const dateChoisie = await pageAmi.evaluate(() => document.getElementById('selDateAmical').value);
  await pageAmi.click('#btnProposerAmical');
  await pageAmi.waitForTimeout(500);
  const amicalEnregistre = await pageAmi.evaluate(
    () => (JSON.parse(localStorage.getItem('rugbyManager.club.v1')).amicaux || [])[0]);
  verifier('amical : la rencontre est RÉELLEMENT programmée à la date choisie',
    !!amicalEnregistre && amicalEnregistre.date === dateChoisie && !amicalEnregistre.joue);

  await pageAmi.click('#btnRetourMonClub');
  await pageAmi.waitForTimeout(400);
  await clicOngletSur(pageAmi, 'dashboard');
  await pageAmi.waitForTimeout(400);
  verifier('amical : il devient une vraie échéance annoncée par le bouton principal',
    (await pageAmi.textContent('#btnJouerMatchClub')).includes('Continuer jusqu\'au'));

  let amicalJoue = false;
  for (let i = 0; i < 12 && !amicalJoue; i++) {
    amicalJoue = await pageAmi.evaluate(
      () => ((JSON.parse(localStorage.getItem('rugbyManager.club.v1')).amicaux || [])[0] || {}).joue === true);
    if (amicalJoue) break;
    await pageAmi.click('#btnJouerMatchClub');
    await pageAmi.waitForTimeout(900);
    if (await pageAmi.isVisible('#panneauResultat.visible')) {
      await pageAmi.click('#btnResultatFermer');
      await pageAmi.waitForTimeout(600);
    } else if (await pageAmi.isVisible('#panneauApercuMatch.visible')) {
      await pageAmi.click('#btnApercuLancerMatch');
      await pageAmi.waitForSelector('#panneauResultat.visible', { timeout: 60000 });
      await pageAmi.click('#btnResultatFermer');
      await pageAmi.waitForTimeout(600);
    }
  }
  const bilanAmi = await pageAmi.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    return { amical: (s.amicaux || [])[0], journees: s.calendrier.filter((f) => f.joue).length,
      fatigueMax: Math.max.apply(null, s.clubJoueur.effectif.map((j) => j.fatigue || 0)) };
  });
  verifier('amical : il se joue RÉELLEMENT à sa date, avec un score du moteur',
    !!bilanAmi.amical && bilanAmi.amical.joue === true && bilanAmi.amical.score
    && Number.isFinite(bilanAmi.amical.score.pour));
  verifier('amical : il ne fait avancer AUCUNE journée de championnat', bilanAmi.journees === 0);
  verifier('amical : il fatigue réellement les joueurs alignés', bilanAmi.fatigueMax > 0);
  verifier('amical : aucune erreur console', erreursAmi.length === 0);
  await contexteAmi.close();

  // 11 nonies) Coupes (TODO_AUDIT.md P1-34) : les quatre compétitions à
  // élimination directe existent, sont navigables, et se jouent réellement.
  const contexteCoupe = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageCoupe = await contexteCoupe.newPage();
  const erreursCoupe = [];
  pageCoupe.on('pageerror', (e) => erreursCoupe.push(`PAGEERROR: ${e.message}`));
  pageCoupe.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) erreursCoupe.push(`CONSOLE: ${m.text()}`);
  });
  await pageCoupe.goto(`${URL_BASE}/index.html`, { waitUntil: 'networkidle' });
  await pageCoupe.click('#btnAccueilModeClub');
  await pageCoupe.fill('#inputNomClub', 'Test Coupes');
  await pageCoupe.click('#btnCreerClub');
  await pageCoupe.waitForTimeout(400);
  await pageCoupe.evaluate(() => { document.getElementById('selDureeClub').value = '300'; });
  await clicOngletSur(pageCoupe, 'classement');
  await pageCoupe.waitForTimeout(700);

  const championnatsCoupe = await pageCoupe.textContent('#clubNavChampionnats');
  verifier('coupes : les QUATRE coupes figurent dans la navigation des compétitions',
    /Coupe Nationale/.test(championnatsCoupe) && /Coupe des Champions/.test(championnatsCoupe)
    && /Coupe Challenge/.test(championnatsCoupe) && /Coupe des Espoirs/.test(championnatsCoupe));

  await pageCoupe.locator('.btnChampionnatNav', { hasText: 'Coupe Nationale' }).first().click();
  await pageCoupe.waitForTimeout(400);
  const classementCoupe = await pageCoupe.textContent('#clubCompetitionClassement');
  verifier('coupes : une coupe annonce qu\'elle n\'a PAS de classement (pas de table inventée)',
    /élimination directe/.test(classementCoupe) && !/<table/.test(classementCoupe));
  await clicOngletSur(pageCoupe, 'calendrier');
  await pageCoupe.waitForTimeout(400);
  const calendrierCoupe = await pageCoupe.textContent('#clubCalendrier');
  verifier('coupes : son calendrier nomme les tours et les date',
    /(Seizièmes|Huitièmes|Quarts) de finale/.test(calendrierCoupe)
    && /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b \d{1,2} \p{L}+ 20\d\d/u.test(calendrierCoupe));
  verifier('coupes : le club du joueur est engagé dans la coupe nationale',
    calendrierCoupe.includes('Test Coupes'));

  // Jouer jusqu'à la première rencontre de coupe du club du joueur.
  await pageCoupe.evaluate(() => document.querySelector('.ongletBtn[data-onglet="dashboard"]').click());
  await pageCoupe.waitForTimeout(500);
  let coupeJouee = false;
  for (let i = 0; i < 30 && !coupeJouee; i++) {
    coupeJouee = await pageCoupe.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
      const coupes = s.coupes || {};
      return Object.keys(coupes).some((k) => coupes[k].tours.some(
        (t) => t.rencontres.some((r) => r.joue && (r.domicileId === s.clubJoueur.id || r.exterieurId === s.clubJoueur.id))));
    });
    if (coupeJouee) break;
    await pageCoupe.evaluate(() => document.getElementById('btnJouerMatchClub').click());
    await pageCoupe.waitForTimeout(1000);
    if (await pageCoupe.isVisible('#panneauResultat.visible')) {
      await pageCoupe.click('#btnResultatFermer');
      await pageCoupe.waitForTimeout(600);
    } else if (await pageCoupe.isVisible('#panneauApercuMatch.visible')) {
      await pageCoupe.click('#btnApercuLancerMatch');
      await pageCoupe.waitForSelector('#panneauResultat.visible', { timeout: 60000 });
      await pageCoupe.click('#btnResultatFermer');
      await pageCoupe.waitForTimeout(600);
    }
  }
  verifier('coupes : une rencontre de coupe du joueur se joue RÉELLEMENT à sa date', coupeJouee);
  const bilanCoupe = await pageCoupe.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    const coupes = s.coupes || {};
    let jouees = 0, sansVainqueur = 0;
    for (const k of Object.keys(coupes)) {
      for (const t of coupes[k].tours) {
        for (const r of t.rencontres) {
          if (!r.joue) continue;
          jouees++;
          if (!r.vainqueurId) sansVainqueur++;
        }
      }
    }
    return { jouees, sansVainqueur,
      message: (s.clubJoueur.messages || []).map((m) => m.corps).find((x) => /Qualifié|Éliminé/.test(x)) };
  });
  verifier('coupes : AUCUNE rencontre jouée ne reste sans vainqueur (pas de nul en coupe)',
    bilanCoupe.jouees > 0 && bilanCoupe.sansVainqueur === 0);
  verifier('coupes : le résultat produit un message réel (qualifié ou éliminé)',
    !!bilanCoupe.message);
  verifier('coupes : aucune erreur console', erreursCoupe.length === 0);
  await contexteCoupe.close();

  // 11 decies) Carte « Prochaine échéance » (TODO_AUDIT.md P1-35) : UNE
  // rencontre, la même que celle visée par le bouton « Continuer ».
  const contexteEch = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const pageEch = await contexteEch.newPage();
  const erreursEch = [];
  pageEch.on('pageerror', (e) => erreursEch.push(`PAGEERROR: ${e.message}`));
  pageEch.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) erreursEch.push(`CONSOLE: ${m.text()}`);
  });
  await pageEch.goto(`${URL_BASE}/index.html`, { waitUntil: 'networkidle' });
  await pageEch.click('#btnAccueilModeClub');
  await pageEch.fill('#inputNomClub', 'Test Echeance');
  await pageEch.click('#btnCreerClub');
  await pageEch.waitForTimeout(500);
  await pageEch.evaluate(() => { document.getElementById('selDureeClub').value = '300'; });

  verifier('échéance : la carte n\'affiche QU\'UNE rencontre, pas toute la journée de championnat',
    await pageEch.evaluate(() => document.querySelectorAll('#clubProchainMatch .echeancePrincipale').length === 1
      && document.querySelectorAll('#clubProchainMatch .ligneCalendrier').length === 0));
  verifier('échéance : la carte nomme l\'adversaire, le lieu et la date',
    /à domicile|à l'extérieur/.test(await pageEch.textContent('#clubProchainMatch'))
    && /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b \d{1,2} \p{L}+ 20\d\d/u.test(
      await pageEch.textContent('#clubProchainMatch')));

  // Cohérence carte / bouton, y compris APRÈS le match de championnat —
  // c'est là que la carte annonçait le samedi suivant pendant que le bouton
  // visait l'Équipe B du dimanche.
  async function datesCarteEtBouton() {
    return pageEch.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
      const arret = window.RMClub.prochainArret(s);
      return {
        attendue: window.RMClub.formaterDateLongue(arret.date),
        carte: document.getElementById('clubProchainMatch').textContent,
        bouton: document.getElementById('btnJouerMatchClub').textContent,
      };
    });
  }
  const echAvant = await datesCarteEtBouton();
  verifier('échéance : avant le match, carte et bouton annoncent la même date',
    echAvant.carte.includes(echAvant.attendue) && echAvant.bouton.includes(echAvant.attendue));

  for (let i = 0; i < 20; i++) {
    await pageEch.evaluate(() => document.getElementById('btnJouerMatchClub').click());
    await pageEch.waitForTimeout(900);
    if (await pageEch.isVisible('#panneauApercuMatch.visible')) {
      await pageEch.click('#btnApercuLancerMatch');
      await pageEch.waitForSelector('#panneauResultat.visible', { timeout: 60000 });
      await pageEch.click('#btnResultatFermer');
      await pageEch.waitForTimeout(800);
      break;
    }
    if (await pageEch.isVisible('#panneauResultat.visible')) {
      await pageEch.click('#btnResultatFermer');
      await pageEch.waitForTimeout(800);
    }
  }
  const echApres = await datesCarteEtBouton();
  verifier('échéance : APRÈS le match de championnat, carte et bouton restent d\'accord',
    echApres.carte.includes(echApres.attendue) && echApres.bouton.includes(echApres.attendue));
  verifier('échéance : aucune erreur console', erreursEch.length === 0);
  await contexteEch.close();

  // 11 undecies) Zone « À traiter » (TODO_AUDIT.md P1-36) : décisions,
  // urgences et messages non lus au même endroit, classés, cliquables.
  const contexteTr = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const pageTr = await contexteTr.newPage();
  const erreursTr = [];
  pageTr.on('pageerror', (e) => erreursTr.push(`PAGEERROR: ${e.message}`));
  pageTr.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) erreursTr.push(`CONSOLE: ${m.text()}`);
  });
  await pageTr.goto(`${URL_BASE}/index.html`, { waitUntil: 'networkidle' });
  await pageTr.click('#btnAccueilModeClub');
  await pageTr.fill('#inputNomClub', 'Test A Traiter');
  await pageTr.click('#btnCreerClub');
  await pageTr.waitForTimeout(500);
  // État RÉEL injecté dans la sauvegarde : un blessé, un joueur cuit, une
  // décision en attente, deux messages non lus.
  await pageTr.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    s.clubJoueur.effectif[0].blessureJournees = 12;
    s.clubJoueur.effectif[1].fatigue = 85;
    s.clubJoueur.messages = [
      { id: 'm1', categorie: 'match', titre: 'Victoire', corps: 'x', lu: false, decision: null, saisonNumero: 1 },
      { id: 'm2', categorie: 'joueur', titre: 'Temps de jeu insuffisant', corps: 'y', lu: false, saisonNumero: 1,
        decision: { type: 'tempsDeJeu', joueurId: s.clubJoueur.effectif[2].id,
          options: [{ id: 'rassurer', label: 'Le rassurer' }, { id: 'ignorer', label: 'Ignorer' }] } },
    ];
    localStorage.setItem('rugbyManager.club.v1', JSON.stringify(s));
  });
  await pageTr.reload({ waitUntil: 'networkidle' });
  await pageTr.waitForTimeout(250);
  await pageTr.click('#btnContinuerClub');
  await pageTr.waitForTimeout(600);

  const zoneTr = await pageTr.evaluate(() => ({
    titre: document.querySelector('#carteAlertes h3').textContent,
    lignes: [...document.querySelectorAll('#clubAlertes .ligneAlerte')].map((l) => ({
      niveau: [...l.classList].find((c) => c.startsWith('niveau-')),
      badge: l.querySelector('.badgeNiveau').textContent,
      onglet: l.dataset.onglet,
    })),
  }));
  verifier('à traiter : la décision à trancher est en TÊTE de liste',
    zoneTr.lignes.length > 0 && zoneTr.lignes[0].niveau === 'niveau-decision');
  verifier('à traiter : l\'entête annonce le nombre réel de décisions et d\'urgences',
    /à décider/.test(zoneTr.titre) && /urgent/.test(zoneTr.titre));
  verifier('à traiter : chaque ligne porte un badge de niveau EN TOUTES LETTRES',
    zoneTr.lignes.every((l) => l.badge && l.badge.length > 3));
  verifier('à traiter : les messages non lus sont signalés dans la zone',
    zoneTr.lignes.some((l) => l.niveau === 'niveau-info'));
  verifier('à traiter : chaque ligne indique un écran de résolution',
    zoneTr.lignes.every((l) => !!l.onglet));
  // Le lien mène RÉELLEMENT à l'écran qui résout l'alerte.
  await pageTr.click('#clubAlertes .ligneAlerte[data-onglet="medical"]');
  await pageTr.waitForTimeout(400);
  verifier('à traiter : cliquer une alerte ouvre l\'écran qui la résout',
    await pageTr.isVisible('[data-volet="medical"]'));
  verifier('à traiter : aucune erreur console', erreursTr.length === 0);
  await contexteTr.close();

  // 11 duodecies) Écran « Aujourd'hui » (TODO_AUDIT.md P1-37) : ce qu'il y a
  // à FAIRE vient en premier, et rien n'est répété d'une carte à l'autre.
  const contexteAuj = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const pageAuj = await contexteAuj.newPage();
  const erreursAuj = [];
  pageAuj.on('pageerror', (e) => erreursAuj.push(`PAGEERROR: ${e.message}`));
  pageAuj.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) erreursAuj.push(`CONSOLE: ${m.text()}`);
  });
  await pageAuj.goto(`${URL_BASE}/index.html`, { waitUntil: 'networkidle' });
  await pageAuj.click('#btnAccueilModeClub');
  await pageAuj.fill('#inputNomClub', 'Test Aujourdhui');
  await pageAuj.click('#btnCreerClub');
  await pageAuj.waitForTimeout(600);

  const auj = await pageAuj.evaluate(() => {
    const volet = document.querySelector('.voletOnglet[data-volet="dashboard"]');
    const visibles = [...volet.querySelectorAll('.carteClub')].filter((c) => c.offsetHeight > 0);
    return {
      titres: visibles.map((c) => (c.querySelector('h3') || {}).textContent || '?'),
      hauteur: document.getElementById('clubMain').scrollHeight,
      classementPresent: !!volet.querySelector('#clubMiniClassement'),
      derniersResultats: !!(volet.querySelector('#clubDerniersResultats') || {}).offsetHeight,
    };
  });
  verifier('aujourd\'hui : le tableau de bord tient en moins de 2400 px (mesuré à 2853 px avant)',
    auj.hauteur < 2400);
  verifier('aujourd\'hui : pas plus de 7 cartes visibles sur une carrière neuve (10 avant)',
    auj.titres.length <= 7);
  verifier('aujourd\'hui : le mini-classement du tableau de bord ne double plus la page Classement',
    !auj.classementPresent);
  verifier('aujourd\'hui : « 5 derniers résultats » n\'occupe pas l\'écran quand aucun match n\'a été joué',
    !auj.derniersResultats);

  // Avec quelque chose à traiter, cette zone passe AVANT le reste.
  await pageAuj.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rugbyManager.club.v1'));
    s.clubJoueur.effectif[0].blessureJournees = 12;
    localStorage.setItem('rugbyManager.club.v1', JSON.stringify(s));
  });
  await pageAuj.reload({ waitUntil: 'networkidle' });
  await pageAuj.waitForTimeout(250);
  await pageAuj.click('#btnContinuerClub');
  await pageAuj.waitForTimeout(600);
  const ordre = await pageAuj.evaluate(() => {
    const volet = document.querySelector('.voletOnglet[data-volet="dashboard"]');
    const visibles = [...volet.querySelectorAll('.carteClub')].filter((c) => c.offsetHeight > 0);
    return { premier: (visibles[0].querySelector('h3') || {}).textContent || '',
      positionATraiter: document.getElementById('carteAlertes').offsetTop };
  });
  verifier('aujourd\'hui : quand il y a quelque chose à traiter, cette zone est la PREMIÈRE carte',
    /À traiter/.test(ordre.premier));
  verifier('aujourd\'hui : la zone « À traiter » est visible sans défiler (mesurée à 1110 px avant)',
    ordre.positionATraiter < 500);
  verifier('aujourd\'hui : aucune erreur console', erreursAuj.length === 0);
  await contexteAuj.close();

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
  await continuerJusquAuMatch(pageReco);
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
