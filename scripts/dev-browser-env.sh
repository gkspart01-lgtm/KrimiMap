#!/usr/bin/env bash
# Provide Chromium's shared libraries without root.
#
# Playwright's `install-deps` needs a package manager with elevated rights. On a
# locked-down host the same packages can be downloaded and unpacked into a
# private prefix instead, which is enough for the browser to start.
#
#   eval "$(scripts/dev-browser-env.sh)"   # export the paths in this shell
#   npm run test:e2e
#
# Prints shell exports on stdout; progress and warnings go to stderr.

set -euo pipefail

prefix="${KRIMIMAP_BROWSER_DEPS:-$HOME/.cache/krimimap-browser-deps}"
debs="$prefix/debs"
root="$prefix/root"

log() {
	echo "$@" >&2
}

if ! command -v apt-get >/dev/null 2>&1; then
	log "apt-get not found: install the Chromium libraries with your package manager"
	exit 1
fi

mkdir -p "$debs" "$root"

if [ ! -f "$prefix/.complete" ]; then
	log "collecting Playwright's dependency list…"
	deps_file="$prefix/packages.txt"
	# `install-deps --dry-run` lists exactly what the browser needs on this distribution.
	npx --yes playwright install-deps --dry-run chromium 2>/dev/null |
		sed -n 's/^  \([a-z0-9][a-z0-9+.:-]*\)$/\1/p' | sort -u >"$deps_file" || true

	if [ ! -s "$deps_file" ]; then
		log "could not determine the dependency list; is Playwright installed?"
		exit 1
	fi

	log "downloading $(wc -l <"$deps_file") packages…"
	(
		cd "$debs"
		xargs -r -a "$deps_file" apt-get download 2>/dev/null || true
	)

	log "unpacking…"
	for file in "$debs"/*.deb; do
		[ -e "$file" ] || continue
		dpkg-deb -x "$file" "$root" 2>/dev/null || true
	done

	touch "$prefix/.complete"
fi

lib_dirs=(
	"$root/usr/lib/x86_64-linux-gnu"
	"$root/usr/lib"
	"$root/lib/x86_64-linux-gnu"
)
lib_path=$(IFS=:; echo "${lib_dirs[*]}")

echo "export LD_LIBRARY_PATH=\"$lib_path\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}\""
echo "export FONTCONFIG_PATH=\"$root/etc/fonts\""
echo "export XDG_DATA_DIRS=\"$root/usr/share:\${XDG_DATA_DIRS:-/usr/share}\""
