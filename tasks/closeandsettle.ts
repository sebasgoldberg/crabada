import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from "ethers";
import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as notify from 'sd-notify';
import { closeGame, currentBlockTimeStamp, getCrabadaContracts, locked, settleGame } from "../scripts/crabada";
import { delay, getSigner } from "./crabada";



const closeOrSettleTeam = async (hre: HardhatRuntimeEnvironment, signer: SignerWithAddress, teamId: BigNumber|number|string) => {

    const { idleGame } = getCrabadaContracts(hre)

    const { lockTo, currentGameId }: { lockTo: BigNumber, currentGameId: BigNumber } = await idleGame.getTeamInfo(teamId)

    if (currentGameId.isZero())
        return

    const timestamp = await currentBlockTimeStamp(hre)

    if (await locked(teamId, lockTo, timestamp))
        return

    const override = hre.crabada.network.getPriorityOverride()

    await closeGame(idleGame.connect(signer), currentGameId, override, 1);

    await settleGame(hre, idleGame.connect(signer), currentGameId, 1)

}

const closeOrSettleTeams = async (hre: HardhatRuntimeEnvironment, signer: SignerWithAddress, callAfter: () => void) => {

    for (const teamId in hre.crabada.network.MINE_CONFIG_BY_TEAM_ID){

        await closeOrSettleTeam(hre, signer, teamId)

        callAfter()

    }
}

task(
    "closeandsettle",
    "Execute the close and settle transactions for all teams.",
    async ({ }, 
        hre: HardhatRuntimeEnvironment) => {

        const signer = await getSigner(hre);

        while (true){

            notify.watchdog()

            await closeOrSettleTeams(hre, signer, () => { notify.watchdog() })

            await delay(2_000)

        }

    })
