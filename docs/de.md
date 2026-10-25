# RecycleApp für Gladys Assistant

Diese Integration liest den Abfuhrkalender, den
[RecycleApp](https://www.recycleapp.be) (Fost Plus) für eine belgische Adresse
veröffentlicht, und macht ihn in Gladys nutzbar: Geräte, Szenen und ein
Dashboard-Widget.

Kein Konto, kein Schlüssel: Die Integration nutzt dieselbe öffentliche API wie
die Website recycleapp.be. Sie braucht nur Internetzugang (Badge **Cloud**).

## Installation

1. Installiere **RecycleApp** aus dem Integrationskatalog von Gladys (Gladys 5.3.0 oder neuer).
2. Fülle unter **Konfiguration** aus:
   - **Postleitzahl**: zum Beispiel `4700`;
   - **Straße**: der Straßenname auf Französisch, Niederländisch oder Deutsch,
     so wie RecycleApp ihn schreibt (Groß-/Kleinschreibung und Akzente egal);
   - **Hausnummer**.
3. Drücke **Verbindung testen**: Die Antwort nennt die gefundene Adresse, die
   Abfallarten und die nächste Abholung.
4. Füge im Tab **Erkennung** die gewünschten Geräte hinzu.

Du findest deine Straße nicht? Nutze **Meine Straße suchen**: Gib einen Teil des
Namens ein (zum Beispiel `haupt`), die Antwort listet die Straßen auf, die
RecycleApp in deiner Postleitzahl kennt. Übernimm den richtigen Namen in das
Feld **Straße**.

> Manche Gemeinden (insbesondere Brüssel-Hauptstadt) veröffentlichen ihren
> Kalender nicht bei RecycleApp. Findet **Verbindung testen** keine Abholung,
> prüfe auf recycleapp.be, ob deine Adresse dort einen Kalender hat.

## Einstellungen

| Einstellung                          | Standard    | Wirkung                                                                           |
| ------------------------------------ | ----------- | --------------------------------------------------------------------------------- |
| Sprache der Abfallarten              | Französisch | Sprache der Gerätenamen, ihrer Zustände und der Szenenvariablen (fr, nl, de, en). |
| Uhrzeit der Erinnerung (am Vorabend) | 19:00       | Belgische Uhrzeit des Auslösers „Müllabholung morgen“.                            |
| Uhrzeit des Auslösers am Abholtag    | 07:00       | Belgische Uhrzeit des Auslösers „Müllabholung heute“.                             |
| Im Voraus gelesene Tage              | 60          | Wie weit im Voraus der Kalender gelesen wird (7 bis 365 Tage).                    |
| Aktualisierungsintervall (h)         | 12          | Stunden zwischen zwei Abfragen von RecycleApp (1 bis 48).                         |

Uhrzeiten werden `19:00`, `19h00` oder `7:00` geschrieben.

## Geräte

- **Nächste Müllabholung** (Übersicht):
  - _Tage bis zur Abholung_: 0 = heute, 1 = morgen…;
  - _Abholtag_: zum Beispiel „Freitag, 23. Oktober“;
  - _Abgeholter Müll_: zum Beispiel „PMK und Papier-Karton“.
- **Abholung PMK**, **Abholung Papier-Karton**… (eines pro Abfallart):
  - _Tage bis zur Abholung_;
  - _Abholtag_.

Eine Abfallart ohne Abholung im gelesenen Zeitraum (Weihnachtsbäume im Sommer)
zeigt **-1** und „Keine Abholung geplant“.

Die Werte ändern sich um Mitternacht (belgische Zeit). Antwortet RecycleApp
nicht mehr, wird der zuletzt gelesene Kalender weiter verwendet: Das
Cloud-Badge wechselt in den eingeschränkten Modus (oranger Punkt) und nennt das
Datum der letzten Abfrage.

## Szenen

### Auslöser

| Auslöser                            | Wann                                                   | Variablen                    |
| ----------------------------------- | ------------------------------------------------------ | ---------------------------- |
| Müllabholung morgen                 | Am Vorabend, zur Erinnerungszeit, einmal für den Tag   | `fractions`, `count`, `date` |
| Eine Abfallart wird morgen abgeholt | Am Vorabend, zur Erinnerungszeit, für die gewählte Art | `fraction`, `date`           |
| Müllabholung heute                  | Morgens, zur eingestellten Uhrzeit, einmal für den Tag | `fractions`, `count`, `date` |

Beispiel: „Müllabholung morgen“ → eine Nachricht senden
`Morgen: {{triggerEvent.data.fractions}}, Mülltonnen rausstellen!`

Jeder Auslöser löst einmal pro Tag aus, auch nach einem Neustart. Startet Gladys
oder die Integration nach der eingestellten Uhrzeit neu, löst er trotzdem aus,
bis zu 4 Stunden später.

### Aktionen

- **Nächste Müllabholung abrufen**: für eine Abfallart (oder alle, wenn das Feld
  leer ist) liefert sie `found`, `days` (-1 wenn keine), `date` (JJJJ-MM-TT) und
  `fractions` für die folgenden Aktionen und Bedingungen.
- **Abfuhrkalender neu lesen**: fragt RecycleApp sofort ab und liefert
  `collections`, `next_date` und `next_fractions`.

## Dashboard-Widget

Das Widget **Müllabholungen** zeigt die nächste Abholung, die folgenden mit
ihrem RecycleApp-Logo und den verbleibenden Tagen, die Adresse und das Datum der
letzten Abfrage. Die Schaltfläche **Aktualisieren** liest den Kalender neu.
Einstellung: Anzahl der angezeigten Abholungen (1 bis 8). Die Abfallarten werden
in der Sprache jedes Benutzers benannt, wenn RecycleApp sie anbietet.

## Fehlerbehebung

- **„RecycleApp kennt die Postleitzahl … nicht“**: Prüfe die Postleitzahl.
- **„Keine Straße …“** oder **„Mehrere Straßen passen“**: Nutze **Meine Straße
  suchen** und übernimm den genauen Namen.
- **Keine Abholung**: Prüfe die Hausnummer oder ob deine Gemeinde ihren Kalender
  bei RecycleApp veröffentlicht.
- **„RecycleApp konnte nicht gelesen werden“**: RecycleApp oder das Internet
  antwortet nicht. Die Integration versucht es alle 15 Minuten erneut und
  behält den letzten Kalender.

Der gelesene Kalender und die bereits gesendeten Auslöser werden in `/data`
gespeichert, dem einzigen Ordner, in den der Container schreiben darf.
