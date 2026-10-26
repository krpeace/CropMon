export interface SoilInfo {
  id: number;
  ko: string;
  en: string;
  taw: number;
}

export const SOILS: readonly SoilInfo[] = [
  { id: 0, ko: "사토", en: "Sand", taw: 60 },
  { id: 1, ko: "양질사토", en: "Loamy sand", taw: 80 },
  { id: 2, ko: "사양토", en: "Sandy loam", taw: 110 },
  { id: 3, ko: "양토", en: "Loam", taw: 130 },
  { id: 4, ko: "미사질양토", en: "Silt loam", taw: 160 },
  { id: 5, ko: "미사토", en: "Silt", taw: 170 },
  { id: 6, ko: "사질식양토", en: "Sandy clay loam", taw: 120 },
  { id: 7, ko: "식양토", en: "Clay loam", taw: 140 },
  { id: 8, ko: "미사질식양토", en: "Silty clay loam", taw: 160 },
  { id: 9, ko: "사질식토", en: "Sandy clay", taw: 120 },
  { id: 10, ko: "미사질식토", en: "Silty clay", taw: 150 },
  { id: 11, ko: "식토", en: "Clay", taw: 140 },
];

/** 시안 지점 인덱스(0~9)를 ASOS 관측소 번호로 연결하는 표 */
const STATION_IDS: readonly number[] = [
  101, // 0: 춘천
  216, // 1: 태백
  119, // 2: 수원
  131, // 3: 청주
  129, // 4: 서산
  146, // 5: 전주
  156, // 6: 광주
  136, // 7: 안동
  192, // 8: 진주
  189, // 9: 서귀포
];

/** 주소 내 시·군 이름에 대응하는 지점 인덱스 */
export const ADDR_MAPPING: Readonly<Record<string, number>> = {
  춘천: 0,
  홍천: 0,
  화천: 0,
  양구: 0,
  인제: 0,
  가평: 0,
  태백: 1,
  정선: 1,
  영월: 1,
  삼척: 1,
  수원: 2,
  화성: 2,
  용인: 2,
  오산: 2,
  평택: 2,
  안성: 2,
  이천: 2,
  청주: 3,
  충주: 3,
  증평: 3,
  진천: 3,
  괴산: 3,
  보은: 3,
  서산: 4,
  태안: 4,
  당진: 4,
  예산: 4,
  홍성: 4,
  전주: 5,
  완주: 5,
  김제: 5,
  익산: 5,
  남원: 5,
  진안: 5,
  무주: 5,
  장수: 5,
  임실: 5,
  광주: 6,
  나주: 6,
  담양: 6,
  화순: 6,
  장성: 6,
  안동: 7,
  영주: 7,
  봉화: 7,
  청송: 7,
  예천: 7,
  의성: 7,
  진주: 8,
  사천: 8,
  산청: 8,
  하동: 8,
  함양: 8,
  거창: 8,
  서귀포: 9,
  제주: 9,
};

export interface FarmMatchResult {
  stationId: number;
  km: string;
}

/**
 * 입력된 주소 문자열에서 처음 매칭되는 시·군을 찾아 관측 지점 번호와 거리를 계산한다.
 * 매칭되는 시·군이 없으면 null을 반환한다.
 */
export function farmMatch(addr: string): FarmMatchResult | null {
  const trimmed = (addr ?? "").trim();
  if (!trimmed) return null;

  for (const k of Object.keys(ADDR_MAPPING)) {
    if (trimmed.includes(k)) {
      let h = 0;
      for (const ch of trimmed) {
        h = (h * 31 + ch.charCodeAt(0)) % 997;
      }
      const stationIndex = ADDR_MAPPING[k];
      const stationId = STATION_IDS[stationIndex];
      const km = (3 + (h % 210) / 10).toFixed(1);
      return { stationId, km };
    }
  }

  return null;
}
