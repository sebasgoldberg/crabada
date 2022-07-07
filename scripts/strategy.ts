import { HardhatRuntimeEnvironment } from "hardhat/types"
import { delay } from "../tasks/crabada"
import { currentServerTimeStamp } from "./crabada"
import { collections, connectToDatabase } from "./srv/database"

export interface IApiMine{
    game_id: number,
    start_time: number,
    end_time: number,
    team_id: number,
    round: number,
    owner: string,
    attack_team_id: number,
    attack_team_owner: number,
    winner_team_id: number,
    created_at: number,
    status: string,
    process: {
        action: string
    }[],
    attack_point: number,
    defense_point: number,
}

export interface ITeamDefenseAnalisys{
    defended: number,
    notDefended: number,
    notAttacked: number
}

export interface ITeamDefenseAnalisysByTeamId{
    [teamId: string]: ITeamDefenseAnalisys,
}

export interface ITeamsThatPlayToLooseByTeamId{
    [teamId: number]: boolean,
}

export const getClosedMinesBetweenPeriodFromDb = async (
    fromTimestamp: number=currentServerTimeStamp()-2*24*60*60,
    toTimestamp: number=currentServerTimeStamp()-30*60-1): Promise<IApiMine[]> => {

    const result = (await collections.mines
        .find({ 'start_time': { $gt: fromTimestamp, $lt: toTimestamp, } })
        .toArray()) as unknown as IApiMine[]
    
    return result

}

export const getTeamsThatPlayToLooseByTeamIdUsingDb = async (hre: HardhatRuntimeEnvironment,
    fromTimestamp: number=currentServerTimeStamp()-2*24*60*60,
    toTimestamp: number=currentServerTimeStamp()-30*60-1): Promise<ITeamsThatPlayToLooseByTeamId> => {

    const teamsAnalisys: ITeamDefenseAnalisysByTeamId = {}

    const mines = await getClosedMinesBetweenPeriodFromDb(fromTimestamp, toTimestamp)

    mines.forEach( mine => {

        const teamAnalisys: ITeamDefenseAnalisys = teamsAnalisys[mine.team_id] || {
            defended: 0,
            notDefended: 0,
            notAttacked: 0
        }

        const actions = mine.process.map(step => step.action)

        if (actions.includes('attack')){

            const reinforceDefenseCount = actions.filter(action => action == 'reinforce-defense').length

            if (reinforceDefenseCount>0)
                teamAnalisys.defended++
            else
                teamAnalisys.notDefended++

        } else {

            teamAnalisys.notAttacked++

        }

        teamsAnalisys[mine.team_id] = teamAnalisys
    
    })

    console.log('Teams that mine', Object.keys(teamsAnalisys).length);

    const result: ITeamsThatPlayToLooseByTeamId = {}

    Object.keys(teamsAnalisys).forEach( teamId => {
        const teamAnalisys = teamsAnalisys[teamId]
        if ( teamAnalisys.defended == 0 && teamAnalisys.notDefended > 0 ){
            result[teamId] = true
        }
    })

    console.log('Teams that mine and play to loose', Object.keys(result).length);

    return result

}