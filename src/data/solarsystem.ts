/**
 * Solar-system ephemeris + physical data.
 *
 * Planet positions: NASA/JPL "Keplerian Elements for Approximate Positions of the Major Planets"
 * (Table 1, valid 1800–2050, accuracy ~ arcminutes). Dwarf planets/comets: osculating elements
 * from JPL SBDB (approximate, fine for visualisation). Frame: **heliocentric ecliptic J2000**, unit AU,
 * x → vernal equinox, z → ecliptic north. Convert to the equatorial catalogue frame with eclToEq().
 */
import { KM_PER_AU } from '../core/units';

export type BodyId = 'sun' | 'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'pluto' | 'ceres' | 'eris' | 'makemake' | 'haumea' | 'halley' | 'moon' | 'voyager1' | 'voyager2' | 'newhorizons';
export type BodyKind = 'star' | 'planet' | 'dwarf' | 'comet' | 'moon' | 'probe';

/** JPL Table-1 style elements: value at J2000 + rate per Julian century. Angles in degrees. */
export interface JplElements { kind: 'jpl'; a: number; e: number; i: number; L: number; lp: number; node: number; da: number; de: number; di: number; dL: number; dlp: number; dnode: number }
/** Classic osculating elements at an epoch (JD). Angles in degrees, n = mean motion deg/day. */
export interface OscElements { kind: 'osc'; epoch: number; a: number; e: number; i: number; node: number; w: number; M: number; n: number }
/** Straight-line probe: direction (RA/Dec deg, equatorial) and heliocentric distance in AU at an epoch + AU/yr. */
export interface ProbeTrack { kind: 'probe'; ra: number; dec: number; epoch: number; dist: number; rate: number }

export interface Body {
  id: BodyId;
  kind: BodyKind;
  name: { de: string; en: string };
  elements?: JplElements | OscElements | ProbeTrack;
  radiusKm: number;
  massKg: number;
  /** sidereal rotation period in hours (negative = retrograde) */
  rotationH: number;
  axialTiltDeg: number;
  /** mean surface/cloud-top temperature in K */
  tempK: number;
  moons: number;
  /** orbital period in days */
  periodDays: number;
  gravity: number;   // m/s²
  /** display colour (hex) for dots/orbits */
  color: number;
  /** procedural look for the renderer */
  look: 'sun' | 'rocky-grey' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'ice' | 'comet' | 'moon' | 'probe';
  rings?: { inner: number; outer: number };  // in planet radii
  blurb: { de: string; en: string };
  facts: Array<{ de: string; en: string }>;
}

export const J2000 = 2451545.0;
export const OBLIQUITY = 23.43928 * Math.PI / 180;

export function julianDate(d: Date): number { return d.getTime() / 86400000 + 2440587.5; }
export function dateFromJD(jd: number): Date { return new Date((jd - 2440587.5) * 86400000); }

const D = Math.PI / 180;

function jpl(a: number, e: number, i: number, L: number, lp: number, node: number, da: number, de: number, di: number, dL: number, dlp: number, dnode: number): JplElements {
  return { kind: 'jpl', a, e, i, L, lp, node, da, de, di, dL, dlp, dnode };
}

// ---------------------------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------------------------
export const BODIES: Body[] = [
  {
    id: 'sun', kind: 'star', name: { de: 'Sonne', en: 'Sun' }, radiusKm: 695_700, massKg: 1.9885e30, rotationH: 609.12, axialTiltDeg: 7.25, tempK: 5772, moons: 0, periodDays: 0, gravity: 274, color: 0xffd27a, look: 'sun',
    blurb: { de: 'Ein durchschnittlicher gelber Zwergstern – und trotzdem 99,86 % der Masse des gesamten Sonnensystems. Ihr Licht braucht 8 Minuten und 20 Sekunden bis zur Erde.', en: 'An average yellow dwarf star – yet 99.86% of the mass of the entire solar system. Its light takes 8 minutes and 20 seconds to reach Earth.' },
    facts: [
      { de: 'Im Kern verschmelzen jede Sekunde 600 Millionen Tonnen Wasserstoff zu Helium.', en: 'Every second, 600 million tonnes of hydrogen fuse into helium in its core.' },
      { de: 'Ein Photon braucht bis zu 100’000 Jahre, um vom Kern an die Oberfläche zu gelangen.', en: 'A photon can take up to 100,000 years to travel from the core to the surface.' },
      { de: 'In etwa 5 Milliarden Jahren bläht sie sich zum Roten Riesen auf.', en: 'In about 5 billion years it will swell into a red giant.' },
    ],
  },
  {
    id: 'mercury', kind: 'planet', name: { de: 'Merkur', en: 'Mercury' }, radiusKm: 2439.7, massKg: 3.301e23, rotationH: 1407.6, axialTiltDeg: 0.034, tempK: 440, moons: 0, periodDays: 87.969, gravity: 3.7, color: 0xb5b0a8, look: 'rocky-grey',
    elements: jpl(0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593, 0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081),
    blurb: { de: 'Der kleinste und schnellste Planet: Ein Jahr dauert nur 88 Tage, ein Tag aber 176 Erdtage.', en: 'The smallest and fastest planet: a year lasts just 88 days, but a solar day lasts 176 Earth days.' },
    facts: [
      { de: 'Temperaturspanne von –180 °C nachts bis +430 °C tagsüber.', en: 'Temperatures swing from –180 °C at night to +430 °C by day.' },
      { de: 'In den Polkratern liegt trotz der Sonnennähe Wassereis.', en: 'Despite its closeness to the Sun, water ice hides in its polar craters.' },
    ],
  },
  {
    id: 'venus', kind: 'planet', name: { de: 'Venus', en: 'Venus' }, radiusKm: 6051.8, massKg: 4.867e24, rotationH: -5832.5, axialTiltDeg: 177.4, tempK: 737, moons: 0, periodDays: 224.701, gravity: 8.87, color: 0xe8c99a, look: 'venus',
    elements: jpl(0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255, 0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418),
    blurb: { de: 'Der heisseste Planet: Eine dichte CO₂-Atmosphäre mit Schwefelsäurewolken hält 464 °C fest – heiss genug, um Blei zu schmelzen.', en: 'The hottest planet: a dense CO₂ atmosphere with sulphuric-acid clouds traps 464 °C – hot enough to melt lead.' },
    facts: [
      { de: 'Sie dreht sich rückwärts – und ein Venustag ist länger als ein Venusjahr.', en: 'It spins backwards – and a Venus day is longer than a Venus year.' },
      { de: 'Der Luftdruck an der Oberfläche entspricht 900 m Tiefe im Ozean.', en: 'Surface pressure equals that 900 m deep in the ocean.' },
    ],
  },
  {
    id: 'earth', kind: 'planet', name: { de: 'Erde', en: 'Earth' }, radiusKm: 6371.0, massKg: 5.972e24, rotationH: 23.934, axialTiltDeg: 23.44, tempK: 288, moons: 1, periodDays: 365.256, gravity: 9.81, color: 0x6fb2ff, look: 'earth',
    elements: jpl(1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0, 0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0),
    blurb: { de: 'Der einzige bekannte Ort mit Leben. 71 % Wasseroberfläche, eine sauerstoffreiche Atmosphäre und ein Magnetfeld, das den Sonnenwind abhält.', en: 'The only known place with life. 71% water surface, an oxygen-rich atmosphere and a magnetic field that deflects the solar wind.' },
    facts: [
      { de: 'Die Erde rast mit 107’000 km/h um die Sonne.', en: 'Earth races around the Sun at 107,000 km/h.' },
      { de: 'Der Mond entfernt sich jedes Jahr um 3,8 cm.', en: 'The Moon drifts away by 3.8 cm every year.' },
    ],
  },
  {
    id: 'mars', kind: 'planet', name: { de: 'Mars', en: 'Mars' }, radiusKm: 3389.5, massKg: 6.417e23, rotationH: 24.623, axialTiltDeg: 25.19, tempK: 210, moons: 2, periodDays: 686.98, gravity: 3.71, color: 0xe07b4f, look: 'mars',
    elements: jpl(1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891, 0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343),
    blurb: { de: 'Der rote Planet: Eisenoxid-Staub, der höchste Vulkan des Sonnensystems (Olympus Mons, 22 km) und Spuren einstiger Flüsse und Seen.', en: 'The red planet: iron-oxide dust, the tallest volcano in the solar system (Olympus Mons, 22 km) and traces of ancient rivers and lakes.' },
    facts: [
      { de: 'Ein Marstag dauert 24 h 37 min – fast wie auf der Erde.', en: 'A Martian day lasts 24 h 37 min – almost like Earth’s.' },
      { de: 'Der Canyon Valles Marineris ist 4’000 km lang und bis 7 km tief.', en: 'The Valles Marineris canyon is 4,000 km long and up to 7 km deep.' },
    ],
  },
  {
    id: 'jupiter', kind: 'planet', name: { de: 'Jupiter', en: 'Jupiter' }, radiusKm: 69_911, massKg: 1.898e27, rotationH: 9.925, axialTiltDeg: 3.13, tempK: 165, moons: 97, periodDays: 4332.59, gravity: 24.79, color: 0xd9b48a, look: 'jupiter',
    elements: jpl(5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909, -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106),
    blurb: { de: 'Der Riese: 2,5-mal so schwer wie alle anderen Planeten zusammen. Der Grosse Rote Fleck ist ein Sturm, der seit mindestens 190 Jahren tobt.', en: 'The giant: 2.5 times the mass of all other planets combined. The Great Red Spot is a storm that has raged for at least 190 years.' },
    facts: [
      { de: 'Ein Tag dauert nur knapp 10 Stunden – der schnellste Rotator im Sonnensystem.', en: 'A day lasts just under 10 hours – the fastest spinner in the solar system.' },
      { de: 'Sein Mond Europa hat unter dem Eis mehr Wasser als alle Ozeane der Erde.', en: 'Its moon Europa hides more water beneath its ice than all of Earth’s oceans.' },
    ],
  },
  {
    id: 'saturn', kind: 'planet', name: { de: 'Saturn', en: 'Saturn' }, radiusKm: 58_232, massKg: 5.683e26, rotationH: 10.656, axialTiltDeg: 26.73, tempK: 134, moons: 274, periodDays: 10_759.22, gravity: 10.44, color: 0xe6d3a3, look: 'saturn', rings: { inner: 1.24, outer: 2.27 },
    elements: jpl(9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448, -0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794),
    blurb: { de: 'Der Ringplanet: Die Ringe sind 280’000 km breit, aber nur etwa 10 Meter dick – aus Eisbrocken von Staubkorn- bis Hausgrösse.', en: 'The ringed planet: the rings span 280,000 km but are only about 10 metres thick – ice chunks from dust grains to houses.' },
    facts: [
      { de: 'Saturn ist so leicht, dass er auf Wasser schwimmen würde (Dichte 0,69 g/cm³).', en: 'Saturn is so light it would float on water (density 0.69 g/cm³).' },
      { de: 'Sein Mond Titan hat Seen aus flüssigem Methan.', en: 'Its moon Titan has lakes of liquid methane.' },
    ],
  },
  {
    id: 'uranus', kind: 'planet', name: { de: 'Uranus', en: 'Uranus' }, radiusKm: 25_362, massKg: 8.681e25, rotationH: -17.24, axialTiltDeg: 97.77, tempK: 76, moons: 28, periodDays: 30_688.5, gravity: 8.87, color: 0x9fdcea, look: 'uranus', rings: { inner: 1.6, outer: 2.0 },
    elements: jpl(19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503, -0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589),
    blurb: { de: 'Der gekippte Planet: Uranus rollt mit 98° Achsneigung auf der Seite liegend um die Sonne – jeder Pol hat 42 Jahre Tag und 42 Jahre Nacht.', en: 'The tilted planet: Uranus rolls around the Sun on its side at 98° tilt – each pole gets 42 years of day and 42 years of night.' },
    facts: [
      { de: 'Der kälteste Planet: bis –224 °C.', en: 'The coldest planet: down to –224 °C.' },
      { de: 'Nur eine Sonde hat ihn je besucht: Voyager 2 im Jahr 1986.', en: 'Only one probe has ever visited: Voyager 2 in 1986.' },
    ],
  },
  {
    id: 'neptune', kind: 'planet', name: { de: 'Neptun', en: 'Neptune' }, radiusKm: 24_622, massKg: 1.024e26, rotationH: 16.11, axialTiltDeg: 28.32, tempK: 72, moons: 16, periodDays: 60_182, gravity: 11.15, color: 0x4f7bff, look: 'neptune',
    elements: jpl(30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574, 0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664),
    blurb: { de: 'Der äusserste Planet – rechnerisch entdeckt, bevor ihn jemand sah. Hier wehen die schnellsten Winde des Sonnensystems: 2’100 km/h.', en: 'The outermost planet – predicted by mathematics before anyone saw it. Home to the fastest winds in the solar system: 2,100 km/h.' },
    facts: [
      { de: 'Seit seiner Entdeckung 1846 hat Neptun erst eine Sonnenumrundung vollendet (2011).', en: 'Since its discovery in 1846, Neptune has completed only one orbit (in 2011).' },
      { de: 'Sein Mond Triton umkreist ihn rückwärts – vermutlich ein eingefangenes Kuipergürtel-Objekt.', en: 'Its moon Triton orbits backwards – probably a captured Kuiper-belt object.' },
    ],
  },
  {
    id: 'pluto', kind: 'dwarf', name: { de: 'Pluto', en: 'Pluto' }, radiusKm: 1188.3, massKg: 1.303e22, rotationH: -153.3, axialTiltDeg: 122.5, tempK: 44, moons: 5, periodDays: 90_560, gravity: 0.62, color: 0xd8c4b0, look: 'ice',
    elements: jpl(39.48211675, 0.24882730, 17.14001206, 238.92903833, 224.06891629, 110.30393684, -0.00031596, 0.00005170, 0.00004818, 145.20780515, -0.04062942, -0.01183482),
    blurb: { de: 'Der berühmteste Zwergplanet: Stickstoffeis-Gletscher, ein herzförmiges Becken und fünf Monde. New Horizons flog 2015 vorbei.', en: 'The most famous dwarf planet: nitrogen-ice glaciers, a heart-shaped basin and five moons. New Horizons flew past in 2015.' },
    facts: [
      { de: 'Seine Bahn ist so exzentrisch, dass er von 1979 bis 1999 näher an der Sonne war als Neptun.', en: 'Its orbit is so eccentric that from 1979 to 1999 it was closer to the Sun than Neptune.' },
      { de: 'Sein Mond Charon ist halb so gross wie Pluto selbst.', en: 'Its moon Charon is half the size of Pluto itself.' },
    ],
  },
  {
    id: 'ceres', kind: 'dwarf', name: { de: 'Ceres', en: 'Ceres' }, radiusKm: 469.7, massKg: 9.38e20, rotationH: 9.07, axialTiltDeg: 4, tempK: 167, moons: 0, periodDays: 1680, gravity: 0.28, color: 0xa8a39a, look: 'rocky-grey',
    elements: { kind: 'osc', epoch: 2458600.5, a: 2.7691651, e: 0.0760091, i: 10.594067, node: 80.305532, w: 73.597695, M: 77.372096, n: 0.2140 },
    blurb: { de: 'Der grösste Körper im Asteroidengürtel und der einzige Zwergplanet im inneren Sonnensystem. Unter der Kruste: salziges Wasser.', en: 'The largest body in the asteroid belt and the only dwarf planet in the inner solar system. Beneath the crust: salty water.' },
    facts: [{ de: 'Ceres enthält ein Drittel der Masse des gesamten Asteroidengürtels.', en: 'Ceres holds a third of the mass of the entire asteroid belt.' }],
  },
  {
    id: 'eris', kind: 'dwarf', name: { de: 'Eris', en: 'Eris' }, radiusKm: 1163, massKg: 1.66e22, rotationH: 378, axialTiltDeg: 78, tempK: 42, moons: 1, periodDays: 204_200, gravity: 0.82, color: 0xe0e6ee, look: 'ice',
    elements: { kind: 'osc', epoch: 2459000.5, a: 67.864, e: 0.4358, i: 44.04, node: 35.95, w: 151.64, M: 205.99, n: 0.001764 },
    blurb: { de: 'Der Zwergplanet, der Pluto den Planetenstatus kostete: fast gleich gross, aber 27 % schwerer – und fast dreimal weiter weg.', en: 'The dwarf planet that cost Pluto its planet status: almost the same size but 27% heavier – and nearly three times farther out.' },
    facts: [{ de: 'Ein Eris-Jahr dauert 559 Erdjahre.', en: 'A year on Eris lasts 559 Earth years.' }],
  },
  {
    id: 'makemake', kind: 'dwarf', name: { de: 'Makemake', en: 'Makemake' }, radiusKm: 715, massKg: 3.1e21, rotationH: 22.8, axialTiltDeg: 0, tempK: 40, moons: 1, periodDays: 111_800, gravity: 0.4, color: 0xd9b6a0, look: 'ice',
    elements: { kind: 'osc', epoch: 2459000.5, a: 45.43, e: 0.161, i: 28.98, node: 79.62, w: 294.8, M: 165.5, n: 0.003221 },
    blurb: { de: 'Ein rötlicher Zwergplanet im Kuipergürtel, bedeckt mit gefrorenem Methan und Ethan.', en: 'A reddish dwarf planet in the Kuiper belt, covered in frozen methane and ethane.' },
    facts: [{ de: 'Benannt nach dem Schöpfergott der Rapa Nui (Osterinsel).', en: 'Named after the creator god of the Rapa Nui (Easter Island).' }],
  },
  {
    id: 'haumea', kind: 'dwarf', name: { de: 'Haumea', en: 'Haumea' }, radiusKm: 780, massKg: 4.0e21, rotationH: 3.9, axialTiltDeg: 0, tempK: 50, moons: 2, periodDays: 103_400, gravity: 0.4, color: 0xdfe4ea, look: 'ice',
    elements: { kind: 'osc', epoch: 2459000.5, a: 43.1, e: 0.196, i: 28.2, node: 122.2, w: 239.0, M: 218.2, n: 0.003483 },
    blurb: { de: 'Ein eiförmiger Zwergplanet, der sich alle vier Stunden einmal dreht – so schnell, dass er in die Länge gezogen wird. Er hat sogar einen Ring.', en: 'An egg-shaped dwarf planet spinning once every four hours – so fast it is stretched out. It even has a ring.' },
    facts: [{ de: 'Der schnellste Rotator unter den grossen Körpern des Sonnensystems.', en: 'The fastest rotator among the large bodies of the solar system.' }],
  },
  {
    id: 'halley', kind: 'comet', name: { de: 'Halleyscher Komet', en: 'Halley’s Comet' }, radiusKm: 5.5, massKg: 2.2e14, rotationH: 52.8, axialTiltDeg: 0, tempK: 0, moons: 0, periodDays: 27_510, gravity: 0.0004, color: 0xbfe8ff, look: 'comet',
    elements: { kind: 'osc', epoch: 2446470.96, a: 17.834, e: 0.96714, i: 162.26, node: 58.42, w: 111.33, M: 0, n: 0.013086 },
    blurb: { de: 'Der berühmteste Komet: alle 75–76 Jahre kommt er zurück. Zuletzt 1986, das nächste Mal im Sommer 2061.', en: 'The most famous comet: it returns every 75–76 years. Last seen in 1986, next due in summer 2061.' },
    facts: [{ de: 'Seine Bahn ist rückläufig und reicht von innerhalb der Venusbahn bis hinter Neptun.', en: 'Its retrograde orbit stretches from inside Venus’s orbit to beyond Neptune.' }],
  },
  {
    id: 'moon', kind: 'moon', name: { de: 'Mond', en: 'Moon' }, radiusKm: 1737.4, massKg: 7.346e22, rotationH: 655.7, axialTiltDeg: 6.68, tempK: 250, moons: 0, periodDays: 27.32, gravity: 1.62, color: 0xcfcfcf, look: 'moon',
    blurb: { de: 'Unser Begleiter, entstanden aus einer gigantischen Kollision vor 4,5 Milliarden Jahren. 384’400 km entfernt – Licht braucht 1,3 Sekunden.', en: 'Our companion, born from a giant collision 4.5 billion years ago. 384,400 km away – light takes 1.3 seconds.' },
    facts: [{ de: '12 Menschen haben ihn betreten – zuletzt 1972.', en: '12 people have walked on it – the last in 1972.' }],
  },
  {
    id: 'voyager1', kind: 'probe', name: { de: 'Voyager 1', en: 'Voyager 1' }, radiusKm: 0.002, massKg: 825, rotationH: 0, axialTiltDeg: 0, tempK: 0, moons: 0, periodDays: 0, gravity: 0, color: 0xffffff, look: 'probe',
    elements: { kind: 'probe', ra: 258.3, dec: 12.1, epoch: 2461041.5, dist: 169.5, rate: 3.57 },
    blurb: { de: 'Das am weitesten entfernte Menschenwerk. Gestartet 1977, seit 2012 im interstellaren Raum. Ein Funksignal braucht über 23 Stunden bis zur Erde.', en: 'The most distant human-made object. Launched in 1977, in interstellar space since 2012. A radio signal takes over 23 hours to reach Earth.' },
    facts: [{ de: 'An Bord: die Goldene Schallplatte mit Grüssen in 55 Sprachen.', en: 'On board: the Golden Record with greetings in 55 languages.' }],
  },
  {
    id: 'voyager2', kind: 'probe', name: { de: 'Voyager 2', en: 'Voyager 2' }, radiusKm: 0.002, massKg: 825, rotationH: 0, axialTiltDeg: 0, tempK: 0, moons: 0, periodDays: 0, gravity: 0, color: 0xffffff, look: 'probe',
    elements: { kind: 'probe', ra: 300.0, dec: -58.5, epoch: 2461041.5, dist: 142.2, rate: 3.23 },
    blurb: { de: 'Die einzige Sonde, die Uranus und Neptun besucht hat. Seit 2018 im interstellaren Raum.', en: 'The only probe ever to visit Uranus and Neptune. In interstellar space since 2018.' },
    facts: [{ de: 'Sie startete 16 Tage vor Voyager 1 – ist aber langsamer.', en: 'It launched 16 days before Voyager 1 – but is slower.' }],
  },
  {
    id: 'newhorizons', kind: 'probe', name: { de: 'New Horizons', en: 'New Horizons' }, radiusKm: 0.002, massKg: 478, rotationH: 0, axialTiltDeg: 0, tempK: 0, moons: 0, periodDays: 0, gravity: 0, color: 0xffffff, look: 'probe',
    elements: { kind: 'probe', ra: 290.3, dec: -21.5, epoch: 2461041.5, dist: 64.4, rate: 2.93 },
    blurb: { de: 'Flog 2015 an Pluto und 2019 am Kuipergürtel-Objekt Arrokoth vorbei – dem fernsten je besuchten Himmelskörper.', en: 'Flew past Pluto in 2015 and the Kuiper-belt object Arrokoth in 2019 – the most distant world ever visited.' },
    facts: [{ de: 'Beim Start 2006 die schnellste je gestartete Sonde: 58’000 km/h.', en: 'At launch in 2006 the fastest probe ever launched: 58,000 km/h.' }],
  },
];

export const BODY_BY_ID: Record<string, Body> = Object.fromEntries(BODIES.map((b) => [b.id, b]));
export const PLANET_IDS: BodyId[] = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

// ---------------------------------------------------------------------------------------------
// Ephemeris
// ---------------------------------------------------------------------------------------------
export interface Vec3 { x: number; y: number; z: number }

function solveKepler(Mdeg: number, e: number): number {
  // returns eccentric anomaly in radians (JPL iteration scheme)
  const M = ((Mdeg % 360) + 360) % 360 * D;
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 30; k++) {
    const dM = M - (E - e * Math.sin(E));
    const dE = dM / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

function orbitalToEcliptic(a: number, e: number, iDeg: number, nodeDeg: number, wDeg: number, E: number): Vec3 {
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const i = iDeg * D, O = nodeDeg * D, w = wDeg * D;
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i);
  return {
    x: (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp,
    y: (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp,
    z: (sw * si) * xp + (cw * si) * yp,
  };
}

/** Heliocentric ecliptic position (AU) of a body at a Julian date. Sun → origin. Moon → Earth + geocentric Moon. */
export function bodyPosition(id: BodyId, jd: number): Vec3 {
  const b = BODY_BY_ID[id];
  if (!b || id === 'sun') return { x: 0, y: 0, z: 0 };
  if (id === 'moon') { const e = bodyPosition('earth', jd); const m = moonGeocentric(jd); return { x: e.x + m.x / KM_PER_AU, y: e.y + m.y / KM_PER_AU, z: e.z + m.z / KM_PER_AU }; }
  const el = b.elements!;
  if (el.kind === 'jpl') {
    const T = (jd - J2000) / 36525;
    const a = el.a + el.da * T, e = el.e + el.de * T, i = el.i + el.di * T;
    const L = el.L + el.dL * T, lp = el.lp + el.dlp * T, node = el.node + el.dnode * T;
    const w = lp - node;
    const M = L - lp;
    return orbitalToEcliptic(a, e, i, node, w, solveKepler(M, e));
  }
  if (el.kind === 'osc') {
    const M = el.M + el.n * (jd - el.epoch);
    return orbitalToEcliptic(el.a, el.e, el.i, el.node, el.w, solveKepler(M, el.e));
  }
  // probe: straight line from the Sun in a fixed direction
  const dist = el.dist + el.rate * (jd - el.epoch) / 365.25;
  const eq = { x: Math.cos(el.dec * D) * Math.cos(el.ra * D), y: Math.cos(el.dec * D) * Math.sin(el.ra * D), z: Math.sin(el.dec * D) };
  const ec = eqToEcl(eq);
  return { x: ec.x * dist, y: ec.y * dist, z: ec.z * dist };
}

/** Sample a full orbit (AU) for drawing. Probes/sun return []. */
export function orbitPath(id: BodyId, jd: number, segments = 256): Vec3[] {
  const b = BODY_BY_ID[id];
  if (!b?.elements || b.elements.kind === 'probe') return [];
  const out: Vec3[] = [];
  const el = b.elements;
  if (el.kind === 'jpl') {
    const T = (jd - J2000) / 36525;
    const a = el.a + el.da * T, e = el.e + el.de * T, i = el.i + el.di * T;
    const lp = el.lp + el.dlp * T, node = el.node + el.dnode * T;
    for (let k = 0; k <= segments; k++) out.push(orbitalToEcliptic(a, e, i, node, lp - node, (k / segments) * Math.PI * 2));
  } else {
    for (let k = 0; k <= segments; k++) out.push(orbitalToEcliptic(el.a, el.e, el.i, el.node, el.w, (k / segments) * Math.PI * 2));
  }
  return out;
}

/**
 * Geocentric ecliptic position of the Moon in km (Paul Schlyter's simplified theory, ~0.1° accuracy).
 */
export function moonGeocentric(jd: number): Vec3 {
  const d = jd - 2451543.5;
  const N = (125.1228 - 0.0529538083 * d) * D;
  const i = 5.1454 * D;
  const w = (318.0634 + 0.1643573223 * d) * D;
  const a = 60.2666; // Earth radii
  const e = 0.054900;
  const M = (115.3654 + 13.0649929509 * d) * D;
  // Sun's mean anomaly & longitude (for perturbations)
  const Ms = (356.0470 + 0.9856002585 * d) * D;
  const ws = (282.9404 + 4.70935e-5 * d) * D;
  const Ls = Ms + ws;
  let E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
  for (let k = 0; k < 10; k++) E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xv = a * (Math.cos(E) - e), yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const v = Math.atan2(yv, xv), r = Math.hypot(xv, yv);
  const xh = r * (Math.cos(N) * Math.cos(v + w) - Math.sin(N) * Math.sin(v + w) * Math.cos(i));
  const yh = r * (Math.sin(N) * Math.cos(v + w) + Math.cos(N) * Math.sin(v + w) * Math.cos(i));
  const zh = r * (Math.sin(v + w) * Math.sin(i));
  let lon = Math.atan2(yh, xh), lat = Math.atan2(zh, Math.hypot(xh, yh));
  // main perturbations
  const Lm = N + w + M, Dm = Lm - Ls, F = Lm - N;
  lon += (-1.274 * Math.sin(M - 2 * Dm) + 0.658 * Math.sin(2 * Dm) - 0.186 * Math.sin(Ms) - 0.059 * Math.sin(2 * M - 2 * Dm) - 0.057 * Math.sin(M - 2 * Dm + Ms) + 0.053 * Math.sin(M + 2 * Dm) + 0.046 * Math.sin(2 * Dm - Ms) + 0.041 * Math.sin(M - Ms) - 0.035 * Math.sin(Dm) - 0.031 * Math.sin(M + Ms) - 0.015 * Math.sin(2 * F - 2 * Dm) + 0.011 * Math.sin(M - 4 * Dm)) * D;
  lat += (-0.173 * Math.sin(F - 2 * Dm) - 0.055 * Math.sin(M - F - 2 * Dm) - 0.046 * Math.sin(M + F - 2 * Dm) + 0.033 * Math.sin(F + 2 * Dm) + 0.017 * Math.sin(2 * M + F)) * D;
  const rr = r - 0.58 * Math.cos(M - 2 * Dm) - 0.46 * Math.cos(2 * Dm);
  const km = rr * 6378.137;
  return { x: km * Math.cos(lat) * Math.cos(lon), y: km * Math.cos(lat) * Math.sin(lon), z: km * Math.sin(lat) };
}

/** Moon phase 0..1 (0 = new, 0.5 = full) and illuminated fraction. */
export function moonPhase(jd: number): { phase: number; illuminated: number } {
  const m = moonGeocentric(jd);
  const e = bodyPosition('earth', jd);
  const sunDir = { x: -e.x, y: -e.y, z: -e.z };
  const lonM = Math.atan2(m.y, m.x), lonS = Math.atan2(sunDir.y, sunDir.x);
  let el = lonM - lonS; // elongation
  el = ((el % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return { phase: el / (2 * Math.PI), illuminated: (1 - Math.cos(el)) / 2 };
}

/** Ecliptic → equatorial (J2000) rotation about x by the obliquity. */
export function eclToEq(v: Vec3): Vec3 {
  const c = Math.cos(OBLIQUITY), s = Math.sin(OBLIQUITY);
  return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c };
}
export function eqToEcl(v: Vec3): Vec3 {
  const c = Math.cos(OBLIQUITY), s = Math.sin(OBLIQUITY);
  return { x: v.x, y: v.y * c + v.z * s, z: -v.y * s + v.z * c };
}

/** Sub-solar point on Earth (lat/lon in degrees) at a JD – for day/night rendering. */
export function subsolarPoint(jd: number): { lat: number; lon: number } {
  const n = jd - J2000;
  const L = (280.460 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * D;
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D;
  const eps = (23.439 - 0.0000004 * n) * D;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  // Greenwich mean sidereal time
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;
  let lon = (ra / D - gmst) % 360;
  if (lon > 180) lon -= 360; if (lon < -180) lon += 360;
  return { lat: dec / D, lon };
}

/** Distance between two bodies in AU at a JD. */
export function distanceAU(a: BodyId, b: BodyId, jd: number): number {
  const p = bodyPosition(a, jd), q = bodyPosition(b, jd);
  return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
}
