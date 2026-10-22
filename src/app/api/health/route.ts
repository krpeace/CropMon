import { connection } from "next/server";

import { getHealthStatus } from "@/services/health";

/** 데이터베이스 연결 상태. 성공 200, 실패 503. 키와 주소는 응답에 넣지 않는다. */
export async function GET() {
  // 요청이 올 때마다 새로 확인한다 (빌드 때 미리 만들지 않음).
  await connection();
  const status = await getHealthStatus();
  return Response.json(status, {
    status: status.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
