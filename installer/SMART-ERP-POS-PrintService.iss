; Inno Setup 6 — SMART-ERP-POS Print Service (Phase 1 commercial installer)
; Compile after: powershell -File installer/print-service/build-bundle.ps1
; Output: installer/dist/SMART-ERP-POS-PrintService-Setup.exe
;
; Upgrade: Windows "DeleteFile failed; code 5" = Access Denied while SMART Print Service /
; node.exe still locks {app} files. PrepareToInstall stops the service BEFORE file copy.

#define MyAppName "SMART Print Service"
#define MyAppVersion "1.4.0"
#define MyAppPublisher "SMART-ERP-POS"
#define MyAppURL "https://127.0.0.1:1811/setup"
#define BundleDir "dist\print-service-bundle"
#define ServiceId "SMART-Print-Service"

[Setup]
AppId={{A8F3C2E1-9B4D-4E7A-9C1F-SMARTPRINTSVC01}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
VersionInfoVersion=1.4.0.0
VersionInfoProductVersion={#MyAppVersion}
VersionInfoProductName={#MyAppName}
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription={#MyAppName} Setup
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
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut for Printer Setup Wizard"; Flags: unchecked

; Drop prior JS payload so upgrades cannot leave stale dist beside locked failures.
[InstallDelete]
Type: filesandordirs; Name: "{app}\app\dist"
Type: filesandordirs; Name: "{app}\app\node_modules"
Type: filesandordirs; Name: "{app}\app\public"

[Files]
; dontcopy helper used only during PrepareToInstall (extracted to {tmp})
Source: "print-service\Stop-PrintService-ForUpgrade.cmd"; DestDir: "{tmp}"; Flags: dontcopy
; ignoreversion = always write our files; restartreplace = if still locked, finish after reboot
Source: "{#BundleDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs restartreplace

[Icons]
Name: "{group}\SMART Print Service"; Filename: "{app}\Start-PrintService.vbs"; WorkingDir: "{app}"
Name: "{group}\Printer Setup Wizard"; Filename: "{app}\Open-Printer-Setup.vbs"; WorkingDir: "{app}"
Name: "{group}\Uninstall Print Service"; Filename: "{uninstallexe}"
Name: "{userstartup}\SMART Print Service"; Filename: "{app}\Start-PrintService.vbs"; WorkingDir: "{app}"
Name: "{userdesktop}\Printer Setup Wizard"; Filename: "{app}\Open-Printer-Setup.vbs"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\SMART Print Service.exe"; Parameters: "install"; StatusMsg: "Registering Print Service..."; Flags: runhidden waituntilterminated
Filename: "{app}\SMART Print Service.exe"; Parameters: "start"; StatusMsg: "Starting Print Service..."; Flags: runhidden waituntilterminated
Filename: "{app}\Open-Printer-Setup.vbs"; StatusMsg: "Opening Printer Setup Wizard..."; Flags: shellexec skipifsilent nowait

[UninstallRun]
Filename: "{app}\SMART Print Service.exe"; Parameters: "stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopPrintSvc"
Filename: "{app}\SMART Print Service.exe"; Parameters: "uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "UninstallPrintSvc"

[Code]
procedure StopPrintServiceProcesses;
var
  ResultCode: Integer;
  Winsw: String;
  StopCmd: String;
begin
  // Preferred: stop script extracted to temp during PrepareToInstall
  StopCmd := ExpandConstant('{tmp}\Stop-PrintService-ForUpgrade.cmd');
  if FileExists(StopCmd) then
  begin
    Exec(StopCmd, '', ExpandConstant('{tmp}'), SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end
  else
  begin
    Exec('sc.exe', 'stop {#ServiceId}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Sleep(2000);
    Winsw := ExpandConstant('{app}\SMART Print Service.exe');
    if FileExists(Winsw) then
    begin
      Exec(Winsw, 'stop', ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode);
      Sleep(1500);
    end;
    Exec('taskkill.exe', '/F /IM "SMART Print Service.exe"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
  if not IsAdminInstallMode then
  begin
    MsgBox('Administrator privileges are required to install SMART Print Service.', mbError, MB_OK);
    Result := False;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  NeedsRestart := False;
  Result := '';
  ExtractTemporaryFile('Stop-PrintService-ForUpgrade.cmd');
  StopPrintServiceProcesses;
end;

function InitializeUninstall(): Boolean;
var
  ResultCode: Integer;
begin
  Result := True;
  if FileExists(ExpandConstant('{app}\Stop-PrintService-ForUpgrade.cmd')) then
    Exec(ExpandConstant('{app}\Stop-PrintService-ForUpgrade.cmd'), '', ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode)
  else
    StopPrintServiceProcesses;
end;
