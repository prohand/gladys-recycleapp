# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

## [Unreleased]

## [1.0.1] - 2026-10-21

### Added

- RecycleApp waste collection calendar for a Belgian address (zip code, street, house number), read from the public RecycleApp API: no account, no key.
- "Test the connection" and "Find my street" actions in the Configuration screen.
- Devices: "Next waste collection" (days left, day, waste types) and one device per waste type (days left, day), named in French, Dutch, German or English.
- Scene triggers: "Waste collection tomorrow" (the evening before), "A given waste type is collected tomorrow" and "Waste collection today" (the morning), fired once a day and remembered across restarts.
- Scene actions: "Get the next waste collection" and "Read the waste calendar again".
- "Waste collections" dashboard widget with the RecycleApp logos, the days left and a refresh button.
- Cloud transport badge, degraded while the last calendar read is served because RecycleApp does not answer.
- English, French, German and Spanish texts and documentation.

[Unreleased]: https://github.com/prohand/gladys-recycleapp/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/prohand/gladys-recycleapp/releases/tag/v1.0.1
