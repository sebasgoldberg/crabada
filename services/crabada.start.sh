#!/bin/bash
. /home/cerebro/.nvm/nvm.sh
. /home/cerebro/bin/export.main.a.pk.sh
npx hardhat mineloop --network mainnet --wait 15 --interval 15 --gasprice 25 --teamid 3286
