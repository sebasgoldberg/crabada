import axios from "axios"
import * as express from "express"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { PlayerTeamPair, Target } from "../../tasks/captcha"
import { dbGetStatus } from "../../tasks/savemines"
import { DEBUG } from "../api"
import { currentBlockTimeStamp, getCrabadaContracts } from "../crabada"
import { collections } from "../srv/database"
import { getTeamsThatPlayToLooseByTeamIdUsingDb, ITeamsThatPlayToLooseByTeamId } from "../strategy"
import { AttackExecutor } from "./AttackExecutor"
import { AuthServer } from "./AuthServer"
import { PlayersManager } from "./PlayersManager"

interface PendingResponse {
    resolveResponse: (value: unknown) => void,
    res: typeof express.response,
    requester: string
}

type PendingAttackLooterTeams = string[]

interface PendingAttacks{
    [gameId: string]: PendingAttackLooterTeams
}

interface PendingTransaction {
    user_address: string,
    team_id: string,
    game_id: string,
    requester: string,
    status: {
        resolveStatusResponse?: (value: unknown) => void,
        res?: typeof express.response,    
        successfulAttackRegistration?: boolean|undefined
    }
}

interface PendingTransactionByChallenge {
    [challenge: string]: PendingTransaction
}

interface CaptchaVerifyResult {
    status: string,
    data: {
        lot_number: string,
        result: string,
        fail_count: number,
        seccode: {
            captcha_id: string,
            lot_number: string,
            pass_token: string,
            gen_time: string,
            captcha_output: string
        },
    }
}

export class AttackServer {

    app = express();
    pendingResponses: PendingResponse[] = []
    pendingAttacks: PendingAttacks = {}
    attackExecutor: AttackExecutor

    authServer: AuthServer

    hre: HardhatRuntimeEnvironment

    async teamsSecondsToUnlock(): Promise<number[]>{
        const timestamp = await currentBlockTimeStamp(this.hre)

        const secondsToUnlock: number[] = []

        for (const {address} of this.hre.crabada.network.LOOT_CAPTCHA_CONFIG.players){
            const teams = await this.hre.crabada.api.getCompletedTeams(address)
            for (const team of teams){
                const game_end_time = team.game_type == "stealing" ? team.game_start_time+3600 : team.game_end_time
                secondsToUnlock.push(game_end_time-timestamp)
            }
        }

        return secondsToUnlock
    }

    hasPendingCaptchaResponses(){
        return this.pendingResponses.length > 0
    }

    hasToContinueReadingNextMineToLoot(): boolean{

        const playerTeamPairsSettled = this.playersManager.getSettledPlayers()

        if (playerTeamPairsSettled.length == 0)
            return false

        if (playerTeamPairsSettled
            .filter( ({ teamId }) => !this.attackExecutor.isTeamBusy(teamId) )
            .length == 0)
            return false

        const playerTeamPairsThatAddressRecentlyAttacked = playerTeamPairsSettled
            .filter( p => this.attackExecutor.hasAddressRecentlyAttacked(p.playerAddress))

        const hasAllTeamsAdressesRecentlyAttacked = playerTeamPairsSettled.length == playerTeamPairsThatAddressRecentlyAttacked.length

        return this.hasPendingCaptchaResponses() && !hasAllTeamsAdressesRecentlyAttacked

    }

    async needsToContinueRunning(): Promise<boolean>{

        return (await this.teamsSecondsToUnlock()).some(x => x < 900)

    }

    async waitUntilNeedsToContinueRunning(log: typeof console.log = console.log): Promise<void>{
        return new Promise((resolve) => {

            const waitUntilNeedsToContinueRunningInterval = setInterval(async () => {

                if (await this.needsToContinueRunning()){
                    clearInterval(waitUntilNeedsToContinueRunningInterval)
                    resolve(undefined)
                } else {
                    log('Waiting until needs to continue running')
                }

            }, 30_000)

        })
    }

    async getBalance(requester: string): Promise<number>{

        try {

            const user = requester.replace(/[0-9]/g, '')
        
            const userInfo = await collections.captchaUsers.findOne({ user })
    
            if (!userInfo)
                return 0
    
            return userInfo.balance
                
        } catch (error) {

            return 0
            
        }

    }

    async increaseUserBalance(requester: string): Promise<void>{

        try {

            const user = requester.replace(/[0-9]/g, '')

            const { captcha: { pricePerWinAttack } } = await dbGetStatus()

            // TODO refactor defining interface
            await collections.captchaUsers.updateOne({ user }, { $set: { user }, $inc: { balance: pricePerWinAttack } }, { upsert: true })

        } catch (error) {

            console.error(`Error when trying to increase balance for user ${requester}`);

        }
    }

    // constructor(playerTeamPairs: PlayerTeamPair[], testmode: boolean){
    constructor(hre: HardhatRuntimeEnvironment, 
        testmode: boolean, 
        public playersManager = new PlayersManager(hre, testmode)){

        this.hre = hre

        this.authServer = new AuthServer(hre)

        const { idleGame } = getCrabadaContracts(hre)

        this.app.use(express.json());

        this.app.use(express.static(`${ __dirname }/../../frontend`));

        this.app.get('/status/', async (req, res) => {

            const requester: string = req.query.requester as string

            const pendingCaptchas = this.pendingResponses.filter(pr => pr.requester == requester).length > 0

            const balance = await this.getBalance(requester)

            const secondsToUnlock: number[] = await this.teamsSecondsToUnlock()

            res.json({
                pendingCaptchas,
                unlocked: secondsToUnlock.filter( x => x < 0 ).length,
                secondsToUnlock: secondsToUnlock.sort((a,b)=> a<b?-1:a>b?1:0),
                balance,
            })

        })

        this.app.post('/captcha/load/', async (req, res) => {

            console.log('/captcha/load/')
            console.log(req.body);

            // if (!existsAnyTeamSettled(playerTeamPairs, testmode)){
            //     res.status(401)
            //     res.json({
            //         message: "ALL TEAMS ARE BUSY."
            //     })
            // }

            const { requester }: { requester: string } = req.body
            let indexToDelete: number = undefined

            await new Promise(resolve => {

                this.pendingResponses.forEach( (value, index) => {
                    if (value.requester == requester){
                        indexToDelete = index
                    }
                })

                if (indexToDelete == undefined){

                    this.pendingResponses.push({
                        requester: req.body.requester,
                        res,
                        resolveResponse: resolve
                    })

                } else {

                    this.pendingResponses[indexToDelete].resolveResponse(undefined)
                    this.pendingResponses[indexToDelete] = {
                        requester: req.body.requester,
                        res,
                        resolveResponse: resolve
                    }

                }

            })
        })

        /**
         * Proxy the load/verify of captcha lib data to idle-api.crabada.com/public
         */
        this.app.get('/proxy/captcha/*', async (req, res) => {

            console.log('req.url', req.url); // '/proxy/captcha/load/?captcha_id=a9cd95e65fc75072dadea93e3d60b0e6&challenge=16471805841662330581e891e709-1e56-4e70-9b6d-996385914a5f&client_type=web&risk_type=icon&lang=pt-br&callback=geetest_1647180585657'

            const url = `${hre.crabada.network.getIdleGameApiBaseUrl()}${req.url.replace('proxy/captcha', 'public')}`
            const headers = {
                'authority': 'idle-api.crabada.com',
                'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="99", "Google Chrome";v="99"',
                'sec-ch-ua-mobile': '?0',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.51 Safari/537.36',
                'sec-ch-ua-platform': '"Windows"',
                'accept': '*/*',
                'sec-fetch-site': 'same-site',
                'sec-fetch-mode': 'no-cors',
                'sec-fetch-dest': 'script',
                'referer': this.hre.crabada.network.getReferer(),
                'accept-language': 'pt-BR,pt;q=0.9,es;q=0.8,en;q=0.7,de;q=0.6,en-US;q=0.5,he;q=0.4',
                // cookie: '_hjSessionUser_2567432=eyJpZCI6IjFmMDRmZmRkLWYxMGMtNThjMi1iMWZjLTM0Zjg5MTFlNWNlNyIsImNyZWF0ZWQiOjE2MzgwMTA1MzY2NjksImV4aXN0aW5nIjp0cnVlfQ==; _ga_0JZ9C3M56S=GS1.1.1644169522.62.0.1644169522.0; amp_fef1e8=4a14c266-5a66-48f2-9614-e6282c8be872R...1ftker5j1.1ftkerd5k.bm.25.dr; _ga=GA1.1.311628077.1638010536; _ga_8LH6CFBN5P=GS1.1.1646881253.330.1.1646881507.0; _ga_J0F5RPFJF1=GS1.1.1647125967.36.1.1647125983.0; _ga_EKEKPKZ4L1=GS1.1.1647167093.7.0.1647167094.0; _ga_C6PTCE6QJM=GS1.1.1647178955.188.1.1647179135.0',
            }

            try {

                DEBUG && console.log('GET', url);

                const response = await axios.get(url,{
                    headers
                })

                res.status(response.status)
                res.send(response.data)

                if (response.status == 200 && req.url.indexOf('/proxy/captcha/verify') >= 0) {

                    const parsedData: CaptchaVerifyResult = JSON.parse(/geetest_[\d]*\((.*)\)/g.exec(response.data)[1])

                    const challenge = req.query.challenge as string

                    await this.registerOrRetryAttack(challenge, parsedData)

                    this.respondStatusPendingChallenge(challenge)

                }


            } catch (error) {

                console.log('ERROR', String(error))

                // if (error.response){
                //     console.log('error.response.status', error.response.status);
                //     console.log('error.response.data', error.response.data);
                //     res.status(error.response.status)
                //     res.json(error.response.data)
                // } else {
                //     throw error
                // }

            }

        })

        interface AttackRequestData {
            requester: string,
            game_id: string,
            user_address: string,
            team_id: string,
            lot_number: string,
            pass_token: string,
            gen_time: string,
            captcha_output: string,
        }

        this.app.post('/captcha/verify/', async (req, res) => {
            const reqData: AttackRequestData = req.body
            console.log('/captcha/verify/')
            console.log(reqData);
            const { requester, game_id, user_address, team_id, lot_number, pass_token, gen_time, captcha_output } = reqData
            if (!this.hasPendingAttack(requester, game_id, team_id)){
                res.json({
                    message: "INVALID REQUESTER, GAMEID, TEAMID."
                })
                res.status(401)
                return
            } else {
                // TODO remove pending attack.
            }

            interface AttackResponseData {
                error_code: string,
                message: string,
                result?: {
                    signature: string,
                    game_id: number,
                    team_id: number,
                    expire_time: number
                }
            }

            try {

                const attackResponse = await this.registerAttack(user_address, team_id, game_id, lot_number, pass_token, gen_time, captcha_output)

                console.log('SUCCESS trying to register attack', requester);
                console.log(attackResponse.data);
                res.status(attackResponse.status)
                res.json(attackResponse.data)

                const { signature, expire_time } = attackResponse.data.result

                this.attackExecutor.addAttackTransactionData({user_address, game_id, team_id, expire_time, signature})

                await this.increaseUserBalance(requester)

            } catch (error) {

                console.error('ERROR trying to register attack', error.response.data);

                res.status(error.response.status)
                res.json(error.response.data)

            }




            // ERROR: {"error_code":"BAD_REQUEST","message":"Captcha validate failed"}
            // OK: {
            //     "error_code": null,
            //     "message": null,
            //     "result": {
            //         "signature": "0x64fe7ab4114e4147afcc78ee640cf092dc91efdbf13b721da89fa39b74d5675f7f9767a0577e339c289d3a1bb707d2b93956fda367b4f6494650d30ca80498b51b",
            //         "game_id": 2109002,
            //         "team_id": 5357,
            //         "expire_time": 1646739603
            //     }
            // }

        })

        this.app.get('/captcha/status/', async (req, res) => {

            console.log('/captcha/status/')

            const challenge = req.query.challenge as string

            const pendingChallenge = this.pendingChallenge[challenge]

            if (!pendingChallenge){
                res.status(404)
                return
            }

            await new Promise(resolve => {

                pendingChallenge.status.res = res
                pendingChallenge.status.resolveStatusResponse = resolve

                this.respondStatusPendingChallenge(challenge)

            })
        })

        this.attackExecutor = new AttackExecutor(hre)
        this.attackExecutor.beginAttackInterval()
        this.app.listen(3000)

    }

    teamsThatPlayToLooseByTeamId: ITeamsThatPlayToLooseByTeamId = {}
    ONLY_ATTACK_TEAMS_THAT_PLAY_TO_LOOSE = true

    hasToSendCaptcha = false
    notSentCaptchaSinceTimestamp: number = undefined

    setIntervalToUpdateAttackStrategy(){
        
        const interval = 5_000
        const tollerance = 60_000
        
        // TODO Should exists a mechanism to clear the interval.
        setInterval(async () => {
            
            const newHasToSendCaptcha = this.hasToContinueReadingNextMineToLoot()

            let changed = false

            if (this.hasToSendCaptcha != newHasToSendCaptcha){
                this.hasToSendCaptcha = newHasToSendCaptcha
                changed = true
            }

            if (changed){
                if (this.hasToSendCaptcha){
                    this.notSentCaptchaSinceTimestamp = +new Date()
                } else {
                    this.notSentCaptchaSinceTimestamp = undefined
                }    
            }

            if (this.notSentCaptchaSinceTimestamp){
                if (((+new Date())-this.notSentCaptchaSinceTimestamp) > tollerance){
                    this.ONLY_ATTACK_TEAMS_THAT_PLAY_TO_LOOSE = false
                    console.log('ONLY_ATTACK_TEAMS_THAT_PLAY_TO_LOOSE changed to', this.ONLY_ATTACK_TEAMS_THAT_PLAY_TO_LOOSE);
                }
            }else{
                this.ONLY_ATTACK_TEAMS_THAT_PLAY_TO_LOOSE = true
                console.log('ONLY_ATTACK_TEAMS_THAT_PLAY_TO_LOOSE changed to', this.ONLY_ATTACK_TEAMS_THAT_PLAY_TO_LOOSE);
            }


        }, interval)

    }

    async initialize(){
        await this.playersManager.initialize()
        if (this.ONLY_ATTACK_TEAMS_THAT_PLAY_TO_LOOSE){
            this.teamsThatPlayToLooseByTeamId = await getTeamsThatPlayToLooseByTeamIdUsingDb(this.hre)
            this.setIntervalToUpdateAttackStrategy()
        }
    }

    async registerOrRetryAttack(challenge: string, captchaVerifyResponse: CaptchaVerifyResult){

        const pendingChallenge = this.pendingChallenge[challenge]
        const { user_address, game_id, team_id, requester } = pendingChallenge

        const { 
            data: { 
                lot_number, 
                seccode: { 
                    captcha_output, pass_token, gen_time 
                } 
            }
        }: CaptchaVerifyResult = captchaVerifyResponse


        try {

            const attackResponse = await this.registerAttack(user_address, team_id, game_id, lot_number, pass_token, gen_time, captcha_output)

            console.log('SUCCESS trying to register attack', requester);
            console.log(attackResponse.data);

            const { signature, expire_time } = attackResponse.data.result

            this.attackExecutor.addAttackTransactionData({ user_address, game_id, team_id, expire_time, signature })

            pendingChallenge.status.successfulAttackRegistration = true

            await this.increaseUserBalance(requester)

        } catch (error) {

            // error.response.data
            // { error_code: 'BAD_REQUEST', message: 'Game doest not exists' }

            // TODO Retry call when error.response.data.message == 'Game doest not exists'

            console.error('ERROR trying to register attack', error.response.data);

            if (error.response.data.message == 'Game doest not exists'){
                await this.registerOrRetryAttack(challenge, captchaVerifyResponse)
            }else{
                pendingChallenge.status.successfulAttackRegistration = false
            }

        }

    }

    gameIdAlreadyProcessed: { [gameId: string]: boolean } = {}

    respondStatusPendingChallenge(challenge: string){

        const pendingChallenge = this.pendingChallenge[challenge]

        this.gameIdAlreadyProcessed[String(pendingChallenge.game_id)] = true

        if (!pendingChallenge)
            return
        
        if (!pendingChallenge.status.res || pendingChallenge.status.successfulAttackRegistration == undefined)
            return

        pendingChallenge.status.res.status(
            pendingChallenge.status.successfulAttackRegistration ? 200 : 400
        )

        const {game_id, requester, team_id, user_address} = pendingChallenge
        pendingChallenge.status.res.json({
            challenge,
            game_id, 
            requester, 
            team_id, 
            user_address,
            successfulAttackRegistration: pendingChallenge.status.successfulAttackRegistration,
        })

        pendingChallenge.status.resolveStatusResponse(undefined)

        // TODO Maybe this should be deleted.
        //delete this.pendingChallenge[challenge]

    }

    async registerAttack(user_address, team_id, game_id, lot_number, pass_token, gen_time, captcha_output){

        const token = this.authServer.getToken(user_address)

        if (!token)
            console.error('Token not found for address', user_address);

        DEBUG && console.log('PUT', `${this.hre.crabada.network.getIdleGameApiBaseUrl()}/public/idle/attack/${game_id}`);

        const attackResponse = await axios.put(`${this.hre.crabada.network.getIdleGameApiBaseUrl()}/public/idle/attack/${game_id}`, {
            user_address, team_id, lot_number, pass_token, gen_time, captcha_output
        }, {
            headers: {
                authority: 'idle-api.crabada.com',
                'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="99", "Google Chrome";v="99"',
                'accept': 'application/json, text/plain, */*',
                'content-type': 'application/json',
                authorization: `Bearer ${token}`,
                'sec-ch-ua-mobile': '?0',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.51 Safari/537.36',
                'sec-ch-ua-platform': '"Windows"',
                origin: this.hre.crabada.network.getOrigin(),
                'sec-fetch-site': 'same-site',
                'sec-fetch-mode': 'cors',
                'sec-fetch-dest': 'empty',
                referer: this.hre.crabada.network.getReferer(),
                'accept-language': 'pt-BR,pt;q=0.9,es;q=0.8,en;q=0.7,de;q=0.6,en-US;q=0.5,he;q=0.4',
            }
        })

        return attackResponse

    }

    hasPendingAttack(requester: string, gameId: string, looterTeamId: string): boolean {
        return (
            this.pendingAttacks[gameId] 
            && (this.pendingAttacks[gameId].includes(looterTeamId))
        )
    }

    addPendingAttack(requester: string, gameId: string, looterTeamId: string){
        this.pendingAttacks[gameId] = this.pendingAttacks[gameId] || []
        this.pendingAttacks[gameId].push(looterTeamId)
    }

    pendingChallenge: PendingTransactionByChallenge = {}

    sendCaptchaDataResponse(p: PlayerTeamPair, t: Target){

        this.notSentCaptchaSinceTimestamp = +new Date()

        const pendingResponse = this.pendingResponses.shift()
        if (!pendingResponse)
            return
        
        this.addPendingAttack(pendingResponse.requester, t.gameId.toString(), p.teamId.toString())

        const challenge = "".concat(t.created_at.toString()).concat(t.gameId.toString()).concat(p.playerAddress.toLowerCase())

        // TODO delete pendingChallenge[challenge] after resolve it.
        this.pendingChallenge[challenge] = {
            user_address: p.playerAddress.toLowerCase(),
            team_id: p.teamId.toString(),
            game_id: t.gameId.toString(),
            requester: pendingResponse.requester,
            status: {}
        }

        const captchaData = {
            user_address: p.playerAddress,
            team_id: p.teamId.toString(),
            game_id: t.gameId.toString(),
            challenge,
            token: this.authServer.getToken(p.playerAddress),
        }

        pendingResponse.res.json(captchaData)
        console.log('Sent captcha data to', pendingResponse.requester, captchaData);
        pendingResponse.resolveResponse(undefined)

    }

    recentAdresses = []

    returnCaptchaData(unlockedPlayerTeamPairsWithEnoughBattlePointSorted: PlayerTeamPair[], targets: Target[]){

        const targetsOrderByGameIdAscending = targets.sort((a, b) => b.gameId < a.gameId ? 1 : b.gameId > a.gameId ? -1 : 0 )

        const playerTeamPairsOrderByNotInRecentAdresses = unlockedPlayerTeamPairsWithEnoughBattlePointSorted.sort((a, b) => {
            const aInRecentAdresses = this.recentAdresses.includes(a.playerAddress)
            const bInRecentAdresses = this.recentAdresses.includes(b.playerAddress)
            return aInRecentAdresses == bInRecentAdresses ? 0 : aInRecentAdresses ? 1 : -1
        })

        const teamIdsAlreadyUsed: number[] = []

        for (const t of targetsOrderByGameIdAscending){

            if (this.ONLY_ATTACK_TEAMS_THAT_PLAY_TO_LOOSE && !this.teamsThatPlayToLooseByTeamId[Number(t.teamId)])
                continue

            if (this.gameIdAlreadyProcessed[String(t.gameId)])
                continue

            for (const p of playerTeamPairsOrderByNotInRecentAdresses){

                if (this.attackExecutor.hasAddressRecentlyAttacked(p.playerAddress))
                    continue

                if (this.attackExecutor.isTeamBusy(p.teamId))
                    continue

                // Do not use same team for different targets.
                if (teamIdsAlreadyUsed.includes(p.teamId))
                    continue

                if (p.battlePoint.gt(t.battlePoint)){

                    this.sendCaptchaDataResponse(p, t);
                    this.recentAdresses.push(p.playerAddress)

                    if (this.recentAdresses.length>1)
                        this.recentAdresses.shift()

                    if (this.pendingResponses.length == 0)
                        return

                    teamIdsAlreadyUsed.push(p.teamId)

                    // Do not use same target for different teams.
                    break

                }

            }
        }

    }

}
