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

> **Statuts revérifiés dans le code à la tranche 11.** Ce document avait
> pris du retard : huit lignes marquées 🔴 ou 🟡 décrivaient un état
> antérieur à ce qui était réellement livré (dates réelles, jour suivant,
> événements entre les matchs, historique par joueur, fenêtres de
> transfert, effectifs adverses vivants, semaine d'entraînement,
> championnat espoirs), et deux fonctionnalités entières manquaient
> (coupes, amicaux). Ne pas se fier à une ligne sans l'avoir confrontée au
> code — c'est ce qui a été fait ici, fichier par fichier.

---

## 1. Boucle quotidienne

| Fonctionnalité | Statut | Fichiers | Détail |
|---|---|---|---|
| Vraie date et calendrier | 🟢 | `club-temps.js`, `club-calendrier.js`, `club-agenda.js` | Dates civiles réelles (`dateDeJournee`, `formaterDateLongue`), arithmétique pure sans objet `Date`. Chaque rencontre a une date et ne se joue QUE ce jour-là ; équipe première le samedi, Équipe B le dimanche, Espoirs le mercredi. |
| Boîte de réception avec décisions | 🟡 | `club.js`, `club-decisions.js`, `clubUI.js` | **Tranche 1 livrée** : les demandes de temps de jeu des joueurs sont un vrai choix (Rassurer/Ignorer) avec conséquence durable. Les autres messages (transferts, blessures, contrats, résultats...) restent informatifs. |
| Événements entre les matchs | 🟢 | `club-evenements.js`, `clubUI.js` | `avancerUnJour` fait vivre chaque jour creux ; `interruptionsDeJournee` ARRÊTE l'avance quand un événement survient (blessure, décision, rapport de scouting), au lieu de le noyer dans un saut jusqu'au match. |
| Bouton « Jour suivant » | 🟢 | `club-evenements.js`, `clubUI.js` | « Jour suivant » et « Jusqu'au prochain match » sont deux actions distinctes et réelles (`avancerUnJour`, `avancerJusquAuProchainMatch`). |
| Préparation obligatoire avant certaines rencontres | 🟡 | `club-jour-match.js`, `clubUI.js`, `club-composition.js`, `club-analyse.js` | Volontairement jamais obligatoire : un point non préparé est signalé, jamais bloquant. **Tranche 11** : chaque point porte une `nature` (terminé / urgent / recommandé / facultatif / en attente) et le pourcentage ne compte que ce que le manager peut régler aujourd'hui — l'attente du rapport d'analyste n'est plus comptée comme un échec. La carte prépare l'équipe qui joue réellement (première, B ou Espoirs), en lisant la même échéance que le tableau de bord. |
| Zone « À traiter » du tableau de bord | 🟢 | `club-a-traiter.js`, `clubUI.js` | **Tranche 11** : une liste unique et ordonnée dérivée de l'état réel (décisions non tranchées, blessés, poste sans titulaire, budget, fatigue, messages non lus, contrats), quatre niveaux portés par la donnée, chaque ligne cliquable vers l'écran qui la résout. |

## 2. Effectif et joueurs

| Fonctionnalité | Statut | Fichiers | Détail |
|---|---|---|---|
| Fiches détaillées | 🟢 | `clubUI.js` (`ouvrirFicheJoueur`) | 11 attributs, potentiel, progression, moral/fatigue, stats saison, contrat, disponibilité. |
| Forme, fatigue, moral, potentiel, progression | 🟡 | `club-condition-joueurs.js` | Fatigue/moral/potentiel/progression réels. Pas de "forme" individuelle distincte de la fatigue. |
| Statut dans l'équipe et temps de jeu attendu | 🟡 | `clubUI.js`, `club-decisions.js` | **Tranche 1 livrée** : un joueur de qualité non sélectionné plusieurs journées de suite exprime réellement sa frustration (message + conséquence moral/entraînement). Reste à faire : un vrai indicateur "temps de jeu attendu" affiché en continu (pas seulement au moment de la plainte). |
| Hiérarchie du vestiaire (capitaine, leaders) | 🟡 | `club-composition.js` | Capitaine désigné, purement décoratif (aucun effet mécanique, pas de "leaders"). |
| Mécontentements, demandes et discussions | 🟡 | `club-decisions.js` | **Tranche 1 livrée** : demande de temps de jeu = premier cas réel. Manque : demandes salariales, demandes de départ pour d'autres raisons (ambition sportive, rôle tactique...). |
| Historique des saisons et statistiques (par joueur) | 🟢 | `club.js` (`archiverSaisonJoueur`, `carriereJoueur`), `clubUI.js` | Chaque saison est archivée avec le club et l'âge du joueur ; les totaux de carrière additionnent réellement historique + saison en cours, et les stats sont ventilées par compétition (`statsSaison.parCompetition`). Page joueur autonome. |

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
| Fenêtres de transferts | 🟢 | `club-transferts.js` (`fenetresTransfert`, `etatFenetreTransfert`) | Périodes ouvertes/fermées dérivées de dates réelles du calendrier. Hors fenêtre, signer est impossible mais le repérage reste ouvert, avec la date de réouverture affichée — jamais un bouton grisé sans explication. |
| Concurrence avec les clubs IA | 🔴 | — | Marché régénéré uniquement à la demande du joueur ; aucun club IA ne recrute en parallèle. |

## 5. Entraînement et médical

| Fonctionnalité | Statut | Fichiers | Détail |
|---|---|---|---|
| Programme hebdomadaire | 🟢 | `club-semaine-entrainement.js` | Semaine d'entraînement réellement programmable séance par séance, avec une intensité qui pèse sur la fatigue et un risque de blessure mesuré (`RISQUE_BLESSURE_PAR_INTENSITE`, calibré à 7-10 blessures d'entraînement par saison). |
| Entraînement collectif ET individuel | 🟢 | `club-condition-joueurs.js` | `entrainementIndividuel` par joueur, prioritaire sur le collectif. |
| Progression liée au temps de jeu et aux entraîneurs | 🟡 | `club-condition-joueurs.js`, `club-personnel.js` | Effet entraîneur réel. Progression appliquée à TOUT l'effectif, sans lien avec le temps de jeu réel. **Tranche 1** : un joueur qui `veutPartir` s'arrête de progresser — premier lien réel entre état du joueur et entraînement. |
| Blessures crédibles | 🟢 | `club-medical.js` | **Tranche 12** : six types (entorse, déchirure, contusion, commotion, luxation, fracture), zone, gravité, cause. Le risque dépend réellement du poste (pilier 1,45 contre arrière 0,80), de l'âge, de la fatigue et des antécédents — mesuré : 0,615 blessure par match pour un XV frais contre 1,433 pour un XV cuit, là où l'ancien modèle donnait 0,900 dans tous les cas. |
| Diagnostic, durée d'absence, reprise progressive | 🟢 | `club-medical.js` | **Tranche 12** : le diagnostic est une FOURCHETTE que le médecin resserre autour d'une durée réelle tirée une seule fois (donc stable après rechargement). Reprise en cinq paliers — soins, individuel, collectif, temps de jeu limité en Équipe B/Espoirs, retour complet — avec un rendement (72 % à 96 %) réellement transmis au moteur. Le manager peut accélérer le retour contre un risque de rechute plus que doublé. |
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
| Effectifs et tactiques des clubs adverses | 🟡 | `club-effectif-adverse.js`, `club-pyramide.js`, `world.js` | Chaque adversaire du palier du joueur a un groupe complet et persistant (15 + 8 remplaçants nommés, réellement affichés — plus de « pas connu »). Reste incomplet : les matchs IA-IA sont toujours résolus abstraitement (niveau seul, sans effectif ni tactique), et les clubs du Monde n'ont pas d'effectif. |
| Transferts entre clubs IA | 🔴 | — | Effectifs adverses régénérés en bloc chaque saison, aucun mercato IA-IA. |
| Rotation, fatigue et blessures des équipes IA | 🟢 | `club-effectif-adverse.js` | Les clubs adverses ont un vrai groupe (15 + 8 sur le banc), qui fatigue (`FATIGUE_MATCH_TITULAIRE`/`REMPLACANT`), se blesse (`RISQUE_BLESSURE_MATCH`), guérit jour après jour (`avancerJourClubsAdverses`) et tourne selon la fatigue (`rotationClubsAdverses`). |
| Montée, descente, palmarès et historique | 🟡 | `club.js`, `world.js` | Montées/descentes réelles ; aucun palmarès cumulé (seul le dernier vainqueur international est gardé, écrasé chaque saison). |
| Championnat espoirs complet (calendrier + classement) | 🟢 | `club-espoirs.js` | Vrai championnat : plusieurs académies nommées, calendrier daté (le mercredi), journée entière jouée — pas seulement le match du joueur — et classement persistant qui bouge réellement. |
| Coupes à élimination directe | 🟢 | `club-coupes.js` | Moteur générique (`genererCoupe`) et quatre coupes réelles (nationale, continentale, continentale secondaire, espoirs) : tours nommés et datés, aucun match nul, résultat qui produit un vrai message (qualifié / éliminé). Une coupe annonce explicitement qu'elle n'a PAS de classement, au lieu d'afficher une table inventée. |
| Matchs amicaux | 🟢 | `club-amicaux.js` | Rencontre proposée à un club depuis SA page, sur une date réellement libre du calendrier (`datesLibresPourAmical`). Elle devient une échéance annoncée, se joue à sa date avec un score du moteur, fatigue les joueurs alignés et n'avance aucune journée de championnat. |

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

### Tranche 11 — Une semaine complète dans la peau du manager (livrée)
- **Demande explicite de l'utilisateur :** « rendre la carrière fluide, compréhensible et intéressante, pas d'ajouter encore des fonctionnalités isolées » — transformer le tableau de bord en véritable écran « Aujourd'hui », montrer clairement ce qui est urgent / recommandé / terminé / facultatif, regrouper les décisions dans une vraie zone dédiée, éviter les cartes redondantes, et ne jamais créer un second système parallèle à une fonctionnalité existante.
- **Méthode :** une semaine réelle rejouée dans une carrière neuve AVANT d'écrire la moindre ligne, avec mesures dans un vrai navigateur (hauteurs en pixels, nombre de cartes, position de chaque zone) sur ordinateur 1280×1000 et mobile 390×844.
- **Domaines touchés :** 1 (boucle quotidienne, préparation d'avant-match). Aucune fonctionnalité supprimée.
- **Fichiers :** `docs/js/club-a-traiter.js` (**nouveau**), `docs/js/club-agenda.js` (`descriptionRencontre`), `docs/js/club-jour-match.js` (`nature` des points de préparation), `docs/js/club.js` (`POSTE_COMPLET` remonté dans la couche données), `docs/js/clubUI.js`, `docs/index.html`, `docs/css/style.css`, tests.

**Les quatre défauts trouvés, et ce qui a changé :**

1. **La carte « Prochaine échéance » annonçait les 7 rencontres de la journée**, dont 6 ne concernaient pas le joueur (469 px). Pire, elle et le bouton « Continuer » appelaient `prochainArret()` séparément et pouvaient annoncer deux dates différentes. La carte décrit désormais UNE rencontre — la sienne, toutes compétitions confondues — et le bouton lit le MÊME objet : la divergence est devenue impossible par construction.
2. **Une décision non tranchée n'apparaissait nulle part dans les alertes.** Elle dormait dans la boîte de réception, mesurée à 1586 px de défilement sur mobile. Nouveau module `club-a-traiter.js` : une liste unique et ordonnée, dérivée de l'état réel (décisions, blessés, poste sans titulaire, budget, fatigue, messages non lus, contrats), avec quatre niveaux portés par la donnée et un badge en toutes lettres. Les décisions viennent de `saison.clubJoueur.messages`, seule source — aucun système parallèle.
3. **Le tableau de bord répétait la même information sur trois cartes** (mini-classement, statut de l'effectif, résultats vides). Retirées : leur contenu vit déjà dans la page Classement, la barre du haut et « À traiter ». Mesuré : 10 cartes → 7, 2853 px → 1926 px, 3,6 écrans mobile → 2,45, et « À traiter » passe de 1110 px à 164 px — visible sans défiler.
4. **La préparation mélangeait ce qu'on doit faire et ce qu'on doit attendre.** « 60 % de la préparation bouclée » avec le même ⬜ devant « Analyse de l'adversaire » (17 jours d'attente) et « Tactique » (un clic). Chaque point porte désormais une `nature` — terminé / urgent / recommandé / facultatif / en attente — et le pourcentage ne compte que le réglable : « 75 % de ce qui est réglable aujourd'hui (3/4) · 1 point en attente ».

- **Statuts corrigés dans ce document après vérification dans le code** (plusieurs fonctionnalités marquées 🔴 étaient en réalité livrées) : vraie date et calendrier, événements entre les matchs, bouton « Jour suivant », historique/statistiques par joueur, fenêtres de transferts, rotation/fatigue/blessures des équipes IA, programme hebdomadaire, championnat espoirs. Deux lignes manquantes ajoutées : coupes à élimination directe et matchs amicaux.
- **Reste hors périmètre, non traité :** matchs IA-IA toujours résolus abstraitement, clubs du Monde sans effectif, palmarès non cumulé, mercato entre clubs IA, carrière du manager (domaine 8) entièrement absente.

### Tranche 12 — Centre médical 2.0 et reprise progressive (livrée)
- **Demande explicite de l'utilisateur :** remplacer le compteur `blessureJournees` par de vraies blessures persistantes (type, zone, gravité, date, estimation min/max, cause, risque de rechute, état de récupération, niveau de reprise autorisé), avec un risque dépendant réellement du poste, de l'âge, de la fatigue, de l'intensité d'entraînement et des antécédents — **sans créer d'écran parallèle**.
- **Domaines touchés :** 5 (entraînement et médical), 2 (effectif), 3 (composition), 1 (boucle quotidienne).
- **Fichiers :** `docs/js/club-medical.js` (**nouveau**), `club-condition-joueurs.js`, `club-semaine-entrainement.js`, `club-evenements.js`, `club-composition.js`, `club-espoirs.js`, `club-a-traiter.js`, `club-sauvegarde.js`, `club.js`, `clubUI.js`, `docs/index.html`, `docs/css/style.css`, tests.

**Le défaut le plus grave, trouvé en lisant clubUI.js.** Les cinq types de match ne se comportaient pas pareil : l'**Équipe B n'appliquait NI fatigue NI blessure**, les Espoirs une fatigue forfaitaire de +15 sans aucune blessure, et coupe et amical oubliaient le facteur préparateur. Un joueur pouvait donc disputer **toute la saison avec la réserve sans jamais s'user ni se blesser**. Les cinq chemins passent désormais par un point d'entrée unique.

**Ce que le joueur voit de mieux :** l'onglet Médical (le même, enrichi) annonce le diagnostic complet et une fourchette de retour honnête plutôt qu'un compteur exact que le staff n'aurait aucun moyen de connaître ; une carte suit les joueurs en reprise avec le malus exact appliqué au moteur ; la fiche joueur porte les antécédents, qui pèsent réellement sur le risque futur ; « À traiter » nomme la blessure la plus grave au lieu d'un compte générique.

**Une vraie décision :** « Accélérer le retour » annonce sa conséquence avant qu'on la prenne (jours gagnés, risque de rechute avant/après) et l'applique réellement — une rechute renvoie à l'infirmerie pour une blessure complète.

**Choix technique :** `j.blessure` est la source de vérité ; `blessureJournees` survit en **miroir dérivé** écrit par une seule fonction, ce qui laisse fonctionner les 77 sites de lecture existants sans les réécrire — la refonte massive que CLAUDE.md proscrit.
