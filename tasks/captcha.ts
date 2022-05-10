import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "console";
import { BigNumber, Contract, ethers, Wallet } from "ethers";
import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { closeGame, getCrabadaContracts, getTeamsBattlePoint, getTeamsThatPlayToLooseByTeamId, isTeamLocked, ONE_GWEI, settleGame, TeamInfoByTeam, updateTeamsThatWereChaged } from "../scripts/crabada";
import { ClassNameByCrabada, LOOTERS_FACTION, TeamBattlePoints, TeamFaction } from "../scripts/teambp";
import { getClassNameByCrabada, getDashboardContent, getSigner, isLootingPeriod } from "./crabada";


import * as express from "express"
import axios from "axios";
import { MAINNET_AVAX_MAIN_ACCOUNTS_PKS } from "../hardhat.config";
import { Player } from "../scripts/hre";
import { CanLootGameFromApi, DEBUG, listenCanLootGamesFromApi } from "../scripts/api";

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
                await closeGame(idleGame.connect(signer), currentGameId, hre.crabada.network.getAttackOverride(), 1, log)
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
    lootFunction: LootFunction, needsToContinueRunning: () => Promise<boolean>) => {

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
        hre.crabada.network.LOOT_CAPTCHA_CONFIG.attackOnlyTeamsThatPlayToLoose ? 
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

        attackTeamsThatStartedAGame(playerTeamPairs, teamsThatPlayToLooseByTeamId, teamsAndTheirTransaction, testmode, lootFunction)

    }, 1000)

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
    idleGame.off(idleGame.filters.AddCrabada(), updateTeamBattlePointListener)
    clearInterval(updateLockStatusInterval)
    settleGameInterval && clearInterval(settleGameInterval)

}

const existsAnyTeamSettled = (playerTeamPairs: PlayerTeamPair[], testmode: boolean): boolean => {
    return (playerTeamPairs.filter( p => p.settled || testmode ).length == 0)
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

        const signers = await this.hre.ethers.getSigners()

        const looterSigner = signers.filter( s => s.address.toLowerCase() == user_address.toLowerCase())[0]

        try {
            console.log('looterSigner', looterSigner.address)
            console.log('idleGame.attack(game_id, team_id, expire_time, signature)', game_id, team_id, expire_time, signature);
            await idleGame.connect(looterSigner).callStatic["attack(uint256,uint256,uint256,bytes)"](
                BigNumber.from(game_id), BigNumber.from(team_id), BigNumber.from(expire_time), signature, 
                this.hre.crabada.network.LOOT_CAPTCHA_CONFIG.attackTransaction.override
            )
            const txr: ethers.providers.TransactionResponse = await idleGame.connect(looterSigner)["attack(uint256,uint256,uint256,bytes)"](
                BigNumber.from(game_id), BigNumber.from(team_id), BigNumber.from(expire_time), signature,
                this.hre.crabada.network.LOOT_CAPTCHA_CONFIG.attackTransaction.override
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


interface PendingTransaction {
    user_address: string,
    team_id: string,
    game_id: string,
    requester: string,
    status: {
        resolveStatusResponse?: (value: unknown) => void,
        res?: typeof express.response,    
        successfulAttackRegistration?: boolean|undefined
    }
}

interface PendingTransactionByChallenge {
    [challenge: string]: PendingTransaction
}

interface CaptchaVerifyResult {
    status: string,
    data: {
        lot_number: string,
        result: string,
        fail_count: number,
        seccode: {
            captcha_id: string,
            lot_number: string,
            pass_token: string,
            gen_time: string,
            captcha_output: string
        },
    }
}

export class AuthServer {

    authenticateInterval: NodeJS.Timer = undefined
    wallets: ethers.Wallet[]

    accessTokenByAddress: {
        [address: string]: string
    } = {}

    hre: HardhatRuntimeEnvironment

    constructor(hre: HardhatRuntimeEnvironment){

        this.hre = hre

        this.wallets = this.hre.crabada.network.LOOT_CAPTCHA_CONFIG.players
            .map(({signerIndex})=>signerIndex)
            .map( index => new Wallet(MAINNET_AVAX_MAIN_ACCOUNTS_PKS[index]))

        this.start()

    }

    start(retryMs=20_000){
        if (this.authenticateInterval)
            return
        this.authenticateInterval = setInterval(()=>{
            this.authenticateIfNotAuthenticated()
        }, retryMs)
    }

    stop(){
        if (this.authenticateInterval == undefined)
            return
        clearInterval(this.authenticateInterval)
        this.authenticateInterval = undefined
    }

    getToken(address: string){
        return this.accessTokenByAddress[address.toLowerCase()]
    }

    async authenticateIfNotAuthenticated(){

        await Promise.all(

            this.wallets.map( async(w) => {

                const signedAddress = w.address.toLowerCase()
    
                if (this.getToken(signedAddress))
                    return
    
                const timestamp = String(+new Date())

                const message = `${signedAddress}_${timestamp}`
                const signedMessage = await w.signMessage(message)
                
                console.log('Message to sign', message);
                console.log('Signed message', signedMessage);
    
                const url = `${this.hre.crabada.network.getCrabadaApiBaseUrl()}/crabada-user/public/login-signature`
    
                const headers = {
                    'authority': 'api.crabada.com',
                    'pragma': 'no-cache',
                    'cache-control': 'no-cache',
                    'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="99", "Google Chrome";v="99"',
                    accept: 'application/json, text/plain, */*',
                    'content-type': 'application/json',
                    'sec-ch-ua-mobile': '?0',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.51 Safari/537.36',
                    'sec-ch-ua-platform': '"Windows"',
                    origin: this.hre.crabada.network.getOrigin(),
                    'sec-fetch-site': 'same-site',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-dest': 'empty',
                    'referer': this.hre.crabada.network.getReferer(),
                    'accept-language': 'pt-BR,pt;q=0.9,es;q=0.8,en;q=0.7,de;q=0.6,en-US;q=0.5,he;q=0.4',
                }
    
                try {

                    DEBUG && console.log('POST', url);
    
                    const response = await axios.post(url, {
                        address: signedAddress,
                        sign: signedMessage,
                        timestamp,
                    },{
                        headers
                    })
    
    
                    if (response.status == 200) {
    
                        const { result: { accessToken } } = response.data

                        this.accessTokenByAddress[signedAddress] = accessToken

                        console.log('Authentication succed for address', signedAddress, 'with access token', accessToken);
    
                    } else {
                        throw({
                            status: response.status,
                            data: response.data
                        })
                    }
    
    
                } catch (error) {
    
                    console.error('ERROR trying to authenticate address', w.address, String(error))
                    error.response && console.error(error.response.data);
    
                }
    
            })
        )



    }

}

class AttackServer {

    app = express();
    pendingResponses: PendingResponse[] = []
    pendingAttacks: PendingAttacks = {}
    attackExecutor: AttackExecutor

    authServer: AuthServer

    hre: HardhatRuntimeEnvironment

    async needsToContinueRunning(): Promise<boolean>{

        const {
            players
        } = await getDashboardContent(this.hre)

        const secondsToUnlock: number[] = players
            .flatMap( ({ teams }) => teams.map( ({ info: { secondsToUnlock }}) => secondsToUnlock ) )

        return secondsToUnlock.some(x => x < 600)

    }

    async waitUntilNeedsToContinueRunning(log: typeof console.log = console.log): Promise<void>{
        return new Promise((resolve) => {

            const waitUntilNeedsToContinueRunningInterval = setInterval(async () => {

                if (await this.needsToContinueRunning()){
                    clearInterval(waitUntilNeedsToContinueRunningInterval)
                    resolve(undefined)
                } else {
                    log('Waiting until needs to continue running')
                }

            }, 30_000)

        })
    }

    // constructor(playerTeamPairs: PlayerTeamPair[], testmode: boolean){
    constructor(hre: HardhatRuntimeEnvironment){

        this.hre = hre

        this.authServer = new AuthServer(hre)

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

        /**
         * Proxy the load/verify of captcha lib data to idle-api.crabada.com/public
         */
        this.app.get('/proxy/captcha/*', async (req, res) => {

            console.log('req.url', req.url); // '/proxy/captcha/load/?captcha_id=a9cd95e65fc75072dadea93e3d60b0e6&challenge=16471805841662330581e891e709-1e56-4e70-9b6d-996385914a5f&client_type=web&risk_type=icon&lang=pt-br&callback=geetest_1647180585657'

            const url = `${hre.crabada.network.getIdleGameApiBaseUrl()}${req.url.replace('proxy/captcha', 'public')}`
            const headers = {
                'authority': 'idle-api.crabada.com',
                'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="99", "Google Chrome";v="99"',
                'sec-ch-ua-mobile': '?0',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.51 Safari/537.36',
                'sec-ch-ua-platform': '"Windows"',
                'accept': '*/*',
                'sec-fetch-site': 'same-site',
                'sec-fetch-mode': 'no-cors',
                'sec-fetch-dest': 'script',
                'referer': this.hre.crabada.network.getReferer(),
                'accept-language': 'pt-BR,pt;q=0.9,es;q=0.8,en;q=0.7,de;q=0.6,en-US;q=0.5,he;q=0.4',
                // cookie: '_hjSessionUser_2567432=eyJpZCI6IjFmMDRmZmRkLWYxMGMtNThjMi1iMWZjLTM0Zjg5MTFlNWNlNyIsImNyZWF0ZWQiOjE2MzgwMTA1MzY2NjksImV4aXN0aW5nIjp0cnVlfQ==; _ga_0JZ9C3M56S=GS1.1.1644169522.62.0.1644169522.0; amp_fef1e8=4a14c266-5a66-48f2-9614-e6282c8be872R...1ftker5j1.1ftkerd5k.bm.25.dr; _ga=GA1.1.311628077.1638010536; _ga_8LH6CFBN5P=GS1.1.1646881253.330.1.1646881507.0; _ga_J0F5RPFJF1=GS1.1.1647125967.36.1.1647125983.0; _ga_EKEKPKZ4L1=GS1.1.1647167093.7.0.1647167094.0; _ga_C6PTCE6QJM=GS1.1.1647178955.188.1.1647179135.0',
            }

            try {

                DEBUG && console.log('GET', url);

                const response = await axios.get(url,{
                    headers
                })

                res.status(response.status)
                res.send(response.data)

                if (response.status == 200 && req.url.indexOf('/proxy/captcha/verify') >= 0) {

                    const parsedData: CaptchaVerifyResult = JSON.parse(/geetest_[\d]*\((.*)\)/g.exec(response.data)[1])

                    const challenge = req.query.challenge as string

                    await this.registerOrRetryAttack(challenge, parsedData)

                    this.respondStatusPendingChallenge(challenge)

                }


            } catch (error) {

                console.log('ERROR', String(error))

                // if (error.response){
                //     console.log('error.response.status', error.response.status);
                //     console.log('error.response.data', error.response.data);
                //     res.status(error.response.status)
                //     res.json(error.response.data)
                // } else {
                //     throw error
                // }

            }

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

                const attackResponse = await this.registerAttack(user_address, team_id, game_id, lot_number, pass_token, gen_time, captcha_output)

                console.log('SUCCESS trying to register attack', requester);
                console.log(attackResponse.data);
                res.status(attackResponse.status)
                res.json(attackResponse.data)

                const { signature, expire_time } = attackResponse.data.result

                this.attackExecutor.addAttackTransactionData({user_address, game_id, team_id, expire_time, signature})

            } catch (error) {

                console.error('ERROR trying to register attack', error.response.data);

                res.status(error.response.status)
                res.json(error.response.data)

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

        this.app.get('/captcha/status/', async (req, res) => {

            console.log('/captcha/status/')

            const challenge = req.query.challenge as string

            const pendingChallenge = this.pendingChallenge[challenge]

            if (!pendingChallenge){
                res.status(404)
                return
            }

            await new Promise(resolve => {

                pendingChallenge.status.res = res
                pendingChallenge.status.resolveStatusResponse = resolve

                this.respondStatusPendingChallenge(challenge)

            })
        })

        this.attackExecutor = new AttackExecutor(hre)
        this.attackExecutor.beginAttackInterval()
        this.app.listen(3000)

    }

    async registerOrRetryAttack(challenge: string, captchaVerifyResponse: CaptchaVerifyResult){

        const pendingChallenge = this.pendingChallenge[challenge]
        const { user_address, game_id, team_id, requester } = pendingChallenge

        const { 
            data: { 
                lot_number, 
                seccode: { 
                    captcha_output, pass_token, gen_time 
                } 
            }
        }: CaptchaVerifyResult = captchaVerifyResponse


        try {

            const attackResponse = await this.registerAttack(user_address, team_id, game_id, lot_number, pass_token, gen_time, captcha_output)

            console.log('SUCCESS trying to register attack', requester);
            console.log(attackResponse.data);

            const { signature, expire_time } = attackResponse.data.result

            this.attackExecutor.addAttackTransactionData({ user_address, game_id, team_id, expire_time, signature })

            pendingChallenge.status.successfulAttackRegistration = true

        } catch (error) {

            // error.response.data
            // { error_code: 'BAD_REQUEST', message: 'Game doest not exists' }

            // TODO Retry call when error.response.data.message == 'Game doest not exists'

            console.error('ERROR trying to register attack', error.response.data);

            if (error.response.data.message == 'Game doest not exists'){
                await this.registerOrRetryAttack(challenge, captchaVerifyResponse)
            }else{
                pendingChallenge.status.successfulAttackRegistration = false
            }

        }

    }

    respondStatusPendingChallenge(challenge: string){

        const pendingChallenge = this.pendingChallenge[challenge]

        if (!pendingChallenge)
            return
        
        if (!pendingChallenge.status.res || pendingChallenge.status.successfulAttackRegistration == undefined)
            return

        pendingChallenge.status.res.status(
            pendingChallenge.status.successfulAttackRegistration ? 200 : 400
        )

        const {game_id, requester, team_id, user_address} = pendingChallenge
        pendingChallenge.status.res.json({
            challenge,
            game_id, 
            requester, 
            team_id, 
            user_address,
            successfulAttackRegistration: pendingChallenge.status.successfulAttackRegistration,
        })

        pendingChallenge.status.resolveStatusResponse(undefined)

        delete pendingChallenge[challenge]

    }

    async registerAttack(user_address, team_id, game_id, lot_number, pass_token, gen_time, captcha_output){

        const token = this.authServer.getToken(user_address)

        if (!token)
            console.error('Token not found for address', user_address);

        DEBUG && console.log('PUT', `${this.hre.crabada.network.getIdleGameApiBaseUrl()}/public/idle/attack/${game_id}`);

        const attackResponse = await axios.put(`${this.hre.crabada.network.getIdleGameApiBaseUrl()}/public/idle/attack/${game_id}`, {
            user_address, team_id, lot_number, pass_token, gen_time, captcha_output
        }, {
            headers: {
                authority: 'idle-api.crabada.com',
                'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="99", "Google Chrome";v="99"',
                'accept': 'application/json, text/plain, */*',
                'content-type': 'application/json',
                authorization: `Bearer ${token}`,
                'sec-ch-ua-mobile': '?0',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.51 Safari/537.36',
                'sec-ch-ua-platform': '"Windows"',
                origin: this.hre.crabada.network.getOrigin(),
                'sec-fetch-site': 'same-site',
                'sec-fetch-mode': 'cors',
                'sec-fetch-dest': 'empty',
                referer: this.hre.crabada.network.getReferer(),
                'accept-language': 'pt-BR,pt;q=0.9,es;q=0.8,en;q=0.7,de;q=0.6,en-US;q=0.5,he;q=0.4',
            }
        })

        return attackResponse

    }

    hasPendingAttack(requester: string, gameId: string, looterTeamId: string): boolean {
        return (
            this.pendingAttacks[gameId] 
            && (this.pendingAttacks[gameId].includes(looterTeamId))
        )
    }

    addPendingAttack(requester: string, gameId: string, looterTeamId: string){
        this.pendingAttacks[gameId] = this.pendingAttacks[gameId] || []
        this.pendingAttacks[gameId].push(looterTeamId)
    }

    pendingChallenge: PendingTransactionByChallenge = {}

    sendCaptchaDataResponse(p: PlayerTeamPair, t: Target){

        const pendingResponse = this.pendingResponses.shift()
        if (!pendingResponse)
            return
        
        this.addPendingAttack(pendingResponse.requester, t.gameId.toString(), p.teamId.toString())

        const challenge = "".concat(t.created_at.toString()).concat(t.gameId.toString()).concat(p.playerAddress.toLowerCase())

        // TODO delete pendingChallenge[challenge] after resolve it.
        this.pendingChallenge[challenge] = {
            user_address: p.playerAddress.toLowerCase(),
            team_id: p.teamId.toString(),
            game_id: t.gameId.toString(),
            requester: pendingResponse.requester,
            status: {}
        }

        const captchaData = {
            user_address: p.playerAddress,
            team_id: p.teamId.toString(),
            game_id: t.gameId.toString(),
            challenge,
            token: this.authServer.getToken(p.playerAddress),
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

                    // TODO Search captcha response for (p, t)
                    // TODO With captcha response try to attack.

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

        if (!isLootingPeriod()){
            console.log('Mining period.');
            return
        }

        const attackServer = new AttackServer(hre)

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

        await lootLoop(hre, hre.crabada.network.LOOT_CAPTCHA_CONFIG.players, blockstoanalyze, firstdefendwindow, testmode, returnCaptchaData,
            async (): Promise<boolean> => { return await attackServer.needsToContinueRunning() })

        await attackServer.waitUntilNeedsToContinueRunning()

    })
    .addOptionalParam("blockstoanalyze", "Blocks to be analyzed.", 86400 /*48 hours*/ , types.int)
    .addOptionalParam("firstdefendwindow", "First defend window (blocks to be skiped).", 900 /*30 minutes*/, types.int)
    .addOptionalParam("testmode", "Test mode", true, types.boolean)
