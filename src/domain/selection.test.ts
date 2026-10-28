import { describe, expect, it } from "vitest";

import {
  buildRegionSections,
  filterStations,
  nextInRotation,
  parseSelection,
  rotationPosition,
  sortStationsKo,
  sunlightStatusLabel,
  withSelection,
  type StationOption,
} from "./selection";

const IDS = [101, 216, 119] as const;

const SAMPLE_STATIONS: readonly StationOption[] = [
  {
    id: 101,
    name: "춘천",
    sido: "강원",
    isRepresentative: true,
    isActive: true,
  },
  {
    id: 216,
    name: "태백",
    sido: "강원",
    isRepresentative: true,
    isActive: true,
  },
  {
    id: 131,
    name: "청주",
    sido: "충북",
    isRepresentative: true,
    isActive: true,
  },
  {
    id: 212,
    name: "홍천",
    sido: "강원",
    isRepresentative: false,
    isActive: true,
  },
  {
    id: 105,
    name: "강릉",
    sido: "강원",
    isRepresentative: false,
    isActive: true,
  },
  {
    id: 181,
    name: "서청주",
    sido: "충북",
    isRepresentative: false,
    isActive: true,
  },
  {
    id: 296,
    name: "북부산",
    sido: "부산",
    isRepresentative: false,
    isActive: true,
  },
  {
    id: 175,
    name: "진도(첨찰산)",
    sido: "전남",
    isRepresentative: false,
    isActive: false,
  },
  {
    id: 116,
    name: "관악산",
    sido: "경기",
    isRepresentative: false,
    isActive: false,
  },
];

describe("parseSelection", () => {
  it("주소창에 값이 없으면 첫 지점과 사과를 고른다", () => {
    expect(parseSelection({}, IDS)).toEqual({ stationId: 101, crop: "apple" });
  });

  it("주소창의 지점 번호와 작물을 읽는다", () => {
    expect(parseSelection({ st: "216", crop: "cabbage" }, IDS)).toEqual({
      stationId: 216,
      crop: "cabbage",
    });
  });

  it("URLSearchParams 도 읽는다", () => {
    const params = new URLSearchParams("st=119&crop=cabbage");
    expect(parseSelection(params, IDS)).toEqual({
      stationId: 119,
      crop: "cabbage",
    });
  });

  it("없는 지점이나 작물은 기본값으로 돌린다", () => {
    expect(parseSelection({ st: "999", crop: "rice" }, IDS)).toEqual({
      stationId: 101,
      crop: "apple",
    });
    expect(parseSelection({ st: "춘천", crop: "" }, IDS)).toEqual({
      stationId: 101,
      crop: "apple",
    });
  });

  it("재배 방식 번호(kc)는 1 이상 정수일 때만 읽는다", () => {
    expect(parseSelection({ st: "216", crop: "apple", kc: "1" }, IDS)).toEqual({
      stationId: 216,
      crop: "apple",
      kc: 1,
    });
    expect(parseSelection({ kc: "0" }, IDS)).not.toHaveProperty("kc");
    expect(parseSelection({ kc: "1.5" }, IDS)).not.toHaveProperty("kc");
    expect(parseSelection({ kc: "가" }, IDS)).not.toHaveProperty("kc");
  });

  it("같은 이름이 여러 번 오면 첫 값을 쓴다", () => {
    expect(
      parseSelection({ st: ["216", "119"], crop: ["cabbage"] }, IDS),
    ).toEqual({ stationId: 216, crop: "cabbage" });
  });

  it("지점 사전을 넘기면 대표 밖 운영 지점(212)도 읽는다", () => {
    expect(
      parseSelection({ st: "212", crop: "apple" }, SAMPLE_STATIONS),
    ).toEqual({
      stationId: 212,
      crop: "apple",
    });
  });

  it("사전에 없거나 폐지된 지점(isActive=false)은 기본 지점(춘천 101)으로 되돌린다", () => {
    expect(
      parseSelection({ st: "999", crop: "apple" }, SAMPLE_STATIONS),
    ).toEqual({
      stationId: 101,
      crop: "apple",
    });
    expect(
      parseSelection({ st: "175", crop: "apple" }, SAMPLE_STATIONS),
    ).toEqual({
      stationId: 101,
      crop: "apple",
    });
    expect(
      parseSelection({ st: "116", crop: "cabbage" }, SAMPLE_STATIONS),
    ).toEqual({
      stationId: 101,
      crop: "cabbage",
    });
  });
});

describe("withSelection", () => {
  it("주소 뒤에 지점과 작물을 붙인다 (대표 밖 지점도 그대로 쓴다)", () => {
    expect(withSelection("/water", { stationId: 136, crop: "cabbage" })).toBe(
      "/water?st=136&crop=cabbage",
    );
    expect(withSelection("/water", { stationId: 212, crop: "apple" })).toBe(
      "/water?st=212&crop=apple",
    );
  });

  it("재배 방식을 골랐으면 kc 도 붙인다", () => {
    expect(
      withSelection("/water", { stationId: 101, crop: "apple", kc: 1 }),
    ).toBe("/water?st=101&crop=apple&kc=1");
  });

  it("선택값이 아직 없으면 주소만 돌려준다", () => {
    expect(withSelection("/water", null)).toBe("/water");
  });
});

describe("자동 전환 순서", () => {
  it("사과로 지점을 차례로 돌고, 끝나면 배추로 넘어간다", () => {
    expect(nextInRotation({ stationId: 101, crop: "apple" }, IDS)).toEqual({
      stationId: 216,
      crop: "apple",
    });
    expect(nextInRotation({ stationId: 119, crop: "apple" }, IDS)).toEqual({
      stationId: 101,
      crop: "cabbage",
    });
  });

  it("배추 마지막 지점 다음은 사과 첫 지점이다", () => {
    expect(nextInRotation({ stationId: 119, crop: "cabbage" }, IDS)).toEqual({
      stationId: 101,
      crop: "apple",
    });
  });

  it("몇 번째인지 1부터 센다 (사과 먼저, 배추 나중)", () => {
    expect(rotationPosition({ stationId: 101, crop: "apple" }, IDS)).toBe(1);
    expect(rotationPosition({ stationId: 119, crop: "apple" }, IDS)).toBe(3);
    expect(rotationPosition({ stationId: 216, crop: "cabbage" }, IDS)).toBe(5);
  });

  it("대표 지점 밖을 골랐으면 순번은 null 이다 (자동 전환 중지)", () => {
    expect(rotationPosition({ stationId: 212, crop: "apple" }, IDS)).toBeNull();
  });
});

describe("지역 검색·정렬·목록 (sortStationsKo, filterStations, buildRegionSections)", () => {
  it("한글 가나다순(localeCompare('ko'))으로 정렬하고 이름이 같으면 번호 오름차순", () => {
    const sorted = sortStationsKo([
      { id: 212, name: "홍천" },
      { id: 105, name: "강릉" },
      { id: 188, name: "성산" },
      { id: 187, name: "성산" },
      { id: 101, name: "춘천" },
    ]);
    expect(sorted.map((s) => `${s.name}:${s.id}`)).toEqual([
      "강릉:105",
      "성산:187",
      "성산:188",
      "춘천:101",
      "홍천:212",
    ]);
  });

  it("이름 포함·번호 앞자리·시도로 찾고 폐지 지점(isActive=false)은 제외한다", () => {
    expect(filterStations(SAMPLE_STATIONS, "홍천").map((s) => s.id)).toEqual([
      212,
    ]);
    expect(filterStations(SAMPLE_STATIONS, "청주").map((s) => s.name)).toEqual([
      "서청주",
      "청주",
    ]);
    // 번호 앞자리: "21"은 212(홍천), 216(태백)만 찾고 101·131은 제외
    expect(filterStations(SAMPLE_STATIONS, "21").map((s) => s.id)).toEqual([
      216, 212,
    ]);
    // 시도: "강원"은 가나다순으로 강릉·춘천·태백·홍천
    expect(filterStations(SAMPLE_STATIONS, "강원").map((s) => s.name)).toEqual([
      "강릉",
      "춘천",
      "태백",
      "홍천",
    ]);
    // 폐지 지점(175 진도(첨찰산), 116 관악산)은 검색 결과에 나오지 않는다
    expect(filterStations(SAMPLE_STATIONS, "진도")).toEqual([]);
    expect(filterStations(SAMPLE_STATIONS, "175")).toEqual([]);
    expect(filterStations(SAMPLE_STATIONS, "관악산")).toEqual([]);
  });

  it("검색어가 비었으면 '대표 지점 N곳' 다음 '전체 ASOS 지점 N곳 · 가나다순'", () => {
    const result = buildRegionSections(SAMPLE_STATIONS, "  ");
    expect(result.isEmpty).toBe(false);
    expect(result.totalActive).toBe(7);
    expect(result.sections.map((s) => s.label)).toEqual([
      "대표 지점 3곳",
      "전체 ASOS 지점 7곳 · 가나다순",
    ]);
    expect(result.sections[0].items.map((s) => s.name)).toEqual([
      "춘천",
      "태백",
      "청주",
    ]);
    expect(result.sections[1].items.map((s) => s.name)).toEqual([
      "강릉",
      "북부산",
      "서청주",
      "청주",
      "춘천",
      "태백",
      "홍천",
    ]);
  });

  it("검색어가 있으면 '검색 결과 N곳', 맞는 지점이 없으면 0곳과 isEmpty=true", () => {
    const hit = buildRegionSections(SAMPLE_STATIONS, "충북");
    expect(hit.isEmpty).toBe(false);
    expect(hit.sections).toHaveLength(1);
    expect(hit.sections[0].label).toBe("검색 결과 2곳");
    expect(hit.sections[0].items.map((s) => s.name)).toEqual([
      "서청주",
      "청주",
    ]);

    const miss = buildRegionSections(SAMPLE_STATIONS, "없는곳");
    expect(miss.isEmpty).toBe(true);
    expect(miss.sections).toHaveLength(1);
    expect(miss.sections[0].label).toBe("검색 결과 0곳");
    expect(miss.sections[0].items).toEqual([]);
  });
});

describe("sunlightStatusLabel", () => {
  it("measures_sunlight 가 거짓이면 '관측 안 함', null 이면 '확인 안 됨', 참이면 '관측함'", () => {
    expect(sunlightStatusLabel(false)).toBe("관측 안 함");
    expect(sunlightStatusLabel(null)).toBe("확인 안 됨");
    expect(sunlightStatusLabel(true)).toBe("관측함");
  });
});
