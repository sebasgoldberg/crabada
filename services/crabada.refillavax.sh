#!/bin/bash
. ~/.nvm/nvm.sh

if [ -z "$HARDHAT_NETWORK" ]
then 
    HARDHAT_NETWORK=swimmer
fi

npx hardhat refillavax --network "$HARDHAT_NETWORK"

