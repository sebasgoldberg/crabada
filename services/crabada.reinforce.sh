#!/bin/bash
. /home/cerebro/.nvm/nvm.sh

if [ -z "$HARDHAT_NETWORK" ]
then 
    HARDHAT_NETWORK=localmainnet
fi

npx hardhat reinforce --network "$HARDHAT_NETWORK" --testmode false

