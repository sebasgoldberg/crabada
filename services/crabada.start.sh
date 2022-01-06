#!/bin/bash
. /home/cerebro/.nvm/nvm.sh
npx hardhat minestep --network mainnet --minerteamid 5355 --wait 7
npx hardhat minestep --network mainnet --minerteamid 5357 --wait 7
