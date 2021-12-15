import * as hre from "hardhat"
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import * as CrabadaAbi from "../abis/Crabada.json"
import * as ERC20Abi from "../abis/ERC20.json"
import { Contract } from "ethers";
import { formatEther, parseEther } from "ethers/lib/utils";
import { evm_increaseTime } from "./utils";

const AVALANCHE_NODE_URL: string = process.env.AVALANCHE_MAINNET_URL as string || "https://api.avax.network/ext/bc/C/rpc";
const FORK_BLOCKNUMBER: number = Number(process.env.AVALANCHE_FORK_BLOCKNUMBER || "8154124")
const OWNER = ""

const accounts = {
  owner: '0xB2f4C513164cD12a1e121Dc4141920B805d024B8',
}

const abi = {
  Crabada: CrabadaAbi,
  ERC20: ERC20Abi
}

const contractAddress = {
  tusToken: '0xf693248F96Fe03422FEa95aC0aFbBBc4a8FdD172',
  craToken: '0xa32608e873f9ddef944b24798db69d80bbb4d1ed',
  crabada: '0x1b7966315ef0259de890f38f1bdb95acc03cacdd'
}

const crabada = [
  9217, // owner
  4649, // other
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

    await evm_increaseTime(7 * 24 * 60 * 60)

    this.Crabada = new Contract(
      contractAddress.crabada,
      abi.Crabada,
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

    await ethers.provider.send('hardhat_impersonateAccount', [accounts.owner] );
    this.owner = await ethers.provider.getSigner(accounts.owner)

  });


  it('Breeding same Crabada.', async function () {

    await expect(
      this.Crabada.connect(this.owner).breed(crabada[0], crabada[0])
    ).to.be.revertedWith('SIBLING1');

  });

  it('Breeding Crabada of different owners.', async function () {

    await expect(
      this.Crabada.connect(this.owner).breed(crabada[0], crabada[1])
    ).to.be.revertedWith('NOT MOMMY OWNER');

    await expect(
      this.Crabada.connect(this.owner).breed(crabada[1], crabada[0])
    ).to.be.revertedWith('NOT DADDY OWNER');

  });

});