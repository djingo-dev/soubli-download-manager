Unicode true
!include LogicLib.nsh
!include FileFunc.nsh
!include WinVer.nsh
!include x64.nsh
!include "${PROJECT_DIR}\build\compact-installer.nsh"
Name "Soubli Download Manager"
OutFile "${OUTPUT_FILE}"
Icon "${PROJECT_DIR}\build\icon.ico"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 64
CRCCheck on
SilentInstall silent
AutoCloseWindow true
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "Soubli Download Manager"
VIAddVersionKey "FileDescription" "Soubli Download Manager Portable"
VIAddVersionKey "LegalCopyright" "Wajdii Afroo"
VIAddVersionKey "FileVersion" "${VERSION}"
Var soubliCache
Var soubliParameters
Var soubliExtractionMutex
Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONINFORMATION "soubli requires 64-bit Windows 10 or Windows 11."
    Quit
  ${EndIf}
  SetRegView 64
  !insertmacro customInit
FunctionEnd
Section
  StrCpy $soubliCache "$LOCALAPPDATA\soubli\PortableRuntime\${VERSION}-${PAYLOAD_ID}"
  System::Call 'kernel32::CreateMutexW(p 0, i 0, w "Local\soubliPortableExtract-${PAYLOAD_ID}") p.r0'
  StrCpy $soubliExtractionMutex $0
  System::Call 'kernel32::WaitForSingleObject(p r0, i 60000) i.r1'
  ${If} $1 != 0
  ${AndIf} $1 != 128
    MessageBox MB_OK|MB_ICONINFORMATION "soubli's portable files are still being prepared. Try opening soubli again."
    SetErrorLevel 1618
    Quit
  ${EndIf}
  IfFileExists "$soubliCache\.complete" 0 portableExtract
  !include "${PRESENCE_CHECKS}"
  Goto portableLaunch
  portableExtract:
    ; A damaged cache must never be repaired over a running independent engine.
    System::Call 'kernel32::SetEnvironmentVariable(t "soubli_PORTABLE_TARGET", t "$soubliCache")'
    nsExec::Exec '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -Command "$$ErrorActionPreference=1; try { $$target=$$env:soubli_PORTABLE_TARGET; if (Get-CimInstance Win32_Process | Where-Object { $$_.ExecutablePath -and ($$_.ExecutablePath -eq (Join-Path $$target soubli.exe) -or $$_.ExecutablePath -eq (Join-Path $$target runtime\node.exe)) }) { exit 1 }; exit 0 } catch { exit 2 }"'
    Pop $0
    ${If} $0 != 0
      MessageBox MB_OK|MB_ICONINFORMATION "Exit soubli from its tray menu before repairing these portable files. Running downloads have been kept."
      SetErrorLevel 1618
      Goto portableDone
    ${EndIf}
    SetOutPath "$soubliCache"
    ClearErrors
    File /r "${PAYLOAD_DIR}\*.*"
    ${If} ${Errors}
      MessageBox MB_OK|MB_ICONINFORMATION "soubli could not prepare its portable files. Check free disk space and try again. Your library has been kept."
      SetErrorLevel 1603
      Goto portableDone
    ${EndIf}
    FileOpen $0 "$soubliCache\.complete" w
    FileWrite $0 "${PAYLOAD_ID}"
    FileClose $0
  portableLaunch:
    System::Call 'kernel32::SetEnvironmentVariable(t "PORTABLE_EXECUTABLE_FILE", t "$EXEPATH")'
    System::Call 'kernel32::SetEnvironmentVariable(t "PORTABLE_EXECUTABLE_DIR", t "$EXEDIR")'
    ${GetParameters} $soubliParameters
    ; Optional registry probes can leave NSIS's error flag set even when launch succeeds.
    ClearErrors
    Exec '"$soubliCache\soubli.exe" $soubliParameters'
    ${If} ${Errors}
      MessageBox MB_OK|MB_ICONINFORMATION "soubli could not open. Reopen it to try again. Your library and saved download parts have been kept."
      SetErrorLevel 1603
    ${EndIf}
  portableDone:
    System::Call 'kernel32::ReleaseMutex(p $soubliExtractionMutex)'
    System::Call 'kernel32::CloseHandle(p $soubliExtractionMutex)'
    ; Keep the runtime in its versioned cache while downloads continue independently.
SectionEnd
