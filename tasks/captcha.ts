import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "console";
import { BigNumber, Contract, ethers } from "ethers";
import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getCrabadaContracts, getTeamsBattlePoint, getTeamsThatPlayToLooseByTeamId, isTeamLocked, ONE_GWEI, settleGame, TeamInfoByTeam, updateTeamsThatWereChaged } from "../scripts/crabada";
import { ClassNameByCrabada, LOOTERS_FACTION, TeamBattlePoints, TeamFaction } from "../scripts/teambp";
import { getClassNameByCrabada, getDashboardContent, getSigner, listenStartGameEvents } from "./crabada";

import * as express from "express"
import axios from "axios";
import { game } from "telegraf/typings/button";

interface Player {
    address: string,
    teams: number[],
    signerIndex: number
}

interface LootCaptchaConfig {
    players: Player[],
    attackTransaction: {
        override: {
            gasLimit: number,
            // gasPrice: BigNumber,
            maxFeePerGas: BigNumber,
            maxPriorityFeePerGas: BigNumber,
        }
    },
    attackOnlyTeamsThatPlayToLoose: boolean
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

    const teamsThatPlayToLooseByTeamId = await (
        LOOT_CAPTCHA_CONFIG.attackOnlyTeamsThatPlayToLoose ? 
            getTeamsThatPlayToLooseByTeamId(hre, blockstoanalyze, firstdefendwindow, classNameByCrabada)
            : getTeamsBattlePoint(hre, blockstoanalyze, classNameByCrabada)
    )

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

const existsAnyTeamSettled = (playerTeamPairs: PlayerTeamPair[], testmode: boolean): boolean => {
    return (playerTeamPairs.filter( p => p.settled || testmode ).length == 0)
}

export const LOOT_CAPTCHA_CONFIG: LootCaptchaConfig = {
    players: [
        // {
        //     signerIndex: 1,
        //     address: '0xB2f4C513164cD12a1e121Dc4141920B805d024B8',
        //     teams: [ 3286, 3759, 5032 ],
        // },
        {
            signerIndex: 2,
            address: '0xE90A22064F415896F1F72e041874Da419390CC6D',
            teams: [ /*5355,*/ 5357, /*6152*/ ],
        },
        // {
        //     signerIndex: 3,
        //     address: '0xc7C966754DBE52a29DFD1CCcCBfD2ffBe06B23b2',
        //     teams: [ 7449, 8157, 9236 ],
        // },
        // {
        //     signerIndex: 4,
        //     address: '0x9568bD1eeAeCCF23f0a147478cEF87434aF0B5d4',
        //     teams: [ 16767, 16768, 16769 ],
        // },
        // {
        //     signerIndex: 5,
        //     address: '0x83Ff016a2e574b2c35d17Fe4302188b192b64344',
        //     teams: [ 16761, 16762, 16763 ],
        // },
        // {
        //     signerIndex: 6,
        //     address: '0x6315F93dEF48c21FFadD5CbE078Cdb19BAA661F8',
        //     teams: [ 16764, 16765, 16766 ],
        // },
    ],
    attackTransaction: {
        override: {
            gasLimit: 1000000,
            maxFeePerGas: BigNumber.from(ONE_GWEI*400),
            maxPriorityFeePerGas: BigNumber.from(ONE_GWEI)
        }
    },
    attackOnlyTeamsThatPlayToLoose: true
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

interface AttackTransactionData{
    game_id: any,
    user_address: any,
    team_id: any,
    expire_time: any, 
    signature: any,
}

interface AttackTransactionDataByGameId{
    [game_id: string]: AttackTransactionData
}

class AttackExecutor{

    hre: HardhatRuntimeEnvironment
    attackTransactionsDataByGameId: AttackTransactionDataByGameId = {}
    idleGame: Contract

    constructor(hre: HardhatRuntimeEnvironment){
        this.hre = hre
    }

    addAttackTransactionData(attackTransactionData: AttackTransactionData){
        this.attackTransactionsDataByGameId[attackTransactionData.game_id] = attackTransactionData
    }

    async attackTransaction({user_address, game_id, team_id, expire_time, signature}: AttackTransactionData){

        const { idleGame } = getCrabadaContracts(this.hre)

        const looterSigner = (await this.hre.ethers.getSigners()).filter( s => s.address == user_address)[0]

        try {
            console.log('looterSigner', looterSigner.address)
            console.log('idleGame.attack(game_id, team_id, expire_time, signature)', game_id, team_id, expire_time, signature);
            await idleGame.connect(looterSigner).callStatic.attack(
                BigNumber.from(game_id), BigNumber.from(team_id), BigNumber.from(expire_time), signature, 
                LOOT_CAPTCHA_CONFIG.attackTransaction.override
            )
            const txr: ethers.providers.TransactionResponse = await idleGame.connect(looterSigner).attack(
                BigNumber.from(game_id), BigNumber.from(team_id), BigNumber.from(expire_time), signature,
                LOOT_CAPTCHA_CONFIG.attackTransaction.override
            )
            console.log('txr.hash', txr.hash);
            delete this.attackTransactionsDataByGameId[game_id]
        } catch (error) {
            console.error('Error trying to attack', String(error));
            if ((+new Date()/1000)>Number(expire_time))
                delete this.attackTransactionsDataByGameId[game_id]
        }

    }

    beginAttackInterval(): NodeJS.Timer {

        let attackInExecution = false

        return setInterval(async ()=>{

            if (attackInExecution)
                return

            attackInExecution = true

            for (const gameId in this.attackTransactionsDataByGameId){
                const attackTransactionData: AttackTransactionData = this.attackTransactionsDataByGameId[gameId]
                await this.attackTransaction(attackTransactionData)
            }
            

            attackInExecution = false

        },2000)

    }

}

class AttackServer {

    app = express();
    pendingResponses: PendingResponse[] = []
    pendingAttacks: PendingAttacks = {}
    attackExecutor: AttackExecutor

    // constructor(playerTeamPairs: PlayerTeamPair[], testmode: boolean){
    constructor(hre: HardhatRuntimeEnvironment){

        const { idleGame } = getCrabadaContracts(hre)

        this.app.use(express.json());

        this.app.use(express.static(`${ __dirname }/../frontend`));

        this.app.get('/status/', async (req, res) => {

            const {
                players
            } = await getDashboardContent(hre)

            const secondsToUnlock: number[] = players
                .flatMap( ({ teams }) => teams.map( ({ info: { secondsToUnlock }}) => secondsToUnlock ) )

            res.json({
                unlocked: secondsToUnlock.filter( x => x < 0 ).length,
                secondsToUnlock: secondsToUnlock.sort((a,b)=> a<b?-1:a>b?1:0)
            })

        })

        this.app.post('/captcha/load/', async (req, res) => {

            console.log('/captcha/load/')
            console.log(req.body);

            // if (!existsAnyTeamSettled(playerTeamPairs, testmode)){
            //     res.status(401)
            //     res.json({
            //         message: "ALL TEAMS ARE BUSY."
            //     })
            // }

            const { requester }: { requester: string } = req.body
            let indexToDelete: number = undefined

            await new Promise(resolve => {
                
                this.pendingResponses.forEach( (value, index) => {
                    if (value.requester == requester){
                        indexToDelete = index
                    }
                })

                if (indexToDelete == undefined){

                    this.pendingResponses.push({
                        requester: req.body.requester,
                        res,
                        resolveResponse: resolve
                    })

                } else {

                    this.pendingResponses[indexToDelete].resolveResponse(undefined)
                    this.pendingResponses[indexToDelete] = {
                        requester: req.body.requester,
                        res,
                        resolveResponse: resolve
                    }

                }

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
            } else {
                // TODO remove pending attack.
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

            try {

                const access_token = {
                    '0xB2f4C513164cD12a1e121Dc4141920B805d024B8': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7InVzZXJfYWRkcmVzcyI6IjB4YjJmNGM1MTMxNjRjZDEyYTFlMTIxZGM0MTQxOTIwYjgwNWQwMjRiOCIsImVtYWlsX2FkZHJlc3MiOm51bGwsImZ1bGxfbmFtZSI6ImNlcmVicm8iLCJ1c2VybmFtZSI6bnVsbCwiZmlyc3RfbmFtZSI6bnVsbCwibGFzdF9uYW1lIjpudWxsfSwiaWF0IjoxNjQ3MTY3NDUxLCJleHAiOjE2NDk3NTk0NTEsImlzcyI6IjIzOTUwOTUzODFhYTIwYWVkZGIxZTVkNjFkMzhjZGVlIn0.4zDy9JrcLymHjFAs6ZDi2tTsuuHIY43rBex9RL6BHW0',
                    '0xE90A22064F415896F1F72e041874Da419390CC6D': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7InVzZXJfYWRkcmVzcyI6IjB4ZTkwYTIyMDY0ZjQxNTg5NmYxZjcyZTA0MTg3NGRhNDE5MzkwY2M2ZCIsImVtYWlsX2FkZHJlc3MiOm51bGwsImZ1bGxfbmFtZSI6IkNyYWJhZGlhbiAyNGI2MGYzYTUwYSIsInVzZXJuYW1lIjpudWxsLCJmaXJzdF9uYW1lIjpudWxsLCJsYXN0X25hbWUiOm51bGx9LCJpYXQiOjE2NDcxNjc2NzYsImV4cCI6MTY0OTc1OTY3NiwiaXNzIjoiMjM5NTA5NTM4MWFhMjBhZWRkYjFlNWQ2MWQzOGNkZWUifQ.kf90amZVjrnYHpmNzBuvbUDx0qi_kkPzmSCJlK3Y9xg',
                    '0xc7C966754DBE52a29DFD1CCcCBfD2ffBe06B23b2': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7InVzZXJfYWRkcmVzcyI6IjB4YzdjOTY2NzU0ZGJlNTJhMjlkZmQxY2NjY2JmZDJmZmJlMDZiMjNiMiIsImVtYWlsX2FkZHJlc3MiOm51bGwsImZ1bGxfbmFtZSI6IkNyYWJhZGlhbiAyNmFjYjQ5Njg2N2EiLCJ1c2VybmFtZSI6bnVsbCwiZmlyc3RfbmFtZSI6bnVsbCwibGFzdF9uYW1lIjpudWxsfSwiaWF0IjoxNjQ3MTY3NzQ3LCJleHAiOjE2NDk3NTk3NDcsImlzcyI6IjIzOTUwOTUzODFhYTIwYWVkZGIxZTVkNjFkMzhjZGVlIn0.H1BhKzlVD2NP8BNEVcCBnKiUUrD7CVDjhE77_38KRfg',
                    '0x9568bD1eeAeCCF23f0a147478cEF87434aF0B5d4': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7InVzZXJfYWRkcmVzcyI6IjB4OTU2OGJkMWVlYWVjY2YyM2YwYTE0NzQ3OGNlZjg3NDM0YWYwYjVkNCIsImVtYWlsX2FkZHJlc3MiOm51bGwsImZ1bGxfbmFtZSI6IkNyYWJhZGlhbiAxYWRhMzBhY2JiM2EiLCJ1c2VybmFtZSI6bnVsbCwiZmlyc3RfbmFtZSI6bnVsbCwibGFzdF9uYW1lIjpudWxsfSwiaWF0IjoxNjQ3MTY3NzczLCJleHAiOjE2NDk3NTk3NzMsImlzcyI6IjIzOTUwOTUzODFhYTIwYWVkZGIxZTVkNjFkMzhjZGVlIn0.dEFYnZpR_GVaTmnTRrsBf0NqU-xblP8YkXR6L6NkFD4',
                    '0x83Ff016a2e574b2c35d17Fe4302188b192b64344': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7InVzZXJfYWRkcmVzcyI6IjB4ODNmZjAxNmEyZTU3NGIyYzM1ZDE3ZmU0MzAyMTg4YjE5MmI2NDM0NCIsImVtYWlsX2FkZHJlc3MiOm51bGwsImZ1bGxfbmFtZSI6IkNyYWJhZGlhbiAyZDBhY2Q5ODIxOGUiLCJ1c2VybmFtZSI6bnVsbCwiZmlyc3RfbmFtZSI6bnVsbCwibGFzdF9uYW1lIjpudWxsfSwiaWF0IjoxNjQ3MTY3ODQwLCJleHAiOjE2NDk3NTk4NDAsImlzcyI6IjIzOTUwOTUzODFhYTIwYWVkZGIxZTVkNjFkMzhjZGVlIn0.n9fOVIOOOpohxwz7X8sOGE71T3Fut8bZnSaYVDy0snM',
                    '0x6315F93dEF48c21FFadD5CbE078Cdb19BAA661F8': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7InVzZXJfYWRkcmVzcyI6IjB4NjMxNWY5M2RlZjQ4YzIxZmZhZGQ1Y2JlMDc4Y2RiMTliYWE2NjFmOCIsImVtYWlsX2FkZHJlc3MiOm51bGwsImZ1bGxfbmFtZSI6IkNyYWJhZGlhbiAxMmFhYjZlNWQxOTUiLCJ1c2VybmFtZSI6bnVsbCwiZmlyc3RfbmFtZSI6bnVsbCwibGFzdF9uYW1lIjpudWxsfSwiaWF0IjoxNjQ3MTY3ODczLCJleHAiOjE2NDk3NTk4NzMsImlzcyI6IjIzOTUwOTUzODFhYTIwYWVkZGIxZTVkNjFkMzhjZGVlIn0.-lsJLlIUX6WCnEVr75pTG2ls7j12UViBLaXNnKxvP60'
                }

                const attackResponse = await axios.put(`https://idle-api.crabada.com/public/idle/attack/${ game_id }`, {
                    user_address, team_id, lot_number, pass_token, gen_time, captcha_output
                }, {
                    headers: {
                        authority: 'idle-api.crabada.com',
                        // TODO Add mechanism to autenticate.
                        authorization: `Bearer ${access_token[user_address]}`,
                        origin: 'https://play.crabada.com'
                    }
                })
    
                console.log('SUCCESS trying to register attack', requester);
                console.log(attackResponse.data);
                res.status(attackResponse.status)
                res.json(attackResponse.data)

                // TODO Move attack transaction code to an independent task.
                const { signature, expire_time } = attackResponse.data.result

                this.attackExecutor.addAttackTransactionData({user_address, game_id, team_id, expire_time, signature})

            } catch (error) {

                console.error('ERROR trying to register attack', error.response.data);
                
                res.status(error.response.status)
                res.json(String(error.response.data))

            }

            


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

        this.attackExecutor = new AttackExecutor(hre)
        this.attackExecutor.beginAttackInterval()
        this.app.listen(3000)

    }

    hasPendingAttack(requester: string, gameId: string, looterTeamId: string): boolean{
        return (
            this.pendingAttacks[gameId] 
            && (this.pendingAttacks[gameId].includes(looterTeamId))
        )
    }

    addPendingAttack(requester: string, gameId: string, looterTeamId: string){
        this.pendingAttacks[gameId] = this.pendingAttacks[gameId] || []
        this.pendingAttacks[gameId].push(looterTeamId)
    }

    sendCaptchaDataResponse(p: PlayerTeamPair, t: Target){
        const pendingResponse = this.pendingResponses.shift()
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

    recentTeams = []

    returnCaptchaData(unlockedPlayerTeamPairsWithEnoughBattlePointSorted: PlayerTeamPair[], targets: Target[]){

        const targetsOrderByGameIdDescending = targets.sort((a, b) => b.gameId < a.gameId ? -1 : b.gameId > a.gameId ? 1 : 0 )

        const playerTeamPairsOrderByNotInRecentTeams = unlockedPlayerTeamPairsWithEnoughBattlePointSorted.sort((a, b) => {
            const aInRecentTeams = this.recentTeams.includes(a.teamId.toString())
            const bInRecentTeams = this.recentTeams.includes(b.teamId.toString())
            return aInRecentTeams == bInRecentTeams ? 0 : aInRecentTeams ? 1 : -1
        })

        const teamIdsAlreadyUsed: number[] = []

        for (const t of targetsOrderByGameIdDescending){
            for (const p of playerTeamPairsOrderByNotInRecentTeams){

                // Do not use same team for different targets.
                if (teamIdsAlreadyUsed.includes(p.teamId))
                    continue

                if (p.battlePoint.gt(t.battlePoint)){

                    this.sendCaptchaDataResponse(p, t);
                    this.recentTeams.push(p.teamId.toString())

                    if (this.recentTeams.length>2)
                        this.recentTeams.shift()

                    if (this.pendingResponses.length == 0)
                        return
                    
                    teamIdsAlreadyUsed.push(p.teamId)

                    // Do not use same target for different teams.
                    break

                }

            }
        }

    }

}

task(
    "captchaloot",
    "Loot using captcha.",
    async ({ blockstoanalyze, firstdefendwindow, testmode }, hre: HardhatRuntimeEnvironment) => {

        const attackServer = new AttackServer(hre)

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
