# BASELINE — moteur existant (RM4-G00)

Mesurée par `node server/v4/measure-baseline.js 30 --ecrire` (lecture seule, aucune modification du moteur).

## Paramètres

- SHA mesuré : `1eeb30a9e11ebe765ba351ce00ae78501158c046` (branche `claude/sharp-faraday-2c0k9h`) ; `origin/main` au moment de la mesure : `1eeb30a9e11ebe765ba351ce00ae78501158c046`
- Graines 1..30, durée 4800 s, pas fixe dt = 0.1 s, `jouerJusquAuSifflet`, v22.23.4.
- Équipes par défaut du moteur, sans blessures configurées autrement que par défaut. Valeurs cumulées des deux équipes par match (possession : équipe A).

## Résultats

| Métrique | Moyenne | Écart-type | Min | Max |
|---|---:|---:|---:|---:|
| essais | 6.77 | 2.08 | 3 | 11 |
| points | 56.07 | 13.76 | 35 | 83 |
| passes | 409.13 | 50.31 | 266 | 504 |
| passesTentees | 413.07 | 49.89 | 270 | 506 |
| courses | 264.77 | 29.07 | 178 | 322 |
| metresGagnes | 1047.72 | 119.8 | 700.894 | 1244.2 |
| coupsDePied | 59.4 | 7.48 | 45 | 77 |
| plaquagesTentes | 345.9 | 39.11 | 235 | 427 |
| plaquagesReussis | 298.3 | 34.21 | 199 | 371 |
| rucks | 212.2 | 24.06 | 142 | 266 |
| melees | 17.73 | 3.11 | 10 | 25 |
| touches | 27.23 | 4.14 | 16 | 35 |
| mauls | 7.87 | 2.77 | 2 | 13 |
| penalitesConcedees | 23.4 | 4.39 | 16 | 34 |
| turnovers | 18.13 | 4.54 | 7 | 28 |
| enAvants | 13.73 | 2.46 | 8 | 18 |
| cartonsJaunes | 0.67 | 0.98 | 0 | 4 |
| tempsJeuEffectifMin | 33.94 | 3.07 | 24.273 | 39.395 |
| possessionA | 51.27 | 7.02 | 32 | 62 |
| essaisDuN15 | 0.3 | 0.59 | 0 | 2 |

## Données brutes

`docs/SIMULATION_V4/fixtures/baseline_30_graines.json` : une ligne par graine (`parGraine`) et 8 captures de positions des 30 joueurs (`captures`, phases RUCK, MELEE, TOUCHE, MAUL, COUP_ENVOI, PORTE, RUCK, MELEE).

## Limites

- Ce sont les statistiques du moteur tel qu'il est (placements par rôles, pas encore d'agents à buts) : elles servent de référence « avant » pour les tâches RM4-G01 et suivantes.
- Les fourchettes « réalistes » du dépôt (`server/simulate-batch.js`) restent des repères, pas des seuils : voir `docs/SIMULATION_V4/README.md`.
