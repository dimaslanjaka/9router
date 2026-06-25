@echo off

@REM npm exec --legacy-peer-deps --yes --package=9router -- 9router %*
@REM if %ERRORLEVEL% EQU 0 (
@REM     echo Local 9router succeeded.
@REM     exit /b 0
@REM )

npm exec --legacy-peer-deps --yes --package=https://github.com/dimaslanjaka/9router/raw/master/release/9router.tgz -- 9router %*
if %ERRORLEVEL% EQU 0 (
    echo Remote tarball 9router succeeded.
    exit /b 0
)

@REM https://github.com/dimaslanjaka/bin/raw/master/releases/bin.tgz
@REM https://github.com/dimaslanjaka/9router/raw/refs/heads/master/release/9router.tgz