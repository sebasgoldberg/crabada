import { BigNumber } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { CrabadaAPI } from "./api";
import { GAS_LIMIT, MAX_FEE, ONE_GWEI } from "./crabada";


interface MineConfig{
    signerIndex: number,
    address: string,
    teams: number[]
}

interface MineGroup {
    teamsOrder: number[],
    crabadaReinforcers: number[]
}

export interface Player {
    address: string,
    teams: number[],
    signerIndex: number
}

interface LootCaptchaConfig {
    players: Player[],
    attackOnlyTeamsThatPlayToLoose: boolean
}

import {env} from "./env"

export class CrabadaNetwork{

    hre: HardhatRuntimeEnvironment

    MINE_CONFIG_BY_TEAM_ID: {
        [teamId: number]: MineConfig
    } = {}

    private SWIMMER_TEST_MINE_CONFIG = env.SWIMMER_TEST_MINE_CONFIG

    private SWIMMER_MINE_CONFIG = env.SWIMMER_TEST_MINE_CONFIG

    private MAINNET_MINE_CONFIG: Player[] = env.MAINNET_MINE_CONFIG

    SWIMMER_TEST_MINE_GROUPS: MineGroup[] = env.SWIMMER_TEST_MINE_GROUPS

    SWIMMER_MINE_GROUPS: MineGroup[] = env.SWIMMER_MINE_GROUPS

    MAINNET_MINE_GROUPS: MineGroup[] = env.MAINNET_MINE_GROUPS

    MINE_CONFIG: MineConfig[]
    MINE_GROUPS: MineGroup[]

    private initializeMineConfigByTeamId(){
    
        this.MINE_CONFIG
            .forEach( mineConfig => mineConfig.teams
                .forEach( teamId => this.MINE_CONFIG_BY_TEAM_ID[teamId] = mineConfig )
            );
        
    }

    private initializeMineConfig(){

        this.MINE_CONFIG = this.isSwimmerTestNetwork() ? 
            this.SWIMMER_TEST_MINE_CONFIG
            : this.isSwimmerMainnetNetwork() ?
                this.SWIMMER_MINE_CONFIG
                : this.MAINNET_MINE_CONFIG

        this.initializeMineConfigByTeamId()

        this.MINE_GROUPS = this.isSwimmerTestNetwork() ?
            this.SWIMMER_TEST_MINE_GROUPS
            : this.isSwimmerMainnetNetwork() ?
                this.SWIMMER_MINE_GROUPS
                : this.MAINNET_MINE_GROUPS

    }

    LOOT_CAPTCHA_CONFIG: LootCaptchaConfig;

    private initializeLootCaptchaConfig(){
        this.LOOT_CAPTCHA_CONFIG = {
            players: (this.MINE_CONFIG as MineConfig[]).map( x => ({...x, signerIndex: x.signerIndex+1}) ),
            attackOnlyTeamsThatPlayToLoose: false
        }
    }
    

    constructor(hre: HardhatRuntimeEnvironment){
        this.hre = hre
        this.initializeMineConfig()
        this.initializeLootCaptchaConfig()
    }

    isSwimmerNetwork(): boolean{
        return /swimmer/.test(this.hre.network.name)
    }

    isTestNetwork(): boolean{
        return /test/.test(this.hre.network.name)
    }

    isSwimmerTestNetwork(): boolean{
        return this.hre.network.name == 'swimmertest'
    }

    isSwimmerMainnetNetwork(): boolean{
        return this.hre.network.name == 'swimmer'
    }

    getIdleGameApiBaseUrl(): string{
        if (this.isSwimmerTestNetwork()){
            return 'https://idle-game-subnet-test-api.crabada.com'
        }else if (this.isSwimmerMainnetNetwork()){
            return 'https://idle-game-api.crabada.com'
        }else{
            return 'https://idle-api.crabada.com'
        }

    }

    getCrabadaApiBaseUrl(): string{
        if (this.isSwimmerTestNetwork()){
            return 'https://subnet-test-api.crabada.com'
        }else if (this.isSwimmerMainnetNetwork()){
            return 'https://market-api.crabada.com'
        }else{
            return 'https://api.crabada.com'
        }

    }

    getOrigin(): string{
        return 'https://play.crabada.com'
    }

    getReferer(): string{
        return 'https://play.crabada.com'
    }

    getContractAddresses(){

        if (this.isSwimmerTestNetwork()){
            return ({
                IdleGame: '0x88586dF1EB949E2b7b9A8b7DB468aF2251908465',
                tusToken: '0x57bf0eCe401d3126d37B3c23d35b1c1EE3EaE733',
                craToken: '0x26b77eeF7A38E3FD8C631FF8a268a5BB98CE1552',
                crabada: '0xe56cb40A104cf2783EA912859B4Ca7dE77cdC961',
                antiBot: ''
            })
        } else if (this.isSwimmerMainnetNetwork()){
            return ({
                IdleGame: '0x9ab9e81Be39b73de3CCd9408862b1Fc6D2144d2B',
                tusToken: '0x9c765eEE6Eff9CF1337A1846c0D93370785F6C92',
                craToken: '0xC1a1F40D558a3E82C3981189f61EF21e17d6EB48',
                crabada: '0x620FF3d705EDBc1bd03e17E6afcaC36a9779f78D',
                antiBot: '0x7C179e9A4EcA62d92277E5808b32fe7417152Fc8'
            })
        }
    
        return ({
            IdleGame: '0x82a85407BD612f52577909F4A58bfC6873f14DA8',
            tusToken: '0xf693248F96Fe03422FEa95aC0aFbBBc4a8FdD172',
            craToken: '0xa32608e873f9ddef944b24798db69d80bbb4d1ed',
            crabada: '0x1b7966315ef0259de890f38f1bdb95acc03cacdd',
            antiBot: ''
        })
    }

    getOverride(){
        if (this.isSwimmerNetwork()){
            if (this.isTestNetwork()){
                return ({
                    gasLimit: GAS_LIMIT,
                    gasPrice: 4200*ONE_GWEI,
                    nonce: undefined
                })    
            } else {
                return ({...this.SWIMMER_OVERRIDE, nonce: undefined})
            }
        }
        else
            return ({maxFeePerGas: 150*ONE_GWEI, maxPriorityFeePerGas: ONE_GWEI, gasLimit: GAS_LIMIT, nonce: undefined})
    }

    SWIMMER_BASE_FEE = 10_000*ONE_GWEI
    SWIMMER_MAX_FEE = 3*this.SWIMMER_BASE_FEE
    SWIMMER_OVERRIDE = {
        gasLimit: GAS_LIMIT,
        maxFeePerGas: this.SWIMMER_MAX_FEE,
        maxPriorityFeePerGas: ONE_GWEI
    }
    
    getPriorityOverride(){
        if (this.isSwimmerNetwork()){
            if (this.isTestNetwork()){
                return ({
                    gasLimit: GAS_LIMIT,
                    gasPrice: 4200*ONE_GWEI,
                })    
            } else {
                return this.SWIMMER_OVERRIDE
            }
        }
    
        return ({
            gasLimit: GAS_LIMIT,
            // gasPrice: undefined,
            maxFeePerGas: BigNumber.from(ONE_GWEI*150),
            maxPriorityFeePerGas: ONE_GWEI
        })
    }
    
    getAttackOverride(){
        if (this.isSwimmerNetwork()){
            if (this.isTestNetwork()){
                return ({
                    gasLimit: GAS_LIMIT,
                    gasPrice: 4200*ONE_GWEI,
                })    
            } else {
                return this.SWIMMER_OVERRIDE
            }
        }
    
        return ({
            gasLimit: GAS_LIMIT,
            // gasPrice: undefined,
            maxFeePerGas: BigNumber.from(ONE_GWEI*400),
            maxPriorityFeePerGas: ONE_GWEI
        })
    }
    
}


export class CrabadaHardhatRuntimeEnvironment{

    network: CrabadaNetwork
    api: CrabadaAPI

    constructor(hre: HardhatRuntimeEnvironment){
        this.network = new CrabadaNetwork(hre)
        this.api = new CrabadaAPI(this.network)
    }

}