#!/bin/bash
. /home/cerebro/.nvm/nvm.sh

if [ -z "$HARDHAT_NETWORK" ]
then 
    HARDHAT_NETWORK=localmainnet
fi

npx hardhat minestep --network "$HARDHAT_NETWORK" --wait 5

