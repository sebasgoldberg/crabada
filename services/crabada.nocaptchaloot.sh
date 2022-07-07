#!/bin/bash
. /home/cerebro/.nvm/nvm.sh

if [ -z "$HARDHAT_NETWORK" ]
then 
    HARDHAT_NETWORK=swimmer
fi

npx hardhat nocaptchaloot --network "$HARDHAT_NETWORK" --testmode false

