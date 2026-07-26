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
- **Statut : CORRIGÉ**
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

**Correction.** La branche `claude/readme-details-6aj3jt` étant un simple prolongement de `main` sans aucune divergence, l'utilisateur a explicitement autorisé un fast-forward de `main` vers cette branche (action hors du périmètre "ne jamais pousser vers une autre branche sans autorisation explicite" que je ne pouvais pas décider seul). Exécuté : `git push origin claude/readme-details-6aj3jt:main` (sans `--force`, donc refusé par git lui-même si ç'avait été autre chose qu'un fast-forward) — `main` est passé de `59a9f7f` à `a92ec0f`, désormais strictement identique à la branche de travail : Monde/Équipe B et tous les correctifs P0-1 à P0-4 (dont le garde-fou CI) sont maintenant présents sur `main`.

**Critères de validation.**
- `git rev-parse origin/main` == `git rev-parse claude/readme-details-6aj3jt` après le push (`a92ec0f` des deux côtés) : confirmé.
- Ce fast-forward a lui-même déclenché un déploiement réel sur `main` — vérifié via l'API GitHub Actions que le NOUVEAU garde-fou (job `test`, désormais présent sur `main`) s'est exécuté et a réussi avant que `deploy` ne démarre : run [30189945183](https://github.com/sebadiaz/Rugby.-Manager/actions/runs/30189945183) — job `test` 05:47:12→05:50:38 (succès, 5 étapes de test toutes vertes), job `deploy` démarré seulement à 05:50:44 et terminé avec succès à 05:50:59. Preuve que le site publié, `main` et la branche de travail sont maintenant un seul et même état, protégé par les tests.

---

## P1 — Parcours utilisateur

### P1-6. Étendre le test navigateur (tous écrans, mobile, modales, bouton journée, retours arrière, rechargement en milieu d'action)
- **Statut : CORRIGÉ**
- Priorité : P1 (parcours utilisateur — couverture de test + un bug réel trouvé en l'écrivant)
- Fichiers concernés :
  - `server/test-parcours-navigateur.js` (nouvelle couverture)
  - `docs/js/clubUI.js` (bug réel trouvé et corrigé pendant l'écriture des tests)

**Constat de départ (gaps de couverture, avant ce patch).** `server/test-parcours-navigateur.js` fixait le viewport à 1280×900 (desktop) sur toute sa durée — **aucun test mobile** malgré un vrai tiroir de navigation mobile dédié (`#btnMenuClub`, `#barreOngletsClub.ouvert`, `#navBackdrop`, cf. `docs/css/style.css` `@media (max-width: 899px)`). Le raccourci clavier Échap (commit "Échap referme les calques ouverts : aperçu du match, tiroir mobile, fiche joueur, panneaux du menu") n'était testé nulle part. Les rechargements existants avaient tous lieu entre deux actions, jamais PENDANT qu'un panneau/modale était ouvert.

**Correction (nouvelle couverture ajoutée).**
- **Mobile** : viewport basculé à 390×844 pour vérifier que le bouton menu est visible, le tiroir fermé par défaut, s'ouvre au clic, affiche son fond assombri, se referme automatiquement après avoir choisi un onglet, et se referme au clavier (Échap) sans changer d'onglet.
- **Retours arrière (Échap)** : referme la fiche joueur (son propre effectif), l'aperçu du match (sans lancer le match), et — panneau imbriqué — la fiche d'un joueur adverse ouverte À L'INTÉRIEUR de la fiche du club adverse.
- **Rechargement en milieu d'action** : recharge la page PENDANT que la fiche joueur est ouverte, puis PENDANT que l'aperçu du match est ouvert — vérifie dans les deux cas un retour propre à l'écran d'accueil (aucun panneau ne reste "fantôme" après reprise de la carrière) et que le panneau reste ensuite normalement réutilisable.

**Bug réel trouvé en écrivant le test "retour arrière (Échap) sur panneau imbriqué".** Reproduit : ouvrir la fiche d'un joueur adverse (imbriquée dans la fiche du club adverse) puis appuyer sur Échap fermait les DEUX niveaux d'un coup (retour direct à la liste des clubs) au lieu de ne fermer que le niveau le plus imbriqué — contrairement au même geste sur sa propre fiche joueur, qui ne referme que la fiche. Cause : le gestionnaire clavier (`docs/js/clubUI.js`, `document.addEventListener('keydown', ...)`) testait `clubAdversaireAffiche` mais jamais `joueurAdversaireAfficheIndex`, donc la branche "fiche joueur adverse" n'existait pas et Échap tombait directement sur la branche "fermer tout le club adverse". Corrigé en ajoutant `if (clubAdversaireAffiche && joueurAdversaireAfficheIndex != null) { fermerFicheJoueurAdversaire(); return; }` avant la branche existante.

**Critères de validation.**
- `node server/test-parcours-navigateur.js` : 72/72 (contre 71/72 avant le correctif — le test "referme uniquement la fiche du joueur adverse, reste sur la fiche du club adverse" échouait, confirmé par `git stash` sur `docs/js/clubUI.js`).
- Régression complète sans échec : `test-invariants.js` 12/12, `test-parcours-club.js` 35/35, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-audit-p0-3.js` 8/8.

### P1-7. Scénarios négatifs (budget insuffisant, effectif incomplet, dernier joueur d'un poste, sauvegarde corrompue, double clic, saison terminée, joueur déjà transféré, action répétée après F5)
- **Statut : CORRIGÉ**
- Priorité : P1 (parcours utilisateur — les gardes existent déjà côté moteur de données, mais n'étaient pas prouvées par un test)
- Fichiers concernés :
  - `server/test-parcours-club.js` (nouvelle couverture, couche données)
  - `server/test-parcours-navigateur.js` (nouvelle couverture, navigateur réel)

**Constat de départ.** Les gardes anti-corruption existent déjà dans `docs/js/club.js` (`signerJoueur`, `approcherJoueurAdverse`, `libererJoueur`, `preterJoueur` retournent tous `{ok:false, motif:...}` sans muter l'état en cas de refus) mais aucun test ne le prouvait pour la plupart des scénarios négatifs demandés — seul "prêter le dernier joueur d'un poste" avait un test dédié. Sans preuve, un refactoring futur pourrait silencieusement casser une de ces gardes sans qu'aucun test n'échoue.

**Correction (nouvelle couverture ajoutée, aucun changement de comportement du jeu — uniquement des tests).**
- **Budget insuffisant** : `signerJoueur` refusé (motif `budget`, effectif/marché/budget inchangés) ; `approcherJoueurAdverse` refusé pour budget insuffisant, distinct d'un refus pour offre dérisoire (motif `refuse`) déjà couvert — le club adverse ne génère pas non plus de remplaçant dans ce cas.
- **Dernier joueur d'un poste** : `libererJoueur` refusé (motif `dernier_du_poste`) — jusqu'ici seule la variante `preterJoueur` (prêt) était testée pour cette garde, `libererJoueur` a sa propre garde indépendante jamais exercée.
- **Joueur déjà transféré/prêté** : `preterJoueur` appelé deux fois sur le même joueur refusé la seconde fois (motif `deja_prete`, pas de double indemnité).
- **Action répétée / double clic** : `signerJoueur` rejoué deux fois avec le même id de joueur (côté données) — la seconde tentative est refusée (motif `introuvable`, le joueur a déjà quitté le marché), budget débité une seule fois, aucun doublon dans l'effectif. Prouvé aussi dans un VRAI navigateur : deux clics DOM synchrones (même tick, sans repeinture entre les deux — le pire cas réaliste) sur le même bouton "Signer" n'ajoutent qu'un seul exemplaire du joueur à l'effectif.
- **Saison terminée** : `prochainesFixtures` renvoie `[]` une fois toutes les journées jouées (aucune journée fantôme renvoyée).
- **Sauvegarde corrompue** : preuve, cette fois dans un VRAI navigateur (pas seulement côté données comme dans P0-2), que l'avertissement de récupération s'affiche réellement au joueur, et qu'une nouvelle carrière reste créable normalement ensuite.

**Critères de validation.**
- `node server/test-parcours-club.js` : 41/41 (35 existants + 6 nouveaux).
- `node server/test-parcours-navigateur.js` : 77/77 (72 existants après P1-6 + 5 nouveaux : double clic × 2 assertions, sauvegarde corrompue × 3 assertions).
- Régression complète sans échec : `test-invariants.js` 12/12, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-audit-p0-3.js` 8/8.

### P1-8. Remplacer progressivement prompt/alert/confirm par des fenêtres intégrées
- **Statut : CORRIGÉ (3 tranches — `confirm`, `prompt`, `alert` : les 21 boîtes natives sont converties)**
- Priorité : P1 (parcours utilisateur — immersion/lisibilité)
- Fichiers concernés :
  - `docs/js/clubUI.js` (`confirmerAction`, `demanderMontant`, `afficherInfo`, `toast` — 21 appelants convertis au total)
  - `docs/index.html` (fenêtres `#modalConfirmation`, `#modalMontant`, `#modalInfo`)
  - `docs/css/style.css` (styles `.modalOverlay`/`.modalCarte`/`.modalErreur`)
  - `server/test-parcours-navigateur.js` (nouvelle couverture)

**Constat de départ.** 21 appels à `window.alert`/`confirm`/`prompt` dans `docs/js/clubUI.js` : des boîtes de dialogue natives du navigateur, sans le style du jeu, qui cassent l'immersion et sont incohérentes entre navigateurs. Consigne explicite : remplacement **progressif**, pas une réécriture générale en un seul patch.

**Tranche 1 — les 5 `window.confirm`** (actions à conséquence : effacer la saison, promouvoir un espoir, prêter/libérer un joueur, licencier du personnel). Nouvelle fenêtre `#modalConfirmation` (carte centrée par-dessus tout le reste, y compris l'aperçu du match, même style visuel que le reste du jeu), boutons `Annuler`/`Confirmer`, fond assombri cliquable et Échap pour annuler (intégré au même gestionnaire clavier que les autres calques). `confirmerAction(message)` renvoie une Promise résolue par le clic/Échap/fond ; les 5 gestionnaires concernés passent en `async`. Aucun changement de comportement des actions elles-mêmes, uniquement la fenêtre qui les affiche.

**Tranche 2 — les 2 `window.prompt`** (offre de transfert international, négociation de salaire de renouvellement de contrat). Nouvelle fenêtre `#modalMontant` (champ numérique, message d'erreur inline). Amélioration réelle par rapport à l'ancien `prompt`+`alert` : une valeur invalide affiche désormais une erreur SANS fermer la fenêtre — l'ancien flux devait rouvrir le prompt depuis zéro et ressaisir le montant à chaque erreur (le contexte, ex. le montant déjà tapé, était perdu). `demanderMontant(texte, valeurDefaut)` renvoie une Promise résolue par un nombre entier positif validé, ou `null` si annulé (bouton, Échap ou fond).

**Tranche 3 — les 13 `window.alert`.** Répartis en deux traitements selon leur nature (pas une conversion mécanique uniforme) :
- **9 messages d'erreur/info courts** (budget insuffisant, poste déjà pourvu, offre refusée, dernier joueur d'un poste, journée injouable...) → `toast(message, 'erreur')`, déjà existant dans le jeu (non bloquant, se referme seul) — un meilleur choix qu'une fenêtre modale pour un message d'une phrase qui ne demande pas d'action.
- **2 messages substantiels, à lire posément** (bilan de fin de saison : départs/arrivées ; avertissement de sauvegarde corrompue, P0-2) → nouvelle fenêtre `#modalInfo` (titre + corps multi-paragraphe, bouton OK), pilotée par `afficherInfo(titre, corps)`.

**Amélioration visible.** Capture d'écran vérifiée manuellement (Playwright) pour les trois types de fenêtres : confirmation ("Libérer Tom Fournier ?..."), montant avec erreur inline ("Indique un montant valide..."), et information multi-paragraphe (avertissement de sauvegarde corrompue, texte bien mis en page avec ses deux paragraphes) — toutes cohérentes avec le thème sombre du jeu, au lieu de boîtes système grises hors-thème.

**Critères de validation.**
- `node server/test-parcours-navigateur.js` : 86/86 (85 existants après la tranche 2 + 1 nouveau : le bilan de fin de saison s'affiche dans `#modalInfo` — remplace l'ancien `page.once('dialog', (d) => d.accept())` qui ne se déclenche plus). Le test de sauvegarde corrompue (P0-2/P1-7) est adapté pour lire `#modalInfoTexte` au lieu du texte d'un `dialog` natif.
- Régression complète sans échec : `test-parcours-club.js` 41/41, `test-invariants.js` 12/12, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-audit-p0-3.js` 8/8.
- `grep -c "window\.\(alert\|confirm\|prompt\)(" docs/js/clubUI.js` → 0 (aucun appel actif restant, seuls des commentaires les mentionnent).

**Reste à faire (3ᵉ tranche possible de P1-8).** Les 13 `window.alert` restants (messages d'erreur/info courts, ex. "Budget insuffisant") n'ont pas encore été convertis — probablement vers `toast(message, 'erreur')` (déjà existant, non bloquant) plutôt qu'une nouvelle fenêtre modale, sauf pour les messages substantiels (bilan de fin de saison, avertissement de sauvegarde corrompue) qui méritent une vraie fenêtre à lire posément.

### P1-9. Carrière longue (10 saisons+, rechargements réguliers) — aucun id dupliqué, NaN, donnée perdue, composition impossible
- **Statut : CORRIGÉ**
- Priorité : P1 (parcours utilisateur — confiance sur la durée d'une vraie carrière, pas seulement un scénario court)
- Fichiers concernés :
  - `server/test-parcours-club.js` (nouvelle couverture — `docs/js/club.js` n'a pas eu besoin d'être modifié, les gardes existantes suffisent)

**Nature de la tâche.** Contrairement à P0-1/P0-2/P0-3, il ne s'agit pas de reproduire puis corriger un bug précis, mais — comme P1-6/P1-7 — de prouver par un test qu'une carrière RÉELLEMENT longue (12 saisons, largement au-delà des 10 demandées) reste saine sur la durée, avec de VRAIS rechargements de page répétés (pas un seul F5 isolé comme les tests existants).

**Correction (nouvelle couverture).** `server/test-parcours-club.js` : une carrière de 12 saisons, avec une NOUVELLE exécution indépendante de `club.js` (même mécanisme que `server/test-audit-p0-1.js` — les compteurs de module repartent bien à zéro, contrairement à un simple appel de fonction dans le même processus) à **4 points par saison** (début, milieu, fin avant bascule, fin après bascule) — soit 48 rechargements simulés sur toute la carrière. Entre chaque rechargement, des actions réalistes et variées : recrutement (si abordable), prêt puis rappel d'un joueur, renouvellement de contrat, promotion d'un espoir du centre de formation, embauche/licenciement de personnel, scouting, favoris, rafraîchissement des deux marchés (régénère des ids, le geste le plus stressant pour les compteurs). Chaque saison joue l'intégralité de son calendrier (scores synthétisés, comme le fait déjà le test "progression d'une journée" — inutile de repasser par le vrai moteur pour un test de robustesse des données), avec le pipeline complet (finances, blessures, fatigue, moral, prêts, entraînement) appliqué à chaque journée du club du joueur.

Après CHAQUE rechargement (48 fois), 4 catégories d'invariants sont vérifiées :
1. **Aucun id dupliqué** dans chacun des 4 espaces de noms d'id (joueurs : effectif/jeunes/marché/favoris ; clubs : le sien + tous les adversaires ; messages ; personnel : le sien + le marché).
2. **Aucun NaN/Infinity** nulle part dans la saison — parcours générique et récursif de TOUTES les valeurs numériques de l'objet saison (plus de 200 à chaque vérification), pas une liste de champs choisis à la main qui pourrait en oublier.
3. **Composition toujours complétable** après le rechargement (`completerComposition` + `validerComposition` renvoie 0 poste manquant).
4. **Aucune donnée perdue** : le nom du club ne change jamais tout seul, l'effectif reste toujours alignable (≥15), le numéro de saison progresse d'exactement 1 à chaque bascule.

**Preuve que le test n'est pas vide de sens.** Désactivé temporairement l'appel à `resynchroniserCompteurs()` dans `chargerSaison()` (le correctif de P0-1) : le nouveau test échoue immédiatement, dès le milieu de la première saison, avec des ids de joueurs dupliqués (`j1, j2, j3, j4, j5, j6`) — la preuve que ce test détecterait réellement une régression de ce type, pas seulement qu'il passe par construction. Réactivé ensuite (`git diff` confirme `docs/js/club.js` revenu à l'identique).

**Critères de validation.**
- `node server/test-parcours-club.js` : 42/42 (41 existants après P1-7 + 1 nouveau, qui couvre à lui seul 48 cycles de rechargement).
- Régression complète sans échec : `test-invariants.js` 12/12, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-audit-p0-3.js` 8/8, `test-parcours-navigateur.js` 86/86 (aucun fichier de rendu touché, vérifié par précaution).

---

## P2 — Maintenabilité et simulation

### P2-10. Découper club.js et clubUI.js par domaine (sans changement de comportement)
- **Statut : EN COURS (tranche 1 : Personnel, tranche 2 : Objectif de saison, tranche 3 : Analyse adversaire, tranche 4 : Prêts, tranche 5 : Contrats, tranche 6 : Équipe B — voir constat de risque et tranches suivantes ci-dessous)**
- Priorité : P2 (maintenabilité — explicitement demandée par l'utilisateur malgré la tension avec la règle CLAUDE.md "jamais un patch purement technique si le gameplay ne s'améliore pas visiblement")
- Fichiers concernés :
  - `docs/js/club.js` (export fusionné, trois aides génériques exposées, six domaines retirés)
  - `docs/js/club-personnel.js`, `docs/js/club-objectif.js`, `docs/js/club-analyse.js`, `docs/js/club-prets.js`, `docs/js/club-contrats.js`, `docs/js/club-equipe-b.js` (nouveaux — domaines extraits)
  - `docs/index.html` (nouvelles balises `<script>`)
  - `server/test-parcours-club.js`, `server/test-monde.js`, `server/test-audit-p0-1.js`, `server/test-audit-p0-2.js` (chargent club.js "à la main" pour leurs tests — doivent désormais charger aussi les 6 fichiers extraits)

**Constat de risque (avant de commencer).** `club.js`/`clubUI.js` sont chacun UNE SEULE fermeture JS (`(function(){...})(window)`) où ~150 fonctions et de nombreuses constantes s'appellent entre elles par identifiant nu (pas via `RMClub.xxx()`), sans outil de bundling ni linter pour vérifier automatiquement qu'aucune référence n'est oubliée après un déplacement — seuls les tests (solides mais pas exhaustifs) peuvent le détecter. Un découpage complet en un seul patch serait donc une vraie "grosse refonte" à haut risque. Décidé avec l'utilisateur : découpage réel, mais domaine par domaine, avec la suite de tests complète relancée à chaque tranche (même approche que P1-8).

**Tranche 1 — Personnel (entraîneur adjoint, préparateur physique, médecin, recruteur, analyste vidéo).** Domaine choisi en premier car le plus autonome (vérifié par un comptage des références croisées avant de commencer, pas juste supposé) : `POSTES_PERSONNEL`, `genererMembrePersonnel`, `genererMarchePersonnel`, `embaucherPersonnel`, `licencierPersonnel`, `masseSalarialePersonnel`, `effetPersonnel` déplacés vers un nouveau `docs/js/club-personnel.js`.

**Correction.**
- L'export de `club.js` passe d'une réaffectation complète (`global.RMClub = {...}`) à une fusion (`global.RMClub = Object.assign(global.RMClub || {}, {...})`) : sans ce changement, quel que soit l'ordre de chargement des deux fichiers, celui qui s'exécute en second écraserait entièrement l'objet posé par le premier. `club-personnel.js` utilise le même mécanisme de fusion — l'ordre des deux balises `<script>` dans `docs/index.html` n'a donc plus d'importance.
- Deux aides génériques jusqu'ici internes à `club.js` (`choisir`, `genererNomJoueur`) sont exportées pour que `club-personnel.js` puisse les utiliser sans dupliquer leur code.
- **Dépendance croisée subtile trouvée en migrant** (pas supposée à l'avance) : `resynchroniserCompteurs` (le correctif P0-1) mutait directement `compteurPersonnelId`, une variable de module qui vient de quitter la fermeture de `club.js`. Impossible de la muter depuis `club.js` une fois déplacée : corrigé en exportant une fonction dédiée `resynchroniserCompteurPersonnel(maxPersonnel)` depuis `club-personnel.js`, appelée par `club.js` à la place de la mutation directe — même logique de resynchronisation, juste déplacée là où l'état vit réellement. Cette dépendance n'était mentionnée dans aucun commentaire proche du code du personnel ; elle n'a été trouvée qu'en grepant systématiquement `compteurPersonnelId` dans tout le fichier avant de couper.

**Critères de validation.**
- Comportement strictement inchangé : aucune fonction déplacée n'a été modifiée, seuls les points d'appel externes au domaine (3 au total : `masseSalarialePersonnel` dans `appliquerFinancesMatch`, `genererMarchePersonnel` dans `avancerSaison` et `nouvelleSaison`) et la resynchronisation du compteur ont été adaptés pour passer par `RMClub.*`.
- Suite complète relancée sans aucune régression : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4 (dont P0-1d, qui teste précisément la resynchronisation du personnel après un rechargement), `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 86/86 (onglet Personnel, embauche/licenciement inclus), `test-audit-p0-3.js` 8/8.

**Tranche 2 — Objectif de saison / confiance du président.** `determinerObjectifSaison`, `libelleObjectifSaison`, `evaluerObjectifSaison` déplacés vers un nouveau `docs/js/club-objectif.js`. Le domaine le plus simple à ce jour : 3 fonctions **pures** (aucun état de module, aucune variable `let` à resynchroniser) — contrairement à la tranche 1, aucune dépendance croisée cachée n'a été trouvée en migrant. 4 points d'appel externes adaptés pour passer par `RMClub.*` (2 dans `avancerSaison`, 2 dans `nouvelleSaison`). Même mécanisme de fusion `Object.assign` que la tranche 1, aucune nouvelle aide générique à exporter.
- Suite complète relancée sans aucune régression : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 86/86 (carte "Objectif de la saison" du Dashboard, bilan de fin de saison inclus), `test-audit-p0-3.js` 8/8.

**Tranche 3 — Analyse du prochain adversaire.** `POSTES_AVANTS`, `moyenneAttribut`, `ATTRIBUTS_ANALYSE`, `analyserAdversaire` déplacés vers un nouveau `docs/js/club-analyse.js`. Domaine autonome à l'exception de deux fonctions du domaine calendrier/classement, restées dans `club.js` (`club`, `classementTrie`), appelées depuis le nouveau fichier via `RMClub.*` — dépendance identifiée et vérifiée avant de couper (pas une surprise comme la tranche 1), aucun état de module à resynchroniser.
- Suite complète relancée sans aucune régression : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 86/86 (fiche du club adverse, analyse comparative incluse), `test-audit-p0-3.js` 8/8.

**Tranche 4 — Prêts.** `preterJoueur`, `rappelerJoueur`, `progresserPrets` déplacés vers un nouveau `docs/js/club-prets.js`. Aucun appelant interne à `club.js` (uniquement consommé depuis `clubUI.js`, déjà namespacé) ; une seule dépendance externe (`ajouterMessage`, resté dans `club.js`), appelée via `RMClub.*`.
- Note de méthode : `ajouterMessage` lui-même (18 points d'appel dans tout le fichier, dans quasiment tous les domaines) est délibérément resté dans `club.js`, traité comme une utilité "cœur" partagée plutôt qu'un domaine à extraire — l'extraire forcerait à toucher la quasi-totalité des domaines restants d'un coup, contrairement à l'esprit "petites tranches" de ce découpage.
- Suite complète relancée sans aucune régression : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 86/86, `test-audit-p0-3.js` 8/8.

**Tranche 5 — Contrats (renouvellement/négociation).** `calculerOffreRenouvellement`, `renouvelerContrat`, `negocierRenouvellement` déplacés vers un nouveau `docs/js/club-contrats.js`. Aucun appelant interne à `club.js` en dehors du domaine ; une nouvelle aide générique exportée (`calculerSalaire`, une formule salariale utilisée aussi par plusieurs fonctions de génération de joueurs restées dans `club.js`), plus `ajouterMessage` déjà exposé.
- Note : `calculerPrimeSignature` (adjacente dans l'ancien export mais utilisée par `signerJoueur`, domaine "marché des transferts" pas encore extrait) est délibérément restée dans `club.js` — ce n'est pas le même domaine malgré la proximité dans le code.
- Suite complète relancée sans aucune régression : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 86/86 (les deux tests "négociation de contrat"), `test-audit-p0-3.js` 8/8.

**Tranche 6 — Équipe B.** `determinerEligiblesEquipeB`, `genererCompetitionB`, `assurerCompetitionB`, `enregistrerResultatEquipeB`, `prochaineRondeEquipeB`, `effectifDisponiblePourEquipeB`, `appliquerEffetsMatchEquipeB` déplacés vers un nouveau `docs/js/club-equipe-b.js`. Dépend de 3 fonctions du domaine calendrier/classement déjà exportées (`genererCalendrier`, `classementInitial`, `enregistrerResultatDans`) — aucune nouvelle aide générique à exporter, aucun état de module. 2 points d'appel externes (`avancerSaison`, `nouvelleSaison`) adaptés pour passer par `RMClub.genererCompetitionB`.
- Suite complète relancée sans aucune régression : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 86/86 (les 5 tests "équipe B"), `test-audit-p0-3.js` 8/8.

**Domaines restants (tranches suivantes possibles, non commencées).** Génération de base des joueurs/effectifs, transferts internationaux (marché + international), génération de club/pyramide, composition/tactique, fatigue/moral/entraînement/blessures, calendrier/classement, sauvegarde/migration — chacun avec ses propres dépendances croisées à vérifier avant de couper, comme pour les tranches précédentes. `clubUI.js` (rendu) n'a pas encore été commencé.

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

### P0-5 — Site publié différent du code source (main en retard) — CORRIGÉ
- Reproduit par comparaison réelle `main` vs `claude/readme-details-6aj3jt` : `main` en retard de 10 commits (ancêtre strict, aucune divergence), sans `docs/js/world.js` (Monde/Équipe B) ni les correctifs P0-1 à P0-4 — un simple push vers `main` aurait republié le site en arrière, sans aucun test (l'ancienne version non gardée du workflow était encore sur `main`).
- Corrigé, avec autorisation explicite de l'utilisateur, par un fast-forward de `main` vers `claude/readme-details-6aj3jt` (`59a9f7f` → `a92ec0f`, sans `--force` : refusé par git si ç'avait été autre chose qu'un fast-forward).
- Validation : `main` et la branche de travail strictement identiques après le push ; le déploiement déclenché sur `main` par ce push a lui-même exécuté avec succès le nouveau job `test` (garde-fou P0-4) avant `deploy` — run [30189945183](https://github.com/sebadiaz/Rugby.-Manager/actions/runs/30189945183).

### P1-6 — Étendre le test navigateur (mobile, retours arrière, rechargement en milieu d'action) — CORRIGÉ
- Ajoute : couverture mobile (tiroir de navigation 390×844), retours arrière au clavier (Échap sur fiche joueur, aperçu du match, panneau imbriqué fiche joueur adverse/club adverse), rechargement en milieu d'action (fiche joueur et aperçu du match ouverts pendant un F5).
- Bug réel trouvé en écrivant le test du panneau imbriqué : Échap sur la fiche d'un joueur adverse fermait aussi le club adverse d'un coup (deux niveaux au lieu d'un), car le gestionnaire clavier de `docs/js/clubUI.js` ne testait jamais `joueurAdversaireAfficheIndex`. Corrigé par une branche dédiée avant celle du club adverse.
- Tests : `server/test-parcours-navigateur.js` 72/72 (71/72 avant le correctif, confirmé par `git stash`), `test-invariants.js` 12/12, `test-parcours-club.js` 35/35, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-audit-p0-3.js` 8/8.

### P1-7 — Scénarios négatifs (budget, dernier joueur d'un poste, double clic, sauvegarde corrompue, saison terminée) — CORRIGÉ
- Prouve des gardes déjà présentes dans `docs/js/club.js` mais jamais testées : budget insuffisant (`signerJoueur`, `approcherJoueurAdverse`), dernier joueur d'un poste pour `libererJoueur` (distinct de `preterJoueur` déjà couvert), déjà prêté (`preterJoueur` rejoué), action répétée/double clic (`signerJoueur` rejoué, y compris deux clics DOM synchrones dans un vrai navigateur), saison terminée (`prochainesFixtures` vide), et — nouveau côté navigateur — l'avertissement de sauvegarde corrompue (P0-2) réellement affiché à l'écran.
- Aucun changement de comportement du jeu : uniquement de nouveaux tests sur des gardes déjà correctes.
- Tests : `server/test-parcours-club.js` 41/41 (35+6), `server/test-parcours-navigateur.js` 77/77 (72+5). Régression : `test-invariants.js` 12/12, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-audit-p0-3.js` 8/8.

### P1-8 — Remplacer window.confirm/prompt/alert par des fenêtres intégrées — CORRIGÉ (3 tranches)
- Tranche 1 : `#modalConfirmation` (`confirmerAction`) — remplace les 5 `window.confirm`.
- Tranche 2 : `#modalMontant` (`demanderMontant`) — remplace les 2 `window.prompt`, avec erreur inline sans perte de contexte (contrairement à l'ancien prompt+alert qui obligeait à tout ressaisir).
- Tranche 3 : les 13 `window.alert` répartis entre `toast(message, 'erreur')` (9 messages courts, non bloquant) et `#modalInfo` (`afficherInfo`, 2 messages substantiels à lire posément : bilan de fin de saison, avertissement de sauvegarde corrompue P0-2).
- Amélioration visible : boîtes/fenêtres stylées cohérentes avec le thème du jeu au lieu de boîtes système grises (vérifié par capture d'écran pour les trois types de fenêtres).
- `grep -c "window\.\(alert\|confirm\|prompt\)(" docs/js/clubUI.js` → 0.
- Tests : `server/test-parcours-navigateur.js` 86/86 (85+1). Régression : `test-parcours-club.js` 41/41, `test-invariants.js` 12/12, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-audit-p0-3.js` 8/8.

### P1-9 — Carrière longue (12 saisons, rechargements réguliers) — CORRIGÉ
- Nouveau test dans `server/test-parcours-club.js` : 12 saisons, 4 rechargements simulés par saison (48 au total, même mécanisme que `test-audit-p0-1.js`), avec des actions réalistes entre chaque (transferts, prêts, contrats, personnel, scouting, favoris, rafraîchissement des marchés) et le calendrier complet joué à chaque saison.
- Après chaque rechargement : aucun id dupliqué (4 espaces de noms), aucun NaN/Infinity (parcours récursif générique de la saison), composition toujours complétable, aucune donnée perdue (identité du club, progression du numéro de saison).
- Validité du test prouvée : désactiver temporairement `resynchroniserCompteurs()` (le correctif P0-1) fait échouer le test dès le milieu de la première saison (ids dupliqués) ; réactivé, tout repasse au vert.
- `docs/js/club.js` n'a pas eu besoin d'être modifié : les gardes existantes suffisent, seule la preuve manquait.
- Tests : `server/test-parcours-club.js` 42/42 (41+1). Régression : `test-invariants.js` 12/12, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-audit-p0-3.js` 8/8, `test-parcours-navigateur.js` 86/86.

### P2-10 — Découpage de club.js par domaine, tranche 1 (Personnel) — EN COURS
- Nouveau `docs/js/club-personnel.js` : `POSTES_PERSONNEL`, `genererMembrePersonnel`, `genererMarchePersonnel`, `embaucherPersonnel`, `licencierPersonnel`, `masseSalarialePersonnel`, `effetPersonnel`, `resynchroniserCompteurPersonnel`.
- L'export de `club.js` passe de `global.RMClub = {...}` (réaffectation) à `global.RMClub = Object.assign(global.RMClub || {}, {...})` (fusion) — sinon l'ordre de chargement des deux fichiers casserait tout. `choisir`/`genererNomJoueur` exportés pour que le nouveau fichier puisse s'en servir.
- Dépendance croisée trouvée en migrant (pas anticipée) : `resynchroniserCompteurs` (P0-1) mutait directement `compteurPersonnelId`, sortie de la fermeture de `club.js` — corrigée par une fonction dédiée exportée `resynchroniserCompteurPersonnel(maxPersonnel)`.
- Aucun comportement changé, seuls 3 points d'appel externes adaptés pour passer par `RMClub.*`. `docs/index.html` et 4 fichiers de test Node mis à jour pour charger le nouveau fichier.
- Tests (suite complète) : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4 (dont le test de resynchronisation du personnel), `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 86/86, `test-audit-p0-3.js` 8/8.
- Domaines restants : nombreux (voir détail dans la section P2-10 ci-dessus), `clubUI.js` pas commencé.

### P2-10 — Découpage de club.js par domaine, tranche 2 (Objectif de saison) — EN COURS
- Nouveau `docs/js/club-objectif.js` : `determinerObjectifSaison`, `libelleObjectifSaison`, `evaluerObjectifSaison` — 3 fonctions pures, aucun état de module, le domaine le plus simple à ce jour.
- Contrairement à la tranche 1, aucune dépendance croisée cachée trouvée en migrant : 4 points d'appel externes (dans `avancerSaison`/`nouvelleSaison`) adaptés pour passer par `RMClub.*`, même mécanisme de fusion `Object.assign`, aucune nouvelle aide générique à exporter.
- Tests (suite complète) : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 86/86 (carte "Objectif de la saison", bilan de fin de saison), `test-audit-p0-3.js` 8/8.

### P2-10 — Découpage de club.js par domaine, tranche 3 (Analyse adversaire) — EN COURS
- Nouveau `docs/js/club-analyse.js` : `POSTES_AVANTS`, `moyenneAttribut`, `ATTRIBUTS_ANALYSE`, `analyserAdversaire`.
- Domaine autonome à l'exception de deux fonctions du domaine calendrier/classement (`club`, `classementTrie`), restées dans `club.js`, appelées via `RMClub.*` — dépendance identifiée et vérifiée avant de couper, pas une surprise comme la tranche 1 (aucun état de module ici).
- Tests (suite complète) : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 86/86 (fiche du club adverse, analyse comparative), `test-audit-p0-3.js` 8/8.

### P2-10 — Découpage de club.js par domaine, tranche 4 (Prêts) — EN COURS
- Nouveau `docs/js/club-prets.js` : `preterJoueur`, `rappelerJoueur`, `progresserPrets`.
- Aucun appelant interne à `club.js`, une seule dépendance externe (`ajouterMessage`) appelée via `RMClub.*`. `ajouterMessage` lui-même reste délibérément dans `club.js` (18 points d'appel dans presque tous les domaines) — extrait, il forcerait à toucher la quasi-totalité du fichier d'un coup, contrairement à l'esprit "petites tranches".
- Tests (suite complète) : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 86/86, `test-audit-p0-3.js` 8/8.

### P2-10 — Découpage de club.js par domaine, tranche 5 (Contrats) — EN COURS
- Nouveau `docs/js/club-contrats.js` : `calculerOffreRenouvellement`, `renouvelerContrat`, `negocierRenouvellement`.
- Aucun appelant interne à `club.js`. Nouvelle aide générique exportée : `calculerSalaire` (formule salariale, aussi utilisée par plusieurs fonctions de génération de joueurs restées dans `club.js`).
- `calculerPrimeSignature` (adjacente dans l'ancien code mais utilisée par `signerJoueur`, domaine marché des transferts pas encore extrait) délibérément restée dans `club.js` — pas le même domaine malgré la proximité.
- Tests (suite complète) : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 86/86 (négociation de contrat), `test-audit-p0-3.js` 8/8.

### P2-10 — Découpage de club.js par domaine, tranche 6 (Équipe B) — EN COURS
- Nouveau `docs/js/club-equipe-b.js` : `determinerEligiblesEquipeB`, `genererCompetitionB`, `assurerCompetitionB`, `enregistrerResultatEquipeB`, `prochaineRondeEquipeB`, `effectifDisponiblePourEquipeB`, `appliquerEffetsMatchEquipeB`.
- Dépend de 3 fonctions calendrier/classement déjà exportées (`genererCalendrier`, `classementInitial`, `enregistrerResultatDans`) — rien à exporter en plus, aucun état de module. 2 points d'appel externes (`avancerSaison`, `nouvelleSaison`) adaptés.
- Tests (suite complète) : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 86/86 (les 5 tests "équipe B"), `test-audit-p0-3.js` 8/8.