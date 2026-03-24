# 리서치 04: 기술 스택 분석

## 추천 기술 스택 (소규모 스타트업 기준)

### 백엔드
- **Python FastAPI** — 경량, 빠른 개발, 비동기 처리 지원

### 크롤링/자동화
- **Playwright** (2026년 권장, 채택률 45.1%) — 안정적인 자동 대기, Microsoft DevTools Protocol 기반
- **BeautifulSoup** — HTML 파싱
- 키즈노트 로그인 → 세션 유지 → 식단표 페이지 자동화

### 스케줄링
- **APScheduler** — 경량형, 소규모에 적합
- **Celery Beat** + Redis — 분산 처리, 서비스 확장 시

### 알림 발송

#### 카카오톡 알림톡 (1순위 권장)
- 문자 대비 75% 저렴, 1,000자 지원
- 정보성 메시지만 허용 (알레르기 안내 = 정보성 메시지로 적합)
- 알림톡 실패 시 SMS/LMS 자동 폴백 설정 권장
- **제공 API사**: 알리고, NHN Cloud SENS, CoolSMS, 카카오 I Connect Message

#### 모바일 푸시 알림 (2순위)
- **FCM (Firebase Cloud Messaging)** — Android + iOS 통합 관리
- **APNs** — iOS 직접 연동

#### SMS (폴백)
- 알림톡 미수신 시 자동 대체

### 데이터베이스
- **PostgreSQL** — 사용자/아동/알레르기 프로필 관리
- **Redis** — 캐싱, 작업 큐

### 인프라 (초기 비용 효율)
- **AWS Lightsail** 또는 **Heroku** — $5~20/월
- **Docker** — 컨테이너 기반 배포

## 시스템 아키텍처

```
[키즈노트 앱]
     │
     │ 크롤링 (Playwright)
     ▼
[식단표 파서]
  - 메뉴 텍스트 추출
  - 알레르기 번호 파싱 (1번 = 계란)
     │
     ▼
[알레르기 매칭 엔진]
  - 아동 알레르기 프로필 DB 조회
  - 해당 메뉴 제공일 - 1일 = 알림 발송일 계산
     │
     ▼
[알림 스케줄러 (APScheduler)]
  - 매일 저녁 특정 시간 실행
  - 다음 날 식단 중 알레르기 포함 메뉴 확인
     │
     ▼
[알림 발송]
  - 카카오톡 알림톡 (1순위)
  - FCM 푸시 알림 (2순위)
  - SMS (폴백)
```

## 단계별 구현 전략

### Phase 1 - MVP (1~2개월)
- 수동 식단표 입력 (부모가 사진/텍스트 직접 업로드)
- OCR 또는 텍스트 파싱으로 알레르기 번호 추출
- 카카오톡 알림톡 발송
- 비용: $20~50/월

### Phase 2 - 자동화 (3~4개월)
- 키즈노트 비공식 API 크롤링 연동
- 사용자 키즈노트 계정 연결 (부모 동의 기반)
- 알림 커스터마이징 (시간, 채널 선택)
- 비용: $50~100/월

### Phase 3 - 확장 (6개월+)
- 어린이집/유치원 직접 B2B 연동
- 다중 아동 프로필 관리
- 대체 간식 레시피 추천 기능
- 비용: $200~500/월

## 키즈노트 크롤링 기술 세부

```python
# 예시 구현 방향 (Playwright)
from playwright.async_api import async_playwright
import asyncio

async def get_kidsnote_menu(username, password, child_id):
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # 로그인
        await page.goto("https://www.kidsnote.com/login")
        await page.fill("#username", username)
        await page.fill("#password", password)
        await page.click("#login-btn")

        # 식단표 API 호출
        response = await page.request.get(
            f"https://www.kidsnote.com/api/v1_2/children/{child_id}/menus/",
            params={"tz": "Asia/Seoul"}
        )
        return await response.json()
```

## 비용 추정

| 항목 | 월 비용 |
|------|--------|
| 서버 (AWS Lightsail) | $5~20 |
| 카카오 알림톡 (건당 ~8원) | 사용량 비례 |
| FCM 푸시 알림 | 무료 (월 6M건) |
| SMS 폴백 | 건당 ~10원 |
| **합계 (초기)** | **$20~50/월** |

---
*리서치 일자: 2026-03-22*
