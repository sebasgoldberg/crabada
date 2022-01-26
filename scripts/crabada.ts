import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as IdleGameAbi from "../abis/IdleGame.json"
import * as ERC20Abi from "../abis/ERC20.json"
import * as CrabadaAbi from "../abis/Crabada.json"
import { BigNumber, Contract, ethers } from "ethers";
import { TransactionResponse } from "@ethersproject/abstract-provider";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { formatEther, formatUnits } from "ethers/lib/utils";

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

export const deployPlayer = async (hre: HardhatRuntimeEnvironment, signer: SignerWithAddress | undefined): Promise<Contract> => {

    if (!signer){
        signer = (await hre.ethers.getSigners())[0]
    }

    const { idleGame, crabada } = getCrabadaContracts(hre)

    const Player = (await hre.ethers.getContractFactory("Player")).connect(signer);
    const override = await getOverride(hre)
    override.gasLimit = 2500000
    const player = await Player.deploy(idleGame.address, crabada.address, override)

    return player
}

export const getOverride = async (hre: HardhatRuntimeEnvironment) => {
    return ({maxFeePerGas: 30*ONE_GWEI, maxPriorityFeePerGas: ONE_GWEI, gasLimit: GAS_LIMIT, nonce: undefined})
}

export interface TeamInfo {
    startedGamesCount?: number,
    firstDefenseCount?: number,
    battlePoint?: number,
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

export const getPossibleTargetsByTeamId = async (
    hre: HardhatRuntimeEnvironment, teamsThatPlayToLoose: TeamInfoByTeam, 
    maxbattlepoints: number, log = console.log): Promise<TeamInfoByTeam> =>{

    const possibleTargetsByTeam: TeamInfoByTeam = {}

    for (const teamId in teamsThatPlayToLoose){
        if (teamsThatPlayToLoose[teamId].battlePoint < maxbattlepoints)
            possibleTargetsByTeam[teamId] = teamsThatPlayToLoose[teamId]
    }

    log(`Possible targets below ${maxbattlepoints} battle points`, Object.keys(possibleTargetsByTeam).length)

    return possibleTargetsByTeam
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
    blockstoanalyze: number, log = console.log): Promise<TeamInfoByTeam> => {
    
    const teamsThatWereChanged: BigNumber[] = await getTeamsThatWereChanged(hre, blockstoanalyze, log)

    const { idleGame } = getCrabadaContracts(hre)
    
    await Promise.all(
        teamsThatWereChanged.map( async(teamId) => {
            const { battlePoint } = await idleGame.getTeamInfo(teamId)
            teamInfoByTeam[teamId.toString()]
                && (teamInfoByTeam[teamId.toString()].battlePoint = battlePoint)
        })
    )

    return teamInfoByTeam
}
    
export const getTeamsThatPlayToLooseByTeamId = async (
    hre: HardhatRuntimeEnvironment, blockstoanalyze: number, 
    firstdefendwindow: number, log = console.log, queryPageSize=3600): Promise<TeamInfoByTeam> =>{

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

        const defensePoint: number = turn.isZero() ? e.args[FIGHT_DEFENSE_POINT] : undefined

        teamsBehaviour[defenseTeamId.toString()] = {
            ...teamsBehaviour[defenseTeamId.toString()],
            firstDefenseCount: teamBehaviour ? 
                teamBehaviour.firstDefenseCount ? teamBehaviour.firstDefenseCount+firstDefenseCount : firstDefenseCount
                : firstDefenseCount,
            battlePoint: defensePoint ? 
                defensePoint : teamBehaviour ?
                teamBehaviour.battlePoint : undefined
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
                const { battlePoint } = await idleGame.getTeamInfo(teamId)
                teamsThatPlayToLoose[teamId].battlePoint = battlePoint
            })
    )

    return teamsThatPlayToLoose

}

export interface BlockDistanceDistribution {
    [distance: number]: number // quantity
}

export const isPossibleTarget = (teamsThatPlayToloose, teamId, maxBattlePoints): boolean => {
    if (!teamsThatPlayToloose[teamId.toString()])
        return false

    if (!teamsThatPlayToloose[teamId.toString()].battlePoint)
        return false

    if (teamsThatPlayToloose[teamId.toString()].battlePoint < MIN_VALID_BATTLE_POINTS)
        return false

    if (teamsThatPlayToloose[teamId.toString()].battlePoint > maxBattlePoints)
        return false
    
    return true
}

export const fightDistanceDistribution = async (
    hre: HardhatRuntimeEnvironment, blockstoanalyze: number, teamsThatPlayToloose: TeamInfoByTeam, 
    maxBattlePoints: number, log = console.log, queryPageSize=3600): Promise<BlockDistanceDistribution> =>{

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

    const startGameEvents: ethers.Event[] = await queryFilterByPage(hre, idleGame, idleGame.filters.StartGame(), fromBlock, hre.ethers.provider.blockNumber, log, queryPageSize)
    // gameId uint256
    // teamId uint256
    // duration uint256
    // craReward uint256
    // tusReward uint256

    const fightEvents: ethers.Event[] = await fightEventsPromise

    interface FightDistance {
        startGameBlocknumber: number,
        fight0Blocknumber?: number,
    }

    interface FightDistanceByGameId {
        [gameId: string]: FightDistance
    }

    const fightDistanceByGameId: FightDistanceByGameId = {}

    const START_GAME_GAME_ID_ARG_INDEX=0
    const START_GAME_TEAM_ID_ARG_INDEX=1

    // Sets StartGame block number for gameId
    for (const e of startGameEvents){

        const teamId: BigNumber = e.args[START_GAME_TEAM_ID_ARG_INDEX]

        if (!isPossibleTarget(teamsThatPlayToloose, teamId, maxBattlePoints))
            continue

        const gameId: BigNumber = e.args[START_GAME_GAME_ID_ARG_INDEX]
        
        fightDistanceByGameId[gameId.toString()] = {
            startGameBlocknumber: e.blockNumber
        }
    }

    const FIGHT_GAME_ID_ARG_INDEX = 0
    const FIGHT_TURN_ARG_INDEX = 1
    const FIGHT_DEFENSE_TEAM_ID = 3

    // Sets Fight block number for gameId when turn is zero
    for (const e of fightEvents){

        const teamId: BigNumber = e.args[FIGHT_DEFENSE_TEAM_ID]

        if (!isPossibleTarget(teamsThatPlayToloose, teamId, maxBattlePoints))
            continue

        const gameId: BigNumber = e.args[FIGHT_GAME_ID_ARG_INDEX]

        const turn: BigNumber = e.args[FIGHT_TURN_ARG_INDEX] as any

        if (!turn.isZero())
            continue

        if (!fightDistanceByGameId[gameId.toString()])
            continue

        fightDistanceByGameId[gameId.toString()].fight0Blocknumber = e.blockNumber
    }

    const blockDistanceDistribution: BlockDistanceDistribution = {}

    for (const gameId in fightDistanceByGameId){
        const fightDistance = fightDistanceByGameId[gameId]
        if (!fightDistance.fight0Blocknumber)
            continue
        const distance = fightDistance.fight0Blocknumber-fightDistance.startGameBlocknumber
        blockDistanceDistribution[distance] = blockDistanceDistribution[distance] || 0
        blockDistanceDistribution[distance]++
    }

    return blockDistanceDistribution

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
    
            if (eventsBlockNumbersForTeam.startGameBlockNumbers.length==0 || 
                eventsBlockNumbersForTeam.closeGameBlockNumbers.length==0)
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

export const closeGameToStartGameDistances = async (
    hre: HardhatRuntimeEnvironment, blockstoanalyze: number, teamsThatPlayToLoose: TeamInfoByTeam, 
    maxBattlePoints: number, log = console.log, queryPageSize=3600): Promise<StartGameDistances> =>{

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

        if (!isPossibleTarget(teamsThatPlayToLoose, teamId, maxBattlePoints))
            continue

        eventsBlockNumbersByTeam[teamId.toString()] = eventsBlockNumbersByTeam[teamId.toString()] || {
            startGameBlockNumbers: [],
            closeGameBlockNumbers: []
        }

        eventsBlockNumbersByTeam[teamId.toString()].startGameBlockNumbers.push(e.blockNumber)

    }

    const CLOSE_GAME_GAME_ID_ARG_INDEX=0

    closeGameEvents.forEach( (e) => {

        const gameId: BigNumber = e.args[CLOSE_GAME_GAME_ID_ARG_INDEX]

        const teamId = teamIdByGameId[gameId.toString()]

        if (!teamId)
            return

        if (!isPossibleTarget(teamsThatPlayToLoose, teamId, maxBattlePoints))
            return

        eventsBlockNumbersByTeam[teamId.toString()] = eventsBlockNumbersByTeam[teamId.toString()] || {
            startGameBlockNumbers: [],
            closeGameBlockNumbers: []
        }

        eventsBlockNumbersByTeam[teamId.toString()].closeGameBlockNumbers.push(e.blockNumber)

    })

    const compareNumberAsc = (a,b) => a<b ? -1 : b<a ? 1 : 0

    return Object.keys(eventsBlockNumbersByTeam)
        .map( teamId => {
            
            const eventsBlockNumbersForTeam = eventsBlockNumbersByTeam[teamId]

            eventsBlockNumbersForTeam.startGameBlockNumbers.sort(compareNumberAsc)
            eventsBlockNumbersForTeam.closeGameBlockNumbers.sort(compareNumberAsc)
    
            if (eventsBlockNumbersForTeam.startGameBlockNumbers.length==0 || 
                eventsBlockNumbersForTeam.closeGameBlockNumbers.length==0)
                return []
            
            // If first StartGame event blocknumber is lower than first CloseGame event 
            // blocknumber, then we discard the first StartGame event.
            if (eventsBlockNumbersForTeam.startGameBlockNumbers[0] < eventsBlockNumbersForTeam.closeGameBlockNumbers[0] )
                eventsBlockNumbersForTeam.startGameBlockNumbers.shift()
    
            if (eventsBlockNumbersForTeam.startGameBlockNumbers.length==0 || 
                eventsBlockNumbersForTeam.closeGameBlockNumbers.length==0)
                return []
    
            // If last StartGame event blocknumber is lower than last CloseGame event 
            // blocknumber, then we discard the last CloseGame event.
            if (eventsBlockNumbersForTeam.startGameBlockNumbers[eventsBlockNumbersForTeam.startGameBlockNumbers.length-1] 
                < eventsBlockNumbersForTeam.closeGameBlockNumbers[eventsBlockNumbersForTeam.closeGameBlockNumbers.length-1] )
                eventsBlockNumbersForTeam.closeGameBlockNumbers.pop()
    
            if (eventsBlockNumbersForTeam.startGameBlockNumbers.length != eventsBlockNumbersForTeam.closeGameBlockNumbers.length){
                //throw new Error(`There is a difference between startGameBlockNumbers and closeGameBlockNumbers quantities for team ${ teamId.toString() }: ${ eventsBlockNumbersForTeam }`);
                console.error(`There is a difference between startGameBlockNumbers and closeGameBlockNumbers quantities for team ${ teamId.toString() }: ${ eventsBlockNumbersForTeam }`);
                return []

            }

            const distances: StartGameDistances = []

            return eventsBlockNumbersForTeam.closeGameBlockNumbers.map( (closeGameBlockNumber, index) => 
                eventsBlockNumbersForTeam.startGameBlockNumbers[index]-closeGameBlockNumber)
    
        })
        .flat().sort(compareNumberAsc)

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

    abstract attack(e: StartGameEvent): Promise<TransactionResponse>

    abstract attackCallStatic(e: StartGameEvent): Promise<TransactionResponse>

    getOverride(){
        return ({
            gasLimit: GAS_LIMIT,
            maxFeePerGas: ATTACK_MAX_GAS_PRICE,
            maxPriorityFeePerGas: this.isEliteTeam ?
                ATTACK_MAX_PRIORITY_GAS_PRICE_ELITE_TEAM.add(this.nodeId)
                : ATTACK_MAX_PRIORITY_GAS_PRICE.add(this.nodeId)
        })
    }
}

class IddleGameAttackStrategy extends AttackStrategy{

    async attack(e: StartGameEvent): Promise<TransactionResponse>{

        return await this.connectedContract.attack(e.gameId, this.looterTeamId, this.getOverride())

    }

    async attackCallStatic(e: StartGameEvent): Promise<TransactionResponse>{

        return await this.connectedContract.callStatic.attack(e.gameId, this.looterTeamId, this.getOverride())

    }

}

class PlayerAttackStrategy extends AttackStrategy{

    async attack(e: StartGameEvent): Promise<TransactionResponse>{

        return await this.connectedContract.attackTeam(e.teamId, this.looterTeamId, this.getOverride())

    }

    async attackCallStatic(e: StartGameEvent): Promise<TransactionResponse>{

        return await this.connectedContract.callStatic.attackTeam(e.teamId, this.looterTeamId, this.getOverride())

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


export const MIN_VALID_BATTLE_POINTS = 564
export const MIN_BATTLE_POINTS_FOR_ELITE_TEAM = 655

export const loot = async (
    hre: HardhatRuntimeEnvironment, teamsThatPlayToLooseByTeamId: TeamInfoByTeam, 
    looterteamid: number, signer: SignerWithAddress, 
    log: (typeof console.log) = console.log, testMode=true, playerAddress?: string): Promise<TransactionResponse|undefined> => {

    const { idleGame } = getCrabadaContracts(hre)

    const { lockTo: looterLockTo, currentGameId: looterCurrentGameId, battlePoint: looterBattlePoint } = await idleGame.getTeamInfo(looterteamid)

    const attackStrategy = await createAttackStrategy(hre, looterteamid, signer, looterBattlePoint>MIN_BATTLE_POINTS_FOR_ELITE_TEAM, playerAddress)

    const timestamp = await currentBlockTimeStamp(hre)

    if (!testMode){

        if (await locked(looterteamid, looterLockTo, timestamp, log))
            return

        await settleGame(idleGame.connect(signer), looterCurrentGameId, 10, log)

    }

    const START_GAME_FILTER = {
        fromBlock: 'pending',
        toBlock: 'pending',
        address: idleGame.address,
        topics: [ '0x0eef6f7452b7d2ee11184579c086fb47626e796a83df2b2e16254df60ab761eb' ]
    };
    
    const provider = hre.ethers.provider
    const filterId = await provider.send("eth_newFilter", [START_GAME_FILTER]);
    
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
            const logs = await provider.send("eth_getFilterChanges", [filterId]);
            for (const log of logs){
                const gameId = BigNumber.from((log.data as string).slice(0,66))
                const teamId = BigNumber.from('0x'+(log.data as string).slice(66,130))
                const blockNumber = BigNumber.from(log.blockNumber)
                /* no await */ attackStartedGame({ gameId, teamId, transactionHash: log.transactionHash, blockNumber })
            }
        }, 5)

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
                possibleTarget.battlePoint < 564 || 
                // Stronger than looter
                possibleTarget.battlePoint >= looterBattlePoint)
                return

            attackInProgress = true
            log('Begin Attack', '(teamId, teamIdHex, gameId, gameIdHex)', e.teamId.toNumber(), e.teamId.toHexString(), e.gameId.toNumber(), e.gameId.toHexString());

            let transactionResponse: TransactionResponse

            try {

                if (!testMode){

                    transactionResponse = await attackStrategy.attack(e)

                }
                else{

                    transactionResponse = await attackStrategy.attackCallStatic(e)

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

