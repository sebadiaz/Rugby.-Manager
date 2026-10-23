# Rugby Manager — bugs et fonctionnalités à terminer

Audit initial du **23 octobre 2026**. Sources examinées sur `main` au commit `4939ad06839d015b26830c8855bc52f58870becc`.

Ce fichier donne une liste opérationnelle courte à partir du code, de reproductions isolées et d'un parcours de la démo. Il complète [TODO_AUDIT.md](TODO_AUDIT.md), qui conserve les preuves et l'historique détaillés, et [ROADMAP_FOOTBALL_MANAGER.md](ROADMAP_FOOTBALL_MANAGER.md), qui suit la profondeur de gestion. Ne pas supprimer leurs historiques, recréer une fonction déjà livrée ou interpréter une ancienne mesure comme l'état actuel.

## Lecture et règles de clôture

- **P0** : blocage général ou corruption systématique ; aucun P0 nouveau établi dans cette passe.
- **P1** : perte de progression, résultat de compétition trompeur ou continuité essentielle.
- **P2** : crédibilité, compréhension, profondeur de gestion et confort.
- **P3** : extension après fiabilisation de la boucle principale.
- **CONFIRMÉ** : reproduit avec les fonctions du dépôt, ou observé dans la démo et expliqué par le code.
- **ÉCART MESURÉ** : écart à une cible de calibration du projet ; ne constitue pas à lui seul une infraction aux lois du rugby.
- **À CONSTRUIRE / À VALIDER** : fonctionnalité ou réception ouverte ; pas un défaut présenté comme déjà reproduit.

Tous les tickets ci-dessous sont ouverts. Une fermeture exige une preuve sur le chemin réellement utilisé par le joueur, les contrôles appropriés et la conservation des anciennes carrières. Toute modification importante du moteur suit les validations rugby, statistiques et QA de `AGENTS.md` : au moins dix matchs complets, statistiques issues des actions, contrôle visuel et tests concernés. Une amélioration de score ne doit pas masquer la disparition de phases de rugby.

## Ce qui existe déjà

La version actuelle est **JavaScript / Canvas**, avec moteur partagé entre Node et navigateur. Il n'y a pas de moteur C++ à réécrire ou à supprimer.

Le code contient déjà : mode Club, composition par poste, premier XV/Équipe B/Espoirs, tactique collective, consignes et remplacements pendant le match joué, rucks/mauls/mêlées/touches, jeu au pied, calendrier daté, coupes, transferts et négociations, médical, formation, finances, direction, carrière du manager, archives et migrations de sauvegarde. Le parcours Club → Compétitions existe et s'ouvre ; il ne doit pas être décrit comme intégralement absent.

Les mêlées possèdent déjà une machine à états avec formation, crouch, bind, set, introduction, contestation et sortie. Le travail de réception du ballon et du numéro 9 est précisé en QA-RM-001, pas annoncé comme une fonctionnalité inexistante.

## Résumé des priorités

| Ticket | Priorité | Nature | Travail attendu |
| --- | --- | --- | --- |
| BUG-RM-001 | P1 | Confirmé | Remplacer le départage par identifiants annoncé comme une prolongation |
| BUG-RM-002 | P1 | Confirmé | Empêcher un onglet ancien d'écraser la progression d'un autre |
| BUG-RM-003 | P1 | Confirmé | Conserver les secours lors d'incidents successifs |
| BUG-RM-004 | P2 | Confirmé | Distinguer les clubs générés portant exactement le même nom |
| BUG-RM-005 | P2 | Écart mesuré | Réduire les passes excédentaires sans casser l'attaque |
| FUNC-RM-001 | P1 | À construire | Export, import et récupération de carrière accessibles |
| FUNC-RM-002 | P1 | À construire | Reprendre un match joué après fermeture du navigateur |
| FUNC-RM-003 | P2 | À compléter | Relecture fidèle des décisions du match interactif |
| FUNC-RM-004 | P2 | À compléter | Instructions individuelles par poste |
| FUNC-RM-005 | P2 | À compléter | Gestion complète du banc et des changements en direct |
| FUNC-RM-006 | P2 | À compléter | Donner un rôle concret et explicable au capitaine |
| FUNC-RM-007 | P2 | À compléter | Rapports qualitatifs de recrutement liés aux données |
| FUNC-RM-008 | P2 | À compléter | Prévisions financières sur plusieurs saisons |
| FUNC-RM-009 | P3 | À compléter | Continuité des effectifs hors de la division du joueur |
| FUNC-RM-010 | P2 | À compléter | Qualifications continentales fondées sur les résultats |
| QA-RM-001 | P1 | À valider | Mêlée : temps, positions, ballon et demi de mêlée |
| QA-RM-002 | P1 | À valider | Transitions de possession et phases arrêtées visibles |
| QA-RM-003 | P2 | À valider | Progression territoriale et essais construits |
| QA-RM-004 | P1 | À valider | Parcours complet de compétition et règlement unique |
| QA-RM-005 | P2 | À valider | Parcours mobile et lecture du match |
| QA-RM-006 | P2 | À valider | Mettre les états documentaires en accord avec le code |

## Bugs établis

### [ ] BUG-RM-001 — Une égalité en coupe devient une « prolongation » sans jeu supplémentaire — P1

**Statut : CONFIRMÉ par reproduction des fonctions du dépôt.**

**Fichiers :** `docs/js/club-coupes.js` (`enregistrerResultatCoupe`, conséquences et messages), `docs/js/clubUI.js`, archives/feuilles de match ; tests de coupes et de conséquences.

**Reproduction :** créer un tableau de deux clubs identifiés `a` et `b`, puis enregistrer 20–20. Résultat observé : score encore 20–20, `vainqueurId: "a"`, `apresProlongation: true`. Le vainqueur est dérivé du hash des identifiants ; aucune durée ni action supplémentaire n'est simulée par cette fonction. Le message de coupe peut néanmoins annoncer une qualification « après prolongation ».

**Impact :** une rencontre couperet peut dépendre de l'identité informatique des clubs et non du match ; la présentation fait passer un départage abstrait pour une phase jouée. C'est une limite déjà assumée dans le commentaire du code, mais pas une prolongation effectivement simulée.

**Correction attendue :** définir le règlement de départage de chaque compétition fictive, le présenter avant le match, puis exécuter les phases prévues avec état sportif cohérent. Pour les matchs joués, conserver fatigue, cartons, banc, tactique et décisions ; pour les matchs abstraits, produire un départage explicite cohérent avec leur modèle. Ne pas inventer des points pour rendre le score différent.

**Acceptation :** égalités en match joué et abstrait, éventuelle égalité persistante et résultat rechargé ; score, vainqueur, message, qualification, finances et archive concordent. Les identifiants seuls ne décident plus de la performance sportive. Aucun règlement de championnat n'est modifié par cette correction.

### [ ] BUG-RM-002 — Deux onglets peuvent écraser leurs progressions respectives — P1

**Statut : CONFIRMÉ par reproduction de deux états chargés sur le même stockage.**

**Fichiers :** `docs/js/club-sauvegarde.js` (`sauvegarderSaison`, `chargerSaison`), `docs/js/clubUI.js`.

**Reproduction :** charger deux copies A/B d'une même carrière à 401 k€. A passe à 501 k€ et sauvegarde. B, resté sur l'ancien état, passe à 391 k€ et sauvegarde : la dernière écriture remplace intégralement A. Ces changements de budget servent uniquement à isoler le conflit, pas à simuler une transaction autorisée. En usage réel, des contrats, résultats ou compositions peuvent être remplacés de la même façon. La reproduction utilise le chargeur Node et un localStorage en mémoire ; le parcours de deux vrais onglets reste à ajouter à la QA navigateur.

**Cause :** une clé unique et un remplacement complet du JSON, sans révision comparée ni protection d'écriture entre sessions. Aucun gestionnaire de conflit correspondant n'a été trouvé.

**Correction attendue :** identifier carrière, révision et session ; garantir un seul rédacteur ou un contrôle de concurrence effectif. Une simple notification `storage` n'est pas une exclusion mutuelle. À la détection d'un état plus récent, empêcher l'écriture obsolète et proposer rechargement ou conservation/export du travail local.

**Acceptation :** deux onglets, actions simultanées, onglet repris après veille et échec de stockage ; aucune progression récente perdue silencieusement. Ajouter un scénario navigateur sur les fonctions de sauvegarde et les actions réelles du Club. Garder les carrières existantes chargeables.

### [ ] BUG-RM-003 — Un second incident remplace le secours de la première carrière — P1

**Statut : CONFIRMÉ par reproduction sur le stockage en mémoire.**

**Fichiers :** `docs/js/club-sauvegarde.js` (`conserverSecours`, `chargerSaison`), récupération UI.

**Reproduction :**
1. Mettre une carrière structurellement complète en version 99 ; son chargement la refuse et en conserve le JSON sous `rugbyManager.club.secours.v1`.
2. Enregistrer une autre carrière, comme le permet actuellement le jeu.
3. Simuler un JSON tronqué dans la principale, puis recharger.
4. Le secours lisible de la première carrière est remplacé par le JSON tronqué du second incident.

**Cause :** chaque échec écrit sans distinction dans la même clé de secours. Le correctif historique P0-2 conserve bien les données du premier incident ; il ne protège pas leur succession. Ne pas rouvrir son ancien scénario comme s'il n'avait jamais été corrigé.

**Correction attendue :** distinguer dernière sauvegarde valide, copie brute d'incident et carrière d'origine ; conserver plusieurs versions identifiées ou refuser l'écrasement silencieux d'un secours utile. Vérifier l'écriture avant d'affirmer qu'une copie a été préservée. Prévoir récupération/export depuis l'interface (FUNC-RM-001).

**Acceptation :** deux corruptions successives, version future puis corruption, quota empêchant le secours et récupération suivie d'une nouvelle sauvegarde. Les copies conservées restent identifiables et téléchargeables ; une donnée non écrite n'est jamais annoncée comme protégée.

### [ ] BUG-RM-004 — Des clubs adverses distincts portent exactement le même nom — P2

**Statut : CONFIRMÉ dans la démo et par génération.**

**Fichiers :** `docs/js/club.js` (`genererNomClub`), `club-pyramide.js`, génération de pyramide/monde et affichage des clubs.

**Preuves :** dans la carrière de démonstration créée pendant l'audit, le classement régional contient deux « Solerac Dragons ». Sur 30 créations avec `creerRng(1)` à `creerRng(30)` du chargeur de tests, 15 présentent au moins un nom adverse répété. Exemples : « Montorel Faucons » à la graine 1, « Valfleur Loups » à la graine 2. Les identifiants sont distincts : ce n'est pas la collision d'identifiants P0-1, déjà corrigée.

**Impact :** ambiguïté dans les calendriers, classements, offres et messages ; le joueur ne peut pas toujours savoir de quel adversaire il s'agit en lisant son nom.

**Correction attendue :** réserver les noms à la génération dans un périmètre défini, ou ajouter une identité distinctive visible (localité/qualificatif). Préserver les identifiants et l'historique des anciennes carrières ; prévoir aussi l'affichage distinctif des homonymes déjà enregistrés, sans recréer les clubs.

**Acceptation :** lot de créations, changement de saison, promotion/relégation, monde et reprise d'une ancienne carrière avec homonymes. Tout lien et message permet de distinguer les deux entités.

### [ ] BUG-RM-005 — Le nombre de passes dépasse encore la calibration du dépôt — P2

**Statut : ÉCART MESURÉ, relié au chantier existant P2-13 de `TODO_AUDIT.md`.**

**Fichiers :** `engine/rugby-engine.js`, copie publiée `docs/rugby-engine.js`, `server/test-calibration-moteur.js`, `server/simulate-batch.js`, mesures territoriales.

**Reproduction :** `node server/test-calibration-moteur.js`, 20 matchs de 80 minutes, graines 1–20, pas de 0,2 s. Moyenne : **504,5 passes par match**, contre la fourchette interne **250–420**. Le test termine correctement à 13/14 catégories, son seuil global étant 12/14. Une suite verte ne clôt donc pas cet écart. La fourchette est un objectif du projet, pas une règle de World Rugby ni une mesure nouvelle de matchs réels.

**À analyser :** identifier passes nécessaires au soutien et passes sans progression ; comparer sortie de regroupement, course avant passe, pression et profondeur des receveurs. Les anciens problèmes territoriaux P2-15/P1-21 ont reçu des corrections : repartir des mesures actuelles, pas des anciennes valeurs.

**Correction attendue :** une modification ciblée créant une décision et une action de rugby crédibles ; ne pas réduire simplement le compteur, supprimer des événements ou accélérer artificiellement les courses pour satisfaire une moyenne.

**Acceptation :** comparaison appariée avant/après sur mêmes graines/configurations, distribution par match et contrôle visuel. Conserver essais, possession, rucks, jeu au pied, contestations et différences entre postes. Si la cible doit évoluer, la justifier avec des références de niveau/format adaptées, sans changer le seuil pour masquer l'écart.

## Fonctions à terminer ou approfondir

### [ ] FUNC-RM-001 — Export, import et récupération de carrière dans l'interface — P1

**État constaté :** carrière en localStorage avec migrations et secours bruts ; pas de parcours d'export/import de carrière trouvé dans les sources UI examinées. Le message de récupération renvoie au support avec le nom du club, alors que les données sont locales au navigateur.

**À livrer :** téléchargement d'une sauvegarde versionnée, import validé et prévisualisé (club, saison, date), copie préalable de la carrière courante, export des secours sans écrasement. Prévoir des emplacements de carrière identifiables si plusieurs parties sont proposées. Aucun serveur ou compte obligatoire pour cette première tranche.

**Fichiers :** `club-sauvegarde.js`, `clubUI.js`, `docs/index.html`.

**Acceptation :** aller-retour sur un autre navigateur, ancienne version migrable, version future refusée sans perte, fichier invalide, quota et annulation. Préserver résultats, identités, contrats, décisions, finances et projets ; ne jamais exécuter du contenu importé comme du code. Dépend de BUG-RM-002/003.

### [ ] FUNC-RM-002 — Reprise d'un match joué après fermeture ou rechargement — P1

**État constaté :** `match` et `matchLive` de `main.js` vivent en mémoire ; la sauvegarde de carrière ne constitue pas un instantané du match interactif. La sortie explicite permet de l'annuler et de le relancer, ce qui n'est pas une reprise à la minute interrompue.

**À livrer :** journal de commandes ou état versionné permettant de retrouver graine, configuration, temps, score, joueurs, fatigue, sanctions, remplacements et consignes réellement appliquées. Reprise en pause avec choix explicite. Le règlement final doit être appliqué une seule fois, y compris après fermeture pendant l'enregistrement.

**Fichiers :** `main.js`, `club-sauvegarde.js`, `club-jour-match.js`, `clubUI.js`, moteur.

**Acceptation :** F5, fermeture d'onglet, arrêt du navigateur, mi-temps et fin de match ; même état à la reprise, aucune nouvelle inscription ni doublon de résultat, statistiques ou recettes. Aucun état ancien n'écrase une carrière plus récente.

### [ ] FUNC-RM-003 — Relecture fidèle des décisions du match interactif — P2

**État constaté :** une décision en cours de match change réellement la suite (test réussi). La relecture par graine seule ne reconstitue pas ces commandes. `rejouerDepuisHistorique` reconnaît les entrées sans instantané exploitable ; ce diagnostic existant doit être conservé.

**À livrer :** enregistrer commande, équipe, joueur concerné et tick ; conserver version du moteur/configuration et positions de référence si nécessaires. Distinguer relecture du match vécu et nouvelle simulation d'entraînement.

**Fichiers :** `main.js`, `ui.js`, archives/feuilles de match, moteur.

**Acceptation :** consigne à la mi-temps puis à la 62e minute, remplacement manuel, changement de possession et changement de version. Vérifier une trace et les événements, pas seulement le score final ; ne jamais rejouer des récompenses. Mutualiser le journal avec FUNC-RM-002.

### [ ] FUNC-RM-004 — Instructions individuelles liées au poste — P2

**État constaté :** axes tactiques collectifs branchés au moteur et rôles capitaine/buteur/lanceur ; ce socle fonctionne. La profondeur individuelle reste limitée dans la feuille de route.

**À livrer :** premier lot restreint : comportement du 9 en sortie, choix main/pied du 10, largeur/repiquage d'un ailier et couverture de l'arrière. Afficher effet attendu et compromis ; les décisions dépendent des qualités et de la situation, sans garantir le résultat. Réutiliser les mêmes écrans pour les équipes dirigées.

**Acceptation :** scénarios contrôlés et matchs appariés montrant un effet sur les choix observés, non sur une statistique ajoutée artificiellement. Instructions légales et incompatibilités expliquées ; réglages conservés après reprise/changement d'équipe.

### [ ] FUNC-RM-005 — Compléter la gestion du banc pendant le match — P2

**État constaté :** changements planifiés et changements en cours de jeu existent déjà. Le panneau de changement proposé dans `main.js` est alimenté par la liste issue de la préparation ; ne pas reconstruire ce chemin en parallèle.

**À livrer :** sélection explicite sortant/entrant depuis le banc disponible, poste couvert, fatigue et motif ; expliquer refus et risque de désorganisation. Raccorder blessures, exclusions, éventuel remplacement temporaire et contraintes de première ligne au règlement effectivement choisi. Définir ce qui est simulé avant d'ajouter un bouton.

**Fichiers :** `club-composition.js`, `clubUI.js`, `main.js`, moteur.

**Acceptation :** changement manuel avant un changement planifié du même poste, joueur déjà entré/sorti, effectif réduit, première ligne et reprise. Les minutes et conséquences concernent les joueurs réellement entrés, une seule fois.

### [ ] FUNC-RM-006 — Capitaine et leadership avec conséquences compréhensibles — P2

**État constaté :** capitaine désigné dans la composition ; la feuille de route le qualifie de décoratif. Ne pas confondre ce rôle avec le buteur ou le lanceur, déjà exploités.

**À livrer :** définir un premier usage concret : arbitrage d'une option tactique déléguée, communication/discipline ou gestion d'un moment sous pression. Afficher pourquoi le profil convient et les limites de son influence. Éviter un bonus automatique de score ou de vitesse.

**Acceptation :** capitaine titulaire, remplacé, exclu ou indisponible ; relais explicite. Un scénario montre la décision affectée, sans modifier les règles du match ni rendre une victoire garantie.

### [ ] FUNC-RM-007 — Rapports de recrutement qualitatifs et incertitude lisible — P2

**État constaté :** réseau de repérage, missions différées et statistiques approximatives existent. Les rapports qualitatifs restent à approfondir.

**À livrer :** points forts/faibles tirés des attributs connus, adéquation au poste et au besoin de l'effectif, coût salarial complet et niveau de confiance. Distinguer constat, estimation et information inconnue ; ne pas inventer une carrière, un historique médical ou des performances non simulées.

**Fichiers :** `club-reseau-scouting.js`, `club-transferts.js`, `club-analyse.js`, `clubUI.js`.

**Acceptation :** rapport incomplet puis renseigné, deux profils proches mais de rôles différents, sauvegarde/reprise et comparaison avec le besoin réel du club. Le texte évolue avec les données, pas au hasard de l'affichage.

### [ ] FUNC-RM-008 — Prévision financière pluriannuelle et engagements — P2

**État constaté :** grand livre, salaires et projections à quelques journées existent ; ne pas annoncer les finances absentes. La projection sur plusieurs saisons reste à développer.

**À livrer :** prévision par saison intégrant contrats signés, échéances, chantiers/entretien et revenus garantis ; séparer hypothèses de classement, promotion, coupe et recettes certaines. Montrer l'effet d'un recrutement ou d'un renouvellement avant confirmation.

**Fichiers :** `club-comptes.js`, `club-negociations.js`, `club-infrastructures.js`, `clubUI.js`.

**Acceptation :** changement de division, fin de prêt/contrat, travaux sur deux saisons et faible trésorerie ; pas de double paiement. Une prévision n'écrit aucune recette future dans le grand livre réel.

### [ ] FUNC-RM-009 — Continuité des effectifs hors de la division du joueur — P3

**État constaté :** les adversaires directs ont des effectifs et des conséquences de match ; les autres divisions et pays n'ont pas tous un suivi nominatif équivalent. Le monde et ses compétitions ne sont pas entièrement absents.

**À livrer :** choisir explicitement un périmètre de simulation détaillée et un niveau abstrait pour le reste. Préserver identité, trajectoire et données effectivement connues lorsqu'un club rejoint ou quitte la division du joueur. Ne pas fabriquer des statistiques individuelles rétroactives pour remplir une fiche.

**Fichiers :** `world.js`, `club-pyramide-france.js`, `club-effectif-adverse.js`, transitions de saison.

**Acceptation :** promotions/relégations successives, transfert vers/depuis une division abstraite, changement de club du manager, plusieurs saisons et budgets de calcul mesurés.

### [ ] FUNC-RM-010 — Qualifications continentales fondées sur la saison passée — P2

**État constaté :** les coupes continentales existent. Leur sélection repose encore sur les niveaux utilisés par la génération, plutôt que sur un palmarès sportif complet de qualification.

**À livrer :** définir les places par compétition/pays, utiliser les classements et titres réellement obtenus la saison précédente, gérer réattribution/cumul et afficher la raison d'une qualification ou d'une non-qualification.

**Fichiers :** `club-coupes.js`, `club-competitions.js`, `world.js`, archives et changement de saison.

**Acceptation :** champion, vainqueur de coupe déjà qualifié, égalité au classement, changement de club du manager et ancienne carrière sans historique suffisant. Aucun résultat passé inventé ; règle de transition annoncée.

## Réceptions gameplay et QA

### [ ] QA-RM-001 — Mêlée : chronologie, ballon et numéro 9 — P1

**État : À VALIDER visuellement et par traces sur le code actuel.** Machine à états présente ; la suite complète `test-melee.js` n'a pas terminé dans la limite de 150 s de cette passe. Ce dépassement de temps local n'est pas une preuve de défaut de règle.

**À enregistrer pour chaque étape :** tick/temps, état, point de mêlée, position/identité des 16 avants, des deux 9 et du ballon ; propriétaire logique, état tenu/au sol/en transit, fautes et équipe bénéficiaire.

**Parcours :** octroi et déplacement → formation des packs → crouch/bind/set → introduction du 9 au tunnel → talonnage/contestation → ballon vers l'arrière du pack gagnant → éventuelle sortie du 8 ou prise/relais du 9 → jeu courant. Distinguer côté d'introduction, côté de sortie, bras/joueurs et position réelle du ballon ; il ne reste pas artificiellement dans les mains du 9 pendant le talonnage.

**Cas :** les deux sens d'attaque, gain contre introduction, écroulement, rotation, liaison/perte de stabilité, introduction irrégulière, ballon bloqué, remise en place et packs incomplets. Documenter simplifications et règlement de référence ; ne pas déduire la sanction d'un simple seuil visuel de rotation.

**Acceptation :** trace déterministe, captures/vidéo à vitesse lisible et transitions cohérentes entre position logique et rendue. Aucun porteur fantôme ou téléportation trompeuse ; une faute/reset ne fait pas continuer l'ancienne séquence.

### [ ] QA-RM-002 — Ballon, possession et reprises cohérents de bout en bout — P1

**État : À VALIDER.** Les phases existent ; ce ticket porte sur leur enchaînement et leur lecture, pas sur leur simple fréquence.

**Parcours :** coup d'envoi/réception, passe/offload/interception, plaquage/libération/ruck, maul, touche, pénalité, essai/transformation et reprise suivante. Contrôler simultanément état du ballon, joueur porteur, trajectoire, événement, score et équipe en possession.

**Acceptation :** aucune double possession ni joueur qui garde visuellement le ballon après sa libération ; phase annoncée conforme à l'action. Ruck/touche/maul se terminent, faute et avantage ont une conséquence identifiable, essais issus d'une action traçable. Réexécuter les invariants complets : leur timeout local interdit de les annoncer validés dans cette passe.

### [ ] QA-RM-003 — Refaire les mesures territoriales et l'attaque près de la ligne — P2

**État : À VALIDER**, en continuité de P2-15/P1-21/P2-13 de `TODO_AUDIT.md`, déjà partiellement corrigés.

**Mesures :** entrées dans les 22 m, gain net par phase à possession conservée, profondeur de réception, durée des séquences, origine des essais et postes des marqueurs. Ne pas reprendre les anciennes valeurs de l'audit comme résultats du moteur courant.

**Acceptation :** échantillon versionné et comparaison appariée avant/après ; avants et trois-quarts ont des usages distincts, les attaques construites peuvent progresser sans dépendre uniquement d'une échappée. Vérifier en images le soutien, la ligne défensive, le ballon porté, les touches/mêlées proches de la ligne. Pas de seuil arbitraire imposant qu'un poste marque un nombre fixe d'essais.

### [ ] QA-RM-004 — Saison, coupes, classement et conséquences en un seul parcours — P1

**État : À VALIDER au-delà des tests ciblés verts.**

**Parcours :** création → équipe dirigée → composition → préparation → match joué/instantané → résultat → archive → calendrier/classement → fin de saison → promotion/relégation. Inclure championnat, coupe, amical, Équipe B, Espoirs, consultation d'un adversaire et retour au club.

**Acceptation :** la compétition affichée correspond à la rencontre jouée ; points/bonus et départages suivent son règlement. Un résultat n'accorde qu'une fois statistiques, argent, fatigue, blessures et effets de direction. Tester retour/rechargement et journée partiellement résolue. Après BUG-RM-001, archive et tableau de coupe montrent le même résultat sportif.

### [ ] QA-RM-005 — Mobile : gérer une semaine puis suivre un match — P2

**État : À VALIDER sur petit écran.** La visite de cette passe couvre l'accueil, la création de club et Compétitions sur le navigateur distant ; aucun parcours mobile complet ni mesure de fluidité n'a été effectué.

**À tester :** tiroir de navigation, tableau d'effectif et classement, changement d'équipe, sélection d'un joueur, négociation, médical, préparation, consigne en match, pause et résultat. Vérifier zoom de texte, clavier, focus des modales et libellés longs.

**Acceptation :** action principale repérable, fermeture/retour toujours possible, pas d'information décisive cachée hors écran sans indice de défilement. Score, chrono, ballon, porteur et phase lisibles sans masquer l'action. Mesurer chargement et fluidité ; ne pas confondre suite headless et confort tactile.

### [ ] QA-RM-006 — Éliminer les contradictions de statut dans la documentation — P2

**État : contradiction documentaire constatée, réception à compléter.**

**Exemples :** la ligne « Gestion de la fatigue et rotation de l'effectif » de la roadmap affirme qu'aucune aide à la rotation n'existe, alors que « Rotation et gestion de la charge » et `club-rotation.js` décrivent/proposent déjà ces outils. `docs/REGLES_RUGBY.md` contient une ancienne analyse annonçant environ 647 plaquages et 495 rucks, à ne pas présenter comme les moyennes actuelles de la calibration (246,3 tentatives et 168,3 rucks sur la passe présente ; définitions à distinguer).

**À faire :** dater et référencer les mesures par commit/configuration/pas/échantillon ; séparer historique et état courant, vérifier les lignes jaunes aussi bien que rouges. Préserver les historiques utiles au lieu de les effacer.

**Acceptation :** aucun prochain chantier justifié uniquement par une ligne obsolète ; chaque déclaration d'absence confrontée au code et au parcours. Un contrôle documentaire doit pouvoir signaler une contradiction réelle sans imposer qu'il reste nécessairement des fonctions absentes.

## Vérifications réellement effectuées le 23 octobre

**Environnement local :** Node.js 24.19.0 ; le workflow du dépôt utilise Node 20. Sources récupérées par fichier au commit cité, sans modification du code de jeu.

| Contrôle | Résultat de cette passe |
| --- | --- |
| `node server/test-audit-p0-1.js` | Réussi — 4 tests |
| `node server/test-audit-p0-2.js` | Réussi — 6 tests ; ne couvre pas les deux incidents successifs BUG-RM-003 |
| `node server/test-ruck.js` | Réussi — 8 tests |
| `RM_TOUCHE_RAPIDE=1 node server/test-touche.js` | Réussi — 8 tests ; 5 tests de simulation non exécutés dans ce mode |
| `node server/test-match-interactif.js` | Réussi — 5 tests |
| `node server/test-composition-postes.js` | Réussi — 14 tests |
| `node server/test-competitions-equipe.js` | Réussi — 21 tests |
| `node server/test-roadmap-a-jour.js` | Réussi — 3 tests |
| `node server/test-calibration-moteur.js` | Réussi — 13/14 catégories, seuil 12/14 |
| `node server/test-invariants.js` | Interrompu par la limite de 150 s ; verdict complet non obtenu |
| `node server/test-melee.js` | Interrompu par la limite de 150 s ; verdict complet non obtenu |
| Reproductions isolées | Conflit de sauvegarde, secours écrasé, noms de clubs dupliqués et départage de coupe reproduits |
| Démo publique | Accueil, création d'un club de test et navigation vers Compétitions réalisés ; homonymes observés |

Bilan : **9 suites ciblées réussies, 2 suites sans verdict complet**. Les deux longues suites tournaient avec d'autres tests (trois processus au maximum) ; ne pas assimiler leur limite locale de temps à une régression. La suite navigateur complète du dépôt, les essais mobiles et une saison entière n'ont pas été relancés.

### Calibration : moyennes cumulées des deux équipes

20 matchs de 80 minutes, graines 1–20, `dt = 0,2 s`, réglages du script de calibration.

| Indicateur | Moyenne | Fourchette du dépôt | Résultat |
| --- | ---: | --- | --- |
| Essais | 6,3 | 4–8 | Dans la cible |
| Points | 50,4 | 35–65 | Dans la cible |
| Courses | 219,4 | 170–280 | Dans la cible |
| Passes | **504,5** | 250–420 | **Au-dessus** |
| Coups de pied | 64,8 | 35–70 | Dans la cible |
| Plaquages tentés | 246,3 | 220–360 | Dans la cible |
| Rucks | 168,3 | 110–180 | Dans la cible |
| Touches | 20,7 | 20–35 | Dans la cible |
| Mêlées | 10,9 | 6–15 | Dans la cible |
| Mauls | 4,2 | 3–10 | Dans la cible |
| Pénalités concédées | 17,6 | 16–28 | Dans la cible |
| Turnovers | 10,0 | 8–18 | Dans la cible |
| En-avants | 9,3 | 8–18 | Dans la cible |
| Temps de jeu effectif | 32,6 min | 32–42 min | Dans la cible |

Ce bilan ne valide pas toutes les règles ni la qualité du placement à l'écran. Aucun correctif de simulation ou de sauvegarde n'est livré par la création de ce fichier.

## Ordre de travail conseillé

1. BUG-RM-001 : rendre le résultat de coupe explicable et sportif.
2. BUG-RM-002/003 + FUNC-RM-001 : protéger et rendre récupérables les carrières.
3. QA-RM-001/002 : réception du ballon, du numéro 9 et des transitions visibles.
4. BUG-RM-005 + QA-RM-003 : une passe sert une progression et une décision de rugby.
5. FUNC-RM-002/003 : continuité et relecture des matchs joués, puis enrichissement de gestion.

Pour chaque lot : une correction cohérente, sa reproduction/test et son effet observable. Pas de refonte générale du moteur ni d'annonce de fermeture sur la seule présence d'un bouton.
