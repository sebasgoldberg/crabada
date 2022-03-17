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
const FORK_BLOCKNUMBER: number = Number(process.env.AVALANCHE_FORK_BLOCKNUMBER || "11801603")

const testConfig = {
  originalTransaction: {
      signer: "0xdcf34ba96246451338d2f327668dcdb7c075ea4e",
  },
  modifiedTransaction: {
    signer: "0xb82b53d0bcda59c8c6b8014faf7554f4f9808ede",
    team: Number(0x3b40),
  }
}

const originalAttackTransaction = '0x77728f2500000000000000000000000000000000000000000000000000000000001f89d0000000000000000000000000000000000000000000000000000000000000409b000000000000000000000000000000000000000000000000000000006225ec6900000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000041785ff3241e25aec9ec4eec9cd0d7bc29bf6ca141092934e1bf6a849cdecb672b3bd049b462fb2abe2af1f1115352275b53c506712e71a5274fe5bc292c04ccae1b00000000000000000000000000000000000000000000000000000000000000'

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

  await ethers.provider.send('hardhat_impersonateAccount', [testConfig.originalTransaction.signer] );
  const originalSigner = await ethers.provider.getSigner(testConfig.originalTransaction.signer)

  await ethers.provider.send('hardhat_impersonateAccount', [testConfig.modifiedTransaction.signer] );
  const newSigner = await ethers.provider.getSigner(testConfig.modifiedTransaction.signer)

  return { idleGame, tusToken, craToken, crabada, originalSigner, newSigner }

}

// Start test block
describe('AntiBot', function () {

  this.timeout(60*1000)

  beforeEach(async function () {

  });

  it('Should be possible to attack using the original transaction.', async function () {

    const { idleGame, tusToken, craToken, crabada, originalSigner, } = await loadFixture(fixture);

    await originalSigner.sendTransaction({
      to: idleGame.address,
      data: originalAttackTransaction
    })


  })

  it('Should be possible to attack using the original signer but other team.', async function () {

    const { idleGame, tusToken, craToken, crabada, originalSigner} = await loadFixture(fixture);

    const newTeamId = ('0'.repeat(64)+testConfig.modifiedTransaction.team.toString(16)).slice(-64);
    const attackData = originalAttackTransaction.substring(0, 74) + newTeamId + originalAttackTransaction.substring(138);

    await originalSigner.sendTransaction({
      to: idleGame.address,
      data: attackData
    })


  })

  it('Should be possible to attack using other signer and other team.', async function () {

    const { idleGame, tusToken, craToken, crabada, newSigner} = await loadFixture(fixture);

    const newTeamId = ('0'.repeat(64)+testConfig.modifiedTransaction.team.toString(16)).slice(-64);
    const attackData = originalAttackTransaction.substring(0, 74) + newTeamId + originalAttackTransaction.substring(138);

    await newSigner.sendTransaction({
      to: idleGame.address,
      data: attackData
    })


  })

});