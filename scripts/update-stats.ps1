# Окно «вставил ссылки → Enter»: скачивает матчи, пересобирает статистику,
# коммитит и пушит. Запускается двойным кликом по update-stats.bat.
# Демки не ждём (--basic-if-pending): статистика берётся из лобби.
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "=== Обновление статистики CS2 ===" -ForegroundColor Cyan
Write-Host "Вставьте ссылки на матчи cybershoke (можно сразу несколько, построчно или через пробел)."
Write-Host "Когда закончите — нажмите Enter на пустой строке."
Write-Host ""

$lines = @()
while ($true) {
  $line = Read-Host ">"
  if ([string]::IsNullOrWhiteSpace($line)) {
    if ($lines.Count -gt 0) { break }
    continue
  }
  $lines += $line
}

$links = @(($lines -join " ") -split "[\s,]+" | Where-Object { $_ })
Write-Host ""
Write-Host "Принято ссылок: $($links.Count)" -ForegroundColor Cyan

$tmp = Join-Path $env:TEMP "cs2-stata-links.txt"
Set-Content -Path $tmp -Value $links -Encoding ASCII

& npm.cmd run add -- --basic-if-pending --file $tmp
$code = $LASTEXITCODE
Remove-Item $tmp -ErrorAction SilentlyContinue

Write-Host ""
if ($code -eq 0) {
  Write-Host "Готово. Если были новые матчи — сайт обновится через 1-2 минуты: https://msnka-smr.github.io/LLstat/" -ForegroundColor Green
} else {
  Write-Host "Что-то пошло не так (код $code) — смотрите сообщения выше." -ForegroundColor Red
  Write-Host "Если упало на связи с cybershoke — просто запустите ещё раз, уже скачанное не потеряется."
}
