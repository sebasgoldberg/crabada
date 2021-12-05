import { task } from "hardhat/config";
import { default as fetch } from 'node-fetch';
import { TransactionResponse } from "@ethersproject/abstract-provider";

import * as fs from "fs"
import { BigNumber } from "ethers";
import { formatUnits } from "ethers/lib/utils";
import { monitorEventLoopDelay } from "perf_hooks";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { mineStep } from "../scripts/crabada";
import { string } from "hardhat/internal/core/params/argumentTypes";
import { types } from "hardhat/config"

task(
    "minestep",
    "Mine step: If mining, try to close game. Then, if not mining, create a game.",
    async ({ teamid, gasprice, wait, testaccount }, hre: HardhatRuntimeEnvironment) => {
        
        let signer = undefined

        if (testaccount){
            await hre.ethers.provider.send('hardhat_impersonateAccount', [testaccount] );
            signer = await hre.ethers.provider.getSigner(testaccount)
        }

        try {
            await mineStep(hre, teamid, gasprice, wait, signer)
        } catch (error) {
            console.error(`ERROR: ${error.toString()}`)
        }

    })
    .addParam("teamid", "The team ID to use for mining.")
    .addOptionalParam("gasprice", "Gas price in gwei.", 25, types.int)
    .addOptionalParam("wait", "Number of confirmation before continue execution.", 10, types.int)
    .addOptionalParam("testaccount", "Account used for testing", undefined, types.string)

task(
    "mineloop",
    "Mine loop: Executes indefinetly the mine step, but stops in case of transaction rejection.",
    async ({ teamid, interval, gasprice, wait, testaccount }, hre: HardhatRuntimeEnvironment) => {
        
        let signer = undefined

        if (testaccount){
            await hre.ethers.provider.send('hardhat_impersonateAccount', [testaccount] );
            signer = await hre.ethers.provider.getSigner(testaccount)
        }

        return new Promise((resolve) => {

            const msInterval = interval*1000

            setTimeout(async function mineStepAndSchedule(){

                try {
                    await mineStep(hre, teamid, gasprice, wait, signer)
                    setTimeout(mineStepAndSchedule, msInterval)
                } catch (error) {
                    console.error(`ERROR: ${error.toString()}`)
                    resolve(undefined)
                }
        
            }, msInterval)
    
        })


    })
    .addParam("teamid", "The team ID to use for mining.")
    .addOptionalParam("interval", "Interval between mining steps in seconds.", 5, types.int)
    .addOptionalParam("gasprice", "Gas price in gwei.", 25, types.int)
    .addOptionalParam("wait", "Number of confirmation before continue execution.", 10, types.int)
    .addOptionalParam("testaccount", "Account used for testing", undefined, types.string)
