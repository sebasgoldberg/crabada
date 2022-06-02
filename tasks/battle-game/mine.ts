import { task } from "hardhat/config";

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { connectToDatabase } from "../../scripts/srv/database";

import axios, { Method } from "axios";
import { dbGetBgStatus } from "./login";
import { IBG_MineToLoot_Response } from "./loot";

export const bgMine = async (hre: HardhatRuntimeEnvironment): Promise<IBG_MineToLoot_Response> => {

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
        hash: '66F367D5EE58A5183F03A19D1D21270D',
        'x-unity-version': '2020.3.31f1'
      },
      data: {
        node_id: 5,
        crabada_id_1: /*13977,*/54863,
        crabada_id_2: /*29186,*/19064,
        crabada_id_3: /*66038,*/29167,
        p1: '12',
        p2: '22',
        p3: '23'
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

task(
    "bgmine",
    "Start to mine in the battle game.",
    async ({ }: { }, 
        hre: HardhatRuntimeEnvironment) => {

        await connectToDatabase()

        await bgMine(hre)

    })
