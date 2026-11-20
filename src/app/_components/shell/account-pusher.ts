import { mergeUpdate, type SettingsUpdate } from "@/domain/account-settings";

/** 바꾼 뒤 이 시간(ms) 동안 더 바뀌지 않으면 모아서 한 번에 보낸다. */
export const PUSH_DELAY_MS = 400;

/**
 * 계정에 쓸 바뀐 칸을 **모아서 마지막 값만** 보내는 장치 (이슈 #193, 결정 0066). 시간 · 보내기 · 회원 여부를 밖에서 받아서
 * 순수하게 시험한다(`account-settings-store.ts` 가 진짜 `fetch` · `cm_m` 을 끼운다).
 * - `push`: 회원이 아니면(`enabled()` false) 모아 두지도 않는다(요청 0). 400ms 안에 또 바뀌면 시계를 다시 건다.
 * - `flush`: 기다리지 않고 바로 보낸다(`pagehide` · 탭을 닫는 중). 보낼 것이 없으면 아무것도 안 한다.
 * - `send` 가 던져도 화면은 계속된다(조용히).
 */
export function createAccountPusher(deps: {
  send: (update: SettingsUpdate) => void;
  enabled: () => boolean;
}) {
  let pending: SettingsUpdate = {};
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (Object.keys(pending).length === 0) return;
    const out = pending;
    pending = {};
    try {
      deps.send(out);
    } catch {
      // 네트워크 · 저장 실패는 화면을 막지 않는다(기기 값으로 계속)
    }
  }

  function push(update: SettingsUpdate) {
    if (!deps.enabled()) return;
    pending = mergeUpdate(pending, update);
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, PUSH_DELAY_MS);
  }

  return { push, flush };
}
