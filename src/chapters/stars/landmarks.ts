/**
 * Hard-coded landmarks (J2000 RA/Dec in degrees, distance in parsecs) and the "famous stars" list.
 * Landmarks of kind 'star' point at a catalogue star by its HYG proper name; the others get a soft sprite.
 */
export type LandmarkKind = 'nebula' | 'cluster' | 'globular' | 'remnant' | 'core' | 'system' | 'star';

export interface Landmark {
  id: string;
  name: { de: string; en: string };
  kind: LandmarkKind;
  ra: number;
  dec: number;
  distPc: number;
  /** sprite diameter in parsecs (0 = label only) */
  size: number;
  /** CSS token for the sprite colour */
  color: string;
  blurb: { de: string; en: string };
  /** HYG proper name of the catalogue star this landmark stands for */
  star?: string;
}

export const LANDMARKS: Landmark[] = [
  {
    id: 'm42', name: { de: 'Orionnebel (M42)', en: 'Orion Nebula (M42)' }, kind: 'nebula',
    ra: 83.822, dec: -5.391, distPc: 412, size: 9, color: '--rose',
    blurb: {
      de: 'Die nächste grosse Sternentstehungsregion. Im Zentrum das Trapez: vier junge, heisse Sterne, die das Gas zum Leuchten bringen. Rund 24 Lichtjahre gross, mit blossem Auge als Fleck im Schwert des Orion sichtbar.',
      en: 'The nearest large star-forming region. At its heart the Trapezium: four young, hot stars that make the gas glow. About 24 light-years across, visible to the naked eye as a smudge in Orion’s sword.',
    },
  },
  {
    id: 'm45', name: { de: 'Plejaden (M45)', en: 'Pleiades (M45)' }, kind: 'cluster',
    ra: 56.85, dec: 24.117, distPc: 136, size: 5, color: '--cyan',
    blurb: {
      de: 'Das Siebengestirn: ein offener Sternhaufen aus rund 1’000 Sternen, nur etwa 100 Millionen Jahre alt. Die hellen blauen Mitglieder sind von einem Staubschleier umgeben, der ihr Licht reflektiert.',
      en: 'The Seven Sisters: an open cluster of about 1,000 stars, only some 100 million years old. Its bright blue members are wrapped in a veil of dust that reflects their light.',
    },
  },
  {
    id: 'hyades', name: { de: 'Hyaden', en: 'Hyades' }, kind: 'cluster',
    ra: 66.75, dec: 15.87, distPc: 47, size: 6, color: '--gold',
    blurb: {
      de: 'Der nächste offene Sternhaufen, 153 Lichtjahre entfernt und 625 Millionen Jahre alt. Er bildet das V des Stierkopfs – Aldebaran steht nur zufällig davor, auf halbem Weg.',
      en: 'The nearest open cluster, 153 light-years away and 625 million years old. It forms the V of the Bull’s head – Aldebaran merely sits in front of it, halfway along the line of sight.',
    },
  },
  {
    id: 'sgra', name: { de: 'Galaktisches Zentrum (Sgr A*)', en: 'Galactic centre (Sgr A*)' }, kind: 'core',
    ra: 266.417, dec: -29.008, distPc: 8200, size: 700, color: '--gold',
    blurb: {
      de: 'Das Zentrum der Milchstrasse: ein Schwarzes Loch mit vier Millionen Sonnenmassen, 26’700 Lichtjahre entfernt – weit ausserhalb dieses Katalogs. Sterne umkreisen es mit bis zu 8’000 km/s.',
      en: 'The centre of the Milky Way: a black hole of four million solar masses, 26,700 light-years away – far outside this catalogue. Stars orbit it at up to 8,000 km/s.',
    },
  },
  {
    id: 'm1', name: { de: 'Krebsnebel (M1)', en: 'Crab Nebula (M1)' }, kind: 'remnant',
    ra: 83.633, dec: 22.015, distPc: 2000, size: 4, color: '--rose',
    blurb: {
      de: 'Überrest einer Supernova, die im Jahr 1054 monatelang am Taghimmel stand. Im Zentrum rotiert ein Neutronenstern 30-mal pro Sekunde und treibt die Gaswolke an, die sich mit 1’500 km/s ausdehnt.',
      en: 'Remnant of a supernova that stood in the daytime sky for months in the year 1054. At its centre a neutron star spins 30 times a second, powering a gas cloud expanding at 1,500 km/s.',
    },
  },
  {
    id: 'omegacen', name: { de: 'Omega Centauri', en: 'Omega Centauri' }, kind: 'globular',
    ra: 201.697, dec: -47.48, distPc: 5200, size: 50, color: '--gold-2',
    blurb: {
      de: 'Der grösste Kugelsternhaufen der Milchstrasse: zehn Millionen Sterne, zwölf Milliarden Jahre alt. Vermutlich der Kern einer Zwerggalaxie, die unsere Galaxie einst verschluckt hat.',
      en: 'The largest globular cluster of the Milky Way: ten million stars, twelve billion years old. Probably the core of a dwarf galaxy that our Galaxy swallowed long ago.',
    },
  },
  {
    id: 'alphacen', name: { de: 'Alpha-Centauri-System', en: 'Alpha Centauri system' }, kind: 'system',
    ra: 219.9, dec: -60.834, distPc: 1.325, size: 0, color: '--gold', star: 'Rigil Kentaurus',
    blurb: {
      de: 'Das nächste Sternsystem: Rigil Kentaurus und Toliman, zwei sonnenähnliche Sterne, umkreisen sich alle 80 Jahre. Proxima, ein roter Zwerg, gehört in weitem Abstand dazu – und besitzt einen Planeten.',
      en: 'The nearest star system: Rigil Kentaurus and Toliman, two Sun-like stars, orbit each other every 80 years. Proxima, a red dwarf, belongs to the system at a wide distance – and has a planet.',
    },
  },
  {
    id: 'barnard', name: { de: 'Barnards Pfeilstern', en: 'Barnard’s Star' }, kind: 'star',
    ra: 269.452, dec: 4.693, distPc: 1.83, size: 0, color: '--rose', star: "Barnard's Star",
    blurb: {
      de: 'Der Stern mit der grössten Eigenbewegung am Himmel: 10,3 Bogensekunden pro Jahr – in 180 Jahren wandert er um einen Vollmonddurchmesser. Ein roter Zwerg mit einem Sechstel der Sonnenmasse.',
      en: 'The star with the largest proper motion in the sky: 10.3 arcseconds per year – it drifts a full Moon’s width in 180 years. A red dwarf with a sixth of the Sun’s mass.',
    },
  },
];

export interface FamousStar {
  /** HYG proper name (or 'Sun') */
  name: string;
  /** localized label; defaults to the HYG name */
  label?: { de: string; en: string };
  sun?: boolean;
}

export const FAMOUS: FamousStar[] = [
  { name: 'Sirius' },
  { name: 'Rigil Kentaurus', label: { de: 'Alpha Centauri', en: 'Alpha Centauri' } },
  { name: 'Proxima Centauri' },
  { name: 'Betelgeuse', label: { de: 'Beteigeuze', en: 'Betelgeuse' } },
  { name: 'Rigel' },
  { name: 'Vega', label: { de: 'Wega', en: 'Vega' } },
  { name: 'Polaris' },
  { name: 'Antares' },
  { name: 'Deneb' },
  { name: 'Aldebaran' },
  { name: 'Arcturus', label: { de: 'Arktur', en: 'Arcturus' } },
  { name: 'Canopus' },
  { name: 'Achernar' },
  { name: "Barnard's Star", label: { de: 'Barnards Pfeilstern', en: 'Barnard’s Star' } },
  { name: 'UY Scuti' },
  { name: 'Sun', label: { de: 'Sonne', en: 'Sun' }, sun: true },
];

/** Lower-case aliases (German names, common spellings) → HYG proper name. */
export const ALIASES: Record<string, string> = {
  beteigeuze: 'Betelgeuse',
  wega: 'Vega',
  arktur: 'Arcturus',
  'barnards pfeilstern': "Barnard's Star",
  'barnards star': "Barnard's Star",
  'alpha centauri': 'Rigil Kentaurus',
  'alpha centauri a': 'Rigil Kentaurus',
  'alpha centauri b': 'Toliman',
  proxima: 'Proxima Centauri',
  polarstern: 'Polaris',
  'alpha cma': 'Sirius',
  sonne: 'Sun',
  sun: 'Sun',
  sol: 'Sun',
};

/** Localized display name for a HYG proper name (falls back to the HYG name). */
export function localStarName(hygName: string, lang: 'de' | 'en'): string {
  const f = FAMOUS.find((s) => s.name === hygName);
  return f?.label?.[lang] ?? hygName;
}
