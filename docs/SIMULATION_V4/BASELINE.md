# BASELINE — moteur existant (RM4-G00)

Mesurée par `node server/v4/measure-baseline.js 30 --ecrire` (lecture seule, aucune modification du moteur).

## Paramètres

- SHA mesuré : `4372942d8caa9d02f45a729b9da28c5fd7482553` (branche `claude/sharp-faraday-2c0k9h`) ; `origin/main` au moment de la mesure : `2c110568049efb28f28b83a238a42d0ec43b9271`
- Graines 1..30, durée 4800 s, pas fixe dt = 0.1 s, `jouerJusquAuSifflet`, v22.23.4.
- Équipes par défaut du moteur, sans blessures configurées autrement que par défaut. Valeurs cumulées des deux équipes par match (possession : équipe A).

## Résultats

| Métrique | Moyenne | Écart-type | Min | Max |
|---|---:|---:|---:|---:|
| essais | 6.6 | 2.23 | 2 | 12 |
| points | 56.33 | 12.5 | 37 | 88 |
| passes | 413.47 | 40.17 | 345 | 492 |
| passesTentees | 417.13 | 40 | 350 | 495 |
| courses | 264.97 | 22.64 | 228 | 303 |
| metresGagnes | 1044.83 | 102.94 | 860.447 | 1282.515 |
| coupsDePied | 61.47 | 6.46 | 50 | 74 |
| plaquagesTentes | 345.93 | 34.64 | 277 | 404 |
| plaquagesReussis | 299.13 | 28.86 | 238 | 348 |
| rucks | 212.3 | 20.8 | 179 | 251 |
| melees | 17.4 | 3.17 | 11 | 24 |
| touches | 27.33 | 4.88 | 18 | 40 |
| mauls | 7 | 2.62 | 0 | 12 |
| penalitesConcedees | 24.17 | 4.43 | 17 | 34 |
| turnovers | 18.5 | 3.86 | 10 | 29 |
| enAvants | 13.93 | 3.1 | 8 | 23 |
| cartonsJaunes | 0.63 | 0.71 | 0 | 2 |
| tempsJeuEffectifMin | 35 | 2.54 | 29.152 | 39.96 |
| possessionA | 49.37 | 5.95 | 38 | 66 |
| essaisDuN15 | 0.37 | 0.55 | 0 | 2 |

## Données brutes

`docs/SIMULATION_V4/fixtures/baseline_30_graines.json` : une ligne par graine (`parGraine`) et 8 captures de positions des 30 joueurs (`captures`, phases RUCK, MELEE, TOUCHE, MAUL, COUP_ENVOI, PORTE, RUCK, MELEE).

## Limites

- Ce sont les statistiques du moteur tel qu'il est (placements par rôles, pas encore d'agents à buts) : elles servent de référence « avant » pour les tâches RM4-G01 et suivantes.
- Les fourchettes « réalistes » du dépôt (`server/simulate-batch.js`) restent des repères, pas des seuils : voir `docs/SIMULATION_V4/README.md`.
