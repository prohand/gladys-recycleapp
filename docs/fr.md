# RecycleApp pour Gladys Assistant

Cette intégration lit le calendrier des collectes de déchets que
[RecycleApp](https://www.recycleapp.be) (Fost Plus) publie pour une adresse en
Belgique, et le rend utilisable dans Gladys : appareils, scènes et widget du
tableau de bord.

Pas de compte, pas de clé : l'intégration interroge la même API publique que le
site recycleapp.be. Elle a seulement besoin d'Internet (badge **cloud**).

## Installation

1. Installez **RecycleApp** depuis le catalogue des intégrations de Gladys
   (Gladys 5.1 ou plus récent).
2. Dans **Configuration**, renseignez :
   - **Code postal** : par exemple `5000` ;
   - **Rue** : le nom de la rue en français, en néerlandais ou en allemand, comme
     RecycleApp l'écrit (majuscules et accents sans importance) ;
   - **Numéro** : votre numéro de maison.
3. Appuyez sur **Tester la connexion** : la réponse donne l'adresse trouvée, les
   types de déchets et la prochaine collecte.
4. Dans l'onglet **Découverte**, ajoutez les appareils qui vous intéressent.

Vous ne trouvez pas votre rue ? Utilisez **Chercher ma rue** : tapez une partie
du nom (par exemple `fer`), la réponse liste les rues que RecycleApp connaît
dans votre code postal. Recopiez le bon nom dans le champ **Rue**.

> Certaines communes (Bruxelles-Capitale notamment) ne publient pas leur
> calendrier sur RecycleApp. Si **Tester la connexion** ne trouve aucune
> collecte, vérifiez sur recycleapp.be que votre adresse y a un calendrier.

## Réglages

| Réglage                                  | Par défaut | Rôle                                                                                    |
| ---------------------------------------- | ---------- | --------------------------------------------------------------------------------------- |
| Langue des types de déchets              | Français   | Langue des noms d'appareils, de leurs états et des variables de scène (fr, nl, de, en). |
| Heure du rappel (la veille)              | 19:00      | Heure belge du déclencheur « Collecte des déchets demain ».                             |
| Heure du déclencheur du jour de collecte | 07:00      | Heure belge du déclencheur « Collecte des déchets aujourd'hui ».                        |
| Jours lus à l'avance                     | 60         | Jusqu'où le calendrier est lu (7 à 365 jours).                                          |
| Intervalle de rafraîchissement (h)       | 12         | Heures entre deux lectures de RecycleApp (1 à 48).                                      |

Les heures s'écrivent `19:00`, `19h00` ou `7:00`.

## Appareils

- **Prochaine collecte des déchets** (résumé) :
  - _Jours avant la collecte_ : 0 = aujourd'hui, 1 = demain… ;
  - _Jour de collecte_ : par exemple « vendredi 23 octobre » ;
  - _Déchets collectés_ : par exemple « PMC et Papiers-cartons ».
- **Collecte PMC**, **Collecte Papiers-cartons**… (un par type de déchet) :
  - _Jours avant la collecte_ ;
  - _Jour de collecte_.

Un type de déchet sans collecte dans la période lue (par exemple les sapins de
Noël en été) affiche **-1** et « Aucune collecte prévue ».

Les valeurs changent à minuit (heure belge). Si RecycleApp ne répond plus, le
dernier calendrier lu reste utilisé : le badge cloud passe en mode dégradé
(point orange) et indique la date de la dernière lecture.

## Scènes

### Déclencheurs

| Déclencheur                           | Quand                                                      | Variables                    |
| ------------------------------------- | ---------------------------------------------------------- | ---------------------------- |
| Collecte des déchets demain           | La veille, à l'heure du rappel, une fois pour tout le jour | `fractions`, `count`, `date` |
| Un type de déchet est collecté demain | La veille, à l'heure du rappel, pour le type choisi        | `fraction`, `date`           |
| Collecte des déchets aujourd'hui      | Le matin, à l'heure choisie, une fois pour tout le jour    | `fractions`, `count`, `date` |

Exemple : « Collecte des déchets demain » → envoyer un message
`Demain : {{triggerEvent.data.fractions}}, pensez à sortir les poubelles !`

Chaque déclencheur ne part qu'une fois par jour, même après un redémarrage. Si
Gladys ou l'intégration redémarre après l'heure prévue, le déclencheur part
quand même, jusqu'à 4 heures plus tard.

### Actions

- **Obtenir la prochaine collecte** : pour un type de déchet (ou tous si le champ
  est vide), renvoie `found`, `days` (-1 si aucune), `date` (AAAA-MM-JJ) et
  `fractions`. Les actions et conditions suivantes peuvent les utiliser.
- **Relire le calendrier des collectes** : interroge RecycleApp tout de suite et
  renvoie `collections`, `next_date` et `next_fractions`.

## Widget du tableau de bord

Le widget **Collectes des déchets** affiche la prochaine collecte, la liste des
suivantes avec leur logo RecycleApp et le nombre de jours restants, l'adresse et
la date de la dernière lecture. Le bouton **Actualiser** relit le calendrier.
Réglage : nombre de collectes affichées (1 à 8). Les types de déchets sont
nommés dans la langue de chaque utilisateur quand RecycleApp la propose.

## Dépannage

- **« RecycleApp ne connaît pas le code postal »** : vérifiez le code postal.
- **« Aucune rue … »** ou **« Plusieurs rues correspondent »** : utilisez
  **Chercher ma rue** et recopiez le nom exact.
- **Aucune collecte** : vérifiez le numéro, ou que votre commune publie son
  calendrier sur RecycleApp.
- **« Impossible de lire RecycleApp »** : RecycleApp ou Internet ne répond pas.
  L'intégration réessaie toutes les 15 minutes et garde le dernier calendrier.

Le calendrier lu et les déclencheurs déjà envoyés sont gardés dans `/data`, le
seul dossier où le conteneur peut écrire.
