# BASELINE — moteur existant (RM4-G00)

Mesurée par `node server/v4/measure-baseline.js 30 --ecrire` (lecture seule, aucune modification du moteur).

## Paramètres

- SHA mesuré : `17153ab92e58663a5c6fba5342df60b988e1eed5` (branche `claude/sharp-faraday-2c0k9h`) ; `origin/main` au moment de la mesure : `adafc65a9e8842a1b92cbf5bd71ccd61dd3ee0a2`
- Graines 1..30, durée 4800 s, pas fixe dt = 0.1 s, `jouerJusquAuSifflet`, v22.23.4.
- Équipes par défaut du moteur, sans blessures configurées autrement que par défaut. Valeurs cumulées des deux équipes par match (possession : équipe A).

## Résultats

| Métrique | Moyenne | Écart-type | Min | Max |
|---|---:|---:|---:|---:|
| essais | 7.27 | 2.37 | 3 | 12 |
| points | 58.77 | 16.24 | 30 | 95 |
| passes | 418.33 | 39.84 | 342 | 494 |
| passesTentees | 422.9 | 40.14 | 345 | 500 |
| courses | 275.17 | 26.05 | 229 | 331 |
| metresGagnes | 1105.73 | 118.38 | 845.525 | 1332.324 |
| coupsDePied | 57 | 7.22 | 45 | 75 |
| plaquagesTentes | 352.2 | 36.42 | 276 | 447 |
| plaquagesReussis | 309.73 | 32.08 | 252 | 391 |
| rucks | 222.4 | 24.3 | 187 | 278 |
| melees | 19.6 | 2.81 | 15 | 27 |
| touches | 25.2 | 4.71 | 16 | 36 |
| mauls | 6.5 | 2.08 | 2 | 11 |
| penalitesConcedees | 23.13 | 3.85 | 15 | 31 |
| turnovers | 18.67 | 4.01 | 10 | 28 |
| enAvants | 14.43 | 3.04 | 8 | 21 |
| cartonsJaunes | 0.83 | 0.97 | 0 | 4 |
| tempsJeuEffectifMin | 34.6 | 2.63 | 30.338 | 40.373 |
| possessionA | 51.53 | 5.39 | 42 | 62 |
| essaisDuN15 | 0.43 | 0.56 | 0 | 2 |

## Données brutes

`docs/SIMULATION_V4/fixtures/baseline_30_graines.json` : une ligne par graine (`parGraine`) et 8 captures de positions des 30 joueurs (`captures`, phases RUCK, MELEE, TOUCHE, MAUL, COUP_ENVOI, PORTE, RUCK, MELEE).

## Limites

- Ce sont les statistiques du moteur tel qu'il est (placements par rôles, pas encore d'agents à buts) : elles servent de référence « avant » pour les tâches RM4-G01 et suivantes.
- Les fourchettes « réalistes » du dépôt (`server/simulate-batch.js`) restent des repères, pas des seuils : voir `docs/SIMULATION_V4/README.md`.
