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
describe('IdleGame: Attack', function () {

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

    await evm_increaseTime(7 * 24 * 60 * 60)

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

    const ProxyAttack = (await ethers.getContractFactory("ProxyAttack"));
    this.proxyAttack = await ProxyAttack.deploy(contractAddress.IdleGame, contractAddress.crabada)

    this.teamId = 3286
    this.teamId1 = this.teamId
    this.teamId2 = 3759
    const teamId3 = 3156 // other owner

    const teamInfo = await this.IdleGame.getTeamInfo(this.teamId)
    const { currentGameId } = teamInfo

    await this.IdleGame.connect(this.withTeam).closeGame(currentGameId)

    const teamInfo2 = await this.IdleGame.getTeamInfo(this.teamId2)
    const { currentGameId: gameId2 } = teamInfo2
    
    // await this.IdleGame.connect(this.owner).closeGame(gameId1)
    await this.IdleGame.connect(this.owner).closeGame(gameId2)



    const teamInfo3 = await this.IdleGame.getTeamInfo(teamId3)
    const { owner: otherOwnerAddress, currentGameId: gameId3, crabadaId1: c1t1, crabadaId2: c2t1, crabadaId3: v3t1 } = teamInfo3
    await ethers.provider.send('hardhat_impersonateAccount', [otherOwnerAddress] );
    this.otherOwner = await ethers.provider.getSigner(otherOwnerAddress)

    // await this.IdleGame.connect(this.owner).closeGame(gameId1)
    await this.IdleGame.connect(this.otherOwner).closeGame(gameId3)


    // const teamAttackerInfo = await this.IdleGame.getTeamInfo(this.teamId)
    // const { currentGameId: gameAttackerId } = teamAttackerInfo
    // console.log('gameAttackerId', gameAttackerId);
    
    // await this.IdleGame.connect(this.attacker).closeGame(gameAttackerId)

    // Get team members

    // Remove members from team
    await Promise.all(
      [0, 1, 2].map(
        index => this.IdleGame.connect(this.otherOwner).removeCrabadaFromTeam(teamId3, index)
      )
    );

    // Withdraw crabadas from game
    const idleGame = this.IdleGame as Contract
    const crabadaOtherTeam = [c1t1, c2t1, v3t1]
    await idleGame.connect(this.otherOwner).withdraw(otherOwnerAddress, crabadaOtherTeam)

    const [other, ] = await hre.ethers.getSigners();
    this.other = other

    // Transfer crabadas to other
    await Promise.all(
      crabadaOtherTeam.map( 
        c => (this.Crabada as Contract).connect(this.otherOwner)["safeTransferFrom(address,address,uint256)"](otherOwnerAddress, other.address, c)
      )
    );

    // Deposit crabadas from other account
    await (this.Crabada as Contract).connect(other).setApprovalForAll(idleGame.address, true)
    await this.IdleGame.connect(other).deposit(crabadaOtherTeam)

    const tx: TransactionResponse = await idleGame.connect(other).createTeam(c1t1, c2t1, v3t1)
    const events = await idleGame.queryFilter(idleGame.filters.CreateTeam(), tx.blockNumber, tx.blockNumber);
    this.attackerTeam = events.filter(x => x.args.owner == other.address).map(x => x.args.teamId)[0]

  });

  it('should be possible to attack with other account.', async function () {

    await this.IdleGame.connect(this.owner).startGame(this.teamId2)

    const teamInfo = await this.IdleGame.getTeamInfo(this.teamId2)
    const { currentGameId: gameId } = teamInfo

    await this.IdleGame.connect(this.other).attack(gameId, this.attackerTeam)

  });


  it('getTeamInfo.lockTo should be the time the attacker team it is locked to attack another team.', async function () {

    await this.IdleGame.connect(this.owner).startGame(this.teamId1)

    const teamInfo = await this.IdleGame.getTeamInfo(this.teamId1)
    const { currentGameId: gameId } = teamInfo

    const {lockTo: lockToBeforeAttackTeam1} = await this.IdleGame.getTeamInfo(this.attackerTeam)
    const timestampBeforeAttackTeam1 = await currentBlockTimeStamp(hre)
    expect(lockToBeforeAttackTeam1).lt(timestampBeforeAttackTeam1)
    
    const gameBattleInfo1 = await this.IdleGame.getGameBattleInfo(gameId)
    
    await this.IdleGame.connect(this.other).attack(gameId, this.attackerTeam)

    const {lockTo: lockToAfterAttackTeam1} = await this.IdleGame.getTeamInfo(this.attackerTeam)
    const timestampAfterAttackTeam1 = await currentBlockTimeStamp(hre)
    expect(lockToAfterAttackTeam1).eq(timestampAfterAttackTeam1+60*60)

  });


  it('getTeamInfo.lockTo should be the time the miner team it is locked to mine again.', async function () {

    const {lockTo: lockToBeforeMine} = await this.IdleGame.getTeamInfo(this.teamId1)
    const timestampBeforeMine = await currentBlockTimeStamp(hre)
    expect(lockToBeforeMine).lt(timestampBeforeMine)

    await this.IdleGame.connect(this.owner).startGame(this.teamId1)

    const teamInfo = await this.IdleGame.getTeamInfo(this.teamId1)
    
    const {lockTo: lockToAfterMine} = await this.IdleGame.getTeamInfo(this.teamId1)
    const timestampAfterMine = await currentBlockTimeStamp(hre)
    expect(lockToAfterMine).eq(timestampAfterMine+4*60*60)

  });


  it('should be possible to attack again after one hour.', async function () {

    await this.IdleGame.connect(this.owner).startGame(this.teamId1)

    const teamInfo = await this.IdleGame.getTeamInfo(this.teamId1)
    const { currentGameId: gameId } = teamInfo

    await this.IdleGame.connect(this.other).attack(gameId, this.attackerTeam)


    await evm_increaseTime(60*60)

    await this.IdleGame.connect(this.other).settleGame(gameId)


    await this.IdleGame.connect(this.owner).startGame(this.teamId2)

    const teamInfo2 = await this.IdleGame.getTeamInfo(this.teamId2)
    const { currentGameId: gameId2 } = teamInfo2

    await this.IdleGame.connect(this.other).attack(gameId2, this.attackerTeam)

  });

  it('should not be possible to attack again before one hour.', async function () {

    await this.IdleGame.connect(this.owner).startGame(this.teamId1)

    const teamInfo = await this.IdleGame.getTeamInfo(this.teamId1)
    const { currentGameId: gameId } = teamInfo

    await this.IdleGame.connect(this.other).attack(gameId, this.attackerTeam)


    await evm_increaseTime(59*60)

    await this.IdleGame.connect(this.other).settleGame(gameId)


    await this.IdleGame.connect(this.owner).startGame(this.teamId2)

    const teamInfo2 = await this.IdleGame.getTeamInfo(this.teamId2)
    const { currentGameId: gameId2 } = teamInfo2

    await expect(
      this.IdleGame.connect(this.other).attack(gameId2, this.attackerTeam)
    ).to.be.revertedWith('GAME:TEAM IS LOCKED');

  });


  it('attacker should win rewards after settling game.', async function () {

    await this.IdleGame.connect(this.owner).startGame(this.teamId1)

    const teamInfo = await this.IdleGame.getTeamInfo(this.teamId1)
    const { currentGameId: gameId } = teamInfo

    await this.IdleGame.connect(this.other).attack(gameId, this.attackerTeam)

    await evm_increaseTime(60*60)

    const tusInitialBalance: BigNumber = await this.tusToken.balanceOf(this.other.address)
    const craInitialBalance: BigNumber = await this.craToken.balanceOf(this.other.address)

    await this.IdleGame.connect(this.other).settleGame(gameId)

    const tusFinalBalance: BigNumber = await this.tusToken.balanceOf(this.other.address)
    const craFinalBalance: BigNumber = await this.craToken.balanceOf(this.other.address)

    expect(formatEther(tusInitialBalance
      .add(parseEther('221.7375'))
      ))
    .to.eq(formatEther(tusFinalBalance))

    expect(formatEther(craInitialBalance
        .add(parseEther('2.7375')) // Has Prime Crabada team member
        ))
      .to.eq(formatEther(craFinalBalance))

  });


  it('should anyone can settle a game.', async function () {

    await this.IdleGame.connect(this.owner).startGame(this.teamId1)

    const teamInfo = await this.IdleGame.getTeamInfo(this.teamId1)
    const { currentGameId: gameId } = teamInfo

    await this.IdleGame.connect(this.other).attack(gameId, this.attackerTeam)

    await evm_increaseTime(60*60)

    const tusInitialBalance: BigNumber = await this.tusToken.balanceOf(this.other.address)
    const craInitialBalance: BigNumber = await this.craToken.balanceOf(this.other.address)

    const other3 = (await hre.ethers.getSigners())[2]

    await this.IdleGame.connect(other3).settleGame(gameId)

    const tusFinalBalance: BigNumber = await this.tusToken.balanceOf(this.other.address)
    const craFinalBalance: BigNumber = await this.craToken.balanceOf(this.other.address)

    expect(formatEther(tusInitialBalance
      .add(parseEther('221.7375'))
      ))
    .to.eq(formatEther(tusFinalBalance))

    expect(formatEther(craInitialBalance
        .add(parseEther('2.7375')) // Has Prime Crabada team member
        ))
      .to.eq(formatEther(craFinalBalance))

  });


  it('miner should not win rewards after settling game.', async function () {

    await this.IdleGame.connect(this.owner).startGame(this.teamId1)

    const teamInfo = await this.IdleGame.getTeamInfo(this.teamId1)
    const { currentGameId: gameId } = teamInfo

    await this.IdleGame.connect(this.other).attack(gameId, this.attackerTeam)

    await evm_increaseTime(60*60)

    const tusInitialBalance: BigNumber = await this.tusToken.balanceOf(accounts.owner)
    const craInitialBalance: BigNumber = await this.craToken.balanceOf(accounts.owner)

    await this.IdleGame.connect(this.other).settleGame(gameId)

    const tusFinalBalance: BigNumber = await this.tusToken.balanceOf(accounts.owner)
    const craFinalBalance: BigNumber = await this.craToken.balanceOf(accounts.owner)

    expect(formatEther(tusInitialBalance))
    .to.eq(formatEther(tusFinalBalance))

    expect(formatEther(craInitialBalance))
      .to.eq(formatEther(craFinalBalance))

  });


  it('should win miners and attacker their corresponding rewards.', async function () {

    const tusOwnerInitialBalance: BigNumber = await this.tusToken.balanceOf(accounts.owner)
    const craOwnerInitialBalance: BigNumber = await this.craToken.balanceOf(accounts.owner)
    const tusOtherInitialBalance: BigNumber = await this.tusToken.balanceOf(this.other.address)
    const craOtherInitialBalance: BigNumber = await this.craToken.balanceOf(this.other.address)


    await this.IdleGame.connect(this.owner).startGame(this.teamId1)

    const teamInfo = await this.IdleGame.getTeamInfo(this.teamId1)
    const { currentGameId: gameId } = teamInfo

    await this.IdleGame.connect(this.other).attack(gameId, this.attackerTeam)


    // Hour 1
    await evm_increaseTime(60*60)

    await this.IdleGame.connect(this.other).settleGame(gameId)
    
    await this.IdleGame.connect(this.owner).startGame(this.teamId2)

    const teamInfo2 = await this.IdleGame.getTeamInfo(this.teamId2)
    const { currentGameId: gameId2 } = teamInfo2

    await this.IdleGame.connect(this.other).attack(gameId2, this.attackerTeam)


    // Hour 2
    await evm_increaseTime(60*60)

    await this.IdleGame.connect(this.other).settleGame(gameId2)


    // Hour 4
    await evm_increaseTime(2*60*60)
    
    await this.IdleGame.connect(this.owner).closeGame(gameId)


    // Hour 5
    await evm_increaseTime(1*60*60)
    
    await this.IdleGame.connect(this.owner).closeGame(gameId2)

    const tusOwnerFinalBalance: BigNumber = await this.tusToken.balanceOf(accounts.owner)
    const craOwnerFinalBalance: BigNumber = await this.craToken.balanceOf(accounts.owner)
    const tusOtherFinalBalance: BigNumber = await this.tusToken.balanceOf(this.other.address)
    const craOtherFinalBalance: BigNumber = await this.craToken.balanceOf(this.other.address)

    expect(formatEther(tusOwnerInitialBalance
        .add(parseEther('136.6875').mul(2)) // Has Prime Crabada team member
        ))
      .to.eq(formatEther(tusOwnerFinalBalance))

    expect(formatEther(craOwnerInitialBalance
        .add(parseEther('1.6875').mul(2)) // Has Prime Crabada team member
        ))
      .to.eq(formatEther(craOwnerFinalBalance))

    expect(formatEther(tusOtherInitialBalance
      .add(parseEther('221.7375').mul(2))
      ))
    .to.eq(formatEther(tusOtherFinalBalance))

    expect(formatEther(craOtherInitialBalance
        .add(parseEther('2.7375').mul(2))
        ))
      .to.eq(formatEther(craOtherFinalBalance))

  });


  it('should not be possible to attack using ProxyAttack.', async function () {

    // ProxyAttack does not work because delegating to iddleGame.attack, sets
    // the msg.sender to the msg.sender proxy caller, but executes the call
    // using ProxyAttack's storage.

    await this.IdleGame.connect(this.owner).startGame(this.teamId2)

    const proxyAttack = this.proxyAttack as Contract

    await proxyAttack.connect(this.other).attack(this.teamId2, this.attackerTeam)

    const {lockTo: lockToAfterAttackTeam1} = await this.IdleGame.getTeamInfo(this.attackerTeam)
    const timestampAfterAttackTeam1 = await currentBlockTimeStamp(hre)
    expect(lockToAfterAttackTeam1).lte(timestampAfterAttackTeam1)

  });


});