import { describe, expect, it } from "vitest";

import {
  getComingSoon,
  getPageMeta,
  getStation,
  listRegionPicker,
  listStationChips,
  STATION_IDS,
} from "./shell";

describe("listStationChips", () => {
  it("지점 10곳을 시안 순서대로 돌려준다", () => {
    const chips = listStationChips("apple", null);
    expect(chips.map((c) => c.name)).toEqual([
      "춘천",
      "태백",
      "수원",
      "청주",
      "서산",
      "전주",
      "광주",
      "안동",
      "진주",
      "서귀포",
    ]);
    expect(STATION_IDS).toEqual([
      101, 216, 119, 131, 129, 146, 156, 136, 192, 189,
    ]);
  });

  it("작물·토양마다 DB 의 오늘 물 판정을 붙이고, 없으면 null", () => {
    const statuses = {
      apple: { 131: "need" as const },
      cabbage: { 131: "caution" as const },
      soil: {
        loam: { 131: "fair" as const },
        sand: { 131: "dry" as const },
      },
    };
    const apple = listStationChips("apple", statuses);
    const cabbage = listStationChips("cabbage", statuses);
    const commonLoam = listStationChips("common", statuses);
    const commonSand = listStationChips("common", statuses, "sand");
    expect(apple.find((c) => c.id === 131)?.status).toBe("need");
    expect(cabbage.find((c) => c.id === 131)?.status).toBe("caution");
    expect(commonLoam.find((c) => c.id === 131)?.status).toBe("fair");
    expect(commonSand.find((c) => c.id === 131)?.status).toBe("dry");
    expect(apple.find((c) => c.id === 101)?.status).toBeNull();
    expect(
      listStationChips("apple", null).every((c) => c.status === null),
    ).toBe(true);
  });
});

describe("getStation", () => {
  it("없는 지점 번호나 폐지 지점(isActive=false)은 null 이다", () => {
    expect(getStation(999)).toBeNull();
    expect(getStation(175)).toBeNull(); // 진도(첨찰산) 폐지
    expect(getStation(116)).toBeNull(); // 관악산 폐지
  });

  it("대표 밖 운영 지점(홍천 212)도 찾아 돌려준다", () => {
    expect(getStation(212)).toMatchObject({
      id: 212,
      name: "홍천",
      sido: "강원",
      isRepresentative: false,
      measuresSunlight: false,
      sunlightMeasured: null,
    });
  });
});

describe("listRegionPicker", () => {
  it("검색어가 없으면 '대표 지점 10곳' + '전체 ASOS 지점 97곳 · 가나다순'을 돌려준다", () => {
    const statuses = {
      apple: { 101: "caution" as const, 131: "need" as const },
      cabbage: {},
    };
    const picker = listRegionPicker("apple", statuses, "");
    expect(picker.isEmpty).toBe(false);
    expect(picker.sections.map((s) => s.label)).toEqual([
      "대표 지점 10곳",
      "전체 ASOS 지점 97곳 · 가나다순",
    ]);
    expect(picker.sections[0].items).toHaveLength(10);
    expect(picker.sections[1].items).toHaveLength(97);

    // 시안 대비 변경: 폐지된 175 진도(첨찰산)는 빠지고, 181 서청주·296 북부산이 들어간다
    const allIds = picker.sections[1].items.map((x) => x.id);
    expect(allIds).not.toContain(175);
    expect(allIds).toContain(181);
    expect(allIds).toContain(296);

    // 대표 지점은 DB 판정을 읽고, 대표 밖 지점은 null ("자료 없음")
    expect(picker.sections[0].items.find((x) => x.id === 101)?.status).toBe(
      "caution",
    );
    expect(
      picker.sections[1].items.find((x) => x.id === 212)?.status,
    ).toBeNull();
  });

  it("이름·번호·시도로 거르고 결과가 없으면 isEmpty=true", () => {
    const byName = listRegionPicker("apple", null, "홍천");
    expect(byName.sections[0].label).toBe("검색 결과 1곳");
    expect(byName.sections[0].items.map((x) => x.id)).toEqual([212]);

    const byId = listRegionPicker("apple", null, "212");
    expect(byId.sections[0].items.map((x) => x.name)).toEqual(["홍천"]);

    const empty = listRegionPicker("apple", null, "없는지역");
    expect(empty.isEmpty).toBe(true);
    expect(empty.sections[0].label).toBe("검색 결과 0곳");
  });
});

describe("getPageMeta", () => {
  const chuncheon = getStation(101)!;
  const taebaek = getStation(216)!;

  it("햇빛을 재지 않는 지점은 햇빛 화면이 모두 '자료 없음'이다", () => {
    expect(getPageMeta("sunlight", taebaek)).toEqual({
      source: "기상청 ASOS 태백(216) 일사 관측 · 자료 없음",
      issue: "자료 없음",
      updated: "자료 없음",
      short: "자료 없음",
    });
  });

  const observed = {
    date: "2026-10-24",
    fetchedAt: "2026-10-24T17:20:00+00:00",
  };

  it("햇빛·온도는 그 지점 ASOS 관측을 받은 실제 시각을 쓴다", () => {
    expect(getPageMeta("sunlight", chuncheon, observed)).toEqual({
      // 평년 기간은 DB 값이라 햇빛 화면이 붙인다 (결정 0013·0016, 시안의 "평년값 1991–2020" 지움)
      source: "기상청 ASOS 춘천(101) 일사 관측",
      issue: "해당 없음 (관측 자료)",
      updated: "10월 25일 02:20 (10월 24일까지 관측)",
      short: "10월 25일 02:20 갱신",
    });
    expect(getPageMeta("temperature", chuncheon, observed)).toMatchObject({
      issue: "해당 없음 (관측 자료)",
      updated: "10월 25일 02:20 (10월 24일까지 관측)",
    });
  });

  it("관측 시각을 읽지 못하면 '자료 없음'", () => {
    expect(getPageMeta("temperature", chuncheon, null)).toMatchObject({
      updated: "자료 없음",
      short: "자료 없음",
    });
  });

  it("준비 중인 토양·도매시장은 '자료 없음'이다", () => {
    expect(getPageMeta("soil", chuncheon).short).toBe("자료 없음");
    expect(getPageMeta("market", chuncheon).updated).toBe("자료 없음");
  });

  it("내 농장은 밭 주소에 매칭된 지점을 쓴다", () => {
    expect(getPageMeta("my-farm", taebaek)).toEqual({
      source: "기상청 ASOS 태백(216) · 내 밭 기록(CSV)",
      issue: "8월 12일 17시 단기예보",
      updated: "8월 12일 17:42 (미리보기)",
      short: "8월 12일 17:42 갱신",
    });
    expect(getPageMeta("my-farm", chuncheon)).toEqual({
      source: "기상청 ASOS 춘천(101) · 내 밭 기록(CSV)",
      issue: "8월 12일 17시 단기예보",
      updated: "8월 12일 17:42 (미리보기)",
      short: "8월 12일 17:42 갱신",
    });
  });
});

describe("getComingSoon — 토양·도매시장 '준비 중' 본문 글 (시안 그대로)", () => {
  it("토양: 열리면 보여 줄 것 4개와 쓸 자료", () => {
    expect(getComingSoon("soil", "apple")).toEqual({
      items: [
        "우리 밭 흙의 종류(토성)와 물 빠짐",
        "산도(pH)와 유기물이 알맞은지",
        "인산·칼리 같은 양분이 넉넉한지",
        "물 판정에 내 밭 토성을 바로 반영",
      ],
      source: "농촌진흥청 흙토람 (토양 정보)",
    });
  });

  it("토양 글은 작물을 바꿔도 같다", () => {
    expect(getComingSoon("soil", "cabbage")).toEqual(
      getComingSoon("soil", "apple"),
    );
  });

  it("도매시장: ①은 고른 작물 이름 (사과/배추), 작물 공통이면 '오늘 주요 작물 도매 가격'", () => {
    const apple = getComingSoon("market", "apple");
    const cabbage = getComingSoon("market", "cabbage");
    const common = getComingSoon("market", "common");
    expect(apple.items).toEqual([
      "오늘 사과 도매 가격",
      "지난해·평년 같은 때와 비교",
      "도매시장에 들어온 양(반입량) 흐름",
      "앞으로의 가격 전망",
    ]);
    expect(cabbage.items[0]).toBe("오늘 배추 도매 가격");
    expect(common.items[0]).toBe("오늘 주요 작물 도매 가격");
    expect(apple.source).toBe(
      "aT 농산물유통정보 · 한국농촌경제연구원(KREI) 농업관측",
    );
  });
});
