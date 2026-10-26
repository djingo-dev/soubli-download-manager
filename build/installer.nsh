; Reject unsupported systems before copying files or creating shortcuts.
!macro customInit
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_OK|MB_ICONSTOP "Soubli Download Manager requires Windows 10 or Windows 11 (64-bit). Windows 7, 8 and 8.1 are not supported. No application files have been installed." /SD IDOK
    SetErrorLevel 1633
    Quit
  ${EndIf}
  !ifmacrodef soubliPrerequisiteCheck
    !insertmacro soubliPrerequisiteCheck
  !endif
!macroend

; Author credit is shown on the installer welcome, wizard footer and finish page.
!macro customWelcomePage
  !include nsDialogs.nsh
  !include WordFunc.nsh
  Var soubliExistingPath
  Var soubliExistingVersion
  Var soubliMaintenanceMode
  Var soubliRepairRadio
  Var soubliReinstallRadio
  Var soubliUninstallRadio
  !define MUI_WELCOMEPAGE_TITLE "Welcome to Soubli ${VERSION}"
  !define MUI_WELCOMEPAGE_TEXT "Soubli Download Manager$\r$\n$\r$\nCreated by Wajdii Afroo$\r$\nfacebook.com/wajdiiafroo0610$\r$\n$\r$\nThis wizard will install soubli on your computer. Click Next to continue."
  !insertmacro MUI_PAGE_WELCOME
  Page custom soubliMaintenancePage soubliMaintenanceLeave

  Function soubliMaintenancePage
    ReadRegStr $soubliExistingPath HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    ReadRegStr $soubliExistingVersion HKCU "${UNINSTALL_REGISTRY_KEY}" DisplayVersion
    ${If} $soubliExistingPath == ""
      ReadRegStr $soubliExistingPath HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
      ReadRegStr $soubliExistingVersion HKLM "${UNINSTALL_REGISTRY_KEY}" DisplayVersion
    ${EndIf}
    ${If} $soubliExistingPath == ""
      Abort
    ${EndIf}
    IfFileExists "$soubliExistingPath\Uninstall soubli.exe" 0 soubliNoMaintenance
    StrCpy $INSTDIR $soubliExistingPath
    ${VersionCompare} "$soubliExistingVersion" "${VERSION}" $0
    ${If} $0 == 1
      MessageBox MB_ICONEXCLAMATION|MB_OK "Soubli $soubliExistingVersion is already installed. This package is ${VERSION}. Use the same or a newer installer to maintain it."
      Quit
    ${EndIf}
    !insertmacro MUI_HEADER_TEXT "Maintain Soubli" "Choose how to maintain the existing installation."
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateLabel} 0 0 100% 14u "Installed: Soubli $soubliExistingVersion — application location:"
    Pop $0
    ${NSD_CreateText} 0 17u 100% 14u "$soubliExistingPath"
    Pop $0
    ${NSD_AddStyle} $0 ${ES_READONLY}
    ${NSD_CreateRadioButton} 0 42u 100% 16u "Repair / update application files to ${VERSION}"
    Pop $soubliRepairRadio
    ${NSD_CreateRadioButton} 0 65u 100% 16u "Reinstall Soubli ${VERSION} in the existing location"
    Pop $soubliReinstallRadio
    ${NSD_CreateRadioButton} 0 88u 100% 16u "Uninstall the existing Soubli application"
    Pop $soubliUninstallRadio
    ${NSD_Check} $soubliRepairRadio
    ${NSD_CreateLabel} 0 117u 100% 45u "Repair and reinstall replace application files. Your library, settings and downloaded files are kept. Exit Soubli from its tray menu before continuing. No second installation will be created."
    Pop $0
    nsDialogs::Show
    Return
    soubliNoMaintenance:
      StrCpy $soubliExistingPath ""
      Abort
  FunctionEnd

  Function soubliMaintenanceLeave
    ${NSD_GetState} $soubliUninstallRadio $0
    ${If} $0 == ${BST_CHECKED}
      MessageBox MB_OKCANCEL|MB_ICONQUESTION "Open the Soubli uninstaller? Your downloaded files and library will be kept." IDCANCEL soubliStayMaintenance
      ExecWait '"$soubliExistingPath\Uninstall soubli.exe"' $0
      ${If} $0 != 0
        MessageBox MB_ICONEXCLAMATION|MB_OK "Uninstall was cancelled or could not finish. Exit soubli and try again."
        Abort
      ${EndIf}
      Quit
    ${EndIf}
    StrCpy $soubliMaintenanceMode "repair"
    ${NSD_GetState} $soubliReinstallRadio $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $soubliMaintenanceMode "reinstall"
    ${EndIf}
    StrCpy $INSTDIR $soubliExistingPath
    Return
    soubliStayMaintenance:
      Abort
  FunctionEnd
!macroend

!macro customInstallMode
  !ifndef BUILD_UNINSTALLER
    ; Maintenance keeps the registration scope as well as the directory.
    ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${If} $0 != ""
      StrCpy $isForceCurrentInstall "1"
    ${Else}
      ReadRegStr $0 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
      ${If} $0 != ""
        StrCpy $isForceMachineInstall "1"
      ${EndIf}
    ${EndIf}
  !endif
!macroend

; Runs immediately before installing, even if the directory page was visited.
!macro customPageAfterChangeDir
  !define MUI_PAGE_CUSTOMFUNCTION_PRE soubliDirectoryPre
  !insertmacro MUI_PAGE_DIRECTORY
  Function soubliDirectoryPre
    ${If} $soubliExistingPath != ""
      StrCpy $INSTDIR $soubliExistingPath
      Abort
    ${EndIf}
  FunctionEnd
  Page custom soubliKeepExistingLocation
  Function soubliKeepExistingLocation
    ${If} $soubliExistingPath != ""
      StrCpy $INSTDIR $soubliExistingPath
    ${EndIf}
    Abort
  FunctionEnd
!macroend

!macro customHeader
  BrandingText "Soubli ${VERSION} | Wajdii Afroo"
!macroend

!define MUI_FINISHPAGE_TEXT "Soubli has been installed.$\r$\n$\r$\nCreated by Wajdii Afroo"
!define MUI_FINISHPAGE_LINK "Wajdii Afroo - Facebook"
!define MUI_FINISHPAGE_LINK_LOCATION "https://www.facebook.com/wajdiiafroo0610"

!macro customUnInstall
  ; Remove native registration; keep Realm and saved downloads.
  DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\local.soubli.companion"
  DeleteRegKey HKCU "Software\Microsoft\Edge\NativeMessagingHosts\local.soubli.companion"
  DeleteRegKey HKCU "Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\local.soubli.companion"
  DeleteRegKey HKCU "Software\Chromium\NativeMessagingHosts\local.soubli.companion"
!macroend
