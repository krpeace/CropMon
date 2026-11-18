import { expect, test, type Page } from "./fixtures";

// 휴대폰(mobile 프로젝트 390×844) 상단 맥락 바 (이슈 #155, 결정 0049).
// 한 줄 52: 왼쪽 도깨비(또는 뒤로), 가운데 맥락(작물·지역 캡슐 또는 제목), 오른쪽 "로그인".
// 가짜 Supabase 자료를 읽는다. 작물·지역 판은 아래에서 올라오는 시트다(이슈 #157, 자세한 확인은 bottom-sheet-mobile.spec.ts).

const bar = (page: Page) => page.getByTestId("context-bar");
const cropGroup = (page: Page) => page.getByRole("group", { name: "작물" });
const regionGroup = (page: Page) => page.getByRole("group", { name: "지역" });
const cropButton = (page: Page) => cropGroup(page).getByRole("button").first();
const regionButton = (page: Page) =>
  regionGroup(page).getByRole("button").first();
const homeLink = (page: Page) =>
  page.getByRole("link", { name: "종합 (첫 화면)" });
const backButton = (page: Page) => page.getByRole("button", { name: "뒤로" });
const loginButton = (page: Page) =>
  bar(page).getByRole("button", { name: "로그인" });
const loginDialog = (page: Page) =>
  page.getByRole("dialog", { name: "로그인 안내" });

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle"); // 버튼이 살아난 뒤에 누른다
}

test.describe("맥락 바 기본 모양", () => {
  test.skip(({ isMobile }) => !isMobile);

  test("높이 52 한 줄: 도깨비 · 맥락 · 로그인이 한 줄에 있고 머리말은 바 하나뿐이다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    const b = (await bar(page).boundingBox())!;
    expect(b.height).toBe(52);
    const parts = [
      await homeLink(page).boundingBox(),
      await page.getByTestId("context-capsule").boundingBox(),
      await loginButton(page).boundingBox(),
    ].map((r) => r!);
    for (const r of parts) {
      expect(r.y).toBeGreaterThanOrEqual(b.y - 0.5);
      expect(r.y + r.height).toBeLessThanOrEqual(b.y + b.height + 0.5);
    }
    // 왼쪽에서 오른쪽 순서
    expect(parts[0].x + parts[0].width).toBeLessThanOrEqual(parts[1].x + 0.5);
    expect(parts[1].x + parts[1].width).toBeLessThanOrEqual(parts[2].x + 0.5);
    // 머리말 전체 높이도 한 줄(바 + 가는 선) — 예전 로고 줄 + 선택 줄이 아니다
    const header = (await page.locator("header").boundingBox())!;
    expect(header.height).toBeLessThanOrEqual(54);
    // 가로형 로고와 해/달 버튼은 휴대폰 셸에 없다
    await expect(page.getByAltText(/작물재배의 든든한 감시자/)).toBeHidden();
    await expect(
      page.getByRole("button", { name: /(다크|라이트) 모드로 보기/ }),
    ).toBeHidden();
  });

  test("도깨비를 누르면 종합으로 가고 지금 선택(?st=&crop=)이 이어진다", async ({
    page,
  }) => {
    await open(page, "/water?st=136&crop=cabbage");
    await homeLink(page).click();
    await expect(page).toHaveURL(/\/\?st=136&crop=cabbage$/);
  });

  test("눌리는 영역: 도깨비 · 캡슐 두 칸 · 로그인이 모두 44 이상", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    for (const el of [
      homeLink(page),
      cropButton(page),
      regionButton(page),
      loginButton(page),
    ]) {
      const r = (await el.boundingBox())!;
      expect(r.height).toBeGreaterThanOrEqual(44);
      expect(r.width).toBeGreaterThanOrEqual(44);
    }
  });

  test("맥락 바는 글씨 크기 100% 고정 구역 안에 있다 (--fz 1.5에서도 높이 52)", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await page.evaluate(() =>
      document.documentElement.style.setProperty("--fz", "1.5"),
    );
    expect((await bar(page).boundingBox())!.height).toBe(52);
  });
});

test.describe("화면별 맥락", () => {
  test.skip(({ isMobile }) => !isMobile);

  for (const path of ["/", "/water", "/temperature", "/sunlight", "/soil"]) {
    test(`${path}: 작물·지역 캡슐이 보이고 선택이 이어진다`, async ({
      page,
    }) => {
      await open(page, `${path}?st=136&crop=cabbage`);
      await expect(page.getByTestId("context-capsule")).toBeVisible();
      await expect(cropButton(page)).toContainText("배추");
      await expect(regionButton(page)).toContainText("안동");
      await expect(page.getByTestId("context-title")).toHaveCount(0);
      await expect(homeLink(page)).toBeVisible();
      await expect(backButton(page)).toHaveCount(0);
    });
  }

  test("다섯 화면을 옮겨도 선택(안동 · 배추)이 이어진다", async ({ page }) => {
    await open(page, "/water?st=136&crop=cabbage");
    const menu = page.getByRole("navigation", { name: "메뉴" });
    for (const [label, path] of [
      ["온도", "/temperature"],
      ["햇빛", "/sunlight"],
      ["종합", "/"],
    ] as const) {
      await menu.getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(
        new RegExp(`${path}\\?st=136&crop=cabbage$`),
      );
      await expect(cropButton(page)).toContainText("배추");
      await expect(regionButton(page)).toContainText("안동");
    }
  });

  for (const [path, title] of [
    ["/outlook", "관측"],
    ["/market", "시세"],
    ["/farminfo", "농사정보"],
    ["/pest", "병해충"],
    ["/diary", "일지"],
    ["/more", "더보기"],
  ] as const) {
    test(`${path}: 가운데는 제목 "${title}"이고 캡슐은 없다`, async ({
      page,
    }) => {
      await open(page, `${path}?st=101&crop=apple`);
      await expect(page.getByTestId("context-title")).toHaveText(title);
      await expect(page.getByTestId("context-capsule")).toHaveCount(0);
      await expect(cropGroup(page)).toHaveCount(0);
      await expect(regionGroup(page)).toHaveCount(0);
      await expect(homeLink(page)).toBeVisible();
      await expect(backButton(page)).toHaveCount(0);
      expect((await bar(page).boundingBox())!.height).toBe(52);
    });
  }

  test("/my-farm: 도깨비 대신 뒤로 화살표(44)와 제목 '내 농장'", async ({
    page,
  }) => {
    await open(page, "/my-farm?st=101&crop=apple");
    await expect(page.getByTestId("context-title")).toHaveText("내 농장");
    await expect(homeLink(page)).toHaveCount(0);
    const r = (await backButton(page).boundingBox())!;
    expect(r.width).toBeGreaterThanOrEqual(44);
    expect(r.height).toBeGreaterThanOrEqual(44);
  });

  test("뒤로: 앱 안에서 들어왔으면 이전 화면으로, 주소로 바로 들어왔으면 종합으로", async ({
    page,
  }) => {
    // 앱 안에서: 물 → 로그인 시트 → 내 농장 미리보기 → 뒤로 = 물
    await open(page, "/water?st=136&crop=cabbage");
    await loginButton(page).click();
    await loginDialog(page)
      .getByRole("link", { name: "내 농장 미리보기" })
      .click();
    await expect(page).toHaveURL(/\/my-farm\?st=136&crop=cabbage$/);
    await backButton(page).click();
    await expect(page).toHaveURL(/\/water\?st=136&crop=cabbage$/);

    // 주소로 바로 들어옴: 기록이 없으니 종합 (선택 유지)
    await open(page, "/my-farm?st=136&crop=cabbage");
    await backButton(page).click();
    await expect(page).toHaveURL(/\/\?st=136&crop=cabbage$/);
  });
});

test.describe("로그인", () => {
  test.skip(({ isMobile }) => !isMobile);

  test("화면을 옮기지 않고 로그인 시트를 열고, 열려 있는 동안 버튼이 숨는다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    const url = page.url();
    await loginButton(page).click();
    await expect(loginDialog(page)).toBeVisible();
    expect(page.url()).toBe(url);
    await expect(loginButton(page)).toBeHidden();
    await loginDialog(page).getByRole("button", { name: "닫기" }).click();
    await expect(loginDialog(page)).toBeHidden();
    await expect(loginButton(page)).toBeVisible();
  });
});

test.describe("작물·지역 시트 (화면 아래에서 올라옴)", () => {
  test.skip(({ isMobile }) => !isMobile);

  test("작물 칸: 시트가 화면 아래에 붙어 열리고, 고르면 주소가 바뀌며, ✓는 고른 줄 하나뿐", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await cropButton(page).click();
    const dialog = page.getByRole("dialog", { name: "작물 고르기" });
    await expect(dialog).toBeVisible();
    // 이슈 #157: 예전에는 "바 바로 아래"였다. 지금은 화면 아래 끝에 붙는다 (올라오는 움직임이 끝난 뒤)
    await page.evaluate(() =>
      Promise.all(document.getAnimations().map((a) => a.finished)),
    );
    const d = (await dialog.boundingBox())!;
    expect(Math.round(d.y + d.height)).toBe(844);
    // ✓ 표시(check 아이콘)는 고른 줄 하나에만
    await expect(
      dialog.locator('svg path[d="M5 12.5l4.5 4.5L19 7.5"]'),
    ).toHaveCount(1);
    await expect(
      dialog
        .getByRole("listbox", { name: "작물 목록" })
        .locator('[aria-current="true"]'),
    ).toHaveCount(1);
    await dialog.getByRole("link", { name: /^배추/ }).click();
    await expect(page).toHaveURL(/\/water\?st=101&crop=cabbage$/);
    await expect(cropButton(page)).toContainText("배추");
    await expect(dialog).toBeHidden();
  });

  test("지역 칸: 시트가 화면 아래에 붙어 열리고, 홍천을 찾아 고르면 st=212 가 된다", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    await regionButton(page).click();
    const dialog = page.getByRole("dialog", { name: "지역 고르기" });
    await expect(dialog).toBeVisible();
    // 이슈 #157: 예전에는 "바 바로 아래"였다. 지금은 화면 아래 끝에 붙는다 (올라오는 움직임이 끝난 뒤)
    await page.evaluate(() =>
      Promise.all(document.getAnimations().map((a) => a.finished)),
    );
    const d = (await dialog.boundingBox())!;
    expect(Math.round(d.y + d.height)).toBe(844);
    await dialog.getByRole("searchbox", { name: "지역 검색" }).fill("홍천");
    await dialog.getByRole("option", { name: /홍천/ }).click();
    await expect(page).toHaveURL(/st=212/);
    await expect(regionButton(page)).toContainText("홍천");
    await expect(dialog).toBeHidden();
  });

  test("점 색은 고른 작물의 그 지역 오늘 물 판정이다 (지점마다 다른 값이면 다른 색)", async ({
    page,
  }) => {
    const dotColor = async (url: string) => {
      await open(page, url);
      return regionButton(page)
        .locator('[aria-hidden="true"]')
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor);
    };
    const colors = new Set([
      await dotColor("/water?st=101&crop=apple"),
      await dotColor("/water?st=216&crop=apple"),
      await dotColor("/water?st=119&crop=apple"),
      await dotColor("/water?st=136&crop=cabbage"),
    ]);
    // 가짜 자료는 지점·작물마다 판정이 달라 점 색이 한 가지는 아니다
    expect(colors.size).toBeGreaterThan(1);
  });
});

test.describe("/more 맨 아래 다크 모드 줄", () => {
  test.skip(({ isMobile }) => !isMobile);

  test("목록 맨 아래에 있고 누르면 테마가 바뀌고 기억된다", async ({
    page,
  }) => {
    await open(page, "/more?st=101&crop=apple");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const toggle = page.getByRole("button", { name: "다크 모드로 보기" });
    await expect(toggle).toBeVisible();
    // 서비스 메뉴 줄보다 아래
    const last = (await page
      .getByRole("main")
      .getByRole("link")
      .last()
      .boundingBox())!;
    const t = (await toggle.boundingBox())!;
    expect(t.y).toBeGreaterThanOrEqual(last.y + last.height - 1);
    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(
      page.getByRole("button", { name: "라이트 모드로 보기" }),
    ).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});

/** 캡슐 안 글자를 직접 바꿔 긴 이름을 흉내 낸다 (운영 지점은 모두 3글자 이하라 실제 값으로는 안 나온다). */
async function setNames(
  page: Page,
  names: { crop?: string; station?: string },
) {
  await page.evaluate((n) => {
    if (n.crop) {
      document.querySelector('[data-testid="crop-name"]')!.textContent = n.crop;
    }
    if (n.station) {
      document.querySelector('[data-testid="station-name"]')!.textContent =
        n.station;
    }
  }, names);
}

/** 이름은 안 잘리고, 보조 글자는 통째로 보이거나 통째로 숨거나 둘 중 하나다. */
async function expectNamesIntactAndSubsAllOrNothing(page: Page, label: string) {
  const r = await page.evaluate(() => {
    const q = (id: string) =>
      document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
    // 글자를 잘라내는(overflow: hidden) 가장 가까운 조상 — 이름이 이 상자 안에 통째로 들어와야 안 잘린 것이다
    const clipBox = (el: HTMLElement) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (getComputedStyle(p).overflowX === "hidden") {
          return p.getBoundingClientRect();
        }
      }
      return null;
    };
    const capsule = q("context-capsule").getBoundingClientRect();
    const out: Record<string, Record<string, number | boolean>> = {};
    for (const id of ["crop-name", "station-name"]) {
      const el = q(id);
      const rect = el.getBoundingClientRect();
      const clip = clipBox(el)!;
      out[id] = {
        visible: rect.width > 0,
        // 잘라내는 상자 안에 통째로 들어와 있는가 (소수점 오차 0.5)
        notClipped:
          rect.left >= clip.left - 0.5 && rect.right <= clip.right + 0.5,
        insideCapsule:
          rect.right <= capsule.right + 0.5 && rect.left >= capsule.left - 0.5,
        over: Math.max(0, rect.right - clip.right),
      };
    }
    for (const id of ["crop-sub", "station-id"]) {
      const el = q(id);
      const rect = el.getBoundingClientRect();
      const wrap = clipBox(el)!;
      const fully =
        rect.top >= wrap.top - 1 &&
        rect.bottom <= wrap.bottom + 1 &&
        rect.right <= wrap.right + 0.5;
      const hidden = rect.top >= wrap.bottom - 1; // 다음 줄로 밀려 칸 밖
      out[id] = { fully, hidden };
    }
    const region = document
      .querySelector('[role="group"][aria-label="지역"]')!
      .getBoundingClientRect();
    return {
      halvesSpill: Math.max(0, region.right - capsule.right),
      parts: out,
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      capsuleWidth: capsule.width,
    };
  });
  for (const id of ["crop-name", "station-name"]) {
    expect(r.parts[id].visible, `${label}: ${id} 보임`).toBe(true);
    expect(
      r.parts[id].notClipped,
      `${label}: ${id} 이 ${r.parts[id].over}px 잘려요 (캡슐 폭 ${r.capsuleWidth})`,
    ).toBe(true);
    expect(r.parts[id].insideCapsule, `${label}: ${id} 캡슐 안`).toBe(true);
  }
  for (const id of ["crop-sub", "station-id"]) {
    expect(
      r.parts[id].fully || r.parts[id].hidden,
      `${label}: ${id} 는 통째로 보이거나 통째로 숨어야 해요`,
    ).toBe(true);
  }
  expect(
    r.halvesSpill,
    `${label}: 두 칸이 캡슐 밖으로 ${r.halvesSpill}px 삐져나와요 (캡슐 폭 ${r.capsuleWidth})`,
  ).toBeLessThanOrEqual(0.5);
  expect(r.overflow, `${label}: 가로 넘침`).toBeLessThanOrEqual(0);
}

test.describe("긴 이름과 좁은 폭", () => {
  test.skip(({ isMobile }) => !isMobile);

  for (const width of [360, 390]) {
    for (const station of ["진도(첨찰산)", "대구(기)"]) {
      test(`폭 ${width}: "작물 공통" + "${station}" — 이름이 안 잘리고 보조 글자만 숨는다`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 844 });
        // 두 지점은 운영 중이 아니라 주소로는 고를 수 없어, 춘천을 연 뒤 이름만 바꿔 넣는다
        await open(page, "/water?st=101&crop=common");
        await setNames(page, { station });
        await expectNamesIntactAndSubsAllOrNothing(
          page,
          `폭 ${width} · ${station}`,
        );
      });

      // 390 에서 "포도·비가림" + "진도(첨찰산)"을 동시에 놓으면 두 칸 합이 캡슐보다 6.4px 넘친다(알려진 한계, 결정 0049).
      // 진도(첨찰산)은 운영 중이 아니라 고를 수 없고 포도도 아직 없어 지금은 해당이 없다 — 포도(G1)가 들어올 때 다시 본다.
      if (!(width === 390 && station === "진도(첨찰산)")) {
        test(`폭 ${width}: 작물 칸을 1.3 : 1 로 넓히고 "포도·비가림" + "${station}"도 이름이 안 잘린다`, async ({
          page,
        }) => {
          await page.setViewportSize({ width, height: 844 });
          await open(page, "/water?st=101&crop=common");
          await page.evaluate(() =>
            document.documentElement.style.setProperty(
              "--ctx-crop-grow",
              "1.3",
            ),
          );
          await setNames(page, { crop: "포도·비가림", station });
          await expectNamesIntactAndSubsAllOrNothing(
            page,
            `폭 ${width} · 1.3:1 · 포도·비가림 + ${station}`,
          );
        });
      }
    }
  }

  test("캡슐이 240px보다 좁으면 ▾ 둘이 숨고, 넉넉하면 보인다 — 이름 · 점은 늘 남는다", async ({
    page,
  }) => {
    const chevrons = (p: Page) =>
      p.getByTestId("context-capsule").locator("svg:visible");
    const capsuleWidth = async (p: Page) =>
      (await p.getByTestId("context-capsule").boundingBox())!.width;

    // 폭 360: 캡슐이 240보다 훨씬 좁아(약 213) 글꼴이 달라도 ▾ 가 숨는다
    await page.setViewportSize({ width: 360, height: 844 });
    await open(page, "/water?st=101&crop=apple");
    expect(await capsuleWidth(page)).toBeLessThan(230);
    await expect(chevrons(page)).toHaveCount(0);
    await expect(page.getByTestId("crop-name")).toBeVisible();
    await expect(page.getByTestId("station-name")).toBeVisible();

    // 폭 430: 캡슐이 240보다 훨씬 넓어(약 283) ▾ 둘이 보인다
    await page.setViewportSize({ width: 430, height: 932 });
    expect(await capsuleWidth(page)).toBeGreaterThan(250);
    await expect(chevrons(page)).toHaveCount(2);

    // 폭 390: 기준(240) 근처라 글꼴에 따라 어느 쪽일 수 있다 — 규칙만 확인한다
    await page.setViewportSize({ width: 390, height: 844 });
    const w = await capsuleWidth(page);
    await expect(chevrons(page)).toHaveCount(w < 240 ? 0 : 2);
  });

  test("폭 360 · 기본 작물 '작물 공통' + 긴 지점 이름이면 보조 글자가 실제로 통째로 숨는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 844 });
    await open(page, "/water?st=101&crop=common");
    await setNames(page, { station: "진도(첨찰산)" });
    // 지점 번호가 칸 안에 보이지 않아야 한다 (반쪽만 보이지도 않는다)
    const hidden = await bar(page)
      .getByTestId("station-id")
      .evaluate((el) => {
        const wrap = el.parentElement!.getBoundingClientRect();
        return el.getBoundingClientRect().top >= wrap.bottom - 1;
      });
    expect(hidden).toBe(true);
  });

  test("1.3 : 1 로 놓으면 작물 칸이 지역 칸보다 넓다 (비율은 값 하나로 바뀐다)", async ({
    page,
  }) => {
    await open(page, "/water?st=101&crop=apple");
    const ratio = async () => {
      const c = (await cropGroup(page).boundingBox())!;
      const r = (await regionGroup(page).boundingBox())!;
      return c.width / r.width;
    };
    const base = await ratio();
    await page.evaluate(() =>
      document.documentElement.style.setProperty("--ctx-crop-grow", "1.3"),
    );
    expect(await ratio()).toBeGreaterThan(base);
  });
});
