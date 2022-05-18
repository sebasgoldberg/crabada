import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "console";
import { BigNumber, Contract, ethers } from "ethers";
import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { closeGame, currentBlockTimeStamp, getCrabadaContracts, getTeamsThatPlayToLooseByTeamId, isTeamLocked, settleGame, TeamInfoByTeam, updateTeamsThatWereChaged } from "../scripts/crabada";
import { ClassNameByCrabada, LOOTERS_FACTION, TeamBattlePoints, TeamFaction } from "../scripts/teambp";
import { getClassNameByCrabada, getSigner, isLootingPeriod } from "./crabada";


import { Player } from "../scripts/hre";
import { CanLootGameFromApi, DEBUG, listenCanLootGamesFromApi } from "../scripts/api";
import { connectToDatabase } from "../scripts/srv/database";
import { AttackServer } from "../scripts/server/AttackServer";

type LootFunction = (
    unlockedPlayerTeamPairsWithEnoughBattlePointSorted: PlayerTeamPair[],
    targets: Target[],
    targetsHaveAdvantage: boolean,
    lootersFaction: TeamFaction, 
    testmode: boolean
    ) => void

export interface PlayerTeamPair {
    playerAddress: string,
    teamId: number,
    locked: boolean,
    battlePoint: TeamBattlePoints,
    settled: boolean,
}

const initializePlayerTeamPair = async (hre: HardhatRuntimeEnvironment, players: Player[]): Promise<PlayerTeamPair[]> => {

    const { idleGame } = getCrabadaContracts(hre)

    const playerTeamPairs: PlayerTeamPair[] = await Promise.all(players
        .map( p => p.teams
            .map( async(teamId) => {
                const { currentGameId }: { currentGameId: BigNumber } = 
                    await idleGame.getTeamInfo(teamId)
                return ({
                    playerAddress: p.address,
                    teamId,
                    locked: true,
                    battlePoint: await TeamBattlePoints.createFromTeamIdUsingContractForClassNames(hre, teamId),
                    settled: currentGameId.isZero(),
                })
            })
        )
        .flat())
    return playerTeamPairs
}

const updateLockStatus = async (hre: HardhatRuntimeEnvironment, idleGame: Contract, playerTeamPairs: PlayerTeamPair[], testmode: boolean, log: (typeof console.log)) => {

    // TODO Restore off chain requests.

    const settledByTeamId = {}
    const lockedByTeamId = {}

    const timestamp = await currentBlockTimeStamp(hre)

    for (const { address } of hre.crabada.network.LOOT_CAPTCHA_CONFIG.players){
        const teams = await hre.crabada.api.getCompletedTeams(address)
        for (const team of teams){
            const game_end_time = team.game_type == "stealing" ? team.game_start_time+3600 : team.game_end_time
            lockedByTeamId[String(team.team_id)] = (game_end_time-timestamp >= 0)
            settledByTeamId[String(team.team_id)] = team.game_id ? false : true
        }
    }

    playerTeamPairs.map( (playerTeamPair) => {
        playerTeamPair.locked = !testmode && lockedByTeamId[String(playerTeamPair.teamId)]
        playerTeamPair.settled = testmode || settledByTeamId[String(playerTeamPair.teamId)]
    })

    return


    return (await Promise.all(
        playerTeamPairs.map( async(playerTeamPair): Promise<any> => {
            playerTeamPair.locked = !testmode && await isTeamLocked(hre, idleGame, playerTeamPair.teamId, log)
            const { currentGameId }: { currentGameId: BigNumber } = 
                await idleGame.getTeamInfo(playerTeamPair.teamId)
            playerTeamPair.settled = testmode || currentGameId.isZero()

        }) 
    ))


    // TODO Restore comented parallel processing
    for (const playerTeamPair of playerTeamPairs){
        playerTeamPair.locked = !testmode && await isTeamLocked(hre, idleGame, playerTeamPair.teamId, log)
        const { currentGameId }: { currentGameId: BigNumber } = 
            await idleGame.getTeamInfo(playerTeamPair.teamId)
        playerTeamPair.settled = testmode || currentGameId.isZero()
    }
    // return (await Promise.all(
    //     playerTeamPairs.map( async(playerTeamPair): Promise<any> => {
    //         playerTeamPair.locked = !testmode && await isTeamLocked(hre, idleGame, playerTeamPair.teamId, log)
    //         const { currentGameId }: { currentGameId: BigNumber } = 
    //             await idleGame.getTeamInfo(playerTeamPair.teamId)
    //         playerTeamPair.settled = testmode || currentGameId.isZero()

    //     }) 
    // ))
}

const settleGamesAndSetInterval = async (hre: HardhatRuntimeEnvironment, playerTeamPairs: PlayerTeamPair[], signer: SignerWithAddress, testmode: boolean): Promise<NodeJS.Timer|false> => {

    const { idleGame } = getCrabadaContracts(hre)

    let settleInProgress = false

    const settleGames = async(log: (typeof console.log) = ()=>{})=>{

        if (settleInProgress)
            return

        settleInProgress = true

        try {

            for (const p of playerTeamPairs.filter(p=> (!p.locked && !p.settled))){
                const { currentGameId } = await idleGame.getTeamInfo(BigNumber.from(p.teamId))
                await settleGame(hre, idleGame.connect(signer), currentGameId, 1, log)
                await closeGame(idleGame.connect(signer), currentGameId, hre.crabada.network.getAttackOverride(), 1, log)
            }
                
        } catch (error) {

            // To be possible to deactivate settleInProgress
            
        }

        settleInProgress = false

    }

    !testmode && (await settleGames(console.log))

    const settleGameInterval = !testmode && setInterval(() => settleGames(()=>{}), 20_000)

    return settleGameInterval
}

const areAllPlayerTeamPairsLocked = (playerTeamPairs: PlayerTeamPair[]): boolean => {
    return playerTeamPairs.map( ({ locked }) => locked ).every( locked => locked )
}

const getUpdateTeamBattlePointListener = (
    hre: HardhatRuntimeEnvironment, teamsThatPlayToLooseByTeamId: TeamInfoByTeam,
    classNameByCrabada: ClassNameByCrabada): ethers.providers.Listener => {

    const { idleGame } = getCrabadaContracts(hre)

    const updateTeamBattlePointListener = async (teamId: BigNumber)=>{
        if (!teamsThatPlayToLooseByTeamId[teamId.toString()])
            return
        const battlePoint: TeamBattlePoints = await TeamBattlePoints.createFromTeamId(idleGame, teamId, classNameByCrabada)
        console.log('Team', teamId.toString(), 'updated battlePoint, from', 
            teamsThatPlayToLooseByTeamId[teamId.toString()].battlePoint, 'to', battlePoint);
        teamsThatPlayToLooseByTeamId[teamId.toString()].battlePoint = battlePoint
    }

    return updateTeamBattlePointListener
    
}

interface StartGameTargets {
    teamId: BigNumber,
    attacksPerformed: number,
    gameId: BigNumber,
    created_at: number,
}

interface StartedGameTargetsByTeamId {
    [teamId:string]: StartGameTargets
}

let attackIteration = 0

interface TeamAndItsTransaction {
    teamId: BigNumber,
    txHash?: string,
    gameId: BigNumber,
    created_at: number,
}


const attackTeamsThatStartedAGame = (
    playerTeamPairs: PlayerTeamPair[], teamsThatPlayToLooseByTeamId: TeamInfoByTeam, 
    teamsAndTheirTransactions: TeamAndItsTransaction[], testmode: boolean, lootFunction: LootFunction) => {


    if (teamsAndTheirTransactions.length == 0){
        return
    }

    const startedGameTargetsByTeamId: StartedGameTargetsByTeamId = {}

    teamsAndTheirTransactions.forEach( ({ teamId, txHash, gameId, created_at }) => {

        const targetTeamInfo = teamsThatPlayToLooseByTeamId[teamId.toString()]

        if (!targetTeamInfo){
            return
        }

        if (!targetTeamInfo.battlePoint){
            return
        }

        if (!targetTeamInfo.battlePoint.isValid()){
            return
        }

        const pairsStrongerThanTarget = playerTeamPairs.filter( p => p.battlePoint.gt(targetTeamInfo.battlePoint))

        if (pairsStrongerThanTarget.length == 0){
            return
        }

        startedGameTargetsByTeamId[teamId.toString()] = {
            teamId,
            attacksPerformed: 0,
            gameId,
            created_at
        }

        console.log('Pending startGame', txHash, 
            'Added team to loot targets', teamId.toNumber()
        );

    })

    interface TargetsFactionAdvantageClassification { 
        targetsWithAdvantageByTeamId: StartedGameTargetsByTeamId, 
        targetsWithNoAdvantageByTeamId: StartedGameTargetsByTeamId
    }

    const classifyTargetsUsingFactionAdvantage = 
        (startedGameTargetsByTeamId: StartedGameTargetsByTeamId, lootersFaction: TeamFaction): TargetsFactionAdvantageClassification => {

            const targetsWithAdvantageByTeamId: StartedGameTargetsByTeamId = {}
            const targetsWithNoAdvantageByTeamId: StartedGameTargetsByTeamId = {}
            
            for (const teamId in startedGameTargetsByTeamId){
                const startedGameTargetByTeamId = startedGameTargetsByTeamId[teamId]
                
                const targetInfo = teamsThatPlayToLooseByTeamId[teamId]

                // This is necessary because teamsThatPlayToLooseByTeamId could be updated.
                if (!targetInfo){
                    continue
                }

                // This is necessary because teamsThatPlayToLooseByTeamId could be updated.
                if (!targetInfo.battlePoint){
                    continue
                }

                // This is necessary because teamsThatPlayToLooseByTeamId could be updated.
                if (targetInfo.battlePoint.hasAdvantageOverFaction(lootersFaction)){
                    targetsWithAdvantageByTeamId[teamId] = startedGameTargetByTeamId
                } else {
                    targetsWithNoAdvantageByTeamId[teamId] = startedGameTargetByTeamId
                }

            }

            return { 
                targetsWithAdvantageByTeamId,
                targetsWithNoAdvantageByTeamId
            }

        }

    // TODO Remove classification.
    const { targetsWithAdvantageByTeamId, targetsWithNoAdvantageByTeamId } = classifyTargetsUsingFactionAdvantage(
        startedGameTargetsByTeamId, LOOTERS_FACTION
    )
    
    attackTeams(playerTeamPairs, targetsWithAdvantageByTeamId, teamsThatPlayToLooseByTeamId, true, LOOTERS_FACTION, testmode, lootFunction)
    attackTeams(playerTeamPairs, targetsWithNoAdvantageByTeamId, teamsThatPlayToLooseByTeamId, true, LOOTERS_FACTION, testmode, lootFunction)

}

export type Target = StartGameTargets & {battlePoint: TeamBattlePoints}

// Main interval to perform attacks considering the following conditions:
// 1) Apply only for looter teams are unlocked
// 2) Targets should have battlePoint lower than the maximum looterTeam target battlePoint.
// 3) For targets currentBlockNumber-closeGameBlockNumber >= minBlocknumberDistance-2
// 4) Apply only for looter teams that have battlePoint higher than minimum target battlePoint.

const attackTeams = async (
    playerTeamPairs: PlayerTeamPair[], startedGameTargetsByTeamId: StartedGameTargetsByTeamId, 
    teamsThatPlayToLooseByTeamId: TeamInfoByTeam, targetsHaveAdvantage: boolean,
    lootersFaction: TeamFaction, testmode: boolean, lootFunction: LootFunction) => {

    // 1) Apply only for looter teams are unlocked
    const unlockedPlayerTeamPairs = playerTeamPairs.filter( p => (!p.locked && p.settled) || testmode )

    if (unlockedPlayerTeamPairs.length == 0){
        console.log('Attack Interval', 'No unlocked and settled looter teams');
        return
    }

    assert(
        unlockedPlayerTeamPairs.every(p=>p.battlePoint.teamFaction == lootersFaction),
        `ERROR: Not satisfied precondition where all looter teams have the same faction: ${lootersFaction}`
    )

    // Get the max battlePoint for unlocked looter teams.

    const maxUnlockedLooterBattlePoint: TeamBattlePoints = unlockedPlayerTeamPairs
        .reduce((previous, current) => 
            previous.gt(current.battlePoint) ? previous : current.battlePoint,
        unlockedPlayerTeamPairs[0].battlePoint)

    const targets: Target[] = Object.keys(startedGameTargetsByTeamId)
        // 2) Targets should have battlePoint lower than the maximum looterTeam target battlePoint.
        .filter(teamId => {

            const targetInfo = teamsThatPlayToLooseByTeamId[teamId]

            // This is necessary because teamsThatPlayToLooseByTeamId could be updated.
            if (!targetInfo){
                return false
            }

            // This is necessary because teamsThatPlayToLooseByTeamId could be updated.
            if (!targetInfo.battlePoint){
                return false
            }
            
            if (targetInfo.battlePoint.gte(maxUnlockedLooterBattlePoint)){
                return false
            }
            
            return true
        })
        .map( teamId => ({ ...startedGameTargetsByTeamId[teamId], battlePoint: teamsThatPlayToLooseByTeamId[teamId].battlePoint }) )


    if (targets.length == 0){
        return
    }

    const targetsBattlePoints = targets.map( ({ battlePoint }) => battlePoint )
    const minTargetBattlePoint: TeamBattlePoints = 
        targetsBattlePoints
        .reduce((previous, current) => 
            previous.getRelativeBP(lootersFaction) < current.getRelativeBP(lootersFaction) ? previous : current,
            targetsBattlePoints[0]
        )

    // 4) Apply only for looter teams that have battlePoint higher than minimum target battlePoint.
    const unlockedPlayerTeamPairsWithEnoughBattlePoint =
        unlockedPlayerTeamPairs.filter( p => p.battlePoint.gt(minTargetBattlePoint) )

    if (unlockedPlayerTeamPairsWithEnoughBattlePoint.length == 0){
        console.log('Attack Interval', 'No unlocked and settled looter teams with enough battle points', 
            unlockedPlayerTeamPairs.map( p => p.battlePoint), '<=', minTargetBattlePoint)
        return
    }

    const unlockedPlayerTeamPairsWithEnoughBattlePointSorted =
        unlockedPlayerTeamPairsWithEnoughBattlePoint.sort( (a,b) => 
            a.battlePoint.lt(b.battlePoint) ? -1 : a.battlePoint.gt(b.battlePoint) ? 1 : 0
        )

    try {

        lootFunction(
            unlockedPlayerTeamPairsWithEnoughBattlePointSorted,
            targets,
            targetsHaveAdvantage,
            lootersFaction, 
            testmode
            )
    
    } catch (error) {

        console.error('ERROR', 'router.attackTeams', String(error));
        
    }

}

type HasToReadNextPageFunction = (playerTeamPairs: PlayerTeamPair[]) => boolean

const lootLoop = async (
    hre: HardhatRuntimeEnvironment, looters: Player[], 
    blockstoanalyze: number, firstdefendwindow: number, testmode: boolean,
    lootFunction: LootFunction, needsToContinueRunning: () => Promise<boolean>,
    hasToReadNextMineToLootPage: HasToReadNextPageFunction) => {

    // const updateGasPrice = updateGasPriceFunction(hre)
    // const gasPriceUpdateInterval = setInterval(updateGasPrice, 10_000)
    // await updateGasPrice()

    // signer used to settle
    const settleSigner = await getSigner(hre)

    const { idleGame } = getCrabadaContracts(hre)

    const lootersTeams = looters.map( p => p.teams ).flat()

    if (lootersTeams.length == 0)
        return

    // Initialize Player/Team data structure

    const playerTeamPairs: PlayerTeamPair[] = await initializePlayerTeamPair(hre, looters)
    
    // Initialize teams' lock status

    await updateLockStatus(hre, idleGame, playerTeamPairs, testmode, console.log)

    // Sets interval to settleGame for unlocked teams.
    
    const settleGameInterval = await settleGamesAndSetInterval(hre, playerTeamPairs, settleSigner, testmode)


    // TODO Verify if applies.
    // if ( !testmode && (areAllPlayerTeamPairsLocked(playerTeamPairs)) )
    //     return

    
    const classNameByCrabada: ClassNameByCrabada = hre.crabada.network.LOOT_CAPTCHA_CONFIG.attackOnlyTeamsThatPlayToLoose ? 
        await getClassNameByCrabada(hre) : {}
    
    // Teams that play to loose...

    const teamsThatPlayToLooseByTeamId = await (
        hre.crabada.network.LOOT_CAPTCHA_CONFIG.attackOnlyTeamsThatPlayToLoose ? 
            getTeamsThatPlayToLooseByTeamId(hre, blockstoanalyze, firstdefendwindow, classNameByCrabada)
            //: getTeamsBattlePoint(hre, blockstoanalyze, classNameByCrabada)
            : {}
    )

    console.log('teamsThatPlayToLooseByTeamId', Object.keys(teamsThatPlayToLooseByTeamId).length);

    // Update teams thar were changed and set interval to update regularly...

    if (hre.crabada.network.LOOT_CAPTCHA_CONFIG.attackOnlyTeamsThatPlayToLoose){
        await updateTeamsThatWereChaged(hre, teamsThatPlayToLooseByTeamId, classNameByCrabada, blockstoanalyze)
    }

    const updateTeamBattlePointListener = hre.crabada.network.LOOT_CAPTCHA_CONFIG.attackOnlyTeamsThatPlayToLoose ?
        getUpdateTeamBattlePointListener(hre, teamsThatPlayToLooseByTeamId, classNameByCrabada)
        : undefined

    updateTeamBattlePointListener && idleGame.on(
        idleGame.filters.AddCrabada(), 
        updateTeamBattlePointListener
    )

    // Set interval for updating teams' lock status.

    const updateLockStatusInterval = setInterval(() => updateLockStatus(hre, idleGame, playerTeamPairs, testmode, ()=>{}), 5_000);

    // Listen pending startGame transactions or StartGame events.


    // const addTeamToLootTargets = (txs: ethers.Transaction[]) => {

    //     if (txs.length == 0){
    //         return
    //     }

    //     const teamsAndTheirTransactions: TeamAndItsTransaction[] = txs.map( tx => {

    //         const teamId = BigNumber.from(`0x${tx.data.slice(-64)}`)
    //         console.log('Pending start game transaction', tx.hash, (tx as any).blockNumber, teamId.toString());

    //         return { teamId, txHash: tx.hash }

    //     })

    //     attackTeamsThatStartedAGame(teamsAndTheirTransactions)

    // }

    // const pendingStartGameTransactionInterval = await listenPendingStartGameTransaction(hre, addTeamToLootTargets)


    // const startGameEventsInterval = await listenStartGameEvents(hre, logs => {

    //     const teamsAndTheirTransaction: TeamAndItsTransaction[] = logs.map( ({teamId, gameId, log: {transactionHash, blockNumber}}) => {

    //         console.log('start game event', transactionHash, blockNumber, teamId.toString());

    //         return {
    //             teamId,
    //             txHash: transactionHash,
    //             gameId
    //         }
    //     })

    //     attackTeamsThatStartedAGame(playerTeamPairs, teamsThatPlayToLooseByTeamId, teamsAndTheirTransaction, testmode, lootFunction)

    // }, 50)

    const listenCanLootGamesFromApiInterval = await listenCanLootGamesFromApi(hre, (canLootGamesFromApi: CanLootGameFromApi[]) => {

        const teamsAndTheirTransaction: TeamAndItsTransaction[] = canLootGamesFromApi
            // Latest have the priority
            .sort(({start_time: a}, { start_time: b}) => a < b ? 1 : a > b ? -1 : 0)
            .map(({game_id, team_id, created_at})=>({
                gameId: BigNumber.from(game_id), 
                teamId: BigNumber.from(team_id),
                created_at
            }))

        if (!hre.crabada.network.LOOT_CAPTCHA_CONFIG.attackOnlyTeamsThatPlayToLoose){
            canLootGamesFromApi.forEach( ({faction, team_id, defense_point}) => {
                teamsThatPlayToLooseByTeamId[String(team_id)] = {
                    battlePoint: new TeamBattlePoints(faction, defense_point)
                }
            })    
        }
            
        attackTeamsThatStartedAGame(playerTeamPairs, teamsThatPlayToLooseByTeamId, teamsAndTheirTransaction, testmode, lootFunction)

    }, () => {

        const unlockedPlayerTeamPairs = playerTeamPairs
            .filter( p => (!p.locked && p.settled) || testmode )

        return hasToReadNextMineToLootPage(playerTeamPairs) && unlockedPlayerTeamPairs.length > 0

    }, 500)

    // Never finish
    await new Promise((resolve) => {

        const checkContinueRunningInterval = setInterval(async () => {
            try {
                if (await needsToContinueRunning())
                    return
                console.log('No need to continue running.');
                clearInterval(checkContinueRunningInterval)
                resolve(undefined)
            } catch (error) {
                console.error('Error when trying to verify if needed to continue running:', String(error))
            }
        }, 60_000)

        // TODO Verify if applies.
        // const endProcessInterval = setInterval(()=>{

        //     const unlockedPlayerTeamPairs = playerTeamPairs.filter( p => !p.locked || testmode )

        //     if (unlockedPlayerTeamPairs.length == 0){
        //         console.log('Ending process', 'No unlocked looter teams');
        //         clearInterval(endProcessInterval)
        //         resolve(undefined)
        //     }

        // }, 1000)

    })

    // clearInterval(gasPriceUpdateInterval)
    //clearInterval(attackTeamsInterval)
    // clearInterval(pendingStartGameTransactionInterval)
    // clearInterval(startGameEventsInterval)
    clearInterval(listenCanLootGamesFromApiInterval)
    updateTeamBattlePointListener && idleGame.off(idleGame.filters.AddCrabada(), updateTeamBattlePointListener)
    clearInterval(updateLockStatusInterval)
    settleGameInterval && clearInterval(settleGameInterval)

}

const existsAnyTeamSettled = (playerTeamPairs: PlayerTeamPair[], testmode: boolean): boolean => {
    return (playerTeamPairs.filter( p => p.settled || testmode ).length == 0)
}


export const getSignerForAddress = (signers: SignerWithAddress[], user_address: string) => {
    const signer = signers.filter( s => s.address.toLowerCase() == user_address.toLowerCase())
    if (signer.length == 0)
        throw new Error(`Signer not found for address ${user_address}`)
    return signer[0]
}


task(
    "captchaloot",
    "Loot using captcha.",
    async ({ blockstoanalyze, firstdefendwindow, testmode }, hre: HardhatRuntimeEnvironment) => {

        if (!isLootingPeriod()){
            console.log('Mining period.');
            return
        }

        await connectToDatabase()

        const attackServer = new AttackServer(hre)

        await attackServer.initialize()

        if (!(await attackServer.needsToContinueRunning())){
            await attackServer.waitUntilNeedsToContinueRunning()
        }

        const returnCaptchaData: LootFunction = (
            unlockedPlayerTeamPairsWithEnoughBattlePointSorted: PlayerTeamPair[],
            targets: Target[],
            targetsHaveAdvantage: boolean,
            lootersFaction: TeamFaction, 
            testmode: boolean
            ) => {

            attackServer.returnCaptchaData(unlockedPlayerTeamPairsWithEnoughBattlePointSorted, targets)

        }

        const hasToReadNextMineToLootPage = (playerTeamPairs: PlayerTeamPair[]): boolean => {

            if (playerTeamPairs
                .filter( ({ teamId }) => !attackServer.attackExecutor.hasTeamPendingAttack(teamId) )
                .length == 0)
                return false

            const playerTeamPairsSettled = playerTeamPairs
                .filter( p => p.settled)

            const playerTeamPairsThatRecentlyAttacked = playerTeamPairsSettled
                .filter( p => attackServer.attackExecutor.hasAddressRecentlyAttacked(p.playerAddress))

            const allTeamsRecentlyAttacked = playerTeamPairsSettled.length == playerTeamPairsThatRecentlyAttacked.length

            return attackServer.hasPendingCaptchaResponses() && !allTeamsRecentlyAttacked
        }

        await lootLoop(
            hre, hre.crabada.network.LOOT_CAPTCHA_CONFIG.players, blockstoanalyze, firstdefendwindow, testmode, 
            returnCaptchaData,
            async (): Promise<boolean> => { return await attackServer.needsToContinueRunning() },
            hasToReadNextMineToLootPage)

        await attackServer.waitUntilNeedsToContinueRunning()

    })
    .addOptionalParam("blockstoanalyze", "Blocks to be analyzed.", 86400 /*48 hours*/ , types.int)
    .addOptionalParam("firstdefendwindow", "First defend window (blocks to be skiped).", 900 /*30 minutes*/, types.int)
    .addOptionalParam("testmode", "Test mode", true, types.boolean)
