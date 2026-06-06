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
  $button.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 10, [System.Drawing.FontStyle]::Bold)
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
    throw "Git 命令执行失败，退出码：$exitCode"
  }

  return @{
    ExitCode = $exitCode
    Output = ($output -join "`n")
  }
}

function Get-WorktreeStatus {
  $status = & git -C $ProjectRoot status --porcelain 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "无法读取 Git 状态，请确认这个工具位于项目文件夹内。"
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

  Write-Log "错误：$Message"
  [System.Windows.Forms.MessageBox]::Show($Message, "GitHub 备份工具", "OK", "Error") | Out-Null
}

function Upload-Backup {
  Set-Busy $true
  try {
    Write-Log "开始上传备份。"
    Run-Git -ArgsList @("status", "--short", "--branch") | Out-Null

    $status = Get-WorktreeStatus
    if ($status.Count -gt 0) {
      Run-Git -ArgsList @("add", "-A") | Out-Null
      $message = "手动备份 " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
      $commit = Run-Git -ArgsList @("commit", "-m", $message) -AllowFail
      if ($commit.ExitCode -ne 0) {
        Write-Log "没有生成新的提交，可能没有可提交的变更。"
      }
    } else {
      Write-Log "没有本地文件变更，仍会检查远程仓库状态。"
    }

    Run-Git -ArgsList @("pull", "--rebase", $RemoteName, $BranchName) | Out-Null
    Run-Git -ArgsList @("push", "-u", $RemoteName, $BranchName) | Out-Null
    Write-Log "上传备份完成。"
    [System.Windows.Forms.MessageBox]::Show("上传备份完成。", "GitHub 备份工具", "OK", "Information") | Out-Null
  } catch {
    Show-Error $_.Exception.Message
  } finally {
    Set-Busy $false
  }
}

function Download-Latest {
  Set-Busy $true
  try {
    Write-Log "开始下载最新代码。"
    Run-Git -ArgsList @("status", "--short", "--branch") | Out-Null

    $status = Get-WorktreeStatus
    if ($status.Count -gt 0) {
      $stashMessage = "下载前自动暂存 " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
      Run-Git -ArgsList @("stash", "push", "-u", "-m", $stashMessage) | Out-Null
      Write-Log "检测到本地未提交改动，已先保存到 Git stash。"
    }

    Run-Git -ArgsList @("fetch", $RemoteName, $BranchName) | Out-Null
    Run-Git -ArgsList @("merge", "--ff-only", "$RemoteName/$BranchName") | Out-Null
    Write-Log "下载最新代码完成。"
    [System.Windows.Forms.MessageBox]::Show("下载最新代码完成。", "GitHub 备份工具", "OK", "Information") | Out-Null
  } catch {
    Show-Error $_.Exception.Message
  } finally {
    Set-Busy $false
  }
}

function Check-Status {
  Set-Busy $true
  try {
    Write-Log "正在检查状态。"
    Run-Git -ArgsList @("status", "--short", "--branch") | Out-Null
    Run-Git -ArgsList @("remote", "-v") | Out-Null
  } catch {
    Show-Error $_.Exception.Message
  } finally {
    Set-Busy $false
  }
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "GitHub 备份工具 - Kuma Closet"
$form.StartPosition = "CenterScreen"
$form.Size = New-Object System.Drawing.Size(780, 560)
$form.MinimumSize = New-Object System.Drawing.Size(720, 500)

$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Text = "Kuma Closet GitHub 备份"
$titleLabel.Location = New-Object System.Drawing.Point(18, 16)
$titleLabel.Size = New-Object System.Drawing.Size(520, 28)
$titleLabel.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 14, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($titleLabel)

$pathLabel = New-Object System.Windows.Forms.Label
$pathLabel.Text = $ProjectRoot
$pathLabel.Location = New-Object System.Drawing.Point(20, 48)
$pathLabel.Size = New-Object System.Drawing.Size(720, 22)
$pathLabel.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 9)
$form.Controls.Add($pathLabel)

$uploadButton = New-Button -Text "上传备份" -X 20 -Y 86 -Width 160 -Height 46
$downloadButton = New-Button -Text "下载最新" -X 196 -Y 86 -Width 170 -Height 46
$statusButton = New-Button -Text "检查状态" -X 382 -Y 86 -Width 140 -Height 46
$openGitHubButton = New-Button -Text "打开 GitHub" -X 538 -Y 86 -Width 110 -Height 46
$openFolderButton = New-Button -Text "打开文件夹" -X 662 -Y 86 -Width 95 -Height 46

$form.Controls.Add($uploadButton)
$form.Controls.Add($downloadButton)
$form.Controls.Add($statusButton)
$form.Controls.Add($openGitHubButton)
$form.Controls.Add($openFolderButton)

$hintLabel = New-Object System.Windows.Forms.Label
$hintLabel.Text = "上传备份会自动提交并推送到 GitHub；下载最新会先保存本地未提交改动，再拉取 GitHub 最新代码。"
$hintLabel.Location = New-Object System.Drawing.Point(20, 144)
$hintLabel.Size = New-Object System.Drawing.Size(720, 22)
$hintLabel.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 9)
$form.Controls.Add($hintLabel)

$logBox = New-Object System.Windows.Forms.TextBox
$logBox.Location = New-Object System.Drawing.Point(20, 176)
$logBox.Size = New-Object System.Drawing.Size(738, 330)
$logBox.Anchor = "Top,Bottom,Left,Right"
$logBox.Multiline = $true
$logBox.ScrollBars = "Vertical"
$logBox.ReadOnly = $true
$logBox.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 9)
$form.Controls.Add($logBox)

$uploadButton.Add_Click({ Upload-Backup })
$downloadButton.Add_Click({ Download-Latest })
$statusButton.Add_Click({ Check-Status })
$openGitHubButton.Add_Click({ Start-Process "https://github.com/Gaoruoheng/-" })
$openFolderButton.Add_Click({ Start-Process $ProjectRoot })

$form.Add_Shown({
  Write-Log "工具已准备好。"
  Write-Log "项目路径：$ProjectRoot"
  Check-Status
})

[System.Windows.Forms.Application]::EnableVisualStyles()
[System.Windows.Forms.Application]::Run($form)
