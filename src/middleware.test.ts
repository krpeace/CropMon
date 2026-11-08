import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { middleware } from "./middleware";

describe("middleware — 폐지·휴지 지점 주소 이동 (결정 0037)", () => {
  it("폐지 지점(st=116 관악산)으로 들어오면 기본 지점(st=101)과 from=116 으로 이동한다", () => {
    const req = new NextRequest(
      "http://localhost:3000/temperature?st=116&crop=apple",
    );
    const res = middleware(req);
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/temperature");
    expect(location.searchParams.get("st")).toBe("101");
    expect(location.searchParams.get("from")).toBe("116");
    expect(location.searchParams.get("crop")).toBe("apple");
  });

  it("폐지 지점(st=175 진도 첨찰산)으로 들어오면 101과 from=175 로 이동한다", () => {
    const req = new NextRequest("http://localhost:3000/water?st=175");
    const res = middleware(req);
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/water");
    expect(location.searchParams.get("st")).toBe("101");
    expect(location.searchParams.get("from")).toBe("175");
  });

  it("운영 중인 지점(st=101 춘천, st=108 서울)은 이동 없이 통과한다", () => {
    for (const st of ["101", "108"]) {
      const req = new NextRequest(`http://localhost:3000/temperature?st=${st}`);
      const res = middleware(req);
      expect(res.headers.get("location")).toBeNull();
    }
  });

  it("사전에 없는 번호(st=999)는 이동 없이 그대로 통과한다 (기존 처리 유지)", () => {
    const req = new NextRequest("http://localhost:3000/temperature?st=999");
    const res = middleware(req);
    expect(res.headers.get("location")).toBeNull();
  });

  it("숫자가 아닌 값(st=abc)도 이동 없이 통과한다", () => {
    const req = new NextRequest("http://localhost:3000/?st=abc");
    const res = middleware(req);
    expect(res.headers.get("location")).toBeNull();
  });
});
