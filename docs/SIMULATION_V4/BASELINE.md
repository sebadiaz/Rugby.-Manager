# BASELINE — moteur existant (RM4-G00)

Mesurée par `node server/v4/measure-baseline.js 30 --ecrire` (lecture seule, aucune modification du moteur).

## Paramètres

- SHA mesuré : `ed65b9b7986def50166d9573e51e9abc0dc71b3e` (branche `claude/sharp-faraday-2c0k9h`) ; `origin/main` au moment de la mesure : `2c110568049efb28f28b83a238a42d0ec43b9271`
- Graines 1..30, durée 4800 s, pas fixe dt = 0.1 s, `jouerJusquAuSifflet`, v22.23.4.
- Équipes par défaut du moteur, sans blessures configurées autrement que par défaut. Valeurs cumulées des deux équipes par match (possession : équipe A).

## Résultats

| Métrique | Moyenne | Écart-type | Min | Max |
|---|---:|---:|---:|---:|
| essais | 6.8 | 2.01 | 3 | 12 |
| points | 56.73 | 13.6 | 33 | 85 |
| passes | 406.17 | 47.01 | 321 | 513 |
| passesTentees | 409.63 | 46.64 | 326 | 514 |
| courses | 267.73 | 24.27 | 231 | 331 |
| metresGagnes | 1047.64 | 113.4 | 891.577 | 1416.605 |
| coupsDePied | 59.53 | 7.44 | 41 | 74 |
| plaquagesTentes | 349.87 | 32.68 | 303 | 426 |
| plaquagesReussis | 301.43 | 27.15 | 269 | 364 |
| rucks | 212.43 | 19.11 | 184 | 266 |
| melees | 18.47 | 3.79 | 10 | 26 |
| touches | 25.93 | 3.67 | 20 | 34 |
| mauls | 7.33 | 2.82 | 2 | 14 |
| penalitesConcedees | 22.3 | 4.7 | 11 | 34 |
| turnovers | 18.8 | 4.42 | 12 | 25 |
| enAvants | 14.7 | 3.73 | 7 | 23 |
| cartonsJaunes | 0.7 | 0.78 | 0 | 3 |
| tempsJeuEffectifMin | 34.69 | 2.43 | 30.745 | 40.462 |
| possessionA | 49.77 | 4.66 | 37 | 60 |
| essaisDuN15 | 0.5 | 0.72 | 0 | 2 |

## Données brutes

`docs/SIMULATION_V4/fixtures/baseline_30_graines.json` : une ligne par graine (`parGraine`) et 8 captures de positions des 30 joueurs (`captures`, phases RUCK, MELEE, TOUCHE, MAUL, COUP_ENVOI, PORTE, RUCK, MELEE).

## Limites

- Ce sont les statistiques du moteur tel qu'il est (placements par rôles, pas encore d'agents à buts) : elles servent de référence « avant » pour les tâches RM4-G01 et suivantes.
- Les fourchettes « réalistes » du dépôt (`server/simulate-batch.js`) restent des repères, pas des seuils : voir `docs/SIMULATION_V4/README.md`.
