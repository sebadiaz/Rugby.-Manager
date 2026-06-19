# Spécification — Placement tactique des joueurs par phase de jeu

Ce document approfondit `docs/SPEC_JOUEUR.md` et `docs/SPEC_MOTEUR_MATCH.md` sur un point précis : **le placement d'un joueur sur le terrain n'est jamais aléatoire**. À tout instant du match, la position attendue de chacun des 30 joueurs découle de trois choses combinées :

1. la **phase de jeu** en cours (l'« action » : ruck, touche, jeu déployé, etc.) ;
2. la **stratégie** de l'équipe pour cette phase (formation d'attaque en pods, système défensif) ;
3. le **contexte/circonstances** du match (zone du terrain, côté du ballon, score, temps restant, infériorité numérique, fatigue).

L'objectif est de définir un modèle de placement suffisamment précis pour être directement traduit en positions (x, y) par poste, et qui remplacera à terme le calcul très simplifié actuel de `JoueurAgent::sePlacerOffensivement` / `seReplacerDefensivement` (voir section 9).

## 1. Le match comme suite de phases de jeu (« Actions »)

Un match n'est pas un flux continu indifférencié : c'est une succession de **phases de jeu**, chacune avec son propre patron de placement. C'est le même découpage que `MatchPhase` dans `docs/SPEC_MOTEUR_MATCH.md`, mais vu ici du point de vue du placement plutôt que des règles :

| Phase | Description | Qui a une formation à respecter |
|---|---|---|
| Coup d'envoi / renvoi | Coup de pied de départ ou des 22m | Les 2 équipes, formation figée par les règles |
| Mêlée | Regroupement statique à 8 contre 8 | Avants en formation fixe, arrières en formation d'attente |
| Touche | Alignement statique | Sauteurs + releveurs vs contre en touche, arrières en attente |
| Ruck (1ère phase, sortie de mêlée/touche) | Premier ruck après une phase statique | Pods pré-organisés (formation choisie avant le coup de pied/la mêlée) |
| Ruck (phase lointaine, jeu déployé) | Ruck après plusieurs passes/courses | Placement plus fluide, dépend de la dernière passe |
| Jeu déployé offensif | Ballon en main, pas de contact imminent | Formation d'attaque en pods + ligne arrière |
| Jeu déployé défensif | Adversaire en possession, pas de contact imminent | Système défensif (rideau/rush/ligne plate/cloche) |
| Contre-attaque | Récupération de ballon (turnover, interception, réception de coup de pied) | Formation d'attaque accélérée, lignes étirées |
| Sortie de camp / dégagement | Ballon dans son propre 22m | Formation resserrée, options de jeu au pied prioritaires |
| Touche défensive / regroupement après faute | Temps mort de jeu | Replacement complet selon le système choisi |

Chaque phase a une **formation par défaut** (section 8), modulée par le contexte (section 5).

## 2. Repères communs de placement

Tout calcul de position part des mêmes repères, cohérents avec le terrain défini dans `docs/SPEC_MOTEUR_MATCH.md` (x ∈ [0,100] en-but à en-but, y ∈ [0,70] touche à touche) :

- **Ligne d'avantage (gainline)** : ligne perpendiculaire à l'axe d'attaque, passant par la position actuelle du ballon (x du ballon). Les soutiens doivent rester derrière (hors-jeu sinon).
- **Canaux de profondeur**, mesurés depuis la ligne d'avantage vers son propre camp :
  - **Canal 0** : 0-1m — joueurs au contact direct (ruck/maul).
  - **Canal 1** : 1-5m — premier rideau de soutien (souvent des avants en pod).
  - **Canal 2** : 5-15m — zone du demi de mêlée, premier et deuxième receveurs.
  - **Canal 3** : 15-30m — jeu déployé, centres/ouvreur, ligne d'attaque large.
  - **Canal 4** : >30m — couverture arrière (ailiers/arrière), filet de sécurité.
- **Côté court / côté ouvert** : la touche la plus proche du point de ruck définit le « côté fermé » (blindside, peu d'espace) ; la touche la plus éloignée définit le « côté ouvert » (openside, large espace). La répartition des joueurs n'est jamais symétrique : elle suit la largeur disponible de chaque côté.
- **Zones de terrain** (section 5.1) : camp propre (0-22m), entre les 22m (22-78m), camp adverse (78-100m).

## 3. Stratégies d'attaque : formations en pods

Au rugby moderne, les avants ne se dispersent pas au hasard après un regroupement : ils se répartissent en **pods** (petits groupes de 2 à 4 avants) positionnés à intervalles réguliers sur la largeur du terrain, pour offrir au porteur de balle plusieurs options de passage à chaque ruck, tout en gardant des soutiens proches pour les rucks suivants.

Trois formations couvrent la majorité des cas (`Formation` côté modèle) :

### 3.1 Formation `Pods_1_3_3_1`

- **1 avant** au contact immédiat (canal 0-1), généralement le talonneur ou un 3e ligne — relais rapide pour un jeu très près du ruck.
- **2 pods de 3 avants**, un côté fermé et un côté ouvert, espacés d'environ 10-15m de la ligne du ruck (canal 1-2). Composition typique d'un pod : 1 pilier, 1 deuxième ligne, 1 troisième ligne — mélange de puissance (porter le contact) et de mobilité (rejoindre le pod suivant).
- **1 avant** isolé très large côté ouvert (canal 2-3), souvent un troisième ligne véloce — menace de débordement, oblige la défense à s'étirer.
- **Ligne arrière** (charnière + centres + ailiers + arrière) en canal 3, profondeur échelonnée (voir 3.4).

C'est la formation par défaut recommandée pour le jeu déployé en milieu de terrain : équilibre entre options proches (sécurité) et largeur (perçée).

### 3.2 Formation `Pods_2_4_2`

- **2 avants** au contact/canal 1 proche du ruck (sécurité accrue, utile en sortie de camp).
- **1 pod de 4 avants** concentré du côté où l'équipe veut jouer (souvent le côté ouvert) — option de jeu au près lourde.
- **2 avants** en soutien large de l'autre côté.
- Formation plus prudente que `Pods_1_3_3_1`, utilisée quand le contexte favorise un jeu au près (camp propre, fin de match avec avance au score — voir section 5.3).

### 3.3 Formation `Pods_3_4_1`

- **3 avants** très proches du ruck (canal 0-1) — domination physique immédiate, typique en camp adverse proche de la ligne d'en-but où l'espace latéral compte moins que la puissance de percussion.
- **1 pod de 4** réparti en soutien à 10-15m.
- **1 avant** isolé large.
- Formation utilisée près de la ligne d'en-but adverse (zone 90-100m) où l'objectif est de forcer le contact plutôt que de jouer large.

### 3.4 Ligne arrière en attaque (commun aux 3 formations)

Indépendamment de la formation des avants, la ligne arrière suit un patron stable :

- **Demi de mêlée (9)** : canal 1-2, toujours au plus près du ruck côté ouvert, premier relais.
- **Ouvreur (10)** : canal 2-3, profondeur ~5m derrière la ligne d'avantage, positionné pour recevoir du 9 et avoir le temps de lire la défense.
- **Centres (12, 13)** : canal 3, échelonnés en profondeur croissante vers l'extérieur (le 12 plus proche/profond, le 13 plus large) — ligne dite « en échelon arrière » qui permet la passe sans qu'un défenseur intercepte par l'avant.
- **Ailiers (11, 14)** : restent sur leur couloir (proche de leur touche respective), profondeur canal 3-4, sauf appel explicite vers l'intérieur.
- **Arrière (15)** : canal 4, position flottante centrale ou légèrement du côté du jeu, prêt à entrer en dernier rideau d'attaque (overlap) ou à couvrir un coup de pied de retour.

## 4. Stratégies de défense

### 4.1 Défense rideau (`Drift`)

Les défenseurs glissent latéralement en restant connectés les uns aux autres, sans avancer agressivement. Objectif : conserver une ligne sans trou, pousser l'attaque vers la touche (espace qui se réduit), au prix de laisser un peu de profondeur.

- Ligne défensive alignée à ~1-2m derrière la ligne d'avantage (pas de sprint en avant).
- Chaque défenseur surveille l'espace **extérieur** à son alignement direct, glisse vers l'extérieur dès que le ballon part plus large.
- Arrière (15) et ailier faible-côté restent profonds (canal 3-4) pour couvrir un coup de pied.

Utilisée par défaut en milieu de terrain et quand l'équipe défend avec un avantage au score (réduit le risque de faute en évitant les contacts agressifs en avant).

### 4.2 Défense en rush / blitz

Les défenseurs avancent vite et en ligne dès que le ballon est joué, pour annuler le temps de réaction de l'attaque et forcer une erreur ou un plaquage derrière la ligne d'avantage.

- Ligne défensive part de ~2m derrière la ligne d'avantage et avance agressivement (canal 0-1 au moment du contact).
- Très bon en milieu de terrain pour casser un jeu organisé, risqué près de sa propre ligne (un débordement devient un essai direct) — voir contraintes de zone en 5.1.
- Arrière (15) doit rester plus profond que la ligne pour compenser le risque de débordement (filet de sécurité).

### 4.3 Ligne plate (`LignePlate`)

Ligne défensive resserrée et très proche de la ligne d'avantage, peu de glissement latéral, utilisée près de sa propre ligne d'en-but (zone 0-10m) où il n'y a plus de place pour reculer.

- Tous les défenseurs canal 0-1, alignés au plus près du ballon.
- Aucune profondeur de couverture sauf l'arrière, qui reste légèrement en retrait pour couvrir un grattage/chandelle.

### 4.4 Cloche arrière / couverture profonde (`Cloche`)

Indépendant du système de ligne avant, ce patron concerne les 3 derniers défenseurs (ailiers + arrière) quand le risque de coup de pied adverse est élevé (ouvreur adverse en contexte de jeu au pied, ou simplement par défaut en début de possession adverse) :

- Arrière centré, profondeur canal 4.
- Les deux ailiers se replient en triangle avec l'arrière (un peu de profondeur, un peu de largeur chacun), pour qu'aucune zone du fond de terrain ne soit totalement découverte.

## 5. Circonstances qui modulent le placement

Les formations ci-dessus sont des **patrons de référence**, pas des positions figées : elles sont systématiquement ajustées par le contexte du match.

### 5.1 Zone du terrain

| Zone | Effet sur l'attaque | Effet sur la défense |
|---|---|---|
| Camp propre (0-22m) | Formation resserrée (`Pods_2_4_2`), priorité à la sécurité, options de dégagement au pied prêtes | `LignePlate`, pas de prise de risque, `Cloche` désactivée (pas besoin de couvrir un pied si l'adversaire est loin) |
| Milieu de terrain (22-78m) | `Pods_1_3_3_1` par défaut, jeu équilibré | `Drift` par défaut |
| Camp adverse proche en-but (90-100m) | `Pods_3_4_1`, jeu au près, formation arrière resserrée vers l'intérieur (peu d'intérêt à étirer si la ligne de touche est proche de l'en-but) | `LignePlate` côté défenseur (même logique, plus de place à perdre derrière) |

### 5.2 Côté du ballon par rapport à la touche

Quand le ruck a lieu près d'une touche, le côté fermé (peu d'espace) reçoit **moins** de joueurs offensifs (1 avant max, pas de pod complet — inutile d'investir des joueurs dans un espace qui n'existe pas), et le côté ouvert concentre l'essentiel des pods et toute la ligne arrière. Le système défensif en miroir compresse symétriquement son côté fermé et étoffe son côté ouvert.

### 5.3 Score et temps restant

- **En tête, dernier quart d'heure** : priorité au jeu au pied de territoire, formations resserrées (`Pods_2_4_2`), défense `Drift` pour éviter la faute évitable ; le `roleTactique` `Sentinelle` est favorisé dans le choix des soutiens (sécuriser plutôt que prendre des risques).
- **Mené, dernier quart d'heure** : largeur maximale (`Pods_1_3_3_1` voire formation étirée), ligne arrière plus plate (less depth, plus de largeur immédiate) pour maximiser les chances de franchissement, défense en `Rush` pour forcer la récupération du ballon.

### 5.4 Infériorité / supériorité numérique (carton)

Une équipe en supériorité numérique (adversaire à 14) élargit systématiquement sa formation d'attaque (pods plus espacés, ligne arrière plus large) pour exploiter le surnombre ; l'équipe en infériorité bascule en défense `LignePlate` resserrée quel que soit la zone, en acceptant de concéder de la largeur pour ne pas être percée au centre.

### 5.5 Fatigue cumulée de l'équipe

Plus la fatigue moyenne de l'équipe est élevée (moyenne de `etatMatch.fatigue` sur les 15 joueurs), plus :
- les pods d'attaque se resserrent (moins d'énergie pour courir rejoindre un pod éloigné) ;
- la ligne défensive devient plus `LignePlate`-like même en milieu de terrain (moins de glissement latéral, défense plus statique) ;
- le temps de replacement après un ruck augmente (modélisable comme un facteur multiplicatif sur la vitesse de replacement, ex. `vitesseReplacement *= (1 - fatigueMoyenneEquipe/200)`).

## 6. Modèle de calcul du placement

Pour un joueur donné, à un tick donné, la position de référence se calcule en trois couches :

```
positionReference(joueur, phase, contexte) =
      positionBase(poste, formationOuSysteme, canal, côtéOuvert/Fermé)
    + ajustementContexte(zone, scoreEtTemps, supérioritéNumérique, fatigueEquipe)
    + bruitIndividuel(creativite, decision, ligneDeCourse)
```

- **`positionBase`** : table de référence (section 7) donnant un décalage (Δx en profondeur, Δy en largeur) par rapport au point de ruck/ballon, pour chaque poste et chaque formation/système choisi.
- **`ajustementContexte`** : translation supplémentaire selon les règles de la section 5 (ex. resserrement de Δy en camp propre, avancée de Δx en `Rush`).
- **`bruitIndividuel`** : petite variation (quelques dizaines de centimètres à 1-2m) pondérée par `tactique.ligneDeCourse` et `mental.decision` du joueur — un joueur avec une meilleure lecture du jeu corrige plus finement sa position de référence vers l'espace réellement disponible (cf. `perception.espaceLibreDevant`), au lieu de suivre une position purement mécanique.

Ce calcul remplace, poste par poste, la destination simpliste utilisée aujourd'hui dans `seReplacerDefensivement`/`sePlacerOffensivement` (actuellement un simple alignement sur l'axe du ballon).

## 7. Exemple chiffré complet

Situation : ruck gagné en milieu de terrain, ballon à **(x=55, y=58)** — proche de la touche droite (côté fermé = droite, 70-58=12m d'espace ; côté ouvert = gauche, 58m d'espace). L'équipe en attaque joue vers x croissant. Formation choisie : `Pods_1_3_3_1`. Défense en face : `Drift`.

### 7.1 Attaque (15 positions, offsets par rapport au point de ruck)

| Poste (numéro) | Canal | Côté | Δx (profondeur) | Δy (largeur) | Position absolue (x, y) | Justification |
|---|---|---|---|---|---|---|
| Talonneur (2) | 0 | au ruck | -1 | 0 | (54, 58) | relais immédiat au contact |
| Pilier (1) | 1 | fermé (droite) | -3 | +4 | (52, 62) | seul avant côté fermé, pas de pod complet (peu d'espace) |
| Pilier (3) | 1-2 | ouvert (gauche), pod A | -4 | -10 | (51, 48) | pod de 3, 1ère unité |
| 2e ligne (4) | 1-2 | ouvert, pod A | -4 | -12 | (51, 46) | pod de 3, force au contact |
| 3e ligne (6) | 1-2 | ouvert, pod A | -4 | -8 | (51, 50) | pod de 3, mobilité |
| 2e ligne (5) | 2, pod B | ouvert | -5 | -22 | (50, 36) | 2e pod, plus large/plus loin |
| 3e ligne (7) | 2, pod B | ouvert | -5 | -24 | (50, 34) | 2e pod |
| 3e ligne (8) | 2, pod B | ouvert | -5 | -20 | (50, 38) | 2e pod, lien avec demi de mêlée |
| Demi de mêlée (9) | 1-2 | au ruck/ouvert | -2 | -6 | (53, 52) | relais principal, juste devant le 1er pod |
| Ouvreur (10) | 2-3 | ouvert | -7 | -16 | (48, 42) | profondeur de lecture, derrière les pods |
| Centre (12) | 3 | ouvert | -6 | -28 | (49, 30) | ligne arrière échelonnée |
| Centre (13) | 3 | ouvert | -5 | -34 | (50, 24) | plus large que le 12 |
| Ailier (11) (côté gauche du terrain) | 3-4 | sur sa touche | -4 | -50 | (51, 8) | reste sur son couloir, à 8m de la touche gauche |
| Ailier (14) (côté droit) | 3-4 | sur sa touche | -3 | +6 | (52, 64) | reste sur son couloir même côté fermé (présence minimale) |
| Arrière (15) | 4 | central/flottant | -10 | -18 | (45, 40) | profondeur de sécurité, légèrement côté ouvert |

### 7.2 Défense en face (système `Drift`)

| Poste adverse | Δx vs ligne d'avantage | Δy (miroir, glissement vers l'ouvert) | Position absolue (x, y) | Rôle |
|---|---|---|---|---|
| Talonneur | +1 | 0 | (56, 58) | premier rideau au ruck |
| Pilier | +2 | -4 | (57, 54) | couverture immédiate côté ouvert |
| Pilier | +2 | +5 | (57, 63) | seul défenseur côté fermé (suffisant, peu d'espace à couvrir) |
| 2e ligne x2, 3e ligne x2 | +2 à +3 | -10 à -26 (échelonnés) | (57-58, 32 à 48) | glissement en ligne, connectés, suivent le pod A puis B |
| 3e ligne (8) | +2 | -18 | (57, 40) | couverture du lien charnière |
| Demi de mêlée | +2 | -8 | (57, 50) | marque le 9 adverse |
| Ouvreur | +4 | -18 | (59, 40) | marque le 10, légèrement reculé (lecture) |
| Centres x2 | +3 | -28, -36 | (58, 30) / (58, 22) | ligne plate connectée, glissement prêt |
| Ailiers x2 | +3 | -52, +8 | (58, 6) / (58, 66) | tiennent leur touche |
| Arrière | +12 | -20 | (67, 38) | profondeur de couverture, anticipe un coup de pied |

Cette table illustre le principe : **chaque position se justifie** par le poste, le canal, le côté ouvert/fermé et le rôle dans le système choisi — rien n'est tiré au hasard. Une formation/système différent (ex. `Pods_3_4_1` en attaque ou `Rush` en défense) produit une table différente, calculée par les mêmes règles.

## 8. Catalogue phase → formation/système par défaut

| Phase | Formation d'attaque par défaut | Système défensif par défaut |
|---|---|---|
| Coup d'envoi / renvoi | `Pods_2_4_2` (regroupement prudent au coup d'envoi) | `Cloche` (réception du coup de pied) |
| Mêlée | n/a (formation imposée par les règles) | `LignePlate` au sortir |
| Touche | n/a (formation imposée par les règles) | `Drift` au sortir, sauf zone 0-22m → `LignePlate` |
| Ruck 1ère phase | `Pods_2_4_2` | `Drift` |
| Ruck phase lointaine | `Pods_1_3_3_1` | `Drift`, ou `Rush` si contexte 5.3/5.4 le justifie |
| Jeu déployé offensif | selon zone (5.1) | — |
| Jeu déployé défensif | — | selon zone/score/carton (5.1, 5.3, 5.4) |
| Contre-attaque | formation étirée (variante large de `Pods_1_3_3_1`, pods espacés au maximum) | l'adversaire bascule en `Cloche` de transition |
| Sortie de camp | `Pods_2_4_2` | `LignePlate` |

## 9. Lien avec le code existant et prochaine étape d'implémentation

Le modèle actuel (`engine/ai/JoueurAgent.cpp`) calcule `sePlacerOffensivement`/`seReplacerDefensivement` par un simple décalage le long de l'axe d'attaque, sans notion de formation, de canal ou de contexte — une approximation volontaire du MVP (jalon 2 de `docs/SPEC_MOTEUR_MATCH.md`).

Ce document définit le **jalon suivant** :

1. Ajouter au modèle : `enum class Formation` (`Pods_1_3_3_1`, `Pods_2_4_2`, `Pods_3_4_1`), `enum class SystemeDefensif` (`Drift`, `Rush`, `LignePlate`, `Cloche`), et un `ContextePlacement` (zone, score, temps restant, écart de joueurs, fatigue moyenne d'équipe).
2. Ajouter une table de référence par poste/canal/côté comme en section 7, sous forme de données (pas de logique), pour rester facile à rééquilibrer.
3. Une fonction `calculerPositionReference(poste, numero, formationOuSysteme, canal, côté, contexte)` qui implémente la formule de la section 6, appelée par `JoueurAgent` à la place du calcul actuel.
4. Le choix de la formation/système lui-même (quelle formation l'équipe utilise à cet instant) reviendra à un objet `Tactique d'équipe` au niveau du `MatchSimulator` (hors scope de `JoueurAgent`, qui ne fait qu'exécuter la position qu'on lui donne).
