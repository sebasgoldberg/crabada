import * as hre from "hardhat"
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import * as IdleGameAbi from "../abis/IdleGame.json"
import * as CrabadaAbi from "../abis/Crabada.json"
import * as ERC20Abi from "../abis/ERC20.json"
import { Contract } from "ethers";
import { formatEther, parseEther } from "ethers/lib/utils";
import { evm_increaseTime } from "./utils";
import { currentBlockTimeStamp } from "../scripts/crabada";
import { assert } from "console";

const AVALANCHE_NODE_URL: string = process.env.AVALANCHE_MAINNET_URL as string || "https://api.avax.network/ext/bc/C/rpc";
const FORK_BLOCKNUMBER: number = Number(process.env.AVALANCHE_FORK_BLOCKNUMBER || "8364955") //8333467

const accounts = {
  owner: '0xB2f4C513164cD12a1e121Dc4141920B805d024B8',
  withTeam: '0xb4103D7060372700AA1aF34F04eDc89AaB5c35CE',
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

const crabada = [
  9309,
  8224,
  4564
]

// Start test block
describe('Win-Win Strategy', function () {

  beforeEach(async function () {
    await ethers.provider.send(
      "hardhat_reset",
      [
          {
              forking: {
                  jsonRpcUrl: AVALANCHE_NODE_URL,
                  blockNumber: FORK_BLOCKNUMBER,
              },
          },
      ],
    );

    await evm_increaseTime(hre, 7 * 24 * 60 * 60)

    await ethers.provider.send('hardhat_impersonateAccount', [accounts.owner] );
    this.owner = await ethers.provider.getSigner(accounts.owner)


    const Router = (await ethers.getContractFactory("Router")).connect(this.owner);
    this.router = await Router.deploy(contractAddress.IdleGame, contractAddress.crabada)

    const Player = (await ethers.getContractFactory("Player")).connect(this.owner);;
    this.player1 = await Player.deploy(contractAddress.IdleGame, contractAddress.crabada)
    this.player2 = await Player.deploy(contractAddress.IdleGame, contractAddress.crabada)



    this.IdleGame = new Contract(
      contractAddress.IdleGame,
      abi.IdleGame,
      ethers.provider
    )

    this.tusToken = new Contract(
      contractAddress.tusToken,
      abi.ERC20,
      ethers.provider
    )

    this.craToken = new Contract(
      contractAddress.craToken,
      abi.ERC20,
      ethers.provider
    )

    this.Crabada = new Contract(
      contractAddress.crabada,
      abi.Crabada,
      ethers.provider
    )



    this.teamId = 3286;
    this.teamId2 = 3759;

    // Getting teams info
    const teamInfo = await this.IdleGame.getTeamInfo(this.teamId)
    const { currentGameId, crabadaId1: c1t1, crabadaId2: c2t1, crabadaId3: c3t1 } = teamInfo
    this.team1Members = [c1t1, c2t1, c3t1]

    const teamInfo2 = await this.IdleGame.getTeamInfo(this.teamId2)
    const { currentGameId: gameId2, crabadaId1: c1t2, crabadaId2: c2t2, crabadaId3: c3t2 } = teamInfo2
    this.team2Members = [c1t2, c2t2, c3t2]

    // Ending games

    if (!(currentGameId as BigNumber).isZero())
      await this.IdleGame.connect(this.owner).closeGame(currentGameId)

    if (!(gameId2 as BigNumber).isZero())
      await this.IdleGame.connect(this.owner).closeGame(gameId2)

    // Removing crabadas from teams

    await Promise.all(
      [0, 1, 2].map(
        index => this.IdleGame.connect(this.owner).removeCrabadaFromTeam(this.teamId, index)
      )
    );

    await Promise.all(
      [0, 1, 2].map(
        index => this.IdleGame.connect(this.owner).removeCrabadaFromTeam(this.teamId2, index)
      )
    );

    // Withdrawing crabadas from game
    const idleGame = this.IdleGame as Contract
    await idleGame.connect(this.owner).withdraw(accounts.owner, this.team1Members)
    await idleGame.connect(this.owner).withdraw(accounts.owner, this.team2Members)

    const player1 = this.player1 as Contract
    const player2 = this.player2 as Contract

    const crabadaC = this.Crabada as Contract
    await crabadaC.connect(this.owner).setApprovalForAll(player1.address, true)
    await crabadaC.connect(this.owner).setApprovalForAll(player2.address, true)

    await player1.connect(this.owner).deposit(accounts.owner, this.team1Members)
    await player1.connect(this.owner).createTeam(...this.team1Members)
    this.team1p1 = await player1.teams(0)

    await player2.connect(this.owner).deposit(accounts.owner, this.team2Members)
    await player2.connect(this.owner).createTeam(...this.team2Members)
    this.team1p2 = await player2.teams(0)

  });

  describe('Router', function () {

    it('should not be possible to attack and close the game in the same transaction.', async function () {

      const router = this.router as Contract
      const player1 = this.player1 as Contract
      const player2 = this.player2 as Contract

      await player1.connect(this.owner).transferOwnership(router.address)
      await player2.connect(this.owner).transferOwnership(router.address)

      await expect(
        router.connect(this.owner).startGameAndAttack(
          player1.address, this.team1p1,
          player2.address, this.team1p2
        )        
      ).to.be.revertedWith('GAME:OUT OF TIME');

      // const teamInfo = await this.IdleGame.getTeamInfo(this.team1p1)
      // const { currentGameId } = teamInfo
  
      // await evm_increaseTime(hre, 4 * 60 * 60 + 1)
  
      // const tusInitialBalance1: BigNumber = await this.tusToken.balanceOf(player1.address)
      // const craInitialBalance1: BigNumber = await this.craToken.balanceOf(player1.address)
      // const tusInitialBalance2: BigNumber = await this.tusToken.balanceOf(player2.address)
      // const craInitialBalance2: BigNumber = await this.craToken.balanceOf(player2.address)
  
      // const teamInfo1 = await this.IdleGame.getTeamInfo(this.team1p1)
      // const { currentGameId: currentGameId1 } = teamInfo1
      // const [account0, ] = await hre.ethers.getSigners()
      // await this.IdleGame.connect(account0).closeGame(currentGameId1)
  
      // const tusFinalBalance1: BigNumber = await this.tusToken.balanceOf(player1.address)
      // const craFinalBalance1: BigNumber = await this.craToken.balanceOf(player1.address)
      // const tusFinalBalance2: BigNumber = await this.tusToken.balanceOf(player2.address)
      // const craFinalBalance2: BigNumber = await this.craToken.balanceOf(player2.address)
  
      // expect(formatEther(tusInitialBalance1
      //   .add(parseEther('136.6875')) // Has Prime Crabada team member
      //   ))
      // .to.eq(formatEther(tusFinalBalance1))
  
      // expect(formatEther(craInitialBalance1
      //   .add(parseEther('1.6875')) // Has Prime Crabada team member
      //   ))
      // .to.eq(formatEther(craFinalBalance1))
  
      // expect(formatEther(tusInitialBalance2
      //   .add(parseEther('221.7375'))
      //   ))
      // .to.eq(formatEther(tusFinalBalance2))
  
      // expect(formatEther(craInitialBalance2
      //   .add(parseEther('2.7375'))
      //   ))
      // .to.eq(formatEther(craFinalBalance2))
  
    });
  
  })

});