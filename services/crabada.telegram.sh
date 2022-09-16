#!/bin/bash
. ~/.nvm/nvm.sh

if [ -z "$HARDHAT_NETWORK" ]
then 
    HARDHAT_NETWORK=swimmer
fi

npx hardhat telegram --network "$HARDHAT_NETWORK"

