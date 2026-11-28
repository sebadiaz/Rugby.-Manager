# BASELINE — moteur existant (RM4-G00)

Mesurée par `node server/v4/measure-baseline.js 30 --ecrire` (lecture seule, aucune modification du moteur).

## Paramètres

- SHA mesuré : `89ceb9a43fba89184f8e87064a384ddfb76ac2fd` (branche `claude/sharp-faraday-2c0k9h`) ; `origin/main` au moment de la mesure : `901a37078114de24191b8e03bea9878bd083ef11`
- Graines 1..30, durée 4800 s, pas fixe dt = 0.1 s, `jouerJusquAuSifflet`, v22.23.4.
- Équipes par défaut du moteur, sans blessures configurées autrement que par défaut. Valeurs cumulées des deux équipes par match (possession : équipe A).

## Résultats

| Métrique | Moyenne | Écart-type | Min | Max |
|---|---:|---:|---:|---:|
| essais | 7.4 | 2.29 | 3 | 12 |
| points | 61 | 15 | 22 | 83 |
| passes | 412.73 | 35.38 | 354 | 474 |
| passesTentees | 416.6 | 36.05 | 354 | 480 |
| courses | 268.43 | 23.23 | 234 | 326 |
| metresGagnes | 1116.17 | 116.83 | 731.095 | 1338.557 |
| coupsDePied | 63.1 | 7.99 | 46 | 79 |
| plaquagesTentes | 348.73 | 31.92 | 297 | 429 |
| plaquagesReussis | 300.83 | 28.78 | 250 | 377 |
| rucks | 212.33 | 22.42 | 168 | 263 |
| melees | 17.3 | 3.47 | 11 | 26 |
| touches | 27.03 | 5.62 | 17 | 41 |
| mauls | 7.27 | 2.85 | 1 | 14 |
| penalitesConcedees | 22 | 3.65 | 16 | 32 |
| turnovers | 19.4 | 5.02 | 11 | 32 |
| enAvants | 13.37 | 3.5 | 8 | 23 |
| cartonsJaunes | 0.67 | 0.83 | 0 | 3 |
| tempsJeuEffectifMin | 34.43 | 2.36 | 29.94 | 38.872 |
| possessionA | 52.13 | 5.96 | 39 | 65 |
| essaisDuN15 | 0.3 | 0.59 | 0 | 2 |

## Données brutes

`docs/SIMULATION_V4/fixtures/baseline_30_graines.json` : une ligne par graine (`parGraine`) et 8 captures de positions des 30 joueurs (`captures`, phases RUCK, MELEE, TOUCHE, MAUL, COUP_ENVOI, PORTE, RUCK, MELEE).

## Limites

- Ce sont les statistiques du moteur tel qu'il est (placements par rôles, pas encore d'agents à buts) : elles servent de référence « avant » pour les tâches RM4-G01 et suivantes.
- Les fourchettes « réalistes » du dépôt (`server/simulate-batch.js`) restent des repères, pas des seuils : voir `docs/SIMULATION_V4/README.md`.
