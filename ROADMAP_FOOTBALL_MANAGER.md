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
| Remplacements réellement effectués pendant le match | 🔴 | `engine/rugby-engine.js` | Le banc de 8 est choisi mais **jamais transmis au moteur** — purement cosmétique. |
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
- **Prochaine tranche prioritaire :** tactique, composition et remplacements (domaine 3, point 3 de l'ordre demandé) — le banc de 8 est aujourd'hui purement cosmétique (jamais transmis au moteur), ce qui est le manque le plus criant de ce domaine.
