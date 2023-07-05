#!/bin/bash
cd "$(dirname "$0")"
if [[ ! -e ./.cargo/config.toml ]]; then
    mkdir -p .cargo
    touch ./.cargo/config.toml
fi
if [[ ! -e ./.cargo/credentials ]]; then
    touch ./.cargo/credentials
fi
echo "[registries]" >>./.cargo/config.toml
echo "miscellaneous-minds-pulse-repo = { index = 'https://dl.cloudsmith.io/basic/miscellaneous-minds/pulse-repo/cargo/index.git' }" >>./.cargo/config.toml
echo "[registries.miscellaneous-minds-pulse-repo]" >>./.cargo/credentials
echo "token = undefined" >>./.cargo/credentials
cargo publish --registry miscellaneous-minds-pulse-repo

[ $? != 0 ] && exit 25
