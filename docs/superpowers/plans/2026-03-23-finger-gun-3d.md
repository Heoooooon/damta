# Finger Gun 3D Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 손총 제스처로 3D 표적을 조준하고 발사하는 별도 웹 모드를 추가한다.

**Architecture:** MediaPipe Hands는 손 랜드마크만 제공하고, 제스처 판정과 조준 계산은 테스트 가능한 UMD 모듈로 분리한다. 브라우저 쪽은 기존 Three.js 씬을 재사용하되 표적, 총구 이펙트, 점수 HUD를 `finger-gun` 전용 파일로 분리한다.

**Tech Stack:** Vanilla JS, MediaPipe Hands, Three.js, Node `node:test`

---

### Task 1: Finger Gun Detection Core

**Files:**
- Create: `js/finger-gun/finger-gun-detection.js`
- Create: `tests/finger-gun-detection.test.js`

- [ ] Step 1: 손총 포즈, 조준점, 발사 쿨다운에 대한 failing test 작성
- [ ] Step 2: `node --test tests/finger-gun-detection.test.js`로 red 확인
- [ ] Step 3: 최소 구현으로 finger gun detection core 작성
- [ ] Step 4: 동일 테스트를 다시 돌려 green 확인

### Task 2: Finger Gun 3D Scene

**Files:**
- Create: `finger-gun.html`
- Create: `js/finger-gun/finger-gun-target.js`
- Create: `js/finger-gun/finger-gun-effects.js`
- Create: `js/finger-gun/finger-gun-app.js`
- Modify: `index.html`

- [ ] Step 1: 기존 boxing 3d 레이아웃을 기반으로 finger gun 전용 페이지 뼈대 작성
- [ ] Step 2: 이동/재배치되는 표적과 점수 시스템 구현
- [ ] Step 3: 조준선, 히트 이펙트, 발사 연출 구현
- [ ] Step 4: index 진입 링크 추가

### Task 3: Regression Verification

**Files:**
- Modify: `/Users/gwon-yeheon/gwon-vault/CMORE/damta/damta 현황.md`

- [ ] Step 1: `node --test tests/*.test.js` 실행
- [ ] Step 2: 결과와 설계 결정 사항을 프로젝트 노트에 기록
