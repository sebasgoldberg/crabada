import { task, types } from "hardhat/config";

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { currentServerTimeStamp } from "../../scripts/crabada";
import { collections, connectToDatabase, disconnectFromDatabase } from "../../scripts/srv/database";
import { IApiMine } from "../../scripts/strategy";

import axios, { Method } from "axios";
import { dbGetBgStatus, IBG_CrabadaInfo } from "./login";
import { CrabadaClassName } from "../../scripts/teambp";
import { IBG_MineReward, IBG_MineToLoot_Response } from "./loot";

export const bgActiveLooting = async (hre: HardhatRuntimeEnvironment): Promise<IBG_MineToLoot_Response> => {

    const { access_token } = await dbGetBgStatus()

    var options = {
      method: 'GET' as Method,
      url: 'https://battle-system-api.crabada.com/crabada-user/private/campaign/mine-zones/mine/active/looting',
      params: {node_id: '5'}, // TODO Check node_id to be used
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

interface IBG_UserInfo {
    user_id: number,
    owner: string,
    level: number,
    experience: number,
    user_address: string,
    owner_reward_percent: number,
    email_address: string,
    username: string,
    first_name: string,
    last_name: string,
    full_name: string,
    is_master_account: boolean,
    is_disabled: boolean,
    is_game_notify: boolean,
    is_deleted: boolean,
    is_battle_notify: boolean,
    crabada_slots: number,
    photo: string,
    base_experience: number,
    pre_experience: number,
    next_experience: number
}

interface IBG_ClaimResponse {
    error_code: number,
    message: string,
    result: {
        rewards: IBG_MineReward[],
        level_up: boolean,
        user_info: IBG_UserInfo
    }
}


export const bgClaimLoot = async (hre: HardhatRuntimeEnvironment, mine_id: number): Promise<IBG_ClaimResponse> => {

    const { access_token } = await dbGetBgStatus()

    var options = {
      method: 'POST' as Method,
      url: 'https://battle-system-api.crabada.com/crabada-user/private/campaign/mine-zones/mine/looter-claim',
      headers: {
        host: 'battle-system-api.crabada.com',
        'user-agent': 'UnityPlayer/2020.3.31f1 (UnityWebRequest/1.0, libcurl/7.80.0-DEV)',
        accept: '*/*',
        'accept-encoding': 'deflate, gzip',
        'content-type': 'application/json',
        authorization: `Bearer ${access_token}`,
        hash: '12365DE29235398E3C74BC10BDCE9811',
        'x-unity-version': '2020.3.31f1'
      },
      data: { mine_id }
    };
    
    try {
        const response = await axios.request(options)
        const data: IBG_ClaimResponse = response.data
        return data
    } catch (error) {
        error && error.data && console.error(error.data) 
        throw error
    }

}

export const bgClaimAllLoots = async (hre: HardhatRuntimeEnvironment): Promise<void> => {

    const { result: activeLooting }: IBG_MineToLoot_Response = await bgActiveLooting(hre)

    for (const activeLoot of activeLooting){

        if (currentServerTimeStamp()-activeLoot.attack_time > 1_800)
            await bgClaimLoot(hre, activeLoot.mine_id)

    }

}

export const bgClaimMine = async (hre: HardhatRuntimeEnvironment, mine_id: number): Promise<IBG_ClaimResponse> => {

    const { access_token } = await dbGetBgStatus()

    const options = {
      method: 'POST' as Method,
      url: 'https://battle-system-api.crabada.com/crabada-user/private/campaign/mine-zones/mine/claim',
      headers: {
        host: 'battle-system-api.crabada.com',
        'user-agent': 'UnityPlayer/2020.3.31f1 (UnityWebRequest/1.0, libcurl/7.80.0-DEV)',
        accept: '*/*',
        'accept-encoding': 'deflate, gzip',
        'content-type': 'application/json',
        authorization: `Bearer ${access_token}`,
        hash: '0E9CE39ECF081F0F5B6DB3E557F03D3C',
        'x-unity-version': '2020.3.31f1'
      },
      data: { mine_id }
    };
    
    try {
        const response = await axios.request(options)
        const data: IBG_ClaimResponse = response.data
        return data
    } catch (error) {
        error && error.data && console.error(error.data) 
        throw error
    }

}

export const bgActiveMines = async (hre: HardhatRuntimeEnvironment): Promise<IBG_MineToLoot_Response> => {

    const { access_token } = await dbGetBgStatus()

    const options = {
      method: 'GET' as Method,
      url: 'https://battle-system-api.crabada.com/crabada-user/private/campaign/mine-zones/mine/open/miner',
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

export const bgClaimAllMines = async (hre: HardhatRuntimeEnvironment): Promise<void> => {

    const { result: activeMines }: IBG_MineToLoot_Response = await bgActiveMines(hre)

    for (const activeMine of activeMines){

        if (currentServerTimeStamp()-activeMine.start_time > 3_600)
            await bgClaimMine(hre, activeMine.mine_id)

    }

}

task(
    "bgclaim",
    "Claim all rewards from active looting in the battle game.",
    async ({ }: { }, 
        hre: HardhatRuntimeEnvironment) => {

        await connectToDatabase()

        await bgClaimAllLoots(hre)

        await bgClaimAllMines(hre)

    })
