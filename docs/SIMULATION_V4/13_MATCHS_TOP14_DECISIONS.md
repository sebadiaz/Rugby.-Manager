# Rugby Manager V4 — neuf matchs de **Top 14** pour spécifier les 30 agents

**Date : 8 novembre 2026.** Complément aux études internationales `11_MATCHS_REELS_ET_PRISES_DE_DECISION.md` et `12_STYLES_ANGLETERRE_AFRIQUE_DU_SUD_NOUVELLE_ZELANDE.md`.

> Le Top 14 ne doit PAS être modélisé comme « rugby français = jeu au large ». Il comporte des packs qui dominent, des choix au pied, des lancements depuis touche, des mêlées rejouées, des changements de stratégie à dix mètres de l'en-but, une gestion du score, de la fatigue et de l'arbitrage, et des comportements radicalement différents d'une rencontre à l'autre.

**Corpus traçable :** `fixtures/observations_top14_2025_2026.json` : **9 rencontres**, **19 observations** (actions ou événements/scénarios chiffrés), **6 feuilles statistiques LNR**. Les sources sont liées **à chaque observation**. Les appellations `TOP14-01..19` désignent des **tests moteur à construire**, pas des tests déjà verts.

## 1. Méthode : vérifier ce qu'un match montre

- **Action observée** : la presse et la LNR donnent le match, les joueurs, le résultat, et parfois une séquence très précise. Il faut la citer sans inventer la stratégie d'origine.
- **Chiffre observé** : passes, touches, coups de pied, possession, pénalités et score sont des **statistiques de match**, jamais des mesures directes des priorités GOAP, ni des preuves qu'un joueur a « demandé une option » à un autre.
- **Inconnu** : positions x/y des 30 joueurs, trajectoires à chaque frame, dialogues entre 8 et 9 ou 9 et 10, appels, vitesse de sortie, cause du choix. Aucune de ces données n'est certifiée sans suivi vidéo annoté.
- **Hypothèse Rugby Manager** : construire les mécanismes locaux qui rendent une action possible et une alternative impossible si les circonstances changent. Un résultat historique n'est **jamais** codé en dur.
- **Chiffre manquant** : lorsqu'un export LNR affiche des **zéros incohérents** pour les mêlées/touches/passes/coups de pied d'une finale effectivement jouée, **ne pas interpréter zéro comme une vraie valeur**. Source écartée : [finale Toulouse–Montpellier, statistiques 2026](https://top14.lnr.fr/feuille-de-match/2025-2026/finale/11800-toulouse-montpellier/statistiques-du-match).

## 2. Match après match : ce que les joueurs font réellement

### A — Racing 92 47–27 Bayonne, 22 novembre 2025

**Sources :** [L'Équipe, direct horodaté](https://www.lequipe.fr/Rugby/match-direct/top-14/2025-2026/racing-92-bayonne-live/40474).

- **77e [OBSERVÉ] :** le troisième ligne centre **Nathan Hughes part d'une mêlée**, progresse fortement, puis **Jonny Hill marque** près des poteaux.
- **80+1e [OBSERVÉ] :** Racing obtient une pénalité de mêlée et **choisit une nouvelle mêlée à cinq mètres** pour tenter le bonus offensif.
- **[INCONNU] :** l'appel réellement prononcé par Hughes, son 9 et le 10 n'est pas retranscrit.

**Mécanique** : cette séquence est un véritable exemple Top 14 pour le **signal du 8 au 9** : le 9 peut envisager une distribution, mais le 8 qui part doit avertir le 9 juste avant de prendre le ballon (`SCRUM_8_GOING`) ; le 9 qui l'entend abandonne sa propre tentative de récupération si encore annulable. Le 8 ne peut pas donner un ballon qu'il n'a pas légalement ramassé. L'appel est une **convention de simulation**, pas une transcription du match.

**Alternative** : sans départ possible, le 9 préfère récupérer et jouer près/large ; le bonus et le choix « mêlée au lieu des points » varient selon temps, score et statut de la compétition.

### B — Toulouse 32–25 Bayonne, demi-finale 20 juin 2025

**Sources :** [L'Équipe, séquence de l'essai de Ntamack](https://www.lequipe.fr/Rugby/Actualites/En-video-le-bel-essai-de-romain-ntamack-qui-a-lance-le-stade-toulousain-face-a-bayonne-en-demi-finales-de-top-14/1571774) ; [LNR, chronologie du match](https://top14.lnr.fr/feuille-de-match/2024-2025/demi-finale/11054-toulouse-bayonne).

- **13e [OBSERVÉ] :** à partir d'une **touche toulousaine**, Flament trouve **Brennan** qui perce et donne par-dessus la tête à **Ntamack**, marqueur.
- **32e [OBSERVÉ] :** le demi de mêlée **Paul Graou inscrit un essai**, mais le compte rendu de score **ne démontre pas** qu'il y a eu une sortie de mêlée ou un type particulier de passe.

**Mécanique** : **une touche n'est pas systématiquement un maul**. Les avants peuvent recevoir dans l'intervalle et servir le 10, avec course et passe physiquement vraies. Le 9 peut également conclure une attaque selon la place qu'il trouve ; ne pas inventer un ruck ou une prise de mêlée pour expliquer un essai dont la construction est inconnue.

### C — Toulouse 39–33 Bordeaux-Bègles après prolongation, finale 28 juin 2025

**Sources :** [LNR, événements](https://top14.lnr.fr/feuille-de-match/2024-2025/finale/11056-toulouse-bordeaux-begles) ; [LNR, feuille statistique complète](https://top14.lnr.fr/feuille-de-match/2024-2025/finale/11056-toulouse-bordeaux-begles/statistiques-du-match).

- **80e [OBSERVÉ] :** **Maxime Lucu** égalise **33–33 sur pénalité** ; prolongation.
- **96e et 100e [OBSERVÉ] :** **Thomas Ramos** réussit deux pénalités pour Toulouse et conclut 39–33.
- **Statistique LNR :** même nombre d'essais (**3–3**) ; Toulouse **139 passes / 41 coups de pied**, UBB **152 passes / 38 coups de pied**. Pénalités concédées : **8 / 17**.

**Mécanique** : **le score final dépend de la discipline, des coups de pied au but et du contexte**, pas uniquement du nombre d'essais. Les joueurs connaissent le score/temps ; le manager a fixé les préférences de risque, mais chaque agent choisit sa manière de jouer. Prévoir match nul à 80e et prolongation si le règlement de la phase le demande. Gestion de pression, fatigue et lucidité individuelle.

### D — Toulouse 28–20 Montpellier, finale 27 juin 2026

**Source :** [LNR, film du match minute par minute](https://top14.lnr.fr/actualite/finale-top-14-le-stade-toulousain-est-champion-de-france-pour-la-quatrieme-fois-de-suite).

- **7e [OBSERVÉ] :** **touche puis une-deux entre Antoine Dupont et Peato Mauvaka**, essai du talonneur.
- **34e [OBSERVÉ] :** **mêlée à cinq mètres**, un **coup franc rapidement joué**, puis quelques temps de jeu ; deuxième essai de Mauvaka. **Ne pas résumer « mêlée = essai »**.
- **42e [OBSERVÉ] :** **Domingo Miotti** joue un **petit coup de pied par-dessus** ; **Justo Piccardo** marque après récupération.
- **53e [OBSERVÉ] :** la domination toulousaine en mêlée conduit à une pénalité transformée par Ntamack.
- **60e [OBSERVÉ] :** après un **orage et une interruption**, reprise par une mêlée à cinq mètres avec introduction Dupont.

**Mécanique** : un n°9 peut faire un **une-deux avec le talonneur** et ce dernier peut être finisseur ; une mêlée peut conduire à un coup franc et une attaque rapide ; le 10 peut botter derrière une défense. Il faut distinguer **arbitrage, chronomètre, possession et mouvements physiques**. La pause météo arrête l'écoulement du jeu simulé et ne supprime pas les états de remise en jeu.

**Attention critique à la qualité des données** : [l'onglet « statistiques »](https://top14.lnr.fr/feuille-de-match/2025-2026/finale/11800-toulouse-montpellier/statistiques-du-match) affiche des **zéros** pour mêlées, touches, passes, plaquages, coups de pied. Ils sont manifestement **manquants**, pas des actions inexistantes ! Ne jamais les mettre dans une distribution ou un objectif de calibration.

### E — Toulon 27–22 Bordeaux-Bègles, 31 mai 2026

**Source :** [LNR, statistiques J25](https://top14.lnr.fr/feuille-de-match/2025-2026/j25/11477-toulon-bordeaux-begles/statistiques-du-match).

| Indicateur | Toulon | UBB |
|---|---:|---:|
| Passes | **212** | 112 |
| Coups de pied en jeu | 18 | **37** |
| Touches obtenues | **21** | 5 |
| Touches gagnées sur son lancer | 16 | 5 |
| Pénalités concédées | 4 | 12 |

**Lecture** : dans **ce match précis**, Toulon a davantage passé le ballon et l'UBB a davantage botté. **Interdiction d'en déduire « Toulon joue toujours large, l'UBB toujours au pied ».** L'adversaire, le score et le contexte produisent ces variations. Le nombre de touches gagnées sur son lancer doit être rattaché au lanceur, sauteur, soutien, trajectoire et opposition, pas à un pourcentage de réussite imposé par la nationalité du club.

### F — Toulon 27–51 Toulouse, 9 mai 2026

**Source :** [LNR, statistiques J23](https://top14.lnr.fr/feuille-de-match/2025-2026/j23/11465-toulon-toulouse/statistiques-du-match).

- **Statistique LNR :** 110 passes Toulon / **211 passes Toulouse**, 3 essais Toulon / **6 essais Toulouse**, 21 coups de pied Toulon / 29 Toulouse.
- **Mécanique** : attaques de plusieurs phases possibles avec davantage de courses de soutien et de passes lorsque la défense le permet. Cependant, un joueur ne doit pas passer seulement parce que le preset « Toulouse » augmente le poids de `PASS`. Une ligne fermée doit pouvoir mener à `CARRY`, `KICK` ou `PROTECT_BALL`.

### G — Racing 92 24–26 La Rochelle, 10 mai 2026

**Sources :** [Rugbyrama, commentaires de match](https://www.rugbyrama.fr/resultats/rugby/top-14/phase-reguliere/rencontre/55769/racing-92-la-rochelle/direct) ; [Rugbyrama, analyse du troisième ligne Oscar Jegou](https://www.rugbyrama.fr/2026/05/10/top-14-les-notes-de-racing-92-la-rochelle-demba-bamba-consternant-oscar-jegou-determinant-13364958.php) ; [LNR, statistiques J23](https://top14.lnr.fr/feuille-de-match/2025-2026/j23/11464-racing-92-la-rochelle/statistiques-du-match).

- **Vers 16e [OBSERVÉ] :** **Oscar Jegou** intervient dans la construction du premier essai rochelais et **sert le n°9 Nolann Le Garrec**, qui marque. C'est un **troisième ligne passeur vers le 9**, et pas le 9 passeur par défaut.
- **80+1e [OBSERVÉ] :** **Racing rate le drop-goal** qui aurait pu lui donner la victoire.
- **Statistique LNR :** Racing **107 passes**, La Rochelle **206** ; 24 touches obtenues Racing contre 14 pour La Rochelle.

**Mécanique** : le 9 est aussi un **receveur offensif qui choisit son angle**, l'avant a le droit d'être passeur et un drop peut manquer. Ne pas coder « 9 = uniquement distributeur au ruck ». Le temps restant et l'écart de score influencent le choix `DROP_GOAL` mais ne forcent ni la tentative ni la réussite.

### H — Toulon 20–21 La Rochelle, 12 septembre 2026

**Source :** [LNR, statistiques J2 saison 2026/27](https://top14.lnr.fr/feuille-de-match/2026-2027/j2/11831-toulon-la-rochelle/statistiques-du-match).

- **Statistique LNR :** Toulon marque **3 essais** contre **2** rochelais, mais perd **20–21**. Pénalités réussies **1** (Toulon) / **3** (La Rochelle). Passe **132 / 112**, coups de pied de jeu courant **11 / 17**.
- **Mécanique** : meilleur compteur d'essais ≠ victoire ; buts de discipline, occupation, pression et tirs au but doivent être utiles. Un 9 peut accepter une sortie prudente malgré l'attaque disponible si l'équipe mène et que les risques augmentent.

### I — Pau 34–14 Toulouse, 1er novembre 2026

**Sources :** [LNR, compte rendu J8](https://top14.lnr.fr/actualite/j8-de-top-14-la-section-paloise-surpasse-clairement-le-stade-toulousain-34-14) ; [LNR, statistiques J8](https://top14.lnr.fr/feuille-de-match/2026-2027/j8/11874-pau-toulouse/statistiques-du-match).

- **7e et 58e [OBSERVÉ] :** le **n°8 palois Facundo Isa** marque deux essais. **Pas de preuve** que l'un ou l'autre provient d'une mêlée : ne pas attribuer `SCRUM_8_PICK` à ces actions sans visionnage annoté.
- **Statistique LNR :** Pau possède **46 %**, Toulouse **54 %**, mais Pau marque **4 essais** contre 2 et gagne 34–14. Les passes sont **107 Pau / 126 Toulouse** ; 27 coups de pied Pau / 28 Toulouse.
- **Mécanique** : maîtrise d'une possession ne suffit pas. Défense, plaquages et contre-attaques doivent influencer la probabilité de conserver et convertir une possession. Le plan individuel d'un 8 doit permettre de porter, soutenir et marquer **depuis plusieurs phases**, pas seulement depuis la mêlée.

**Instantané de style LNR avant J8 2026/27 :** [analyse officielle Pau–Toulouse](https://top14.lnr.fr/actualite/analyse-davant-match-section-paloise-stade-toulousain-les-statistiques-a-connaitre) : Pau et Toulouse effectuaient environ la moitié de leurs lancers **en début d'alignement** (50,5 % et 50 %). Toulouse avait marqué **22 essais à partir d'une touche** dans cet instantané de début de saison. Taux de conservation sur coup de pied : **Pau 22 %, Toulouse 18 %**. Ces chiffres sont **datés, partiels et dépendants de la définition Opta/LNR**, pas des probabilités de réussite à coder en dur.

## 3. Spécifications supplémentaires : décisions des joueurs issues du Top 14

### Mêlée : le 8 et le 9 ne peuvent pas prendre le même ballon

- Le 9 peut demander un jeu au large/au près/avancer au 10 et discuter le départ avec le 8 ; **le 9 choisit la stratégie**.
- Juste avant de partir, le **8 doit prévenir le 9**, `SCRUM_8_GOING`, si possible audible.
- Le **9** qui l'entend replanifie seul : `SUPPORT_8`, `BE_PASS_OPTION`, `COVER_BLIND_SIDE` au lieu de ramasser aussi.
- S'il **n'entend pas**, une erreur de coordination existe, mais la physique garantit un **seul vrai possesseur** ; aucun message ne donne la balle par magie.
- Dès qu'une pénalité de mêlée est accordée, un joueur autorisé compare **tir, touche, mêlée à refaire**, coup franc ou autre reprise **selon les lois applicables**. L'arbitre, et non la tactique, décide du type de remise en jeu.

### Touche : maul, lancement de première main, une-deux 9–talonneur

Pour le même point de lancer et la même tactique, comparer :
1. talonneur → sauteur → maul, si les liaisons se forment réellement ;
2. talonneur → sauteur → avant qui perce → 10/13 en soutien ;
3. talonneur → sauteur → 9 → talonneur (une-deux) → progression ;
4. interception de touche adverse, contest du sauteur, lancer perdu ;
5. lancer rapide **si conditions légales** ; aucune magie.

**Le dialogue stratégique 9–10 est un choix du jeu, PAS une parole historique attestée** dans les rapports. Les sauteurs, leurres et soutiens choisissent leurs courses eux-mêmes.

### Jeu courant : près, large, pied et arbitrage tardif

Les chiffres de Toulon–UBB et Toulon–Toulouse prouvent qu'il existe **une forte variabilité par match**. Pour chaque agent, représenter les candidats de but et leurs coûts :
- `KEEP_POSSESSION` et `SUPPORT_NEXT_PHASE` (multi-pass possible) ;
- `WIN_GAINLINE`, `OFFLOAD`, `PICK_AND_GO` (combat de près) ;
- `KICK_IN_BEHIND`, `HIGH_KICK` (pied lié à espace/pression ; annonce du 9 avant sa chandelle) ;
- `DEFEND`, `CLOSE_GAP`, `HOLD_LINE`, `COVER_BACKFIELD` (priorités après perte) ;
- `CHOOSE_PENALTY_OPTION`, `DROP_GOAL` (score et temps) ;
- `PAUSE_AND_RESTART` lors d'événements d'arbitrage/météo (moteur, pas IA d'équipe).

Chaque joueur **connaît son plan de jeu** et ses références de placement, mais sa course et son action sont décidées **individuellement**. Aucune table `ClubName -> Script` ; les presets sont interchangeables entre clubs et compétitions.

## 4. Benchmark : ne pas comparer les 2026 statistiques manquantes à 2025

La tâche de calibration doit traiter `stats` comme une table **typée et sourcée**, pas recopier un nombre sans contexte :

```ts
type MatchMetric = {
  competition: 'TOP14';
  season: string;                 // 2024-2025, 2025-2026, 2026-2027
  matchId: string;
  homeValue: number | null;       // null = PAS DE DONNÉE
  awayValue: number | null;
  sourceUrl: string;
  sourceStatus: 'LNR_RECORDED' | 'MISSING_OR_INCONSISTENT';
};
```

**Mesurer deux familles d'indicateurs séparées :**

- **Agrégats match** : nombre de passes, touches, mêlées, rucks, coups de pied, pénalités, essais, cartons, points, temps effectif. Vérifier les définitions LNR/Opta. Une victoire 21–20 avec moins d'essais est normale.
- **Décisions conditionnelles** : `P(8 part | ballon sorti au fond de mêlée, petit côté disponible)`, `P(9 replanifie | 8 dit 'j'y vais' et 9 a entendu)`, `P(large | 10 libre)`, `P(maul | touche gagnée et soutien disponible)`, `P(pied | défense monte)`, `P(conserver | avance insuffisante)`, `P(tir | temps/score/position)`. **Aucune de ces probabilités ne peut être calculée à partir des seules neuf feuilles de match.** Elles nécessitent vidéo annotée ou traces internes du moteur.

Tester 30 graines en PR, 100 graines à l'intégration, 500 en campagne longue, par tactique et phase : relever moyenne, médiane, écarts et distribution, et comparer les deux modes `LEGACY` et `GOAP`. Ne pas calibrer le moteur pour reproduire exactement 39–33 ou 28–20.

## 5. Dix-neuf assertions moteur à créer dans Claude Code

| ID | Scène fondée sur une observation | Alternative contrôlée à tester |
|---|---|---|
| `TOP14-01` | Racing, départ de Hughes derrière mêlée | 8 annonce et peut prendre / 8 n'a pas le ballon ; 9 réagit, un seul porteur |
| `TOP14-02` | Racing, rejoue une mêlée sur pénalité | score/temps différent : tir ou mêlée ; conditions légales |
| `TOP14-03` | Toulouse, touche puis Brennan→Ntamack | défenseur ferme soutien : avant peut conserver ou passer autrement |
| `TOP14-04` | Paul Graou marque | 9 trouve espace ou se fait refermer : essai non automatique |
| `TOP14-05` | Lucu égalise à 80e | profil de match éliminatoire avec prolongation vs championnat |
| `TOP14-06` | Ramos 96e/100e | tir et pression, pénalité physique non garantie |
| `TOP14-07` | Dupont↔Mauvaka après touche | talonneur disponible/pas disponible : combinaison change |
| `TOP14-08` | mêlée 5m puis coup franc rapide | reprise réglementaire vs perte de ballon ou faute |
| `TOP14-09` | Miotti→Piccardo petit pied | espace derrière défense fermé : alternative de passe/course |
| `TOP14-10` | Toulouse pénalité de mêlée à 53e | force et liaisons différentes : pénalité non automatique |
| `TOP14-11` | orage puis reprise mêlée | horloge/état sauvegardés, pas de déplacement pendant interruption |
| `TOP14-12` | Toulon–UBB 212/112 passes, 18/37 pieds | mêmes agents, changer tactique et défense : distribution de choix varie |
| `TOP14-13` | Toulon–Toulouse 110/211 passes | soutien proche vs trop loin : pas de passes téléportées |
| `TOP14-14` | Jegou sert Le Garrec | 9 receveur disponible/bloqué, passe réelle de l'avant |
| `TOP14-15` | Racing manque drop de la victoire | tir dans les règles, réussite non garantie et pression croissante |
| `TOP14-16` | Toulon marque davantage d'essais mais perd à La Rochelle | même nombre d'essais avec pénalités et transformations différentes |
| `TOP14-17` | Isa marque deux fois | aucune conversion automatique des essais d'un n°8 en départ de mêlée |
| `TOP14-18` | Pau bat Toulouse avec moins de possession | gains/turnovers/points conditionnés, non proportionnels mécaniquement à possession |
| `TOP14-19` | finale 2026 page LNR montre zéros de statistiques | zéros incohérents = `null` exclu de calibration ; score/essais du compte rendu conservés |

Les assertions de **moteur** `TOP14-01..19` restent **à programmer**. Le test `node server/test-v4-top14-data.js` valide **uniquement** l'intégrité du corpus documentaire, les champs de la feuille LNR et l'exclusion des statistiques manifestement manquantes.

## 6. Ordre de travail

- **RM4-G39** — enrichir le corpus Top 14, contrôler les 9 liens et 19 événements, produire l'injecteur de scènes et l'export typé pour le benchmark. **Commencer tout de suite par la validation documentaire**, sans prétendre que les 30 agents utilisent déjà les matchs.
- **RM4-G40** — intégrer `TOP14-01..19` au moteur par étapes après `G02–G11`, `G19–G20`, `G31–G37`, avec replay/physique réelle et un ballon unique.
- **RM4-G41** — comparer les 6 jeux de statistiques LNR valides, styles club interchangeables, cas de données manquantes et décisions conditionnelles dans 30/100/500 matchs. Refuser tout calibrage d'après les fausses valeurs zéro du match final 2026.

**Critère final :** 30 joueurs autonomes capables de produire plusieurs sorties de mêlée, plusieurs lancements de touche, plusieurs attaques de jeu courant et des stratégies de fin de match différentes, à partir d'un même plan de jeu connu de tous et des circonstances réellement observées. **Pas d'IA collective, pas de déplacements programmés par club, pas de statistiques historiques inventées.**
