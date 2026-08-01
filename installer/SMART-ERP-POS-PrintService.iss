; Inno Setup 6 — SMART-ERP-POS Print Service (Phase 1 commercial installer)
; Compile after: powershell -File installer/print-service/build-bundle.ps1
; Output: installer/dist/SMART-ERP-POS-PrintService-Setup.exe

#define MyAppName "SMART Print Service"
#define MyAppVersion "1.3.0"
#define MyAppPublisher "SMART-ERP-POS"
#define MyAppURL "https://127.0.0.1:1811/setup"
#define BundleDir "dist\print-service-bundle"

[Setup]
AppId={{A8F3C2E1-9B4D-4E7A-9C1F-SMARTPRINTSVC01}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\SMART-ERP-POS\Print Service
DefaultGroupName=SMART-ERP-POS
DisableProgramGroupPage=yes
OutputDir=dist
OutputBaseFilename=SMART-ERP-POS-PrintService-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
UninstallDisplayIcon={app}\SMART Print Service.exe
SetupLogging=yes
CloseApplications=force

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut for Printer Setup Wizard"; Flags: unchecked

[Files]
Source: "{#BundleDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\SMART Print Service"; Filename: "{app}\Start-PrintService.vbs"; WorkingDir: "{app}"
Name: "{group}\Printer Setup Wizard"; Filename: "{app}\Open-Printer-Setup.vbs"; WorkingDir: "{app}"
Name: "{group}\Uninstall Print Service"; Filename: "{uninstallexe}"
Name: "{userstartup}\SMART Print Service"; Filename: "{app}\Start-PrintService.vbs"; WorkingDir: "{app}"
Name: "{userdesktop}\Printer Setup Wizard"; Filename: "{app}\Open-Printer-Setup.vbs"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
; Install + start Windows Service (WinSW)
Filename: "{app}\SMART Print Service.exe"; Parameters: "install"; StatusMsg: "Registering Print Service..."; Flags: runhidden waituntilterminated
Filename: "{app}\SMART Print Service.exe"; Parameters: "start"; StatusMsg: "Starting Print Service..."; Flags: runhidden waituntilterminated
; First-launch wizard (no PowerShell)
Filename: "{app}\Open-Printer-Setup.vbs"; StatusMsg: "Opening Printer Setup Wizard..."; Flags: shellexec skipifsilent nowait

[UninstallRun]
Filename: "{app}\SMART Print Service.exe"; Parameters: "stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopPrintSvc"
Filename: "{app}\SMART Print Service.exe"; Parameters: "uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "UninstallPrintSvc"

[Code]
function InitializeSetup(): Boolean;
begin
  Result := True;
  if not IsAdmin() then
  begin
    MsgBox('Administrator privileges are required to install SMART Print Service.', mbError, MB_OK);
    Result := False;
  end;
end;
