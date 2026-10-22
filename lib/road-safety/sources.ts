import { SourceCitation } from '@/lib/types';

/**
 * The instruments and official service pages this curriculum was read from.
 *
 * This module is a leaf: it imports nothing but the types, so the repository, the
 * verified-fact registry and the content pack can all cite the same addresses without
 * importing one another.
 */

export const REVIEW_DATE = '2026-10-21';

export const LAW_2026: SourceCitation = {
  title: 'Law N° 014/2026 of 06/03/2026 governing road traffic',
  publisher: 'Official Gazette n° Special of 10/03/2026 (reproduced by Rwanda National Police)',
  url: 'https://police.gov.rw/uploads/tx_download/OG_n___Special_of_10.03.2026__Ikoreshwa_ry_umuhanda.pdf',
  accessedOn: REVIEW_DATE,
};

export const DECREE_2002: SourceCitation = {
  title: 'Presidential Decree N° 85/01 of 02/09/2002 setting the general rules governing roads and their use',
  publisher: 'Rwanda National Police (bilingual gazette copy)',
  url: 'https://police.gov.rw/uploads/tx_download/Iteka_rya_Perezida_no_85_01_ryo_ku_wa_02_09_2002_rishyiraho_amabwiriza_rusange_agenga_imihanda_n_uburyo_bwo_kuyigendamo.pdf',
  accessedOn: REVIEW_DATE,
};

export const ORDER_2015: SourceCitation = {
  title: 'Presidential Order N° 25/01 of 25/02/2015 amending Decree N° 85/01 of 02/09/2002',
  publisher: 'Official Gazette Special of 26/02/2015 (reproduced by Rwanda National Police)',
  url: 'https://police.gov.rw/uploads/tx_download/Traffic_Law_2015_02.pdf',
  accessedOn: REVIEW_DATE,
};

export const ORDER_2024: SourceCitation = {
  title: 'Presidential Order N° 066/01 of 19/07/2024 amending Art. 6 and inserting Art. 6bis of Decree N° 85/01 (licence categories, tests and fees)',
  publisher: 'Rwanda Law Reform Commission / OG n° 30 ter of 22/07/2024',
  url: 'https://www.rlrc.gov.rw/fileadmin/user_upload/RLRC/Laws_of_Rwanda_v2/Domestic_laws/Laws_in_force/5._Security/5.2._Security_activities/5.2.2._Road_Traffic_Security/5.2.2.10._Presidential_Order_regulating_general_police_and_road_traffic__No_066-01_of_2024.pdf',
  accessedOn: REVIEW_DATE,
};

export const RURA_PASSENGER: SourceCitation = {
  title: 'RURA Passengers Road Transport Regulations N°007/TRANS/RT/RURA/2015 of 01/06/2015',
  publisher: 'RURA',
  url: 'https://www.rura.rw/fileadmin/user_upload/RURA/Documents/Sectors/Transport/Regulatory_instruments/Transport_Regulations_and_Guidelines/Passengers_Road_Transport_Regulations_01.pdf',
  accessedOn: REVIEW_DATE,
};

export const RNP_PDL: SourceCitation = {
  title: 'Rwanda National Police — Provisional Driving Licence (PDL)',
  publisher: 'police.gov.rw',
  url: 'https://police.gov.rw/services/testing-and-licencing/provisional-driving-licence-pdl/',
  accessedOn: REVIEW_DATE,
};

export const RNP_DEFINITIVE: SourceCitation = {
  title: 'Rwanda National Police — Definitive Driving Licence',
  publisher: 'police.gov.rw',
  url: 'https://police.gov.rw/services/testing-and-licencing/definitive-driving-licence/',
  accessedOn: REVIEW_DATE,
};

export const RNP_INSPECTION: SourceCitation = {
  title: 'Rwanda National Police — Automobile Inspection',
  publisher: 'police.gov.rw',
  url: 'https://police.gov.rw/services/automobile-inspection/',
  accessedOn: REVIEW_DATE,
};

export const RNP_FINE_PAGE: SourceCitation = {
  title: 'Rwanda National Police — Traffic Fines',
  publisher: 'police.gov.rw',
  url: 'https://police.gov.rw/services/traffic-and-road-safety/traffic-fines/',
  accessedOn: REVIEW_DATE,
};

export const IREMBO_PDL: SourceCitation = {
  title: 'IremboGov — Everything you need to know about getting your e-Provisional Driving Licence',
  publisher: 'support.irembo.gov.rw',
  url: 'https://support.irembo.gov.rw/en/support/solutions/articles/47001241773-everything-you-need-to-know-about-getting-your-e-provisional-driving-license',
  accessedOn: REVIEW_DATE,
};

export const IREMBO_DEFINITIVE: SourceCitation = {
  title: 'IremboGov — How to apply for a definitive driving licence',
  publisher: 'support.irembo.gov.rw',
  url: 'https://support.irembo.gov.rw/en/support/solutions/articles/47001236141-how-to-apply-for-a-definitive-driving-license',
  accessedOn: REVIEW_DATE,
};

/**
 * Addressable by key so the fact registry, the content pack and the administrator's
 * source list all cite the same document.
 */
export const PRIMARY_SOURCES = {
  LAW_2026,
  DECREE_2002,
  ORDER_2015,
  ORDER_2024,
  RURA_PASSENGER,
  RNP_PDL,
  RNP_DEFINITIVE,
  RNP_INSPECTION,
  RNP_FINE_PAGE,
  IREMBO_PDL,
  IREMBO_DEFINITIVE,
} as const;
