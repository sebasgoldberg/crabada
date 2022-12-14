import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { BigNumber } from "ethers"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { PlayerTeamPair } from "../../tasks/captcha"
import { currentBlockTimeStamp, getCrabadaContracts, isTeamLocked } from "../crabada"
import { Player } from "../hre"
import { TeamBattlePoints } from "../teambp"

export class PlayersManager{

    playerTeamPairs: PlayerTeamPair[]

    constructor(private hre: HardhatRuntimeEnvironment, private testmode: boolean){

    }

    async initialize(){
       this.playerTeamPairs = await this.initializePlayerTeamPair(this.hre.crabada.network.LOOT_CAPTCHA_CONFIG.players)
       await this.updateLockStatus(console.log)
    }

    async initializePlayerTeamPair(players: Player[]): Promise<PlayerTeamPair[]>{

        const { idleGame } = getCrabadaContracts(this.hre)
    
        const playerTeamPairs: PlayerTeamPair[] = await Promise.all(players
            .map( p => p.teams
                .map( async(teamId) => {
                    const { currentGameId }: { currentGameId: BigNumber } = 
                        await idleGame.getTeamInfo(teamId)
                    return ({
                        playerAddress: p.address,
                        teamId,
                        locked: true,
                        battlePoint: await TeamBattlePoints.createFromTeamIdUsingContractForClassNames(this.hre, teamId),
                        settled: currentGameId.isZero(),
                        hasEnoughLootingPoints: false
                    })
                })
            )
            .flat())
        return playerTeamPairs
    }

    hasLooters(): boolean{
        const lootersTeams = this.hre.crabada.network.LOOT_CAPTCHA_CONFIG.players.map( p => p.teams ).flat()
        return lootersTeams.length > 0
    }

    async updateLockStatus(log: (typeof console.log)){

        const { idleGame } = getCrabadaContracts(this.hre)

        // TODO Restore off chain requests.
    
        const settledByTeamId = {}
        const lockedByTeamId = {}
        const hasEnoughLootingPointsByTeamId = {}
    
        const timestamp = await currentBlockTimeStamp(this.hre)
    
        for (const { address } of this.hre.crabada.network.LOOT_CAPTCHA_CONFIG.players){
            const teams = await this.hre.crabada.api.getCompletedTeams(address)
            for (const team of teams){
                const game_end_time = team.game_type == "stealing" ? team.game_start_time+3600 : team.game_end_time
                lockedByTeamId[String(team.team_id)] = (game_end_time-timestamp >= 0)
                settledByTeamId[String(team.team_id)] = team.game_id ? false : true
                hasEnoughLootingPointsByTeamId[String(team.team_id)] = team.looting_point > 0
            }
        }
    
        this.playerTeamPairs.map( (playerTeamPair) => {
            playerTeamPair.locked = !this.testmode && lockedByTeamId[String(playerTeamPair.teamId)]
            playerTeamPair.settled = this.testmode || settledByTeamId[String(playerTeamPair.teamId)]
            playerTeamPair.hasEnoughLootingPoints = this.testmode || hasEnoughLootingPointsByTeamId[String(playerTeamPair.teamId)]
        })
    
        return
    
    
        return (await Promise.all(
            this.playerTeamPairs.map( async(playerTeamPair): Promise<any> => {
                playerTeamPair.locked = !this.testmode && await isTeamLocked(this.hre, idleGame, playerTeamPair.teamId, log)
                const { currentGameId }: { currentGameId: BigNumber } = 
                    await idleGame.getTeamInfo(playerTeamPair.teamId)
                playerTeamPair.settled = this.testmode || currentGameId.isZero()
    
            }) 
        ))
    
    
        // TODO Restore comented parallel processing
        for (const playerTeamPair of this.playerTeamPairs){
            playerTeamPair.locked = !this.testmode && await isTeamLocked(this.hre, idleGame, playerTeamPair.teamId, log)
            const { currentGameId }: { currentGameId: BigNumber } = 
                await idleGame.getTeamInfo(playerTeamPair.teamId)
            playerTeamPair.settled = this.testmode || currentGameId.isZero()
        }
        // return (await Promise.all(
        //     playerTeamPairs.map( async(playerTeamPair): Promise<any> => {
        //         playerTeamPair.locked = !testmode && await isTeamLocked(hre, idleGame, playerTeamPair.teamId, log)
        //         const { currentGameId }: { currentGameId: BigNumber } = 
        //             await idleGame.getTeamInfo(playerTeamPair.teamId)
        //         playerTeamPair.settled = testmode || currentGameId.isZero()
    
        //     }) 
        // ))
    }

    getSettledPlayers(): PlayerTeamPair[]{
        return this.playerTeamPairs
            .filter( p => (!p.locked && p.settled && p.hasEnoughLootingPoints ) || this.testmode )
    }
    
}