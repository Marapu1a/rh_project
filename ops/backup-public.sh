#!/bin/bash
# Offline, root-only snapshot. Never remove locks or automatically restore state.
set -euo pipefail
umask 077
exec 9>/run/lock/qianqi-public-backup.lock
flock -n 9
units=(qianqi-public-automation.service qianqi-public-indexer.service)
active=()
for unit in "${units[@]}"; do
  if systemctl is-active --quiet "$unit"; then active+=("$unit"); fi
done
systemctl stop "${units[@]}"
for unit in "${units[@]}"; do
  test "$(systemctl show "$unit" -p MainPID --value)" = 0
done
target="/var/backups/qianqi-public/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p /var/backups/qianqi-public
release="$(systemctl show qianqi-public-automation.service -p WorkingDirectory --value)"
test -n "$release"
node "$release/scripts/ops-backup.cjs" backup /var/lib/qianqi-public "$target"
# Config contains public deployment facts only. RPC and custody live separately.
cp -a /etc/qianqi/public "$target/config"
cp "$release/release.json" "$target/release.json"
sha256sum "$target/release.json" > "$target/release.sha256"
# Workers may run different releases after an isolated deployment.
mkdir "$target/runtimes"
for unit in "${units[@]}"; do
  directory="$(systemctl show "$unit" -p WorkingDirectory --value)"
  test -n "$directory"
  cp "$directory/release.json" "$target/runtimes/$unit.release.json"
  printf '%s\n' "$directory" > "$target/runtimes/$unit.directory.txt"
done
# Publish a complete immutable transfer archive; pullers ignore incomplete files.
tar -czf "$target.tar.gz.tmp" -C "$(dirname "$target")" "$(basename "$target")"
mv "$target.tar.gz.tmp" "$target.tar.gz"
(cd "$(dirname "$target")"; sha256sum "$(basename "$target").tar.gz") > "$target.sha256.tmp"
mv "$target.sha256.tmp" "$target.sha256"
# Restart only previously active services after a successful snapshot.
for ((i=${#active[@]}-1; i>=0; i--)); do systemctl start "${active[i]}"; done
echo "Backup complete: $target. Export off-server separately."
