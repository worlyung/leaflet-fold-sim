# 리플렛 · 책자 시뮬레이터

> 접지 리플렛과 다페이지 브로슈어를 **로컬 웹**에서 미리 보는 내부 확인용 도구입니다.  
> 앞·뒤(또는 페이지별) 이미지를 올리고, 사이즈·접지·제본에 따라 **전개 / 접힘 / 플립북 / 3D**로 확인합니다.

![License](https://img.shields.io/badge/license-MIT-blue)
![Stack](https://img.shields.io/badge/stack-HTML%20%7C%20CSS%20%7C%20JS-informational)
![No build](https://img.shields.io/badge/build-none-success)

---

## 왜 만들었나

리플렛·브로슈어를 평면(앞장·뒷장)으로만 보면, 출력 후 **이단·3단 접지**나 **책자 넘김** 형태를 머릿속으로만 맞춰야 합니다.  
이 도구는 접지 방식·페이지 수·이미지를 넣고 **실제로 어떻게 보이는지** 시뮬레이션합니다.

---

## 기능

### 모드 A — 접지 리플렛

| 항목 | 내용 |
|------|------|
| 용지 | A4, A3, A5, B5(JIS/ISO), 커스텀 mm |
| 접지 | 이단 반접지 · 3단 문접기(C) · 3단 병풍(Z) 등 |
| 이미지 | 앞·뒤 전개 2장 + 패널별 덮어쓰기 |
| 보기 | 전개도 · 접힌 상태 · 책 넘기기 · 접힘 슬라이더 · 3D 회전 |
| 면폭 | C접지 등 안쪽 면 축소 δ(1~4mm) 조절 |

### 모드 B — 책자 · 브로슈어

| 항목 | 내용 |
|------|------|
| 페이지 크기 | A5, A4, B5, 커스텀 (완성 **한 쪽** 기준) |
| 제본 | 중철(4배수) · 무선 · 스프링 |
| 페이지 수 | 4~48(중철) / 최대 64 |
| 이미지 | 여러 장 일괄 · **PDF 자동 분리** · 페이지별 |
| 보기 | 스프레드 · 플립북 · **임포지션** · 썸네일 · 3D 책 |
| 내보내기 | 임포지션 PNG/PDF (중철) |

상단 **데모 이미지** 버튼 → `fixtures/` 샘플로 바로 확인.

---

## 실행

### 빠른 실행 (Windows)

```bat
start.bat
```

브라우저에서 `http://127.0.0.1:8765` 가 열립니다.

### 수동 실행

```bash
cd leaflet-fold-sim
npx --yes serve -l 8765
```

또는 Python이 있다면:

```bash
python -m http.server 8765
```

> `index.html`을 `file://`로 직접 열면 ES 모듈·`presets.json` fetch가 막힐 수 있습니다. **로컬 서버 사용을 권장**합니다.  
> 3D 보기는 [three.js](https://threejs.org/) CDN(unpkg)을 쓰므로 첫 실행 시 인터넷이 필요합니다.

---

## 사용 흐름

1. 상단에서 **접지 리플렛** 또는 **책자 · 브로슈어** 선택  
2. 사이즈·접지(또는 제본·페이지 수) 설정  
3. 이미지 업로드  
4. 보기 모드로 전개 / 접힘 / 넘김 / 3D 확인  
5. 책자 플립북: 페이지 **드래그** 또는 `←` `→` 키

---

## 폴더 구조

```
leaflet-fold-sim/
├── index.html                 # 앱 셸
├── start.bat                  # 로컬 서버 실행
├── presets.json               # 사이즈·접지·제본 프리셋
├── research-sizes-folds.md    # 사이즈·접지 리서치 노트
├── css/
│   └── app.css
├── js/
│   ├── app.js                 # UI · 모드 전환
│   ├── panel-math.js          # 면폭·패널 계산
│   ├── viewer-3d.js           # Three.js 접지/책 3D
│   ├── booklet.js             # 스프레드·제본 헬퍼
│   ├── page-curl.js           # 곡선 페이지 넘김
│   ├── imposition.js          # 중철 시트 배치
│   ├── shop-templates.js      # 인쇄소 δ 템플릿
│   ├── export-flat.js         # PNG/PDF 내보내기
│   └── pdf-import.js          # PDF → 이미지
└── README.md
```

빌드 단계 없음. 정적 파일만 서빙하면 됩니다.

---

## 프리셋 (`presets.json`)

- **sizes**: ISO A/B, JIS B5, 커스텀  
- **folds**: half, cfold3, zfold3, gate4, accordion4, roll4, french  
- **bindings**: saddle_stitch, perfect_bound, spiral  
- **algorithms**: equal / c_fold_inner_narrow / gate / roll 등  

인쇄소마다 면폭 보정(mm)이 다르므로, C접지 등은 **δ 슬라이더**로 맞춥니다.

---

## 한계 (알아둘 점)

- 완성 크기·면폭은 **인쇄소 템플릿과 1mm 단위로 다를 수 있음** (내부 시뮬레이션용).  
- 뒷면 전개 좌우 반전은 임포지션 규칙에 따라 다름.  
- 중철 임포지션은 **표준 4배수 배치** 기준(인쇄소 관례와 1장 단위로 다를 수 있음).  
- 4단 대문·롤 등 일부 접지의 3D 각도는 단순화되어 있음.

---

## 참고 · 크레딧

책자 **플립북**의 곡선 페이지 넘김(nested strip chain, 드래그·속도 커밋 스프링)은 아래 구현을 참고했습니다.

- [MengTo/sketchbook](https://github.com/MengTo/sketchbook) — [mengto.com](https://mengto.com)  
- 원 개념: [matthewyuart/personalportfolio](https://github.com/matthewyuart/personalportfolio)

3D: [three.js](https://github.com/mrdoob/three.js)

---

## 로드맵

- [x] 중철 임포지션 전개도 (책자 모드 · 보기 «임포지션»)
- [x] PDF 페이지 자동 분리 업로드 (책자 PDF / 접지 앞·뒤 1·2쪽)
- [x] 인쇄소별 면폭 템플릿 저장 (localStorage · δ 값)
- [x] 전개도·임포지션 PNG/PDF 내보내기
- [x] 중철 부모 용지(A3 등) 자동 매핑 UI
- [x] 무선·링 제본 페이지 순서 가이드 («인쇄 가이드»)
- [x] 템플릿 JSON 파일 import/export

### 이후 후보

- [ ] 재단 여백(bleed)·안전 영역 가이드
- [ ] GitHub Pages 데모 배포

---

## 라이선스

MIT — 사내 사용·수정 자유. 참고 프로젝트 라이선스는 각 원저장소를 따릅니다.

PDF 파싱: [pdf.js](https://mozilla.github.io/pdf.js/) · PDF 생성: [pdf-lib](https://pdf-lib.js.org/)
