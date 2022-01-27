import * as hre from "hardhat"
import { expect } from "chai";
import { ethers, waffle } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "ethers";
import { evm_increaseTime } from "./utils";
import { getCrabadaContracts } from "../scripts/crabada";
import { JsonRpcSigner } from "@ethersproject/providers";
import { TransactionResponse } from "@ethersproject/abstract-provider";
const { loadFixture } = waffle;

const AVALANCHE_NODE_URL: string = process.env.AVALANCHE_MAINNET_URL as string || "https://api.avax.network/ext/bc/C/rpc";
const FORK_BLOCKNUMBER: number = Number(process.env.AVALANCHE_FORK_BLOCKNUMBER || "10123251") //10052453

interface TestConfigAccount {
  address: string,
  teams: number[]
}

const testConfig: TestConfigAccount[] = [
  {
    address: "0xB2f4C513164cD12a1e121Dc4141920B805d024B8",
    teams: [ 3759, 3286, 5032 ],
  },
  {
    address: "0xE90A22064F415896F1F72e041874Da419390CC6D",
    teams: [ 5355, 5357, 6152 ],
  },
  {
    address: "0xc7C966754DBE52a29DFD1CCcCBfD2ffBe06B23b2",
    teams: [ 7449, 8157 ],
  },
]


export async function fixture(signers: any, provider: any) {

  const { idleGame, tusToken, craToken, crabada } = getCrabadaContracts(hre)
  const teamId1 = testConfig[0].teams[0]
  const teamId2 = testConfig[0].teams[1]

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

  await ethers.provider.send('hardhat_impersonateAccount', [testConfig[0].address] );
  const owner = await ethers.provider.getSigner(testConfig[0].address)

  await ethers.provider.send('hardhat_impersonateAccount', [testConfig[1].address] );
  const looter1 = await ethers.provider.getSigner(testConfig[1].address)

  await ethers.provider.send('hardhat_impersonateAccount', [testConfig[2].address] );
  const looter2 = await ethers.provider.getSigner(testConfig[2].address)


  const AttackRouter = (await ethers.getContractFactory("AttackRouter")).connect(owner);
  const attackRouter = await AttackRouter.deploy()

  const Player = (await ethers.getContractFactory("Player")).connect(owner)
  const player1 = await Player.connect(owner).deploy(idleGame.address, crabada.address)
  const player2 = await Player.connect(owner).deploy(idleGame.address, crabada.address)
  
  // Getting teams info
  const teamInfo = await idleGame.getTeamInfo(teamId1)
  const { currentGameId, crabadaId1: c1t1, crabadaId2: c2t1, crabadaId3: c3t1 } = teamInfo
  const team1Members = [c1t1, c2t1, c3t1]

  const teamInfo2 = await idleGame.getTeamInfo(teamId2)
  const { currentGameId: gameId2, crabadaId1: c1t2, crabadaId2: c2t2, crabadaId3: c3t2 } = teamInfo2
  const team2Members = [c1t2, c2t2, c3t2]

  // Ending games

  await Promise.all(
    testConfig.map( (account) => {

      return account.teams.map( async(teamId) => {

        const teamInfo = await idleGame.getTeamInfo(teamId)
        const { currentGameId } = teamInfo

        if ((currentGameId as BigNumber).isZero())
          return
          
        await idleGame.connect(owner).settleGame(currentGameId)
  
      })
  
    }).flat())


  // Removing crabadas from teams

  await Promise.all(
    [0, 1, 2].map(
      index => idleGame.connect(owner).removeCrabadaFromTeam(teamId1, index)
    )
  );

  await Promise.all(
    [0, 1, 2].map(
      index => idleGame.connect(owner).removeCrabadaFromTeam(teamId2, index)
    )
  );

  // Withdrawing crabadas from game
  await idleGame.connect(owner).withdraw(testConfig[0].address, team1Members)
  await idleGame.connect(owner).withdraw(testConfig[0].address, team2Members)

  await crabada.connect(owner).setApprovalForAll(player1.address, true)
  await crabada.connect(owner).setApprovalForAll(player2.address, true)

  await player1.connect(owner).deposit(testConfig[0].address, team1Members)
  await player1.connect(owner).createTeam(...team1Members)
  const team1p1 = await player1.teams(0)

  await player2.connect(owner).deposit(testConfig[0].address, team2Members)
  await player2.connect(owner).createTeam(...team2Members)
  const team1p2 = await player2.teams(0)

  await player1.connect(owner).addOwner(attackRouter.address)
  await player2.connect(owner).addOwner(attackRouter.address)

  return { idleGame, tusToken, craToken, crabada, attackRouter, teamId1, teamId2,
    player1, player2, team1Members, team2Members, team1p1, team1p2, owner, looter1, looter2 }

}

// Start test block
describe.only('AttackRouter', function () {

  this.timeout(60*1000)

  beforeEach(async function () {

  });

  it('Should be 14400 the difference between block.timestamp and lockTo after startGame.', async function () {

    const { idleGame, tusToken, craToken, crabada, attackRouter, teamId1, teamId2,
      player1, player2, team1Members, team2Members, team1p1, team1p2, owner, looter1, looter2 } = await loadFixture(fixture);

    const TestLockToAfterStartGame = (await ethers.getContractFactory("TestLockToAfterStartGame")).connect(owner)
    const testLockToAfterStartGame = await TestLockToAfterStartGame.deploy()

    await player1.connect(owner).addOwner(testLockToAfterStartGame.address)

    await testLockToAfterStartGame.connect(owner).test(idleGame.address, player1.address, team1p1)

  })

  it('Should be zero the current game after closing a mining game.', async function () {

    const { idleGame, tusToken, craToken, crabada, attackRouter, teamId1, teamId2,
      player1, player2, team1Members, team2Members, team1p1, team1p2, owner, looter1, looter2 } = await loadFixture(fixture);

    await player1.connect(owner).startGame(team1p1)

    await evm_increaseTime(hre, 14401)

    const teamInfo = await idleGame.getTeamInfo(team1p1)
    const { currentGameId, } = teamInfo

    expect((currentGameId as BigNumber).isZero()).to.be.false

    await idleGame.connect(owner).closeGame(currentGameId)

    const teamInfo2 = await idleGame.getTeamInfo(team1p1)
    const { currentGameId: currentGameId2, } = teamInfo2

    expect((currentGameId2 as BigNumber).isZero()).to.be.true

  })

  it('Should be zero the attackTeamId if game is not looted.', async function () {

    const { idleGame, tusToken, craToken, crabada, attackRouter, teamId1, teamId2,
      player1, player2, team1Members, team2Members, team1p1, team1p2, owner, looter1, looter2 } = await loadFixture(fixture);

    await player1.connect(owner).startGame(team1p1)

    const teamInfo = await idleGame.getTeamInfo(team1p1)
    const { currentGameId, } = teamInfo

    const battleInfo = await idleGame.getGameBattleInfo(currentGameId)
    const { attackTeamId, } = battleInfo

    expect((attackTeamId as BigNumber).isZero()).to.be.true

    await player2.connect(owner).attack(currentGameId, team1p2)

    const battleInfo2 = await idleGame.getGameBattleInfo(currentGameId)
    const { attackTeamId: attackTeamId2, } = battleInfo2

    expect((attackTeamId2 as BigNumber).isZero()).to.be.false

  })

  it('Should be zero the currentGameId when game is settled.', async function () {

    const { idleGame, tusToken, craToken, crabada, attackRouter, teamId1, teamId2,
      player1, player2, team1Members, team2Members, team1p1, team1p2, owner, looter1, looter2 } = await loadFixture(fixture);

    await player1.connect(owner).startGame(team1p1)

    const teamInfo = await idleGame.getTeamInfo(team1p1)
    const { currentGameId, } = teamInfo

    await player2.connect(owner).attack(currentGameId, team1p2)

    const teamInfo2 = await idleGame.getTeamInfo(team1p2)
    const { currentGameId: currentGameId2, } = teamInfo2

    expect((currentGameId2 as BigNumber).isZero()).to.be.false

    await evm_increaseTime(hre, 3601)

    await idleGame.connect(owner).settleGame(currentGameId)

    const teamInfo3 = await idleGame.getTeamInfo(team1p2)
    const { currentGameId: currentGameId3, } = teamInfo3

    expect((currentGameId3 as BigNumber).isZero()).to.be.true

  })


  it('Should be possible to attack one miner.', async function () {

    const { idleGame, tusToken, craToken, crabada, attackRouter, teamId1, teamId2,
      player1, player2, team1Members, team2Members, team1p1, team1p2, owner, looter1, looter2 } = await loadFixture(fixture);

    const { battlePoint: t1BattlePoint } = await idleGame.getTeamInfo(team1p1)

    const targetTeamId = testConfig[1].teams[0]
    const { battlePoint: targetBattlePoint } = await idleGame.getTeamInfo(targetTeamId)

    await idleGame.connect(looter1).startGame(targetTeamId)

    await attackRouter.connect(owner).attackTeams(
      idleGame.address, 
      [player1.address], [team1p1], [t1BattlePoint],
      [targetTeamId], [targetBattlePoint]
    )

    const { currentGameId: targetCurrentGameId } = await idleGame.getTeamInfo(targetTeamId)

    const { attackTeamId } = await idleGame.getGameBattleInfo(targetCurrentGameId)
    
    expect(attackTeamId.toString()).to.eq(team1p1)

  });

  it('Should be possible to attack two miners.', async function () {

    const { idleGame, tusToken, craToken, crabada, attackRouter, teamId1, teamId2,
      player1, player2, team1Members, team2Members, team1p1, team1p2, owner, looter1, looter2 } = await loadFixture(fixture);

    const [target1, target2] = [testConfig[1].teams[0], testConfig[1].teams[1]]

    let battlePoints: number[] = await Promise.all(
      [team1p1, team1p2, target1, target2]
        .map( async(teamId) => {
          const { battlePoint } = await idleGame.getTeamInfo(teamId)
          return battlePoint
        })
    )

    await Promise.all(
      [target1, target2]
        .map( async(targetTeamId) => await idleGame.connect(looter1).startGame(targetTeamId))
    )

    await attackRouter.connect(owner).attackTeams(
      idleGame.address, 
      battlePoints[0] <= battlePoints[1] ? [player1.address, player2.address] : [player2.address, player1.address], 
      battlePoints[0] <= battlePoints[1] ? [team1p1, team1p2] : [team1p2, team1p1], 
      battlePoints[0] <= battlePoints[1] ? [battlePoints[0], battlePoints[1]] : [battlePoints[1], battlePoints[0]],
      battlePoints[2] <= battlePoints[3] ? [target1, target2] : [target2, target1],
      battlePoints[2] <= battlePoints[3] ? [battlePoints[2], battlePoints[3]] : [battlePoints[3], battlePoints[2]]
    )

    await Promise.all(
      [target1, target2]
        .map( async(targetTeamId) => {
          const { currentGameId: targetCurrentGameId } = await idleGame.getTeamInfo(targetTeamId)

          const { attackTeamId } = await idleGame.getGameBattleInfo(targetCurrentGameId)
          
          expect([team1p1, team1p2].map(x=>x.toString())).to.include(attackTeamId.toString())
        })
    )

  });

  it('Should be possible to attack only one target if the other is already looted.', async function () {

    const { idleGame, tusToken, craToken, crabada, attackRouter, teamId1, teamId2,
      player1, player2, team1Members, team2Members, team1p1, team1p2, owner, looter1, looter2 } = await loadFixture(fixture);

    const [target1, target2] = [testConfig[1].teams[0], testConfig[1].teams[1]]

    let battlePoints: number[] = await Promise.all(
      [team1p1, team1p2, target1, target2]
        .map( async(teamId) => {
          const { battlePoint } = await idleGame.getTeamInfo(teamId)
          return battlePoint
        })
    )

    await Promise.all(
      [target1, target2]
        .map( async(targetTeamId) => await idleGame.connect(looter1).startGame(targetTeamId))
    )

    const externalLooter = testConfig[2].teams[0]
    const { currentGameId: target1CurrentGameId } = await idleGame.getTeamInfo(target1)
    await idleGame.connect(looter2).attack(target1CurrentGameId, externalLooter)

    await attackRouter.connect(owner).attackTeams(
      idleGame.address, 
      battlePoints[0] <= battlePoints[1] ? [player1.address, player2.address] : [player2.address, player1.address], 
      battlePoints[0] <= battlePoints[1] ? [team1p1, team1p2] : [team1p2, team1p1], 
      battlePoints[0] <= battlePoints[1] ? [battlePoints[0], battlePoints[1]] : [battlePoints[1], battlePoints[0]],
      battlePoints[2] <= battlePoints[3] ? [target1, target2] : [target2, target1],
      battlePoints[2] <= battlePoints[3] ? [battlePoints[2], battlePoints[3]] : [battlePoints[3], battlePoints[2]]
    )

    const attackTeamsIds = await Promise.all(
      [target1, target2]
        .map( async(targetTeamId) => {
          const { currentGameId: targetCurrentGameId } = await idleGame.getTeamInfo(targetTeamId)
          const { attackTeamId } = await idleGame.getGameBattleInfo(targetCurrentGameId)
          return attackTeamId
        })
    )

    const sAttackTeamsIds = attackTeamsIds.map(x=>x.toString())
    expect(
      sAttackTeamsIds.includes(externalLooter.toString()) && (
        sAttackTeamsIds.includes(team1p1.toString()) ||
        sAttackTeamsIds.includes(team1p2.toString())
      )
      ).to.be.true

  });

  it('Should be possible to attack with one looter if another looter is busy.', async function () {

    const { idleGame, tusToken, craToken, crabada, attackRouter, teamId1, teamId2,
      player1, player2, team1Members, team2Members, team1p1, team1p2, owner, looter1, looter2 } = await loadFixture(fixture);

    const [target1, target2] = [testConfig[1].teams[0], testConfig[1].teams[1]]

    let battlePoints: number[] = await Promise.all(
      [team1p1, team1p2, target1, target2]
        .map( async(teamId) => {
          const { battlePoint } = await idleGame.getTeamInfo(teamId)
          return battlePoint
        })
    )

    await Promise.all(
      [target1, target2]
        .map( async(targetTeamId) => await idleGame.connect(looter1).startGame(targetTeamId))
    )

    const { currentGameId: target1CurrentGameId } = await idleGame.getTeamInfo(target1)
    await player1.connect(owner).attack(target1CurrentGameId, team1p1)

    await attackRouter.connect(owner).attackTeams(
      idleGame.address, 
      battlePoints[0] <= battlePoints[1] ? [player1.address, player2.address] : [player2.address, player1.address], 
      battlePoints[0] <= battlePoints[1] ? [team1p1, team1p2] : [team1p2, team1p1], 
      battlePoints[0] <= battlePoints[1] ? [battlePoints[0], battlePoints[1]] : [battlePoints[1], battlePoints[0]],
      [target2],
      [battlePoints[3]]
    )

    const attackTeamsIds = await Promise.all(
      [target2]
        .map( async(targetTeamId) => {
          const { currentGameId: targetCurrentGameId } = await idleGame.getTeamInfo(targetTeamId)
          const { attackTeamId } = await idleGame.getGameBattleInfo(targetCurrentGameId)
          return attackTeamId
        })
    )

    const sAttackTeamsIds = attackTeamsIds.map(x=>x.toString())
    expect(
      sAttackTeamsIds.includes(team1p2.toString())
      ).to.be.true

  });

  it('Should revert when target are not mining.', async function () {

    const { idleGame, tusToken, craToken, crabada, attackRouter, teamId1, teamId2,
      player1, player2, team1Members, team2Members, team1p1, team1p2, owner, looter1, looter2 } = await loadFixture(fixture);

    const { battlePoint: t1BattlePoint } = await idleGame.getTeamInfo(team1p1)

    const targetTeamId = testConfig[1].teams[0]
    const { battlePoint: targetBattlePoint } = await idleGame.getTeamInfo(targetTeamId)

    await 
    expect(
      attackRouter.connect(owner).attackTeams(
        idleGame.address, 
        [player1.address], [team1p1], [t1BattlePoint],
        [targetTeamId], [targetBattlePoint]
      )
    ).to.be.revertedWith('ROUTER: NO TARGET MINING')

  });

  it('Should revert when multiple targets are not mining.', async function () {

    const { idleGame, tusToken, craToken, crabada, attackRouter, teamId1, teamId2,
      player1, player2, team1Members, team2Members, team1p1, team1p2, owner, looter1, looter2 } = await loadFixture(fixture);

    const [target1, target2] = [testConfig[1].teams[0], testConfig[1].teams[1]]

    let battlePoints: number[] = await Promise.all(
      [team1p1, team1p2, target1, target2]
        .map( async(teamId) => {
          const { battlePoint } = await idleGame.getTeamInfo(teamId)
          return battlePoint
        })
    )

    await 
    expect(
      attackRouter.connect(owner).attackTeams(
        idleGame.address, 
        battlePoints[0] <= battlePoints[1] ? [player1.address, player2.address] : [player2.address, player1.address], 
        battlePoints[0] <= battlePoints[1] ? [team1p1, team1p2] : [team1p2, team1p1], 
        battlePoints[0] <= battlePoints[1] ? [battlePoints[0], battlePoints[1]] : [battlePoints[1], battlePoints[0]],
        battlePoints[2] <= battlePoints[3] ? [target1, target2] : [target2, target1],
        battlePoints[2] <= battlePoints[3] ? [battlePoints[2], battlePoints[3]] : [battlePoints[3], battlePoints[2]]
      )
    ).to.be.revertedWith('ROUTER: NO TARGET MINING')

  });

  it('Should revert if all targets are already looted.', async function () {

    const { idleGame, tusToken, craToken, crabada, attackRouter, teamId1, teamId2,
      player1, player2, team1Members, team2Members, team1p1, team1p2, owner, looter1, looter2 } = await loadFixture(fixture);

    const [target1, target2] = [testConfig[1].teams[0], testConfig[1].teams[1]]

    let battlePoints: number[] = await Promise.all(
      [team1p1, team1p2, target1, target2]
        .map( async(teamId) => {
          const { battlePoint } = await idleGame.getTeamInfo(teamId)
          return battlePoint
        })
    )

    await Promise.all(
      [target1, target2]
        .map( async(targetTeamId) => await idleGame.connect(looter1).startGame(targetTeamId))
    )

    const externalLooter1 = testConfig[2].teams[0]
    const { currentGameId: target1CurrentGameId } = await idleGame.getTeamInfo(target1)
    await idleGame.connect(looter2).attack(target1CurrentGameId, externalLooter1)

    const externalLooter2 = testConfig[2].teams[1]
    const { currentGameId: target2CurrentGameId } = await idleGame.getTeamInfo(target2)
    await idleGame.connect(looter2).attack(target2CurrentGameId, externalLooter2)

    await 
    expect(
      attackRouter.connect(owner).attackTeams(
        idleGame.address, 
        battlePoints[0] <= battlePoints[1] ? [player1.address, player2.address] : [player2.address, player1.address], 
        battlePoints[0] <= battlePoints[1] ? [team1p1, team1p2] : [team1p2, team1p1], 
        battlePoints[0] <= battlePoints[1] ? [battlePoints[0], battlePoints[1]] : [battlePoints[1], battlePoints[0]],
        battlePoints[2] <= battlePoints[3] ? [target1, target2] : [target2, target1],
        battlePoints[2] <= battlePoints[3] ? [battlePoints[2], battlePoints[3]] : [battlePoints[3], battlePoints[2]]
      )
    ).to.be.revertedWith('ROUTER: NO TARGET AVAILABLE')

  });

  it('Should revert if all looters are busy.', async function () {

    const { idleGame, tusToken, craToken, crabada, attackRouter, teamId1, teamId2,
      player1, player2, team1Members, team2Members, team1p1, team1p2, owner, looter1, looter2 } = await loadFixture(fixture);

    const [target1, target2] = [testConfig[1].teams[0], testConfig[1].teams[1]]

    let battlePoints: number[] = await Promise.all(
      [team1p1, target1]
        .map( async(teamId) => {
          const { battlePoint } = await idleGame.getTeamInfo(teamId)
          return battlePoint
        })
    )

    await Promise.all(
      [target1, target2]
        .map( async(targetTeamId) => await idleGame.connect(looter1).startGame(targetTeamId))
    )

    const { currentGameId } = await idleGame.getTeamInfo(target2)
    await player1.connect(owner).attack(currentGameId, team1p1)

    await 
    expect(
      attackRouter.connect(owner).attackTeams(
        idleGame.address, 
        [player1.address], 
        [team1p1],
        [battlePoints[0]],
        [target1],
        [battlePoints[1]]
      )
    ).to.be.revertedWith('ROUTER: NO ATTACK PERFORMED')

  });

});