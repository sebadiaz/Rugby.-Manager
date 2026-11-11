# BASELINE — moteur existant (RM4-G00)

Mesurée par `node server/v4/measure-baseline.js 30 --ecrire` (lecture seule, aucune modification du moteur).

## Paramètres

- SHA mesuré : `15ef9080bbaf4c6272b39fde9760c51461a4eb77` (branche `claude/readme-details-6aj3jt`) ; `origin/main` au moment de la mesure : `8024bcc5e3004562c35a29db6fa38373eee4c3ad`
- Graines 1..30, durée 4800 s, pas fixe dt = 0.1 s, `jouerJusquAuSifflet`, v22.22.0.
- Équipes par défaut du moteur, sans blessures configurées autrement que par défaut. Valeurs cumulées des deux équipes par match (possession : équipe A).

## Résultats

| Métrique | Moyenne | Écart-type | Min | Max |
|---|---:|---:|---:|---:|
| essais | 6.5 | 1.82 | 2 | 10 |
| points | 54.03 | 9.26 | 29 | 71 |
| passes | 412.3 | 35.77 | 346 | 488 |
| passesTentees | 416.43 | 35.84 | 351 | 488 |
| courses | 263.27 | 24.95 | 209 | 307 |
| metresGagnes | 1051.74 | 126.66 | 804.234 | 1347.904 |
| coupsDePied | 59.53 | 7.69 | 39 | 73 |
| plaquagesTentes | 344.57 | 37.35 | 277 | 428 |
| plaquagesReussis | 301.73 | 32.16 | 236 | 369 |
| rucks | 210.43 | 21.32 | 166 | 246 |
| melees | 17.83 | 3.18 | 12 | 23 |
| touches | 25.57 | 4.6 | 17 | 35 |
| mauls | 7.67 | 2.99 | 1 | 14 |
| penalitesConcedees | 21.47 | 4.02 | 12 | 30 |
| turnovers | 17.4 | 5.21 | 6 | 34 |
| enAvants | 13.43 | 2.62 | 9 | 20 |
| cartonsJaunes | 1.07 | 1.06 | 0 | 5 |
| tempsJeuEffectifMin | 34.58 | 2.21 | 30.402 | 40.263 |
| possessionA | 50.7 | 5.07 | 41 | 61 |
| essaisDuN15 | 0.23 | 0.5 | 0 | 2 |

## Données brutes

`docs/SIMULATION_V4/fixtures/baseline_30_graines.json` : une ligne par graine (`parGraine`) et 8 captures de positions des 30 joueurs (`captures`, phases RUCK, MELEE, TOUCHE, MAUL, COUP_ENVOI, PORTE, RUCK, MELEE).

## Limites

- Ce sont les statistiques du moteur tel qu'il est (placements par rôles, pas encore d'agents à buts) : elles servent de référence « avant » pour les tâches RM4-G01 et suivantes.
- Les fourchettes « réalistes » du dépôt (`server/simulate-batch.js`) restent des repères, pas des seuils : voir `docs/SIMULATION_V4/README.md`.
