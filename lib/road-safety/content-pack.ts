import { RoadSafetyLesson, RoadSafetyModule, RoadSafetyQuestion, RoadSign, ExamTemplate, SourceCitation } from '@/lib/types';
import { repo } from '@/lib/db/repository';

/**
 * Road Safety Academy curriculum for Rwanda.
 *
 * Every rule, number and category below is taken from a cited primary or
 * official source and reviewed on the date in REVIEW_DATE. Material that could
 * not be confirmed in those instruments is listed in UNVERIFIED_TOPICS and is
 * taught as "not verified" instead of as law — it never becomes a marked
 * answer.
 *
 * Sources reviewed 2026-10-21:
 *  - Law N° 014/2026 of 06/03/2026 governing road traffic (OG n° Special of 10/03/2026)
 *  - Presidential Decree N° 85/01 of 02/09/2002 (general road rules / highway code)
 *  - Presidential Order N° 25/01 of 25/02/2015 (amends 85/01: Art. 30bis speeds, equipment)
 *  - Presidential Order N° 066/01 of 19/07/2024 (licence categories, tests, fees)
 *  - RURA Passengers Road Transport Regulations N°007/TRANS/RT/RURA/2015
 *  - Rwanda National Police service pages and IremboGov licence articles
 */

export const REVIEW_DATE = '2026-10-21';
export const CONTENT_PACK_VERSION = '1.0.0';

const LAW_2026: SourceCitation = {
  title: 'Law N° 014/2026 of 06/03/2026 governing road traffic',
  publisher: 'Official Gazette n° Special of 10/03/2026 (reproduced by Rwanda National Police)',
  url: 'https://police.gov.rw/uploads/tx_download/OG_n___Special_of_10.03.2026__Ikoreshwa_ry_umuhanda.pdf',
  accessedOn: REVIEW_DATE,
};

const DECREE_2002: SourceCitation = {
  title: 'Presidential Decree N° 85/01 of 02/09/2002 setting the general rules governing roads and their use',
  publisher: 'Rwanda National Police (bilingual gazette copy)',
  url: 'https://police.gov.rw/uploads/tx_download/Iteka_rya_Perezida_no_85_01_ryo_ku_wa_02_09_2002_rishyiraho_amabwiriza_rusange_agenga_imihanda_n_uburyo_bwo_kuyigendamo.pdf',
  accessedOn: REVIEW_DATE,
};

const ORDER_2015: SourceCitation = {
  title: 'Presidential Order N° 25/01 of 25/02/2015 amending Decree N° 85/01 of 02/09/2002',
  publisher: 'Official Gazette Special of 26/02/2015 (reproduced by Rwanda National Police)',
  url: 'https://police.gov.rw/uploads/tx_download/Traffic_Law_2015_02.pdf',
  accessedOn: REVIEW_DATE,
};

const ORDER_2024: SourceCitation = {
  title: 'Presidential Order N° 066/01 of 19/07/2024 amending Art. 6 and inserting Art. 6bis of Decree N° 85/01 (licence categories, tests and fees)',
  publisher: 'Rwanda Law Reform Commission / OG n° 30 ter of 22/07/2024',
  url: 'https://www.rlrc.gov.rw/fileadmin/user_upload/RLRC/Laws_of_Rwanda_v2/Domestic_laws/Laws_in_force/5._Security/5.2._Security_activities/5.2.2._Road_Traffic_Security/5.2.2.10._Presidential_Order_regulating_general_police_and_road_traffic__No_066-01_of_2024.pdf',
  accessedOn: REVIEW_DATE,
};

const RURA_PASSENGER: SourceCitation = {
  title: 'RURA Passengers Road Transport Regulations N°007/TRANS/RT/RURA/2015 of 01/06/2015',
  publisher: 'RURA',
  url: 'https://www.rura.rw/fileadmin/user_upload/RURA/Documents/Sectors/Transport/Regulatory_instruments/Transport_Regulations_and_Guidelines/Passengers_Road_Transport_Regulations_01.pdf',
  accessedOn: REVIEW_DATE,
};

const RNP_PDL: SourceCitation = {
  title: 'Rwanda National Police — Provisional Driving Licence (PDL)',
  publisher: 'police.gov.rw',
  url: 'https://police.gov.rw/services/testing-and-licencing/provisional-driving-licence-pdl/',
  accessedOn: REVIEW_DATE,
};

const RNP_DEFINITIVE: SourceCitation = {
  title: 'Rwanda National Police — Definitive Driving Licence',
  publisher: 'police.gov.rw',
  url: 'https://police.gov.rw/services/testing-and-licencing/definitive-driving-licence/',
  accessedOn: REVIEW_DATE,
};

const RNP_INSPECTION: SourceCitation = {
  title: 'Rwanda National Police — Automobile Inspection',
  publisher: 'police.gov.rw',
  url: 'https://police.gov.rw/services/automobile-inspection/',
  accessedOn: REVIEW_DATE,
};

const RNP_FINE_PAGE: SourceCitation = {
  title: 'Rwanda National Police — Traffic Fines',
  publisher: 'police.gov.rw',
  url: 'https://police.gov.rw/services/traffic-and-road-safety/traffic-fines/',
  accessedOn: REVIEW_DATE,
};

const IREMBO_PDL: SourceCitation = {
  title: 'IremboGov — Everything you need to know about getting your e-Provisional Driving Licence',
  publisher: 'support.irembo.gov.rw',
  url: 'https://support.irembo.gov.rw/en/support/solutions/articles/47001241773-everything-you-need-to-know-about-getting-your-e-provisional-driving-license',
  accessedOn: REVIEW_DATE,
};

const IREMBO_DEFINITIVE: SourceCitation = {
  title: 'IremboGov — How to apply for a definitive driving licence',
  publisher: 'support.irembo.gov.rw',
  url: 'https://support.irembo.gov.rw/en/support/solutions/articles/47001236141-how-to-apply-for-a-definitive-driving-license',
  accessedOn: REVIEW_DATE,
};

/** Facts that could not be confirmed in the instruments above. Taught as gaps. */
export const UNVERIFIED_TOPICS: Array<{ topic: string; why: string }> = [
  { topic: 'Fire extinguisher on board', why: 'Not listed among required items in Art. 88 of Decree 85/01 as amended. Do not teach it as a legal requirement without a cited instrument.' },
  { topic: 'Mobile phone use while driving', why: 'No express clause was found in Decree 85/01, Order 25/01/2015, Order 066/01/2024 or Law 014/2026. Police enforcement reporting exists only in secondary sources.' },
  { topic: 'Minimum age per licence category', why: 'Only a blanket 18+ to apply is confirmed on RNP/Irembo pages. Category-specific ages were not found in primary law.' },
  { topic: 'Child seat / booster technical rules', why: 'Only the ban on children under 12 in the front seat (Art. 66(3)) was confirmed.' },
  { topic: 'Fine amounts for speeding, helmet and seat belt', why: 'No fixed amounts appear in the instruments read; the demerit-point values await a Minister’s Order.' },
  { topic: 'Demerit point values per offence', why: 'Law 014/2026 Art. 25 creates the merit/demerit system, but the computing Minister’s Order was not published as of 2026-10-21.' },
  { topic: 'Breath-alcohol conversions (mg/L)', why: 'The law states 0.80 g per litre of blood only. Conversions would be our own arithmetic.' },
  { topic: 'Name of the agency that tests drivers', why: 'Testing and licensing is legally the national police body. Confusion with RTDA/RTSA naming persists online and is not resolved by the instruments.' },
];

type ModuleSeed = Omit<RoadSafetyModule, 'id' | 'createdAt' | 'updatedAt'> & { key: string };
type LessonSeed = Omit<RoadSafetyLesson, 'id' | 'createdAt' | 'updatedAt' | 'moduleId'> & { key: string; moduleKey: string };
type QuestionSeed = Omit<RoadSafetyQuestion, 'id' | 'createdAt' | 'updatedAt' | 'moduleId' | 'lessonId'> & { key: string; moduleKey: string; lessonKey?: string };
type SignSeed = Omit<RoadSign, 'id' | 'createdAt' | 'updatedAt'> & { key: string };
type ExamSeed = Omit<ExamTemplate, 'id' | 'createdAt' | 'updatedAt'> & { key: string };

const MODULES: ModuleSeed[] = [
  {
    key: 'basics',
    code: 'BASICS',
    titleEn: 'Rwandan road law basics',
    titleRw: 'Shingiro ry’amategeko y’imihanda',
    summaryEn: 'Which rules apply, who enforces them, and where the numbers come from.',
    summaryRw: 'Amategeko akurikizwa, abayashyira mu bikorwa, n’aho imibareiva.',
    sortOrder: 10,
    status: 'PUBLISHED',
  },
  {
    key: 'speed',
    code: 'SPEED',
    titleEn: 'Speed limits and alcohol',
    titleRw: 'Umuvuduko n’ibisindo',
    summaryEn: 'The numeric limits by vehicle class and place, plus the blood alcohol limit.',
    summaryRw: 'Imipaka y’umuvuduko hakurikijwe ubwoko bw’ikinyabiziga n’aho uri, n’urugero rw’inzoga.',
    sortOrder: 20,
    status: 'PUBLISHED',
  },
  {
    key: 'priority',
    code: 'PRIORITY',
    titleEn: 'Priority, junctions and roundabouts',
    titleRw: 'Gutambuka mbere, inkomane n’imizenguruko',
    summaryEn: 'Who goes first when nothing is signed, and what overrides what.',
    summaryRw: 'Uwahabwa uburenganzira iyo nta kimenyetso gihari, n’ibihindura ayo mategeko.',
    sortOrder: 30,
    status: 'PUBLISHED',
  },
  {
    key: 'signs',
    code: 'SIGNS',
    titleEn: 'Signs and road markings',
    titleRw: 'Ibyapa n’imirongo y’umuhanda',
    summaryEn: 'The three sign families, their shapes and colours, and what painted lines mean.',
    summaryRw: 'Amoko atatu y’ibyapa, imiterere yabyo n’amabara, hamwe n’ibisobanuro by’imirongo.',
    sortOrder: 40,
    status: 'PUBLISHED',
  },
  {
    key: 'licence',
    code: 'LICENCE',
    titleEn: 'Licences, tests and documents',
    titleRw: 'Impushya, ibizamini n’inyandiko',
    summaryEn: 'Categories A–F, the two-stage test, pass marks and fees.',
    summaryRw: 'Ibyiciro A–F, ikizamini cy’ibice bibiri, amanota n’ibishyurwa.',
    sortOrder: 50,
    status: 'PUBLISHED',
  },
  {
    key: 'vehicle',
    code: 'VEHICLE',
    titleEn: 'Vehicle equipment and inspection',
    titleRw: 'Ibikoresho by’ikinyabiziga n’isuzuma',
    summaryEn: 'What must be on board, how often inspection is due, and priority-vehicle rules.',
    summaryRw: 'Ibigomba kuba mu modoka, iyo isuzuma riba, n’amabwiriza y’ibinyabiziga bifite uburenganzira.',
    sortOrder: 60,
    status: 'PUBLISHED',
  },
  {
    key: 'penalties',
    code: 'PENALTIES',
    titleEn: 'Penalties, payment and open questions',
    titleRw: 'Ibihano, kwishyura n’ibitarasobanukirwa',
    summaryEn: 'Verified fine ranges, payment windows, and the topics we could not confirm.',
    summaryRw: 'Ibihano byemejwe, igihe cyo kubyishyura, n’ibibazo bitarasobanurwa neza.',
    sortOrder: 70,
    status: 'PUBLISHED',
  },
];

const LESSONS: LessonSeed[] = [
  {
    key: 'which-rules',
    moduleKey: 'basics',
    titleEn: 'Which rules govern Rwandan roads',
    titleRw: 'Amategeko agenga imihanda mu Rwanda',
    bodyEn:
      'Road traffic in Rwanda is governed by Law N° 014/2026 of 06/03/2026, published in Official Gazette n° Special of 10/03/2026. That law repealed the 1987 police-du-roulage law and sets the framework: licences, technical inspection, penalties and a merit/demerit point system.\n' +
      'The detailed driving rules people are tested on — speeds, priority, signs, markings, onboard equipment — come from Presidential Decree N° 85/01 of 02/09/2002, as amended by Presidential Order N° 25/01 of 25/02/2015 and Presidential Order N° 066/01 of 19/07/2024.\n' +
      'One thing to know: the new law leaves several details (such as how demerit points are computed) to a Minister’s Order that had not been published when this curriculum was reviewed. Where that happens we say so instead of guessing.',
    bodyRw:
      'Ikoreshwa ry’imihanda mu Rwanda ngengwa n’Itegeko N° 014/2026 ryo ku wa 06/03/2026, ryashyizwe mu Gazeti ya Leta n° Special yo ku ya 10/03/2026. Iri tegeko ryasimbuye itegeko rya 1987 kandi rishyiraho urubaho: impushya, isuzuma ry’ibinyabiziga, ibihano n’amanota y’ishimwe/ibibaho.\n' +
      'Amabwiriza arambuye abantu bakorerwa ikizamini — umuvuduko, gutambuka mbere, ibyapa, imirongo y’umuhanda n’ibikoresho — ava mu Iteka rya Perezida N° 85/01 ryo ku wa 02/09/2002, ryavuguruwe n’Iteka N° 25/01 ryo ku wa 25/02/2015 ndetse n’Iteka N° 066/01 ryo ku wa 19/07/2024.\n' +
      'Icyo ugomba kumenya: itegeko rishya risiga ibisobanuro bimwe (nk’uburyo amanota y’ibibaho adibwa) ku Iteka rya Minisitiri ritari ryasohoka igihe ibi bikorwaga. Aho byabaye, tubivuga aho kubiha.',
    keyPointsEn: [
      'Current primary law: Law N° 014/2026 of 06/03/2026 (OG Special of 10/03/2026).',
      'Detailed driving rules still applied: Decree 85/01 of 2002, amended by Orders 25/01/2015 and 066/01/2024.',
      'Some points of the new law await a Minister’s Order — they are flagged, not invented.',
    ],
    keyPointsRw: [
      'Itegeko ririho: Itegeko N° 014/2026 ryo ku wa 06/03/2026 (Gazeti Special yo ku ya 10/03/2026).',
      'Amabwiriza arambuye akurikizwa: Iteka 85/01 rya 2002, ryavuguruwe n’Amateka 25/01/2015 na 066/01/2024.',
      'Ibitega bimwe birindiriwe iteka rya Minisitiri — turabibwira aho kubihimbaza.',
    ],
    citations: [LAW_2026, DECREE_2002, ORDER_2015, ORDER_2024],
    legalVerifiedAt: REVIEW_DATE,
    lastReviewedBy: 'Aguka content review (documentary sources)',
    status: 'PUBLISHED',
    sortOrder: 10,
  },
  {
    key: 'drive-right',
    moduleKey: 'basics',
    titleEn: 'Drive on the right, pedestrians first',
    titleRw: 'Genda iburyo, abanyamaguru mbere',
    bodyEn:
      'Rwanda drives on the right-hand side of the road (Art. 4 of Law N° 014/2026, and throughout Decree 85/01). Vehicles travelling in opposite directions pass each other on their left.\n' +
      'Art. 27 of Decree 85/01 requires a driver to slow down and stop at a pedestrian crossing for people on it. Priority vehicles — national police, fire brigade and ambulances on an emergency mission with their special warnings on — must be given way to and, if needed, the road cleared (Art. 2(31), Arts. 36–37).',
    bodyRw:
      'Mu Rwanda ibinyabiziga bigenda ku ruhande rw’iburyo rw’umuhanda (Art. 4 y’Itegeko N° 014/2026, n’amabwiriza y’Iteka 85/01). Imodoka zihurira zicamagurana ziri ibumoso bwazo.\n' +
      'Art. 27 y’Iteka 85/01 isaba umushoferi kugabanya umuvuduko no guhagarara aho abanyamaguru bambukira iyo bari ku nzira yabo. Ibinyabiziga bifite uburenganzira (polisi, zimya no kuvuna) bigomba guhabwa inzira (Art. 2(31), Arts. 36–37).',
    keyPointsEn: [
      'Traffic keeps to the right.',
      'Slow down and stop at pedestrian crossings (Art. 27).',
      'Give way to police, fire and ambulance vehicles on emergency missions.',
    ],
    keyPointsRw: [
      'Ngenda iburyo.',
      'Gabanya umuvuduko uhagari aho abanyamaguru bambukira (Art. 27).',
      'Ha inzira polisi, zimya ndetse na ambulans iyo zikora inshingano z’utabazi.',
    ],
    citations: [LAW_2026, DECREE_2002],
    legalVerifiedAt: REVIEW_DATE,
    lastReviewedBy: 'Aguka content review (documentary sources)',
    status: 'PUBLISHED',
    sortOrder: 20,
  },
  {
    key: 'speed-limits',
    moduleKey: 'speed',
    titleEn: 'Speed limits by vehicle and place',
    titleRw: 'Imipaka y’umuvuduko hakurikijwe ikinyabiziga n’ahantu',
    bodyEn:
      'Inside towns and villages (agglomerations), Art. 29 of Decree 85/01 sets 50 km/h for private passenger cars and vehicles up to 1 tonne, and 40 km/h for all other vehicles. Local authority or the Minister in charge of Public Works may set different limits on a given road, so always read the signs.\n' +
      'Outside agglomerations the same article sets: 80 km/h for motorcycles and vehicles up to 3.5 tonnes (except taxis and public transport), 70 km/h for taxis, 60 km/h for vehicles of 3.5–12.5 tonnes and public transport other than taxis, 50 km/h for vehicles over 12.5 tonnes and mopeds, and 25 km/h for agricultural and special vehicles.\n' +
      'Presidential Order N° 25/01 of 2015 added Art. 30bis, which caps public people-transport and goods-transport vehicles at 60 km/h and requires a speed governor fitted to them. That later, specific rule is the one to apply for buses, coaches and trucks.',
    bodyRw:
      'Mu mijyi no mu tunyi (Art. 29 y’Iteka 85/01): 50 km/h ku modoka z’abasyiri n’iziri munsi ya toni 1; 40 km/h ku zindi zose. Ubuyobozi bw’akarere cyangwa Minisitiri w’imihanda bashobora gushyiraho undi muvuduko, bityo soma ibyapa.\n' +
      'Hanze y’umujyi: 80 km/h kuri moteri n’ibinyabiziga biri munsi ya toni 3,5 (uretse za furari zo gutwara abantu), 70 km/h kuri moritari, 60 km/h ku binyabiziga bya toni 3,5 kugeza 12,5 n’izindi modoka zitwara abantu, 50 km/h ku zirenga toni 12,5 na mopede, 25 km/h ku bikoresho by’ubuhinzi.\n' +
      'Iteka N° 25/01 rya 2015 ryongeyeho Art. 30bis: ibinyabiziga bitwara abantu n’ibitwara ibintu ntibigomba kurenza 60 km/h kandi bigomba kugira igipimo kizitiza umuvuduko (speed governor).',
    keyPointsEn: [
      'In town: 50 km/h (cars and ≤1 t), 40 km/h (everything else).',
      'Outside town: 80 km/h for motorcycles and light vehicles, 70 km/h for taxis.',
      'Public passenger and goods transport: 60 km/h maximum, with a mandatory speed governor.',
      'Signs and local decisions can lower or change these numbers.',
    ],
    keyPointsRw: [
      'Mu mujyi: 50 km/h (izoroheje), 40 km/h (izindi zose).',
      'Hanze y’umujyi: 80 km/h kuri moteri n’izoroheje, 70 km/h kuri moritari.',
      'Izotwara abantu cyangwa ibintu: ntizirenze 60 km/h kandi zifite speed governor.',
      'Ibyapa n’imyanzuro y’aho bituma imipaka ihinduka.',
    ],
    citations: [DECREE_2002, ORDER_2015],
    legalVerifiedAt: REVIEW_DATE,
    lastReviewedBy: 'Aguka content review (documentary sources)',
    status: 'PUBLISHED',
    sortOrder: 10,
  },
  {
    key: 'alcohol',
    moduleKey: 'speed',
    titleEn: 'Alcohol and driving',
    titleRw: 'Inzoga no gutwara',
    bodyEn:
      'Art. 9 of Law N° 014/2026 states that no driver may have alcohol exceeding 0.80 gram per litre of blood. The same article allows the Minister to set a lower limit for particular categories of driver.\n' +
      'Refusing a test is itself an offence (Art. 38). We deliberately do not convert this figure into breath or urine units, because the law is written in grams per litre of blood and any conversion would be our own arithmetic.',
    bodyRw:
      'Art. 9 y’Itegeko N° 014/2026 ivuga ko nta mushoferi wemerewe kuba yanyoye inzoga zirenze garama 0.80 muri litiro imwe y’amaraso. Minisitiri ashobora kugabanya uwo mubare ku bwoko bw’abashoferi.\n' +
      'Kwanga gupimwa na byo ni icyaha (Art. 38). Ntiduhindura uwo mubare mu zindi ngero (umwuka/inkari) kuko itegeko ryanditse muri garama kuri litiro y’amaraso.',
    keyPointsEn: [
      'Legal ceiling: 0.80 g of alcohol per litre of blood (Art. 9).',
      'A lower limit may be fixed for some driver categories.',
      'Refusing to be tested is punishable (Art. 38).',
    ],
    keyPointsRw: [
      'Urugero rwo hejuru: garama 0.80 kuri litiro imwe y’amaraso (Art. 9).',
      'Hashobora gushyirwaho urugero ruri hasi ku bashoferi bamwe.',
      'Kwanga gupimwa birahanwa (Art. 38).',
    ],
    citations: [LAW_2026],
    legalVerifiedAt: REVIEW_DATE,
    lastReviewedBy: 'Aguka content review (documentary sources)',
    status: 'PUBLISHED',
    sortOrder: 20,
  },
  {
    key: 'priority-rules',
    moduleKey: 'priority',
    titleEn: 'Who goes first',
    titleRw: 'Ni uwahita mbere',
    bodyEn:
      'At a junction that carries no signals, Art. 16 of Decree 85/01 gives priority to the vehicle arriving from the right. The same article requires you to give way to vehicles already inside a roundabout.\n' +
      'If traffic lights fail, the ordinary right-hand priority rule applies again. Art. 91 makes the order of authority explicit: traffic light signals override road signs and road markings.\n' +
      'Art. 15 sets surrender-of-passage rules (for example, on a narrow road the vehicle going downhill generally lets the one climbing pass, and obstruction is cleared on the side of the driver who has the easier room to pull in) — read the article text for the exact case you are teaching.',
    bodyRw:
      'Ku nkomane idafite ibimenyetso, Art. 16 y’Iteka 85/01 itanga uburenganzira ku uje iburyo. Iyo ngingo isaba no gutambukira abamaze kwinjira mu muzenguruko.\n' +
      'Iyo amatara y’ibimenyetso azimye, hakurikizwa uburenganzira bw’uje iburyo. Art. 91 igaragaza urutonde: amatara aruta ibyapa n’imirongo.\n' +
      'Art. 15 iteganya guhana inzira (urugero: ku nzira y’igitigiri umanuka areka uzamuka). Sobanukirwa iyo ngingo mu nyandiko y’umwimerere.',
    keyPointsEn: [
      'No sign? Priority to the vehicle coming from the right (Art. 16).',
      'In a roundabout, give way to traffic already in it.',
      'Traffic lights override signs and markings (Art. 91).',
    ],
    keyPointsRw: [
      'Nta kimenyetso? Uburenganzira bwa uje iburyo (Art. 16).',
      'Mu muzenguruko tambukira abawurimo (Art. 16).',
      'Amatara aruta ibyapa n’imirongo (Art. 91).',
    ],
    citations: [DECREE_2002],
    legalVerifiedAt: REVIEW_DATE,
    lastReviewedBy: 'Aguka content review (documentary sources)',
    status: 'PUBLISHED',
    sortOrder: 10,
  },
  {
    key: 'sign-families',
    moduleKey: 'signs',
    titleEn: 'The three sign families and what they look like',
    titleRw: 'Amoko atatu y’ibyapa n’imiterere yabyo',
    bodyEn:
      'Art. 92 of Decree 85/01 groups road signs into three families: (1) danger and priority signs, (2) prohibition and obligation signs, (3) indication signs.\n' +
      'Art. 93 and the annexes fix the visual code: danger and priority boards are equilateral triangles with a white background and a red border; prohibition discs are white with a red border (stop and parking boards use blue); obligation discs are blue; indication signs follow Annex 4.\n' +
      'Art. 94 places signs on the right side of the road, and outside agglomerations 150–200 m before the danger so that a driver has time to react.',
    bodyRw:
      'Art. 92 y’Iteka 85/01 igabanya ibyapa mu matsinda atatu: (1) iby’akaga n’uburenganzira, (2) ibya hagati n’amabwiriza, (3) ibyerekeza.\n' +
      'Art. 93 n’ibyomeka (annexes) bigena imiterere: iby’akaga ni mpandeshatu zingana, zifite umusozo utukura n’inyuma y’umweru; ibyapa bibujije ni imizenguruko y’umweru zifite umusozo utukura (guhagarara no guparika bikoresha ubururu); iby’amabwiriza ni umuzenguruko w’ubururu; ibyerekeza bigendana na Annex 4.\n' +
      'Art. 94 bishyira ibyapa iburyo, kandi hanze y’umujyi bishyirwa 150–200 m mbere y’akaga.',
    keyPointsEn: [
      'Danger / priority: equilateral triangle, white ground, red border.',
      'Prohibition: round, white with red border. Obligation: round, blue.',
      'Indication signs follow Annex 4.',
      'Signs stand on the right; 150–200 m before a danger outside towns.',
    ],
    keyPointsRw: [
      'Akaga: mpandeshatu, umusozo utukura, inyuma y’umweru.',
      'Hagiye: umuzenguruko w’umweru ufite umusozo utukura. Amabwiriza: umuzenguruko w’ubururu.',
      'Ibyerekeza bigendana na Annex 4.',
      'Ibyapa biri iburyo; hanze y’umujyi bishyirwa 150–200 m.',
    ],
    citations: [DECREE_2002],
    legalVerifiedAt: REVIEW_DATE,
    lastReviewedBy: 'Aguka content review (documentary sources)',
    status: 'PUBLISHED',
    sortOrder: 10,
  },
  {
    key: 'markings',
    moduleKey: 'signs',
    titleEn: 'Reading the lines painted on the road',
    titleRw: 'Gusoma imirongo y’umuhanda',
    bodyEn:
      'Art. 110 of Decree 85/01: a continuous (solid) white line separating two directions must not be crossed, and you must not drive along its left. A broken white line may be crossed only to overtake, turn, make a U-turn or change direction. A broken yellow line means parking is prohibited. Dash lengths run from 1 to 5 m with 3 to 15 m between them.\n' +
      'Art. 111 covers transverse markings: a wide continuous white band is the stop line (used with the stop board or lights); a row of white triangles means give way; a pedestrian crossing (zebra) is delimited by white lines parallel to the carriageway.',
    bodyRw:
      'Art. 110: umurongo ugororotse (wuzuye) utandukanya ibyerekezo byombi ntiwambukirwaho, kandi nturirugendeswa ibumoso bwawo. Umurongo ucikacikanye unyurwaho gusa iyo urenga, uhindukira cyangwa ugera ku muhanda utandukanye. Umurongo w’umuhondo ucikacikanye uvuga ko guhagarika itemewe. Ibice byawo bingana na 1–5 m hakagira 3–15 m hagati.\n' +
      'Art. 111: umurongo mugari wuzuye ni wo guhagararaho (stop); uruhererekane rwa mpandeshatu z’umweru risobanura “tambukira”; aho abanyamaguru bambukira kandi nigimeze cya mirongo y’umweru ibangikanye n’umuhanda.',
    keyPointsEn: [
      'Solid white line: do not cross.',
      'Broken white line: crossing allowed only to overtake, turn, U-turn or change line.',
      'Broken yellow: no parking.',
      'Wide solid band = stop line; row of triangles = give way; zebra = pedestrian crossing.',
    ],
    keyPointsRw: [
      'Umurongo wuzuye: ntiwambuka.',
      'Uwicikanyije: wambukwa gusa kugira ngo urenga, uhindukire cyangwa uhindure icyerekezo.',
      'Umuhondo ucikacikanye: nta guhagarika imodoka.',
      'Mugari wuzuye = guhagarara; mpandeshatu = tambukira; zebra = abanyamaguru.',
    ],
    citations: [DECREE_2002],
    legalVerifiedAt: REVIEW_DATE,
    lastReviewedBy: 'Aguka content review (documentary sources)',
    status: 'PUBLISHED',
    sortOrder: 20,
  },
  {
    key: 'categories',
    moduleKey: 'licence',
    titleEn: 'Licence categories A to F',
    titleRw: 'Ibyiciro by’uruhushya A kugeza F',
    bodyEn:
      'Art. 6 of Decree 85/01 as restated by Presidential Order N° 066/01 of 19/07/2024 defines the categories: A motorcycles; A1 adapted motorcycles for drivers with disabilities; B vehicles carrying up to 8 passengers besides the driver, goods vehicles up to 3,500 kg and quadricycles; B1 vehicles adapted for drivers with disabilities; C goods vehicles over 3,500 kg; D passenger vehicles of more than 8 and up to 30 seats; D1 more than 30 seats; E a B, C or D vehicle towing a trailer over 750 kg; F tractors, bulldozers, cranes and similar machines. Vehicles not otherwise classified fall under B, and an “AT” endorsement restricts the holder to automatic vehicles.\n' +
      'The licence is issued by the national police body responsible for road safety, after a medical certificate and the exams (Law N° 014/2026 Art. 23; Order 066/01/2024 Art. 6).',
    bodyRw:
      'Art. 6 y’Iteka 85/01 nk’uko Iteka N° 066/01 ryo ku wa 19/07/2024 ryarisobanuye: A amapikipiki; A1 ayahinduwe ku bafite ubumuga; B izitwara abagenzi 8 batareba umushoferi, izisiga ibintu toni 3,5 n’izo mu bwoko bwa quadricycle; B1 izahinduwe ku bafite ubumuga; C izisiga ibintu zirenza toni 3,5; D izitwara abantu barenza 8 kugeza 30; D1 izirenza 30; E iyo ucurikirije igisiga kirenga kg 750; F matagari, mashini z’ubwubatsi n’izisa.\n' +
      'Uruhushya rutangwa n’urwego rw’igihugu rw’igipolisi rushinzwe umutekano w’imihanda nyuma ya raporo y’ubuzima n’ibizamini (Itegeko 014/2026 Art. 23; Iteka 066/01/2024 Art. 6).',
    keyPointsEn: [
      'A = motorcycle, A1 = adapted motorcycle.',
      'B = up to 8 passengers / goods up to 3,500 kg. C = goods above 3,500 kg.',
      'D = 9–30 seats, D1 = more than 30 seats, E = trailer above 750 kg, F = tractors and machines.',
      '“AT” endorsement = automatic vehicles only.',
    ],
    keyPointsRw: [
      'A = ipikipiki, A1 = iyahinduwe.',
      'B = abagenzi 8 / ibintu bitarenza toni 3,5. C = ibirenza toni 3,5.',
      'D = imyanya 9–30, D1 = irenga 30, E = igisiga kirenga kg 750, F = matagari.',
      '“AT” = imodoka zikoresha gusa automatique.',
    ],
    citations: [ORDER_2024, DECREE_2002, LAW_2026],
    legalVerifiedAt: REVIEW_DATE,
    lastReviewedBy: 'Aguka content review (documentary sources)',
    status: 'PUBLISHED',
    sortOrder: 10,
  },
  {
    key: 'two-stage-test',
    moduleKey: 'licence',
    titleEn: 'The two-stage test: theory then practical',
    titleRw: 'Ikizamini kigizwe n’ibice bibiri: inyandiko n’ukutwara',
    bodyEn:
      'You pass in two stages. The theory (written) exam gives you a provisional driving licence; the practical driving exam then gives the definitive licence (Order 066/01/2024 Art. 6, Law N° 014/2026 Art. 23).\n' +
      'The Rwanda National Police service page states that at least 60 marks are needed to pass the theory test; IremboGov, the government portal, expresses the same rule as 60% or above at the Busanza Automated Test Center, and 12 or more out of 20 at other centres.\n' +
      'For the practical test the RNP definitive-licence page states that you must obtain 100% marks — meaning no major fault. That figure comes from the service page, not from the statute, so treat it as the operating rule of the testing authority.\n' +
      'To apply you must be at least 18 (RNP and IremboGov). Applying for the e-PDL must happen within two years of passing the theory test.',
    bodyRw:
      'Uzamini mu bice bibiri. Ikizamini cyanditse guha uruhushya rw’agateganyo; ikizamini cy’ubumenyi ngiro kigaha urwo guhera aho (Iteka 066/01/2024 Art. 6; Itegeko 014/2026 Art. 23).\n' +
      'Urupapuro rwa RNP rusobanura ikizamini cy’agateganyo rusaba nibura amanota 60; Irembo rigaragaza 60% cyangwa hejuru kuri Busanza Automated Test Center, cyangwa 12 muri 20 ahandi.\n' +
      'Ku kizamini cy’ingiro, urupapuro rwa RNP rusaba 100% — ni ukuvuga ko nta makosa manini wakoze. Umubare uva ku murongo wa serivisi, atari ku itegeko, bityo uyufate nk’agaciro k’uburyo abagenzura bakurikiza.\n' +
      'Ugomba kuba ufite nibura imyaka 18. Gusesa e-PDL bigomba kuba mu myaka ibiri umaze gutsinda ikizamini cyanditse.',
    keyPointsEn: [
      'Theory exam → provisional licence; practical exam → definitive licence.',
      'Theory pass mark: at least 60 marks / 60% (12 out of 20 at some centres) — RNP and IremboGov.',
      'Practical: RNP service page requires 100% (no major faults).',
      'Minimum age to apply: 18. Apply for the e-PDL within two years.',
    ],
    keyPointsRw: [
      'Ikizamini cyanditse → uruhushya rw’agateganyo; icy’ingiro → urwa nyirizina.',
      'Amanota: nibura 60 / 60% (cyangwa 12 kuri 20) — RNP na Irembo.',
      'Icy’ingiro: RNP isaba 100% (nta kosa rinini).',
      'Imyaka nibura 18; e-PDL mu myaka ibiri.',
    ],
    citations: [RNP_PDL, RNP_DEFINITIVE, IREMBO_PDL, ORDER_2024, LAW_2026],
    legalVerifiedAt: REVIEW_DATE,
    lastReviewedBy: 'Aguka content review (documentary sources)',
    status: 'PUBLISHED',
    sortOrder: 20,
  },
  {
    key: 'provisional-licence',
    moduleKey: 'licence',
    titleEn: 'Driving on a provisional licence',
    titleRw: 'Kutwara ufite uruhushya rw’agateganyo',
    bodyEn:
      'Order 066/01 of 2024 keeps the provisional licence valid for one year, renewable once. A provisional holder must be accompanied by a qualified instructor and the vehicle must display the blue “L” board with a white letter at least 15 cm across, together with an AUTO-ECOLE / DRIVING SCHOOL plate.\n' +
      'Published fees from the same order and IremboGov: definitive licence 50,000 FRW (plus 10,000 FRW per extra category), provisional 10,000 FRW, duplicate 25,000 FRW, provisional renewal 5,000 FRW, exchange of a foreign licence 50,000 FRW, international licence 50,000 FRW; theory/practical exam fees 10,000 FRW for the definitive licence and 5,000 FRW for the provisional one. The card is issued for 10 years before renewal.',
    bodyRw:
      'Iteka 066/01 rya 2024 rigumisha uruhushya rw’agateganyo umwaka umwe, rushobora kongerwa rimwe. Urukubye agomba kuba ari kumwe n’umwigisha wemewe, kandi imodoka igomba kugaragaza ikimenyetso cy’ubururu “L” gifite urupapo rw’umweru nibura cm 15, hamwe na “AUTO-ECOLE / DRIVING SCHOOL”.\n' +
      'Igiciro cyashyizwe hanze: urwa nyirizina 50,000 FRW (+10,000 buri cyiciro kindi), urw’agateganyo 10,000, inkomere 25,000, kongera agateganyo 5,000, guhindura urw’amahanga 50,000, urwa mpuzamahanga 50,000; ikizamini 10,000 (nyirizina) na 5,000 (agateganyo). Karita ikorana imyaka 10.',
    keyPointsEn: [
      'Provisional licence: 1 year, renewable once.',
      'Must be accompanied by a qualified instructor.',
      'Blue “L” board, white letter, at least 15 cm, plus a driving-school plate.',
      'Definitive licence 50,000 FRW; +10,000 FRW per additional category.',
    ],
    keyPointsRw: [
      'Urw’agateganyo: umwaka umwe, rwongewa rimwe.',
      'Agomba kuba kumwe n’umwigisha wemewe.',
      'Ikimenyetso “L” cya bururu, cm 15 nibura, na plate ya AUTO-ECOLE.',
      'Urw’inyirizina: 50,000 FRW; +10,000 buri cyiciro.',
    ],
    citations: [ORDER_2024, IREMBO_DEFINITIVE],
    legalVerifiedAt: REVIEW_DATE,
    lastReviewedBy: 'Aguka content review (documentary sources)',
    status: 'PUBLISHED',
    sortOrder: 30,
  },
  {
    key: 'equipment',
    moduleKey: 'vehicle',
    titleEn: 'What the law requires to be on board',
    titleRw: 'Ibyo itegeko risaba mu modoka',
    bodyEn:
      'Art. 88 of Decree 85/01, as amended by Order 25/01 of 2015, lists the required equipment: a warning triangle described as “icyapa kiburira cya mpandeshatu”, equilateral with a side of at least 40 cm and a red border of at least 5 cm; a first-aid kit (“agahago k’ubutabazi”) containing at least four sterile bandages, four clips or pins, a disinfectant and a mouth-to-mouth aid, labelled to say it is for emergency help while a doctor is awaited; and an anti-theft device. The same article requires the steering position on the left, a speedometer on vehicles designed above 40 km/h, and seat belts on vehicles carrying fewer than six occupants.\n' +
      'RURA’s passenger transport regulations add that, in an emergency, the driver and/or conductor of a public transport vehicle must put on a reflector waistcoat, and place the warning triangle 15 m from the vehicle in inhabited areas and 30 m outside them.\n' +
      'A fire extinguisher and a mobile-phone ban are NOT in the instruments we reviewed. They are treated as unverified in this academy — see the penalties and open questions module.',
    bodyRw:
      'Art. 88 y’Iteka 85/01 nk’uko ryavuguruwe n’Iteka 25/01 rya 2015 isabira mu modoka: icyapa kiburira cya mpandeshatu gifite uruhande nibura cm 40 n’umusozo utukura nibura cm 5; agahago k’ubutabazi gafite nibura amabande 4 meza, “clips/pins” 4, umuti wo koza n’igikoresho cyo guhumusha, cyanditse kivuga ko ari ubutabazi bwihutirwa muganga ategerejwe; n’igikoresho cyo kurinda ubujujugu. Iyo ngingo kandi isaba utwerezabutumwa ibumoso, igipimo cy’umuvuduko ku modoka zirenga 40 km/h, n’imikandara yo kurinda ibyago ku zitagira abantu 6.\n' +
      'Amabwiriza ya RURA y’abagenzi yongeraho ko mu gihe cy’akaga, umushoferi n’umufasha we bafite reflector waistcoat, kandi icyapa gishyirwa kuri metero 15 mu mijyi na 30 hanze yayo.\n' +
      'Umuzima w’umuriro (extinguisher) n’ikoreshwa rya telefone utwaye ntibiri mu nyandiko twasuzumye. Bifatwa nk’ibitarasobanuwe — reba isomo ry’ibihano.',
    keyPointsEn: [
      'Warning triangle: equilateral, side ≥ 40 cm, red border ≥ 5 cm (Art. 88).',
      'First-aid kit with at least 4 sterile bandages, 4 clips/pins, disinfectant and mouth-to-mouth aid.',
      'Anti-theft device required; seat belts required for vehicles with fewer than six occupants.',
      'Public transport: reflector waistcoat in an emergency; triangle at 15 m in towns, 30 m outside (RURA).',
    ],
    keyPointsRw: [
      'Icyapa cya mpandeshatu: uruhande ≥ cm 40, umusozo utukura ≥ cm 5 (Art. 88).',
      'Agahago k’ubutabazi: amabande 4, clips 4, umuti wo koza, igikoresho cyo guhumusha.',
      'Gikenewe cyo kurinda ubujujugu; imikandara ku zitagira abantu 6.',
      'Abagenzi: waistcoat mu akaga; icyapa kuri m 15 mu mujyi, m 30 hanze (RURA).',
    ],
    citations: [DECREE_2002, ORDER_2015, RURA_PASSENGER],
    legalVerifiedAt: REVIEW_DATE,
    lastReviewedBy: 'Aguka content review (documentary sources)',
    status: 'PUBLISHED',
    sortOrder: 10,
  },
  {
    key: 'inspection',
    moduleKey: 'vehicle',
    titleEn: 'Technical inspection, seat belts, helmets and children',
    titleRw: 'Isuzuma rya tekiniki, imikandara, ingofero n’abana',
    bodyEn:
      'Arts. 141–142 of Decree 85/01 make technical control compulsory: the first visit two years after the vehicle was first put into circulation, then every six months for public people transport, goods vehicles over 3,500 kg and driving-school vehicles, and once a year for everything else. The RNP inspection page adds that a failed vehicle returns within 14 days for a second visit at 20% of the original fee, and that outstanding fines must be cleared first.\n' +
      'Art. 47 requires the driver and the front-right passenger to wear seat belts. Decree 85/01 requires drivers and passengers of motorcycles and scooters to wear fastened helmets. Art. 66(3) forbids carrying children under 12 on the front seat when other seats are available.',
    bodyRw:
      'Art. 141–142 z’Iteka 85/01 zituma isuzuma rya tekiniki riba itegeko: bwa mbere nyuma y’imyaka ibiri imodoka itangiye gukoreshwa, nyuma amezi 6 ku z’abagenzi, izisiga ibintu zirenza toni 3,5 n’iz’amashuri yo gutwara; umwaka umwe ku zindi. RNP yongeraho ko iyangiwe isubira mu minsi 14 ikishyura 20% by’igiciro cya mbere, kandi ko ibihano bitishyurwe bigomba kubanza.\n' +
      'Art. 47 isaba umushoferi n’uwicara iburyo kwambara umukandara. Iteka 85/01 risaba abagendera ku mapikipiki kwambara ingofero bazifatanije. Art. 66(3) ibuza abana bari munsi y’imyaka 12 kwicara imbere iyo hari intebe zindi.',
    keyPointsEn: [
      'First inspection at 2 years; then 6-monthly for commercial, heavy goods and driving-school vehicles, yearly for others.',
      'Seat belts mandatory for driver and front-right passenger (Art. 47).',
      'Fastened helmets for motorcycle drivers and passengers.',
      'Children under 12 may not sit in front when other seats are available (Art. 66(3)).',
    ],
    keyPointsRw: [
      'Isuzuma bwa mbere ku myaka 2; amezi 6 ku z’abagenzi n’izindege; umwaka ku zindi.',
      'Imikandara ku mushoferi n’uwo iburyo (Art. 47).',
      'Ingofero zifatanije kuri pikipiki (umushoferi n’umagenzi).',
      'Abana bari munsi y’imyaka 12 ntibicara imbere iyo hari intebe zindi (Art. 66(3)).',
    ],
    citations: [DECREE_2002, RNP_INSPECTION],
    legalVerifiedAt: REVIEW_DATE,
    lastReviewedBy: 'Aguka content review (documentary sources)',
    status: 'PUBLISHED',
    sortOrder: 20,
  },
  {
    key: 'penalties',
    moduleKey: 'penalties',
    titleEn: 'Verified penalties and how fines are paid',
    titleRw: 'Ibihano byemejwe n’uburyo bwo kubyishyura',
    bodyEn:
      'Law N° 014/2026 fixes these ranges: drink-driving above 0.80 g/L costs 100,000–400,000 FRW and 3–6 months imprisonment for drivers of public, school, staff or tourist transport, vehicles over 3.5 tonnes or income-generating transport, and 150,000–300,000 FRW and/or up to 10 days detention for others; at twice the limit or more the fine is 200,000–500,000 FRW with 3–6 months (Art. 37). Refusing a test costs 300,000–600,000 FRW, or 400,000–600,000 FRW plus custody for professional drivers (Art. 38). Refusing to stop at a police signal costs 400,000–700,000 FRW and 3–6 months (Art. 39). Driving without a licence costs 100,000–200,000 FRW and/or 15–30 days (Art. 40). A repeat offence can reach double the maximum.\n' +
      'Art. 34 requires administrative fines to be paid within 30 days, with a 30% surcharge after that; Art. 19 caps impoundment at three months; Art. 28 lets a court revoke a licence with a twelve-month ban.\n' +
      'Note a real discrepancy you must be able to explain: the RNP e-ticket page tells road users to pay traffic infringement fees within three days, while the law’s administrative-fine window is thirty days. Both figures are official and apply to different instruments.',
    bodyRw:
      'Itegeko N° 014/2026 ritanga ibi: kunywa inzoga zirenze 0,80 g/L ni ihazabu ya 100,000–400,000 FRW n’igifungo cy’amezi 3–6 ku bashoferi b’abagenzi, abana, abakozi, abashyitsi, ibinyabiziga birenza toni 3,5 cyangwa ibikora amafaranga; 150,000–300,000 FRW na/ni kugeza iminsi 10 ku bandi; niba ari inshuro ebyiri cyangwa hejuru ni 200,000–500,000 FRW n’amezi 3–6 (Art. 37). Kwanga gupimwa ni 300,000–600,000 FRW, cyangwa 400,000–600,000 n’igifungo ku b’umwuga (Art. 38). Kwanga guhagarira polisi ni 400,000–700,000 FRW n’amezi 3–6 (Art. 39). Kutagira uruhushya ni 100,000–200,000 FRW na/ni iminsi 15–30 (Art. 40). Inshuro ya kabiri yishyura kugeza kabiri ku mubare wa hejuru.\n' +
      'Art. 34 isaba kwishyura ihazabu mu minsi 30, hongerwaho 30% iyo bitakubahirijwe; Art. 19 igabanya itwarwa ry’imodoka kugeza amezi 3; Art. 28 urukiko rushobora gukuraho uruhushya imyaka 12.\n' +
      'Hari itandukaniro ugomba gusobanukirwa: urupapuro rwa RNP rw’e-ticket rusaba kwishyura mu minsi 3, ngirango itegeko rivuga iminsi 30 ku nzira y’ubutegetsi.',
    keyPointsEn: [
      'Drink-driving: 100,000–500,000 FRW plus imprisonment depending on category (Art. 37).',
      'Refusing a test: 300,000–600,000 FRW (Art. 38).',
      'Driving without a licence: 100,000–200,000 FRW and/or 15–30 days (Art. 40).',
      'Administrative fines: 30 days to pay, +30% after (Art. 34); RNP e-tickets ask for 3 days.',
    ],
    keyPointsRw: [
      'Kunywa ukatwara: 100,000–500,000 FRW n’igifungo (Art. 37).',
      'Kwanga gupimwa: 300,000–600,000 FRW (Art. 38).',
      'Kutagira uruhushya: 100,000–200,000 FRW na/ni iminsi 15–30 (Art. 40).',
      'Ihazabu yo mu rwego rw’ubutegetsi: iminsi 30, +30% (Art. 34); e-ticket ya RNP: iminsi 3.',
    ],
    citations: [LAW_2026, RNP_FINE_PAGE],
    legalVerifiedAt: REVIEW_DATE,
    lastReviewedBy: 'Aguka content review (documentary sources)',
    status: 'PUBLISHED',
    sortOrder: 10,
  },
  {
    key: 'open-questions',
    moduleKey: 'penalties',
    titleEn: 'What we could not verify — and what to do about it',
    titleRw: 'Ibitarasobanuka — n’icyo wakora',
    bodyEn:
      'An honest driving academy also teaches its own gaps. The following are commonly repeated but were NOT found in the instruments reviewed on ' +
      REVIEW_DATE +
      ': a fire extinguisher requirement; a specific mobile-phone-while-driving ban and its fine; minimum ages per licence category; child-seat technical rules; fixed fine amounts for speeding, helmet or seat-belt offences; the numeric demerit points per fault; breath-alcohol conversions; and the current name of the agency running the tests (licence testing is legally the national police body, while online references to RTDA/RTSA remain unresolved).\n' +
      'If an examiner or officer asks about these, cite the official channel (Rwanda National Police service pages or IremboGov) rather than this lesson. As soon as the missing Minister’s Order under Art. 25(3) of Law N° 014/2026 is published, the demerit table must be added here and this lesson updated.',
    bodyRw:
      'Ishuri ry’ukuri ryigisha n’icyuho ririfite. Ibi bikunze kuvugwa ariko ntibyabonetse mu nyandiko twasuzumye ku ya ' +
      REVIEW_DATE +
      ': itegeko ryo kugira extinguisher; ihagarikwa rya telefone mu gihe utwaye n’ihazabu yaryo; imyaka yihariye kuri buri cyiciro; amategeko y’intebe y’abana; imibare y’ihazabu ku muvuduko, ingofero cyangwa umukandara; amanota y’ibibaho kuri buri kosa; ihindurwa ry’inzoga mu mwuka; n’izina ry’ikigo gitanga ibizamini (amategeko atanga ubu butware mu gipolisi cy’igihugu, ariko ivugwa rya RTDA/RTSA ntiryasobanutse).\n' +
      'Iyo ubajwe kuri ibi, shyira imbere inzira zemewe (police.gov.rw cyangwa IremboGov) aho iki kigo. Ihame rya Art. 25(3) ry’Itegeko 014/2026 ryasohoka, imbonerahamwe y’amanota izongererwa hano.',
    keyPointsEn: [
      'These topics are gaps in our sources, not confirmed law.',
      'Always fall back to the official police or Irembo channel.',
      'This lesson must be revised when the demerit-point Minister’s Order is published.',
    ],
    keyPointsRw: [
      'Ibi ni ibyuho by’amakuru, si amategeko yemejwe.',
      'Koresha inzira zemewe: police.gov.rw cyangwa IremboGov.',
      'Iri somo rizavugururwa iteka rya Minisitiri ryerekeye amanota ryasohoka.',
    ],
    citations: [LAW_2026, DECREE_2002, ORDER_2024],
    legalVerifiedAt: REVIEW_DATE,
    lastReviewedBy: 'Aguka content review (documentary sources)',
    status: 'PUBLISHED',
    sortOrder: 20,
  },
];

const SIGNS: SignSeed[] = [
  {
    key: 'danger-triangle',
    code: 'FAM-1',
    category: 'DANGER',
    nameEn: 'Danger / priority board',
    nameRw: 'Ikimenyetso cy’akaga n’uburenganzira',
    meaningEn: 'Warns of a danger or a priority situation ahead. Equilateral triangle, white background, red border, placed on the right and 150–200 m before the hazard outside agglomerations.',
    meaningRw: 'Ikuburira akaga cyangwa uburenganzira imbere. Ni mpandeshatu ingana, inyuma y’umweru n’umusozo utukura, ishyizwe iburyo kandi hanze y’umujyi igera kuri 150–200 m mbere y’akaga.',
    shape: 'Equilateral triangle (point up)',
    colourConvention: 'White ground, red border',
    citations: [DECREE_2002],
    legalVerifiedAt: REVIEW_DATE,
    status: 'PUBLISHED',
  },
  {
    key: 'prohibition-disc',
    code: 'FAM-2a',
    category: 'PROHIBITORY',
    nameEn: 'Prohibition disc',
    nameRw: 'Ikimenyetso kibujije',
    meaningEn: 'A round white disc with a red border announcing a prohibition (speed, overtaking, entry, parking). Stop and parking boards use blue according to Art. 97.',
    meaningRw: 'Umuzenguruko w’umweru ufite umusozo utukura ugaragaza icyabujijwe (umuvuduko, kwambuka, kwinjira, guhagarara). Ibyo guhagarara (stop) no guhagarika imodoka bikoresha ubururu (Art. 97).',
    shape: 'Disc (round)',
    colourConvention: 'White ground, red border; blue for stop/parking per Art. 97',
    citations: [DECREE_2002],
    legalVerifiedAt: REVIEW_DATE,
    status: 'PUBLISHED',
  },
  {
    key: 'obligation-disc',
    code: 'FAM-2b',
    category: 'MANDATORY',
    nameEn: 'Obligation disc',
    nameRw: 'Ikimenyetso cy’amabwiriza',
    meaningEn: 'A blue round disc imposing an obligation or a mandatory direction.',
    meaningRw: 'Umuzenguruko w’ubururu utega irikangwa cyangwa ikerekezo ntahindukirwa.',
    shape: 'Disc (round)',
    colourConvention: 'Blue ground',
    citations: [DECREE_2002],
    legalVerifiedAt: REVIEW_DATE,
    status: 'PUBLISHED',
  },
  {
    key: 'indication',
    code: 'FAM-3',
    category: 'INFORMATION',
    nameEn: 'Indication sign',
    nameRw: 'Ikimenyetso cyerekeza',
    meaningEn: 'Information and direction boards of Annex 4: they tell you what is available or required rather than prohibiting it.',
    meaningRw: 'Iby’ukumenyesha n’iberekeza muri Annex 4: bibwira ibiboneka cyangwa bikenewe, ntibibuza.',
    shape: 'Rectangular / square per Annex 4',
    colourConvention: 'Defined by Annex 4 of Decree 85/01',
    citations: [DECREE_2002],
    legalVerifiedAt: REVIEW_DATE,
    status: 'PUBLISHED',
  },
  {
    key: 'stop-line',
    code: 'MK-1',
    category: 'PROHIBITORY',
    nameEn: 'Stop line (road marking)',
    nameRw: 'Umurongo wo guhagarara',
    meaningEn: 'A wide continuous white band across the lane, used with the stop board or the lights. You must halt at it.',
    meaningRw: 'Umurongo mugari wuzuye w’umweru urenze inzira, ukoreshwa n’ikimenyetso cya stop cyangwa amatara. Ugomba guhagarirwaho.',
    shape: 'Transverse solid band',
    colourConvention: 'Continuous white',
    citations: [DECREE_2002],
    legalVerifiedAt: REVIEW_DATE,
    status: 'PUBLISHED',
  },
  {
    key: 'give-way-marking',
    code: 'MK-2',
    category: 'WARNING',
    nameEn: 'Give-way marking',
    nameRw: 'Umurongo wo tambukira',
    meaningEn: 'A row of white triangles across the carriageway, with the B,1 board: give way to crossing traffic.',
    meaningRw: 'Uruhererekane rwa mpandeshatu z’umweru, kumwe n’ikimenyetso B,1: tambukira abaza ku muhanda uhuriraho.',
    shape: 'Row of small triangles',
    colourConvention: 'White',
    citations: [DECREE_2002],
    legalVerifiedAt: REVIEW_DATE,
    status: 'PUBLISHED',
  },
  {
    key: 'solid-centre',
    code: 'MK-3',
    category: 'PROHIBITORY',
    nameEn: 'Continuous centre line',
    nameRw: 'Umurongo wuzuye wo hagati',
    meaningEn: 'Separating opposing traffic: crossing it and driving along its left are both prohibited (Art. 110).',
    meaningRw: 'Utandukanya ibyerekezo: ntushobora kuwambuka cyangwa kugendana ibumoso bwawo (Art. 110).',
    shape: 'Longitudinal continuous line',
    colourConvention: 'White',
    citations: [DECREE_2002],
    legalVerifiedAt: REVIEW_DATE,
    status: 'PUBLISHED',
  },
  {
    key: 'broken-centre',
    code: 'MK-4',
    category: 'INFORMATION',
    nameEn: 'Broken line',
    nameRw: 'Umurongo ucikacikanye',
    meaningEn: 'May be crossed only to overtake, turn, make a U-turn or change line. Broken yellow instead means parking is prohibited.',
    meaningRw: 'Ushobora kwambukwa gusa kugira ngo urenga, uhindukire, ukore U cyangwa uhindure umurongo. Uw’umuhondo ucikacikanye wo uvuga ko guhagarika imodoka bitaremewe.',
    shape: 'Longitudinal broken line (dashes 1–5 m, gaps 3–15 m)',
    colourConvention: 'White to cross, yellow for parking prohibition',
    citations: [DECREE_2002],
    legalVerifiedAt: REVIEW_DATE,
    status: 'PUBLISHED',
  },
  {
    key: 'pedestrian-crossing',
    code: 'MK-5',
    category: 'INFORMATION',
    nameEn: 'Pedestrian crossing (zebra)',
    nameRw: 'Aho abanyamaguru bambukira',
    meaningEn: 'Delimited by white lines parallel to the roadway (Art. 111). Art. 27 obliges drivers to slow down and stop for pedestrians using it.',
    meaningRw: 'Ugaragazwa n’imirongo y’umweru ibangikanye n’umuhanda (Art. 111). Art. 27 itegeka kugabanya umuvuduko no guhagarira abanyamaguru.',
    shape: 'Parallel white bands',
    colourConvention: 'White',
    citations: [DECREE_2002],
    legalVerifiedAt: REVIEW_DATE,
    status: 'PUBLISHED',
  },
  {
    key: 'learner-plate',
    code: 'DOC-L',
    category: 'SERVICE',
    nameEn: 'Provisional “L” plate',
    nameRw: 'Ikimenyetso “L” cy’agateganyo',
    meaningEn: 'A blue board with a white letter “L”, at least 15 cm, plus an AUTO-ECOLE / DRIVING SCHOOL plate, required on a vehicle driven under a provisional licence.',
    meaningRw: 'Ikimenyetso cy’ubururu gifite urupapo “L” rw’umweru, nibura cm 15, kumwe na plate ya AUTO-ECOLE / DRIVING SCHOOL, gisabwa ku modoka itwarwa n’uruhushya rw’agateganyo.',
    shape: 'Square plate',
    colourConvention: 'Blue with white letter',
    citations: [ORDER_2024],
    legalVerifiedAt: REVIEW_DATE,
    status: 'PUBLISHED',
  },
];

function q(
  key: string,
  moduleKey: string,
  difficulty: 'EASY' | 'MEDIUM' | 'HARD',
  questionEn: string,
  optionsEn: string[],
  correctIndex: number,
  explanationEn: string,
  citations: SourceCitation[],
  lessonKey?: string
): QuestionSeed {
  return {
    key,
    moduleKey,
    lessonKey,
    questionEn,
    questionRw: questionEn,
    optionsEn,
    optionsRw: [...optionsEn],
    correctIndex,
    explanationEn,
    explanationRw: explanationEn,
    difficulty,
    citations,
    legalVerifiedAt: REVIEW_DATE,
    status: 'PUBLISHED',
  };
}

const TRANSLATED: Record<string, { questionRw: string; optionsRw: string[]; explanationRw: string }> = {
  'side-of-road': {
    questionRw: 'Mu Rwanda ibinyabiziga bigenda hejuru y’umuhanda?',
    optionsRw: ['Ibumoso', 'Iburyo', 'Hagati', 'Ahabonetse hose'],
    explanationRw: 'Art. 4 y’Itegeko N° 014/2026 isaba kugenda iburyo.',
  },
  'speed-town-car': {
    questionRw: 'Ni uwuhe muvuduko ntarengwa wo mu mujyi ku modoka z’abasyiri n’iziri munsi ya toni 1?',
    optionsRw: ['30 km/h', '40 km/h', '50 km/h', '60 km/h'],
    explanationRw: 'Art. 29 y’Iteka 85/01 ishyiraho 50 km/h muri izi, naho izindi zose zikagira 40 km/h.',
  },
  'speed-town-other': {
    questionRw: 'Izindi binyabiziga byose mu mujyi ntibigomba kurenza:',
    optionsRw: ['40 km/h', '50 km/h', '60 km/h', '70 km/h'],
    explanationRw: 'Art. 29: hanze y’izo hejuru, imipaka iba 40 km/h mu mijyi.',
  },
  'speed-taxi': {
    questionRw: 'Ku modoka za moritari (taxis) hanze y’umujyi, umuvuduko ntarengwa ni:',
    optionsRw: ['60 km/h', '70 km/h', '80 km/h', '90 km/h'],
    explanationRw: 'Art. 29 itanga 70 km/h kuri moritari hanze y’umujyi.',
  },
  'speed-goods': {
    questionRw: 'Ibinyabiziga bitwara abantu n’ibitwara ibintu ntibigomba kurenza:',
    optionsRw: ['50 km/h', '60 km/h', '70 km/h', '80 km/h'],
    explanationRw: 'Art. 30bis yongeweho n’Iteka N° 25/01 rya 2015: 60 km/h hamwe na speed governor.',
  },
  'bac': {
    questionRw: 'Nta mushoferi wemerewe kugira inzoga irenga:',
    optionsRw: ['0,5 g kuri litiro y’amaraso', '0,8 g kuri litiro y’amaraso', '1,0 g kuri litiro y’amaraso', 'Nta mipaka iriho'],
    explanationRw: 'Art. 9 y’Itegeko N° 014/2026: garama 0.80 kuri litiro imwe y’amaraso.',
  },
  'cat-b': {
    questionRw: 'Icyiciro B kirimo ibinyabiziga bitwara abagenzi bangana iki?',
    optionsRw: ['Ntibarenga 8 utabaze umushoferi', 'Kugeza 15', 'Kugeza 30', 'Irenze 30'],
    explanationRw: 'Art. 6 (Iteka 85/01 nk’uko Iteka 066/01 rya 2024 ryarisobanuye): B = abagenzi 8 batareba umushoferi, ibintu bitarenza toni 3,5.',
  },
  'cat-c': {
    questionRw: 'Ivumbuke ry’ibintu rirenza toni 3,5 rigwa mu cyiciro:',
    optionsRw: ['B', 'C', 'D', 'E'],
    explanationRw: 'C = ibinyabiziga bisiga ibintu birenza kg 3.500.',
  },
  'cat-e': {
    questionRw: 'Icyiciro E kireba iki?',
    optionsRw: ['Matagari gusa', 'Ibinyabiziga B/C/D bicurikirije igisiga kirenza kg 750', 'Amapikipiki gusa', 'Izihinduka (automatique)'],
    explanationRw: 'E = B, C cyangwa D ifite igisiga kirenza kg 750. “AT” yo ni iy’imodoka za automatique.',
  },
  'age': {
    questionRw: 'Ni imyaka ingahe ugomba kuba ufite kugira usabe uruhushya rwo gutwara?',
    optionsRw: ['16', '18', '21', '25'],
    explanationRw: 'RNP na IremboGov bisaba nibura imyaka 18. Ntidufite itegeko ryemeza imyaka itandukanye kuri buri cyiciro.',
  },
  'authority': {
    questionRw: 'Ni uwuhe mwanya utanga uruhushya rwo gutwara mu Rwanda?',
    optionsRw: ['Ikigo cy’iterambere ry’gutwara (RTDA)', 'Urwego rw’igihugu rw’igipolisi', 'Ama koperative y’abashoferi', 'Umujyi wa Kigali gusa'],
    explanationRw: 'Art. 6 y’Iteka 066/01/2024 na Art. 23 y’Itegeko 014/2026 biha ubu butware urwego rw’igihugu rw’igipolisi.',
  },
  'theory-pass': {
    questionRw: 'Kugira ngo utsinde ikizamini cyanditse ukeneye nibura:',
    optionsRw: ['Amanota 50', 'Amanota 60', 'Amanota 70', 'Amanota 80'],
    explanationRw: 'Urupapuro rwa RNP rusaba nibura amanota 60; Irembo rivuga 60% cyangwa 12 muri 20.',
  },
  'practical-100': {
    questionRw: 'Ku kizamini cy’ubumenyi ngiro (definitive licence), RNP isaba:',
    optionsRw: ['60%', '75%', '100% (nta kosa rinini)', 'Nta manota agenga'],
    explanationRw: 'Urupapuro rwa RNP rusaba 100%; si umubare uva mu itegeko ahubwo ni amabwiriza y’abagenzura.',
  },
  'provisional-validity': {
    questionRw: 'Uruhushya rw’agateganyo rumara igihe kingana iki?',
    optionsRw: ['Amezi 6', 'Umwaka 1, rushobora kongerwa rimwe', 'Imyaka 2', 'Imyaka 10'],
    explanationRw: 'Iteka 066/01 rya 2024: umwaka 1, ryongererwa rimwe; risaba kugendana n’umwigisha wemewe.',
  },
  'inspection-first': {
    questionRw: 'Isuzuma rya tekiniki rya mbere rikorwa ryari?',
    optionsRw: ['Nyuma y’umwaka 1', 'Nyuma y’imyaka 2 imodoka itangiye gukoreshwa', 'Buri mezi 6 guhera ubu', 'Nta gihe gihari'],
    explanationRw: 'Art. 141–142 z’Iteka 85/01.',
  },
  'inspection-commercial': {
    questionRw: 'Imodoka z’abagenzi, izisiga ibintu zirenza toni 3,5 n’iz’amashuri yo gutwara zisuzumwa:',
    optionsRw: ['Umwaka umwe', 'Amezi 6', 'Igihe zishatse', 'Imyaka 2'],
    explanationRw: 'Art. 141–142: amezi 6 kuri izo, umwaka ku zindi.',
  },
  'triangle-spec': {
    questionRw: 'Icyapa kiburira cya mpandeshatu gitegekanijwe gute?',
    optionsRw: ['Uruhande nibura cm 40 n’umusozo utukura nibura cm 5', 'cm 20, umusozo w’umweru', 'Umuzenguruko cm 30', 'Nta bunini buhari'],
    explanationRw: 'Art. 88 nk’uko Iteka 25/01 rya 2015 ryarivuguruye.',
  },
  'first-aid': {
    questionRw: 'Agahago k’ubutabazi kagomba kuba gafite iki nibura?',
    optionsRw: ['Amabande 2 n’amazi', 'Amabande 4 meza, clips/pins 4, umuti wo koza n’igikoresho cyo guhumusha', 'Ibikoresho byose by’ubuvuzi', 'Nta birimo bigasabwa'],
    explanationRw: 'Art. 88 y’Iteka 85/01 nk’uko ryavuguruwe.',
  },
  'waistcoat': {
    questionRw: 'Reflector waistcoat isabwa ryari nk’uko amabwiriza ya RURA avuga?',
    optionsRw: ['Igihe cyose ku bashoferi bose', 'Mu gihe cy’accident ku mushoferi n’umufasha w’imodoka y’abagenzi', 'Mu mijyi gusa', 'Ntabwo isabwa na hamwe'],
    explanationRw: 'RURA N°007/TRANS/RT/RURA/2015. Nta tegeko ryabonetse ku bashoferi b’imodoka zabo bwite, bityo iki kiguma ari ikibazo gifunguye.',
  },
  'line-solid': {
    questionRw: 'Umurongo wuzuye w’umweru utandukanya ibyerekezo bisobanura iki?',
    optionsRw: ['Urashobora kuwambuka ugiye kurenga', 'Ntugomba kuwambuka cyangwa ngo ugende ibumoso yawo', 'Bivuga ko guhagarika imodoka byemewe', 'Ni umurongo wo ku nzira y’abanyamaguru'],
    explanationRw: 'Art. 110 y’Iteka 85/01.',
  },
  'line-yellow': {
    questionRw: 'Umurongo w’umuhondo ucikacikanye usobanura:',
    optionsRw: ['Guhagarika imodoka ntibitemewe', 'Umuvuduko uri hasi', 'Inzira y’amagare', 'Akaga imbere'],
    explanationRw: 'Art. 110 ihuza umurongo w’umuhondo ucikacikanye n’ubujyano bwo guhagarika imodoka.',
  },
  'right-hand-priority': {
    questionRw: 'Ku nkomane idafite ibyapa cyangwa amatara, uburenganzira bufite:',
    optionsRw: ['Ugeze ibumoso', 'Ugeze iburyo', 'Ufite imodoka nini', 'Umanuka'],
    explanationRw: 'Art. 16 y’Iteka 85/01: uburenganzira ku uje iburyo.',
  },
  'roundabout': {
    questionRw: 'Mu muzenguruko, ugomba:',
    optionsRw: ['Kwinjira mbere y’abandi', 'Gutambukira abamaze kuwujyamo', 'Guhagarara burundu', 'Kumenyesha gusa'],
    explanationRw: 'Art. 16: gutambukira abawurimo.',
  },
  'lights-override': {
    questionRw: 'Iyo amatara n’ibyapa bitavuga rumwe, iki gifata?',
    optionsRw: ['Ibyapa', 'Amatara', 'Imirongo y’umuhanda', 'Umwanya w’umushoferi'],
    explanationRw: 'Art. 91: amatara afata kurusha ibyapa n’imirongo.',
  },
  'lights-failure': {
    questionRw: 'Iyo amatara y’ibimenyetso azimye ku nkomane, amategeko aba ayahe?',
    optionsRw: ['Nta tegeko ribaho', 'Uburenganzira bw’uwo iburyo busubiraho', 'Abanyamaguru bafata mbere', 'Utwaye imodoka nini afata'],
    explanationRw: 'Art. 16 ivuga ko iyo amatara atakiriho, uburenganzira bw’iburyo busubiraho.',
  },
  'fine-no-licence': {
    questionRw: 'Kutagira uruhushya rwo gutwara bihanishwa:',
    optionsRw: ['100,000–200,000 FRW na/ni iminsi 15–30', '50,000 FRW gusa', 'Nta gihano', '1,000,000 FRW'],
    explanationRw: 'Art. 40 y’Itegeko N° 014/2026.',
  },
  'fine-refuse-stop': {
    questionRw: 'Kwanga guhagarira ikimenyetso cya polisi bihanishwa:',
    optionsRw: ['100,000–200,000 FRW', '400,000–700,000 FRW n’amezi 3–6', 'Igisabwa gusa', '500,000 FRW gusa'],
    explanationRw: 'Art. 39 y’Itegeko N° 014/2026.',
  },
  'fine-payment': {
    questionRw: 'Ihazabu yo mu rwego rw’ubutegetsi igomba kwishyurwa mu minsi ingahe?',
    optionsRw: ['Iminsi 7', 'Iminsi 30, hongerwaho 30%', 'Iminsi 90', 'Iminsi 180'],
    explanationRw: 'Art. 34: iminsi 30, haza 30% nyuma. Urupapuro rwa RNP rw’e-ticket rwo rusaba iminsi 3 ku bihano by’umuhanda.',
  },
  'seatbelt': {
    questionRw: 'Art. 47 isaba nde kwambara umukandara wo kurinda ibyago?',
    optionsRw: ['Umushoferi gusa', 'Umushoferi n’uwicara iburyo imbere', 'Abagenda inyuma gusa', 'Nta we'],
    explanationRw: 'Art. 47 y’Iteka 85/01.',
  },
  'children': {
    questionRw: 'Abana bari munsi y’imyaka ingahe ntibemewe kwicara imbere iyo hari intebe zindi?',
    optionsRw: ['6', '10', '12', '14'],
    explanationRw: 'Art. 66(3) y’Iteka 85/01. Amategeko y’intebe y’abana (child seat) ntiyabonywe mu nyandiko twasuzumye.',
  },
  'impound': {
    questionRw: 'Gufunga ikinyabiziga (impoundment) ntibirenza:',
    optionsRw: ['Iminsi 30', 'Amezi 3', 'Amezi 6', 'Umwaka'],
    explanationRw: 'Art. 19 y’Itegeko N° 014/2026.',
  },
  'demerit': {
    questionRw: 'Amanota y’ibibaho (demerit points) ateweho na:',
    optionsRw: ['Nta itegeko ribiro', 'Art. 25 y’Itegeko N° 014/2026; uburyo bwo kubyibara butegereje iteka rya Minisitiri', 'Amabwiriza y’imijyi', 'Iteka rya 2002 gusa'],
    explanationRw: 'Kuri 2026-10-21 nta teka rya Minisitiri ryari ryasohoka; ni yo mpamvu tudatanga imibare y’ibibaho.',
  },
  'unverified-fire': {
    questionRw: 'Ni iki kitari cyabonetse nk’itegeko mu nyandiko twasuzumye?',
    optionsRw: ['Icyapa cya mpandeshatu', 'Agahago k’ubutabazi', 'Umuzima w’umuriro (extinguisher)', 'Igikoresho cyo kurinda ubujujugu'],
    explanationRw: 'Art. 88 urutonde rwayo irimo mpandeshatu, agahago k’ubutabazi n’igikoresho cyo kurinda ubujujugu. Extingisher ntirimo — ni ikintu kitaremeza.',
  },
};

const QUESTIONS: QuestionSeed[] = [
  q('side-of-road', 'basics', 'EASY', 'In Rwanda, traffic drives:', ['On the left', 'On the right', 'In the middle', 'Whichever side is free'], 1, 'Art. 4 of Law N° 014/2026 requires driving on the right, consistent with Decree 85/01.', [LAW_2026, DECREE_2002], 'drive-right'),
  q('speed-town-car', 'speed', 'EASY', 'Inside a town, the maximum speed for a private passenger car and vehicles up to 1 tonne is:', ['30 km/h', '40 km/h', '50 km/h', '60 km/h'], 2, 'Art. 29 of Decree 85/01 fixes 50 km/h for these vehicles inside agglomerations; 40 km/h applies to all others.', [DECREE_2002], 'speed-limits'),
  q('speed-town-other', 'speed', 'MEDIUM', 'Inside an agglomeration, all other vehicles must not exceed:', ['40 km/h', '50 km/h', '60 km/h', '70 km/h'], 0, 'Art. 29 sets 40 km/h for vehicle classes not covered by the 50 km/h rule.', [DECREE_2002], 'speed-limits'),
  q('speed-taxi', 'speed', 'HARD', 'Outside towns, the limit for taxis is:', ['60 km/h', '70 km/h', '80 km/h', '90 km/h'], 1, 'Art. 29 gives taxis 70 km/h outside agglomerations, below the 80 km/h light-vehicle limit.', [DECREE_2002], 'speed-limits'),
  q('speed-goods', 'speed', 'HARD', 'Public people-transport and goods-transport vehicles are capped at, and must carry:', ['80 km/h and a tachograph', '60 km/h and a speed governor', '70 km/h and a tracker', '50 km/h and a second driver'], 1, 'Art. 30bis, added by Presidential Order N° 25/01 of 2015, caps these vehicles at 60 km/h and requires a speed governor.', [ORDER_2015, DECREE_2002], 'speed-limits'),
  q('bac', 'speed', 'MEDIUM', 'A driver must not have alcohol exceeding:', ['0.5 g per litre of blood', '0.80 g per litre of blood', '1.0 g per litre of blood', 'There is no numeric limit'], 1, 'Art. 9 of Law N° 014/2026 states 0.80 g per litre of blood, and lets the Minister set a lower limit for certain drivers.', [LAW_2026], 'alcohol'),
  q('cat-b', 'licence', 'EASY', 'Category B covers vehicles carrying:', ['Up to 8 passengers besides the driver', 'Up to 15 passengers', 'Up to 30 passengers', 'More than 30 passengers'], 0, 'Art. 6 (as restated by Order 066/01 of 2024): B is up to 8 passengers, goods vehicles up to 3,500 kg, and quadricycles.', [ORDER_2024], 'categories'),
  q('cat-c', 'licence', 'MEDIUM', 'A goods vehicle over 3,500 kg needs category:', ['B', 'C', 'D', 'E'], 1, 'C is defined for goods vehicles above 3,500 kg.', [ORDER_2024], 'categories'),
  q('cat-e', 'licence', 'HARD', 'Category E is:', ['Tractors and cranes', 'A B, C or D vehicle towing a trailer over 750 kg', 'Motorcycles over 125 cc', 'Automatic vehicles only'], 1, 'E covers B/C/D vehicles with a trailer above 750 kg; "AT" is the endorsement that restricts you to automatic vehicles.', [ORDER_2024], 'categories'),
  q('age', 'licence', 'EASY', 'The minimum age to apply for a driving licence is:', ['16', '18', '21', '25'], 1, 'The Rwanda National Police and IremboGov both state 18. Per-category ages were not found in primary law, so they are not taught here.', [RNP_DEFINITIVE, IREMBO_DEFINITIVE], 'two-stage-test'),
  q('authority', 'licence', 'MEDIUM', 'In Rwanda, a driving licence is issued by:', ['The transport development agency', 'The national police body responsible for road safety', 'Driving schools', 'The city of Kigali only'], 1, 'Art. 6 of Order 066/01/2024 and Art. 23 of Law 014/2026 give testing and issuing competence to the national police body.', [ORDER_2024, LAW_2026], 'categories'),
  q('theory-pass', 'licence', 'EASY', 'To pass the written theory test you need at least:', ['50 marks', '60 marks', '70 marks', '80 marks'], 1, 'The RNP provisional-licence page states at least 60 marks; IremboGov expresses it as 60% or above (12 out of 20 at some centres).', [RNP_PDL, IREMBO_PDL], 'two-stage-test'),
  q('practical-100', 'licence', 'MEDIUM', 'For the practical definitive-licence test, the police service page requires:', ['60%', '75%', '100% — no major faults', 'No fixed mark'], 2, 'The RNP definitive-licence page states 100% must be obtained. This is an operating rule of the testing authority, not a statutory figure.', [RNP_DEFINITIVE], 'two-stage-test'),
  q('provisional-validity', 'licence', 'MEDIUM', 'A provisional driving licence is valid for:', ['6 months', '1 year, renewable once', '2 years', '10 years'], 1, 'Order 066/01 of 2024: one year, renewable once, with a qualified instructor alongside and a blue "L" plate at least 15 cm.', [ORDER_2024], 'provisional-licence'),
  q('inspection-first', 'vehicle', 'MEDIUM', 'The first compulsory technical inspection is due:', ['After 1 year', 'Two years after the vehicle first entered service', 'Every 6 months from new', 'Only after an accident'], 1, 'Arts. 141–142 of Decree 85/01.', [DECREE_2002, RNP_INSPECTION], 'inspection'),
  q('inspection-commercial', 'vehicle', 'HARD', 'Public passenger vehicles, goods vehicles over 3.5 tonnes and driving-school vehicles are inspected:', ['Once a year', 'Every 6 months', 'Every 2 years', 'Only when selling'], 1, 'Arts. 141–142: six-monthly for these classes, annual for the rest.', [DECREE_2002, RNP_INSPECTION], 'inspection'),
  q('triangle-spec', 'vehicle', 'HARD', 'The legal warning triangle must be:', ['Side ≥ 40 cm with a red border ≥ 5 cm', '20 cm with a white border', 'A disc of 30 cm', 'Any size'], 0, 'Art. 88 as amended by Order 25/01 of 2015 describes an equilateral triangle with a side of at least 40 cm and a red border of at least 5 cm.', [DECREE_2002, ORDER_2015], 'equipment'),
  q('first-aid', 'vehicle', 'MEDIUM', 'A compliant first-aid kit must contain at least:', ['Two bandages and water', 'Four sterile bandages, four clips/pins, a disinfectant and a mouth-to-mouth aid', 'Any medicine you own', 'Nothing specific'], 1, 'Art. 88 lists those contents and requires the kit to be labelled for emergency help while a doctor is awaited.', [DECREE_2002, ORDER_2015], 'equipment'),
  q('waistcoat', 'vehicle', 'HARD', 'Under RURA passenger regulations, a reflector waistcoat is required:', ['For every driver at all times', 'For the driver and/or conductor of a public transport vehicle in an emergency', 'Only inside national parks', 'Never'], 1, 'RURA N°007/TRANS/RT/RURA/2015. A general obligation for private drivers was not found, so it is listed as an open question.', [RURA_PASSENGER], 'equipment'),
  q('line-solid', 'signs', 'EASY', 'A continuous white line separating opposing traffic means:', ['You may cross it to overtake', 'You must not cross it or drive along its left', 'Parking is allowed', 'It marks a cycle lane'], 1, 'Art. 110 of Decree 85/01.', [DECREE_2002], 'markings'),
  q('line-yellow', 'signs', 'MEDIUM', 'A broken yellow line indicates:', ['Parking is prohibited', 'A reduced speed zone', 'A bus lane', 'A danger ahead'], 0, 'Art. 110 assigns the broken yellow line to parking prohibition.', [DECREE_2002], 'markings'),
  q('right-hand-priority', 'priority', 'EASY', 'At an uncontrolled crossroads, priority belongs to the vehicle:', ['Coming from the left', 'Coming from the right', 'With the larger vehicle', 'Going downhill'], 1, 'Art. 16 of Decree 85/01, unless signs or lights regulate the junction.', [DECREE_2002], 'priority-rules'),
  q('roundabout', 'priority', 'EASY', 'Entering a roundabout you must give way to:', ['Vehicles already in the roundabout', 'Vehicles waiting to enter', 'Pedestrians only', 'Nobody'], 0, 'Art. 16 requires giving way to traffic already circulating.', [DECREE_2002], 'priority-rules'),
  q('lights-override', 'priority', 'MEDIUM', 'When light signals and road signs disagree:', ['Signs prevail', 'Light signals prevail', 'Markings prevail', 'The driver decides'], 1, 'Art. 91 puts luminous signals above signs and markings.', [DECREE_2002], 'priority-rules'),
  q('lights-failure', 'priority', 'HARD', 'If the traffic lights at a junction fail, priority is governed by:', ['Nothing — proceed first come first served', 'The ordinary right-hand priority rule', 'Pedestrians', 'Vehicle size'], 1, 'Art. 16 restores right-hand priority when the lights are out.', [DECREE_2002], 'priority-rules'),
  q('fine-no-licence', 'penalties', 'MEDIUM', 'Driving without a licence is punished by:', ['100,000–200,000 FRW and/or 15–30 days', '50,000 FRW only', 'No penalty', '1,000,000 FRW'], 0, 'Art. 40 of Law N° 014/2026.', [LAW_2026], 'penalties'),
  q('fine-refuse-stop', 'penalties', 'HARD', 'Refusing to stop at a police signal costs:', ['100,000–200,000 FRW', '400,000–700,000 FRW and 3–6 months', 'A warning only', '500,000 FRW without imprisonment'], 1, 'Art. 39 of Law N° 014/2026.', [LAW_2026], 'penalties'),
  q('fine-payment', 'penalties', 'MEDIUM', 'Administrative fines must be paid within:', ['7 days', '30 days, with a 30% surcharge afterwards', '90 days', '180 days'], 1, 'Art. 34 of the law sets 30 days plus 30%. The RNP e-ticket page asks drivers to settle traffic infringement fees within 3 days — both are official and apply to different instruments.', [LAW_2026, RNP_FINE_PAGE], 'penalties'),
  q('seatbelt', 'vehicle', 'EASY', 'Seat belts are legally required for:', ['The driver only', 'The driver and the front-right passenger', 'Rear passengers only', 'Nobody'], 1, 'Art. 47 of Decree 85/01, with Art. 88 requiring belts fitted on vehicles carrying fewer than six occupants.', [DECREE_2002], 'inspection'),
  q('children', 'priority', 'MEDIUM', 'Children under which age may not sit in the front seat when other seats are free?', ['6', '10', '12', '14'], 2, 'Art. 66(3). No child-seat technical rule was found in the instruments read, so that is taught as an open question.', [DECREE_2002], 'inspection'),
  q('impound', 'penalties', 'HARD', 'Impoundment of a vehicle may not exceed:', ['30 days', '3 months', '6 months', '1 year'], 1, 'Art. 19 of Law N° 014/2026.', [LAW_2026], 'penalties'),
  q('demerit', 'penalties', 'HARD', 'The merit/demerit point system is created by:', ['No law at all', 'Art. 25 of Law N° 014/2026, with the computing method awaiting a Minister’s Order', 'A city bylaw', 'Decree 85/01 only'], 1, 'Art. 25 introduces the system; as of 2026-10-21 no implementing Minister’s Order had been published, so no point values are taught.', [LAW_2026], 'open-questions'),
  q('unverified-fire', 'penalties', 'HARD', 'Which item was NOT found as a legal requirement in the instruments reviewed?', ['Warning triangle', 'First-aid kit', 'Fire extinguisher', 'Anti-theft device'], 2, 'Art. 88 lists the triangle, the first-aid kit and an anti-theft device. A fire extinguisher is not in the reviewed texts, so it is taught as unverified rather than as law.', [DECREE_2002, ORDER_2015], 'open-questions'),
];

const EXAMS: ExamSeed[] = [
  {
    key: 'pdl-theory',
    nameEn: 'Official-style PDL theory mock (20 questions)',
    nameRw: 'Ikizamini cy’igerageza cya e-PDL (ibibazo 20)',
    moduleId: null,
    questionCount: 20,
    passPercent: 60,
    timeLimitMinutes: 30,
    status: 'PUBLISHED',
  },
  {
    key: 'progress-check',
    nameEn: 'Aguka progress check (10 questions)',
    nameRw: 'Ikizamini gito cy’iterambere (ibibazo 10)',
    moduleId: null,
    questionCount: 10,
    passPercent: 70,
    timeLimitMinutes: null,
    status: 'PUBLISHED',
  },
];

function applyKinyarwanda(seed: QuestionSeed): QuestionSeed {
  const t = TRANSLATED[seed.key];
  if (!t) return seed;
  return { ...seed, questionRw: t.questionRw, optionsRw: t.optionsRw, explanationRw: t.explanationRw };
}

export interface ImportReport {
  created: string[];
  skipped: string[];
  totals: { modules: number; lessons: number; questions: number; signs: number; exams: number };
}

/**
 * Imports the reviewed curriculum. Idempotent by stable key: existing
 * administrator-edited rows are never overwritten, so re-running after a deploy
 * only adds missing content.
 */
export function importContentPack(): ImportReport {
  const created: string[] = [];
  const skipped: string[] = [];
  const moduleIds = new Map<string, string>();

  for (const seed of MODULES) {
    const existing = repo.getRoadSafetyModules().find((m) => m.code === seed.code);
    if (existing) {
      moduleIds.set(seed.key, existing.id);
      skipped.push(`module:${seed.code}`);
      continue;
    }
    const { key, ...rest } = seed;
    const row = repo.createRoadSafetyModule(rest);
    moduleIds.set(key, row.id);
    created.push(`module:${row.code}`);
  }

  const lessonIds = new Map<string, string>();
  for (const seed of LESSONS) {
    const existing = repo.getRoadSafetyLessons().find((l) => l.titleEn === seed.titleEn);
    if (existing) {
      lessonIds.set(seed.key, existing.id);
      skipped.push(`lesson:${seed.key}`);
      continue;
    }
    const { key, moduleKey, ...rest } = seed;
    const moduleId = moduleIds.get(moduleKey);
    if (!moduleId) continue;
    const row = repo.createRoadSafetyLesson({ ...rest, moduleId });
    lessonIds.set(key, row.id);
    created.push(`lesson:${row.titleEn}`);
  }

  for (const seed of QUESTIONS) {
    const existing = repo.getRoadSafetyQuestions().find((x) => x.questionEn === seed.questionEn);
    if (existing) {
      skipped.push(`question:${seed.key}`);
      continue;
    }
    const { key, moduleKey, lessonKey, ...rest } = applyKinyarwanda(seed);
    const moduleId = moduleIds.get(moduleKey);
    if (!moduleId) continue;
    repo.createRoadSafetyQuestion({
      ...rest,
      moduleId,
      lessonId: lessonKey ? lessonIds.get(lessonKey) ?? null : null,
    });
    created.push(`question:${key}`);
  }

  for (const seed of SIGNS) {
    const existing = repo.getRoadSigns().find((s) => s.code === seed.code);
    if (existing) {
      skipped.push(`sign:${seed.code}`);
      continue;
    }
    const { key, ...rest } = seed;
    repo.createRoadSign(rest);
    created.push(`sign:${rest.code}`);
  }

  for (const seed of EXAMS) {
    const existing = repo.getExamTemplates().find((e) => e.nameEn === seed.nameEn);
    if (existing) {
      skipped.push(`exam:${seed.key}`);
      continue;
    }
    const { key, ...rest } = seed;
    repo.createExamTemplate(rest);
    created.push(`exam:${rest.nameEn}`);
  }

  return {
    created,
    skipped,
    totals: {
      modules: repo.getRoadSafetyModules().length,
      lessons: repo.getRoadSafetyLessons().length,
      questions: repo.getRoadSafetyQuestions().length,
      signs: repo.getRoadSigns().length,
      exams: repo.getExamTemplates().length,
    },
  };
}

export function contentPackInventory() {
  return {
    version: CONTENT_PACK_VERSION,
    reviewedOn: REVIEW_DATE,
    modules: MODULES.length,
    lessons: LESSONS.length,
    questions: QUESTIONS.length,
    signs: SIGNS.length,
    exams: EXAMS.length,
    unverifiedTopics: UNVERIFIED_TOPICS,
    sources: [LAW_2026, DECREE_2002, ORDER_2015, ORDER_2024, RURA_PASSENGER, RNP_PDL, RNP_DEFINITIVE, RNP_INSPECTION, RNP_FINE_PAGE, IREMBO_PDL, IREMBO_DEFINITIVE],
  };
}
