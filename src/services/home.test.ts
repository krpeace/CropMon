import { describe, expect, it } from "vitest";

import { SOIL_CODES, type Crop, type SoilCode } from "@/domain/selection";
import { FILLED_COPY, OBSERVED_DATE_COPY } from "@/domain/water-outlook";
import type { HomeGrowth } from "./growth-latest";
import { getHomeView } from "./home";
import type {
  SoilStationWater,
  StationBoard,
  StationWater,
} from "./station-status";

/** 가짜 판정 표. 값은 지어낸 것이다. 오늘 = 2026-10-25. */
const base: Omit<StationWater, "status" | "drMm" | "forecast"> = {
  rawMm: 65,
  tawMm: 130,
  seasonStart: "2026-04-01",
  seasonEnd: "2026-11-15",
  observedDate: "2026-10-24",
  filled: false,
};
const chuncheon: StationWater = {
  ...base,
  status: "caution",
  drMm: 52.4,
  forecast: {
    needIn: 1,
    days: [
      { date: "2026-10-26", status: "need" },
      { date: "2026-10-27", status: "need" },
      { date: "2026-10-28", status: "caution" },
    ],
  },
};
const andong: StationWater = {
  ...base,
  status: "caution",
  drMm: 40.2,
  forecast: null,
};
const blank = () =>
  Object.fromEntries(
    [101, 216, 119, 131, 129, 146, 156, 136, 192, 189].map((id) => [id, null]),
  );
const blankSoil = () =>
  Object.fromEntries(SOIL_CODES.map((c) => [c, blank()])) as Record<
    SoilCode,
    Record<number, SoilStationWater | null>
  >;
const BOARD: StationBoard = {
  ok: true,
  water: {
    apple: { ...blank(), 101: chuncheon, 136: andong },
    cabbage: {
      ...blank(),
      101: {
        ...base,
        status: "dormant",
        drMm: null,
        forecast: null,
        seasonStart: "2026-06-01",
        seasonEnd: "2026-09-08",
      },
    },
  },
  soil: {
    ...blankSoil(),
    loam: {
      ...blank(),
      101: {
        status: "fair",
        awPct: 48,
        drMm: 33.8,
        tawMm: 65,
        rawMm: 26,
        observedDate: "2026-10-24",
        filled: false,
      },
      136: {
        status: "dry",
        awPct: 25,
        drMm: 48.75,
        tawMm: 65,
        rawMm: 26,
        observedDate: "2026-10-24",
        filled: false,
      },
    },
    sand: {
      ...blank(),
      101: {
        status: "very_dry",
        awPct: 10,
        drMm: 27,
        tawMm: 30,
        rawMm: 12,
        observedDate: "2026-10-24",
        filled: false,
      },
    },
  },
  updated: {
    ...blank(),
    101: { at: "2026-10-25T08:42:00+00:00", runHour: "17", weatherDate: null },
    136: {
      at: "2026-10-24T17:20:00+00:00",
      runHour: null,
      weatherDate: "2026-10-24",
    },
  },
};
const NOW = () => new Date("2026-10-25T18:00:00+09:00");
/** 가짜 적산온도·적산일사 (마지막 관측일). 수원(119)은 둘 다 없고, 진주(192)는 일사가 없다. */
const GROWTH: HomeGrowth = {
  heatOk: true,
  sunOk: true,
  heat: {
    101: { date: "2026-10-24", cum: 4165, normal: 3973 },
    216: { date: "2026-10-24", cum: 2700, normal: 2650 },
    136: { date: "2026-10-24", cum: 2140, normal: 2190 },
  },
  sun: {
    101: { date: "2026-10-24", cum: 3218, normal: 3352 },
    216: { date: "2026-10-24", cum: 3500, normal: 3333 },
  },
};
const view = (
  stationId: number,
  crop: Crop = "apple",
  board = BOARD,
  growth = GROWTH,
  soil?: SoilCode,
) => getHomeView({ stationId, crop, soil }, board, growth, NOW);

describe("종합 화면 물 카드 (DB)", () => {
  it("예보 지점: 판정 문구·배지·숫자·게이지, 첫 줄 갱신은 회차", () => {
    const v = view(101);
    expect(v.water).toEqual({
      verdict: "오늘은 괜찮아요, 내일 물 주세요",
      tone: "need",
      badge: { status: "need", label: "내일 관수 필요" },
      grayBadge: null,
      numbers: "부족한 물 52 mm / 관수 시작점 65 mm",
      note: null,
      gauge: { status: "caution", fillPct: (52.4 / 130) * 100, rawPct: 50 },
    });
    expect(v.meta).toBe(
      "10월 25일 17:42 갱신 · 기상청 ASOS 춘천(101) · 17시 단기예보",
    );
  });

  it("예보가 없는 지점: 앞날을 말하지 않고 '어제까지 관측 기준'", () => {
    const v = view(136);
    expect(v.water).toMatchObject({
      verdict: "아직 여유 있어요",
      badge: { status: "caution", label: "주의" },
      numbers: "부족한 물 40 mm / 관수 시작점 65 mm · 어제까지 관측 기준",
    });
    expect(v.meta).toBe(
      "10월 25일 02:20 갱신 · 기상청 ASOS 안동(136) · 어제까지 관측",
    );
  });

  it("휴면기·자료 없음", () => {
    expect(view(101, "cabbage").water).toMatchObject({
      verdict: "지금은 배추 작기가 아니에요",
      tone: "dormant",
      numbers: "내년 6월 1일 정식부터 물을 계산해요.",
      gauge: null,
    });
    expect(view(119).water).toMatchObject({
      verdict: "자료 없음",
      badge: null,
      grayBadge: "자료 없음",
      numbers: "이 지역의 물 판정 자료가 아직 없어요",
      gauge: null,
    });
    expect(view(119).meta).toBe("자료 없음 · 기상청 ASOS 수원(119)");
  });

  it("대표 밖 지점(홍천 212)을 고르면 물·온도 카드에 '자료 없음'과 한 줄 안내, 일사는 확인 안 됨", () => {
    const v = view(212);
    expect(v.meta).toBe("자료 없음 · 기상청 ASOS 홍천(212)");
    expect(v.water).toMatchObject({
      verdict: "자료 없음",
      badge: null,
      grayBadge: "자료 없음",
      numbers:
        "이 지점은 아직 물 계산을 하지 않아요. 가까운 대표 지점을 골라 보세요",
      gauge: null,
    });
    expect(v.growth).toEqual({
      verdict: "자료 없음",
      numbers: "이 지역의 적산온도 자료가 아직 없어요",
      note: null,
      missing: true,
    });
    expect(v.sunlight).toEqual({
      verdict: "자료 없음",
      numbers: "홍천 관측소의 햇빛 자료가 없어요 (관측 안 함)",
      note: null,
      missing: true,
    });
  });

  it("filled=true 물 카드: 예보 없음·예보 있음·휴면기 구분 및 metaLine 기준일 반영", () => {
    const obsFilledBoard: StationBoard = {
      ...BOARD,
      water: {
        ...BOARD.water,
        apple: {
          ...BOARD.water.apple,
          136: { ...andong, filled: true },
          101: { ...chuncheon, filled: true },
        },
        cabbage: {
          ...BOARD.water.cabbage,
          101: {
            ...BOARD.water.cabbage[101]!,
            filled: true,
          },
        },
      },
    };

    const andongFilled = view(136, "apple", obsFilledBoard);
    expect(andongFilled.water).toMatchObject({
      badge: { status: "caution", label: "주의" },
      grayBadge: FILLED_COPY.badge,
      numbers:
        "부족한 물 40 mm / 관수 시작점 65 mm · 어제까지 기준 (추정 포함)",
      note: FILLED_COPY.notice,
    });
    expect(andongFilled.meta).toBe(
      "10월 25일 02:20 갱신 · 기상청 ASOS 안동(136) · 어제까지 추정 포함",
    );

    const chuncheonFilled = view(101, "apple", obsFilledBoard);
    expect(chuncheonFilled.water).toMatchObject({
      badge: { status: "need", label: "내일 관수 필요" },
      grayBadge: FILLED_COPY.badge,
      note: FILLED_COPY.noticeFromFilled,
    });
    expect(chuncheonFilled.meta).toBe(
      "10월 25일 17:42 갱신 · 기상청 ASOS 춘천(101) · 17시 단기예보",
    );

    // 휴면기는 filled=true 여도 배지·안내를 띄우지 않는다
    const dormantFilled = view(101, "cabbage", obsFilledBoard);
    expect(dormantFilled.water).toMatchObject({
      tone: "dormant",
      grayBadge: null,
      note: null,
    });

    // 어제보다 오래된 관측일(10/22)은 실제 날짜로 표시
    const olderObsBoard: StationBoard = {
      ...BOARD,
      water: {
        ...BOARD.water,
        apple: {
          ...BOARD.water.apple,
          136: { ...andong, observedDate: "2026-10-22", filled: false },
        },
      },
    };
    const andongOlder = view(136, "apple", olderObsBoard);
    expect(andongOlder.water.numbers).toBe(
      "부족한 물 40 mm / 관수 시작점 65 mm · 10월 22일까지 관측 기준",
    );
    expect(andongOlder.meta).toBe(
      "10월 25일 02:20 갱신 · 기상청 ASOS 안동(136) · 10월 22일까지 관측",
    );
  });

  it("DB 를 읽지 못했으면 그 사실을 적는다", () => {
    const v = view(101, "apple", {
      ...BOARD,
      ok: false,
      water: { apple: blank(), cabbage: blank() },
    });
    expect(v.water.numbers).toBe(
      "자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.",
    );
  });
});

describe("온도·햇빛 카드 (DB)", () => {
  it("온도: 평년 대비 ℃ 차이와 적산온도 (온도 화면과 같은 문구)", () => {
    expect(view(101).growth).toEqual({
      verdict: "평년보다 +192℃",
      numbers: "적산온도 4,165 / 평년 3,973℃",
      note: null,
      missing: false,
    });
    expect(view(136).growth.verdict).toBe("평년보다 -50℃");
  });

  it("온도·햇빛: 읽은 날짜가 어제보다 이전이면 'OO월 OO일까지의 값이에요' 안내", () => {
    const olderGrowth: HomeGrowth = {
      ...GROWTH,
      heat: {
        ...GROWTH.heat,
        101: { date: "2026-10-22", cum: 4100, normal: 3940 },
      },
      sun: {
        ...GROWTH.sun,
        101: { date: "2026-10-21", cum: 3150, normal: 3300 },
      },
    };
    const v = view(101, "apple", BOARD, olderGrowth);
    expect(v.growth.note).toBe("10월 22일까지의 값이에요");
    expect(v.sunlight.note).toBe("10월 21일까지의 값이에요");
  });

  it("온도: 작은 차이도 숫자로 보여 준다 (태백형도 같은 방식)", () => {
    expect(view(216).growth).toMatchObject({
      verdict: "평년보다 +50℃",
      missing: false,
    });
  });

  it("햇빛: 평년 대비 %와 적산일사", () => {
    expect(view(101).sunlight).toEqual({
      verdict: "올해 햇빛은 평년의 96%",
      numbers: "적산일사 3,218 / 평년 3,352 MJ/m²",
      note: null,
      missing: false,
    });
    // 태백도 DB 에 일사 자료가 있으면 보인다
    expect(view(216).sunlight.verdict).toBe("올해 햇빛은 평년의 105%");
  });

  it("자료가 없으면 회색 '자료 없음'과 이유", () => {
    expect(view(119).growth).toEqual({
      verdict: "자료 없음",
      numbers: "이 지역의 적산온도 자료가 아직 없어요",
      note: null,
      missing: true,
    });
    expect(view(192).sunlight).toEqual({
      verdict: "자료 없음",
      numbers: "진주 관측소의 햇빛 자료가 없어요",
      note: null,
      missing: true,
    });
  });

  it("대표 밖 지점(홍천 212)도 온도 카드는 NON_REP_GUIDE 대신 '이 지역의 적산온도 자료가 아직 없어요'로 통일된다", () => {
    const v = view(212);
    expect(v.growth).toEqual({
      verdict: "자료 없음",
      numbers: "이 지역의 적산온도 자료가 아직 없어요",
      note: null,
      missing: true,
    });
  });

  it("비대표 지점(홍천 212)도 적산온도 자료가 있으면 홈 온도 카드에 값이 나온다", () => {
    const customGrowth: HomeGrowth = {
      ...GROWTH,
      heat: {
        ...GROWTH.heat,
        212: { date: "2026-10-24", cum: 3438, normal: 3300 },
      },
    };
    const v = view(212, "common", BOARD, customGrowth);
    expect(v.growth).toEqual({
      verdict: "평년보다 +138℃",
      numbers: "적산온도 3,438 / 평년 3,300℃",
      note: null,
      missing: false,
    });
    // 햇빛을 재지 않는 지점은 지금처럼 "자료 없음"
    expect(v.sunlight).toEqual({
      verdict: "자료 없음",
      numbers: "홍천 관측소의 햇빛 자료가 없어요 (관측 안 함)",
      note: null,
      missing: true,
    });
  });

  it("DB 를 읽지 못했으면 그 사실을 적는다", () => {
    const v = view(101, "apple", BOARD, {
      heatOk: false,
      sunOk: false,
      heat: {},
      sun: {},
    });
    const failed = "자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.";
    expect(v.growth).toEqual({
      verdict: "자료 없음",
      numbers: failed,
      note: null,
      missing: true,
    });
    expect(v.sunlight).toEqual({
      verdict: "자료 없음",
      numbers: failed,
      note: null,
      missing: true,
    });
  });
});

describe("전국 표", () => {
  const rows = view(136).rows;

  it("지점 10곳, 고른 지점 표시", () => {
    expect(rows).toHaveLength(10);
    expect(rows.filter((r) => r.selected).map((r) => r.name)).toEqual(["안동"]);
  });

  it("춘천 줄: 내일 관수, 52 / 65 mm, 앞으로 3일", () => {
    expect(rows[0]).toMatchObject({
      id: 101,
      badge: { status: "need", label: "내일 관수" },
      drText: "52 / 65 mm",
      days: [
        { label: "10/26", status: "need" },
        { label: "10/27", status: "need" },
        { label: "10/28", status: "caution" },
      ],
      heat: "+192℃",
      sunlight: "96%",
      heatDiff: 192,
      sunPct: 96,
    });
  });

  it("막대용 숫자는 DB 값 그대로, 자료 없으면 null", () => {
    expect(rows.find((r) => r.id === 216)).toMatchObject({
      heatDiff: 50,
      sunPct: 105,
    });
    expect(rows.find((r) => r.id === 119)).toMatchObject({
      heatDiff: null,
      sunPct: null,
    });
  });

  it("예보 없는 줄은 앞으로 3일 null, 자료 없는 줄은 배지 null", () => {
    const andongRow = rows.find((r) => r.id === 136)!;
    expect(andongRow).toMatchObject({
      badge: { status: "caution", label: "주의" },
      drText: "40 / 65 mm",
      days: null,
    });
    expect(rows.find((r) => r.id === 119)).toMatchObject({
      badge: null,
      gauge: null,
      drText: "—",
      days: null,
      heat: null,
      sunlight: null,
    });
  });
});

describe("전국 표 생육 칸 (DB)", () => {
  const rows = view(136).rows;

  it("적산온도는 평년 대비 ℃, 적산일사는 평년 대비 %", () => {
    expect(rows.find((r) => r.id === 136)).toMatchObject({
      heat: "-50℃",
      sunlight: null,
    });
    expect(rows.find((r) => r.id === 216)).toMatchObject({
      heat: "+50℃",
      sunlight: "105%",
    });
  });
});

describe("종합 화면 작물 공통 (토양 물 상태)", () => {
  it("물 카드: 토양 5단계 배지 + '토양 속 남은 물 48%' + '양토 기준 · 남은 물 31 / 담을 수 있는 물 65 mm'", () => {
    const v = view(101, "common");
    expect(v.water).toEqual({
      verdict: "토양 속 남은 물 48%",
      tone: "fair",
      badge: { status: "fair", label: "보통" },
      grayBadge: null,
      numbers: "양토 기준 · 남은 물 31 / 담을 수 있는 물 65 mm",
      note: null,
      gauge: { status: "fair", fillPct: 48, rawPct: 60 },
    });
    expect(v.rows[0]).toMatchObject({
      id: 101,
      badge: { status: "fair", label: "보통" },
      drText: "31 / 65 mm",
      days: null,
    });
  });

  it("토양을 사토(sand)로 바꾸면 사토 기준으로 바뀐다", () => {
    const v = view(101, "common", BOARD, GROWTH, "sand");
    expect(v.water).toMatchObject({
      verdict: "토양 속 남은 물 10%",
      tone: "very_dry",
      badge: { status: "very_dry", label: "매우 건조" },
      numbers: "사토 기준 · 남은 물 3 / 담을 수 있는 물 30 mm",
    });
  });

  it("비대표 지점(홍천 212): 토양 자료가 있으면 물 카드와 갱신 줄('어제까지 관측')이 모두 정상 표출된다", () => {
    const customBoard: StationBoard = {
      ...BOARD,
      soil: {
        ...BOARD.soil,
        loam: {
          ...BOARD.soil.loam,
          212: {
            status: "fair",
            awPct: 50,
            drMm: 30,
            tawMm: 60,
            rawMm: 24,
            observedDate: "2026-10-24",
            filled: false,
          },
        },
      },
      updated: {
        ...BOARD.updated,
        212: {
          at: "2026-10-24T09:00:00+00:00",
          runHour: null,
          weatherDate: "2026-10-24",
        }, // 18:00 KST
      },
    };

    const v = view(212, "common", customBoard);
    expect(v.meta).toBe(
      "10월 24일 18:00 갱신 · 기상청 ASOS 홍천(212) · 어제까지 관측",
    );
    expect(v.water).toEqual({
      verdict: "토양 속 남은 물 50%",
      tone: "fair",
      badge: { status: "fair", label: "보통" },
      grayBadge: null,
      numbers: "양토 기준 · 남은 물 30 / 담을 수 있는 물 60 mm",
      note: null,
      gauge: { status: "fair", fillPct: 50, rawPct: 60 },
    });

    // filled=true 토양(겨울철 제외) + 겨울철 제외 검증
    const filledSoilBoard: StationBoard = {
      ...customBoard,
      soil: {
        ...customBoard.soil,
        loam: {
          ...customBoard.soil.loam,
          212: { ...customBoard.soil.loam[212]!, filled: true },
          136: {
            ...BOARD.soil.loam[136]!,
            status: "winter",
            awPct: null,
            drMm: null,
            filled: true,
          },
        },
      },
    };
    const vFilled = view(212, "common", filledSoilBoard);
    expect(vFilled.water).toMatchObject({
      grayBadge: FILLED_COPY.badge,
      numbers:
        "양토 기준 · 남은 물 30 / 담을 수 있는 물 60 mm · 어제까지 기준 (추정 포함)",
      note: FILLED_COPY.notice,
    });
    expect(vFilled.meta).toBe(
      "10월 24일 18:00 갱신 · 기상청 ASOS 홍천(212) · 어제까지 추정 포함",
    );
    const vWinter = view(136, "common", filledSoilBoard);
    expect(vWinter.water).toMatchObject({
      tone: "winter",
      grayBadge: null,
      note: null,
    });
  });

  it("비대표 지점(홍천 212): 토양 자료가 없으면 '이 지역의 물 판정 자료가 아직 없어요'만 표출된다", () => {
    const customBoard: StationBoard = {
      ...BOARD,
      soil: {
        ...BOARD.soil,
        loam: {
          ...BOARD.soil.loam,
          212: null,
        },
      },
    };

    const v = view(212, "common", customBoard);
    expect(v.water).toMatchObject({
      verdict: "자료 없음",
      badge: null,
      grayBadge: "자료 없음",
      numbers: "이 지역의 물 판정 자료가 아직 없어요",
      gauge: null,
    });
  });
});

describe("전국 표·목록 추정 포함(안 3)·적산 기준일 다름(후보 3) (#128 PR 2)", () => {
  it("작물 모드 물·안 3: 0곳이면 안내·표시 없음, 일부면 상단 안내+해당 행만, 전원(휴면 제외)이면 상단 안내만", () => {
    const none = view(101, "apple");
    expect(none.waterFilledScope).toBe("none");
    expect(none.waterFilledNotice).toBeNull();
    expect(none.rows.every((r) => !r.waterFilled)).toBe(true);

    const someBoard: StationBoard = {
      ...BOARD,
      water: {
        ...BOARD.water,
        apple: {
          ...BOARD.water.apple,
          101: { ...chuncheon, filled: true },
          136: { ...andong, filled: false },
          119: { ...andong, status: "dormant", drMm: null, filled: true },
        },
      },
    };
    const some = view(101, "apple", someBoard);
    expect(some.waterFilledScope).toBe("some");
    expect(some.waterFilledNotice).toBe(FILLED_COPY.nationalSomeNotice);
    expect(some.rows.find((r) => r.id === 101)?.waterFilled).toBe(true);
    expect(some.rows.find((r) => r.id === 136)?.waterFilled).toBe(false);
    expect(some.rows.find((r) => r.id === 119)?.waterFilled).toBe(false);

    const allBoard: StationBoard = {
      ...BOARD,
      water: {
        ...BOARD.water,
        apple: {
          ...BOARD.water.apple,
          101: { ...chuncheon, filled: true },
          136: { ...andong, filled: true },
          119: { ...andong, status: "dormant", drMm: null, filled: false },
        },
      },
    };
    const all = view(101, "apple", allBoard);
    expect(all.waterFilledScope).toBe("all");
    expect(all.waterFilledNotice).toBe(FILLED_COPY.nationalAllNotice);
  });

  it("작물 공통(토양) 안 3: 겨울철은 활동 지점 모수에서 제외한다", () => {
    const someSoilBoard: StationBoard = {
      ...BOARD,
      soil: {
        ...BOARD.soil,
        loam: {
          ...BOARD.soil.loam,
          101: { ...BOARD.soil.loam[101]!, filled: true },
          136: { ...BOARD.soil.loam[136]!, filled: false },
          119: {
            status: "winter",
            awPct: null,
            drMm: null,
            tawMm: 65,
            rawMm: 26,
            observedDate: "2026-10-24",
            filled: true,
          },
        },
      },
    };
    const some = view(101, "common", someSoilBoard);
    expect(some.waterFilledScope).toBe("some");
    expect(some.waterFilledNotice).toBe(FILLED_COPY.nationalSomeNotice);
    expect(some.rows.find((r) => r.id === 101)?.waterFilled).toBe(true);
    expect(some.rows.find((r) => r.id === 136)?.waterFilled).toBe(false);
    expect(some.rows.find((r) => r.id === 119)?.waterFilled).toBe(false);

    const allSoilBoard: StationBoard = {
      ...someSoilBoard,
      soil: {
        ...someSoilBoard.soil,
        loam: {
          ...someSoilBoard.soil.loam,
          136: { ...BOARD.soil.loam[136]!, filled: true },
          119: { ...someSoilBoard.soil.loam[119]!, filled: false },
        },
      },
    };
    const all = view(101, "common", allSoilBoard);
    expect(all.waterFilledScope).toBe("all");
    expect(all.waterFilledNotice).toBe(FILLED_COPY.nationalAllNotice);
  });

  it("후보 3 적산 기준일: 전원 어제면 생략, 같은 과거일이면 상단 1줄만, 섞이면 예외 지점만 M/D", () => {
    const yesterday = view(101);
    expect(yesterday.heatDateNote).toBeNull();
    expect(yesterday.sunDateNote).toBeNull();
    expect(
      yesterday.rows.every(
        (r) => r.heatDateTag === null && r.sunDateTag === null,
      ),
    ).toBe(true);

    const samePastGrowth: HomeGrowth = {
      heatOk: true,
      sunOk: true,
      heat: {
        101: { date: "2026-10-22", cum: 4165, normal: 3973 },
        216: { date: "2026-10-22", cum: 2700, normal: 2650 },
        136: { date: "2026-10-22", cum: 2140, normal: 2190 },
      },
      sun: {
        101: { date: "2026-10-21", cum: 3218, normal: 3352 },
        216: { date: "2026-10-21", cum: 3500, normal: 3333 },
      },
    };
    const samePast = view(101, "apple", BOARD, samePastGrowth);
    expect(samePast.heatDateNote).toBe("10월 22일까지의 값이에요");
    expect(samePast.sunDateNote).toBe("10월 21일까지의 값이에요");
    expect(
      samePast.rows.every(
        (r) => r.heatDateTag === null && r.sunDateTag === null,
      ),
    ).toBe(true);

    const mixedGrowth: HomeGrowth = {
      heatOk: true,
      sunOk: true,
      heat: {
        101: { date: "2026-10-24", cum: 4165, normal: 3973 },
        216: { date: "2026-10-24", cum: 2700, normal: 2650 },
        136: { date: "2026-10-22", cum: 2140, normal: 2190 },
      },
      sun: {
        101: { date: "2026-10-22", cum: 3218, normal: 3352 },
        216: { date: "2026-10-22", cum: 3500, normal: 3333 },
        136: { date: "2026-10-20", cum: 3100, normal: 3200 },
      },
    };
    const mixed = view(101, "apple", BOARD, mixedGrowth);
    expect(mixed.heatDateNote).toBe(
      `${OBSERVED_DATE_COPY.yesterdayValue} ${OBSERVED_DATE_COPY.mixedSuffix}`,
    );
    expect(mixed.rows.find((r) => r.id === 101)?.heatDateTag).toBeNull();
    expect(mixed.rows.find((r) => r.id === 136)?.heatDateTag).toBe("10/22");
    expect(mixed.rows.find((r) => r.id === 119)?.heatDateTag).toBeNull();

    expect(mixed.sunDateNote).toBe(
      `10월 22일까지의 값이에요 ${OBSERVED_DATE_COPY.mixedSuffix}`,
    );
    expect(mixed.rows.find((r) => r.id === 101)?.sunDateTag).toBeNull();
    expect(mixed.rows.find((r) => r.id === 136)?.sunDateTag).toBe("10/20");
    expect(mixed.rows.find((r) => r.id === 119)?.sunDateTag).toBeNull();
  });
});
