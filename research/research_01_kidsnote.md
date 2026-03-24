# 리서치 01: 키즈노트 앱 구조 분석

## 주요 기능

- 식단표, 일정표, 출석부, 투약의뢰서, 공지사항 통합 관리
- 역할별 계정 (원장 / 선생님 / 부모)
- 식단표 구성: 아침 / 오전간식 / 점심 / 오후간식 / 저녁 5개 섹션
- 사진 첨부 (30MB 미만 jpg, png, gif), 메뉴 텍스트 (500자 이내)
- PC에서 주간/월별/목록별 출력 및 다운로드 지원

## 공식 API 현황

- **공식 공개 API 없음** — 개발자용 문서 미제공
- 키즈노트는 외부 개발자에게 API를 공개하지 않음

## 비공식 API 접근 방법

브라우저 개발자 도구 네트워크 탭에서 확인된 엔드포인트:

```
앨범 데이터:
https://www.kidsnote.com/api/v1_2/children/{child_id}/albums/
  ?tz=Asia/Seoul&page_size=12&center={center_id}&cls={class_id}&child={child_id}

알림장 데이터:
https://www.kidsnote.com/api/v1_2/children/{child_id}/reports/
  ?page_size=9999&tz=Asia/Seoul&child={child_id}
```

- 로그인 후 세션/쿠키 유지 필요
- JSON 기반 응답, 타임존 Asia/Seoul 지정
- page_size 파라미터로 전체 데이터 획득 가능
- 식단표 전용 API 엔드포인트는 미확인 (앨범/보고서 API와 유사한 구조 추정)

## 스크래핑 가능성

**가능성: 높음**, 단 기술·법적 위험 존재

### 커뮤니티 사례
- [KuddLim/KidsNoteForEveryone](https://github.com/KuddLim/KidsNoteForEveryone)
- [jwkcp/kidsnote-downloader](https://github.com/jwkcp/kidsnote-downloader) — Python/JavaScript, 사진·영상 다운로드
- [cloim/KidsNoteDownloader](https://github.com/cloim/KidsNoteDownloader) — Chrome 확장 프로그램

### 기술적 장벽
- 로그인 필수 (세션 유지 필요)
- Rate limiting 가능성
- 식단표 API 스키마 미공개

## 알림 기능 현황

- 댓글 입력 시 푸시 알림 (부모 설정 시)
- 공지사항 수신확인 재알림
- 전자출결 알림
- 일부 디바이스에서 알림 미수신 사례 보고됨

## 핵심 제약사항 요약

| 항목 | 현황 |
|------|------|
| 공식 API | 없음 |
| 비공식 API | 존재 (역공학) |
| 식단표 추출 | 기술적으로 가능, 약관 확인 필요 |
| 공식 파트너십 | 키즈노트 고객센터(1644-6734) 문의 필요 |

## 서비스 개발 시 접근 전략

1. **단기**: 부모가 직접 식단표 사진/텍스트를 앱에 입력 → 알레르기 분석
2. **중기**: 키즈노트 비공식 API 연동 (사용자 계정 OAuth 방식)
3. **장기**: 키즈노트 공식 파트너십 체결 또는 어린이집 직접 연동

---
*리서치 일자: 2026-03-22*
