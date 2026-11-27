# 17 — Troisièmes lignes (6, 7, 8) : agents autonomes reconnaissables

> **Statut : spécification du propriétaire (27 novembre 2026), découpée en tâches RM4-G53 à G62 ; G53 codé.**
> Objectif final : qu'un connaisseur reconnaisse un 6, un 7 et un 8 **à leurs déplacements et à leurs décisions**, sans voir
> les maillots — sans IA collective, sans quotas statistiques.

## 1. Comment cette demande s'accorde avec la règle permanente de CLAUDE.md

La spécification décrit les « objectifs principaux » du 6, du 7 et du 8. **Ils ne sont pas codés comme des comportements par
numéro** (`switch (numero)`, table « poste → cible », rôle imposé) : ce serait interdit (CLAUDE.md, « RIEN N'EST SCRIPTÉ »,
points 1 à 3 ; décision du 15 novembre : « l'aptitude se CALCULE »). Ils sont obtenus par trois leviers seulement :

1. **Les caractéristiques individuelles** (doc 15) : un 7 conteste au sol parce que son `grattage` est élevé, arrive le
   premier parce que son `arriveeRuck` l'est, soutient la percée parce que sa `courseSoutien` l'est. Un joueur généré reçoit
   des valeurs **par défaut** selon le poste où il a été formé (des DONNÉES, comme ses autres caractéristiques) ; un joueur
   réel du Mode Club a les siennes. Un pilier gratteur grattera ; un 7 lent n'arrivera pas le premier.
2. **Les préférences de poste pondérées** (`profilePour`, déjà existantes, jamais exclusives) : point de départ, que les
   aptitudes et la personnalité déforment.
3. **La perception** : ce que le joueur VOIT (ruck tenu ou menacé, attaquants sur le ballon, partenaires plus près, point de
   chute lu) et ce qu'il ENTEND (appels locaux, doc 08).

Le résultat d'un geste (grattage réussi, plaquage, passe) est **toujours tiré par le moteur** selon les lois et les
caractéristiques (point 4). Les coefficients sont des hypothèses à calibrer par tendances (point 5).

## 2. Constat de départ (mesure, 24 matchs GOAP de 20 min, 27 novembre 2026)

| N° | Présence au ruck (attaque) | Plaquages / 20 min | But « contester » choisi | But « sécuriser » choisi |
|---|---|---|---|---|
| 4 | 18 % | 3,2 | 0 % | 8,4 % |
| 6 | 17 % | 2,3 | 0,4 % | 7,7 % |
| 7 | 18 % | 3,3 | 1,3 % | 7,4 % |
| 8 | 15 % | 2,9 | 0,3 % | 7,4 % |

Les 6, 7 et 8 ne se distinguent ni entre eux ni des deuxièmes lignes ; la contestation au sol n'existe presque pas ; aucune
décision de regroupement ne lit les caractéristiques. Script de mesure : instrumentation externe (distance parcourue, distance
au ballon, présence au ruck à 2,2 m, part du temps par but, statistiques individuelles du moteur).

## 3. Tâches (une par session, preuve sur scénario d'abord)

| Tâche | Contenu | Scénarios de la spec | Statut |
|---|---|---|---|
| **G53** | Jeu au sol par aptitudes : `grattage`, `arriveeRuck`, `courseSoutien` (moteur + `aptitudes.js`) ; ruck déjà tenu → on reste disponible ; contestation seulement avant que le ballon soit jouable, abandonnée si trop risquée ; réussite du grattage selon le gratteur (moteur) | 2, 3, 13, 14 (partiel) | **FAIT** |
| G54 | Défense autour du ruck : menaces (départ du 9, pick and go, petit côté) lues par chacun ; « si un partenaire tient déjà cette zone, j'en prends une autre » (appels « je prends le petit côté », « je couvre l'intérieur ») | 4, 11, 15 | à faire |
| G55 | Courses de soutien vers une position FUTURE probable (anticipation du prochain point de contact, pas la position actuelle du porteur) ; `courseSoutien`, `lectureJeu` | 1, 8, 12 | à faire |
| G56 | Porteur avant : percuter, attaquer l'intervalle, fixer-passer, passe après contact, rester debout ; `percussion` (doc 15) ; un joueur puissant ne percute pas systématiquement | — | à faire |
| G57 | Mêlée : 6 et 7 restent liés jusqu'à la fin (loi 19) ; sortie : options du 8 (laisser au 9, partir fermé/ouvert, fixer-passer) déjà annoncées (`SCRUM_8_GOING`, doc 12) ; rôle des flankers en sortie choisi par chacun | 5, 6 | partiellement existant (G37) |
| G58 | Touche et maul : sauteur, lifteur, leurre, constructeur du maul selon la combinaison annoncée et ses caractéristiques (`detente`, `tl_sautFond`) | — | à faire |
| G59 | Transitions : perte de balle → réévaluation immédiate (abandon de l'action offensive) ; récupération → contre-attaque | 9 | à faire |
| G60 | Fatigue : vitesse de replacement, précision, qualité de décision, répétition des efforts | 10 | à faire |
| G61 | Instrumentation des décisions par joueur (but, intention, action, alternatives et scores, cible, menaces, appels reçus, raison de changement) exposée à l'interface | — | à faire |
| G62 | Validation : matrice de comportements 6/7/8 sur 30 graines (déplacements, plaquages, soutiens, rucks, récupérations), comparée aux repères réels sourcés (docs 11-14) sans quota | 7, 14 | à faire |

## 4. G53 — ce qui est codé

- **Moteur** (`engine/rugby-engine.js`) : caractéristiques `grattage`, `arriveeRuck`, `courseSoutien`, qui appartiennent au
  **joueur, jamais au maillot** :
  - valeur explicite (`caracteristiques`) : prioritaire ;
  - joueur venu avec ses propres attributs (Mode Club, remplaçant) : **dérivées de ses attributs** (plaquage, puissance,
    décision, vitesse, endurance) — un deuxième ligne aligné en 7 garde son grattage de deuxième ligne ;
  - joueur généré (match rapide) : données de son profil de formation, fournies explicitement par `DEFAULT_CONFIG.joueurs`
    (table `DEFAUTS_JEU_AU_SOL`, comme ses 12 attributs viennent de `PROFILS`).
  En GOAP, la probabilité de grattage au ruck est multipliée par 0,6 à 1,4 selon le grattage du meilleur défenseur au ballon
  **parmi ceux que le moteur retient comme contestataires** (souvent le plaqueur ; référence 50 = joueur moyen). Première
  version centrée sur 60 : l'arbitre a mesuré une baisse générale des turnovers (16 → 11 par tranche de 40 min, 6 graines),
  recentrée sur 50. Après recentrage, sur 6 graines × 40 min : 107 turnovers avant le patch, 99 après (écart non
  significatif) ; la part des 6, 7 et 8 passe de 20 % à 30 % (le 7 : 6 → 14) — c'est QUI gratte qui change, pas combien.
  Deux références distinctes, à dessein : 60 pour l'ENVIE de contester (aptitudes.js), 50 pour la RÉUSSITE du geste (moteur).
  LEGACY inchangé.
- **Agents** :
  - `engine/ai/aptitudes.js` (nouveau, ne lit jamais le numéro) : déforme `contest` (× 1 ± 0,6), `ruck` (× 1 ± 0,4) et
    ajoute `soutien` (× 1 ± 0,5) selon les caractéristiques ; 60 ou absent = inchangé.
  - `goals.js` : `CONTEST_BREAKDOWN` pénalisé de 14 par attaquant vu autour du ballon au-delà du premier et **non
    contrebalancé** par un partenaire engagé, abandonné à partir de trois (seul face à quatre déblayeurs, on renonce) ; le
    contre-ruck reste possible ballon disponible (loi 15 : légal en poussant ; le moteur tranche) ;
    `SECURE_RUCK` × 0,15 quand le joueur voit le ruck déjà tenu (partenaires engagés ≥ défenseurs + 2) ;
    `SUPPORT_CARRIER` × `soutien`.
  - `agent-context.js` : les croyances transmettent `attackersCommitted` du ruck (joueurs à moins de 8 m du point de ruck,
    pas seulement ceux liés sur le ballon : approximation).
- **Tests** : `server/test-v4-troisiemes-lignes.js` (aptitudes neutres, caractéristiques présentes et explicites, valeurs
  attachées au joueur et non au maillot, scénarios 2, 3, 13, garde « rien n'est scripté » : un 4 gratteur a plus envie de
  contester qu'un 7 maladroit, module sans numéro ; tendance moteur : des gratteurs à 90 gagnent plus de turnovers que des
  gratteurs à 10).
- **Limites connues** : `ballAvailable` est un chronomètre (1,2 s), pas la formation du ruck au sens de la loi 15.2 ; le
  grattage n'est lu que chez les contestataires retenus par le moteur (désignation préexistante, à remplacer par le choix
  des agents dans une tâche suivante).

**À surveiller (hors G53)** : avec ou sans ce patch, le mode GOAP produit environ 17 turnovers par 40 min (~35 par
match), au-dessus du repère de 12 à 18 par match ; à traiter dans la validation G62, sans quota.

## 5. Ce qui reste hors de portée de G53

Les sections 4 (attaque), 6 (défense), 7 (mêlée), 8 (touche), 9 (maul), 10 (coups de pied), 11 (sans ballon), 12
(communication) et 14 (profils et fatigue) de la demande sont réparties en G54 à G62. Les profils « gratteur, plaqueur,
percuteur… » ne seront **jamais des étiquettes de décision** : ce sont des noms **calculés** à partir des caractéristiques,
pour l'affichage (comme le caractère, doc 16).
