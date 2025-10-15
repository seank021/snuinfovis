# IMDB Success Factors - Interactive Web Visualization

이 프로젝트는 IMDB Top 1000 Dataset을 기반으로, 사용자가 직접 두 개의 decade(e.g., 2000s vs 2010s)를 선택하여 영화의 시대적 특성(장르, 러닝타임, 평론가 점수, 협업 네트워크 등)을 비교하는 인터랙티브 웹 시각화입니다. 이를 통해 각 시대별 영화 산업의 트렌드와 변화를 직관적으로 이해할 수 있습니다.

## 0. 데이터 및 기술 스택
- 데이터: IMDB Top 1000 Movies Dataset
- 기술 스택: HTML/CSS/JS, D3.js, Plotly.js, PapaParse
- 코드 도움: ChatGPT

## 1. 폴더 구조

```
assignment1/
├─ imdb_top_1000.csv
├─ README.md
└─ web/
   ├─ index.html
   ├─ styles.css
   └─ app.js
```

## 2. 실행 방법

### 2.1. 로컬 서버 실행
`assignment1/`에서 터미널 열고 다음 명령어 실행:
```bash
open web/index.html
```

### 2.2. 시각화 실행
1. 화면 상단 CSV 업로드 버튼 클릭 후 `imdb_top_1000.csv` 파일 선택
2. 바로 옆의 Decade A/B 드롭다운에서 비교할 두 개의 decade 선택 
3. 최초 decade 선택 시에는 시각화가 자동으로 보여짐으로 시각화 업데이트 버튼 클릭 필요 없음, 이후 decade 변경 시에는 시각화 업데이트 클릭 필요

## 3. 기능
- Genre Distribution: 두 시대별 장르 분포 비교
  - Stacked or Horizontal Bar Chart 선택 가능 (Default: Stacked)
    - Stacked: 장르별 비율 비교에 유리
    - Horizontal: decade별 장르 수 비교에 유리
  - drag zoom in/out 가능 (double click 시 초기화)
  - legend 클릭 시 토글 (on/off) 가능
  - hover 시 정확한 수치 표시
- Runtime vs IMDB Rating: 러닝타임, 평점 간 관계 
  - 점 크기는 log(Votes)에 비례
  - drag zoom in/out 가능 (double click 시 초기화)
  - legend 클릭 시 토글 (on/off) 가능
  - hover 시 영화 정보 (제목, 년도) 및 정확한 수치 표시
- Audience vs Critic: 관객 점수 vs 메타스코어의 상관 관계 및 회귀선
  - 회귀선 표시를 통한 상관 관계 시각화
  - drag zoom in/out 가능 (double click 시 초기화)
  - legend 클릭 시 토글 (on/off) 가능
  - hover 시 영화 정보 (제목, 년도) 및 정확한 수치 표시
- Feature Importance: OLS 기반 상대적 변수 중요도 (votes, runtime, metascore, gross)
  - drag zoom in/out 가능 (double click 시 초기화)
  - legend 클릭 시 토글 (on/off) 가능
  - hover 시 정확한 수치 표시
  - 주의: 데이터가 별로 없는 decade 선택 시 막대 그래프가 그려지지 않을 수 있음
- Collaboration Network: 감독–배우 협업 네트워크 및 주요 감독/배우 리스트
  - degree zoom in/out 버튼을 통해 degree ≥ k 기준을 조절 (확대/축소) 가능
  - hover 시 노드 정보 (이름, 감독/배우 여부) 및 degree 표시
    - degree: 고유 협업 파트너 수 (즉, 배우의 경우에는 몇 명의 감독과 협업했는지, 감독의 경우에는 몇 명의 배우와 협업했는지)
  - 주의: 데이터가 별로 없는 decade 선택 시 높은 degree threshold에서는 네트워크가 그려지지 않을 수 있음
