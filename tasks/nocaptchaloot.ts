import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { TeamFaction } from "../scripts/teambp";


import { DEBUG } from "../scripts/api";
import { connectToDatabase } from "../scripts/srv/database";
import { needsToContinueRunning, waitUntilNeedsToContinueRunning } from "../scripts/server/AttackServer";
import { PlayersManager } from "../scripts/server/PlayersManager";
import { AuthServer } from "../scripts/server/AuthServer";
import { LootFunction, lootLoop, PlayerTeamPair, Target } from "./captcha";
import { getTeamsThatPlayToLooseByTeamIdUsingDb } from "../scripts/strategy";
import axios from "axios";
import { AttackManager } from "../scripts/server/AttackExecutor";

const ONLY_ATTACK_TEAMS_THAT_PLAY_TO_LOOSE = false

const registerAttack = async (hre: HardhatRuntimeEnvironment, authServer: AuthServer, user_address, team_id, game_id) => {

    const token = authServer.getToken(user_address)

    if (!token){
        console.error('Token not found for address', user_address);
        return
    }

    DEBUG && console.log('PUT', `${hre.crabada.network.getIdleGameApiBaseUrl()}/public/idle/attack/${game_id}`);

    const attackResponse = await axios.put(`${hre.crabada.network.getIdleGameApiBaseUrl()}/public/idle/attack/${game_id}`, {
        team_id
    }, {
        headers: {
            authority: 'idle-game-api.crabada.com',
            'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="99", "Google Chrome";v="99"',
            'accept': 'application/json, text/plain, */*',
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
            'sec-ch-ua-mobile': '?0',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.51 Safari/537.36',
            'sec-ch-ua-platform': '"Windows"',
            origin: hre.crabada.network.getOrigin(),
            'sec-fetch-site': 'same-site',
            'sec-fetch-mode': 'cors',
            'sec-fetch-dest': 'empty',
            referer: hre.crabada.network.getReferer(),
            'accept-language': 'pt-BR,pt;q=0.9,es;q=0.8,en;q=0.7,de;q=0.6,en-US;q=0.5,he;q=0.4',
        }
    })

    return attackResponse

}


task(
    "nocaptchaloot",
    "Loot without captcha.",
    async ({ blockstoanalyze, firstdefendwindow, testmode }: any, hre: HardhatRuntimeEnvironment) => {

        await connectToDatabase()

        const playersManager = new PlayersManager(hre, testmode)
        await playersManager.initialize()

        const attackManager = new AttackManager(hre)
        await attackManager.beginUpdateInterval()

        const authServer = new AuthServer(hre)
        await authServer.start()

        if (!playersManager.hasLooters())
            return

        if (!(await needsToContinueRunning(hre))) {
            await waitUntilNeedsToContinueRunning(hre)
        }

        const teamsThatPlayToLooseByTeamId = await getTeamsThatPlayToLooseByTeamIdUsingDb(hre)

        let attackInprogress = false

        const hasToReadNextMineToLootPage = (): boolean => {

            if (attackInprogress)
                return false

            const playerTeamPairsSettled = playersManager.getSettledPlayers()

            if (playerTeamPairsSettled.length == 0)
                return false
    
            if (playerTeamPairsSettled
                .filter( ({ teamId }) => !attackManager.isTeamBusy(teamId) )
                .length == 0)
                return false
    
            const playerTeamPairsThatAddressRecentlyAttacked = playerTeamPairsSettled
                .filter( p => attackManager.hasAddressRecentlyAttacked(p.playerAddress))
    
            const hasAllTeamsAdressesRecentlyAttacked = playerTeamPairsSettled.length == playerTeamPairsThatAddressRecentlyAttacked.length
    
            return !hasAllTeamsAdressesRecentlyAttacked

        }

        const lootFunction: LootFunction = async (
            unlockedPlayerTeamPairsWithEnoughBattlePointSorted: PlayerTeamPair[],
            targets: Target[],
            targetsHaveAdvantage: boolean,
            lootersFaction: TeamFaction,
            testmode: boolean
        ) => {

            attackInprogress = true
        
            const targetsOrderByGameIdAscending = targets.sort((a, b) => b.gameId < a.gameId ? 1 : b.gameId > a.gameId ? -1 : 0)
        
            const teamIdsAlreadyUsed: number[] = []
        
            for (const t of targetsOrderByGameIdAscending) {
        
                if (ONLY_ATTACK_TEAMS_THAT_PLAY_TO_LOOSE && !teamsThatPlayToLooseByTeamId[Number(t.teamId)])
                    continue
        
                for (const p of unlockedPlayerTeamPairsWithEnoughBattlePointSorted) {
        
                    // Do not use same team for different targets.
                    if (teamIdsAlreadyUsed.includes(p.teamId))
                        continue
        
                    if (p.battlePoint.gt(t.battlePoint)) {
        
                        if (attackManager.hasAddressRecentlyAttacked(p.playerAddress))
                            continue
    
                        if (attackManager.isTeamBusy(p.teamId))
                            continue
    
                        try {

                            if (testmode){
                                console.log('registerAttack(hre, authServer, p.playerAddress, p.teamId, t.gameId)');
                                console.log(p.playerAddress, p.teamId, t.gameId);
                                break
                            }

                            const attackResponse = await registerAttack(hre, authServer, p.playerAddress, p.teamId, t.gameId)
            
                            console.log('SUCCESS trying to register attack');
                            console.log(attackResponse.data);
            
                            const { signature, expire_time } = attackResponse.data.result
            
                            attackManager.addAttackTransactionData({
                                user_address: p.playerAddress, 
                                game_id: t.gameId.toString(), 
                                team_id: String(p.teamId), 
                                expire_time, 
                                signature
                            })

                            // Do not use same target for different teams.
                            break

                        } catch (error) {
            
                            console.error('ERROR trying to register attack', error.response.data);
            
                        }        
        
                    }
        
                }
            }

            attackInprogress = false
        
        }

        await lootLoop(
            hre, hre.crabada.network.LOOT_CAPTCHA_CONFIG.players, blockstoanalyze, firstdefendwindow, testmode,
            lootFunction,

            async (): Promise<boolean> => { return await needsToContinueRunning(hre) },

            hasToReadNextMineToLootPage, playersManager)

        await waitUntilNeedsToContinueRunning(hre)

    })
    .addOptionalParam("blockstoanalyze", "Blocks to be analyzed.", 86400 /*48 hours*/, types.int)
    .addOptionalParam("firstdefendwindow", "First defend window (blocks to be skiped).", 900 /*30 minutes*/, types.int)
    .addOptionalParam("testmode", "Test mode", true, types.boolean)
