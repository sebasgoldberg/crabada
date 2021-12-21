import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as IdleGameAbi from "../abis/IdleGame.json"
import * as ERC20Abi from "../abis/ERC20.json"
import * as CrabadaAbi from "../abis/Crabada.json"
import { BigNumber, Contract } from "ethers";
import { TransactionResponse } from "@ethersproject/abstract-provider";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { formatEther, formatUnits } from "ethers/lib/utils";

const ONE_GWEI = 1000000000
const GAS_LIMIT = 700000
const MAX_FEE = BigNumber.from(ONE_GWEI*75)

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
  
export const mineStep = async (hre: HardhatRuntimeEnvironment, minerTeamId: number, attackerContractAddress: string|undefined, attackerTeamId: number, wait: number, signer: SignerWithAddress | undefined) => {

    if (!signer){
        signer = (await hre.ethers.getSigners())[0]
    }

    const idleGame = new Contract(
        contractAddress.IdleGame,
        abi.IdleGame,
        hre.ethers.provider
    ).connect(signer)

    const Player = (await hre.ethers.getContractFactory("Player"));
    const attacker = Player.attach(attackerContractAddress).connect(signer)

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
  
    const signerAddress = signer.address

    console.log('signerAddress', signerAddress);

    const { lockTo: minerLockTo, currentGameId: minerCurrentGameId } = await idleGame.getTeamInfo(minerTeamId)

    const { lockTo: attackerLockTo, currentGameId: attackerCurrentGameId } = await idleGame.getTeamInfo(attackerTeamId) // @todo Validate if attackerCurrentGameId can be used to settle.

    const timestamp = await currentBlockTimeStamp(hre)

    const locked = async (teamId: number, lockTo: BigNumber, timestamp: number) => {
        const extraSeconds = 10 // 10 extra seconds of lock, in case timestamp has an error.
        const difference = (lockTo as BigNumber).sub(timestamp).add(extraSeconds)
        if (difference.lt(0)){
            console.log(`TEAM ${teamId} UNLOCKED: (lockTo: ${(lockTo as BigNumber).toNumber()}, timestamp: ${timestamp}, difference ${difference.toNumber()})`)
            return false
        }
        else{
            console.log(`TEAM ${teamId} LOCKED: (lockTo: ${(lockTo as BigNumber).toNumber()}, timestamp: ${timestamp}, difference ${difference.toNumber()})`)
            return true
        }
    }

    if (await locked(attackerTeamId, attackerLockTo, timestamp))
        return
    
    if (await locked(minerTeamId, minerLockTo, timestamp))
        return

    await logBalance(hre, signerAddress) ////

    // CLOSE GAME
    
    const closeGame = async () =>{

        const override = {gasPrice: await gasPrice(hre), gasLimit: GAS_LIMIT}

        try {
            console.log(`callStatic.closeGame(gameId: ${minerCurrentGameId})`);        
            await idleGame.callStatic.closeGame(minerCurrentGameId, override)
        } catch (error) {
            console.error(`ERROR: ${error.toString()}`)
            console.error(`INFO: Maybe it is too early to close the game`)
            return
        }
    
        await logTokenBalance(tusToken, 'TUS', signerAddress)
        await logTokenBalance(craToken, 'CRA', signerAddress)
    
        console.log(`closeGame(gameId: ${minerCurrentGameId})`);
        const transactionResponse: TransactionResponse = await idleGame.closeGame(minerCurrentGameId, override)
        console.log(`transaction: ${transactionResponse.hash}`);        
        await logBalance(hre, signerAddress)
        await logTokenBalance(tusToken, 'TUS', signerAddress)
        await logTokenBalance(craToken, 'CRA', signerAddress)
    
        await transactionResponse.wait(wait)
    
    }

    await closeGame();

    // SETTLE GAME
    const settleGame = async () =>{

        const override = {gasPrice: await gasPrice(hre), gasLimit: GAS_LIMIT}

        try {
            console.log(`callStatic.settleGame(gameId: ${attackerCurrentGameId})`);        
            await idleGame.callStatic.settleGame(attackerCurrentGameId, override)
        } catch (error) {
            console.error(`ERROR: ${error.toString()}`)
            console.error(`INFO: Maybe it is too early to settle the game`)
            return
        }
    
        await logTokenBalance(tusToken, 'TUS', attackerContractAddress)
        await logTokenBalance(craToken, 'CRA', attackerContractAddress)
    
        console.log(`settleGame(gameId: ${attackerCurrentGameId})`);
        const transactionResponse: TransactionResponse = await idleGame.settleGame(attackerCurrentGameId, override)
        console.log(`transaction: ${transactionResponse.hash}`);
        await logBalance(hre, signerAddress)
        await logTokenBalance(tusToken, 'TUS', attackerContractAddress)
        await logTokenBalance(craToken, 'CRA', attackerContractAddress)
    
        await transactionResponse.wait(wait)
    
    }

    await settleGame()

    // START GAME

    const startGame = async () =>{

        //const override = {gasPrice: await gasPrice(hre), gasLimit: GAS_LIMIT, nonce: undefined}
        const override = {gasLimit: GAS_LIMIT, nonce: undefined, maxFeePerGas: MAX_FEE, maxPriorityFeePerGas: 4*ONE_GWEI}

        console.log('gasPrice', formatUnits(await gasPrice(hre), 9) );

        try {
            console.log(`callStatic.startGame(teamId: ${minerTeamId})`);
            await idleGame.callStatic.startGame(minerTeamId, override)
        } catch (error) {
            console.error(`ERROR: ${error.toString()}`)
            console.error(`ERROR: Not possible to start the game.`)
            return
        }
    
        const nonce = await hre.ethers.provider.getTransactionCount(signer.address)

        console.log(`startGame(teamId: ${minerTeamId})`);
        const startGameTransactionResponsePromise = idleGame.startGame(minerTeamId,
            { ...override, nonce })

        const attackTeamTransactionResponse1Promise = await new Promise<Promise<TransactionResponse>>((resolve, reject) => {
            setTimeout(async () => {
                console.log(`attackTeam(minerTeamId: ${minerTeamId}, attackerTeamId: ${attackerTeamId})`);
                try {
                    const attackTeamTransactionResponsePromise = attacker.attackTeam(minerTeamId, attackerTeamId, 
                        { ...override, nonce: nonce+1})
                    resolve(attackTeamTransactionResponsePromise)
                } catch (error) {
                    reject(error)
                }
                
            }, 500)
        })

        const attackTeamTransactionResponse2Promise = await new Promise<Promise<TransactionResponse>>((resolve, reject) => {
            setTimeout(async () => {
                console.log(`attackTeam(minerTeamId: ${minerTeamId}, attackerTeamId: ${attackerTeamId})`);
                try {
                    const attackTeamTransactionResponsePromise = attacker.attackTeam(minerTeamId, attackerTeamId, 
                        { ...override, nonce: nonce+2})
                    resolve(attackTeamTransactionResponsePromise)
                } catch (error) {
                    reject(error)
                }
                
            }, 500)
        })


        const startGameTransactionResponse: TransactionResponse = await startGameTransactionResponsePromise
        console.log(`transaction ${startGameTransactionResponse.hash}`, startGameTransactionResponse.blockNumber);
        //await startGameTransactionResponse.wait(1)

        //const attackTeamTransactionResponse: TransactionResponse = await attackTeamTransactionResponsePromise
        const attackTeamTransactionResponse1 = await attackTeamTransactionResponse1Promise
        console.log(`transaction ${attackTeamTransactionResponse1.hash}`, attackTeamTransactionResponse1.blockNumber);

        const attackTeamTransactionResponse2 = await attackTeamTransactionResponse2Promise
        console.log(`transaction ${attackTeamTransactionResponse2.hash}`, attackTeamTransactionResponse2.blockNumber);

        
        await logBalance(hre, signerAddress)

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
    return ({gasPrice: await gasPrice(hre), gasLimit: GAS_LIMIT, nonce: undefined})
}