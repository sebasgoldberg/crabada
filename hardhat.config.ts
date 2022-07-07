import { extendConfig, extendEnvironment, task } from "hardhat/config"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { BigNumber } from "ethers"
import "@nomiclabs/hardhat-waffle"


const NODE_ID: number = process.env['BLOCKCHAIN_NODE_ID'] ? Number(process.env['BLOCKCHAIN_NODE_ID']) : 0

export const MAINNET_AVAX_MAIN_ACCOUNTS_PKS = process.env['MAINNET_AVAX_MAIN_ACCOUNT_PK'] ? process.env['MAINNET_AVAX_MAIN_ACCOUNT_PK'].split(',') : []
const CRABADA_ATTACKER_PKS = process.env['CRABADA_ATTACKER_PKS'] ? process.env['CRABADA_ATTACKER_PKS'].split(',') : []

// For testing with mainet account when forking
const USE_MAINNET_ACCOUNT = MAINNET_AVAX_MAIN_ACCOUNTS_PKS.length > 0 ? true : false

const mainnetAccount = MAINNET_AVAX_MAIN_ACCOUNTS_PKS.map( account => ({
  privateKey: account,
  balance: '10000000000000000000000'
}))


const crabadaAttackerAccounts = CRABADA_ATTACKER_PKS.map( pk => ({
  privateKey: pk,
  balance: '10000000000000000000000'
}))


// When using the hardhat network, you may choose to fork Fuji or Avalanche Mainnet
// This will allow you to debug contracts using the hardhat network while keeping the current network state
// To enable forking, turn one of these booleans on, and then run your tasks/scripts using ``--network hardhat``
// For more information go to the hardhat guide
// https://hardhat.org/hardhat-network/
// https://hardhat.org/guides/mainnet-forking.html
const FORK_FUJI = false
const FORK_MAINNET = false
const forkingData = FORK_FUJI ? {
  url: 'https://api.avax-test.network/ext/bc/C/rpc',
} : FORK_MAINNET ? {
  url: 'https://api.avax.network/ext/bc/C/rpc'
} : undefined

import "./tasks/crabada"
import "./tasks/telegram"
import "./tasks/utils"
import "./tasks/savemines"
import "./tasks/attackdifference"
import "./tasks/attackpending"
import "./tasks/nocaptchaloot"

import "./tasks/battle-game/sendotp"
import "./tasks/battle-game/login"
import "./tasks/battle-game/claim"
import "./tasks/battle-game/loot"
import "./tasks/battle-game/mine"

task("accounts", "Prints the list of accounts", async (args, hre): Promise<void> => {
  const accounts: SignerWithAddress[] = await hre.ethers.getSigners()
  accounts.forEach((account: SignerWithAddress): void => {
    console.log(account.address)
  })
})

task("balances", "Prints the list of AVAX account balances", async (args, hre): Promise<void> => {
  const accounts: SignerWithAddress[] = await hre.ethers.getSigners()
  for(const account of accounts){
    const balance: BigNumber = await hre.ethers.provider.getBalance(
      account.address
    );
    console.log(`${account.address} has balance ${balance.toString()}`);
  }
})

const LOCAL_ACCOUNTS = [
  "0x56289e99c94b6912bfc12adc093c9b51124f0dc54ac7a766b2bc5ccf558d8027",
  "0x7b4198529994b0dc604278c99d153cfd069d594753d471171a1d102a10438e07",
  "0x15614556be13730e9e8d6eacc1603143e7b96987429df8726384c2ec4502ef6e",
  "0x31b571bf6894a248831ff937bb49f7754509fe93bbd2517c9c73c4144c0e97dc",
  "0x6934bef917e01692b789da754a0eae31a8536eb465e7bff752ea291dad88c675",
  "0xe700bdbdbc279b808b1ec45f8c2370e4616d3a02c336e68d85d4668e08f53cff",
  "0xbbc2865b76ba28016bc2255c7504d000e046ae01934b04c694592a6276988630",
  "0xcdbfd34f687ced8c6968854f8a99ae47712c4f4183b78dcc4a903d1bfe8cbf60",
  "0x86f78c5416151fe3546dece84fda4b4b1e36089f2dbc48496faf3a950f16157c",
  "0x750839e9dbbd2a0910efe40f50b2f3b2f2f59f5580bb4b83bd8c1201cf9a010a"
]

import { HardhatConfig, HardhatRuntimeEnvironment, HardhatUserConfig } from "hardhat/types"
import "./type-extensions";
import { CrabadaHardhatRuntimeEnvironment } from "./scripts/hre"

extendConfig(
  (config: HardhatConfig, userConfig: Readonly<HardhatUserConfig>) => {

    config.nodeId = userConfig.nodeId ? userConfig.nodeId : 0

  }
);

extendEnvironment((hre: HardhatRuntimeEnvironment) => {
  // We add a field to the Hardhat Runtime Environment here.
  // We use lazyObject to avoid initializing things until they are actually
  // needed.
  hre.crabada = new CrabadaHardhatRuntimeEnvironment(hre)
});

export default {
  solidity: {
    compilers: [
      {
        version: "0.5.16"
      },
      {
        version: "0.6.2"
      },
      {
        version: "0.6.4"
      },
      {
        version: "0.7.0"
      },
      {
        version: "0.8.0"
      }
    ]
  },
  networks: {
    hardhat: {
      gasPrice: 150000000000,
      chainId: !forkingData ? 43112 : undefined, //Only specify a chainId if we are not forking
      forking: forkingData,
      accounts: USE_MAINNET_ACCOUNT ? [ ...mainnetAccount, ...crabadaAttackerAccounts ] : undefined
    },
    local: {
      url: 'http://localhost:9650/ext/bc/C/rpc',
      gasPrice: 225000000000,
      chainId: 43112,
      accounts: USE_MAINNET_ACCOUNT ? [ ...MAINNET_AVAX_MAIN_ACCOUNTS_PKS, ...CRABADA_ATTACKER_PKS ] : LOCAL_ACCOUNTS
    },
    fuji: {
      url: 'https://api.avax-test.network/ext/bc/C/rpc',
      gasPrice: 225000000000,
      chainId: 43113,
      accounts: []
    },
    mainnet: {
      url: 'https://api.avax.network/ext/bc/C/rpc',
      gasPrice: 25000000000,
      chainId: 43114,
      accounts: USE_MAINNET_ACCOUNT ? [ ...MAINNET_AVAX_MAIN_ACCOUNTS_PKS, ...CRABADA_ATTACKER_PKS ] : LOCAL_ACCOUNTS
    },
    localmainnet: {
      url: 'http://localhost:9650/ext/bc/C/rpc',
      gasPrice: 25000000000,
      chainId: 43114,
      accounts: USE_MAINNET_ACCOUNT ? [ ...MAINNET_AVAX_MAIN_ACCOUNTS_PKS, ...CRABADA_ATTACKER_PKS ] : LOCAL_ACCOUNTS,
      timeout: 120_000,
    },

    swimmertest: {
      url: 'https://testnet-rpc.swimmer.network/ext/bc/2hUULz82ZYMKwjBHZybVRyouk38EmcW7UKP4iocf9rghpvfm84/rpc',
      gasPrice: 10_000_000_000_000,
      chainId: 73771,
      accounts: USE_MAINNET_ACCOUNT ? [ ...MAINNET_AVAX_MAIN_ACCOUNTS_PKS, ...CRABADA_ATTACKER_PKS ] : LOCAL_ACCOUNTS,
      timeout: 60_000,
    },

    swimmer: {
      // url: 'https://subnets.avax.network/swimmer/mainnet/rpc',
      url: 'https://avax-cra-rpc.gateway.pokt.network/',
      gasPrice: 10_000_000_000_000,
      chainId: 73772,
      accounts: USE_MAINNET_ACCOUNT ? [ ...MAINNET_AVAX_MAIN_ACCOUNTS_PKS, ...CRABADA_ATTACKER_PKS ] : LOCAL_ACCOUNTS,
      timeout: 60_000,
    },

  },
  nodeId: NODE_ID,
}