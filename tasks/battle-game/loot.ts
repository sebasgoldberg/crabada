import { task, types } from "hardhat/config";

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { currentServerTimeStamp } from "../../scripts/crabada";
import { collections, connectToDatabase, disconnectFromDatabase } from "../../scripts/srv/database";
import { IApiMine } from "../../scripts/strategy";

import axios, { Method } from "axios";
import { dbGetBgStatus, IBG_CrabadaInfo } from "./login";
import { ADVANTAGE_MATRIX, CrabadaClassName, FACTION_BY_CLASS_NAME, TeamFaction } from "../../scripts/teambp";
import { bgClaimAllLoots } from "./claim";

export interface IBG_MineReward {
    "type": number,
    "amount": number,
    "is_sure": boolean,
    "node_id": number,
    "percent": number,
    "user_id": number,
    "stackable": boolean,
    "description": string,
    "can_be_looted": boolean,
    "origin_item_id": number
}

export interface IBG_MineToLoot {
    "mine_id": number,
    "node_id": number,
    "miner_id": number,
    "start_time": number,
    "end_time": number,
    "crabada_id_1": number,
    "crabada_id_2": number,
    "crabada_id_3": number,
    "position_1": number,
    "position_2": number,
    "position_3": number,
    "attack_time": number,
    "looter_id": number,
    "loot_crabada_id_1": number,
    "loot_crabada_id_2": number,
    "loot_crabada_id_3": number,
    "winner_id": number,
    "status": number,
    "process": number,
    "is_looter_claim": boolean,
    "campaign_id": number,
    "rewards": IBG_MineReward[],
    "crabada_1_info": IBG_CrabadaInfo,
    "crabada_2_info": IBG_CrabadaInfo,
    "crabada_3_info": IBG_CrabadaInfo
}

export interface IBG_MineToLoot_Response {
    "error_code": null,
    "message": null,
    "result": IBG_MineToLoot[]
}

export const bgMinesToLoot = async (hre: HardhatRuntimeEnvironment): Promise<IBG_MineToLoot_Response> => {

    const { access_token } = await dbGetBgStatus()

    const options = {
        method: 'GET' as Method,
        url: 'https://battle-system-api.crabada.com/crabada-user/private/campaign/mine-zones/mine/all/open/looter',
        params: {node_id: '5', page: '1', limit: '50'},
        headers: {
            host: 'battle-system-api.crabada.com',
            'user-agent': 'UnityPlayer/2020.3.31f1 (UnityWebRequest/1.0, libcurl/7.80.0-DEV)',
            accept: '*/*',
            'accept-encoding': 'deflate, gzip',
            authorization: `Bearer ${access_token}`,
            'x-unity-version': '2020.3.31f1'
        }
    };
    
    try {
        const response = await axios.request(options)
        const data: IBG_MineToLoot_Response = response.data
        return data
    } catch (error) {
        error && error.data && console.error(error.data) 
        throw error
    }
    
}

export const bgActiveLooting = async (hre: HardhatRuntimeEnvironment): Promise<IBG_MineToLoot_Response> => {

    const { access_token } = await dbGetBgStatus()

    var options = {
      method: 'GET' as Method,
      url: 'https://battle-system-api.crabada.com/crabada-user/private/campaign/mine-zones/mine/active/looting',
      params: {node_id: '5'},
      headers: {
        host: 'battle-system-api.crabada.com',
        'user-agent': 'UnityPlayer/2020.3.31f1 (UnityWebRequest/1.0, libcurl/7.80.0-DEV)',
        accept: '*/*',
        'accept-encoding': 'deflate, gzip',
        authorization: `Bearer ${access_token}`,
        'x-unity-version': '2020.3.31f1'
      }
    };
    
    try {
        const response = await axios.request(options)
        const data: IBG_MineToLoot_Response = response.data
        return data
    } catch (error) {
        error && error.data && console.error(error.data) 
        throw error
    }
    
}

export interface IBG_CrabadaUserResponse {
    error_code: number,
    message: string,
    result: IBG_CrabadaInfo[]
}  

export const bgGetOwnCrabadas = async (hre: HardhatRuntimeEnvironment): Promise<IBG_CrabadaUserResponse> => {

    const { access_token } = await dbGetBgStatus()

    const options = {
        method: 'GET' as Method,
        url: 'https://battle-system-api.crabada.com/crabada-user/private/sync',
        headers: {
            host: 'battle-system-api.crabada.com',
            'user-agent': 'UnityPlayer/2020.3.31f1 (UnityWebRequest/1.0, libcurl/7.80.0-DEV)',
            accept: '*/*',
            'accept-encoding': 'deflate, gzip',
            authorization: `Bearer ${access_token}`,
            'x-unity-version': '2020.3.31f1'
        }
    };

    try {
        const response = await axios.request(options)
        const data: IBG_CrabadaUserResponse = response.data
        return data
    } catch (error) {
        error && error.data && console.error(error.data) 
        throw error
    }

}

interface LootStrategy {
    [position: number]: number
}

const addToLootStrategyWasPossible = (lootStrategy: LootStrategy, minerPosition: number, minerFaction: TeamFaction, looter: IBG_CrabadaInfo): boolean => {

    if (minerPosition in lootStrategy)
        return false

    const looterFaction: TeamFaction = FACTION_BY_CLASS_NAME[looter.class_name]
    
    if (ADVANTAGE_MATRIX[looterFaction].includes(minerFaction) /*|| !ADVANTAGE_MATRIX[minerFaction].includes(looterFaction)*/){
        lootStrategy[minerPosition] = looter.crabada_id
        return true
    }

    return false

}

class LootersNotFoundError extends Error{

}

const getLootersForTeamClasses = (hre: HardhatRuntimeEnvironment, looters: IBG_CrabadaInfo[], class1: CrabadaClassName, class2: CrabadaClassName, class3: CrabadaClassName): LootStrategy => {

    const minersFactions: TeamFaction[] = [FACTION_BY_CLASS_NAME[class1], FACTION_BY_CLASS_NAME[class2], FACTION_BY_CLASS_NAME[class3]]

    const lootStrategy: LootStrategy = {}

    for (const looter of looters){

        if (Object.keys(lootStrategy).length == 3){
            return lootStrategy
        }

        for (let i=0; i<minersFactions.length; i++){
            if (addToLootStrategyWasPossible(lootStrategy, i+1, minersFactions[i], looter))
                break
        }

    }

    console.log('lootStrategy', lootStrategy);
    

    throw new LootersNotFoundError('Was not possible to found crabadas to loot existing mines')

}

const bgLoot = async (hre: HardhatRuntimeEnvironment, mine: IBG_MineToLoot, lootStrategy: LootStrategy) => {

    const { access_token } = await dbGetBgStatus()

    var options = {
      method: 'POST' as Method,
      url: 'https://battle-system-api.crabada.com/crabada-user/private/campaign/mine-zones/mine/attack',
      headers: {
        host: 'battle-system-api.crabada.com',
        'user-agent': 'UnityPlayer/2020.3.31f1 (UnityWebRequest/1.0, libcurl/7.80.0-DEV)',
        accept: '*/*',
        'accept-encoding': 'deflate, gzip',
        'content-type': 'application/json',
        authorization: `Bearer ${access_token}`,
        // hash: '82CA3C6B6D3E176022D0E16B480A64C1',
        'x-unity-version': '2020.3.31f1'
      },
      data: {
        mine_id: mine.mine_id,
        crabada_id_1: lootStrategy[1],
        crabada_id_2: lootStrategy[2],
        crabada_id_3: lootStrategy[3],
        p1: mine.position_1,
        p2: mine.position_2,
        p3: mine.position_3
      }
    };
    
    try {
        const response = await axios.request(options)
        const data: IBG_CrabadaUserResponse = response.data
        return data
    } catch (error) {
        error && error.response && error.response.data && console.error(error.data) 
        throw error
    }

}

task(
    "bgloot",
    "Loot in the battle game.",
    async ({ }: { }, 
        hre: HardhatRuntimeEnvironment) => {

        await connectToDatabase()

        await bgClaimAllLoots(hre)

        const { result: looters } = await bgGetOwnCrabadas(hre)

        const { result: activeLooting }: IBG_MineToLoot_Response = await bgActiveLooting(hre)

        const bussyCrabadas = activeLooting
            .flatMap( mine => [ mine.loot_crabada_id_1, mine.crabada_id_2, mine.crabada_id_3 ] )

        const availableLooters = looters
            .filter( looter => !bussyCrabadas.includes(looter.crabada_id) )

        console.log('availableLooters', availableLooters.map(l=> [ l.crabada_id, l.class_name]));

        const { result: minesToLoot }: IBG_MineToLoot_Response = await bgMinesToLoot(hre)

        for (const mine of minesToLoot){

            try {

                console.log('mine', mine.mine_id,
                    mine.crabada_1_info.class_name as CrabadaClassName,
                    mine.crabada_2_info.class_name as CrabadaClassName,
                    mine.crabada_3_info.class_name as CrabadaClassName);

                const lootStrategy = getLootersForTeamClasses(
                    hre,
                    availableLooters,
                    mine.crabada_1_info.class_name as CrabadaClassName,
                    mine.crabada_2_info.class_name as CrabadaClassName,
                    mine.crabada_3_info.class_name as CrabadaClassName,
                )

                console.log('lootStrategy', lootStrategy);

                await bgLoot(hre, mine, lootStrategy)

                break

            } catch (error) {

                if (!/Was not possible to found crabadas to loot existing mines/.test(String(error)))
                    throw error

            }
        }

    })
