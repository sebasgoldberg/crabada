import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as notify from 'sd-notify';
import { areAllTeamsUnlocked, delay, getSigner } from "./crabada";
import { mineStep, MINE_ONLY_TO_LOOT } from "../scripts/crabada";


task(
    "minestep",
    "Executes startGame transactions for each team.",
    async ({ wait }: any, hre: HardhatRuntimeEnvironment) => {
        
        while (true){

            for (const mineGroup of hre.crabada.network.MINE_GROUPS){

                console.log('mineGroup.teamsOrder', ...mineGroup.teamsOrder);
                console.log('mineGroup.crabadaReinforcers', ...mineGroup.crabadaReinforcers);
    
                let previousTeam = undefined

                if (mineGroup.teamsOrder.length > 1){
                    const areAllGroupTeamsUnlocked = await areAllTeamsUnlocked(hre, mineGroup.teamsOrder)
                    if (!areAllGroupTeamsUnlocked)
                        previousTeam = mineGroup.teamsOrder[mineGroup.teamsOrder.length-1]
                }

                for (const teamId of mineGroup.teamsOrder){

                    const { signerIndex } = hre.crabada.network.MINE_CONFIG_BY_TEAM_ID[teamId]
                    const minerSigner = await getSigner(hre, undefined, signerIndex);

                    notify.watchdog()

                    await mineStep(hre, teamId, undefined, undefined, wait, minerSigner, MINE_ONLY_TO_LOOT ? undefined:previousTeam, mineGroup.teamsOrder, [])

                    previousTeam = teamId
                }
    
            }

            await delay(5_000)

            notify.watchdog()

        }

    })
    .addOptionalParam("wait", "Number of confirmation before continue execution.", 10, types.int)
