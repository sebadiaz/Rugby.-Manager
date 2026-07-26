# Audit Rugby Manager — backlog permanent

Ce fichier est le backlog permanent de l'audit du projet. Règles de travail :

- Aucun bug n'est déclaré sans reproduction ou démonstration dans le code.
- Chaque tâche documente : priorité, fichiers concernés, reproduction, cause, correction, critères de validation.
- Pour chaque correction : un test qui échoue est ajouté d'abord, puis le bug est corrigé, puis toute la suite de tests est revérifiée.
- Une tâche n'est cochée qu'après validation complète (tests + preuve).
- Aucune nouvelle fonctionnalité tant que les tâches P0 ne sont pas closes.
- Un seul patch à la fois, jamais de réécriture générale en même temps qu'une correction.

Statuts possibles : `À FAIRE`, `EN COURS`, `CONFIRMÉ`, `CORRIGÉ`, `FAUX POSITIF`.

---

## P0 — Fiabilité

### P0-1. Identifiants après rechargement (compteurJoueurId, compteurMessageId, compteurPersonnelId, compteurId)
- **Statut : CORRIGÉ**
- Priorité : P0 (fiabilité — corruption de données)
- Fichiers concernés :
  - `docs/js/club.js` (cause + correction)
  - `server/test-audit-p0-1.js` (nouveau — reproduction + validation)

**Reproduction.** `compteurJoueurId`, `compteurMessageId`, `compteurPersonnelId` (et `compteurId`, non cité dans le libellé initial mais même défaut) sont des `let x = 1` au niveau du module (`docs/js/club.js` lignes 63-64, 427, 991). Ce sont des variables JS, PAS des données persistées : elles repartent à 1 à chaque exécution du script, donc à chaque rechargement de page (F5), alors que la sauvegarde dans `localStorage` contient déjà des identifiants avancés. Confirmé en simulant un vrai F5 (deux exécutions fraîches et indépendantes de `club.js` partageant le même `localStorage`, cf. `server/test-audit-p0-1.js`) :
  - Session 1 : `nouvelleSaison` → effectif avec joueurs `j1`…`j24`+, club du joueur `club1`, adversaires `club2`…`club14`. Sauvegarde.
  - Session 2 (F5 simulé) : `chargerSaison()` retrouve la même sauvegarde, mais `compteurJoueurId`/`compteurId`/`compteurMessageId`/`compteurPersonnelId` valent de nouveau 1.
  - Signer un joueur du marché après ce rechargement génère un nouvel id `j1` → **collision directe et prouvée** avec le joueur `j1` déjà présent (2 objets `{id:"j1"}` distincts dans le même `effectif`, `nom` différents — "Antoine Garcia" et "Alexandre Morel" dans le test).
  - Une montée de palier (nouveaux adversaires) après un F5 régénère un adversaire avec l'id `club1` → **collision avec `saison.clubJoueur.id` lui-même**. `RMClub.club(saison, "club1")` retourne alors TOUJOURS le club du joueur au lieu du bon adversaire (le code de `club()` teste `clubJoueur.id` en premier) : la résolution des rencontres de cet adversaire est corrompue (mauvaise identité affichée, mauvais niveau utilisé pour la simulation abstraite/moteur).
  - Même défaut démontré pour `compteurMessageId` (deux messages différents partageant l'id `msg1`) et `compteurPersonnelId` (deux membres du personnel partageant l'id `staff1`).
  - Note : le même schéma existe dans `docs/js/world.js` (`compteurClubMondeId`), mais AUCUN chemin de code n'appelle la génération de clubs du monde plus d'une fois par sauvegarde (`assurerMonde` ne régénère que si `!saison.monde`) — non reproductible en l'état, donc **non inclus** dans ce correctif (règle : pas de correction sans reproduction). À surveiller si `world.js` gagne un jour un chemin de régénération.

**Cause.** Aucune resynchronisation des compteurs au chargement d'une sauvegarde existante — `chargerSaison()` se contentait de parser le JSON.

**Correction.** Ajout de `resynchroniserCompteurs(saison)` dans `docs/js/club.js`, appelée systématiquement à la fin de `chargerSaison()` (avant de retourner la saison). Elle scanne tous les identifiants déjà présents dans la sauvegarde rechargée (`clubJoueur.id`, `adversaires[].id`, `effectif[].id`, `jeunes[].id`, `messages[].id`, `personnel[].id`, `marche[].id`, `favoris[].id`, `marchePersonnel[].id`) et porte chaque compteur au-delà du plus grand id déjà utilisé de sa catégorie (`Math.max(compteurX, maxTrouvé + 1)`), jamais en dessous de sa valeur courante. Aucun changement de comportement pour une sauvegarde inexistante ou pour un appel de fonction dans la même session (les compteurs y sont déjà à jour).

**Critères de validation.**
- `node server/test-audit-p0-1.js` : 4/4 tests passent (0/4 avant le correctif, vérifié par `git stash` sur `docs/js/club.js`).
- `node server/test-parcours-club.js` : 35/35 (aucune régression).
- `node server/test-monde.js` : 14/14 (aucune régression).
- `node server/test-parcours-navigateur.js` (desktop + mobile) : 55/55, zéro erreur console (aucune régression).
- `node server/test-invariants.js` : 12/12 (moteur non touché).

### P0-2. Sauvegardes supprimées lors des mises à jour (chargerSaison renvoie null si version différente)
- **Statut : CORRIGÉ**
- Priorité : P0 (fiabilité — perte de données irrécupérable)
- Fichiers concernés :
  - `docs/js/club.js` (cause + correction)
  - `docs/js/clubUI.js` (message clair à l'utilisateur)
  - `server/test-audit-p0-2.js` (nouveau — reproduction + validation)

**Reproduction.** `chargerSaison()` retournait `null` dès que `saison.version !== VERSION_SAUVEGARDE`, sans distinguer "pas de sauvegarde" de "sauvegarde présente mais illisible", sans copie de secours, sans message. Démontré avec une VRAIE carrière (3 saisons jouées, ~116 Ko de données réelles, cf. `server/test-audit-p0-2.js` P0-2a) : après avoir simulé un changement de version (`brut.version = 1`), `chargerSaison()` renvoie `null` — le joueur voit l'écran de création vierge, comme s'il n'avait jamais joué. En créant une "nouvelle" carrière (réaction naturelle du joueur), `sauvegarderSaison` écrase la MÊME clé `localStorage`, détruisant irrémédiablement les 3 saisons de progression — aucune trace, aucune récupération possible. Même défaut démontré pour un JSON corrompu (P0-2b) et un schéma structurellement incomplet (P0-2c, ex. `effectif` manquant).

**Cause.** Pas de distinction entre version incompatible / JSON invalide / schéma invalide ; pas de sauvegarde de secours avant abandon ; pas de canal pour prévenir l'UI.

**Correction** (`docs/js/club.js`) :
- `MIGRATIONS` : registre versionné (clé = version de départ, valeur = fonction de transformation). Vide aujourd'hui — VERSION_SAUVEGARDE n'a jamais eu besoin d'être incrémentée depuis la création du jeu — mais la boucle de migration dans `migrerSaison` est prête à l'utiliser dès qu'une vraie migration sera nécessaire, plutôt que d'abandonner la sauvegarde.
- `saisonEstValide(saison)` : validation structurelle minimale (clubJoueur/effectif non vide/adversaires/calendrier/classement) avant d'accepter une saison comme jouable.
- `migrerSaison(saisonBrute)` : applique les migrations disponibles jusqu'à VERSION_SAUVEGARDE ; retourne `{ok:false, raison}` (jamais un plantage ni un silence) si la version n'a pas de chemin de migration connu, ou si le schéma reste invalide après migration.
- `conserverSecours(brut, raison)` : sauvegarde le JSON brut original sous une clé **distincte** (`rugbyManager.club.secours.v1`) — jamais touchée par `sauvegarderSaison`/`nouvelleSaison` — donc jamais écrasée par une carrière créée ensuite. Pose aussi un avertissement (`rugbyManager.club.avertissement.v1`) consultable/effaçable par l'UI (`consulterAvertissementChargement`/`effacerAvertissementChargement`).
- `chargerSaison()` : distingue maintenant "pas de sauvegarde" (retour `null` silencieux, cas normal) de "sauvegarde présente mais irrécupérable" (retour `null` + secours + avertissement).
- `docs/js/clubUI.js` : au démarrage, si un avertissement est présent, l'affiche une seule fois (`window.alert`, puis efface l'avertissement) en expliquant clairement qu'une copie de secours existe.

**Critères de validation.**
- `node server/test-audit-p0-2.js` : 6/6 (0/6 avant le correctif, vérifié par `git stash`).
- `node server/test-parcours-club.js` : 35/35, `node server/test-monde.js` : 14/14 (aucune régression).
- `node server/test-parcours-navigateur.js` (desktop + mobile) : 55/55, zéro erreur console (aucune régression — une sauvegarde valide se charge normalement).
- `node server/test-invariants.js` : 12/12 (moteur non touché).

### P0-3. Injection HTML par le nom du club
- **Statut : CORRIGÉ**
- Priorité : P0 (fiabilité — XSS DOM exploitable)
- Fichiers concernés :
  - `docs/js/clubUI.js` (cause + correction)
  - `server/test-audit-p0-3.js` (nouveau — reproduction + validation, Playwright)

**Reproduction.** `#inputNomClub` est le SEUL champ de texte libre du jeu dont la valeur est persistée puis réaffichée (les noms de joueurs/clubs IA sont toujours générés par le jeu). Créé une carrière avec le nom `<img src=x onerror="window.__p03xss = true">` dans un vrai navigateur (Playwright) : `window.__p03xss` devient `true` — **le handler injecté s'exécute réellement**, preuve directe d'un XSS DOM exploitable. Confirmé à 3 endroits qui interpolaient `c.nom`/`clubJoueur.nom` directement dans un template assigné à `innerHTML` sans échappement :
  - `rafraichirEntete()` (entête du club, Dashboard) — déclenchement direct démontré.
  - `rafraichirCarteAccueil()` (carte "Continuer ma carrière" de l'écran d'accueil).
  - `rafraichirApercuMatch()` (titre "Mon club — Adversaire" de l'aperçu du match).
  - Plus indirectement partout où le nom du club du joueur passe par le résolveur central `nomClub(clubId)` (classement, mini-classement, calendrier, barre supérieure, classement Équipe B) — `nomClub()` peut résoudre vers `saison.clubJoueur.nom` dès que l'id correspond au club du joueur, ce qui est très fréquent (il apparaît dans presque tous les classements/calendriers).
  - Vérifié SANS risque (donc non modifiés) : `window.alert`/`window.confirm`/`window.prompt` et `toast()` (implémenté via `textContent`, jamais `innerHTML`) n'interprètent jamais de HTML — tous les messages utilisant des noms de joueurs/clubs y sont sans danger. Le rendu du match lui-même (`docs/js/ui.js`, scoreboard/flux d'événements) utilise systématiquement `textContent`, jamais `innerHTML` — vérifié sûr, non modifié.

**Cause.** Aucun échappement centralisé : chaque template interpolait `.nom` directement dans une chaîne assignée à `innerHTML`.

**Correction.** Ajout de `echapperHTML(texte)` dans `docs/js/clubUI.js` (échappe `&`, `<`, `>`, `"`, `'`). Le résolveur central `nomClub(clubId)` l'applique désormais systématiquement (couvre tous ses appelants, présents et futurs). Les 3 interpolations directes de `c.nom`/`clubJoueur.nom` identifiées ci-dessus sont explicitement passées par `echapperHTML(...)`.

**Critères de validation.**
- `node server/test-audit-p0-3.js` (Playwright, nécessite `npm install --no-save playwright`) : 8/8 (plusieurs assertions échouaient avant le correctif, vérifié par `git stash` — script réellement exécuté ET balise `<img>` réelle présente dans le DOM au lieu du texte échappé attendu).
- `node server/test-parcours-club.js` : 35/35, `node server/test-monde.js` : 14/14, `node server/test-audit-p0-1.js` : 4/4, `node server/test-audit-p0-2.js` : 6/6 (aucune régression).
- `node server/test-parcours-navigateur.js` (desktop + mobile) : 55/55, zéro erreur console (aucune régression — un nom de club normal continue de s'afficher normalement).
- `node server/test-invariants.js` : 12/12 (moteur non touché).

### P0-4. Tests absents de la CI
- **Statut : CORRIGÉ**
- Priorité : P0 (fiabilité — un commit qui casse le jeu peut être déployé)
- Fichiers concernés :
  - `.github/workflows/deploy-pages.yml` (cause + correction)

**Reproduction.** `.github/workflows/deploy-pages.yml` est le SEUL workflow du dépôt. Son unique job (`deploy`) enchaîne directement `checkout` → `cp engine/rugby-engine.js docs/rugby-engine.js` → `upload-pages-artifact` → `deploy-pages`, sur `push` vers `main`/`claude/readme-details-6aj3jt` — **aucune étape n'exécute le moindre test** (ni `server/test-invariants.js`, ni `server/test-parcours-club.js`, ni le parcours navigateur). Un commit qui casse le moteur, corrompt une sauvegarde ou réintroduit le XSS de P0-3 se déploierait donc automatiquement sur le site public sans aucun garde-fou, du moment que `docs/**` ou `engine/**` a changé. Démontré par simple lecture du fichier (aucune invocation de `node server/test-*.js` nulle part dans le dépôt sous `.github/`).

**Cause.** Le workflow de déploiement n'a jamais inclus d'étape de test.

**Correction.** `deploy-pages.yml` a maintenant deux jobs : `test` (checkout, synchronise le moteur, exécute `test-invariants.js`, `test-parcours-club.js`, `test-monde.js`, `test-audit-p0-1.js`, `test-audit-p0-2.js`, installe Chromium via Playwright, sert `docs/` en local puis exécute `test-parcours-navigateur.js` et `test-audit-p0-3.js` contre ce serveur) puis `deploy` (`needs: test`) — GitHub Actions n'exécute `deploy` que si `test` se termine avec succès ; un test qui échoue bloque donc le déploiement.

**Critères de validation.**
- Push réel sur `claude/readme-details-6aj3jt` (commit `08cbca9`) puis vérification via l'API GitHub Actions que le job `test` s'exécute réellement et que `deploy` ne démarre qu'après son succès : run [30175827531](https://github.com/sebadiaz/Rugby.-Manager/actions/runs/30175827531) — job `test` 21:32:21→21:35:56 (succès, 5 étapes de test toutes vertes, dont les 2 suites Playwright), job `deploy` démarré seulement à 21:35:57 (après la fin de `test`) et terminé avec succès à 21:36:17. Confirme que le `needs: test` bloque réellement `deploy` tant que les tests n'ont pas fini/réussi.
- Toutes les commandes du job `test` ré-exécutées localement avant push (mêmes commandes, même environnement) : `test-invariants.js` 12/12, `test-parcours-club.js` 35/35, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-parcours-navigateur.js` 55/55, `test-audit-p0-3.js` 8/8.

### P0-5. Site publié différent du code source (docs/ vs main vs GitHub Pages, Équipe B / Monde)
- **Statut : CONFIRMÉ (correction en attente d'arbitrage — voir note)**
- Priorité : P0 (fiabilité — le site public peut régresser silencieusement)
- Fichiers concernés :
  - `.github/workflows/deploy-pages.yml` (cause)
  - `main` (branche) vs `claude/readme-details-6aj3jt` (branche de travail)

**Reproduction.** `.github/workflows/deploy-pages.yml` déclenche un déploiement sur `push` vers **DEUX** branches distinctes (`main` ET `claude/readme-details-6aj3jt`), sur le même environnement `github-pages` — c'est donc le DERNIER push, sur N'IMPORTE LAQUELLE des deux branches, qui décide du contenu publié, indépendamment de la branche la plus à jour ou la plus fiable. Vérifié par comparaison réelle (`git fetch origin main`, `git diff origin/main..claude/readme-details-6aj3jt`, `git merge-base --is-ancestor`) :
  - `main` est un ancêtre strict de `claude/readme-details-6aj3jt` (aucune divergence, aucun conflit) mais est en retard de 10 commits.
  - `docs/js/world.js` (écosystème mondial de compétitions : 12 pays, pyramides, Équipe B, montées/descentes) **n'existe pas du tout sur `main`** — ni référencé dans `docs/index.html` sur `main`.
  - `docs/js/club.js` sur `main` ne contient aucune trace de `competitionB` (Équipe B) : fonctionnalité absente.
  - Aggravant : `.github/workflows/deploy-pages.yml` sur `main` est aussi l'ANCIENNE version (celle d'avant le correctif P0-4) — sans job `test`, donc **sans aucun garde-fou**. Les nouveaux fichiers de test (`server/test-monde.js`, `server/test-audit-p0-1.js`, `server/test-audit-p0-2.js`, `server/test-audit-p0-3.js`) n'existent pas non plus sur `main`.
  - Conséquence démontrée : un simple `push` vers `main` (par un autre outil, une autre session, ou manuellement), même totalement indépendant de ce travail, republierait immédiatement et sans aucun test le site public dans un état antérieur — perdant Équipe B, Monde, et les correctifs de sécurité/fiabilité P0-1 à P0-4 déjà déployés.

**Cause.** Le workflow de déploiement a été créé dès l'origine (commit `189f054`, avant cette série d'audits) avec deux branches déclenchantes sur la même cible de déploiement, sans mécanisme empêchant qu'une branche en retard écrase silencieusement une branche plus avancée.

**Correction envisagée (nécessite un arbitrage utilisateur, hors du périmètre que je peux décider seul) :** la branche `claude/readme-details-6aj3jt` étant un simple prolongement de `main` sans aucune divergence (fast-forward possible sans conflit), la correction structurelle consiste à faire avancer `main` jusqu'à `claude/readme-details-6aj3jt` (ou à retirer `main` du déclencheur en attendant). Cette action pousse vers une branche différente de celle assignée pour ce travail (`claude/readme-details-6aj3jt`) : conformément à la consigne "ne jamais pousser vers une autre branche sans autorisation explicite", je ne l'exécute pas sans confirmation.

---

## P1 — Parcours utilisateur

### P1-6. Étendre le test navigateur (tous écrans, mobile, modales, bouton journée, retours arrière, rechargement en milieu d'action)
- Statut : À FAIRE
- Fichiers concernés : `server/test-parcours-navigateur.js`

### P1-7. Scénarios négatifs (budget insuffisant, effectif incomplet, dernier joueur d'un poste, sauvegarde corrompue, double clic, saison terminée, joueur déjà transféré, action répétée après F5)
- Statut : À FAIRE
- Fichiers concernés : `server/test-parcours-club.js`, `server/test-parcours-navigateur.js`

### P1-8. Remplacer progressivement prompt/alert/confirm par des fenêtres intégrées
- Statut : À FAIRE
- Fichiers concernés : `docs/js/clubUI.js`, `docs/index.html`, `docs/css/style.css`

### P1-9. Carrière longue (10 saisons+, rechargements réguliers) — aucun id dupliqué, NaN, donnée perdue, composition impossible
- Statut : À FAIRE
- Fichiers concernés : `docs/js/club.js`, `server/test-parcours-club.js`

---

## P2 — Maintenabilité et simulation

### P2-10. Découper club.js et clubUI.js par domaine (sans changement de comportement)
- Statut : À FAIRE
- Fichiers concernés : `docs/js/club.js`, `docs/js/clubUI.js`, `docs/index.html`

### P2-11. Tests statistiques sur plusieurs centaines de matchs (scores, essais, rucks, mêlées, touches, coups de pied, pénalités, possession, diversité)
- Statut : À FAIRE
- Fichiers concernés : `server/test-invariants.js` ou nouveau fichier `server/test-stats-matchs.js`

### P2-12. Accessibilité et responsive (clavier, focus, Échap, tableaux petit écran, tiroir mobile, boutons toujours accessibles)
- Statut : À FAIRE
- Fichiers concernés : `docs/index.html`, `docs/css/style.css`, `docs/js/clubUI.js`

---

## Journal des faux positifs

(Tâches infirmées avec preuve, conservées pour traçabilité.)

---

## Journal des corrections appliquées

### P0-1 — Identifiants après rechargement — CORRIGÉ
- Reproduit dans `server/test-audit-p0-1.js` (4 scénarios : joueur signé, adversaire régénéré après montée de palier, message ajouté, personnel embauché — tous après un F5 simulé).
- Corrigé par `resynchroniserCompteurs(saison)` dans `docs/js/club.js`, appelée depuis `chargerSaison()`.
- Tests : `server/test-audit-p0-1.js` 4/4, `server/test-parcours-club.js` 35/35, `server/test-monde.js` 14/14, `server/test-parcours-navigateur.js` 55/55 (desktop+mobile), `server/test-invariants.js` 12/12.
- Non inclus (non reproductible) : `compteurClubMondeId` dans `docs/js/world.js` — voir note dans P0-1 ci-dessus.

### P0-2 — Sauvegardes supprimées lors des mises à jour — CORRIGÉ
- Reproduit dans `server/test-audit-p0-2.js` (version différente, JSON corrompu, schéma incomplet — une vraie carrière de 3 saisons était silencieusement remplaçable par une carrière vierge).
- Corrigé par un cadre de migration versionné (`migrerSaison`, `MIGRATIONS` vide car aucune migration réelle n'a encore été nécessaire), une validation minimale (`saisonEstValide`), une copie de secours sous clé distincte (`conserverSecours`) et un avertissement affiché une fois par `docs/js/clubUI.js`.
- Tests : `server/test-audit-p0-2.js` 6/6, `server/test-parcours-club.js` 35/35, `server/test-monde.js` 14/14, `server/test-parcours-navigateur.js` 55/55 (desktop+mobile), `server/test-invariants.js` 12/12.

### P0-3 — Injection HTML par le nom du club — CORRIGÉ
- Reproduit avec Playwright (`server/test-audit-p0-3.js`) : un nom de club `<img src=x onerror="window.__p03xss = true">` exécutait réellement le handler injecté sur le Dashboard, la carte d'accueil "Continuer" et l'aperçu du match.
- Corrigé par `echapperHTML(texte)` dans `docs/js/clubUI.js`, appliqué dans le résolveur central `nomClub(clubId)` et aux 3 interpolations directes (`rafraichirEntete`, `rafraichirCarteAccueil`, `rafraichirApercuMatch`). Contextes vérifiés sûrs et non modifiés : `window.alert`/`confirm`/`prompt`, `toast()` (textContent), rendu du match dans `docs/js/ui.js` (textContent).
- Tests : `server/test-audit-p0-3.js` 8/8, `server/test-parcours-club.js` 35/35, `server/test-monde.js` 14/14, `server/test-audit-p0-1.js` 4/4, `server/test-audit-p0-2.js` 6/6, `server/test-parcours-navigateur.js` 55/55 (desktop+mobile), `server/test-invariants.js` 12/12.

### P0-4 — Tests absents de la CI — CORRIGÉ
- Reproduit par lecture de `.github/workflows/deploy-pages.yml` : un seul job, aucune étape n'exécutait le moindre test avant déploiement sur `push`.
- Corrigé en ajoutant un job `test` (moteur/données puis navigateur via Chromium/Playwright) dont dépend désormais le job `deploy` (`needs: test`) — un test en échec bloque le déploiement.
- Validation : toutes les commandes du job `test` exécutées localement (`test-invariants.js` 12/12, `test-parcours-club.js` 35/35, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-parcours-navigateur.js` 55/55, `test-audit-p0-3.js` 8/8), puis confirmation sur GitHub Actions après push.
