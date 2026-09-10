; EarnRoom Video Worker — Windows installer.
;
; The installer is downloaded with the setup session in its own filename
; (EarnRoom-Video-Worker-Setup-ABCD2345.exe). It reads that filename at run
; time and writes the code into the app's own folder, so the worker pairs
; itself. Nothing is ever typed, copied or shown to the person installing it.
;
; Compiled on a real Windows runner by .github/workflows/windows-worker.yml.
; It is not signed: Windows will show an "unknown publisher" prompt until a
; code-signing certificate is bought.

#define AppName "EarnRoom Video Worker"
#define AppVersion GetEnv("EARNROOM_WORKER_VERSION")
#define AppExe "earnroom-worker.exe"

[Setup]
AppId={{F0D6C9B2-6E5A-4B77-9E4B-2A4D5C0E71A1}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=EarnRoom
DefaultDirName={localappdata}\EarnRoom\VideoWorker
DefaultGroupName=EarnRoom
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputBaseFilename=EarnRoom-Video-Worker-Setup
; Paths here resolve against this script's own folder (worker/desktop/installer),
; so "..\dist" puts the installer in worker/desktop/dist alongside the app build.
OutputDir=..\dist
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible

[Files]
Source: "..\dist\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{userstartup}\{#AppName}"; Filename: "{app}\{#AppExe}"

[Run]
Filename: "{app}\{#AppExe}"; Description: "Start {#AppName}"; Flags: nowait postinstall skipifsilent

[Code]
function SetupCodeFromFileName(): String;
var
  Name, Code: String;
  Marker, I: Integer;
begin
  Result := '';
  Name := ExtractFileName(ExpandConstant('{srcexe}'));
  Marker := Pos('SETUP-', Uppercase(Name));
  if Marker = 0 then
    Exit;
  Code := Copy(Uppercase(Name), Marker + 6, Length(Name));
  I := Pos('.', Code);
  if I > 0 then
    Code := Copy(Code, 1, I - 1);
  if (Length(Code) >= 6) and (Length(Code) <= 16) then
    Result := Code;
end;

// The worker reads this on first start, pairs once, then deletes it.
procedure WriteSetupSession();
var
  Code, Dir, Payload: String;
begin
  Code := SetupCodeFromFileName();
  if Code = '' then
    Exit;
  Dir := ExpandConstant('{%USERPROFILE}\.earnroom-worker');
  ForceDirectories(Dir);
  Payload := '{"code":"' + Code + '","site":"https://earnroom.co.uk"}';
  SaveStringToFile(Dir + '\setup.json', Payload, False);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    WriteSetupSession();
end;
