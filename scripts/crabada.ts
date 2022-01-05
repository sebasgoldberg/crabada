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
export const ATTACK_MAX_GAS_PRICE = BigNumber.from(ONE_GWEI*300)

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

const abi = {
    IdleGame: IdleGameAbi,
    ERC20: ERC20Abi,
    Crabada: CrabadaAbi,
}
  
const contractAddress = {
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

export const settleGame = async (idleGame: Contract, attackerCurrentGameId: BigNumber, wait: number, log: (typeof console.log) = console.log) =>{

    const override = {
        gasLimit: GAS_LIMIT,
        maxFeePerGas: MAX_FEE,
        maxPriorityFeePerGas: BigNumber.from(ONE_GWEI)
    }

    try {
        log(`callStatic.settleGame(gameId: ${attackerCurrentGameId})`);        
        await idleGame.callStatic.settleGame(attackerCurrentGameId, override)
    } catch (error) {
        log(`ERROR: ${error.toString()}`)
        log(`INFO: Maybe it is too early to settle the game`)
        return
    }

    log(`settleGame(gameId: ${attackerCurrentGameId})`);
    const transactionResponse: TransactionResponse = await idleGame.settleGame(attackerCurrentGameId, override)
    log(`transaction: ${transactionResponse.hash}`);

    await transactionResponse.wait(wait)

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

    const { lockTo: attackerLockTo, currentGameId: attackerCurrentGameId } = await idleGame.getTeamInfo(attackerTeamId) // @todo Validate if attackerCurrentGameId can be used to settle.

    const timestamp = await currentBlockTimeStamp(hre)

    if (await locked(attackerTeamId, attackerLockTo, timestamp))
        return
    
    if (await locked(minerTeamId, minerLockTo, timestamp))
        return

    await logBalance(hre, minerAddress) ////

    // CLOSE GAME
    
    const closeGame = async (gameId: number) =>{

        const override = {gasPrice: await gasPrice(hre), gasLimit: GAS_LIMIT}

        try {
            console.log(`callStatic.closeGame(gameId: ${gameId})`);        
            await idleGame.callStatic.closeGame(gameId, override)
        } catch (error) {
            console.error(`ERROR: ${error.toString()}`)
            console.error(`INFO: Maybe it is too early to close the game`)
            return
        }
    
        await logTokenBalance(tusToken, 'TUS', minerAddress)
        await logTokenBalance(craToken, 'CRA', minerAddress)
    
        console.log(`closeGame(gameId: ${gameId})`);
        const transactionResponse: TransactionResponse = await idleGame.closeGame(gameId, override)
        console.log(`transaction: ${transactionResponse.hash}`);        
        await logBalance(hre, minerAddress)
        await logTokenBalance(tusToken, 'TUS', minerAddress)
        await logTokenBalance(craToken, 'CRA', minerAddress)
    
        await transactionResponse.wait(wait)
    
    }

    await closeGame(minerCurrentGameId);
    await closeGame(attackerCurrentGameId);

    // SETTLE GAME

    await settleGame(idleGame, attackerCurrentGameId, wait)

    // START GAME

    const startGame = async () =>{

        //const override = {gasPrice: await gasPrice(hre), gasLimit: GAS_LIMIT, nonce: undefined}
        const baseFee = await gasPrice(hre)
        const override = {
            gasLimit: GAS_LIMIT,
            // nonce: undefined,
            // gasPrice: undefined,
            maxFeePerGas: MAX_FEE,
            maxPriorityFeePerGas: baseFee.mul(5).div(100) // 5% tip
        } 

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

        await logBalance(hre, minerAddress)

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
    hre: HardhatRuntimeEnvironment, blockstoanalyze: number, 
    firstdefendwindow: number, maxbattlepoints: number, log = console.log, queryPageSize=3600): Promise<TeamInfoByTeam> =>{

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
    const startGameEvents = await queryFilterByPage(hre, idleGame, idleGame.filters.StartGame(), fromBlock, toBlock, log)
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

    const possibleTargetsByTeam: TeamInfoByTeam = {}

    for (const teamId in teamsThatPlayToLoose){
        if (teamsThatPlayToLoose[teamId].battlePoint < maxbattlepoints)
            possibleTargetsByTeam[teamId] = teamsThatPlayToLoose[teamId]
    }

    log(`Possible targets below ${maxbattlepoints} battle points`, Object.keys(possibleTargetsByTeam).length)

    return possibleTargetsByTeam
}

export const getDelayFrom = (timeFromInSeconds: number) => {
    return ((+new Date())/1000) - timeFromInSeconds
}

export const START_GAME_ENCODED_OPERATION = '0xe5ed1d59'

export const isTeamLocked = async (
    hre: HardhatRuntimeEnvironment, idleGame: Contract, teamId: number,
    log: (typeof console.log) = console.log) => {

    const { lockTo } = await idleGame.getTeamInfo(teamId)

    const timestamp = await currentBlockTimeStamp(hre)

    return await locked(teamId, lockTo, timestamp, log)

}

// TODO Remove playeraddress
export const loot = async (
    hre: HardhatRuntimeEnvironment, possibleTargetsByTeamId: TeamInfoByTeam, 
    playeraddress: string, looterteamid: number, signer: SignerWithAddress, 
    log: (typeof console.log) = console.log, testMode=true): Promise<TransactionResponse|undefined> => {

    const { idleGame } = getCrabadaContracts(hre)

    const { lockTo: looterLockTo, currentGameId: looterCurrentGameId } = await idleGame.getTeamInfo(looterteamid)

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

        const interval = setInterval(async () => {
            const logs = await provider.send("eth_getFilterChanges", [filterId]);
            for (const log of logs){
                const gameId = BigNumber.from((log.data as string).slice(0,66))
                const teamId = BigNumber.from('0x'+(log.data as string).slice(66,130))
                const blockNumber = BigNumber.from(log.blockNumber)
                /* no await */ eventListener({ gameId, teamId, transactionHash: log.transactionHash, blockNumber })
            }
        }, 3)

        const exitInterval = setInterval(async () =>{
            if (!testMode && await isTeamLocked(hre, idleGame, looterteamid, ()=>{})){
                clearInterval(interval)
                clearInterval(exitInterval)
                resolve(undefined)
            }
        }, 10*1000)

        interface StartGameEvent {
            gameId: BigNumber,
            teamId: BigNumber,
            transactionHash: string,
            blockNumber: BigNumber,
        }

        let attackInProgress = false

        const eventListener = async (e: StartGameEvent) => {

            log(+new Date()/1000, 'Pending transaction (hash, block, teamId)', e.transactionHash, e.blockNumber.toNumber(), e.gameId.toNumber());

            if (attackInProgress){
                log('StartGame event discarded. Attack in progress')
                return
            }

            const possibleTarget = possibleTargetsByTeamId[e.teamId.toString()]
            
            if (!possibleTarget)
                return

            attackInProgress = true
            log('Begin Attack', '(teamId, teamIdHex)', e.gameId.toNumber(), e.gameId.toHexString());

            let transactionResponse: TransactionResponse

            try {

                if (!testMode){

                    transactionResponse = await idleGame.connect(signer).attack(e.gameId, looterteamid, {
                        gasLimit: GAS_LIMIT,
                        maxFeePerGas: ATTACK_MAX_GAS_PRICE,
                        maxPriorityFeePerGas: BigNumber.from(ONE_GWEI*50)
                    })

                }
                else{

                    transactionResponse = await idleGame.connect(signer).callStatic.attack(e.gameId, looterteamid, {
                        gasLimit: GAS_LIMIT,
                        maxFeePerGas: ATTACK_MAX_GAS_PRICE,
                        maxPriorityFeePerGas: BigNumber.from(ONE_GWEI*50)
                    })

                }


            } catch (error) {

                log(`ERROR: ${error.toString()}`);
                
            }

            log('End Attack');

            if (!testMode && await isTeamLocked(hre, idleGame, looterteamid, ()=>{})){
                clearInterval(interval)
                clearInterval(exitInterval)
                resolve(undefined)
                return
            }

            attackInProgress = false

        }

    }))

}

