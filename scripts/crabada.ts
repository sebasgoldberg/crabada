import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as IdleGameAbi from "../abis/IdleGame.json"
import * as ERC20Abi from "../abis/ERC20.json"
import { BigNumber, Contract } from "ethers";
import { TransactionResponse } from "@ethersproject/abstract-provider";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { formatEther, formatUnits } from "ethers/lib/utils";

const ONE_GWEI = 1000000000
const GAS_LIMIT = 500000
const MAX_FEE = BigNumber.from(ONE_GWEI*50)

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
        return BigNumber.from(25*ONE_GWEI)
    }
}

const abi = {
    IdleGame: IdleGameAbi,
    ERC20: ERC20Abi
}
  
const contractAddress = {
    IdleGame: '0x82a85407BD612f52577909F4A58bfC6873f14DA8',
    tusToken: '0xf693248F96Fe03422FEa95aC0aFbBBc4a8FdD172',
    craToken: '0xa32608e873f9ddef944b24798db69d80bbb4d1ed',
}

const logBalance = async (hre: HardhatRuntimeEnvironment, signerAddress: string) => {
    console.log(`AVAX Balance: ${ formatEther(await hre.ethers.provider.getBalance(signerAddress)) }`);
}

const logTokenBalance = async (token: Contract, symbol: string, signerAddress: string, decimals: number = 18) => {
    console.log(`${symbol} Balance: ${ formatUnits(await token.balanceOf(signerAddress), decimals) }`);
}
  
export const mineStep = async (hre: HardhatRuntimeEnvironment, teamId: number, gasprice: number, wait: number, signer: SignerWithAddress | undefined) => {

    let idleGame = new Contract(
        contractAddress.IdleGame,
        abi.IdleGame,
        hre.ethers.provider
    )

    if (!signer){
        signer = (await hre.ethers.getSigners())[0]
    }
    
    if (signer)
        idleGame = idleGame.connect(signer)

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

    let teamInfo

    teamInfo = await idleGame.getTeamInfo(teamId)
    
    const { currentGameId } = teamInfo

    const override = {gasPrice: await gasPrice(hre), gasLimit: GAS_LIMIT}

    await logBalance(hre, signerAddress)


    // CLOSE GAME
    
    const closeGame = async () =>{

        try {
            console.log(`callStatic.closeGame(gameId: ${currentGameId})`);        
            await idleGame.callStatic.closeGame(currentGameId, override)
        } catch (error) {
            console.error(`ERROR: ${error.toString()}`)
            console.error(`INFO: Maybe it is too early to close the game`)
            return
        }
    
        await logTokenBalance(tusToken, 'TUS', signerAddress)
        await logTokenBalance(craToken, 'CRA', signerAddress)
    
        console.log(`closeGame(gameId: ${currentGameId})`);
        const transactionResponse: TransactionResponse = await idleGame.closeGame(currentGameId, override)
        console.log(`transaction: ${transactionResponse.hash}`);        
        await logBalance(hre, signerAddress)
        await logTokenBalance(tusToken, 'TUS', signerAddress)
        await logTokenBalance(craToken, 'CRA', signerAddress)
    
        await transactionResponse.wait(wait)
    
    }

    await closeGame();

    // START GAME

    const startGame = async () =>{

        try {
            console.log(`callStatic.startGame(teamId: ${teamId})`);
            await idleGame.callStatic.startGame(teamId, override)
        } catch (error) {
            console.error(`ERROR: ${error.toString()}`)
            console.error(`ERROR: Not possible to start the game.`)
            return
        }
    
        console.log(`startGame(teamId: ${teamId})`);

        const transactionResponse: TransactionResponse = await idleGame.startGame(teamId, override)
        console.log(`transaction ${transactionResponse.hash}`);
        await transactionResponse.wait(wait)

        await logBalance(hre, signerAddress)

    }

    await startGame();

}