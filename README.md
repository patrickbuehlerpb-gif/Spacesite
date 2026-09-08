# KOSMOS – Eine Reise durch echte Daten des Universums

Interaktive Website über das Universum: fliegen durch **109’400 echte Sterne**, **43’000 Galaxien** und **tausende Exoplaneten**,
das **Sonnensystem in Echtzeit**, ein **kosmischer Zoom** von der Erde bis zum Rand des beobachtbaren Universums, eine
**Zeitreise** vom Urknall in die ferne Zukunft und ein **Live-Dashboard** (ISS, Starts, Menschen im All, Weltraumwetter, Asteroiden).

Alle Positionen, Helligkeiten und Entfernungen stammen aus öffentlichen wissenschaftlichen Katalogen. Live-Daten werden direkt
im Browser abgerufen – es gibt kein Backend.

## Kapitel

| Route              | Kapitel            | Daten                                                        |
|--------------------|--------------------|--------------------------------------------------------------|
| `#/`               | Start              | echter Nachthimmel (HYG), Live-Ticker                        |
| `#/sterne`         | Sternenflug        | HYG v4.1 (Hipparcos/Gliese/Yale), Sternbildlinien (Stellarium) |
| `#/sonnensystem`   | Sonnensystem       | NASA/JPL Keplerelemente, JPL SBDB                            |
| `#/exoplaneten`    | Fremde Welten      | Open Exoplanet Catalogue (nächtlich aktualisiert)            |
| `#/galaxien`       | Das kosmische Netz | 2MASS Redshift Survey (Huchra et al. 2012), OpenNGC          |
| `#/zoom`           | Kosmischer Zoom    | alle obigen Kataloge, prozedurale Milchstrasse & CMB         |
| `#/zeit`           | Zeitreise          | kuratierte Ereignisse mit Standardwerten                     |
| `#/live`           | Gerade jetzt       | wheretheiss.at, Launch Library 2, NOAA SWPC, NASA APIs, SDO, Sen |

## Entwicklung

```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck    # tsc --noEmit
npm run build        # → dist/ (statisch, überall hostbar)
npm run preview      # Vorschau des Builds
npm run data         # Datensätze aus den Rohquellen neu bauen (lädt raw/ automatisch herunter)
node scripts/shot.mjs "#/sterne" shots/stars.png --wait 2500   # Headless-Screenshot + Smoke-Test (WebGL via SwiftShader)
node scripts/check-all.mjs                                     # alle Routen durchtesten
```

Architektur, Datenformate und Konventionen: [`ARCHITECTURE.md`](./ARCHITECTURE.md). Kapitel-Spezifikationen: [`docs/briefs/`](./docs/briefs/).

## Deployment

Die Seite ist ein statischer Build mit Hash-Routing (`base: './'`), also ohne Server-Konfiguration hostbar:

* **GitHub Pages**: Der Workflow [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) baut bei jedem Push auf `main`
  und veröffentlicht `dist/`. In den Repo-Einstellungen unter *Pages* die Quelle „GitHub Actions“ wählen.
* **Vercel / Netlify / Cloudflare Pages**: Framework „Vite“, Build `npm run build`, Output `dist`.

### NASA-API-Key (optional)

Asteroiden und das Bild des Tages nutzen `DEMO_KEY` (30 Anfragen/Stunde pro IP). Im Live-Kapitel kann unter „Einstellungen“ ein
eigener kostenloser Key von <https://api.nasa.gov> hinterlegt werden (wird nur lokal im Browser gespeichert).

## Datenquellen & Lizenzen

* HYG Stellar Database v4.1 – David Nash, CC BY-SA 4.0 · <https://github.com/astronexus/HYG-Database>
* 2MASS Redshift Survey – Huchra et al. 2012, ApJS 199, 26 · <http://tdc-www.harvard.edu/2mrs/>
* Open Exoplanet Catalogue – Hanno Rein et al., MIT · <https://github.com/OpenExoplanetCatalogue/open_exoplanet_catalogue>
* OpenNGC – Mattia Verga, CC BY-SA 4.0 · <https://github.com/mattiaverga/OpenNGC>
* Sternbildlinien – Stellarium (modern sky culture), CC BY-SA 4.0
* Bahnelemente – NASA/JPL „Keplerian Elements for Approximate Positions of the Major Planets“; Zwergplaneten/Komet: JPL SBDB (Näherung)
* Erd- und Mondtexturen – NASA Blue Marble via three.js (MIT)
* Live: wheretheiss.at · The Space Devs (Launch Library 2) · NOAA SWPC · NASA Open APIs · NASA SDO · Sen (YouTube)
* Technik: three.js, Vite, TypeScript, Playwright (Tests), Schriften Manrope & Instrument Serif (OFL)
