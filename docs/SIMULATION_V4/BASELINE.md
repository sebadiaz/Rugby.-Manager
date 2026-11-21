# BASELINE — moteur existant (RM4-G00)

Mesurée par `node server/v4/measure-baseline.js 30 --ecrire` (lecture seule, aucune modification du moteur).

## Paramètres

- SHA mesuré : `ecc062c6777237cbc647d455810ba4794f48080f` (branche `claude/sharp-faraday-2c0k9h`) ; `origin/main` au moment de la mesure : `2c110568049efb28f28b83a238a42d0ec43b9271`
- Graines 1..30, durée 4800 s, pas fixe dt = 0.1 s, `jouerJusquAuSifflet`, v22.23.4.
- Équipes par défaut du moteur, sans blessures configurées autrement que par défaut. Valeurs cumulées des deux équipes par match (possession : équipe A).

## Résultats

| Métrique | Moyenne | Écart-type | Min | Max |
|---|---:|---:|---:|---:|
| essais | 6.93 | 2.74 | 3 | 15 |
| points | 59.4 | 16.94 | 31 | 106 |
| passes | 420.27 | 46.1 | 317 | 499 |
| passesTentees | 423.87 | 46.49 | 320 | 503 |
| courses | 269.93 | 24.97 | 209 | 323 |
| metresGagnes | 1086.46 | 143.93 | 826.834 | 1347.906 |
| coupsDePied | 57.77 | 9.08 | 43 | 78 |
| plaquagesTentes | 349.03 | 32.11 | 279 | 419 |
| plaquagesReussis | 304.6 | 28.79 | 233 | 368 |
| rucks | 217.87 | 20.59 | 168 | 264 |
| melees | 18.2 | 3.33 | 9 | 26 |
| touches | 26.03 | 5.34 | 17 | 38 |
| mauls | 6.97 | 2.44 | 3 | 12 |
| penalitesConcedees | 24.23 | 3.73 | 17 | 30 |
| turnovers | 18.23 | 3.78 | 11 | 29 |
| enAvants | 13.93 | 3.41 | 5 | 21 |
| cartonsJaunes | 1 | 1.13 | 0 | 4 |
| tempsJeuEffectifMin | 35.11 | 2.34 | 29.642 | 40.198 |
| possessionA | 48.27 | 5.43 | 37 | 60 |
| essaisDuN15 | 0.4 | 0.66 | 0 | 3 |

## Données brutes

`docs/SIMULATION_V4/fixtures/baseline_30_graines.json` : une ligne par graine (`parGraine`) et 8 captures de positions des 30 joueurs (`captures`, phases RUCK, MELEE, TOUCHE, MAUL, COUP_ENVOI, PORTE, RUCK, MELEE).

## Limites

- Ce sont les statistiques du moteur tel qu'il est (placements par rôles, pas encore d'agents à buts) : elles servent de référence « avant » pour les tâches RM4-G01 et suivantes.
- Les fourchettes « réalistes » du dépôt (`server/simulate-batch.js`) restent des repères, pas des seuils : voir `docs/SIMULATION_V4/README.md`.
