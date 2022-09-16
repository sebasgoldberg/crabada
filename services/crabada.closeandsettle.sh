#!/bin/bash
. ~/.nvm/nvm.sh

if [ -z "$HARDHAT_NETWORK" ]
then 
    HARDHAT_NETWORK=swimmer
fi

npx hardhat closeandsettle --network "$HARDHAT_NETWORK"

