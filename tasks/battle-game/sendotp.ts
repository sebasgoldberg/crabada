import { task, types } from "hardhat/config";

import { HardhatRuntimeEnvironment } from "hardhat/types";

import axios, { Method } from "axios";

interface IBGSendOTPResponse {
    "error_code": number,
    "message": string,
    "result": boolean
}

export const bgSendOTP = async (hre: HardhatRuntimeEnvironment, email: string) => {

    const options = {
      method: 'get' as Method,
      url: 'https://battle-system-api.crabada.com/crabada-user/public/sub-user/get-login-code',
      params: { email_address: 'thunder.cerebro@gmail.com' },
      headers: {
        host: 'battle-system-api.crabada.com',
        'user-agent': 'UnityPlayer/2020.3.31f1 (UnityWebRequest/1.0, libcurl/7.80.0-DEV)',
        accept: '*/*',
        'accept-encoding': 'deflate, gzip',
        'x-unity-version': '2020.3.31f1'
      }
    };
    
    try {
        const response = await axios.request(options)
        const data: IBGSendOTPResponse = response.data
        return data
    } catch (error) {
        error && error.data && console.error(error.data) 
        throw error
    }

}

task(
    "bgsendotp",
    "Sends OTP to e-mail.",
    async ({ email }: { email: string }, 
        hre: HardhatRuntimeEnvironment) => {

        const data: IBGSendOTPResponse = await bgSendOTP(hre, email)

    })
    .addOptionalParam('email', 'e-mail address where is going to be send the OTP.', 'thunder.cerebro@gmail.com', types.string)
