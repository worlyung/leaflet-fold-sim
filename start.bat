@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  리플렛 접지 시뮬레이터
echo  http://127.0.0.1:8765
echo  종료: Ctrl+C
echo.
where npx >nul 2>&1 && (
  start "" "http://127.0.0.1:8765"
  npx --yes serve -l 8765
  exit /b
)
where py >nul 2>&1 && (
  start "" "http://127.0.0.1:8765"
  py -m http.server 8765
  exit /b
)
where python >nul 2>&1 && (
  start "" "http://127.0.0.1:8765"
  python -m http.server 8765
  exit /b
)
echo [오류] Python 또는 Node.js(npx)가 필요합니다.
pause
