#!/bin/bash
. /home/cerebro/.nvm/nvm.sh
npx hardhat minestep --network mainnet --minerteamid 3759 --attackercontract 0x019e96438ed58C7F18D799b7CC2006273F81318a --attackerteamid 3873 --wait 7
npx hardhat minestep --network mainnet --minerteamid 3286 --attackercontract 0x019e96438ed58C7F18D799b7CC2006273F81318a --attackerteamid 3873 --wait 7
