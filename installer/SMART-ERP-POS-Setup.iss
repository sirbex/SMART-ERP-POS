; Inno Setup 6 — SMART-ERP-POS full product installer (Phase 2)
; Build bundle first:
;   powershell -File installer/build-product.ps1
;   (optional) -IncludeBackend
; Output: installer/dist/SMART-ERP-POS-Setup.exe

#define MyAppName "SMART-ERP-POS"
#define MyAppVersion "2.0.0"
#define MyAppPublisher "SMART-ERP-POS"
#define BundleDir "dist\product-bundle"

[Setup]
AppId={{B7E2D9A0-4C11-4F8E-9A2B-SMARTERPSETUP02}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\SMART-ERP-POS
DefaultGroupName=SMART-ERP-POS
DisableProgramGroupPage=yes
OutputDir=dist
OutputBaseFilename=SMART-ERP-POS-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
UninstallDisplayIcon={app}\Print Service\SMART Print Service.exe
SetupLogging=yes
CloseApplications=force
LicenseFile=
InfoBeforeFile=

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create &desktop shortcuts"; Flags: unchecked
Name: "firewall"; Description: "Allow local Print Service / Helper through Windows Firewall (loopback safe)"; Flags: unchecked

[Files]
Source: "{#BundleDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Dirs]
Name: "{app}\config"
Name: "{app}\updates"
Name: "{app}\Print Service\app\config"
Name: "{app}\Print Service\app\logs"
Name: "{app}\Service Helper\logs"

[Icons]
; Prefer SMART ERP.exe when present (Phase 4); Inno skips missing targets with skipifdoesntexist on [Run] only —
; use VBS as reliable Start Menu target that delegates to exe when available via Open-SMART-ERP.vbs
Name: "{group}\SMART ERP"; Filename: "{app}\Open-SMART-ERP.vbs"; WorkingDir: "{app}"
Name: "{group}\Connection Setup"; Filename: "{app}\Open-ERP-Setup.vbs"; WorkingDir: "{app}"
Name: "{group}\SMART Print Service"; Filename: "{app}\Start-PrintService.vbs"; WorkingDir: "{app}"
Name: "{group}\Printer Setup Wizard"; Filename: "{app}\Open-Printer-Setup.vbs"; WorkingDir: "{app}"
Name: "{group}\Uninstall SMART-ERP-POS"; Filename: "{uninstallexe}"
Name: "{userstartup}\SMART Print Service"; Filename: "{app}\Start-PrintService.vbs"; WorkingDir: "{app}"
Name: "{userdesktop}\SMART ERP"; Filename: "{app}\Open-SMART-ERP.vbs"; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{userdesktop}\Printer Setup Wizard"; Filename: "{app}\Open-Printer-Setup.vbs"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\Print Service\SMART Print Service.exe"; Parameters: "install"; StatusMsg: "Registering Print Service..."; Flags: runhidden waituntilterminated
Filename: "{app}\Print Service\SMART Print Service.exe"; Parameters: "start"; StatusMsg: "Starting Print Service..."; Flags: runhidden waituntilterminated
Filename: "{app}\Service Helper\SMART Service Helper.exe"; Parameters: "install"; StatusMsg: "Registering Service Helper..."; Flags: runhidden waituntilterminated
Filename: "{app}\Service Helper\SMART Service Helper.exe"; Parameters: "start"; StatusMsg: "Starting Service Helper..."; Flags: runhidden waituntilterminated
; Optional on-prem backend (only present when bundle was built with -IncludeBackend)
Filename: "{app}\Backend\SMART ERP Backend.exe"; Parameters: "install"; StatusMsg: "Registering Backend..."; Flags: runhidden waituntilterminated skipifdoesntexist
Filename: "{app}\Backend\SMART ERP Backend.exe"; Parameters: "start"; StatusMsg: "Starting Backend..."; Flags: runhidden waituntilterminated skipifdoesntexist
Filename: "{app}\Open-Printer-Setup.vbs"; StatusMsg: "Opening Printer Setup Wizard..."; Flags: shellexec skipifsilent nowait
Filename: "{app}\Open-ERP-Setup.vbs"; StatusMsg: "Opening Connection Setup..."; Flags: shellexec skipifsilent nowait

[UninstallRun]
Filename: "{app}\Print Service\SMART Print Service.exe"; Parameters: "stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopPrint"
Filename: "{app}\Print Service\SMART Print Service.exe"; Parameters: "uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "UninstPrint"
Filename: "{app}\Service Helper\SMART Service Helper.exe"; Parameters: "stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopHelper"
Filename: "{app}\Service Helper\SMART Service Helper.exe"; Parameters: "uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "UninstHelper"
Filename: "{app}\Backend\SMART ERP Backend.exe"; Parameters: "stop"; Flags: runhidden waituntilterminated skipifdoesntexist; RunOnceId: "StopBackend"
Filename: "{app}\Backend\SMART ERP Backend.exe"; Parameters: "uninstall"; Flags: runhidden waituntilterminated skipifdoesntexist; RunOnceId: "UninstBackend"

[Code]
function InitializeSetup(): Boolean;
var
  Version: TWindowsVersion;
begin
  Result := True;
  GetWindowsVersionEx(Version);
  if Version.Major < 10 then
  begin
    MsgBox('SMART-ERP-POS requires Windows 10 or later.', mbError, MB_OK);
    Result := False;
    exit;
  end;
  if not IsAdmin() then
  begin
    MsgBox('Administrator privileges are required.', mbError, MB_OK);
    Result := False;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if (CurStep = ssPostInstall) and WizardIsTaskSelected('firewall') then
  begin
    Exec('netsh', 'advfirewall firewall add rule name="SMART Print Service" dir=in action=allow protocol=TCP localport=1811 profile=any', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('netsh', 'advfirewall firewall add rule name="SMART Service Helper" dir=in action=allow protocol=TCP localport=1812 profile=any', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;
