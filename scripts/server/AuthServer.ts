import axios from "axios"
import { ethers, Wallet } from "ethers"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { MAINNET_AVAX_MAIN_ACCOUNTS_PKS } from "../../hardhat.config"
import { DEBUG } from "../api"

export class AuthServer {

    authenticateInterval: NodeJS.Timer = undefined
    wallets: ethers.Wallet[]

    accessTokenByAddress: {
        [address: string]: string
    } = {}

    hre: HardhatRuntimeEnvironment

    constructor(hre: HardhatRuntimeEnvironment){

        this.hre = hre

        console.log('MAINNET_AVAX_MAIN_ACCOUNTS_PKS', MAINNET_AVAX_MAIN_ACCOUNTS_PKS.length);
        

        this.wallets = this.hre.crabada.network.LOOT_CAPTCHA_CONFIG.players
            .map(({signerIndex})=>signerIndex)
            .map( index => new Wallet(MAINNET_AVAX_MAIN_ACCOUNTS_PKS[index]))

    }

    async start(retryMs=20_000){
        if (this.authenticateInterval)
            return
        await this.authenticateIfNotAuthenticated()
        this.authenticateInterval = setInterval(async ()=>{
            this.authenticateIfNotAuthenticated()
        }, retryMs)
    }

    stop(){
        if (this.authenticateInterval == undefined)
            return
        clearInterval(this.authenticateInterval)
        this.authenticateInterval = undefined
    }

    getToken(address: string){
        return this.accessTokenByAddress[address.toLowerCase()]
    }

    async authenticateIfNotAuthenticated(){

        await Promise.all(

            this.wallets.map( async(w) => {

                const signedAddress = w.address.toLowerCase()
    
                if (this.getToken(signedAddress))
                    return
    
                const timestamp = String(+new Date())

                const message = `${signedAddress}_${timestamp}`
                const signedMessage = await w.signMessage(message)
                
                console.log('Message to sign', message);
                console.log('Signed message', signedMessage);
    
                const url = `${this.hre.crabada.network.getCrabadaApiBaseUrl()}/crabada-user/public/login-signature`
    
                const headers = {
                    'authority': 'api.crabada.com',
                    'pragma': 'no-cache',
                    'cache-control': 'no-cache',
                    'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="99", "Google Chrome";v="99"',
                    accept: 'application/json, text/plain, */*',
                    'content-type': 'application/json',
                    'sec-ch-ua-mobile': '?0',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.51 Safari/537.36',
                    'sec-ch-ua-platform': '"Windows"',
                    origin: this.hre.crabada.network.getOrigin(),
                    'sec-fetch-site': 'same-site',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-dest': 'empty',
                    'referer': this.hre.crabada.network.getReferer(),
                    'accept-language': 'pt-BR,pt;q=0.9,es;q=0.8,en;q=0.7,de;q=0.6,en-US;q=0.5,he;q=0.4',
                }
    
                try {

                    DEBUG && console.log('POST', url);
    
                    const response = await axios.post(url, {
                        address: signedAddress,
                        sign: signedMessage,
                        timestamp,
                    },{
                        headers
                    })
    
    
                    if (response.status == 200) {
    
                        const { result: { accessToken } } = response.data

                        this.accessTokenByAddress[signedAddress] = accessToken

                        console.log('Authentication succed for address', signedAddress, 'with access token', accessToken);
    
                    } else {
                        throw({
                            status: response.status,
                            data: response.data
                        })
                    }
    
    
                } catch (error) {
    
                    console.error('ERROR trying to authenticate address', w.address, String(error))
                    error.response && console.error(error.response.data);
    
                }
    
            })
        )



    }

}

