Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RemoteName = "origin"
$BranchName = "main"

function New-Button {
  param(
    [string]$Text,
    [int]$X,
    [int]$Y,
    [int]$Width,
    [int]$Height
  )

  $button = New-Object System.Windows.Forms.Button
  $button.Text = $Text
  $button.Location = New-Object System.Drawing.Point($X, $Y)
  $button.Size = New-Object System.Drawing.Size($Width, $Height)
  $button.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
  return $button
}

function Write-Log {
  param([string]$Message)

  $time = Get-Date -Format "HH:mm:ss"
  $logBox.AppendText("[$time] $Message`r`n")
  $logBox.SelectionStart = $logBox.TextLength
  $logBox.ScrollToCaret()
  [System.Windows.Forms.Application]::DoEvents()
}

function Run-Git {
  param(
    [string[]]$ArgsList,
    [switch]$AllowFail
  )

  Write-Log ("> git " + ($ArgsList -join " "))
  $output = & git -C $ProjectRoot @ArgsList 2>&1
  $exitCode = $LASTEXITCODE

  foreach ($line in $output) {
    if ($null -ne $line -and "$line".Length -gt 0) {
      Write-Log "$line"
    }
  }

  if ($exitCode -ne 0 -and -not $AllowFail) {
    throw "Git command failed with exit code $exitCode"
  }

  return @{
    ExitCode = $exitCode
    Output = ($output -join "`n")
  }
}

function Get-WorktreeStatus {
  $status = & git -C $ProjectRoot status --porcelain 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Cannot read git status. Make sure this tool is inside the project folder."
  }
  return @($status)
}

function Set-Busy {
  param([bool]$Busy)

  $uploadButton.Enabled = -not $Busy
  $downloadButton.Enabled = -not $Busy
  $statusButton.Enabled = -not $Busy
  $openGitHubButton.Enabled = -not $Busy
  $openFolderButton.Enabled = -not $Busy
  [System.Windows.Forms.Application]::DoEvents()
}

function Show-Error {
  param([string]$Message)

  Write-Log "ERROR: $Message"
  [System.Windows.Forms.MessageBox]::Show($Message, "GitHub Backup Tool", "OK", "Error") | Out-Null
}

function Upload-Backup {
  Set-Busy $true
  try {
    Write-Log "Upload started."
    Run-Git -ArgsList @("status", "--short", "--branch") | Out-Null

    $status = Get-WorktreeStatus
    if ($status.Count -gt 0) {
      Run-Git -ArgsList @("add", "-A") | Out-Null
      $message = "Manual backup " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
      $commit = Run-Git -ArgsList @("commit", "-m", $message) -AllowFail
      if ($commit.ExitCode -ne 0) {
        Write-Log "No new commit was created."
      }
    } else {
      Write-Log "No local file changes. Push will still check remote status."
    }

    Run-Git -ArgsList @("pull", "--rebase", $RemoteName, $BranchName) | Out-Null
    Run-Git -ArgsList @("push", "-u", $RemoteName, $BranchName) | Out-Null
    Write-Log "Upload finished successfully."
    [System.Windows.Forms.MessageBox]::Show("Upload finished successfully.", "GitHub Backup Tool", "OK", "Information") | Out-Null
  } catch {
    Show-Error $_.Exception.Message
  } finally {
    Set-Busy $false
  }
}

function Download-Latest {
  Set-Busy $true
  try {
    Write-Log "Download started."
    Run-Git -ArgsList @("status", "--short", "--branch") | Out-Null

    $status = Get-WorktreeStatus
    if ($status.Count -gt 0) {
      $stashMessage = "Auto stash before download " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
      Run-Git -ArgsList @("stash", "push", "-u", "-m", $stashMessage) | Out-Null
      Write-Log "Local changes were saved in git stash before download."
    }

    Run-Git -ArgsList @("fetch", $RemoteName, $BranchName) | Out-Null
    Run-Git -ArgsList @("merge", "--ff-only", "$RemoteName/$BranchName") | Out-Null
    Write-Log "Download finished successfully."
    [System.Windows.Forms.MessageBox]::Show("Download finished successfully.", "GitHub Backup Tool", "OK", "Information") | Out-Null
  } catch {
    Show-Error $_.Exception.Message
  } finally {
    Set-Busy $false
  }
}

function Check-Status {
  Set-Busy $true
  try {
    Write-Log "Checking status."
    Run-Git -ArgsList @("status", "--short", "--branch") | Out-Null
    Run-Git -ArgsList @("remote", "-v") | Out-Null
  } catch {
    Show-Error $_.Exception.Message
  } finally {
    Set-Busy $false
  }
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "GitHub Backup Tool - Kuma Closet"
$form.StartPosition = "CenterScreen"
$form.Size = New-Object System.Drawing.Size(780, 560)
$form.MinimumSize = New-Object System.Drawing.Size(720, 500)

$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Text = "Kuma Closet GitHub Backup"
$titleLabel.Location = New-Object System.Drawing.Point(18, 16)
$titleLabel.Size = New-Object System.Drawing.Size(520, 28)
$titleLabel.Font = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($titleLabel)

$pathLabel = New-Object System.Windows.Forms.Label
$pathLabel.Text = $ProjectRoot
$pathLabel.Location = New-Object System.Drawing.Point(20, 48)
$pathLabel.Size = New-Object System.Drawing.Size(720, 22)
$pathLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$form.Controls.Add($pathLabel)

$uploadButton = New-Button -Text "Upload Backup" -X 20 -Y 86 -Width 160 -Height 46
$downloadButton = New-Button -Text "Download Latest" -X 196 -Y 86 -Width 170 -Height 46
$statusButton = New-Button -Text "Check Status" -X 382 -Y 86 -Width 140 -Height 46
$openGitHubButton = New-Button -Text "Open GitHub" -X 538 -Y 86 -Width 110 -Height 46
$openFolderButton = New-Button -Text "Open Folder" -X 662 -Y 86 -Width 95 -Height 46

$form.Controls.Add($uploadButton)
$form.Controls.Add($downloadButton)
$form.Controls.Add($statusButton)
$form.Controls.Add($openGitHubButton)
$form.Controls.Add($openFolderButton)

$hintLabel = New-Object System.Windows.Forms.Label
$hintLabel.Text = "Upload creates a commit and pushes to GitHub. Download stashes local changes first, then pulls GitHub latest."
$hintLabel.Location = New-Object System.Drawing.Point(20, 144)
$hintLabel.Size = New-Object System.Drawing.Size(720, 22)
$hintLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$form.Controls.Add($hintLabel)

$logBox = New-Object System.Windows.Forms.TextBox
$logBox.Location = New-Object System.Drawing.Point(20, 176)
$logBox.Size = New-Object System.Drawing.Size(738, 330)
$logBox.Anchor = "Top,Bottom,Left,Right"
$logBox.Multiline = $true
$logBox.ScrollBars = "Vertical"
$logBox.ReadOnly = $true
$logBox.Font = New-Object System.Drawing.Font("Consolas", 9)
$form.Controls.Add($logBox)

$uploadButton.Add_Click({ Upload-Backup })
$downloadButton.Add_Click({ Download-Latest })
$statusButton.Add_Click({ Check-Status })
$openGitHubButton.Add_Click({ Start-Process "https://github.com/Gaoruoheng/-" })
$openFolderButton.Add_Click({ Start-Process $ProjectRoot })

$form.Add_Shown({
  Write-Log "Tool ready."
  Write-Log "Project: $ProjectRoot"
  Check-Status
})

[System.Windows.Forms.Application]::EnableVisualStyles()
[System.Windows.Forms.Application]::Run($form)
