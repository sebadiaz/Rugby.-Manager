# BASELINE — moteur existant (RM4-G00)

Mesurée par `node server/v4/measure-baseline.js 30 --ecrire` (lecture seule, aucune modification du moteur).

## Paramètres

- SHA mesuré : `6874e6bd24642c10f7e12529033f8167f3ffe5d0` (branche `claude/sharp-faraday-2c0k9h`) ; `origin/main` au moment de la mesure : `1c935bec168ab31f484bd2b2c7976095ec6318c8`
- Graines 1..30, durée 4800 s, pas fixe dt = 0.1 s, `jouerJusquAuSifflet`, v22.23.4.
- Équipes par défaut du moteur, sans blessures configurées autrement que par défaut. Valeurs cumulées des deux équipes par match (possession : équipe A).

## Résultats

| Métrique | Moyenne | Écart-type | Min | Max |
|---|---:|---:|---:|---:|
| essais | 6.33 | 2.15 | 3 | 11 |
| points | 53.67 | 12.72 | 34 | 82 |
| passes | 403.7 | 41.12 | 311 | 492 |
| passesTentees | 407.53 | 41.16 | 315 | 496 |
| courses | 254.53 | 23.25 | 206 | 301 |
| metresGagnes | 1002.34 | 104.1 | 771.336 | 1206.586 |
| coupsDePied | 59.1 | 7.48 | 39 | 74 |
| plaquagesTentes | 330.63 | 30.77 | 271 | 393 |
| plaquagesReussis | 290.37 | 28.01 | 226 | 346 |
| rucks | 206.27 | 16.87 | 160 | 234 |
| melees | 17 | 3.32 | 11 | 24 |
| touches | 27.53 | 4.24 | 20 | 37 |
| mauls | 7.6 | 2.06 | 5 | 13 |
| penalitesConcedees | 22.67 | 4.44 | 14 | 33 |
| turnovers | 18.03 | 5.63 | 4 | 29 |
| enAvants | 12.83 | 2.68 | 8 | 18 |
| cartonsJaunes | 1.2 | 1.51 | 0 | 5 |
| tempsJeuEffectifMin | 34.1 | 2.25 | 28.767 | 39.723 |
| possessionA | 51.63 | 5.8 | 37 | 61 |
| essaisDuN15 | 0.33 | 0.65 | 0 | 2 |

## Données brutes

`docs/SIMULATION_V4/fixtures/baseline_30_graines.json` : une ligne par graine (`parGraine`) et 8 captures de positions des 30 joueurs (`captures`, phases RUCK, MELEE, TOUCHE, MAUL, COUP_ENVOI, PORTE, RUCK, MELEE).

## Limites

- Ce sont les statistiques du moteur tel qu'il est (placements par rôles, pas encore d'agents à buts) : elles servent de référence « avant » pour les tâches RM4-G01 et suivantes.
- Les fourchettes « réalistes » du dépôt (`server/simulate-batch.js`) restent des repères, pas des seuils : voir `docs/SIMULATION_V4/README.md`.
