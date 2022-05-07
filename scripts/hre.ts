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
    attackTransaction: {
        override: {
            gasLimit: number,
            gasPrice?: BigNumber,
            maxFeePerGas?: BigNumber,
            maxPriorityFeePerGas?: BigNumber,
        }
    },
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
            teams: [ 3790/*, 3791*/ ],
        },
    ]

    private MAINNET_MINE_CONFIG = [
        // {
        //     signerIndex: 0,
        //     address: '0xB2f4C513164cD12a1e121Dc4141920B805d024B8',
        //     teams: [ 3286, 3759, 5032, 19963, 19964, 19965, 19966, 19967 ],
        // },
        // {
        //     signerIndex: 1,
        //     address: '0xE90A22064F415896F1F72e041874Da419390CC6D',
        //     teams: [ 5357, 5355, 6152 ],
        // },
        // // {
        // //     signerIndex: 2,
        // //     address: '0xc7C966754DBE52a29DFD1CCcCBfD2ffBe06B23b2',
        // //     teams: [ ],
        // // },
        // {
        //     signerIndex: 3,
        //     address: '0x9568bD1eeAeCCF23f0a147478cEF87434aF0B5d4',
        //     teams: [ 16767, 16768, 16769 ],
        // },
        // {
        //     signerIndex: 4,
        //     address: '0x83Ff016a2e574b2c35d17Fe4302188b192b64344',
        //     teams: [ 16761, 16762, 16763 ],
        // },
        // {
        //     signerIndex: 5,
        //     address: '0x6315F93dEF48c21FFadD5CbE078Cdb19BAA661F8',
        //     teams: [ 16764, 16765, 16766 ],
        // },
    ]

    SWIMMER_TEST_MINE_GROUPS: MineGroup[] = [
        {
            teamsOrder: [ 3790/*, 3791*/ ],
            crabadaReinforcers: [ 49817, 49819, /*49823,*/ ],
        },
    ]

    MAINNET_MINE_GROUPS: MineGroup[] = [
        // { 
        //     teamsOrder: [ 3286, 3759, 5032, 19963, 19964, 19965, 19966, 19967 ],
        //     crabadaReinforcers: [ 49113, 49891 ],
        // },
        // {
        //     teamsOrder: [ 16767, 16768, 16769, 16761, 16762, 16763, 16764, 16765 ],
        //     crabadaReinforcers: [ 49769, 50097 ],
        // },
        // {
        //     teamsOrder: [ 5357, ],
        //     crabadaReinforcers: []
        // },

        // {
        //     teamsOrder: [ 5355, ],
        //     crabadaReinforcers: []
        // },

        // {
        //     teamsOrder: [ 6152, ],
        //     crabadaReinforcers: []
        // },
        // {
        //     teamsOrder: [ 16766, ],
        //     crabadaReinforcers: []
        // },
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
            : this.MAINNET_MINE_CONFIG

        this.initializeMineConfigByTeamId()

        this.MINE_GROUPS = this.isSwimmerTestNetwork() ?
            this.SWIMMER_TEST_MINE_GROUPS
            : this.MAINNET_MINE_GROUPS

    }

    LOOT_CAPTCHA_CONFIG: LootCaptchaConfig;

    private LOOT_CAPTCHA_CONFIG_MAINNET: LootCaptchaConfig = {
        players: [
            // {
            //     signerIndex: 1,
            //     address: '0xB2f4C513164cD12a1e121Dc4141920B805d024B8',
            //     teams: [ 3286, 3759, 5032 ],
            // },
            // {
            //     signerIndex: 2,
            //     address: '0xE90A22064F415896F1F72e041874Da419390CC6D',
            //     teams: [ /*5355,*/ 5357, /*6152*/ ],
            // },
            // {
            //     signerIndex: 3,
            //     address: '0xc7C966754DBE52a29DFD1CCcCBfD2ffBe06B23b2',
            //     teams: [ 7449, 8157, 9236 ],
            // },
            // {
            //     signerIndex: 4,
            //     address: '0x9568bD1eeAeCCF23f0a147478cEF87434aF0B5d4',
            //     teams: [ 16767, 16768, 16769 ],
            // },
            // {
            //     signerIndex: 5,
            //     address: '0x83Ff016a2e574b2c35d17Fe4302188b192b64344',
            //     teams: [ 16761, 16762, 16763 ],
            // },
            // {
            //     signerIndex: 6,
            //     address: '0x6315F93dEF48c21FFadD5CbE078Cdb19BAA661F8',
            //     teams: [ 16764, 16765, 16766 ],
            // },
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
        ],
        attackTransaction: {
            override: {
                gasLimit: 1000000,
                maxFeePerGas: BigNumber.from(ONE_GWEI*400),
                maxPriorityFeePerGas: BigNumber.from(ONE_GWEI)
            }
        },
        attackOnlyTeamsThatPlayToLoose: true
    }

    private initializeLootCaptchaConfig(){
        this.LOOT_CAPTCHA_CONFIG = this.isSwimmerTestNetwork() ?
            undefined
            : this.LOOT_CAPTCHA_CONFIG_MAINNET
    }
    

    constructor(hre: HardhatRuntimeEnvironment){
        this.hre = hre
        this.initializeMineConfig()
        this.initializeLootCaptchaConfig()
    }

    isSwimmerNetwork(): boolean{
        return /swimmer/.test(this.hre.network.name)
    }

    isSwimmerTestNetwork(): boolean{
        return this.hre.network.name == 'swimmertest'
    }

    getIdleGameApiBaseUrl(): string{
        if (this.isSwimmerTestNetwork()){
            return 'https://idle-game-subnet-test-api.crabada.com'
        }else{
            return 'https://idle-api.crabada.com'
        }

    }

    getCrabadaApiBaseUrl(): string{
        if (this.isSwimmerTestNetwork()){
            return 'https://subnet-test-api.crabada.com'
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
                IdleGame: '0x801B5Bb19e9052dB964b94ed5b4d6730D8FcCA25',
                tusToken: '0x00000000000000000000000000000000000000F2',
                craToken: '0xC1350BB5b4FDB0abcd83aFEc3ce68983cf4d11B9',
                crabada: '0x0382696A7C2df25680ABa02e3444E506Ef097b3F',
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
        if (this.isSwimmerNetwork())
            return ({gasPrice: 25*ONE_GWEI, gasLimit: GAS_LIMIT, nonce: undefined})
        else
            return ({maxFeePerGas: 150*ONE_GWEI, maxPriorityFeePerGas: ONE_GWEI, gasLimit: GAS_LIMIT, nonce: undefined})
    }
    
    getPriorityOverride(){
        if (this.isSwimmerNetwork()){
            return ({
                gasLimit: GAS_LIMIT,
                gasPrice: 25*ONE_GWEI,
            })
        }
    
        return ({
            gasLimit: GAS_LIMIT,
            // gasPrice: undefined,
            maxFeePerGas: BigNumber.from(ONE_GWEI*200),
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