@rem =============================================================================
@rem Gradle wrapper script for Windows
@rem =============================================================================
@echo off
setlocal

if "%JAVA_HOME%" == "" (
    if exist "C:\Program Files\Android\Android Studio\jbr" (
        set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
    )
)

if "%ANDROID_HOME%" == "" (
    if exist "%LOCALAPPDATA%\Android\Sdk" (
        set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
    )
)

set GRADLE_BAT="C:\Users\mdama\.gradle\wrapper\dists\gradle-9.3.1-bin\23ovyewtku6u96viwx3xl3oks\gradle-9.3.1\bin\gradle.bat"
if exist %GRADLE_BAT% (
    call %GRADLE_BAT% %*
) else (
    echo Gradle distribution not found at %GRADLE_BAT%
    exit /b 1
)

endlocal
