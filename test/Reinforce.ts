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
const FORK_BLOCKNUMBER: number = Number(process.env.AVALANCHE_FORK_BLOCKNUMBER || "12228380")

interface TestConfigAccount {
  address: string,
  teams: number[]
}

const account = '0xe90a22064f415896f1f72e041874da419390cc6d'
const attackerAccount = '0x44ce6dfbf69299800ab2811ee0aad7471c3f4e5b'
const gameIdToReinforce = BigNumber.from(0x267adf)
const reinforcementCrabadaId = 29186
const crabadaIdAttackReinforcement = 20505

const otherAccount = "0xd65d78f197d80448719d21e71632b73ad5be040d"
const otherGameIdToReinforce = 0x2677f6
const crabadaIdToReinforceOther = 21516

export async function fixture(signers: any, provider: any) {

  const { idleGame, tusToken, craToken, crabada } = getCrabadaContracts(hre)

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

  await ethers.provider.send('hardhat_impersonateAccount', [account] );
  const owner = await ethers.provider.getSigner(account)

  await ethers.provider.send('hardhat_impersonateAccount', [attackerAccount] );
  const attacker = await ethers.provider.getSigner(attackerAccount)

  await ethers.provider.send('hardhat_impersonateAccount', [otherAccount] );
  const other = await ethers.provider.getSigner(otherAccount)

  await Promise.all(
    [0, 1, 2].map(
      index => idleGame.connect(owner).removeCrabadaFromTeam(5357, index)
    )
  );

  await idleGame.connect(owner).withdraw(await attacker.getAddress(), [crabadaIdAttackReinforcement])
  await idleGame.connect(attacker).deposit([crabadaIdAttackReinforcement])

  await idleGame.connect(owner).withdraw(await other.getAddress(), [crabadaIdToReinforceOther])
  await idleGame.connect(other).deposit([crabadaIdToReinforceOther])

  return {owner, idleGame, attacker, other}

}

// Start test block
describe.only('Reinforcement', function () {

  this.timeout(60*1000)

  beforeEach(async function () {

  });

  it('Should be possible to reinforce using self crabada.', async function () {

    const { owner, idleGame } = await loadFixture(fixture);

    await idleGame.connect(owner).reinforceDefense(gameIdToReinforce, reinforcementCrabadaId, 0)

    const { defId1 }: { defId1: BigNumber } = await idleGame.getGameBattleInfo(gameIdToReinforce);

    expect(defId1.eq(reinforcementCrabadaId)).to.be.true

  })

  it('Should be possible to reinforce using self crabada twice after 30 minutes.', async function () {

    const { owner, idleGame, attacker, other } = await loadFixture(fixture);

    await idleGame.connect(owner).reinforceDefense(gameIdToReinforce, reinforcementCrabadaId, 0)
    await idleGame.connect(other).reinforceAttack(otherGameIdToReinforce, crabadaIdToReinforceOther, 0)

    await evm_increaseTime(hre, 20 * 60)

    await idleGame.connect(attacker).reinforceAttack(gameIdToReinforce, crabadaIdAttackReinforcement, 0)

    await evm_increaseTime(hre, 10 * 60 + 1)

    await idleGame.connect(other).withdraw(await owner.getAddress(), [crabadaIdToReinforceOther])
    await idleGame.connect(owner).deposit([crabadaIdToReinforceOther])
  
    await idleGame.connect(owner).reinforceDefense(gameIdToReinforce, crabadaIdToReinforceOther, 0)

    const { defId1, defId2 } = await idleGame.getGameBattleInfo(gameIdToReinforce);

    expect(defId1.eq(reinforcementCrabadaId)).to.be.true
    expect(defId2.eq(crabadaIdToReinforceOther)).to.be.true

  })

  it('Should not be possible to use crabada before 30 minutes after reinforcement.', async function () {

    const { owner, idleGame, attacker, other } = await loadFixture(fixture);

    await idleGame.connect(owner).reinforceDefense(gameIdToReinforce, reinforcementCrabadaId, 0)
    await idleGame.connect(other).reinforceAttack(otherGameIdToReinforce, crabadaIdToReinforceOther, 0)

    await evm_increaseTime(hre, 10 * 60)

    await idleGame.connect(attacker).reinforceAttack(gameIdToReinforce, crabadaIdAttackReinforcement, 0)

    await evm_increaseTime(hre, 10 * 60)

    await expect(
      idleGame.connect(other).withdraw(await owner.getAddress(), [crabadaIdToReinforceOther])
      ).to.be.revertedWith('GAME:CRAB IS LOCKED')


  })

  it('Should not be possible to reinforce using self crabada twice for the same game.', async function () {

    const { owner, idleGame, attacker } = await loadFixture(fixture);

    await idleGame.connect(owner).reinforceDefense(gameIdToReinforce, reinforcementCrabadaId, 0)

    await evm_increaseTime(hre, 20 * 60)

    await idleGame.connect(attacker).reinforceAttack(gameIdToReinforce, crabadaIdAttackReinforcement, 0)

    await evm_increaseTime(hre, 10 * 60 + 1)
  
    await expect(
      idleGame.connect(owner).reinforceDefense(gameIdToReinforce, reinforcementCrabadaId, 0)
      ).to.be.revertedWith('GAME:CRAB JOINED')

  })

});