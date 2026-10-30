@echo off
setlocal
set "UOM_BLENDER=%LOCALAPPDATA%\UNIVERSE-OF-ME\tools\blender-4.2.23-windows-x64"
set "BLENDER_USER_CONFIG=%UOM_BLENDER%\4.2\config"
set "UOM_ASSETS=%USERPROFILE%\Desktop\UNIVERSE-OF-ME-assets\g2-1"
set "UOM_REPO=%~dp0..\.."
if not exist "%UOM_BLENDER%\blender.exe" (
  echo Blender portable not found. See docs/character/g2-1/README.md.
  exit /b 1
)
if "%~1"=="open" (
  "%UOM_BLENDER%\blender.exe" "%UOM_ASSETS%\silver-spirit-draft01\silver-spirit-draft01.blend"
  exit /b
)
if "%~1"=="verify" (
  "%UOM_BLENDER%\blender.exe" -b --factory-startup --python-exit-code 1 --python "%~dp0verify_assets.py" -- "%UOM_ASSETS%\silver-spirit-draft01"
  exit /b
)
if "%~1"=="smoke" (
  "%UOM_BLENDER%\blender.exe" -b --factory-startup --python-exit-code 1 --python "%~dp0smoke_test.py" -- "%UOM_ASSETS%\pipeline-test"
  exit /b
)
if "%~1"=="draft" (
  if "%~2"=="" (
    echo Supply a NEW output directory to protect hand-edited projects.
    exit /b 1
  )
  "%UOM_BLENDER%\blender.exe" -b --factory-startup --python-exit-code 1 --python "%~dp0build_character_draft.py" -- "%~2" "%UOM_REPO%"
  exit /b
)
echo Usage: run.cmd open ^| verify ^| smoke ^| draft NEW_OUTPUT_DIRECTORY
exit /b 1
