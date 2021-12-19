import * as hre from "hardhat"
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import * as IdleGameAbi from "../abis/IdleGame.json"
import * as ERC20Abi from "../abis/ERC20.json"
import * as CrabadaAbi from "../abis/Crabada.json"
import { Contract } from "ethers";
import { formatEther, parseEther } from "ethers/lib/utils";
import { evm_increaseTime } from "./utils";
import { currentBlockTimeStamp } from "../scripts/crabada";
import { TransactionResponse } from "@ethersproject/abstract-provider";

const AVALANCHE_NODE_URL: string = process.env.AVALANCHE_MAINNET_URL as string || "https://api.avax.network/ext/bc/C/rpc";
const FORK_BLOCKNUMBER: number = Number(process.env.AVALANCHE_FORK_BLOCKNUMBER || "8373728") //8364955, 7804714
const OWNER = ""

const accounts = {
  owner: '0xB2f4C513164cD12a1e121Dc4141920B805d024B8',
  withTeam: '0xB2f4C513164cD12a1e121Dc4141920B805d024B8',
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

const teams = [
  3286,
  3759
]

// Start test block
describe('IdleGame', function () {

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


    await ethers.provider.send('hardhat_impersonateAccount', [accounts.owner] );
    this.owner = await ethers.provider.getSigner(accounts.owner)

    await ethers.provider.send('hardhat_impersonateAccount', [accounts.withTeam] );
    this.withTeam = await ethers.provider.getSigner(accounts.withTeam)

    this.attackerTeam = 1290
    const { owner: attackerAddress, crabadaId1, crabadaId2, crabadaId3 } = await this.IdleGame.getTeamInfo(this.attackerTeam)
    
    this.attackerAddress = attackerAddress
    await ethers.provider.send('hardhat_impersonateAccount', [attackerAddress] );
    this.attacker = await ethers.provider.getSigner(attackerAddress)


    this.teamId = 3286
    this.teamId2 = 3759

    const teamInfo = await this.IdleGame.getTeamInfo(this.teamId)
    const { currentGameId } = teamInfo

    await this.IdleGame.connect(this.withTeam).closeGame(currentGameId)

    const teamInfo2 = await this.IdleGame.getTeamInfo(this.teamId2)
    const { currentGameId: gameId2 } = teamInfo2
    
    // await this.IdleGame.connect(this.owner).closeGame(gameId1)
    await this.IdleGame.connect(this.owner).closeGame(gameId2)


    // const teamAttackerInfo = await this.IdleGame.getTeamInfo(this.teamId)
    // const { currentGameId: gameAttackerId } = teamAttackerInfo
    // console.log('gameAttackerId', gameAttackerId);
    
    // await this.IdleGame.connect(this.attacker).closeGame(gameAttackerId)


  });


  it('IdleGame participants rewards', async function () {
    const baseCraReward: BigNumber = await this.IdleGame.baseCraReward()
    const baseTusReward: BigNumber = await this.IdleGame.baseTusReward()
    expect(ethers.utils.formatEther(baseCraReward)).to.eq('3.75')
    expect(ethers.utils.formatEther(baseTusReward)).to.eq('303.75')
  });


  it('could be possible to get team info', async function () {
    const teamInfo = await this.IdleGame.getTeamInfo(this.teamId)
  });


  it('should miningDuration be 4 hours', async function () {
    const miningDuration = await this.IdleGame.miningDuration()
    expect((miningDuration as BigNumber).toNumber()).to.be.eq(4*60*60)
  });


  it('could be possible to start a game.', async function () {
    await this.IdleGame.connect(this.withTeam).startGame(this.teamId)
  });


  it('could be possible to start a game, after closing a finished game.', async function () {
    
    await this.IdleGame.connect(this.withTeam).startGame(this.teamId)

    await evm_increaseTime(hre, 4 * 60 * 60) // 4 hours

    const teamInfo1 = await this.IdleGame.getTeamInfo(this.teamId)
    const { currentGameId: firstGame } = teamInfo1
    
    await this.IdleGame.connect(this.withTeam).closeGame(firstGame)

    const teamInfo2 = await this.IdleGame.getTeamInfo(this.teamId)
    const { currentGameId: secondGame } = teamInfo2

    await this.IdleGame.connect(this.withTeam).startGame(this.teamId)
  });


  it('could not be possible to close a game twice.', async function () {

    await this.IdleGame.connect(this.withTeam).startGame(this.teamId)

    await evm_increaseTime(hre, 4 * 60 * 60) // 4 hours

    const teamInfo1 = await this.IdleGame.getTeamInfo(this.teamId)
    const { currentGameId: firstGame } = teamInfo1
    
    await this.IdleGame.connect(this.withTeam).closeGame(firstGame)

    await expect(
      this.IdleGame.connect(this.withTeam).closeGame(firstGame)
    ).to.be.revertedWith('GAME:INVALID');

  });

  
  it('could not be possible to start a game with same team if previous game is not finished.', async function () {

    await this.IdleGame.connect(this.withTeam).startGame(this.teamId)

    await expect(
      this.IdleGame.connect(this.withTeam).startGame(this.teamId)
    ).to.be.revertedWith('GAME:BUSY TEAM');

  });


  it('could not be possible to close a game started recently.', async function () {
    
    await this.IdleGame.connect(this.withTeam).startGame(this.teamId)

    const teamInfo = await this.IdleGame.getTeamInfo(this.teamId)
    const { currentGameId } = teamInfo

    await expect(
      this.IdleGame.connect(this.withTeam).closeGame(currentGameId)
    ).to.be.revertedWith('GAME:TOO EARLY');

  });


  it('could not be possible to close a game inmediately after finished the looting period.', async function () {
    
    await this.IdleGame.connect(this.withTeam).startGame(this.teamId)

    const teamInfo = await this.IdleGame.getTeamInfo(this.teamId)
    const { currentGameId } = teamInfo

    await evm_increaseTime(hre, 91 * 60) // 1:31 hours

    await expect(
      this.IdleGame.connect(this.withTeam).closeGame(currentGameId)
    ).to.be.revertedWith('GAME:TOO EARLY');

  });

  it('should change team info game ID after starting a game.', async function () {

    await this.IdleGame.connect(this.withTeam).startGame(this.teamId)

    const teamInfo1 = await this.IdleGame.getTeamInfo(this.teamId)
    const { currentGameId: gameId1 } = teamInfo1

    await evm_increaseTime(hre, 4 * 60 * 60 + 1) // 4 hours

    await this.IdleGame.connect(this.withTeam).closeGame(gameId1)


    await this.IdleGame.connect(this.withTeam).startGame(this.teamId)

    const teamInfo2 = await this.IdleGame.getTeamInfo(this.teamId)
    const { currentGameId: gameId2 } = teamInfo2


    expect(gameId1.toString()).to.not.eq(gameId2.toString())

  });

  it('could receive the reward after successfully finish and close a mining game.', async function () {

    const tusInitialBalance: BigNumber = await this.tusToken.balanceOf(accounts.withTeam)
    const craInitialBalance: BigNumber = await this.craToken.balanceOf(accounts.withTeam)
    
    await this.IdleGame.connect(this.withTeam).startGame(this.teamId)

    const teamInfo = await this.IdleGame.getTeamInfo(this.teamId)
    const { currentGameId } = teamInfo

    await evm_increaseTime(hre, 4 * 60 * 60 + 1) // 4 hours

    await this.IdleGame.connect(this.withTeam).closeGame(currentGameId)
    
    const tusFinalBalance: BigNumber = await this.tusToken.balanceOf(accounts.withTeam)
    const craFinalBalance: BigNumber = await this.craToken.balanceOf(accounts.withTeam)

    expect(formatEther(tusInitialBalance
      .add(parseEther('303.75').mul(11).div(10)) // Has Prime Crabada team member
      ))
    .to.eq(formatEther(tusFinalBalance))

    expect(formatEther(craInitialBalance
        .add(parseEther('3.75').mul(11).div(10)) // Has Prime Crabada team member
        ))
      .to.eq(formatEther(craFinalBalance))

  });

  it('could receive the rewards after successfully finish and close 3 mining games.', async function () {

    const tusInitialBalance: BigNumber = await this.tusToken.balanceOf(accounts.withTeam)
    const craInitialBalance: BigNumber = await this.craToken.balanceOf(accounts.withTeam)

    for (let i = 0; i<3; i++){

      await this.IdleGame.connect(this.withTeam).startGame(this.teamId)

      const teamInfo = await this.IdleGame.getTeamInfo(this.teamId)
      const { currentGameId } = teamInfo
  
      await evm_increaseTime(hre, 4 * 60 * 60 + 1) // 4 hours
  
      await this.IdleGame.connect(this.withTeam).closeGame(currentGameId)
      
    }

    const tusFinalBalance: BigNumber = await this.tusToken.balanceOf(accounts.withTeam)
    const craFinalBalance: BigNumber = await this.craToken.balanceOf(accounts.withTeam)

    expect(formatEther(tusInitialBalance
        .add(parseEther('303.75').mul(3).mul(11).div(10))
        ))
      .to.eq(formatEther(tusFinalBalance))

    expect(formatEther(craInitialBalance
        .add(parseEther('3.75').mul(3).mul(11).div(10)) // Has Prime Crabada team member
        ))
      .to.eq(formatEther(craFinalBalance))

  });


  it('should change team info current game ID to zero after closing a game.', async function () {

    await this.IdleGame.connect(this.withTeam).startGame(this.teamId)

    const teamInfo1 = await this.IdleGame.getTeamInfo(this.teamId)
    const { currentGameId: gameId1 } = teamInfo1

    expect(gameId1.toString()).to.not.eq('0')

    await evm_increaseTime(hre, 4 * 60 * 60 + 1) // 4 hours

    await this.IdleGame.connect(this.withTeam).closeGame(gameId1)

    const teamInfo2 = await this.IdleGame.getTeamInfo(this.teamId)
    const { currentGameId: gameId2 } = teamInfo2

    expect(gameId2.toString()).to.eq('0')

  });

  it('lockTo from getTeamInfo should be the block number after 4 hours.', async function () {

    await this.IdleGame.connect(this.withTeam).startGame(this.teamId)

    const teamInfo1 = await this.IdleGame.getTeamInfo(this.teamId)
    const { currentGameId: gameId1, lockTo: lockTo1  } = teamInfo1

    expect(gameId1.toString()).to.not.eq('0')

    await evm_increaseTime(hre, 4 * 60 * 60 + 1) // 4 hours

    await this.IdleGame.connect(this.withTeam).closeGame(gameId1)


    await this.IdleGame.connect(this.withTeam).startGame(this.teamId)
    
    const teamInfo2 = await this.IdleGame.getTeamInfo(this.teamId)
    const { currentGameId: gameId2, lockTo: lockTo2 } = teamInfo2
    
    const timestamp0 = await currentBlockTimeStamp(hre)

    expect(timestamp0+4*60*60).to.eq(lockTo2)

    await evm_increaseTime(hre, 4 * 60 * 60) // 4 hours

    const timestamp1 = await currentBlockTimeStamp(hre)


    expect(timestamp1).to.eq(timestamp0+4 * 60 * 60)

    expect(timestamp1).to.eq(lockTo2)

  });

  it('lockTo from getTeamInfo should the same after closing the game.', async function () {

    await this.IdleGame.connect(this.withTeam).startGame(this.teamId)

    const teamInfo1 = await this.IdleGame.getTeamInfo(this.teamId)
    const { currentGameId: gameId1, lockTo: lockTo1  } = teamInfo1

    expect(gameId1.toString()).to.not.eq('0')

    await evm_increaseTime(hre, 4 * 60 * 60 + 1) // 4 hours

    await this.IdleGame.connect(this.withTeam).closeGame(gameId1)

    const teamInfo2 = await this.IdleGame.getTeamInfo(this.teamId)
    const { currentGameId: gameId2, lockTo: lockTo2 } = teamInfo2
    
    expect(lockTo2).to.eq(lockTo1)

  });

  it('should not be possible to attack my own team.', async function () {

    await evm_increaseTime(hre, 4 * 60 * 60 + 1) // 4 hours

    await this.IdleGame.connect(this.owner).startGame(this.teamId)

    const teamInfo3 = await this.IdleGame.getTeamInfo(this.teamId)
    const { currentGameId: gameId3 } = teamInfo3

    await expect(
      this.IdleGame.connect(this.owner).attack(gameId3, this.teamId2)
    ).to.be.revertedWith('GAME:SEFT ATTACK');

  });

  it('should be possible to attack with other account.', async function () {

    await evm_increaseTime(hre, 4 * 60 * 60 + 1) // 4 hours

    // Get team members
    const { crabadaId1, crabadaId2, crabadaId3 } = await this.IdleGame.getTeamInfo(this.teamId)

    // Remove members from team
    await Promise.all(
      [0, 1, 2].map(
        index => this.IdleGame.connect(this.owner).removeCrabadaFromTeam(this.teamId, index)
      )
    );

    // Withdraw crabadas from game
    const idleGame = this.IdleGame as Contract
    const crabadaOtherTeam = [crabadaId1, crabadaId2, crabadaId3]
    await idleGame.connect(this.owner).withdraw(accounts.owner, crabadaOtherTeam)

    const [other, ] = await hre.ethers.getSigners();


    // Transfer crabadas to other
    await Promise.all(
      crabadaOtherTeam.map( 
        c => (this.Crabada as Contract).connect(this.owner)["safeTransferFrom(address,address,uint256)"](accounts.owner, other.address, c)
      )
    );

    // Deposit crabadas from other account
    await (this.Crabada as Contract).connect(other).setApprovalForAll(idleGame.address, true)
    await this.IdleGame.connect(other).deposit(crabadaOtherTeam)

    const tx: TransactionResponse = await idleGame.connect(other).createTeam(crabadaId1, crabadaId2, crabadaId3)
    const events = await idleGame.queryFilter(idleGame.filters.CreateTeam(), tx.blockNumber, tx.blockNumber);
    const attackerTeam = events.filter(x => x.args.owner == other.address).map(x => x.args.teamId)[0]

    await this.IdleGame.connect(this.owner).startGame(this.teamId2)

    const teamInfo = await this.IdleGame.getTeamInfo(this.teamId2)
    const { currentGameId: gameId } = teamInfo

    await this.IdleGame.connect(other).attack(gameId, attackerTeam)

  });

});