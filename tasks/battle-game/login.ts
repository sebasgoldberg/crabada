import { task, types } from "hardhat/config";

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { currentServerTimeStamp } from "../../scripts/crabada";
import { collections, connectToDatabase, disconnectFromDatabase } from "../../scripts/srv/database";
import { IApiMine } from "../../scripts/strategy";

interface IBG_DB_Status {
    access_token?: string
}

export const dbGetBgStatus = async(): Promise<IBG_DB_Status> => {
    if (!collections.bgStatus)
        return undefined
    const result = await collections.bgStatus.findOne()
    return result as unknown as IBG_DB_Status
}

export const dbUpdateBgStatus = async (data: IBG_DB_Status) => {
    const query = { };
    const update = { $set: data};
    const options = { upsert: true };
    await collections.bgStatus.updateOne(query, update, options);
}

import axios, { Method } from "axios";
import { CrabadaClassName } from "../../scripts/teambp";

export interface IBG_CrabadaInfo {
    "crabada_id": number,
    "id": number,
    "name": string,
    "crabada_class": number,
    "class_id": number,
    "class_name": CrabadaClassName,
    "level": number,
    "real_level": number,
    "experience": number,
    "hp": number,
    "speed": number,
    "damage": number,
    "critical": number,
    "armor": number,
    "shell_id": number,
    "horn_id": number,
    "body_id": number,
    "mouth_id": number,
    "eyes_id": number,
    "pincers_id": number,
    "pincers_skill": string,
    "pincers_skill_name": string,
    "pincers_skill_description": string,
    "pincers_skill_percent": number,
    "pincers_skill_turn": number,
    "parts": number[],
    "eat_time": number,
    "power_level": number,
    "user_id": number,
    "pincers_percent": number,
    "pincers_turn": number,
    "eyes_effect": string,
    "eyes_effect_name": string,
    "eyes_effect_percent": number,
    "eyes_effect_turn": number,
    "eyes_effect_chance": number,
    "eyes_effect_description": string,
    "max_hp": number,
    "max_damage": number,
    "max_armor": number,
    "max_speed": number,
    "max_critical": number,
    "max_power_level": number,
    "combat_power": number,
    "energy": {
      "energy": number,
      "reset_time": number
    }
}

interface IBGLoginResponse {
    "error_code": null,
    "message": null,
    "result": {
      "user_id": number,
      "owner": string,
      "level": number,
      "experience": number,
      "user_address": string,
      "owner_reward_percent": number,
      "email_address": string,
      "username": string,
      "first_name": string,
      "last_name": string,
      "full_name": string,
      "is_master_account": boolean,
      "is_disabled": boolean,
      "is_game_notify": boolean,
      "is_deleted": boolean,
      "is_battle_notify": boolean,
      "crabada_slots": number,
      "photo": string,
      "next_experience": number,
      "crabadas": Array<IBG_CrabadaInfo>,
      "achievements":
        Array<{
          "user_id": number,
          "achievement_id": number,
          "code": string,
          "type": number,
          "description": string,
          "step": number,
          "finish_step": number,
          "is_claim": boolean,
          "rewards": 
            Array<{
              "achievement_id": number,
              "origin_item_id": number,
              "amount": number,
              "name": string,
              "description": string,
              "type": number,
              "stackable": boolean
            }>
        }>,
      "access_token": string,
      "refresh_token": string
    }
  }

export const bgLogin = async (hre: HardhatRuntimeEnvironment, otp: string): Promise<IBGLoginResponse> => {

    var options = {
      method: 'POST' as Method,
      url: 'https://battle-system-api.crabada.com/crabada-user/public/sub-user/login',
      headers: {
        host: 'battle-system-api.crabada.com',
        'user-agent': 'UnityPlayer/2020.3.31f1 (UnityWebRequest/1.0, libcurl/7.80.0-DEV)',
        accept: '*/*',
        'accept-encoding': 'deflate, gzip',
        'content-type': 'application/json',
        // hash: 'A87B176A265B75257671C7735496E7EC',
        'x-unity-version': '2020.3.31f1'
      },
      data: {email_address: 'thunder.cerebro@gmail.com', code: otp}
    };
    
    try {
        const response = await axios.request(options)
        const data: IBGLoginResponse = response.data
        return data
    } catch (error) {
        error && error.data && console.error(error.data) 
        throw error
    }
    
}

task(
    "bglogin",
    "Login to battle game using OTP.",
    async ({ otp }: { otp: string }, 
        hre: HardhatRuntimeEnvironment) => {

        await connectToDatabase()

        const data: IBGLoginResponse = await bgLogin(hre, otp)

        console.log('data.result.access_token', data.result.access_token);

        await dbUpdateBgStatus({ access_token: data.result.access_token })

        const { access_token }: IBG_DB_Status = await dbGetBgStatus()

        console.log('access_token', access_token);

    })
    .addParam('otp', 'OTP', undefined, types.string)
