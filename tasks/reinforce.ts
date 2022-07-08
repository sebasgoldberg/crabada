import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as notify from 'sd-notify';
import { delay, getSigner } from "./crabada";
import { reinforce } from "../scripts/crabada";
import { CrabadaInTabern } from "../scripts/api";

task(
    "reinforce",
    "Reinforce process.",
    async ({ testmode }: any, hre: HardhatRuntimeEnvironment) => {

        while (true){

            notify.watchdog()

            const crabadasInTabernOrderByPrice: CrabadaInTabern[] = await hre.crabada.api.getCrabadasInTabernOrderByPrice()

            for (const {teams, signerIndex} of hre.crabada.network.LOOT_CAPTCHA_CONFIG.players){

                const signer = await getSigner(hre, undefined, signerIndex)

                console.log('Reinforce for signer', signer.address);

                for (const looterTeamId of teams){
        
                    console.log('Reinforce for team id', looterTeamId);

                    notify.watchdog()

                    const tr = await reinforce(hre, crabadasInTabernOrderByPrice, looterTeamId, signer, undefined, console.log, testmode);

                }

            }

            notify.watchdog()

            await delay(5_000)

        }

    })
    .addOptionalParam("testmode", "Test mode", true, types.boolean)
