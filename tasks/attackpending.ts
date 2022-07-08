import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { AttackExecutor } from "../scripts/server/AttackExecutor";
import { connectToDatabase } from "../scripts/srv/database";
import * as notify from 'sd-notify';
import { delay } from "./crabada";


task(
    "attackpending",
    "Execute the pending attack transactions.",
    async ({ }, 
        hre: HardhatRuntimeEnvironment) => {

        await connectToDatabase()
        
        const attackExecutor = new AttackExecutor(hre)

        while (true){

            await attackExecutor.attackPendingTransactions(() => { notify.watchdog() })

            await delay(2_000)

        }

    })
