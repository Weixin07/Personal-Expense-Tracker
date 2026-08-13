#!/usr/bin/env bash
# Activates the vm-1 Node environment in the current shell: node_modules/.bin at
# the front of PATH, the .nvmrc Node version selected when fnm or nvm is
# installed, and a (vm-1) prompt prefix. Source it, do not execute it.
# vm1_deactivate restores the previous PATH and prompt.

if [ -n "$VM1_ROOT" ]; then
  return 0 2>/dev/null || exit 0
fi

VM1_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
export VM1_ROOT

VM1_ORIGINAL_PATH="$PATH"
VM1_ORIGINAL_PS1="$PS1"

vm1_pinned=""
if [ -f "$VM1_ROOT/.nvmrc" ]; then
  vm1_pinned="$(tr -d '[:space:]' <"$VM1_ROOT/.nvmrc" | sed 's/^v//')"
fi

if [ -n "$vm1_pinned" ]; then
  if command -v fnm >/dev/null 2>&1; then
    eval "$(fnm env)"
    fnm use --install-if-missing "$vm1_pinned" >/dev/null 2>&1
  elif command -v nvm >/dev/null 2>&1; then
    nvm use "$vm1_pinned" >/dev/null 2>&1
  fi
fi

export PATH="$VM1_ROOT/node_modules/.bin:$PATH"
PS1="(vm-1) $PS1"

vm1_deactivate() {
  PATH="$VM1_ORIGINAL_PATH"
  PS1="$VM1_ORIGINAL_PS1"
  export PATH
  unset VM1_ROOT
  unset -f vm1_deactivate
}

if ! command -v node >/dev/null 2>&1; then
  echo "vm-1: no node on PATH." >&2
elif [ -n "$vm1_pinned" ] && [ "$(node --version | sed 's/^v//')" != "$vm1_pinned" ]; then
  echo "vm-1: node $(node --version) is active, .nvmrc pins v$vm1_pinned. Install a version manager (winget install Schniz.fnm) to switch automatically." >&2
else
  echo "vm-1 active - node $(node --version)"
fi

unset vm1_pinned
