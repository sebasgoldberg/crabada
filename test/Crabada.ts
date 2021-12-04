import * as hre from "hardhat"
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import * as IdleGameAbi from "../abis/IdleGame.json"
import * as ERC20Abi from "../abis/ERC20.json"
import { Contract } from "ethers";
import { formatEther, parseEther } from "ethers/lib/utils";
import { evm_increaseTime } from "./utils";

const AVALANCHE_NODE_URL: string = process.env.AVALANCHE_MAINNET_URL as string || "https://api.avax.network/ext/bc/C/rpc";
const FORK_BLOCKNUMBER: number = Number(process.env.AVALANCHE_FORK_BLOCKNUMBER || "7804714") //7650718
const OWNER = ""

const accounts = {
  owner: '0xB2f4C513164cD12a1e121Dc4141920B805d024B8',
  withTeam: '0xb4103D7060372700AA1aF34F04eDc89AaB5c35CE',
}

const abi = {
  IdleGame: IdleGameAbi,
  ERC20: ERC20Abi
}

const contractAddress = {
  IdleGame: '0x82a85407BD612f52577909F4A58bfC6873f14DA8',
  tusToken: '0xf693248F96Fe03422FEa95aC0aFbBBc4a8FdD172'
}

const crabada = [
  2827,
  2933,
  8596
]

// Start test block
describe('Crabada', function () {

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

    evm_increaseTime(7 * 24 * 60 * 60)

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

    await ethers.provider.send('hardhat_impersonateAccount', [accounts.owner] );
    this.owner = await ethers.provider.getSigner(accounts.owner)

    await ethers.provider.send('hardhat_impersonateAccount', [accounts.withTeam] );
    this.withTeam = await ethers.provider.getSigner(accounts.withTeam)

    this.teamId = 1296

    const teamInfo = await this.IdleGame.getTeamInfo(this.teamId)
    const { currentGameId } = teamInfo

    await this.IdleGame.connect(this.withTeam).closeGame(currentGameId)

  });


  it('Fork balance test', async function () {
    // If another contract calls balanceOf on the mock contract, return AMT
    const balance = await ethers.provider.getBalance(accounts.owner);
    const expectedBalance = ethers.utils.parseEther('0.676038653905205704')
    
    expect(balance.eq(expectedBalance)).to.be.true;

  });


  it('IdleGame participants rewards', async function () {
    const baseCraReward: BigNumber = await this.IdleGame.baseCraReward()
    const baseTusReward: BigNumber = await this.IdleGame.baseTusReward()
    expect(ethers.utils.formatEther(baseCraReward)).to.eq('3.75')
    expect(ethers.utils.formatEther(baseTusReward)).to.eq('303.75')
  });

  // it('could be possible to deposit my Crabada into IdleGame', async function () {
  //   const crabadaInMarcketPlace = crabada[2]
  //   await this.IdleGame.connect(this.owner).deposit([crabadaInMarcketPlace])
  // });

  // it('could be possible to create a team into IdleGame', async function () {
  //   await this.IdleGame.connect(this.owner).createTeam(crabada[0], crabada[0], crabada[0])
  // });

  
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

    evm_increaseTime(4 * 60 * 60) // 4 hours

    const teamInfo1 = await this.IdleGame.getTeamInfo(this.teamId)
    const { currentGameId: firstGame } = teamInfo1
    
    await this.IdleGame.connect(this.withTeam).closeGame(firstGame)

    const teamInfo2 = await this.IdleGame.getTeamInfo(this.teamId)
    const { currentGameId: secondGame } = teamInfo2

    await this.IdleGame.connect(this.withTeam).startGame(this.teamId)
  });


  it('could not be possible to close a game twice.', async function () {

    await this.IdleGame.connect(this.withTeam).startGame(this.teamId)

    evm_increaseTime(4 * 60 * 60) // 4 hours

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

    evm_increaseTime(91 * 60) // 1:31 hours

    await expect(
      this.IdleGame.connect(this.withTeam).closeGame(currentGameId)
    ).to.be.revertedWith('GAME:TOO EARLY');

  });

  it('should change team info game ID after starting a game.', async function () {

    await this.IdleGame.connect(this.withTeam).startGame(this.teamId)

    const teamInfo1 = await this.IdleGame.getTeamInfo(this.teamId)
    const { currentGameId: gameId1 } = teamInfo1

    evm_increaseTime(4 * 60 * 60 + 1) // 4 hours

    await this.IdleGame.connect(this.withTeam).closeGame(gameId1)


    await this.IdleGame.connect(this.withTeam).startGame(this.teamId)

    const teamInfo2 = await this.IdleGame.getTeamInfo(this.teamId)
    const { currentGameId: gameId2 } = teamInfo2


    expect(gameId1.toString()).to.not.eq(gameId2.toString())

  });

  it('could receive the reward after successfully finish and close a mining game.', async function () {

    const tusInitialBalance: BigNumber = await this.tusToken.balanceOf(accounts.withTeam)
    
    await this.IdleGame.connect(this.withTeam).startGame(this.teamId)

    const teamInfo = await this.IdleGame.getTeamInfo(this.teamId)
    const { currentGameId } = teamInfo

    evm_increaseTime(4 * 60 * 60 + 1) // 4 hours

    await this.IdleGame.connect(this.withTeam).closeGame(currentGameId)
    
    //this.IdleGame.connect(this.withTeam).settleGame(currentGameId)
    
    const tusFinalBalance: BigNumber = await this.tusToken.balanceOf(accounts.withTeam)

    expect(formatEther(tusInitialBalance
        .add(parseEther('303.75').mul(11).div(10)) // Has Prime Crabada team member
        ))
      .to.eq(formatEther(tusFinalBalance))

    //expect(ethers.utils.formatEther(baseCraReward)).to.eq('3.75')
    

  });

  it('could receive the rewards after successfully finish and close 3 mining games.', async function () {

    const tusInitialBalance: BigNumber = await this.tusToken.balanceOf(accounts.withTeam)
    
    for (let i = 0; i<3; i++){

      await this.IdleGame.connect(this.withTeam).startGame(this.teamId)

      const teamInfo = await this.IdleGame.getTeamInfo(this.teamId)
      const { currentGameId } = teamInfo
  
      evm_increaseTime(4 * 60 * 60 + 1) // 4 hours
  
      await this.IdleGame.connect(this.withTeam).closeGame(currentGameId)
      
      // this.IdleGame.connect(this.withTeam).settleGame(currentGameId)
      
    }

    const tusFinalBalance: BigNumber = await this.tusToken.balanceOf(accounts.withTeam)
    
    expect(formatEther(tusInitialBalance
        .add(parseEther('303.75').mul(3).mul(11).div(10))
        ))
      .to.eq(formatEther(tusFinalBalance))

    //expect(ethers.utils.formatEther(baseCraReward)).to.eq('3.75')
    

  });

});