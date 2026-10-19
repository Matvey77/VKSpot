# Windows helper

The packaged PowerShell helper uses the Windows UI Automation API. It can open
Spotify and inspect available controls without collecting playlist content.
Bulk insertion is intentionally unavailable until a real installed Spotify
build can be tested. No coordinate-based click sequence is claimed to work.

The planned C#/.NET + FlaUI adapter will replace this inspection helper when
the supported accessibility contract and test fixtures are established.
