#!/bin/bash
cd "$(dirname "$0")"
mkdir -p .cargo || exit 24
echo "[registries]" >> ./.cargo/config.toml
echo "miscellaneous-minds-pulse-repo = { index = 'https://dl.cloudsmith.io/basic/miscellaneous-minds/pulse-repo/cargo/index.git' }" >> ./.cargo/config.toml
echo "[registries.miscellaneous-minds-pulse-repo]" >> ./.cargo/credentials
echo "token = $RUST_REGISTRY_API_KEY" >> ./.cargo/credentials
ls -a
cargo publish --registry miscellaneous-minds-pulse-repo


[ 0 != 0 ] && exit 25

