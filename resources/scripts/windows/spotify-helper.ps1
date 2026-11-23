param([ValidateSet('inspect')][string]$Action = 'inspect')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$processes = Get-Process -Name Spotify -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
if (-not $processes) { throw 'Открой приложение Spotify и повтори.' }
$window = [System.Windows.Automation.AutomationElement]::FromHandle($processes[0].MainWindowHandle)
if ($Action -eq 'inspect') {
  $controlType = [System.Windows.Automation.AutomationElement]::ControlTypeProperty
  $condition = [System.Windows.Automation.OrCondition]::new([System.Windows.Automation.Condition[]]@(
    [System.Windows.Automation.PropertyCondition]::new($controlType, [System.Windows.Automation.ControlType]::Button),
    [System.Windows.Automation.PropertyCondition]::new($controlType, [System.Windows.Automation.ControlType]::MenuItem),
    [System.Windows.Automation.PropertyCondition]::new($controlType, [System.Windows.Automation.ControlType]::TabItem)
  ))
  $elements = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
  $result = @(foreach ($element in $elements) {
    [pscustomobject]@{
      Name = $element.Current.Name
      AutomationId = $element.Current.AutomationId
      Type = $element.Current.ControlType.ProgrammaticName
    }
  })
  if ($result.Count -eq 0) {
    '[]'
  } else {
    ConvertTo-Json -InputObject $result -Depth 3
  }
  exit 0
}
