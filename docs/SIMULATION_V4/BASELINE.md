# BASELINE — moteur existant (RM4-G00)

Mesurée par `node server/v4/measure-baseline.js 30 --ecrire` (lecture seule, aucune modification du moteur).

## Paramètres

- SHA mesuré : `9b9121d97fa03e252cc5fb9d5280bb73b0ace266` (branche `claude/sharp-faraday-2c0k9h`) ; `origin/main` au moment de la mesure : `6bd85deb812392b2cea85c220ace0af5d0c68e2e`
- Graines 1..30, durée 4800 s, pas fixe dt = 0.1 s, `jouerJusquAuSifflet`, v22.23.4.
- Équipes par défaut du moteur, sans blessures configurées autrement que par défaut. Valeurs cumulées des deux équipes par match (possession : équipe A).

## Résultats

| Métrique | Moyenne | Écart-type | Min | Max |
|---|---:|---:|---:|---:|
| essais | 7.13 | 2.35 | 3 | 13 |
| points | 58.43 | 14.39 | 34 | 95 |
| passes | 411.27 | 42.01 | 328 | 498 |
| passesTentees | 414.83 | 42.73 | 330 | 503 |
| courses | 269.87 | 21.03 | 225 | 325 |
| metresGagnes | 1092.39 | 102.15 | 805.694 | 1276.783 |
| coupsDePied | 61.9 | 8.81 | 50 | 90 |
| plaquagesTentes | 351.7 | 28.7 | 290 | 417 |
| plaquagesReussis | 305.47 | 24.77 | 249 | 366 |
| rucks | 216 | 19.4 | 179 | 271 |
| melees | 16.47 | 3.81 | 6 | 24 |
| touches | 28.2 | 4.09 | 21 | 37 |
| mauls | 6.7 | 2.22 | 1 | 12 |
| penalitesConcedees | 22.03 | 3.71 | 14 | 30 |
| turnovers | 18.63 | 5.28 | 7 | 28 |
| enAvants | 12.97 | 3.14 | 6 | 20 |
| cartonsJaunes | 0.57 | 0.62 | 0 | 2 |
| tempsJeuEffectifMin | 34.26 | 2.49 | 30.032 | 41.93 |
| possessionA | 49.97 | 5.38 | 39 | 62 |
| essaisDuN15 | 0.37 | 0.55 | 0 | 2 |

## Données brutes

`docs/SIMULATION_V4/fixtures/baseline_30_graines.json` : une ligne par graine (`parGraine`) et 8 captures de positions des 30 joueurs (`captures`, phases RUCK, MELEE, TOUCHE, MAUL, COUP_ENVOI, PORTE, RUCK, MELEE).

## Limites

- Ce sont les statistiques du moteur tel qu'il est (placements par rôles, pas encore d'agents à buts) : elles servent de référence « avant » pour les tâches RM4-G01 et suivantes.
- Les fourchettes « réalistes » du dépôt (`server/simulate-batch.js`) restent des repères, pas des seuils : voir `docs/SIMULATION_V4/README.md`.
