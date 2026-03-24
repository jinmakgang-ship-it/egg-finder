# 계란 알림이 🥚

어린이집 월간 식단표를 사진으로 찍으면 **계란(알류) 포함 여부를 자동으로 파악**하고, 매일 아침 텔레그램으로 알림을 보내주는 웹앱입니다.

## 주요 기능

- **OCR 식단 파싱** — 식단표 사진을 업로드하면 NAVER Clova OCR로 텍스트를 추출하고, 오전간식/점심/오후간식별로 메뉴를 분류
- **계란 알레르기 감지** — 알레르기 번호 1번(알류) 기준으로 계란 포함 여부를 자동 판별
- **매일 아침 9시 텔레그램 알림** — 오늘 식단 리마인드 + 내일 계란 포함 여부 + 대체 음식 추천
- **복수 기기 알림 지원** — 여러 기기(부모 각각)가 독립적으로 설정하면 모두에게 알림 발송
- **텔레그램 봇 명령어** — `/start`, `/status`, `/오늘` 입력 시 오늘·내일·이달 식단 현황 응답
- **앱 비밀번호 잠금** — 설정·식단 등록 기능은 비밀번호 인증 후 사용 가능

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | HTML/CSS/JS (SPA, GitHub Pages 호스팅) |
| 백엔드 | Google Apps Script (GAS) 웹앱 |
| 데이터 저장 | Google Sheets (`meals` 시트) + 브라우저 localStorage |
| OCR | NAVER Clova OCR API (GAS 프록시 경유) |
| 알림 | Telegram Bot API |

## 아키텍처

```
[GitHub Pages — index.html]
  │
  ├── 식단 저장/조회  ──────────→ [GAS 웹앱]
  │                                   │
  ├── OCR 요청  ──────────────────→   ├── NAVER Clova OCR API
  │                                   ├── Google Sheets (meals 시트)
  └── 비밀번호 확인 ──────────────→   └── Telegram Bot API

[GAS 시간 기반 트리거]
  ├── 매일 09:00 KST → sendDailyNotif() → 전체 chat ID에 알림 발송
  └── 매 1분 → pollTelegram() → 봇 명령어 처리
```

### OCR 파싱 흐름

```
이미지 업로드
  → GAS 프록시 → CLOVA OCR API
  → tables 있으면 parseMonthlyTable()   [테이블 구조, 우선 적용]
  → tables 없으면 parseMonthlyFromFields() [좌표 기반, fallback]
  → correctOcr() (오인식 보정)
  → parseEggMenusInSlot() → detectEgg()
```

## 설치 및 설정

### 1. Google Apps Script 설정

1. [Google Apps Script](https://script.google.com)에서 새 프로젝트 생성
2. `Code.gs` 내용을 붙여넣고 저장
3. **Script Properties** (`프로젝트 설정 → 스크립트 속성`)에 아래 키 등록:

| 키 | 설명 |
|----|------|
| `tgToken` | Telegram 봇 토큰 |
| `tgChatId` | 기본 Telegram Chat ID |
| `gasUrl` | 이 GAS 웹앱의 배포 URL |
| `lockPw` | 앱 잠금 비밀번호 |
| `clovaUrl` | NAVER Clova OCR API endpoint |
| `clovaSecret` | Clova OCR Secret 키 |

4. **배포** → `새 배포` → 유형: 웹앱 → 액세스: 전체 허용
5. Apps Script 편집기에서 `installTrigger()` 함수를 **1회 직접 실행** (트리거 자동 등록)

### 2. 프론트엔드 설정

1. 이 저장소를 fork 또는 clone
2. `index.html`을 GitHub Pages로 호스팅 (저장소 설정 → Pages → `main` 브랜치)
3. 앱 접속 후 **설정 탭**에서 GAS 배포 URL 입력 및 저장

### 3. 복수 기기 등록

각 기기(부모)별로 앱 설정 탭에서 본인의 Telegram Chat ID를 입력하고 저장하면, GAS가 자동으로 배열에 추가합니다. 상대방 Chat ID를 알 필요 없이 독립적으로 설정 가능합니다.

> Chat ID 확인 방법: Telegram에서 `@userinfobot`에 `/start` 전송

## 보안 주의사항

- `.env` 파일은 절대 커밋하지 마세요 (`.gitignore`에 포함되어 있음)
- API 키·토큰은 GAS Script Properties에만 저장하고 소스코드에 하드코딩하지 마세요
- 앱 비밀번호(`lockPw`)는 GAS Script Properties에서 서버 측 검증합니다

## 파일 구조

```
.
├── index.html   # 프론트엔드 전체 (SPA)
├── Code.gs      # Google Apps Script 백엔드
├── .gitignore
└── .env         # API 키 등 (커밋 금지)
```
