# V4 — Cahier de tests falsifiables des agents à buts

Ce document définit **comment prouver que le moteur comporte une IA de planification INDIVIDUELLE** et non une chorégraphie de déplacements ou une IA collective. **Référence obligatoire :** `07_AGENT_INDIVIDUEL_PLACEMENT.md`. Les fixtures initiales sont synthétiques ; aucun taux chiffré ci-dessous n'est présenté comme une mesure réelle.

## 1. Quatre couches distinctes

| Couche | Outil | Ce qui est prouvé | Ce qui n'est PAS prouvé |
|---|---|---|---|
| Validation des fixtures | `server/test-spec-simulation-v4.js` | dix scènes bien formées, 30 postes | moteur intelligent |
| GOAP symbolique | `server/test-v4-goap-planner.js` | recherche d'une séquence, alternatif, coûts, déterminisme | mouvement/règles |
| Intégration moteur | `server/test-v4-agents-integration.js` (à créer) | action réelle, état physique cohérent, replan | lisibilité écran |
| Visuel et population | Playwright + batch de graines | animation / statistiques / vitesse | légalité sans assertions ciblées |

**Interdiction** : marquer "IA opérationnelle" si seuls les tests des deux premières couches passent.

## 2. Plan de tests GOAP symboliques (socle déjà codé)

| ID | Setup | Assert |
|---|---|---|
| G01 | 9 derrière ruck, 10 libre | plan exact `MOVE_TO_RUCK → SECURE_BALL → PASS_TO_10` |
| G02 | même setup, 10 couvert, pod libre | plan **différent**, termine `PASS_TO_POD` |
| G03 | aucun receveur | `NO_PLAN`, aucune passe inventée |
| G04 | 9 hors-jeu | sans `GET_ONSIDE`, aucune prise de ballon |
| G05 | même setup avec `GET_ONSIDE` | plan légal avec étape de remise en jeu |
| G06 | route directe chère vs route à 2 actions | Dijkstra minimise le coût |
| G07 | snapshot et catalogues réutilisés | aucune mutation |
| G08 | catalogue réordonné | résultat identique |
| G09 | recherche limitée à 1 expansion | `BUDGET_EXCEEDED`, pas de plan truqué |
| G10 | profondeur 2 pour plan à 3 actions | `DEPTH_LIMIT` |
| G11 | état initial satisfait déjà le but | plan vide + statut distinct |
| G12 | but prioritaire irréalisable | but faisable suivant sélectionné |
| G13 | coût négatif, ID doublé, budget invalide | erreur explicite |
| G14 | but prioritaire déjà satisfait | sélectionner un autre objectif encore actif ; sinon `ALL_GOALS_SATISFIED` |

## 3. Scénarios moteur obligatoires (à programmer après l'injecteur)

| Test | Scénario | Déclencheur | Assertions à implémenter |
|---|---|---|---|
| I01 | S01 | 9 à 6 m du ruck | `MOVE_TO_RUCK` prend au moins distance/vitesse, sans saut |
| I02 | S01 | soutien A6 rejoint le contact | la sécurisation n'est comptée qu'après arrivée réelle |
| I03 | S01 | 10 libre puis défenseur avance | 9 replanifie, choisit option qui reste légale |
| I04 | S01 | 9 est au sol ou exclu | une autre personne est désignée, aucun 9 fantôme |
| I05 | S02 | ruck près de touche | pas de cible derrière la ligne de touche |
| I06 | S03 | mêlée non introduite | `SCRUM_HOOK` inapplicable, aucune sortie de balle |
| I07 | S03 | B9 placé illégalement | la loi l'emporte sur un plan rentable |
| I08 | S04 | alignement incomplet | l'IA n'annonce pas `LINEOUT_READY` |
| I09 | S05 | soutien de maul sans liaison | ne pousse pas, ne compte pas dans le rapport de force |
| I10 | S06 | B gagne le ballon | A replanifie attaque→défense, replie avant réaffectation |
| I11 | S07 | chasseur devant botteur | aucune poursuite illégale avant remise en jeu |
| I12 | S07 | réception profonde | au moins un joueur pertinent couvre le fond |
| I13 | S08 | avantage territorial réel | avantage joué si conditions satisfaites |
| I14 | S08 | avantage non obtenu | sanction reprise à la marque |
| I15 | S09 | remplaçant demandé jeu en cours | pas d'entrée anticipée, pas de 16e joueur |
| I16 | S10 | A14 aplati ou plaqué | le moteur reste seul à attribuer l'essai |
| I17 | défense | A13 fixe B13 | défense adapte plan en fonction du nouvel intervalle |
| I18 | ballon en arrière de la ligne | A15 seul en couverture | choix `PREVENT_TRY` prioritaire à `COVER_BACKFIELD` |
| I19 | fatigue variable | un soutien s'épuise | chaque coéquipier proche décide seul s'il peut prendre le soutien légalement, à partir de ses observations |
| I20 | replanification impossible | planner renvoie `NO_PLAN` | comportement de secours **légal**, log explicite |

Les I01–I20 sont des exigences futures : **aucune promesse qu'ils passent déjà**. Chaque PR doit implémenter les tests relatifs aux tâches modifiées.

## 4. Tests différenciants : prouver une vraie planification

### D01 — même but, deux plans

Figer `initialWorld` et `DISTRIBUTE_BALL`; modifier uniquement `PASS_LANE_10_OPEN`. Attendu : plan 9→10 puis plan 9→pod. Échoue si code `if (nine) passToTen` est utilisé.

### D02 — plan invalidé en cours d'exécution

Le 9 commence `MOVE_TO_RUCK` ; un défenseur coupe le couloir du 10 **pendant le déplacement**. Attendu : mouvement vers ruck se poursuit légalement, `PASS_TO_10` est invalidée avant exécution, plan reconstruit. Échoue si le 9 suit inexorablement le premier plan choisi.

### D03 — intention ≠ résultat

Définir une action `TACKLE_CARRIER` dont l'effet symbolique est `CARRIER_TACKLED=true`. Forcer un plaquage manqué par le moteur physique. Attendu : `CARRIER_TACKLED=false` dans le monde réel ; l'agent observe l'échec et replanifie. Échoue si l'IA écrit l'effet symbolique dans le snapshot.

### D04 — 30 agents autonomes, un ballon

Instancier **30 `AgentController` individuels et aucun `TeamBlackboard`** ; créer un ruck contesté. Attendu : les joueurs déterminent localement s'ils peuvent/veulent intervenir selon légalité, proximité, partenaires observés et objectifs de leur poste. Le nombre de participants demeure physiquement crédible, sans limite imposée par un coordinateur. Aucun joueur engagé ne peut exécuter `HOLD_WIDTH` pendant sa liaison. Aucun module ne choisit globalement les 30 buts ni les 30 cibles.

### D05 — priorité vitale

A15 a le but `COVER_BACKFIELD`, mais un B14 s'enfuit vers l'essai. Attendu : `PREVENT_TRY` préempte le plan précédent, avec une nouvelle trajectoire de couverture et événement d'explication.

### D06 — changement de tactique manager

Conditions et graine identiques ; changer seulement la consigne 1-3-3-1 → 2-4-2. Attendu : chaque joueur lit la tactique commune et peut changer individuellement ses buts et courses de référence, sans assignation centrale ; mêmes lois d'arbitrage.

### D07 — intelligence sans omniscience

Un joueur cache temporairement le ballon derrière un paquet. Attendu : un agent éloigné ne connaît pas instantanément la nouvelle position exacte si le système de perception active la visibilité limitée ; il agit sur son estimation ou sur la communication de l'équipe.

### D08 — stratégie de secours

Planificateur dépassant `maxExpandedNodes` ou aucun but réalisable. Attendu : `BUDGET_EXCEEDED` ou `NO_PLAN`, `HOLD_SAFE_POSITION`/repli légal, jamais exception bloquant le tick.

## 4 bis. Autonomie et placement émergent — tests IND-01 à IND-12

En plus des tests D et I, les douze cas détaillés dans [`07_AGENT_INDIVIDUEL_PLACEMENT.md`](07_AGENT_INDIVIDUEL_PLACEMENT.md) sont **obligatoires**. Ils vérifient notamment que le joueur connaît son emplacement nominal sans recevoir une consigne de mouvement, que **défendre** fait partie des buts prioritaires lorsque la possession change, que plusieurs buts expliquent la formation réelle, et qu'une modification des croyances d'A6 **ne modifie pas directement** les plans d'A7 ou A8. L'existence d'une IA d'équipe, d'un blackboard d'affectation ou d'une recherche globale des positions doit faire **échouer** la validation architecturale.

## 4 ter. Événements de matchs sourcés et alternatives (REAL-01 à REAL-16)

**Voir `11_MATCHS_REELS_ET_PRISES_DE_DECISION.md`** : 16 séquences de quatre matchs (Angleterre–Galles 2024, Angleterre–France 2025, Irlande–France 2025, France–Fidji 2026) et `fixtures/observations_matchs_reels.json`.

**Étape documentaire immédiatement testable** : `node server/test-v4-top14-data.js
node server/test-v4-observations-matchs.js` vérifie provenance des événements, dates, source, caractère approximatif du temps, et interdit d'annoter une conversation de 9/10/8 ou une trajectoire à 30 joueurs non mesurée comme une observation factuelle.

**Étape moteur à créer** : pour chacun des 16 cas REAL, deux scénarios à **condition initiale changée**, même graine et même gestion des règles : ballon disponible/bloqué, défense près/large, receveur à portée/hors jeu, pied haut avec/sans chasse légale, maul avec/sans faute. Un essai historique **n'est pas un résultat forcé** ; l'IA doit seulement rendre la séquence possible si ses préconditions s'y prêtent.

**Étape style de jeu** : `STYLE-01` deux plans de jeu connus par agents (jeu rapide avec passes vs occupation au pied) ; `STYLE-02` deux 9 différents sous même plan ; `STYLE-03` décision tir au but/pénaltouche sans essai automatique. Ces tests sont proposés depuis les contrastes World Rugby Six Nations 2023, **pas encore exécutables**.

**Priorités :** G34 sources/baseline → G35 implémentation causale → G36 calibration de choix ; dépendances GOAP G02–G11 et des phases concernées G18–G20/G31–G33 obligatoires.

## 4 quater. Sortie du 8 après annonce et styles internationaux — tests S8/STYLE

Consulter `12_STYLES_ANGLETERRE_AFRIQUE_DU_SUD_NOUVELLE_ZELANDE.md` et la liste `S8-01..S8-09`, `STYLE-04..STYLE-10` ; **16 nouveaux tests d'intégration à développer**, qui ne doivent pas être présentés comme réussis après de simples tests du transport.

Le 8 peut discuter avant la mêlée et être disponible, mais son **signal de départ effectif (`SCRUM_8_GOING`) doit être émis avant la tentative de prise**. Le 9 qui l'entend doit abandonner son plan de prise (si annulable), décider d'un autre but et **calculer son déplacement individuellement**. Si le message arrive trop tard ou manque, les deux joueurs peuvent mal se coordonner ; jamais deux porteurs, jamais un déplacement imposé depuis un coordinateur.

Le corpus de **12 observations dans cinq matchs ENG/RSA/NZ** est vérifié par `node server/test-v4-styles-match-data.js`. Un snapshot daté du 4 septembre 2026 permet de comparer certaines métriques des Springboks et des All Blacks ; les choix individuels seront testés avec les mêmes graines en changeant **uniquement** le plan de jeu interchangeable, le profil du 9 ou un placement défensif. Ne pas coder de comportements selon la nationalité.

## 4 quinquies. Top 14, véritables actions observées et calibration fiable

**Source prioritaire :** `13_MATCHS_TOP14_DECISIONS.md`, corpus JSON `fixtures/observations_top14_2025_2026.json`.

**Déjà testable :** `node server/test-v4-top14-data.js` valide neuf matchs sourcés, 19 observations distinctes, six relevés chiffrés de la LNR, et **rejette comme données manquantes** les zéros incohérents de la page statistique de la finale 2026 Toulouse–Montpellier. Cela **ne signifie PAS** que le moteur de match reproduit ces actions.

**Tests à créer : `TOP14-01..19` (G40)**, avec deux alternatives à graine et joueurs identiques :
- Racing–Bayonne, départ du 8 Nathan Hughes : 8 annonce `SCRUM_8_GOING`, 9 l'entend et replanifie ; si message perdu, course concurrente mais **un seul porteur**.
- Toulouse–Bayonne, touche suivie d'une percée de Brennan et passe vers Ntamack ; le joueur peut choisir une touche **sans maul** et le support doit être effectivement présent.
- Toulouse–Montpellier, **une-deux du 9 et du talonneur** depuis une touche ; mêlée à cinq mètres puis **coup franc rapide**, pied par-dessus du 10 ; arbitrage et pause orage.
- Finale Toulouse–UBB : **33-33 à 80 min**, prolongation, tirs réussis ou manqués ; les pénalités proviennent du match physique et de la décision arbitrale.
- Racing–La Rochelle, **troisième ligne Jegou passeur vers le 9 Le Garrec**, et drop Racing de fin de rencontre **manqué**.
- Toulon–La Rochelle, plus d'essais mais défaite : points au pied réellement comptés ; Pau–Toulouse, davantage d'essais malgré moins de possession.
- Les statistiques finales 2026 présentées comme « zéro passe, zéro touche, zéro mêlée » sont invalides : `null` dans les comparaisons et aucune métrique de réussite artificielle.

**Calibrer (G41)** : 30, 100 puis 500 matchs par variantes avec mêmes graines LEGACY/GOAP, moyennes + quantiles + dispersion, données LNR explicitement sourcées, aucune stratégie figée par nom de club. Mesurer le résultat de chaque but et ses échecs réels, pas seulement l'issue du match.

**Interdiction architecturale maintenue** : le 9 consulte mais ne pilote aucun mouvement des 29 autres ; les trajectoires et buts sont sélectionnés individuellement, et une parole reçue n'est qu'une information.

## 5. Instrumentation attendue pour chaque test
## 4 sexies. MICRO-01..07 et MIC-01..12 : **prouver une vraie décision dans chaque instant**

`14_ANALYSE_MICRO_ACTIONS_TOP14.md` et `fixtures/micro_actions_top14.json` apportent **47 micro-étapes** à travers **7 études**, dont **22 contre-factuels**. `node server/test-v4-top14-micro-actions.js` confirme la cohérence documentaire : sources, acteurs, perceptions **hypothétiques**, buts, 2+ options, garde-fous et mouvements individuels. Cela **ne constitue pas** un résultat moteur.

Les douze tests d'acceptation `MIC-01..MIC-12` décrits dans le document 14 restent à écrire : défenseur qui suit ou non Willis ; vraie lecture de la défense par Flament ; 9 qui annule une prise quand 8 annonce départ ; ailier qui court après ras-de-terre ; talonneur qui redevient receveur après touche ; défenseur pouvant changer de cible avec inertie et erreurs ; bascule au petit côté malgré plan de jeu large ; transitions de possession après pied perdu.

Les 22 variantes doivent changer **une seule** observation pertinente, avec graine fixe, puis tracer les buts et actions de **chaque agent concerné**. Rejeter toute implémentation où le leurre ordonne au défenseur de le suivre ou où le coach écrit le destin des 30 joueurs.



Un test qui échoue doit fournir au minimum :

```json
{
  "seed": 1001,
  "fixture": "S01",
  "tickIndex": 92,
  "playerId": "A9",
  "phase": "RUCK",
  "goal": "DISTRIBUTE_BALL",
  "currentAction": "PASS_TO_10",
  "failure": "precondition_invalid",
  "facts": ["SELF_AT_RUCK", "PASS_LANE_10_CLOSED"],
  "expected": "replan_to_available_receiver"
}
```

Ajouter les métriques agrégées suivantes :
- plans construits/joueur/match ;
- expansions de nœuds moyen/p95 ;
- plans sans solution / dépassement budget ;
- changements de but par minute et oscillations ;
- durées réelles / prévues des actions ;
- violations de garde légale bloquées ;
- objectifs individuels concurrents, collisions et éventuels conflits de couverture ;
- tours de moteur/s et fps par appareil ;
- métriques rugby existantes (passes, rucks, mêlées, touches, essais, possession, pénalités, coups de pied).

## 6. Comparatif des graines

Avant chaque fusion qui touche le comportement :
- même graine initiale, même config manager, même durée, même moteur sauf patch ;
- 30 matchs en développement ;
- 100 matchs si l'action modifie les contacts, le ballon, les hors-jeu ou le scoring ;
- 500 matchs dans le test long existant ou campagne dédiée ;
- moyennes **et dispersions**, pas seulement un match spectaculaire ;
- ne pas baisser arbitrairement les seuils des tests existants ;
- conserver un rapport `before-after.md` avec `seed, commitA, commitB, n, scores, rucks, passes, touches, mêlées, turnovers`.

Un gain de réalisme de placement qui effondre les essais n'est **pas** une réussite. Les chiffres du dossier historique `docs/ANALYSE_MATCH_REEL.md` datent d'une autre version du moteur : **ne pas les présenter comme un état courant**.

## 7. Commandes concrètes

```bash
node server/test-v4-observations-matchs.js
node server/test-v4-goap-planner.js
node server/test-spec-simulation-v4.js
node server/test-placement-arbitrage.js
node server/test-invariants.js
node server/test-ruck.js
node server/test-melee.js
RM_TOUCHE_RAPIDE=1 node server/test-touche.js
node server/test-scores-abstraits.js
node server/test-calibration-moteur.js
node server/test-parcours-club.js
```

Les tests lourds sont coûteux ; lancer `node server/test-stats-matchs.js` dans la campagne de validation longue. Les tests de navigateur nécessitent de servir `docs/` et Playwright, cf. `.github/workflows/deploy-pages.yml`.

**Definition of Done V4** : les plans sont utilisés par les agents vivants, les tests D01–D08, I01–I20 et **IND-01–IND-12** passent, aucun coordinateur d'équipe ne choisit les buts ou déplacements, les critères de sécurité et de stats passent, et un navigateur permet d'observer les décisions. Le passage des tests GOAP symboliques seuls **ne suffit jamais**.
