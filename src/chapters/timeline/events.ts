import { SEC_PER_YEAR } from '../../core/units';

/**
 * Events of the cosmic timeline as data. Past events are given in seconds after the Big Bang
 * (helper `ago(years)` converts "years before today"), future events in years from now.
 * Values are standard literature values; the `source` line names them. Speculative items carry `hypothesis: true`.
 */
export type EraId =
  | 'plasma' | 'dark' | 'dawn' | 'galaxies' | 'solar' | 'life' | 'human' | 'present'
  | 'near' | 'collision' | 'sunend' | 'stelliferous' | 'degenerate' | 'blackhole' | 'dead';

export interface L { de: string; en: string }
export interface TlEvent {
  id: string;
  kind: 'past' | 'future';
  /** past: seconds after the Big Bang · future: years from now */
  t: number;
  era: EraId;
  title: L;
  text: L;
  rows: { de: Array<[string, string]>; en: Array<[string, string]> };
  source: L;
  hypothesis?: boolean;
}

export const NOW_YEAR = new Date().getFullYear();
/** Age of the universe (Planck 2018: 13.787 ± 0.020 Gyr) */
export const T0_YR = 13.8e9;
export const T0 = T0_YR * SEC_PER_YEAR;
const YR = SEC_PER_YEAR;
const ago = (years: number): number => T0 - years * YR;
const RADIO_YEAR = 1901;

export const EVENTS: TlEvent[] = [
  // ------------------------------------------------------------------ past
  {
    id: 'bigbang', kind: 'past', t: 5.39e-44, era: 'plasma',
    title: { de: 'Der <em>Urknall</em>', en: 'The <em>Big Bang</em>' },
    text: {
      de: 'Der Anfang von Raum, Zeit und Energie. Was vor der Planck-Zeit von 10⁻⁴³ Sekunden geschah, kann keine heutige Theorie beschreiben – hier enden Relativitätstheorie und Quantenphysik. Alles, was wir heute sehen, war in einem winzigen, unvorstellbar heissen und dichten Zustand vereint.',
      en: 'The beginning of space, time and energy. No current theory can describe what happened before the Planck time of 10⁻⁴³ seconds – this is where relativity and quantum physics break down. Everything we see today was united in a tiny, unimaginably hot and dense state.',
    },
    rows: {
      de: [['Alter des Universums heute', '13,787 ± 0,020 Mrd. Jahre'], ['Planck-Zeit', '5,4 × 10⁻⁴⁴ s'], ['Planck-Temperatur', '1,4 × 10³² K'], ['Planck-Länge', '1,6 × 10⁻³⁵ m']],
      en: [['Age of the universe today', '13.787 ± 0.020 billion years'], ['Planck time', '5.4 × 10⁻⁴⁴ s'], ['Planck temperature', '1.4 × 10³² K'], ['Planck length', '1.6 × 10⁻³⁵ m']],
    },
    source: { de: 'Planck Collaboration 2018; CODATA 2018', en: 'Planck Collaboration 2018; CODATA 2018' },
  },
  {
    id: 'inflation', kind: 'past', t: 1e-32, era: 'plasma', hypothesis: true,
    title: { de: 'Kosmische <em>Inflation</em>', en: 'Cosmic <em>Inflation</em>' },
    text: {
      de: 'Für den Bruchteil eines Augenblicks dehnt sich der Raum exponentiell aus – um mindestens den Faktor 10²⁶. Winzige Quantenfluktuationen werden auf kosmische Grössen gestreckt: die Saat aller späteren Galaxien. Eine Hypothese (Guth 1981, Linde 1982), gestützt durch die Muster im Mikrowellenhintergrund.',
      en: 'For a fraction of an instant, space expands exponentially – by a factor of at least 10²⁶. Tiny quantum fluctuations are stretched to cosmic size: the seeds of all later galaxies. A hypothesis (Guth 1981, Linde 1982), supported by the patterns in the microwave background.',
    },
    rows: {
      de: [['Zeitraum', '~10⁻³⁶ bis 10⁻³² s'], ['Ausdehnungsfaktor', '≥ 10²⁶ (e⁶⁰)'], ['Temperatur danach', '~10²⁷ K'], ['Vorhersage', 'flaches Universum, Ω = 1,00 ± 0,01']],
      en: [['Period', '~10⁻³⁶ to 10⁻³² s'], ['Expansion factor', '≥ 10²⁶ (e⁶⁰)'], ['Temperature afterwards', '~10²⁷ K'], ['Prediction', 'flat universe, Ω = 1.00 ± 0.01']],
    },
    source: { de: 'Guth 1981; Linde 1982; Planck 2018 (Ω_K = 0,001 ± 0,002)', en: 'Guth 1981; Linde 1982; Planck 2018 (Ω_K = 0.001 ± 0.002)' },
  },
  {
    id: 'qgp', kind: 'past', t: 1e-6, era: 'plasma',
    title: { de: 'Quark-Gluon-<em>Plasma</em>', en: 'Quark–Gluon <em>Plasma</em>' },
    text: {
      de: 'Eine Mikrosekunde nach dem Urknall ist das Universum eine Suppe aus freien Quarks und Gluonen bei 10 Billionen Kelvin – heisser als das Innere jedes Sterns. Am LHC des CERN und am RHIC wird dieser Zustand heute für Sekundenbruchteile nachgestellt.',
      en: 'One microsecond after the Big Bang the universe is a soup of free quarks and gluons at ten trillion kelvin – hotter than the core of any star. Today this state is recreated for fractions of a second at CERN\'s LHC and at RHIC.',
    },
    rows: {
      de: [['Temperatur', '~10¹³ K'], ['Übergang zu Hadronen', '~2 × 10¹² K, bei ~10 µs'], ['Dichte', 'höher als in Atomkernen'], ['Im Labor', 'ALICE (CERN), RHIC (Brookhaven)']],
      en: [['Temperature', '~10¹³ K'], ['Transition to hadrons', '~2 × 10¹² K, at ~10 µs'], ['Density', 'higher than in atomic nuclei'], ['In the lab', 'ALICE (CERN), RHIC (Brookhaven)']],
    },
    source: { de: 'Gitter-QCD (T_c ≈ 155 MeV); ALICE Collaboration', en: 'Lattice QCD (T_c ≈ 155 MeV); ALICE Collaboration' },
  },
  {
    id: 'hadrons', kind: 'past', t: 1e-4, era: 'plasma',
    title: { de: 'Protonen und <em>Neutronen</em>', en: 'Protons and <em>Neutrons</em>' },
    text: {
      de: 'Die Quarks binden sich zu Protonen und Neutronen. Materie und Antimaterie vernichten sich – ein winziger Überschuss von etwa einem Teilchen auf eine Milliarde bleibt übrig. Aus diesem Rest besteht alles, was wir kennen.',
      en: 'Quarks bind into protons and neutrons. Matter and antimatter annihilate – a tiny surplus of about one particle in a billion survives. Everything we know is made of this remainder.',
    },
    rows: {
      de: [['Temperatur', '~10¹² K'], ['Baryon-Photon-Verhältnis', '6,1 × 10⁻¹⁰'], ['Neutronen : Protonen', '1 : 7 (nach ~1 s eingefroren)']],
      en: [['Temperature', '~10¹² K'], ['Baryon-to-photon ratio', '6.1 × 10⁻¹⁰'], ['Neutrons : protons', '1 : 7 (frozen out after ~1 s)']],
    },
    source: { de: 'Planck 2018 (η); Kolb & Turner, The Early Universe', en: 'Planck 2018 (η); Kolb & Turner, The Early Universe' },
  },
  {
    id: 'nucleosynthesis', kind: 'past', t: 180, era: 'plasma',
    title: { de: 'Primordiale <em>Nukleosynthese</em>', en: 'Primordial <em>Nucleosynthesis</em>' },
    text: {
      de: 'Drei Minuten nach dem Urknall ist es kühl genug, dass Protonen und Neutronen zu Atomkernen verschmelzen. Nach rund 20 Minuten ist alles vorbei: Das Universum besteht zu 75 % aus Wasserstoff und 25 % aus Helium, mit Spuren von Deuterium und Lithium. Genau diese Werte messen wir heute noch.',
      en: 'Three minutes after the Big Bang it is cool enough for protons and neutrons to fuse into atomic nuclei. After about 20 minutes it is over: the universe is 75 % hydrogen and 25 % helium, with traces of deuterium and lithium. We still measure exactly these values today.',
    },
    rows: {
      de: [['Temperatur', '~10⁹ K'], ['Wasserstoff (Masse)', '75 %'], ['Helium-4 (Masse)', '25 % (Y_p = 0,245)'], ['Deuterium', 'D/H = 2,5 × 10⁻⁵']],
      en: [['Temperature', '~10⁹ K'], ['Hydrogen (by mass)', '75 %'], ['Helium-4 (by mass)', '25 % (Y_p = 0.245)'], ['Deuterium', 'D/H = 2.5 × 10⁻⁵']],
    },
    source: { de: 'Planck 2018; Cooke et al. 2018 (D/H)', en: 'Planck 2018; Cooke et al. 2018 (D/H)' },
  },
  {
    id: 'cmb', kind: 'past', t: 380_000 * YR, era: 'plasma',
    title: { de: 'Rekombination – der <em>kosmische Hintergrund</em>', en: 'Recombination – the <em>Cosmic Background</em>' },
    text: {
      de: 'Bei 3’000 K binden sich Elektronen an Atomkerne: Das Universum wird durchsichtig. Das Licht von damals sehen wir heute als kosmische Mikrowellenstrahlung (CMB) – auf 2,725 K abgekühlt, das älteste Bild des Universums. Seine winzigen Flecken sind die Keime der Galaxien.',
      en: 'At 3,000 K electrons bind to nuclei: the universe becomes transparent. We see the light from that moment today as the cosmic microwave background (CMB) – cooled to 2.725 K, the oldest image of the universe. Its tiny blotches are the seeds of galaxies.',
    },
    rows: {
      de: [['Temperatur damals', '3’000 K'], ['Rotverschiebung', 'z = 1’090'], ['CMB heute', '2,725 K'], ['Schwankungen', 'ΔT/T ≈ 10⁻⁵']],
      en: [['Temperature then', '3,000 K'], ['Redshift', 'z = 1,090'], ['CMB today', '2.725 K'], ['Fluctuations', 'ΔT/T ≈ 10⁻⁵']],
    },
    source: { de: 'Planck 2018; COBE/FIRAS (Fixsen 2009)', en: 'Planck 2018; COBE/FIRAS (Fixsen 2009)' },
  },
  {
    id: 'darkages', kind: 'past', t: 10e6 * YR, era: 'dark',
    title: { de: 'Das <em>Dunkle Zeitalter</em>', en: 'The <em>Dark Ages</em>' },
    text: {
      de: 'Kein einziger Stern leuchtet. Das Universum ist mit neutralem Wasserstoff und Helium gefüllt; das Nachglühen des Urknalls verschiebt sich ins Infrarot und wird unsichtbar. In der Dunkelheit zieht die Dunkle Materie das Gas zusammen – die Keime der ersten Galaxien.',
      en: 'Not a single star shines. The universe is filled with neutral hydrogen and helium; the afterglow of the Big Bang shifts into the infrared and fades from view. In the darkness, dark matter pulls the gas together – the seeds of the first galaxies.',
    },
    rows: {
      de: [['Dauer', '~380’000 bis ~100 Mio. Jahre'], ['Hintergrund bei 10 Mio. J.', '~340 K (Infrarot)'], ['Beobachtbar über', '21-cm-Linie des Wasserstoffs (SKA, HERA)']],
      en: [['Duration', '~380,000 to ~100 million years'], ['Background at 10 Myr', '~340 K (infrared)'], ['Observable via', 'hydrogen 21-cm line (SKA, HERA)']],
    },
    source: { de: 'Loeb & Furlanetto 2013; Planck 2018', en: 'Loeb & Furlanetto 2013; Planck 2018' },
  },
  {
    id: 'firststars', kind: 'past', t: 180e6 * YR, era: 'dawn',
    title: { de: 'Die <em>ersten Sterne</em>', en: 'The <em>First Stars</em>' },
    text: {
      de: 'Aus reinem Wasserstoff und Helium entstehen die Sterne der Population III: riesig, heiss, kurzlebig – hundert Sonnenmassen und mehr. Ihre Supernovae verteilen die ersten schweren Elemente im Kosmos. Direkt beobachtet wurde noch keiner von ihnen.',
      en: 'From pure hydrogen and helium the Population III stars are born: huge, hot, short-lived – a hundred solar masses and more. Their supernovae scatter the first heavy elements through the cosmos. None has been observed directly yet.',
    },
    rows: {
      de: [['Zeit', '~100–250 Mio. Jahre (z ≈ 15–30)'], ['Masse', '10–1’000 Sonnenmassen'], ['Lebensdauer', '~2–3 Mio. Jahre'], ['Schwere Elemente', 'keine (Metallizität 0)']],
      en: [['Time', '~100–250 million years (z ≈ 15–30)'], ['Mass', '10–1,000 solar masses'], ['Lifetime', '~2–3 million years'], ['Heavy elements', 'none (metallicity 0)']],
    },
    source: { de: 'Bromm & Larson 2004; Klessen & Glover 2023', en: 'Bromm & Larson 2004; Klessen & Glover 2023' },
  },
  {
    id: 'firstgalaxies', kind: 'past', t: 290e6 * YR, era: 'dawn',
    title: { de: 'Die <em>ersten Galaxien</em>', en: 'The <em>First Galaxies</em>' },
    text: {
      de: 'JADES-GS-z14-0, entdeckt 2024 mit dem James-Webb-Teleskop: eine Galaxie, deren Licht 290 Millionen Jahre nach dem Urknall ausgesandt wurde – die fernste bestätigte Galaxie. Sie ist überraschend hell und enthält bereits Sauerstoff: Ganze Sterngenerationen sind schon vergangen.',
      en: 'JADES-GS-z14-0, discovered in 2024 with the James Webb Space Telescope: a galaxy whose light was emitted 290 million years after the Big Bang – the most distant confirmed galaxy. It is surprisingly bright and already contains oxygen: whole generations of stars have come and gone.',
    },
    rows: {
      de: [['Galaxie', 'JADES-GS-z14-0'], ['Rotverschiebung', 'z = 14,32'], ['Alter des Universums', '290 Mio. Jahre'], ['Durchmesser', '~1’600 Lichtjahre'], ['Sternmasse', '~4 × 10⁸ Sonnenmassen']],
      en: [['Galaxy', 'JADES-GS-z14-0'], ['Redshift', 'z = 14.32'], ['Age of the universe', '290 million years'], ['Diameter', '~1,600 light-years'], ['Stellar mass', '~4 × 10⁸ solar masses']],
    },
    source: { de: 'Carniani et al. 2024 (Nature), JWST/NIRSpec', en: 'Carniani et al. 2024 (Nature), JWST/NIRSpec' },
  },
  {
    id: 'reionization', kind: 'past', t: 1e9 * YR, era: 'dawn',
    title: { de: '<em>Reionisation</em>', en: '<em>Reionisation</em>' },
    text: {
      de: 'Die UV-Strahlung der ersten Sterne und Galaxien ionisiert den neutralen Wasserstoff zwischen den Galaxien ein zweites Mal. Nach rund einer Milliarde Jahren ist der Prozess abgeschlossen – seither ist das Universum für ultraviolettes Licht durchsichtig.',
      en: 'The ultraviolet light of the first stars and galaxies ionises the neutral hydrogen between the galaxies a second time. After about a billion years the process is complete – ever since, the universe has been transparent to ultraviolet light.',
    },
    rows: {
      de: [['Zeitraum', 'z ≈ 15 → 6 (250 Mio. – 1 Mrd. Jahre)'], ['Mittelpunkt', 'z ≈ 7,7 (Planck, τ = 0,054)'], ['Abschluss', '~1 Mrd. Jahre (z ≈ 6)']],
      en: [['Period', 'z ≈ 15 → 6 (250 million – 1 billion years)'], ['Midpoint', 'z ≈ 7.7 (Planck, τ = 0.054)'], ['Completion', '~1 billion years (z ≈ 6)']],
    },
    source: { de: 'Planck 2018; Fan et al. 2006', en: 'Planck 2018; Fan et al. 2006' },
  },
  {
    id: 'milkyway', kind: 'past', t: ago(11e9), era: 'galaxies',
    title: { de: 'Die <em>Milchstrasse</em> nimmt Gestalt an', en: 'The <em>Milky Way</em> takes shape' },
    text: {
      de: 'Die alten Sterne der dicken Scheibe unserer Galaxis sind rund 11 Milliarden Jahre alt. Kurz darauf verschluckt die junge Milchstrasse die Zwerggalaxie Gaia-Enceladus – der grösste Zusammenstoss ihrer Geschichte. Aus solchen Verschmelzungen wächst unsere Heimat.',
      en: 'The old stars of our Galaxy\'s thick disc are about 11 billion years old. Shortly afterwards the young Milky Way swallows the dwarf galaxy Gaia-Enceladus – the largest collision in its history. Our home grows out of mergers like this.',
    },
    rows: {
      de: [['Dicke Scheibe', '~11 Mrd. Jahre alt (Gaia)'], ['Gaia-Enceladus-Verschmelzung', 'vor ~10 Mrd. Jahren'], ['Ältester Halo-Stern', '~13 Mrd. Jahre'], ['Sterne heute', '~100–400 Milliarden']],
      en: [['Thick disc', '~11 billion years old (Gaia)'], ['Gaia-Enceladus merger', '~10 billion years ago'], ['Oldest halo star', '~13 billion years'], ['Stars today', '~100–400 billion']],
    },
    source: { de: 'Xiang & Rix 2022 (Nature), Gaia DR3; Helmi et al. 2018', en: 'Xiang & Rix 2022 (Nature), Gaia DR3; Helmi et al. 2018' },
  },
  {
    id: 'sfpeak', kind: 'past', t: 3.5e9 * YR, era: 'galaxies',
    title: { de: 'Das <em>Sternentstehungs-Maximum</em>', en: 'Peak <em>Star Formation</em>' },
    text: {
      de: '«Cosmic noon»: Rund 3,5 Milliarden Jahre nach dem Urknall bilden Galaxien Sterne so schnell wie nie zuvor und nie mehr danach – etwa zehnmal so viel wie heute. Die Hälfte aller Sterne, die es je gab, entsteht in den ersten fünf Milliarden Jahren.',
      en: '"Cosmic noon": about 3.5 billion years after the Big Bang, galaxies form stars faster than ever before or since – roughly ten times today\'s rate. Half of all stars that ever existed are born in the first five billion years.',
    },
    rows: {
      de: [['Rotverschiebung', 'z ≈ 2 (3,3 Mrd. Jahre)'], ['Rate gegenüber heute', '~10×'], ['Hälfte aller Sternmasse gebildet', 'bis z ≈ 1,3 (~5 Mrd. Jahre)']],
      en: [['Redshift', 'z ≈ 2 (3.3 billion years)'], ['Rate compared with today', '~10×'], ['Half of all stellar mass formed', 'by z ≈ 1.3 (~5 billion years)']],
    },
    source: { de: 'Madau & Dickinson 2014 (ARA&A)', en: 'Madau & Dickinson 2014 (ARA&A)' },
  },
  {
    id: 'sun', kind: 'past', t: ago(4.6e9), era: 'solar',
    title: { de: 'Die <em>Sonne</em> entsteht', en: 'The <em>Sun</em> is born' },
    text: {
      de: 'In einer Molekülwolke kollabiert ein Klumpen Gas; in seinem Kern zündet die Kernfusion. Die Sonne ist ein Stern der dritten Generation: Ihr Kohlenstoff, Sauerstoff und Eisen stammen aus Sternen, die längst vergangen sind.',
      en: 'In a molecular cloud a clump of gas collapses; nuclear fusion ignites in its core. The Sun is a third-generation star: its carbon, oxygen and iron come from stars that died long ago.',
    },
    rows: {
      de: [['Alter', '4,57 Mrd. Jahre (Meteoriten-CAIs: 4’567 Mio. Jahre)'], ['Masse', '1,989 × 10³⁰ kg'], ['Oberflächentemperatur', '5’772 K'], ['Massenverlust durch Fusion', '4,3 Mio. t pro Sekunde']],
      en: [['Age', '4.57 billion years (meteorite CAIs: 4,567 million years)'], ['Mass', '1.989 × 10³⁰ kg'], ['Surface temperature', '5,772 K'], ['Mass lost to fusion', '4.3 million t per second']],
    },
    source: { de: 'Bouvier & Wadhwa 2010; IAU 2015 Nominalwerte', en: 'Bouvier & Wadhwa 2010; IAU 2015 nominal values' },
  },
  {
    id: 'earth', kind: 'past', t: ago(4.54e9), era: 'solar',
    title: { de: 'Die <em>Erde</em>', en: 'The <em>Earth</em>' },
    text: {
      de: 'Aus Staub und Planetesimalen der protoplanetaren Scheibe wächst die Erde in wenigen zehn Millionen Jahren. Ihr Alter kennen wir aus Uran-Blei-Datierungen von Meteoriten und den ältesten Mineralen der Erdkruste.',
      en: 'From the dust and planetesimals of the protoplanetary disc the Earth grows in a few tens of millions of years. We know its age from uranium–lead dating of meteorites and of the oldest minerals in the crust.',
    },
    rows: {
      de: [['Alter', '4,54 ± 0,05 Mrd. Jahre'], ['Ältestes Mineral', 'Zirkon, 4,4 Mrd. Jahre (Jack Hills)'], ['Masse', '5,972 × 10²⁴ kg'], ['Mittlerer Radius', '6’371 km']],
      en: [['Age', '4.54 ± 0.05 billion years'], ['Oldest mineral', 'zircon, 4.4 billion years (Jack Hills)'], ['Mass', '5.972 × 10²⁴ kg'], ['Mean radius', '6,371 km']],
    },
    source: { de: 'Dalrymple 2001; Wilde et al. 2001 (Nature)', en: 'Dalrymple 2001; Wilde et al. 2001 (Nature)' },
  },
  {
    id: 'moon', kind: 'past', t: ago(4.5e9), era: 'solar', hypothesis: true,
    title: { de: 'Der <em>Mond</em>', en: 'The <em>Moon</em>' },
    text: {
      de: 'Ein marsgrosser Körper – Theia – trifft die junge Erde. Aus den glühenden Trümmern formt sich innerhalb von Jahrhunderten der Mond. Seither entfernt er sich langsam: heute 3,8 Zentimeter pro Jahr. Die Kollisionshypothese ist das führende Modell, nicht bewiesen.',
      en: 'A Mars-sized body – Theia – strikes the young Earth. From the glowing debris the Moon forms within centuries. It has been receding ever since: today by 3.8 centimetres per year. The giant-impact hypothesis is the leading model, not proven.',
    },
    rows: {
      de: [['Zeitpunkt', '~4,51 Mrd. Jahre (Apollo-Zirkone)'], ['Abstand damals', '~20’000–30’000 km'], ['Abstand heute', '384’400 km'], ['Entfernung pro Jahr', '+3,8 cm']],
      en: [['Time', '~4.51 billion years (Apollo zircons)'], ['Distance then', '~20,000–30,000 km'], ['Distance today', '384,400 km'], ['Recession per year', '+3.8 cm']],
    },
    source: { de: 'Barboni et al. 2017 (Science Advances); Canup 2004', en: 'Barboni et al. 2017 (Science Advances); Canup 2004' },
  },
  {
    id: 'life', kind: 'past', t: ago(3.7e9), era: 'life',
    title: { de: 'Frühestes <em>Leben</em>', en: 'Earliest <em>Life</em>' },
    text: {
      de: 'Die ältesten sicheren Spuren von Leben: Stromatolithen und Kohlenstoff-Signaturen in 3,7 Milliarden Jahre alten Gesteinen Grönlands. Vermutlich begann das Leben noch früher – auf einer Erde ohne freien Sauerstoff, unter einer Sonne, die 25 % schwächer schien.',
      en: 'The oldest secure traces of life: stromatolites and carbon signatures in 3.7-billion-year-old rocks of Greenland. Life probably began even earlier – on an Earth without free oxygen, under a Sun that shone 25 % fainter.',
    },
    rows: {
      de: [['Isua, Grönland', '≥ 3,7 Mrd. Jahre'], ['Mögliche ältere Spuren', '3,95–4,1 Mrd. Jahre (umstritten)'], ['Letzter gemeinsamer Vorfahre (LUCA)', '~4,2 Mrd. Jahre']],
      en: [['Isua, Greenland', '≥ 3.7 billion years'], ['Possible older traces', '3.95–4.1 billion years (disputed)'], ['Last universal common ancestor (LUCA)', '~4.2 billion years']],
    },
    source: { de: 'Nutman et al. 2016 (Nature); Moody et al. 2024', en: 'Nutman et al. 2016 (Nature); Moody et al. 2024' },
  },
  {
    id: 'oxygen', kind: 'past', t: ago(2.4e9), era: 'life',
    title: { de: 'Die <em>Sauerstoff-Katastrophe</em>', en: 'The <em>Great Oxidation</em>' },
    text: {
      de: 'Cyanobakterien betreiben Photosynthese und setzen Sauerstoff frei. Das Gas verändert die Atmosphäre für immer – Gift für die meisten damaligen Lebensformen, Voraussetzung für alles spätere komplexe Leben. Das Klima kippt in eine globale Vereisung.',
      en: 'Cyanobacteria photosynthesise and release oxygen. The gas changes the atmosphere forever – poison for most life forms of the time, prerequisite for all later complex life. The climate tips into a global glaciation.',
    },
    rows: {
      de: [['Zeitraum', '2,4–2,1 Mrd. Jahre (GOE)'], ['Sauerstoff danach', '< 1 % (heute 21 %)'], ['Folge', 'Huronische Vereisung']],
      en: [['Period', '2.4–2.1 billion years (GOE)'], ['Oxygen afterwards', '< 1 % (today 21 %)'], ['Consequence', 'Huronian glaciation']],
    },
    source: { de: 'Lyons et al. 2014 (Nature); Gumsley et al. 2017', en: 'Lyons et al. 2014 (Nature); Gumsley et al. 2017' },
  },
  {
    id: 'eukaryotes', kind: 'past', t: ago(1.8e9), era: 'life',
    title: { de: 'Komplexe <em>Zellen</em>', en: 'Complex <em>Cells</em>' },
    text: {
      de: 'Eukaryoten – Zellen mit Kern und Mitochondrien – entstehen aus der Verschmelzung einer Archaee mit einem Bakterium. Die ältesten Fossilien sind rund 1,7 Milliarden Jahre alt. Aus diesen Zellen gehen alle Pflanzen, Pilze und Tiere hervor.',
      en: 'Eukaryotes – cells with a nucleus and mitochondria – arise from the merger of an archaeon with a bacterium. The oldest fossils are about 1.7 billion years old. All plants, fungi and animals descend from these cells.',
    },
    rows: {
      de: [['Fossile Eukaryoten', '~1,65–1,8 Mrd. Jahre'], ['Ursprung', 'Endosymbiose (Archaee + Bakterium)'], ['Erste Tiere', '~600 Mio. Jahre (Ediacarium)']],
      en: [['Fossil eukaryotes', '~1.65–1.8 billion years'], ['Origin', 'endosymbiosis (archaeon + bacterium)'], ['First animals', '~600 million years (Ediacaran)']],
    },
    source: { de: 'Knoll 2014; Javaux 2007', en: 'Knoll 2014; Javaux 2007' },
  },
  {
    id: 'cambrian', kind: 'past', t: ago(538.8e6), era: 'life',
    title: { de: 'Die <em>Kambrische Explosion</em>', en: 'The <em>Cambrian Explosion</em>' },
    text: {
      de: 'Innerhalb von rund 20 Millionen Jahren tauchen fast alle heutigen Tierstämme im Fossilbericht auf: Augen, Skelette, Räuber und Beute. Der Beginn des Kambriums vor 538,8 Millionen Jahren markiert den Start des Phanerozoikums – des Zeitalters des sichtbaren Lebens.',
      en: 'Within about 20 million years nearly all modern animal phyla appear in the fossil record: eyes, skeletons, predators and prey. The start of the Cambrian 538.8 million years ago marks the beginning of the Phanerozoic – the age of visible life.',
    },
    rows: {
      de: [['Beginn Kambrium', '538,8 Mio. Jahre'], ['Burgess-Schiefer', '508 Mio. Jahre'], ['Neue Tierstämme', 'fast alle heutigen']],
      en: [['Start of the Cambrian', '538.8 million years'], ['Burgess Shale', '508 million years'], ['New animal phyla', 'nearly all modern ones']],
    },
    source: { de: 'International Commission on Stratigraphy 2023', en: 'International Commission on Stratigraphy 2023' },
  },
  {
    id: 'dinosaurs', kind: 'past', t: ago(66.04e6), era: 'life',
    title: { de: 'Das Ende der <em>Dinosaurier</em>', en: 'The End of the <em>Dinosaurs</em>' },
    text: {
      de: 'Ein rund 10 Kilometer grosser Asteroid schlägt bei Chicxulub auf Yucatán ein. Staub und Schwefel verdunkeln den Himmel; drei Viertel aller Arten sterben aus, darunter alle Nicht-Vogel-Dinosaurier. Die Säugetiere übernehmen die Erde.',
      en: 'An asteroid about 10 kilometres across strikes at Chicxulub, Yucatán. Dust and sulphur darken the sky; three quarters of all species die out, including all non-avian dinosaurs. Mammals take over the Earth.',
    },
    rows: {
      de: [['Zeitpunkt', '66,04 Mio. Jahre'], ['Asteroid', '~10 km'], ['Krater', '~180 km (Chicxulub)'], ['Artensterben', '~75 %']],
      en: [['Time', '66.04 million years'], ['Asteroid', '~10 km'], ['Crater', '~180 km (Chicxulub)'], ['Species lost', '~75 %']],
    },
    source: { de: 'Renne et al. 2013 (Science); Schulte et al. 2010', en: 'Renne et al. 2013 (Science); Schulte et al. 2010' },
  },
  {
    id: 'sapiens', kind: 'past', t: ago(300_000), era: 'human',
    title: { de: '<em>Homo sapiens</em>', en: '<em>Homo sapiens</em>' },
    text: {
      de: 'Die ältesten Fossilien unserer Art stammen aus Jebel Irhoud in Marokko und sind rund 300’000 Jahre alt. Im kosmischen Kalender sind das die letzten zwölf Minuten des Jahres.',
      en: 'The oldest fossils of our species come from Jebel Irhoud in Morocco and are about 300,000 years old. In the cosmic calendar that is the last twelve minutes of the year.',
    },
    rows: {
      de: [['Jebel Irhoud', '315’000 ± 34’000 Jahre'], ['Auswanderung aus Afrika', '~60’000–70’000 Jahre'], ['Kosmischer Kalender', '31. Dezember, 23:48']],
      en: [['Jebel Irhoud', '315,000 ± 34,000 years'], ['Out of Africa', '~60,000–70,000 years'], ['Cosmic calendar', 'December 31, 23:48']],
    },
    source: { de: 'Hublin et al. 2017 (Nature)', en: 'Hublin et al. 2017 (Nature)' },
  },
  {
    id: 'agriculture', kind: 'past', t: ago(12_000), era: 'human',
    title: { de: '<em>Landwirtschaft</em>', en: '<em>Agriculture</em>' },
    text: {
      de: 'Im Fruchtbaren Halbmond beginnen Menschen, Getreide anzubauen und Tiere zu halten. Sesshaftigkeit, Städte, Schrift – alles Weitere folgt in einem kosmischen Wimpernschlag: den letzten 27 Sekunden des kosmischen Jahres.',
      en: 'In the Fertile Crescent people begin to grow grain and keep animals. Settlements, cities, writing – everything else follows in a cosmic blink: the last 27 seconds of the cosmic year.',
    },
    rows: {
      de: [['Beginn', '~11’500–12’000 Jahre (Neolithikum)'], ['Göbekli Tepe', '~11’500 Jahre'], ['Schrift (Uruk)', '~5’300 Jahre']],
      en: [['Beginning', '~11,500–12,000 years (Neolithic)'], ['Göbekli Tepe', '~11,500 years'], ['Writing (Uruk)', '~5,300 years']],
    },
    source: { de: 'Zeder 2011; Larson et al. 2014 (PNAS)', en: 'Zeder 2011; Larson et al. 2014 (PNAS)' },
  },
  {
    id: 'radio', kind: 'past', t: ago(NOW_YEAR - RADIO_YEAR), era: 'human',
    title: { de: 'Die ersten <em>Radiosignale</em>', en: 'The first <em>Radio Signals</em>' },
    text: {
      de: `1901 überbrückt Marconis Funksignal den Atlantik, ab den 1920er-Jahren senden Rundfunkstationen. Seither verlässt eine Blase aus Radiowellen die Erde mit Lichtgeschwindigkeit – heute rund ${NOW_YEAR - RADIO_YEAR} Lichtjahre gross. Sie enthält etwa 20’000 Sterne.`,
      en: `In 1901 Marconi's signal crosses the Atlantic; from the 1920s broadcasting stations go on air. Ever since, a bubble of radio waves has been leaving Earth at the speed of light – today about ${NOW_YEAR - RADIO_YEAR} light-years across in radius. It contains roughly 20,000 stars.`,
    },
    rows: {
      de: [['Erste Transatlantik-Übertragung', '12. Dezember 1901'], ['Radius der Radioblase', `${NOW_YEAR - RADIO_YEAR} Lichtjahre`], ['Sterne darin', '~20’000 (0,1 Sterne pro pc³)']],
      en: [['First transatlantic transmission', 'December 12, 1901'], ['Radius of the radio bubble', `${NOW_YEAR - RADIO_YEAR} light-years`], ['Stars inside', '~20,000 (0.1 stars per pc³)']],
    },
    source: { de: 'Marconi 1901; RECONS (Sterndichte der Sonnenumgebung)', en: 'Marconi 1901; RECONS (local stellar density)' },
  },
  {
    id: 'today', kind: 'past', t: T0, era: 'present',
    title: { de: '<em>Heute</em>', en: '<em>Today</em>' },
    text: {
      de: '13,8 Milliarden Jahre nach dem Urknall. Das Universum dehnt sich beschleunigt aus, die Sonne hat die Hälfte ihres Lebens hinter sich – und auf einem kleinen Planeten fragt sich jemand, wie das alles begann.',
      en: '13.8 billion years after the Big Bang. The universe is expanding ever faster, the Sun is halfway through its life – and on a small planet someone is wondering how it all began.',
    },
    rows: {
      de: [['Alter des Universums', '13,787 ± 0,020 Mrd. Jahre'], ['Hubble-Konstante', '67,4 (Planck) / 73,0 (SH0ES) km/s/Mpc'], ['CMB-Temperatur', '2,725 K'], ['Beobachtbares Universum', 'Radius 46,5 Mrd. Lichtjahre']],
      en: [['Age of the universe', '13.787 ± 0.020 billion years'], ['Hubble constant', '67.4 (Planck) / 73.0 (SH0ES) km/s/Mpc'], ['CMB temperature', '2.725 K'], ['Observable universe', 'radius 46.5 billion light-years']],
    },
    source: { de: 'Planck 2018; Riess et al. 2022', en: 'Planck 2018; Riess et al. 2022' },
  },

  // ------------------------------------------------------------------ future
  {
    id: 'halley', kind: 'future', t: Math.max(1, 2061 - NOW_YEAR), era: 'near',
    title: { de: '<em>Halley</em> kehrt zurück', en: '<em>Halley</em> returns' },
    text: {
      de: 'Der Halleysche Komet erreicht am 28. Juli 2061 sein Perihel – zum ersten Mal seit 1986. Seine Wiederkehr wurde 1705 von Edmond Halley vorhergesagt; 1758 traf sie ein. Der Komet ist der einzige mit blossem Auge sichtbare, der zweimal in einem Menschenleben erscheinen kann.',
      en: 'Halley\'s Comet reaches perihelion on 28 July 2061 – for the first time since 1986. Its return was predicted by Edmond Halley in 1705 and confirmed in 1758. It is the only naked-eye comet that can appear twice in a human lifetime.',
    },
    rows: {
      de: [['Perihel', '28. Juli 2061'], ['Umlaufzeit', '~75–76 Jahre'], ['Letztes Perihel', '9. Februar 1986'], ['Aphel', '35 AE (Dezember 2023)']],
      en: [['Perihelion', 'July 28, 2061'], ['Orbital period', '~75–76 years'], ['Last perihelion', 'February 9, 1986'], ['Aphelion', '35 AU (December 2023)']],
    },
    source: { de: 'JPL Small-Body Database (1P/Halley)', en: 'JPL Small-Body Database (1P/Halley)' },
  },
  {
    id: 'betelgeuse', kind: 'future', t: 1e5, era: 'near', hypothesis: true,
    title: { de: '<em>Beteigeuze</em> explodiert', en: '<em>Betelgeuse</em> explodes' },
    text: {
      de: 'Der rote Überriese im Orion hat seinen Brennstoff fast aufgebraucht. Irgendwann in den nächsten 100’000 Jahren wird er als Supernova explodieren – so hell wie der Halbmond, wochenlang am Taghimmel sichtbar. Für die Erde in rund 550 Lichtjahren Entfernung ist das ungefährlich.',
      en: 'The red supergiant in Orion has almost exhausted its fuel. Sometime in the next 100,000 years it will explode as a supernova – as bright as the half moon, visible in daylight for weeks. At about 550 light-years, Earth is safe.',
    },
    rows: {
      de: [['Entfernung', '~550 Lichtjahre (168 pc)'], ['Masse', '~16–19 Sonnenmassen'], ['Radius', '~760 Sonnenradien'], ['Helligkeit der Supernova', '~ −10 mag']],
      en: [['Distance', '~550 light-years (168 pc)'], ['Mass', '~16–19 solar masses'], ['Radius', '~760 solar radii'], ['Supernova brightness', '~ −10 mag']],
    },
    source: { de: 'Joyce et al. 2020 (ApJ); Saio et al. 2023', en: 'Joyce et al. 2020 (ApJ); Saio et al. 2023' },
  },
  {
    id: 'oceans', kind: 'future', t: 1e9, era: 'near', hypothesis: true,
    title: { de: 'Die <em>Ozeane</em> verdampfen', en: 'The <em>Oceans</em> evaporate' },
    text: {
      de: 'Die Sonne wird pro Milliarde Jahre rund 10 % heller. In etwa einer Milliarde Jahren löst das einen feuchten Treibhauseffekt aus: Die Ozeane verdampfen, der Wasserstoff entweicht ins All. Das Ende der Biosphäre, wie wir sie kennen – ein Modell, kein Fahrplan.',
      en: 'The Sun brightens by about 10 % per billion years. In roughly a billion years this triggers a moist greenhouse: the oceans evaporate and the hydrogen escapes to space. The end of the biosphere as we know it – a model, not a schedule.',
    },
    rows: {
      de: [['Leuchtkraft der Sonne', '+10 % pro Mrd. Jahre'], ['Feuchtes Treibhaus', 'in ~1,0–1,5 Mrd. Jahren'], ['Mittlere Temperatur dann', '> 70 °C']],
      en: [['Solar luminosity', '+10 % per billion years'], ['Moist greenhouse', 'in ~1.0–1.5 billion years'], ['Mean temperature then', '> 70 °C']],
    },
    source: { de: 'Schröder & Connon Smith 2008; Wolf & Toon 2015', en: 'Schröder & Connon Smith 2008; Wolf & Toon 2015' },
  },
  {
    id: 'andromeda', kind: 'future', t: 4.5e9, era: 'collision', hypothesis: true,
    title: { de: '<em>Andromeda</em> trifft die Milchstrasse', en: '<em>Andromeda</em> meets the Milky Way' },
    text: {
      de: 'Die Andromeda-Galaxie nähert sich uns mit 110 km/s. In rund 4 bis 4,5 Milliarden Jahren beginnt die Begegnung: Sterne stossen praktisch nie zusammen, aber beide Galaxien werden von der Schwerkraft zerrissen und neu geformt. Neuere Rechnungen (2025) geben für eine Verschmelzung nur noch etwa 50 % Wahrscheinlichkeit.',
      en: 'The Andromeda Galaxy is approaching us at 110 km/s. In about 4 to 4.5 billion years the encounter begins: stars practically never collide, but gravity tears both galaxies apart and reshapes them. Newer calculations (2025) give only about a 50 % chance of a merger.',
    },
    rows: {
      de: [['Entfernung heute', '2,5 Mio. Lichtjahre (765 kpc)'], ['Annäherung', '110 km/s'], ['Erste Begegnung', 'in ~4–4,5 Mrd. Jahren'], ['Sternkollisionen', 'praktisch keine']],
      en: [['Distance today', '2.5 million light-years (765 kpc)'], ['Approach speed', '110 km/s'], ['First encounter', 'in ~4–4.5 billion years'], ['Stellar collisions', 'practically none']],
    },
    source: { de: 'van der Marel et al. 2012, 2019; Sawala et al. 2025 (Nature Astronomy)', en: 'van der Marel et al. 2012, 2019; Sawala et al. 2025 (Nature Astronomy)' },
  },
  {
    id: 'redgiant', kind: 'future', t: 5e9, era: 'sunend',
    title: { de: 'Die Sonne wird zum <em>Roten Riesen</em>', en: 'The Sun becomes a <em>Red Giant</em>' },
    text: {
      de: 'Der Wasserstoff im Kern ist verbraucht. Die Sonne bläht sich auf über das 200-Fache ihrer heutigen Grösse auf und verschlingt Merkur und Venus – sehr wahrscheinlich auch die Erde. Ihre Leuchtkraft steigt auf das 2’700-Fache.',
      en: 'The hydrogen in the core is exhausted. The Sun swells to more than 200 times its present size and engulfs Mercury and Venus – very probably Earth as well. Its luminosity rises to 2,700 times today\'s.',
    },
    rows: {
      de: [['Ende der Hauptreihe', 'in ~5 Mrd. Jahren'], ['Maximaler Radius', '~256 Sonnenradien (1,2 AE)'], ['Maximale Leuchtkraft', '~2’730 Sonnenleuchtkräfte'], ['Massenverlust', '~33 %']],
      en: [['End of the main sequence', 'in ~5 billion years'], ['Maximum radius', '~256 solar radii (1.2 AU)'], ['Maximum luminosity', '~2,730 solar luminosities'], ['Mass loss', '~33 %']],
    },
    source: { de: 'Schröder & Connon Smith 2008 (MNRAS)', en: 'Schröder & Connon Smith 2008 (MNRAS)' },
  },
  {
    id: 'milkomeda', kind: 'future', t: 6e9, era: 'collision', hypothesis: true,
    title: { de: '<em>Milkomeda</em>', en: '<em>Milkomeda</em>' },
    text: {
      de: 'Nach mehreren Durchgängen verschmelzen Milchstrasse und Andromeda zu einer einzigen elliptischen Galaxie – «Milkomeda». Die Sonne wird vermutlich in die Aussenbezirke geschleudert, bleibt aber gebunden. Der Nachthimmel: ein diffuser Lichtball statt eines Bandes.',
      en: 'After several passes the Milky Way and Andromeda merge into a single elliptical galaxy – "Milkomeda". The Sun is probably flung to the outskirts but stays bound. The night sky: a diffuse ball of light instead of a band.',
    },
    rows: {
      de: [['Verschmelzung abgeschlossen', 'in ~6 Mrd. Jahren'], ['Ergebnis', 'elliptische Galaxie'], ['Sonne', 'wahrscheinlich > 50’000 Lj vom Zentrum']],
      en: [['Merger complete', 'in ~6 billion years'], ['Result', 'elliptical galaxy'], ['Sun', 'probably > 50,000 ly from the centre']],
    },
    source: { de: 'Cox & Loeb 2008; van der Marel et al. 2012', en: 'Cox & Loeb 2008; van der Marel et al. 2012' },
  },
  {
    id: 'whitedwarf', kind: 'future', t: 7.8e9, era: 'sunend',
    title: { de: '<em>Weisser Zwerg</em>', en: '<em>White Dwarf</em>' },
    text: {
      de: 'Die Sonne stösst ihre Hülle als planetarischen Nebel ab. Zurück bleibt ein Weisser Zwerg von Erdgrösse und halber Sonnenmasse – ein glühender Kern aus Kohlenstoff und Sauerstoff, der über Billionen Jahre langsam auskühlt.',
      en: 'The Sun sheds its envelope as a planetary nebula. What remains is a white dwarf the size of Earth with half the Sun\'s mass – a glowing core of carbon and oxygen that slowly cools over trillions of years.',
    },
    rows: {
      de: [['Endmasse', '~0,54 Sonnenmassen'], ['Radius', '~ Erdradius'], ['Anfangstemperatur', '> 100’000 K'], ['Schwarzer Zwerg', 'nach > 10¹⁵ Jahren']],
      en: [['Final mass', '~0.54 solar masses'], ['Radius', '~ Earth radius'], ['Initial temperature', '> 100,000 K'], ['Black dwarf', 'after > 10¹⁵ years']],
    },
    source: { de: 'Schröder & Connon Smith 2008 (MNRAS)', en: 'Schröder & Connon Smith 2008 (MNRAS)' },
  },
  {
    id: 'localgroup', kind: 'future', t: 1e11, era: 'stelliferous', hypothesis: true,
    title: { de: 'Die <em>Lokale Gruppe</em> allein', en: 'The <em>Local Group</em> alone' },
    text: {
      de: 'Die beschleunigte Expansion trägt alle fernen Galaxien hinter den kosmischen Horizont. Am Himmel bleibt nur die verschmolzene Lokale Gruppe. Astronomen jener Zeit könnten die Expansion nicht mehr messen – und den Urknall nicht mehr nachweisen.',
      en: 'Accelerating expansion carries all distant galaxies beyond the cosmic horizon. Only the merged Local Group remains in the sky. Astronomers of that era could no longer measure the expansion – nor prove the Big Bang.',
    },
    rows: {
      de: [['Zeit', 'in ~100 Mrd. Jahren'], ['CMB-Temperatur dann', '< 0,01 K'], ['Sichtbare Galaxien', 'nur die Lokale Gruppe']],
      en: [['Time', 'in ~100 billion years'], ['CMB temperature then', '< 0.01 K'], ['Visible galaxies', 'only the Local Group']],
    },
    source: { de: 'Krauss & Scherrer 2007; Nagamine & Loeb 2003', en: 'Krauss & Scherrer 2007; Nagamine & Loeb 2003' },
  },
  {
    id: 'laststars', kind: 'future', t: 1e14, era: 'stelliferous', hypothesis: true,
    title: { de: 'Die <em>letzten Sterne</em>', en: 'The <em>Last Stars</em>' },
    text: {
      de: 'Nach 100 Billionen Jahren ist das Gas aufgebraucht: Kein neuer Stern entsteht mehr. Die letzten Roten Zwerge – die sparsamsten aller Sterne – glimmen noch Billionen Jahre, dann erlischt das Sternenlicht im Universum für immer.',
      en: 'After 100 trillion years the gas is used up: no new star forms. The last red dwarfs – the most frugal of all stars – glow for trillions more years, then starlight in the universe goes out for good.',
    },
    rows: {
      de: [['Ende der Sternentstehung', '~10¹⁴ Jahre'], ['Lebensdauer Roter Zwerg (0,08 M☉)', '~10¹³ Jahre'], ['Ära', 'Ende der Stern-Ära']],
      en: [['End of star formation', '~10¹⁴ years'], ['Lifetime of a red dwarf (0.08 M☉)', '~10¹³ years'], ['Era', 'end of the Stelliferous Era']],
    },
    source: { de: 'Adams & Laughlin 1997 (Rev. Mod. Phys.)', en: 'Adams & Laughlin 1997 (Rev. Mod. Phys.)' },
  },
  {
    id: 'degenerate', kind: 'future', t: 1e15, era: 'degenerate', hypothesis: true,
    title: { de: 'Ära der <em>Degeneration</em>', en: 'The <em>Degenerate</em> Era' },
    text: {
      de: 'Nur noch Sternleichen: Weisse Zwerge, Neutronensterne, Schwarze Löcher – und Planeten, die durch die Dunkelheit treiben. Falls Protonen zerfallen (Halbwertszeit über 10³⁴ Jahre), lösen sich am Ende dieser Ära alle Atome auf.',
      en: 'Only stellar remnants remain: white dwarfs, neutron stars, black holes – and planets drifting through the dark. If protons decay (half-life above 10³⁴ years), all atoms dissolve by the end of this era.',
    },
    rows: {
      de: [['Zeitraum', '10¹⁵ bis 10³⁹ Jahre'], ['Protonenzerfall', 'τ > 10³⁴ Jahre (Super-Kamiokande, untere Grenze)'], ['Leuchtende Objekte', 'keine']],
      en: [['Period', '10¹⁵ to 10³⁹ years'], ['Proton decay', 'τ > 10³⁴ years (Super-Kamiokande, lower limit)'], ['Luminous objects', 'none']],
    },
    source: { de: 'Adams & Laughlin 1997; Super-Kamiokande 2020', en: 'Adams & Laughlin 1997; Super-Kamiokande 2020' },
  },
  {
    id: 'blackholes', kind: 'future', t: 1e40, era: 'blackhole', hypothesis: true,
    title: { de: 'Ära der <em>Schwarzen Löcher</em>', en: 'The <em>Black Hole</em> Era' },
    text: {
      de: 'Die einzigen grossen Objekte sind Schwarze Löcher. Sie verdampfen durch Hawking-Strahlung – eines von Sonnenmasse in 10⁶⁷ Jahren, die grössten in 10¹⁰⁰ Jahren. Jedes endet in einem letzten Blitz. Danach ist das Universum ein Meer aus Photonen.',
      en: 'The only large objects are black holes. They evaporate through Hawking radiation – one of solar mass in 10⁶⁷ years, the largest in 10¹⁰⁰ years. Each ends in a final flash. Afterwards the universe is a sea of photons.',
    },
    rows: {
      de: [['Zeitraum', '10⁴⁰ bis 10¹⁰⁰ Jahre'], ['Hawking-Temperatur (1 M☉)', '6 × 10⁻⁸ K'], ['Verdampfung 1 M☉', '10⁶⁷ Jahre'], ['Verdampfung 10¹¹ M☉', '~10¹⁰⁰ Jahre']],
      en: [['Period', '10⁴⁰ to 10¹⁰⁰ years'], ['Hawking temperature (1 M☉)', '6 × 10⁻⁸ K'], ['Evaporation, 1 M☉', '10⁶⁷ years'], ['Evaporation, 10¹¹ M☉', '~10¹⁰⁰ years']],
    },
    source: { de: 'Hawking 1974; Adams & Laughlin 1997', en: 'Hawking 1974; Adams & Laughlin 1997' },
  },
  {
    id: 'heatdeath', kind: 'future', t: 1e100, era: 'dead', hypothesis: true,
    title: { de: '<em>Wärmetod</em>', en: '<em>Heat Death</em>' },
    text: {
      de: 'Kein Stern, kein Schwarzes Loch, kein Temperaturgefälle mehr: ein kaltes, fast leeres Universum aus Photonen und Leptonen nahe dem absoluten Nullpunkt. Nichts geschieht mehr – vermutlich. Was danach kommt, weiss niemand.',
      en: 'No star, no black hole, no temperature gradient left: a cold, almost empty universe of photons and leptons near absolute zero. Nothing happens any more – probably. What comes after, nobody knows.',
    },
    rows: {
      de: [['Zeit', '10¹⁰⁰ Jahre und später'], ['Temperatur', '→ 10⁻³⁰ K (de-Sitter-Temperatur)'], ['Status', 'Hypothese']],
      en: [['Time', '10¹⁰⁰ years and beyond'], ['Temperature', '→ 10⁻³⁰ K (de Sitter temperature)'], ['Status', 'hypothesis']],
    },
    source: { de: 'Adams & Laughlin 1997; Dyson 1979', en: 'Adams & Laughlin 1997; Dyson 1979' },
  },
];

export const EVENT_BY_ID = new Map(EVENTS.map((e) => [e.id, e]));
