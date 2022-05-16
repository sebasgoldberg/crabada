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


export class CrabadaNetwork{

    hre: HardhatRuntimeEnvironment

    MINE_CONFIG_BY_TEAM_ID: {
        [teamId: number]: MineConfig
    } = {}

    private SWIMMER_TEST_MINE_CONFIG = [
        {
            signerIndex: 0,
            address: '0xB2f4C513164cD12a1e121Dc4141920B805d024B8',
            teams: [ 1363, 1364, 1365 ],
        },
    ]

    private SWIMMER_MINE_CONFIG = [
        {
            signerIndex: 0,
            address: '0xB2f4C513164cD12a1e121Dc4141920B805d024B8',
            teams: [ 12929, 12942, 12949, 12954 ],
        },
        {
            signerIndex: 1,
            address: '0xE90A22064F415896F1F72e041874Da419390CC6D',
            teams: [ 13001, 13008, 13012, 13015 ],
        },
        {
            signerIndex: 2,
            address: '0xc7C966754DBE52a29DFD1CCcCBfD2ffBe06B23b2',
            teams: [ 13291, 13294, 13299, 13303 ],
        },
        // {
        //     signerIndex: 3,
        //     address: '0x9568bD1eeAeCCF23f0a147478cEF87434aF0B5d4',
        //     teams: [  22568, 22569, 22570 ],
        // },
        // {
        //     signerIndex: 4,
        //     address: '0x83Ff016a2e574b2c35d17Fe4302188b192b64344',
        //     teams: [ 22571, 22572, 22573 ],
        // },
        // {
        //     signerIndex: 5,
        //     address: '0x6315F93dEF48c21FFadD5CbE078Cdb19BAA661F8',
        //     teams: [ 22574, 22575 ],
        // },
    ]

    private MAINNET_MINE_CONFIG: Player[] = [
        {
            signerIndex: 0,
            address: '0xB2f4C513164cD12a1e121Dc4141920B805d024B8',
            teams: [ 3286, 3759, 5032, 19963, 19964, 19965, 19966, 19967 ],
        },
        {
            signerIndex: 1,
            address: '0xE90A22064F415896F1F72e041874Da419390CC6D',
            teams: [ 5357, 5355, 6152 ],
        },
        // {
        //     signerIndex: 2,
        //     address: '0xc7C966754DBE52a29DFD1CCcCBfD2ffBe06B23b2',
        //     teams: [ ],
        // },
        {
            signerIndex: 3,
            address: '0x9568bD1eeAeCCF23f0a147478cEF87434aF0B5d4',
            teams: [ 16767, 16768, 16769 ],
        },
        {
            signerIndex: 4,
            address: '0x83Ff016a2e574b2c35d17Fe4302188b192b64344',
            teams: [ 16761, 16762, 16763 ],
        },
        {
            signerIndex: 5,
            address: '0x6315F93dEF48c21FFadD5CbE078Cdb19BAA661F8',
            teams: [ 16764, 16765, 16766 ],
        },
    ]

    SWIMMER_TEST_MINE_GROUPS: MineGroup[] = [
        {
            teamsOrder: [ 1363, 1364, 1365 ],
            crabadaReinforcers: [ ],
        },
    ]

    SWIMMER_MINE_GROUPS: MineGroup[] = [
        {
            teamsOrder: [ 12929, 12942, 12949, 12954, /*22568, 22569, 22570, 22574*/ ],
            crabadaReinforcers: [ /*87155, 87156,*/ ],
        },
        {
            teamsOrder: [ 13001, 13008, 13012, 13015, /*22571, 22572, 22573, 22575*/ ],
            crabadaReinforcers: [ /*50097, 49769,*/ ],
        },
        {
            teamsOrder: [ 13291, 13294, 13299, 13303 ],
            crabadaReinforcers: [  ],
        },
    ]

    MAINNET_MINE_GROUPS: MineGroup[] = [
        { 
            teamsOrder: [ 3286, 3759, 5032, 19963, 19964, 19965, 19966, 19967 ],
            crabadaReinforcers: [ 49113, 49891 ],
        },
        {
            teamsOrder: [ 16767, 16768, 16769, 16761, 16762, 16763, 16764, 16765 ],
            crabadaReinforcers: [ 49769, 50097 ],
        },
        {
            teamsOrder: [ 5357, ],
            crabadaReinforcers: []
        },

        {
            teamsOrder: [ 5355, ],
            crabadaReinforcers: []
        },

        {
            teamsOrder: [ 6152, ],
            crabadaReinforcers: []
        },
        {
            teamsOrder: [ 16766, ],
            crabadaReinforcers: []
        },
    ]

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
            })
        } else if (this.isSwimmerMainnetNetwork()){
            return ({
                IdleGame: '0x9ab9e81Be39b73de3CCd9408862b1Fc6D2144d2B',
                tusToken: '0x9c765eEE6Eff9CF1337A1846c0D93370785F6C92',
                craToken: '0xC1a1F40D558a3E82C3981189f61EF21e17d6EB48',
                crabada: '0x620FF3d705EDBc1bd03e17E6afcaC36a9779f78D', 
            })
        }
    
        return ({
            IdleGame: '0x82a85407BD612f52577909F4A58bfC6873f14DA8',
            tusToken: '0xf693248F96Fe03422FEa95aC0aFbBBc4a8FdD172',
            craToken: '0xa32608e873f9ddef944b24798db69d80bbb4d1ed',
            crabada: '0x1b7966315ef0259de890f38f1bdb95acc03cacdd',
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