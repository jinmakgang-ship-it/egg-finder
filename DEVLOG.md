# 계란 알림이 개발 로그

## 프로젝트 구조
- `index.html` — 프론트엔드 전체 (SPA)
- `Code.gs` — Google Apps Script (식단 저장 + 텔레그램 알림)
- 데이터 저장: localStorage + GAS 연결 Google Sheets (`meals` 시트)

---

## 수정 이력 및 핵심 버그 정리

### 1. GAS 텔레그램 알림 미발송 (핵심 버그)
**파일**: `Code.gs` — `getMeal()` 함수
**원인**: Google Sheets는 날짜를 Date 객체로 반환하는데, `getMeal`에서 문자열로 비교해 항상 `null` 반환 → `sendDailyNotif`가 조기 종료
**수정**:
```js
// 수정 전
if (values[i][0] === dateStr) {

// 수정 후
const raw = values[i][0];
const dateKey = raw instanceof Date ? fmtDate(raw) : String(raw).trim();
if (dateKey === dateStr) {
```

---

### 2. 텔레그램 알림 메시지 구조
**파일**: `Code.gs` — `sendDailyNotif()`
- 오늘 식단 리마인드 → 내일 알림 순서로 표시 (시간순)
- 오늘/내일 계란 없어도 "없어요" 명확히 표시
- 메시지 하단에 링크 추가: `https://jinmakgang-ship-it.github.io/egg-finder/`
- 식단 등록 시 텔레그램 알림에도 동일 링크 추가 (`index.html` — `saveMonthly()`)

---

### 3. 식단 등록 텔레그램 메시지 날짜 형식
**파일**: `index.html` — `saveMonthly()`
- `24일 (월)` → `24일(월)` (띄어쓰기 제거)

---

### 4. 모바일 사진 업로드 — 카메라 강제 실행 문제
**파일**: `index.html`
**원인**: `<input capture="environment">` 속성이 갤러리 선택 없이 카메라를 강제 실행
**수정**: `capture` 속성 제거 → 카메라/갤러리 선택 가능

---

### 5. OCR 오인식 보정
**파일**: `index.html` — `correctOcr()` / `OCR_CORRECTIONS`
자주 틀리는 글자 딕셔너리:
```js
['살계썬', '잘게썬'], ['살게썬', '잘게썬'], ['잘계썬', '잘게썬'],
['숭늄', '숭늉'], ['숭눔', '숭늉'], ['구미', '구이'], ...
```
- 테이블 파싱(`parseMonthlyTable`)과 필드 파싱(`parseMonthlyFromFields`) 두 곳에 모두 적용

---

### 6. 메뉴명 후행 점/공백 제거
**파일**: `index.html` — `cleanMenuName()`
```js
// 수정 전
.replace(/[+·°℃c\\/]/gi, '')

// 수정 후 — 후행 점·공백 추가 제거
.replace(/[+·°℃c\\/.\s]+$/g, '')
```

---

### 7. 슬롯 배정 버그 (fields 파싱) — 핵심 OCR 파싱 버그

**파일**: `index.html` — `parseMonthlyFromFields()`

#### 버그 1: 점심 항목이 오전간식으로 배정
**원인**: CLOVA fields 출력에서 `점심` 라벨(col 0)이 Y좌표상 점심 음식들(밥, 국)보다 아래에 위치 → 음식들이 라벨보다 먼저 인식되어 `오전간식`으로 배정
**수정**: Lookahead 보정 — `오전간식` 같은 thin 슬롯(1행만 차지) 이후 무라벨 행은 다음 슬롯으로 선점
```js
// 오전간식 라벨 이후 → 점심 라벨 전까지의 무라벨 행 → 점심으로 배정
if (!matched && THIN_SLOTS.includes(currentSlot)) {
  // 다음 슬롯 라벨까지 lookahead
}
```

#### 버그 2: 오후간식 항목이 점심으로 배정 (카스테라 등)
**원인**: 알레르기 표 텍스트가 같은 Y좌표에 섞이면서 `오후간식` 라벨이 행의 첫 번째 필드가 아닌 중간에 위치 → `firstText`만 체크해서 슬롯 감지 실패
**수정**: 행의 **모든 필드**에서 슬롯 라벨 탐색
```js
// 수정 전
const matched = SLOTS.find(s => firstText.includes(s));

// 수정 후
const matched = SLOTS.find(s => row.some(f => f.inferText.includes(s)));
```

---

### 8. 앱 비밀번호 잠금 (보안 강화)
**파일**: `index.html`, `Code.gs`
- 기존: 비밀번호가 클라이언트 JS에 평문 노출 → F12로 즉시 확인 가능
- 수정: 비밀번호를 GAS Script Properties(`lockPw`)에 저장, 서버에서 검증
- `checkPw` 요청 타입 추가 (`Code.gs` — `doPost`)
- `gasPost` 반환값이 boolean이므로 `if (res)`로 비교 (`if (res.ok)` 아님 주의)

---

### 9. saveMeal() Date 객체 비교 버그
**파일**: `Code.gs` — `saveMeal()`
**원인**: `getMeal()`과 동일한 버그 — Sheets Date 객체를 문자열로 비교해서 기존 행을 못 찾고 항상 append → 중복 행 누적
**수정**: `getMeal()`과 동일하게 `fmtDate()` 변환 후 비교

---

### 10. 텔레그램 봇 명령어 응답 (폴링 방식)
**파일**: `Code.gs`
- `/start`, `/status`, `/오늘` 명령어에 오늘/내일 계란 여부 + 이달 계란 있는 날 목록 응답
- `buildWelcomeMessage()`: 날짜 중복 제거(dateMap), 계란 있는 날만 표시(메뉴 포함), 계란 없는 날 미표시

**webhook 불가 이유**: GAS 웹앱은 POST 요청에 302 리다이렉트 반환 → Telegram이 따라가지 않아 항상 실패

**대안: 폴링 방식**
- `pollTelegram()`: 1분마다 트리거로 `getUpdates` API 호출
- `tgOffset`을 Script Properties에 저장해 중복 처리 방지
- `installTrigger()` 실행 시 9시 알림 트리거 + 폴링 트리거 동시 등록
```
installTrigger() 1회 실행
  → sendDailyNotif 트리거 (매일 09:00 KST)
  → pollTelegram 트리거 (매 1분)
    → getUpdates API → handleTelegramUpdate() → buildWelcomeMessage()
```

---

### 11. 보안 취약점 수정 (2026-03-23)

#### GAS 배포 URL 하드코딩 제거
**파일**: `Code.gs` — `setWebhook()`
- 기존: URL이 소스코드에 평문 노출
- 수정: `PropertiesService.getScriptProperties().getProperty('gasUrl')`로 변경
- Script Properties에 `gasUrl` 키로 저장 필요

#### API 키 재발급
- Telegram 봇 토큰 재발급 (`tgToken`)
- NAVER Clova API Secret 키 재생성 (`clovaSecret`)
- 재발급 후 GAS Script Properties 업데이트

#### favicon 404 제거
**파일**: `index.html` — `<head>`
- `<link rel="icon" href="data:,">` 추가 → 브라우저 favicon 요청 차단

---

### 12. 새 기기 GAS URL 미설정 시 잠금 우회 (2026-03-23)

**파일**: `index.html` — `window.addEventListener('load')`, `tryUnlock()`

**문제**: 새 기기는 localStorage가 비어 있어 gasUrl이 없음 → `gasPost()`가 즉시 `false` 반환 → 잠금화면에서 비밀번호를 맞게 입력해도 "비밀번호 틀렸어요" 출력

**시도 후 거부된 방향**: 잠금화면에 GAS URL 입력 필드 추가 → "비밀번호만 치면 되어야 한다"로 거부

**최종 수정**:
- gasUrl 없으면 잠금화면 스킵 → 설정 탭 자동 오픈 + 토스트 안내
- 설정에서 GAS URL 입력·저장 후 다음 로드부터 잠금 정상 동작
- 잠금화면 내 URL 입력 필드(`lockGasUrlWrap`) 제거

```js
// load 이벤트
if (!cfg.gasUrl) {
  switchTab('settings', document.getElementById('nav-settings'));
  toast('⚙️ GAS URL을 먼저 설정해 주세요');
} else {
  document.getElementById('lockScreen').style.display = 'flex';
}
```

**보안 영향 없음**: 새 기기는 localStorage 전체가 비어 있어 Clova 설정도 없음 → OCR 등 기능 사용 불가

---

### 13. 환경변수 파일 분리 (2026-03-23)

**작업**: `새 텍스트 문서.txt`에 평문으로 저장되어 있던 API 키·URL들을 `.env` 파일로 이전
- `BOT_TOKEN` — Telegram 봇 토큰
- `JSH_CHAT_ID`, `CYJ_CHAT_ID` — Telegram Chat ID
- `CLOVA_URL` — NAVER Clova OCR API endpoint
- `SECRET_KEY` — Clova Secret key
- `GAS_URL` — Google Apps Script 배포 URL

`.gitignore`에 `.env` 포함 여부 확인 권장

---

### 14. 텔레그램 알림 복수 기기 지원 (2026-03-24)

**파일**: `Code.gs`, `index.html`

**문제**: `tgChatId`가 단일 값으로 저장되어 GAS 알림이 한 기기에만 발송됨

**수정**:
- GAS Script Properties에 `tgChatIds` (JSON 배열)로 복수 chat ID 관리
- `registerChatId(chatId)` 함수 추가 — 중복 없이 배열에 추가
- `doPost`에 `type: 'registerChatId'` 타입 추가
- `sendDailyNotif()`: `tgChatIds` 배열 전체에 순차 발송, 없으면 기존 `tgChatId` 폴백
- `index.html` `saveSettings()`: 설정 저장 시 본인 chat ID만 `registerChatId`로 등록 → 상대방 chat ID 몰라도 됨
- `tgSend()`: 등록된 모든 chat ID에 병렬 전송

**각 기기 설정 방법**: 앱 설정 탭 → 본인 Chat ID 입력 → 저장 (독립적으로 수행)

---

### 15. 식단 업로드 알림 — 단일 기기에만 발송되는 버그 수정 (2026-04-03)

**파일**: `Code.gs`, `index.html` — `saveMonthly()`

**문제**: 월간 식단표 업로드 완료 시 `tgSend()`를 호출하는데, 이 함수는 업로드한 **기기의 localStorage**에 저장된 `cfg.tgChatId`만 사용함 → 다른 기기에 알림 미전달

**원인**: GAS에는 `tgChatIds` 배열에 모든 기기의 Chat ID가 등록되어 있지만, 업로드 알림은 GAS를 거치지 않고 브라우저에서 직접 발송

**최종 수정** (별도 `broadcast` 엔드포인트 방식은 GAS 실행 환경 문제로 불안정):
- `Code.gs` `batchMeals` 핸들러: `data.message`가 있으면 저장 후 `tgChatIds` 전체에 즉시 발송
- `index.html` `saveMonthly()`: `gasUrl`이 있으면 `gasPost({ type: 'batchMeals', meals, message: msg })`로 저장+알림 한 번에 처리, 없으면 저장 후 `tgSend()` 폴백
- 저장과 알림을 동일 GAS 실행 컨텍스트에서 처리 → 안정적

---

## 아키텍처 메모

### OCR 파싱 흐름
```
이미지 업로드
  → GAS 프록시 → CLOVA OCR API
  → tables 있으면 parseMonthlyTable() [정확, 우선]
  → tables 없으면 parseMonthlyFromFields() [좌표 기반, fallback]
  → correctOcr() → parseEggMenusInSlot() → detectEgg()
```

### 알림 흐름
```
GAS 트리거 (매일 08:00 KST)
  → sendDailyNotif()
  → getMeal(오늘) + getMeal(내일)
  → 오늘 리마인드 + 내일 알림 메시지 조합
  → tgChatIds 배열 전체에 sendTelegram() (폴백: tgChatId)

GAS 트리거 (매 1분)
  → pollTelegram()
  → Telegram getUpdates API (offset: tgOffset)
  → handleTelegramUpdate() → /start·/status·/오늘 명령 감지
  → buildWelcomeMessage() → sendTelegram()
```

### 슬롯 파싱 특성 (키즈노트 식단표)
- `오전간식` / `오후간식`: 표에서 **1행**만 차지 → THIN_SLOT으로 처리
- `점심`: 밥+국+반찬+김치로 **다중 행** 차지 → 라벨보다 음식이 위에 먼저 인식될 수 있음
- 알레르기 표가 표 오른쪽에 위치 → 같은 Y좌표에 섞여 슬롯 라벨 위치 오염 가능

---

## 2026-04-03 매일 알림 미발송 버그 수정

**증상**: 오전 9시 알림이 오지 않음

**원인 1 — `sendDailyNotif` 조기 종료 조건 오류**
- `if (!cfg.tgToken || !cfg.tgChatId) return;` 에서 `tgChatId`(단일값)가 비어있으면 즉시 종료
- 실제 발송은 `tgChatIds`(배열) 기반인데 이 검사만 통과하면 배열이 있어도 알림 안 감
- **수정**: 조건을 `chatIds` 배열로 계산 후 길이 검사로 변경

**원인 2 — 내일 식단 없으면 오늘 알림도 스킵**
- `const meal = getMeal(tmrStr); if (!meal) return;`에서 내일 식단 미등록 시 오늘 알림도 안 보냄
- **수정**: `if (!meal)` return 제거 → `tomorrowSection`에서 `!meal`이면 "📭 식단 미등록" 표시로 분기

---

## 2026-04-03 계란 감지 누락 버그 수정

**증상**: 4월 식단표 등록 시 `치킨마요덮밥` (알레르기 1번 포함)이 계란 없음으로 처리

**원인 1 — `EGG_FOOD_KW` 마요 키워드 누락**
- `치킨마요덮밥`은 마요네즈(달걀 성분) 메뉴인데 `EGG_FOOD_KW`에 `마요`가 없었음
- **수정**: `마요`, `마요네즈`, `에그` 키워드 추가

**원인 2 — `parseAllergenStr` 중복 번호 파싱 실패**
- OCR이 알레르기 번호를 다음 행으로 밀어 `1561012151616`처럼 긴 문자열로 합쳐짐
- 끝에 `16`이 중복되면 오름차순 조건(`>`) 위반으로 전체 역추적 실패 → `[]` 반환
- **수정**: 2자리 번호 비교를 `>` → `>=`로 변경해 중복 허용

**원인 3 — 알레르기 번호 정규식 자리수 제한**
- `{1,12}` 상한으로 13자리 이상 번호열 잘림
- **수정**: `\d+` (무제한)으로 변경
