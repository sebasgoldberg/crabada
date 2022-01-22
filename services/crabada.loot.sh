#!/bin/bash
. /home/cerebro/.nvm/nvm.sh
if [ -z "$LOOTERS_TEAMS_BY_ACCOUNT" ]
then
    LOOTERS_TEAMS_BY_ACCOUNT='[[3286, 3759, 5032], [5355, 5357, 6152]]'
fi
npx hardhat loot --network localmainnet --lootersteamsbyaccount "$LOOTERS_TEAMS_BY_ACCOUNT" --testmode false

