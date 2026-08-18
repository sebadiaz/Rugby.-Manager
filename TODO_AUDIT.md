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
- **Statut : CORRIGÉ, PREUVE COMPLÈTE OBTENUE SUR LE SITE PUBLIC RÉEL.** Le premier correctif (fast-forward ponctuel de `main`, voir entrée « CORRIGÉ » historique dans le journal ci-dessous) n'avait traité que le SYMPTÔME, jamais la CAUSE (`deploy-pages.yml` sans garde-fou sur le job `deploy`) — récidive détectée (29 des 30 derniers runs déployés depuis `claude/readme-details-6aj3jt`, `main` figé à `a92ec0f` depuis 14 h+). Cause racine corrigée dans `.github/workflows/deploy-pages.yml` (garde `if: github.ref == 'refs/heads/main'` sur `deploy`, `version.json`, job `verify`), confirmée deux fois sur la vraie infrastructure GitHub Actions : (1) un push sur la branche de travail montre `deploy`/`verify` correctement **skipped** ; (2) avec l'autorisation explicite de l'utilisateur, `main` a été avancé par fast-forward (`a92ec0f` → `eb1022a`, ancêtre strict, aucun conflit) — le run déclenché sur `main` montre `test` → succès, `deploy` → succès, `verify` → **succès** (le nouveau `server/test-deploy-public.js` a validé la vraie URL publique avec `--expect-commit eb1022a`). Confirmé indépendamment après coup : `curl https://sebadiaz.github.io/Rugby.-Manager/version.json` renvoie `{"commit":"eb1022a...","ref":"main",...}`, et le HTML public contient bien le nouveau texte P1-10 ("Ligue Régionale", plus de "6 clubs"). Le site public correspond maintenant exactement au commit `main`. Voir entrée datée dans le journal ci-dessous pour le détail complet.
- Priorité : P0 (fiabilité — le site public peut régresser silencieusement)
- Fichiers concernés :
  - `.github/workflows/deploy-pages.yml` (cause racine : job `deploy` sans garde-fou de branche)
  - `server/test-deploy-public.js` (nouveau — vérifie la vraie URL publique après déploiement)
  - `docs/index.html`, `docs/css/style.css` (affichage discret de l'identifiant de version)
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

### P0-6. Économie de saison : `appliquerFinancesMatch` prélevait ~2,6× la masse salariale annuelle
- **Statut : CORRIGÉ**
- Priorité : P0 (fiabilité — budget de carrière faussé sur toute la durée d'une saison)
- Fichiers concernés :
  - `docs/js/club.js` (cause + correction : signature et logique de `appliquerFinancesMatch`, commentaire de `genererCalendrier` mis à jour)
  - `docs/js/club-calendrier.js` (nouvelle fonction `nombreJourneesSaison`)
  - `docs/js/clubUI.js` (2 points d'appel corrigés : simulation d'une journée + affichage de l'onglet Finances)
  - `server/test-parcours-club.js` (3 nouveaux tests — reproduction/validation)

**Reproduction.** La division de départ (Ligue Régionale) compte 14 clubs, donc `genererCalendrier` produit `2*(n-1) = 26` journées (confirmé : `new Set(saison.calendrier.map(f=>f.journee)).size === 26`). Or `appliquerFinancesMatch(club, forme)` prélevait `Math.round(masseSalariale(effectif) / 10)` à CHAQUE journée — `10` étant une constante figée héritée d'un ancien championnat à 10 journées (6 clubs), jamais mise à jour après l'introduction de la pyramide française. Simulation d'une saison complète (26 journées, `creerRng(201)`) : masse salariale annuelle joueurs = 612 k€, total réellement prélevé sur la saison = 1586 k€, soit un ratio de **2,59×** — quasiment exactement le "~2,6 fois" signalé. Un second foyer du même bug a été trouvé par grep (`/ 10\b`) : l'onglet Finances (`clubUI.js`, ligne 841) affichait aussi `Math.round((masseJoueurs + massePersonnel) / 10)` comme "Total / journée", donc un chiffre visible au joueur ~2,6× trop élevé, indépendamment du prélèvement réel.

**Cause.** Diviseur `10` en dur, jamais paramétré sur le vrai nombre de journées du calendrier généré ; commentaire de `appliquerFinancesMatch` et de `genererCalendrier` toujours fondés sur l'ancien championnat à 6 clubs/10 journées.

**Correction.**
- Nouvelle fonction `RMClub.nombreJourneesSaison(calendrier)` (`club-calendrier.js`) : `new Set(calendrier.map(f => f.journee)).size` — dérive le nombre de journées du calendrier RÉEL de la saison en cours, jamais d'une constante figée. Fonctionne aussi bien pour une ancienne sauvegarde dont la division avait une autre taille (ex. 6 clubs/10 journées) : le calendrier stocké dans CETTE sauvegarde fait foi, aucune migration nécessaire (compatibilité descendante, requête #5).
- `appliquerFinancesMatch(club, forme, nbJournees)` (`club.js`) : accepte désormais `nbJournees` en 3ᵉ paramètre (repli défensif à `26` en dernier recours, jamais sollicité en pratique). Les deux points d'appel (`clubUI.js` : simulation d'une journée + affichage Finances) passent `RMClub.nombreJourneesSaison(saison.calendrier)`.
- `appliquerFinancesMatchEquipeB` vérifiée : retourne déjà `salaires: 0, salairesPersonnel: 0` — ne redéduit jamais les salaires pour un match d'Équipe B (requête #4, déjà satisfaite, aucun changement nécessaire, confirmé par un nouveau test dédié plutôt que supposé).
- Prévisions financières et budget initial (requête #7) : `budgetInitial` (`club-pyramide.js`) n'a aucune dépendance à la constante de journées — aucun changement nécessaire. Vérifié par simulation manuelle d'une saison complète (26 journées, résultats alternés) : le budget évolue sainement (401 k€ → 2884 k€) et `prevoirFinances` produit des projections cohérentes avec le nouveau prélèvement.

**Chiffres avant/après (saison complète, 26 journées, `creerRng(201)`).**
| | Avant | Après |
|---|---|---|
| Masse salariale annuelle (joueurs) | 612 k€ | 612 k€ |
| Total prélevé sur la saison | 1586 k€ | 624 k€ |
| Ratio prélevé/masse annuelle | 2,59× | 1,02× |
| Onglet Finances, "Total / journée" (exemple réel, 629 k€ de masse) | ~63 k€ | 24 k€ |

**Critères de validation.**
- 3 nouveaux tests dans `server/test-parcours-club.js` : total prélevé sur une saison complète ≈ masse salariale annuelle (ratio 0,95-1,05, joueurs et personnel) ; un match d'Équipe B ne prélève jamais de salaire ; rétrocompatibilité (calendrier à 6 clubs/10 journées → diviseur 10, pas 26 en dur). Vérifiés en échec AVANT correctif (`git stash` sur les 3 fichiers de production) : `TypeError: RMClub.nombreJourneesSaison is not a function`, puis en succès après `git stash pop`.
- `test-parcours-club.js` : 45/45 (42 existants + 3 nouveaux). `test-monde.js` : 14/14. `test-audit-p0-1.js` : 4/4. `test-audit-p0-2.js` : 6/6. `test-textes-accueil.js` : 4/4. `test-invariants.js` : 12/12. `test-audit-p0-3.js` : 8/8. `test-parcours-navigateur.js` : 92/92 (aucune régression, y compris le double-clic P1-10 et l'affichage financier Équipe B).
- Vérification visuelle (Playwright) de l'onglet Finances d'un club fraîchement créé : "Salaires joueurs (saison) 629 k€", "Total / journée 24 k€" (629/26 ≈ 24,2, correctement arrondi) — capture d'écran confirmée sans anomalie de mise en page.

### P0-7. Double clic réel sur "Signer" (marché des transferts) signe un second joueur non choisi
- **Statut : CORRIGÉ**
- Priorité : P0 (fiabilité — action non voulue du joueur, budget dépensé sur un joueur jamais choisi)
- Fichiers concernés :
  - `docs/js/clubUI.js` (cause + correction)
  - `server/test-parcours-navigateur.js` (nouveau test — reproduction + validation, double clic souris à coordonnées écran fixes)

**Contexte de la tâche.** Audit demandé : vérifier d'abord la fiabilité du déploiement (site public = `main`), puis jouer réellement au jeu (desktop + mobile) pour choisir UN SEUL problème visible à corriger. Déploiement vérifié sain (`version.json` public = SHA de `main`, HTML public sans trace de l'ancien texte "6 clubs", dernier run GitHub Actions sur `main` en succès). Parcours joué de bout en bout (création de club, tous les onglets, une journée complète, classement) sans régression. Un agent de recherche dédié a ensuite comparé plusieurs candidats de bug dans les catégories demandées (info incorrecte, écran incomplet, double action sur transferts/contrats, étape peu claire) ; celui retenu est le seul confirmé par une reproduction RÉELLE (pas juste une lecture de code suspecte).

**Reproduction.** Contrairement au renouvellement de contrat/à la libération d'un joueur (fenêtre `demanderMontant`/`confirmerAction`, déjà protégée — vérifié dans un audit précédent), signer (`btnSigner`) ou scouter (`btnScouter`) un joueur du marché des transferts (`gererClicJoueurMarche`, `docs/js/clubUI.js`) n'a AUCUNE fenêtre de confirmation : un clic agit IMMÉDIATEMENT et de façon synchrone, puis `rafraichirMarche()` reconstruit toute la liste (`innerHTML`), ce qui décale chaque ligne suivante d'une position à l'écran. Reproduit avec un VRAI double clic souris Playwright à coordonnées écran FIXES (`page.mouse.click(x,y)` deux fois — pas un double appel JS sur le même nœud, qui ne reproduit rien puisque `querySelector` ne retrouve plus l'id déjà signé) sur le bouton "Signer" de la 1ʳᵉ ligne, budget large pour écarter tout refus par manque de fonds : **2 joueurs rejoignent le club au lieu d'1** — le second (jamais choisi par le joueur) est celui dont le bouton "Signer" se retrouve, après le 1er clic, exactement à la même position écran que le bouton cliqué initialement.

**Cause.** Aucune protection anti-ré-entrée sur `gererClicJoueurMarche` (contrairement à `lancerLaJournee`/`journeeEnCours`, déjà protégée pour un autre geste) — chaque clic sur "Signer"/"Scouter" est traité indépendamment, sans savoir qu'une action vient tout juste d'avoir lieu à cet endroit précis de l'écran.

**Correction.** Nouveau verrou à durée fixe `marcheActionVerrouillee` (`docs/js/clubUI.js`) : posé dès qu'un clic "Signer" ou "Scouter" est traité, relâché après 800 ms. Un délai fixe (pas "tant que la promesse précédente n'est pas résolue", cf. `journeeEnCours`) car l'action est entièrement synchrone — sans expiration différée, le verrou se relâcherait avant même que le 2ᵉ clic, déjà en file d'attente côté navigateur, soit traité. 800 ms (pas 300-400) car mesuré empiriquement dans ce dépôt : sous charge machine réelle, l'écart entre les deux évènements DOM d'un même double-clic peut dépasser 400-500 ms — deux actions RÉELLEMENT distinctes du joueur restent, elles, toujours espacées de plusieurs secondes, donc jamais gênées par ce délai.

**Critères de validation.**
- Nouveau test Playwright dans `server/test-parcours-navigateur.js` (double clic souris à coordonnées fixes sur la 1ʳᵉ ligne "Signer", budget large). Vérifié en échec AVANT correctif (`git stash` sur `docs/js/clubUI.js`) : 2 joueurs signés au lieu d'1. Après correctif : 1 seul joueur signé, le bon.
- Suite complète sans régression : `test-parcours-navigateur.js` 94/94 (92 existants + 2 nouveaux), `test-parcours-club.js` 45/45, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-textes-accueil.js` 4/4, `test-invariants.js` 12/12, `test-audit-p0-3.js` 8/8.
- Aucune fonctionnalité supprimée, aucune sauvegarde cassée (le verrou est un état UI éphémère, jamais persisté).

### P0-8. Bouton "Signer" du marché des transferts inatteignable sur mobile étroit
- **Statut : CORRIGÉ**
- Priorité : P0 (fiabilité — un joueur sur mobile ne peut tout simplement pas recruter certains joueurs, geste bloquant)
- Fichiers concernés :
  - `docs/css/style.css` (cause + correction)
  - `server/test-parcours-navigateur.js` (nouveau test — reproduction + validation, viewport mobile réel 390×844)

**Contexte.** Découvert en vérifiant visuellement le correctif P0-7 sur une capture mobile (390×844) : capture jointe à la réponse précédente montrant le bouton "Scouter" coupé à l'écran et "Signer" absent.

**Reproduction.** Chaque ligne du marché (`.ligneMarche` : nom + stats, favori, prix, "Scouter", "Signer") ne tient pas sur ~390 px de large. `#clubMarche` avait `overflow-x: visible` (aucun défilement) et un ancêtre masque le débordement (`document.body.scrollWidth` reste à 390 px — la page elle-même ne défile pas non plus). Mesuré : le bouton "Signer" de la 1ʳᵉ ligne a `getBoundingClientRect().left ≈ 415px` pour une fenêtre de 390 px — **entièrement hors écran et strictement inatteignable**, pas seulement esthétiquement coupé (aucun geste de défilement, tactile ou souris, ne le ramène : `overflow-x:visible` n'est pas un conteneur de défilement). Un vrai clic Playwright réussissait quand même à l'atteindre (son auto-scroll interne compense l'absence de défilement CSS) — ce qui masquait le bug tant qu'aucun test ne vérifiait la propriété CSS elle-même, seulement l'issue du clic.

**Cause.** `.ligneMarche` (marché des transferts, `docs/js/clubUI.js`) n'avait jamais reçu le même traitement responsive que l'effectif étendu ou le classement (`#clubEffectif`, `#clubClassement`, déjà en `overflow-x: auto` avec indice visuel de défilement sur petit écran, `docs/css/style.css` lignes 463-478) — un oubli lors de l'ajout du marché, jamais remarqué car jamais testé sur un viewport réellement étroit.

**Correction** (`docs/css/style.css`) : même traitement que l'effectif étendu — `#clubMarche, #clubFavoris { overflow-x: auto; -webkit-overflow-scrolling: touch; }` (persistant, toutes tailles d'écran) + `.ligneMarche { min-width: 480px; }` (garde la ligne lisible plutôt que de la comprimer) + ajout de `#clubMarche, #clubFavoris` à l'indice visuel de défilement (`mask-image`) déjà existant sous `@media (max-width: 899px)`.

**Critères de validation.**
- Nouveau test Playwright (viewport mobile réel 390×844, `server/test-parcours-navigateur.js`) : vérifie que `#clubMarche` a bien `overflow-x: auto` et un contenu plus large que l'écran (la vraie reproduction — discrimine correctement avant/après, contrairement à un simple test de clic que Playwright réussit de toute façon), puis qu'après un défilement explicite le bouton "Signer" devient réellement cliquable et recrute le joueur. Vérifié en échec AVANT correctif (`git stash` sur `docs/css/style.css`) : `overflow-x` valait `visible`. Après correctif : `auto`, contenu réellement scrollable.
- Suite complète sans régression : `test-parcours-navigateur.js` 96/96 (94 existants + 2 nouveaux), `test-parcours-club.js` 45/45, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-textes-accueil.js` 4/4, `test-invariants.js` 12/12, `test-audit-p0-3.js` 8/8.
- Aucun changement de comportement desktop (le `min-width` ne s'applique qu'en dessous de la largeur de conteneur disponible ; `#clubEffectif`/`#clubClassement` utilisent déjà ce même mécanisme sans régression connue).

### P0-9. Identifiant de version (P0-5) invisible en pratique — toujours peint SOUS le panneau courant
- **Statut : CORRIGÉ**
- Priorité : P0 (fiabilité — l'outil de vérification déployé pour P0-5 ne remplissait jamais son rôle auprès du joueur)
- Fichiers concernés :
  - `docs/css/style.css` (cause + correction)
  - `server/test-parcours-navigateur.js` (nouveau test — reproduction + validation)

**Contexte.** Signalé par l'utilisateur ("y a pas de petit texte") après que je lui ai indiqué de vérifier `#versionInfo` (coin bas-droit, cf. P0-5) pour distinguer un vrai problème de déploiement d'un simple cache navigateur.

**Reproduction.** `#versionInfo` (`docs/css/style.css`) avait `z-index: 5`, alors que `.panneau` (accueil, Mode Club, vue match — quasiment TOUJOURS affiché en pratique) a `z-index: 10`. Le texte de version était donc peint SOUS le panneau, jamais visible, quel que soit l'écran ou l'appareil — pas un problème de cache côté joueur, un vrai bug d'empilement CSS resté invisible depuis l'introduction de P0-5. `document.elementFromPoint()` masquait initialement le diagnostic (il "voit à travers" un élément à `pointer-events:none`, comme `#versionInfo`, et renvoie ce qu'il y a en dessous même quand l'élément est réellement peint au-dessus) — confirmé uniquement par une capture d'écran directe : texte totalement absent avant correctif, "v5e6a9be" bien visible après.

**Cause.** `z-index: 5` choisi sans vérifier qu'il devait dépasser celui du panneau plein écran quasi permanent (`z-index: 10`) — jamais remarqué faute de test visuel sur ce point précis lors de l'implémentation initiale de P0-5.

**Correction.** `#versionInfo` passé à `z-index: 11` (juste au-dessus des panneaux, encore largement en dessous des tiroirs/modales à 900+, qui peuvent légitimement le recouvrir temporairement).

**Critères de validation.**
- Nouveau test dans `server/test-parcours-navigateur.js` : compare `getComputedStyle` du z-index de `#versionInfo` à celui du `.panneau.visible` courant (structurel — détecterait aussi une régression future si le z-index d'un panneau changeait). Vérifié en échec AVANT correctif (`git stash` sur `docs/css/style.css`), succès après.
- Suite complète sans régression : `test-parcours-navigateur.js` 97/97 (96 existants + 1 nouveau), `test-parcours-club.js` 45/45, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-textes-accueil.js` 4/4, `test-invariants.js` 12/12, `test-audit-p0-3.js` 8/8.

### P0-10. Onglet Équipe B : jamais la liste des joueurs réellement sélectionnés
- **Statut : CORRIGÉ**
- Priorité : P0 (fiabilité de l'information — le joueur ne sait jamais qui joue vraiment pour son équipe B)
- Fichiers concernés :
  - `docs/index.html` (nouvelle carte `carteEquipeBComposition`)
  - `docs/js/clubUI.js` (cause + correction : `rafraichirEquipeB`)
  - `server/test-parcours-navigateur.js` (nouveau test — reproduction + validation)

**Contexte.** Signalé par l'utilisateur ("même pas la liste de joueurs de l'équipe B"), confirmé par un audit dédié (agent de recherche) avant toute correction.

**Reproduction.** `rafraichirEquipeB()` (`docs/js/clubUI.js`) ne construisait que deux blocs : un classement de clubs (`clubEquipeBClassement`) et un calendrier de scores (`clubEquipeBCalendrier`) — jamais les noms des joueurs. Pourtant le vivier réellement utilisé pour simuler le match (réservistes non convoqués en 1er XV + centre de formation, cf. `RMClub.effectifDisponiblePourEquipeB`) est bien calculé ailleurs dans le même fichier (`clubUI.js:2117`, au moment de jouer la journée) — il n'était simplement jamais affiché au joueur.

**Cause.** Oubli lors de l'implémentation initiale de l'Équipe B (P2-10 tranche 6) : le classement/calendrier du championnat B a été construit par analogie avec le championnat principal, mais la composition n'a jamais eu d'équivalent visuel à la "Composition" du 1er XV.

**Correction.** Nouvelle carte "Composition Équipe B" (`docs/index.html`), remplie par `rafraichirEquipeB()` : calcule EN DIRECT (jamais stocké séparément, donc jamais désynchronisé du vivier réel) `RMClub.effectifDisponiblePourEquipeB(saison)` + `RMClub.meilleureComposition(...)`, affiche les 15 postes avec le nom du joueur retenu (badge 🌱 s'il vient du centre de formation), le nombre de joueurs disponibles ce jour-là, et un avertissement explicite si un poste ne peut pas être pourvu (`RMClub.validerComposition`).

**Critères de validation.**
- Nouveau test dans `server/test-parcours-navigateur.js` : vérifie que la carte de composition est visible et contient bien 15 lignes de poste. Vérifié en échec AVANT correctif (`git stash` sur `docs/index.html`+`docs/js/clubUI.js`) : élément introuvable (timeout). Après correctif : 15 lignes affichées avec des noms réels.
- Suite complète sans régression : `test-parcours-navigateur.js` 99/99 (97 existants + 2 nouveaux), `test-parcours-club.js` 45/45, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-textes-accueil.js` 4/4, `test-invariants.js` 12/12, `test-audit-p0-3.js` 8/8.

### P0-11. "Renouveler" (contrat) proposé seulement en dernière année — invisible sinon
- **Statut : CORRIGÉ**
- Priorité : P0 (fiabilité de l'information — le joueur pensait la gestion de contrat absente du jeu)
- Fichiers concernés :
  - `docs/js/clubUI.js` (cause + correction)
  - `server/test-parcours-navigateur.js` (nouveau test — reproduction + validation)

**Contexte.** Signalé par l'utilisateur ("pas de gestion de contrat") dans le même message que P0-10.

**Reproduction.** Le bouton "Renouveler" (fiche joueur, onglet Effectif) n'était affiché que si `j.contrat <= 1` (dernière année). Or `RMClub.negocierRenouvellement`/`renouvelerContrat` (`docs/js/club-contrats.js`) n'ont AUCUNE condition sur la durée restante — ils fonctionnent pour n'importe quel joueur. Un manager qui renouvelle ses joueurs avant l'expiration (ou qui n'a simplement pas encore de contrat proche de la fin) ne voit donc jamais ce bouton, au point de croire que la fonctionnalité n'existe pas.

**Cause.** Condition d'affichage restrictive côté UI, sans justification de jeu documentée ni contrepartie dans la logique de négociation elle-même.

**Correction** (`docs/js/clubUI.js`) : le bouton "Renouveler" est désormais toujours affiché dans la fiche d'un joueur de l'effectif pro, quelle que soit la durée de contrat restante.

**Critères de validation.**
- Nouveau test dans `server/test-parcours-navigateur.js` : vérifie que le bouton apparaît pour un joueur à 3 ans de contrat restants (pas seulement à 1 an). Vérifié en échec AVANT correctif (`git stash` sur `docs/js/clubUI.js`), succès après.
- Suite complète sans régression : `test-parcours-navigateur.js` 100/100 (99 existants + 1 nouveau), `test-parcours-club.js` 45/45, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-textes-accueil.js` 4/4, `test-invariants.js` 12/12, `test-audit-p0-3.js` 8/8.
- Note méthodologique : un run intermédiaire a montré un échec isolé et non reproductible du test P0-7 ("double clic écran sur Signer") — confirmé transitoire (0 échec sur deux ré-exécutions immédiates suivantes), cohérent avec la flakiness déjà documentée en P0-7 (délai fixe de 800 ms parfois dépassé sous charge machine). Sans lien avec ce correctif. **Confirmé plus tard sur la vraie infrastructure CI (voir P0-12 ci-dessous) : ce n'était pas juste une observation locale, le test a réellement bloqué un déploiement.**

### P0-12. Test P0-7 ("double clic écran sur Signer") réellement flaky en CI — a bloqué un déploiement
- **Statut : CORRIGÉ**
- Priorité : P0 (fiabilité de la CI — un test flaky peut bloquer indéfiniment un déploiement légitime)
- Fichiers concernés :
  - `server/test-parcours-navigateur.js` (cause + correction — test uniquement, aucun code de jeu modifié)

**Reproduction.** Le commit du correctif P0-10 (liste des joueurs Équipe B), poussé sur `main`, a réellement échoué sur la vraie infrastructure GitHub Actions (run [30545297797](https://github.com/sebadiaz/Rugby.-Manager/actions/runs/30545297797)) — `deploy`/`verify` **skipped**, le correctif n'a temporairement PAS été mis en ligne. Log exact : le seul test en échec était "double clic écran sur 'Signer'" (P0-7), tous les autres (dont les 2 nouveaux tests Équipe B) au vert. Poussé une 2ᵉ fois avec le correctif suivant (P0-11) : run repassé au vert sans changement sur ce test, confirmant la nature transitoire — mais bien réelle, pas une observation locale isolée.

**Cause.** Le test original utilisait deux appels `page.mouse.click(x, y)` séparés (deux allers-retours Playwright/CDP), avec une latence réseau variable entre les deux — sous charge (runner GitHub partagé), cette latence a dépassé le verrou de 800 ms du correctif P0-7, qui s'était donc déjà relâché avant le 2ᵉ clic : le test observait alors, à tort, le SYMPTÔME d'un correctif absent alors que le correctif est bien réel et fonctionnel.

**Correction.** Remplacé les deux `page.mouse.click()` par un seul `page.evaluate()` qui dispatche deux `MouseEvent` synchrones au même point écran (`document.elementFromPoint(x,y).dispatchEvent(...)`, appelé deux fois de suite dans la même exécution JS, sans aller-retour réseau entre les deux) — reproduit fidèlement le pire cas réel (deux clics quasi simultanés) sans dépendre de la latence de l'outil de test.

**Critères de validation.**
- Vérifié que le test réécrit détecte toujours correctement l'absence du correctif : verrou temporairement neutralisé (`if (marcheActionVerrouillee) return` → `if (false) return`) dans une copie de travail, le test échoue bien comme attendu ; restauré, 2 exécutions consécutives propres (0 échec) là où l'ancienne version avait déjà flaké deux fois (une fois en local, une fois en CI réelle).
- Suite complète sans régression : `test-parcours-navigateur.js` 100/100, `test-parcours-club.js` 45/45, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-textes-accueil.js` 4/4, `test-invariants.js` 12/12, `test-audit-p0-3.js` 8/8.

### P0-13. Les autres paliers de la pyramide française n'étaient jamais simulés
- **Statut : CORRIGÉ (première tranche)**
- Priorité : P0 (crédibilité de la progression — la pyramide française ressemblait à une étiquette vide en dehors du palier du joueur)
- Fichiers concernés :
  - `docs/js/club-pyramide-france.js` (nouveau — génération + simulation abstraite des 2 autres paliers)
  - `docs/index.html` (nouvelle carte "Autres paliers de la pyramide", nouveau `<script>`)
  - `docs/js/clubUI.js` (appel à chaque journée jouée + rendu de la nouvelle carte)
  - `server/test-parcours-club.js`, `server/test-parcours-navigateur.js` (nouveaux tests — reproduction + validation)

**Contexte.** Signalé par l'utilisateur ("les autres championnats ne sont jamais simulés"), confirmé par un audit dédié (agent de recherche) avant toute correction : `saison.clubJoueur.palierPyramide`/`saison.adversaires`/`saison.calendrier`/`saison.classement` ne représentent QUE le palier occupé par le club du joueur. Les deux autres paliers (Ligue d'Excellence/Nationale/Régionale, cf. `club-pyramide.js`) n'avaient aucune trace persistante (pas de clubs, pas de calendrier) — `avancerSaison` régénérait à chaque montée/descente un tout nouvel effectif d'adversaires depuis zéro, comme si l'ancien palier n'avait jamais existé.

**Cause.** La pyramide française n'a jamais eu d'équivalent au système déjà en place pour les 12 autres pays (`docs/js/world.js` : clubs persistants + calendrier + classement + simulation abstraite `simulerResultatAbstrait`, avancée à chaque journée) — seul le palier du joueur en avait profité.

**Correction (première tranche, périmètre volontairement limité).** Nouveau fichier `club-pyramide-france.js`, reprenant le principe déjà établi par `world.js` (clubs légers, calendrier round-robin, classement, simulation abstraite — dupliquée en local pour ne créer aucune dépendance vers `world.js`, même principe déjà documenté dans `club-pyramide.js`) :
- `assurerAutresDivisionsFrance(rng, saison)` : crée (ou resynchronise après une montée/descente) `saison.autresDivisionsFrance = { niveauExclu, divisions: {...} }`, peuplant réellement les 2 paliers que le joueur n'occupe PAS cette saison.
- `avancerJourneeAutresDivisionsFrance(rng, autresDivisions)` : avance chaque division d'une journée — appelée à **CHAQUE** journée réellement jouée par le joueur (`clubUI.js`, `lancerLaJournee`), **jamais conditionnée à l'ouverture d'un onglet** (contrairement au Monde, une limite déjà connue — volontairement pas reproduite ici).
- Nouvelle carte "Autres paliers de la pyramide" (onglet Autres clubs) : classement réel de chaque palier non occupé, mis à jour à chaque journée.

**Explicitement hors périmètre de cette tranche (à faire plus tard) :** faire persister l'identité des clubs d'un palier à l'autre lors d'une montée/descente du joueur (aujourd'hui, comme pour `saison.adversaires`, le palier quitté est régénéré à neuf plutôt que de rejoindre le palier réellement simulé) — éviter de réconcilier deux modèles de données indépendamment ensemencés était le compromis retenu pour garder cette première tranche petite et sûre.

**Critères de validation.**
- 4 nouveaux tests dans `server/test-parcours-club.js` : bonne taille de division pour les 2 paliers non occupés ; une journée simulée produit des résultats réels (points > 0, pas des zéros) ; une montée/descente resynchronise correctement (le palier quitté redevient peuplé, le palier rejoint ne l'est plus) ; rétrocompatibilité (sauvegarde antérieure sans le champ, aucun plantage). Vérifié en échec AVANT correctif (fichier temporairement déplacé) : erreur de chargement immédiate. Après correctif : 4/4.
- 2 nouveaux tests dans `server/test-parcours-navigateur.js` : la carte affiche un classement réel (pas vide), les 2 paliers sont bien nommés. Vérifié en échec AVANT correctif (carte HTML temporairement retirée) : élément introuvable (timeout). Après correctif : 2/2.
- Suite complète sans régression : `test-parcours-club.js` 49/49 (45 existants + 4 nouveaux), `test-parcours-navigateur.js` 102/102 (100 existants + 2 nouveaux), `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-textes-accueil.js` 4/4, `test-invariants.js` 12/12, `test-audit-p0-3.js` 8/8.

**Addendum (verrou anti-double-action durci).** En stabilisant les tests de P0-14 (ci-dessous), le test P0-7 a de nouveau flaké localement — cette fois-ci malgré la réécriture synchrone de P0-12. Cause distincte : sous forte charge machine réelle (plusieurs processus concurrents dans ce dépôt), c'est le `setTimeout` de production lui-même (800 ms) qui peut être retardé par l'event loop, pas seulement la latence entre deux clics Playwright. Correction : verrou porté de 800 ms à 1 500 ms dans `docs/js/clubUI.js` (`marcheActionVerrouillee`), et attente préalable du test correspondante portée de 900 ms à 1 700 ms dans `server/test-parcours-navigateur.js`. Deux actions réelles du joueur restent toujours espacées de plusieurs secondes en pratique, donc sans impact perceptible sur le jeu. Validé par une exécution complète propre (103/103, 0 échec) après correctif, là où l'exécution précédente avait flaké sur ce même test.

### P0-14. Aucun tournoi/compétition pour les jeunes du centre de formation — le centre de formation ne "jouait" jamais
- **Statut : CORRIGÉ (première tranche)**
- Priorité : P0 (signalé directement par l'utilisateur : "pas de tournois junior")
- Fichiers concernés :
  - `docs/js/club-espoirs.js` (nouveau — règles du match espoirs : périodicité, éligibilité, adversaire synthétique, effets)
  - `docs/js/clubUI.js` (déclenchement du match à chaque journée concernée, affichage du statut dans la carte Centre de formation)
  - `docs/index.html` (nouveau `<script>`, nouvel élément de statut dans la carte Centre de formation)
  - `server/test-parcours-club.js`, `server/test-parcours-navigateur.js` (nouveaux tests — reproduction + validation)

**Contexte.** Dernier des 4 points signalés par l'utilisateur dans son message ("pas de tournois junior"). Confirmé avant correction : le centre de formation (`club-centre-formation.js`) génère bien un vivier de jeunes ("espoirs") avec progression et promotion possible vers l'effectif professionnel, mais ces jeunes ne jouaient JAMAIS le moindre match tant qu'ils n'étaient pas promus — aucune compétition, aucun calendrier, aucune trace d'activité pour eux.

**Cause.** Contrairement à l'Équipe B (`club-equipe-b.js`, qui a son propre calendrier réel et simule un vrai match via le moteur à chaque journée), le centre de formation n'avait aucun mécanisme équivalent : c'est une simple liste de joueurs en progression passive, sans jamais de mise en situation de match.

**Correction (première tranche, périmètre volontairement limité — même compromis que P0-13).** Plutôt que de construire un calendrier persistant et une pyramide "espoirs" complète (retenu comme trop risqué pour une première tranche), un match espoirs réel se joue tous les `PERIODE_JOURNEES_ESPOIRS` (4) journées jouées par le club du joueur :
- `RMClub.journeeDeMatchEspoirs(journee)` : détermine si la journée en cours déclenche un match espoirs.
- `RMClub.eligiblePourMatchEspoirs(saison)` : un match n'est joué que si les 15 postes du centre de formation sont couverts (`meilleureComposition` + `validerComposition`), sinon le statut affiché explique pourquoi aucun match n'a lieu.
- `RMClub.niveauAdversaireEspoirs(niveauClubAdverse)` : génère un adversaire synthétique (académie du prochain club adverse réel du calendrier, jamais persisté) nettement plus modeste qu'une équipe première (niveau réduit à 35 % max, avec un plancher).
- Le match est réellement simulé par le moteur (`window.RMMain.simulerMatchEnArrierePlan`, même mécanisme que l'Équipe B et le match du joueur), pas un jet de dés abstrait — un vrai message de résultat avec un score réel est ajouté à la boîte de réception (catégorie "jeunes").
- `RMClub.appliquerEffetsMatchEspoirs` : seuls les 15 jeunes réellement alignés dans la composition gagnent du temps de jeu (`matchsJoues`, fatigue, moral) — pas tout le vivier.
- Nouveau statut visible dans la carte Centre de formation : annonce le prochain match espoirs, ou explique pourquoi aucun n'est possible (effectif incomplet).

**Explicitement hors périmètre de cette tranche (à faire plus tard) :** un vrai championnat espoirs avec classement et calendrier persistants (comme les autres paliers de P0-13) plutôt que des matchs isolés périodiques contre un adversaire synthétique jamais revu ; des statistiques de progression liées aux performances en match espoirs (aujourd'hui la progression du jeune reste uniquement liée à l'entraînement, pas à ses matchs).

**Critères de validation.**
- 4 nouveaux tests dans `server/test-parcours-club.js` : périodicité correcte ; éligibilité vraie à la création puis fausse si un poste se retrouve sans espoir (isolé via `RMClub.nouvelleSaison(...)` dédiée pour ne pas contaminer la `saison` partagée du fichier de test) ; les effets de match ne s'appliquent qu'aux 15 jeunes alignés, pas aux autres ; l'adversaire synthétique reste nettement plus modeste qu'un adversaire de premier XV. Vérifié en échec AVANT correctif (fichier temporairement absent du chargement) : erreur de chargement immédiate. Après correctif : 53/53 (49 existants + 4 nouveaux).
- 1 nouveau test dans `server/test-parcours-navigateur.js` : calendrier avancé artificiellement (via localStorage) jusqu'à la journée déclencheuse, un vrai message de match espoirs avec un score apparaît bien dans la boîte de réception. Après correctif : 103/103 (102 existants + 1 nouveau), 0 échec.
- Suite complète sans régression : `test-parcours-club.js` 53/53, `test-parcours-navigateur.js` 103/103, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-textes-accueil.js` 4/4, `test-invariants.js` 12/12, `test-audit-p0-3.js` 8/8.

### P0-15. Boîte de réception 100% informative — aucune décision réelle du manager (premier chantier de `ROADMAP_FOOTBALL_MANAGER.md`)
- **Statut : CORRIGÉ (première tranche)**
- Priorité : P0 (demande explicite de l'utilisateur — faire de Rugby Manager un vrai jeu de gestion façon Football Manager ; voir `ROADMAP_FOOTBALL_MANAGER.md` pour l'état des lieux complet des 8 domaines)
- Fichiers concernés :
  - `docs/js/club-decisions.js` (nouveau — frustration liée au temps de jeu, génération/résolution de la décision)
  - `docs/js/club.js` (`ajouterMessage` accepte un `decision` optionnel)
  - `docs/js/club-condition-joueurs.js` (conséquences durables de `veutPartir` : moral qui ne remonte plus, progression stoppée)
  - `docs/js/clubUI.js` (déclenchement à chaque journée jouée, rendu des boutons de décision, badge "veut partir")
  - `docs/index.html`, `docs/css/style.css`
  - `server/test-parcours-club.js`, `server/test-parcours-navigateur.js` (nouveaux tests)

**Contexte.** Après avoir traité les 4 points signalés dans le message précédent de l'utilisateur, celui-ci a demandé explicitement d'arrêter la succession de petits correctifs/audits et de développer Rugby Manager comme un vrai jeu de gestion façon Football Manager, en commençant par un audit complet en 8 domaines (`ROADMAP_FOOTBALL_MANAGER.md`) puis en développant la fonctionnalité manquante la plus profonde en premier. L'audit (2 agents de recherche dédiés, citations fichier:ligne) confirme domaine par domaine : la boîte de réception (`clubUI.js:871`, `rafraichirMessages`) n'affiche QUE du texte informatif — le seul comportement au clic est de marquer un message comme lu (`clubUI.js:1563`) — alors que le manque de "mécontentements, demandes et discussions" côté joueurs est également confirmé absent (aucune plainte, aucune demande, aucun dialogue).

**Cause.** Aucun message généré par le jeu (transferts, blessures, contrats, résultats, changements de saison, match espoirs...) ne porte de choix actionnable — la structure même du message (`club.js:573`, `ajouterMessage`) ne prévoyait pas de champ pour ça.

**Correction (première tranche, périmètre volontairement limité).** `ajouterMessage` accepte désormais un 5ᵉ paramètre optionnel `decision` ({ type, joueurId, options, resolu }). Premier cas d'usage réel, choisi pour son impact direct sur le gameplay (statut/temps de jeu attendu, domaine 2 de la roadmap) : un joueur classé parmi les 2 meilleurs de son poste (`RMClub.estCandidatSelectionAttendue`) mais non sélectionné (ni titulaire ni banc) 3 journées jouées de suite vient réclamer plus de temps de jeu. Le manager doit RÉELLEMENT trancher, avec 2 vrais boutons directement dans la boîte de réception :
- **« Le rassurer »** : +10 de moral immédiat.
- **« Ignorer sa demande »** : −14 de moral ; à la 2ᵉ demande ignorée du même joueur, il veut quitter le club (`veutPartir`), avec 3 conséquences durables et visibles : badge 🚩 dans le tableau de l'effectif et sa fiche, moral qui dérive désormais vers 35 (au lieu de 65) tant qu'il ne joue pas, progression à l'entraînement totalement arrêtée (`club-condition-joueurs.js`, `appliquerEntrainement`).

Une fois tranchée, la décision reste visible (texte de résultat), les boutons disparaissent — jamais un message fantôme qu'on peut retrancher deux fois (idempotence vérifiée).

**Explicitement hors périmètre de cette tranche (à faire plus tard, cf. `ROADMAP_FOOTBALL_MANAGER.md`) :** d'autres types de décisions (demande salariale, offre de transfert reçue à arbitrer, conflit vestiaire) ; un indicateur de "temps de jeu attendu" affiché en continu plutôt qu'au moment de la plainte ; relier `veutPartir` au marché des transferts (aujourd'hui la volonté de départ n'a aucun effet sur le prix ou la probabilité d'acceptation d'une offre).

**Critères de validation.**
- 6 nouveaux tests dans `server/test-parcours-club.js` : heuristique "candidat légitime" (top 2 vs 3ᵉ d'un poste) ; génération réelle de la demande après le seuil de journées (pas avant) ; décision "Rassurer" (moral +10, idempotence au double clic) ; décision "Ignorer" répétée deux fois (moral −14 à chaque fois, `veutPartir` déclenché, message de demande de transfert généré) ; conséquence réelle sur l'entraînement (comparaison directe avec un joueur témoin dans les mêmes conditions) ; conséquence réelle sur la dérive du moral. Après correctif : 59/59 (53 existants + 6 nouveaux).
- 3 nouveaux tests dans `server/test-parcours-navigateur.js` : de vrais boutons d'action s'affichent (pas un texte) ; cliquer "Le rassurer" tranche réellement la décision (persisté en sauvegarde) et améliore le moral affiché ; une fois tranchée, les boutons disparaissent au profit d'un résultat affiché. Après correctif : 106/106 (103 existants + 3 nouveaux), 0 échec.
- Vérifié visuellement (captures d'écran desktop et mobile) : les boutons de décision s'affichent correctement dans les deux formats, restent pleinement cliquables sur mobile (390px de large), et le texte de résultat remplace bien les boutons après résolution.
- Suite complète sans régression : `test-parcours-club.js` 59/59, `test-parcours-navigateur.js` 106/106, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-textes-accueil.js` 4/4, `test-invariants.js` 12/12, `test-audit-p0-3.js` 8/8.

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

**P1-8 est maintenant complet (3 tranches) :** les 5 `window.confirm`, 2 `window.prompt` et 13 `window.alert` sont tous convertis — `grep -c "window\.\(alert\|confirm\|prompt\)(" docs/js/clubUI.js` renvoie 0.

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

### P1-10. Textes obsolètes, boucle principale et anti-double-action (parcours utilisateur)
- **Statut : CORRIGÉ (texte "6 clubs" corrigé ; accueil et boucle principale audités et déjà corrects ; bug sévère de double-clic trouvé et corrigé ; doubles signatures/renouvellements vérifiés déjà protégés — voir journal ci-dessous)**
- Priorité : P1 (parcours utilisateur — un texte factuellement faux mine la confiance ; un double-clic qui bloque le jeu est un vrai bug bloquant)
- Fichiers concernés :
  - `docs/index.html` (carte d'introduction du Mode Club, `#clubCreation`)
  - `docs/js/clubUI.js` (verrou anti-double-action `journeeEnCours`)
  - `server/test-textes-accueil.js` (nouveau — preuve automatisée du texte)
  - `server/test-parcours-navigateur.js` (nouvelle couverture — double clic sur "Lancer le match")

**Reproduction.** `docs/index.html` (carte `#clubCreation`, affichée AVANT la création d'un club) décrivait un « championnat complet à 6 clubs » — obsolète depuis l'introduction de la pyramide française (Ligue Régionale/Nationale/Excellence, 14 ou 16 clubs par division selon le palier, `docs/js/club-pyramide.js`), du Monde (12 pays, compétitions internationales) et de l'Équipe B. Une fois la carrière commencée, le palier réel s'affiche déjà correctement dans l'entête du club (`RMClub.nomPalierFrance`, `docs/js/clubUI.js`) — seul ce texte d'introduction, statique et jamais mis à jour depuis l'ajout de la pyramide, restait faux.

**Corrigé.** Le paragraphe d'introduction remplacé par un texte exact : division de départ (Ligue Régionale, 14 clubs, aller-retour), progression (Ligue Nationale puis Ligue d'Excellence selon le classement), compétitions mondiales, et Équipe B (conditionnelle au budget, comme dans le jeu réel).

**Preuve.** Nouveau `server/test-textes-accueil.js`, 4 assertions sur le texte réellement présent dans `docs/index.html` : plus de "6 clubs", présence de "Ligue Régionale", présence de la progression Ligue Nationale/Ligue d'Excellence, présence des compétitions mondiales et de l'Équipe B. Confirmé par `git stash` que les 4 échouent sur l'ancien texte (reproduction avant correctif) et passent sur le nouveau. Vérifié aussi visuellement par capture d'écran Playwright (texte affiché sur 3 lignes, pas de débordement de la carte).

**Occurrences volontairement non touchées** (commentaires de code, jamais affichés au joueur, hors périmètre "textes du parcours utilisateur") : `docs/js/world.js` (exemple illustratif dans un commentaire), `docs/js/club-equipe-b.js`, `server/test-parcours-club.js`, `server/test-parcours-navigateur.js`.

**Tests** : `server/test-textes-accueil.js` 4/4 (nouveau), régression complète sans échec : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-audit-p0-3.js` 8/8, `test-parcours-navigateur.js` 91/91.

**Accueil et boucle principale : audités visuellement (captures d'écran Playwright), déjà corrects, aucun changement nécessaire.**
- Différence Match rapide / Mode Club / reprise de carrière : déjà claire (carte "LE JEU DE GESTION 🏟️ Mode Club" avec description explicite vs carte "MATCH RAPIDE (UN SEUL MATCH, SANS GESTION)" ; une carte "TA SAISON EN COURS" distincte apparaît et remplace "Mode Club" dès qu'une carrière existe, cf. `rafraichirCarteAccueil`).
- Boucle principale : le panneau "Aperçu du prochain match" (déjà existant, P1-6/P1-8) couvre déjà l'essentiel de la demande — adversaire, mention explicite "À domicile"/"À l'extérieur", composition (alerte si problème détecté), tactique (les 6 axes affichés), analyse de l'adversaire. Bouton "New Day" flottant confirmé toujours accessible (`test-parcours-navigateur.js`, test existant). Écran de résultat confirmé clair (badge Victoire/Défaite/Nul, score, essais, possession).
- Blessés/fatigue : déjà couverts par le système d'alertes existant (`genererAlertes`, `docs/js/clubUI.js`) — n'apparaissent que quand ils concernent réellement l'effectif (rien à corriger : pas d'alerte fabriquée pour un effectif frais sans blessure).

**Anti-double-action : bug réel trouvé et corrigé (pas seulement audité).**
- **Reproduction** : double clic RÉEL (deux événements DOM synchrones, sans repeinture entre les deux — technique déjà utilisée par le test "double clic signer" existant) sur le bouton "Lancer le match" de l'aperçu d'avant-match. `lancerLaJournee()` (`docs/js/clubUI.js`) démarre une simulation via l'état global partagé et unique de `docs/js/main.js` (une seule variable `match`/`configMatch` à la fois, pas d'instance par appel) — un second déclenchement pendant que le premier tourne encore fait démarrer une DEUXIÈME simulation qui se dispute cet état partagé avec la première.
- **Symptôme confirmé** (capture d'écran) : le jeu reste bloqué INDÉFINIMENT sur un match Équipe B en arrière-plan ("69:59 / 80:00", progression figée), sans aucune erreur console, sans aucun moyen de continuer sans recharger la page — un vrai bug bloquant, pas cosmétique.
- **Corrigé** par un verrou de ré-entrée (`journeeEnCours`, `docs/js/clubUI.js`) : `lancerLaJournee()` ignore tout déclenchement supplémentaire tant que la journée précédente n'est pas résolue (relâché dans `onResultat`, dès que le résultat du match du joueur est enregistré ; relâché aussi si le calendrier a un nombre impair de clubs — cas normalement impossible — pour ne jamais rester bloqué). Boutons concernés (`btnJouerMatchClub`, `btnApercuMatchFlottant`, `btnApercuLancerMatch`) explicitement désactivés (`disabled`) pendant la simulation, en plus du verrou — répond littéralement à la demande "désactiver le bouton pendant la simulation".
- **Preuve** : reproduit AVANT correctif (capture d'écran du blocage), corrigé, reproduit à nouveau APRÈS correctif — la journée se déroule normalement (7 matchs joués, résultat affiché, aucune erreur). Nouvelle couverture permanente dans `server/test-parcours-navigateur.js` (remplace le clic simple sur "Lancer le match" par un double clic synchrone à cet endroit du parcours — même effet final attendu, donc aucune autre assertion du fichier n'a besoin de changer).
- Tests : `test-parcours-navigateur.js` 92/92 (91 existants + 1 nouveau), régression complète sans échec : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-audit-p0-3.js` 8/8.

**Doubles signatures/renouvellements : vérifiés déjà protégés (aucun correctif nécessaire).** `demanderMontant`/`confirmerAction` (P1-8) utilisent chacune une seule variable de résolution partagée et se ferment dès le premier clic (`if (!modal.classList.contains('visible')) return;`) — vérifié empiriquement (double/triple clic réel, instrumentation du nombre d'appels) sur la négociation de contrat et la libération d'un joueur : exactement 1 appel dans les deux cas. **P1-10 est maintenant complet.**

### P1-16. Analyse de l'adversaire purement informative — aucun lien avec la tactique réellement jouée (2ᵉ tranche `ROADMAP_FOOTBALL_MANAGER.md`)
- **Statut : CORRIGÉ (première tranche)**
- Priorité : P1 (2ᵉ chantier de la roadmap Football Manager, domaines 1 "préparation avant match" + 3 "stratégie selon l'adversaire")
- Fichiers concernés :
  - `docs/js/club-analyse.js` (`recommanderTactique`, `appliquerRecommandationsTactique` — nouveau)
  - `docs/js/clubUI.js` (rendu + application dans l'aperçu du prochain match)
  - `docs/css/style.css`
  - `server/test-parcours-club.js`, `server/test-parcours-navigateur.js` (nouveaux tests)

**Contexte.** `ROADMAP_FOOTBALL_MANAGER.md` (audit initial, 2 agents de recherche) confirme : `analyserAdversaire` (`club-analyse.js:34`) calcule une vraie comparaison d'attributs (mêlée, touche, puissance, vitesse, jeu de main, jeu au pied, discipline) affichée dans l'aperçu du prochain match — mais purement informative. Le joueur doit interpréter seul les écarts et régler les 6 axes tactiques (`AXES_TACTIQUE`, `club.js:389`) à la main, sans aucun lien automatique entre l'un et l'autre.

**Cause.** Aucune fonction ne reliait le résultat de `analyserAdversaire` (déjà réel) aux 6 axes de `AXES_TACTIQUE` — le calcul et le réglage vivaient dans deux mondes complètement séparés.

**Correction (première tranche, périmètre volontairement limité).** `RMClub.recommanderTactique(analyse)` — règle simple et déterministe, jamais deux attributs sur le même axe (pour rester lisible) : un écart marqué (≥ 6, même seuil que l'analyse) sur un attribut de comparaison propose un réglage précis d'UN axe tactique, avec une explication en langage clair :
- **mêlée** → `avants` (proche si on domine, large sinon) ; **touche** → `toucheMaul` (maul si on domine, sol sinon) ; **puissance** → `ligneDef` (haute si on domine, basse sinon) ; **vitesse** → `style` (large si on est plus rapide, sol sinon) ; **jeu au pied** → `pied` (fréquent si le leur est faible, rare si le leur est supérieur) ; **discipline** → `rythme` (rapide s'ils sont indisciplinés).

Une nouvelle carte « 💡 Recommandation tactique » apparaît dans l'aperçu du prochain match (uniquement si au moins un écart dépasse le seuil), avec un bouton « Appliquer les recommandations » qui règle en un clic `saison.clubJoueur.tactique` via `appliquerRecommandationsTactique` — jamais automatique ni obligatoire, le joueur garde entièrement la main et peut ensuite ajuster manuellement comme n'importe quel réglage.

**Explicitement hors périmètre de cette tranche (à faire plus tard) :** recommandations sur les rôles individuels (buteur/lanceur en touche) ; rendre une préparation réellement obligatoire avant certains matchs (aujourd'hui toujours facultatif, cf. domaine 1 de la roadmap) ; historiser si une recommandation a été suivie pour en mesurer l'effet réel sur le résultat.

**Critères de validation.**
- 6 nouveaux tests dans `server/test-parcours-club.js` : chaque sens (en notre faveur / défaveur) de l'écart de mêlée ; aucune recommandation sous le seuil ; couverture des 6 axes à partir des 6 attributs correspondants (avec vraie explication, pas juste axe/option bruts) ; intégration avec une vraie analyse (jamais d'axe/option invalide) ; `appliquerRecommandationsTactique` modifie bien la tactique réelle sans toucher aux axes non concernés. Après correctif : 65/65 (59 existants + 6 nouveaux).
- 3 nouveaux tests dans `server/test-parcours-navigateur.js` : un écart marqué et déterministe (effectif rendu artificiellement plus rapide/fort en mêlée) affiche bien une recommandation actionnable ; cliquer "Appliquer les recommandations" modifie réellement la tactique persistée (pas juste affichée) ; la carte "Ma tactique" reflète immédiatement le changement sans rouvrir l'écran. Après correctif : 109/109 (106 existants + 3 nouveaux), 0 échec (1 échec isolé et non reproductible du test P0-7 sur un premier run, confirmé transitoire par une 2ᵉ exécution propre — cohérent avec la flakiness déjà documentée en P0-12, sans lien avec ce correctif).
- Vérifié visuellement (captures d'écran desktop, 900px) : la carte affiche les explications en langage clair, le clic sur "Appliquer" met bien à jour la carte "Ma tactique" au-dessus avec un toast de confirmation.
- Suite complète sans régression : `test-parcours-club.js` 65/65, `test-parcours-navigateur.js` 109/109, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-textes-accueil.js` 4/4, `test-invariants.js` 12/12, `test-audit-p0-3.js` 8/8.

### P1-17. Le banc de 8 remplaçants n'était jamais transmis au moteur — purement cosmétique (3ᵉ tranche `ROADMAP_FOOTBALL_MANAGER.md`)
- **Statut : CORRIGÉ (première tranche)**
- Priorité : P1 (3ᵉ chantier de la roadmap Football Manager, domaine 3 "tactique, composition et remplacements" — manque le plus criant identifié par l'audit initial)
- Fichiers concernés :
  - `engine/rugby-engine.js` (`config.remplacements`, additif et strictement rétrocompatible)
  - `docs/js/club-composition.js` (`remplacementsVersConfig` — traduit le banc de 8 en plan de remplacement)
  - `docs/js/clubUI.js` (transmission au moteur avant le match, affichage dans l'aperçu du prochain match)
  - `docs/js/constants.js` (icône du nouvel événement REMPLACEMENT)
  - `server/test-invariants.js`, `server/test-parcours-club.js` (nouveaux tests)

**Contexte.** `ROADMAP_FOOTBALL_MANAGER.md` (audit initial) confirmait : un banc de 8 remplaçants était bien choisi dans l'écran Composition (`club-composition.js:completerCompositionBanc`), mais `compositionVersJoueursCfg` ne convertissait QUE les 15 titulaires en config moteur — le banc n'était jamais transmis à `demarrerMatchClub`/`simulerMatchEnArrierePlan`. Un agent de recherche dédié a scoré la façon la moins risquée d'introduire de vrais remplacements sans réécrire le moteur physique (le jeu calcule tout le match en arrière-plan avant que le joueur ne le regarde, cf. `docs/js/main.js` — un remplacement "décision cliquée en direct" est donc incompatible avec l'architecture ; seul un remplacement planifié À L'AVANCE, à une minute fixe, reste compatible).

**Cause.** Aucun mécanisme de remplacement n'existait dans `engine/rugby-engine.js` : les configs joueurs (`joueursA`/`joueursB`) ne sont lues qu'UNE FOIS à la création de chaque joueur, jamais relues en cours de match.

**Correction (première tranche, périmètre volontairement limité).** `config.remplacements` (optionnel, absent par défaut — tous les appels existants inchangés) : `[{equipe, numero, minute, joueur}]`. Dans `tick()`, dès que `tempsMatch` franchit `minute*60`, mutation **en place** des attributs de performance du joueur déjà présent à ce numéro (`Object.assign`, jamais un nouvel objet) — position, ballon porté, liaisons de regroupement en cours restent celles du joueur remplacé, comme un vrai remplaçant qui prend sa place exacte.

**Bug réel trouvé et corrigé pendant l'implémentation (pas seulement audité) :** un premier passage mutait uniquement l'objet joueur EN COURS — mais `_nouvelleManche` (coup d'envoi après essai/pénalité/mi-temps) **recrée entièrement** `equipeA`/`equipeB` depuis `this.cfg.joueursA`/`joueursB`, jamais mutés. Le remplacement était donc effacé dès la reprise de jeu suivante, le titulaire d'origine revenant sans prévenir. Reproduit par 2 tests qui échouaient réellement (identité d'objet + rétrocompatibilité), corrigé en mettant AUSSI à jour `this.cfg.joueursA/B[numero]` au moment du remplacement, pour que toute reprise future régénère bien le remplaçant.

`RMClub.remplacementsVersConfig(effectif, compositionBanc, lettreEquipe)` (`club-composition.js`) traduit le banc en plan concret : une minute fixe par catégorie de poste (avants d'abord, comme un vrai groupe de 23 — 50/54/58/62/65/68/71/75ᵉ minute), le plus petit numéro du groupe pour les catégories à plusieurs titulaires (P, 2L, 3L, CE), même formule fatigue/moral que `compositionVersJoueursCfg` (un remplaçant fatigué apporte réellement moins). Visible AVANT le coup d'envoi (nouvelle carte "🔄 Remplacements prévus" dans l'aperçu du match, filtrée sur la durée réellement choisie) et pendant le match (événement réel dans le fil de commentaire, icône dédiée).

**Explicitement hors périmètre de cette tranche (à faire plus tard) :** un vrai choix du joueur sur QUAND faire entrer chaque remplaçant (aujourd'hui minutes fixes par catégorie) ; des remplacements pour l'IA adverse (ses clubs n'ont pas de banc structuré, cf. domaine 7 de la roadmap) ; des statistiques individuelles correctement réparties entre titulaire et remplaçant (le moteur indexe par numéro de maillot, pas par identité — tout le match reste attribué au titulaire d'origine, limitation documentée).

**Critères de validation.**
- 3 nouveaux tests moteur dans `server/test-invariants.js` : application immédiate ET persistance à travers les reprises de jeu (le test qui a révélé le bug ci-dessus) ; rétrocompatibilité stricte (sans `config.remplacements`, comportement identique bit à bit) ; un remplacement dont l'instant dépasse la durée du match ne s'applique jamais. Après correctif : 15/15 (12 existants + 3 nouveaux).
- 4 nouveaux tests dans `server/test-parcours-club.js` : le banc complet produit un plan pour ses 8 postes (bons numéros/minutes, jamais tous à la même minute) ; un banc incomplet ne planifie que ce qui est réellement possible ; un banc vide ne planifie rien (rétrocompatibilité) ; un remplaçant fatigué/démoralisé apporte réellement moins que sur sa fiche. Après correctif : 69/69 (65 existants + 4 nouveaux).
- Suite navigateur complète sans régression après le correctif du bug de persistance : `test-parcours-navigateur.js` 109/109, 0 échec.
- Vérifié visuellement (capture d'écran desktop) : la carte "Remplacements prévus" affiche les 8 noms réels et leurs minutes avant le coup d'envoi ; vérifié en direct (benchmark) : aucune régression de performance (1,73s vs 1,80s pour un match complet avec 8 remplacements).
- Suite complète sans régression : `test-parcours-club.js` 69/69, `test-parcours-navigateur.js` 109/109, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-textes-accueil.js` 4/4, `test-invariants.js` 15/15, `test-audit-p0-3.js` 8/8.

### P1-18. Écrans Composition/Tactique différents et incomplets selon l'équipe (premier XV vs Équipe B vs Espoirs) — 4ᵉ tranche `ROADMAP_FOOTBALL_MANAGER.md`
- **Statut : CORRIGÉ (première tranche)**
- Priorité : P1 (demande explicite de l'utilisateur : « la gestion, que ce soit l'équipe première, l'équipe B ou l'équipe de jeunes, [doit être] gérée par les mêmes écrans, plus de différence [...] on choisit l'équipe à gérer par menu »)
- Fichiers concernés :
  - `docs/js/club-composition.js` (`assurerCompositionsSecondaires`, `effectifPourEquipe`, `slotCompositionPourEquipe`, `assurerCompositionPourEquipe` — nouveau)
  - `docs/js/clubUI.js` (sélecteur d'équipe gérée, généralisation de `rafraichirTerrain`/`rafraichirBanc`/`rafraichirEncadrement`/`rafraichirTactique` et de leurs handlers, `construireTactiqueCfg` factorisé, wiring des matchs Équipe B/Espoirs)
  - `docs/js/main.js` (`simulerMatchEnArrierePlan` accepte désormais une tactique par match ; nettoyage anti-contamination entre matchs successifs de la même journée)
  - `docs/index.html` (sélecteur `#selEquipeGereeComposition`/`#selEquipeGereeTactique`)
  - `server/test-parcours-club.js`, `server/test-parcours-navigateur.js` (nouveaux tests)

**Contexte.** Avant cette tranche, trois systèmes de gestion d'équipe totalement distincts coexistaient : le premier XV (onglets Effectif/Composition/Tactique complets), l'Équipe B (composition **auto-générée non modifiable**, aucune tactique propre) et les Espoirs (aucun écran de composition/tactique du tout — juste une liste "Centre de formation"). L'utilisateur a demandé explicitement l'unification : mêmes écrans pour les 3, un simple sélecteur pour choisir l'équipe à gérer.

**Cause.** `saison.clubJoueur.compositionTitulaires`/`compositionBanc`/`tactique`/`capitaineId`/`buteurId`/`lanceurToucheId` étaient des champs UNIQUES sur `clubJoueur`, implicitement réservés au premier XV — aucune structure équivalente n'existait pour l'Équipe B ou les Espoirs, et `simulerRondeEquipeB`/`simulerMatchEspoirs` recalculaient systématiquement `meilleureComposition(...)` à chaque journée sans jamais lire un choix du joueur.

**Correction (première tranche, périmètre volontairement limité).** Plutôt que de renommer les champs historiques du premier XV (risque élevé, des dizaines de points d'usage), une extension strictement additive : `saison.clubJoueur.compositionsSecondaires = { b: {...}, jeunes: {...} }`, chaque slot ayant **exactement la même forme** que `clubJoueur` (`compositionTitulaires`/`compositionBanc`/`tactique`/`capitaineId`/`buteurId`/`lanceurToucheId`) — ce qui permet à TOUTE la logique de rendu/édition déjà écrite pour le premier XV (`rafraichirTerrain`, `rafraichirBanc`, `rafraichirEncadrement`, `rafraichirTactique`, leurs handlers) de fonctionner à l'identique sur les 3 équipes, simplement en résolvant le bon "contexte" (`RMClub.effectifPourEquipe`/`slotCompositionPourEquipe` selon `saison.clubJoueur.equipeGeree`). Un sélecteur partagé (« Équipe gérée » : Première équipe / Équipe B / Espoirs) apparaît en tête des onglets Composition et Tactique, synchronisé entre les deux.

`simulerRondeEquipeB`/`simulerMatchEspoirs` lisent désormais `RMClub.assurerCompositionPourEquipe(saison, 'b'|'jeunes')` (auto-complète les trous sans écraser un choix déjà fait) au lieu de toujours recalculer `meilleureComposition`. Un nouvel helper `construireTactiqueCfg` (factorisé, utilisé identiquement pour les 3 équipes) construit la config moteur complète (tactique + capitaine/buteur/lanceur + remplacements planifiés, cf. P0/P1-17) — l'Équipe B et les Espoirs bénéficient donc AUSSI, pour la première fois, d'une vraie tactique et de vrais remplacements en match, pas seulement le premier XV.

**Bug réel trouvé et corrigé en cours de route (pas seulement audité).** `configMatch` (état module partagé entre les matchs successifs d'une même journée dans `main.js`) accumulait les réglages tactiques par équipe (`attaqueA`/`buteurB`/...) sans jamais les effacer entre deux appels — un match d'Équipe B ou d'Espoirs simulé juste après un match du premier XV pouvait donc hériter d'un réglage laissé par CE match précédent (ex. un buteur désigné par numéro qui n'a aucun sens dans l'autre composition). Corrigé en réinitialisant systématiquement les clés tactiques par équipe avant chaque nouvelle simulation en arrière-plan (`simulerMatchEnArrierePlan`) ET avant chaque nouveau match du premier XV (`demarrerMatchClub`, qui alterne domicile/extérieur donc de lettre A/B d'un match à l'autre).

**Explicitement hors périmètre de cette tranche (à faire plus tard) :** l'onglet Effectif (liste des joueurs + fiche joueur) reste séparé du Centre de formation — pas encore piloté par le même sélecteur d'équipe gérée.

**Critères de validation.**
- 5 nouveaux tests dans `server/test-parcours-club.js` : `equipeGeree` vaut "pro" par défaut et le slot du premier XV EST `clubJoueur` (zéro duplication) ; `effectifPourEquipe` retourne la bonne source par équipe ; gérer les Espoirs ne touche JAMAIS au slot du premier XV ; un choix manuel dans le slot Équipe B persiste à un nouvel appel et reste indépendant du slot Espoirs ; tactique/remplacements fonctionnent identiquement sur le slot Équipe B et celui du premier XV. Après correctif : 74/74 (69 existants + 5 nouveaux).
- 2 nouveaux tests dans `server/test-parcours-navigateur.js` : choisir un joueur dans le terrain Composition (équipe Espoirs) persiste bien dans le slot dédié ; le choix manuel est RÉELLEMENT celui utilisé au coup d'envoi du match Espoirs (vérifié en injectant un 2ᵉ candidat à un poste et en confirmant que c'est bien LUI, pas l'auto-sélection, qui reçoit le temps de jeu réel). Un premier passage de ce test a révélé un vrai bug DANS LE TEST (navigation manquante vers le Dashboard avant de lancer la journée) puis une fausse alerte instructive (l'« autre » joueur du poste dupliqué recevait aussi du temps de jeu — via l'Équipe B, qui pioche légitimement dans le même vivier Espoirs, sans rapport avec ce correctif). Après correctif : 111/111 (109 existants + 2 nouveaux), 0 échec.
- Vérifié visuellement (captures d'écran desktop) : le sélecteur d'équipe gérée fonctionne dans les 2 onglets, la composition/tactique Espoirs affiche bien un effectif et des noms différents du premier XV via les MÊMES composants d'écran, et reste totalement isolée (aucune fuite entre les 3 équipes, vérifié via l'état de sauvegarde).
- Suite complète sans régression : `test-parcours-club.js` 74/74, `test-parcours-navigateur.js` 111/111, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-textes-accueil.js` 4/4, `test-invariants.js` 15/15, `test-audit-p0-3.js` 8/8.

**Addendum (cohérence de la carte Équipe B).** En relisant P1-18 juste après l'avoir livré, la carte de composition de l'onglet Équipe B (`rafraichirEquipeB`) recalculait encore `RMClub.meilleureComposition(vivierB)` à la volée à chaque affichage — au lieu de lire le slot `compositionsSecondaires.b` réellement utilisé par `simulerRondeEquipeB` depuis cette même tranche. Un joueur qui personnalisait manuellement la composition de son Équipe B via le nouvel onglet Composition voyait donc un décalage : la carte Équipe B affichait toujours la "meilleure équipe" auto-calculée, différente de ce qui se jouait réellement. Corrigé en lisant `RMClub.assurerCompositionPourEquipe(saison, 'b').compositionTitulaires` (même slot, même fonction que le match) ; ajout d'un lien « Modifier cette composition » qui bascule directement sur l'onglet Composition avec l'Équipe B déjà sélectionnée. 3 nouveaux tests dans `server/test-parcours-navigateur.js` (lien présent et fonctionnel, un choix manuel se reflète bien dans la carte Équipe B sans composition parallèle). Suite navigateur complète : 114/114, 0 échec (1 échec isolé et non reproductible du test P0-7 sur un premier run, confirmé transitoire par une 2ᵉ exécution propre — cohérent avec la flakiness déjà documentée en P0-12, sans lien avec ce correctif).

---

## P2 — Maintenabilité et simulation

### P1-19. Écrans de gestion d'équipe dupliqués par type d'équipe (premier XV / Équipe B / Espoirs / clubs adverses) — 5ᵉ tranche `ROADMAP_FOOTBALL_MANAGER.md`
- **Statut : CORRIGÉ**
- Priorité : P1 (demande explicite de l'utilisateur : « Refactorise toute la gestion des équipes autour d'écrans uniques et réutilisables. [...] l'équipe première, l'équipe B, les jeunes et les équipes adverses ne doivent surtout pas avoir des pages séparées ou des interfaces différentes. [...] un seul écran et un seul composant par fonctionnalité. »)
- Fichiers concernés :
  - `docs/js/club-equipes.js` (**nouveau**) — le contexte d'équipe : source unique de vérité consommée par tous les écrans
  - `docs/js/clubUI.js` — les 6 écrans réécrits pour lire ce contexte ; suppression des rendus dupliqués
  - `docs/index.html` — sélecteur unique + emplacements ; suppression de l'onglet Équipe B et des blocs dupliqués
  - `docs/css/style.css` — styles du sélecteur commun, des états lecture seule et des notes « non connu »
  - `server/test-parcours-club.js`, `server/test-parcours-navigateur.js`

**Le problème.** La tranche P1-18 avait déjà unifié Composition/Tactique pour les 3 équipes du club. Il restait quatre présentations concurrentes pour les mêmes informations :
- l'**effectif** : table riche pour le premier XV, carte « Centre de formation » séparée pour les espoirs, table réduite recopiée dans l'onglet Autres clubs pour un adversaire — et **deux fiches joueur distinctes** (`#clubJoueurDetail` et `#clubJoueurAdversaireDetail`), avec deux rendus d'attributs à maintenir en parallèle ;
- le **calendrier et le classement** : un onglet pour le championnat principal, un onglet `equipeb` avec SON classement et SON calendrier, rien du tout pour les espoirs ;
- l'**entraînement** et le **personnel** : implicitement liés au premier XV, aucun moyen de les consulter pour une autre équipe ;
- deux `<select>` « Équipe gérée » recopiés (Composition + Tactique) qu'il fallait resynchroniser à la main à chaque rendu.

**La correction.** Un seul objet **contexte d'équipe** (`RMClub.contexteEquipe`) décrit l'équipe affichée quel que soit son type (`'pro' | 'b' | 'jeunes' | 'adverse'`) et expose **toujours la même forme** : `effectif`, `slot` (composition/banc/tactique/encadrement), `calendrier`, `classement`, `personnel`, `entrainementFocus`, `modifiable`. Les 6 écrans lisent ce contexte et **rien d'autre** — il n'y a plus une seule branche « si c'est l'Équipe B alors… » dans le corps d'un écran.
- Le sélecteur est un **unique nœud DOM** (`#selecteurEquipe`), *déplacé* par `basculerOnglet` dans l'emplacement de l'onglet actif plutôt que dupliqué par écran. C'est ce qui rend la conservation de l'équipe d'un écran à l'autre structurelle : il n'existe aucun autre état à resynchroniser.
- Une équipe non dirigée passe par les **mêmes** écrans en lecture seule : mêmes `<select>` de terrain, simplement `disabled`. La composition affichée est son XV réel (`RMClub.slotAdverse`), sa tactique est **déduite de ses attributs réels** sur les mêmes 6 axes (`RMClub.deduireTactiqueAdverse`) et signalée comme déduite.
- **Honnêteté maintenue (CLAUDE.md, rôle 6)** : ce qui n'est pas simulé pour un club IA (son banc, son staff, son programme d'entraînement) est affiché comme **non connu**, jamais fabriqué.

**Doublons réellement supprimés** (pas seulement « factorisés ») :
- l'onglet `equipeb` entier (bouton de navigation + volet + 4 cartes) ;
- `#clubEquipeBStatut` / `#clubEquipeBComposition` / `#clubEquipeBClassement` / `#clubEquipeBCalendrier` et leur fonction de rendu `rafraichirEquipeB` (~70 lignes) ;
- la table d'effectif adverse `#clubAutresClubEffectif` et la **seconde fiche joueur** `#clubJoueurAdversaireDetail` + `ouvrirFicheJoueurAdversaire`/`fermerFicheJoueurAdversaire` (~40 lignes) ;
- la carte « Centre de formation » `#clubCentreFormation` et `rafraichirCentreFormation` (la promotion d'un espoir vit désormais dans la fiche joueur commune) ;
- les deux `<select>` « Équipe gérée » et `changerEquipeGeree`.

**Amélioration de fond trouvée en chemin.** Les résultats des matchs espoirs n'étaient archivés nulle part (uniquement un message de boîte de réception) : impossible d'en tirer un calendrier ou un bilan. Ils sont maintenant enregistrés (`RMClub.enregistrerMatchEspoirs`) et alimentent réellement l'écran Calendrier & classement — score produit par le moteur, jamais fabriqué.

**Bug trouvé et corrigé pendant le développement.** Changer d'équipe avec une fiche joueur ouverte laissait affichée la fiche d'un joueur de l'équipe PRÉCÉDENTE (et masquait la nouvelle table d'effectif, `#clubEffectif` restant en `display:none`). `changerEquipe` referme désormais la fiche et vide la sélection de comparaison, comme le fait déjà `basculerOnglet`.

**Critères de validation.**
- `server/test-parcours-club.js` : 82/82 — dont 8 nouveaux tests dédiés (forme identique du contexte pour les 4 types, droits de modification, XV adverse complet et ids dérivés stables sans mutation des données de saison, tactique déduite réellement dépendante des attributs, calendrier/classement par équipe, bilan espoirs issu de matchs réels, persistance/rétrocompatibilité de la sélection, contenu du sélecteur).
- `server/test-parcours-navigateur.js` : parcours réel des **4 types d'équipe × 6 écrans** (24 combinaisons), vérifiant que ce sont bien les **mêmes nœuds DOM** qui portent le contenu, qu'il n'existe **qu'un seul** sélecteur dans la page, que chaque écran a un contenu réel pour chaque équipe, que la lecture seule est respectée, que l'équipe est conservée d'un écran à l'autre et après un F5, et que **forcer** un clic sur la tactique d'un club adverse ne modifie rien dans la sauvegarde.

### P1-20. On choisissait un club dans une liste au lieu de cliquer son nom — 6ᵉ tranche `ROADMAP_FOOTBALL_MANAGER.md`
- **Statut : CORRIGÉ**
- Priorité : P1 (demande explicite de l'utilisateur : « Il ne doit exister aucune liste, aucun menu déroulant et aucun sélecteur permettant de choisir un club à consulter. [...] On ne choisit pas un club dans une liste. On ouvre un club en cliquant sur son nom là où il apparaît dans le jeu. »)
- Fichiers concernés : `docs/js/club-equipes.js`, `docs/js/clubUI.js`, `docs/index.html`, `docs/css/style.css`, `server/test-parcours-club.js`, `server/test-parcours-navigateur.js`

**Le problème.** La tranche P1-19 avait bien unifié les écrans, mais elle avait mélangé deux questions dans un seul contrôle : le sélecteur listait à la fois les équipes du joueur ET tous les clubs de la division (valeurs `adverse:<clubId>`). Conséquences : on « choisissait » un club dans un menu déroulant au lieu de cliquer son nom là où il s'affichait déjà ; les noms de clubs partout ailleurs (calendrier, classement, résultats, prochain match, analyse d'adversaire) restaient du texte mort ; et le menu proposait à un club adverse des écrans de gestion (Tactique, Entraînement, Médical…) qui n'ont aucun sens pour lui.

**La correction — deux états strictement séparés.** `saison.clubJoueur.navigationClub` porte désormais :
```
{ clubJoueurId, clubConsulteId, equipeConsultee, clubPrecedentId, equipePrecedente, ongletPrecedent }
```
- `clubConsulteId` répond à « **quel club ?** » — changé UNIQUEMENT par `ouvrirClub(clubId)`, jamais par un menu ;
- `equipeConsultee` répond à « **quelle équipe DE ce club ?** » — `'pro' | 'b' | 'jeunes'`, et rien d'autre. La forme `'adverse:<clubId>'` n'existe plus : le club n'est jamais encodé dans la valeur du sélecteur.

**Deux fonctions centrales, aucune logique dupliquée par écran :**
- `ouvrirClub(clubId)` — mémorise le club/l'équipe/l'écran courants, bascule sur le club cliqué, sélectionne son équipe première, ouvre l'écran Composition, met à jour l'entête et adapte le menu. **Tous** les noms de clubs du jeu appellent cette seule fonction, via **une seule délégation d'événements** posée sur `#clubGestion` (`.lienClub`).
- `retourMonClub()` — restaure le club du joueur, l'équipe sur laquelle il travaillait et l'écran d'où il venait.

**Noms de clubs rendus cliquables** (composant unique `lienClub()`) : calendrier, classement, mini-classement du tableau de bord, prochaine journée, derniers résultats, analyse du prochain adversaire, liste des autres clubs, barre du haut, fiche joueur, confrontations directes. Les clubs des autres paliers de la pyramide et du monde restent volontairement non cliquables : ils n'ont pas d'effectif simulé, et rien n'est fabriqué pour faire semblant.

**Menu adapté au club affiché.** Pour un club consulté, les écrans de gestion (Tactique, Entraînement, Médical, Recrutement, Transferts, Finances, Bilan) sont **absents** du menu, pas grisés. `basculerOnglet` refuse en plus d'ouvrir un écran interdit atteint par un autre chemin — la garantie ne repose donc pas seulement sur l'affichage du menu.

**Entête d'identité permanent (haut à gauche).** Nom du club affiché + « Mon club » (avec son palier) ou « Club consulté » + bouton « ← Retour à mon club », visible uniquement dans ce second cas. Les repères de la barre du haut (prochain match, classement, budget) suivent eux aussi le club affiché — le budget d'un club consulté est explicitement marqué « (estimé) ».

**Écran supprimé (doublon).** La carte de détail d'un club dans l'onglet « Autres clubs » disparaît : sa vue d'ensemble (identité, forme, tactique déduite, comparaison d'effectif, confrontations) devient l'onglet « Vue d'ensemble » du club ouvert, et les cartes de gestion du tableau de bord sont masquées à sa place. « Autres clubs » n'est plus qu'une liste de noms cliquables.

**Critères de validation.**
- `server/test-parcours-club.js` : 87/87 — dont 6 nouveaux tests de navigation (le sélecteur ne contient aucun nom de club ni valeur encodant un club ; un club consulté n'expose que les équipes réellement présentes dans ses données et refuse une équipe qu'il n'a pas ; ouvrir un club mémorise l'origine et sélectionne l'équipe première ; le retour restaure club + équipe + écran ; enchaîner deux clubs ne fait pas perdre le chemin du retour ; les écrans de gestion sont absents — pas grisés — du menu d'un club consulté ; persistance et rétrocompatibilité).
- `server/test-parcours-navigateur.js` : parcours réel exigé — inventaire de TOUS les `<select>` du Mode Club pour prouver qu'aucun ne contient de nom de club, présence de noms cliquables sur chaque écran concerné, clic → ouverture immédiate sur la Composition de l'équipe première, entête et bouton de retour, menu filtré, tentative forcée d'ouvrir un écran interdit, retour restaurant équipe ET écran, et vérification que les écrans Effectif/Composition sont bien les mêmes nœuds DOM dans les deux cas.

### P1-21. La carrière avançait « une journée par clic », sans aucune date — tranche 1 de la carrière calendaire
- **Statut : CORRIGÉ (tranche 1/4)**
- Priorité : P1 (demande explicite de l'utilisateur : « remplacer la progression "un clic = une journée de championnat et un match" par une véritable carrière calendaire quotidienne, inspirée de Football Manager »)
- Fichiers concernés : `docs/js/club-temps.js` (**nouveau**), `docs/js/club-agenda.js` (**nouveau**), `docs/js/club.js`, `docs/js/club-sauvegarde.js`, `docs/js/clubUI.js`, `docs/index.html`, `docs/css/style.css`, `server/test-parcours-club.js`, `server/test-parcours-navigateur.js`

**Le problème.** L'unité de temps du jeu était la « journée » de championnat : un simple entier de ronde. Un clic sur « Aperçu & jouer la journée » résolvait d'un coup le monde, les 2 autres paliers français, le match espoirs, TOUTE la ronde d'Équipe B et le match du premier XV. Aucune date nulle part, aucune notion de calendrier, et le monde n'avançait que si son onglet avait été ouvert au moins une fois.

**La correction (tranche 1).**
- **Date civile réelle et persistée** : `saison.temps = {annee, mois, jour, saisonNumero}`. L'arithmétique est **pure** (algorithme `days_from_civil` de Howard Hinnant) — aucun objet `Date`, donc aucun fuseau horaire, aucun « aujourd'hui » implicite, et une testabilité complète hors navigateur. Années bissextiles et règle des siècles comprises.
- **Calendrier daté** : chaque rencontre porte une vraie date. Les trois équipes du club jouent des jours **distincts de la même semaine** — espoirs le **mercredi**, première équipe le **samedi**, Équipe B le **dimanche** — dérivés d'un décalage constant, donc jamais stockés deux fois ni désynchronisables.
- **`journee` est conservé tel quel.** Finances, périodicité des matchs espoirs, historique et messages en dépendent : la date est une couche **additive**, exactement comme les six tranches précédentes.
- **Bouton « Continuer »** : un clic avance la date jusqu'à la prochaine échéance et **jamais au-delà** — aucun match ne peut être simulé avant sa date. Le libellé annonce l'échéance (« Continuer jusqu'au samedi 7 septembre 2024 ») et devient « Match de championnat — c'est aujourd'hui » une fois arrivé. `prochainArret` inclut le jour courant, ce qui rend le bouton **idempotent** : recliquer un jour de match rouvre sa préparation au lieu de le sauter.
- **Déterminisme sans `Math.random`** : `saison.graine` + `grainePourJour(graine, date, canal)` — même graine et même date donnent le même résultat, en O(1), y compris après un rechargement, sans compteur de tirages à persister. Des canaux séparés évitent que le monde, les paliers et les matchs consomment la même suite.
- **Le monde n'attend plus l'ouverture de son écran** (limite connue de longue date) : il est créé et avancé par la résolution du jour de championnat, au même rythme qu'avant.

**Ce qui n'a PAS changé** (compatibilité exigée) : le moteur de match, les compositions et tactiques, la navigation unifiée entre première/B/jeunes/adversaires, et l'écran de préparation d'avant-match. Aucune fonctionnalité supprimée.

**Migration.** `VERSION_SAUVEGARDE` passe de 2 à 3 et le registre `MIGRATIONS` — resté vide depuis la création du jeu — reçoit sa **première vraie migration**. Une sauvegarde v2 n'a ni date, ni graine, ni dates de rencontres : tout est reconstitué à partir de ce qu'elle contient déjà (numéro de saison → année sportive, journées jouées → point de reprise). La graine est dérivée de données **stables** (id et nom du club), pas d'un tirage : deux chargements de la même sauvegarde donnent la même graine. Classement, effectif, finances et résultats ne sont jamais touchés.

**Critères de validation.**
- `server/test-parcours-club.js` : 95/95 — dont 8 nouveaux tests (arithmétique de dates sur les cas limites — bissextiles, 1900, 2000, passages d'année ; jours de la semaine réels vérifiables sur un calendrier ; dates sur toutes les rencontres et jours distincts pour les 3 équipes ; reproductibilité à graine égale ; arrêt exact sur la prochaine rencontre, jamais avant ni après ; contenu réel d'une date donnée ; passage à l'année civile suivante ; **migration v2 → v3 sans aucune perte**, avec vérification que l'entrelacement mercredi/samedi/dimanche reprend correctement).
- `server/test-parcours-navigateur.js` : parcours réel — date persistée et affichée, rencontres datées, libellé du bouton, **aucun match joué avant sa date**, **double clic sur « Continuer » sans double progression**, **date conservée après F5**, exactement la journée du jour jouée à sa date, monde et paliers qui avancent sans ouverture d'écran, synchronisation des 3 équipes, plus un parcours **mobile** dédié (date lisible, bouton flottant entièrement dans l'écran, aucun débordement horizontal, « Continuer » utilisable au doigt).

**Tranches suivantes (non commencées).** 2 : événements quotidiens, agenda du tableau de bord, récupération/fatigue/blessures au jour le jour. 3 : semaine d'entraînement, rapports de scouts différés, décisions et contrats datés. 4 : préparation complète de la rencontre, fenêtres de transfert, événements de direction et de vestiaire.

### P1-22. Les jours traversés ne produisaient rien — tranche 2 de la carrière calendaire
- **Statut : CORRIGÉ (tranche 2/4)**
- Priorité : P1 (suite du découpage imposé par l'utilisateur : « Tranche 2 : événements quotidiens ; agenda du dashboard ; récupération, fatigue et blessures quotidiennes. »)
- Fichiers concernés : `docs/js/club-evenements.js` (**nouveau**), `docs/js/club-condition-joueurs.js`, `docs/js/club-prets.js`, `docs/js/club.js`, `docs/js/club-sauvegarde.js`, `docs/js/clubUI.js`, `docs/index.html`, `docs/css/style.css`, tests

**Le problème.** La tranche 1 avait donné une date au jeu, mais « Continuer » **sautait** d'une échéance à l'autre : les 21 jours d'intersaison, comme les 6 jours entre deux matchs, ne produisaient strictement rien. Toute la condition physique restait indexée sur le match.

**Un vrai défaut de fond mis au jour au passage.** `appliquerFatigue` ne faisait récupérer QUE les joueurs non alignés. Un titulaire permanent ne récupérait donc **jamais** : il gagnait 32 points de fatigue par match et atteignait 100 en quatre journées, puis y restait toute la saison — ce qui pénalisait en permanence ses stats effectives transmises au moteur. La récupération quotidienne corrige ça sans réglage arbitraire : ~5 points par jour, soit ~30 sur les six jours d'une semaine sans match, contre ~32 encaissés le jour du match. Une semaine type redevient donc à peu près neutre, et un joueur mis au repos redevient réellement frais en quelques jours.

**La correction.**
- **`club-evenements.js`** : `resoudreJourneeQuotidienne(saison, date, rng)` applique, pour une journée donnée, la récupération de fatigue, la guérison des blessures et la progression des prêts — sur l'effectif pro **et** sur le centre de formation. `avancerJusquA(saison, dateCible)` enchaîne les journées une par une, bornée par un garde-fou, et ne recule jamais.
- **Séparation nette des cadences** : `club-condition-joueurs.js` ne garde que ce qui appartient au **jour de match** (charge de fatigue des titulaires, tirage de nouvelles blessures) ; récupération et guérison sont devenues quotidiennes.
- **Durées en jours** : `blessureJournees` et la durée des prêts comptaient des « journées de championnat ». Elles comptent maintenant des **jours** — c'est la seule unité cohérente avec un temps qui s'écoule au jour le jour. Les libellés suivent (« Retour dans 9 jour(s) — mar. 17 sept. », « Prêter ce joueur (3 semaines) »).
- **Agenda des 7 prochains jours** sur le tableau de bord, dérivé du calendrier réel — un jour sans rencontre est affiché comme tel plutôt que meublé.
- **Aucune carte décorative** : `resoudreJourneeQuotidienne` ne renvoie que ce qui a **réellement** changé, et l'UI n'affiche rien d'autre. Un effectif déjà frais, sans blessé ni prêt, produit zéro événement.
- **Événements réels dans la boîte de réception** : retour de blessure et fin de prêt — deux changements de disponibilité que le manager doit connaître, adossés à une modification vérifiable de la sauvegarde.
- **Déterminisme** : chaque journée tire son rng de `grainePourJour(graine, date, canal)`. Rejouer la même séquence depuis le même état donne exactement les mêmes journées.

**Migration.** `VERSION_SAUVEGARDE` 3 → 4. Une journée valant une semaine, les compteurs sont multipliés par 7 : une indisponibilité en cours garde **exactement la même durée réelle**, ni allongée ni raccourcie. Le centre de formation est migré comme l'effectif pro.

**Critères de validation.**
- `server/test-parcours-club.js` : 103/103 — dont 8 nouveaux tests (le repos réduit réellement la fatigue ; un effectif frais ne produit aucun effet fantôme ; **un titulaire permanent ne sature plus** — une semaine type reste proche de l'équilibre ; guérison jour après jour avec message au seul jour du rétablissement ; espoirs traités comme l'effectif pro ; prêts en jours ; `avancerJusquA` parcourt exactement les jours voulus, reste déterministe et ne recule jamais ; le résumé ne rapporte que des changements réels ; **migration v3 → v4** conservant les durées).
- `server/test-parcours-navigateur.js` : agenda de 7 jours consécutifs distincts, indisponibilité exprimée en jours avec date de retour réelle, baisse effective de la fatigue sur les jours traversés, blessure résorbée **sans qu'aucun match ait été joué**, messages réels de retour de blessure et de fin de prêt.

**Tranches suivantes.** 3 : semaine d'entraînement, rapports de scouts différés, décisions et contrats datés. 4 : préparation complète de la rencontre, fenêtres de transfert, événements de direction et de vestiaire.

### P1-23. Semaine d'entraînement, scouting différé et décisions datées — tranche 3 de la carrière calendaire
- **Statut : CORRIGÉ (tranche 3/4)**
- Priorité : P1 (découpage imposé par l'utilisateur : « Tranche 3 : semaine d'entraînement ; rapports de scouts différés ; décisions et contrats datés. »)
- Fichiers concernés : `docs/js/club-semaine-entrainement.js` (**nouveau**), `docs/js/club-evenements.js`, `docs/js/club-transferts.js`, `docs/js/club-decisions.js`, `docs/js/clubUI.js`, `docs/index.html`, `docs/css/style.css`, tests

**Le problème.** Un unique « programme collectif » s'appliquait une fois par match, à tout l'effectif, **de la même façon** : un joueur de 19 ans très en dessous de son potentiel progressait exactement comme un cadre de 30 ans, frais ou épuisé. Le scouting était instantané (cliquer = tout savoir sur-le-champ). Et une demande de temps de jeu pouvait rester ouverte indéfiniment sans aucune conséquence : ne rien décider était strictement gratuit.

**Semaine d'entraînement.** Huit activités (repos, récupération, physique, mêlée, touche, défense, attaque, jeu au pied), une par jour, appliquées à **chaque journée écoulée**. Chacune porte deux effets réels et opposés : une `intensite` (charge de fatigue) et un multiplicateur de `recuperation`. Il n'existe donc pas de semaine optimale universelle — c'est un arbitrage, qui dépend du calendrier et de l'état de l'effectif. Un jour de match du premier XV **n'a pas de séance** : le match EST la charge du jour (y ajouter un entraînement compterait deux fois).

**Progression réellement différenciée** — cinq facteurs se combinent, au lieu d'un tirage uniforme :
- l'**âge** (plus rien après 32 ans, ×1,5 avant 21) ;
- la **marge jusqu'au potentiel** (aucune progression au plafond) ;
- la **fatigue du jour** (×0,25 au-delà de 80 : un joueur cuit ne retient rien) ;
- le **temps de jeu réel** (`matchsJoues`) ;
- la qualité de l'**entraîneur** (personnel).
Un blessé ne s'entraîne pas et n'encaisse pas la charge ; un joueur qui veut partir ne se donne plus ; une séance ne développe que les postes concernés — mais **tout le monde encaisse la charge** (un ailier court aussi pendant la séance de mêlée). Le programme individuel d'un joueur remplace la séance du jour, sauf les jours de repos.

**Scouting différé.** `commanderRapportScouting` engage le budget immédiatement (le déplacement est payé) mais la connaissance n'augmente qu'à la **remise du rapport**, quelques jours plus tard — un bon recruteur va plus vite et coûte moins cher. Le marché signale les rapports en cours avec leur date de remise, et un second rapport sur le même joueur est refusé sans double débit.

**Décisions datées.** Une demande de temps de jeu porte désormais une `dateLimite` affichée dans la boîte de réception. Passée l'échéance, le silence **vaut refus** — et emprunte exactement le même chemin que le refus explicite (`resoudreDecisionMessage(..., 'ignorer')`), donc aucune règle parallèle ne peut diverger. Ne rien décider a maintenant un coût réel.

**Portée volontairement limitée sur les contrats.** Les *décisions* sont datées ; la **négociation** de contrat, elle, reste synchrone. La rendre asynchrone (proposer un salaire, attendre plusieurs jours la réponse du joueur) touche le flux de fenêtres modales existant et mérite d'être traitée avec les autres échanges de vestiaire — c'est renvoyé à la tranche 4, explicitement, plutôt qu'à moitié fait ici.

**Critères de validation.**
- `server/test-parcours-club.js` : 113/113 — dont 10 nouveaux tests (sept jours porteurs d'une activité connue, refus d'une activité inconnue, reprise de l'ancien programme collectif ; pas de séance un jour de match ; **une semaine intense fatigue réellement, une semaine de repos non** ; progression différenciée vérifiée facteur par facteur ET sur des cas concrets — 34 ans, joueur au plafond, joueur qui veut partir, blessé ; restriction par poste avec charge quand même encaissée ; programme individuel ; **rapport de scouting qui n'arrive qu'à sa date**, refus du double débit, recruteur plus rapide ; **décision expirée traitée comme un refus**, décision déjà tranchée jamais réécrite).
- `server/test-parcours-navigateur.js` : semaine de 7 jours distincts avec le jour courant mis en évidence, modification persistée, arbitrage fatigue vérifié dans le navigateur, commande de rapport qui débite sans révéler, remise à la date avec message réel, échéance de décision affichée puis expiration avec perte de moral réelle.

### P1-24. Préparation de match, fenêtres de transfert, direction et vestiaire — tranche 4 (dernière) de la carrière calendaire
- **Statut : CORRIGÉ (tranche 4/4 — le découpage demandé est complet)**
- Priorité : P1 (découpage imposé par l'utilisateur : « Tranche 4 : préparation complète de la rencontre ; fenêtres de transfert ; événements de direction et de vestiaire. »)
- Fichiers concernés : `docs/js/club-jour-match.js` (**nouveau**), `docs/js/club-direction.js` (**nouveau**), `docs/js/club-transferts.js`, `docs/js/club-contrats.js`, `docs/js/club-decisions.js`, `docs/js/club-evenements.js`, `docs/js/clubUI.js`, `docs/index.html`, `docs/css/style.css`, tests

**Préparation progressive de la rencontre.** Cinq points dérivés de l'état RÉEL de la saison — analyse de l'adversaire, composition, tactique, coups de pied arrêtés et rôles, banc et remplacements — avec un pourcentage de préparation et un statut par point (`ok` / `attention` / `nonPrepare`). Deux règles :
- **L'analyse demande du temps** : le rapport de l'analyste n'est pas disponible dès que la rencontre apparaît au calendrier ; il faut quelques jours d'observation, moins avec un bon analyste vidéo. Et on annonce **dans combien de jours** il sera prêt, jamais un simple « indisponible ».
- **Aucun blocage artificiel** : un point non préparé est signalé, jamais empêchant. Aucun point ne porte de champ « bloquant » — c'est vérifié par un test. La seule impossibilité qui subsiste (aucun joueur disponible à un poste) est une vraie impasse de données, pas une règle inventée.
Chaque point est cliquable et ouvre l'écran où le régler.

**Fenêtres de transfert.** Deux périodes **dérivées du calendrier réel** (pas de dates en dur) : mercato d'été de l'intersaison à la 4ᵉ journée, mercato d'hiver de quatre semaines autour de la mi-championnat. Hors fenêtre, `signerJoueur` refuse avec un motif explicite et **rien n'est débité** ; l'interface annonce la date de réouverture au lieu de griser un bouton sans explication. Le **repérage reste ouvert toute l'année** : observer un joueur n'est pas le recruter.

**Négociation de contrat asynchrone** (renvoyée ici depuis la tranche 3, comme annoncé). Proposer un salaire ouvre une négociation ; le joueur consulte son agent et répond quelques jours plus tard. Le contrat ne bouge **pas** au moment de la proposition, et la fiche joueur affiche la date de réponse attendue au lieu de reproposer. La décision elle-même passe par `negocierRenouvellement`, inchangé : mêmes exigences, mêmes effets sur le moral, même message — **seul le moment change**, donc aucune seconde règle ne peut diverger.

**Direction.** Un **point d'étape** à deux fractions du championnat (34 % et 67 % des journées jouées) : le président compare la position RÉELLE à l'objectif et ajuste sa confiance, à la hausse comme à la baisse. La comparaison réutilise `evaluerObjectifSaison` — la même règle qu'en fin de saison, à effet réduit de moitié (un point d'étape n'est pas un bilan). Il ne se redéclenche jamais deux fois pour la même étape.

**Vestiaire.** Le moral **collectif** (moyenne réelle des moraux suivis joueur par joueur) tombant sous 45 déclenche une décision datée : réunir le groupe ou laisser filer. Réunir remonte réellement le moral **mais coûte la séance du lendemain** (elle passe en récupération) — un vrai prix, pas un bonus gratuit. Laisser filer l'enfonce. Le silence à l'échéance vaut « laisser passer », par le même chemin que le choix explicite.

**Critères de validation.**
- `server/test-parcours-club.js` : 122/122 — dont 9 nouveaux tests (analyse gatée par le temps qui annonce son délai ; cinq points reflétant l'état réel, aucun bloquant, pourcentage cohérent, bascule réelle quand on règle la tactique ou qu'un titulaire se blesse ; fenêtres non chevauchantes avec date de réouverture ; **signature refusée hors fenêtre sans débit**, scouting toujours possible, signature acceptée à la réouverture ; **contrat qui ne bouge pas à la proposition** puis appliqué à la date, refus annonçant le montant réellement attendu ; point d'étape jugeant la position réelle et ne se redéclenchant pas ; vestiaire déclenché sur moral bas, réunion au coût réel, silence équivalent à « laisser passer »).
- `server/test-parcours-navigateur.js` : carte de préparation avec ses 5 points et son pourcentage, délai d'analyse annoncé puis rapport disponible à l'approche, **« Continuer » jamais bloqué**, clic sur un point qui ouvre le bon écran et bascule réelle après réglage, fenêtre ouverte puis fermée avec réouverture annoncée et signatures désactivées mais scouting actif, proposition de contrat sans effet immédiat, point d'étape faisant bouger la confiance, décision de vestiaire avec moral remonté et séance du lendemain sacrifiée.

**Le découpage en quatre tranches demandé est terminé.** Reste hors périmètre et documenté comme tel : les compétitions internationales du club du joueur (coupes d'Europe), une IA de recrutement pour les clubs adverses, et un centre de formation pour les clubs IA.

### P1-25. Grosses défaites trop fréquentes : le XV du joueur se plaçait à 7 couloirs au lieu de 12
- **Statut : CORRIGÉ**
- Priorité : P1 (demande utilisateur, formulée deux fois : « Corriger les grosses défaites trop fréquentes. Simuler plusieurs centaines de matchs, mesurer les écarts de score selon le niveau des équipes et corriger les causes réelles sans plafonner artificiellement les scores » et « mes adversaires gagnent trop souvent avec beaucoup d'écart »)
- Fichiers concernés : `docs/js/club-composition.js`, `server/simulate-ecarts.js` (**nouveau**), `server/test-equilibre-matchs.js` (**nouveau**), `server/charger-club.js` (**nouveau**), `.github/workflows/deploy-pages.yml`

**L'outil de mesure qui manquait.** `server/simulate-batch.js` mesurait déjà les volumes d'un match (essais, rucks, plaquages…), mais toujours en CUMULANT les deux équipes — il ne pouvait donc structurellement pas voir un déséquilibre entre elles. Nouveau `server/simulate-ecarts.js` : il mesure le DIFFÉRENTIEL de score sur des centaines de matchs, dans deux axes distincts — symétrie (club du joueur contre IA de niveau strictement égal) et échelle (écart de niveau croissant) — avec un témoin IA contre IA pour séparer un défaut du moteur d'un défaut du câblage du mode Club.

**Ce que la mesure a montré (baseline, avant tout correctif).** Sur 30 matchs de 80 minutes par scénario :

| Confrontation | Écart moyen | V/N/D | Défaites > 21 pts |
|---|---|---|---|
| joueur 0.50 vs IA 0.50 | **−42,4** | **0/0/30** | **87 %** |
| IA 0.50 vs IA 0.50 (témoin) | −2,9 | 15/0/15 | 13 % |
| joueur 0.50 vs IA 0.20 | −5,4 | 14/0/16 | 23 % |

Le témoin IA contre IA étant équilibré, **le moteur n'était pas en cause** : le défaut était entièrement dans la façon dont le club du JOUEUR était transmis au moteur. Il fallait affronter une équipe de niveau 0,20 pour qu'un club de niveau 0,50 fasse jeu égal — un handicap d'environ 40 points par match, invisible jusqu'ici parce qu'aucun outil ne comparait les deux camps.

**Cause racine : le placement suivait le joueur au lieu de suivre le maillot.** `couloir` (couloir latéral au repos, de 0 à 70 m de large) est défini par NUMÉRO dans le moteur : le n°11 se place sur une aile (7), le n°14 sur l'autre (63). Mais l'effectif du club du joueur est généré par CATÉGORIE de poste (`GABARIT_EFFECTIF`), et `ARCHETYPE_PAR_POSTE` retient **le premier numéro rencontré** pour chaque catégorie. Résultat : tous les ailiers héritaient du couloir du n°11, tous les piliers de celui du n°1, les deux deuxièmes lignes du n°4, les trois troisièmes lignes du n°6, les deux centres du n°12. Le XV du joueur n'occupait plus que **7 couloirs distincts au lieu de 12** — neuf joueurs entassés sur un tiers du terrain, une aile entière laissée libre à chaque phase de jeu. Les clubs IA, eux, sont générés par NUMÉRO (`genererJoueur(numero, …)`) et n'ont jamais eu le problème : d'où l'asymétrie.

Le même défaut existait sur le banc (`remplacementsVersConfig`) : un remplaçant entrait avec le couloir de SA catégorie, pas celui du maillot qu'il relevait. Il se manifestait à partir de la 50ᵉ minute et à chaque reprise de jeu, le moteur rechargeant la config des joueurs à chaque nouvelle manche (`_nouvelleManche`).

**Correctif (limité à deux champs).** Dans `compositionVersJoueursCfg` et `remplacementsVersConfig`, `couloir` et `tendance` sont désormais lus sur le profil du NUMÉRO porté ce jour-là (`DEFAULT_CONFIG.joueurs[numero]`) et non sur la fiche du joueur : le maillot dit où l'on se place, le joueur apporte ses qualités. **Tous les autres attributs restent strictement ceux du joueur** — vitesse, plaquage, mêlée, touche, puissance, endurance, passe, jeu au pied, décision, discipline, adresse — y compris les ajustements réels de fatigue et de moral. Un test dédié vérifie explicitement qu'aucun attribut n'a été aligné sur l'archétype du maillot. **Aucun score n'est plafonné**, aucune probabilité n'a été retouchée, le moteur n'a pas été modifié.

**Résultat mesuré après correctif**, mêmes graines, mêmes scénarios, 30 matchs par ligne. La colonne « témoin IA/IA » est la même confrontation jouée entre deux clubs IA — elle donne le comportement du moteur seul, donc la cible à atteindre :

| Confrontation | Avant | Après | Témoin IA/IA |
|---|---|---|---|
| joueur 0.50 vs IA **0.50** | −42,4 (0/30 victoires) | **+1,3 (12/30)** | −2,9 (15/30) |
| joueur 0.50 vs IA **0.20** | −5,4 | **+26,4** | +25,8 |
| joueur 0.50 vs IA **0.80** | −72,6 | **−19,7** | −27,0 |
| joueur 0.50 vs IA **0.95** | −83,0 | **−32,6** | −35,9 |
| grosses défaites à niveau égal | 87 % | **10 %** | 13 % |
| couloirs distincts occupés | 7 | **12** | 12 |

Le club du joueur suit désormais la courbe du témoin IA/IA sur toute l'échelle de niveau, à quelques points près — c'est la preuve la plus forte que l'asymétrie a disparu, et pas seulement qu'un chiffre a été ramené à zéro au point de mesure choisi.

**Effet secondaire vérifié : la fatigue redevient proportionnée.** Un XV entier à 55 de fatigue perdait de 81,4 points en moyenne contre une équipe fraîche de même niveau (100 % de défaites de plus de 21 points) ; il en perd maintenant 29,8 (77 %). La fatigue reste donc une vraie sanction — c'était l'intention de `appliquerFatigue` — mais elle ne s'ajoutait plus à un handicap de placement qui, lui, n'avait aucune raison d'exister.

**Critères de validation.**
- `server/test-equilibre-matchs.js` (**nouveau**, 6 tests) : chaque numéro occupe le couloir de son maillot sur 20 tirages ; les deux ailiers ne sont jamais sur la même aile ; le XV du joueur couvre autant de couloirs qu'un XV IA ; **les attributs restent ceux du joueur** ; à niveau égal l'écart moyen reste sous 12 points et les victoires entre 5 et 15 sur 20 ; les défaites de plus de 21 points restent minoritaires. Les 5 premiers échouent avant le correctif (mesures ci-dessus), les 6 passent après.
- Vérifié **dans le vrai jeu** (Playwright, carrière créée depuis l'accueil) et pas seulement en simulation : la config réellement envoyée au moteur pour le XV du joueur affiche bien 12 couloirs distincts, chacun conforme au profil de son numéro, sans erreur console.
- Régression complète sans échec : `test-invariants.js` 15/15, `test-parcours-club.js` 122/122, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-audit-p0-3.js` 8/8, `test-textes-accueil.js` 4/4, `test-parcours-navigateur.js` 199/199.

**Effet de bord utile.** `server/charger-club.js` (nouveau) centralise le chargement des 26 modules `docs/js/club*.js` sous Node — chaque outil ou test recopiait jusqu'ici la même liste de `new Function('window', …)`, qu'il fallait modifier partout à chaque nouveau domaine. Les fichiers de tests existants n'ont pas été touchés (aucun risque de régression) ; seuls les nouveaux outils l'utilisent.

**Bug de CI trouvé au passage (P0-5, 3ᵉ récidive) — CORRIGÉ.** En vérifiant que la tranche 4 était bien déployée, le run `main` [30718554172](https://github.com/sebadiaz/Rugby.-Manager/actions/runs/30718554172) s'avère **`test` ✅, `deploy` ✅, `verify` ❌** — alors que le site public servait bien le bon commit vingt secondes plus tard (`curl .../version.json` → `972d4e2…`). Cause : l'étape « Attendre la disponibilité du site public déployé » attendait que `index.html` RÉPONDE — or il répondait déjà, servi par le déploiement PRÉCÉDENT. Elle sortait donc en 0 s (visible dans les horodatages du job : `deploy` terminé à 21:16:18, attente terminée à 21:16:34 sans délai) et `test-deploy-public.js` interrogeait le CDN avant la propagation du nouveau contenu. **L'étape attend désormais que `version.json` annonce RÉELLEMENT le commit déployé** (60 tentatives, 2 s d'intervalle), et échoue en annonçant le commit effectivement publié. L'expression de lecture a été testée contre le vrai site public avant d'être committée. Le déploiement lui-même n'a jamais été en cause : c'est la preuve qui était fausse — exactement le contraire du symptôme P0-5 d'origine, et donc tout aussi grave puisqu'elle rendait le signal de CI ininterprétable.

**Vérifié sur les niveaux RÉELLEMENT rencontrés en jeu, pas seulement sur une échelle théorique.** Les scénarios ci-dessus balaient tout l'intervalle 0,20-0,95 pour isoler le défaut, mais une carrière ne rencontre jamais ces écarts : elle débute en Ligue Régionale, bande `[0,15 ; 0,45]` (`bandeNiveauPalier(3)`), le club du joueur au milieu (0,30) et les adversaires étalés sur toute la bande (`niveauxAdversairesPourPalier`). Mesure sur ces trois confrontations réelles, 25 matchs chacune, après correctif :

| Adversaire réel du palier | Écart moyen | V/N/D | Défaites > 21 pts |
|---|---|---|---|
| le plus faible (0,15) | +12,2 | 20/0/5 | 0 % |
| de même niveau (0,30) | +5,0 | 14/1/10 | 4 % |
| le plus fort (0,45) | −10,2 | 5/2/18 | 28 % |

C'est un championnat crédible : on bat les derniers, on joue à égalité au milieu, on souffre contre le premier — et une lourde défaite n'arrive plus que face au meilleur club, pas à chaque journée. **Rien ne reste à corriger sur ce sujet.** Il subsiste un léger biais favorable au joueur (+5,0 et 14/10 à niveau strictement égal, +1,3 et 12/18 dans le scénario 0,50) : de l'ordre du bruit à ces tailles d'échantillon, à surveiller si une mesure future le confirme, mais sans commune mesure avec les −42,4 corrigés ici et pas dans le sens qui gênerait le joueur.

### P1-26. Deux actions distinctes : « Jour suivant » et « Continuer » qui s'arrête sur les événements
- **Statut : CORRIGÉ**
- Priorité : P1 (demande utilisateur, point 1 : « Ajouter deux actions distinctes : "Jour suivant" : avance exactement d'un jour. "Jusqu'au prochain match" : avance automatiquement jour par jour, mais s'arrête en cas de match, blessure, offre, décision ou événement important. »)
- Fichiers concernés : `docs/js/club-evenements.js`, `docs/js/club-semaine-entrainement.js`, `docs/js/clubUI.js`, `docs/index.html`, `server/test-parcours-club.js`, `server/test-parcours-navigateur.js`

**Le manque exact.** Il n'existait qu'UN bouton, « Continuer », qui filait d'un match à l'autre. Deux conséquences : impossible de suivre une semaine d'entraînement jour par jour (attendre un retour de blessure, voir la fatigue redescendre), et surtout **tout ce qui se produisait en chemin défilait sans que le joueur ait la main** — une blessure, un rapport de repérage, une réponse à une proposition de contrat et une décision de vestiaire pouvaient survenir dans la même avance de trois semaines et n'être découverts qu'après coup, dans la boîte de réception.

**« Jour suivant ».** Avance d'exactement un jour et le résout. Le bouton annonce la date qu'il va atteindre (« → lun. 19 août »), comme « Continuer » annonce la sienne. Il **disparaît le jour d'un match** : avancer d'un jour le sauterait. Il ne joue jamais un match — arriver le jour d'une rencontre ouvre sa préparation, exactement comme « Continuer ».

**« Continuer » s'arrête maintenant sur ce qui compte.** `avancerJusquAuProchainMatch` avance jour par jour et rend la main dès qu'une journée produit quelque chose de réel. Six raisons d'arrêt, chacune adossée à un changement **déjà appliqué** à la sauvegarde, jamais à une alerte décorative : `match`, `blessure`, `contrat` (un joueur a répondu à une proposition), `rapport` (repérage remis), `decision` (une décision à trancher est apparue), `evenement` (retour de blessure, retour de prêt, point d'étape de la direction). Le message d'arrêt dit toujours combien de jours restent avant le match.

**Deux pièges traités explicitement.**
- *Une décision DÉJÀ en attente ne bloque pas.* On compare l'état des messages à un instantané pris **avant** de partir : seule une décision NOUVELLE interrompt. Sans ça, une décision non tranchée aurait rebloqué chaque clic indéfiniment.
- *Rester sur un jour de match ne fait pas avancer.* L'action reste idempotente : recliquer le jour d'une rencontre rouvre sa préparation au lieu de la sauter (0 jour traversé, raison `match`).

**Ce qui manquait pour que « blessure » soit une vraie raison d'arrêt.** Jusqu'ici **seul un match pouvait blesser** (`faireProgresserBlessures`, appelé après la résolution d'un match) : une semaine d'entraînement ne coûtait que de la fatigue, jamais un joueur. Nouveau `blessuresDeSeance` : le risque suit l'**intensité** de la séance (repos et récupération ne blessent jamais) et la **fatigue** du joueur (un effectif épuisé qu'on pousse quand même se blesse jusqu'à trois fois plus), et le préparateur physique le réduit réellement. Blessure d'entraînement plus courte qu'une blessure de match (3 à 12 jours contre 7 à 28), raccourcie par le médecin. **Mesuré sur 5 saisons complètes de 280 jours avec la semaine par défaut : 7 à 10 blessures d'entraînement par saison** pour l'effectif pro (24) plus le centre de formation — nettement sous la vingtaine de blessures de match, donc l'entraînement pèse sur les choix sans décimer le groupe.

**Bug trouvé en écrivant les tests.** Le tirage de blessure était d'abord placé avant la guérison quotidienne : une blessure déclarée le jour même perdait immédiatement son premier jour, et **la durée annoncée au manager n'était pas la durée réelle**. Le tirage est passé en dernier ; un test compare désormais la durée annoncée à `blessureJournees` réellement posée.

**Régression trouvée en cours de route et corrigée.** « Continuer » ne prenait aucun verrou : il se protégeait du double clic uniquement parce qu'il visait toujours la même échéance (un second clic avançait de 0 jour). Ce n'est plus vrai — un double clic aurait enchaîné deux avances et **le joueur n'aurait jamais vu l'événement qui a interrompu la première**. Nouveau verrou court de 350 ms partagé par les deux boutons (pas 1500 ms comme le marché des transferts : ici recliquer vite est un usage normal). Le test navigateur correspondant a été renforcé : il instrumente désormais la fonction d'avance elle-même et vérifie qu'**un seul appel** part sur un double clic — plus fiable que comparer des dates, puisque la longueur d'une avance n'est plus prévisible.

**Critères de validation.**
- `server/test-parcours-club.js` : 136/136 — dont 14 nouveaux (avance d'exactement un jour ; un jour de match n'est pas joué automatiquement ; arrêt exact le jour du match ; déjà sur un jour de match, aucune avance ; l'avance repart une fois le jour réglé ; journée sans rien de notable qui n'interrompt pas ; blessure, réponse de contrat, rapport, retour de blessure/prêt et décision nouvelle qui interrompent ; décision déjà connue qui n'interrompt pas ; séance intense qui blesse, repos qui ne blesse jamais, indisponibilité et durée annoncée réellement conformes).
- `server/test-parcours-navigateur.js` : 209/209 — dont 8 nouveaux (les deux boutons existent et sont distincts ; « Jour suivant » annonce sa date et avance d'exactement un jour ; le libellé suit la nouvelle date ; « Continuer » finit toujours par atteindre le match, en quelques clics et sans blocage ; « Jour suivant » disparaît le jour du match ; aucune erreur console).
- Vérifié **dans le vrai jeu** avant d'écrire les tests : trois « Jour suivant » (17 → 20 août), puis « Continuer » qui s'arrête le 22 août sur « Noah Blanc s'est blessé à l'entraînement — 8 jour(s) » en annonçant « encore 16 jour(s) avant le match ». Trois clics supplémentaires atteignent le match du 7 septembre.
- Régression complète sans échec : `test-invariants.js` 15/15, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-audit-p0-3.js` 8/8, `test-equilibre-matchs.js` 6/6, `test-textes-accueil.js` 4/4.

**Limite assumée et documentée.** L'utilisateur cite « offre » parmi les raisons d'arrêt. Les **offres de transfert entrantes des clubs IA n'existent pas encore** dans le jeu : rien ne pouvait donc déclencher cette raison. Plutôt que d'inventer un événement décoratif, les deux choses réelles les plus proches sont traitées comme raisons d'arrêt à part entière — la réponse d'un joueur à une proposition de contrat (`contrat`) et la remise d'un rapport de repérage (`rapport`). Les offres entrantes restent à créer, avec le reste de l'IA de recrutement des clubs adverses.

### P1-27. De vraies dates dans tous les calendriers, et chaque rencontre jouée uniquement à sa date
- **Statut : CORRIGÉ pour les compétitions qui existent (championnat, Équipe B, espoirs). Amicaux et coupes : hors périmètre tant qu'ils n'existent pas.**
- Priorité : P1 (demande utilisateur, point 2 : « Afficher de vraies dates dans tous les calendriers et faire jouer chaque rencontre uniquement à sa date : championnat, Équipe B, Espoirs, amicaux et coupes. »)
- Fichiers concernés : `docs/js/club-equipes.js`, `docs/js/club-calendrier.js`, `docs/js/clubUI.js`, `docs/css/style.css`, `server/test-parcours-club.js`, `server/test-parcours-navigateur.js`

**Le manque exact, en deux moitiés.**
1. *Rien n'était affiché.* La carrière est datée depuis P1-21 (`f.date` sur chaque rencontre), mais l'écran Calendrier groupait par « Journée N » et chaque ligne commençait par « J3 — ». **La date existait dans les données et n'apparaissait nulle part à l'écran.** La carte « Prochaine échéance » non plus.
2. *Les espoirs n'avaient aucune date du tout.* `calendrierEspoirs` fabrique ses rencontres à la volée à partir du calendrier de championnat et ne posait pas de champ `date` — alors que la rencontre a bien lieu à une date précise (`evenementsDuJour` la trouve, via `dateDeJournee(..., 'jeunes')`). Elle n'était simplement écrite nulle part, donc impossible à afficher.

**Ce qui a été fait.**
- Les rencontres espoirs portent désormais leur date réelle, dérivée du même calendrier daté que les deux autres équipes (`DECALAGE_JOUR_MATCH.jeunes = -3` : le mercredi qui précède la journée de championnat).
- L'entête de chaque journée affiche la date en clair — « Journée 1 · samedi 7 septembre 2024 ». Si les rencontres d'un même groupe portaient des dates divergentes (calendrier incohérent), **rien n'est affiché plutôt qu'une date fausse**.
- La carte « Prochaine échéance » date chaque rencontre à venir (« sam. 7 sept. — … ») au lieu de « J1 — … ».
- Les trois calendriers passent par le **même écran unique** et le même composant de ligne : aucune mise en page dédiée par équipe n'a été ajoutée.

**Chaque rencontre ne se joue qu'à sa date.** Nouveau `fixturesDuJour(saison, date)`. `prochainesFixtures` répond à « quelle est la prochaine journée ? », ce qui n'est **pas** la même question : si une journée n'avait pas été jouée à sa date, elle aurait été rejouée telle quelle un autre jour. La résolution d'une journée de championnat part maintenant de la date. Retombe explicitement sur `prochainesFixtures` pour une sauvegarde dont le calendrier n'est pas encore daté (rétrocompatibilité testée).

**Piège trouvé en testant, et corrigé.** Passer *toute* la résolution à la date a cassé l'Équipe B : elle joue le dimanche, où il n'existe aucune rencontre de championnat — la fonction sortait donc immédiatement et **la journée d'Équipe B ne se jouait plus du tout**. Les jours d'Équipe B et d'espoirs se rattachent à la journée de championnat À VENIR (l'adversaire des espoirs en est déduit) : ils gardent `prochainesFixtures` comme contexte de journée, leurs propres rencontres restant choisies par leur propre calendrier. Seule la journée de championnat est sélectionnée par la date.

**Régression corrigée sur le verrou de P1-26.** Le verrou d'avance bloquait aussi la réouverture de l'aperçu du match — or, un jour de match, « Continuer » ne fait que rouvrir la préparation, sans faire passer un seul jour. Rouvrir après un Échap ou un aller-retour composition/tactique redevient instantané : **le verrou ne protège que ce qui fait réellement passer des jours**.

**Critères de validation.**
- `server/test-parcours-club.js` : 144/144 — dont 8 nouveaux (les trois équipes portent une date ISO valide ; la rencontre espoirs tombe un mercredi et à la date exacte attendue ; les trois équipes ne jouent jamais le même jour ; une rencontre espoirs n'est programmée QUE le jour de sa date, et à aucun des quatre jours voisins ; redater un calendrier ne déplace jamais une rencontre déjà jouée ; les rencontres résolues un jour donné sont exactement celles datées ce jour-là, ni plus ni moins ; une journée sautée ne se rejoue pas un autre jour ; une sauvegarde sans dates reste jouable).
- `server/test-parcours-navigateur.js` : 216/216 — dont 7 nouveaux (la carte « Prochaine échéance » date chaque rencontre ; le calendrier des trois équipes affiche une vraie date en clair ; les trois affichent des jours DIFFÉRENTS ; la rencontre des espoirs est annoncée un mercredi ; aucune erreur console).
- Vérifié **dans le vrai jeu** avant d'écrire les tests : pro « Journée 1 · samedi 7 septembre 2024 », Équipe B « Journée 1 · dimanche 8 septembre 2024 », espoirs « Journée 4 · mercredi 25 septembre 2024 » — les trois calendriers de la même carrière, dans le même écran.
- Régression complète sans échec : `test-invariants.js` 15/15, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-audit-p0-3.js` 8/8, `test-equilibre-matchs.js` 6/6, `test-textes-accueil.js` 4/4.

**Reste à faire, honnêtement.** L'utilisateur cite aussi « amicaux » et « coupes » : **ces compétitions n'existent pas encore** (points 8 et 9 de sa liste). Il n'y a donc rien à dater — et rien n'a été inventé pour faire semblant. Quand elles seront créées, elles devront naître **datées**, sur le même modèle (`dateDeJournee` / date propre à la rencontre), et non recevoir des dates après coup. Les compétitions de l'onglet Monde (`docs/js/world.js`) restent également abstraites, avancées par journée sans dates : c'est cohérent avec leur rôle (arrière-plan statistique, jamais joué par le manager), mais à revoir si le point 4 les rend navigables en détail.

### P1-28. « Autres clubs » devient une navigation par pays puis championnat
- **Statut : CORRIGÉ**
- Priorité : P1 (demande utilisateur, point 4 : « Transformer "Autres clubs" en navigation par pays puis championnat, avec classement, calendrier et clubs cliquables. »)
- Fichiers concernés : `docs/js/club-competitions.js` (**nouveau**), `docs/js/club-equipes.js`, `docs/js/clubUI.js`, `docs/index.html`, `server/charger-club.js`, `server/test-parcours-club.js`, `server/test-parcours-navigateur.js`

**Le constat.** Tout existait déjà, mais éparpillé en trois sources qui ne se parlaient pas : le championnat du joueur, les deux autres paliers français (`autresDivisionsFrance`) et les 12 pays de l'écosystème mondial (`saison.monde`). Conséquences concrètes : l'écran « Autres clubs » ne montrait que les adversaires directs, l'onglet Monde affichait des classements dont **les noms de clubs n'étaient pas cliquables**, et **aucun des deux n'affichait de calendrier** — alors que chaque division mondiale en possède un, généré et avancé journée par journée depuis toujours.

**Nouveau module `club-competitions.js`.** Une vue unique sur les trois sources, sous la même forme : un pays, ses championnats, et pour chaque championnat des clubs, un classement (déjà trié, chaque ligne portant son club et son rang) et un calendrier. **Il ne duplique aucune donnée** — il lit celles qui existent et les présente sous une forme commune, exactement comme `club-equipes.js` le fait pour les équipes d'un club. La France du joueur remplace celle de l'écosystème mondial : c'est le même pays, ses données réelles vivent dans la saison — on n'affiche jamais deux Frances.

**La règle de navigation P1-20 est respectée.** On ne choisit toujours **jamais un club** dans une liste : on ouvre un club en cliquant son nom. Choisir un pays puis un championnat n'est pas choisir un club — c'est se déplacer entre compétitions, ce qui est justement ce qui **fait apparaître** des noms de clubs quelque part où on puisse les cliquer. Un test vérifie qu'aucun `<select>` n'existe dans ces écrans.

**Le vrai déblocage : `clubPartout`.** `RMClub.club()` ne connaît que le championnat du joueur — volontairement, c'est le seul endroit où un club a un effectif complet et peut jouer un match. Cette fonction reste **strictement inchangée** pour ne rien risquer sur les chemins de résolution de match. À côté, `clubPartout` cherche large et sert uniquement à la navigation. Cinq endroits l'utilisent désormais : `lienClub` (sans quoi tout classement étranger affichait « ? » au lieu des noms), `ouvrirClub`, `ouvrirClubDansNavigation`, le garde-fou « club disparu » de `navigationClub` (qui renvoyait au club du joueur dès qu'on ouvrait un club étranger) et la vue d'ensemble d'un club consulté.

**Honnêteté sur ce qui n'est pas simulé.** Un club japonais a un nom, un niveau, un classement et un calendrier **réels** — mais **aucun effectif n'est simulé pour lui**. L'écran le dit : « ses résultats et son classement sont réels et suivis, mais son effectif n'est pas simulé — il n'y a donc aucune analyse joueur par joueur à te montrer, et rien ne sera inventé. » Le même écran unique sert, avec sa carte d'effectif vide et son motif expliqué, exactement comme une Équipe B non qualifiée. Cliquer un tel club ouvre sa **vue d'ensemble** plutôt que sa composition, qui serait une page vide.

**Critères de validation.**
- `server/test-parcours-club.js` : 151/151 — dont 7 nouveaux (les 12 pays sont listés avec leurs championnats ; le championnat du joueur est signalé exactement une fois et contient réellement son club ; chaque championnat expose un classement de la bonne taille et un calendrier dont **toutes** les rencontres opposent des clubs de cette compétition ; **tout club affiché est retrouvable donc cliquable**, sur plus de 400 clubs vérifiés ; les clubs des autres paliers français sont retrouvés ; aucun identifiant n'est partagé par deux clubs ; un club du monde est consultable **sans effectif inventé**, avec un motif explicite).
- `server/test-parcours-navigateur.js` : 230/230 — dont 13 nouveaux (12 pays proposés ; championnat du joueur marqué ⭐ ; aucun sélecteur de club ; ouvrir un pays étranger affiche son championnat, son classement avec de vrais noms — **pas « ? »** — et son calendrier ; les clubs étrangers sont cliquables ; cliquer ouvre réellement la fiche ; retour proposé ; effectif inconnu annoncé honnêtement ; aucun joueur inventé ; retour à son club fonctionnel ; aucune erreur console).
- Vérifié **dans le vrai jeu** avant d'écrire les tests, y compris les trois bugs successifs trouvés par ce pilotage manuel : noms « ? » dans les classements étrangers, navigation qui rebondissait vers le club du joueur, puis deux erreurs JS (`nom` puis `forme` lus sur `null`) quand la vue d'ensemble tentait d'analyser un club sans effectif.

**Reste à faire.** Les calendriers du monde et des autres paliers français **n'ont pas de dates** (ils sont simulés de façon abstraite, journée par journée) : l'écran affiche donc « Journée 3 » sans date pour eux, et « Journée 3 · samedi 21 septembre 2024 » pour le championnat du joueur. Aucune date n'a été inventée pour combler le trou. C'est la suite naturelle de P1-27, à traiter si ces compétitions doivent un jour se dérouler en parallèle jour par jour. L'onglet Monde existant n'a pas été supprimé : il garde les compétitions internationales entre sélections, qui ne sont pas des championnats de clubs.

### P1-29. De vrais effectifs complets pour les clubs adverses : groupe de 24, banc, fatigue, blessures, rotation
- **Statut : CORRIGÉ**
- Priorité : P1 (demande utilisateur, point 6 : « Donner aux clubs adverses de vrais effectifs complets avec 15 titulaires, 8 remplaçants, blessures, fatigue et rotations. Afficher leur banc dans la composition adverse. »)
- Fichiers concernés : `docs/js/club-effectif-adverse.js` (**nouveau**), `docs/js/club-equipes.js`, `docs/js/club-composition.js`, `docs/js/club-evenements.js`, `docs/js/club.js`, `docs/js/clubUI.js`, `docs/index.html`, `server/charger-club.js`, tests

**Le constat.** Un club adverse possédait exactement **quinze** joueurs, un par numéro, générés une fois pour toutes. Aucun banc (`slotAdverse` renvoyait littéralement `compositionBanc: {}`, et l'écran affichait « Le banc n'est pas connu »), aucune fatigue, aucune blessure, aucune rotation. Le même XV descendait sur le terrain toutes les semaines, indéfiniment frais, pendant que le joueur gère 24 hommes avec leurs contraintes. Une asymétrie de gestion — et un adversaire qui ne vivait pas.

**Extension ADDITIVE, comme partout dans ce projet.** `club.effectif` (15 joueurs indexés par numéro) est lu par de nombreux consommateurs déjà en place : `effectifVersJoueursCfg` (config moteur), `analyserAdversaire`, `approcherJoueurAdverse`, `slotAdverse`. En changer la forme aurait obligé à tous les toucher. On garde donc `effectif` **exactement** tel qu'il était — c'est désormais la **feuille de match du jour**, dérivée du groupe — et on ajoute `groupe` (24) et `banc` (8) à côté. Aucun consommateur existant n'a changé : ils voient simplement un XV qui évolue d'une journée à l'autre, ce qui est précisément l'objectif.

**Ce qui vit maintenant.**
- **Groupe de 24** au même gabarit que le club du joueur (`GABARIT_EFFECTIF`), donc avec la bonne répartition par poste — pas trois demis de mêlée et zéro pilier de réserve.
- **Fatigue et blessures réellement suivies** : 32 points de fatigue par match pour un titulaire, 14 pour un remplaçant, 6 % de risque de blessure par titulaire et par match — **exactement les mêmes valeurs que pour le club du joueur**, pour ne favoriser personne. Récupération et guérison **quotidiennes**, au même rythme que les siennes.
- **Rotation réelle** : le XV est choisi sur la valeur EFFECTIVE, fatigue comprise, si bien qu'un cadre cuit passe derrière un remplaçant frais. Un blessé n'est jamais aligné. Un test vérifie qu'un groupe épuisé produit au moins 3 changements dans le XV.
- **Banc affiché** dans la composition adverse, avec les vrais noms de ses huit remplaçants et leurs éventuelles blessures — l'ancien message « pas connu » n'a plus lieu d'être.

**Conséquence importante : la fatigue adverse cesse d'être décorative.** `effectifVersJoueursCfg` n'appliquait **aucun** malus de fatigue ni de moral (il n'y en avait pas à appliquer). Maintenant que les adversaires en ont réellement, la **même formule** que `compositionVersJoueursCfg` leur est appliquée. Sans ça, leur fatigue aurait été un chiffre sans effet — et le joueur serait resté le seul des deux à être pénalisé par la sienne, exactement le genre d'asymétrie corrigée en P1-25.

**Équilibre revérifié.** `server/test-equilibre-matchs.js` reste à 6/6 après ce changement : à niveau égal, écart moyen +3,8 point et 10 victoires sur 20. Le correctif de placement de P1-25 n'a pas été altéré.

**Taille de sauvegarde mesurée, pas supposée.** 13 clubs × 24 joueurs = 312 joueurs adverses de plus. Mesuré : **295 ko en saison 1, 305 ko en saison 12** — la structure ne gonfle pas avec le temps (les adversaires sont régénérés, pas accumulés). Un test navigateur vérifie que la sauvegarde reste sous 3 Mo, largement sous le quota de `localStorage`.

**Robustesse ajoutée en cours de route.** `club.js` appelait `assurerEffectifsAdverses` **durement** : une balise `<script>` manquante aurait cassé la création d'une carrière au lieu de simplement priver les adversaires de leur banc. L'appel est désormais défensif, comme les autres domaines optionnels. C'est ce qui a fait échouer `test-audit-p0-1`/`p0-2` (qui chargent les modules à la main) et qui a mis le défaut en évidence.

**Critères de validation.**
- `server/test-parcours-club.js` : 160/160 — dont 9 nouveaux (groupe d'au moins 23 joueurs avec fatigue et blessure suivies ; XV tiré du groupe, jamais inventé à côté ; banc de 8 sans doublon avec le XV ; un match fatigue réellement les alignés **et personne d'autre** ; un blessé n'est pas aligné la journée suivante tout en gardant 15 joueurs sur la feuille ; la rotation change réellement le XV ; blessures et fatigue adverses se résorbent jour après jour ; une sauvegarde antérieure sans groupe reste jouable ; la fatigue adverse pèse réellement sur les stats envoyées au moteur **sans jamais déplacer personne**).
- `server/test-parcours-navigateur.js` : 236/236 — dont 6 nouveaux (groupe et banc persistés pour chaque adversaire ; taille de sauvegarde raisonnable ; banc adverse réellement affiché avec de vrais noms ; aucune erreur console). Le test existant qui attendait 15 joueurs sur l'écran d'un club consulté attend désormais **23** : c'est la feuille de match complète.
- Régression complète sans échec : `test-invariants.js` 15/15, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-audit-p0-3.js` 8/8, `test-equilibre-matchs.js` 6/6, `test-textes-accueil.js` 4/4.

**Conséquence de P1-26 rattrapée ici (récidive du même oubli).** Depuis que « Continuer » s'arrête sur le premier événement rencontré, **tout test qui cliquait une fois puis attendait l'aperçu du match est devenu dépendant de la graine** : selon le nom du club créé, une blessure d'entraînement peut survenir pendant l'intersaison et interrompre l'avance avant le match. `server/test-parcours-navigateur.js` avait été adapté (helper `continuerJusquAuMatch`) — mais **`server/test-audit-p0-3.js` avait été oublié**, et il est passé trois fois de suite en local avant d'échouer en CI (run [30743454045](https://github.com/sebadiaz/Rugby.-Manager/actions/runs/30743454045)). Corrigé de la même façon. **Leçon retenue : un test qui dépend d'une graine ne se valide pas en le relançant sur la même machine** — c'est exactement le piège dans lequel deux runs de CI sont tombés dans cette session.

**Reste à faire.** Les clubs des autres paliers français et des 12 pays n'ont **toujours pas** d'effectif simulé (cf. P1-28) : leur donner un groupe de 24 chacun représenterait des milliers de joueurs pour des compétitions résolues de façon abstraite. L'écran continue de le dire honnêtement. Par ailleurs, les clubs adverses ne recrutent pas encore : leur groupe vieillit et se régénère entre saisons, mais aucun mercato IA n'existe — c'est le prolongement naturel de ce chantier.

### P1-30. Page joueur : statistiques par compétition, historique des saisons et carrière
- **Statut : CORRIGÉ**
- Priorité : P1 (demande utilisateur, point 5 : « Créer une vraie page joueur indépendante : attributs, forme, fatigue, moral, contrat, statistiques par compétition, historique des saisons, progression et carrière. »)
- Fichiers concernés : `docs/js/club.js`, `docs/js/clubUI.js`, `docs/css/style.css`, `server/test-parcours-club.js`, `server/test-parcours-navigateur.js`

**Ce qui existait déjà.** La fiche joueur affichait déjà attributs, potentiel, **progression réelle depuis le début de saison**, moral, fatigue, contrat, salaire, disponibilité, sélection du jour et statistiques de la saison. Rien de tout cela n'a été refait — la demande portait sur ce qui manquait.

**Ce qui manquait vraiment.**
1. **Aucune ventilation par compétition** : `statsSaison` était un seul seau, sans distinction championnat / Équipe B / espoirs.
2. **Pire, deux compétitions sur trois n'enregistraient RIEN.** `accumulerStatsJoueurs` n'était appelée que pour le match du premier XV : un joueur pouvait disputer toute la saison avec l'Équipe B, ou tous les matchs d'académie, **sans qu'un seul chiffre apparaisse à son nom**.
3. **Aucun historique personnel.** `historiqueSaisons` existait, mais pour le CLUB. Côté joueur, la fin de saison remettait simplement `statsSaison` à `null` — une carrière de dix saisons ne laissait aucune trace. Le commentaire du code affirmait même que ces statistiques étaient « archivées ailleurs », ce qui était faux.
4. **Aucun total de carrière.**

**Ce qui a été fait.**
- `accumulerStatsJoueurs` prend un 4ᵉ paramètre `competition` (`'pro'` | `'b'` | `'jeunes'`, défaut `'pro'` — les appels existants restent valides) et alimente `statsSaison.parCompetition` **en plus** du total. Le total reste **exactement la somme** des compétitions : un test le vérifie, il ne peut pas diverger.
- Elle est désormais appelée pour l'**Équipe B** (sur l'effectif pro ET le centre de formation, puisque le vivier mêle les deux) et pour les **espoirs**.
- Une compétition n'apparaît **que si le joueur y a réellement joué** : pas de ligne « Équipe B — 0 match » fabriquée.
- `archiverSaisonJoueur` archive la saison écoulée dans `joueur.historiqueSaisons` (numéro de saison, club, âge, totaux, ventilation) **avant** la remise à zéro, pour l'effectif pro et le centre de formation. Un joueur qui n'a pas joué n'est pas archivé — une ligne « 0 match » n'apprend rien. Borné à 25 saisons.
- `carriereJoueur` additionne historique + saison en cours. **Purement dérivé**, jamais un compteur parallèle qui pourrait diverger.
- Trois blocs ajoutés à la fiche : tableau par compétition, tableau d'historique, totaux de carrière. **Aucun ne s'affiche s'il n'y a rien à dire.**

**Défaut de test ancien, enfin diagnostiqué.** Le test « double clic écran sur Signer » échouait par intermittence **depuis plusieurs sessions**, et était traité comme un aléa connu à écarter par simple relance. Il a échoué **deux fois de suite** ici, ce qui a justifié une vraie investigation : reproduit à la main, **un seul toast de signature était émis — la protection anti-double-clic fonctionnait parfaitement**. Le défaut était dans le test, qui comparait les joueurs **par NOM** ; les noms étant tirés de listes finies, deux joueurs déjà à l'effectif portaient le même nom que des joueurs du marché, et le test croyait voir trois recrues. Comparaison passée aux **identifiants**, et une assertion ajoutée (c'est bien le joueur de la ligne cliquée qui signe). **242/242 sur trois exécutions consécutives.** Leçon : « test connu comme instable » n'est pas un diagnostic.

**Critères de validation.**
- `server/test-parcours-club.js` : 166/166 — dont 6 nouveaux (ventilation par compétition avec total égal à la somme ; aucune ligne pour une compétition non jouée ; saison archivée avec ses chiffres réels, sa ventilation et son club, puis remise à zéro ; carrière additionnant réellement historique + saison en cours ; carrière vide pour un joueur qui n'a rien joué ; **les matchs d'Équipe B et des espoirs comptent enfin**).
- `server/test-parcours-navigateur.js` : 242/242 — dont 5 nouveaux (aucun tableau pour un joueur qui n'a rien joué ; ventilation Championnat + Équipe B affichée ; historique avec club et âge ; totaux de carrière justes ; aucune erreur console) + 1 assertion supplémentaire sur le double clic.
- Vérifié **dans le vrai jeu** : Championnat 6 matchs / 3 essais et Équipe B 3 matchs / 1 essai côte à côte, historique « saison 1, 22 matchs, 6 essais », carrière « 2 saisons, 31 matchs, 10 essais, 730 mètres » — chaque total recoupé à la main.
- Régression complète sans échec.

**Reste à faire, honnêtement.** La fiche reste **dépliée dans l'onglet Effectif**, ce n'est pas encore une page à part entière avec sa propre entrée de navigation. Tout le contenu demandé y est, mais la demande disait « page indépendante » : c'est une présentation, pas une donnée, et elle reste à faire. Par ailleurs les statistiques par compétition ne remontent que du moteur (essais, passes, plaquages, mètres) : cartons, coups de pied réussis et temps de jeu en minutes ne sont pas encore exposés par `etat.statsJoueurs`.

### P1-31. Un vrai championnat des espoirs : académies persistantes, calendrier, classement
- **Statut : CORRIGÉ**
- Priorité : P1 (demande utilisateur, point 7 : « Remplacer les matchs Espoirs occasionnels par un vrai championnat junior avec calendrier, classement, clubs persistants et statistiques. »)
- Fichiers concernés : `docs/js/club-espoirs.js`, `docs/js/club-equipes.js`, `docs/js/club-agenda.js`, `docs/js/clubUI.js`, `server/test-parcours-club.js`, `server/test-parcours-navigateur.js`

**Le constat.** Les espoirs disputaient un match occasionnel contre une académie **synthétique régénérée à chaque rencontre puis jetée** : aucun adversaire ne revenait, son nom changeait d'un affichage à l'autre, et le « classement » affiché était le **bilan du club du joueur tout seul** — une ligne unique. Le calendrier lui-même était déduit à la volée du calendrier professionnel.

**Le championnat.** Des académies **persistantes**, adossées aux clubs adverses réels de la division (« Académie <club> »), avec leur propre `niveauClub` dérivé du club parent — des adversaires qu'on retrouve d'une journée à l'autre et dont le nom reste reconnaissable. Un vrai **aller-retour** (`genererCalendrier` + `classementInitial`, les mêmes fonctions que le championnat d'Équipe B, jamais un moteur parallèle), un vrai **classement multi-clubs**, et un calendrier **entièrement daté** (le mercredi, `DECALAGE_JOUR_MATCH.jeunes`).

**Un choix de dimensionnement assumé.** Une saison n'offre qu'un nombre limité de dates d'espoirs (une journée de championnat sur quatre, soit 6 ou 7 par saison). `tailleCompetitionEspoirs` retient donc le plus grand nombre PAIR d'académies dont l'aller-retour **tient entièrement** dans ces dates. **Mieux vaut une compétition complète — tout le monde rencontre tout le monde, aller et retour — qu'une grande ligue tronquée dont le classement ne voudrait rien dire.**

**Les autres rencontres de la journée sont jouées aussi.** Comme pour l'Équipe B et le championnat principal, seul le match du club du joueur passe par le moteur complet ; les autres sont résolues de façon abstraite à partir du niveau réel de chaque académie. Le classement vit donc réellement, sans payer le coût du moteur pour des matchs jamais regardés. Vérifié : une journée produit bien **plusieurs** rencontres jouées, pas une seule.

**Cohérence archive / calendrier.** `enregistrerMatchEspoirs` (l'archive qui alimente le bilan et l'historique) marque désormais AUSSI la rencontre correspondante du championnat. Sans ça les deux auraient divergé : la rencontre serait restée « à jouer » indéfiniment et **« Continuer » s'y serait arrêté en boucle**.

**Deux textes devenus faux, corrigés.** La note sous le classement affirmait que « les espoirs disputent des rencontres amicales […] pas un championnat à classement » : remplacée. Et les noms d'académies s'affichaient « **?** » dans le classement, parce que `lienClub` ne connaît pas ces clubs — ils sont désormais rendus **en texte**, puisqu'une académie n'a pas de fiche à ouvrir. Les deux défauts ont été trouvés en pilotant le jeu, pas en relisant le code.

**Critères de validation.**
- `server/test-parcours-club.js` : 173/173 — dont 7 nouveaux (compétition existante avec académies **persistantes d'un appel à l'autre** ; aller-retour complet, entièrement daté, un mercredi, chaque journée sur une seule date et dans l'ordre ; classement couvrant tous les clubs ; un résultat enregistré met réellement à jour le classement ; la ronde regroupe toutes les rencontres de la journée ; chaque académie a un niveau propre et un nom unique ; une sauvegarde antérieure gagne sa compétition sans perdre ses résultats archivés). Quatre tests plus anciens ont été mis à jour : les espoirs ont maintenant leur **propre numérotation de journées** (`journeeChampionnat` dit à quelle journée de championnat la rencontre est adossée).
- `server/test-parcours-navigateur.js` : 248/248 — dont 6 nouveaux (l'écran annonce un CHAMPIONNAT ; le classement compte plusieurs académies **toutes nommées, aucun « ? »** ; calendrier daté un mercredi ; une journée entière se joue, pas seulement le match du joueur ; le classement bouge réellement ; aucune erreur console).
- Vérifié **dans le vrai jeu** : « Championnat des espoirs », journée 1 le mercredi 25 septembre 2024, journée 2 le mercredi 23 octobre, et après une journée le tableau montre « Académie Roquebrune Dragons 1 1 0 0 19-4 +15 4 pts » devant « Stade Espoirs 1 1 0 0 6-3 +3 4 pts ».
- Régression complète sans échec.

**Reste à faire.** Les académies n'ont **pas d'effectif simulé** (seuls leurs résultats le sont) — l'écran le dit. Elles sont régénérées à chaque saison en même temps que les adversaires : il n'y a donc pas encore d'historique pluriannuel du championnat espoirs.

### P1-32. Organiser un match amical sur une date libre
- **Statut : CORRIGÉ**
- Priorité : P1 (demande utilisateur, point 8 : « Permettre d'organiser des matchs amicaux sur une date libre. »)
- Fichiers concernés : `docs/js/club-amicaux.js` (**nouveau**), `docs/js/club-agenda.js`, `docs/js/club.js`, `docs/js/clubUI.js`, `docs/index.html`, `server/charger-club.js`, tests

**Le manque.** Le calendrier était daté depuis P1-21, mais ne comportait que des rencontres **imposées**. Aucun moyen d'occuper une date libre — ni pour préparer une reprise après l'intersaison, ni pour redonner du temps de jeu à un joueur qui revient de blessure, ni simplement pour se tester face à un club d'un autre niveau.

**Une date libre est calculée, pas déclarée.** `datesLibresPourAmical` ne propose que des jours où aucune des trois équipes ne joue, où aucun amical n'est déjà prévu, **et dont le lendemain est lui aussi dégagé** — un club ne dispute pas un amical la veille d'un match officiel. Les refus portent toujours un motif explicite (date passée, date occupée, adversaire sans effectif simulé) : jamais un échec silencieux ni un bouton grisé sans explication.

**La navigation reste intacte (règle P1-20).** On ne choisit **pas** un adversaire dans une liste : on ouvre un club en cliquant son nom, et c'est depuis **sa page** qu'on lui propose une rencontre. L'action vit sur le club qu'on regarde. Un test vérifie qu'aucun sélecteur de club n'apparaît.

**C'est une vraie rencontre.** Elle devient une échéance annoncée par le bouton principal (« Continuer jusqu'au dimanche 18 août 2024 »), se joue à sa date avec le **moteur complet**, et a des conséquences réelles : fatigue, blessures, moral, temps de jeu, statistiques individuelles — et l'adversaire encaisse la sienne aussi (cf. P1-29). Ce qu'elle ne fait **jamais** : rapporter le moindre point au championnat, ni entrer dans un classement. Un test le vérifie explicitement.

**Critères de validation.**
- `server/test-parcours-club.js` : 180/180 — dont 7 nouveaux (les dates libres excluent les jours de match, leurs veilles et le passé ; proposer programme réellement la rencontre et crée une échéance ; refus du doublon le même jour et du jour d'un match officiel ; refus d'une date passée ; annulation possible tant que la rencontre n'est pas jouée, le jour redevenant libre ; résultat enregistré **sans toucher au classement**, et le jour cesse d'être une échéance ; les amicaux d'une saison écoulée sont nettoyés).
- `server/test-parcours-navigateur.js` : 256/256 — dont 8 nouveaux (la proposition vit sur la page du club consulté sans sélecteur d'adversaire ; de vraies dates libres ; rencontre programmée à la date choisie ; échéance annoncée par le bouton principal ; jouée à sa date avec un score du moteur ; **aucune journée de championnat avancée** ; les joueurs alignés sont réellement fatigués ; aucune erreur console).
- Vérifié **dans le vrai jeu** : rencontre proposée à Fontclair Étoiles le dimanche 18 août, bouton passé à « Continuer jusqu'au dimanche 18 août 2024 », match joué 13-9, et **0 journée de championnat jouée**.
- Régression complète sans échec.

**Reste à faire.** L'adversaire accepte toujours (aucune négociation, aucun refus lié à son propre calendrier ou à son intérêt sportif), et un amical se joue toujours à domicile. Les amicaux sont remis à zéro au changement de saison, comme le championnat espoirs — dont la régénération a été ajoutée ici au passage (elle manquait).

### P1-33. Classement et Calendrier deviennent deux pages distinctes
- **Statut : CORRIGÉ**
- Priorité : P1 (demande utilisateur : « changer autre club et calendrier par classement et calendrier. ce sont deux choses séparés pas dans la même page »)
- Fichiers concernés : `docs/index.html`, `docs/js/clubUI.js`, `docs/js/club-competitions.js`, `docs/js/club-equipes.js`, `server/test-parcours-navigateur.js`, `server/test-parcours-club.js`

**Ce qui n'allait pas.** Deux écrans mélangeaient chacun deux choses : « Autres clubs » (devenu la navigation par pays/championnat en P1-28) affichait classement **et** calendrier dans la même carte, et « Calendrier & classement » faisait la même chose pour l'équipe sélectionnée. Deux endroits différents pour lire un classement, deux pour lire un calendrier.

**Deux onglets, une seule chose chacun.** « Autres clubs » devient **🏆 Classement** et « Calendrier & classement » devient **📅 Calendrier**. La page Classement ne contient plus aucun calendrier, la page Calendrier plus aucun classement — deux tests le vérifient explicitement, en cherchant l'élément de l'autre écran dans le volet.

**Une seule navigation, partagée.** La barre pays → championnat est désormais **UN SEUL composant DOM** (`#navigationCompetition`), déplacé dans l'onglet actif par `basculerOnglet` — exactement le mécanisme déjà utilisé pour le sélecteur d'équipe depuis P1-19. Les deux pages parlent donc toujours de la même compétition choisie : changer de championnat sur l'une le change sur l'autre, sans aucune synchronisation à écrire.

**Toutes les compétitions au même endroit.** Le championnat d'**Équipe B** et le **championnat des espoirs** rejoignent la navigation, à la suite de la pyramide française et marqués ⭐ comme celle du joueur. Il n'y a donc plus qu'un seul chemin pour lire n'importe quel classement ou calendrier du jeu — celui de sa division, ceux de ses deux autres équipes, les deux autres paliers français et les 36 divisions des 12 pays. Le sélecteur d'équipe disparaît de ces deux écrans (il n'y a plus rien à y sélectionner) et reste sur Effectif, Composition, Tactique, Entraînement et Personnel.

**Régression trouvée et corrigée en cours de route.** En unifiant les deux tableaux de classement, les colonnes **bonus offensif / bonus défensif** avaient disparu — un test existant l'a détecté immédiatement. Rétablies.

**Critères de validation.**
- `server/test-parcours-navigateur.js` : 258/258 — dont 2 nouveaux (**la page Classement ne contient aucun calendrier**, **la page Calendrier ne contient aucun classement**). Onze tests existants ont été adaptés au nouveau modèle : ils passaient par le sélecteur d'équipe pour choisir un calendrier ou un classement, ils passent maintenant par la navigation de compétitions. Le test « l'équipe sélectionnée est CONSERVÉE d'un écran à l'autre » vérifie désormais le trajet Effectif → Composition, le sélecteur ne vivant plus sur le Calendrier.
- `server/test-parcours-club.js` : 180/180 — deux tests mis à jour : les **trois** compétitions du joueur sont maintenant marquées comme siennes (sa division reste unique), et les académies du championnat espoirs sont explicitement exclues de l'exigence « tout club affiché est cliquable » — elles n'ont pas de fiche, leur nom est affiché en texte.
- Vérifié **dans le vrai jeu** : les onglets « 🏆 Classement » et « 📅 Calendrier » se suivent dans le menu, la navigation propose « Ligue d'Excellence | Ligue Nationale | Ligue Régionale ⭐ | Championnat Équipe B ⭐ | Championnat des espoirs ⭐ », et choisir le championnat des espoirs met à jour les deux pages de façon cohérente (calendrier au mercredi 25 septembre, classement à quatre académies).
- Régression complète sans échec.

### P1-34. Moteur générique de coupes, et quatre coupes réelles
- **Statut : CORRIGÉ**
- Priorité : P1 (demande utilisateur, point 9 : « Créer un moteur générique de coupes, puis ajouter : une coupe nationale à élimination directe ; une coupe continentale principale inspirée de la Champions Cup ; une coupe continentale secondaire inspirée de la Challenge Cup ; une coupe Espoirs. »)
- Fichiers concernés : `docs/js/club-coupes.js` (**nouveau**), `docs/js/club-agenda.js`, `docs/js/club-competitions.js`, `docs/js/club.js`, `docs/js/clubUI.js`, `docs/index.html`, `server/charger-club.js`, tests

**Le manque.** Le jeu ne connaissait que des championnats : des poules où tout le monde rencontre tout le monde et où un classement départage. Aucune compétition à élimination directe — donc aucun match couperet, aucun parcours, aucun trophée.

**Un moteur qui ne connaît aucune coupe.** `club-coupes.js` sait construire un tableau à partir d'une liste de clubs et d'une liste de dates, faire avancer les vainqueurs et désigner un lauréat. **Les quatre coupes ne sont que des configurations** : chacune dit d'où viennent ses participants, rien d'autre ne les distingue. En ajouter une cinquième ne demandera pas une ligne de logique.

**Deux règles propres à l'élimination directe**, absentes des championnats :
- **Il n'y a jamais de match nul.** Une prolongation départage, et c'est annoncé (`apresProlongation`). Le départage est **déterministe**, dérivé des identifiants : deux chargements de la même sauvegarde donnent le même vainqueur, jamais un tirage relancé à chaque affichage.
- **Un club éliminé ne rejoue plus.** Les tours au-delà du premier naissent **vides** et se remplissent au fur et à mesure des résultats : le tableau reflète toujours l'état réel, jamais une projection.

**Un nombre de clubs qui n'est pas une puissance de 2** est ramené à la puissance inférieure par **qualification au mérite** — plutôt que d'inventer des tours préliminaires ou des exemptions. Seule exception : le club du joueur est **engagé d'office** dans ses propres coupes (nationale, espoirs). Il n'est pas spectateur de son pays.

**Les quatre coupes, mesurées sur une vraie saison.**

| Coupe | Clubs | Tours | Participants |
|---|---|---|---|
| Coupe Nationale | 32 | 5 (seizièmes → finale) | division du joueur + les deux autres paliers français |
| Coupe des Champions | 16 | 4 | les 2 meilleurs de chaque division de niveau 1 du monde + l'élite française |
| Coupe Challenge | 16 | 4 | les 2 meilleurs de chaque division de niveau 2 |
| Coupe des Espoirs | 4 | 2 | les académies du championnat espoirs |

**Elles se jouent vraiment.** Chaque tour a une date, choisie **en semaine et décalée tant qu'elle tombe sur une échéance existante** du club — on ne joue pas deux matchs le même jour. Une rencontre de coupe du club du joueur devient une échéance annoncée par le bouton principal, jouée avec le **moteur complet** ; les autres rencontres du même tour sont résolues de façon abstraite, comme partout ailleurs. Fatigue, blessures, moral et statistiques individuelles s'appliquent normalement. Le message annonce « Qualifié ! » ou « Éliminé », avec le nom du tour et la mention de la prolongation le cas échéant.

**Dans la navigation unifiée (P1-33).** Les quatre coupes rejoignent la liste des compétitions. Une coupe n'a **pas de classement** : l'écran Classement le dit (« Compétition à élimination directe : pas de classement, un tableau ») et annonce le vainqueur dès la finale jouée — **jamais une table de points fabriquée pour remplir l'écran**. Le calendrier, lui, nomme ses tours (« Quarts de finale ») au lieu de les numéroter.

**Bug trouvé en pilotant le jeu, pas en relisant le code.** Après un match de coupe (et, même défaut, après un match amical de P1-32), fermer l'écran de résultat laissait le joueur sur un **écran totalement vide** : le panneau du club avait été masqué au coup d'envoi et personne ne le remontrait. Le match de championnat, lui, avait depuis toujours un rappel `onFermer` pour ça. Ajouté aux deux. Le symptôme est apparu comme un blocage de la boucle de fin de saison dans les tests navigateur — c'est en instrumentant l'état des panneaux jour par jour que la cause est devenue évidente.

**Critères de validation.**
- `server/test-parcours-club.js` : 191/191 — dont 11 nouveaux (tableau complet à 8 clubs avec les bons noms de tours et les bonnes dates ; 13 clubs ramenés à 8 par qualification au mérite ; un résultat fait réellement avancer le vainqueur au tour suivant ; **jamais de nul**, une prolongation départage ; pas de vainqueur tant que la finale n'est pas jouée ; **les quatre coupes existent** avec des tours tous datés ; le club du joueur est engagé dans la coupe nationale ; les tours ne tombent jamais sur un match de championnat ; une coupe entière se joue et désigne un vainqueur **sans laisser une seule rencontre sans vainqueur** ; les coupes sont régénérées au changement de saison ; une rencontre de coupe devient une échéance datée retrouvable).
- `server/test-parcours-navigateur.js` : les quatre coupes figurent dans la navigation, une coupe annonce qu'elle n'a pas de classement, son calendrier nomme et date ses tours, le club du joueur y est engagé, une rencontre se joue réellement, aucune rencontre jouée ne reste sans vainqueur, et un message réel est produit.
- Régression complète sans échec côté données.

**Reste à faire.** Les coupes ne rapportent encore **ni argent ni confiance du président** : gagner la Coupe Nationale n'a pas de conséquence économique ou sportive au-delà du trophée. Les qualifications continentales ne dépendent pas non plus du classement de la saison précédente (les participants sont choisis sur le niveau des clubs). Ce sont les deux prolongements naturels.

### P2-10. Découper club.js et clubUI.js par domaine (sans changement de comportement)
- **Statut : EN COURS (tranche 1 : Personnel, tranche 2 : Objectif de saison, tranche 3 : Analyse adversaire, tranche 4 : Prêts, tranche 5 : Contrats, tranche 6 : Équipe B, tranche 7 : Transferts national, tranche 8 : Transferts internationaux, tranche 9 : Effectif étendu, tranche 10 : Centre de formation, tranche 11 : Composition et tactique, tranche 12 : Condition physique des joueurs, tranche 13 : Génération de club/pyramide, tranche 14 : Calendrier et classement, tranche 15 : Sauvegarde et migration — voir constat de risque et tranches suivantes ci-dessous)**
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

**Tranche 7 — Marché des transferts national.** `genererJoueurLibre`, `genererMarcheTransferts`, `statsApparentes`, `estimationEtoiles`, `scouterJoueur`, `calculerPrimeSignature`, `signerJoueur`, `libererJoueur`, `basculerFavori` déplacés vers un nouveau `docs/js/club-transferts.js`. Deux nouvelles aides génériques exportées (`genererJoueurEtendu`, `GABARIT_EFFECTIF`) ; `COUT_SCOUTING`/`SEUIL_CONNAISSANCE_COMPLETE` (constantes internes au domaine) déplacées avec les fonctions plutôt qu'exportées de `club.js`, seul `COUT_SCOUTING` réexporté (consommé par `clubUI.js`). 2 points d'appel externes (`avancerSaison`, `nouvelleSaison`) adaptés pour passer par `RMClub.genererMarcheTransferts`.
- **Dépendance cachée trouvée en analysant le domaine AVANT de couper (pas une surprise en cours de route, contrairement à la tranche 1)** : `approcherJoueurAdverse`/`convertirJoueurAdverseEnEffectifEtendu` (transfert international, cité dans le même item de backlog) mutent directement `compteurJoueurId`, une variable de module — même genre de dépendance que `compteurPersonnelId` en tranche 1. Décidé de NE PAS les extraire dans cette tranche (contrairement à un forçage qui aurait nécessité le même genre de fonction de resynchronisation dédiée que tranche 1) : laissés dans `club.js`, traités comme une sous-tranche future distincte plutôt que d'agrandir le risque de cette tranche.
- Suite complète relancée sans aucune régression : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 91/91, `test-audit-p0-3.js` 8/8.

**Tranche 8 — Transferts internationaux.** `calculerPrixDemandeAdverse`, `convertirJoueurAdverseEnEffectifEtendu`, `approcherJoueurAdverse` déplacés vers un nouveau `docs/js/club-transferts-internationaux.js`, exactement comme prévu en tranche 7 : la dépendance cachée à `compteurJoueurId` (variable de module) traitée avec la même méthode que `compteurPersonnelId` en tranche 1 — nouvelle fonction dédiée `genererProchainIdJoueur()` exportée de `club.js`, appelée par le nouveau fichier au lieu d'une mutation directe impossible hors de sa fermeture. `genererJoueur` (génération d'un remplaçant adverse après transfert) également exporté.
- Suite complète relancée sans aucune régression, en particulier `test-audit-p0-1.js` (P0-1b, id de club après rechargement — le scénario le plus proche de ce changement) et les 3 scénarios `approcherJoueurAdverse` de `test-parcours-club.js` (refus, transfert accepté, remplaçant généré) : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 91/91, `test-audit-p0-3.js` 8/8.

**Tranche 9 — Effectif étendu (club du joueur).** `genererJoueurEtendu`, `genererEffectifEtendu` déplacés vers un nouveau `docs/js/club-generation-joueurs.js` — distinct de `genererJoueur`/`genererEffectif` (numero-based, effectif adverse "prêt à jouer", restés dans `club.js`, déjà exportés). Réutilise `genererProchainIdJoueur()` (déjà exportée depuis la tranche 8) pour l'attribution d'id — aucune nouvelle dépendance à traiter, contrairement aux tranches précédentes. 5 nouvelles aides génériques exportées (`ARCHETYPE_PAR_POSTE`, `borneStat`, `borneAdresse`, `genererAttributsProfondeur`, `genererPotentiel`), nécessaires car partagées avec `genererJoueur`/`genererJeune`, restés dans `club.js`. 2 points d'appel externes (`genererClubJoueur`, `avancerSaison`) adaptés pour passer par `RMClub.*`.
- Suite complète relancée sans aucune régression, avec attention particulière à `test-audit-p0-3.js` (crée un club, donc appelle directement `genererEffectifEtendu`) et à la carrière longue de `test-parcours-club.js` (12 saisons, exerce le renouvellement de l'effectif via `avancerSaison`) : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 91/91, `test-audit-p0-3.js` 8/8.

**Tranche 10 — Centre de formation (jeunes).** `genererJeune`, `completerCentreFormation`, `genererCentreFormation`, `assurerCentreFormation`, `promouvoirJeune`, `progresserCentreFormation` déplacés vers un nouveau `docs/js/club-centre-formation.js`. Dépendance à `compteurJoueurId` traitée comme prévu (`RMClub.genererProchainIdJoueur()`, déjà exportée). `QUOTA_CENTRE_FORMATION` (dérivé de `POSTE_REQUIS`, déjà exporté) calculé une fois au chargement du nouveau fichier — nécessite que `club.js` soit chargé avant, déjà garanti par l'ordre des `<script>`. 2 points d'appel externes (`genererClubJoueur`, `avancerSaison`) adaptés pour passer par `RMClub.*`.
- Suite complète relancée sans aucune régression, avec attention particulière aux tests "équipe B" de `test-parcours-club.js` (exercent directement le vivier du centre de formation) et à la création de club de `test-audit-p0-3.js` : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 91/91, `test-audit-p0-3.js` 8/8.

**Tranche 11 — Composition et tactique.** `tactiqueVersConfig`, `effectifVersJoueursCfg`, `compositionVersJoueursCfg`, `meilleurCandidatPourNumero`, `meilleureComposition`, `completerComposition`, `validerComposition`, `POSTE_REQUIS_BANC`, `completerCompositionBanc`, `numeroDuJoueurDansComposition`, `autoDesignerEncadrement` déplacés vers un nouveau `docs/js/club-composition.js`. Le domaine le plus autonome à ce jour : aucun état de module (aucun compteur), toutes les dépendances externes (`AXES_TACTIQUE`, `POSTE_REQUIS`) déjà exportées de `club.js` et lues au moment de l'appel (pas au chargement), donc pas de contrainte d'ordre de `<script>` comme en tranche 10. Aucun point d'appel interne à `club.js` à adapter (déjà tous namespacés `RMClub.*` côté `clubUI.js`).
- Suite complète relancée sans aucune régression, avec attention particulière aux tests "polyvalence" de `test-parcours-club.js` (exercent directement `completerComposition`) : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 91/91, `test-audit-p0-3.js` 8/8.

**Tranche 12 — Condition physique des joueurs.** `appliquerFatigue`, `appliquerMoral`, `ENTRAINEMENTS`, `appliquerEntrainement`, `faireProgresserBlessures` déplacés vers un nouveau `docs/js/club-condition-joueurs.js` — appelés une fois par journée jouée, répercutés réellement sur les stats effectives transmises au moteur (cf. `compositionVersJoueursCfg`). Domaine autonome : aucun état de module, une seule dépendance externe (`ajouterMessage`, déjà exportée), appelée via `RMClub.*`. Aucun point d'appel interne à `club.js` à adapter.
- Suite complète relancée sans aucune régression, avec attention particulière à `test-audit-p0-3.js` (joue un match complet, exerce directement fatigue/moral/entraînement/blessures via `onResultat`) : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 91/91, `test-audit-p0-3.js` 8/8.

**Tranche 13 — Génération de club/pyramide.** `genererClub`, `budgetInitial`, `PALIERS_PYRAMIDE_FRANCE`, `nomPalierFrance`, `TAILLE_DIVISION_FRANCE`, `bandeNiveauPalier`, `niveauxAdversairesPourPalier` déplacés vers un nouveau `docs/js/club-pyramide.js`. **Dépendance cachée trouvée en analysant le domaine avant de couper** (même famille que `compteurPersonnelId` en tranche 1 et `compteurJoueurId` en tranche 8) : `genererClub` mutait directement `compteurId`, une variable de module de `club.js`. Corrigée avec la même méthode : nouvelle fonction dédiée `genererProchainIdClub()` exportée de `club.js`, appelée par le nouveau fichier au lieu d'une mutation directe impossible hors de sa fermeture (`genererClubJoueur`, resté dans `club.js`, continue de muter `compteurId` directement car il vit dans la même fermeture). 7 points d'appel externes adaptés pour passer par `RMClub.*` (`genererClubJoueur` pour `budgetInitial` ; `avancerSaison` pour `nomPalierFrance` ×2, `niveauxAdversairesPourPalier`, `genererClub`, `budgetInitial` ; `nouvelleSaison` pour `bandeNiveauPalier` ×2, `niveauxAdversairesPourPalier`, `genererClub`).
- Suite complète relancée sans aucune régression, avec attention particulière à `test-audit-p0-1.js` (id de club après rechargement — le scénario le plus sensible à `compteurId`/`genererProchainIdClub`) et à la carrière longue de `test-parcours-club.js` (12 saisons, reconstruit la pyramide d'adversaires à chaque saison via `nouvelleSaison`) : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 91/91, `test-audit-p0-3.js` 8/8.

**Tranche 14 — Calendrier et classement.** `genererCalendrier`, `classementInitial`, `enregistrerResultatDans`, `enregistrerResultat`, `classementTrieDe`, `classementTrie`, `prochainesFixtures`, `club` déplacés vers un nouveau `docs/js/club-calendrier.js`. Domaine autonome : aucun état de module (pas de compteur), contrairement aux tranches 1/8/13 — toutes les dépendances croisées vérifiées avant de couper, aucune surprise en migrant. Un seul point d'appel interne à `club.js` en dehors des fonctions qui restent liées (`avancerSaison`/`nouvelleSaison`, qui utilisaient déjà `genererCalendrier`/`classementInitial` en interne, adaptés pour passer par `RMClub.*`) : `club(saison, adversaireId)` dans `enregistrerResultatClubJoueur` (domaine "historique des confrontations", resté dans `club.js`), adapté en `global.RMClub.club(...)`.
- Tests (suite complète, aucune régression) : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 91/91, `test-audit-p0-3.js` 8/8.

**Tranche 15 — Sauvegarde et migration.** `sauvegarderSaison`, `idNumerique`, `saisonEstValide`, `migrerSaison`, `conserverSecours`, `consulterAvertissementChargement`, `effacerAvertissementChargement`, `chargerSaison`, `effacerSaison` déplacés vers un nouveau `docs/js/club-sauvegarde.js`. `resynchroniserCompteurs` (audit P0-1) est délibérément **restée** dans `club.js` : elle mute directement `compteurJoueurId`/`compteurMessageId`/`compteurId`, trois variables de module qui vivent dans la fermeture de `club.js` (nécessaires à `genererProchainIdJoueur`, `genererProchainIdClub` et `ajouterMessage`, tous restés là) — l'extraire aurait exigé 3 nouvelles fonctions dédiées de mutation pour un seul appelant (`chargerSaison`), plus de surface que de gain ; `chargerSaison` l'appelle donc via `global.RMClub.resynchroniserCompteurs(...)`. À l'inverse, `resynchroniserCompteurs` (restée) dépendait de `idNumerique` (déplacée) : adaptée pour l'appeler via `global.RMClub.idNumerique(...)`. `VERSION_SAUVEGARDE` (jusqu'ici interne à `club.js`, jamais exportée) exportée pour que `migrerSaison` (déplacée) puisse la lire. `CLE_CLUB` (devenue inutile dans `club.js`, plus aucune fonction restante ne s'en sert) supprimée plutôt que laissée morte.
- Tests (suite complète, aucune régression), avec attention particulière aux tests P0-1c/P0-1d (resynchronisation des compteurs message/personnel après rechargement) et à toute la suite P0-2 (sauvegarde/migration/secours), les scénarios les plus proches de ce changement : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 91/91, `test-audit-p0-3.js` 8/8.

**Domaines restants.** Tous les domaines de données de `club.js` identifiés en début de chantier sont maintenant extraits (`club.js` ne contient plus que les fonctions "cœur" partagées entre domaines : `ajouterMessage`, `resynchroniserCompteurs`, génération de noms/effectif de base, finances, `nouvelleSaison`/`avancerSaison` qui orchestrent tous les domaines). `clubUI.js` (rendu) n'a pas encore été commencé — chantier distinct, plus gros, à évaluer séparément avant de s'y lancer.

**Constat de risque spécifique à `clubUI.js` (évalué, découpage PAS commencé).** `clubUI.js` (2231 lignes, 83 fonctions) est aussi une seule fermeture `(function () {...})()`, mais SANS le paramètre `window` (contrairement à `club.js`) et surtout avec un état de module bien plus central : `let saison = RMClub.chargerSaison();` référencé **203 fois** dans le fichier (contre au plus une douzaine de références pour le plus utilisé des compteurs de `club.js`), plus `joueurAffiche`/`clubAdversaireAffiche`/`joueurAdversaireAfficheIndex`/`filtreEffectif` (45 références de plus) — quasiment CHAQUE fonction de rendu lit ou modifie `saison`. Découper par domaine à l'identique de `club.js` (déplacer des fonctions, exporter des accesseurs ponctuels pour les rares dépendances cachées) ne suffirait pas ici : la variable centrale elle-même devrait être accessible depuis les fichiers extraits, ce qui touche une fraction bien plus large du fichier que les tranches de `club.js`. **Recommandation avant toute tranche** : une étape préparatoire séparée, à comportement strictement inchangé, qui convertit les accès à `saison` (et aux 4 autres variables d'état) en un accesseur exporté (`obtenirSaison()`/`definirSaison(s)`...) utilisé partout dans le fichier — y compris par les fonctions qui resteront dans `clubUI.js` — AVANT de commencer à déplacer des fonctions vers des fichiers de domaine. Non fait ici : chantier de préparation à part entière, plus risqué qu'une simple tranche, à traiter dans une tâche dédiée plutôt que forcé dans la continuité de P2-10.

### P2-11. Tests statistiques sur plusieurs centaines de matchs (scores, essais, rucks, mêlées, touches, coups de pied, pénalités, possession, diversité)
- **Statut : CORRIGÉ (étendu — 500 matchs minimum, niveaux de club variés, turnovers, diversité des vainqueurs, médiane/distribution — voir entrée datée dans le journal ci-dessous)**
- Priorité : P2 (crédibilité de la simulation — cœur de la mission CLAUDE.md, priorité au-dessus de P2-10)
- Fichiers concernés : `server/test-stats-matchs.js`

**Méthode.** Nouveau fichier, moteur seul (`engine/rugby-engine.js`, sans passer par le Mode Club), 200 matchs complets de 80 minutes simulés (graines 1 à 200) — toutes les statistiques dérivent des accumulateurs RÉELS du moteur (`state.stats.A/B`, `state.statsJoueurs`, `state.possessionPct`), jamais fabriquées. Deux catégories d'assertions :
1. **Dures (font échouer le script)** : les critères de refus EXPLICITES de CLAUDE.md — essais/mêlées/touches jamais 0 en moyenne, ≥20 passes et ≥20 rucks par match, coups de pied présents, scores et essais qui varient réellement d'un match à l'autre (pas des clones), possession qui reste raisonnable (aucune équipe à ~95% sans raison), et — vérifié par la mesure, pas supposé — les avants qui ne jouent PAS comme les trois-quarts (passes et mètres gagnés par joueur nettement différents).
2. **Observation (avertissement seulement)** : comparaison aux repères réels indiqués par CLAUDE.md (points, essais, mêlées, touches, rucks, plaquages, coups de pied, pénalités) — CLAUDE.md le dit lui-même, "ces valeurs sont des repères, pas des règles fixes", donc n'échoue jamais le script.

**Constat majeur découvert en écrivant ce test.** L'outil de calibration déjà existant du dépôt (`server/simulate-batch.js`, avec ses propres fourchettes internes) montre un écart considérable par rapport à ses propres attentes : rucks/plaquages tentés/coups de pied/courses/passes sont 2 à 4× plus élevés qu'attendu, le temps de jeu effectif atteint 58 min sur 80 (73 %, très au-dessus des ~35-45 % réalistes), et les pénalités concédées sont trop BASSES. Vérifié que ce n'est pas une régression ponctuelle : **115 commits touchant `engine/rugby-engine.js`** ont eu lieu depuis la création de `simulate-batch.js` (refonte complète de la mêlée en machine à états, mise à l'échelle de la durée des rucks, etc.) — ses fourchettes n'ont simplement jamais été remises à jour après ces évolutions volontaires du moteur. Confirmé avec le nouveau test (200 matchs) : `points`/`essais`/`scrums`/`lineouts` restent dans les repères de CLAUDE.md, mais `rucks`, `tacklesAttempted`, `kicks` (trop hauts) et `penalitesConcedees` (trop bas) sortent nettement des repères.

**Pourquoi ce n'est pas traité comme un "refus de patch" ici.** Aucun des critères de refus EXPLICITES de CLAUDE.md n'est déclenché (voir assertions dures ci-dessus, toutes des planchers, jamais des plafonds) — le match est au contraire très riche en actions, pas "mort". L'écart concerne les REPÈRES d'ordre de grandeur réaliste, que CLAUDE.md qualifie lui-même de non contraignants. Recalibrer un moteur de 4900 lignes pour réduire drastiquement le rythme des rucks/plaquages/coups de pied SANS rien casser d'autre (tous les invariants et tests déjà en place) est un chantier à part entière, hors du périmètre d'un patch "écrire des tests" — traité séparément en P2-13 plutôt que tenté ici au risque d'une grosse refonte.

**Critères de validation.** `node server/test-stats-matchs.js` (200 matchs, ~7-8 min) : 12/12 assertions dures réussies. Avertissements de calibration affichés pour `rucks`/`tacklesAttempted`/`kicks`/`penalitesConcedees`, non bloquants et documentés ci-dessus.

### P2-13. Recalibrer le rythme du moteur de match (rucks/plaquages/coups de pied trop nombreux, pénalités trop rares) — EN COURS (découvert par P2-11)
- Statut : EN COURS (incrément 1 : offloads, incrément 2 : pénalités/turnovers au ruck, incrément 3 : entrées dans les 22 m, T7/T2 mesurés (résultats négatifs documentés), T2 formel mêlées/touches investigué, icônes/bannières d'événements manquantes corrigées — voir journal ci-dessous)
- Priorité : P2 (crédibilité de la simulation)
- Fichiers concernés : `engine/rugby-engine.js` **et** `docs/rugby-engine.js` (copie synchronisée à l'identique, cf. CI `deploy-pages.yml`), `server/simulate-batch.js` (fourchettes à remettre à jour une fois le moteur recalibré), `server/test-stats-matchs.js` (repères à resserrer une fois atteints)
- Constat : voir P2-11 ci-dessus. `rucks`/`tacklesAttempted`/`kicks` moyens par match sont 2 à 4× au-dessus des repères réalistes de CLAUDE.md, `penalitesConcedees` en dessous, et le temps de jeu effectif atteint 73 % de la durée du match (repère réaliste : 35-45 %) — probablement une cause commune (trop de temps compté comme "ballon vivant", cf. `tempsJeuEffectif` dans `engine/rugby-engine.js`) plutôt que 4 problèmes indépendants, à investiguer avant de toucher aux probabilités individuelles.
- **Découverte en démarrant ce chantier : un travail de calibration réel et documenté existe déjà**, `docs/ANALYSE_MATCH_REEL.md` (comparaison face à un vrai match Fr-Irl 2026), avec un plan T1-T7 par priorité. T1 (tempo du cycle ruck/plaquage/coup de pied) est déjà fait (rucks 853→519, plaquages 919→559 sur 20 matchs). Reste : T2 (temps mort/ballon en jeu 66% vs 44% réel — le plus gros levier restant), T3 (offloads, commencé ici), T4 (turnovers), T5 (pénalités, +40% visé), T6 (instrumenter les entrées dans les 22m), T7 (mètres gagnés, suit T1). La suite de ce chantier doit repartir de ce plan existant plutôt que d'en refaire un nouveau.
- **Piège trouvé et corrigé en cours de route :** `engine/rugby-engine.js` et `docs/rugby-engine.js` doivent rester STRICTEMENT identiques (la CI les resynchronise par `cp` avant chaque test/déploiement, cf. `.github/workflows/deploy-pages.yml`) — un premier essai n'avait modifié que `engine/`, ce qui aurait laissé le jeu réellement servi au joueur tourner sur l'ANCIEN taux malgré des tests locaux verts (les tests navigateur chargent `docs/rugby-engine.js`). Détecté par l'agent `arbitre-regles-rugby` dépêché après la modification, corrigé par une resynchronisation (`cp engine/rugby-engine.js docs/rugby-engine.js`) avant de committer. Réflexe à reproduire pour CHAQUE futur incrément de ce chantier.

### P2-12. Accessibilité et responsive (clavier, focus, Échap, tableaux petit écran, tiroir mobile, boutons toujours accessibles)
- Statut : CORRIGÉ
- Fichiers concernés : `docs/index.html`, `docs/js/clubUI.js`, `server/test-parcours-navigateur.js`

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

### P0-5 — Site publié différent du code source (main en retard) — CORRIGÉ (SYMPTÔME SEULEMENT, VOIR RÉCIDIVE PLUS BAS)
- Reproduit par comparaison réelle `main` vs `claude/readme-details-6aj3jt` : `main` en retard de 10 commits (ancêtre strict, aucune divergence), sans `docs/js/world.js` (Monde/Équipe B) ni les correctifs P0-1 à P0-4 — un simple push vers `main` aurait republié le site en arrière, sans aucun test (l'ancienne version non gardée du workflow était encore sur `main`).
- Corrigé, avec autorisation explicite de l'utilisateur, par un fast-forward de `main` vers `claude/readme-details-6aj3jt` (`59a9f7f` → `a92ec0f`, sans `--force` : refusé par git si ç'avait été autre chose qu'un fast-forward).
- Validation : `main` et la branche de travail strictement identiques après le push ; le déploiement déclenché sur `main` par ce push a lui-même exécuté avec succès le nouveau job `test` (garde-fou P0-4) avant `deploy` — run [30189945183](https://github.com/sebadiaz/Rugby.-Manager/actions/runs/30189945183).
- **Incomplet, avec le recul : ce correctif n'a traité que le symptôme (`main` en retard à cet instant précis), jamais la cause (`deploy-pages.yml` sans garde-fou sur `deploy`, déclenché sur push vers `main` ET `claude/readme-details-6aj3jt`).** Dès le commit suivant sur la branche de travail, le même problème est reparti à zéro. Voir l'entrée « RÉCIDIVE » ci-dessous pour le correctif structurel.

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

### P2-10 — Découpage de club.js par domaine, tranche 7 (Marché des transferts national) — EN COURS
- Nouveau `docs/js/club-transferts.js` : `genererJoueurLibre`, `genererMarcheTransferts`, `statsApparentes`, `estimationEtoiles`, `scouterJoueur`, `calculerPrimeSignature`, `signerJoueur`, `libererJoueur`, `basculerFavori`.
- Deux nouvelles aides génériques exportées de `club.js` (`genererJoueurEtendu`, `GABARIT_EFFECTIF`) ; `COUT_SCOUTING`/`SEUIL_CONNAISSANCE_COMPLETE` déplacées avec les fonctions (internes au nouveau fichier), `COUT_SCOUTING` réexporté depuis là car consommé par `clubUI.js`. 2 points d'appel externes (`avancerSaison`, `nouvelleSaison`) adaptés pour passer par `RMClub.genererMarcheTransferts`.
- Dépendance cachée identifiée AVANT de couper (analyse systématique, pas une surprise) : `approcherJoueurAdverse`/`convertirJoueurAdverseEnEffectifEtendu` (transfert international, même item de backlog à l'origine) mutent directement `compteurJoueurId` — délibérément laissés dans `club.js` plutôt que d'étendre le risque de cette tranche avec une nouvelle fonction de resynchronisation dédiée (comme `compteurPersonnelId` en tranche 1) ; traités comme sous-tranche future séparée.
- Tests (suite complète) : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 91/91 (signature/libération/scouting/favoris couverts), `test-audit-p0-3.js` 8/8.

### P2-10 — Découpage de club.js par domaine, tranche 8 (Transferts internationaux) — EN COURS
- Nouveau `docs/js/club-transferts-internationaux.js` : `calculerPrixDemandeAdverse`, `convertirJoueurAdverseEnEffectifEtendu`, `approcherJoueurAdverse` — la sous-tranche explicitement différée en tranche 7 à cause de sa dépendance à `compteurJoueurId`.
- Correctif appliqué exactement comme prévu (et comme en tranche 1 pour `compteurPersonnelId`) : nouvelle fonction `genererProchainIdJoueur()` exportée de `club.js` (`return 'j' + compteurJoueurId++;`), appelée par le nouveau fichier au lieu d'une mutation directe de la variable de module, désormais hors de sa fermeture. `genererJoueur` également exporté (génération immédiate d'un remplaçant dans l'effectif adverse après un transfert accepté).
- Tests (suite complète), avec attention particulière à P0-1 (identifiants après rechargement — le risque exact de cette tranche) et aux 3 scénarios `approcherJoueurAdverse` de `test-parcours-club.js` : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 91/91, `test-audit-p0-3.js` 8/8.

### P2-10 — Découpage de club.js par domaine, tranche 9 (Effectif étendu) — EN COURS
- Nouveau `docs/js/club-generation-joueurs.js` : `genererJoueurEtendu`, `genererEffectifEtendu` — le générateur du joueur du club (id stable, contrat, suivi de saison complet), distinct de `genererJoueur`/`genererEffectif` (numero-based, effectif adverse, restés dans `club.js`).
- Aucune nouvelle dépendance cachée à traiter : réutilise `genererProchainIdJoueur()` (déjà exportée depuis la tranche 8) pour l'attribution d'id. 5 aides génériques nouvellement exportées de `club.js` (`ARCHETYPE_PAR_POSTE`, `borneStat`, `borneAdresse`, `genererAttributsProfondeur`, `genererPotentiel`) car partagées avec `genererJoueur`/`genererJeune`, restés dans `club.js`. 2 points d'appel externes (`genererClubJoueur`, `avancerSaison`) adaptés pour passer par `RMClub.*`.
- Tests (suite complète), avec attention particulière à `test-audit-p0-3.js` (crée un vrai club, appelle directement `genererEffectifEtendu`) et à la carrière longue de `test-parcours-club.js` (12 saisons, renouvellement d'effectif via `avancerSaison`) : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 91/91, `test-audit-p0-3.js` 8/8.

### P2-10 — Découpage de club.js par domaine, tranche 10 (Centre de formation) — EN COURS
- Nouveau `docs/js/club-centre-formation.js` : `genererJeune`, `completerCentreFormation`, `genererCentreFormation`, `assurerCentreFormation`, `promouvoirJeune`, `progresserCentreFormation` — le vivier d'espoirs (16-18 ans), distinct de l'effectif professionnel.
- Dépendance à `compteurJoueurId` traitée exactement comme prévu (`RMClub.genererProchainIdJoueur()`, déjà exportée depuis la tranche 8) — aucune surprise. `QUOTA_CENTRE_FORMATION` (dérivé de `POSTE_REQUIS`, déjà exporté) calculé une fois au chargement du nouveau fichier plutôt qu'à chaque appel : nécessite que `club.js` soit chargé avant (déjà garanti par l'ordre des `<script>` dans `docs/index.html`, comme pour tous les domaines précédents). 2 points d'appel externes (`genererClubJoueur`, `avancerSaison`) adaptés pour passer par `RMClub.*`.
- Tests (suite complète), avec attention particulière aux tests "équipe B" de `test-parcours-club.js` (exercent directement le vivier) et à la création de club de `test-audit-p0-3.js` : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 91/91, `test-audit-p0-3.js` 8/8.

### P2-10 — Découpage de club.js par domaine, tranche 11 (Composition et tactique) — EN COURS
- Nouveau `docs/js/club-composition.js` : `tactiqueVersConfig`, `effectifVersJoueursCfg`, `compositionVersJoueursCfg`, `meilleurCandidatPourNumero`, `meilleureComposition`, `completerComposition`, `validerComposition`, `POSTE_REQUIS_BANC`, `completerCompositionBanc`, `numeroDuJoueurDansComposition`, `autoDesignerEncadrement`.
- Domaine le plus autonome à ce jour : aucun état de module (pas de compteur, pas de fermeture partagée). Toutes les dépendances externes (`AXES_TACTIQUE`, `POSTE_REQUIS`) déjà exportées de `club.js` et lues via `global.RMClub.*` À L'INTÉRIEUR des fonctions (pas au chargement du fichier) — contrairement à `QUOTA_CENTRE_FORMATION` en tranche 10, aucune contrainte d'ordre de `<script>` ici. Aucun point d'appel interne à `club.js` à adapter : tous les appelants externes (`clubUI.js`) passaient déjà par `RMClub.*`.
- Tests (suite complète), avec attention particulière aux tests "polyvalence" de `test-parcours-club.js` (exercent directement `completerComposition`) : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 91/91, `test-audit-p0-3.js` 8/8.

### P2-10 — Découpage de club.js par domaine, tranche 12 (Condition physique des joueurs) — EN COURS
- Nouveau `docs/js/club-condition-joueurs.js` : `appliquerFatigue`, `appliquerMoral`, `ENTRAINEMENTS`, `appliquerEntrainement`, `faireProgresserBlessures` — appelés une fois par journée jouée (cf. `clubUI.js`, `onResultat`), répercutés réellement sur les stats effectives transmises au moteur (`compositionVersJoueursCfg`).
- Domaine autonome : aucun état de module, une seule dépendance externe (`ajouterMessage`, déjà exportée), appelée via `RMClub.*`. `faireProgresserBlessures` n'était pas adjacent aux 3 autres fonctions dans `club.js` (séparé par les domaines finances/calendrier) — extraction en deux coupures dans le même nouveau fichier, comportement strictement inchangé. Aucun point d'appel interne à `club.js` à adapter.
- Tests (suite complète), avec attention particulière à `test-audit-p0-3.js` (joue un match complet, exerce directement les 4 fonctions via `onResultat`) : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 91/91, `test-audit-p0-3.js` 8/8.

### P2-10 — Découpage de club.js par domaine, tranche 13 (Génération de club/pyramide) — EN COURS
- Nouveau `docs/js/club-pyramide.js` : `genererClub`, `budgetInitial`, `PALIERS_PYRAMIDE_FRANCE`, `nomPalierFrance`, `TAILLE_DIVISION_FRANCE`, `bandeNiveauPalier`, `niveauxAdversairesPourPalier`.
- **Dépendance croisée cachée trouvée en analysant le domaine avant de couper** (même famille que `compteurPersonnelId` en tranche 1 et `compteurJoueurId` en tranche 8) : `genererClub` mutait directement `compteurId`, une variable de module de `club.js` que le nouveau fichier ne peut pas atteindre une fois extrait. Corrigée avec la même méthode : nouvelle fonction dédiée `genererProchainIdClub()` exportée de `club.js`, appelée par `club-pyramide.js` au lieu d'une mutation directe. `genererClubJoueur`, resté dans `club.js`, continue de muter `compteurId` directement car il vit dans la même fermeture.
- 7 points d'appel externes adaptés pour passer par `RMClub.*` : `genererClubJoueur` (`budgetInitial`), `avancerSaison` (`nomPalierFrance` ×2, `niveauxAdversairesPourPalier`, `genererClub`, `budgetInitial`), `nouvelleSaison` (`bandeNiveauPalier` ×2, `niveauxAdversairesPourPalier`, `genererClub`).
- Tests (suite complète), avec attention particulière à `test-audit-p0-1.js` (id de club après rechargement, le scénario le plus sensible à `compteurId`/`genererProchainIdClub`) et à la carrière longue de `test-parcours-club.js` (12 saisons, reconstruit la pyramide d'adversaires à chaque saison via `nouvelleSaison`) : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 91/91, `test-audit-p0-3.js` 8/8.

### P2-10 — Découpage de club.js par domaine, tranche 14 (Calendrier et classement) — EN COURS
- Nouveau `docs/js/club-calendrier.js` : `genererCalendrier`, `classementInitial`, `enregistrerResultatDans`, `enregistrerResultat`, `classementTrieDe`, `classementTrie`, `prochainesFixtures`, `club`.
- Domaine autonome : aucun état de module (pas de compteur), contrairement aux tranches 1/8/13 — toutes les dépendances croisées vérifiées avant de couper (grep systématique de chaque nom de fonction dans club.js, clubUI.js et tous les club-*.js), aucune surprise en migrant.
- Un seul point d'appel interne à `club.js` en dehors des deux fonctions restées liées (`avancerSaison`/`nouvelleSaison`, qui utilisaient déjà `genererCalendrier`/`classementInitial`/`classementTrie` en interne, adaptés pour passer par `RMClub.*`) : `club(saison, adversaireId)` dans `enregistrerResultatClubJoueur` (domaine "historique des confrontations", resté dans `club.js`), adapté en `global.RMClub.club(...)`.
- Tests (suite complète), avec attention particulière aux tests de classement/calendrier de `test-parcours-club.js` et `test-monde.js` (qui exercent `genererCalendrier`/`enregistrerResultatDans` via le championnat principal et l'Équipe B) : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 91/91, `test-audit-p0-3.js` 8/8.

### P2-10 — Découpage de club.js par domaine, tranche 15 (Sauvegarde et migration) — EN COURS
- Nouveau `docs/js/club-sauvegarde.js` : `sauvegarderSaison`, `idNumerique`, `saisonEstValide`, `migrerSaison`, `conserverSecours`, `consulterAvertissementChargement`, `effacerAvertissementChargement`, `chargerSaison`, `effacerSaison`.
- **`resynchroniserCompteurs` (audit P0-1) délibérément restée dans `club.js`**, contrairement au reste du domaine : elle mute directement `compteurJoueurId`/`compteurMessageId`/`compteurId`, trois variables de module qui vivent dans la fermeture de `club.js` (nécessaires à `genererProchainIdJoueur`, `genererProchainIdClub` et `ajouterMessage`, tous restés là) — l'extraire aurait exigé 3 nouvelles fonctions dédiées de mutation pour un seul appelant (`chargerSaison`), plus de surface que de gain (même logique de décision que le report de `approcherJoueurAdverse` en tranche 7). `chargerSaison` l'appelle donc via `global.RMClub.resynchroniserCompteurs(...)`.
- Dépendance inverse : `resynchroniserCompteurs` (restée) utilisait `idNumerique` (déplacée) — adaptée pour l'appeler via `global.RMClub.idNumerique(...)`. `VERSION_SAUVEGARDE` (jamais exportée jusqu'ici) exportée de `club.js` pour que `migrerSaison` (déplacée) puisse la lire. `CLE_CLUB` supprimée de `club.js` (plus aucune fonction restante ne s'en sert).
- Tests (suite complète), avec attention particulière aux tests P0-1c/P0-1d (resynchronisation des compteurs message/personnel après rechargement) et à toute la suite P0-2 (sauvegarde/migration/secours) : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 91/91, `test-audit-p0-3.js` 8/8.
- Tous les domaines de données de `club.js` identifiés au démarrage de P2-10 sont désormais extraits ; `clubUI.js` reste à évaluer séparément.

### P2-11 — Tests statistiques sur plusieurs centaines de matchs — CORRIGÉ
- Nouveau `server/test-stats-matchs.js` : 200 matchs complets de 80 minutes simulés au moteur seul (`engine/rugby-engine.js`, graines 1 à 200), toutes les statistiques dérivées des accumulateurs réels du moteur (`stats.A/B`, `statsJoueurs`, `possessionPct`) — jamais fabriquées.
- 12 assertions dures correspondant aux critères de refus EXPLICITES de CLAUDE.md (essais/mêlées/touches/coups de pied jamais nuls en moyenne, ≥20 passes et ≥20 rucks par match, scores/essais qui varient réellement d'un match à l'autre, aucune équipe à ~95% de possession sans raison, avants et trois-quarts qui jouent réellement différemment — prouvé par les passes et mètres gagnés par joueur, seuls différenciateurs à marge large trouvés empiriquement). Comparaison complémentaire aux repères réalistes de CLAUDE.md (points, essais, mêlées, touches, rucks, plaquages, coups de pied, pénalités) en avertissement seul, jamais bloquante (CLAUDE.md : "ces valeurs sont des repères, pas des règles fixes").
- Constat majeur découvert en écrivant ce test : le moteur est très au-dessus des repères réalistes sur plusieurs catégories (rucks, plaquages tentés et coups de pied 2 à 4× trop élevés, temps de jeu effectif 73% d'un match au lieu de 35-45%) et en dessous sur les pénalités concédées. Confirmé non lié à une régression récente (115 commits ont fait évoluer `engine/rugby-engine.js` depuis la dernière calibration de l'outil `simulate-batch.js`, sans jamais remettre à jour ses fourchettes) et non couvert par un critère de refus explicite de CLAUDE.md (aucun plancher n'est franchi, le match est riche en actions, pas "mort") — documenté séparément et délibérément différé en P2-13 plutôt que traité ici, la recalibration du moteur étant un chantier propre bien plus large que "écrire un test".
- Tests : `server/test-stats-matchs.js` 12/12 assertions dures réussies sur 200 matchs (~7-8 min), avertissements de calibration affichés pour `rucks`/`tacklesAttempted`/`kicks`/`penalitesConcedees` (non bloquants, voir P2-13). Régression : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 86/86, `test-audit-p0-3.js` 8/8.

### P2-11 — Étendu à 500 matchs minimum, niveaux de club variés, turnovers, diversité des vainqueurs, médiane/distribution — CORRIGÉ
- **Constat de départ.** La version précédente de `server/test-stats-matchs.js` simulait 200 matchs (pas les 500 minimum demandés), toujours avec des effectifs symétriques par défaut (`DEFAULT_CONFIG`, aucune variation de niveau entre A et B) — impossible de mesurer la "diversité des vainqueurs" (CLAUDE.md, Rôle 6) sans niveaux différents à comparer. Seules moyennes calculées, aucune médiane ni distribution.
- **Corrigé** : `server/test-stats-matchs.js` charge maintenant `docs/js/club.js` + `docs/js/club-composition.js` (même génération que le vrai Mode Club — `RMClub.genererEffectif(rng, niveauClub)` puis `RMClub.effectifVersJoueursCfg(...)`, pas une génération ad hoc séparée). Chaque match tire indépendamment un `niveauClub` pour A et B dans `[0.15, 0.85]` — la fourchette réellement couverte par la pyramide française (Ligue Régionale à Ligue d'Excellence, cf. `docs/js/club-pyramide.js`, `bandeNiveauPalier`). Défaut relevé à 500 matchs (paramétrable, `node server/test-stats-matchs.js [n] [seedDépart]`).
- **Nouvelles statistiques suivies** : `turnovers` (absent de la version précédente), et pour CHAQUE statistique désormais moyenne **et** médiane **et** distribution simplifiée (percentiles P10/P90) — pas seulement une moyenne qui peut masquer des valeurs aberrantes, comme demandé.
- **3 nouvelles assertions dures pour la diversité des vainqueurs** (sur les matchs à écart de niveau réel, ≥0,03, pour ne pas diluer la mesure avec des affrontements quasi symétriques) : l'équipe du niveau le plus élevé doit gagner PLUS SOUVENT que l'inverse (le niveau doit peser) ; l'équipe du niveau le plus faible doit gagner AUSSI, au moins une fois (jamais déterministe) ; l'équipe forte ne doit pas gagner plus de 95 % du temps (le hasard du match doit rester réel). Plus une assertion dure `turnovers > 0`.
- **Résultat mesuré sur 500 matchs réels** (seeds 1-500, ~876 s de calcul) : **16/16 tests réussis**, dont les 3 nouveaux sur la diversité des vainqueurs — l'équipe du niveau le plus élevé gagne 87,3 % des matchs à écart de niveau réel (397/455), l'équipe la plus faible gagne quand même 11,6 % du temps (53/455), 1,1 % de nuls (5/455) : le niveau pèse nettement sur le résultat sans jamais le rendre certain — cohérent avec un vrai championnat où les surprises existent. Moyennes : essais 6,2, points 48,9, mêlées 21,2, touches 27,3, turnovers 17,4 — tous DANS les repères CLAUDE.md. Rucks (521,2), plaquages tentés (645,6), coups de pied (141,2) restent HORS repère (constat déjà documenté en P2-13, T2 non résolu — cohérent, pas une régression). **Nouvelle observation, pas encore documentée avant ce test** : pénalités concédées (11,4) légèrement SOUS le repère (12-30) avec des niveaux de club variés — contre 11,7-11,9 (dans le repère) sur l'ancien échantillon à effectifs symétriques ; écart faible (0,6 sous le seuil) et non bloquant (avertissement seulement, CLAUDE.md : "repères, pas des règles fixes") — noté pour un futur incrément de calibration (P2-13) plutôt que corrigé ici au risque de rouvrir un rééquilibrage déjà validé sur 200 matchs.
- Tests : `server/test-stats-matchs.js` 16/16 sur 500 matchs. Régression complète sans échec (fichiers non touchés par ce changement, aucune modification moteur) : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 92/92, `test-audit-p0-3.js` 8/8.

### P2-12 — Accessibilité clavier des fenêtres modales et des tableaux défilants — CORRIGÉ
- Constat : `docs/index.html` ne contenait qu'un seul attribut `aria-*` dans tout le fichier (`aria-live` sur les toasts) — les 3 fenêtres intégrées (P1-8, `#modalConfirmation`/`#modalMontant`/`#modalInfo`) n'avaient ni rôle ARIA ni piège de focus ni restauration du focus à la fermeture, une vraie régression d'accessibilité par rapport aux `window.confirm`/`prompt`/`alert` natifs qu'elles remplacent (qui gèrent ça automatiquement). Le tiroir de navigation mobile (fermeture Échap) et le bouton flottant "New Day" (toujours visible) étaient déjà couverts et corrects depuis P1-6, aucune action nécessaire sur ces deux points.
- Corrigé dans `docs/js/clubUI.js` par un bloc générique partagé (`ouvrirModaleAccessible`/`fermerModaleAccessible`/`elementsFocusables`/`modaleOuverteActuelle`) : mémorise l'élément qui avait le focus avant l'ouverture, focalise automatiquement le premier élément focalisable de la fenêtre à l'ouverture (ou un focus personnalisé, ex. le champ de saisie du montant), restaure le focus sur l'élément déclencheur à la fermeture. Le gestionnaire clavier existant (Échap) reçoit une branche `Tab` qui piège le focus dans la fenêtre ouverte (cycle Tab/Shift+Tab confiné, jamais d'évasion vers le fond assombri).
- `docs/index.html` : ajout de `role="dialog"`/`aria-modal="true"`/`aria-describedby` (+ `aria-labelledby` pour `modalInfo`) sur les 3 fenêtres ; ajout de `tabindex="0"`/`role="region"`/`aria-label` sur les 4 conteneurs de tableaux à défilement horizontal sur petit écran (`#clubEffectif`, `#clubClassement`, `#clubAutresClubsListe`, `#clubAutresClubEffectif`) — sans ça, un utilisateur clavier seul n'avait aucun moyen de faire défiler ces tableaux tronqués sur mobile.
- Nouvelles preuves dans `server/test-parcours-navigateur.js` (pas seulement "aucune régression") : rôle ARIA présent, focus initial dans la fenêtre à l'ouverture, Tab qui boucle sans s'échapper de la fenêtre, focus restauré sur le bouton déclencheur après fermeture.
- Tests : `server/test-parcours-navigateur.js` 91/91 (86+5, dont les 5 nouvelles preuves d'accessibilité). Régression : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-audit-p0-3.js` 8/8.

### P2-13 — Recalibrage du moteur, incrément 1 (offloads en percée) — EN COURS
- Reprend le plan déjà documenté dans `docs/ANALYSE_MATCH_REEL.md` (T3 : offloads) plutôt que d'en créer un nouveau. `tauxOffload` en situation de percée abaissé de 0,30 à 0,18 dans `engine/rugby-engine.js` (ligne ~1524) — seule la probabilité change, aucune nouvelle branche de logique, le filtre loi 11 (passe jamais vers l'avant) et le rayon d'offload restent intacts.
- Mesure propre AVANT/APRÈS sur le moteur actuel (donc déjà après T1) plutôt que de se fier au chiffre historique de `ANALYSE_MATCH_REEL.md` (48,7, mesuré avant T1) : 28,1 offloads/match avant ce changement, 22,0 après (30 puis 20 matchs, mêmes graines) — les deux DANS la fourchette visée (20-30), T1 ayant déjà mécaniquement réduit une bonne partie de l'excès en diminuant le nombre de contacts total. Amélioration réelle mais plus modeste que l'estimation initiale ; documenté avec exactitude plutôt que de survendre le résultat.
- **Piège détecté par l'agent `arbitre-regles-rugby`** (dépêché après la modification, conformément à la consigne CLAUDE.md de vérification systématique après tout changement moteur) : `docs/rugby-engine.js` n'avait pas été resynchronisé après la modification de `engine/rugby-engine.js` — or c'est `docs/rugby-engine.js` qui est réellement chargé par le jeu et par les tests navigateur. Corrigé par `cp engine/rugby-engine.js docs/rugby-engine.js` (les deux fichiers doivent rester strictement identiques, cf. `.github/workflows/deploy-pages.yml`). Sans cette vérification, le correctif n'aurait eu aucun effet sur le jeu réellement joué malgré des tests verts.
- Tests : `server/test-stats-matchs.js` 12/12 sur 200 matchs (aucune régression sur points/essais/scrums/lineouts, toujours dans les repères). Régression complète : `test-invariants.js` 12/12, `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-parcours-navigateur.js` 91/91, `test-audit-p0-3.js` 8/8.
- Reste à faire (voir plan complet dans la section P2-13 ci-dessus) : T2 (temps mort/ballon en jeu, le plus gros levier), T6 (entrées dans les 22m), T7 (mètres gagnés).

### P2-13 — Recalibrage du moteur, incrément 2 (T5 : pénalités au ruck — vrai bug corrigé, pas juste une tuile de repère) — EN COURS
- **Bug réel trouvé, pas seulement une calibration à ajuster.** `ruckTempsSansSoutien` (temps sans qu'aucun soutien d'attaque n'ait sécurisé le ballon au ruck — cf. le risque "porteur isolé" en loi 14, `not releasing the ball`) était incrémenté seulement quand `iSoutien === 0`, où `iSoutien` compte les joueurs de l'ensemble `soutiensRuck` — calculé à CHAQUE tick comme "les 3 coéquipiers les plus proches du ruck", **quelle que soit leur distance réelle** (même à 10-15 m, encore en train de courir). Cet ensemble n'est donc quasiment jamais vide : `iSoutien` était pratiquement toujours > 0 dès le premier tick d'un ruck. Vérifié par instrumentation directe (197 échantillons sur 15 matchs) : `ruckTempsSansSoutien` valait EXACTEMENT 0,00 dans 100 % des cas. Le risque "porteur isolé" (turnover accru, pénalité "ballon non rendu") n'existait donc JAMAIS en pratique, malgré un mécanisme entièrement écrit pour l'appliquer.
- **Corrigé** en réutilisant `soutienArrive` (variable déjà existante juste après dans la même fonction, ligne ~2866, qui teste une vraie distance au point de ruck — `distance(j, pt) < 2.5` — déjà utilisée ailleurs pour la durée de sortie du ruck) au lieu de `iSoutien`. `engine/rugby-engine.js` (fonction de résolution du ruck, ~ligne 2853-2985).
- **Effet de bord découvert et compensé** : `bonusIsolement` (dans la formule de probabilité de turnover) dépendait lui aussi de `ruckTempsSansSoutien`, donc était également TOUJOURS nul auparavant — le réactiver a fait grimper les turnovers de ~12,5/match (calibration historique faite sans jamais exercer ce bonus) à ~20/match, au-dessus du repère (12-18). Rééquilibré par balayage empirique mesuré (pas une supposition) : plafond de `bonusIsolement` abaissé de 0,12 à 0,03 (multiplicateur 0,08→0,02), base de `probaTurnover` abaissée de 0,025 à 0,012 (égale au plancher `Math.max` déjà présent), probabilité de la pénalité `PENALITE_RUCK_ISOLE` relevée de 0,12 à 0,5 (cette branche ne se déclenchait quasiment jamais, la condition qui la précède n'étant elle-même jamais vraie avant le correctif).
- **Résultat mesuré** (40 matchs, graines indépendantes du réglage, puis confirmé sur `test-stats-matchs.js` 200 matchs) : `penalitesConcedees` 5,7→11,7-11,9/match (repère CLAUDE.md 12-30 — quasiment atteint, documenté avec exactitude plutôt que d'arrondir au-dessus), `turnovers` ~12,5(mécanisme mort)→18,1/match (repère doc 12-18 — à la limite haute mais dans la fourchette), `essais` 5,5-5,8 et `points` 44,5-45,7 inchangés dans leur repère, `scrums`/`lineouts` inchangés.
- **Vérification de conformité** : agent `arbitre-regles-rugby` dépêché après le changement — verdict conforme (la faute "ballon non rendu" est une vraie infraction, loi 14 ; aucune interférence avec carton jaune/essai de pénalité ; `docs/rugby-engine.js` resynchronisé et vérifié identique). Risque signalé par l'agent : turnovers à 18,1 est à la limite haute du repère sur un échantillon de 40 matchs — confirmé acceptable sur l'échantillon complet de 200 matchs (`test-stats-matchs.js`, ci-dessous), pas de dérive supplémentaire observée.
- Tests : `server/test-stats-matchs.js` 12/12 sur 200 matchs. Régression complète : `test-invariants.js` 12/12, `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-parcours-navigateur.js` 91/91, `test-audit-p0-3.js` 8/8.
- Reste à faire (voir plan complet dans la section P2-13 ci-dessus) : T2 (temps mort/ballon en jeu, le plus gros levier restant sur rucks/plaquages/coups de pied), T6 (entrées dans les 22m), T7 (mètres gagnés).

### P2-13 — Recalibrage du moteur, incrément 3 (T6 : instrumenter les entrées dans les 22 m adverses) — EN COURS
- Nouvelle statistique réelle `entrees22` : comptée UNE FOIS par possession continue qui atteint les 22 m adverses (pas re-comptée à chaque tick ni à chaque phase/ruck tant que la possession ne change pas) — `engine/rugby-engine.js`, hook dans `tick()` juste après le calcul de l'occupation territoriale (même bloc "ballon vivant" que `tempsJeuEffectif`/`tempsOccupation`), suivi d'un flag par équipe réarmé au changement de `this.possession`.
- Objectif (cf. `docs/ANALYSE_MATCH_REEL.md`, T6) : disposer d'une métrique pour piloter un futur chantier "finition en zone rouge" — repère réel ~21 entrées/match, ~33% converties en essai.
- Vérifié sur un match complet (graine 42) : 15 et 11 entrées pour un total de 6 et 4 essais — taux de conversion 40%/36%, cohérent avec le repère réel (~33%).
- Affichage : nouvelle ligne "Entrées dans les 22 m" dans le panneau de statistiques du Match rapide (`docs/js/ui.js`, juste après "Essais"), vérifiée par capture d'écran (le joueur voit maintenant cette statistique, pas seulement le moteur qui la calcule). Documentée dans `docs/REGLES_RUGBY.md`.
- Complément (CLAUDE.md, priorité "affichage clair des événements") : l'entrée en zone rouge est aussi loguée comme un vrai événement de match (`this.log('ENTREE_22', ...)`), avec sa propre icône 🚩 dans `docs/js/constants.js` — visible en direct dans le fil d'événements du HUD, pas seulement dans le récapitulatif de fin de match.
- Tests : `server/test-invariants.js` 12/12, `server/test-parcours-club.js` 42/42, `server/test-monde.js` 14/14, `server/test-audit-p0-1.js` 4/4, `server/test-audit-p0-2.js` 6/6, `server/test-parcours-navigateur.js` 91/91, `server/test-audit-p0-3.js` 8/8.

### P2-13 — T7 mesuré (mètres gagnés) et T2 investigué (pas de changement de code, résultat négatif documenté)
- **T7 (mètres gagnés)** : mesuré à 5662 m/match (repère 800-1500) — confirmé purement dépendant du volume de courses (662 carries/match, réel 255), donc entièrement conditionné par T2, pas un levier indépendant. Rien à corriger séparément tant que T2 n'est pas traité.
- **T2 (temps mort / ballon en jeu) : tentative de levier supplémentaire, résultat négatif documenté plutôt que forcé.** Balayage de `defense.rampeMontee` (2,5 actuel → 3,5/4,5/5,5/7/9, 20 matchs par valeur) : les rucks/plaquages baissent bien de façon monotone (542→516→486→458→425→372), MAIS essais et points grimpent en parallèle et sortent des repères CLAUDE.md dès 5,5 (essais 9,7 > 8, points 70,3 à la limite de 70) et explosent à 9 (essais 17,3, points 113,8) — même à 4,5 (le point le plus haut encore acceptable), les rucks ne descendent qu'à 486, très loin du repère 70-180. **Conclusion : `rampeMontee` seul ne peut pas résoudre T2** sans casser le score déjà correctement calibré — confirme indépendamment le constat déjà écrit dans `docs/ANALYSE_MATCH_REEL.md` ("les leviers de tempo en jeu courant sont épuisés"). Aucun changement de code appliqué (le compromis n'est net positif sur aucune valeur testée) — recherche honnête, pas de calibration forcée pour "faire un score" de patch.
- **Ce qui reste à essayer pour T2** (pour la prochaine tranche, hors du périmètre d'un petit patch) : un NOUVEAU mécanisme de temps mort plutôt qu'un réglage de plus sur les mécanismes existants — ex. une brève pause de réorganisation après un turnover, un temps de récupération de ballon après un coup de pied qui sort en touche, ou une pause occasionnelle type "arrêt de jeu" (blessure/TMO) — nécessite une conception + un balayage propre à part entière (comme T1 en son temps : plusieurs dizaines de matchs, plusieurs variables croisées), pas une modification ponctuelle.
- Tests : aucune modification de fichier de production, uniquement des scripts de mesure jetables (non conservés). Aucune régression possible car aucun code n'a changé.

### P2-13 — T2 formel (équilibre mêlées/touches) mesuré : touches déjà dans le repère, mêlées investiguées, résultat négatif documenté
- **Contexte** : `docs/ANALYSE_MATCH_REEL.md` définit deux choses différentes sous le nom « T2 » — le texte de diagnostic (« ballon en jeu 66% ... c'est T2 (temps d'arrêt) ») et la tâche formelle plus bas (« T2 — Équilibre mêlées/touches », objectif mêlées 10-16 / touches 20-30). L'incrément précédent (rampeMontee) traitait le premier sens ; celui-ci mesure et investigue le second, avec sa propre méthodologie de mesure (log des événements réels, pas une estimation).
- **Mesuré sur 20 matchs (200 min de simulation)** : touches 24,2/match — **déjà dans le repère 20-30**, rien à corriger (la pénalité jouée en touche, `_accorderPenaliteTouche`, existait déjà et contribue ~2,3/match). Mêlées 20,6/match — au-dessus du repère 10-16 mais très en dessous de la valeur historique du document (23,6), donc déjà partiellement amélioré par les incréments précédents (T1/T5).
- **Répartition des sources de mêlée mesurée** (log réel des événements, pas une supposition) : passe en avant 8,8/match (43%), en-avant au contact 4,85/match (24%), passe ratée à la réception 4,05-4,2/match (20%), autres (mêlée sur relance/renvoi manqué...) ~2,75/match (13%).
- **Levier testé : tolérance de détection de la passe en avant** (`Referee.passeEnAvant`, actuellement 0,3 m). Balayage 0,3/0,6/1,0/1,5 m sur 20 matchs chacun : mêlées 20,6→19,9→19,8→18,4, passes en avant détectées 8,8→8,05→7,9→7,3. **Effet faible et non monotone de façon fiable** (gain total ~2,2 mêlées pour un quintuplement de la tolérance) — insuffisant pour atteindre 10-16, et élargir encore la tolérance risquerait de ne plus sanctionner de vraies passes en avant (exigence explicite CLAUDE.md : « une passe en avant doit être sanctionnée »). **Aucun changement de code appliqué** : le compromis n'est net positif sur aucune valeur testée, recherche honnête plutôt que calibration forcée.
- **Pourquoi les deux autres sources n'ont pas été retouchées** : le taux d'en-avant au contact (0,008) et le plancher de réussite de passe (0,94-0,999) sont déjà le résultat d'un calibrage documenté en commentaire dans `engine/rugby-engine.js` (visant explicitement le nombre absolu d'en-avants réels par match) — les réduire encore sans nouvelle mesure du réel risquerait de sur-corriger vers une simulation où les fautes de manipulation n'existent quasiment plus, contraire à la mission CLAUDE.md (les fautes doivent avoir des conséquences réelles, pas être maquillées pour un chiffre).
- **Conclusion** : la moitié du travail formel de T2 (touches) est déjà faite. L'autre moitié (mêlées, écart désormais modeste : 20,6 vs 10-16, pas 23,6 vs 8-25 comme au départ) n'a pas de levier isolé net positif trouvé cette fois — un vrai gain demanderait de revoir la logique de ciblage des passes (positionnement des soutiens par rapport au porteur), un chantier de conception plus large que ce petit patch, pas un simple réglage de seuil.
- Tests : aucune modification de fichier de production, uniquement des scripts de mesure jetables (non conservés). Aucune régression possible car aucun code n'a changé.

### P2-13 — Affichage clair des événements : icônes manquantes (avantage, coup de pied, offload, plaquage manqué, touche, combinaison) — CORRIGÉ
- **Constat** : `docs/js/ui.js` (ligne ~79) affiche `${ICONES[ev.type] || '•'} ${message}` dans le fil d'événements — tout type d'événement sans icône dédiée retombe sur un symbole générique '•', indifférenciable des autres. Comparaison de tous les types réellement émis par `this.log(...)` dans `engine/rugby-engine.js` avec les clés de `ICONES` (`docs/js/constants.js`) : 10 types réels sans icône — `AVANTAGE`, `AVANTAGE_JOUE`, `AVANTAGE_REVIENT` (loi 7), `COUP_DE_PIED`, `OFFLOAD`, `PLAQUAGE_MANQUE`, `TOUCHE_LANCER`, `TOUCHE_BALLON_GAGNE`, `RUCK_SORTIE_9`, `COMBINAISON`.
- **Corrigé** : 10 icônes ajoutées à `ICONES` (`docs/js/constants.js`), chacune correspondant à un événement réel confirmé par grep (aucune icône « décorative » sans événement derrière). `AVANTAGE` et `AVANTAGE_REVIENT` ajoutés aussi à `TYPES_BANNIERE` : la loi de l'avantage (CLAUDE.md : « l'avantage doit exister après certaines fautes ») existait déjà dans le moteur (`_jouerAvantage`/`_tickAvantage`) mais restait invisible au joueur faute de bannière — désormais l'octroi de l'avantage et le retour à la pénalité (les deux moments qui changent réellement la situation) sont mis en évidence ; `AVANTAGE_JOUE` (l'avantage a marché, le jeu continue normalement) reste sans bannière car il ne fait que confirmer ce que le joueur voit déjà se dérouler.
- **Dépêché `arbitre-regles-rugby`** (conformément à CLAUDE.md, tout changement touchant la visibilité d'une règle) : verdict CONFORME. A trouvé un écart préexistant (pas introduit par ce patch, mais dupliqué par lui) : le moteur cite « loi 8 » pour l'avantage à 4 endroits alors que le texte World Rugby place l'avantage en **loi 7** (loi 8 = Scoring/marquage des points) — mes 2 nouveaux commentaires reprenaient la même erreur. Corrigé aux 6 endroits (`engine/rugby-engine.js` lignes 630, 1122, 2772, 4752 ; `docs/js/constants.js` lignes 31, 85) — uniquement des commentaires, aucun changement de comportement. `docs/rugby-engine.js` resynchronisé (`cp` + `diff` silencieux) après cette correction du moteur.
- Tests : `test-invariants.js` 12/12, `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-parcours-navigateur.js` 91/91, `test-audit-p0-3.js` 8/8. Vérification directe (Node) que les 10 clés `ICONES` résolvent bien vers leur emoji au lieu du bullet générique.

### P0-5 — RÉCIDIVE : cause racine du déploiement non fiable enfin corrigée dans le workflow — CORRIGÉ (preuve complète sur le site public obtenue)
- **Reproduction (avant correctif)** : `curl -sS -o /dev/null -w "%{http_code}" https://sebadiaz.github.io/Rugby.-Manager/version.json` → **404**. Aucun identifiant de version n'existe sur le site public : impossible de savoir avec certitude quel commit y est réellement déployé sans consulter l'historique des runs GitHub Actions à la main.
- **Cause exacte trouvée** (API GitHub Actions, `list_workflow_runs` sur `deploy-pages.yml`) : sur les 30 runs les plus récents, **29 proviennent de `claude/readme-details-6aj3jt`** (branche de session Claude, jamais fusionnée dans `main`) et **1 seul de `main`** (`a92ec0f`, le fast-forward du correctif précédent, il y a plus de 14 h). `.github/workflows/deploy-pages.yml` déclenchait le déploiement sur `push` vers `main` ET `claude/readme-details-6aj3jt`, et le job `deploy` n'avait **aucune condition** le restreignant à `main` : chaque push sur la branche de travail (~20 depuis le fast-forward précédent) a donc republié directement le site public, sans jamais toucher `main`. `origin/main` reste au commit `a92ec0f`, strictement identique à son état d'il y a 14 h.
- **Corrigé** dans `.github/workflows/deploy-pages.yml` :
  - `on.push.branches` : `claude/readme-details-6aj3jt` (nom en dur) remplacé par le motif générique `claude/**` — les branches de session peuvent toujours déclencher le job `test` (retour rapide), mais plus jamais nommément liées au déploiement.
  - Job `deploy` : ajout de `if: github.ref == 'refs/heads/main'` — condition EXPLICITE, filet de sécurité même si le déclencheur changeait par erreur un jour. Ajout d'un `outputs.page_url` pour que le nouveau job `verify` (ci-dessous) puisse cibler la vraie URL publique.
  - `concurrency.cancel-in-progress` : `false` → `true` — un nouveau push sur `main` annule désormais un déploiement encore en cours plutôt que de risquer qu'il se termine APRÈS et écrase un déploiement plus récent avec un contenu plus ancien.
  - Nouvelle étape dans `deploy`, avant `upload-pages-artifact` : génère `docs/version.json` (`{"commit","ref","deployedAt"}`) à partir de `github.sha`/`github.ref_name`/l'heure UTC — identifiant de version demandé par la tâche, généré automatiquement à chaque déploiement.
  - Nouveau job `verify` (`needs: deploy`, `if: github.ref == 'refs/heads/main'`) : attend que le site public réponde puis exécute `node server/test-deploy-public.js <page_url> --expect-commit <sha>` contre la VRAIE URL publique.
- **Nouveau `server/test-deploy-public.js`** : vérifie sur une URL publique réelle (paramètre, défaut `https://sebadiaz.github.io/Rugby.-Manager/`) la présence des onglets Équipe B et Monde, la présence et validité de `version.json` (avec correspondance exacte au commit attendu si `--expect-commit` est fourni), et que tous les `<script src>` référencés par `index.html` (25 fichiers, liste extraite dynamiquement du HTML, pas codée en dur) répondent HTTP 200 avec un contenu non trivial. Exécuté contre le site public AVANT correctif : échoue sur `version.json` (404, preuve exacte du manque) ; les onglets et scripts passaient déjà (le site sert du contenu réel, juste pas celui de `main`).
- **Version affichée discrètement** : `docs/index.html` ajoute `#versionInfo` (coin bas-droit, `docs/css/style.css`), rempli par un script inline qui lit `version.json` (`fetch` + `.catch(() => {})`, silencieux si absent — jamais d'erreur en local ni sur une branche non déployée, vérifié via Playwright : 0 erreur console/page, `#versionInfo` reste vide comme attendu en local).
- **Preuve obtenue sur la vraie infrastructure GitHub Actions (pas seulement en local)**, run [30238499241](https://github.com/sebadiaz/Rugby.-Manager/actions/runs/30238499241) déclenché par le commit `b1c6b5a` (ce correctif, poussé sur `claude/readme-details-6aj3jt`) :
  - Job `test` : **completed / success** (toutes les étapes vertes, y compris les tests navigateur).
  - Job `deploy` : **completed / skipped** — la condition `if: github.ref == 'refs/heads/main'` a fonctionné : aucun déploiement déclenché depuis la branche de travail.
  - Job `verify` : **completed / skipped** (dépend de `deploy`, jamais atteint).
  - Confirmé après coup : `curl -sS -o /dev/null -w "%{http_code}" https://sebadiaz.github.io/Rugby.-Manager/version.json` → toujours **404**, identique à avant ce push — preuve directe que le site public n'a PAS bougé suite à ce commit, contrairement à tous les push précédents sur cette branche.
- **La preuve complète sur le site public réel (P0-5 point 5 : "ne déclarer corrigé qu'après une preuve sur le site public") — OBTENUE.** Avec l'autorisation explicite de l'utilisateur (le site restait figé sur un ancien commit et ne montrait aucun des changements de la session), `main` avancé par fast-forward : `git fetch origin main claude/readme-details-6aj3jt`, `git merge-base --is-ancestor origin/main origin/claude/readme-details-6aj3jt` confirmé (ancêtre strict, aucune divergence), puis `git push origin claude/readme-details-6aj3jt:main` (sans `--force`, refusé par git sinon) : `main` passé de `a92ec0f` à `eb1022a`. Ce push a déclenché un run RÉEL sur `main` (run [30304025913](https://github.com/sebadiaz/Rugby.-Manager/actions/runs/30304025913)) :
  - Job `test` : succès (20:46:43 → 20:52:40).
  - Job `deploy` : succès (20:52:41 → 20:53:04) — `docs/version.json` généré et déployé.
  - Job `verify` : **succès** (20:53:05 → 20:53:31) — `server/test-deploy-public.js https://sebadiaz.github.io/Rugby.-Manager/ --expect-commit eb1022a...` a validé la vraie URL publique après déploiement.
  - **Confirmé indépendamment après coup** (en dehors de la CI, requêtes directes) : `curl https://sebadiaz.github.io/Rugby.-Manager/version.json` → `{"commit":"eb1022a6da09dfdec2237db030bcffa82b2d2a71","ref":"main","deployedAt":"2026-07-27T20:52:56Z"}` (commit exact, `ref` bien `main`) ; le HTML public contient le nouveau texte P1-10 ("Ligue Régionale (14 clubs...)", plus aucune trace de "6 clubs") ; `index.html` répond HTTP 200.
- Tests (régression complète, suite au changement de `docs/index.html`/`docs/css/style.css`, aucun fichier moteur touché) : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-parcours-navigateur.js` 91/91, `test-audit-p0-3.js` 8/8 (y compris la vérification explicite "aucune erreur console/page", qui filtre déjà les échecs de ressource 404 — comportement existant, pas modifié).

### P1-10 — Texte obsolète "championnat à 6 clubs" corrigé sur l'écran d'introduction du Mode Club — CORRIGÉ (occurrence unique)
- **Reproduction** : `docs/index.html`, carte `#clubCreation` (affichée AVANT la création d'un club, donc le tout premier texte descriptif que lit un joueur) — « championnat complet à 6 clubs (aller-retour) » — obsolète depuis l'ajout de la pyramide française (Ligue Régionale/Nationale/Excellence, 14 ou 16 clubs par palier, `docs/js/club-pyramide.js`), du Monde et de l'Équipe B. Une fois la carrière commencée, le palier réel est déjà affiché correctement dans l'entête (`RMClub.nomPalierFrance`) — seul ce texte statique d'avant-création n'avait jamais été mis à jour.
- **Corrigé** : paragraphe remplacé par un texte exact — division de départ (Ligue Régionale, 14 clubs, aller-retour), progression (Ligue Nationale puis Ligue d'Excellence selon le classement), compétitions mondiales, Équipe B (conditionnelle au budget).
- **Preuve qui échoue avant correctif, réussit après** : nouveau `server/test-textes-accueil.js`, 4 assertions sur le texte réel de `docs/index.html`. Confirmé par `git stash` : les 4 échouent sur l'ancien texte, passent sur le nouveau. Vérifié aussi visuellement (capture d'écran Playwright) : texte sur 3 lignes, aucun débordement de la carte.
- Occurrences volontairement non touchées (commentaires de code, jamais affichés au joueur) : `docs/js/world.js`, `docs/js/club-equipe-b.js`, `server/test-parcours-club.js`, `server/test-parcours-navigateur.js`.
- Tests : `test-textes-accueil.js` 4/4 (nouveau), régression complète sans échec : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-audit-p0-3.js` 8/8, `test-parcours-navigateur.js` 91/91.

### P1-10 — Audit accueil/boucle principale (déjà corrects) et correction d'un bug bloquant de double-clic — CORRIGÉ (2ᵉ tranche)
- **Audit visuel** (captures d'écran Playwright, sans code cassé nécessitant correction) : accueil (distinction Match rapide/Mode Club/reprise de carrière) et boucle principale (panneau "Aperçu du prochain match" : adversaire, domicile/extérieur explicite, composition, tactique, analyse adversaire ; écran de résultat : victoire/défaite, score, essais, possession) déjà conformes à la demande — aucun changement appliqué, pour ne pas modifier ce qui fonctionne déjà (cf. CLAUDE.md, "ne pas ajouter de changement inutile").
- **Bug réel trouvé en testant l'anti-double-action** (reproduction avec la même technique que le test "double clic signer" déjà existant — deux événements `click()` synchrones, sans repeinture entre les deux, le pire cas réel d'un double clic) : double-cliquer sur "Lancer le match" démarre DEUX simulations concurrentes qui se disputent l'état global unique (`match`/`configMatch`, `docs/js/main.js`, une seule instance à la fois, pas par appel) — **le jeu reste bloqué indéfiniment** sur un match Équipe B en arrière-plan (capture d'écran : "69:59 / 80:00", figé), sans erreur console, sans échappatoire sans recharger la page.
- **Corrigé** (`docs/js/clubUI.js`) : nouveau verrou de ré-entrée `journeeEnCours`. `lancerLaJournee()` ignore tout appel supplémentaire tant que la journée précédente n'est pas résolue (posé après la validation de composition pour ne pas rester bloqué si celle-ci échoue ; relâché dans `onResultat`, dès que le résultat du match du joueur est enregistré ; relâché aussi dans le cas normalement impossible d'un calendrier à nombre impair de clubs, pour ne jamais laisser le verrou bloqué si `matchJoueur` est `null`). Nouvelle fonction `definirBoutonsJourneeActifs(actif)` désactive explicitement (`disabled`) les 3 boutons concernés (`btnJouerMatchClub`, `btnApercuMatchFlottant`, `btnApercuLancerMatch`) pendant la simulation — défense en profondeur en plus du verrou, répond littéralement à la demande "désactiver le bouton pendant la simulation".
- **Preuve avant/après** : reproduit le blocage AVANT correctif (capture d'écran), ré-exécuté le même scénario APRÈS correctif — la journée se déroule normalement (7 matchs joués en une seule fois, résultat affiché, 0 erreur JS).
- **Nouvelle couverture permanente** : `server/test-parcours-navigateur.js` — le clic simple sur "Lancer le match" (premier lancement de journée du parcours) remplacé par un double clic synchrone à ce même endroit, avec une assertion dédiée (une seule journée jouée : `+7` fixtures exactement) — le reste du parcours n'a pas eu besoin de changer, l'effet final du double clic étant désormais identique à un simple clic.
- Tests : `test-parcours-navigateur.js` 92/92 (91 existants + 1 nouveau), régression complète sans échec : `test-parcours-club.js` 42/42, `test-monde.js` 14/14, `test-audit-p0-1.js` 4/4, `test-audit-p0-2.js` 6/6, `test-invariants.js` 12/12, `test-audit-p0-3.js` 8/8.
- Reste à faire (P1-10, tranches suivantes) : auditer les doubles signatures/renouvellements (transferts, contrats) pour le même type de bug de ré-entrée.

### P1-10 — Audit doubles signatures/renouvellements : déjà protégés, aucun correctif nécessaire — VÉRIFIÉ (3ᵉ tranche)
- **Hypothèse à vérifier** : les flux passant par une fenêtre intégrée (`demanderMontant`/`confirmerAction`, P1-8) — négociation de contrat, offre de transfert international, prêt, libération, promotion, licenciement, effacer la saison — pourraient souffrir du même bug de ré-entrée que "Lancer le match" (P1-10, tranche 2) si on double-clique sur le bouton de validation À L'INTÉRIEUR de la fenêtre.
- **Vérifié empiriquement, pas seulement en lisant le code** : double/triple clic RÉEL (événements `click()` synchrones, sans repeinture entre les deux, même technique que les tests déjà écrits) sur `#modalMontantValider` (négociation de contrat) et sur `#modalConfirmationValider` (libérer un joueur), avec instrumentation du nombre d'appels réels aux fonctions de données (`RMClub.negocierRenouvellement`, `RMClub.libererJoueur`) : **exactement 1 appel dans les deux cas**, quel que soit le nombre de clics.
- **Pourquoi ça tient déjà** : `demanderMontant`/`confirmerAction` (`docs/js/clubUI.js`) utilisent chacune une SEULE variable de résolution partagée (`resoudreMontant`/`resoudreConfirmation`) et leurs fonctions de fermeture (`fermerMontant`/`fermerConfirmation`) commencent par `if (!modal.classList.contains('visible')) return;` — le premier clic ferme la fenêtre et résout la promesse SYNCHRONEMENT ; tout clic supplémentaire sur le même bouton trouve la fenêtre déjà fermée et ne fait rien. Ce n'est pas le même mécanisme que le verrou `journeeEnCours` (propre à `lancerLaJournee`), mais il protège structurellement TOUS les appelants de ces deux fenêtres partagées — aucun correctif nécessaire, un pour chaque flux aurait été redondant.
- **Différence avec le bug de "Lancer le match" corrigé en tranche 2** : ce bug-là ne passait PAS par une fenêtre `demanderMontant`/`confirmerAction` pour son geste final (`btnApercuLancerMatch` appelle `lancerLaJournee()` directement) et la duplication touchait un état global partagé (`match`/`configMatch` de `docs/js/main.js`, pas une simple donnée de saison) — un cas structurellement différent, qui restait donc non protégé par le mécanisme des fenêtres intégrées.
- Aucun fichier de production modifié : vérification uniquement, avec un script Playwright ad hoc (non conservé dans le dépôt, la protection existante étant confirmée suffisante par le résultat).
- **P1-10 (les trois tranches) est maintenant complet** : texte obsolète corrigé, accueil/boucle principale audités (déjà corrects), bug de double-clic corrigé, doubles signatures/renouvellements vérifiés déjà protégés.
---

## Tranche « Une semaine complète dans la peau du manager » (P1-35 → P1-38)

Demande utilisateur : « rendre la carrière fluide, compréhensible et
intéressante, pas d'ajouter encore des fonctionnalités isolées ».

**Méthode imposée et suivie :** une semaine réelle rejouée dans une carrière
neuve AVANT d'écrire du code, avec mesures dans un vrai navigateur (hauteurs
en pixels, nombre de cartes visibles, position de chaque zone) sur ordinateur
1280×1000 et mobile 390×844. Puis, pour chaque point : un test qui échoue
réellement, une correction limitée, toutes les suites existantes, un test
navigateur, et un commit séparé.

**Deux fausses pistes écartées avant d'être rapportées** — un désaccord
apparent d'adversaire entre deux cartes (c'étaient deux carrières
différentes) et `carteVueClubConsulte` supposée visible sur mobile
(`display:none` vérifié sur les deux tailles). Mesurer avant d'affirmer,
même quand la lecture du code semble concluante.

### P1-35. « Prochaine échéance » : la carte et le bouton doivent parler de la MÊME rencontre
- **Statut : CORRIGÉ**
- Priorité : P1 (parcours quotidien : étape 1 « voir immédiatement la date, la prochaine échéance et les décisions urgentes »)
- Fichiers concernés : `docs/js/club-agenda.js`, `docs/js/clubUI.js`, `docs/css/style.css`, tests

**Le défaut, mesuré.** La carte listait les **7 rencontres de la journée de
championnat** — six ne concernaient pas le joueur. 469 px de tableau de bord
consacrés aux matchs des autres, qui repoussaient hors écran ce que le
manager doit réellement faire.

**Le défaut aggravant.** La carte et le bouton « Continuer » appelaient
`prochainArret()` **séparément** : la carte annonçait la journée de
championnat pendant que le bouton visait un amical ou un tour de coupe plus
proche. Deux dates différentes sur le même écran.

**La correction.** Nouvelle `descriptionRencontre(saison, date, type)` dans
`club-agenda.js` : elle nomme l'adversaire, le lieu, la compétition et
l'équipe concernée à partir du calendrier réel, toutes compétitions
confondues. `prochainArret` la fusionne dans son retour. Côté UI, la carte
rend cette seule rencontre et **le bouton lit le MÊME objet** — la
divergence devient impossible par construction, pas seulement corrigée.

### P1-36. Une seule zone « À traiter » : les décisions ne doivent plus se cacher
- **Statut : CORRIGÉ**
- Priorité : P1 (parcours quotidien : étapes 1 et 2 « lire les messages et décider »)
- Fichiers concernés : `docs/js/club-a-traiter.js` (**nouveau**), `docs/js/club.js`, `docs/js/clubUI.js`, `docs/index.html`, `docs/css/style.css`, `server/charger-club.js`, tests

**Le défaut, mesuré.** Une **décision non tranchée** — ce qu'un manager doit
traiter en priorité — n'apparaissait **nulle part** dans les alertes. Elle
dormait dans la boîte de réception, mesurée à **1586 px de défilement sur
mobile**, avec 5 messages tous non lus et aucun signal sur le premier écran.
En parallèle, « Décisions & alertes » et « Boîte de réception » disaient des
choses de même nature à deux endroits, sans dire laquelle presse.

**La correction.** `club-a-traiter.js`, sans aucune dépendance au DOM,
produit **une** liste ordonnée dérivée de l'état réel. **Pas de second
système** : les décisions viennent de `saison.clubJoueur.messages`, seul
endroit où elles existent ; les alertes de l'effectif et des finances réels.

Quatre niveaux **portés par la donnée**, pas par l'affichage : `decision`,
`urgent`, `recommande`, `info`. La carte les rend avec un badge **en toutes
lettres** — le joueur n'a pas à déduire l'urgence d'une nuance de couleur.

`POSTE_COMPLET` remonte de `clubUI.js` vers `club.js` : la couche données en
a besoin, on ne la duplique pas.

### P1-37. Le tableau de bord doit être un écran « Aujourd'hui », pas un empilement de rappels
- **Statut : CORRIGÉ**
- Priorité : P1 (demande utilisateur : « éviter les cartes redondantes et les informations répétées »)
- Fichiers concernés : `docs/index.html`, `docs/js/clubUI.js`, tests

**Le défaut, mesuré sur une carrière neuve.** 10 cartes, **2853 px** sur
ordinateur, **3,6 écrans** sur mobile. Ce qu'il y a à FAIRE arrivait à
**1110 px** — hors écran. Trois cartes ne disaient rien qu'on ne lise déjà
ailleurs : le mini-classement (461 px) répétait la page Classement et la
barre du haut (« 9e /14 ») ; « Statut de l'effectif » listait blessés,
contrats et budget, tous présents dans « À traiter » ou dans la barre du
haut ; « 5 derniers résultats » occupait un bloc pour annoncer « Aucun match
joué pour le moment ».

**La correction.** Les deux premières sont retirées (avec leurs 9 appels),
la troisième se masque tant qu'il n'y a rien à montrer et revient au premier
résultat. Aucune donnée n'est perdue — un commentaire dans `index.html`
indique à chaque endroit où elle vit désormais. « À traiter » passe en
première carte.

**Résultat mesuré.** 7 cartes, **1926 px** sur ordinateur (1,93 écran),
**2064 px** sur mobile (2,45 écrans contre 3,6), « À traiter » à **145 px**
sur ordinateur et **164 px** sur mobile — visible sans défiler. Aucune
erreur console, aucun débordement horizontal.

### P1-38. Préparation : distinguer ce qu'on doit FAIRE de ce qu'on doit ATTENDRE
- **Statut : CORRIGÉ**
- Priorité : P1 (demande utilisateur : « afficher clairement ce qui est urgent, recommandé, terminé ou facultatif »)
- Fichiers concernés : `docs/js/club-jour-match.js`, `docs/js/clubUI.js`, `docs/css/style.css`, tests

**Le défaut, mesuré à J-21 d'une carrière neuve.** « 60 % de la préparation
bouclée », avec un **⬜ devant « Analyse de l'adversaire »** — exactement le
même symbole que devant « Tactique ». Or l'une demande 17 jours d'attente et
l'autre un seul clic. Le manager ne pouvait pas distinguer ce qu'il devait
faire de ce qu'il devait subir. Et le pourcentage lui comptait comme un
échec une chose impossible : tout ce qui était réglable l'était déjà.

**La correction.** Chaque point porte une `nature` dérivée de l'état réel :
`termine`, `urgent`, `recommande`, `facultatif`, `enAttente`.

- L'analyse hors délai est **en attente**, pas « non préparée » : elle sort
  du dénominateur du pourcentage et s'affiche en retrait.
- Une **composition incomplète** est urgente : le seul point qui compromet
  vraiment la rencontre.
- Un **banc incomplet** ou des titulaires diminués sont recommandés.
- La **tactique au réglage neutre** est facultative. Le code le disait déjà
  en commentaire (« ce n'est pas un mauvais choix ») ; l'affichage le dit
  enfin aussi.

`statut` est **conservé tel quel** — extension additive, les consommateurs
existants fonctionnent sans modification (même principe que `parCompetition`
et le `groupe`/`banc` des clubs adverses).

**Après :** « 75 % de ce qui est réglable aujourd'hui (3/4) · 1 point(s) en
attente », avec un badge FAIT / URGENT / RECOMMANDÉ / FACULTATIF / EN
ATTENTE sur chaque ligne.

**Un test existant mis à jour, à raison.** L'assertion sur `pretPct`
comparait au ratio sur *tous* les points ; elle porte désormais sur les
seuls points réglables. Ce n'est pas un test affaibli pour faire passer le
patch : c'est l'ancienne définition du pourcentage qui était le défaut.

### P1-39. La préparation doit décrire l'équipe qui joue, pas toujours le premier XV
- **Statut : CORRIGÉ**
- Priorité : P1 (suite directe de P1-38, identifiée comme la prochaine étape)
- Fichiers concernés : `docs/js/club-jour-match.js`, `docs/js/clubUI.js`, tests

**Le manque.** Le sélecteur d'équipe (tranche 4) fait bien basculer
Composition et Tactique sur l'Équipe B et les Espoirs, mais
`etatPreparationMatch` appelait `assurerCompositionPourEquipe(saison, 'pro')`
**en dur** et `prochaineRencontre` ne lisait que `saison.calendrier`. Un
manager qui prépare un match d'Équipe B n'avait aucune carte de préparation.

**Le défaut trouvé en le mesurant, pas en lisant le code.** Le jour d'un
match d'Équipe B, les deux cartes du **même écran** annonçaient deux
rencontres différentes :

    Prochaine échéance   : MATCH DE L'ÉQUIPE B / Castelnau Étoiles / aujourd'hui
    Préparation du match : Riverange Taureaux · samedi 7 septembre 2024 (dans -1 jours)

C'est exactement la classe de bug corrigée en P1-35, une carte plus bas sur
le même écran — et elle exhibait en prime un **compte à rebours négatif**.

**Les deux corrections.**

1. `prochaineRencontre(saison, equipe)` et `etatPreparationMatch(saison,
   equipe)` sont paramétrées par équipe, `'pro'` par défaut : tous les
   appelants historiques fonctionnent sans modification. Chaque équipe lit
   SON calendrier (`saison.calendrier`, `saison.competitionB.calendrier`,
   championnat espoirs) et SON effectif via `effectifPourEquipe` — aucune
   source nouvelle, aucun écran parallèle.
2. `!f.joue` ne suffisait pas : une rencontre non jouée peut être
   **derrière** nous (journée sautée). Une prochaine rencontre est désormais,
   au plus tôt, aujourd'hui — d'où la disparition du « dans -1 jours ».

Côté UI, la carte lit `prochainArret()` — **la même source que la carte
« Prochaine échéance »** — et en déduit l'équipe via `equipePourArret`
(coupes et amicaux se jouent avec le premier XV). L'accord entre les deux
cartes est donc acquis par construction, pas rétabli au cas par cas. Le
titre nomme l'équipe préparée : « 🧭 Préparation — Équipe B ».

**Vérifié dans le navigateur, sur les deux tailles.** Le jour du match
d'Équipe B : « Préparation — Équipe B / Castelnau Dragons · à domicile ·
dimanche 8 septembre 2024 (aujourd'hui) », identique à l'échéance. Le banc
y ressort en RECOMMANDÉ (« 1 remplaçant sur 8 ») — l'effectif B est plus
court, et la carte le dit au lieu de le masquer.

### Ce qui reste ouvert
- **Le parcours « préparer l'adversaire » reste réparti sur deux écrans** (la
  carte Prochain adversaire du tableau de bord et l'aperçu d'avant-match) :
  fusionner les deux demanderait de retoucher l'aperçu, hors périmètre ici.
- **La boîte de réception reste 🟡** : une seule catégorie de message porte
  une vraie décision (temps de jeu). Les autres restent informatifs.
- **L'analyse de l'adversaire est la même pour les trois équipes** : le délai
  de l'analyste ne distingue pas un adversaire de championnat d'une académie
  espoirs. Correct fonctionnellement, mais grossier.

---

## Tranche « Centre médical 2.0 et reprise progressive » (P1-40)

Demande utilisateur : remplacer le compteur `blessureJournees` par de vraies
blessures persistantes, avec un risque qui dépend réellement du joueur et un
parcours de reprise en cinq étapes. **Sans créer d'écran parallèle** : on
améliore l'onglet Médical existant et on réutilise fatigue, entraînement,
personnel, composition, messages et « À traiter ».

### État actuel constaté dans le code (étape 1)

`j.blessureJournees` est un **entier nu**, utilisé à 77 endroits dans 15
fichiers de production. Il ne porte ni type, ni zone, ni gravité, ni date, ni
cause, ni risque de rechute, ni état de récupération.

**Défaut 1 — le risque de blessure ne dépend de presque rien.**
`faireProgresserBlessures` (club-condition-joueurs.js:118) tire un `rng() < 0.06`
**plat** pour chaque titulaire : un pilier de 34 ans cuit à 95 de fatigue et
un ailier de 21 ans frais ont exactement la même probabilité. Ni le poste, ni
l'âge, ni la fatigue, ni les antécédents n'entrent en compte. Seul
l'entraînement (`blessuresDeSeance`) tient compte de la fatigue et de
l'intensité.

**Défaut 2 — la durée est un simple tirage divisé par le médecin.**
`Math.max(2, Math.round((7 + rng() * 22) / facteurMedecin))` : 7 à 28 jours.
Aucune notion de gravité ; le diagnostic est exact et immédiat, donc le
médecin ne sert qu'à raccourcir, jamais à mieux voir.

**Défaut 3 — les quatre types de match ne se comportent PAS pareil.**
Mesuré dans clubUI.js :

| Match | fatigue | blessures | facteur préparateur |
|---|---|---|---|
| Championnat (1er XV) | oui | oui | oui |
| Coupe (l. 2902) | oui | oui | **non** |
| Amical (l. 2963) | oui | oui | **non** |
| **Équipe B** (l. 3245) | **NON** | **NON** | — |
| **Espoirs** (l. 3317) | +15 fixe | **NON** | — |

Un joueur peut donc disputer **toute la saison avec la réserve sans jamais
fatiguer ni se blesser**. C'est le manquement le plus grave, et il contredit
directement l'exigence de comportement identique entre les trois équipes.

**Défaut 4 — le retour est instantané et à pleine puissance.**
`soignerBlessuresDuJour` décrémente le compteur ; à zéro le joueur est
immédiatement sélectionnable, avec ses statistiques intactes. Aucune reprise,
aucun risque de rechute, aucun antécédent conservé.

**Défaut 5 — l'onglet Médical n'affiche qu'une ligne par blessé.**
`rafraichirMedical` (clubUI.js:1492) : nom, poste, « Retour dans N jour(s) ».
Aucune décision possible depuis cet écran.

### Choix technique retenu

`j.blessure` (objet riche) devient **la seule source de vérité**.
`j.blessureJournees` est conservé comme **miroir DÉRIVÉ**, écrit par une
unique fonction (`synchroniserBlessure`) et par personne d'autre : les 77
sites de lecture existants continuent de fonctionner sans modification, et
il n'existe toujours qu'un seul endroit qui *décide* de l'état médical.
Réécrire les 77 sites serait une refonte massive à risque de régression, ce
que CLAUDE.md proscrit explicitement.

### Fichiers concernés

- `docs/js/club-medical.js` (**nouveau**) — modèle, tirage, diagnostic, reprise
- `docs/js/club-condition-joueurs.js` — `faireProgresserBlessures` délègue
- `docs/js/club-semaine-entrainement.js` — `blessuresDeSeance` délègue
- `docs/js/club-evenements.js` — guérison quotidienne + progression de reprise
- `docs/js/club-composition.js` — malus de reprise transmis au moteur
- `docs/js/club-sauvegarde.js` — migration v4 → v5
- `docs/js/club.js` — `VERSION_SAUVEGARDE`, création des joueurs
- `docs/js/club-espoirs.js`, `docs/js/clubUI.js` — unification des 4 chemins
- `docs/js/club-a-traiter.js` — alertes médicales réelles
- `docs/index.html`, `docs/css/style.css`, `server/charger-club.js`, tests

### Critères de validation

1. Une blessure a un diagnostic **stable après rechargement** (durée réelle
   tirée une fois, jamais re-tirée à l'affichage).
2. Deux blessures différentes ne donnent pas toujours la même durée.
3. Un joueur **fatigué se blesse davantage** qu'un joueur frais — mesuré sur
   un grand nombre de tirages, pas affirmé.
4. Le médecin **réduit réellement** l'indisponibilité et **resserre**
   la fourchette du diagnostic.
5. Le préparateur réduit réellement le risque de blessure et de rechute.
6. Une reprise anticipée **augmente réellement** le risque de rechute.
7. Un joueur en reprise joue avec un **malus mesurable** transmis au moteur.
8. Le retour progressif peut passer par l'Équipe B ou les Espoirs.
9. Les anciennes sauvegardes (v4) restent chargeables.
10. **Aucun nouvel écran médical** n'est créé.
11. Les quatre types de match appliquent fatigue ET blessures.
12. Toutes les suites de tests restent vertes.

### Résultat mesuré (étapes 4 à 8)

**Risque de blessure — blessures par match, XV titulaire :**

| Situation | Avant (modèle plat) | Après |
|---|---|---|
| Effectif frais (fatigue 0) | 0,900 | **0,615** |
| Effectif normal (fatigue 40) | 0,900 | **0,999** |
| Effectif cuit (fatigue 90) | 0,900 | **1,433** |

Le cas typique retrouve exactement le niveau d'avant ; l'écart frais/cuit
vaut désormais **2,3×**, là où il était rigoureusement nul. Le calibrage a
été obtenu PAR MESURE : une première tentative multipliait le risque
d'entraînement par 55 et produisait 6 messages parasites — corrigé après
mesure, pas après coup.

Entraînement : **8,8 blessures par saison**, dans la bande 7-10 mesurée en
P1-26. Durées : médiane 15 j, étendue 3 à 59 j, six types réellement tirés.

**Parcours de reprise, vérifié jour par jour sur une commotion de 25 j :**

```
j+ 0  soins
j+25  entraînement individuel réduit   rendement 72 %   injouable
j+31  reprise collective, sans match   rendement 82 %   injouable
j+36  temps de jeu limité              rendement 90 %   Équipe B / Espoirs SEULEMENT
j+40  retour complet                   rendement 96 %   sélectionnable partout
j+43  rétabli, antécédent conservé
```

**Rechute — conséquence réelle de l'accélération, sur 5 000 cas simulés
avec un match par semaine pendant la reprise :**

| Retour | Rechute pendant la reprise |
|---|---|
| Normal | **6,8 %** |
| Accéléré deux fois | **9,3 %** (×1,37) |

Une première mesure faisait jouer un match CHAQUE JOUR de la reprise et
donnait 70,9 % contre 82,6 % : chiffres saturés et irréalistes, écartés.
Le rythme d'un match hebdomadaire est le seul honnête ici.

**Migration v4 → v5** : un compteur nu de 11 jours devient un dossier dont
l'indisponibilité restante vaut exactement 11 jours. Aucun joueur soigné ni
blessé par la migration.

### Les 12 critères de validation

1. ✅ Diagnostic stable après rechargement — `joursReels` tiré une fois.
2. ✅ Durées variées — médiane 15 j, étendue 3 à 59 j, 6 types.
3. ✅ Joueur fatigué plus exposé — 0,615 → 1,433 (×2,3).
4. ✅ Médecin : raccourcit ET resserre le diagnostic (deux assertions).
5. ✅ Préparateur : réduit risque et rechute (test dédié).
6. ✅ Reprise anticipée : risque de rechute ×2,2, vérifié en navigateur.
7. ✅ Malus mesurable — vitesse et plaquage transmis au moteur multipliés.
8. ✅ Retour possible par l'Équipe B ou les Espoirs — palier dédié.
9. ✅ Sauvegardes v4 chargeables — migration testée.
10. ✅ Aucun écran médical séparé — l'onglet existant est enrichi.
11. ✅ Les cinq chemins de match appliquent fatigue ET blessures.
12. ✅ Toutes les suites vertes : 222 données, 298 navigateur, 7 autres.

### Limites restantes, assumées

- **Les effectifs adverses n'ont pas de dossier médical** : ils gardent un
  compteur nu (24 joueurs × 14 clubs, sauvegarde déjà proche du mégaoctet).
  Un repli documenté empêche toute contradiction d'affichage.
- **Le moteur de match n'a pas été modifié** : le malus de reprise passe par
  `compositionVersJoueursCfg` (vitesse et plaquage), comme la fatigue et le
  moral. Une blessure ne peut donc pas survenir PENDANT un match, seulement
  être tirée à la fin — limite héritée de l'architecture (le match est
  simulé en entier avant d'être regardé, cf. tranche 3).
- **La gravité ne module pas encore le type de reprise** : une commotion et
  une fracture de gravité 3 suivent le même parcours en cinq étapes, aux
  durées près. Un protocole commotion distinct serait la suite naturelle.
- **Le préparateur physique ne réduit pas la durée de la reprise**, seulement
  le risque de blessure et de rechute.

### P1-41. Une seule vue « Préparer le match »
- **Statut : CORRIGÉ**
- Priorité : P1 (demande utilisateur : « créer un parcours de préparation du match clair et centralisé »)
- Fichiers concernés : `docs/js/club-jour-match.js` (`dossierPreparation`), `docs/js/clubUI.js`, `docs/js/club-equipes.js`, `docs/index.html`, `docs/css/style.css`, tests

**Mesuré en jouant une carrière neuve, AVANT d'écrire du code.** Le même
adversaire, le même lieu et la MÊME date apparaissaient dans **trois cartes
du tableau de bord** puis dans l'aperçu d'avant-match :

```
305 px  🗓️ Prochaine échéance      Hautecombe Chamois · à domicile · samedi 7 septembre
353 px  🧭 Préparation             Hautecombe Chamois · à domicile · samedi 7 septembre
343 px  🆚 Prochain adversaire     Hautecombe Chamois — 14e/14, forme, 6 attributs
─────
1001 px pour trois fois la même rencontre, sur un tableau de bord de 1926 px
```

**Défaut aggravant, de la même classe qu'en P1-35 et P1-39.**
`rafraichirAdversaire` résolvait la rencontre par `prochainesFixtures()` et
non par `prochainArret()` : la carte adversaire pouvait décrire un **autre
match** que les deux autres. Troisième occurrence du même défaut.

**La correction.** `dossierPreparation(saison)` ASSEMBLE la vue à partir de
`prochainArret()` — source unique — en réutilisant `etatPreparationMatch`,
`analyserAdversaire` et `recommanderTactique`. Elle ne décide de rien et **ne
stocke rien** : aucun second état de préparation (test dédié qui compare la
saison sérialisée avant/après deux appels).

Un onglet unique « Préparer le match », réutilisé pour la Première, l'Équipe
B, les Espoirs, les coupes et les amicaux — **aucun écran par équipe**, c'est
`prochainArret` qui décide seul de qui joue. Le tableau de bord garde un
résumé compact et un bouton principal.

**Défaut trouvé en testant les cinq types.** Pour un match d'**Espoirs**, le
nom de l'adversaire DISPARAISSAIT : `lienClub` renvoie « ? » pour une
académie, qui n'est pas un club consultable. Le dossier connaît pourtant ce
nom — il est désormais affiché, cliquable seulement quand ça a du sens.

**Résultat mesuré :**

| | Avant | Après |
|---|---|---|
| Cartes du tableau de bord | 7 | **5** |
| Hauteur (ordinateur) | 1926 px | **1250 px** (1,25 écran) |
| Hauteur (mobile 390×844) | — | **1327 px** (1,57 écran) |
| Rencontre décrite à | 3 cartes + aperçu | **1 vue** |

Les cinq types vérifiés sur les deux tailles : type, équipe et adversaire
corrects, aucun compte à rebours négatif, aucun débordement horizontal,
aucune erreur console.

**Tests existants retargetés, à raison.** Sept tests visaient la carte du
tableau de bord ; la fonctionnalité a déménagé, leur intention est
inchangée. L'un comparait le texte d'un élément MASQUÉ (innerText d'un
élément caché est vide, la comparaison portait donc sur du vide) : il
compare désormais à `prochainArret`, la source.

**Limites restantes :**
- L'**aperçu d'avant-match** (`panneauApercuMatch`) existe toujours et répète
  une partie de la vue. Le fusionner touche le flux de lancement du match,
  hors périmètre de cette tranche ; il reste le dernier doublon.
- `rafraichirPreparationMatch` et `rafraichirAdversaire` subsistent, inertes
  (garde défensive), au cas où une page en cache les rappellerait.
- Les sections « composition » et « effectif diminué » sont fusionnées en un
  seul bloc : les points de préparation les portent déjà ensemble, les
  séparer aurait dupliqué l'information que cette tranche cherche à réduire.

---

### P1-42. Première vraie carrière de manager, indépendante du club
- **Statut : CORRIGÉ**
- Priorité : P1 (demande utilisateur ; domaine 8 de la roadmap, entièrement vide)
- Fichiers : `docs/js/club-carriere-manager.js` (**nouveau**), `club.js`, `club-sauvegarde.js`, `club-a-traiter.js`, `clubUI.js`, `docs/index.html`, `docs/css/style.css`, `server/charger-club.js`, tests

**Avant.** Le joueur créait un club et y restait POUR TOUJOURS. La confiance
du président montait et descendait — et n'avait **aucune conséquence** :
aucun avertissement, aucun licenciement. Il n'existait ni profil, ni
réputation, ni offre, ni moyen de changer de club sans recommencer une partie.

**Après.** `saison.manager` est la source de vérité, **délibérément hors de
`saison.clubJoueur`** : c'est ce qui permet de changer de club sans rien
perdre de la carrière personnelle.

**Réputation** — dérivée uniquement de résultats réels, aucun tirage (test
dédié : 20 appels identiques donnent le même gain). Rang final, objectif
atteint ou manqué, promotion/relégation pondérée par le niveau de division,
parcours en coupe, évolution du budget. Une promotion en Ligue Régionale
rapporte **+14** contre **+8** au maximum pour un milieu de tableau en
Excellence : l'exploit d'un petit club vaut plus que la routine d'un grand.

**Sécurité de l'emploi** — réutilise la confiance du président déjà
existante, sans créer de seconde jauge :

| Confiance | État |
|---|---|
| ≥ 55 | Direction satisfaite |
| ≥ 35 | Sous pression |
| ≥ 15 | Avertissement officiel |
| < 15 **et** ≥ 2 saisons d'objectif manqué | Licenciement |

Un seul mauvais résultat ne licencie jamais : le test le verrouille
(confiance 8 avec un seul échec → avertissement, pas licenciement).

**Offres** — uniquement des clubs qui existent réellement dans
`saison.adversaires` : aucun club fictif, aucun monde parallèle. Éligibilité
dérivée de la réputation face à l'exigence du club, elle-même dérivée de son
niveau et de sa situation au classement — un club en difficulté est moins
regardant, ce qui garantit qu'un manager licencié a toujours une porte de
sortie. Quatre offres au maximum, jamais toute la ligue.

**`changerClubManager(saison, clubId)`** — testable sans DOM. L'ancien club
redevient un club IA avec son identité, ses joueurs, son niveau et son
budget ; ses résultats vivent déjà dans `saison.classement`, indexé par id,
donc rien n'est recopié. Le nouveau club part de son **groupe réel de 24
joueurs** (persisté depuis P1-29) — aucun joueur remplacé. Le monde, le
numéro de saison, la date, le calendrier et les compétitions continuent.
Les compositions et le contexte d'équipe sont effacés pour qu'aucun
identifiant de l'ancien club ne survive.

**Migration v5 → v6** : une sauvegarde sans manager en reçoit un, rattaché
au club dirigé, avec le nombre de saisons DÉJÀ jouées — pour ne pas faire
passer un vétéran pour un débutant. Rien d'autre n'est touché.

**Interface** : l'onglet Bilan existant est enrichi de deux cartes, aucun
écran parallèle. Les offres sont empilées verticalement — vérifié sans
débordement horizontal sur 390×844.

**Un choix d'interface assumé.** « Des clubs s'intéressent à toi » n'apparaît
PAS dans « À traiter » quand le manager est en poste et que tout va bien :
une offre non sollicitée n'est pas quelque chose à *traiter*, et « rien à
traiter » doit rester une liste vide (test existant). Les offres restent
consultables dans Bilan. Seuls le statut sans club, l'avertissement et la
pression y figurent.

**Limites restantes, assumées :**
- **Les offres viennent de la division du joueur uniquement.** Les clubs des
  autres paliers existent (`autresDivisionsFrance`) mais ne figurent pas dans
  le calendrier de la saison en cours : y basculer en cours de saison
  laisserait le manager sans rencontres. Les offres inter-divisions
  supposent un changement de club à l'intersaison — étape suivante logique.
- **Aucun manager IA** : les autres clubs n'ont pas d'entraîneur modélisé,
  donc aucune concurrence pour un poste.
- **La boîte de réception suit le poste, pas la personne** : on arrive dans
  un club sans hériter des messages du précédent. C'est un choix, pas un
  oubli — l'historique personnel, lui, est intégralement conservé.
- **Les trophées sont une liste vide** : le moteur de coupes existe (P1-34)
  mais rien ne relie encore une victoire finale au palmarès du manager.

---

## Tranche P1-42 — Vraie carrière de manager, découpée en sous-étapes

**Audit de l'existant avant tout code.** Deux briques sont DÉJÀ là et ne
doivent pas être recréées :

| Brique | Où | État |
|---|---|---|
| Profil, réputation, licenciement, offres, `changerClubManager` | `club-carriere-manager.js` | livré |
| Points d'étape de la direction (34 % et 67 % des journées) | `club-direction.js` | livré |
| Confiance du président, objectif de saison | `club.js`, `club-objectif.js` | livré |

**Ce qui manque réellement.** Le point d'étape ajuste la confiance et écrit
« Confiance −4 (31 %) » — un chiffre, sans conséquence. Il n'existe **aucun
ultimatum**, **aucun licenciement en cours de saison**, et le manager ne
sait ni *pourquoi* la direction s'inquiète, ni *ce qu'il doit faire*, ni
*ce qui arrivera s'il échoue*.

### Sous-étapes

- **P1-42a — L'ultimatum de la direction.** ← *celle-ci, livrée*
  Le point d'étape devient explicable et déclenche, sous un seuil de
  confiance, un ultimatum daté en NOMBRE DE MATCHS avec une cible chiffrée.
  Suivi dans la boucle quotidienne, visible dans « À traiter », résolu
  réellement : réussi → confiance restaurée ; échoué → licenciement, qui
  atterrit sur le marché de l'emploi déjà existant.
- **P1-42b — Candidature spontanée.** Le manager sans club peut postuler à
  un poste au lieu d'attendre une offre ; le club accepte ou refuse selon
  réputation et niveau.
- **P1-42c — Palmarès et trophées.** Relier une victoire en coupe (moteur
  P1-34) au palmarès du manager, aujourd'hui une liste vide.
- **P1-42d — Offres entre divisions, à l'intersaison.** Les autres paliers
  existent mais ne figurent pas au calendrier de la saison en cours :
  basculer en cours de route laisserait le manager sans rencontres.
- **P1-42e — Âge du manager et fin de carrière.**

### P1-42a — L'ultimatum de la direction (livrée)

**Le problème mesuré.** `resoudrePointEtape` produisait :

> « Après 9 journée(s), le club n'est que 12e sur 14. La direction rappelle
> son objectif : « Finir 6e ou mieux ». Confiance −4 (31 %). »

Le manager apprend un chiffre. Il ne sait pas ce qu'on attend de lui, ni ce
qu'il risque. La confiance pouvait descendre à 5 % sans que rien n'arrive
avant la fin de saison.

**Ce qui change.** Sous `SEUIL_ULTIMATUM` (35 %) à un point d'étape, la
direction pose un ultimatum RÉEL, stocké dans la sauvegarde :

- un nombre de matchs (3) ;
- une cible chiffrée (regagner au moins 2 places) ;
- une conséquence annoncée (licenciement).

Il est décompté à chaque rencontre du premier XV, affiché dans « À traiter »
avec les matchs restants, et résolu automatiquement :
**réussi** → confiance +12 et message de soutien ; **échoué** →
licenciement, qui débouche sur le marché de l'emploi de P1-42.

**Critères de validation.** Ultimatum créé seulement sous le seuil ;
décompté par match réel ; cible dérivée du classement réel ; réussite et
échec produisent chacun leur conséquence ; survit à un rechargement ; visible
dans « À traiter » ; aucune décision aléatoire.

---

## P1-43a — Le monde ne se réinitialise plus chaque été (mercato IA)

### Le problème MESURÉ (working tree `3dc2924`, mesures reproductibles)

Audit comportemental joué sur une carrière réelle, pas une lecture de code :

| Mesure | Résultat |
| --- | --- |
| Effectifs des clubs IA après 300 jours simulés | **figés** (aucun mouvement) |
| Marché des transferts après 300 jours | **figé** — 6 joueurs, les mêmes |
| Effectif d'un club IA après une intersaison | **24 partis, 24 arrivées** |
| Transferts entre deux clubs IA | **aucun, jamais** |
| Cible du manager reprise par un rival en 200 jours | **jamais** |

La cause est localisée précisément — `docs/js/club.js`, branche d'intersaison
des adversaires :

```js
return { id: ancien.id, nom: ancien.nom, couleur: ancien.couleur, niveauClub,
         effectif: genererEffectif(rng, niveauClub), budget: ... };
```

L'objet reconstruit abandonne `groupe` et `banc`, et re-tire `effectif` : les
24 joueurs réels du club (persistés depuis P1-29) sont jetés et remplacés par
24 inconnus. Le nom, la couleur et l'id du club survivent — **ses joueurs,
non**.

### Pourquoi c'est le manque le plus important

Ce n'est pas un défaut cosmétique, il détruit trois mécaniques DÉJÀ écrites :

1. `approcherJoueurAdverse` (club-transferts-internationaux.js) permet
   d'acheter un joueur à un club IA, à un prix dérivé de son importance
   réelle. Le joueur repéré cette saison **n'existe plus** la suivante.
2. `analyserAdversaire` compare les attributs réels de l'adversaire. L'analyse
   accumulée sur une saison ne vaut plus rien à la saison suivante.
3. Le centre de formation, les prêts et le scouting produisent une valeur
   qu'aucun club IA ne convoite jamais : le manager est le seul acteur d'un
   monde immobile.

Et surtout : **rien ne peut circuler entre des clubs dont personne ne
persiste.** Tant que ce point n'est pas réglé, aucun mercato vivant n'est
possible.

### Ce que cette tranche livre

- Les clubs IA **gardent leurs joueurs** d'une saison à l'autre : identité,
  attributs, âge, contrat.
- Ils **vieillissent** avec exactement les mêmes règles que l'effectif du
  joueur (déclin après 31 ans, progression vers le potentiel avant 23 ans),
  via une fonction unique partagée — aucun second système de vieillissement.
- Les plus vieux **prennent leur retraite**, les fins de contrat partent, et
  le club **comble ses trous**.
- De **vrais transferts** ont lieu entre clubs IA : un club faible à un poste
  achète, dans son budget, le meilleur joueur disponible d'un club en surplus.
  Argent débité chez l'acheteur, crédité chez le vendeur, joueur réellement
  déplacé.
- Le manager **lit le mercato** : qui a signé où, pour combien.

### Critères de validation

Un club IA conserve la majorité de ses joueurs d'une saison à l'autre ; les
survivants ont un an de plus ; aucun joueur au-delà de l'âge de retraite ;
l'effectif reste complet et couvre tous les postes ; au moins un transfert
réel par intersaison ; le transféré quitte le vendeur ET arrive chez
l'acheteur ; les budgets bougent des deux côtés ; aucun club ne dépense plus
qu'il n'a ; le tout déterministe et sauvegardable ; promotion/relégation
continue de donner de nouveaux adversaires sans casse.

---

## P1-43b — La concurrence pour une recrue (livrée)

### Correction d'une affirmation de P1-43a

Le commit P1-43a affirme que « le marché des joueurs libres du jeu ne facture
aucune indemnité, seulement un salaire ». **C'est faux.** La sonde lisait
`joueur.prix` alors que le champ réel est `joueur.prixTransfert`. Mesuré :

| | Valeurs réelles |
| --- | --- |
| Indemnité d'un joueur du marché | 302 – 434 k€ |
| Budget d'un club IA (Ligue Régionale) | 262 – 457 k€ |
| Indemnité demandée par un club IA pour un des siens | ~568 k€ |

La conclusion de P1-43a tient malgré tout, mais pour une raison plus étroite
que celle écrite : c'est le prix **entre clubs** (~568 k€, avec la prime de
débauchage ×1,6) qui dépasse les budgets, pas le marché des joueurs libres.
Les fins de contrat restent donc le bon moteur du mercato IA à ce niveau — et
le marché libre, lui, est bel et bien accessible aux clubs IA. C'est
exactement ce que P1-43b exploite.

### Le problème mesuré

Une cible du marché n'était **jamais** reprise par un club IA (200 jours
simulés). Et « Rafraîchir » régénérait la totalité du marché, gratuitement et
autant de fois qu'on voulait. Repérer un joueur puis hésiter ne coûtait donc
strictement rien.

### Ce qui change

- Les clubs rivaux se servent au **même marché** que le manager, aux **mêmes
  conditions** : même prix (`prixTransfert`), même fenêtre de transfert, argent
  réellement débité, joueur réellement intégré à leur groupe.
- Un joueur **suivi** (favori) qui signe ailleurs produit un message nommant
  le club et le montant, et sort de la liste des favoris.
- Le marché se **réalimente** lentement (un joueur libre tous les 5 jours)
  pour ne pas s'assécher.
- « Rafraîchir » reste possible mais **une fois par semaine** : sinon perdre
  une cible se rattrapait d'un clic, et la concurrence n'aurait eu aucune
  conséquence.
- Un joueur sur lequel un **rapport de repérage est en cours** est intouchable
  jusqu'à la remise : le manager a payé pour cette information. Les favoris,
  eux, restent pleinement disputables.

### Rythme mesuré (20 carrières, 60 premiers jours)

`1 0 0 3 2 3 2 1 6 5 2 3 2 1 3 4 2 4 4 2` → moyenne **2,5** signatures
rivales par fenêtre, **10 %** des carrières n'en voient aucune. Assez pour
mettre la pression, trop lent pour rafler le marché.

### Point technique

Le mercato tire ses aléas sur **son propre flux** (sel 31), jamais sur le rng
partagé de la journée. Mesuré : sans cette séparation, ajouter un tirage
décalait toute la séquence quotidienne en aval et faisait tomber deux tests
existants (déterminisme de l'avance, date de remise d'un rapport).

## P1-45 — Le statut promis : le manager s'engage devant ses joueurs (livrée)

`server/test-dynamique.js` — 13 vérifications, **toutes rouges avant ce
patch**, vertes après. Plus un pilotage réel du jeu dans le navigateur, qui a
trouvé deux bugs que les tests Node ne voyaient pas (voir plus bas).

### Partie A — une incohérence introduite par le correctif P0-composition

`meilleurCandidatPourNumero` classe les joueurs avec `noteAuPoste` depuis le
correctif P0. Mais `estCandidatSelectionAttendue` (club-decisions.js) était
restée sur `vitesse + plaquage`, et son commentaire affirmait encore suivre
« le même critère ».

Conséquence en jeu : un pilier 95 vitesse / 95 plaquage / 20 mêlée n'était
plus aligné — à raison — mais venait quand même réclamer sa place tous les
trois matchs, pendant que le vrai deuxième pilier du poste ne se plaignait
jamais. **Le manager était puni pour avoir fait le bon choix.** Corrigé : le
même classement sert des deux côtés.

### Partie B — ce qui manquait : promettre quelque chose

Avant, la seule dynamique de vestiaire était **subie** (frustration après
trois journées sans sélection). Le manager ne pouvait rien promettre à
personne : aligner ou non un joueur n'engageait sur rien.

- **Trois statuts** — cadre (60 % de temps de jeu promis), joueur de rotation
  (30 %), espoir (aucune attente). Persistés sur le joueur, donc sauvegardés
  sans migration (l'absence de statut = « rien promis », ce qui est exact pour
  une ancienne partie).
- **Effet immédiat** : l'annonce fait bouger le moral (+8 pour un premier rôle
  de cadre, −8 par rang perdu en cas de déclassement, −6 pour un joueur de
  25 ans qu'on annonce « espoir »). Le moral pèse réellement sur les stats
  transmises au moteur (`compositionVersJoueursCfg`).
- **Jugé sur les feuilles de match réelles** : `matchsJoues` (titularisations,
  incrémenté par `appliquerFatigue`) et `matchsSurLeBanc`, rapportés aux
  matchs où le joueur était sélectionnable. Une entrée en jeu non utilisée
  vaut une demi-participation. Jamais un compteur fabriqué pour l'écran.
- **Une promesse tenue ne déclenche rien.** Sinon le système punirait un
  manager irréprochable.
- **Une promesse rompue** (au minimum 6 matchs après l'annonce) ramène le
  joueur dans le bureau, avec trois issues qui ne se valent pas :
  *maintenir* (moral +10, mais une seconde rupture casse la relation),
  *revoir son statut* (déclassement réel d'un cran, moral −6, pas de spirale
  de départ), *ignorer* (moral −15, compte comme un avertissement ignoré).
  Le silence vaut « ignorer », comme pour les autres décisions.
- **Écran dédié** : Effectif → Dynamique. Une ligne par joueur, le bilan
  chiffré de chaque promesse, les mécontents. Sur un club qu'on ne dirige pas,
  l'écran dit que l'information n'est pas connue plutôt que d'inventer.

Le statut ne modifie **pas** la sélection automatique : c'est une promesse que
le manager doit tenir lui-même, pas une consigne que le jeu appliquerait à sa
place. La composition auto reste réglée sur la seule valeur sportive au poste.

### Deux bugs trouvés en pilotant le jeu, invisibles pour les tests Node

1. **Double comptage.** Après un seul match, un joueur affichait
   1 titularisation *et* 1 entrée en jeu — 1,5 match pour une feuille. Cause :
   `appliquerFatigue` reçoit le XV **après** remplacements, l'évaluation
   recevait le XV de départ. Un remplaçant entré en jeu était compté deux
   fois. Corrigé + verrouillé par test (B9bis/B9ter).
2. **Dénominateur figé.** Un titulaire sorti sur blessure voyait
   `matchsJoues` passer à 1 pendant que le nombre de matchs disponibles
   restait à 0 (les blessures sont appliquées avant l'évaluation) : bilan
   absurde de 2 titularisations sur 0 match, promesse jamais jugeable.
   Corrigé : figurer sur la feuille suffit à faire compter le match ; une
   blessure *longue* continue, elle, de ne pas compter contre le manager.
   Verrouillé par test (B9quater).

## P1-46 — La direction ne juge plus QUE le classement (livrée)

`server/test-feuille-de-route.js` — 11 vérifications, **toutes rouges avant ce
patch**, vertes après. Plus un pilotage réel du jeu dans le navigateur, de la
promotion d'un espoir jusqu'à l'axe qui bouge sur le tableau de bord.

### Le problème mesuré

`confiancePresident` n'était modifiée qu'à deux endroits — `resoudrePointEtape`
(club-direction.js) et le bilan de fin de saison (club.js, `avancerSaison`) —
et les deux ne regardaient que la **position au classement**, via
`evaluerObjectifSaison`.

Conséquence : tous les arbitrages de gestion construits jusqu'ici —
infrastructures (P1-44), mercato (P1-43), centre de formation, statuts promis
(P1-45) — n'avaient **aucun poids** sur la seule jauge qui décide si le
manager garde son poste. À classement égal, vider la caisse et ne jamais
aligner un joueur formé au club coûtait exactement zéro. Et le manager ne
savait pas sur quoi il était jugé, en dehors du classement.

### Ce qui change

La direction annonce en début de saison une feuille de route sur trois axes,
avec des cibles **dérivées du club lui-même**, jamais un barème fixe :

- **Résultats** — `objectifSaison`, l'objectif qui existait déjà. Réutilisé
  tel quel : jamais une seconde règle qui divergerait.
- **Formation** — nombre de titularisations accordées à des joueurs
  **promus du centre** (`promouvoirJeune` pose désormais `issuDuCentre`).
  Cible `6 + (1 − niveauClub) × 8` : un petit club compte davantage sur son
  centre, c'est souvent tout ce qu'il a. Acheter un joueur de 19 ans ne
  compte pas — ce n'est pas le former.
- **Finances** — plancher fixé à la moitié du budget au moment où la feuille
  est établie. La direction accepte qu'on investisse, pas qu'on dilapide.

En fin de saison, formation et finances ajustent réellement la confiance
(+6/−6 et +5/−10). L'axe résultats n'est **pas** recompté : `evaluerObjectifSaison`
s'en charge déjà, le doubler punirait deux fois la même chose. Les effets sont
volontairement plus faibles que le classement (−30 à +20) : la gestion pèse,
elle ne remplace pas les résultats.

Le manager voit son avancement chiffré sur la carte « Objectif » du tableau de
bord, en permanence — pas seulement au bilan.

### Ce que ça change pour le joueur

Promouvoir un espoir puis l'aligner devient un vrai arbitrage : il est moins
bon que le titulaire en place (la composition automatique le sait, cf.
`noteAuPoste`), mais ne jamais le faire jouer coûte de la confiance. Idem pour
le budget : acheter un joueur de plus peut faire passer sous le plancher.

Mesuré en pilotant le jeu : espoir promu → `issuDuCentre` posé → il est
retenu par la composition automatique → l'axe passe de `0 / 12` à `2 / 12`
sur le tableau de bord, et le budget affiché suit la trésorerie réelle.

### Deux tests existants ont changé d'attente

Une carrière neuve ne démarre plus avec une boîte de réception vide : la
feuille de route y est annoncée dès le premier jour, parce que c'est le moment
où le manager en a le plus besoin. `test-parcours-club` vérifie maintenant que
c'est le **seul** message d'ouverture, et le test de la zone « à traiter » lit
d'abord ce message avant de vérifier qu'il ne reste rien.

## P1-47 — Où est passé l'argent ? Le grand livre du club (livrée)

`server/test-comptes.js` — 11 vérifications, **toutes rouges avant ce patch**,
vertes après. Plus un pilotage réel du jeu, qui a trouvé un bug de projection
que les tests ne voyaient pas.

### Le problème mesuré

Sur une carrière neuve : un repérage (8 k€) puis un chantier au centre médical
(260 k€) font tomber le budget de **434 à 166 k€**. Le journal financier
contient alors **zéro ligne**. 268 k€ ont quitté la caisse sans laisser la
moindre trace.

La raison : `historiqueFinances` n'était alimenté que par
`enregistrerMouvementFinances`, appelé uniquement après un match. Or onze
endroits modifiaient `club.budget` — infrastructures, mercato, prêts,
transferts nationaux et internationaux, repérage ×2, signatures, et les deux
fonctions de match. **Neuf n'écrivaient nulle part.**

Depuis que la direction impose un plancher de trésorerie (P1-46), le manager
était jugé sur un chiffre dont il ne pouvait pas expliquer les variations.

### Ce qui change

Un point d'entrée unique, `RMClub.tresorerie(cible, categorie, libelle,
montant)` : il débite ou crédite **et** inscrit au grand livre. Neuf
catégories nommées (billetterie, sponsors, ventes, prêts, salaires joueurs,
salaires personnel, achats, infrastructures, repérage), chacune avec un
libellé qui dit la cause — « Travaux — Centre médical niveau 2 », « Transfert
de Untel (3L) ».

L'invariant, tenu par les tests **et vérifié en pilotant le jeu** :

```
budget_final − budget_initial === somme des totaux du grand livre
```

Les totaux ne sont jamais bornés (seule la liste affichée l'est, à 60 lignes),
donc l'invariant tient sur une saison entière. Les totaux sont archivés puis
remis à zéro à chaque bascule de saison, ce qui permet enfin de comparer deux
exercices.

`historiqueFinances` n'est pas supprimé : il reste le résumé **par journée**.
Le grand livre est la trace **ligne à ligne**. Deux granularités, pas deux
vérités — les deux découlent des mêmes appels.

`prevoirFinances` est **supprimée** (plus aucun appelant) et remplacée par
`previsionTresorerie`, qui lit le grand livre.

### L'écran Finances

Avant : une liste de mouvements de jour de match. Maintenant :

- **Où va l'argent** — ventilation par poste sur la saison, avec le solde ;
- **Exercices précédents** — solde et clôture de chaque saison archivée ;
- **Dernières opérations** — chaque ligne avec sa cause et le solde après.

Relevé réel obtenu en pilotant le jeu (14 journées, un chantier, un repérage) :
`Billetterie +240 · Sponsors +68 · Salaires −46 · Infrastructures −320 ·
Repérage −8 · Solde de la saison −66 k€`.

### Un bug de projection trouvé en pilotant

Première version : la projection retranchait le coût du chantier en cours.
Mais ce coût est débité **d'un coup à la commande** — il était donc déjà sorti
du budget affiché. Avec 401 k€ en caisse et un chantier de 320 k€ payé, la
projection annonçait **736 k€ au lieu de 1056**. Le chantier est désormais
rappelé comme contexte (« déjà payé · livraison dans 16 j ») sans peser une
seconde fois. Verrouillé par C11.

### Hors périmètre, volontairement

Les transferts **entre clubs IA** (club-mercato.js) ne passent pas par le
grand livre : ils ne touchent jamais la trésorerie du club dirigé, et donner
un livre de comptes à chaque club adverse alourdirait la sauvegarde sans rien
apporter au manager.

## P1-48 — Vendre un joueur (livrée)

`server/test-ventes.js` — 12 vérifications, **toutes rouges avant ce patch**,
vertes après. Plus un pilotage réel du jeu, de la mise en vente jusqu'à
l'encaissement — qui a trouvé un bug d'affichage que les tests ne voyaient pas.

### Le problème mesuré

Le club pouvait **acheter** (`signerJoueur`, `approcherJoueurAdverse`) mais
jamais **vendre**. La seule sortie était `libererJoueur` — mesuré : budget
439 → 439, **gain 0 k€**. Et `Object.keys(RMClub).filter(k => /vend|ceder/i)`
ne renvoyait rien. Le grand livre (P1-47) déclarait même une catégorie
« Ventes de joueurs » sans aucun producteur.

Trois conséquences concrètes :

- la direction impose un plancher de trésorerie (P1-46) et le seul levier
  pour rentrer de l'argent était la billetterie ;
- les statuts promis (P1-45) produisent des joueurs qui demandent leur
  transfert, et la seule issue était de les lâcher pour rien ;
- arbitrer entre garder un cadre et encaisser son prix, c'est la moitié du
  travail d'un manager. Ce levier n'existait pas.

### Ce qui change

Deux moitiés, symétriques de l'achat :

- **La liste des transferts** — depuis la fiche d'un joueur. Un signal envoyé
  au marché : les offres se multiplient (6 % par jour au lieu de 0,6 %) mais
  le prix baisse de 15 %, parce que tout le monde sait qu'on est vendeur. Un
  joueur qui a lui-même demandé son transfert perd 20 % de plus.
- **Les offres reçues** — un club adverse vient, et ça arrive comme une vraie
  décision : *Accepter 270 k€* / *Exiger 378 k€* / *Refuser*. Le silence vaut
  refus, et le club retire son offre.

Aucun acheteur fabriqué : le club vient de `saison.adversaires`, son budget
est vérifié, son besoin au poste vient de `besoinsDe` (club-mercato.js). Il
**paie réellement** — son budget baisse — et le joueur **rejoint réellement**
son groupe : le manager pourra le retrouver en face, et tenter de le racheter.

Refuser un joueur qui voulait partir lui coûte 10 points de moral. Vendre un
joueur à qui on avait promis un rôle de **cadre** coûte 4 points de moral à
tout le vestiaire : la parole du manager vaut pour tout le monde.

### Calibrage mesuré, pas deviné

Première version, avec un coefficient de vente de 1,5 : sur trois carrières,
le club IA **le plus riche** ne pouvait s'offrir que **0 à 1 joueur sur 24**.
La fonctionnalité aurait été morte au palier de départ.

Cause : le marché des joueurs libres vend à `estimerValeurTransfert(...)`
**sans multiplicateur**. Vendre 50 % au-dessus de ce que coûte un joueur
équivalent en accès libre n'a aucun sens — personne n'achète. Coefficient
ramené à 1, et un club peut engager 85 % de sa trésorerie pour une occasion
(son mercato de routine reste plafonné à 35 %). Après recalibrage : **13 à 22
joueurs sur 24** sont dans les moyens de la division, et 30 carrières sur 30
reçoivent une offre en 120 jours.

### Un bug d'affichage trouvé en pilotant

Le gestionnaire de décision ne rafraîchissait que `rafraichirMessages()` et
`rafraichirEffectif()`. C'était suffisant tant qu'une décision ne faisait que
changer un moral — plus du tout depuis qu'elle peut **déplacer de l'argent et
retirer un joueur du groupe**. Mesuré : après une vente à 270 k€, l'onglet
Finances affichait encore le budget et le grand livre d'AVANT, et la
composition gardait un titulaire qui venait de partir. Remplacé par un
rafraîchissement complet.

### Hors périmètre

`libererJoueur` n'est pas supprimé : libérer reste un départ **libre**, sans
indemnité. C'est une option distincte, pas un doublon — et parfois la seule
possible (dernier joueur de son poste, joueur que personne ne veut).

## P1-49 — Le rapport de scout parle enfin du poste (livrée)

`server/test-scouting.js` — 11 vérifications, 8 rouges avant ce patch (S8 et
S9 passaient déjà, gardées en non-régression), toutes vertes après. Plus un
pilotage réel du jeu.

### Le problème mesuré

```
Piliers du marché (5) — ce que le scout dit vs ce qu'ils valent :
  2★ (vit 42/plaq 73) — mêlée 77 -> note au poste 72
  2★ (vit 39/plaq 76) — mêlée 86 -> note au poste 74.8
  2★ (vit 44/plaq 65) — mêlée 84 -> note au poste 73.2
  2★ (vit 48/plaq 65) — mêlée 81 -> note au poste 72.2
  2★ (vit 43/plaq 67) — mêlée 83 -> note au poste 73.5
```

**Les cinq affichaient la même note.** Leur mêlée — l'attribut qui décide
seul si un pilier joue, depuis le correctif P0-composition — allait de 77 à
86, et le rapport n'en disait pas un mot : `statsApparentes` n'exposait que
`vitesse`, `plaquage` et `complet`. Les neuf autres attributs du joueur
n'apparaissaient nulle part. Sur 501 comparaisons, le joueur le mieux noté
par le scout n'était pas le meilleur au poste dans **347 cas (69 %)**.

C'était la dernière poche où le jeu se contredisait : la composition classe au
poste (P0), les réclamations aussi (P1-45), mais le recrutement — la décision
la plus chère du jeu — se faisait encore sur deux attributs génériques.

### Ce qui change

- `statsApparentes` expose **les onze attributs**, chacun avec sa propre
  incertitude, qui se résorbe avec la connaissance.
- `noteApparenteAuPoste(joueur, poste)` applique **exactement** la grille de
  la composition (`noteAuPoste`) aux valeurs apparentes.
- `estimationEtoiles(joueur, poste)` en découle — et accepte un autre poste :
  un pilier évalué à l'aile perd beaucoup, c'est tout l'intérêt.
- `attributsClesDuPoste(poste)` (club-composition.js, à côté des poids) dit
  ce qui compte vraiment : mêlée d'abord pour un pilier, vitesse pour un
  ailier.
- `rapportScouting(saison, joueurId)` assemble le dossier et le compare au
  **meilleur joueur réellement présent** au même poste.

À l'écran, une ligne de marché est passée de `Vit.42/Plaq.73` à :

```
Gabriel Fontaine · Pilier · 31 ans · ★★★☆☆ 70 · Mêlée 82 · Puissance 71 ·
Plaquage 67  ↓ ton meilleur P : 71.3   (estimation)
```

Et la comparaison de deux joueurs porte sur la note au poste puis sur les
quatre attributs qui comptent à ce poste, au lieu de vitesse/plaquage.

### Un bug de déterminisme antérieur, mis au jour et corrigé

En rejouant les suites, un test de déterminisme est tombé : deux carrières de
**même graine** construites à la suite donnaient des budgets adverses
différents après dix jours. Cause : `grainePourClub` (club-effectif-adverse.js)
hachait l'**id** du club — un compteur GLOBAL au module, donc différent d'une
construction à l'autre dans la même session. Les effectifs adverses n'étaient
donc pas reproductibles, ce qui contredit la promesse écrite dans club.js
(« deux carrières créées avec la même graine vivent exactement la même
saison »). La clé est maintenant le **nom** du club, lui-même dérivé de la
graine. Le patch de scouting n'a pas créé ce défaut, il l'a rendu visible.

### Une fragilité de test corrigée

Le test de double clic sur « Signer » calculait un point écran sans s'assurer
que le bouton était visible. L'écran Recrutement s'étant allongé (carte
Départs en P1-48, rapport détaillé ici), la première ligne du marché est
passée sous la ligne de flottaison : `elementFromPoint` renvoyait null et le
double clic ne partait nulle part. Le bouton est désormais amené dans le
viewport avant la mesure — la protection anti-double-signature, elle, n'a
jamais bougé.

## P1-50 — Le sauteur en touche compte enfin (livrée)

`server/test-touche.js` — 7 vérifications, 5 rouges avant ce patch (T2 à T6),
toutes vertes après. Plus un pilotage réel du jeu.

### Le problème mesuré

Deux packs identiques où un SEUL avant sait sauter (n°5, touche 95 ; les sept
autres à 20). Dix matchs complets, d'abord sans rien désigner, puis en forçant
`toucheA.sauteurs = [5]` — c'est-à-dire en disant au moteur de ne viser que le
bon sauteur :

```
sans désigner de sauteur         : 120/115 touches gagnées
en désignant le SEUL bon sauteur : 120/115 touches gagnées
=> écart : 0,0 point
```

**Strictement aucune différence.** Trois causes, toutes dans le moteur :

1. `tirerSauteur` choisissait **uniformément** dans le pool : un sauteur à 88
   et un à 45 étaient visés aussi souvent l'un que l'autre ;
2. `probaVolAdverse` ne regardait que la **somme** de `forceTouche` sur les
   huit avants — la qualité de celui qui monte réellement au ballon n'entrait
   nulle part ;
3. le pool était lu dans `this.cfg.touche.sauteurs`, la config **partagée** :
   `config.toucheA.sauteurs` existait mais **n'était jamais lu**. Le réglage
   par équipe était donc inopérant depuis toujours.

C'est ce qui rendait la touche muette alors que, depuis P1-49, le manager
recrute un deuxième ligne en regardant précisément cet attribut.

### Ce qui change

- **Tirage pondéré** (`tirerSauteurPondere`) : le sauteur visé l'est
  proportionnellement à sa `touche`, avec un poids plancher de 25 pour qu'un
  sauteur médiocre reste une option — en vrai on varie les appels, et une
  équipe qui ne viserait qu'un seul homme deviendrait lisible.
- **Le sauteur visé est tiré AVANT** de savoir si la touche est volée, et sa
  qualité propre entre dans la probabilité : `(forceTouche(sauteur) − 80)/400`,
  soit environ 7,5 points sur une échelle bornée 6–30 %. Assez pour que le
  choix compte, jamais assez pour écraser la domination collective du pack.
- **Le pool est lu par équipe** (`this.cfgTouche[equipe]`), ce qui rend enfin
  `toucheA/toucheB.sauteurs` opérant.
- **Mode Club** : le manager désigne jusqu'à 3 sauteurs parmi ses n°4 à 8,
  depuis l'écran Composition. Persisté sur le slot de composition, donc
  disponible pour l'équipe première, la B et les Espoirs sans code en double.
  Un sauteur qui n'est plus titulaire est ignoré, jamais propagé — sinon son
  ancien numéro ferait sauter quelqu'un d'autre.

À l'écran :

```
Sauteurs en touche
n°4 · Tom Roux 2L            Touche 78   [Désigner]
n°5 · Mathis Chevalier 2L    Touche 75   [Désigner]
n°6 · Tom Legrand 3L         Touche 57   [Désigner]
n°8 · Kevin Laurent 3L       Touche 56   [Désigner]
n°7 · Antoine Laurent 3L     Touche 49   [Désigner]
Aucun sauteur imposé : le lancer vise les n°4 à 8, en ciblant plus souvent
les meilleurs. Maximum 3 désignations.
```

### Ce qui n'est PAS un bug

En mesurant, j'ai d'abord cru voir « 104,3 % de touches gagnées ». C'était mon
calcul qui était faux : `lineouts` compte les **lancers de cette équipe**,
`lineoutsGagnes` les **touches gagnées par elle** (y compris volées sur le
lancer adverse). Vérifié : total gagnées = total lancers, toujours. L'écran
(docs/js/ui.js) rapporte d'ailleurs bien au total des deux équipes.

### Statistiques : contrôle sur 500 matchs

`server/test-stats-matchs.js` (500 matchs, ~20 min) : 16 tests, 0 échec.
Les touches sortent à **27,8 par match** en moyenne (repère CLAUDE.md 15-35),
donc le changement de tirage n'a pas dérivé le volume de la phase.

Les quatre catégories hors repère signalées par la suite (rucks 518, plaquages
642, coups de pied 142, pénalités 11,6) sont **antérieures et connues** : c'est
le sujet « T2 (temps mort / ballon en jeu) » déjà instruit plus haut dans ce
fichier, sans rapport avec la touche.

## P1-50b — Le coût de la prévisibilité en touche (livrée)

Complète P1-50, dont j'avais moi-même noté le défaut : « désigner un seul
sauteur n'a que des avantages, ce qui n'est pas un vrai choix ».

### Le problème mesuré

Cinq sauteurs **strictement équivalents** (tous à touche 80, donc aucun gain
de qualité possible), douze matchs complets :

```
alignement LIBRE      : 136/143 touches gagnées (95,1 %)
UN SEUL désigné       : 136/139 (97,8 %)
```

Restreindre l'alignement était **gratuit**, donc toujours gagnant. Le texte à
l'écran promettait pourtant un compromis (« plus lisible pour l'adversaire »)
que rien ne modélisait — le jeu disait une chose et en faisait une autre.

### Ce qui change

Un troisième terme dans la probabilité de vol : la **lisibilité** de
l'alignement, proportionnelle à la part du pool retirée. Un alignement réduit
à un seul homme ajoute 2,4 points de risque ; à trois hommes, 1,2 point.

Le coefficient (0,03) est calibré **sous** le gain d'un vrai spécialiste
(~0,038 quand il domine nettement ses coéquipiers) :

- désigner un sauteur **nettement meilleur** reste payant ;
- désigner **à qualité égale** coûte des ballons.

C'est l'arbitrage qui manquait.

### Une règle extraite, testable directement

La probabilité de vol devient une fonction pure exportée,
`RugbyEngine.probaVolTouche({forceLanceur, forceAdverse, qualiteSauteur,
taillePool})`, appelée par `_tickTouche`.

**Pourquoi :** j'ai d'abord essayé de vérifier le coût de la prévisibilité en
jouant des matchs. Résultat : 140/145 contre 136/143 — un écart de 1,5 point
sur ~145 touches, indistinguable du bruit (erreur type ≈ 1,7 point). Mesurer
un effet de 2 points de cette façon aurait demandé des centaines de matchs,
pour une suite déjà lente. La règle est donc vérifiée **directement**, ce qui
est à la fois plus rapide et plus honnête : on teste ce que le code décide,
pas la moyenne d'un échantillon trop petit.

### À l'écran, le compromis est chiffré

```
Le lancer visera n°4. Alignement plus fiable si tes sauteurs sont meilleurs
que les autres — mais aussi plus lisible : +2,4 point(s) de risque de ballon
volé par l'adversaire.
```

Avec deux sauteurs désignés, le même bandeau affiche +1,8. Le chiffre est
celui que le moteur applique (`COEF_LISIBILITE_TOUCHE`), pas une estimation —
vérifié en pilotant le jeu.

## P1-51 — La poussée en mêlée (livrée)

`server/test-melee.js` — 9 vérifications, 7 rouges avant ce patch (seul M8,
l'ordre de grandeur, passait déjà), toutes vertes après. Plus un pilotage réel
du jeu.

### Le problème mesuré

`_meleeCalculerDiff` calcule l'issue de la mêlée à partir des joueurs (somme
des `forceMelee`, bonus piliers, technique du talonneur), du score, des
conditions et du hasard. Elle ne lit **aucune clé de `cfgMelee`**.

Vérifié en jouant : poser `meleeA.reculTroisQuarts = 12` donne exactement le
même résultat que le défaut (**81/94 mêlées gagnées dans les deux cas**) — la
clé traverse toute la chaîne de config mais n'atteint jamais la contestation.
Le seul réglage que le Mode Club posait sur la mêlée (`pickAndGoHuit`, axe
« Jeu d'avants ») décide de ce qu'on fait du ballon **une fois sorti**.

Depuis P1-49 le manager recrute ses piliers sur leur `melee` (40 % de leur
note au poste) et le moteur s'en sert — mais le manager ne pouvait rien
choisir. La touche venait de recevoir son arbitrage (P1-50/50b) ; la mêlée
n'en avait aucun.

### Ce qui change

Un **7ᵉ axe tactique**, « Poussée en mêlée » : *Dominer* / *Équilibré* /
*Sortir vite*. Réglable par équipe, converti en `meleeA/meleeB.poussee`,
déduit aussi pour les clubs consultés (à partir de la mêlée moyenne réelle de
leur groupe).

### Une première version inerte, corrigée

Ma première implémentation n'ajoutait qu'un bonus de différentiel (+10).
Mesuré : le taux de mêlées gagnées **baissait** de 85,9 % à 79,6 %.

Diagnostic : `probaVol = 0,05 − diff/300`, **borné à 0,02**. Or l'avantage
d'introduction vaut déjà 18 :

```
diff   0 -> 0,050     diff   8 -> 0,023
diff  18 -> 0,020     diff  28 -> 0,020
```

À packs égaux, la valeur est **déjà au plancher** : un bonus de différentiel
n'y change rien. Seul le coût (facteur de faute) s'appliquait — l'option était
strictement mauvaise. J'ai ajouté un terme **dédié**, `bonusVol`, qui agit
directement sur la contestation : un pack qui pousse contre l'introduction
adverse contre réellement plus (0,02 → 0,07).

### Ce que je n'ai PAS pu mesurer

L'ampleur de l'effet en match reste invérifiable à cette échelle : selon la
consigne, le nombre même de mêlées change (115 contre 134 sur douze matchs),
donc les taux ne sont pas comparables. Les pénalités concédées oscillent entre
6,2 et 7,0 par match toutes causes confondues — l'effet spécifique à la mêlée
y est dilué.

La règle est donc vérifiée **directement** (M1bis, M3), et le test de match
(M7) n'affirme que ce qu'il démontre : la consigne produit un déroulé
différent. Même méthode qu'en P1-50b, pour la même raison.

### À l'écran

```
Poussée en mêlée
  Dominer      Le pack pousse à fond : il fait reculer l'adversaire et
               conteste ses introductions.
  Équilibré    Poussée normale, sans surengagement.
  Sortir vite  Le pack sécurise et libère le ballon sans chercher le duel.

⚖️ Contre bien plus souvent les mêlées adverses et gagne du terrain — mais
   quand c'est TON pack qui recule, il s'écroule et pousse en travers 50 %
   plus souvent, et ce sont des PÉNALITÉS.
```

### Un oubli attrapé par un test existant

`deduireTactiqueAdverse` doit couvrir TOUS les axes : le test de parcours a
échoué tant que le nouvel axe n'y était pas. La consigne d'un club consulté
est maintenant déduite de la mêlée moyenne de son groupe — la même donnée que
celle sur laquelle le manager recrute.

## P1-52 — La feuille de match : le match raconte enfin ce qu'il s'est passé

`server/test-feuille-de-match.js` — 9 vérifications, 7 rouges avant ce patch
(E1 et E9 documentent le comportement existant et servent de non-régression),
toutes vertes après. Plus un pilotage réel du jeu, capture d'écran à l'appui.

### Le problème mesuré

```js
// engine/rugby-engine.js, log()
this.events.push({...});
if (this.events.length > 30) this.events.shift();
```

Sur un match complet (graine 7), `getState().events` contient 30 entrées,
**toutes postérieures à la 78ᵉ minute**. Tout le reste du match a été jeté.
L'interface, elle, n'en affiche que 5.

Et après un match simulé en Mode Club, le panneau de résultat affichait un
badge, un score et une ligne de détail. **Aucune chronologie, aucun marqueur,
aucun compte rendu.** Le manager ne pouvait ni comprendre le résultat, ni
juger sa tactique, ni raconter sa saison.

### Ce qui change

- **Moteur** : une `chronologie` conserve les faits marquants de TOUT le match
  (essais, transformations, pénalités, drops, cartons, mi-temps, coup de
  sifflet final, remplacements), datés à la minute, bornée à 400 entrées. Le
  fil « live » de 30 événements est inchangé — il sert l'affichage temps réel,
  pas le compte rendu.
- **Mode Club** : `feuilleDeMatch(etat, {nomA, nomB})` assemble le compte
  rendu — chronologie avec score courant ligne à ligne, marqueurs par équipe,
  quinze statistiques comparées.
- **Écran** : la feuille s'affiche à la fin de tout match, simulé comme joué.

Relevé réel obtenu en pilotant le jeu :

```
AS Feuille 33 — 17 Castelnau Taureaux
Essais marqués : AS Feuille 14', 33', 41', 77' · Castelnau 9', 27'

 9'  🏉 Essai Castelnau Taureaux            0-5
10'  🎯 Transformation Castelnau Taureaux   0-7
14'  🏉 Essai AS Feuille                    5-7
15'  ✖️ Transformation manquée AS Feuille
23'  🎯 Pénalité AS Feuille                 8-7
24'  🟨 Carton jaune Castelnau Taureaux
...
40'  ⏸️ Mi-temps
...
80'  ⏹️ Coup de sifflet final
```

### La possession est annoncée pour ce qu'elle est

Le moteur ne chronomètre pas la possession. Plutôt que d'inventer un
pourcentage, la feuille affiche « Possession (est.) » avec, en infobulle, sa
source réelle : la part des rucks joués.

### Une erreur de fichier, corrigée

J'ai d'abord écrit le CSS dans `docs/style.css` — un fichier qui n'existait
pas et que la page ne charge pas (`docs/css/style.css`). La première capture
montrait un compte rendu correct mais entièrement centré et illisible, scores
collés au texte. Fichier parasite supprimé, styles déplacés au bon endroit,
vérifié par capture d'écran.

### Ce que la feuille rend visible : les volumes ne sont pas crédibles

Maintenant que les statistiques sont affichées côte à côte, l'écart aux
repères de CLAUDE.md saute aux yeux sur un match réel :

| Statistique | Mesuré (total) | Repère CLAUDE.md |
|---|---|---|
| Rucks | **646** | 70-180 |
| Plaquages réussis | **690** | 120-250 |
| Passes | **1127** | (≈250-300 attendu) |
| Coups de pied | **119** | 30-80 |
| Mètres gagnés (une équipe) | **3251 m** | (≈500-600 attendu) |
| Essais / Points | 6 / 50 | 2-8 / 25-70 ✅ |
| Mêlées / Touches | 15 / 25 | 8-25 / 15-35 ✅ |

Le score, les essais, les mêlées et les touches sont justes. Le **volume de
jeu courant** est trois à cinq fois trop élevé : le match est un enchaînement
de rucks quasi ininterrompu. C'est le sujet « T2 » déjà instruit plus haut
dans ce fichier (le balayage de `rampeMontee` avait été documenté comme
insuffisant, sans changement appliqué). **Ce patch ne le corrige pas** — il le
rend enfin visible et chiffré à l'écran.

---

## P1-53 — Le ballon lent existe enfin au ruck (livrée)

### Comportement actuel observé (mesuré, pas déduit)

`DEFAULT_CONFIG.ruck` annonce, commentaire à l'appui, « exactement la
distribution mesurée au France-Irlande 2026 », et `ANALYSE_MATCH_REEL.md`
enregistrait cette calibration comme acquise (ligne « 47/39/14 % ✅ »).

Instrumentation de l'entrée et de la sortie de la phase RUCK, 5 matchs
complets (graines 7/11/23/42/99, 3100 rucks) :

| | < 3 s | 3-6 s | > 6 s | moyenne |
|---|---|---|---|---|
| Durée **tirée** du profil | 54,8 % | 33,2 % | 12,0 % | 3,57 s |
| Durée **réellement jouée** | **72,2 %** | 26,1 % | **1,7 %** | **2,52 s** |
| Référence France-Irlande 2026 | 52-63 % | 21-33 % | ~10 % | — |

**71,1 % des rucks étaient raccourcis en cours de phase**, et les rucks tirés
à 6 s et plus étaient joués en **4,29 s** de moyenne. Le palier « ballon
lent » du profil n'arrivait donc jamais à l'écran : 12 % annoncés, 1,7 %
joués.

### Pourquoi c'était insuffisant pour le joueur

Le ballon lent est ce qui fait respirer un match : un ruck disputé, une
défense qui a le temps de se replacer, une attaque obligée de changer de
solution. Sans lui, tous les rucks se ressemblent, le match s'emballe et il
n'y a plus de temps forts — c'est exactement le « enchaînement de rucks quasi
ininterrompu » constaté en P1-52.

### Fonction exacte responsable

`engine/rugby-engine.js`, `_tickRuck` :

```js
const dureeEffective = serviceRapide
  ? Math.min(dureeCible, Math.max(1.6 * this._echelleArret, dureeCible * 0.55))
  : dureeCible;
```

Ce facteur 0,55 s'applique à la durée **déjà tirée**, alors que le profil
contient déjà son palier de ballon rapide (55 % en 1,5-3 s) : la vitesse était
comptée deux fois, et un ballon tiré à 7 s ressortait servi en 3,85 s.

### Scénario de reproduction

Jouer un match complet en enregistrant `tempsMatch` à l'entrée et à la sortie
de `phase === 'RUCK'`, comparer à `ruckDureeCible`. Script conservé sous forme
de test.

### Test qui devait échouer AVANT la correction

`server/test-ruck.js` — 7 vérifications, **7 rouges avant ce patch** :

```
FAIL R1  le moteur doit exposer la règle de sortie de ruck
FAIL R2  RugbyEngine.dureeSortieRuck is not a function
FAIL R3  RugbyEngine.dureeSortieRuck is not a function
FAIL R4  RugbyEngine.dureeSortieRuck is not a function
FAIL R5  tirée 3.57s 54.8/33.2/12.0 % | jouée 2.52s 72.2/26.1/1.7 %
FAIL R6  un vrai match compte ~10 % de ballons lents (mesuré 1.7 %)
FAIL R7  le volume de rucks doit se rapprocher d'un vrai match (620/match)
```

### La correction

La mécanique de service rapide n'est **pas supprimée** — elle est bornée. En
termes de rugby : un 9 déjà à la base *gagne du temps de sortie*, il ne
transforme pas un ruck disputé en ballon rapide.

Règle extraite en fonction **pure et exportée** (`dureeSortieRuck`), comme en
P1-50b et P1-51 — l'effet est plus petit que le bruit d'un match, il se vérifie
donc sur la règle et pas sur une moyenne :

- gain borné à **0,9 s** (à l'échelle des arrêts de jeu) ;
- jamais sous le **plancher du profil lui-même** (`_plancherSortieRuck`, début
  du palier le plus rapide) ;
- récompense intacte sur les ballons déjà rapides : 2,4 s → 1,5 s, donc sous le
  seuil de 1,8 s qui ouvre la fenêtre « défense pas replacée »
  (`_defenseTardive`).

### Résultat mesuré (même protocole, 5 matchs)

| | < 3 s | 3-6 s | > 6 s | moyenne |
|---|---|---|---|---|
| Avant | 72,2 % | 26,1 % | 1,7 % | 2,52 s |
| **Après** | **60,4 %** | **31,6 %** | **7,9 %** | **3,04 s** |
| Référence réelle | 52-63 % | 21-33 % | ~10 % | — |

Les rucks tirés lents (cible ≥ 6 s) sont désormais joués **6,27 s** au lieu de
4,29 s. En match dans le navigateur (graine 7) : durées de ruck de **1,50 s à
7,75 s**, moyenne 3,04 s — avant, le maximum tenait sous 4,5 s.

### Effet sur les volumes (16 matchs par version, graines 7×1..16)

| | Avant | Après | Repère |
|---|---|---|---|
| Rucks | 649 | **595** | 70-180 |
| Passes | 1462 | **1422** | ≈250-300 |
| Plaquages | 660 | **643** | 120-250 |
| Cycle de phase | 4,73 s | **5,21 s** | ~11,5 s |
| Ballon en jeu | 61 % | **65 %** | ~44 % |
| Essais / Points | 5,9 / 47,3 | 5,9 / 48,6 | 2-8 / 25-70 ✅ |
| Mêlées / Touches | 20,5 / 23,5 | 18,2 / 23,6 | 8-25 / 15-35 ✅ |

Le volume reste **très au-dessus** du réel : ce patch corrige une règle, il ne
referme pas l'écart de tempo (−8 % de rucks). Il ne faut pas le lire comme la
calibration de volume.

### Régression assumée et chiffrée : −2 pénalités par match

20 matchs par version (graines 13×1..20) :

```
AVANT  moyenne 12,65  écart-type 3,07
APRÈS  moyenne 10,60  écart-type 3,69
écart -2,05  erreur-type 1,07  soit 1,9 erreur-type
```

La baisse est concentrée sur `PENALITE_RUCK_ISOLE` (7,8 → 5,0/match) et fait
passer le total sous le repère CLAUDE.md (12-30). **Elle n'a pas été
compensée, et c'est délibéré** : la seule faute de regroupement modélisée est
le « ballon non rendu » du porteur isolé. Calibrer aujourd'hui les fautes
manquantes (mains dans le ruck, non-libération, hors-jeu au ruck) reviendrait
à les régler sur un dénominateur faux — 595 rucks/match au lieu de ~180. Un
taux réaliste (~4 % par ruck) donnerait ici 25 pénalités au lieu de 8.
**Ordre correct : volume de rucks d'abord, fautes de regroupement ensuite.**

### Une documentation corrigée

`docs/ANALYSE_MATCH_REEL.md` affichait « Rucks < 3 s / 3-6 s / 6 s+ :
47/39/14 % ✅ ». C'était faux pour le match joué. Le fichier porte désormais
la mesure réelle, avant et après, ainsi que le fait que deux autres chiffres
de ce tableau (rucks 519, passes 1112) ne se retrouvent plus dans le moteur
actuel — des patchs postérieurs au balayage ont regonflé les volumes.

### Un test rouge, et pourquoi il ne fallait PAS l'assouplir

`server/test-touche.js` T9 (« désigner un VRAI spécialiste reste payant »)
**passait au commit précédent et échouait après ce patch** :

```
FAIL T9  désigner le seul vrai sauteur doit rester gagnant malgré la lisibilité
         (146/144 vs 139/137)
```

P1-53 ne touche pas la touche : il redistribue seulement le tirage aléatoire.
Avant de conclure quoi que ce soit, deux vérifications ont été faites.

**1. La grandeur mesurée était fausse.** Le moteur fait
`this.stats[gagnant].lineoutsGagnes++` — il compte aussi les touches **volées
sur le lancer adverse**. Le rapport `lineoutsGagnes / lineouts` n'est donc pas
un taux de conservation, et il dépasse 1 : d'où « 146 gagnées pour 144
lancées ».

**2. L'effet testé était du bruit, avant comme après.** Mesuré sur la bonne
grandeur (appariement `TOUCHE_LANCER` / `TOUCHE_BALLON_GAGNE`), 30 matchs par
configuration, sur les deux versions du moteur :

| | alignement libre | sauteur unique | écart | erreurs-types |
|---|---|---|---|---|
| Avant (989dd7e) | 84,8 % | 87,1 % | +2,31 pt | **0,9** |
| Après (P1-53) | 87,0 % | 86,3 % | −0,70 pt | **0,2** |

Dans les deux versions, l'effet est indiscernable de zéro sur 12 matchs. **Le
test passait par chance.** Ce n'est pas le patch qui a cassé la mécanique,
c'est le test qui lisait une pièce de monnaie comme une preuve.

**Ce qui a été fait** : T9 mesure désormais la conservation **sur son propre
lancer** (grandeur valide, plafonnée à 100 %) sur 16 matchs, et vérifie ce
qu'un match peut réellement établir — que désigner un spécialiste ne **coûte**
pas de ballons (marge 4 points ≈ 2 erreurs-types). La preuve *positive* que la
désignation est payante existe déjà au bon endroit : **T8bis**, qui la vérifie
directement sur la règle `probaVolTouche`, sans moyenne bruitée — la méthode
retenue depuis P1-50b. T8bis passe avant comme après.

---

## G1 — L'effectif ne doit plus devenir une pouponnière (livrée)

### Comportement actuel observé (mesuré, pas déduit)

Carrière de 8 saisons, graine 2026, effectif du club du joueur :

| Saison | Âge moyen | Âge max | < 23 ans | > 29 ans | Niveau moyen | Masse salariale |
|---|---|---|---|---|---|---|
| 1 | 26,8 | 34 | 5/24 | 8/24 | 55,1 | 594 k€ |
| 3 | 25,3 | 34 | 10/24 | 8/24 | 52,5 | 583 k€ |
| 4 | 23,7 | 34 | 15/24 | 6/24 | 51,4 | 537 k€ |
| **5** | **19,4** | **21** | **24/24** | **0/24** | 51,4 | 477 k€ |
| 8 | 19,8 | 21 | 24/24 | 0/24 | 48,7 | 483 k€ |

Au bout de quatre saisons, **il ne reste plus un seul joueur de plus de
22 ans**, et l'effectif ne s'en relève jamais.

Le monde entier suivait, puisque les clubs IA vieillissent par la MÊME
fonction (`vieillirClubIA` appelle `RMClub.vieillirEffectif`) — 13 clubs,
~325 joueurs suivis :

| Saison | Âge moyen IA | Doyen | Joueurs de plus de 29 ans |
|---|---|---|---|
| 1 | 25,5 | 34 | 79 |
| 5 | 24,0 | 36 | 68 |
| 7 | **20,5** | 36 | **9** |

Le championnat devenait une compétition de juniors.

### Pourquoi c'était insuffisant pour le joueur

Un effectif de rugby à XV, c'est une pyramide : quelques espoirs, un gros bloc
de joueurs confirmés, quelques cadres de 30-34 ans qui tiennent la mêlée et le
vestiaire. Ici, au bout de quatre saisons, le manager dirigeait une équipe de
juniors et affrontait des équipes de juniors. Plus de cadres, plus de
hiérarchie : le statut promis (cadre/rotation/espoir, P1-45) perd son sens
quand tout le monde a 19 ans, la masse salariale s'effondre de 20 % et avec
elle tout arbitrage financier, et le mercato perd son objet. La carrière
longue — la raison d'être d'un jeu de gestion — se vidait.

### Fonction exacte responsable

`docs/js/club.js`, `vieillirEffectif`, la boucle de remplacement :

```js
const jeune = global.RMClub.genererJoueurEtendu(posteManquant, rng, niveauClub);
jeune.age = 18 + Math.floor(rng() * 3); // jeunes espoirs, 18-20 ans
jeune.contrat = 2 + Math.floor(rng() * 2);
```

**Tous** les départs — retraites et fins de contrat, à tout âge — étaient
remplacés par des joueurs de 18 à 20 ans. La pyramide ne pouvait que
s'effondrer.

Effet de bord de la même ligne : `genererJoueurEtendu` avait déjà calculé
`potentiel` à partir de l'âge qu'il avait tiré (18-35). Écraser l'âge **après
coup** laissait un espoir de 18 ans avec le potentiel d'un joueur de 30 ans —
mesuré : **potentiel 53 pour un niveau de 55,8**, soit un espoir sans aucune
marge de progression.

### Scénario de reproduction

Jouer huit saisons complètes et relever la répartition des âges de l'effectif
à chaque intersaison. Conservé sous forme de test.

### Test qui devait échouer AVANT la correction

`server/test-pyramide-ages.js` — 8 vérifications, **6 rouges avant ce patch** :

```
FAIL Y1  une pyramide cible doit exister
FAIL Y2  RMClub.ageRecrueIntersaison is not a function
FAIL Y3  l'âge moyen d'un effectif pro tient entre 23 et 29 ans
         (S5 : 19.4 ans, max 21, 0 de plus de 29 ...)
FAIL Y4  un effectif de 24 compte au moins deux joueurs de 30 ans et plus
FAIL Y5  un joueur de 18 ans doit avoir une marge de progression
         (potentiel 53, niveau 55.8)
FAIL Y7  les clubs adverses gardent eux aussi une pyramide
         (S1 25.5 | S5 24.0 | S7 20.5 | S8 20.8)
OK   Y6  les contrats n'expirent pas tous en même temps
OK   Y8  taille d'effectif et couverture des postes intactes
```

Y6 et Y8 étaient verts **avant** : ce sont les garde-fous du patch, pas ses
preuves.

### La correction

Une pyramide cible explicite, et une règle **pure et exportée** qui comble la
tranche la plus déficitaire — la règle se vérifie directement, sans jouer une
carrière entière (même méthode que P1-50b/P1-51/P1-53) :

```js
const PYRAMIDE_AGES = [
  { min: 18, max: 21, part: 0.18 }, // espoirs
  { min: 22, max: 25, part: 0.30 }, // en développement
  { min: 26, max: 29, part: 0.32 }, // au sommet
  { min: 30, max: 34, part: 0.20 }, // cadres
];
ageRecrueIntersaison(effectif, rng)   // comble la tranche qui manque
contratRecrueIntersaison(age, rng)    // 3-4 saisons pour un espoir, 1-2 pour un cadre
```

L'âge est désormais décidé **avant** la génération : `genererJoueurEtendu`
accepte `options.age` et calcule le potentiel à partir de l'âge réel. Le
tirage d'âge interne reste consommé dans tous les cas, pour que l'ordre des
appels à `rng()` ne dépende pas du chemin d'appel.

### Résultat mesuré (même protocole)

Club du joueur :

| Saison | Âge moyen | Doyen | > 29 ans | Niveau moyen | Masse |
|---|---|---|---|---|---|
| 1 | 26,8 | 34 | 8 | 55,1 | 594 |
| 3 | 27,8 | 36 | 11 | 54,0 | 633 |
| 5 | **26,0** | **32** | **5** | 54,4 | 660 |
| 8 | **26,0** | **34** | **5** | **54,6** | 641 |

Le monde : âge moyen IA **26,0** en S8 (contre 20,5), et **71 joueurs de plus
de 29 ans sur 328** (22 %) contre 9 sur 325 (2,8 %).

Le niveau moyen ne s'érode plus (54-55 stable contre 55,1 → 48,7).

### Coût financier vérifié

La masse salariale remonte vers son niveau de départ (594 → 622-660 k€) au
lieu de s'effondrer à 477. Mesuré sur 8 saisons avec `appliquerFinancesMatch`,
le **même appel que le jeu réel** : excédent annuel **6 110-6 385 k€ avant,
5 890-6 220 après, soit −4 %**. Le club reste très largement bénéficiaire ;
aucun risque de faillite introduit.

### Deux erreurs de mesure de ma part, corrigées

1. Mon premier harnais lisait le budget après `enregistrerResultatClubJoueur`
   et le trouvait **figé à 390 k€ sur 8 saisons**. Faux : les finances ne
   s'appliquent qu'à la résolution réelle d'une journée
   (`appliquerFinancesMatch`, appelé depuis `clubUI.js`), que ce chemin
   court-circuite. Ce n'est pas un défaut du jeu.
2. Y5 échouait encore après correction : je comparais le potentiel à une
   moyenne de **quatre** attributs alors que `genererPotentiel` le calcule sur
   **sept**. C'était mon test qui était faux, pas le code — corrigé dans le
   test, pas dans le moteur.

### Observation NON établie, à vérifier séparément

Sur ce même harnais, le club accumule de l'ordre de 6 M€ d'excédent par saison
(50 M€ après huit saisons) pour un budget de départ de 390 k€. Le chiffre
absolu n'est **pas** fiable ici : le harnais compte 60 journées financières par
saison, ce qui doit être confronté au déroulé réel dans l'interface avant d'en
conclure quoi que ce soit. À instruire à part.

---

## G2 — La billetterie n'est plus encaissée à l'extérieur (livrée)

### Comportement actuel observé (mesuré, pas déduit)

`docs/js/club.js`, `appliquerFinancesMatch(club, forme, nbJournees)` : la
signature ne recevait **pas** le côté du match. La recette de billetterie était
donc créditée aux 26 journées, les 13 déplacements compris.

Décomposition d'une saison de championnat, avec le MÊME appel que le jeu
(graine 2026, 26 rencontres) :

| Poste | Montant |
|---|---|
| Billetterie | **+2 341 k€** (26 matchs) |
| Sponsor | +728 k€ |
| Salaires joueurs | −598 k€ |
| **Solde** | **+2 471 k€** |

Pour un budget de départ de **390 k€** : le club multipliait sa trésorerie par
7,3 en une saison, et les salaires ne pesaient que **19 % des recettes** (un
vrai club : 55-60 %).

Le jeu se contredisait lui-même : le chantier « Stade » annonce au manager
« Recette de billetterie à chaque match **à domicile** »
(`club-infrastructures.js`). Le code la créditait partout.

Et l'information existait : `clubUI.js` calcule
`estClubJoueur(matchJoueur.domicileId)` deux lignes plus haut pour choisir la
lettre d'équipe du moteur. Elle n'était simplement jamais transmise aux
finances.

### Pourquoi c'était insuffisant pour le joueur

La trésorerie n'était jamais une contrainte. Un budget qui monte tout seul de
2,5 M€ par saison vide de tout enjeu ce qui touche à l'argent — le mercato, les
ventes (P1-48), les chantiers (320 k€ le stade, 260 k€ le centre médical), la
prévision de trésorerie (P1-47) qui n'affichait jamais que du vert. Et le
calendrier perdait un de ses reliefs : une série à l'extérieur devrait serrer
les comptes, une série à domicile les desserrer.

### Test qui devait échouer AVANT la correction

`server/test-recettes-domicile.js` — 7 vérifications, **5 rouges avant** :

```
FAIL R1  un déplacement ne rapporte AUCUNE billetterie (101)
FAIL R2  un déplacement doit avoir un coût chiffré
FAIL R4  départ 390 k€ ; billetterie 2341, sponsor 728, salaires -598,
         déplacements undefined, solde 2471
FAIL R6  cinq réceptions doivent peser plus que cinq déplacements (0 k€)
FAIL R7  l'appel doit transmettre le côté du match
OK   R3  sponsor et salaires courent à chaque journée
OK   R5  le grand livre reste exact
```

R6 à 0 k€ résume tout : domicile et extérieur étaient financièrement
identiques.

### La correction

`appliquerFinancesMatch(club, forme, nbJournees, options)` reçoit
`options.domicile`. À domicile, billetterie comme avant ; à l'extérieur,
billetterie nulle et **coût de déplacement** réel (voyage et hébergement du
groupe), inscrit dans sa propre catégorie au grand livre. Le sponsor et les
salaires, eux, courent à chaque journée.

`options.domicile` vaut `true` par défaut : les appelants historiques (tests
d'économie et d'infrastructures) mesurent tous la recette d'une réception,
leur sens ne change pas. Le seul appelant de jeu transmet le côté réel.

Coût calibré sur l'échelle monétaire du jeu — salaires 18 à 34 k€/saison,
budget de départ 390 k€, budgets IA 262 à 474 k€ — soit ~13 k€ par voyage au
niveau de départ, ~170 k€ sur les 13 déplacements d'une saison.

### Résultat mesuré (même protocole)

| Poste | Avant | Après |
|---|---|---|
| Billetterie | 2 341 | **1 213** |
| Sponsor | 728 | 728 |
| Salaires | −598 | −598 |
| Déplacements | — | **−169** |
| **Solde de saison** | **+2 471** | **+1 174** |
| Solde net moyen / journée | +95 k€ | **+49 k€** |

Vérifié à l'écran dans le navigateur : l'onglet Finances affiche
« Déplacements −169 k€ » comme poste distinct (le panneau est construit depuis
les catégories du grand livre, aucune retouche d'interface nécessaire), aucune
erreur page.

### CE QUE CE PATCH NE CORRIGE PAS

Le club gagne **encore +1 174 k€ par saison**, soit trois fois son budget de
départ. La trésorerie n'est donc **toujours pas** une contrainte. La cause
restante n'est plus le côté du match, c'est l'**échelle** : sur une saison,
1 941 k€ de recettes contre 767 k€ de charges — les salaires pèsent 31 % des
recettes quand un vrai club est à 55-60 %. Il faudrait des recettes de l'ordre
de 900 k€ à 1,1 M€ pour un effectif payé 598 k€.

Ce n'est pas corrigé ici parce que c'est un autre patch : il touche la base de
billetterie, la génération du sponsor (donc les sauvegardes) et la rentabilité
des chantiers d'infrastructures. Le test R4 **verrouille l'écart constaté**
pour qu'il ne s'aggrave pas en silence.

### Deux erreurs de mesure de ma part, corrigées

1. J'ai d'abord lu `c.journeesFinancieres` et l'ai trouvé `undefined`, en
   croyant à un compteur cassé. Faux : il vit dans `c.comptes`, et il compte
   bien 26. Rien à corriger.
2. `RMClub.valeurMarchande(joueur)` me renvoyait 0 pour tout l'effectif. Ma
   signature était fausse — la fonction est `valeurMarchande(saison, joueur)`.
   Aucun défaut du code.

---

## G3 — L'économie du club à l'échelle, et les installations qui s'exploitent (livrée)

### Comportement observé (mesuré, après G2)

Saison de championnat, graine 2026 : billetterie +1 213, sponsor +728,
salaires −598, déplacements −169 → **solde +1 174 k€** pour un budget de départ
de 390 k€. Les salaires pesaient **31 % des recettes** (un vrai club : 55-60 %).
Sur huit saisons : **9 193 k€** de trésorerie, +1 100 k€ par exercice, comme
une horloge.

Second manque, de la même famille : les infrastructures (stade, centre
médical, centre de formation, terrains — cinq niveaux chacune) étaient du
**pur bénéfice**. On payait le chantier une fois, le gain était acquis pour
toujours et ne coûtait plus jamais rien. Monter un niveau était donc toujours
le bon choix, ce qui n'est pas un choix.

### La correction

1. **Barème des recettes ramené à l'échelle des salaires** : billetterie
   `(22 + niveauClub*65 + prime)` au lieu de `(40 + niveauClub*120 + prime)`,
   sponsor `8 + niveauClub*22 + alea*5` au lieu de `15 + niveauClub*40 +
   alea*10`. Le sponsor étant tiré une seule fois et stocké, migration 7 → 8.
2. **Charge d'exploitation** (`coutEntretienInfrastructures`, pure et
   exportée), nouveau poste `entretien` au grand livre : le club paie chaque
   journée pour faire tourner ses installations.

### Résultat mesuré (8 saisons)

| | Avant | Après |
|---|---|---|
| Billetterie | 1 213 | 628-644 |
| Sponsor | 728 | 390 |
| Entretien | — | −182 |
| **Solde de saison** | **+1 174** | **+15 à +79** |
| Trésorerie après 8 saisons | **9 193** | **704** |
| Salaires / recettes | 31 % | **59-64 %** |

Le manager a de vrais leviers : vendre un joueur rapporte 435 à 503 k€, un
chantier coûte 220 à 320 k€. Vendre pour construire devient un arbitrage réel.
Tout monter au niveau 5 coûterait 468 k€ d'exploitation par saison — un
engagement qu'il faut financer.

### Une erreur de calibrage de ma part, que seule la mesure a montrée

Première version : surcoût d'entretien à 1,7 k€ par niveau, comme la charge de
base. Le stade niveau 2 rapportait +104 k€/saison pour +44 k€ d'entretien, soit
un **retour sur investissement de 6,2 saisons** sur un chantier à 320 k€ —
techniquement « rentable », concrètement un piège que personne n'aurait
construit. La charge de base (incompressible, 1,7 k€) a donc été séparée du
surcoût par niveau (0,7 k€) : retour ramené à **4,1 saisons**. Le test E5
verrouille désormais le retour sur investissement, pas seulement la
rentabilité.

Et un bug dans mon propre test : je lisais `coutAmelioration` sur un club déjà
monté au niveau 2, donc le prix du niveau 3 (496 k€) au lieu du niveau 2
(320 k€). Corrigé dans le test.

---

## G4 — Effectif → contrats → négociations → transferts → finances (livrée)

### Audit de l'existant, vérifié dans le code (pas supposé)

**Ce qui marchait déjà, et n'a pas été refait :**
- Écran Effectif : tableau triable (10 colonnes), filtres recherche/poste/
  disponibilité, comparaison, fiche joueur cliquable.
- Contrats : `contrat` (saisons restantes) + `salaire`, expiration **réelle**
  à l'intersaison (`vieillirEffectif` fait partir tout contrat à zéro).
- Proposition asynchrone : `proposerContrat` → réponse 3 jours plus tard.
- Offres **reçues** : les clubs adverses achètent mes joueurs, décision dans la
  boîte de réception, budgets des deux clubs réellement débités.
- Finances : grand livre complet, invariant vérifié.
- Sauvegarde versionnée avec migrations.
- Clubs IA : mercato d'intersaison (achats/ventes entre eux), signature de
  joueurs libres, un rival peut signer un joueur du marché avant moi.

**Ce qui n'existait pas :**
- Une négociation n'avait que **deux issues** : oui ou non. Ni
  contre-proposition, ni délai de réflexion, ni rupture des discussions.
- Aucune prime, aucune satisfaction contractuelle, aucune volonté exprimée de
  prolonger, aucune saison d'échéance lisible.
- Impossible de **rompre** un contrat en cours ni d'annoncer un
  non-renouvellement.
- Les clubs IA ne **prolongeaient jamais** personne avant expiration : ils
  subissaient leur effectif.

**Une erreur de mon audit, corrigée :** j'avais noté « impossible de faire une
offre pour le joueur d'un club adverse ». **Faux** : `approcherJoueurAdverse`
(club-transferts-internationaux.js) existait. Mais en le lisant, il s'avère
superficiel — instantané, sans négociation, il **ne créditait pas le club
vendeur** et remplaçait aussitôt le joueur par un clone du même numéro. Le
rival ne perdait donc personne et l'argent disparaissait. Il reste exporté (des
tests s'appuient dessus) mais l'interface passe désormais par le vrai flux.

### Ce qui a été ajouté

`docs/js/club-negociations.js` (nouveau) :
- **Champs de contrat** : `saisonFinContrat`, `salaireDeMarche`,
  `satisfactionContrat` (dérivée du salaire face au marché, du statut promis
  face au temps de jeu réel, du moral), `volonteProlonger` (souhaite / ouvert /
  réticent / veut partir), `interetExterieur` (clubs qui ont un besoin réel au
  poste ET les moyens), prime de contrat.
- **`evaluerOffreContrat`** — fonction pure et exportée, **cinq issues** :
  acceptation, contre-proposition, délai de réflexion, refus, rupture. Les
  facteurs exigés sont tous là : salaire, niveau/valeur, statut, temps de jeu,
  moral, réputation du club, durée, intérêt d'autres clubs.
- **Offres sortantes** : `proposerOffreTransfert` → réponse du club sous 4
  jours (accepte / contre-propose / refuse) → `finaliserAchat` déplace
  réellement le joueur ET l'argent dans les deux sens.
- **Rupture et non-renouvellement** : `indemniteRupture`, `rompreContrat`
  (indemnité décaissée, vestiaire affecté, garde-fou « dernier au poste »),
  `basculerNonRenouvellement`.
- **Clubs IA** : `prolongationsClubsIA`, appelée **avant** le vieillissement
  dans `avancerIntersaisonClubsIA`. Distincte de `recruterJoueursLibres` (qui
  signe les libres **des autres**) : ici un club retient **les siens**.

### Une seule règle de décision

`negocierRenouvellement` et `resoudreNegociationsContrat` (club-contrats.js) ne
décident plus : ils délèguent à `exigenceSalariale` et `avancerNegociations`.
Leur signature et leur forme de retour sont inchangées pour les appelants
historiques. Sans ça, deux barèmes auraient fini par diverger et un joueur
n'aurait pas eu le même prix selon le chemin emprunté.

### Interface

- **Sous-onglet « Contrats »** dans l'onglet Effectif (pas un onglet de plus) :
  nom, poste, âge, niveau, salaire, valeur, fin de contrat, moral,
  satisfaction, avenir, statut. Tri sur toutes les colonnes, filtres
  « expirant » et « à risque », alerte visuelle sur les échéances.
- Un clic sur une ligne ouvre **la même** fiche joueur que l'effectif — aucune
  seconde interface.
- Fiche joueur : fin de contrat, satisfaction, avenir, prétentions estimées,
  clubs intéressés, puis **Négocier (salaire, durée, prime)**, **Ne pas
  renouveler**, **Rompre le contrat (N k€)**.
- **Joueurs des clubs de la division** dans Recrutement, filtrables par poste,
  avec prix demandé et bouton d'offre.
- Chaque refus est **expliqué** et chiffré (budget manquant, fenêtre fermée,
  offre déjà en cours, dernier joueur du poste).

### Un défaut trouvé en écrivant le test

La rupture n'arrivait qu'au **troisième** refus alors que la règle annoncée est
« au-delà de deux refus » : `refusPrecedents` valait 1 au deuxième passage,
donc jamais 2. Corrigé dans `evaluerOffreContrat`.

### Tests

`server/test-contrats-transferts.js` — 20 vérifications couvrant les douze cas
exigés : prolongation acceptée, contre-proposition (et compromis), refus,
contrat expiré, départ libre, liste des transferts, offre d'un club IA,
transfert finalisé, budget insuffisant, masse salariale, sauvegarde/
rechargement d'une négociation, décisions autonomes des clubs IA.

Parcours public complet piloté dans Chromium, **ordinateur (1440×900) et
mobile (390×844)** : accueil → reprise de saison → onglet Effectif →
sous-onglet Contrats → clic sur une ligne → fiche → négociation → réponse dans
la boîte de réception → finances mises à jour → sauvegarde/rechargement. Aucune
erreur console, aucun débordement horizontal sur mobile.

**Deux erreurs de mon harnais de test, corrigées** : je créais la carrière dans
une variable à part sans recharger la page (l'interface montrait l'accueil), et
je naviguais avec `[data-menu]` alors que l'application utilise
`.ongletBtn[data-onglet]`. Dans les deux cas le produit allait bien, c'est le
test qui mentait.

### Points restants

- Les clubs IA ne formulent pas encore d'offre pour un joueur **d'un autre club
  IA** en cours de saison (leur marché reste l'intersaison).
- La confiance de la direction ne réagit pas encore spécifiquement à une
  rupture de contrat coûteuse (le budget, lui, est bien impacté et suivi par le
  plancher financier existant).

---

## G5 — Le marché ne s'arrête plus, et il redevient payable (livrée)

### Comportement observé (mesuré, pas déduit)

**1. Le marché s'arrêtait entre deux intersaisons.** 300 jours simulés,
graine 777 :

```
joueurs ayant changé de club IA en cours de saison : 0
clubs IA dont le budget a bougé                    : 3 / 13
```

Les rivaux savaient signer un joueur **libre** en saison
(`signatureRivaleDuJour`) et s'échanger des joueurs **à l'intersaison**
(`mercatoClubsIA`). Entre les deux, rien : une cible repérée chez un rival y
était encore six mois plus tard, quoi qu'il arrive.

**2. Et en cherchant pourquoi, un défaut bien plus large.** Instrumentation de
5 184 paires (club qui cherche à un poste × joueur cédable à ce poste), sur
20 saisons :

| | |
|---|---|
| paires examinées | 5 184 |
| dont assez bonnes pour intéresser l'acheteur | **754** |
| dont **payables** | **0** |

Prix demandés : **523 à 621 k€**, pour des budgets de clubs IA de **263 à
398 k€** et un plafond d'achat de 92 à 139 k€. Le marché entre clubs était
donc inerte **partout**, intersaison comprise — `mercatoClubsIA` tournait à
vide depuis toujours.

Et depuis que les recettes ont été ramenées à l'échelle des salaires (G3), le
**manager lui-même** ne pouvait plus rien acheter : une seule recrue coûtait
plus qu'une saison entière de budget. G4 le masquait en forçant le budget dans
ses tests.

### La cause

`estimerValeurTransfert` valait `(vitesse + plaquage) * 3 + (30 - âge) * 5`,
soit ~415 k€ de valeur de base — **environ 16 fois le salaire annuel du même
joueur** (18 à 34 k€/saison). Une indemnité de transfert se compte en années
de salaire ; celle-ci n'était rattachée à rien.

### La correction

1. **Barème repris sur le salaire** : 4,5 années pour un joueur dans sa force
   de l'âge, 3,5 puis 2,5 puis 1,8 ensuite.
2. **`prixDe` (entre clubs de la même division)** n'applique plus la surcote
   de 1,6 de `calculerPrixDemandeAdverse` : celle-ci vise le manager, acheteur
   extérieur au marché. Entre rivaux qui se vendent des joueurs tous les ans,
   la prime tombe à 1,15 — la prime de « joueur clé » est conservée.
3. **`tenterTransfertRival`** : le pas élémentaire d'un transfert entre deux
   clubs, **extrait** de `mercatoClubsIA` pour être appelé aussi en saison.
   Une seule règle, donc — sans cette extraction, le marché de saison aurait eu
   son propre barème.
4. **`transfertRivalDuJour`** : appelé chaque jour par `avancerJourMercato`,
   même fenêtre de transfert que le manager, canal de tirage **dédié** (43)
   pour ne pas décaler les tirages existants. Le manager reçoit un message
   « Transfert dans la division » : il voit le marché bouger autour de lui.
5. **La direction réagit à une rupture de contrat coûteuse** (au-delà de
   40 k€ d'indemnité) : c'est un aveu d'erreur de gestion, la confiance baisse
   proportionnellement. Une rupture anodine ne l'émeut pas.

### Résultat mesuré

| | Avant | Après |
|---|---|---|
| Transferts entre clubs IA en saison (300 j) | **0** | **9** |
| Clubs IA dont le budget bouge | 3/13 | **12/13** |
| Candidats au transfert payables | 0 / 754 | **163 / 754** |
| Prix demandés | 523-621 k€ | **48-203 k€** |

Pour le manager (budget de départ 434 k€) : **100 cibles sur 100 sont
abordables**, ses propres joueurs valent 104 k€ (médiane) à 171 k€, et un
chantier coûte 220 à 320 k€. Acheter, vendre et construire deviennent enfin
des arbitrages entre eux.

### Un test rendu robuste, pas assoupli

`avancerJusquAuProchainMatch : s'arrête le jour du match` échouait après le
changement : la graine 903 rencontrait désormais une blessure d'entraînement
et une offre reçue avant le match. **Les deux arrêts sont légitimes** — c'est
exactement la raison d'être de cette fonction. Le comportement testé n'a pas
bougé, c'est le trajet de la graine qui a changé. Le test relance donc l'avance
jusqu'au match, comme le manager reclique après avoir traité l'événement, au
lieu de supposer qu'une graine traverse la semaine sans rien rencontrer.

---

## G6 — Le marché vient aussi vers le manager (livrée)

### Comportement observé (mesuré, pas déduit)

300 jours simulés, graine 1234, messages réellement reçus :

```
19 × Retour de blessure
16 × Blessure à l'entraînement
 3 × Offre reçue              <- un rival veut MON joueur
 2 × Transfert dans la division
décisions proposées : offreAchat, offreAchat, offreAchat
un club m'a-t-il PROPOSÉ un joueur ? NON
```

Le manager pouvait aller chercher un joueur chez un rival (G4), les rivaux
venaient lui acheter les siens (P1-48), et depuis G5 ils s'échangent des
joueurs entre eux. Mais **aucun club ne lui proposait jamais** un joueur dont
il veut se défaire — alors qu'ils en ont : `cessiblesDe` en trouve à tous les
postes, et c'est exactement ce qu'ils se vendent entre eux.

### Pourquoi c'était insuffisant

Le manager devait tout initier. Un vrai marché vient aussi vers lui — un club
qui dégraisse, un agent qui appelle. Sans ça, l'onglet Recrutement est un
catalogue qu'on consulte, jamais une place de marché, et le manager n'a aucune
occasion de saisir une opportunité qu'il n'aurait pas cherchée.

### La correction

`propositionVenteRivaleDuJour` (club-negociations.js), appelée chaque jour par
la boucle quotidienne avec un canal de tirage **dédié** (47) :

- une proposition n'arrive pas au hasard — un club qui a un **surplus**
  (`cessiblesDe`) à un poste où le manager a un **besoin réel** (`besoinsDe`,
  la même règle que pour les clubs IA), et seulement si le joueur améliore
  vraiment l'effectif ;
- **une seule grille tarifaire** : `prixDemandeAuManager`, désormais utilisée
  par le catalogue (`joueursDesClubsAdverses`) **et** par les propositions —
  le manager ne peut pas voir deux prix pour le même joueur selon l'écran ;
- une vraie décision dans la boîte de réception : **payer**, **proposer moins**
  (ouvre une négociation réelle via `proposerOffreTransfert`), ou **décliner** ;
- une échéance : sans réponse, le club retire son joueur ;
- un seul dossier ouvert à la fois, et **jamais deux fois le même joueur**.

### Un défaut trouvé en écrivant le test

Le même joueur était proposé deux fois dans la saison (`adv-club14-3`) : je ne
regardais que les propositions **non résolues**, donc décliner un joueur
permettait au club de revenir à la charge avec lui. Corrigé (`dejaPropose`).

### Résultat mesuré

| | Avant | Après |
|---|---|---|
| Propositions reçues (300 j) | **0** | **2** |
| Types de décisions reçues | offreAchat seul | offreAchat + propositionVente |

Vérifié dans le navigateur (mobile 390×844), de bout en bout : la proposition
apparaît au dashboard — « Bellerive Dragons accepterait de céder Arthur Simon
(OV, 19 ans) pour 119 k€ » — avec ses trois boutons ; « Payer 119 k€ » fait
passer l'effectif de 24 à 25 et le budget de 3000 à 2881 k€, et produit le
message « Transfert conclu ». Aucune erreur page. Aucun code d'affichage
spécifique n'a été nécessaire : la boîte de réception rend les options de
n'importe quelle décision.

### Au passage

Un commentaire de `club-mercato.js` affirmait encore que `prixDe` utilisait
« exactement la formule déjà utilisée quand c'est le MANAGER qui achète ».
C'était devenu faux avec G5 (les clubs de la même division ne paient plus la
surcote destinée à un acheteur extérieur). Commentaire retiré.

---

## G7 — La Coupe des Espoirs se joue enfin avec les espoirs (livrée)

### Comportement observé (mesuré, pas déduit)

Carrière neuve, graine 4242. Le club du joueur est engagé d'office dans sa
Coupe des Espoirs — une compétition d'ACADÉMIES (cf. `genererCompetitionEspoirs`).
Son adversaire en demi-finale : « Académie Hautecombe Sangliers », niveau 0,052.

```
niveau du club joueur DANS CETTE COUPE : 0.105   (son niveau pro réel : 0.300)
effectif pro    : 24 joueurs, âge moyen 26.6
effectif espoirs: 15 joueurs, âge moyen 17.1

AVANT le match   pro:   0 fatigue,  0 matchs | espoirs: 0 fatigue, 0 matchs
APRÈS le match   pro: 451 fatigue, 15 matchs | espoirs: 0 fatigue, 0 matchs
```

Le tableau savait déjà que c'était une compétition de jeunes : il inscrivait le
club à un niveau dérivé (0,105, cf. `niveauAdversaireEspoirs`) et non à son
niveau pro. Mais l'interface faisait quand même jouer le **premier XV**.

### Pourquoi c'était insuffisant

Trois conséquences, toutes visibles en jeu :

1. Le manager voyait son équipe première rentrer **épuisée d'un match qu'elle
   n'avait pas à disputer** — 451 points de fatigue et un match de plus au
   compteur de quinze professionnels, à trois jours d'une journée de
   championnat.
2. Ses **espoirs ne jouaient jamais leur propre coupe** : aucune minute, aucune
   statistique, aucune progression. Le centre de formation restait décoratif
   dans la seule compétition qui lui était destinée.
3. Le résultat était une **farce** : des pros de 26,6 ans contre une académie
   de 17 ans. Mesuré après correction, sur de vraies rencontres jouées dans le
   navigateur : 3-8, 0-13, 0-0 après prolongation. Une coupe des jeunes
   redevient un match.

### Fonction exacte responsable

`resoudreCoupeDuJour` (docs/js/clubUI.js) :

```js
const slot = RMClub.slotCompositionPourEquipe(saison, 'pro');   // pour TOUTES les coupes
```

puis `appliquerConsequencesMatchCoupe` qui appliquait `{ equipe: 'pro' }` sur
`c.effectif`.

### Scénario de reproduction

Créer une carrière, avancer jusqu'au 26 septembre (demi-finale de la Coupe des
Espoirs), jouer le match : le compteur `matchsJoues` des quinze titulaires
professionnels augmente de 1, celui des espoirs reste à 0.

### La correction

- `equipePourCoupe(cle)` (club-coupes.js) — **source unique** de la règle,
  `espoirs → jeunes`, tout le reste `pro`, une coupe inconnue reste `pro`.
- `appliquerConsequencesMatchCoupe` prend `equipe` et applique fatigue, moral et
  statistiques à l'effectif correspondant (`effectifPourEquipe`).
- `resoudreCoupeDuJour` lit la règle et utilise le slot, l'effectif et la
  tactique de cette équipe — plus rien n'est codé en dur.
- Le message dit **qui a joué** : « Tes espoirs éliminent … », même voix que le
  championnat espoirs.
- Nouveau cas honnête : un club sans XV alignable (centre de formation vidé)
  bloquait la journée — l'interface refusait de jouer et personne ne résolvait
  la rencontre. `resoudreCoupeSansEquipe` la résout comme les autres du tour,
  sur les niveaux réels du tableau, et prévient le manager.

### Résultat mesuré

| | Avant | Après |
|---|---|---|
| Matchs comptés au XV pro | **15** | **0** |
| Fatigue du XV pro | **+451** | **0** (delta 67, sous les 138 d'un jour ordinaire) |
| Matchs comptés aux espoirs | **0** | **15** |
| Score type | pros vs académie | 3-8, 0-13, 0-0 a.p. |
| Jour bloqué sans XV espoirs | **oui** | non, rencontre résolue |

Vérifié dans le navigateur (bureau 1280×900 et mobile 390×844), en jouant
réellement la demi-finale du 26 septembre : zéro erreur console, retour au
panneau du club, message « Tes espoirs s'inclinent face à Académie … ».

Couverture : `server/test-consequences-coupe-amical.js`, cas K7 à K11 (les
trois premiers écrivaient rouge avant la correction).

---

## G8 — Inscrire ses joueurs aux compétitions (livrée)

### Comportement observé (mesuré, pas déduit)

Recherche sur tout `docs/js` : **aucune occurrence** d'inscription ou
d'éligibilité à une compétition. Conséquences réelles en jeu :

- un joueur recruté la veille d'une finale pouvait la disputer ;
- un joueur de 32 ans pouvait jouer le championnat des espoirs ;
- la taille du groupe n'était contrainte par rien ;
- donc **recruter tard ne coûtait rien**, et le manager n'avait aucune
  décision d'effectif à prendre en début de saison.

### La correction

`club-inscriptions.js` : une liste d'inscrits par compétition, un plafond de
places, une **vraie date limite** du calendrier, et une limite d'âge pour les
espoirs. La règle d'équipe d'une coupe vient de `equipePourCoupe` — il
n'existe pas deux endroits qui décident quelle équipe joue quoi.

Trois garde-fous pour ne casser aucune partie :

1. l'effectif éligible est inscrit d'office **tant que la fenêtre est
   ouverte** — une carrière en cours ne se retrouve jamais sans équipe ;
2. au-delà du plafond, les places vont aux **meilleurs**, jamais au hasard ;
3. tout refus porte un motif ET un message lisible (`age`, `horsEffectif`,
   `plafond`, `fenetreFermee`).

Branchements réels : `verifierInscriptions` bloque le coup d'envoi du
championnat et des coupes en **nommant** les joueurs fautifs ;
`assurerInscriptions` tourne à chaque jour écoulé (une recrue arrivée avant la
limite est inscrite d'office, après elle ne l'est plus) ;
`reinitialiserInscriptions` à la fin de saison ; migration v9 → v10.

### Résultat mesuré (navigateur, bureau et mobile)

```
Ligue Régionale  fenêtre ouverte jusqu'au lundi 16 septembre 2024
                 Inscrits 24 / 30 (6 places libres)          48 boutons d'action
Championnat des espoirs   Inscrits 15 / 26   Limite d'âge 21 ans
retrait d'un inscrit : 24 → 23   après rechargement : 23
```

Zéro erreur console. Couverture : `server/test-inscriptions.js`, 12 cas — les
12 écrivaient rouge avant la correction.

### La décision de manager créée

Avant la date limite : quels 30 joueurs engager, sachant qu'un jeune de 22 ans
n'est plus éligible en espoirs et qu'une recrue de janvier ne jouera pas la
compétition. Le choix se fige et engage la saison.

---

## G9 — Deux installations sur quatre ne servaient à rien (livrée)

### Comportement observé (mesuré, pas déduit)

Niveau 1 contre niveau 3, sur la même carrière :

```
stade         effet déclaré ×1,36   recette d'un match  56 → 75   BRANCHÉ
medical       effet déclaré ×1,18   risque de blessure divisé     BRANCHÉ
formation     effet déclaré ×1,40   AUCUN consommateur            décoratif
entrainement  effet déclaré ×1,24   AUCUN consommateur            décoratif
```

`effetInfrastructure` n'avait que **deux** appelants dans tout le projet :
`club-medical.js` et une ligne d'affichage de son propre module. Le centre de
formation (300 k€, 60 jours de travaux) et les terrains d'entraînement
(220 k€, 30 jours) affichaient un gain, coûtaient un chantier ET un entretien
à chaque journée — sans rien changer au jeu. Le manager payait pour rien.

### La correction

- **Terrains** : `appliquerSeance` multiplie la chance de progression par le
  facteur de l'installation, exactement comme le facteur entraîneur.
- **Centre de formation** : les jeunes déjà présents voient leur potentiel
  s'affiner à chaque intersaison, et les jeunes recrutés arrivent avec un
  meilleur potentiel (`genererJeune` reçoit le facteur).

### Résultat mesuré

| | Niveau 1 | Niveau 2 | Niveau 3 |
|---|---|---|---|
| Terrains — progressions sur 60 séances | **155** | 177 | **193** |
| Formation — potentiel moyen des jeunes | **51,1** | 53,1 | **55,1** |

### Un piège de mesure, et ce qu'il a appris

Première mesure : 3 progressions au niveau 1 comme au niveau 3, et le compte
restait à 3 sur 40, 200 ou 600 séances. Cause réelle : un joueur ne progresse
jamais au-delà de son potentiel (`actuel >= potentiel`), et un effectif de
départ sature après trois séances utiles. Le test donne donc désormais une
marge de progression explicite — sans quoi il aurait validé n'importe quoi.

Couverture : `server/test-infrastructures-effets.js`, 5 cas. **F4 est le
garde-fou de fond** : il relit tout `docs/js` et échoue si une installation
n'est lue par aucun module autre que le sien — un futur bonus décoratif ne
peut plus passer inaperçu.

---

## G10 — Aider le manager à faire tourner son effectif (livrée)

### Comportement observé (mesuré, pas déduit)

Toute la donnée existait — fatigue, endurance, `matchsJoues`, statut promis,
gabarit de 24 places sur 9 postes, récupération de 5 points par jour — mais
rien ne l'agrégeait :

```
profondeurEffectif  -> undefined
suggestionRotation  -> undefined
recuperationPrevue  -> undefined
```

Le manager voyait une barre de fatigue par joueur et devait faire lui-même le
calcul : qui reposer, qui est doublure à quel poste, et dans combien de jours
un titulaire cuit redevient alignable.

### La correction

`club-rotation.js`, qui **ne modifie rien** :

- **profondeur par poste** : titulaire / doublure / troisième choix, avec les
  postes sans doublure disponible signalés comme fragiles ;
- **charge** : surcharge (fatigue ≥ 75, ou 4 matchs de plus que la moyenne du
  groupe) et sous-utilisation, chaque alerte portant son motif chiffré ;
- **récupération projetée** jour par jour, sur une COPIE ;
- **suggestion de XV** pénalisant la fatigue, avec la liste des changements
  et leur raison.

Deux points de discipline, vérifiés par des tests :

1. **Une seule règle de récupération.** `fatigueApresUnJourDeRepos` est
   extraite de `club-evenements.js` comme fonction pure ; la projection la
   rappelle jour après jour. R3 vérifie que la prévision affichée égale
   exactement ce que le moteur applique — une seconde formule aurait fini par
   afficher au manager une prévision fausse.
2. **Un seul algorithme de composition.** `meilleureComposition` accepte
   désormais un critère de classement facultatif (par défaut la note au
   poste, comportement inchangé). La rotation y injecte « note − 0,45 ×
   fatigue » au lieu d'écrire un second sélecteur — les règles de poste
   naturel, de repli, de blessés et de doublons restent partagées.

### Ce que la première version ratait

`meilleureComposition` re-triait les candidats par note et **ignorait**
l'effectif que je lui passais pré-trié : cinq joueurs à 90 de fatigue
restaient tous les cinq dans le XV suggéré. C'est ce qui a conduit au critère
injectable plutôt qu'à un tri en amont sans effet.

Couverture : `server/test-rotation.js`, 9 cas, tous rouges avant. **R8** est
le garde-fou : il vérifie qu'aucune de ces fonctions ne touche à la
composition ni à la fatigue.

---

## G11 — Le sportif finance enfin le club (livrée)

### Comportement observé (mesuré, pas déduit)

Une saison complète de Ligue Régionale, 26 journées :

```
billetterie   728 k€  (65 %)
sponsor       390 k€  (35 %)
droits TV       0     — zéro occurrence dans tout docs/js
primes          0     — zéro occurrence dans tout docs/js
-------------------------------------------------------
total        1118 k€   dépenses 975 k€   solde +143 k€
```

Conséquence directe : **finir 1er ou 14e ne changeait rien au budget**, gagner
une coupe ne rapportait rien, monter d'un palier n'apportait aucune ressource.
Le manager n'avait aucune raison financière de viser haut.

### La correction

`club-revenus-competition.js` — deux sources qui relient le sportif à l'argent :

- **droits TV**, versés à chaque journée, selon le palier ;
- **primes**, versées en fin de saison, sur le classement final ET sur le
  parcours réel en coupe (lu depuis `palmaresCoupesDeLaSaison`, livré en C6).

Tout passe par `mouvementTresorerie` : les deux catégories apparaissent au
grand livre avec un libellé qui dit d'où vient l'argent, et l'écran Finances
les affiche sans une ligne de code en plus — il est piloté par les données.

### Calibration mesurée

Saison complète de 26 journées, même graine pour les trois paliers :

| Palier | Droits TV / saison | Part des recettes | Solde avant | Solde après |
|---|---|---|---|---|
| 3 — Régionale | 130 k€ | 10 % | +167 k€ | +297 k€ |
| 2 — Nationale | 234 k€ | 17 % | +193 k€ | +427 k€ |
| 1 — Excellence | 364 k€ | 24 % | +219 k€ | +583 k€ |

La billetterie (674 k€ sur la même saison) reste de loin la première recette :
le stade et le remplissage gardent tout leur intérêt.

Primes de classement en Régionale : 85 k€ pour le titre, 61 pour la 3e place,
36 pour la 5e, 12 pour la 7e, 0 au-delà de la moitié du tableau. À l'échelle
du palier : 140 k€ pour un titre en Nationale, 240 en Excellence. Coupe
Nationale (3 tours) : 12 k€ en quarts, 20 en demies, 35 en finale, 135 en la
gagnant.

### La calibration a dû être refaite, pas le garde-fou

Ma première calibration (30 k€ de droits TV par journée au sommet, 520 k€ pour
un titre en Excellence) a fait **passer au rouge deux cas déjà en place** de
`server/test-economie-club.js` : **E2** (une saison sans aucune décision de
gestion ne doit pas quasi doubler la trésorerie — solde borné à 90 % du budget
de départ) et surtout **E6** (trésorerie bornée à 6 000 k€ sur 8 saisons).

Je n'ai pas touché à ces bornes. J'ai mesuré d'où venait le dépassement :

```
trésorerie sur 8 saisons, avant la tranche      1 959 k€
marge disponible avant la borne E6              4 041 k€
consommé par ma première calibration des PRIMES 3 940 k€
consommé par les droits TV                        ~100 k€
```

Le coupable n'était donc pas les droits TV mais les primes, une fois cumulées
sur huit saisons. Les deux barèmes ont été resserrés (TV 34→14 k€ au sommet,
titre 520→240 k€) jusqu'à ce que `test-economie-club.js` repasse entièrement
au vert sans que sa moindre borne bouge.

Honnêteté sur ce qui reste : un scénario que je me suis fabriqué à part — le
club gagne **tous** ses matchs pendant 8 saisons — atteint 6 363 k€, au-dessus
de la borne. Ce n'est pas le scénario d'E6 (graines `700 + n` / `3000 + n`,
résultats réalistes) et E6 passe, mais l'économie du jeu n'a toujours presque
aucun puits de dépenses : c'est le vrai point faible restant, pas le barème.

### Deux erreurs de placement, trouvées par les tests

1. J'avais versé les primes **après** `reinitialiserCoupes` — les tableaux
   étaient déjà vidés, aucune prime de coupe n'aurait jamais été payée. Et
   mon commentaire affirmait le contraire. Le parcours est désormais **capturé
   avant** la réinitialisation, dans une variable locale.
2. Les primes étaient versées **avant** `archiverComptesSaison`, qui remet le
   grand livre à zéro : elles étaient créditées puis immédiatement effacées.
   Elles sont maintenant versées après, et atterrissent dans le grand livre de
   la saison qui commence.

Couverture : `server/test-finances-competition.js`, 8 cas, tous rouges avant.
**D7** couvre le piège de rétrocompatibilité : `assurerComptes` sort tôt quand
les comptes existent, donc une sauvegarde antérieure n'a pas les nouvelles
clés et `totaux[categorie] += montant` sur `undefined` produisait NaN.
**D8** borne la calibration pour qu'aucune tranche future ne rende le club
trivialement riche.
