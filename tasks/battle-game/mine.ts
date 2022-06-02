import { task } from "hardhat/config";

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { connectToDatabase, disconnectFromDatabase } from "../../scripts/srv/database";

import axios, { Method } from "axios";
import { dbGetBgStatus } from "./login";
import { IBG_MineToLoot_Response } from "./loot";

export const bgMine = async (
    hre: HardhatRuntimeEnvironment, mineStrategy: IBG_MineStrategy,
    hash: string): Promise<IBG_MineToLoot_Response> => {

    const { access_token } = await dbGetBgStatus()

    var options = {
        method: 'POST' as Method,
        url: 'https://battle-system-api.crabada.com/crabada-user/private/campaign/mine-zones/mine/create',
        headers: {
            host: 'battle-system-api.crabada.com',
            'user-agent': 'UnityPlayer/2020.3.31f1 (UnityWebRequest/1.0, libcurl/7.80.0-DEV)',
            accept: '*/*',
            'accept-encoding': 'deflate, gzip',
            'content-type': 'application/json',
            authorization: `Bearer ${access_token}`,
            hash,
            'x-unity-version': '2020.3.31f1'
        },
        data: {
            node_id: 5,
            ...mineStrategy
        },
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

type CrabadaPosition = '11' | '12' | '13' | '21' | '22' | '23'

interface IBG_MineStrategy{
    crabada_id_1: number,
    crabada_id_2: number,
    crabada_id_3: number,
    p1: CrabadaPosition,
    p2: CrabadaPosition,
    p3: CrabadaPosition

}

interface IBG_MineStaticStrategy {
    mineStrategy: IBG_MineStrategy,
    hash: string
}

const MINE_STATIC_STRATEGY: IBG_MineStaticStrategy[] = [
    {
        mineStrategy: {
            crabada_id_1: 29167,
            crabada_id_2: 29186,
            crabada_id_3: 66038,
            p1: "12",
            p2: "22",
            p3: "23",
        },
        hash: 'C8BE357B4490F6FC4010C9C1D124D0DE'
    },
    {
        mineStrategy: {
            "crabada_id_1": 13977,
            "crabada_id_2": 19064,
            "crabada_id_3": 54863,
            p1: "12",
            p2: "22",
            p3: "23"    
        },
        hash: '87E04854760F677D35124E15DB625E89'
    },
]

task(
    "bgmine",
    "Start to mine in the battle game.",
    async ({ }: { }, 
        hre: HardhatRuntimeEnvironment) => {

        await connectToDatabase()

        for (const {mineStrategy, hash} of MINE_STATIC_STRATEGY){
            try {
                console.log('Mining with', mineStrategy);
                const mineResult = await bgMine(hre, mineStrategy, hash)
                console.log('SUCCESS');
            } catch (error) {
                console.error('ERROR', String(error));
            }
        }

    })
