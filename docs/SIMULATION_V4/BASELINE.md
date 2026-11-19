# BASELINE — moteur existant (RM4-G00)

Mesurée par `node server/v4/measure-baseline.js 30 --ecrire` (lecture seule, aucune modification du moteur).

## Paramètres

- SHA mesuré : `a0354f0edbf4a4073ae559f92c2ea95f35f9a5ba` (branche `claude/sharp-faraday-2c0k9h`) ; `origin/main` au moment de la mesure : `fff5fdd6a4b1fdb31e856899a18b128ac3bda2fd`
- Graines 1..30, durée 4800 s, pas fixe dt = 0.1 s, `jouerJusquAuSifflet`, v22.23.4.
- Équipes par défaut du moteur, sans blessures configurées autrement que par défaut. Valeurs cumulées des deux équipes par match (possession : équipe A).

## Résultats

| Métrique | Moyenne | Écart-type | Min | Max |
|---|---:|---:|---:|---:|
| essais | 7.07 | 2.37 | 2 | 12 |
| points | 58.07 | 14.17 | 26 | 90 |
| passes | 409.13 | 34.55 | 341 | 472 |
| passesTentees | 412.97 | 34.55 | 344 | 475 |
| courses | 259.17 | 19.12 | 225 | 297 |
| metresGagnes | 1052.33 | 103.89 | 860.016 | 1405.444 |
| coupsDePied | 58.97 | 9.15 | 34 | 78 |
| plaquagesTentes | 335.57 | 26.64 | 291 | 384 |
| plaquagesReussis | 295.4 | 23.37 | 254 | 337 |
| rucks | 208.7 | 16.53 | 173 | 247 |
| melees | 18.13 | 2.72 | 12 | 23 |
| touches | 28.23 | 4.75 | 15 | 35 |
| mauls | 7.63 | 2.55 | 2 | 12 |
| penalitesConcedees | 24.67 | 4.44 | 15 | 34 |
| turnovers | 18.5 | 4.22 | 11 | 26 |
| enAvants | 13.6 | 3.47 | 6 | 21 |
| cartonsJaunes | 1 | 1.18 | 0 | 5 |
| tempsJeuEffectifMin | 34.32 | 2.12 | 30.282 | 38.932 |
| possessionA | 50.97 | 6.53 | 39 | 70 |
| essaisDuN15 | 0.37 | 0.6 | 0 | 2 |

## Données brutes

`docs/SIMULATION_V4/fixtures/baseline_30_graines.json` : une ligne par graine (`parGraine`) et 8 captures de positions des 30 joueurs (`captures`, phases RUCK, MELEE, TOUCHE, MAUL, COUP_ENVOI, PORTE, RUCK, MELEE).

## Limites

- Ce sont les statistiques du moteur tel qu'il est (placements par rôles, pas encore d'agents à buts) : elles servent de référence « avant » pour les tâches RM4-G01 et suivantes.
- Les fourchettes « réalistes » du dépôt (`server/simulate-batch.js`) restent des repères, pas des seuils : voir `docs/SIMULATION_V4/README.md`.
