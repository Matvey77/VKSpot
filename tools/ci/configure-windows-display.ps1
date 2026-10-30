$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
if ($bounds.Width -lt 1920 -or $bounds.Height -lt 1080) {
  if (Get-Command Set-DisplayResolution -ErrorAction SilentlyContinue) {
    Set-DisplayResolution -Width 1920 -Height 1080 -Force
  } else {
    # Windows 11 ARM runners do not include the Windows Server display cmdlet.
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class VkspotDisplay {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DevMode {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string deviceName;
    public ushort specVersion, driverVersion, size, driverExtra;
    public uint fields;
    public int positionX, positionY;
    public uint displayOrientation, displayFixedOutput;
    public short color, duplex, yResolution, ttOption, collate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string formName;
    public ushort logPixels;
    public uint bitsPerPel, pelsWidth, pelsHeight, displayFlags, displayFrequency;
    public uint icmMethod, icmIntent, mediaType, ditherType, reserved1, reserved2, panningWidth, panningHeight;
  }

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  private static extern bool EnumDisplaySettings(string deviceName, int modeNum, ref DevMode mode);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  private static extern int ChangeDisplaySettings(ref DevMode mode, uint flags);

  public static int SetSize(uint width, uint height) {
    DevMode mode = new DevMode();
    mode.size = (ushort) Marshal.SizeOf(typeof(DevMode));
    if (!EnumDisplaySettings(null, -1, ref mode)) return -100;
    mode.pelsWidth = width;
    mode.pelsHeight = height;
    mode.fields = 0x00080000 | 0x00100000;
    return ChangeDisplaySettings(ref mode, 0);
  }
}
"@
    $result = [VkspotDisplay]::SetSize(1920, 1080)
    if ($result -ne 0) { throw "Could not set desktop resolution: $result" }
  }
}
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
Write-Output "Desktop: $($bounds.Width)x$($bounds.Height)"
if ($bounds.Width -lt 1920 -or $bounds.Height -lt 1080) {
  throw 'Electron desktop tests require a 1920x1080 display.'
}
