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
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

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


    const Player = (await ethers.getContractFactory("Player")).connect(this.owner);
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
    this.teamId1 = this.teamId;
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

    this.player1 = player1.connect(this.owner)
    this.player2 = player2.connect(this.owner)

  });

  describe('Player Cenarios', function () {

    it('should be possible to attack using the attackTeam method.', async function () {
      
      await this.player1.startGame(this.team1p1);
      await this.player2.attackTeam(this.team1p1, this.team1p2);

      const {lockTo: lockToAfterAttackTeam1} = await this.IdleGame.getTeamInfo(this.team1p2)
      const timestampAfterAttackTeam1 = await currentBlockTimeStamp(hre)
      expect(lockToAfterAttackTeam1).eq(timestampAfterAttackTeam1+60*60)

    });

    it('should be possible to attack using multiple accounts at same time.', async function () {
      
      await this.player1.startGame(this.team1p1);

      const [ , , , attacker2, attacker3] = await hre.ethers.getSigners()

      this.player2.addOwner(attacker2.address)
      this.player2.addOwner(attacker3.address)

      await this.player2.connect(attacker2).attackTeam(this.team1p1, this.team1p2);

      await expect(
        this.player2.connect(attacker3).attackTeam(this.team1p1, this.team1p2)
      ).to.be.revertedWith('GAME:LOOTED');
      
      await expect(
        this.player2.attackTeam(this.team1p1, this.team1p2)
      ).to.be.revertedWith('GAME:LOOTED');

    });
  

    it('should win miners and attacker their corresponding rewards.', async function () {

      const player1 = this.player1 as Contract
      const player2 = this.player2 as Contract
      const tusPlayer1InitialBalance: BigNumber = await this.tusToken.balanceOf(player1.address)
      const craPlayer1InitialBalance: BigNumber = await this.craToken.balanceOf(player1.address)
      const tusPlayer2InitialBalance: BigNumber = await this.tusToken.balanceOf(player2.address)
      const craPlayer2InitialBalance: BigNumber = await this.craToken.balanceOf(player2.address)
  
  
      await player1.startGame(this.team1p1)

      await player2.attackTeam(this.team1p1, this.team1p2);
  
  
      // Hour 1
      await evm_increaseTime(hre, 60*60)

      const teamInfo = await this.IdleGame.getTeamInfo(this.team1p2)
      const { currentGameId: gameId } = teamInfo

      await this.IdleGame.connect(this.owner).settleGame(gameId)

      const tusPlayer2FinalBalance: BigNumber = await this.tusToken.balanceOf(player2.address)
      const craPlayer2FinalBalance: BigNumber = await this.craToken.balanceOf(player2.address)

      expect(formatEther(tusPlayer2InitialBalance
        .add(parseEther('221.7375'))
        ))
      .to.eq(formatEther(tusPlayer2FinalBalance))
  
      expect(formatEther(craPlayer2InitialBalance
          .add(parseEther('2.7375'))
          ))
        .to.eq(formatEther(craPlayer2FinalBalance))

  
      // Hour 4
      await evm_increaseTime(hre, 3*60*60)
      
      await this.IdleGame.connect(this.owner).closeGame(gameId)
  
      const tusPlayer1FinalBalance: BigNumber = await this.tusToken.balanceOf(player1.address)
      const craPlayer1FinalBalance: BigNumber = await this.craToken.balanceOf(player1.address)
  
      expect(formatEther(tusPlayer1InitialBalance
          .add(parseEther('136.6875')) // Has Prime Crabada team member
          ))
        .to.eq(formatEther(tusPlayer1FinalBalance))
  
      expect(formatEther(craPlayer1InitialBalance
          .add(parseEther('1.6875')) // Has Prime Crabada team member
          ))
        .to.eq(formatEther(craPlayer1FinalBalance))
  
    });
  

    it('should be possible to remove crabada from team.', async function () {
      
      await this.player1.connect(this.owner).removeCrabadaFromTeam(this.team1p1, 0);
   
      const teamInfo = await this.IdleGame.getTeamInfo(this.team1p1)
      const { crabadaId1: c1t2, crabadaId2: c2t2, crabadaId3: c3t2 } = teamInfo
      const teamMembers = [c1t2, c2t2, c3t2]

      const result = teamMembers.filter( (x:BigNumber) => x.eq(this.team1Members[0]))

      expect(result.length).eq(0)
  
    });
  

    it('should be possible to add crabada to team.', async function () {
      
      await this.player1.connect(this.owner).removeCrabadaFromTeam(this.team1p1, 0);
      await this.player1.connect(this.owner).removeCrabadaFromTeam(this.team1p1, 1);

      await this.player1.connect(this.owner).addCrabadaToTeam(this.team1p1, 0, this.team1Members[1])
      await this.player1.connect(this.owner).addCrabadaToTeam(this.team1p1, 1, this.team1Members[0])

      const teamInfo = await this.IdleGame.getTeamInfo(this.team1p1)
      const { crabadaId1: c1, crabadaId2: c2 } = teamInfo

      expect(this.team1Members[1].eq(c1)).to.be.true
      expect(this.team1Members[0].eq(c2)).to.be.true

  
    });
  

    it('should be possible to remove crabada to external account.', async function () {

      expect(await this.IdleGame.ownerOf(this.team1Members[0])).eqls(this.player1.address)
      expect(await this.IdleGame.ownerOf(this.team1Members[1])).eqls(this.player1.address)
      
      await this.player1.connect(this.owner).removeCrabadaFromTeam(this.team1p1, 0);
      await this.player1.connect(this.owner).removeCrabadaFromTeam(this.team1p1, 1);

      await this.player1.connect(this.owner).withdraw(accounts.owner, [ this.team1Members[0], this.team1Members[1] ])
      
      expect(await this.Crabada.ownerOf(this.team1Members[0])).eqls(accounts.owner)
      expect(await this.Crabada.ownerOf(this.team1Members[1])).eqls(accounts.owner)
  
    });

  
    it('should be possible to withdra ERC20 work.', async function () {

      const tusOwnerInitialBalance: BigNumber = await this.tusToken.balanceOf(accounts.owner)
      const craOwnerInitialBalance: BigNumber = await this.craToken.balanceOf(accounts.owner)

      const player1 = this.player1 as Contract
      const player2 = this.player2 as Contract
  
  
      await player1.startGame(this.team1p1)

      await player2.attackTeam(this.team1p1, this.team1p2);
  
  
      // Hour 1
      await evm_increaseTime(hre, 60*60)

      const teamInfo = await this.IdleGame.getTeamInfo(this.team1p1)
      const { currentGameId: gameId } = teamInfo

      await this.IdleGame.connect(this.owner).settleGame(gameId)


      // Hour 4
      await evm_increaseTime(hre, 3*60*60)
      
      await this.IdleGame.connect(this.owner).closeGame(gameId)
  
      await player1.withdrawERC20(this.tusToken.address, accounts.owner, await this.tusToken.balanceOf(player1.address))
      await player1.withdrawERC20(this.craToken.address, accounts.owner, await this.craToken.balanceOf(player1.address))
      await player2.withdrawERC20(this.tusToken.address, accounts.owner, await this.tusToken.balanceOf(player2.address))
      await player2.withdrawERC20(this.craToken.address, accounts.owner, await this.craToken.balanceOf(player2.address))

      const tusOwnerFinalBalance: BigNumber = await this.tusToken.balanceOf(accounts.owner)
      const craOwnerFinalBalance: BigNumber = await this.craToken.balanceOf(accounts.owner)

      expect(formatEther(tusOwnerInitialBalance
        .add(parseEther('221.7375')).add(parseEther('136.6875'))
        ))
      .to.eq(formatEther(tusOwnerFinalBalance))
  
      expect(formatEther(craOwnerInitialBalance
          .add(parseEther('2.7375')).add(parseEther('1.6875'))
          ))
        .to.eq(formatEther(craOwnerFinalBalance))
  
    });
  

    it('should be possible to withdraw crabada from Player.', async function () {

      expect(await this.IdleGame.ownerOf(this.team1Members[0])).eqls(this.player1.address)
      
      await this.player1.connect(this.owner).removeCrabadaFromTeam(this.team1p1, 0);

      await this.player1.connect(this.owner).withdraw(this.player1.address, [ this.team1Members[0], ])
      
      expect(await this.Crabada.ownerOf(this.team1Members[0])).eqls(this.player1.address)

      await this.player1.connect(this.owner).withdrawERC721(this.Crabada.address, accounts.owner, this.team1Members[0])

      expect(await this.Crabada.ownerOf(this.team1Members[0])).eqls(accounts.owner)
  
    });


  })

});