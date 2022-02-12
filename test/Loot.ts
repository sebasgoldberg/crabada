import * as hre from "hardhat"
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "ethers";
import { evm_increaseTime } from "./utils";
import { getCrabadaContracts, loot, TeamInfoByTeam } from "../scripts/crabada";
import { TransactionResponse } from "@ethersproject/abstract-provider";

const AVALANCHE_NODE_URL: string = process.env.AVALANCHE_MAINNET_URL as string || "https://api.avax.network/ext/bc/C/rpc";
const FORK_BLOCKNUMBER: number = Number(process.env.AVALANCHE_FORK_BLOCKNUMBER || "9009873") //

const accounts = {
  owner: '0xB2f4C513164cD12a1e121Dc4141920B805d024B8',
  withTeam: '0xb4103D7060372700AA1aF34F04eDc89AaB5c35CE',
}


// Start test block
describe('Looting', function () {

  beforeEach(async function () {

    const { idleGame } = getCrabadaContracts(hre)

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

    this.teamId1 = 3286;
    this.teamId2 = 3759;
    this.looterTeamId = 4400

    // Getting teams info
    const teamInfo = await idleGame.getTeamInfo(this.teamId1)
    const { currentGameId } = teamInfo

    const teamInfo2 = await idleGame.getTeamInfo(this.teamId2)
    const { currentGameId: gameId2 } = teamInfo2

    // Ending games

    if (!(currentGameId as BigNumber).isZero())
      await idleGame.connect(this.owner).closeGame(currentGameId)

    if (!(gameId2 as BigNumber).isZero())
      await idleGame.connect(this.owner).closeGame(gameId2)

  });

  describe('Looting', function () {

    it('Should loot task end after looting.', async function () {

      const { idleGame } = getCrabadaContracts(hre)

      const possibleTargetsByTeamId: TeamInfoByTeam = {
        [this.teamId1.toString()]: {
        }
      }

      // TODO Initialize dict using crabadas IDs from teams with class name 'PRIME'
      const lootPromise = loot(hre, possibleTargetsByTeamId, this.looterTeamId, this.owner, {}, ()=>{})

      await idleGame.connect(this.owner).startGame(this.teamId1)

      const tx: TransactionResponse = await lootPromise

      const events = await idleGame.queryFilter(idleGame.filters.Fight(), tx.blockNumber, tx.blockNumber);
      const lootedTeamId = events.map(x => x.args.defenseTeamId)[0]

      expect(lootedTeamId).to.eq(this.teamId1)

    });
  
    it('Should loot only the possible targets.', async function () {

      const { idleGame } = getCrabadaContracts(hre)

      const possibleTargetsByTeamId: TeamInfoByTeam = {
        [this.teamId1.toString()]: {
        }
      }

      // TODO Initialize dict using crabadas IDs from teams with class name 'PRIME'
      const lootPromise = loot(hre, possibleTargetsByTeamId, this.looterTeamId, this.owner, {}, ()=>{})

      await idleGame.connect(this.owner).startGame(this.teamId2)

      await idleGame.connect(this.owner).startGame(this.teamId1)
  
      const tx: TransactionResponse = await lootPromise

      const events = await idleGame.queryFilter(idleGame.filters.Fight(), tx.blockNumber, tx.blockNumber);
      const lootedTeamId = events.map(x => x.args.defenseTeamId)[0]

      expect(lootedTeamId).to.eq(this.teamId1)

    });
  
  })

});