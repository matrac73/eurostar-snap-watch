# eurostar-snap-watch

Surveille le site [Eurostar Snap](https://snap.eurostar.com/fr-fr) pour **une date de voyage** et envoie un mail dès que les billets sont en vente sur le créneau voulu (matin ou après-midi), avec le prix et un lien de réservation pré-rempli.

## Ce que ça fait, et ce que ça ne fait pas

- Toutes les 10 minutes, une tâche planifiée Windows ouvre la page de recherche Snap dans Chrome (fenêtre réduite) et lit le résultat : créneaux proposés et prix, ou « aucun billet Snap disponible à cette date ».
- Dès que le créneau voulu apparaît : mail aux destinataires, ouverture de la page pré-remplie dans le navigateur par défaut, puis la tâche se désactive toute seule.
- Si seul l'autre créneau est en vente : un mail d'information, et la veille continue.
- Si la vérification échoue 6 fois de suite : un mail d'alerte (un seul), puis un mail quand ça repart.
- **Rien n'est acheté ni réservé.** Snap n'a pas de panier qui se garde : la place n'est tenue qu'une fois payée. Le « panier » est donc le lien pré-rempli (date, nombre d'adultes, créneau) : il reste à cliquer sur « Continuer », saisir les voyageurs et payer.

Le site refuse les navigateurs sans fenêtre et les appels directs à son API (protection anti-robots). Le script n'essaie pas de la contourner : il charge la page publique dans le Chrome installé, comme un visiteur, à faible fréquence. Garde un intervalle raisonnable (10 minutes) et un usage personnel.

## Ce qu'il faut savoir sur Snap

- Le site annonce une réservation « jusqu'à 10 jours à l'avance », mais les dates s'ouvrent au cas par cas selon le remplissage des trains. Certaines dates ne sont jamais proposées (trains pleins).
- Créneau matin = départ entre le premier train et 14 h environ ; l'heure exacte arrive au plus tard 48 h avant.
- Billets ni échangeables, ni remboursables, ni cessibles. Adultes uniquement, 4 personnes maximum.

## Installation

Prérequis : Windows, PowerShell 7 (`pwsh`), Node.js 20+, Google Chrome, un compte SMTP (par exemple Gmail avec un mot de passe d'application).

```powershell
git clone https://github.com/matrac73/eurostar-snap-watch
cd eurostar-snap-watch
npm install
Copy-Item config.example.json config.json   # puis éditer config.json
```

Mot de passe SMTP, chiffré pour le compte Windows courant (jamais dans le dépôt) :

```powershell
Get-Credential | Export-Clixml C:\chemin\vers\smtp-cred.xml
```

Indiquer ce chemin dans `mail.credentialFile`. `config.json`, `state/` et `logs/` sont ignorés par git : les adresses mail et les secrets restent sur la machine.

## Changer de date ou de trajet

Tout est dans `config.json`, bloc `trip` :

| Champ | Valeur |
|---|---|
| `date` | date du voyage, `AAAA-MM-JJ` |
| `slot` | `morning` ou `afternoon` |
| `adults` | 1 à 4 |
| `origin` / `destination` | codes de gare (ci-dessous) |
| `label` | texte libre repris dans le mail |

| Gare | Code |
|---|---|
| Paris Gare du Nord | `8727100` |
| Londres St Pancras | `7015400` |
| Bruxelles-Midi | `8814001` |
| Amsterdam Centraal | `8400058` |
| Rotterdam Centraal | `8400530` |
| Cologne Hbf | `8015458` |

Pour une autre gare, faire une recherche à la main sur le site Snap et lire `origin=` / `destination=` dans l'adresse de la page.

Puis relancer la veille :

```powershell
pwsh -File install-task.ps1          # (ré)active la tâche, toutes les 10 min
```

L'état est gardé par trajet et par date dans `state/` : une nouvelle date repart de zéro. Pour un aller-retour, cloner le dossier une deuxième fois avec un autre `taskName`.

## Commandes utiles

```powershell
pwsh -File run.ps1                            # une vérification tout de suite
pwsh -File run.ps1 -Date 2026-11-25 -Test     # essai complet sur une date ouverte : mail marqué [TEST], aucun état enregistré
node watch.mjs --origin 8727100 --destination 7015400 --date 2026-12-06 --adults 2   # résultat brut en JSON
pwsh -File install-task.ps1 -EveryMinutes 5   # changer l'intervalle
pwsh -File install-task.ps1 -Remove           # supprimer la tâche
Get-Content logs\*.log -Tail 20               # journal des vérifications
```

## Limites

- Le PC doit être allumé, session ouverte et non en veille : la vérification a besoin d'une vraie fenêtre Chrome. Une vérification manquée est rattrapée au réveil.
- Une fenêtre Chrome réduite apparaît brièvement dans la barre des tâches à chaque vérification.
- Si Eurostar change sa page, la veille passe en erreur et envoie le mail d'alerte ; les sélecteurs à adapter sont dans `watch.mjs`.

## Fichiers

- `watch.mjs` : ouvre la page Snap et renvoie les créneaux en JSON.
- `run.ps1` : une vérification, l'état, les mails.
- `install-task.ps1` : la tâche planifiée.
- `config.example.json` : modèle de configuration.
