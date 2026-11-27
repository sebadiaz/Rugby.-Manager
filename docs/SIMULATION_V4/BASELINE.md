# BASELINE — moteur existant (RM4-G00)

Mesurée par `node server/v4/measure-baseline.js 30 --ecrire` (lecture seule, aucune modification du moteur).

## Paramètres

- SHA mesuré : `478f8a8003db2330e04b7a709f891ee21a83141a` (branche `claude/sharp-faraday-2c0k9h`) ; `origin/main` au moment de la mesure : `ee9395a6dcfc4875e278a7070a019bd1438a164c`
- Graines 1..30, durée 4800 s, pas fixe dt = 0.1 s, `jouerJusquAuSifflet`, v22.23.4.
- Équipes par défaut du moteur, sans blessures configurées autrement que par défaut. Valeurs cumulées des deux équipes par match (possession : équipe A).

## Résultats

| Métrique | Moyenne | Écart-type | Min | Max |
|---|---:|---:|---:|---:|
| essais | 7.07 | 2.43 | 2 | 12 |
| points | 58.97 | 15.65 | 22 | 87 |
| passes | 420.67 | 33.71 | 354 | 474 |
| passesTentees | 424.27 | 34.62 | 354 | 480 |
| courses | 270.57 | 23.34 | 234 | 326 |
| metresGagnes | 1109.07 | 136.12 | 731.095 | 1396.736 |
| coupsDePied | 63.67 | 8.83 | 48 | 82 |
| plaquagesTentes | 348.83 | 32.87 | 293 | 429 |
| plaquagesReussis | 300.37 | 29.24 | 250 | 377 |
| rucks | 213.8 | 22.53 | 168 | 263 |
| melees | 16.77 | 3.54 | 10 | 26 |
| touches | 27.6 | 5.54 | 17 | 41 |
| mauls | 7.43 | 2.95 | 3 | 15 |
| penalitesConcedees | 22.7 | 4.54 | 14 | 32 |
| turnovers | 18.93 | 4.54 | 13 | 32 |
| enAvants | 13.5 | 3.23 | 8 | 23 |
| cartonsJaunes | 0.57 | 0.76 | 0 | 3 |
| tempsJeuEffectifMin | 34.74 | 2.39 | 29.957 | 38.872 |
| possessionA | 52.67 | 5.69 | 41 | 65 |
| essaisDuN15 | 0.27 | 0.51 | 0 | 2 |

## Données brutes

`docs/SIMULATION_V4/fixtures/baseline_30_graines.json` : une ligne par graine (`parGraine`) et 8 captures de positions des 30 joueurs (`captures`, phases RUCK, MELEE, TOUCHE, MAUL, COUP_ENVOI, PORTE, RUCK, MELEE).

## Limites

- Ce sont les statistiques du moteur tel qu'il est (placements par rôles, pas encore d'agents à buts) : elles servent de référence « avant » pour les tâches RM4-G01 et suivantes.
- Les fourchettes « réalistes » du dépôt (`server/simulate-batch.js`) restent des repères, pas des seuils : voir `docs/SIMULATION_V4/README.md`.
