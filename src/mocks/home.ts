import type { Crop } from "@/domain/selection";
import type { WaterStatus } from "@/domain/water-status";

/**
 * 예시 값. 시안(design/prototype) 기준일 2026년 8월 12일 종합 화면에 나온 값을 옮겨 적었다.
 * 지점 10곳 × 작물 2종. 흙은 양토 기준. 나중에 Supabase 조회로 바뀐다.
 */
export type MockWater = {
  /** 오늘 물 판정. */
  status: WaterStatus;
  /** 내일부터 3일 판정 (17시 단기예보 기준). */
  forecast: { date: string; status: WaterStatus }[];
  /** 부족한 물 Dr. 작기가 아니면 null. */
  drMm: number | null;
  /** 관수 시작점 RAW. */
  rawMm: number;
  /** 뿌리층 전체 TAW. */
  tawMm: number;
  /** 판정 문구와 카드 색. */
  verdict: { text: string; tone: WaterStatus };
  /** 휴면기·작기 아님 안내. 없으면 null. */
  note: string | null;
};

export type MockHome = {
  stationId: number;
  /** 평년보다 생육이 며칠 빠른가 (음수면 늦음). */
  leadDays: number;
  /** 적산온도 GDD (℃·일), 1월 1일부터. */
  gdd: { thisYear: number; normal: number };
  /** 적산일사 (MJ/m²). 일사를 재지 않는 지점은 null. */
  sunlight: {
    percentOfNormal: number;
    thisYear: number;
    normal: number;
  } | null;
  water: Record<Crop, MockWater>;
};

export const MOCK_HOME: readonly MockHome[] = [
  {
    stationId: 101,
    leadDays: 3,
    gdd: {
      thisYear: 1972,
      normal: 1910,
    },
    sunlight: {
      percentOfNormal: 96,
      thisYear: 3218,
      normal: 3352,
    },
    water: {
      apple: {
        status: "caution",
        forecast: [
          {
            date: "2026-08-13",
            status: "need",
          },
          {
            date: "2026-08-14",
            status: "caution",
          },
          {
            date: "2026-08-15",
            status: "caution",
          },
        ],
        drMm: 31,
        rawMm: 35.1,
        tawMm: 78,
        verdict: {
          text: "오늘은 괜찮아요, 내일 물 주세요",
          tone: "need",
        },
        note: null,
      },
      cabbage: {
        status: "caution",
        forecast: [
          {
            date: "2026-08-13",
            status: "need",
          },
          {
            date: "2026-08-14",
            status: "caution",
          },
          {
            date: "2026-08-15",
            status: "caution",
          },
        ],
        drMm: 22.8,
        rawMm: 23.4,
        tawMm: 52,
        verdict: {
          text: "오늘은 괜찮아요, 내일 물 주세요",
          tone: "need",
        },
        note: null,
      },
    },
  },
  {
    stationId: 216,
    leadDays: -2,
    gdd: {
      thisYear: 1448,
      normal: 1482,
    },
    sunlight: null,
    water: {
      apple: {
        status: "normal",
        forecast: [
          {
            date: "2026-08-13",
            status: "caution",
          },
          {
            date: "2026-08-14",
            status: "caution",
          },
          {
            date: "2026-08-15",
            status: "caution",
          },
        ],
        drMm: 9,
        rawMm: 35.1,
        tawMm: 78,
        verdict: {
          text: "흙이 촉촉해요, 물 주지 않아도 돼요",
          tone: "normal",
        },
        note: null,
      },
      cabbage: {
        status: "normal",
        forecast: [
          {
            date: "2026-08-13",
            status: "caution",
          },
          {
            date: "2026-08-14",
            status: "caution",
          },
          {
            date: "2026-08-15",
            status: "caution",
          },
        ],
        drMm: 6.6,
        rawMm: 23.4,
        tawMm: 52,
        verdict: {
          text: "흙이 촉촉해요, 물 주지 않아도 돼요",
          tone: "normal",
        },
        note: null,
      },
    },
  },
  {
    stationId: 119,
    leadDays: 4,
    gdd: {
      thisYear: 2120,
      normal: 2035,
    },
    sunlight: {
      percentOfNormal: 98,
      thisYear: 3351,
      normal: 3419,
    },
    water: {
      apple: {
        status: "need",
        forecast: [
          {
            date: "2026-08-13",
            status: "need",
          },
          {
            date: "2026-08-14",
            status: "caution",
          },
          {
            date: "2026-08-15",
            status: "caution",
          },
        ],
        drMm: 41,
        rawMm: 35.1,
        tawMm: 78,
        verdict: {
          text: "오늘 물 주세요",
          tone: "need",
        },
        note: null,
      },
      cabbage: {
        status: "need",
        forecast: [
          {
            date: "2026-08-13",
            status: "caution",
          },
          {
            date: "2026-08-14",
            status: "caution",
          },
          {
            date: "2026-08-15",
            status: "normal",
          },
        ],
        drMm: 24.2,
        rawMm: 23.4,
        tawMm: 52,
        verdict: {
          text: "오늘 물 주세요",
          tone: "need",
        },
        note: null,
      },
    },
  },
  {
    stationId: 131,
    leadDays: 5,
    gdd: {
      thisYear: 2213,
      normal: 2104,
    },
    sunlight: {
      percentOfNormal: 101,
      thisYear: 3487,
      normal: 3453,
    },
    water: {
      apple: {
        status: "need",
        forecast: [
          {
            date: "2026-08-13",
            status: "caution",
          },
          {
            date: "2026-08-14",
            status: "caution",
          },
          {
            date: "2026-08-15",
            status: "caution",
          },
        ],
        drMm: 38,
        rawMm: 35.1,
        tawMm: 78,
        verdict: {
          text: "오늘 물 주세요",
          tone: "need",
        },
        note: null,
      },
      cabbage: {
        status: "caution",
        forecast: [
          {
            date: "2026-08-13",
            status: "caution",
          },
          {
            date: "2026-08-14",
            status: "caution",
          },
          {
            date: "2026-08-15",
            status: "normal",
          },
        ],
        drMm: 22.8,
        rawMm: 23.4,
        tawMm: 52,
        verdict: {
          text: "아직 여유 있어요, 3일 동안 괜찮아요",
          tone: "caution",
        },
        note: null,
      },
    },
  },
  {
    stationId: 129,
    leadDays: 2,
    gdd: {
      thisYear: 1966,
      normal: 1925,
    },
    sunlight: {
      percentOfNormal: 97,
      thisYear: 3251,
      normal: 3352,
    },
    water: {
      apple: {
        status: "caution",
        forecast: [
          {
            date: "2026-08-13",
            status: "caution",
          },
          {
            date: "2026-08-14",
            status: "caution",
          },
          {
            date: "2026-08-15",
            status: "caution",
          },
        ],
        drMm: 22,
        rawMm: 35.1,
        tawMm: 78,
        verdict: {
          text: "아직 여유 있어요, 3일 동안 괜찮아요",
          tone: "caution",
        },
        note: null,
      },
      cabbage: {
        status: "caution",
        forecast: [
          {
            date: "2026-08-13",
            status: "caution",
          },
          {
            date: "2026-08-14",
            status: "caution",
          },
          {
            date: "2026-08-15",
            status: "caution",
          },
        ],
        drMm: 16.2,
        rawMm: 23.4,
        tawMm: 52,
        verdict: {
          text: "아직 여유 있어요, 3일 동안 괜찮아요",
          tone: "caution",
        },
        note: null,
      },
    },
  },
  {
    stationId: 146,
    leadDays: 4,
    gdd: {
      thisYear: 2245,
      normal: 2158,
    },
    sunlight: {
      percentOfNormal: 99,
      thisYear: 3385,
      normal: 3419,
    },
    water: {
      apple: {
        status: "wet",
        forecast: [
          {
            date: "2026-08-13",
            status: "wet",
          },
          {
            date: "2026-08-14",
            status: "normal",
          },
          {
            date: "2026-08-15",
            status: "normal",
          },
        ],
        drMm: 0,
        rawMm: 35.1,
        tawMm: 78,
        verdict: {
          text: "물 주지 마세요, 땅이 너무 젖었어요",
          tone: "wet",
        },
        note: null,
      },
      cabbage: {
        status: "wet",
        forecast: [
          {
            date: "2026-08-13",
            status: "wet",
          },
          {
            date: "2026-08-14",
            status: "normal",
          },
          {
            date: "2026-08-15",
            status: "normal",
          },
        ],
        drMm: 0,
        rawMm: 23.4,
        tawMm: 52,
        verdict: {
          text: "물 주지 마세요, 땅이 너무 젖었어요",
          tone: "wet",
        },
        note: null,
      },
    },
  },
  {
    stationId: 156,
    leadDays: 6,
    gdd: {
      thisYear: 2296,
      normal: 2168,
    },
    sunlight: {
      percentOfNormal: 103,
      thisYear: 3556,
      normal: 3453,
    },
    water: {
      apple: {
        status: "caution",
        forecast: [
          {
            date: "2026-08-13",
            status: "caution",
          },
          {
            date: "2026-08-14",
            status: "caution",
          },
          {
            date: "2026-08-15",
            status: "caution",
          },
        ],
        drMm: 27,
        rawMm: 35.1,
        tawMm: 78,
        verdict: {
          text: "아직 여유 있어요, 3일 동안 괜찮아요",
          tone: "caution",
        },
        note: null,
      },
      cabbage: {
        status: "caution",
        forecast: [
          {
            date: "2026-08-13",
            status: "caution",
          },
          {
            date: "2026-08-14",
            status: "caution",
          },
          {
            date: "2026-08-15",
            status: "caution",
          },
        ],
        drMm: 19.9,
        rawMm: 23.4,
        tawMm: 52,
        verdict: {
          text: "아직 여유 있어요, 3일 동안 괜찮아요",
          tone: "caution",
        },
        note: null,
      },
    },
  },
  {
    stationId: 136,
    leadDays: 5,
    gdd: {
      thisYear: 2140,
      normal: 2033,
    },
    sunlight: {
      percentOfNormal: 104,
      thisYear: 3660,
      normal: 3520,
    },
    water: {
      apple: {
        status: "need",
        forecast: [
          {
            date: "2026-08-13",
            status: "need",
          },
          {
            date: "2026-08-14",
            status: "caution",
          },
          {
            date: "2026-08-15",
            status: "caution",
          },
        ],
        drMm: 44,
        rawMm: 35.1,
        tawMm: 78,
        verdict: {
          text: "오늘 물 주세요",
          tone: "need",
        },
        note: null,
      },
      cabbage: {
        status: "need",
        forecast: [
          {
            date: "2026-08-13",
            status: "caution",
          },
          {
            date: "2026-08-14",
            status: "normal",
          },
          {
            date: "2026-08-15",
            status: "caution",
          },
        ],
        drMm: 23.8,
        rawMm: 23.4,
        tawMm: 52,
        verdict: {
          text: "오늘 물 주세요",
          tone: "need",
        },
        note: null,
      },
    },
  },
  {
    stationId: 192,
    leadDays: 4,
    gdd: {
      thisYear: 2134,
      normal: 2052,
    },
    sunlight: {
      percentOfNormal: 100,
      thisYear: 3352,
      normal: 3352,
    },
    water: {
      apple: {
        status: "caution",
        forecast: [
          {
            date: "2026-08-13",
            status: "caution",
          },
          {
            date: "2026-08-14",
            status: "caution",
          },
          {
            date: "2026-08-15",
            status: "caution",
          },
        ],
        drMm: 18,
        rawMm: 35.1,
        tawMm: 78,
        verdict: {
          text: "아직 여유 있어요, 3일 동안 괜찮아요",
          tone: "caution",
        },
        note: null,
      },
      cabbage: {
        status: "caution",
        forecast: [
          {
            date: "2026-08-13",
            status: "normal",
          },
          {
            date: "2026-08-14",
            status: "caution",
          },
          {
            date: "2026-08-15",
            status: "caution",
          },
        ],
        drMm: 13.3,
        rawMm: 23.4,
        tawMm: 52,
        verdict: {
          text: "아직 여유 있어요, 3일 동안 괜찮아요",
          tone: "caution",
        },
        note: null,
      },
    },
  },
  {
    stationId: 189,
    leadDays: 7,
    gdd: {
      thisYear: 2745,
      normal: 2598,
    },
    sunlight: {
      percentOfNormal: 94,
      thisYear: 2993,
      normal: 3184,
    },
    water: {
      apple: {
        status: "normal",
        forecast: [
          {
            date: "2026-08-13",
            status: "caution",
          },
          {
            date: "2026-08-14",
            status: "caution",
          },
          {
            date: "2026-08-15",
            status: "normal",
          },
        ],
        drMm: 7,
        rawMm: 35.1,
        tawMm: 78,
        verdict: {
          text: "흙이 촉촉해요, 물 주지 않아도 돼요",
          tone: "normal",
        },
        note: null,
      },
      cabbage: {
        status: "normal",
        forecast: [
          {
            date: "2026-08-13",
            status: "caution",
          },
          {
            date: "2026-08-14",
            status: "caution",
          },
          {
            date: "2026-08-15",
            status: "normal",
          },
        ],
        drMm: 5.2,
        rawMm: 23.4,
        tawMm: 52,
        verdict: {
          text: "흙이 촉촉해요, 물 주지 않아도 돼요",
          tone: "normal",
        },
        note: null,
      },
    },
  },
];
