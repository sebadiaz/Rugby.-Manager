# Rugby Manager — bugs et fonctionnalités à terminer

Audit initial du **23 octobre 2026**. Sources examinées sur `main` au commit `4939ad06839d015b26830c8855bc52f58870becc`.

Ce fichier donne une liste opérationnelle à partir du code, de reproductions isolées, de simulations et d'un parcours de la démo. Il complète [TODO_AUDIT.md](TODO_AUDIT.md), qui conserve les preuves et l'historique détaillés, et [ROADMAP_FOOTBALL_MANAGER.md](ROADMAP_FOOTBALL_MANAGER.md), qui suit la profondeur de gestion. Ne pas supprimer leurs historiques, recréer une fonction déjà livrée ou interpréter une ancienne mesure comme l'état actuel.

## Lecture et règles de clôture

- **P0** : blocage général ou corruption systématique ; aucun P0 nouveau établi dans cette passe.
- **P1** : perte de progression, résultat de compétition trompeur ou continuité essentielle.
- **P2** : crédibilité, compréhension, profondeur de gestion et confort.
- **P3** : extension après fiabilisation de la boucle principale.
- **CONFIRMÉ** : reproduit avec les fonctions du dépôt, ou observé dans la démo et expliqué par le code.
- **ÉCART MESURÉ** : écart à une cible interne ou à un repère réel identifié ; ne constitue pas à lui seul une infraction aux lois du rugby.
- **À CONSTRUIRE / À VALIDER** : fonctionnalité ou réception ouverte ; pas un défaut présenté comme déjà reproduit.

Tous les tickets ci-dessous sont ouverts. Une fermeture exige une preuve sur le chemin réellement utilisé par le joueur, les contrôles appropriés et la conservation des anciennes carrières. Toute modification importante du moteur suit les validations rugby, statistiques et QA de `AGENTS.md` : au moins dix matchs complets, statistiques issues des actions, contrôle visuel et tests concernés. Une amélioration de score ne doit pas masquer la disparition de phases de rugby.

## Ce qui existe déjà

La version actuelle est **JavaScript / Canvas**, avec moteur partagé entre Node et navigateur. Il n'y a pas de moteur C++ à réécrire ou à supprimer.

Le code contient déjà : mode Club, composition par poste, premier XV/Équipe B/Espoirs, tactique collective, consignes et remplacements pendant le match joué, rucks/mauls/mêlées/touches, jeu au pied, calendrier daté, coupes, transferts et négociations, médical, formation, finances, direction, carrière du manager, archives et migrations de sauvegarde. Le parcours Club → Compétitions existe et s'ouvre ; il ne doit pas être décrit comme intégralement absent.

Les mêlées possèdent déjà une machine à états avec formation, crouch, bind, set, introduction, contestation et sortie. Le travail de réception du ballon et du numéro 9 est précisé en QA-RM-001, pas annoncé comme une fonctionnalité inexistante.

## Audit complémentaire — statistiques et réalisme rugby, 23 octobre 2026

**Verdict : base collective acceptable, réalisme et statistiques individuelles à corriger.** Le moteur produit les grandes phases du rugby et des scores variés. Les passes, la place des avants dans les essais et la fréquence des mauls demandent un travail de gameplay. Les erreurs d'attribution, de périmètre et de comptage doivent être corrigées avant de régler les comportements sur ces données. Aucun correctif du moteur n'est livré dans cette passe documentaire.

### Méthode et limites

Sources : `2a956b9907a90aba7f82b2494ca1917c59e64019` ; moteur SHA-256 `e95ec8c196b22e607f462dda00a59d2391bc77bce2eb569faeb9fa13796b0feb`, Node 24.19.0. **120 simulations terminées à l'état `TERMINE`, zéro erreur d'exécution**. Les graines sont réutilisées entre variantes : il s'agit de comparaisons appariées, pas de 120 affiches indépendantes. Ce contrôle Node ne remplace pas une réception visuelle des actions ni un parcours complet de carrière.

| Variante | Nombre / graines | Paramètres de l'expérience |
| --- | --- | --- |
| Rapide | 25 / 1–25 | `docs/rugby-config.json`, pas de 0,1 s comme `PAS_FIXE` du navigateur |
| Club équilibré | 25 / 1–25 | Même base, deux effectifs générés de niveau 0,5, tactique collective par défaut |
| Club avec écart | 25 / 1–25 | Niveaux 0,8 et 0,25, côté fort alterné |
| Club avec banc | 25 / 1–25 | Équilibré ; quatre remplacements construits par équipe à la 50e, postes 3/6/9/11, mêmes profils entrants pour isoler l'attribution |
| Témoin historique | 20 / 1–20 | Configuration moteur par défaut (`null`), pas de 0,2 s ; prolongement de la calibration initiale jusqu'à la fin effective |

Pour reproduire les variantes Club : RNG d'effectif `creerRng(graine * 2 + 2)` ; `genererEffectif` puis `effectifVersJoueursCfg`, `tactiqueVersConfig({})` appliquée aux blocs attaque/défense/mêlée/touche/ruck A et B. Construire `new MatchEngine(graine, 4800, config)` et appeler `tick(pas)` jusqu'à `TERMINE`, avec garde de 5 100 secondes et échec explicite si elle est atteinte. Collecter `getState().stats`, `statsJoueurs`, score, chronologie, possession et temps effectif. Le témoin diffère aussi par sa configuration : les écarts ne peuvent pas être attribués au seul pas de simulation.

La référence externe est le **Six Nations masculin 2023**, 15 matchs internationaux, [synthèse World Rugby](https://www.world.rugby/the-game/game-analysis/reports/internationals-men?lang=en). C'est un repère historique de haut niveau, pas une norme universelle pour les divisions fictives du jeu. Les plages réelles ci-dessous sont des minimums/maximums observés ; elles ne sont pas des intervalles d'acceptation obligatoires. Les définitions doivent être rapprochées avant tout recalibrage.

### Statistiques globales — deux équipes cumulées par match

| Indicateur | Club équilibré, moyenne | Six Nations 2023, moyenne [min–max] | Commentaire / proposition |
| --- | ---: | ---: | --- |
| Points | 53,96 | 48 [29–69] | Ordre de grandeur plausible ; surveiller les extrêmes selon le niveau |
| Essais | 6,44 | 6,1 [4–9] | Volume plausible, répartition des marqueurs à revoir |
| Passes réussies | **475,80** | **314 [230–398]** | Environ +52 % ; analyser les échanges sans pression ni progression |
| Rucks | 189,00 | 185 [134–228] | Proche en volume ; contrôler formation et sortie visibles |
| Mauls | **5,24** | **11 [3–20]** | Faible ; développer les choix après touche et près de la ligne |
| Mêlées | 12,44 | 11 [5–16] | Plausible ; fréquence seule insuffisante pour valider la mêlée |
| Touches | 18,52 | 26 [14–34] | Bas ; vérifier jeu territorial, sorties et choix sur pénalité |
| Coups de pied, compteur `kicks` | 52,92 | 55 [37–77] | Ordre de grandeur proche ; rapprocher les périmètres d'événements |
| Temps effectif | **31,79 min** | **37 min 38 s** [33 min 47 s–45 min 30 s] | Définition moteur à aligner avant de conclure sur le rythme |
| Pénalités concédées | 19,20 | 23 pénalités + coups francs [15–31] | Périmètres différents : pas un écart quantifié à corriger tel quel |

Autres mesures du Club équilibré : **251,16 courses/contact**, **275,48 tentatives de plaquage**, **237,88 réussies** (86,4 %), **9,16 turnovers**, **14,84 entrées dans les 22**, **0,20 carton jaune** et **2 884,57 mètres** au compteur du moteur. Ces mesures n'ont pas toutes un équivalent de même définition dans la référence choisie. Les mètres additionnent des avancées positives et ne sont pas un gain territorial net : instrumenter course, point de réception et ligne d'avantage avant de comparer à un autre fournisseur. Aucune division artificielle du compteur n'est proposée.

La dispersion existe : points **21–81** (P10–P90 : 37,8–74,2), essais **2–12**, passes **364–587** (P10–P90 : 424,4–542,0). Les P10/P90 sont interpolés sur 25 valeurs, sans prétention d'estimation robuste de la population. Une moyenne de score plausible ne compense pas le volume excessif de passes.

### Sensibilité aux configurations

| Variante | Points | Essais | Passes | Rucks | Mêlées | Touches | Mauls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Rapide | 49,96 | 5,40 | 492,76 | 196,32 | 12,32 | 18,16 | 5,32 |
| Club équilibré | 53,96 | 6,44 | 475,80 | 189,00 | 12,44 | 18,52 | 5,24 |
| Club avec écart | 55,44 | 6,40 | 487,72 | 192,04 | 11,00 | 19,24 | 5,20 |
| Club avec banc | 54,92 | 6,52 | 487,76 | 192,92 | 12,32 | 18,24 | 5,28 |
| Témoin historique terminé | 50,60 | 6,25 | 504,50 | 168,25 | 10,90 | 20,70 | 4,20 |

L'excès de passes et le faible volume de mauls se retrouvent dans plusieurs variantes. Le côté fort gagne les 25 rencontres de l'expérience à très grand écart de niveau, avec 30,32 points de marge moyenne, contre 12,12 entre équipes équilibrées. La force a donc un effet ; cet échantillon extrême ne démontre pas une victoire garantie pour tout écart de niveau. Compléter par des écarts modestes, plusieurs tactiques et des compositions réellement sélectionnées par l'interface.

### Individuels — moyenne par numéro et par équipe-match

Sur le seul Club équilibré sans remplacement : **50 observations par numéro**, zéros inclus. Ce sont des statistiques de maillot, pas encore des lignes fiables de carrière ni des taux par 80 minutes effectivement jouées. Le moteur fournit cinq colonnes individuelles ; il manque notamment minutes, tentatives de passe, courses et jeu au pied par personne.

| N° / poste | Essais | Passes réussies | Plaquages réussis | Tentés | Mètres du moteur |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 / Pilier | 0,08 | 3,90 | 8,36 | 9,24 | 48,82 |
| 2 / Talonneur | 0,08 | 2,66 | 8,66 | 9,64 | 31,01 |
| 3 / Pilier | 0,00 | 1,90 | 8,30 | 9,42 | 24,35 |
| 4 / Deuxième ligne | 0,04 | 1,66 | 7,62 | 8,60 | 23,72 |
| 5 / Deuxième ligne | 0,00 | 1,54 | 9,12 | 10,34 | 18,91 |
| 6 / Troisième ligne | 0,12 | 2,84 | 9,34 | 10,32 | 55,41 |
| 7 / Troisième ligne | 0,14 | 2,24 | 9,80 | 10,84 | 43,18 |
| 8 / N° 8 | 0,10 | 1,54 | 9,98 | 11,22 | 29,35 |
| 9 / Demi de mêlée | 0,06 | 106,60 | 7,72 | 9,40 | 82,14 |
| 10 / Ouvreur | 0,20 | 51,38 | 7,42 | 8,78 | 229,42 |
| 11 / Ailier | 0,98 | 7,52 | 6,66 | 8,46 | 199,37 |
| 12 / Centre | 0,10 | 21,60 | 7,58 | 8,88 | 144,95 |
| 13 / Centre | 0,18 | 16,04 | 7,84 | 9,26 | 147,72 |
| 14 / Ailier | 0,96 | 7,50 | 6,60 | 8,58 | 201,80 |
| 15 / Arrière | 0,16 | 8,98 | 3,94 | 4,76 | 162,12 |

**Lecture rugby :** le 9 distribue davantage, les troisièmes lignes plaquent davantage et le 15 intervient moins au plaquage : la différenciation des postes existe. Le 9 réalise en moyenne 106,60 passes (P10–P90 : 84,8–127), effet à réexaminer avec le volume collectif. Le 10 cumule 229,42 mètres du moteur ; cela justifie une trace des courses et du point de réception, pas une comparaison directe à des mètres définis autrement.

**Essais :** 161 au total, dont 160 attribués à une personne et un essai de pénalité, correctement laissé sans marqueur. Les deux ailiers inscrivent **97/161, soit 60,2 % de tous les essais** ; les huit avants **28/161, soit 17,4 %**. Le repère World Rugby donne **31 % aux avants**, 66 % aux arrières et 3 % aux essais de pénalité. Il ne donne pas ici une cible spécifique pour les deux ailiers. Le manque d'essais d'avants est à examiner par origine de phase et distance à la ligne, sans imposer un quota par poste. Voir QA-RM-003.

Pour les buteurs, 91 transformations réussies sur 160 tentées (**56,9 %**) dans le Club équilibré : séparer distance, angle, attributs du tireur et position des essais avant de modifier la précision. Les essais concentrés sur les ailes peuvent influencer ce taux. Aucune cible universelle de réussite n'est déduite de cet échantillon de joueurs de niveau 0,5.

### Fiabilité des données : cinq défauts confirmés

- **BUG-RM-006 :** succès de passes supérieurs aux tentatives sur **33 des 50 lignes d'équipe** du Club équilibré ; les offloads incrémentent les succès sans incrémenter les tentatives.
- **BUG-RM-007 :** statistiques indexées par numéro ; le titulaire récupère les actions du remplaçant lors du cumul saisonnier.
- **BUG-RM-008 :** feuille de match estimant la possession par les rucks malgré l'existence d'un chronomètre moteur ; archives ne conservant pas les mesures nécessaires.
- **BUG-RM-009 :** lignes individuelles de coupe/amical rangées sous une clé dont le libellé est « Championnat », tandis que les statistiques collectives ont un autre périmètre.
- **BUG-RM-010 :** scripts arrêtant la simulation au chrono de 80 minutes et pouvant omettre la fin d'un tir ; **13/120** scores changent entre l'instantané de 80 minutes et `TERMINE` dans ce protocole.

Les sommes individuelles des passes, plaquages et mètres correspondent aux sommes d'équipe dans l'échantillon ; cela valide une addition par maillot, pas l'identité du bénéficiaire. L'essai de pénalité est une exception légitime à la somme des essais individuels. Corriger les cinq défauts avant de considérer les classements de joueurs comme une mesure fiable du réalisme.

## Résumé des priorités

| Ticket | Priorité | Nature | Travail attendu |
| --- | --- | --- | --- |
| BUG-RM-001 | P1 | Corrigé (TODO_AUDIT P2-104) | Remplacer le départage par identifiants annoncé comme une prolongation |
| BUG-RM-002 | P1 | Corrigé (TODO_AUDIT P2-105) | Empêcher un onglet ancien d'écraser la progression d'un autre |
| BUG-RM-003 | P1 | Corrigé (TODO_AUDIT P2-105) | Conserver les secours lors d'incidents successifs |
| BUG-RM-004 | P2 | Corrigé (TODO_AUDIT P2-111) | Distinguer les clubs générés portant exactement le même nom |
| BUG-RM-005 | P2 | Écart mesuré | Réduire les passes excédentaires sans casser l'attaque |
| BUG-RM-006 | P1 | Corrigé (TODO_AUDIT P2-107) | Compter les tentatives de passe avec les offloads |
| BUG-RM-007 | P1 | Corrigé (TODO_AUDIT P2-108) | Attribuer les actions à la personne, y compris après remplacement |
| BUG-RM-008 | P2 | Corrigé (TODO_AUDIT P2-109) | Conserver et afficher la possession chronométrée |
| BUG-RM-009 | P2 | Corrigé (TODO_AUDIT P2-110) | Séparer championnat, coupes et amicaux dans les statistiques |
| BUG-RM-010 | P1 | Corrigé (TODO_AUDIT P2-107) | Terminer les matchs des scripts de mesure avant de lire le résultat |
| FUNC-RM-001 | P1 | Livré (TODO_AUDIT P2-106) | Export, import et récupération de carrière accessibles |
| FUNC-RM-002 | P1 | À construire | Reprendre un match joué après fermeture du navigateur |
| FUNC-RM-003 | P2 | À compléter | Relecture fidèle des décisions du match interactif |
| FUNC-RM-004 | P2 | À compléter | Instructions individuelles par poste |
| FUNC-RM-005 | P2 | À compléter | Gestion complète du banc et des changements en direct |
| FUNC-RM-006 | P2 | À compléter | Donner un rôle concret et explicable au capitaine |
| FUNC-RM-007 | P2 | À compléter | Rapports qualitatifs de recrutement liés aux données |
| FUNC-RM-008 | P2 | À compléter | Prévisions financières sur plusieurs saisons |
| FUNC-RM-009 | P3 | À compléter | Continuité des effectifs hors de la division du joueur |
| FUNC-RM-010 | P2 | À compléter | Qualifications continentales fondées sur les résultats |
| FUNC-RM-011 | P2 | À construire | Feuille individuelle et collective complète, minutes et filtres cohérents |
| QA-RM-001 | P1 | Validé (TODO_AUDIT P2-115) | Mêlée : temps, positions, ballon et demi de mêlée |
| QA-RM-002 | P1 | Validé (TODO_AUDIT P2-117) | Transitions de possession et phases arrêtées visibles |
| QA-RM-003 | P2 | À valider | Progression territoriale et essais construits |
| QA-RM-004 | P1 | À valider | Parcours complet de compétition et règlement unique |
| QA-RM-005 | P2 | À valider | Parcours mobile et lecture du match |
| QA-RM-006 | P2 | À valider | Mettre les états documentaires en accord avec le code |
| QA-RM-007 | P2 | Validé (TODO_AUDIT P2-116) | Réconcilier définitions, événements, affichage et archives |

## Bugs établis

### [x] BUG-RM-001 — Une égalité en coupe devient une « prolongation » sans jeu supplémentaire — P1

**Statut : CONFIRMÉ par reproduction des fonctions du dépôt.**

**Fichiers :** `docs/js/club-coupes.js` (`enregistrerResultatCoupe`, conséquences et messages), `docs/js/clubUI.js`, archives/feuilles de match ; tests de coupes et de conséquences.

**Reproduction :** créer un tableau de deux clubs identifiés `a` et `b`, puis enregistrer 20–20. Résultat observé : score encore 20–20, `vainqueurId: "a"`, `apresProlongation: true`. Le vainqueur est dérivé du hash des identifiants ; aucune durée ni action supplémentaire n'est simulée par cette fonction. Le message de coupe peut néanmoins annoncer une qualification « après prolongation ».

**Impact :** une rencontre couperet peut dépendre de l'identité informatique des clubs et non du match ; la présentation fait passer un départage abstrait pour une phase jouée. C'est une limite déjà assumée dans le commentaire du code, mais pas une prolongation effectivement simulée.

**Correction attendue :** définir le règlement de départage de chaque compétition fictive, le présenter avant le match, puis exécuter les phases prévues avec état sportif cohérent. Pour les matchs joués, conserver fatigue, cartons, banc, tactique et décisions ; pour les matchs abstraits, produire un départage explicite cohérent avec leur modèle. Ne pas inventer des points pour rendre le score différent.

**Acceptation :** égalités en match joué et abstrait, éventuelle égalité persistante et résultat rechargé ; score, vainqueur, message, qualification, finances et archive concordent. Les identifiants seuls ne décident plus de la performance sportive. Aucun règlement de championnat n'est modifié par cette correction.

### [x] BUG-RM-002 — Deux onglets peuvent écraser leurs progressions respectives — P1

**Statut : CONFIRMÉ par reproduction de deux états chargés sur le même stockage.**

**Fichiers :** `docs/js/club-sauvegarde.js` (`sauvegarderSaison`, `chargerSaison`), `docs/js/clubUI.js`.

**Reproduction :** charger deux copies A/B d'une même carrière à 401 k€. A passe à 501 k€ et sauvegarde. B, resté sur l'ancien état, passe à 391 k€ et sauvegarde : la dernière écriture remplace intégralement A. Ces changements de budget servent uniquement à isoler le conflit, pas à simuler une transaction autorisée. En usage réel, des contrats, résultats ou compositions peuvent être remplacés de la même façon. La reproduction utilise le chargeur Node et un localStorage en mémoire ; le parcours de deux vrais onglets reste à ajouter à la QA navigateur.

**Cause :** une clé unique et un remplacement complet du JSON, sans révision comparée ni protection d'écriture entre sessions. Aucun gestionnaire de conflit correspondant n'a été trouvé.

**Correction attendue :** identifier carrière, révision et session ; garantir un seul rédacteur ou un contrôle de concurrence effectif. Une simple notification `storage` n'est pas une exclusion mutuelle. À la détection d'un état plus récent, empêcher l'écriture obsolète et proposer rechargement ou conservation/export du travail local.

**Acceptation :** deux onglets, actions simultanées, onglet repris après veille et échec de stockage ; aucune progression récente perdue silencieusement. Ajouter un scénario navigateur sur les fonctions de sauvegarde et les actions réelles du Club. Garder les carrières existantes chargeables.

### [x] BUG-RM-003 — Un second incident remplace le secours de la première carrière — P1

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

### [x] BUG-RM-004 — Des clubs adverses distincts portent exactement le même nom — P2

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

**Complément mesuré :** au pas de 0,1 s avec effectifs Club équilibrés, **475,80 passes** par match, contre **314** dans le repère international choisi (environ +52 %). Corriger d’abord BUG-RM-006 et valider les périmètres ; le comptage des offloads ne suffit pas à expliquer un tel volume. Le 13/14 de la première passe reste un résultat des seuils internes, pas une certification de réalisme.

**À analyser :** identifier passes nécessaires au soutien et passes sans progression ; comparer sortie de regroupement, course avant passe, pression et profondeur des receveurs. Les anciens problèmes territoriaux P2-15/P1-21 ont reçu des corrections : repartir des mesures actuelles, pas des anciennes valeurs.

**Correction attendue :** une modification ciblée créant une décision et une action de rugby crédibles ; ne pas réduire simplement le compteur, supprimer des événements ou accélérer artificiellement les courses pour satisfaire une moyenne.

**Acceptation :** comparaison appariée avant/après sur mêmes graines/configurations, distribution par match et contrôle visuel. Conserver essais, possession, rucks, jeu au pied, contestations et différences entre postes. Si la cible doit évoluer, la justifier avec des références de niveau/format adaptées, sans changer le seuil pour masquer l'écart.

### [x] BUG-RM-006 — Des passes réussies dépassent les passes tentées — P1

**Statut : CONFIRMÉ par lecture et mesure.** Dans le Club équilibré : 475,80 succès contre 472,64 tentatives en moyenne ; 33/50 lignes d'équipe impossibles. Exemple graine 1, équipe B : 266 succès / 263 tentatives.

**Cause / fichiers :** branche offload de `_tickPorte` dans `engine/rugby-engine.js` et `docs/rugby-engine.js` : `passes`, `offloads` et compteur individuel augmentent, mais pas `passesTentees`.

**Correction proposée :** une convention unique tentative → résultat, utilisée par passe ordinaire, combinaison et offload. Incrémenter la tentative à l'action réelle et le succès à sa réussite ; distinguer interception, en-avant et échec. Ne pas plafonner les succès ni modifier les actions pour cacher le défaut.

**Acceptation :** scénarios de passe/offload réussi, raté et intercepté ; succès ≤ tentatives, individuellement et collectivement, accord avec les événements et conservation après archive. Vérifier le cas de la passe en cours à la fin du match.

### [x] BUG-RM-007 — Les actions d'un remplaçant enrichissent la fiche du titulaire — P1

**Statut : CONFIRMÉ par reproduction isolée et reconnu dans le commentaire du chemin de cumul.** `_statJoueur` indexe les cinq compteurs par équipe et numéro. Un remplacement conserve ce numéro ; `club-jour-match.js` utilise ensuite `compositionUtilisee` pour attribuer le total au titulaire d'origine. Dans une reproduction, 12 passes avant le changement puis une après donnent 13 au titulaire et aucune ligne au remplaçant.

**Fichiers :** moteur et copie publiée, `docs/js/club-jour-match.js`, `docs/js/club.js` (`accumulerStatsJoueurs`), affichage de fiche et archives.

**Correction proposée :** identité stable du joueur dans chaque événement et agrégat ; enregistrer entrées/sorties, minutes réelles et éventuels changements de poste. Le numéro sert à l'affichage, pas à fusionner les personnes. Garder le titulaire et l'entrant sur deux lignes.

**Acceptation :** changement manuel et programmé, blessure, carton, changement de poste et reprise de sauvegarde. Le remplaçant reçoit seulement ses actions et son temps ; la somme rejoint l'équipe hors exceptions documentées. Les anciennes statistiques impossibles à répartir restent marquées comme historiques non ventilées : aucune répartition rétroactive inventée.

### [x] BUG-RM-008 — Possession estimée et données perdues dans les archives — P2

**Statut : CONFIRMÉ par le code et une entrée contrôlée.** `club-feuille-de-match.js` affiche un ratio de rucks et affirme que le moteur ne chronomètre pas la possession ; il expose pourtant `tempsPossession`, `possessionPct` et `tempsJeuEffectif`. Une entrée contrôlée de 40/60 au chrono et 80/20 en rucks affiche 80/20. Dans l'échantillon équilibré réel, l'écart absolu moyen n'est que de 1,56 point, maximum 4 points : ne pas présenter le cas contrôlé comme un résultat fréquent.

**Fichiers :** `docs/js/club-feuille-de-match.js`, `docs/js/club-archives-matchs.js` (`compacterEtatMatch`), moteur. La compaction garde score, statistiques d'équipe et une chronologie réduite, mais pas possession/occupation/temps effectif ni statistiques individuelles.

**Correction proposée :** afficher la mesure chronométrée lorsque disponible et en conserver les bases avec les lignes individuelles dans une archive versionnée. Pour une ancienne archive, un repli estimé doit rester explicitement libellé et ne pas remplacer une mesure connue. Vérifier séparément la définition du chrono : QA-RM-007.

**Acceptation :** état direct → feuille → archive → rechargement : mêmes mesures et définition affichée. Cas sans ruck, possession déséquilibrée, ancien format et taux non calculable, sans valeur fictive.

### [x] BUG-RM-009 — Les statistiques individuelles et collectives n'ont pas le même périmètre — P2

**Statut : CONFIRMÉ dans les appels de cumul et leurs libellés.** `LIBELLE_COMPETITION.pro` vaut « Championnat » dans `club.js`. Les conséquences de coupe et d'amical dans `club-coupes.js` appellent aussi `accumulerStatsJoueurs` avec `pro` pour le premier XV. Ces performances se mélangent donc sous ce libellé. Le cumul collectif `accumulerStats`, lui, est appelé par le chemin championnat ; comparer les deux classements devient trompeur.

**Correction proposée :** séparer identité de compétition, type de rencontre et équipe (premier XV/B/Espoirs), avec filtre explicite « Toutes compétitions ». Propager `matchId` et `competitionId` à la feuille, au cumul et à l'archive, appliquer chaque résultat une seule fois. Ne pas traiter « pro » comme une compétition.

**Acceptation :** séquence championnat → coupe → amical : le filtre championnat exclut les deux autres, le total toutes compétitions se réconcilie avec les feuilles. Vérifier les trois équipes et les cumuls collectifs/individuels. Pour l'historique sans information suffisante, afficher un périmètre inconnu plutôt que recatégoriser au hasard.

### [x] BUG-RM-010 — La calibration peut lire un score avant la fin effective du match — P1

**Statut : CONFIRMÉ avec la boucle exacte des scripts.** `for (let t = 0; t < 4800; t += 0.2) tick(0.2)` peut s'arrêter pendant une transformation. Configuration moteur par défaut : graine 4, 31–18 en `TRANSFORMATION` à l'arrêt, puis **33–18** à `TERMINE` ; graine 18, 9–48 puis **9–50**. Dans l'audit complémentaire, 13/120 instantanés à 80 minutes diffèrent du score final. Cela désigne l'achèvement d'un tir déjà engagé, pas une prolongation de coupe.

**Fichiers :** `server/test-calibration-moteur.js`, `server/simulate-batch.js`, `server/test-stats-matchs.js` ; auditer les autres appels similaires.

**Correction proposée :** faire avancer jusqu'à l'état terminal, avec garde bornée et échec si non terminé ; enregistrer graine, configuration, pas et état final. Distinguer temps réglementaire et temps d'achèvement. Le test doit détecter les matchs non finis, pas leur donner des statistiques finales.

**Acceptation :** deux graines reproduites, fin sur essai/tir/pénalité et aucun tir en cours ; accord du score, chronologie et statistiques entre scripts et fin réelle. Recalculer les références affectées sans effacer les anciennes mesures datées. Ne pas modifier les règles du moteur pour satisfaire la boucle de test.

## Fonctions à terminer ou approfondir

### [x] FUNC-RM-001 — Export, import et récupération de carrière dans l'interface — P1

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

**État constaté, précisé lors de la seconde passe :** les coupes continentales existent et `club.js` calcule déjà `qualificationEuropeenne` du club humain à partir de son classement final en élite (deux premières places continentale, suivantes jusqu’à la quatrième challenge). Ne pas recréer ce mécanisme. La génération des autres participants reste fondée sur les niveaux ; vérifier la traduction effective de la qualification dans les tableaux et compléter le palmarès de qualification à l’échelle du monde.

**À livrer :** définir les places par compétition/pays, utiliser les classements et titres réellement obtenus la saison précédente, gérer réattribution/cumul et afficher la raison d'une qualification ou d'une non-qualification.

**Fichiers :** `club-coupes.js`, `club-competitions.js`, `world.js`, archives et changement de saison.

**Acceptation :** champion, vainqueur de coupe déjà qualifié, égalité au classement, changement de club du manager et ancienne carrière sans historique suffisant. Aucun résultat passé inventé ; règle de transition annoncée.

### [ ] FUNC-RM-011 — Feuilles statistiques complètes et comparables par joueur — P2

**État constaté :** cinq compteurs individuels seulement : essais, passes réussies, plaquages tentés/réussis et mètres. Le cumul collectif de carrière n'expose qu'une partie des mesures du moteur ; les archives perdent les lignes individuelles. La priorité est de fiabiliser BUG-RM-006 à 009.

**À livrer par étapes :** identité, titulaire/entrant et minutes effectivement jouées ; tentatives et réussite de passe, courses, coups de pied, buteur, turnovers et participation aux regroupements lorsque ces actions sont réellement mesurées. Compléter la feuille collective par possession/occupation, rucks, mauls, conquête et sanctions. Chaque libellé a une définition et une unité ; aucune statistique déduite arbitrairement d'un attribut.

**Présentation proposée :** totaux par rencontre et par saison, filtres compétition/équipe/poste et taux par 80 minutes seulement si le temps réel est connu. Montrer le dénominateur des pourcentages ; absence de mesure ≠ zéro. Pour mètres et occupation, séparer distance positive parcourue avec ballon, gain net par phase et jeu au pied. Ne pas déduire la qualité d'un avant de ses seuls essais.

**Acceptation :** une feuille complète relie chaque total aux actions, survit à l'archive et aux changements de joueur, et se réconcilie avec les cumuls saisonniers filtrés. Les fiches sans minutes fiables ne présentent pas un faux taux par 80 minutes.

## Réceptions gameplay et QA

### [x] QA-RM-001 — Mêlée : chronologie, ballon et numéro 9 — P1

**État : À VALIDER visuellement et par traces sur le code actuel.** Machine à états présente ; la suite complète `test-melee.js` n'a pas terminé dans la limite de 150 s de cette passe. Ce dépassement de temps local n'est pas une preuve de défaut de règle.

**À enregistrer pour chaque étape :** tick/temps, état, point de mêlée, position/identité des 16 avants, des deux 9 et du ballon ; propriétaire logique, état tenu/au sol/en transit, fautes et équipe bénéficiaire.

**Parcours :** octroi et déplacement → formation des packs → crouch/bind/set → introduction du 9 au tunnel → talonnage/contestation → ballon vers l'arrière du pack gagnant → éventuelle sortie du 8 ou prise/relais du 9 → jeu courant. Distinguer côté d'introduction, côté de sortie, bras/joueurs et position réelle du ballon ; il ne reste pas artificiellement dans les mains du 9 pendant le talonnage.

**Cas :** les deux sens d'attaque, gain contre introduction, écroulement, rotation, liaison/perte de stabilité, introduction irrégulière, ballon bloqué, remise en place et packs incomplets. Documenter simplifications et règlement de référence ; ne pas déduire la sanction d'un simple seuil visuel de rotation.

**Acceptation :** trace déterministe, captures/vidéo à vitesse lisible et transitions cohérentes entre position logique et rendue. Aucun porteur fantôme ou téléportation trompeuse ; une faute/reset ne fait pas continuer l'ancienne séquence.

### [x] QA-RM-002 — Ballon, possession et reprises cohérents de bout en bout — P1

**État : À VALIDER.** Les phases existent ; ce ticket porte sur leur enchaînement et leur lecture, pas sur leur simple fréquence.

**Parcours :** coup d'envoi/réception, passe/offload/interception, plaquage/libération/ruck, maul, touche, pénalité, essai/transformation et reprise suivante. Contrôler simultanément état du ballon, joueur porteur, trajectoire, événement, score et équipe en possession.

**Acceptation :** aucune double possession ni joueur qui garde visuellement le ballon après sa libération ; phase annoncée conforme à l'action. Ruck/touche/maul se terminent, faute et avantage ont une conséquence identifiable, essais issus d'une action traçable. Réexécuter les invariants complets : leur timeout local interdit de les annoncer validés dans cette passe.

### [ ] QA-RM-003 — Refaire les mesures territoriales et l'attaque près de la ligne — P2

**État : À VALIDER**, en continuité de P2-15/P1-21/P2-13 de `TODO_AUDIT.md`, déjà partiellement corrigés.

**Complément actuel :** sur 25 matchs Club équilibrés, 28/161 essais d’avants (17,4 %), 97/161 pour les deux ailiers (60,2 %), 5,24 mauls et 2 884,57 mètres cumulés du moteur par match. Les variantes confirment une concentration sur les ailes ; analyser notamment les options d’avants et mauls près de la ligne, la qualité des réceptions et les boucles de recul/réavancée. Le repère international n’est pas un quota imposé aux postes.

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

### [x] QA-RM-007 — Définitions et rapprochement des statistiques de bout en bout — P2

**État : À VALIDER.** Référence de vocabulaire : [définitions statistiques World Rugby](https://www.world.rugby/the-game/game-analysis/definitions), utilisée pour les métriques et non comme règlement actuel des remplacements. Choisir et documenter le périmètre de chaque compteur avant de fixer des objectifs de réalisme.

**Chronométrage :** le moteur exclut les phases entières `MELEE` et `TOUCHE` du temps effectif, y compris leur partie jouée. La définition de référence commence à l'introduction ou au lancer. Aligner début/fin des séquences, possession et temps effectif ; ne pas attribuer automatiquement les 31,79 minutes au seul rythme des actions.

**Rapprochements à réaliser :** événements → joueurs → équipe → feuille → archive → saison, mêmes filtres et identités. Passes réussies ≤ tentées, plaquages réussis ≤ tentés ; somme des personnes compatible avec l'équipe. Un essai de pénalité n'a pas de marqueur individuel ; un reset de mêlée n'est pas nécessairement une nouvelle mêlée. Séparer gain sur son introduction et gain contre introduction, pénalité et coup franc, transformation et tir de pénalité, coup de pied courant et renvoi.

**Acceptation :** scénarios contrôlés de chaque cas, puis au moins dix matchs complets versionnés et une observation visuelle. Décomposer les buts par type/distance/angle/buteur, les essais par poste/origine de phase et les mètres par définition ; publier distribution et moyennes. Les anciens formats incomplets restent identifiés. Aucun indicateur validé uniquement parce qu'il entre dans une fourchette.

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

**Mesure initiale conservée pour historique :** 20 exécutions arrêtées par la boucle de 80 minutes, graines 1–20, `dt = 0,2 s`, réglages du script de calibration. Cette boucle ne garantit pas `TERMINE` (BUG-RM-010). En achevant ces 20 matchs, la moyenne devient **50,6 points** et **6,25 essais** ; les **504,5 passes** restent inchangées. La table initiale ci-dessous ne doit pas être présentée comme un nouveau contrôle de matchs tous terminés.

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

1. BUG-RM-001 et BUG-RM-002/003 + FUNC-RM-001 : résultat de coupe fiable et protection de la carrière.
2. BUG-RM-006/007/010 : tentatives cohérentes, attribution aux personnes et mesures sur matchs réellement terminés.
3. BUG-RM-008/009 + QA-RM-007 : mêmes mesures et périmètres en direct, dans les feuilles, archives et cumuls.
4. QA-RM-001/002 puis BUG-RM-005 + QA-RM-003 : validation visuelle, passes utiles, conquête et options d'avants près de la ligne ; comparer avant/après sur les mêmes graines.
5. FUNC-RM-011 puis FUNC-RM-002/003 : feuilles détaillées fiables, continuité/relecture, puis enrichissement de gestion.

Pour chaque lot : une correction cohérente, sa reproduction/test et son effet observable. Pas de refonte générale du moteur ni d'annonce de fermeture sur la seule présence d'un bouton. **28 tickets ouverts : 10 bugs/écarts, 11 fonctions, 7 réceptions QA.** Cette mise à jour documente les constats et propositions ; aucun bug de jeu n'a été corrigé par cet audit.
