# ROADMAP_FOOTBALL_MANAGER.md

Feuille de route pour faire progressivement de Rugby Manager un vrai jeu de
gestion façon Football Manager, adapté au rugby à XV. Complète
`TODO_AUDIT.md` (fiabilité/bugs) : ce document suit la **profondeur de
gestion**, domaine par domaine, avec un statut réel constaté dans le code —
pas une intention.

Trois statuts possibles :
- 🟢 **fonctionnel et suffisamment développé**
- 🟡 **présent mais incomplet**
- 🔴 **totalement absent**

Chaque ligne indexe le(s) fichier(s) concerné(s) et, si pertinent, la
tranche qui l'a fait passer d'un statut à un autre. Mis à jour à chaque
tranche livrée — jamais en avance sur ce qui est réellement dans `main`.

---

## 1. Boucle quotidienne

| Fonctionnalité | Statut | Fichiers | Détail |
|---|---|---|---|
| Vraie date et calendrier | 🔴 | `club-calendrier.js` | Uniquement des numéros de `journee` entiers, aucune date calendaire (mois/semaine). |
| Boîte de réception avec décisions | 🟡 | `club.js`, `club-decisions.js`, `clubUI.js` | **Tranche 1 livrée** : les demandes de temps de jeu des joueurs sont un vrai choix (Rassurer/Ignorer) avec conséquence durable. Les autres messages (transferts, blessures, contrats, résultats...) restent informatifs. |
| Événements entre les matchs | 🔴 | — | `lancerLaJournee()` saute directement au prochain match ; aucun jour "creux" jouable. |
| Bouton « Jour suivant » | 🔴 | `clubUI.js` | "Journée suivante" = "prochain match", jamais un vrai jour calendaire indépendant. |
| Préparation obligatoire avant certaines rencontres | 🟡 | `clubUI.js`, `club-composition.js`, `club-analyse.js` | La composition est auto-complétée si incomplète ; aucun match n'impose de préparation. **Tranche 2 livrée** : l'aperçu d'avant-match propose désormais une vraie recommandation tactique actionnable (pas obligatoire — le joueur garde la main). |

## 2. Effectif et joueurs

| Fonctionnalité | Statut | Fichiers | Détail |
|---|---|---|---|
| Fiches détaillées | 🟢 | `clubUI.js` (`ouvrirFicheJoueur`) | 11 attributs, potentiel, progression, moral/fatigue, stats saison, contrat, disponibilité. |
| Forme, fatigue, moral, potentiel, progression | 🟡 | `club-condition-joueurs.js` | Fatigue/moral/potentiel/progression réels. Pas de "forme" individuelle distincte de la fatigue. |
| Statut dans l'équipe et temps de jeu attendu | 🟡 | `clubUI.js`, `club-decisions.js` | **Tranche 1 livrée** : un joueur de qualité non sélectionné plusieurs journées de suite exprime réellement sa frustration (message + conséquence moral/entraînement). Reste à faire : un vrai indicateur "temps de jeu attendu" affiché en continu (pas seulement au moment de la plainte). |
| Hiérarchie du vestiaire (capitaine, leaders) | 🟡 | `club-composition.js` | Capitaine désigné, purement décoratif (aucun effet mécanique, pas de "leaders"). |
| Mécontentements, demandes et discussions | 🟡 | `club-decisions.js` | **Tranche 1 livrée** : demande de temps de jeu = premier cas réel. Manque : demandes salariales, demandes de départ pour d'autres raisons (ambition sportive, rôle tactique...). |
| Historique des saisons et statistiques (par joueur) | 🔴 | `club.js` (`avancerSaison`) | `statsSaison` remis à `null` à chaque nouvelle saison — aucune stat de carrière cumulée par joueur. |

## 3. Composition et tactique

| Fonctionnalité | Statut | Fichiers | Détail |
|---|---|---|---|
| Rôles propres à chaque poste | 🟡 | `club-composition.js` | Capitaine, buteur, lanceur en touche seulement — aucune instruction individuelle au-delà. |
| Consignes collectives et individuelles → moteur | 🟢 (collectif) / 🟡 (individuel) | `club.js` (`AXES_TACTIQUE`), `club-composition.js`, `engine/rugby-engine.js` | 6 axes collectifs réellement branchés au moteur. Individuel limité aux 3 rôles ci-dessus. |
| Stratégie selon l'adversaire | 🟡 | `club-analyse.js`, `clubUI.js` | **Tranche 2 livrée** : l'analyse comparative (déjà réelle) alimente désormais `recommanderTactique`, qui propose un vrai réglage des 6 axes tactiques applicable en un clic depuis l'aperçu du match. Reste à faire : recommandations sur les rôles individuels (buteur/lanceur), pas seulement les 6 axes collectifs. |
| Coups de pied, touches, mêlées, phases arrêtées | 🟡 | `club-composition.js`, `engine/rugby-engine.js` | Buteur unique (pénalité+transfo confondues), lanceur en touche. Pas de composition de mêlée ni de sauteur désigné. |
| Remplacements réellement effectués pendant le match | 🟡 | `engine/rugby-engine.js`, `docs/js/club-composition.js` | **Tranche 3 livrée** : les 8 remplaçants entrent réellement en jeu à des minutes planifiées (avant-match, pas une décision dynamique en direct — hors périmètre de cette tranche, cf. limite architecturale documentée dans `TODO_AUDIT.md`). |
| Changements tactiques en cours de rencontre | 🔴 | — | Pause de mi-temps existe côté animation, aucun hook d'interaction ; tactique figée pour tout le match. |

## 4. Recrutement et contrats

| Fonctionnalité | Statut | Fichiers | Détail |
|---|---|---|---|
| Réseau de recrutement (scouts par zone) | 🔴 | `club-personnel.js` | Un seul rôle générique "Recruteur", aucune zone géographique. |
| Connaissance partielle des joueurs (brouillard) | 🟢 | `club-transferts.js` | Connaissance 20-50%, stats floutées, progression via scouting réel. |
| Rapports de scouts | 🟡 | `club-transferts.js` | Étoiles + stats approximatives, aucun commentaire narratif qualitatif. |
| Favoris et listes de recrutement | 🟢 | `club-transferts.js` | Liste `saison.favoris` réelle. |
| Négociation transfert/salaire/durée/statut | 🟡 | `club-transferts.js`, `club-transferts-internationaux.js`, `club-contrats.js` | Trois flux, tous "un seul montant à prendre ou laisser" — aucun vrai va-et-vient multi-tours. |
| Fenêtres de transferts | 🔴 | — | Marché accessible en permanence, aucune période ouverte/fermée. |
| Concurrence avec les clubs IA | 🔴 | — | Marché régénéré uniquement à la demande du joueur ; aucun club IA ne recrute en parallèle. |

## 5. Entraînement et médical

| Fonctionnalité | Statut | Fichiers | Détail |
|---|---|---|---|
| Programme hebdomadaire | 🟡 | `club-condition-joueurs.js` | Un focus collectif unique, actif tant qu'il n'est pas changé — pas de calendrier d'entraînement distinct des jours de match. |
| Entraînement collectif ET individuel | 🟢 | `club-condition-joueurs.js` | `entrainementIndividuel` par joueur, prioritaire sur le collectif. |
| Progression liée au temps de jeu et aux entraîneurs | 🟡 | `club-condition-joueurs.js`, `club-personnel.js` | Effet entraîneur réel. Progression appliquée à TOUT l'effectif, sans lien avec le temps de jeu réel. **Tranche 1** : un joueur qui `veutPartir` s'arrête de progresser — premier lien réel entre état du joueur et entraînement. |
| Blessures crédibles | 🟡 | `club-condition-joueurs.js` | Probabilité uniforme (6%/titulaire/journée), aucune variation par poste/âge/fatigue. |
| Diagnostic, durée d'absence, reprise progressive | 🔴 | `club-condition-joueurs.js` | Compteur générique de journées, retour instantané à pleine forme. |
| Gestion de la fatigue et rotation de l'effectif | 🟡 | `club-composition.js` | Fatigue réelle et répercutée en match, mais rien n'aide/n'oblige à faire tourner l'effectif. |

## 6. Club et direction

| Fonctionnalité | Statut | Fichiers | Détail |
|---|---|---|---|
| Objectifs du président | 🟢 | `club-objectif.js` | Objectif réel dérivé du classement, évalué en fin de saison. |
| Confiance de la direction | 🟡 | `club.js` | Jauge réelle et ajustée, mais sans aucune conséquence (pas de licenciement — cf. domaine 8). |
| Budgets détaillés | 🟡 | `club.js` | Un seul solde global, 4 lignes de mouvement distinctes — pas de sous-budgets séparés. |
| Masse salariale et projections | 🟡 | `club.js` | Masse salariale réelle + projection à N journées ; aucun plafond salarial, aucune projection pluriannuelle. |
| Sponsors, billetterie, infrastructures (revenus) | 🟡 | `club.js` | Sponsor + billetterie réels ; aucune autre source (merchandising, droits TV, primes). |
| Amélioration stade/centre d'entraînement/formation | 🔴 | — | Aucun mécanisme d'investissement — niveaux fixes, jamais améliorables. |
| Recrutement et compétences du personnel | 🟢 | `club-personnel.js` | 5 postes, niveau/salaire/effet mesurable, embauche/licenciement réels. |

## 7. Monde vivant

| Fonctionnalité | Statut | Fichiers | Détail |
|---|---|---|---|
| Vraies compétitions simulées même hors écran | 🟡 | `world.js`, `club-pyramide-france.js` | La pyramide française avance systématiquement ; le Monde (12 pays) nécessite une première ouverture manuelle de l'onglet avant de s'activer. |
| Effectifs et tactiques des clubs adverses | 🟡 | `club-pyramide.js`, `world.js` | Effectif réel pour les adversaires du palier du joueur ; matchs IA-IA résolus abstraitement (niveau seul, pas d'effectif/tactique). Clubs du Monde sans effectif du tout. |
| Transferts entre clubs IA | 🔴 | — | Effectifs adverses régénérés en bloc chaque saison, aucun mercato IA-IA. |
| Rotation, fatigue et blessures des équipes IA | 🔴 | — | Fatigue/blessures appliquées uniquement à l'effectif du joueur. |
| Montée, descente, palmarès et historique | 🟡 | `club.js`, `world.js` | Montées/descentes réelles ; aucun palmarès cumulé (seul le dernier vainqueur international est gardé, écrasé chaque saison). |
| Championnat espoirs complet (calendrier + classement) | 🟡 | `club-espoirs.js` | Un match ponctuel tous les 4 journées contre une académie synthétique jamais revue — pas un vrai championnat à classement persistant. |

## 8. Carrière du manager

| Fonctionnalité | Statut | Fichiers | Détail |
|---|---|---|---|
| Profil et réputation | 🔴 | — | Aucune structure de données ni écran dédié. |
| Bilan de carrière | 🔴 | — | Impossible structurellement tant qu'on ne peut pas changer de club. |
| Licenciement | 🔴 | — | La confiance du président (domaine 6) ne déclenche aucune conséquence. |
| Offres d'autres clubs | 🔴 | — | Aucun mécanisme. |
| Marché des entraîneurs (managers IA) | 🔴 | — | Aucune entité "manager IA" dans le jeu. |
| Changement de club sans recommencer | 🔴 | — | `saison.clubJoueur` n'est jamais réassigné à un autre club. |

---

## Historique des tranches livrées

### Tranche 1 — Décisions du manager : demandes de temps de jeu (livrée)
- **Domaines touchés :** 1 (boîte de réception avec décisions), 2 (mécontentements/demandes, statut/temps de jeu attendu), 5 (progression liée au temps de jeu — premier lien réel).
- **Fichiers :** `docs/js/club-decisions.js` (nouveau), `docs/js/club.js` (`ajouterMessage` accepte une décision), `docs/js/club-condition-joueurs.js` (conséquences durables de `veutPartir`), `docs/js/clubUI.js` (déclenchement + rendu des boutons de décision), `docs/index.html`, `docs/css/style.css`.
- **Ce que le joueur peut désormais faire :** un joueur de qualité laissé sur le banc plusieurs journées de suite vient réclamer du temps de jeu, avec un vrai choix dans la boîte de réception (« Le rassurer » / « Ignorer sa demande »), pas juste un texte à marquer comme lu.
- **Conséquences réelles :** rassurer améliore le moral (+10) ; ignorer le baisse durablement (−14) et, après une deuxième demande ignorée, le joueur veut quitter le club (badge 🚩 visible dans l'effectif et sa fiche, moral qui ne remonte plus vers la neutralité, progression à l'entraînement stoppée).
- **Prochaine tranche prioritaire (à l'époque) :** préparation complète du prochain match — réalisée en tranche 2 (ci-dessous).

### Tranche 2 — Recommandation tactique dans l'aperçu du prochain match (livrée)
- **Domaines touchés :** 1 (préparation avant match), 3 (stratégie selon l'adversaire).
- **Fichiers :** `docs/js/club-analyse.js` (`recommanderTactique`, `appliquerRecommandationsTactique`), `docs/js/clubUI.js` (rendu + application dans l'aperçu du match), `docs/css/style.css`.
- **Ce que le joueur peut désormais faire :** dans l'aperçu du prochain match, une nouvelle carte « 💡 Recommandation tactique » traduit l'analyse de l'adversaire (déjà réelle) en réglages concrets des 6 axes tactiques, avec une explication en langage clair pour chacun, et un bouton « Appliquer les recommandations » qui les règle en un clic.
- **Conséquences réelles :** la tactique appliquée est bien celle utilisée par le moteur de simulation pour le match — un écart marqué de mêlée/touche/puissance/vitesse/jeu au pied/discipline avec l'adversaire se traduit directement en `avants`/`toucheMaul`/`ligneDef`/`style`/`pied`/`rythme`. Le joueur garde la main : rien n'est appliqué automatiquement, et les réglages restent modifiables ensuite comme n'importe quel réglage manuel.
- **Prochaine tranche prioritaire (à l'époque) :** tactique, composition et remplacements — réalisée en tranche 3 (ci-dessous).

### Tranche 3 — Remplacements réellement effectués pendant le match (livrée)
- **Domaine touché :** 3 (tactique, composition et remplacements) — manque le plus criant identifié : le banc de 8 était choisi dans l'UI mais **jamais transmis au moteur**, purement cosmétique.
- **Fichiers :** `engine/rugby-engine.js` (`config.remplacements`, additif et strictement rétrocompatible), `docs/js/club-composition.js` (`remplacementsVersConfig`, traduit le banc en plan de remplacement), `docs/js/clubUI.js` (transmission au moteur + affichage pré-match), `docs/js/constants.js` (icône du nouvel événement).
- **Ce que le joueur peut désormais faire :** voir, avant le coup d'envoi (carte « 🔄 Remplacements prévus » dans l'aperçu du match), quel remplaçant entrera à quelle minute et à quel numéro — puis le voir réellement se produire pendant la simulation (événement dans le fil du match, changement réel de performance de l'équipe).
- **Conséquences réelles :** chaque remplacement mute en place les attributs de performance du joueur à ce numéro (position/ballon/liaisons de regroupement en cours préservées, comme un vrai remplaçant qui prend la place exacte de celui qu'il relève) — un remplaçant fatigué ou démoralisé apporte réellement moins que sur sa fiche. Persiste correctement à travers les reprises de jeu suivantes (essai/pénalité/mi-temps, qui régénèrent normalement tous les joueurs depuis la config de départ).
- **Limite architecturale documentée (pas une décision arbitraire) :** le jeu calcule tout le match en arrière-plan avant que le joueur choisisse "Voir le match" (résultat déjà connu) — un remplacement "décision cliquée en direct" est donc incompatible avec l'architecture actuelle. Les minutes sont fixes par catégorie de poste (avants d'abord), pas un choix fin du joueur — première tranche volontairement limitée.
- **Prochaine tranche prioritaire (à l'époque) :** joueurs, entraînement et médical — redirigée par une demande explicite de l'utilisateur, réalisée en tranche 4 (ci-dessous).

### Tranche 4 — Équipe gérée : un seul écran de Composition/Tactique pour le premier XV, l'Équipe B et les Espoirs (livrée)
- **Demande explicite de l'utilisateur :** « la gestion, que ce soit l'équipe première, l'équipe B ou l'équipe de jeunes, [doit être] gérée par les mêmes écrans, plus de différence [...] on choisit l'équipe à gérer par menu ». Avant cette tranche, l'Équipe B avait une composition auto-générée non modifiable et les Espoirs n'avaient aucun écran de composition/tactique du tout.
- **Domaines touchés :** 2 (statut dans l'équipe), 3 (composition et tactique), 7 (monde vivant — l'Équipe B utilisait déjà `effectifDisponiblePourEquipeB`, désormais pilotable).
- **Fichiers :** `docs/js/club-composition.js` (`assurerCompositionsSecondaires`, `effectifPourEquipe`, `slotCompositionPourEquipe`, `assurerCompositionPourEquipe`), `docs/js/clubUI.js` (sélecteur d'équipe gérée, généralisation de `rafraichirTerrain`/`rafraichirBanc`/`rafraichirEncadrement`/`rafraichirTactique`, `construireTactiqueCfg` factorisé), `docs/js/main.js` (`simulerMatchEnArrierePlan` accepte une tactique par match, nettoyage anti-contamination entre matchs successifs), `docs/index.html`.
- **Ce que le joueur peut désormais faire :** dans les onglets Composition et Tactique, un sélecteur « Équipe gérée » (Première équipe / Équipe B / Espoirs) fait basculer les MÊMES écrans (terrain, banc, encadrement, 6 axes tactiques) sur l'équipe choisie — plus aucun écran séparé, plus aucune limitation à la seule équipe première.
- **Conséquences réelles :** la composition/tactique/banc de l'Équipe B et des Espoirs, une fois réglés manuellement, sont RÉELLEMENT ceux utilisés au coup d'envoi de leurs matchs respectifs (au lieu d'un recalcul automatique systématique) — y compris la tactique (6 axes) et les remplacements planifiés (tranche 3), jusqu'ici réservés au premier XV. Un choix non touché par le joueur reste auto-complété (comportement historique préservé).
- **Bug réel trouvé et corrigé en cours de route :** `configMatch` (état partagé entre les matchs successifs d'une même journée) pouvait laisser une tactique/un buteur du DERNIER match du premier XV contaminer le match d'Équipe B ou d'Espoirs suivant si celui-ci ne redéfinissait pas explicitement la même clé — corrigé en réinitialisant systématiquement les réglages par équipe avant chaque nouvelle simulation en arrière-plan.
- **Explicitement hors périmètre de cette tranche :** l'onglet Effectif (liste des joueurs + fiche joueur) reste séparé du Centre de formation — pas encore piloté par le même sélecteur (prochaine tranche naturelle si demandée).
- **Prochaine tranche prioritaire :** joueurs, entraînement et médical (domaine 5) — les blessures restent un compteur générique sans diagnostic ni reprise progressive, le manque le plus visible du domaine.

### Tranche 5 — Écrans uniques : la MÊME interface de gestion pour les 4 types d'équipe (livrée)
- **Demande explicite de l'utilisateur :** « Refactorise toute la gestion des équipes autour d'écrans uniques et réutilisables. [...] l'équipe première, l'équipe B, les jeunes et les équipes adverses ne doivent surtout pas avoir des pages séparées ou des interfaces différentes. [...] un seul écran et un seul composant par fonctionnalité. » Suite directe de la tranche 4, qui n'avait unifié que Composition/Tactique, et seulement pour les 3 équipes du club.
- **Domaines touchés :** 2 (statut/effectif), 3 (composition et tactique), 5 (entraînement), 7 (monde vivant — consultation réelle des clubs adverses), plus la navigation générale.
- **Fichiers :** `docs/js/club-equipes.js` (**nouveau** — le contexte d'équipe), `docs/js/clubUI.js`, `docs/index.html`, `docs/css/style.css`, `server/test-parcours-club.js`, `server/test-parcours-navigateur.js`.
- **Ce que le joueur peut désormais faire :** un sélecteur « Équipe affichée » unique, présent à l'identique en haut des 6 écrans de gestion (Effectif, Composition, Tactique, Entraînement, Calendrier & classement, Personnel), permet de basculer entre la **première équipe**, l'**Équipe B**, les **Espoirs** et **n'importe quel club de la division**. Les 6 écrans sont littéralement les mêmes composants : même tableau d'effectif avec ses filtres et son tri, même fiche joueur, même terrain 1-15, mêmes 6 axes tactiques, même table de classement, même organigramme. L'équipe choisie est conservée en passant d'un écran à l'autre et survit à un rechargement.
- **Conséquences réelles :** consulter un adversaire n'est plus une page au rabais — son XV réel, sa tactique déduite de ses attributs, son calendrier et sa position au classement s'examinent avec les mêmes outils que sa propre équipe, ce qui rend la préparation d'un match beaucoup plus concrète. Les résultats des matchs espoirs, jusqu'ici perdus dans un message, sont désormais archivés et donnent un vrai calendrier et un vrai bilan.
- **Lecture seule assumée, et honnête :** une équipe qu'on ne dirige pas utilise le même écran avec les contrôles désactivés. Ce qui n'est pas simulé pour un club IA (son banc, son staff, son programme d'entraînement) est affiché comme **non connu** — jamais inventé pour remplir l'écran.
- **Doublons réellement supprimés :** l'onglet « Équipe B » entier et ses 4 cartes, la table d'effectif adverse recopiée dans « Autres clubs », la **seconde fiche joueur** qui existait pour les joueurs adverses, la carte « Centre de formation », et les deux `<select>` « Équipe gérée » de la tranche 4 — remplacés par un unique nœud déplacé dans l'onglet actif.
- **Bug réel trouvé et corrigé en cours de route :** changer d'équipe avec une fiche joueur ouverte laissait affichée la fiche d'un joueur de l'équipe précédente, tout en masquant la nouvelle liste d'effectif.
- **Prochaine tranche prioritaire :** joueurs, entraînement et médical (domaine 5) — les blessures restent un compteur générique sans diagnostic ni reprise progressive, le manque le plus visible du domaine.

### Tranche 6 — On ouvre un club en cliquant son nom, jamais depuis une liste (livrée)
- **Demande explicite de l'utilisateur :** « Il ne doit exister aucune liste, aucun menu déroulant et aucun sélecteur permettant de choisir un club à consulter. [...] On ouvre un club en cliquant sur son nom là où il apparaît dans le jeu. » Correctif direct de la tranche 5, qui avait mélangé « quel club ? » et « quelle équipe ? » dans un seul sélecteur.
- **Domaines touchés :** navigation générale, 7 (monde vivant — consultation d'un club adverse).
- **Fichiers :** `docs/js/club-equipes.js`, `docs/js/clubUI.js`, `docs/index.html`, `docs/css/style.css`, `server/test-parcours-club.js`, `server/test-parcours-navigateur.js`.
- **Ce que le joueur peut désormais faire :** cliquer le nom d'un club **partout où il apparaît déjà** — calendrier, classement, résultats, prochaine journée, analyse de l'adversaire, liste des autres clubs, fiche joueur, confrontations — pour ouvrir ce club instantanément sur la composition de son équipe première. Son nom s'affiche en permanence en haut à gauche sous la mention « Club consulté », avec un bouton « ← Retour à mon club » qui le ramène exactement là où il était : même équipe, même écran.
- **Conséquences réelles :** préparer un match devient un vrai geste de scouting — on lit le calendrier, on clique l'adversaire du week-end, on regarde son XV, on revient à sa propre tactique sans avoir rien perdu. Le menu d'un club que l'on ne dirige pas ne propose plus que ce qui est réellement observable ; Tactique, Entraînement, Médical, Recrutement, Transferts et Finances en sont **absents**, pas grisés.
- **Deux fonctions centrales, zéro duplication :** `ouvrirClub(clubId)` et `retourMonClub()`, atteintes par **une seule** délégation d'événements pour tous les noms de clubs du jeu.
- **Honnêteté maintenue :** les clubs des autres paliers de la pyramide et de l'écosystème mondial ne sont volontairement pas cliquables — ils n'ont pas d'effectif simulé, et rien n'est fabriqué pour faire semblant.
- **Prochaine tranche prioritaire :** joueurs, entraînement et médical (domaine 5) — les blessures restent un compteur générique sans diagnostic ni reprise progressive.

### Tranche 7 — Carrière calendaire : une vraie date et un bouton « Continuer » (tranche 1/4 livrée)
- **Demande explicite de l'utilisateur :** « remplacer la progression "un clic = une journée de championnat et un match" par une véritable carrière calendaire quotidienne, inspirée de Football Manager. [...] Un match n'est plus lancé directement depuis le dashboard : il se joue uniquement lorsque la date du calendrier atteint sa date prévue. »
- **Domaines touchés :** boucle de jeu principale, 7 (monde vivant), et les fondations des domaines 5 (entraînement/médical) et 1 (préparation de match) pour les tranches suivantes.
- **Fichiers :** `docs/js/club-temps.js` et `docs/js/club-agenda.js` (**nouveaux**), `docs/js/club.js`, `docs/js/club-sauvegarde.js`, `docs/js/clubUI.js`, `docs/index.html`, `docs/css/style.css`, tests.
- **Ce que le joueur peut désormais faire :** suivre une vraie saison au jour le jour. La carrière commence à l'intersaison (mi-août), la date du jour s'affiche en grand dans la barre supérieure, et le bouton principal annonce sa destination : « Continuer jusqu'au samedi 7 septembre 2024 ». Une semaine de championnat se vit maintenant en trois temps — **mercredi** les espoirs, **samedi** l'équipe première, **dimanche** l'Équipe B — au lieu de tout résoudre d'un seul clic.
- **Conséquences réelles :** aucun match ne peut être simulé avant sa date ; le monde et les autres paliers de la pyramide avancent désormais **sans dépendre de l'ouverture de leur écran** (limite connue de longue date, corrigée ici) ; et toute la progression est **déterministe à partir de la graine de la saison**, donc rejouable à l'identique après un rechargement.
- **Compatibilité :** première vraie migration de sauvegarde du projet (v2 → v3). Une carrière existante retrouve ses dates et reprend exactement là où elle s'était arrêtée, sans perdre une seule journée jouée. Moteur de match, compositions, tactiques et navigation unifiée : inchangés.
- **Prochaine tranche :** événements quotidiens (entraînement, récupération, blessures, scouting, messages), agenda des 7 prochains jours sur le tableau de bord.

### Tranche 8 — Carrière calendaire : les jours vivent enfin (tranche 2/4 livrée)
- **Demande explicite de l'utilisateur :** « Tranche 2 : événements quotidiens ; agenda du dashboard ; récupération, fatigue et blessures quotidiennes. [...] ne pas créer de cartes purement décoratives ; une journée de repos réduit réellement la fatigue. »
- **Domaines touchés :** 5 (joueurs, entraînement et médical), boucle de jeu principale.
- **Fichiers :** `docs/js/club-evenements.js` (**nouveau**), `docs/js/club-condition-joueurs.js`, `docs/js/club-prets.js`, `docs/js/club.js`, `docs/js/club-sauvegarde.js`, `docs/js/clubUI.js`, `docs/index.html`, `docs/css/style.css`, tests.
- **Ce que le joueur peut désormais faire :** voir son effectif récupérer réellement entre deux matchs. Les 21 jours d'intersaison et les 6 jours entre deux journées ne sont plus sautés : la fatigue baisse chaque jour, les blessures se résorbent jour après jour, les prêts arrivent à terme, et le tableau de bord affiche l'agenda des **7 prochains jours**.
- **Conséquences réelles :** un joueur mis au repos redevient frais en quelques jours et joue mieux (la fatigue est répercutée sur les stats transmises au moteur). Un retour de blessure ou une fin de prêt arrive dans la boîte de réception parce que la disponibilité a réellement changé — jamais un message décoratif.
- **Défaut de fond corrigé au passage :** un titulaire permanent ne récupérait **jamais** (seuls les non-alignés récupéraient) et restait scotché à 100 de fatigue dès le premier tiers de saison, pénalisé en permanence. Une semaine type (1 match + 6 jours) redevient à peu près neutre.
- **Compatibilité :** migration v3 → v4. Les blessures et les prêts comptaient des « journées de championnat », ils comptent maintenant des jours — une indisponibilité en cours garde exactement la même durée réelle.
- **Prochaine tranche :** semaine d'entraînement (une activité par jour, effets liés au personnel, à l'âge, au potentiel et à la fatigue), rapports de scouts différés, décisions et contrats datés.

### Tranche 9 — Semaine d'entraînement, scouting différé et décisions datées (tranche 3/4 livrée)
- **Demande explicite de l'utilisateur :** « Tranche 3 : semaine d'entraînement ; rapports de scouts différés ; décisions et contrats datés. [...] éviter de faire progresser automatiquement tout l'effectif de la même manière. »
- **Domaines touchés :** 5 (joueurs, entraînement et médical), 6 (recrutement), 2 (statut et relation avec les joueurs).
- **Fichiers :** `docs/js/club-semaine-entrainement.js` (**nouveau**), `docs/js/club-evenements.js`, `docs/js/club-transferts.js`, `docs/js/club-decisions.js`, `docs/js/clubUI.js`, `docs/index.html`, `docs/css/style.css`, tests.
- **Ce que le joueur peut désormais faire :** composer sa **semaine d'entraînement**, une séance par jour parmi huit (repos, récupération, physique, mêlée, touche, défense, attaque, jeu au pied), modifiable jusqu'au début de la journée concernée. Chaque séance a deux effets opposés et réels : elle développe des attributs précis, et elle fatigue. Il n'existe donc pas de semaine optimale universelle — c'est un vrai arbitrage selon le calendrier et l'état de l'effectif.
- **Conséquences réelles :** la progression n'est plus uniforme. L'âge, la marge restant jusqu'au potentiel, la fatigue du jour, le temps de jeu réel et la qualité de l'entraîneur se combinent — un joueur de 34 ans ne progresse plus, un joueur au plafond non plus, un joueur épuisé ne retient presque rien de la séance, et un blessé se soigne au lieu de s'entraîner. Une séance ne développe que les postes concernés, mais tout le monde en encaisse la charge.
- **Scouting différé :** commander un rapport engage le budget tout de suite, mais la connaissance n'augmente qu'à sa remise, quelques jours plus tard — un bon recruteur va plus vite et coûte moins cher. Le marché affiche la date de remise attendue.
- **Décisions datées :** une demande de temps de jeu affiche son échéance. Passée la date, le silence vaut refus, avec exactement la même conséquence qu'un refus assumé. Ne rien décider a désormais un coût.
- **Portée assumée :** la *négociation* de contrat reste synchrone. La rendre asynchrone touche le flux de fenêtres modales et sera traitée avec les échanges de vestiaire en tranche 4, plutôt qu'à moitié faite ici.
- **Prochaine tranche :** préparation complète de la rencontre, fenêtres de transfert, événements de direction et de vestiaire.

### Tranche 10 — Préparation de match, fenêtres de transfert, direction et vestiaire (tranche 4/4 livrée)
- **Demande explicite de l'utilisateur :** « Tranche 4 : préparation complète de la rencontre ; fenêtres de transfert ; événements de direction et de vestiaire. »
- **Domaines touchés :** 1 (préparation d'avant-match), 6 (recrutement), 2 (relation avec les joueurs), et la direction du club.
- **Fichiers :** `docs/js/club-jour-match.js` et `docs/js/club-direction.js` (**nouveaux**), `docs/js/club-transferts.js`, `docs/js/club-contrats.js`, `docs/js/club-decisions.js`, `docs/js/club-evenements.js`, `docs/js/clubUI.js`, `docs/index.html`, `docs/css/style.css`, tests.
- **Ce que le joueur peut désormais faire :** préparer sa rencontre sur plusieurs jours. Une carte « Préparation du prochain match » suit cinq points — analyse de l'adversaire, composition, tactique, coups de pied arrêtés et rôles, banc — avec un pourcentage réel et un clic direct vers l'écran où régler chacun. L'analyse de l'adversaire n'est pas disponible tout de suite : l'analyste a besoin de quelques jours d'observation, et le jeu annonce combien.
- **Aucun blocage artificiel :** un point non préparé est signalé, jamais empêchant — le manager reste libre de jouer sans avoir rien réglé.
- **Fenêtres de transfert :** les signatures ne sont possibles que pendant le mercato d'été (jusqu'à la 4ᵉ journée) ou d'hiver (quatre semaines à la mi-saison), dates dérivées du calendrier réel. Hors fenêtre, l'interface annonce la date de réouverture au lieu de griser un bouton sans explication — et le repérage, lui, reste ouvert toute l'année.
- **Contrats asynchrones :** proposer un salaire n'aboutit plus dans la seconde. Le joueur consulte son agent et répond quelques jours plus tard, pendant que la carrière avance.
- **Direction et vestiaire :** le président fait deux points d'étape dans la saison, compare la position réelle à l'objectif et ajuste sa confiance. Et quand le moral collectif s'effondre, le capitaine vient demander une réunion — la tenir remonte réellement le moral mais coûte la séance du lendemain.
- **Le découpage en quatre tranches demandé est terminé.** Restent hors périmètre, documentés : les coupes d'Europe pour le club du joueur, une IA de recrutement pour les clubs adverses, un centre de formation pour les clubs IA.
