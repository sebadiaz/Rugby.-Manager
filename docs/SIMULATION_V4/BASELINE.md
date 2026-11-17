# BASELINE — moteur existant (RM4-G00)

Mesurée par `node server/v4/measure-baseline.js 30 --ecrire` (lecture seule, aucune modification du moteur).

## Paramètres

- SHA mesuré : `0ca396392863602e6f6206ea4de5f992cfcc21f6` (branche `claude/sharp-faraday-2c0k9h`) ; `origin/main` au moment de la mesure : `adafc65a9e8842a1b92cbf5bd71ccd61dd3ee0a2`
- Graines 1..30, durée 4800 s, pas fixe dt = 0.1 s, `jouerJusquAuSifflet`, v22.23.4.
- Équipes par défaut du moteur, sans blessures configurées autrement que par défaut. Valeurs cumulées des deux équipes par match (possession : équipe A).

## Résultats

| Métrique | Moyenne | Écart-type | Min | Max |
|---|---:|---:|---:|---:|
| essais | 7.3 | 2.85 | 2 | 13 |
| points | 59.93 | 18.05 | 28 | 99 |
| passes | 417.9 | 44.55 | 326 | 512 |
| passesTentees | 422.1 | 44.24 | 334 | 515 |
| courses | 271.83 | 29.61 | 215 | 348 |
| metresGagnes | 1095.19 | 134.85 | 813.622 | 1348.525 |
| coupsDePied | 58.83 | 6.87 | 47 | 75 |
| plaquagesTentes | 350.8 | 41.47 | 282 | 472 |
| plaquagesReussis | 309.53 | 37.17 | 246 | 407 |
| rucks | 217.97 | 27.8 | 169 | 285 |
| melees | 18.1 | 4.19 | 9 | 26 |
| touches | 26.03 | 3.83 | 16 | 34 |
| mauls | 7.7 | 2.4 | 3 | 12 |
| penalitesConcedees | 23.6 | 3.61 | 16 | 31 |
| turnovers | 18.7 | 3.72 | 12 | 28 |
| enAvants | 13.9 | 3.97 | 6 | 24 |
| cartonsJaunes | 0.77 | 0.96 | 0 | 3 |
| tempsJeuEffectifMin | 34.9 | 2.95 | 28.533 | 41.883 |
| possessionA | 51.83 | 5.7 | 41 | 62 |
| essaisDuN15 | 0.3 | 0.53 | 0 | 2 |

## Données brutes

`docs/SIMULATION_V4/fixtures/baseline_30_graines.json` : une ligne par graine (`parGraine`) et 8 captures de positions des 30 joueurs (`captures`, phases RUCK, MELEE, TOUCHE, MAUL, COUP_ENVOI, PORTE, RUCK, MELEE).

## Limites

- Ce sont les statistiques du moteur tel qu'il est (placements par rôles, pas encore d'agents à buts) : elles servent de référence « avant » pour les tâches RM4-G01 et suivantes.
- Les fourchettes « réalistes » du dépôt (`server/simulate-batch.js`) restent des repères, pas des seuils : voir `docs/SIMULATION_V4/README.md`.
