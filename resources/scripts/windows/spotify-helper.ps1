param([ValidateSet('inspect','open-spotify')][string]$Action = 'inspect')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
if ($Action -eq 'open-spotify') { Start-Process 'spotify:' -WindowStyle Hidden; 'Spotify opened.'; exit 0 }
$processes = Get-Process -Name Spotify -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
if (-not $processes) { throw 'Откройте приложение Spotify и повторите.' }
$window = [System.Windows.Automation.AutomationElement]::FromHandle($processes[0].MainWindowHandle)
if ($Action -eq 'inspect') {
  $elements = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  $result = foreach ($element in $elements) {
    if ($element.Current.ControlType -in @([System.Windows.Automation.ControlType]::Button,[System.Windows.Automation.ControlType]::MenuItem,[System.Windows.Automation.ControlType]::TabItem)) {
      [pscustomobject]@{ Name = $element.Current.Name; AutomationId = $element.Current.AutomationId; Type = $element.Current.ControlType.ProgrammaticName }
    }
  }
  $result | ConvertTo-Json -Depth 3; exit 0
}
