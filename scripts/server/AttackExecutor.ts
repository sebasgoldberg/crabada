import { BigNumber, Contract, ethers } from "ethers"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { getSignerForAddress } from "../../tasks/captcha"
import { getCrabadaContracts } from "../crabada"

interface AttackTransactionData{
    game_id: any,
    user_address: any,
    team_id: any,
    expire_time: any, 
    signature: any,
}

interface AttackTransactionDataByGameId{
    [game_id: string]: AttackTransactionData
}

export class AttackExecutor{

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
            this.teamsThatPerformedAttack.push(Number(team_id))
            delete this.attackTransactionsDataByGameId[game_id]
        } catch (error) {
            console.error('Error trying to attack', String(error));
            if ((+new Date()/1000)>Number(expire_time))
                delete this.attackTransactionsDataByGameId[game_id]
        }

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

    beginAttackInterval(): NodeJS.Timer {

        let attackInExecution = false

        return setInterval(async ()=>{

            if (attackInExecution)
                return

            attackInExecution = true

            const gameIdsToAttack = Object.keys(this.attackTransactionsDataByGameId)

            for (const gameId of gameIdsToAttack){
                const attackTransactionData: AttackTransactionData = this.attackTransactionsDataByGameId[gameId]
                await this.attackTransaction(attackTransactionData)
            }

            attackInExecution = false

        },5_000)

    }

}

