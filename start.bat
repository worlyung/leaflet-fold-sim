@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  인쇄물 · 포토존 3D 스튜디오
echo  사용 가능한 로컬 주소를 찾아 실행합니다.
echo  종료: Ctrl+C
echo.
where py >nul 2>&1 && (
  py scripts\serve.py
  exit /b
)
where python >nul 2>&1 && (
  python scripts\serve.py
  exit /b
)
where npx >nul 2>&1 && (
  echo 브라우저에서 아래 서버가 표시하는 Local 주소를 열어 주세요.
  npx --yes serve --listen tcp://127.0.0.1:8871
  exit /b
)
echo [오류] Python 또는 Node.js가 필요합니다.
pause
