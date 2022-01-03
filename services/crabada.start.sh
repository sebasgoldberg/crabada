#!/bin/bash
. /home/cerebro/.nvm/nvm.sh
npx hardhat minestep --network mainnet --minerteamid 3759 --attackercontract 0x39A9551C9683d9955ADA8f91438eB18CEd8DbFcd --attackerteamid 4400 --wait 7
npx hardhat minestep --network mainnet --minerteamid 3286 --attackercontract 0x39A9551C9683d9955ADA8f91438eB18CEd8DbFcd --attackerteamid 4400 --wait 7
npx hardhat minestep --network mainnet --minerteamid 5032 --attackercontract 0x39A9551C9683d9955ADA8f91438eB18CEd8DbFcd --attackerteamid 4400 --wait 7
