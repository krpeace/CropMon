import { getSupabaseClient } from "@/infra/supabase/client";

export type HealthResult = { ok: boolean; message: string; checkedAt: string };

/** 연결 확인에 필요한 만큼만 적은 클라이언트 모양. 테스트에서는 가짜를 넣는다. */
export type HealthClient = {
  from(table: "app_health"): {
    select(columns: "note"): {
      eq(
        column: "id",
        value: number,
      ): {
        maybeSingle(): PromiseLike<{
          data: { note: string } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

/**
 * app_health 의 확인용 행(id 1)을 읽어 연결 상태를 돌려준다. 오류를 던지지 않는다.
 * 원문 오류는 서버 기록에만 남기고, 돌려주는 문구에는 넣지 않는다.
 */
export async function checkSupabaseConnection(
  client: HealthClient,
  now: () => Date = () => new Date(),
): Promise<HealthResult> {
  const result = (ok: boolean, message: string): HealthResult => ({
    ok,
    message,
    checkedAt: now().toISOString(),
  });

  try {
    const { data, error } = await client
      .from("app_health")
      .select("note")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      console.error("[health] DB 오류 응답:", error.message);
      return result(
        false,
        "데이터베이스가 오류를 돌려주었습니다. 주소가 맞는지, 표가 만들어졌는지, 읽기 권한이 있는지 확인해 주세요.",
      );
    }
    if (!data) {
      return result(
        false,
        "연결은 되었지만 확인용 자료가 없습니다. supabase/migrations 의 SQL 을 실행했는지 확인해 주세요.",
      );
    }
    return result(true, "정상적으로 연결되었습니다.");
  } catch (error) {
    console.error("[health] 연결 실패:", error);
    return result(
      false,
      "데이터베이스에 연결하지 못했습니다. 주소와 네트워크를 확인해 주세요.",
    );
  }
}

// 실제 Supabase 클라이언트 타입은 너무 깊어 TypeScript 가 HealthClient 와 비교하지 못한다.
// 필요한 메서드(from → select → eq → maybeSingle)는 그대로 있으므로 여기서만 형을 바꾼다.
const createSupabaseHealthClient = () =>
  getSupabaseClient() as unknown as HealthClient;

/** 클라이언트를 만들고 연결을 확인한다. 연결 정보가 비어 있어도 던지지 않는다. */
export async function getHealthStatus(
  createClient: () => HealthClient = createSupabaseHealthClient,
  now: () => Date = () => new Date(),
): Promise<HealthResult> {
  let client: HealthClient;
  try {
    client = createClient();
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      checkedAt: now().toISOString(),
    };
  }
  return checkSupabaseConnection(client, now);
}
