# IA individuelle V4 — comprendre Angleterre, Springboks et All Blacks **à partir de matchs**

**Recherche : 8 novembre 2026.** En complément de `11_MATCHS_REELS_ET_PRISES_DE_DECISION.md`, étudier **5 matchs** et des données comparatives datées. L'objectif est de reproduire **des capacités et priorités individuelles**, **jamais** d'ajouter trois scripts d'équipes ni une IA collective.

## 1. D'abord : le 8 DOIT prévenir le 9 quand il part

**Décision explicite du propriétaire** : sur une mêlée, le 9 peut consulter le 10 (près, large, avancer) et le 8 (départ possible), puis annoncer son choix tactique. Cela ne suffit **PAS** : **le 8 qui décide de prendre le ballon doit lui-même avertir le 9 avant son geste**, car le 9 pourrait se déplacer vers le même ballon.

### Trois messages distincts

| Message | Locuteur / destinataire | Sémantique stricte |
|---|---|---|
| `SCRUM_8_READY` (« Je peux partir ! ») | 8 → 9 | **Possibilité** tactique, aucun changement physique |
| `SCRUM_8_BREAK` (« Départ du huit ! ») | 9 → joueurs à portée | **Choix tactique du 9**, pas prise du ballon |
| **`SCRUM_8_GOING`** (« Neuf, j'y vais ! ») | **8 → 9** | **Intention IMMINENTE** de se détacher et ramasser, à écouter avant le déplacement vers le ballon |
| `SCRUM_9_ACK` (« Reçu, j'te suis ! ») | 9 → 8 | Accusé **optionnel**, le 9 confirme qu'il change son propre plan |
| `SCRUM_8_ABORT` (« Neuf, je laisse ! ») | 8 → 9 | Le 8 renonce ; le 9 **réévalue**, sans récupérer de ballon automatiquement |

**Ordre de décision, exemple théorique :**

```text
A9 : SCRUM_OPTIONS_ASK à A10        A10 conseille SCRUM_WIDE
A9 : SCRUM_8_ASK à A8               A8 répond SCRUM_8_READY
A9 : choisit SCRUM_8_BREAK          chacun interprète l'annonce
Ballon au fond, réellement jouable (constat du moteur)
A8 : choisit son départ, émet SCRUM_8_GOING à A9 AVANT de ramasser
A9 : reçoit SCRUM_8_GOING ; stoppe SON plan MOVE_TO_BALL/SECURE_BALL
     puis choisit SUPPORT_8 ou BE_PASS_OPTION ou PROTECT_BLIND_SIDE
A8 : se détache légalement puis tente SCRUM_8_PICK_FROM_BACK
Moteur : vérifie liaison, ballon, hors-jeu et attribue au maximum UN porteur
A8 : peut porter, donner au 9, fixer/passer ou se faire plaquer
A9 : suit la vraie action et réévalue ; pas de téléportation
```

**RÈGLE DE CONCEPTION** : la réception de `SCRUM_8_GOING` doit **préempter le but `SECURE_BALL` du 9** si sa tentative est encore annulable. Elle n'écrit jamais directement `A9.goal` dans le transport vocal : c'est l'**AgentController d'A9** qui décide, à partir d'une nouvelle croyance `TEAMMATE_8_INTENDS_PICK`. Une prise déjà engagée n'est pas effacée rétroactivement ; le moteur physique arbitre l'éventuelle compétition et garantit un ballon unique.

**En cas d'échec de communication** :
- le signal peut être perdu (distance, latence, bruit, indisponibilité) : le 9 peut encore tenter d'aller au ballon ; c'est une **erreur de coordination plausible**, à compter en statistiques ;
- le moteur physique n'accorde **jamais** deux prises simultanées et ne téléporte ni le 8 ni le 9 ; l'un gagne la balle, l'autre se retrouve sans balle et replanifie ;
- l'appel peut être trop tôt, obsolète ou concerner une autre mêlée : `phaseId` identifie la mêlée actuelle, sa durée est courte (0,9 s) ;
- si le 8 annule, le 9 **n'hérite pas** du ballon ; il replanifie pour le récupérer s'il est réellement accessible ;
- un signal urgent ne doit pas être éliminé par le *cooldown* juste après `SCRUM_8_READY` ; le transport autorise une émission `GOING` par `phaseId`, mais pas des doublons incontrôlés ;
- le 9 peut répondre `SCRUM_9_ACK` mais le 8 doit pouvoir saisir une opportunité quand la réponse est inaudible, en assumant le risque d'une mauvaise synchronisation.

**Exigence à valider dans le MOTEUR (pas encore implémentée)** : le 8 n'engage pas l'action de prise `SCRUM_8_PICK_FROM_BACK` sans avoir tenté `SCRUM_8_GOING` ; A9 interrompt ou modifie sa course après avoir entendu, à condition que l'information soit pertinente à **cette** mêlée. Le transport des messages, déjà testé, ne réalise pas encore cette transition GOAP.

**Références techniques** : [World Rugby, Number 8 — Scrum](https://passport.world.rugby/coaching/functional-role-analysis/forwards-prop/number-8/) ; [Rugby Coach Weekly, ball delivery by the number 8](https://www.rugbycoachweekly.net/rugby-drills-and-skills/scrums-lineouts/ball-delivery-number-8) : coordination temporelle du 8/9 et variantes *pick-and-roll*, *attack-and-pass* ; [Rugby Toolbox NZ, No 8 plays at the scrum](https://www.rugbytoolbox.co.nz/resources-education/learn-more/articles/snook-on-coaching/no-8-plays-at-the-scrum-2) : canaux 1/2, appels et variantes du 8 vers 9/12/14. **Ces documents défendent une bonne communication ; aucune citation littérale « j'y vais » d'un joueur réel n'est attestée.**

**Loi 19.36** : mêlée terminée quand le ballon sort ou lorsque le joueur le plus reculé / le 8 le récupère dans les conditions définies, notamment si le 8 prend le ballon aux pieds d'un seconde ligne. Ne jamais attribuer le ballon avant la prise légale. [World Rugby, loi 19](https://passport.world.rugby/laws-of-the-game/laws-by-number/19-scrum/).

## 2. Angleterre — plusieurs matchs, pas « toujours botter »

### A. Angleterre 15–16 Afrique du Sud — demi-finale Coupe du monde, 21 octobre 2023

**[OBSERVÉ]** Angleterre devant 15–6 avant le dernier quart, jeu territorial dans un match sous la pluie, points d'Owen Farrell par pénalités et drop-goal. Les remplaçants sud-africains font basculer la confrontation dans les mêlées ; Handré Pollard marque la pénalité décisive à la **78e minute** après une nouvelle pénalité de mêlée. [World Rugby, bilan officiel de la demi-finale](https://www.world.rugby/news/884035/rugby-world-cup-2023-semi-final-review?lang=en).

**[MÉCANIQUE]** Plan `TERRITORIAL_PRESSURE` : le 9/10 comparent `EXIT_KICK`, `CONTESTABLE_KICK`, `HOLD_POSSESSION`, `DROP_GOAL` selon pluie, terrain, score, protection et receveurs. Les piliers sud-africains ont leur fatigue et efforts propres : le remplaçant qui domine peut augmenter le risque de pénalité adverse ; **aucune probabilité de pénalité automatique liée au maillot sud-africain**.

**[TEST ENG-01]** même état mais pluie/situation de score différent : choix de pied/tir/portage possibles ; faute de mêlée causée par l'état physique et l'arbitre, pas par un tag de nation.

### B. Angleterre 33–19 Nouvelle-Zélande — 15 novembre 2025

**[OBSERVÉ]** l'Angleterre botte **35 fois contre 29** pour les All Blacks ; Ford réalise deux drop-goals et varie les hauts ballons. Mais l'Angleterre marque également après un **lancement de première main depuis touche** : Roebuck fixe/porte puis transmet à Earl, et l'action finit par Dingwall, selon le compte rendu du tournoi. L'aile et les centres changent leur trajectoire selon la défense. [BBC Sport, analyse du jeu au pied](https://www.bbc.co.uk/sport/rugby-union/articles/cdx400z28l7o) ; [Six Nations, match report du 15 novembre 2025](https://www.sixnationsrugby.com/en/autumn-nations-series/fixtures/202500/england-v-new-zealand-15112025-1510/line-ups).

**[MÉCANIQUE]** un plan de jeu peut préférer le **jeu au pied contestable** sans interdire `OFFLOAD`, `FIX_AND_PASS`, `SET_PIECE_LAUNCH` ni `DROP_GOAL`. Les coups de pied anglais ne se transforment pas automatiquement en ballons regagnés : la récupération dépend du placement, du saut, de la concurrence et de la règle.

**[TEST ENG-02]** haut ballon avec chasseurs proches et onside / chasseurs trop loin ou hors-jeu ; `KICK_HIGH` peut rester une option mais la rétention ne peut être garantie. Si l'espace intérieur s'ouvre, le porteur peut choisir la passe.

## 3. Springboks — poussée, occupation, maul... et capacité d'attaque

### A. Afrique du Sud 33–26 Nouvelle-Zélande — Le Cap, 29 août 2026

**[OBSERVÉ]** Nouvelle-Zélande 246 passes contre 93, 154 portages contre 104 et 57 % de possession ; l'Afrique du Sud marque plus de points malgré moins de ballons. Kolbe inscrit quatre pénalités et trois transformations ; les Boks défendent longuement, puis exploitent les séquences de pression et de conquête. [All Blacks, compte rendu officiel](https://www.allblacks.com/news/all-blacks/match-report-all-blacks-v-south-africa-second-test-rugby-s-greatest-rivalry).

**[MÉCANIQUE]** buts prioritaires `DEFEND`, `DOMINATE_CONTACT_LEGALLY`, `WIN_SCRUM_PENALTY_IF_OPPONENT_FAULTS` (n'est **jamais** une pénalité automatique), `USE_TERRITORY_KICK`, `DRIVE_MAUL`, `EXIT_PRESSURE` et `COUNTER_OPPORTUNITY`. Les joueurs peuvent parfois préférer attaquer à la main selon l'espace : **pas de script « Afrique du Sud = 1 passe puis pied »**.

**[TEST RSA-01]** pack frais et stable versus pack fatigué/déséquilibré, même tactique : poussée légale, effort, temps de sortie et décision au 9 différents ; mesures par joueur, pas un « bonus global ».

### B. Afrique du Sud 29–24 Nouvelle-Zélande — Johannesburg, 5 septembre 2026

**[OBSERVÉ]** l'Afrique du Sud marque un essai de pénalité après une mêlée à 5 m dans la seconde période, puis construit un essai de Malcolm Marx sur une pénaltouche et un maul. Les Néo-Zélandais répondent notamment par un **petit coup de pied de Will Jordan**, suivi d'une course de Carter et d'une passe en soutien vers Jordan. [All Blacks, troisième test, compte rendu](https://www.allblacks.com/news/all-blacks/match-report-all-blacks-v-south-africa-third-test-rugby-s-greatest-rivalry) ; [SA Rugby, bilan 5 septembre 2026](https://springboks.rugby/news-features/articles/2026/9/5/boks-take-series-lead-in-greatest-test).

**[MÉCANIQUE]** pour la mêlée et les mauls : chaque avant choisit son effort, son angle et sa liaison ; la domination peut créer une situation de faute adverse mais **seul l'arbitre** décide d'un essai de pénalité. Pour les All Blacks, l'ailier/15 peut choisir `GRUBBER_IN_SPACE`, puis ses soutiens poursuivent selon le ballon réel.

**[TEST RSA-02]** pénaltouche avec maul formé légalement / maul empêché ; une même intention ne doit pas créer mécaniquement l'essai.

### C. Afrique du Sud 43–28 Nouvelle-Zélande — Baltimore, 12 septembre 2026

**[OBSERVÉ]** les Boks gagnent **6 essais contre 4** et remportent la série. À la 75e, Cameron Hanekom marque depuis **la base d'un ruck**, **PAS depuis une mêlée** ; New Zealand conclut également une séquence de passes tardive. [SA Rugby, compte rendu officiel](https://springboks.rugby/news-features/articles/2026/9/12/brilliant-boks-seal-the-deal-in-baltimore) ; [All Blacks, chronologie du 12 septembre](https://www.allblacks.com/matches/south-africa-new-zealand-12-09-2026/commentary).

**[MÉCANIQUE]** le pack sud-africain ne fait pas que de la conquête. Un troisième ligne peut sortir d'un **ruck**, fixer et attaquer la ligne, ou libérer le ballon au 9. **Ne pas confondre la sortie du 8 d'une mêlée avec un pick-and-go de ruck** dans les données ni dans le simulateur.

**[TEST RSA-03]** pick-and-go ruck versus `SCRUM_8_PICK_FROM_BACK` : deux préconditions et machines d'état complètement distinctes ; but `GAINLINE` commun mais actions différentes.

## 4. All Blacks — nombreux portages/passes, opportunisme, puis pression adverse

### A. 2026, duel de styles : chiffres datés **du 4 septembre 2026**

La comparaison faite **avant le troisième test de 2026**, et pas un bilan annuel définitif, fournit :

| Statistique par match, état au 04/09/2026 | Nouvelle-Zélande | Afrique du Sud |
|---|---:|---:|
| Portages | **154,6** | 113,7 |
| Passes | **230** | 112 |
| Coups de pied de jeu courant | 19,8 | **29,7** |
| Réussite en touche | 82,1 % | **93,9 %** |
| Réussite des plaquages | **87,7 %** | 83,6 % |

**Source** : [All Blacks, « By the Numbers », 4 septembre 2026](https://www.allblacks.com/news/all-blacks/by-the-numbers-all-blacks-eye-series-lead-in-johannesburg).

**[MÉCANIQUE]** un plan `EXPANSIVE_POSSESSION` augmente la valeur de `BE_PASS_OPTION`, `FIX_AND_PASS`, `RETAIN_WIDTH`, `SUPPORT_AFTER_OFFLOAD`, `KICK_IN_SPACE`, mais les décisions restent **individuelles et conditionnelles**. Une défense qui ferme le large doit pouvoir faire choisir une passe intérieure ou un pied, même à un All Black.

**[TEST NZ-01]** même porteur, même plan néo-zélandais, défenseurs B12/B13 à des angles différents : `FIX_AND_PASS` versus `CARRY` ou `CHIP` ; chaque soutien calcule sa trajectoire et peut échouer.

### B. Johannesburg 2026 : jeu au pied derrière une défense et soutien

**[OBSERVÉ]** un ailier/15 (Will Jordan) joue dans le dos de la défense et se rend de nouveau disponible pour conclure une combinaison lors du troisième test. Il ne se limite pas à une « zone fixe de poste ».

**[TEST NZ-02]** le joueur venant de l'aile droite apparaît à gauche et botte derrière ; le soutien doit suivre le ballon dans l'espace, puis décider de passer malgré un plaquage. Chronologie physique, pas de téléportation, pas de script qui attribue l'essai.

### C. England–NZ 2025 : une domination de l'autre équipe oblige à changer

Les All Blacks ont concédé des points sur hauts ballons, mêlée et séquences anglaises structurées et ont malgré tout marqué par Will Jordan en seconde période. Un plan de jeu expansif doit savoir **basculer en `DEFEND`, couvrir les pieds et sortir de pression** quand il perd la balle. La défense et le replacement ne sont pas gérés par une IA collective.

**[TEST NZ-03]** même playbook, demi-temps/score défavorable et nombreux pieds adverses ; l'arrière individuel choisit davantage `COVER_BACKFIELD` et un ailier peut rentrer pour protéger une réception, sans commander les autres.

## 5. Modéliser ces styles sans IA collective, sans archétypes « nationalité »

La comparaison porte sur **le plan de jeu et les agents** : ce sont des références en lecture seule. Les noms ci-dessous sont des **presets de stratégie proposés pour Rugby Manager**, pas des caractéristiques innées d'une équipe nationale.

| Preset de plan de jeu | Préférences relatives (pas des ordres) | Risques et alternatives |
|---|---|---|
| `ENG_TERRITORY_AND_AERIAL` | gagne-terrain, coups de pied contestables, surveillance du rideau arrière, jeu territorial | selon défense, possibilité de jeu à la main, combinaison de touche ou drop-goal |
| `RSA_SET_PIECE_AND_PRESSURE` | conserver la mêlée, légalement pousser, jeu d'occupation, maul lorsque conquête gagnée | demande du 9, fatigue du pack, pénalité adverse **non garantie**, contre-attaque si opportunité |
| `NZ_MULTIPHASE_AND_COUNTER` | vitesse de soutien, passes, anticipation des intervalles, conservation, contre-attaque | obligation de couvrir le fond et possibilité de pied, pas de passes à tout prix |

```ts
type PersonalTacticalWeights = {
  playbookId: string;             // donnée connue de tous, lecture seule
  territoryGain: number;          // bonus d'évaluation, pas action forcée
  possessionRetention: number;
  aerialContest: number;
  setPiecePressure: number;
  fastRecycling: number;
  passAndSupport: number;
  riskTolerance: number;
};
// Le 9, le 8, le 10 et le 15 possèdent TOUS le playbook,
// mais chacun applique ses compétences/perceptions/buts individuels.
```

**Ne jamais créer `NationalTeamAI`, `SpringboksDirector` ou `AllBlacksAttackBrain`.** On doit pouvoir attribuer le preset `NZ_MULTIPHASE_AND_COUNTER` à un club anglais ou le `RSA_SET_PIECE_AND_PRESSURE` à une équipe de joueurs néo-zélandais. Les profils individuels et le contexte produisent la variation finale.

Le meilleur test est un **test de permutation** : même 30 joueurs et même graine, modifier le preset et constater une distribution de décisions différente, sans téléportation et sans supprimer les alternatives. Inversement, même preset, changer seulement la défense ou les attributs du 9 et constater le changement de plan.

## 6. Critères d'acceptation à coder (tous futurs sauf transport symbolique)

| ID | Scénario vérifiable | Échec si... |
|---|---|---|
| `S8-01` | 8 prêt puis départ effectif | le 9 traite `SCRUM_8_READY` comme une prise effectuée |
| `S8-02` | 8 prévient `SCRUM_8_GOING` avant `PICK`, 9 entend | 9 continue `SECURE_BALL` malgré la réception, sans replanifier |
| `S8-03` | signal non entendu, les deux convergent | deux porteurs sont produits ou l'un est téléporté |
| `S8-04` | 8 part mais ballon inaccessible | ballon transféré sans prise physique |
| `S8-05` | 8 annonce puis abandonne | 9 reçoit ballon instantanément sans le reprendre légalement |
| `S8-06` | deux mêlées à la suite avec messages anciens | annonce de la mêlée 1 modifie le plan de la mêlée 2 |
| `S8-07` | 8 dit « prêt », puis « j'y vais » moins de 0,7 s après | l'anti-spam supprime l'appel urgent |
| `S8-08` | 8 tient ballon puis passe au 9 | 9 reçoit avant le geste de passe et la trajectoire physique |
| `S8-09` | 9 reçoit l'appel puis menace adverse surgit | 9 ne peut pas abandonner `SUPPORT_8` pour défendre |
| `STYLE-04` | preset England vs NZ, même état | tous les joueurs font systématiquement la même action |
| `STYLE-05` | pack SA frais vs fatigué et substitutions | bonus global arbitraire, pénalités garanties |
| `STYLE-06` | même joueur `NZ_MULTIPHASE` avec défense différente | choix de passe identique à chaque fois |
| `STYLE-07` | preset NZ sur équipe anglaise fictive | logique codée par nationalité plutôt que plan de jeu |
| `STYLE-08` | 2026 Baltimore, départ de ruck par 8 | traité comme un `SCRUM_8_PICK` |
| `STYLE-09` | angle de coup de pied/dernier rideau varie | réception aérienne réglée sans temps de vol ni opposition |
| `STYLE-10` | angle de jeu au large défavorable | l'équipe continue de jouer au large par script malgré interception probable |

**Tests actuellement disponibles** : `server/test-v4-local-communication.js` (transport, signaux 8→9, `phaseId`, anti-spam) et `server/test-v4-tactical-dialogue.js` (échanges symboliques). Les 19 tests `S8` et `STYLE` ci-dessus sont **des scénarios d'intégration GOAP/Moteur non encore livrés**.

## 7. Ordre de développement conseillé

- **RM4-G37** : connecter `SCRUM_8_GOING` à la mémoire du 9 et à la préemption de son but `SECURE_BALL` ; test `S8-01..09`, collision & ballon unique, animation réelle du départ ; dépend G04–G11/G19/G32.
- **RM4-G38** : ajouter le corpus de matchs England–SA, England–NZ, SA–NZ 2026 et les presets *interchangeables* ; tester `STYLE-04..10` et les alternatives tactiques sur des matchs complets ; dépend G34–G36.
- Priorité d'intégration GOAP générale inchangée : **G02→G03→G04→G05→G06→G07→G08→G09→G10→G11**, puis phases et spécialisations.
- Refuser la fusion des comportements réels de G37/G38 si `server/test-melee.js`, `test-invariants.js` ou les tests multi-graines montrent deux porteurs, mêlée illégale ou jeu au pied toujours automatique.

**Résumé :** le 9 **choisit la stratégie** ; le 8 **prévient de son geste** ; le 9 peut alors décider de le soutenir ; les styles anglais, sud-africain et néo-zélandais sont des **préférences de plan de jeu** exploitées par **chaque** joueur, et non trois IA différentes.
