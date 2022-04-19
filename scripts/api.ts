import axios from "axios";
import { BigNumber } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { CrabadaNetwork } from "./hre";
import { ClassNameByCrabada, CrabadaClassName } from "./teambp";

export interface CrabadaInTabern{ 
    id: BigNumber,
    price: BigNumber,
    is_being_borrowed: boolean,
    battle_point: number,
    mine_point: number
}

interface CrabadaAPIInfo{ 
    hp: number, 
    damage: number, 
    armor: number,
    speed: number,
    critical: number,
}

export const _battlePoint = ({ hp, damage, armor }: CrabadaAPIInfo): number => {
    return hp+damage+armor
}

export const _minePoint = ({ speed, critical }: CrabadaAPIInfo): number => {
    return speed+critical
}

export interface CanLootGameFromApi{
    game_id: number,
    team_id: number,
    start_time: number,
    created_at: number,
}

export class CrabadaAPI{

    idleGameApiBaseUrl: string
    crabadaApiBaseUrl: string

    static instance: CrabadaAPI

    network: CrabadaNetwork

    constructor(network: CrabadaNetwork){

        this.network = network
        this.idleGameApiBaseUrl = network.getIdleGameApiBaseUrl()
        this.crabadaApiBaseUrl = network.getCrabadaApiBaseUrl()

    }

    async getCanLootGames(): Promise<CanLootGameFromApi[]>{

        const headers = {
            'authority': 'idle-api.crabada.com',
            'pragma': 'no-cache',
            'cache-control': 'no-cache',
            'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="99", "Google Chrome";v="99"',
            accept: 'application/json, text/plain, */*',
            // TODO authorization should use the bearer token for each player.
            authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7InVzZXJfYWRkcmVzcyI6IjB4ZTkwYTIyMDY0ZjQxNTg5NmYxZjcyZTA0MTg3NGRhNDE5MzkwY2M2ZCIsImVtYWlsX2FkZHJlc3MiOm51bGwsImZ1bGxfbmFtZSI6IkNyYWJhZGlhbiAyNGI2MGYzYTUwYSIsInVzZXJuYW1lIjpudWxsLCJmaXJzdF9uYW1lIjpudWxsLCJsYXN0X25hbWUiOm51bGx9LCJpYXQiOjE2NDcyNTQ3MDMsImV4cCI6MTY0OTg0NjcwMywiaXNzIjoiMjM5NTA5NTM4MWFhMjBhZWRkYjFlNWQ2MWQzOGNkZWUifQ.GFRl3lK53u45oG-lDx58paC6rtZFyPGgcQhCCDgi6sA',
            'sec-ch-ua-mobile': '?0',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.51 Safari/537.36',
            'sec-ch-ua-platform': '"Windows"',
            origin: this.network.getOrigin(),
            'sec-fetch-site': 'same-site',
            'sec-fetch-mode': 'cors',
            'sec-fetch-dest': 'empty',
            'referer': this.network.getReferer(),
            'accept-language': 'pt-BR,pt;q=0.9,es;q=0.8,en;q=0.7,de;q=0.6,en-US;q=0.5,he;q=0.4',
        }

        const { 
            result: {
                data
            }
        } = (await axios.get(
                // TODO address should be for each player.
                `${this.idleGameApiBaseUrl}/public/idle/mines?page=1&status=open&looter_address=0xe90a22064f415896f1f72e041874da419390cc6d&can_loot=1&limit=10`,
                {
                    headers
                })
            ).data

        return (data as CanLootGameFromApi[])
   }

    // TODO Read chain data using Crabada contract: const { dna } = await crabada.crabadaInfo(4887)
    async getCrabadaInfo(crabadaId: BigNumber): Promise<CrabadaAPIInfo>{

        console.log(`${this.crabadaApiBaseUrl}/public/crabada/info/${ crabadaId.toString() }`);
        
        const response: { 
            result: CrabadaAPIInfo 
        } = (await axios.get(`${this.crabadaApiBaseUrl}/public/crabada/info/${ crabadaId.toString() }`))
            .data

        return response.result

    }

    async getCrabadasInTabernOrderByPrice(): Promise<CrabadaInTabern[]>{

        interface ResponseObject { 
            id: string,
            price: string,
            is_being_borrowed: number,
            battle_point: number,
            mine_point: number
        }

        interface Response {
            result: {
                totalRecord: number
                data: ResponseObject[] 
            } 
        }

        console.log(`${this.idleGameApiBaseUrl}/public/idle/crabadas/lending?limit=1&page=1`);
        const quanResponse: Response = (await axios.get(`${this.idleGameApiBaseUrl}/public/idle/crabadas/lending?limit=1&page=1`))
            .data

        console.log('Lending totalRecord', quanResponse.result.totalRecord);

        const responses: { 
            result: { 
                data: ResponseObject[] 
            } 
        }[] = (await Promise.all(
            Array.from(Array(Math.round((quanResponse.result.totalRecord/50)+0.5)).keys())
            .map( value => value+1 )
            .map( async (page: number) => {
                try {
                    const url = `${this.idleGameApiBaseUrl}/public/idle/crabadas/lending?orderBy=price&order=asc&limit=50&page=${page}`
                    console.log(url);
                    
                    return (await axios.get(url)).data
                } catch (error) {
                    error(`ERROR getting page for lending API`, String(error))
                    return undefined
                }
            })
        )).filter(x=>x)

        return responses.map( response => {
            return response.result.data.map( o => {
                try {
                    return {
                        id: BigNumber.from(o.id),
                        price: BigNumber.from(String(o.price)),
                        is_being_borrowed: o.is_being_borrowed ? true : false,
                        battle_point: o.battle_point,
                        mine_point: o.mine_point
                    }
                } catch (error) {
                    return undefined
                }
            }).filter(x=>x)
        }).flat()

    }

    async getClassNameByCrabada(): Promise<ClassNameByCrabada>{

        interface ResponseObject { 
            id: string,
            class_name: string,
        }

        interface Response {
            result: {
                totalRecord: number
                data: ResponseObject[] 
            } 
        }

        console.log(`${this.crabadaApiBaseUrl}/public/crabada/all?limit=1&page=1`);
        const quanResponse: Response = (await axios.get(`${this.crabadaApiBaseUrl}/public/crabada/all?limit=1&page=1`))
            .data

        const responses: Response[] = (await Promise.all(
            Array.from(Array(Math.round((quanResponse.result.totalRecord/1000)+0.5)).keys())
            .map( value => value+1 )
            .map( async (page: number) => {
                try {
                    const url = `${this.crabadaApiBaseUrl}/public/crabada/all?limit=1000&page=${page}`
                    console.log(url);                    
                    return (await axios.get(url)).data
                } catch (error) {
                    error(`ERROR getting page for lending API`, String(error))
                    return undefined
                }
            })
        )).filter(x=>x)

        const result: ClassNameByCrabada = {}

        for (const response of responses){
            for (const crabada of response.result.data){

                if (!crabada.class_name)
                    continue
    
                result[crabada.id] = (crabada.class_name as CrabadaClassName)
    
            }    
        }

        return result
    
    }

    async crabadaIdToBattlePointPromise(crabadaId: BigNumber): Promise<number>{
        if (crabadaId.isZero())
            return 0
        const crabadaInfo = await this.getCrabadaInfo(crabadaId)
        return _battlePoint(crabadaInfo)
    }
    
    async crabadaIdToMinePointPromise(crabadaId: BigNumber): Promise<number>{
        if (crabadaId.isZero())
            return 0
        const crabadaInfo = await this.getCrabadaInfo(crabadaId)
        return _minePoint(crabadaInfo)
    }
    
}


type CanLootGamesFromApiTask = (canLootGamesFromApi: CanLootGameFromApi[]) => void

export const listenCanLootGamesFromApi = async (hre: HardhatRuntimeEnvironment, task: CanLootGamesFromApiTask, interval: number = 500): Promise<NodeJS.Timer> => {

    const gameAlreadyProcessed: {
        [game_id: number]: boolean
    } = {}

    let processing: boolean = false

    return setInterval(async () => {

        if (processing)
            return
        
        processing = true

        try {

            const canLootGamesFromApi: CanLootGameFromApi[] = await hre.crabada.api.getCanLootGames()

            const newCanLootGamesFromApi = canLootGamesFromApi.filter(({game_id})=>{
                const result = !gameAlreadyProcessed[game_id]
                gameAlreadyProcessed[game_id] = true
                return result
            })

            task(newCanLootGamesFromApi)

            setTimeout(()=>{
                newCanLootGamesFromApi.forEach( ({game_id}) =>{ 
                    delete gameAlreadyProcessed[game_id]
                })
            },60_000)
                
        } catch (error) {
            console.error('ERROR retrieving canLootGames', String(error));
        }

        processing = false

    }, interval)

}