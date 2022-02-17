import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as IdleGameAbi from "../abis/IdleGame.json"
import * as ERC20Abi from "../abis/ERC20.json"
import * as CrabadaAbi from "../abis/Crabada.json"
import { BigNumber, Contract, ethers } from "ethers";
import { TransactionResponse } from "@ethersproject/abstract-provider";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { formatEther, formatUnits, parseEther } from "ethers/lib/utils";

export const ONE_GWEI = 1000000000
export const GAS_LIMIT = 700000
export const MAX_FEE = BigNumber.from(ONE_GWEI*150)
export const ATTACK_MAX_GAS_PRICE = BigNumber.from(ONE_GWEI*600)
export const ATTACK_MAX_PRIORITY_GAS_PRICE = BigNumber.from(ONE_GWEI*325)
export const ATTACK_MAX_PRIORITY_GAS_PRICE_ELITE_TEAM = BigNumber.from(ONE_GWEI*325)

export const compareBigNumbers = (a: BigNumber, b: BigNumber) => {
    return a.lt(b) ? -1 : b.lt(a) ? 1 : 0
}

export const compareBigNumbersDescending = (a: BigNumber, b: BigNumber) => {
    return -1*compareBigNumbers(a, b)
}

export const bigNumberAverage = (values: BigNumber[]) => values
    .reduce( (previous, current) => previous.add(current), ethers.constants.Zero)
    .div(values.length)

export const bigNumberVariance = (values: BigNumber[], average: BigNumber, weiPerUnit = ethers.constants.WeiPerEther) => values
    .map( x => {
            const diff = average.sub(x)
            return diff.mul(diff)// TODO .div(weiPerUnit)
    })
    .reduce( (previous, current) => previous.add(current), ethers.constants.Zero)
    .div(values.length)

export const bigNumberStandardDeviation = (variance: BigNumber): number => 
    Math.sqrt(variance.toNumber())

export interface StepMaxValuesByPercentage {
    [percentual: number]: number // maxValueForPercentage
}

export const getPercentualStepDistribution = (sortedValues: Array<any>, steps): StepMaxValuesByPercentage => {

    const minSteps = Math.min(sortedValues.length, steps)

    const stepMaxValuesByPercentage: StepMaxValuesByPercentage = {}

    for (let i=0; i<minSteps; i++){
        const percentual = Math.floor((i+1)*100/minSteps)
        const indexValueUpTo = Math.max(Math.floor(sortedValues.length*percentual/100)-1,0)
        const distance = sortedValues[indexValueUpTo]
        stepMaxValuesByPercentage[percentual] = distance
    }

    return stepMaxValuesByPercentage
}

export const currentBlockTimeStamp = async (hre: HardhatRuntimeEnvironment): Promise<number> => {
    const blockNumber = await hre.ethers.provider.getBlockNumber()
    const timestamp = (await hre.ethers.provider.getBlock(blockNumber)).timestamp;
    return timestamp
}

export const baseFee = async (hre: HardhatRuntimeEnvironment): Promise<BigNumber> => {
    return BigNumber.from(await hre.ethers.provider.send('eth_baseFee', []))
}

export const gasPrice = async (hre: HardhatRuntimeEnvironment): Promise<BigNumber> => {

    try {

        const base = await baseFee(hre)
        if (base.gt(MAX_FEE))
            return MAX_FEE
        return base.add(ONE_GWEI)

    } catch (error) {

        try {

            const gasPrice = await hre.ethers.provider.getGasPrice()
            if (gasPrice.gt(MAX_FEE))
                return MAX_FEE
            return gasPrice

        } catch (error) {

            return BigNumber.from(25*ONE_GWEI)

        }
        
    }
}

export const waitTransaction = async (trx: TransactionResponse, blocksToWait: number) => {
    await trx.wait(blocksToWait)
}

export const abi = {
    IdleGame: IdleGameAbi,
    ERC20: ERC20Abi,
    Crabada: CrabadaAbi,
}
  
export const contractAddress = {
    IdleGame: '0x82a85407BD612f52577909F4A58bfC6873f14DA8',
    tusToken: '0xf693248F96Fe03422FEa95aC0aFbBBc4a8FdD172',
    craToken: '0xa32608e873f9ddef944b24798db69d80bbb4d1ed',
    crabada: '0x1b7966315ef0259de890f38f1bdb95acc03cacdd',
}

export const getCrabadaContracts = (hre: HardhatRuntimeEnvironment) => {
    const idleGame = new Contract(
        contractAddress.IdleGame,
        abi.IdleGame,
        hre.ethers.provider
    )
  
    const tusToken = new Contract(
        contractAddress.tusToken,
        abi.ERC20,
        hre.ethers.provider
    )
  
    const craToken = new Contract(
        contractAddress.craToken,
        abi.ERC20,
        hre.ethers.provider
    )
  
    const crabada = new Contract(
        contractAddress.crabada,
        abi.Crabada,
        hre.ethers.provider
    )

    return {idleGame, tusToken, craToken, crabada}
  
}

const logBalance = async (hre: HardhatRuntimeEnvironment, signerAddress: string) => {
    console.log(`AVAX Balance: ${ formatEther(await hre.ethers.provider.getBalance(signerAddress)) }`);
}

const logTokenBalance = async (token: Contract, symbol: string, address: string, decimals: number = 18) => {
    console.log(`${symbol} balanceOf(${address}): ${ formatUnits(await token.balanceOf(address), decimals) }`);
}

export const settleGame = async (idleGame: Contract, attackerCurrentGameId: BigNumber, wait: number, log: (typeof console.log) = console.log): Promise<TransactionResponse|undefined> =>{

    const override = {
        gasLimit: GAS_LIMIT,
        maxFeePerGas: ATTACK_MAX_GAS_PRICE,
        maxPriorityFeePerGas: BigNumber.from(ONE_GWEI)
    }

    try {
        log(`callStatic.settleGame(gameId: ${attackerCurrentGameId})`);        
        await idleGame.callStatic.settleGame(attackerCurrentGameId, override)
    } catch (error) {
        log(`ERROR: ${error.toString()}`)
        log(`INFO: Maybe it is too early to settle the game`)
        return undefined
    }

    log(`settleGame(gameId: ${attackerCurrentGameId})`);
    const transactionResponse: TransactionResponse = await idleGame.settleGame(attackerCurrentGameId, override)
    log(`transaction: ${transactionResponse.hash}`);

    await transactionResponse.wait(wait)

    return transactionResponse

}

export const locked = async (teamId: number, lockTo: BigNumber, timestamp: number, log: (typeof console.log) = console.log) => {
    const extraSeconds = 10 // 10 extra seconds of lock, in case timestamp has an error.
    const difference = (lockTo as BigNumber).sub(timestamp).add(extraSeconds)
    if (difference.lt(0)){
        log(`TEAM ${teamId} UNLOCKED: (lockTo: ${(lockTo as BigNumber).toNumber()}, timestamp: ${timestamp}, difference ${difference.toNumber()})`)
        return false
    }
    else{
        log(`TEAM ${teamId} LOCKED: (lockTo: ${(lockTo as BigNumber).toNumber()}, timestamp: ${timestamp}, difference ${difference.toNumber()})`)
        return true
    }
}

  
export const mineStep = async (
    hre: HardhatRuntimeEnvironment, minerTeamId: number, attackerContractAddress: string|undefined, 
    attackerTeamId: number, wait: number, minerSigner: SignerWithAddress, 
    attackerSigners: SignerWithAddress[]) => {

    const override = {
        gasLimit: GAS_LIMIT,
        // nonce: undefined,
        // gasPrice: undefined,
        maxFeePerGas: MAX_FEE,
        maxPriorityFeePerGas: ONE_GWEI
    } 

    const idleGame = new Contract(
        contractAddress.IdleGame,
        abi.IdleGame,
        hre.ethers.provider
    ).connect(minerSigner)

    const Player = (await hre.ethers.getContractFactory("Player"));
    const attackers = attackerSigners.map( signer => Player.attach(attackerContractAddress).connect(signer) ) 

    const tusToken = new Contract(
        contractAddress.tusToken,
        abi.ERC20,
        hre.ethers.provider
    )
  
    const craToken = new Contract(
        contractAddress.craToken,
        abi.ERC20,
        hre.ethers.provider
    )
  
    const minerAddress = minerSigner.address

    console.log('Miner address', minerSigner.address);
    attackerSigners.forEach( (signer, index) => console.log('Attacker address', index, signer.address) )
    
    const { lockTo: minerLockTo, currentGameId: minerCurrentGameId } = await idleGame.getTeamInfo(minerTeamId)

    const { lockTo: attackerLockTo, currentGameId: attackerCurrentGameId } = attackerTeamId ?
        await idleGame.getTeamInfo(attackerTeamId) : { lockTo: 0, currentGameId: 0 }

    const timestamp = await currentBlockTimeStamp(hre)

    if (attackerTeamId && await locked(attackerTeamId, attackerLockTo, timestamp))
        return
    
    if (await locked(minerTeamId, minerLockTo, timestamp))
        return

    // CLOSE GAME
    
    const closeGame = async (gameId: number) =>{

        try {
            console.log(`callStatic.closeGame(gameId: ${gameId})`);        
            await idleGame.callStatic.closeGame(gameId, override)
        } catch (error) {
            console.error(`ERROR: ${error.toString()}`)
            console.error(`INFO: Maybe it is too early to close the game`)
            return
        }
    
        console.log(`closeGame(gameId: ${gameId})`);
        const transactionResponse: TransactionResponse = await idleGame.closeGame(gameId, override)
        console.log(`transaction: ${transactionResponse.hash}`);        
    
        await transactionResponse.wait(wait)
    
    }

    await closeGame(minerCurrentGameId);
    attackerTeamId && await closeGame(attackerCurrentGameId);

    // SETTLE GAME

    attackerTeamId && await settleGame(idleGame, attackerCurrentGameId, wait)

    // START GAME

    const startGame = async () =>{

        try {
            console.log(`callStatic.startGame(teamId: ${minerTeamId})`);
            await idleGame.callStatic.startGame(minerTeamId)
        } catch (error) {
            console.error(`ERROR: ${error.toString()}`)
            console.error(`ERROR: Not possible to start the game.`)
            return
        }
    
        // const minerNonce = await hre.ethers.provider.getTransactionCount(minerSigner.address)
        // let attackGasPrice = baseFee.mul(174).div(75) // f(x) = (174/75)x + 204/3 // x: base fee, f: gas price 
        //     .add(BigNumber.from(ONE_GWEI).mul(204).div(3)) // base fee 25 -> 126, base fee 100 -> 300
        // attackGasPrice = attackGasPrice.gt(ATTACK_MAX_GAS_PRICE) ? ATTACK_MAX_GAS_PRICE : attackGasPrice

        const attackOverrides = [
            override,
            override,
            // When the time between blocks is long enough the looters has better chance to win,
            // so it is necessary to rise the priority fee.
            {...override, maxPriorityFeePerGas: BigNumber.from(ONE_GWEI).mul(105)},
            {...override, maxPriorityFeePerGas: BigNumber.from(ONE_GWEI).mul(105)},
        ]

        const attackDelays = attackers.map( (attacker, index) => 900*(index+1) )

        console.log(`startGame(teamId: ${minerTeamId})`);
        const startGameTransactionResponsePromise = idleGame.startGame(minerTeamId, override)

        const attackTeamTransactionResponsesPromise = Promise.all(attackDelays.map( (delayMilis, index) => {
            return new Promise<TransactionResponse | undefined>( resolve => {
                setTimeout(async () => {
                    console.log(`attackTeam(minerTeamId: ${minerTeamId}, attackerTeamId: ${attackerTeamId})`);
                    try {
                        const attackTeamTransactionResponse = await attackers[index].attackTeam(minerTeamId, attackerTeamId, 
                            {...attackOverrides[index], maxFeePerGas: ATTACK_MAX_GAS_PRICE}
                            )
                        console.log(`transaction ${attackTeamTransactionResponse.hash}`, attackTeamTransactionResponse.blockNumber)
                        resolve(attackTeamTransactionResponse)
                    } catch (error) {
                        console.log('attackTeam', index, error.toString());
                        resolve(undefined)
                    }
                    
                }, delayMilis)
            })
        }))

        const [startGameTransactionResponse, ] = await Promise.all([startGameTransactionResponsePromise, attackTeamTransactionResponsesPromise])
        console.log(`transaction ${startGameTransactionResponse.hash}`, startGameTransactionResponse.blockNumber);

    }

    await startGame();

}

export const attachPlayer = async (hre: HardhatRuntimeEnvironment, contractAddress: string): Promise<Contract> => {

    const Player = (await hre.ethers.getContractFactory("Player"));

    return Player.attach(contractAddress)
}

export const attachAttackRouter = async (hre: HardhatRuntimeEnvironment, contractAddress: string): Promise<Contract> => {

    const Router = (await hre.ethers.getContractFactory("AttackRouter"));

    return Router.attach(contractAddress)
}

export const attachSettler = async (hre: HardhatRuntimeEnvironment, contractAddress: string): Promise<Contract> => {

    const Settler = (await hre.ethers.getContractFactory("Settler"));

    return Settler.attach(contractAddress)
}

export const deployPlayer = async (hre: HardhatRuntimeEnvironment, signer: SignerWithAddress | undefined): Promise<Contract> => {

    const { idleGame, crabada } = getCrabadaContracts(hre)

    const Player = (await hre.ethers.getContractFactory("Player")).connect(signer);
    const override = await getOverride(hre)
    override.gasLimit = 2500000
    const player = await Player.deploy(idleGame.address, crabada.address, override)

    return player
}

export const deployAttackRouter = async (hre: HardhatRuntimeEnvironment, signer: SignerWithAddress | undefined): Promise<Contract> => {

    const { idleGame, crabada } = getCrabadaContracts(hre)

    const AttackRouter = (await hre.ethers.getContractFactory("AttackRouter")).connect(signer);
    const override = await getOverride(hre)
    override.gasLimit = 2500000
    const router = await AttackRouter.deploy(override)

    return router
}

export const deploySettler = async (hre: HardhatRuntimeEnvironment, signer: SignerWithAddress | undefined): Promise<Contract> => {

    const Settler = (await hre.ethers.getContractFactory("Settler")).connect(signer);
    const override = await getOverride(hre)
    override.gasLimit = 2500000
    const settler = await Settler.deploy(override)

    return settler
}

export const getOverride = async (hre: HardhatRuntimeEnvironment) => {
    return ({maxFeePerGas: 40*ONE_GWEI, maxPriorityFeePerGas: ONE_GWEI, gasLimit: GAS_LIMIT, nonce: undefined})
}

export interface TeamInfo {
    startedGamesCount?: number,
    firstDefenseCount?: number,
    battlePoint?: TeamBattlePoints,
}

export type TeamInfoByTeam = { [teamId: string]: TeamInfo }

export const queryFilterByPage = async (
    hre: HardhatRuntimeEnvironment,
    contract: Contract, filter: ethers.EventFilter, fromBlock: number, toBlock :number, 
    log = console.log, queryPageSize=3600
) => {

    const eventsPromises = []
    for (
        let _fromBlock=fromBlock; 
        _fromBlock < toBlock; 
        _fromBlock+=queryPageSize
        )
        eventsPromises.push(contract.queryFilter(filter, _fromBlock, Math.min(_fromBlock+queryPageSize, hre.ethers.provider.blockNumber) ))

    const events = []
    for (const fightEventsPromise of eventsPromises){
        try {
            events.push(...(await fightEventsPromise))
        } catch (error) {
            log(`ERROR: events of ${queryPageSize} blocks were discarded`)
            throw(error)
        }
    }
    
    return events
}

export const getTeamsThatWereChanged = async (
    hre: HardhatRuntimeEnvironment, blockstoanalyze: number, log
     = console.log): Promise<BigNumber[]> => {

    const { idleGame } = getCrabadaContracts(hre)

    hre.ethers.provider.blockNumber

    const fromBlock = hre.ethers.provider.blockNumber-blockstoanalyze
    
    const addCrabadaEvents = await queryFilterByPage(hre, idleGame, idleGame.filters.AddCrabada(), fromBlock, hre.ethers.provider.blockNumber, log)

    type Teams = { [teamId: string]: BigNumber }
    
    const teamsThatWereChanged: Teams = {}
    const ADD_CRABADA_ARG_TEAM_ID = 0

    addCrabadaEvents.map( (e: ethers.Event) => {
        const { teamId } = e.args
        teamsThatWereChanged[(teamId as BigNumber).toString()] = teamId
    })

    return (Object.keys(teamsThatWereChanged).map( key => teamsThatWereChanged[key]))

}

export const updateTeamsThatWereChaged = async (
    hre: HardhatRuntimeEnvironment, teamInfoByTeam: TeamInfoByTeam,
    classNameByCrabada: ClassNameByCrabada,
    blockstoanalyze: number, log = console.log): Promise<TeamInfoByTeam> => {
    
    const teamsThatWereChanged: BigNumber[] = await getTeamsThatWereChanged(hre, blockstoanalyze, log)

    const { idleGame } = getCrabadaContracts(hre)
    
    await Promise.all(
        teamsThatWereChanged.map( async(teamId) => {

            if (!teamInfoByTeam[teamId.toString()])
                return

            teamInfoByTeam[teamId.toString()].battlePoint = 
                await TeamBattlePoints.createFromTeamId(idleGame, teamId, classNameByCrabada)

        })
    )

    return teamInfoByTeam
}
    
export const getTeamsThatPlayToLooseByTeamId = async (
    hre: HardhatRuntimeEnvironment, blockstoanalyze: number, 
    firstdefendwindow: number, classNameByCrabada: ClassNameByCrabada, log = console.log, queryPageSize=3600): Promise<TeamInfoByTeam> =>{

    const { idleGame } = getCrabadaContracts(hre)

    hre.ethers.provider.blockNumber

    const fromBlock = hre.ethers.provider.blockNumber-blockstoanalyze

    const fightEventsPromise = queryFilterByPage(hre, idleGame, idleGame.filters.Fight(), fromBlock, hre.ethers.provider.blockNumber, log)
    // gameId uint256
    // turn uint256
    // attackTeamId uint256
    // defenseTeamId uint256
    // soldierId uint256
    // attackTime uint256
    // attackPoint uint16
    // defensePoint uint16

    const toBlock = hre.ethers.provider.blockNumber-firstdefendwindow
    const startGameEvents = await queryFilterByPage(hre, idleGame, idleGame.filters.StartGame(), fromBlock, toBlock, log, queryPageSize)
    // gameId uint256
    // teamId uint256
    // duration uint256
    // craReward uint256
    // tusReward uint256

    const fightEvents = await fightEventsPromise

    log('startGameEvents', startGameEvents.length);

    const teamsBehaviour: TeamInfoByTeam = {}

    // It is retrieved the quantity of started games by team
    
    const START_GAME_TEAM_ID_ARG_INDEX=1

    for (const e of startGameEvents){
        const teamId: BigNumber = e.args[START_GAME_TEAM_ID_ARG_INDEX]
        const teamBehaviour = teamsBehaviour[teamId.toString()]
        teamsBehaviour[teamId.toString()] = {
            startedGamesCount: teamBehaviour ? teamBehaviour.startedGamesCount+1 : 1
        }
    }

    // It is retrieved the quantity of first defense by team, and battlePoints
    const FIGHT_DEFENSE_TEAM_ID_ARG_INDEX = 3
    const FIGHT_TURN_ARG_INDEX = 1
    const FIGHT_DEFENSE_POINT = 7

    for (const e of fightEvents){

        const defenseTeamId: BigNumber = e.args[FIGHT_DEFENSE_TEAM_ID_ARG_INDEX] as any
        const turn: BigNumber = e.args[FIGHT_TURN_ARG_INDEX] as any

        const firstDefenseCount = turn.toNumber() == 1 ? 1 : 0

        const teamBehaviour = teamsBehaviour[defenseTeamId.toString()]

        teamsBehaviour[defenseTeamId.toString()] = {
            ...teamsBehaviour[defenseTeamId.toString()],
            firstDefenseCount: teamBehaviour ? 
                teamBehaviour.firstDefenseCount ? teamBehaviour.firstDefenseCount+firstDefenseCount : firstDefenseCount
                : firstDefenseCount,
        }

    }

    // It is retrieved the quantity of teams that started a game and 
    // defended at least once.

    let teamsThatStartedGameAndFight = 0
    for (const teamId in teamsBehaviour){
        const teamBehaviour = teamsBehaviour[teamId]
        if (teamBehaviour.startedGamesCount){
            if (teamBehaviour.firstDefenseCount)
                teamsThatStartedGameAndFight = teamsThatStartedGameAndFight+1
        }
    }

    log('teamsThatStartedGameAndFight', teamsThatStartedGameAndFight);

    // Are obtained the teams that play to loose.
    const teamsThatPlayToLoose: TeamInfoByTeam = {}

    for (const teamId in teamsBehaviour){
        const teamBehaviour = teamsBehaviour[teamId]
        if (teamBehaviour.startedGamesCount && !teamBehaviour.firstDefenseCount)
            teamsThatPlayToLoose[teamId] = teamBehaviour
    }

    // For the looser teams, are obtained the mining points.

    await Promise.all(
        Object.keys(teamsThatPlayToLoose)
            .filter( (teamId) => !teamsThatPlayToLoose[teamId].battlePoint )
            .map( async (teamId) => {

                teamsThatPlayToLoose[teamId].battlePoint = 
                    await TeamBattlePoints.createFromTeamId(idleGame, BigNumber.from(teamId), classNameByCrabada)

            })
    )

    return teamsThatPlayToLoose

}

export const getTeamsBattlePoint = async (
    hre: HardhatRuntimeEnvironment, blockstoanalyze: number,
    classNameByCrabada: ClassNameByCrabada,
    log = console.log, queryPageSize=3600): Promise<TeamInfoByTeam> =>{

    const { idleGame } = getCrabadaContracts(hre)

    hre.ethers.provider.blockNumber

    const fromBlock = hre.ethers.provider.blockNumber-blockstoanalyze

    const fightEventsPromise = queryFilterByPage(hre, idleGame, idleGame.filters.Fight(), fromBlock, hre.ethers.provider.blockNumber, log)
    // gameId uint256
    // turn uint256
    // attackTeamId uint256
    // defenseTeamId uint256
    // soldierId uint256
    // attackTime uint256
    // attackPoint uint16
    // defensePoint uint16

    const fightEvents = await fightEventsPromise

    log('fightEvents', fightEvents.length);

    const battlePointByTeamId: TeamInfoByTeam = {}

    // It is retrieved the quantity of first defense by team, and battlePoints
    const FIGHT_DEFENSE_TEAM_ID_ARG_INDEX = 3
    const FIGHT_TURN_ARG_INDEX = 1
    const FIGHT_DEFENSE_POINT = 7

    for (const e of fightEvents){

        const turn: BigNumber = e.args[FIGHT_TURN_ARG_INDEX] as any

        if (!turn.isZero())
            continue

        const defenseTeamId: BigNumber = e.args[FIGHT_DEFENSE_TEAM_ID_ARG_INDEX] as any

        const defensePoint: number = turn.isZero() ? e.args[FIGHT_DEFENSE_POINT] : undefined

        if (defensePoint)
            battlePointByTeamId[defenseTeamId.toString()] = {
                battlePoint: await TeamBattlePoints.createFromTeamId(idleGame, BigNumber.from(defenseTeamId), classNameByCrabada)
            }

    }

    return battlePointByTeamId

}

export interface BlockDistanceDistribution {
    [distance: number]: number // quantity
}

export const isPossibleTarget = (teamsThatPlayToloose: TeamInfoByTeam, teamId: BigNumber, maxBattlePoints: TeamBattlePoints): boolean => {
    if (!teamsThatPlayToloose[teamId.toString()])
        return false

    if (!teamsThatPlayToloose[teamId.toString()].battlePoint)
        return false

    if (!teamsThatPlayToloose[teamId.toString()].battlePoint.isValid())
        return false

    if (teamsThatPlayToloose[teamId.toString()].battlePoint.gt(maxBattlePoints))
        return false
    
    return true
}

export type StartGameDistances = number[]

export interface CloseDistanceToStart {
    averageBlocks: number,
    standardDeviationBlocks: number
}

export interface CloseDistanceToStartByTeamId{
    [teamId: string]: CloseDistanceToStart
}


export const getCloseDistanceToStartByTeamId = async (
    hre: HardhatRuntimeEnvironment, blockstoanalyze: number, teamsThatPlayToLoose: TeamInfoByTeam, 
    log = console.log, queryPageSize=3600): Promise<CloseDistanceToStartByTeamId> => {

    const { idleGame } = getCrabadaContracts(hre)

    hre.ethers.provider.blockNumber

    const fromBlock = hre.ethers.provider.blockNumber-blockstoanalyze

    const startGameEventsPromise = queryFilterByPage(hre, idleGame, idleGame.filters.StartGame(), fromBlock, hre.ethers.provider.blockNumber, log)
    // gameId uint256
    // teamId uint256
    // duration uint256
    // craReward uint256
    // tusReward uint256

    const closeGameEvents: ethers.Event[] = await queryFilterByPage(hre, idleGame, idleGame.filters.CloseGame(), fromBlock, hre.ethers.provider.blockNumber, log, queryPageSize)
    // gameId uint256

    const startGameEvents: ethers.Event[] = await startGameEventsPromise

    console.log('closeGameEvents', closeGameEvents.length);
    console.log('startGameEvents', startGameEvents.length);
    

    interface BlockNumbersByEventKind{
        startGameBlockNumbers: number[],
        closeGameBlockNumbers: number[]
    }

    interface EventsBlockNumbersByTeam{
        [teamId: string]: BlockNumbersByEventKind
    }

    interface TeamIdByGameId{
        [gameId: string]: BigNumber
    }

    // Necessary for performance issues when calling idleGame.getGameBasicInfo
    // to get the teamId in CloseGame events.
    const teamIdByGameId: TeamIdByGameId = {}

    const eventsBlockNumbersByTeam: EventsBlockNumbersByTeam = {}

    const START_GAME_GAME_ID_ARG_INDEX=0
    const START_GAME_TEAM_ID_ARG_INDEX=1

    // Sets Fight block number for gameId when turn is zero
    for (const e of startGameEvents){

        const gameId: BigNumber = e.args[START_GAME_GAME_ID_ARG_INDEX]
        const teamId: BigNumber = e.args[START_GAME_TEAM_ID_ARG_INDEX]

        teamIdByGameId[gameId.toString()] = teamId

        eventsBlockNumbersByTeam[teamId.toString()] = eventsBlockNumbersByTeam[teamId.toString()] || {
            startGameBlockNumbers: [],
            closeGameBlockNumbers: []
        }

        eventsBlockNumbersByTeam[teamId.toString()].startGameBlockNumbers.push(e.blockNumber)

    }

    const CLOSE_GAME_GAME_ID_ARG_INDEX=0

    await Promise.all(closeGameEvents.map( async(e) => {

        const gameId: BigNumber = e.args[CLOSE_GAME_GAME_ID_ARG_INDEX]

        let teamId = teamIdByGameId[gameId.toString()]

        if (!teamId){
            const { teamId: _teamId } = await idleGame.getGameBasicInfo(gameId)
            teamId = _teamId
        }

        eventsBlockNumbersByTeam[teamId.toString()] = eventsBlockNumbersByTeam[teamId.toString()] || {
            startGameBlockNumbers: [],
            closeGameBlockNumbers: []
        }

        eventsBlockNumbersByTeam[teamId.toString()].closeGameBlockNumbers.push(e.blockNumber)

    }))

    const compareNumberAsc = (a,b) => a<b ? -1 : b<a ? 1 : 0

    const closeDistanceToStartByTeamId: CloseDistanceToStartByTeamId = {}

    Object.keys(eventsBlockNumbersByTeam)
        .forEach( teamId => {
            
            const eventsBlockNumbersForTeam = eventsBlockNumbersByTeam[teamId]

            eventsBlockNumbersForTeam.startGameBlockNumbers.sort(compareNumberAsc)
            eventsBlockNumbersForTeam.closeGameBlockNumbers.sort(compareNumberAsc)
    
            // We discard the teams that does not have the minimum number of events to
            // do de analysis.
            if (eventsBlockNumbersForTeam.startGameBlockNumbers.length < 2 || 
                eventsBlockNumbersForTeam.closeGameBlockNumbers.length < 2)
                return
            
            // If first StartGame event blocknumber is lower than first CloseGame event 
            // blocknumber, then we discard the first StartGame event.
            if (eventsBlockNumbersForTeam.startGameBlockNumbers[0] < eventsBlockNumbersForTeam.closeGameBlockNumbers[0] )
                eventsBlockNumbersForTeam.startGameBlockNumbers.shift()
    
            if (eventsBlockNumbersForTeam.startGameBlockNumbers.length==0 || 
                eventsBlockNumbersForTeam.closeGameBlockNumbers.length==0)
                return
    
            // If last StartGame event blocknumber is lower than last CloseGame event 
            // blocknumber, then we discard the last CloseGame event.
            if (eventsBlockNumbersForTeam.startGameBlockNumbers[eventsBlockNumbersForTeam.startGameBlockNumbers.length-1] 
                < eventsBlockNumbersForTeam.closeGameBlockNumbers[eventsBlockNumbersForTeam.closeGameBlockNumbers.length-1] )
                eventsBlockNumbersForTeam.closeGameBlockNumbers.pop()
    
            if (eventsBlockNumbersForTeam.startGameBlockNumbers.length != eventsBlockNumbersForTeam.closeGameBlockNumbers.length){
                //throw new Error(`There is a difference between startGameBlockNumbers and closeGameBlockNumbers quantities for team ${ teamId.toString() }: ${ eventsBlockNumbersForTeam }`);
                console.error(`There is a difference between startGameBlockNumbers and closeGameBlockNumbers quantities for team ${ teamId.toString() }: ${ eventsBlockNumbersForTeam }`);
                return

            }

            const distances: StartGameDistances = eventsBlockNumbersForTeam.closeGameBlockNumbers.map( (closeGameBlockNumber, index) => 
                eventsBlockNumbersForTeam.startGameBlockNumbers[index]-closeGameBlockNumber)


            const averageBlocks = distances
                .reduce( (prev, current) => prev+current, 0)/distances.length
            const varianceBlocks = distances
                .reduce( (prev, current) => prev+Math.pow(averageBlocks-current, 2), 0)/distances.length
            const standardDeviationBlocks = Math.sqrt(varianceBlocks)

            const farFromAverage = distances.map( (distance) => Math.abs(distance-averageBlocks) > 3*standardDeviationBlocks )

            const countFarFromAverage = farFromAverage.reduce((prev, current) => current ? prev+1 : prev, 0)

            if (countFarFromAverage == 1){

                // Discard the value far from average and recalculate

                const farFromAverageValue = farFromAverage.reduce((prev, current, currentIdex )=> current ? distances[currentIdex] : prev, distances[0])

                const newAverage = ((averageBlocks*distances.length)-farFromAverageValue)/(distances.length-1)
                const newVariance = ((varianceBlocks*distances.length)-Math.pow(averageBlocks-farFromAverageValue, 2))/(distances.length-1)

                closeDistanceToStartByTeamId[teamId] = {
                    averageBlocks: newAverage,
                    standardDeviationBlocks: Math.sqrt(newVariance),
                }

            }else{

                closeDistanceToStartByTeamId[teamId] = {
                    averageBlocks,
                    standardDeviationBlocks,
                }
    
            }
    
        })
    
    return closeDistanceToStartByTeamId

}

export const getDelayFrom = (timeFromInSeconds: number) => {
    return ((+new Date())/1000) - timeFromInSeconds
}

export const START_GAME_ENCODED_OPERATION = '0xe5ed1d59'

export const isTeamLocked = async (
    hre: HardhatRuntimeEnvironment, idleGame: Contract, teamId: number,
    log: (typeof console.log) = console.log) => {

    const teamInfoPromise = idleGame.getTeamInfo(teamId)

    const timestamp = await currentBlockTimeStamp(hre)

    const { lockTo } = await teamInfoPromise

    return await locked(teamId, lockTo, timestamp, log)

}

interface StartGameEvent {
    gameId: BigNumber,
    teamId: BigNumber,
    transactionHash: string,
    blockNumber: BigNumber,
}

/*
<610: 318-25
<620: 318-25
<630: 297-25
<640: 281-25
<650: 159-25
<660: 159-25
<670: 86-25
*/
const GAS_PERCENTUAL_PROBABILITY_TO_USE = 70

interface GasPriceScale {
    battlePointUpTo: number
    gasPricesByProbability: {
        70: number,
        80: number,
        90: number,
    }
}

const gasPriceScale: GasPriceScale[] = [
    { battlePointUpTo: 610, gasPricesByProbability: { 70: 176, 80: 296, 90: 326 } },
    { battlePointUpTo: 620, gasPricesByProbability: { 70: 183, 80: 317, 90: 341 } },
    { battlePointUpTo: 630, gasPricesByProbability: { 70: 155, 80: 236, 90: 318 } },
    { battlePointUpTo: 640, gasPricesByProbability: { 70: 154, 80: 238, 90: 320 } },
    { battlePointUpTo: 650, gasPricesByProbability: { 70: 154, 80: 238, 90: 319 } },
    { battlePointUpTo: 660, gasPricesByProbability: { 70: 130, 80: 183, 90: 318 } },
    { battlePointUpTo: 670, gasPricesByProbability: { 70: 92, 80: 137, 90: 204 } },
]


abstract class AttackStrategy{

    connectedContract: Contract
    looterTeamId: number
    nodeId: number
    isEliteTeam: boolean

    constructor(connectedContract: Contract, looterTeamId: number, nodeId: number, isEliteTeam: boolean){
        this.connectedContract = connectedContract
        this.looterTeamId = looterTeamId
        this.nodeId = nodeId
        this.isEliteTeam = isEliteTeam
    }

    abstract attack(e: StartGameEvent, targetBattlePoint: TeamBattlePoints): Promise<TransactionResponse>

    abstract attackCallStatic(e: StartGameEvent, targetBattlePoint: TeamBattlePoints): Promise<TransactionResponse>

    getAttackMaxPriorityFee(targetBattlePoint: number): BigNumber{

        for(const gasPrice of gasPriceScale){
            if (targetBattlePoint <= gasPrice.battlePointUpTo)
                return (BigNumber
                    .from(ONE_GWEI)
                    .mul(gasPrice.gasPricesByProbability[GAS_PERCENTUAL_PROBABILITY_TO_USE]-25)
                    .add(this.nodeId))
        }

        return (BigNumber
            .from(ONE_GWEI)
            .mul(gasPriceScale[gasPriceScale.length-1].gasPricesByProbability[GAS_PERCENTUAL_PROBABILITY_TO_USE]-25)
            .add(this.nodeId))

    }

    getOverride(targetBattlePoint: TeamBattlePoints){


        return ({
            gasLimit: GAS_LIMIT,
            maxFeePerGas: ATTACK_MAX_GAS_PRICE,
            maxPriorityFeePerGas: this.getAttackMaxPriorityFee(targetBattlePoint.realBP)
        })
    }
}

class IddleGameAttackStrategy extends AttackStrategy{

    async attack(e: StartGameEvent, targetBattlePoint: TeamBattlePoints): Promise<TransactionResponse>{

        return await this.connectedContract.attack(e.gameId, this.looterTeamId, this.getOverride(targetBattlePoint))

    }

    async attackCallStatic(e: StartGameEvent, targetBattlePoint: TeamBattlePoints): Promise<TransactionResponse>{

        return await this.connectedContract.callStatic.attack(e.gameId, this.looterTeamId, this.getOverride(targetBattlePoint))

    }

}

class PlayerAttackStrategy extends AttackStrategy{

    async attack(e: StartGameEvent, targetBattlePoint: TeamBattlePoints): Promise<TransactionResponse>{

        return await this.connectedContract.attackTeam(e.teamId, this.looterTeamId, this.getOverride(targetBattlePoint))

    }

    async attackCallStatic(e: StartGameEvent, targetBattlePoint: TeamBattlePoints): Promise<TransactionResponse>{

        return await this.connectedContract.callStatic.attackTeam(e.teamId, this.looterTeamId, this.getOverride(targetBattlePoint))

    }

}

const createAttackStrategy = async (
    hre: HardhatRuntimeEnvironment, looterteamid: number, 
    signer: SignerWithAddress, isEliteTeam: boolean, playerAddress: string): Promise<AttackStrategy> => {

        if (playerAddress){

            const Player = (await hre.ethers.getContractFactory("Player"));

            return new PlayerAttackStrategy(
                Player.attach(playerAddress).connect(signer),
                looterteamid, hre.config.nodeId, isEliteTeam
            )

        }

        const { idleGame } = getCrabadaContracts(hre)

        return new IddleGameAttackStrategy(
            idleGame.connect(signer),
            looterteamid, hre.config.nodeId, isEliteTeam
        )
        
    }


const _shoudReinforce = (attackId1: BigNumber, attackId2: BigNumber, defId1: BigNumber, defId2: BigNumber): boolean => {

    if (defId1.isZero())
        return false

    if (attackId1.isZero())
        return true

    if (defId2.isZero())
        return false

    if (attackId2.isZero())
        return true

    return false
}

interface CrabadaAPIInfo{ 
    hp: number, 
    damage: number, 
    armor: number 
}

export const _battlePoint = ({ hp, damage, armor }: CrabadaAPIInfo): number => {
    return hp+damage+armor
}

import axios from "axios";
import { CONFIG_BY_NODE_ID, NodeConfig } from "../config/nodes";
import { ClassNameByCrabada, CrabadaClassName, TeamBattlePoints } from "./teambp";

export class CrabadaAPI{

    // TODO Read chain data using Crabada contract: const { dna } = await crabada.crabadaInfo(4887)
    async getCrabadaInfo(crabadaId: BigNumber): Promise<CrabadaAPIInfo>{

        const response: { 
            result: CrabadaAPIInfo 
        } = (await axios.get(`https://api.crabada.com/public/crabada/info/${ crabadaId.toString() }`))
            .data

        return response.result

    }

    async getCrabadasInTabernOrderByPrice(): Promise<CrabadaInTabern[]>{

        interface ResponseObject { 
            id: string,
            price: string,
            is_being_borrowed: number,
            battle_point: number,
            mine_point: number
        }

        interface Response {
            result: {
                totalRecord: number
                data: ResponseObject[] 
            } 
        }

        const quanResponse: Response = (await axios.get(`https://idle-api.crabada.com/public/idle/crabadas/lending?limit=1&page=1`))
            .data

        console.log('Lending totalRecord', quanResponse.result.totalRecord);

        const responses: { 
            result: { 
                data: ResponseObject[] 
            } 
        }[] = (await Promise.all(
            Array.from(Array(Math.round((quanResponse.result.totalRecord/50)+0.5)).keys())
            .map( value => value+1 )
            .map( async (page: number) => {
                try {
                    const url = `https://idle-api.crabada.com/public/idle/crabadas/lending?orderBy=price&order=asc&limit=50&page=${page}`
                    console.log(url);
                    return (await axios.get(url)).data
                } catch (error) {
                    error(`ERROR getting page for lending API`, String(error))
                    return undefined
                }
            })
        )).filter(x=>x)

        return responses.map( response => {
            return response.result.data.map( o => {
                try {
                    return {
                        id: BigNumber.from(o.id),
                        price: BigNumber.from(String(o.price)),
                        is_being_borrowed: o.is_being_borrowed ? true : false,
                        battle_point: o.battle_point,
                        mine_point: o.mine_point
                    }
                } catch (error) {
                    return undefined
                }
            }).filter(x=>x)
        }).flat()

    }

    async getClassNameByCrabada(): Promise<ClassNameByCrabada>{

        interface ResponseObject { 
            id: string,
            class_name: string,
        }

        interface Response {
            result: {
                totalRecord: number
                data: ResponseObject[] 
            } 
        }

        const quanResponse: Response = (await axios.get(`https://api.crabada.com/public/crabada/all?limit=1&page=1`))
            .data

        const response: Response = (await axios.get(`https://api.crabada.com/public/crabada/all?limit=${ quanResponse.result.totalRecord+1000 }&page=1`))
            .data

        const result: ClassNameByCrabada = {}

        for (const crabada of response.result.data){

            if (!crabada.class_name)
                continue

            result[crabada.id] = (crabada.class_name as CrabadaClassName)

        }

        return result
    
    }
    
}

export const API = new CrabadaAPI()

export const getReinforcementMinBattlePoints = async (hre: HardhatRuntimeEnvironment,
    looterTeamId: BigNumber, classNameByCrabada: ClassNameByCrabada): Promise<number> => {

    const { idleGame, crabada } = getCrabadaContracts(hre)

    const { currentGameId } = await idleGame.getTeamInfo(looterTeamId)

    const looterBattlePoint: TeamBattlePoints = await TeamBattlePoints.createFromTeamId(idleGame, looterTeamId, classNameByCrabada)

    const { teamId: minerTeamId } = await idleGame.getGameBasicInfo(currentGameId)

    const { attackId1, attackId2, defId1, defId2 } = await idleGame.getGameBattleInfo(currentGameId)
    
    const minerBattlePoint: TeamBattlePoints = await TeamBattlePoints.createFromTeamId(idleGame, minerTeamId, classNameByCrabada)
    
    const crabadaIdToBattlePointPromise = async(crabadaId): Promise<number> => {
        if (crabadaId.isZero())
            return 0
        const crabadaInfo = await API.getCrabadaInfo(crabadaId) // https://api.crabada.com/public/crabada/info/18410 -> const { hp, damage, armor} response.result
        return _battlePoint(crabadaInfo)
    }

    const sum = (prev, current) => prev+current

    const attackReinforceBattlePoint = (await Promise.all([ attackId1, attackId2 ].map(crabadaIdToBattlePointPromise)))
        .reduce(sum,0)
    
    const defenseReinforceBattlePoint = (await Promise.all([ defId1, defId2 ].map( crabadaIdToBattlePointPromise )))
        .reduce(sum,0)
    
    const minBattlePointNeeded = minerBattlePoint.getRelativeBP(looterBattlePoint.teamFaction)
        +defenseReinforceBattlePoint
        +1
        -looterBattlePoint.getRelativeBP(minerBattlePoint.teamFaction)
        -attackReinforceBattlePoint
    
    return minBattlePointNeeded

}

export interface CrabadaToBorrow {
    id: BigNumber,
    price: BigNumber
}

export interface CrabadaInTabern{ 
    id: BigNumber,
    price: BigNumber,
    is_being_borrowed: boolean,
    battle_point: number,
    mine_point: number
}

const BORROW_STEP_PRICE_IN_TUS = 2
const BORROW_MAX_PRICE_IN_TUS = 36
const BORROW_PRICE_STEPS = Math.floor((BORROW_MAX_PRICE_IN_TUS/BORROW_STEP_PRICE_IN_TUS)+0.5)
const PRICE_RANGES = Array.from(Array(BORROW_PRICE_STEPS).keys())
.map( step => ({minPriceInTus: step*BORROW_STEP_PRICE_IN_TUS, maxPriceInTus: (step+1)*BORROW_STEP_PRICE_IN_TUS}) )
.map( ({minPriceInTus, maxPriceInTus}) => ({
    minPrice: parseEther(String(minPriceInTus)),
    maxPrice: parseEther(String(maxPriceInTus)),
}))

export const getCrabadasToBorrow = async (minBattlePointNeeded: number): Promise<CrabadaToBorrow[]> => {

    const crabadasInTabernOrderByPrice: CrabadaInTabern[] = await API.getCrabadasInTabernOrderByPrice() //https://idle-api.crabada.com/public/idle/crabadas/lending?orderBy=price&order=asc&limit=100

    console.log('crabadasInTabernOrderByPrice', crabadasInTabernOrderByPrice.length);

    const possibleCrabadasToBorrowOrderByPrice = crabadasInTabernOrderByPrice
        .filter( x => x.battle_point >= minBattlePointNeeded)

    console.log('possibleCrabadasToBorrowOrderByPrice', possibleCrabadasToBorrowOrderByPrice.length);

    const crabadasToBorrowOrderByBattlePointDescByPriceSteps: CrabadaInTabern[] = PRICE_RANGES
        .map( ({minPrice, maxPrice}) => {
            const crabadasToBorrowForPriceStep = possibleCrabadasToBorrowOrderByPrice
                .filter( x => x.price.gt(minPrice))
                .filter( x => x.price.lte(maxPrice))
                .sort( (a,b) => 
                    a.battle_point<b.battle_point ? 1 : a.battle_point>b.battle_point ? -1 : // battle_point descending
                    a.price.lt(b.price) ? -1 : a.price.gt(b.price) ? 1 : 0 // price ascending
                    )
            return crabadasToBorrowForPriceStep
        })
        .flat()

    console.log('crabadasToBorrow', crabadasToBorrowOrderByBattlePointDescByPriceSteps.length);

    return crabadasToBorrowOrderByBattlePointDescByPriceSteps

}

export const setMaxAllowanceIfNotApproved = async (hre: HardhatRuntimeEnvironment, signer: SignerWithAddress, spender: string, player: string|undefined): Promise<TransactionResponse|undefined> => {

    const { tusToken } = getCrabadaContracts(hre)

    const allowance: BigNumber = await tusToken.allowance(player ? player : signer.address, spender)

    const override = {
        gasLimit: GAS_LIMIT,
        maxFeePerGas: MAX_FEE,
        maxPriorityFeePerGas: ONE_GWEI
    }

    if (allowance.lt(ethers.constants.MaxUint256.div(2))){

        let tr: TransactionResponse;

        if (player){

            const playerContract = await attachPlayer(hre, player)
            console.log('playerContract.approveERC20(tusToken, spender, MaxUint256)', 
                tusToken.address, spender, formatEther(ethers.constants.MaxUint256));
            await playerContract.connect(signer).callStatic.approveERC20(tusToken.address, spender, ethers.constants.MaxUint256, override);
            tr = await playerContract.connect(signer).approveERC20(tusToken.address, spender, ethers.constants.MaxUint256, override);

        }else{

            console.log('tusToken.approve(spender, MaxUint256)', spender, formatEther(ethers.constants.MaxUint256));
            await tusToken.connect(signer).callStatic.approve(spender, ethers.constants.MaxUint256, override)
            tr = await tusToken.connect(signer).approve(spender, ethers.constants.MaxUint256, override)
    
        }

        console.log('Transaction hash', tr.hash);
        return tr
    }

}

export const doReinforce = async (hre: HardhatRuntimeEnvironment,
    currentGameId: BigNumber, minRealBattlePointNeeded: number,
    signer: SignerWithAddress, player: string|undefined, testMode=true): Promise<TransactionResponse|undefined> => {

    const { idleGame } = getCrabadaContracts(hre)
    
    const borrowOptions: CrabadaToBorrow[] = await getCrabadasToBorrow(minRealBattlePointNeeded)
    
    const override = {
        gasLimit: GAS_LIMIT,
        maxFeePerGas: MAX_FEE,
        maxPriorityFeePerGas: ONE_GWEI
    }

    for (const { id: crabadaId, price: borrowPrice } of borrowOptions){

        if (player){

            const playerContract = await attachPlayer(hre, player)
    
            try {
    
                console.log('playerContract.reinforceAttack(currentGameId, crabadaId, borrowPrice)', currentGameId.toString(), crabadaId.toString(), formatEther(borrowPrice));
    
                await playerContract.connect(signer).callStatic.reinforceAttack(currentGameId, crabadaId, borrowPrice, override)
    
                if (!testMode){
                    const tr: TransactionResponse = await playerContract.connect(signer).reinforceAttack(currentGameId, crabadaId, borrowPrice, override)
            
                    console.log('Transaction hash', tr.hash);
                
                    return tr
                }
    
            } catch (error) {
                
                console.error('ERROR when trying to reinforce:', String(error));

            }
    
        }else{
    
            try {

                console.log('idleGame.reinforceAttack(currentGameId, crabadaId, borrowPrice)', currentGameId.toString(), crabadaId.toString(), formatEther(borrowPrice));
        
                await idleGame.connect(signer).callStatic.reinforceAttack(currentGameId, crabadaId, borrowPrice, override)
        
                if (!testMode){
                    const tr: TransactionResponse = await idleGame.connect(signer).reinforceAttack(currentGameId, crabadaId, borrowPrice, override)
            
                    console.log('Transaction hash', tr.hash);
                
                    return tr
                }

            } catch (error) {
                
                console.error('ERROR when trying to reinforce:', String(error));

            }
        
        }

    }

}

export const reinforce = async (hre: HardhatRuntimeEnvironment,
    looterTeamId: number, signer: SignerWithAddress, player: string|undefined,
    classNameByCrabada: ClassNameByCrabada,
    log: (typeof console.log) = console.log, testMode=true): Promise<TransactionResponse|undefined> => {

    const { idleGame } = getCrabadaContracts(hre);

    if (!(await isTeamLocked(hre, idleGame, looterTeamId)))
        return

    if (!testMode){
        const tr = await setMaxAllowanceIfNotApproved(hre, signer, idleGame.address, player)
        await tr?.wait(5)
    }

    const { currentGameId } = await idleGame.getTeamInfo(looterTeamId)

    log('currentGameId', currentGameId.toString())

    if (currentGameId.isZero())
        return

    const { attackId1, attackId2, defId1, defId2 } = await idleGame.getGameBattleInfo(currentGameId)

    log('attackId1, attackId2, defId1, defId2', [ attackId1, attackId2, defId1, defId2 ].map(x => x.toString()))

    if (!_shoudReinforce(attackId1, attackId2, defId1, defId2))
        return

    const reinforcementMinBattlePoints: number = await getReinforcementMinBattlePoints(
        hre, BigNumber.from(looterTeamId), classNameByCrabada
    )

    log('reinforcementMinBattlePoints', reinforcementMinBattlePoints)

    return await doReinforce(hre, currentGameId, reinforcementMinBattlePoints, signer, player, testMode)

}

export const MIN_BATTLE_POINTS_FOR_ELITE_TEAM = 655

export const loot = async (
    hre: HardhatRuntimeEnvironment, teamsThatPlayToLooseByTeamId: TeamInfoByTeam, 
    looterteamid: number, signer: SignerWithAddress, 
    classNameByCrabada: ClassNameByCrabada,
    log: (typeof console.log) = console.log, testMode=true, playerAddress?: string): Promise<TransactionResponse|undefined> => {

    const nodeConfig: NodeConfig = CONFIG_BY_NODE_ID[hre.config.nodeId]

    const { idleGame } = getCrabadaContracts(hre)

    const { lockTo: looterLockTo, currentGameId: looterCurrentGameId } = await idleGame.getTeamInfo(looterteamid)

    const looterBattlePoint: TeamBattlePoints = await TeamBattlePoints.createFromTeamId(idleGame, looterteamid, classNameByCrabada)

    const attackStrategy = await createAttackStrategy(hre, looterteamid, signer, false, playerAddress)

    const timestamp = await currentBlockTimeStamp(hre)

    if (!testMode){

        if (await locked(looterteamid, looterLockTo, timestamp, log))
            return

        await settleGame(idleGame.connect(signer), looterCurrentGameId, 10, log)

    }

    const START_GAME_FILTER = {
        fromBlock: nodeConfig.lootConfig.startGameFilterMode,
        toBlock: nodeConfig.lootConfig.startGameFilterMode,
        address: idleGame.address,
        topics: [ '0x0eef6f7452b7d2ee11184579c086fb47626e796a83df2b2e16254df60ab761eb' ]
    };
    
    const provider = hre.ethers.provider
    
    const startGameFilterId = await provider.send("eth_newFilter", [START_GAME_FILTER]);

    const lootedGame: { [gameId:string]: boolean } = {}
    
    return await (new Promise((resolve) => {

        const clearIntervalsAndExit = (attackStartedGameInterval: NodeJS.Timer, settleGameInterval: NodeJS.Timer, exitInterval: NodeJS.Timer) => {
            clearInterval(attackStartedGameInterval)
            clearInterval(settleGameInterval)
            clearInterval(exitInterval)
            resolve(undefined)
        }

        // In case a settleGame was needed, but an error happens when transaction was performed,
        // to avoid attack transactions to be reverted with 'GAME:TEAM IS BUSY', we set an
        // interval to call settleGame every minute.
        const settleGameInterval = setInterval(async()=>{
            await settleGame(idleGame.connect(signer), looterCurrentGameId, 1, log)
        }, 60*1000)

        const attackStartedGameInterval = setInterval(async () => {

            const fightLogsPromise: Promise<any[]> = provider.send("eth_getFilterChanges", [startGameFilterId])

            const startGameLogs: any[] = (await provider.send("eth_getFilterChanges", [startGameFilterId]))
                .sort((a, b) =>
                ( a.blockNumber < b.blockNumber ? -1 
                : a.blockNumber > b.blockNumber ? 1
                : 0 ) * -1 // Sorted descending by blocknumber
            )

            const fightLogs = await fightLogsPromise

            for (const fightLog of fightLogs){
                const gameId = BigNumber.from((fightLog.data as string).slice(0,66))
                const turn = BigNumber.from('0x'+(fightLog.data as string).slice(66,130))
                if (turn.isZero)
                    lootedGame[gameId.toString()] = true
            }

            for (const log of startGameLogs){
                const gameId = BigNumber.from((log.data as string).slice(0,66))
                if (lootedGame[gameId.toString()]){
                    console.log('Game already looted', gameId.toString());
                    //delete lootedGame[gameId.toString()] // TODO Verify if needed for performance improvement.
                    continue
                }
                const teamId = BigNumber.from('0x'+(log.data as string).slice(66,130))
                const blockNumber = BigNumber.from(log.blockNumber)
                /* no await */ attackStartedGame({ gameId, teamId, transactionHash: log.transactionHash, blockNumber })
            }
        }, 10)

        const exitInterval = setInterval(async () =>{
            if (!testMode && await isTeamLocked(hre, idleGame, looterteamid, ()=>{})){
                clearIntervalsAndExit(attackStartedGameInterval, settleGameInterval, exitInterval)
            }
        }, 3*1000)

        if (testMode){
            setTimeout(async () =>{
                clearIntervalsAndExit(attackStartedGameInterval, settleGameInterval, exitInterval)
            }, 30*1000)
        }

        let attackInProgress = false

        const attackStartedGame = async (e: StartGameEvent) => {

            log(+new Date()/1000, 'Pending startGame transaction (hash, block, gameId)', e.transactionHash, e.blockNumber.toNumber(), e.gameId.toNumber());

            if (attackInProgress){
                log('StartGame event discarded. Attack in progress')
                return
            }

            const possibleTarget = teamsThatPlayToLooseByTeamId[e.teamId.toString()]
            
            if (!possibleTarget)
                return
            
            if (!possibleTarget.battlePoint)
                return
            
            if (// Invalid battlePoint
                (!possibleTarget.battlePoint.isValid()) || 
                // Stronger than looter
                possibleTarget.battlePoint.gte(looterBattlePoint))
                return

            attackInProgress = true
            log('Begin Attack', '(teamId, teamIdHex, gameId, gameIdHex)', e.teamId.toNumber(), e.teamId.toHexString(), e.gameId.toNumber(), e.gameId.toHexString());

            let transactionResponse: TransactionResponse

            try {

                if (!testMode){

                    transactionResponse = await attackStrategy.attack(e, possibleTarget.battlePoint)

                }
                else{

                    transactionResponse = await attackStrategy.attackCallStatic(e, possibleTarget.battlePoint)

                }


            } catch (error) {

                log(`ERROR: ${error.toString()}`);
                
            }

            log('End Attack');

            if (!testMode && await isTeamLocked(hre, idleGame, looterteamid, ()=>{})){
                clearIntervalsAndExit(attackStartedGameInterval, settleGameInterval, exitInterval)
                return
            }

            attackInProgress = false

        }

    }))

}

