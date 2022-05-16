import axios, { AxiosResponse } from "axios";
import { BigNumber } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { CrabadaNetwork } from "./hre";
import { IApiMine } from "./strategy";
import { ClassNameByCrabada, CrabadaClassName, TeamFaction } from "./teambp";

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
    faction: TeamFaction,
    attack_team_id: number,
    defense_point: number,
    defense_mine_point: number
}

export const DEBUG = false

interface ITeamsFromAddress{
    game_end_time: number,
    team_id: number,
    game_id: number,
    game_type: string,
    game_start_time: number,
    crabada_id_1: number,
    crabada_id_2: number,
    crabada_id_3: number,
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

    async getMines(page: number, limit: number): Promise<IApiMine[]>{
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

        DEBUG && console.log('GET', `${this.idleGameApiBaseUrl}/public/idle/mines?page=${page}&limit=${limit}`);
        
        const { 
            result: {
                data
            }
        } = (await axios.get(
                `${this.idleGameApiBaseUrl}/public/idle/mines?page=${page}&limit=${limit}`,
                {
                    headers
                })
            ).data

        return data
    }

    async getCompletedTeams(address: string): Promise<ITeamsFromAddress[]>{
        return ((await this.getTeams(address))
            .filter( team => team.crabada_id_1 && team.crabada_id_2 && team.crabada_id_3 ))
    }

    async getTeams(address: string): Promise<ITeamsFromAddress[]>{
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

        DEBUG && console.log('GET', `${this.idleGameApiBaseUrl}/public/idle/teams?user_address=${address}&page=1&limit=10`);
        
        const { 
            result: {
                data
            }
        } = (await axios.get(
                // TODO address should be for each player.
                `${this.idleGameApiBaseUrl}/public/idle/teams?user_address=${address}&page=1&limit=10`,
                {
                    headers
                })
            ).data

        return data
    }

    async getCanLootGamesPageQuantity(minesPerPage: number): Promise<number>{

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

        DEBUG && console.log('GET', `${this.idleGameApiBaseUrl}/public/idle/mines?page=1&status=open&looter_address=0xe90a22064f415896f1f72e041874da419390cc6d&can_loot=1&limit=10`);
        
        const { 
            result: {
                totalPages
            }
        } = (await axios.get(
                // TODO address should be for each player.
                `${this.idleGameApiBaseUrl}/public/idle/mines?page=1&status=open&looter_address=0xe90a22064f415896f1f72e041874da419390cc6d&can_loot=1&limit=${minesPerPage}`,
                {
                    headers
                })
            ).data

        return totalPages
    }

    async getCanLootGames(actualPage: number, minesPerPage: number): Promise<CanLootGameFromApi[]>{

        const timestamp = Math.floor(+new Date()/1000)

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

        DEBUG && console.log('GET', `${this.idleGameApiBaseUrl}/public/idle/mines?page=1&status=open&looter_address=0xe90a22064f415896f1f72e041874da419390cc6d&can_loot=1&limit=10`);
        
        const { 
            result: {
                data
            }
        } = (await axios.get(
                // TODO address should be for each player.
                `${this.idleGameApiBaseUrl}/public/idle/mines?page=${actualPage}&status=open&looter_address=0xe90a22064f415896f1f72e041874da419390cc6d&can_loot=1&limit=${minesPerPage}`,
                {
                    headers
                })
            ).data

        return (data as CanLootGameFromApi[])
            .filter( mine => {
                
                const maxAttackWindow = mine.defense_mine_point > 230 ? 3600 : 3600+1800

                return (timestamp - mine.start_time) < (maxAttackWindow-120)
              })
    }

    async get(url): Promise<AxiosResponse<any,any>>{
        return (await new Promise( (resolve, reject) => {
            setTimeout( async () => {
                try {
                    DEBUG && console.log('GET', url)

                    resolve(await axios.get(url,{
                        headers: {
                            //'authority': 'idle-api.crabada.com',
                            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
                            'accept-language': 'pt-BR,pt;q=0.9',
                            'cache-control': 'max-age=0',
                            'if-none-match': 'W/"264-PXMzCSA7MKo+yTlSX8kNTqm8m4Y"',
                            'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="100", "Google Chrome";v="100"',
                            'sec-ch-ua-mobile': '?0',
                            'sec-ch-ua-platform': '"Windows"',
                            'sec-fetch-dest': 'document',
                            'sec-fetch-mode': 'navigate',
                            'sec-fetch-site': 'none',
                            'sec-fetch-user': '?1',
                            'upgrade-insecure-requests': '1',
                            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.88 Safari/537.36', 
                        }
                    }))
                } catch (error) {
                    reject(error)
                }
            }, 10)
        }))
    }

    // TODO Read chain data using Crabada contract: const { dna } = await crabada.crabadaInfo(4887)
    async getCrabadaInfo(crabadaId: BigNumber): Promise<CrabadaAPIInfo>{

        const response: { 
            result: CrabadaAPIInfo 
        } = (await this.get(`${this.crabadaApiBaseUrl}/public/crabada/info/${ crabadaId.toString() }`))
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

        const quanResponse: Response = (await this.get(`${this.idleGameApiBaseUrl}/public/idle/crabadas/lending?limit=1&page=1`))
            .data

        console.log('Lending totalRecord', quanResponse.result.totalRecord);

        const pages = Array.from(Array(Math.round((quanResponse.result.totalRecord/50)+0.5)).keys())
            .map( value => value+1 )

        let responses: { 
            result: { 
                data: ResponseObject[] 
            } 
        }[] = []
    
        // for (const page of pages)
        // {
        //     try {
        //         const url = `${this.idleGameApiBaseUrl}/public/idle/crabadas/lending?orderBy=price&order=asc&limit=50&page=${page}`
        //         const response = (await this.get(url)).data
        //         responses.push(response)
        //     } catch (error) {
        //         console.error(`ERROR getting page for lending API`, String(error))
        //     }
        // }   

        const apiCallsPromises = pages.map(async(page)=>{
            return new Promise((resolve) => {
                setTimeout(async()=>{
                    try {
                        const url = `${this.idleGameApiBaseUrl}/public/idle/crabadas/lending?orderBy=price&order=asc&limit=50&page=${page}`
                        const response = (await this.get(url)).data
                        responses.push(response)
                    } catch (error) {
                        console.error(`ERROR getting page for lending API`, String(error))
                    }
                    resolve(undefined)
                }, 200*page)    
            })
        })

        await Promise.all(apiCallsPromises)

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

        const quanResponse: Response = (await this.get(`${this.crabadaApiBaseUrl}/public/crabada/all?limit=1&page=1`))
            .data


        const pages = Array.from(Array(Math.round((quanResponse.result.totalRecord/1000)+0.5)).keys())
            .map( value => value+1 )

        let responses: { 
            result: { 
                data: ResponseObject[] 
            } 
        }[] = []
    

        const apiCallsPromises = pages.map(async(page)=>{
            return new Promise((resolve) => {
                setTimeout(async()=>{
                    try {
                        const url = `${this.crabadaApiBaseUrl}/public/crabada/all?limit=1000&page=${page}`
                        const response = (await this.get(url)).data
                        responses.push(response)
                    } catch (error) {
                        console.error(`ERROR getting page for lending API`, String(error))
                    }
                    resolve(undefined)
                }, 200*page)    
            })
        })

        await Promise.all(apiCallsPromises)

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

export type HasToReadNextPageFunction = () => boolean

const READ_ONLY_FIRST_PAGE = true

export const listenCanLootGamesFromApi = async (
    hre: HardhatRuntimeEnvironment, 
    task: CanLootGamesFromApiTask, 
    hasToReadNextPage: HasToReadNextPageFunction,
    interval: number = 2000): Promise<NodeJS.Timer> => {

    // const gameAlreadyProcessed: {
    //     [game_id: number]: boolean
    // } = {}

    let processing: boolean = false

    let actualPage = 0
    const minesPerPage = 50

    return setInterval(async () => {

        if (!hasToReadNextPage())
            return

        if (processing)
            return
        
        processing = true

        try {

            actualPage = READ_ONLY_FIRST_PAGE ? 1 : actualPage+1

            const canLootGamesFromApi: CanLootGameFromApi[] = await hre.crabada.api.getCanLootGames(actualPage, minesPerPage)

            if (canLootGamesFromApi.length == 0){

                actualPage = 0

            } else {

                const newCanLootGamesFromApi = canLootGamesFromApi
                // .filter(({game_id})=>{
                //     const result = !gameAlreadyProcessed[game_id]
                //     gameAlreadyProcessed[game_id] = true
                //     return result
                // })

                task(newCanLootGamesFromApi)

                // setTimeout(()=>{
                //     newCanLootGamesFromApi.forEach( ({game_id}) =>{ 
                //         delete gameAlreadyProcessed[game_id]
                //     })
                // },15_000)

            }
                
        } catch (error) {
            console.error('ERROR retrieving canLootGames', String(error));
            actualPage=0
        }

        processing = false

    }, interval)

}