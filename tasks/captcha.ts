import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "console";
import { BigNumber, Contract, ethers } from "ethers";
import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getCrabadaContracts, getTeamsThatPlayToLooseByTeamId, isTeamLocked, settleGame, TeamInfoByTeam, updateTeamsThatWereChaged } from "../scripts/crabada";
import { ClassNameByCrabada, LOOTERS_FACTION, TeamBattlePoints, TeamFaction } from "../scripts/teambp";
import { getClassNameByCrabada, getSigner, listenStartGameEvents } from "./crabada";

import * as express from "express"
import axios from "axios";

interface Player {
    address: string,
    teams: number[],
    signerIndex: number
}

interface LootCaptchaConfig {
    players: Player[],
}

type LootFunction = (
    unlockedPlayerTeamPairsWithEnoughBattlePointSorted: PlayerTeamPair[],
    targets: Target[],
    targetsHaveAdvantage: boolean,
    lootersFaction: TeamFaction, 
    testmode: boolean
    ) => void

interface PlayerTeamPair {
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
    return (await Promise.all(
        playerTeamPairs.map( async(playerTeamPair): Promise<any> => {
            playerTeamPair.locked = !testmode && await isTeamLocked(hre, idleGame, playerTeamPair.teamId, log)
            const { currentGameId }: { currentGameId: BigNumber } = 
                await idleGame.getTeamInfo(playerTeamPair.teamId)
            playerTeamPair.settled = testmode || currentGameId.isZero()

        }) 
    ))
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
                await settleGame(idleGame.connect(signer), currentGameId, 1, log)
            }
                
        } catch (error) {

            // To be possible to deactivate settleInProgress
            
        }

        settleInProgress = false

    }

    !testmode && (await settleGames(console.log))

    const settleGameInterval = !testmode && setInterval(() => settleGames(()=>{}), 2000)

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
}

interface StartedGameTargetsByTeamId {
    [teamId:string]: StartGameTargets
}

let attackIteration = 0

interface TeamAndItsTransaction {
    teamId: BigNumber,
    txHash: string,
    gameId: BigNumber,
}


const attackTeamsThatStartedAGame = (
    playerTeamPairs: PlayerTeamPair[], teamsThatPlayToLooseByTeamId: TeamInfoByTeam, 
    teamsAndTheirTransactions: TeamAndItsTransaction[], testmode: boolean, lootFunction: LootFunction) => {


    if (teamsAndTheirTransactions.length == 0){
        return
    }

    const startedGameTargetsByTeamId: StartedGameTargetsByTeamId = {}

    teamsAndTheirTransactions.forEach( ({ teamId, txHash, gameId }) => {

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

type Target = StartGameTargets & {battlePoint: TeamBattlePoints}

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

const lootLoop = async (
    hre: HardhatRuntimeEnvironment, looters: Player[], 
    blockstoanalyze: number, firstdefendwindow: number, testmode: boolean,
    lootFunction: LootFunction) => {

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

    
    const classNameByCrabada: ClassNameByCrabada = await getClassNameByCrabada(hre)
    
    // Teams that play to loose...

    const teamsThatPlayToLooseByTeamId: TeamInfoByTeam = 
        await getTeamsThatPlayToLooseByTeamId(hre, blockstoanalyze, firstdefendwindow, classNameByCrabada)

    console.log('teamsThatPlayToLooseByTeamId', Object.keys(teamsThatPlayToLooseByTeamId).length);

    // Update teams thar were changed and set interval to update regularly...

    await updateTeamsThatWereChaged(hre, teamsThatPlayToLooseByTeamId, classNameByCrabada, blockstoanalyze)

    const updateTeamBattlePointListener = getUpdateTeamBattlePointListener(hre, teamsThatPlayToLooseByTeamId, classNameByCrabada)

    idleGame.on(
        idleGame.filters.AddCrabada(), 
        updateTeamBattlePointListener
    )

    // Set interval for updating teams' lock status.

    const updateLockStatusInterval = setInterval(() => updateLockStatus(hre, idleGame, playerTeamPairs, testmode, ()=>{}), 1000);

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

    const startGameEventsInterval = await listenStartGameEvents(hre, logs => {

        const teamsAndTheirTransaction: TeamAndItsTransaction[] = logs.map( ({teamId, gameId, log: {transactionHash, blockNumber}}) => {

            console.log('start game event', transactionHash, blockNumber, teamId.toString());

            return {
                teamId,
                txHash: transactionHash,
                gameId
            }
        })
        
        attackTeamsThatStartedAGame(playerTeamPairs, teamsThatPlayToLooseByTeamId, teamsAndTheirTransaction, testmode, lootFunction)

    }, 50)

    // Never finish
    await new Promise((resolve) => {

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
    clearInterval(startGameEventsInterval)
    idleGame.off(idleGame.filters.AddCrabada(), updateTeamBattlePointListener)
    clearInterval(updateLockStatusInterval)
    settleGameInterval && clearInterval(settleGameInterval)

}

const LOOT_CAPTCHA_CONFIG: LootCaptchaConfig = {
    players: [
        { 
            address: '0xE90A22064F415896F1F72e041874Da419390CC6D',
            teams: [ 5357 ],
            signerIndex: 2,
        }
    ]
}

interface PendingResponse {
    resolveResponse: (value: unknown) => void,
    res: typeof express.response,
    requester: string
}

type PendingAttackLooterTeams = string[]

interface PendingAttacks{
    [gameId: string]: PendingAttackLooterTeams
}

class AttackServer {

    app = express();
    pendingResponses: PendingResponse[] = []
    pendingAttacks: PendingAttacks = {}

    constructor(){

        this.app.use(express.json());

        this.app.use(express.static(`${ __dirname }/../frontend`));

        this.app.get('/captcha/load/', async (req, res) => {
            console.log('/captcha/load/')
            console.log(req.body);
            await new Promise(resolve => {
                this.pendingResponses.push({
                    requester: req.body.requester,
                    res,
                    resolveResponse: resolve
                })    
            })
        })

        interface AttackRequestData {
            requester: string,
            game_id: string,
            user_address: string,
            team_id: string,
            lot_number: string,
            pass_token: string,
            gen_time: string,
            captcha_output: string,
        }

        this.app.post('/captcha/verify/', async (req, res) => {
            const reqData: AttackRequestData = req.body
            console.log('/captcha/verify/')
            console.log(reqData);
            const { requester, game_id, user_address, team_id, lot_number, pass_token, gen_time, captcha_output } = reqData
            if (!this.hasPendingAttack(requester, game_id, team_id)){
                res.json({
                    message: "INVALID REQUESTER, GAMEID, TEAMID."
                })
                res.status(401)
                return
            }

            interface AttackResponseData {
                error_code: string,
                message: string,
                result?: {
                    signature: string,
                    game_id: number,
                    team_id: number,
                    expire_time: number
                }
            }

            const attackResponse = await axios.put(`https://idle-api.crabada.com/public/idle/attack/${ game_id }`, {
                user_address, team_id, lot_number, pass_token, gen_time, captcha_output
            }, {
                headers: {
                    authority: 'idle-api.crabada.com',
                    // TODO Add mechanism to autenticate.
                    authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7InVzZXJfYWRkcmVzcyI6IjB4ZTkwYTIyMDY0ZjQxNTg5NmYxZjcyZTA0MTg3NGRhNDE5MzkwY2M2ZCIsImVtYWlsX2FkZHJlc3MiOm51bGwsImZ1bGxfbmFtZSI6IkNyYWJhZGlhbiAyNGI2MGYzYTUwYSIsInVzZXJuYW1lIjpudWxsLCJmaXJzdF9uYW1lIjpudWxsLCJsYXN0X25hbWUiOm51bGx9LCJpYXQiOjE2NDY3Mzg4MjMsImV4cCI6MTY0OTMzMDgyMywiaXNzIjoiMjM5NTA5NTM4MWFhMjBhZWRkYjFlNWQ2MWQzOGNkZWUifQ.Ojcg4qWlVI87PtAPsyy7f3EEVU57etATDgYsdCfIJM0',
                    origin: 'https://play.crabada.com'
                }
            })

            console.log(attackResponse.data);

            res.status(attackResponse.status)
            res.json(attackResponse.data)

            // ERROR: {"error_code":"BAD_REQUEST","message":"Captcha validate failed"}
            // OK: {
            //     "error_code": null,
            //     "message": null,
            //     "result": {
            //         "signature": "0x64fe7ab4114e4147afcc78ee640cf092dc91efdbf13b721da89fa39b74d5675f7f9767a0577e339c289d3a1bb707d2b93956fda367b4f6494650d30ca80498b51b",
            //         "game_id": 2109002,
            //         "team_id": 5357,
            //         "expire_time": 1646739603
            //     }
            // }

        })

        this.app.listen(3000)

    }

    hasPendingAttack(requester: string, gameId: string, looterTeamId: string): boolean{
        console.log('this.pendingAttacks', this.pendingAttacks);
        console.log('gameId', gameId);
        console.log('looterTeamId', looterTeamId);

        return (
            this.pendingAttacks[gameId] 
            && (this.pendingAttacks[gameId].includes(looterTeamId))
        )
    }

    addPendingAttack(requester: string, gameId: string, looterTeamId: string){
        this.pendingAttacks[gameId] = this.pendingAttacks[gameId] || []
        this.pendingAttacks[gameId].push(looterTeamId)
        console.log('this.pendingAttacks', this.pendingAttacks);
    }

    sendCaptchaDataResponse(p: PlayerTeamPair, t: Target){
        const pendingResponse = this.pendingResponses.pop()
        if (!pendingResponse)
            return
        this.addPendingAttack(pendingResponse.requester, t.gameId.toString(), p.teamId.toString())
        const captchaData = {
            user_address: p.playerAddress,
            team_id: p.teamId.toString(),
            game_id: t.gameId.toString()
        }
        pendingResponse.res.json(captchaData)
        console.log('Sent captcha data to', pendingResponse.requester, captchaData);
        pendingResponse.resolveResponse(undefined)
    }

    returnCaptchaData(unlockedPlayerTeamPairsWithEnoughBattlePointSorted: PlayerTeamPair[], targets: Target[]){

        const targetsOrderByGameIdDescending = targets.sort((a, b) => b.gameId < a.gameId ? -1 : b.gameId > a.gameId ? 1 : 0 )
        for (const t of targetsOrderByGameIdDescending){
            for (const p of unlockedPlayerTeamPairsWithEnoughBattlePointSorted){
                if (p.battlePoint.gt(t.battlePoint))
                    this.sendCaptchaDataResponse(p, t);
            }
        }

    }

}

task(
    "captchaloot",
    "Loot using captcha.",
    async ({ blockstoanalyze, firstdefendwindow, testmode }, hre: HardhatRuntimeEnvironment) => {

        const attackServer = new AttackServer()

        const returnCaptchaData: LootFunction = (
            unlockedPlayerTeamPairsWithEnoughBattlePointSorted: PlayerTeamPair[],
            targets: Target[],
            targetsHaveAdvantage: boolean,
            lootersFaction: TeamFaction, 
            testmode: boolean
            ) => {

            attackServer.returnCaptchaData(unlockedPlayerTeamPairsWithEnoughBattlePointSorted, targets)

        }

        await lootLoop(hre, LOOT_CAPTCHA_CONFIG.players, blockstoanalyze, firstdefendwindow, testmode, returnCaptchaData )

    })
    .addOptionalParam("blockstoanalyze", "Blocks to be analyzed.", 43200 /*24 hours*/ , types.int)
    .addOptionalParam("firstdefendwindow", "First defend window (blocks to be skiped).", 900 /*30 minutes*/, types.int)
    .addOptionalParam("testmode", "Test mode", true, types.boolean)
