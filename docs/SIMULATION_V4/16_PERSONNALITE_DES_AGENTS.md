# 16 — Personnalité des agents (cahier des charges, à coder par petites tâches)

> **Statut : spécification ; codé : G45 (fonctions pures), G46 (porteur : altruisme, égoïsme, risque), G47 partiel (sang-froid), G52 partiel (valeurs initiales au hasard).** Demande du propriétaire (novembre 2026) : donner aux agents
> des **personnalités qui influencent leur prise de décision**.
>
> **RÈGLE PERMANENTE — RIEN N'EST SCRIPTÉ.** Une personnalité n'est ni un scénario, ni un rôle, ni une table de
> comportements imposés. C'est un **réglage individuel de la façon de décider** (goût du risque, tendance à passer ou à
> garder, intensité, constance…), lu par l'agent dans SES caractéristiques. Voir la règle et sa liste de contrôle en tête de
> `CLAUDE.md`. Document lié : [`15_CARACTERISTIQUES_INDIVIDUELLES.md`](15_CARACTERISTIQUES_INDIVIDUELLES.md) §3.18 et §3.20
> (les traits ci-dessous y sont déjà listés « à créer »).

## 1. Principe

1. **La personnalité est faite de caractéristiques**, pas d'un système parallèle : les traits du §3.18 (décision, prise de
   risque, altruisme, égoïsme) et du §3.20 (agressivité, courage, sang-froid, concentration, confiance en soi, résilience,
   régularité, esprit d'équipe, leadership). Catalogue **ouvert** : on en ajoute, on n'en retire jamais.
2. **Personnalité ≠ compétence.** La compétence dit ce que le joueur sait faire (passe longue, drop, chistera) ; la
   personnalité dit ce qu'il **choisit** de tenter parmi ce qu'il sait faire. Un joueur audacieux aux mains faibles tente
   plus de gestes osés **et en rate plus** : le moteur résout le geste selon les compétences, jamais selon la personnalité.
3. **Un joueur lit sa propre personnalité** dans ses croyances (`beliefs.self.car`, déjà exposé par `AgentContext`). Aucun
   module central ne lui désigne un rôle. Pas d'étiquette (« tête brûlée », « meneur ») dans le code de décision : une
   étiquette éventuelle ne sert qu'à l'affichage Club et est **calculée** à partir des valeurs.
4. **Valeur neutre = comportement actuel.** Un trait à 50 n'a aucun effet (multiplicateur 1, décalage 0). Une équipe
   « neutre » doit rejouer **exactement** les mêmes matchs qu'aujourd'hui (test PERS-01) : filet de sécurité contre toute
   régression et contre la tentation d'un coup de pouce statistique.
5. **Les effets sont des décalages bornés** sur des choix que le joueur fait déjà. Aucun choix n'est ajouté, aucun n'est
   interdit : un joueur prudent peut quand même tenter la passe osée si la situation la rend très payante.

## 2. Traits et ce qu'ils changent dans la prise de décision

Échelle 0-100, 50 = neutre. Les points d'accroche sont des endroits **qui existent déjà** dans le code.

| Trait | Ce que l'agent fait différemment | Point d'accroche existant |
|---|---|---|
| `priseDeRisque` | seuil d'acceptation des gestes osés : chistera, passe au pied, petit pied, passe longue, offload, course dans l'intervalle | `lirePorteur` / `optionsDePasse` / `lireChistera` (`engine/ai/open-play.js`, seuils `course + 6` etc.) |
| `altruisme` / `egoisme` | score d'une passe contre une course ou un contact ; renoncer à une percée pour servir un partenaire mieux placé | `optionsDePasse` (bonus de score), option `RUN` de `lirePorteur` |
| `agressivite` | engagement défensif : monter plus vite, plaquer haut, déblayer fort ; plus de plaquages dominants **et** plus de fautes (jet fait par le moteur, selon `discipline`) | `candidatPresse`, `PRESS_CARRIER`, buts de contact |
| `courage` | aller au sol pour un ballon, s'engager au contact à un contre un, plonger | choix des buts de ruck et de plaquage (`ruck`, `contest` de `profilePour`) |
| `sangFroid` | conserve ses choix sous pression et en fin de match ; réduit le bruit de jugement quand le défenseur est proche | bruit de comparaison des options (voir §3) |
| `concentration` | rareté des erreurs d'inattention (en-avant bête, hors-jeu, oubli d'un appel) | fautes involontaires du moteur, appel manqué (`local-communication`) |
| `confianceSoi` (état) | monte et descend avec **ses propres** réussites et échecs ; module sa prise de risque pour quelques minutes | état individuel de l'agent (jamais partagé) |
| `resilience` | vitesse de retour à la normale après une erreur ou un essai encaissé | décroissance de l'état `confianceSoi` |
| `regularite` | écart de forme d'un match à l'autre (le même joueur n'est pas identique chaque semaine) | tirage au début du match, avec la graine |
| `espritEquipe` | accepte les tâches ingrates : déblayage, course leurre, soutien profond | poids des buts `SUPPORT_CARRIER`, `CROSS_RUN`, leurre (`profilePour`) |
| `leadership` / `communication` | parle plus, plus tôt, plus fort ; son appel pèse davantage chez ceux qui l'entendent | `LocalCommunication`, `maybeSpeak` (portée et fréquence) |
| `constance` (ou `experience`) | s'accroche à son plan ou en change vite | `GoalSelector.margin` et `minCommit` |

Les poids de poste de `profilePour(numero, extra)` (`engine/ai/goals.js`) **restent** : ce sont des préférences de départ
pondérées. La personnalité est appliquée par-dessus **par joueur**, par le paramètre `extra` qui existe déjà. Un 10
prudent et un 14 audacieux voient ainsi leurs préférences de poste déformées chacune à sa manière.

## 3. Mécanismes (à garder simples)

- **Décalage de score** : `score' = score + k × (trait − 50) / 50`, `k` borné (±2,5 points sur l'échelle actuelle des
  options, dont les valeurs sont de l’ordre de la dizaine dans `lirePorteur`). Même forme partout, une seule fonction utilitaire pure, des constantes **nommées**.
- **Multiplicateur de préférence** : `poids' = poids × (1 + c × (trait − 50) / 50)`, `c ≤ 0,35`, borné à [0,05 ; 1].
- **Bruit de jugement déterministe** : à chaque comparaison d'options, un bruit centré, tiré **sans `Math.random()`** :
  fonction pure de (graine du match, identifiant de l'agent, instant quantifié à 0,2 s). Même graine, même résultat. Il
  n'existe que **sous le neutre** (`sangFroid`, `concentration` bas : le joueur hésite sous pression) et le calme du moment
  le réduit ; à 50 ou plus il vaut 0, pour que « neutre = comportement actuel » reste vrai (PERS-01).
- **État individuel** (`confianceSoi`) : un petit nombre dans l'objet de l'agent, mis à jour par **ses seuls** événements
  (sa passe réussie, son plaquage manqué, l'essai encaissé). Personne ne le lit à sa place.
- **Aucune lecture croisée** : un agent ne lit jamais la personnalité d'un autre. Il peut en avoir une **impression** par ce
  qu'il a vu faire (mémoire individuelle), jamais par accès aux valeurs.

## 4. Données, sauvegardes, interface

- Stockage dans `caracteristiques` du joueur (déjà migré par `appliquerCaracteristiques`) ; valeur absente = 50 : les
  sauvegardes et le Mode Club existants restent valides.
- Génération (G52, **décidée : au hasard**) : tirage gaussien stable par joueur (cf. G52 plus bas), jamais un tableau « poste →
  personnalité » ; un trait fourni explicitement l'emporte ; `config.personnalites: 'NEUTRE'` désactive le tirage.
- Mode Club : fiche joueur avec les traits et une étiquette **calculée** (affichage seul) ; évolution lente avec l'expérience
  et les événements de carrière (à définir plus tard).
- Aucune donnée de joueur réel : les personnalités sont des **données de jeu**, pas des portraits de joueurs réels. Les
  corpus de matchs sourcés (11 à 14) ne servent qu'à vérifier des **tendances** plausibles.

## 5. Tests de tendance à écrire (jamais de statistiques d'élite imposées)

| Test | Vérifie |
|---|---|
| PERS-01 | tous traits à 50 : sorties **identiques** à l'état actuel (même graine, mêmes événements) |
| PERS-02 | `altruisme` ↑ ⇒ plus de passes et moins de courses solitaires, graines appariées |
| PERS-03 | `priseDeRisque` ↑ ⇒ plus de gestes osés tentés **et** plus de ballons perdus (compétences constantes) |
| PERS-04 | `sangFroid` ↑ ⇒ moins de choix dégradés quand le défenseur est proche |
| PERS-05 | `agressivite` ↑ ⇒ plus de plaquages dominants **et** plus de pénalités concédées |
| PERS-06 | `espritEquipe` ↑ ⇒ plus de soutiens profonds et de courses leurres |
| PERS-07 | `confianceSoi` : après une série d'échecs la prise de risque baisse puis remonte avec `resilience` |
| PERS-08 | déterminisme : même graine, même résultat, personnalités incluses |
| PERS-09 | matrice de niveaux inchangée : une équipe de joueurs moyens ne produit pas de statistiques d'élite |
| PERS-10 | **garde « rien n'est scripté »** : deux joueurs du même numéro mais de personnalités différentes, dans la même situation, ne choisissent pas toujours pareil ; deux joueurs de numéros différents et de même personnalité font le même choix quand ils ont la même situation et les mêmes compétences |
| PERS-11 | garde statique : aucun `switch`/table par numéro ou par étiquette dans le code de personnalité |

## 6. Tâches proposées (une par session, preuve sur un scénario avant le moteur complet)

- **RM4-G45 — FAIT** — `engine/ai/personality.js` (fonctions pures : `lireTraits`, `decalage`, `multiplicateur`, `ponderer`,
  `amplitudeBruit`, `bruit`) ; le moteur ne crée un trait dans `car` que s'il est fourni explicitement (`TRAITS_PERSONNALITE`) ;
  tests `server/test-v4-personnalite.js` (PERS-01, PERS-08, PERS-11 côté lecture). **Aucun comportement raccordé.**
- **RM4-G46 — FAIT (porteur)** — `engine/ai/open-play.js` : `altruisme` et `egoisme` règlent l'attrait perçu de garder le ballon
  (`gardeLeBallon`, ±2,5 chacun, qui entre dans le score de la course et dans les marges `course + 6`, `+ 3` des passes, pieds et
  chistera) ; `priseDeRisque` abaisse jusqu'à 1,8 m (relève jusqu'à 4,2 m) la marge d'espace exigée autour du receveur de la chistera
  et décale le score de la passe au pied et du petit coup de pied. Un geste non maîtrisé (`me.gestes`) reste hors des options. Tests
  PERS-01 (décisions), PERS-02, PERS-03 dans `server/test-v4-personnalite.js` (600 situations déterministes).
  **Mesure en match (24 matchs GOAP de 15 min, équipe A seule porteuse du trait) :** passes par course 1,32 ± 0,09 (altruistes),
  1,21 ± 0,06 (égoïstes), 1,38 ± 0,08 (neutres). Le sens est celui attendu entre altruistes et égoïstes mais **l'écart n'est pas
  significatif à 8 matchs** : la cadence de passes du moteur (calibrée) dilue l'effet des décisions du porteur. Ne pas annoncer un
  effet visible en match sans campagne plus large (30 graines au moins) ; ne pas gonfler les constantes pour le faire apparaître.
- **RM4-G47 — FAIT pour `sangFroid` (porteur)** — `lirePorteur` ajoute à chaque option un bruit déterministe (graine du match fournie au
  profil de l'agent par `creerPiloteGOAP`, identifiant, option, instant à 0,2 s) d'amplitude `amplitudeBruit(sangFroid, calme)` :
  nulle à 50 ou plus, croissante quand le trait baisse, réduite de moitié au plus quand aucun défenseur n'est proche. Tests PERS-04
  (neutre inchangé, écart croissant, plus fort sous pression) et PERS-08 (décisions) dans `server/test-v4-personnalite.js`.
  **Reste à faire (G47b) :** `concentration` (appel manqué, erreurs d'inattention) et le sang-froid hors du porteur (défenseur, 9, 10).
- **RM4-G48** — `agressivite`/`courage` en défense et au contact : PERS-05.
- **RM4-G49** — `espritEquipe` et préférences de buts par joueur (`profilePour(numero, extra)`) : PERS-06, PERS-10.
- **RM4-G50** — état `confianceSoi` et `resilience` : PERS-07.
- **RM4-G51** — `leadership`/`communication` dans les appels ; `constance` dans le sélecteur de buts.
- **RM4-G52 — valeurs initiales FAITES (tirage stable, décision du propriétaire : « au hasard »)** — chaque joueur reçoit, pour chaque
  trait non fourni, une valeur gaussienne (moyenne 50, écart-type 15, bornée à [5, 95]) fonction pure de (graine du match, équipe,
  numéro de maillot, identité éventuelle, trait) : **elle ne consomme pas le générateur du match** (LEGACY identique), reste la même à
  chaque reprise de jeu, et le numéro ne sert que de clé de tirage (aucune moyenne par poste, vérifié sur 200 graines). L'égoïsme est
  anti-corrélé à l'altruisme. Une valeur explicite l'emporte. `config.personnalites: 'NEUTRE'` désactive le tirage (scénarios de
  test à décision figée). **Reste à faire :** persistance Club (valeur stockée avec le joueur et évolution), fiche joueur avec étiquette
  CALCULÉE (affichage seul), remplaçants (sans identité propre ils reprennent le tirage du maillot), matrice de niveaux (PERS-09).

## 7. Risques et garde-fous

- **Dérive en script déguisé** : « les 10 sont prudents, les ailiers audacieux » serait un script. La génération des
  valeurs ne s'appuie jamais sur le numéro seul ; PERS-10 et PERS-11 le surveillent.
- **Statistiques tirées par les personnalités** : on ne règle pas les traits pour fabriquer un taux de passes d'élite ; on
  vérifie des tendances et la matrice de niveaux.
- **Complexité** : une fonction utilitaire, des constantes nommées, une tâche à la fois, `PERS-01` toujours vert.
- **Coût de calcul** : le mode agents est déjà lent (environ une minute par match) ; les traits sont lus une fois par
  agent, les décalages sont de simples multiplications.
