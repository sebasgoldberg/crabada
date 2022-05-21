import { BigNumber, Contract, ethers } from "ethers"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { getSignerForAddress } from "../../tasks/captcha"
import { getCrabadaContracts } from "../crabada"
import { collections } from "../srv/database"

interface AttackTransactionData{
    game_id: string,
    user_address: string,
    team_id: string,
    expire_time: number, 
    signature: string,
}

interface AttackTransactionDataByGameId{
    [game_id: string]: AttackTransactionData
}

interface DbAttackTransactionDataStatus{
    executed?: boolean,
    timeout?: boolean,
}
interface DbAttackTransactionData extends AttackTransactionData, DbAttackTransactionDataStatus{
}

export const dbGetPendingAttackTransactionData = async (): Promise<DbAttackTransactionData[]> => {

    const result = (await collections.attackTransactionsData
        .find({ executed: false, timeout: false })
        .toArray()) as unknown as DbAttackTransactionData[]

    if (result.length>0)
        console.log('dbGetPendingAttackTransactionData', 'result[0]', result[0]);
    
    return result

}

export const dbGetAttackTransactionDataForGameIds = async (gameIds: string[]): Promise<DbAttackTransactionData[]> => {

    console.log('dbGetAttackTransactionDataForGameIds', 'gameIds', gameIds);

    const result = (await collections.attackTransactionsData
        .find({ game_id: { $in: gameIds } })
        .toArray()) as unknown as DbAttackTransactionData[]
    
    return result

}

export const dbAddAttackTransactionData = async (attackTransactionData: AttackTransactionData): Promise<void> => {

    console.log('dbAddAttackTransactionData', 'attackTransactionData', attackTransactionData);

    await collections.attackTransactionsData.updateOne(
        { game_id: attackTransactionData.game_id },
        {
            $set: {
                ...attackTransactionData,
                executed: false, 
                timeout: false,    
            }
        },
        {
            upsert: true
        })
}

export const dbUpdateAttackTransactionData = async (game_id: string, data: DbAttackTransactionDataStatus) => {
    console.log('dbUpdateAttackTransactionData', 'game_id', game_id)
    console.log('dbUpdateAttackTransactionData', 'data', data);

    await collections.attackTransactionsData.updateOne(
        { game_id },
        { $set: data }
    )
}

export class AttackManager{

    hre: HardhatRuntimeEnvironment
    attackTransactionsDataByGameId: AttackTransactionDataByGameId = {}
    idleGame: Contract
    teamsThatPerformedAttack: number[] = []

    constructor(hre: HardhatRuntimeEnvironment){
        this.hre = hre
    }

    isTeamBusy(teamId: number): boolean{

        if (this.teamsThatPerformedAttack.includes(teamId))
            return true

        return this.hasTeamPendingAttack(teamId)

    }

    addAttackTransactionData(attackTransactionData: AttackTransactionData){
        dbAddAttackTransactionData(attackTransactionData)
        this.attackTransactionsDataByGameId[attackTransactionData.game_id] = attackTransactionData
        this.setAddressRecentlyAttacked(attackTransactionData.user_address)
    }

    addressRecentlyAttackedByAdress: {
        [addressInLowerCase: string]: boolean
    } = {}

    hasAddressRecentlyAttacked(address: string){
        return this.addressRecentlyAttackedByAdress[address.toLowerCase()]
    }

    setAddressRecentlyAttacked(address: string){
        this.addressRecentlyAttackedByAdress[address.toLowerCase()] = true
        setTimeout(() => {
            this.addressRecentlyAttackedByAdress[address.toLowerCase()] = false
        }, 60_000)
    }

    hasTeamPendingAttack(teamId: any){
        for (const gameId in this.attackTransactionsDataByGameId){
            const { team_id } = this.attackTransactionsDataByGameId[gameId]
            if (String(team_id) == String(teamId)){
                return true
            }
        }
        return false
    }

    async updateTransactionData(){

        const currentGameIds = Object.keys(this.attackTransactionsDataByGameId)

        if (currentGameIds.length > 0){

            const currentTransactionData = await dbGetAttackTransactionDataForGameIds(
                currentGameIds
            )

            for (const current of currentTransactionData){
                
                if (current.executed){
                    this.teamsThatPerformedAttack.push(Number(current.team_id))
                }
                
                if (current.executed || current.timeout){
                    delete this.attackTransactionsDataByGameId[current.game_id]
                }

            }
        
        }

        const pendingAttackTransactionData = await dbGetPendingAttackTransactionData()

        for (const pending of pendingAttackTransactionData){
            if (this.attackTransactionsDataByGameId[pending.game_id])
                continue
            this.attackTransactionsDataByGameId[pending.game_id] = pending
        }

    }

    async beginUpdateInterval(): Promise<NodeJS.Timer> {

        await this.updateTransactionData()

        let updateInExecution = false

        return setInterval(async ()=>{

            if (updateInExecution)
                return

            updateInExecution = true

            await this.updateTransactionData()

            updateInExecution = false

        }, 5_000)

    }

}

export class AttackExecutor{

    hre: HardhatRuntimeEnvironment

    constructor(hre: HardhatRuntimeEnvironment){
        this.hre = hre
    }

    async attackTransaction({user_address, game_id, team_id, expire_time, signature}: AttackTransactionData){

        const { idleGame } = getCrabadaContracts(this.hre)

        const signers = await this.hre.ethers.getSigners()

        const looterSigner = getSignerForAddress(signers, user_address)

        try {

            console.log('looterSigner', looterSigner.address)
            console.log('idleGame.attack(game_id, team_id, expire_time, signature)', game_id, team_id, expire_time, signature);

            await idleGame.connect(looterSigner).callStatic["attack(uint256,uint256,uint256,bytes)"](
                BigNumber.from(game_id), BigNumber.from(team_id), BigNumber.from(expire_time), signature, 
                this.hre.crabada.network.getAttackOverride()
            )

            const txr: ethers.providers.TransactionResponse = await idleGame.connect(looterSigner)["attack(uint256,uint256,uint256,bytes)"](
                BigNumber.from(game_id), BigNumber.from(team_id), BigNumber.from(expire_time), signature,
                this.hre.crabada.network.getAttackOverride()
            )

            console.log('txr.hash', txr.hash);

            await txr.wait(3)

            await dbUpdateAttackTransactionData(game_id, { executed: true })

        } catch (error) {

            console.error('Error trying to attack', String(error));

            if ((+new Date()/1000)>Number(expire_time))
                await dbUpdateAttackTransactionData(game_id, { timeout: true })

        }

    }

    async attackPendingTransactions(){
        const pendingTransactions = await dbGetPendingAttackTransactionData()
        for (const pending of pendingTransactions){
            await this.attackTransaction(pending)
        }
    }

}

